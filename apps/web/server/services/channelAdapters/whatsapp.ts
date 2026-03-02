/**
 * WhatsApp Cloud API ChannelAdapter
 *
 * IMPORTANT: Uses ONLY the official Meta Cloud API (HTTP calls).
 * whatsapp-web.js is BANNED — it violates Meta's Terms of Service.
 *
 * Security:
 * - Webhook signature verified with HMAC-SHA256 + timingSafeEqual (constant-time)
 * - Raw body buffer required for accurate HMAC computation
 * - Phone numbers hashed for PII storage (actual number stored encrypted in config)
 *
 * Messaging rules:
 * - 24-hour customer service window: free-form messages only within 24h of last inbound
 * - Outside window: must use pre-approved template messages (explicit templateName required)
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

const WHATSAPP_API_VERSION = "v21.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4096;

/** Extended request type — webhook route must populate rawBody and appSecret */
interface WhatsAppWebhookRequest extends IncomingWebhookRequest {
  rawBody?: Buffer;
  appSecret?: string;
}

/** Extended config for sendMessage */
interface WhatsAppConfig extends Record<string, unknown> {
  accessToken: string;
  phoneNumberId: string;
  lastInboundAt?: number;
  templateName?: string;
  templateLanguage?: string;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channelType = "whatsapp";

  readonly capabilities: ChannelCapabilities = {
    maxMessageLength: MAX_MESSAGE_LENGTH,
    supportsButtons: true,
    supportsRichText: false,
    supportsAttachments: true,
    rateLimitPerSecond: 80,
  };

  // ── Webhook Validation ─────────────────────────────────────────────────────

  async validateWebhook(req: IncomingWebhookRequest): Promise<boolean> {
    const wReq = req as WhatsAppWebhookRequest;

    const appSecret = wReq.appSecret;
    if (!appSecret) return false;

    const rawBody = wReq.rawBody;
    if (!rawBody) return false;

    const signatureHeader = req.headers["x-hub-signature-256"];
    const signature =
      typeof signatureHeader === "string" ? signatureHeader : "";
    if (!signature) return false;

    // Compute expected HMAC-SHA256
    const expectedHex = crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

    const receivedHex = signature.startsWith("sha256=")
      ? signature.slice(7)
      : signature;

    // Constant-time comparison using padding (matches Telegram adapter pattern)
    const bufExpected = Buffer.from(expectedHex);
    const bufReceived = Buffer.from(receivedHex);
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
      const entry = payload?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (!value) return null;

      // Status-only webhooks — no user message
      if (!value.messages || value.messages.length === 0) return null;

      const msg = value.messages[0];
      const from = msg.from ?? "";
      const msgId = msg.id ?? "";
      const msgType = msg.type ?? "unknown";

      let text = "";
      switch (msgType) {
        case "text":
          text = msg.text?.body ?? "";
          break;
        case "image":
          text = msg.image?.caption ? `[Image] ${msg.image.caption}` : "[Image]";
          break;
        case "audio":
          text = "[Voice message]";
          break;
        case "video":
          text = msg.video?.caption ? `[Video] ${msg.video.caption}` : "[Video]";
          break;
        case "document":
          text = msg.document?.filename
            ? `[Document: ${msg.document.filename}]`
            : "[Document]";
          break;
        case "location":
          text = `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
          break;
        default:
          return null;
      }

      if (!text) return null;

      return {
        event: {
          eventType: "user_message",
          channel: {
            type: "whatsapp",
            connectionId,
            externalChatId: from,
            externalMessageId: msgId,
          },
          message: {
            text,
            attachments: [],
          },
        },
        dedupKey: `wa:${connectionId}:${msgId}`,
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
    const cfg = config as WhatsAppConfig;
    const { accessToken, phoneNumberId, lastInboundAt, templateName, templateLanguage } = cfg;

    // Validate lastInboundAt — reject future timestamps (prevents policy bypass)
    const now = Date.now();
    const isWithinWindow =
      lastInboundAt != null &&
      lastInboundAt <= now &&
      now - lastInboundAt < WINDOW_24H_MS;

    const url = `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`;
    let bodyPayload: Record<string, unknown>;

    if (isWithinWindow) {
      // Free-form text message (within 24h window)
      bodyPayload = {
        messaging_product: "whatsapp",
        to: externalChatId,
        type: "text",
        text: { body: text },
      };
    } else {
      // Template message (out-of-window) — require explicit template configuration
      if (!templateName) {
        return { ok: false };
      }
      bodyPayload = {
        messaging_product: "whatsapp",
        to: externalChatId,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage ?? "en" },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text }],
            },
          ],
        },
      };
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(bodyPayload),
      });

      let externalMessageId: string | undefined;
      try {
        const data = await response.json() as any;
        externalMessageId = data?.messages?.[0]?.id;
      } catch {
        // Non-JSON response body — ignore
      }

      return { ok: response.ok, externalMessageId };
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
adapterRegistry.register(new WhatsAppAdapter());
