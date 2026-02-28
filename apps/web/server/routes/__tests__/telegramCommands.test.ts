import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockSendTelegramMessage,
  mockAnswerCallbackQuery,
  mockGetMessage,
  mockSelect,
  mockUpdate,
} = vi.hoisted(() => ({
  mockSendTelegramMessage: vi.fn().mockResolvedValue({ ok: true }),
  mockAnswerCallbackQuery: vi.fn().mockResolvedValue(undefined),
  mockGetMessage: vi.fn().mockImplementation((key: string) => {
    // Include placeholders so .replace() works in tests
    const placeholders: Record<string, string> = {
      status_active: "Active: {name} | msgs: {count} | last: {lastActivity}",
      resume_success: "Switched to: {name}",
      error_no_connection: "Not linked. Go to {url}",
    };
    return placeholders[key] || `[${key}]`;
  }),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("../../services/telegramService", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
  answerCallbackQuery: mockAnswerCallbackQuery,
}));

vi.mock("../../services/telegramI18n", () => ({
  getMessage: mockGetMessage,
}));

vi.mock("../../../drizzle/schema", () => ({
  telegramConnections: { id: "tc.id", botId: "tc.botId", telegramUserId: "tc.tuid", status: "tc.status", activeChannelId: "tc.acid" },
  conversationChannels: { id: "cc.id", connectionId: "cc.cid", state: "cc.state", conversationType: "cc.ct", chatConversationId: "cc.ccid", agencyConversationId: "cc.acid" },
  conversations: { id: "c.id", title: "c.title" },
  agencyConversations: { id: "ac.id", title: "ac.title" },
  users: { id: "u.id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
  and: vi.fn((...args: any[]) => ({ _type: "and", args })),
}));

import {
  handleHelp,
  handleStatus,
  handleResume,
  handleUnlink,
  handleStartNoToken,
  handleCallbackQuery,
} from "../telegramCommands";
import type { WebhookContext } from "../telegramWebhook";

/**
 * Creates a mock db that tracks query sequences.
 * Each "query" ends when .limit() is called or when the chain is awaited.
 * Pass queryResults in the order queries will be executed.
 */
function createMockDb(queryResults: any[][] = []) {
  let queryIndex = 0;
  let updateCallCount = 0;

  function nextResult(): any[] {
    return queryResults[queryIndex++] || [];
  }

  // Create a thenable chain — each method returns a new chainable,
  // and awaiting it (or calling .limit()) resolves with the next result.
  function makeQueryChain(): any {
    const result = nextResult();
    const chainable: any = {
      select: vi.fn().mockImplementation(() => makeQueryChain()),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue(Promise.resolve(result)),
      then: (resolve: any, reject?: any) =>
        Promise.resolve(result).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(result).catch(fn),
    };
    return chainable;
  }

  const db: any = {
    select: vi.fn().mockImplementation(() => {
      const chain = makeQueryChain();
      return chain;
    }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })),
    get _updateCallCount() {
      return updateCallCount;
    },
  };

  // Track update calls
  const origUpdate = db.update;
  db.update = vi.fn().mockImplementation((...args: any[]) => {
    updateCallCount++;
    return origUpdate(...args);
  });

  return db;
}

function makeCtx(
  queryResults: any[][] = [],
  overrides: Partial<WebhookContext> = {},
): WebhookContext {
  return {
    botId: "testbot",
    update: { update_id: 1 },
    message: { message_id: 1, chat: { id: 123, type: "private" }, date: 0 },
    chatId: "123",
    telegramUserId: "555",
    languageCode: "en",
    db: createMockDb(queryResults),
    botToken: "test-token",
    ...overrides,
  };
}

describe("Telegram Commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== /help =====
  describe("/help", () => {
    it("sends help_text message", async () => {
      const ctx = makeCtx();
      await handleHelp(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith("help_text", "en");
      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        "test-token",
        "123",
        "[help_text]",
        "HTML",
      );
    });

    it("works for any language code", async () => {
      const ctx = makeCtx([], { languageCode: "th" });
      await handleHelp(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith("help_text", "th");
    });
  });

  // ===== /status =====
  describe("/status", () => {
    it("handles unlinked user with error_no_connection", async () => {
      // findActiveConnection returns []
      const ctx = makeCtx([[]]);
      await handleStatus(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith(
        "error_no_connection",
        "en",
      );
    });

    it("shows status_no_conversation when no activeChannelId", async () => {
      const ctx = makeCtx([
        // findActiveConnection
        [{ id: "conn-1", activeChannelId: null, status: "active" }],
      ]);

      await handleStatus(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith(
        "status_no_conversation",
        "en",
      );
    });

    it("shows active conversation status info", async () => {
      const ctx = makeCtx([
        // findActiveConnection
        [{ id: "conn-1", activeChannelId: "a0000000-0000-4000-8000-000000000001", status: "active" }],
        // load channel binding
        [{ id: "a0000000-0000-4000-8000-000000000001", conversationType: "chat", chatConversationId: 42 }],
        // load conversation details
        [{ title: "Test Chat", updatedAt: new Date("2026-01-01") }],
      ]);

      await handleStatus(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith("status_active", "en");
      expect(mockSendTelegramMessage).toHaveBeenCalled();
      const sentText = mockSendTelegramMessage.mock.calls[0][2];
      expect(sentText).toContain("Test Chat");
    });
  });

  // ===== /resume =====
  describe("/resume", () => {
    it("handles unlinked user with error_no_connection", async () => {
      const ctx = makeCtx([[]]);
      await handleResume(ctx);
      expect(mockGetMessage).toHaveBeenCalledWith(
        "error_no_connection",
        "en",
      );
    });

    it("replies with resume_no_conversations when no channels are bound", async () => {
      const ctx = makeCtx([
        // findActiveConnection
        [{ id: "conn-1", status: "active" }],
        // join query returns empty
        [],
      ]);

      await handleResume(ctx);
      expect(mockGetMessage).toHaveBeenCalledWith(
        "resume_no_conversations",
        "en",
      );
    });

    it("auto-selects single bound conversation", async () => {
      const ctx = makeCtx([
        // findActiveConnection
        [{ id: "conn-1", status: "active" }],
        // join query returns one channel
        [
          {
            channelId: "a0000000-0000-4000-8000-000000000001",
            conversationType: "chat",
            chatTitle: "My Chat",
            agencyTitle: null,
          },
        ],
      ]);

      await handleResume(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith("resume_success", "en");
      const sentText = mockSendTelegramMessage.mock.calls[0][2];
      expect(sentText).toContain("My Chat");
    });

    it("shows inline keyboard for multiple conversations", async () => {
      const ctx = makeCtx([
        // findActiveConnection
        [{ id: "conn-1", status: "active" }],
        // join query returns multiple channels
        [
          {
            channelId: "a0000000-0000-4000-8000-000000000001",
            conversationType: "chat",
            chatTitle: "Chat A",
            agencyTitle: null,
          },
          {
            channelId: "b0000000-0000-4000-8000-000000000002",
            conversationType: "agency",
            chatTitle: null,
            agencyTitle: "Agency B",
          },
        ],
      ]);

      await handleResume(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith(
        "resume_list_header",
        "en",
      );
      const replyMarkup = mockSendTelegramMessage.mock.calls[0][4];
      expect(replyMarkup).toBeDefined();
      expect(replyMarkup.inline_keyboard).toHaveLength(2);
      expect(replyMarkup.inline_keyboard[0][0].callback_data).toBe(
        "resume:a0000000-0000-4000-8000-000000000001",
      );
      expect(replyMarkup.inline_keyboard[1][0].callback_data).toBe(
        "resume:b0000000-0000-4000-8000-000000000002",
      );
    });
  });

  // ===== /unlink =====
  describe("/unlink", () => {
    it("handles unlinked user with error_no_connection", async () => {
      const ctx = makeCtx([[]]);
      await handleUnlink(ctx);
      expect(mockGetMessage).toHaveBeenCalledWith(
        "error_no_connection",
        "en",
      );
    });

    it("sends inline keyboard confirmation", async () => {
      const ctx = makeCtx([
        // findActiveConnection
        [{ id: "conn-1", status: "active" }],
      ]);

      await handleUnlink(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith("unlink_confirm", "en");
      const replyMarkup = mockSendTelegramMessage.mock.calls[0][4];
      expect(replyMarkup.inline_keyboard).toHaveLength(1);
      expect(replyMarkup.inline_keyboard[0]).toHaveLength(2);
      expect(replyMarkup.inline_keyboard[0][0].callback_data).toBe(
        "unlink_confirm",
      );
      expect(replyMarkup.inline_keyboard[0][1].callback_data).toBe(
        "unlink_cancel",
      );
    });
  });

  // ===== /start (no token) =====
  describe("/start (no token)", () => {
    it("shows welcome/link instructions for unlinked user", async () => {
      const ctx = makeCtx([[]]);
      await handleStartNoToken(ctx);
      expect(mockGetMessage).toHaveBeenCalledWith("start_no_token", "en");
    });

    it("shows status for linked user with active conversation", async () => {
      const ctx = makeCtx([
        // findActiveConnection
        [{ id: "conn-1", activeChannelId: "a0000000-0000-4000-8000-000000000001", status: "active" }],
        // load channel
        [{ id: "a0000000-0000-4000-8000-000000000001", conversationType: "chat", chatConversationId: 42 }],
        // load conversation
        [{ title: "My Chat" }],
      ]);

      await handleStartNoToken(ctx);

      expect(mockGetMessage).toHaveBeenCalledWith("status_active", "en");
    });
  });

  // ===== Callback query handling =====
  describe("callback_query routing", () => {
    it("routes unlink_cancel to handleUnlinkCallback", async () => {
      const ctx = makeCtx([], {
        update: {
          update_id: 1,
          callback_query: {
            id: "cq-1",
            from: { id: 555 },
            data: "unlink_cancel",
          },
        },
      });

      await handleCallbackQuery(ctx);

      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(
        "test-token",
        "cq-1",
      );
      expect(mockGetMessage).toHaveBeenCalledWith("unlink_cancelled", "en");
    });

    it("routes unlink_confirm and revokes connection", async () => {
      const ctx = makeCtx(
        [
          // findActiveConnection
          [{ id: "conn-1", userId: 10, status: "active" }],
        ],
        {
          update: {
            update_id: 1,
            callback_query: {
              id: "cq-2",
              from: { id: 555 },
              data: "unlink_confirm",
            },
          },
        },
      );

      await handleCallbackQuery(ctx);

      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(
        "test-token",
        "cq-2",
      );
      expect(mockGetMessage).toHaveBeenCalledWith("unlink_success", "en");
      // Verify update was called (for connection, channels, users)
      expect(ctx.db.update).toHaveBeenCalledTimes(3);
    });

    it("routes resume callback and updates activeChannelId", async () => {
      const ctx = makeCtx(
        [
          // findActiveConnection
          [{ id: "conn-1", status: "active" }],
          // verify channel belongs to connection
          [
            {
              id: "a0000000-0000-4000-8000-000000000001",
              conversationType: "chat",
              chatConversationId: 42,
              connectionId: "conn-1",
            },
          ],
          // get conversation title
          [{ title: "Chat Title" }],
        ],
        {
          update: {
            update_id: 1,
            callback_query: {
              id: "cq-3",
              from: { id: 555 },
              data: "resume:a0000000-0000-4000-8000-000000000001",
            },
          },
        },
      );

      await handleCallbackQuery(ctx);

      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(
        "test-token",
        "cq-3",
      );
      expect(mockGetMessage).toHaveBeenCalledWith("resume_success", "en");
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it("ignores unknown callback_data values", async () => {
      const ctx = makeCtx([], {
        update: {
          update_id: 1,
          callback_query: {
            id: "cq-4",
            from: { id: 555 },
            data: "unknown_action",
          },
        },
      });

      await handleCallbackQuery(ctx);

      expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(
        "test-token",
        "cq-4",
      );
      expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    });

    it("handles missing callback_data gracefully", async () => {
      const ctx = makeCtx([], {
        update: {
          update_id: 1,
          callback_query: {
            id: "cq-5",
            from: { id: 555 },
          },
        },
      });

      await handleCallbackQuery(ctx);
      expect(mockAnswerCallbackQuery).not.toHaveBeenCalled();
      expect(mockSendTelegramMessage).not.toHaveBeenCalled();
    });
  });
});
