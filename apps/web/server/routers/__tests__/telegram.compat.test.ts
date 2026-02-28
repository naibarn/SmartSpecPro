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
  gt: vi.fn((_col: any, val: any) => ({ _type: "gt", val })),
  lt: vi.fn((_col: any, val: any) => ({ _type: "lt", val })),
}));

vi.mock("../../services/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));

vi.mock("../../services/telegramService", () => ({
  clearTelegramCache: vi.fn(),
}));

vi.mock("../../services/deliveryQueue", () => ({
  clearDeliveryBotTokenCache: vi.fn(),
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
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockResolvedValue(undefined),
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
        // token rate limit count query
        [{ cnt: 0 }],
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

      // Returns the expected shape (code removed from response for security)
      expect(result.deepLink).toMatch(/https:\/\/t\.me\/testbot\?start=/);
      expect(result.expiresIn).toBe(300);

      // Redis still stores the verification data
      expect(mockRedis.set).toHaveBeenCalled();

      // telegram_link_tokens record still created (with null targetConversationType)
      expect(db.insert).toHaveBeenCalled();
    });
  });

  // ============================================================
  // generateTelegramLink security: rate limit
  // ============================================================
  describe("generateTelegramLink security", () => {
    it("rejects when user has generated 5+ tokens in the last hour", async () => {
      const mockRedis = { set: vi.fn(), del: vi.fn(), get: vi.fn() };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        // system settings
        [
          { key: "enabled", value: "true" },
          { key: "bot_username", value: "testbot" },
        ],
        // token rate limit count: already at 5
        [{ cnt: 5 }],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.generateTelegramLink({ input: undefined, ctx: makeCtx() }),
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    });

    it("allows when user has fewer than 5 tokens in the last hour", async () => {
      const mockRedis = { set: vi.fn().mockResolvedValue("OK"), del: vi.fn(), get: vi.fn() };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        [{ key: "enabled", value: "true" }, { key: "bot_username", value: "testbot" }],
        [{ cnt: 4 }],      // token rate limit: 4 tokens (under limit)
        [],                // no existing connection
        [{ currentTenantId: "t1" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.generateTelegramLink({ input: undefined, ctx: makeCtx() });
      expect(result.deepLink).toMatch(/https:\/\/t\.me\/testbot\?start=/);
    });

    it("cleans up expired tokens before inserting new one", async () => {
      const mockRedis = { set: vi.fn().mockResolvedValue("OK"), del: vi.fn(), get: vi.fn() };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        [{ key: "enabled", value: "true" }, { key: "bot_username", value: "testbot" }],
        [{ cnt: 0 }],
        [],
        [{ currentTenantId: "t1" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      await handlers.generateTelegramLink({ input: undefined, ctx: makeCtx() });

      // delete() should be called to clean up expired tokens
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // ============================================================
  // unbindConversation security: ownership check
  // ============================================================
  describe("unbindConversation security", () => {
    it("rejects unbind when channel belongs to different user's connection", async () => {
      const db = createMockDb([
        // verifyConversationOwnership → conversation exists
        [{ id: 1 }],
        // find active channel binding
        [{ id: "ch-uuid-1", connectionId: "conn-uuid-1" }],
        // connection lookup → belongs to userId=999 (NOT the calling user id=1)
        [{ userId: 999 }],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.unbindConversation({
          input: { conversationId: "1", conversationType: "chat" },
          ctx: makeCtx({ id: 1 }),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("allows unbind when channel belongs to calling user's connection", async () => {
      const db = createMockDb([
        [{ id: 1 }],
        [{ id: "ch-uuid-1", connectionId: "conn-uuid-1" }],
        // connection belongs to userId=1 (same as calling user)
        [{ userId: 1 }],
        // activeChannelId query for cleanup
        [{ activeChannelId: null }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.unbindConversation({
        input: { conversationId: "1", conversationType: "chat" },
        ctx: makeCtx({ id: 1 }),
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // updateTelegramSettings security: cache clearing
  // ============================================================
  describe("updateTelegramSettings security", () => {
    it("clears delivery bot token cache when settings change", async () => {
      const { clearDeliveryBotTokenCache } = await import("../../services/deliveryQueue");

      const db = createMockDb([
        // upsert enabled=true (existing row)
        [{ id: "row-1" }],
        // webhook_secret row exists
        [{ id: "ws-1", value: "enc:oldsecret" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      await handlers.updateTelegramSettings({
        input: { enabled: true },
        ctx: makeCtx(),
      });

      expect(clearDeliveryBotTokenCache).toHaveBeenCalled();
    });

    it("returns webhookReRegistered=false when botToken changes but Telegram unreachable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      const db = createMockDb([
        // upsert bot_token
        [{ id: "row-1" }],
        // webhook_secret row exists → rotate
        [{ id: "ws-1" }],
        // callTelegramSetWebhook re-reads settings
        [
          { key: "bot_token", value: "enc:token" },
          { key: "webhook_secret", value: "enc:secret" },
          { key: "app_url", value: "https://smartaihub.app" },
          { key: "bot_username", value: "testbot" },
        ],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.updateTelegramSettings({
        input: { botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi" },
        ctx: makeCtx(),
      });

      expect(result.success).toBe(true);
      expect(result.webhookReRegistered).toBe(false);

      vi.unstubAllGlobals();
    });
  });

  // ============================================================
  // adminListConnections security: null tenantId guard
  // ============================================================
  describe("adminListConnections security", () => {
    it("rejects when currentTenantId is null", async () => {
      const db = createMockDb([]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.adminListConnections({
          input: { limit: 20, offset: 0 },
          ctx: makeCtx({ currentTenantId: null }),
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
