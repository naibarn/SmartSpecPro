import { describe, it, expect } from "vitest";
import {
  telegramConnections,
  conversationChannels,
  channelMessages,
  telegramLinkTokens,
  telegramUpdates,
  messages,
  conversations,
} from "../../../drizzle/schema";

/**
 * Schema shape tests for the 5 new Chat Bridge tables and column extensions.
 *
 * Asserts Drizzle table metadata objects without a live database.
 * Constraint enforcement (UNIQUE, CHECK, CASCADE) is tested in section-11.
 */

describe("telegramConnections table", () => {
  it("has all required columns", () => {
    expect(telegramConnections.id).toBeDefined();
    expect(telegramConnections.tenantId).toBeDefined();
    expect(telegramConnections.userId).toBeDefined();
    expect(telegramConnections.telegramUserId).toBeDefined();
    expect(telegramConnections.telegramChatId).toBeDefined();
    expect(telegramConnections.telegramUsername).toBeDefined();
    expect(telegramConnections.botId).toBeDefined();
    expect(telegramConnections.status).toBeDefined();
    expect(telegramConnections.activeChannelId).toBeDefined();
    expect(telegramConnections.linkedAt).toBeDefined();
    expect(telegramConnections.linkedBy).toBeDefined();
    expect(telegramConnections.revokedAt).toBeDefined();
    expect(telegramConnections.revokedBy).toBeDefined();
    expect(telegramConnections.lastSeenAt).toBeDefined();
    expect(telegramConnections.metadata).toBeDefined();
  });

  it("has correct table name", () => {
    expect(
      (telegramConnections as any)[Symbol.for("drizzle:Name")],
    ).toBe("telegram_connections");
  });
});

describe("conversationChannels table", () => {
  it("has all required columns", () => {
    expect(conversationChannels.id).toBeDefined();
    expect(conversationChannels.tenantId).toBeDefined();
    expect(conversationChannels.chatConversationId).toBeDefined();
    expect(conversationChannels.agencyConversationId).toBeDefined();
    expect(conversationChannels.conversationType).toBeDefined();
    expect(conversationChannels.channelType).toBeDefined();
    expect(conversationChannels.channelRefId).toBeDefined();
    expect(conversationChannels.connectionId).toBeDefined();
    expect(conversationChannels.isPrimary).toBeDefined();
    expect(conversationChannels.syncMode).toBeDefined();
    expect(conversationChannels.state).toBeDefined();
    expect(conversationChannels.createdAt).toBeDefined();
    expect(conversationChannels.updatedAt).toBeDefined();
  });

  it("has correct table name", () => {
    expect(
      (conversationChannels as any)[Symbol.for("drizzle:Name")],
    ).toBe("conversation_channels");
  });
});

describe("channelMessages table", () => {
  it("has all required columns", () => {
    expect(channelMessages.id).toBeDefined();
    expect(channelMessages.tenantId).toBeDefined();
    expect(channelMessages.conversationChannelId).toBeDefined();
    expect(channelMessages.messageId).toBeDefined();
    expect(channelMessages.messageType).toBeDefined();
    expect(channelMessages.channelType).toBeDefined();
    expect(channelMessages.externalMessageId).toBeDefined();
    expect(channelMessages.externalChatId).toBeDefined();
    expect(channelMessages.deliveryStatus).toBeDefined();
    expect(channelMessages.attemptCount).toBeDefined();
    expect(channelMessages.lastAttemptAt).toBeDefined();
    expect(channelMessages.deliveredAt).toBeDefined();
    expect(channelMessages.failureCode).toBeDefined();
    expect(channelMessages.failureReason).toBeDefined();
    expect(channelMessages.metadata).toBeDefined();
  });

  it("has correct table name", () => {
    expect(
      (channelMessages as any)[Symbol.for("drizzle:Name")],
    ).toBe("channel_messages");
  });
});

describe("telegramLinkTokens table", () => {
  it("has all required columns", () => {
    expect(telegramLinkTokens.id).toBeDefined();
    expect(telegramLinkTokens.tenantId).toBeDefined();
    expect(telegramLinkTokens.userId).toBeDefined();
    expect(telegramLinkTokens.targetChatConversationId).toBeDefined();
    expect(telegramLinkTokens.targetAgencyConversationId).toBeDefined();
    expect(telegramLinkTokens.targetConversationType).toBeDefined();
    expect(telegramLinkTokens.purpose).toBeDefined();
    expect(telegramLinkTokens.tokenHash).toBeDefined();
    expect(telegramLinkTokens.expiresAt).toBeDefined();
    expect(telegramLinkTokens.usedAt).toBeDefined();
    expect(telegramLinkTokens.revokedAt).toBeDefined();
    expect(telegramLinkTokens.createdAt).toBeDefined();
    expect(telegramLinkTokens.createdBy).toBeDefined();
    expect(telegramLinkTokens.metadata).toBeDefined();
  });

  it("has correct table name", () => {
    expect(
      (telegramLinkTokens as any)[Symbol.for("drizzle:Name")],
    ).toBe("telegram_link_tokens");
  });
});

describe("telegramUpdates table", () => {
  it("has all required columns", () => {
    expect(telegramUpdates.id).toBeDefined();
    expect(telegramUpdates.botId).toBeDefined();
    expect(telegramUpdates.updateId).toBeDefined();
    expect(telegramUpdates.telegramChatId).toBeDefined();
    expect(telegramUpdates.receivedAt).toBeDefined();
    expect(telegramUpdates.processedAt).toBeDefined();
    expect(telegramUpdates.processingStatus).toBeDefined();
    expect(telegramUpdates.errorCode).toBeDefined();
    expect(telegramUpdates.errorReason).toBeDefined();
  });

  it("has correct table name", () => {
    expect(
      (telegramUpdates as any)[Symbol.for("drizzle:Name")],
    ).toBe("telegram_updates");
  });
});

describe("messages table extensions", () => {
  it("has new sourceChannel column", () => {
    expect(messages.sourceChannel).toBeDefined();
  });

  it("has new sourceConnectionId column", () => {
    expect(messages.sourceConnectionId).toBeDefined();
  });

  it("has new externalSourceId column", () => {
    expect(messages.externalSourceId).toBeDefined();
  });
});

describe("conversations table extensions", () => {
  it("has new defaultChannelPolicy column", () => {
    expect(conversations.defaultChannelPolicy).toBeDefined();
  });
});
