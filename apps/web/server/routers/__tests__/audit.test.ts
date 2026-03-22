import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockReadEntries, mockFlush } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockReadEntries: vi.fn(),
  mockFlush: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    readEntries: mockReadEntries,
    flush: mockFlush,
    shutdown: vi.fn(),
  },
}));

import { appRouter } from "../../routers";
import { buildMergedTimelineRows } from "../audit";

function createAdminContext() {
  return {
    user: {
      id: 1,
      openId: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "email",
      role: "admin",
      currentTenantId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      ip: "127.0.0.1",
      protocol: "https",
      headers: {},
    },
    res: {
      clearCookie: vi.fn(),
    },
    userToken: null,
    tenantId: "tenant-1",
    publicUrl: "https://tenant.example.com",
  } as any;
}

describe("audit router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFlush.mockResolvedValue(undefined);
  });

  it("returns team system audit events from JSONL search results even when DB is unavailable", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetDb.mockResolvedValue(null);
    mockReadEntries.mockImplementation(async ({ eventType }: { eventType?: string }) => {
      if (eventType === "team_blueprint_created") {
        return [
          {
            timestamp: "2026-03-20T01:00:00.000Z",
            traceId: "trace-team-1",
            eventType: "team_blueprint_created",
            userId: 7,
            metadata: {
              teamId: "team-creative-1",
              blueprintId: "creative-content-studio",
              tenantId: "tenant-1",
            },
          },
        ];
      }
      return [];
    });

    const caller = appRouter.createCaller(createAdminContext());

    const result = await caller.audit.search({
      eventType: "team_blueprint_created",
      limit: 50,
      offset: 0,
    });

    expect(result.usageLogs).toEqual([]);
    expect(result.auditEvents).toEqual([]);
    expect(result.systemEvents).toEqual([
      expect.objectContaining({
        eventType: "team_blueprint_created",
        userId: 7,
        metadata: expect.objectContaining({
          blueprintId: "creative-content-studio",
          teamId: "team-creative-1",
        }),
      }),
    ]);
    expect(result.timelineRows).toEqual([
      expect.objectContaining({
        source: "system",
        eventType: "team_blueprint_created",
        subject: "creative-content-studio",
        contextLabel: "tenant-1",
      }),
    ]);
    expect(result.timelineTotal).toBe(1);
    expect(mockReadEntries).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[audit.search] provider_usage_log query failed"),
      expect.anything(),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[audit.search] api_audit_events query failed"),
      expect.anything(),
    );
  });

  it("respects explicit date ranges beyond 14 days for system audit search", async () => {
    mockGetDb.mockResolvedValue(null);
    mockReadEntries.mockImplementation(async ({ date, eventType }: { date?: Date; eventType?: string }) => {
      const day = date?.toISOString().slice(0, 10);
      if (eventType === "team_created" && day === "2026-03-20") {
        return [
          {
            timestamp: "2026-03-20T12:00:00.000Z",
            eventType: "team_created",
            userId: 9,
            metadata: { teamId: "team-late-range" },
          },
        ];
      }
      return [];
    });

    const caller = appRouter.createCaller(createAdminContext());

    const result = await caller.audit.search({
      eventType: "team_created",
      dateStart: "2026-03-01T00:00:00.000Z",
      dateEnd: "2026-03-20T23:59:59.999Z",
      limit: 50,
      offset: 0,
    });

    expect(result.systemEvents).toEqual([
      expect.objectContaining({
        eventType: "team_created",
        metadata: expect.objectContaining({
          teamId: "team-late-range",
        }),
      }),
    ]);
    expect(result.systemEventsMeta).toEqual(expect.objectContaining({
      defaultWindowApplied: false,
      searchedDayCount: 20,
    }));
  });

  it("paginates unified timeline rows on the server", async () => {
    mockGetDb.mockResolvedValue(null);
    mockReadEntries.mockImplementation(async ({ eventType }: { eventType?: string }) => {
      if (eventType === "team_created") {
        return [
          {
            timestamp: "2026-03-20T03:00:00.000Z",
            eventType: "team_created",
            userId: 1,
            metadata: { teamId: "team-3" },
          },
          {
            timestamp: "2026-03-20T02:00:00.000Z",
            eventType: "team_created",
            userId: 1,
            metadata: { teamId: "team-2" },
          },
          {
            timestamp: "2026-03-20T01:00:00.000Z",
            eventType: "team_created",
            userId: 1,
            metadata: { teamId: "team-1" },
          },
        ];
      }
      return [];
    });

    const caller = appRouter.createCaller(createAdminContext());

    const result = await caller.audit.search({
      eventType: "team_created",
      limit: 50,
      offset: 0,
      timelineLimit: 1,
      timelineOffset: 1,
    });

    expect(result.timelineTotal).toBe(3);
    expect(result.timelineRows).toEqual([
      expect.objectContaining({
        subject: "team-2",
      }),
    ]);
  });

  it("sorts merged timeline rows across llm, media, and system sources by timestamp", () => {
    const rows = buildMergedTimelineRows({
      usageRows: [
        {
          id: 1,
          userId: 1,
          providerId: 10,
          providerName: "OpenAI",
          modelUsed: "gpt-test",
          costUsd: 0.1,
          creditsCharged: 10,
          responseTimeMs: 100,
          statusCode: 200,
          errorType: null,
          errorMessage: null,
          traceId: "trace-llm",
          requestType: "chat",
          wasFallback: false,
          fallbackFromProviderId: null,
          createdAt: "2026-03-20T01:00:00.000Z",
        },
      ],
      auditRows: [
        {
          id: 2,
          userId: 2,
          provider: "media-provider",
          model: "media-model",
          eventType: "media_response",
          mediaType: "image",
          statusCode: 200,
          errorMessage: null,
          creditsCharged: 5,
          costUsd: 0.05,
          responseTimeMs: 80,
          endpoint: "/media",
          mediaTaskId: "media-1",
          traceId: "trace-media",
          createdAt: "2026-03-20T03:00:00.000Z",
        },
      ],
      systemRows: [
        {
          timestamp: "2026-03-20T02:00:00.000Z",
          eventType: "team_created",
          userId: 3,
          metadata: { teamId: "team-2" },
        },
      ],
      timelineOffset: 0,
      timelineLimit: 3,
    });

    expect(rows.map((row) => `${row.source}:${row.timestamp}`)).toEqual([
      "media:2026-03-20T03:00:00.000Z",
      "system:2026-03-20T02:00:00.000Z",
      "llm:2026-03-20T01:00:00.000Z",
    ]);
  });
});
