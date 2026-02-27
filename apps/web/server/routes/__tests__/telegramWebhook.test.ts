import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockGetDb, mockCacheClient, mockDecrypt, mockInsert, mockSelect } =
  vi.hoisted(() => ({
    mockGetDb: vi.fn(),
    mockCacheClient: {
      set: vi.fn(),
      get: vi.fn(),
    },
    mockDecrypt: vi.fn(),
    mockInsert: vi.fn(),
    mockSelect: vi.fn(),
  }));

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../../services/redisClients", () => ({
  getCacheClient: () => mockCacheClient,
}));
vi.mock("../../services/crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("../../services/telegramService", () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../../drizzle/schema", () => ({
  telegramUpdates: { id: "telegramUpdates" },
  systemSettings: {
    category: "category",
    key: "key",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ col: _col, val })),
}));

import { createTelegramWebhookRouter } from "../telegramWebhook";
import type { Request, Response } from "express";

// Helper to create mock Express req/res
function createMockReq(
  botId: string,
  body: any,
  headers: Record<string, string> = {},
): Partial<Request> {
  return {
    params: { botId },
    body,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  };
}

function createMockRes(): Partial<Response> & { _status: number } {
  const res: any = { _status: 0 };
  res.sendStatus = vi.fn((code: number) => {
    res._status = code;
    return res;
  });
  res.status = vi.fn((code: number) => {
    res._status = code;
    return res;
  });
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res;
}

function setupMockDb() {
  const settings = [
    { key: "enabled", value: "true" },
    { key: "bot_token", value: "enc_token" },
    { key: "webhook_secret", value: "enc_secret" },
    { key: "bot_username", value: "testbot" },
    { key: "app_url", value: "https://smartaihub.app" },
  ];

  const fromMock = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(settings),
  });
  mockSelect.mockReturnValue({ from: fromMock });
  mockInsert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });

  const db = {
    select: mockSelect,
    insert: mockInsert,
  };
  mockGetDb.mockResolvedValue(db);
  mockDecrypt.mockImplementation((v: string) =>
    v.replace("enc_", "dec_"),
  );

  return db;
}

describe("telegramWebhook", () => {
  let router: ReturnType<typeof createTelegramWebhookRouter>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheClient.set.mockResolvedValue("OK");
    router = createTelegramWebhookRouter();
  });

  // Get the POST handler from the router
  function getHandler() {
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === "/:botId",
    );
    return layer?.route?.stack?.[0]?.handle;
  }

  describe("webhook validation", () => {
    it("returns 200 when Telegram is not enabled", async () => {
      const db = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { key: "enabled", value: "false" },
            ]),
          }),
        }),
      };
      mockGetDb.mockResolvedValue(db);

      const handler = getHandler();
      const req = createMockReq("testbot", { update_id: 1 });
      const res = createMockRes();

      await handler(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
    });

    it("returns 403 with invalid secret token", async () => {
      setupMockDb();
      const handler = getHandler();
      const req = createMockReq("testbot", { update_id: 1 }, {
        "x-telegram-bot-api-secret-token": "wrong_secret",
      });
      const res = createMockRes();

      await handler(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it("returns 403 when secret token header is missing", async () => {
      setupMockDb();
      const handler = getHandler();
      const req = createMockReq("testbot", { update_id: 1 });
      const res = createMockRes();

      await handler(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(403);
    });

    it("returns 200 with valid secret token", async () => {
      setupMockDb();
      const handler = getHandler();
      const req = createMockReq(
        "testbot",
        { update_id: 1, message: { chat: { id: 123 }, date: 0 } },
        { "x-telegram-bot-api-secret-token": "dec_secret" },
      );
      const res = createMockRes();

      await handler(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
    });
  });

  describe("deduplication", () => {
    it("processes first update_id normally", async () => {
      setupMockDb();
      mockCacheClient.set.mockResolvedValue("OK");

      const handler = getHandler();
      const req = createMockReq(
        "testbot",
        { update_id: 42, message: { chat: { id: 123 }, date: 0 } },
        { "x-telegram-bot-api-secret-token": "dec_secret" },
      );
      const res = createMockRes();

      await handler(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      expect(mockCacheClient.set).toHaveBeenCalledWith(
        "tg:update:testbot:42",
        "1",
        "EX",
        86400,
        "NX",
      );
    });

    it("skips processing for duplicate update_id", async () => {
      setupMockDb();
      mockCacheClient.set.mockResolvedValue(null); // key already exists

      const handler = getHandler();
      const req = createMockReq(
        "testbot",
        { update_id: 42, message: { chat: { id: 123 }, date: 0 } },
        { "x-telegram-bot-api-secret-token": "dec_secret" },
      );
      const res = createMockRes();

      await handler(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(200);
      // Insert should NOT be called for duplicate
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  describe("non-text message handling", () => {
    it("replies with error for photo messages", async () => {
      setupMockDb();
      const { sendTelegramMessage } = await import(
        "../../services/telegramService"
      );

      const handler = getHandler();
      const req = createMockReq(
        "testbot",
        {
          update_id: 100,
          message: {
            message_id: 1,
            from: { id: 555, language_code: "en" },
            chat: { id: 123, type: "private" },
            photo: [{}],
            date: 0,
          },
        },
        { "x-telegram-bot-api-secret-token": "dec_secret" },
      );
      const res = createMockRes();

      await handler(req, res);
      expect(res.sendStatus).toHaveBeenCalledWith(200);

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 50));
      expect(sendTelegramMessage).toHaveBeenCalled();
    });
  });
});
