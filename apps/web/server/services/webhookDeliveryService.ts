import crypto from "crypto";
import { Queue, Worker } from "bullmq";
import { eq, and, sql } from "drizzle-orm";
import { getRealtimeClient } from "./redisClients";
import { getDb } from "../db";
import { apiWebhookEndpoints, apiWebhookDeliveries } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_NAME = "webhook-api-delivery";
const MAX_ATTEMPTS = 3;
// Backoff delays for exponential: attempt 2 at +5s, attempt 3 at +25s
const BACKOFF_DELAYS_MS = [0, 5_000, 25_000];

export const KNOWN_EVENT_TYPES = [
  "job.completed",
  "job.failed",
  "job.progress",
  "credits.low",
  "key.expiring",
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

let deliveryQueue: Queue<DeliveryJob> | null = null;
let deliveryWorker: Worker<DeliveryJob> | null = null;

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

    if (endpoint.retryPolicy === "exponential" && attempt < MAX_ATTEMPTS) {
      // Schedule retry via BullMQ
      const delayMs = BACKOFF_DELAYS_MS[attempt] ?? 25_000;
      if (deliveryQueue) {
        await deliveryQueue.add(
          `${endpointId}-${attempt + 1}`,
          { endpointId, eventType, payload, attempt: attempt + 1 },
          { delay: delayMs, removeOnComplete: 500, removeOnFail: 2000 },
        );
      }
    }

    // Auto-disable after 3 consecutive failures (for both retry policies)
    if (newCount >= 3) {
      await db
        .update(apiWebhookEndpoints)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(apiWebhookEndpoints.id, endpointId));
    }

    if (errorMsg) throw new Error(errorMsg);
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

    if (deliveryQueue) {
      await deliveryQueue.add(
        `${ep.id}-1-${Date.now()}`,
        { endpointId: ep.id, eventType, payload, attempt: 1 },
        { removeOnComplete: 500, removeOnFail: 2000 },
      );
    } else {
      // Fallback: fire-and-forget if queue not initialized
      executeWebhookDelivery(ep.id, eventType, payload, 1).catch(() => {});
    }
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
  const redis = getRealtimeClient();

  deliveryQueue = new Queue<DeliveryJob>(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      removeOnComplete: 500,
      removeOnFail: 2000,
    },
  });

  deliveryWorker = new Worker<DeliveryJob>(
    QUEUE_NAME,
    async (job) => {
      const { endpointId, eventType, payload, attempt } = job.data;
      await executeWebhookDelivery(endpointId, eventType, payload, attempt);
    },
    {
      connection: redis.duplicate(),
      concurrency: 10,
    },
  );

  deliveryWorker.on("error", () => {});
}

export async function closeWebhookApiDeliveryQueue(): Promise<void> {
  await deliveryWorker?.close();
  await deliveryQueue?.close();
  deliveryWorker = null;
  deliveryQueue = null;
}
