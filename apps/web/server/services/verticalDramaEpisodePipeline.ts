/**
 * Vertical Drama Series — episode stage pipeline runner (spec §11.4 / §11.5).
 *
 * Runs the canonical 15 `VerticalDramaPipelineStage` stages over the six runner
 * modes (`dry_run`, `plan_only`, `render_images`, `render_video`, `full`,
 * `repair`). Each stage produces a `RunResult` (status / next_action /
 * artifactIds / errors / warnings / qc), writes immutable run + artifact-ledger
 * rows, and gates paid generation behind approval checkpoints so nothing paid
 * runs in `dry_run`/`plan_only` or before approval.
 *
 * Provider routing and QC (section 08) are reached only through the thin typed
 * `ProviderRoutingPort` defined here — this file never imports section-08 code.
 * The bundled `createStubProviderRoutingPort()` is dry-run-safe (it renders
 * nothing and spends nothing) so the runner is fully exercisable without
 * provider credentials.
 */

import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaEpisodes,
  verticalDramaEpisodeRuns,
  verticalDramaRunArtifacts,
  verticalDramaApprovalCheckpoints,
  verticalDramaSeries,
  verticalDramaCharacters,
  verticalDramaCharacterAliases,
  verticalDramaLocations,
  mediaModels,
  mediaAssets,
  type VerticalDramaEpisodeRow,
  type VerticalDramaRunArtifactRow,
  type VerticalDramaEpisodeRunRow,
  type VerticalDramaApprovalCheckpointRow,
} from "../../drizzle/schema";
import {
  artifactChecksumSha256,
  computeAutoSubShotCount,
  validateSubShotsForParent,
  VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT,
  // Speaker-aware sub-shots task (Package 5) — SAME deterministic gate
  // `verticalDramaEpisodes.ts`'s `generateShotVideoPrompt` mutation uses
  // (Package 3), reused here rather than reimplemented.
  computeSpeakerSwitchSubShotPlan,
  type SpeakerSwitchSubShotWindow,
  type VerticalDramaStartFramePlan,
  type VerticalDramaSeriesLocale,
  type RunResult,
  type VerticalDramaPipelineStage,
  type VerticalDramaWarning,
  type VerticalDramaQcResult,
  type VerticalDramaSubShot,
  type VerticalDramaSubShotPolicy,
  type VerticalDramaPromptLanguage,
  type VerticalDramaDialogueLanguage,
  type VerticalDramaThaiAccent,
  type VerticalDramaMemoryKind,
  normalizeVerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import { readTargetAudienceRegionFromBible } from "@shared/verticalDramaSeries/targetAudienceRegion";
import { resolveEffectiveImagePromptLanguage } from "@shared/verticalDramaSeries/imagePromptLanguage";
import { resolveEffectiveSeriesVisualIdentity } from "@shared/verticalDramaSeries/seriesLookLock";
import { normalizeVerticalDramaBarrierDialogue } from "@shared/verticalDramaSeries/barrierDialogue";
import {
  detectVerticalDramaDualViewIntent,
  normalizeVerticalDramaBarrierMultiView,
  projectLegacyBarrierDialogueToMultiView,
} from "@shared/verticalDramaSeries/barrierMultiView";
import {
  normalizeVerticalDramaSupportingPresence,
  resolveVerticalDramaSupportingPresenceForShot,
  type VerticalDramaSupportingPresence,
} from "@shared/verticalDramaSeries/supportingPresence";
import {
  normalizeVerticalDramaShotComposition,
} from "@shared/verticalDramaSeries/shotComposition";
// Part B2/B3 (planning/`polished-toasting-gadget.md`) — pure, shared
// formatter for the compact episode plan-context block injected into the
// start-frame + video motion prompt stages below. Safe as a static import
// (no server/DB code, `@shared` module).
import {
  formatStoryScriptEpisodePlanContext,
  type StoryScriptLang,
} from "@shared/verticalDramaSeries/storyScriptText";
// Type-only (erased at runtime — no import-chain side effects in tests).
import type { VerticalDramaEpisodeTieInPlacement } from "@shared/verticalDramaSeries/contentBudget";
import type { VdEpisodeMemory } from "@shared/verticalDramaSeries/seriesMemoryState";
import {
  normalizeVerticalDramaContinuityTimeline,
  selectPriorVerticalDramaMemories,
  validateVerticalDramaContinuity,
  type VerticalDramaContinuityQuarantine,
} from "@shared/verticalDramaSeries/storyContinuity";
import {
  verticalDramaSeriesMemoryService,
  type VerticalDramaSeriesMemoryService,
} from "./verticalDramaSeriesMemory";
import {
  generateEpisodeScript,
  resolveScriptEpisodeMemory,
  scriptBuilderOutputSchema,
  InsufficientCreditsError as ScriptInsufficientCreditsError,
  VdSchemaValidationError as ScriptVdSchemaValidationError,
  type ScriptBuilderOutput,
} from "./verticalDramaScriptGeneration";
// Series memory — Producer B persist (`planning/vd-series-memory-and-lineage/
// plan.md` Stage 1.2). Reuses the SAME `upsertEpisodeMemory` write path
// Producer A (deep-draft) uses — no parallel implementation.
import {
  repairSeriesMemoryContinuity,
  upsertEpisodeMemory,
} from "./verticalDramaSeriesMemoryProjection";
import {
  generateStoryboardShotgrid,
  InsufficientCreditsError as StoryboardInsufficientCreditsError,
  VdSchemaValidationError as StoryboardVdSchemaValidationError,
  type StoryboardShotgridOutput,
  type GenerateStoryboardShotgridParams,
} from "./verticalDramaStoryboardGeneration";
// Deep story drafts hydration (W10-B, added 2026-07-08) — TYPE-ONLY (erased
// at compile time, zero runtime import). The VALUES (`getActiveBreakdown`/
// `readItemShotDrafts`/`readItemCliffhangerLine`) are loaded via a runtime
// `import()` inside `resolveEpisodeDraftHydration` below instead of a static
// import here — see that function's doc comment: `verticalDramaStoryBible.ts`
// transitively imports `enabledLlmModels.ts` -> `../routers/llmProviders.ts`'s
// `adminProcedure`, which this file's OWN test suite
// (`verticalDramaEpisodePipeline.memoryWiring.test.ts`) does not mock — a
// static VALUE import here would load that whole chain, unmocked, at
// test-import time for every test in that file, not just the ones exercising
// this feature. Mirrors `verticalDramaEpisodes.ts`'s established
// `runArcDriftCheckAndProposeIfNeeded` convention for the identical problem.
import type { VdDeepDraftShotDraft } from "./verticalDramaStoryBible";
import {
  generateStartFrameRenderPlan,
  InsufficientCreditsError as StartFrameInsufficientCreditsError,
  VdSchemaValidationError as StartFrameVdSchemaValidationError,
  type StartFrameRenderPlanProjection,
  type VdReferenceMappingWarning,
  // Gap-5 fix (recorded, 2026-07-22) — the canonical persisted per-frame
  // shape, used to type the `previousFramesByShotNumber` map built below
  // (`generateRealStartFramePlan`) and threaded through to
  // `projectStartFramePlan`'s carry-over param.
  type VerticalDramaStartFramePlanFrame,
} from "./verticalDramaStartFrameGeneration";
import {
  generateVideoMotionPromptPack,
  syncDialogueOntoMotionPromptClips,
  syncStartFramesOntoMotionPromptClips,
  // Speaker-aware sub-shots task (Package 5, 2026-07-11 consolidated-clip
  // redesign) — SAME per-shot speaker-switch generator
  // `verticalDramaEpisodes.ts`'s `generateShotVideoPrompt` mutation uses
  // (Package 3), reused here rather than reimplemented.
  generateVerticalDramaShotVideoPromptSpeakerSwitch,
  InsufficientCreditsError as MotionPromptInsufficientCreditsError,
  VdSchemaValidationError as MotionPromptVdSchemaValidationError,
  type VideoMotionPromptPackProjection,
  type ShotVideoPromptCharacterReferenceImage,
} from "./verticalDramaVideoMotionPromptGeneration";
import { verticalDramaCharacterStockService } from "./verticalDramaCharacterStock";
import {
  createVerticalDramaStoryboardHandoff,
  type HandoffResult as VerticalDramaHandoffResult,
} from "./verticalDramaStoryboardHandoff";
import {
  runVerticalDramaSeriesMemoryPlanning,
  InsufficientCreditsError as MemoryPlanningInsufficientCreditsError,
  VdSchemaValidationError as MemoryPlanningVdSchemaValidationError,
  type SeriesMemoryPlannerOutput,
} from "./verticalDramaSeriesMemoryPlanning";
import { ensurePromptWithinLimit } from "./verticalDramaPromptQc";
import { resolveVdImagePromptBudgetForModel } from "./modelPromptBudget";
import { VD_IMAGE_PROMPT_MAX } from "@shared/verticalDramaSeries/contracts";
import { stampArtifactForStoryboard } from "./verticalDramaStoryboardRevision";
import {
  generateEpisodeDialogueAudioPlan,
  buildDialogueAudioPlan,
  InsufficientCreditsError as DialogueAudioPlanInsufficientCreditsError,
  VdSchemaValidationError as DialogueAudioPlanVdSchemaValidationError,
  type DialogueBeatInput,
  type ShotTimingInput,
  type SeriesVoiceBinding,
} from "./verticalDramaDialogueAudio";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import { estimateVerticalDramaSpeechSeconds } from "@shared/verticalDramaSeries/dialogueQuality";
import {
  findMissingCharacterIdentityWarnings,
  type VerticalDramaCharacterDescriptorSource,
} from "@shared/verticalDramaSeries/characterIdentityMap";
import {
  extractShotProductPlacements,
  findPlacementForShot,
  appendProductPresenceDirective,
  resolveProductReferenceImageUrls,
  resolveMarketplaceCaptureProductImageUrls,
  resolveFrameProductReferenceAssetIds,
} from "./verticalDramaProductTieIn";
// Phase 2 of `planning/polished-toasting-gadget.md` (location visual bible,
// dispatch 3/3) — deterministic, no-LLM reconciliation of the storyboard's
// own `distinct_locations[]` groups into durable `vertical_drama_locations`
// roster rows. Safe as a static import: this module only imports
// `drizzle-orm`/`../db`/`../../drizzle/schema`/a pure `@shared` type — it
// does NOT transitively reach `verticalDramaStoryBible.ts` ->
// `enabledLlmModels.ts` -> `adminProcedure`, unlike the dynamic-import-only
// modules this file already documents that concern for.
import { reconcileEpisodeLocations } from "./verticalDramaLocationReconciliation";
import { verticalDramaLocationStockService } from "./verticalDramaLocationStock";
import type { VerticalDramaStoryboardLocationGroup } from "@shared/verticalDramaSeries/storyboardLocations";
import { buildSceneShotGroups } from "@shared/verticalDramaSeries/sceneContinuity";
import { debugError } from "../_core/logger";
import { resolveSceneContinuityLocks } from "./verticalDramaSceneContinuityLock";

/* -------------------------------------------------------------------------- */
/* Canonical stage sequence + phase grouping (spec §11.5 / §16)               */
/* -------------------------------------------------------------------------- */

/** The canonical, ordered 15-stage sequence — the single source of truth. */
export const VERTICAL_DRAMA_PIPELINE_STAGES: readonly VerticalDramaPipelineStage[] =
  [
    "normalize_series_input",
    "plan_episode_script",
    "update_character_visual_bible",
    "generate_or_import_character_refs",
    "storyboard_shotgrid",
    "start_frame_render_plan",
    "render_or_import_start_frames",
    "approve_start_frames",
    "dialogue_audio_plan",
    "video_motion_prompt_pack",
    "create_storyboard_review_project",
    "review_generate_repair_in_storyboard_review",
    "render_or_import_video_clips",
    "assemble_episode_manifest",
    "summarize_episode_to_series_memory",
  ] as const;

export type VerticalDramaPhaseId =
  | "plan"
  | "frames"
  | "prompt_handoff"
  | "generate_assemble";

export interface VerticalDramaPhase {
  id: VerticalDramaPhaseId;
  labelEn: string;
  labelTh: string;
  stages: VerticalDramaPipelineStage[];
}

/**
 * The ~4 operator-facing phases the 15 stages group into (spec §16). The
 * workspace renders progress at phase granularity, not 15 raw rows.
 */
export const VERTICAL_DRAMA_PHASES: readonly VerticalDramaPhase[] = [
  {
    id: "plan",
    labelEn: "Plan",
    labelTh: "วางแผน",
    stages: [
      "normalize_series_input",
      "plan_episode_script",
      "update_character_visual_bible",
      "generate_or_import_character_refs",
    ],
  },
  {
    id: "frames",
    labelEn: "Frames",
    labelTh: "เฟรม",
    stages: [
      "storyboard_shotgrid",
      "start_frame_render_plan",
      "render_or_import_start_frames",
      "approve_start_frames",
    ],
  },
  {
    id: "prompt_handoff",
    labelEn: "Prompt & Handoff",
    labelTh: "พรอมป์และส่งต่อ",
    stages: [
      "dialogue_audio_plan",
      "video_motion_prompt_pack",
      "create_storyboard_review_project",
      "review_generate_repair_in_storyboard_review",
    ],
  },
  {
    id: "generate_assemble",
    labelEn: "Generate & Assemble",
    labelTh: "สร้างและประกอบ",
    stages: [
      "render_or_import_video_clips",
      "assemble_episode_manifest",
      "summarize_episode_to_series_memory",
    ],
  },
] as const;

/** Return the phase a stage belongs to (spec §16). */
export function phaseForStage(
  stage: VerticalDramaPipelineStage
): VerticalDramaPhase {
  const phase = VERTICAL_DRAMA_PHASES.find(p => p.stages.includes(stage));
  // Every canonical stage belongs to exactly one phase.
  return phase ?? VERTICAL_DRAMA_PHASES[0];
}

/* -------------------------------------------------------------------------- */
/* Runner modes, approval + paid stage sets                                   */
/* -------------------------------------------------------------------------- */

/** The six runner modes (spec §11.4). `repair` re-runs a single stage. */
export const VERTICAL_DRAMA_RUNNER_MODES = [
  "dry_run",
  "plan_only",
  "render_images",
  "render_video",
  "full",
  "repair",
] as const;
export type VerticalDramaRunnerMode =
  (typeof VERTICAL_DRAMA_RUNNER_MODES)[number];

/**
 * Stages that persist an approval checkpoint and MUST be approved before the
 * sequence advances past them (spec §11.2 — the 12 approval checkpoints).
 */
export const VERTICAL_DRAMA_APPROVAL_STAGES: ReadonlySet<VerticalDramaPipelineStage> =
  new Set([
    "plan_episode_script",
    "update_character_visual_bible",
    "generate_or_import_character_refs",
    "storyboard_shotgrid",
    "start_frame_render_plan",
    "render_or_import_start_frames",
    "dialogue_audio_plan",
    "video_motion_prompt_pack",
    "create_storyboard_review_project",
    "render_or_import_video_clips",
    "assemble_episode_manifest",
    "summarize_episode_to_series_memory",
  ]);

/**
 * Paid stages that call an external provider. They NEVER run in
 * `dry_run`/`plan_only` and never before their approval checkpoint clears.
 */
export const VERTICAL_DRAMA_PAID_STAGES: ReadonlySet<VerticalDramaPipelineStage> =
  new Set(["render_or_import_start_frames", "render_or_import_video_clips"]);

/**
 * Stages whose REAL (non dry_run/plan_only) generation must NOT run inline on
 * the HTTP request (`planning/vd-async-stage-jobs-generalization/plan.md` S2).
 *
 * Cloudflare cuts an origin read at ~100s and answers 524. That limit is not
 * configurable below Enterprise, so our own 600s nginx / 620s Node timeouts
 * cannot save a stage that runs longer — the work completes server-side while
 * the user is shown a hard failure and invited to re-run it, paying for the
 * same generation twice.
 *
 * `storyboard_shotgrid` was moved off the request for exactly this reason (bug
 * #127). `plan_episode_script` hits the same wall — observed 2026-07-31, run
 * #540 finished `succeeded` after its request had already 524'd.
 *
 * Dry-run/plan_only previews of these stages stay fully synchronous: they
 * render nothing and spend nothing.
 */
export const VERTICAL_DRAMA_ASYNC_STAGES: ReadonlySet<VerticalDramaPipelineStage> =
  new Set(["storyboard_shotgrid", "plan_episode_script"]);

/** Stable machine-readable error code for a schema-validation failure (spec §11.5). */
export const VD_SCHEMA_VALIDATION_FAILED = "VD_SCHEMA_VALIDATION_FAILED";

/**
 * Map a `generateEpisodeScript` failure to a `RunResult` error — mirrors
 * `mapStoryboardGenerationError` exactly. Never throws.
 */
function mapScriptGenerationError(error: unknown): RunResult["errors"][number] {
  if (error instanceof ScriptInsufficientCreditsError) {
    return {
      code: "VD_INSUFFICIENT_CREDITS",
      message: error.message,
      repairable: false,
    };
  }
  if (error instanceof ScriptVdSchemaValidationError) {
    return {
      code: VD_SCHEMA_VALIDATION_FAILED,
      message: error.message,
      repairable: true,
    };
  }
  return {
    code: "VD_SCRIPT_GENERATION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    repairable: true,
  };
}

/**
 * Map a `generateStoryboardShotgrid` failure to a `RunResult` error, reusing
 * the existing `VD_SCHEMA_VALIDATION_FAILED` convention for malformed LLM
 * output. Never throws — real-generation failures must produce a normal
 * `failed`/`repair` `RunResult`, not an unhandled rejection out of `runStage`.
 */
function mapStoryboardGenerationError(
  error: unknown
): RunResult["errors"][number] {
  if (error instanceof StoryboardInsufficientCreditsError) {
    return {
      code: "VD_INSUFFICIENT_CREDITS",
      message: error.message,
      repairable: false,
    };
  }
  if (error instanceof StoryboardVdSchemaValidationError) {
    return {
      code: VD_SCHEMA_VALIDATION_FAILED,
      message: error.message,
      repairable: true,
    };
  }
  return {
    code: "VD_STORYBOARD_GENERATION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    repairable: true,
  };
}

/**
 * Map a `generateEpisodeDialogueAudioPlan` failure to a `RunResult` error —
 * mirrors `mapStoryboardGenerationError` exactly. Never throws. Only ever
 * invoked from `repairStage`'s `dialogue_audio_plan` real-repair branch —
 * `runStage` has no real-generation path for this stage (see
 * `generateRealDialogueAudioPlan`'s doc comment).
 */
function mapDialogueAudioPlanGenerationError(
  error: unknown
): RunResult["errors"][number] {
  if (error instanceof DialogueAudioPlanInsufficientCreditsError) {
    return {
      code: "VD_INSUFFICIENT_CREDITS",
      message: error.message,
      repairable: false,
    };
  }
  if (error instanceof DialogueAudioPlanVdSchemaValidationError) {
    return {
      code: VD_SCHEMA_VALIDATION_FAILED,
      message: error.message,
      repairable: true,
    };
  }
  return {
    code: "VD_DIALOGUE_AUDIO_PLAN_GENERATION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    repairable: true,
  };
}

/**
 * Map a `generateStartFrameRenderPlan` failure to a `RunResult` error —
 * mirrors `mapStoryboardGenerationError` exactly. Never throws.
 */
function mapStartFrameGenerationError(
  error: unknown
): RunResult["errors"][number] {
  if (error instanceof StartFrameInsufficientCreditsError) {
    return {
      code: "VD_INSUFFICIENT_CREDITS",
      message: error.message,
      repairable: false,
    };
  }
  if (error instanceof StartFrameVdSchemaValidationError) {
    return {
      code: VD_SCHEMA_VALIDATION_FAILED,
      message: error.message,
      repairable: true,
    };
  }
  return {
    code: "VD_START_FRAME_PLAN_GENERATION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    repairable: true,
  };
}

/**
 * Map a `generateVideoMotionPromptPack` failure to a `RunResult` error —
 * mirrors `mapStoryboardGenerationError` exactly. Never throws.
 */
function mapMotionPromptGenerationError(
  error: unknown
): RunResult["errors"][number] {
  if (error instanceof MotionPromptInsufficientCreditsError) {
    return {
      code: "VD_INSUFFICIENT_CREDITS",
      message: error.message,
      repairable: false,
    };
  }
  if (error instanceof MotionPromptVdSchemaValidationError) {
    return {
      code: VD_SCHEMA_VALIDATION_FAILED,
      message: error.message,
      repairable: true,
    };
  }
  return {
    code: "VD_MOTION_PROMPT_PACK_GENERATION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    repairable: true,
  };
}

/**
 * Map a `createVerticalDramaStoryboardHandoff` failure to a `RunResult`
 * error — mirrors `mapMotionPromptGenerationError` exactly. Never throws.
 * This is a pure DB operation (no provider call), so there is no
 * insufficient-credits variant to special-case.
 */
function mapStoryboardReviewHandoffError(
  error: unknown
): RunResult["errors"][number] {
  return {
    code: "VD_STORYBOARD_REVIEW_HANDOFF_FAILED",
    message: error instanceof Error ? error.message : String(error),
    repairable: true,
  };
}

/**
 * Map a `runVerticalDramaSeriesMemoryPlanning` failure to a `RunResult`
 * error — mirrors `mapScriptGenerationError` exactly. Never throws.
 */
function mapMemoryPlanningError(error: unknown): RunResult["errors"][number] {
  if (error instanceof MemoryPlanningInsufficientCreditsError) {
    return {
      code: "VD_INSUFFICIENT_CREDITS",
      message: error.message,
      repairable: false,
    };
  }
  if (error instanceof MemoryPlanningVdSchemaValidationError) {
    return {
      code: VD_SCHEMA_VALIDATION_FAILED,
      message: error.message,
      repairable: true,
    };
  }
  return {
    code: "VD_SERIES_MEMORY_PLANNING_FAILED",
    message: error instanceof Error ? error.message : String(error),
    repairable: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Provider routing port (thin typed seam to section 08 — stub impl here)      */
/* -------------------------------------------------------------------------- */

export interface ProviderRoutingStageRequest {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  runId: number;
  stage: VerticalDramaPipelineStage;
  mode: VerticalDramaRunnerMode;
  /** The candidate artifact payload the paid stage would render from. */
  payload: unknown;
}

export interface ProviderRoutingStageResult {
  /** `skipped` = intentionally did nothing (dry-run-safe stub / unpaid mode). */
  status: "skipped" | "ready" | "succeeded" | "blocked" | "failed";
  /** Media asset IDs produced (never provider URLs). Empty for dry runs. */
  mediaAssetIds: number[];
  warnings: VerticalDramaWarning[];
  errors: RunResult["errors"];
  blockingReasons: string[];
  qc?: VerticalDramaQcResult;
}

/**
 * The single seam through which the runner reaches provider routing + QC
 * (section 08). Section 08 supplies the real implementation; this file only
 * depends on the interface and ships a dry-run-safe stub.
 */
export interface ProviderRoutingPort {
  /** Route + (optionally) render a paid stage. Stub renders nothing. */
  routeAndRenderStage(
    req: ProviderRoutingStageRequest
  ): Promise<ProviderRoutingStageResult>;
  /** Optional QC pass over a stage's artifact. Stub returns undefined. */
  runQc?(
    req: ProviderRoutingStageRequest
  ): Promise<VerticalDramaQcResult | undefined>;
}

/** Dry-run-safe port: never renders, never spends, never fails the pipeline. */
export function createStubProviderRoutingPort(): ProviderRoutingPort {
  return {
    async routeAndRenderStage(req) {
      return {
        status: "skipped",
        mediaAssetIds: [],
        warnings: [
          {
            code: "VD_PROVIDER_ROUTING_STUB",
            severity: "info",
            message: `Provider routing is stubbed (mode=${req.mode}); no paid generation performed.`,
            targetStage: req.stage,
            repairable: false,
          },
        ],
        errors: [],
        blockingReasons: [],
      };
    },
    async runQc() {
      return undefined;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Deterministic dry-run stage payload builders                               */
/* -------------------------------------------------------------------------- */

/** Even-split `total` seconds into `count` parts, each >= `floor`, summing exactly. */
export function splitDurations(
  total: number,
  count: number,
  floor: number
): number[] {
  const n = Math.max(1, count);
  if (n === 1) return [round2(total)];
  const base = Math.max(floor, round2(total / n));
  const parts: number[] = new Array(n - 1).fill(base);
  const used = base * (n - 1);
  const last = round2(total - used);
  parts.push(last);
  return parts;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Nine-shot storyboard with durations summing to the episode total (60s). */
function buildStoryboard(episodeDurationSeconds: number) {
  const shotCount = 9;
  const durations = splitDurations(episodeDurationSeconds, shotCount, 1);
  return {
    gridLayout: "3x3" as const,
    shotCount: 9 as const,
    shots: durations.map((durationSeconds, i) => ({
      shotNumber: i + 1,
      description: `Shot ${i + 1} (dry-run placeholder)`,
      cameraSetup: "medium, eye-level, static",
      characterIds: [] as string[],
      continuityNotes: [] as string[],
      durationSeconds,
    })),
  };
}

export interface SubShotPlan {
  flagOn: boolean;
  policy: VerticalDramaSubShotPolicy;
  shots: Array<{
    parentShotNumber: number;
    mainShotDurationSeconds: number;
    subShotCount: number;
    subShots: VerticalDramaSubShot[];
  }>;
  providerFeasibility: { blockingReasons: string[] };
  /** Whole-plan validity — every parent's sub-shots sum to its main duration. */
  valid: boolean;
  validationErrors: string[];
}

/**
 * Decompose each 9-shot storyboard shot into 2-5 sub-shots per §7.4. Per-parent
 * durations SUM to the parent main-shot duration (so the episode stays 60s and
 * the shot count stays 9). Pure — no provider calls, dry-run-safe.
 */
export function planSubShots(
  shots: Array<{ shotNumber: number; durationSeconds: number }>,
  policy: VerticalDramaSubShotPolicy
): SubShotPlan {
  const plannedShots: SubShotPlan["shots"] = [];
  const validationErrors: string[] = [];
  const blockingReasons: string[] = [];

  for (const shot of shots) {
    const count =
      policy.mode === "fixed"
        ? Math.max(1, Math.min(policy.targetPerShot, policy.maxPerShot))
        : computeAutoSubShotCount(shot.durationSeconds, policy);
    const durations = splitDurations(
      shot.durationSeconds,
      count,
      policy.minSubShotSeconds
    );
    const subShots: VerticalDramaSubShot[] = durations.map(
      (durationSeconds, idx) => ({
        subShotNumber: idx + 1,
        parentShotNumber: shot.shotNumber,
        durationSeconds,
        cameraSetup: `sub-cut ${idx + 1}: reframe within shot ${shot.shotNumber}`,
        prompt: `Sub-shot ${idx + 1} of shot ${shot.shotNumber} (dry-run placeholder)`,
        transitionIn: idx === 0 ? "cut" : "match_cut",
        status: "planned",
      })
    );

    const validation = validateSubShotsForParent(
      shot.durationSeconds,
      subShots,
      policy
    );
    if (!validation.valid) validationErrors.push(...validation.errors);

    plannedShots.push({
      parentShotNumber: shot.shotNumber,
      mainShotDurationSeconds: shot.durationSeconds,
      subShotCount: subShots.length,
      subShots,
    });
  }

  return {
    flagOn: true,
    policy,
    shots: plannedShots,
    providerFeasibility: { blockingReasons },
    valid: validationErrors.length === 0,
    validationErrors,
  };
}

/* -------------------------------------------------------------------------- */
/* Stage output builders + validators                                         */
/* -------------------------------------------------------------------------- */

export interface StageBuildContext {
  episode: VerticalDramaEpisodeRow;
  mode: VerticalDramaRunnerMode;
  subShotFlagOn: boolean;
  subShotPolicy: VerticalDramaSubShotPolicy;
  memoryBundle?: unknown;
}

/**
 * Build the deterministic candidate artifact payload for a stage. Payloads are
 * placeholders (no paid provider calls) suitable for dry-run and plan-only.
 */
export function buildStagePayload(
  stage: VerticalDramaPipelineStage,
  ctx: StageBuildContext
): Record<string, unknown> {
  const dur = ctx.episode.targetDurationSeconds ?? 60;
  switch (stage) {
    case "normalize_series_input":
      return {
        stage,
        seriesId: String(ctx.episode.seriesId),
        memoryBundle: ctx.memoryBundle ?? null,
      };
    case "plan_episode_script":
      // Field names match `vertical-drama-script-builder`'s real output
      // shape (snake_case) exactly, not an invented camelCase shape — so
      // `validateStagePayload`'s `episode_title` check and any downstream
      // reader work identically whether this is the dry-run placeholder or
      // `generateRealScript`'s real LLM output overriding it below.
      return {
        stage,
        contract_version: 1,
        episode_title:
          ctx.episode.title ?? `Episode ${ctx.episode.episodeNumber}`,
        hook: "Dry-run hook",
        structure: {
          mode: "beat",
          acts: [],
          beats: [{ beat: "setup", description: "placeholder" }],
        },
        scene_dialogue_summary: [],
        cliffhanger: "",
        character_state_deltas: [],
        product_tie_in_plan: { tie_ins: [] },
        continuity_notes: [],
        warnings: [],
        repair_queue: [],
      };
    case "update_character_visual_bible":
      return { stage, characters: [], changed: false };
    case "generate_or_import_character_refs":
      return { stage, mediaAssetIds: [], approved: false };
    case "storyboard_shotgrid":
      return { stage, ...buildStoryboard(dur) };
    case "start_frame_render_plan":
      return {
        stage,
        mode: "single_frame_per_shot",
        selectedImageModelId: "dry-run-image-model",
        frames: buildStoryboard(dur).shots.map(s => ({
          shotNumber: s.shotNumber,
          imagePrompt: `Frame for shot ${s.shotNumber}`,
          negativePrompt: "",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
        })),
      };
    case "render_or_import_start_frames":
      return { stage, frames: [], mediaAssetIds: [], rendered: false };
    case "approve_start_frames":
      return { stage, approved: false };
    case "dialogue_audio_plan":
      return {
        stage,
        audioStrategy: "separate_tts_voiceover",
        language: "th-TH",
        voiceContinuityMap: [],
        shotLines: [],
        subtitleSafeArea: {
          position: "bottom_safe",
          maxLines: 2,
          avoidFaceArea: true,
        },
        warnings: [],
      };
    case "video_motion_prompt_pack": {
      const storyboard = buildStoryboard(dur);
      const base: Record<string, unknown> = {
        stage,
        selectedVideoModelId: "dry-run-video-model",
        durationProfileId:
          ctx.episode.durationProfileId ??
          "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: storyboard.shots.map(s => ({
          clipNumber: s.shotNumber,
          sourceShotNumbers: [s.shotNumber],
          prompt: `Motion for shot ${s.shotNumber}`,
          durationSeconds: s.durationSeconds,
        })),
        warnings: [],
      };
      if (ctx.subShotFlagOn && ctx.subShotPolicy.enabled) {
        const plan = planSubShots(storyboard.shots, ctx.subShotPolicy);
        base.sub_shot_plan = plan;
        // Expand clips into per-sub-shot clip requests carrying parent+sub numbers.
        base.clips = plan.shots.flatMap(ps =>
          ps.subShots.map(ss => ({
            clipNumber: ps.parentShotNumber * 100 + ss.subShotNumber,
            sourceShotNumbers: [ps.parentShotNumber],
            prompt: ss.prompt,
            durationSeconds: ss.durationSeconds,
            parentShotNumber: ps.parentShotNumber,
            subShotNumber: ss.subShotNumber,
          }))
        );
      }
      return base;
    }
    case "create_storyboard_review_project":
      return { stage, storyboardReviewId: null, created: false };
    case "review_generate_repair_in_storyboard_review":
      return { stage, reviewComplete: false };
    case "render_or_import_video_clips":
      return { stage, clips: [], mediaAssetIds: [], rendered: false };
    case "assemble_episode_manifest":
      return {
        stage,
        durationProfileId: ctx.episode.durationProfileId,
        totalDurationSeconds: dur,
        clips: [],
      };
    case "summarize_episode_to_series_memory":
      return {
        stage,
        episodeNumber: ctx.episode.episodeNumber,
        summary: `Episode ${ctx.episode.episodeNumber} summary (pending approval — not yet applied)`,
        pending: true,
      };
    default:
      return { stage };
  }
}

export interface StageValidationResult {
  valid: boolean;
  errors: RunResult["errors"];
}

/**
 * Feature 132 §6.2 (F132C, scene contracts) — the SAME canonical
 * anchor-line-cadence predicate used by `verticalDramaStoryBible.ts`'s
 * `meetsPremiumDraftContractFloor`: "no run of 3 or more consecutive shots
 * without anchorLine: true" (equivalently: for every 3 consecutive shots, at
 * least 1 has `anchorLine: true`). Kept as a small local pure function
 * (rather than importing the premium-gate's private helper) since this
 * module already avoids a static value import of `verticalDramaStoryBible.ts`
 * (see `resolveEpisodeDraftHydration`'s doc comment for the import-chain
 * rationale) — this predicate is trivial enough that duplicating just the
 * boolean check (not the whole gate) carries no real drift risk, and the
 * EXACT wording above is asserted identically in both files' tests.
 */
function anchorLineCadenceOk(
  shots: Array<{ contract?: { anchorLine?: boolean } }>
): boolean {
  let runWithoutAnchor = 0;
  for (const shot of shots) {
    if (shot.contract?.anchorLine === true) {
      runWithoutAnchor = 0;
    } else {
      runWithoutAnchor += 1;
      if (runWithoutAnchor >= 3) return false;
    }
  }
  return true;
}

/**
 * Feature 132 §6.2 (F132C, scene contracts) — per-shot contract
 * presence/shape check for `validateStagePayload`'s `storyboard_shotgrid`
 * branch: every shot must have a `contract` object with all 6 required
 * fields present and non-empty (`storyFunction`, `emotionalBeat`,
 * `audienceTakeaway`, `tensionSource`, `newClueIds`, `dialoguePurpose`) —
 * the 3 optional fields (`characterDecision`, `continuityDependency`,
 * `anchorLine`) are never required here.
 */
function shotContractShapeOk(shot: Record<string, unknown>): boolean {
  const contract = shot.contract as Record<string, unknown> | undefined;
  if (!contract || typeof contract !== "object") return false;
  const requiredStringFields = [
    "storyFunction",
    "emotionalBeat",
    "audienceTakeaway",
    "tensionSource",
    "dialoguePurpose",
  ];
  for (const field of requiredStringFields) {
    if (
      typeof contract[field] !== "string" ||
      (contract[field] as string).trim().length === 0
    ) {
      return false;
    }
  }
  if (!Array.isArray(contract.newClueIds)) return false;
  return true;
}

/**
 * Phase 1 of `planning/polished-toasting-gadget.md` (location visual bible)
 * — deterministic partition check for `validateStagePayload`'s
 * `storyboard_shotgrid` branch: when a payload carries `distinct_locations`
 * (see `verticalDramaStoryboardGeneration.ts`'s `distinctLocationSchema`),
 * every shot number 1-9 must appear in EXACTLY ONE group's `shot_numbers` —
 * no gaps (a shot number missing from every group) and no overlaps (a shot
 * number claimed by more than one group). Never trust the LLM's own
 * grouping claim without this check — same "verify, don't trust" principle
 * already applied elsewhere in this pipeline (e.g. this stage's own
 * server-side character-id sanitization in
 * `verticalDramaStoryboardGeneration.ts`). Returns the two violation kinds
 * as separate lists (both may be non-empty at once — e.g. one shot claimed
 * twice AND a different shot claimed by nobody) so the call site can report
 * each as its own distinct `fail()`, mirroring this function's sibling
 * `sceneContractsEnabled` checks below (missing-contract / over-budget /
 * anchor-cadence are each their own independent `fail()` call, never
 * short-circuited by one another).
 */
function distinctLocationsShotCoverage(
  distinctLocations: Array<{ shot_numbers?: unknown }>
): { overlapping: number[]; missing: number[] } {
  const countByShot = new Map<number, number>();
  for (const group of distinctLocations) {
    const shotNumbers = Array.isArray(group.shot_numbers)
      ? group.shot_numbers
      : [];
    for (const raw of shotNumbers) {
      const n = Number(raw);
      if (!Number.isInteger(n)) continue;
      countByShot.set(n, (countByShot.get(n) ?? 0) + 1);
    }
  }
  const overlapping = [...countByShot.entries()]
    .filter(([, count]) => count > 1)
    .map(([shotNumber]) => shotNumber)
    .sort((a, b) => a - b);
  const missing = Array.from({ length: 9 }, (_, i) => i + 1).filter(
    n => !countByShot.has(n)
  );
  return { overlapping, missing };
}

/** Schema-shape validation gate (spec §11.5 failed-validation rule). */
export function validateStagePayload(
  stage: VerticalDramaPipelineStage,
  payload: Record<string, unknown>,
  /**
   * Feature 132 §6.2 (F132C, scene contracts, tenant flag
   * `verticalDramaSceneContracts`) — when true, additionally checks
   * `storyboard_shotgrid` shots for contract presence/shape, the ≤2
   * `newClueIds` budget, and the anchor-line-cadence predicate (see
   * `anchorLineCadenceOk`/`shotContractShapeOk` above). Defaults to false so
   * every existing caller is byte-identical to before this parameter
   * existed.
   *
   * `plan_episode_script` — per this section's own open-question
   * resolution (spec section-04 §"Open questions", item 1): that stage's
   * payload (`scene_dialogue_summary`) is a *scene*-grained, LLM-freeform
   * array (`additionalProperties: true`), not a 1:1 match with the 9-shot
   * storyboard grid — it has NO shot-grained structure that could carry a
   * per-shot `contract`. There is therefore no shape to deterministically
   * check here; enforcement is intentionally left to `storyboard_shotgrid`
   * only (this is a documented no-op, not an oversight).
   */
  sceneContractsEnabled: boolean = false
): StageValidationResult {
  const errors: RunResult["errors"] = [];
  const fail = (message: string) =>
    errors.push({
      code: VD_SCHEMA_VALIDATION_FAILED,
      message,
      repairable: true,
    });

  if (stage === "storyboard_shotgrid") {
    const shots = (payload.shots as unknown[]) ?? [];
    if (shots.length !== 9)
      fail(`storyboard must have exactly 9 shots, got ${shots.length}`);

    if (sceneContractsEnabled) {
      const typedShots = shots as Array<Record<string, unknown>>;
      const missingContractIndex = typedShots.findIndex(
        shot => !shotContractShapeOk(shot)
      );
      if (missingContractIndex >= 0) {
        fail(
          `storyboard shot #${missingContractIndex + 1} is missing a well-shaped contract (storyFunction, emotionalBeat, audienceTakeaway, tensionSource, newClueIds, dialoguePurpose all required)`
        );
      }
      const overBudgetIndex = typedShots.findIndex(shot => {
        const contract = shot.contract as Record<string, unknown> | undefined;
        const newClueIds = Array.isArray(contract?.newClueIds)
          ? contract!.newClueIds
          : [];
        return newClueIds.length > 2;
      });
      if (overBudgetIndex >= 0) {
        fail(
          `storyboard shot #${overBudgetIndex + 1}'s contract.newClueIds exceeds the budget of 2`
        );
      }
      const shotsForCadence = typedShots as unknown as Array<{
        contract?: { anchorLine?: boolean };
      }>;
      if (!anchorLineCadenceOk(shotsForCadence)) {
        fail(
          "storyboard shots violate anchor-line cadence: no run of 3 or more consecutive shots without anchorLine: true"
        );
      }
    }

    // Phase 1 of `planning/polished-toasting-gadget.md` (location visual
    // bible) — see `distinctLocationsShotCoverage`'s own doc comment. Runs
    // whenever the payload carries `distinct_locations`, regardless of
    // `sceneContractsEnabled` (a separate, unrelated flag) — data-driven,
    // not flag-gated. Overlaps and gaps are reported as independent
    // failures so a payload with both is never silently short-circuited to
    // reporting only one.
    if (Array.isArray(payload.distinct_locations)) {
      const { overlapping, missing } = distinctLocationsShotCoverage(
        payload.distinct_locations as Array<{ shot_numbers?: unknown }>
      );
      if (overlapping.length > 0) {
        fail(
          `storyboard distinct_locations shot_numbers overlap: shot(s) ${overlapping.join(", ")} are claimed by more than one location group`
        );
      }
      if (missing.length > 0) {
        fail(
          `storyboard distinct_locations shot_numbers have gaps: shot(s) ${missing.join(", ")} are not covered by any location group`
        );
      }
    }
  }
  if (stage === "plan_episode_script") {
    if (!payload.episode_title) fail("script is missing episode_title");
  }
  if (stage === "video_motion_prompt_pack" && payload.sub_shot_plan) {
    const plan = payload.sub_shot_plan as SubShotPlan;
    if (!plan.valid)
      fail(`sub_shot_plan invalid: ${plan.validationErrors.join("; ")}`);
  }
  return { valid: errors.length === 0, errors };
}

/* -------------------------------------------------------------------------- */
/* Ownership + persistence helpers                                            */
/* -------------------------------------------------------------------------- */

export interface EpisodeRunOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
}

/**
 * Resolve the approved portrait for every character established by a shot.
 * The motion-prompt skill needs the portrait next to the approved start frame
 * so it can compare the actual face/position/action in the frame instead of
 * trusting a requested layout or a character name in prose. This is an
 * enrichment path, so a missing portrait or a lookup failure degrades to an
 * empty list and never prevents the clip prompt from being generated.
 */
async function resolvePipelineCharacterReferenceImages(
  owner: EpisodeRunOwner,
  characterKeys: readonly string[]
): Promise<ShotVideoPromptCharacterReferenceImage[]> {
  const orderedKeys = Array.from(
    new Set(characterKeys.map(key => key.trim()).filter(Boolean))
  );
  if (orderedKeys.length === 0) return [];

  try {
    const rows = (await db
      .select({
        id: verticalDramaCharacters.id,
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId),
          inArray(verticalDramaCharacters.characterKey, orderedKeys)
        )
      )) as Array<{ id: number; characterKey: string; name: string }>;
    const rowByKey = new Map(rows.map(row => [row.characterKey, row]));
    const references: ShotVideoPromptCharacterReferenceImage[] = [];
    for (const characterKey of orderedKeys) {
      const row = rowByKey.get(characterKey);
      if (!row) continue;
      const url =
        await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
          owner,
          row.id
        );
      if (!url) continue;
      references.push({ characterKey, name: row.name, url });
    }
    return references;
  } catch (error) {
    debugError(
      "vd_video_prompt_character_references",
      `Character portrait enrichment failed for episode #${owner.episodeId}; prompt generation remains available`,
      error
    );
    return [];
  }
}

/** Was this stage's approval checkpoint approved for this episode? */
async function isStageApproved(
  owner: EpisodeRunOwner,
  stage: VerticalDramaPipelineStage
): Promise<boolean> {
  const rows = await db
    .select({ state: verticalDramaApprovalCheckpoints.state })
    .from(verticalDramaApprovalCheckpoints)
    .where(
      and(
        eq(verticalDramaApprovalCheckpoints.tenantId, owner.tenantId),
        eq(verticalDramaApprovalCheckpoints.seriesId, owner.seriesId),
        eq(verticalDramaApprovalCheckpoints.episodeId, owner.episodeId),
        eq(verticalDramaApprovalCheckpoints.stage, stage)
      )
    )
    .orderBy(desc(verticalDramaApprovalCheckpoints.updatedAt))
    .limit(1);
  return rows[0]?.state === "approved";
}

/**
 * Apply the durable series-memory side effects for the
 * `summarize_episode_to_series_memory` checkpoint: appends the
 * `episode_summary` event (and, when a real
 * `vertical-drama-series-memory-planner` artifact was produced, ALL seven
 * other memory event kinds too) via the append-only memory service.
 *
 * Extracted (2026-07-07) from the `approveCheckpoint` router mutation so it
 * can run from BOTH:
 *  - `runStage`, immediately when the auto-approved checkpoint is created
 *    (manual approval was removed from the product workflow — a checkpoint
 *    is now born `approved`, so nothing ever calls the mutation for it), and
 *  - `approveRunCheckpoint`, for legacy checkpoints that predate this change
 *    and are still sitting `pending` — the mutation's `alreadyTerminal`
 *    short-circuit (see below) guarantees this only ever runs once per
 *    checkpoint no matter which path reaches it.
 *
 * Every `appendEvent` call carries a checkpoint-scoped idempotency key, so
 * even a direct double-invocation (e.g. a retried request) never
 * double-writes any event kind — `appendEvent` returns the existing row for
 * a matching key instead of inserting again.
 */
async function applyEpisodeSummaryMemoryWrites(
  owner: EpisodeRunOwner,
  checkpoint: { id: number; runId: number; sourceArtifactIds: unknown },
  approvedByUserId: number
): Promise<void> {
  const { tenantId, userId, seriesId, episodeId } = owner;

  // Resolve the episode number + the artifact under review so the memory
  // events carry the real planner output (when present).
  const [episode] = await db
    .select({ episodeNumber: verticalDramaEpisodes.episodeNumber })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, episodeId),
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        eq(verticalDramaEpisodes.seriesId, seriesId)
      )
    )
    .limit(1);
  const episodeNumber = episode?.episodeNumber;

  const sourceArtifactIds =
    (checkpoint.sourceArtifactIds as string[] | null) ?? [];
  let plannerPayload: Record<string, unknown> | undefined;
  let summaryText =
    episodeNumber != null
      ? `Episode ${episodeNumber} summarized to series memory`
      : "Episode summarized to series memory";
  if (sourceArtifactIds.length > 0) {
    const artifactId = Number(sourceArtifactIds[0]);
    if (Number.isFinite(artifactId)) {
      const [artifact] = await db
        .select({ jsonPayload: verticalDramaRunArtifacts.jsonPayload })
        .from(verticalDramaRunArtifacts)
        .where(
          and(
            eq(verticalDramaRunArtifacts.id, artifactId),
            eq(verticalDramaRunArtifacts.tenantId, tenantId),
            eq(verticalDramaRunArtifacts.seriesId, seriesId),
            eq(verticalDramaRunArtifacts.episodeId, episodeId)
          )
        )
        .limit(1);
      const payload = artifact?.jsonPayload as
        | Record<string, unknown>
        | undefined;
      if (payload?.summary) summaryText = String(payload.summary);
      // Only the real planner artifact carries `episode_recap` (the old
      // pending-only placeholder from `buildStagePayload` never does) — use
      // its presence to distinguish "real planner ran" from "old run /
      // dry_run / plan_only, no planner artifact".
      if (typeof payload?.episode_recap === "string") {
        plannerPayload = payload;
        summaryText = payload.episode_recap as string;
      }
    }
  }

  const baseIdempotencyKey = `vd-episode-summary-checkpoint-${checkpoint.id}`;

  await verticalDramaSeriesMemoryService.appendEvent({
    tenantId,
    userId,
    seriesId,
    episodeId,
    runId: checkpoint.runId,
    memoryKind: "episode_summary",
    payload: {
      episodeNumber,
      summary: summaryText,
      approvedFromCheckpointId: String(checkpoint.id),
      ...(plannerPayload
        ? { memoryCompactionSummary: plannerPayload.memory_compaction_summary }
        : {}),
    },
    summaryText,
    approved: true,
    approvedByUserId,
    // Idempotent: a replayed approval never double-writes the summary.
    idempotencyKey: baseIdempotencyKey,
  });

  // Fallback preserved for old runs with no planner artifact (dry_run/
  // plan_only-only history, or runs that predate this wiring): only the
  // `episode_summary` event above is written, exactly as before.
  if (!plannerPayload) return;

  const asArray = (value: unknown): Array<Record<string, unknown>> =>
    Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];

  const appendKind = async (
    memoryKind: VerticalDramaMemoryKind,
    items: Array<Record<string, unknown>>,
    summaryOf: (item: Record<string, unknown>) => string,
    keySuffix: string
  ) => {
    for (const [index, item] of items.entries()) {
      const text = summaryOf(item);
      await verticalDramaSeriesMemoryService.appendEvent({
        tenantId,
        userId,
        seriesId,
        episodeId,
        runId: checkpoint.runId,
        memoryKind,
        payload: {
          episodeNumber,
          approvedFromCheckpointId: String(checkpoint.id),
          ...item,
        },
        summaryText: text,
        approved: true,
        approvedByUserId,
        // Idempotent per item — a replayed approval never double-appends
        // any single hook/delta/warning/tie-in.
        idempotencyKey: `${baseIdempotencyKey}-${keySuffix}-${index}`,
      });
    }
  };

  await appendKind(
    "hook_opened",
    asArray(plannerPayload.unresolved_hooks),
    item =>
      String(item.description ?? item.hook ?? item.hookId ?? "hook opened"),
    "hook-opened"
  );
  await appendKind(
    "hook_resolved",
    asArray(plannerPayload.resolved_hooks),
    item =>
      String(item.description ?? item.hook ?? item.hookId ?? "hook resolved"),
    "hook-resolved"
  );
  await appendKind(
    "character_delta",
    asArray(plannerPayload.character_emotional_state),
    item =>
      String(
        item.state ??
          item.change ??
          `${item.character_id ?? "character"} state change`
      ),
    "character-delta"
  );
  await appendKind(
    "relationship_delta",
    asArray(plannerPayload.relationship_state_changes),
    item =>
      String(
        item.change ?? `${JSON.stringify(item.pair ?? [])} relationship change`
      ),
    "relationship-delta"
  );
  await appendKind(
    "continuity_warning",
    asArray(plannerPayload.continuity_risks),
    item => String(item.risk ?? item.warning ?? "continuity risk"),
    "continuity-warning"
  );
  await appendKind(
    "product_tie_in_usage",
    asArray(plannerPayload.product_tie_in_history),
    item =>
      String(item.productName ?? item.product_name ?? "product tie-in usage"),
    "product-tie-in"
  );

  // `canonical_fact` events are appended too (kept out of the shared
  // `appendKind` helper because their summary source field differs).
  for (const [index, fact] of asArray(
    plannerPayload.canonical_facts
  ).entries()) {
    const text = String(fact.statement ?? fact.fact ?? "canonical fact");
    await verticalDramaSeriesMemoryService.appendEvent({
      tenantId,
      userId,
      seriesId,
      episodeId,
      runId: checkpoint.runId,
      memoryKind: "canonical_fact",
      payload: {
        episodeNumber,
        approvedFromCheckpointId: String(checkpoint.id),
        fact: text,
        ...fact,
      },
      summaryText: text,
      approved: true,
      approvedByUserId,
      idempotencyKey: `${baseIdempotencyKey}-canonical-fact-${index}`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* The pipeline runner                                                        */
/* -------------------------------------------------------------------------- */

export interface RunStageOptions {
  mode: VerticalDramaRunnerMode;
  /**
   * Set ONLY by the background stage-job runner
   * (`planning/vd-async-stage-jobs-generalization/plan.md` S1): the id of the
   * `queued` placeholder row this run must FINALIZE rather than insert
   * alongside. The client polls that exact id, so a sibling row would leave it
   * watching one that never reaches a terminal status. Absent on every
   * synchronous call — behavior then is byte-identical to before it existed.
   */
  asyncRunId?: number;
  subShotFlagOn?: boolean;
  subShotPolicy?: VerticalDramaSubShotPolicy;
  idempotencyKey?: string;
  /**
   * Deep story drafts hydration (W10-B, tenant flag
   * `verticalDramaSeriesDeepStoryDrafts`, added 2026-07-08) — when true,
   * `plan_episode_script`/`storyboard_shotgrid`'s real-generation calls
   * hydrate their prompt with the episode's active-breakdown
   * `shotDrafts`/`cliffhanger_line` (W10-A) as a REFINE base, when present
   * (see `resolveEpisodeDraftHydration`). Resolved by the router — same
   * "router resolves the tenant flag, the pipeline stays flag-agnostic
   * beyond this bag" convention already used for `subShotFlagOn`. Defaults
   * to off when omitted, so every existing caller/test is byte-identical.
   * This never skips or shortcuts generation — the stage still runs and
   * every existing gate (schema validation, coverage) still gates; a draft
   * only changes the prompt's starting material (owner intent:
   * "การปรับแต่งภายหลังเป็นเพียงปรับให้คุณภาพดีขึ้น").
   */
  deepStoryDraftsFlagOn?: boolean;
  /**
   * F131Y `verticalDramaSeriesTieInReplan` (task #31) — same "router
   * resolves the tenant flag, the pipeline stays flag-agnostic beyond this
   * bag" convention as `deepStoryDraftsFlagOn` above. When on,
   * `plan_episode_script` reads the episode's ACTIVE breakdown item's
   * `tieIn` season placement and passes it to `generateEpisodeScript` as
   * `episodeTieInPlacement` (force-include / force-exclude / grandfather —
   * see that param's doc in `verticalDramaScriptGeneration.ts`). Defaults
   * off → byte-identical legacy behavior.
   */
  tieInReplanFlagOn?: boolean;
  /**
   * Feature 132 §6 (F132C, scene contracts, tenant flag
   * `verticalDramaSceneContracts`, added 2026-07-09) — same "router resolves
   * the tenant flag, the pipeline stays flag-agnostic beyond this bag"
   * convention as `deepStoryDraftsFlagOn`/`tieInReplanFlagOn` above. When on:
   *  - `storyboard_shotgrid`'s real-generation call
   *    (`generateRealStoryboard`/`generateStoryboardShotgrid`) is told to
   *    honor/emit each shot's `contract`;
   *  - `validateStagePayload`'s `storyboard_shotgrid` branch additionally
   *    checks contract presence/shape, the ≤2 `newClueIds` budget, and the
   *    anchor-line cadence predicate.
   * Defaults to off when omitted, so every existing caller/test is
   * byte-identical.
   */
  sceneContractsEnabled?: boolean;
  /**
   * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W1,
   * tenant flag `verticalDramaRetentionHooks`, added 2026-07-11) — same
   * "router resolves the tenant flag, the pipeline stays flag-agnostic
   * beyond this bag" convention as `deepStoryDraftsFlagOn`/
   * `sceneContractsEnabled` above. When on:
   *  - `plan_episode_script`'s real-generation call (`generateRealScript`/
   *    `generateEpisodeScript`) threads the series' `genre` fact and renders
   *    skill.md's genre-conditional retention-loop/open-loop/
   *    no-intro-opening guidance (W1/W2);
   *  - `storyboard_shotgrid`'s real-generation call
   *    (`generateRealStoryboard`/`generateStoryboardShotgrid`) threads the
   *    SAME `genre` fact for shot styling (W3).
   * Defaults to off when omitted, so every existing caller/test is
   * byte-identical.
   */
  retentionHooksEnabled?: boolean;
  /** Feature 137 P1 — request-gated motion and draft-boundary guidance. */
  motionContractsEnabled?: boolean;
}

export interface RunStageOutcome {
  runId: number;
  result: RunResult;
  /** Downstream stages that became stale (empty unless this was a repair). */
  staleStages: VerticalDramaPipelineStage[];
  /**
   * The (auto-approved, audit-only) checkpoint just created, set whenever
   * `stage` is one of the approval stages. Manual approval was removed from
   * the product workflow (2026-07-07) — `result.status` never becomes
   * `"approval_required"` anymore.
   */
  checkpointId?: number;
}

/**
 * Deep story drafts hydration (W10-B, spec/section-16 refine-mode, added
 * 2026-07-08) — resolve the episode's active breakdown item's
 * `shotDrafts`/`cliffhanger_line` (W10-A), when `flagOn` and a draft is
 * actually present, for use as `plan_episode_script`/`storyboard_shotgrid`'s
 * REFINE base. Shared by `generateRealScript` and `generateRealStoryboard`
 * below so the active-breakdown lookup is resolved via ONE helper, not
 * duplicated inline in each. Takes the ALREADY-LOADED `bible` — both call
 * sites already query the series row for other fields (locale/tone/
 * productTieIn/etc.), so this never adds a second DB round trip.
 *
 * Dynamic `import()` of `verticalDramaStoryBible.ts`'s VALUES — see the
 * `VdDeepDraftShotDraft` type-import doc comment near the top of this file
 * for why: a static VALUE import here would load that module's
 * `enabledLlmModels.ts` -> `../routers/llmProviders.ts` -> `adminProcedure`
 * chain, unmocked, in this file's own test suite. Short-circuits BEFORE the
 * import when `flagOn` is false, so the lazy import only ever executes when
 * the `verticalDramaSeriesDeepStoryDrafts` flag is actually on — no
 * pre-existing test enables it.
 */
async function resolveEpisodeDraftHydration(
  bible: Record<string, unknown> | null,
  episodeNumber: number,
  flagOn: boolean
): Promise<{
  shots: VdDeepDraftShotDraft[];
  cliffhanger_line?: string;
} | null> {
  if (!flagOn) return null;
  const { getActiveBreakdown, readItemShotDrafts, readItemCliffhangerLine } =
    await import("./verticalDramaStoryBible");
  const item = getActiveBreakdown(bible).find(
    i => i.episodeNumber === episodeNumber
  );
  if (!item) return null;
  const shots = readItemShotDrafts(item);
  if (!shots) return null;
  return { shots, cliffhanger_line: readItemCliffhangerLine(item) };
}

const VERTICAL_DRAMA_CONTINUITY_GATE_STAGES = new Set<VerticalDramaPipelineStage>([
  "storyboard_shotgrid",
  "start_frame_render_plan",
  "render_or_import_start_frames",
  "dialogue_audio_plan",
  "video_motion_prompt_pack",
  "create_storyboard_review_project",
  "render_or_import_video_clips",
  "assemble_episode_manifest",
]);

function readStoredEpisodeMemories(raw: unknown): VdEpisodeMemory[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const episodes = (raw as { episodes?: unknown }).episodes;
  if (!Array.isArray(episodes)) return [];
  return episodes.filter((episode): episode is VdEpisodeMemory => {
    if (!episode || typeof episode !== "object" || Array.isArray(episode)) {
      return false;
    }
    const value = episode as Record<string, unknown>;
    return (
      typeof value.episodeNumber === "number" &&
      typeof value.recap === "string" &&
      Array.isArray(value.threadsOpened) &&
      Array.isArray(value.threadsResolved)
    );
  });
}

type VerticalDramaEpisodeContinuityGateResult = ReturnType<
  typeof validateVerticalDramaContinuity
> & {
  quarantinedResolutions: VerticalDramaContinuityQuarantine[];
  quarantinedOpenings: VerticalDramaContinuityQuarantine[];
};

async function validateEpisodeContinuityBeforeMedia(
  owner: EpisodeRunOwner,
  episode: VerticalDramaEpisodeRow,
): Promise<VerticalDramaEpisodeContinuityGateResult> {
  const [series] = await db
    .select({ memory: verticalDramaSeries.memory, targetEpisodeCount: verticalDramaSeries.targetEpisodeCount })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId),
      ),
    )
    .limit(1);
  if (!series) {
    return {
      ok: true,
      issues: [],
      openThreads: [],
      quarantinedResolutions: [],
      quarantinedOpenings: [],
    };
  }

  const currentScript = scriptBuilderOutputSchema.safeParse(episode.script);
  const stored = readStoredEpisodeMemories(series.memory);
  const timeline = selectPriorVerticalDramaMemories(
    stored,
    episode.episodeNumber,
  );
  if (currentScript.success) {
    timeline.push(
      resolveScriptEpisodeMemory(currentScript.data, episode.episodeNumber),
    );
  }

  const normalizedTimeline = normalizeVerticalDramaContinuityTimeline(timeline);
  if (
    normalizedTimeline.quarantinedResolutions.length > 0 ||
    normalizedTimeline.quarantinedOpenings.length > 0
  ) {
    try {
      await repairSeriesMemoryContinuity(
        owner.seriesId,
        owner.tenantId,
        owner.userId,
      );
    } catch (error) {
      // The normalized in-memory timeline still protects this run. A repair
      // failure must be visible but must not turn a valid media request into
      // a database-repair outage.
      debugError(
        "vd_continuity_repair",
        `Could not persist continuity quarantine cleanup for series #${owner.seriesId}`,
        error,
      );
    }
  }

  const isSeasonBoundary =
    series.targetEpisodeCount != null &&
    episode.episodeNumber >= series.targetEpisodeCount;
  const validation = validateVerticalDramaContinuity({
    episodes: normalizedTimeline.episodes,
    ...(isSeasonBoundary
      ? { seasonEndEpisode: series.targetEpisodeCount ?? episode.episodeNumber }
      : {}),
  });
  // Legacy scripts may have no structured memory contract. Keep their old
  // non-final production path grandfathered; a final episode still gets the
  // season-boundary check so an old dangling hook cannot reach paid media.
  const hasStructuredMemory =
    currentScript.success && currentScript.data.episode_memory != null;
  if (!isSeasonBoundary && !hasStructuredMemory) {
    return {
      ...validation,
      issues: [],
      ok: true,
      quarantinedResolutions: normalizedTimeline.quarantinedResolutions,
      quarantinedOpenings: normalizedTimeline.quarantinedOpenings,
    };
  }
  return {
    ...validation,
    quarantinedResolutions: normalizedTimeline.quarantinedResolutions,
    quarantinedOpenings: normalizedTimeline.quarantinedOpenings,
  };
}

/**
 * Season tie-in placement lookup (task #31, F131Y) — reads the episode's
 * ACTIVE breakdown item's `tieIn` (NOT the legacy top-level
 * `bible.episodeBreakdown` array, which can be stale after an approved arc
 * re-plan moved a placement). Mirrors `resolveEpisodeDraftHydration` above:
 * same already-loaded `bible`, same flag short-circuit BEFORE the dynamic
 * import (see that helper's doc comment for the import-chain rationale).
 * `undefined` = no season plan for this episode → grandfathered legacy
 * fatigue behavior inside `generateEpisodeScript`.
 */
async function resolveEpisodeTieInPlacement(
  bible: Record<string, unknown> | null,
  episodeNumber: number,
  flagOn: boolean
): Promise<VerticalDramaEpisodeTieInPlacement | undefined> {
  if (!flagOn) return undefined;
  const { getActiveBreakdown } = await import("./verticalDramaStoryBible");
  const item = getActiveBreakdown(bible).find(
    i => i.episodeNumber === episodeNumber
  );
  return item?.tieIn ?? undefined;
}

/**
 * Speaker-aware sub-shots task (Package 5, 2026-07-11 consolidated-clip
 * redesign) — batch-path bug fix + speaker-aware wiring, SAME wave. For each
 * REAL clip `generateRealMotionPromptPack` just produced (their
 * `dialogue[]` already populated by `syncDialogueOntoMotionPromptClips`,
 * called just before this runs in `runStage`) whose dialogue
 * deterministically requires cutting between speakers
 * (`computeSpeakerSwitchSubShotPlan` — the SAME gate
 * `verticalDramaEpisodes.ts`'s `generateShotVideoPrompt` mutation uses,
 * reused here rather than reimplemented), REPLACES that clip in place with
 * ONE combined, timed motion-prompt clip carrying `extraReferenceAssetIds`
 * for every additional speaker (`generateVerticalDramaShotVideoPromptSpeakerSwitch`
 * — the SAME generator `verticalDramaEpisodes.ts`'s split-shot persistence
 * path uses, reused). Every other clip (dialogue-free, or dialogue that
 * doesn't need splitting) passes through completely UNCHANGED.
 *
 * THIS is the fix for the pre-existing bug: the OLD call site (still present
 * further below, for the `dry_run`/`plan_only` PLACEHOLDER builder only —
 * see `buildStagePayload`'s `video_motion_prompt_pack` case, deliberately
 * untouched) re-derived sub-shot clips from `buildStoryboard()`'s DRY-RUN
 * PLACEHOLDER shots even for REAL runs, silently overwriting real generated
 * clips with placeholder text whenever a shot split. This function instead
 * operates on the REAL `pack` already produced by `generateRealMotionPromptPack`,
 * and is called from `runStage`'s real (non-dry-run/non-plan-only) branch
 * INSTEAD of the placeholder `planSubShots` expansion.
 *
 * `flagOn === false` is a no-op (returns `pack` unchanged) — same fail-
 * closed default as every other sub-shot gate. A single shot's sub-shot
 * generation failure is swallowed (that shot keeps its real, unsplit
 * pack-level clip) so one bad shot never aborts the whole
 * `video_motion_prompt_pack` stage run — the OUTER `runStage` try/catch
 * around this whole override already has its own failed/repair convention
 * for a total failure; this is the same philosophy applied per-shot.
 *
 * Dynamic `import()`s below (model registry / media defaults / tenant
 * flags) are short-circuited BEFORE they run by `flagOn` and by "does this
 * pack even have any dialogue-bearing clip" — mirrors
 * `resolveEpisodeDraftHydration`'s established convention in this same file
 * (a static import here would load those modules' heavier transitive
 * chains, unmocked, in this file's own test suite; the lazy import only
 * ever executes when the `verticalDramaSeriesSubShots` flag is actually on,
 * which no pre-existing test enables).
 */
async function applySpeakerSwitchSubShotsToRealMotionPromptPack(
  owner: EpisodeRunOwner,
  episode: VerticalDramaEpisodeRow,
  pack: VideoMotionPromptPackProjection,
  flagOn: boolean,
  subShotPolicy: VerticalDramaSubShotPolicy
): Promise<VideoMotionPromptPackProjection> {
  if (!flagOn) return pack;

  const splitCandidateClips = pack.clips.filter(
    clip =>
      (clip.dialogue?.length ?? 0) > 0 &&
      typeof clip.sourceShotNumbers?.[0] === "number"
  );
  if (splitCandidateClips.length === 0) return pack;

  const [
    { getModelsByTypeAsync },
    { DEFAULT_MODELS },
    { getTenantFeatureFlags },
  ] = await Promise.all([
    import("./modelRegistry"),
    import("./mediaGenerationService"),
    import("./tenantFeatureFlagService"),
  ]);

  const storyboard =
    (episode.storyboard as Record<string, unknown> | null) ?? null;
  const storyboardShots: Array<Record<string, unknown>> = Array.isArray(
    storyboard?.shots
  )
    ? (storyboard!.shots as Array<Record<string, unknown>>)
    : [];
  const storyboardShotByNumber = new Map(
    storyboardShots.map(s => [Number(s.shotNumber ?? s.shot_number ?? 0), s])
  );

  const startFramePlan =
    (episode.startFramePlan as VerticalDramaStartFramePlan | null) ?? null;
  const frameByShotNumber = new Map(
    (startFramePlan?.frames ?? []).map(f => [f.shotNumber, f])
  );

  // Model resolution — mirrors `verticalDramaEpisodes.ts`'s
  // `resolveEpisodeVideoModel` (duplicated minimally here rather than
  // imported: importing FROM the router would invert this file's dependency
  // direction, since the router already depends on THIS file for the
  // pipeline runner).
  const models = await getModelsByTypeAsync("video");
  const requestedModelId = pack.selectedVideoModelId?.trim();
  const selectedVideoModel = (requestedModelId &&
    models.find(m => m.id === requestedModelId && m.isEnabled !== false)) ||
    models.find(m => m.id === DEFAULT_MODELS.video) || {
      id: DEFAULT_MODELS.video,
      type: "video" as const,
      name: DEFAULT_MODELS.video,
      provider: "unknown",
      description: "",
      aliases: [],
      creditCost: 10,
    };

  // Native audio direction — same flag key `verticalDramaEpisodes.ts`'s
  // `resolveVerticalDramaNativeAudioPromptsFlag` checks, ANDed with the
  // episode's own persisted preference. Read from `episode.motionPromptPack`
  // (the PRIOR persisted pack, set via `setEpisodeVideoPromptLanguage`'s
  // sibling mutation) rather than the freshly-built `pack` param — the
  // `VideoMotionPromptPackProjection` this function receives doesn't carry
  // `nativeAudioEnabled` (only the final `VerticalDramaMotionPromptPack`
  // wire shape does; the router applies the identical "read prior pack's
  // preference" convention for the SAME reason — see
  // `generateShotVideoPrompt`'s `requestedNativeAudioEnabled`). Same
  // "rollout gate AND user preference" resolution as the per-shot mutation,
  // just without an `input.nativeAudioEnabled` override (no per-call UI
  // toggle exists for the whole-episode batch path).
  const priorPersistedPack = episode.motionPromptPack as {
    nativeAudioEnabled?: boolean;
  } | null;
  const flags = await getTenantFeatureFlags(owner.tenantId).catch(() => null);
  const nativeAudioEnabled =
    flags?.verticalDramaSeriesNativeAudioPrompts === true &&
    priorPersistedPack?.nativeAudioEnabled === true;

  const [localeSeriesRow] = await db
    .select({ locale: verticalDramaSeries.locale })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId)
      )
    )
    .limit(1);
  const locale: VerticalDramaSeriesLocale = normalizeVerticalDramaSeriesLocale(
    localeSeriesRow?.locale
  );

  // Product tie-in context — same source the `start_frame_render_plan`
  // override above already reads from; resolved ONCE for the whole episode,
  // reused per split shot below.
  const scriptPayload =
    (episode.script as Record<string, unknown> | null) ?? null;
  const tieInPlacements = extractShotProductPlacements(
    scriptPayload?.product_tie_in_plan
  );
  let tieInProductName: string | undefined;
  let tieInProductCategory: string | undefined;
  if (tieInPlacements.length > 0) {
    const [tieInSeriesRow] = await db
      .select({ productTieIn: verticalDramaSeries.productTieIn })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);
    const rawProductTieIn =
      (tieInSeriesRow?.productTieIn as Record<string, unknown> | null) ?? null;
    tieInProductName =
      typeof rawProductTieIn?.productName === "string"
        ? rawProductTieIn.productName
        : undefined;
    tieInProductCategory =
      typeof rawProductTieIn?.productCategory === "string"
        ? rawProductTieIn.productCategory
        : undefined;
  }

  let updatedClips = pack.clips.slice();

  for (const clip of splitCandidateClips) {
    const shotNumber = clip.sourceShotNumbers[0]!;
    const decision = computeSpeakerSwitchSubShotPlan(
      clip.dialogue ?? [],
      clip.durationSeconds,
      subShotPolicy
    );
    if (!decision.needsSplit) continue;

    const frame = frameByShotNumber.get(shotNumber);
    const approvedAssetId = frame?.approvedMediaAssetId
      ? Number(frame.approvedMediaAssetId)
      : undefined;
    if (
      !approvedAssetId ||
      !Number.isInteger(approvedAssetId) ||
      approvedAssetId <= 0
    ) {
      // No approved start frame yet for this shot — cannot ground a
      // vision-based sub-shot generation call. Graceful degrade: this
      // shot's existing REAL (single, unsplit) clip from
      // `generateRealMotionPromptPack` is left exactly as-is, never
      // replaced with placeholder text.
      continue;
    }
    const [imageAssetRow] = await db
      .select({ url: mediaAssets.originalUrl })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, approvedAssetId),
          eq(mediaAssets.tenantId, owner.tenantId),
          eq(mediaAssets.userId, owner.userId)
        )
      )
      .limit(1);
    if (!imageAssetRow?.url) continue;

    const storyboardShot = storyboardShotByNumber.get(shotNumber);
    const tieInPlacement = findPlacementForShot(tieInPlacements, shotNumber);
    const speakerCharacterKeys = Array.from(
      new Set(
        decision.windows
          .map(window => window.characterKey?.trim())
          .filter((key): key is string => Boolean(key))
      )
    );
    const establishedCharacterKeys = frame?.requiredCharacterRefs?.length
      ? frame.requiredCharacterRefs
      : speakerCharacterKeys;
    const characterReferenceImages =
      await resolvePipelineCharacterReferenceImages(
        owner,
        establishedCharacterKeys
      );
    const characterNameByKey = new Map(
      characterReferenceImages
        .filter(reference => Boolean(reference.name))
        .map(reference => [reference.characterKey, reference.name!])
    );
    const speakerDialogueLines = (clip.dialogue ?? []).map(line => ({
      ...line,
      speakerName: line.characterKey
        ? characterNameByKey.get(line.characterKey)
        : undefined,
    }));

    try {
      const speakerSwitchGeneration =
        await generateVerticalDramaShotVideoPromptSpeakerSwitch({
          userId: owner.userId,
          tenantId: owner.tenantId,
          seriesId: owner.seriesId,
          episodeId: owner.episodeId,
          shotNumber,
          imageUrl: imageAssetRow.url,
          imagePrompt: frame?.imagePrompt,
          shotContext: {
            description:
              typeof storyboardShot?.description === "string"
                ? storyboardShot.description
                : undefined,
            camera:
              typeof storyboardShot?.cameraSetup === "string"
                ? storyboardShot.cameraSetup
                : undefined,
            dialogueLines: speakerDialogueLines,
            productContext: tieInPlacement
              ? {
                  productName: tieInProductName,
                  benefitTalkingPoint: tieInPlacement.benefitTalkingPoint,
                  placementStyle: tieInPlacement.placementStyle,
                  productCategory: tieInProductCategory,
                }
              : undefined,
          },
          selectedVideoModelId: selectedVideoModel.id,
          selectedVideoModel,
          characterReferenceImages,
          locale,
          promptLanguage: pack.promptLanguage,
          dialogueLanguage: pack.dialogueLanguage,
          thaiAccent: pack.thaiAccent,
          nativeAudioEnabled,
          idempotencyKey: `${owner.episodeId}:video_motion_prompt_pack:subshots:${shotNumber}`,
          subShotWindows: decision.windows,
        });

      // Resolve every distinct speaker's own approved primary-portrait media
      // asset id, in `distinctSpeakerCharacterKeys` order (anchor speaker
      // first) — same resolution convention as
      // `verticalDramaEpisodes.ts`'s `generateAndPersistSplitShotVideoPrompt`.
      const distinctCharacterKeys =
        speakerSwitchGeneration.distinctSpeakerCharacterKeys;
      const portraitAssetIdByCharacterKey = new Map<string, string>();
      if (distinctCharacterKeys.length > 0) {
        const characterRows = await db
          .select({
            id: verticalDramaCharacters.id,
            characterKey: verticalDramaCharacters.characterKey,
          })
          .from(verticalDramaCharacters)
          .where(
            and(
              eq(verticalDramaCharacters.tenantId, owner.tenantId),
              eq(verticalDramaCharacters.seriesId, owner.seriesId),
              inArray(
                verticalDramaCharacters.characterKey,
                distinctCharacterKeys
              )
            )
          );
        const characterRowByKey = new Map<
          string,
          (typeof characterRows)[number]
        >();
        for (const c of characterRows) {
          characterRowByKey.set(c.characterKey, c);
        }
        for (const key of distinctCharacterKeys) {
          const characterRow = characterRowByKey.get(key);
          if (!characterRow) continue;
          const assetId =
            await verticalDramaCharacterStockService.getPrimaryPortraitAssetId(
              {
                tenantId: owner.tenantId,
                userId: owner.userId,
                seriesId: owner.seriesId,
              },
              characterRow.id
            );
          if (assetId) {
            portraitAssetIdByCharacterKey.set(key, String(assetId));
          }
        }
      }
      const orderedPortraitAssetIds = distinctCharacterKeys
        .map(key => portraitAssetIdByCharacterKey.get(key))
        .filter((id): id is string => Boolean(id));
      const [anchorStartFrameAssetId, ...extraReferenceAssetIds] =
        orderedPortraitAssetIds;

      // Exactly ONE clip, shaped IDENTICALLY to a normal single-shot clip
      // (`clipNumber: shotNumber`, no `parentShotNumber`/`subShotNumber`) —
      // same "consolidated clip" shape as
      // `generateAndPersistSplitShotVideoPrompt`'s persistence path.
      const newClip = {
        clipNumber: shotNumber,
        sourceShotNumbers: [shotNumber],
        durationSeconds: speakerSwitchGeneration.durationSeconds,
        prompt: speakerSwitchGeneration.prompt,
        negativeMotionPrompt: speakerSwitchGeneration.negativeMotionPrompt,
        startFrameAssetId: anchorStartFrameAssetId,
        extraReferenceAssetIds: extraReferenceAssetIds.length
          ? extraReferenceAssetIds
          : undefined,
        dialogue: speakerSwitchGeneration.dialogue,
        requiredDisclosure: speakerSwitchGeneration.requiredDisclosure,
        audioDirection: speakerSwitchGeneration.audioDirection,
      };

      // Replace, don't append — same convention as
      // `verticalDramaEpisodes.ts`'s `generateAndPersistSplitShotVideoPrompt`
      // (Package 3): remove every existing clip for this shot (whether a
      // single clip or a legacy pre-2026-07-11 N-clip split) before
      // inserting the one new consolidated clip.
      updatedClips = [
        ...updatedClips.filter(
          c =>
            !(
              c.sourceShotNumbers?.includes(shotNumber) ||
              c.parentShotNumber === shotNumber
            )
        ),
        newClip,
      ];
    } catch {
      // Best-effort per shot — never abort the whole batch over one shot's
      // generation failure; that shot keeps its real (unsplit) pack-level
      // clip exactly as `generateRealMotionPromptPack` produced it.
      continue;
    }
  }

  return { ...pack, clips: updatedClips };
}

/**
 * Part B2/B3 (planning/`polished-toasting-gadget.md`) — maps a stored series
 * locale onto `StoryScriptLang`'s narrower `"th" | "en"` for
 * `formatStoryScriptEpisodePlanContext`. Mirrors
 * `verticalDramaImproveScript.ts`'s own (file-local, unexported)
 * `resolveScriptLangFromLocale` exactly — duplicated locally rather than
 * exporting/importing across files for one trivial ternary; this file does
 * not otherwise depend on `verticalDramaImproveScript.ts` and the plan
 * explicitly keeps that file untouched.
 */
function resolveStoryScriptLangFromLocale(
  locale: string | null | undefined
): StoryScriptLang {
  return locale === "th" ? "th" : "en";
}

/**
 * `regenerateStage`'s post-success downstream reset for `storyboard_shotgrid`
 * ONLY — replicated here (rather than imported from
 * `routers/verticalDramaEpisodes.ts`, which imports FROM this file) to avoid
 * a service -> router circular import. Mirrors that mutation's inline
 * post-success block EXACTLY (same `stagesToClear`/`downstreamColumnByStage`
 * shape, including deleting the run row matching `stage` itself — an
 * existing quirk of that block predating this change, carried forward
 * unmodified since fixing it is out of this task's scope), just deferred to
 * run from `runStoryboardShotgridStageJob`'s background success path instead
 * of synchronously right after `runStage` returns. The router's own
 * synchronous `regenerateStage` path for every OTHER stage is untouched.
 */
async function clearStoryboardShotgridDownstreamAfterRegenerate(
  owner: EpisodeRunOwner
): Promise<void> {
  const stage: VerticalDramaPipelineStage = "storyboard_shotgrid";
  const stagesToClear = [
    stage,
    ...VerticalDramaEpisodePipeline.downstreamStages(stage),
  ];
  await db
    .delete(verticalDramaEpisodeRuns)
    .where(
      and(
        eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
        eq(verticalDramaEpisodeRuns.userId, owner.userId),
        eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
        eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        inArray(verticalDramaEpisodeRuns.stage, stagesToClear)
      )
    );

  const downstreamColumnByStage: Partial<
    Record<
      VerticalDramaPipelineStage,
      keyof typeof verticalDramaEpisodes.$inferInsert
    >
  > = {
    start_frame_render_plan: "startFramePlan",
    dialogue_audio_plan: "dialogueAudioPlan",
    video_motion_prompt_pack: "motionPromptPack",
    assemble_episode_manifest: "assemblyManifest",
  };
  const downstream = VerticalDramaEpisodePipeline.downstreamStages(stage);
  const columnUpdates: Record<string, null> = {};
  for (const s of downstream) {
    const col = downstreamColumnByStage[s];
    if (col) columnUpdates[col] = null;
  }
  if (downstream.includes("create_storyboard_review_project")) {
    columnUpdates.storyboardReviewId = null;
  }
  if (Object.keys(columnUpdates).length > 0) {
    await db
      .update(verticalDramaEpisodes)
      .set({ ...columnUpdates, updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaEpisodes.id, owner.episodeId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
          eq(verticalDramaEpisodes.seriesId, owner.seriesId)
        )
      );
  }
}

export class VerticalDramaEpisodePipeline {
  constructor(
    private readonly providerPort: ProviderRoutingPort = createStubProviderRoutingPort(),
    private readonly memoryService: VerticalDramaSeriesMemoryService = verticalDramaSeriesMemoryService
  ) {}

  /** Downstream stages after `stage` in the canonical sequence. */
  static downstreamStages(
    stage: VerticalDramaPipelineStage
  ): VerticalDramaPipelineStage[] {
    const i = VERTICAL_DRAMA_PIPELINE_STAGES.indexOf(stage);
    return i < 0 ? [] : VERTICAL_DRAMA_PIPELINE_STAGES.slice(i + 1);
  }

  private async loadEpisode(
    owner: EpisodeRunOwner
  ): Promise<VerticalDramaEpisodeRow> {
    const [row] = await db
      .select()
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.id, owner.episodeId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
          eq(verticalDramaEpisodes.seriesId, owner.seriesId)
        )
      )
      .limit(1);
    if (!row) throw new Error("vertical_drama_episode_not_found");
    return row;
  }

  /** Persist an immutable artifact-ledger row and return its id. */
  private async writeArtifact(
    owner: EpisodeRunOwner,
    runId: number,
    stage: VerticalDramaPipelineStage,
    payload: Record<string, unknown>,
    mediaAssetIds: number[]
  ): Promise<VerticalDramaRunArtifactRow> {
    const [row] = await db
      .insert(verticalDramaRunArtifacts)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId,
        stage,
        jsonPayload: payload,
        mediaAssetIds: mediaAssetIds.length > 0 ? mediaAssetIds : null,
        checksumSha256: artifactChecksumSha256(payload),
      } as typeof verticalDramaRunArtifacts.$inferInsert)
      .returning();
    return row as VerticalDramaRunArtifactRow;
  }

  /**
   * `existingRunId` — the `queued` placeholder row a background stage job is
   * already running against
   * (`planning/vd-async-stage-jobs-generalization/plan.md` S1). When present,
   * FINALIZE that row instead of inserting a sibling: the client is polling
   * that exact id, and a second row for the same (episode, stage) would leave
   * it watching a row that never reaches a terminal status.
   *
   * Falls back to the insert when the id no longer matches a row — the caller
   * still gets a real run id, which every artifact FK downstream depends on.
   * Every synchronous path passes nothing and is byte-identical to before.
   */
  /**
   * `writeRun` for every branch inside `runStage`, which is the only caller
   * that can be executing on behalf of a background stage job. Exists so the
   * `asyncRunId` hand-off is expressed ONCE instead of at each of the eight
   * terminal branches — missing one there would silently insert a duplicate
   * run row and strand the client's poll.
   */
  private async writeRunForStage(
    owner: EpisodeRunOwner,
    stage: VerticalDramaPipelineStage,
    mode: VerticalDramaRunnerMode,
    opts: RunStageOptions,
    result: Pick<
      RunResult,
      "status" | "next_action" | "artifactIds" | "warnings" | "errors"
    >
  ): Promise<number> {
    return this.writeRun(owner, stage, mode, result, opts.asyncRunId);
  }

  private async writeRun(
    owner: EpisodeRunOwner,
    stage: VerticalDramaPipelineStage,
    mode: VerticalDramaRunnerMode,
    result: Pick<
      RunResult,
      "status" | "next_action" | "artifactIds" | "warnings" | "errors"
    >,
    existingRunId?: number
  ): Promise<number> {
    if (existingRunId != null) {
      const [updated] = await db
        .update(verticalDramaEpisodeRuns)
        .set({
          runMode: mode,
          status: result.status,
          nextAction: result.next_action,
          artifactIds: result.artifactIds,
          warnings: result.warnings,
          errors: result.errors,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(verticalDramaEpisodeRuns.id, existingRunId),
            eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
            eq(verticalDramaEpisodeRuns.userId, owner.userId),
            eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
            eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
            eq(verticalDramaEpisodeRuns.stage, stage)
          )
        )
        .returning({ id: verticalDramaEpisodeRuns.id });
      if (updated) return updated.id;
    }
    const [row] = await db
      .insert(verticalDramaEpisodeRuns)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        stage,
        runMode: mode,
        status: result.status,
        nextAction: result.next_action,
        artifactIds: result.artifactIds,
        warnings: result.warnings,
        errors: result.errors,
      })
      .returning({ id: verticalDramaEpisodeRuns.id });
    return row.id;
  }

  /**
   * Build the `generateEpisodeScript` params from real DB context (series
   * bible/locale/tone + the character roster — same lookups as
   * `generateRealStoryboard` below, minus the reference-image identity-lock
   * plumbing, which the script builder skill has no use for) and invoke it.
   * Called from `runStage` for `plan_episode_script` when the mode is not
   * dry_run/plan_only, and from `repairStage` (real-repair wiring) for the
   * same stage.
   *
   * `repairInstruction` (optional, added for `repairStage`) — when present,
   * threads `episode.script` (the CURRENT persisted script) + the
   * instruction into `generateEpisodeScript`'s `repairContext`, reframing
   * the call as a targeted REPAIR instead of a fresh generation (see that
   * param's doc comment in `verticalDramaScriptGeneration.ts`). Omitted for
   * every `runStage` call site, which is byte-identical to before this
   * parameter existed.
   *
   * `retentionHooksEnabled` (`planning/vertical-drama-retention-hooks/
   * plan.md` W1, tenant flag `verticalDramaRetentionHooks`, added
   * 2026-07-11) — same "router resolves the tenant flag" convention as
   * `sceneContractsEnabled` above. Threads the ALREADY-LOADED `seriesRow`'s
   * `genre` column into `generateEpisodeScript` unconditionally (cheap,
   * additive fact) and gates rendering it (plus skill.md's new
   * genre-conditional retention-loop guidance) via `opts.retentionHooksEnabled`.
   * Defaults to false, so every existing caller is byte-identical.
   */
  private async generateRealScript(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow,
    deepStoryDraftsFlagOn: boolean = false,
    repairInstruction?: string,
    tieInReplanFlagOn: boolean = false,
    sceneContractsEnabled: boolean = false,
    retentionHooksEnabled: boolean = false
  ): Promise<{
    script: ScriptBuilderOutput;
    creditsUsed: number;
    model: string;
  }> {
    // `plan_episode_script` runs in its own `runStage` call, separate from
    // `normalize_series_input` (where `memoryBundle` is built above) — so it
    // is rebuilt here. This is a cheap, pure DB read (append-only event list
    // -> deterministic bundle), never an LLM call, so re-deriving it per
    // stage costs nothing and keeps each stage's `runStage` invocation
    // self-contained (no cross-stage state threading required).
    const memoryBundle = await this.memoryService.buildEpisodeMemoryBundle(
      {
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
      },
      episode.episodeNumber
    );

    const [seriesRow] = await db
      .select()
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);

    const characterRows = await db
      .select({
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
        role: verticalDramaCharacters.role,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId)
        )
      );

    const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
    const episodeBreakdown = Array.isArray(bible?.episodeBreakdown)
      ? (bible!.episodeBreakdown as Array<Record<string, unknown>>)
      : [];
    const matchingBreakdown = episodeBreakdown.find(
      item => Number(item.episodeNumber) === episode.episodeNumber
    );

    // Product tie-in policy (spec §13) — the series' loosely-typed
    // `productTieIn` JSON blob (see `VerticalDramaProductTieInTab.tsx`'s doc
    // comment for the exact field names it writes: `enabled`, `productName`,
    // `forbiddenClaims`). Only forwarded to the script builder when enabled;
    // `productDescription`/`allowedStoryFunctions` are read defensively since
    // this column predates a strict Zod contract.
    const rawProductTieIn =
      (seriesRow?.productTieIn as Record<string, unknown> | null) ?? null;
    const productTieIn =
      rawProductTieIn?.enabled === true
        ? {
            enabled: true,
            productName:
              typeof rawProductTieIn.productName === "string"
                ? rawProductTieIn.productName
                : undefined,
            productDescription:
              typeof rawProductTieIn.productDescription === "string"
                ? rawProductTieIn.productDescription
                : undefined,
            allowedStoryFunctions: Array.isArray(
              rawProductTieIn.allowedStoryFunctions
            )
              ? (rawProductTieIn.allowedStoryFunctions as string[])
              : undefined,
            forbiddenClaims: Array.isArray(rawProductTieIn.forbiddenClaims)
              ? (rawProductTieIn.forbiddenClaims as string[])
              : undefined,
          }
        : undefined;

    // Deep story drafts hydration (W10-B) — resolved from the SAME `bible`
    // already loaded above (no extra DB round trip). `null` whenever the
    // flag is off or the episode's active breakdown item carries no
    // `shotDrafts`, in which case `episodeDraft`/`opts.episodeDraftHydrationEnabled`
    // below are both omitted/false and the prompt stays byte-identical to
    // before this change.
    const episodeDraft = await resolveEpisodeDraftHydration(
      bible,
      episode.episodeNumber,
      deepStoryDraftsFlagOn
    );

    // Season tie-in placement (task #31, F131Y) — active-version read; see
    // `resolveEpisodeTieInPlacement`'s doc comment.
    const episodeTieInPlacement = await resolveEpisodeTieInPlacement(
      bible,
      episode.episodeNumber,
      tieInReplanFlagOn
    );

    return generateEpisodeScript({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeTitle: episode.title ?? `Episode ${episode.episodeNumber}`,
      episodeNumber: episode.episodeNumber,
      locale: normalizeVerticalDramaSeriesLocale(seriesRow?.locale),
      durationSeconds: episode.targetDurationSeconds ?? 60,
      productTieIn,
      episodeDraft: episodeDraft ?? undefined,
      episodeTieInPlacement,
      // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md`
      // W1) — the series' free-text `genre` column, already available on
      // the full `seriesRow` select above. Passed unconditionally (cheap
      // additive fact); only RENDERED into the prompt when
      // `opts.retentionHooksEnabled` is true (see
      // `verticalDramaScriptGeneration.ts`'s `genre` param doc comment).
      genre: seriesRow?.genre ?? undefined,
      opts: {
        episodeDraftHydrationEnabled: episodeDraft !== null,
        sceneContractsEnabled,
        retentionHooksEnabled,
      },
      storySource: {
        logline:
          typeof matchingBreakdown?.logline === "string"
            ? (matchingBreakdown.logline as string)
            : undefined,
        keyBeats: Array.isArray(matchingBreakdown?.keyBeats)
          ? (matchingBreakdown.keyBeats as string[])
          : undefined,
        mainPlot:
          typeof bible?.mainPlot === "string"
            ? (bible.mainPlot as string)
            : undefined,
        seasonArc:
          typeof bible?.expandedSeasonArc === "string"
            ? (bible.expandedSeasonArc as string)
            : typeof bible?.seasonArc === "string"
              ? (bible.seasonArc as string)
              : undefined,
        tone: seriesRow?.tone ?? undefined,
      },
      characters: characterRows.map(
        (c: { characterKey: string; name: string; role: string | null }) => ({
          characterId: c.characterKey,
          name: c.name,
          role: c.role,
        })
      ),
      memoryBundle,
      repairContext: repairInstruction
        ? {
            currentScript:
              (episode.script as Record<string, unknown> | null) ?? {},
            instruction: repairInstruction,
          }
        : undefined,
    });
  }

  /**
   * Build the `runVerticalDramaSeriesMemoryPlanning` params from real DB
   * context (the episode's own `script`/`storyboard`/`dialogueAudioPlan`
   * jsonb columns plus the prior series memory bundle for continuity
   * grounding) and invoke it. Only called from `runStage` for
   * `summarize_episode_to_series_memory` when the mode is not
   * dry_run/plan_only. This is the fix for the previously-orphaned
   * `vertical-drama-series-memory-planner` skill — before this method
   * existed, the stage's only output was a deterministic placeholder
   * string and only ONE memory event kind (`episode_summary`) was ever
   * written on approval.
   */
  private async generateRealSeriesMemoryPlan(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow
  ): Promise<{
    planned: SeriesMemoryPlannerOutput;
    creditsUsed: number;
    model: string;
  }> {
    const [seriesRow] = await db
      .select({ locale: verticalDramaSeries.locale })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);

    // Prior memory (built BEFORE this episode's own summary is appended —
    // the append only happens later, on explicit checkpoint approval) so the
    // planner sees continuity context but never double-counts this episode.
    const priorMemoryBundle = await this.memoryService.buildEpisodeMemoryBundle(
      {
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
      },
      episode.episodeNumber
    );

    return runVerticalDramaSeriesMemoryPlanning({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeNumber: episode.episodeNumber,
      locale: normalizeVerticalDramaSeriesLocale(seriesRow?.locale),
      script: (episode.script as Record<string, unknown> | null) ?? {},
      storyboard: episode.storyboard as Record<string, unknown> | null,
      dialoguePlan: episode.dialogueAudioPlan as Record<string, unknown> | null,
      priorMemoryBundle,
    });
  }

  /**
   * `update_character_visual_bible`'s real implementation is a data SYNC,
   * not a fresh LLM call — the actual visual-bible prompt generation already
   * happens via the separate character-management flow
   * (`verticalDramaCharacters.ts`'s `generateCharacterImage`/
   * `generateCharacterVisualPrompts`, which invokes the
   * `vertical-drama-character-visual-bible` skill directly and is the single
   * source of truth for each character's prompts). Re-invoking that skill
   * here would just burn credits on a duplicate LLM call. Instead this reads
   * the current character roster + whether each has an approved primary
   * portrait (reusing `getPrimaryPortraitUrl`, the same lookup
   * `generateRealStoryboard` below uses for identity-lock) and reports it as
   * this stage's real (non-placeholder) output. No credits, no rate limit,
   * no schema validation gate exists for this stage.
   */
  private async syncCharacterVisualBible(owner: EpisodeRunOwner): Promise<{
    characters: Array<{
      character_id: string;
      name: string;
      role: string | null;
      has_approved_portrait: boolean;
    }>;
    changed: boolean;
  }> {
    const characterRows = await db
      .select({
        id: verticalDramaCharacters.id,
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
        role: verticalDramaCharacters.role,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId)
        )
      );

    const portraitUrls = await Promise.all(
      characterRows.map((c: { id: number }) =>
        verticalDramaCharacterStockService.getPrimaryPortraitUrl(owner, c.id)
      )
    );

    return {
      characters: characterRows.map(
        (
          c: { characterKey: string; name: string; role: string | null },
          i: number
        ) => ({
          character_id: c.characterKey,
          name: c.name,
          role: c.role,
          has_approved_portrait: Boolean(portraitUrls[i]),
        })
      ),
      changed: characterRows.length > 0,
    };
  }

  /**
   * Build the `generateStoryboardShotgrid` params from real DB context
   * (series bible/locale/tone + the character roster) and invoke it. Called
   * from `runStage` for `storyboard_shotgrid` when the mode is not
   * dry_run/plan_only, and from `repairStage` (real-repair wiring) for the
   * same stage.
   *
   * `repairInstruction` (optional, added for `repairStage`) — same
   * decoupled convention as `generateRealScript`'s identical parameter
   * above: when present, threads `episode.storyboard` (the CURRENT
   * persisted storyboard) + the instruction into
   * `generateStoryboardShotgrid`'s `repairContext`. Omitted for every
   * `runStage` call site, which is byte-identical to before this parameter
   * existed.
   *
   * `retentionHooksEnabled` (`planning/vertical-drama-retention-hooks/
   * plan.md` W3, tenant flag `verticalDramaRetentionHooks`, added
   * 2026-07-11) — same "router resolves the tenant flag" convention as
   * `sceneContractsEnabled` above and as `generateRealScript`'s identical
   * parameter (W1). Threads the ALREADY-LOADED `seriesRow`'s `genre` column
   * into `generateStoryboardShotgrid` unconditionally (cheap, additive
   * fact) and gates rendering it via `opts.retentionHooksEnabled`. Defaults
   * to false, so every existing caller is byte-identical.
   */
  private async generateRealStoryboard(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow,
    deepStoryDraftsFlagOn: boolean = false,
    repairInstruction?: string,
    sceneContractsEnabled: boolean = false,
    retentionHooksEnabled: boolean = false,
    motionContractsEnabled: boolean = false
  ): Promise<{
    storyboard: StoryboardShotgridOutput;
    creditsUsed: number;
    model: string;
  }> {
    const [seriesRow] = await db
      .select()
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);

    let seriesLookRegister: GenerateStoryboardShotgridParams["seriesLookRegister"];
    try {
      const { getTenantFeatureFlags } =
        await import("./tenantFeatureFlagService");
      const flags = await getTenantFeatureFlags(owner.tenantId);
      const identity = resolveEffectiveSeriesVisualIdentity({
        bible: seriesRow?.bible,
        presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
        lookLockEnabled: flags.verticalDramaSeriesLookLock === true,
      });
      if (identity) {
        seriesLookRegister = {
          styleName: identity.styleName,
          palette: identity.palette,
          lighting: identity.lighting,
          cameraGrammar: identity.cameraGrammar,
        };
      }
    } catch {
      // Fail closed: unavailable flags or malformed stored identity must not
      // leak an unauthorized look into storyboard authoring.
    }

    // Character variants (planning/vertical-drama-character-variants/plan.md
    // Phase D) — fetch the WHOLE roster in one query (unchanged query shape
    // otherwise) and partition it in-memory into base characters
    // (`parentCharacterId == null` — includes twins, which are independent
    // characters, not variants) and variant rows (`parentCharacterId` set).
    // Only base characters are sent as top-level `characters` entries below
    // (unchanged, byte-identical for a series with no variant rows yet); each
    // base character's variant rows are attached under its own `variants[]`
    // (see the `characters.map(...)` block below).
    const allCharacterRows = await db
      .select({
        id: verticalDramaCharacters.id,
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
        role: verticalDramaCharacters.role,
        parentCharacterId: verticalDramaCharacters.parentCharacterId,
        variantLabel: verticalDramaCharacters.variantLabel,
        variantType: verticalDramaCharacters.variantType,
        sharesFaceWithCharacterId:
          verticalDramaCharacters.sharesFaceWithCharacterId,
        data: verticalDramaCharacters.data,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId)
        )
      );
    type VdCharacterRosterRow = (typeof allCharacterRows)[number];
    const characterRows = allCharacterRows.filter(
      (c: VdCharacterRosterRow) => c.parentCharacterId == null
    );
    const variantRows = allCharacterRows.filter(
      (c: VdCharacterRosterRow) => c.parentCharacterId != null
    );

    // Alias-aware speaker resolution (`planning/vd-character-identity-repair/
    // plan.md` — closes the plan's last-remaining gap). This series' durable
    // `vertical_drama_character_aliases` rows, grouped by the OWNING base
    // character's numeric `id` (the alias table's `characterId` column,
    // NOT `characterKey` — see that table's own doc comment in
    // `drizzle/schema.ts`), then threaded onto each base character's
    // `characters[].aliases` entry below so
    // `generateStoryboardShotgrid`'s dialogue-speaker-coverage reconcile
    // (`speakerLookup` in `verticalDramaStoryboardGeneration.ts`) can map an
    // aliased spelling a story writes (e.g. "Kirin"/"คีริน" after series 18's
    // merge absorbed them as aliases of character 70) back to the SAME
    // characterId its canonical name resolves to, instead of silently
    // dropping that reference-image attachment as an unknown speaker. Query
    // is series-scoped only (no `characterId IN (...)` filter needed — every
    // alias row for this series already points at a row this same query's
    // sibling `allCharacterRows` above also loaded). A series with zero
    // alias rows (every series before this feature, and every series with
    // no merge history) produces an empty map, so `aliases` is omitted for
    // every character below and the storyboard prompt/reconcile stays
    // byte-identical to before this field existed.
    const aliasRows = await db
      .select({
        characterId: verticalDramaCharacterAliases.characterId,
        alias: verticalDramaCharacterAliases.alias,
      })
      .from(verticalDramaCharacterAliases)
      .where(
        and(
          eq(verticalDramaCharacterAliases.tenantId, owner.tenantId),
          eq(verticalDramaCharacterAliases.seriesId, owner.seriesId)
        )
      );
    const aliasesByCharacterId = new Map<number, string[]>();
    for (const a of aliasRows) {
      const list = aliasesByCharacterId.get(a.characterId) ?? [];
      list.push(a.alias);
      aliasesByCharacterId.set(a.characterId, list);
    }

    // Identity-lock (upstream parity, see `referenceImageUrl` doc comment on
    // `GenerateStoryboardShotgridParams`) — reuses the same
    // `getPrimaryPortraitUrl` lookup already wired into character
    // portrait/turnaround generation this session, so the storyboard prompt
    // and its `character_attachment_manifest` carry a real reference per
    // character instead of a name-only text description.
    const referenceImageUrls = await Promise.all(
      characterRows.map((c: { id: number }) =>
        verticalDramaCharacterStockService.getPrimaryPortraitUrl(owner, c.id)
      )
    );

    // Each variant row is a normal `vertical_drama_characters` row with its
    // OWN `vertical_drama_character_assets` entries (Phase A doc comment,
    // `drizzle/schema.ts:20466-20487`) — resolve its portrait the SAME way as
    // any base character, keyed by the VARIANT row's own id, never the
    // parent's. A variant with no approved portrait yet (normal mid-flight
    // state while Phase C's portrait-generation skill is still catching up)
    // is EXCLUDED from the available-variants list entirely below — an
    // unusable reference-less variant would only confuse the storyboard
    // skill's per-shot pick, unlike a base character with no portrait (which
    // still participates, just without `referenceImageUrl`, per the existing
    // doc comment on `GenerateStoryboardShotgridParams.characters`).
    const variantPortraitUrls = await Promise.all(
      variantRows.map((v: { id: number }) =>
        verticalDramaCharacterStockService.getPrimaryPortraitUrl(owner, v.id)
      )
    );
    const variantsByParentId = new Map<
      number,
      NonNullable<
        GenerateStoryboardShotgridParams["characters"][number]["variants"]
      >
    >();
    variantRows.forEach((v: VdCharacterRosterRow, i: number) => {
      const referenceImageUrl = variantPortraitUrls[i];
      if (!referenceImageUrl) return; // no approved portrait yet — exclude
      if (v.variantType !== "outfit" && v.variantType !== "age_stage") return; // defensive: malformed/unset row
      if (!v.variantLabel) return; // defensive: malformed row
      const variantData = (v.data as Record<string, unknown> | null) ?? null;
      const description =
        typeof variantData?.description === "string" &&
        variantData.description.trim().length > 0
          ? variantData.description
          : v.variantLabel;
      const list = variantsByParentId.get(v.parentCharacterId as number) ?? [];
      list.push({
        characterKey: v.characterKey,
        variantLabel: v.variantLabel,
        variantType: v.variantType,
        description,
        referenceImageUrl,
      });
      variantsByParentId.set(v.parentCharacterId as number, list);
    });

    // Twin-pair facts (planning/vertical-drama-twin-variant-completeness/
    // plan.md W5) — twins are independent base characters (parentCharacterId
    // == null, already partitioned into `characterRows` above), never
    // variant rows, that happen to share an identical face with another
    // base character (`sharesFaceWithCharacterId`). Build a flat,
    // order-independent list of `{characterKeyA, characterKeyB}` pairs from
    // the same base-character roster already in scope — dedupe so a pair
    // that could be discovered from either character's own
    // `sharesFaceWithCharacterId` pointer (or, defensively, both sides
    // pointing at each other) is only listed once. `characters[]` sent to
    // `generateStoryboardShotgrid` is unaffected — this is purely additive,
    // sibling to `variants` above, so a series with no twins produces an
    // empty list and a byte-identical prompt to before this field existed.
    const characterKeyById = new Map<number, string>(
      characterRows.map((c: VdCharacterRosterRow) => [c.id, c.characterKey])
    );
    const twinPairs: NonNullable<
      GenerateStoryboardShotgridParams["twinPairs"]
    > = [];
    const seenTwinPairKeys = new Set<string>();
    for (const c of characterRows) {
      if (c.sharesFaceWithCharacterId == null) continue;
      const otherKey = characterKeyById.get(c.sharesFaceWithCharacterId);
      if (!otherKey || otherKey === c.characterKey) continue;
      const pairKey = [c.characterKey, otherKey].sort().join("::");
      if (seenTwinPairKeys.has(pairKey)) continue;
      seenTwinPairKeys.add(pairKey);
      twinPairs.push({
        characterKeyA: c.characterKey,
        characterKeyB: otherKey,
      });
    }

    const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
    // Part B1 (planning/`polished-toasting-gadget.md`) — resolve from the
    // series bible's ACTIVE breakdown version via `getActiveBreakdown`
    // (versioned `breakdownVersions[]`, falling back to the legacy
    // top-level `bible.episodeBreakdown` when no versions exist), NOT the
    // legacy top-level array directly — the improve-script flow's enriched,
    // scene-setting logline lives in `breakdownVersions[]` and previously
    // never reached this stage. Dynamic `import()` — see
    // `resolveEpisodeDraftHydration`'s doc comment above for why a static
    // VALUE import of `verticalDramaStoryBible.ts` is avoided in this file.
    const { getActiveBreakdown, readItemCliffhangerLine, readItemShotDrafts } =
      await import("./verticalDramaStoryBible");
    const matchingBreakdown = getActiveBreakdown(bible).find(
      item => item.episodeNumber === episode.episodeNumber
    );

    // Ground the 9 shots in the episode's own scene-by-scene script (the
    // `plan_episode_script` stage's `scene_dialogue_summary`), not just the
    // thin series-bible logline/keyBeats used above. Without this, the
    // shotgrid LLM has nothing concrete to anchor shots to beyond a one-line
    // logline, and produces generic mood shots (e.g. "hands and a ring
    // symbol") disconnected from what the episode's own script says actually
    // happens scene-by-scene. `scene_dialogue_summary` items are LLM
    // freeform JSON (schema is `additionalProperties: true`) — real output
    // observed using both `key_line` and `dialogue_line` for the spoken-line
    // field, so read both.
    const script = (episode.script as Record<string, unknown> | null) ?? null;
    const sceneDialogueSummary = Array.isArray(script?.scene_dialogue_summary)
      ? (script!.scene_dialogue_summary as Array<Record<string, unknown>>)
      : [];
    const sceneBeats = sceneDialogueSummary
      .map(s => ({
        scene: typeof s.scene === "number" ? s.scene : undefined,
        location: typeof s.location === "string" ? s.location : undefined,
        summary: typeof s.summary === "string" ? s.summary : undefined,
        keyLine:
          typeof s.key_line === "string"
            ? s.key_line
            : typeof s.dialogue_line === "string"
              ? s.dialogue_line
              : undefined,
      }))
      .filter(s => s.summary);

    // Deep story drafts hydration (W10-B) — resolved from the SAME `bible`
    // already loaded above (no extra DB round trip). `null` whenever the
    // flag is off or the episode's active breakdown item carries no
    // `shotDrafts`, in which case `episodeDraft`/`opts.episodeDraftHydrationEnabled`
    // below are both omitted/false and the prompt stays byte-identical to
    // before this change.
    const episodeDraft = await resolveEpisodeDraftHydration(
      bible,
      episode.episodeNumber,
      deepStoryDraftsFlagOn
    );

    // Phase 2 of `planning/polished-toasting-gadget.md` (location visual
    // bible) — the series' already-established location roster, supplied to
    // `generateStoryboardShotgrid` as `existingLocations` input FACTS only
    // (see that param's own doc comment: code never decides which location a
    // shot belongs to). Phase 1 added the `existingLocations` param + its
    // prompt rendering but left every call site omitting it entirely (the
    // roster table did not exist yet) — this is the real query that makes it
    // non-empty. A direct, minimal `db.select()` against
    // `vertical_drama_locations` (not `verticalDramaLocationStockService.listRows`,
    // which additionally joins for a `primaryReferenceUrl` this prompt fact
    // has no use for) — tenant/user/series scoped, mapped to the exact
    // `{locationKey, name, description}` shape the param expects.
    const existingLocationRows = await db
      .select({
        locationKey: verticalDramaLocations.locationKey,
        name: verticalDramaLocations.name,
        data: verticalDramaLocations.data,
      })
      .from(verticalDramaLocations)
      .where(
        and(
          eq(verticalDramaLocations.tenantId, owner.tenantId),
          eq(verticalDramaLocations.userId, owner.userId),
          eq(verticalDramaLocations.seriesId, owner.seriesId)
        )
      );
    const existingLocations = existingLocationRows.map(
      (row: (typeof existingLocationRows)[number]) => ({
        locationKey: row.locationKey,
        name: row.name,
        description:
          typeof (row.data as Record<string, unknown> | null)?.description ===
          "string"
            ? ((row.data as Record<string, unknown>).description as string)
            : row.name,
      })
    );

    return generateStoryboardShotgrid({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeTitle: episode.title ?? `Episode ${episode.episodeNumber}`,
      episodeNumber: episode.episodeNumber,
      locale: normalizeVerticalDramaSeriesLocale(seriesRow?.locale),
      durationSeconds: episode.targetDurationSeconds ?? 60,
      seriesLookRegister,
      episodeDraft: episodeDraft ?? undefined,
      existingLocations:
        existingLocations.length > 0 ? existingLocations : undefined,
      // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md`
      // W3) — the series' free-text `genre` column, already available on
      // the full `seriesRow` select above. Passed unconditionally (cheap
      // additive fact); only RENDERED into the prompt when
      // `opts.retentionHooksEnabled` is true (see
      // `verticalDramaStoryboardGeneration.ts`'s `genre` param doc comment).
      genre: seriesRow?.genre ?? undefined,
      opts: {
        episodeDraftHydrationEnabled: episodeDraft !== null,
        sceneContractsEnabled,
        retentionHooksEnabled,
        motionContractsEnabled,
      },
      storySource: {
        logline: matchingBreakdown?.logline,
        keyBeats: matchingBreakdown?.keyBeats,
        // Part B1 (planning/`polished-toasting-gadget.md`) — additive
        // alongside logline/keyBeats above.
        workingTitle: matchingBreakdown?.workingTitle,
        cliffhanger: matchingBreakdown
          ? readItemCliffhangerLine(matchingBreakdown)
          : undefined,
        mainPlot:
          typeof bible?.mainPlot === "string"
            ? (bible.mainPlot as string)
            : undefined,
        seasonArc:
          typeof bible?.expandedSeasonArc === "string"
            ? (bible.expandedSeasonArc as string)
            : typeof bible?.seasonArc === "string"
              ? (bible.seasonArc as string)
              : undefined,
        tone: seriesRow?.tone ?? undefined,
      },
      sceneBeats: sceneBeats.length > 0 ? sceneBeats : undefined,
      characters: characterRows.map(
        (
          c: {
            id: number;
            characterKey: string;
            name: string;
            role: string | null;
          },
          i: number
        ) => ({
          characterId: c.characterKey,
          name: c.name,
          role: c.role,
          referenceImageUrl: referenceImageUrls[i],
          variants: variantsByParentId.get(c.id),
          aliases: aliasesByCharacterId.get(c.id),
        })
      ),
      twinPairs: twinPairs.length > 0 ? twinPairs : undefined,
      repairContext: repairInstruction
        ? {
            currentStoryboard:
              (episode.storyboard as Record<string, unknown> | null) ?? {},
            instruction: repairInstruction,
          }
        : undefined,
    });
  }

  /**
   * Build the `generateEpisodeDialogueAudioPlan` params from real DB context
   * (episode script/storyboard/current dialogue plan + the character
   * roster), invoke the previously-orphaned `vertical-drama-dialogue-audio-planner`
   * skill (see that function's own doc comment in
   * `verticalDramaDialogueAudio.ts` for why it existed on disk but was never
   * called) for the repaired dialogue TEXT, then feed the result through the
   * SAME canonical `buildDialogueAudioPlan` pure builder the dedicated
   * Dialogue & Audio workspace tab's `planDialogueAudio`/`repairAudio`
   * mutations already use — so the persisted plan is byte-shape-identical to
   * one produced by that tab (every other reader of
   * `vertical_drama_episodes.dialogueAudioPlan` elsewhere in the codebase,
   * e.g. the separate-TTS submission flow and the dialogue timeline builder
   * in `verticalDramaEpisodes.ts`, keeps working unchanged) — only the
   * dialogue TEXT differs. Voice casting (`speakerVoiceMap`) and the
   * narration/dialogue `mode`/`audioStrategy` axis are carried forward from
   * the CURRENT persisted plan when one exists, so a targeted text repair
   * never discards already-resolved voice continuity.
   *
   * Only called from `repairStage` — `runStage` has NO real-generation path
   * for `dialogue_audio_plan` (unlike `plan_episode_script`/
   * `storyboard_shotgrid`, whose `runStage` overrides this mirrors in
   * spirit): the dedicated Dialogue & Audio tab already owns the "fresh
   * plan" and "structured repair action" cases for real, client-driven
   * production use — this method exists specifically to make a free-text
   * quality-review/loop `instruction`, routed through the 15-stage
   * pipeline's `repairStage`, actually change the episode's dialogue
   * content instead of a no-op placeholder. Wiring real generation into
   * `runStage`'s fresh-generation path for this stage too is a documented,
   * separate follow-up — out of this fix's scope (this fix targets
   * `repairStage` specifically).
   */
  private async generateRealDialogueAudioPlan(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow,
    instruction: string
  ): Promise<{
    plan: VerticalDramaDialogueAudioPlan;
    creditsUsed: number;
    model: string;
  }> {
    const [seriesRow] = await db
      .select({ locale: verticalDramaSeries.locale })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);

    const characterRows = await db
      .select({
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
        role: verticalDramaCharacters.role,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId)
        )
      );

    const locale = normalizeVerticalDramaSeriesLocale(seriesRow?.locale);
    const durationSeconds = episode.targetDurationSeconds ?? 60;
    const currentPlan =
      (episode.dialogueAudioPlan as VerticalDramaDialogueAudioPlan | null) ??
      null;
    const storyboard =
      (episode.storyboard as Record<string, unknown> | null) ?? null;
    const storyboardShotsRaw = Array.isArray(storyboard?.shots)
      ? (storyboard!.shots as Array<Record<string, unknown>>)
      : [];

    const shots: ShotTimingInput[] = storyboardShotsRaw
      .map(s => ({
        shotNumber: Number(s.shot_number),
        shotDurationSeconds: Number(s.duration_seconds) || 0,
      }))
      .filter(s => Number.isFinite(s.shotNumber) && s.shotNumber > 0);

    const generated = await generateEpisodeDialogueAudioPlan({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      locale,
      durationSeconds,
      episodeScript: (episode.script as Record<string, unknown> | null) ?? {},
      audioStrategy: currentPlan?.audioStrategy,
      characters: characterRows.map(
        (c: { characterKey: string; name: string; role: string | null }) => ({
          characterId: c.characterKey,
          name: c.name,
          role: c.role,
        })
      ),
      shotClipTiming: shots.map(s => ({
        shotNumber: s.shotNumber,
        durationSeconds: s.shotDurationSeconds,
      })),
      repairContext: {
        currentPlan: currentPlan as unknown as Record<string, unknown> | null,
        instruction,
      },
    });

    // Map the skill's raw (validated, snake_case) `dialogue_lines[]` TEXT
    // content into `DialogueBeatInput[]` — the canonical builder's own input
    // shape — resolving each line's speaker NAME from the character roster
    // (the skill only emits `speaker_character_id`) and falling back to the
    // canonical speech-seconds estimator when the LLM omits/zeroes a line's
    // `estimated_seconds` (same estimator `verticalDramaScriptGeneration.ts`
    // falls back to — never a second speech-rate model).
    const characterNameById = new Map<string, string>(
      characterRows.map(
        (c: { characterKey: string; name: string }): [string, string] => [
          c.characterKey,
          c.name,
        ]
      )
    );
    const fallbackShotNumber = shots[0]?.shotNumber ?? 1;
    const beats: DialogueBeatInput[] = generated.plan.dialogue_lines.map(
      line => {
        const speakerCharacterId = line.speaker_character_id;
        const shotNumber = Number(line.shot_number);
        const estimatedSeconds =
          typeof line.estimated_seconds === "number" &&
          line.estimated_seconds > 0
            ? line.estimated_seconds
            : estimateVerticalDramaSpeechSeconds(line.dialogue_line);
        return {
          shotNumber:
            Number.isFinite(shotNumber) && shotNumber > 0
              ? shotNumber
              : fallbackShotNumber,
          clipNumber:
            typeof line.clip_number === "number" ? line.clip_number : undefined,
          speakerName:
            characterNameById.get(speakerCharacterId) ?? speakerCharacterId,
          speakerCharacterId,
          isNarration: false,
          text: line.dialogue_line,
          estimatedSeconds,
        };
      }
    );

    // Preserve series-scoped voice continuity across a text-only repair —
    // `buildSpeakerVoiceMap` re-derives `speakerVoiceMap` from these
    // bindings, so an already-cast voice is never silently dropped just
    // because this repair only touched dialogue wording.
    const currentVoiceMapEntries = currentPlan?.speakerVoiceMap?.entries ?? [];
    const voiceBindings: SeriesVoiceBinding[] | undefined =
      currentVoiceMapEntries.length > 0
        ? currentVoiceMapEntries.map(e => ({
            speakerName: e.speakerName,
            characterId: e.characterId,
            voiceProvider: e.voiceProvider,
            voiceModelId: e.voiceModelId,
            voiceId: e.voiceId,
            fallbackVoiceId: e.fallbackVoiceId,
            locked: e.locked,
          }))
        : undefined;

    const plan = buildDialogueAudioPlan({
      seriesId: String(owner.seriesId),
      episodeId: String(owner.episodeId),
      language: locale,
      mode: currentPlan?.mode ?? "dialogue",
      requestedStrategy: currentPlan?.audioStrategy,
      episodeTargetSeconds: durationSeconds,
      beats,
      shots,
      voiceBindings,
      subtitleSafeArea: currentPlan?.subtitleSafeArea,
      subShotsEnabled: currentPlan?.subShotsEnabled,
    });

    return { plan, creditsUsed: generated.creditsUsed, model: generated.model };
  }

  /**
   * Build the `generateStartFrameRenderPlan` params from the episode's own
   * `storyboard` jsonb column (populated by the `storyboard_shotgrid` stage)
   * and invoke it. Only called from `runStage` for `start_frame_render_plan`
   * when the mode is not dry_run/plan_only.
   */
  private async generateRealStartFramePlan(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow
  ): Promise<{
    plan: StartFrameRenderPlanProjection;
    creditsUsed: number;
    model: string;
    /** Effective provider/model image-prompt budget used by planning and QC. */
    imagePromptMaxChars: number;
    /** Series character identity rows (2026-07-07 fix) — returned alongside
     *  the plan so the caller can run the missing-character-identity QC
     *  check without a second DB query. */
    characters: VerticalDramaCharacterDescriptorSource[];
    /** Present only when a reference-mapping contradiction survived `generateStartFrameRenderPlan`'s one corrective retry — see `VdReferenceMappingWarning`'s doc comment. */
    referenceMappingWarnings?: VdReferenceMappingWarning[];
  }> {
    const storyboard =
      (episode.storyboard as Record<string, unknown> | null) ?? null;
    const shots: Array<Record<string, unknown>> = Array.isArray(
      storyboard?.shots
    )
      ? (storyboard!.shots as Array<Record<string, unknown>>)
      : (buildStoryboard(episode.targetDurationSeconds ?? 60)
          .shots as unknown as Array<Record<string, unknown>>);
    // Episode-level model selection (Vertical Drama Storyboard Completion
    // Plan, Phase 1.2): a user-chosen `selectedImageModelId` set via
    // `setEpisodeModelSelection` BEFORE this stage runs must be preserved,
    // not silently overwritten by whatever the LLM's own
    // `render_plan_summary.image_model` happens to say. Threaded through as
    // `selectedImageModelId` — `projectStartFramePlan` prefers this over the
    // LLM's claimed model (see that function's doc comment).
    const existingSelectedImageModelId = (
      episode.startFramePlan as { selectedImageModelId?: string } | null
    )?.selectedImageModelId;
    let imagePromptMaxChars = VD_IMAGE_PROMPT_MAX;
    if (existingSelectedImageModelId?.trim()) {
      const [imageModelRow] = await db
        .select({
          configJson: mediaModels.configJson,
          provider: mediaModels.provider,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, existingSelectedImageModelId.trim()))
        .limit(1);
      imagePromptMaxChars = resolveVdImagePromptBudgetForModel({
        modelId: existingSelectedImageModelId.trim(),
        configJson: imageModelRow?.configJson,
        provider: imageModelRow?.provider,
      });
    }

    // Gap-5 fix (recorded, 2026-07-22) — the episode's PRE-regen
    // `startFramePlan.frames`, keyed by shot number, so
    // `projectStartFramePlan` (invoked inside `generateStartFrameRenderPlan`
    // below) can carry over per-frame user/durable state a fresh LLM
    // projection has no way to re-derive on its own: `approvedMediaAssetId`,
    // `locationKey`, `angleGrid`/`angleGridAssetIds`, and
    // `productReferenceAssetIds`/`productRefsCustomized` (the latter pair
    // also restores this pipeline's OWN documented
    // `resolveFrameProductReferenceAssetIds` contract below — "auto-
    // resolution must never overwrite that choice on a plan regen" — which
    // needs `productRefsCustomized` to actually survive a regen to do its
    // job). Empty episode `startFramePlan`/no prior `frames` (first-ever
    // generation) naturally yields an empty map, so every frame's carry-over
    // is a no-op — byte-identical to today for a brand-new episode.
    const previousStartFrames = (
      episode.startFramePlan as {
        frames?: VerticalDramaStartFramePlanFrame[];
      } | null
    )?.frames;
    const previousFramesByShotNumber = new Map<
      number,
      VerticalDramaStartFramePlanFrame
    >((previousStartFrames ?? []).map(frame => [frame.shotNumber, frame]));
    const previousSceneVisualStates = (
      episode.startFramePlan as { sceneVisualStates?: unknown } | null
    )?.sceneVisualStates;
    const sceneShotGroups = buildSceneShotGroups({
      distinctLocations: storyboard?.distinct_locations,
      overridesByShotNumber: new Map(
        (previousStartFrames ?? [])
          .filter(
            frame =>
              typeof frame.locationKey === "string" && frame.locationKey.trim()
          )
          .map(frame => [frame.shotNumber, frame.locationKey])
      ),
    });

    // Image prompt language is stored independently on `startFramePlan`.
    // Legacy episodes fall back to the former shared video setting until
    // their image language is snapshotted or explicitly selected.
    const effectiveImagePromptLanguage = resolveEffectiveImagePromptLanguage({
      startFramePlan:
        episode.startFramePlan as VerticalDramaStartFramePlan | null,
      motionPromptPack: episode.motionPromptPack as {
        promptLanguage?: VerticalDramaPromptLanguage;
      } | null,
    });

    // Series-level target-audience region default (2026-07-06 quality
    // upgrade) — read the series' `bible.targetAudienceRegion` so every
    // rendered start-frame person defaults to the series' configured
    // region/ethnicity look unless a character's own description overrides it.
    const [seriesRow] = await db
      .select({
        bible: verticalDramaSeries.bible,
        locale: verticalDramaSeries.locale,
      })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);
    const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
    const targetAudienceRegion = readTargetAudienceRegionFromBible(bible);

    // Part B2 (planning/`polished-toasting-gadget.md`) — compact episode
    // scene-setting plan context, resolved from the ALREADY-loaded `bible`
    // above (no extra DB round trip). `undefined` when the active breakdown
    // has no matching item for this episode yet.
    const { getActiveBreakdown, readItemCliffhangerLine, readItemShotDrafts } =
      await import("./verticalDramaStoryBible");
    const episodePlanItem = getActiveBreakdown(bible).find(
      item => item.episodeNumber === episode.episodeNumber
    );
    const episodePlanContext = episodePlanItem
      ? formatStoryScriptEpisodePlanContext(
          resolveStoryScriptLangFromLocale(seriesRow?.locale),
          {
            episodeNumber: episodePlanItem.episodeNumber,
            workingTitle: episodePlanItem.workingTitle,
            logline: episodePlanItem.logline,
            keyBeats: episodePlanItem.keyBeats,
            cliffhangerLine: readItemCliffhangerLine(episodePlanItem),
          }
        )
      : undefined;
    const episodePlanShotDrafts: VdDeepDraftShotDraft[] = episodePlanItem
      ? (readItemShotDrafts(episodePlanItem) ?? [])
      : [];
    const canonicalShotSummaryByShotNumber = new Map<number, string>(
      episodePlanShotDrafts
        .filter(
          (shot): shot is VdDeepDraftShotDraft =>
            typeof shot.summary === "string" && shot.summary.trim().length > 0
        )
        .map(shot => [shot.shot_number, shot.summary.trim()] as const)
    );
    // Speaker-order composition fix (start-frame character positioning) —
    // this shot's dialogue speakers, in delivery order, deduped to first
    // appearance. Read from the SAME deep-drafted `shotDrafts[].dialogue_lines`
    // that `canonicalShotSummaryByShotNumber` above already reads (no extra
    // DB round trip) — this is the Overview page's canonical dialogue source
    // AND the only reliable dialogue source available at this pipeline stage:
    // `start_frame_render_plan` runs BEFORE `dialogue_audio_plan`/
    // `video_motion_prompt_pack` are generated, so those later-stage sources
    // (the ones `resolveShotDialogueLines()` in `verticalDramaEpisodes.ts`
    // also tries) are never populated yet at this point in the pipeline.
    // Empty for any shot with no drafted `dialogue_lines` (legacy episode
    // with no deep draft, an in-progress/never-drafted shot, or an explicit
    // `silence_intent` shot) — `speakingOrderByShotNumber.get(...)` then
    // returns `undefined` and `buildStartFrameRenderPlanUserPrompt` omits the
    // `speaking_order:` line entirely for that shot (byte-identical
    // regression guard).
    const speakingOrderByShotNumber = new Map<number, string[]>(
      episodePlanShotDrafts
        .map(shot => {
          const order = Array.from(
            new Set(
              shot.dialogue_lines
                .map(line => line.speaker?.trim())
                .filter((speaker): speaker is string => Boolean(speaker))
            )
          );
          return [shot.shot_number, order] as const;
        })
        .filter(([, order]) => order.length > 0)
    );

    // Character identity descriptors (2026-07-07 non-human-character-
    // vanishing fix) — `name`/`role` + the stored `data.description` (e.g.
    // เจ้าเกลือ's "แมวขาวปุยตาสีทะเล..." confirming it's a cat, not a person),
    // fed into `buildCharacterIdentityMapBlock` so the planning LLM knows
    // each required character's real identity instead of a bare
    // `characterKey`. See `@shared/verticalDramaSeries/characterIdentityMap.ts`.
    const characterIdentityRows = await db
      .select({
        characterKey: verticalDramaCharacters.characterKey,
        name: verticalDramaCharacters.name,
        role: verticalDramaCharacters.role,
        data: verticalDramaCharacters.data,
      })
      .from(verticalDramaCharacters)
      .where(
        and(
          eq(verticalDramaCharacters.tenantId, owner.tenantId),
          eq(verticalDramaCharacters.seriesId, owner.seriesId)
        )
      );
    const characterIdentitySources: VerticalDramaCharacterDescriptorSource[] =
      characterIdentityRows.map(
        (row: (typeof characterIdentityRows)[number]) => ({
          characterKey: row.characterKey,
          name: row.name,
          role: row.role,
          description:
            typeof (row.data as Record<string, unknown> | null)?.description ===
            "string"
              ? ((row.data as Record<string, unknown>).description as string)
              : undefined,
        })
      );

    // Phase 1 of `planning/polished-toasting-gadget.md` (location visual
    // bible) — build a shot-number -> location lookup from the storyboard's
    // own `distinct_locations[]` (server-validated for full 1-9 coverage by
    // `validateStagePayload`'s `distinctLocationsShotCoverage` check),
    // so each start-frame request below can finally be grounded in a real
    // location fact — this mapping previously read `shotNumber`,
    // `description`, `cameraSetup`, `characterIds`, `durationSeconds` from
    // each shot but never `location` at all, leaving the start-frame skill
    // with no location anchor whatsoever. Empty for any storyboard with no
    // `distinct_locations` data (flag off, or a storyboard generated before
    // this feature existed) — every shot's `location` field below is then
    // omitted entirely, byte-identical to before this change.
    const distinctLocationGroups = Array.isArray(storyboard?.distinct_locations)
      ? (storyboard!.distinct_locations as Array<Record<string, unknown>>)
      : [];
    // Which of this series' locations already have an APPROVED reference image
    // (Phase 2/D fix, 2026-07-13) — resolved once from the durable roster so
    // the per-shot `hasReferenceImage` flag below reflects reality instead of
    // the Phase-1 hardcoded `false`. `listRows` sets `primaryReferenceUrl`
    // only when an approved establishing_plate exists (honoring the explicit
    // primary marker, Phase C), so its presence is the exact signal the
    // single-shot path (`resolveShotLocationReferenceEntry`) already uses.
    // Best-effort: a roster read failure must never fail storyboard→start-
    // frame planning, so it degrades to "no images known" (the prior behavior).
    let locationKeysWithApprovedImage = new Set<string>();
    const locationImageUrlsByKey = new Map<string, string>();
    try {
      const rosterRows = await verticalDramaLocationStockService.listRows({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
      });
      locationKeysWithApprovedImage = new Set(
        rosterRows
          .filter(r => Boolean(r.primaryReferenceUrl))
          .map(r => r.locationKey)
      );
      for (const row of rosterRows) {
        if (row.primaryReferenceUrl)
          locationImageUrlsByKey.set(row.locationKey, row.primaryReferenceUrl);
      }
    } catch {
      // Keep the empty set — the location text fact still renders (name +
      // description); only the "environment lock applies" suffix is omitted.
    }
    const locationByShotNumber = new Map<
      number,
      {
        key?: string;
        name: string;
        description: string;
        hasReferenceImage: boolean;
      }
    >();
    for (const group of distinctLocationGroups) {
      const name =
        typeof group.location_name === "string"
          ? group.location_name
          : undefined;
      const description =
        typeof group.description === "string" ? group.description : undefined;
      if (!name || !description) continue;
      const locationKey =
        typeof group.location_key === "string" ? group.location_key : undefined;
      const hasReferenceImage = locationKey
        ? locationKeysWithApprovedImage.has(locationKey)
        : false;
      const shotNumbers = Array.isArray(group.shot_numbers)
        ? group.shot_numbers
        : [];
      for (const raw of shotNumbers) {
        const n = Number(raw);
        if (Number.isInteger(n))
          locationByShotNumber.set(n, {
            key: locationKey,
            name,
            description,
            hasReferenceImage,
          });
      }
    }

    const sceneContinuityFlags =
      sceneShotGroups.length > 0
        ? await import("./tenantFeatureFlagService")
            .then(({ getTenantFeatureFlags }) =>
              getTenantFeatureFlags(owner.tenantId)
            )
            .catch(() => undefined)
        : undefined;
    const sceneContinuityEnabled =
      sceneContinuityFlags?.verticalDramaSceneContinuity === true;
    const sceneContinuitySeriesLook = sceneContinuityEnabled
      ? resolveEffectiveSeriesVisualIdentity({
          bible,
          presetMixEnabled:
            sceneContinuityFlags?.verticalDramaSeriesPresetMixV2 === true,
          lookLockEnabled:
            sceneContinuityFlags?.verticalDramaSeriesLookLock === true,
        })
      : undefined;
    const sceneContinuityResolution = sceneContinuityEnabled
      ? await resolveSceneContinuityLocks({
          enabled: true,
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
          episodeId: owner.episodeId,
          storyboard,
          startFramePlan:
            episode.startFramePlan as VerticalDramaStartFramePlan | null,
          shotNumbers: shots
            .map(s => Number(s.shotNumber ?? s.shot_number))
            .filter(Number.isInteger),
          authorIfMissing: true,
          canonicalShotSummaryByShotNumber,
          locationImageUrlByLocationKey: locationImageUrlsByKey,
          seriesLook: sceneContinuitySeriesLook,
          lang: resolveStoryScriptLangFromLocale(seriesRow?.locale),
        })
      : undefined;
    if (sceneContinuityResolution?.diagnostics.authoringFailures.length) {
      throw new Error(
        `Scene continuity planning failed for ${sceneContinuityResolution.diagnostics.authoringFailures.map(f => f.locationKey).join(", ")}; retry the start-frame plan`
      );
    }
    const sceneVisualStatesForProjection = {
      ...(previousSceneVisualStates &&
      typeof previousSceneVisualStates === "object" &&
      !Array.isArray(previousSceneVisualStates)
        ? (previousSceneVisualStates as Record<string, unknown>)
        : {}),
      ...(sceneContinuityResolution?.newlyAuthoredByLocationKey ?? {}),
    };

    const generated = await generateStartFrameRenderPlan({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeTitle: episode.title ?? `Episode ${episode.episodeNumber}`,
      durationSeconds: episode.targetDurationSeconds ?? 60,
      selectedImageModelId: existingSelectedImageModelId,
      imagePromptMaxChars,
      targetAudienceRegion,
      promptLanguage: effectiveImagePromptLanguage,
      episodePlanContext,
      previousFramesByShotNumber,
      ...(previousSceneVisualStates !== undefined ||
      Object.keys(sceneVisualStatesForProjection).length > 0
        ? {
            sceneVisualStatesCarryOver: {
              previous: sceneVisualStatesForProjection,
              sceneShotGroups,
            },
          }
        : {}),
      characters: characterIdentitySources,
      storyboardShots: shots.map(s => {
        // The real `storyboard_shotgrid` LLM output uses snake_case fields
        // (`shot_number`, `visual_description`, `camera` object, `characters`
        // / `required_character_refs`) — only the dry-run placeholder from
        // `buildStoryboard()` above uses the camelCase shape this mapping
        // originally assumed (`shotNumber`, `cameraSetup`, `characterIds`).
        // Reading only the camelCase names meant every REAL episode's shots
        // resolved to an empty character list here, so the next stage's
        // `requiredCharacterRefs` was always `[]` regardless of what the
        // storyboard actually contained. Read both shapes, preferring the
        // real one; `required_character_refs` is the identity-lock key list
        // (see the same preference in `VerticalDramaStoryboardPanel.tsx`).
        const camera = s.camera as Record<string, unknown> | undefined;
        const cameraSetup =
          typeof s.cameraSetup === "string" && s.cameraSetup
            ? s.cameraSetup
            : [camera?.shot_type, camera?.angle, camera?.movement]
                .filter(Boolean)
                .join(", ");
        const shotComposition = normalizeVerticalDramaShotComposition({
          ...(camera ?? {}),
          composition: camera?.composition ?? s.composition,
          body_language: s.body_language,
          gaze_direction: s.gaze_direction,
          facial_expression: s.facial_expression,
        });
        const storedCharacterIds =
          Array.isArray(s.required_character_refs) &&
          s.required_character_refs.length
            ? (s.required_character_refs as string[])
            : Array.isArray(s.characters) && s.characters.length
              ? (s.characters as string[])
              : Array.isArray(s.characterIds)
                ? (s.characterIds as string[])
                : [];
        const shotNumber = Number(s.shotNumber ?? s.shot_number ?? 0);
        const canonicalShotSummary =
          canonicalShotSummaryByShotNumber.get(shotNumber);
        const storyboardScreenCallerCharacterIds = Array.isArray(
          s.screen_caller_refs
        )
          ? (s.screen_caller_refs as string[])
          : [];
        const previousFrame = previousFramesByShotNumber.get(shotNumber);
        const characterRefsCustomized =
          previousFrame?.characterRefsCustomized === true;
        // A user-edited role assignment is the durable source of truth. Do
        // not re-run synopsis analysis or let a fresh storyboard LLM response
        // replace it during a start-frame-plan regeneration.
        const characterIds = characterRefsCustomized
          ? [...(previousFrame?.requiredCharacterRefs ?? [])]
          : storedCharacterIds;
        const screenCallerCharacterIds = characterRefsCustomized
          ? [...(previousFrame?.screenCallerCharacterRefs ?? [])]
          : storyboardScreenCallerCharacterIds;
        const supportingPresenceCustomized =
          previousFrame?.supportingPresenceCustomized === true;
        const supportingPresence = supportingPresenceCustomized
          ? normalizeVerticalDramaSupportingPresence(
              previousFrame?.supportingPresence ?? [],
              { source: "manual", idPrefix: `shot-${shotNumber}-supporting` }
            )
          : resolveVerticalDramaSupportingPresenceForShot(
              s.supporting_presence,
              s,
              { idPrefix: `shot-${shotNumber}-supporting` }
            );
        const barrierDialogue = normalizeVerticalDramaBarrierDialogue(
          characterRefsCustomized
            ? previousFrame?.barrierDialogue
            : (s as Record<string, unknown>).barrier_dialogue
        );
        const shotRecord = s as Record<string, unknown>;
        const declaredDualRaw =
          typeof shotRecord.dual_view === "object" &&
          shotRecord.dual_view !== null &&
          !Array.isArray(shotRecord.dual_view)
            ? (shotRecord.dual_view as Record<string, unknown>)
            : undefined;
        const knownDualViewCharacterRefs = new Set([
          ...characterIds,
          ...screenCallerCharacterIds,
          ...(speakingOrderByShotNumber.get(shotNumber) ?? []),
        ]);
        const declaredPrimaryRefs = Array.isArray(
          declaredDualRaw?.primary_character_refs
        )
          ? declaredDualRaw.primary_character_refs
              .map(String)
              .filter(key => knownDualViewCharacterRefs.has(key))
          : [];
        const declaredSecondaryRefs = Array.isArray(
          declaredDualRaw?.secondary_character_refs
        )
          ? declaredDualRaw.secondary_character_refs
              .map(String)
              .filter(
                key =>
                  knownDualViewCharacterRefs.has(key) &&
                  !declaredPrimaryRefs.includes(key)
              )
          : [];
        const declaredDualView =
          shotRecord.view_mode === "dual" &&
          declaredDualRaw &&
          declaredPrimaryRefs.length > 0 &&
          declaredSecondaryRefs.length > 0
            ? normalizeVerticalDramaBarrierMultiView({
                enabled: true,
                scenario: declaredDualRaw.scenario,
                activationSource: "auto",
                detection: {
                  confidence: declaredDualRaw.confidence,
                  reasonCodes: declaredDualRaw.reason_codes,
                },
                startView: {
                  side: "inside",
                  characterRefs: declaredPrimaryRefs,
                  locationKey: declaredDualRaw.primary_location_key,
                },
                referenceView: {
                  side: "outside",
                  characterRefs: declaredSecondaryRefs,
                  locationKey: declaredDualRaw.secondary_location_key,
                },
                dialogueSideMap: Object.fromEntries([
                  ...declaredPrimaryRefs.map(key => [key, "inside"]),
                  ...declaredSecondaryRefs.map(key => [key, "outside"]),
                ]),
                status: "configured",
              })
            : undefined;
        const locationGroup = locationByShotNumber.get(shotNumber);
        const detectedDualView = detectVerticalDramaDualViewIntent({
          text: [
            canonicalShotSummary,
            s.description,
            s.visual_description,
            s.narrative_purpose,
          ]
            .filter(value => typeof value === "string")
            .join(" "),
          sceneCharacterRefs: characterIds,
          screenCallerCharacterRefs: screenCallerCharacterIds,
          dialogueCharacterRefs: speakingOrderByShotNumber.get(shotNumber),
          primaryLocationKey: locationGroup?.key,
          locations: distinctLocationGroups.flatMap(group => {
            const locationKey =
              typeof group.location_key === "string"
                ? group.location_key
                : undefined;
            if (!locationKey) return [];
            return [
              {
                locationKey,
                ...(typeof group.location_name === "string"
                  ? { name: group.location_name }
                  : {}),
              },
            ];
          }),
        });
        const barrierMultiView =
          normalizeVerticalDramaBarrierMultiView(
            characterRefsCustomized
              ? previousFrame?.barrierMultiView
              : shotRecord.barrier_multi_view
          ) ??
          (!characterRefsCustomized
            ? (declaredDualView ?? detectedDualView)
            : undefined) ??
          (barrierDialogue
            ? projectLegacyBarrierDialogueToMultiView(barrierDialogue)
            : undefined);
        const effectiveCharacterIds = barrierMultiView
          ? [...barrierMultiView.startView.characterRefs]
          : barrierDialogue
            ? [...barrierDialogue.visibleCharacterRefs]
            : characterIds;
        const effectiveScreenCallerCharacterIds = barrierMultiView
          ? []
          : screenCallerCharacterIds;
        // Location fact for this shot (Phase 1 text grounding + Phase 2/D
        // reference-image awareness, 2026-07-13). `hasReferenceImage` now
        // reflects the real roster (`locationKeysWithApprovedImage` above)
        // instead of the Phase-1 hardcoded `false`, so a shot whose location
        // already has an approved reference image gets the "[environment lock
        // applies]" prompt suffix — matching what the single-shot
        // `generateShotStartFramePrompt` path already does, and consistent
        // with `generateStartFrameImage` actually attaching that image at
        // render time. The `location` key is omitted entirely (not merely
        // `undefined` in a spread) when no `distinct_locations` group covers
        // this shot, so the downstream prompt builder's byte-identical guard
        // sees no shape difference for that shot.
        // `locationGroup` is resolved above because Dual View detection also
        // needs the primary location key and the episode location roster.
        // Speaker-order composition fix — see `speakingOrderByShotNumber`'s
        // doc comment above. Omitted entirely (not merely `undefined` in a
        // spread) when this shot has no resolved speaking order, same
        // "omit the key" convention as `location` immediately above.
        const speakingOrder = speakingOrderByShotNumber.get(shotNumber);
        return {
          shotNumber,
          description: String(s.description ?? s.visual_description ?? ""),
          cameraSetup,
          characterIds: effectiveCharacterIds,
          ...(characterRefsCustomized ||
          (barrierMultiView && barrierMultiView.activationSource !== "auto")
            ? { characterRefsCustomized: true }
            : {}),
          ...(effectiveScreenCallerCharacterIds.length > 0 && !barrierDialogue
            ? { screenCallerCharacterRefs: effectiveScreenCallerCharacterIds }
            : {}),
          ...(barrierDialogue ? { barrierDialogue } : {}),
          ...(barrierMultiView ? { barrierMultiView } : {}),
          ...(supportingPresence.length > 0 || supportingPresenceCustomized
            ? { supportingPresence }
            : {}),
          ...(supportingPresenceCustomized
            ? { supportingPresenceCustomized: true }
            : {}),
          durationSeconds: Number(s.durationSeconds ?? s.duration_seconds ?? 0),
          ...(canonicalShotSummary ? { canonicalShotSummary } : {}),
          ...(locationGroup
            ? {
                location: {
                  name: locationGroup.name,
                  description: locationGroup.description,
                  hasReferenceImage: locationGroup.hasReferenceImage,
                },
              }
            : {}),
          ...(speakingOrder ? { speakingOrder } : {}),
          ...((effectiveCharacterIds.length >= 2 ||
            (speakingOrder?.length ?? 0) >= 2) &&
          !barrierDialogue &&
          !barrierMultiView
            ? { videoFaceVisibilityRequired: true }
            : {}),
          ...(sceneContinuityResolution?.blockByShotNumber.has(shotNumber)
            ? {
                sceneContinuityLockBlock:
                  sceneContinuityResolution.blockByShotNumber.get(shotNumber),
              }
            : {}),
        };
      }),
    });
    if (previousSceneVisualStates !== undefined) {
      try {
        const previousRecord =
          typeof previousSceneVisualStates === "object" &&
          previousSceneVisualStates !== null &&
          !Array.isArray(previousSceneVisualStates)
            ? (previousSceneVisualStates as Record<string, unknown>)
            : {};
        const nextStates = generated.plan.sceneVisualStates ?? {};
        const dropped = Object.keys(previousRecord)
          .filter(key => !(key in nextStates))
          .sort();
        const newlyStale = Object.entries(nextStates)
          .filter(([key, state]) => {
            const prior = previousRecord[key];
            return (
              state.stale === true &&
              !(
                typeof prior === "object" &&
                prior !== null &&
                (prior as { stale?: unknown }).stale === true
              )
            );
          })
          .map(([key]) => key)
          .sort();
        if (dropped.length > 0 || newlyStale.length > 0) {
          debugError(
            "vd_scene_visual_state_carryover",
            `Scene visual state carry-over changed for episode #${owner.episodeId}: dropped=[${dropped.join(",")}] newlyStale=[${newlyStale.join(",")}]`
          );
        }
      } catch (carryoverLogError) {
        debugError(
          "vd_scene_visual_state_carryover",
          `Scene visual state carry-over logging failed for episode #${owner.episodeId}; generation remains successful`,
          carryoverLogError
        );
      }
    }
    return {
      ...generated,
      characters: characterIdentitySources,
      imagePromptMaxChars,
    };
  }

  /**
   * Build the `generateVideoMotionPromptPack` params from the episode's own
   * `storyboard` jsonb column and invoke it. Only called from `runStage` for
   * `video_motion_prompt_pack` when the mode is not dry_run/plan_only.
   *
   * `retentionHooksEnabled` (`planning/vertical-drama-retention-hooks/
   * plan.md` W7, tenant flag `verticalDramaRetentionHooks`, added
   * 2026-07-11) — same "router resolves the tenant flag, the pipeline stays
   * flag-agnostic beyond this bag" convention as every other
   * `RunStageOptions` field; threaded straight through to
   * `generateVideoMotionPromptPack`'s own `retentionHooksEnabled` param,
   * which self-derives `is_opening_shot`/`is_retention_ending_shot` from the
   * `storyboardShots[]` already built below (min/max `shotNumber`) — no
   * extra shot-count math needed here. Defaults to `false`, so every
   * existing caller/test is byte-identical.
   */
  private async generateRealMotionPromptPack(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow,
    retentionHooksEnabled: boolean = false,
    motionContractsEnabled: boolean = false
  ): Promise<{
    pack: VideoMotionPromptPackProjection;
    creditsUsed: number;
    model: string;
  }> {
    const storyboard =
      (episode.storyboard as Record<string, unknown> | null) ?? null;
    const shots: Array<Record<string, unknown>> = Array.isArray(
      storyboard?.shots
    )
      ? (storyboard!.shots as Array<Record<string, unknown>>)
      : (buildStoryboard(episode.targetDurationSeconds ?? 60)
          .shots as unknown as Array<Record<string, unknown>>);
    const startFramePlan =
      (episode.startFramePlan as VerticalDramaStartFramePlan | null) ?? null;
    const startFrameByShotNumber = new Map(
      (startFramePlan?.frames ?? []).map(frame => [frame.shotNumber, frame])
    );
    const dialogueLinesByShotNumber = new Map<
      number,
      Array<{ line: string; speakerName?: string; characterKey?: string }>
    >();
    const dialoguePlan =
      (episode.dialogueAudioPlan as VerticalDramaDialogueAudioPlan | null) ??
      null;
    for (const line of dialoguePlan?.dialogueLines ?? []) {
      const shotNumber = Number(line.shotNumber);
      if (!Number.isFinite(shotNumber) || shotNumber <= 0 || !line.text.trim())
        continue;
      const shotLines = dialogueLinesByShotNumber.get(shotNumber) ?? [];
      shotLines.push({
        line: line.text,
        speakerName: line.speakerName || undefined,
        characterKey: line.speakerCharacterId,
      });
      dialogueLinesByShotNumber.set(shotNumber, shotLines);
    }

    // Episode-level model selection (Vertical Drama Storyboard Completion
    // Plan, Phase 1.2): a user-chosen `selectedVideoModelId` set via
    // `setEpisodeModelSelection` BEFORE this stage runs must be preserved,
    // not silently overwritten by whatever the LLM's own
    // `video_plan_summary.video_model` happens to say. Threaded through as
    // `selectedVideoModelId` — `projectMotionPromptPack` prefers this over
    // the LLM's claimed model (see that function's doc comment).
    const existingSelectedVideoModelId = (
      episode.motionPromptPack as { selectedVideoModelId?: string } | null
    )?.selectedVideoModelId;

    // Episode-level video-prompt language plan (episode-level language
    // options wave): a user-chosen `promptLanguage`/`dialogueLanguage` set
    // via `setEpisodeVideoPromptLanguage` BEFORE this stage runs must be
    // preserved across a real (re)generation — same "honor pre-existing
    // selection" rationale as `existingSelectedVideoModelId` above.
    const existingLanguagePlan = episode.motionPromptPack as {
      promptLanguage?: VerticalDramaPromptLanguage;
      dialogueLanguage?: VerticalDramaDialogueLanguage;
      thaiAccent?: VerticalDramaThaiAccent;
    } | null;

    // Part B3 (planning/`polished-toasting-gadget.md`) — compact episode
    // scene-setting plan context. No pre-existing bible read in this
    // function (unlike `generateRealStoryboard`/`generateRealStartFramePlan`
    // above), so this is a minimal, dedicated `bible`-only read — mirrors
    // `resolveEpisodeDraftHydration`'s doc comment for why the
    // `verticalDramaStoryBible.ts` VALUE import stays dynamic.
    const [episodePlanSeriesRow] = await db
      .select({
        bible: verticalDramaSeries.bible,
        locale: verticalDramaSeries.locale,
      })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);
    const { getActiveBreakdown, readItemCliffhangerLine } =
      await import("./verticalDramaStoryBible");
    const episodePlanItem = getActiveBreakdown(
      (episodePlanSeriesRow?.bible as Record<string, unknown> | null) ?? null
    ).find(item => item.episodeNumber === episode.episodeNumber);
    const episodePlanContext = episodePlanItem
      ? formatStoryScriptEpisodePlanContext(
          resolveStoryScriptLangFromLocale(episodePlanSeriesRow?.locale),
          {
            episodeNumber: episodePlanItem.episodeNumber,
            workingTitle: episodePlanItem.workingTitle,
            logline: episodePlanItem.logline,
            keyBeats: episodePlanItem.keyBeats,
            cliffhangerLine: readItemCliffhangerLine(episodePlanItem),
          }
        )
      : undefined;

    // Pack-parity follow-up (`planning/vd-video-prompt-model-family-quality/
    // plan.md`, "pack bulk generator — out of scope" item, closed
    // 2026-07-22) — resolve the full video-model catalog row, the tenant's
    // native-audio preference, and any approved start-frame images so
    // `generateVideoMotionPromptPack` can build the SAME `TARGET VIDEO
    // MODEL` fact block, native-audio fact, and best-effort vision call the
    // per-shot generator already has. All three reads run AFTER the
    // `episodePlanSeriesRow` select above and are individually best-effort
    // (never throw) — a missing/unresolvable model row, flag lookup
    // failure, or absent start-frame plan must never break this stage;
    // `generateVideoMotionPromptPack` itself already degrades gracefully
    // when any of these are absent (family "other", no native-audio fact,
    // text-only call).

    // Full model catalog row — mirrors
    // `applySpeakerSwitchSubShotsToRealMotionPromptPack`'s own catalog-
    // lookup pattern above (dynamic import: this file's dependency
    // direction forbids a static import of the router's equivalent
    // `resolveEpisodeVideoModel` helper).
    const selectedVideoModel = await (async () => {
      try {
        const [{ getModelsByTypeAsync }, { DEFAULT_MODELS }] =
          await Promise.all([
            import("./modelRegistry"),
            import("./mediaGenerationService"),
          ]);
        const models = await getModelsByTypeAsync("video");
        const requestedModelId = existingSelectedVideoModelId?.trim();
        return (
          (requestedModelId &&
            models.find(
              m => m.id === requestedModelId && m.isEnabled !== false
            )) ||
          models.find(m => m.id === DEFAULT_MODELS.video)
        );
      } catch {
        return undefined;
      }
    })();

    // Native audio direction — same flag key + "rollout gate AND persisted
    // preference" resolution as
    // `applySpeakerSwitchSubShotsToRealMotionPromptPack`'s identical block
    // above (no per-call UI toggle exists for this whole-episode batch
    // path).
    const priorPersistedPack = episode.motionPromptPack as {
      nativeAudioEnabled?: boolean;
    } | null;
    const nativeAudioEnabled = await (async () => {
      try {
        const { getTenantFeatureFlags } =
          await import("./tenantFeatureFlagService");
        const flags = await getTenantFeatureFlags(owner.tenantId).catch(
          () => null
        );
        return (
          flags?.verticalDramaSeriesNativeAudioPrompts === true &&
          priorPersistedPack?.nativeAudioEnabled === true
        );
      } catch {
        return false;
      }
    })();

    // Optional start-frame vision — only shots with an APPROVED start-frame
    // render (ground truth, same "approved asset over free-text claim"
    // convention as `syncStartFramesOntoMotionPromptClips`); frames with no
    // approved asset yet are simply skipped, never block the stage.
    const startFrameImages = await (async () => {
      try {
        const approvedFrames = (startFramePlan?.frames ?? []).filter(
          f =>
            typeof f.approvedMediaAssetId === "string" &&
            f.approvedMediaAssetId.trim().length > 0
        );
        if (approvedFrames.length === 0) return undefined;
        const assetIds = approvedFrames
          .flatMap(f => {
            const dualView = normalizeVerticalDramaBarrierMultiView(
              f.barrierMultiView
            );
            if (dualView && !dualView.referenceView.referenceFrameAssetId) {
              throw new Error(
                `DUAL_VIEW_IMAGE_PAIR_REQUIRED: Shot ${f.shotNumber} is missing its Reference frame`
              );
            }
            return [
              Number(f.approvedMediaAssetId),
              ...(dualView?.referenceView.referenceFrameAssetId
                ? [Number(dualView.referenceView.referenceFrameAssetId)]
                : []),
            ];
          })
          .filter(id => Number.isInteger(id) && id > 0);
        if (assetIds.length === 0) return undefined;
        // Explicitly typed (`db.select(...)` is loosely typed `any` in this
        // codebase's `db` wrapper, see `server/db.ts` — matches
        // `applySpeakerSwitchSubShotsToRealMotionPromptPack`'s own
        // `(typeof characterRows)[number]` workaround for the identical
        // looseness, just spelled out inline here since there is no
        // pre-existing local to reuse `typeof` from).
        const assetRows: Array<{ id: number; url: string | null }> = await db
          .select({ id: mediaAssets.id, url: mediaAssets.originalUrl })
          .from(mediaAssets)
          .where(
            and(
              inArray(mediaAssets.id, assetIds),
              eq(mediaAssets.tenantId, owner.tenantId),
              eq(mediaAssets.userId, owner.userId)
            )
          );
        const urlByAssetId = new Map<number, string>();
        for (const row of assetRows) {
          if (row.url) urlByAssetId.set(row.id, row.url);
        }
        const resolved = (
          await Promise.all(
            approvedFrames.map(async f => {
              const assetId = Number(f.approvedMediaAssetId);
              const url = Number.isInteger(assetId)
                ? urlByAssetId.get(assetId)
                : undefined;
              const dualView = normalizeVerticalDramaBarrierMultiView(
                f.barrierMultiView
              );
              if (!url) {
                if (dualView) {
                  throw new Error(
                    `DUAL_VIEW_IMAGE_PAIR_REQUIRED: Shot ${f.shotNumber} Start frame cannot be resolved`
                  );
                }
                return null;
              }
              const dualViewReferenceAssetId = Number(
                dualView?.referenceView.referenceFrameAssetId
              );
              const dualViewReferenceUrl = Number.isInteger(
                dualViewReferenceAssetId
              )
                ? urlByAssetId.get(dualViewReferenceAssetId)
                : undefined;
              if (dualView && !dualViewReferenceUrl) {
                throw new Error(
                  `DUAL_VIEW_IMAGE_PAIR_REQUIRED: Shot ${f.shotNumber} Reference frame cannot be resolved`
                );
              }
              const characterReferenceImages =
                await resolvePipelineCharacterReferenceImages(
                  owner,
                  f.requiredCharacterRefs ?? []
                );
              return {
                shotNumber: f.shotNumber,
                url,
                ...(dualViewReferenceUrl
                  ? {
                      dualViewReferenceImage: {
                        url: dualViewReferenceUrl,
                        name:
                          dualView?.referenceView.locationKey ||
                          "secondary location",
                      },
                    }
                  : {}),
                characterReferenceImages: characterReferenceImages.length
                  ? characterReferenceImages
                  : undefined,
              };
            })
          )
        ).filter(
          (
            v
          ): v is {
            shotNumber: number;
            url: string;
            dualViewReferenceImage?: { url: string; name: string };
            characterReferenceImages:
              | ShotVideoPromptCharacterReferenceImage[]
              | undefined;
          } => v !== null
        );
        return resolved.length > 0 ? resolved : undefined;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("DUAL_VIEW_IMAGE_PAIR_REQUIRED:")
        ) {
          throw error;
        }
        return undefined;
      }
    })();

    return generateVideoMotionPromptPack({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeTitle: episode.title ?? `Episode ${episode.episodeNumber}`,
      durationSeconds: episode.targetDurationSeconds ?? 60,
      durationProfileId:
        episode.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
      selectedVideoModelId: existingSelectedVideoModelId,
      selectedVideoModel,
      nativeAudioEnabled,
      startFrameImages,
      promptLanguage: existingLanguagePlan?.promptLanguage,
      dialogueLanguage: existingLanguagePlan?.dialogueLanguage,
      thaiAccent: existingLanguagePlan?.thaiAccent,
      episodePlanContext,
      retentionHooksEnabled,
      motionContractsEnabled,
      storyboardShots: shots.map(s => {
        const shotNumber = Number(s.shotNumber ?? s.shot_number ?? 0);
        const startFrame = startFrameByShotNumber.get(shotNumber);
        const characterKeys = startFrame?.requiredCharacterRefs ?? [];
        const dialogueLines = dialogueLinesByShotNumber.get(shotNumber);
        return {
          shotNumber,
          description: String(s.description ?? s.visual_description ?? ""),
          durationSeconds: Number(s.durationSeconds ?? s.duration_seconds ?? 0),
          characterKeys: characterKeys.length ? characterKeys : undefined,
          dialogueLines: dialogueLines?.length ? dialogueLines : undefined,
          dialogueExcerpt:
            typeof s.dialogue_excerpt === "string" && s.dialogue_excerpt
              ? s.dialogue_excerpt
              : typeof s.subtitle_text === "string"
                ? s.subtitle_text
                : undefined,
        };
      }),
    });
  }

  /**
   * Idempotently create (or reopen) the Storyboard Review project for this
   * episode via the existing, tested `createVerticalDramaStoryboardHandoff`
   * service — same idempotency-key + reopen-on-unchanged-plan behavior used
   * by the `createHandoff` tRPC mutation. This is a pure DB operation (no
   * paid provider call); `subShotsEnabled` is threaded through from the same
   * tenant `verticalDramaSeriesSubShots` flag value already resolved for this
   * run (`subShotFlagOn`), so it matches the sub-shot expansion the episode
   * was actually planned with. Only called from `runStage` for
   * `create_storyboard_review_project` when the mode is not
   * dry_run/plan_only.
   */
  private async createRealStoryboardReviewProject(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow,
    subShotsEnabled: boolean
  ): Promise<VerticalDramaHandoffResult> {
    return createVerticalDramaStoryboardHandoff({
      db: db.instance,
      userId: owner.userId,
      tenantId: owner.tenantId,
      episode,
      subShotsEnabled,
    });
  }

  /**
   * Write the stage's approval checkpoint. Manual approval was removed from
   * the product workflow (2026-07-07) — checkpoints are inserted already
   * `approved` (never `pending`) so they exist purely as audit records and
   * never accumulate as a stale "pending approval" badge on the series list.
   * Kept as its own row (rather than skipped entirely) so the audit trail of
   * "this stage's output was reviewed at this checkpoint" is preserved.
   */
  private async ensurePendingCheckpoint(
    owner: EpisodeRunOwner,
    runId: number,
    stage: VerticalDramaPipelineStage,
    sourceArtifactIds: string[]
  ): Promise<number> {
    const [row] = await db
      .insert(verticalDramaApprovalCheckpoints)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId,
        stage,
        state: "approved",
        approvedByUserId: owner.userId,
        notes: "auto-approved: manual approval step removed from workflow",
        sourceArtifactIds,
        repairRequestIds: [],
      })
      .returning({ id: verticalDramaApprovalCheckpoints.id });
    return row.id;
  }

  /**
   * Approve or reject a pending checkpoint AND patch the run row that
   * produced it (bug fix, 2026-07-05: the run row used to freeze at
   * `status: "approval_required"` forever once written — nothing updated it
   * after approval, so the client kept showing the approval bar with a now-
   * undefined checkpoint id, an infinite no-op loop). Extracted here (was
   * inline in the `approveCheckpoint` router procedure) so the one-click
   * episode-generate orchestration can reuse the exact same fix instead of
   * duplicating it.
   */
  async approveRunCheckpoint(
    owner: EpisodeRunOwner,
    checkpointId: number,
    decision: "approve" | "reject",
    notes?: string
  ): Promise<{
    checkpoint: VerticalDramaApprovalCheckpointRow;
    alreadyTerminal: boolean;
  } | null> {
    const [checkpoint] = await db
      .select()
      .from(verticalDramaApprovalCheckpoints)
      .where(
        and(
          eq(verticalDramaApprovalCheckpoints.id, checkpointId),
          eq(verticalDramaApprovalCheckpoints.tenantId, owner.tenantId),
          eq(verticalDramaApprovalCheckpoints.userId, owner.userId),
          eq(verticalDramaApprovalCheckpoints.seriesId, owner.seriesId),
          eq(verticalDramaApprovalCheckpoints.episodeId, owner.episodeId)
        )
      )
      .limit(1);
    if (!checkpoint) return null;

    if (checkpoint.state === "approved" || checkpoint.state === "rejected") {
      return { checkpoint, alreadyTerminal: true };
    }

    const approving = decision === "approve";
    const [row] = await db
      .update(verticalDramaApprovalCheckpoints)
      .set({
        state: approving ? "approved" : "rejected",
        approvedByUserId: approving ? owner.userId : null,
        rejectedByUserId: approving ? null : owner.userId,
        notes: notes ?? checkpoint.notes,
        updatedAt: new Date(),
      })
      .where(eq(verticalDramaApprovalCheckpoints.id, checkpoint.id))
      .returning();

    if (approving) {
      const nextAction: RunResult["next_action"] =
        checkpoint.stage === "create_storyboard_review_project"
          ? "open_storyboard_review"
          : checkpoint.stage === "summarize_episode_to_series_memory"
            ? "none"
            : "resume_next_stage";
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "succeeded", nextAction, updatedAt: new Date() })
        .where(eq(verticalDramaEpisodeRuns.id, checkpoint.runId));

      // Legacy path: this checkpoint predates auto-approval-at-creation and
      // was sitting `pending` until just now. Apply the durable series-memory
      // side effects on this genuine pending->approved transition. The
      // `alreadyTerminal` short-circuit above guarantees this can only ever
      // run once per checkpoint — a checkpoint created pre-approved (see
      // `ensurePendingCheckpoint`) never reaches this branch at all, since it
      // already has its memory writes applied at creation time in `runStage`.
      if (checkpoint.stage === "summarize_episode_to_series_memory") {
        await applyEpisodeSummaryMemoryWrites(owner, checkpoint, owner.userId);
      }
    } else {
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "failed", nextAction: "repair", updatedAt: new Date() })
        .where(eq(verticalDramaEpisodeRuns.id, checkpoint.runId));
    }

    return {
      checkpoint: row as VerticalDramaApprovalCheckpointRow,
      alreadyTerminal: false,
    };
  }

  /**
   * Run a single stage. Persists a run row + artifact-ledger row, gates paid
   * generation behind approval + non-dry modes, and returns the `RunResult`.
   */
  async runStage(
    owner: EpisodeRunOwner,
    stage: VerticalDramaPipelineStage,
    opts: RunStageOptions
  ): Promise<RunStageOutcome> {
    const episode = await this.loadEpisode(owner);
    const mode = opts.mode;
    const subShotPolicy =
      opts.subShotPolicy ?? VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT;
    const subShotFlagOn = opts.subShotFlagOn ?? false;
    // Hoisted so both the storyboard-generation override below and the paid
    // gate further down share the exact same condition (mode-only, no async
    // dependency) — this is the one and only "never paid before a real mode"
    // gate in this file.
    const paidModeAllowed =
      mode === "full" ||
      mode === "render_images" ||
      mode === "render_video" ||
      mode === "repair";

    let memoryBundle: unknown;
    if (stage === "normalize_series_input") {
      memoryBundle = await this.memoryService.buildEpisodeMemoryBundle(
        {
          tenantId: owner.tenantId,
          userId: owner.userId,
          seriesId: owner.seriesId,
        },
        episode.episodeNumber
      );
    }

    // Non-blocking QC warnings collected by stage-specific override blocks
    // below (e.g. `start_frame_render_plan`'s missing-character-identity
    // check, 2026-07-07 non-human-character-vanishing fix) — merged into the
    // stage's own `warnings` array once it's initialized further down.
    const stageQcWarnings: VerticalDramaWarning[] = [];

    let payload = buildStagePayload(stage, {
      episode,
      mode,
      subShotFlagOn,
      subShotPolicy,
      memoryBundle,
    });

    // Continuity gate is deliberately before storyboard/provider work. It is
    // active only for real runs, so dry-run previews and all legacy episode
    // reads remain unchanged. A failed gate writes a normal repairable run
    // and never mutates the episode's existing script/storyboard.
    if (paidModeAllowed && VERTICAL_DRAMA_CONTINUITY_GATE_STAGES.has(stage)) {
      let continuityValidation;
      try {
        continuityValidation = await validateEpisodeContinuityBeforeMedia(
          owner,
          episode,
        );
      } catch (error) {
        debugError(
          "vd_continuity_gate",
          `Continuity gate could not read episode #${owner.episodeId} context; blocking downstream media for safety`,
          error,
        );
        continuityValidation = {
          ok: false,
          openThreads: [],
          quarantinedResolutions: [],
          quarantinedOpenings: [],
          issues: [
            {
              code: "season_thread_unresolved" as const,
              episodeNumber: episode.episodeNumber,
              threadId: "continuity-context-unavailable",
              message:
                "Continuity context could not be read. Repair or retry the continuity check before generating media.",
            },
          ],
        };
      }
      const quarantinedContinuityMarkers = [
        ...continuityValidation.quarantinedResolutions.map(quarantine => ({
          quarantine,
          code: "VD_CONTINUITY_ORPHAN_RESOLUTION_QUARANTINED",
        })),
        ...continuityValidation.quarantinedOpenings.map(quarantine => ({
          quarantine,
          code: "VD_CONTINUITY_DUPLICATE_OPENING_QUARANTINED",
        })),
      ];
      if (quarantinedContinuityMarkers.length > 0) {
        for (const { quarantine, code } of quarantinedContinuityMarkers) {
          stageQcWarnings.push({
            code,
            severity: "warning",
            message: quarantine.message,
            targetStage: stage,
            repairable: false,
          });
        }
      }
      if (!continuityValidation.ok) {
        const errors: RunResult["errors"] = continuityValidation.issues.map(
          issue => ({
            code: "VD_CONTINUITY_GATE_FAILED",
            message: issue.message,
            repairable: true,
          }),
        );
        payload = {
          ...payload,
          continuity_review: {
            status: "needs_repair",
            issues: continuityValidation.issues,
            quarantinedResolutions: continuityValidation.quarantinedResolutions,
            quarantinedOpenings: continuityValidation.quarantinedOpenings,
          },
        };
        const runId = await this.writeRunForStage(owner, stage, mode, opts, {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: stageQcWarnings,
          errors,
        });
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          [],
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors,
          warnings: stageQcWarnings,
        };
        return { runId, result, staleStages: [] };
      }
    }

    // Same override convention as `storyboard_shotgrid` below, for
    // `plan_episode_script`: only when the mode is not dry_run/plan_only do
    // we replace the deterministic placeholder script with a real
    // LLM-generated one (via the `vertical-drama-script-builder` skill).
    // This stage previously had NO real-generation path at all. A generation
    // failure never throws out of `runStage` — it is recorded as a normal
    // `failed`/`repair` `RunResult`, same as every other real-generation
    // override in this file.
    if (stage === "plan_episode_script" && paidModeAllowed) {
      try {
        const generated = await this.generateRealScript(
          owner,
          episode,
          opts.deepStoryDraftsFlagOn ?? false,
          undefined,
          opts.tieInReplanFlagOn ?? false,
          opts.sceneContractsEnabled ?? false,
          opts.retentionHooksEnabled ?? false
        );
        payload = { stage, ...generated.script };
        // Persist to the episode's own `script` jsonb column.
        await db
          .update(verticalDramaEpisodes)
          .set({ script: generated.script, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          );

        // Series memory — Producer B (`planning/vd-series-memory-and-lineage/
        // plan.md` Stage 1.2), wrapped in its OWN try/catch — same
        // "never fail the primary mutation for a secondary/optional step"
        // convention as the `reconcileEpisodeLocations` best-effort block
        // below (storyboard_shotgrid override): the script itself already
        // generated and persisted successfully above, so a memory-write
        // failure (row lock timeout, series deleted mid-request, etc.) must
        // never surface as a script-generation failure.
        try {
          const episodeMemory = resolveScriptEpisodeMemory(
            generated.script,
            episode.episodeNumber
          );
          await upsertEpisodeMemory(
            owner.seriesId,
            owner.tenantId,
            owner.userId,
            episodeMemory
          );
        } catch (memoryError) {
          debugError(
            "vd_series_memory_producer_b",
            `Series memory upsert failed for episode #${owner.episodeId} (series #${owner.seriesId}) after a real plan_episode_script persist — best-effort, does not fail the script stage`,
            memoryError
          );
        }
      } catch (error) {
        const genError = mapScriptGenerationError(error);
        const runId = await this.writeRunForStage(owner, stage, mode, opts, {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: [],
          errors: [genError],
        });
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          []
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors: [genError],
          warnings: [],
        };
        return { runId, result, staleStages: [] };
      }
    }

    // `update_character_visual_bible` override — a free DB sync (no
    // credits, no LLM call, so no try/catch-to-failed-run needed; see
    // `syncCharacterVisualBible`'s doc comment for why this isn't a fresh
    // generation call).
    if (stage === "update_character_visual_bible" && paidModeAllowed) {
      const synced = await this.syncCharacterVisualBible(owner);
      payload = { stage, ...synced };
    }

    // `generate_or_import_character_refs` override — same free-DB-sync
    // pattern as `update_character_visual_bible` immediately above (no
    // credits, no LLM/provider call: real character reference generation
    // now happens entirely via the character tab's own dedicated UI —
    // `verticalDramaCharacters.generateCharacterImage`/`linkAsset`/etc —
    // this stage is just the pipeline's checkpoint that those references
    // actually exist). The dry-run placeholder (`{ mediaAssetIds: [],
    // approved: false }`) was always empty and never reflected reality,
    // which is exactly what prompted the "what's this test button even for"
    // complaint — there was nothing to distinguish a real run from a fake
    // one for this stage. Reuses `syncCharacterVisualBible`'s per-character
    // `has_approved_portrait` computation (same underlying data both stages
    // care about).
    if (stage === "generate_or_import_character_refs" && paidModeAllowed) {
      const synced = await this.syncCharacterVisualBible(owner);
      const mediaAssetIds = synced.characters
        .filter(c => c.has_approved_portrait)
        .map(c => c.character_id);
      payload = {
        stage,
        mediaAssetIds,
        approved:
          synced.characters.length > 0 &&
          mediaAssetIds.length === synced.characters.length,
        characterCount: synced.characters.length,
        referencedCount: mediaAssetIds.length,
      };
    }

    // `buildStagePayload` above is ALWAYS the deterministic, no-provider-call
    // placeholder — that call is unconditional and unchanged for every mode,
    // including dry_run/plan_only. Only for `storyboard_shotgrid`, and only
    // when the mode is not dry_run/plan_only, do we override that placeholder
    // with a real LLM-generated storyboard before the validation/approval
    // gates below run (so those gates see the same real content an operator
    // would approve). A generation failure (insufficient credits, malformed
    // LLM output, provider error) never throws out of `runStage` — it is
    // recorded as a normal `failed`/`repair` `RunResult`, same as the
    // existing schema-validation-gate failure path just below.
    if (stage === "storyboard_shotgrid" && paidModeAllowed) {
      try {
        const generated = await this.generateRealStoryboard(
          owner,
          episode,
          opts.deepStoryDraftsFlagOn ?? false,
          undefined,
          opts.sceneContractsEnabled ?? false,
          opts.retentionHooksEnabled ?? false,
          opts.motionContractsEnabled ?? false
        );
        payload = { stage, ...generated.storyboard };
        // Persist to the episode's own `storyboard` jsonb column (not
        // `script`), same tenant/user/series-scoped update pattern used by
        // the router's `updateEpisodeDraft` procedure.
        await db
          .update(verticalDramaEpisodes)
          .set({ storyboard: generated.storyboard, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          );

        // Phase 2 of `planning/polished-toasting-gadget.md` (location visual
        // bible) — idempotently materialize the just-persisted storyboard's
        // own `distinct_locations[]` groups into durable
        // `vertical_drama_locations` roster rows, right after the real
        // persist above succeeds. Mapped snake_case (LLM/persisted-JSON
        // shape) -> camelCase (`VerticalDramaStoryboardLocationGroup`, the
        // contract `reconcileEpisodeLocations` consumes). Best-effort,
        // wrapped in its OWN try/catch — same "never fail the primary
        // mutation for a secondary/optional step" convention
        // `verticalDramaImproveScript.ts`'s `runImproveScriptJob` already
        // uses for this exact function's character-side sibling
        // (`reconcileCharacterVariantPlan`, via
        // `logCharacterVariantPlanningFailure`): a reconciliation failure
        // (e.g. a transient DB error) must never surface as a
        // storyboard-generation failure to the user, since the storyboard
        // itself already generated and persisted successfully.
        try {
          // `generated.storyboard.distinct_locations` is already
          // Zod-validated by `distinctLocationSchema` when present
          // (non-empty `location_key`/`location_name`/`description`, a
          // non-empty 1-9 `shot_numbers` array) — a straight snake_case ->
          // camelCase field-name mapping is all that's needed here, no
          // additional defensive parsing.
          const distinctLocationGroups: VerticalDramaStoryboardLocationGroup[] =
            (generated.storyboard.distinct_locations ?? []).map(g => ({
              locationKey: g.location_key,
              locationName: g.location_name,
              description: g.description,
              shotNumbers: g.shot_numbers,
            }));
          const reconciliation = await reconcileEpisodeLocations(
            owner,
            distinctLocationGroups
          );
          const bindingByIncomingIdentity = new Map(
            (reconciliation.locationBindings ?? []).map(binding => [
              `${binding.incomingLocationKey}\u0000${binding.incomingLocationName}`,
              binding.canonicalLocationKey,
            ])
          );
          const canonicalDistinctLocations = (
            generated.storyboard.distinct_locations ?? []
          ).map(group => {
            const canonicalLocationKey = bindingByIncomingIdentity.get(
              `${group.location_key}\u0000${group.location_name}`
            );
            return canonicalLocationKey &&
              canonicalLocationKey !== group.location_key
              ? { ...group, location_key: canonicalLocationKey }
              : group;
          });
          const hasCanonicalKeyChanges = canonicalDistinctLocations.some(
            (group, index) =>
              group !== generated.storyboard.distinct_locations?.[index]
          );
          if (hasCanonicalKeyChanges) {
            const canonicalStoryboard = {
              ...generated.storyboard,
              distinct_locations: canonicalDistinctLocations,
            };
            await db
              .update(verticalDramaEpisodes)
              .set({ storyboard: canonicalStoryboard, updatedAt: new Date() })
              .where(
                and(
                  eq(verticalDramaEpisodes.id, owner.episodeId),
                  eq(verticalDramaEpisodes.tenantId, owner.tenantId),
                  eq(verticalDramaEpisodes.userId, owner.userId),
                  eq(verticalDramaEpisodes.seriesId, owner.seriesId)
                )
              );
            generated.storyboard = canonicalStoryboard;
            payload = { stage, ...canonicalStoryboard };
          }
        } catch (reconcileError) {
          debugError(
            "vd_location_reconciliation",
            `Location reconciliation failed for episode #${owner.episodeId} (series #${owner.seriesId}) after a real storyboard_shotgrid persist — best-effort, does not fail the storyboard stage`,
            reconcileError
          );
        }
      } catch (error) {
        const genError = mapStoryboardGenerationError(error);
        const runId = await this.writeRunForStage(owner, stage, mode, opts, {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: [],
          errors: [genError],
        });
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          []
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors: [genError],
          warnings: [],
        };
        return { runId, result, staleStages: [] };
      }
    }

    // Same override convention as `storyboard_shotgrid` above, for
    // `start_frame_render_plan`: only when the mode is not
    // dry_run/plan_only do we replace the deterministic placeholder frames
    // with a real LLM-generated render plan (via the
    // `vertical-drama-shot-start-frame-render` skill). This is a credit-gated
    // *planning* call only — `start_frame_render_plan` is NOT in
    // `VERTICAL_DRAMA_PAID_STAGES` (the paid image render happens later, in
    // `render_or_import_start_frames`). A generation failure never throws out
    // of `runStage` — it is recorded as a normal `failed`/`repair`
    // `RunResult`, same as the storyboard override.
    if (stage === "start_frame_render_plan" && paidModeAllowed) {
      try {
        const generated = await this.generateRealStartFramePlan(owner, episode);

        // Product tie-in shot mapping (production-grade end-to-end wiring):
        // map the script stage's `product_tie_in_plan.tie_ins[]` (already
        // normalized by `extractShotProductPlacements`) onto the concrete
        // frames that carry a placement, populating `productReferenceAssetIds`
        // (the product's own reference image URL(s) — plain URLs, not
        // `media_assets` ids, since the series' `productTieIn` config stores a
        // direct `productImageUrl`) and weaving a natural in-scene product
        // direction into that frame's `imagePrompt`. No-op when tie-in is
        // disabled or the script produced no placements this episode.
        const scriptPayload =
          (episode.script as Record<string, unknown> | null) ?? null;
        const placements = extractShotProductPlacements(
          scriptPayload?.product_tie_in_plan
        );
        let framesWithTieIn = generated.plan.frames;
        if (placements.length > 0) {
          const [tieInSeriesRow] = await db
            .select({ productTieIn: verticalDramaSeries.productTieIn })
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, owner.seriesId),
                eq(verticalDramaSeries.tenantId, owner.tenantId),
                eq(verticalDramaSeries.userId, owner.userId)
              )
            )
            .limit(1);
          const rawProductTieIn =
            (tieInSeriesRow?.productTieIn as Record<string, unknown> | null) ??
            null;
          const productName =
            typeof rawProductTieIn?.productName === "string"
              ? rawProductTieIn.productName
              : undefined;
          const productImageUrl =
            typeof rawProductTieIn?.productImageUrl === "string" &&
            rawProductTieIn.productImageUrl
              ? rawProductTieIn.productImageUrl
              : undefined;
          const marketplaceCaptureId =
            typeof rawProductTieIn?.marketplaceCaptureId === "string" &&
            rawProductTieIn.marketplaceCaptureId
              ? rawProductTieIn.marketplaceCaptureId
              : undefined;
          // Brand-neutral category descriptor (Thai ad-compliance + video-
          // policy guard) — e.g. "cosmetics" -> reads as "the cosmetics shown
          // in the reference image" via `buildGenericProductDescriptor`.
          // Falls back to the generic reference-image phrasing when absent.
          const productCategoryDescriptor =
            typeof rawProductTieIn?.productCategory === "string" &&
            rawProductTieIn.productCategory
              ? rawProductTieIn.productCategory
              : undefined;
          // Marketplace Capture's selected/best product images (read-only,
          // tenant/user-scoped) — graceful no-op ([]) when the capture is
          // missing, inaccessible, or has no images; falls back to the
          // series' own `productImageUrl` via `resolveProductReferenceImageUrls`.
          const captureSelectedImageUrls =
            await resolveMarketplaceCaptureProductImageUrls(
              marketplaceCaptureId,
              { userId: owner.userId, tenantId: owner.tenantId }
            );
          const productRefUrls = resolveProductReferenceImageUrls({
            productImageUrl,
            captureSelectedImageUrls,
          });

          framesWithTieIn = generated.plan.frames.map(frame => {
            const placement = findPlacementForShot(
              placements,
              frame.shotNumber
            );
            if (!placement) return frame;
            // Additive product-reference picker (2026-07-06): once the user
            // has explicitly customized this shot's product reference
            // image(s) (`productRefsCustomized: true` — set by the frontend
            // picker via `updateEpisodeDraft`, even to an explicit empty
            // selection), auto-resolution must never overwrite that choice on
            // a plan regen — see `resolveFrameProductReferenceAssetIds`'s doc
            // comment for the full override-semantics contract. Frames never
            // customized keep the pre-existing auto-merge behavior unchanged.
            return {
              ...frame,
              productReferenceAssetIds: resolveFrameProductReferenceAssetIds({
                existingProductReferenceAssetIds:
                  frame.productReferenceAssetIds,
                productRefsCustomized: frame.productRefsCustomized,
                resolvedProductRefUrls: productRefUrls,
              }),
              imagePrompt: appendProductPresenceDirective(
                frame.imagePrompt,
                productName,
                placement,
                productCategoryDescriptor
              ),
            };
          });
        }

        // Final-prompt QC (hard length cap) — BEFORE this plan is persisted
        // or used to render a paid image. Zero-cost no-op for prompts
        // already within `VD_IMAGE_PROMPT_MAX` (see
        // `verticalDramaPromptQc.ts`'s doc comment). Runs AFTER the tie-in
        // directive is appended so the persisted prompt never exceeds the cap.
        generated.plan = {
          ...generated.plan,
          frames: await Promise.all(
            framesWithTieIn.map(async frame => {
              const qc = await ensurePromptWithinLimit({
                kind: "image",
                prompt: frame.imagePrompt,
                maxChars: generated.imagePromptMaxChars,
                userId: owner.userId,
                tenantId: owner.tenantId,
                seriesId: owner.seriesId,
                idempotencyKey: `${owner.episodeId}:start_frame_render_plan:${frame.shotNumber}`,
                label: `start-frame prompt (shot ${frame.shotNumber})`,
              });
              return { ...frame, imagePrompt: qc.prompt };
            })
          ),
        };

        // Light, non-blocking QC (2026-07-07 non-human-character-vanishing
        // fix): warn — never fail the stage — when a frame's finalized
        // prompt doesn't mention a required character's name/descriptor at
        // all, the cheap signal that the character was silently
        // dropped/genericized (see the เจ้าเกลือ repro in this file's
        // `generateRealStartFramePlan` doc comment).
        const missingIdentityWarnings = findMissingCharacterIdentityWarnings(
          generated.plan.frames,
          generated.characters
        );
        for (const missing of missingIdentityWarnings) {
          stageQcWarnings.push({
            code: "VD_START_FRAME_CHARACTER_IDENTITY_MISSING",
            severity: "warning",
            message: `Shot ${missing.shotNumber}: required character "${
              missing.characterName ?? missing.characterKey
            }" (${missing.characterKey}) is not mentioned in the generated prompt — it may have been rendered as a generic figure instead of its real identity.`,
            targetStage: stage,
            targetShotNumber: missing.shotNumber,
            repairable: true,
          });
        }

        // Same non-blocking QC channel, for the reference-mapping validator
        // (`planning/vd-start-frame-reference-mapping/plan.md` Phase 2,
        // RC3 fix, 2026-07-16) — a shot whose own "Image N ↔ name" claim
        // still contradicts its real attachment order after
        // `generateStartFrameRenderPlan`'s one corrective retry warns rather
        // than fails the whole 9-shot batch (the per-shot "ให้ AI ปรับ"
        // regenerate path — `generateShotStartFramePrompt` — fails CLOSED
        // instead, since that path only ever touches one shot).
        for (const mismatch of generated.referenceMappingWarnings ?? []) {
          stageQcWarnings.push({
            code: "VD_START_FRAME_REFERENCE_MAPPING_MISMATCH",
            severity: "warning",
            message: `Shot ${mismatch.shotNumber}: prompt claims "${mismatch.characterName}" is Image ${mismatch.claimedImageIndex}, but the real attachment order makes it Image ${mismatch.expectedImageIndex} — regenerate this shot's prompt to fix the mapping before rendering.`,
            targetStage: stage,
            targetShotNumber: mismatch.shotNumber,
            repairable: true,
          });
        }

        payload = { stage, ...generated.plan };
        // Persist to the episode's own `startFramePlan` jsonb column.
        await db
          .update(verticalDramaEpisodes)
          .set({ startFramePlan: generated.plan, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          );
      } catch (error) {
        const genError = mapStartFrameGenerationError(error);
        const runId = await this.writeRunForStage(owner, stage, mode, opts, {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: [],
          errors: [genError],
        });
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          []
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors: [genError],
          warnings: [],
        };
        return { runId, result, staleStages: [] };
      }
    }

    // Same override convention, for `video_motion_prompt_pack`: only when the
    // mode is not dry_run/plan_only do we replace the deterministic
    // placeholder clips with real LLM-generated motion prompts (via the
    // `vertical-drama-video-motion-prompt-pack` skill). Credit-gated
    // *planning* call only — `video_motion_prompt_pack` is NOT in
    // `VERTICAL_DRAMA_PAID_STAGES` (the paid video render happens later, in
    // `render_or_import_video_clips`).
    //
    // Speaker-aware sub-shots task (Package 5) — bug fix: the sub-shot
    // expansion used to be applied ONLY to the `payload` variable (the
    // stage's artifact-ledger record) via `planSubShots`/`buildStoryboard()`
    // — the DRY-RUN PLACEHOLDER shot generator — and NEVER to `generated.pack`
    // itself (the object actually persisted to
    // `verticalDramaEpisodes.motionPromptPack`, the source of truth the
    // storyboard panel and `render_or_import_video_clips` both read from).
    // That meant real runs (a) never actually split a shot's REAL clip into
    // sub-shots in the data that matters, and (b) whenever they DID append a
    // `sub_shot_plan`, it was placeholder text in the artifact record. Fixed
    // by calling `applySpeakerSwitchSubShotsToRealMotionPromptPack` (Package
    // 5) on the REAL `generated.pack` BEFORE it is used for either `payload`
    // or persistence — reuses the exact same deterministic gate
    // (`computeSpeakerSwitchSubShotPlan`) and per-shot generator
    // (`generateVerticalDramaShotVideoPromptSpeakerSwitch`) the per-shot
    // `generateShotVideoPrompt` mutation uses (Package 3), operating on the
    // REAL clips' own `dialogue[]` (already populated by
    // `syncDialogueOntoMotionPromptClips` just below) instead of
    // `buildStoryboard()`'s placeholder shots. A generation failure never
    // throws out of `runStage` — same failed/repair convention as above.
    if (stage === "video_motion_prompt_pack" && paidModeAllowed) {
      try {
        const generated = await this.generateRealMotionPromptPack(
          owner,
          episode,
          opts.retentionHooksEnabled ?? false,
          opts.motionContractsEnabled ?? false
        );
        // Phase 3.1: sync `dialogueAudioPlan` lines onto `clips[j].dialogue`
        // when the skill's own `.passthrough()` output didn't already carry
        // them — never overwrites a non-empty existing array. No-op (returns
        // the pack unchanged) when the episode has no dialogue plan yet.
        generated.pack = syncDialogueOntoMotionPromptClips(
          generated.pack,
          episode.dialogueAudioPlan
        );
        // Video MCP submission fix: fill each clip's `startFrameAssetId` from
        // the episode's own approved start-frame render (ground truth — the
        // user-approved image in the storyboard panel) when the LLM's own
        // `start_frame_reference.asset_id` free-text claim was empty. See
        // `syncStartFramesOntoMotionPromptClips`'s doc comment for why this
        // was previously silently dropping the start frame from every video
        // MCP submission (e.g. Higgsfield `referenceImageCount: 0`).
        generated.pack = syncStartFramesOntoMotionPromptClips(
          generated.pack,
          episode.startFramePlan
        );
        // Final-prompt QC (hard length cap) — BEFORE this pack is persisted
        // or used to render a paid video clip. Zero-cost no-op for clips
        // already within `VD_VIDEO_PROMPT_MAX`.
        generated.pack = {
          ...generated.pack,
          clips: await Promise.all(
            generated.pack.clips.map(async clip => {
              const qc = await ensurePromptWithinLimit({
                kind: "video",
                prompt: clip.prompt,
                userId: owner.userId,
                tenantId: owner.tenantId,
                seriesId: owner.seriesId,
                idempotencyKey: `${owner.episodeId}:video_motion_prompt_pack:${clip.clipNumber}`,
                label: `motion prompt (clip ${clip.clipNumber})`,
              });
              return { ...clip, prompt: qc.prompt };
            })
          ),
        };
        // Speaker-aware sub-shots (Package 5) — operates on the REAL clips'
        // own `dialogue[]` (populated above), replacing any shot whose
        // dialogue needs cutting between speakers with ONE real, combined,
        // timed motion-prompt clip carrying `extraReferenceAssetIds`. No-op
        // (`generated.pack` unchanged) when `subShotFlagOn` is false — same
        // fail-closed default as every other sub-shot gate.
        generated.pack = await applySpeakerSwitchSubShotsToRealMotionPromptPack(
          owner,
          episode,
          generated.pack,
          subShotFlagOn,
          subShotPolicy
        );
        payload = { stage, ...generated.pack, warnings: [] };
        // Persist to the episode's own `motionPromptPack` jsonb column.
        await db
          .update(verticalDramaEpisodes)
          .set({
            motionPromptPack: stampArtifactForStoryboard(
              generated.pack as unknown as Record<string, unknown>,
              episode.storyboard
            ),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          );
      } catch (error) {
        const genError = mapMotionPromptGenerationError(error);
        const runId = await this.writeRunForStage(owner, stage, mode, opts, {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: [],
          errors: [genError],
        });
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          []
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors: [genError],
          warnings: [],
        };
        return { runId, result, staleStages: [] };
      }
    }

    // Same override convention as the three generation stages above, for
    // `create_storyboard_review_project`: only when the mode is not
    // dry_run/plan_only do we replace the deterministic
    // `{ storyboardReviewId: null, created: false }` placeholder with a real
    // Storyboard Review project row via the existing, tested
    // `createVerticalDramaStoryboardHandoff` service. Unlike the three stages
    // above, this is NOT a paid-provider call — it is a pure DB
    // insert/reopen — so it is gated by `paidModeAllowed` only (never a
    // credit check) purely to keep dry_run/plan_only free of real DB side
    // effects, matching the existing convention for every other
    // paidModeAllowed-gated override in this file. A failure never throws out
    // of `runStage` — it is recorded as a normal `failed`/`repair`
    // `RunResult`, same as the three overrides above.
    if (stage === "create_storyboard_review_project" && paidModeAllowed) {
      try {
        const handoff = await this.createRealStoryboardReviewProject(
          owner,
          episode,
          subShotFlagOn
        );
        payload = {
          stage,
          storyboardReviewId: String(handoff.reviewId),
          created: !handoff.reused,
          reused: handoff.reused,
          idempotencyKey: handoff.idempotencyKey,
          episodePlanHash: handoff.episodePlanHash,
          taskCount: handoff.taskCount,
        };
        // `createVerticalDramaStoryboardHandoff` already repoints the
        // episode's `storyboardReviewId` backlink itself (on both the
        // create and reopen paths) — no additional persistence needed here.
      } catch (error) {
        const genError = mapStoryboardReviewHandoffError(error);
        const runId = await this.writeRunForStage(owner, stage, mode, opts, {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: [],
          errors: [genError],
        });
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          []
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors: [genError],
          warnings: [],
        };
        return { runId, result, staleStages: [] };
      }
    }

    // Same override convention as the stages above, for
    // `summarize_episode_to_series_memory`: only when the mode is not
    // dry_run/plan_only do we replace the deterministic pending-summary
    // placeholder with the real `vertical-drama-series-memory-planner`
    // skill output (episode recap, canonical facts, hooks
    // opened/resolved, character/relationship deltas, continuity risks,
    // product tie-in history). This IS a paid LLM call (credit-gated
    // inside `generateRealSeriesMemoryPlan`), but — like every other real-
    // generation override in this file — it is gated by `paidModeAllowed`
    // (never `VERTICAL_DRAMA_PAID_STAGES`, which is reserved for stages
    // that call an external media provider) so it never runs in
    // dry_run/plan_only. The planner output is written into THIS stage's
    // artifact only; it is never auto-applied to durable series memory
    // here — the approval gate below (and `verticalDramaEpisodes.ts`'s
    // `approveCheckpoint`) still owns the actual append-only memory writes,
    // preserving the "memory events are appended only on explicit approval"
    // design. A generation failure never throws out of `runStage` — it is
    // recorded as a normal `failed`/`repair` `RunResult`, same as every
    // other real-generation override above.
    if (stage === "summarize_episode_to_series_memory" && paidModeAllowed) {
      try {
        const generated = await this.generateRealSeriesMemoryPlan(
          owner,
          episode
        );
        payload = {
          stage,
          episodeNumber: episode.episodeNumber,
          pending: true,
          ...generated.planned,
        };
      } catch (error) {
        const genError = mapMemoryPlanningError(error);
        const runId = await this.writeRunForStage(owner, stage, mode, opts, {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: [],
          errors: [genError],
        });
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          []
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors: [genError],
          warnings: [],
        };
        return { runId, result, staleStages: [] };
      }
    }

    // 1) Schema-validation gate — a failed validation never advances (spec §11.5).
    const validation = validateStagePayload(
      stage,
      payload,
      opts.sceneContractsEnabled ?? false
    );
    if (!validation.valid) {
      // Create the run row FIRST so the artifact FK (runId) is satisfiable.
      const runId = await this.writeRunForStage(owner, stage, mode, opts, {
        status: "failed",
        next_action: "repair",
        artifactIds: [],
        warnings: [],
        errors: validation.errors,
      });
      const artifact = await this.writeArtifact(
        owner,
        runId,
        stage,
        payload,
        []
      );
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ artifactIds: [String(artifact.id)] })
        .where(eq(verticalDramaEpisodeRuns.id, runId));
      const result: RunResult = {
        runId: String(runId),
        seriesId: String(owner.seriesId),
        episodeId: String(owner.episodeId),
        stage,
        status: "failed",
        next_action: "repair",
        artifactIds: [String(artifact.id)],
        errors: validation.errors,
        warnings: [],
      };
      return { runId, result, staleStages: [] };
    }

    const warnings: VerticalDramaWarning[] = [...stageQcWarnings];
    const errors: RunResult["errors"] = [];
    let status: RunResult["status"] = "succeeded";
    let nextAction: RunResult["next_action"] = "resume_next_stage";
    let mediaAssetIds: number[] = [];
    let qc: VerticalDramaQcResult | undefined;

    // 2) Approval gate — manual approval was removed from the product
    // workflow (2026-07-07): approval-stage checkpoints are now written
    // pre-approved (see `ensurePendingCheckpoint`) purely as audit records,
    // and the pipeline never blocks on them. `isStageApproved` is kept for
    // callers that still inspect checkpoint history, but the gate itself is
    // hardcoded true so a stage is never left in `approval_required`.
    const requiresApproval = VERTICAL_DRAMA_APPROVAL_STAGES.has(stage);
    const approved = true;

    // 3) Paid gate — paid stages never run in dry-run/plan-only or before approval.
    const isPaid = VERTICAL_DRAMA_PAID_STAGES.has(stage);
    // `paidModeAllowed` is computed once, above, before the storyboard-
    // generation override — reused here unchanged.

    if (requiresApproval && !approved) {
      status = "approval_required";
      nextAction = "approve";
    } else if (isPaid) {
      if (!paidModeAllowed) {
        // dry_run / plan_only: plan only, spend nothing.
        status = "succeeded";
        nextAction = "resume_next_stage";
        warnings.push({
          code: "VD_PAID_SKIPPED_DRY_RUN",
          severity: "info",
          message: `Paid generation skipped in ${mode} mode; approve + run a paid mode to render.`,
          targetStage: stage,
          repairable: false,
        });
      } else {
        const routed = await this.providerPort.routeAndRenderStage({
          ...owner,
          runId: 0,
          stage,
          mode,
          payload,
        });
        mediaAssetIds = routed.mediaAssetIds;
        warnings.push(...routed.warnings);
        errors.push(...routed.errors);
        qc = routed.qc;
        if (routed.status === "blocked" || routed.status === "failed") {
          status = "failed";
          nextAction = "repair";
        } else if (routed.status === "skipped") {
          status = "succeeded";
          nextAction = "resume_next_stage";
        } else {
          status = "succeeded";
          nextAction = "resume_next_stage";
        }
      }
    } else if (stage === "create_storyboard_review_project") {
      nextAction = "open_storyboard_review";
    } else if (stage === "summarize_episode_to_series_memory") {
      // Terminal stage. Memory is NOT auto-mutated here: the pending-approval
      // gate above holds it, and memory events are appended only on explicit
      // approval (via the memory service), never as a side effect of this run.
      nextAction = "none";
    }

    // 4) Optional QC pass (section 08 seam).
    if (!qc && this.providerPort.runQc) {
      qc = await this.providerPort.runQc({
        ...owner,
        runId: 0,
        stage,
        mode,
        payload,
      });
    }

    // Create the run row FIRST so the artifact FK (runId) is satisfiable.
    const runId = await this.writeRunForStage(owner, stage, mode, opts, {
      status,
      next_action: nextAction,
      artifactIds: [],
      warnings,
      errors,
    });
    const artifact = await this.writeArtifact(
      owner,
      runId,
      stage,
      payload,
      mediaAssetIds
    );
    const artifactIds = [String(artifact.id)];
    await db
      .update(verticalDramaEpisodeRuns)
      .set({ artifactIds })
      .where(eq(verticalDramaEpisodeRuns.id, runId));

    // Manual approval was removed from the product workflow (2026-07-07):
    // approval-stage checkpoints are still written for every approval stage
    // as an audit record, but pre-approved — `ensurePendingCheckpoint` no
    // longer inserts `state: "pending"`, so this never resurrects the
    // approval-required gate above.
    let checkpointId: number | undefined;
    if (requiresApproval) {
      checkpointId = await this.ensurePendingCheckpoint(
        owner,
        runId,
        stage,
        artifactIds
      );

      // `summarize_episode_to_series_memory` is reached here only on success
      // (every failure path above returns early, before this point) — apply
      // the durable series-memory writes exactly once, right at checkpoint
      // creation, since the checkpoint is already born `approved` and will
      // never go through a pending->approved transition in
      // `approveRunCheckpoint` to trigger them there instead.
      if (stage === "summarize_episode_to_series_memory") {
        await applyEpisodeSummaryMemoryWrites(
          owner,
          { id: checkpointId, runId, sourceArtifactIds: artifactIds },
          owner.userId
        );
      }
    }

    const result: RunResult = {
      runId: String(runId),
      seriesId: String(owner.seriesId),
      episodeId: String(owner.episodeId),
      stage,
      status,
      next_action: nextAction,
      artifactIds,
      errors,
      warnings,
      qc,
    };
    return { runId, result, staleStages: [], checkpointId };
  }

  /**
   * Async submit for `storyboard_shotgrid`'s REAL (non dry_run/plan_only)
   * generation path — bug #127
   * (`planning/vd-storyboard-runstage-async-job/plan.md`):
   * `generateStoryboardShotgrid`'s single ~16k-token LLM call routinely
   * outlives Cloudflare's edge-proxy read timeout (~100s), which disconnects
   * the browser before `runStage`'s synchronous `await` can ever resolve,
   * even though nginx (`proxy_ignore_client_abort on`, 2026-07-24) now lets
   * the work finish server-side once disconnected. This is the async
   * replacement for `runStage`'s `storyboard_shotgrid` override ONLY — every
   * other stage (and this stage's own dry_run/plan_only placeholder) is
   * untouched and stays on `runStage`'s fully-synchronous path.
   *
   * Design (option A, `planning/vd-storyboard-runstage-async-job/plan.md`):
   * reuse `vertical_drama_episode_runs` as the async status record instead
   * of inventing a new table — its `status` column already defaults to
   * `"queued"` and the `RunResult["status"]` union already includes
   * `"queued"`/`"running"` (both previously unused).
   *
   * 1. Insert a `queued` run row IMMEDIATELY (no LLM call, nothing slow) and
   *    return its id right away — the `runStage`/`regenerateStage` tRPC
   *    mutations return to the client BEFORE any generation starts.
   * 2. `runStoryboardShotgridStageJob` (below) does the actual generation +
   *    every downstream persistence/validation/checkpoint step that used to
   *    run inline inside `runStage`'s synchronous request, from a BullMQ
   *    background worker (`verticalDramaEpisodeStageJobs.ts`), and UPDATEs
   *    this same row instead of inserting a fresh one when it's done.
   *
   * Idempotency: a `queued`/`running` run already in flight for this exact
   * (episode, stage) is reused instead of starting a second background LLM
   * call — prevents a double-click (or a retry from
   * `handleGenerateEpisodeStoryboard`) from double-charging credits.
   */
  async submitStoryboardShotgridStage(
    owner: EpisodeRunOwner,
    opts: RunStageOptions
  ): Promise<{ runId: number; result: RunResult; alreadySubmitted: boolean }> {
    return this.submitEpisodeStageAsync(owner, "storyboard_shotgrid", opts);
  }

  /**
   * Stage-agnostic version of the above
   * (`planning/vd-async-stage-jobs-generalization/plan.md` S3). Everything the
   * storyboard submit did — idempotent reuse of an in-flight run, stale-run
   * self-heal, `queued` placeholder insert — is stage-independent; only the
   * stage name was hardcoded. `submitStoryboardShotgridStage` remains as a
   * thin wrapper so existing callers and their tests are untouched.
   */
  async submitEpisodeStageAsync(
    owner: EpisodeRunOwner,
    stage: VerticalDramaPipelineStage,
    opts: RunStageOptions
  ): Promise<{ runId: number; result: RunResult; alreadySubmitted: boolean }> {
    const [existing] = await db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.userId, owner.userId),
          eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
          eq(verticalDramaEpisodeRuns.stage, stage),
          inArray(verticalDramaEpisodeRuns.status, ["queued", "running"])
        )
      )
      .orderBy(desc(verticalDramaEpisodeRuns.id))
      .limit(1);

    if (existing) {
      // Stale-run self-heal (bug #127 hardening — mirrors the stale-pointer
      // branch in `verticalDramaStoryJobs.ts`'s `enqueueVerticalDramaStoryJob`):
      // a `queued`/`running` row whose last update is older than the
      // staleness threshold has no live BullMQ job behind it (queue init
      // missing — the outage that stranded runs #496/#501 — enqueue lost, or
      // the worker died mid-run with `attempts: 1`). Reusing it would
      // deadlock this (episode, stage) forever: every re-submit would return
      // the dead row and skip the enqueue. Mark it failed and fall through
      // to a fresh insert instead.
      const lastUpdateMs = new Date(existing.updatedAt).getTime();
      const isStale =
        Number.isFinite(lastUpdateMs) &&
        Date.now() - lastUpdateMs > STORYBOARD_SHOTGRID_RUN_STALE_AFTER_MS;
      if (!isStale) {
        return {
          runId: existing.id,
          alreadySubmitted: true,
          result: {
            runId: String(existing.id),
            seriesId: String(owner.seriesId),
            episodeId: String(owner.episodeId),
            stage,
            status: existing.status as RunResult["status"],
            next_action: existing.nextAction as RunResult["next_action"],
            artifactIds: (existing.artifactIds as string[] | null) ?? [],
            errors: (existing.errors as RunResult["errors"] | null) ?? [],
            warnings:
              (existing.warnings as VerticalDramaWarning[] | null) ?? [],
          },
        };
      }
      await markStoryboardShotgridRunFailed(
        existing.id,
        `Run sat at '${existing.status}' for over ${Math.round(
          STORYBOARD_SHOTGRID_RUN_STALE_AFTER_MS / 60_000
        )} minutes with no progress — self-healed to 'failed' at submit time so a fresh run could start (bug #127 hardening).`
      );
    }

    const [row] = await db
      .insert(verticalDramaEpisodeRuns)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        stage,
        runMode: opts.mode,
        status: "queued",
        nextAction: "none",
        artifactIds: [],
        warnings: [],
        errors: [],
      })
      .returning({ id: verticalDramaEpisodeRuns.id });

    return {
      runId: row.id,
      alreadySubmitted: false,
      result: {
        runId: String(row.id),
        seriesId: String(owner.seriesId),
        episodeId: String(owner.episodeId),
        stage,
        status: "queued",
        next_action: "none",
        artifactIds: [],
        errors: [],
        warnings: [],
      },
    };
  }

  /**
   * Background body for `submitStoryboardShotgridStage` above — runs from
   * `verticalDramaEpisodeStageJobs.ts`'s BullMQ worker, never from an HTTP
   * request. Mirrors `runStage`'s `storyboard_shotgrid` override (real
   * generation + persist + best-effort location reconciliation) followed by
   * the shared post-generation tail it used to fall through to (schema
   * validation gate, `writeRun`, `writeArtifact`, approval-checkpoint
   * creation) — reproduced here rather than shared with `runStage` because
   * `storyboard_shotgrid` never reaches the paid-provider branch or either
   * of the two stage-specific `else if`s in that shared tail (it is not in
   * `VERTICAL_DRAMA_PAID_STAGES`, and `runStage`'s `approved` is hardcoded
   * `true`), so the only paths that tail can actually take for THIS stage
   * are exactly the ones reproduced below — this is the dead-code-eliminated
   * version of that tail, scoped to this one stage, not a re-interpretation.
   *
   * `clearDownstreamOnSuccess` — set ONLY by `regenerateStage`'s router call
   * site: on a successful generation, replicates that mutation's existing
   * post-success downstream-invalidation block (delete stale run rows + null
   * downstream jsonb columns), deferred to run here instead of synchronously
   * after `runStage` returns. See
   * `clearStoryboardShotgridDownstreamAfterRegenerate`'s doc comment.
   *
   * Requirement (bug #127 hard rule): ANY thrown error — including one from
   * a step not already wrapped in a narrower try/catch below — MUST still
   * leave the row `failed`, never stuck at `queued`/`running` forever. The
   * outer try/catch is the last line of defense for that.
   */
  /**
   * Background body for every OTHER async stage
   * (`planning/vd-async-stage-jobs-generalization/plan.md` S4) — runs from the
   * same BullMQ worker, never from an HTTP request.
   *
   * Deliberately delegates to `runStage` rather than reproducing its tail the
   * way `runStoryboardShotgridStageJob` does. That method is a
   * dead-code-eliminated copy of the tail, valid ONLY because
   * `storyboard_shotgrid` can never reach the paid-provider branch or either
   * stage-specific `else if`. Copying that shape for a stage with different
   * downstream behavior would be wrong; `runStage` already handles every stage
   * correctly, and `asyncRunId` is what stops it inserting a second run row
   * beside the `queued` placeholder the client is polling.
   *
   * Same hard rule as the storyboard job: ANY thrown error must still leave
   * the row `failed`, never stuck at `queued`/`running` forever.
   */
  async runEpisodeStageJob(
    owner: EpisodeRunOwner,
    runId: number,
    stage: VerticalDramaPipelineStage,
    opts: RunStageOptions
  ): Promise<void> {
    try {
      // Guarded claim — identical rule to the storyboard job's: only a
      // still-`queued`/`running` row may be claimed. A row the stale sweep
      // already failed may have been re-submitted by the user, so running
      // anyway would double-charge the LLM call.
      const claimed = await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "running", updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodeRuns.id, runId),
            inArray(verticalDramaEpisodeRuns.status, ["queued", "running"])
          )
        )
        .returning({ id: verticalDramaEpisodeRuns.id });
      if (claimed.length === 0) {
        debugError(
          "vd_episode_stage_async_job",
          `Skipping ${stage} job for run #${runId} (episode #${owner.episodeId}) — the row is no longer queued/running (stale-swept or already finalized), not re-claiming it`
        );
        return;
      }

      await this.runStage(owner, stage, { ...opts, asyncRunId: runId });
    } catch (err) {
      await markStoryboardShotgridRunFailed(
        runId,
        err instanceof Error ? err.message : String(err)
      );
      debugError(
        "vd_episode_stage_async_job",
        `${stage} job for run #${runId} (episode #${owner.episodeId}) threw — the run row was marked failed`,
        err
      );
    }
  }

  async runStoryboardShotgridStageJob(
    owner: EpisodeRunOwner,
    runId: number,
    opts: RunStageOptions,
    clearDownstreamOnSuccess?: boolean
  ): Promise<void> {
    const stage: VerticalDramaPipelineStage = "storyboard_shotgrid";
    let payload: Record<string, unknown> = { stage };
    try {
      // Guarded claim (bug #127 hardening): only a still-`queued`/`running`
      // row may be claimed. If the stale sweep (or the submit-time self-heal
      // in `submitStoryboardShotgridStage`) already marked this run `failed`
      // — e.g. a >30 min BullMQ backlog delivered the job only after its row
      // was swept — running anyway would resurrect a row the user has
      // already been shown as failed (and may have re-submitted, so a fresh
      // run for the same episode could be in flight), double-charging the
      // LLM call.
      const claimed = await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "running", updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaEpisodeRuns.id, runId),
            inArray(verticalDramaEpisodeRuns.status, ["queued", "running"])
          )
        )
        .returning({ id: verticalDramaEpisodeRuns.id });
      if (claimed.length === 0) {
        debugError(
          "vd_storyboard_async_job",
          `Skipping storyboard_shotgrid job for run #${runId} (episode #${owner.episodeId}) — the row is no longer queued/running (stale-swept or already finalized), not re-claiming it`
        );
        return;
      }

      const episode = await this.loadEpisode(owner);

      // The storyboard worker has a dedicated tail rather than delegating to
      // runStage, so apply the same pre-provider gate here as well.
      const continuityValidation = await validateEpisodeContinuityBeforeMedia(
        owner,
        episode,
      );
      const continuityWarnings: VerticalDramaWarning[] =
        [
          ...continuityValidation.quarantinedResolutions.map(quarantine => ({
            quarantine,
            code: "VD_CONTINUITY_ORPHAN_RESOLUTION_QUARANTINED",
          })),
          ...continuityValidation.quarantinedOpenings.map(quarantine => ({
            quarantine,
            code: "VD_CONTINUITY_DUPLICATE_OPENING_QUARANTINED",
          })),
        ].map(({ quarantine, code }) => ({
          code,
          severity: "warning" as const,
          message: quarantine.message,
          targetStage: "storyboard_shotgrid" as const,
          repairable: false,
        }));
      if (!continuityValidation.ok) {
        const errors: RunResult["errors"] = continuityValidation.issues.map(
          issue => ({
            code: "VD_CONTINUITY_GATE_FAILED",
            message: issue.message,
            repairable: true,
          }),
        );
        payload = {
          ...payload,
          continuity_review: {
            status: "needs_repair",
            issues: continuityValidation.issues,
            quarantinedResolutions: continuityValidation.quarantinedResolutions,
            quarantinedOpenings: continuityValidation.quarantinedOpenings,
          },
        };
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          payload,
          [],
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({
            status: "failed",
            nextAction: "repair",
            artifactIds: [String(artifact.id)],
            errors,
            warnings: continuityWarnings,
            updatedAt: new Date(),
          })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        return;
      }

      try {
        const generated = await this.generateRealStoryboard(
          owner,
          episode,
          opts.deepStoryDraftsFlagOn ?? false,
          undefined,
          opts.sceneContractsEnabled ?? false,
          opts.retentionHooksEnabled ?? false,
          opts.motionContractsEnabled ?? false
        );
        payload = { stage, ...generated.storyboard };
        // Persist to the episode's own `storyboard` jsonb column — same
        // tenant/user/series-scoped update pattern as `runStage`'s
        // synchronous override.
        await db
          .update(verticalDramaEpisodes)
          .set({ storyboard: generated.storyboard, updatedAt: new Date() })
          .where(
            and(
              eq(verticalDramaEpisodes.id, owner.episodeId),
              eq(verticalDramaEpisodes.tenantId, owner.tenantId),
              eq(verticalDramaEpisodes.userId, owner.userId),
              eq(verticalDramaEpisodes.seriesId, owner.seriesId)
            )
          );

        // Same best-effort location reconciliation as `runStage`'s
        // synchronous override — see that block's doc comment for why a
        // reconciliation failure must never fail the storyboard stage.
        try {
          const distinctLocationGroups: VerticalDramaStoryboardLocationGroup[] =
            (generated.storyboard.distinct_locations ?? []).map(g => ({
              locationKey: g.location_key,
              locationName: g.location_name,
              description: g.description,
              shotNumbers: g.shot_numbers,
            }));
          const reconciliation = await reconcileEpisodeLocations(
            owner,
            distinctLocationGroups
          );
          const bindingByIncomingIdentity = new Map(
            (reconciliation.locationBindings ?? []).map(binding => [
              `${binding.incomingLocationKey}\u0000${binding.incomingLocationName}`,
              binding.canonicalLocationKey,
            ])
          );
          const canonicalDistinctLocations = (
            generated.storyboard.distinct_locations ?? []
          ).map(group => {
            const canonicalLocationKey = bindingByIncomingIdentity.get(
              `${group.location_key}\u0000${group.location_name}`
            );
            return canonicalLocationKey &&
              canonicalLocationKey !== group.location_key
              ? { ...group, location_key: canonicalLocationKey }
              : group;
          });
          const hasCanonicalKeyChanges = canonicalDistinctLocations.some(
            (group, index) =>
              group !== generated.storyboard.distinct_locations?.[index]
          );
          if (hasCanonicalKeyChanges) {
            const canonicalStoryboard = {
              ...generated.storyboard,
              distinct_locations: canonicalDistinctLocations,
            };
            await db
              .update(verticalDramaEpisodes)
              .set({ storyboard: canonicalStoryboard, updatedAt: new Date() })
              .where(
                and(
                  eq(verticalDramaEpisodes.id, owner.episodeId),
                  eq(verticalDramaEpisodes.tenantId, owner.tenantId),
                  eq(verticalDramaEpisodes.userId, owner.userId),
                  eq(verticalDramaEpisodes.seriesId, owner.seriesId)
                )
              );
            generated.storyboard = canonicalStoryboard;
            payload = { stage, ...canonicalStoryboard };
          }
        } catch (reconcileError) {
          debugError(
            "vd_location_reconciliation",
            `Location reconciliation failed for episode #${owner.episodeId} (series #${owner.seriesId}) after a real storyboard_shotgrid persist — best-effort, does not fail the storyboard stage`,
            reconcileError
          );
        }
      } catch (error) {
        const genError = mapStoryboardGenerationError(error);
        await this.finalizeAsyncStoryboardShotgridRun(
          owner,
          runId,
          stage,
          payload,
          {
            status: "failed",
            next_action: "repair",
            errors: [genError],
            warnings: continuityWarnings,
          }
        );
        return;
      }

      // 1) Schema-validation gate — same as `runStage`'s shared tail.
      const validation = validateStagePayload(
        stage,
        payload,
        opts.sceneContractsEnabled ?? false
      );
      if (!validation.valid) {
        await this.finalizeAsyncStoryboardShotgridRun(
          owner,
          runId,
          stage,
          payload,
          {
            status: "failed",
            next_action: "repair",
            errors: validation.errors,
            warnings: continuityWarnings,
          }
        );
        return;
      }

      // 2)/3) Approval + paid gates are both no-ops for this stage in
      // `runStage`'s shared tail — `storyboard_shotgrid` is not in
      // `VERTICAL_DRAMA_PAID_STAGES`, and `approved` is hardcoded `true` —
      // so that tail always falls through to `status: "succeeded"` /
      // `next_action: "resume_next_stage"` for this stage, reproduced here.
      // 4) Optional QC pass (section 08 seam) — same as `runStage`'s tail.
      let qc: VerticalDramaQcResult | undefined;
      if (this.providerPort.runQc) {
        qc = await this.providerPort.runQc({
          ...owner,
          runId,
          stage,
          mode: opts.mode,
          payload,
        });
      }

      await this.finalizeAsyncStoryboardShotgridRun(
        owner,
        runId,
        stage,
        payload,
        {
          status: "succeeded",
          next_action: "resume_next_stage",
          errors: [],
          warnings: continuityWarnings,
          qc,
          createCheckpoint: true,
        }
      );

      if (clearDownstreamOnSuccess) {
        await clearStoryboardShotgridDownstreamAfterRegenerate(owner);
      }
    } catch (err) {
      // Last-resort safety net (bug #127 hard requirement) — ANY error not
      // already caught above still leaves the row `failed`, never stuck at
      // `queued`/`running` forever.
      await db
        .update(verticalDramaEpisodeRuns)
        .set({
          status: "failed",
          nextAction: "repair",
          errors: [
            {
              code: "VD_STORYBOARD_GENERATION_FAILED",
              message: err instanceof Error ? err.message : String(err),
              repairable: true,
            },
          ],
          updatedAt: new Date(),
        })
        .where(eq(verticalDramaEpisodeRuns.id, runId))
        .catch(updateError => {
          debugError(
            "vd_storyboard_async_job",
            `Failed to mark run #${runId} (episode #${owner.episodeId}) as failed after an unhandled storyboard_shotgrid job error — this row may be stuck at its previous status`,
            updateError
          );
        });
    }
  }

  /**
   * Shared insert-then-UPDATE tail for `runStoryboardShotgridStageJob` —
   * writes the artifact, UPDATEs the pre-created run row (never a fresh
   * insert — the row was already inserted by `submitStoryboardShotgridStage`),
   * and (on success) creates the stage's approval checkpoint. Mirrors
   * `runStage`'s shared post-generation tail (`writeArtifact` + the run-row
   * write + `ensurePendingCheckpoint`) exactly, scoped to this one stage/call
   * site.
   */
  private async finalizeAsyncStoryboardShotgridRun(
    owner: EpisodeRunOwner,
    runId: number,
    stage: VerticalDramaPipelineStage,
    payload: Record<string, unknown>,
    result: {
      status: RunResult["status"];
      next_action: RunResult["next_action"];
      errors: RunResult["errors"];
      warnings: VerticalDramaWarning[];
      qc?: VerticalDramaQcResult;
      createCheckpoint?: boolean;
    }
  ): Promise<void> {
    const artifact = await this.writeArtifact(owner, runId, stage, payload, []);
    const artifactIds = [String(artifact.id)];
    await db
      .update(verticalDramaEpisodeRuns)
      .set({
        status: result.status,
        nextAction: result.next_action,
        artifactIds,
        warnings: result.warnings,
        errors: result.errors,
        updatedAt: new Date(),
      })
      .where(eq(verticalDramaEpisodeRuns.id, runId));

    if (result.createCheckpoint) {
      await this.ensurePendingCheckpoint(owner, runId, stage, artifactIds);
    }
  }

  /**
   * Run stages sequentially from `fromStage` (default first) until a gate is
   * hit: an approval stage that isn't approved, a failed stage, or the end.
   */
  async runEpisode(
    owner: EpisodeRunOwner,
    opts: RunStageOptions & { fromStage?: VerticalDramaPipelineStage }
  ): Promise<{ results: RunResult[]; stoppedAt?: VerticalDramaPipelineStage }> {
    const startIdx = opts.fromStage
      ? Math.max(0, VERTICAL_DRAMA_PIPELINE_STAGES.indexOf(opts.fromStage))
      : 0;
    const results: RunResult[] = [];
    for (let i = startIdx; i < VERTICAL_DRAMA_PIPELINE_STAGES.length; i++) {
      const stage = VERTICAL_DRAMA_PIPELINE_STAGES[i];
      const { result } = await this.runStage(owner, stage, opts);
      results.push(result);
      if (result.status === "approval_required" || result.status === "failed") {
        return { results, stoppedAt: stage };
      }
    }
    return { results };
  }

  /**
   * Repair a stage: writes a NEW superseding artifact/version (never mutating
   * the prior candidate), records the instruction, and returns the downstream
   * stages that are now stale (spec §11.2 immutable repair semantics).
   *
   * REAL repair (2026-07-08 critical fix — placebo-repair bug): for exactly
   * THREE stages — `plan_episode_script`,
   * `storyboard_shotgrid`, `dialogue_audio_plan` — this now invokes the same
   * real LLM generation paths `runStage` uses for the first two
   * (`generateRealScript`/`generateRealStoryboard`), and a newly-wired
   * generator for the third (`generateRealDialogueAudioPlan` — see its doc
   * comment: `runStage` never had a real path for this stage), reframed as a
   * REPAIR: the CURRENT persisted content is passed as the base and
   * `args.instruction` (which already carries the W11.6 "Story Lock"
   * execution-only constraint when that flag is on — see
   * `verticalDramaQualityReviewApply.ts`'s
   * `appendVerticalDramaStoryLockRepairConstraint`) is threaded through as
   * an explicit "apply only this targeted change, preserve everything else"
   * instruction. Before this change, EVERY `repairStage` call — regardless
   * of stage — returned only `buildStagePayload`'s deterministic,
   * no-provider-call placeholder (`mode: "repair"` never altered its
   * output), so a "repair" never actually changed the episode's live
   * `script`/`storyboard`/`dialogueAudioPlan` content; it only wrote a
   * decorative `_repair`-tagged artifact wrapped around the SAME placeholder
   * a dry-run already produces. This is what every consumer funnels
   * through: the manual `repairStageOutput` mutation, the v1
   * `applyQualityReviewSuggestions` single-apply path, and the v2 bounded
   * auto-improve loop (`verticalDramaQualityLoop.ts`'s `effects.repairStage`,
   * including its `tie_in` group, which maps onto a `plan_episode_script`
   * repair call — see `verticalDramaEpisodes.ts`'s
   * `repairVerticalDramaStageWithStoryLockGuard`, which wraps this method
   * for the two story-carrying stages and needs no changes: it only
   * snapshots/re-reads the live `script`/`storyboard` columns before and
   * after calling this method, so it automatically observes REAL repaired
   * content now that this method persists it).
   *
   * Every OTHER stage intentionally KEEPS the deterministic placeholder —
   * they have no real regeneration path plugged in here, either because a
   * targeted free-text-instruction repair does not map cleanly onto that
   * stage's real generation call (e.g. the paid image/video render stages,
   * `start_frame_render_plan`'s planning call, `video_motion_prompt_pack`)
   * or because that stage's real content is authored entirely through its
   * own dedicated UI/mutations, not a free-text instruction. Repairing them
   * for real is out of this fix's scope and left as a documented,
   * per-stage follow-up — not silently reinterpreted here.
   *
   * A real-generation failure (insufficient credits, malformed LLM output, a
   * critically underfilled script — `VdEpisodeUnderfilledError`, a
   * transient provider error) NEVER throws out of `repairStage` — mirrors
   * `runStage`'s catch-and-map convention exactly: the live episode column
   * is left untouched (nothing persisted), a normal `failed`/`repair`
   * `RunResult` is written and returned, and the stage's approval checkpoint
   * / `staleStages` are left alone (nothing was actually repaired). This is
   * what lets `verticalDramaQualityLoop.ts`'s bounded auto-improve loop
   * treat a failed repair as "this round did not help" (it composes the
   * SAME unresolved issues again next round, eventually escalating on
   * `maxAutoImproveRounds`) instead of crashing the whole apply-suggestions
   * mutation — `effects.repairStage`'s contract is `Promise<{
   * storyLockViolated?: boolean } | void>`, which a normal (non-throwing)
   * return always satisfies.
   *
   * `repairStage` always runs in a fixed "repair" runner mode — the method
   * accepts no `mode` argument, so there is no dry_run/plan_only variant of
   * a repair call today; real generation is unconditionally attempted for
   * these 3 stages.
   */
  async repairStage(
    owner: EpisodeRunOwner,
    stage: VerticalDramaPipelineStage,
    args: {
      sourceArtifactId?: string;
      target?: {
        parentShotNumber?: number;
        subShotNumber?: number;
        clipNumber?: number;
      };
      instruction: string;
      subShotFlagOn?: boolean;
      subShotPolicy?: VerticalDramaSubShotPolicy;
      /**
       * Feature 132 §6 (F132C, scene contracts, tenant flag
       * `verticalDramaSceneContracts`, added 2026-07-09) — same
       * router-resolves-the-flag convention as `subShotFlagOn` above (this
       * method has no `RunStageOptions` bag of its own — every feature flag
       * it needs is its own explicit `args` field). Threaded into
       * `generateRealStoryboard`'s `storyboard_shotgrid` branch and into
       * `validateStagePayload` below. Defaults to false, so every existing
       * caller is byte-identical to before this field existed.
       */
      sceneContractsEnabled?: boolean;
      /**
       * Retention hooks (`planning/vertical-drama-retention-hooks/plan.md`
       * W1/W3, tenant flag `verticalDramaRetentionHooks`, added 2026-07-11) —
       * same router-resolves-the-flag convention as `sceneContractsEnabled`
       * above. Threaded into BOTH `generateRealScript`'s
       * `plan_episode_script` repair branch (W1) AND
       * `generateRealStoryboard`'s `storyboard_shotgrid` repair branch (W3)
       * below. Defaults to false, so every existing caller is byte-identical
       * to before this field existed.
       */
      retentionHooksEnabled?: boolean;
      motionContractsEnabled?: boolean;
    }
  ): Promise<RunStageOutcome> {
    const episode = await this.loadEpisode(owner);
    const subShotPolicy =
      args.subShotPolicy ?? VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT;

    let payload = buildStagePayload(stage, {
      episode,
      mode: "repair",
      subShotFlagOn: args.subShotFlagOn ?? false,
      subShotPolicy,
    });

    const buildRepairMetadata = () => ({
      instruction: args.instruction,
      target: args.target ?? null,
      supersedesArtifactId: args.sourceArtifactId ?? null,
      repairedAt: new Date().toISOString(),
    });

    const episodeWhereClause = and(
      eq(verticalDramaEpisodes.id, owner.episodeId),
      eq(verticalDramaEpisodes.tenantId, owner.tenantId),
      eq(verticalDramaEpisodes.userId, owner.userId),
      eq(verticalDramaEpisodes.seriesId, owner.seriesId)
    );

    if (
      stage === "plan_episode_script" ||
      stage === "storyboard_shotgrid" ||
      stage === "dialogue_audio_plan"
    ) {
      try {
        if (stage === "plan_episode_script") {
          const generated = await this.generateRealScript(
            owner,
            episode,
            false,
            args.instruction,
            false,
            false,
            args.retentionHooksEnabled ?? false
          );
          payload = { stage, ...generated.script };
          await db
            .update(verticalDramaEpisodes)
            .set({ script: generated.script, updatedAt: new Date() })
            .where(episodeWhereClause);

          // Series memory — Producer B, repair-mode call site. Same
          // best-effort convention as `runStage`'s fresh-generation override
          // above — a repaired script's memory record should also supersede
          // whatever was recorded before for this episode number.
          try {
            const episodeMemory = resolveScriptEpisodeMemory(
              generated.script,
              episode.episodeNumber
            );
            await upsertEpisodeMemory(
              owner.seriesId,
              owner.tenantId,
              owner.userId,
              episodeMemory
            );
          } catch (memoryError) {
            debugError(
              "vd_series_memory_producer_b",
              `Series memory upsert failed for episode #${owner.episodeId} (series #${owner.seriesId}) after a repaired plan_episode_script persist — best-effort, does not fail the repair`,
              memoryError
            );
          }
        } else if (stage === "storyboard_shotgrid") {
          const generated = await this.generateRealStoryboard(
            owner,
            episode,
            false,
            args.instruction,
            args.sceneContractsEnabled ?? false,
            args.retentionHooksEnabled ?? false,
            args.motionContractsEnabled ?? false
          );
          payload = { stage, ...generated.storyboard };
          await db
            .update(verticalDramaEpisodes)
            .set({ storyboard: generated.storyboard, updatedAt: new Date() })
            .where(episodeWhereClause);
        } else {
          const generated = await this.generateRealDialogueAudioPlan(
            owner,
            episode,
            args.instruction
          );
          payload = { stage, ...generated.plan };
          await db
            .update(verticalDramaEpisodes)
            .set({ dialogueAudioPlan: generated.plan, updatedAt: new Date() })
            .where(episodeWhereClause);
        }
      } catch (error) {
        const genError =
          stage === "plan_episode_script"
            ? mapScriptGenerationError(error)
            : stage === "storyboard_shotgrid"
              ? mapStoryboardGenerationError(error)
              : mapDialogueAudioPlanGenerationError(error);
        const runId = await this.writeRun(owner, stage, "repair", {
          status: "failed",
          next_action: "repair",
          artifactIds: [],
          warnings: [],
          errors: [genError],
        });
        const failurePayload = { ...payload, _repair: buildRepairMetadata() };
        const artifact = await this.writeArtifact(
          owner,
          runId,
          stage,
          failurePayload,
          []
        );
        await db
          .update(verticalDramaEpisodeRuns)
          .set({ artifactIds: [String(artifact.id)] })
          .where(eq(verticalDramaEpisodeRuns.id, runId));
        const result: RunResult = {
          runId: String(runId),
          seriesId: String(owner.seriesId),
          episodeId: String(owner.episodeId),
          stage,
          status: "failed",
          next_action: "repair",
          artifactIds: [String(artifact.id)],
          errors: [genError],
          warnings: [],
        };
        return { runId, result, staleStages: [] };
      }
    }

    // Record the repair instruction + target + supersession lineage on the new
    // version's payload so the prior candidate is preserved and superseded.
    payload._repair = buildRepairMetadata();

    const validation = validateStagePayload(
      stage,
      payload,
      args.sceneContractsEnabled ?? false
    );
    const errors = validation.errors;
    const status: RunResult["status"] = validation.valid
      ? "succeeded"
      : "failed";
    const nextAction: RunResult["next_action"] = validation.valid
      ? "approve"
      : "repair";

    const warnings: VerticalDramaWarning[] = [
      {
        code: "VD_STAGE_REPAIRED",
        severity: "info",
        message: `Stage repaired; downstream stages marked stale.`,
        targetStage: stage,
        repairable: false,
      },
    ];
    // Create the run row FIRST so the artifact FK (runId) is satisfiable.
    const runId = await this.writeRun(owner, stage, "repair", {
      status,
      next_action: nextAction,
      artifactIds: [],
      warnings,
      errors,
    });
    const artifact = await this.writeArtifact(owner, runId, stage, payload, []);
    const artifactIds = [String(artifact.id)];
    await db
      .update(verticalDramaEpisodeRuns)
      .set({ artifactIds })
      .where(eq(verticalDramaEpisodeRuns.id, runId));
    const result: RunResult = {
      runId: String(runId),
      seriesId: String(owner.seriesId),
      episodeId: String(owner.episodeId),
      stage,
      status,
      next_action: nextAction,
      artifactIds,
      errors,
      warnings,
    };

    // Mark the stage's checkpoint repaired + record the repair request id.
    const [checkpoint] = await db
      .select()
      .from(verticalDramaApprovalCheckpoints)
      .where(
        and(
          eq(verticalDramaApprovalCheckpoints.tenantId, owner.tenantId),
          eq(verticalDramaApprovalCheckpoints.seriesId, owner.seriesId),
          eq(verticalDramaApprovalCheckpoints.episodeId, owner.episodeId),
          eq(verticalDramaApprovalCheckpoints.stage, stage)
        )
      )
      .orderBy(desc(verticalDramaApprovalCheckpoints.updatedAt))
      .limit(1);
    if (checkpoint) {
      const prior = (checkpoint.repairRequestIds as string[] | null) ?? [];
      await db
        .update(verticalDramaApprovalCheckpoints)
        .set({
          state: "repaired",
          repairRequestIds: [...prior, String(runId)],
          updatedAt: new Date(),
        })
        .where(eq(verticalDramaApprovalCheckpoints.id, checkpoint.id));
    }

    const staleStages = VerticalDramaEpisodePipeline.downstreamStages(stage);
    return { runId, result: { ...result, runId: String(runId) }, staleStages };
  }

  /** Read the ordered run history for an episode (most recent first). */
  async listEpisodeRuns(
    owner: EpisodeRunOwner,
    limit = 200
  ): Promise<VerticalDramaEpisodeRunRow[]> {
    return db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId)
        )
      )
      .orderBy(
        desc(verticalDramaEpisodeRuns.updatedAt),
        desc(verticalDramaEpisodeRuns.id)
      )
      .limit(limit);
  }

  /** Read the immutable artifact ledger for an episode (chronological). */
  async listEpisodeArtifacts(owner: EpisodeRunOwner) {
    return db
      .select()
      .from(verticalDramaRunArtifacts)
      .where(
        and(
          eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
          eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
          eq(verticalDramaRunArtifacts.episodeId, owner.episodeId)
        )
      )
      .orderBy(
        asc(verticalDramaRunArtifacts.createdAt),
        asc(verticalDramaRunArtifacts.id)
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Bug #127 hardening — stale/orphaned `storyboard_shotgrid` run self-heal    */
/* -------------------------------------------------------------------------- */

/**
 * How long a `storyboard_shotgrid` run may sit at `queued`/`running` without
 * a single row update before it counts as orphaned. A healthy run flips
 * `queued`→`running` within seconds of enqueue and the whole generation
 * finishes well inside provider timeouts (≤10 min); 30 minutes of silence
 * means the BullMQ job behind the row is gone (queue init missing — the
 * runs #496/#501 outage — enqueue failure, or a worker crash with retries
 * disabled: `attempts: 1`).
 */
export const STORYBOARD_SHOTGRID_RUN_STALE_AFTER_MS = 30 * 60 * 1000;

/**
 * Mark one `storyboard_shotgrid` run `failed` — guarded so an already
 * `succeeded`/`failed`/`cancelled` row is never clobbered (only
 * `queued`/`running` rows transition). Returns true when the row was
 * actually transitioned. The error shape mirrors
 * `runStoryboardShotgridStageJob`'s last-resort catch exactly so every
 * consumer of run errors renders these self-heal failures the same way.
 */
export async function markStoryboardShotgridRunFailed(
  runId: number,
  message: string
): Promise<boolean> {
  const updated = await db
    .update(verticalDramaEpisodeRuns)
    .set({
      status: "failed",
      nextAction: "repair",
      errors: [
        { code: "VD_STORYBOARD_GENERATION_FAILED", message, repairable: true },
      ],
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodeRuns.id, runId),
        inArray(verticalDramaEpisodeRuns.status, ["queued", "running"])
      )
    )
    .returning({ id: verticalDramaEpisodeRuns.id });
  return updated.length > 0;
}

/**
 * Orphaned-run sweep (bug #127 hardening): marks every `storyboard_shotgrid`
 * run stuck at `queued`/`running` past the staleness threshold as `failed`,
 * so `submitStoryboardShotgridStage`'s idempotency reuse can never deadlock
 * on a row whose BullMQ job is gone, and the UI stops polling a run nothing
 * will ever finish. Driven by `verticalDramaEpisodeStageJobs.ts`'s
 * interval (which also fires it once at init, so orphans from before a
 * restart — the runs #496/#501 class — heal immediately). Deliberately
 * tenant-unscoped: this is a system janitor over rows that are dead by
 * definition.
 */
export async function sweepStaleStoryboardShotgridRuns(
  staleAfterMs: number = STORYBOARD_SHOTGRID_RUN_STALE_AFTER_MS
): Promise<number[]> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const swept = await db
    .update(verticalDramaEpisodeRuns)
    .set({
      status: "failed",
      nextAction: "repair",
      errors: [
        {
          code: "VD_STORYBOARD_GENERATION_FAILED",
          message: `Run was stuck at queued/running for over ${Math.round(
            staleAfterMs / 60_000
          )} minutes with no progress — swept as failed (the background job behind it was lost; bug #127 hardening). Running the stage again is safe.`,
          repairable: true,
        },
      ],
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaEpisodeRuns.stage, "storyboard_shotgrid"),
        inArray(verticalDramaEpisodeRuns.status, ["queued", "running"]),
        lt(verticalDramaEpisodeRuns.updatedAt, cutoff)
      )
    )
    .returning({ id: verticalDramaEpisodeRuns.id });
  if (swept.length > 0) {
    console.warn(
      `[vd_episode_stage_jobs] Swept ${swept.length} stale storyboard_shotgrid run(s) to 'failed': ${swept
        .map(r => `#${r.id}`)
        .join(", ")}`
    );
  }
  return swept.map(r => r.id);
}

/** Shared singleton wired with the dry-run-safe stub port. */
export const verticalDramaEpisodePipeline = new VerticalDramaEpisodePipeline();
