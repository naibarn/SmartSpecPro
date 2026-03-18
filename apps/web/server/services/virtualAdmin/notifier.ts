import type { IncidentSeverity } from "./types";

export interface GuardianNotification {
  tenantId?: string;
  incidentId: number;
  severity: IncidentSeverity;
  title: string;
  message: string;
  ruleId: string;
  sensorId: string;
  actionTaken?: string;
  requiresApproval?: boolean;
  approvalId?: number;
}

export type GuardianEventType =
  | "incident.created"
  | "incident.updated"
  | "incident.resolved"
  | "approval.requested"
  | "approval.decided"
  | "sensor.alert"
  | "feedback.new";

// Severity -> channel routing
const CHANNEL_ROUTING: Record<IncidentSeverity, string[]> = {
  info: ["in_app"],
  warning: ["in_app", "email_digest"],
  error: ["in_app", "email", "slack"],
  critical: ["in_app", "email", "slack", "telegram"],
};

/**
 * Dispatch a guardian notification to all configured channels.
 */
export async function dispatchNotification(
  notification: GuardianNotification,
): Promise<void> {
  const channels = CHANNEL_ROUTING[notification.severity] ?? ["in_app"];

  // Check per-rule notification cooldown via Redis
  try {
    const { getRedisClient } = await import("../redis");
    const redis = getRedisClient();
    if (redis) {
      const cooldownKey = `guardian:notify-cooldown:${notification.ruleId}:${notification.tenantId ?? "global"}`;
      const exists = await redis.exists(cooldownKey);
      if (exists) {
        // Still publish to SSE for dashboard updates
        await publishSSEEvent("incident.created", notification);
        return;
      }
      // Set cooldown (5 min default)
      await redis.setex(cooldownKey, 300, "1");
    }
  } catch {
    // Continue without cooldown check
  }

  // Dispatch to each channel (non-blocking, best-effort)
  for (const channel of channels) {
    try {
      switch (channel) {
        case "in_app":
          await sendInApp(notification);
          break;
        case "email":
          await sendEmail(notification);
          break;
        case "email_digest":
          await queueEmailDigest(notification);
          break;
        case "slack":
          await sendSlack(notification);
          break;
        case "telegram":
          await sendTelegram(notification);
          break;
      }
    } catch (err) {
      console.error(`[GuardianNotifier] ${channel} delivery failed:`, err);
    }
  }

  // Publish to SSE
  await publishSSEEvent("incident.created", notification);
}

async function sendInApp(n: GuardianNotification): Promise<void> {
  try {
    const { getDb } = await import("../../db");
    const db = await getDb();
    if (!db) return;

    // Find admin users
    const { users } = await import("../../../drizzle/schema");
    const { inArray, sql } = await import("drizzle-orm");
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "domain_admin"]));

    // Create in-app notification for each admin
    const { notifications } = await import("../../../drizzle/schema");
    for (const admin of admins.slice(0, 50)) {
      await db.insert(notifications).values({
        userId: admin.id,
        type: "system",
        title: `[${n.severity.toUpperCase()}] ${n.title}`,
        content: n.message,
        priority: n.severity === "critical" ? "high" : "normal",
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.error("[GuardianNotifier] In-app notification failed:", err);
  }
}

async function sendEmail(n: GuardianNotification): Promise<void> {
  // Rate limit: max 20 emails/hour per tenant
  try {
    const { getRedisClient } = await import("../redis");
    const redis = getRedisClient();
    if (redis) {
      const rateLimitKey = `guardian:email-count:${n.tenantId ?? "global"}`;
      const count = await redis.incr(rateLimitKey);
      if (count === 1) await redis.expire(rateLimitKey, 3600);
      if (count > 20) {
        console.warn("[GuardianNotifier] Email rate limit exceeded");
        return;
      }
    }
  } catch {
    // Continue without rate limiting
  }

  // Email sending is best-effort
  console.log(`[GuardianNotifier] Email: ${n.severity} - ${n.title}`);
}

async function queueEmailDigest(n: GuardianNotification): Promise<void> {
  try {
    const { getRedisClient } = await import("../redis");
    const redis = getRedisClient();
    if (redis) {
      await redis.rpush(
        `guardian:email-digest:${n.tenantId ?? "global"}`,
        JSON.stringify({ title: n.title, message: n.message, severity: n.severity, timestamp: new Date().toISOString() }),
      );
    }
  } catch {
    // Non-critical
  }
}

async function sendSlack(n: GuardianNotification): Promise<void> {
  const webhookUrl = process.env.VIRTUAL_ADMIN_SLACK_WEBHOOK;
  if (!webhookUrl) return;

  const severityEmoji: Record<string, string> = {
    info: ":information_source:",
    warning: ":warning:",
    error: ":x:",
    critical: ":rotating_light:",
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          { type: "header", text: { type: "plain_text", text: `${severityEmoji[n.severity] ?? ""} ${n.title}` } },
          { type: "section", text: { type: "mrkdwn", text: n.message } },
          { type: "context", elements: [{ type: "mrkdwn", text: `Sensor: ${n.sensorId} | Rule: ${n.ruleId}` }] },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[GuardianNotifier] Slack delivery failed:", err);
  }
}

async function sendTelegram(n: GuardianNotification): Promise<void> {
  try {
    const { getDb } = await import("../../db");
    const db = await getDb();
    if (!db) return;

    const { users } = await import("../../../drizzle/schema");
    const { inArray, isNotNull } = await import("drizzle-orm");

    const admins = await db
      .select({ telegramChatId: users.telegramChatId })
      .from(users)
      .where(inArray(users.role, ["admin", "domain_admin"]));

    for (const admin of admins) {
      if (admin.telegramChatId) {
        // Use existing telegram service if available
        try {
          const { enqueueTelegramNotification } = await import("../telegramService");
          await enqueueTelegramNotification(
            admin.telegramChatId,
            `🚨 *${n.severity.toUpperCase()}*\n${n.title}\n${n.message}`,
          );
        } catch {
          // Telegram service not available
        }
      }
    }
  } catch {
    // Non-critical
  }
}

export async function publishSSEEvent(
  type: GuardianEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { getRedisClient } = await import("../redis");
    const redis = getRedisClient();
    if (redis) {
      await redis.publish(
        "guardian:events",
        JSON.stringify({
          type,
          data,
          tenantId: (data as any).tenantId,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  } catch {
    // Non-critical
  }
}
