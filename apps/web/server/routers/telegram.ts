/**
 * Telegram Router
 *
 * Admin endpoints for configuring Telegram Bot integration.
 * User endpoints for account linking (added in section-06).
 */

import { z } from "zod";
import crypto from "crypto";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";
import { clearTelegramCache } from "../services/telegramService";

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
          createdBy: userId,
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
        createdBy: userId,
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

    // Construct webhook URL
    const webhookUrl = `${appUrl}/api/webhook/telegram`;

    const url = `https://api.telegram.org/bot${botToken}/setWebhook`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message"],
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

export const telegramRouter = router({
  // Admin endpoints
  getTelegramSettings,
  updateTelegramSettings,
  testTelegramConnection,
  registerWebhook,

  // User endpoints (section-06)
  // generateTelegramLink, checkTelegramStatus, unlinkTelegram, updateTelegramPreferences
});
