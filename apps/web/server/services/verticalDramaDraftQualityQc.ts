import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  compareDraftQualityQcCandidates,
  computeDraftQualityQcReport,
  DRAFT_QC_IMMUTABLE_PRESERVED_PATHS,
  DRAFT_QC_MAX_CHANGED_FIELDS,
  DRAFT_QC_MAX_IMPROVEMENT_ROUNDS,
  DRAFT_QC_MUTABLE_STORY_DESIGN_KEYS,
  DRAFT_QC_SERVER_MANAGED_STORY_DESIGN_KEYS,
  estimateDraftQualityQcCredits,
  fingerprintDraftQualityQcCandidate,
  normalizeDraftQualityQcRoundBudget,
  draftQualityQcJudgeOutputSchema,
  formatDraftQualityQcJudgeNormalizationError,
  normalizeDraftQualityQcJudgeOutput,
  type DraftQualityQcCriticalFailCode,
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
  chargeVerticalDramaLlmCall,
  type VerticalDramaLlmCallBillingInput,
} from "./verticalDramaLlmBilling";
import {
  executeJsonPlanningCallWithRetry,
  VD_COMPACT_JSON_INSTRUCTION,
} from "./verticalDramaStoryBible";
import { DEFAULT_TENANT_SKILL_CREDITS } from "./skillRevenueBilling";
import { resolveVerticalDramaRecommendedDraftModel } from "./verticalDramaLlmModelPolicy";
import {
  appendVerticalDramaDraftVersion,
  type PersistVerticalDramaDraftVersion,
  type VerticalDramaDraftVersionRef,
} from "./verticalDramaDraftLedger";
import { inspectVerticalDramaDraftCompleteness } from "@shared/verticalDramaSeries/draftCompletion";
import { inspectVerticalDramaStoryControlConsistency } from "@shared/verticalDramaSeries/storyControlConsistency";
import {
  readVerticalDramaDraftStoryDesign,
  repairVerticalDramaDraftStoryDesign,
} from "@shared/verticalDramaSeries/draftStoryDesign";

export const DRAFT_QC_JUDGE_OUTPUT_CONTRACT =
  'Return exactly one complete top-level JSON object with these required keys in this exact casing: "criteria", "criticalFails", "strengths", "weaknesses", "recommendations". "criteria" must contain exactly 8 scored criteria. "criticalFails" is mandatory even when there are no failures; in that case it MUST be an empty array []. Never omit it, use null, or replace it with another key. Do not return markdown, commentary, a wrapper, or a partial scorecard.';

export const DRAFT_QC_JUDGE_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "vertical_drama_draft_qc_judge_v1",
    strict: false,
    schema: {
      type: "object",
      properties: {
        criteria: {
          type: "array",
          minItems: 8,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              criterionId: {
                type: "string",
                enum: [
                  "hook_strength",
                  "premise_core_conflict",
                  "vertical_drama_engine",
                  "escalation_twist_potential",
                  "character_emotional_engine",
                  "target_audience_market_fit",
                  "originality_differentiation",
                  "long_form_sustainability",
                ],
              },
              rawScore: { type: "number", minimum: 0, maximum: 5 },
              evidence: { type: "string", minLength: 1 },
            },
            required: ["criterionId", "rawScore", "evidence"],
            additionalProperties: false,
          },
        },
        criticalFails: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: [
                  "missing_protagonist_goal",
                  "missing_core_conflict",
                  "missing_repeatable_engine",
                  "missing_escalation_path",
                  "explicit_constraint_contradiction",
                  "market_setting_dialogue_contradiction",
                  "random_or_unearned_twist",
                  "schema_or_role_inconsistency",
                ],
              },
              explanation: { type: "string", minLength: 1 },
            },
            required: ["code", "explanation"],
            additionalProperties: false,
          },
        },
        strengths: {
          type: "array",
          maxItems: 3,
          items: { type: "string", minLength: 1 },
        },
        weaknesses: {
          type: "array",
          maxItems: 3,
          items: { type: "string", minLength: 1 },
        },
        recommendations: {
          type: "array",
          maxItems: 3,
          items: { type: "string", minLength: 1 },
        },
      },
      required: [
        "criteria",
        "criticalFails",
        "strengths",
        "weaknesses",
        "recommendations",
      ],
      additionalProperties: false,
    },
  },
} as const;

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-draft-quality-controller"
);
export const VERTICAL_DRAMA_DRAFT_QC_SKILL_SLUG =
  "vertical-drama-draft-quality-controller";
export const VERTICAL_DRAMA_DRAFT_QC_SKILL_NAME =
  "Vertical Drama Draft Quality Controller";
const MAX_DRAFT_BYTES = 160_000;
const revisedDraftOutputSchema = z.object({
  draft: z.record(z.string(), z.unknown()),
  changedFields: z
    .array(z.string().trim().min(1).max(120))
    .max(DRAFT_QC_MAX_CHANGED_FIELDS),
});
const revisedDraftRecoverySchema = z
  .object({
    draft: z.record(z.string(), z.unknown()),
    changedFields: z.unknown().optional(),
  })
  .passthrough();

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
  /** Server-owned context explaining why QC may be evaluating a partial Draft. */
  preQcCompleteness?: {
    status: "incomplete" | "ready_for_qc";
    repairRound: number;
    missingPaths: string[];
    contradictionPaths: string[];
    diagnostics: string[];
  };
}

export interface DraftQualityQcLoopInput {
  draft: DraftQualityQcDraft;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  maxImprovementRounds?: number;
  userId: number;
  tenantId?: string;
  seriesId?: number;
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
  /** Model that produced the accepted response after bounded fallback rotation. */
  model?: string;
  /** Provider/schema recovery notes that must survive the strict transport schema. */
  normalizationWarnings?: string[];
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
  refundReservation?: (
    reservationId: string,
    forceFixedSkillRefund?: boolean,
  ) => Promise<unknown>;
  /** Test seam; production uses the real per-call ledger helper. */
  chargeLlmCall?: (
    input: VerticalDramaLlmCallBillingInput,
  ) => Promise<{ creditsUsed: number; wasFree: boolean }>;
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

function normalizeChangedFields(changedFields: string[]): string[] {
  return [
    ...new Set(
      changedFields.map(field => field.trim()).filter(field => field.length > 0)
    ),
  ].slice(0, DRAFT_QC_MAX_CHANGED_FIELDS);
}

function deriveChangedFields(
  original: DraftQualityQcDraft,
  revised: DraftQualityQcDraft
): string[] {
  const keys = new Set([...Object.keys(original), ...Object.keys(revised)]);
  return normalizeChangedFields(
    [...keys].filter(
      key => stableValue(original[key]) !== stableValue(revised[key])
    )
  );
}

/**
 * A revise response may omit the audit-only changedFields metadata even after
 * schema retries. Recover only that metadata when the revised Draft itself is
 * structurally valid; never recover a missing/invalid Draft or any scorecard.
 */
export function recoverDraftQualityQcRevisionOutput(
  value: unknown,
  original: DraftQualityQcDraft
): {
  data: z.infer<typeof revisedDraftOutputSchema>;
  warnings: string[];
} | null {
  const parsed = revisedDraftRecoverySchema.safeParse(value);
  if (!parsed.success) return null;
  const rawChangedFields = parsed.data.changedFields;
  if (rawChangedFields !== undefined && !Array.isArray(rawChangedFields)) {
    return null;
  }
  const suppliedChangedFields = Array.isArray(rawChangedFields)
    ? rawChangedFields.filter(
        (field): field is string => typeof field === "string"
      )
    : [];
  const changedFields = normalizeChangedFields(
    suppliedChangedFields.length > 0
      ? suppliedChangedFields
      : deriveChangedFields(original, parsed.data.draft)
  );
  return {
    data: {
      draft: parsed.data.draft,
      changedFields,
    },
    warnings:
      rawChangedFields === undefined
        ? [
            "LLM omitted changedFields; the server derived it from the Draft diff.",
          ]
        : [],
  };
}

function assertImmutableConstraints(
  original: DraftQualityQcDraft,
  revised: DraftQualityQcDraft,
  constraints: DraftQualityQcImmutableConstraints
): void {
  // Client-supplied paths are additive hints only. Never let a caller remove
  // the server's identity protections by sending an empty preservedPaths list.
  const paths = [
    ...new Set([
      ...DRAFT_QC_IMMUTABLE_PRESERVED_PATHS,
      ...(constraints.preservedPaths ?? []),
    ]),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableArrayKey(value: Record<string, unknown>): string | null {
  for (const key of [
    "id",
    "key",
    "name",
    "threadId",
    "criterionId",
    "episodeNumber",
    "code",
  ]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim())
      return `${key}:${candidate}`;
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return `${key}:${candidate}`;
  }
  return null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function assertMutableStoryDesignContract(
  original: DraftQualityQcDraft,
  revised: DraftQualityQcDraft,
  constraints: DraftQualityQcImmutableConstraints
): void {
  const originalDesign = readPath(original, "storyDesign");
  const revisedDesign = readPath(revised, "storyDesign");
  if (stableValue(originalDesign) === stableValue(revisedDesign)) return;

  if (!isRecord(revisedDesign)) {
    throw new Error(
      "Draft revision produced an invalid storyDesign control plane"
    );
  }
  const originalRecord = isRecord(originalDesign) ? originalDesign : {};
  const changedKeys = new Set([
    ...Object.keys(originalRecord),
    ...Object.keys(revisedDesign),
  ]);
  for (const key of changedKeys) {
    if (
      (DRAFT_QC_SERVER_MANAGED_STORY_DESIGN_KEYS as readonly string[]).includes(
        key
      )
    ) {
      continue;
    }
    if (
      (DRAFT_QC_MUTABLE_STORY_DESIGN_KEYS as readonly string[]).includes(key)
    ) {
      continue;
    }
    if (stableValue(originalRecord[key]) !== stableValue(revisedDesign[key])) {
      throw new Error(
        `Draft revision changed immutable field: storyDesign.${key}`
      );
    }
  }

  if (!readVerticalDramaDraftStoryDesign(revisedDesign)) {
    throw new Error(
      "Draft revision produced an invalid storyDesign control plane"
    );
  }
  const consistency = inspectVerticalDramaStoryControlConsistency({
    storyDesign: revisedDesign,
    storyArchitecture: readPath(revised, "storyContract"),
    targetEpisodeCount: constraints.targetEpisodeCount,
  });
  if (consistency.issues.length > 0) {
    throw new Error(
      `Draft revision produced inconsistent storyDesign: ${consistency.issues
        .slice(0, 3)
        .map(issue => issue.code)
        .join(", ")}`
    );
  }
}

function stripServerManagedStoryDesignMetadata(
  draft: DraftQualityQcDraft
): DraftQualityQcDraft {
  const storyDesign = draft.storyDesign;
  if (!isRecord(storyDesign)) return draft;
  const sanitizedStoryDesign = { ...storyDesign };
  for (const key of DRAFT_QC_SERVER_MANAGED_STORY_DESIGN_KEYS) {
    delete sanitizedStoryDesign[key];
  }
  return {
    ...draft,
    storyDesign: sanitizedStoryDesign,
  };
}

/**
 * Revision responses are treated as additive documents. Providers sometimes
 * omit a large field such as visualBible when they focus on one weak score;
 * omission is therefore "unchanged", never deletion. This also protects
 * nested arrays such as characters, locations, and pressure threads.
 */
export function mergeDraftRevisionPreservingFields(
  original: DraftQualityQcDraft,
  revised: DraftQualityQcDraft
): { draft: DraftQualityQcDraft; restoredPaths: string[] } {
  const restoredPaths: string[] = [];

  const mergeValue = (base: unknown, patch: unknown, path: string): unknown => {
    if (patch === undefined || patch === null) {
      if (base !== undefined) restoredPaths.push(path || "draft");
      return base;
    }
    if (isRecord(base) && isRecord(patch)) {
      const merged: Record<string, unknown> = { ...base };
      for (const key of Object.keys(base)) {
        if (!(key in patch)) restoredPaths.push(path ? `${path}.${key}` : key);
      }
      for (const [key, value] of Object.entries(patch)) {
        merged[key] = mergeValue(
          base[key],
          value,
          path ? `${path}.${key}` : key
        );
      }
      return merged;
    }
    if (Array.isArray(base) && Array.isArray(patch)) {
      if (patch.length === 0 && base.length > 0) {
        restoredPaths.push(path || "draft");
        return base;
      }
      const baseByKey = new Map<
        string,
        { index: number; value: Record<string, unknown> }
      >();
      base.forEach((item, index) => {
        if (isRecord(item)) {
          const key = stableArrayKey(item);
          if (key) baseByKey.set(key, { index, value: item });
        }
      });
      const seen = new Set<number>();
      const merged = patch.map((item, index) => {
        if (!isRecord(item)) return item;
        const keyed = stableArrayKey(item);
        const existing = keyed ? baseByKey.get(keyed) : undefined;
        if (existing) {
          seen.add(existing.index);
          return mergeValue(existing.value, item, `${path}[${existing.index}]`);
        }
        return item;
      });
      base.forEach((item, index) => {
        if (!seen.has(index)) {
          restoredPaths.push(`${path}[${index}]`);
          merged.push(item);
        }
      });
      const unique: unknown[] = [];
      const seenValues = new Set<string>();
      for (const item of merged) {
        const fingerprint = stableJson(item);
        if (!seenValues.has(fingerprint)) {
          seenValues.add(fingerprint);
          unique.push(item);
        }
      }
      return unique;
    }
    return patch;
  };

  const merged = mergeValue(original, revised, "");
  return {
    draft: (isRecord(merged) ? merged : original) as DraftQualityQcDraft,
    restoredPaths: [...new Set(restoredPaths)],
  };
}

function verifyDraftQualityQcCriticalFailures(params: {
  draft: DraftQualityQcDraft;
  constraints: DraftQualityQcImmutableConstraints;
  enforceCompleteness?: boolean;
}): Array<{ code: DraftQualityQcCriticalFailCode; explanation: string }> {
  if (!params.enforceCompleteness) return [];
  const inspection = inspectVerticalDramaDraftCompleteness({
    draft: params.draft,
    targetEpisodeCount: params.constraints.targetEpisodeCount,
    genre: params.constraints.genre,
    userPremise: params.constraints.userPremise,
  });
  if (inspection.ready) return [];
  const failures: Array<{
    code: DraftQualityQcCriticalFailCode;
    explanation: string;
  }> = [];
  const add = (code: DraftQualityQcCriticalFailCode, explanation: string) => {
    if (!failures.some(item => item.code === code))
      failures.push({ code, explanation });
  };
  const paths = [
    ...inspection.report.missingPaths,
    ...inspection.report.contradictionPaths,
  ];
  const controlConsistency = inspectVerticalDramaStoryControlConsistency({
    storyDesign: params.draft.storyDesign,
    storyArchitecture: params.draft.storyContract,
    targetEpisodeCount: params.constraints.targetEpisodeCount,
  });
  if (controlConsistency.issues.length > 0) {
    add(
      "explicit_constraint_contradiction",
      `Story-control consistency failed at ${controlConsistency.issues
        .map(item => item.path)
        .slice(0, 6)
        .join(
          ", "
        )}. Repair control data against the approved Story Architecture.`
    );
  }
  if (
    paths.some(path =>
      /storyContract|protagonist|mainPlot|seasonArc|central/i.test(path)
    )
  ) {
    add(
      "missing_core_conflict",
      "The draft is missing a validated protagonist goal, core conflict, or story destination."
    );
  }
  if (
    paths.some(path =>
      /storyDesign\.(primaryEngine|pressureThreads|advantageBeats|storyControlSeed|conflictGuardrails)/i.test(
        path
      )
    )
  ) {
    add(
      "missing_repeatable_engine",
      "The draft has no complete repeatable story engine and control-plane evidence."
    );
  }
  if (
    paths.some(path =>
      /terminalDestination|totalEpisodeCount|episodeWindow|destination/i.test(
        path
      )
    )
  ) {
    add(
      "missing_escalation_path",
      "The draft does not prove escalation through the planned season endpoint."
    );
  }
  if (inspection.report.contradictionPaths.length > 0) {
    add(
      "explicit_constraint_contradiction",
      "The draft contradicts an approved story or episode-count constraint."
    );
  }
  if (failures.length === 0) {
    add(
      "schema_or_role_inconsistency",
      "The draft failed deterministic completeness validation before QC could pass it."
    );
  }
  return failures.slice(0, 8);
}

export function buildDraftQualityQcRevisionBrief(
  report: DraftQualityQcReport,
  targetEpisodeCount?: number
): string {
  const weakCriteria = report.criteria.filter(item => item.rawScore <= 3);
  const instructions = new Map<string, string>([
    [
      "hook_strength",
      "strengthen the opening promise with a specific visible problem, immediate stakes, and a concrete unanswered question",
    ],
    [
      "premise_core_conflict",
      "make the protagonist goal, opposing force, irreversible stakes, and long-term destination causally explicit",
    ],
    [
      "vertical_drama_engine",
      "define a repeatable episode engine where each episode has a problem, decision, consequence, and new pressure",
    ],
    [
      "escalation_twist_potential",
      "add earned escalation beats and reversals whose causes are planted before their payoff",
    ],
    [
      "character_emotional_engine",
      "tie the emotional change to concrete choices, relationship reversals, and consequences rather than description",
    ],
    [
      "target_audience_market_fit",
      "make the audience promise, market setting, tone, and dialogue-language contract coherent without changing creator intent",
    ],
    [
      "originality_differentiation",
      "make the differentiating mechanism specific, repeatable, and visible in the story rather than relying on genre labels",
    ],
    [
      "long_form_sustainability",
      `build a complete episode architecture for exactly ${targetEpisodeCount ?? "the configured"} episodes with episode windows, pressure-thread progression, romance progression, advantage beats, and a terminal destination that pays off the long-term story contract`,
    ],
  ]);

  const criticalInstructions = new Map<string, string>([
    [
      "missing_repeatable_engine",
      "repair the story-control plane: align pressureThreads, romanceProgression, advantageBeats, and storyControlSeed without deleting authored narrative fields",
    ],
    [
      "explicit_constraint_contradiction",
      "restore the approved Story Architecture as authoritative; repair any episode-window, destination, or long-form contradiction",
    ],
    [
      "missing_escalation_path",
      "add a concrete setup, midpoint reversal, late test, and terminal destination beat within the configured episode count",
    ],
    [
      "schema_or_role_inconsistency",
      "replace placeholder, duplicate, or invalid control records with stable creator-readable values while retaining the original in legacy metadata",
    ],
    [
      "missing_core_conflict",
      "restore the protagonist goal, opposing force, irreversible stakes, and approved long-term destination",
    ],
  ]);

  const criticalBrief = report.criticalFails.length
    ? [
        "BLOCKING CRITICAL FAILURES — these must be repaired even when numeric criteria are above 3/5:",
        ...report.criticalFails.map(
          item =>
            `- ${item.code}: ${criticalInstructions.get(item.code) ?? "repair this blocking issue using concrete story evidence"}.`
        ),
      ].join("\n")
    : "";

  if (weakCriteria.length === 0) {
    return (
      criticalBrief ||
      "No criterion is at or below 3/5 and no critical failure was reported. Preserve the current strengths and make only evidence-backed structural improvements."
    );
  }

  const weakBrief = weakCriteria
    .map(item => {
      const instruction = instructions.get(item.criterionId);
      return `- ${item.criterionId} (${item.rawScore}/5): ${instruction ?? "repair the criterion using concrete story evidence"}.`;
    })
    .join("\n");
  return [criticalBrief, "LOW-SCORING CRITERIA:", weakBrief]
    .filter(Boolean)
    .join("\n");
}

function buildPromptContext(
  mode: "evaluate" | "revise",
  draft: DraftQualityQcDraft,
  constraints: DraftQualityQcImmutableConstraints,
  report?: DraftQualityQcReport
): string {
  // Legacy control fields remain persisted for audit/recovery, but they are
  // not active story constraints. Sending them to the judge makes it treat a
  // repaired plan and its archived predecessor as two competing plans.
  const draftForPrompt = stripSupersededStoryControlMetadata(draft);
  return [
    `MODE: ${mode}`,
    "NARRATIVE CONTENT MUST USE THE UI LOCALE; SPOKEN LANGUAGE IS DIALOGUE-ONLY.",
    "Only canonical active story-control fields are authoritative. Ignore any superseded legacy/archive metadata when checking episode windows, romance progression, advantage beats, or the season endpoint.",
    "IMMUTABLE CONSTRAINTS:",
    JSON.stringify(constraints),
    "DRAFT (canonical active fields; superseded archives omitted):",
    JSON.stringify(draftForPrompt),
    report ? `QC FEEDBACK:\n${JSON.stringify(report)}` : "",
    report
      ? `TARGETED REVISION: repair the following weak criteria and preserve all other strengths and every omitted field unchanged.\n${buildDraftQualityQcRevisionBrief(report, constraints.targetEpisodeCount)}`
      : "",
    mode === "evaluate" ? DRAFT_QC_JUDGE_OUTPUT_CONTRACT : "",
    VD_COMPACT_JSON_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function stripSupersededStoryControlMetadata(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(stripSupersededStoryControlMetadata);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (
      key === "legacyControlArchive" ||
      key === "legacyEpisodeWindow" ||
      key === "legacyThreadId" ||
      key === "legacyPlaceholderText" ||
      key === "legacyDuplicateBeats" ||
      key === "supersededLegacyMetadata"
    ) {
      continue;
    }
    output[key] = stripSupersededStoryControlMetadata(child);
  }
  return output;
}

async function defaultEvaluate(params: {
  draft: DraftQualityQcDraft;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  userId: number;
  model: string;
}): Promise<DraftQualityQcCallResult> {
  const result = await executeJsonPlanningCallWithRetry({
    model: params.model,
    systemPrompt: `${loadSkillPrompt()}\n\nEVALUATE MODE: judge only; never rewrite.\n\n${DRAFT_QC_JUDGE_OUTPUT_CONTRACT}`,
    userPrompt: buildPromptContext(
      "evaluate",
      params.draft,
      params.immutableConstraints
    ),
    temperature: 0.15,
    userId: params.userId,
    maxTokens: 3600,
    schema: draftQualityQcJudgeOutputSchema,
    extraBodyParams: { response_format: DRAFT_QC_JUDGE_RESPONSE_FORMAT },
    disableProviderFallbacks: true,
    label: "Vertical Drama draft QC evaluate",
    schemaRetryContract: DRAFT_QC_JUDGE_OUTPUT_CONTRACT,
    onSchemaRetriesExhausted: ({ parsedJson }) => {
      const normalized = normalizeDraftQualityQcJudgeOutput(parsedJson);
      if (normalized.ok) {
        return { data: normalized.data, warnings: normalized.warnings };
      }
      throw new Error(formatDraftQualityQcJudgeNormalizationError(parsedJson));
    },
  });
  return {
    data: result.data,
    promptTokens: result.response.usage?.prompt_tokens ?? 0,
    completionTokens: result.response.usage?.completion_tokens ?? 0,
    model: result.model,
    normalizationWarnings: result.warnings ?? [],
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
    systemPrompt: `${loadSkillPrompt()}\n\nREVISE MODE: return one complete draft and changedFields; do not judge or return a score. The server applies additive merge semantics: an omitted or null field is unchanged, never deleted. Preserve every non-targeted field, including visualBible, storyContext, storyContract, characters, locations, and mixRecipe. The approved storyContract and identity facts are immutable. storyDesign may change only in the server-allowlisted story-control keys required by the targeted repair; do not add or alter unknown passthrough keys.`,
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
    onSchemaRetriesExhausted: ({ parsedJson }) =>
      recoverDraftQualityQcRevisionOutput(parsedJson, params.draft),
  });
  return {
    data: result.data,
    promptTokens: result.response.usage?.prompt_tokens ?? 0,
    completionTokens: result.response.usage?.completion_tokens ?? 0,
    model: result.model,
    normalizationWarnings: result.warnings ?? [],
  };
}

function repairStoryControlPlaneForQc(
  draft: DraftQualityQcDraft,
  constraints: DraftQualityQcImmutableConstraints
): DraftQualityQcDraft {
  if (!draft.storyDesign) return draft;
  const repairedStoryDesign = repairVerticalDramaDraftStoryDesign({
    storyDesign: draft.storyDesign,
    storyArchitecture: draft.storyContract,
    targetEpisodeCount: constraints.targetEpisodeCount,
    characterNames: Array.isArray(draft.characters)
      ? draft.characters
          .map(character =>
            typeof character === "object" && character !== null
              ? String((character as Record<string, unknown>).name ?? "")
              : ""
          )
          .filter(Boolean)
      : [],
  });
  return repairedStoryDesign
    ? { ...draft, storyDesign: repairedStoryDesign }
    : draft;
}

export async function runVerticalDramaDraftQualityQc(
  input: DraftQualityQcLoopInput,
  dependencies: DraftQualityQcDependencies = {}
): Promise<DraftQualityQcLoopResult> {
  assertBoundedDraft(input.draft);
  const preparedDraft = input.enforceCompleteness
    ? repairStoryControlPlaneForQc(input.draft, input.immutableConstraints)
    : input.draft;
  const maxRounds = Math.min(
    DRAFT_QC_MAX_IMPROVEMENT_ROUNDS,
    normalizeDraftQualityQcRoundBudget(input.maxImprovementRounds)
  );
  let activeModel =
    dependencies.model ?? (await resolveVerticalDramaRecommendedDraftModel());
  // Reserve against the largest planned call (revision has a larger output
  // budget than evaluation) so a late revision cannot fail only because the
  // initial estimate was too optimistic.
  const perCallCredits = calculateCreditsForLLM(6000, 7000, activeModel);
  const creditEstimate = estimateDraftQualityQcCredits({
    maxImprovementRounds: maxRounds,
    perCallCredits,
  });
  const qcIdentity =
    input.runId ??
    input.draftSessionId ??
    input.draftId ??
    fingerprintDraftQualityQcCandidate(input.draft);
  const logicalRunKey = `vd-draft-qc:${qcIdentity}`;
  const createReservation =
    dependencies.createReservation ??
    (() =>
      createCreditReservation(
        input.userId,
        DEFAULT_TENANT_SKILL_CREDITS,
        "skill",
        {
          feature: "vertical_drama_draft_quality_qc",
          tenantId: input.tenantId,
          maxImprovementRounds: maxRounds,
          skillName: VERTICAL_DRAMA_DRAFT_QC_SKILL_NAME,
          model: activeModel,
          llmModel: activeModel,
          logicalRunKey,
        },
        logicalRunKey,
        {
          tenantId: input.tenantId,
          skillSlug: VERTICAL_DRAMA_DRAFT_QC_SKILL_SLUG,
          skillRunId: logicalRunKey,
          description: `Skill run: ${VERTICAL_DRAMA_DRAFT_QC_SKILL_NAME}`,
        },
      ));
  const drawReservation =
    dependencies.drawReservation ??
    ((reservationId, amount) => drawFromReservation(reservationId, amount));
  const refundUnused =
    dependencies.refundReservation ??
    ((reservationId, forceFixedSkillRefund = false) =>
      refundReservation(reservationId, forceFixedSkillRefund));
  const persistVersion =
    dependencies.persistVersion ?? appendVerticalDramaDraftVersion;
  // Production billing is per accepted LLM call. Reservation mode remains
  // available only for legacy/unit-test dependency injection; using it in the
  // worker would hide later evaluate/revise calls from the credit ledger.
  const reservation = dependencies.createReservation
    ? await createReservation(DEFAULT_TENANT_SKILL_CREDITS)
    : undefined;
  const chargeLlmCall =
    dependencies.chargeLlmCall ?? chargeVerticalDramaLlmCall;
  const evaluate =
    dependencies.evaluate ??
    (params => defaultEvaluate({ ...params, model: activeModel }));
  const revise =
    dependencies.revise ??
    (params => defaultRevise({ ...params, model: activeModel }));
  const now = dependencies.now ?? (() => new Date().toISOString());
  let callsDone = 0;
  let actualCredits = 0;
  let fixedReservationConsumed = false;
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
    const callNumber = callsDone + 1;
    const stage = phase;
    const amount = calculateCreditsForLLM(
      call.promptTokens,
      call.completionTokens,
      call.model ?? activeModel
    );
    let chargedAmount = amount;
    if (reservation) {
      // Legacy injected reservation mode is retained for deterministic tests.
      // The production path below creates one ledger entry for every call.
      if (!fixedReservationConsumed) {
        await drawReservation(
          reservation.reservationId,
          reservation.reservedAmount
        );
        fixedReservationConsumed = true;
      }
    } else {
      const charge = await chargeLlmCall({
        userId: input.userId,
        tenantId: input.tenantId,
        seriesId: input.seriesId,
        runId: logicalRunKey,
        attemptKey: `${logicalRunKey}:${stage}:round-${activeRound}:call-${callNumber}`,
        skillSlug: VERTICAL_DRAMA_DRAFT_QC_SKILL_SLUG,
        stage,
        round: activeRound,
        attempt: callNumber,
        model: call.model ?? activeModel,
        inputTokens: call.promptTokens,
        outputTokens: call.completionTokens,
        metadata: {
          skillName: VERTICAL_DRAMA_DRAFT_QC_SKILL_NAME,
          draftId: input.draftId ?? null,
          draftSessionId: input.draftSessionId ?? null,
          candidateFingerprint: fingerprintDraftQualityQcCandidate(input.draft),
        },
      });
      chargedAmount = charge.creditsUsed;
    }
    actualCredits += reservation ? amount : chargedAmount;
    if (call.model) activeModel = call.model;
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
      draft: preparedDraft,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(baselineCall);
    const baselineJudge = normalizeDraftQualityQcJudgeOutput(baselineCall.data);
    if (!baselineJudge.ok) {
      throw new Error(
        formatDraftQualityQcJudgeNormalizationError(baselineCall.data)
      );
    }
    const baselineDeterministicFailures = verifyDraftQualityQcCriticalFailures({
      draft: preparedDraft,
      constraints: input.immutableConstraints,
      enforceCompleteness: input.enforceCompleteness,
    });
    const baselineReport = computeDraftQualityQcReport(
      baselineJudge.data,
      now(),
      {
        criticalFails: [
          ...baselineJudge.data.criticalFails,
          ...baselineDeterministicFailures.filter(
            deterministic =>
              !baselineJudge.data.criticalFails.some(
                reported => reported.code === deterministic.code
              )
          ),
        ].slice(0, 8),
        evaluationWarnings: [
          ...(baselineCall.normalizationWarnings ?? []),
          ...baselineJudge.warnings,
        ],
      }
    );
    evaluationsCompleted += 1;
    lastReport = baselineReport;
    const baselineFingerprint =
      fingerprintDraftQualityQcCandidate(preparedDraft);
    let baselineArtifact: VerticalDramaDraftVersionRef | undefined;
    if (input.draftId && input.draftSessionId) {
      baselineArtifact = await persistVersion({
        tenantId: input.tenantId ?? "unknown",
        userId: input.userId,
        draftId: input.draftId,
        draftSessionId: input.draftSessionId,
        stage: "qc-baseline",
        content: preparedDraft,
        runId: input.runId,
        changedPaths: [],
        metadata: {
          report: baselineReport,
          candidateFingerprint: baselineFingerprint,
          candidateRound: 0,
        },
      });
      latestArtifact = baselineArtifact;
    }
    let best: DraftQualityQcCandidateResult = {
      draft: preparedDraft,
      report: baselineReport,
      round: 0,
      fingerprint: baselineFingerprint,
    };
    history.push({
      round: 0,
      score: baselineReport.overallScore,
      status: baselineReport.status,
      kept: true,
      reason: baselineReport.pass ? "passed" : "baseline",
      candidateVersion: baselineArtifact?.version,
      candidateFingerprint: baselineFingerprint,
      report: baselineReport,
    });
    progress("evaluate", 0, best.report.overallScore);
    if (best.report.pass || maxRounds === 0) {
      if (reservation) {
        await refundUnused(reservation.reservationId);
        reservationClosed = true;
      }
      return {
        best,
        history,
        creditEstimate: { ...creditEstimate, actualCredits },
        stopReason: best.report.pass ? "passed" : "max_rounds",
        roundsAttempted,
        evaluationsCompleted,
        model: activeModel,
        reservationId: reservation?.reservationId,
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
      const parsedRevisionResult = revisedDraftOutputSchema.safeParse(
        revisedCall.data
      );
      let parsedRevision: z.infer<typeof revisedDraftOutputSchema>;
      if (parsedRevisionResult.success) {
        parsedRevision = parsedRevisionResult.data;
      } else {
        const recoveredRevision = recoverDraftQualityQcRevisionOutput(
          revisedCall.data,
          best.draft
        );
        if (!recoveredRevision) {
          throw new Error(
            `Vertical Drama draft QC revise response failed schema validation: ${parsedRevisionResult.error.issues
              .map(issue => issue.path.join(".") || "response")
              .join(", ")}`
          );
        }
        revisedCall.normalizationWarnings = [
          ...(revisedCall.normalizationWarnings ?? []),
          ...recoveredRevision.warnings,
        ];
        parsedRevision = recoveredRevision.data;
      }
      const changedFields = normalizeChangedFields(
        parsedRevision.changedFields
      );
      const providerRevisionDraft = stripServerManagedStoryDesignMetadata(
        parsedRevision.draft
      );
      assertBoundedDraft(providerRevisionDraft);
      const mergedRevision = mergeDraftRevisionPreservingFields(
        best.draft,
        providerRevisionDraft
      );
      const repairedRevisionDraft = repairStoryControlPlaneForQc(
        mergedRevision.draft,
        input.immutableConstraints
      );
      mergedRevision.draft = repairedRevisionDraft;
      assertBoundedDraft(mergedRevision.draft);
      assertImmutableConstraints(
        best.draft,
        mergedRevision.draft,
        input.immutableConstraints
      );
      assertMutableStoryDesignContract(
        best.draft,
        mergedRevision.draft,
        input.immutableConstraints
      );
      if (input.enforceCompleteness) {
        const completion = inspectVerticalDramaDraftCompleteness({
          draft: mergedRevision.draft,
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
        draft: mergedRevision.draft,
        immutableConstraints: input.immutableConstraints,
        userId: input.userId,
      });
      await drawActual(evaluationCall);
      const judge = normalizeDraftQualityQcJudgeOutput(evaluationCall.data);
      if (!judge.ok) {
        throw new Error(
          formatDraftQualityQcJudgeNormalizationError(evaluationCall.data)
        );
      }
      const deterministicFailures = verifyDraftQualityQcCriticalFailures({
          draft: mergedRevision.draft,
          constraints: input.immutableConstraints,
          enforceCompleteness: input.enforceCompleteness,
        });
      const report = computeDraftQualityQcReport(judge.data, now(), {
        criticalFails: [
          ...judge.data.criticalFails,
          ...deterministicFailures.filter(
            deterministic =>
              !judge.data.criticalFails.some(
                reported => reported.code === deterministic.code
              )
          ),
        ].slice(0, 8),
        evaluationWarnings: [
          ...(evaluationCall.normalizationWarnings ?? []),
          ...judge.warnings,
        ],
      });
      evaluationsCompleted += 1;
      lastReport = report;
      const candidate = {
        draft: mergedRevision.draft,
        report,
        round,
        fingerprint: fingerprintDraftQualityQcCandidate(mergedRevision.draft),
      };
      const isBetter = compareDraftQualityQcCandidates(best, candidate) > 0;
      // Every scored revision is an independently selectable Draft. The best
      // pointer still controls the automatic path, but a lower-scoring round
      // must not lose its full content while its score remains visible.
      let candidateArtifact: VerticalDramaDraftVersionRef | undefined;
      if (input.draftId && input.draftSessionId) {
        candidateArtifact = await persistVersion({
          tenantId: input.tenantId ?? "unknown",
          userId: input.userId,
          draftId: input.draftId,
          draftSessionId: input.draftSessionId,
          stage: "qc-revision",
          content: candidate.draft,
          runId: input.runId,
          changedPaths: [
            ...new Set([...changedFields, ...mergedRevision.restoredPaths]),
          ],
          metadata: {
            round,
            report,
            candidateFingerprint: candidate.fingerprint,
            candidateRound: round,
            kept: isBetter,
            restoredPaths: mergedRevision.restoredPaths,
          },
        });
      }
      history.push({
        round,
        score: report.overallScore,
        status: report.status,
        kept: isBetter,
        reason: report.pass ? "passed" : isBetter ? "improved" : "not_better",
        candidateVersion: candidateArtifact?.version,
        candidateFingerprint: candidate.fingerprint,
        report,
        note:
          [
          ...(revisedCall.normalizationWarnings ?? []),
          ...(mergedRevision.restoredPaths.length > 0
            ? [
                `Additive merge restored omitted fields: ${mergedRevision.restoredPaths
                  .slice(0, 8)
                  .join(", ")}`,
              ]
            : []),
        ].join(" ") || undefined,
      });
      if (isBetter) {
        best = candidate;
        consecutiveNoImprovement = 0;
        if (candidateArtifact) latestArtifact = candidateArtifact;
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
          history,
          creditEstimate: { ...creditEstimate, actualCredits },
          roundsAttempted,
          evaluationsCompleted,
          model: activeModel,
        },
      });
    }
    if (reservation) {
      await refundUnused(reservation.reservationId);
      reservationClosed = true;
    }
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
      model: activeModel,
      reservationId: reservation?.reservationId,
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
      creditEstimate: { ...creditEstimate, actualCredits },
    });
  } finally {
    if (reservation && !reservationClosed) {
      await refundUnused(reservation.reservationId, true).catch(() => undefined);
    }
  }
}

export interface DraftQualityQcRepairInput {
  draft: DraftQualityQcDraft;
  sourceReport: DraftQualityQcReport;
  sourceVersion?: number;
  sourceFingerprint: string;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  userId: number;
  tenantId?: string;
  seriesId?: number;
  draftId?: string;
  draftSessionId?: string;
  runId?: string;
  isCancelled?: () => Promise<boolean>;
  onProgress?: (event: DraftQualityQcProgressEvent) => void;
}

/**
 * Execute one explicit, user-confirmed repair against an already evaluated
 * candidate. The source score is included only for comparison; the repaired
 * candidate receives a new evaluate call and a new immutable ledger version.
 */
export async function runVerticalDramaDraftQualityQcRepair(
  input: DraftQualityQcRepairInput,
  dependencies: DraftQualityQcDependencies = {}
): Promise<
  DraftQualityQcLoopResult & {
    repaired: DraftQualityQcCandidateResult;
    improved: boolean;
  }
> {
  assertBoundedDraft(input.draft);
  if (
    fingerprintDraftQualityQcCandidate(input.draft) !== input.sourceFingerprint
  ) {
    throw new Error("Draft QC repair source fingerprint is stale");
  }
  let activeModel =
    dependencies.model ?? (await resolveVerticalDramaRecommendedDraftModel());
  const perCallCredits = calculateCreditsForLLM(6000, 7000, activeModel);
  const creditEstimate = estimateDraftQualityQcCredits({
    maxImprovementRounds: 1,
    perCallCredits,
  });
  const logicalRunKey = `vd-draft-qc-repair:${input.runId ?? input.draftSessionId ?? input.draftId ?? input.sourceFingerprint}`;
  const createReservation =
    dependencies.createReservation ??
    (() =>
      createCreditReservation(
        input.userId,
        DEFAULT_TENANT_SKILL_CREDITS,
        "skill",
        {
          feature: "vertical_drama_draft_quality_qc_repair",
          tenantId: input.tenantId,
          sourceFingerprint: input.sourceFingerprint,
          skillName: VERTICAL_DRAMA_DRAFT_QC_SKILL_NAME,
          model: activeModel,
          llmModel: activeModel,
          logicalRunKey,
        },
        logicalRunKey,
        {
          tenantId: input.tenantId,
          skillSlug: VERTICAL_DRAMA_DRAFT_QC_SKILL_SLUG,
          skillRunId: logicalRunKey,
          description: `Skill run: ${VERTICAL_DRAMA_DRAFT_QC_SKILL_NAME} (repair)`,
        },
      ));
  const drawReservation =
    dependencies.drawReservation ??
    ((reservationId, amount) => drawFromReservation(reservationId, amount));
  const refundUnused =
    dependencies.refundReservation ??
    ((reservationId, forceFixedSkillRefund = false) =>
      refundReservation(reservationId, forceFixedSkillRefund));
  const persistVersion =
    dependencies.persistVersion ?? appendVerticalDramaDraftVersion;
  const reservation = dependencies.createReservation
    ? await createReservation(DEFAULT_TENANT_SKILL_CREDITS)
    : undefined;
  const chargeLlmCall =
    dependencies.chargeLlmCall ?? chargeVerticalDramaLlmCall;
  const evaluate =
    dependencies.evaluate ??
    (params => defaultEvaluate({ ...params, model: activeModel }));
  const revise =
    dependencies.revise ??
    (params => defaultRevise({ ...params, model: activeModel }));
  const now = dependencies.now ?? (() => new Date().toISOString());
  let callsDone = 0;
  let actualCredits = 0;
  let fixedReservationConsumed = false;
  let reservationClosed = false;
  let phase: DraftQualityQcFailurePhase = "revise";
  const source: DraftQualityQcCandidateResult = {
    draft: input.draft,
    report: input.sourceReport,
    round: 0,
    fingerprint: input.sourceFingerprint,
  };
  const history: DraftQualityQcHistoryEntry[] = [
    {
      round: 0,
      score: input.sourceReport.overallScore,
      status: input.sourceReport.status,
      kept: true,
      reason: "baseline",
      candidateVersion: input.sourceVersion,
      candidateFingerprint: input.sourceFingerprint,
      report: input.sourceReport,
    },
  ];
  const progress = (
    phase: DraftQualityQcProgressEvent["phase"],
    round: number,
    score: number | null
  ) =>
    input.onProgress?.({
      phase,
      round,
      maxRounds: 1,
      callsDone,
      callsMax: creditEstimate.maxCalls,
      lastScore: score,
    });
  const drawActual = async (call: DraftQualityQcCallResult) => {
    const callNumber = callsDone + 1;
    const stage = phase;
    const amount = calculateCreditsForLLM(
      call.promptTokens,
      call.completionTokens,
      call.model ?? activeModel
    );
    let chargedAmount = amount;
    if (reservation) {
      if (!fixedReservationConsumed) {
        await drawReservation(
          reservation.reservationId,
          reservation.reservedAmount
        );
        fixedReservationConsumed = true;
      }
    } else {
      const charge = await chargeLlmCall({
        userId: input.userId,
        tenantId: input.tenantId,
        seriesId: input.seriesId,
        runId: logicalRunKey,
        attemptKey: `${logicalRunKey}:${stage}:round-1:call-${callNumber}`,
        skillSlug: VERTICAL_DRAMA_DRAFT_QC_SKILL_SLUG,
        stage,
        round: 1,
        attempt: callNumber,
        model: call.model ?? activeModel,
        inputTokens: call.promptTokens,
        outputTokens: call.completionTokens,
        metadata: {
          skillName: VERTICAL_DRAMA_DRAFT_QC_SKILL_NAME,
          operation: "repair",
          draftId: input.draftId ?? null,
          draftSessionId: input.draftSessionId ?? null,
          sourceFingerprint: input.sourceFingerprint,
        },
      });
      chargedAmount = charge.creditsUsed;
    }
    actualCredits += reservation ? amount : chargedAmount;
    if (call.model) activeModel = call.model;
    callsDone += 1;
  };

  try {
    if (await input.isCancelled?.())
      throw new Error("Draft QC repair cancelled");
    progress("revise", 1, input.sourceReport.overallScore);
    const revisedCall = await revise({
      draft: input.draft,
      report: input.sourceReport,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(revisedCall);
    const parsedRevisionResult = revisedDraftOutputSchema.safeParse(
      revisedCall.data
    );
    const recoveredRevision = parsedRevisionResult.success
      ? { data: parsedRevisionResult.data, warnings: [] as string[] }
      : recoverDraftQualityQcRevisionOutput(revisedCall.data, input.draft);
    if (!recoveredRevision) {
      throw new Error(
        `Vertical Drama draft QC repair response failed schema validation: ${parsedRevisionResult.success ? "response" : parsedRevisionResult.error.issues.map(issue => issue.path.join(".") || "response").join(", ")}`
      );
    }
    const providerRevisionDraft = stripServerManagedStoryDesignMetadata(
      recoveredRevision.data.draft
    );
    const mergedRevision = mergeDraftRevisionPreservingFields(
      input.draft,
      providerRevisionDraft
    );
    mergedRevision.draft = repairStoryControlPlaneForQc(
      mergedRevision.draft,
      input.immutableConstraints
    );
    assertBoundedDraft(mergedRevision.draft);
    assertImmutableConstraints(
      input.draft,
      mergedRevision.draft,
      input.immutableConstraints
    );
    assertMutableStoryDesignContract(
      input.draft,
      mergedRevision.draft,
      input.immutableConstraints
    );
    const completion = inspectVerticalDramaDraftCompleteness({
      draft: mergedRevision.draft,
      targetEpisodeCount: input.immutableConstraints.targetEpisodeCount,
      genre: input.immutableConstraints.genre,
      userPremise: input.immutableConstraints.userPremise,
    });
    if (!completion.ready) {
      throw new Error(
        `Draft QC repair produced an incomplete Draft: ${completion.report.missingPaths.slice(0, 6).join(", ") || completion.report.contradictionPaths.slice(0, 6).join(", ") || "unknown completeness failure"}`
      );
    }

    phase = "evaluate";
    progress("evaluate", 1, input.sourceReport.overallScore);
    const evaluationCall = await evaluate({
      draft: mergedRevision.draft,
      immutableConstraints: input.immutableConstraints,
      userId: input.userId,
    });
    await drawActual(evaluationCall);
    const judge = normalizeDraftQualityQcJudgeOutput(evaluationCall.data);
    if (!judge.ok) {
      throw new Error(
        formatDraftQualityQcJudgeNormalizationError(evaluationCall.data)
      );
    }
    const deterministicFailures = verifyDraftQualityQcCriticalFailures({
      draft: mergedRevision.draft,
      constraints: input.immutableConstraints,
      enforceCompleteness: true,
    });
    const report = computeDraftQualityQcReport(judge.data, now(), {
      criticalFails: [
        ...judge.data.criticalFails,
        ...deterministicFailures.filter(
          deterministic =>
            !judge.data.criticalFails.some(
              reported => reported.code === deterministic.code
            )
        ),
      ].slice(0, 8),
      evaluationWarnings: [
        ...(evaluationCall.normalizationWarnings ?? []),
        ...judge.warnings,
        ...recoveredRevision.warnings,
      ],
    });
    const repaired: DraftQualityQcCandidateResult = {
      draft: mergedRevision.draft,
      report,
      round: 1,
      fingerprint: fingerprintDraftQualityQcCandidate(mergedRevision.draft),
    };
    const improved = compareDraftQualityQcCandidates(source, repaired) > 0;
    const artifact =
      input.draftId && input.draftSessionId
        ? await persistVersion({
            tenantId: input.tenantId ?? "unknown",
            userId: input.userId,
            draftId: input.draftId,
            draftSessionId: input.draftSessionId,
            stage: "qc-revision",
            content: repaired.draft,
            parentVersion: input.sourceVersion,
            runId: input.runId,
            changedPaths: [
              ...new Set([
                ...normalizeChangedFields(recoveredRevision.data.changedFields),
                ...mergedRevision.restoredPaths,
              ]),
            ],
            metadata: {
              operation: "user_confirmed_repair",
              sourceVersion: input.sourceVersion,
              sourceFingerprint: input.sourceFingerprint,
              report: repaired.report,
              candidateFingerprint: repaired.fingerprint,
              improved,
            },
          })
        : undefined;
    history.push({
      round: 1,
      score: repaired.report.overallScore,
      status: repaired.report.status,
      kept: improved,
      reason: repaired.report.pass
        ? "passed"
        : improved
          ? "improved"
          : "not_better",
      candidateVersion: artifact?.version,
      candidateFingerprint: repaired.fingerprint,
      report: repaired.report,
      note:
        [
        ...recoveredRevision.warnings,
        ...(mergedRevision.restoredPaths.length
            ? [
                `Additive merge restored omitted fields: ${mergedRevision.restoredPaths.slice(0, 8).join(", ")}`,
              ]
          : []),
      ].join(" ") || undefined,
    });
    const creditResult = { ...creditEstimate, actualCredits };
    if (reservation) {
      await refundUnused(reservation.reservationId);
      reservationClosed = true;
    }
    return {
      best: improved ? repaired : source,
      history,
      creditEstimate: creditResult,
      stopReason:
        improved && repaired.report.pass
          ? "passed"
          : improved
            ? "max_rounds"
            : "no_improvement",
      roundsAttempted: 1,
      evaluationsCompleted: 1,
      model: activeModel,
      reservationId: reservation?.reservationId,
      draftArtifact: artifact,
      repaired,
      improved,
    };
  } finally {
    if (reservation && !reservationClosed) {
      await refundUnused(reservation.reservationId, true).catch(() => undefined);
    }
  }
}
