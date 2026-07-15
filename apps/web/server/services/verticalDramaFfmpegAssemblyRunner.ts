/**
 * Vertical Drama Render Queue — per-kind ffmpeg assembly dispatcher
 * (`planning/vertical-drama-render-queue/plan.md` §4.1/§4.3, Wave 2).
 *
 * `inlineRenderWorker.ts` (this same wave) claims a queued
 * `vertical_drama_ffmpeg_assembly` `worker_jobs` row and hands its parsed
 * `verticalDramaFfmpegAssemblyJobContractSchema` payload to
 * `runVerticalDramaFfmpegAssemblyJob` below, which dispatches on
 * `contract.kind` to the EXISTING pure-ffmpeg render functions
 * (`runAssemblyJob` / `runProductionEpisodeGroupJob` / `runTrailerJob`) —
 * zero reimplementation, exactly the machinery the in-process
 * `submitAssemblyJob`/`assembleProductionEpisodesForSeries`/
 * `submitTrailerJob` callers already use today.
 *
 * `contract.renderFeed` is an OPAQUE, already-resolved blob (see
 * `shared/workerRuntime.ts`'s own doc comment on
 * `verticalDramaFfmpegAssemblyJobContractSchema`): a later wave's router
 * mutation resolves it on the request path exactly as it does today, then
 * carries it verbatim into the queue. This module re-hydrates it into each
 * render function's own DATA args (never re-validating its internal shape —
 * that's the enqueue-time router's job) and supplies the INJECTABLE
 * ffmpeg/probe/render functions itself, from this module's own imports —
 * never from `renderFeed` (those are Node functions, not JSON, and could
 * never round-trip through `worker_jobs.inputJson` anyway).
 *
 * Every VD service module is imported by DYNAMIC `await import(...)` inside
 * each `switch` case (mirrors `videoIntelligenceJobs.ts` Lane A's own lazy-
 * import convention for the identical "heavy VD service module, only needed
 * by the render worker" reasoning) so this file never creates a static
 * circular import with those services (each of which is itself already
 * lazily imported by its own router mutation). Only TYPES are imported
 * statically (`import type`) — those are fully erased at compile time and
 * carry no runtime module-evaluation risk.
 */
import { and, eq } from "drizzle-orm";

import { debugError } from "../_core/logger";
import { db } from "../db";
import { verticalDramaEpisodes, verticalDramaSeries } from "../../drizzle/schema";
import type { VerticalDramaFfmpegAssemblyJobContract } from "../../shared/workerRuntime";
import type { VerticalDramaAssemblyManifest } from "@shared/verticalDramaSeries/assembly";
import type { runAssemblyJob } from "./verticalDramaEpisodeVideoAssembly";
import type { runProductionEpisodeGroupJob } from "./verticalDramaProductionEpisodeAssembly";
import type { runTrailerJob } from "./verticalDramaSeriesTrailerAssembly";

export type VerticalDramaFfmpegAssemblyRunOutcome = {
  ok: boolean;
  videoUrl?: string;
  error?: string;
};

/* -------------------------------------------------------------------------- */
/* renderFeed shapes — derived from each render function's own arg type via   */
/* `Parameters<...>`, minus the fields THIS module supplies itself (the      */
/* injectable ffmpeg/probe/render functions + `jobId`, which this module     */
/* mints fresh per claim rather than trusting a caller-supplied one).        */
/* -------------------------------------------------------------------------- */

type RunAssemblyJobArgs = Parameters<typeof runAssemblyJob>[0];
type SubEpisodeRenderFeed = Omit<
  RunAssemblyJobArgs,
  "jobId" | "ffmpegRunner" | "probeDurationSecondsFn"
>;

type RunProductionEpisodeGroupJobArgs = Parameters<typeof runProductionEpisodeGroupJob>[0];
type ProductionEpisodeGroupRenderFeed = Omit<
  RunProductionEpisodeGroupJobArgs,
  "ffmpegRunner" | "probeDurationSecondsFn" | "renderSubEpisodeWithOptionsFn"
>;

type RunTrailerJobArgs = Parameters<typeof runTrailerJob>[0];
type TrailerRenderFeed = Omit<RunTrailerJobArgs, "jobId" | "ffmpegRunner">;

/* -------------------------------------------------------------------------- */
/* Per-kind dispatch                                                          */
/* -------------------------------------------------------------------------- */

async function runSubEpisodeKind(
  contract: VerticalDramaFfmpegAssemblyJobContract,
  jobId: string,
): Promise<VerticalDramaFfmpegAssemblyRunOutcome> {
  const { runAssemblyJob: run } = await import("./verticalDramaEpisodeVideoAssembly");
  const feed = contract.renderFeed as unknown as SubEpisodeRenderFeed;
  if (!feed?.owner) {
    return { ok: false, error: "vertical_drama_ffmpeg_assembly_missing_owner" };
  }

  // `runAssemblyJob` never throws (see its own doc comment) — it catches
  // internally and persists a "failed" `assemblyManifest.compiledVideo`
  // state instead. Awaiting it just means "the job reached a terminal
  // state"; the re-read below is what learns WHICH terminal state.
  await run({ ...feed, jobId });

  const owner = feed.owner;
  const [row] = await db
    .select({ assemblyManifest: verticalDramaEpisodes.assemblyManifest })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, owner.tenantId),
        eq(verticalDramaEpisodes.userId, owner.userId),
        eq(verticalDramaEpisodes.seriesId, owner.seriesId),
        eq(verticalDramaEpisodes.id, owner.episodeId),
      ),
    )
    .limit(1);

  const manifest = row?.assemblyManifest as VerticalDramaAssemblyManifest | null | undefined;
  const compiledVideo = manifest?.compiledVideo;
  if (compiledVideo?.status === "completed" && compiledVideo.videoUrl) {
    return { ok: true, videoUrl: compiledVideo.videoUrl };
  }
  return {
    ok: false,
    error: compiledVideo?.error ?? "vertical_drama_ffmpeg_assembly_no_compiled_video",
  };
}

async function runProductionEpisodeGroupKind(
  contract: VerticalDramaFfmpegAssemblyJobContract,
): Promise<VerticalDramaFfmpegAssemblyRunOutcome> {
  const { runProductionEpisodeGroupJob: run, renderSubEpisodeWithOptions } = await import(
    "./verticalDramaProductionEpisodeAssembly"
  );
  const { defaultFfmpegRunner, probeDurationSeconds } = await import(
    "./verticalDramaEpisodeVideoAssembly"
  );
  const feed = contract.renderFeed as unknown as ProductionEpisodeGroupRenderFeed;
  if (!feed?.owner || feed.groupIndex === undefined || feed.groupIndex === null) {
    return { ok: false, error: "vertical_drama_ffmpeg_assembly_missing_group_fields" };
  }

  // `runProductionEpisodeGroupJob` never throws either — same "catch
  // internally, persist a per-group terminal state" convention as
  // `runAssemblyJob` (see that function's own doc comment).
  await run({
    ...feed,
    ffmpegRunner: defaultFfmpegRunner,
    probeDurationSecondsFn: probeDurationSeconds,
    renderSubEpisodeWithOptionsFn: renderSubEpisodeWithOptions,
  });

  const owner = feed.owner;
  const [row] = await db
    .select({ productionEpisodesManifest: verticalDramaSeries.productionEpisodesManifest })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId),
      ),
    )
    .limit(1);

  const manifest = row?.productionEpisodesManifest as
    | { episodes?: Array<{ index: number; status?: string; videoUrl?: string; error?: string }> }
    | null
    | undefined;
  const group = manifest?.episodes?.find((entry) => entry.index === feed.groupIndex);
  if (group?.status === "completed" && group.videoUrl) {
    return { ok: true, videoUrl: group.videoUrl };
  }
  return {
    ok: false,
    error: group?.error ?? "vertical_drama_ffmpeg_assembly_group_not_completed",
  };
}

async function runTrailerKind(
  contract: VerticalDramaFfmpegAssemblyJobContract,
  jobId: string,
): Promise<VerticalDramaFfmpegAssemblyRunOutcome> {
  const { runTrailerJob: run } = await import("./verticalDramaSeriesTrailerAssembly");
  const { defaultFfmpegRunner } = await import("./verticalDramaEpisodeVideoAssembly");
  const feed = contract.renderFeed as unknown as TrailerRenderFeed;
  if (!feed?.owner) {
    return { ok: false, error: "vertical_drama_ffmpeg_assembly_missing_owner" };
  }

  // `runTrailerJob` never throws — same "catch internally, persist
  // `series.trailer`" convention as the two functions above.
  await run({ ...feed, jobId, ffmpegRunner: defaultFfmpegRunner });

  const owner = feed.owner;
  const [row] = await db
    .select({ trailer: verticalDramaSeries.trailer })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId),
      ),
    )
    .limit(1);

  const trailer = row?.trailer as { status?: string; videoUrl?: string; error?: string } | null | undefined;
  if (trailer?.status === "completed" && trailer.videoUrl) {
    return { ok: true, videoUrl: trailer.videoUrl };
  }
  return {
    ok: false,
    error: trailer?.error ?? "vertical_drama_ffmpeg_assembly_trailer_not_completed",
  };
}

/**
 * Runs ONE claimed `vertical_drama_ffmpeg_assembly` job to completion and
 * reports its outcome. Never throws — every failure path (bad renderFeed
 * shape, a service throwing unexpectedly, a missing persisted terminal
 * state) is caught here and returned as `{ ok: false, error }`, so
 * `inlineRenderWorker.ts`'s claim loop can always write a terminal
 * `worker_jobs` status without wrapping this call in its own try/catch.
 */
export async function runVerticalDramaFfmpegAssemblyJob(
  contract: VerticalDramaFfmpegAssemblyJobContract,
  jobId: string,
): Promise<VerticalDramaFfmpegAssemblyRunOutcome> {
  try {
    switch (contract.kind) {
      case "sub_episode":
      case "season_sub_episode":
        return await runSubEpisodeKind(contract, jobId);
      case "production_episode_group":
        return await runProductionEpisodeGroupKind(contract);
      case "trailer":
        return await runTrailerKind(contract, jobId);
      default: {
        const unknownKind: never = contract.kind;
        return {
          ok: false,
          error: `vertical_drama_ffmpeg_assembly_unknown_kind: ${String(unknownKind)}`,
        };
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Cancel-reset — Vertical Drama Render Queue plan §4.5, Wave 3.              */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort reset of whatever VD state a canceled
 * `vertical_drama_ffmpeg_assembly` job left in a non-terminal "still
 * rendering" state (`compiledVideo.status: "pending"` /
 * `productionEpisodesManifest.episodes[i].status: "pending"` /
 * `trailer.status: "processing"`), so the episode/series UI unblocks
 * instead of polling forever after the user cancels a queued/running job.
 * Called by the user-cancel path (`workerJobMonitorService.cancelQueuedJob`
 * via `cancelQueuedUserWorkerJob`) AFTER the `worker_jobs` row is already
 * flipped to `"canceled"` — this function's own failures must NEVER surface
 * as a cancel failure, so the whole dispatch is wrapped and only logged.
 *
 * Re-hydrates `contract.renderFeed` into each kind's own numeric-id owner
 * shape (`feed.owner`) rather than `contract.owner` (the loosely
 * `string`-typed envelope field, used only for idempotency/queue display) —
 * mirrors the exact same `as unknown as <RenderFeed>` cast convention
 * `runSubEpisodeKind`/`runProductionEpisodeGroupKind`/`runTrailerKind` above
 * already use.
 *
 * `production_episode_group` and `trailer` patch `verticalDramaSeries`
 * directly here (read-modify-write) rather than reusing
 * `patchProductionEpisodeGroupState`/`persistTrailerState` — both are
 * module-private (not exported) in their owning service files, which this
 * wave does not otherwise touch.
 */
export async function resetVerticalDramaFfmpegAssemblyStateOnCancel(
  contract: VerticalDramaFfmpegAssemblyJobContract,
): Promise<void> {
  try {
    switch (contract.kind) {
      case "sub_episode":
      case "season_sub_episode":
        await resetSubEpisodeStateOnCancel(contract);
        return;
      case "production_episode_group":
        await resetProductionEpisodeGroupStateOnCancel(contract);
        return;
      case "trailer":
        await resetTrailerStateOnCancel(contract);
        return;
      default: {
        const unknownKind: never = contract.kind;
        void unknownKind;
        return;
      }
    }
  } catch (error) {
    debugError(
      "verticalDramaFfmpegAssemblyRunner",
      `Failed to reset VD state for canceled "${contract.kind}" job`,
      error,
    );
  }
}

async function resetSubEpisodeStateOnCancel(
  contract: VerticalDramaFfmpegAssemblyJobContract,
): Promise<void> {
  const feed = contract.renderFeed as unknown as SubEpisodeRenderFeed;
  if (!feed?.owner) return;

  const { persistCompiledVideoState } = await import("./verticalDramaEpisodeVideoAssembly");
  await persistCompiledVideoState(feed.owner, {
    status: "failed",
    error: "canceled",
    pendingJobId: undefined,
  });
}

async function resetProductionEpisodeGroupStateOnCancel(
  contract: VerticalDramaFfmpegAssemblyJobContract,
): Promise<void> {
  const groupIndex = contract.display?.groupIndex;
  if (groupIndex === undefined || groupIndex === null) return;

  const feed = contract.renderFeed as unknown as ProductionEpisodeGroupRenderFeed;
  if (!feed?.owner) return;
  const owner = feed.owner;

  const [row] = await db
    .select({ productionEpisodesManifest: verticalDramaSeries.productionEpisodesManifest })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId),
      ),
    )
    .limit(1);
  if (!row) return;

  const existing = row.productionEpisodesManifest as
    | { groupSize?: 5 | 10; episodes?: Array<{ index: number; status?: string; error?: string }> }
    | null
    | undefined;
  if (!existing || !Array.isArray(existing.episodes)) return;

  const nextEpisodes = existing.episodes.map((entry) =>
    entry.index === groupIndex
      ? { ...entry, status: "failed" as const, error: "canceled" }
      : entry,
  );

  await db
    .update(verticalDramaSeries)
    .set({
      productionEpisodesManifest: { ...existing, episodes: nextEpisodes } as unknown as object,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
      ),
    );
}

async function resetTrailerStateOnCancel(
  contract: VerticalDramaFfmpegAssemblyJobContract,
): Promise<void> {
  const feed = contract.renderFeed as unknown as TrailerRenderFeed;
  if (!feed?.owner) return;
  const owner = feed.owner;

  const [row] = await db
    .select({ trailer: verticalDramaSeries.trailer })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId),
      ),
    )
    .limit(1);
  if (!row) return;

  const existing =
    row.trailer && typeof row.trailer === "object"
      ? (row.trailer as Record<string, unknown>)
      : {};

  await db
    .update(verticalDramaSeries)
    .set({
      trailer: {
        ...existing,
        status: "failed",
        error: "canceled",
        updatedAt: new Date().toISOString(),
      } as unknown as object,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
      ),
    );
}
