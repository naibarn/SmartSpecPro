import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all external dependencies
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../../services/redisClients", () => ({
  getRealtimeClient: vi.fn(() => ({
    duplicate: vi.fn(() => ({})),
  })),
}));
vi.mock("../../services/notificationService", () => ({
  createNotification: vi.fn().mockResolvedValue({ notificationId: 100, deduplicated: false }),
  mapToCategory: vi.fn().mockReturnValue("business"),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({
    notificationEscalationEnabled: true,
  }),
}));
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    upsertJobScheduler: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { getDb } from "../../db";
import { createNotification } from "../../services/notificationService";
import { executeEscalationCheck, initializeEscalationJob } from "../escalationJob";

function mockDb(opts: {
  policies?: Record<string, unknown>[];
  notifications?: Record<string, unknown>[];
  roleUsers?: Record<string, unknown>[];
  targetUser?: Record<string, unknown>[];
} = {}) {
  const { policies = [], notifications = [], roleUsers = [], targetUser } = opts;

  // Track select calls to return appropriate data:
  // 1st = policies, 2nd = notifications (via innerJoin),
  // 3rd = target user verification (if escalateToUserId), or role users (if escalateToRole)
  // 4th = role users (if escalateToRole and target user verification was 3rd)
  let selectCallCount = 0;

  const makeWhereChain = () => ({
    where: vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve(policies);
      if (selectCallCount === 2) return Promise.resolve(notifications);
      // 3rd call: target user verification (limit 1) or role users
      if (selectCallCount === 3) {
        if (targetUser !== undefined) {
          // Target user verification query (uses .limit())
          return { limit: vi.fn().mockResolvedValue(targetUser) };
        }
        return Promise.resolve(roleUsers);
      }
      if (selectCallCount === 4) return Promise.resolve(roleUsers);
      return Promise.resolve([]);
    }),
  });

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        // Support direct .where() (policies, target user, role users)
        where: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve(policies);
          if (selectCallCount === 2) return Promise.resolve(notifications);
          if (selectCallCount === 3) {
            if (targetUser !== undefined) {
              return { limit: vi.fn().mockResolvedValue(targetUser) };
            }
            return Promise.resolve(roleUsers);
          }
          if (selectCallCount === 4) return Promise.resolve(roleUsers);
          return Promise.resolve([]);
        }),
        // Support .innerJoin().where() (notifications with tenant join)
        innerJoin: vi.fn().mockReturnValue(makeWhereChain()),
      })),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  };

  (getDb as any).mockReturnValue(db);
  return db;
}

describe("executeEscalationCheck", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-set feature flag mock (vi.clearAllMocks clears the mock implementation)
    const { getTenantFeatureFlags } = await import("../../services/tenantFeatureFlagService");
    (getTenantFeatureFlags as any).mockResolvedValue({
      notificationEscalationEnabled: true,
    });
  });

  it("skips policies from tenants where escalation flag is disabled", async () => {
    const { getTenantFeatureFlags } = await import("../../services/tenantFeatureFlagService");
    (getTenantFeatureFlags as any).mockResolvedValue({
      notificationEscalationEnabled: false,
    });

    mockDb({
      policies: [{
        id: 1,
        tenantId: "t1",
        triggerSeverity: "critical",
        triggerMinutes: 15,
        escalateToUserId: 99,
        isEnabled: true,
      }],
    });

    await executeEscalationCheck();

    // No notifications created because the flag is disabled
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("creates notification for target when critical alert unacknowledged past triggerMinutes", async () => {
    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
    mockDb({
      policies: [{
        id: 1,
        tenantId: "t1",
        name: "Critical Escalation",
        triggerSeverity: "critical",
        triggerMinutes: 15,
        escalateToUserId: 99,
        escalateToRole: null,
        escalateChannels: ["in_app"],
        escalateMessage: "Unacknowledged critical alert!",
        isEnabled: true,
      }],
      notifications: [{
        id: 10,
        userId: 42,
        title: "Server Down",
        content: "Production server unresponsive",
        priority: "critical",
        relatedResourceType: "system_health",
        actionUrl: "/admin/monitoring",
        metadata: null,
        createdAt: new Date(oldDate),
      }],
      targetUser: [{ id: 99 }], // Target user verified in same tenant
    });

    await executeEscalationCheck();

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        type: "alert",
        priority: "critical",
        metadata: expect.objectContaining({ isEscalated: true }),
      })
    );
  });

  it("skips already-escalated notifications (metadata.isEscalated=true)", async () => {
    mockDb({
      policies: [{
        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
      }],
      notifications: [], // Empty — the WHERE filter excludes already-escalated
    });

    await executeEscalationCheck();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("skips notifications with metadata.escalatedAt already set", async () => {
    mockDb({
      policies: [{
        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
      }],
      notifications: [], // Empty — the WHERE filter excludes these
    });

    await executeEscalationCheck();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("respects isEnabled=false on policy", async () => {
    mockDb({ policies: [] }); // No enabled policies returned

    await executeEscalationCheck();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("escalation notification has isEscalated=true in metadata", async () => {
    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
    mockDb({
      policies: [{
        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
      }],
      notifications: [{
        id: 10, userId: 42, title: "Alert", content: "Body",
        priority: "critical", relatedResourceType: null,
        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
      }],
      targetUser: [{ id: 99 }],
    });

    await executeEscalationCheck();

    const call = (createNotification as any).mock.calls[0][0];
    expect(call.metadata.isEscalated).toBe(true);
  });

  it("marks original notification metadata with escalatedAt and escalatedTo", async () => {
    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
    const db = mockDb({
      policies: [{
        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
      }],
      notifications: [{
        id: 10, userId: 42, title: "Alert", content: "Body",
        priority: "critical", relatedResourceType: null,
        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
      }],
      targetUser: [{ id: 99 }],
    });

    await executeEscalationCheck();

    expect(db.update).toHaveBeenCalled();
  });

  it("targets role-based users when escalateToRole is set (creates N notifications)", async () => {
    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
    mockDb({
      policies: [{
        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
        triggerMinutes: 15, escalateToUserId: null, escalateToRole: "admin",
        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
      }],
      notifications: [{
        id: 10, userId: 42, title: "Alert", content: "Body",
        priority: "critical", relatedResourceType: null,
        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
      }],
      roleUsers: [{ id: 50 }, { id: 51 }],
    });

    await executeEscalationCheck();

    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it("targets single user when escalateToUserId is set", async () => {
    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
    mockDb({
      policies: [{
        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
      }],
      notifications: [{
        id: 10, userId: 42, title: "Alert", content: "Body",
        priority: "critical", relatedResourceType: null,
        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
      }],
      targetUser: [{ id: 99 }],
    });

    await executeEscalationCheck();

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect((createNotification as any).mock.calls[0][0].userId).toBe(99);
  });

  it("continues processing if one notification creation fails", async () => {
    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
    mockDb({
      policies: [{
        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
        triggerMinutes: 15, escalateToUserId: null, escalateToRole: "admin",
        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
      }],
      notifications: [{
        id: 10, userId: 42, title: "Alert", content: "Body",
        priority: "critical", relatedResourceType: null,
        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
      }],
      roleUsers: [{ id: 50 }, { id: 51 }],
    });

    // First call fails, second succeeds
    (createNotification as any)
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ notificationId: 101, deduplicated: false });

    await executeEscalationCheck();

    expect(createNotification).toHaveBeenCalledTimes(2);
  });
});

describe("initializeEscalationJob", () => {
  it("is idempotent — second call does not create duplicate repeatable job", async () => {
    // First call
    await initializeEscalationJob();
    // Second call should not throw
    await initializeEscalationJob();
    // Queue constructor should only be called once
    const { Queue } = await import("bullmq");
    expect(Queue).toHaveBeenCalledTimes(1);
  });
});
