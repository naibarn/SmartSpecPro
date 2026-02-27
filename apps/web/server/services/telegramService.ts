/**
 * Telegram Notification Service
 *
 * Provides message formatting, Bot API client, eligibility filtering,
 * and in-process delivery (migrated from BullMQ).
 */

import type { DrizzleDB } from "../db";
import { decrypt } from "./crypto";
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

// Simple in-process rate limiter (25 messages/second, below Telegram's 30/sec limit)
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX = 25;
let rateLimitTokens = RATE_LIMIT_MAX;
let rateLimitLastRefill = Date.now();

function checkTelegramRateLimit(): boolean {
  const now = Date.now();
  const elapsed = now - rateLimitLastRefill;
  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    rateLimitTokens = RATE_LIMIT_MAX;
    rateLimitLastRefill = now;
  }
  if (rateLimitTokens > 0) {
    rateLimitTokens--;
    return true;
  }
  return false;
}

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) break;
      // Don't retry if bot was blocked
      if (err.blocked) throw err;
      // Use retry-after from 429 if available
      const delayMs = err.retryAfter
        ? err.retryAfter * 1000
        : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

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

  // Inline keyboard with "View in SmartAIHub" button
  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: "View in SmartAIHub",
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

/**
 * Answers a callback query from an inline keyboard button press.
 * Must be called to dismiss the loading state in the Telegram client.
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  const payload: any = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Fire-and-forget — callback answer failures are non-critical
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
    const chatId = user.telegramChatId;

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

    // All checks passed — send directly (in-process, fire-and-forget)
    const { text, parseMode, replyMarkup } = formatTelegramMessage(
      {
        title: notification.title,
        content: notification.content,
        priority: notification.priority,
        createdAt: notification.createdAt,
      },
      settings.appUrl
    );

    // Rate limit check
    if (!checkTelegramRateLimit()) {
      console.warn(
        `[Telegram] Rate limited, deferring notification ${notification.notificationId}`
      );
      // Wait for rate limit window to reset, then retry once
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WINDOW_MS));
    }

    // Send with retry (handles 429 and transient failures)
    await withRetry(() =>
      sendTelegramMessage(
        settings.botToken,
        chatId,
        text,
        parseMode,
        replyMarkup
      )
    );

    console.log(
      `[Telegram] Sent notification ${notification.notificationId} to user ${userId}`
    );
  } catch (err: any) {
    // Handle bot blocked — update user record
    if (err.blocked) {
      console.warn(
        `[Telegram] Bot blocked by user ${userId}, marking deliveryFailing`
      );
      try {
        await db
          .update(users)
          .set({ telegramVerified: false })
          .where(eq(users.id, userId));
      } catch (dbErr) {
        console.error("[Telegram] Failed to update blocked user:", dbErr);
      }
      return;
    }
    // Fire-and-forget — log error but don't throw
    console.error("[Telegram] Failed to send notification:", err);
  }
}

// ============================================================================
// Initialization (no BullMQ — in-process delivery)
// ============================================================================

/**
 * Initialize the Telegram service.
 * No queue/worker needed — delivery is in-process.
 */
export async function initializeTelegramQueue(
  _db: DrizzleDB,
  _redisConfig: { host: string; port: number; password?: string }
): Promise<void> {
  console.log("[Telegram] Service initialized (in-process delivery)");
}

/**
 * Gracefully shuts down the Telegram service.
 */
export async function shutdownTelegramWorker(): Promise<void> {
  console.log("[Telegram] Service shut down");
}
