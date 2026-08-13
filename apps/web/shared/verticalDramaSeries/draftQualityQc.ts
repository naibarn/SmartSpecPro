import { z } from "zod";
import { sha256Hex } from "./artifacts";

export const DRAFT_QC_PASS_THRESHOLD = 9;
export const DRAFT_QC_MAX_IMPROVEMENT_ROUNDS = 10;
export const DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS = 2;
export const DRAFT_QC_ROUND_OPTIONS = [0, 1, 2, 3, 5, 10] as const;

export const DRAFT_QC_CRITERIA = [
  { id: "hook_strength", weight: 1.5 },
  { id: "premise_core_conflict", weight: 1 },
  { id: "vertical_drama_engine", weight: 1.5 },
  { id: "escalation_twist_potential", weight: 1.25 },
  { id: "character_emotional_engine", weight: 1.25 },
  { id: "target_audience_market_fit", weight: 1.25 },
  { id: "originality_differentiation", weight: 1 },
  { id: "long_form_sustainability", weight: 1.25 },
] as const;

export type DraftQualityQcCriterionId =
  (typeof DRAFT_QC_CRITERIA)[number]["id"];

export const draftQualityQcCriterionIdSchema = z.enum(
  DRAFT_QC_CRITERIA.map(item => item.id) as [
    DraftQualityQcCriterionId,
    ...DraftQualityQcCriterionId[],
  ]
);

export const draftQualityQcRawCriterionSchema = z.object({
  criterionId: draftQualityQcCriterionIdSchema,
  rawScore: z.number().min(0).max(5),
  evidence: z.string().trim().min(1).max(1200),
});

export const draftQualityQcCriticalFailCodeSchema = z.enum([
  "missing_protagonist_goal",
  "missing_core_conflict",
  "missing_repeatable_engine",
  "missing_escalation_path",
  "explicit_constraint_contradiction",
  "market_setting_dialogue_contradiction",
  "random_or_unearned_twist",
  "schema_or_role_inconsistency",
]);

export type DraftQualityQcCriticalFailCode = z.infer<
  typeof draftQualityQcCriticalFailCodeSchema
>;

export const draftQualityQcJudgeOutputSchema = z.object({
  criteria: z
    .array(draftQualityQcRawCriterionSchema)
    .length(DRAFT_QC_CRITERIA.length),
  criticalFails: z
    .array(
      z.object({
        code: draftQualityQcCriticalFailCodeSchema,
        explanation: z.string().trim().min(1).max(1000),
      })
    )
    .max(8),
  strengths: z.array(z.string().trim().min(1).max(500)).max(3),
  weaknesses: z.array(z.string().trim().min(1).max(500)).max(3),
  recommendations: z.array(z.string().trim().min(1).max(500)).max(3),
});

export type DraftQualityQcJudgeOutput = z.infer<
  typeof draftQualityQcJudgeOutputSchema
>;

export const draftQualityQcComputedCriterionSchema =
  draftQualityQcRawCriterionSchema.extend({
    weight: z.number().positive(),
    weightedScore: z.number().min(0).max(5),
  });

export const draftQualityQcStatusSchema = z.enum([
  "passed",
  "strong",
  "needs_work",
  "blocked",
]);
export type DraftQualityQcStatus = z.infer<typeof draftQualityQcStatusSchema>;

export const draftQualityQcReportSchema = z.object({
  contractVersion: z.literal("vd-draft-qc-v1"),
  overallScore: z.number().min(0).max(10),
  status: draftQualityQcStatusSchema,
  pass: z.boolean(),
  criticalFails: z
    .array(
      z.object({
        code: draftQualityQcCriticalFailCodeSchema,
        explanation: z.string().trim().min(1).max(1000),
      })
    )
    .max(8),
  criteria: z
    .array(draftQualityQcComputedCriterionSchema)
    .length(DRAFT_QC_CRITERIA.length),
  strengths: z.array(z.string().trim().min(1).max(500)).max(3),
  weaknesses: z.array(z.string().trim().min(1).max(500)).max(3),
  recommendations: z.array(z.string().trim().min(1).max(500)).max(3),
  evaluatedAt: z.string().datetime(),
});
export type DraftQualityQcReport = z.infer<typeof draftQualityQcReportSchema>;

export const draftQualityQcHistoryEntrySchema = z.object({
  round: z.number().int().min(0).max(DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  score: z.number().min(0).max(10),
  status: draftQualityQcStatusSchema,
  kept: z.boolean(),
  reason: z.enum(["baseline", "improved", "not_better", "passed", "failed"]),
  /** Full scorecard for this evaluation. Optional for legacy records and failed revisions. */
  report: z.lazy(() => draftQualityQcReportSchema).optional(),
  /** Explains why this round has no new score, or records a non-fatal round issue. */
  note: z.string().trim().min(1).max(1200).optional(),
});
export type DraftQualityQcHistoryEntry = z.infer<
  typeof draftQualityQcHistoryEntrySchema
>;

export const draftQualityQcFailurePhaseSchema = z.enum([
  "baseline_evaluate",
  "revise",
  "evaluate",
  "finalizing",
]);
export type DraftQualityQcFailurePhase = z.infer<
  typeof draftQualityQcFailurePhaseSchema
>;

export const draftQualityQcFailureSchema = z.object({
  phase: draftQualityQcFailurePhaseSchema,
  round: z.number().int().min(0).max(DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  message: z.string().trim().min(1).max(2000),
  callsDone: z.number().int().min(0),
  callsMax: z.number().int().min(1),
  roundsAttempted: z.number().int().min(0).max(DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  evaluationsCompleted: z.number().int().min(0),
  history: z.array(draftQualityQcHistoryEntrySchema),
  lastReport: z.lazy(() => draftQualityQcReportSchema).nullable(),
});
export type DraftQualityQcFailure = z.infer<typeof draftQualityQcFailureSchema>;

export const draftQualityQcRoundBudgetSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(10),
]);

export const draftQualityQcCreditEstimateSchema = z.object({
  baselineCalls: z.literal(1),
  maxImprovementRounds: z
    .number()
    .int()
    .min(0)
    .max(DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  maxCalls: z
    .number()
    .int()
    .min(1)
    .max(1 + DRAFT_QC_MAX_IMPROVEMENT_ROUNDS * 2),
  estimatedCredits: z.number().positive(),
  actualCredits: z.number().min(0),
});
export type DraftQualityQcCreditEstimate = z.infer<
  typeof draftQualityQcCreditEstimateSchema
>;

export const draftQualityQcJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type DraftQualityQcJobStatus = z.infer<
  typeof draftQualityQcJobStatusSchema
>;

export const draftQualityQcProgressSchema = z.object({
  phase: z.enum(["baseline_evaluate", "revise", "evaluate", "finalizing"]),
  round: z.number().int().min(0).max(DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  maxRounds: z.number().int().min(0).max(DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  callsDone: z.number().int().min(0),
  callsMax: z.number().int().min(1),
  lastScore: z.number().min(0).max(10).nullable(),
});
export type DraftQualityQcProgress = z.infer<
  typeof draftQualityQcProgressSchema
>;

export const draftQualityQcReceiptSchema = z.object({
  runId: z.string().uuid(),
  candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  explicitOverride: z.boolean().optional().default(false),
});
export type DraftQualityQcReceipt = z.infer<typeof draftQualityQcReceiptSchema>;

export function normalizeDraftQualityQcRoundBudget(
  value: number | undefined
): number {
  if (value === undefined) return DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS;
  return DRAFT_QC_ROUND_OPTIONS.includes(
    value as (typeof DRAFT_QC_ROUND_OPTIONS)[number]
  )
    ? value
    : DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS;
}

export function estimateDraftQualityQcCredits(params: {
  maxImprovementRounds: number;
  perCallCredits: number;
}): DraftQualityQcCreditEstimate {
  const maxImprovementRounds = normalizeDraftQualityQcRoundBudget(
    params.maxImprovementRounds
  );
  const maxCalls = 1 + maxImprovementRounds * 2;
  return {
    baselineCalls: 1,
    maxImprovementRounds,
    maxCalls,
    estimatedCredits: Math.max(
      0.01,
      Number((maxCalls * params.perCallCredits).toFixed(2))
    ),
    actualCredits: 0,
  };
}

export function computeDraftQualityQcReport(
  judge: DraftQualityQcJudgeOutput,
  evaluatedAt = new Date().toISOString()
): DraftQualityQcReport {
  const expected = new Set<DraftQualityQcCriterionId>(
    DRAFT_QC_CRITERIA.map(item => item.id)
  );
  const seen = new Set<DraftQualityQcCriterionId>();
  for (const criterion of judge.criteria) {
    if (
      seen.has(criterion.criterionId) ||
      !expected.has(criterion.criterionId)
    ) {
      throw new Error(
        `Draft QC criteria must contain each id exactly once: ${criterion.criterionId}`
      );
    }
    seen.add(criterion.criterionId);
  }
  if (seen.size !== DRAFT_QC_CRITERIA.length) {
    throw new Error("Draft QC criteria are incomplete");
  }

  const criteria = DRAFT_QC_CRITERIA.map(definition => {
    const raw = judge.criteria.find(
      item => item.criterionId === definition.id
    )!;
    const weightedScore = (raw.rawScore / 5) * definition.weight;
    return {
      ...raw,
      weight: definition.weight,
      weightedScore: Number(weightedScore.toFixed(2)),
    };
  });
  const overallScore = Number(
    criteria.reduce((sum, item) => sum + item.weightedScore, 0).toFixed(2)
  );
  const criticalFails = judge.criticalFails;
  const pass =
    overallScore >= DRAFT_QC_PASS_THRESHOLD && criticalFails.length === 0;
  const status: DraftQualityQcStatus = pass
    ? "passed"
    : criticalFails.length > 0
      ? "blocked"
      : overallScore >= 8
        ? "strong"
        : "needs_work";

  return draftQualityQcReportSchema.parse({
    contractVersion: "vd-draft-qc-v1",
    overallScore,
    status,
    pass,
    criticalFails,
    criteria,
    strengths: judge.strengths,
    weaknesses: judge.weaknesses,
    recommendations: judge.recommendations,
    evaluatedAt,
  });
}

export function compareDraftQualityQcCandidates(
  current: { report: DraftQualityQcReport; round: number } | null,
  candidate: { report: DraftQualityQcReport; round: number }
): number {
  if (!current) return 1;
  // A candidate with no critical failures is always safer than a higher-scored
  // candidate that still contains a production-blocking defect. The previous
  // score-first ordering could select an attractive but unshippable draft.
  if (candidate.report.pass !== current.report.pass) {
    return candidate.report.pass ? 1 : -1;
  }
  if (
    candidate.report.criticalFails.length !==
    current.report.criticalFails.length
  ) {
    return candidate.report.criticalFails.length <
      current.report.criticalFails.length
      ? 1
      : -1;
  }
  if (candidate.report.overallScore !== current.report.overallScore) {
    return candidate.report.overallScore > current.report.overallScore ? 1 : -1;
  }
  return candidate.round < current.round
    ? 1
    : candidate.round > current.round
      ? -1
      : 0;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

export function fingerprintDraftQualityQcCandidate(candidate: unknown): string {
  // Use the shared pure-TS implementation so this contract can be imported by
  // both the browser wizard and the server without pulling `node:crypto` into
  // the Vite bundle. The serialized input remains unchanged for compatibility
  // with the original server implementation.
  return sha256Hex(stableSerialize(candidate));
}

export function sanitizeDraftQualityQcReport(
  report: DraftQualityQcReport
): DraftQualityQcReport {
  return draftQualityQcReportSchema.parse(JSON.parse(JSON.stringify(report)));
}
