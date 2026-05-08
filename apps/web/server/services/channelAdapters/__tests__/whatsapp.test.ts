/**
 * Tests for WhatsAppAdapter — HMAC verification, inbound parsing,
 * 24-hour window logic, and message formatting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Hoisted mock setup
const { mockDecrypt, mockAuditLog, mockDbSelect } = vi.hoisted(() => ({
  mockDecrypt: vi.fn(),
  mockAuditLog: vi.fn(),
  mockDbSelect: vi.fn(),
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

import { WhatsAppAdapter } from "../whatsapp";

const APP_SECRET = "app-secret";

function makeWhatsAppSignature(body: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hmac}`;
}

function makeWebhookPayload(messages?: any[]): any {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA-123",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "+1234567890", phone_number_id: "phone-123" },
              contacts: [{ profile: { name: "Alice" }, wa_id: "15551234567" }],
              messages: messages ?? [
                {
                  from: "15551234567",
                  id: "wamid.abc123",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: "Hello World" },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

describe("WhatsAppAdapter", () => {
  let adapter: WhatsAppAdapter;

  beforeEach(() => {
    adapter = new WhatsAppAdapter();
    vi.clearAllMocks();
  });

  describe("validateWebhook — HMAC-SHA256 with timingSafeEqual", () => {
    it("accepts a request with valid X-Hub-Signature-256", async () => {
      const body = JSON.stringify(makeWebhookPayload());
      const signature = makeWhatsAppSignature(body, APP_SECRET);

      const result = await adapter.validateWebhook({
        headers: { "x-hub-signature-256": signature },
        body: makeWebhookPayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        appSecret: APP_SECRET,
      } as any);

      expect(result).toBe(true);
    });

    it("rejects a request with tampered body (invalid signature)", async () => {
      const originalBody = JSON.stringify(makeWebhookPayload());
      const signature = makeWhatsAppSignature(originalBody, APP_SECRET);
      const tamperedBody = JSON.stringify({ ...makeWebhookPayload(), evil: true });

      const result = await adapter.validateWebhook({
        headers: { "x-hub-signature-256": signature },
        body: makeWebhookPayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(tamperedBody),
        appSecret: APP_SECRET,
      } as any);

      expect(result).toBe(false);
    });

    it("rejects a request with missing X-Hub-Signature-256 header", async () => {
      const body = JSON.stringify(makeWebhookPayload());

      const result = await adapter.validateWebhook({
        headers: {},
        body: makeWebhookPayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        appSecret: APP_SECRET,
      } as any);

      expect(result).toBe(false);
    });

    it("rejects when no appSecret available", async () => {
      const body = JSON.stringify(makeWebhookPayload());
      const signature = makeWhatsAppSignature(body, APP_SECRET);

      const result = await adapter.validateWebhook({
        headers: { "x-hub-signature-256": signature },
        body: makeWebhookPayload(),
        params: { connectionId: "conn-1" },
        rawBody: Buffer.from(body),
        appSecret: undefined,
      } as any);

      expect(result).toBe(false);
    });
  });

  describe("parseInbound — message parsing", () => {
    it("parses an inbound text message into a ParsedInbound event", async () => {
      const payload = makeWebhookPayload();
      const result = await adapter.parseInbound(payload, "conn-1");

      expect(result).not.toBeNull();
      expect(result!.event.channel.type).toBe("whatsapp");
      expect(result!.event.channel.connectionId).toBe("conn-1");
      expect(result!.event.message.text).toBe("Hello World");
      expect(result!.event.eventType).toBe("user_message");
      expect(result!.dedupKey).toContain("wamid.abc123");
    });

    it("parses an image message with caption", async () => {
      const payload = makeWebhookPayload([
        {
          from: "15551234567",
          id: "wamid.img001",
          timestamp: "1700000001",
          type: "image",
          image: { id: "img-media-id", mime_type: "image/jpeg", caption: "Look at this!" },
        },
      ]);

      const result = await adapter.parseInbound(payload, "conn-1");
      expect(result).not.toBeNull();
      expect(result!.event.message.text).toContain("Look at this!");
    });

    it("returns null for status-only webhooks (no messages array)", async () => {
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA-123",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: { display_phone_number: "+1234567890", phone_number_id: "phone-123" },
                  statuses: [{ id: "wamid.status1", status: "delivered", timestamp: "1700000000" }],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const result = await adapter.parseInbound(payload, "conn-1");
      expect(result).toBeNull();
    });
  });

  describe("formatMessage — WhatsApp 4096-char limit", () => {
    it("returns a single chunk for short messages", () => {
      const msg = "Hello, World!";
      const chunks = adapter.formatMessage(msg);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(msg);
    });

    it("splits messages exceeding 4096 characters into chunks", () => {
      const msg = "A".repeat(5000);
      const chunks = adapter.formatMessage(msg);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
      expect(chunks.join("")).toBe(msg);
    });
  });

  describe("sendMessage — 24-hour window enforcement", () => {
    it("sends a free-form text message when within the 24h window", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: "wamid.sent1" }] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await adapter.sendMessage(
        {
          accessToken: "test-token",
          phoneNumberId: "phone-123",
          lastInboundAt: Date.now() - 1000 * 60 * 60, // 1 hour ago (within window)
        },
        "15551234567",
        "Hello back!",
      );

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("phone-123/messages"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        }),
      );

      vi.unstubAllGlobals();
    });

    it("falls back to template when outside the 24h window", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ messages: [{ id: "wamid.tmpl1" }] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await adapter.sendMessage(
        {
          accessToken: "test-token",
          phoneNumberId: "phone-123",
          templateName: "hello_world",
          templateLanguage: "en",
          lastInboundAt: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago (outside window)
        },
        "15551234567",
        "Hello back!",
      );

      expect(result.ok).toBe(true);
      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.type).toBe("template");

      vi.unstubAllGlobals();
    });
  });
});
