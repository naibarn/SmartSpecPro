/**
 * Shared TypeScript interfaces for the Chat Bridge message contracts.
 *
 * These types flow between: webhook handler → channel gateway → delivery queue → pipeline hooks.
 * Placed in shared/ so both server and client code can reference them.
 */

/** Attachment placeholder — Phase 1 supports text only, but the type is future-proof. */
export interface Attachment {
  type: "image" | "document" | "audio" | "video";
  url: string;
  mimeType?: string;
  fileName?: string;
}

/**
 * Normalized inbound event from an external channel (Telegram, future: LINE, WhatsApp).
 * Created by the webhook handler and consumed by channelGateway.ingest().
 */
export interface ChatIngressEvent {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** Event classification */
  eventType: "user_message" | "command" | "callback";
  /** Tenant context (from telegram_connections) */
  tenantId: string;
  /** SmartSpecPro user ID */
  userId: number;
  /** Target conversation ID (string for both chat integer IDs and agency UUID IDs) */
  conversationId: string;
  /** Which pipeline to route to */
  conversationType: "chat" | "agency";
  /** Channel metadata */
  channel: {
    type: "web" | "telegram";
    connectionId?: string;
    externalChatId?: string;
    externalMessageId?: string;
  };
  /** Message content */
  message: {
    text: string;
    attachments: Attachment[];
  };
  /** Idempotency key for deduplication (e.g., "tg:{botId}:{updateId}") */
  idempotencyKey: string;
}

/**
 * Outbound fan-out event. Created after a canonical message is saved,
 * triggers delivery to all active channel bindings for the conversation.
 */
export interface ChatEgressEvent {
  /** Unique event ID (UUID v4) */
  eventId: string;
  /** Conversation that generated the response */
  conversationId: string;
  /** Pipeline that produced the message */
  conversationType: "chat" | "agency";
  /** Canonical message ID (string — may be integer or bigint depending on pipeline) */
  messageId: string;
  /** Tenant for scoping */
  tenantId: string;
  /** Resolved delivery targets (from conversation_channels query) */
  targets: ChatEgressTarget[];
  /** Pre-rendered content for delivery */
  rendering: {
    /** Plain text version of the message */
    plainText: string;
    /** HTML-formatted version for Telegram */
    html?: string;
    /** URL for "View full message" link when content is truncated */
    truncatedWebUrl?: string;
  };
}

export interface ChatEgressTarget {
  channelType: "web" | "telegram";
  /** External reference (e.g., Telegram chat_id) */
  channelRefId: string;
  /** Delivery mode for this binding */
  syncMode: "two_way" | "notify_only";
}

/**
 * Data payload for a BullMQ job in the telegram-delivery queue.
 * Created by channelGateway, processed by the delivery worker.
 */
export interface DeliveryJob {
  /** channel_messages.id — used for status tracking */
  channelMessageId: string;
  /** Telegram chat_id for delivery */
  chatId: string;
  /** HTML-formatted message content */
  text: string;
  /** Always "HTML" for Telegram */
  parseMode: "HTML";
  /** Optional: for threading replies */
  replyToMessageId?: string;
  /** For logging and tracing */
  conversationId: string;
  /** For tenant-scoped metrics */
  tenantId: string;
}
