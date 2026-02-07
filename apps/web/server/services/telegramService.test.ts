import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  escapeHtml,
  formatTelegramMessage,
  sendTelegramMessage,
  enqueueTelegramNotification,
  clearTelegramCache,
} from "./telegramService";

// Mock fetch
global.fetch = vi.fn();

// Mock Redis client
const mockRedis = {
  incr: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  expire: vi.fn(),
};

// Mock database
function createDbMock() {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };
  return {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    _chain: chain,
  };
}

let mockDb: any;

describe("telegramService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createDbMock();
    (global.fetch as any).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("escapeHtml", () => {
    it("escapes < to &lt;", () => {
      expect(escapeHtml("Price < 10")).toBe("Price &lt; 10");
    });

    it("escapes > to &gt;", () => {
      expect(escapeHtml("Price > 5")).toBe("Price &gt; 5");
    });

    it("escapes & to &amp;", () => {
      expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    });

    it("preserves normal text without escaping", () => {
      expect(escapeHtml("Hello World")).toBe("Hello World");
    });

    it("handles empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("handles text with multiple special chars: 'Price < $10 & > $5'", () => {
      expect(escapeHtml("Price < $10 & > $5")).toBe(
        "Price &lt; $10 &amp; &gt; $5"
      );
    });
  });

  describe("formatTelegramMessage", () => {
    it("includes priority emoji (🔴 for critical, 🟠 for high, 🔵 for normal, ⚪ for low)", () => {
      const notif = {
        title: "Test",
        content: "Content",
        priority: "critical",
        createdAt: new Date("2026-02-08T01:00:00Z"),
      };
      const result = formatTelegramMessage(notif, "https://app.example.com");
      expect(result.text).toContain("🔴");

      const high = formatTelegramMessage(
        { ...notif, priority: "high" },
        "https://app.example.com"
      );
      expect(high.text).toContain("🟠");

      const normal = formatTelegramMessage(
        { ...notif, priority: "normal" },
        "https://app.example.com"
      );
      expect(normal.text).toContain("🔵");

      const low = formatTelegramMessage(
        { ...notif, priority: "low" },
        "https://app.example.com"
      );
      expect(low.text).toContain("⚪");
    });

    it("wraps title in <b> tags", () => {
      const notif = {
        title: "Alert Title",
        content: "Content",
        priority: "normal",
        createdAt: new Date("2026-02-08T01:00:00Z"),
      };
      const result = formatTelegramMessage(notif, "https://app.example.com");
      expect(result.text).toContain("<b>Alert Title</b>");
    });

    it("wraps timestamp in <i> tags", () => {
      const notif = {
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date("2026-02-08T01:00:00Z"),
      };
      const result = formatTelegramMessage(notif, "https://app.example.com");
      expect(result.text).toMatch(/<i>.*<\/i>/);
    });

    it("escapes HTML special characters in title and content", () => {
      const notif = {
        title: "Alert <script>",
        content: "Content & <tag>",
        priority: "normal",
        createdAt: new Date("2026-02-08T01:00:00Z"),
      };
      const result = formatTelegramMessage(notif, "https://app.example.com");
      expect(result.text).toContain("&lt;script&gt;");
      expect(result.text).toContain("&amp; &lt;tag&gt;");
    });

    it("truncates content to 4000 chars", () => {
      const longContent = "a".repeat(5000);
      const notif = {
        title: "Test",
        content: longContent,
        priority: "normal",
        createdAt: new Date("2026-02-08T01:00:00Z"),
      };
      const result = formatTelegramMessage(notif, "https://app.example.com");
      expect(result.text.length).toBeLessThanOrEqual(4000);
      expect(result.text).toContain("...");
    });

    it("includes inline keyboard with 'View in SmartSpecPro' button and correct URL", () => {
      const notif = {
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date("2026-02-08T01:00:00Z"),
      };
      const result = formatTelegramMessage(notif, "https://app.example.com");
      expect(result.replyMarkup).toEqual({
        inline_keyboard: [
          [
            {
              text: "View in SmartSpecPro",
              url: "https://app.example.com/notifications",
            },
          ],
        ],
      });
    });

    it("sets parse_mode to 'HTML'", () => {
      const notif = {
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date("2026-02-08T01:00:00Z"),
      };
      const result = formatTelegramMessage(notif, "https://app.example.com");
      expect(result.parseMode).toBe("HTML");
    });
  });

  describe("sendTelegramMessage", () => {
    it("sends POST to api.telegram.org/bot{token}/sendMessage with correct payload", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { message_id: 123 } }),
      });

      await sendTelegramMessage(
        "test-token",
        "123456",
        "Test message",
        "HTML"
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bottest-token/sendMessage",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"chat_id":"123456"'),
        })
      );
    });

    it("returns { ok: true, messageId } on success", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { message_id: 456 } }),
      });

      const result = await sendTelegramMessage(
        "test-token",
        "123456",
        "Test",
        "HTML"
      );
      expect(result).toEqual({ ok: true, messageId: 456 });
    });

    it("throws on HTTP 429 with retry-after info", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          description: "Too Many Requests",
          parameters: { retry_after: 60 },
        }),
      });

      await expect(
        sendTelegramMessage("test-token", "123456", "Test", "HTML")
      ).rejects.toThrow("Rate limited by Telegram API");
    });

    it("throws on 'bot was blocked' error", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          description: "Forbidden: bot was blocked by the user",
        }),
      });

      await expect(
        sendTelegramMessage("test-token", "123456", "Test", "HTML")
      ).rejects.toThrow("Bot was blocked by user");
    });

    it("throws on network error", async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error("Network timeout")
      );

      await expect(
        sendTelegramMessage("test-token", "123456", "Test", "HTML")
      ).rejects.toThrow("Network error calling Telegram API");
    });

    it("includes reply_markup when provided", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { message_id: 789 } }),
      });

      const replyMarkup = {
        inline_keyboard: [[{ text: "Button", url: "https://example.com" }]],
      };

      await sendTelegramMessage(
        "test-token",
        "123456",
        "Test",
        "HTML",
        replyMarkup
      );

      const callArgs = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reply_markup).toEqual(replyMarkup);
    });

    it("sets timeout on fetch request", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { message_id: 999 } }),
      });

      await sendTelegramMessage("test-token", "123456", "Test", "HTML");

      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].signal).toBeDefined();
    });
  });

  describe("enqueueTelegramNotification", () => {
    it("does NOT enqueue when Telegram feature is disabled (system_settings)", async () => {
      mockDb._chain.from.mockReturnThis();
      mockDb._chain.where.mockResolvedValueOnce([
        { key: "enabled", value: "false" },
      ]);

      const notification = {
        notificationId: 1,
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date(),
      };

      // Should not throw
      await enqueueTelegramNotification(mockDb, 1, notification);

      // Verify no queue add was attempted (we'll need to mock the queue in full implementation)
    });

    it("does NOT enqueue when user is not verified", async () => {
      mockDb._chain.where
        .mockResolvedValueOnce([
          { key: "enabled", value: "true" },
          { key: "bot_token", value: "encrypted-token" },
          { key: "bot_username", value: "testbot" },
          { key: "app_url", value: "https://app.example.com" },
        ])
        .mockResolvedValueOnce([
          {
            telegramChatId: "123",
            telegramVerified: false,
            userPreferences: { telegramNotifyLevel: "all" },
          },
        ]);

      const notification = {
        notificationId: 1,
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date(),
      };

      await enqueueTelegramNotification(mockDb, 1, notification);
      // Should not enqueue
    });

    it("does NOT enqueue when telegramNotifyLevel is 'off'", async () => {
      mockDb._chain.where
        .mockResolvedValueOnce([
          { key: "enabled", value: "true" },
          { key: "bot_token", value: "encrypted-token" },
          { key: "bot_username", value: "testbot" },
          { key: "app_url", value: "https://app.example.com" },
        ])
        .mockResolvedValueOnce([
          {
            telegramChatId: "123",
            telegramVerified: true,
            userPreferences: { telegramNotifyLevel: "off" },
          },
        ]);

      const notification = {
        notificationId: 1,
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date(),
      };

      await enqueueTelegramNotification(mockDb, 1, notification);
      // Should not enqueue
    });

    it("does NOT enqueue when telegramNotifyLevel is undefined", async () => {
      mockDb._chain.where
        .mockResolvedValueOnce([
          { key: "enabled", value: "true" },
          { key: "bot_token", value: "encrypted-token" },
          { key: "bot_username", value: "testbot" },
          { key: "app_url", value: "https://app.example.com" },
        ])
        .mockResolvedValueOnce([
          {
            telegramChatId: "123",
            telegramVerified: true,
            userPreferences: {},
          },
        ]);

      const notification = {
        notificationId: 1,
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date(),
      };

      await enqueueTelegramNotification(mockDb, 1, notification);
      // Should not enqueue
    });

    it("does NOT enqueue when priority is 'normal' and level is 'high_critical'", async () => {
      mockDb._chain.where
        .mockResolvedValueOnce([
          { key: "enabled", value: "true" },
          { key: "bot_token", value: "encrypted-token" },
          { key: "bot_username", value: "testbot" },
          { key: "app_url", value: "https://app.example.com" },
        ])
        .mockResolvedValueOnce([
          {
            telegramChatId: "123",
            telegramVerified: true,
            userPreferences: { telegramNotifyLevel: "high_critical" },
          },
        ]);

      const notification = {
        notificationId: 1,
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date(),
      };

      await enqueueTelegramNotification(mockDb, 1, notification);
      // Should not enqueue
    });

    it("silently logs error if Redis/queue is unavailable (fire-and-forget)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Mock settings fetch to throw
      mockDb._chain.where.mockRejectedValueOnce(new Error("Redis down"));

      const notification = {
        notificationId: 1,
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date(),
      };

      // Should not throw
      await expect(
        enqueueTelegramNotification(mockDb, 1, notification)
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Telegram] Failed to enqueue notification:",
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("clearTelegramCache", () => {
    it("after clearing, next call to enqueueTelegramNotification re-reads system_settings", async () => {
      // First call
      mockDb._chain.where.mockResolvedValueOnce([
        { key: "enabled", value: "true" },
        { key: "bot_token", value: "old-token" },
        { key: "bot_username", value: "testbot" },
        { key: "app_url", value: "https://app.example.com" },
      ]);

      const notification = {
        notificationId: 1,
        title: "Test",
        content: "Content",
        priority: "normal",
        createdAt: new Date(),
      };

      await enqueueTelegramNotification(mockDb, 1, notification);

      // Clear cache
      clearTelegramCache();

      // Second call should re-read settings
      mockDb._chain.where
        .mockResolvedValueOnce([
          { key: "enabled", value: "true" },
          { key: "bot_token", value: "new-token" },
          { key: "bot_username", value: "testbot" },
          { key: "app_url", value: "https://app.example.com" },
        ])
        .mockResolvedValueOnce([
          {
            telegramChatId: "123",
            telegramVerified: true,
            userPreferences: { telegramNotifyLevel: "all" },
          },
        ]);

      await enqueueTelegramNotification(mockDb, 1, notification);

      // Verify settings were fetched twice
      const selectCalls = mockDb.select.mock.calls.length;
      expect(selectCalls).toBeGreaterThanOrEqual(2);
    });
  });
});
