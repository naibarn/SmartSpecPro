import { createHash, randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { debugError } from "../_core/logger";
import { getDb } from "../db";
import { workerJobs } from "../../drizzle/schema";
import { isTransientGenerationError } from "../../shared/transientGenerationError";
import { getRedisClient } from "./redis";
import {
  createFeature186VerticalDramaJob,
  isFeature186HardCutoverEnabled,
} from "./feature186VerticalDramaJobAdapter";
import { publishLegacyBullMqJob } from "./jobLegacyTransportAdapters";
import {
  findCanonicalPromptJobByIdempotencyKey,
  listCanonicalPromptJobs,
  readCanonicalPromptJob,
  type CanonicalPromptJobSnapshot,
} from "./verticalDramaCanonicalPromptJobs";

export const VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_JOBS_QUEUE =
  "vertical_drama_shot_video_prompt_jobs";

const RECORD_TTL_SECONDS = 6 * 60 * 60;
const POINTER_TTL_SECONDS = 6 * 60 * 60;
const SEQUENCE_TTL_SECONDS = 24 * 60 * 60;
const WORKER_CONCURRENCY = 3;
const TURN_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
// Vision + LLM prompt authoring can exceed BullMQ's default lock duration.
// Keep the worker lease alive long enough that healthy jobs are not marked
// stalled while their durable Redis record remains "running".
const BULLMQ_LOCK_DURATION_MS = 35 * 60 * 1000;
const STALE_ACTIVE_JOB_MS = 30 * 60 * 1000;
const MAX_ERROR_CHARS = 2_000;
const MAX_TRANSIENT_EXECUTOR_RETRIES = 3;
const TRANSIENT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000] as const;

export type VerticalDramaShotVideoPromptJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface VerticalDramaShotVideoPromptJobInput {
  seriesId: string;
  episodeId: string;
  shotNumber: number;
  nativeAudioEnabled?: boolean;
  instruction?: string;
  attachShotImage?: boolean;
  additionalImageUrls?: string[];
  qualityLoop?: boolean;
  idempotencyKey?: string;
  /** Additive variant partition; omitted means the existing Legacy job. */
  variantId?: "legacy" | "enhanced";
}

export interface VerticalDramaShotVideoPromptJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  variantId?: "legacy" | "enhanced";
}

export interface VerticalDramaShotVideoPromptJobResult {
  prompt: string;
  negativeMotionPrompt?: string;
  dialogue?: unknown;
  creditsUsed: number;
  usedVision: boolean;
  audioDirection?: unknown;
  promptModelTarget?: unknown;
  promptQuality?: unknown;
  /** Non-blocking policy advisories retained for the prompt review surface. */
  safetyWarnings?: string[];
  variantId?: "legacy" | "enhanced";
  enhancedVariant?: unknown;
}

export interface VerticalDramaShotVideoPromptJobPayload extends VerticalDramaShotVideoPromptJobOwner {
  publicUrl: string | null;
  input: VerticalDramaShotVideoPromptJobInput;
}

export interface VerticalDramaShotVideoPromptJobRecord extends VerticalDramaShotVideoPromptJobPayload {
  jobId: string;
  sequence: number;
  requestFingerprint: string;
  status: VerticalDramaShotVideoPromptJobStatus;
  result: VerticalDramaShotVideoPromptJobResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerticalDramaShotVideoPromptJobSummary {
  jobId: string;
  shotNumber: number;
  variantId?: "legacy" | "enhanced";
  status: VerticalDramaShotVideoPromptJobStatus;
  result: VerticalDramaShotVideoPromptJobResult | null;
  error: string | null;
  queuePosition: number;
  activeJobCount: number;
  createdAt: string;
  updatedAt: string;
}

export type VerticalDramaShotVideoPromptJobExecutor = (
  payload: VerticalDramaShotVideoPromptJobPayload,
  execution: { jobId: string; token: string }
) => Promise<VerticalDramaShotVideoPromptJobResult>;

const activeWorkerExecutions = new Map<string, string>();

export function isVerticalDramaShotVideoPromptWorkerExecution(
  jobId: string,
  token: string
): boolean {
  return activeWorkerExecutions.get(jobId) === token;
}

export class VerticalDramaShotVideoPromptConflictError extends Error {
  readonly code = "CONFLICT";

  constructor() {
    super("A different video-prompt request is already active for this shot");
    this.name = "VerticalDramaShotVideoPromptConflictError";
  }
}

export interface VerticalDramaShotVideoPromptJobRedisAdapter {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    seconds: number
  ): Promise<unknown>;
  setNx(key: string, value: string, seconds: number): Promise<boolean>;
  incr(key: string): Promise<number>;
  del(key: string): Promise<unknown>;
  compareDelete(key: string, expectedValue: string): Promise<boolean>;
}

export interface VerticalDramaShotVideoPromptJobStoreDependencies {
  redis: VerticalDramaShotVideoPromptJobRedisAdapter;
  now: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  heartbeat?: () => Promise<void>;
  canonicalStatusReader?: CanonicalPromptJobStatusReader;
}

export type CanonicalPromptJobStatus = {
  status: string;
  reason?: string | null;
};

export type CanonicalPromptJobStatusReader = (
  jobIds: readonly string[]
) => Promise<ReadonlyMap<string, CanonicalPromptJobStatus>>;

export interface VerticalDramaShotVideoPromptJobEnqueueDependencies extends Partial<VerticalDramaShotVideoPromptJobStoreDependencies> {
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
}

function canonicalRecord(
  snapshot: CanonicalPromptJobSnapshot | null,
): VerticalDramaShotVideoPromptJobRecord | null {
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
  const variantId =
    input.variantId === "enhanced" || input.variantId === "legacy"
      ? input.variantId
      : undefined;
  return {
    jobId: snapshot.jobId,
    tenantId,
    userId,
    seriesId,
    episodeId,
    shotNumber,
    ...(variantId ? { variantId } : {}),
    publicUrl: typeof input.publicUrl === "string" ? input.publicUrl : null,
    input: jobInput as VerticalDramaShotVideoPromptJobInput,
    sequence: 0,
    requestFingerprint: requestFingerprint(
      jobInput as VerticalDramaShotVideoPromptJobInput,
    ),
    status: snapshot.status,
    result: snapshot.output as VerticalDramaShotVideoPromptJobResult | null,
    error: snapshot.error,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

async function readCanonicalVideoRecord(input: {
  jobId: string;
  owner: VerticalDramaShotVideoPromptJobOwner;
}): Promise<VerticalDramaShotVideoPromptJobRecord | null> {
  return canonicalRecord(
    await readCanonicalPromptJob({
      jobId: input.jobId,
      tenantId: input.owner.tenantId,
      userId: input.owner.userId,
      jobType: "vertical_drama.shot_video_prompt",
    }),
  );
}

async function toCanonicalSummary(
  record: VerticalDramaShotVideoPromptJobRecord,
): Promise<VerticalDramaShotVideoPromptJobSummary> {
  const active = (await listCanonicalPromptJobs({
    tenantId: record.tenantId,
    userId: record.userId,
    jobType: "vertical_drama.shot_video_prompt",
    activeOnly: true,
  }))
    .map(canonicalRecord)
    .filter((item): item is VerticalDramaShotVideoPromptJobRecord => Boolean(item));
  const order = active.findIndex(item => item.jobId === record.jobId);
  return {
    jobId: record.jobId,
    shotNumber: record.shotNumber,
    ...(recordVariantId(record) === "enhanced"
      ? { variantId: "enhanced" as const }
      : {}),
    status: record.status,
    result: record.result,
    error: record.error,
    queuePosition: order < 0 ? 0 : active.length - order,
    activeJobCount: active.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function enqueueCanonicalVideoPromptJob(
  payload: VerticalDramaShotVideoPromptJobPayload,
): Promise<VerticalDramaShotVideoPromptJobSummary & { deduplicated: boolean }> {
  const idempotencyKey = payload.input.idempotencyKey;
  if (idempotencyKey) {
    const prior = await findCanonicalPromptJobByIdempotencyKey({
      tenantId: payload.tenantId,
      userId: payload.userId,
      jobType: "vertical_drama.shot_video_prompt",
      idempotencyKey,
    });
    const priorRecord = canonicalRecord(prior);
    if (priorRecord && ownerMatches(priorRecord, payload)) {
      return { ...(await toCanonicalSummary(priorRecord)), deduplicated: true };
    }
  }

  const active = (await listCanonicalPromptJobs({
    tenantId: payload.tenantId,
    userId: payload.userId,
    jobType: "vertical_drama.shot_video_prompt",
    activeOnly: true,
  }))
    .map(canonicalRecord)
    .filter((item): item is VerticalDramaShotVideoPromptJobRecord => Boolean(item));
  const sameShot = active.find(
    record =>
      record.shotNumber === payload.shotNumber,
  );
  if (sameShot) {
    if (sameShot.requestFingerprint !== requestFingerprint(payload.input)) {
      throw new VerticalDramaShotVideoPromptConflictError();
    }
    return { ...(await toCanonicalSummary(sameShot)), deduplicated: true };
  }

  const requestedJobId = randomUUID();
  const jobId = await createFeature186VerticalDramaJob({
    jobId: requestedJobId,
    tenantId: payload.tenantId,
    userId: payload.userId,
    jobType: "vertical_drama.shot_video_prompt",
    executionClass: "long",
    idempotencyKey,
    payload: {
      ...payload,
      jobId: requestedJobId,
      status: "queued",
    } as unknown as Record<string, unknown>,
  });
  const record = await readCanonicalVideoRecord({
    jobId,
    owner: payload,
  });
  if (!record) {
    throw new Error(`CANONICAL_VIDEO_PROMPT_JOB_NOT_FOUND:${jobId}`);
  }
  return { ...(await toCanonicalSummary(record)), deduplicated: jobId !== requestedJobId };
}

function defaultRedisAdapter(): VerticalDramaShotVideoPromptJobRedisAdapter {
  const client = getRedisClient();
  return {
    get: key => client.get(key),
    set: (key, value, mode, seconds) => client.set(key, value, mode, seconds),
    setNx: async (key, value, seconds) =>
      (await client.set(key, value, "EX", seconds, "NX")) === "OK",
    incr: key => client.incr(key),
    del: key => client.del(key),
    compareDelete: async (key, expectedValue) => {
      const result = await client.eval(
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
  dependencies?: Partial<VerticalDramaShotVideoPromptJobStoreDependencies>
): VerticalDramaShotVideoPromptJobStoreDependencies {
  return {
    redis: dependencies?.redis ?? defaultRedisAdapter(),
    now: dependencies?.now ?? Date.now,
    sleep:
      dependencies?.sleep ??
      (milliseconds =>
        new Promise(resolve => setTimeout(resolve, milliseconds))),
    canonicalStatusReader:
      dependencies?.canonicalStatusReader ??
      (process.env.NODE_ENV !== "test"
        ? readCanonicalPromptJobStatuses
        : undefined),
  };
}

async function readCanonicalPromptJobStatuses(
  jobIds: readonly string[]
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
    ])
  );
}

function scopeKey(
  owner: Pick<
    VerticalDramaShotVideoPromptJobOwner,
    "tenantId" | "userId" | "seriesId" | "episodeId"
  >
): string {
  return [
    "vd:shot-video-prompt-job:scope",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.episodeId,
  ].join(":");
}

function recordKey(jobId: string): string {
  return `vd:shot-video-prompt-job:${jobId}`;
}

/** One active prompt-authoring job is allowed per shot, across both variants. */
function activePointerKey(
  owner: Pick<
    VerticalDramaShotVideoPromptJobOwner,
    "tenantId" | "userId" | "seriesId" | "episodeId" | "shotNumber"
  >
): string {
  return [
    "vd:shot-video-prompt-job:active",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.episodeId,
    owner.shotNumber,
  ].join(":");
}

/** Compatibility key for records written before the cross-variant lock. */
function variantScopedActivePointerKey(
  owner: VerticalDramaShotVideoPromptJobOwner
): string {
  return [
    "vd:shot-video-prompt-job:active",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.episodeId,
    owner.shotNumber,
    owner.variantId ?? "legacy",
  ].join(":");
}

function sequenceKey(
  owner: Pick<
    VerticalDramaShotVideoPromptJobOwner,
    "tenantId" | "userId" | "seriesId" | "episodeId"
  >
): string {
  return `${scopeKey(owner)}:sequence`;
}

function nextSequenceKey(
  owner: Pick<
    VerticalDramaShotVideoPromptJobOwner,
    "tenantId" | "userId" | "seriesId" | "episodeId"
  >
): string {
  return `${scopeKey(owner)}:next`;
}

function sequenceJobKey(
  owner: Pick<
    VerticalDramaShotVideoPromptJobOwner,
    "tenantId" | "userId" | "seriesId" | "episodeId"
  >,
  sequence: number
): string {
  return `${scopeKey(owner)}:job:${sequence}`;
}

function episodeLockKey(
  owner: Pick<
    VerticalDramaShotVideoPromptJobOwner,
    "tenantId" | "userId" | "seriesId" | "episodeId"
  >
): string {
  return `${scopeKey(owner)}:lock`;
}

function idempotencyPointerKey(
  owner: VerticalDramaShotVideoPromptJobOwner,
  idempotencyKey: string
): string {
  const digest = createHash("sha256").update(idempotencyKey).digest("hex");
  return [
    "vd:shot-video-prompt-job:idempotency",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.episodeId,
    owner.shotNumber,
    owner.variantId ?? "legacy",
    digest,
  ].join(":");
}

function requestFingerprint(
  input: VerticalDramaShotVideoPromptJobInput
): string {
  const canonical = JSON.stringify({
    seriesId: input.seriesId,
    episodeId: input.episodeId,
    shotNumber: input.shotNumber,
    nativeAudioEnabled: input.nativeAudioEnabled ?? null,
    instruction: input.instruction?.trim() ?? null,
    attachShotImage: input.attachShotImage ?? true,
    additionalImageUrls: input.additionalImageUrls ?? [],
    qualityLoop: input.qualityLoop ?? null,
    variantId: input.variantId ?? "legacy",
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Enhanced jobs created before variantId was promoted to the job owner were
 * persisted with the variant only inside input. Keep those records readable
 * while all new jobs use the top-level owner field.
 */
function recordVariantId(
  record: VerticalDramaShotVideoPromptJobRecord
): "legacy" | "enhanced" {
  return record.variantId ?? record.input.variantId ?? "legacy";
}

function ownerMatches(
  record: VerticalDramaShotVideoPromptJobRecord,
  owner: VerticalDramaShotVideoPromptJobOwner
): boolean {
  return (
    record.tenantId === owner.tenantId &&
    record.userId === owner.userId &&
    record.seriesId === owner.seriesId &&
    record.episodeId === owner.episodeId &&
    record.shotNumber === owner.shotNumber &&
    recordVariantId(record) === (owner.variantId ?? "legacy")
  );
}

function isActive(status: VerticalDramaShotVideoPromptJobStatus): boolean {
  return status === "queued" || status === "running";
}

const STALE_JOB_ERROR =
  "Background job became stale; it was not retried automatically.";

function isStaleActiveJob(
  record: VerticalDramaShotVideoPromptJobRecord,
  now: number
): boolean {
  const updatedAtMs = Date.parse(record.updatedAt);
  return (
    isActive(record.status) &&
    Number.isFinite(updatedAtMs) &&
    now - updatedAtMs > STALE_ACTIVE_JOB_MS
  );
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "Failed to generate the video prompt").slice(
    0,
    MAX_ERROR_CHARS
  );
}

function retryDelayMs(error: unknown, retryAttempt: number): number {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const retryAfterSeconds = Number(
    text.match(/(?:retry[- ]after|try again in)\s+(\d+(?:\.\d+)?)\s*seconds?/i)?.[1]
  );
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(60_000, Math.max(1_000, Math.ceil(retryAfterSeconds * 1_000)));
  }
  return TRANSIENT_RETRY_DELAYS_MS[
    Math.min(retryAttempt, TRANSIENT_RETRY_DELAYS_MS.length - 1)
  ];
}

async function readRecord(
  jobId: string,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<VerticalDramaShotVideoPromptJobRecord | null> {
  const raw = await deps.redis.get(recordKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerticalDramaShotVideoPromptJobRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VerticalDramaShotVideoPromptJobRecord,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<void> {
  await deps.redis.set(
    recordKey(record.jobId),
    JSON.stringify(record),
    "EX",
    RECORD_TTL_SECONDS
  );
}

async function clearPointers(
  record: VerticalDramaShotVideoPromptJobRecord,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<void> {
  await Promise.all([
    deps.redis.compareDelete(activePointerKey(record), record.jobId).catch(() => false),
    deps.redis
      .compareDelete(variantScopedActivePointerKey(record), record.jobId)
      .catch(() => false),
  ]);
}

async function setNextSequence(
  owner: VerticalDramaShotVideoPromptJobOwner,
  sequence: number,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<void> {
  await deps.redis.set(
    nextSequenceKey(owner),
    String(sequence),
    "EX",
    SEQUENCE_TTL_SECONDS
  );
}

/** Advance past terminal/missing jobs without skipping an active predecessor. */
async function advanceNextSequence(
  owner: VerticalDramaShotVideoPromptJobOwner,
  minimumSequence: number,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<void> {
  let next = Math.max(
    1,
    Number((await deps.redis.get(nextSequenceKey(owner))) ?? 1)
  );
  const last = Number((await deps.redis.get(sequenceKey(owner))) ?? next - 1);
  while (next <= last) {
    const jobId = await deps.redis.get(sequenceJobKey(owner, next));
    if (jobId) {
      const record = await readRecord(jobId, deps);
      if (record && isActive(record.status)) break;
    }
    next += 1;
  }
  await setNextSequence(owner, Math.max(next, minimumSequence), deps);
}

async function getQueuePosition(
  record: VerticalDramaShotVideoPromptJobRecord,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<{ queuePosition: number; activeJobCount: number }> {
  const next = Number(
    (await deps.redis.get(nextSequenceKey(record))) ?? record.sequence
  );
  const last = Number(
    (await deps.redis.get(sequenceKey(record))) ?? record.sequence
  );
  const activeJobCount = Math.max(0, last - next + 1);
  return {
    queuePosition: isActive(record.status)
      ? Math.max(1, record.sequence - next + 1)
      : 0,
    activeJobCount,
  };
}

async function toSummary(
  record: VerticalDramaShotVideoPromptJobRecord,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<VerticalDramaShotVideoPromptJobSummary> {
  const variantId = recordVariantId(record);
  return {
    jobId: record.jobId,
    shotNumber: record.shotNumber,
    ...(variantId === "enhanced" ? { variantId } : {}),
    status: record.status,
    result: record.result,
    error: record.error,
    ...(await getQueuePosition(record, deps)),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getVerticalDramaShotVideoPromptJobStatus(
  jobId: string,
  owner: VerticalDramaShotVideoPromptJobOwner,
  dependencies?: Partial<VerticalDramaShotVideoPromptJobStoreDependencies>
): Promise<VerticalDramaShotVideoPromptJobSummary | null> {
  if (isFeature186HardCutoverEnabled()) {
    const record = await readCanonicalVideoRecord({ jobId, owner });
    return record ? toCanonicalSummary(record) : null;
  }
  const deps = resolveDependencies(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record || !ownerMatches(record, owner)) return null;
  // A worker/process can disappear without emitting BullMQ's failed event.
  // Reconcile that orphan on the read path so the browser cannot poll an
  // active status forever and later shots cannot remain blocked behind it.
  const canonicalReconciled = await reconcileCanonicalActiveJob(record, deps);
  const reconciled = await reconcileStaleActiveJob(canonicalReconciled, deps);
  return toSummary(reconciled, deps);
}

export async function getActiveVerticalDramaShotVideoPromptJobs(
  owner: Pick<
    VerticalDramaShotVideoPromptJobOwner,
    "tenantId" | "userId" | "seriesId" | "episodeId"
  >,
  dependencies?: Partial<VerticalDramaShotVideoPromptJobStoreDependencies>
): Promise<VerticalDramaShotVideoPromptJobSummary[]> {
  if (isFeature186HardCutoverEnabled()) {
    const records = (await listCanonicalPromptJobs({
      tenantId: owner.tenantId,
      userId: owner.userId,
      jobType: "vertical_drama.shot_video_prompt",
      activeOnly: true,
    }))
      .map(canonicalRecord)
      .filter((item): item is VerticalDramaShotVideoPromptJobRecord => Boolean(item));
    return Promise.all(records.map(toCanonicalSummary));
  }
  const deps = resolveDependencies(dependencies);
  const next = Number((await deps.redis.get(nextSequenceKey(owner))) ?? 1);
  const last = Number((await deps.redis.get(sequenceKey(owner))) ?? 0);
  const activeRecords: VerticalDramaShotVideoPromptJobRecord[] = [];
  for (
    let sequence = next;
    sequence <= last && sequence < next + 100;
    sequence += 1
  ) {
    const jobId = await deps.redis.get(sequenceJobKey(owner, sequence));
    if (!jobId) continue;
    const record = await readRecord(jobId, deps);
    if (
      record &&
      ownerMatches(record, {
        ...owner,
        shotNumber: record.shotNumber,
        variantId: recordVariantId(record),
      }) &&
      isActive(record.status)
    ) {
      activeRecords.push(record);
    }
  }

  let canonicalStatuses: ReadonlyMap<string, CanonicalPromptJobStatus> =
    new Map();
  if (deps.canonicalStatusReader && activeRecords.length > 0) {
    try {
      canonicalStatuses = await deps.canonicalStatusReader(
        activeRecords.map(record => record.jobId)
      );
    } catch (error) {
      debugError(
        "verticalDramaShotVideoPromptJobs",
        `Unable to batch-reconcile canonical worker statuses for episode ${owner.episodeId}`,
        error
      );
    }
  }

  const jobs: VerticalDramaShotVideoPromptJobSummary[] = [];
  for (const record of activeRecords) {
    // The active-jobs query is also a recovery boundary: a page refresh can
    // otherwise keep rendering a stale Redis pointer indefinitely.
    const canonicalReconciled = await applyCanonicalStatusToActiveJob(
      record,
      canonicalStatuses.get(record.jobId),
      deps
    );
    const reconciled = await reconcileStaleActiveJob(canonicalReconciled, deps);
    if (isActive(reconciled.status)) {
      jobs.push(await toSummary(reconciled, deps));
    }
  }
  return jobs;
}

export async function getActiveVerticalDramaShotVideoPromptJob(
  owner: VerticalDramaShotVideoPromptJobOwner,
  dependencies?: Partial<VerticalDramaShotVideoPromptJobStoreDependencies>
): Promise<VerticalDramaShotVideoPromptJobSummary | null> {
  if (isFeature186HardCutoverEnabled()) {
    const records = (await listCanonicalPromptJobs({
      tenantId: owner.tenantId,
      userId: owner.userId,
      jobType: "vertical_drama.shot_video_prompt",
      activeOnly: true,
    }))
      .map(canonicalRecord)
      .filter((item): item is VerticalDramaShotVideoPromptJobRecord => Boolean(item));
    const record = records.find(item => ownerMatches(item, owner));
    return record ? toCanonicalSummary(record) : null;
  }
  const deps = resolveDependencies(dependencies);
  const jobId =
    (await deps.redis.get(activePointerKey(owner))) ??
    (await deps.redis.get(variantScopedActivePointerKey({ ...owner, variantId: "legacy" }))) ??
    (await deps.redis.get(variantScopedActivePointerKey({ ...owner, variantId: "enhanced" })));
  if (!jobId) return null;
  const record = await readRecord(jobId, deps);
  const sameShot = record
    ? ownerMatches(record, { ...owner, variantId: recordVariantId(record) })
    : false;
  if (!record || !sameShot || !isActive(record.status)) {
    await Promise.all([
      deps.redis.compareDelete(activePointerKey(owner), jobId).catch(() => false),
      deps.redis
        .compareDelete(
          variantScopedActivePointerKey({
            ...owner,
            variantId: record ? recordVariantId(record) : "legacy",
          }),
          jobId,
        )
        .catch(() => false),
    ]);
    return null;
  }
  return toSummary(record, deps);
}

export async function enqueueVerticalDramaShotVideoPromptJob(
  payload: VerticalDramaShotVideoPromptJobPayload,
  dependencies?: VerticalDramaShotVideoPromptJobEnqueueDependencies
): Promise<VerticalDramaShotVideoPromptJobSummary & { deduplicated: boolean }> {
  if (isFeature186HardCutoverEnabled()) {
    return enqueueCanonicalVideoPromptJob(payload);
  }
  const deps = resolveDependencies(dependencies);
  const fingerprint = requestFingerprint(payload.input);
  const idempotencyPointer = payload.input.idempotencyKey
    ? idempotencyPointerKey(payload, payload.input.idempotencyKey)
    : null;

  if (idempotencyPointer) {
    const priorJobId = await deps.redis.get(idempotencyPointer);
    if (priorJobId) {
      const prior = await readRecord(priorJobId, deps);
      if (prior && ownerMatches(prior, payload)) {
        return { ...(await toSummary(prior, deps)), deduplicated: true };
      }
      await deps.redis
        .compareDelete(idempotencyPointer, priorJobId)
        .catch(() => false);
    }
  }

  const activePointer = activePointerKey(payload);
  const activeCandidates = [
    activePointer,
    variantScopedActivePointerKey(payload),
    variantScopedActivePointerKey({
      ...payload,
      variantId: payload.variantId === "enhanced" ? "legacy" : "enhanced",
    }),
  ];
  for (const candidatePointer of [...new Set(activeCandidates)]) {
    const existingJobId = await deps.redis.get(candidatePointer);
    if (!existingJobId) continue;
    const existing = await readRecord(existingJobId, deps);
    if (existing && isActive(existing.status)) {
      if (!ownerMatches(existing, payload) || existing.requestFingerprint !== fingerprint) {
        throw new VerticalDramaShotVideoPromptConflictError();
      }
      return { ...(await toSummary(existing, deps)), deduplicated: true };
    }
    await deps.redis.compareDelete(candidatePointer, existingJobId).catch(() => false);
  }

  const jobId = randomUUID();
  const sequence = await deps.redis.incr(sequenceKey(payload));
  await deps.redis.setNx(nextSequenceKey(payload), "1", SEQUENCE_TTL_SECONDS);
  const nowIso = new Date(deps.now()).toISOString();
  const record: VerticalDramaShotVideoPromptJobRecord = {
    ...payload,
    jobId,
    sequence,
    requestFingerprint: fingerprint,
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
    POINTER_TTL_SECONDS
  );
  if (!claimed) {
    const winnerId = await deps.redis.get(activePointer);
    const winner = winnerId ? await readRecord(winnerId, deps) : null;
    await deps.redis.del(recordKey(jobId));
    if (winner && isActive(winner.status)) {
      if (!ownerMatches(winner, payload) || winner.requestFingerprint !== fingerprint) {
        throw new VerticalDramaShotVideoPromptConflictError();
      }
      return { ...(await toSummary(winner, deps)), deduplicated: true };
    }
    throw new Error("Unable to reserve the video prompt job slot — retry");
  }

  await deps.redis.set(
    sequenceJobKey(payload, sequence),
    jobId,
    "EX",
    SEQUENCE_TTL_SECONDS
  );
  if (idempotencyPointer) {
    await deps.redis.set(idempotencyPointer, jobId, "EX", RECORD_TTL_SECONDS);
  }

  try {
    if (isFeature186HardCutoverEnabled()) {
      await createFeature186VerticalDramaJob({
        jobId,
        tenantId: payload.tenantId,
        userId: payload.userId,
        jobType: "vertical_drama.shot_video_prompt",
        executionClass: "long",
        payload: record as unknown as Record<string, unknown>,
      });
    } else {
      await (dependencies?.enqueueBullmqJob ?? defaultEnqueueBullmqJob)(jobId);
    }
  } catch (error) {
    const failed: VerticalDramaShotVideoPromptJobRecord = {
      ...record,
      status: "failed",
      error: boundedError(error),
      updatedAt: new Date(deps.now()).toISOString(),
    };
    await writeRecord(failed, deps);
    await clearPointers(failed, deps);
    debugError(
      "verticalDramaShotVideoPromptJobs",
      `Failed to enqueue video prompt job ${jobId}`,
      error
    );
    return { ...(await toSummary(failed, deps)), deduplicated: false };
  }

  return { ...(await toSummary(record, deps)), deduplicated: false };
}

async function markTerminalAndAdvance(
  record: VerticalDramaShotVideoPromptJobRecord,
  status: "succeeded" | "failed",
  result: VerticalDramaShotVideoPromptJobResult | null,
  error: string | null,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<void> {
  await writeRecord(
    {
      ...record,
      status,
      result,
      error,
      updatedAt: new Date(deps.now()).toISOString(),
    },
    deps
  );
  await advanceNextSequence(record, record.sequence + 1, deps);
  await clearPointers(record, deps);
}

async function reconcileStaleActiveJob(
  record: VerticalDramaShotVideoPromptJobRecord,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<VerticalDramaShotVideoPromptJobRecord> {
  if (!isStaleActiveJob(record, deps.now())) return record;

  await markTerminalAndAdvance(record, "failed", null, STALE_JOB_ERROR, deps);
  return {
    ...record,
    status: "failed",
    result: null,
    error: STALE_JOB_ERROR,
    updatedAt: new Date(deps.now()).toISOString(),
  };
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

async function applyCanonicalStatusToActiveJob(
  record: VerticalDramaShotVideoPromptJobRecord,
  canonical: CanonicalPromptJobStatus | undefined,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies,
): Promise<VerticalDramaShotVideoPromptJobRecord> {
  if (!isActive(record.status)) return record;

  if (!canonical || !isCanonicalTerminalStatus(canonical.status)) return record;

  const succeeded =
    canonical.status === "completed" || canonical.status === "succeeded";
  const error = succeeded
    ? null
    : canonical.reason || `Canonical worker job ended with status=${canonical.status}`;
  await markTerminalAndAdvance(
    record,
    succeeded ? "succeeded" : "failed",
    null,
    error,
    deps
  );
  return {
    ...record,
    status: succeeded ? "succeeded" : "failed",
    result: null,
    error,
    updatedAt: new Date(deps.now()).toISOString(),
  };
}

async function reconcileCanonicalActiveJob(
  record: VerticalDramaShotVideoPromptJobRecord,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<VerticalDramaShotVideoPromptJobRecord> {
  if (!deps.canonicalStatusReader || !isActive(record.status)) return record;

  let canonical: CanonicalPromptJobStatus | undefined;
  try {
    canonical = (await deps.canonicalStatusReader([record.jobId])).get(
      record.jobId
    );
  } catch (error) {
    debugError(
      "verticalDramaShotVideoPromptJobs",
      `Unable to reconcile canonical worker status for ${record.jobId}`,
      error
    );
    return record;
  }
  return applyCanonicalStatusToActiveJob(record, canonical, deps);
}

/** Reconcile BullMQ terminal failures with the durable Redis job record. */
export async function recoverVerticalDramaShotVideoPromptJob(
  jobId: string,
  error: string,
  dependencies?: Partial<VerticalDramaShotVideoPromptJobStoreDependencies>
): Promise<boolean> {
  const deps = resolveDependencies(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record || !isActive(record.status)) return false;
  await markTerminalAndAdvance(record, "failed", null, error, deps);
  return true;
}

async function waitForTurn(
  record: VerticalDramaShotVideoPromptJobRecord,
  deps: VerticalDramaShotVideoPromptJobStoreDependencies
): Promise<boolean> {
  const startedWaiting = deps.now();
  let lastHeartbeatAt = startedWaiting;
  const lockKey = episodeLockKey(record);
  while (deps.now() - startedWaiting < TURN_WAIT_TIMEOUT_MS) {
    if (deps.heartbeat && deps.now() - lastHeartbeatAt >= 15_000) {
      await deps.heartbeat();
      lastHeartbeatAt = deps.now();
    }
    const next = Number((await deps.redis.get(nextSequenceKey(record))) ?? 1);
    if (next > record.sequence) return false;

    const priorJobId =
      next < record.sequence
        ? await deps.redis.get(sequenceJobKey(record, next))
        : null;
    if (priorJobId) {
      const prior = await readRecord(priorJobId, deps);
      if (prior && isActive(prior.status)) {
        const canonical = deps.canonicalStatusReader
          ? (await deps.canonicalStatusReader([priorJobId])).get(priorJobId)
          : undefined;
        if (canonical && isCanonicalTerminalStatus(canonical.status)) {
          await markTerminalAndAdvance(
            prior,
            canonical.status === "completed" || canonical.status === "succeeded" ? "succeeded" : "failed",
            null,
            canonical.status === "completed" || canonical.status === "succeeded"
              ? null
              : canonical.reason ?? `Canonical predecessor ended with status=${canonical.status}`,
            deps,
          );
          continue;
        }
        if (
          prior.status === "running" &&
          deps.now() - new Date(prior.updatedAt).getTime() > STALE_ACTIVE_JOB_MS
        ) {
          await markTerminalAndAdvance(
            prior,
            "failed",
            null,
            STALE_JOB_ERROR,
            deps
          );
          continue;
        }
        await deps.sleep?.(500);
        continue;
      }
      await advanceNextSequence(record, next + 1, deps);
      continue;
    }
    if (next < record.sequence) {
      await advanceNextSequence(record, next + 1, deps);
      continue;
    }

    if (await deps.redis.setNx(lockKey, record.jobId, 30 * 60)) return true;
    await deps.sleep?.(250);
  }
  return false;
}

export async function runVerticalDramaShotVideoPromptJob(
  jobId: string,
  executor: VerticalDramaShotVideoPromptJobExecutor,
  dependencies?: Partial<VerticalDramaShotVideoPromptJobStoreDependencies>
): Promise<void> {
  const deps = resolveDependencies(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record || !isActive(record.status)) return;

  const hasTurn = await waitForTurn(record, deps);
  if (!hasTurn) {
    if (record.status === "queued") {
      await markTerminalAndAdvance(
        record,
        "failed",
        null,
        "The queued video prompt job timed out before it could start.",
        deps
      );
    }
    return;
  }

  let running: VerticalDramaShotVideoPromptJobRecord = {
    ...record,
    status: "running",
    error: null,
    updatedAt: new Date(deps.now()).toISOString(),
  };
  await writeRecord(running, deps);
  const executionToken = randomUUID();
  activeWorkerExecutions.set(jobId, executionToken);
  try {
    for (let retryAttempt = 0; ; retryAttempt += 1) {
      try {
        const result = await executor(
          {
            tenantId: running.tenantId,
            userId: running.userId,
            seriesId: running.seriesId,
            episodeId: running.episodeId,
            shotNumber: running.shotNumber,
            variantId: running.variantId,
            publicUrl: running.publicUrl,
            input: running.input,
          },
          { jobId, token: executionToken }
        );
        await markTerminalAndAdvance(running, "succeeded", result, null, deps);
        break;
      } catch (error) {
        const canRetry =
          isTransientGenerationError(error) &&
          retryAttempt < MAX_TRANSIENT_EXECUTOR_RETRIES;
        if (!canRetry) {
          await markTerminalAndAdvance(
            running,
            "failed",
            null,
            boundedError(error),
            deps
          ).catch(() => {});
          break;
        }

        // Keep the durable job active while waiting. This prevents later
        // shots from overtaking it and lets the browser continue polling one
        // stable job id instead of receiving a transient failure.
        running = {
          ...running,
          error: null,
          updatedAt: new Date(deps.now()).toISOString(),
        };
        await writeRecord(running, deps);
        await deps.sleep?.(retryDelayMs(error, retryAttempt));
      }
    }
  } finally {
    activeWorkerExecutions.delete(jobId);
    await deps.redis
      .compareDelete(episodeLockKey(running), running.jobId)
      .catch(() => false);
  }
}

/**
 * Canonical worker_jobs execution path. Sequencing, retry, lease, and result
 * persistence belong to worker_jobs; this helper only fences the protected
 * business resolver for the duration of one canonical execution.
 */
export async function executeVerticalDramaShotVideoPromptJobExecutor(
  jobId: string,
  payload: VerticalDramaShotVideoPromptJobPayload,
  executor: VerticalDramaShotVideoPromptJobExecutor,
): Promise<VerticalDramaShotVideoPromptJobResult> {
  const executionToken = randomUUID();
  activeWorkerExecutions.set(jobId, executionToken);
  try {
    return await executor(payload, { jobId, token: executionToken });
  } finally {
    activeWorkerExecutions.delete(jobId);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  if (!queue) {
    throw new Error(
      `${VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_JOBS_QUEUE} queue is not initialized`
    );
  }
  await publishLegacyBullMqJob(
    queue,
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

export async function initVerticalDramaShotVideoPromptJobsQueue(): Promise<void> {
  if (isFeature186HardCutoverEnabled()) return;
  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_JOBS_QUEUE, {
      connection,
    });
    worker = new Worker(
      VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_JOBS_QUEUE,
      async (bullJob: any) => {
        const { runVerticalDramaShotVideoPromptJobExecutor } =
          await import("../routers/verticalDramaEpisodes");
        await runVerticalDramaShotVideoPromptJob(
          bullJob.data.jobId,
          runVerticalDramaShotVideoPromptJobExecutor
        );
      },
      {
        connection,
        concurrency: WORKER_CONCURRENCY,
        lockDuration: BULLMQ_LOCK_DURATION_MS,
      }
    );
    worker.on("failed", async (bullJob: any, error: Error) => {
      console.error(
        `[${VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_JOBS_QUEUE}] Job ${bullJob?.id} failed:`,
        error.message
      );
      const jobId = bullJob?.data?.jobId;
      if (!jobId) return;
      await recoverVerticalDramaShotVideoPromptJob(
        jobId,
        `BullMQ job failed: ${boundedError(error)}`
      ).catch(recoveryError =>
        console.error(
          `[${VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_JOBS_QUEUE}] Failed to reconcile job ${jobId}:`,
          recoveryError
        )
      );
    });
  } catch (error) {
    console.warn(
      `[${VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_JOBS_QUEUE}] BullMQ initialization skipped:`,
      boundedError(error)
    );
  }
}

export async function closeVerticalDramaShotVideoPromptJobsQueue(): Promise<void> {
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
