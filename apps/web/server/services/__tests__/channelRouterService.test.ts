import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const { mockRedisGet, mockRedisSet, mockRedisDel, mockGetRedisClient, mockDbSelect, mockDbUpdate } =
  vi.hoisted(() => {
    const mockRedisGet = vi.fn();
    const mockRedisSet = vi.fn();
    const mockRedisDel = vi.fn();
    const mockGetRedisClient = vi.fn(() => ({
      get: mockRedisGet,
      set: mockRedisSet,
      del: mockRedisDel,
    }));

    const mockWhere = vi.fn().mockReturnThis();
    const mockOrderBy = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn(() => ({ where: mockWhere.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy }) }));
    const mockDbSelect = vi.fn(() => ({ from: mockFrom }));

    const mockDbUpdateSet = vi.fn().mockReturnThis();
    const mockDbUpdateWhere = vi.fn().mockReturnThis();
    const mockDbUpdateCatch = vi.fn();
    const mockDbUpdate = vi.fn(() => ({
      set: mockDbUpdateSet.mockReturnValue({ where: mockDbUpdateWhere.mockReturnValue({ catch: mockDbUpdateCatch }) }),
    }));

    return { mockRedisGet, mockRedisSet, mockRedisDel, mockGetRedisClient, mockDbSelect, mockDbUpdate };
  });

vi.mock("../../db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock("../redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

vi.mock("../../../drizzle/schema", () => ({
  channelRoutingRules: {
    tenantId: "crr.tenantId",
    isActive: "crr.isActive",
    priority: "crr.priority",
    id: "crr.id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _type: "eq", val })),
  and: vi.fn((...args: unknown[]) => ({ _type: "and", args })),
  desc: vi.fn((col: unknown) => ({ _type: "desc", col })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ _type: "sql", strings, values })),
    { raw: vi.fn((s: string) => ({ _type: "sql_raw", s })) },
  ),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

import { evaluateRules, invalidateCache } from "../channelRouterService";
import type { ChatIngressEvent } from "@shared/channelTypes";

// --- Helpers ---

function makeEvent(overrides: Partial<ChatIngressEvent> = {}): ChatIngressEvent {
  return {
    eventId: "evt-1",
    eventType: "user_message",
    tenantId: "tenant-1",
    userId: 42,
    conversationId: "conv-1",
    conversationType: "chat",
    channel: { type: "telegram", connectionId: "conn-1" },
    message: { text: "hello world", attachments: [] },
    idempotencyKey: "tg:bot1:100",
    ...overrides,
  };
}

function makeRule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    name: "Test Rule",
    priority: 100,
    isActive: true,
    conditions: [{ field: "message.text", operator: "contains", value: "hello" }],
    targetType: "agency",
    targetAgencyId: "agency-1",
    targetPersonaId: null,
    targetWorkflowId: null,
    totalMatches: 0,
    lastMatchedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setupDbRules(rules: ReturnType<typeof makeRule>[]) {
  // DB chain: select().from().where().orderBy()
  const mockOrderBy = vi.fn().mockResolvedValue(rules);
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
}

describe("channelRouterService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: cache miss
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
  });

  describe("evaluateRules", () => {
    it("returns null when no rules match the event", async () => {
      const rules = [
        makeRule({
          conditions: [{ field: "message.text", operator: "contains", value: "goodbye" }],
        }),
      ];
      setupDbRules(rules);

      const result = await evaluateRules(makeEvent(), "tenant-1");
      expect(result).toBeNull();
    });

    it("returns first matching rule and stops evaluation", async () => {
      const rule1 = makeRule({
        id: "rule-high",
        priority: 200,
        conditions: [{ field: "message.text", operator: "contains", value: "hello" }],
        targetAgencyId: "agency-high",
      });
      const rule2 = makeRule({
        id: "rule-low",
        priority: 100,
        conditions: [{ field: "message.text", operator: "contains", value: "hello" }],
        targetAgencyId: "agency-low",
      });
      // DB returns rules in priority DESC order
      setupDbRules([rule1, rule2]);

      const result = await evaluateRules(makeEvent({ message: { text: "hello there", attachments: [] } }), "tenant-1");
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe("rule-high");
    });

    it("requires ALL conditions to match for a rule to fire (AND semantics)", async () => {
      const rules = [
        makeRule({
          conditions: [
            { field: "message.text", operator: "contains", value: "hello" },
            { field: "channel.type", operator: "eq", value: "whatsapp" }, // event has telegram
          ],
        }),
      ];
      setupDbRules(rules);

      const result = await evaluateRules(makeEvent(), "tenant-1");
      expect(result).toBeNull();
    });

    it("evaluates rules in priority DESC order (highest first)", async () => {
      const highPriority = makeRule({
        id: "high-priority",
        priority: 999,
        conditions: [{ field: "message.text", operator: "contains", value: "nomatch" }],
        targetAgencyId: "agency-high",
      });
      const lowPriority = makeRule({
        id: "low-priority",
        priority: 1,
        conditions: [{ field: "message.text", operator: "contains", value: "hello" }],
        targetAgencyId: "agency-low",
      });
      // DB returns high-priority first (DESC order), high-priority doesn't match, low does
      setupDbRules([highPriority, lowPriority]);

      const result = await evaluateRules(makeEvent(), "tenant-1");
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe("low-priority");
    });

    it("rejects regex operator (treats as non-matching — ReDoS prevention)", async () => {
      const rules = [
        makeRule({
          conditions: [{ field: "message.text", operator: "regex", value: "hel+" }],
        }),
      ];
      setupDbRules(rules);

      // Even though message matches the pattern, regex operator is rejected
      const result = await evaluateRules(makeEvent(), "tenant-1");
      expect(result).toBeNull();
    });

    it("supports eq operator (case-insensitive exact match)", async () => {
      setupDbRules([
        makeRule({ conditions: [{ field: "message.text", operator: "eq", value: "HELLO WORLD" }] }),
      ]);
      const result = await evaluateRules(makeEvent({ message: { text: "hello world", attachments: [] } }), "tenant-1");
      expect(result).not.toBeNull();
    });

    it("supports contains operator (case-insensitive substring)", async () => {
      setupDbRules([
        makeRule({ conditions: [{ field: "message.text", operator: "contains", value: "HELLO" }] }),
      ]);
      const result = await evaluateRules(makeEvent({ message: { text: "hello world", attachments: [] } }), "tenant-1");
      expect(result).not.toBeNull();
    });

    it("supports startsWith operator", async () => {
      setupDbRules([
        makeRule({ conditions: [{ field: "message.text", operator: "startsWith", value: "hello" }] }),
      ]);
      const result = await evaluateRules(makeEvent({ message: { text: "hello world", attachments: [] } }), "tenant-1");
      expect(result).not.toBeNull();
    });

    it("supports endsWith operator", async () => {
      setupDbRules([
        makeRule({ conditions: [{ field: "message.text", operator: "endsWith", value: "world" }] }),
      ]);
      const result = await evaluateRules(makeEvent({ message: { text: "hello world", attachments: [] } }), "tenant-1");
      expect(result).not.toBeNull();
    });

    it("supports in operator (comma-separated string)", async () => {
      setupDbRules([
        makeRule({ conditions: [{ field: "channel.type", operator: "in", value: "telegram,whatsapp" }] }),
      ]);
      const result = await evaluateRules(makeEvent({ channel: { type: "telegram" } }), "tenant-1");
      expect(result).not.toBeNull();
    });

    it("loads rules from Redis cache when available (DB not queried)", async () => {
      const cachedRules = [makeRule()];
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedRules));

      await evaluateRules(makeEvent(), "tenant-1");

      // DB should NOT be called
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("loads rules from DB on cache miss and populates cache", async () => {
      mockRedisGet.mockResolvedValue(null);
      setupDbRules([makeRule()]);

      await evaluateRules(makeEvent(), "tenant-1");

      expect(mockRedisSet).toHaveBeenCalledWith(
        "channel-router:rules:tenant-1",
        expect.any(String),
        "EX",
        30,
      );
    });
  });

  describe("invalidateCache", () => {
    it("deletes the Redis key for the given tenant", async () => {
      await invalidateCache("tenant-abc");

      expect(mockRedisDel).toHaveBeenCalledWith("channel-router:rules:tenant-abc");
    });
  });
});
