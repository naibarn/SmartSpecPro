import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockGetDb,
  mockRedisClient,
  mockSendTelegramMessage,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockRedisClient: { del: vi.fn(), set: vi.fn() },
  mockSendTelegramMessage: vi
    .fn()
    .mockResolvedValue({ ok: true, messageId: 1 }),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../redis", () => ({ getRedisClient: () => mockRedisClient }));
vi.mock("../telegramService", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));
vi.mock("../crypto", () => ({ decrypt: vi.fn((v: string) => v) }));
vi.mock("../../routes/telegramWebhook", () => ({
  registerWebhookHandler: vi.fn(),
}));
vi.mock("../../../drizzle/schema", () => ({
  telegramLinkTokens: { tokenHash: "tokenHash", id: "id", userId: "userId" },
  telegramConnections: {
    botId: "botId",
    telegramUserId: "telegramUserId",
    status: "status",
    id: "id",
    activeChannelId: "activeChannelId",
  },
  conversationChannels: {},
  users: {
    id: "id",
    currentTenantId: "currentTenantId",
    telegramChatId: "telegramChatId",
    telegramUsername: "telegramUsername",
    telegramVerified: "telegramVerified",
    telegramVerifiedAt: "telegramVerifiedAt",
  },
  systemSettings: { category: "category", key: "key" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ col: _col, val })),
  and: vi.fn((...args: any[]) => ({ and: args })),
}));

import { handleStartLink } from "../telegramLinkService";
import type { WebhookContext } from "../../routes/telegramWebhook";

function makeCtx(text: string): WebhookContext {
  return {
    botId: "testbot",
    update: { update_id: 1 },
    message: {
      message_id: 1,
      from: { id: 12345, language_code: "en", username: "testuser" },
      chat: { id: 67890, type: "private" },
      text,
      date: 0,
    },
    chatId: "67890",
    telegramUserId: "12345",
    languageCode: "en",
    db: null as any,
    botToken: "fake-bot-token",
  };
}

describe("telegramLinkService handleStartLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when token hash not found in DB", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    const ctx = makeCtx("abc123");
    ctx.db = db;

    await handleStartLink(ctx);

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      "fake-bot-token",
      "67890",
      expect.stringContaining("failed"),
      "HTML",
    );
  });

  it("rejects expired token", async () => {
    const pastDate = new Date(Date.now() - 600_000); // 10 min ago
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "tok-1",
                userId: 1,
                tokenHash: "abc",
                expiresAt: pastDate,
                usedAt: null,
                revokedAt: null,
              },
            ]),
          }),
        }),
      }),
    };
    const ctx = makeCtx("abc123");
    ctx.db = db;

    await handleStartLink(ctx);

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      "fake-bot-token",
      "67890",
      expect.stringContaining("expired"),
      "HTML",
    );
  });

  it("rejects already-used token", async () => {
    const futureDate = new Date(Date.now() + 600_000);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "tok-1",
                userId: 1,
                tokenHash: "abc",
                expiresAt: futureDate,
                usedAt: new Date(),
                revokedAt: null,
              },
            ]),
          }),
        }),
      }),
    };
    const ctx = makeCtx("abc123");
    ctx.db = db;

    await handleStartLink(ctx);

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      "fake-bot-token",
      "67890",
      expect.stringContaining("already been used"),
      "HTML",
    );
  });

  it("rejects when no raw token provided", async () => {
    const ctx = makeCtx("");
    ctx.db = {};

    await handleStartLink(ctx);

    expect(mockSendTelegramMessage).toHaveBeenCalledWith(
      "fake-bot-token",
      "67890",
      expect.stringContaining("failed"),
      "HTML",
    );
  });
});
