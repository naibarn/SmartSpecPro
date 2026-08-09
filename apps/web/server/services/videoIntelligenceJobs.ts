/**
 * Video Intelligence Platform — async job queue (Feature 133, section-07 §5).
 * Mirrors `server/services/verticalDramaStoryJobs.ts` (the in-repo
 * submit -> jobId -> poll precedent) for the generic, kind-agnostic
 * queue/worker/status plumbing. `routers/videoProjects.ts` owns the
 * kind-specific domain logic (scene-plan / narration / quality-review /
 * quality-repair) via the injected `VideoIntelligenceJobExecutor`.
 *
 * Persistence: job records are a small Redis-JSON blob per `jobId`
 * (`vi:job:<jobId>`, `JOB_RECORD_TTL_SECONDS` TTL) — NOT a new DB table
 * (`drizzle/schema.ts` is section-05's owned surface, additive-only; no new
 * columns needed here). Per-project exclusivity is a SEPARATE Redis pointer
 * key (`vi:job:active:<tenantId>:<projectId>`) — dedupe: `enqueueVideoIntelligenceJob`
 * returns the existing `jobId` instead of double-submitting; the worker body
 * clears the pointer in a `finally`, guarded so it only clears a pointer that
 * still points at ITS OWN jobId.
 *
 * ── Lane-A render dispatch (closes implementation-progress.md gap #2) ──────
 *
 * `queueRemotionRenderVideoJob` (section-04, `workerSchedulerService.ts`)
 * inserts a `worker_jobs` row (`runtimeType: "desktop_zeroclaw_managed"`,
 * `status: "queued"`) but nothing in the existing codebase ever claims/
 * executes it — section-04's own note flags this as section-07's gap to
 * close. Lane A is explicitly documented as **in-process** (section-04 §3's
 * dependency table: "Lane A is in-process — call directly"), so the simplest
 * correct wiring is an inline dispatch in the SAME server process that just
 * queued the job, not a new poller/queue-consumer: `dispatchLaneARemotionRenderJob`
 * below loads the just-inserted `worker_jobs` row, transitions it
 * queued -> running (a `db.update` guarded by `WHERE status = 'queued'` so a
 * concurrent dispatch can never double-claim it), calls
 * `executeRemotionRenderVideoJob` (section-04's Lane-A executor,
 * `hyperframesRenderWorker.ts`), and writes the terminal
 * completed/failed status + `outputJson`/`failureReason` back onto the row.
 * `routers/videoProjects.ts`'s `queueRender` calls this in a fire-and-forget
 * `void` call immediately after a successful (non-deduped) enqueue, so the
 * tRPC response returns `{ workerJobId }` immediately while the render runs
 * in the background of the same request-handling process.
 */
import { randomUUID } from "crypto";
import { and, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { getRedisClient } from "./redis";
import { debugError } from "../_core/logger";
import {
  armVideoIntelligenceRegistrationCheck,
  clearVideoIntelligenceRegistrationCheck,
  markVideoIntelligenceQueueRegistered,
  reportVideoIntelligenceSweepFindings,
} from "./videoIntelligenceObservability";
import { db } from "../db";
import { workerJobs, type WorkerJob } from "../../drizzle/schema";
import {
  remotionRenderVideoWorkerInputSchema,
  type RemotionRenderVideoWorkerInput,
} from "../../shared/workerRuntime";
import { executeRemotionRenderVideoJob as defaultExecuteRemotionRenderVideoJob } from "../workers/hyperframesRenderWorker";
import {
  updateVideoProjectFields as defaultUpdateVideoProjectFields,
  type ProjectAuthScope,
} from "./videoProjectRepo";
import { createLibraryItem as defaultCreateLibraryItem } from "./libraryService";

export const VIDEO_INTELLIGENCE_JOBS_QUEUE = "video_intelligence_jobs";

/** Queue-wide worker concurrency (across ALL tenants/projects) — per-project
 *  exclusivity is the SEPARATE active-pointer mechanism below, so this can
 *  safely stay > 1. Mirrors `verticalDramaStoryJobs.ts`'s own constant. */
const VIDEO_INTELLIGENCE_JOBS_WORKER_CONCURRENCY = 3;

const JOB_RECORD_TTL_SECONDS = 2 * 60 * 60; // 2h
const ACTIVE_POINTER_TTL_SECONDS = 2 * 60 * 60; // 2h

/** How often the orphan sweep fires. Mirrors
 *  STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS (verticalDramaEpisodeStageJobs.ts). */
export const VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** A record whose `updatedAt` is older than this is considered orphaned
 *  (spec §12.5: 15 min here, 30 min for the VD equivalent). */
export const VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS = 15 * 60 * 1000;

/**
 * Extra grace period ADDED ON TOP of a `remotion_render_video` `worker_jobs`
 * row's own `timeoutSeconds` (set at enqueue time by
 * `computeRemotionRenderVideoTimeoutSeconds` in `workerSchedulerService.ts` —
 * a per-render budget of ~4x realtime + 120s, floored at 15 minutes) before
 * the Lane-A render orphan sweep (`sweepOrphanedLaneARenderJobs` below) will
 * touch a still-`queued`/`running` row.
 *
 * `timeoutSeconds` alone is NOT a safe signal on its own: unlike the VI-job
 * Redis sweep above, `executeRemotionRenderVideoJob`
 * (`hyperframesRenderWorker.ts`) does not internally enforce that budget —
 * ffmpeg/Remotion post-passes can legitimately run longer under load. This
 * grace period exists purely to keep the sweep from ever racing a slow-but-
 * alive render; there is no per-row heartbeat/lease column on `worker_jobs`
 * to distinguish "still executing in a live process" from "the process that
 * claimed it is gone" (unlike the Redis VI-job sweep's `updatedAt`), so a
 * deliberately generous fixed buffer is the only available signal. Per the
 * task's explicit guidance: falsely failing a still-running render is much
 * worse than a late recovery, so this errs long.
 */
export const LANE_A_RENDER_ORPHAN_GRACE_MS = 30 * 60 * 1000; // 30 min

/** Poison-pill cap: how many times one job may be recovered before it is
 *  marked `failed`. MANDATORY — without it a job that reliably kills its
 *  worker is re-enqueued forever. */
export const VIDEO_INTELLIGENCE_JOB_MAX_ORPHAN_RECOVERIES = 1;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type VideoIntelligenceJobKind =
  | "scene_plan"
  | "narration"
  | "quality_review"
  | "quality_repair"
  // Chains scene_plan (fill_empty) -> narration-script skill -> TTS +
  // caption cues into ONE job (see `routers/videoProjects.ts`'s
  // `executeAutoDraftStage`) — a second `enqueueVideoIntelligenceJob` call
  // for the same project dedupes onto whatever job is already active
  // regardless of kind, so this chain MUST happen inside one job rather
  // than as several separately-dispatched kinds.
  | "auto_draft"
  // Review-first content draft. Stores a candidate separately from the
  // canonical project document; it never runs TTS or advances production.
  | "content_draft"
  // Proposes 2-3 motion-template variants per scene into
  // `scene.motionCandidates` (see `routers/videoProjects.ts`'s
  // `executeMotionStage` / `services/videoProjectMotionDirector.ts`).
  // Never writes `scene.visual`/`scene.motion` itself — applying a
  // candidate is the separate, non-LLM `selectMotionCandidate` mutation.
  | "motion";

export type VideoIntelligenceJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface VideoIntelligenceJobProgress {
  stage: string;
  message?: string;
}

export interface VideoIntelligenceJobOwner {
  tenantId: string;
  userId: number;
  projectId: number;
}

export interface VideoIntelligenceJobPayload extends VideoIntelligenceJobOwner {
  kind: VideoIntelligenceJobKind;
  /** Kind-specific light input, validated by the router BEFORE enqueueing. */
  input: Record<string, unknown>;
}

export interface VideoIntelligenceJobRecord extends VideoIntelligenceJobPayload {
  jobId: string;
  status: VideoIntelligenceJobStatus;
  progress: VideoIntelligenceJobProgress | null;
  /** Present only once `status === "succeeded"`. */
  result: unknown;
  /** Present only once `status === "failed"`. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
  /** How many times the orphan sweep has recovered this job. OPTIONAL on
   *  purpose: records already in Redis when this deploys were written
   *  without it, and `undefined` must read as 0. */
  orphanRecoveries?: number;
}

/** Generic executor signature — dispatches a job payload to kind-specific
 *  domain logic (owned by `routers/videoProjects.ts`). `onProgress` is
 *  fire-and-forget (never awaited by the executor). */
export type VideoIntelligenceJobExecutor = (
  payload: VideoIntelligenceJobPayload,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
) => Promise<unknown>;

/* -------------------------------------------------------------------------- */
/* Redis-backed record store (dependency-injectable for tests)               */
/* -------------------------------------------------------------------------- */

export interface VideoIntelligenceJobRedisAdapter {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  /** NEW — one SCAN page: `[nextCursor, keys]`. Optional so existing test
   *  doubles keep compiling; the production adapter ALWAYS provides it.
   *  When absent the sweep logs once and no-ops rather than throwing. */
  scan?: (cursor: string, match: string, count: number) => Promise<[string, string[]]>;
}

export interface VideoIntelligenceJobStoreDependencies {
  redis: VideoIntelligenceJobRedisAdapter;
  now: () => number;
}

function defaultRedisAdapter(): VideoIntelligenceJobRedisAdapter {
  const client = getRedisClient();
  return {
    get: (key: string) => client.get(key),
    set: (key: string, value: string, mode: "EX", seconds: number) => client.set(key, value, mode, seconds),
    del: (key: string) => client.del(key),
    scan: (cursor: string, match: string, count: number) =>
      client.scan(cursor, "MATCH", match, "COUNT", count),
  };
}

function resolveDeps(
  dependencies?: Partial<VideoIntelligenceJobStoreDependencies>,
): VideoIntelligenceJobStoreDependencies {
  return {
    redis: dependencies?.redis ?? defaultRedisAdapter(),
    now: dependencies?.now ?? Date.now,
  };
}

function jobRecordKey(jobId: string): string {
  return `vi:job:${jobId}`;
}

function activePointerKey(tenantId: string, projectId: number): string {
  return `vi:job:active:${tenantId}:${projectId}`;
}

async function readRecord(
  jobId: string,
  deps: VideoIntelligenceJobStoreDependencies,
): Promise<VideoIntelligenceJobRecord | null> {
  const raw = await deps.redis.get(jobRecordKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VideoIntelligenceJobRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VideoIntelligenceJobRecord,
  deps: VideoIntelligenceJobStoreDependencies,
): Promise<void> {
  await deps.redis.set(jobRecordKey(record.jobId), JSON.stringify(record), "EX", JOB_RECORD_TTL_SECONDS);
}

/* -------------------------------------------------------------------------- */
/* Enqueue (submit) — dedupe-aware                                           */
/* -------------------------------------------------------------------------- */

export interface VideoIntelligenceJobEnqueueDependencies
  extends Partial<VideoIntelligenceJobStoreDependencies> {
  /** Overridable for tests — production default enqueues onto the real BullMQ queue. */
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
}

export async function enqueueVideoIntelligenceJob(
  payload: VideoIntelligenceJobPayload,
  dependencies?: VideoIntelligenceJobEnqueueDependencies,
): Promise<{ jobId: string; deduped: boolean }> {
  const deps = resolveDeps(dependencies);
  const pointerKey = activePointerKey(payload.tenantId, payload.projectId);

  const existingJobId = await deps.redis.get(pointerKey);
  if (existingJobId) {
    const existingRecord = await readRecord(existingJobId, deps);
    if (existingRecord && (existingRecord.status === "queued" || existingRecord.status === "running")) {
      return { jobId: existingJobId, deduped: true };
    }
    await deps.redis.del(pointerKey);
  }

  const jobId = randomUUID();
  const nowIso = new Date(deps.now()).toISOString();
  const record: VideoIntelligenceJobRecord = {
    jobId,
    kind: payload.kind,
    projectId: payload.projectId,
    tenantId: payload.tenantId,
    userId: payload.userId,
    input: payload.input,
    status: "queued",
    progress: null,
    result: null,
    error: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await writeRecord(record, deps);
  await deps.redis.set(pointerKey, jobId, "EX", ACTIVE_POINTER_TTL_SECONDS);

  const enqueueBullmqJob = dependencies?.enqueueBullmqJob ?? defaultEnqueueBullmqJob;
  try {
    await enqueueBullmqJob(jobId);
  } catch (error) {
    // FAIL-FAST (section-01 hardening, mirrors `verticalDramaEpisodeStageJobs.ts`'s
    // own enqueue docblock): unlike `verticalDramaStoryJobs.ts`'s self-contained
    // Redis-JSON record — where a later worker can still pick up a job that was
    // merely never enqueued — this record has NO job behind it at all once
    // `queue.add` throws, so "leave it queued" really means "orphan it forever"
    // for the record's full 2h TTL and blocks the project's active pointer for
    // just as long. Instead the record is marked `failed` immediately (before
    // clearing the active pointer, so a concurrent `getActiveGenerationJob`
    // never sees a pointer to a still-`queued` record), the pointer is cleared
    // (guarded so it only clears a pointer still pointing at THIS jobId — same
    // guard the worker's own `finally` uses), and the caller gets a real
    // terminal error instead of a `{ jobId }` for a job that will never run.
    debugError("videoIntelligenceJobs", `Failed to enqueue BullMQ job for video intelligence job ${jobId}`, error);

    const message = error instanceof Error ? error.message : String(error);
    try {
      await writeRecord(
        {
          ...record,
          status: "failed",
          error: `VI_QUEUE_UNAVAILABLE: ${message}`,
          updatedAt: new Date(deps.now()).toISOString(),
        },
        deps,
      );
    } catch (writeError) {
      debugError(
        "videoIntelligenceJobs",
        `Failed to mark video intelligence job ${jobId} failed after its enqueue failed`,
        writeError,
      );
    }

    try {
      const currentPointer = await deps.redis.get(pointerKey);
      if (currentPointer === jobId) {
        await deps.redis.del(pointerKey);
      }
    } catch (pointerError) {
      debugError(
        "videoIntelligenceJobs",
        `Failed to clear the active pointer for video intelligence job ${jobId} after its enqueue failed`,
        pointerError,
      );
    }

    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `VI_QUEUE_UNAVAILABLE: ${message}`,
    });
  }

  return { jobId, deduped: false };
}

/* -------------------------------------------------------------------------- */
/* Status queries (spec §15.3)                                               */
/* -------------------------------------------------------------------------- */

/** Owner-scoped status read — returns `null` (never throws) for a missing
 *  job OR one belonging to a different tenant/user/project. */
export async function getGenerationJobStatus(
  jobId: string,
  owner: { tenantId: string; userId: number; projectId: number },
  dependencies?: Partial<VideoIntelligenceJobStoreDependencies>,
): Promise<VideoIntelligenceJobRecord | null> {
  const deps = resolveDeps(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record) return null;
  if (
    record.tenantId !== owner.tenantId ||
    record.userId !== owner.userId ||
    record.projectId !== owner.projectId
  ) {
    return null;
  }
  return record;
}

/** The currently-active (queued/running) job for a project, or `null`. */
export async function getActiveGenerationJob(
  owner: { tenantId: string; userId: number; projectId: number },
  dependencies?: Partial<VideoIntelligenceJobStoreDependencies>,
): Promise<VideoIntelligenceJobRecord | null> {
  const deps = resolveDeps(dependencies);
  const pointerKey = activePointerKey(owner.tenantId, owner.projectId);
  const jobId = await deps.redis.get(pointerKey);
  if (!jobId) return null;

  const record = await readRecord(jobId, deps);
  if (!record || record.status === "succeeded" || record.status === "failed") {
    await deps.redis.del(pointerKey).catch(() => {});
    return null;
  }
  if (record.userId !== owner.userId) return null;
  return record;
}

/* -------------------------------------------------------------------------- */
/* Execution (worker body)                                                    */
/* -------------------------------------------------------------------------- */

export async function runVideoIntelligenceJob(
  jobId: string,
  executor: VideoIntelligenceJobExecutor,
  dependencies?: Partial<VideoIntelligenceJobStoreDependencies>,
): Promise<void> {
  const deps = resolveDeps(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record) {
    debugError("videoIntelligenceJobs", `runVideoIntelligenceJob: job ${jobId} not found — nothing to run`, null);
    return;
  }

  record.status = "running";
  record.updatedAt = new Date(deps.now()).toISOString();
  await writeRecord(record, deps);

  const onProgress = (progress: VideoIntelligenceJobProgress) => {
    writeRecord(
      { ...record, status: "running", progress, updatedAt: new Date(deps.now()).toISOString() },
      deps,
    ).catch(error => {
      debugError("videoIntelligenceJobs", `Failed to persist progress for job ${jobId}`, error);
    });
  };

  try {
    const result = await executor(
      {
        kind: record.kind,
        projectId: record.projectId,
        tenantId: record.tenantId,
        userId: record.userId,
        input: record.input,
      },
      onProgress,
    );
    await writeRecord(
      { ...record, status: "succeeded", result, error: null, updatedAt: new Date(deps.now()).toISOString() },
      deps,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeRecord(
      { ...record, status: "failed", error: message, updatedAt: new Date(deps.now()).toISOString() },
      deps,
    ).catch(() => {});
  } finally {
    const pointerKey = activePointerKey(record.tenantId, record.projectId);
    const currentPointer = await deps.redis.get(pointerKey).catch(() => null);
    if (currentPointer === jobId) {
      await deps.redis.del(pointerKey).catch(() => {});
    }
  }
}

/* -------------------------------------------------------------------------- */
/* BullMQ wiring (lazy init, mirrors verticalDramaStoryJobs.ts)              */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  if (!queue) {
    throw new Error(`${VIDEO_INTELLIGENCE_JOBS_QUEUE} queue is not initialized`);
  }
  // Custom job id (`jobId`, a `randomUUID()` value with no `:`, so it is
  // always a valid BullMQ custom id) — a prerequisite for a safe sweep
  // re-enqueue: BullMQ ignores an `add` for an existing custom id, so a
  // sweep re-enqueue of a merely-backlogged job can never execute the same
  // job twice. `attempts: 1`: the worker body never rethrows, so a retry
  // could only fire on a genuine crash, and blind redelivery of an LLM
  // stage costs real credits.
  await queue.add(
    "run",
    { jobId },
    { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true },
  );
}

/* -------------------------------------------------------------------------- */
/* Orphan sweep (heals jobs whose worker died mid-flight, spec §12.5)        */
/* -------------------------------------------------------------------------- */

function jobRecordFromKey(key: string): string | null {
  const prefix = "vi:job:";
  if (!key.startsWith(prefix) || key.startsWith(`${prefix}active:`)) return null;
  return key.slice(prefix.length);
}

/**
 * Heals jobs whose worker died mid-flight (spec §12.5). A record older than
 * `VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS` is recovered ONCE — reset to
 * `queued`, `orphanRecoveries` incremented, re-enqueued through the
 * injectable `enqueueBullmqJob` seam — and on a SECOND orphaning is marked
 * `failed` instead. The cap is mandatory: without it a job that reliably
 * kills its worker is re-enqueued forever.
 *
 * `requeued` tracks records recovered from `running` (a worker genuinely
 * died mid-flight); `stuckQueued` tracks records that were already `queued`
 * but stale (fail-fast enqueue means a fresh `queued` record always has a
 * job behind it, so a stale one means the BullMQ job itself vanished — the
 * exact stranding this section closes). Both buckets are re-enqueued
 * identically; they are reported separately only for observability.
 *
 * Never throws — every per-record failure is caught, logged, and the sweep
 * continues. One bad record must not disarm the sweep for every other
 * project. Exported so the unit suite can drive it with injected deps
 * directly, not the timer.
 */
export async function sweepOrphanedVideoIntelligenceJobs(
  dependencies?: Partial<VideoIntelligenceJobStoreDependencies> & {
    enqueueBullmqJob?: (jobId: string) => Promise<void>;
  },
): Promise<{ requeued: string[]; failed: string[]; stuckQueued: string[] }> {
  const deps = resolveDeps(dependencies);
  const enqueueBullmqJob = dependencies?.enqueueBullmqJob ?? defaultEnqueueBullmqJob;
  const result = { requeued: [] as string[], failed: [] as string[], stuckQueued: [] as string[] };

  if (typeof deps.redis.scan !== "function") {
    debugError(
      "videoIntelligenceJobs",
      "sweepOrphanedVideoIntelligenceJobs: adapter provides no scan method — skipping this tick",
      null,
    );
    return result;
  }

  const jobIds: string[] = [];
  let cursor = "0";
  let pages = 0;
  const MAX_PAGES = 20;
  do {
    const [nextCursor, keys] = await deps.redis.scan(cursor, "vi:job:*", 100);
    cursor = nextCursor;
    for (const key of keys) {
      const jobId = jobRecordFromKey(key);
      if (jobId) jobIds.push(jobId);
    }
    pages += 1;
  } while (cursor !== "0" && pages < MAX_PAGES);

  const nowMs = deps.now();

  for (const jobId of jobIds) {
    try {
      const record = await readRecord(jobId, deps);
      if (!record) continue;
      if (record.status !== "running" && record.status !== "queued") continue;

      const updatedAtMs = Date.parse(record.updatedAt);
      if (Number.isNaN(updatedAtMs) || nowMs - updatedAtMs <= VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS) {
        continue;
      }

      const wasQueued = record.status === "queued";
      const recoveries = record.orphanRecoveries ?? 0;

      if (recoveries < VIDEO_INTELLIGENCE_JOB_MAX_ORPHAN_RECOVERIES) {
        // Refresh `updatedAt` BEFORE the enqueue so a slow enqueue cannot
        // cause a re-sweep of this same record on the next tick. The active
        // pointer is left alone — it still correctly points at this job.
        await writeRecord(
          {
            ...record,
            status: "queued",
            progress: null,
            orphanRecoveries: recoveries + 1,
            updatedAt: new Date(nowMs).toISOString(),
          },
          deps,
        );
        await enqueueBullmqJob(jobId);
        if (wasQueued) {
          result.stuckQueued.push(jobId);
        } else {
          result.requeued.push(jobId);
        }
      } else {
        // Poison pill — clear the active pointer (guarded against this
        // jobId) and mark the record terminally failed.
        await writeRecord(
          {
            ...record,
            status: "failed",
            error: "VI_QUEUE_UNAVAILABLE: job orphaned past its recovery budget",
            updatedAt: new Date(nowMs).toISOString(),
          },
          deps,
        );
        const pointerKey = activePointerKey(record.tenantId, record.projectId);
        const currentPointer = await deps.redis.get(pointerKey).catch(() => null);
        if (currentPointer === jobId) {
          await deps.redis.del(pointerKey).catch(() => {});
        }
        result.failed.push(jobId);
      }
    } catch (error) {
      debugError(
        "videoIntelligenceJobs",
        `sweepOrphanedVideoIntelligenceJobs: failed to process job ${jobId} — continuing with the rest of the sweep`,
        error,
      );
    }
  }

  // Reports the sweep's own findings as a machine-readable audit signal
  // (section-08 §6.5) — inside the sweep's existing never-throw envelope;
  // `reportVideoIntelligenceSweepFindings` swallows its own errors, so this
  // can never disarm or fail the sweep itself.
  reportVideoIntelligenceSweepFindings(result);

  return result;
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Never throws — mirrors `runStaleRunSweepTick` (`verticalDramaEpisodeStageJobs.ts`). */
async function runOrphanSweepTick(sweep: () => Promise<unknown>): Promise<void> {
  try {
    await sweep();
  } catch (error) {
    debugError("videoIntelligenceJobs", "Orphan sweep tick failed", error);
  }
}

/** Arms the periodic sweep. Called BEFORE (and regardless of) BullMQ init
 *  succeeding — the sweep matters most precisely when BullMQ/Redis is
 *  broken. Fires once immediately so pre-restart orphans heal right away. */
function startOrphanSweep(sweep: () => Promise<unknown>): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void runOrphanSweepTick(sweep);
  }, VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS);
  void runOrphanSweepTick(sweep);
}

let laneARenderSweepTimer: ReturnType<typeof setInterval> | null = null;

/** Never throws — mirrors `runOrphanSweepTick` above. */
async function runLaneARenderSweepTick(sweep: () => Promise<unknown>): Promise<void> {
  try {
    await sweep();
  } catch (error) {
    debugError("videoIntelligenceJobs", "Lane-A render orphan sweep tick failed", error);
  }
}

/** Arms the Lane-A render orphan sweep on the SAME cadence and the SAME
 *  "fire once immediately, then on an interval" shape as `startOrphanSweep`
 *  above — a fresh web-process boot heals any renders stranded by the
 *  previous process's death right away instead of waiting a full interval. */
function startLaneARenderOrphanSweep(sweep: () => Promise<unknown>): void {
  if (laneARenderSweepTimer) return;
  laneARenderSweepTimer = setInterval(() => {
    void runLaneARenderSweepTick(sweep);
  }, VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS);
  void runLaneARenderSweepTick(sweep);
}

export interface VideoIntelligenceJobsQueueInitDependencies {
  /** Test-only override. Production calls init() with no arguments — the
   *  wiring guard counts `name()` literally. */
  sweep?: () => Promise<unknown>;
  /** Test-only override for the Lane-A render orphan sweep. */
  laneARenderSweep?: () => Promise<unknown>;
}

/**
 * Registers the BullMQ `Queue` + `Worker` for `video_intelligence_jobs`. Call
 * once from `_core/index.ts`'s startup sequence. The worker body lazily
 * `import()`s `routers/videoProjects.ts`'s executor — a dynamic,
 * execution-time import so this file and the router never form a static
 * circular import (the router already statically imports
 * `enqueueVideoIntelligenceJob`/`getGenerationJobStatus`/`getActiveGenerationJob`
 * from this file).
 *
 * The periodic orphan sweep (`sweepOrphanedVideoIntelligenceJobs`) is armed
 * FIRST, outside this BullMQ try/catch and before the `if (queue) return`
 * early exit, so a second init call still leaves the sweep armed and a
 * broken BullMQ/Redis connection never disarms the exact mechanism that
 * heals jobs stranded by that same brokenness.
 */
export async function initVideoIntelligenceJobsQueue(
  dependencies?: VideoIntelligenceJobsQueueInitDependencies,
): Promise<void> {
  const sweep = dependencies?.sweep ?? (() => sweepOrphanedVideoIntelligenceJobs());
  startOrphanSweep(sweep);

  // Lane-A render orphan sweep — armed alongside (never gated by) the
  // BullMQ/Redis init below, same reasoning as the VI-job sweep: a web
  // process restart mid-render is exactly the failure this heals, and it
  // must never depend on BullMQ/Redis having initialized successfully.
  const laneARenderSweep = dependencies?.laneARenderSweep ?? (() => sweepOrphanedLaneARenderJobs());
  startLaneARenderOrphanSweep(laneARenderSweep);

  // Armed BEFORE (and regardless of) BullMQ init succeeding, same reasoning
  // as the sweep above — the boot self-check matters most when BullMQ is
  // broken, since that is exactly when registration never happens
  // (section-08 §6.4).
  armVideoIntelligenceRegistrationCheck();

  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VIDEO_INTELLIGENCE_JOBS_QUEUE, { connection });
    worker = new Worker(
      VIDEO_INTELLIGENCE_JOBS_QUEUE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (bullJob: any) => {
        const { runVideoIntelligenceJobExecutor } = await import("../routers/videoProjects");
        await runVideoIntelligenceJob(bullJob.data.jobId, runVideoIntelligenceJobExecutor);
      },
      { connection, concurrency: VIDEO_INTELLIGENCE_JOBS_WORKER_CONCURRENCY },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker.on("failed", (bullJob: any, err: Error) => {
      console.error(`[${VIDEO_INTELLIGENCE_JOBS_QUEUE}] Job ${bullJob?.id} failed:`, err.message);
    });
    console.log(`[${VIDEO_INTELLIGENCE_JOBS_QUEUE}] queue + worker registered`);
    markVideoIntelligenceQueueRegistered({ workerConcurrency: VIDEO_INTELLIGENCE_JOBS_WORKER_CONCURRENCY });
  } catch (err) {
    console.warn(`[${VIDEO_INTELLIGENCE_JOBS_QUEUE}] BullMQ initialization skipped:`, (err as Error).message);
  }
}

export async function closeVideoIntelligenceJobsQueue(): Promise<void> {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  if (laneARenderSweepTimer) {
    clearInterval(laneARenderSweepTimer);
    laneARenderSweepTimer = null;
  }
  clearVideoIntelligenceRegistrationCheck();
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

/* -------------------------------------------------------------------------- */
/* Lane-A render dispatch (closes implementation-progress.md gap #2)         */
/* -------------------------------------------------------------------------- */

export interface DispatchLaneARemotionRenderJobDeps {
  execute?: typeof defaultExecuteRemotionRenderVideoJob;
  /** Injectable for tests — production default is the real owner-scoped
   *  `video_projects` patch primitive (`videoProjectRepo.ts`). */
  updateProjectFields?: typeof defaultUpdateVideoProjectFields;
  /** Injectable for tests — production default is the real
   *  `library_items` insert primitive (`libraryService.ts`). */
  createLibraryItem?: typeof defaultCreateLibraryItem;
}

/** Best-effort, owner-scoped `video_projects` status patch — NEVER throws.
 *  Every caller below already runs inside `dispatchLaneARemotionRenderJob`'s
 *  own top-level try/catch, but this project-lifecycle write is explicitly
 *  best-effort on its OWN: a failure here must never prevent the
 *  `worker_jobs` row's own terminal write (the render itself already
 *  happened — losing the project-status mirror is a lesser, observable
 *  failure, not a reason to leave the worker job stuck). */
async function patchProjectStatusBestEffort(
  updateProjectFields: typeof defaultUpdateVideoProjectFields,
  scope: ProjectAuthScope,
  projectId: number,
  patch: Parameters<typeof defaultUpdateVideoProjectFields>[2],
  context: string,
): Promise<void> {
  try {
    const row = await updateProjectFields(scope, projectId, patch);
    if (!row) {
      debugError(
        "videoIntelligenceJobs",
        `${context}: video_project ${projectId} not found for tenant ${scope.tenantId}/user ${scope.userId} — status patch skipped`,
        null,
      );
    }
  } catch (error) {
    debugError("videoIntelligenceJobs", `${context}: failed to patch video_project ${projectId}`, error);
  }
}

/**
 * Loads a just-queued `remotion_render_video` `worker_jobs` row, claims it
 * (queued -> running, guarded so a concurrent call can never double-claim),
 * runs it through the section-04 Lane-A executor
 * (`executeRemotionRenderVideoJob`), and writes the terminal
 * completed/failed status back. Called fire-and-forget by
 * `routers/videoProjects.ts`'s `queueRender` right after
 * `queueRemotionRenderVideoJob` returns `{ created: true }` — never called
 * for a deduped (`created: false`) hit, since that job is either already
 * dispatched or already terminal.
 *
 * ── Post-render `video_projects` lifecycle (CMD-2 backend gap closure) ────
 * The `worker_jobs` row's own status was always written back here — but
 * NOTHING ever mirrored that onto the owning `video_projects` row, so the
 * project's `status` column stayed frozen at whatever pre-render stage it
 * was on, and a finished FINAL render never became a discoverable library
 * item. This closes that gap, scoped ONLY to `renderProfile.profile ===
 * "final"` (a preview render is a throwaway QA artifact, not a project
 * deliverable, so it must never move `video_projects.status` or touch
 * `resultLibraryItemId` — the spec's explicit "preview must not overwrite
 * the final result" constraint):
 *   - right after the `queued -> running` claim: `status: "rendering"`
 *   - on a successful `execute()`: insert a `library_items` row for the
 *     produced video (mirrors `hyperframesLibraryFinalizeService.ts`'s
 *     `finalizeHyperframesRenderToLibrary` precedent, `createLibraryItem`
 *     with an idempotent `sourceLink` keyed on this `workerJobId` so a
 *     hypothetical re-dispatch of the SAME job never double-inserts), then
 *     `status: "completed"` + `resultLibraryItemId` on the project
 *   - on a failed `execute()`: `status: "failed"`
 * All three project-status writes are best-effort (`patchProjectStatusBestEffort`)
 * — a failure to mirror status onto the project must never block or fail
 * the `worker_jobs` row's own terminal write, which is this function's
 * primary contract.
 *
 * Never throws — every failure path is captured onto the `worker_jobs` row's
 * `status: "failed"` / `failureReason` instead of rejecting the caller's
 * fire-and-forget promise.
 */
export async function dispatchLaneARemotionRenderJob(
  input: { tenantId: string; userId: number; workerJobId: string; runId?: string },
  deps: DispatchLaneARemotionRenderJobDeps = {},
): Promise<void> {
  const execute = deps.execute ?? defaultExecuteRemotionRenderVideoJob;
  const updateProjectFields = deps.updateProjectFields ?? defaultUpdateVideoProjectFields;
  const createLibraryItemFn = deps.createLibraryItem ?? defaultCreateLibraryItem;
  const scope: ProjectAuthScope = { tenantId: input.tenantId, userId: input.userId };

  try {
    const [row] = await db.select().from(workerJobs).where(eq(workerJobs.id, input.workerJobId)).limit(1);
    if (!row) {
      debugError(
        "videoIntelligenceJobs",
        `dispatchLaneARemotionRenderJob: worker job ${input.workerJobId} not found`,
        null,
      );
      return;
    }
    if (row.status !== "queued") {
      // Already claimed/running/terminal — never double-dispatch.
      return;
    }

    const parsed = remotionRenderVideoWorkerInputSchema.safeParse(row.inputJson);
    if (!parsed.success) {
      await db
        .update(workerJobs)
        .set({
          status: "failed",
          failureReason: `Invalid remotion_render_video payload: ${parsed.error.message}`,
          finishedAt: new Date(),
        })
        .where(eq(workerJobs.id, input.workerJobId));
      return;
    }
    const payload: RemotionRenderVideoWorkerInput = parsed.data;
    const isFinal = payload.renderProfile.profile === "final";
    const projectId = Number(payload.videoProjectId);
    const hasValidProjectId = Number.isFinite(projectId);

    const claimed = await db
      .update(workerJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(workerJobs.id, input.workerJobId), eq(workerJobs.status, "queued")))
      .returning({ id: workerJobs.id });
    if (claimed.length === 0) {
      // Lost the race to another dispatcher — defensive, should not happen
      // for a single in-process Lane A dispatch.
      return;
    }

    if (isFinal && hasValidProjectId) {
      await patchProjectStatusBestEffort(
        updateProjectFields,
        scope,
        projectId,
        { status: "rendering" },
        `dispatchLaneARemotionRenderJob(${input.workerJobId}): rendering`,
      );
    }

    try {
      const result = await execute({
        tenantId: input.tenantId,
        runId: input.runId ?? input.workerJobId,
        renderJobId: input.workerJobId,
        payload,
      });
      await db
        .update(workerJobs)
        .set({
          status: "completed",
          outputJson: result as Record<string, unknown>,
          finishedAt: new Date(),
        })
        .where(eq(workerJobs.id, input.workerJobId));

      if (isFinal && hasValidProjectId) {
        let resultLibraryItemId: number | null = null;
        try {
          const outputUrl =
            typeof (result as Record<string, unknown> | null)?.outputUrl === "string"
              ? ((result as Record<string, unknown>).outputUrl as string)
              : null;
          const libraryResult = await createLibraryItemFn(
            {
              itemType: "video",
              source: "video_intelligence_render",
              title: `Video Intelligence render — project ${projectId}`,
              description: "Video Intelligence Platform final render",
              status: "ready",
              visibility: "private",
              sourceUrl: outputUrl,
              metadata: {
                projectId,
                workerJobId: input.workerJobId,
                traceId: payload.traceId,
                projectRevision: payload.projectRevision,
              },
              sourceLink: {
                linkType: "video_intelligence_render",
                linkId: input.workerJobId,
                providerTaskId: input.workerJobId,
              },
            },
            { userId: input.userId, tenantId: input.tenantId },
          );
          const libraryItemId = (libraryResult.item as { id?: unknown } | undefined)?.id;
          resultLibraryItemId = typeof libraryItemId === "number" ? libraryItemId : null;
        } catch (error) {
          debugError(
            "videoIntelligenceJobs",
            `dispatchLaneARemotionRenderJob(${input.workerJobId}): failed to create library item for project ${projectId}`,
            error,
          );
        }

        await patchProjectStatusBestEffort(
          updateProjectFields,
          scope,
          projectId,
          resultLibraryItemId != null
            ? { status: "completed", resultLibraryItemId }
            : { status: "completed" },
          `dispatchLaneARemotionRenderJob(${input.workerJobId}): completed`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(workerJobs)
        .set({ status: "failed", failureReason: message, finishedAt: new Date() })
        .where(eq(workerJobs.id, input.workerJobId));

      if (isFinal && hasValidProjectId) {
        await patchProjectStatusBestEffort(
          updateProjectFields,
          scope,
          projectId,
          { status: "failed" },
          `dispatchLaneARemotionRenderJob(${input.workerJobId}): failed`,
        );
      }
    }
  } catch (error) {
    debugError(
      "videoIntelligenceJobs",
      `dispatchLaneARemotionRenderJob: unexpected error for worker job ${input.workerJobId}`,
      error,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Lane-A render orphan sweep (heals a `worker_jobs` row stranded by a web    */
/* process restart mid-render, see `LANE_A_RENDER_ORPHAN_GRACE_MS` above)     */
/* -------------------------------------------------------------------------- */

export interface SweepOrphanedLaneARenderJobsDependencies {
  now?: () => number;
  /** Injectable for tests — production default is the real owner-scoped
   *  `video_projects` patch primitive, same as `dispatchLaneARemotionRenderJob`. */
  updateProjectFields?: typeof defaultUpdateVideoProjectFields;
}

/**
 * Heals `remotion_render_video` `worker_jobs` rows stranded by a web-process
 * restart mid-render (`dispatchLaneARemotionRenderJob` runs the render
 * in-process, fire-and-forget — if the process dies between the
 * `queued -> running` claim and the terminal write, the row is stuck
 * `running` — or, more rarely, `queued` if the process died before even
 * claiming it — forever, and the owning `video_projects.status` stays
 * `rendering` with no way out).
 *
 * A row is swept once it is past `(startedAt ?? createdAt) + timeoutSeconds
 * + LANE_A_RENDER_ORPHAN_GRACE_MS` — the row's own per-render `timeoutSeconds`
 * budget (`computeRemotionRenderVideoTimeoutSeconds`,
 * `workerSchedulerService.ts`) plus a large fixed grace period, since this
 * lane has no heartbeat/lease column to positively distinguish "still
 * executing in a live process" from "the process that claimed it is gone"
 * (see `LANE_A_RENDER_ORPHAN_GRACE_MS`'s doc comment). The terminal write is
 * itself guarded by a `WHERE status IN ('queued','running')` so a row that
 * completes/fails between the read and the write is never overwritten —
 * mirrors the `queued -> running` claim guard in `dispatchLaneARemotionRenderJob`.
 *
 * Only `renderProfile.profile === "final"` rows mirror `video_projects.status
 * -> "failed"` (a stranded preview render is a throwaway QA artifact, same
 * "preview must never touch project status" rule `dispatchLaneARemotionRenderJob`
 * already follows) — best-effort via `patchProjectStatusBestEffort`, never
 * blocking the row's own terminal write.
 *
 * Never throws — every per-row failure is caught, logged, and the sweep
 * continues; a query-level failure (e.g. transient DB error) is caught and
 * simply skips this tick. Exported so the unit suite can drive it directly,
 * not the timer.
 */
export async function sweepOrphanedLaneARenderJobs(
  dependencies?: SweepOrphanedLaneARenderJobsDependencies,
): Promise<{ failed: string[] }> {
  const now = dependencies?.now ?? Date.now;
  const updateProjectFields = dependencies?.updateProjectFields ?? defaultUpdateVideoProjectFields;
  const result = { failed: [] as string[] };

  let rows: WorkerJob[];
  try {
    rows = await db
      .select()
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.jobType, "remotion_render_video"),
          or(eq(workerJobs.status, "queued"), eq(workerJobs.status, "running")),
        ),
      );
  } catch (error) {
    debugError(
      "videoIntelligenceJobs",
      "sweepOrphanedLaneARenderJobs: failed to load worker_jobs rows — skipping this tick",
      error,
    );
    return result;
  }

  const nowMs = now();

  for (const row of rows) {
    try {
      const baseline = row.startedAt ?? row.createdAt;
      const baselineMs = baseline instanceof Date ? baseline.getTime() : Date.parse(String(baseline));
      if (!Number.isFinite(baselineMs)) continue;

      const timeoutSeconds = typeof row.timeoutSeconds === "number" ? row.timeoutSeconds : 0;
      const strandedAtMs = baselineMs + timeoutSeconds * 1000 + LANE_A_RENDER_ORPHAN_GRACE_MS;
      if (nowMs < strandedAtMs) continue;

      const claimed = await db
        .update(workerJobs)
        .set({
          status: "failed",
          failureReason:
            "LANE_A_RENDER_ORPHANED: worker_jobs row exceeded its render timeout with no terminal write — likely a web-process restart mid-render",
          finishedAt: new Date(nowMs),
        })
        .where(
          and(
            eq(workerJobs.id, row.id),
            or(eq(workerJobs.status, "queued"), eq(workerJobs.status, "running")),
          ),
        )
        .returning({ id: workerJobs.id });
      if (claimed.length === 0) {
        // Completed/failed/re-claimed between the read and this write —
        // never overwrite a terminal write that already happened.
        continue;
      }
      result.failed.push(row.id);

      if (row.requestedByUserId == null) continue;
      const parsed = remotionRenderVideoWorkerInputSchema.safeParse(row.inputJson);
      if (!parsed.success) continue;
      const payload = parsed.data;
      if (payload.renderProfile.profile !== "final") continue;
      const projectId = Number(payload.videoProjectId);
      if (!Number.isFinite(projectId)) continue;

      await patchProjectStatusBestEffort(
        updateProjectFields,
        { tenantId: row.tenantId, userId: row.requestedByUserId },
        projectId,
        { status: "failed" },
        `sweepOrphanedLaneARenderJobs(${row.id}): failed`,
      );
    } catch (error) {
      debugError(
        "videoIntelligenceJobs",
        `sweepOrphanedLaneARenderJobs: failed to process worker_jobs row ${row.id} — continuing with the rest of the sweep`,
        error,
      );
    }
  }

  return result;
}

export type { WorkerJob };
