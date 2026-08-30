/**
 * Vertical Drama Series — Production Episodes assembly (Phase D′-1,
 * `planning/vertical-drama-production-episodes/plan.md`).
 *
 * MODEL (see the plan doc + `memory/project_vd_episode_terminology.md`):
 *  - Sub-Episode = today's "ตอน" (a `vertical_drama_episodes` row, ~9 shots)
 *    -> one short compiled video via `verticalDramaEpisodes.assembleEpisodeVideo`,
 *    persisted at `episode.assemblyManifest.compiledVideo.videoUrl`
 *    (`server/services/verticalDramaEpisodeVideoAssembly.ts`).
 *  - Production Episode = a GROUP of 5 or 10 CONSECUTIVE Sub-Episodes' own
 *    compiled videos, concatenated into ONE 4-10 minute video — the
 *    publishable unit. Group size is caller-selected (5 or 10).
 *
 * This service deliberately does NOT reinvent the download/concat/upload
 * ffmpeg machinery — it reuses `downloadClipToFile` /
 * `buildConcatListFileContent` / `buildConcatFfmpegArgs` /
 * `defaultFfmpegRunner` / `probeDurationSeconds` from
 * `verticalDramaEpisodeVideoAssembly.ts` (all already exported for this
 * purpose) and `storagePutFromPath` from `../storage`, exactly the same way
 * `verticalDramaSeriesTrailerAssembly.ts` already does for the sibling
 * series-level "narrated trailer" feature (see that file's own header doc
 * comment for the same architecture rationale). Every source video fed into
 * THIS concat is already itself the OUTPUT of a prior
 * `buildConcatFfmpegArgs` re-encode (1080x1920 h264/yuv420p/aac), so — unlike
 * the trailer service, which normalizes raw images/short video excerpts of
 * differing source shapes before its own concat — the PLAIN re-encode concat
 * (`buildConcatFfmpegArgs` as-is, no per-segment Ken-Burns/trim step) is
 * already correct here.
 *
 * The only genuinely NEW code in this file is: (a) chunking sub-episodes
 * into consecutive groups, (b) the missing-compiled-video precondition
 * check, and (c) the `verticalDramaSeries.productionEpisodesManifest` JSONB
 * read-modify-write persistence — mirroring `persistCompiledVideoState`'s /
 * `persistTrailerState`'s own convention, but keyed by series (not episode)
 * and covering an ARRAY of groups instead of one single state.
 *
 * Submission is in-process fire-and-forget (matches every sibling assembly
 * feature in this codebase): `assembleProductionEpisodesForSeries` performs
 * the DB load + precondition check + chunk + persist-pending-manifest
 * SYNCHRONOUSLY (so a caller sees a definitive PRECONDITION_FAILED error, or
 * a definitive "queued" manifest, immediately), then kicks off each group's
 * ffmpeg job in the background, ONE GROUP AT A TIME (never parallel — same
 * single-host resource-budget rationale as `submitSequentialAssemblyJobs`).
 *
 * Idempotent re-assembly: a group already `status: "completed"` in the
 * EXISTING persisted manifest, whose `subEpisodeNumbers` + `groupSize`
 * exactly match what this call recomputed, is left untouched (not
 * re-rendered) — this is what makes `groupsSkipped` meaningful when a caller
 * re-runs assembly after compiling a few more Sub-Episodes (only the NEW
 * trailing group(s) actually run ffmpeg again). A group whose membership
 * changed, or that previously failed, is always (re)run. This is a
 * lightweight, low-risk comparison (`episodeNumber`s only, not video
 * content) — if a member Sub-Episode's compiled video is silently
 * re-rendered to a new URL without its `episodeNumber` set changing, the
 * already-completed Production Episode group is NOT auto-invalidated; that
 * is an accepted v1 limitation, not a correctness bug for THIS wave.
 *
 * Phase B-1 (`planning/vertical-drama-production-render/plan.md` Phase B,
 * "audio bed + ducking attached at the Production Episode level") adds an
 * OPTIONAL BGM-mix ffmpeg post-pass, run AFTER a group's own concat produces
 * its video (`runProductionEpisodeGroupJob`): when the caller supplies
 * `bgm`, the track is downloaded (same `downloadClipToFile` machinery),
 * looped to the concat's own probed duration, and mixed under — optionally
 * sidechain-ducked against — that concat's own audio via the new pure
 * `buildBgmMixFfmpegArgs` graph builder (`verticalDramaFinalRenderGraph.ts`).
 * Omitted `bgm` (every pre-existing caller) is byte-identical to before this
 * wave: no second ffmpeg pass. The `bgm` settings are persisted onto each
 * group's state exactly like `renderOptions` (see
 * `VerticalDramaProductionEpisodeGroupStateWithBgm`'s own doc comment for why
 * that widening is LOCAL to this file rather than the shared
 * `@shared/verticalDramaSeries/assembly.ts` module).
 *
 * Phase C-1 (`planning/vertical-drama-production-render/plan.md` Phase C)
 * adds a SECOND, independently-optional post-pass — a scrolling credits
 * roll — run AFTER the bgm post-pass (if any): when the caller supplies
 * `credits`, `buildCreditsAssFile` renders the credits text into a `.ass`
 * file tail-anchored to the group's own (already-probed) duration, and
 * `buildCreditsBurnFfmpegArgs` burns it in via ffmpeg's `subtitles` filter
 * (both pure builders in `verticalDramaFinalRenderGraph.ts`). Omitted
 * `credits` (every pre-existing caller) is byte-identical to before this
 * wave: no extra ffmpeg pass. `credits` is persisted onto each group's state
 * the SAME way `bgm` is (see `VerticalDramaProductionEpisodeGroupStateWithBgm`).
 *
 * Phase C-2 (this same plan.md Phase C, "overlays generalization") adds a
 * THIRD, independently-optional post-pass — an UNLIMITED (caller-capped),
 * caller-authored list of ad-hoc timed text overlays
 * (`{atSeconds, durationSeconds, text, style}`), also attached at the
 * PRODUCTION EPISODE level. When BOTH `overlays` and `credits` are supplied
 * for the SAME call, `runProductionEpisodeGroupJob` FOLDS them into ONE
 * additional ffmpeg re-encode (chaining two `subtitles=` filter stages via
 * the new `buildAssBurnFfmpegArgs`) instead of two sequential re-encodes; a
 * call with `credits` but no `overlays` keeps using the ORIGINAL,
 * UNTOUCHED `buildCreditsBurnFfmpegArgs` call from Phase C-1. Omitted
 * `overlays` (and an EMPTY array — every pre-existing caller) is
 * byte-identical to before this wave: no extra ffmpeg pass. `overlays` is
 * persisted onto each group's state the SAME way `bgm`/`credits` are (see
 * `VerticalDramaProductionEpisodeGroupStateWithBgm`).
 */

import { randomUUID } from "crypto";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaEpisodes, verticalDramaSeries } from "../../drizzle/schema";
import { assertR2StorageActive, storagePutFromPath } from "../storage";
import { debugError } from "../_core/logger";
import {
  buildConcatFfmpegArgs,
  buildConcatListFileContent,
  compiledVideoFilename,
  defaultFfmpegRunner,
  downloadClipToFile,
  extractClipSourcesFromMotionPromptPack,
  inferDownloadExtension,
  probeDurationSeconds,
  resolveClipsForAssembly,
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs,
  resolveVdSubtitleFontsDir,
  runAssemblyJob,
  type AssembleEpisodeVideoOwner,
  type FfmpegRunner,
} from "./verticalDramaEpisodeVideoAssembly";
// Render-options LEVEL (plan.md "Render-options LEVEL", user correction
// 2026-07-13) — `CaptionPresetId`/`SubtitleFontSizeId` back
// `ProductionEpisodeRenderOptions` below. Phase B-1
// (`planning/vertical-drama-production-render/plan.md` Phase B) additionally
// imports the pure `buildBgmMixFfmpegArgs` graph builder for the BGM-mix
// post-pass, Phase C-1 (Phase C) the pure `buildCreditsAssFile`/
// `buildCreditsBurnFfmpegArgs` graph builders for the credits-roll post-pass,
// and Phase C-2 (this same plan.md Phase C, "overlays generalization") the
// pure `buildProductionOverlaysAssFile`/`buildAssBurnFfmpegArgs` graph
// builders for the timed-overlays post-pass (all `runProductionEpisodeGroupJob`
// below). All are from a pure, side-effect-free sibling service (only
// imports `zod` + `@shared/hyperframes/runtimeApiSchemas` +
// `@shared/verticalDramaSeries/adBannerPresets` — no `../storage`, no ffmpeg
// spawn, no DB), so a normal static import here carries none of
// `verticalDramaEpisodeVideoAssembly.ts`'s own "heavy, lazily-imported-by-the-
// router" posture — this whole SERVICE module is already lazily imported by
// the router (see `verticalDramaSeries.ts`'s own `assembleProductionEpisodes`
// doc comment), so nothing downstream is at risk either way.
import {
  buildAssBurnFfmpegArgs,
  buildBgmMixFfmpegArgs,
  buildCreditsAssFile,
  buildCreditsBurnFfmpegArgs,
  buildProductionOverlaysAssFile,
  type CaptionPresetId,
  type ProductionEpisodeOverlayItem,
  type SubtitleFontSizeId,
} from "./verticalDramaFinalRenderGraph";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
// Vertical Drama Render Queue plan §4.2 Wave 3 — enqueue-only entry point
// for the `vertical_drama_ffmpeg_assembly` worker job type; replaces the
// in-process `runProductionEpisodeGroupJob` fire-and-forget chain below.
import { queueVerticalDramaFfmpegAssemblyJob } from "./workerSchedulerService";
import {
  resolveAudienceAgeRating,
  type AudienceAgeRating,
} from "@shared/verticalDramaSeries/audienceAgeRating";
import type { VerticalDramaMotionPromptPack } from "@shared/verticalDramaSeries";
import type { VerticalDramaDialogueAudioPlan } from "@shared/verticalDramaSeries/audio";
import type { VdDialogueTimelineClip } from "@shared/verticalDramaSeries/dialogueAudioTimeline";
import type {
  VerticalDramaProductionEpisodeGroupState,
  VerticalDramaProductionEpisodesManifest,
} from "@shared/verticalDramaSeries/assembly";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export const VD_PRODUCTION_EPISODE_MIN_GROUP_SIZE = 3 as const;
export const VD_PRODUCTION_EPISODE_MAX_GROUP_SIZE = 50 as const;

export type ProductionEpisodeGroupSize = number;
export type ProductionEpisodeSourceMode =
  | "auto"
  | "compiled_only"
  | "shot_assembly";

export interface ProductionEpisodeRangeGroup {
  index: number;
  productionEpisodeNumber: number;
  subEpisodeNumbers: number[];
  isRemainder: boolean;
}

export function validateProductionEpisodeGroupingInput(input: {
  startSubEpisode: number;
  endSubEpisode: number;
  subEpisodesPerProductionEpisode: number;
}): void {
  if (!Number.isInteger(input.startSubEpisode) || input.startSubEpisode < 1) {
    throw new Error("vertical_drama_production_invalid_start_subepisode");
  }
  if (!Number.isInteger(input.endSubEpisode) || input.endSubEpisode < input.startSubEpisode) {
    throw new Error("vertical_drama_production_invalid_subepisode_range");
  }
  if (
    !Number.isInteger(input.subEpisodesPerProductionEpisode) ||
    input.subEpisodesPerProductionEpisode < VD_PRODUCTION_EPISODE_MIN_GROUP_SIZE ||
    input.subEpisodesPerProductionEpisode > VD_PRODUCTION_EPISODE_MAX_GROUP_SIZE
  ) {
    throw new Error(
      `vertical_drama_production_group_size_must_be_${VD_PRODUCTION_EPISODE_MIN_GROUP_SIZE}_to_${VD_PRODUCTION_EPISODE_MAX_GROUP_SIZE}`
    );
  }
}

export function partitionProductionEpisodeRange(input: {
  startSubEpisode: number;
  endSubEpisode: number;
  subEpisodesPerProductionEpisode: number;
}): ProductionEpisodeRangeGroup[] {
  validateProductionEpisodeGroupingInput(input);
  const groups: ProductionEpisodeRangeGroup[] = [];
  const total = input.endSubEpisode - input.startSubEpisode + 1;
  for (let offset = 0, index = 0; offset < total; offset += input.subEpisodesPerProductionEpisode, index += 1) {
    const count = Math.min(input.subEpisodesPerProductionEpisode, total - offset);
    groups.push({
      index,
      productionEpisodeNumber: index + 1,
      subEpisodeNumbers: Array.from({ length: count }, (_, i) => input.startSubEpisode + offset + i),
      isRemainder: count < input.subEpisodesPerProductionEpisode,
    });
  }
  return groups;
}

export interface ProductionEpisodeOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

/** One Sub-Episode as seen by this service — its own compiled-video URL (if any). */
export interface ProductionEpisodeSourceSubEpisode {
  episodeNumber: number;
  videoUrl?: string | null;
}

/**
 * Render-options LEVEL (plan.md "Render-options LEVEL" section, user
 * correction 2026-07-13) — the SAME styling fields
 * `verticalDramaEpisodes.assembleEpisodeVideo` accepts
 * (`subtitlePreset`/`subtitleFontSize`/`showAgeBadge`/`includeDialogueAudio`/
 * `loudnessNormalize`), reused here so a Production Episode's styling is
 * configured ONCE and applied UNIFORMLY across every Sub-Episode in the
 * group, instead of per Sub-Episode. STRICT server-side type (unlike
 * `VerticalDramaProductionEpisodeGroupState.renderOptions` in
 * `@shared/verticalDramaSeries/assembly.ts`, which is deliberately loosely
 * typed since that module is dependency-free/shared with the client) — a
 * value of THIS type always structurally satisfies that looser one.
 */
export interface ProductionEpisodeRenderOptions {
  subtitlePreset?: CaptionPresetId | "none";
  subtitleFontSize?: SubtitleFontSizeId;
  showAgeBadge?: boolean;
  includeDialogueAudio?: boolean;
  loudnessNormalize?: boolean;
}

/**
 * Phase B-1 (`planning/vertical-drama-production-render/plan.md` Phase B) —
 * background-music bed + ducking configuration for ONE
 * `assembleProductionEpisodesForSeries` call, applied UNIFORMLY as a
 * POST-PASS over every group's own concatenated video (see
 * `runProductionEpisodeGroupJob` below). Mirrors
 * `ProductionEpisodeRenderOptions`'s own "STRICT server-side type, always
 * already-resolved by the router's zod `.default()`s" convention:
 * `volumePercent`/`duckUnderVideoAudio` are never optional here, since the
 * router never forwards a `bgm` object with either field missing.
 */
export interface ProductionEpisodeBgmOptions {
  /** `z.string()` (not `.url()`) at the router — same relative-path
   *  tolerance as `VdBgmTrack.url` (`@shared/verticalDramaSeries/standout.ts`)
   *  and every other asset URL field in this codebase (local storage returns
   *  `/api/storage/...` paths); downloaded via the SAME `downloadClipToFile`
   *  this file already reuses for every Sub-Episode's own compiled video. */
  url: string;
  /** 1-100; router default 35. The LINEAR volume (`volumePercent / 100`) the
   *  BGM is mixed in at, BEFORE any ducking attenuation — see
   *  `buildBgmMixFilterComplex`'s own doc comment
   *  (`verticalDramaFinalRenderGraph.ts`). */
  volumePercent: number;
  /** Router default `true`. When `true`, the BGM ducks under this group's
   *  OWN audio (dialogue + native clip SFX) via `sidechaincompress`; when
   *  `false`, the volume-scaled BGM is mixed in flat. */
  duckUnderVideoAudio: boolean;
}

/**
 * Phase C-1 (`planning/vertical-drama-production-render/plan.md` Phase C) —
 * an OPTIONAL scrolling credits roll for ONE `assembleProductionEpisodesForSeries`
 * call, applied UNIFORMLY as a POST-PASS over every group's own
 * (already-concatenated, and already-BGM-mixed if `bgm` was ALSO supplied)
 * video — run AFTER the bgm post-pass, see `runProductionEpisodeGroupJob`
 * below. Credits are a PUBLIC-DELIVERABLE concern — they only ever attach at
 * the PRODUCTION EPISODE level (never per Sub-Episode), mirroring `bgm`'s
 * own "Terminology model" placement. Rendered via the pure
 * `buildCreditsAssFile`/`buildCreditsBurnFfmpegArgs` graph builders
 * (`verticalDramaFinalRenderGraph.ts`) — see that section's own header doc
 * comment for the scroll-vs-end-card design decision.
 */
export interface ProductionEpisodeCreditsOptions {
  /** Multi-line credits text — one name/role per line
   *  (`z.string().min(1).max(4000)` at the router). Split into individual
   *  roll lines by `splitCreditsRollLines`
   *  (`verticalDramaFinalRenderGraph.ts`); interior blank lines are
   *  preserved as intentional section spacing (e.g. between "Cast" and
   *  "Crew"). */
  text: string;
}

/**
 * Local, ADDITIVE extension of the shared
 * `VerticalDramaProductionEpisodeGroupState`
 * (`@shared/verticalDramaSeries/assembly.ts`) — adds the `bgm` (Phase B-1)
 * and `credits` (Phase C-1) fields this service persists onto a group's
 * state, mirroring exactly how that shared type's own `renderOptions` field
 * is persisted (set once at "pending" time in the `groupStates` map below,
 * then carried through unchanged to "completed"/"failed" since
 * `patchProductionEpisodeGroupState` never touches any of these fields).
 * Kept LOCAL to this file rather than added to the shared module itself —
 * that module is outside THIS change's assigned file scope for this working
 * session (a concurrent session may be editing it); every value of this
 * WIDER local type still structurally satisfies the shared one (`bgm`/
 * `credits`/`overlays` are only ever ADDED optional fields), so it
 * round-trips through the `productionEpisodesManifest` JSONB column and
 * every existing shared-type-typed consumer completely unchanged. A natural
 * follow-up is to fold `bgm`/`credits`/`overlays` into the shared type
 * directly, alongside `renderOptions`.
 */
export interface VerticalDramaProductionEpisodeGroupStateWithBgm
  extends Omit<VerticalDramaProductionEpisodeGroupState, "bgm"> {
  bgm?: ProductionEpisodeBgmOptions;
  credits?: ProductionEpisodeCreditsOptions;
  /** Phase C-2 — see this file's own header doc comment. */
  overlays?: ProductionEpisodeOverlayItem[];
}

/** Local mirror of `VerticalDramaProductionEpisodesManifest` whose
 *  `episodes` carry the WIDER per-group type above — see that type's own doc
 *  comment for why this is defined locally instead of editing the shared
 *  module in this wave. */
export interface ProductionEpisodesManifestWithBgm {
  groupSize: number;
  episodes: VerticalDramaProductionEpisodeGroupStateWithBgm[];
}

/**
 * A Sub-Episode as LOADED FROM THE DB for a real assembly run — everything
 * `ProductionEpisodeSourceSubEpisode` has, PLUS the raw fields needed to
 * freshly re-render it under Render-options LEVEL (`renderSubEpisodeWithOptions`
 * below). `chunkSubEpisodesIntoGroups`/`resolveSubEpisodesForProductionAssembly`
 * are generic over `T extends ProductionEpisodeSourceSubEpisode`, so this
 * richer shape flows through them unchanged (no changes needed to either
 * pure helper, or to their existing unit tests, which construct the plainer
 * base shape directly).
 */
interface ProductionEpisodeSourceSubEpisodeRow extends ProductionEpisodeSourceSubEpisode {
  episodeId: number;
  motionPromptPack: VerticalDramaMotionPromptPack | null;
  dialogueAudioPlan: VerticalDramaDialogueAudioPlan | null;
}

/* -------------------------------------------------------------------------- */
/* Pure helpers — chunking + precondition logic (unit-testable)               */
/* -------------------------------------------------------------------------- */

/**
 * Split sub-episodes into consecutive Production Episode groups of
 * `groupSize`, ordered by `episodeNumber` ascending. The LAST group may be
 * short (fewer than `groupSize` members) when the count doesn't divide
 * evenly — never dropped, never padded. Pure and fully generic (only
 * requires an `episodeNumber` field), so it is unit-testable without any DB
 * row or video-url shape, and reusable regardless of whether the caller has
 * already filtered down to sub-episodes with a compiled video.
 */
export function chunkSubEpisodesIntoGroups<T extends { episodeNumber: number }>(
  subEpisodes: T[],
  groupSize: ProductionEpisodeGroupSize
): T[][] {
  const ordered = subEpisodes
    .slice()
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  const groups: T[][] = [];
  for (let i = 0; i < ordered.length; i += groupSize) {
    groups.push(ordered.slice(i, i + groupSize));
  }
  return groups;
}

/**
 * Sub-Episode numbers (ascending) missing a usable compiled video. Empty
 * when every sub-episode has one.
 */
export function findSubEpisodesMissingCompiledVideo<
  T extends ProductionEpisodeSourceSubEpisode,
>(subEpisodes: T[]): number[] {
  return subEpisodes
    .filter(e => !e.videoUrl || !e.videoUrl.trim())
    .map(e => e.episodeNumber)
    .sort((a, b) => a - b);
}

/**
 * Resolve which sub-episodes are usable for Production Episode assembly,
 * honoring `allowPartial`. Mirrors `resolveClipsForAssembly`
 * (`verticalDramaEpisodeVideoAssembly.ts`) at the whole-series level: throws
 * a plain `Error` with a human-readable, user-facing message (mapped to
 * `PRECONDITION_FAILED` at the router) listing missing sub-episode numbers
 * when `!allowPartial`; otherwise returns only the sub-episodes that DO have
 * a compiled video, in `episodeNumber` order — ready to be handed to
 * `chunkSubEpisodesIntoGroups`.
 */
export function resolveSubEpisodesForProductionAssembly<
  T extends ProductionEpisodeSourceSubEpisode,
>(subEpisodes: T[], opts: { allowPartial?: boolean } = {}): { usable: T[]; missing: number[] } {
  const ordered = subEpisodes
    .slice()
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  const missing = findSubEpisodesMissingCompiledVideo(ordered);

  if (missing.length > 0 && !opts.allowPartial) {
    throw new Error(
      `vertical_drama_production_missing_subepisodes: sub-episode(s) ${missing.join(", ")} need a compiled video first.`
    );
  }

  const usable = ordered.filter(e => e.videoUrl && e.videoUrl.trim());
  if (usable.length === 0) {
    throw new Error(
      "vertical_drama_production_no_compiled_subepisodes: no sub-episodes have a compiled video yet."
    );
  }

  return { usable, missing };
}

/** True when two `episodeNumber[]` arrays are identical, in order. Used to
 *  decide whether an existing COMPLETED group can be reused as-is. */
function subEpisodeNumbersEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((n, i) => n === b[i]);
}

/* -------------------------------------------------------------------------- */
/* Narrow, defensive jsonb read (mirrors `extractEpisodeCompiledVideoSummary` */
/* in `routers/verticalDramaSeries.ts` — reimplemented locally here since     */
/* that function lives in the ROUTER, which must never be imported by a      */
/* service — services are imported BY routers, never the reverse).          */
/* -------------------------------------------------------------------------- */

/** Read a Sub-Episode's `assemblyManifest.compiledVideo.videoUrl`, defensively —
 *  returns `null` unless status is `"completed"` AND a non-empty `videoUrl` exists. */
export function extractSubEpisodeCompiledVideoUrl(assemblyManifest: unknown): string | null {
  if (!assemblyManifest || typeof assemblyManifest !== "object") return null;
  const compiledVideo = (assemblyManifest as Record<string, unknown>).compiledVideo;
  if (!compiledVideo || typeof compiledVideo !== "object") return null;
  const status = (compiledVideo as Record<string, unknown>).status;
  if (status !== "completed") return null;
  const videoUrl = (compiledVideo as Record<string, unknown>).videoUrl;
  if (typeof videoUrl !== "string" || videoUrl.trim().length === 0) return null;
  return videoUrl;
}

/* -------------------------------------------------------------------------- */
/* Filename                                                                   */
/* -------------------------------------------------------------------------- */

/** Sanitize a string for safe use inside a filename (no path separators/odd chars). */
function slugForFilename(raw: string | number | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "untitled";
  return (
    s
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "untitled"
  );
}

/** `series-{seriesSlug}-production-ep-{groupIndex+1}.mp4` naming convention —
 *  mirrors `compiledVideoFilename` (`verticalDramaEpisodeVideoAssembly.ts`). */
export function productionEpisodeFilename(args: {
  seriesId: number | string;
  groupIndex: number;
  seriesTitle?: string;
}): string {
  const seriesPart = slugForFilename(args.seriesTitle || `series-${args.seriesId}`);
  return `series-${seriesPart}-production-ep-${args.groupIndex + 1}.mp4`;
}

/* -------------------------------------------------------------------------- */
/* Persistence — read-modify-write onto verticalDramaSeries.productionEpisodesManifest */
/* -------------------------------------------------------------------------- */

async function loadProductionEpisodesManifest(
  owner: ProductionEpisodeOwner
): Promise<ProductionEpisodesManifestWithBgm | null> {
  const [row] = await db
    .select({
      productionEpisodesManifest: verticalDramaSeries.productionEpisodesManifest,
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
  if (!row) throw new Error("vertical_drama_series_not_found");
  return (
    (row.productionEpisodesManifest as ProductionEpisodesManifestWithBgm | null) ?? null
  );
}

/** Replace the WHOLE `productionEpisodesManifest` JSONB value — used for the
 *  initial persist (mixed pending/reused-completed groups) before any ffmpeg
 *  job runs. */
async function persistProductionEpisodesManifest(
  owner: ProductionEpisodeOwner,
  manifest: ProductionEpisodesManifestWithBgm
): Promise<void> {
  await db
    .update(verticalDramaSeries)
    .set({
      productionEpisodesManifest: manifest as unknown as object,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId)
      )
    );
}

/**
 * Patch ONE group entry (by `index`) within the CURRENT persisted manifest —
 * read-modify-write, mirrors `persistCompiledVideoState`
 * (`verticalDramaEpisodeVideoAssembly.ts`). Re-reads fresh from the DB on
 * every call so sequential group completions (see
 * `runProductionEpisodeGroupJobsSequentially` below) never clobber a
 * sibling group's own prior patch. A missing row/manifest/group entry is a
 * silent no-op (defense-in-depth only — the manifest was already persisted
 * with every group's `"pending"` placeholder before any job starts).
 */
async function patchProductionEpisodeGroupState(
  owner: ProductionEpisodeOwner,
  groupIndex: number,
  patch: Partial<VerticalDramaProductionEpisodeGroupState>
): Promise<void> {
  const [row] = await db
    .select({
      productionEpisodesManifest: verticalDramaSeries.productionEpisodesManifest,
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
  if (!row) return;

  const existing =
    row.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null;
  if (!existing || !Array.isArray(existing.episodes)) return;

  const nextEpisodes = existing.episodes.map(e =>
    e.index === groupIndex ? { ...e, ...patch } : e
  );
  const next: VerticalDramaProductionEpisodesManifest = {
    ...existing,
    episodes: nextEpisodes,
  };

  await db
    .update(verticalDramaSeries)
    .set({ productionEpisodesManifest: next as unknown as object, updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId)
      )
    );
}

/* -------------------------------------------------------------------------- */
/* Render-options LEVEL — per-Sub-Episode render (plan.md "Render-options    */
/* LEVEL", user correction 2026-07-13). Reuses `runAssemblyJob` and its      */
/* input resolution `resolveEpisodeDialogueAudioAndSubtitlesRunInputs`       */
/* (both from `verticalDramaEpisodeVideoAssembly.ts`) VERBATIM — no new      */
/* ffmpeg/subtitle logic here, only the same "gather this episode's own raw  */
/* clips -> resolve dialogue-audio/subtitle/age-badge feed -> render" wiring */
/* `verticalDramaEpisodes.assembleEpisodeVideo`'s own handler already does   */
/* for a single episode.                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the `verticalDramaSeriesVoiceChain` tenant flag — small, deliberate
 * duplication of `verticalDramaEpisodes.ts`'s own
 * `resolveVerticalDramaVoiceChainFlag` (a 2-line tenant-flag read via the
 * shared `getTenantFeatureFlags` SERVICE, safe to import here). This file
 * must never import a ROUTER (see this file's own header doc comment), so
 * this tiny read is reimplemented locally rather than shared — the SAME
 * "small duplication, not a shared import" call `verticalDramaSeries.ts`'s
 * `assembleSeasonVideos` already makes for this exact flag.
 */
async function resolveProductionVoiceChainFlag(tenantId: string): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesVoiceChain === true;
}

/**
 * Series-level audience age rating — mirrors `verticalDramaEpisodes.ts`'s own
 * `loadSeriesAudienceAgeRating` (identical "read `bible` for a caller-owned
 * series -> defaulted tier" query), reimplemented locally for the same
 * service-must-never-import-a-router reason. Only ever called when
 * `renderOptions.showAgeBadge` is `true` (see call site in
 * `assembleProductionEpisodesForSeries` below) — a call with no age badge
 * requested pays zero extra DB cost, mirroring that function's own doc
 * comment.
 */
async function loadProductionSeriesAudienceAgeRating(
  owner: ProductionEpisodeOwner
): Promise<AudienceAgeRating> {
  const [row] = await db
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
  const bible = (row?.bible as Record<string, unknown> | null) ?? null;
  return resolveAudienceAgeRating(bible?.audienceAgeRating);
}

export interface RenderSubEpisodeWithOptionsArgs {
  owner: AssembleEpisodeVideoOwner;
  motionPromptPack: VerticalDramaMotionPromptPack | null;
  dialogueAudioPlan: VerticalDramaDialogueAudioPlan | null;
  internalBaseUrl: string;
  filename: string;
  /** Reuses the SAME top-level `allowPartial` flag the caller passed to
   *  `assembleProductionEpisodesForSeries` — one consistent knob for both
   *  "partial GROUP membership" (D′-1) and "partial CLIPS within one
   *  Sub-Episode's own re-render" (this function), rather than inventing a
   *  second option. */
  allowPartial?: boolean;
  renderOptions: ProductionEpisodeRenderOptions;
  voiceChainEnabled: boolean;
  audienceAgeRating?: AudienceAgeRating;
  ffmpegRunner: FfmpegRunner;
  probeDurationSecondsFn: (filePath: string) => Promise<number | undefined>;
}

export interface RenderSubEpisodeWithOptionsResult {
  videoUrl: string;
  durationSeconds?: number;
}

/** Test/DI injection point type for `renderSubEpisodeWithOptions` — mirrors
 *  `FfmpegRunner`'s own "named function type, swappable in tests" convention. */
export type RenderSubEpisodeWithOptionsFn = (
  args: RenderSubEpisodeWithOptionsArgs
) => Promise<RenderSubEpisodeWithOptionsResult>;

/**
 * Freshly render ONE Sub-Episode's OWN compiled video with the caller's
 * UNIFIED styling options, reusing the EXACT SAME machinery
 * `verticalDramaEpisodes.assembleEpisodeVideo` uses for its own single-
 * episode render: `extractClipSourcesFromMotionPromptPack` +
 * `resolveClipsForAssembly` gather this Sub-Episode's own raw clips, then
 * `resolveEpisodeDialogueAudioAndSubtitlesRunInputs` builds the dialogue-
 * audio/subtitle/age-badge render feed exactly as that handler's own doc
 * comment describes (including the age-badge overlay), then `runAssemblyJob`
 * itself — the SAME function a single-episode render's `submitAssemblyJob`
 * fires in the background — is called and AWAITED directly here.
 *
 * This is a "direct synchronous reuse of the pure render pipeline" (this
 * feature's plan doc's preferred choice over a submit-then-poll fallback):
 * safe to await directly because this function only ever runs INSIDE the
 * Production Episode assembly's OWN background job chain
 * (`runProductionEpisodeGroupJob`), which already has no caller left waiting
 * on an immediate HTTP response — there is no "return a jobId now" contract
 * to preserve here, unlike `assembleEpisodeVideo`'s own mutation handler.
 *
 * `runAssemblyJob` never THROWS on failure — it catches internally and
 * persists a `"failed"` `assemblyManifest.compiledVideo` state on the
 * Sub-Episode's own row instead (see that function's own doc comment). This
 * function re-reads that freshly persisted state afterward (the SAME
 * defensive `extractSubEpisodeCompiledVideoUrl` read this file already uses
 * for the D′-1 "reuse existing compiled video" path) to learn whether the
 * render actually succeeded, and THROWS here if it did not — surfacing the
 * failure to `runProductionEpisodeGroupJob`'s own try/catch, which marks the
 * WHOLE Production Episode group `"failed"`. A group is all-or-nothing: a
 * Production Episode silently missing one Sub-Episode would be a WRONG
 * publishable artifact, so there is no per-member partial-group state.
 *
 * KNOWN, DOCUMENTED SIDE EFFECT (not a bug): this OVERWRITES the
 * Sub-Episode's OWN `assemblyManifest.compiledVideo` with the freshly
 * Production-styled render, replacing whatever plain/individual-preview
 * render it had before. This is the accepted MVP behavior for this wave
 * (plan.md's "Render-options LEVEL" section describes the Sub-Episode page's
 * own render as becoming an internal PREVIEW only, with a follow-up wave to
 * relocate/simplify those Phase-A controls) — reusing the render machinery
 * verbatim, as directed, necessarily reuses its one persistence target too.
 */
export async function renderSubEpisodeWithOptions(
  args: RenderSubEpisodeWithOptionsArgs
): Promise<RenderSubEpisodeWithOptionsResult> {
  const clipSources = extractClipSourcesFromMotionPromptPack(args.motionPromptPack);
  if (clipSources.length === 0) {
    throw new Error(
      `vertical_drama_production_subepisode_no_clips: sub-episode ${args.owner.episodeId} has no video clips to render.`
    );
  }
  const resolved = resolveClipsForAssembly(clipSources, { allowPartial: args.allowPartial });

  const motionClips: VdDialogueTimelineClip[] = (args.motionPromptPack?.clips ?? []).map(c => ({
    clipNumber: c.clipNumber,
    sourceShotNumbers: c.sourceShotNumbers,
    durationSeconds: c.durationSeconds,
  }));

  const dialogueRunInputs = resolveEpisodeDialogueAudioAndSubtitlesRunInputs({
    plan: args.dialogueAudioPlan,
    motionClips,
    includedClipNumbers: resolved.ordered.map(c => c.clipNumber),
    includeDialogueAudio:
      args.voiceChainEnabled && args.renderOptions.includeDialogueAudio === true,
    loudnessNormalize: args.renderOptions.loudnessNormalize === true,
    subtitlePreset: args.renderOptions.subtitlePreset,
    subtitleFontSize: args.renderOptions.subtitleFontSize,
    showAgeBadge: args.renderOptions.showAgeBadge === true,
    audienceAgeRating: args.audienceAgeRating,
  });

  const jobId = randomUUID();
  await runAssemblyJob({
    owner: args.owner,
    jobId,
    clips: resolved.ordered,
    internalBaseUrl: args.internalBaseUrl,
    filename: args.filename,
    ffmpegRunner: args.ffmpegRunner,
    probeDurationSecondsFn: args.probeDurationSecondsFn,
    ...(dialogueRunInputs.dialogueAudio ? { dialogueAudio: dialogueRunInputs.dialogueAudio } : {}),
    ...(dialogueRunInputs.subtitles ? { subtitles: dialogueRunInputs.subtitles } : {}),
  });

  const [freshRow] = await db
    .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, args.owner.episodeId),
        eq(verticalDramaEpisodes.tenantId, args.owner.tenantId),
        eq(verticalDramaEpisodes.userId, args.owner.userId),
        eq(verticalDramaEpisodes.seriesId, args.owner.seriesId)
      )
    )
    .limit(1);

  const videoUrl = extractSubEpisodeCompiledVideoUrl(freshRow?.assemblyManifest);
  if (!videoUrl) {
    throw new Error(
      `vertical_drama_production_subepisode_render_failed: sub-episode ${args.owner.episodeId} render did not produce a compiled video.`
    );
  }

  const compiledVideo =
    freshRow?.assemblyManifest && typeof freshRow.assemblyManifest === "object"
      ? (freshRow.assemblyManifest as Record<string, unknown>).compiledVideo
      : undefined;
  const durationSeconds =
    compiledVideo && typeof compiledVideo === "object"
      ? (compiledVideo as Record<string, unknown>).durationSeconds
      : undefined;

  return {
    videoUrl,
    durationSeconds: typeof durationSeconds === "number" ? durationSeconds : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* One group's concat job — reuses the shot-clip concat machinery verbatim    */
/* (`downloadClipToFile` / `buildConcatListFileContent` /                    */
/* `buildConcatFfmpegArgs` / `storagePutFromPath`, all imported above — no    */
/* new uploader/downloader). Phase B-1 additionally runs an OPTIONAL BGM-mix  */
/* post-pass over this group's own concat output when `bgm` is supplied,     */
/* still reusing `downloadClipToFile`/`inferDownloadExtension`/              */
/* `storagePutFromPath` — the only genuinely NEW ffmpeg arg construction is   */
/* the pure `buildBgmMixFfmpegArgs` graph builder                            */
/* (`verticalDramaFinalRenderGraph.ts`).                                     */
/* -------------------------------------------------------------------------- */

export async function runProductionEpisodeGroupJob(args: {
  owner: ProductionEpisodeOwner;
  groupIndex: number;
  /** This group's members, in playback order. */
  members: ProductionEpisodeSourceSubEpisodeRow[];
  internalBaseUrl: string;
  filename: string;
  ffmpegRunner: FfmpegRunner;
  probeDurationSecondsFn: (filePath: string) => Promise<number | undefined>;
  seriesTitle?: string;
  allowPartial?: boolean;
  /** Render-options LEVEL — when supplied, EVERY member is freshly
   *  re-rendered WITH these SAME styling options (via
   *  `renderSubEpisodeWithOptionsFn`) before this group's own concat step
   *  runs. Omitted (D′-1 default) uses each member's EXISTING compiled
   *  video verbatim, unchanged. */
  renderOptions?: ProductionEpisodeRenderOptions;
  voiceChainEnabled: boolean;
  audienceAgeRating?: AudienceAgeRating;
  renderSubEpisodeWithOptionsFn: RenderSubEpisodeWithOptionsFn;
  /** Phase B-1 — when supplied, this group's OWN concat output is run
   *  through an additional BGM-mix ffmpeg pass before upload. Omitted
   *  (every pre-existing caller) skips that pass entirely — byte-identical
   *  to before this wave. */
  bgm?: ProductionEpisodeBgmOptions;
  /** Phase C-1 — when supplied, this group's OWN (post-BGM, if any) video is
   *  run through an additional credits-roll burn-in ffmpeg pass before
   *  upload. Omitted (every pre-existing caller) skips that pass entirely —
   *  byte-identical to before this wave. */
  credits?: ProductionEpisodeCreditsOptions;
  /** Phase C-2 — an UNLIMITED (caller-capped), caller-authored list of
   *  ad-hoc timed text overlays, burned onto this group's OWN (post-BGM, if
   *  any) video. FOLDED into the SAME ffmpeg pass as `credits` (one
   *  re-encode) when BOTH are supplied for this call — see this function's
   *  own credits/overlays post-pass block below. Omitted (or an EMPTY array
   *  — every pre-existing caller) skips this pass entirely — byte-identical
   *  to before this wave. */
  overlays?: ProductionEpisodeOverlayItem[];
}): Promise<void> {
  const {
    owner,
    groupIndex,
    members,
    internalBaseUrl,
    filename,
    ffmpegRunner,
    probeDurationSecondsFn,
    seriesTitle,
    allowPartial,
    renderOptions,
    voiceChainEnabled,
    audienceAgeRating,
    renderSubEpisodeWithOptionsFn,
    bgm,
    credits,
    overlays,
  } = args;

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vd-production-ep-"));
  try {
    // Render-options LEVEL — every member is freshly re-rendered WITH the
    // SAME unified styling before this group's own concat step runs, so
    // every Sub-Episode in this Production Episode has identical subtitle/
    // badge/dialogue-audio/loudness treatment. Sequential (never parallel),
    // matching every other ffmpeg-invoking loop in this codebase's
    // single-host resource budget. A failure on ANY member propagates out of
    // this whole `try` block (caught below), marking the WHOLE group
    // `"failed"` — see `renderSubEpisodeWithOptions`'s own doc comment for
    // why a group is all-or-nothing rather than silently dropping one member.
    let videoUrls: string[];
    if (renderOptions) {
      videoUrls = [];
      for (const member of members) {
        const rendered = await renderSubEpisodeWithOptionsFn({
          owner: { ...owner, episodeId: member.episodeId },
          motionPromptPack: member.motionPromptPack,
          dialogueAudioPlan: member.dialogueAudioPlan,
          internalBaseUrl,
          filename: compiledVideoFilename({
            seriesId: owner.seriesId,
            episodeNumber: member.episodeNumber,
            seriesTitle,
          }),
          allowPartial,
          renderOptions,
          voiceChainEnabled,
          audienceAgeRating,
          ffmpegRunner,
          probeDurationSecondsFn,
        });
        videoUrls.push(rendered.videoUrl);
      }
    } else {
      videoUrls = members.map(m => m.videoUrl as string);
    }

    const inputPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i += 1) {
      const dest = path.join(workDir, `sub-ep-${String(i).padStart(3, "0")}.mp4`);
      await downloadClipToFile(videoUrls[i], dest, internalBaseUrl);
      inputPaths.push(dest);
    }

    const concatListPath = path.join(workDir, "concat.txt");
    await fsp.writeFile(concatListPath, buildConcatListFileContent(inputPaths), "utf8");

    const outputPath = path.join(workDir, "output.mp4");
    const ffArgs = buildConcatFfmpegArgs({ inputPaths, concatListPath, outputPath });
    const result = await ffmpegRunner(ffArgs);
    if (result.code !== 0) {
      throw new Error(
        `ffmpeg production-episode concat failed (exit ${result.code}): ${result.stderr.slice(-2000)}`
      );
    }

    const durationSeconds = await probeDurationSecondsFn(outputPath);

    // Phase B-1 (`planning/vertical-drama-production-render/plan.md` Phase B)
    // — BGM bed + ducking, a SELF-CONTAINED POST-PASS over the group video
    // this function JUST produced above. Omitted `bgm` (every pre-existing
    // caller) never enters this branch — byte-identical to before this
    // wave. Reuses `downloadClipToFile`/`inferDownloadExtension` (the SAME
    // staging helpers `verticalDramaEpisodeVideoAssembly.ts`'s own
    // `runAssemblyJob` uses for banner/dialogue-audio assets) and
    // `storagePutFromPath` — no new download/upload primitive, only the new
    // PURE `buildBgmMixFfmpegArgs` graph builder
    // (`verticalDramaFinalRenderGraph.ts`).
    let finalOutputPath = outputPath;
    if (bgm) {
      // The looped BGM input (`-stream_loop -1`, see `buildBgmMixFfmpegArgs`)
      // never terminates on its own — a numeric `durationSeconds` is what
      // bounds it (via that builder's own `-t`), so a failed probe here must
      // hard-fail the group rather than risk an unbounded ffmpeg process.
      // Mirrors `runAssemblyJob`'s own
      // `vertical_drama_final_render_duration_probe_failed` guard
      // (`verticalDramaEpisodeVideoAssembly.ts`) for the same class of
      // problem. The PRE-EXISTING no-`bgm` path below this `if` is
      // untouched — a failed probe there stays a non-fatal, best-effort
      // `durationSeconds: undefined` on an otherwise-"completed" group,
      // exactly as before this wave.
      if (durationSeconds == null) {
        throw new Error(
          "vertical_drama_production_bgm_duration_probe_failed: could not determine the assembled Production Episode's duration; cannot safely bound the looped BGM track."
        );
      }
      const bgmLocalPath = path.join(
        workDir,
        `bgm${inferDownloadExtension(bgm.url, ".mp3")}`
      );
      await downloadClipToFile(bgm.url, bgmLocalPath, internalBaseUrl);

      const bgmOutputPath = path.join(workDir, "output-bgm.mp4");
      const bgmArgs = buildBgmMixFfmpegArgs({
        videoPath: outputPath,
        bgmPath: bgmLocalPath,
        output: bgmOutputPath,
        videoDurationSeconds: durationSeconds,
        volumePercent: bgm.volumePercent,
        duckUnderVideoAudio: bgm.duckUnderVideoAudio,
      });
      const bgmResult = await ffmpegRunner(bgmArgs);
      if (bgmResult.code !== 0) {
        throw new Error(
          `ffmpeg production-episode bgm mix failed (exit ${bgmResult.code}): ${bgmResult.stderr.slice(-2000)}`
        );
      }
      finalOutputPath = bgmOutputPath;
    }

    // Phase C-1 (`planning/vertical-drama-production-render/plan.md` Phase C)
    // — credits roll, a SECOND, SELF-CONTAINED POST-PASS run AFTER the bgm
    // post-pass above, over whatever `finalOutputPath` currently points to
    // (the plain concat output, or the bgm-mixed output when `bgm` was ALSO
    // supplied — "the (post-BGM, if any) Production Episode video"). Phase
    // C-2 (this same plan.md Phase C, "overlays generalization") adds a
    // SIBLING, independently-optional post-pass — an UNLIMITED, caller-
    // authored list of ad-hoc timed text overlays — run at the SAME point in
    // the chain. When BOTH `overlays` and `credits` are supplied for the SAME
    // call, they are FOLDED into ONE additional ffmpeg re-encode (via the
    // general `buildAssBurnFfmpegArgs`, chaining two `subtitles=` filter
    // stages in one `-vf` value) rather than two sequential re-encodes — see
    // `verticalDramaFinalRenderGraph.ts`'s own "Burn-pass folding" doc
    // comment. Omitted `overlays` (and an EMPTY array — every pre-existing
    // caller) never enters either of the two NEW branches below — the
    // credits-ONLY branch is the ORIGINAL, UNTOUCHED Phase C-1 code (byte-
    // identical to before this wave), so a call with `credits` but no
    // `overlays` is unaffected by this addition. Every branch reuses the SAME
    // `resolveVdSubtitleFontsDir()` Thai-font resolution `runAssemblyJob`
    // itself uses for burned-in captions, and the group's own
    // ALREADY-PROBED `durationSeconds` (never re-probed).
    const overlaysToRender = overlays && overlays.length > 0 ? overlays : null;

    if (overlaysToRender && credits) {
      // BOTH overlays AND credits supplied — fold into ONE re-encode.
      if (durationSeconds == null) {
        throw new Error(
          "vertical_drama_production_overlays_credits_duration_probe_failed: could not determine the assembled Production Episode's duration; cannot safely burn the timed overlays/credits roll."
        );
      }
      const fontsDir = resolveVdSubtitleFontsDir();

      const overlaysAssContent = buildProductionOverlaysAssFile(
        overlaysToRender,
        durationSeconds,
        { fontsDir, playResX: 1080, playResY: 1920 }
      );
      const overlaysAssPath = path.join(workDir, "overlays.ass");
      await fsp.writeFile(overlaysAssPath, overlaysAssContent, "utf8");

      const creditsAssContent = buildCreditsAssFile(credits.text, durationSeconds, {
        fontsDir,
        playResX: 1080,
        playResY: 1920,
      });
      const creditsAssPath = path.join(workDir, "credits.ass");
      await fsp.writeFile(creditsAssPath, creditsAssContent, "utf8");

      const combinedOutputPath = path.join(workDir, "output-overlays-credits.mp4");
      const combinedArgs = buildAssBurnFfmpegArgs({
        videoPath: finalOutputPath,
        // Overlays first, credits last — the tail-anchored credits roll
        // reads as the final "polish" stage over whatever the timed
        // overlays already burned in; order has no functional effect
        // (the two `.ass` files' own event windows don't have to avoid
        // each other), only a documented, deterministic convention.
        passes: [
          { assPath: overlaysAssPath, fontsDir },
          { assPath: creditsAssPath, fontsDir },
        ],
        output: combinedOutputPath,
      });
      const combinedResult = await ffmpegRunner(combinedArgs);
      if (combinedResult.code !== 0) {
        throw new Error(
          `ffmpeg production-episode overlays/credits burn failed (exit ${combinedResult.code}): ${combinedResult.stderr.slice(-2000)}`
        );
      }
      finalOutputPath = combinedOutputPath;
    } else if (credits) {
      // Credits ONLY — Phase C-1's ORIGINAL code, unchanged. Same "a failed
      // probe must hard-fail a pass that depends on the real duration"
      // posture as the bgm pass's own guard above — here the credits roll
      // cannot be correctly TAIL-ANCHORED to the video's end without it.
      if (durationSeconds == null) {
        throw new Error(
          "vertical_drama_production_credits_duration_probe_failed: could not determine the assembled Production Episode's duration; cannot safely tail-anchor the credits roll."
        );
      }
      const fontsDir = resolveVdSubtitleFontsDir();
      const creditsAssContent = buildCreditsAssFile(credits.text, durationSeconds, {
        fontsDir,
        playResX: 1080,
        playResY: 1920,
      });
      const creditsAssPath = path.join(workDir, "credits.ass");
      await fsp.writeFile(creditsAssPath, creditsAssContent, "utf8");

      const creditsOutputPath = path.join(workDir, "output-credits.mp4");
      const creditsArgs = buildCreditsBurnFfmpegArgs({
        videoPath: finalOutputPath,
        credits: { assPath: creditsAssPath, fontsDir },
        output: creditsOutputPath,
      });
      const creditsResult = await ffmpegRunner(creditsArgs);
      if (creditsResult.code !== 0) {
        throw new Error(
          `ffmpeg production-episode credits burn failed (exit ${creditsResult.code}): ${creditsResult.stderr.slice(-2000)}`
        );
      }
      finalOutputPath = creditsOutputPath;
    } else if (overlaysToRender) {
      // Overlays ONLY (Phase C-2, new).
      if (durationSeconds == null) {
        throw new Error(
          "vertical_drama_production_overlays_duration_probe_failed: could not determine the assembled Production Episode's duration; cannot safely render the timed text overlays."
        );
      }
      const fontsDir = resolveVdSubtitleFontsDir();
      const overlaysAssContent = buildProductionOverlaysAssFile(
        overlaysToRender,
        durationSeconds,
        { fontsDir, playResX: 1080, playResY: 1920 }
      );
      const overlaysAssPath = path.join(workDir, "overlays.ass");
      await fsp.writeFile(overlaysAssPath, overlaysAssContent, "utf8");

      const overlaysOutputPath = path.join(workDir, "output-overlays.mp4");
      const overlaysArgs = buildAssBurnFfmpegArgs({
        videoPath: finalOutputPath,
        passes: [{ assPath: overlaysAssPath, fontsDir }],
        output: overlaysOutputPath,
      });
      const overlaysResult = await ffmpegRunner(overlaysArgs);
      if (overlaysResult.code !== 0) {
        throw new Error(
          `ffmpeg production-episode overlays burn failed (exit ${overlaysResult.code}): ${overlaysResult.stderr.slice(-2000)}`
        );
      }
      finalOutputPath = overlaysOutputPath;
    }

    const storageKey = `vertical-drama/production-episodes/${owner.seriesId}/${randomUUID()}-${filename}`;
    await assertR2StorageActive();
    const { url } = await storagePutFromPath(storageKey, finalOutputPath, "video/mp4");

    await patchProductionEpisodeGroupState(owner, groupIndex, {
      status: "completed",
      videoUrl: url,
      durationSeconds,
      assembledAt: new Date().toISOString(),
      error: undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debugError(
      "verticalDramaProductionEpisodeAssembly",
      `Production Episode group ${groupIndex} failed for series ${owner.seriesId}`,
      err
    );
    await patchProductionEpisodeGroupState(owner, groupIndex, {
      status: "failed",
      error: message.slice(0, 2000),
    }).catch(() => {
      /* best-effort — see `patchProductionEpisodeGroupState`'s own doc comment */
    });
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/* -------------------------------------------------------------------------- */
/* Orchestrator                                                               */
/* -------------------------------------------------------------------------- */

export interface AssembleProductionEpisodesForSeriesArgs {
  tenantId: string;
  userId: number;
  seriesId: number;
  groupSize: ProductionEpisodeGroupSize;
  allowPartial?: boolean;
  internalBaseUrl: string;
  seriesTitle?: string;
  /**
   * Render-options LEVEL (plan.md "Render-options LEVEL" section, user
   * correction 2026-07-13) — when supplied, EVERY Sub-Episode in EVERY group
   * is freshly re-rendered with these SAME styling options before that
   * group's own concat step, so the whole Production Episode has uniform
   * subtitle/badge/dialogue-audio/loudness styling. Omitted (every
   * pre-existing caller) preserves D′-1 behavior exactly: each group's
   * concat uses the Sub-Episodes' EXISTING compiled videos as-is, no
   * re-render. See `ProductionEpisodeRenderOptions`'s own doc comment.
   */
  renderOptions?: ProductionEpisodeRenderOptions;
  /**
   * Phase B-1 (`planning/vertical-drama-production-render/plan.md` Phase B)
   * — when supplied, EVERY group's own concatenated video is run through an
   * additional BGM-mix ffmpeg post-pass (see `runProductionEpisodeGroupJob`)
   * before upload, and the settings are recorded on each group's persisted
   * state (see `VerticalDramaProductionEpisodeGroupStateWithBgm`). Omitted
   * (every pre-existing caller) preserves prior behavior exactly: no second
   * ffmpeg pass, no `bgm` field on the persisted group state.
   */
  bgm?: ProductionEpisodeBgmOptions;
  /**
   * Phase C-1 (`planning/vertical-drama-production-render/plan.md` Phase C)
   * — when supplied, EVERY group's own (post-BGM, if any) video is run
   * through an additional credits-roll burn-in ffmpeg post-pass (see
   * `runProductionEpisodeGroupJob`) before upload, and the settings are
   * recorded on each group's persisted state (see
   * `VerticalDramaProductionEpisodeGroupStateWithBgm`). Omitted (every
   * pre-existing caller) preserves prior behavior exactly: no extra ffmpeg
   * pass, no `credits` field on the persisted group state.
   */
  credits?: ProductionEpisodeCreditsOptions;
  /**
   * Phase C-2 (`planning/vertical-drama-production-render/plan.md` Phase C,
   * "overlays generalization") — when supplied (non-empty), EVERY group's
   * own (post-BGM, if any) video is run through an additional timed-text-
   * overlays burn-in ffmpeg post-pass (see `runProductionEpisodeGroupJob`),
   * FOLDED into the SAME ffmpeg call as `credits` when both are supplied for
   * this call, and the list is recorded on each group's persisted state (see
   * `VerticalDramaProductionEpisodeGroupStateWithBgm`). Omitted (or an EMPTY
   * array — every pre-existing caller) preserves prior behavior exactly: no
   * extra ffmpeg pass, no `overlays` field on the persisted group state.
   */
  overlays?: ProductionEpisodeOverlayItem[];
  /** Test injection points — mirror `runAssemblyJob`'s own convention so
   *  tests never spawn a real ffmpeg/ffprobe process. Default to the real
   *  implementations. */
  ffmpegRunner?: FfmpegRunner;
  probeDurationSecondsFn?: (filePath: string) => Promise<number | undefined>;
  /** Test injection point for the per-Sub-Episode render step — mirrors
   *  `ffmpegRunner`/`probeDurationSecondsFn`'s own convention. Defaults to
   *  the real `renderSubEpisodeWithOptions` (see that function's own doc
   *  comment for why a direct synchronous reuse of `runAssemblyJob` was
   *  chosen over a submit-then-poll fallback). Only ever invoked when
   *  `renderOptions` is supplied. */
  renderSubEpisodeWithOptionsFn?: RenderSubEpisodeWithOptionsFn;
}

export interface AssembleProductionEpisodesForSeriesResult {
  /** Number of groups that were (re)submitted for ffmpeg assembly by THIS call. */
  groupsCreated: number;
  /** Number of groups left untouched because an identical, already-completed
   *  group existed (see this file's header doc comment on idempotent
   *  re-assembly). */
  groupsSkipped: number;
  /** The manifest as persisted synchronously by this call — pending groups
   *  will still transition to completed/failed in the background; poll
   *  `verticalDramaSeries.get` to observe that. Typed as
   *  `ProductionEpisodesManifestWithBgm` (this file's own local, WIDER
   *  mirror of the shared `VerticalDramaProductionEpisodesManifest` — see
   *  that type's own doc comment) so a caller/test can read `.bgm`/`.credits`
   *  off each group entry when this call supplied `bgm`/`credits`. */
  manifest: ProductionEpisodesManifestWithBgm;
}

/** One group as planned by `assembleProductionEpisodesForSeries`, before the
 *  fire-and-forget ffmpeg chain runs. */
interface PlannedProductionEpisodeGroup {
  index: number;
  subEpisodeNumbers: number[];
  members: ProductionEpisodeSourceSubEpisodeRow[];
  /** Non-null when an existing COMPLETED group can be reused verbatim. */
  reuse: VerticalDramaProductionEpisodeGroupStateWithBgm | null;
}

/**
 * Load a series' Sub-Episodes, resolve their compiled videos, chunk into
 * `groupSize` groups, persist a manifest synchronously (pending groups mixed
 * with any reused-completed ones), then run each NEW/changed group's ffmpeg
 * concat job sequentially in the background (fire-and-forget from this
 * function's own return — matches every sibling assembly feature in this
 * codebase). Throws a plain `Error` (message-prefixed `vertical_drama_production_*`)
 * for every precondition failure — the caller (the tRPC router) maps any
 * thrown error here to `PRECONDITION_FAILED`.
 */
export async function assembleProductionEpisodesForSeries(
  args: AssembleProductionEpisodesForSeriesArgs
): Promise<AssembleProductionEpisodesForSeriesResult> {
  const {
    tenantId,
    userId,
    seriesId,
    groupSize,
    allowPartial,
    internalBaseUrl,
    renderOptions,
    bgm,
    credits,
    overlays,
  } = args;
  // Vertical Drama Render Queue plan §4.2 Wave 3 — `ffmpegRunner`/
  // `probeDurationSecondsFn`/`renderSubEpisodeWithOptionsFn` are no longer
  // resolved/used HERE: this function only enqueues now (see the loop
  // below), it never calls `runProductionEpisodeGroupJob` in-process. The
  // executor (`verticalDramaFfmpegAssemblyRunner.ts`) supplies its own
  // default injectables when it later calls `runProductionEpisodeGroupJob`
  // for a claimed job. The three fields remain on
  // `AssembleProductionEpisodesForSeriesArgs` for backward-compatible test
  // injection but are otherwise unused by this function's body.
  const owner: ProductionEpisodeOwner = { tenantId, userId, seriesId };

  const episodeRows = await db
    .select({
      id: verticalDramaEpisodes.id,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      assemblyManifest: verticalDramaEpisodes.assemblyManifest,
      // Render-options LEVEL — only ever READ by `renderSubEpisodeWithOptions`
      // when `renderOptions` is supplied (see below); selected unconditionally
      // here since Drizzle has no per-call conditional column selection and
      // this is the SAME single query D′-1 already runs (no extra round trip).
      motionPromptPack: verticalDramaEpisodes.motionPromptPack,
      dialogueAudioPlan: verticalDramaEpisodes.dialogueAudioPlan,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, tenantId),
        eq(verticalDramaEpisodes.userId, userId),
        eq(verticalDramaEpisodes.seriesId, seriesId)
      )
    )
    .orderBy(asc(verticalDramaEpisodes.episodeNumber));

  if (episodeRows.length === 0) {
    throw new Error(
      "vertical_drama_production_no_subepisodes: this series has no sub-episodes yet."
    );
  }

  const subEpisodes: ProductionEpisodeSourceSubEpisodeRow[] = episodeRows.map((row: (typeof episodeRows)[number]) => ({
    episodeNumber: row.episodeNumber,
    videoUrl: extractSubEpisodeCompiledVideoUrl(row.assemblyManifest),
    episodeId: row.id,
    motionPromptPack: row.motionPromptPack as VerticalDramaMotionPromptPack | null,
    dialogueAudioPlan: row.dialogueAudioPlan as VerticalDramaDialogueAudioPlan | null,
  }));

  const { usable } = resolveSubEpisodesForProductionAssembly(subEpisodes, { allowPartial });
  const groups = chunkSubEpisodesIntoGroups(usable, groupSize);

  const existingManifest = await loadProductionEpisodesManifest(owner);
  const existingByIndex = new Map(
    (existingManifest?.episodes ?? []).map(e => [e.index, e] as const)
  );

  const planned: PlannedProductionEpisodeGroup[] = groups.map((group, index) => {
    const subEpisodeNumbers = group.map(e => e.episodeNumber);
    const existing = existingByIndex.get(index) ?? null;
    const reuse =
      existing &&
      existing.status === "completed" &&
      existing.groupSize === groupSize &&
      subEpisodeNumbersEqual(existing.subEpisodeNumbers, subEpisodeNumbers)
        ? existing
        : null;
    return {
      index,
      subEpisodeNumbers,
      members: group,
      reuse,
    };
  });

  const groupStates: VerticalDramaProductionEpisodeGroupStateWithBgm[] = planned.map(
    (p): VerticalDramaProductionEpisodeGroupStateWithBgm =>
      p.reuse ?? {
        index: p.index,
        groupSize,
        subEpisodeNumbers: p.subEpisodeNumbers,
        status: "pending",
        // Recorded onto the group state (pending AND, since the per-group
        // patch below never touches this field, still present once
        // completed/failed) purely for UI display of "what styling was this
        // Production Episode rendered with" — see
        // `VerticalDramaProductionEpisodeGroupState.renderOptions`'s own doc
        // comment. Absent entirely when this call had no `renderOptions`.
        ...(renderOptions ? { renderOptions } : {}),
        // Phase B-1 — same "set once at pending time, carried through
        // unchanged" convention as `renderOptions` immediately above; see
        // `VerticalDramaProductionEpisodeGroupStateWithBgm`'s own doc
        // comment. Absent entirely when this call had no `bgm`.
        ...(bgm ? { bgm } : {}),
        // Phase C-1 — same convention as `bgm` immediately above. Absent
        // entirely when this call had no `credits`.
        ...(credits ? { credits } : {}),
        // Phase C-2 — same convention as `bgm`/`credits` immediately above,
        // EXCEPT an overlays array must ALSO check `.length > 0` (unlike a
        // singular options object, an EMPTY array is still truthy in JS) —
        // absent entirely when this call had no `overlays`, OR an empty one.
        ...(overlays && overlays.length > 0 ? { overlays } : {}),
      }
  );

  const manifest: ProductionEpisodesManifestWithBgm = {
    groupSize,
    episodes: groupStates,
  };

  // Persist synchronously — same "resume after reload" convention as
  // `submitAssemblyJob`/`submitTrailerJob`: a reload before the background
  // chain finishes can still read this manifest back via `verticalDramaSeries.get`.
  await persistProductionEpisodesManifest(owner, manifest);

  const groupsToRun = planned.filter(p => !p.reuse);

  // Vertical Drama Render Queue plan §4.2 Wave 3 — enqueue ONE
  // `vertical_drama_ffmpeg_assembly` worker job (kind:
  // "production_episode_group") per NEW/changed group instead of running
  // `runProductionEpisodeGroupJob` in-process here. `renderFeed` carries
  // exactly the DATA args `runProductionEpisodeGroupJob` reads — NEVER
  // `ffmpegRunner`/`probeDurationSecondsFn`/`renderSubEpisodeWithOptionsFn`
  // (the executor supplies its own default injectables for those). Group
  // entries in `manifest` stay `status: "pending"`; the executor patches
  // each to `completed`/`failed` once its job finishes.
  //
  // Render-options LEVEL — resolved ONCE for the whole call (not per group/
  // per Sub-Episode), mirroring `assembleEpisodeVideo`'s own handler:
  // `voiceChainEnabled` is always resolved up front when rendering is
  // requested at all; `audienceAgeRating` is resolved LAZILY, only when
  // `showAgeBadge` is actually requested, so a render that never asks for
  // the badge pays zero extra DB cost (see `loadProductionSeriesAudienceAgeRating`'s
  // own doc comment).
  let voiceChainEnabled = false;
  let audienceAgeRating: AudienceAgeRating | undefined;
  if (renderOptions) {
    voiceChainEnabled = await resolveProductionVoiceChainFlag(tenantId);
    if (renderOptions.showAgeBadge === true) {
      audienceAgeRating = await loadProductionSeriesAudienceAgeRating(owner);
    }
  }

  for (const group of groupsToRun) {
    const filename = productionEpisodeFilename({
      seriesId,
      groupIndex: group.index,
      seriesTitle: args.seriesTitle,
    });
    const renderFeed = {
      owner,
      groupIndex: group.index,
      members: group.members,
      internalBaseUrl,
      filename,
      ...(args.seriesTitle ? { seriesTitle: args.seriesTitle } : {}),
      ...(allowPartial !== undefined ? { allowPartial } : {}),
      ...(renderOptions ? { renderOptions } : {}),
      voiceChainEnabled,
      ...(audienceAgeRating !== undefined ? { audienceAgeRating } : {}),
      ...(bgm ? { bgm } : {}),
      ...(credits ? { credits } : {}),
      ...(overlays && overlays.length > 0 ? { overlays } : {}),
    };
    await queueVerticalDramaFfmpegAssemblyJob({
      tenantId,
      requestedByUserId: userId,
      kind: "production_episode_group",
      contractVersion: 1,
      owner: {
        tenantId,
        userId: String(userId),
        seriesId: String(seriesId),
      },
      renderFeed,
      display: {
        seriesTitle: args.seriesTitle,
        groupIndex: group.index,
        label: filename,
      },
    });
  }

  return {
    groupsCreated: groupsToRun.length,
    groupsSkipped: planned.length - groupsToRun.length,
    manifest,
  };
}
