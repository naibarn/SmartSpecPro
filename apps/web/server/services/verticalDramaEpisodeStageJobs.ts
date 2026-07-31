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
 * queue is a THIN BullMQ dispatch layer only — the async status record IS
 * `vertical_drama_episode_runs` itself (design option A, this feature's
 * plan doc): the router inserts a `queued` row
 * (`VerticalDramaEpisodePipeline.submitStoryboardShotgridStage`) and returns
 * to the client immediately; this queue's only job is making sure
 * `VerticalDramaEpisodePipeline.runStoryboardShotgridStageJob` actually runs
 * in the background and updates that same row when it's done (success or
 * failure — see that method's doc comment for the "never leave the row
 * stuck at queued/running" hard requirement).
 *
 * BullMQ wiring mirrors `verticalDramaStoryJobs.ts`'s
 * `initVerticalDramaStoryJobsQueue`/`closeVerticalDramaStoryJobsQueue`
 * exactly (lazy `await import("bullmq")`, a `Queue` + `Worker` pair with
 * best-effort init that degrades to "job stays queued until a worker comes
 * up" when Redis/BullMQ isn't reachable, a `worker.on("failed", ...)`
 * logger) — see that file's own header doc comment for why this shape was
 * chosen over the alternatives it investigated.
 *
 * Hardening (2026-07-28, after runs #496/#501 were stranded by the missing
 * `_core/index.ts` init): enqueue is now FAIL-FAST (a thrown BullMQ add
 * marks the freshly-inserted row `failed` instead of orphaning it at
 * `queued`), and `initVerticalDramaEpisodeStageJobsQueue` also arms a
 * periodic orphaned-run sweep (`sweepStaleStoryboardShotgridRuns` in the
 * pipeline service) that fail-safes any run stuck at `queued`/`running`
 * past the staleness threshold — so the pipeline's idempotency reuse can
 * never turn a dead row into a poison pill again.
 */

import { debugError } from "../_core/logger";
import { getRedisClient } from "./redis";
import type {
  EpisodeRunOwner,
  RunStageOptions,
  VerticalDramaPipelineStage,
} from "./verticalDramaEpisodePipeline";

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
/* BullMQ wiring (lazy init, mirrors `verticalDramaStoryJobs.ts` exactly)     */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

async function defaultEnqueueBullmqJob(
  data: VerticalDramaEpisodeStageJobData
): Promise<void> {
  if (!queue) {
    throw new Error(
      `${VERTICAL_DRAMA_EPISODE_STAGE_JOBS_QUEUE} queue is not initialized`
    );
  }
  await queue.add("run", data, {
    removeOnComplete: true,
    // No BullMQ-level retry: `runStoryboardShotgridStageJob`'s own outer
    // try/catch already guarantees the run row always resolves to
    // `succeeded`/`failed` (never left throwing out of the processor for a
    // LOGICAL failure), so a BullMQ redelivery would only ever fire for a
    // genuine worker crash mid-run — which would double-charge credits if
    // retried blindly (unlike `verticalDramaStoryJobs.ts`'s chunked story
    // jobs, this stage has no per-chunk checkpoint to resume from safely).
    // `removeOnFail` is bounded (24h) so a job whose one attempt errors
    // stays inspectable for a day instead of vanishing immediately.
    attempts: 1,
    removeOnFail: { age: 24 * 60 * 60 },
  });
}

/**
 * Submit-time enqueue — FAIL-FAST (bug #127 hardening). The `queued` row is
 * already durably written by the caller
 * (`VerticalDramaEpisodePipeline.submitStoryboardShotgridStage`, always with
 * `alreadySubmitted: false` — this is only ever called for a freshly
 * inserted row) BEFORE this runs. This used to mirror
 * `verticalDramaStoryJobs.ts`'s best-effort degradation, but that module's
 * Redis job RECORD is a self-contained unit a later worker can still pick
 * up — here the row has NO job behind it at all once `queue.add` throws, so
 * "leave it queued" really meant "orphan it forever" (the runs #496/#501
 * poison pill: the idempotency reuse kept returning the dead row and
 * skipping every retry's enqueue). On enqueue failure the row is marked
 * `failed` immediately instead, and `{ enqueued: false }` is returned so
 * the router can hand the client a failed (safely re-runnable) result —
 * still never a 500.
 */
export async function enqueueVerticalDramaEpisodeStageJob(
  data: VerticalDramaEpisodeStageJobData,
  // Overridable for tests.
  enqueueBullmqJob: (
    data: VerticalDramaEpisodeStageJobData
  ) => Promise<void> = defaultEnqueueBullmqJob
): Promise<{ enqueued: boolean }> {
  try {
    await enqueueBullmqJob(data);
    return { enqueued: true };
  } catch (error) {
    debugError(
      "vd_episode_stage_jobs",
      `Failed to enqueue BullMQ job for storyboard_shotgrid run #${data.runId} (episode #${data.owner.episodeId}) — marking the run failed instead of leaving it stranded at 'queued'`,
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
 * `initVerticalDramaEpisodeStageJobsQueue` BEFORE (and regardless of) BullMQ
 * init succeeding — the sweep matters most precisely when BullMQ/Redis is
 * broken, because that is when submits strand `queued` rows with no job
 * behind them (bug #127, runs #496/#501). Fires once immediately so orphans
 * from before a restart heal right away, then every
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
 * Registers the BullMQ `Queue` + `Worker` for
 * `vertical_drama_episode_stage_jobs`. Call once from `_core/index.ts`'s
 * startup sequence (mirrors `initVerticalDramaStoryJobsQueue`'s exact call
 * site/try-catch convention). The worker body lazily `import()`s the
 * pipeline service + provider-routing port — dynamic, execution-time imports
 * (not static top-level ones), same convention `verticalDramaStoryJobs.ts`
 * uses for its own worker body, so this file and the pipeline service never
 * form a static circular import surprise at module-load time.
 */
export async function initVerticalDramaEpisodeStageJobsQueue(): Promise<void> {
  // Orphan sweep first, outside the BullMQ try/catch — it must arm even
  // when BullMQ init below fails (see `startStaleRunSweep`'s doc comment).
  startStaleRunSweep();
  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_EPISODE_STAGE_JOBS_QUEUE, { connection });
    worker = new Worker(
      VERTICAL_DRAMA_EPISODE_STAGE_JOBS_QUEUE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (bullJob: any) => {
        const data = bullJob.data as VerticalDramaEpisodeStageJobData;
        const { VerticalDramaEpisodePipeline } = await import(
          "./verticalDramaEpisodePipeline"
        );
        const { createVerticalDramaProviderRoutingPort } = await import(
          "./verticalDramaProviderRouting"
        );
        // Always the real (non-stub) provider-routing port — this queue is
        // only ever enqueued for a REAL (non dry_run/plan_only) generation,
        // same as `pipelineForMode`'s own non-dry-run branch in the router.
        const pipeline = new VerticalDramaEpisodePipeline(
          createVerticalDramaProviderRoutingPort()
        );
        // `storyboard_shotgrid` keeps its own purpose-built job body — it
        // carries the `clearDownstreamOnSuccess` regenerate hook and a tail
        // specialized to that stage. Every other async stage goes through the
        // generic runner, which delegates to `runStage` itself.
        const stage = data.stage ?? "storyboard_shotgrid";
        if (stage === "storyboard_shotgrid") {
          await pipeline.runStoryboardShotgridStageJob(
            data.owner,
            data.runId,
            data.opts,
            data.clearDownstreamOnSuccess
          );
        } else {
          await pipeline.runEpisodeStageJob(
            data.owner,
            data.runId,
            stage,
            data.opts
          );
        }
      },
      {
        connection,
        concurrency: VERTICAL_DRAMA_EPISODE_STAGE_JOBS_WORKER_CONCURRENCY,
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker.on("failed", (bullJob: any, err: Error) => {
      console.error(
        `[${VERTICAL_DRAMA_EPISODE_STAGE_JOBS_QUEUE}] Job ${bullJob?.id} failed:`,
        err.message
      );
    });
  } catch (err) {
    console.warn(
      `[${VERTICAL_DRAMA_EPISODE_STAGE_JOBS_QUEUE}] BullMQ initialization skipped:`,
      (err as Error).message
    );
  }
}

export async function closeVerticalDramaEpisodeStageJobsQueue(): Promise<void> {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  try {
    await worker?.close();
    await queue?.close();
  } catch {
    // ignore
  } finally {
    queue = null;
    worker = null;
  }
}
