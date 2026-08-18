import { describe, expect, it, vi } from "vitest";
import { DRAFT_QC_CRITERIA } from "@shared/verticalDramaSeries/draftQualityQc";
import {
  buildDraftQualityQcRevisionBrief,
  DRAFT_QC_JUDGE_OUTPUT_CONTRACT,
  DRAFT_QC_JUDGE_RESPONSE_FORMAT,
  recoverDraftQualityQcRevisionOutput,
  runVerticalDramaDraftQualityQc,
  VerticalDramaDraftQualityQcError,
} from "../verticalDramaDraftQualityQc";
import {
  buildDraftQualityQcRepairPlan,
  compareDraftQualityQcCandidates,
  computeDraftQualityQcReport,
  normalizeDraftQualityQcJudgeOutput,
  formatDraftQualityQcJudgeNormalizationError,
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

const validStoryDesign = {
  contractVersion: 1 as const,
  primaryEngine: "Academic rivalry creates earned trust under pressure.",
  secondaryEngines: ["scholarship risk"],
  pressureThreads: [
    {
      threadId: "scholarship-risk",
      label: "Scholarship risk",
      description: "The lead must protect funding while improving her work.",
      category: "career_or_school" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 8 },
    },
  ],
  earlyPayoff: {
    promise: "The lead proves her ability in public.",
    episodeWindow: { startEpisode: 1, endEpisode: 2 },
    evidence: "A classroom challenge changes the rival's view.",
  },
  romanceProgression: [
    {
      phase: "friction" as const,
      episodeWindow: { startEpisode: 1, endEpisode: 2 },
      pair: ["lead", "rival"] as [string, string],
      purpose: "They compete before they understand each other.",
      allowPause: true,
    },
  ],
  advantageBeats: [
    {
      episodeNumber: 2,
      advantagedSide: "protagonist" as const,
      cost: "She gains respect but attracts scrutiny.",
      opponentResponse: "The rival raises the difficulty.",
      purpose: "Keep the story engine active.",
    },
  ],
  conflictGuardrails: ["Keep the romance earned."],
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
  it("keeps repair targets disjoint from immutable preservation paths", () => {
    const plan = buildDraftQualityQcRepairPlan({
      ...call(2).data,
      pass: false,
    });

    expect(plan.actions.length).toBeGreaterThan(0);
    expect(
      plan.actions.every(action =>
        action.targetPaths.every(path => !action.preservePaths.includes(path)),
      ),
    ).toBe(true);
  });

  it("publishes a transport schema that makes criticalFails mandatory", () => {
    expect(DRAFT_QC_JUDGE_OUTPUT_CONTRACT).toContain('"criticalFails"');
    expect(DRAFT_QC_JUDGE_OUTPUT_CONTRACT).toContain("empty array []");
    expect(
      DRAFT_QC_JUDGE_RESPONSE_FORMAT.json_schema.schema.required
    ).toContain("criticalFails");
    expect(
      DRAFT_QC_JUDGE_RESPONSE_FORMAT.json_schema.schema.properties
        .criticalFails.type
    ).toBe("array");
  });

  it("normalizes provider aliases without changing the underlying scores", () => {
    const aliased = {
      ...call(4).data,
      criteria: DRAFT_QC_CRITERIA.map(item => ({
        id: item.id,
        score: 4,
        reasoning: `evidence for ${item.id}`,
      })),
    };
    const result = normalizeDraftQualityQcJudgeOutput(aliased);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.criteria[0]).toMatchObject({
        criterionId: DRAFT_QC_CRITERIA[0].id,
        rawScore: 4,
      });
      expect(computeDraftQualityQcReport(result.data).overallScore).toBe(8);
    }
  });

  it("reports missing scorecard fields instead of assigning zero", () => {
    const malformed = {
      ...call(4).data,
      criteria: DRAFT_QC_CRITERIA.map(() => ({ evidence: "evidence" })),
    };
    const result = normalizeDraftQualityQcJudgeOutput(malformed);
    expect(result).toMatchObject({ ok: false });
    expect(formatDraftQualityQcJudgeNormalizationError(malformed)).toContain(
      "criteria[0].rawScore"
    );
    expect(formatDraftQualityQcJudgeNormalizationError(malformed)).toContain(
      "No score was fabricated"
    );
  });

  it("keeps criterion scores when qualitative sections are omitted", () => {
    const incomplete = {
      criteria: DRAFT_QC_CRITERIA.map(item => ({
        criterionId: item.id,
        rawScore: 4,
        evidence: `evidence for ${item.id}`,
      })),
      criticalFails: [],
    };
    const result = normalizeDraftQualityQcJudgeOutput(incomplete);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.criteria[0].rawScore).toBe(4);
      expect(result.data.criticalFails).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.data.strengths).toEqual([
        "Evaluator did not provide strengths.",
      ]);
      expect(result.data.recommendations).toEqual([
        "Run QC again with a complete evaluator scorecard.",
      ]);
      const report = computeDraftQualityQcReport(result.data);
      expect(report.overallScore).toBe(8);
      expect(report.pass).toBe(false);
      expect(report.criticalFails).toHaveLength(0);
    }
  });

  it("recovers omitted revise changedFields from the Draft diff", () => {
    const recovered = recoverDraftQualityQcRevisionOutput(
      { draft: { ...draft, seasonArc: `${draft.seasonArc} Revised` } },
      draft,
    );

    expect(recovered?.data.changedFields).toEqual(["seasonArc"]);
    expect(recovered?.warnings[0]).toContain("omitted changedFields");
  });

  it("completes a QC baseline with per-criterion scores when the provider omits qualitative sections", async () => {
    const injected = deps([4]);
    injected.evaluate = vi.fn(async () => ({
      data: {
        criteria: DRAFT_QC_CRITERIA.map(item => ({
          criterionId: item.id,
          rawScore: 4,
          evidence: `evidence for ${item.id}`,
        })),
        criticalFails: [],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));
    const result = await runVerticalDramaDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 0 },
      injected
    );
    expect(result.evaluationsCompleted).toBe(1);
    expect(result.best.report.overallScore).toBe(8);
    expect(result.best.report.criteria).toHaveLength(DRAFT_QC_CRITERIA.length);
    expect(result.best.report.criticalFails).toHaveLength(0);
    expect(result.best.report.evaluationWarnings).toEqual([]);
    expect(result.stopReason).toBe("max_rounds");
  });

  it("rejects malformed critical-failure rows instead of substituting deterministic output", () => {
    const malformed = {
      ...call(4).data,
      criticalFails: [{ code: "not-a-valid-code", explanation: "broken" }],
    };
    const result = normalizeDraftQualityQcJudgeOutput(malformed);
    expect(result).toEqual({ ok: false, issues: ["criticalFails"] });
    expect(formatDraftQualityQcJudgeNormalizationError(malformed)).toContain(
      "criticalFails"
    );
  });

  it("requires the evaluator to return criticalFails even when it is empty", () => {
    const malformed = { ...call(4).data } as Record<string, unknown>;
    delete malformed.criticalFails;
    const result = normalizeDraftQualityQcJudgeOutput(malformed);
    expect(result).toEqual({ ok: false, issues: ["criticalFails"] });
  });

  it("stops the QC loop without a score when the evaluator returns malformed critical failures", async () => {
    const injected = deps([4]);
    injected.evaluate = vi.fn(async () => ({
      data: {
        ...call(4).data,
        criticalFails: [{ code: "invalid", explanation: "not contractual" }],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));
    const error = await runVerticalDramaDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 0 },
      injected
    ).catch(caught => caught);

    expect(error).toBeInstanceOf(VerticalDramaDraftQualityQcError);
    expect((error as VerticalDramaDraftQualityQcError).failure).toMatchObject({
      phase: "baseline_evaluate",
      evaluationsCompleted: 0,
      lastReport: null,
    });
    expect((error as Error).message).toContain("criticalFails");
  });

  it("targets the lowest long-form score with the configured episode count", () => {
    const report = computeDraftQualityQcReport({
      criteria: DRAFT_QC_CRITERIA.map(item => ({
        criterionId: item.id,
        rawScore: item.id === "long_form_sustainability" ? 3 : 5,
        evidence: item.id,
      })),
      criticalFails: [],
      strengths: ["strong premise"],
      weaknesses: ["season architecture is thin"],
      recommendations: ["map the episode windows"],
    });
    const brief = buildDraftQualityQcRevisionBrief(report, 50);
    expect(brief).toContain("long_form_sustainability (3/5)");
    expect(brief).toContain("exactly 50 episodes");
    expect(brief).toContain("terminal destination");
    expect(brief).not.toContain("hook_strength (5/5)");
  });

  it("prioritizes blocking critical failures even when every numeric score is above 3/5", () => {
    const report = computeDraftQualityQcReport({
      criteria: DRAFT_QC_CRITERIA.map(item => ({
        criterionId: item.id,
        rawScore: 4.5,
        evidence: item.id,
      })),
      criticalFails: [
        {
          code: "explicit_constraint_contradiction",
          explanation: "Romance control windows contradict the approved arc.",
        },
      ],
      strengths: ["strong premise"],
      weaknesses: [],
      recommendations: [],
    });
    const brief = buildDraftQualityQcRevisionBrief(report, 50);
    expect(brief).toContain("BLOCKING CRITICAL FAILURES");
    expect(brief).toContain("approved Story Architecture");
    expect(brief).not.toContain("No criterion is at or below 3/5");
  });

  it("unwraps scorecard responses and maps human-readable criterion labels", () => {
    const wrapped = {
      result: {
        scorecard: {
          criteria: DRAFT_QC_CRITERIA.map((item, index) => ({
            criterion: `Criterion ${index + 1}`,
            score: 4,
            reasoning: `evidence for ${item.id}`,
          })),
          strengths: ["clear engine"],
          weaknesses: [],
          recommendations: ["add early payoff"],
          criticalFails: [],
        },
      },
    };
    const result = normalizeDraftQualityQcJudgeOutput(wrapped);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.criteria.map(item => item.criterionId)).toEqual(
        DRAFT_QC_CRITERIA.map(item => item.id)
      );
      expect(result.data.criteria.every(item => item.rawScore === 4)).toBe(
        true
      );
    }
  });

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

  it("continues a QC revision when the provider omits audit-only changedFields", async () => {
    const injected = deps([2, 4]);
    injected.revise = vi.fn(async ({ draft: current }) => ({
      data: { draft: { ...current, seasonArc: `${String(current.seasonArc)} Revised` } },
      promptTokens: 1,
      completionTokens: 1,
    }));

    const result = await runVerticalDramaDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 1 },
      injected,
    );

    expect(injected.evaluate).toHaveBeenCalledTimes(2);
    expect(result.evaluationsCompleted).toBe(2);
    expect(result.history.at(-1)?.note).toContain("omitted changedFields");
  });

  it("persists every scored candidate so a creator can select a non-best round", async () => {
    const persisted: Array<{ stage: string; version: number }> = [];
    const injected = {
      ...deps([2, 4, 1, 1]),
      persistVersion: vi.fn(async input => {
      const version = persisted.length + 1;
      persisted.push({ stage: input.stage, version });
      return {
        draftId: input.draftId,
        version,
        contentHash: "a".repeat(64),
        jsonStorageKey: `draft/${version}.json`,
        markdownStorageKey: `draft/${version}.md`,
      };
      }),
    };
    const result = await runVerticalDramaDraftQualityQc(
      {
        draft,
        immutableConstraints: {},
        userId: 1,
        tenantId: "tenant",
        draftId: "00000000-0000-4000-8000-000000000010",
        draftSessionId: "draft-session",
        runId: "00000000-0000-4000-8000-000000000011",
        maxImprovementRounds: 3,
      },
      injected
    );

    expect(persisted.map(item => item.stage)).toEqual([
      "qc-baseline",
      "qc-revision",
      "qc-revision",
      "qc-revision",
      "qc-final",
    ]);
    expect(result.history.filter(item => item.report)).toHaveLength(4);
    expect(
      result.history.filter(item => item.report).every(item =>
        Boolean(item.candidateVersion && item.candidateFingerprint)
      )
    ).toBe(true);
    expect(result.history.find(item => item.reason === "not_better")?.candidateVersion).toBe(
      3
    );
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

  it("allows a targeted story-control revision without changing story identity", async () => {
    const injected = deps([2, 4]);
    const draftWithControl = { ...draft, storyDesign: validStoryDesign };
    injected.revise = vi.fn(async ({ draft: current }) => ({
      data: {
        draft: {
          ...current,
          storyDesign: {
            ...(current.storyDesign as Record<string, unknown>),
            primaryEngine: "The rivalry creates earned trust through testing.",
          },
        },
        changedFields: ["storyDesign.primaryEngine"],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));

    const result = await runVerticalDramaDraftQualityQc(
      {
        draft: draftWithControl,
        // This must remain safe even when a legacy/client caller supplies no
        // preserved paths; the server adds its mandatory identity paths.
        immutableConstraints: { preservedPaths: [] },
        userId: 1,
        maxImprovementRounds: 1,
      },
      injected,
    );

    expect(injected.evaluate).toHaveBeenCalledTimes(2);
    expect(result.evaluationsCompleted).toBe(2);
    expect(result.best.draft.storyContract).toEqual(draft.storyContract);
    expect(result.best.draft.storyDesign).toMatchObject({
      primaryEngine: "The rivalry creates earned trust through testing.",
    });
  });

  it("rejects an unknown storyDesign passthrough mutation", async () => {
    const injected = deps([2]);
    const draftWithControl = { ...draft, storyDesign: validStoryDesign };
    injected.revise = vi.fn(async ({ draft: current }) => ({
      data: {
        draft: {
          ...current,
          storyDesign: {
            ...(current.storyDesign as Record<string, unknown>),
            providerNote: "untrusted mutation",
          },
        },
        changedFields: ["storyDesign.providerNote"],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));

    await expect(
      runVerticalDramaDraftQualityQc(
        {
          draft: draftWithControl,
          immutableConstraints: { preservedPaths: [] },
          userId: 1,
          maxImprovementRounds: 1,
        },
        injected,
      ),
    ).rejects.toThrow("immutable field: storyDesign.providerNote");
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

  it("merges a patch-shaped revision so the best candidate stays renderable", async () => {
    const injected = deps([2]);
    injected.revise = vi.fn(async () => ({
      data: { draft: { title: "Only a patch" }, changedFields: ["title"] },
      promptTokens: 1,
      completionTokens: 1,
    }));
    const result = await runVerticalDramaDraftQualityQc(
      { draft, immutableConstraints: {}, userId: 1, maxImprovementRounds: 1 },
      injected
    );
    expect(result.best.draft).toMatchObject(draft);
    expect(result.history.at(-1)?.note).toContain("logline");
    expect(injected.refunded).toBe(1);
  });

  it("continues when a complete revision reports more than twelve changed fields", async () => {
    const persistedChangedPaths: string[][] = [];
    const injected = {
      ...deps([2, 4]),
      persistVersion: vi.fn(async input => {
        persistedChangedPaths.push(input.changedPaths ?? []);
        return {
          draftId: input.draftId,
          version: persistedChangedPaths.length,
          contentHash: "a".repeat(64),
          jsonStorageKey: `draft/${persistedChangedPaths.length}.json`,
          markdownStorageKey: `draft/${persistedChangedPaths.length}.md`,
        };
      }),
    };
    injected.revise = vi.fn(async ({ draft: current }) => ({
      data: {
        draft: { ...current, revision: 1 },
        changedFields: Array.from(
          { length: 13 },
          (_, index) => `storyDesign.section${index + 1}`
        ).concat("storyDesign.section1"),
      },
      promptTokens: 1,
      completionTokens: 1,
    }));

    const result = await runVerticalDramaDraftQualityQc(
      {
        draft,
        immutableConstraints: {},
        userId: 1,
        draftId: "00000000-0000-4000-8000-000000000010",
        draftSessionId: "draft-session",
        maxImprovementRounds: 1,
      },
      injected
    );

    expect(injected.revise).toHaveBeenCalledTimes(1);
    expect(injected.evaluate).toHaveBeenCalledTimes(2);
    expect(result.best.report.overallScore).toBe(8);
    expect(persistedChangedPaths[1]).toEqual(
      Array.from(
        { length: 13 },
        (_, index) => `storyDesign.section${index + 1}`
      )
    );
  });

  it("restores visualBible and nested fields when a targeted revision omits them", async () => {
    const injected = deps([2, 4]);
    const draftWithVisualBible = {
      ...draft,
      visualBible: { palette: "indigo", locations: ["lab"] },
      characters: [{ name: "Mina", role: "protagonist" }],
    };
    injected.revise = vi.fn(async () => ({
      data: {
        draft: {
          title: "Proof of Us — revised",
          characters: [{ name: "Mina", role: "protagonist", arc: "trust" }],
        },
        changedFields: ["title", "characters"],
      },
      promptTokens: 1,
      completionTokens: 1,
    }));
    const result = await runVerticalDramaDraftQualityQc(
      { draft: draftWithVisualBible, immutableConstraints: {}, userId: 1, maxImprovementRounds: 1 },
      injected
    );
    expect(result.best.draft.visualBible).toEqual(draftWithVisualBible.visualBible);
    expect(result.best.draft.characters).toEqual([
      { name: "Mina", role: "protagonist", arc: "trust" },
    ]);
    expect(result.history.at(-1)?.note).toContain("visualBible");
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
