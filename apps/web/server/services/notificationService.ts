/**
 * Centralized Notification Service
 *
 * Provides a single point for creating notifications across all channels.
 * Handles database insertion and optional delivery via Telegram (and future channels).
 */

import type { DrizzleDB } from "../db";
import { userNotifications, notificationOccurrences } from "../../drizzle/schema";
import { sql } from "drizzle-orm";

/**
 * Sanitize actionUrl — only allow relative paths and https URLs.
 * Blocks javascript:, data:, vbscript: and other dangerous protocols.
 */
function sanitizeActionUrl(url?: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;
  const lower = trimmed.toLowerCase();
  // Block dangerous protocols
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("blob:")
  ) {
    return undefined;
  }
  // Allow relative paths (starting with /) and https:// URLs only
  if (trimmed.startsWith("/") || lower.startsWith("https://")) {
    return trimmed;
  }
  // Block everything else (http:, ftp:, etc.)
  return undefined;
}

/**
 * Truncate error messages to prevent oversized metadata storage.
 */
function sanitizeMetadata(meta?: NotificationMetadata): NotificationMetadata | undefined {
  if (!meta) return undefined;
  const sanitized = { ...meta };
  if (sanitized.errorDetails?.errorMessage) {
    sanitized.errorDetails = {
      ...sanitized.errorDetails,
      errorMessage: sanitized.errorDetails.errorMessage.slice(0, 500),
    };
  }
  if (sanitized.source) {
    sanitized.source = sanitized.source.slice(0, 200);
  }
  return sanitized;
}

/**
 * Notification type enumeration (matches database enum)
 */
type NotificationType =
  | "scheduled_message"
  | "follow_request"
  | "alert"
  | "system"
  | "direct_message"
  | "urgent_message";

/**
 * Priority levels (matches reminder_priority enum)
 */
type ReminderPriority = "low" | "normal" | "high" | "critical";

/**
 * Known resource types for structured action linking
 */
type ResourceType =
  | "media_job"
  | "workflow"
  | "skill"
  | "feedback"
  | "agency"
  | "approval"
  | "team_run"
  | "room"
  | "user"
  | "conversation"
  | "scheduled_message";

/**
 * Structured metadata attached to notifications
 */
interface NotificationMetadata {
  eventId?: string;
  source?: string;
  errorDetails?: {
    errorCode?: string;
    errorMessage?: string;
  };
  metrics?: {
    durationMs?: number;
    costUsd?: number;
    itemCount?: number;
  };
  retryInfo?: {
    retryCount?: number;
    maxRetries?: number;
    nextRetryAt?: string;
  };
  relatedItems?: Record<string, string>;
}

/**
 * Parameters for creating a notification
 */
interface CreateNotificationParams {
  db: DrizzleDB;
  userId: number;
  type: NotificationType;
  title: string;
  content: string;
  priority?: ReminderPriority;
  conversationId?: number;
  scheduledMessageId?: number;
  /** Resource type for structured action linking */
  relatedResourceType?: ResourceType;
  /** ID of the related resource */
  relatedResourceId?: string;
  /** Direct action URL (overrides legacy string matching) */
  actionUrl?: string;
  /** Action button label */
  actionLabel?: string;
  /** Structured metadata */
  metadata?: NotificationMetadata;
  /** Auto-expire after this date */
  expiresAt?: Date;
  /** Dedup group key — notifications with the same groupKey for the same user are merged */
  groupKey?: string;
}

/**
 * Centralized notification creator.
 *
 * Inserts a notification into the database and enqueues it for Telegram delivery
 * if the user has linked their Telegram account and enabled notifications.
 *
 * Fire-and-forget pattern: Telegram enqueue failures are logged but don't fail
 * the notification creation.
 *
 * @returns Object containing the created notification ID
 */
async function createNotification(
  params: CreateNotificationParams
): Promise<{ notificationId: number; deduplicated: boolean }> {
  const {
    db,
    userId,
    type,
    title,
    content,
    priority = "normal",
    conversationId,
    scheduledMessageId,
    relatedResourceType,
    relatedResourceId,
    actionUrl,
    actionLabel,
    metadata,
    expiresAt,
    groupKey: rawGroupKey,
  } = params;

  // Truncate groupKey to 200 chars to match DB column constraint
  const groupKey = rawGroupKey?.substring(0, 200) || undefined;

  // 1. Build insert values
  const values: any = {
    userId,
    type,
    title,
    content,
    priority,
    isRead: false,
    isDismissed: false,
  };

  if (conversationId !== undefined) {
    values.conversationId = conversationId;
  }

  if (scheduledMessageId !== undefined) {
    values.scheduledMessageId = scheduledMessageId;
  }

  if (relatedResourceType) {
    values.relatedResourceType = relatedResourceType;
  }

  if (relatedResourceId) {
    values.relatedResourceId = relatedResourceId;
  }

  const safeActionUrl = actionUrl ? sanitizeActionUrl(actionUrl) : undefined;
  if (safeActionUrl) {
    values.actionUrl = safeActionUrl;
  }

  if (actionLabel) {
    values.actionLabel = actionLabel.slice(0, 100);
  }

  if (metadata) {
    values.metadata = sanitizeMetadata(metadata);
  }

  if (expiresAt) {
    values.expiresAt = expiresAt;
  }

  if (groupKey) {
    values.groupKey = groupKey;
  }

  let notificationId: number;
  let occurrenceCount = 1;
  let deduplicated = false;

  if (groupKey) {
    // Dedup path: INSERT ... ON CONFLICT on idx_notif_dedup_active
    const [result] = await db
      .insert(userNotifications)
      .values(values)
      .onConflictDoUpdate({
        target: [userNotifications.userId, userNotifications.groupKey],
        targetWhere: sql`"isDismissed" = false AND "groupKey" IS NOT NULL`,
        set: {
          occurrenceCount: sql`${userNotifications.occurrenceCount} + 1`,
          lastOccurredAt: sql`now()`,
          content: sql`excluded."content"`,
          metadata: sql`excluded."metadata"`,
          isRead: sql`false`,
        },
      })
      .returning({
        id: userNotifications.id,
        occurrenceCount: userNotifications.occurrenceCount,
      });

    notificationId = result.id;
    occurrenceCount = result.occurrenceCount;
    deduplicated = occurrenceCount > 1;

    // Insert occurrence snapshot on dedup hit
    if (deduplicated) {
      try {
        await db
          .insert(notificationOccurrences)
          .values({
            notificationId,
            content,
            metadata: metadata ? sanitizeMetadata(metadata) : undefined,
          });
      } catch {
        // Non-fatal — occurrence tracking is supplementary
      }

      console.log("[NotificationService] notification_dedup_hit", {
        groupKey,
        notificationId,
        newOccurrenceCount: occurrenceCount,
      });
    }
  } else {
    // Standard path: plain INSERT (no dedup)
    const [result] = await db
      .insert(userNotifications)
      .values(values)
      .returning({ id: userNotifications.id });

    notificationId = result.id;
  }

  // 2. Enqueue for Telegram delivery (fire-and-forget)
  try {
    const { enqueueTelegramNotification } = await import("./telegramService");
    await enqueueTelegramNotification(db, userId, {
      notificationId,
      title,
      content,
      priority,
      createdAt: new Date(),
    });
  } catch (err) {
    // Log but don't throw - Telegram delivery is optional
    console.error("[NotificationService] Telegram enqueue failed (non-fatal):", err);
  }

  // 3. Publish to Redis for real-time SSE (fire-and-forget)
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    if (redis) {
      const event = JSON.stringify({
        id: notificationId,
        userId,
        type,
        title,
        content,
        priority,
        relatedResourceType,
        relatedResourceId,
        actionUrl: safeActionUrl,
        actionLabel,
        metadata,
        occurrenceCount,
        deduplicated,
        createdAt: new Date().toISOString(),
      });
      await redis.publish(`notifications:user:${userId}`, event);
    }
  } catch {
    // Non-fatal — SSE listeners just won't get real-time updates
  }

  return { notificationId, deduplicated };
}

export { createNotification };
export type { CreateNotificationParams, NotificationType, ReminderPriority, ResourceType, NotificationMetadata };
