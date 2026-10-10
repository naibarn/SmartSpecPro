import { describe, expect, it } from "vitest";
import { assessAutoTeamRunProgress } from "../autoTeamProgressProjection";

const now = Date.parse("2026-10-10T00:00:00.000Z");

function makeStage(overrides: Partial<Parameters<typeof assessAutoTeamRunProgress>[0]["stages"][number]> = {}) {
  return {
    id: "stage-1",
    planStepKey: "plan",
    stageType: "plan" as const,
    status: "completed",
    attempt: 1,
    maxAttempts: 2,
    startedAt: new Date(now - 180_000),
    completedAt: new Date(now - 60_000),
    claimExpiresAt: new Date(now + 60_000),
    ...overrides,
  };
}

function assess(overrides: Partial<Parameters<typeof assessAutoTeamRunProgress>[0]> = {}) {
  const stages = [makeStage()];
  return assessAutoTeamRunProgress({
    tenantId: "tenant-a",
    runId: "run-a",
    runStatus: "running",
    stages,
    currentStage: stages[0],
    activeProviderStatuses: [],
    finalResultId: null,
    finalResultAccepted: false,
    loopDetected: false,
    nowMs: now,
    ...overrides,
  });
}

describe("assessAutoTeamRunProgress", () => {
  it("uses completed work units as progress without claiming final completion", () => {
    const result = assess();
    expect(result.status).toBe("PROGRESSING");
    expect(result.progress).toBe(0.5);
  });

  it("requires the existing accepted final result and completion evidence", () => {
    expect(assess({
      runStatus: "completed",
      finalResultId: "final-1",
      finalResultAccepted: false,
    }).status).toBe("PARTIAL");
    expect(assess({
      runStatus: "completed",
      finalResultId: "final-1",
      finalResultAccepted: true,
    }).status).toBe("COMPLETED");
  });

  it("does not call a valid in-flight provider job stalled", () => {
    const staleStage = makeStage({
      stageType: "media_poll",
      status: "in_progress",
      startedAt: new Date(now - 3_600_000),
      completedAt: null,
      claimExpiresAt: new Date(now - 3_000_000),
    });
    expect(assess({
      stages: [staleStage],
      currentStage: staleStage,
      activeProviderStatuses: [{ stageId: staleStage.id, status: "processing" }],
    }).status).toBe("WORKING");
  });

  it("reports a real stall only after the current worker lease and stage window expire", () => {
    const staleStage = makeStage({
      status: "in_progress",
      startedAt: new Date(now - 600_000),
      completedAt: null,
      claimExpiresAt: new Date(now - 500_000),
    });
    expect(assess({ stages: [staleStage], currentStage: staleStage }).status).toBe("STALLED");
  });

  it("preserves a canonical blocked dependency as BLOCKED", () => {
    const blocked = makeStage({ status: "blocked", claimExpiresAt: new Date(now - 500_000) });
    expect(assess({ stages: [blocked], currentStage: blocked }).status).toBe("BLOCKED");
  });

  it("returns no projection for an unsupported stage type", () => {
    const unsupported = makeStage({ stageType: "future_stage" as never });
    expect(assess({ stages: [unsupported], currentStage: unsupported })).toBeNull();
  });

  it("uses existing loop-guard results and keeps recovery advisory", () => {
    const result = assess({ loopDetected: true });
    expect(result.status).toBe("LOOPING");
    expect(result.recoveryRecommended).toBe(true);
  });

  it("reports the existing repair stage as RECOVERING", () => {
    const repair = makeStage({
      id: "repair-1",
      planStepKey: "repair",
      stageType: "repair",
      status: "in_progress",
      completedAt: null,
    });
    expect(assess({ stages: [repair], currentStage: repair }).status).toBe("RECOVERING");
  });

  it("evaluates only the latest attempt for each work unit", () => {
    const retry = makeStage({
      id: "stage-2",
      planStepKey: "plan",
      status: "in_progress",
      attempt: 2,
      completedAt: null,
    });
    const result = assess({
      stages: [makeStage(), retry],
      currentStage: retry,
    });
    expect(result.requiredCriteriaCount).toBe(2);
    expect(result.verifiedRequiredCriteria).toBe(0);
  });
});
