import { describe, expect, it, vi } from "vitest";
import { DRAFT_QC_CRITERIA } from "@shared/verticalDramaSeries/draftQualityQc";
import {
  runVerticalDramaDraftQualityQc,
  VerticalDramaDraftQualityQcError,
} from "../verticalDramaDraftQualityQc";
import {
  compareDraftQualityQcCandidates,
  computeDraftQualityQcReport,
  type DraftQualityQcReport,
} from "@shared/verticalDramaSeries/draftQualityQc";

const draft = {
  title: "Proof of Us",
  logline:
    "A student must protect her scholarship while falling for her academic rival.",
  mainPlot:
    "She competes, collaborates, and risks the scholarship as feelings grow.",
  seasonArc:
    "The rivalry becomes trust, then love, while a final evaluation threatens her future.",
  storyContext: { targetMarket: "United States" },
  storyDesign: { primaryEngine: "academic rivalry plus romance" },
  storyContract: {
    destination: { longTermEndpoint: "real-world application" },
  },
};

function call(score: number) {
  return {
    data: {
      criteria: DRAFT_QC_CRITERIA.map(item => ({
        criterionId: item.id,
        rawScore: score,
        evidence: item.id,
      })),
      criticalFails: [],
      strengths: ["clear engine"],
      weaknesses: score < 5 ? ["needs escalation"] : [],
      recommendations: score < 5 ? ["add early payoff"] : [],
    },
    promptTokens: 1,
    completionTokens: 1,
  };
}

function deps(scores: number[]) {
  let index = 0;
  const calls = vi.fn(async () =>
    call(scores[Math.min(index++, scores.length - 1)])
  );
  const revisions = vi.fn(
    async ({ draft: current }: { draft: Record<string, unknown> }) => ({
      data: {
        draft: { ...current, revision: index },
        changedFields: ["seasonArc"],
      },
      promptTokens: 1,
      completionTokens: 1,
    })
  );
  let refunded = 0;
  return {
    model: "test-model",
    evaluate: calls,
    revise: revisions,
    createReservation: vi.fn(async (amount: number) => ({
      reservationId: "00000000-0000-4000-8000-000000000001",
      userId: 1,
      reservedAmount: amount,
      drawnAmount: 0,
      transactionId: 1,
      sourceType: "skill" as const,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })),
    drawReservation: vi.fn(async () => undefined),
    refundReservation: vi.fn(async () => {
      refunded += 1;
    }),
    get refunded() {
      return refunded;
    },
  };
}

describe("vertical drama draft quality QC loop", () => {
  it("prefers a candidate without critical failures over a higher-scored blocked candidate", () => {
    const report = (
      score: number,
      criticalFails: DraftQualityQcReport["criticalFails"]
    ): DraftQualityQcReport =>
      computeDraftQualityQcReport({
        criteria: DRAFT_QC_CRITERIA.map(item => ({
          criterionId: item.id,
          rawScore: score / 2,
          evidence: item.id,
        })),
        criticalFails,
        strengths: ["strength"],
        weaknesses: [],
        recommendations: [],
      });
    const higherButBlocked = {
      report: report(4.8, [
        { code: "missing_core_conflict", explanation: "missing" },
      ]),
      round: 1,
    };
    const lowerAndSafe = { report: report(4.4, []), round: 2 };
    expect(
      compareDraftQualityQcCandidates(higherButBlocked, lowerAndSafe)
    ).toBe(1);
  });

  it("evaluates baseline and stops immediately when it passes", async () => {
    const injected = deps([5]);
    const result = await runVerticalDramaDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 10 },
      injected
    );
    expect(result.best.report.pass).toBe(true);
    expect(result.stopReason).toBe("passed");
    expect(injected.evaluate).toHaveBeenCalledTimes(1);
    expect(injected.revise).not.toHaveBeenCalled();
    expect(injected.refunded).toBe(1);
  });

  it("keeps the better revision and stops after two regressions", async () => {
    const injected = deps([2, 4, 1, 1, 1]);
    const result = await runVerticalDramaDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 10 },
      injected
    );
    expect(result.best.report.overallScore).toBe(8);
    expect(result.best.round).toBe(1);
    expect(result.history.filter(item => item.kept)).toHaveLength(2);
    expect(result.stopReason).toBe("no_improvement");
    expect(injected.revise).toHaveBeenCalledTimes(3);
  });

  it("does not allow a revision to change preserved story identity", async () => {
    const injected = deps([2]);
    injected.revise = vi.fn(async () => ({
      data: {
        draft: { ...draft, storyContext: { targetMarket: "Canada" } },
        changedFields: ["storyContext"],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));
    await expect(
      runVerticalDramaDraftQualityQc(
        { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 1 },
        injected
      )
    ).rejects.toThrow("immutable field: storyContext");
    expect(injected.refunded).toBe(1);
  });

  it("preserves the approved Story Architecture during revision", async () => {
    const injected = deps([2]);
    injected.revise = vi.fn(async () => ({
      data: {
        draft: {
          ...draft,
          storyContract: { destination: { longTermEndpoint: "campus only" } },
        },
        changedFields: ["storyContract"],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));
    await expect(
      runVerticalDramaDraftQualityQc(
        { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 1 },
        injected
      )
    ).rejects.toThrow("immutable field: storyContract");
    expect(injected.refunded).toBe(1);
  });

  it("rejects a patch-shaped revision so the best candidate stays renderable", async () => {
    const injected = deps([2]);
    injected.revise = vi.fn(async () => ({
      data: { draft: { title: "Only a patch" }, changedFields: ["title"] },
      promptTokens: 1,
      completionTokens: 1,
    }));
    await expect(
      runVerticalDramaDraftQualityQc(
        { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 1 },
        injected
      )
    ).rejects.toThrow("omitted required draft field");
    expect(injected.refunded).toBe(1);
  });

  it("rejects an incomplete revision without replacing the best draft", async () => {
    const injected = deps([2]);
    const result = await runVerticalDramaDraftQualityQc(
      {
        draft,
        immutableConstraints: { targetEpisodeCount: 10 },
        userId: 1,
        maxImprovementRounds: 1,
        enforceCompleteness: true,
      },
      injected
    );
    expect(result.best.round).toBe(0);
    expect(result.history.at(-1)?.reason).toBe("failed");
  });

  it("keeps the completed scorecards and loop diagnostics when a later QC call fails", async () => {
    const injected = deps([2]);
    injected.evaluate = vi
      .fn()
      .mockResolvedValueOnce(call(2))
      .mockRejectedValueOnce(new Error("No endpoints found for QC evaluation"));

    const error = await runVerticalDramaDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 2 },
      injected
    ).catch(caught => caught);

    expect(error).toBeInstanceOf(VerticalDramaDraftQualityQcError);
    expect((error as VerticalDramaDraftQualityQcError).failure).toMatchObject({
      phase: "evaluate",
      round: 1,
      message: "No endpoints found for QC evaluation",
      callsDone: 2,
      roundsAttempted: 1,
      evaluationsCompleted: 1,
    });
    expect(
      (error as VerticalDramaDraftQualityQcError).failure.history[0].report
        ?.criteria
    ).toHaveLength(DRAFT_QC_CRITERIA.length);
    expect(
      (error as VerticalDramaDraftQualityQcError).failure.lastReport
        ?.overallScore
    ).toBe(4);
    expect(injected.refunded).toBe(1);
  });
});
