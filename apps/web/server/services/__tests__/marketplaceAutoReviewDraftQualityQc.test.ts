import { describe, expect, it, vi } from "vitest";
import {
  computeMarketplaceDraftQcReport,
  fingerprintMarketplaceDraftQcCandidate,
  MARKETPLACE_DRAFT_QC_CRITERIA,
} from "@shared/marketplaceAutoReview/draftQualityQc";
import {
  runMarketplaceAutoReviewDraftQualityQc,
  runMarketplaceAutoReviewDraftQualityQcRepair,
} from "../marketplaceAutoReviewDraftQualityQc";

const draft = {
  mode: "legacy",
  productId: "product-1",
  productTruth: { name: "Verified product", supportedClaims: ["easy to use"] },
  referenceManifestHash: "ref-1",
  shotContract: { count: 2, durations: [8, 8] },
  plan: {
    title: "A useful review",
    shots: [
      { shotId: 1, dialogue: "The problem starts here.", durationSeconds: 8 },
      { shotId: 2, dialogue: "Here is the demonstrated benefit.", durationSeconds: 8 },
    ],
  },
};

function call(score: number) {
  return {
    data: {
      criteria: MARKETPLACE_DRAFT_QC_CRITERIA.map(item => ({
        criterionId: item.id,
        rawScore: score,
        evidence: item.id,
      })),
      criticalFails: [],
      strengths: ["coherent"],
      weaknesses: score < 5 ? ["needs a stronger opening"] : [],
      recommendations: score < 5 ? ["make the hook concrete"] : [],
    },
    promptTokens: 1,
    completionTokens: 1,
  };
}

function deps(scores: number[]) {
  let index = 0;
  const evaluate = vi.fn(async () => call(scores[Math.min(index++, scores.length - 1)]));
  const revise = vi.fn(async ({ draft: current }: { draft: Record<string, unknown> }) => ({
    data: { draft: { ...current, revision: index }, changedFields: ["plan"] },
    promptTokens: 1,
    completionTokens: 1,
  }));
  return {
    model: "test-model",
    evaluate,
    revise,
    createReservation: vi.fn(async (amount: number) => ({
      reservationId: "00000000-0000-4000-8000-000000000002",
      userId: 1,
      reservedAmount: amount,
      drawnAmount: 0,
      transactionId: 1,
      sourceType: "skill" as const,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    drawReservation: vi.fn(async () => undefined),
    refundReservation: vi.fn(async () => undefined),
  };
}

describe("marketplace Auto Review Creative QC loop", () => {
  it("stops after a passing baseline and does not revise", async () => {
    const injected = deps([5]);
    const result = await runMarketplaceAutoReviewDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 5 },
      injected
    );
    expect(result.best.report.pass).toBe(true);
    expect(injected.evaluate).toHaveBeenCalledTimes(1);
    expect(injected.revise).not.toHaveBeenCalled();
  });

  it("retains the best candidate and stops after two regressions", async () => {
    const injected = deps([2, 3, 2, 2]);
    const result = await runMarketplaceAutoReviewDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 5 },
      injected
    );
    expect(result.best.report.overallScore).toBe(6);
    expect(result.best.round).toBe(1);
    expect(result.stopReason).toBe("no_improvement");
    expect(result.history.filter(item => item.kept)).toHaveLength(2);
  });

  it("rejects a revision that changes immutable product truth", async () => {
    const injected = deps([2]);
    injected.revise = vi.fn(async () => ({
      data: {
        draft: {
          ...draft,
          productTruth: { name: "Invented product" },
        },
        changedFields: ["productTruth"],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));
    await expect(
      runMarketplaceAutoReviewDraftQualityQc(
        {
          draft,
          immutableConstraints: {
            fields: { productTruth: draft.productTruth },
            preservedPaths: ["productTruth"],
          },
          userId: 1,
          maxImprovementRounds: 1,
        },
        injected
      )
    ).rejects.toThrow("immutable field: productTruth");
  });

  it("runs one bounded repair and a fresh QC without mutating the source", async () => {
    const injected = deps([5]);
    const sourceReport = computeMarketplaceDraftQcReport(call(2).data);
    const result = await runMarketplaceAutoReviewDraftQualityQcRepair(
      {
        draft,
        sourceReport,
        sourceFingerprint: fingerprintMarketplaceDraftQcCandidate(draft),
        immutableConstraints: {},
        userId: 1,
      },
      injected,
    );
    expect(result.improved).toBe(true);
    expect(result.best.report.pass).toBe(true);
    expect(result.history).toHaveLength(2);
    expect(injected.revise).toHaveBeenCalledTimes(1);
    expect(injected.evaluate).toHaveBeenCalledTimes(1);
    expect(draft).not.toHaveProperty("revision");
  });
});
