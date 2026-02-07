/**
 * Centralized Notification Service
 *
 * Provides a single point for creating notifications across all channels.
 * Handles database insertion and optional delivery via Telegram (and future channels).
 */

import type { DrizzleDB } from "../db";
import { userNotifications } from "../../drizzle/schema";

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
): Promise<{ notificationId: number }> {
  const {
    db,
    userId,
    type,
    title,
    content,
    priority = "normal",
    conversationId,
    scheduledMessageId,
  } = params;

  // 1. Insert into user_notifications table
  const values: any = {
    userId,
    type,
    title,
    content,
    priority,
    isRead: false,
  };

  if (conversationId !== undefined) {
    values.conversationId = conversationId;
  }

  if (scheduledMessageId !== undefined) {
    values.scheduledMessageId = scheduledMessageId;
  }

  const [result] = await db
    .insert(userNotifications)
    .values(values)
    .returning({ id: userNotifications.id });

  const notificationId = result.id;

  // 2. Enqueue for Telegram delivery (fire-and-forget)
  try {
    const { enqueueTelegramNotification } = await import("./telegramService");
    await enqueueTelegramNotification(userId, {
      notificationId,
      title,
      content,
      priority,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Log but don't throw - Telegram delivery is optional
    console.error("[NotificationService] Telegram enqueue failed (non-fatal):", err);
  }

  return { notificationId };
}

export { createNotification };
export type { CreateNotificationParams, NotificationType, ReminderPriority };
