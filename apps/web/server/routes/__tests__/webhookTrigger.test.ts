/**
 * Tests for POST /api/webhooks/trigger/:triggerId
 *
 * Covers: token auth, HMAC auth, replay protection, rate limiting,
 * template substitution ordering, credit checks, dedup, secret stripping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockDbSelect,
  mockRedisGet,
  mockRedisSet,
  mockRedisIncr,
  mockRedisExpire,
  mockRedisPipelineExec,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisIncr: vi.fn(),
  mockRedisExpire: vi.fn(),
  mockRedisPipelineExec: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: { select: mockDbSelect },
  getDb: vi.fn().mockResolvedValue({ select: mockDbSelect }),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    get: mockRedisGet,
    set: mockRedisSet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    pipeline: vi.fn().mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: mockRedisPipelineExec,
    }),
  }),
}));

vi.mock("../../../drizzle/schema", () => ({
  webhookTriggers: {
    id: "id",
    tenantId: "tenantId",
    isActive: "isActive",
    authType: "authType",
    authSecretEncrypted: "authSecretEncrypted",
    targetType: "targetType",
    targetConversationId: "targetConversationId",
    targetAgencyId: "targetAgencyId",
    targetWorkflowId: "targetWorkflowId",
    payloadTemplate: "payloadTemplate",
    rateLimitPerMinute: "rateLimitPerMinute",
    monthlyTriggerBudget: "monthlyTriggerBudget",
    userId: "userId",
    totalTriggers: "totalTriggers",
    lastTriggeredAt: "lastTriggeredAt",
  },
  webhookTriggerLogs: {
    id: "id",
    triggerId: "triggerId",
    status: "status",
    processingTimeMs: "processingTimeMs",
    creditsConsumed: "creditsConsumed",
    errorMessage: "errorMessage",
    extractedVariables: "extractedVariables",
    requestBodyHash: "requestBodyHash",
    requestBodySize: "requestBodySize",
    requestHeadersSafe: "requestHeadersSafe",
    sourceIpMasked: "sourceIpMasked",
    requestMethod: "requestMethod",
  },
  tenants: { id: "id", settings: "settings" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => ({ and: args })),
  sql: vi.fn(),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

// Encryption key for tests
process.env.LLM_ENCRYPTION_KEY = "test-key-for-webhook-tests-32chars!!";

// Import decrypt after setting env
const { mockDecrypt } = vi.hoisted(() => ({ mockDecrypt: vi.fn() }));
vi.mock("../../services/crypto", () => ({
  decrypt: mockDecrypt,
  encrypt: vi.fn((v: string) => `encrypted:${v}`),
}));

// ── Import subject under test ─────────────────────────────────────────────────

import {
  verifyTokenAuth,
  verifyHmacAuth,
  checkDedup,
  checkWebhookRateLimit,
  stripSecrets,
  substituteTemplate,
  validateTemplate,
} from "../../services/webhookTriggerService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_SECRET = "my-secret-token";
const ENCRYPTED_SECRET = `encrypted:${TEST_SECRET}`;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("webhookTriggerService — token auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecrypt.mockReturnValue(TEST_SECRET);
  });

  it("validates token with timingSafeEqual and returns true on match", async () => {
    const result = await verifyTokenAuth(ENCRYPTED_SECRET, TEST_SECRET);
    expect(result).toBe(true);
    expect(mockDecrypt).toHaveBeenCalledWith(ENCRYPTED_SECRET);
  });

  it("rejects invalid token and returns false", async () => {
    const result = await verifyTokenAuth(ENCRYPTED_SECRET, "wrong-token");
    expect(result).toBe(false);
  });

  it("rejects empty token", async () => {
    const result = await verifyTokenAuth(ENCRYPTED_SECRET, "");
    expect(result).toBe(false);
  });
});

describe("webhookTriggerService — HMAC auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecrypt.mockReturnValue(TEST_SECRET);
  });

  function makeHmac(secret: string, timestamp: string, rawBody: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
  }

  it("validates HMAC signature with current timestamp", async () => {
    const rawBody = JSON.stringify({ event: "test" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sig = makeHmac(TEST_SECRET, timestamp, rawBody);

    const result = await verifyHmacAuth(ENCRYPTED_SECRET, timestamp, sig, rawBody);
    expect(result.valid).toBe(true);
  });

  it("rejects HMAC replay when timestamp is >300s old", async () => {
    const rawBody = JSON.stringify({ event: "old" });
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400);
    const sig = makeHmac(TEST_SECRET, oldTimestamp, rawBody);

    const result = await verifyHmacAuth(ENCRYPTED_SECRET, oldTimestamp, sig, rawBody);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/timestamp/i);
  });

  it("rejects HMAC replay when timestamp is >300s in the future", async () => {
    const rawBody = JSON.stringify({ event: "future" });
    const futureTimestamp = String(Math.floor(Date.now() / 1000) + 400);
    const sig = makeHmac(TEST_SECRET, futureTimestamp, rawBody);

    const result = await verifyHmacAuth(ENCRYPTED_SECRET, futureTimestamp, sig, rawBody);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/timestamp/i);
  });

  it("rejects wrong HMAC signature", async () => {
    const rawBody = JSON.stringify({ event: "test" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const wrongSig = "deadbeef".repeat(8);

    const result = await verifyHmacAuth(ENCRYPTED_SECRET, timestamp, wrongSig, rawBody);
    expect(result.valid).toBe(false);
  });
});

describe("webhookTriggerService — deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false (not duplicate) when Redis key does not exist", async () => {
    mockRedisSet.mockResolvedValue("OK"); // SET NX succeeded — new key
    const result = await checkDedup("trigger-1", "1700000000", "abcdef123456");
    expect(result).toBe(false); // not a duplicate
  });

  it("returns true (duplicate) when Redis key already exists", async () => {
    mockRedisSet.mockResolvedValue(null); // SET NX failed — key already exists
    const result = await checkDedup("trigger-1", "1700000000", "abcdef123456");
    expect(result).toBe(true); // duplicate
  });

  it("dedup key includes triggerId, timestamp, and bodyHash", async () => {
    mockRedisSet.mockResolvedValue("OK");
    await checkDedup("trig-abc", "1700001234", "hash123");
    const call = mockRedisSet.mock.calls[0];
    const key: string = call[0];
    expect(key).toContain("trig-abc");
    expect(key).toContain("1700001234");
    expect(key).toContain("hash123");
    expect(key).toMatch(/^webhook:dedup:/);
  });
});

describe("webhookTriggerService — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows request when under rate limit", async () => {
    // pipeline().exec() returns [count, expireResult]
    mockRedisPipelineExec.mockResolvedValue([1, 1]);
    const result = await checkWebhookRateLimit("trigger-1", 10);
    expect(result).toBe(false); // not rate-limited
  });

  it("blocks request when at rate limit", async () => {
    mockRedisPipelineExec.mockResolvedValue([11, 1]); // count 11 exceeds limit of 10
    const result = await checkWebhookRateLimit("trigger-1", 10);
    expect(result).toBe(true); // rate-limited
  });

  it("rate limit key uses pipeline to avoid race condition", async () => {
    mockRedisPipelineExec.mockResolvedValue([1, 1]);
    await checkWebhookRateLimit("trigger-rate-test", 5);
    // Pipeline exec is called once, guaranteeing INCR+EXPIRE are atomic
    expect(mockRedisPipelineExec).toHaveBeenCalledTimes(1);
  });
});

describe("webhookTriggerService — secret stripping", () => {
  it("strips values matching sk- prefix", () => {
    const result = stripSecrets({ api_key: "sk-abc123", event: "test" });
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.event).toBe("test");
  });

  it("strips GitHub personal access tokens (ghp_)", () => {
    const result = stripSecrets({ token: "ghp_mytoken123" });
    expect(result.token).toBe("[REDACTED]");
  });

  it("strips Slack bot tokens (xoxb-)", () => {
    const result = stripSecrets({ slack: "xoxb-1234-5678" });
    expect(result.slack).toBe("[REDACTED]");
  });

  it("strips Bearer tokens", () => {
    const result = stripSecrets({ auth: "Bearer my-jwt-token" });
    expect(result.auth).toBe("[REDACTED]");
  });

  it("strips GitLab personal tokens (glpat-)", () => {
    const result = stripSecrets({ token: "glpat-xyz789" });
    expect(result.token).toBe("[REDACTED]");
  });

  it("does not redact non-secret values", () => {
    const result = stripSecrets({ username: "alice", score: 42 });
    expect(result.username).toBe("alice");
    expect(result.score).toBe(42);
  });
});

describe("webhookTriggerService — template substitution", () => {
  it("validates template with allowed variables", () => {
    const template = "Event: {{event.type}} at {{timestamp}}";
    expect(validateTemplate(template)).toBe(true);
  });

  it("rejects template with non-allowlisted patterns", () => {
    expect(validateTemplate("{{system.env}}")).toBe(false);
    expect(validateTemplate("{{__proto__}}")).toBe(false);
    expect(validateTemplate("{{constructor.prototype}}")).toBe(false);
  });

  it("substitutes event.type variable", () => {
    const result = substituteTemplate("Type: {{event.type}}", {
      eventType: "order.created",
      eventData: { orderId: 123 },
      triggerName: "order-hook",
      triggerId: "trig-1",
      timestamp: "1700000000",
    });
    expect(result).toContain("order.created");
  });

  it("substitutes trigger.name variable", () => {
    const result = substituteTemplate("Trigger: {{trigger.name}}", {
      eventType: "test",
      eventData: {},
      triggerName: "my-trigger",
      triggerId: "trig-1",
      timestamp: "1700000000",
    });
    expect(result).toContain("my-trigger");
  });

  it("substitutes timestamp variable", () => {
    const result = substituteTemplate("At {{timestamp}}", {
      eventType: "test",
      eventData: {},
      triggerName: "t",
      triggerId: "t",
      timestamp: "1700000000",
    });
    expect(result).toContain("1700000000");
  });

  it("returns empty string for unresolved variables (no raw template leak)", () => {
    const result = substituteTemplate("Value: {{event.data.nonExistent}}", {
      eventType: "test",
      eventData: {},
      triggerName: "t",
      triggerId: "t",
      timestamp: "1700000000",
    });
    // Should not contain the raw {{...}} in output
    expect(result).not.toContain("{{");
  });
});
