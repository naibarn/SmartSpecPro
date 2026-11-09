import { describe, expect, it, vi } from "vitest";
import {
  computeMarketplaceDraftQcReport,
  fingerprintMarketplaceDraftQcCandidate,
  MARKETPLACE_DRAFT_QC_CRITERIA,
} from "@shared/marketplaceAutoReview/draftQualityQc";
import {
  normalizeMarketplaceDraftQcRevisionOutput,
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
  it("normalizes an unwrapped full draft and handles changedFields metadata", () => {
    const unwrappedDraft = {
      ...draft,
      plan: { ...draft.plan, title: "A revised review" },
    };
    const revised = {
      ...unwrappedDraft,
      changedFields: ["plan.title"],
    };

    expect(
      normalizeMarketplaceDraftQcRevisionOutput(unwrappedDraft, draft),
    ).toMatchObject({
      data: { draft: unwrappedDraft, changedFields: ["plan"] },
    });
    expect(normalizeMarketplaceDraftQcRevisionOutput(revised, draft)).toEqual({
      data: {
        draft: unwrappedDraft,
        changedFields: ["plan.title"],
      },
      warnings: [
        "LLM returned complete draft fields without a wrapper; the server normalized the response.",
      ],
    });
  });

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

  it("restores immutable product fields when a revision changes them", async () => {
    const product = {
      name: "Verified product",
      supportedClaims: ["easy to use"],
    };
    const draftWithPlanProduct = {
      ...draft,
      plan: { ...draft.plan, product },
    };
    const injected = deps([2, 4]);
    injected.revise = vi.fn(
      async ({ draft: current }: { draft: Record<string, unknown> }) => ({
        data: {
          draft: {
            ...current,
            plan: {
              ...(current.plan as Record<string, unknown>),
              title: "A revised review",
              product: { name: "Invented product" },
            },
          },
          changedFields: ["plan.title", "plan.product"],
        },
        promptTokens: 1,
        completionTokens: 1,
      })
    );
    const result = await runMarketplaceAutoReviewDraftQualityQc(
      {
        draft: draftWithPlanProduct,
        immutableConstraints: {
          fields: { "plan.product": product },
          preservedPaths: ["plan.product"],
        },
        userId: 1,
        maxImprovementRounds: 1,
      },
      injected
    );

    expect(result.best.draft.plan).toMatchObject({
      title: "A revised review",
      product,
    });
    expect(injected.evaluate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          plan: expect.objectContaining({ product }),
        }),
      })
    );
  });

  it("accepts an unwrapped full revision in the improvement loop and restores product facts", async () => {
    const product = {
      name: "Verified product",
      supportedClaims: ["easy to use"],
    };
    const draftWithPlanProduct = {
      ...draft,
      plan: { ...draft.plan, product },
    };
    const injected = deps([2, 5]);
    injected.revise = vi.fn(
      async ({ draft: current }: { draft: Record<string, unknown> }) => {
        const currentPlan = current.plan as Record<string, unknown>;
        return {
          data: {
            ...current,
            plan: {
              ...currentPlan,
              title: "A revised review",
              product: { name: "Invented product" },
            },
          },
          promptTokens: 1,
          completionTokens: 1,
        };
      },
    );

    const result = await runMarketplaceAutoReviewDraftQualityQc(
      {
        draft: draftWithPlanProduct,
        immutableConstraints: {
          fields: { "plan.product": product },
          preservedPaths: ["plan.product"],
        },
        userId: 1,
        maxImprovementRounds: 1,
      },
      injected,
    );

    expect(result.best.report.pass).toBe(true);
    expect(result.best.draft.plan).toMatchObject({
      title: "A revised review",
      product,
    });
    expect(injected.evaluate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          plan: expect.objectContaining({ product }),
        }),
      }),
    );
  });

  it("rejects an incomplete revision instead of fabricating missing draft fields", async () => {
    const injected = deps([2]);
    injected.revise = vi.fn(async () => ({
      data: { changedFields: ["plan.title"] },
      promptTokens: 1,
      completionTokens: 1,
    }));

    await expect(
      runMarketplaceAutoReviewDraftQualityQc(
        { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 1 },
        injected,
      ),
    ).rejects.toThrow(
      "Marketplace creative QC revise response must contain a complete draft",
    );
    expect(injected.evaluate).toHaveBeenCalledTimes(1);
    expect(injected.refundReservation).toHaveBeenCalledTimes(1);
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
