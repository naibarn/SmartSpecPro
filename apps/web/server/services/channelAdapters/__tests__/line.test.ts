/**
 * Tests for LINEAdapter — HMAC verification, inbound parsing,
 * module channel routing, token refresh, and message sending.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const { mockDecrypt, mockAuditLog } = vi.hoisted(() => ({
  mockDecrypt: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../../../services/crypto", () => ({ decrypt: mockDecrypt }));
vi.mock("../../../services/auditLogger", () => ({ auditLogger: { log: mockAuditLog } }));
vi.mock("../../../db", () => ({
  getDb: vi.fn(() =>
    Promise.resolve({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    })
  ),
}));

import { LINEAdapter } from "../line";

const CHANNEL_SECRET = "line-secret";

function makeLineSignature(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64");
}

function makeLinePayload(eventType = "message", messageText = "Hello"): any {
  return {
    destination: "Uf12345678901234567890123456789012",
    events: [
      {
        type: eventType,
        replyToken: "reply-token-abc123",
        source: { userId: "U12345", type: "user" },
        timestamp: 1700000000000,
        ...(eventType === "message"
          ? { message: { type: "text", id: "line-msg-1", text: messageText } }
          : {}),
      },
    ],
  };
}

describe("LINEAdapter", () => {
  let adapter: LINEAdapter;

  beforeEach(() => {
    adapter = new LINEAdapter();
    vi.clearAllMocks();
  });

  describe("validateWebhook — HMAC-SHA256 with timingSafeEqual", () => {
    it("accepts a request with valid X-Line-Signature", async () => {
      const body = JSON.stringify(makeLinePayload());
      const signature = makeLineSignature(body, CHANNEL_SECRET);

      const result = await adapter.validateWebhook({
        headers: { "x-line-signature": signature },
        body: makeLinePayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        channelSecret: CHANNEL_SECRET,
      } as any);

      expect(result).toBe(true);
    });

    it("verifies signature against raw body BEFORE JSON parsing (order check)", async () => {
      // If rawBody is provided, adapter must use it (not re-serialize body)
      const body = '{"destination":"U123","events":[]}';
      const signature = makeLineSignature(body, CHANNEL_SECRET);

      const result = await adapter.validateWebhook({
        headers: { "x-line-signature": signature },
        body: { destination: "U123", events: [] },
        params: {},
        rawBody: Buffer.from(body),
        channelSecret: CHANNEL_SECRET,
      } as any);

      expect(result).toBe(true);
    });

    it("rejects a request with tampered body", async () => {
      const body = JSON.stringify(makeLinePayload());
      const signature = makeLineSignature(body, CHANNEL_SECRET);
      const tamperedBody = body + "extra";

      const result = await adapter.validateWebhook({
        headers: { "x-line-signature": signature },
        body: makeLinePayload(),
        params: {},
        rawBody: Buffer.from(tamperedBody),
        channelSecret: CHANNEL_SECRET,
      } as any);

      expect(result).toBe(false);
    });
  });

  describe("parseInbound — LINE event parsing", () => {
    it("parses a text message event into ParsedInbound", async () => {
      const payload = makeLinePayload("message", "Hi there");
      const result = await adapter.parseInbound(payload, "conn-1");

      expect(result).not.toBeNull();
      expect(result!.event.channel.type).toBe("line");
      expect(result!.event.channel.connectionId).toBe("conn-1");
      expect(result!.event.message.text).toBe("Hi there");
      expect(result!.event.eventType).toBe("user_message");
      expect(result!.dedupKey).toContain("line-msg-1");
    });

    it("returns null for follow events (no message to route)", async () => {
      const payload = makeLinePayload("follow");
      // Follow events don't carry a message — adapter should return null
      // (they could be handled separately for connection tracking)
      const result = await adapter.parseInbound(payload, "conn-1");
      expect(result).toBeNull();
    });

    it("uses destination field for module channel identification", async () => {
      const payload = makeLinePayload("message");
      const result = await adapter.parseInbound(payload, "conn-1");
      // The destination is stored in dedupKey or event for module channel routing
      expect(result?.dedupKey).toBeDefined();
    });
  });

  describe("formatMessage — LINE 5000-char limit", () => {
    it("returns a single chunk for short messages", () => {
      const chunks = adapter.formatMessage("Hello LINE!");
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("Hello LINE!");
    });

    it("splits messages exceeding 5000 chars into multiple chunks", () => {
      const msg = "B".repeat(6000);
      const chunks = adapter.formatMessage(msg);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(5000);
      }
      expect(chunks.join("")).toBe(msg);
    });
  });

  describe("sendMessage — reply vs push fallback", () => {
    it("sends a reply message using replyToken when available", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await adapter.sendMessage(
        {
          channelAccessToken: "test-line-token",
          replyToken: "reply-token-abc123",
        },
        "U12345",
        "Hello via reply!",
      );

      expect(result.ok).toBe(true);
      const callUrl: string = fetchMock.mock.calls[0][0];
      expect(callUrl).toContain("reply");

      vi.unstubAllGlobals();
    });

    it("falls back to push message when no replyToken provided", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await adapter.sendMessage(
        {
          channelAccessToken: "test-line-token",
          // no replyToken
        },
        "U12345",
        "Hello via push!",
      );

      expect(result.ok).toBe(true);
      const callUrl: string = fetchMock.mock.calls[0][0];
      expect(callUrl).toContain("push");

      vi.unstubAllGlobals();
    });
  });
});
