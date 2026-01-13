/**
 * Webhook and Email Notification Service
 * 
 * Handles sending notifications to external services like Slack, Discord, Teams, and email
 */

import { getDb } from "./db";
import { webhookConfigs, emailConfigs, notificationHistory } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export type NotificationEvent = 
  | "container_stopped"
  | "container_started"
  | "container_restarted"
  | "high_cpu"
  | "high_memory"
  | "container_error";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationPayload {
  event: NotificationEvent;
  title: string;
  message: string;
  severity: NotificationSeverity;
  containerName?: string;
  containerId?: string;
  timestamp: Date;
}

// ============================================
// Webhook Functions
// ============================================

interface WebhookResult {
  configId: number;
  name: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Format payload for different webhook types
 */
function formatWebhookPayload(type: string, payload: NotificationPayload): any {
  const timestamp = payload.timestamp.toISOString();
  
  switch (type) {
    case "slack":
      return {
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: payload.title,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Event:*\n${payload.event}`,
              },
              {
                type: "mrkdwn",
                text: `*Severity:*\n${payload.severity}`,
              },
              ...(payload.containerName ? [{
                type: "mrkdwn",
                text: `*Container:*\n${payload.containerName}`,
              }] : []),
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: payload.message,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Docker Status Dashboard | ${timestamp}`,
              },
            ],
          },
        ],
      };

    case "discord":
      const colorMap: Record<NotificationSeverity, number> = {
        info: 0x3498db,
        warning: 0xf39c12,
        critical: 0xe74c3c,
      };
      
      return {
        embeds: [
          {
            title: payload.title,
            description: payload.message,
            color: colorMap[payload.severity],
            fields: [
              {
                name: "Event",
                value: payload.event,
                inline: true,
              },
              {
                name: "Severity",
                value: payload.severity,
                inline: true,
              },
              ...(payload.containerName ? [{
                name: "Container",
                value: payload.containerName,
                inline: true,
              }] : []),
            ],
            footer: {
              text: "Docker Status Dashboard",
            },
            timestamp,
          },
        ],
      };

    case "teams":
      return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: payload.severity === "critical" ? "FF0000" : 
                    payload.severity === "warning" ? "FFA500" : "0076D7",
        summary: payload.title,
        sections: [
          {
            activityTitle: payload.title,
            facts: [
              { name: "Event", value: payload.event },
              { name: "Severity", value: payload.severity },
              ...(payload.containerName ? [{ name: "Container", value: payload.containerName }] : []),
              { name: "Time", value: timestamp },
            ],
            text: payload.message,
          },
        ],
      };

    default: // generic
      return {
        event: payload.event,
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        containerName: payload.containerName,
        containerId: payload.containerId,
        timestamp,
      };
  }
}

/**
 * Send webhook notification
 */
async function sendWebhook(
  url: string,
  type: string,
  payload: NotificationPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const body = formatWebhookPayload(type, payload);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : await response.text(),
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Send notification to all configured webhooks
 */
export async function sendWebhookNotifications(
  payload: NotificationPayload
): Promise<WebhookResult[]> {
  const db = await getDb();
  if (!db) return [];
  
  const configs = await db.select().from(webhookConfigs).where(eq(webhookConfigs.enabled, true));
  const results: WebhookResult[] = [];

  for (const config of configs) {
    const events: string[] = JSON.parse(config.events || "[]");
    
    // Check if this webhook should receive this event
    if (events.length > 0 && !events.includes(payload.event) && !events.includes("all")) {
      continue;
    }

    const result = await sendWebhook(config.url, config.type, payload);
    results.push({
      configId: config.id,
      name: config.name,
      ...result,
    });
  }

  return results;
}

// ============================================
// Email Functions (using built-in notification)
// ============================================

interface EmailResult {
  configId: number;
  name: string;
  success: boolean;
  error?: string;
}

/**
 * Send email notifications using the built-in notification system
 */
export async function sendEmailNotifications(
  payload: NotificationPayload
): Promise<EmailResult[]> {
  const db = await getDb();
  if (!db) return [];
  
  const configs = await db.select().from(emailConfigs).where(eq(emailConfigs.enabled, true));
  const results: EmailResult[] = [];

  for (const config of configs) {
    const events: string[] = JSON.parse(config.events || "[]");
    
    // Check if this email config should receive this event
    if (events.length > 0 && !events.includes(payload.event) && !events.includes("all")) {
      continue;
    }

    try {
      // Import the notification helper
      const { notifyOwner } = await import("./_core/notification");
      
      const emailContent = `
Event: ${payload.event}
Severity: ${payload.severity}
${payload.containerName ? `Container: ${payload.containerName}` : ""}
Time: ${payload.timestamp.toISOString()}

${payload.message}
      `.trim();

      const success = await notifyOwner({
        title: `[Docker Alert] ${payload.title}`,
        content: emailContent,
      });

      results.push({
        configId: config.id,
        name: config.name,
        success,
        error: success ? undefined : "Failed to send notification",
      });
    } catch (error) {
      results.push({
        configId: config.id,
        name: config.name,
        success: false,
        error: String(error),
      });
    }
  }

  return results;
}

// ============================================
// Main Notification Function
// ============================================

/**
 * Send notification through all configured channels
 */
export async function sendNotification(payload: NotificationPayload): Promise<{
  webhookResults: WebhookResult[];
  emailResults: EmailResult[];
}> {
  const [webhookResults, emailResults] = await Promise.all([
    sendWebhookNotifications(payload),
    sendEmailNotifications(payload),
  ]);

  // Log to notification history
  try {
    const db = await getDb();
    if (db) {
      await db.insert(notificationHistory).values({
        type: payload.event,
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        containerName: payload.containerName,
        containerId: payload.containerId,
        webhookResults: JSON.stringify(webhookResults),
        emailResults: JSON.stringify(emailResults),
      });
    }
  } catch (error) {
    console.error("Failed to log notification:", error);
  }

  return { webhookResults, emailResults };
}

// ============================================
// CRUD Operations for Webhook Configs
// ============================================

export async function getWebhookConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(webhookConfigs);
}

export async function getWebhookConfig(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id));
  return results[0] || null;
}

export async function createWebhookConfig(data: {
  name: string;
  url: string;
  type: "slack" | "discord" | "generic" | "teams";
  enabled?: boolean;
  events?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(webhookConfigs).values({
    name: data.name,
    url: data.url,
    type: data.type,
    enabled: data.enabled ?? true,
    events: JSON.stringify(data.events || ["all"]),
  });
  return result;
}

export async function updateWebhookConfig(id: number, data: Partial<{
  name: string;
  url: string;
  type: "slack" | "discord" | "generic" | "teams";
  enabled: boolean;
  events: string[];
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = { ...data };
  if (data.events) {
    updateData.events = JSON.stringify(data.events);
  }
  return db.update(webhookConfigs).set(updateData).where(eq(webhookConfigs.id, id));
}

export async function deleteWebhookConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(webhookConfigs).where(eq(webhookConfigs.id, id));
}

// ============================================
// CRUD Operations for Email Configs
// ============================================

export async function getEmailConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailConfigs);
}

export async function getEmailConfig(id: number) {
  const db = await getDb();
  if (!db) return null;
  const results = await db.select().from(emailConfigs).where(eq(emailConfigs.id, id));
  return results[0] || null;
}

export async function createEmailConfig(data: {
  name: string;
  smtpHost: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromEmail: string;
  toEmails: string[];
  enabled?: boolean;
  events?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  return db.insert(emailConfigs).values({
    name: data.name,
    smtpHost: data.smtpHost,
    smtpPort: data.smtpPort ?? 587,
    smtpUser: data.smtpUser,
    smtpPass: data.smtpPass,
    fromEmail: data.fromEmail,
    toEmails: JSON.stringify(data.toEmails),
    enabled: data.enabled ?? true,
    events: JSON.stringify(data.events || ["all"]),
  });
}

export async function updateEmailConfig(id: number, data: Partial<{
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  toEmails: string[];
  enabled: boolean;
  events: string[];
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = { ...data };
  if (data.toEmails) {
    updateData.toEmails = JSON.stringify(data.toEmails);
  }
  if (data.events) {
    updateData.events = JSON.stringify(data.events);
  }
  return db.update(emailConfigs).set(updateData).where(eq(emailConfigs.id, id));
}

export async function deleteEmailConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(emailConfigs).where(eq(emailConfigs.id, id));
}

// ============================================
// Notification History
// ============================================

export async function getNotificationHistoryList(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationHistory).orderBy(notificationHistory.createdAt).limit(limit);
}

/**
 * Test webhook connection
 */
export async function testWebhook(url: string, type: string): Promise<{ success: boolean; error?: string }> {
  const testPayload: NotificationPayload = {
    event: "container_started",
    title: "Test Notification",
    message: "This is a test notification from Docker Status Dashboard.",
    severity: "info",
    containerName: "test-container",
    timestamp: new Date(),
  };

  return sendWebhook(url, type, testPayload);
}
