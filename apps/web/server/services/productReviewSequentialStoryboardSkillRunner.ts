/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 04 §5. Tier-1 execution engine for the
 * `product-review-sequential-storyboard` skill (section 03): invokes the
 * skill with a complete runtime contract, orchestrates up to 3 TS-driven
 * review rounds with per-round persistence and mid-loop resume, retains the
 * best version, records candidates, runs a deterministic TS preflight over
 * the returned 9-shot pack, routes over-budget prompts through the optimizer
 * skill (never mechanical truncation), and degrades to deterministic
 * per-shot prompts when the skill fails structurally.
 *
 * Clones the shape of `productReferenceStoryboardSkillRunner.ts`'s
 * `runProductReferenceStoryboardPromptSkill` (sync -> load -> input-schema
 * audit hard-fail BEFORE any spend -> policy -> provider ->
 * `executeSharedSkillTextRuntime` with a `legacyExecute` closure), but the
 * loop itself follows the injectable-effects DI shape of
 * `videoProjectQualityLoop.ts` (a pure orchestrator; every side effect is
 * injected via the `effects` parameter, production defaults wired in this
 * same file).
 *
 * Skill-first (spec §5.1, repo rule `feedback_skill_first_authoring`): every
 * creative judgment (what a round evaluates/rewrites, scoring, dialogue,
 * prompt authoring, pivot wording) lives in the skill body (section 03).
 * This module computes facts and enforces machine-checkable contracts only
 * — budgets, counts, markers, regex backstops, ordering.
 *
 * This module is dead code until a run's `frameStrategy` is
 * `sequential_shot_storyboard` (FORBIDDEN-gated by section 01). It has no
 * import relationship with `marketplaceAutoReviewService.ts` in either
 * direction at the type level beyond what SVC imports FROM here (SVC already
 * imports the sibling `productReferenceStoryboardSkillRunner.ts`, so this
 * module must never import SVC to avoid a cycle) — section 05/06 (living in
 * SVC) call `runProductReviewSequentialStoryboardSkillLoop` and own the
 * `metadataJson.sequentialStoryboard.*` persistence + stage wiring.
 */
import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { nanoid } from "nanoid";

import type { Message } from "../_core/llm";
import { calculateCreditsForLLMDynamic, deductCredits } from "./creditService";
import {
  buildRuntimeModelConfig,
  executeSharedSkillTextRuntime,
} from "./agentRuntime/skillRuntimeOrchestrator";
import { executeWithFallback, getProviderForModel } from "./llmRouter";
import {
  executeSkillLlmWithFallback,
  type SkillLlmRequest,
} from "./skillModelFallback";
import {
  isDefinitiveVisionCapabilityError,
  recordModelVisionCapabilityFailure,
} from "./modelVisionCapabilityBreaker";
import {
  getSkillByIdAsync,
  syncSingleSkillIfChanged,
  type SkillDefinition,
} from "./skillRegistry";
import { buildCustomSkillUserPrompt } from "./skillExecutionPromptBuilder";
import {
  resolveSkillExecutionPolicy,
  type SkillExecutionPolicyResult,
} from "./skillExecutionPolicy";
import { optimizeProductReferenceStoryboardPrompt } from "./productReferenceStoryboardSkillRunner";
import { resolveExternalMediaReferenceUrls } from "./mediaGenerationService";
import { appendProductReferenceStoryboardCategoryRules } from "./productReferenceStoryboardCategoryRules";
import { extractJson } from "./verticalDramaStoryBible";
import {
  buildReferenceIndexMappingCorrectionDirective,
  findReferenceIndexMappingMismatches,
  type ReferenceIndexEntry,
  type ReferenceIndexMappingMismatch,
} from "../../shared/marketplaceCapture/referenceIndexMap";
import {
  buildAutoReviewCreativePresetDirective,
  type AutoReviewCreativePresetSelection,
} from "../../shared/hyperframes/autoReviewCreativePresets";
import { buildSequentialLoopAuditEffect } from "./marketplaceAutoReviewObservability";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import { parseSkillFile } from "@smartspec/skills";
import {
  isRecommendedModelQualityStrikeStatus,
  recordRecommendedModelQualityStrike,
} from "./recommendedModelQualityBreaker";
import {
  resolveVerticalDramaImagePromptModeForImageModel,
  VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS,
  type MarketplaceStartFramePromptStyle,
  type SequentialStoryboardStartFramePromptEngine,
  type SequentialStoryboardVideoPromptEngine,
  type VerticalDramaImagePromptMode,
} from "../../shared/marketplaceCapture/startFramePromptStyle";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID =
  "product-review-sequential-storyboard";

/**
 * Base/default effective image-prompt budget (spec §13.3). SVC mirrors this
 * exact value into `MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_PROMPT_MAX_CHARS`
 * by IMPORTING this constant (the same pattern
 * `MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS` uses for
 * `PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS`) — never a second literal.
 */
export const PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS = 4000;

/** Spec §14.3 — identical to `MARKETPLACE_AUTO_REVIEW_VIDEO_PROMPT_MAX_CHARS` / `VD_VIDEO_PROMPT_MAX`. */
export const PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS = 2000;

/**
 * Frozen cross-section literal (section 03 §10 marker table, section 04 §6):
 * the exact opening sentence of the mandatory global video block every
 * compiled `video_prompt` must contain. Section 09 (video preflight) and
 * section 12 (observability gate) import this SAME constant — one string,
 * never re-typed elsewhere, or the skill body and every checker can drift
 * independently.
 */
export const SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER =
  "Use @Image1 as the absolute product identity reference";

const SEQUENTIAL_STORYBOARD_SHOT_COUNT = 9;
// Feature 136 section 09 (§5.4/§5.6) — exported so the video preflight
// submit-time backstop and the per-shot duration resolver (both SVC) single
// -source the [3, 10] bound with the pack preflight's own
// `shot_duration_exceeds_max` check above; never a second literal.
export const SEQUENTIAL_STORYBOARD_MAX_SHOT_DURATION_SECONDS = 10;
export const SEQUENTIAL_STORYBOARD_MIN_SHOT_DURATION_SECONDS = 3;
const SEQUENTIAL_STORYBOARD_DEFAULT_LOOP_ROUNDS = 3;
const SEQUENTIAL_STORYBOARD_DEFAULT_CANDIDATE_COUNT = 3;
const SEQUENTIAL_STORYBOARD_DEFAULT_MIN_SCORE_TO_PASS = 88;
/** Mirrors `MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS` (SVC). */
const SEQUENTIAL_STORYBOARD_OPTIMIZER_MAX_ATTEMPTS = 3;

const SEQUENTIAL_STORYBOARD_SCORE_DIMENSIONS = [
  "evidence_accuracy",
  "product_consistency",
  "narrative_quality",
  "dialogue_continuity",
  "visual_feasibility",
  "compliance_safety",
  "prompt_completeness",
  "length_compliance",
] as const;

const SEQUENTIAL_CLAIM_CONFIDENCE_LEVELS = new Set([
  "visual_verified",
  "text_verified",
  "user_confirmed",
  "conditional",
  "unsupported",
  "conflicting",
]);

/**
 * Weak-model enum drift guard (same failure class as the VD role_tier drift):
 * a cheap model emits `"visual-verified"`, `"Verified (visual)"`,
 * `"confirmed"`, … and the strict Set check disqualified an otherwise
 * perfect pack (`invalid_claim_confidence` — field evidence 2026-07-23: a
 * round scoring 10/10 on every dimension was thrown away over one enum
 * spelling). Normalize at the parse layer; anything unrecognizable maps to
 * "conditional" — the SAFE direction (the claim stays out of the
 * unconditional whitelist) — instead of nuking the whole pack.
 */
export function normalizeSequentialClaimSupport(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");
  if (SEQUENTIAL_CLAIM_CONFIDENCE_LEVELS.has(raw)) return raw;
  if (/visual/.test(raw) && /verif/.test(raw)) return "visual_verified";
  if (/text/.test(raw) && /verif/.test(raw)) return "text_verified";
  if (/user/.test(raw) && /confirm/.test(raw)) return "user_confirmed";
  if (/conflict/.test(raw)) return "conflicting";
  if (/unsupport|no_evidence|none/.test(raw)) return "unsupported";
  return "conditional";
}

const SEQUENTIAL_STORYBOARD_FINAL_QC_KEYS = [
  "all_claims_supported",
  "all_shots_under_10_seconds",
  "hook_within_3_seconds",
  "price_absent",
  "overclaims_absent",
  "all_image_prompts_within_budget",
  "all_video_prompts_within_budget",
  "global_block_present_in_every_video_prompt",
  "guardian_policy_satisfied",
  // Settings-adherence QC (2026-07-23, user-reported "ตั้งค่าแล้วเนื้อหาไม่ตรง"):
  // tone/structure directives were TAUGHT in the prompt but never VERIFIED,
  // so drafts that ignored them passed finalQc (the taught-not-wired class).
  // The CRITERIA for these two keys live in skill.md Phase K — TypeScript
  // only enforces that the skill self-verified them.
  "tone_preset_adhered",
  "structure_beats_present",
] as const;

/**
 * Deterministic Thai+numeric price backstop (spec §12.5). Detection is
 * deterministic; the REWRITE is always the skill's job. Section 09 imports
 * this SAME function for the video preflight — a re-implementation would let
 * a price token pass one surface and fail the other.
 */
const SEQUENTIAL_PRICE_CLAIM_PATTERNS: RegExp[] = [
  /ราคา/, // "price" (covers "ราคาถูกที่สุด" etc.)
  /บาท/, // "baht" (currency word)
  /฿/, // baht symbol, incl. numeric forms like "฿199"
  /ลด\s?\d+\s?%/, // "ลด 50%"
  /ลดราคา/,
  /โปรโมชั่น|โปรโมชัน/,
  /ส่งฟรี|ฟรีค่าส่ง/,
  /flash\s*sale/i,
  /voucher|คูปอง/i,
  /\$\s?\d+(?:\.\d+)?/, // numeric $ price
];

export function detectSequentialPromptPriceClaims(text: string): boolean {
  const value = String(text ?? "");
  if (!value.trim()) return false;
  return SEQUENTIAL_PRICE_CLAIM_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Thai speech-rate estimator (spec §12.3). This is a deliberate CLONE (not an
 * import) of `shared/verticalDramaSeries/dialogueQuality.ts`'s
 * `estimateVerticalDramaSpeechSeconds` — same canonical rate
 * (`THAI_CHARS_PER_SECOND = 17`), copied per repo policy
 * (`project_vd_extension_speaking_time`): reuse the tiny heuristic with
 * attribution, do not import VD internals into a non-VD feature.
 */
const SEQUENTIAL_THAI_CHAR_PATTERN = /[฀-๿]/g;
const SEQUENTIAL_WORD_PATTERN = /[A-Za-z0-9]+|[฀-๿]/g;
const SEQUENTIAL_THAI_CHARS_PER_SECOND = 17;
const SEQUENTIAL_NON_THAI_WORDS_PER_SECOND = 2.7;
const SEQUENTIAL_MIN_DIALOGUE_SECONDS_PER_LINE = 0.75;

export function estimateSequentialStoryboardSpeechSeconds(text: string): number {
  const normalized = String(text ?? "")
    .replace(/[""'']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return 0;
  const thaiChars = normalized.match(SEQUENTIAL_THAI_CHAR_PATTERN)?.length ?? 0;
  if (thaiChars > 0) {
    return Math.max(
      SEQUENTIAL_MIN_DIALOGUE_SECONDS_PER_LINE,
      thaiChars / SEQUENTIAL_THAI_CHARS_PER_SECOND
    );
  }
  const words = normalized.match(SEQUENTIAL_WORD_PATTERN)?.length ?? 0;
  return Math.max(
    SEQUENTIAL_MIN_DIALOGUE_SECONDS_PER_LINE,
    words / SEQUENTIAL_NON_THAI_WORDS_PER_SECOND
  );
}

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type SequentialReferenceManifestEntry = {
  index: number;
  role: string;
  angleLabel?: string;
  url: string;
  evidenceOnly?: boolean;
  /* Cast identity for `role === "character"` entries
     (`planning/marketplace-four-character-cast/plan.md` §5). The skill used to
     receive `role`/`angleLabel` only, so with more than one character it could
     not tell who `@Image2..@Image5` were. All four are FACTS — who is in the
     frame, what they are called, whether they are a lead or supporting, and
     whether they are a minor — never creative direction. */
  characterName?: string;
  characterRole?: string;
  variantLabel?: string;
  depictsMinor?: boolean;
};

export type ChildSubjectPolicyInput = {
  productChildRelated: boolean;
  childDepictionPlanned?: boolean;
  guardianReferenceIndex?: number | null;
};

export type SequentialStoryboardLanguage = "th" | "en";

export type SequentialStoryboardLanguagePlan = {
  summaryLanguage: SequentialStoryboardLanguage;
  dialogueLanguage: SequentialStoryboardLanguage;
  promptLanguage: SequentialStoryboardLanguage;
};

/** Runtime-contract-only subset (pure, T3-testable without the full loop input). */
export type SequentialStoryboardRuntimeContractInput = {
  imageBudget: number;
  referenceManifest: readonly SequentialReferenceManifestEntry[];
  productTruthText?: string | null;
  blockedClaims?: readonly string[] | null;
  forbiddenClaims?: readonly string[] | null;
  confirmedAttributes?: Record<string, string> | null;
  childSubjectPolicy: ChildSubjectPolicyInput;
  targetAudience?: string | null;
  userRequirements?: string | null;
  audioStrategy?: string | null;
  reviewTone?: string | null;
  videoStructureMode?: string | null;
  motionDirection?: string | null;
  creativePresetSelections?: readonly AutoReviewCreativePresetSelection[] | null;
  videoModel?: string | null;
  /**
   * Feature 136 section 07 (§3.4) — the shared evidence-guard package's
   * directive TEXT (already built by SVC via `buildGuardianPresenceDirective`
   * / `buildDemonstrationEvidenceDirective`, marker prefixes `GUARDIAN
   * PRESENCE LOCK:` / `DEMONSTRATION EVIDENCE LOCK:`). This module never
   * computes the guard context itself (SVC-side concern, no import cycle);
   * it only appends whatever it is given. Absent/"" ⇒ no lines added
   * (byte-identical contract with the guard off).
   */
  guardianPresenceDirective?: string | null;
  demonstrationEvidenceDirective?: string | null;
  /**
   * Free-text per-shot instruction supplied by the user for AI-assisted
   * prompt adjustment (e.g. "there's an 8-month-old baby in the scene"),
   * distinct from the base story/dialogue content. Appended verbatim as its
   * own clearly-delimited section, same conditional-append pattern as the
   * guard directives above: absent/"" ⇒ no lines added.
   */
  userInstruction?: string | null;
  summaryLanguage?: SequentialStoryboardLanguage | null;
  dialogueLanguage?: SequentialStoryboardLanguage | null;
  promptLanguage?: SequentialStoryboardLanguage | null;
};

export type SequentialStoryboardSkillLoopInput = {
  tenantId: string;
  userId: number;
  runId?: string | null;
  model?: string | null;
  publicUrl?: string | null;
  originSurface?: "marketplace_capture" | "media_studio" | null;
  /**
   * Plan-review redraft generation (planReview.redraftCount). The per-round
   * credit idempotency key is ONLY unique per (runId, round) — a redraft
   * re-runs the same rounds for the same run, so without this the ledger
   * insert hits a duplicate-key error and the whole round is miscounted as
   * `invocation_failed` → guaranteed degraded fallback on EVERY redraft
   * (2026-07-23 field evidence). 0/absent keeps the legacy key byte-identical
   * so resume of pre-gate runs stays idempotent.
   */
  chargeGeneration?: number | null;

  productName: string;
  productDescription: string;
  productSpecs: string;
  productTruthText?: string | null;
  referenceManifest: SequentialReferenceManifestEntry[];
  /** ALL resolvable product refs incl. evidence-only (section 02 `skillVisionUrls`). */
  skillVisionUrls: string[];

  /** `sequentialImagePromptMaxChars` override (section 01, bounded 1000-4000). */
  imageBudgetOverride?: number | null;
  providerMaxPromptLength?: number | null;

  reviewTone?: string | null;
  creativePresetSelections?: AutoReviewCreativePresetSelection[] | null;
  videoModel?: string | null;
  /**
   * Feature 136 section 13 (§4 deliverable 2/3) — the run's selected image
   * model (SVC's `metadata.imageModel`), needed ONLY to classify which VD
   * image-prompt engine mode (`policy_safe_rewrite` vs `cinematic_narrative`)
   * applies when `startFramePromptStyle === "cinematic_auto"`. Absent/`null`
   * is harmless: the classifier fails open to `cinematic_narrative`.
   */
  imageModel?: string | null;
  /**
   * Feature 136 section 13 (§3) — the optional cinematic-prompt style layer.
   * Absent or `"evidence_product"` (the default) keeps today's inline Phase
   * F/G wording byte-identical; the cinematic engine is never loaded.
   */
  startFramePromptStyle?: MarketplaceStartFramePromptStyle | null;
  videoStructureMode?: string | null;
  motionDirection?: string | null;
  targetAudience?: string | null;
  userRequirements?: string | null;
  forbiddenClaims?: string[] | null;
  confirmedAttributes?: Record<string, string> | null;
  blockedClaims?: string[] | null;

  childSubjectPolicy: ChildSubjectPolicyInput;
  characterMode?: string | null;
  characterPresenceMode?: string | null;
  audioStrategy?:
    | "auto"
    | "native_video_audio"
    | "separate_tts_voiceover"
    | "silent"
    | null;
  platformConstraints?: string | null;
  /**
   * Feature 136 section 05 (G7 fix): the concrete `product-reference-storyboard`
   * category id (e.g. `"furniture"`, `"mother_baby"`) inferred by SVC's
   * `inferProductReferenceStoryboardCategory` (SVC-private — this module
   * must never import SVC, so SVC computes the STRING and passes it here).
   * `"auto"` / unrecognized / absent ⇒ no category rules appended (matches
   * the 3x3 skill's own `missing_category` no-op behavior).
   */
  productCategory?: string | null;
  /** Feature 136 section 07 (§3.4) — see `SequentialStoryboardRuntimeContractInput`. */
  guardianPresenceDirective?: string | null;
  demonstrationEvidenceDirective?: string | null;
  summaryLanguage?: SequentialStoryboardLanguage | null;
  dialogueLanguage?: SequentialStoryboardLanguage | null;
  promptLanguage?: SequentialStoryboardLanguage | null;
};

export type SequentialStoryboardClaimTraceEntry = {
  text: string;
  support: string;
};

export type SequentialStoryboardShot = {
  shot_id: number;
  purpose?: string;
  duration_seconds: number;
  demonstration_type:
    | "finished_product_showcase"
    | "usage_demo"
    | "feature_closeup"
    | "benefit_narration"
    | "problem_solution"
    | "assembly_demo";
  depicts_minor: boolean;
  guardian_required: boolean;
  transition_from_previous?: string;
  visual_summary?: string;
  dialogue: string;
  estimated_speech_seconds?: number;
  start_frame_image_prompt: string;
  image_prompt_character_count?: number;
  video_prompt: string;
  video_prompt_character_count?: number;
  claim_trace: SequentialStoryboardClaimTraceEntry[];
  qc?: Record<string, unknown>;
  /**
   * Feature 136 section 13 (§4 deliverable 4) — which engine authored this
   * shot's wording. Stamped on EVERY sequential run regardless of
   * `startFramePromptStyle` (an `evidence_product` run stamps
   * `"evidence_product"` too), so a UI badge / observability metric never
   * needs to special-case an absent stamp.
   */
  start_frame_prompt_engine?: SequentialStoryboardStartFramePromptEngine;
  video_prompt_engine?: SequentialStoryboardVideoPromptEngine;
  summary_language?: SequentialStoryboardLanguage;
  dialogue_language?: SequentialStoryboardLanguage;
  prompt_language?: SequentialStoryboardLanguage;
  camera_beats?: SequentialStoryboardCameraBeat[];
};

export type SequentialStoryboardCameraBeat = {
  beat_id: number;
  duration_seconds: number;
  camera: string;
  movement: string;
  action: string;
  transition?: string;
};

export type SequentialStoryboardProductReferenceModelConflict = {
  detected: boolean;
  conflicting_reference_indexes: number[];
  detail: string;
} | null;

export type SequentialStoryboardEvidenceProfile = {
  assembly_documented: boolean;
  assembly_evidence?: unknown[];
  /** REQUIRED-nullable per section 03 output schema; ABSENT (not merely
   *  `null`) is itself the `sequential_prompt_set_incomplete` blocker. */
  product_reference_model_conflict?: SequentialStoryboardProductReferenceModelConflict;
  [key: string]: unknown;
};

export type SequentialStoryboardLoopRoundScores = {
  evidence_accuracy: number;
  product_consistency: number;
  narrative_quality: number;
  dialogue_continuity: number;
  visual_feasibility: number;
  compliance_safety: number;
  prompt_completeness: number;
  length_compliance: number;
};

export type SequentialStoryboardLoopRoundCandidate =
  Partial<SequentialStoryboardLoopRoundScores> & {
    candidate_id?: string;
    selection_rationale?: string;
    [key: string]: unknown;
  };

export type SequentialStoryboardLoopRound =
  Partial<SequentialStoryboardLoopRoundScores> & {
    notes?: string;
    candidates?: SequentialStoryboardLoopRoundCandidate[];
    [key: string]: unknown;
  };

export type SequentialStoryboardLoopReport = {
  round_1?: SequentialStoryboardLoopRound;
  round_2?: SequentialStoryboardLoopRound;
  round_3?: SequentialStoryboardLoopRound;
  selected_version: string;
};

export type SequentialStoryboardFinalQc = Record<
  (typeof SEQUENTIAL_STORYBOARD_FINAL_QC_KEYS)[number],
  boolean
>;

export type SequentialStoryboardPack = {
  skillVersion?: string;
  evidenceProfile: SequentialStoryboardEvidenceProfile;
  claimWhitelist?: unknown[];
  conflicts?: unknown[];
  reviewStrategy?: Record<string, unknown>;
  childSubjectPolicy?: Record<string, unknown>;
  globalContinuity?: Record<string, unknown>;
  shots: SequentialStoryboardShot[];
  loopReport: SequentialStoryboardLoopReport;
  finalQc: SequentialStoryboardFinalQc;
  referenceManifest?: SequentialReferenceManifestEntry[];
  languagePlan?: SequentialStoryboardLanguagePlan;
  [key: string]: unknown;
};

/** Whatever a single round invocation resolves to — structurally UNVERIFIED
 *  (may be missing required fields; see `validateSequentialStoryboardPackStructure`). */
export type SequentialStoryboardRoundOutput = Record<string, unknown>;

/**
 * Which model actually served each run's latest authoring round. The model
 * is resolved inside the invokeSkillRound closure while output validation
 * happens back in the loop — this map bridges the two WITHOUT changing the
 * round-output contract (which many test fixtures inject). Bounded: cleared
 * defensively if it ever grows past 1000 runs (long-lived process guard).
 * Test-injected invokeSkillRound never populates it ⇒ strike hooks no-op.
 */
const lastInvokedModelByRunKey = new Map<string, string>();

function rememberInvokedModelForRun(runId: string | null | undefined, modelId: string) {
  if (lastInvokedModelByRunKey.size > 1000) lastInvokedModelByRunKey.clear();
  lastInvokedModelByRunKey.set(runId ?? "no-run", modelId);
}

/**
 * Test-only accessor (repo `...ForTest` convention) — proves which model
 * ACTUALLY produced a round's output (never merely the first one attempted)
 * reached the quality-breaker bridge. Never used by production code.
 */
export function peekLastInvokedModelForRunForTest(
  runId: string | null | undefined
): string | undefined {
  return lastInvokedModelByRunKey.get(runId ?? "no-run");
}

export type LoopRoundReport = Partial<SequentialStoryboardLoopRoundScores> & {
  round: 1 | 2 | 3;
  candidates?: SequentialStoryboardLoopRoundCandidate[];
  truncatedCandidateCount?: number;
  totalScore: number;
  normalizedScore: number;
  valid: boolean;
  disqualifiers: string[];
  retained: boolean;
  [key: string]: unknown;
};

export type PersistedLoopState = {
  roundsCompleted: number;
  retained: SequentialStoryboardPack | null;
  retainedScoreTotal?: number;
  selectedVersion?: string;
  loopReport?: Partial<Record<"round_1" | "round_2" | "round_3", LoopRoundReport>>;
  retryHistory?: Array<Record<string, unknown>>;
};

export type SequentialStoryboardPreflightResult = {
  blockers: string[];
  warnings: string[];
  perShot: Record<number, string[]>;
};

export type SequentialStoryboardLoopEffects = {
  invokeSkillRound(args: {
    round: 1 | 2 | 3;
    roundContract: string;
    retained: SequentialStoryboardPack | null;
  }): Promise<SequentialStoryboardRoundOutput>;
  /** -> `metadataJson.sequentialStoryboard.loopReport.round_N` (section 05/06 bind the real writer). */
  persistRoundReport(round: number, report: LoopRoundReport): Promise<void>;
  /** Mid-loop resume (section 05/06 bind the real metadata reader). */
  loadPersistedLoopState(): Promise<PersistedLoopState | null>;
  optimizeFinalPrompt(args: {
    prompt: string;
    promptKind: "sequential_image" | "sequential_video";
    maxChars: number;
  }): Promise<{ prompt: string; audit: Record<string, unknown> | null }>;
  emitAudit(event: string, payload: Record<string, unknown>): Promise<void> | void;
};

export type SequentialStoryboardSkillLoopResult = {
  pack: SequentialStoryboardPack;
  loopReport: SequentialStoryboardLoopReport;
  selectedVersion: string;
  degraded: boolean;
  preflight: SequentialStoryboardPreflightResult;
  retryHistory: Array<Record<string, unknown>>;
};

/**
 * Typed error signaling structural failure survived every bounded attempt
 * (spec §5.10 / §9.5): the run must NOT die. The SVC-side integration
 * (section 05/06) catches this, builds a degraded deterministic pack via the
 * SVC helper (`buildDegradedSequentialStoryboardPack...ForTest`, this
 * section's SVC deliverable), and continues the run. This module has no
 * access to `AutoReviewPlan`/`buildShotFramePrompt` (SVC-private), so it
 * cannot assemble the degraded pack itself.
 */
export class SequentialStoryboardStructuralError extends Error {
  readonly retryHistory: Array<Record<string, unknown>>;
  constructor(message: string, retryHistory: Array<Record<string, unknown>>) {
    super(message);
    this.name = "SequentialStoryboardStructuralError";
    this.retryHistory = retryHistory;
  }
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Effective image budget = min(overrideMaxChars ?? 4000, provider maxPromptLength). */
export function resolveSequentialImagePromptBudget(input: {
  overrideMaxChars?: number | null;
  providerMaxPromptLength?: number | null;
}): number {
  const rawOverride =
    typeof input.overrideMaxChars === "number" &&
    Number.isFinite(input.overrideMaxChars) &&
    input.overrideMaxChars > 0
      ? Math.floor(input.overrideMaxChars)
      : PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS;
  const base = Math.min(
    rawOverride,
    PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS
  );
  const providerCap =
    typeof input.providerMaxPromptLength === "number" &&
    Number.isFinite(input.providerMaxPromptLength) &&
    input.providerMaxPromptLength > 0
      ? Math.floor(input.providerMaxPromptLength)
      : null;
  return providerCap != null ? Math.min(base, providerCap) : base;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

/**
 * Skill config (spec §5.4): `config.media_studio.marketplace_auto_review_sequential_storyboard`.
 * Missing config -> safe defaults (3/3/88); caps never raised above 3 by config.
 *
 * NOTE (verified 2026-07-22): `getSkillByIdAsync` / `getSkillRegistryAsync`
 * (`skillRegistry.ts`) round-trip skills through the DB via
 * `dbSkillToDefinition`, which does NOT map the `configJson` DB column back
 * onto `SkillDefinition.config` (that field is populated only at PARSE time,
 * `skillRegistry.ts:450/495/614/657` write `configJson: metadata.config` to
 * the DB but nothing reads it back into `.config` on the read path). So
 * `skill.config` is `undefined` for every skill fetched via the registry
 * today. This function already defends against that (falls back to 3/3/88
 * exactly as the spec's own "missing config" clause anticipates) and will
 * pick up real values automatically once that registry gap is fixed
 * elsewhere — see the implementation notes returned alongside this section.
 */
function resolveSequentialStoryboardSkillConfig(skill: SkillDefinition): {
  loopRounds: number;
  candidateCount: number;
  minPromptScoreToPass: number;
} {
  const configRoot = (skill as unknown as { config?: Record<string, unknown> }).config;
  const mediaStudio =
    configRoot && typeof configRoot === "object"
      ? (configRoot as Record<string, unknown>).media_studio
      : undefined;
  const cfg =
    mediaStudio && typeof mediaStudio === "object"
      ? ((mediaStudio as Record<string, unknown>)
          .marketplace_auto_review_sequential_storyboard as
          | Record<string, unknown>
          | undefined)
      : undefined;
  return {
    loopRounds: clampInt(
      cfg?.loop_rounds,
      1,
      SEQUENTIAL_STORYBOARD_DEFAULT_LOOP_ROUNDS,
      SEQUENTIAL_STORYBOARD_DEFAULT_LOOP_ROUNDS
    ),
    candidateCount: clampInt(
      cfg?.candidate_count,
      0,
      SEQUENTIAL_STORYBOARD_DEFAULT_CANDIDATE_COUNT,
      SEQUENTIAL_STORYBOARD_DEFAULT_CANDIDATE_COUNT
    ),
    minPromptScoreToPass: clampNum(
      cfg?.min_prompt_score_to_pass,
      0,
      100,
      SEQUENTIAL_STORYBOARD_DEFAULT_MIN_SCORE_TO_PASS
    ),
  };
}

const PRESET_FAMILY_TO_INPUT_FIELD: Record<string, string> = {
  tone_preset: "tone_preset",
  story_arc_preset: "story_arc_preset",
  pacing_preset: "pacing_preset",
  camera_motion_preset: "camera_motion_preset",
  visual_style_preset: "visual_style_preset",
  audio_preset: "audio_preset",
  platform_preset: "platform_preset",
  segment_structure_preset: "segment_structure_preset",
};

function collectPresetInputFields(
  selections?: readonly AutoReviewCreativePresetSelection[] | null
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const selection of selections ?? []) {
    const field = PRESET_FAMILY_TO_INPUT_FIELD[selection.family];
    if (field) result[field] = selection.presetId;
  }
  return result;
}

/**
 * Deterministic, enumerable runtime-contract lines (spec §5.2) appended to
 * the skill body every invocation. Every item here is testable by string
 * containment (section 04 §4 T3). Rule text/judgment stays in the skill
 * body; this carries facts and budgets only.
 */
export function buildSequentialStoryboardRuntimeContract(
  input: SequentialStoryboardRuntimeContractInput
): string {
  const lines: string[] = [];
  lines.push(
    "## Marketplace Auto Review — Sequential Storyboard Runtime Contract"
  );
  lines.push(
    `image_prompt_max_characters (effective budget): ${input.imageBudget}`
  );
  lines.push(
    `video_prompt_max_characters (budget): ${PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS}`
  );
  lines.push(`shot_count: ${SEQUENTIAL_STORYBOARD_SHOT_COUNT}`);
  lines.push(
    `max_shot_duration_seconds: ${SEQUENTIAL_STORYBOARD_MAX_SHOT_DURATION_SECONDS}`
  );
  lines.push("platform: 9:16 vertical");
  lines.push(`target_audience: ${input.targetAudience || "(not specified)"}`);
  lines.push(`user_requirements: ${input.userRequirements || "(none)"}`);
  lines.push(`audio_strategy (resolved): ${input.audioStrategy || "auto"}`);
  lines.push(`review_tone: ${input.reviewTone || "(default)"}`);
  lines.push(
    `video_structure_mode: ${input.videoStructureMode || "per_shot"}`
  );
  lines.push(
    `summary_language (selected): ${input.summaryLanguage || "th"}`
  );
  lines.push(
    `dialogue_language (selected): ${input.dialogueLanguage || "th"}`
  );
  lines.push(`prompt_language (selected): ${input.promptLanguage || "en"}`);
  lines.push(
    "LANGUAGE SEPARATION LOCK: write visual_summary in summary_language, dialogue in dialogue_language, and start_frame_image_prompt/video_prompt in prompt_language. Never silently substitute one selected language for another."
  );

  lines.push("## Reference Manifest (the ONLY valid @ImageN bindings)");
  for (const entry of input.referenceManifest) {
    const angle = entry.angleLabel ? `, angleLabel: ${entry.angleLabel}` : "";
    const evidenceOnly = entry.evidenceOnly
      ? " [evidenceOnly: analysis input only — NEVER attached to a provider, never cite as @ImageN]"
      : "";
    lines.push(`@Image${entry.index} = role: ${entry.role}${angle}${evidenceOnly}`);
  }

  lines.push("## Product Truth");
  lines.push(input.productTruthText || "(no additional product truth text supplied)");

  lines.push("## Claim Safety Inputs");
  lines.push(`blockedClaims: ${JSON.stringify(input.blockedClaims ?? [])}`);
  lines.push(`forbiddenClaims: ${JSON.stringify(input.forbiddenClaims ?? [])}`);
  lines.push(
    `confirmedAttributes: ${JSON.stringify(input.confirmedAttributes ?? {})}`
  );

  lines.push("## Child Subject Policy");
  lines.push(JSON.stringify(input.childSubjectPolicy));

  // Feature 136 section 07 (§3.4) — shared evidence-guard directive TEXT,
  // appended verbatim exactly once each when supplied (absent/"" ⇒ no new
  // lines, byte-identical contract with the guard off).
  if (input.guardianPresenceDirective) {
    lines.push("## Guardian Presence Directive");
    lines.push(input.guardianPresenceDirective);
  }
  if (input.demonstrationEvidenceDirective) {
    lines.push("## Demonstration Evidence Directive");
    lines.push(input.demonstrationEvidenceDirective);
  }
  // New capability — free-text per-shot instruction (see `userInstruction`
  // doc comment). Same conditional-append pattern as the two directives
  // above: absent/"" ⇒ no new lines, byte-identical contract without it.
  if (input.userInstruction) {
    lines.push("## User-Requested Adjustment");
    lines.push(input.userInstruction);
  }

  const presetDirective = buildAutoReviewCreativePresetDirective({
    selections: input.creativePresetSelections ?? undefined,
    videoModel: input.videoModel ?? null,
  });
  if (presetDirective) {
    lines.push("## Creative Preset Directive");
    lines.push(presetDirective);
  }

  lines.push("## Motion Direction (dual-injection mandatory)");
  if (input.motionDirection) {
    lines.push(
      `motion_direction: ${input.motionDirection}. This direction MUST shape the nine-shot story plan AND MUST appear in every submitted video prompt's action/camera language — never only one of the two.`
    );
  } else {
    lines.push("motion_direction: (none supplied).");
  }

  return lines.join("\n");
}

function buildSequentialStoryboardRoundFocus(round: 1 | 2 | 3): string {
  if (round === 1) {
    return (
      "ROUND 1 FOCUS (evidence & category alignment): re-verify every claim " +
      "against the evidence profile, confirm the narrative structure suits " +
      "the detected category, keep visible parts consistent with the " +
      "references, keep excluded conflicts excluded, remove any invented " +
      "feature, ensure every visual action demonstrates its spoken feature, " +
      "and confirm no shot stages undocumented assembly/disassembly."
    );
  }
  if (round === 2) {
    return (
      "ROUND 2 FOCUS (narrative, continuity, production feasibility): hook " +
      "lands within 3 seconds, dialogue flows continuously shot 1 to shot 9, " +
      "one point per shot, every shot at or under 10 seconds, spoken " +
      "dialogue fits its estimated speech rate, every start-frame image " +
      "prompt is a valid START state, camera moves stay feasible, and " +
      "character/product/wardrobe/room/lighting continuity holds."
    );
  }
  return (
    "ROUND 3 FOCUS (compliance, provider readiness, compression): remove " +
    "any remaining overclaim/guarantee/medical/superlative language, " +
    "confirm price content is completely absent, keep every prompt within " +
    "its character budget, keep the mandatory global block at the start of " +
    "every video prompt, and restore any mandatory content a prior " +
    "revision accidentally dropped."
  );
}

/** Deterministic per-round feedback (mirrors SVC's bounded-attempt feedback
 *  re-injection shape) — facts only, never creative rewrite instructions. */
function buildSequentialStoryboardRoundFeedback(input: {
  retained: SequentialStoryboardPack | null;
  imageBudget: number;
  manifest: readonly ReferenceIndexEntry[];
  childSubjectPolicy: ChildSubjectPolicyInput;
}): string {
  if (!input.retained) return "";
  const preflight = validateSequentialStoryboardPackPreflight({
    pack: input.retained,
    imageBudget: input.imageBudget,
    manifest: input.manifest,
    childSubjectPolicy: input.childSubjectPolicy,
    assemblyDocumented: Boolean(input.retained.evidenceProfile?.assembly_documented),
  });
  if (preflight.blockers.length === 0) return "";
  return [
    "DETERMINISTIC FEEDBACK FROM THE RETAINED VERSION (fix these before returning):",
    ...preflight.blockers.map(id => `- ${id}`),
  ].join("\n");
}

function buildSequentialStoryboardMergedInputs(
  input: SequentialStoryboardSkillLoopInput,
  imageBudget: number,
  round: 1 | 2 | 3 | null,
  retained: SequentialStoryboardPack | null
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    product_name: input.productName,
    product_description: input.productDescription,
    product_specs: input.productSpecs,
    reference_manifest: input.referenceManifest.map(entry => ({
      index: entry.index,
      role: entry.role,
      angleLabel: entry.angleLabel,
      url: entry.url,
      evidence_only: entry.evidenceOnly ?? false,
      // Cast identity, spread conditionally so a run with no characters
      // produces a byte-identical payload to before
      // (`planning/marketplace-four-character-cast/plan.md` §5). Without these
      // the skill sees N anonymous character images and cannot tell a lead
      // from a supporting character, or an adult from a child.
      ...(entry.characterName ? { character_name: entry.characterName } : {}),
      ...(entry.characterRole ? { character_role: entry.characterRole } : {}),
      ...(entry.variantLabel ? { look_label: entry.variantLabel } : {}),
      ...(typeof entry.depictsMinor === "boolean"
        ? { depicts_minor: entry.depictsMinor }
        : {}),
    })),
    // Backward-compatible schema alias. The independent language fields are
    // authoritative; target_language remains present because older skill
    // manifests require it during input audit.
    target_language: input.dialogueLanguage ?? "th",
    summary_language: input.summaryLanguage ?? "th",
    dialogue_language: input.dialogueLanguage ?? "th",
    prompt_language: input.promptLanguage ?? "en",
    shot_count: SEQUENTIAL_STORYBOARD_SHOT_COUNT,
    max_shot_duration_seconds: SEQUENTIAL_STORYBOARD_MAX_SHOT_DURATION_SECONDS,
    image_prompt_max_characters: imageBudget,
    video_prompt_max_characters:
      PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS,
    child_subject_policy: {
      productChildRelated: input.childSubjectPolicy.productChildRelated,
      childDepictionPlanned: input.childSubjectPolicy.childDepictionPlanned ?? false,
      guardianReferenceIndex: input.childSubjectPolicy.guardianReferenceIndex ?? undefined,
    },
    forbidden_claims: input.forbiddenClaims ?? [],
    confirmed_attributes: input.confirmedAttributes ?? {},
    audio_strategy: input.audioStrategy ?? "auto",
    platform_constraints: input.platformConstraints ?? "9:16",
  };
  if (input.reviewTone) merged.review_tone = input.reviewTone;
  if (input.videoStructureMode) merged.video_structure_mode = input.videoStructureMode;
  if (input.motionDirection) merged.motion_direction = input.motionDirection;
  if (input.targetAudience) merged.target_audience = input.targetAudience;
  if (input.userRequirements) merged.user_requirements = input.userRequirements;
  if (input.characterMode) merged.character_mode = input.characterMode;
  if (input.characterPresenceMode) merged.character_presence_mode = input.characterPresenceMode;
  Object.assign(merged, collectPresetInputFields(input.creativePresetSelections));
  if (round) merged.loop_round = round;
  if (retained) merged.prior_round_retained_output = retained;
  return merged;
}

/* -------------------------------------------------------------------------- */
/* Category rule injection (Feature 136 section 05, G7 fix)                  */
/* -------------------------------------------------------------------------- */

/**
 * The per-category rule library (`references/product-categories/*.md`) is
 * SHARED with the 3x3 `product-reference-storyboard` skill and lives ONLY
 * under that skill's own bundle folder — the sequential skill's bundle has
 * no such folder of its own (single source of truth, G7). This mirrors
 * `sequentialStoryboardSkillFolderCandidates`'s exact candidate-generation
 * shape, but for the 3x3 skill's id, since that is where the `.md` files
 * actually live on disk.
 */
const PRODUCT_REFERENCE_STORYBOARD_CATEGORY_LIBRARY_SKILL_ID =
  "product-reference-storyboard";

function productReferenceStoryboardCategoryRuleLibraryFolderCandidates(): string[] {
  const id = PRODUCT_REFERENCE_STORYBOARD_CATEGORY_LIBRARY_SKILL_ID;
  return [
    path.resolve(process.cwd(), "skills", id),
    path.resolve(process.cwd(), "..", "skills", id),
    path.resolve(process.cwd(), "apps", "web", "skills", id),
  ];
}

/**
 * Composes the skill's base system prompt (skill content + runtime contract)
 * and, when a concrete `productCategory` is supplied, appends the shared
 * per-category rule file via the SAME `appendProductReferenceStoryboardCategoryRules`
 * helper the 3x3 skill uses (broadened additively to accept this skill's id
 * — see `productReferenceStoryboardCategoryRules.ts`). Extracted as its own
 * function so it is unit-testable without the full LLM/provider chain the
 * production `invokeSkillRound` closure requires.
 */
function composeSequentialStoryboardSystemPromptBase(input: {
  skill: SkillDefinition;
  runtimeContract: string;
  productCategory?: string | null;
}): {
  systemPromptBase: string;
  categoryRuleAudit: ReturnType<
    typeof appendProductReferenceStoryboardCategoryRules
  >["audit"];
} {
  const base = [
    String(input.skill.systemPrompt ?? input.skill.skillContent ?? "").trim(),
    input.runtimeContract,
  ]
    .filter(Boolean)
    .join("\n\n");
  const categoryResult = appendProductReferenceStoryboardCategoryRules(base, {
    skillSlug: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
    skillDirectories: productReferenceStoryboardCategoryRuleLibraryFolderCandidates(),
    userInputs: { product_category: input.productCategory ?? null },
  });
  return {
    systemPromptBase: categoryResult.systemPrompt,
    categoryRuleAudit: categoryResult.audit,
  };
}

/** Test-only wrapper (repo `...ForTest` convention). */
export function composeSequentialStoryboardSystemPromptBaseForTest(input: {
  skill: SkillDefinition;
  runtimeContract: string;
  productCategory?: string | null;
}): {
  systemPromptBase: string;
  categoryRuleAudit: ReturnType<
    typeof appendProductReferenceStoryboardCategoryRules
  >["audit"];
} {
  return composeSequentialStoryboardSystemPromptBase(input);
}

/* -------------------------------------------------------------------------- */
/* Input-schema audit (hard-fail before spend)                               */
/* -------------------------------------------------------------------------- */

function hasUsableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function sequentialStoryboardSkillFolderCandidates(
  skill?: SkillDefinition | null
): string[] {
  const candidates: string[] = [];
  const folderFromSkill =
    (skill as unknown as { nativeBundlePath?: string | null } | undefined)
      ?.nativeBundlePath ??
    (skill?.skillFilePath ? path.dirname(skill.skillFilePath) : null);
  if (folderFromSkill) {
    candidates.push(
      path.resolve(process.cwd(), folderFromSkill),
      path.resolve(process.cwd(), "..", folderFromSkill),
      path.resolve(process.cwd(), "apps", "web", folderFromSkill)
    );
  }
  candidates.push(
    path.resolve(process.cwd(), "skills", PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID),
    path.resolve(
      process.cwd(),
      "..",
      "skills",
      PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID
    ),
    path.resolve(
      process.cwd(),
      "apps",
      "web",
      "skills",
      PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID
    )
  );
  return Array.from(new Set(candidates));
}

function loadSequentialStoryboardInputSchema(
  skill?: SkillDefinition | null
): { schemaPath: string; schema: Record<string, unknown> } | null {
  for (const dir of sequentialStoryboardSkillFolderCandidates(skill)) {
    const schemaPath = path.join(dir, "schemas", "input.schema.json");
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      if (schema && typeof schema === "object" && !Array.isArray(schema)) {
        return { schemaPath, schema: schema as Record<string, unknown> };
      }
    } catch (error) {
      console.warn(
        "[productReviewSequentialStoryboardSkillRunner] input_schema_read_failed",
        {
          skillId: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
          schemaPath,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
  return null;
}

export type SequentialStoryboardInputSchemaAudit = {
  status: "passed" | "failed";
  schemaPath: string | null;
  blockers: string[];
  checkedAt: string;
};

const SEQUENTIAL_STORYBOARD_FALLBACK_REQUIRED_FIELDS = [
  "product_name",
  "product_description",
  "product_specs",
  "reference_manifest",
  "child_subject_policy",
];

function auditSequentialStoryboardSkillInput(params: {
  skill?: SkillDefinition | null;
  mergedInputs: Record<string, unknown>;
}): SequentialStoryboardInputSchemaAudit {
  const loaded = loadSequentialStoryboardInputSchema(params.skill);
  const blockers: string[] = [];
  if (!loaded) {
    blockers.push("input_schema_missing");
  }
  const requiredRaw = Array.isArray(loaded?.schema?.required)
    ? (loaded!.schema.required as unknown[]).map(String)
    : SEQUENTIAL_STORYBOARD_FALLBACK_REQUIRED_FIELDS;

  for (const field of requiredRaw) {
    if (!hasUsableValue(params.mergedInputs[field])) {
      blockers.push(`${field}_field_missing`);
    }
  }

  const manifest = params.mergedInputs.reference_manifest;
  if (Array.isArray(manifest)) {
    manifest.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        blockers.push(`reference_manifest_${index}_invalid`);
        return;
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.index !== "number" || record.index < 1) {
        blockers.push(`reference_manifest_${index}_index_invalid`);
      }
      if (!hasUsableValue(record.role)) {
        blockers.push(`reference_manifest_${index}_role_missing`);
      }
      if (!hasUsableValue(record.url)) {
        blockers.push(`reference_manifest_${index}_url_missing`);
      }
    });
  }

  const childPolicy = params.mergedInputs.child_subject_policy;
  if (
    !childPolicy ||
    typeof childPolicy !== "object" ||
    typeof (childPolicy as Record<string, unknown>).productChildRelated !== "boolean"
  ) {
    blockers.push("child_subject_policy_invalid");
  }

  return {
    status: blockers.length === 0 ? "passed" : "failed",
    schemaPath: loaded?.schemaPath ?? null,
    blockers,
    checkedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Structural / retention / preflight (pure, fixture-testable)                */
/* -------------------------------------------------------------------------- */

/**
 * §5.9 contract rejection: a returned pack missing `loopReport` evidence or a
 * passing `finalQc` is a contract violation, counted as a failed attempt.
 */
export function validateSequentialStoryboardPackStructure(
  raw: unknown
): { ok: true; pack: SequentialStoryboardPack } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reasons: ["not_an_object"] };
  }
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.shots) || value.shots.length === 0) {
    reasons.push("shots_missing");
  }
  if (!value.loopReport || typeof value.loopReport !== "object") {
    reasons.push("loop_report_missing");
  }
  if (!value.finalQc || typeof value.finalQc !== "object") {
    reasons.push("final_qc_missing");
  } else {
    const finalQc = value.finalQc as Record<string, unknown>;
    const allTrue = SEQUENTIAL_STORYBOARD_FINAL_QC_KEYS.every(
      key => finalQc[key] === true
    );
    if (!allTrue) reasons.push("final_qc_not_passing");
  }
  if (reasons.length > 0) return { ok: false, reasons };
  // Parse-boundary enum normalization (weak-model drift guard): the objects
  // here come straight from JSON.parse (never frozen), so in-place
  // normalization is safe and every downstream consumer — including the pure
  // retention disqualifiers — sees clean claim-confidence values.
  if (Array.isArray(value.shots)) {
    for (const shot of value.shots as Array<Record<string, unknown>>) {
      if (!shot || typeof shot !== "object") continue;
      const traces = Array.isArray(shot.claim_trace) ? shot.claim_trace : [];
      for (const trace of traces as Array<Record<string, unknown>>) {
        if (!trace || typeof trace !== "object") continue;
        trace.support = normalizeSequentialClaimSupport(trace.support);
      }
    }
  }
  return { ok: true, pack: value as unknown as SequentialStoryboardPack };
}

export function computeSequentialStoryboardRoundScoreTotal(
  scores: Partial<Record<string, unknown>> | null | undefined
): { total: number; normalized: number } {
  let total = 0;
  for (const dim of SEQUENTIAL_STORYBOARD_SCORE_DIMENSIONS) {
    const value = Number((scores as Record<string, unknown> | null | undefined)?.[dim]);
    total += Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0;
  }
  const max = SEQUENTIAL_STORYBOARD_SCORE_DIMENSIONS.length * 10;
  return { total, normalized: max > 0 ? (total / max) * 100 : 0 };
}

/**
 * Deterministic disqualifiers (spec §5.6): a later round never replaces the
 * retained one when it trips any of these, regardless of score.
 */
export function findSequentialStoryboardRetentionDisqualifiers(
  pack: SequentialStoryboardPack,
  ctx: { imageBudget: number; audioStrategy?: string | null }
): string[] {
  const reasons = new Set<string>();
  const shots = Array.isArray(pack.shots) ? pack.shots : [];
  if (shots.length !== SEQUENTIAL_STORYBOARD_SHOT_COUNT) {
    reasons.add("shot_count_invalid");
  }
  const shotIds = shots
    .map(shot => Number(shot.shot_id))
    .filter(id => Number.isFinite(id))
    .sort((a, b) => a - b);
  const contiguous =
    shotIds.length === SEQUENTIAL_STORYBOARD_SHOT_COUNT &&
    shotIds.every((id, idx) => id === idx + 1);
  if (!contiguous) reasons.add("shot_id_discontinuous");

  for (const shot of shots) {
    // Per-shot CONTRACT enforcement (field evidence 2026-07-23): a retained
    // round shipped shots carrying ONLY {shot_id + prompts} — no dialogue,
    // no purpose, no visual_summary, no depicts_minor — while self-scoring
    // dialogue_continuity 10/10. Pack-level validation never looked inside a
    // shot, so the hollow pack sailed through to the plan-review gate with
    // nine empty บทพูด rows. These fields are load-bearing: dialogue is the
    // spoken script, depicts_minor drives the minor-safety QA grounding.
    const shotRecord = shot as unknown as Record<string, unknown>;
    const hasCoreFields =
      String(shotRecord.purpose ?? "").trim().length > 0 &&
      String(shotRecord.visual_summary ?? "").trim().length > 0 &&
      Number.isFinite(Number(shotRecord.duration_seconds)) &&
      String(shotRecord.demonstration_type ?? "").trim().length > 0 &&
      typeof shotRecord.depicts_minor === "boolean" &&
      typeof shotRecord.guardian_required === "boolean" &&
      typeof shotRecord.dialogue === "string" &&
      Array.isArray(shotRecord.claim_trace);
    if (!hasCoreFields) reasons.add("shot_fields_missing");
    const audioStrategy = String(ctx.audioStrategy ?? "").trim();
    if (
      audioStrategy &&
      audioStrategy !== "silent" &&
      String(shotRecord.dialogue ?? "").trim().length === 0
    ) {
      reasons.add("dialogue_missing");
    }
    const imagePrompt = String(shot.start_frame_image_prompt ?? "").trim();
    const videoPrompt = String(shot.video_prompt ?? "").trim();
    if (!imagePrompt || !videoPrompt) reasons.add("prompt_missing");
    if (imagePrompt.length > ctx.imageBudget) reasons.add("prompt_over_budget");
    if (videoPrompt.length > PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS) {
      reasons.add("prompt_over_budget");
    }
    if (videoPrompt && !videoPrompt.includes(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER)) {
      reasons.add("global_block_missing");
    }
    for (const trace of shot.claim_trace ?? []) {
      // Lenient membership via the normalizer (never mutates — this function
      // is pure and test fixtures may be frozen). The actual in-place
      // normalization happens once at the parse boundary in
      // `validateSequentialStoryboardPackStructure`, so downstream consumers
      // still see clean enum values.
      if (
        !SEQUENTIAL_CLAIM_CONFIDENCE_LEVELS.has(
          normalizeSequentialClaimSupport(
            (trace as Record<string, unknown> | null | undefined)?.support
          )
        )
      ) {
        reasons.add("invalid_claim_confidence");
      }
    }
  }
  return Array.from(reasons);
}

const SEQUENTIAL_GUARDIAN_KEYWORD_PATTERN =
  /guardian|ผู้ปกครอง|ผู้ใหญ่|adult\s+supervis|parent/i;
/** Mirrors the SVC literal marker `ensureMinorSafetyClothingLockInImagePrompt`
 *  checks for (`/MINOR SAFETY CLOTHING LOCK/i`) — same check family, reused
 *  id (spec §5.7). See this section's returned notes for the known gap: this
 *  section does not itself inject the marker text (SVC-side concern). */
const SEQUENTIAL_MINOR_SAFETY_MARKER_PATTERN = /minor safety clothing lock/i;

/**
 * TS deterministic preflight backstop (spec §5.7) — pure, fixture-testable
 * without any mock. Runs on whatever the loop returns as a defense-in-depth
 * BACKSTOP; the in-skill QA (`finalQc`) is the primary QA (spec §9.7).
 */
export function validateSequentialStoryboardPackPreflight(input: {
  pack: SequentialStoryboardPack;
  imageBudget: number;
  manifest: readonly ReferenceIndexEntry[];
  childSubjectPolicy: ChildSubjectPolicyInput;
  assemblyDocumented: boolean;
}): SequentialStoryboardPreflightResult {
  const blockers = new Set<string>();
  const warnings = new Set<string>();
  const perShot: Record<number, string[]> = {};
  const shots = Array.isArray(input.pack.shots) ? input.pack.shots : [];

  const addBlocker = (id: string, shotId?: number) => {
    blockers.add(id);
    if (shotId != null) {
      perShot[shotId] = perShot[shotId] ?? [];
      if (!perShot[shotId].includes(id)) perShot[shotId].push(id);
    }
  };

  if (shots.length !== SEQUENTIAL_STORYBOARD_SHOT_COUNT) {
    addBlocker("sequential_prompt_set_incomplete");
  }

  const guardianPolicyActive =
    Boolean(input.childSubjectPolicy.productChildRelated) &&
    Boolean(input.childSubjectPolicy.childDepictionPlanned);

  for (const shot of shots) {
    const shotId = Number(shot.shot_id);
    const imagePrompt = String(shot.start_frame_image_prompt ?? "").trim();
    const videoPrompt = String(shot.video_prompt ?? "").trim();

    if (!imagePrompt || !videoPrompt) {
      addBlocker("sequential_prompt_set_incomplete", shotId);
    }
    if (imagePrompt && imagePrompt.length > input.imageBudget) {
      addBlocker("prompt_too_long_for_image_provider", shotId);
    }
    if (
      videoPrompt &&
      videoPrompt.length > PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS
    ) {
      addBlocker("prompt_too_long_for_video_provider", shotId);
    }
    if (videoPrompt && !videoPrompt.includes(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER)) {
      addBlocker("video_global_block_missing", shotId);
    }
    if (guardianPolicyActive && shot.depicts_minor) {
      const hasGuardianContent =
        SEQUENTIAL_GUARDIAN_KEYWORD_PATTERN.test(imagePrompt) ||
        SEQUENTIAL_GUARDIAN_KEYWORD_PATTERN.test(videoPrompt);
      if (!hasGuardianContent) addBlocker("guardian_directive_missing", shotId);
    }
    if (shot.depicts_minor && !SEQUENTIAL_MINOR_SAFETY_MARKER_PATTERN.test(imagePrompt)) {
      addBlocker("minor_safety_clothing_lock_missing", shotId);
    }
    if (shot.demonstration_type === "assembly_demo" && !input.assemblyDocumented) {
      addBlocker("assembly_demo_unverified", shotId);
    }
    if (
      detectSequentialPromptPriceClaims(shot.dialogue) ||
      detectSequentialPromptPriceClaims(imagePrompt) ||
      detectSequentialPromptPriceClaims(videoPrompt)
    ) {
      addBlocker("price_claim_detected", shotId);
    }
    const duration = Number(shot.duration_seconds);
    if (
      Number.isFinite(duration) &&
      (duration > SEQUENTIAL_STORYBOARD_MAX_SHOT_DURATION_SECONDS ||
        duration < SEQUENTIAL_STORYBOARD_MIN_SHOT_DURATION_SECONDS)
    ) {
      addBlocker("shot_duration_exceeds_max", shotId);
    }
    if (
      shot.dialogue &&
      Number.isFinite(duration) &&
      estimateSequentialStoryboardSpeechSeconds(shot.dialogue) > duration
    ) {
      addBlocker("dialogue_exceeds_shot_duration", shotId);
    }
    const mappingMismatches: ReferenceIndexMappingMismatch[] = [
      ...findReferenceIndexMappingMismatches(imagePrompt, input.manifest),
      ...findReferenceIndexMappingMismatches(videoPrompt, input.manifest),
    ];
    if (mappingMismatches.length > 0) {
      addBlocker("reference_index_mapping_mismatch", shotId);
    }
  }

  const evidenceProfile = input.pack.evidenceProfile ?? ({} as SequentialStoryboardEvidenceProfile);
  const hasModelConflictKey = Object.prototype.hasOwnProperty.call(
    evidenceProfile,
    "product_reference_model_conflict"
  );
  if (!hasModelConflictKey) {
    addBlocker("sequential_prompt_set_incomplete");
  } else if (evidenceProfile.product_reference_model_conflict != null) {
    addBlocker("product_reference_model_conflict");
  }

  return {
    blockers: Array.from(blockers),
    warnings: Array.from(warnings),
    perShot,
  };
}

/* -------------------------------------------------------------------------- */
/* Over-budget -> optimizer skill (§5.8, never mechanical truncation)         */
/* -------------------------------------------------------------------------- */

async function optimizeSequentialPromptIfOverBudget(input: {
  prompt: string;
  promptKind: "sequential_image" | "sequential_video";
  maxChars: number;
  effects: SequentialStoryboardLoopEffects;
}): Promise<{ prompt: string; auditEntries: Record<string, unknown>[] }> {
  let prompt = input.prompt;
  const auditEntries: Record<string, unknown>[] = [];
  if (prompt.length <= input.maxChars) {
    return { prompt, auditEntries };
  }
  for (
    let attempt = 1;
    attempt <= SEQUENTIAL_STORYBOARD_OPTIMIZER_MAX_ATTEMPTS && prompt.length > input.maxChars;
    attempt += 1
  ) {
    const result = await input.effects.optimizeFinalPrompt({
      prompt,
      promptKind: input.promptKind,
      maxChars: input.maxChars,
    });
    prompt = result.prompt;
    if (result.audit) {
      auditEntries.push({ ...result.audit, attempt });
    }
  }
  if (prompt.length > input.maxChars) {
    auditEntries.push({
      reason:
        input.promptKind === "sequential_image"
          ? "prompt_too_long_for_image_provider"
          : "prompt_too_long_for_video_provider",
      hardBlocker: true,
      finalLengthChars: prompt.length,
      maxChars: input.maxChars,
    });
  }
  return { prompt, auditEntries };
}

/**
 * §5.8/§7 invariant 4 — grep-guard target: NEVER `.slice(` a final prompt
 * here. Every rewrite goes through the injected `optimizeFinalPrompt` effect
 * (which ultimately invokes the optimizer SKILL); this function only swaps
 * the string, it never truncates it.
 */
async function finalizeSequentialStoryboardPackBudgets(input: {
  pack: SequentialStoryboardPack;
  imageBudget: number;
  effects: SequentialStoryboardLoopEffects;
}): Promise<{ pack: SequentialStoryboardPack; auditEntries: Record<string, unknown>[] }> {
  const auditEntries: Record<string, unknown>[] = [];
  const shots = await Promise.all(
    (input.pack.shots ?? []).map(async shot => {
      let nextShot = shot;
      const imagePrompt = String(shot.start_frame_image_prompt ?? "");
      if (imagePrompt.length > input.imageBudget) {
        const optimized = await optimizeSequentialPromptIfOverBudget({
          prompt: imagePrompt,
          promptKind: "sequential_image",
          maxChars: input.imageBudget,
          effects: input.effects,
        });
        auditEntries.push(...optimized.auditEntries.map(entry => ({ shotId: shot.shot_id, ...entry })));
        nextShot = { ...nextShot, start_frame_image_prompt: optimized.prompt };
      }
      const videoPrompt = String(shot.video_prompt ?? "");
      if (videoPrompt.length > PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS) {
        const optimized = await optimizeSequentialPromptIfOverBudget({
          prompt: videoPrompt,
          promptKind: "sequential_video",
          maxChars: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS,
          effects: input.effects,
        });
        auditEntries.push(...optimized.auditEntries.map(entry => ({ shotId: shot.shot_id, ...entry })));
        nextShot = { ...nextShot, video_prompt: optimized.prompt };
      }
      return nextShot;
    })
  );
  return { pack: { ...input.pack, shots }, auditEntries };
}

/** Test-only wrapper (repo `...ForTest` convention). */
export async function finalizeSequentialStoryboardPackBudgetsForTest(input: {
  pack: SequentialStoryboardPack;
  imageBudget: number;
  effects: SequentialStoryboardLoopEffects;
}): Promise<{ pack: SequentialStoryboardPack; auditEntries: Record<string, unknown>[] }> {
  return finalizeSequentialStoryboardPackBudgets(input);
}

/* -------------------------------------------------------------------------- */
/* StartFramePromptEngine seam (Feature 136 section 13) — an OPTIONAL         */
/* cinematic-prompt style layer reusing the Vertical Drama per-shot skills.   */
/*                                                                            */
/* `evidence_product` (absent/default `startFramePromptStyle`) is a pure     */
/* no-op: the loader is never called and every shot's wording is exactly     */
/* what the main 3-round loop above already produced — byte-identical to     */
/* the section 04 baseline.                                                  */
/*                                                                            */
/* `cinematic_auto` re-authors ONLY the WORDING of `start_frame_image_prompt` */
/* and `video_prompt`, per shot, via the two committed-or-uncommitted VD      */
/* skills (image side) and the committed VD video-prompt skill (video side). */
/* It never touches any other shot field (dialogue, duration_seconds,        */
/* demonstration_type, claim_trace, evidenceProfile, ...) — those stay        */
/* exactly what the evidence-locked loop produced. The FACT LOCK guard below  */
/* rejects (reverts to the original wording) any engine response that        */
/* introduces a product attribute/component/material/mechanism/capability/    */
/* measurement not already present in the shot's own evidence-locked         */
/* contract. Every existing preflight/budget/optimizer guard still runs      */
/* AFTER this step, unchanged (see `runProductReviewSequentialStoryboardSkillLoop`). */
/* -------------------------------------------------------------------------- */

/**
 * G1 risk (implementation-gaps.md; section-13 spec §6) — RESOLVED: the two
 * mode-specific image skill folders (previously vendored here as local
 * constants because VD's own `imagePromptModelFamily.ts` was uncommitted)
 * now come from `VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS`, VD's own single
 * source of truth for the mode -> skill-folder mapping, re-exported via
 * `startFramePromptStyle.ts`. The loader below still treats an absent
 * folder as a soft degrade, never a throw, so a future rename/removal of
 * either VD skill folder degrades safely rather than crashing this path.
 */
const VD_SHOT_VIDEO_PROMPT_SKILL_FOLDER = "vertical-drama-shot-video-prompt"; // committed

function resolveStartFramePromptEngineImageSkillFolder(
  mode: VerticalDramaImagePromptMode
): string {
  return VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS[mode];
}

/**
 * Loads a Vertical Drama skill's markdown body VERBATIM from disk — mirrors
 * `verticalDramaStartFrameGeneration.ts`'s own `loadSkillSystemPrompt`
 * pattern (`resolveSkillDirCandidates` -> `resolveSkillManifestPath` ->
 * `parseSkillFile`). SOFT-DEGRADES to `null` when the folder does not exist
 * on this checkout or its body is empty/unreadable — NEVER throws (section
 * 13 §6). Not cached (unlike VD's own loader) — called at most twice per
 * run (image + video), not per shot.
 */
function loadVerticalDramaSkillBodyFromDisk(skillFolderName: string): string | null {
  for (const dir of resolveSkillDirCandidates(path.join("skills", skillFolderName))) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const { content } = parseSkillFile(raw);
      if (content && content.trim().length > 0) return content;
    } catch (error) {
      console.warn(
        "[productReviewSequentialStoryboardSkillRunner] cinematic_engine_skill_read_failed",
        { skillFolderName, manifestPath, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  return null;
}

/** Test-only wrapper (repo `...ForTest` convention). */
export function loadVerticalDramaSkillBodyFromDiskForTest(skillFolderName: string): string | null {
  return loadVerticalDramaSkillBodyFromDisk(skillFolderName);
}

export type StartFramePromptEngineEffects = {
  /** Called ONCE per run (not per shot) when `cinematic_auto` is selected. */
  loadEngineSkillBodies(args: {
    imagePromptMode: VerticalDramaImagePromptMode;
  }): Promise<{ imageSkillBody: string | null; videoSkillBody: string | null }>;
  invokeImagePromptEngine(args: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<unknown>;
  invokeVideoPromptEngine(args: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<unknown>;
};

/** Common internal record both VD image-prompt output shapes normalize to (§2.3.2). */
export type CinematicImagePromptEngineOutput = {
  prompt: string;
  negativePrompt?: string;
  safetyAdjustments?: unknown[];
};

/**
 * `policy_safe_rewrite` returns `safety_adjustments` at the top level;
 * `cinematic_narrative` nests the rest under `analysis_summary`, including
 * its OWN `safety_adjustments` (documented at
 * `verticalDramaStartFrameGeneration.ts` — VD's own equivalent normalizer).
 * The two modes never populate both; whichever is present wins. Every extra
 * VD director's-notes field (`continuity_notes`, `quality_score`, ...) is
 * display/audit-only and intentionally dropped here — Feature 136 persists
 * only the prompt text itself.
 */
export function normalizeCinematicImagePromptEngineOutput(
  raw: unknown
): CinematicImagePromptEngineOutput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt) return null;
  const negativePrompt =
    typeof value.negative_prompt === "string" ? value.negative_prompt.trim() : undefined;
  const analysisSummary =
    value.analysis_summary && typeof value.analysis_summary === "object" && !Array.isArray(value.analysis_summary)
      ? (value.analysis_summary as Record<string, unknown>)
      : undefined;
  const topLevelSafety = Array.isArray(value.safety_adjustments)
    ? (value.safety_adjustments as unknown[])
    : undefined;
  const nestedSafety = Array.isArray(analysisSummary?.safety_adjustments)
    ? (analysisSummary!.safety_adjustments as unknown[])
    : undefined;
  const safetyAdjustments = topLevelSafety ?? nestedSafety;
  return {
    prompt,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(safetyAdjustments ? { safetyAdjustments } : {}),
  };
}

/**
 * The committed `vertical-drama-shot-video-prompt` skill's output is
 * `{ prompt, negative_motion_prompt, dialogue: [...], audio_direction? }`
 * (see its own `skill.md`). Feature 136 keeps ONLY `prompt` — the review's
 * dialogue is evidence-locked content this engine must never re-author (it
 * is not even asked to; the shot contract passed to it explicitly withholds
 * dialogue re-authoring instructions), and `negative_motion_prompt`/
 * `audio_direction` are out of scope for this style layer.
 */
export function normalizeCinematicVideoPromptEngineOutput(
  raw: unknown
): { prompt: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt) return null;
  return { prompt };
}

/**
 * Keeps the mandatory global block intact (spec §3.2/§5 deliverable 5): if
 * the engine's own text already happens to contain the frozen marker
 * sentence, it is returned unchanged; otherwise the run's own compiled
 * `globalContinuity.video_global_block` (or, failing that, the bare marker
 * sentence) is prepended. This makes `global_block_present_in_every_video_prompt`
 * / `video_global_block_missing` structurally unreachable as a violation
 * introduced by this engine, regardless of what the VD skill itself returns.
 */
export function composeCinematicVideoPrompt(input: {
  globalContinuity?: Record<string, unknown> | null;
  enginePrompt: string;
}): string {
  const enginePrompt = input.enginePrompt.trim();
  if (enginePrompt.includes(SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER)) {
    return enginePrompt;
  }
  const rawGlobalBlock = input.globalContinuity?.video_global_block;
  const globalBlock =
    typeof rawGlobalBlock === "string" && rawGlobalBlock.trim()
      ? rawGlobalBlock.trim()
      : `${SEQUENTIAL_VIDEO_GLOBAL_BLOCK_MARKER}.`;
  return `${globalBlock}\n\n${enginePrompt}`;
}

/**
 * FACT LOCK backstop (spec §3.1/§5 — the important regression). Deterministic
 * TS guard, same family as `SEQUENTIAL_GUARDIAN_KEYWORD_PATTERN` /
 * `SEQUENTIAL_PRICE_CLAIM_PATTERNS` above: a curated set of common
 * fabricatable product-attribute categories (material, mechanism, component,
 * numeric measurement). A keyword hit in the CANDIDATE text that does not
 * also appear anywhere in the shot's own evidence VOCABULARY is a violation.
 * Deliberately NOT a semantic/LLM fact-checker — a cheap, explainable,
 * fixture-testable backstop, exactly like the other guards in this file.
 */
const SEQUENTIAL_CINEMATIC_FACT_LOCK_ATTRIBUTE_PATTERNS: readonly RegExp[] = [
  /\b(oak|teak|walnut|mahogany|maple|cedar|pine|bamboo|rattan|solid wood|plywood|mdf|particleboard)\b/gi,
  /\b(stainless steel|carbon steel|cast iron|wrought iron|aluminu?m|titanium|brass|bronze|copper)\b/gi,
  /\b(genuine leather|full[- ]grain leather|top[- ]grain leather|suede|pu leather|faux leather)\b/gi,
  /\b(polyester|cotton|linen|silk|wool|nylon|spandex|velvet|cashmere|denim)\b/gi,
  /\b(tempered glass|acrylic|ceramic|porcelain|silicone|rubber)\b/gi,
  /\b(hydraulic|pneumatic|motorized|servo motor|ball bearing|spring[- ]loaded|memory foam)\b/gi,
  /\b(lithium[- ]ion|rechargeable battery|usb-c charging)\b/gi,
  /\b\d+(\.\d+)?\s?(cm|mm|inches?|in|kg|lbs?|liters?|ml|watts?|volts?|mah)\b/gi,
];

export function findStartFramePromptEngineFactLockViolations(input: {
  candidateText: string;
  vocabulary: string;
}): string[] {
  const candidate = String(input.candidateText ?? "").toLowerCase();
  const vocabulary = String(input.vocabulary ?? "").toLowerCase();
  const violations = new Set<string>();
  for (const pattern of SEQUENTIAL_CINEMATIC_FACT_LOCK_ATTRIBUTE_PATTERNS) {
    const matches = candidate.match(pattern);
    if (!matches) continue;
    for (const match of matches) {
      const token = match.trim().toLowerCase();
      if (token && !vocabulary.includes(token)) {
        violations.add(token);
      }
    }
  }
  return Array.from(violations);
}

function buildStartFramePromptEngineFactLockDirective(): string {
  return [
    "## FACT LOCK (MANDATORY)",
    "Every product fact in this contract is already verified. You may re-word,",
    "frame, light, and stage this shot cinematically, but you may NOT add,",
    "infer, or embellish any product attribute, component, material,",
    "mechanism, capability, or measurement that is not already present above.",
  ].join("\n");
}

function buildStartFramePromptEngineReferenceManifestBlock(
  manifest: readonly SequentialReferenceManifestEntry[]
): string {
  const lines = manifest.map(entry => {
    const angle = entry.angleLabel ? `, angleLabel: ${entry.angleLabel}` : "";
    return `@Image${entry.index} = role: ${entry.role}${angle}`;
  });
  return ["## Reference Manifest (the ONLY valid @ImageN bindings)", ...lines].join("\n");
}

function buildCinematicImagePromptEngineUserPrompt(input: {
  shot: SequentialStoryboardShot;
  pack: SequentialStoryboardPack;
  loopInput: SequentialStoryboardSkillLoopInput;
  imageBudget: number;
}): string {
  const { shot, pack, loopInput } = input;
  const lines = [
    "## Shot Contract (evidence-locked; re-word cinematically only)",
    JSON.stringify({
      visual_summary: shot.visual_summary ?? "",
      purpose: shot.purpose ?? "",
      demonstration_type: shot.demonstration_type,
      transition_from_previous: shot.transition_from_previous ?? "",
      dialogue: shot.dialogue ?? "",
    }),
    "## Global Continuity (frozen — do not alter)",
    JSON.stringify(pack.globalContinuity ?? {}),
    buildStartFramePromptEngineReferenceManifestBlock(loopInput.referenceManifest),
    `image_prompt_max_characters (effective budget): ${input.imageBudget}`,
  ];
  if (loopInput.guardianPresenceDirective) {
    lines.push("## Guardian Presence Directive", loopInput.guardianPresenceDirective);
  }
  if (loopInput.demonstrationEvidenceDirective) {
    lines.push("## Demonstration Evidence Directive", loopInput.demonstrationEvidenceDirective);
  }
  lines.push(buildStartFramePromptEngineFactLockDirective());
  return lines.join("\n\n");
}

function buildCinematicVideoPromptEngineUserPrompt(input: {
  shot: SequentialStoryboardShot;
  pack: SequentialStoryboardPack;
  loopInput: SequentialStoryboardSkillLoopInput;
}): string {
  const { shot, pack, loopInput } = input;
  const lines = [
    "## Shot Contract (evidence-locked; re-word cinematically only)",
    JSON.stringify({
      visual_summary: shot.visual_summary ?? "",
      purpose: shot.purpose ?? "",
      demonstration_type: shot.demonstration_type,
      transition_from_previous: shot.transition_from_previous ?? "",
      dialogue: shot.dialogue ?? "",
      duration_seconds: shot.duration_seconds,
    }),
    "## Global Continuity (frozen — do not alter)",
    JSON.stringify(pack.globalContinuity ?? {}),
    buildStartFramePromptEngineReferenceManifestBlock(loopInput.referenceManifest),
    `video_prompt_max_characters (budget): ${PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS}`,
    "Do not re-author the dialogue text; author only the camera, motion, and emotion direction for this shot's video clip.",
  ];
  if (loopInput.guardianPresenceDirective) {
    lines.push("## Guardian Presence Directive", loopInput.guardianPresenceDirective);
  }
  lines.push(buildStartFramePromptEngineFactLockDirective());
  return lines.join("\n\n");
}

function buildStartFramePromptEngineVocabularyBase(
  loopInput: SequentialStoryboardSkillLoopInput,
  pack: SequentialStoryboardPack
): string {
  return [
    loopInput.productTruthText ?? "",
    loopInput.productName ?? "",
    loopInput.productDescription ?? "",
    loopInput.productSpecs ?? "",
    JSON.stringify(loopInput.confirmedAttributes ?? {}),
    JSON.stringify(pack.evidenceProfile ?? {}),
    JSON.stringify(pack.globalContinuity ?? {}),
  ]
    .join(" \n ")
    .toLowerCase();
}

function stampEvidenceProductEngine(pack: SequentialStoryboardPack): SequentialStoryboardPack {
  return {
    ...pack,
    shots: pack.shots.map(shot => ({
      ...shot,
      start_frame_prompt_engine: shot.start_frame_prompt_engine ?? "evidence_product",
      video_prompt_engine: shot.video_prompt_engine ?? "evidence_product",
    })),
  };
}

async function applyStartFramePromptEngineToShot(args: {
  shot: SequentialStoryboardShot;
  pack: SequentialStoryboardPack;
  loopInput: SequentialStoryboardSkillLoopInput;
  imageBudget: number;
  imagePromptMode: VerticalDramaImagePromptMode;
  imageSkillBody: string;
  videoSkillBody: string;
  vocabularyBase: string;
  effects: StartFramePromptEngineEffects;
  engineAudit: Record<string, unknown>[];
}): Promise<SequentialStoryboardShot> {
  const { shot } = args;
  const shotVocabulary = [
    args.vocabularyBase,
    shot.visual_summary ?? "",
    shot.purpose ?? "",
    shot.transition_from_previous ?? "",
    shot.dialogue ?? "",
    shot.start_frame_image_prompt ?? "",
    shot.video_prompt ?? "",
  ]
    .join(" \n ")
    .toLowerCase();

  let nextImagePrompt = shot.start_frame_image_prompt;
  let imageEngine: SequentialStoryboardStartFramePromptEngine = "evidence_product";
  try {
    const userPrompt = buildCinematicImagePromptEngineUserPrompt({
      shot,
      pack: args.pack,
      loopInput: args.loopInput,
      imageBudget: args.imageBudget,
    });
    const raw = await args.effects.invokeImagePromptEngine({
      systemPrompt: args.imageSkillBody,
      userPrompt,
    });
    const normalized = normalizeCinematicImagePromptEngineOutput(raw);
    if (normalized) {
      const violations = findStartFramePromptEngineFactLockViolations({
        candidateText: normalized.prompt,
        vocabulary: shotVocabulary,
      });
      if (violations.length === 0) {
        nextImagePrompt = normalized.prompt;
        imageEngine = args.imagePromptMode;
      } else {
        args.engineAudit.push({
          event: "sequential_cinematic_fact_lock_violation",
          shotId: shot.shot_id,
          field: "start_frame_image_prompt",
          violations,
        });
      }
    }
  } catch (error) {
    args.engineAudit.push({
      event: "sequential_cinematic_engine_call_failed",
      shotId: shot.shot_id,
      field: "start_frame_image_prompt",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let nextVideoPrompt = shot.video_prompt;
  let videoEngine: SequentialStoryboardVideoPromptEngine = "evidence_product";
  try {
    const userPrompt = buildCinematicVideoPromptEngineUserPrompt({
      shot,
      pack: args.pack,
      loopInput: args.loopInput,
    });
    const raw = await args.effects.invokeVideoPromptEngine({
      systemPrompt: args.videoSkillBody,
      userPrompt,
    });
    const normalized = normalizeCinematicVideoPromptEngineOutput(raw);
    if (normalized) {
      const composed = composeCinematicVideoPrompt({
        globalContinuity: args.pack.globalContinuity,
        enginePrompt: normalized.prompt,
      });
      const violations = findStartFramePromptEngineFactLockViolations({
        candidateText: composed,
        vocabulary: shotVocabulary,
      });
      if (violations.length === 0) {
        nextVideoPrompt = composed;
        videoEngine = "vertical_drama_shot_video_prompt";
      } else {
        args.engineAudit.push({
          event: "sequential_cinematic_fact_lock_violation",
          shotId: shot.shot_id,
          field: "video_prompt",
          violations,
        });
      }
    }
  } catch (error) {
    args.engineAudit.push({
      event: "sequential_cinematic_engine_call_failed",
      shotId: shot.shot_id,
      field: "video_prompt",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    ...shot,
    start_frame_image_prompt: nextImagePrompt,
    video_prompt: nextVideoPrompt,
    start_frame_prompt_engine: imageEngine,
    video_prompt_engine: videoEngine,
  };
}

/**
 * Main orchestrator (spec §3/§5 deliverable 3). `evidence_product` (absent
 * style) is a pure no-op: `effects.loadEngineSkillBodies` is never called
 * and every shot is returned with its wording byte-identical to the input,
 * only stamped `"evidence_product"` on both engine fields. `cinematic_auto`
 * loads the two required skill bodies ONCE, degrades the WHOLE step to
 * `evidence_product` (with an audit entry, never a throw) if either is
 * missing, and otherwise re-authors each shot's wording independently,
 * subject to the FACT LOCK guard per field.
 */
export async function applyStartFramePromptEngineToPack(
  input: {
    pack: SequentialStoryboardPack;
    loopInput: SequentialStoryboardSkillLoopInput;
    imageBudget: number;
  },
  effects: StartFramePromptEngineEffects
): Promise<{ pack: SequentialStoryboardPack; engineAudit: Record<string, unknown>[] }> {
  if (input.loopInput.startFramePromptStyle !== "cinematic_auto") {
    return { pack: stampEvidenceProductEngine(input.pack), engineAudit: [] };
  }

  const imagePromptMode = resolveVerticalDramaImagePromptModeForImageModel(
    input.loopInput.imageModel
  );
  const engineAudit: Record<string, unknown>[] = [];
  const skills = await effects.loadEngineSkillBodies({ imagePromptMode });

  if (!skills.imageSkillBody || !skills.videoSkillBody) {
    engineAudit.push({
      event: "sequential_cinematic_prompt_engine_degraded",
      reason: !skills.imageSkillBody ? "image_skill_missing" : "video_skill_missing",
      imagePromptMode,
    });
    return { pack: stampEvidenceProductEngine(input.pack), engineAudit };
  }

  const vocabularyBase = buildStartFramePromptEngineVocabularyBase(input.loopInput, input.pack);
  const nextShots = await Promise.all(
    input.pack.shots.map(shot =>
      applyStartFramePromptEngineToShot({
        shot,
        pack: input.pack,
        loopInput: input.loopInput,
        imageBudget: input.imageBudget,
        imagePromptMode,
        imageSkillBody: skills.imageSkillBody!,
        videoSkillBody: skills.videoSkillBody!,
        vocabularyBase,
        effects,
        engineAudit,
      })
    )
  );

  return { pack: { ...input.pack, shots: nextShots }, engineAudit };
}

/**
 * Production default engine call — a single scoped skill invocation (mirrors
 * `buildProductionSequentialSingleShotRefreshEffects`'s shape exactly: policy
 * -> provider -> `executeSharedSkillTextRuntime` with a `legacyExecute`
 * closure). Reuses the SEQUENTIAL skill's own resolved model/provider policy
 * rather than resolving one for the (possibly unregistered-in-DB) VD skill —
 * these are loaded as pure disk-based system prompts, never through the
 * skill registry. NOT exercised by unit tests, which always inject the
 * engine effects directly.
 */
async function invokeStartFramePromptEngineSkillCall(args: {
  ctx: { skill: SkillDefinition; loopInput: SequentialStoryboardSkillLoopInput };
  systemPrompt: string;
  userPrompt: string;
  fieldLabel: "start_frame_image_prompt" | "video_prompt";
}): Promise<unknown> {
  const { ctx, systemPrompt, userPrompt } = args;
  const policy = await resolveSkillExecutionPolicy({
    skill: ctx.skill,
    conversationModel: ctx.loopInput.model ?? null,
  });
  if (!policy.modelId) {
    throw new Error(
      "product-review-sequential-storyboard cinematic prompt engine has no enabled LLM model"
    );
  }
  const provider = await getProviderForModel(policy.modelId, {
    preferredProviderId: policy.preferredProviderId,
    strictProviderPin: policy.strictProviderPin,
    allowFreeModels: policy.allowFreeModels,
  });
  if (!provider) {
    throw new Error(`No provider available for cinematic prompt engine model ${policy.modelId}`);
  }
  const execution = await executeSharedSkillTextRuntime({
    tenantId: ctx.loopInput.tenantId,
    userId: ctx.loopInput.userId,
    objective: `Author the cinematic ${args.fieldLabel} for ONE sequential review shot (style engine).`,
    originSurface: ctx.loopInput.originSurface ?? "marketplace_capture",
    entryPoint: "marketplace_auto_review_stage",
    modelConfig: buildRuntimeModelConfig({
      modelId: policy.modelId,
      providerId: provider.providerId,
      resolvedGatewayModelId: policy.modelId,
    }),
    skillSlugs: [PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID],
    systemPrompt,
    userPrompt,
    planContext: {
      caller: "marketplace_auto_review",
      runId: ctx.loopInput.runId ?? null,
      requiredSkill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
      selectedSkill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
      cinematicPromptEngine: true,
      cinematicPromptEngineField: args.fieldLabel,
    },
    dynamicParams: { cinematic_prompt_engine_field: args.fieldLabel },
    referenceImages: [],
    publicUrl: ctx.loopInput.publicUrl ?? null,
    requestLabel: "marketplace-auto-review-sequential-storyboard-cinematic-prompt-engine",
    runId: ctx.loopInput.runId ?? undefined,
    schemaHint: {
      name: "product_review_sequential_storyboard_cinematic_prompt_engine_output",
      validationMode: "structured_json",
    },
    legacyExecute: async () => {
      const llmResult = await executeWithFallback({
        model: policy.modelId!,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
        userId: ctx.loopInput.userId,
        preferredProvider: policy.preferredProviderId,
        strictProviderPin: policy.strictProviderPin,
        maxTokens: 1200,
        temperature: 0.5,
        disableProviderFallbacks: true,
        allowFreeModels: policy.allowFreeModels,
      });
      if (llmResult.type !== "success") {
        const errorMessage =
          llmResult.type === "error"
            ? llmResult.error
            : `provider fallback required from ${llmResult.from.providerName} to ${llmResult.to.providerName}, but provider fallback is disabled`;
        throw new Error(`cinematic prompt engine LLM call failed: ${errorMessage}`);
      }
      const rawContent = extractSequentialStoryboardLlmContent(llmResult.response);
      if (!rawContent) {
        throw new Error("cinematic prompt engine returned empty output");
      }
      const usage = {
        promptTokens: Number(
          (llmResult.response as { usage?: { prompt_tokens?: number } })?.usage?.prompt_tokens ?? 0
        ),
        completionTokens: Number(
          (llmResult.response as { usage?: { completion_tokens?: number } })?.usage
            ?.completion_tokens ?? 0
        ),
      };
      const creditsUsed = await calculateCreditsForLLMDynamic(
        usage.promptTokens,
        usage.completionTokens,
        policy.modelId!
      );
      if (creditsUsed > 0) {
        await deductCredits({
          userId: ctx.loopInput.userId,
          tenantId: ctx.loopInput.tenantId,
          amount: creditsUsed,
          description: "Marketplace Auto Review sequential storyboard cinematic prompt engine",
          idempotencyKey: [
            "marketplace-auto-review",
            "sequential-storyboard-cinematic-prompt-engine",
            ctx.loopInput.runId ?? "no-run",
            args.fieldLabel,
            nanoid(8),
          ].join(":"),
          skillSlug: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
          sourceType: "skill",
          metadata: {
            skill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
            runtimeKind: "llm",
            originSurface: "marketplace_capture",
            entryPoint: "marketplace_auto_review_stage",
            runId: ctx.loopInput.runId ?? null,
            field: args.fieldLabel,
            model: policy.modelId!,
            provider: llmResult.providerName,
          },
        });
      }
      return {
        rawContent,
        usage,
        creditsUsed,
        providerName: llmResult.providerName,
        modelId: policy.modelId,
        rawResponse: llmResult.response,
      };
    },
  });
  return parseSequentialStoryboardLlmOutput(execution.value.rawContent);
}

function buildProductionStartFramePromptEngineEffects(ctx: {
  skill: SkillDefinition;
  loopInput: SequentialStoryboardSkillLoopInput;
}): StartFramePromptEngineEffects {
  return {
    async loadEngineSkillBodies({ imagePromptMode }) {
      return {
        imageSkillBody: loadVerticalDramaSkillBodyFromDisk(
          resolveStartFramePromptEngineImageSkillFolder(imagePromptMode)
        ),
        videoSkillBody: loadVerticalDramaSkillBodyFromDisk(VD_SHOT_VIDEO_PROMPT_SKILL_FOLDER),
      };
    },
    async invokeImagePromptEngine({ systemPrompt, userPrompt }) {
      return invokeStartFramePromptEngineSkillCall({
        ctx,
        systemPrompt,
        userPrompt,
        fieldLabel: "start_frame_image_prompt",
      });
    },
    async invokeVideoPromptEngine({ systemPrompt, userPrompt }) {
      return invokeStartFramePromptEngineSkillCall({
        ctx,
        systemPrompt,
        userPrompt,
        fieldLabel: "video_prompt",
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Production default effects (prod defaults wired in this same file,         */
/* videoProjectQualityLoop.ts DI shape) — NOT exercised by unit tests, which  */
/* always inject `invokeSkillRound` before reaching this closure.             */
/* -------------------------------------------------------------------------- */

export function extractSequentialStoryboardLlmContent(response: unknown): string {
  const content = (response as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof (part as { text?: unknown })?.text === "string" ? (part as { text: string }).text : ""))
      .join("")
      .trim();
  }
  return "";
}

function buildSequentialStoryboardVisionMessages(input: {
  systemPrompt: string;
  userPrompt: string;
  referenceImages: string[];
}): Message[] {
  const userContent: Message["content"] = [
    { type: "text", text: input.userPrompt },
    ...input.referenceImages
      .filter(Boolean)
      .map(url => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
  ];
  return [
    { role: "system", content: input.systemPrompt },
    { role: "user", content: userContent },
  ];
}

function parseSequentialStoryboardLlmOutput(rawContent: string): unknown {
  const parsed = extractJson(rawContent);
  // Weak-model wrapper unwrap (field evidence 2026-07-23: rounds failed
  // `shots_missing` while the model plainly authored a full pack — some
  // models nest the object under a single wrapper key like `output` /
  // `result` / the schema name). If the top level has no shots but exactly
  // one child object DOES, that child is the pack.
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    !Array.isArray((parsed as Record<string, unknown>).shots)
  ) {
    const record = parsed as Record<string, unknown>;
    const childrenWithShots = Object.values(record).filter(
      value =>
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray((value as Record<string, unknown>).shots)
    );
    if (childrenWithShots.length === 1) {
      return childrenWithShots[0];
    }
  }
  return parsed;
}

/**
 * Feature 136 hardening (2026-07-24 field incident: run
 * mar_76cb03fe0f29a20ec6422480f5a6840b, redraft #8 — all 3 authoring rounds
 * died identically on "No endpoints found that support image input" because
 * the resolved model's `supportsVision` flag was stale relative to the
 * provider's live catalog, and every TS-level round re-resolved the SAME
 * broken model). Routes the round's authoring call through the EXISTING
 * shared multi-model fallback helper (`executeSkillLlmWithFallback`,
 * `skillModelFallback.ts` — already production-proven by
 * `teamRunSkillExecutor.ts`, `verticalDramaImproveScript.ts`,
 * `presentationArticleGenerator.ts`, `routers/chat.ts`) instead of a single
 * `executeWithFallback` call, so a HARD model failure tries the next
 * priority-ranked candidate (same capability requirements) WITHIN this same
 * round, instead of burning every TS-level round on one broken model before
 * falling through to the degraded deterministic pack.
 *
 * Extracted from the `legacyExecute` closure (rather than inlined) so it is
 * directly unit-testable without `executeSharedSkillTextRuntime`'s feature
 * -flag / agent-runtime selection machinery — see the `...ForTest` export.
 *
 * Contract preserved exactly: same round/retry shape (throws on total
 * failure, caught by the outer loop and recorded as `invocation_failed`,
 * exactly as before), same credit idempotency key shape
 * (`marketplace-auto-review:sequential-storyboard:<runId>[:g<N>]:<round>`),
 * same duplicate-ledger-key swallow (a resumed/retried round re-charging the
 * same attempt is not a failure), same `SharedSkillRuntimeTextResult` return
 * shape `legacyExecute` must produce.
 *
 * ONE deliberate behavior change: `modelId` / `providerName` / credit
 * charging now reflect whichever candidate model ACTUALLY produced the
 * content, not the originally-resolved `policy.modelId` —
 * `lastInvokedModelByRunKey` (the quality-breaker bridge) is stamped with
 * THIS served model, never the first one merely attempted. A second,
 * additive behavior change: provider-level fallback is now possible per
 * candidate model (delegated to `executeSkillLlmWithFallback`'s own proven
 * provider retry) where the old code passed `disableProviderFallbacks:
 * true`; this skill's own `strict_provider_pin: false` / unset
 * `preferredProviderId` make that inert today, called out here for anyone
 * re-reading this later.
 *
 * Deliverable 2 (self-healing capability flag, same incident): every FAILED
 * fallback attempt is scanned for a DEFINITIVE "this model cannot accept
 * image input" provider error; each match fires (never blocks/throws)
 * `recordModelVisionCapabilityFailure` so `model_provider_map.supportsVision`
 * self-corrects for THAT modelId regardless of whether this round ultimately
 * succeeded via a later candidate.
 */
async function invokeSequentialStoryboardAuthoringCall(args: {
  ctx: { input: SequentialStoryboardSkillLoopInput };
  policy: SkillExecutionPolicyResult;
  systemPrompt: string;
  userPrompt: string;
  referenceImages: string[];
  round: 1 | 2 | 3;
}): Promise<{
  rawContent: string;
  usage: { promptTokens: number; completionTokens: number };
  creditsUsed: number;
  providerName: string | null;
  modelId: string | null;
  rawResponse?: unknown;
}> {
  const { ctx, policy, systemPrompt, userPrompt, referenceImages, round } = args;
  const providerReferenceImages = await resolveExternalMediaReferenceUrls(
    referenceImages,
    { userId: ctx.input.userId, tenantId: ctx.input.tenantId },
    ctx.input.publicUrl,
  ) ?? [];

  const fallbackResult = await executeSkillLlmWithFallback({
    // buildSequentialStoryboardVisionMessages is declared to return the wide
    // `Message[]` shape (`_core/llm.ts`, needed for its image_url content
    // parts) — structurally a superset of what this call needs
    // (`{role, content: string | unknown[]}[]`; never a bare non-array
    // content object at runtime). Cast rather than widen the shared
    // `SkillLlmRequest` type for one caller.
    messages: buildSequentialStoryboardVisionMessages({
      systemPrompt,
      userPrompt,
      referenceImages: providerReferenceImages,
    }) as unknown as SkillLlmRequest["messages"],
    skillSlug: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
    userId: ctx.input.userId,
    executionPolicy: policy,
    maxTokens: 8000,
    temperature: 0.4,
  });

  // Deliverable 2 — fire-and-forget, independent of whether this round
  // ultimately succeeds via a later candidate. See modelVisionCapabilityBreaker.ts.
  for (const attempt of fallbackResult.attempts) {
    if (!attempt.success && isDefinitiveVisionCapabilityError(attempt.errorMessage)) {
      void recordModelVisionCapabilityFailure({
        modelId: attempt.modelId,
        errorMessage: attempt.errorMessage,
        runId: ctx.input.runId ?? null,
      });
    }
  }

  if (!fallbackResult.success) {
    throw new Error(
      `product-review-sequential-storyboard LLM call failed: ${fallbackResult.error}`
    );
  }
  const rawContent = fallbackResult.content ?? "";
  if (!rawContent.trim()) {
    throw new Error("product-review-sequential-storyboard returned empty output");
  }

  // The model that ACTUALLY produced the output — may differ from
  // policy.modelId when an earlier candidate hit a hard failure and this
  // call fell over to the next one within the SAME round. Every downstream
  // bookkeeping keys off THIS, never the originally-resolved policy.modelId.
  const servedModelId = fallbackResult.modelId || policy.modelId!;
  rememberInvokedModelForRun(ctx.input.runId, servedModelId);

  const usage = {
    promptTokens: fallbackResult.inputTokens ?? 0,
    completionTokens: fallbackResult.outputTokens ?? 0,
  };
  const creditsUsed = await calculateCreditsForLLMDynamic(
    usage.promptTokens,
    usage.completionTokens,
    servedModelId
  );
  if (creditsUsed > 0) {
    const chargeGeneration = Math.max(
      0,
      Math.floor(Number(ctx.input.chargeGeneration) || 0)
    );
    try {
      await deductCredits({
        userId: ctx.input.userId,
        tenantId: ctx.input.tenantId,
        amount: creditsUsed,
        description: "Marketplace Auto Review sequential storyboard skill",
        idempotencyKey: [
          "marketplace-auto-review",
          "sequential-storyboard",
          ctx.input.runId ?? "no-run",
          // generation 0 keeps the legacy key shape byte-identical
          // (resume-compat); redrafts get their own key space.
          ...(chargeGeneration > 0 ? [`g${chargeGeneration}`] : []),
          String(round),
        ].join(":"),
        skillSlug: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
        sourceType: "skill",
        metadata: {
          skill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
          runtimeKind: "llm",
          originSurface: "marketplace_capture",
          entryPoint: "marketplace_auto_review_stage",
          runId: ctx.input.runId ?? null,
          round,
          model: servedModelId,
          provider: fallbackResult.provider?.providerName ?? undefined,
          fallbackAttempts: fallbackResult.attempts.length,
        },
      });
    } catch (chargeError) {
      // Idempotency semantics: a duplicate ledger key means THIS exact
      // attempt was already charged once (resume / retried round). The LLM
      // work above already succeeded — failing the whole round over a
      // duplicate ledger insert turned every redraft into a guaranteed
      // degraded fallback. Only the duplicate case is swallowed; every other
      // ledger error still fails the round (fail-closed on genuinely unpaid
      // work).
      const message = [
        chargeError instanceof Error ? chargeError.message : "",
        chargeError instanceof Error && chargeError.cause instanceof Error
          ? chargeError.cause.message
          : "",
      ].join(" | ");
      if (!/duplicate key|unique constraint|idempoten/i.test(message)) {
        throw chargeError;
      }
      console.warn(
        "[productReviewSequentialStoryboardSkillRunner] duplicate credit idempotency key — attempt already charged, continuing",
        { runId: ctx.input.runId ?? null, round }
      );
    }
  }

  return {
    rawContent,
    usage,
    creditsUsed,
    providerName: fallbackResult.provider?.providerName ?? null,
    modelId: servedModelId,
    rawResponse: fallbackResult.rawData,
  };
}

/** Test-only wrapper (repo `...ForTest` convention). */
export async function invokeSequentialStoryboardAuthoringCallForTest(
  args: Parameters<typeof invokeSequentialStoryboardAuthoringCall>[0]
): ReturnType<typeof invokeSequentialStoryboardAuthoringCall> {
  return invokeSequentialStoryboardAuthoringCall(args);
}

function buildProductionSequentialStoryboardLoopEffects(ctx: {
  skill: SkillDefinition;
  input: SequentialStoryboardSkillLoopInput;
  systemPromptBase: string;
  imageBudget: number;
}): SequentialStoryboardLoopEffects {
  return {
    async invokeSkillRound(args) {
      const policy = await resolveSkillExecutionPolicy({
        skill: ctx.skill,
        conversationModel: ctx.input.model ?? null,
      });
      if (!policy.modelId) {
        throw new Error(
          "product-review-sequential-storyboard skill has no enabled vision-capable LLM model"
        );
      }
      const provider = await getProviderForModel(policy.modelId, {
        preferredProviderId: policy.preferredProviderId,
        strictProviderPin: policy.strictProviderPin,
        allowFreeModels: policy.allowFreeModels,
      });
      if (!provider) {
        throw new Error(
          `No provider available for product-review-sequential-storyboard model ${policy.modelId}`
        );
      }
      const systemPrompt = [ctx.systemPromptBase, args.roundContract]
        .filter(Boolean)
        .join("\n\n");
      const mergedInputs = buildSequentialStoryboardMergedInputs(
        ctx.input,
        ctx.imageBudget,
        args.round,
        args.retained
      );
      const userPrompt = buildCustomSkillUserPrompt(mergedInputs, {
        referenceImageCount: ctx.input.skillVisionUrls.length,
      });

      const execution = await executeSharedSkillTextRuntime({
        tenantId: ctx.input.tenantId,
        userId: ctx.input.userId,
        objective: "Generate the sequential 9-shot product-review storyboard pack.",
        originSurface: ctx.input.originSurface ?? "marketplace_capture",
        entryPoint: "marketplace_auto_review_stage",
        modelConfig: buildRuntimeModelConfig({
          modelId: policy.modelId,
          providerId: provider.providerId,
          resolvedGatewayModelId: policy.modelId,
        }),
        skillSlugs: [PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID],
        systemPrompt,
        userPrompt,
        planContext: {
          caller: "marketplace_auto_review",
          runId: ctx.input.runId ?? null,
          round: args.round,
          requiredSkill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
          selectedSkill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
        },
        dynamicParams: mergedInputs,
        referenceImages: ctx.input.skillVisionUrls,
        publicUrl: ctx.input.publicUrl ?? null,
        requestLabel: "marketplace-auto-review-product-review-sequential-storyboard",
        runId: ctx.input.runId ?? undefined,
        schemaHint: {
          name: "product_review_sequential_storyboard_output",
          validationMode: "structured_json",
        },
        legacyExecute: () =>
          invokeSequentialStoryboardAuthoringCall({
            ctx,
            policy,
            systemPrompt,
            userPrompt,
            referenceImages: ctx.input.skillVisionUrls,
            round: args.round,
          }),
      });

      return parseSequentialStoryboardLlmOutput(execution.value.rawContent) as SequentialStoryboardRoundOutput;
    },
    async persistRoundReport() {
      // Prod default no-op: section-05/06 bind the real
      // `metadataJson.sequentialStoryboard.loopReport.round_N` writer.
    },
    async loadPersistedLoopState() {
      return null;
    },
    async optimizeFinalPrompt(args) {
      const result = await optimizeProductReferenceStoryboardPrompt({
        tenantId: ctx.input.tenantId,
        userId: ctx.input.userId,
        sourcePrompt: args.prompt,
        originSurface: ctx.input.originSurface ?? "marketplace_capture",
        runId: ctx.input.runId ?? null,
        maxOutputChars: args.maxChars,
        promptKind: args.promptKind,
      });
      const optimizedPrompt = result.value.rawContent.trim();
      return {
        prompt: optimizedPrompt,
        audit: {
          reason:
            args.promptKind === "sequential_image"
              ? "final_image_prompt_over_provider_budget"
              : "final_video_prompt_over_provider_budget",
          promptKind: args.promptKind,
          sourceLengthChars: args.prompt.length,
          optimizedLengthChars: optimizedPrompt.length,
          maxOutputChars: args.maxChars,
          // Feature 136 section 12 (§5.5/T6) — a content HASH, never the
          // prompt text itself, so the over-budget audit event can carry a
          // stable correlation id without leaking prompt content.
          promptHash: crypto
            .createHash("sha256")
            .update(optimizedPrompt)
            .digest("hex")
            .slice(0, 16),
        },
      };
    },
    // Feature 136 section 12 (§5.2/§6 files-touched) — production
    // implementation of the `emitAudit` seam section-04 exposed. Sync,
    // catalog-checked, sanitized, never throws.
    emitAudit: buildSequentialLoopAuditEffect({
      runId: ctx.input.runId ?? "unknown-run",
      tenantId: ctx.input.tenantId ?? null,
      userId: ctx.input.userId ?? null,
      productId: null,
      frameStrategy: "sequential_shot_storyboard",
      stageKey: null,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Loop orchestrator (pure DI shape; production defaults merged in above)     */
/* -------------------------------------------------------------------------- */

/**
 * One full Tier-1 orchestration: rounds + retention + preflight + optimizer.
 * Called by section-05's orchestrator inside `prompt_plan`, BEFORE that
 * stage completes. This module never reaches into the stage machine itself.
 */
export async function runProductReviewSequentialStoryboardSkillLoop(
  input: SequentialStoryboardSkillLoopInput,
  effectsOverride?: Partial<SequentialStoryboardLoopEffects>,
  /**
   * Feature 136 section 13 (§4 deliverable 3) — additive, optional 3rd
   * parameter; every existing call site (0/1/2 args) is unaffected. Merged
   * over production defaults exactly like `effectsOverride` above. Kept as
   * its OWN DI bag (not folded into `SequentialStoryboardLoopEffects`) so
   * this section never touches that widely-used type.
   */
  engineEffectsOverride?: Partial<StartFramePromptEngineEffects>
): Promise<SequentialStoryboardSkillLoopResult> {
  const synced = await syncSingleSkillIfChanged(
    PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID
  );
  if (synced.error) {
    throw new Error(
      `${PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID} skill sync failed: ${synced.error}`
    );
  }
  const skill = await getSkillByIdAsync(PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID);
  if (!skill) {
    throw new Error(
      `${PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID} skill not found or not enabled`
    );
  }

  const imageBudget = resolveSequentialImagePromptBudget({
    overrideMaxChars: input.imageBudgetOverride,
    providerMaxPromptLength: input.providerMaxPromptLength,
  });

  // Input-schema audit HARD-FAILS before any provider or credit call — the
  // effects (incl. `invokeSkillRound`) are never even built yet at this point.
  const mergedInputsForAudit = buildSequentialStoryboardMergedInputs(
    input,
    imageBudget,
    null,
    null
  );
  const schemaAudit = auditSequentialStoryboardSkillInput({
    skill,
    mergedInputs: mergedInputsForAudit,
  });
  if (schemaAudit.status === "failed") {
    console.error(
      "[productReviewSequentialStoryboardSkillRunner] input_schema_validation_failed",
      {
        skillId: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
        runId: input.runId ?? null,
        schemaAudit,
      }
    );
    throw new Error(
      [
        "product-review-sequential-storyboard input schema validation failed",
        `schema=${schemaAudit.schemaPath ?? "missing"}`,
        `blockers=${schemaAudit.blockers.join(", ") || "none"}`,
      ].join(": ")
    );
  }

  const config = resolveSequentialStoryboardSkillConfig(skill);
  const runtimeContract = buildSequentialStoryboardRuntimeContract({
    imageBudget,
    referenceManifest: input.referenceManifest,
    productTruthText: input.productTruthText,
    blockedClaims: input.blockedClaims,
    forbiddenClaims: input.forbiddenClaims,
    confirmedAttributes: input.confirmedAttributes,
    childSubjectPolicy: input.childSubjectPolicy,
    targetAudience: input.targetAudience,
    userRequirements: input.userRequirements,
    audioStrategy: input.audioStrategy,
    reviewTone: input.reviewTone,
    videoStructureMode: input.videoStructureMode,
    motionDirection: input.motionDirection,
    creativePresetSelections: input.creativePresetSelections,
    videoModel: input.videoModel,
    guardianPresenceDirective: input.guardianPresenceDirective,
    demonstrationEvidenceDirective: input.demonstrationEvidenceDirective,
    summaryLanguage: input.summaryLanguage,
    dialogueLanguage: input.dialogueLanguage,
    promptLanguage: input.promptLanguage,
  });
  const { systemPromptBase } = composeSequentialStoryboardSystemPromptBase({
    skill,
    runtimeContract,
    productCategory: input.productCategory,
  });

  const prodEffects = buildProductionSequentialStoryboardLoopEffects({
    skill,
    input,
    systemPromptBase,
    imageBudget,
  });
  const effects: SequentialStoryboardLoopEffects = {
    ...prodEffects,
    ...effectsOverride,
  };

  const persisted = await effects.loadPersistedLoopState();
  let retained: SequentialStoryboardPack | null = persisted?.retained ?? null;
  let retainedTotal = persisted?.retainedScoreTotal ?? -Infinity;
  let selectedVersionLabel = persisted?.selectedVersion ?? "none";
  const loopReport: Partial<Record<"round_1" | "round_2" | "round_3", LoopRoundReport>> = {
    ...(persisted?.loopReport ?? {}),
  };
  const retryHistory: Array<Record<string, unknown>> = [...(persisted?.retryHistory ?? [])];
  const roundsAlreadyCompleted = Math.min(config.loopRounds, persisted?.roundsCompleted ?? 0);
  const startRound = (roundsAlreadyCompleted + 1) as 1 | 2 | 3;
  // Carries the previous round's rejection reasons into the next round's
  // prompt so the model can actually fix them (see roundContractText below).
  let lastRoundRejectionDirective: string | null = null;

  for (let round = startRound; round <= config.loopRounds; round += 1) {
    const roundNum = round as 1 | 2 | 3;
    const roundKey = `round_${roundNum}` as const;
    const feedback = buildSequentialStoryboardRoundFeedback({
      retained,
      imageBudget,
      manifest: input.referenceManifest,
      childSubjectPolicy: input.childSubjectPolicy,
    });
    const roundContractText = [
      buildSequentialStoryboardRoundFocus(roundNum),
      feedback,
      // Weak-model self-correction (field evidence 2026-07-23): without this
      // the model repeated the SAME shape mistake every round (echoing input
      // fields at top level, dropping loopReport/finalQc, or emitting hollow
      // shots) and every run burned all 3 rounds into the degraded fallback.
      lastRoundRejectionDirective
        ? `## CORRECTIVE DIRECTIVE — PREVIOUS ROUND WAS REJECTED\n${lastRoundRejectionDirective}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const roundStartedAt = Date.now();
    let rawOutput: SequentialStoryboardRoundOutput;
    try {
      rawOutput = await effects.invokeSkillRound({
        round: roundNum,
        roundContract: roundContractText,
        retained,
      });
    } catch (error) {
      retryHistory.push({
        round: roundNum,
        status: "invocation_failed",
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const structural = validateSequentialStoryboardPackStructure(rawOutput);
    if (!structural.ok) {
      retryHistory.push({
        round: roundNum,
        status: "contract_violation",
        reasons: structural.reasons,
        // Parse diagnostics (2026-07-23): `shots_missing` was undebuggable
        // without knowing what the model ACTUALLY returned — record the
        // parsed top-level shape so the next failure names the wrapper/
        // truncation instead of guessing.
        parsedTopLevelKeys:
          rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput)
            ? Object.keys(rawOutput as Record<string, unknown>).slice(0, 16)
            : [`(${Array.isArray(rawOutput) ? "array" : typeof rawOutput})`],
      });
      // Quality circuit breaker: a structural contract violation is a
      // MODEL-attributable output failure (transport/ledger failures take
      // the invocation_failed branch above and never strike).
      if (isRecommendedModelQualityStrikeStatus("contract_violation")) {
        void recordRecommendedModelQualityStrike({
          modelId: lastInvokedModelByRunKey.get(input.runId ?? "no-run"),
          runId: input.runId,
          reason: "contract_violation",
          detail: structural.reasons.join(","),
        });
      }
      lastRoundRejectionDirective = [
        `Round ${roundNum} was rejected: ${structural.reasons.join(", ")}.`,
        "Return ONE JSON object whose TOP-LEVEL keys are exactly: skillVersion, evidenceProfile, claimWhitelist, conflicts, reviewStrategy, childSubjectPolicy, globalContinuity, shots, loopReport, finalQc, referenceManifest.",
        "Do NOT echo input fields (target_audience, review_tone, video_structure_mode, story_arc) at top level.",
        "Every shot must include ALL contract fields: shot_id, purpose, duration_seconds, demonstration_type, depicts_minor, guardian_required, transition_from_previous, visual_summary, dialogue, estimated_speech_seconds, start_frame_image_prompt, image_prompt_character_count, video_prompt, video_prompt_character_count, claim_trace, qc.",
      ].join(" ");
      continue;
    }

    const pack = structural.pack;
    const roundScoresRaw = (pack.loopReport as Record<string, unknown> | undefined)?.[roundKey] as
      | SequentialStoryboardLoopRound
      | undefined;
    const candidates = Array.isArray(roundScoresRaw?.candidates)
      ? roundScoresRaw!.candidates
      : undefined;
    const cappedCandidates = candidates?.slice(0, config.candidateCount);
    const truncatedCandidateCount =
      candidates && candidates.length > config.candidateCount
        ? candidates.length - config.candidateCount
        : 0;
    const { total, normalized } = computeSequentialStoryboardRoundScoreTotal(roundScoresRaw);
    const disqualifiers = findSequentialStoryboardRetentionDisqualifiers(pack, {
      imageBudget,
      audioStrategy: input.audioStrategy ?? null,
    });
    const valid = disqualifiers.length === 0;
    if (!valid) {
      lastRoundRejectionDirective = `Round ${roundNum} was disqualified: ${disqualifiers.join(", ")}. Fix these exact problems (keep everything else that scored well) and return the COMPLETE JSON object again — every shot needs its full contract fields, including non-empty Thai dialogue when the audio strategy is not silent.`;
      // Quality circuit breaker: retention disqualifiers are output-quality
      // failures (hollow shots, missing dialogue, claim/budget violations).
      void recordRecommendedModelQualityStrike({
        modelId: lastInvokedModelByRunKey.get(input.runId ?? "no-run"),
        runId: input.runId,
        reason: "disqualified",
        detail: disqualifiers.join(","),
      });
    }

    const report: LoopRoundReport = {
      ...(roundScoresRaw as Record<string, unknown>),
      candidates: cappedCandidates,
      truncatedCandidateCount,
      round: roundNum,
      totalScore: total,
      normalizedScore: normalized,
      valid,
      disqualifiers,
      retained: false,
    };

    if (valid && total > retainedTotal) {
      retained = pack;
      retainedTotal = total;
      report.retained = true;
      selectedVersionLabel = roundKey;
    }

    loopReport[roundKey] = report;
    await effects.persistRoundReport(roundNum, report);
    // Feature 136 section 12 (§5.5) — observability only; never gates the
    // retain/break decision above, which is already final by this point.
    await effects.emitAudit("sequential_skill_plan_round", {
      ...report,
      runId: input.runId ?? null,
      round: roundNum,
      model: input.model ?? null,
      durationMs: Date.now() - roundStartedAt,
    });
    retryHistory.push({
      round: roundNum,
      status: "completed",
      valid,
      total,
      normalized,
      // Evidence (2026-07-23): an invalid completed round was undebuggable —
      // loopReport carries the disqualifiers but gets wiped by the degraded
      // overwrite, so record them here too.
      ...(disqualifiers.length > 0 ? { disqualifiers } : {}),
    });

    if (valid && normalized >= config.minPromptScoreToPass) {
      break;
    }
  }

  if (!retained) {
    await effects.emitAudit("sequential_prompt_degraded_fallback", {
      runId: input.runId ?? null,
      retryHistory,
    });
    throw new SequentialStoryboardStructuralError(
      "product-review-sequential-storyboard: every loop round failed structurally; the SVC integration layer must assemble the degraded deterministic fallback",
      retryHistory
    );
  }

  // Feature 136 section 13 (§3/§5 deliverable 3) — StartFramePromptEngine
  // seam. Runs BEFORE budget finalization and preflight so both stay exactly
  // as mandatory for a cinematic rewrite as for the evidence_product path
  // (spec §3.2). A no-op (loader never called) for the default/absent style.
  const engineProdEffects = buildProductionStartFramePromptEngineEffects({ skill, loopInput: input });
  const engineEffects: StartFramePromptEngineEffects = {
    ...engineProdEffects,
    ...engineEffectsOverride,
  };
  const engineResult = await applyStartFramePromptEngineToPack(
    { pack: retained, loopInput: input, imageBudget },
    engineEffects
  );
  retained = engineResult.pack;
  for (const entry of engineResult.engineAudit) {
    await effects.emitAudit(
      String(entry.event ?? "sequential_cinematic_prompt_engine_event"),
      entry
    );
  }

  const { pack: finalizedPack, auditEntries } = await finalizeSequentialStoryboardPackBudgets({
    pack: retained,
    imageBudget,
    effects,
  });
  for (const entry of auditEntries) {
    await effects.emitAudit(String(entry.reason ?? "final_prompt_optimized"), entry);
  }

  const preflight = validateSequentialStoryboardPackPreflight({
    pack: finalizedPack,
    imageBudget,
    manifest: input.referenceManifest,
    childSubjectPolicy: input.childSubjectPolicy,
    assemblyDocumented: Boolean(finalizedPack.evidenceProfile?.assembly_documented),
  });

  // Fail-closed invariant (§7.6, VD precedent): a mapping mismatch surviving
  // the corrective retry (feedback re-injection across rounds) must NEVER be
  // persisted or submitted — throw rather than return a contradictory pack.
  if (preflight.blockers.includes("reference_index_mapping_mismatch")) {
    throw new Error(
      "product-review-sequential-storyboard: reference index mapping mismatch survived the corrective retry — refusing to persist or submit a contradictory prompt"
    );
  }

  return {
    pack: finalizedPack,
    loopReport: {
      ...(loopReport as SequentialStoryboardLoopReport),
      selected_version: selectedVersionLabel,
    },
    selectedVersion: selectedVersionLabel,
    degraded: false,
    preflight,
    retryHistory,
  };
}

/* -------------------------------------------------------------------------- */
/* Section 08 (§6.5) — single-shot prompt refresh. NEVER the 3-round loop.    */
/* -------------------------------------------------------------------------- */

/**
 * Input contract for a single-shot refresh. Deliberately separate from
 * `SequentialStoryboardSkillLoopInput` — this never drives the 3-round loop,
 * only ONE scoped skill call for ONE shot. Shape mirrors VD's
 * `generateStartFrameShotPrompt` (`verticalDramaStartFrameGeneration.ts:1349`).
 */
export type SequentialSingleShotRefreshInput = {
  tenantId: string;
  userId: number;
  runId?: string | null;
  model?: string | null;
  publicUrl?: string | null;
  originSurface?: "marketplace_capture" | "media_studio" | null;

  targetShotId: number;
  /** Effective budget from `resolveSequentialImagePromptBudget` — the CALLER
   *  resolves this (same helper the loop and the preflight use). */
  imageBudget: number;
  referenceManifest: SequentialReferenceManifestEntry[];
  /** ALL resolvable product refs incl. evidence-only (mirrors the loop input). */
  skillVisionUrls: string[];
  /** Frozen `sequentialStoryboard.globalContinuity` — carried verbatim, never
   *  re-derived here (this module has no access to the full pack machinery). */
  globalContinuity?: Record<string, unknown> | null;
  shotContract: {
    purpose?: string;
    /** The shot's own narrative brief (staged planner's `storySummary`),
     *  distinct from `purpose` (title) and `visual_summary` (image
     *  direction only) — input-only context, never part of the skill's
     *  OUTPUT schema. */
    story_summary?: string;
    dialogue: string;
    duration_seconds: number;
    demonstration_type: SequentialStoryboardShot["demonstration_type"];
    depicts_minor: boolean;
    guardian_required: boolean;
    transition_from_previous?: string;
    visual_summary?: string;
  };
  previousShotVisualSummary?: string | null;
  nextShotVisualSummary?: string | null;
  childSubjectPolicy: ChildSubjectPolicyInput;
  blockedClaims?: string[] | null;
  forbiddenClaims?: string[] | null;
  productCategory?: string | null;
  /** Feature 136 section 07 (§3.4) — see `SequentialStoryboardRuntimeContractInput`. */
  guardianPresenceDirective?: string | null;
  demonstrationEvidenceDirective?: string | null;
  /** See `SequentialStoryboardRuntimeContractInput.userInstruction`. */
  userInstruction?: string | null;
  summaryLanguage?: SequentialStoryboardLanguage | null;
  dialogueLanguage?: SequentialStoryboardLanguage | null;
  promptLanguage?: SequentialStoryboardLanguage | null;
};

export type SequentialSingleShotRefreshEffects = {
  invokeSingleShotSkill(args: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<Record<string, unknown>>;
  emitAudit(event: string, payload: Record<string, unknown>): Promise<void> | void;
};

/** ONE bounded retry (2 total attempts) — never a 3-round loop, and never a
 *  model switch to fix weak-model JSON (repo cost policy,
 *  `project_vd_weak_model_json_class`). */
const SEQUENTIAL_SINGLE_SHOT_REFRESH_MAX_ATTEMPTS = 2;

/**
 * Reuses the full-loop contract builder verbatim (§6.5 — "do not fork a
 * second contract assembler") and appends the single-shot-only lines:
 * `single_shot_mode`, `target_shot_id`, the frozen global continuity, the
 * shot contract, and the adjacent shots' `visual_summary` for continuity.
 */
function buildSequentialSingleShotRefreshContract(
  input: SequentialSingleShotRefreshInput
): string {
  const base = buildSequentialStoryboardRuntimeContract({
    imageBudget: input.imageBudget,
    referenceManifest: input.referenceManifest,
    blockedClaims: input.blockedClaims,
    forbiddenClaims: input.forbiddenClaims,
    childSubjectPolicy: input.childSubjectPolicy,
    summaryLanguage: input.summaryLanguage,
    dialogueLanguage: input.dialogueLanguage,
    promptLanguage: input.promptLanguage,
    guardianPresenceDirective: input.guardianPresenceDirective,
    demonstrationEvidenceDirective: input.demonstrationEvidenceDirective,
    userInstruction: input.userInstruction,
  });
  const lines = [
    base,
    "## Single Shot Refresh Mode",
    "single_shot_mode: true",
    `target_shot_id: ${input.targetShotId}`,
    "## Global Continuity (frozen — do not alter)",
    JSON.stringify(input.globalContinuity ?? {}),
    "## Shot Contract (rewrite ONLY this shot)",
    JSON.stringify(input.shotContract),
    "## Adjacent Shot Continuity",
    `previous_shot_visual_summary: ${input.previousShotVisualSummary || "(none — this is shot 1)"}`,
    `next_shot_visual_summary: ${input.nextShotVisualSummary || "(none — this is the last shot)"}`,
    `summary_language: ${input.summaryLanguage || "th"}`,
    `dialogue_language: ${input.dialogueLanguage || "th"}`,
    `prompt_language: ${input.promptLanguage || "en"}`,
    "LANGUAGE SEPARATION LOCK: visual_summary and dialogue must follow their own selected languages; both image and video prompts must follow prompt_language.",
    "## Output contract",
    '  Return ONLY a JSON object: {"start_frame_image_prompt": string, "video_prompt": string, "camera_beats": [{"beat_id": number, "duration_seconds": number, "camera": string, "movement": string, "action": string, "transition": string}]}.',
    "Rewrite ONLY this one shot. Never reference or alter any other shot. Never emit loopReport, finalQc, claim_trace, or any other shot's fields.",
  ];
  return lines.join("\n");
}

/** Test-only wrapper (repo `...ForTest` convention). */
export function buildSequentialSingleShotRefreshContractForTest(
  input: SequentialSingleShotRefreshInput
): string {
  return buildSequentialSingleShotRefreshContract(input);
}

/**
 * Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1,
 * shots 1 and 8, both single-shot-refresh attempts): the weak-model JSON
 * failure class already documented at length in `extractJson`
 * (verticalDramaStoryBible.ts) — "Expected ',' or ']' after array element" /
 * "Unterminated string" — consistently landed inside the OPTIONAL
 * `camera_beats` array (positions ~2400-3800, right after the two required
 * string fields, which are each individually well-formed). Extracts a
 * single top-level `"key":"value"` JSON string field via a quote-aware
 * regex, bypassing a full `JSON.parse` of the whole response. Used only as
 * a fallback AFTER `extractJson` has already thrown for the full response —
 * never replaces the primary parse path, and only salvages the two
 * REQUIRED fields (`start_frame_image_prompt`, `video_prompt`); it
 * deliberately does not attempt to parse `camera_beats` at all, since a
 * malformed array can't be regex-salvaged safely and the caller already
 * treats `camera_beats` as fully optional.
 */
function extractJsonStringField(text: string, key: string): string | null {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "s");
  const match = text.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return null;
  }
}

/** Test-only wrapper (repo `...ForTest` convention). */
export function extractJsonStringFieldForTest(
  text: string,
  key: string
): string | null {
  return extractJsonStringField(text, key);
}

function parseSequentialSingleShotRefreshOutput(
  raw: unknown
): {
  start_frame_image_prompt: string;
  video_prompt?: string;
  camera_beats?: SequentialStoryboardCameraBeat[];
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const startFrameImagePrompt =
    typeof value.start_frame_image_prompt === "string"
      ? value.start_frame_image_prompt.trim()
      : "";
  if (!startFrameImagePrompt) return null;
  const videoPrompt =
    typeof value.video_prompt === "string" ? value.video_prompt.trim() : undefined;
  const cameraBeats = Array.isArray(value.camera_beats)
    ? value.camera_beats
        .map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const beat = entry as Record<string, unknown>;
          const camera = typeof beat.camera === "string" ? beat.camera.trim() : "";
          const movement =
            typeof beat.movement === "string" ? beat.movement.trim() : "";
          const action = typeof beat.action === "string" ? beat.action.trim() : "";
          if (!camera || !movement || !action) return null;
          const duration = Number(beat.duration_seconds);
          return {
            beat_id: Number.isFinite(Number(beat.beat_id))
              ? Math.max(1, Math.floor(Number(beat.beat_id)))
              : index + 1,
            duration_seconds: Number.isFinite(duration)
              ? Math.max(0.5, Math.min(10, duration))
              : 1,
            camera,
            movement,
            action,
            ...(typeof beat.transition === "string" && beat.transition.trim()
              ? { transition: beat.transition.trim() }
              : {}),
          } satisfies SequentialStoryboardCameraBeat;
        })
        .filter((entry): entry is SequentialStoryboardCameraBeat => entry !== null)
        .slice(0, 4)
    : undefined;
  return {
    start_frame_image_prompt: startFrameImagePrompt,
    video_prompt: videoPrompt,
    ...(cameraBeats && cameraBeats.length > 0
      ? { camera_beats: cameraBeats }
      : {}),
  };
}

/**
 * Production default effect: ONE skill invocation via the SAME
 * `executeSharedSkillTextRuntime` + `legacyExecute` pattern as the full
 * loop's `invokeSkillRound` (`buildProductionSequentialStoryboardLoopEffects`
 * above), scoped to a single shot. Not exercised by unit tests, which always
 * inject `invokeSingleShotSkill` before reaching this closure (mirrors the
 * loop's own DI convention).
 */
function buildProductionSequentialSingleShotRefreshEffects(ctx: {
  skill: SkillDefinition;
  input: SequentialSingleShotRefreshInput;
}): SequentialSingleShotRefreshEffects {
  return {
    async invokeSingleShotSkill(args) {
      const policy = await resolveSkillExecutionPolicy({
        skill: ctx.skill,
        conversationModel: ctx.input.model ?? null,
      });
      if (!policy.modelId) {
        throw new Error(
          "product-review-sequential-storyboard skill has no enabled vision-capable LLM model"
        );
      }
      const provider = await getProviderForModel(policy.modelId, {
        preferredProviderId: policy.preferredProviderId,
        strictProviderPin: policy.strictProviderPin,
        allowFreeModels: policy.allowFreeModels,
      });
      if (!provider) {
        throw new Error(
          `No provider available for product-review-sequential-storyboard model ${policy.modelId}`
        );
      }
      const execution = await executeSharedSkillTextRuntime({
        tenantId: ctx.input.tenantId,
        userId: ctx.input.userId,
        objective:
          "Refresh the start-frame/video prompt for ONE sequential review shot.",
        originSurface: ctx.input.originSurface ?? "marketplace_capture",
        entryPoint: "marketplace_auto_review_stage",
        modelConfig: buildRuntimeModelConfig({
          modelId: policy.modelId,
          providerId: provider.providerId,
          resolvedGatewayModelId: policy.modelId,
        }),
        skillSlugs: [PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID],
        systemPrompt: args.systemPrompt,
        userPrompt: args.userPrompt,
        planContext: {
          caller: "marketplace_auto_review",
          runId: ctx.input.runId ?? null,
          requiredSkill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
          selectedSkill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
          singleShotRefresh: true,
          targetShotId: ctx.input.targetShotId,
        },
        dynamicParams: {
          single_shot_mode: true,
          target_shot_id: ctx.input.targetShotId,
        },
        referenceImages: ctx.input.skillVisionUrls,
        publicUrl: ctx.input.publicUrl ?? null,
        requestLabel:
          "marketplace-auto-review-product-review-sequential-storyboard-single-shot-refresh",
        runId: ctx.input.runId ?? undefined,
        schemaHint: {
          name: "product_review_sequential_storyboard_single_shot_output",
          validationMode: "structured_json",
        },
        legacyExecute: async () => {
          const providerReferenceImages = await resolveExternalMediaReferenceUrls(
            ctx.input.skillVisionUrls,
            { userId: ctx.input.userId, tenantId: ctx.input.tenantId },
            ctx.input.publicUrl,
          ) ?? [];
          const llmResult = await executeWithFallback({
            model: policy.modelId!,
            messages: buildSequentialStoryboardVisionMessages({
              systemPrompt: args.systemPrompt,
              userPrompt: args.userPrompt,
              referenceImages: providerReferenceImages,
            }),
            stream: false,
            userId: ctx.input.userId,
            preferredProvider: policy.preferredProviderId,
            strictProviderPin: policy.strictProviderPin,
            maxTokens: 2000,
            temperature: 0.4,
            disableProviderFallbacks: true,
            allowFreeModels: policy.allowFreeModels,
          });
          if (llmResult.type !== "success") {
            const errorMessage =
              llmResult.type === "error"
                ? llmResult.error
                : `provider fallback required from ${llmResult.from.providerName} to ${llmResult.to.providerName}, but provider fallback is disabled`;
            throw new Error(
              `product-review-sequential-storyboard single-shot refresh LLM call failed: ${errorMessage}`
            );
          }
          const rawContent = extractSequentialStoryboardLlmContent(
            llmResult.response
          );
          if (!rawContent) {
            throw new Error(
              "product-review-sequential-storyboard single-shot refresh returned empty output"
            );
          }
          const usage = {
            promptTokens: Number(
              (llmResult.response as { usage?: { prompt_tokens?: number } })
                ?.usage?.prompt_tokens ?? 0
            ),
            completionTokens: Number(
              (
                llmResult.response as {
                  usage?: { completion_tokens?: number };
                }
              )?.usage?.completion_tokens ?? 0
            ),
          };
          const creditsUsed = await calculateCreditsForLLMDynamic(
            usage.promptTokens,
            usage.completionTokens,
            policy.modelId!
          );
          if (creditsUsed > 0) {
            await deductCredits({
              userId: ctx.input.userId,
              tenantId: ctx.input.tenantId,
              amount: creditsUsed,
              description:
                "Marketplace Auto Review sequential single-shot prompt refresh",
              idempotencyKey: [
                "marketplace-auto-review",
                "sequential-storyboard-single-shot-refresh",
                ctx.input.runId ?? "no-run",
                String(ctx.input.targetShotId),
                nanoid(8),
              ].join(":"),
              skillSlug: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
              sourceType: "skill",
              metadata: {
                skill: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID,
                runtimeKind: "llm",
                originSurface: "marketplace_capture",
                entryPoint: "marketplace_auto_review_stage",
                runId: ctx.input.runId ?? null,
                targetShotId: ctx.input.targetShotId,
                model: policy.modelId!,
                provider: llmResult.providerName,
              },
            });
          }
          return {
            rawContent,
            usage,
            creditsUsed,
            providerName: llmResult.providerName,
            modelId: policy.modelId,
            rawResponse: llmResult.response,
          };
        },
      });
      try {
        const parsed = parseSequentialStoryboardLlmOutput(
          execution.value.rawContent
        );
        return (
          parsed && typeof parsed === "object" ? parsed : {}
        ) as Record<string, unknown>;
      } catch (error) {
        // Weak-model JSON failure class fallback (see
        // extractJsonStringField's doc comment above) — salvage the two
        // required fields via lenient regex extraction when the full
        // response fails to parse, instead of discarding a response that
        // usually only has a malformed OPTIONAL `camera_beats` array.
        const startFrame = extractJsonStringField(
          execution.value.rawContent,
          "start_frame_image_prompt"
        );
        if (!startFrame) throw error;
        const video = extractJsonStringField(
          execution.value.rawContent,
          "video_prompt"
        );
        console.warn(
          "[productReviewSequentialStoryboardSkillRunner][singleShotRefresh] salvaged start_frame_image_prompt/video_prompt via regex fallback after JSON parse failure (camera_beats likely malformed)",
          { error: error instanceof Error ? error.message : String(error) }
        );
        return {
          start_frame_image_prompt: startFrame,
          ...(video ? { video_prompt: video } : {}),
        };
      }
    },
    emitAudit(event, payload) {
      console.info(
        `[productReviewSequentialStoryboardSkillRunner][singleShotRefresh] ${event}`,
        payload
      );
    },
  };
}

/**
 * ONE scoped skill call for ONE shot (section 08 §6.5). Never runs the
 * 3-round loop, never touches `loopReport`/`selected_version`, and never
 * overwrites a user override — that check is the CALLER's responsibility
 * (SVC skips calling this entirely when a user override already exists);
 * this function is unconditional once invoked. ONE bounded retry (2 total
 * attempts) on a structurally-incomplete response; never switches models to
 * fix weak-model JSON (repo cost policy, `project_vd_weak_model_json_class`).
 * Throws on total failure — the caller (SVC) treats a thrown error the same
 * as a preflight-rejected candidate (fail-open: discard, keep the existing
 * prompt, record `refreshRejectedBlockers`).
 */
export async function refreshSequentialShotPromptWithSkill(
  input: SequentialSingleShotRefreshInput,
  effectsOverride?: Partial<SequentialSingleShotRefreshEffects>
): Promise<{
  startFrameImagePrompt: string;
  videoPrompt?: string;
  cameraBeats?: SequentialStoryboardCameraBeat[];
  degraded: boolean;
}> {
  const synced = await syncSingleSkillIfChanged(
    PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID
  );
  if (synced.error) {
    throw new Error(
      `${PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID} skill sync failed: ${synced.error}`
    );
  }
  const skill = await getSkillByIdAsync(
    PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID
  );
  if (!skill) {
    throw new Error(
      `${PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_SKILL_ID} skill not found or not enabled`
    );
  }
  const { systemPromptBase } = composeSequentialStoryboardSystemPromptBase({
    skill,
    runtimeContract: buildSequentialSingleShotRefreshContract(input),
    productCategory: input.productCategory,
  });
  const userPrompt = buildCustomSkillUserPrompt(
    {
      single_shot_mode: true,
      target_shot_id: input.targetShotId,
      shot_contract: input.shotContract,
    },
    { referenceImageCount: input.skillVisionUrls.length }
  );
  const prodEffects = buildProductionSequentialSingleShotRefreshEffects({
    skill,
    input,
  });
  const effects: SequentialSingleShotRefreshEffects = {
    ...prodEffects,
    ...effectsOverride,
  };

  let lastError: unknown = null;
  for (
    let attempt = 1;
    attempt <= SEQUENTIAL_SINGLE_SHOT_REFRESH_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const raw = await effects.invokeSingleShotSkill({
        systemPrompt: systemPromptBase,
        userPrompt,
      });
      const parsed = parseSequentialSingleShotRefreshOutput(raw);
      if (parsed) {
        return {
          startFrameImagePrompt: parsed.start_frame_image_prompt,
          videoPrompt: parsed.video_prompt,
          ...(parsed.camera_beats
            ? { cameraBeats: parsed.camera_beats }
            : {}),
          degraded: false,
        };
      }
      lastError = new Error(
        "single-shot refresh returned an incomplete prompt pair"
      );
    } catch (error) {
      lastError = error;
    }
    await effects.emitAudit("sequential_single_shot_refresh_attempt_failed", {
      attempt,
      targetShotId: input.targetShotId,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(
        "product-review-sequential-storyboard single-shot refresh failed"
      );
}
