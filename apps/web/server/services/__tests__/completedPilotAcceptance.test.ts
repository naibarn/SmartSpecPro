import { describe, expect, it } from "vitest";

import { projectTaskAcceptance } from "@shared/taskAcceptanceProjection";
import type { TaskUsageEvidenceCall } from "@shared/taskUsageEvidence";
import { buildCompletedPilotAcceptanceFixture } from "./fixtures/completedPilotAcceptance";

describe("completed pilot shared acceptance projection fixture", () => {
  it("projects bounded pilot completion while keeping four parent SPECs open", () => {
    const fixture = buildCompletedPilotAcceptanceFixture();
    const projection = projectTaskAcceptance(fixture.input);
    const workUnitRefs = projection.graph.references.filter((item) => item.kind === "work_unit");
    const runRefs = projection.graph.references.filter((item) => item.kind === "run");

    expect(fixture.fixtureOnly).toBe(true);
    expect(fixture.fixtureTrustBoundary).toMatch(/TEST_ONLY.*not a runtime producer/);
    expect(projection).toMatchObject({
      scopeCompletionStatus: "complete",
      wholeSpecComplete: null,
      goal: { status: "PROJECTED", verifiedPercent: 100, requiredCriteriaComplete: true },
      parentClosure: { closedCount: 0, totalCount: 4, status: "incomplete" },
      verification: { testsPassed: 295, totalTests: 295, testFiles: 26, status: "passed", testPassRate: 100 },
      acceptanceEnvironment: { kind: "simulated_auth", authStatus: "simulated" },
    });
    expect(workUnitRefs.map((item) => item.id)).toEqual([
      "SPEC161_STORY_WORKER_OUTCOME",
      "SPEC161_DEEP_DRAFT_FAILURE_CHAIN",
      "SPEC161_STORY_WORKER_FINAL_QC",
      "SPEC161_LINEAGE_MODEL_PASSTHROUGH",
      "SPEC161_MODEL_POLICY_READ_FAILURE_FAIL_CLOSED",
      "SPEC268_CHAT_ENTITY_MEMORY_SCOPE_GUARDS",
    ]);
    expect(workUnitRefs.find((item) => item.id === "SPEC268_CHAT_ENTITY_MEMORY_SCOPE_GUARDS")).toMatchObject({
      specId: "268",
      requirementIds: ["REQ-CF6F62069953", "REQ-D4427964FE28", "REQ-427F51C6939B"],
      sourceSha: "5b132da110b7d0b06202fdc5cf1b601d8c568304",
    });
    expect(projection.graph.references.filter((item) => item.kind === "pull_request").map((item) => item.id)).toEqual(["PR-999", "PR-1000", "PR-1002"]);
    expect(projection.graph.references.filter((item) => item.kind === "commit").map((item) => item.id)).toEqual([
      "5b132da110b7d0b06202fdc5cf1b601d8c568304",
      "3190569a5d27584131b39e3933d4b9f4aa72a08d",
      "772402cdf89c921e5fdd0e8e00e3143c5e56a7d8",
    ]);
    expect(runRefs.map((item) => item.id)).toEqual([
      "c9ea5c57-d3c4-48e5-bc3c-9a7ffa444b6d",
      "4f5833c1-5f0c-4607-a026-2a6dd12d6b47",
      "1", "2",
    ]);
    expect(projection.graph.references.some((item) => item.kind === "attempt")).toBe(false);
    expect(projection.graph.references.filter((item) => item.kind === "job" || item.kind === "run").every((item) => item.verificationStatus === "unknown" || item.id === "c9ea5c57-d3c4-48e5-bc3c-9a7ffa444b6d" || item.id === "4f5833c1-5f0c-4607-a026-2a6dd12d6b47")).toBe(true);
    expect(projection.graph.links.some((link) => link.from.kind === "work_unit" && link.to.kind === "job")).toBe(false);
    expect(projection.graph.links.some((link) => link.from.kind === "run" && link.to.id === "PR-999")).toBe(true);
    expect(projection.graph.missingLinks).toEqual([]);
    expect(fixture.nativeJobRunEvidence).toHaveLength(10);
    expect(fixture.nativeJobRunEvidence.some((item) => item.runId === null && item.attemptId === null)).toBe(true);
    expect(fixture.validationOnly).toMatchObject({
      sourceSha: "40a5e8d366aaae3d7e3695ffd6c2447116429ef6",
      passedTests: 14,
      wholeRequirementClosed: false,
    });
    expect(fixture.r5).toMatchObject({ status: "PASS_SCOPED", tests: 5 });
    expect(fixture.evidencePromotion).toMatchObject({ pr: 1002, mergeSha: "772402cdf89c921e5fdd0e8e00e3143c5e56a7d8" });
    expect(fixture.staleConversationSnapshot).toMatchObject({
      displayedTokens: 160516,
      elapsedSeconds: 224,
      source: "conversation snapshot; not canonical SDK evidence",
    });
  });

  it("maps all raw SDK receipts with stable call/job identity and deduplicates exact replay", () => {
    const fixture = buildCompletedPilotAcceptanceFixture();
    const calls = fixture.input.sdkUsage.calls;
    const projection = projectTaskAcceptance(fixture.input);

    expect(calls).toHaveLength(74);
    expect(calls.every((call) => call.revision === 0 && call.scope.startsWith("job:") && call.model.requested === "gpt-6-luna")).toBe(true);
    expect(calls.every((call) => call.model.providerConfirmedEffective === null)).toBe(true);
    expect(calls.every((call) => call.sourceRefs[0]?.reference.includes("pilot-canonical-model-usage-20261016.jsonl#sha256="))).toBe(true);
    expect(projection.sdkUsage.historical.counts.unique).toBe(74);
    expect(projection.sdkUsage.historical.completeTotalTokens).toBe(5771368);
    expect(projection.sdkUsage.historical.receipts.reduce((sum, receipt) => sum + (receipt.tokens.cachedInputTokens ?? 0), 0)).toBe(5179136);
    expect(projection.sdkUsage.historical.providerConfirmedModelGroups).toEqual([]);

    const replayed = projectTaskAcceptance({
      ...fixture.input,
      sdkUsage: { ...fixture.input.sdkUsage, calls: [...calls, calls[0] as TaskUsageEvidenceCall] },
    });
    expect(replayed.sdkUsage.historical.counts).toMatchObject({ received: 75, unique: 74, replayed: 1 });
    expect(replayed.sdkUsage.historical.completeTotalTokens).toBe(5771368);
  });

  it("keeps the historical released receipts, stale goal counter, and unknown billing/helper facets distinct", () => {
    const fixture = buildCompletedPilotAcceptanceFixture();
    const projection = projectTaskAcceptance(fixture.input);

    expect(fixture.input.sdkUsage.freshness).toBe("stale");
    expect(projection.sdkUsage.current).toBeNull();
    expect(fixture.input.goalCounter).toEqual({ status: "stale", value: 160516, asOf: null });
    expect(projection.sdkUsage.freshness).toBe("stale");
    expect(projection.releaseObservations).toHaveLength(74);
    expect(projection.releaseObservations.every((item) => item.state === "released")).toBe(true);
    expect(projection.billingSettlement.status).toBe("unknown");
    expect(projection.billingSettlement.receipts).toEqual([]);
    expect(projection.assistantAndConductorUsage.status).toBe("unknown");
  });

  it("does not infer usage, settlement, or complete scope when the receipt snapshot is absent", () => {
    const fixture = buildCompletedPilotAcceptanceFixture();
    const projection = projectTaskAcceptance({
      ...fixture.input,
      sdkUsage: { calls: [], asOf: null, freshness: "unknown", freshnessReason: "no receipt snapshot supplied" },
    });

    expect(projection.sdkUsage.historical.counts.unique).toBe(0);
    expect(projection.sdkUsage.current).toBeNull();
    expect(projection.billingSettlement.status).toBe("unknown");
    expect(projection.wholeSpecComplete).toBeNull();
    expect(projection.parentClosure.status).toBe("incomplete");
  });

  it("keeps a required live criterion below 100 until live evidence is verified", () => {
    const fixture = buildCompletedPilotAcceptanceFixture();
    const goal = fixture.input.goal.input;
    const firstCriterion = goal.baseline!.milestones[0]!.deliverables[0]!.acceptanceCriteria[0]!;
    const pendingGoal = {
      baseline: {
        ...goal.baseline!,
        milestones: goal.baseline!.milestones.map((milestone, milestoneIndex) => milestoneIndex !== 0 ? milestone : ({
          ...milestone,
          deliverables: milestone.deliverables.map((deliverable, deliverableIndex) => deliverableIndex !== 0 ? deliverable : ({
            ...deliverable,
            acceptanceCriteria: deliverable.acceptanceCriteria.map((criterion) => criterion.criterionId === firstCriterion.criterionId
              ? { ...criterion, liveRequired: true }
              : criterion),
          })),
        })),
      },
      observations: goal.observations.map((observation) => observation.criterionId === firstCriterion.criterionId
        ? { ...observation, verificationStatus: "PENDING" as const, liveRequired: true, liveVerified: false }
        : observation),
    };
    const projection = projectTaskAcceptance({
      ...fixture.input,
      goal: { ...fixture.input.goal, input: pendingGoal },
    });

    expect(projection.goal.requiredCriteriaComplete).toBe(false);
    expect(projection.goal.verifiedPercent).toBeLessThan(100);
    expect(projection.goal.verifiedPercentLabel).not.toBe("100%");
    expect(projection.scopeCompletionStatus).toBe("incomplete");
  });
});
