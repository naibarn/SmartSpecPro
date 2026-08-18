import { z } from "zod";
import { sha256Hex } from "./artifacts";

export const DRAFT_QC_PASS_THRESHOLD = 9;
export const DRAFT_QC_MAX_IMPROVEMENT_ROUNDS = 10;
/** Bounded audit metadata for complete revision responses. */
export const DRAFT_QC_MAX_CHANGED_FIELDS = 64;
export const DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS = 2;
export const DRAFT_QC_ROUND_OPTIONS = [0, 1, 2, 3, 5, 10] as const;

/** Server-enforced identity paths; these must survive every QC revision. */
export const DRAFT_QC_IMMUTABLE_PRESERVED_PATHS = [
  "storyContext",
  "storyContract",
  "visualNarrativeProfile",
] as const;

/**
 * QC may repair only these known story-control fields. Unknown passthrough
 * fields remain immutable so expanding the shared schema cannot silently
 * widen the revision surface.
 */
export const DRAFT_QC_MUTABLE_STORY_DESIGN_KEYS = [
  "contractVersion",
  "totalEpisodeCount",
  "primaryEngine",
  "secondaryEngines",
  "pressureThreads",
  "earlyPayoff",
  "romanceProgression",
  "advantageBeats",
  "conflictGuardrails",
  "storyControlSeed",
] as const;

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

export const draftQualityQcRepairPlanActionSchema = z.object({
  criterionId: draftQualityQcCriterionIdSchema.nullable(),
  priority: z.enum(["critical", "high", "medium"]),
  reason: z.string().trim().min(1).max(500),
  action: z.string().trim().min(1).max(500),
  targetPaths: z.array(z.string().trim().min(1).max(120)).max(8),
  preservePaths: z.array(z.string().trim().min(1).max(120)).max(12),
  autoRunnable: z.boolean(),
});

export const draftQualityQcRepairPlanSchema = z.object({
  available: z.boolean(),
  summary: z.string().trim().min(1).max(800),
  actions: z.array(draftQualityQcRepairPlanActionSchema).max(6),
});

export type DraftQualityQcRepairPlan = z.infer<
  typeof draftQualityQcRepairPlanSchema
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

export type DraftQualityQcJudgeNormalization =
  | {
      ok: true;
      data: DraftQualityQcJudgeOutput;
      issues: [];
      warnings: string[];
    }
  | { ok: false; issues: string[] };

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFiniteScore(value: unknown): number | null {
  const score =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(score) && score >= 0 && score <= 5 ? score : null;
}

const DRAFT_QC_CRITERION_ALIASES: Record<string, DraftQualityQcCriterionId> =
  Object.fromEntries(
    DRAFT_QC_CRITERIA.flatMap(item => {
      const spaced = item.id.replaceAll("_", " ");
      const compact = item.id.replaceAll("_", "");
      const shortAliases: Record<string, string[]> = {
        hook_strength: ["hook"],
        premise_core_conflict: ["premise", "core conflict"],
        vertical_drama_engine: [
          "vertical engine",
          "repeatable engine",
          "story engine",
        ],
        escalation_twist_potential: ["escalation", "twist potential"],
        character_emotional_engine: ["character engine", "emotional engine"],
        target_audience_market_fit: ["market fit", "audience fit"],
        originality_differentiation: ["originality", "differentiation"],
        long_form_sustainability: ["sustainability", "long form"],
      };
      return [
        [item.id, item.id],
        [spaced.replace(/[^a-z0-9]+/g, "_"), item.id],
        [compact, item.id],
        ...(shortAliases[item.id] ?? []).map(alias => [
          alias.replace(/[^a-z0-9]+/g, "_"),
          item.id,
        ]),
      ];
    })
  );

function readCriterionId(value: unknown): DraftQualityQcCriterionId | null {
  const text = readNonEmptyString(value);
  if (!text) return null;
  const ordinal = text.match(
    /^(?:criterion|criteria|เกณฑ์)?\s*(\d+)\s*[.):\-]?\s*$/i
  );
  if (ordinal) {
    const index = Number(ordinal[1]) - 1;
    return DRAFT_QC_CRITERIA[index]?.id ?? null;
  }
  const normalized = text
    .toLowerCase()
    .replace(/^[\s]*(?:criterion|criteria|เกณฑ์)?\s*\d+[.):\-]?\s*/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const direct = draftQualityQcCriterionIdSchema.safeParse(normalized);
  if (direct.success) return direct.data;
  return DRAFT_QC_CRITERION_ALIASES[normalized] ?? null;
}

function readJudgePayload(value: unknown): Record<string, unknown> | null {
  let current: unknown = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    const record = current as Record<string, unknown>;
    if (
      "criteria" in record ||
      "criterionScores" in record ||
      "criterion_scores" in record ||
      "scorecard" in record
    ) {
      return record;
    }
    const next = ["data", "result", "output", "evaluation", "response"]
      .map(key => record[key])
      .find(candidate => candidate && typeof candidate === "object");
    if (!next) return record;
    current = next;
  }
  return null;
}

function readCriteriaRows(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;
  return Object.entries(value).map(([criterionId, row]) => {
    if (row && typeof row === "object" && !Array.isArray(row)) {
      return { ...(row as Record<string, unknown>), criterionId };
    }
    return { criterionId, rawScore: row };
  });
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const values = value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  return values.length > 0 || value.length === 0 ? values : fallback;
}

function readCriticalFails(value: unknown): {
  value: Array<{
    code: DraftQualityQcCriticalFailCode;
    explanation: string;
  }>;
  issues: string[];
} {
  const issues: string[] = [];
  const fallback: Array<{
  code: DraftQualityQcCriticalFailCode;
  explanation: string;
  }> = [];
  if (value === undefined) {
    return { value: fallback, issues: ["criticalFails"] };
  }
  if (!Array.isArray(value)) {
    return { value: fallback, issues: ["criticalFails"] };
  }
  const valid = value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const code = draftQualityQcCriticalFailCodeSchema.safeParse(row.code);
    const explanation = readNonEmptyString(row.explanation);
    return code.success && explanation
      ? [{ code: code.data, explanation }]
      : [];
  });
  if (valid.length !== value.length) {
    issues.push("criticalFails");
  }
  return { value: valid.slice(0, 8), issues };
}

/**
 * Normalizes common provider naming drift without inventing a score. The
 * evaluator contract remains strict: every criterion must still have an
 * identifiable id, a numeric 0-5 score, and evidence before QC can proceed.
 */
export function normalizeDraftQualityQcJudgeOutput(
  value: unknown
): DraftQualityQcJudgeNormalization {
  const direct = draftQualityQcJudgeOutputSchema.safeParse(value);
  if (direct.success)
    return { ok: true, data: direct.data, issues: [], warnings: [] };

  const payload = readJudgePayload(value);
  if (!payload) {
    return { ok: false, issues: ["response"] };
  }
  const raw =
    payload.scorecard &&
    typeof payload.scorecard === "object" &&
    !Array.isArray(payload.scorecard)
      ? (payload.scorecard as Record<string, unknown>)
      : payload;
  const rawCriteria = readCriteriaRows(
    raw.criteria ?? raw.criterionScores ?? raw.criterion_scores ?? raw.scores
  );
  if (!rawCriteria) return { ok: false, issues: ["criteria"] };

  const explicitIds = rawCriteria.map(item =>
    item && typeof item === "object"
      ? readNonEmptyString(
          (item as Record<string, unknown>).criterionId ??
            (item as Record<string, unknown>).criterion_id ??
            (item as Record<string, unknown>).id ??
            (item as Record<string, unknown>).criterion ??
            (item as Record<string, unknown>).criterionName ??
            (item as Record<string, unknown>).name ??
            (item as Record<string, unknown>).label
        )
      : null
  );
  const useCanonicalOrder =
    rawCriteria.length === DRAFT_QC_CRITERIA.length &&
    explicitIds.every(id => id === null);
  const issues: string[] = [];
  const criteria = rawCriteria.map((item, index) => {
    const row =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const criterionId = useCanonicalOrder
      ? DRAFT_QC_CRITERIA[index]?.id
      : readCriterionId(explicitIds[index]);
    const rawScore = readFiniteScore(
      row.rawScore ??
        row.raw_score ??
        row.score ??
        row.rating ??
        row.value ??
        row.points ??
        row.grade
    );
    const evidence = readNonEmptyString(
      row.evidence ??
        row.reasoning ??
        row.explanation ??
        row.justification ??
        row.rationale ??
        row.reason ??
        row.details ??
        row.comment
    );
    if (!criterionId) issues.push(`criteria[${index}].criterionId`);
    if (rawScore === null) issues.push(`criteria[${index}].rawScore`);
    if (!evidence) issues.push(`criteria[${index}].evidence`);
    return { criterionId, rawScore, evidence };
  });

  if (issues.length) return { ok: false, issues: [...new Set(issues)] };

  const normalizedCriticalFails = readCriticalFails(
    raw.criticalFails ?? raw.critical_fails ?? raw.criticalIssues
  );
  if (normalizedCriticalFails.issues.length > 0) {
    return {
      ok: false,
      issues: normalizedCriticalFails.issues,
    };
  }

  const parsed = draftQualityQcJudgeOutputSchema.safeParse({
    ...raw,
    criteria,
    // Criteria scores remain provider-authored. Missing qualitative sections
    // are normalized with explicit evidence. Critical failures are strict:
    // deterministic verification is an additional draft gate, never a
    // substitute for malformed evaluator output.
    criticalFails: normalizedCriticalFails.value,
    strengths: readStringArray(raw.strengths ?? raw.pros, [
      "Evaluator did not provide strengths.",
    ]),
    weaknesses: readStringArray(raw.weaknesses ?? raw.cons, [
      "Evaluator returned an incomplete qualitative scorecard.",
    ]),
    recommendations: readStringArray(
      raw.recommendations ?? raw.improvements ?? raw.nextSteps,
      ["Run QC again with a complete evaluator scorecard."]
    ),
  });
  if (parsed.success) {
    return {
      ok: true,
      data: parsed.data,
      issues: [],
      warnings: [],
    };
  }
  const schemaIssues =
    (parsed.error as { issues?: Array<{ path?: (string | number)[] }> })
      .issues ?? [];
  return {
    ok: false,
    issues: [
      ...new Set(
        schemaIssues.map(issue => issue.path?.join(".") || "response")
      ),
    ],
  };
}

export function formatDraftQualityQcJudgeNormalizationError(
  value: unknown
): string {
  const result = normalizeDraftQualityQcJudgeOutput(value);
  return result.ok
    ? ""
    : `Draft QC evaluator returned an incomplete scorecard. Missing or invalid fields: ${result.issues.join(", ")}. No score was fabricated.`;
}

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
  repairPlan: draftQualityQcRepairPlanSchema.optional(),
  evaluationWarnings: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
  evaluatedAt: z.string().datetime(),
});
export type DraftQualityQcReport = z.infer<typeof draftQualityQcReportSchema>;

const REPAIR_PRESERVE_PATHS = [...DRAFT_QC_IMMUTABLE_PRESERVED_PATHS];

const CRITICAL_REPAIR_TARGETS: Record<string, string[]> = {
  missing_protagonist_goal: ["logline", "mainPlot"],
  missing_core_conflict: ["mainPlot", "seasonArc"],
  missing_repeatable_engine: ["storyDesign"],
  missing_escalation_path: ["storyDesign"],
  explicit_constraint_contradiction: ["storyDesign"],
  market_setting_dialogue_contradiction: ["logline", "mainPlot"],
  random_or_unearned_twist: ["seasonArc", "storyDesign"],
  schema_or_role_inconsistency: ["storyDesign"],
};

const CRITERION_REPAIR_TARGETS: Record<string, string[]> = {
  hook_strength: ["logline", "seasonArc"],
  premise_core_conflict: ["mainPlot", "seasonArc"],
  vertical_drama_engine: ["storyDesign"],
  escalation_twist_potential: ["storyDesign", "seasonArc"],
  character_emotional_engine: ["seasonArc", "storyDesign"],
  target_audience_market_fit: ["logline", "mainPlot"],
  originality_differentiation: ["logline", "mainPlot", "storyDesign"],
  long_form_sustainability: ["storyDesign"],
};

/**
 * Build a bounded, user-readable repair plan from a real scorecard. This is
 * intentionally deterministic: it never invents a score or silently changes
 * the creator's premise. The LLM remains responsible for the actual repair
 * inside the existing Skill revision contract.
 */
export function buildDraftQualityQcRepairPlan(
  report: Pick<
    DraftQualityQcReport,
    "criteria" | "criticalFails" | "recommendations" | "pass"
  >
): DraftQualityQcRepairPlan {
  const actions: DraftQualityQcRepairPlan["actions"] = [];
  for (const failure of report.criticalFails.slice(0, 3)) {
    actions.push({
      criterionId: null,
      priority: "critical",
      reason: failure.explanation,
      action: "รักษาเงื่อนไขเดิม แล้วเติมเหตุและผลของจุดวิกฤตให้ตรวจสอบได้",
      targetPaths: CRITICAL_REPAIR_TARGETS[failure.code] ?? ["storyDesign"],
      preservePaths: REPAIR_PRESERVE_PATHS,
      autoRunnable: true,
    });
  }
  const weakCriteria = [...report.criteria]
    .filter(item => item.rawScore < 4.5)
    .sort((a, b) => a.rawScore - b.rawScore)
    .slice(0, 3);
  for (const criterion of weakCriteria) {
    if (actions.some(item => item.criterionId === criterion.criterionId)) continue;
    const recommendation = report.recommendations[actions.length] ?? report.recommendations[0];
    actions.push({
      criterionId: criterion.criterionId,
      priority: criterion.rawScore < 4 ? "high" : "medium",
      reason: criterion.evidence,
      action:
        recommendation ??
        "ขยายเหตุการณ์และผลลัพธ์ของเกณฑ์นี้ให้เป็นเหตุเป็นผลตลอดจำนวนตอนที่กำหนด",
      targetPaths: CRITERION_REPAIR_TARGETS[criterion.criterionId] ?? [
        "storyDesign",
      ],
      preservePaths: REPAIR_PRESERVE_PATHS,
      autoRunnable: true,
    });
  }
  return draftQualityQcRepairPlanSchema.parse({
    available: !report.pass && actions.length > 0,
    summary: report.pass
      ? "Draft ผ่านเกณฑ์แล้ว ไม่จำเป็นต้องซ่อมเพิ่ม"
      : actions.length > 0
        ? "ระบบพบจุดที่ซ่อมได้และจะให้ Skill ปรับเฉพาะจุด โดยเก็บข้อมูลเดิมไว้"
        : "ยังไม่พบแผนซ่อมที่ปลอดภัย จึงไม่ควรใช้เครดิตเพิ่มโดยอัตโนมัติ",
    actions,
  });
}

export const draftQualityQcHistoryEntrySchema = z.object({
  round: z.number().int().min(0).max(DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  score: z.number().min(0).max(10),
  status: draftQualityQcStatusSchema,
  kept: z.boolean(),
  reason: z.enum(["baseline", "improved", "not_better", "passed", "failed"]),
  /** Immutable ledger version containing the exact Draft evaluated this round. */
  candidateVersion: z.number().int().positive().optional(),
  /** Fingerprint binds a selectable Draft to its scorecard and create receipt. */
  candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
  /** Credit accounting from calls completed before the failure. */
  creditEstimate: z.lazy(() => draftQualityQcCreditEstimateSchema).optional(),
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

/**
 * Durable QC result exposed for comparison after a Redis/BullMQ run expires.
 * A historical result is never authoritative for the active Draft receipt.
 */
export interface DraftQualityQcResultSnapshot {
  /** Durable run identity used when the active Redis run has expired. */
  runId?: string;
  best: {
    draft: Record<string, unknown>;
    report: DraftQualityQcReport;
    round: number;
    fingerprint: string;
  };
  history: DraftQualityQcHistoryEntry[];
  creditEstimate: DraftQualityQcCreditEstimate;
  stopReason: "passed" | "max_rounds" | "no_improvement";
  roundsAttempted: number;
  evaluationsCompleted: number;
  model: string;
  draftArtifactId?: string;
  /** A failed run can still expose an immutable, fully scored prior candidate. */
  recoveredFromFailure?: boolean;
  recoveryMessage?: string;
}

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
  evaluatedAt = new Date().toISOString(),
  options: {
    criticalFails?: DraftQualityQcJudgeOutput["criticalFails"];
    evaluationWarnings?: string[];
  } = {}
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
  const criticalFails = options.criticalFails ?? judge.criticalFails;
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
    repairPlan: buildDraftQualityQcRepairPlan({
      criteria,
      criticalFails,
      recommendations: judge.recommendations,
      pass,
    }),
    evaluationWarnings: options.evaluationWarnings ?? [],
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
