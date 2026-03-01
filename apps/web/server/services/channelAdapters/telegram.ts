/**
 * Telegram ChannelAdapter
 *
 * Extracts Telegram-specific logic into the ChannelAdapter interface.
 * Validates webhooks via X-Telegram-Bot-Api-Secret-Token header,
 * parses Telegram updates into normalized events, and delegates
 * sending to the existing sendTelegramMessage function.
 */

import crypto from "crypto";
import { eq } from "drizzle-orm";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  IncomingWebhookRequest,
  ParsedInbound,
  SendMessageOptions,
} from "./types";
import { adapterRegistry } from "./registry";
import { sendTelegramMessage } from "../telegramService";
import { decrypt } from "../crypto";
import { renderForTelegram } from "../telegramRendering";
import { getDb } from "../../db";
import { systemSettings } from "../../../drizzle/schema";

// ── Webhook secret cache ────────────────────────────────────────────────────

let cachedWebhookSecret: string | null = null;
let webhookSecretExpiry = 0;
const WEBHOOK_SECRET_CACHE_TTL = 60_000; // 1 minute

async function getWebhookSecret(): Promise<string | null> {
  const now = Date.now();
  if (cachedWebhookSecret && now < webhookSecretExpiry) {
    return cachedWebhookSecret;
  }

  const db = await getDb();
  if (!db) return null;

  const settings = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.category, "telegram"));

  const settingsMap = new Map(settings.map((s: any) => [s.key, s.value]));
  const webhookSecretEncrypted = settingsMap.get("webhook_secret");
  if (!webhookSecretEncrypted) return null;

  try {
    cachedWebhookSecret = decrypt(webhookSecretEncrypted);
    webhookSecretExpiry = now + WEBHOOK_SECRET_CACHE_TTL;
    return cachedWebhookSecret;
  } catch {
    return null;
  }
}

/** For testing: clear the webhook secret cache */
export function _clearTelegramAdapterCache(): void {
  cachedWebhookSecret = null;
  webhookSecretExpiry = 0;
}

// ── Timing-safe comparison ──────────────────────────────────────────────────

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const len = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.alloc(len);
  const paddedB = Buffer.alloc(len);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  return crypto.timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

// ── Adapter implementation ──────────────────────────────────────────────────

class TelegramAdapter implements ChannelAdapter {
  readonly channelType = "telegram";

  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: 4096,
    supportsButtons: true,
    supportsRichText: true,
    supportsAttachments: false,
    rateLimitPerSecond: 25,
  };

  async validateWebhook(req: IncomingWebhookRequest): Promise<boolean> {
    const secretHeader = req.headers["x-telegram-bot-api-secret-token"];
    const secretValue = typeof secretHeader === "string" ? secretHeader : "";
    if (!secretValue) return false;

    const webhookSecret = await getWebhookSecret();
    if (!webhookSecret) return false;

    return timingSafeCompare(secretValue, webhookSecret);
  }

  async parseInbound(body: unknown, connectionId: string): Promise<ParsedInbound | null> {
    const update = body as any;
    if (!update || typeof update !== "object") return null;

    const updateId = update.update_id;
    if (!updateId) return null;

    // Callback queries — not supported in this adapter version
    if (update.callback_query) return null;

    const message = update.message;
    if (!message) return null;

    // Non-text messages are not supported
    if (
      !message.text &&
      (message.photo || message.voice || message.sticker ||
        message.document || message.video || message.audio)
    ) {
      return null;
    }

    if (!message.text) return null;

    const chatId = String(message.chat?.id ?? "");
    const messageId = String(message.message_id ?? "");

    return {
      event: {
        eventType: message.text.startsWith("/") ? "command" : "user_message",
        channel: {
          type: "telegram",
          connectionId,
          externalChatId: chatId,
          externalMessageId: messageId,
        },
        message: {
          text: message.text,
          attachments: [],
        },
      },
      dedupKey: `tg:${connectionId}:${updateId}`,
    };
  }

  async sendMessage(
    config: Record<string, unknown>,
    externalChatId: string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<{ ok: boolean; externalMessageId?: string }> {
    const botToken = config.botToken as string;
    const result = await sendTelegramMessage(
      botToken,
      externalChatId,
      text,
      options?.parseMode || "HTML",
    );
    return {
      ok: result.ok,
      externalMessageId: result.messageId != null ? String(result.messageId) : undefined,
    };
  }

  formatMessage(text: string): string[] {
    return renderForTelegram(text);
  }
}

// Self-register
adapterRegistry.register(new TelegramAdapter());
