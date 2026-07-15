/**
 * Vertical Drama Render Queue — in-server ffmpeg render worker
 * (`planning/vertical-drama-render-queue/plan.md` §4.3, Wave 2).
 *
 * An interval drainer that, when the admin flag
 * (`renderWorkerSettings.getWebProcessRenderWorkerEnabled`) is ON, claims
 * and runs ONLY `vertical_drama_ffmpeg_assembly` `worker_jobs` rows —
 * generalizing `videoIntelligenceJobs.ts`'s `dispatchLaneARemotionRenderJob`
 * (a ONE-SHOT claim-and-run for a job it just enqueued) into a recurring
 * poll loop that claims whatever is queued, from any request. Same atomic
 * claim (`UPDATE … WHERE id=? AND status='queued' RETURNING id`) and
 * terminal-write guard (`WHERE … AND status='running'`, so a concurrent
 * user cancel — which flips status to `'canceled'` — can never be
 * clobbered) as that precedent.
 *
 * Timer plumbing (guard-against-double-start + `unref()` so the process can
 * still exit cleanly, e.g. during tests or a graceful shutdown) mirrors
 * `deferredMediaRetryService.ts`'s `scheduleWorker`/`workerTimer` pattern.
 *
 * `startInlineRenderWorker`/`stopInlineRenderWorker` are DEFINED here only —
 * wiring them into server startup (`_core/index.ts`) and the admin toggle's
 * live start/stop hook (`systemSettings.ts`) is a LATER wave (§4.4); this
 * wave never calls either at module load.
 *
 * The actual per-job business logic (claim one queued row, run it, write
 * its terminal status) lives in the exported, dependency-injectable
 * `runInlineRenderWorkerTick` — the scheduling loop below is a thin
 * `setTimeout` wrapper around it. Tests call `runInlineRenderWorkerTick`
 * directly with fake deps; they never need to touch the timer/start/stop
 * machinery at all.
 */
import { and, asc, desc, eq } from "drizzle-orm";

import { debugError } from "../_core/logger";
import { db } from "../db";
import { workerJobs, type WorkerJob } from "../../drizzle/schema";
import {
  VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
  verticalDramaFfmpegAssemblyJobContractSchema,
  type VerticalDramaFfmpegAssemblyJobContract,
} from "../../shared/workerRuntime";
import { getWebProcessRenderWorkerEnabled } from "./renderWorkerSettings";
import {
  runVerticalDramaFfmpegAssemblyJob as defaultRunVerticalDramaFfmpegAssemblyJob,
  type VerticalDramaFfmpegAssemblyRunOutcome,
} from "./verticalDramaFfmpegAssemblyRunner";

const POLL_INTERVAL_MS = 3_000;
/** Cap on how much of a failed job's error text is persisted onto
 *  `worker_jobs.failureReason` — avoids a runaway JSONB/text row. */
const MAX_FAILURE_REASON_LENGTH = 500;

/** Minimal subset of the real `db` object this module needs — lets tests
 *  inject a fake without pulling in the whole Drizzle surface. */
export type InlineRenderWorkerDb = Pick<typeof db, "select" | "update">;

export interface InlineRenderWorkerTickDeps {
  db?: InlineRenderWorkerDb;
  getEnabled?: () => Promise<boolean>;
  runJob?: (
    contract: VerticalDramaFfmpegAssemblyJobContract,
    jobId: string,
  ) => Promise<VerticalDramaFfmpegAssemblyRunOutcome>;
}

let workerTimer: NodeJS.Timeout | null = null;
let stopped = true;

/** Number of `vertical_drama_ffmpeg_assembly` jobs currently running
 *  in-process (not yet written to a terminal `worker_jobs` status). */
let activeCount = 0;

function getMaxConcurrency(): number {
  const raw = Number(process.env.SMARTSPEC_INLINE_RENDER_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

/** Selects the highest-priority, oldest queued `vertical_drama_ffmpeg_assembly`
 *  job, if any — a plain read, no claim. */
async function selectNextQueuedCandidate(
  dbLike: InlineRenderWorkerDb,
): Promise<WorkerJob | null> {
  const [candidate] = await dbLike
    .select()
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.status, "queued"),
        eq(workerJobs.jobType, VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE),
      ),
    )
    .orderBy(desc(workerJobs.priority), asc(workerJobs.createdAt))
    .limit(1);
  return candidate ?? null;
}

/** Atomically claims ONE specific candidate row (queued -> running). Returns
 *  `false` when a concurrent claimer already won the race for this exact row
 *  between our SELECT and this UPDATE (guarded `WHERE … AND status='queued'`
 *  affected 0 rows) — the caller re-selects rather than giving up the whole
 *  drain pass, since a DIFFERENT queued row may still be available. Only the
 *  `{id}` confirmation is fetched back — the full row (with `inputJson`) is
 *  already in hand from the SELECT above, so it is never re-fetched here. */
async function claimCandidate(
  dbLike: InlineRenderWorkerDb,
  candidateId: string,
): Promise<boolean> {
  const claimed = await dbLike
    .update(workerJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(workerJobs.id, candidateId), eq(workerJobs.status, "queued")))
    .returning({ id: workerJobs.id });
  return claimed.length > 0;
}

/** Runs ONE already-claimed job to completion and writes its terminal
 *  `worker_jobs` status, guarded `WHERE status='running'` so a concurrent
 *  user cancel (which sets `status='canceled'`) is never overwritten. Never
 *  throws — every failure path (bad `inputJson`, an unexpected error from
 *  the runner, or a failed terminal-write itself) is caught and logged. */
async function runClaimedJob(
  dbLike: InlineRenderWorkerDb,
  job: WorkerJob,
  runJob: NonNullable<InlineRenderWorkerTickDeps["runJob"]>,
): Promise<void> {
  try {
    const parsed = verticalDramaFfmpegAssemblyJobContractSchema.parse(job.inputJson);
    const outcome = await runJob(parsed, job.id);
    const terminal = outcome.ok
      ? { status: "completed" as const, outputJson: { videoUrl: outcome.videoUrl ?? null } }
      : {
          status: "failed" as const,
          failureReason: (outcome.error ?? "vertical_drama_ffmpeg_assembly_failed").slice(
            0,
            MAX_FAILURE_REASON_LENGTH,
          ),
        };

    await dbLike
      .update(workerJobs)
      .set({ ...terminal, finishedAt: new Date() })
      .where(and(eq(workerJobs.id, job.id), eq(workerJobs.status, "running")));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await dbLike
        .update(workerJobs)
        .set({
          status: "failed",
          failureReason: message.slice(0, MAX_FAILURE_REASON_LENGTH),
          finishedAt: new Date(),
        })
        .where(and(eq(workerJobs.id, job.id), eq(workerJobs.status, "running")));
    } catch (persistError) {
      debugError(
        "inlineRenderWorker",
        `Failed to persist terminal failure state for worker job ${job.id}`,
        persistError,
      );
    }
    debugError(
      "inlineRenderWorker",
      `vertical_drama_ffmpeg_assembly job ${job.id} failed`,
      error,
    );
  }
}

/**
 * One drain pass: while under the concurrency cap, claim + fire-and-forget
 * run queued `vertical_drama_ffmpeg_assembly` jobs. Re-checks the admin
 * flag at the START of every call (defense-in-depth — see plan §7 "flag
 * flip mid-render" risk row) so a flag flipped OFF between ticks stops
 * claiming NEW work immediately, without needing to touch the scheduling
 * loop below.
 *
 * Pure business logic, fully dependency-injectable — exported for direct
 * unit testing (no timers, no real DB, no real render functions involved).
 */
export async function runInlineRenderWorkerTick(
  deps: InlineRenderWorkerTickDeps = {},
): Promise<void> {
  const dbLike = deps.db ?? db;
  const getEnabled = deps.getEnabled ?? getWebProcessRenderWorkerEnabled;
  const runJob = deps.runJob ?? defaultRunVerticalDramaFfmpegAssemblyJob;

  const enabled = await getEnabled();
  if (!enabled) return;

  const maxConcurrency = getMaxConcurrency();
  while (activeCount < maxConcurrency) {
    let candidate: WorkerJob | null;
    try {
      candidate = await selectNextQueuedCandidate(dbLike);
    } catch (error) {
      debugError(
        "inlineRenderWorker",
        "Failed to select next vertical_drama_ffmpeg_assembly job",
        error,
      );
      break;
    }
    if (!candidate) break; // nothing queued — nothing left to drain this tick.

    let claimed: boolean;
    try {
      claimed = await claimCandidate(dbLike, candidate.id);
    } catch (error) {
      debugError(
        "inlineRenderWorker",
        `Failed to claim vertical_drama_ffmpeg_assembly job ${candidate.id}`,
        error,
      );
      break;
    }
    if (!claimed) continue; // lost the race for THIS row — a different queued row may remain.

    activeCount += 1;
    void runClaimedJob(dbLike, candidate, runJob).finally(() => {
      activeCount -= 1;
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Scheduling loop — guard-against-double-start + `unref()`, mirrors          */
/* `deferredMediaRetryService.ts`'s `scheduleWorker`/`workerTimer`.           */
/* -------------------------------------------------------------------------- */

function scheduleNextTick(delayMs: number): void {
  workerTimer = setTimeout(() => {
    workerTimer = null;
    void runInlineRenderWorkerTick()
      .catch((error) => {
        debugError("inlineRenderWorker", "Unexpected error in inline render worker tick", error);
      })
      .finally(() => {
        if (!stopped) {
          scheduleNextTick(POLL_INTERVAL_MS);
        }
      });
  }, Math.max(0, delayMs));
  workerTimer.unref?.();
}

/** Starts the interval drainer (idempotent — a second call while already
 *  running is a no-op). Does NOT claim anything synchronously; the first
 *  tick runs on the next event-loop turn. */
export function startInlineRenderWorker(): void {
  if (workerTimer) return;
  stopped = false;
  scheduleNextTick(0);
}

/** Stops scheduling NEW ticks. Any tick already in flight (and any job it
 *  already fired via `runClaimedJob`) is allowed to finish naturally — this
 *  only prevents new claims from starting. */
export function stopInlineRenderWorker(): void {
  stopped = true;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
}
