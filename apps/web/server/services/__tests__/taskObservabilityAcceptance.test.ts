import { describe, expect, it } from "vitest";
import { taskUsageEvidenceCallSchema } from "../../../shared/taskUsageEvidence";
import { projectAuthorizedTaskAcceptance } from "../taskObservabilityAcceptance";

const facts = {
  jobId: "job-1", status: "succeeded", snapshotAt: "2026-10-17T01:30:00Z", freshness: "current" as const,
  calls: [], runnerSessionId: null,
  reservations: [{ id: "reservation-1", attemptId: "attempt-1", status: "released", observedAt: null }],
};

describe("authorized task acceptance adapter", () => {
  it("keeps successful execution separate from goal acceptance and missing accounting", () => {
    const result = projectAuthorizedTaskAcceptance(facts);
    expect(result.reported.state).toBe("succeeded");
    expect(result.scopeCompletionStatus).toBe("unknown");
    expect(result.goal.verifiedPercent).toBeNull();
    expect(result.parentClosure).toEqual({ closedCount: null, totalCount: null, status: "unknown" });
    expect(result.verification.testPassRate).toBeNull();
    expect(result.sdkUsage.current?.completeTotalTokens).toBeNull();
    expect(result.billingSettlement.status).toBe("unknown");
    expect(result.verifiedLiveAcceptance).toBe(false);
    expect(result.graph.missingKinds).toEqual(expect.arrayContaining(["goal", "work_unit", "run", "pull_request", "commit"]));
    expect(result.graph.links).toContainEqual({ from: { kind: "job", id: "job-1" }, to: { kind: "attempt", id: "attempt-1" } });
  });

  it("redacts credential-shaped source references before exposing drill-down identities", () => {
    const call = taskUsageEvidenceCallSchema.parse({
      consumptionId: "call-1", scope: "job-1", revision: 0, asOf: facts.snapshotAt,
      tokens: { inputTokens: 1, outputTokens: 1 },
      sourceRefs: [{ kind: "provider_model_call", reference: "Bearer super-secret-credential-value" }],
    });
    const result = projectAuthorizedTaskAcceptance({ ...facts, calls: [call] });
    expect(JSON.stringify(result.graph)).not.toContain("super-secret-credential-value");
    expect(JSON.stringify(result.graph)).toContain("[redacted]");
  });

  it("uses measured settlement receipts and preserves stale historical evidence without summing replays", () => {
    const call = taskUsageEvidenceCallSchema.parse({
      consumptionId: "call-1", scope: "job-1", revision: 0, asOf: facts.snapshotAt,
      tokens: { inputTokens: 8, cachedInputTokens: 4, outputTokens: 2 },
      sourceRefs: [{ kind: "canonical_receipt", reference: "receipt-1" }],
      model: { requested: "requested", providerConfirmedEffective: null },
      settlement: { amount: 0.2, currency: "USD", funding: "sdk" },
    });
    const result = projectAuthorizedTaskAcceptance({ ...facts, freshness: "stale", calls: [call, call], runnerSessionId: "run-1" });
    expect(result.sdkUsage.historical.completeTotalTokens).toBe(10);
    expect(result.sdkUsage.current).toBeNull();
    expect(result.billingSettlement.receipts).toHaveLength(1);
    expect(result.billingSettlement.receipts[0].amount).toBe(0.2);
    expect(result.graph.references.filter((ref) => ref.kind === "evidence" && ref.id === "canonical_receipt:receipt-1")).toHaveLength(1);
    expect(result.graph.links).not.toContainEqual({ from: { kind: "run", id: "run-1" }, to: { kind: "attempt", id: "attempt-1" } });
  });
});
