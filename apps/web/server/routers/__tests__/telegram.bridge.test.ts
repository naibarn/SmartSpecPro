import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Telegram Chat Bridge router extensions (Section 10).
 *
 * Covers: getConversationChannelStatus, bindConversation, unbindConversation,
 * adminListConnections, adminRevokeConnection, extended unlinkTelegram,
 * extended checkTelegramStatus.
 */

// --- Hoisted mocks ---
const {
  mockGetDb,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockGetRedisClient,
  mockEncrypt,
  mockDecrypt,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockGetRedisClient: vi.fn(),
  mockEncrypt: vi.fn((v: string) => `enc:${v}`),
  mockDecrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));

// Mock tRPC to extract handler functions
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
    revokedAt: "tc.revokedAt",
    activeChannelId: "tc.acid",
  },
  conversationChannels: {
    id: "cc.id",
    tenantId: "cc.tid",
    chatConversationId: "cc.ccid",
    agencyConversationId: "cc.acid",
    conversationType: "cc.ct",
    channelType: "cc.cht",
    channelRefId: "cc.crid",
    connectionId: "cc.cid",
    syncMode: "cc.sm",
    state: "cc.state",
    createdAt: "cc.ca",
    updatedAt: "cc.ua",
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
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
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
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({
        offset: vi.fn().mockReturnValue(Promise.resolve(result)),
        then: (resolve: any, reject?: any) =>
          Promise.resolve(result).then(resolve, reject),
        catch: (fn: any) => Promise.resolve(result).catch(fn),
      }),
      offset: vi.fn().mockReturnThis(),
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

// --- Import router (after mocks) ---
import { telegramRouter } from "../telegram";

// Extract handlers
const handlers = telegramRouter as any;

const makeUserCtx = (overrides: any = {}) => ({
  user: { id: 1, role: "user", currentTenantId: "t1", ...overrides },
});

const makeAdminCtx = (overrides: any = {}) => ({
  user: { id: 1, role: "admin", currentTenantId: "t1", ...overrides },
});

describe("Telegram Bridge Router Extensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getConversationChannelStatus
  // =========================================================================
  describe("getConversationChannelStatus", () => {
    it("returns bound=true for conversation with active channel", async () => {
      const db = createMockDb([
        // verifyConversationOwnership: conversation exists
        [{ id: 42 }],
        // channel query: active binding found
        [{ id: "ch-1", syncMode: "two_way", connectionId: "conn-1" }],
        // connection status lookup
        [{ status: "active" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.getConversationChannelStatus({
        input: { conversationId: "42", conversationType: "chat" },
        ctx: makeUserCtx(),
      });

      expect(result.bound).toBe(true);
      expect(result.syncMode).toBe("two_way");
      expect(result.connectionStatus).toBe("active");
    });

    it("returns bound=false for conversation with no channel", async () => {
      const db = createMockDb([
        // verifyConversationOwnership: conversation exists
        [{ id: 42 }],
        // channel query: no binding
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.getConversationChannelStatus({
        input: { conversationId: "42", conversationType: "chat" },
        ctx: makeUserCtx(),
      });

      expect(result.bound).toBe(false);
    });

    it("returns bound=true for agency conversation", async () => {
      const db = createMockDb([
        // verifyConversationOwnership: agency conversation exists
        [{ id: "uuid-abc" }],
        // channel query: active binding found
        [{ id: "ch-2", syncMode: "notify_only", connectionId: "conn-1" }],
        // connection status lookup
        [{ status: "active" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.getConversationChannelStatus({
        input: { conversationId: "uuid-abc", conversationType: "agency" },
        ctx: makeUserCtx(),
      });

      expect(result.bound).toBe(true);
      expect(result.syncMode).toBe("notify_only");
    });

    it("throws NOT_FOUND for conversation user does not own", async () => {
      const db = createMockDb([
        // verifyConversationOwnership: no match
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.getConversationChannelStatus({
          input: { conversationId: "42", conversationType: "chat" },
          ctx: makeUserCtx(),
        }),
      ).rejects.toThrow("Conversation not found");
    });
  });

  // =========================================================================
  // bindConversation
  // =========================================================================
  describe("bindConversation", () => {
    it("creates channel binding for chat conversation", async () => {
      const db = createMockDb([
        // verifyConversationOwnership
        [{ id: 42 }],
        // find active connection
        [{ id: "conn-1", tenantId: "t1", telegramChatId: "999" }],
        // duplicate check: no existing
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.bindConversation({
        input: {
          conversationId: "42",
          conversationType: "chat",
          syncMode: "two_way",
        },
        ctx: makeUserCtx(),
      });

      expect(result.success).toBe(true);
      expect(result.channelId).toBeDefined();
      // Insert was called
      expect(db.insert).toHaveBeenCalled();
      // Update was called (auto-select active channel)
      expect(db.update).toHaveBeenCalled();
    });

    it("creates channel binding for agency conversation", async () => {
      const db = createMockDb([
        // verifyConversationOwnership (agency)
        [{ id: "uuid-abc" }],
        // find active connection
        [{ id: "conn-1", tenantId: "t1", telegramChatId: "999" }],
        // duplicate check
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.bindConversation({
        input: {
          conversationId: "uuid-abc",
          conversationType: "agency",
          syncMode: "notify_only",
        },
        ctx: makeUserCtx(),
      });

      expect(result.success).toBe(true);
      expect(result.channelId).toBeDefined();
    });

    it("throws PRECONDITION_FAILED when no active connection", async () => {
      const db = createMockDb([
        // verifyConversationOwnership
        [{ id: 42 }],
        // find active connection: none
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.bindConversation({
          input: {
            conversationId: "42",
            conversationType: "chat",
          },
          ctx: makeUserCtx(),
        }),
      ).rejects.toThrow("No active Telegram connection");
    });

    it("throws CONFLICT for duplicate binding", async () => {
      const db = createMockDb([
        // verifyConversationOwnership
        [{ id: 42 }],
        // find active connection
        [{ id: "conn-1", tenantId: "t1", telegramChatId: "999" }],
        // duplicate check: existing binding found
        [{ id: "ch-existing" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.bindConversation({
          input: {
            conversationId: "42",
            conversationType: "chat",
          },
          ctx: makeUserCtx(),
        }),
      ).rejects.toThrow("already bound");
    });

    it("throws NOT_FOUND for conversation user does not own", async () => {
      const db = createMockDb([
        // verifyConversationOwnership: no match
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.bindConversation({
          input: {
            conversationId: "42",
            conversationType: "chat",
          },
          ctx: makeUserCtx(),
        }),
      ).rejects.toThrow("Conversation not found");
    });
  });

  // =========================================================================
  // unbindConversation
  // =========================================================================
  describe("unbindConversation", () => {
    it("revokes channel binding", async () => {
      const db = createMockDb([
        // verifyConversationOwnership
        [{ id: 42 }],
        // find active channel
        [{ id: "ch-1", connectionId: "conn-1" }],
        // check activeChannelId
        [{ activeChannelId: "ch-1" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.unbindConversation({
        input: { conversationId: "42", conversationType: "chat" },
        ctx: makeUserCtx(),
      });

      expect(result.success).toBe(true);
      // Update called: revoke channel + clear activeChannelId
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it("throws NOT_FOUND when no active binding exists", async () => {
      const db = createMockDb([
        // verifyConversationOwnership
        [{ id: 42 }],
        // find active channel: none
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.unbindConversation({
          input: { conversationId: "42", conversationType: "chat" },
          ctx: makeUserCtx(),
        }),
      ).rejects.toThrow("No active Telegram binding");
    });

    it("does not clear activeChannelId if it points elsewhere", async () => {
      const db = createMockDb([
        // verifyConversationOwnership
        [{ id: 42 }],
        // find active channel
        [{ id: "ch-1", connectionId: "conn-1" }],
        // check activeChannelId: points to different channel
        [{ activeChannelId: "ch-other" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.unbindConversation({
        input: { conversationId: "42", conversationType: "chat" },
        ctx: makeUserCtx(),
      });

      expect(result.success).toBe(true);
      // Only 1 update: revoke channel (no activeChannelId clear)
      expect(db.update).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // adminListConnections
  // =========================================================================
  describe("adminListConnections", () => {
    it("returns paginated connections", async () => {
      const db = createMockDb([
        // count query
        [{ total: 5 }],
        // data query
        [
          { id: "conn-1", userId: 1, status: "active", userEmail: "a@b.com" },
          { id: "conn-2", userId: 2, status: "active", userEmail: "c@d.com" },
        ],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.adminListConnections({
        input: { limit: 2, offset: 0 },
        ctx: makeAdminCtx(),
      });

      expect(result.total).toBe(5);
      expect(result.connections).toHaveLength(2);
    });

    it("filters by status when provided", async () => {
      const db = createMockDb([
        // count query
        [{ total: 3 }],
        // data query
        [
          { id: "conn-1", status: "active" },
          { id: "conn-2", status: "active" },
          { id: "conn-3", status: "active" },
        ],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.adminListConnections({
        input: { status: "active", limit: 10, offset: 0 },
        ctx: makeAdminCtx(),
      });

      expect(result.total).toBe(3);
      expect(result.connections).toHaveLength(3);
    });
  });

  // =========================================================================
  // adminRevokeConnection
  // =========================================================================
  describe("adminRevokeConnection", () => {
    it("revokes connection and all channel bindings", async () => {
      const db = createMockDb([
        // find connection by id + tenant
        [{ id: "conn-1", tenantId: "t1", userId: 10 }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.adminRevokeConnection({
        input: { connectionId: "conn-1" },
        ctx: makeAdminCtx(),
      });

      expect(result.success).toBe(true);
      // 3 updates: connection, channels, user legacy fields
      expect(db.update).toHaveBeenCalledTimes(3);
    });

    it("throws NOT_FOUND for cross-tenant access", async () => {
      const db = createMockDb([
        // find connection: not found (different tenant)
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      await expect(
        handlers.adminRevokeConnection({
          input: { connectionId: "conn-1" },
          ctx: makeAdminCtx(),
        }),
      ).rejects.toThrow("Connection not found");
    });
  });

  // =========================================================================
  // checkTelegramStatus (extended)
  // =========================================================================
  describe("checkTelegramStatus (extended)", () => {
    it("returns connection details and bound count", async () => {
      const db = createMockDb([
        // user query
        [
          {
            telegramChatId: "123",
            telegramUsername: "testuser",
            telegramVerified: true,
            telegramVerifiedAt: new Date("2026-01-01"),
            userPreferences: { telegramNotifyLevel: "all" },
          },
        ],
        // active connection query
        [
          {
            id: "conn-1",
            telegramUsername: "testuser",
            status: "active",
            linkedAt: new Date("2026-01-01"),
            activeChannelId: "ch-1",
          },
        ],
        // bound conversation count
        [{ cnt: 3 }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.checkTelegramStatus({
        ctx: makeUserCtx(),
      });

      expect(result.linked).toBe(true);
      expect(result.connection).toBeDefined();
      expect(result.connection!.id).toBe("conn-1");
      expect(result.boundConversationCount).toBe(3);
    });

    it("returns connection=null when no active connection", async () => {
      const db = createMockDb([
        // user query
        [
          {
            telegramChatId: null,
            telegramUsername: null,
            telegramVerified: false,
            telegramVerifiedAt: null,
            userPreferences: {},
          },
        ],
        // active connection: none
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.checkTelegramStatus({
        ctx: makeUserCtx(),
      });

      expect(result.linked).toBe(false);
      expect(result.connection).toBeNull();
      expect(result.boundConversationCount).toBe(0);
    });
  });

  // =========================================================================
  // unlinkTelegram (extended)
  // =========================================================================
  describe("unlinkTelegram (extended)", () => {
    it("revokes connections and channels in addition to clearing user fields", async () => {
      const mockRedis = { del: vi.fn().mockResolvedValue(1) };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        // user preferences query
        [{ userPreferences: { telegramNotifyLevel: "all", otherPref: true } }],
        // find active connections
        [{ id: "conn-1" }, { id: "conn-2" }],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.unlinkTelegram({
        ctx: makeUserCtx(),
      });

      expect(result.success).toBe(true);
      // Updates: 2 connection revokes + 2 channel revokes + 1 user clear = 5
      expect(db.update).toHaveBeenCalledTimes(5);
    });

    it("handles case with no active connections gracefully", async () => {
      const mockRedis = { del: vi.fn().mockResolvedValue(0) };
      mockGetRedisClient.mockReturnValue(mockRedis);

      const db = createMockDb([
        // user preferences query
        [{ userPreferences: {} }],
        // find active connections: none
        [],
      ]);
      mockGetDb.mockResolvedValue(db);

      const result = await handlers.unlinkTelegram({
        ctx: makeUserCtx(),
      });

      expect(result.success).toBe(true);
      // Only 1 update: clear user fields
      expect(db.update).toHaveBeenCalledTimes(1);
    });
  });
});
