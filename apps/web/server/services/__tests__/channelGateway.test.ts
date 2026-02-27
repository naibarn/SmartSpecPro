import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockSelect,
  mockInsert,
  mockUpdate,
  mockEnqueueDelivery,
  mockSendTelegramMessage,
  mockGetMessage,
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
                  conversationType: "chat",
                  chatConversationId: 1,
                  agencyConversationId: null,
                  state: "active",
                  channelRefId: "12345",
                },
              ]);
            },
          }),
        }),
      }));

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
        expect.objectContaining({ chatId: "111", text: "<b>Hello!</b>" }),
      );
      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: "222", text: "<b>Hello!</b>" }),
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

  // --- Typing indicator ---

  describe("sendTypingLoop", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true }),
      );
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("calls sendChatAction immediately", () => {
      channelGateway.sendTypingLoop("123", "bot-token");

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/botbot-token/sendChatAction",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("calls sendChatAction every 4 seconds", async () => {
      const typing = channelGateway.sendTypingLoop("123", "bot-token");

      expect(fetch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(4000);
      expect(fetch).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(4000);
      expect(fetch).toHaveBeenCalledTimes(3);

      typing.stop();
    });

    it("cleans up interval on stop", () => {
      const typing = channelGateway.sendTypingLoop("123", "bot-token");

      typing.stop();

      const callsBefore = (fetch as any).mock.calls.length;
      vi.advanceTimersByTime(8000);
      expect(fetch).toHaveBeenCalledTimes(callsBefore);
    });

    it("does not throw when sendChatAction fails", () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      );

      const typing = channelGateway.sendTypingLoop("123", "bot-token");

      // Should not throw
      vi.advanceTimersByTime(4000);

      typing.stop();
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
});
