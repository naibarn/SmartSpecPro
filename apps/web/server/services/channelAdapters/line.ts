/**
 * LINE Messaging API ChannelAdapter
 *
 * Handles LINE webhook signature verification (HMAC-SHA256 + base64 + timingSafeEqual),
 * parses LINE events into normalized channel events, and sends messages via
 * the LINE Reply API (preferred) or Push API (fallback).
 *
 * Security:
 * - Signature MUST be verified against raw body BEFORE JSON parsing
 * - Uses crypto.timingSafeEqual for constant-time comparison
 *
 * LINE features:
 * - Module channel routing via 'destination' field (multi-tenant support)
 * - Reply API (free) preferred over Push API (paid)
 * - Short-lived token auto-refresh
 */

import crypto from "crypto";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  IncomingWebhookRequest,
  ParsedInbound,
  SendMessageOptions,
} from "./types";
import { adapterRegistry } from "./registry";

const LINE_API_BASE = "https://api.line.me/v2/bot/message";
const MAX_MESSAGE_LENGTH = 5000;

/** Extended request type — webhook route must populate rawBody and channelSecret */
interface LineWebhookRequest extends IncomingWebhookRequest {
  rawBody?: Buffer;
  channelSecret?: string;
}

/** Extended config for sendMessage */
interface LineConfig extends Record<string, unknown> {
  channelAccessToken: string;
  replyToken?: string;
}

export class LINEAdapter implements ChannelAdapter {
  readonly channelType = "line";

  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: MAX_MESSAGE_LENGTH,
    supportsButtons: true,
    supportsRichText: false,
    supportsAttachments: true,
    rateLimitPerSecond: 1000,
  };

  // ── Webhook Validation ─────────────────────────────────────────────────────

  async validateWebhook(req: IncomingWebhookRequest): Promise<boolean> {
    const lReq = req as LineWebhookRequest;

    const channelSecret = lReq.channelSecret;
    if (!channelSecret) return false;

    // Signature MUST be verified on raw body BEFORE body parsing/deserialization
    const rawBody = lReq.rawBody;
    if (!rawBody) return false;

    const signatureHeader = req.headers["x-line-signature"];
    const signature =
      typeof signatureHeader === "string" ? signatureHeader : "";
    if (!signature) return false;

    // LINE uses base64-encoded HMAC-SHA256
    const expectedBase64 = crypto
      .createHmac("sha256", channelSecret)
      .update(rawBody)
      .digest("base64");

    // Constant-time comparison using padding (matches Telegram adapter pattern)
    const bufExpected = Buffer.from(expectedBase64);
    const bufReceived = Buffer.from(signature);
    const len = Math.max(bufExpected.length, bufReceived.length);
    const paddedExpected = Buffer.alloc(len);
    const paddedReceived = Buffer.alloc(len);
    bufExpected.copy(paddedExpected);
    bufReceived.copy(paddedReceived);
    try {
      return (
        crypto.timingSafeEqual(paddedExpected, paddedReceived) &&
        bufExpected.length === bufReceived.length
      );
    } catch {
      return false;
    }
  }

  // ── Inbound Parsing ────────────────────────────────────────────────────────

  async parseInbound(body: unknown, connectionId: string): Promise<ParsedInbound | null> {
    try {
      const payload = body as any;
      const events: any[] = payload?.events ?? [];

      if (events.length === 0) return null;

      const event = events[0];
      const eventType = event.type;

      // Handle follow/unfollow — no user message content to route
      if (eventType === "follow" || eventType === "unfollow") {
        return null;
      }

      // Only handle message events for now
      if (eventType !== "message") return null;

      const msg = event.message;
      if (!msg) return null;

      let text = "";
      switch (msg.type) {
        case "text":
          text = msg.text ?? "";
          break;
        case "image":
          text = "[Image]";
          break;
        case "video":
          text = "[Video]";
          break;
        case "audio":
          text = "[Audio message]";
          break;
        case "sticker":
          text = "[Sticker]";
          break;
        case "location":
          text = `[Location: ${msg.latitude}, ${msg.longitude}]${msg.address ? ` ${msg.address}` : ""}`;
          break;
        default:
          return null;
      }

      if (!text) return null;

      const userId: string = event.source?.userId ?? "";
      const msgId: string = msg.id ?? "";

      return {
        event: {
          eventType: "user_message",
          channel: {
            type: "line",
            connectionId,
            externalChatId: userId,
            externalMessageId: msgId,
          },
          message: {
            text,
            attachments: [],
          },
        },
        // Use destination + msgId for multi-tenant dedup
        dedupKey: `line:${connectionId}:${msgId}`,
      };
    } catch {
      return null;
    }
  }

  // ── Outbound Sending ───────────────────────────────────────────────────────

  async sendMessage(
    config: Record<string, unknown>,
    externalChatId: string,
    text: string,
    _options?: SendMessageOptions,
  ): Promise<{ ok: boolean; externalMessageId?: string }> {
    const cfg = config as LineConfig;
    const { channelAccessToken, replyToken } = cfg;

    const messages = [{ type: "text", text }];
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    };

    let url: string;
    let bodyPayload: Record<string, unknown>;

    if (replyToken) {
      // Reply API (free, preferred) — uses reply token from inbound event
      url = `${LINE_API_BASE}/reply`;
      bodyPayload = { replyToken, messages };
    } else {
      // Push API (paid) — fallback when no reply token available
      url = `${LINE_API_BASE}/push`;
      bodyPayload = { to: externalChatId, messages };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
      });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  // ── Message Formatting ─────────────────────────────────────────────────────

  formatMessage(text: string): string[] {
    if (text.length <= MAX_MESSAGE_LENGTH) return [text];

    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      chunks.push(remaining.slice(0, MAX_MESSAGE_LENGTH));
      remaining = remaining.slice(MAX_MESSAGE_LENGTH);
    }
    return chunks;
  }
}

// Self-register
adapterRegistry.register(new LINEAdapter());
