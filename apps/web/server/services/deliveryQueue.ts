/**
 * Delivery Queue — BullMQ-based reliable outbound Telegram message delivery.
 *
 * Provides retry logic, rate limiting, dead-letter handling, and delivery
 * status tracking via channel_messages table.
 */

import { Queue, Worker, UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { DeliveryJob } from "@shared/channelTypes";
import { getRealtimeClient } from "./redisClients";
import { sendTelegramMessage } from "./telegramService";
import { decrypt } from "./crypto";
import { getDb } from "../db";
import { channelMessages, systemSettings } from "../../drizzle/schema";

// ── Constants ────────────────────────────────────────────────────────────

const QUEUE_NAME = "telegram-delivery";
const DLQ_NAME = "telegram-delivery-dlq";
const MAX_ATTEMPTS = 5;

// ── Module state ─────────────────────────────────────────────────────────

let deliveryQueue: Queue<DeliveryJob> | null = null;
let dlq: Queue<DeliveryJob> | null = null;
let deliveryWorker: Worker<DeliveryJob> | null = null;

// Cache bot token to avoid re-reading settings on every job
let cachedBotToken: string | null = null;
let botTokenCacheExpiry = 0;
const BOT_TOKEN_CACHE_TTL = 60_000; // 1 minute

// ── Bot token resolution ─────────────────────────────────────────────────

async function resolveBotToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedBotToken && now < botTokenCacheExpiry) {
    return cachedBotToken;
  }

  const db = await getDb();
  if (!db) return null;

  const settings = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, "telegram"));

  const settingsMap = new Map(
    settings.map((s: any) => [s.key, s.value]),
  );

  const enabled = settingsMap.get("enabled");
  if (enabled !== "true") return null;

  const botTokenEncrypted = settingsMap.get("bot_token");
  if (!botTokenEncrypted) return null;

  try {
    cachedBotToken = decrypt(botTokenEncrypted);
    botTokenCacheExpiry = now + BOT_TOKEN_CACHE_TTL;
    return cachedBotToken;
  } catch {
    return null;
  }
}

// ── Permanent error detection ────────────────────────────────────────────

const PERMANENT_ERROR_PATTERNS = [
  "bot was blocked by the user",
  "chat not found",
  "forbidden",
  "user is deactivated",
  "bot was kicked",
  "not enough rights",
];

function isPermanentError(err: any): boolean {
  if (err?.statusCode === 403) return true;
  if (err?.blocked) return true;

  const msg = (err?.message || "").toLowerCase();
  return PERMANENT_ERROR_PATTERNS.some((p) => msg.includes(p));
}

// ── Worker processor ─────────────────────────────────────────────────────

async function processDeliveryJob(job: Job<DeliveryJob>): Promise<void> {
  const { channelMessageId, chatId, text, parseMode } = job.data;

  const botToken = await resolveBotToken();
  if (!botToken) {
    throw new UnrecoverableError("Bot token not available");
  }

  const db = await getDb();

  try {
    const result = await sendTelegramMessage(botToken, chatId, text, parseMode);
    const externalMessageId =
      result && typeof result === "object" && "messageId" in result
        ? String((result as any).messageId)
        : null;

    // Success: update channel_messages
    if (db) {
      await db
        .update(channelMessages)
        .set({
          deliveryStatus: "sent",
          deliveredAt: new Date(),
          attemptCount: job.attemptsMade + 1,
          lastAttemptAt: new Date(),
          ...(externalMessageId ? { externalMessageId } : {}),
        })
        .where(eq(channelMessages.id, channelMessageId));
    }
  } catch (err: any) {
    // Update attempt tracking
    if (db) {
      try {
        await db
          .update(channelMessages)
          .set({
            attemptCount: job.attemptsMade + 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(channelMessages.id, channelMessageId));
      } catch {
        // Non-critical — don't mask the delivery error
      }
    }

    // Classify error
    if (isPermanentError(err)) {
      // Mark as permanently failed before throwing
      if (db) {
        try {
          await db
            .update(channelMessages)
            .set({
              deliveryStatus: "failed",
              failureCode: err.statusCode ? `http_${err.statusCode}` : "permanent",
              failureReason: err.message,
            })
            .where(eq(channelMessages.id, channelMessageId));
        } catch {
          // Non-critical
        }
      }
      throw new UnrecoverableError(err.message);
    }

    // Transient error — re-throw for BullMQ retry
    throw err;
  }
}

// ── Initialization ───────────────────────────────────────────────────────

export async function initDeliveryQueue(): Promise<void> {
  const redis = getRealtimeClient();

  deliveryQueue = new Queue<DeliveryJob>(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });

  dlq = new Queue<DeliveryJob>(DLQ_NAME, {
    connection: redis.duplicate(),
  });

  deliveryWorker = new Worker<DeliveryJob>(
    QUEUE_NAME,
    processDeliveryJob,
    {
      connection: redis.duplicate(),
      concurrency: 10,
      limiter: { max: 25, duration: 1000 },
    },
  );

  // DLQ handler: when all retries exhausted
  deliveryWorker.on("failed", async (job, err) => {
    if (!job) return;

    const maxAttempts = job.opts?.attempts ?? MAX_ATTEMPTS;
    const isExhausted = job.attemptsMade >= maxAttempts;
    const isUnrecoverable = err instanceof UnrecoverableError;

    if (!isExhausted && !isUnrecoverable) return;

    // Move to DLQ
    try {
      await dlq?.add("dead-letter", job.data, {
        removeOnComplete: 5000,
      });
    } catch {
      console.error("[DeliveryQueue] Failed to add to DLQ:", job.id);
    }

    // Update status if not already marked failed
    if (isExhausted && !isUnrecoverable) {
      const db = await getDb();
      if (db) {
        try {
          await db
            .update(channelMessages)
            .set({
              deliveryStatus: "failed",
              failureCode: "max_retries_exhausted",
              failureReason: err.message,
            })
            .where(eq(channelMessages.id, job.data.channelMessageId));
        } catch {
          // Non-critical
        }
      }
    }
  });

  console.log("[DeliveryQueue] Initialized with concurrency=10, rate=25/s");
}

// ── Enqueue ──────────────────────────────────────────────────────────────

export async function enqueueDelivery(job: DeliveryJob): Promise<void> {
  if (!deliveryQueue) {
    console.warn("[DeliveryQueue] Queue not initialized, skipping delivery");
    return;
  }
  await deliveryQueue.add("deliver", job, {
    jobId: `tg-deliver-${job.channelMessageId}`,
  });
}

// ── Shutdown ─────────────────────────────────────────────────────────────

export async function closeDeliveryQueue(): Promise<void> {
  if (deliveryWorker) {
    await deliveryWorker.close();
    deliveryWorker = null;
  }
  if (deliveryQueue) {
    await deliveryQueue.close();
    deliveryQueue = null;
  }
  if (dlq) {
    await dlq.close();
    dlq = null;
  }
  cachedBotToken = null;
  console.log("[DeliveryQueue] Shut down");
}

// ── Exports for testing ──────────────────────────────────────────────────

export { processDeliveryJob as _processDeliveryJob };
export { isPermanentError as _isPermanentError };
