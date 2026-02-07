/**
 * Telegram Notification Service
 *
 * Provides message formatting, Bot API client, eligibility filtering,
 * and BullMQ queue/worker infrastructure for reliable async delivery.
 */

import { Queue, Worker, Job } from "bullmq";
import type { DrizzleDB } from "../db";
import { encrypt, decrypt } from "./crypto";
import { users, systemSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// Types
// ============================================================================

interface TelegramJobData {
  userId: number;
  chatId: string;
  notificationId: number;
  title: string;
  content: string;
  priority: string;
  createdAt: string;
}

interface TelegramSettings {
  botToken: string;
  botUsername: string;
  appUrl: string;
  enabled: boolean;
}

// ============================================================================
// Module-level state
// ============================================================================

let cachedSettings: TelegramSettings | null = null;
let telegramQueue: Queue<TelegramJobData> | null = null;
let telegramWorker: Worker<TelegramJobData> | null = null;

// ============================================================================
// HTML Escaping
// ============================================================================

/**
 * Escapes HTML special characters for Telegram HTML parse mode.
 * Only three characters need escaping: <, >, &
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Formats notification into Telegram HTML message with priority emoji and inline button.
 *
 * @param notification - Notification data with title, content, priority, createdAt
 * @param appUrl - Base URL for inline button (from system_settings)
 * @returns Object with text (HTML formatted), parseMode, and replyMarkup (inline keyboard)
 */
export function formatTelegramMessage(
  notification: {
    title: string;
    content: string;
    priority: string;
    createdAt: Date;
  },
  appUrl: string
): { text: string; parseMode: string; replyMarkup: object } {
  // Priority emoji mapping
  const emojiMap: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    normal: "🔵",
    low: "⚪",
  };

  const emoji = emojiMap[notification.priority] || "🔵";

  // Format timestamp
  const timestamp = notification.createdAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Escape HTML special characters
  const escapedTitle = escapeHtml(notification.title);
  const escapedContent = escapeHtml(notification.content);

  // Build message (Telegram limit is 4096 chars, use 4000 for safety)
  let text = `${emoji} <b>${escapedTitle}</b>\n\n${escapedContent}\n\n<i>${timestamp}</i>`;

  if (text.length > 4000) {
    text = text.substring(0, 3997) + "...";
  }

  // Inline keyboard with "View in SmartSpecPro" button
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: "View in SmartSpecPro",
          url: `${appUrl}/notifications`,
        },
      ],
    ],
  };

  return {
    text,
    parseMode: "HTML",
    replyMarkup,
  };
}

// ============================================================================
// Bot API Client
// ============================================================================

/**
 * Sends message via Telegram Bot API.
 *
 * @param botToken - Bot token from system_settings (decrypted)
 * @param chatId - User's Telegram chat ID
 * @param text - Message text (HTML formatted)
 * @param parseMode - "HTML" or "MarkdownV2"
 * @param replyMarkup - Optional inline keyboard
 * @returns Success status and message ID
 * @throws Error on API failure (429, bot blocked, network error)
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: string,
  replyMarkup?: object
): Promise<{ ok: boolean; messageId?: number }> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const payload: any = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  };

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const data = await response.json();

    if (!response.ok) {
      // Check for specific error codes
      if (response.status === 429) {
        const retryAfter = data.parameters?.retry_after || 30;
        const error = new Error(`Rate limited by Telegram API`);
        (error as any).retryAfter = retryAfter;
        (error as any).statusCode = 429;
        throw error;
      }

      if (data.description?.includes("bot was blocked")) {
        const error = new Error("Bot was blocked by user");
        (error as any).statusCode = 403;
        (error as any).blocked = true;
        throw error;
      }

      throw new Error(
        `Telegram API error: ${data.description || response.statusText}`
      );
    }

    return {
      ok: true,
      messageId: data.result?.message_id,
    };
  } catch (err) {
    if (err instanceof Error && "retryAfter" in err) {
      throw err; // Rethrow 429 with retry info
    }
    if (err instanceof Error && "blocked" in err) {
      throw err; // Rethrow "bot blocked" error
    }
    throw new Error(
      `Network error calling Telegram API: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ============================================================================
// Settings Cache
// ============================================================================

/**
 * Loads Telegram settings from system_settings table.
 * Results are cached in module-level variable.
 * Call clearTelegramCache() to force reload (e.g., after admin updates settings).
 */
async function getTelegramSettings(
  db: DrizzleDB
): Promise<TelegramSettings | null> {
  if (cachedSettings) {
    return cachedSettings;
  }

  const settings = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, "telegram"));

  const settingsMap = new Map(
    settings.map((s: any) => [s.key, s.value])
  );

  const enabled = settingsMap.get("enabled") === "true";
  if (!enabled) {
    return null;
  }

  const botTokenEncrypted = settingsMap.get("bot_token");
  const botUsername = settingsMap.get("bot_username");
  const appUrl = settingsMap.get("app_url");

  if (!botTokenEncrypted || !botUsername || !appUrl) {
    console.warn("[Telegram] Missing required settings");
    return null;
  }

  // TypeScript doesn't narrow types after the check above, so we assert
  const botToken = decrypt(botTokenEncrypted as string);

  cachedSettings = {
    botToken,
    botUsername: botUsername as string,
    appUrl: appUrl as string,
    enabled: true,
  };

  return cachedSettings;
}

/**
 * Clears cached Telegram settings.
 * Called after admin updates settings in system_settings.
 */
export function clearTelegramCache(): void {
  cachedSettings = null;
}

// ============================================================================
// Eligibility Check & Enqueue
// ============================================================================

/**
 * Checks if notification should be delivered via Telegram and enqueues job if eligible.
 *
 * Eligibility criteria:
 * - Telegram feature enabled in system_settings
 * - User has telegramVerified === true
 * - Notification priority matches user's telegramNotifyLevel preference
 *
 * This function is fire-and-forget — failures are logged but don't throw.
 */
export async function enqueueTelegramNotification(
  db: DrizzleDB,
  userId: number,
  notification: {
    notificationId: number;
    title: string;
    content: string;
    priority: string;
    createdAt: Date;
  }
): Promise<void> {
  try {
    // Check if Telegram is enabled
    const settings = await getTelegramSettings(db);
    if (!settings) {
      return; // Feature disabled or not configured
    }

    // Fetch user's Telegram info and preferences
    const [user] = await db
      .select({
        telegramChatId: users.telegramChatId,
        telegramVerified: users.telegramVerified,
        userPreferences: users.userPreferences,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user || !user.telegramVerified || !user.telegramChatId) {
      return; // User not linked or not verified
    }

    const prefs = user.userPreferences || {};
    const notifyLevel = (prefs as any).telegramNotifyLevel;

    // Check notification level filter
    if (!notifyLevel || notifyLevel === "off") {
      return; // User disabled Telegram notifications
    }

    const priority = notification.priority.toLowerCase();

    if (notifyLevel === "critical_only" && priority !== "critical") {
      return;
    }

    if (
      notifyLevel === "high_critical" &&
      !["high", "critical"].includes(priority)
    ) {
      return;
    }

    // All checks passed — enqueue job
    if (!telegramQueue) {
      console.error("[Telegram] Queue not initialized");
      return;
    }

    // Map priority to BullMQ job priority (lower number = higher priority)
    const priorityMap: Record<string, number> = {
      critical: 1,
      high: 3,
      normal: 5,
      low: 7,
    };
    const jobPriority = priorityMap[priority] || 5;

    const jobData: TelegramJobData = {
      userId,
      chatId: user.telegramChatId,
      notificationId: notification.notificationId,
      title: notification.title,
      content: notification.content,
      priority: notification.priority,
      createdAt: notification.createdAt.toISOString(),
    };

    await telegramQueue.add("send", jobData, {
      priority: jobPriority,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    });

    console.log(
      `[Telegram] Enqueued notification ${notification.notificationId} for user ${userId}`
    );
  } catch (err) {
    // Fire-and-forget — log error but don't throw
    console.error("[Telegram] Failed to enqueue notification:", err);
  }
}

// ============================================================================
// Queue & Worker Initialization
// ============================================================================

/**
 * Initializes BullMQ queue and worker for Telegram notifications.
 *
 * Queue configuration:
 * - Separate Redis connection (isolates failure domains)
 * - 3 retries with exponential backoff
 * - Rate limit: 25 messages/second (conservative, below Telegram's 30/sec limit)
 * - Concurrency: 5
 *
 * Worker error handling:
 * - 429 (rate limit): calls worker.rateLimit() with Telegram's retry-after value
 * - Bot blocked: increments failure counter, sets deliveryFailing flag after 5 failures
 * - Other errors: throws (triggers BullMQ retry)
 */
export async function initializeTelegramQueue(
  db: DrizzleDB,
  redisConfig: { host: string; port: number; password?: string }
): Promise<void> {
  telegramQueue = new Queue<TelegramJobData>("telegram-notifications", {
    connection: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    },
  });

  telegramWorker = new Worker<TelegramJobData>(
    "telegram-notifications",
    async (job: Job<TelegramJobData>) => {
      const {
        userId,
        chatId,
        title,
        content,
        priority,
        createdAt,
        notificationId,
      } = job.data;

      // Load bot token and app URL
      const settings = await getTelegramSettings(db);
      if (!settings) {
        throw new Error("Telegram settings not available");
      }

      // Format message
      const { text, parseMode, replyMarkup } = formatTelegramMessage(
        {
          title,
          content,
          priority,
          createdAt: new Date(createdAt),
        },
        settings.appUrl
      );

      try {
        // Send message via Bot API
        const result = await sendTelegramMessage(
          settings.botToken,
          chatId,
          text,
          parseMode,
          replyMarkup
        );

        console.log(
          `[Telegram] Sent notification ${notificationId} to user ${userId}, message_id: ${result.messageId}`
        );

        // Check if user had previous failures — if so, reset counter
        const redis = (telegramWorker as any).redisClient; // Access worker's Redis connection
        const failureKey = `telegram:failures:${userId}`;
        const failureCount = await redis.get(failureKey);

        if (failureCount && parseInt(failureCount) > 0) {
          await redis.del(failureKey);

          // Clear deliveryFailing flag in userPreferences
          const [user] = await db
            .select({ userPreferences: users.userPreferences })
            .from(users)
            .where(eq(users.id, userId));
          if ((user?.userPreferences as any)?.telegramDeliveryFailing) {
            await db
              .update(users)
              .set({
                userPreferences: {
                  ...user.userPreferences,
                  telegramDeliveryFailing: false,
                } as any,
              })
              .where(eq(users.id, userId));
          }

          console.log(`[Telegram] Reset failure counter for user ${userId}`);
        }
      } catch (err: any) {
        // Handle rate limiting
        if (err.statusCode === 429) {
          const retryAfter = err.retryAfter || 30;
          await telegramWorker!.rateLimit(retryAfter * 1000);
          throw Worker.RateLimitError;
        }

        // Handle bot blocked by user
        if (err.blocked) {
          const redis = (telegramWorker as any).redisClient;
          const failureKey = `telegram:failures:${userId}`;
          const newCount = await redis.incr(failureKey);
          await redis.expire(failureKey, 86400 * 7); // 7 day TTL

          console.warn(
            `[Telegram] Bot blocked by user ${userId}, failure count: ${newCount}`
          );

          // After 5 consecutive failures, set deliveryFailing flag
          if (newCount >= 5) {
            const [user] = await db
              .select({ userPreferences: users.userPreferences })
              .from(users)
              .where(eq(users.id, userId));
            await db
              .update(users)
              .set({
                userPreferences: {
                  ...(user?.userPreferences || {}),
                  telegramDeliveryFailing: true,
                } as any,
              })
              .where(eq(users.id, userId));

            console.warn(
              `[Telegram] Set deliveryFailing flag for user ${userId}`
            );
          }

          // Don't retry — user needs to unblock bot
          return;
        }

        // Other errors — throw to trigger BullMQ retry
        throw err;
      }
    },
    {
      connection: redisConfig,
      concurrency: 5,
      limiter: {
        max: 25,
        duration: 1000, // 25 messages per second
      },
    }
  );

  console.log("[Telegram] Queue and worker initialized");
}

/**
 * Gracefully shuts down Telegram queue and worker.
 * Call this in SIGTERM/SIGINT handler.
 */
export async function shutdownTelegramWorker(): Promise<void> {
  if (telegramWorker) {
    await telegramWorker.close();
    console.log("[Telegram] Worker shut down");
  }
  if (telegramQueue) {
    await telegramQueue.close();
    console.log("[Telegram] Queue closed");
  }
}
