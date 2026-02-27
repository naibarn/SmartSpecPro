/**
 * Telegram Bot Command Handlers
 *
 * Implements /resume, /unlink, /status, /help, /start (no token),
 * and callback query routing for inline keyboard interactions.
 */

import { getMessage } from "../services/telegramI18n";
import {
  sendTelegramMessage,
  answerCallbackQuery,
} from "../services/telegramService";
import {
  telegramConnections,
  conversationChannels,
  conversations,
  agencyConversations,
  users,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { WebhookContext } from "./telegramWebhook";

const APP_URL = "https://smartaihub.app";

// ── Shared helper ─────────────────────────────────────────────────────────

async function findActiveConnection(
  db: any,
  botId: string,
  telegramUserId: string,
): Promise<any | null> {
  const [connection] = await db
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
  return connection ?? null;
}

// ── /help ────────────────────────────────────────────────────────────────

export async function handleHelp(ctx: WebhookContext): Promise<void> {
  const text = getMessage("help_text", ctx.languageCode);
  await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
}

// ── /status ──────────────────────────────────────────────────────────────

export async function handleStatus(ctx: WebhookContext): Promise<void> {
  try {
    const connection = await findActiveConnection(
      ctx.db,
      ctx.botId,
      ctx.telegramUserId,
    );
    if (!connection) {
      const text = getMessage("error_no_connection", ctx.languageCode).replace(
        "{url}",
        APP_URL,
      );
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    if (!connection.activeChannelId) {
      const text = getMessage("status_no_conversation", ctx.languageCode);
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    // Load the active channel binding
    const [channel] = await ctx.db
      .select()
      .from(conversationChannels)
      .where(eq(conversationChannels.id, connection.activeChannelId))
      .limit(1);

    if (!channel) {
      const text = getMessage("status_no_conversation", ctx.languageCode);
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    // Resolve conversation title and details
    let name = "Untitled";
    let count = 0;
    let lastActivity = "-";

    if (channel.conversationType === "chat" && channel.chatConversationId) {
      const [conv] = await ctx.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, channel.chatConversationId))
        .limit(1);
      if (conv) {
        name = conv.title || "Untitled";
        lastActivity = conv.updatedAt
          ? new Date(conv.updatedAt).toLocaleString()
          : "-";
      }
    } else if (
      channel.conversationType === "agency" &&
      channel.agencyConversationId
    ) {
      const [conv] = await ctx.db
        .select()
        .from(agencyConversations)
        .where(eq(agencyConversations.id, channel.agencyConversationId))
        .limit(1);
      if (conv) {
        name = conv.title || "Untitled";
        count = conv.messageCount || 0;
        lastActivity = conv.updatedAt
          ? new Date(conv.updatedAt).toLocaleString()
          : "-";
      }
    }

    const text = getMessage("status_active", ctx.languageCode)
      .replace("{name}", name)
      .replace("{count}", String(count))
      .replace("{lastActivity}", lastActivity);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
  } catch (err) {
    console.error("[TelegramCmd] /status error:", err);
    const text = getMessage("error_generic", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
  }
}

// ── /resume ──────────────────────────────────────────────────────────────

export async function handleResume(ctx: WebhookContext): Promise<void> {
  try {
    const connection = await findActiveConnection(
      ctx.db,
      ctx.botId,
      ctx.telegramUserId,
    );
    if (!connection) {
      const text = getMessage("error_no_connection", ctx.languageCode).replace(
        "{url}",
        APP_URL,
      );
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    // Get all active channel bindings with conversation titles
    const channels = await ctx.db
      .select({
        channelId: conversationChannels.id,
        conversationType: conversationChannels.conversationType,
        chatConversationId: conversationChannels.chatConversationId,
        agencyConversationId: conversationChannels.agencyConversationId,
        chatTitle: conversations.title,
        agencyTitle: agencyConversations.title,
      })
      .from(conversationChannels)
      .leftJoin(
        conversations,
        eq(conversationChannels.chatConversationId, conversations.id),
      )
      .leftJoin(
        agencyConversations,
        eq(
          conversationChannels.agencyConversationId,
          agencyConversations.id,
        ),
      )
      .where(
        and(
          eq(conversationChannels.connectionId, connection.id),
          eq(conversationChannels.state, "active"),
        ),
      );

    if (channels.length === 0) {
      const text = getMessage("resume_no_conversations", ctx.languageCode);
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    const titled = channels.map((ch: any) => ({
      ...ch,
      title: ch.chatTitle ?? ch.agencyTitle ?? "Untitled",
    }));

    if (titled.length === 1) {
      // Auto-select the single conversation
      await ctx.db
        .update(telegramConnections)
        .set({ activeChannelId: titled[0].channelId })
        .where(eq(telegramConnections.id, connection.id));

      const text = getMessage("resume_success", ctx.languageCode).replace(
        "{name}",
        titled[0].title,
      );
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    // Multiple conversations — show inline keyboard
    const replyMarkup = {
      inline_keyboard: titled.map((ch: any, i: number) => [
        {
          text: `${i + 1}. ${ch.title} (${ch.conversationType})`,
          callback_data: `resume:${ch.channelId}`,
        },
      ]),
    };
    const text = getMessage("resume_list_header", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML", replyMarkup);
  } catch (err) {
    console.error("[TelegramCmd] /resume error:", err);
    const text = getMessage("error_generic", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
  }
}

// ── /unlink ──────────────────────────────────────────────────────────────

export async function handleUnlink(ctx: WebhookContext): Promise<void> {
  try {
    const connection = await findActiveConnection(
      ctx.db,
      ctx.botId,
      ctx.telegramUserId,
    );
    if (!connection) {
      const text = getMessage("error_no_connection", ctx.languageCode).replace(
        "{url}",
        APP_URL,
      );
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    const text = getMessage("unlink_confirm", ctx.languageCode);
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "Yes, unlink", callback_data: "unlink_confirm" },
          { text: "Cancel", callback_data: "unlink_cancel" },
        ],
      ],
    };
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML", replyMarkup);
  } catch (err) {
    console.error("[TelegramCmd] /unlink error:", err);
    const text = getMessage("error_generic", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
  }
}

// ── /start (no token) ────────────────────────────────────────────────────

export async function handleStartNoToken(ctx: WebhookContext): Promise<void> {
  try {
    const connection = await findActiveConnection(
      ctx.db,
      ctx.botId,
      ctx.telegramUserId,
    );
    if (!connection) {
      const text = getMessage("start_no_token", ctx.languageCode);
      await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
      return;
    }

    // User is linked — show brief status
    if (connection.activeChannelId) {
      const [channel] = await ctx.db
        .select()
        .from(conversationChannels)
        .where(eq(conversationChannels.id, connection.activeChannelId))
        .limit(1);

      if (channel) {
        let name = "Untitled";
        if (channel.conversationType === "chat" && channel.chatConversationId) {
          const [conv] = await ctx.db
            .select({ title: conversations.title })
            .from(conversations)
            .where(eq(conversations.id, channel.chatConversationId))
            .limit(1);
          if (conv) name = conv.title || "Untitled";
        } else if (channel.agencyConversationId) {
          const [conv] = await ctx.db
            .select({ title: agencyConversations.title })
            .from(agencyConversations)
            .where(eq(agencyConversations.id, channel.agencyConversationId))
            .limit(1);
          if (conv) name = conv.title || "Untitled";
        }

        const statusText = getMessage("status_active", ctx.languageCode)
          .replace("{name}", name)
          .replace("{count}", "0")
          .replace("{lastActivity}", "-");
        await sendTelegramMessage(ctx.botToken, ctx.chatId, statusText, "HTML");
        return;
      }
    }

    const text = getMessage("status_no_conversation", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
  } catch (err) {
    console.error("[TelegramCmd] /start error:", err);
    const text = getMessage("error_generic", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
  }
}

// ── Callback query routing ───────────────────────────────────────────────

export async function handleCallbackQuery(ctx: WebhookContext): Promise<void> {
  const callbackQuery = ctx.update.callback_query;
  if (!callbackQuery?.data) return;

  const data = callbackQuery.data;
  const queryId = callbackQuery.id;

  try {
    if (data === "unlink_confirm" || data === "unlink_cancel") {
      await handleUnlinkCallback(ctx, data, queryId);
    } else if (data.startsWith("resume:")) {
      const channelId = data.slice("resume:".length);
      await handleResumeCallback(ctx, channelId, queryId);
    } else {
      await answerCallbackQuery(ctx.botToken, queryId);
    }
  } catch (err) {
    console.error("[TelegramCmd] callback error:", err);
    await answerCallbackQuery(ctx.botToken, queryId).catch(() => {});
  }
}

// ── Unlink callback handler ──────────────────────────────────────────────

async function handleUnlinkCallback(
  ctx: WebhookContext,
  action: string,
  queryId: string,
): Promise<void> {
  await answerCallbackQuery(ctx.botToken, queryId);

  if (action === "unlink_cancel") {
    const text = getMessage("unlink_cancelled", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
    return;
  }

  // unlink_confirm — revoke connection + channels + legacy fields
  const connection = await findActiveConnection(
    ctx.db,
    ctx.botId,
    ctx.telegramUserId,
  );
  if (!connection) {
    const text = getMessage("error_no_connection", ctx.languageCode).replace(
      "{url}",
      APP_URL,
    );
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
    return;
  }

  // Revoke connection
  await ctx.db
    .update(telegramConnections)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(telegramConnections.id, connection.id));

  // Revoke all channel bindings
  await ctx.db
    .update(conversationChannels)
    .set({ state: "revoked" })
    .where(eq(conversationChannels.connectionId, connection.id));

  // Dual-write: clear legacy user fields
  await ctx.db
    .update(users)
    .set({
      telegramVerified: false,
      telegramChatId: null,
      telegramUsername: null,
      telegramVerifiedAt: null,
    })
    .where(eq(users.id, connection.userId));

  const text = getMessage("unlink_success", ctx.languageCode);
  await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
}

// ── Resume callback handler ──────────────────────────────────────────────

async function handleResumeCallback(
  ctx: WebhookContext,
  channelId: string,
  queryId: string,
): Promise<void> {
  await answerCallbackQuery(ctx.botToken, queryId);

  const connection = await findActiveConnection(
    ctx.db,
    ctx.botId,
    ctx.telegramUserId,
  );
  if (!connection) {
    const text = getMessage("error_no_connection", ctx.languageCode).replace(
      "{url}",
      APP_URL,
    );
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
    return;
  }

  // Verify the channel belongs to this connection
  const [channel] = await ctx.db
    .select()
    .from(conversationChannels)
    .where(
      and(
        eq(conversationChannels.id, channelId),
        eq(conversationChannels.connectionId, connection.id),
        eq(conversationChannels.state, "active"),
      ),
    )
    .limit(1);

  if (!channel) {
    const text = getMessage("error_generic", ctx.languageCode);
    await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
    return;
  }

  // Update activeChannelId
  await ctx.db
    .update(telegramConnections)
    .set({ activeChannelId: channelId })
    .where(eq(telegramConnections.id, connection.id));

  // Get title for confirmation message
  let title = "Untitled";
  if (channel.conversationType === "chat" && channel.chatConversationId) {
    const [conv] = await ctx.db
      .select({ title: conversations.title })
      .from(conversations)
      .where(eq(conversations.id, channel.chatConversationId))
      .limit(1);
    if (conv) title = conv.title || "Untitled";
  } else if (channel.agencyConversationId) {
    const [conv] = await ctx.db
      .select({ title: agencyConversations.title })
      .from(agencyConversations)
      .where(eq(agencyConversations.id, channel.agencyConversationId))
      .limit(1);
    if (conv) title = conv.title || "Untitled";
  }

  const text = getMessage("resume_success", ctx.languageCode).replace(
    "{name}",
    title,
  );
  await sendTelegramMessage(ctx.botToken, ctx.chatId, text, "HTML");
}
