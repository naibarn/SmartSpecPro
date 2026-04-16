import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());
const mockAdvanceRun = vi.hoisted(() => vi.fn());
const mockHasQueuedAutoAdvance = vi.hoisted(() => vi.fn());
const mockIsAutoTeamPlanReady = vi.hoisted(() => vi.fn());
const mockGetRun = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../runEngine", () => ({
  advanceRun: mockAdvanceRun,
  getRun: mockGetRun,
  hasQueuedAutoAdvance: mockHasQueuedAutoAdvance,
  isAutoTeamPlanReady: mockIsAutoTeamPlanReady,
}));

import { sweepPendingAutoTeamRuns } from "../autoTeamRecoveryService";

describe("autoTeamRecoveryService", () => {
  beforeEach(() => {
    mockAdvanceRun.mockReset();
    mockHasQueuedAutoAdvance.mockReset();
    mockIsAutoTeamPlanReady.mockReset();
    mockGetRun.mockReset();
    mockGetDb.mockReset();
  });

  it("skips auto-team runs until the plan review has passed", async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: "run-1", tenantId: "tenant-1" }],
          }),
        }),
      }),
    });
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "running",
      stopReason: null,
      runtimeState: null,
    });
    mockIsAutoTeamPlanReady.mockResolvedValue(false);

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(0);
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });

  it("resumes auto-team runs only after the plan review passes", async () => {
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: "run-1", tenantId: "tenant-1" }],
          }),
        }),
      }),
    });
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "running",
      stopReason: null,
      runtimeState: null,
    });
    mockIsAutoTeamPlanReady.mockResolvedValue(true);
    mockAdvanceRun.mockResolvedValue([]);

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(1);
    expect(mockAdvanceRun).toHaveBeenCalledWith("run-1", "tenant-1", 1);
  });
});
