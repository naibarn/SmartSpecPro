import { describe, expect, it } from "vitest";
import { aggregateUsageEvidence, projectModelFacets, taskUsageEvidenceCallSchema } from "./taskUsageEvidence";

function call(overrides: Record<string, unknown> = {}) {
  return taskUsageEvidenceCallSchema.parse({
    consumptionId: "call-1",
    scope: "job-1",
    revision: 0,
    asOf: "2026-10-17T00:00:00.000Z",
    sourceRefs: [{ kind: "receipt", reference: "receipt-1" }],
    tokens: { mode: "delta", inputTokens: 80, outputTokens: 16, cachedInputTokens: 20 },
    model: { uiSession: "ui-model", requested: "requested-model", providerConfirmedEffective: "provider-model", helper: null },
    ...overrides,
  });
}

describe("task usage evidence projection", () => {
  it("keeps four model identities separate and requires provider confirmation for effective model", () => {
    const source = call({ model: { uiSession: "session-model", requested: "worker-model", providerConfirmedEffective: null, helper: "helper-model" } });
    expect(projectModelFacets(source)).toEqual({ uiSession: "session-model", requested: "worker-model", effective: null, helper: "helper-model" });
  });

  it("deduplicates retries by consumption identity and uses the newest correction once", () => {
    const original = call({ tokens: { mode: "delta", inputTokens: 18510, outputTokens: 59, cachedInputTokens: 18176 } });
    const correction = call({
      revision: 1,
      asOf: "2026-10-17T00:01:00.000Z",
      tokens: { mode: "delta", inputTokens: 36933, outputTokens: 122, cachedInputTokens: 18176 },
      sourceRefs: [{ kind: "correction", reference: "event-2" }],
    });
    const result = aggregateUsageEvidence([original, original, correction]);
    expect(result.completeTotalTokens).toBe(37055);
    expect(result.counts).toMatchObject({ received: 3, unique: 1, known: 1, corrections: 1, replayed: 1 });
    expect(result.receipts[0].tokens.cachedInputTokens).toBe(18176);
  });

  it("deltas cumulative snapshots only within the same explicit session and epoch", () => {
    const cumulative = (id: string, asOf: string, inputTokens: number, outputTokens: number) => call({
      consumptionId: id,
      asOf,
      tokens: { mode: "cumulative", inputTokens, outputTokens, cachedInputTokens: 0, sessionId: "thread-a", epoch: "turn-1" },
    });
    const result = aggregateUsageEvidence([
      cumulative("snapshot-1", "2026-10-17T00:00:00Z", 100, 10),
      cumulative("snapshot-2", "2026-10-17T00:00:01Z", 150, 15),
      cumulative("snapshot-3", "2026-10-17T00:00:02Z", 175, 20),
    ]);
    expect(result.completeTotalTokens).toBeNull();
    expect(result.knownSubtotalTokens).toBe(85);
    expect(result.receipts.map((receipt) => receipt.tokens.totalTokens)).toEqual([null, 55, 30]);
  });

  it("marks equal-revision conflicts, unknown counts, overlap, and incomplete coverage as unknown", () => {
    const conflicting = call({ tokens: { mode: "delta", inputTokens: 81, outputTokens: 16, cachedInputTokens: 20 } });
    const overlap = call({ consumptionId: "helper-call", coverage: { relationship: "overlap_unknown", rationale: "parent may include this call" } });
    const unknown = call({ consumptionId: "unknown-call", tokens: { mode: "delta", inputTokens: null, outputTokens: 3, cachedInputTokens: null } });
    const result = aggregateUsageEvidence([call(), conflicting, overlap, unknown]);
    expect(result.completeTotalTokens).toBeNull();
    expect(result.counts).toMatchObject({ conflicts: 1, overlap: 1, missing: 2 });
    expect(result.coverageReason).toBe("parent may include this call");
  });

  it("does not expose credential-like strings in source provenance", () => {
    const result = aggregateUsageEvidence([call({ sourceRefs: [{ kind: "receipt", reference: "api_key=secret-value" }] })]);
    expect(result.receipts[0].sourceRefs[0].reference).not.toContain("secret-value");
  });
});
