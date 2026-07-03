/**
 * Vertical Drama Series — Storyboard Review handoff service (spec feature 131, §12).
 *
 * Turns an APPROVED episode plan (the JSONB stage payloads on a
 * `verticalDramaEpisodes` row) into an idempotent Storyboard Review project
 * (`media_studio_storyboard_reviews`). The handoff:
 *
 *   1. Computes a deterministic `episodePlanHash` over the approved plan.
 *   2. Builds the idempotency key
 *      `vertical-drama:<seriesId>:episode:<episodeId>:handoff:<episodePlanHash>`.
 *   3. Maps each clip (or sub-shot, when decomposed) to ONE ordered review task
 *      carrying the full vertical-drama lineage in `extraParams`.
 *   4. Creates ONE review per approved plan and REOPENS the existing review when
 *      the same key recurs (unchanged plan) instead of duplicating.
 *
 * Ownership is `userId`-scoped (`media_studio_storyboard_reviews` has no
 * `tenantId`). The caller MUST first assert the source series/episode belongs to
 * the acting user + tenant; `createVerticalDramaStoryboardHandoff` re-checks the
 * episode row it is given.
 */

import type { DrizzleDB } from "../db";
import {
  verticalDramaEpisodes,
  mediaStudioStoryboardReviews,
  type VerticalDramaEpisodeRow,
} from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import {
  buildVerticalDramaHandoffKey,
  type VerticalDramaTaskExtraParams,
} from "../../shared/verticalDramaSeries/storyboardHandoff";
import { artifactChecksumSha256 } from "../../shared/verticalDramaSeries/artifacts";

/* -------------------------------------------------------------------------- */
/* Loosely-typed views over the approved plan JSONB columns.                  */
/* The stage payloads are stored as untyped `jsonb`, so we read them          */
/* defensively — every field is optional and validated at use.               */
/* -------------------------------------------------------------------------- */

type MotionMode = VerticalDramaTaskExtraParams["motionMode"];
type FrameRole = VerticalDramaTaskExtraParams["referenceFrameRoles"][number];
type SubShotTransition = NonNullable<VerticalDramaTaskExtraParams["subShotTransitionIn"]>;

export interface ApprovedEpisodePlan {
  script?: unknown;
  storyboard?: unknown;
  startFramePlan?: unknown;
  motionPromptPack?: unknown;
  dialogueAudioPlan?: unknown;
  /** Back-filled at assembly; intentionally EXCLUDED from the plan hash. */
  assemblyManifest?: unknown;
}

interface MotionClip {
  clipNumber?: number;
  shotNumber?: number;
  parentShotNumber?: number;
  prompt?: string;
  durationSeconds?: number;
  startFrameAssetId?: string;
  endFrameAssetId?: string;
  negativeMotionPrompt?: string;
}

interface SubShotPlanEntry {
  parentShotNumber: number;
  subShots: Array<{
    subShotNumber: number;
    durationSeconds?: number;
    cameraSetup?: string;
    prompt?: string;
    negativeMotionPrompt?: string;
    transitionIn?: SubShotTransition;
    startFrameAssetId?: string;
    endFrameAssetId?: string;
  }>;
}

/** Read-only image-side prompt lineage surfaced (never as the video prompt). */
export interface ShotImagePromptLineage {
  shotNumber: number;
  contactSheetPrompt?: string;
  cellPrompts?: string[];
  negativePrompt?: string;
  contactSheetIds: string[];
  candidateFrameAssetIds: string[];
  selectedStartFrameCandidateId?: string;
  promptSetId?: string;
}

/* -------------------------------------------------------------------------- */
/* Task + reviewData shapes.                                                  */
/* -------------------------------------------------------------------------- */

export interface HandoffReferenceImage {
  url: string;
  assetId?: string;
  role: FrameRole;
}

export interface VideoPromptEdit {
  editedByUserId: number;
  editedAt: number;
  /** The prompt text BEFORE this edit (append-only audit trail). */
  original: string;
}

export interface VerticalDramaHandoffTask {
  id: string;
  /** VIDEO / motion prompt ONLY — never image prompts, overlays, or metadata. */
  prompt: string;
  durationSeconds: number;
  status: "planned";
  storyboardContext: {
    referenceImages: HandoffReferenceImage[];
    referenceFrameRoles: FrameRole[];
    /** Read-only image-side prompts + candidate lineage for this shot. */
    imagePrompts?: ShotImagePromptLineage;
  };
  videoSegmentState: {
    videoSegmentPlan: {
      referenceMode: "start_stop" | "first_frame" | "prompt_only";
      startFrameAssetId?: string;
      endFrameAssetId?: string;
    };
    staleTaskIds: string[];
    staleReason: string | null;
  };
  extraParams: VerticalDramaTaskExtraParams;
  companionAudio: unknown[];
  companionAudioUpdatedAt: number | null;
  voiceoverFullScript: string | null;
  /** Append-only edit history for the editable video/motion prompt. */
  promptEditHistory: VideoPromptEdit[];
}

export interface VerticalDramaReviewData {
  source: "vertical_drama_series";
  sourceSurface: "vertical_drama_series";
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  episodePlanHash: string;
  idempotencyKey: string;
  motionMode: MotionMode;
  backlink: { seriesId: string; episodeId: string; episodeNumber: number };
  imagePromptsByShot: ShotImagePromptLineage[];
  subShotBreakdownByShot: Array<{
    parentShotNumber: number;
    subShotCount: number;
    subShots: Array<{
      subShotNumber: number;
      cameraSetup?: string;
      durationSeconds: number;
      transitionIn: SubShotTransition;
      prompt: string;
    }>;
  }>;
  providerPayloadPreview: Record<string, unknown>;
  qcRecommendedRepairs: unknown[];
  voiceCasting: unknown;
  subtitleSafeArea: unknown;
  audioStrategy: string | null;
  continuityWarnings: string[];
  tasks: VerticalDramaHandoffTask[];
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Small defensive readers.                                                   */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/* -------------------------------------------------------------------------- */
/* 1. episodePlanHash — deterministic over the approved plan.                 */
/* -------------------------------------------------------------------------- */

/**
 * Stable hash of the APPROVED episode plan. Structurally-identical plans (any
 * key order) hash identically. `assemblyManifest` is intentionally excluded — it
 * is back-filled later at assembly and must NOT change the handoff identity.
 */
export function computeEpisodePlanHash(plan: ApprovedEpisodePlan): string {
  return artifactChecksumSha256({
    script: plan.script ?? null,
    storyboard: plan.storyboard ?? null,
    startFramePlan: plan.startFramePlan ?? null,
    motionPromptPack: plan.motionPromptPack ?? null,
    dialogueAudioPlan: plan.dialogueAudioPlan ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/* 2. Idempotency decision.                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Decide whether a recurring handoff should REOPEN the existing review or CREATE
 * a new one. Same key (unchanged approved plan) → reopen; a changed plan
 * (new `episodePlanHash`, hence new key) → create.
 */
export function decideHandoffAction(params: {
  existingReviewData: unknown;
  newKey: string;
}): "reopen" | "create" {
  const existingKey = asString(asRecord(params.existingReviewData).idempotencyKey);
  return existingKey && existingKey === params.newKey ? "reopen" : "create";
}

/* -------------------------------------------------------------------------- */
/* 3. Build tasks + reviewData (pure).                                        */
/* -------------------------------------------------------------------------- */

export interface BuildHandoffInput {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  durationProfileId: string;
  motionMode: MotionMode;
  imageModelId: string;
  videoModelId: string;
  plan: ApprovedEpisodePlan;
  subShotsEnabled: boolean;

  /** Per-shot lineage (keyed by storyboard shot number). */
  characterReferenceAssetIdsByShot?: Record<number, string[]>;
  productReferenceAssetIdsByShot?: Record<number, string[]>;
  contactSheetIdsByShot?: Record<number, string[]>;
  candidateFrameAssetIdsByShot?: Record<number, string[]>;
  selectedStartFrameCandidateIdByShot?: Record<number, string>;
  selectedEndFrameCandidateIdByShot?: Record<number, string>;
  promptSetIdByShot?: Record<number, string>;
  subtitleCueIdsByShot?: Record<number, string[]>;

  dialogueAudioPlanId?: string;
  providerRoutingDecision?: VerticalDramaTaskExtraParams["providerRoutingDecision"];
  continuityWarnings?: string[];
  productTieIn?: VerticalDramaTaskExtraParams["productTieIn"];
  qcRecommendedRepairs?: unknown[];
  providerPayloadPreview?: Record<string, unknown>;
  voiceCasting?: unknown;
  subtitleSafeArea?: unknown;
  audioStrategy?: string | null;
  voiceoverFullScript?: string | null;

  /** Resolve an asset id to a displayable URL (else `asset://<id>`). */
  resolveAssetUrl?: (assetId: string) => string | undefined;
}

const SUB_SHOT_TRANSITIONS: SubShotTransition[] = ["cut", "match_cut", "smash_cut", "continuous"];

function normalizeTransition(value: unknown): SubShotTransition {
  return SUB_SHOT_TRANSITIONS.includes(value as SubShotTransition)
    ? (value as SubShotTransition)
    : "cut";
}

function frameRolesFor(
  motionMode: MotionMode,
  hasStart: boolean,
  hasStop: boolean,
): FrameRole[] {
  if (motionMode === "first_last_frame_bridge" && hasStart && hasStop) {
    return ["start", "stop"];
  }
  if (hasStart) return ["start"];
  return [];
}

function referenceModeFor(motionMode: MotionMode): "start_stop" | "first_frame" | "prompt_only" {
  if (motionMode === "first_last_frame_bridge") return "start_stop";
  if (motionMode === "prompt_only" || motionMode === "text_to_video") return "prompt_only";
  return "first_frame";
}

function buildReferenceImages(
  input: BuildHandoffInput,
  startFrameAssetId: string | undefined,
  endFrameAssetId: string | undefined,
  roles: FrameRole[],
): HandoffReferenceImage[] {
  const resolve = (id: string): string => input.resolveAssetUrl?.(id) ?? `asset://${id}`;
  const images: HandoffReferenceImage[] = [];
  if (roles.includes("start") && startFrameAssetId) {
    images.push({ url: resolve(startFrameAssetId), assetId: startFrameAssetId, role: "start" });
  }
  if (roles.includes("stop") && endFrameAssetId) {
    images.push({ url: resolve(endFrameAssetId), assetId: endFrameAssetId, role: "stop" });
  }
  return images;
}

function imageLineageFor(input: BuildHandoffInput, shotNumber: number): ShotImagePromptLineage {
  const storyboard = asRecord(input.plan.storyboard);
  const shots = asArray<Record<string, unknown>>(
    Array.isArray(input.plan.storyboard) ? input.plan.storyboard : storyboard.shots,
  );
  const shot = asRecord(
    shots.find((s) => asNumber(asRecord(s).shotNumber, -1) === shotNumber) ?? {},
  );
  return {
    shotNumber,
    contactSheetPrompt: asString(shot.contactSheetPrompt),
    cellPrompts: asArray<string>(shot.cellPrompts).filter((p) => typeof p === "string"),
    negativePrompt: asString(shot.negativePrompt),
    contactSheetIds: input.contactSheetIdsByShot?.[shotNumber] ?? [],
    candidateFrameAssetIds: input.candidateFrameAssetIdsByShot?.[shotNumber] ?? [],
    selectedStartFrameCandidateId: input.selectedStartFrameCandidateIdByShot?.[shotNumber],
    promptSetId: input.promptSetIdByShot?.[shotNumber],
  };
}

function baseExtraParams(
  input: BuildHandoffInput,
  shotNumber: number,
  clipNumber: number | undefined,
  startFrameAssetId: string | undefined,
  endFrameAssetId: string | undefined,
  roles: FrameRole[],
): VerticalDramaTaskExtraParams {
  // Required-at-creation ID set + the skill-ID fields. `assemblyManifestId` is
  // intentionally OMITTED — it is back-filled at assembly (section-09).
  const extra: VerticalDramaTaskExtraParams = {
    source: "vertical_drama_series",
    seriesId: input.seriesId,
    episodeId: input.episodeId,
    episodeNumber: input.episodeNumber,
    shotNumber,
    clipNumber,
    durationProfileId: input.durationProfileId,
    motionMode: input.motionMode,
    characterReferenceAssetIds: input.characterReferenceAssetIdsByShot?.[shotNumber] ?? [],
    productReferenceAssetIds: input.productReferenceAssetIdsByShot?.[shotNumber],
    startFrameAssetId,
    endFrameAssetId,
    contactSheetIds: input.contactSheetIdsByShot?.[shotNumber] ?? [],
    candidateFrameAssetIds: input.candidateFrameAssetIdsByShot?.[shotNumber] ?? [],
    selectedStartFrameCandidateId: input.selectedStartFrameCandidateIdByShot?.[shotNumber],
    selectedEndFrameCandidateId: input.selectedEndFrameCandidateIdByShot?.[shotNumber],
    promptSetId: input.promptSetIdByShot?.[shotNumber],
    referenceFrameRoles: roles,
    dialogueAudioPlanId: input.dialogueAudioPlanId,
    subtitleCueIds: input.subtitleCueIdsByShot?.[shotNumber],
    videoPromptSkillId: "vertical-drama-video-motion-prompt-pack",
    storyboardSkillId: "vertical-drama-storyboard-shotgrid",
    characterBibleSkillId: "vertical-drama-character-visual-bible",
    dialogueAudioSkillId: "vertical-drama-dialogue-audio-planner",
    productTieIn: input.productTieIn,
    continuityWarnings: input.continuityWarnings ?? [],
    providerRoutingDecision: input.providerRoutingDecision,
  };
  return extra;
}

/**
 * Build the ordered Storyboard Review tasks for an approved episode plan.
 *
 * - Default (flag off / provider degrades): ONE task per motion clip (bridge
 *   mode maps 9 approved frames into 8 adjacent clips), roles `["start","stop"]`.
 * - Sub-shots (flag on + `sub_shot_plan` present for a parent shot): fan the
 *   parent clip out into one ordered task PER sub-shot (shot order, then
 *   `subShotNumber` order), carrying `parentShotNumber` / `subShotNumber` /
 *   `subShotCount` / `subShotTransitionIn`.
 */
export function buildVerticalDramaHandoffTasks(input: BuildHandoffInput): VerticalDramaHandoffTask[] {
  const pack = asRecord(input.plan.motionPromptPack);
  const clips = asArray<MotionClip>(pack.clips);
  const subShotPlan = asArray<SubShotPlanEntry>(pack.sub_shot_plan ?? pack.subShotPlan);
  const subShotByParent = new Map<number, SubShotPlanEntry>();
  for (const entry of subShotPlan) {
    const parent = asNumber(asRecord(entry).parentShotNumber, NaN);
    if (Number.isFinite(parent)) subShotByParent.set(parent, entry);
  }

  const tasks: VerticalDramaHandoffTask[] = [];

  clips.forEach((clip, index) => {
    const shotNumber = asNumber(clip.shotNumber ?? clip.parentShotNumber, index + 1);
    const clipNumber = typeof clip.clipNumber === "number" ? clip.clipNumber : index + 1;
    const subEntry = input.subShotsEnabled ? subShotByParent.get(shotNumber) : undefined;
    const subShots: SubShotPlanEntry["subShots"] = subEntry
      ? asArray<SubShotPlanEntry["subShots"][number]>(subEntry.subShots)
      : [];

    if (subEntry && subShots.length >= 1) {
      // Sub-shot fan-out: one ordered task per sub-shot under the parent shot.
      const ordered = [...subShots].sort(
        (a, b) => asNumber(a.subShotNumber, 0) - asNumber(b.subShotNumber, 0),
      );
      ordered.forEach((sub) => {
        const subShotNumber = asNumber(sub.subShotNumber, tasks.length + 1);
        const startFrameAssetId = asString(sub.startFrameAssetId) ?? asString(clip.startFrameAssetId);
        const endFrameAssetId = asString(sub.endFrameAssetId) ?? asString(clip.endFrameAssetId);
        const roles = frameRolesFor(input.motionMode, Boolean(startFrameAssetId), Boolean(endFrameAssetId));
        const extra = baseExtraParams(input, shotNumber, clipNumber, startFrameAssetId, endFrameAssetId, roles);
        extra.parentShotNumber = shotNumber;
        extra.subShotNumber = subShotNumber;
        extra.subShotCount = ordered.length;
        extra.subShotTransitionIn = normalizeTransition(sub.transitionIn);
        tasks.push({
          id: `vd-${input.episodeId}-shot-${shotNumber}-sub-${subShotNumber}`,
          // Sub-shot motion prompt ONLY (never parent prompt / camera setup / transition label).
          prompt: asString(sub.prompt) ?? "",
          durationSeconds: asNumber(sub.durationSeconds, 0),
          status: "planned",
          storyboardContext: {
            referenceImages: buildReferenceImages(input, startFrameAssetId, endFrameAssetId, roles),
            referenceFrameRoles: roles,
            imagePrompts: imageLineageFor(input, shotNumber),
          },
          videoSegmentState: {
            videoSegmentPlan: {
              referenceMode: referenceModeFor(input.motionMode),
              startFrameAssetId,
              endFrameAssetId,
            },
            staleTaskIds: [],
            staleReason: null,
          },
          extraParams: extra,
          companionAudio: [],
          companionAudioUpdatedAt: null,
          voiceoverFullScript: input.voiceoverFullScript ?? null,
          promptEditHistory: [],
        });
      });
      return;
    }

    // Default single-clip task.
    const startFrameAssetId = asString(clip.startFrameAssetId);
    const endFrameAssetId = asString(clip.endFrameAssetId);
    const roles = frameRolesFor(input.motionMode, Boolean(startFrameAssetId), Boolean(endFrameAssetId));
    const extra = baseExtraParams(input, shotNumber, clipNumber, startFrameAssetId, endFrameAssetId, roles);
    tasks.push({
      id: `vd-${input.episodeId}-shot-${shotNumber}`,
      prompt: asString(clip.prompt) ?? "",
      durationSeconds: asNumber(clip.durationSeconds, 0),
      status: "planned",
      storyboardContext: {
        referenceImages: buildReferenceImages(input, startFrameAssetId, endFrameAssetId, roles),
        referenceFrameRoles: roles,
        imagePrompts: imageLineageFor(input, shotNumber),
      },
      videoSegmentState: {
        videoSegmentPlan: {
          referenceMode: referenceModeFor(input.motionMode),
          startFrameAssetId,
          endFrameAssetId,
        },
        staleTaskIds: [],
        staleReason: null,
      },
      extraParams: extra,
      companionAudio: [],
      companionAudioUpdatedAt: null,
      voiceoverFullScript: input.voiceoverFullScript ?? null,
      promptEditHistory: [],
    });
  });

  return tasks;
}

/** Build the full `reviewData` payload (tasks + panel metadata + idempotency). */
export function buildVerticalDramaReviewData(input: BuildHandoffInput): VerticalDramaReviewData {
  const episodePlanHash = computeEpisodePlanHash(input.plan);
  const idempotencyKey = buildVerticalDramaHandoffKey(
    input.seriesId,
    input.episodeId,
    episodePlanHash,
  );
  const tasks = buildVerticalDramaHandoffTasks(input);

  // Distinct shot lineage for the read-only image-prompt panel.
  const shotNumbers = Array.from(
    new Set(tasks.map((t) => t.extraParams.parentShotNumber ?? t.extraParams.shotNumber)),
  ).sort((a, b) => a - b);
  const imagePromptsByShot = shotNumbers.map((shot) => imageLineageFor(input, shot));

  // Grouped sub-shot breakdown for the panel.
  const subShotBreakdownByShot: VerticalDramaReviewData["subShotBreakdownByShot"] = [];
  if (input.subShotsEnabled) {
    const byParent = new Map<number, VerticalDramaHandoffTask[]>();
    for (const t of tasks) {
      if (t.extraParams.subShotNumber == null) continue;
      const parent = t.extraParams.parentShotNumber ?? t.extraParams.shotNumber;
      const list = byParent.get(parent) ?? [];
      list.push(t);
      byParent.set(parent, list);
    }
    for (const [parentShotNumber, group] of [...byParent.entries()].sort((a, b) => a[0] - b[0])) {
      subShotBreakdownByShot.push({
        parentShotNumber,
        subShotCount: group.length,
        subShots: group
          .sort((a, b) => (a.extraParams.subShotNumber ?? 0) - (b.extraParams.subShotNumber ?? 0))
          .map((t) => ({
            subShotNumber: t.extraParams.subShotNumber ?? 0,
            cameraSetup: undefined,
            durationSeconds: t.durationSeconds,
            transitionIn: t.extraParams.subShotTransitionIn ?? "cut",
            prompt: t.prompt,
          })),
      });
    }
  }

  return {
    source: "vertical_drama_series",
    sourceSurface: "vertical_drama_series",
    seriesId: input.seriesId,
    episodeId: input.episodeId,
    episodeNumber: input.episodeNumber,
    episodePlanHash,
    idempotencyKey,
    motionMode: input.motionMode,
    backlink: {
      seriesId: input.seriesId,
      episodeId: input.episodeId,
      episodeNumber: input.episodeNumber,
    },
    imagePromptsByShot,
    subShotBreakdownByShot,
    providerPayloadPreview: input.providerPayloadPreview ?? {},
    qcRecommendedRepairs: input.qcRecommendedRepairs ?? [],
    voiceCasting: input.voiceCasting ?? null,
    subtitleSafeArea: input.subtitleSafeArea ?? null,
    audioStrategy: input.audioStrategy ?? null,
    continuityWarnings: input.continuityWarnings ?? [],
    tasks,
    updatedAt: Date.now(),
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Derive handoff input from a persisted episode row.                      */
/* -------------------------------------------------------------------------- */

export interface HandoffOverrides {
  imageModelId?: string;
  videoModelId?: string;
  motionMode?: MotionMode;
}

export function deriveHandoffInputFromEpisode(
  episode: VerticalDramaEpisodeRow,
  opts: { subShotsEnabled: boolean; overrides?: HandoffOverrides },
): BuildHandoffInput {
  const plan: ApprovedEpisodePlan = {
    script: episode.script ?? undefined,
    storyboard: episode.storyboard ?? undefined,
    startFramePlan: episode.startFramePlan ?? undefined,
    motionPromptPack: episode.motionPromptPack ?? undefined,
    dialogueAudioPlan: episode.dialogueAudioPlan ?? undefined,
    assemblyManifest: episode.assemblyManifest ?? undefined,
  };
  const pack = asRecord(plan.motionPromptPack);
  const framePlan = asRecord(plan.startFramePlan);
  const audio = asRecord(plan.dialogueAudioPlan);

  const motionMode: MotionMode =
    opts.overrides?.motionMode ??
    (asString(pack.motionMode) as MotionMode | undefined) ??
    "first_last_frame_bridge";

  // Per-shot start-frame + lineage maps from the start-frame plan.
  const frames = asArray<Record<string, unknown>>(framePlan.frames);
  const contactSheetIdsByShot: Record<number, string[]> = {};
  const candidateFrameAssetIdsByShot: Record<number, string[]> = {};
  const selectedStartFrameCandidateIdByShot: Record<number, string> = {};
  const promptSetIdByShot: Record<number, string> = {};
  const characterReferenceAssetIdsByShot: Record<number, string[]> = {};
  for (const frame of frames) {
    const shot = asNumber(frame.shotNumber, NaN);
    if (!Number.isFinite(shot)) continue;
    const cs = asArray<string>(frame.contactSheetIds).filter((v) => typeof v === "string");
    if (cs.length) contactSheetIdsByShot[shot] = cs;
    const cand = asArray<string>(frame.candidateFrameAssetIds).filter((v) => typeof v === "string");
    if (cand.length) candidateFrameAssetIdsByShot[shot] = cand;
    const sel = asString(frame.selectedStartFrameCandidateId);
    if (sel) selectedStartFrameCandidateIdByShot[shot] = sel;
    const psid = asString(frame.promptSetId);
    if (psid) promptSetIdByShot[shot] = psid;
    const chars = asArray<string>(frame.characterReferenceAssetIds).filter((v) => typeof v === "string");
    if (chars.length) characterReferenceAssetIdsByShot[shot] = chars;
  }

  return {
    seriesId: String(episode.seriesId),
    episodeId: String(episode.id),
    episodeNumber: episode.episodeNumber,
    durationProfileId: episode.durationProfileId,
    motionMode,
    imageModelId:
      opts.overrides?.imageModelId ?? asString(framePlan.imageModelId) ?? asString(pack.imageModelId) ?? "unknown",
    videoModelId:
      opts.overrides?.videoModelId ?? asString(pack.videoModelId) ?? "unknown",
    plan,
    subShotsEnabled: opts.subShotsEnabled,
    characterReferenceAssetIdsByShot,
    contactSheetIdsByShot,
    candidateFrameAssetIdsByShot,
    selectedStartFrameCandidateIdByShot,
    promptSetIdByShot,
    dialogueAudioPlanId: asString(audio.planId ?? audio.dialogueAudioPlanId),
    providerRoutingDecision: pack.providerRoutingDecision as BuildHandoffInput["providerRoutingDecision"],
    providerPayloadPreview: asRecord(pack.providerPayloadPreview),
    audioStrategy: asString(audio.audioStrategy) ?? null,
    voiceCasting: audio.speakerVoiceMap ?? null,
    subtitleSafeArea: audio.subtitleSafeArea ?? asRecord(plan.dialogueAudioPlan).safeArea ?? null,
    voiceoverFullScript: asString(audio.voiceoverFullScript) ?? null,
    continuityWarnings: asArray<string>(pack.continuityWarnings).filter((v) => typeof v === "string"),
  };
}

/* -------------------------------------------------------------------------- */
/* 5. Idempotent create / reopen.                                             */
/* -------------------------------------------------------------------------- */

export interface HandoffResult {
  reviewId: number;
  idempotencyKey: string;
  episodePlanHash: string;
  reused: boolean;
  taskCount: number;
}

/**
 * Create (or reopen) the Storyboard Review project for an approved episode.
 *
 * Ownership: `mediaStudioStoryboardReviews` is `userId`-scoped. The caller must
 * pass an `episode` row already asserted to belong to `userId` + `tenantId`;
 * this function re-checks `episode.userId === userId` and
 * `episode.tenantId === tenantId` before writing.
 */
export async function createVerticalDramaStoryboardHandoff(args: {
  db: DrizzleDB;
  userId: number;
  tenantId: string;
  episode: VerticalDramaEpisodeRow;
  subShotsEnabled: boolean;
  overrides?: HandoffOverrides;
  name?: string;
}): Promise<HandoffResult> {
  const { db, userId, tenantId, episode } = args;

  if (episode.userId !== userId || episode.tenantId !== tenantId) {
    throw new Error("verticalDramaStoryboardHandoff: episode ownership mismatch");
  }

  const input = deriveHandoffInputFromEpisode(episode, {
    subShotsEnabled: args.subShotsEnabled,
    overrides: args.overrides,
  });
  const reviewData = buildVerticalDramaReviewData(input);
  const name =
    args.name ?? `Vertical Drama — Episode ${episode.episodeNumber}${episode.title ? `: ${episode.title}` : ""}`;
  const now = new Date();
  const thumbnailUrl = reviewData.tasks.find((t) => t.storyboardContext.referenceImages[0])
    ?.storyboardContext.referenceImages[0]?.url;

  // Try to reopen via the episode backlink.
  const backlinkId = episode.storyboardReviewId ? Number(episode.storyboardReviewId) : NaN;
  if (Number.isFinite(backlinkId)) {
    const [existing] = await db
      .select()
      .from(mediaStudioStoryboardReviews)
      .where(
        and(
          eq(mediaStudioStoryboardReviews.id, backlinkId),
          eq(mediaStudioStoryboardReviews.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      const action = decideHandoffAction({
        existingReviewData: existing.reviewData,
        newKey: reviewData.idempotencyKey,
      });
      if (action === "reopen") {
        // Unchanged plan → reactivate the existing review WITHOUT clobbering any
        // user prompt edits already stored in its tasks.
        await db
          .update(mediaStudioStoryboardReviews)
          .set({ status: "active", updatedAt: now })
          .where(
            and(
              eq(mediaStudioStoryboardReviews.id, backlinkId),
              eq(mediaStudioStoryboardReviews.userId, userId),
            ),
          );
        return {
          reviewId: backlinkId,
          idempotencyKey: reviewData.idempotencyKey,
          episodePlanHash: reviewData.episodePlanHash,
          reused: true,
          taskCount: reviewData.tasks.length,
        };
      }
      // Plan changed → fall through to create a NEW review below.
    }
  }

  const [inserted] = await db
    .insert(mediaStudioStoryboardReviews)
    .values({
      userId,
      name,
      reviewData,
      clipCount: reviewData.tasks.length,
      completedClipCount: 0,
      thumbnailUrl,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: mediaStudioStoryboardReviews.id });

  const reviewId = Number(inserted.id);

  // Repoint the episode backlink to the freshly-created review.
  await db
    .update(verticalDramaEpisodes)
    .set({ storyboardReviewId: String(reviewId), updatedAt: now })
    .where(
      and(
        eq(verticalDramaEpisodes.id, episode.id),
        eq(verticalDramaEpisodes.userId, userId),
        eq(verticalDramaEpisodes.tenantId, tenantId),
      ),
    );

  return {
    reviewId,
    idempotencyKey: reviewData.idempotencyKey,
    episodePlanHash: reviewData.episodePlanHash,
    reused: false,
    taskCount: reviewData.tasks.length,
  };
}

/* -------------------------------------------------------------------------- */
/* 6. Append-only video/motion prompt edit.                                   */
/* -------------------------------------------------------------------------- */

/**
 * Apply an append-only edit to a task's video/motion prompt. Records
 * `{ editedByUserId, editedAt, original }`, sets the new prompt, and re-applies
 * stale/paid-generation gating (marks the task stale). Returns a NEW task
 * object — never mutates in place.
 */
export function appendVideoPromptEdit(
  task: VerticalDramaHandoffTask,
  edit: { newPrompt: string; editedByUserId: number; editedAt?: number },
): VerticalDramaHandoffTask {
  const editedAt = edit.editedAt ?? Date.now();
  const staleTaskIds = Array.from(new Set([...task.videoSegmentState.staleTaskIds, task.id]));
  return {
    ...task,
    prompt: edit.newPrompt,
    promptEditHistory: [
      ...task.promptEditHistory,
      { editedByUserId: edit.editedByUserId, editedAt, original: task.prompt },
    ],
    videoSegmentState: {
      ...task.videoSegmentState,
      staleTaskIds,
      staleReason: "video_prompt_edited",
    },
  };
}
