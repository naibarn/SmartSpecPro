import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  compareMarketplaceDraftQcCandidates,
  computeMarketplaceDraftQcReport,
  estimateMarketplaceDraftQcCredits,
  fingerprintMarketplaceDraftQcCandidate,
  MARKETPLACE_DRAFT_QC_MAX_IMPROVEMENT_ROUNDS,
  MARKETPLACE_DRAFT_QC_MAX_CHANGED_FIELDS,
  marketplaceDraftQcJudgeOutputSchema,
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
const MAX_DRAFT_BYTES = 180_000;

const revisedDraftOutputSchema = z.object({
  draft: z.record(z.string(), z.unknown()),
  changedFields: z
    .array(z.string().trim().min(1).max(160))
    .max(MARKETPLACE_DRAFT_QC_MAX_CHANGED_FIELDS),
});
const revisedDraftRecoverySchema = z
  .object({
    draft: z.record(z.string(), z.unknown()),
    changedFields: z.unknown().optional(),
  })
  .passthrough();

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
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function normalizeChangedFields(changedFields: string[]): string[] {
  return [
    ...new Set(
      changedFields.map(field => field.trim()).filter(field => field.length > 0),
    ),
  ].slice(0, MARKETPLACE_DRAFT_QC_MAX_CHANGED_FIELDS);
}

function recoverMarketplaceDraftQcRevisionOutput(
  value: unknown,
  original: MarketplaceDraftQcDraft,
): { data: z.infer<typeof revisedDraftOutputSchema>; warnings: string[] } | null {
  const parsed = revisedDraftRecoverySchema.safeParse(value);
  if (!parsed.success) return null;
  if (
    parsed.data.changedFields !== undefined &&
    !Array.isArray(parsed.data.changedFields)
  ) {
    return null;
  }
  const supplied = Array.isArray(parsed.data.changedFields)
    ? parsed.data.changedFields.filter(
        (field): field is string => typeof field === "string",
      )
    : [];
  const changedFields = normalizeChangedFields(
    supplied.length > 0
      ? supplied
      : [...new Set([...Object.keys(original), ...Object.keys(parsed.data.draft)])]
          .filter(key => stableValue(original[key]) !== stableValue(parsed.data.draft[key])),
  );
  return {
    data: { draft: parsed.data.draft, changedFields },
    warnings:
      parsed.data.changedFields === undefined
        ? ["LLM omitted changedFields; the server derived it from the Draft diff."]
        : [],
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

function assertCompleteDraftReplacement(
  original: MarketplaceDraftQcDraft,
  revised: MarketplaceDraftQcDraft
): void {
  for (const key of Object.keys(original)) {
    if (!(key in revised)) {
      throw new Error(`Draft revision omitted required draft field: ${key}`);
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
    systemPrompt: `${loadSkillPrompt()}\n\nEVALUATE MODE: judge only; never rewrite.`,
    userPrompt: buildPromptContext(
      "evaluate",
      params.draft,
      params.immutableConstraints
    ),
    temperature: 0.12,
    userId: params.userId,
    maxTokens: 4200,
    schema: marketplaceDraftQcJudgeOutputSchema,
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
  const result = await executeJsonPlanningCallWithRetry({
    model,
    systemPrompt: `${loadSkillPrompt()}\n\nREVISE MODE: return a complete draft and changedFields; do not judge or return a score.`,
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
      const parsedRevision = revisedDraftOutputSchema.parse(revisedCall.data);
      assertBoundedDraft(parsedRevision.draft);
      assertCompleteDraftReplacement(best.draft, parsedRevision.draft);
      assertImmutableConstraints(
        best.draft,
        parsedRevision.draft,
        input.immutableConstraints
      );
      progress("evaluate", round, best.report.overallScore);
      const evaluationCall = await evaluate({
        draft: parsedRevision.draft,
        immutableConstraints: input.immutableConstraints,
        userId: input.userId,
      });
      await drawActual(evaluationCall);
      const report = computeMarketplaceDraftQcReport(
        marketplaceDraftQcJudgeOutputSchema.parse(evaluationCall.data),
        now()
      );
      const candidate = {
        draft: parsedRevision.draft,
        report,
        round,
        fingerprint: fingerprintMarketplaceDraftQcCandidate(parsedRevision.draft),
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
    const parsedRevisionResult = revisedDraftOutputSchema.safeParse(
      revisedCall.data,
    );
    const recoveredRevision = parsedRevisionResult.success
      ? { data: parsedRevisionResult.data, warnings: [] as string[] }
      : recoverMarketplaceDraftQcRevisionOutput(revisedCall.data, input.draft);
    if (!recoveredRevision) {
      throw new Error(
        `Marketplace creative QC repair response failed schema validation: ${parsedRevisionResult.success ? "response" : parsedRevisionResult.error.issues.map(issue => issue.path.join(".") || "response").join(", ")}`,
      );
    }
    assertBoundedDraft(recoveredRevision.data.draft);
    assertCompleteDraftReplacement(input.draft, recoveredRevision.data.draft);
    assertImmutableConstraints(
      input.draft,
      recoveredRevision.data.draft,
      input.immutableConstraints,
    );
    progress("evaluate", 1, input.sourceReport.overallScore);
    const evaluationCall = await evaluate({
      draft: recoveredRevision.data.draft,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(evaluationCall);
    const report = computeMarketplaceDraftQcReport(
      marketplaceDraftQcJudgeOutputSchema.parse(evaluationCall.data),
      now(),
    );
    const repaired: MarketplaceDraftQcCandidateResult = {
      draft: recoveredRevision.data.draft,
      report,
      round: 1,
      fingerprint: fingerprintMarketplaceDraftQcCandidate(
        recoveredRevision.data.draft,
      ),
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
