/**
 * Webhook & Email Notifications
 * 
 * Provides functionality to send alerts via webhooks (Slack, Discord, etc.) and email
 */

import { getDb } from "./db";
import { webhookConfigs, emailConfigs, notificationHistory } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface WebhookConfig {
  id: number;
  name: string;
  url: string;
  type: "slack" | "discord" | "generic" | "teams";
  enabled: boolean;
  events: string[]; // container_stopped, container_started, high_cpu, high_memory, etc.
  createdAt: Date;
}

export interface EmailConfig {
  id: number;
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  toEmails: string[];
  enabled: boolean;
  events: string[];
  createdAt: Date;
}

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  containerName?: string;
  containerId?: string;
  details?: Record<string, any>;
  timestamp: Date;
}

// Format Slack message
function formatSlackMessage(payload: NotificationPayload): object {
  const colorMap = {
    info: "#36a64f",
    warning: "#ff9800",
    critical: "#f44336",
  };
  
  return {
    attachments: [
      {
        color: colorMap[payload.severity],
        title: payload.title,
        text: payload.message,
        fields: [
          {
            title: "Severity",
            value: payload.severity.toUpperCase(),
            short: true,
          },
          {
            title: "Time",
            value: payload.timestamp.toISOString(),
            short: true,
          },
          ...(payload.containerName ? [{
            title: "Container",
            value: payload.containerName,
            short: true,
          }] : []),
        ],
        footer: "Docker Status Dashboard",
        ts: Math.floor(payload.timestamp.getTime() / 1000),
      },
    ],
  };
}

// Format Discord message
function formatDiscordMessage(payload: NotificationPayload): object {
  const colorMap = {
    info: 0x36a64f,
    warning: 0xff9800,
    critical: 0xf44336,
  };
  
  return {
    embeds: [
      {
        title: payload.title,
        description: payload.message,
        color: colorMap[payload.severity],
        fields: [
          {
            name: "Severity",
            value: payload.severity.toUpperCase(),
            inline: true,
          },
          ...(payload.containerName ? [{
            name: "Container",
            value: payload.containerName,
            inline: true,
          }] : []),
        ],
        timestamp: payload.timestamp.toISOString(),
        footer: {
          text: "Docker Status Dashboard",
        },
      },
    ],
  };
}

// Format Microsoft Teams message
function formatTeamsMessage(payload: NotificationPayload): object {
  const colorMap = {
    info: "Good",
    warning: "Warning",
    critical: "Attention",
  };
  
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: payload.severity === "critical" ? "FF0000" : payload.severity === "warning" ? "FFA500" : "00FF00",
    summary: payload.title,
    sections: [
      {
        activityTitle: payload.title,
        activitySubtitle: payload.timestamp.toISOString(),
        facts: [
          {
            name: "Severity",
            value: payload.severity.toUpperCase(),
          },
          {
            name: "Message",
            value: payload.message,
          },
          ...(payload.containerName ? [{
            name: "Container",
            value: payload.containerName,
          }] : []),
        ],
        markdown: true,
      },
    ],
  };
}

// Format generic webhook message
function formatGenericMessage(payload: NotificationPayload): object {
  return {
    event: payload.type,
    title: payload.title,
    message: payload.message,
    severity: payload.severity,
    container: payload.containerName,
    containerId: payload.containerId,
    details: payload.details,
    timestamp: payload.timestamp.toISOString(),
  };
}

// Send webhook notification
export async function sendWebhook(
  config: WebhookConfig,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    let body: object;
    
    switch (config.type) {
      case "slack":
        body = formatSlackMessage(payload);
        break;
      case "discord":
        body = formatDiscordMessage(payload);
        break;
      case "teams":
        body = formatTeamsMessage(payload);
        break;
      default:
        body = formatGenericMessage(payload);
    }
    
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    return { success: true };
  } catch (error: any) {
    console.error(`[Webhook] Error sending to ${config.name}:`, error);
    return { success: false, error: error.message };
  }
}

// Send email notification (using built-in notification service as fallback)
export async function sendEmail(
  config: EmailConfig,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    // For now, we'll use a simple approach
    // In production, you'd use nodemailer or similar
    
    // Format email content
    const subject = `[${payload.severity.toUpperCase()}] ${payload.title}`;
    const htmlBody = `
      <h2>${payload.title}</h2>
      <p><strong>Severity:</strong> ${payload.severity.toUpperCase()}</p>
      <p><strong>Message:</strong> ${payload.message}</p>
      ${payload.containerName ? `<p><strong>Container:</strong> ${payload.containerName}</p>` : ""}
      <p><strong>Time:</strong> ${payload.timestamp.toISOString()}</p>
      ${payload.details ? `<pre>${JSON.stringify(payload.details, null, 2)}</pre>` : ""}
      <hr>
      <p><small>Docker Status Dashboard</small></p>
    `;
    
    // Use the built-in notification service if available
    const { notifyOwner } = await import("./_core/notification");
    await notifyOwner({
      title: subject,
      content: payload.message,
    });
    
    return { success: true };
  } catch (error: any) {
    console.error(`[Email] Error sending notification:`, error);
    return { success: false, error: error.message };
  }
}

// Send notification to all configured channels
export async function sendNotification(
  payload: NotificationPayload,
  webhooks: WebhookConfig[],
  emails: EmailConfig[]
): Promise<{ webhookResults: any[]; emailResults: any[] }> {
  const webhookResults: any[] = [];
  const emailResults: any[] = [];
  
  // Send to webhooks
  for (const webhook of webhooks) {
    if (webhook.enabled && webhook.events.includes(payload.type)) {
      const result = await sendWebhook(webhook, payload);
      webhookResults.push({ name: webhook.name, ...result });
    }
  }
  
  // Send to emails
  for (const email of emails) {
    if (email.enabled && email.events.includes(payload.type)) {
      const result = await sendEmail(email, payload);
      emailResults.push({ name: email.name, ...result });
    }
  }
  
  return { webhookResults, emailResults };
}

// Notification event types
export const NOTIFICATION_EVENTS = {
  CONTAINER_STOPPED: "container_stopped",
  CONTAINER_STARTED: "container_started",
  CONTAINER_RESTARTED: "container_restarted",
  HIGH_CPU: "high_cpu",
  HIGH_MEMORY: "high_memory",
  CONTAINER_ERROR: "container_error",
  IMAGE_DELETED: "image_deleted",
  COMPOSE_UP: "compose_up",
  COMPOSE_DOWN: "compose_down",
} as const;

// Create notification payload for container events
export function createContainerNotification(
  event: string,
  containerName: string,
  containerId: string,
  details?: Record<string, any>
): NotificationPayload {
  const eventConfig: Record<string, { title: string; message: string; severity: NotificationPayload["severity"] }> = {
    [NOTIFICATION_EVENTS.CONTAINER_STOPPED]: {
      title: "Container Stopped",
      message: `Container "${containerName}" has stopped`,
      severity: "warning",
    },
    [NOTIFICATION_EVENTS.CONTAINER_STARTED]: {
      title: "Container Started",
      message: `Container "${containerName}" has started`,
      severity: "info",
    },
    [NOTIFICATION_EVENTS.CONTAINER_RESTARTED]: {
      title: "Container Restarted",
      message: `Container "${containerName}" has been restarted`,
      severity: "info",
    },
    [NOTIFICATION_EVENTS.HIGH_CPU]: {
      title: "High CPU Usage",
      message: `Container "${containerName}" CPU usage is above threshold`,
      severity: "warning",
    },
    [NOTIFICATION_EVENTS.HIGH_MEMORY]: {
      title: "High Memory Usage",
      message: `Container "${containerName}" memory usage is above threshold`,
      severity: "warning",
    },
    [NOTIFICATION_EVENTS.CONTAINER_ERROR]: {
      title: "Container Error",
      message: `Container "${containerName}" encountered an error`,
      severity: "critical",
    },
  };
  
  const config = eventConfig[event] || {
    title: "Container Event",
    message: `Event "${event}" on container "${containerName}"`,
    severity: "info" as const,
  };
  
  return {
    type: event,
    ...config,
    containerName,
    containerId,
    details,
    timestamp: new Date(),
  };
}

// Test webhook connection
export async function testWebhook(config: WebhookConfig): Promise<{ success: boolean; error?: string }> {
  const testPayload: NotificationPayload = {
    type: "test",
    title: "Test Notification",
    message: "This is a test notification from Docker Status Dashboard",
    severity: "info",
    timestamp: new Date(),
  };
  
  return sendWebhook(config, testPayload);
}
