/**
 * Vertical Drama Series — async job dispatch for `storyboard_shotgrid`'s
 * REAL (non dry_run/plan_only) generation stage (bug #127,
 * `planning/vd-storyboard-runstage-async-job/plan.md`): Cloudflare's edge
 * proxy gives up after ~100s of no response bytes, which is shorter than
 * (and independent of) nginx/Node's own 600s timeouts already tuned for this
 * class of mutation. `generateStoryboardShotgrid`'s single ~16k-token LLM
 * call routinely runs longer than that, so the old fully-synchronous
 * `runStage` mutation would appear to fail from the browser's perspective
 * even after nginx (`proxy_ignore_client_abort on`, 2026-07-24) stopped
 * destroying the in-flight work server-side.
 *
 * Unlike `verticalDramaStoryJobs.ts` (season/bible-shaped story jobs with
 * their own Redis-JSON job records + heartbeat checkpointing/resume), this
 * job boundary is intentionally thin — the async status record IS
 * `vertical_drama_episode_runs` itself (design option A, this feature's
 * plan doc): the router inserts a `queued` row
 * (`VerticalDramaEpisodePipeline.submitStoryboardShotgridStage`) and returns
 * to the client immediately; this queue's only job is making sure
 * `VerticalDramaEpisodePipeline.runStoryboardShotgridStageJob` actually runs
 * in the background and updates that same row when it's done (success or
 * failure — see that method's doc comment for the "never leave the row
 * stuck at queued/running" hard requirement).
 *
 * The canonical worker_jobs control plane admits and executes the work. The
 * stale-run sweep remains a domain-record repair for a process interruption
 * between the episode run mutation and worker settlement.
 */

import { debugError } from "../_core/logger";
import {
  createFeature186VerticalDramaJob,
} from "./feature186VerticalDramaJobAdapter";
import type {
  EpisodeRunOwner,
  RunStageOptions,
} from "./verticalDramaEpisodePipeline";
import type { VerticalDramaPipelineStage } from "@shared/verticalDramaSeries/contracts";

export const VERTICAL_DRAMA_EPISODE_STAGE_JOBS_QUEUE =
  "vertical_drama_episode_stage_jobs";

const VERTICAL_DRAMA_EPISODE_STAGE_JOBS_WORKER_CONCURRENCY = 3;

/**
 * How often the orphaned-run sweep fires. The sweep body itself
 * (`sweepStaleStoryboardShotgridRuns`, 30 min staleness threshold) lives in
 * `verticalDramaEpisodePipeline.ts` next to the run-row lifecycle it heals.
 * Exported for the unit test's fake-timer advance.
 */
export const STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface VerticalDramaEpisodeStageJobData {
  runId: number;
  owner: EpisodeRunOwner;
  opts: RunStageOptions;
  /**
   * Which stage this job runs
   * (`planning/vd-async-stage-jobs-generalization/plan.md` S5). OPTIONAL on
   * purpose: jobs already sitting in the queue when this deploys were enqueued
   * without it, and they are all `storyboard_shotgrid` — the worker defaults
   * to that so nothing in flight is dropped.
   */
  stage?: VerticalDramaPipelineStage;
  /**
   * Only set by `regenerateStage`'s router call site — see
   * `clearStoryboardShotgridDownstreamAfterRegenerate`'s doc comment in
   * `verticalDramaEpisodePipeline.ts` for what this triggers on success.
   */
  clearDownstreamOnSuccess?: boolean;
}

/* -------------------------------------------------------------------------- */
/**
 * Submit-time admission. The episode run is already durable when this is
 * called; if canonical admission fails, close that run immediately so the
 * pipeline can safely offer a fresh retry.
 */
export async function enqueueVerticalDramaEpisodeStageJob(
  data: VerticalDramaEpisodeStageJobData
): Promise<{ enqueued: boolean }> {
  try {
    await createFeature186VerticalDramaJob({
      jobId: `vd_episode_stage_${data.runId}`,
      tenantId: data.owner.tenantId,
      userId: data.owner.userId,
      jobType: "vertical_drama.episode_stage",
      executionClass: "long",
      payload: data as unknown as Record<string, unknown>,
    });
    return { enqueued: true };
  } catch (error) {
    debugError(
      "vd_episode_stage_jobs",
      `Failed to enqueue episode-stage job for storyboard_shotgrid run #${data.runId} (episode #${data.owner.episodeId}) — marking the run failed instead of leaving it stranded at 'queued'`,
      error
    );
    try {
      // Lazy, execution-time import — same no-static-circular-import
      // convention as the worker body below.
      const { markStoryboardShotgridRunFailed } = await import(
        "./verticalDramaEpisodePipeline"
      );
      await markStoryboardShotgridRunFailed(
        data.runId,
        `Could not enqueue the background storyboard job (${
          error instanceof Error ? error.message : String(error)
        }) — the run was failed immediately so it cannot sit at 'queued' forever. Running the stage again is safe.`
      );
    } catch (markError) {
      debugError(
        "vd_episode_stage_jobs",
        `Run #${data.runId} could not be marked failed after its enqueue failed — the periodic stale-run sweep is the remaining fallback for this row`,
        markError
      );
    }
    return { enqueued: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Orphaned-run sweep (bug #127 hardening)                                    */
/* -------------------------------------------------------------------------- */

let sweepTimer: ReturnType<typeof setInterval> | null = null;

async function runStaleRunSweepTick(): Promise<void> {
  try {
    // Lazy, execution-time import — same no-static-circular-import
    // convention as the worker body below.
    const { sweepStaleStoryboardShotgridRuns } = await import(
      "./verticalDramaEpisodePipeline"
    );
    await sweepStaleStoryboardShotgridRuns();
  } catch (error) {
    debugError(
      "vd_episode_stage_jobs",
      "Stale storyboard_shotgrid run sweep tick failed",
      error
    );
  }
}

/**
 * Arms the periodic orphaned-run sweep. Called from
 * `initVerticalDramaEpisodeStageJobsQueue`. Fires once immediately so a
 * domain row left by a prior process interruption can be reconciled, then every
 * `STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS`. Timer shape mirrors
 * `server/jobs/workerStallWatchdogJob.ts`'s interval convention;
 * `closeVerticalDramaEpisodeStageJobsQueue` clears it on shutdown.
 */
function startStaleRunSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void runStaleRunSweepTick();
  }, STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS);
  void runStaleRunSweepTick();
}

/**
 * Arms the domain-level stale-run reconciliation. Canonical delivery itself
 * is performed by the PostgreSQL worker through the executor registry.
 */
export async function initVerticalDramaEpisodeStageJobsQueue(): Promise<void>  {
  // Canonical worker_jobs owns delivery. The domain run row still needs its
  // independent stale-row reconciliation for a process that dies after the
  // domain mutation but before the worker records its terminal outcome.
  startStaleRunSweep();
}

export async function closeVerticalDramaEpisodeStageJobsQueue(): Promise<void>  {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}
