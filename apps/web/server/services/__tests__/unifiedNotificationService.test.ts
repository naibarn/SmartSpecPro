import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import {
  getUnifiedNotifications,
  getUnifiedStats,
  mapUserNotification,
  mapOrchestratorNotification,
} from "../unifiedNotificationService";

// ─── Mapper Tests ───────────────────────────────────────────────────────────

describe("UnifiedNotification mapping", () => {
  it("user notification maps with source='user' and id='user:123'", () => {
    const row = {
      id: 123,
      userId: 1,
      title: "Test notification",
      content: "Content",
      priority: "normal",
      isRead: false,
      isDismissed: false,
      actionUrl: "/test",
      createdAt: new Date("2026-03-20T10:00:00Z"),
      metadata: null,
      occurrenceCount: 1,
      groupKey: null,
    };

    const result = mapUserNotification(row);
    expect(result.id).toBe("user:123");
    expect(result.source).toBe("user");
    expect(result.title).toBe("Test notification");
    expect(result.priority).toBe("normal");
  });

  it("orchestrator notification maps with source='orchestrator' and id='orch:abc-456'", () => {
    const row = {
      id: "abc-456",
      tenantId: "t1",
      userId: 1,
      title: "Run completed",
      body: "Run finished successfully",
      severity: "info",
      isRead: false,
      isDismissed: false,
      actionUrl: "/team/run/1",
      createdAt: new Date("2026-03-20T11:00:00Z"),
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
    };

    const result = mapOrchestratorNotification(row);
    expect(result.id).toBe("orch:abc-456");
    expect(result.source).toBe("orchestrator");
    expect(result.content).toBe("Run finished successfully");
    expect(result.priority).toBe("low"); // info → low
    expect(result.teamId).toBe("team-1");
  });

  it("guardian notification (metadata.source starts with 'guardian.') maps with source='guardian'", () => {
    const row = {
      id: 456,
      userId: 1,
      title: "Guardian alert",
      content: "Feedback processed",
      priority: "high",
      isRead: false,
      isDismissed: false,
      actionUrl: "/admin/system-guardian",
      createdAt: new Date("2026-03-20T12:00:00Z"),
      metadata: { source: "guardian.feedbackProcessor", eventId: "42" },
      occurrenceCount: 1,
      groupKey: null,
    };

    const result = mapUserNotification(row);
    expect(result.id).toBe("user:456");
    expect(result.source).toBe("guardian");
    expect(result.metadata?.source).toBe("guardian.feedbackProcessor");
  });
});

describe("UnifiedNotification tenant scoping", () => {
  it("keeps varchar tenant IDs out of numeric casts", async () => {
    const capturedConditions: unknown[] = [];
    const makeQuery = () => {
      const query: Record<string, any> = {};
      query.where = vi.fn((condition: unknown) => {
        capturedConditions.push(condition);
        return query;
      });
      query.orderBy = vi.fn(() => query);
      query.limit = vi.fn(() => query);
      query.offset = vi.fn(async () => []);
      return query;
    };

    mockGetDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => makeQuery()),
      })),
    });

    await expect(
      getUnifiedNotifications("tenant-ZCSKEM9s", { limit: 7 }),
    ).resolves.toEqual({ items: [], hasMore: false });

    const compiled = new PgDialect().sqlToQuery(capturedConditions[0] as any);
    expect(compiled.sql).toContain('"currentTenantId"');
    expect(compiled.sql).not.toContain("::integer");
    expect(compiled.params).toContain("tenant-ZCSKEM9s");
  });

  it("uses the same varchar tenant predicate for notification stats", async () => {
    const capturedConditions: unknown[] = [];
    let selectCount = 0;
    const results = [
      [{ total: "0", unread: "0", critical: "0", today: "0" }],
      [{ total: "0", unread: "0", critical: "0", today: "0" }],
      [],
      [],
    ];

    const makeQuery = (result: unknown[]) => {
      const query: Record<string, any> = {};
      query.where = vi.fn((condition: unknown) => {
        capturedConditions.push(condition);
        return query;
      });
      query.from = vi.fn(() => query);
      query.groupBy = vi.fn(() => query);
      query.then = (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve(resolve(result));
      return query;
    };

    mockGetDb.mockReturnValue({
      select: vi.fn(() => makeQuery(results[selectCount++] ?? [])),
    });

    await expect(getUnifiedStats("tenant-ZCSKEM9s")).resolves.toMatchObject({
      total: 0,
      unread: 0,
      critical: 0,
      today: 0,
    });

    expect(capturedConditions).toHaveLength(4);
    for (const condition of [capturedConditions[0], capturedConditions[2]]) {
      const compiled = new PgDialect().sqlToQuery(condition as any);
      expect(compiled.sql).toContain('"currentTenantId"');
      expect(compiled.sql).not.toContain("::integer");
      expect(compiled.params).toContain("tenant-ZCSKEM9s");
    }
  });
});

describe("Severity mapping", () => {
  it("maps orchestrator severity info to priority low", () => {
    const row = {
      id: "1",
      tenantId: "t",
      userId: 1,
      title: "t",
      body: null,
      severity: "info",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: new Date(),
    };
    expect(mapOrchestratorNotification(row).priority).toBe("low");
  });

  it("maps orchestrator severity warning to priority normal", () => {
    const row = {
      id: "1",
      tenantId: "t",
      userId: 1,
      title: "t",
      body: null,
      severity: "warning",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: new Date(),
    };
    expect(mapOrchestratorNotification(row).priority).toBe("normal");
  });

  it("maps orchestrator severity error to priority high", () => {
    const row = {
      id: "1",
      tenantId: "t",
      userId: 1,
      title: "t",
      body: null,
      severity: "error",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: new Date(),
    };
    expect(mapOrchestratorNotification(row).priority).toBe("high");
  });

  it("maps orchestrator severity critical to priority critical", () => {
    const row = {
      id: "1",
      tenantId: "t",
      userId: 1,
      title: "t",
      body: null,
      severity: "critical",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: new Date(),
    };
    expect(mapOrchestratorNotification(row).priority).toBe("critical");
  });
});

describe("UnifiedNotification ID format", () => {
  it("user notification uses 'user:' prefix with numeric ID", () => {
    const result = mapUserNotification({
      id: 789,
      userId: 1,
      title: "t",
      content: null,
      priority: "low",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: new Date(),
      metadata: null,
      occurrenceCount: 1,
      groupKey: null,
    });
    expect(result.id).toBe("user:789");
  });

  it("orchestrator notification uses 'orch:' prefix with UUID", () => {
    const result = mapOrchestratorNotification({
      id: "550e8400-e29b-41d4-a716-446655440000",
      tenantId: "t",
      userId: 1,
      title: "t",
      body: null,
      severity: "info",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: new Date(),
    });
    expect(result.id).toBe("orch:550e8400-e29b-41d4-a716-446655440000");
  });
});

describe("Edge cases", () => {
  it("handles null content in user notification", () => {
    const result = mapUserNotification({
      id: 1,
      userId: 1,
      title: "t",
      content: null,
      priority: "normal",
      isRead: true,
      isDismissed: true,
      actionUrl: null,
      createdAt: new Date(),
      metadata: null,
      occurrenceCount: 3,
      groupKey: "grp:1",
    });
    expect(result.content).toBeNull();
    expect(result.isRead).toBe(true);
    expect(result.isDismissed).toBe(true);
    expect(result.occurrenceCount).toBe(3);
    expect(result.groupKey).toBe("grp:1");
  });

  it("handles null body in orchestrator notification", () => {
    const result = mapOrchestratorNotification({
      id: "1",
      tenantId: "t",
      userId: 1,
      title: "t",
      body: null,
      severity: "info",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: new Date(),
    });
    expect(result.content).toBeNull();
  });

  it("handles string createdAt dates", () => {
    const result = mapUserNotification({
      id: 1,
      userId: 1,
      title: "t",
      content: null,
      priority: "normal",
      isRead: false,
      isDismissed: false,
      actionUrl: null,
      createdAt: "2026-03-20T10:00:00.000Z",
      metadata: null,
      occurrenceCount: 1,
      groupKey: null,
    });
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2026-03-20T10:00:00.000Z");
  });
});
