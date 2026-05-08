/**
 * Tests for SlackAdapter — HMAC-SHA256 signing verification,
 * message formatting (Block Kit), and inbound parsing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Hoisted mock setup
const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
}));

vi.mock("../../auditLogger", () => ({ auditLogger: { log: mockAuditLog } }));
vi.mock("../../registry", () => ({}));

import { SlackAdapter } from "../slack";

const SIGNING_SECRET = "slack-secret";

function makeSlackSignature(body: string, secret: string, timestamp: string): string {
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", secret).update(baseString).digest("hex");
  return `v0=${hmac}`;
}

function nowTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function makeSlackMessagePayload(text = "hello world", botId?: string, subtype?: string): unknown {
  return {
    type: "event_callback",
    team_id: "T123",
    event: {
      type: "message",
      text,
      user: "U456",
      ts: "1700000000.000100",
      channel: "C789",
      ...(botId ? { bot_id: botId } : {}),
      ...(subtype ? { subtype } : {}),
    },
  };
}

describe("SlackAdapter", () => {
  let adapter: SlackAdapter;

  beforeEach(() => {
    adapter = new SlackAdapter();
    vi.clearAllMocks();
  });

  describe("validateWebhook — HMAC-SHA256 signing secret", () => {
    it("accepts a request with valid X-Slack-Signature", async () => {
      const body = JSON.stringify(makeSlackMessagePayload());
      const ts = nowTimestamp();
      const sig = makeSlackSignature(body, SIGNING_SECRET, ts);

      const result = await adapter.validateWebhook({
        headers: {
          "x-slack-signature": sig,
          "x-slack-request-timestamp": ts,
        },
        body: makeSlackMessagePayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        signingSecret: SIGNING_SECRET,
      } as any);

      expect(result).toBe(true);
    });

    it("rejects a request with tampered body (invalid HMAC)", async () => {
      const body = JSON.stringify(makeSlackMessagePayload());
      const ts = nowTimestamp();
      const sig = makeSlackSignature(body, SIGNING_SECRET, ts);
      const tamperedBody = JSON.stringify({ ...makeSlackMessagePayload(), evil: true });

      const result = await adapter.validateWebhook({
        headers: {
          "x-slack-signature": sig,
          "x-slack-request-timestamp": ts,
        },
        body: makeSlackMessagePayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(tamperedBody), // tampered raw body
        signingSecret: SIGNING_SECRET,
      } as any);

      expect(result).toBe(false);
    });

    it("rejects a request with a stale timestamp (>5 minutes old)", async () => {
      const body = JSON.stringify(makeSlackMessagePayload());
      const staleTs = Math.floor(Date.now() / 1000 - 400).toString(); // 6+ minutes ago
      const sig = makeSlackSignature(body, SIGNING_SECRET, staleTs);

      const result = await adapter.validateWebhook({
        headers: {
          "x-slack-signature": sig,
          "x-slack-request-timestamp": staleTs,
        },
        body: makeSlackMessagePayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        signingSecret: SIGNING_SECRET,
      } as any);

      expect(result).toBe(false);
    });

    it("rejects when signingSecret is missing", async () => {
      const body = JSON.stringify(makeSlackMessagePayload());
      const ts = nowTimestamp();

      const result = await adapter.validateWebhook({
        headers: { "x-slack-request-timestamp": ts },
        body: makeSlackMessagePayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        signingSecret: undefined,
      } as any);

      expect(result).toBe(false);
    });

    it("rejects when X-Slack-Signature header is missing", async () => {
      const body = JSON.stringify(makeSlackMessagePayload());
      const ts = nowTimestamp();

      const result = await adapter.validateWebhook({
        headers: { "x-slack-request-timestamp": ts },
        body: makeSlackMessagePayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        signingSecret: SIGNING_SECRET,
      } as any);

      expect(result).toBe(false);
    });
  });

  describe("parseInbound — Slack Events API", () => {
    it("parses an event_callback message into a ParsedInbound event", async () => {
      const payload = makeSlackMessagePayload("Hello from Slack");
      const result = await adapter.parseInbound(payload, "conn-1");

      expect(result).not.toBeNull();
      expect(result!.event.channel.type).toBe("slack");
      expect(result!.event.channel.connectionId).toBe("conn-1");
      expect(result!.event.message.text).toBe("Hello from Slack");
      expect(result!.event.eventType).toBe("user_message");
      expect(result!.dedupKey).toContain("slack:");
    });

    it("ignores messages with bot_id set (bot message filter)", async () => {
      const payload = makeSlackMessagePayload("I am a bot", "BXXX");
      const result = await adapter.parseInbound(payload, "conn-1");
      expect(result).toBeNull();
    });

    it("ignores messages with subtype=bot_message", async () => {
      const payload = makeSlackMessagePayload("bot_message_subtype", undefined, "bot_message");
      const result = await adapter.parseInbound(payload, "conn-1");
      expect(result).toBeNull();
    });

    it("returns null for url_verification events", async () => {
      const payload = { type: "url_verification", challenge: "abc123" };
      const result = await adapter.parseInbound(payload, "conn-1");
      expect(result).toBeNull();
    });

    it("returns null for non-message event types", async () => {
      const payload = {
        type: "event_callback",
        event: { type: "app_mention", text: "hello" },
      };
      const result = await adapter.parseInbound(payload, "conn-1");
      expect(result).toBeNull();
    });
  });

  describe("formatMessage — Block Kit with 3000-char limit", () => {
    it("returns a single chunk for short messages", () => {
      const msg = "Hello, World!";
      const chunks = adapter.formatMessage(msg);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(msg);
    });

    it("splits messages exceeding 3000 characters into multiple chunks", () => {
      const msg = "A".repeat(6500);
      const chunks = adapter.formatMessage(msg);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(3000);
      }
      const combined = chunks.join("");
      expect(combined).toBe(msg);
    });

    it("escapes & < > characters for mrkdwn safety", () => {
      const chunks = adapter.formatMessage("5 > 3 & 2 < 4 means <b>bold</b>");
      const text = chunks.join("");
      expect(text).toContain("&amp;");
      expect(text).toContain("&lt;");
      expect(text).toContain("&gt;");
    });
  });

  describe("sendMessage", () => {
    it("calls Slack chat.postMessage with correct token and channel", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, ts: "1700000001.000200" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await adapter.sendMessage(
        { botToken: "xoxb-test-token", channelId: "C789" },
        "C789",
        "Hello Slack!",
      );

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer xoxb-test-token",
          }),
        }),
      );

      vi.unstubAllGlobals();
    });

    it("returns ok:false when Slack API returns ok:false", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, error: "channel_not_found" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await adapter.sendMessage(
        { botToken: "xoxb-test-token", channelId: "C789" },
        "C789",
        "Hello!",
      );

      expect(result.ok).toBe(false);
      vi.unstubAllGlobals();
    });
  });
});
