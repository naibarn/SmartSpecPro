/**
 * Reliable outbound channel message delivery through worker_jobs.
 *
 * Provides retry logic, rate limiting, dead-letter handling, and delivery
 * status tracking via channel_messages table.
 */

import { eq, and } from "drizzle-orm";
import type { DeliveryJob } from "@shared/channelTypes";
import { decrypt } from "./crypto";
import { getDb } from "../db";
import { channelMessages, conversationChannels, systemSettings } from "../../drizzle/schema";
import { adapterRegistry } from "./channelAdapters/registry";
import { createControlPlaneJob } from "./jobControlPlaneGateway";

// ── Constants ────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;

// ── Module state ─────────────────────────────────────────────────────────

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

export async function processDeliveryJob(job: { data: DeliveryJob; attemptsMade?: number }): Promise<void> {
  const { channelMessageId, chatId, text, parseMode, tenantId } = job.data;
  const channelType = job.data.channelType ?? "telegram"; // backward compat

  // Resolve adapter
  const adapter = adapterRegistry.get(channelType);
  if (!adapter) {
    throw new Error(`CHANNEL_DELIVERY_PERMANENT:NO_ADAPTER:${channelType}`);
  }

  // Resolve channel credentials
  const config = await resolveChannelConfig(channelType, tenantId);
  if (!config) {
    throw new Error(`CHANNEL_DELIVERY_PERMANENT:CREDENTIALS_UNAVAILABLE:${channelType}`);
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
      throw new Error("CHANNEL_DELIVERY_PERMANENT:MESSAGE_RECORD_NOT_FOUND");
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
        throw new Error("CHANNEL_DELIVERY_PERMANENT:CONNECTION_REVOKED");
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
          attemptCount: (job.attemptsMade ?? 0) + 1,
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
            attemptCount: (job.attemptsMade ?? 0) + 1,
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
      throw new Error(`CHANNEL_DELIVERY_PERMANENT:${err.message}`);
    }

    // Transient errors are classified and retried by worker_jobs.
    throw err;
  }
}

// ── Initialization ───────────────────────────────────────────────────────

export async function initDeliveryQueue(): Promise<void> {
  console.info("[DeliveryQueue] execution is owned by worker_jobs");
}

// ── Enqueue ──────────────────────────────────────────────────────────────

export async function enqueueDelivery(job: DeliveryJob): Promise<void> {
  await createControlPlaneJob({
      context: {
        tenantId: job.tenantId,
        actorType: "system",
        authorizationScope: "channel:delivery",
        correlationId: `channel-delivery:${job.channelMessageId}`,
        idempotencyKey: `channel-delivery:${job.tenantId}:${job.channelMessageId}`,
      },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "channel.delivery",
        executionClass: "short",
        input: job as unknown as Record<string, unknown>,
        retryPolicy: { maxAttempts: MAX_ATTEMPTS, baseDelayMs: 1000, maxDelayMs: 60000, jitter: "bounded", deadlineMs: 3600000, allowedErrorClasses: ["retryable", "timeout", "unavailable"] },
        timeoutPolicy: { softTimeoutMs: 30000, hardTimeoutMs: 120000 },
      },
  });
}

// ── Shutdown ─────────────────────────────────────────────────────────────

export async function closeDeliveryQueue(): Promise<void> {
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
