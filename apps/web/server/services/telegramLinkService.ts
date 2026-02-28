/**
 * Telegram Link Service — Handles /start <token> deep link flow.
 *
 * Validates link tokens, creates telegram_connections, optionally binds
 * conversations, and dual-writes legacy user fields for backward compat.
 */

import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import {
  telegramLinkTokens,
  telegramConnections,
  conversationChannels,
  users,
} from "../../drizzle/schema";
import { sendTelegramMessage } from "./telegramService";
import { getMessage } from "./telegramI18n";
import { getRedisClient } from "./redis";
import {
  registerWebhookHandler,
  type WebhookContext,
} from "../routes/telegramWebhook";

/**
 * Handle /start <token> command from Telegram deep link.
 */
async function handleStartLink(ctx: WebhookContext): Promise<void> {
  const { botId, message, chatId, telegramUserId, languageCode, db, botToken } =
    ctx;
  // message.text contains the token (webhook handler strips "/start " prefix)
  const rawToken = message.text?.trim();
  if (!rawToken) {
    await replyChat(botToken, chatId, getMessage("link_failed", languageCode));
    return;
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  try {
    // Look up token by hash
    const [tokenRecord] = await db
      .select()
      .from(telegramLinkTokens)
      .where(eq(telegramLinkTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRecord) {
      await replyChat(botToken, chatId, getMessage("link_failed", languageCode));
      return;
    }

    // Validate token state
    const now = new Date();
    if (tokenRecord.expiresAt < now) {
      await replyChat(
        botToken,
        chatId,
        getMessage("link_expired", languageCode),
      );
      return;
    }
    if (tokenRecord.usedAt) {
      await replyChat(
        botToken,
        chatId,
        getMessage("link_already_used", languageCode),
      );
      return;
    }
    if (tokenRecord.revokedAt) {
      await replyChat(botToken, chatId, getMessage("link_failed", languageCode));
      return;
    }

    // Check for existing active connection
    const [existingConn] = await db
      .select()
      .from(telegramConnections)
      .where(
        and(
          eq(telegramConnections.botId, botId),
          eq(telegramConnections.telegramUserId, telegramUserId),
          eq(telegramConnections.status, "active"),
        ),
      )
      .limit(1);

    if (existingConn) {
      await replyChat(
        botToken,
        chatId,
        getMessage("link_already_linked", languageCode),
      );
      return;
    }

    // Resolve user and tenant
    const [user] = await db
      .select({ id: users.id, currentTenantId: users.currentTenantId })
      .from(users)
      .where(eq(users.id, tokenRecord.userId))
      .limit(1);

    if (!user) {
      await replyChat(botToken, chatId, getMessage("link_failed", languageCode));
      return;
    }

    const tenantId = String(user.currentTenantId);
    const connectionId = crypto.randomUUID();
    let channelId: string | null = null;

    // Transaction: consume token + create connection + optional channel binding + dual-write
    await db.transaction(async (tx: any) => {
      // Mark token as used
      await tx
        .update(telegramLinkTokens)
        .set({ usedAt: now })
        .where(eq(telegramLinkTokens.id, tokenRecord.id));

      // Create connection
      await tx.insert(telegramConnections).values({
        id: connectionId,
        tenantId,
        userId: tokenRecord.userId,
        telegramUserId,
        telegramChatId: chatId,
        telegramUsername: message.from?.username ?? null,
        botId,
        status: "active",
        linkedAt: now,
        linkedBy: "deep_link",
      });

      // Optional conversation binding
      if (
        tokenRecord.targetChatConversationId ||
        tokenRecord.targetAgencyConversationId
      ) {
        channelId = crypto.randomUUID();
        await tx.insert(conversationChannels).values({
          id: channelId,
          tenantId,
          chatConversationId: tokenRecord.targetChatConversationId ?? null,
          agencyConversationId:
            tokenRecord.targetAgencyConversationId ?? null,
          conversationType: tokenRecord.targetConversationType ?? "chat",
          channelType: "telegram",
          channelRefId: chatId,
          connectionId,
          isPrimary: false,
          syncMode: "two_way",
          state: "active",
        });

        // Set activeChannelId on connection
        await tx
          .update(telegramConnections)
          .set({ activeChannelId: channelId })
          .where(eq(telegramConnections.id, connectionId));
      }

      // Dual-write legacy user fields
      await tx
        .update(users)
        .set({
          telegramChatId: chatId,
          telegramUsername: message.from?.username ?? null,
          telegramVerified: true,
          telegramVerifiedAt: now,
        })
        .where(eq(users.id, tokenRecord.userId));
    });

    // Clean up Redis key (non-critical)
    try {
      const redis = getRedisClient();
      await redis.del(`telegram:verify:${rawToken}`);
    } catch {
      // Ignore Redis cleanup failures
    }

    await replyChat(
      botToken,
      chatId,
      getMessage("link_success", languageCode),
    );
  } catch (err) {
    console.error("[TelegramLink] Error handling /start token:", err);
    await replyChat(
      botToken,
      chatId,
      getMessage("error_generic", languageCode),
    );
  }
}

async function replyChat(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    await sendTelegramMessage(botToken, chatId, text, "HTML");
  } catch {
    // Fire-and-forget
  }
}

// Register the handler with the webhook dispatcher
registerWebhookHandler("start_link", handleStartLink);

export { handleStartLink };
