/**
 * Notification Email Service
 *
 * Sends immediate notification emails (high/critical priority)
 * and batched digest emails. Reuses SMTP infrastructure from emailService.ts.
 */

import { getSmtpConfig, createTransporter } from "./emailService";
import { renderNotification } from "./notificationTemplateService";

const PUBLIC_URL =
  process.env.PUBLIC_URL || "https://smartaihub.app";
const NOTIFICATION_SETTINGS_PATH = "/settings?tab=notifications";

// ─── HTML Escaping ────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

// ─── Priority Badge Colors ───────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, { color: string; label: string }> = {
  high: { color: "#f59e0b", label: "HIGH" },
  critical: { color: "#ef4444", label: "CRITICAL" },
};

// ─── Send Immediate Notification Email ────────────────────────────────────────

export async function sendNotificationEmail(params: {
  userEmail: string;
  userName?: string;
  locale: string;
  notification: {
    id: number;
    type: string;
    title: string;
    content: string;
    priority: string;
    actionUrl?: string;
    actionLabel?: string;
    metadata?: Record<string, unknown>;
  };
}): Promise<boolean> {
  const { userEmail, userName, locale, notification } = params;

  // Only send for high/critical priority
  if (
    notification.priority !== "high" &&
    notification.priority !== "critical"
  ) {
    return false;
  }

  if (!userEmail) return false;

  const transporter = await createTransporter();
  if (!transporter) return false;

  const config = await getSmtpConfig();
  if (!config) return false;

  try {
    const rendered = renderNotification("notification.immediate", {
      title: notification.title,
      content: notification.content,
      locale,
    });

    const badge = PRIORITY_BADGE[notification.priority];
    const actionButton = notification.actionUrl
      ? `<a href="${escapeHtml(PUBLIC_URL + notification.actionUrl)}" style="display:inline-block;padding:10px 20px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:4px;margin:16px 0;">${escapeHtml(notification.actionLabel || "View Details")}</a>`
      : "";

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:16px;">
    <h2 style="margin:0 0 8px 0;">${escapeHtml(rendered.subject)}</h2>
    ${badge ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;color:#fff;background-color:${badge.color};">${badge.label}</span>` : ""}
  </div>
  <div style="line-height:1.6;">
    ${escapeHtml(rendered.body)}
  </div>
  ${actionButton}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
    <p>SmartAIHub — ${escapeHtml(userName || "User")}</p>
    <p><a href="${escapeHtml(PUBLIC_URL + NOTIFICATION_SETTINGS_PATH)}" style="color:#6b7280;">Unsubscribe from notification emails</a></p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: userEmail,
      subject: rendered.subject,
      html,
    });

    console.log("[NotificationEmail] Sent immediate email", {
      userId: "redacted",
      notificationId: notification.id,
      priority: notification.priority,
    });
    return true;
  } catch (err) {
    console.error("[NotificationEmail] Send failed (non-fatal)", {
      notificationId: notification.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ─── Send Notification Digest ─────────────────────────────────────────────────

export async function sendNotificationDigest(params: {
  userEmail: string;
  userName?: string;
  locale: string;
  userId: number;
  notifications: Array<{
    id: number;
    title: string;
    content: string;
    priority: string;
    createdAt: Date;
    actionUrl?: string;
  }>;
}): Promise<boolean> {
  const { userEmail, userName, locale, userId, notifications } = params;

  if (notifications.length === 0) return false;
  if (!userEmail) return false;

  const transporter = await createTransporter();
  if (!transporter) return false;

  const config = await getSmtpConfig();
  if (!config) return false;

  try {
    // Limit to 20 items
    const items = notifications.slice(0, 20);

    const header = renderNotification("digest.header", {
      locale,
      count: items.length,
    });
    const footer = renderNotification("digest.footer", { locale });

    const itemsHtml = items
      .map((n) => {
        const title = truncate(n.title, 100);
        const content = truncate(n.content || "", 200);
        const badge = PRIORITY_BADGE[n.priority];
        const time = n.createdAt.toISOString().replace("T", " ").slice(0, 16);
        return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
          <div style="font-weight:600;">${escapeHtml(title)}${badge ? ` <span style="font-size:11px;padding:1px 4px;border-radius:3px;color:#fff;background-color:${badge.color};">${badge.label}</span>` : ""}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">${escapeHtml(content)}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${time}</div>
        </td>
      </tr>`;
      })
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="margin:0 0 4px 0;">${escapeHtml(header.subject)}</h2>
  <p style="color:#6b7280;margin:0 0 16px 0;">${escapeHtml(header.body)}</p>
  <table style="width:100%;border-collapse:collapse;">
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <div style="margin-top:16px;">
    <a href="${escapeHtml(PUBLIC_URL + "/notifications")}" style="display:inline-block;padding:10px 20px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:4px;">${escapeHtml(footer.body)}</a>
  </div>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
    <p>SmartAIHub — ${escapeHtml(userName || "User")}</p>
    <p><a href="${escapeHtml(PUBLIC_URL + NOTIFICATION_SETTINGS_PATH)}" style="color:#6b7280;">Unsubscribe from notification emails</a></p>
  </div>
</body>
</html>`;

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: userEmail,
      subject: header.subject,
      html,
    });

    console.log("[NotificationEmail] Digest sent", {
      userId,
      notificationCount: items.length,
    });
    return true;
  } catch (err) {
    console.error("[NotificationEmail] Digest send failed (non-fatal)", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
