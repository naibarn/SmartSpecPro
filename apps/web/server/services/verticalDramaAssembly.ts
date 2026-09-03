/**
 * Vertical Drama Series — assembly + export + run-artifact ledger service
 * (spec feature 131, section 09).
 *
 * Responsibilities (all tenant + user scoped):
 *  1. Persist the complete, immutable run-artifact ledger for an episode run
 *     (`input.normalized.json` … `10_qc_report.json` + `readable_summary.md` +
 *     `run_log.jsonl`) so any past run stays inspectable.
 *  2. Import generated/imported Storyboard Review clip outputs — per-clip media
 *     asset IDs, provider job IDs, and their last stable provider statuses — at
 *     render/assembly completion.
 *  3. Build the final `VerticalDramaAssemblyManifest` (concat plan, subtitle
 *     plan, audio/BGM plan, export settings), assign a stable `assemblyManifestId`
 *     at build, and write that id back onto the originating Storyboard Review
 *     task so the review task and its assembly are linked bidirectionally.
 *  4. Concatenate sub-shot clips in flatten order (parent shot, then sub-shot),
 *     with per-sub trim/timing; validate per-parent sum-to-parent and the 60s
 *     episode total; honor the fallback `[8,8,8,4,8,8,4,8,4]` profile.
 *  5. Mark a run `assembly_ready` when a final render cannot run, keeping all
 *     deterministic inputs inspectable.
 *  6. On export completion, write a searchable QC report row, an append-only
 *     memory-event candidate, and an auto-approved memory checkpoint (audit
 *     record only, manual approval removed from the product workflow,
 *     2026-07-07) — never an automatic memory mutation.
 *
 * The pure builders (`buildAssemblyManifest`, `flattenClips`, …) take no DB and
 * are exercised directly in tests; the `VerticalDramaAssemblyService` class does
 * the ownership-scoped persistence.
 */

import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { projectBrollPlacements } from "./verticalDramaBrollService";
import { db } from "../db";
import {
  verticalDramaEpisodes,
  verticalDramaSeries,
  verticalDramaEpisodeRuns,
  verticalDramaRunArtifacts,
  verticalDramaApprovalCheckpoints,
  verticalDramaMemoryEvents,
  verticalDramaQcReports,
  mediaStudioStoryboardReviews,
  verticalDramaShotBrollBindings,
  verticalDramaSourceAssets,
  mediaAssets,
  type MediaAsset,
  type VerticalDramaShotBrollBinding,
  type VerticalDramaSourceAsset,
  type VerticalDramaEpisodeRow,
  type VerticalDramaRunArtifactRow,
  type VerticalDramaEpisodeRunRow,
} from "../../drizzle/schema";
import { parseShotBrollTransform } from "@shared/verticalDramaSeries/visualSource";
import {
  artifactChecksumSha256,
  VERTICAL_DRAMA_ARTIFACT_LEDGER,
  VERTICAL_DRAMA_ARTIFACT_FILENAME_BY_STAGE,
  VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT,
  VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK,
  VERTICAL_DRAMA_TARGET_DURATION_SECONDS,
  durationsOf,
  getActiveVerticalDramaShotDurations,
  resolveVerticalDramaEpisodeDurationPlan,
  resolveVerticalDramaDurationPlan,
  type VerticalDramaDurationPlan,
  type VerticalDramaArtifactFilename,
  type VerticalDramaArtifactStage,
  type VerticalDramaAssemblyManifest,
} from "@shared/verticalDramaSeries";
import { assertR2StorageActive, storageExists } from "../storage";

/* -------------------------------------------------------------------------- */
/* Ownership + shared types                                                   */
/* -------------------------------------------------------------------------- */

export interface AssemblyOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
}

/** Which duration profile drives the assembly schedule. */
export type AssemblyProfileKind =
  | "default_bridge"
  | "fallback_9_shots"
  | "selected_9_shots";

/** Resolve the profile kind from an episode's `durationProfileId`. */
export function profileKindForEpisode(durationProfileId: string | null | undefined): AssemblyProfileKind {
  return durationProfileId === VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK.id
    ? "fallback_9_shots"
    : "default_bridge";
}

/** The per-clip / per-shot duration schedule for a profile kind. */
export function scheduleFor(
  kind: AssemblyProfileKind,
  durationPlan?: VerticalDramaDurationPlan | null,
): number[] {
  if (kind === "selected_9_shots") {
    const durations = getActiveVerticalDramaShotDurations(durationPlan);
    if (durations) return durations;
    // A selected profile without a valid vector is a structural error. Keep
    // the pure helper deterministic and let the manifest validator surface a
    // normal count/duration mismatch instead of guessing a runtime.
    return [];
  }
  return kind === "fallback_9_shots"
    ? durationsOf(VERTICAL_DRAMA_DURATION_PROFILE_FALLBACK)
    : durationsOf(VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT);
}

/**
 * The source shot number(s) each clip position maps back to.
 *  - default bridge: clip `i` bridges frames `i -> i+1` (`[i, i+1]`), 8 clips.
 *  - fallback: clip `i` renders shot `i` (`[i]`), 9 clips.
 */
export function sourceShotsFor(kind: AssemblyProfileKind, clipIndexZeroBased: number): number[] {
  const i = clipIndexZeroBased + 1;
  return kind === "default_bridge" ? [i, i + 1] : [i];
}

/** A clip being imported into episode run state at render/assembly completion. */
export interface ClipImportInput {
  clipNumber: number;
  sourceShotNumbers?: number[];
  durationSeconds: number;
  mediaAssetId?: string;
  /** Provider job id ingested at completion (never a provider URL). */
  providerJobId?: string;
  /** Last stable provider status for the clip's job. */
  providerStatus?: string;
  /** Set for a sub-shot clip (§7.4). Omit / null for a non-decomposed clip. */
  parentShotNumber?: number;
  subShotNumber?: number | null;
  status?: VerticalDramaAssemblyManifest["clips"][number]["status"];
  trimStartSeconds?: number;
  trimEndSeconds?: number;
}

/** A resolved assembly clip — the shared clip shape plus section-09 extensions. */
export type AssemblyClip = VerticalDramaAssemblyManifest["clips"][number] & {
  parentShotNumber?: number;
  subShotNumber?: number | null;
  providerJobId?: string;
  providerStatus?: string;
  /** Cut boundary of a sub-shot relative to its parent (start/end seconds). */
  cutStartSeconds?: number;
  cutEndSeconds?: number;
};

export type SubtitleCue = VerticalDramaAssemblyManifest["subtitlePlan"][number];
export type AudioBgmTrack = VerticalDramaAssemblyManifest["audioBgmPlan"][number];
export type AssemblyExportSettings = VerticalDramaAssemblyManifest["exportSettings"];

/** The full section-09 assembly manifest (extends the shared base additively). */
export type VerticalDramaEpisodeAssemblyManifest = Omit<VerticalDramaAssemblyManifest, "clips"> & {
  assemblyManifestId: string;
  durationProfileId: string;
  profileKind: AssemblyProfileKind;
  clips: AssemblyClip[];
  subShotsEnabled: boolean;
  /** `vdflow assemble` equivalent, app-safe (no local GitHub-style folders). */
  concatText: string;
  subtitlesSrt: string;
  audioPlan: AudioBgmTrack[];
  ffmpegCommand: string;
  /** Set when a final render produced an output media asset. */
  finalMediaAssetId?: string;
};

/** A repair action surfaced for a failed / invalid assembly (spec §09 task 12). */
export interface AssemblyRepairAction {
  action:
    | "repair_failed_import"
    | "repair_missing_clip"
    | "repair_duration_mismatch"
    | "repair_subtitle_mismatch"
    | "repair_export_failure";
  targetType: "clip" | "shot" | "subtitle" | "assembly";
  targetId?: string;
  message: string;
}

export interface AssemblyBuildResult {
  manifest: VerticalDramaEpisodeAssemblyManifest;
  valid: boolean;
  errors: string[];
  repairActions: AssemblyRepairAction[];
}

type AssemblyBrollPlanEntry = NonNullable<VerticalDramaEpisodeAssemblyManifest["brollPlan"]>[number];
type AssemblyBrollPlanInput = Omit<AssemblyBrollPlanEntry, "startSeconds" | "endSeconds"> &
  Partial<Pick<AssemblyBrollPlanEntry, "startSeconds" | "endSeconds">>;

function validateBrollPlan(plan: AssemblyBrollPlanEntry[], targetDurationSeconds: number): string[] {
  const errors: string[] = [];
  let total = 0;
  for (const item of plan) {
    const duration = item.mediaType === "video"
      ? (item.outSeconds ?? 0) - (item.inSeconds ?? 0)
      : item.displayDurationSeconds ?? 0;
    if (duration <= 0) errors.push(`broll_duration_invalid:${item.bindingId}`);
    if (item.mediaType === "video" && (item.inSeconds == null || item.outSeconds == null || item.outSeconds <= item.inSeconds)) {
      errors.push(`broll_bounds_invalid:${item.bindingId}`);
    }
    if (!Number.isFinite(item.startSeconds) || !Number.isFinite(item.endSeconds) || item.endSeconds <= item.startSeconds) {
      errors.push(`broll_timeline_invalid:${item.bindingId}`);
    }
    if (item.startSeconds < 0 || item.endSeconds > targetDurationSeconds + 1e-9) {
      errors.push(`broll_timeline_out_of_range:${item.bindingId}`);
    }
    total += Math.max(0, duration);
  }
  if (total > targetDurationSeconds + 1e-9) errors.push(`broll_overflow:${total}s>${targetDurationSeconds}s`);
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Pure builders                                                              */
/* -------------------------------------------------------------------------- */

/** Effective flatten sort key: parent shot first, then sub-shot order. */
function clipSortKey(c: ClipImportInput): [number, number] {
  const parent = c.parentShotNumber ?? c.clipNumber;
  const sub = c.subShotNumber == null ? 0 : c.subShotNumber;
  return [parent, sub];
}

/**
 * Flatten clips into deterministic concat order (spec §09 Sub-Shot Assembly):
 * sort by `parentShotNumber` asc, then `subShotNumber` asc; non-decomposed clips
 * keep their single-clip position via `clipNumber`.
 */
export function flattenClips(clips: ClipImportInput[]): ClipImportInput[] {
  return [...clips].sort((a, b) => {
    const [pa, sa] = clipSortKey(a);
    const [pb, sb] = clipSortKey(b);
    return pa !== pb ? pa - pb : sa - sb;
  });
}

/** One concat entry per clip, app-safe (media asset id, never a provider URL). */
function concatEntry(c: AssemblyClip): string {
  const ref = c.mediaAssetId ? `media:${c.mediaAssetId}` : `clip:${c.clipNumber}`;
  return `file '${ref}'`;
}

/** Convert seconds → `HH:MM:SS,mmm` SRT timestamp. */
function srtTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  const whole = Math.floor(clamped);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** Render a `.srt` document from the subtitle plan (deterministic). */
export function buildSubtitlesSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, i) => {
      const idx = i + 1;
      return `${idx}\n${srtTimestamp(cue.startSeconds)} --> ${srtTimestamp(cue.endSeconds)}\n${cue.text}\n`;
    })
    .join("\n");
}

/**
 * Build the final assembly manifest for an episode run (pure — no DB).
 *
 * Validates:
 *  - total clip durations sum to the active profile target;
 *  - with sub-shots, per-parent sub-clip durations sum to the parent main-shot
 *    duration and the shot count stays 9 (sub-shots never add shots/frames);
 *  - each clip has a resolved media asset (missing → repair action).
 */
export function buildAssemblyManifest(input: {
  assemblyManifestId: string;
  durationProfileId: string;
  profileKind: AssemblyProfileKind;
  clips: ClipImportInput[];
  subtitlePlan?: SubtitleCue[];
  audioBgmPlan?: AudioBgmTrack[];
  brollPlan?: AssemblyBrollPlanInput[];
  exportSettings?: Partial<AssemblyExportSettings>;
  subShotsEnabled?: boolean;
  /** Active 9-logical-shot profile. Omit for legacy 60-second profiles. */
  durationPlan?: VerticalDramaDurationPlan;
}): AssemblyBuildResult {
  const errors: string[] = [];
  const repairActions: AssemblyRepairAction[] = [];
  const schedule = scheduleFor(input.profileKind, input.durationPlan);
  const targetDurationSeconds = schedule.reduce((sum, duration) => sum + duration, 0);
  const expectedTargetDurationSeconds =
    input.profileKind === "selected_9_shots"
      ? targetDurationSeconds
      : VERTICAL_DRAMA_TARGET_DURATION_SECONDS;
  if (input.profileKind === "selected_9_shots" && schedule.length !== 9) {
    errors.push("invalid_selected_duration_profile: active profile must contain 9 logical shots");
    repairActions.push({
      action: "repair_duration_mismatch",
      targetType: "assembly",
      message: "Selected duration profile is missing a valid 9-shot duration vector.",
    });
  }
  const subShotsEnabled = input.subShotsEnabled ?? false;

  const ordered = flattenClips(input.clips);

  // Resolve per-clip cut boundaries within each parent (running offset).
  const parentOffset = new Map<number, number>();
  const resolvedClips: AssemblyClip[] = ordered.map((c, idx) => {
    const isSub = c.subShotNumber != null && c.parentShotNumber != null;
    const sourceShotNumbers =
      c.sourceShotNumbers && c.sourceShotNumbers.length > 0
        ? c.sourceShotNumbers
        : sourceShotsFor(input.profileKind, idx);
    const clip: AssemblyClip = {
      clipNumber: c.clipNumber,
      sourceShotNumbers,
      durationSeconds: c.durationSeconds,
      mediaAssetId: c.mediaAssetId,
      status: c.status ?? (c.mediaAssetId ? "ready" : "planned"),
      trimStartSeconds: c.trimStartSeconds,
      trimEndSeconds: c.trimEndSeconds,
      providerJobId: c.providerJobId,
      providerStatus: c.providerStatus,
    };
    if (isSub) {
      const parent = c.parentShotNumber as number;
      const start = parentOffset.get(parent) ?? 0;
      const end = start + c.durationSeconds;
      parentOffset.set(parent, end);
      clip.parentShotNumber = parent;
      clip.subShotNumber = c.subShotNumber ?? null;
      clip.cutStartSeconds = start;
      clip.cutEndSeconds = end;
    }
    // Missing rendered clip → repair action.
    if (!c.mediaAssetId && c.status !== "skipped") {
      repairActions.push({
        action: "repair_missing_clip",
        targetType: "clip",
        targetId: String(c.clipNumber),
        message: `Clip ${c.clipNumber} has no media asset and cannot be assembled.`,
      });
    }
    // Failed clip import → repair action.
    if (c.status === "failed") {
      repairActions.push({
        action: "repair_failed_import",
        targetType: "clip",
        targetId: String(c.clipNumber),
        message: `Clip ${c.clipNumber} import failed and must be repaired.`,
      });
    }
    return clip;
  });

  // Total-duration validation (always).
  const total = resolvedClips.reduce((acc, c) => acc + c.durationSeconds, 0);
  if (Math.abs(total - expectedTargetDurationSeconds) > 1e-9) {
    errors.push(
      `episode_duration_mismatch: clips sum to ${total}s, expected ${expectedTargetDurationSeconds}s`,
    );
    repairActions.push({
      action: "repair_duration_mismatch",
      targetType: "assembly",
      message: `Episode clips sum to ${total}s; must total ${expectedTargetDurationSeconds}s.`,
    });
  }

  if (subShotsEnabled && resolvedClips.some((c) => c.subShotNumber != null)) {
    // Per-parent sub-shot durations must sum to the parent main-shot duration.
    const byParent = new Map<number, number>();
    for (const c of resolvedClips) {
      if (c.parentShotNumber == null) continue;
      byParent.set(c.parentShotNumber, (byParent.get(c.parentShotNumber) ?? 0) + c.durationSeconds);
    }
    // Shot count must stay 9 — sub-shots never add shots/frames.
    const parentCount = byParent.size;
    for (const [parent, sum] of byParent) {
      const expected = schedule[parent - 1];
      if (expected == null) {
        errors.push(`sub_shot_parent_out_of_range: parent shot ${parent} exceeds ${schedule.length} shots`);
        continue;
      }
      if (Math.abs(sum - expected) > 1e-9) {
        errors.push(
          `sub_shot_parent_duration_mismatch: parent shot ${parent} sub-shots sum to ${sum}s, expected ${expected}s`,
        );
        repairActions.push({
          action: "repair_duration_mismatch",
          targetType: "shot",
          targetId: String(parent),
          message: `Sub-shots of shot ${parent} sum to ${sum}s; must sum to ${expected}s.`,
        });
      }
    }
    if (parentCount > 9) {
      errors.push(`sub_shot_shot_count_changed: decomposed ${parentCount} parents, must stay <= 9 shots`);
    }
  } else {
    // Non-decomposed: clip count must match the active profile schedule.
    if (resolvedClips.length !== schedule.length) {
      errors.push(
        `clip_count_mismatch: ${resolvedClips.length} clips, profile ${input.profileKind} expects ${schedule.length}`,
      );
    }
  }

  const subtitlePlan = input.subtitlePlan ?? [];
  const audioBgmPlan = input.audioBgmPlan ?? [];
  const rawBrollPlan = [...(input.brollPlan ?? [])].sort((a, b) => a.order - b.order || a.bindingId.localeCompare(b.bindingId));
  const projectedBroll = projectBrollPlacements(
    rawBrollPlan,
    resolvedClips.map(clip => ({
      clipNumber: clip.clipNumber,
      durationSeconds: clip.durationSeconds,
      sourceShotNumbers: clip.sourceShotNumbers,
      parentShotNumber: clip.parentShotNumber,
    })),
    expectedTargetDurationSeconds,
  );
  errors.push(...projectedBroll.errors);
  const brollPlan: AssemblyBrollPlanEntry[] = projectedBroll.items.map(item => ({
    ...(item.source as AssemblyBrollPlanInput),
    startSeconds: item.startSeconds,
    endSeconds: item.endSeconds,
  }));
  errors.push(...validateBrollPlan(brollPlan, expectedTargetDurationSeconds));

  // Subtitle-window sanity: a cue past the episode total is a repair action.
  for (const cue of subtitlePlan) {
    if (cue.endSeconds > expectedTargetDurationSeconds + 1e-9 || cue.endSeconds < cue.startSeconds) {
      repairActions.push({
        action: "repair_subtitle_mismatch",
        targetType: "subtitle",
        targetId: cue.subtitleCueId,
        message: `Subtitle cue ${cue.subtitleCueId} window [${cue.startSeconds}, ${cue.endSeconds}] is out of range.`,
      });
    }
  }

  const exportSettings: AssemblyExportSettings = {
    aspectRatio: "9:16",
    resolution: input.exportSettings?.resolution ?? "1080p",
    fps: input.exportSettings?.fps ?? 30,
    container: "mp4",
  };

  const ffmpegConcatPlan = resolvedClips.map(concatEntry);
  const concatText = ffmpegConcatPlan.join("\n") + (ffmpegConcatPlan.length ? "\n" : "");
  const subtitlesSrt = buildSubtitlesSrt(subtitlePlan);
  const ffmpegCommand = [
    "ffmpeg",
    "-f concat -safe 0 -i concat.txt",
    subtitlePlan.length ? "-i subtitles.srt" : "",
    `-r ${exportSettings.fps}`,
    "-c:v libx264 -pix_fmt yuv420p",
    subtitlePlan.length ? "-c:s mov_text" : "",
    "-aspect 9:16",
    `final_episode_${expectedTargetDurationSeconds}s_vertical.mp4`,
  ]
    .filter(Boolean)
    .join(" ");

  const manifest: VerticalDramaEpisodeAssemblyManifest = {
    handoffType: "video_assembly_manifest",
    targetDurationSeconds: expectedTargetDurationSeconds,
    assemblyManifestId: input.assemblyManifestId,
    durationProfileId: input.durationProfileId,
    profileKind: input.profileKind,
    subShotsEnabled,
    clips: resolvedClips,
    ffmpegConcatPlan,
    subtitlePlan,
    audioBgmPlan,
    ...(brollPlan.length ? { brollPlan } : {}),
    exportSettings,
    concatText,
    subtitlesSrt,
    audioPlan: audioBgmPlan,
    ffmpegCommand,
  };

  return { manifest, valid: errors.length === 0, errors, repairActions };
}

/** Reverse map: ledger filename → artifact stage enum. */
const STAGE_BY_FILENAME = Object.fromEntries(
  Object.entries(VERTICAL_DRAMA_ARTIFACT_FILENAME_BY_STAGE).map(([stage, file]) => [file, stage]),
) as Record<VerticalDramaArtifactFilename, VerticalDramaArtifactStage>;

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export interface RunDetailClipStatus {
  clipNumber: number;
  parentShotNumber?: number;
  subShotNumber?: number | null;
  mediaAssetId?: string;
  providerJobId?: string;
  providerStatus?: string;
  status?: string;
}

export interface RunDetailLedgerEntry {
  filename: VerticalDramaArtifactFilename;
  stage: VerticalDramaArtifactStage;
  present: boolean;
  artifactId?: string;
  runId?: string;
  checksumSha256?: string;
  mediaAssetIds?: string[];
  jsonPayload?: unknown;
  createdAt?: Date;
}

export interface RunDetail {
  runId: string;
  episodeId: string;
  seriesId: string;
  stage: string;
  status: string;
  mode: string;
  nextAction: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  ledger: RunDetailLedgerEntry[];
  clipProviderStatuses: RunDetailClipStatus[];
}

export interface RunSummary {
  runId: string;
  stage: string;
  status: string;
  mode: string;
  nextAction: string;
  createdAt: Date;
  updatedAt: Date;
}

export class VerticalDramaAssemblyService {
  /** Load an episode the caller owns (tenant + user + series). */
  private async loadEpisode(owner: AssemblyOwner): Promise<VerticalDramaEpisodeRow> {
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

  /** Create a run row for a stage and return its id (FK anchor for artifacts). */
  private async createRun(
    owner: AssemblyOwner,
    stage: string,
    mode: string,
    status: string,
    nextAction: string,
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
        status,
        nextAction,
        artifactIds: [],
        warnings: [],
        errors: [],
      })
      .returning({ id: verticalDramaEpisodeRuns.id });
    return row.id;
  }

  /** Persist an immutable artifact-ledger row and return it. */
  private async writeArtifact(
    owner: AssemblyOwner,
    runId: number,
    stage: VerticalDramaArtifactStage,
    payload: Record<string, unknown>,
    mediaAssetIds: number[] = [],
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
   * Import Storyboard Review clip outputs into episode run state — per-clip
   * media asset IDs, provider job IDs, and their last stable provider statuses
   * — and persist an `08_video_clip_manifest.json` artifact.
   */
  async importClips(
    owner: AssemblyOwner,
    args: { mode?: string; clips: ClipImportInput[] },
  ): Promise<{ runId: string; artifactId: string; clips: ClipImportInput[]; repairActions: AssemblyRepairAction[] }> {
    await this.loadEpisode(owner);
    const repairActions: AssemblyRepairAction[] = [];
    for (const c of args.clips) {
      if (c.status === "failed") {
        repairActions.push({
          action: "repair_failed_import",
          targetType: "clip",
          targetId: String(c.clipNumber),
          message: `Clip ${c.clipNumber} import failed.`,
        });
      }
    }
    const runId = await this.createRun(
      owner,
      "render_or_import_video_clips",
      args.mode ?? "render_video",
      repairActions.length > 0 ? "failed" : "succeeded",
      repairActions.length > 0 ? "repair" : "resume_next_stage",
    );
    const mediaAssetIds = args.clips
      .map((c) => Number(c.mediaAssetId))
      .filter((n) => Number.isFinite(n) && n > 0);
    const artifact = await this.writeArtifact(
      owner,
      runId,
      "video_clip_manifest",
      {
        stage: "video_clip_manifest",
        clips: args.clips.map((c) => ({
          clipNumber: c.clipNumber,
          sourceShotNumbers: c.sourceShotNumbers ?? [],
          durationSeconds: c.durationSeconds,
          mediaAssetId: c.mediaAssetId ?? null,
          providerJobId: c.providerJobId ?? null,
          providerStatus: c.providerStatus ?? null,
          parentShotNumber: c.parentShotNumber ?? null,
          subShotNumber: c.subShotNumber ?? null,
          status: c.status ?? (c.mediaAssetId ? "ready" : "planned"),
        })),
      },
      mediaAssetIds,
    );
    await db
      .update(verticalDramaEpisodeRuns)
      .set({ artifactIds: [String(artifact.id)] })
      .where(eq(verticalDramaEpisodeRuns.id, runId));
    return { runId: String(runId), artifactId: String(artifact.id), clips: args.clips, repairActions };
  }

  /**
   * Build the final assembly manifest, assign `assemblyManifestId`, persist the
   * `09_assembly_manifest.json` artifact, write the manifest onto the episode,
   * and write `assemblyManifestId` back onto the originating Storyboard Review
   * task so the review task and its assembly are linked bidirectionally.
   */
  async buildAndPersistAssemblyManifest(
    owner: AssemblyOwner,
    args: {
      mode?: string;
      clips: ClipImportInput[];
      subtitlePlan?: SubtitleCue[];
      audioBgmPlan?: AudioBgmTrack[];
      brollPlan?: AssemblyBrollPlanInput[];
      exportSettings?: Partial<AssemblyExportSettings>;
      subShotsEnabled?: boolean;
      profileKind?: AssemblyProfileKind;
    },
  ): Promise<{
    runId: string;
    artifactId: string;
    assemblyManifestId: string;
    manifest: VerticalDramaEpisodeAssemblyManifest;
    valid: boolean;
    errors: string[];
    repairActions: AssemblyRepairAction[];
    storyboardReviewLinked: boolean;
  }> {
    const episode = await this.loadEpisode(owner);
    // A new episode is governed by the exact profile captured at creation
    // time. Resolve it against the current series bible only when the IDs
    // still match; changing series settings must never reinterpret a legacy
    // episode or an episode created under an older profile.
    const [series] = await db
      .select({ bible: verticalDramaSeries.bible })
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.id, owner.seriesId),
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId),
        ),
      )
      .limit(1);
    const rawPlan = resolveVerticalDramaDurationPlan(
      series?.bible,
      episode.targetDurationSeconds,
    );
    const durationPlan =
      rawPlan?.status === "active" &&
      episode.durationProfileId === rawPlan.profileId
        ? rawPlan
        : resolveVerticalDramaEpisodeDurationPlan(
            episode.durationProfileId,
            episode.targetDurationSeconds,
          ) ?? undefined;
    const profileKind =
      args.profileKind ??
      (durationPlan
        ? "selected_9_shots"
        : profileKindForEpisode(episode.durationProfileId));
    const assemblyManifestId = `vdasm_${owner.seriesId}_${owner.episodeId}_${Date.now().toString(36)}`;

    let persistedBrollPlan = args.brollPlan;
    if (persistedBrollPlan === undefined) {
      const rows = await db.select().from(verticalDramaShotBrollBindings).where(and(
        eq(verticalDramaShotBrollBindings.tenantId, owner.tenantId),
        eq(verticalDramaShotBrollBindings.userId, owner.userId),
        eq(verticalDramaShotBrollBindings.seriesId, owner.seriesId),
        eq(verticalDramaShotBrollBindings.episodeId, owner.episodeId),
        eq(verticalDramaShotBrollBindings.active, true),
      )).orderBy(asc(verticalDramaShotBrollBindings.order), asc(verticalDramaShotBrollBindings.id)) as VerticalDramaShotBrollBinding[];
      if (rows.length) {
        await assertR2StorageActive();
        const sourceIds = rows.map(row => row.sourceAssetId).filter((id): id is number => id != null);
        const sourceRows: Array<Pick<VerticalDramaSourceAsset, "id" | "rightsStatus" | "disclosureStatus">> = sourceIds.length
          ? await db.select({ id: verticalDramaSourceAssets.id, rightsStatus: verticalDramaSourceAssets.rightsStatus, disclosureStatus: verticalDramaSourceAssets.disclosureStatus }).from(verticalDramaSourceAssets).where(and(
              inArray(verticalDramaSourceAssets.id, sourceIds),
              eq(verticalDramaSourceAssets.tenantId, owner.tenantId),
              eq(verticalDramaSourceAssets.userId, owner.userId),
            ))
          : [];
        const sourceById = new Map(sourceRows.map((row: Pick<VerticalDramaSourceAsset, "id" | "rightsStatus" | "disclosureStatus">) => [Number(row.id), row]));
        const mediaIds = rows.map(row => row.mediaAssetId).filter((id): id is number => id != null);
        const mediaRows: Array<Pick<MediaAsset, "id" | "status" | "storageKey">> = mediaIds.length
          ? await db.select({ id: mediaAssets.id, status: mediaAssets.status, storageKey: mediaAssets.storageKey }).from(mediaAssets).where(and(
              inArray(mediaAssets.id, mediaIds),
              eq(mediaAssets.tenantId, owner.tenantId),
              eq(mediaAssets.userId, owner.userId),
            ))
          : [];
        const mediaById = new Map(mediaRows.map((row: Pick<MediaAsset, "id" | "status" | "storageKey">) => [Number(row.id), row]));
        persistedBrollPlan = [];
        for (const row of rows) {
          const media = row.mediaAssetId == null ? undefined : mediaById.get(Number(row.mediaAssetId));
          const source = row.sourceAssetId == null ? undefined : sourceById.get(Number(row.sourceAssetId));
          if (!media || media.status !== "ready" || !media.storageKey || !(await storageExists(media.storageKey))) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `B-roll ${row.bindingId} is not available in owner-scoped R2 storage` });
          }
          if (source && !(source.rightsStatus === "creator_owned" || source.rightsStatus === "licensed" || (source.rightsStatus === "restricted" && source.disclosureStatus === "shown"))) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: `B-roll ${row.bindingId} is blocked by rights/disclosure status` });
          }
          persistedBrollPlan.push({
            bindingId: row.bindingId,
            shotNumber: row.shotNumber,
            order: row.order,
            ...(row.sourceSlotId == null ? {} : { sourceSlotId: row.sourceSlotId }),
            ...(row.sourceAssetId == null ? {} : { sourceAssetId: row.sourceAssetId }),
            mediaAssetId: String(row.mediaAssetId),
            ...(row.segmentId == null ? {} : { segmentId: row.segmentId }),
            ...(row.segmentRevision == null ? {} : { segmentRevision: row.segmentRevision }),
            mediaType: row.mediaType as "image" | "video",
            ...(row.inSeconds == null ? {} : { inSeconds: row.inSeconds }),
            ...(row.outSeconds == null ? {} : { outSeconds: row.outSeconds }),
            ...(row.displayDurationSeconds == null ? {} : { displayDurationSeconds: row.displayDurationSeconds }),
            fitMode: row.fitMode as "cover" | "contain" | "crop_safe",
            transform: parseShotBrollTransform(row.transformJson),
            audioPolicy: row.audioPolicy as "keep" | "mute" | "replace",
            labelMode: row.labelMode as "none" | "source" | "archive" | "ai_illustration",
            startSeconds: 0,
            endSeconds: 0,
          });
        }
      }
    }
    const build = buildAssemblyManifest({
      assemblyManifestId,
      durationProfileId: episode.durationProfileId,
      profileKind,
      clips: args.clips,
      subtitlePlan: args.subtitlePlan,
      audioBgmPlan: args.audioBgmPlan,
      exportSettings: args.exportSettings,
      subShotsEnabled: args.subShotsEnabled,
      durationPlan,
      brollPlan: persistedBrollPlan,
    });

    const runId = await this.createRun(
      owner,
      "assemble_episode_manifest",
      args.mode ?? "full",
      build.valid ? "succeeded" : "failed",
      build.valid ? "resume_next_stage" : "repair",
    );

    const mediaAssetIds = build.manifest.clips
      .map((c) => Number(c.mediaAssetId))
      .filter((n) => Number.isFinite(n) && n > 0);

    const artifact = await this.writeArtifact(
      owner,
      runId,
      "assembly_manifest",
      { stage: "assembly_manifest", ...(build.manifest as unknown as Record<string, unknown>) },
      mediaAssetIds,
    );
    await db
      .update(verticalDramaEpisodeRuns)
      .set({ artifactIds: [String(artifact.id)] })
      .where(eq(verticalDramaEpisodeRuns.id, runId));

    // Persist the manifest onto the episode + record the assemblyManifestId.
    await db
      .update(verticalDramaEpisodes)
      .set({ assemblyManifest: build.manifest as unknown as object, updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaEpisodes.id, owner.episodeId),
          eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        ),
      );

    // Bidirectional link: write assemblyManifestId back onto the originating
    // Storyboard Review task (media_studio_storyboard_reviews.reviewData).
    let storyboardReviewLinked = false;
    if (episode.storyboardReviewId) {
      const reviewId = Number(episode.storyboardReviewId);
      if (Number.isFinite(reviewId) && reviewId > 0) {
        const [review] = await db
          .select()
          .from(mediaStudioStoryboardReviews)
          .where(
            and(
              eq(mediaStudioStoryboardReviews.id, reviewId),
              eq(mediaStudioStoryboardReviews.userId, owner.userId),
            ),
          )
          .limit(1);
        if (review) {
          const reviewData =
            review.reviewData && typeof review.reviewData === "object"
              ? (review.reviewData as Record<string, unknown>)
              : {};
          await db
            .update(mediaStudioStoryboardReviews)
            .set({
              reviewData: { ...reviewData, assemblyManifestId, assemblyEpisodeId: String(owner.episodeId) },
              updatedAt: new Date(),
            })
            .where(eq(mediaStudioStoryboardReviews.id, reviewId));
          storyboardReviewLinked = true;
        }
      }
    }

    return {
      runId: String(runId),
      artifactId: String(artifact.id),
      assemblyManifestId,
      manifest: build.manifest,
      valid: build.valid,
      errors: build.errors,
      repairActions: build.repairActions,
      storyboardReviewLinked,
    };
  }

  /**
   * Mark a run `assembly_ready` when a final render cannot run. Keeps all
   * deterministic inputs inspectable and writes the export-adjacent metadata
   * (`concat.txt`, `subtitles.srt`, `audio_plan.json`, `ffmpeg_command.sh`) into
   * the assembly artifact ledger. Creates an auto-approved memory checkpoint
   * (manual approval removed from the product workflow, 2026-07-07) — an
   * audit record only, never a memory mutation.
   */
  async markAssemblyReady(
    owner: AssemblyOwner,
    args: { runId: number; reason?: string },
  ): Promise<{ runId: string; status: "assembly_ready"; checkpointId: string }> {
    await this.loadEpisode(owner);
    // Confirm the run belongs to this episode (tenant + user scoped).
    const [run] = await db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.id, args.runId),
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.userId, owner.userId),
          eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        ),
      )
      .limit(1);
    if (!run) throw new Error("vertical_drama_run_not_found");

    await db
      .update(verticalDramaEpisodeRuns)
      .set({ status: "assembly_ready", nextAction: "export", updatedAt: new Date() })
      .where(eq(verticalDramaEpisodeRuns.id, args.runId));

    // Auto-approved memory checkpoint after assembly/export (manual approval
    // removed from the product workflow, 2026-07-07) — kept as an audit
    // record only; it no longer accumulates as a stale "pending approval"
    // badge on the series list.
    const [checkpoint] = await db
      .insert(verticalDramaApprovalCheckpoints)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId: args.runId,
        stage: "summarize_episode_to_series_memory",
        state: "approved",
        approvedByUserId: owner.userId,
        sourceArtifactIds: (run.artifactIds as string[] | null) ?? [],
        repairRequestIds: [],
        notes:
          args.reason ??
          "assembly_ready: final render deferred; export metadata inspectable (auto-approved)",
      })
      .returning({ id: verticalDramaApprovalCheckpoints.id });

    return { runId: String(args.runId), status: "assembly_ready", checkpointId: String(checkpoint.id) };
  }

  /**
   * Record export completion (spec §09 tasks 8-10): persist a final media asset
   * id + QC report row, an append-only memory-event CANDIDATE, and an
   * auto-approved memory checkpoint (manual approval removed from the
   * product workflow, 2026-07-07) kept only as an audit record. Memory is
   * not auto-mutated by this method — the candidate event is written
   * unapproved (`approved: null`) and only applied by whatever later reviews
   * it.
   */
  async recordExportCompletion(
    owner: AssemblyOwner,
    args: {
      runId: number;
      finalMediaAssetId?: string;
      qc?: { passed: boolean; score: number; issues?: unknown[]; recommendedRepairs?: unknown[] };
      recapSummary?: string;
    },
  ): Promise<{ qcReportId: string; memoryEventId: string; checkpointId: string }> {
    await this.loadEpisode(owner);
    const [run] = await db
      .select({ id: verticalDramaEpisodeRuns.id, artifactIds: verticalDramaEpisodeRuns.artifactIds })
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.id, args.runId),
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.userId, owner.userId),
          eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        ),
      )
      .limit(1);
    if (!run) throw new Error("vertical_drama_run_not_found");

    // Searchable QC report row for export/assembly QC.
    const [qc] = await db
      .insert(verticalDramaQcReports)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId: args.runId,
        stage: "assembly",
        passed: args.qc?.passed ?? true,
        score: args.qc?.score ?? 1,
        issues: (args.qc?.issues as object) ?? [],
        recommendedRepairs: (args.qc?.recommendedRepairs as object) ?? [],
      })
      .returning({ id: verticalDramaQcReports.id });

    // Append-only memory-event candidate for the episode recap (not approved).
    const [event] = await db
      .insert(verticalDramaMemoryEvents)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId: args.runId,
        memoryKind: "episode_summary",
        payload: {
          kind: "episode_recap_candidate",
          finalMediaAssetId: args.finalMediaAssetId ?? null,
          pending: true,
        },
        summaryText: args.recapSummary ?? "Episode recap (pending approval — not yet applied)",
        supersedesEventIds: [],
        approved: null,
      })
      .returning({ id: verticalDramaMemoryEvents.id });

    // Auto-approved memory checkpoint (manual approval removed from the
    // product workflow, 2026-07-07) — kept as an audit record only; it no
    // longer accumulates as a stale "pending approval" badge on the series
    // list.
    const [checkpoint] = await db
      .insert(verticalDramaApprovalCheckpoints)
      .values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: owner.seriesId,
        episodeId: owner.episodeId,
        runId: args.runId,
        stage: "summarize_episode_to_series_memory",
        state: "approved",
        approvedByUserId: owner.userId,
        sourceArtifactIds: (run.artifactIds as string[] | null) ?? [],
        repairRequestIds: [],
        notes: "export_complete: memory recap candidate (auto-approved)",
      })
      .returning({ id: verticalDramaApprovalCheckpoints.id });

    if (args.finalMediaAssetId) {
      await db
        .update(verticalDramaEpisodeRuns)
        .set({ status: "completed", nextAction: "none", updatedAt: new Date() })
        .where(eq(verticalDramaEpisodeRuns.id, args.runId));
    }

    return {
      qcReportId: String(qc.id),
      memoryEventId: String(event.id),
      checkpointId: String(checkpoint.id),
    };
  }

  /** Distinct run summaries for an episode's run selector (most recent first). */
  async listRunsForEpisode(owner: AssemblyOwner, limit = 200): Promise<RunSummary[]> {
    await this.loadEpisode(owner);
    const rows: VerticalDramaEpisodeRunRow[] = await db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.userId, owner.userId),
          eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        ),
      )
      .orderBy(desc(verticalDramaEpisodeRuns.updatedAt), desc(verticalDramaEpisodeRuns.id))
      .limit(limit);
    return rows.map((r: (typeof rows)[number]) => ({
      runId: String(r.id),
      stage: r.stage,
      status: r.status,
      mode: r.runMode,
      nextAction: r.nextAction,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Read-only run-detail: the full artifact ledger for a selected past run of an
   * episode plus per-clip provider job IDs and stable statuses. Because
   * artifacts are immutable and durable, this renders for archived series and
   * completed episodes just as for active ones.
   *
   * The ledger is assembled as a snapshot AS OF the selected run: for each of the
   * 16 ledger filenames we take the most recent artifact for that stage produced
   * at or before the run (its own artifacts win ties), falling back to `missing`.
   */
  async getRunDetail(owner: AssemblyOwner, runId: number): Promise<RunDetail> {
    await this.loadEpisode(owner);
    const [run] = await db
      .select()
      .from(verticalDramaEpisodeRuns)
      .where(
        and(
          eq(verticalDramaEpisodeRuns.id, runId),
          eq(verticalDramaEpisodeRuns.tenantId, owner.tenantId),
          eq(verticalDramaEpisodeRuns.userId, owner.userId),
          eq(verticalDramaEpisodeRuns.seriesId, owner.seriesId),
          eq(verticalDramaEpisodeRuns.episodeId, owner.episodeId),
        ),
      )
      .limit(1);
    if (!run) throw new Error("vertical_drama_run_not_found");

    // All artifacts for this episode up to and including the selected run's time.
    const artifacts = await db
      .select()
      .from(verticalDramaRunArtifacts)
      .where(
        and(
          eq(verticalDramaRunArtifacts.tenantId, owner.tenantId),
          eq(verticalDramaRunArtifacts.userId, owner.userId),
          eq(verticalDramaRunArtifacts.seriesId, owner.seriesId),
          eq(verticalDramaRunArtifacts.episodeId, owner.episodeId),
          lte(verticalDramaRunArtifacts.createdAt, run.createdAt),
        ),
      )
      .orderBy(asc(verticalDramaRunArtifacts.createdAt), asc(verticalDramaRunArtifacts.id));

    // Most-recent artifact per stage (this run's artifacts win ties).
    const latestByStage = new Map<string, VerticalDramaRunArtifactRow>();
    for (const a of artifacts) {
      latestByStage.set(a.stage, a);
    }

    const ledger: RunDetailLedgerEntry[] = VERTICAL_DRAMA_ARTIFACT_LEDGER.map((filename) => {
      const stage = STAGE_BY_FILENAME[filename];
      const a = latestByStage.get(stage);
      if (!a) {
        return { filename, stage, present: false };
      }
      return {
        filename,
        stage,
        present: true,
        artifactId: String(a.id),
        runId: String(a.runId),
        checksumSha256: a.checksumSha256 ?? undefined,
        mediaAssetIds: (a.mediaAssetIds as unknown[] | null)?.map((x) => String(x)),
        jsonPayload: a.jsonPayload,
        createdAt: a.createdAt,
      };
    });

    // Per-clip provider statuses from the assembly / clip-manifest artifact.
    const clipSource =
      latestByStage.get("assembly_manifest") ?? latestByStage.get("video_clip_manifest");
    const clipProviderStatuses: RunDetailClipStatus[] = [];
    const payload = clipSource?.jsonPayload as Record<string, unknown> | undefined;
    const clips = (payload?.clips as Array<Record<string, unknown>> | undefined) ?? [];
    for (const c of clips) {
      clipProviderStatuses.push({
        clipNumber: Number(c.clipNumber),
        parentShotNumber: c.parentShotNumber == null ? undefined : Number(c.parentShotNumber),
        subShotNumber: c.subShotNumber == null ? null : Number(c.subShotNumber),
        mediaAssetId: c.mediaAssetId == null ? undefined : String(c.mediaAssetId),
        providerJobId: c.providerJobId == null ? undefined : String(c.providerJobId),
        providerStatus: c.providerStatus == null ? undefined : String(c.providerStatus),
        status: c.status == null ? undefined : String(c.status),
      });
    }

    return {
      runId: String(run.id),
      episodeId: String(owner.episodeId),
      seriesId: String(owner.seriesId),
      stage: run.stage,
      status: run.status,
      mode: run.runMode,
      nextAction: run.nextAction,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      ledger,
      clipProviderStatuses,
    };
  }
}

/** Shared singleton. */
export const verticalDramaAssemblyService = new VerticalDramaAssemblyService();
