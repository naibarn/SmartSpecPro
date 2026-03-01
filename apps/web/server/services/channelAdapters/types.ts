/**
 * ChannelAdapter — Interface for external messaging channel integrations.
 *
 * Each adapter handles the platform-specific protocol details while the
 * channelGateway and deliveryQueue work with this abstraction.
 */

import type { Attachment } from "@shared/channelTypes";

export interface ChannelCapabilities {
  /** Maximum message length before splitting is required */
  maxMessageLength: number;
  /** Whether the platform supports inline buttons/keyboards */
  supportsButtons: boolean;
  /** Whether the platform supports rich text (HTML/Markdown) */
  supportsRichText: boolean;
  /** Whether the platform supports media attachments */
  supportsAttachments: boolean;
  /** Platform-specific rate limits (messages per second) */
  rateLimitPerSecond: number;
}

export interface IncomingWebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  params: Record<string, string>;
}

/**
 * Channel-specific event data extracted from the webhook payload.
 *
 * NOTE: This is intentionally narrower than ChatIngressEvent. The adapter
 * only knows channel-level data (chatId, messageId, text). Tenant context
 * (tenantId, userId) is populated by the webhook router after a DB connection
 * lookup — the adapter must not and cannot know these values at parse time.
 */
export interface ParsedInboundEvent {
  eventType: "user_message" | "command" | "callback";
  channel: {
    type: string;
    connectionId?: string;
    externalChatId?: string;
    externalMessageId?: string;
  };
  message: {
    text: string;
    attachments: Attachment[];
  };
}

export interface ParsedInbound {
  /** Channel-specific data extracted from the webhook payload */
  event: ParsedInboundEvent;
  /** Platform-specific dedup key (e.g., "tg:{botId}:{updateId}") */
  dedupKey: string;
}

export interface SendMessageOptions {
  parseMode?: "HTML" | "Markdown";
  replyMarkup?: unknown;
  replyToMessageId?: string;
}

export interface ChannelAdapter {
  /** Unique channel type identifier (e.g., "telegram", "whatsapp", "line") */
  readonly channelType: string;

  /** Platform capabilities and limits */
  readonly capabilities: ChannelCapabilities;

  /**
   * Validate an incoming webhook request (signature/secret verification).
   * Must use timing-safe comparison for HMAC/secret checks.
   * @returns true if the request is authentic
   */
  validateWebhook(req: IncomingWebhookRequest): Promise<boolean>;

  /**
   * Parse the raw webhook body into a normalized ParsedInbound.
   * @returns The parsed event, or null if the message should be ignored
   *          (e.g., non-text media that isn't supported yet)
   */
  parseInbound(body: unknown, connectionId: string): Promise<ParsedInbound | null>;

  /**
   * Send a message to an external chat via this channel.
   * @param config - Channel-specific configuration (bot token, API keys, etc.)
   * @param externalChatId - The platform's chat/conversation identifier
   * @param text - The message content
   * @param options - Optional: reply markup, parse mode, etc.
   * @returns External message ID if available
   */
  sendMessage(
    config: Record<string, unknown>,
    externalChatId: string,
    text: string,
    options?: SendMessageOptions,
  ): Promise<{ ok: boolean; externalMessageId?: string }>;

  /**
   * Format and split a message according to platform limits.
   * @returns Array of message chunks, each within the platform's size limit
   */
  formatMessage(text: string): string[];

  /**
   * Optional: Initialize adapter resources (connections, caches).
   * Called once at application startup.
   */
  initialize?(): Promise<void>;

  /**
   * Optional: Clean up adapter resources.
   * Called during graceful shutdown.
   */
  shutdown?(): Promise<void>;
}
