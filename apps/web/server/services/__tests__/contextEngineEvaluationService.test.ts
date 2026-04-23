import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../monitoringService", () => ({
  getChecks: vi.fn(),
}));

import { getChecks } from "../monitoringService";
import {
  buildContextEngineParitySummary,
  buildContextEngineTrendSeries,
  listContextEngineEvaluations,
} from "../contextEngineEvaluationService";

const mockGetChecks = vi.mocked(getChecks);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contextEngineEvaluationService", () => {
  it("filters evaluation exports by surface and intent", async () => {
    mockGetChecks.mockResolvedValue({
      checks: [
        {
          id: 1,
          checkType: "context_engine_eval",
          status: "ok",
          source: "team_run",
          createdAt: new Date("2026-04-18T00:00:00.000Z"),
          details: {
            tenantId: "tenant-1",
            surface: "team_room",
            intent: "work_execution",
            teamId: "team-1",
            roomId: "room-1",
            runId: "run-1",
            projectId: "project-1",
            userId: 1,
            skillId: "skill-1",
            healthScore: 0.9,
            groundingScore: 0.8,
            retrievalCoverage: 0.7,
            latencyMs: 120,
          },
        },
        {
          id: 2,
          checkType: "context_engine_eval",
          status: "warning",
          source: "chat_skill",
          createdAt: new Date("2026-04-18T01:00:00.000Z"),
          details: {
            tenantId: "tenant-1",
            surface: "chat",
            intent: "conversation",
            teamId: null,
            roomId: null,
            runId: null,
            projectId: null,
            userId: 7,
            skillId: "skill-2",
            healthScore: 0.4,
            groundingScore: 0.3,
            retrievalCoverage: 0.2,
            latencyMs: 250,
          },
        },
      ],
      total: 2,
      page: 1,
    } as never);

    const rows = await listContextEngineEvaluations({
      tenantId: "tenant-1",
      surface: "team_room",
      intent: "work_execution",
      teamId: "team-1",
      limit: 20,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.details.projectId).toBe("project-1");
  });

  it("builds parity and trend summaries from the same evaluation dataset", async () => {
    mockGetChecks.mockResolvedValue({
      checks: [
        {
          id: 1,
          checkType: "context_engine_eval",
          status: "ok",
          source: "team_run",
          createdAt: new Date("2026-04-18T00:00:00.000Z"),
          details: {
            tenantId: "tenant-1",
            surface: "team_room",
            intent: "work_execution",
            teamId: "team-1",
            roomId: "room-1",
            runId: "run-1",
            projectId: "project-1",
            userId: 1,
            skillId: "skill-1",
            healthScore: 0.9,
            groundingScore: 0.8,
            retrievalCoverage: 0.7,
            latencyMs: 120,
          },
        },
        {
          id: 2,
          checkType: "context_engine_eval",
          status: "warning",
          source: "chat_skill",
          createdAt: new Date("2026-04-18T01:30:00.000Z"),
          details: {
            tenantId: "tenant-1",
            surface: "chat",
            intent: "conversation",
            teamId: null,
            roomId: null,
            runId: null,
            projectId: null,
            userId: 7,
            skillId: "skill-2",
            healthScore: 0.4,
            groundingScore: 0.3,
            retrievalCoverage: 0.2,
            latencyMs: 250,
          },
        },
      ],
      total: 2,
      page: 1,
    } as never);

    const parity = await buildContextEngineParitySummary({ tenantId: "tenant-1" });
    expect(parity.map((row) => row.surface)).toEqual(["chat", "team_room"]);

    const trend = buildContextEngineTrendSeries(
      (await listContextEngineEvaluations({ tenantId: "tenant-1" })).slice(0, 2),
    );
    expect(trend.length).toBeGreaterThan(0);
    expect(trend[0]?.bucket).toMatch(/2026-04-18T0/);
  });
});

