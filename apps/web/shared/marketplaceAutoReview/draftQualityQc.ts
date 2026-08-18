import { z } from "zod";
import { sha256Hex } from "../verticalDramaSeries/artifacts";

/** Creative QC is intentionally separate from the Vertical Drama draft QC.
 * The former judges a product-led story/review draft; the latter judges a
 * series bible. Keeping separate contracts prevents one rubric from silently
 * changing the approval semantics of the other feature. */
export const MARKETPLACE_DRAFT_QC_CONTRACT_VERSION =
  "marketplace-product-creative-qc-v1" as const;
export const MARKETPLACE_DRAFT_QC_PASS_THRESHOLD = 8;
export const MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS = 5;
export const MARKETPLACE_DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS = 3;
export const MARKETPLACE_DRAFT_QC_ROUND_OPTIONS = [0, 1, 2, 3, 5] as const;
export const MARKETPLACE_DRAFT_QC_MAX_CHANGED_FIELDS = 64;

export const MARKETPLACE_DRAFT_QC_CRITERIA = [
  { id: "hook_strength", weight: 1.5 },
  { id: "audience_problem_relevance", weight: 1 },
  { id: "product_integration", weight: 1.25 },
  { id: "benefit_clarity", weight: 1.25 },
  { id: "story_review_progression", weight: 1.25 },
  { id: "proof_credibility", weight: 1 },
  { id: "emotional_persuasive_power", weight: 1 },
  { id: "product_memorability", weight: 0.75 },
  { id: "cta_conversion_path", weight: 0.5 },
  { id: "originality_scroll_stop", weight: 0.5 },
] as const;

export type MarketplaceDraftQcCriterionId =
  (typeof MARKETPLACE_DRAFT_QC_CRITERIA)[number]["id"];

export const marketplaceDraftQcCriterionIdSchema = z.enum(
  MARKETPLACE_DRAFT_QC_CRITERIA.map(item => item.id) as [
    MarketplaceDraftQcCriterionId,
    ...MarketplaceDraftQcCriterionId[],
  ]
);

export const MARKETPLACE_DRAFT_QC_CRITICAL_FAIL_CODES = [
  "product_reference_model_conflict",
  "unsupported_or_forbidden_claim",
  "product_truth_drift",
  "product_integration_missing",
  "benefit_unclear",
  "hook_missing",
  "cta_missing",
  "shot_contract_invalid",
  "dialogue_missing",
  "stale_prompt_plan",
] as const;
export type MarketplaceDraftQcCriticalFailCode =
  (typeof MARKETPLACE_DRAFT_QC_CRITICAL_FAIL_CODES)[number];

export const marketplaceDraftQcCriticalFailCodeSchema = z.enum(
  MARKETPLACE_DRAFT_QC_CRITICAL_FAIL_CODES
);

export const marketplaceDraftQcRepairPlanActionSchema = z.object({
  criterionId: marketplaceDraftQcCriterionIdSchema.nullable(),
  priority: z.enum(["critical", "high", "medium"]),
  reason: z.string().trim().min(1).max(500),
  action: z.string().trim().min(1).max(500),
  targetPaths: z.array(z.string().trim().min(1).max(120)).max(8),
  preservePaths: z.array(z.string().trim().min(1).max(120)).max(16),
  autoRunnable: z.boolean(),
});

export const marketplaceDraftQcRepairPlanSchema = z.object({
  available: z.boolean(),
  summary: z.string().trim().min(1).max(800),
  actions: z.array(marketplaceDraftQcRepairPlanActionSchema).max(6),
});
export type MarketplaceDraftQcRepairPlan = z.infer<
  typeof marketplaceDraftQcRepairPlanSchema
>;

export const marketplaceDraftQcJudgeOutputSchema = z.object({
  criteria: z
    .array(
      z.object({
        criterionId: marketplaceDraftQcCriterionIdSchema,
        rawScore: z.number().min(0).max(5),
        evidence: z.string().trim().min(1).max(1200),
      })
    )
    .length(MARKETPLACE_DRAFT_QC_CRITERIA.length),
  criticalFails: z
    .array(
      z.object({
        code: marketplaceDraftQcCriticalFailCodeSchema,
        explanation: z.string().trim().min(1).max(1000),
      })
    )
    .max(10),
  strengths: z.array(z.string().trim().min(1).max(500)).max(4),
  weaknesses: z.array(z.string().trim().min(1).max(500)).max(4),
  recommendations: z.array(z.string().trim().min(1).max(500)).max(5),
});
export type MarketplaceDraftQcJudgeOutput = z.infer<
  typeof marketplaceDraftQcJudgeOutputSchema
>;

export const marketplaceDraftQcComputedCriterionSchema = z.object({
  criterionId: marketplaceDraftQcCriterionIdSchema,
  rawScore: z.number().min(0).max(5),
  evidence: z.string().trim().min(1).max(1200),
  weight: z.number().positive(),
  weightedScore: z.number().min(0).max(5),
});

export const marketplaceDraftQcStatusSchema = z.enum([
  "passed",
  "strong",
  "needs_work",
  "blocked",
]);
export type MarketplaceDraftQcStatus = z.infer<
  typeof marketplaceDraftQcStatusSchema
>;

export const marketplaceDraftQcReportSchema = z.object({
  contractVersion: z.literal(MARKETPLACE_DRAFT_QC_CONTRACT_VERSION),
  overallScore: z.number().min(0).max(10),
  uncappedScore: z.number().min(0).max(10),
  status: marketplaceDraftQcStatusSchema,
  pass: z.boolean(),
  criticalFails: z
    .array(
      z.object({
        code: marketplaceDraftQcCriticalFailCodeSchema,
        explanation: z.string().trim().min(1).max(1000),
      })
    )
    .max(10),
  criteria: z
    .array(marketplaceDraftQcComputedCriterionSchema)
    .length(MARKETPLACE_DRAFT_QC_CRITERIA.length),
  strengths: z.array(z.string().trim().min(1).max(500)).max(4),
  weaknesses: z.array(z.string().trim().min(1).max(500)).max(4),
  recommendations: z.array(z.string().trim().min(1).max(500)).max(5),
  repairPlan: marketplaceDraftQcRepairPlanSchema.optional(),
  evaluatedAt: z.string().datetime(),
});
export type MarketplaceDraftQcReport = z.infer<
  typeof marketplaceDraftQcReportSchema
>;

export const marketplaceDraftQcHistoryEntrySchema = z.object({
  round: z.number().int().min(0).max(MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  score: z.number().min(0).max(10),
  status: marketplaceDraftQcStatusSchema,
  kept: z.boolean(),
  reason: z.enum(["baseline", "improved", "not_better", "passed"]),
  candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  candidateArtifactId: z.string().trim().min(1).max(160).optional(),
});
export type MarketplaceDraftQcHistoryEntry = z.infer<
  typeof marketplaceDraftQcHistoryEntrySchema
>;

export const marketplaceDraftQcCreditEstimateSchema = z.object({
  baselineCalls: z.literal(1),
  maxImprovementRounds: z
    .number()
    .int()
    .min(0)
    .max(MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  maxCalls: z.number().int().min(1).max(11),
  estimatedCredits: z.number().nonnegative(),
  actualCredits: z.number().nonnegative(),
});
export type MarketplaceDraftQcCreditEstimate = z.infer<
  typeof marketplaceDraftQcCreditEstimateSchema
>;

export const marketplaceDraftQcJobStatusSchema = z.enum([
  "not_started",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type MarketplaceDraftQcJobStatus = z.infer<
  typeof marketplaceDraftQcJobStatusSchema
>;

export const marketplaceDraftQcProgressSchema = z.object({
  phase: z.enum(["baseline_evaluate", "revise", "evaluate", "finalizing"]),
  round: z.number().int().min(0).max(MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  maxRounds: z.number().int().min(0).max(MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  callsDone: z.number().int().min(0),
  callsMax: z.number().int().min(1).max(11),
  lastScore: z.number().min(0).max(10).nullable(),
});
export type MarketplaceDraftQcProgress = z.infer<
  typeof marketplaceDraftQcProgressSchema
>;

export const marketplaceDraftQcStateSchema = z.object({
  required: z.boolean(),
  status: marketplaceDraftQcJobStatusSchema,
  candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  report: marketplaceDraftQcReportSchema.nullable(),
  history: z.array(marketplaceDraftQcHistoryEntrySchema),
  progress: marketplaceDraftQcProgressSchema.nullable(),
  maxImprovementRounds: z
    .number()
    .int()
    .min(0)
    .max(MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS),
  creditEstimate: marketplaceDraftQcCreditEstimateSchema.nullable(),
  bestRound: z.number().int().min(0).nullable(),
  overrideAccepted: z.boolean(),
  repairStatus: z
    .enum(["idle", "queued", "running", "succeeded", "failed", "not_better"])
    .default("idle"),
  repairAttempted: z.boolean().default(false),
  repairSourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  repairSourceArtifactId: z.string().trim().min(1).max(160).nullable().default(null),
  repairCandidateFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .default(null),
  repairCandidateArtifactId: z.string().trim().min(1).max(160).nullable().default(null),
  repairReport: marketplaceDraftQcReportSchema.nullable().default(null),
  repairComparison: z
    .object({
      sourceScore: z.number().min(0).max(10),
      repairedScore: z.number().min(0).max(10),
      improved: z.boolean(),
      passed: z.boolean(),
    })
    .nullable()
    .default(null),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  error: z.string().max(1000).nullable(),
});
export type MarketplaceDraftQcState = z.infer<
  typeof marketplaceDraftQcStateSchema
>;

export function normalizeMarketplaceDraftQcRoundBudget(value?: number): number {
  if (value === undefined) return MARKETPLACE_DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS;
  return (MARKETPLACE_DRAFT_QC_ROUND_OPTIONS as readonly number[]).includes(value)
    ? value
    : MARKETPLACE_DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS;
}

const MARKETPLACE_REPAIR_PRESERVE_PATHS = [
  "productTruth",
  "productId",
  "referenceManifestHash",
  "uiLocale",
  "spokenLanguageProfile",
  "shotContract",
  "plan.productTruth",
  "plan.product",
  "plan.referenceManifestHash",
];

const MARKETPLACE_CRITICAL_REPAIR_TARGETS: Record<
  MarketplaceDraftQcCriticalFailCode,
  { targetPaths: string[]; action: string; autoRunnable: boolean }
> = {
  product_reference_model_conflict: {
    targetPaths: ["plan.product", "plan.productTruth"],
    action: "ตรวจความสอดคล้องกับข้อมูลสินค้าโดยไม่สร้างข้อมูลสินค้าใหม่",
    autoRunnable: false,
  },
  unsupported_or_forbidden_claim: {
    targetPaths: ["plan.shots", "plan.voiceoverScript"],
    action: "ตัดหรือเขียน claim ใหม่ให้มีหลักฐานรองรับและไม่ขัดนโยบาย",
    autoRunnable: true,
  },
  product_truth_drift: {
    targetPaths: ["plan.productTruth", "plan.shots"],
    action: "แก้ถ้อยคำให้กลับมาตรงกับ product truth ที่ล็อกไว้",
    autoRunnable: false,
  },
  product_integration_missing: {
    targetPaths: ["plan.shots", "plan.storyboardGuide"],
    action: "ผูกการสาธิตสินค้าเข้ากับปัญหาและผลลัพธ์ที่มีหลักฐาน",
    autoRunnable: true,
  },
  benefit_unclear: {
    targetPaths: ["plan.shots", "plan.voiceoverScript"],
    action: "ทำประโยชน์ของสินค้าให้ชัดจากข้อมูลที่ยืนยันแล้ว",
    autoRunnable: true,
  },
  hook_missing: {
    targetPaths: ["plan.title", "plan.shots", "plan.storyboardGuide"],
    action: "เสริม hook ตอนต้นโดยคงสินค้าและ shot contract เดิม",
    autoRunnable: true,
  },
  cta_missing: {
    targetPaths: ["plan.shots", "plan.voiceoverScript"],
    action: "เติม CTA ที่สอดคล้องกับสินค้าโดยไม่เพิ่ม claim ใหม่",
    autoRunnable: true,
  },
  shot_contract_invalid: {
    targetPaths: ["plan.shots"],
    action: "จัดรูปแบบ shot ให้ตรง contract เดิมโดยไม่เปลี่ยนจำนวนหรือเวลา",
    autoRunnable: false,
  },
  dialogue_missing: {
    targetPaths: ["plan.shots", "plan.voiceoverScript"],
    action: "เติม dialogue ที่อธิบายเหตุและผลตามข้อมูลเดิม",
    autoRunnable: true,
  },
  stale_prompt_plan: {
    targetPaths: ["plan.shots", "plan.storyboardGuide"],
    action: "ทำให้แผนข้อความสอดคล้องกับ revision และ reference manifest ปัจจุบัน",
    autoRunnable: false,
  },
};

const MARKETPLACE_CRITERION_REPAIR_TARGETS: Record<
  MarketplaceDraftQcCriterionId,
  string[]
> = {
  hook_strength: ["plan.title", "plan.shots"],
  audience_problem_relevance: ["plan.storyboardGuide", "plan.shots"],
  product_integration: ["plan.shots", "plan.productDetail"],
  benefit_clarity: ["plan.shots", "plan.voiceoverScript"],
  story_review_progression: ["plan.shots"],
  proof_credibility: ["plan.shots", "plan.productTruth"],
  emotional_persuasive_power: ["plan.shots", "plan.voiceoverScript"],
  product_memorability: ["plan.title", "plan.shots"],
  cta_conversion_path: ["plan.shots", "plan.voiceoverScript"],
  originality_scroll_stop: ["plan.title", "plan.shots"],
};

export function buildMarketplaceDraftQcRepairPlan(
  report: Pick<
    MarketplaceDraftQcReport,
    "criteria" | "criticalFails" | "recommendations" | "pass"
  >
): MarketplaceDraftQcRepairPlan {
  const actions: MarketplaceDraftQcRepairPlan["actions"] = [];
  const safeTargets = (paths: string[]) =>
    paths.filter(path => !MARKETPLACE_REPAIR_PRESERVE_PATHS.includes(path));
  for (const failure of report.criticalFails.slice(0, 3)) {
    const rule = MARKETPLACE_CRITICAL_REPAIR_TARGETS[failure.code];
    const safeRuleTargets = safeTargets(rule?.targetPaths ?? ["plan.shots"]);
    const targetPaths = safeRuleTargets.length > 0 ? safeRuleTargets : ["plan.shots"];
    actions.push({
      criterionId: null,
      priority: "critical",
      reason: failure.explanation,
      action:
        rule?.action ??
        "แก้เฉพาะจุดวิกฤตโดยคง product truth และ shot contract เดิม",
      targetPaths,
      preservePaths: MARKETPLACE_REPAIR_PRESERVE_PATHS,
      autoRunnable: Boolean(rule?.autoRunnable && safeRuleTargets.length > 0),
    });
  }
  for (const criterion of [...report.criteria]
    .filter(item => item.rawScore < 4.5)
    .sort((a, b) => a.rawScore - b.rawScore)
    .slice(0, 3)) {
    if (actions.some(item => item.criterionId === criterion.criterionId)) continue;
    const safeCriterionTargets = safeTargets(MARKETPLACE_CRITERION_REPAIR_TARGETS[criterion.criterionId]);
    const targetPaths = safeCriterionTargets.length > 0 ? safeCriterionTargets : ["plan.shots"];
    actions.push({
      criterionId: criterion.criterionId,
      priority: criterion.rawScore < 4 ? "high" : "medium",
      reason: criterion.evidence,
      action:
        report.recommendations[actions.length] ??
        "ขยายจุดนี้ด้วยข้อมูลสินค้าเดิม โดยไม่เปลี่ยน claim หรือ shot contract",
      targetPaths,
      preservePaths: MARKETPLACE_REPAIR_PRESERVE_PATHS,
      autoRunnable: safeCriterionTargets.length > 0,
    });
  }
  const autoRunnable = actions.some(action => action.autoRunnable);
  return marketplaceDraftQcRepairPlanSchema.parse({
    available: !report.pass && autoRunnable,
    summary: report.pass
      ? "Draft ผ่าน QC แล้ว ไม่จำเป็นต้องซ่อมเพิ่ม"
      : autoRunnable
        ? "ระบบพบจุดที่ซ่อมได้โดยคง product truth และ shot contract เดิม"
        : "ยังไม่มีแผนซ่อมอัตโนมัติที่ปลอดภัย — ใช้การแก้แผนด้วยผู้ใช้แทน",
    actions,
  });
}

export function estimateMarketplaceDraftQcCredits(params: {
  maxImprovementRounds: number;
  perCallCredits: number;
}): MarketplaceDraftQcCreditEstimate {
  const maxImprovementRounds = normalizeMarketplaceDraftQcRoundBudget(
    params.maxImprovementRounds
  );
  const maxCalls = 1 + maxImprovementRounds * 2;
  return {
    baselineCalls: 1,
    maxImprovementRounds,
    maxCalls,
    estimatedCredits: Math.max(
      0,
      Number((maxCalls * Math.max(0, params.perCallCredits)).toFixed(2))
    ),
    actualCredits: 0,
  };
}

function applyMarketplaceDraftQcScoreCaps(
  rawScore: number,
  criticalFails: MarketplaceDraftQcJudgeOutput["criticalFails"]
): number {
  let capped = rawScore;
  const codes = new Set(criticalFails.map(item => item.code));
  if (codes.has("hook_missing")) capped = Math.min(capped, 7);
  if (codes.has("product_integration_missing")) capped = Math.min(capped, 7);
  if (codes.has("benefit_unclear")) capped = Math.min(capped, 6.5);
  if (codes.has("unsupported_or_forbidden_claim")) capped = Math.min(capped, 6);
  if (codes.has("product_truth_drift")) capped = Math.min(capped, 6);
  return Number(capped.toFixed(2));
}

export function computeMarketplaceDraftQcReport(
  judge: MarketplaceDraftQcJudgeOutput,
  evaluatedAt = new Date().toISOString()
): MarketplaceDraftQcReport {
  const expected = new Set(MARKETPLACE_DRAFT_QC_CRITERIA.map(item => item.id));
  const seen = new Set<string>();
  for (const criterion of judge.criteria) {
    if (seen.has(criterion.criterionId) || !expected.has(criterion.criterionId)) {
      throw new Error(`Marketplace QC criteria must contain each id exactly once: ${criterion.criterionId}`);
    }
    seen.add(criterion.criterionId);
  }
  if (seen.size !== MARKETPLACE_DRAFT_QC_CRITERIA.length) {
    throw new Error("Marketplace QC criteria are incomplete");
  }
  const criteria = MARKETPLACE_DRAFT_QC_CRITERIA.map(definition => {
    const raw = judge.criteria.find(item => item.criterionId === definition.id)!;
    return {
      ...raw,
      weight: definition.weight,
      weightedScore: Number(((raw.rawScore / 5) * definition.weight).toFixed(2)),
    };
  });
  const uncappedScore = Number(
    criteria.reduce((sum, item) => sum + item.weightedScore, 0).toFixed(2)
  );
  const overallScore = applyMarketplaceDraftQcScoreCaps(
    uncappedScore,
    judge.criticalFails
  );
  const pass = overallScore >= MARKETPLACE_DRAFT_QC_PASS_THRESHOLD && judge.criticalFails.length === 0;
  const status: MarketplaceDraftQcStatus = pass
    ? "passed"
    : judge.criticalFails.length > 0
      ? "blocked"
      : overallScore >= 8
        ? "strong"
        : "needs_work";
  return marketplaceDraftQcReportSchema.parse({
    contractVersion: MARKETPLACE_DRAFT_QC_CONTRACT_VERSION,
    overallScore,
    uncappedScore,
    status,
    pass,
    criticalFails: judge.criticalFails,
    criteria,
    strengths: judge.strengths,
    weaknesses: judge.weaknesses,
    recommendations: judge.recommendations,
    repairPlan: buildMarketplaceDraftQcRepairPlan({
      criteria,
      criticalFails: judge.criticalFails,
      recommendations: judge.recommendations,
      pass,
    }),
    evaluatedAt,
  });
}

export function compareMarketplaceDraftQcCandidates(
  current: { report: MarketplaceDraftQcReport; round: number } | null,
  candidate: { report: MarketplaceDraftQcReport; round: number }
): number {
  if (!current) return 1;
  if (candidate.report.overallScore !== current.report.overallScore) {
    return candidate.report.overallScore > current.report.overallScore ? 1 : -1;
  }
  if (candidate.report.criticalFails.length !== current.report.criticalFails.length) {
    return candidate.report.criticalFails.length < current.report.criticalFails.length ? 1 : -1;
  }
  return candidate.round < current.round ? 1 : candidate.round > current.round ? -1 : 0;
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

export function fingerprintMarketplaceDraftQcCandidate(candidate: unknown): string {
  return sha256Hex(stableSerialize(candidate));
}

export function createMarketplaceDraftQcState(
  maxImprovementRounds = MARKETPLACE_DRAFT_QC_DEFAULT_IMPROVEMENT_ROUNDS
): MarketplaceDraftQcState {
  return {
    required: true,
    status: "not_started",
    candidateFingerprint: null,
    report: null,
    history: [],
    progress: null,
    maxImprovementRounds: normalizeMarketplaceDraftQcRoundBudget(maxImprovementRounds),
    creditEstimate: null,
    bestRound: null,
    overrideAccepted: false,
    repairStatus: "idle",
    repairAttempted: false,
    repairSourceFingerprint: null,
    repairSourceArtifactId: null,
    repairCandidateFingerprint: null,
    repairCandidateArtifactId: null,
    repairReport: null,
    repairComparison: null,
    startedAt: null,
    completedAt: null,
    error: null,
  };
}
