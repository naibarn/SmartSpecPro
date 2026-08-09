/**
 * Durable submit -> poll orchestration for Vertical Drama start-frame prompt
 * generation. The generated prompt itself remains durable in episode JSONB;
 * Redis stores only bounded job-control state and BullMQ dispatches work.
 */
import { createHash, randomUUID } from "crypto";
import type { VdImagePromptModeStamp } from "@shared/verticalDramaSeries/imagePromptModelFamily";
import { debugError } from "../_core/logger";
import { getRedisClient } from "./redis";

export const VERTICAL_DRAMA_SHOT_PROMPT_JOBS_QUEUE =
  "vertical_drama_shot_prompt_jobs";

const RECORD_TTL_SECONDS = 6 * 60 * 60;
const POINTER_TTL_SECONDS = 6 * 60 * 60;
const WORKER_CONCURRENCY = 3;
const MAX_ERROR_CHARS = 2_000;

export type VerticalDramaShotPromptJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface VerticalDramaShotPromptJobInput {
  seriesId: string;
  episodeId: string;
  shotNumber: number;
  instruction?: string;
  canonicalShotSummary?: string;
  attachShotImage?: boolean;
  imageUrl?: string;
  additionalImageUrls?: string[];
  idempotencyKey?: string;
}

export interface VerticalDramaShotPromptJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
}

export interface VerticalDramaShotPromptJobResult {
  prompt: string;
  negativePrompt: string;
  creditsUsed: number;
  usedVision: boolean;
  promptMode?: VdImagePromptModeStamp;
}

export interface VerticalDramaShotPromptJobPayload
  extends VerticalDramaShotPromptJobOwner {
  publicUrl: string | null;
  input: VerticalDramaShotPromptJobInput;
}

export interface VerticalDramaShotPromptJobRecord
  extends VerticalDramaShotPromptJobPayload {
  jobId: string;
  status: VerticalDramaShotPromptJobStatus;
  result: VerticalDramaShotPromptJobResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VerticalDramaShotPromptJobExecutor = (
  payload: VerticalDramaShotPromptJobPayload,
  execution: { jobId: string; token: string },
) => Promise<VerticalDramaShotPromptJobResult>;

/** Server-process-only proof that the protected synchronous resolver is being
 * entered by this BullMQ worker, never directly by a browser tRPC call. */
const activeWorkerExecutions = new Map<string, string>();

export function isVerticalDramaShotPromptWorkerExecution(
  jobId: string,
  token: string,
): boolean {
  return activeWorkerExecutions.get(jobId) === token;
}

export interface VerticalDramaShotPromptJobRedisAdapter {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    seconds: number,
  ): Promise<unknown>;
  setNx(
    key: string,
    value: string,
    seconds: number,
  ): Promise<boolean>;
  del(key: string): Promise<unknown>;
  compareDelete(key: string, expectedValue: string): Promise<boolean>;
}

export interface VerticalDramaShotPromptJobStoreDependencies {
  redis: VerticalDramaShotPromptJobRedisAdapter;
  now: () => number;
}

export interface VerticalDramaShotPromptJobEnqueueDependencies
  extends Partial<VerticalDramaShotPromptJobStoreDependencies> {
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
}

function defaultRedisAdapter(): VerticalDramaShotPromptJobRedisAdapter {
  const client = getRedisClient();
  return {
    get: key => client.get(key),
    set: (key, value, mode, seconds) =>
      client.set(key, value, mode, seconds),
    setNx: async (key, value, seconds) =>
      (await client.set(key, value, "EX", seconds, "NX")) === "OK",
    del: key => client.del(key),
    compareDelete: async (key, expectedValue) => {
      const result = await client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        expectedValue,
      );
      return Number(result) === 1;
    },
  };
}

function resolveDependencies(
  dependencies?: Partial<VerticalDramaShotPromptJobStoreDependencies>,
): VerticalDramaShotPromptJobStoreDependencies {
  return {
    redis: dependencies?.redis ?? defaultRedisAdapter(),
    now: dependencies?.now ?? Date.now,
  };
}

function recordKey(jobId: string): string {
  return `vd:shot-prompt-job:${jobId}`;
}

function activePointerKey(owner: VerticalDramaShotPromptJobOwner): string {
  return [
    "vd:shot-prompt-job:active",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.episodeId,
    owner.shotNumber,
  ].join(":");
}

function idempotencyPointerKey(
  owner: VerticalDramaShotPromptJobOwner,
  idempotencyKey: string,
): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex");
  return [
    "vd:shot-prompt-job:idempotency",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.episodeId,
    owner.shotNumber,
    digest,
  ].join(":");
}

function ownerMatches(
  record: VerticalDramaShotPromptJobRecord,
  owner: VerticalDramaShotPromptJobOwner,
): boolean {
  return (
    record.tenantId === owner.tenantId &&
    record.userId === owner.userId &&
    record.seriesId === owner.seriesId &&
    record.episodeId === owner.episodeId &&
    record.shotNumber === owner.shotNumber
  );
}

function isActive(status: VerticalDramaShotPromptJobStatus): boolean {
  return status === "queued" || status === "running";
}

async function readRecord(
  jobId: string,
  deps: VerticalDramaShotPromptJobStoreDependencies,
): Promise<VerticalDramaShotPromptJobRecord | null> {
  const raw = await deps.redis.get(recordKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerticalDramaShotPromptJobRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VerticalDramaShotPromptJobRecord,
  deps: VerticalDramaShotPromptJobStoreDependencies,
): Promise<void> {
  await deps.redis.set(
    recordKey(record.jobId),
    JSON.stringify(record),
    "EX",
    RECORD_TTL_SECONDS,
  );
  if (record.status === "running") {
    const pointer = activePointerKey(record);
    if ((await deps.redis.get(pointer)) === record.jobId) {
      await deps.redis.set(pointer, record.jobId, "EX", POINTER_TTL_SECONDS);
    }
  }
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "Failed to author the start-frame prompt").slice(
    0,
    MAX_ERROR_CHARS,
  );
}

async function clearPointers(
  record: VerticalDramaShotPromptJobRecord,
  deps: VerticalDramaShotPromptJobStoreDependencies,
): Promise<void> {
  await deps.redis
    .compareDelete(activePointerKey(record), record.jobId)
    .catch(() => false);
}

export async function getVerticalDramaShotPromptJobStatus(
  jobId: string,
  owner: VerticalDramaShotPromptJobOwner,
  dependencies?: Partial<VerticalDramaShotPromptJobStoreDependencies>,
): Promise<VerticalDramaShotPromptJobRecord | null> {
  const record = await readRecord(jobId, resolveDependencies(dependencies));
  return record && ownerMatches(record, owner) ? record : null;
}

export async function getActiveVerticalDramaShotPromptJob(
  owner: VerticalDramaShotPromptJobOwner,
  dependencies?: Partial<VerticalDramaShotPromptJobStoreDependencies>,
): Promise<VerticalDramaShotPromptJobRecord | null> {
  const deps = resolveDependencies(dependencies);
  const pointer = activePointerKey(owner);
  const jobId = await deps.redis.get(pointer);
  if (!jobId) return null;
  const record = await readRecord(jobId, deps);
  if (!record || !ownerMatches(record, owner) || !isActive(record.status)) {
    await deps.redis.compareDelete(pointer, jobId).catch(() => false);
    return null;
  }
  return record;
}

export async function enqueueVerticalDramaShotPromptJob(
  payload: VerticalDramaShotPromptJobPayload,
  dependencies?: VerticalDramaShotPromptJobEnqueueDependencies,
): Promise<{ jobId: string; status: VerticalDramaShotPromptJobStatus; deduped: boolean }> {
  const deps = resolveDependencies(dependencies);
  const idempotencyPointer = payload.input.idempotencyKey
    ? idempotencyPointerKey(payload, payload.input.idempotencyKey)
    : null;

  if (idempotencyPointer) {
    const priorJobId = await deps.redis.get(idempotencyPointer);
    if (priorJobId) {
      const prior = await readRecord(priorJobId, deps);
      if (prior && ownerMatches(prior, payload)) {
        return { jobId: prior.jobId, status: prior.status, deduped: true };
      }
      await deps.redis.compareDelete(idempotencyPointer, priorJobId).catch(() => false);
    }
  }

  const activePointer = activePointerKey(payload);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existingJobId = await deps.redis.get(activePointer);
    if (existingJobId) {
      const existing = await readRecord(existingJobId, deps);
      if (existing && ownerMatches(existing, payload) && isActive(existing.status)) {
        return { jobId: existing.jobId, status: existing.status, deduped: true };
      }
      await deps.redis.compareDelete(activePointer, existingJobId).catch(() => false);
    }

    const jobId = randomUUID();
    const nowIso = new Date(deps.now()).toISOString();
    const record: VerticalDramaShotPromptJobRecord = {
      ...payload,
      jobId,
      status: "queued",
      result: null,
      error: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await writeRecord(record, deps);
    const claimed = await deps.redis.setNx(
      activePointer,
      jobId,
      POINTER_TTL_SECONDS,
    );
    if (!claimed) continue;

    try {
      if (idempotencyPointer) {
        await deps.redis.set(
          idempotencyPointer,
          jobId,
          "EX",
          RECORD_TTL_SECONDS,
        );
      }
      await (dependencies?.enqueueBullmqJob ?? defaultEnqueueBullmqJob)(jobId);
    } catch (error) {
      const failed: VerticalDramaShotPromptJobRecord = {
        ...record,
        status: "failed",
        error: boundedError(error),
        updatedAt: new Date(deps.now()).toISOString(),
      };
      await writeRecord(failed, deps);
      await clearPointers(failed, deps);
      debugError(
        "verticalDramaShotPromptJobs",
        `Failed to enqueue shot prompt job ${jobId}`,
        error,
      );
      return { jobId, status: "failed", deduped: false };
    }
    return { jobId, status: "queued", deduped: false };
  }

  const winnerId = await deps.redis.get(activePointer);
  const winner = winnerId ? await readRecord(winnerId, deps) : null;
  if (winner && ownerMatches(winner, payload) && isActive(winner.status)) {
    return { jobId: winner.jobId, status: winner.status, deduped: true };
  }
  throw new Error("Unable to reserve the shot prompt job slot — retry");
}

export async function runVerticalDramaShotPromptJob(
  jobId: string,
  executor: VerticalDramaShotPromptJobExecutor,
  dependencies?: Partial<VerticalDramaShotPromptJobStoreDependencies>,
): Promise<void> {
  const deps = resolveDependencies(dependencies);
  const record = await readRecord(jobId, deps);
  if (
    !record ||
    record.status === "succeeded" ||
    record.status === "failed"
  ) {
    return;
  }

  const running: VerticalDramaShotPromptJobRecord = {
    ...record,
    status: "running",
    error: null,
    updatedAt: new Date(deps.now()).toISOString(),
  };
  await writeRecord(running, deps);
  const executionToken = randomUUID();
  activeWorkerExecutions.set(jobId, executionToken);
  try {
    const result = await executor({
      tenantId: running.tenantId,
      userId: running.userId,
      seriesId: running.seriesId,
      episodeId: running.episodeId,
      shotNumber: running.shotNumber,
      publicUrl: running.publicUrl,
      input: running.input,
    }, { jobId, token: executionToken });
    await writeRecord(
      {
        ...running,
        status: "succeeded",
        result,
        error: null,
        updatedAt: new Date(deps.now()).toISOString(),
      },
      deps,
    );
  } catch (error) {
    await writeRecord(
      {
        ...running,
        status: "failed",
        result: null,
        error: boundedError(error),
        updatedAt: new Date(deps.now()).toISOString(),
      },
      deps,
    ).catch(() => {});
  } finally {
    activeWorkerExecutions.delete(jobId);
    await clearPointers(running, deps);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  if (!queue) {
    throw new Error(`${VERTICAL_DRAMA_SHOT_PROMPT_JOBS_QUEUE} queue is not initialized`);
  }
  await queue.add(
    "run",
    { jobId },
    {
      jobId,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { age: 24 * 60 * 60 },
    },
  );
}

export async function initVerticalDramaShotPromptJobsQueue(): Promise<void> {
  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_SHOT_PROMPT_JOBS_QUEUE, { connection });
    worker = new Worker(
      VERTICAL_DRAMA_SHOT_PROMPT_JOBS_QUEUE,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (bullJob: any) => {
        const { runVerticalDramaShotPromptJobExecutor } = await import(
          "../routers/verticalDramaEpisodes"
        );
        await runVerticalDramaShotPromptJob(
          bullJob.data.jobId,
          runVerticalDramaShotPromptJobExecutor,
        );
      },
      { connection, concurrency: WORKER_CONCURRENCY },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    worker.on("failed", (bullJob: any, error: Error) => {
      console.error(
        `[${VERTICAL_DRAMA_SHOT_PROMPT_JOBS_QUEUE}] Job ${bullJob?.id} failed:`,
        error.message,
      );
    });
  } catch (error) {
    console.warn(
      `[${VERTICAL_DRAMA_SHOT_PROMPT_JOBS_QUEUE}] BullMQ initialization skipped:`,
      boundedError(error),
    );
  }
}

export async function closeVerticalDramaShotPromptJobsQueue(): Promise<void> {
  try {
    await worker?.close();
    await queue?.close();
  } catch {
    // Best-effort shutdown.
  } finally {
    worker = null;
    queue = null;
  }
}
