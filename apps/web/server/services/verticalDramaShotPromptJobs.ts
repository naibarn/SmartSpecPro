/**
 * Durable submit -> poll orchestration for Vertical Drama start-frame prompt
 * generation. The generated prompt itself remains durable in episode JSONB;
 * Redis stores only bounded job-control state and BullMQ dispatches work.
 */
import { createHash, randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import type {
  VdImagePromptModeStamp,
  VdImagePromptSourceStamp,
} from "@shared/verticalDramaSeries/imagePromptModelFamily";
import { debugError } from "../_core/logger";
import { getDb } from "../db";
import { workerJobs } from "../../drizzle/schema";
import { getRedisClient } from "./redis";
import {
  createFeature186VerticalDramaJob,
  isFeature186HardCutoverEnabled,
} from "./feature186VerticalDramaJobAdapter";
import {
  findCanonicalPromptJobByIdempotencyKey,
  listCanonicalPromptJobs,
  readCanonicalPromptJob,
} from "./verticalDramaCanonicalPromptJobs";

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
  frameRole?: "start" | "stop";
  instruction?: string;
  canonicalShotSummary?: string;
  attachShotImage?: boolean;
  imageUrl?: string;
  additionalImageUrls?: string[];
  promptSource?: "shot_synopsis_direct";
  idempotencyKey?: string;
}

export interface VerticalDramaShotPromptJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  frameRole?: "start" | "stop";
}

export interface VerticalDramaShotPromptJobResult {
  prompt: string;
  negativePrompt: string;
  creditsUsed: number;
  usedVision: boolean;
  promptMode?: VdImagePromptModeStamp;
  promptSource?: VdImagePromptSourceStamp;
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
 * entered by the canonical worker, never directly by a browser tRPC call. */
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
  canonicalStatusReader?: CanonicalPromptJobStatusReader;
}

export type CanonicalPromptJobStatus = {
  status: string;
  reason?: string | null;
};

export type CanonicalPromptJobStatusReader = (
  jobIds: readonly string[],
) => Promise<ReadonlyMap<string, CanonicalPromptJobStatus>>;

export interface VerticalDramaShotPromptJobEnqueueDependencies
  extends Partial<VerticalDramaShotPromptJobStoreDependencies> {
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
}

function canonicalRecord(
  snapshot: Awaited<ReturnType<typeof readCanonicalPromptJob>>,
): VerticalDramaShotPromptJobRecord | null {
  if (!snapshot) return null;
  const input = snapshot.input;
  const tenantId = typeof input.tenantId === "string" ? input.tenantId : null;
  const userId = Number(input.userId);
  const seriesId = Number(input.seriesId);
  const episodeId = Number(input.episodeId);
  const shotNumber = Number(input.shotNumber);
  const jobInput = input.input;
  if (
    !tenantId ||
    !Number.isSafeInteger(userId) ||
    !Number.isSafeInteger(seriesId) ||
    !Number.isSafeInteger(episodeId) ||
    !Number.isSafeInteger(shotNumber) ||
    !jobInput ||
    typeof jobInput !== "object" ||
    Array.isArray(jobInput)
  ) {
    return null;
  }
  return {
    jobId: snapshot.jobId,
    tenantId,
    userId,
    seriesId,
    episodeId,
    shotNumber,
    frameRole:
      input.frameRole === "stop" || input.frameRole === "start"
        ? input.frameRole
        : undefined,
    publicUrl: typeof input.publicUrl === "string" ? input.publicUrl : null,
    input: jobInput as VerticalDramaShotPromptJobInput,
    status: snapshot.status,
    result: snapshot.output as VerticalDramaShotPromptJobResult | null,
    error: snapshot.error,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

async function readCanonicalPromptRecord(input: {
  jobId: string;
  owner: VerticalDramaShotPromptJobOwner;
}): Promise<VerticalDramaShotPromptJobRecord | null> {
  return canonicalRecord(
    await readCanonicalPromptJob({
      jobId: input.jobId,
      tenantId: input.owner.tenantId,
      userId: input.owner.userId,
      jobType: "vertical_drama.shot_prompt",
    }),
  );
}

async function enqueueCanonicalPromptJob(
  payload: VerticalDramaShotPromptJobPayload,
): Promise<{ jobId: string; status: VerticalDramaShotPromptJobStatus; deduped: boolean }> {
  const owner = payload;
  const idempotencyKey = payload.input.idempotencyKey;
  if (idempotencyKey) {
    const prior = await findCanonicalPromptJobByIdempotencyKey({
      tenantId: owner.tenantId,
      userId: owner.userId,
      jobType: "vertical_drama.shot_prompt",
      idempotencyKey,
    });
    const priorRecord = canonicalRecord(prior);
    if (priorRecord && ownerMatches(priorRecord, owner)) {
      return { jobId: priorRecord.jobId, status: priorRecord.status, deduped: true };
    }
  }

  const activeRows = await listCanonicalPromptJobs({
    tenantId: owner.tenantId,
    userId: owner.userId,
    jobType: "vertical_drama.shot_prompt",
    activeOnly: true,
  });
  const active = activeRows
    .map(canonicalRecord)
    .find(record => record && ownerMatches(record, owner));
  if (active) return { jobId: active.jobId, status: active.status, deduped: true };

  const requestedJobId = randomUUID();
  const jobId = await createFeature186VerticalDramaJob({
    jobId: requestedJobId,
    tenantId: payload.tenantId,
    userId: payload.userId,
    jobType: "vertical_drama.shot_prompt",
    executionClass: "long",
    idempotencyKey,
    payload: {
      ...payload,
      jobId: requestedJobId,
      status: "queued",
    } as unknown as Record<string, unknown>,
  });
  const record = await readCanonicalPromptRecord({ jobId, owner });
  if (!record) {
    throw new Error(`CANONICAL_SHOT_PROMPT_JOB_NOT_FOUND:${jobId}`);
  }
  return {
    jobId,
    status: record.status,
    deduped: jobId !== requestedJobId,
  };
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
    canonicalStatusReader:
      dependencies?.canonicalStatusReader ??
      (process.env.NODE_ENV !== "test"
        ? readCanonicalPromptJobStatuses
        : undefined),
  };
}

async function readCanonicalPromptJobStatuses(
  jobIds: readonly string[],
): Promise<ReadonlyMap<string, CanonicalPromptJobStatus>> {
  if (jobIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({
      id: workerJobs.id,
      status: workerJobs.status,
      failureReason: workerJobs.failureReason,
      errorCode: workerJobs.errorCode,
      errorMessage: workerJobs.errorMessage,
    })
    .from(workerJobs)
    .where(inArray(workerJobs.id, [...jobIds]));
  return new Map(
    rows.map(row => [
      row.id,
      {
        status: row.status,
        reason:
          row.failureReason ?? row.errorMessage ?? row.errorCode ?? undefined,
      },
    ]),
  );
}

function recordKey(jobId: string): string {
  return `vd:shot-prompt-job:${jobId}`;
}

function activePointerKey(
  owner: VerticalDramaShotPromptJobOwner,
  frameRole: "start" | "stop" = "start",
): string {
  return [
    "vd:shot-prompt-job:active",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.episodeId,
    owner.shotNumber,
    frameRole,
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
    payloadRole(owner),
    digest,
  ].join(":");
}

function payloadRole(
  value: Pick<VerticalDramaShotPromptJobPayload, "input"> | VerticalDramaShotPromptJobOwner,
): "start" | "stop" {
  return "input" in value ? value.input.frameRole ?? "start" : value.frameRole ?? "start";
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
    record.shotNumber === owner.shotNumber &&
    payloadRole(record) === payloadRole(owner)
  );
}

function isActive(status: VerticalDramaShotPromptJobStatus): boolean {
  return status === "queued" || status === "running";
}

function isCanonicalTerminalStatus(status: string): boolean {
  return [
    "completed",
    "succeeded",
    "failed",
    "canceled",
    "cancelled",
    "expired",
  ].includes(status);
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

async function reconcileCanonicalActiveJob(
  record: VerticalDramaShotPromptJobRecord,
  deps: VerticalDramaShotPromptJobStoreDependencies,
): Promise<VerticalDramaShotPromptJobRecord> {
  if (!deps.canonicalStatusReader || !isActive(record.status)) return record;

  let canonical: CanonicalPromptJobStatus | undefined;
  try {
    canonical = (await deps.canonicalStatusReader([record.jobId])).get(
      record.jobId,
    );
  } catch (error) {
    debugError(
      "verticalDramaShotPromptJobs",
      `Unable to reconcile canonical worker status for ${record.jobId}`,
      error,
    );
    return record;
  }
  if (!canonical || !isCanonicalTerminalStatus(canonical.status)) return record;

  const succeeded =
    canonical.status === "completed" || canonical.status === "succeeded";
  const reconciled: VerticalDramaShotPromptJobRecord = {
    ...record,
    status: succeeded ? "succeeded" : "failed",
    result: succeeded ? record.result : null,
    error: succeeded
      ? null
      : canonical.reason || `Canonical worker job ended with status=${canonical.status}`,
    updatedAt: new Date(deps.now()).toISOString(),
  };
  await writeRecord(reconciled, deps).catch(() => {});
  await clearPointers(reconciled, deps);
  return reconciled;
}

export async function getVerticalDramaShotPromptJobStatus(
  jobId: string,
  owner: VerticalDramaShotPromptJobOwner,
  dependencies?: Partial<VerticalDramaShotPromptJobStoreDependencies>,
): Promise<VerticalDramaShotPromptJobRecord | null> {
  if (isFeature186HardCutoverEnabled()) {
    return readCanonicalPromptRecord({ jobId, owner });
  }
  const deps = resolveDependencies(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record || !ownerMatches(record, owner)) return null;
  return reconcileCanonicalActiveJob(record, deps);
}

export async function getActiveVerticalDramaShotPromptJob(
  owner: VerticalDramaShotPromptJobOwner,
  dependencies?: Partial<VerticalDramaShotPromptJobStoreDependencies>,
): Promise<VerticalDramaShotPromptJobRecord | null> {
  if (isFeature186HardCutoverEnabled()) {
    const rows = await listCanonicalPromptJobs({
      tenantId: owner.tenantId,
      userId: owner.userId,
      jobType: "vertical_drama.shot_prompt",
      activeOnly: true,
    });
    return (
      rows
        .map(canonicalRecord)
        .find(record => record && ownerMatches(record, owner)) ?? null
    );
  }
  const deps = resolveDependencies(dependencies);
  const pointer = activePointerKey(owner, payloadRole(owner));
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
  if (isFeature186HardCutoverEnabled()) {
    return enqueueCanonicalPromptJob(payload);
  }
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

  const activePointer = activePointerKey(payload, payloadRole(payload));
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
      if (isFeature186HardCutoverEnabled()) {
        await createFeature186VerticalDramaJob({
          jobId,
          tenantId: payload.tenantId,
          userId: payload.userId,
          jobType: "vertical_drama.shot_prompt",
          executionClass: "long",
          payload: record as unknown as Record<string, unknown>,
        });
      } else {
        await (dependencies?.enqueueBullmqJob ?? defaultEnqueueBullmqJob)(jobId);
      }
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

/**
 * Canonical worker_jobs execution path. It deliberately does not read or
 * write the retired Redis projection; worker_jobs owns lifecycle and result.
 */
export async function executeVerticalDramaShotPromptJobExecutor(
  jobId: string,
  payload: VerticalDramaShotPromptJobPayload,
  executor: VerticalDramaShotPromptJobExecutor,
): Promise<VerticalDramaShotPromptJobResult> {
  const executionToken = randomUUID();
  activeWorkerExecutions.set(jobId, executionToken);
  try {
    return await executor(payload, {
      jobId,
      token: executionToken,
    });
  } finally {
    activeWorkerExecutions.delete(jobId);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  throw new Error("LEGACY_QUEUE_RETIRED: enqueue through worker_jobs");
}

export async function initVerticalDramaShotPromptJobsQueue(): Promise<void>  {
  // Execution and recovery are owned by the canonical worker_jobs control plane.
}

export async function closeVerticalDramaShotPromptJobsQueue(): Promise<void>  {
  // Execution and recovery are owned by the canonical worker_jobs control plane.
}
