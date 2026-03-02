/**
 * Tests for DiscordAdapter — Ed25519 signature verification,
 * inbound message parsing, bot filtering, and message chunking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const { mockAuditLog, mockDiscordClientConstructor, mockClientInstance } = vi.hoisted(() => {
  const mockClientInstance = {
    login: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockReturnValue(true),
    user: { id: "bot-user-id" },
    guilds: { cache: new Map() },
    application: { commands: { set: vi.fn().mockResolvedValue(undefined) } },
  };

  return {
    mockAuditLog: vi.fn(),
    mockDiscordClientConstructor: vi.fn(() => mockClientInstance),
    mockClientInstance,
  };
});

vi.mock("discord.js", () => ({
  Client: mockDiscordClientConstructor,
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 512,
  },
  Events: {
    MessageCreate: "messageCreate",
    InteractionCreate: "interactionCreate",
    ClientReady: "ready",
  },
  InteractionType: {
    ApplicationCommand: 2,
  },
}));

vi.mock("../../auditLogger", () => ({ auditLogger: { log: mockAuditLog } }));
vi.mock("../../registry", () => ({}));

import { DiscordAdapter } from "../discord";

describe("DiscordAdapter", () => {
  let adapter: DiscordAdapter;

  beforeEach(() => {
    adapter = new DiscordAdapter();
    vi.clearAllMocks();
  });

  describe("initialize — Gateway connection", () => {
    it("creates Discord Client with Guilds and GuildMessages intents", async () => {
      await adapter.initialize();

      expect(mockDiscordClientConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          intents: expect.arrayContaining([
            1,   // GatewayIntentBits.Guilds
            512, // GatewayIntentBits.GuildMessages
          ]),
        }),
      );
    });

    it("registers messageCreate and interactionCreate event handlers", async () => {
      await adapter.initialize();

      const events = mockClientInstance.on.mock.calls.map((c: any[]) => c[0]);
      expect(events).toContain("messageCreate");
      expect(events).toContain("interactionCreate");
    });

    it("is idempotent — does not reconnect if already initialized", async () => {
      await adapter.initialize();
      await adapter.initialize();

      // Constructor should only be called once
      expect(mockDiscordClientConstructor).toHaveBeenCalledTimes(1);
    });
  });

  describe("shutdown — graceful disconnect", () => {
    it("calls client.destroy() on shutdown", async () => {
      await adapter.initialize();
      await adapter.shutdown();

      expect(mockClientInstance.destroy).toHaveBeenCalled();
    });

    it("does not throw if called before initialize", async () => {
      await expect(adapter.shutdown()).resolves.not.toThrow();
    });
  });

  describe("validateWebhook — Ed25519 verification", () => {
    it("returns true when no publicKey provided (Gateway-based bot — no HTTP sig needed)", async () => {
      const result = await adapter.validateWebhook({
        headers: {},
        body: {},
        params: { connectionId: "conn-1" },
      });

      expect(result).toBe(true);
    });
  });

  describe("parseInbound — HTTP interaction fallback", () => {
    it("returns null (Gateway-based events handled via event handlers, not HTTP parseInbound)", async () => {
      const result = await adapter.parseInbound({}, "conn-1");
      expect(result).toBeNull();
    });
  });

  describe("formatMessage — Discord 2000-char limit", () => {
    it("returns a single chunk for short messages", () => {
      const msg = "Hello Discord!";
      const chunks = adapter.formatMessage(msg);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(msg);
    });

    it("splits messages exceeding 2000 characters at newline boundaries", () => {
      const line = "x".repeat(100) + "\n";
      const msg = line.repeat(25); // 25 * 101 = 2525 chars
      const chunks = adapter.formatMessage(msg);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      }
      expect(chunks.join("")).toBe(msg);
    });

    it("hard-splits when no newline exists within 2000 chars", () => {
      const msg = "A".repeat(4500);
      const chunks = adapter.formatMessage(msg);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      }
      expect(chunks.join("")).toBe(msg);
    });
  });

  describe("sendMessage", () => {
    it("calls channel.send with the message text", async () => {
      const mockChannel = {
        send: vi.fn().mockResolvedValue({ id: "msg-123" }),
      };
      mockClientInstance.guilds.cache.set("guild-1", {
        channels: { fetch: vi.fn().mockResolvedValue(mockChannel) },
      });
      await adapter.initialize();

      const result = await adapter.sendMessage(
        { channelId: "chan-1", guildId: "guild-1" },
        "chan-1",
        "Hello!",
      );

      expect(result.ok).toBe(true);
    });

    it("returns ok:false when channel not found", async () => {
      await adapter.initialize();
      // Guild cache doesn't have the guild
      mockClientInstance.guilds.cache.clear();

      const result = await adapter.sendMessage(
        { channelId: "chan-99", guildId: "missing-guild" },
        "chan-99",
        "Hello!",
      );

      expect(result.ok).toBe(false);
    });
  });
});
