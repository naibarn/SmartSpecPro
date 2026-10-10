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
const mockCreateCanonicalJobInTransaction = vi.hoisted(() => vi.fn());
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
vi.mock("../jobControlPlane", () => ({
  createCanonicalJobInTransaction: mockCreateCanonicalJobInTransaction,
}));

import {
  isRecoveryEvaluationEligible,
  dispatchPendingAutoTeamEvaluations,
  sweepPendingAutoTeamRuns,
} from "../autoTeamRecoveryService";

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
    mockCreateCanonicalJobInTransaction.mockReset();
    mockGetDb.mockReset();
    dbUpdateSetCalls.length = 0;
  });

  it("distinguishes a future approval wait from an eligible provider wait", () => {
    const now = new Date("2026-10-10T08:00:00.000Z");
    mockHasQueuedAutoAdvance.mockReturnValue(false);

    expect(isRecoveryEvaluationEligible({
      id: "run-approval",
      status: "paused",
      stopReason: "awaiting_human_choice",
      runtimeState: { choiceDeadlineAt: "2026-10-10T09:00:00.000Z" },
    } as any, now)).toBe(false);
    expect(isRecoveryEvaluationEligible({
      id: "run-provider",
      status: "paused",
      stopReason: "awaiting_async_media_pipeline",
      runtimeState: {
        autoTeamMediaPipeline: { status: "waiting_for_video_tasks" },
      },
    } as any, now)).toBe(true);
    expect(isRecoveryEvaluationEligible({
      id: "run-resource-wait",
      status: "paused",
      stopReason: "awaiting_async_media_pipeline",
      runtimeState: { autoTeamMediaPipeline: { status: "capacity_wait" } },
    } as any, now)).toBe(true);
    expect(isRecoveryEvaluationEligible({
      id: "run-unsupported",
      status: "paused",
      stopReason: "auto_team_step_validation_failed",
      runtimeState: {},
    } as any, now)).toBe(false);
  });

  it("continues dispatching independent runs when one candidate cannot be read", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] }),
        }),
      }),
    };
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [
                  { id: "run-bad", tenantId: "tenant-1" },
                  { id: "run-ready", tenantId: "tenant-1" },
                ],
              }),
            }),
          }),
        }),
      }),
      transaction: async (work: (query: any) => Promise<unknown>) => work(tx),
    });
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockImplementation(async (runId: string) => {
      if (runId === "run-bad") throw new Error("injected read failure");
      return {
        id: runId,
        status: "paused",
        stopReason: "auto_team_final_evidence_unresolved",
        runtimeState: {},
      };
    });
    mockCreateCanonicalJobInTransaction.mockResolvedValue({
      jobId: "job-1",
      created: true,
    });

    const queued = await dispatchPendingAutoTeamEvaluations(
      new Date("2026-10-10T08:00:00.000Z"),
    );

    expect(queued).toBe(1);
    expect(mockCreateCanonicalJobInTransaction).toHaveBeenCalledOnce();
    expect(mockCreateCanonicalJobInTransaction.mock.calls[0]?.[0]).toMatchObject({
      definition: {
        jobType: "auto-team.recovery.evaluate",
        input: { runId: "run-ready" },
      },
    });
  });

  it("bounds unchanged no-progress evaluation loops without blocking another ready run", async () => {
    const candidates = [
      { id: "run-stalled", tenantId: "tenant-1" },
      { id: "run-ready", tenantId: "tenant-1" },
    ];
    let transactionIndex = 0;
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ orderBy: () => ({ limit: async () => candidates }) }),
          }),
        }),
      }),
      transaction: async (work: (query: any) => Promise<unknown>) => {
        const thisTransaction = transactionIndex++;
        let selectIndex = 0;
        const priorNoProgress = Array.from({ length: 3 }, () => ({
          outputJson: { outcome: "no_action" },
        }));
        const tx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: () => {
            const currentSelect = selectIndex++;
            const rows = thisTransaction === 0 && currentSelect === 1 ? priorNoProgress : [];
            return {
              from: () => ({
                where: () => ({
                  limit: async () => rows,
                  orderBy: () => ({ limit: async () => rows }),
                }),
              }),
            };
          },
        };
        return work(tx);
      },
    });
    mockHasQueuedAutoAdvance.mockReturnValue(false);
    mockGetRun.mockImplementation(async (runId: string) => ({
      id: runId,
      tenantId: "tenant-1",
      status: "running",
      stopReason: null,
      runtimeState: {},
    }));
    mockIsAutoTeamPlanReady.mockResolvedValue(true);
    mockCreateCanonicalJobInTransaction.mockResolvedValue({ jobId: "job-ready", created: true });

    const queued = await dispatchPendingAutoTeamEvaluations(new Date("2026-10-10T08:00:00.000Z"));

    expect(queued).toBe(1);
    expect(mockCreateCanonicalJobInTransaction).toHaveBeenCalledOnce();
    expect(mockCreateCanonicalJobInTransaction.mock.calls[0]?.[0]).toMatchObject({
      definition: { input: { runId: "run-ready" } },
    });
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

    expect(resumed).toMatchObject({ actionsDispatched: 0, usefulWorkVerified: false });
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
    mockAdvanceRun.mockResolvedValue([{ messageId: "message-1", content: "Useful progress" }]);

    const resumed = await sweepPendingAutoTeamRuns();

    expect(resumed).toMatchObject({ actionsDispatched: 1, usefulWorkVerified: true, usefulWorkEvidence: ["assistant_turn_persisted"] });
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

    expect(resumed).toMatchObject({ actionsDispatched: 1, usefulWorkVerified: false });
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

    expect(resumed).toMatchObject({ actionsDispatched: 0, usefulWorkVerified: false });
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

    expect(resumed).toMatchObject({ actionsDispatched: 1, usefulWorkVerified: false });
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

    expect(resumed).toMatchObject({ actionsDispatched: 1, usefulWorkVerified: false });
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

    expect(resumed).toMatchObject({ actionsDispatched: 0, usefulWorkVerified: false });
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

    expect(resumed).toMatchObject({ actionsDispatched: 1, usefulWorkVerified: false });
    expect(mockAdvanceAutoTeamMediaPipeline).toHaveBeenCalledWith("run-1");
    expect(dbUpdateSetCalls).toEqual([]);
    expect(mockAdvanceRun).not.toHaveBeenCalled();
  });
});
