import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import { getContextEngineHealth } from "../monitoringService";

describe("monitoringService.getContextEngineHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summarizes recent context-engine checks for the requested room scope", async () => {
    const rows = [
      {
        id: 11,
        checkType: "context_engine_eval",
        status: "warning",
        source: "team_run",
        createdAt: new Date("2026-04-17T10:00:00.000Z"),
        details: {
          source: "team_run",
          surface: "team_room",
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          latencyMs: 540,
          healthScore: 0.68,
          groundingScore: 0.64,
          retrievalCoverage: 0.58,
          freshnessScore: 0.74,
          staleContextRatio: 0.16,
          tokenPressureRatio: 0.33,
          retrievalModes: ["semantic", "graph"],
          notes: "Room run is healthy but needs fresher project-state injection.",
        },
      },
      {
        id: 10,
        checkType: "context_engine_eval",
        status: "ok",
        source: "chat.unified",
        createdAt: new Date("2026-04-17T09:55:00.000Z"),
        details: {
          source: "chat.unified",
          surface: "chat",
          tenantId: "tenant-1",
          teamId: "team-1",
          roomId: "room-1",
          runId: "run-1",
          latencyMs: 410,
          healthScore: 0.91,
          groundingScore: 0.79,
          retrievalCoverage: 0.71,
          freshnessScore: 0.83,
          staleContextRatio: 0.08,
          tokenPressureRatio: 0.24,
          retrievalModes: ["hybrid"],
        },
      },
    ] as const;

    const fromMock = vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(rows),
        })),
      })),
    }));
    mockGetDb.mockResolvedValue({
      select: vi.fn(() => ({
        from: fromMock,
      })),
    });

    const summary = await getContextEngineHealth({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      runId: "run-1",
      limit: 12,
      since: "2026-04-17T00:00:00.000Z",
    });

    expect(summary.scope).toEqual(
      expect.objectContaining({
        tenantId: "tenant-1",
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        limit: 12,
      }),
    );
    expect(summary.totals).toEqual({
      total: 2,
      ok: 1,
      warning: 1,
      critical: 0,
      error: 0,
    });
    expect(summary.latest?.id).toBe(11);
    expect(summary.recentChecks).toHaveLength(2);
    expect(summary.averages.healthScore).toBeCloseTo(0.795);
    expect(summary.averages.groundingScore).toBeCloseTo(0.715);
    expect(summary.averages.retrievalCoverage).toBeCloseTo(0.645);
    expect(summary.averages.latencyMs).toBeCloseTo(475);
    expect(summary.sourceBreakdown).toEqual([
      { source: "chat.unified", count: 1 },
      { source: "team_run", count: 1 },
    ]);
    expect(summary.scopeBreakdown).toEqual([
      expect.objectContaining({
        teamId: "team-1",
        roomId: "room-1",
        runId: "run-1",
        skillId: null,
        count: 2,
        latestStatus: "warning",
        latestSource: "team_run",
        latestHealthScore: 0.68,
        latestGroundingScore: 0.64,
        latestRetrievalCoverage: 0.58,
      }),
    ]);
    expect(summary.recentChecks[0]?.details.retrievalModes).toEqual([
      "semantic",
      "graph",
    ]);
  });
});
