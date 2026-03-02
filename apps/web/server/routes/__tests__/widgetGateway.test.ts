/**
 * Tests for Widget Gateway — init token generation/validation and WebSocket handler logic.
 *
 * Covers:
 * - HMAC-signed init token generation and validation
 * - Expired init token rejection
 * - Token payload shape (tenantId, widgetId, visitorSessionId, iat, exp)
 * - Token TTL is 24 hours
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";

// ── Module mocks ─────────────────────────────────────────────────────────────

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    select: mockDbSelect,
  },
  getDb: vi.fn().mockResolvedValue({
    select: mockDbSelect,
  }),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/redisClients", () => ({
  getCacheClient: vi.fn().mockReturnValue({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

vi.mock("../../../drizzle/schema", () => ({
  chatWidgets: { id: "id", tenantId: "tenantId", isActive: "isActive", allowedOrigins: "allowedOrigins" },
}));

// Set test encryption key before importing module
process.env.LLM_ENCRYPTION_KEY = "test-encryption-key-for-widget-tests-32chars";

// ── Import subject under test ─────────────────────────────────────────────────

import {
  generateInitToken,
  validateInitToken,
  INIT_TOKEN_TTL_SECONDS,
} from "../widgetGateway";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePayload(overrides?: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  return {
    tenantId: "tenant-abc",
    widgetId: "widget-xyz",
    visitorSessionId: crypto.randomUUID(),
    iat: now,
    exp: now + INIT_TOKEN_TTL_SECONDS,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Widget Init Token", () => {
  it("generates HMAC-signed init token with correct payload shape", () => {
    const payload = makePayload();
    const token = generateInitToken(payload);
    expect(typeof token).toBe("string");
    const [payloadPart, sigPart] = token.split(".");
    expect(payloadPart).toBeTruthy();
    expect(sigPart).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString());
    expect(decoded.tenantId).toBe(payload.tenantId);
    expect(decoded.widgetId).toBe(payload.widgetId);
    expect(decoded.visitorSessionId).toBe(payload.visitorSessionId);
    expect(typeof decoded.iat).toBe("number");
    expect(typeof decoded.exp).toBe("number");
  });

  it("token TTL is 24 hours from issuance", () => {
    expect(INIT_TOKEN_TTL_SECONDS).toBe(86400);
    const payload = makePayload();
    expect(payload.exp - payload.iat).toBe(86400);
  });

  it("includes tenantId, widgetId, visitorSessionId, iat, exp in token payload", () => {
    const payload = makePayload();
    const token = generateInitToken(payload);
    const [payloadPart] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payloadPart, "base64url").toString());
    expect(Object.keys(decoded)).toEqual(
      expect.arrayContaining(["tenantId", "widgetId", "visitorSessionId", "iat", "exp"])
    );
  });
});

describe("Widget Token Validation", () => {
  it("accepts valid HMAC-signed token", () => {
    const payload = makePayload();
    const token = generateInitToken(payload);
    const result = validateInitToken(token);
    expect(result).not.toBeNull();
    expect(result?.widgetId).toBe(payload.widgetId);
    expect(result?.tenantId).toBe(payload.tenantId);
  });

  it("rejects token with tampered payload", () => {
    const payload = makePayload();
    const token = generateInitToken(payload);
    const [, sig] = token.split(".");
    // Tamper with payload
    const tampered = Buffer.from(JSON.stringify({ ...payload, tenantId: "evil-tenant" })).toString("base64url");
    const tamperedToken = `${tampered}.${sig}`;
    expect(validateInitToken(tamperedToken)).toBeNull();
  });

  it("rejects token past exp (24h TTL)", () => {
    const now = Math.floor(Date.now() / 1000);
    // Expired 1 hour ago
    const payload = makePayload({ iat: now - 90000, exp: now - 3600 });
    const token = generateInitToken(payload);
    expect(validateInitToken(token)).toBeNull();
  });

  it("rejects token with missing required fields", () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + 86400 }; // missing tenantId, widgetId, visitorSessionId
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
    // Use wrong sig (empty string sig will also fail HMAC)
    const fakeToken = `${payloadStr}.bm90YXNpZ25hdHVyZQ==`;
    expect(validateInitToken(fakeToken)).toBeNull();
  });

  it("rejects malformed token string", () => {
    expect(validateInitToken("notavalidtoken")).toBeNull();
    expect(validateInitToken("")).toBeNull();
    expect(validateInitToken("only.two")).toBeNull();
  });
});

describe("Widget WebSocket close codes", () => {
  it("CLOSE_CODE_UNAUTHORIZED is 4001", async () => {
    const { CLOSE_CODE_UNAUTHORIZED } = await import("../widgetGateway");
    expect(CLOSE_CODE_UNAUTHORIZED).toBe(4001);
  });

  it("CLOSE_CODE_RATE_LIMIT is 4003", async () => {
    const { CLOSE_CODE_RATE_LIMIT } = await import("../widgetGateway");
    expect(CLOSE_CODE_RATE_LIMIT).toBe(4003);
  });
});
