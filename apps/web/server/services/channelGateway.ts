/**
 * Channel Gateway Service
 *
 * Transport-agnostic message bus that normalizes inbound messages
 * from external channels (Telegram, future LINE/WhatsApp) into
 * the existing chat or agency pipelines, and fans out outbound
 * assistant responses to all active channel bindings.
 */

import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import {
  telegramConnections,
  conversationChannels,
  channelMessages,
} from "../../drizzle/schema";
import type {
  ChatIngressEvent,
  ChatEgressEvent,
  DeliveryJob,
} from "@shared/channelTypes";
import { enqueueDelivery } from "./deliveryQueue";
import { sendTelegramMessage } from "./telegramService";
import { getMessage } from "./telegramI18n";
import { inArray } from "drizzle-orm";

// ── Result types ──────────────────────────────────────────────────────────

export interface IngestResult {
  ok: boolean;
  error?: string;
  errorCode?: "no_connection" | "revoked" | "no_channel" | "pipeline_error";
  responseMessageId?: string;
}

// ── Inbound: ingest ───────────────────────────────────────────────────────

async function ingest(event: ChatIngressEvent): Promise<IngestResult> {
  try {
    const connectionId = event.channel.connectionId;
    if (!connectionId) {
      return { ok: false, error: "Missing connectionId", errorCode: "no_connection" };
    }

    // 1. Validate connection
    const [connection] = await db
      .select()
      .from(telegramConnections)
      .where(eq(telegramConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      return { ok: false, error: "Connection not found", errorCode: "no_connection" };
    }

    if (connection.status !== "active") {
      return { ok: false, error: "Connection revoked", errorCode: "revoked" };
    }

    // 2. Resolve active channel
    if (!connection.activeChannelId) {
      return {
        ok: false,
        error: "No conversation bound",
        errorCode: "no_channel",
      };
    }

    // 3. Load channel binding
    const [channel] = await db
      .select()
      .from(conversationChannels)
      .where(
        and(
          eq(conversationChannels.id, connection.activeChannelId),
          eq(conversationChannels.state, "active"),
        ),
      )
      .limit(1);

    if (!channel) {
      return {
        ok: false,
        error: "Channel binding not active",
        errorCode: "no_channel",
      };
    }

    // 4. Route by conversation type
    // Section-07 (processMessageServerSide) and section-08 (pipeline hooks)
    // will fill in actual LLM processing. For now, the gateway validates
    // the routing path and returns success.
    if (channel.conversationType === "chat" && channel.chatConversationId) {
      // Chat pipeline stub — section-07 implements processMessageServerSide()
      console.info(
        "[ChannelGateway] Route to chat pipeline:",
        channel.chatConversationId,
      );
    } else if (
      channel.conversationType === "agency" &&
      channel.agencyConversationId
    ) {
      // Agency pipeline — route through agencyBridge
      console.info(
        "[ChannelGateway] Route to agency pipeline:",
        channel.agencyConversationId,
      );
    } else {
      return {
        ok: false,
        error: "Invalid channel configuration",
        errorCode: "pipeline_error",
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("[ChannelGateway] Ingest error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
      errorCode: "pipeline_error",
    };
  }
}

// ── Outbound: emitEgress ──────────────────────────────────────────────────

async function emitEgress(event: ChatEgressEvent): Promise<void> {
  try {
    // 1. Query active Telegram bindings for this conversation
    const bindings = await queryActiveBindings(event);

    if (bindings.length === 0) {
      // Web-only conversation — no external delivery needed
      return;
    }

    // 2. For each Telegram binding, create channel_messages record and enqueue
    for (const binding of bindings) {
      if (!binding.channelRefId) {
        console.warn("[ChannelGateway] Skipping binding with null channelRefId:", binding.id);
        continue;
      }

      const channelMessageId = crypto.randomUUID();

      // Create tracking record
      await db.insert(channelMessages).values({
        id: channelMessageId,
        tenantId: event.tenantId,
        conversationChannelId: binding.id,
        messageId: event.messageId,
        messageType: event.conversationType,
        channelType: "telegram",
        externalChatId: binding.channelRefId,
        deliveryStatus: "pending",
      });

      // Build delivery job with deterministic ID for dedup
      const text = event.rendering.html || event.rendering.plainText;
      const chunks = splitForTelegram(text);

      for (let i = 0; i < chunks.length; i++) {
        const job: DeliveryJob = {
          channelMessageId,
          chatId: binding.channelRefId,
          text: chunks[i],
          parseMode: "HTML",
          conversationId: event.conversationId,
          tenantId: event.tenantId,
        };

        await enqueueDelivery(job);
      }
    }
  } catch (err) {
    // Log but don't propagate — failed delivery should not break the web UI
    console.error("[ChannelGateway] emitEgress error:", err);
  }
}

/** Query conversation_channels for active Telegram bindings with syncMode filter */
async function queryActiveBindings(event: ChatEgressEvent) {
  if (event.conversationType === "chat") {
    const convId = parseInt(event.conversationId, 10);
    if (isNaN(convId)) {
      console.error("[ChannelGateway] Invalid chat conversationId:", event.conversationId);
      return [];
    }
    return db
      .select()
      .from(conversationChannels)
      .where(
        and(
          eq(conversationChannels.chatConversationId, convId),
          eq(conversationChannels.channelType, "telegram"),
          eq(conversationChannels.state, "active"),
          inArray(conversationChannels.syncMode, ["two_way", "notify_only"]),
        ),
      );
  } else {
    return db
      .select()
      .from(conversationChannels)
      .where(
        and(
          eq(conversationChannels.agencyConversationId, event.conversationId),
          eq(conversationChannels.channelType, "telegram"),
          eq(conversationChannels.state, "active"),
          inArray(conversationChannels.syncMode, ["two_way", "notify_only"]),
        ),
      );
  }
}

/** Split text at 4096-char Telegram limit boundaries */
function splitForTelegram(text: string): string[] {
  const MAX_LEN = 4096;
  if (text.length <= MAX_LEN) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    // Try to split at last newline within limit
    const sliceEnd = remaining.lastIndexOf("\n", MAX_LEN);
    const splitAt = sliceEnd > MAX_LEN * 0.5 ? sliceEnd : MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

// ── Typing indicator ──────────────────────────────────────────────────────

function sendTypingLoop(
  chatId: string,
  botToken: string,
): { stop: () => void } {
  const url = `https://api.telegram.org/bot${botToken}/sendChatAction`;
  const body = JSON.stringify({ chat_id: chatId, action: "typing" });

  const doSend = () => {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {
      // Best-effort — typing indicator failures are non-critical
    });
  };

  // Fire immediately, then repeat every 4 seconds
  doSend();
  const interval = setInterval(doSend, 4000);

  return {
    stop() {
      clearInterval(interval);
    },
  };
}

// ── Non-text message handling ─────────────────────────────────────────────

async function handleNonTextMessage(
  chatId: string,
  botToken: string,
  languageCode?: string,
): Promise<void> {
  const text = getMessage("error_text_only", languageCode);
  try {
    await sendTelegramMessage(botToken, chatId, text, "HTML");
  } catch {
    // Fire-and-forget
  }
}

// ── Export ─────────────────────────────────────────────────────────────────

export const channelGateway = {
  ingest,
  emitEgress,
  sendTypingLoop,
  handleNonTextMessage,
};
