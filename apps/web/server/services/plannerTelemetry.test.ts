/**
 * Tests for plannerTelemetry.ts — shadow mode validation queries
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockDb = {
  select: mockSelect,
};

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../drizzle/schema", () => ({
  taskRuns: { id: "id", taskType: "taskType", planJson: "planJson", totalCreditsUsed: "totalCreditsUsed", createdAt: "createdAt" },
  taskStepAttempts: { taskRunId: "taskRunId", effectiveModel: "effectiveModel", creditsUsed: "creditsUsed", durationMs: "durationMs" },
}));

import {
  getPlannerAccuracyReport,
  getCostComparisonReport,
  getPlannerLatencyReport,
} from "./plannerTelemetry";
import { getDb } from "../db";

describe("plannerTelemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPlannerAccuracyReport", () => {
    it("returns empty report when db is null", async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null as any);
      const report = await getPlannerAccuracyReport();
      expect(report.totalRuns).toBe(0);
      expect(report.accuracyPercent).toBe(0);
      expect(report.byTaskType).toEqual({});
    });

    it("returns empty report when no data", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      vi.mocked(getDb).mockResolvedValueOnce(mockDb as any);
      const report = await getPlannerAccuracyReport(24);
      expect(report.totalRuns).toBe(0);
      expect(report.accuracyPercent).toBe(0);
    });
  });

  describe("getCostComparisonReport", () => {
    it("returns empty report when db is null", async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null as any);
      const report = await getCostComparisonReport();
      expect(report.totalPlannerCredits).toBe(0);
      expect(report.totalActualCredits).toBe(0);
      expect(report.deltaPercent).toBe(0);
      expect(report.outliers).toEqual([]);
    });
  });

  describe("getPlannerLatencyReport", () => {
    it("returns empty report when db is null", async () => {
      vi.mocked(getDb).mockResolvedValueOnce(null as any);
      const report = await getPlannerLatencyReport();
      expect(report.avgPlannerMs).toBe(0);
      expect(report.p95PlannerMs).toBe(0);
      expect(report.p99PlannerMs).toBe(0);
      expect(report.totalRequests).toBe(0);
    });
  });
});
