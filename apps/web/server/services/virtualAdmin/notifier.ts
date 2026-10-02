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
  // The old email_digest Redis list had no consumer. Keep the durable in-app
  // notification as the working warning channel until a real mail delivery
  // executor is configured.
  warning: ["in_app"],
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

  // Check per-rule notification cooldown in the shared PostgreSQL store.
  try {
    const { claimTtlDedupeKey } = await import("../postgresRateLimitStore");
    const isFirstDuringCooldown = await claimTtlDedupeKey(
      "guardian-notify-cooldown",
      `${notification.tenantId ?? "global"}:${notification.ruleId}`,
      300,
    );
    if (!isFirstDuringCooldown) {
      // The incident row is already durable and is independently polled by
      // the Guardian SSE endpoint; avoid duplicating channel notifications.
      return;
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

  // Guardian SSE polls the durable incident/approval rows in PostgreSQL.
}

async function sendInApp(n: GuardianNotification): Promise<void> {
  try {
    const { getDb } = await import("../../db");
    const db = await getDb();
    if (!db) return;

    // Find admin users
    const { users } = await import("../../../drizzle/schema");
    const { and, inArray, sql } = await import("drizzle-orm");
    const adminConditions = [inArray(users.role, ["admin", "domain_admin"] as any)];
    if (n.tenantId) {
      adminConditions.push(sql`${users.currentTenantId}::text = ${n.tenantId}`);
    }
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...adminConditions));

    // Create in-app notification for each admin
    const { userNotifications } = await import("../../../drizzle/schema");
    for (const admin of admins.slice(0, 50)) {
      await db.insert(userNotifications).values({
        userId: admin.id,
        type: "system",
        title: `[${n.severity.toUpperCase()}] ${n.title}`,
        content: n.message,
        priority: n.severity === "critical" ? "high" : "normal",
        relatedResourceType: "incident",
        relatedResourceId: String(n.incidentId),
        actionUrl: `/admin/system-guardian?incident=${n.incidentId}`,
        actionLabel: "Open Incident",
        metadata: {
          source: "guardian.notifier",
          eventId: String(n.incidentId),
          relatedItems: {
            ruleId: n.ruleId,
            sensorId: n.sensorId,
          },
        },
      }).onConflictDoNothing();
    }
  } catch (err) {
    console.error("[GuardianNotifier] In-app notification failed:", err);
  }
}

async function sendEmail(n: GuardianNotification): Promise<void> {
  // Rate limit: max 20 emails in a sliding hour per tenant.
  try {
    const { consumeSlidingWindow } = await import("../postgresRateLimitStore");
    const decision = await consumeSlidingWindow(
      "guardian-email",
      n.tenantId ?? "global",
      20,
      3600,
    );
    if (!decision.allowed) {
      console.warn("[GuardianNotifier] Email rate limit exceeded");
      return;
    }
  } catch {
    // Continue without rate limiting
  }

  // Email sending is best-effort
  console.log(`[GuardianNotifier] Email: ${n.severity} - ${n.title}`);
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
      .select({ id: users.id, telegramChatId: users.telegramChatId })
      .from(users)
      .where(inArray(users.role, ["admin", "domain_admin"]));

    for (const admin of admins) {
      if (admin.telegramChatId) {
        // Use existing telegram service if available
        try {
          const { enqueueTelegramNotification } = await import("../telegramService");
          await enqueueTelegramNotification(db, admin.id, {
            notificationId: 0,
            title: n.title,
            content: n.message,
            priority: n.severity,
            createdAt: new Date(),
          });
        } catch {
          // Telegram service not available
        }
      }
    }
  } catch {
    // Non-critical
  }
}

/** @deprecated Guardian SSE now polls durable incident and approval rows. */
export async function publishSSEEvent(
  type: GuardianEventType,
  data: Record<string, unknown>,
): Promise<void> {
  // Deprecated transport hook retained for existing callers. Guardian events
  // are now derived from the PostgreSQL incident and approval records by the
  // SSE route; event-only types without a durable source are not published.
  void type;
  void data;
}
