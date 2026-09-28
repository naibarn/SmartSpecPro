import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { getRealtimeClient } from "./redisClients";
import { getDb } from "../db";
import { apiWebhookEndpoints, apiWebhookDeliveries } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { defaultJobExecutorRegistry } from "./jobExecutorRegistry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;
// Backoff delays for exponential: attempt 2 at +5s, attempt 3 at +25s
const BACKOFF_DELAYS_MS = [0, 5_000, 25_000];
const FEATURE_186_WEBHOOK_DELIVERY_JOB_TYPE = "webhook.api_delivery";
const FEATURE_186_CONTRACT_VERSION = "feature-186-v1";

export const KNOWN_EVENT_TYPES = [
  "job.completed",
  "job.failed",
  "job.progress",
  "media.ready",
  "agency.message",
  "credits.low",
  "key.expiring",
  "quota.warning",
] as const;

export type PublicApiEventType = (typeof KNOWN_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Payload sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set([
  "apikey", "api_key", "secret", "token", "password", "authorization",
  "accesstoken", "access_token", "refreshtoken", "refresh_token",
]);

export function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    result[key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// BullMQ queue state
// ---------------------------------------------------------------------------

interface DeliveryJob {
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempt: number;
}

if (!defaultJobExecutorRegistry.has(FEATURE_186_WEBHOOK_DELIVERY_JOB_TYPE, FEATURE_186_CONTRACT_VERSION)) {
  defaultJobExecutorRegistry.register({
    jobType: FEATURE_186_WEBHOOK_DELIVERY_JOB_TYPE,
    executionClass: "short",
    contractVersions: new Set([FEATURE_186_CONTRACT_VERSION]),
    executor: async ({ context }) => {
      const input = context.input as unknown as DeliveryJob;
      await executeWebhookDelivery(input.endpointId, input.eventType, input.payload, context.attempt);
      return { output: { endpointId: input.endpointId, eventType: input.eventType } };
    },
  });
}

// ---------------------------------------------------------------------------
// Core delivery execution
// ---------------------------------------------------------------------------

export async function executeWebhookDelivery(
  endpointId: string,
  eventType: string,
  payload: Record<string, unknown>,
  attempt: number = 1,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(apiWebhookEndpoints)
    .where(eq(apiWebhookEndpoints.id, endpointId));

  const endpoint = rows[0];
  if (!endpoint || !endpoint.isActive) return;

  const secret = decrypt(endpoint.secretEncrypted);
  const safePayload = sanitizePayload(payload);
  const jsonBody = JSON.stringify(safePayload);
  const hmacHex = crypto.createHmac("sha256", secret).update(jsonBody).digest("hex");
  const deliveryId = crypto.randomUUID();

  let statusCode: number | null = null;
  let errorMsg: string | null = null;
  let deliveredAt: Date | null = null;

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SmartSpec-Signature": `sha256=${hmacHex}`,
        "X-SmartSpec-Event": eventType,
        "X-SmartSpec-Delivery-Id": deliveryId,
      },
      body: jsonBody,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    if (res.ok) {
      deliveredAt = new Date();
    } else {
      errorMsg = `HTTP ${res.status}`;
    }
  } catch (err: any) {
    errorMsg = err?.message ?? "Network error";
  }

  // Log delivery
  await db.insert(apiWebhookDeliveries).values({
    webhookEndpointId: endpointId,
    eventType,
    payload: safePayload,
    statusCode,
    attempt,
    deliveredAt,
    error: errorMsg,
  });

  if (deliveredAt) {
    // Success — reset failure count
    await db
      .update(apiWebhookEndpoints)
      .set({ lastDeliveredAt: deliveredAt, failureCount: 0, updatedAt: new Date() })
      .where(eq(apiWebhookEndpoints.id, endpointId));
  } else {
    // Failure — increment failure count
    const updated = await db
      .update(apiWebhookEndpoints)
      .set({
        failureCount: sql`${apiWebhookEndpoints.failureCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(apiWebhookEndpoints.id, endpointId))
      .returning({ failureCount: apiWebhookEndpoints.failureCount });

    const newCount = updated[0]?.failureCount ?? 0;

    if (endpoint.retryPolicy === "exponential" && attempt < MAX_ATTEMPTS && false) {
      // worker_jobs retry policy owns the next attempt and its backoff.
    }

    // Auto-disable after 3 consecutive failures (exponential retry only)
    if (endpoint.retryPolicy === "exponential" && updated.length > 0 && newCount >= 3) {
      await db
        .update(apiWebhookEndpoints)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(apiWebhookEndpoints.id, endpointId));
    }

    if (errorMsg) {
      const error = new Error(errorMsg);
      if (statusCode === null || statusCode === 429 || statusCode >= 500) error.name = "ETIMEDOUT";
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Dispatch fan-out
// ---------------------------------------------------------------------------

export async function dispatchWebhookEvent(
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const endpoints = await db
    .select()
    .from(apiWebhookEndpoints)
    .where(
      and(
        eq(apiWebhookEndpoints.tenantId, tenantId),
        eq(apiWebhookEndpoints.isActive, true),
      ),
    );

  for (const ep of endpoints) {
    // Filter endpoints that subscribed to this event type (in-memory to avoid JSON operator issues)
    if (!ep.events.includes(eventType)) continue;

    const payloadDigest = crypto.createHash("sha256").update(JSON.stringify(sanitizePayload(payload))).digest("hex");
    await createControlPlaneJob({
        context: {
          tenantId,
          actorType: "system",
          authorizationScope: "system:webhook-api-delivery",
          correlationId: `webhook-api:${ep.id}:${eventType}:${payloadDigest}`,
          idempotencyKey: `webhook-api:${ep.id}:${eventType}:${payloadDigest}`,
        },
        definition: {
          contractVersion: FEATURE_186_CONTRACT_VERSION,
          jobType: FEATURE_186_WEBHOOK_DELIVERY_JOB_TYPE,
          executionClass: "short",
          input: { endpointId: ep.id, eventType, payload: sanitizePayload(payload), attempt: 1 },
          retryPolicy: {
            maxAttempts: MAX_ATTEMPTS,
            baseDelayMs: 5_000,
            maxDelayMs: 25_000,
            jitter: "none",
            deadlineMs: 15 * 60_000,
            allowedErrorClasses: ["retryable", "ETIMEDOUT", "TimeoutError", "AbortError"],
          },
          timeoutPolicy: { softTimeoutMs: 10_000, hardTimeoutMs: 60_000 },
        },
    });
  }
}

// ---------------------------------------------------------------------------
// Unified public API event emitter (webhooks + SSE)
// ---------------------------------------------------------------------------

export async function emitPublicApiEvent(
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const safePayload = sanitizePayload(payload);

  // 1. Fan out to registered webhook endpoints
  dispatchWebhookEvent(tenantId, eventType, safePayload).catch(() => {});

  // 2. Publish to Redis for SSE consumers
  try {
    const redis = getRealtimeClient();
    await redis.publish(`events:${tenantId}`, JSON.stringify({ type: eventType, ...safePayload }));
  } catch {
    // Non-fatal — SSE is best-effort
  }
}

// ---------------------------------------------------------------------------
// Queue lifecycle
// ---------------------------------------------------------------------------

export async function initWebhookApiDeliveryQueue(): Promise<void> {
  console.info("[Feature186] API webhook delivery is executed by worker_jobs");
}

export async function closeWebhookApiDeliveryQueue(): Promise<void> {
  // No queue lifecycle is owned by the web process.
}
