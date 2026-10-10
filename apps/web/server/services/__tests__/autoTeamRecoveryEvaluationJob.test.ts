import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRun = vi.hoisted(() => vi.fn());
const mockSweepPendingAutoTeamRuns = vi.hoisted(() => vi.fn());

vi.mock("../runEngine", () => ({ getRun: mockGetRun }));
vi.mock("../autoTeamRecoveryService", () => ({
  sweepPendingAutoTeamRuns: mockSweepPendingAutoTeamRuns,
}));

import {
  buildAutoTeamRecoveryEvaluationJob,
  fingerprintAutoTeamRecoveryState,
  parseAutoTeamRecoveryEvaluationInput,
} from "../autoTeamRecoveryEvaluationJob";
import { executeAutoTeamRecoveryEvaluation } from "../autoTeamRecoveryEvaluationExecutor";

const run = {
  id: "run-1",
  status: "running",
  stopReason: null,
  runtimeTerminalReason: null,
  runtimeState: { currentStep: "research", version: 2 },
};

function makeExecutorInput(input: unknown, assertActive = vi.fn().mockResolvedValue(undefined)) {
  return {
    context: { tenantId: "tenant-1", jobId: "job-1", input } as any,
    lease: { jobId: "job-1", attemptId: "attempt-1" } as any,
    reporter: {
      assertActive,
      progress: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn(),
      fail: vi.fn(),
      heartbeat: vi.fn(),
      waitForExternal: vi.fn(),
    } as any,
  };
}

describe("AutoTeam recovery evaluation job contract", () => {
  beforeEach(() => {
    mockGetRun.mockReset();
    mockSweepPendingAutoTeamRuns.mockReset();
  });

  it("is deterministic across replay and strictly validates its envelope", () => {
    const stateFingerprint = fingerprintAutoTeamRecoveryState(run);
    const first = buildAutoTeamRecoveryEvaluationJob({
      tenantId: "tenant-1",
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });
    const replay = buildAutoTeamRecoveryEvaluationJob({
      tenantId: "tenant-1",
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });

    expect(first.idempotencyKey).toBe(replay.idempotencyKey);
    expect(first.activeDedupeKey).toBe(`auto-team-recovery:${run.id}`);
    expect(parseAutoTeamRecoveryEvaluationInput(first.input)).toEqual({
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });
    expect(parseAutoTeamRecoveryEvaluationInput({ ...first.input, extra: true })).toBeNull();
  });

  it("ignores a state that changed before the leased evaluation starts", async () => {
    mockGetRun.mockResolvedValue({ ...run, runtimeState: { currentStep: "review" } });
    mockSweepPendingAutoTeamRuns.mockReset();
    const stateFingerprint = fingerprintAutoTeamRecoveryState(run);
    const definition = buildAutoTeamRecoveryEvaluationJob({
      tenantId: "tenant-1",
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });

    const result = await executeAutoTeamRecoveryEvaluation(makeExecutorInput(definition.input));

    expect(result.output).toEqual({ outcome: "stale_evaluation", runId: run.id });
    expect(mockSweepPendingAutoTeamRuns).not.toHaveBeenCalled();
  });

  it("dispatches one bounded recovery through the existing run owner", async () => {
    mockGetRun
      .mockResolvedValueOnce(run)
      .mockResolvedValueOnce({ ...run, runtimeState: { currentStep: "review", version: 3 } });
    mockSweepPendingAutoTeamRuns.mockResolvedValue(1);
    const stateFingerprint = fingerprintAutoTeamRecoveryState(run);
    const definition = buildAutoTeamRecoveryEvaluationJob({
      tenantId: "tenant-1",
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });

    const result = await executeAutoTeamRecoveryEvaluation(makeExecutorInput(definition.input));

    expect(mockSweepPendingAutoTeamRuns).toHaveBeenCalledWith({
      onlyRunId: run.id,
      expectedStateFingerprint: stateFingerprint,
    });
    expect(result.output).toEqual({
      outcome: "recovery_verified",
      runId: run.id,
      actionsDispatched: 1,
      recoveryVerified: true,
    });
  });

  it("records a provider wait without treating it as a failed evaluation", async () => {
    const waitingRun = {
      ...run,
      status: "paused",
      stopReason: "awaiting_async_media_pipeline",
      runtimeState: { autoTeamMediaPipeline: { status: "waiting_for_video_tasks" } },
    };
    mockGetRun.mockResolvedValue(waitingRun);
    mockSweepPendingAutoTeamRuns.mockResolvedValue(0);
    const stateFingerprint = fingerprintAutoTeamRecoveryState(waitingRun);
    const definition = buildAutoTeamRecoveryEvaluationJob({
      tenantId: "tenant-1",
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });

    const result = await executeAutoTeamRecoveryEvaluation(makeExecutorInput(definition.input));

    expect(result.output).toMatchObject({ outcome: "provider_job", actionsDispatched: 0 });
  });

  it("honors a stale fenced lease before reading or dispatching recovery", async () => {
    const stateFingerprint = fingerprintAutoTeamRecoveryState(run);
    const definition = buildAutoTeamRecoveryEvaluationJob({
      tenantId: "tenant-1",
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });
    const leaseError = new Error("lease reclaimed");
    const assertActive = vi.fn().mockRejectedValue(leaseError);

    await expect(
      executeAutoTeamRecoveryEvaluation(makeExecutorInput(definition.input, assertActive)),
    ).rejects.toBe(leaseError);
    expect(mockGetRun).not.toHaveBeenCalled();
    expect(mockSweepPendingAutoTeamRuns).not.toHaveBeenCalled();
  });

  it("propagates injected recovery failures to the canonical worker retry policy", async () => {
    mockGetRun.mockResolvedValue(run);
    const failure = Object.assign(new Error("injected runEngine failure"), {
      class: "retryable",
    });
    mockSweepPendingAutoTeamRuns.mockRejectedValue(failure);
    const stateFingerprint = fingerprintAutoTeamRecoveryState(run);
    const definition = buildAutoTeamRecoveryEvaluationJob({
      tenantId: "tenant-1",
      runId: run.id,
      stateFingerprint,
      evaluationSlot: 123,
    });

    await expect(
      executeAutoTeamRecoveryEvaluation(makeExecutorInput(definition.input)),
    ).rejects.toBe(failure);
  });
});
