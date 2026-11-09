import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  compareMarketplaceDraftQcCandidates,
  computeMarketplaceDraftQcReport,
  estimateMarketplaceDraftQcCredits,
  fingerprintMarketplaceDraftQcCandidate,
  formatMarketplaceDraftQcJudgeNormalizationError,
  MARKETPLACE_DRAFT_QC_CRITERIA,
  MARKETPLACE_DRAFT_QC_CRITICAL_FAIL_CODES,
  MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS,
  MARKETPLACE_DRAFT_QC_MAX_CHANGED_FIELDS,
  marketplaceDraftQcJudgeOutputSchema,
  normalizeMarketplaceDraftQcJudgeOutput,
  normalizeMarketplaceDraftQcRoundBudget,
  type MarketplaceDraftQcCreditEstimate,
  type MarketplaceDraftQcHistoryEntry,
  type MarketplaceDraftQcReport,
} from "@shared/marketplaceAutoReview/draftQualityQc";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "./skillFiles";
import {
  calculateCreditsForLLM,
  createCreditReservation,
  drawFromReservation,
  refundReservation,
  type CreditReservation,
} from "./creditService";
import {
  executeJsonPlanningCallWithRetry,
  resolveStoryBibleModel,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "marketplace-auto-review-draft-quality-controller"
);
const MARKETPLACE_AUTO_REVIEW_DRAFT_QC_SKILL_SLUG =
  "marketplace-auto-review-draft-quality-controller";
const MAX_DRAFT_BYTES = 180_000;
const MARKETPLACE_DRAFT_QC_JUDGE_OUTPUT_CONTRACT = [
  "Return exactly one JSON object with required top-level keys criteria, criticalFails, strengths, weaknesses, and recommendations.",
  `criteria must be an array with exactly ${MARKETPLACE_DRAFT_QC_CRITERIA.length} entries, one for every rubric item below.`,
  "Each criteria entry must have criterionId (exact machine key), rawScore (number from 0 to 5), and evidence (specific text evidence or a concrete missing element).",
  "Use a top-level criteria array of criterion objects; do not return a prose-only rubric or an overall score in place of criteria.",
  "Do not omit criteria, replace it with a summary/overall score, or return the scorecard nested under another key.",
  "Use empty arrays only when there are no criticalFails, strengths, weaknesses, or recommendations.",
  "criticalFails must be [] or contain objects with code and explanation; code must exactly match one of these machine values:",
  MARKETPLACE_DRAFT_QC_CRITICAL_FAIL_CODES.join(", "),
  "Never use criterion IDs or display labels as critical-fail codes. If a failure cannot be classified, use unclassified_critical_fail.",
  "strengths, weaknesses, and recommendations are always required arrays; use [] when empty.",
  "Set each criterionId to its exact machine key from this list:",
  MARKETPLACE_DRAFT_QC_CRITERIA.map(item => item.id).join(", "),
  "Do not use the rubric's display labels as criterionId. Return no markdown or text outside the JSON object.",
].join(" ");

const revisedDraftOutputSchema = z.object({
  draft: z.record(z.string(), z.unknown()),
  changedFields: z
    .array(z.string().trim().min(1).max(160))
    .max(MARKETPLACE_DRAFT_QC_MAX_CHANGED_FIELDS),
});
export type MarketplaceDraftQcDraft = Record<string, unknown>;
export interface MarketplaceDraftQcImmutableConstraints {
  fields?: Record<string, unknown>;
  preservedPaths?: string[];
  uiLocale?: string;
  spokenLanguageProfile?: unknown;
  targetMarket?: string;
  productId?: string;
  referenceManifestHash?: string;
  requestedShotCount?: number;
  userBrief?: string;
}

export interface MarketplaceDraftQcProgressEvent {
  phase: "baseline_evaluate" | "revise" | "evaluate" | "finalizing";
  round: number;
  maxRounds: number;
  callsDone: number;
  callsMax: number;
  lastScore: number | null;
}

export interface MarketplaceDraftQcCallResult {
  data: unknown;
  promptTokens: number;
  completionTokens: number;
  normalizationWarnings?: string[];
}

export interface MarketplaceDraftQcLoopInput {
  draft: MarketplaceDraftQcDraft;
  immutableConstraints: MarketplaceDraftQcImmutableConstraints;
  maxImprovementRounds?: number;
  userId: number;
  tenantId?: string;
  billingRunIdempotencyKey?: string;
  isCancelled?: () => Promise<boolean>;
  onProgress?: (event: MarketplaceDraftQcProgressEvent) => void;
}

export interface MarketplaceDraftQcCandidateResult {
  draft: MarketplaceDraftQcDraft;
  report: MarketplaceDraftQcReport;
  round: number;
  fingerprint: string;
}

export interface MarketplaceDraftQcLoopResult {
  best: MarketplaceDraftQcCandidateResult;
  history: MarketplaceDraftQcHistoryEntry[];
  creditEstimate: MarketplaceDraftQcCreditEstimate;
  stopReason: "passed" | "max_rounds" | "no_improvement";
  model: string;
  reservationId?: string;
}

export interface MarketplaceDraftQcDependencies {
  model?: string;
  evaluate?: (params: {
    draft: MarketplaceDraftQcDraft;
    immutableConstraints: MarketplaceDraftQcImmutableConstraints;
    userId: number;
  }) => Promise<MarketplaceDraftQcCallResult>;
  revise?: (params: {
    draft: MarketplaceDraftQcDraft;
    report: MarketplaceDraftQcReport;
    immutableConstraints: MarketplaceDraftQcImmutableConstraints;
    userId: number;
  }) => Promise<MarketplaceDraftQcCallResult>;
  createReservation?: (amount: number) => Promise<CreditReservation>;
  drawReservation?: (reservationId: string, amount: number) => Promise<unknown>;
  refundReservation?: (reservationId: string) => Promise<unknown>;
  now?: () => string;
}

function loadSkillPrompt(): string {
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) return content;
  }
  throw new Error(
    "Could not locate marketplace-auto-review-draft-quality-controller skill"
  );
}

function assertBoundedDraft(draft: MarketplaceDraftQcDraft): void {
  const bytes = Buffer.byteLength(JSON.stringify(draft), "utf8");
  if (bytes > MAX_DRAFT_BYTES) {
    throw new Error(`Marketplace draft QC candidate exceeds ${MAX_DRAFT_BYTES} bytes`);
  }
}

function stableValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableValue(object[key])}`)
    .join(",")}}`;
}

function readPath(value: unknown, pathValue: string): unknown {
  return pathValue.split(".").reduce<unknown>((current, key) => {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    ) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function hasOwnPath(value: unknown, segments: string[]): boolean {
  let current = value;
  for (const segment of segments) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, segment)
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

function cloneDraftValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneDraftValue(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        cloneDraftValue(nested),
      ])
    ) as T;
  }
  return value;
}

function immutableDraftPaths(
  constraints: MarketplaceDraftQcImmutableConstraints
): string[] {
  return [
    ...new Set([
      ...(constraints.preservedPaths ?? []),
      ...Object.keys(constraints.fields ?? {}),
    ]),
  ];
}

function restoreImmutableDraftFields(
  original: MarketplaceDraftQcDraft,
  revised: MarketplaceDraftQcDraft,
  constraints: MarketplaceDraftQcImmutableConstraints
): MarketplaceDraftQcDraft {
  const restored = cloneDraftValue(revised);
  for (const immutablePath of immutableDraftPaths(constraints)) {
    const segments = immutablePath.split(".");
    if (
      segments.some(
        segment =>
          !segment ||
          segment === "__proto__" ||
          segment === "prototype" ||
          segment === "constructor"
      )
    ) {
      throw new Error(`Invalid immutable draft path: ${immutablePath}`);
    }

    const originalValue = readPath(original, immutablePath);
    const originalHasValue = hasOwnPath(original, segments);
    let targetParent: unknown = restored;
    let targetParentFound = true;
    for (const segment of segments.slice(0, -1)) {
      if (
        !targetParent ||
        typeof targetParent !== "object" ||
        !Object.hasOwn(targetParent, segment) ||
        !(targetParent as Record<string, unknown>)[segment] ||
        typeof (targetParent as Record<string, unknown>)[segment] !== "object"
      ) {
        if (!originalHasValue) {
          targetParentFound = false;
          break;
        }
        throw new Error(
          `Draft revision omitted immutable field parent: ${immutablePath}`
        );
      }
      targetParent = (targetParent as Record<string, unknown>)[segment];
    }
    if (!targetParentFound || !targetParent || typeof targetParent !== "object") continue;

    const leaf = segments[segments.length - 1];
    if (originalHasValue) {
      (targetParent as Record<string, unknown>)[leaf] = cloneDraftValue(originalValue);
    } else {
      delete (targetParent as Record<string, unknown>)[leaf];
    }
  }
  return restored;
}

function normalizeChangedFields(changedFields: string[]): string[] {
  return [
    ...new Set(
      changedFields.map(field => field.trim()).filter(field => field.length > 0),
    ),
  ].slice(0, MARKETPLACE_DRAFT_QC_MAX_CHANGED_FIELDS);
}

function isCompleteDraftReplacement(
  original: MarketplaceDraftQcDraft,
  revised: MarketplaceDraftQcDraft,
): boolean {
  return Object.keys(original).every(key => Object.hasOwn(revised, key));
}

function deriveChangedDraftFields(
  original: MarketplaceDraftQcDraft,
  revised: MarketplaceDraftQcDraft,
): string[] {
  return normalizeChangedFields(
    [...new Set([...Object.keys(original), ...Object.keys(revised)])].filter(
      key => stableValue(original[key]) !== stableValue(revised[key]),
    ),
  );
}

export function normalizeMarketplaceDraftQcRevisionOutput(
  value: unknown,
  original: MarketplaceDraftQcDraft,
): { data: z.infer<typeof revisedDraftOutputSchema>; warnings: string[] } | null {
  const parsed = revisedDraftOutputSchema.safeParse(value);
  const record = z.record(z.string(), z.unknown()).safeParse(value);
  if (!record.success) return null;

  const hasDraftWrapper = Object.hasOwn(record.data, "draft");
  const hasChangedFieldsMetadata = Object.hasOwn(record.data, "changedFields");
  const unwrappedDraft = hasChangedFieldsMetadata
    ? Object.fromEntries(
        Object.entries(record.data).filter(([key]) => key !== "changedFields"),
      )
    : record.data;
  const draftResult = hasDraftWrapper
    ? z.record(z.string(), z.unknown()).safeParse(record.data.draft)
    : z.record(z.string(), z.unknown()).safeParse(unwrappedDraft);
  if (!draftResult.success || !isCompleteDraftReplacement(original, draftResult.data)) {
    return null;
  }

  if (parsed.success) {
    return { data: parsed.data, warnings: [] };
  }

  const changedFieldsResult = hasDraftWrapper || hasChangedFieldsMetadata
    ? z.array(z.string()).safeParse(record.data.changedFields)
    : null;
  const changedFields = changedFieldsResult?.success
    ? normalizeChangedFields(changedFieldsResult.data)
    : deriveChangedDraftFields(original, draftResult.data);
  const warnings = hasDraftWrapper
    ? ["LLM omitted or malformed changedFields; the server derived it from the Draft diff."]
    : [
        hasChangedFieldsMetadata && changedFieldsResult?.success
          ? "LLM returned complete draft fields without a wrapper; the server normalized the response."
          : "LLM returned the complete Draft without a wrapper; the server normalized it and derived changedFields.",
      ];
  return {
    data: { draft: draftResult.data, changedFields },
    warnings,
  };
}

function assertImmutableConstraints(
  original: MarketplaceDraftQcDraft,
  revised: MarketplaceDraftQcDraft,
  constraints: MarketplaceDraftQcImmutableConstraints
): void {
  for (const preservedPath of constraints.preservedPaths ?? []) {
    if (stableValue(readPath(original, preservedPath)) !== stableValue(readPath(revised, preservedPath))) {
      throw new Error(`Draft revision changed immutable field: ${preservedPath}`);
    }
  }
  for (const [key, expected] of Object.entries(constraints.fields ?? {})) {
    if (stableValue(readPath(revised, key)) !== stableValue(expected)) {
      throw new Error(`Draft revision violated immutable constraint: ${key}`);
    }
  }
}

function buildPromptContext(
  mode: "evaluate" | "revise",
  draft: MarketplaceDraftQcDraft,
  constraints: MarketplaceDraftQcImmutableConstraints,
  report?: MarketplaceDraftQcReport
): string {
  return [
    `MODE: ${mode}`,
    "NARRATIVE CONTENT MUST USE THE UI LOCALE; SPOKEN LANGUAGE IS DIALOGUE-ONLY.",
    "IMMUTABLE CONSTRAINTS:",
    JSON.stringify(constraints),
    "DRAFT:",
    JSON.stringify(draft),
    report ? `QC FEEDBACK:\n${JSON.stringify(report)}` : "",
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function defaultEvaluate(params: {
  draft: MarketplaceDraftQcDraft;
  immutableConstraints: MarketplaceDraftQcImmutableConstraints;
  userId: number;
}): Promise<MarketplaceDraftQcCallResult> {
  const model = await resolveStoryBibleModel();
  const result = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt: `${loadSkillPrompt()}\n\nEVALUATE MODE: judge only; never rewrite.\n\n${MARKETPLACE_DRAFT_QC_JUDGE_OUTPUT_CONTRACT}`,
    userPrompt: buildPromptContext(
      "evaluate",
      params.draft,
      params.immutableConstraints
    ),
    temperature: 0.12,
    userId: params.userId,
    maxTokens: 4200,
    schema: marketplaceDraftQcJudgeOutputSchema,
    schemaRetryContract: MARKETPLACE_DRAFT_QC_JUDGE_OUTPUT_CONTRACT,
    onSchemaRetriesExhausted: ({ parsedJson }) => {
      const normalized = normalizeMarketplaceDraftQcJudgeOutput(parsedJson);
      if (normalized.ok) {
        return { data: normalized.data, warnings: normalized.warnings };
      }
      throw new Error(
        formatMarketplaceDraftQcJudgeNormalizationError(parsedJson)
      );
    },
    label: "Marketplace Auto Review creative QC evaluate",
  });
  return {
    data: result.data,
    promptTokens: result.response.usage?.prompt_tokens ?? 0,
    completionTokens: result.response.usage?.completion_tokens ?? 0,
    normalizationWarnings: result.warnings ?? [],
  };
}

async function defaultRevise(params: {
  draft: MarketplaceDraftQcDraft;
  report: MarketplaceDraftQcReport;
  immutableConstraints: MarketplaceDraftQcImmutableConstraints;
  userId: number;
}): Promise<MarketplaceDraftQcCallResult> {
  const model = await resolveStoryBibleModel();
  const protectedPaths = immutableDraftPaths(params.immutableConstraints);
  const result = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt: `${loadSkillPrompt()}\n\nREVISE MODE: return a complete draft and changedFields; do not judge or return a score. Preserve these immutable draft paths exactly: ${protectedPaths.join(", ") || "none"}. Never change product facts or other protected values.`,
    userPrompt: buildPromptContext(
      "revise",
      params.draft,
      params.immutableConstraints,
      params.report
    ),
    temperature: 0.3,
    userId: params.userId,
    maxTokens: 9000,
    schema: revisedDraftOutputSchema,
    schemaRetryContract: [
      "Return exactly {\"draft\": <complete revised draft>, \"changedFields\": [<changed field paths>] }.",
      "The draft must retain every top-level field from the input. Do not return a partial patch or prose.",
      "If you cannot revise a field, preserve its original value. Never change immutable product facts.",
    ].join(" "),
    onSchemaRetriesExhausted: ({ parsedJson }) => {
      const normalized = normalizeMarketplaceDraftQcRevisionOutput(
        parsedJson,
        params.draft,
      );
      if (normalized) return normalized;
      throw new Error(
        "Marketplace creative QC revise response must contain a complete draft, either wrapped in draft or returned directly.",
      );
    },
    label: "Marketplace Auto Review creative QC revise",
  });
  return {
    data: result.data,
    promptTokens: result.response.usage?.prompt_tokens ?? 0,
    completionTokens: result.response.usage?.completion_tokens ?? 0,
    normalizationWarnings: result.warnings ?? [],
  };
}

export async function runMarketplaceAutoReviewDraftQualityQc(
  input: MarketplaceDraftQcLoopInput,
  dependencies: MarketplaceDraftQcDependencies = {}
): Promise<MarketplaceDraftQcLoopResult> {
  assertBoundedDraft(input.draft);
  const maxRounds = Math.min(
    MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS,
    normalizeMarketplaceDraftQcRoundBudget(input.maxImprovementRounds)
  );
  const model = dependencies.model ?? (await resolveStoryBibleModel());
  const perCallCredits = calculateCreditsForLLM(7000, 9000, model);
  const creditEstimate = estimateMarketplaceDraftQcCredits({
    maxImprovementRounds: maxRounds,
    perCallCredits,
  });
  const createReservation =
    dependencies.createReservation ??
    (amount =>
      createCreditReservation(input.userId, amount, "skill", {
        feature: "marketplace_auto_review_creative_qc",
        tenantId: input.tenantId,
        maxImprovementRounds: maxRounds,
      }, input.billingRunIdempotencyKey, {
        tenantId: input.tenantId,
        skillSlug: MARKETPLACE_AUTO_REVIEW_DRAFT_QC_SKILL_SLUG,
        skillRunId: input.billingRunIdempotencyKey,
        description: "Marketplace Auto Review creative quality check",
      }));
  const drawReservation =
    dependencies.drawReservation ??
    ((reservationId, amount) => drawFromReservation(reservationId, amount));
  const refundUnused =
    dependencies.refundReservation ??
    (reservationId => refundReservation(reservationId));
  const reservation = await createReservation(creditEstimate.estimatedCredits);
  const evaluate = dependencies.evaluate ?? defaultEvaluate;
  const revise = dependencies.revise ?? defaultRevise;
  const now = dependencies.now ?? (() => new Date().toISOString());
  let callsDone = 0;
  let actualCredits = 0;
  let consecutiveNoImprovement = 0;
  let reservationClosed = false;
  const history: MarketplaceDraftQcHistoryEntry[] = [];
  const progress = (
    phase: MarketplaceDraftQcProgressEvent["phase"],
    round: number,
    lastScore: number | null
  ) =>
    input.onProgress?.({
      phase,
      round,
      maxRounds,
      callsDone,
      callsMax: creditEstimate.maxCalls,
      lastScore,
    });
  const drawActual = async (call: MarketplaceDraftQcCallResult) => {
    const amount = calculateCreditsForLLM(
      call.promptTokens,
      call.completionTokens,
      model
    );
    if (amount > 0) {
      await drawReservation(reservation.reservationId, amount);
      actualCredits += amount;
    }
    callsDone += 1;
  };

  try {
    if (await input.isCancelled?.()) throw new Error("Marketplace draft QC cancelled");
    progress("baseline_evaluate", 0, null);
    const baselineCall = await evaluate({
      draft: input.draft,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(baselineCall);
    const baselineReport = computeMarketplaceDraftQcReport(
      marketplaceDraftQcJudgeOutputSchema.parse(baselineCall.data),
      now()
    );
    let best: MarketplaceDraftQcCandidateResult = {
      draft: input.draft,
      report: baselineReport,
      round: 0,
      fingerprint: fingerprintMarketplaceDraftQcCandidate(input.draft),
    };
    history.push({
      round: 0,
      score: baselineReport.overallScore,
      status: baselineReport.status,
      kept: true,
      reason: baselineReport.pass ? "passed" : "baseline",
      candidateFingerprint: best.fingerprint,
    });
    progress("evaluate", 0, best.report.overallScore);
    if (best.report.pass || maxRounds === 0) {
      await refundUnused(reservation.reservationId);
      reservationClosed = true;
      return {
        best,
        history,
        creditEstimate: { ...creditEstimate, actualCredits },
        stopReason: best.report.pass ? "passed" : "max_rounds",
        model,
        reservationId: reservation.reservationId,
      };
    }

    for (let round = 1; round <= maxRounds; round += 1) {
      if (await input.isCancelled?.()) throw new Error("Marketplace draft QC cancelled");
      progress("revise", round, best.report.overallScore);
      const revisedCall = await revise({
        draft: best.draft,
        report: best.report,
        immutableConstraints: input.immutableConstraints,
        userId: input.userId,
      });
      await drawActual(revisedCall);
      const parsedRevision = normalizeMarketplaceDraftQcRevisionOutput(
        revisedCall.data,
        best.draft,
      );
      if (!parsedRevision) {
        throw new Error(
          "Marketplace creative QC revise response must contain a complete draft, either wrapped in draft or returned directly.",
        );
      }
      const revisedDraft = restoreImmutableDraftFields(
        best.draft,
        parsedRevision.data.draft,
        input.immutableConstraints
      );
      assertBoundedDraft(revisedDraft);
      assertImmutableConstraints(
        best.draft,
        revisedDraft,
        input.immutableConstraints
      );
      progress("evaluate", round, best.report.overallScore);
      const evaluationCall = await evaluate({
        draft: revisedDraft,
        immutableConstraints: input.immutableConstraints,
        userId: input.userId,
      });
      await drawActual(evaluationCall);
      const report = computeMarketplaceDraftQcReport(
        marketplaceDraftQcJudgeOutputSchema.parse(evaluationCall.data),
        now()
      );
      const candidate = {
        draft: revisedDraft,
        report,
        round,
        fingerprint: fingerprintMarketplaceDraftQcCandidate(revisedDraft),
      };
      const isBetter = compareMarketplaceDraftQcCandidates(best, candidate) > 0;
      history.push({
        round,
        score: report.overallScore,
        status: report.status,
        kept: isBetter,
        reason: report.pass ? "passed" : isBetter ? "improved" : "not_better",
        candidateFingerprint: candidate.fingerprint,
      });
      if (isBetter) {
        best = candidate;
        consecutiveNoImprovement = 0;
      } else {
        consecutiveNoImprovement += 1;
      }
      progress("evaluate", round, best.report.overallScore);
      if (best.report.pass || consecutiveNoImprovement >= 2) break;
    }
    progress("finalizing", best.round, best.report.overallScore);
    await refundUnused(reservation.reservationId);
    reservationClosed = true;
    return {
      best,
      history,
      creditEstimate: { ...creditEstimate, actualCredits },
      stopReason:
        best.report.pass
          ? "passed"
          : history.length - 1 >= maxRounds
            ? "max_rounds"
            : "no_improvement",
      model,
      reservationId: reservation.reservationId,
    };
  } finally {
    if (!reservationClosed) {
      await refundUnused(reservation.reservationId).catch(() => undefined);
    }
  }
}

export interface MarketplaceDraftQcRepairInput {
  draft: MarketplaceDraftQcDraft;
  sourceReport: MarketplaceDraftQcReport;
  sourceFingerprint: string;
  immutableConstraints: MarketplaceDraftQcImmutableConstraints;
  userId: number;
  tenantId?: string;
  billingRunIdempotencyKey?: string;
  isCancelled?: () => Promise<boolean>;
  onProgress?: (event: MarketplaceDraftQcProgressEvent) => void;
}

/** Run one explicit repair and one fresh evaluation without activating it. */
export async function runMarketplaceAutoReviewDraftQualityQcRepair(
  input: MarketplaceDraftQcRepairInput,
  dependencies: MarketplaceDraftQcDependencies = {},
): Promise<MarketplaceDraftQcLoopResult & {
  repaired: MarketplaceDraftQcCandidateResult;
  improved: boolean;
}> {
  assertBoundedDraft(input.draft);
  if (
    fingerprintMarketplaceDraftQcCandidate(input.draft) !==
    input.sourceFingerprint
  ) {
    throw new Error("Marketplace creative QC repair source is stale");
  }
  const model = dependencies.model ?? (await resolveStoryBibleModel());
  const perCallCredits = calculateCreditsForLLM(7000, 9000, model);
  const creditEstimate = estimateMarketplaceDraftQcCredits({
    maxImprovementRounds: 1,
    perCallCredits,
  });
  const createReservation =
    dependencies.createReservation ??
    (amount =>
      createCreditReservation(input.userId, amount, "skill", {
        feature: "marketplace_auto_review_creative_qc_repair",
        tenantId: input.tenantId,
        sourceFingerprint: input.sourceFingerprint,
      }, input.billingRunIdempotencyKey, {
        tenantId: input.tenantId,
        skillSlug: MARKETPLACE_AUTO_REVIEW_DRAFT_QC_SKILL_SLUG,
        skillRunId: input.billingRunIdempotencyKey,
        description: "Marketplace Auto Review creative quality repair",
      }));
  const drawReservation =
    dependencies.drawReservation ??
    ((reservationId, amount) => drawFromReservation(reservationId, amount));
  const refundUnused =
    dependencies.refundReservation ??
    (reservationId => refundReservation(reservationId));
  const evaluate = dependencies.evaluate ?? defaultEvaluate;
  const revise = dependencies.revise ?? defaultRevise;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const reservation = await createReservation(creditEstimate.estimatedCredits);
  let callsDone = 0;
  let actualCredits = 0;
  let reservationClosed = false;
  const source: MarketplaceDraftQcCandidateResult = {
    draft: input.draft,
    report: input.sourceReport,
    round: 0,
    fingerprint: input.sourceFingerprint,
  };
  const history: MarketplaceDraftQcHistoryEntry[] = [
    {
      round: 0,
      score: input.sourceReport.overallScore,
      status: input.sourceReport.status,
      kept: true,
      reason: "baseline",
      candidateFingerprint: input.sourceFingerprint,
    },
  ];
  const progress = (
    phase: MarketplaceDraftQcProgressEvent["phase"],
    round: number,
    score: number | null,
  ) =>
    input.onProgress?.({
      phase,
      round,
      maxRounds: 1,
      callsDone,
      callsMax: creditEstimate.maxCalls,
      lastScore: score,
    });
  const drawActual = async (call: MarketplaceDraftQcCallResult) => {
    const amount = calculateCreditsForLLM(
      call.promptTokens,
      call.completionTokens,
      model,
    );
    if (amount > 0) {
      await drawReservation(reservation.reservationId, amount);
      actualCredits += amount;
    }
    callsDone += 1;
  };

  try {
    if (await input.isCancelled?.()) {
      throw new Error("Marketplace draft QC repair cancelled");
    }
    progress("revise", 1, input.sourceReport.overallScore);
    const revisedCall = await revise({
      draft: input.draft,
      report: input.sourceReport,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(revisedCall);
    const recoveredRevision = normalizeMarketplaceDraftQcRevisionOutput(
      revisedCall.data,
      input.draft,
    );
    if (!recoveredRevision) {
      throw new Error(
        "Marketplace creative QC repair response must contain a complete draft, either wrapped in draft or returned directly.",
      );
    }
    const revisedDraft = restoreImmutableDraftFields(
      input.draft,
      recoveredRevision.data.draft,
      input.immutableConstraints
    );
    assertBoundedDraft(revisedDraft);
    assertImmutableConstraints(
      input.draft,
      revisedDraft,
      input.immutableConstraints,
    );
    progress("evaluate", 1, input.sourceReport.overallScore);
    const evaluationCall = await evaluate({
      draft: revisedDraft,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(evaluationCall);
    const report = computeMarketplaceDraftQcReport(
      marketplaceDraftQcJudgeOutputSchema.parse(evaluationCall.data),
      now(),
    );
    const repaired: MarketplaceDraftQcCandidateResult = {
      draft: revisedDraft,
      report,
      round: 1,
      fingerprint: fingerprintMarketplaceDraftQcCandidate(revisedDraft),
    };
    const improved = compareMarketplaceDraftQcCandidates(source, repaired) > 0;
    history.push({
      round: 1,
      score: report.overallScore,
      status: report.status,
      kept: improved,
      reason: report.pass ? "passed" : improved ? "improved" : "not_better",
      candidateFingerprint: repaired.fingerprint,
    });
    await refundUnused(reservation.reservationId);
    reservationClosed = true;
    return {
      best: improved ? repaired : source,
      history,
      creditEstimate: { ...creditEstimate, actualCredits },
      stopReason: improved && report.pass ? "passed" : improved ? "max_rounds" : "no_improvement",
      model,
      reservationId: reservation.reservationId,
      repaired,
      improved,
    };
  } finally {
    if (!reservationClosed) {
      await refundUnused(reservation.reservationId).catch(() => undefined);
    }
  }
}
