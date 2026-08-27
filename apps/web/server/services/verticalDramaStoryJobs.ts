/**
 * Vertical Drama Series — async story-LLM job queue (task #28).
 *
 * Converts the long-running story mutations (`generateStoryBibleDeep`,
 * `extendStoryDraftHorizon`, `critiqueSeasonDrafts`, `applySeasonCritique`)
 * from an inline synchronous `await` — previously covered only by raising
 * Node's `server.requestTimeout`/`headersTimeout` to ~620s as a stopgap
 * (`server/_core/index.ts`, 2026-07-08) — to a genuine
 * submit -> jobId -> poll flow. This file is the generic, kind-agnostic
 * queue/worker/status plumbing; `routers/verticalDramaSeries.ts` owns the
 * kind-specific domain logic (see `runVerticalDramaStoryJobExecutor` there).
 *
 * ── Pattern investigation (mirrored vs. rejected) ──────────────────────────
 *
 * MIRRORED: `server/services/jobAutomationService.ts`'s BullMQ wiring — lazy
 * `await import("bullmq")`, a `Queue` + `Worker` pair with best-effort init
 * that degrades to "job stays queued until a worker comes up" when
 * Redis/BullMQ isn't reachable, and an `init*Queue()`/`close*Queue()` pair
 * registered in `_core/index.ts`'s bootstrap/shutdown sequence. This is the
 * closest genuine Node BullMQ submit/execute precedent in this codebase.
 *
 * REJECTED — `presentation_export`/`presentation_import`: QueueHealth's
 * `MONITORED_QUEUES` names of the same spelling
 * (`services/queueHealthMonitor.ts`) are Celery/Python queue names read via
 * `redis.llen()`, not a Node BullMQ queue — presentation export is actually
 * dispatched to the Python backend over HTTP
 * (`services/presentationPlaybackExport.ts`'s `defaultEnqueueExportJob`,
 * `celery_task_id`). Not applicable to this pure-Node, pure-LLM job.
 *
 * REJECTED — `services/verticalDramaSeriesTrailerAssembly.ts`: the closest
 * SAME-DOMAIN precedent (submit -> background job -> poll, refresh-safe via
 * a persisted JSONB column) but its status/dedupe live ONLY in an in-process
 * `Map` (`jobs`) alongside a fire-and-forget `void runTrailerJob(...)` —
 * silently abandoned on a `smartspec-web.service` restart (this project's
 * own documented normal "deploy code changes" step —
 * `sudo systemctl restart smartspec-web.service`), with no mechanism for a
 * later poll to ever recover (the DB column is left at `status: "processing"`
 * forever). Real BullMQ (stalled-job detection + redelivery to the next
 * worker that comes up) is a meaningfully better fit here given how much
 * LLM/credit work a multi-chunk premium run can accumulate before a mid-run
 * restart.
 *
 * ── Persistence ─────────────────────────────────────────────────────────
 *
 * Job records (status/progress/result/error) are a small Redis-JSON blob per
 * `jobId` (`vd:story-job:<jobId>`, `JOB_RECORD_TTL_SECONDS` TTL) — NOT a new
 * DB table/column. This follows this task's own explicit fallback ("if they
 * persist in Redis job data only, do the same + rely on BullMQ retention")
 * since `drizzle/schema.ts` is outside this task's owned files. BullMQ is
 * purely the DISPATCH mechanism; this Redis record is the source of truth
 * `getVerticalDramaStoryJobStatus`/`getActiveVerticalDramaStoryJob` read.
 *
 * ── Per-series exclusivity ("concurrency 1 per series") ────────────────────
 *
 * Enforced via a SEPARATE Redis pointer key
 * (`vd:story-job:active:<tenantId>:<seriesId>`) — NOT via BullMQ `Worker`
 * concurrency (which is queue-wide, across every tenant/series; pinning that
 * to 1 would serialize the whole platform's story jobs behind one another,
 * which is wrong). `enqueueVerticalDramaStoryJob` checks this pointer first
 * and returns the existing `jobId` (deduped) instead of double-submitting —
 * this also means a "critique" job and an "apply_critique" job for the SAME
 * series correctly block each other (the pointer is per-series, not
 * per-kind — exactly one story job of ANY kind may be active per series).
 * The worker clears the pointer in a `finally` on every terminal outcome
 * (guarded so it only clears a pointer that still points at ITS OWN jobId).
 */

import { randomUUID } from "crypto";
import { getRedisClient } from "./redis";
import { debugError } from "../_core/logger";
import { classifyCreditFailure } from "./creditFailurePolicy";
import {
  formatAffectedUsersForText,
  resolveAffectedUsers,
} from "./feedbackAffectedUsers";
import type { DrizzleDB } from "../db";
import {
  finalizeStoryGeneration,
  StoryGenerationFenceLostError,
  transitionStoryGenerationRun,
} from "./verticalDramaStoryGenerationRuntime";
import {
  claimStoryGenerationLease,
  getStoryGenerationRun,
  updateStoryGenerationCheckpoint,
} from "./verticalDramaStoryGenerationRepository";
import {
  mergeStoryPlanFieldsIntoCandidate,
  validateStoryGenerationOutput,
} from "./verticalDramaStoryGenerationValidation";
import type { StoryGenerationRunContract } from "./verticalDramaStoryGenerationContracts";
import { visualSourceSnapshotSchema } from "@shared/verticalDramaSeries/visualSource";
import {
  captureSeriesVisualSourceSnapshot,
  validateSnapshotForRun,
} from "./verticalDramaVisualSourceSnapshotService";


export const VERTICAL_DRAMA_STORY_JOBS_QUEUE = "vertical_drama_story_jobs";

/** Queue-wide worker concurrency (across ALL tenants/series) — per-series
 *  exclusivity is a SEPARATE mechanism (the active-pointer dedupe above), so
 *  this can safely stay > 1 without breaking "concurrency 1 per series".
 *  Mirrors `jobAutomationService.ts`'s own `concurrency: 3`. */
const VERTICAL_DRAMA_STORY_JOBS_WORKER_CONCURRENCY = 3;

/** Bounds how long a finished/queued job record survives in Redis — long
 *  enough to cover a realistic "client polls, then reloads and resumes"
 *  window, short enough to bound Redis memory for a large premium run's
 *  `result` payload (which can carry a full season's shot drafts). Raised
 *  from 2h -> 6h (resilient resume, added 2026-07-14,
 *  `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — a
 *  multi-hour deep-draft run now checkpoints per chunk (see `checkpoint` on
 *  `VerticalDramaStoryJobRecord`) and refreshes this TTL on every write (the
 *  heartbeat below), so the floor only matters for a run that stops making
 *  progress entirely. */
const JOB_RECORD_TTL_SECONDS = 6 * 60 * 60; // 6h
/** Safety-net TTL on the per-series active-job pointer — self-heals a
 *  crashed/killed worker's stuck pointer (which would otherwise deadlock the
 *  series' story-job slot forever) instead of requiring manual recovery.
 *  Raised 2h -> 6h alongside `JOB_RECORD_TTL_SECONDS` above; refreshed on
 *  every progress/checkpoint/status write (see `refreshActivePointerTtl`) so
 *  an actively-progressing job's pointer never expires mid-run. */
const ACTIVE_POINTER_TTL_SECONDS = 6 * 60 * 60; // 6h

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type VerticalDramaStoryJobKind =
  | "plan"
  | "deep_generate"
  | "extend"
  /**
   * "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) — replaces the old
   * `critique`/`apply_critique`/`quality_loop` season-quality flow with one
   * whole-script pass through the `drama-script-evaluate-improve` skill. See
   * `services/verticalDramaImproveScript.ts`'s `runImproveScriptJob` for the
   * full contract; this file only needs the kind label + job-record plumbing.
   */
  | "improve_script";

/** Structurally compatible with `verticalDramaStoryBible.ts`'s own
 *  `VdStoryDraftProgressEvent` (same field shape, deliberately NOT imported
 *  from there — this file stays domain-agnostic and never imports the
 *  story-bible service or the router, avoiding any circular-import risk).
 *
 *  Feature 132 §5 (F132B, ledgers-and-story-state) — `"ledger"` is the new
 *  `ledger_plan` step (runs the `vertical-drama-ledger-planner` skill via
 *  `verticalDramaLedgerPlanner.ts`), positioned after `"outline"` and before
 *  per-episode `"draft"`ing per spec §5.1. Gated behind the
 *  `verticalDramaQualityLedgers` tenant flag when actually wired into a
 *  job's phase sequence — flag-off runs never emit this phase. */
export type VerticalDramaStoryJobProgressPhase =
  | "outline"
  | "ledger"
  | "draft"
  | "review"
  | "fix"
  | "reading";

export interface VerticalDramaStoryJobProgress {
  phase: VerticalDramaStoryJobProgressPhase;
  /** Initial plan lifecycle stage; absent for legacy/deep jobs. */
  stage?:
    | "generating"
    | "candidate_saved"
    | "validating"
    | "saving"
    | "handoff";
  /**
   * 1-based index of the current call-round (chunk / revise-round) within
   * this job, when applicable. For `improve_script` jobs (2026-07-10
   * per-episode rewrite — see `services/verticalDramaImproveScript.ts`),
   * this means "round within the CURRENT episode" (see `episodeIndex`/
   * `episodeCount` below for which episode).
   */
  chunkIndex?: number;
  /** Total call-rounds expected for this job, when known upfront. */
  chunkCount?: number;
  /** Running count of individual LLM calls completed so far in this job. */
  callsDone?: number;
  /** Episode numbers this progress event's "fix" work targets (mainly meaningful for phase "fix"). */
  episodesDone?: number[];
  /** True when a failed multi-episode chunk is being retried one episode at a time. */
  retrying?: boolean;
  /** Episode numbers currently being retried after a chunk split. */
  retryEpisodeNumbers?: number[];
  /** Number of fully speakable episodes already persisted to the series. */
  episodesCompleted?: number;
  /** Total episodes requested by this deep-draft run. */
  episodesTotal?: number;
  /** Inclusive episode range currently being processed. */
  currentEpisodeStart?: number;
  currentEpisodeEnd?: number;
  /**
   * 1-based index of the episode currently being processed within this job
   * (added 2026-07-10 for `improve_script`'s per-episode generation loop —
   * `services/verticalDramaImproveScript.ts`'s `runImproveScriptEpisodePass`).
   * Absent for every job kind that doesn't process episodes one at a time.
   */
  episodeIndex?: number;
  /** Total drafted episodes this job is processing (added 2026-07-10, same `improve_script` per-episode loop as `episodeIndex`). */
  episodeCount?: number;
  /**
   * Auto quality loop (plan §C, added 2026-07-09) — 1-based current round
   * number within the loop's `maxRounds` budget. `0` is used for the
   * baseline critique/score-check BEFORE round 1 starts. Absent for every
   * other job kind (`deep_generate`/`extend`/`critique`/`apply_critique`),
   * which never touch these 4 fields.
   */
  round?: number;
  /** Auto quality loop — the loop's configured round budget (`startQualityLoop`'s `maxRounds` input), echoed on every progress event so the client never has to remember it separately. */
  maxRounds?: number;
  /** Auto quality loop — the most recently known `overallScore` (baseline or latest round's re-critique), so the client can render "รอบ 2/3 — คะแนน 6.4 → 7.1" without waiting for the job to finish. */
  lastScore?: number;
  /** Auto quality loop — every score seen so far this run, oldest first (index 0 = baseline). */
  scoreHistory?: number[];
  /** 1-based index of the current retry attempt for the CURRENT episode (added 2026-07-10, retry-until-pass). Absent for job kinds/phases that don't retry per-episode, and absent on progress events from a job started before this deploy. */
  attemptIndex?: number;
  /** Total retry attempts budgeted per episode (`VD_IMPROVE_SCRIPT_MAX_ATTEMPTS_PER_EPISODE`), echoed alongside `attemptIndex`. */
  attemptCount?: number;
}

export type VerticalDramaStoryJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface VerticalDramaStoryJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

export interface VerticalDramaStoryJobPayload extends VerticalDramaStoryJobOwner {
  /** Present only inside the worker executor; public enqueue payloads omit it. */
  jobId?: string;
  kind: VerticalDramaStoryJobKind;
  /** Kind-specific light input (validated by the router BEFORE enqueueing) — e.g. `{ mode, horizonEpisodes, idempotencyKey }`. */
  input: Record<string, unknown>;
}

/**
 * Resilient resume checkpoint (added 2026-07-14,
 * `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — a
 * kind-agnostic snapshot of a long-running job's own progress, written
 * incrementally (per chunk) so a mid-run crash/redelivery can resume instead
 * of restarting from scratch and re-charging credits. `draftedItems` is
 * `unknown[]` deliberately: this file stays domain-agnostic (never imports
 * `verticalDramaStoryBible.ts`'s `DeepDraftedEpisodeItem` — see this file's
 * own module doc comment on why); `routers/verticalDramaSeries.ts` casts it
 * back to the concrete shape it knows.
 */
export interface VerticalDramaStoryJobCheckpoint {
  draftedItems: unknown[];
  completedEpisodeNumbers: number[];
  chunkSizesDone: number[];
  creditsUsed: number;
  /** Initial story-plan recovery state; absent for deep/extend jobs. */
  planStage?: "candidate_ready" | "finalizing" | "completed";
  /** Schema-validated `generateStoryBible` result, kept for local resume. */
  planCandidate?: unknown;
  planCreditsUsed?: number;
  planModel?: string;
  updatedAt: string;
}

export interface VerticalDramaStoryJobRecord extends VerticalDramaStoryJobPayload {
  jobId: string;
  status: VerticalDramaStoryJobStatus;
  progress: VerticalDramaStoryJobProgress | null;
  /** Present only once `status === "succeeded"` — the OLD synchronous mutation's exact response shape. */
  result: unknown;
  /** Present only once `status === "failed"`. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Resilient resume — this job's own incremental progress, written via
   * `persistCheckpoint` (see `VerticalDramaStoryJobExecutor`/
   * `runVerticalDramaStoryJob`). Optional/absent for the job kind that never
   * checkpoints (`improve_script`) and for any job started before this
   * field existed — omitting it is BYTE-IDENTICAL to before this feature
   * existed (a fresh run with no checkpoint drafts everything, exactly like
   * today).
   */
  checkpoint?: VerticalDramaStoryJobCheckpoint;
  /**
   * Number of background recovery attempts already spent by this job. This
   * is persisted so a worker redelivery cannot reset the safety budget and
   * spin forever on a provider/schema response that makes no progress.
   */
  recoveryAttempts?: number;
}

/**
 * Resilient resume — handed to the executor alongside `onProgress` on every
 * (re)start of `runVerticalDramaStoryJob`, INCLUDING a same-jobId BullMQ
 * redelivery after a mid-run crash. `checkpoint` is the record's checkpoint
 * AS OF THIS RUN'S START (`null` for a fresh job or one with no checkpoint
 * yet) — kind-specific executors read it to seed either the initial plan
 * candidate or `generateStoryBibleDeep`'s `resumeDraftedItems`/
 * `alreadyDraftedEpisodeNumbers`.
 * `persistCheckpoint` is fire-and-forget (never awaited by the executor),
 * mirroring `onProgress`'s exact contract — a slow/failing checkpoint write
 * must never block or fail the real generation work.
 */
export interface VerticalDramaStoryJobResumeContext {
  checkpoint: VerticalDramaStoryJobCheckpoint | null;
  persistCheckpoint: (checkpoint: VerticalDramaStoryJobCheckpoint) => void;
  /** Awaitable variant for critical plan checkpoints that must survive before the next stage starts. */
  persistCheckpointAndWait?: (
    checkpoint: VerticalDramaStoryJobCheckpoint,
  ) => Promise<void>;
}

/** Generic executor signature — dispatches a job payload to kind-specific
 *  domain logic. `onProgress` is fire-and-forget (never awaited by the
 *  executor) so threading it into `verticalDramaStoryBible.ts` is a true
 *  zero-behavior-change addition there. `resume` (added 2026-07-14) is
 *  ALWAYS passed (never optional) — a job kind that doesn't checkpoint
 *  simply never calls `resume.persistCheckpoint` and ignores
 *  `resume.checkpoint` (always `null` for it, since it never writes one). */
export type VerticalDramaStoryJobExecutor = (
  payload: VerticalDramaStoryJobPayload,
  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
  resume: VerticalDramaStoryJobResumeContext,
) => Promise<unknown>;

/* -------------------------------------------------------------------------- */
/* Redis-backed record store (dependency-injectable for tests — mirrors      */
/* `presentationPlaybackExport.ts`'s own `resolveDependencies` DI convention) */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaStoryJobRedisAdapter {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}

export interface VerticalDramaStoryJobStoreDependencies {
  redis: VerticalDramaStoryJobRedisAdapter;
  now: () => number;
  /** Injectable only for tests; production waits without blocking a request. */
  sleep: (milliseconds: number) => Promise<void>;
}

function defaultRedisAdapter(): VerticalDramaStoryJobRedisAdapter {
  const client = getRedisClient();
  return {
    get: (key: string) => client.get(key),
    set: (key: string, value: string, mode: "EX", seconds: number) => client.set(key, value, mode, seconds),
    del: (key: string) => client.del(key),
  };
}

function resolveDeps(
  dependencies?: Partial<VerticalDramaStoryJobStoreDependencies>,
): VerticalDramaStoryJobStoreDependencies {
  return {
    redis: dependencies?.redis ?? defaultRedisAdapter(),
    now: dependencies?.now ?? Date.now,
    sleep:
      dependencies?.sleep ??
      ((milliseconds: number) =>
        new Promise(resolve => setTimeout(resolve, milliseconds))),
  };
}

function jobRecordKey(jobId: string): string {
  return `vd:story-job:${jobId}`;
}

function activePointerKey(tenantId: string, seriesId: number): string {
  return `vd:story-job:active:${tenantId}:${seriesId}`;
}

async function readRecord(
  jobId: string,
  deps: VerticalDramaStoryJobStoreDependencies,
): Promise<VerticalDramaStoryJobRecord | null> {
  const raw = await deps.redis.get(jobRecordKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerticalDramaStoryJobRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VerticalDramaStoryJobRecord,
  deps: VerticalDramaStoryJobStoreDependencies,
): Promise<void> {
  await deps.redis.set(jobRecordKey(record.jobId), JSON.stringify(record), "EX", JOB_RECORD_TTL_SECONDS);
  // Heartbeat TTL (added 2026-07-14, resilient resume) — refresh the
  // per-series active-pointer's TTL on every WRITE made while the job is
  // actively running (the initial "running" transition + every subsequent
  // `onProgress`/`persistCheckpoint` call both route through this same
  // function), so a long multi-hour run never has its pointer expire out
  // from under it. Deliberately re-`set`s (rather than a bare `expire`) so
  // no adapter-interface change is needed — `set` is already the only write
  // primitive `VerticalDramaStoryJobRedisAdapter` exposes. Skipped for
  // "queued" (nothing is progressing yet; the enqueue-time TTL already
  // covers the pre-dequeue window) and terminal writes (`runVerticalDramaStoryJob`'s
  // own `finally` block deletes the pointer immediately after anyway).
  // Defensively checks the pointer ALREADY points at THIS job before
  // refreshing it — mirrors `runVerticalDramaStoryJob`'s own `finally`-block
  // guard exactly, so a stale/superseded job's write can never re-claim (or
  // extend the TTL of) a pointer a NEWER job has since taken over.
  if (record.status === "running") {
    try {
      const pointerKey = activePointerKey(record.tenantId, record.seriesId);
      const currentPointer = await deps.redis.get(pointerKey);
      if (currentPointer === record.jobId) {
        await deps.redis.set(pointerKey, record.jobId, "EX", ACTIVE_POINTER_TTL_SECONDS);
      }
    } catch (error) {
      debugError(
        "verticalDramaStoryJobs",
        `Failed to refresh active-pointer TTL for story job ${record.jobId}`,
        error,
      );
    }
  }
}

/**
 * Per-job write serialization — `onProgress` (called synchronously, fire-and-
 * forget, from deep inside the story-bible service's LLM call chain) and the
 * terminal succeeded/failed write both go through this so a slow in-flight
 * progress write can never complete AFTER (and clobber) the terminal write.
 * Keyed by jobId; the tail promise is cleared once `runVerticalDramaStoryJob`
 * finishes so this never grows unbounded across a long-running process.
 */
const pendingWrites = new Map<string, Promise<unknown>>();

function enqueueWrite(jobId: string, fn: () => Promise<unknown>): Promise<unknown> {
  const prior = pendingWrites.get(jobId) ?? Promise.resolve();
  const next = prior.then(fn, fn);
  pendingWrites.set(
    jobId,
    next.catch(() => {}),
  );
  return next;
}

/**
 * Resilient resume — standalone, independently-testable checkpoint writer.
 * Reads the CURRENT persisted record, shallow-merges `patch` onto its
 * existing `checkpoint` (a field present in `patch` wins; a field absent
 * from `patch` falls back to whatever the record already had, `[]`/`0`
 * otherwise — supports both "send the full replacement every time"
 * callers, like `runVerticalDramaStoryJob`'s own `persistCheckpoint` below,
 * and a genuinely-partial patch), and writes the result back — through the
 * SAME per-job `enqueueWrite` serialization `onProgress`/the terminal
 * succeeded/failed write use, so a checkpoint write can never complete AFTER
 * (and clobber) a terminal write, and two checkpoint writes queued out of
 * call-order still apply strictly in the order they were CALLED. No-op
 * (never throws) when the record is missing/TTL'd out — mirrors this file's
 * established "best-effort, fire-and-forget-safe" convention for anything
 * called from deep inside the story-bible service's own call chain.
 */
export async function updateVerticalDramaStoryJobCheckpoint(
  jobId: string,
  patch: Partial<VerticalDramaStoryJobCheckpoint>,
  dependencies?: Partial<VerticalDramaStoryJobStoreDependencies>,
): Promise<void> {
  const deps = resolveDeps(dependencies);
  await enqueueWrite(jobId, async () => {
    const latest = await readRecord(jobId, deps);
    if (!latest) return;
    const priorCheckpoint = latest.checkpoint;
    const mergedCheckpoint: VerticalDramaStoryJobCheckpoint = {
      draftedItems: patch.draftedItems ?? priorCheckpoint?.draftedItems ?? [],
      completedEpisodeNumbers:
        patch.completedEpisodeNumbers ?? priorCheckpoint?.completedEpisodeNumbers ?? [],
      chunkSizesDone: patch.chunkSizesDone ?? priorCheckpoint?.chunkSizesDone ?? [],
      creditsUsed: patch.creditsUsed ?? priorCheckpoint?.creditsUsed ?? 0,
      ...(patch.planStage !== undefined || priorCheckpoint?.planStage !== undefined
        ? { planStage: patch.planStage ?? priorCheckpoint?.planStage }
        : {}),
      ...(patch.planCandidate !== undefined || priorCheckpoint?.planCandidate !== undefined
        ? { planCandidate: patch.planCandidate ?? priorCheckpoint?.planCandidate }
        : {}),
      ...(patch.planCreditsUsed !== undefined || priorCheckpoint?.planCreditsUsed !== undefined
        ? { planCreditsUsed: patch.planCreditsUsed ?? priorCheckpoint?.planCreditsUsed }
        : {}),
      ...(patch.planModel !== undefined || priorCheckpoint?.planModel !== undefined
        ? { planModel: patch.planModel ?? priorCheckpoint?.planModel }
        : {}),
      updatedAt: new Date(deps.now()).toISOString(),
    };
    await writeRecord(
      {
        ...latest,
        status: "running",
        checkpoint: mergedCheckpoint,
        updatedAt: mergedCheckpoint.updatedAt,
      },
      deps,
    );
  });
}

/**
 * Enqueue the next story stage while the current stage still owns the
 * per-series pointer. The normal enqueue path intentionally dedupes every
 * cross-kind submission; a server-owned plan -> deep handoff is the one
 * legitimate exception. It atomically releases only the current job's
 * pointer, then submits the next job through the same durable path.
 */
export async function enqueueVerticalDramaStoryJobHandoff(
  previousJobId: string,
  payload: VerticalDramaStoryJobPayload,
  dependencies?: VerticalDramaStoryJobEnqueueDependencies,
): Promise<{ jobId: string; deduped: boolean }> {
  const deps = resolveDeps(dependencies);
  const pointerKey = activePointerKey(payload.tenantId, payload.seriesId);
  const currentPointer = await deps.redis.get(pointerKey);
  if (currentPointer === previousJobId) {
    await deps.redis.del(pointerKey);
  }
  return enqueueVerticalDramaStoryJob(payload, dependencies);
}

/* -------------------------------------------------------------------------- */
/* Enqueue (submit) — dedupe-aware                                            */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaStoryJobEnqueueDependencies extends Partial<VerticalDramaStoryJobStoreDependencies> {
  /** Overridable for tests — production default enqueues onto the real BullMQ queue (see `initVerticalDramaStoryJobsQueue`). */
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
}

export async function enqueueVerticalDramaStoryJob(
  payload: VerticalDramaStoryJobPayload,
  dependencies?: VerticalDramaStoryJobEnqueueDependencies,
): Promise<{ jobId: string; deduped: boolean }> {
  const deps = resolveDeps(dependencies);
  const pointerKey = activePointerKey(payload.tenantId, payload.seriesId);

  const existingJobId = await deps.redis.get(pointerKey);
  if (existingJobId) {
    const existingRecord = await readRecord(existingJobId, deps);
    if (existingRecord && (existingRecord.status === "queued" || existingRecord.status === "running")) {
      // Double-spend guard (task #28 hard requirement): one story job per
      // series TOTAL, regardless of kind — a "critique" job in flight blocks
      // a new "apply_critique" (or another "critique") submit for the same
      // series, and vice versa.
      return { jobId: existingJobId, deduped: true };
    }
    // Stale pointer (worker crashed before clearing it, or the record TTL'd
    // out from under a live pointer) — self-heal rather than deadlock the
    // series' story-job slot forever.
    await deps.redis.del(pointerKey);
  }

  const jobId = randomUUID();
  const nowIso = new Date(deps.now()).toISOString();
  const record: VerticalDramaStoryJobRecord = {
    jobId,
    kind: payload.kind,
    seriesId: payload.seriesId,
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
    // Best-effort — mirrors `jobAutomationService.ts`'s own "queue
    // unavailable -> job stays queued until a worker comes up" degradation.
    // The record itself is already durably written, so this never turns a
    // transient Redis/BullMQ blip into a 500 for the caller; the tradeoff
    // (a job can get stuck at "queued" if the queue never recovers) is the
    // SAME accepted tradeoff `jobAutomationService.ts` already ships with.
    debugError("verticalDramaStoryJobs", `Failed to enqueue BullMQ job for story job ${jobId}`, error);
  }

  return { jobId, deduped: false };
}

/* -------------------------------------------------------------------------- */
/* Status queries                                                             */
/* -------------------------------------------------------------------------- */

/** Ownership-checked status read — returns `null` (never throws) for a
 *  missing job OR one that belongs to a different tenant/series, mirroring
 *  `verticalDramaSeries.ts`'s own "never disclose existence" convention; the
 *  router maps `null` to NOT_FOUND. */
export async function getVerticalDramaStoryJobStatus(
  jobId: string,
  owner: { tenantId: string; seriesId: number },
  dependencies?: Partial<VerticalDramaStoryJobStoreDependencies>,
): Promise<VerticalDramaStoryJobRecord | null> {
  const deps = resolveDeps(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record) return null;
  if (record.tenantId !== owner.tenantId || record.seriesId !== owner.seriesId) return null;
  return record;
}

/** Refresh-safe resume support: the currently-active (queued/running) job
 *  for a series, or `null` when none. Self-heals a pointer left dangling by
 *  a crashed worker (record missing or already terminal) instead of
 *  reporting a phantom "active" job forever. */
export async function getActiveVerticalDramaStoryJob(
  owner: { tenantId: string; seriesId: number },
  dependencies?: Partial<VerticalDramaStoryJobStoreDependencies>,
): Promise<VerticalDramaStoryJobRecord | null> {
  const deps = resolveDeps(dependencies);
  const pointerKey = activePointerKey(owner.tenantId, owner.seriesId);
  const jobId = await deps.redis.get(pointerKey);
  if (!jobId) return null;

  const record = await readRecord(jobId, deps);
  if (!record || record.status === "succeeded" || record.status === "failed") {
    await deps.redis.del(pointerKey).catch(() => {});
    return null;
  }
  return record;
}

/* -------------------------------------------------------------------------- */
/* Best-effort terminal-state notification (debt-item-6, 2026-07-08)         */
/* -------------------------------------------------------------------------- */

/** Thai job-kind label used in the completion/failure notification below. */
const STORY_JOB_KIND_LABEL_TH: Record<VerticalDramaStoryJobKind, string> = {
  plan: "วางแผนเนื้อเรื่องหลัก",
  deep_generate: "สร้างร่างละเอียดเนื้อเรื่อง",
  extend: "ขยายร่างเนื้อเรื่อง",
  improve_script: "ปรับปรุงบทละครให้มีความสมบูรณ์",
};

function storyJobActionUrl(record: VerticalDramaStoryJobRecord): string {
  return `/drama-series/${record.seriesId}`;
}

function storyJobRedisKey(jobId: string): string {
  return `vd:story-job:${jobId}`;
}

function sanitizeFeedbackText(value: string): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Generic auto-filed system feedback ticket (Phase F, added 2026-07-09) —
 * extracted from what used to be `submitFailedStoryJobFeedback`'s inline body
 * so BOTH a whole-job terminal failure (below) AND a partial in-job failure
 * (a job that still completes/succeeds overall but has a `systemFailures`-
 * shaped gap — e.g. `applySeasonCritique`'s "AI call failed" chunk rejections
 * or `generateStoryBibleDeep`'s `partial: true` stop) can file through the
 * SAME mechanism instead of two divergent code paths. `routers/
 * verticalDramaSeries.ts`'s partial-failure call sites import this directly.
 *
 * Every field here is sanitized/truncated identically to the ORIGINAL
 * `submitFailedStoryJobFeedback` body (title: sanitize+255, description:
 * sanitize+5000, stepsToReproduce: sanitize/no slice, expectedBehavior: NOT
 * sanitized — every caller passes a hardcoded Thai string, never raw
 * error/user content, actualBehavior: sanitize+2000) — callers must follow
 * that SAME convention (put dynamic/error content only in fields that get
 * sanitized here).
 *
 * `input.title` is dedupe-sensitive: `feedbackProcessor.ts`'s `findDuplicate`
 * collapses a NEW ticket into a comment on an existing OPEN one whenever the
 * first 50 (lowercased) chars of the title match — so callers MUST keep this
 * title fully deterministic per "issue class" (e.g. same series + same job
 * kind + same failure stage) and never fold volatile per-run details
 * (specific episode numbers, timestamps, raw error text) into it.
 */
export interface VerticalDramaSystemFeedbackInput {
  tenantId: string;
  userId: number;
  seriesId: number;
  /** `feedbackTickets.category` — also lets admins filter by issue source. */
  category: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  /** NOT sanitized — pass a static, hardcoded Thai sentence, never raw error/user text. */
  expectedBehavior: string;
  actualBehavior: string;
  contextJson: Record<string, unknown>;
}

async function insertAndProcessSystemFeedbackTicket(
  input: VerticalDramaSystemFeedbackInput,
  db: unknown,
): Promise<void> {
  const { feedbackTickets } = await import("../../drizzle/schema");
  const { processTicket } = await import("./virtualAdmin/feedbackProcessor");
  const [reporter] = await resolveAffectedUsers(
    db as DrizzleDB,
    [input.userId],
    input.tenantId,
    1,
  ).catch(() => []);
  const reporterLine = `Reporter: ${reporter ? formatAffectedUsersForText([reporter]) : `user #${input.userId}`}`;

  const [ticket] = await (db as {
    insert: (table: typeof feedbackTickets) => {
      values: (values: Record<string, unknown>) => {
        returning: (fields: { id: typeof feedbackTickets.id }) => Promise<Array<{ id: number }>>;
      };
    };
  })
    .insert(feedbackTickets)
    .values({
      tenantId: input.tenantId,
      submittedBy: input.userId,
      submittedByType: "system",
      ticketType: "bug",
      priority: "high",
      severity: "high",
      category: input.category,
      title: sanitizeFeedbackText(input.title).slice(0, 255),
      description: sanitizeFeedbackText(`${reporterLine}\n${input.description}`).slice(0, 5000),
      stepsToReproduce: sanitizeFeedbackText(input.stepsToReproduce),
      expectedBehavior: input.expectedBehavior,
      actualBehavior: sanitizeFeedbackText(input.actualBehavior).slice(0, 2000),
      contextJson: input.contextJson,
    })
    .returning({ id: feedbackTickets.id });

  if (!ticket) return;
  processTicket(ticket.id).catch((error) => {
    debugError(
      "verticalDramaStoryJobs",
      `Failed to process auto feedback ticket ${ticket.id}`,
      error,
    );
  });
}

/**
 * Best-effort public entry point — NEVER throws (mirrors every other
 * best-effort helper in this file), so a router call site never needs its
 * own guard around this call.
 */
export async function submitVerticalDramaSystemFeedback(
  input: VerticalDramaSystemFeedbackInput,
  db: unknown,
): Promise<void> {
  try {
    await insertAndProcessSystemFeedbackTicket(input, db);
  } catch (error) {
    debugError(
      "verticalDramaStoryJobs",
      "Failed to submit vertical drama system feedback ticket",
      error,
    );
  }
}

async function reportStoryJobFailure(record: VerticalDramaStoryJobRecord): Promise<void> {
  const actionUrl = storyJobActionUrl(record);
  const { reportSystemFailure } = await import("./systemAutoReportService");
  const creditFailure = classifyCreditFailure({
    errorMessage: record.error,
    path: actionUrl,
  });
  await reportSystemFailure({
    source: "vertical_drama_story_jobs",
    userId: record.userId,
    tenantId: record.tenantId,
    jobId: record.jobId,
    path: actionUrl,
    title: `Story job failed (${record.kind})`,
    errorMessage: record.error ?? "Unknown vertical drama story job failure",
    // Only attach the user-credit hint after the message has been identified
    // as a credit failure; otherwise an unrelated story-job error must remain
    // a normal system failure.
    creditContext: creditFailure.isCreditFailure
      ? { source: "user", modelKind: "llm" }
      : undefined,
    extra: { seriesId: record.seriesId, kind: record.kind },
  });
}

/**
 * Best-effort push notification on a story job's terminal state (debt-
 * item-6, 2026-07-08 backlog batch) — these jobs can run for minutes (a
 * multi-chunk premium run especially), and the user may well have navigated
 * away from the series page by the time it finishes. Mirrors
 * `routers/mediaJobs.ts`'s `notifyJobFailure` — the closest existing
 * precedent for "a background job's owner gets an in-app (+ Telegram, if
 * linked/enabled — see `notificationService.ts`'s own module doc comment)
 * notification via the existing `createNotification` channel": same dynamic-
 * import-db-and-service convention, and the ENTIRE body wrapped in its own
 * try/catch so a notification failure can never fail the job itself (the
 * terminal Redis record is already durably written by the time this runs) —
 * callers never need their own guard around this call. Content is Thai only,
 * matching every other Thai-content `createNotification` call site in this
 * codebase (notification content here is not currently bilingual/localized
 * per-user).
 */
async function notifyStoryJobTerminal(record: VerticalDramaStoryJobRecord): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const { createNotification } = await import("./notificationService");
    const db = await getDb();
    const kindLabel = STORY_JOB_KIND_LABEL_TH[record.kind];
    const succeeded = record.status === "succeeded";
    const creditFailure = !succeeded
      ? classifyCreditFailure({
          errorMessage: record.error,
          path: storyJobActionUrl(record),
        })
      : null;
    try {
      if (!creditFailure?.isCreditFailure) {
        await createNotification({
          db,
          userId: record.userId,
          type: succeeded ? "system" : "alert",
          title: succeeded ? `${kindLabel} เสร็จแล้ว` : `${kindLabel} ไม่สำเร็จ`,
          content: succeeded
            ? `งาน "${kindLabel}" เสร็จเรียบร้อยแล้ว กลับไปดูผลลัพธ์ได้เลย`
            : `งาน "${kindLabel}" ล้มเหลว: ${(record.error ?? "").slice(0, 200)}`,
          priority: succeeded ? "normal" : "high",
          relatedResourceId: record.jobId,
          actionUrl: storyJobActionUrl(record),
          actionLabel: "เปิดซีรีย์",
          groupKey: `vd_story_job:${record.jobId}`,
          metadata: {
            source: "vertical_drama_story_jobs",
            relatedItems: { seriesId: String(record.seriesId), kind: record.kind },
            ...(succeeded
              ? {}
              : { errorDetails: { errorMessage: (record.error ?? "").slice(0, 500) } }),
          },
        });
      }
    } catch (error) {
      debugError(
        "verticalDramaStoryJobs",
        `Failed to send completion notification for story job ${record.jobId}`,
        error,
      );
    }
    if (!succeeded) {
      try {
        await reportStoryJobFailure(record);
      } catch (error) {
        debugError(
          "verticalDramaStoryJobs",
          `Failed to submit auto feedback for story job ${record.jobId}`,
          error,
        );
      }
    }
  } catch (error) {
    debugError(
      "verticalDramaStoryJobs",
      `Failed to send completion notification for story job ${record.jobId}`,
      error,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Execution (worker body) — standalone + independently testable, exactly    */
/* like `jobAutomationService.ts`'s own `executeJob(jobId)`.                 */
/* -------------------------------------------------------------------------- */

/**
 * A partial deep draft is a recoverable intermediate state, not a terminal
 * result. The kind guard is intentional: `improve_script` has its own
 * per-episode partial-result contract and does not expose the deep-draft
 * checkpoint/resume semantics used here.
 */
function isCheckpointResumableStoryJobKind(
  kind: VerticalDramaStoryJobKind,
): boolean {
  return kind === "deep_generate" || kind === "extend";
}

function isPartialStoryJobResult(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === "object" &&
      (result as { partial?: unknown }).partial === true,
  );
}

/**
 * Executor errors are normally already retried by the LLM service. These
 * patterns cover failures that can still escape that layer, especially the
 * provider's HTTP-400 in-flight credit-capacity response. Permanent credit
 * exhaustion is deliberately excluded: waiting cannot make a user's balance
 * sufficient and should remain a clear terminal failure.
 */
function isRetryableStoryJobError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient[_ ]?(quota|credits?)|not enough credits|payment required/i.test(message)) {
    return false;
  }
  return [
    "would exceed your available credits",
    "in-flight requests",
    "rate limit",
    "too many requests",
    "temporarily unavailable",
    "no healthy provider",
    "all providers failed",
    "timed out",
    "timeout",
    "etimedout",
    "econnreset",
    "econnrefused",
    "fetch failed",
    "network error",
    "502",
    "503",
    "504",
  ].some(pattern => message.toLowerCase().includes(pattern));
}

/**
 * A validated initial-plan candidate is safe to replay through local
 * finalization. Keep retrying bounded, non-credit failures after that
 * checkpoint so a transient DB/queue/runtime blip does not turn into a
 * terminal job that visibly lost the whole story. Durable validation and
 * credit failures remain terminal by design.
 */
function isRetryablePlanCheckpointError(
  kind: VerticalDramaStoryJobKind,
  checkpoint: VerticalDramaStoryJobCheckpoint | null,
  error: unknown,
): boolean {
  if (kind !== "plan" || checkpoint?.planCandidate === undefined) return false;
  const message = error instanceof Error ? error.message : String(error);
  return !/insufficient[_ ]?(quota|credits?)|not enough credits|payment required|STORY_PLAN_FINAL_GATE_FAILED|story plan did not pass|schema validation|forbidden|not found/i.test(message);
}

const STORY_JOB_MAX_RECOVERY_ATTEMPTS = 8;
const STORY_JOB_RECOVERY_BACKOFF_MS = [
  1_000,
  5_000,
  15_000,
  30_000,
  60_000,
  120_000,
  300_000,
  300_000,
] as const;

function storyJobRecoveryDelay(attempt: number): number {
  return STORY_JOB_RECOVERY_BACKOFF_MS[
    Math.min(attempt, STORY_JOB_RECOVERY_BACKOFF_MS.length - 1)
  ];
}

export async function runVerticalDramaStoryJob(
  jobId: string,
  executor: VerticalDramaStoryJobExecutor,
  dependencies?: Partial<VerticalDramaStoryJobStoreDependencies>,
): Promise<void> {
  const deps = resolveDeps(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record) {
    debugError("verticalDramaStoryJobs", `runVerticalDramaStoryJob: job ${jobId} not found — nothing to run`, null);
    return;
  }

  const assuranceRunId = typeof record.input.runId === "string"
    ? record.input.runId
    : null;
  let assuranceFenceToken: number | undefined;
  const syncAssuranceState = (operation: Promise<unknown>) => {
    operation.catch((error) => {
      debugError(
        "verticalDramaStoryJobs",
        `Failed to sync durable story-generation run for job ${jobId}`,
        error,
      );
    });
  };

  record.status = "running";
  record.updatedAt = new Date(deps.now()).toISOString();
  await enqueueWrite(jobId, () => writeRecord(record, deps));

  // Resilient resume (added 2026-07-14) — `record.checkpoint` as of THIS
  // RUN'S START is what gets handed to the executor as `resume.checkpoint`
  // (so a same-jobId BullMQ redelivery after a mid-run crash resumes from
  // where the PRIOR attempt left off). `currentCheckpoint` then tracks the
  // latest value `persistCheckpoint` below has queued a write for — every
  // OTHER write this function makes (`onProgress`, and both terminal
  // succeeded/failed writes) includes it too, so a later write (which closes
  // over the stale `record` object read above for every OTHER field) can
  // never regress the checkpoint back to its start-of-run value. Safe
  // without re-reading Redis because `onProgress`/`persistCheckpoint` are
  // only ever called synchronously, one at a time, from within this single
  // executor invocation's own call stack (never concurrently) — so by the
  // time any queued write's closure actually runs, `currentCheckpoint`
  // already reflects every `persistCheckpoint` call made before it.
  let currentCheckpoint: VerticalDramaStoryJobCheckpoint | null = record.checkpoint ?? null;
  let recoveryAttempts = Math.max(0, record.recoveryAttempts ?? 0);

  const onProgress = (progress: VerticalDramaStoryJobProgress) => {
    enqueueWrite(jobId, () =>
      writeRecord(
        {
          ...record,
          status: "running",
          progress,
          checkpoint: currentCheckpoint ?? undefined,
          updatedAt: new Date(deps.now()).toISOString(),
        },
        deps,
      ),
    ).catch((error) => {
      debugError("verticalDramaStoryJobs", `Failed to persist progress for story job ${jobId}`, error);
    });
  };

  // Resilient resume — fire-and-forget, mirrors `onProgress`'s exact
  // contract. The caller (`routers/verticalDramaSeries.ts`) always sends the
  // FULL replacement checkpoint (computed from its own running accumulator),
  // so `updateVerticalDramaStoryJobCheckpoint`'s merge is effectively a
  // replace — kept as a merge there for standalone-caller safety (see its
  // own doc comment). `currentCheckpoint` is updated SYNCHRONOUSLY here
  // (before the actual Redis write is even enqueued) so every later write in
  // this run sees at least this value — see the doc comment above.
  const persistCheckpoint = (checkpoint: VerticalDramaStoryJobCheckpoint) => {
    currentCheckpoint = checkpoint;
    return updateVerticalDramaStoryJobCheckpoint(jobId, checkpoint, deps).catch((error) => {
      debugError("verticalDramaStoryJobs", `Failed to persist checkpoint for story job ${jobId}`, error);
    });
  };

  const persistCheckpointAndWait = async (
    checkpoint: VerticalDramaStoryJobCheckpoint,
  ): Promise<void> => {
    currentCheckpoint = checkpoint;
    await updateVerticalDramaStoryJobCheckpoint(jobId, checkpoint, deps);
  };

  try {
    if (assuranceRunId) {
      const lease = await claimStoryGenerationLease({
        tenantId: record.tenantId,
        runId: assuranceRunId,
        workerId: `story-job:${jobId}`,
      });
      if (!lease) throw new Error("STORY_GENERATION_LEASE_NOT_ACQUIRED");
      assuranceFenceToken = lease.fenceToken;
      await transitionStoryGenerationRun({
        tenantId: record.tenantId,
        runId: assuranceRunId,
        to: "running",
        stage: "generation",
        expectedFenceToken: assuranceFenceToken,
      });
    }
    let result: unknown;
    while (true) {
      try {
        const executorInput =
          recoveryAttempts > 0
            ? {
                ...record.input,
                // Private worker metadata. Kind-specific executors use this
                // only to make retry credit/idempotency keys unique; it is
                // never accepted from the public mutation input.
                __storyJobRecoveryAttempt: recoveryAttempts,
              }
            : record.input;
        result = await executor(
          {
            kind: record.kind,
            jobId,
            seriesId: record.seriesId,
            tenantId: record.tenantId,
            userId: record.userId,
            input: executorInput,
          },
          onProgress,
          {
            checkpoint: currentCheckpoint,
            persistCheckpoint,
            persistCheckpointAndWait,
          },
        );
      } catch (error) {
        const retryable =
          isRetryableStoryJobError(error) ||
          isRetryablePlanCheckpointError(record.kind, currentCheckpoint, error);
        if (!retryable || recoveryAttempts >= STORY_JOB_MAX_RECOVERY_ATTEMPTS) {
          throw error;
        }
        recoveryAttempts += 1;
        record.recoveryAttempts = recoveryAttempts;
        await enqueueWrite(jobId, () =>
          writeRecord(
            {
              ...record,
              status: "running",
              result: null,
              error: null,
              checkpoint: currentCheckpoint ?? undefined,
              updatedAt: new Date(deps.now()).toISOString(),
            },
            deps,
          ),
        );
        await deps.sleep(storyJobRecoveryDelay(recoveryAttempts - 1));
        continue;
      }

      if (
        !isCheckpointResumableStoryJobKind(record.kind) ||
        !isPartialStoryJobResult(result) ||
        recoveryAttempts >= STORY_JOB_MAX_RECOVERY_ATTEMPTS
      ) {
        break;
      }

      // `generateStoryBibleDeep` intentionally returns partial after its own
      // bounded in-process repair pass. Keep the SAME background job alive
      // and re-enter it with the latest checkpoint so only missing/silent
      // episodes are requested on the next pass. The active-series pointer
      // remains set until the final non-partial result is persisted.
      recoveryAttempts += 1;
      record.recoveryAttempts = recoveryAttempts;
      await enqueueWrite(jobId, () =>
        writeRecord(
          {
            ...record,
            status: "running",
            result: null,
            error: null,
            checkpoint: currentCheckpoint ?? undefined,
            updatedAt: new Date(deps.now()).toISOString(),
          },
          deps,
        ),
      );
      await deps.sleep(storyJobRecoveryDelay(recoveryAttempts - 1));
    }
    let assuranceAccepted = true;
    let assuranceError: string | null = null;
    if (assuranceRunId) {
      const isPartial = Boolean(
        result && typeof result === "object" && (result as { partial?: boolean }).partial,
      );
      const resultRecord = result && typeof result === "object"
        ? result as Record<string, unknown>
        : null;
      const candidateOutput = Array.isArray(resultRecord?.draftedItems)
        ? resultRecord.draftedItems
        : Array.isArray(resultRecord?.improvedItems)
          ? resultRecord.improvedItems
          : null;
      const durableRun = await getStoryGenerationRun(record.tenantId, assuranceRunId);
      const contract = durableRun?.contractJson as StoryGenerationRunContract | undefined;
      if (!durableRun || !contract || !candidateOutput) {
        assuranceAccepted = false;
        assuranceError = "STORY_GENERATION_FINAL_GATE_INPUT_MISSING";
        await transitionStoryGenerationRun({
          tenantId: record.tenantId,
          runId: assuranceRunId,
          to: "failed",
          stage: "finalization",
          checkpoint: currentCheckpoint,
          errorCode: assuranceError,
          expectedFenceToken: assuranceFenceToken,
        });
      } else {
        const sourceSnapshot = durableRun.sourceSnapshotJson as { payload?: unknown } | null;
        const sourcePayload = sourceSnapshot?.payload as Record<string, unknown> | null;
        const admittedVisualSnapshot = visualSourceSnapshotSchema.safeParse(sourceSnapshot?.payload);
        if (admittedVisualSnapshot.success) {
          const currentVisualSnapshot = await captureSeriesVisualSourceSnapshot(
            { tenantId: record.tenantId, userId: record.userId },
            record.seriesId,
          );
          const visualSnapshotGate = currentVisualSnapshot
            ? validateSnapshotForRun(currentVisualSnapshot, {
                revision: admittedVisualSnapshot.data.revision,
                fingerprint: admittedVisualSnapshot.data.fingerprint,
              })
            : {
                ok: false as const,
                code: "STALE_SOURCE_SNAPSHOT" as const,
                message: "Visual source pack is no longer available",
              };
          if (!visualSnapshotGate.ok) {
            assuranceAccepted = false;
            assuranceError = visualSnapshotGate.code;
            await transitionStoryGenerationRun({
              tenantId: record.tenantId,
              runId: assuranceRunId,
              to: "failed",
              stage: "finalization",
              checkpoint: currentCheckpoint,
              errorCode: assuranceError,
              expectedFenceToken: assuranceFenceToken,
            });
          }
        }
        if (!assuranceAccepted) {
          // A changed source pack must fence the run before any candidate is
          // validated or finalized. The creator must start a new run.
        } else {
        const plan = sourcePayload?.bible ?? sourcePayload?.plan;
        const validationOutput = plan !== undefined
          ? mergeStoryPlanFieldsIntoCandidate(candidateOutput, plan)
          : candidateOutput;
        const report = validateStoryGenerationOutput({
          contract,
          output: validationOutput,
          ...(plan !== undefined ? { plan } : {}),
          repairRound: Number((durableRun.checkpointJson as { repairRound?: unknown } | null)?.repairRound ?? 0),
        });
        await updateStoryGenerationCheckpoint(record.tenantId, assuranceRunId, {
          status: "validating",
          stage: "validation",
          report,
          checkpoint: currentCheckpoint,
          expectedFenceToken: assuranceFenceToken,
        });
        if (isPartial) {
          assuranceAccepted = false;
          assuranceError = "STORY_GENERATION_PARTIAL";
          await transitionStoryGenerationRun({
            tenantId: record.tenantId,
            runId: assuranceRunId,
            to: "partial",
            stage: "validation",
            checkpoint: currentCheckpoint,
            errorCode: assuranceError,
            expectedFenceToken: assuranceFenceToken,
          });
        } else {
          // The story executor already performed structural/semantic repair.
          // Assurance findings are retained for observability, while a
          // complete candidate is finalized automatically with no approval
          // click or second user workflow.
          const finalized = await finalizeStoryGeneration(
            record.tenantId,
            assuranceRunId,
            `finalize:${assuranceRunId}`,
            undefined,
            assuranceFenceToken,
          );
          assuranceAccepted = finalized?.status === "succeeded";
          assuranceError = assuranceAccepted ? null : "STORY_GENERATION_FINALIZATION_FAILED";
        }
        }
      }
    }
    const terminalRecord: VerticalDramaStoryJobRecord = {
      ...record,
      status: assuranceAccepted ? "succeeded" : "failed",
      result,
      error: assuranceAccepted ? null : assuranceError,
      checkpoint: currentCheckpoint ?? undefined,
      updatedAt: new Date(deps.now()).toISOString(),
    };
    await enqueueWrite(jobId, () => writeRecord(terminalRecord, deps));
    await notifyStoryJobTerminal(terminalRecord);
  } catch (error) {
    // A stale worker must not publish a terminal Redis record after another
    // worker has claimed the durable run. The durable fence is the authority;
    // the next worker owns recovery and will publish the current result.
    if (error instanceof StoryGenerationFenceLostError) return;
    const message = error instanceof Error ? error.message : String(error);
    const terminalRecord: VerticalDramaStoryJobRecord = {
      ...record,
      status: "failed",
      error: message,
      // Resilient resume — MUST reflect the latest checkpoint, not the
      // stale start-of-run one: a same-jobId BullMQ redelivery (retry) reads
      // exactly this field back via `readRecord` to resume, so losing it
      // here would silently undo every chunk this failed attempt completed.
      checkpoint: currentCheckpoint ?? undefined,
      updatedAt: new Date(deps.now()).toISOString(),
    };
    await enqueueWrite(jobId, () => writeRecord(terminalRecord, deps)).catch(() => {});
    if (assuranceRunId && assuranceFenceToken !== undefined) {
      syncAssuranceState(transitionStoryGenerationRun({
        tenantId: record.tenantId,
        runId: assuranceRunId,
        to: "failed",
        stage: "finalization",
        checkpoint: currentCheckpoint,
        errorCode: "STORY_JOB_FAILED",
        expectedFenceToken: assuranceFenceToken,
      }));
    }
    await notifyStoryJobTerminal(terminalRecord);
  } finally {
    pendingWrites.delete(jobId);
    const pointerKey = activePointerKey(record.tenantId, record.seriesId);
    const currentPointer = await deps.redis.get(pointerKey).catch(() => null);
    // Only clear a pointer that still points at THIS job — defensive against
    // a pathological race with a later enqueue that already claimed the slot.
    if (currentPointer === jobId) {
      await deps.redis.del(pointerKey).catch(() => {});
    }
  }
}

/* -------------------------------------------------------------------------- */
/* BullMQ wiring (lazy init, mirrors `jobAutomationService.ts` exactly)       */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  if (!queue) {
    throw new Error(`${VERTICAL_DRAMA_STORY_JOBS_QUEUE} queue is not initialized`);
  }
  await queue.add(
    "run",
    { jobId },
    {
      removeOnComplete: true,
      // Auto-retry (added 2026-07-14, resilient resume) — `attempts: 3`
      // bounds how many times BullMQ will redeliver this job (including its
      // OWN stalled-job recovery: a worker process that dies mid-run —
      // `systemctl restart`, OOM, crash — without ever completing the job
      // leaves it "stalled"; BullMQ detects this and redelivers it to the
      // next available worker, independent of whether the processor ever
      // threw). THAT redelivery path is what this feature primarily targets
      // (this module's own header doc comment's motivating scenario) and is
      // now safe to retry cheaply: `runVerticalDramaStoryJob` resumes from
      // the job's own `checkpoint` on every (re)start, so a redelivery
      // re-drafts only what the PRIOR attempt hadn't already checkpointed,
      // never re-charging already-drafted episodes.
      //
      // Logical partial results and transient provider errors are retried by
      // `runVerticalDramaStoryJob` itself, while the active pointer remains
      // held. This BullMQ retry remains the separate crash/stall safety net
      // for a worker that dies before the runner can write its terminal state.
      // `removeOnFail` is bounded (24h) rather than `true` so a job that
      // exhausts every attempt stays inspectable for a day instead of
      // vanishing immediately, but still doesn't accumulate forever.
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnFail: { age: 24 * 60 * 60 },
    }
  );
}

/**
 * Registers the BullMQ `Queue` + `Worker` for `vertical_drama_story_jobs`.
 * Call once from `_core/index.ts`'s startup sequence (mirrors
 * `initAutomationJobsQueue`'s exact call site/try-catch convention). The
 * worker body lazily `import()`s `routers/verticalDramaSeries.ts`'s
 * `runVerticalDramaStoryJobExecutor` — a dynamic, execution-time import
 * (not a static top-level one) so this file and the router never form a
 * static circular import (the router already statically imports
 * `enqueueVerticalDramaStoryJob`/`getVerticalDramaStoryJobStatus`/
 * `getActiveVerticalDramaStoryJob` from this file).
 */
export async function initVerticalDramaStoryJobsQueue(): Promise<void> {
  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_STORY_JOBS_QUEUE, { connection });
    worker = new Worker(
      VERTICAL_DRAMA_STORY_JOBS_QUEUE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (bullJob: any) => {
        const { runVerticalDramaStoryJobExecutor } = await import("../routers/verticalDramaSeries");
        await runVerticalDramaStoryJob(bullJob.data.jobId, runVerticalDramaStoryJobExecutor);
      },
      { connection, concurrency: VERTICAL_DRAMA_STORY_JOBS_WORKER_CONCURRENCY },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker.on("failed", (bullJob: any, err: Error) => {
      console.error(`[${VERTICAL_DRAMA_STORY_JOBS_QUEUE}] Job ${bullJob?.id} failed:`, err.message);
    });
  } catch (err) {
    console.warn(`[${VERTICAL_DRAMA_STORY_JOBS_QUEUE}] BullMQ initialization skipped:`, (err as Error).message);
  }
}

export async function closeVerticalDramaStoryJobsQueue(): Promise<void> {
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
