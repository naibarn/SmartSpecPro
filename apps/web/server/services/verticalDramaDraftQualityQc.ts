import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  compareDraftQualityQcCandidates,
  computeDraftQualityQcReport,
  DRAFT_QC_MAX_IMPROVEMENT_ROUNDS,
  estimateDraftQualityQcCredits,
  fingerprintDraftQualityQcCandidate,
  normalizeDraftQualityQcRoundBudget,
  draftQualityQcJudgeOutputSchema,
  type DraftQualityQcCreditEstimate,
  type DraftQualityQcFailure,
  type DraftQualityQcFailurePhase,
  type DraftQualityQcHistoryEntry,
  type DraftQualityQcReport,
} from "@shared/verticalDramaSeries/draftQualityQc";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  calculateCreditsForLLM,
  createCreditReservation,
  drawFromReservation,
  refundReservation,
  type CreditReservation,
} from "./creditService";
import {
  executeJsonPlanningCallWithRetry,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { resolveVerticalDramaRecommendedDraftModel } from "./verticalDramaLlmModelPolicy";
import {
  appendVerticalDramaDraftVersion,
  type PersistVerticalDramaDraftVersion,
  type VerticalDramaDraftVersionRef,
} from "./verticalDramaDraftLedger";
import { inspectVerticalDramaDraftCompleteness } from "@shared/verticalDramaSeries/draftCompletion";

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-draft-quality-controller"
);
const MAX_DRAFT_BYTES = 160_000;
const revisedDraftOutputSchema = z.object({
  draft: z.record(z.string(), z.unknown()),
  changedFields: z.array(z.string().trim().min(1).max(120)).max(12),
});

export type DraftQualityQcDraft = Record<string, unknown>;

export interface DraftQualityQcImmutableConstraints {
  fields?: Record<string, unknown>;
  preservedPaths?: string[];
  narrativeLocale?: string;
  spokenLanguageProfile?: unknown;
  targetMarket?: string;
  genre?: string;
  storySetting?: string;
  userPremise?: string;
  targetEpisodeCount?: number;
}

export interface DraftQualityQcLoopInput {
  draft: DraftQualityQcDraft;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  maxImprovementRounds?: number;
  userId: number;
  tenantId?: string;
  draftId?: string;
  draftSessionId?: string;
  runId?: string;
  /** Enabled by the durable job; direct legacy callers may opt out. */
  enforceCompleteness?: boolean;
  isCancelled?: () => Promise<boolean>;
  onProgress?: (event: DraftQualityQcProgressEvent) => void;
}

export interface DraftQualityQcProgressEvent {
  phase: "baseline_evaluate" | "revise" | "evaluate" | "finalizing";
  round: number;
  maxRounds: number;
  callsDone: number;
  callsMax: number;
  lastScore: number | null;
}

export interface DraftQualityQcCandidateResult {
  draft: DraftQualityQcDraft;
  report: DraftQualityQcReport;
  round: number;
  fingerprint: string;
}

export interface DraftQualityQcLoopResult {
  best: DraftQualityQcCandidateResult;
  history: DraftQualityQcHistoryEntry[];
  creditEstimate: DraftQualityQcCreditEstimate;
  stopReason: "passed" | "max_rounds" | "no_improvement";
  roundsAttempted: number;
  evaluationsCompleted: number;
  model: string;
  reservationId?: string;
  draftArtifact?: VerticalDramaDraftVersionRef;
}

/** Error that keeps the completed QC evidence when a later call or validation fails. */
export class VerticalDramaDraftQualityQcError extends Error {
  constructor(public readonly failure: DraftQualityQcFailure) {
    super(failure.message);
    this.name = "VerticalDramaDraftQualityQcError";
  }
}

export interface DraftQualityQcCallResult {
  data: unknown;
  promptTokens: number;
  completionTokens: number;
}

export interface DraftQualityQcDependencies {
  model?: string;
  evaluate?: (params: {
    draft: DraftQualityQcDraft;
    immutableConstraints: DraftQualityQcImmutableConstraints;
    userId: number;
  }) => Promise<DraftQualityQcCallResult>;
  revise?: (params: {
    draft: DraftQualityQcDraft;
    report: DraftQualityQcReport;
    immutableConstraints: DraftQualityQcImmutableConstraints;
    userId: number;
  }) => Promise<DraftQualityQcCallResult>;
  createReservation?: (amount: number) => Promise<CreditReservation>;
  drawReservation?: (reservationId: string, amount: number) => Promise<unknown>;
  refundReservation?: (reservationId: string) => Promise<unknown>;
  persistVersion?: PersistVerticalDramaDraftVersion;
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
    "Could not locate vertical-drama-draft-quality-controller skill"
  );
}

function assertBoundedDraft(draft: DraftQualityQcDraft): void {
  const bytes = Buffer.byteLength(JSON.stringify(draft), "utf8");
  if (bytes > MAX_DRAFT_BYTES) {
    throw new Error(
      `Draft QC candidate exceeds the ${MAX_DRAFT_BYTES}-byte limit`
    );
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

function assertImmutableConstraints(
  original: DraftQualityQcDraft,
  revised: DraftQualityQcDraft,
  constraints: DraftQualityQcImmutableConstraints
): void {
  const paths = constraints.preservedPaths ?? [
    "storyContext",
    "storyDesign",
    "storyContract",
    "visualNarrativeProfile",
  ];
  for (const preservedPath of paths) {
    if (
      stableValue(readPath(original, preservedPath)) !==
      stableValue(readPath(revised, preservedPath))
    ) {
      throw new Error(
        `Draft revision changed immutable field: ${preservedPath}`
      );
    }
  }
  if (constraints.fields) {
    for (const [key, expected] of Object.entries(constraints.fields)) {
      if (stableValue(readPath(revised, key)) !== stableValue(expected)) {
        throw new Error(`Draft revision violated immutable constraint: ${key}`);
      }
    }
  }
}

function assertCompleteDraftReplacement(
  original: DraftQualityQcDraft,
  revised: DraftQualityQcDraft
): void {
  // Revise mode returns a complete draft, not a patch. Preserve the original
  // top-level shape so the wizard can safely render/apply the best candidate
  // and downstream fields cannot disappear during a quality pass.
  for (const key of Object.keys(original)) {
    if (!(key in revised)) {
      throw new Error(`Draft revision omitted required draft field: ${key}`);
    }
  }
}

function buildPromptContext(
  mode: "evaluate" | "revise",
  draft: DraftQualityQcDraft,
  constraints: DraftQualityQcImmutableConstraints,
  report?: DraftQualityQcReport
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
  draft: DraftQualityQcDraft;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  userId: number;
  model: string;
}): Promise<DraftQualityQcCallResult> {
  const result = await executeJsonPlanningCallWithRetry({
    model: params.model,
    systemPrompt: `${loadSkillPrompt()}\n\nEVALUATE MODE: judge only; never rewrite.`,
    userPrompt: buildPromptContext(
      "evaluate",
      params.draft,
      params.immutableConstraints
    ),
    temperature: 0.15,
    userId: params.userId,
    maxTokens: 3600,
    schema: draftQualityQcJudgeOutputSchema,
    disableProviderFallbacks: true,
    label: "Vertical Drama draft QC evaluate",
  });
  return {
    data: result.data,
    promptTokens: result.response.usage?.prompt_tokens ?? 0,
    completionTokens: result.response.usage?.completion_tokens ?? 0,
  };
}

async function defaultRevise(params: {
  draft: DraftQualityQcDraft;
  report: DraftQualityQcReport;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  userId: number;
  model: string;
}): Promise<DraftQualityQcCallResult> {
  const result = await executeJsonPlanningCallWithRetry({
    model: params.model,
    systemPrompt: `${loadSkillPrompt()}\n\nREVISE MODE: return a complete draft and changedFields; do not judge or return a score.`,
    userPrompt: buildPromptContext(
      "revise",
      params.draft,
      params.immutableConstraints,
      params.report
    ),
    temperature: 0.35,
    userId: params.userId,
    maxTokens: 7000,
    schema: revisedDraftOutputSchema,
    disableProviderFallbacks: true,
    label: "Vertical Drama draft QC revise",
  });
  return {
    data: result.data,
    promptTokens: result.response.usage?.prompt_tokens ?? 0,
    completionTokens: result.response.usage?.completion_tokens ?? 0,
  };
}

export async function runVerticalDramaDraftQualityQc(
  input: DraftQualityQcLoopInput,
  dependencies: DraftQualityQcDependencies = {}
): Promise<DraftQualityQcLoopResult> {
  assertBoundedDraft(input.draft);
  const maxRounds = Math.min(
    DRAFT_QC_MAX_IMPROVEMENT_ROUNDS,
    normalizeDraftQualityQcRoundBudget(input.maxImprovementRounds)
  );
  const model =
    dependencies.model ?? (await resolveVerticalDramaRecommendedDraftModel());
  // Reserve against the largest planned call (revision has a larger output
  // budget than evaluation) so a late revision cannot fail only because the
  // initial estimate was too optimistic.
  const perCallCredits = calculateCreditsForLLM(6000, 7000, model);
  const creditEstimate = estimateDraftQualityQcCredits({
    maxImprovementRounds: maxRounds,
    perCallCredits,
  });
  const createReservation =
    dependencies.createReservation ??
    (amount =>
      createCreditReservation(input.userId, amount, "skill", {
        feature: "vertical_drama_draft_quality_qc",
        tenantId: input.tenantId,
        maxImprovementRounds: maxRounds,
      }));
  const drawReservation =
    dependencies.drawReservation ??
    ((reservationId, amount) => drawFromReservation(reservationId, amount));
  const refundUnused =
    dependencies.refundReservation ??
    (reservationId => refundReservation(reservationId));
  const persistVersion =
    dependencies.persistVersion ?? appendVerticalDramaDraftVersion;
  const reservation = await createReservation(creditEstimate.estimatedCredits);
  const evaluate =
    dependencies.evaluate ?? (params => defaultEvaluate({ ...params, model }));
  const revise =
    dependencies.revise ?? (params => defaultRevise({ ...params, model }));
  const now = dependencies.now ?? (() => new Date().toISOString());
  let callsDone = 0;
  let actualCredits = 0;
  let consecutiveNoImprovement = 0;
  let reservationClosed = false;
  let latestArtifact: VerticalDramaDraftVersionRef | undefined;
  const history: DraftQualityQcHistoryEntry[] = [];
  let phase: DraftQualityQcFailurePhase = "baseline_evaluate";
  let activeRound = 0;
  let roundsAttempted = 0;
  let evaluationsCompleted = 0;
  let lastReport: DraftQualityQcReport | null = null;

  const drawActual = async (call: DraftQualityQcCallResult) => {
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
    return amount;
  };
  const progress = (
    phase: DraftQualityQcProgressEvent["phase"],
    round: number,
    score: number | null
  ) =>
    input.onProgress?.({
      phase,
      round,
      maxRounds,
      callsDone,
      callsMax: creditEstimate.maxCalls,
      lastScore: score,
    });

  try {
    if (await input.isCancelled?.()) throw new Error("Draft QC cancelled");
    phase = "baseline_evaluate";
    activeRound = 0;
    progress("baseline_evaluate", 0, null);
    const baselineCall = await evaluate({
      draft: input.draft,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(baselineCall);
    const baselineReport = computeDraftQualityQcReport(
      draftQualityQcJudgeOutputSchema.parse(baselineCall.data),
      now()
    );
    evaluationsCompleted += 1;
    lastReport = baselineReport;
    if (input.draftId && input.draftSessionId) {
      latestArtifact = await persistVersion({
        tenantId: input.tenantId ?? "unknown",
        userId: input.userId,
        draftId: input.draftId,
        draftSessionId: input.draftSessionId,
        stage: "qc-baseline",
        content: input.draft,
        runId: input.runId,
        changedPaths: [],
        metadata: { report: baselineReport },
      });
    }
    let best: DraftQualityQcCandidateResult = {
      draft: input.draft,
      report: baselineReport,
      round: 0,
      fingerprint: fingerprintDraftQualityQcCandidate(input.draft),
    };
    history.push({
      round: 0,
      score: baselineReport.overallScore,
      status: baselineReport.status,
      kept: true,
      reason: baselineReport.pass ? "passed" : "baseline",
      report: baselineReport,
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
        roundsAttempted,
        evaluationsCompleted,
        model,
        reservationId: reservation.reservationId,
        draftArtifact: latestArtifact,
      };
    }

    for (let round = 1; round <= maxRounds; round += 1) {
      roundsAttempted = round;
      activeRound = round;
      if (await input.isCancelled?.()) throw new Error("Draft QC cancelled");
      phase = "revise";
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
      if (input.enforceCompleteness) {
        const completion = inspectVerticalDramaDraftCompleteness({
          draft: parsedRevision.draft,
          targetEpisodeCount: input.immutableConstraints.targetEpisodeCount,
          genre: input.immutableConstraints.genre,
          userPremise: input.immutableConstraints.userPremise,
        });
        if (!completion.ready) {
          history.push({
            round,
            score: best.report.overallScore,
            status: "blocked",
            kept: false,
            reason: "failed",
            report: best.report,
            note: `Revision was not evaluated because the revised draft was incomplete: ${completion.report.missingPaths.slice(0, 6).join(", ") || completion.report.contradictionPaths.slice(0, 6).join(", ") || "unknown completeness failure"}`,
          });
          consecutiveNoImprovement += 1;
          if (consecutiveNoImprovement >= 2) break;
          continue;
        }
      }
      phase = "evaluate";
      progress("evaluate", round, best.report.overallScore);
      const evaluationCall = await evaluate({
        draft: parsedRevision.draft,
        immutableConstraints: input.immutableConstraints,
        userId: input.userId,
      });
      await drawActual(evaluationCall);
      const report = computeDraftQualityQcReport(
        draftQualityQcJudgeOutputSchema.parse(evaluationCall.data),
        now()
      );
      evaluationsCompleted += 1;
      lastReport = report;
      const candidate = {
        draft: parsedRevision.draft,
        report,
        round,
        fingerprint: fingerprintDraftQualityQcCandidate(parsedRevision.draft),
      };
      const isBetter = compareDraftQualityQcCandidates(best, candidate) > 0;
      history.push({
        round,
        score: report.overallScore,
        status: report.status,
        kept: isBetter,
        reason: report.pass ? "passed" : isBetter ? "improved" : "not_better",
        report,
      });
      if (isBetter) {
        best = candidate;
        consecutiveNoImprovement = 0;
        if (input.draftId && input.draftSessionId) {
          latestArtifact = await persistVersion({
            tenantId: input.tenantId ?? "unknown",
            userId: input.userId,
            draftId: input.draftId,
            draftSessionId: input.draftSessionId,
            stage: "qc-revision",
            content: candidate.draft,
            runId: input.runId,
            changedPaths: parsedRevision.changedFields,
            metadata: { round, report },
          });
        }
      } else {
        consecutiveNoImprovement += 1;
      }
      progress("evaluate", round, best.report.overallScore);
      if (best.report.pass) break;
      if (consecutiveNoImprovement >= 2) break;
    }

    phase = "finalizing";
    progress("finalizing", best.round, best.report.overallScore);
    if (input.draftId && input.draftSessionId) {
      latestArtifact = await persistVersion({
        tenantId: input.tenantId ?? "unknown",
        userId: input.userId,
        draftId: input.draftId,
        draftSessionId: input.draftSessionId,
        stage: "qc-final",
        content: best.draft,
        runId: input.runId,
        changedPaths: ["qc.best"],
        metadata: {
          report: best.report,
          round: best.round,
          stopReason: best.report.pass ? "passed" : "bounded",
        },
      });
    }
    await refundUnused(reservation.reservationId);
    reservationClosed = true;
    return {
      best,
      history,
      creditEstimate: { ...creditEstimate, actualCredits },
      stopReason: best.report.pass
        ? "passed"
        : history.length - 1 >= maxRounds
          ? "max_rounds"
          : "no_improvement",
      roundsAttempted,
      evaluationsCompleted,
      model,
      reservationId: reservation.reservationId,
      draftArtifact: latestArtifact,
    };
  } catch (error) {
    if (error instanceof VerticalDramaDraftQualityQcError) throw error;
    const message = error instanceof Error ? error.message : "Draft QC failed";
    throw new VerticalDramaDraftQualityQcError({
      phase,
      round: activeRound,
      message,
      callsDone,
      callsMax: creditEstimate.maxCalls,
      roundsAttempted,
      evaluationsCompleted,
      history: history.slice(),
      lastReport,
    });
  } finally {
    if (!reservationClosed) {
      await refundUnused(reservation.reservationId).catch(() => undefined);
    }
  }
}
