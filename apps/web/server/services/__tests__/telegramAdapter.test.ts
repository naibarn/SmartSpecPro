import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockSendTelegramMessage,
  mockDecrypt,
  mockGetDb,
  mockDbSelect,
  mockRenderForTelegram,
  mockAdapterRegistryRegister,
} = vi.hoisted(() => ({
  mockSendTelegramMessage: vi.fn().mockResolvedValue({ ok: true, messageId: 123 }),
  mockDecrypt: vi.fn((v: string) => v.replace("enc_", "dec_")),
  mockGetDb: vi.fn(),
  mockDbSelect: vi.fn(),
  mockRenderForTelegram: vi.fn((text: string) => [text]),
  mockAdapterRegistryRegister: vi.fn(),
}));

vi.mock("../telegramService", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

vi.mock("../crypto", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../telegramRendering", () => ({
  renderForTelegram: mockRenderForTelegram,
}));

vi.mock("../channelAdapters/registry", () => ({
  adapterRegistry: {
    register: mockAdapterRegistryRegister,
    get: vi.fn(),
    getAll: vi.fn(() => []),
    _reset: vi.fn(),
  },
}));

vi.mock("../../../drizzle/schema", () => ({
  systemSettings: { category: "ss.category", key: "ss.key", value: "ss.value" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
}));

// ── Telegram adapter module (loaded after all mocks) ─────────────────────

// Note: telegram.ts self-registers on import, we mock that above
import "../../db";
import "../telegramService";

// Setup DB mock helper
function setupDbWithSettings(settings: Array<{ key: string; value: string }>) {
  const fromFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(settings),
  });
  mockDbSelect.mockReturnValue({ from: fromFn });
  mockGetDb.mockResolvedValue({ select: mockDbSelect });
}

describe("TelegramAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset module cache and re-import to get fresh adapter instance
    vi.resetModules();

    // Re-setup mocks after resetModules
    vi.mock("../telegramService", () => ({
      sendTelegramMessage: mockSendTelegramMessage,
    }));
    vi.mock("../crypto", () => ({
      decrypt: mockDecrypt,
    }));
    vi.mock("../../db", () => ({
      getDb: mockGetDb,
    }));
    vi.mock("../telegramRendering", () => ({
      renderForTelegram: mockRenderForTelegram,
    }));
    vi.mock("../channelAdapters/registry", () => ({
      adapterRegistry: {
        register: mockAdapterRegistryRegister,
        get: vi.fn(),
        getAll: vi.fn(() => []),
        _reset: vi.fn(),
      },
    }));
    vi.mock("../../../drizzle/schema", () => ({
      systemSettings: { category: "ss.category", key: "ss.key", value: "ss.value" },
    }));
    vi.mock("drizzle-orm", () => ({
      eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
    }));

    // Import the telegram module — it self-registers and we capture the adapter
    await import("../channelAdapters/telegram");

    // Get the registered adapter (it was passed to mockAdapterRegistryRegister)
    const calls = mockAdapterRegistryRegister.mock.calls;
    adapter = calls.length > 0 ? calls[calls.length - 1][0] : null;
  });

  it("has channelType 'telegram'", () => {
    expect(adapter?.channelType).toBe("telegram");
  });

  it("has correct capabilities", () => {
    expect(adapter?.capabilities).toMatchObject({
      maxMessageLength: 4096,
      supportsButtons: true,
      supportsRichText: true,
      supportsAttachments: false,
      rateLimitPerSecond: 25,
    });
  });

  it("self-registers with adapter registry on import", () => {
    expect(mockAdapterRegistryRegister).toHaveBeenCalledWith(
      expect.objectContaining({ channelType: "telegram" }),
    );
  });

  describe("validateWebhook", () => {
    it("returns true for valid X-Telegram-Bot-Api-Secret-Token header", async () => {
      setupDbWithSettings([{ key: "webhook_secret", value: "enc_mysecret" }]);

      const valid = await adapter.validateWebhook({
        headers: { "x-telegram-bot-api-secret-token": "dec_mysecret" },
        body: {},
        params: {},
      });

      expect(valid).toBe(true);
    });

    it("returns false for invalid secret token (timing-safe)", async () => {
      setupDbWithSettings([{ key: "webhook_secret", value: "enc_mysecret" }]);

      const valid = await adapter.validateWebhook({
        headers: { "x-telegram-bot-api-secret-token": "wrong_secret" },
        body: {},
        params: {},
      });

      expect(valid).toBe(false);
    });

    it("returns false when header is missing", async () => {
      setupDbWithSettings([{ key: "webhook_secret", value: "enc_mysecret" }]);

      const valid = await adapter.validateWebhook({
        headers: {},
        body: {},
        params: {},
      });

      expect(valid).toBe(false);
    });

    it("returns false when webhook secret is not configured", async () => {
      setupDbWithSettings([]); // No webhook_secret setting

      const valid = await adapter.validateWebhook({
        headers: { "x-telegram-bot-api-secret-token": "sometoken" },
        body: {},
        params: {},
      });

      expect(valid).toBe(false);
    });
  });

  describe("parseInbound", () => {
    it("returns correct ParsedInbound from Telegram message update", async () => {
      const update = {
        update_id: 100,
        message: {
          message_id: 42,
          from: { id: 999, language_code: "en" },
          chat: { id: 12345, type: "private" },
          text: "Hello!",
          date: 1700000000,
        },
      };

      const result = await adapter.parseInbound(update, "conn-123");

      expect(result).not.toBeNull();
      expect(result!.event.eventType).toBe("user_message");
      expect(result!.event.channel.externalChatId).toBe("12345");
      expect(result!.event.channel.externalMessageId).toBe("42");
      expect(result!.event.channel.connectionId).toBe("conn-123");
      expect(result!.event.message.text).toBe("Hello!");
      expect(result!.dedupKey).toBe("tg:conn-123:100");
    });

    it("returns command eventType for /command messages", async () => {
      const update = {
        update_id: 101,
        message: {
          message_id: 43,
          from: { id: 999 },
          chat: { id: 12345, type: "private" },
          text: "/start",
          date: 1700000000,
        },
      };

      const result = await adapter.parseInbound(update, "conn-123");

      expect(result!.event.eventType).toBe("command");
    });

    it("returns null for non-text messages (photo)", async () => {
      const update = {
        update_id: 102,
        message: {
          message_id: 44,
          from: { id: 999 },
          chat: { id: 12345, type: "private" },
          photo: [{ file_id: "abc" }],
          date: 1700000000,
        },
      };

      const result = await adapter.parseInbound(update, "conn-123");

      expect(result).toBeNull();
    });

    it("returns null for callback_query updates", async () => {
      const update = {
        update_id: 103,
        callback_query: { id: "cq-1", from: { id: 999 }, data: "action" },
      };

      const result = await adapter.parseInbound(update, "conn-123");

      expect(result).toBeNull();
    });

    it("returns null for updates without update_id", async () => {
      const result = await adapter.parseInbound({}, "conn-123");
      expect(result).toBeNull();
    });
  });

  describe("sendMessage", () => {
    it("delegates to sendTelegramMessage with botToken from config", async () => {
      const config = { botToken: "my-bot-token" };
      await adapter.sendMessage(config, "12345", "Hello world", { parseMode: "HTML" });

      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        "my-bot-token",
        "12345",
        "Hello world",
        "HTML",
      );
    });

    it("defaults parseMode to HTML when options not provided", async () => {
      await adapter.sendMessage({ botToken: "tok" }, "123", "Hi");

      expect(mockSendTelegramMessage).toHaveBeenCalledWith("tok", "123", "Hi", "HTML");
    });

    it("returns ok and externalMessageId from sendTelegramMessage result", async () => {
      mockSendTelegramMessage.mockResolvedValueOnce({ ok: true, messageId: 999 });

      const result = await adapter.sendMessage({ botToken: "tok" }, "123", "Hi");

      expect(result.ok).toBe(true);
      expect(result.externalMessageId).toBe("999");
    });
  });

  describe("formatMessage", () => {
    it("delegates to renderForTelegram", () => {
      mockRenderForTelegram.mockReturnValueOnce(["chunk1", "chunk2"]);

      const result = adapter.formatMessage("long text");

      expect(mockRenderForTelegram).toHaveBeenCalledWith("long text");
      expect(result).toEqual(["chunk1", "chunk2"]);
    });

    it("returns single chunk for short messages", () => {
      mockRenderForTelegram.mockReturnValueOnce(["Hello!"]);

      const result = adapter.formatMessage("Hello!");

      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello!");
    });
  });
});
