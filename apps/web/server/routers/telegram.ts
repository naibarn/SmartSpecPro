/**
 * Telegram Router
 *
 * Admin endpoints for configuring Telegram Bot integration.
 * User endpoints for account linking (added in section-06).
 */

import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { db, getDb } from "../db";
import { systemSettings, users } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";
import { clearTelegramCache } from "../services/telegramService";
import { getRedisClient } from "../services/redis";

// ============================================================================
// Admin Endpoints
// ============================================================================

/**
 * Get Telegram settings (masked for security)
 * Returns bot token with only last 4 chars visible, webhook secret masked
 */
const getTelegramSettings = adminProcedure.query(async () => {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const settings = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, "telegram"));

  const settingsMap = new Map(settings.map((s: any) => [s.key, s.value]));

  // Bot token: decrypt and mask (show only last 4 chars)
  let botToken: string | null = null;
  let botTokenConfigured = false;
  const botTokenEncrypted = settingsMap.get("bot_token");
  if (botTokenEncrypted) {
    botTokenConfigured = true;
    try {
      const decrypted = decrypt(botTokenEncrypted);
      // Show only last 4 chars: "****WXYZ"
      const last4 = decrypted.slice(-4);
      botToken = "****" + last4;
    } catch {
      botToken = "****[error]";
    }
  }

  // Webhook secret: mask if configured
  let webhookSecret: string | null = null;
  let webhookSecretConfigured = false;
  const webhookSecretEncrypted = settingsMap.get("webhook_secret");
  if (webhookSecretEncrypted) {
    webhookSecretConfigured = true;
    webhookSecret = "****configured";
  }

  // Other settings: return as-is
  const botUsername = settingsMap.get("bot_username") || null;
  const appUrl = settingsMap.get("app_url") || null;
  const enabled = settingsMap.get("enabled") === "true";

  return {
    botToken,
    botTokenConfigured,
    botUsername,
    webhookSecret,
    webhookSecretConfigured,
    appUrl,
    enabled,
  };
});

/**
 * Update Telegram settings
 * Encrypts sensitive values, auto-generates webhook_secret if missing, clears cache
 */
const updateTelegramSettings = adminProcedure
  .input(
    z.object({
      botToken: z.string().optional(),
      botUsername: z.string().max(64).optional(),
      appUrl: z.string().url().optional(),
      enabled: z.boolean().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const userId = ctx.user.id;
    const category = "telegram";

    // Build key-value pairs to upsert
    const updates: Array<{
      key: string;
      value: string;
      isSensitive: boolean;
    }> = [];

    if (input.botToken !== undefined) {
      updates.push({
        key: "bot_token",
        value: encrypt(input.botToken),
        isSensitive: true,
      });
    }

    if (input.botUsername !== undefined) {
      updates.push({
        key: "bot_username",
        value: input.botUsername,
        isSensitive: false,
      });
    }

    if (input.appUrl !== undefined) {
      updates.push({
        key: "app_url",
        value: input.appUrl,
        isSensitive: false,
      });
    }

    if (input.enabled !== undefined) {
      updates.push({
        key: "enabled",
        value: input.enabled ? "true" : "false",
        isSensitive: false,
      });
    }

    // Upsert each setting
    for (const { key, value, isSensitive } of updates) {
      const [existing] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, category),
            eq(systemSettings.key, key)
          )
        );

      if (existing) {
        // UPDATE
        await db
          .update(systemSettings)
          .set({
            value,
            isSensitive,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, existing.id));
      } else {
        // INSERT
        await db.insert(systemSettings).values({
          category,
          key,
          value,
          isSensitive,
          updatedBy: userId,
        });
      }
    }

    // Auto-generate webhook_secret if it doesn't exist
    const [webhookSecretRow] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, category),
          eq(systemSettings.key, "webhook_secret")
        )
      );

    if (!webhookSecretRow) {
      const generatedSecret = crypto.randomBytes(32).toString("hex");
      await db.insert(systemSettings).values({
        category,
        key: "webhook_secret",
        value: encrypt(generatedSecret),
        isSensitive: true,
        updatedBy: userId,
      });
    }

    // Clear Telegram service cache so new settings are picked up
    clearTelegramCache();

    return { success: true };
  });

/**
 * Test Telegram connection by calling Bot API getMe
 * Verifies bot token is valid
 */
const testTelegramConnection = adminProcedure.mutation(async () => {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Read bot_token from system_settings
  const [tokenRow] = await db
    .select()
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, "telegram"),
        eq(systemSettings.key, "bot_token")
      )
    );

  if (!tokenRow || !tokenRow.value) {
    return {
      success: false,
      error: "Bot token not configured",
    };
  }

  try {
    const botToken = decrypt(tokenRow.value);
    const url = `https://api.telegram.org/bot${botToken}/getMe`;

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const data = await response.json();

    if (response.ok && data.ok && data.result) {
      return {
        success: true,
        botInfo: {
          username: data.result.username,
          firstName: data.result.first_name,
        },
      };
    } else {
      return {
        success: false,
        error: data.description || "Failed to verify bot token",
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
});

/**
 * Register webhook with Telegram
 * Calls setWebhook API with app URL and secret token
 */
const registerWebhook = adminProcedure.mutation(async () => {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Read bot_token, webhook_secret, app_url from system_settings
  const settings = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, "telegram"));

  const settingsMap = new Map(settings.map((s: any) => [s.key, s.value]));

  const botTokenEncrypted = settingsMap.get("bot_token");
  const webhookSecretEncrypted = settingsMap.get("webhook_secret");
  const appUrl = settingsMap.get("app_url");

  if (!botTokenEncrypted || !webhookSecretEncrypted || !appUrl) {
    return {
      success: false,
      error:
        "Missing required settings (bot_token, webhook_secret, app_url). Please configure Telegram settings first.",
    };
  }

  try {
    const botToken = decrypt(botTokenEncrypted);
    const webhookSecret = decrypt(webhookSecretEncrypted);

    // Construct webhook URL using bot_username as path identifier
    const botUsername = settingsMap.get("bot_username");
    if (!botUsername) {
      return {
        success: false,
        error: "Bot username not configured. Please set bot username in Telegram settings.",
      };
    }
    const webhookUrl = `https://smartaihub.app/webhooks/telegram/${botUsername}`;

    const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message", "callback_query"],
      }),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      return {
        success: true,
        message: "Webhook registered successfully",
      };
    } else {
      return {
        success: false,
        error: data.description || "Failed to register webhook",
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
});

// ============================================================================
// Export Router
// ============================================================================

// ============================================================================
// User Endpoints (Section 06)
// ============================================================================

/**
 * Generate a verification code and return a Telegram deep link.
 * User clicks this link in Telegram to initiate account linking.
 */
const generateTelegramLink = protectedProcedure.mutation(
  async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database unavailable",
      });
    }

    // Check if Telegram feature is enabled
    const settings = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.category, "telegram"));

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));
    const enabled = settingsMap.get("enabled") === "true";

    if (!enabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Telegram notifications are not enabled",
      });
    }

    const botUsername = settingsMap.get("bot_username");
    if (!botUsername) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Telegram bot username not configured",
      });
    }

    // Generate verification code (128-bit entropy)
    const code = crypto.randomBytes(16).toString("hex"); // 32-char hex string

    // Store in Redis with 5-minute TTL
    const redis = getRedisClient();
    const verificationData = {
      userId: ctx.user.id,
      createdAt: Date.now(),
      attempts: 0,
    };

    try {
      await redis.set(
        `telegram:verify:${code}`,
        JSON.stringify(verificationData),
        "EX",
        300 // 5 minutes
      );
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate verification link",
      });
    }

    // Construct deep link
    const deepLink = `https://t.me/${botUsername}?start=${code}`;

    return {
      code,
      deepLink,
      expiresIn: 300,
    };
  }
);

/**
 * Check current Telegram linking status and preferences.
 * Frontend polls this endpoint to detect when verification completes.
 */
const checkTelegramStatus = protectedProcedure.query(async ({ ctx }) => {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }

  const [user] = await db
    .select({
      telegramChatId: users.telegramChatId,
      telegramUsername: users.telegramUsername,
      telegramVerified: users.telegramVerified,
      telegramVerifiedAt: users.telegramVerifiedAt,
      userPreferences: users.userPreferences,
    })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .limit(1);

  if (!user) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User not found",
    });
  }

  const prefs = (user.userPreferences || {}) as any;

  return {
    linked: user.telegramVerified === true, // Canonical signal
    username: user.telegramUsername || undefined,
    verifiedAt: user.telegramVerifiedAt || undefined,
    notifyLevel: prefs.telegramNotifyLevel || "off",
    deliveryFailing: prefs.telegramDeliveryFailing || false,
  };
});

/**
 * Unlink the user's Telegram account and clear all related settings.
 */
const unlinkTelegram = protectedProcedure.mutation(async ({ ctx }) => {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }

  // Fetch current userPreferences to preserve non-Telegram fields
  const [user] = await db
    .select({ userPreferences: users.userPreferences })
    .from(users)
    .where(eq(users.id, ctx.user.id))
    .limit(1);

  const currentPrefs = (user?.userPreferences || {}) as any;
  const {
    telegramNotifyLevel,
    telegramDeliveryFailing,
    ...remainingPrefs
  } = currentPrefs;

  // Update users table - clear all Telegram fields
  await db
    .update(users)
    .set({
      telegramChatId: null,
      telegramUsername: null,
      telegramVerified: false,
      telegramVerifiedAt: null,
      userPreferences: remainingPrefs,
    })
    .where(eq(users.id, ctx.user.id));

  // Delete Redis failure counter
  const redis = getRedisClient();
  try {
    await redis.del(`telegram:failures:${ctx.user.id}`);
  } catch (err) {
    // Non-fatal - log and continue
    console.warn(
      `[Telegram] Failed to delete Redis failure counter for user ${ctx.user.id}:`,
      err
    );
  }

  return { success: true };
});

/**
 * Update the user's Telegram notification preferences.
 */
const updateTelegramPreferences = protectedProcedure
  .input(
    z.object({
      notifyLevel: z.enum(["all", "high_critical", "critical_only", "off"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database unavailable",
      });
    }

    // Fetch current userPreferences
    const [user] = await db
      .select({ userPreferences: users.userPreferences })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    const currentPrefs = (user?.userPreferences || {}) as any;

    // Update only telegramNotifyLevel, preserve all other keys
    await db
      .update(users)
      .set({
        userPreferences: {
          ...currentPrefs,
          telegramNotifyLevel: input.notifyLevel,
        },
      })
      .where(eq(users.id, ctx.user.id));

    return { success: true };
  });

export const telegramRouter = router({
  // Admin endpoints
  getTelegramSettings,
  updateTelegramSettings,
  testTelegramConnection,
  registerWebhook,

  // User endpoints
  generateTelegramLink,
  checkTelegramStatus,
  unlinkTelegram,
  updateTelegramPreferences,
});
