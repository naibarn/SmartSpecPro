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
 */

import { randomUUID } from "crypto";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaEpisodes, verticalDramaSeries } from "../../drizzle/schema";
import { storagePutFromPath } from "../storage";
import { debugError } from "../_core/logger";
import {
  buildConcatFfmpegArgs,
  buildConcatListFileContent,
  defaultFfmpegRunner,
  downloadClipToFile,
  probeDurationSeconds,
  type FfmpegRunner,
} from "./verticalDramaEpisodeVideoAssembly";
import type {
  VerticalDramaProductionEpisodeGroupState,
  VerticalDramaProductionEpisodesManifest,
} from "@shared/verticalDramaSeries/assembly";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ProductionEpisodeGroupSize = 5 | 10;

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
): Promise<VerticalDramaProductionEpisodesManifest | null> {
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
    (row.productionEpisodesManifest as VerticalDramaProductionEpisodesManifest | null) ?? null
  );
}

/** Replace the WHOLE `productionEpisodesManifest` JSONB value — used for the
 *  initial persist (mixed pending/reused-completed groups) before any ffmpeg
 *  job runs. */
async function persistProductionEpisodesManifest(
  owner: ProductionEpisodeOwner,
  manifest: VerticalDramaProductionEpisodesManifest
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
/* One group's concat job — reuses the shot-clip concat machinery verbatim    */
/* (`downloadClipToFile` / `buildConcatListFileContent` /                    */
/* `buildConcatFfmpegArgs` / `storagePutFromPath`, all imported above — no    */
/* new ffmpeg arg construction, no new uploader).                            */
/* -------------------------------------------------------------------------- */

async function runProductionEpisodeGroupJob(args: {
  owner: ProductionEpisodeOwner;
  groupIndex: number;
  /** Ordered compiled Sub-Episode video URLs for this ONE group. */
  videoUrls: string[];
  internalBaseUrl: string;
  filename: string;
  ffmpegRunner: FfmpegRunner;
  probeDurationSecondsFn: (filePath: string) => Promise<number | undefined>;
}): Promise<void> {
  const {
    owner,
    groupIndex,
    videoUrls,
    internalBaseUrl,
    filename,
    ffmpegRunner,
    probeDurationSecondsFn,
  } = args;

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vd-production-ep-"));
  try {
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
    const storageKey = `vertical-drama/production-episodes/${owner.seriesId}/${randomUUID()}-${filename}`;
    const { url } = await storagePutFromPath(storageKey, outputPath, "video/mp4");

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
  /** Test injection points — mirror `runAssemblyJob`'s own convention so
   *  tests never spawn a real ffmpeg/ffprobe process. Default to the real
   *  implementations. */
  ffmpegRunner?: FfmpegRunner;
  probeDurationSecondsFn?: (filePath: string) => Promise<number | undefined>;
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
   *  `verticalDramaSeries.get` to observe that. */
  manifest: VerticalDramaProductionEpisodesManifest;
}

/** One group as planned by `assembleProductionEpisodesForSeries`, before the
 *  fire-and-forget ffmpeg chain runs. */
interface PlannedProductionEpisodeGroup {
  index: number;
  subEpisodeNumbers: number[];
  videoUrls: string[];
  /** Non-null when an existing COMPLETED group can be reused verbatim. */
  reuse: VerticalDramaProductionEpisodeGroupState | null;
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
  const { tenantId, userId, seriesId, groupSize, allowPartial, internalBaseUrl } = args;
  const ffmpegRunner = args.ffmpegRunner ?? defaultFfmpegRunner;
  const probeDurationSecondsFn = args.probeDurationSecondsFn ?? probeDurationSeconds;
  const owner: ProductionEpisodeOwner = { tenantId, userId, seriesId };

  const episodeRows = await db
    .select({
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      assemblyManifest: verticalDramaEpisodes.assemblyManifest,
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

  const subEpisodes: ProductionEpisodeSourceSubEpisode[] = episodeRows.map(row => ({
    episodeNumber: row.episodeNumber,
    videoUrl: extractSubEpisodeCompiledVideoUrl(row.assemblyManifest),
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
      videoUrls: group.map(e => e.videoUrl as string),
      reuse,
    };
  });

  const groupStates: VerticalDramaProductionEpisodeGroupState[] = planned.map(
    (p): VerticalDramaProductionEpisodeGroupState =>
      p.reuse ?? {
        index: p.index,
        groupSize,
        subEpisodeNumbers: p.subEpisodeNumbers,
        status: "pending",
      }
  );

  const manifest: VerticalDramaProductionEpisodesManifest = {
    groupSize,
    episodes: groupStates,
  };

  // Persist synchronously — same "resume after reload" convention as
  // `submitAssemblyJob`/`submitTrailerJob`: a reload before the background
  // chain finishes can still read this manifest back via `verticalDramaSeries.get`.
  await persistProductionEpisodesManifest(owner, manifest);

  const groupsToRun = planned.filter(p => !p.reuse);

  // Fire-and-forget — each group's ffmpeg job runs SEQUENTIALLY (never
  // parallel; same single-host resource-budget rationale as
  // `submitSequentialAssemblyJobs`). Errors are caught and persisted inside
  // `runProductionEpisodeGroupJob`, never thrown back to this function's
  // (already-returned) caller.
  void (async () => {
    for (const group of groupsToRun) {
      const filename = productionEpisodeFilename({
        seriesId,
        groupIndex: group.index,
        seriesTitle: args.seriesTitle,
      });
      try {
        await runProductionEpisodeGroupJob({
          owner,
          groupIndex: group.index,
          videoUrls: group.videoUrls,
          internalBaseUrl,
          filename,
          ffmpegRunner,
          probeDurationSecondsFn,
        });
      } catch {
        // Defense-in-depth only — `runProductionEpisodeGroupJob` already
        // catches internally and persists a "failed" state; continue the
        // chain regardless so one bad group never blocks the rest.
      }
    }
  })();

  return {
    groupsCreated: groupsToRun.length,
    groupsSkipped: planned.length - groupsToRun.length,
    manifest,
  };
}
