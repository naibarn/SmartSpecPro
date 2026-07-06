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

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaEpisodes,
  verticalDramaEpisodeRuns,
  verticalDramaRunArtifacts,
  verticalDramaApprovalCheckpoints,
  verticalDramaSeries,
  verticalDramaCharacters,
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
  type RunResult,
  type VerticalDramaPipelineStage,
  type VerticalDramaWarning,
  type VerticalDramaQcResult,
  type VerticalDramaSubShot,
  type VerticalDramaSubShotPolicy,
  type VerticalDramaPromptLanguage,
  type VerticalDramaDialogueLanguage,
  type VerticalDramaThaiAccent,
  normalizeVerticalDramaSeriesLocale,
} from "@shared/verticalDramaSeries";
import { readTargetAudienceRegionFromBible } from "@shared/verticalDramaSeries/targetAudienceRegion";
import {
  verticalDramaSeriesMemoryService,
  type VerticalDramaSeriesMemoryService,
} from "./verticalDramaSeriesMemory";
import {
  generateEpisodeScript,
  InsufficientCreditsError as ScriptInsufficientCreditsError,
  VdSchemaValidationError as ScriptVdSchemaValidationError,
  type ScriptBuilderOutput,
} from "./verticalDramaScriptGeneration";
import {
  generateStoryboardShotgrid,
  InsufficientCreditsError as StoryboardInsufficientCreditsError,
  VdSchemaValidationError as StoryboardVdSchemaValidationError,
  type StoryboardShotgridOutput,
} from "./verticalDramaStoryboardGeneration";
import {
  generateStartFrameRenderPlan,
  InsufficientCreditsError as StartFrameInsufficientCreditsError,
  VdSchemaValidationError as StartFrameVdSchemaValidationError,
  type StartFrameRenderPlanProjection,
} from "./verticalDramaStartFrameGeneration";
import {
  generateVideoMotionPromptPack,
  syncDialogueOntoMotionPromptClips,
  syncStartFramesOntoMotionPromptClips,
  InsufficientCreditsError as MotionPromptInsufficientCreditsError,
  VdSchemaValidationError as MotionPromptVdSchemaValidationError,
  type VideoMotionPromptPackProjection,
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
import {
  extractShotProductPlacements,
  findPlacementForShot,
  appendProductPresenceDirective,
  resolveProductReferenceImageUrls,
  resolveMarketplaceCaptureProductImageUrls,
  resolveFrameProductReferenceAssetIds,
} from "./verticalDramaProductTieIn";

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

/** Stable machine-readable error code for a schema-validation failure (spec §11.5). */
export const VD_SCHEMA_VALIDATION_FAILED = "VD_SCHEMA_VALIDATION_FAILED";

/**
 * Map a `generateEpisodeScript` failure to a `RunResult` error — mirrors
 * `mapStoryboardGenerationError` exactly. Never throws.
 */
function mapScriptGenerationError(
  error: unknown
): RunResult["errors"][number] {
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
function mapMemoryPlanningError(
  error: unknown
): RunResult["errors"][number] {
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
        structure: { mode: "beat", acts: [], beats: [{ beat: "setup", description: "placeholder" }] },
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

/** Schema-shape validation gate (spec §11.5 failed-validation rule). */
export function validateStagePayload(
  stage: VerticalDramaPipelineStage,
  payload: Record<string, unknown>
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

/* -------------------------------------------------------------------------- */
/* The pipeline runner                                                        */
/* -------------------------------------------------------------------------- */

export interface RunStageOptions {
  mode: VerticalDramaRunnerMode;
  subShotFlagOn?: boolean;
  subShotPolicy?: VerticalDramaSubShotPolicy;
  idempotencyKey?: string;
}

export interface RunStageOutcome {
  runId: number;
  result: RunResult;
  /** Downstream stages that became stale (empty unless this was a repair). */
  staleStages: VerticalDramaPipelineStage[];
  /** The pending checkpoint just created, when `result.next_action === "approve"`. */
  checkpointId?: number;
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

  private async writeRun(
    owner: EpisodeRunOwner,
    stage: VerticalDramaPipelineStage,
    mode: VerticalDramaRunnerMode,
    result: Pick<
      RunResult,
      "status" | "next_action" | "artifactIds" | "warnings" | "errors"
    >
  ): Promise<number> {
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
   * Only called from `runStage` for `plan_episode_script` when the mode is
   * not dry_run/plan_only.
   */
  private async generateRealScript(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow
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
    const rawProductTieIn = (seriesRow?.productTieIn as Record<string, unknown> | null) ?? null;
    const productTieIn =
      rawProductTieIn?.enabled === true
        ? {
            enabled: true,
            productName:
              typeof rawProductTieIn.productName === "string" ? rawProductTieIn.productName : undefined,
            productDescription:
              typeof rawProductTieIn.productDescription === "string"
                ? rawProductTieIn.productDescription
                : undefined,
            allowedStoryFunctions: Array.isArray(rawProductTieIn.allowedStoryFunctions)
              ? (rawProductTieIn.allowedStoryFunctions as string[])
              : undefined,
            forbiddenClaims: Array.isArray(rawProductTieIn.forbiddenClaims)
              ? (rawProductTieIn.forbiddenClaims as string[])
              : undefined,
          }
        : undefined;

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
      dialoguePlan: episode.dialogueAudioPlan as Record<
        string,
        unknown
      > | null,
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
  private async syncCharacterVisualBible(
    owner: EpisodeRunOwner
  ): Promise<{
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
   * (series bible/locale/tone + the character roster) and invoke it. Only
   * called from `runStage` for `storyboard_shotgrid` when the mode is not
   * dry_run/plan_only.
   */
  private async generateRealStoryboard(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow
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

    const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? null;
    const episodeBreakdown = Array.isArray(bible?.episodeBreakdown)
      ? (bible!.episodeBreakdown as Array<Record<string, unknown>>)
      : [];
    const matchingBreakdown = episodeBreakdown.find(
      item => Number(item.episodeNumber) === episode.episodeNumber
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

    return generateStoryboardShotgrid({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeTitle: episode.title ?? `Episode ${episode.episodeNumber}`,
      episodeNumber: episode.episodeNumber,
      locale: normalizeVerticalDramaSeriesLocale(seriesRow?.locale),
      durationSeconds: episode.targetDurationSeconds ?? 60,
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
      sceneBeats: sceneBeats.length > 0 ? sceneBeats : undefined,
      characters: characterRows.map(
        (
          c: { characterKey: string; name: string; role: string | null },
          i: number
        ) => ({
          characterId: c.characterKey,
          name: c.name,
          role: c.role,
          referenceImageUrl: referenceImageUrls[i],
        })
      ),
    });
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

    // Series-level target-audience region default (2026-07-06 quality
    // upgrade) — read the series' `bible.targetAudienceRegion` so every
    // rendered start-frame person defaults to the series' configured
    // region/ethnicity look unless a character's own description overrides it.
    const [seriesRow] = await db
      .select({ bible: verticalDramaSeries.bible })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId)
        )
      )
      .limit(1);
    const targetAudienceRegion = readTargetAudienceRegionFromBible(
      (seriesRow?.bible as Record<string, unknown> | null) ?? null
    );

    return generateStartFrameRenderPlan({
      userId: owner.userId,
      tenantId: owner.tenantId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      episodeTitle: episode.title ?? `Episode ${episode.episodeNumber}`,
      durationSeconds: episode.targetDurationSeconds ?? 60,
      selectedImageModelId: existingSelectedImageModelId,
      targetAudienceRegion,
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
        const characterIds = Array.isArray(s.required_character_refs) && s.required_character_refs.length
          ? (s.required_character_refs as string[])
          : Array.isArray(s.characters) && s.characters.length
            ? (s.characters as string[])
            : Array.isArray(s.characterIds)
              ? (s.characterIds as string[])
              : [];
        return {
          shotNumber: Number(s.shotNumber ?? s.shot_number ?? 0),
          description: String(s.description ?? s.visual_description ?? ""),
          cameraSetup,
          characterIds,
          durationSeconds: Number(s.durationSeconds ?? s.duration_seconds ?? 0),
        };
      }),
    });
  }

  /**
   * Build the `generateVideoMotionPromptPack` params from the episode's own
   * `storyboard` jsonb column and invoke it. Only called from `runStage` for
   * `video_motion_prompt_pack` when the mode is not dry_run/plan_only.
   */
  private async generateRealMotionPromptPack(
    owner: EpisodeRunOwner,
    episode: VerticalDramaEpisodeRow
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
      promptLanguage: existingLanguagePlan?.promptLanguage,
      dialogueLanguage: existingLanguagePlan?.dialogueLanguage,
      thaiAccent: existingLanguagePlan?.thaiAccent,
      storyboardShots: shots.map(s => ({
        shotNumber: Number(s.shotNumber ?? s.shot_number ?? 0),
        description: String(s.description ?? s.visual_description ?? ""),
        durationSeconds: Number(s.durationSeconds ?? s.duration_seconds ?? 0),
        dialogueExcerpt:
          typeof s.dialogue_excerpt === "string" && s.dialogue_excerpt
            ? s.dialogue_excerpt
            : typeof s.subtitle_text === "string"
              ? s.subtitle_text
              : undefined,
      })),
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
        state: "pending",
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
  ): Promise<{ checkpoint: VerticalDramaApprovalCheckpointRow; alreadyTerminal: boolean } | null> {
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
    } else {
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "failed", nextAction: "repair", updatedAt: new Date() })
        .where(eq(verticalDramaEpisodeRuns.id, checkpoint.runId));
    }

    return { checkpoint: row as VerticalDramaApprovalCheckpointRow, alreadyTerminal: false };
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

    let payload = buildStagePayload(stage, {
      episode,
      mode,
      subShotFlagOn,
      subShotPolicy,
      memoryBundle,
    });

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
        const generated = await this.generateRealScript(owner, episode);
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
      } catch (error) {
        const genError = mapScriptGenerationError(error);
        const runId = await this.writeRun(owner, stage, mode, {
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
        .filter((c) => c.has_approved_portrait)
        .map((c) => c.character_id);
      payload = {
        stage,
        mediaAssetIds,
        approved: synced.characters.length > 0 && mediaAssetIds.length === synced.characters.length,
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
        const generated = await this.generateRealStoryboard(owner, episode);
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
      } catch (error) {
        const genError = mapStoryboardGenerationError(error);
        const runId = await this.writeRun(owner, stage, mode, {
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
        const scriptPayload = (episode.script as Record<string, unknown> | null) ?? null;
        const placements = extractShotProductPlacements(scriptPayload?.product_tie_in_plan);
        let framesWithTieIn = generated.plan.frames;
        if (placements.length > 0) {
          const [tieInSeriesRow] = await db
            .select({ productTieIn: verticalDramaSeries.productTieIn })
            .from(verticalDramaSeries)
            .where(
              and(
                eq(verticalDramaSeries.id, owner.seriesId),
                eq(verticalDramaSeries.tenantId, owner.tenantId),
                eq(verticalDramaSeries.userId, owner.userId),
              ),
            )
            .limit(1);
          const rawProductTieIn =
            (tieInSeriesRow?.productTieIn as Record<string, unknown> | null) ?? null;
          const productName =
            typeof rawProductTieIn?.productName === "string" ? rawProductTieIn.productName : undefined;
          const productImageUrl =
            typeof rawProductTieIn?.productImageUrl === "string" && rawProductTieIn.productImageUrl
              ? rawProductTieIn.productImageUrl
              : undefined;
          const marketplaceCaptureId =
            typeof rawProductTieIn?.marketplaceCaptureId === "string" && rawProductTieIn.marketplaceCaptureId
              ? rawProductTieIn.marketplaceCaptureId
              : undefined;
          // Brand-neutral category descriptor (Thai ad-compliance + video-
          // policy guard) — e.g. "cosmetics" -> reads as "the cosmetics shown
          // in the reference image" via `buildGenericProductDescriptor`.
          // Falls back to the generic reference-image phrasing when absent.
          const productCategoryDescriptor =
            typeof rawProductTieIn?.productCategory === "string" && rawProductTieIn.productCategory
              ? rawProductTieIn.productCategory
              : undefined;
          // Marketplace Capture's selected/best product images (read-only,
          // tenant/user-scoped) — graceful no-op ([]) when the capture is
          // missing, inaccessible, or has no images; falls back to the
          // series' own `productImageUrl` via `resolveProductReferenceImageUrls`.
          const captureSelectedImageUrls = await resolveMarketplaceCaptureProductImageUrls(
            marketplaceCaptureId,
            { userId: owner.userId, tenantId: owner.tenantId },
          );
          const productRefUrls = resolveProductReferenceImageUrls({
            productImageUrl,
            captureSelectedImageUrls,
          });

          framesWithTieIn = generated.plan.frames.map((frame) => {
            const placement = findPlacementForShot(placements, frame.shotNumber);
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
                existingProductReferenceAssetIds: frame.productReferenceAssetIds,
                productRefsCustomized: frame.productRefsCustomized,
                resolvedProductRefUrls: productRefUrls,
              }),
              imagePrompt: appendProductPresenceDirective(
                frame.imagePrompt,
                productName,
                placement,
                productCategoryDescriptor,
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
            framesWithTieIn.map(async (frame) => {
              const qc = await ensurePromptWithinLimit({
                kind: "image",
                prompt: frame.imagePrompt,
                userId: owner.userId,
                tenantId: owner.tenantId,
                idempotencyKey: `${owner.episodeId}:start_frame_render_plan:${frame.shotNumber}`,
                label: `start-frame prompt (shot ${frame.shotNumber})`,
              });
              return { ...frame, imagePrompt: qc.prompt };
            }),
          ),
        };
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
        const runId = await this.writeRun(owner, stage, mode, {
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
    // `render_or_import_video_clips`). The existing sub-shot expansion
    // (`planSubShots`) below is left untouched: when the sub-shot flag is on,
    // it still re-derives `clips` from the (now real) base storyboard shots,
    // so this override only replaces the base clips/model/mode fields before
    // that expansion runs. A generation failure never throws out of
    // `runStage` — same failed/repair convention as above.
    if (stage === "video_motion_prompt_pack" && paidModeAllowed) {
      try {
        const generated = await this.generateRealMotionPromptPack(
          owner,
          episode
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
            generated.pack.clips.map(async (clip) => {
              const qc = await ensurePromptWithinLimit({
                kind: "video",
                prompt: clip.prompt,
                userId: owner.userId,
                tenantId: owner.tenantId,
                idempotencyKey: `${owner.episodeId}:video_motion_prompt_pack:${clip.clipNumber}`,
                label: `motion prompt (clip ${clip.clipNumber})`,
              });
              return { ...clip, prompt: qc.prompt };
            }),
          ),
        };
        payload = { stage, ...generated.pack, warnings: [] };
        if (subShotFlagOn && subShotPolicy.enabled) {
          const storyboard = buildStoryboard(
            episode.targetDurationSeconds ?? 60
          );
          const plan = planSubShots(storyboard.shots, subShotPolicy);
          payload.sub_shot_plan = plan;
          payload.clips = plan.shots.flatMap(ps =>
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
        // Persist to the episode's own `motionPromptPack` jsonb column.
        await db
          .update(verticalDramaEpisodes)
          .set({ motionPromptPack: generated.pack, updatedAt: new Date() })
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
        const runId = await this.writeRun(owner, stage, mode, {
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
        const runId = await this.writeRun(owner, stage, mode, {
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
        const runId = await this.writeRun(owner, stage, mode, {
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
    const validation = validateStagePayload(stage, payload);
    if (!validation.valid) {
      // Create the run row FIRST so the artifact FK (runId) is satisfiable.
      const runId = await this.writeRun(owner, stage, mode, {
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

    const warnings: VerticalDramaWarning[] = [];
    const errors: RunResult["errors"] = [];
    let status: RunResult["status"] = "succeeded";
    let nextAction: RunResult["next_action"] = "resume_next_stage";
    let mediaAssetIds: number[] = [];
    let qc: VerticalDramaQcResult | undefined;

    // 2) Approval gate — approval stages block advancement until approved.
    const requiresApproval = VERTICAL_DRAMA_APPROVAL_STAGES.has(stage);
    const approved = requiresApproval
      ? await isStageApproved(owner, stage)
      : true;

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
    const runId = await this.writeRun(owner, stage, mode, {
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

    let checkpointId: number | undefined;
    if (requiresApproval && !approved) {
      checkpointId = await this.ensurePendingCheckpoint(owner, runId, stage, artifactIds);
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
    }
  ): Promise<RunStageOutcome> {
    const episode = await this.loadEpisode(owner);
    const subShotPolicy =
      args.subShotPolicy ?? VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT;

    const payload = buildStagePayload(stage, {
      episode,
      mode: "repair",
      subShotFlagOn: args.subShotFlagOn ?? false,
      subShotPolicy,
    });
    // Record the repair instruction + target + supersession lineage on the new
    // version's payload so the prior candidate is preserved and superseded.
    payload._repair = {
      instruction: args.instruction,
      target: args.target ?? null,
      supersedesArtifactId: args.sourceArtifactId ?? null,
      repairedAt: new Date().toISOString(),
    };

    const validation = validateStagePayload(stage, payload);
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

/** Shared singleton wired with the dry-run-safe stub port. */
export const verticalDramaEpisodePipeline = new VerticalDramaEpisodePipeline();
