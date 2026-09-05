/**
 * Submit/poll runtime for Vertical Drama LLM operations that are not covered
 * by one of the domain-specific queues.  This module deliberately contains
 * no LLM/domain logic: workers dispatch a closed, typed job kind to the
 * domain executor and the browser only receives bounded job state.
 */
import { randomUUID } from "node:crypto";
import { debugError } from "../_core/logger";
import { getRedisClient } from "./redis";
import { createSpecialTieInForensicRecorder } from "./verticalDramaSpecialTieInForensics";
import { purgeExpiredSpecialTieInForensicEvents } from "./verticalDramaSpecialTieInForensics";
import {
  buildVerticalDramaEpisodeUrl,
  notifyJobCompletion,
  type JobCompletionNotificationInput,
} from "./jobCompletionNotificationService";

export const VERTICAL_DRAMA_INTERACTIVE_JOBS_QUEUE =
  "vertical_drama_interactive_jobs";

const RECORD_TTL_SECONDS = 6 * 60 * 60;
const POINTER_TTL_SECONDS = 6 * 60 * 60;
const WORKER_CONCURRENCY = 3;
const MAX_ERROR_CHARS = 2_000;

export type VerticalDramaInteractiveJobKind =
  | "prompt_expansion"
  | "preset_synthesis"
  | "lineage_carry_over"
  | "special_edition_brief"
  | "source_analysis"
  | "location_detection"
  | "character_variants"
  | "character_duplicates"
  | "reference_frame_prompt"
  | "special_tie_in_prompt"
  | "marketplace_review_ideas";

export type VerticalDramaInteractiveJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface VerticalDramaInteractiveJobOwner {
  tenantId: string;
  userId: number;
  /** Stable domain scope used for dedupe and ownership. */
  scopeKey: string;
}

export interface VerticalDramaInteractiveJobPayload extends VerticalDramaInteractiveJobOwner {
  kind: VerticalDramaInteractiveJobKind;
  input: Record<string, unknown>;
  modelId?: string | null;
  skillSlug?: string;
  idempotencyKey?: string;
}

export interface VerticalDramaInteractiveJobRecord extends VerticalDramaInteractiveJobPayload {
  jobId: string;
  status: VerticalDramaInteractiveJobStatus;
  progress: number;
  result: unknown;
  error: string | null;
  traceId: string;
  createdAt: string;
  updatedAt: string;
}

export type VerticalDramaInteractiveJobExecutor = (
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
) => Promise<unknown>;

export interface VerticalDramaInteractiveJobRedisAdapter {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    seconds: number
  ): Promise<unknown>;
  setNx(key: string, value: string, seconds: number): Promise<boolean>;
  del(key: string): Promise<unknown>;
  compareDelete(key: string, expectedValue: string): Promise<boolean>;
}

export interface VerticalDramaInteractiveJobDependencies extends Partial<VerticalDramaInteractiveJobStoreDependencies> {
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
  notifyCompletion?: (
    record: VerticalDramaInteractiveJobRecord
  ) => Promise<void>;
}

export interface VerticalDramaInteractiveJobStoreDependencies {
  redis: VerticalDramaInteractiveJobRedisAdapter;
  now: () => number;
}

function defaultRedisAdapter(): VerticalDramaInteractiveJobRedisAdapter {
  const redis = getRedisClient();
  return {
    get: key => redis.get(key),
    set: (key, value, mode, seconds) => redis.set(key, value, mode, seconds),
    setNx: async (key, value, seconds) =>
      (await redis.set(key, value, "EX", seconds, "NX")) === "OK",
    del: key => redis.del(key),
    compareDelete: async (key, expectedValue) => {
      const result = await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        expectedValue
      );
      return Number(result) === 1;
    },
  };
}

function resolveDependencies(
  dependencies?: Partial<VerticalDramaInteractiveJobStoreDependencies>
): VerticalDramaInteractiveJobStoreDependencies {
  return {
    redis: dependencies?.redis ?? defaultRedisAdapter(),
    now: dependencies?.now ?? Date.now,
  };
}

function recordKey(jobId: string): string {
  return `vd:interactive-job:${jobId}`;
}

function activePointerKey(owner: VerticalDramaInteractiveJobOwner): string {
  return `vd:interactive-job:active:${owner.tenantId}:${owner.userId}:${owner.scopeKey}`;
}

function idempotencyPointerKey(
  owner: VerticalDramaInteractiveJobOwner,
  idempotencyKey: string
): string {
  return `vd:interactive-job:idempotency:${owner.tenantId}:${owner.userId}:${owner.scopeKey}:${idempotencyKey}`;
}

function isActive(status: VerticalDramaInteractiveJobStatus): boolean {
  return status === "queued" || status === "running";
}

function ownerMatches(
  record: VerticalDramaInteractiveJobRecord,
  owner: VerticalDramaInteractiveJobOwner
): boolean {
  return (
    record.tenantId === owner.tenantId &&
    record.userId === owner.userId &&
    record.scopeKey === owner.scopeKey
  );
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "Interactive LLM job failed").slice(
    0,
    MAX_ERROR_CHARS
  );
}

function interactiveJobLabel(kind: VerticalDramaInteractiveJobKind): string {
  const labels: Record<VerticalDramaInteractiveJobKind, string> = {
    prompt_expansion: "ขยาย Prompt",
    preset_synthesis: "สร้างชุดคำสั่ง",
    lineage_carry_over: "ส่งต่อความต่อเนื่อง",
    special_edition_brief: "สร้างบรีฟตอนพิเศษ",
    source_analysis: "วิเคราะห์แหล่งอ้างอิง",
    location_detection: "วิเคราะห์สถานที่",
    character_variants: "สร้างตัวละครหลายแบบ",
    character_duplicates: "ตรวจสอบตัวละครซ้ำ",
    reference_frame_prompt: "สร้าง Prompt ภาพอ้างอิง",
    special_tie_in_prompt: "สร้าง storyboard ตอนพิเศษ",
    marketplace_review_ideas: "สร้างไอเดีย tie-in สินค้า",
  };
  return labels[kind];
}

async function notifyInteractiveJobTerminal(
  record: VerticalDramaInteractiveJobRecord
): Promise<void> {
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return;
    const input: JobCompletionNotificationInput = {
      db,
      userId: record.userId,
      tenantId: record.tenantId,
      jobId: record.jobId,
      jobType: `vertical_drama_interactive:${record.kind}`,
      status: record.status === "succeeded" ? "succeeded" : "failed",
      title: interactiveJobLabel(record.kind),
      successMessage: `${interactiveJobLabel(record.kind)} เสร็จแล้ว กลับไปดูผลลัพธ์ได้เลย`,
      failureMessage: `${interactiveJobLabel(record.kind)} ไม่สำเร็จ${record.error ? `: ${record.error.slice(0, 500)}` : ""}`,
      actionUrl: buildVerticalDramaEpisodeUrl(
        record.input.seriesId,
        record.input.episodeId
      ),
      actionLabel: "เปิดตอน",
      traceId: record.traceId,
      startedAt: record.createdAt,
      finishedAt: record.updatedAt,
      errorMessage: record.error,
      source: "vertical_drama_interactive_jobs",
      relatedItems: {
        kind: record.kind,
        scopeKey: record.scopeKey,
      },
    };
    await notifyJobCompletion(input);
  } catch (error) {
    console.error(
      "[VerticalDramaInteractiveJobs] terminal_notification_bridge_failed",
      {
        jobId: record.jobId,
        userId: record.userId,
        tenantId: record.tenantId,
        kind: record.kind,
        status: record.status,
        traceId: record.traceId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

async function notifyInteractiveTerminalWithDependencies(
  record: VerticalDramaInteractiveJobRecord,
  dependencies?: VerticalDramaInteractiveJobDependencies
): Promise<void> {
  await (dependencies?.notifyCompletion ?? notifyInteractiveJobTerminal)(
    record
  );
}

async function readRecord(
  jobId: string,
  dependencies?: Partial<VerticalDramaInteractiveJobStoreDependencies>
): Promise<VerticalDramaInteractiveJobRecord | null> {
  const raw = await resolveDependencies(dependencies).redis.get(
    recordKey(jobId)
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerticalDramaInteractiveJobRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VerticalDramaInteractiveJobRecord,
  dependencies?: Partial<VerticalDramaInteractiveJobStoreDependencies>
): Promise<void> {
  const deps = resolveDependencies(dependencies);
  await deps.redis.set(
    recordKey(record.jobId),
    JSON.stringify(record),
    "EX",
    RECORD_TTL_SECONDS
  );
  // The enqueue path claims the queued pointer with SETNX. Once a worker is
  // running, refresh the pointer TTL from ordinary status writes. Do not set
  // the queued pointer here or SETNX would no longer be a real reservation.
  if (record.status === "running") {
    await deps.redis.set(
      activePointerKey(record),
      record.jobId,
      "EX",
      POINTER_TTL_SECONDS
    );
  }
}

export async function enqueueVerticalDramaInteractiveJob(
  payload: VerticalDramaInteractiveJobPayload,
  dependencies?: VerticalDramaInteractiveJobDependencies
): Promise<{
  jobId: string;
  status: VerticalDramaInteractiveJobStatus;
  deduped: boolean;
}> {
  if (!payload.skillSlug?.trim()) {
    throw new Error("Interactive LLM job requires skillSlug");
  }
  const deps = resolveDependencies(dependencies);
  const activePointer = activePointerKey(payload);
  const idempotencyPointer = payload.idempotencyKey
    ? idempotencyPointerKey(payload, payload.idempotencyKey)
    : null;

  if (idempotencyPointer) {
    const priorId = await deps.redis.get(idempotencyPointer);
    if (priorId) {
      const prior = await readRecord(priorId, dependencies);
      if (prior && ownerMatches(prior, payload)) {
        return { jobId: prior.jobId, status: prior.status, deduped: true };
      }
      await deps.redis
        .compareDelete(idempotencyPointer, priorId)
        .catch(() => false);
    }
  }

  const existingId = await deps.redis.get(activePointer);
  if (existingId) {
    const existing = await readRecord(existingId, dependencies);
    if (
      existing &&
      ownerMatches(existing, payload) &&
      isActive(existing.status)
    ) {
      return { jobId: existing.jobId, status: existing.status, deduped: true };
    }
    await deps.redis
      .compareDelete(activePointer, existingId)
      .catch(() => false);
  }

  const jobId = randomUUID();
  const traceId = randomUUID();
  const now = new Date(deps.now()).toISOString();
  const record: VerticalDramaInteractiveJobRecord = {
    ...payload,
    jobId,
    traceId,
    status: "queued",
    progress: 0,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  const specialForensicRecorder =
    payload.kind === "special_tie_in_prompt"
      ? createSpecialTieInForensicRecorder({
          tenantId: payload.tenantId,
          userId: payload.userId,
          seriesId: Number(payload.input.seriesId),
          episodeId: Number(payload.input.episodeId),
          jobId,
          traceId,
          createIntentId:
            typeof payload.input.createIntentId === "string"
              ? payload.input.createIntentId
              : undefined,
          inputVersion:
            typeof payload.input.inputVersion === "number"
              ? payload.input.inputVersion
              : undefined,
          skillSlug: payload.skillSlug,
        })
      : null;
  await specialForensicRecorder?.emit({
    eventType: "job_queued",
    stage: "queue",
    outcome: "queued",
    metadata: { scopeKey: payload.scopeKey, kind: payload.kind },
  });
  await writeRecord(record, dependencies);
  const claimed = await deps.redis.setNx(
    activePointer,
    jobId,
    POINTER_TTL_SECONDS
  );
  if (!claimed) {
    const winnerId = await deps.redis.get(activePointer);
    const winner = winnerId ? await readRecord(winnerId, dependencies) : null;
    if (winner && ownerMatches(winner, payload) && isActive(winner.status)) {
      return { jobId: winner.jobId, status: winner.status, deduped: true };
    }
    throw new Error("Unable to reserve interactive LLM job slot");
  }
  if (idempotencyPointer) {
    await deps.redis.set(idempotencyPointer, jobId, "EX", RECORD_TTL_SECONDS);
  }

  try {
    await (dependencies?.enqueueBullmqJob ?? defaultEnqueueBullmqJob)(jobId);
  } catch (error) {
    await specialForensicRecorder?.emit({
      eventType: "job_failed",
      stage: "queue",
      outcome: "enqueue_failed",
      errorCode: "INTERACTIVE_JOB_ENQUEUE_FAILED",
      errorMessage: boundedError(error),
      completedAt: new Date(),
    });
    const terminalRecord = {
      ...record,
      status: "failed",
      error: boundedError(error),
      updatedAt: new Date(deps.now()).toISOString(),
    } satisfies VerticalDramaInteractiveJobRecord;
    await writeRecord(terminalRecord, dependencies);
    await notifyInteractiveTerminalWithDependencies(
      terminalRecord,
      dependencies
    );
    await deps.redis.compareDelete(activePointer, jobId).catch(() => false);
    debugError(
      "verticalDramaInteractiveJobs",
      `Failed to enqueue ${jobId}`,
      error
    );
    return { jobId, status: "failed", deduped: false };
  }
  return { jobId, status: "queued", deduped: false };
}

export async function getVerticalDramaInteractiveJobStatus(
  jobId: string,
  owner: VerticalDramaInteractiveJobOwner,
  dependencies?: Partial<VerticalDramaInteractiveJobStoreDependencies>
): Promise<VerticalDramaInteractiveJobRecord | null> {
  const record = await readRecord(jobId, dependencies);
  return record && ownerMatches(record, owner) ? record : null;
}

export async function getActiveVerticalDramaInteractiveJob(
  owner: VerticalDramaInteractiveJobOwner,
  dependencies?: Partial<VerticalDramaInteractiveJobStoreDependencies>
): Promise<VerticalDramaInteractiveJobRecord | null> {
  const deps = resolveDependencies(dependencies);
  const pointer = activePointerKey(owner);
  const jobId = await deps.redis.get(pointer);
  if (!jobId) return null;
  const record = await readRecord(jobId, dependencies);
  if (!record || !ownerMatches(record, owner) || !isActive(record.status)) {
    await deps.redis.compareDelete(pointer, jobId).catch(() => false);
    return null;
  }
  return record;
}

export async function runVerticalDramaInteractiveJob(
  jobId: string,
  executor: VerticalDramaInteractiveJobExecutor,
  dependencies?: VerticalDramaInteractiveJobDependencies
): Promise<void> {
  const deps = resolveDependencies(dependencies);
  const record = await readRecord(jobId, dependencies);
  if (!record || !isActive(record.status)) return;
  const running: VerticalDramaInteractiveJobRecord = {
    ...record,
    status: "running",
    progress: Math.max(record.progress, 1),
    updatedAt: new Date(deps.now()).toISOString(),
  };
  await writeRecord(running, dependencies);
  const heartbeatTimer = setInterval(() => {
    writeRecord(
      {
        ...running,
        updatedAt: new Date(deps.now()).toISOString(),
      },
      dependencies
    ).catch(() => {});
  }, 15_000);
  heartbeatTimer.unref?.();
  try {
    const result = await executor(running, {
      jobId,
      traceId: running.traceId,
    });
    const terminalRecord = {
      ...running,
      status: "succeeded",
      progress: 100,
      result,
      error: null,
      updatedAt: new Date(deps.now()).toISOString(),
    } satisfies VerticalDramaInteractiveJobRecord;
    await writeRecord(terminalRecord, dependencies);
    await notifyInteractiveTerminalWithDependencies(
      terminalRecord,
      dependencies
    );
  } catch (error) {
    const terminalRecord = {
      ...running,
      status: "failed",
      result: null,
      error: boundedError(error),
      updatedAt: new Date(deps.now()).toISOString(),
    } satisfies VerticalDramaInteractiveJobRecord;
    await writeRecord(terminalRecord, dependencies).catch(() => {});
    await notifyInteractiveTerminalWithDependencies(
      terminalRecord,
      dependencies
    );
  } finally {
    clearInterval(heartbeatTimer);
    await deps.redis
      .compareDelete(activePointerKey(running), jobId)
      .catch(() => false);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;
let specialDebugCleanupTimer: ReturnType<typeof setInterval> | null = null;

async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  if (!queue) {
    throw new Error(
      `${VERTICAL_DRAMA_INTERACTIVE_JOBS_QUEUE} queue is not initialized`
    );
  }
  await queue.add(
    "run",
    { jobId },
    {
      jobId,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { age: 24 * 60 * 60 },
    }
  );
}

export async function initVerticalDramaInteractiveJobsQueue(): Promise<void> {
  if (queue) return;
  if (!specialDebugCleanupTimer) {
    specialDebugCleanupTimer = setInterval(
      () => {
        purgeExpiredSpecialTieInForensicEvents().catch(error => {
          debugError(
            "verticalDramaInteractiveJobs",
            "Special tie-in debug retention cleanup failed",
            error
          );
        });
      },
      6 * 60 * 60 * 1000
    );
    specialDebugCleanupTimer.unref?.();
  }
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_INTERACTIVE_JOBS_QUEUE, { connection });
    worker = new Worker(
      VERTICAL_DRAMA_INTERACTIVE_JOBS_QUEUE,
      async (bullJob: { data: { jobId: string } }) => {
        const { runVerticalDramaInteractiveJobExecutor } =
          await import("../services/verticalDramaInteractiveJobExecutor");
        await runVerticalDramaInteractiveJob(
          bullJob.data.jobId,
          runVerticalDramaInteractiveJobExecutor
        );
      },
      { connection, concurrency: WORKER_CONCURRENCY }
    );
    worker.on("failed", (bullJob: { id?: string }, error: Error) => {
      debugError(
        "verticalDramaInteractiveJobs",
        `BullMQ job ${bullJob?.id ?? "unknown"} failed`,
        error
      );
    });
  } catch (error) {
    debugError(
      "verticalDramaInteractiveJobs",
      "BullMQ initialization skipped",
      error
    );
  }
}

export async function closeVerticalDramaInteractiveJobsQueue(): Promise<void> {
  try {
    await worker?.close();
    await queue?.close();
  } catch {
    // Best effort during process shutdown.
  } finally {
    worker = null;
    queue = null;
    if (specialDebugCleanupTimer) clearInterval(specialDebugCleanupTimer);
    specialDebugCleanupTimer = null;
  }
}
