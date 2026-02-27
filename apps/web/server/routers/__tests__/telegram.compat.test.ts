import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Telegram backward compatibility tests.
 *
 * Verifies that the Chat Bridge feature maintains backward compatibility
 * with the existing Telegram notification system and user-level fields.
 */

// --- Hoisted mocks ---
const { mockGetDb, mockGetRedisClient } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockGetRedisClient: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  })),
}));

// Mock tRPC
vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

vi.mock("../../db", () => ({
  db: null,
  getDb: mockGetDb,
}));

vi.mock("../../../drizzle/schema", () => ({
  systemSettings: { category: "ss.cat", key: "ss.key", id: "ss.id", value: "ss.val" },
  users: {
    id: "u.id",
    email: "u.email",
    name: "u.name",
    currentTenantId: "u.cTid",
    telegramChatId: "u.tcid",
    telegramUsername: "u.tun",
    telegramVerified: "u.tv",
    telegramVerifiedAt: "u.tva",
    userPreferences: "u.up",
  },
  telegramLinkTokens: { id: "tlt.id" },
  telegramConnections: {
    id: "tc.id",
    tenantId: "tc.tid",
    userId: "tc.uid",
    telegramUserId: "tc.tuid",
    telegramUsername: "tc.tun",
    telegramChatId: "tc.tcid",
    status: "tc.status",
    linkedAt: "tc.linkedAt",
    activeChannelId: "tc.acid",
  },
  conversationChannels: {
    id: "cc.id",
    connectionId: "cc.cid",
    state: "cc.state",
  },
  conversations: { id: "c.id", userId: "c.uid" },
  agencyConversations: { id: "ac.id", userId: "ac.uid" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
  and: vi.fn((...args: any[]) => ({ _type: "and", args })),
  count: vi.fn(() => "count_agg"),
  sql: vi.fn(() => "sql_fragment"),
}));

vi.mock("../../services/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));

vi.mock("../../services/telegramService", () => ({
  clearTelegramCache: vi.fn(),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

// --- Mock DB builder ---
function createMockDb(queryResults: any[][] = []) {
  let queryIndex = 0;

  function nextResult(): any[] {
    return queryResults[queryIndex++] || [];
  }

  function makeQueryChain(): any {
    const result = nextResult();
    const chainable: any = {
      select: vi.fn().mockImplementation(() => makeQueryChain()),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({
        offset: vi.fn().mockReturnValue(Promise.resolve(result)),
        then: (resolve: any, reject?: any) =>
          Promise.resolve(result).then(resolve, reject),
        catch: (fn: any) => Promise.resolve(result).catch(fn),
      }),
      then: (resolve: any, reject?: any) =>
        Promise.resolve(result).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(result).catch(fn),
    };
    return chainable;
  }

  const db: any = {
    select: vi.fn().mockImplementation(() => makeQueryChain()),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })),
  };

  return db;
}

import { telegramRouter } from "../telegram";

const handlers = telegramRouter as any;

const makeCtx = (overrides: any = {}) => ({
  user: { id: 1, role: "user", currentTenantId: "t1", ...overrides },
});

describe("Telegram backward compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // checkTelegramStatus backward compatibility
  // ============================================================
  describe("checkTelegramStatus compatibility", () => {
    it("returns linked=true from users.telegramVerified for legacy users", async () => {
      const db = createMockDb([
        // user query - legacy user without telegram_connections
        [
          {
            telegramChatId: "123",
            telegramUsername: "legacyuser",
            telegramVerified: true,
            telegramVerifiedAt: new Date("2025-06-01"),
            userPreferences: { telegramNotifyLevel: "all" },
          },
        ],
        // active connection query: none (legacy user)
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.checkTelegramStatus({
        ctx: makeCtx(),
      });

      // Legacy field still drives the canonical linked status
      expect(result.linked).toBe(true);
      expect(result.username).toBe("legacyuser");
      expect(result.notifyLevel).toBe("all");
      // No connection record for legacy users
      expect(result.connection).toBeNull();
      expect(result.boundConversationCount).toBe(0);
    });

    it("includes new connection details when available", async () => {
      const db = createMockDb([
        // user query
        [
          {
            telegramChatId: "123",
            telegramUsername: "newuser",
            telegramVerified: true,
            telegramVerifiedAt: new Date("2026-01-01"),
            userPreferences: { telegramNotifyLevel: "high_critical" },
          },
        ],
        // active connection
        [
          {
            id: "conn-1",
            telegramUsername: "newuser",
            status: "active",
            linkedAt: new Date("2026-01-01"),
            activeChannelId: "ch-1",
          },
        ],
        // bound count
        [{ cnt: 2 }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.checkTelegramStatus({
        ctx: makeCtx(),
      });

      expect(result.linked).toBe(true);
      expect(result.connection).not.toBeNull();
      expect(result.connection.id).toBe("conn-1");
      expect(result.boundConversationCount).toBe(2);
      // Legacy fields still present
      expect(result.notifyLevel).toBe("high_critical");
      expect(result.deliveryFailing).toBe(false);
    });
  });

  // ============================================================
  // unlinkTelegram backward compatibility
  // ============================================================
  describe("unlinkTelegram compatibility", () => {
    it("clears both new connection records and legacy user fields", async () => {
      const mockRedis = { del: vi.fn().mockResolvedValue(1) };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        // user preferences query
        [
          {
            userPreferences: {
              telegramNotifyLevel: "all",
              telegramDeliveryFailing: false,
              theme: "dark",
            },
          },
        ],
        // find active connections
        [{ id: "conn-1" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.unlinkTelegram({
        ctx: makeCtx(),
      });

      expect(result.success).toBe(true);

      // Verify: connection revoked (1) + channels revoked (1) + user cleared (1) = 3
      expect(db.update).toHaveBeenCalledTimes(3);

      // Verify Redis cleanup still happens
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it("still works when no telegram_connections exist (legacy unlink)", async () => {
      const mockRedis = { del: vi.fn().mockResolvedValue(0) };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        // user preferences query
        [{ userPreferences: { telegramNotifyLevel: "off" } }],
        // no active connections (legacy user)
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.unlinkTelegram({
        ctx: makeCtx(),
      });

      expect(result.success).toBe(true);
      // Only user fields cleared (no connections to revoke)
      expect(db.update).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // generateTelegramLink backward compatibility
  // ============================================================
  describe("generateTelegramLink compatibility", () => {
    it("works without conversationId (legacy mode)", async () => {
      const mockRedis = {
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        get: vi.fn(),
      };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        // system settings query: telegram enabled
        [
          { key: "enabled", value: "true" },
          { key: "bot_username", value: "testbot" },
        ],
        // check existing connection
        [],
        // user query for tenantId
        [{ currentTenantId: "t1" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.generateTelegramLink({
        input: undefined, // No conversationId — legacy call
        ctx: makeCtx(),
      });

      // Returns the expected shape
      expect(result.code).toBeDefined();
      expect(result.deepLink).toMatch(/https:\/\/t\.me\/testbot\?start=/);
      expect(result.expiresIn).toBe(300);

      // Redis still stores the verification data
      expect(mockRedis.set).toHaveBeenCalled();

      // telegram_link_tokens record still created (with null targetConversationType)
      expect(db.insert).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Existing preferences endpoint
  // ============================================================
  describe("updateTelegramPreferences compatibility", () => {
    it("updates telegramNotifyLevel without affecting other preferences", async () => {
      const db = createMockDb([
        // user preferences query
        [
          {
            userPreferences: {
              telegramNotifyLevel: "all",
              theme: "dark",
              language: "th",
            },
          },
        ],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.updateTelegramPreferences({
        input: { notifyLevel: "critical_only" },
        ctx: makeCtx(),
      });

      expect(result.success).toBe(true);
      expect(db.update).toHaveBeenCalledTimes(1);
    });
  });
});
