import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());
const mockAdvanceRun = vi.hoisted(() => vi.fn());
const mockHasQueuedAutoAdvance = vi.hoisted(() => vi.fn());
const mockIsAutoTeamPlanReady = vi.hoisted(() => vi.fn());
const mockGetRun = vi.hoisted(() => vi.fn());
const mockRecoverBudgetBlockedAutoTeamRun = vi.hoisted(() => vi.fn());
const mockRecoverCapabilityGapAutoTeamRun = vi.hoisted(() => vi.fn());
const mockRecoverPromptPackageValidationAutoTeamRun = vi.hoisted(() => vi.fn());
const mockAdvanceAutoTeamMediaPipeline = vi.hoisted(() => vi.fn());
const dbUpdateSetCalls: Array<Record<string, unknown>> = [];

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../runEngine", () => ({
  advanceRun: mockAdvanceRun,
  getRun: mockGetRun,
  hasQueuedAutoAdvance: mockHasQueuedAutoAdvance,
  isAutoTeamPlanReady: mockIsAutoTeamPlanReady,
  recoverBudgetBlockedAutoTeamRun: mockRecoverBudgetBlockedAutoTeamRun,
  recoverCapabilityGapAutoTeamRun: mockRecoverCapabilityGapAutoTeamRun,
  recoverPromptPackageValidationAutoTeamRun:
    mockRecoverPromptPackageValidationAutoTeamRun,
}));

vi.mock("../autoTeamMediaCompletionService", () => ({
  advanceAutoTeamMediaPipeline: mockAdvanceAutoTeamMediaPipeline,
}));

import { sweepPendingAutoTeamRuns } from "../autoTeamRecoveryService";

function mockRecoveryCandidateRows(rows: Array<{ id: string; tenantId: string }>) {
  mockGetDb.mockResolvedValue({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => rows,
            }),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        dbUpdateSetCalls.push(values);
        return {
          where: async () => [],
        };
      },
    }),
  });
}

describe("autoTeamRecoveryService", () => {
  beforeEach(() => {
    mockAdvanceRun.mockReset();
    mockHasQueuedAutoAdvance.mockReset();
    mockIsAutoTeamPlanReady.mockReset();
    mockGetRun.mockReset();
    mockRecoverBudgetBlockedAutoTeamRun.mockReset();
    mockRecoverCapabilityGapAutoTeamRun.mockReset();
    mockRecoverPromptPackageValidationAutoTeamRun.mockReset();
    mockAdvanceAutoTeamMediaPipeline.mockReset();
    mockGetDb.mockReset();
    dbUpdateSetCalls.length = 0;
  });

  it("skips auto-team runs until the plan review has passed", async () => {
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
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
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
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

  it("recovers paused auto-team runs that requested budget replan", async () => {
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "paused",
      stopReason: "runtime_dispatch_blocked:budget_cap_exceeded",
      runtimeState: { autoReplanRequested: true },
    });
    mockRecoverBudgetBlockedAutoTeamRun.mockResolvedValue({ id: "run-1" });

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(1);
    expect(mockRecoverBudgetBlockedAutoTeamRun).toHaveBeenCalledWith(
      "run-1",
      "tenant-1",
    );
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });

  it("does not re-enter budget recovery after automatic attempts are exhausted", async () => {
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "paused",
      stopReason: "runtime_dispatch_blocked:budget_cap_exceeded",
      runtimeState: {
        autoReplanRequested: false,
        budgetRecoveryExhausted: true,
      },
    });

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(0);
    expect(mockRecoverBudgetBlockedAutoTeamRun).not.toHaveBeenCalled();
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });

  it("recovers paused auto-team runs when a previously missing skill becomes available", async () => {
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "paused",
      stopReason: "auto_team_step_validation_failed",
      runtimeState: { capabilityGapResumeRequested: true },
    });
    mockRecoverCapabilityGapAutoTeamRun.mockResolvedValue({ id: "run-1" });

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(1);
    expect(mockRecoverCapabilityGapAutoTeamRun).toHaveBeenCalledWith(
      "run-1",
      "tenant-1",
    );
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });

  it("recovers prompt package validation false positives", async () => {
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "paused",
      stopReason: "auto_team_step_validation_failed",
      runtimeTerminalReason: "media_step_missing_artifact_reference",
      runtimeState: {
        stepValidation: {
          stepKey: "generate-visual-assets",
          issues: ["media_step_missing_artifact_reference"],
        },
      },
    });
    mockRecoverPromptPackageValidationAutoTeamRun.mockResolvedValue({ id: "run-1" });

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(1);
    expect(mockRecoverPromptPackageValidationAutoTeamRun).toHaveBeenCalledWith(
      "run-1",
      "tenant-1",
    );
    expect(mockRecoverCapabilityGapAutoTeamRun).not.toHaveBeenCalled();
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });

  it("marks paused async media runs terminal when pipeline state is missing", async () => {
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "paused",
      stopReason: "awaiting_async_media_pipeline",
      runtimeState: {},
    });

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(0);
    expect(dbUpdateSetCalls[0]).toMatchObject({
      stopReason: "auto_team_media_pipeline_state_missing",
      runtimeTerminalReason:
        "Async media pipeline wait cannot continue because the pipeline state is missing or inactive.",
    });
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });

  it("resumes paused async media runs when an active pipeline state exists", async () => {
    mockRecoveryCandidateRows([{ id: "run-1", tenantId: "tenant-1" }]);
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      status: "paused",
      stopReason: "awaiting_async_media_pipeline",
      runtimeState: {
        autoTeamMediaPipeline: {
          status: "waiting_for_video_tasks",
        },
      },
    });
    mockAdvanceAutoTeamMediaPipeline.mockResolvedValue(undefined);

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toBe(1);
    expect(mockAdvanceAutoTeamMediaPipeline).toHaveBeenCalledWith("run-1");
    expect(dbUpdateSetCalls).toEqual([]);
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });
});
