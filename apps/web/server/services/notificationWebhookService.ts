/**
 * Notification Webhook Delivery Service
 *
 * Handles SSRF-safe webhook delivery with HMAC-SHA256 signing,
 * BullMQ-based retry logic, and automatic disable after consecutive failures.
 */

import crypto from "node:crypto";
import dns from "node:dns/promises";
import { Queue, Worker } from "bullmq";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { notificationWebhooks } from "../../drizzle/schema";
import { encrypt, decrypt } from "./crypto";

// ─── Types ───

export interface WebhookPayload {
  event: "notification.created" | "webhook.test";
  timestamp: string;
  notification: {
    id: number;
    type: string;
    title: string;
    content: string | null;
    priority: string;
    relatedResourceType: string | null;
    relatedResourceId: string | null;
    actionUrl: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  };
}

// ─── Priority Order ───

const PRIORITY_ORDER: Record<string, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

// ─── SSRF Prevention ───

/**
 * Check if an IP address belongs to a private/reserved range.
 */
export function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return true;

  const [a, b] = parts;

  // 0.0.0.0/8 (unspecified)
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  return false;
}

/**
 * Validate a webhook URL for SSRF safety.
 * Enforces HTTPS and checks resolved IPs against private ranges.
 */
export async function validateWebhookUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed for webhooks");
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new Error("URL must have a hostname");
  }

  let ips: string[];
  try {
    ips = await dns.resolve4(hostname);
  } catch {
    throw new Error(`DNS resolution failed for ${hostname}`);
  }

  if (ips.length === 0) {
    throw new Error(`DNS resolution returned no addresses for ${hostname}`);
  }

  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new Error(
        `URL resolves to private/reserved IP address (${ip}). Webhook URLs must resolve to public IP addresses.`
      );
    }
  }
}

// ─── HMAC Signing ───

/**
 * Compute HMAC-SHA256 signature over a JSON body string.
 */
export function computeSignature(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ─── BullMQ Queue ───

let webhookQueue: Queue | null = null;
let webhookWorker: Worker | null = null;

async function getWebhookQueue(): Promise<Queue> {
  if (!webhookQueue) {
    const { getRealtimeClient } = await import("./redisClients");
    const redis = getRealtimeClient();
    webhookQueue = new Queue("webhook-delivery", {
      connection: redis.duplicate(),
    });
  }
  return webhookQueue;
}

/**
 * Enqueue a webhook delivery job. Fire-and-forget: errors are logged but not thrown.
 */
export async function enqueueWebhookDelivery(
  webhookId: number,
  payload: WebhookPayload
): Promise<void> {
  try {
    const queue = await getWebhookQueue();
    await queue.add(
      "webhook-deliver",
      { webhookId, payload },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      }
    );
  } catch (err) {
    console.error("[WebhookService] enqueue_failed", {
      webhookId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

// ─── Webhook Delivery ───

/**
 * Deliver a notification payload to a webhook endpoint.
 * Performs SSRF check at delivery time (DNS rebind protection).
 */
export async function deliverWebhook(
  webhookId: number,
  payload: WebhookPayload
): Promise<void> {
  const db = getDb();
  const startMs = Date.now();

  // 1. Load webhook
  const rows = await db
    .select()
    .from(notificationWebhooks)
    .where(eq(notificationWebhooks.id, webhookId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Webhook ${webhookId} not found`);
  }

  const webhook = rows[0];

  // 2. SSRF check at delivery time (DNS rebind protection)
  await validateWebhookUrl(webhook.url);

  // 3. Decrypt signing secret
  const secret = decrypt(webhook.secretEncrypted);
  if (!secret) {
    throw new Error(`Failed to decrypt secret for webhook ${webhookId}`);
  }

  // 4. Serialize and sign
  const body = JSON.stringify(payload);
  const signature = computeSignature(body, secret);

  // 5. POST with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-256": `sha256=${signature}`,
        "User-Agent": "SmartSpecPro-Webhook/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - startMs;

    if (response.ok) {
      // Success: reset failure count, update lastDeliveredAt
      await db
        .update(notificationWebhooks)
        .set({
          failureCount: 0,
          lastDeliveredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(notificationWebhooks.id, webhookId));

      console.log("[WebhookService] webhook_delivered", {
        webhookId,
        notificationId: payload.notification.id,
        statusCode: response.status,
        durationMs,
      });
    } else {
      // Failure: increment failure count
      const newFailureCount = (webhook.failureCount ?? 0) + 1;
      const updates: Record<string, any> = {
        failureCount: newFailureCount,
        updatedAt: new Date(),
      };

      if (newFailureCount >= 3) {
        updates.isEnabled = false;
      }

      await db
        .update(notificationWebhooks)
        .set(updates)
        .where(eq(notificationWebhooks.id, webhookId));

      console.warn("[WebhookService] webhook_delivery_failed", {
        webhookId,
        notificationId: payload.notification.id,
        statusCode: response.status,
        failureCount: newFailureCount,
        durationMs,
      });

      // Auto-disable notification
      if (newFailureCount >= 3) {
        console.error("[WebhookService] webhook_auto_disabled", {
          webhookId,
          tenantId: webhook.tenantId,
          failureCount: newFailureCount,
        });

        // Create admin notification about auto-disable
        try {
          const { createNotification } = await import(
            "./notificationService"
          );
          // Find an admin user for this tenant
          const { users } = await import("../../drizzle/schema");
          const admins = await db
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.tenantId, webhook.tenantId),
                eq(users.role, "admin")
              )
            )
            .limit(1);

          if (admins.length > 0) {
            await createNotification({
              db,
              userId: admins[0].id,
              type: "alert",
              title: `Webhook "${webhook.name}" auto-disabled`,
              content: `Webhook has been disabled after ${newFailureCount} consecutive delivery failures. Please check the webhook URL and re-enable in settings.`,
              priority: "high",
              relatedResourceType: "system_health",
              relatedResourceId: String(webhookId),
              actionUrl: "/settings/notifications",
              actionLabel: "Manage Webhooks",
              groupKey: `webhook_disabled_${webhookId}`,
            });
          }
        } catch (alertErr) {
          console.error(
            "[WebhookService] admin_alert_failed",
            alertErr instanceof Error ? alertErr.message : alertErr
          );
        }
      }

      throw new Error(
        `Webhook delivery failed with status ${response.status}`
      );
    }
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      // Timeout: increment failure count
      const newFailureCount = (webhook.failureCount ?? 0) + 1;
      await db
        .update(notificationWebhooks)
        .set({
          failureCount: newFailureCount,
          updatedAt: new Date(),
          ...(newFailureCount >= 3 ? { isEnabled: false } : {}),
        })
        .where(eq(notificationWebhooks.id, webhookId));

      throw new Error("Webhook delivery timed out (10s)");
    }
    throw err;
  }
}

// ─── Webhook Matching ───

/**
 * Find webhooks that match a notification's tenant, user, category, and priority.
 */
export async function findMatchingWebhooks(
  tenantId: string,
  userId: number,
  category: string,
  priority: string
): Promise<any[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(notificationWebhooks)
    .where(
      and(
        eq(notificationWebhooks.tenantId, tenantId),
        eq(notificationWebhooks.isEnabled, true),
        or(
          isNull(notificationWebhooks.userId),
          eq(notificationWebhooks.userId, userId)
        )
      )
    );

  // Filter in-memory by categories and minSeverity
  return rows.filter((hook) => {
    // Category filter
    if (hook.categories) {
      const cats = hook.categories as string[];
      if (!cats.includes(category)) return false;
    }

    // Severity filter
    if (hook.minSeverity) {
      const notifLevel = PRIORITY_ORDER[priority] ?? 1;
      const minLevel = PRIORITY_ORDER[hook.minSeverity] ?? 0;
      if (notifLevel < minLevel) return false;
    }

    return true;
  });
}

// ─── Worker Initialization ───

export async function initWebhookDeliveryWorker(): Promise<void> {
  if (webhookWorker) return;

  const { getRealtimeClient } = await import("../services/redisClients");
  const redis = getRealtimeClient();

  webhookWorker = new Worker(
    "webhook-delivery",
    async (job) => {
      const { webhookId, payload } = job.data;
      await deliverWebhook(webhookId, payload);
    },
    {
      connection: redis.duplicate(),
      concurrency: 5,
    }
  );

  webhookWorker.on("failed", (job, err) => {
    console.warn("[WebhookService] worker_job_failed", {
      jobId: job?.id,
      webhookId: job?.data?.webhookId,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });
}

export async function shutdownWebhookDeliveryWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
  }
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }
}
