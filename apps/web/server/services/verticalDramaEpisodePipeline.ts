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
  type VerticalDramaEpisodeRow,
  type VerticalDramaRunArtifactRow,
  type VerticalDramaEpisodeRunRow,
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
} from "@shared/verticalDramaSeries";
import {
  verticalDramaSeriesMemoryService,
  type VerticalDramaSeriesMemoryService,
} from "./verticalDramaSeriesMemory";

/* -------------------------------------------------------------------------- */
/* Canonical stage sequence + phase grouping (spec §11.5 / §16)               */
/* -------------------------------------------------------------------------- */

/** The canonical, ordered 15-stage sequence — the single source of truth. */
export const VERTICAL_DRAMA_PIPELINE_STAGES: readonly VerticalDramaPipelineStage[] = [
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

export type VerticalDramaPhaseId = "plan" | "frames" | "prompt_handoff" | "generate_assemble";

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
export function phaseForStage(stage: VerticalDramaPipelineStage): VerticalDramaPhase {
  const phase = VERTICAL_DRAMA_PHASES.find((p) => p.stages.includes(stage));
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
export type VerticalDramaRunnerMode = (typeof VERTICAL_DRAMA_RUNNER_MODES)[number];

/**
 * Stages that persist an approval checkpoint and MUST be approved before the
 * sequence advances past them (spec §11.2 — the 12 approval checkpoints).
 */
export const VERTICAL_DRAMA_APPROVAL_STAGES: ReadonlySet<VerticalDramaPipelineStage> = new Set([
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
export const VERTICAL_DRAMA_PAID_STAGES: ReadonlySet<VerticalDramaPipelineStage> = new Set([
  "render_or_import_start_frames",
  "render_or_import_video_clips",
]);

/** Stable machine-readable error code for a schema-validation failure (spec §11.5). */
export const VD_SCHEMA_VALIDATION_FAILED = "VD_SCHEMA_VALIDATION_FAILED";

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
  routeAndRenderStage(req: ProviderRoutingStageRequest): Promise<ProviderRoutingStageResult>;
  /** Optional QC pass over a stage's artifact. Stub returns undefined. */
  runQc?(req: ProviderRoutingStageRequest): Promise<VerticalDramaQcResult | undefined>;
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
export function splitDurations(total: number, count: number, floor: number): number[] {
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
  policy: VerticalDramaSubShotPolicy,
): SubShotPlan {
  const plannedShots: SubShotPlan["shots"] = [];
  const validationErrors: string[] = [];
  const blockingReasons: string[] = [];

  for (const shot of shots) {
    const count =
      policy.mode === "fixed"
        ? Math.max(1, Math.min(policy.targetPerShot, policy.maxPerShot))
        : computeAutoSubShotCount(shot.durationSeconds, policy);
    const durations = splitDurations(shot.durationSeconds, count, policy.minSubShotSeconds);
    const subShots: VerticalDramaSubShot[] = durations.map((durationSeconds, idx) => ({
      subShotNumber: idx + 1,
      parentShotNumber: shot.shotNumber,
      durationSeconds,
      cameraSetup: `sub-cut ${idx + 1}: reframe within shot ${shot.shotNumber}`,
      prompt: `Sub-shot ${idx + 1} of shot ${shot.shotNumber} (dry-run placeholder)`,
      transitionIn: idx === 0 ? "cut" : "match_cut",
      status: "planned",
    }));

    const validation = validateSubShotsForParent(shot.durationSeconds, subShots, policy);
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
  ctx: StageBuildContext,
): Record<string, unknown> {
  const dur = ctx.episode.targetDurationSeconds ?? 60;
  switch (stage) {
    case "normalize_series_input":
      return { stage, seriesId: String(ctx.episode.seriesId), memoryBundle: ctx.memoryBundle ?? null };
    case "plan_episode_script":
      return {
        stage,
        episodeTitle: ctx.episode.title ?? `Episode ${ctx.episode.episodeNumber}`,
        hook: "Dry-run hook",
        structure: [{ beat: "setup", description: "placeholder" }],
        sceneDialogueSummary: "placeholder",
        characterStateDeltas: [],
        continuityNotes: [],
        warnings: [],
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
        frames: buildStoryboard(dur).shots.map((s) => ({
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
        subtitleSafeArea: { position: "bottom_safe", maxLines: 2, avoidFaceArea: true },
        warnings: [],
      };
    case "video_motion_prompt_pack": {
      const storyboard = buildStoryboard(dur);
      const base: Record<string, unknown> = {
        stage,
        selectedVideoModelId: "dry-run-video-model",
        durationProfileId: ctx.episode.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: storyboard.shots.map((s) => ({
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
        base.clips = plan.shots.flatMap((ps) =>
          ps.subShots.map((ss) => ({
            clipNumber: ps.parentShotNumber * 100 + ss.subShotNumber,
            sourceShotNumbers: [ps.parentShotNumber],
            prompt: ss.prompt,
            durationSeconds: ss.durationSeconds,
            parentShotNumber: ps.parentShotNumber,
            subShotNumber: ss.subShotNumber,
          })),
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
      return { stage, durationProfileId: ctx.episode.durationProfileId, totalDurationSeconds: dur, clips: [] };
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
  payload: Record<string, unknown>,
): StageValidationResult {
  const errors: RunResult["errors"] = [];
  const fail = (message: string) =>
    errors.push({ code: VD_SCHEMA_VALIDATION_FAILED, message, repairable: true });

  if (stage === "storyboard_shotgrid") {
    const shots = (payload.shots as unknown[]) ?? [];
    if (shots.length !== 9) fail(`storyboard must have exactly 9 shots, got ${shots.length}`);
  }
  if (stage === "plan_episode_script") {
    if (!payload.episodeTitle) fail("script is missing episodeTitle");
  }
  if (stage === "video_motion_prompt_pack" && payload.sub_shot_plan) {
    const plan = payload.sub_shot_plan as SubShotPlan;
    if (!plan.valid) fail(`sub_shot_plan invalid: ${plan.validationErrors.join("; ")}`);
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
  stage: VerticalDramaPipelineStage,
): Promise<boolean> {
  const rows = await db
    .select({ state: verticalDramaApprovalCheckpoints.state })
    .from(verticalDramaApprovalCheckpoints)
    .where(
      and(
        eq(verticalDramaApprovalCheckpoints.tenantId, owner.tenantId),
        eq(verticalDramaApprovalCheckpoints.seriesId, owner.seriesId),
        eq(verticalDramaApprovalCheckpoints.episodeId, owner.episodeId),
        eq(verticalDramaApprovalCheckpoints.stage, stage),
      ),
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
}

export class VerticalDramaEpisodePipeline {
  constructor(
    private readonly providerPort: ProviderRoutingPort = createStubProviderRoutingPort(),
    private readonly memoryService: VerticalDramaSeriesMemoryService = verticalDramaSeriesMemoryService,
  ) {}

  /** Downstream stages after `stage` in the canonical sequence. */
  static downstreamStages(stage: VerticalDramaPipelineStage): VerticalDramaPipelineStage[] {
    const i = VERTICAL_DRAMA_PIPELINE_STAGES.indexOf(stage);
    return i < 0 ? [] : VERTICAL_DRAMA_PIPELINE_STAGES.slice(i + 1);
  }

  private async loadEpisode(owner: EpisodeRunOwner): Promise<VerticalDramaEpisodeRow> {
    const [row] = await db
      .select()
      .from(verticalDramaEpisodes)
      .where(
        and(
          eq(verticalDramaEpisodes.id, owner.episodeId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
          eq(verticalDramaEpisodes.userId, owner.userId),
          eq(verticalDramaEpisodes.seriesId, owner.seriesId),
        ),
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
    mediaAssetIds: number[],
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
    result: Pick<RunResult, "status" | "next_action" | "artifactIds" | "warnings" | "errors">,
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

  private async ensurePendingCheckpoint(
    owner: EpisodeRunOwner,
    runId: number,
    stage: VerticalDramaPipelineStage,
    sourceArtifactIds: string[],
  ): Promise<void> {
    await db.insert(verticalDramaApprovalCheckpoints).values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
      runId,
      stage,
      state: "pending",
      sourceArtifactIds,
      repairRequestIds: [],
    });
  }

  /**
   * Run a single stage. Persists a run row + artifact-ledger row, gates paid
   * generation behind approval + non-dry modes, and returns the `RunResult`.
   */
  async runStage(
    owner: EpisodeRunOwner,
    stage: VerticalDramaPipelineStage,
    opts: RunStageOptions,
  ): Promise<RunStageOutcome> {
    const episode = await this.loadEpisode(owner);
    const mode = opts.mode;
    const subShotPolicy = opts.subShotPolicy ?? VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT;
    const subShotFlagOn = opts.subShotFlagOn ?? false;

    let memoryBundle: unknown;
    if (stage === "normalize_series_input") {
      memoryBundle = await this.memoryService.buildEpisodeMemoryBundle(
        { tenantId: owner.tenantId, userId: owner.userId, seriesId: owner.seriesId },
        episode.episodeNumber,
      );
    }

    const payload = buildStagePayload(stage, {
      episode,
      mode,
      subShotFlagOn,
      subShotPolicy,
      memoryBundle,
    });

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
      const artifact = await this.writeArtifact(owner, runId, stage, payload, []);
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
    const approved = requiresApproval ? await isStageApproved(owner, stage) : true;

    // 3) Paid gate — paid stages never run in dry-run/plan-only or before approval.
    const isPaid = VERTICAL_DRAMA_PAID_STAGES.has(stage);
    const paidModeAllowed =
      mode === "full" ||
      mode === "render_images" ||
      mode === "render_video" ||
      mode === "repair";

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
      qc = await this.providerPort.runQc({ ...owner, runId: 0, stage, mode, payload });
    }

    // Create the run row FIRST so the artifact FK (runId) is satisfiable.
    const runId = await this.writeRun(owner, stage, mode, {
      status,
      next_action: nextAction,
      artifactIds: [],
      warnings,
      errors,
    });
    const artifact = await this.writeArtifact(owner, runId, stage, payload, mediaAssetIds);
    const artifactIds = [String(artifact.id)];
    await db
      .update(verticalDramaEpisodeRuns)
      .set({ artifactIds })
      .where(eq(verticalDramaEpisodeRuns.id, runId));

    if (requiresApproval && !approved) {
      await this.ensurePendingCheckpoint(owner, runId, stage, artifactIds);
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
    return { runId, result, staleStages: [] };
  }

  /**
   * Run stages sequentially from `fromStage` (default first) until a gate is
   * hit: an approval stage that isn't approved, a failed stage, or the end.
   */
  async runEpisode(
    owner: EpisodeRunOwner,
    opts: RunStageOptions & { fromStage?: VerticalDramaPipelineStage },
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
      target?: { parentShotNumber?: number; subShotNumber?: number; clipNumber?: number };
      instruction: string;
      subShotFlagOn?: boolean;
      subShotPolicy?: VerticalDramaSubShotPolicy;
    },
  ): Promise<RunStageOutcome> {
    const episode = await this.loadEpisode(owner);
    const subShotPolicy = args.subShotPolicy ?? VERTICAL_DRAMA_SUB_SHOT_POLICY_DEFAULT;

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
    const status: RunResult["status"] = validation.valid ? "succeeded" : "failed";
    const nextAction: RunResult["next_action"] = validation.valid ? "approve" : "repair";

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
          eq(verticalDramaApprovalCheckpoints.stage, stage),
        ),
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
    limit = 200,
  ): Promise<VerticalDramaEpisodeRunRow[]> {
    return db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        ),
      )
      .orderBy(desc(verticalDramaEpisodeRuns.updatedAt), desc(verticalDramaEpisodeRuns.id))
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
          eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
        ),
      )
      .orderBy(asc(verticalDramaRunArtifacts.createdAt), asc(verticalDramaRunArtifacts.id));
  }
}

/** Shared singleton wired with the dry-run-safe stub port. */
export const verticalDramaEpisodePipeline = new VerticalDramaEpisodePipeline();
