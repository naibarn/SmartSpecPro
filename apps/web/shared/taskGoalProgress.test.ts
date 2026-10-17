import { describe, expect, it } from "vitest";
import {
  GoalProgressProjectionError,
  goalBaselineSchema,
  projectGoalProgress,
  type GoalBaseline,
  type GoalProgressObservation,
} from "./taskGoalProgress";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const baseline = (): GoalBaseline => goalBaselineSchema.parse({
  goalId: "goal-1",
  version: "v1",
  digest: digest("a"),
  milestones: [{
      milestoneId: "milestone-1",
      weight: 2,
      deliverables: [{
        deliverableId: "deliverable-1",
        weight: 3,
      acceptanceCriteria: [
        { criterionId: "required-weighted", weight: 4, required: true, workUnits: [{ workUnitId: "wu-shared", weight: 1 }] },
        { criterionId: "optional", weight: 6, required: false, workUnits: [{ workUnitId: "wu-shared", weight: 1 }] },
        { criterionId: "required-zero", weight: 0, required: true, liveRequired: true },
      ],
    }],
  }],
});

const observation = (criterionId: string, overrides: Partial<GoalProgressObservation> = {}): GoalProgressObservation => ({
  baselineVersion: "v1",
  baselineDigest: digest("a"),
  criterionId,
  revision: 1,
  evidenceRef: `evidence:${criterionId}`,
  verificationStatus: "PASS",
  implemented: true,
  workComplete: true,
  executionProgress: 1,
  liveRequired: false,
  liveVerified: false,
  reopened: false,
  regressed: false,
  blockers: [],
  dependencies: [],
  nextAction: null,
  workUnits: [
    ...(criterionId === "required-weighted" || criterionId === "optional"
      ? [{ workUnitId: "wu-shared", implemented: true, workComplete: true, executionProgress: 1 }]
      : []),
    ...(criterionId === "c1" ? [{ workUnitId: "wu1", implemented: true, workComplete: true, executionProgress: 1 }] : []),
  ],
  ...overrides,
});

describe("projectGoalProgress", () => {
  it("returns unknown metrics when no trusted baseline exists", () => {
    const result = projectGoalProgress({ baseline: null, observations: [observation("required-weighted")] });
    expect(result.status).toBe("BASELINE_MISSING");
    expect(result.verifiedGoalCompletion.percent).toBeNull();
    expect(result.workCompletion.percent).toBeNull();
  });

  it("uses only current evidence-bound PASS observations and keeps progress axes separate", () => {
    const result = projectGoalProgress({
      baseline: baseline(),
      observations: [
        observation("required-weighted", { verificationStatus: "FAIL", executionProgress: 0.5 }),
        observation("optional"),
        observation("required-zero", { liveVerified: false }),
      ],
    });

    expect(result.executionProgress.percent).toBe(80);
    expect(result.implementationCompletion.percent).toBe(100);
    expect(result.workCompletion.percent).toBe(100);
    expect(result.verifiedGoalCompletion).toMatchObject({ percent: 60, rawPercent: 60, requiredCriteriaComplete: false });
    expect(result.evidenceCoverage).toMatchObject({ coveredCriteria: 3, totalCriteria: 3, weightedPercent: 100 });
    expect(result.unverifiedScope.map((item) => item.criterionId)).toEqual(["required-weighted", "required-zero"]);
  });

  it("never reports 100 while a required zero-weight or live criterion remains incomplete", () => {
    const result = projectGoalProgress({
      baseline: baseline(),
      observations: [
        observation("required-weighted"),
        observation("optional"),
        observation("required-zero", { liveVerified: false }),
      ],
    });

    expect(result.verifiedGoalCompletion.rawPercent).toBe(100);
    expect(result.verifiedGoalCompletion.percent).toBeLessThan(100);
    expect(result.verifiedGoalCompletion.requiredCriteriaComplete).toBe(false);
  });

  it("invalidates stale PASS evidence after reopen or regression and exposes blockers", () => {
    const result = projectGoalProgress({
      baseline: baseline(),
      observations: [
        observation("required-weighted", { revision: 1 }),
        observation("required-weighted", {
          revision: 2,
          reopened: true,
          regressed: true,
          blockers: ["needs-review"],
          dependencies: ["dep-1"],
          nextAction: "rerun-check",
        }),
        observation("optional"),
        observation("required-zero", { liveVerified: true }),
      ],
    });

    expect(result.verifiedGoalCompletion.percent).toBe(60);
    expect(result.evidenceCoverage.weightedPercent).toBe(60);
    expect(result.blockedScope).toEqual([{
      criterionId: "required-weighted",
      blockers: ["needs-review"],
      dependencies: ["dep-1"],
      nextAction: "rerun-check",
    }]);
  });

  it("ignores evidence bound to another baseline version or digest", () => {
    const result = projectGoalProgress({
      baseline: baseline(),
      observations: [
        observation("required-weighted", { baselineVersion: "v0" }),
        observation("optional", { baselineDigest: digest("b") }),
        observation("required-zero", { liveVerified: true }),
      ],
    });

    expect(result.ignoredObservationCount).toBe(2);
    expect(result.verifiedGoalCompletion.percent).toBe(0);
    expect(result.evidenceCoverage.coveredCriteria).toBe(1);
  });

  it("deduplicates shared deliverables, criteria and work units without double counting", () => {
    const shared = goalBaselineSchema.parse({
      goalId: "goal-1",
      version: "v1",
      digest: digest("a"),
      milestones: [
        { milestoneId: "m1", weight: 1, deliverables: [{ deliverableId: "d1", weight: 1, acceptanceCriteria: [{ criterionId: "c1", weight: 2, required: true, workUnits: [{ workUnitId: "wu1", weight: 1 }] }] }] },
        { milestoneId: "m2", weight: 1, deliverables: [{ deliverableId: "d1", weight: 1, acceptanceCriteria: [{ criterionId: "c1", weight: 2, required: true, workUnits: [{ workUnitId: "wu1", weight: 1 }] }] }] },
      ],
    });
    const result = projectGoalProgress({ baseline: shared, observations: [observation("c1")] });
    expect(result.verifiedGoalCompletion).toMatchObject({ totalWeight: 2, completedWeight: 2, percent: 100 });
    expect(result.workCompletion.totalWeight).toBe(2);
  });

  it("composes milestone, deliverable and criterion weights and keeps uncovered work unknown", () => {
    const weighted = goalBaselineSchema.parse({
      goalId: "goal-weights",
      version: "v1",
      digest: digest("a"),
      milestones: [
        { milestoneId: "m-heavy", weight: 3, deliverables: [{ deliverableId: "d-heavy", weight: 2, acceptanceCriteria: [{ criterionId: "c-pass", weight: 1, required: true }] }] },
        { milestoneId: "m-light", weight: 1, deliverables: [{ deliverableId: "d-light", weight: 1, acceptanceCriteria: [{ criterionId: "c-fail", weight: 1, required: false }] }] },
      ],
    });
    const result = projectGoalProgress({ baseline: weighted, observations: [observation("c-pass"), observation("c-fail", { verificationStatus: "FAIL" })] });
    expect(result.verifiedGoalCompletion.percent).toBeCloseTo(6 / 7 * 100);
    expect(result.workCompletion.percent).toBe(100);

    const uncovered = projectGoalProgress({ baseline: baseline(), observations: [] });
    expect(uncovered.workCompletion.percent).toBeNull();
  });

  it("rejects conflicting duplicate baseline entities and same-revision observation conflicts", () => {
    const conflictingBaseline = {
      ...baseline(),
      milestones: [
        baseline().milestones[0],
        { milestoneId: "milestone-2", weight: 1, deliverables: [{ deliverableId: "deliverable-1", weight: 1, acceptanceCriteria: [{ criterionId: "required-weighted", weight: 9, required: true }] }] },
      ],
    };
    expect(() => projectGoalProgress({ baseline: conflictingBaseline, observations: [] }))
      .toThrow(new GoalProgressProjectionError("BASELINE_DUPLICATE_CONFLICT"));
    expect(() => projectGoalProgress({
      baseline: baseline(),
      observations: [observation("required-weighted"), observation("required-weighted", { verificationStatus: "FAIL" })],
    })).toThrow(new GoalProgressProjectionError("OBSERVATION_DUPLICATE_CONFLICT"));
  });

  it("does not mutate caller-owned baseline or observations", () => {
    const sourceBaseline = baseline();
    const sourceObservations = [observation("required-weighted"), observation("optional"), observation("required-zero", { liveVerified: true })];
    const before = JSON.stringify({ sourceBaseline, sourceObservations });
    projectGoalProgress({ baseline: sourceBaseline, observations: sourceObservations });
    expect(JSON.stringify({ sourceBaseline, sourceObservations })).toBe(before);
  });
});
