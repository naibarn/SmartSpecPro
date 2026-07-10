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

export const VERTICAL_DRAMA_STORY_JOBS_QUEUE = "vertical_drama_story_jobs";

/** Queue-wide worker concurrency (across ALL tenants/series) — per-series
 *  exclusivity is a SEPARATE mechanism (the active-pointer dedupe above), so
 *  this can safely stay > 1 without breaking "concurrency 1 per series".
 *  Mirrors `jobAutomationService.ts`'s own `concurrency: 3`. */
const VERTICAL_DRAMA_STORY_JOBS_WORKER_CONCURRENCY = 3;

/** Bounds how long a finished/queued job record survives in Redis — long
 *  enough to cover a realistic "client polls, then reloads and resumes"
 *  window, short enough to bound Redis memory for a large premium run's
 *  `result` payload (which can carry a full season's shot drafts). */
const JOB_RECORD_TTL_SECONDS = 2 * 60 * 60; // 2h
/** Safety-net TTL on the per-series active-job pointer — self-heals a
 *  crashed/killed worker's stuck pointer (which would otherwise deadlock the
 *  series' story-job slot forever) instead of requiring manual recovery. */
const ACTIVE_POINTER_TTL_SECONDS = 2 * 60 * 60; // 2h

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type VerticalDramaStoryJobKind =
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
  /** 1-based index of the current call-round (chunk / revise-round) within this job, when applicable. */
  chunkIndex?: number;
  /** Total call-rounds expected for this job, when known upfront. */
  chunkCount?: number;
  /** Running count of individual LLM calls completed so far in this job. */
  callsDone?: number;
  /** Episode numbers this progress event's "fix" work targets (mainly meaningful for phase "fix"). */
  episodesDone?: number[];
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
}

export type VerticalDramaStoryJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface VerticalDramaStoryJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

export interface VerticalDramaStoryJobPayload extends VerticalDramaStoryJobOwner {
  kind: VerticalDramaStoryJobKind;
  /** Kind-specific light input (validated by the router BEFORE enqueueing) — e.g. `{ mode, horizonEpisodes, idempotencyKey }`. */
  input: Record<string, unknown>;
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
}

/** Generic executor signature — dispatches a job payload to kind-specific
 *  domain logic. `onProgress` is fire-and-forget (never awaited by the
 *  executor) so threading it into `verticalDramaStoryBible.ts` is a true
 *  zero-behavior-change addition there. */
export type VerticalDramaStoryJobExecutor = (
  payload: VerticalDramaStoryJobPayload,
  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
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
      description: sanitizeFeedbackText(input.description).slice(0, 5000),
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

async function submitFailedStoryJobFeedback(
  record: VerticalDramaStoryJobRecord,
  db: unknown,
): Promise<void> {
  const kindLabel = STORY_JOB_KIND_LABEL_TH[record.kind];
  const actionUrl = storyJobActionUrl(record);
  const errorMessage = record.error ?? "Unknown vertical drama story job failure";
  const createdAt = record.createdAt ?? null;
  const updatedAt = record.updatedAt ?? null;
  const contextJson = {
    source: "vertical_drama_story_jobs",
    eventType: "system_job_failure",
    user: {
      id: record.userId,
      tenantId: record.tenantId,
    },
    verticalDrama: {
      seriesId: record.seriesId,
      jobId: record.jobId,
      kind: record.kind,
      status: record.status,
      input: record.input,
      progress: record.progress,
      createdAt,
      updatedAt,
    },
    diagnostics: {
      pageUrl: actionUrl,
      actionUrl,
      redisKey: storyJobRedisKey(record.jobId),
      activePointerKey: activePointerKey(record.tenantId, record.seriesId),
      queue: VERTICAL_DRAMA_STORY_JOBS_QUEUE,
      ownerService: "apps/web/server/services/verticalDramaStoryJobs.ts",
      executorBoundary: "apps/web/server/routers/verticalDramaSeries.ts:runVerticalDramaStoryJobExecutor",
      lookupHints: [
        `Open ${actionUrl}`,
        `Search Redis key ${storyJobRedisKey(record.jobId)}`,
        "Search server logs for source=vertical_drama_story_jobs and this jobId",
        "Inspect feedback contextJson.verticalDrama for kind/input/progress",
      ],
      screenshotCapture: {
        attached: false,
        reason:
          "This ticket was created by a server-side background worker, which has no browser viewport to capture automatically.",
        fallback:
          "Client-side system-error feedback can attach pasted/uploaded screenshots when a browser-visible error opens the feedback dialog.",
      },
    },
    error: {
      message: errorMessage,
    },
  };

  const description = [
    `ระบบ Vertical Drama background job ล้มเหลวและสร้าง feedback นี้อัตโนมัติ`,
    `User ID: ${record.userId}`,
    `Tenant ID: ${record.tenantId}`,
    `Series ID: ${record.seriesId}`,
    `Job ID: ${record.jobId}`,
    `Kind: ${record.kind} (${kindLabel})`,
    `Page: ${actionUrl}`,
    `Error: ${errorMessage}`,
  ].join("\n");

  await submitVerticalDramaSystemFeedback(
    {
      tenantId: record.tenantId,
      userId: record.userId,
      seriesId: record.seriesId,
      category: "vertical_drama_story_jobs",
      title: `[System] ${kindLabel} ล้มเหลว (series #${record.seriesId})`,
      description,
      stepsToReproduce: [
        `1. เปิดหน้า ${actionUrl}`,
        `2. ตรวจ job ${record.jobId} ใน Redis key ${storyJobRedisKey(record.jobId)}`,
        `3. ค้น log ด้วย jobId และ source vertical_drama_story_jobs`,
        "4. ดู contextJson ของ ticket นี้เพื่อเทียบ kind/input/progress/error",
      ].join("\n"),
      expectedBehavior: `${kindLabel} ควรเสร็จหรือบันทึกผลลัพธ์บางส่วนได้โดยไม่ทำให้ workflow ล้มเหลวเงียบ`,
      actualBehavior: errorMessage,
      contextJson,
    },
    db,
  );
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
    try {
      await createNotification({
        db,
        userId: record.userId,
        type: succeeded ? "system" : "alert",
        title: succeeded ? `${kindLabel} เสร็จแล้ว` : `${kindLabel} ไม่สำเร็จ`,
        content: succeeded
          ? `งาน "${kindLabel}" เสร็จเรียบร้อยแล้ว กลับไปดูผลลัพธ์ได้เลย`
          : `งาน "${kindLabel}" ล้มเหลว: ${(record.error ?? "").slice(0, 200)}`,
        priority: succeeded ? "normal" : "high",
        // No `relatedResourceType` fits (the `ResourceType` union has no
        // "vertical drama series/job" member) — omitted, same as any other
        // caller with no matching category (`mapToCategory` falls back to
        // `"business"`).
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
    } catch (error) {
      debugError(
        "verticalDramaStoryJobs",
        `Failed to send completion notification for story job ${record.jobId}`,
        error,
      );
    }
    if (!succeeded) {
      try {
        await submitFailedStoryJobFeedback(record, db);
      } catch (error) {
        debugError(
          "verticalDramaStoryJobs",
          `Failed to submit auto feedback for story job ${record.jobId}`,
          error,
        );
      }
      // Fingerprinted/deduped system auto-report (task: server-side auto-
      // report service) — separate from `submitFailedStoryJobFeedback` above,
      // which always creates a new ticket per failure. This one dedups
      // repeats of the "same" failure across a rolling 24h window instead of
      // flooding the queue. Kept as an additional call (not a replacement)
      // to avoid touching the existing, already-tested
      // `submitFailedStoryJobFeedback` behavior/tests; see the auto-report
      // task's Result Report for a follow-up consolidation recommendation.
      try {
        const { reportSystemFailure } = await import("./systemAutoReportService");
        await reportSystemFailure({
          source: "vertical_drama_story_jobs",
          userId: record.userId,
          tenantId: record.tenantId,
          jobId: record.jobId,
          title: `Story job failed (${record.kind})`,
          errorMessage: record.error ?? "unknown",
          extra: { seriesId: record.seriesId, kind: record.kind },
        });
      } catch (error) {
        debugError(
          "verticalDramaStoryJobs",
          `Failed to file system auto-report for story job ${record.jobId}`,
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

  record.status = "running";
  record.updatedAt = new Date(deps.now()).toISOString();
  await enqueueWrite(jobId, () => writeRecord(record, deps));

  const onProgress = (progress: VerticalDramaStoryJobProgress) => {
    enqueueWrite(jobId, () =>
      writeRecord(
        { ...record, status: "running", progress, updatedAt: new Date(deps.now()).toISOString() },
        deps,
      ),
    ).catch((error) => {
      debugError("verticalDramaStoryJobs", `Failed to persist progress for story job ${jobId}`, error);
    });
  };

  try {
    const result = await executor(
      {
        kind: record.kind,
        seriesId: record.seriesId,
        tenantId: record.tenantId,
        userId: record.userId,
        input: record.input,
      },
      onProgress,
    );
    const terminalRecord: VerticalDramaStoryJobRecord = {
      ...record,
      status: "succeeded",
      result,
      error: null,
      updatedAt: new Date(deps.now()).toISOString(),
    };
    await enqueueWrite(jobId, () => writeRecord(terminalRecord, deps));
    await notifyStoryJobTerminal(terminalRecord);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const terminalRecord: VerticalDramaStoryJobRecord = {
      ...record,
      status: "failed",
      error: message,
      updatedAt: new Date(deps.now()).toISOString(),
    };
    await enqueueWrite(jobId, () => writeRecord(terminalRecord, deps)).catch(() => {});
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
  await queue.add("run", { jobId }, { removeOnComplete: true, removeOnFail: true });
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
