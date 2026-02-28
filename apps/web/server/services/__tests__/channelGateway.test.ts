import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockSelect,
  mockInsert,
  mockUpdate,
  mockEnqueueDelivery,
  mockSendTelegramMessage,
  mockGetMessage,
  mockGetConversationById,
  mockCreateMessage,
  mockBuildChatContext,
  mockUpdateConversationCredits,
  mockExecuteWithFallback,
  mockHasEnoughCredits,
  mockDeductCreditsForModel,
  mockCalculateCreditsForLLM,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockEnqueueDelivery: vi.fn().mockResolvedValue(undefined),
  mockSendTelegramMessage: vi
    .fn()
    .mockResolvedValue({ ok: true, messageId: 123 }),
  mockGetMessage: vi
    .fn()
    .mockImplementation((_key: string) => "Mocked i18n message"),
  mockGetConversationById: vi.fn(),
  mockCreateMessage: vi.fn(),
  mockBuildChatContext: vi.fn(),
  mockUpdateConversationCredits: vi.fn().mockResolvedValue(undefined),
  mockExecuteWithFallback: vi.fn(),
  mockHasEnoughCredits: vi.fn().mockResolvedValue(true),
  mockDeductCreditsForModel: vi.fn().mockResolvedValue({ creditsUsed: 5, wasFree: false }),
  mockCalculateCreditsForLLM: vi.fn().mockReturnValue(5),
}));

vi.mock("../../db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("../deliveryQueue", () => ({
  enqueueDelivery: mockEnqueueDelivery,
}));

vi.mock("../telegramService", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

vi.mock("../telegramI18n", () => ({
  getMessage: mockGetMessage,
}));

vi.mock("../chatService", () => ({
  getConversationById: mockGetConversationById,
  createMessage: mockCreateMessage,
  buildChatContext: mockBuildChatContext,
  updateConversationCredits: mockUpdateConversationCredits,
}));

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCreditsForModel: mockDeductCreditsForModel,
  calculateCreditsForLLM: mockCalculateCreditsForLLM,
}));

vi.mock("../../../drizzle/schema", () => ({
  telegramConnections: { id: "tc.id", status: "tc.status", activeChannelId: "tc.activeChannelId" },
  conversationChannels: {
    id: "cc.id",
    chatConversationId: "cc.chatConversationId",
    agencyConversationId: "cc.agencyConversationId",
    channelType: "cc.channelType",
    state: "cc.state",
    channelRefId: "cc.channelRefId",
    conversationType: "cc.conversationType",
  },
  channelMessages: { id: "cm.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
  and: vi.fn((...args: any[]) => ({ _type: "and", args })),
  inArray: vi.fn((_col: any, vals: any[]) => ({ _type: "inArray", vals })),
}));

import { channelGateway } from "../channelGateway";
import type { ChatIngressEvent, ChatEgressEvent } from "@shared/channelTypes";

// ── Helpers ──────────────────────────────────────────────────────

function makeIngressEvent(
  overrides: Partial<ChatIngressEvent> = {},
): ChatIngressEvent {
  return {
    eventId: "evt-1",
    eventType: "user_message",
    tenantId: "tenant-1",
    userId: 42,
    conversationId: "conv-1",
    conversationType: "chat",
    channel: {
      type: "telegram",
      connectionId: "conn-1",
      externalChatId: "12345",
      externalMessageId: "msg-ext-1",
    },
    message: { text: "hello", attachments: [] },
    idempotencyKey: "tg:bot1:100",
    ...overrides,
  };
}

function makeEgressEvent(
  overrides: Partial<ChatEgressEvent> = {},
): ChatEgressEvent {
  return {
    eventId: "evt-2",
    conversationId: "123",
    conversationType: "chat",
    messageId: "msg-1",
    tenantId: "tenant-1",
    targets: [],
    rendering: { plainText: "Hello!", html: "<b>Hello!</b>" },
    ...overrides,
  };
}

/** Set up a mock DB chain: db.select().from().where().limit() */
function mockDbSelectChain(rows: any[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  mockSelect.mockReturnValue({ from: fromFn });
  return { fromFn, whereFn, limitFn };
}

/** Set up a mock DB chain for queries that return arrays (no .limit()) */
function mockDbSelectArray(rows: any[]) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  mockSelect.mockReturnValue({ from: fromFn });
  return { fromFn, whereFn };
}

function mockDbInsertChain() {
  const valuesFn = vi.fn().mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: valuesFn });
  return { valuesFn };
}

// ── Tests ────────────────────────────────────────────────────────

describe("channelGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Don't use restoreAllMocks — it removes hoisted mock implementations
  });

  // --- Inbound (ingest) ---

  describe("ingest", () => {
    it("rejects event with invalid connectionId", async () => {
      mockDbSelectChain([]);

      const result = await channelGateway.ingest(makeIngressEvent());

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("no_connection");
    });

    it("rejects event with revoked connection", async () => {
      mockDbSelectChain([
        {
          id: "conn-1",
          status: "revoked",
          activeChannelId: "ch-1",
          tenantId: "tenant-1",
          userId: 42,
        },
      ]);

      const result = await channelGateway.ingest(makeIngressEvent());

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("revoked");
    });

    it("rejects event with no active channel binding", async () => {
      mockDbSelectChain([
        {
          id: "conn-1",
          status: "active",
          activeChannelId: null,
          tenantId: "tenant-1",
          userId: 42,
        },
      ]);

      const result = await channelGateway.ingest(makeIngressEvent());

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("no_channel");
    });

    it("routes chat-type event to chat pipeline", async () => {
      // First call: connection lookup
      // Second call: channel lookup
      // Third call: emitEgress binding query (returns empty)
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: () => ({
          where: (..._args: any[]) => {
            callCount++;
            if (callCount <= 2) {
              return {
                limit: () => {
                  if (callCount === 1) {
                    return Promise.resolve([
                      {
                        id: "conn-1",
                        status: "active",
                        activeChannelId: "ch-1",
                        tenantId: "tenant-1",
                        userId: 42,
                      },
                    ]);
                  }
                  return Promise.resolve([
                    {
                      id: "ch-1",
                      conversationType: "chat",
                      chatConversationId: 1,
                      agencyConversationId: null,
                      state: "active",
                      channelRefId: "12345",
                    },
                  ]);
                },
              };
            }
            // emitEgress query returns no bindings
            return Promise.resolve([]);
          },
        }),
      }));

      // Mock processMessageServerSide dependencies
      mockGetConversationById.mockResolvedValue({ id: 1, model: "gpt-4o-mini" });
      mockHasEnoughCredits.mockResolvedValue(true);
      mockCreateMessage.mockResolvedValue({ id: 100, role: "user", content: "test" });
      mockBuildChatContext.mockResolvedValue([]);
      mockExecuteWithFallback.mockResolvedValue({
        type: "success",
        response: {
          choices: [{ message: { content: "response" } }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        },
        providerId: 1,
        providerName: "openai",
      });

      const result = await channelGateway.ingest(makeIngressEvent());

      expect(result.ok).toBe(true);
    });

    it("routes agency-type event to agency pipeline", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: () => ({
          where: (..._args: any[]) => ({
            limit: () => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([
                  {
                    id: "conn-1",
                    status: "active",
                    activeChannelId: "ch-1",
                    tenantId: "tenant-1",
                    userId: 42,
                  },
                ]);
              }
              return Promise.resolve([
                {
                  id: "ch-1",
                  conversationType: "agency",
                  chatConversationId: null,
                  agencyConversationId: "agency-conv-1",
                  state: "active",
                  channelRefId: "12345",
                },
              ]);
            },
          }),
        }),
      }));

      const result = await channelGateway.ingest(
        makeIngressEvent({ conversationType: "agency" }),
      );

      expect(result.ok).toBe(true);
    });

    it("rejects event with missing connectionId", async () => {
      const result = await channelGateway.ingest(
        makeIngressEvent({
          channel: { type: "telegram", connectionId: undefined },
        }),
      );

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("no_connection");
    });
  });

  // --- Outbound (emitEgress) ---

  describe("emitEgress", () => {
    it("skips web-only conversations (no Telegram binding)", async () => {
      mockDbSelectArray([]);

      await channelGateway.emitEgress(makeEgressEvent());

      expect(mockEnqueueDelivery).not.toHaveBeenCalled();
    });

    it("enqueues BullMQ job for each Telegram binding", async () => {
      mockDbSelectArray([
        {
          id: "cc-1",
          channelRefId: "111",
          channelType: "telegram",
          state: "active",
        },
        {
          id: "cc-2",
          channelRefId: "222",
          channelType: "telegram",
          state: "active",
        },
      ]);
      mockDbInsertChain();

      await channelGateway.emitEgress(makeEgressEvent());

      expect(mockEnqueueDelivery).toHaveBeenCalledTimes(2);
      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: "111", text: "Hello!" }),
      );
      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: "222", text: "Hello!" }),
      );
    });

    it("creates channel_messages record before enqueueing", async () => {
      mockDbSelectArray([
        {
          id: "cc-1",
          channelRefId: "111",
          channelType: "telegram",
          state: "active",
        },
      ]);
      mockDbInsertChain();

      await channelGateway.emitEgress(makeEgressEvent());

      expect(mockInsert).toHaveBeenCalled();
      expect(mockEnqueueDelivery).toHaveBeenCalled();
    });

    it("uses plainText when html is not available", async () => {
      mockDbSelectArray([
        {
          id: "cc-1",
          channelRefId: "111",
          channelType: "telegram",
          state: "active",
        },
      ]);
      mockDbInsertChain();

      await channelGateway.emitEgress(
        makeEgressEvent({
          rendering: { plainText: "Plain text only" },
        }),
      );

      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Plain text only" }),
      );
    });
  });

  // --- Non-text message handling ---

  describe("handleNonTextMessage", () => {
    it("replies with i18n error for non-text messages", async () => {
      await channelGateway.handleNonTextMessage("123", "bot-token", "th");

      expect(mockGetMessage).toHaveBeenCalledWith("error_text_only", "th");
      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        "bot-token",
        "123",
        "Mocked i18n message",
        "HTML",
      );
    });

    it("does not throw when sendTelegramMessage fails", async () => {
      mockSendTelegramMessage.mockRejectedValueOnce(new Error("Send failed"));

      // Should not throw
      await channelGateway.handleNonTextMessage("123", "bot-token", "en");
    });
  });

  // --- Server-side chat processing ---

  describe("processMessageServerSide", () => {
    const defaultParams = {
      conversationId: 1,
      userId: 42,
      tenantId: "tenant-1",
      content: "Hello from Telegram",
      connectionId: "conn-1",
      externalSourceId: "ext-msg-1",
    };

    function setupHappyPath() {
      mockGetConversationById.mockResolvedValue({
        id: 1,
        model: "gpt-4o-mini",
        systemPrompt: "You are a helpful assistant.",
      });
      mockHasEnoughCredits.mockResolvedValue(true);
      mockCreateMessage
        .mockResolvedValueOnce({ id: 100, role: "user", content: "Hello" })
        .mockResolvedValueOnce({ id: 101, role: "assistant", content: "Hi!" });
      mockBuildChatContext.mockResolvedValue([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello from Telegram" },
      ]);
      mockExecuteWithFallback.mockResolvedValue({
        type: "success",
        response: {
          choices: [{ message: { content: "Hi there!" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
        providerId: 1,
        providerName: "openai",
      });
      // emitEgress needs a mock for the DB query
      mockDbSelectArray([]);
    }

    it("saves user message with sourceChannel=telegram", async () => {
      setupHappyPath();

      await channelGateway.processMessageServerSide(defaultParams);

      expect(mockCreateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 1,
          role: "user",
          content: "Hello from Telegram",
          sourceChannel: "telegram",
          sourceConnectionId: "conn-1",
        }),
      );
    });

    it("calls buildChatContext with correct parameters", async () => {
      setupHappyPath();

      await channelGateway.processMessageServerSide(defaultParams);

      expect(mockBuildChatContext).toHaveBeenCalledWith(
        1,
        42,
        "You are a helpful assistant.",
      );
    });

    it("calls LLM non-streaming and saves assistant response", async () => {
      setupHappyPath();

      const result = await channelGateway.processMessageServerSide(defaultParams);

      expect(mockExecuteWithFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false,
          userId: 42,
          conversationId: 1,
        }),
      );
      expect(result.success).toBe(true);
    });

    it("deducts credits after LLM response", async () => {
      setupHappyPath();

      await channelGateway.processMessageServerSide(defaultParams);

      expect(mockDeductCreditsForModel).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 42,
          inputTokens: 10,
          outputTokens: 5,
          sourceType: "chat",
        }),
      );
    });

    it("returns error when conversation not found", async () => {
      mockGetConversationById.mockResolvedValue(undefined);

      const result = await channelGateway.processMessageServerSide(defaultParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    });

    it("returns error when insufficient credits", async () => {
      mockGetConversationById.mockResolvedValue({
        id: 1,
        model: "gpt-4o-mini",
      });
      mockHasEnoughCredits.mockResolvedValue(false);

      const result = await channelGateway.processMessageServerSide(defaultParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain("credits");
      expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    });

    it("handles LLM error gracefully", async () => {
      mockGetConversationById.mockResolvedValue({ id: 1, model: "gpt-4o-mini" });
      mockHasEnoughCredits.mockResolvedValue(true);
      mockCreateMessage.mockResolvedValue({ id: 100, role: "user" });
      mockBuildChatContext.mockResolvedValue([]);
      mockExecuteWithFallback.mockResolvedValue({
        type: "error",
        error: "Provider unavailable",
        statusCode: 503,
      });
      mockDbSelectArray([]);

      const result = await channelGateway.processMessageServerSide(defaultParams);

      expect(result.success).toBe(false);
      // Should still save an error message for conversation consistency
      expect(mockCreateMessage).toHaveBeenCalledTimes(2);
    });
  });
});
