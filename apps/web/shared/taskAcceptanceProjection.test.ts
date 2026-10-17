import { describe, expect, it } from "vitest";

import { loadCompletedAutonomousPilotFixture } from "../server/services/__tests__/fixtures/completedAutonomousPilot";
import {
  compareTaskAcceptanceEvidence,
  projectTaskAcceptance,
  observeTaskAcceptanceSnapshot,
  type AcceptanceComparisonEvidence,
  type TaskAcceptanceInput,
} from "./taskAcceptanceProjection";
import type { GoalProgressInput } from "./taskGoalProgress";
import { taskUsageEvidenceCallSchema, type TaskUsageEvidenceCall } from "./taskUsageEvidence";

const trustedGoal: GoalProgressInput = {
  baseline: {
    goalId: "pilot-goal",
    version: "v1",
    digest: `sha256:${"a".repeat(64)}`,
    milestones: [{
      milestoneId: "m1",
      weight: 1,
      deliverables: [{
        deliverableId: "d1",
        weight: 1,
        acceptanceCriteria: [{ criterionId: "c1", weight: 1, required: true, liveRequired: false, workUnits: [] }],
      }],
    }],
  },
  observations: [{
    baselineVersion: "v1",
    baselineDigest: `sha256:${"a".repeat(64)}`,
    criterionId: "c1",
    revision: 1,
    evidenceRef: "evidence-1",
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
  }],
};

function input(overrides: Partial<TaskAcceptanceInput> = {}): TaskAcceptanceInput {
  return {
    scope: { kind: "pilot", id: "pilot-1" },
    reported: { state: "COMPLETE", basis: "bounded pilot evidence", evidenceStatus: "verified" },
    goal: { input: trustedGoal, baselineSource: "trusted" },
    parentClosure: { closedCount: 1, totalCount: 2, status: "incomplete" },
    remainingRequirements: ["whole SPEC acceptance"],
    graph: { available: [], links: [] },
    verification: { testsPassed: 12, totalTests: 12, testFiles: 2, sourceSha: "abc123", status: "passed" },
    acceptanceEnvironment: { kind: "local_fixture", authStatus: "simulated" },
    sdkUsage: { calls: [], asOf: "2026-10-17T00:00:00.000Z", freshness: "current", freshnessReason: null },
    assistantAndConductorUsage: { status: "unknown", reason: "not captured" },
    goalCounter: { status: "stale", value: 73, asOf: "2026-10-16T00:00:00.000Z" },
    releaseObservations: [{ receiptId: "release-1", state: "released", observedAt: null }],
    ...overrides,
  };
}

function fixtureCall(receipt: ReturnType<typeof loadCompletedAutonomousPilotFixture>["modelUsage"]["rawReceipts"][number]): TaskUsageEvidenceCall {
  return taskUsageEvidenceCallSchema.parse({
    consumptionId: receipt.modelCallId,
    scope: `job:${receipt.jobId}`,
    revision: 0,
    asOf: receipt.observedAt,
    sourceRefs: [{ kind: "retained_model_usage_receipt", reference: receipt.modelCallId }],
    tokens: {
      mode: "delta",
      inputTokens: receipt.inputTokens,
      cachedInputTokens: receipt.cachedInputTokens,
      outputTokens: receipt.outputTokens,
    },
    model: { requested: receipt.requestedModel, providerConfirmedEffective: receipt.effectiveModel },
    coverage: { relationship: "standalone" },
  });
}

describe("task acceptance projection", () => {
  it("uses all 74 retained pilot receipts as historical linked SDK usage without elevating unknown facets", () => {
    const fixture = loadCompletedAutonomousPilotFixture();
    const projection = projectTaskAcceptance(input({
      sdkUsage: {
        calls: fixture.modelUsage.rawReceipts.map(fixtureCall),
        asOf: "2026-10-16T13:30:00.000Z",
        freshness: "unknown",
        freshnessReason: "retained artifact is historical",
      },
      assistantAndConductorUsage: { status: "unknown", reason: "not captured by SDK receipts" },
      releaseObservations: fixture.modelUsage.rawReceipts.map((receipt) => ({
        receiptId: receipt.modelCallId,
        state: receipt.reservationStatus === "released" ? "released" as const : "unknown" as const,
        observedAt: receipt.observedAt,
      })),
    }));

    expect(projection.sdkUsage.historical.counts.unique).toBe(74);
    expect(projection.sdkUsage.historical.completeTotalTokens).toBe(5_771_368);
    expect(projection.sdkUsage.historical.receipts.reduce((sum, receipt) => sum + (receipt.tokens.cachedInputTokens ?? 0), 0)).toBe(5_179_136);
    expect(projection.sdkUsage.current).toBeNull();
    expect(projection.sdkUsage.historical.providerConfirmedModelGroups).toEqual([]);
    expect(projection.assistantAndConductorUsage.status).toBe("unknown");
    expect(projection.releaseObservations).toHaveLength(74);
    expect(projection.billingSettlement).toEqual({ status: "unknown", receipts: [] });
    expect(projection.wholeSpecComplete).toBeNull();
    expect(projection.scopeCompletionStatus).toBe("complete");
    expect(projection.verifiedLiveAcceptance).toBe(false);
    expect(projection.verification.testPassRate).toBe(100);
  });

  it("requires a trusted goal baseline and keeps closure, remaining scope, GoalCounter and SDK freshness independent", () => {
    const untrusted = projectTaskAcceptance(input({ goal: { input: trustedGoal, baselineSource: "unverified" } }));
    expect(untrusted.goal.verifiedPercent).toBeNull();
    expect(untrusted.goal.status).toBe("BASELINE_MISSING");
    expect(untrusted.goal.reason).toBe("baseline_unverified");

    const trusted = projectTaskAcceptance(input());
    expect(trusted.goal.verifiedPercent).toBe(100);
    expect(trusted.goal.verifiedPercentLabel).toBe("100%");
    expect(trusted.parentClosure.status).toBe("incomplete");
    expect(trusted.remainingRequirements).toEqual(["whole SPEC acceptance"]);
    expect(trusted.goalCounter).toMatchObject({ status: "stale", value: 73 });
    expect(trusted.sdkUsage.current?.completeTotalTokens).toBeNull();
  });

  it("does not display 100 percent when required criteria remain incomplete", () => {
    const highScoreWithZeroWeightGate: GoalProgressInput = {
      baseline: {
        ...trustedGoal.baseline!,
        milestones: [{
          milestoneId: "m1",
          weight: 1,
          deliverables: [{
            deliverableId: "d1",
            weight: 1,
            acceptanceCriteria: [
              { criterionId: "required-zero-weight", weight: 0, required: true, liveRequired: false, workUnits: [] },
              { criterionId: "optional-weighted", weight: 1, required: false, liveRequired: false, workUnits: [] },
            ],
          }],
        }],
      },
      observations: [{
        ...trustedGoal.observations[0],
        criterionId: "optional-weighted",
        implemented: true,
        workComplete: true,
      }],
    };
    const projection = projectTaskAcceptance(input({ goal: { input: highScoreWithZeroWeightGate, baselineSource: "trusted" } }));
    expect(projection.goal.verifiedPercent).toBeLessThan(100);
    expect(projection.goal.verifiedPercentLabel).toBe("<100% (required criteria pending)");
  });

  it("reports absent graph links instead of inventing run or attempt IDs", () => {
    const goal = { kind: "goal" as const, id: "goal-1" };
    const workUnit = { kind: "work_unit" as const, id: "WU-1", verificationStatus: "verified" as const };
    const run = { kind: "run" as const, id: "run-observed" };
    const missingAttempt = { kind: "attempt" as const, id: "attempt-not-observed" };
    const projection = projectTaskAcceptance(input({
      graph: { available: [goal, workUnit, run], links: [{ from: goal, to: workUnit }, { from: workUnit, to: run }, { from: run, to: missingAttempt }] },
    }));
    expect(projection.graph.references).toEqual([goal, workUnit, run]);
    expect(projection.graph.references[1].verificationStatus).toBe("verified");
    expect(projection.graph.missingKinds).toEqual(["attempt", "pull_request", "commit", "evidence"]);
    expect(projection.graph.missingLinks).toEqual([{ from: run, to: missingAttempt }]);
  });

  it("deduplicates graph references and downgrades conflicting verification claims", () => {
    const workUnit = { kind: "work_unit" as const, id: "WU-1", verificationStatus: "verified" as const };
    const projection = projectTaskAcceptance(input({ graph: {
      available: [workUnit, { ...workUnit, verificationStatus: "unverified" }],
      links: [],
    } }));
    expect(projection.graph.references).toHaveLength(1);
    expect(projection.graph.references[0].verificationStatus).toBe("unknown");
  });

  it("separates bounded scope completion from parent completion and verifies live acceptance only with live trusted evidence", () => {
    const pilot = projectTaskAcceptance(input({
      scope: { kind: "pilot", id: "bounded-pilot" },
      parentClosure: { closedCount: null, totalCount: null, status: "unknown" },
    }));
    expect(pilot.scopeCompletionStatus).toBe("complete");
    expect(pilot.wholeSpecComplete).toBeNull();
    expect(pilot.parentClosure.status).toBe("unknown");

    const liveSpec = projectTaskAcceptance(input({
      scope: { kind: "spec", id: "SPEC-088" },
      acceptanceEnvironment: { kind: "live_production", authStatus: "verified" },
    }));
    expect(liveSpec.scopeCompletionStatus).toBe("complete");
    expect(liveSpec.wholeSpecComplete).toBe(true);
    expect(liveSpec.verifiedLiveAcceptance).toBe(true);

    const simulated = projectTaskAcceptance(input({
      acceptanceEnvironment: { kind: "simulated_auth", authStatus: "simulated" },
    }));
    expect(simulated.verifiedLiveAcceptance).toBe(false);
  });

  it("derives billing status only from actual settlement receipts, never from released resources", () => {
    const releasedOnly = projectTaskAcceptance(input({ releaseObservations: [{ receiptId: "r1", state: "released", observedAt: null }] }));
    expect(releasedOnly.billingSettlement).toEqual({ status: "unknown", receipts: [] });

    const settledCall = taskUsageEvidenceCallSchema.parse({
      consumptionId: "settled-call",
      scope: "job-1",
      revision: 0,
      asOf: "2026-10-17T00:00:00Z",
      tokens: { mode: "delta", inputTokens: 1, outputTokens: 1 },
      settlement: { amount: 0.02, currency: "USD", funding: "tenant-credit" },
    });
    const withSettlement = projectTaskAcceptance(input({ sdkUsage: {
      calls: [settledCall], asOf: settledCall.asOf, freshness: "current", freshnessReason: null,
    } }));
    expect(withSettlement.billingSettlement.status).toBe("evidence_observed");
    expect(withSettlement.billingSettlement.receipts).toHaveLength(1);
    expect(withSettlement.billingSettlement.receipts[0].amount).toBe(0.02);
  });

  it("rejects incomparable pilots when effective model or other matching evidence is unknown", () => {
    const left: AcceptanceComparisonEvidence = {
      workloadId: "episode-workload-v1",
      contractRevision: "acceptance-v2",
      acceptanceEnvironment: "native-postgres-test",
      sourceRevision: "abc123",
      effectiveModel: null,
      outcome: { status: "verified", identity: "outcome-a" },
      usage: { current: false, completeTotalTokens: 100, callIdentities: ["call-a"], callIdentitiesVerified: true },
      funding: null,
      latencyBasis: "wall_clock",
      latencyMs: 200,
    };
    const right: AcceptanceComparisonEvidence = {
      ...left,
      effectiveModel: "provider/model",
      usage: { current: true, completeTotalTokens: 90, callIdentities: ["call-b"], callIdentitiesVerified: true },
      funding: "known",
      latencyMs: 180,
    };
    const unknown = compareTaskAcceptanceEvidence(left, right);
    expect(unknown.comparable).toBe(false);
    expect(unknown.tokenDelta).toBeNull();
    expect(unknown.reasons).toEqual(expect.arrayContaining(["effective_model_unknown", "usage_not_current", "funding_unknown"]));

    const comparable = compareTaskAcceptanceEvidence(
      {
        ...left,
        effectiveModel: "provider/model-a",
        usage: { current: true, completeTotalTokens: 100, callIdentities: ["call-a"], callIdentitiesVerified: true },
        funding: "tenant-credit",
      },
      { ...right, funding: "tenant-credit" },
    );
    expect(comparable).toMatchObject({ comparable: true, tokenDelta: -10, latencyDeltaMs: -20 });

    const validLeft: AcceptanceComparisonEvidence = {
      workloadId: "episode-workload-v1",
      contractRevision: "acceptance-v2",
      acceptanceEnvironment: "native-postgres-test",
      sourceRevision: "abc123",
      effectiveModel: "provider/model-a",
      outcome: { status: "verified", identity: "outcome-a" },
      usage: { current: true, completeTotalTokens: 0, callIdentities: ["call-a"], callIdentitiesVerified: true },
      funding: "tenant-credit",
      latencyBasis: "wall_clock",
      latencyMs: 0,
    };
    const validRight = { ...validLeft, effectiveModel: "provider/model-b", outcome: { status: "verified" as const, identity: "outcome-b" }, usage: { ...validLeft.usage, callIdentities: ["call-b"] } };
    expect(compareTaskAcceptanceEvidence(validLeft, validRight).comparable).toBe(true);

    const malformed: AcceptanceComparisonEvidence[] = [
      { ...validLeft, usage: { ...validLeft.usage, completeTotalTokens: -1 } },
      { ...validLeft, latencyMs: Number.NaN },
      { ...validLeft, usage: { ...validLeft.usage, completeTotalTokens: 0.5 } },
      { ...validLeft, effectiveModel: "UNKNOWN" },
      { ...validLeft, funding: "UNKNOWN" },
      { ...validLeft, effectiveModel: "   " },
      { ...validLeft, sourceRevision: "   " },
      { ...validLeft, outcome: { status: "verified", identity: " " } },
      { ...validLeft, usage: { ...validLeft.usage, callIdentities: ["call-a", "call-a"] } },
      { ...validLeft, funding: "   " },
    ];
    for (const evidence of malformed) {
      expect(compareTaskAcceptanceEvidence(evidence, validRight).comparable).toBe(false);
    }
  });
});


describe("conflicting drill-down provenance", () => {
  it("withholds verification and metadata when one WorkUnit identity has conflicting source evidence", () => {
    const result = projectTaskAcceptance(input({ graph: { available: [
      { kind: "work_unit", id: "unit-1", verificationStatus: "verified", sourceSha: "sha-a" },
      { kind: "work_unit", id: "unit-1", verificationStatus: "verified", sourceSha: "sha-b" },
    ], links: [] } }));
    expect(result.graph.references).toEqual([{ kind: "work_unit", id: "unit-1", verificationStatus: "unknown" }]);
  });
});


describe("acceptance evidence contradictions", () => {
  it("withholds a current usage snapshot when its observation time is missing", () => {
    const result = projectTaskAcceptance(input({ sdkUsage: { calls: [], asOf: null, freshness: "current", freshnessReason: null } }));
    expect(result.sdkUsage.current).toBeNull();
    expect(result.sdkUsage.freshness).toBe("unknown");
    expect(result.sdkUsage.freshnessReason).toBe("snapshot_time_unknown");
  });
  it("does not verify completion when a current acceptance test result contradicts the report", () => {
    const original = input();
    const result = projectTaskAcceptance({ ...original, verification: { ...original.verification, status: "failed" } });
    expect(result.scopeCompletionStatus).toBe("incomplete");
    expect(result.goal.verifiedPercent).toBeNull();
    expect(result.goal.reason).toBe("acceptance_result_conflict");
    expect(result.verifiedLiveAcceptance).toBe(false);
  });
});


describe("cached acceptance observation", () => {
  it("expires a formerly current snapshot without discarding its retained receipt evidence", () => {
    const original = projectTaskAcceptance(input());
    const observedAt = Date.parse(original.sdkUsage.asOf!) + 600_001;
    const stale = observeTaskAcceptanceSnapshot(original, observedAt);
    expect(stale.sdkUsage.current).toBeNull();
    expect(stale.sdkUsage.freshness).toBe("stale");
    expect(stale.sdkUsage.historical).toBe(original.sdkUsage.historical);
    expect(original.sdkUsage.freshness).toBe("current");
    expect(observeTaskAcceptanceSnapshot(stale, observedAt - 600_001)).toBe(stale);
  });
  it("withholds current usage when the observation clock or future snapshot is unverified", () => {
    const original = projectTaskAcceptance(input());
    expect(observeTaskAcceptanceSnapshot(original, Number.NaN).sdkUsage.current).toBeNull();
    expect(observeTaskAcceptanceSnapshot(original, Date.parse(original.sdkUsage.asOf!) - 30_001).sdkUsage.freshness).toBe("unknown");
  });
});
