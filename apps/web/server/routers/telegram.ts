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
import {
  systemSettings,
  users,
  telegramLinkTokens,
  telegramConnections,
  conversationChannels,
  conversations,
  agencyConversations,
} from "../../drizzle/schema";
import { eq, and, count, sql, gt, lt } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";
import { clearTelegramCache } from "../services/telegramService";
import { clearDeliveryBotTokenCache } from "../services/deliveryQueue";
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
      botToken: z.string().regex(/^\d+:[A-Za-z0-9_-]{35}$/, "Invalid bot token format").optional(),
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

    // Auto-generate or rotate webhook_secret
    const [webhookSecretRow] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, category),
          eq(systemSettings.key, "webhook_secret")
        )
      );

    if (!webhookSecretRow || input.botToken !== undefined) {
      // Generate new secret if missing OR if botToken changed
      const generatedSecret = crypto.randomBytes(32).toString("hex");
      if (webhookSecretRow) {
        await db
          .update(systemSettings)
          .set({
            value: encrypt(generatedSecret),
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.id, webhookSecretRow.id));
      } else {
        await db.insert(systemSettings).values({
          category,
          key: "webhook_secret",
          value: encrypt(generatedSecret),
          isSensitive: true,
          updatedBy: userId,
        });
      }
    }

    // Clear caches so new settings are picked up
    clearTelegramCache();
    clearDeliveryBotTokenCache();

    // If botToken changed, re-register webhook so Telegram uses the new secret
    let webhookReRegistered = false;
    if (input.botToken !== undefined) {
      const result = await callTelegramSetWebhook(db);
      webhookReRegistered = result.ok;
      if (!result.ok) {
        console.warn("[Telegram] Auto webhook re-registration failed:", result.error);
      }
    }

    return { success: true, webhookReRegistered };
  });

/**
 * Shared helper: call Telegram setWebhook API with current DB settings.
 * Returns { ok, error? } without throwing.
 */
async function callTelegramSetWebhook(
  database: Awaited<ReturnType<typeof getDb>>,
): Promise<{ ok: boolean; error?: string }> {
  if (!database) return { ok: false, error: "Database unavailable" };

  const settings = await database
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, "telegram"));

  const map = new Map(settings.map((s: any) => [s.key, s.value]));

  const botTokenEnc = map.get("bot_token");
  const secretEnc = map.get("webhook_secret");
  const appUrl = map.get("app_url");
  const botUsername = map.get("bot_username");

  if (!botTokenEnc || !secretEnc || !appUrl || !botUsername) {
    return { ok: false, error: "Missing required settings" };
  }

  try {
    const botToken = decrypt(botTokenEnc);
    const webhookSecret = decrypt(secretEnc);
    const webhookUrl = `${appUrl}/webhooks/telegram/${botUsername}`;

    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: webhookSecret,
          allowed_updates: ["message", "callback_query"],
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.description };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

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
  const result = await callTelegramSetWebhook(db);
  if (result.ok) {
    return { success: true, message: "Webhook registered successfully" };
  }
  return { success: false, error: result.error ?? "Failed to register webhook" };
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
const generateTelegramLink = protectedProcedure
  .input(
    z
      .object({
        conversationId: z.union([z.number(), z.string()]).optional(),
        conversationType: z.enum(["chat", "agency"]).optional(),
      })
      .optional(),
  )
  .mutation(async ({ input, ctx }) => {
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

    // Validate conversation ownership if provided
    if (input?.conversationId && input?.conversationType) {
      if (input.conversationType === "chat") {
        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, Number(input.conversationId)),
              eq(conversations.userId, ctx.user.id),
            ),
          )
          .limit(1);
        if (!conv) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Conversation not found or not owned by user",
          });
        }
      } else {
        const [conv] = await db
          .select({ id: agencyConversations.id })
          .from(agencyConversations)
          .where(
            and(
              eq(agencyConversations.id, String(input.conversationId)),
              eq(agencyConversations.userId, ctx.user.id),
            ),
          )
          .limit(1);
        if (!conv) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Agency conversation not found or not owned by user",
          });
        }
      }
    }

    // Rate limit: max 5 tokens per hour per user
    const oneHourAgo = new Date(Date.now() - 3600_000);
    const [tokenCount] = await db
      .select({ cnt: count() })
      .from(telegramLinkTokens)
      .where(
        and(
          eq(telegramLinkTokens.userId, ctx.user.id),
          gt(telegramLinkTokens.createdAt, oneHourAgo),
        ),
      );
    if (Number(tokenCount?.cnt) >= 5) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many link attempts. Please try again later.",
      });
    }

    // Cleanup expired tokens for this user
    await db
      .delete(telegramLinkTokens)
      .where(
        and(
          eq(telegramLinkTokens.userId, ctx.user.id),
          lt(telegramLinkTokens.expiresAt, new Date()),
        ),
      );

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
        300, // 5 minutes
      );
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate verification link",
      });
    }

    // Create telegram_link_tokens record for auditing + conversation binding
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");

    // Determine purpose: 'connect' if no active connection, 'resume' otherwise
    const [existingConn] = await db
      .select({ id: telegramConnections.id })
      .from(telegramConnections)
      .where(
        and(
          eq(telegramConnections.userId, ctx.user.id),
          eq(telegramConnections.status, "active"),
        ),
      )
      .limit(1);

    const purpose = existingConn ? "resume" : "connect";

    // Resolve tenant from user
    const [currentUser] = await db
      .select({ currentTenantId: users.currentTenantId })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    const tenantId = String(currentUser?.currentTenantId ?? "");

    try {
      await db.insert(telegramLinkTokens).values({
        id: crypto.randomUUID(),
        tenantId,
        userId: ctx.user.id,
        targetChatConversationId:
          input?.conversationType === "chat"
            ? Number(input.conversationId)
            : null,
        targetAgencyConversationId:
          input?.conversationType === "agency"
            ? String(input.conversationId)
            : null,
        targetConversationType: input?.conversationType ?? null,
        purpose,
        tokenHash,
        expiresAt: new Date(Date.now() + 300_000),
        createdBy: ctx.user.id,
      });
    } catch (err) {
      console.error("[Telegram] Failed to create link token record:", err);
      // Non-fatal: Redis token still works as fallback
    }

    // Construct deep link
    const deepLink = `https://t.me/${botUsername}?start=${code}`;

    return {
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

  // Query active connection details (activeChannelId omitted — internal)
  const [activeConnection] = await db
    .select({
      id: telegramConnections.id,
      telegramUsername: telegramConnections.telegramUsername,
      status: telegramConnections.status,
      linkedAt: telegramConnections.linkedAt,
    })
    .from(telegramConnections)
    .where(
      and(
        eq(telegramConnections.userId, ctx.user.id),
        eq(telegramConnections.status, "active"),
      ),
    )
    .limit(1);

  let boundConversationCount = 0;
  if (activeConnection) {
    const [countResult] = await db
      .select({ cnt: count() })
      .from(conversationChannels)
      .where(
        and(
          eq(conversationChannels.connectionId, activeConnection.id),
          eq(conversationChannels.state, "active"),
        ),
      );
    boundConversationCount = Number(countResult?.cnt) || 0;
  }

  return {
    linked: user.telegramVerified === true, // Canonical signal
    username: user.telegramUsername || undefined,
    verifiedAt: user.telegramVerifiedAt || undefined,
    notifyLevel: prefs.telegramNotifyLevel || "off",
    deliveryFailing: prefs.telegramDeliveryFailing || false,
    connection: activeConnection
      ? {
          id: activeConnection.id,
          telegramUsername: activeConnection.telegramUsername,
          status: activeConnection.status,
          linkedAt: activeConnection.linkedAt,
        }
      : null,
    boundConversationCount,
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

  // Revoke active telegram_connections and their channel bindings
  const activeConnections = await db
    .select({ id: telegramConnections.id })
    .from(telegramConnections)
    .where(
      and(
        eq(telegramConnections.userId, ctx.user.id),
        eq(telegramConnections.status, "active"),
      ),
    );

  for (const conn of activeConnections) {
    await db
      .update(telegramConnections)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: String(ctx.user.id),
      })
      .where(eq(telegramConnections.id, conn.id));

    await db
      .update(conversationChannels)
      .set({ state: "revoked", updatedAt: new Date() })
      .where(eq(conversationChannels.connectionId, conn.id));
  }

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

// ============================================================================
// Chat Bridge Endpoints (Section 10)
// ============================================================================

/**
 * Verify that the user owns the specified conversation.
 * Throws TRPCError NOT_FOUND if the conversation doesn't exist or
 * doesn't belong to the user.
 */
async function verifyConversationOwnership(
  database: any,
  userId: number,
  conversationId: string,
  conversationType: "chat" | "agency",
): Promise<void> {
  if (conversationType === "chat") {
    const numericId = parseInt(conversationId, 10);
    if (isNaN(numericId)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }
    const [conv] = await database
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, numericId),
          eq(conversations.userId, userId),
        ),
      )
      .limit(1);
    if (!conv) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }
  } else {
    const [conv] = await database
      .select({ id: agencyConversations.id })
      .from(agencyConversations)
      .where(
        and(
          eq(agencyConversations.id, conversationId),
          eq(agencyConversations.userId, userId),
        ),
      )
      .limit(1);
    if (!conv) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation not found",
      });
    }
  }
}

/**
 * Get Telegram channel binding status for a conversation.
 */
const getConversationChannelStatus = protectedProcedure
  .input(
    z.object({
      conversationId: z.string(),
      conversationType: z.enum(["chat", "agency"]).default("chat"),
    }),
  )
  .query(async ({ input, ctx }) => {
    const database = await getDb();
    if (!database) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    await verifyConversationOwnership(
      database,
      ctx.user.id,
      input.conversationId,
      input.conversationType,
    );

    // Find active channel binding
    const convCondition =
      input.conversationType === "chat"
        ? eq(conversationChannels.chatConversationId, parseInt(input.conversationId, 10))
        : eq(conversationChannels.agencyConversationId, input.conversationId);

    const [channel] = await database
      .select({
        id: conversationChannels.id,
        syncMode: conversationChannels.syncMode,
        connectionId: conversationChannels.connectionId,
      })
      .from(conversationChannels)
      .where(
        and(
          convCondition,
          eq(conversationChannels.channelType, "telegram"),
          eq(conversationChannels.state, "active"),
        ),
      )
      .limit(1);

    if (!channel) {
      return { bound: false as const };
    }

    // Get connection status
    let connectionStatus = "unknown";
    if (channel.connectionId) {
      const [conn] = await database
        .select({ status: telegramConnections.status })
        .from(telegramConnections)
        .where(eq(telegramConnections.id, channel.connectionId))
        .limit(1);
      if (conn) connectionStatus = conn.status;
    }

    return {
      bound: true as const,
      syncMode: channel.syncMode,
      connectionStatus,
    };
  });

/**
 * Bind a conversation to the user's active Telegram connection.
 */
const bindConversation = protectedProcedure
  .input(
    z.object({
      conversationId: z.string(),
      conversationType: z.enum(["chat", "agency"]),
      syncMode: z.enum(["two_way", "notify_only"]).default("two_way"),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const database = await getDb();
    if (!database) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    await verifyConversationOwnership(
      database,
      ctx.user.id,
      input.conversationId,
      input.conversationType,
    );

    // Require active Telegram connection
    const [connection] = await database
      .select()
      .from(telegramConnections)
      .where(
        and(
          eq(telegramConnections.userId, ctx.user.id),
          eq(telegramConnections.status, "active"),
        ),
      )
      .limit(1);

    if (!connection) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No active Telegram connection. Link your account first.",
      });
    }

    // Check for duplicate binding
    const convCondition =
      input.conversationType === "chat"
        ? eq(conversationChannels.chatConversationId, parseInt(input.conversationId, 10))
        : eq(conversationChannels.agencyConversationId, input.conversationId);

    const [existing] = await database
      .select({ id: conversationChannels.id })
      .from(conversationChannels)
      .where(
        and(
          convCondition,
          eq(conversationChannels.channelType, "telegram"),
          eq(conversationChannels.state, "active"),
        ),
      )
      .limit(1);

    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This conversation is already bound to Telegram.",
      });
    }

    const channelId = crypto.randomUUID();
    const now = new Date();

    try {
      await database.insert(conversationChannels).values({
        id: channelId,
        tenantId: connection.tenantId,
        chatConversationId:
          input.conversationType === "chat"
            ? parseInt(input.conversationId, 10)
            : null,
        agencyConversationId:
          input.conversationType === "agency" ? input.conversationId : null,
        conversationType: input.conversationType,
        channelType: "telegram",
        channelRefId: connection.telegramChatId,
        connectionId: connection.id,
        syncMode: input.syncMode,
        state: "active",
        createdAt: now,
        updatedAt: now,
      });
    } catch (err: any) {
      if (err?.code === "23505") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This conversation is already bound to Telegram.",
        });
      }
      throw err;
    }

    // Auto-select as active channel
    await database
      .update(telegramConnections)
      .set({ activeChannelId: channelId })
      .where(eq(telegramConnections.id, connection.id));

    return { success: true, channelId };
  });

/**
 * Unbind a conversation from Telegram.
 */
const unbindConversation = protectedProcedure
  .input(
    z.object({
      conversationId: z.string(),
      conversationType: z.enum(["chat", "agency"]).default("chat"),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const database = await getDb();
    if (!database) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    await verifyConversationOwnership(
      database,
      ctx.user.id,
      input.conversationId,
      input.conversationType,
    );

    // Find the active channel binding
    const convCondition =
      input.conversationType === "chat"
        ? eq(conversationChannels.chatConversationId, parseInt(input.conversationId, 10))
        : eq(conversationChannels.agencyConversationId, input.conversationId);

    const [channel] = await database
      .select({
        id: conversationChannels.id,
        connectionId: conversationChannels.connectionId,
      })
      .from(conversationChannels)
      .where(
        and(
          convCondition,
          eq(conversationChannels.channelType, "telegram"),
          eq(conversationChannels.state, "active"),
        ),
      )
      .limit(1);

    if (!channel) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No active Telegram binding for this conversation.",
      });
    }

    // Verify channel belongs to user's connection
    if (channel.connectionId) {
      const [conn] = await database
        .select({ userId: telegramConnections.userId })
        .from(telegramConnections)
        .where(eq(telegramConnections.id, channel.connectionId))
        .limit(1);
      if (!conn || conn.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Channel does not belong to your connection.",
        });
      }
    }

    // Revoke the channel
    await database
      .update(conversationChannels)
      .set({ state: "revoked", updatedAt: new Date() })
      .where(eq(conversationChannels.id, channel.id));

    // Clear activeChannelId if it pointed to this channel
    if (channel.connectionId) {
      const [conn] = await database
        .select({ activeChannelId: telegramConnections.activeChannelId })
        .from(telegramConnections)
        .where(eq(telegramConnections.id, channel.connectionId))
        .limit(1);

      if (conn && conn.activeChannelId === channel.id) {
        await database
          .update(telegramConnections)
          .set({ activeChannelId: null })
          .where(eq(telegramConnections.id, channel.connectionId));
      }
    }

    return { success: true };
  });

/**
 * Admin: List all Telegram connections for the tenant.
 */
const adminListConnections = adminProcedure
  .input(
    z.object({
      status: z.enum(["active", "revoked", "pending", "blocked"]).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .query(async ({ input, ctx }) => {
    const database = await getDb();
    if (!database) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    if (!ctx.user.currentTenantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No tenant context" });
    }
    const tenantId = String(ctx.user.currentTenantId);

    // Build conditions
    const conditions = [eq(telegramConnections.tenantId, tenantId)];
    if (input.status) {
      conditions.push(eq(telegramConnections.status, input.status));
    }

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    // Count total
    const [countResult] = await database
      .select({ total: count() })
      .from(telegramConnections)
      .where(whereClause);

    const total = countResult?.total ?? 0;

    // Fetch paginated data with user info (telegramUserId omitted — internal ID)
    const connections = await database
      .select({
        id: telegramConnections.id,
        userId: telegramConnections.userId,
        telegramUsername: telegramConnections.telegramUsername,
        status: telegramConnections.status,
        linkedAt: telegramConnections.linkedAt,
        revokedAt: telegramConnections.revokedAt,
        userEmail: users.email,
        userName: users.name,
      })
      .from(telegramConnections)
      .leftJoin(users, eq(telegramConnections.userId, users.id))
      .where(whereClause)
      .limit(input.limit)
      .offset(input.offset);

    return { connections, total };
  });

/**
 * Admin: Revoke a Telegram connection and all its channel bindings.
 */
const adminRevokeConnection = adminProcedure
  .input(z.object({ connectionId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const database = await getDb();
    if (!database) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }

    const tenantId = String(ctx.user.currentTenantId ?? "");

    // Verify connection exists, belongs to tenant, and is active
    const [connection] = await database
      .select()
      .from(telegramConnections)
      .where(
        and(
          eq(telegramConnections.id, input.connectionId),
          eq(telegramConnections.tenantId, tenantId),
          eq(telegramConnections.status, "active"),
        ),
      )
      .limit(1);

    if (!connection) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Connection not found",
      });
    }

    const now = new Date();

    // Revoke connection
    await database
      .update(telegramConnections)
      .set({
        status: "revoked",
        revokedAt: now,
        revokedBy: String(ctx.user.id),
      })
      .where(eq(telegramConnections.id, connection.id));

    // Revoke all channel bindings
    await database
      .update(conversationChannels)
      .set({ state: "revoked", updatedAt: now })
      .where(eq(conversationChannels.connectionId, connection.id));

    // Clear legacy user fields for backward compat
    await database
      .update(users)
      .set({
        telegramVerified: false,
        telegramChatId: null,
        telegramUsername: null,
        telegramVerifiedAt: null,
      })
      .where(eq(users.id, connection.userId));

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

  // Chat Bridge endpoints
  getConversationChannelStatus,
  bindConversation,
  unbindConversation,

  // Admin Chat Bridge endpoints
  adminListConnections,
  adminRevokeConnection,
});
