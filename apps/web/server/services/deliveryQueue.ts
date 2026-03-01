/**
 * Delivery Queue — BullMQ-based reliable outbound Telegram message delivery.
 *
 * Provides retry logic, rate limiting, dead-letter handling, and delivery
 * status tracking via channel_messages table.
 */

import { Queue, Worker, UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { eq, and } from "drizzle-orm";
import type { DeliveryJob } from "@shared/channelTypes";
import { getRealtimeClient } from "./redisClients";
import { decrypt } from "./crypto";
import { getDb } from "../db";
import { channelMessages, conversationChannels, systemSettings } from "../../drizzle/schema";
import { adapterRegistry } from "./channelAdapters/registry";

// ── Constants ────────────────────────────────────────────────────────────

const QUEUE_NAME = "channel-delivery";
const DLQ_NAME = "channel-delivery-dlq";
const MAX_ATTEMPTS = 5;

// ── Module state ─────────────────────────────────────────────────────────

let deliveryQueue: Queue<DeliveryJob> | null = null;
let dlq: Queue<DeliveryJob> | null = null;
let deliveryWorker: Worker<DeliveryJob> | null = null;

// Cache bot token to avoid re-reading settings on every job (Telegram backward compat)
let cachedBotToken: string | null = null;
let botTokenCacheExpiry = 0;
const BOT_TOKEN_CACHE_TTL = 60_000; // 1 minute

// ── Bot token resolution (Telegram backward compat) ──────────────────────

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

// ── Channel config resolution ────────────────────────────────────────────

async function resolveChannelConfig(
  channelType: string,
  tenantId: string,
): Promise<Record<string, unknown> | null> {
  // Telegram: backward compat via system_settings
  if (channelType === "telegram") {
    const botToken = await resolveBotToken();
    return botToken ? { botToken } : null;
  }

  // Generic channels: lookup from channel_credentials table
  // (channel_credentials table created by section-01)
  // IMPORTANT: must filter by tenantId to prevent cross-tenant credential leakage
  const db = await getDb();
  if (!db) return null;

  try {
    const { channelCredentials } = await import("../../drizzle/schema");
    const [cred] = await db
      .select()
      .from(channelCredentials)
      .where(
        and(
          eq(channelCredentials.channelType, channelType),
          eq(channelCredentials.tenantId, tenantId),
          eq(channelCredentials.isActive, true),
        ),
      )
      .limit(1);

    if (!cred) return null;
    return JSON.parse(decrypt(cred.credentialsEncrypted));
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
  const { channelMessageId, chatId, text, parseMode, tenantId } = job.data;
  const channelType = job.data.channelType ?? "telegram"; // backward compat

  // Resolve adapter
  const adapter = adapterRegistry.get(channelType);
  if (!adapter) {
    throw new UnrecoverableError(`No adapter for channel type: ${channelType}`);
  }

  // Resolve channel credentials
  const config = await resolveChannelConfig(channelType, tenantId);
  if (!config) {
    throw new UnrecoverableError(`Channel credentials not available for: ${channelType}`);
  }

  const db = await getDb();

  // Pre-delivery validation: check message record still exists
  if (db) {
    const [msgRecord] = await db
      .select({
        id: channelMessages.id,
        deliveryStatus: channelMessages.deliveryStatus,
        conversationChannelId: channelMessages.conversationChannelId,
      })
      .from(channelMessages)
      .where(eq(channelMessages.id, channelMessageId))
      .limit(1);

    if (!msgRecord) {
      throw new UnrecoverableError("Channel message record not found (deleted)");
    }
    if (msgRecord.deliveryStatus === "sent") {
      return; // Already delivered — idempotent skip
    }

    // Check that the channel binding is still active
    if (msgRecord.conversationChannelId) {
      const [channel] = await db
        .select({ state: conversationChannels.state })
        .from(conversationChannels)
        .where(eq(conversationChannels.id, msgRecord.conversationChannelId))
        .limit(1);
      if (channel && channel.state !== "active") {
        await db
          .update(channelMessages)
          .set({ deliveryStatus: "failed", failureCode: "connection_revoked" })
          .where(eq(channelMessages.id, channelMessageId));
        throw new UnrecoverableError("Connection revoked — delivery cancelled");
      }
    }
  }

  try {
    const result = await adapter.sendMessage(config, chatId, text, { parseMode });
    const externalMessageId = result.externalMessageId ?? null;

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

  // Idempotency: skip if message already sent
  try {
    const dbConn = await getDb();
    if (dbConn) {
      const [existing] = await dbConn
        .select({ deliveryStatus: channelMessages.deliveryStatus })
        .from(channelMessages)
        .where(eq(channelMessages.id, job.channelMessageId))
        .limit(1);
      if (existing?.deliveryStatus === "sent") {
        return; // Already delivered
      }
    }
  } catch {
    // Non-critical — proceed with enqueue
  }

  await deliveryQueue.add("deliver", job, {
    jobId: `ch-deliver-${job.channelMessageId}`,
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

// ── Cache management ────────────────────────────────────────────────────

export function clearDeliveryBotTokenCache(): void {
  cachedBotToken = null;
  botTokenCacheExpiry = 0;
}

// ── Exports for testing ──────────────────────────────────────────────────

export { processDeliveryJob as _processDeliveryJob };
export { isPermanentError as _isPermanentError };
