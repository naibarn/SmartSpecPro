/**
 * Durable submit -> poll orchestration for Vertical Drama character prompt
 * previews. The LLM call is intentionally executed by BullMQ, never inside
 * the browser request, so a proxy timeout cannot lose a paid prompt result.
 */
import { randomUUID } from "node:crypto";
import { debugError } from "../_core/logger";
import { getRedisClient } from "./redis";

export const VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE =
  "vertical_drama_character_prompt_jobs";

const RECORD_TTL_SECONDS = 6 * 60 * 60;
const POINTER_TTL_SECONDS = 6 * 60 * 60;
const WORKER_CONCURRENCY = 2;
const MAX_ERROR_CHARS = 2_000;
/** Temporary provider capacity errors should stay in the durable queue. */
const CREDIT_CAPACITY_RETRY_BACKOFF_MS = [
  15_000,
  30_000,
  60_000,
  120_000,
  300_000,
] as const;

export type VerticalDramaCharacterPromptJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type VerticalDramaCharacterPromptJobWaitingReason =
  | "provider_capacity";

export interface VerticalDramaCharacterPromptJobInput {
  seriesId: string;
  characterId: string;
  selectedImageModelId?: string;
  portraitCandidateCount?: number;
  customInstruction?: string;
  castingReferenceAssetLinkIds?: string[];
  castingLockClothing?: boolean;
  castingPoseMode?: "auto_natural" | "lock_reference";
  castingCameraFraming?:
    | "full_body"
    | "three_quarter"
    | "half_body"
    | "medium_close_up"
    | "close_up"
    | "extreme_close_up"
    | "wide_environmental";
}

export interface VerticalDramaCharacterPromptJobOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
  characterId: number;
}

export interface VerticalDramaCharacterPromptJobPayload extends VerticalDramaCharacterPromptJobOwner {
  publicUrl: string | null;
  input: VerticalDramaCharacterPromptJobInput;
}

export interface VerticalDramaCharacterPromptJobRecord extends VerticalDramaCharacterPromptJobPayload {
  jobId: string;
  status: VerticalDramaCharacterPromptJobStatus;
  /** The router result is deliberately opaque here to keep this queue layer
   * independent from the large character router response type. */
  result: unknown | null;
  error: string | null;
  /** Number of provider-capacity deferrals already scheduled for this job. */
  capacityRetryCount?: number;
  /** Present while the job is queued behind the provider's in-flight limit. */
  waitingReason?: VerticalDramaCharacterPromptJobWaitingReason;
  /** ISO timestamp for the next durable retry, when waitingReason is set. */
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type VerticalDramaCharacterPromptJobExecutor = (
  payload: VerticalDramaCharacterPromptJobPayload,
  execution: { jobId: string; token: string }
) => Promise<unknown>;

const activeWorkerExecutions = new Map<string, string>();

export function isVerticalDramaCharacterPromptWorkerExecution(
  jobId: string,
  token: string
): boolean {
  return activeWorkerExecutions.get(jobId) === token;
}

export interface VerticalDramaCharacterPromptJobRedisAdapter {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    seconds: number
  ): Promise<unknown>;
  setNx(key: string, value: string, seconds: number): Promise<boolean>;
  compareDelete(key: string, expectedValue: string): Promise<boolean>;
}

export interface VerticalDramaCharacterPromptJobStoreDependencies {
  redis: VerticalDramaCharacterPromptJobRedisAdapter;
  now: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  /**
   * Requeue a temporary provider-capacity wait without holding a BullMQ
   * worker slot. Tests omit this callback and exercise the in-process
   * fallback below; production wires it to a delayed BullMQ job.
   */
  scheduleRetry?: (
    jobId: string,
    delayMs: number,
    retryCount: number,
  ) => Promise<void>;
}

export interface VerticalDramaCharacterPromptJobEnqueueDependencies extends Partial<VerticalDramaCharacterPromptJobStoreDependencies> {
  enqueueBullmqJob?: (jobId: string) => Promise<void>;
}

function defaultRedisAdapter(): VerticalDramaCharacterPromptJobRedisAdapter {
  const client = getRedisClient();
  return {
    get: key => client.get(key),
    set: (key, value, mode, seconds) => client.set(key, value, mode, seconds),
    setNx: async (key, value, seconds) =>
      (await client.set(key, value, "EX", seconds, "NX")) === "OK",
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
  dependencies?: Partial<VerticalDramaCharacterPromptJobStoreDependencies>
): VerticalDramaCharacterPromptJobStoreDependencies {
  return {
    redis: dependencies?.redis ?? defaultRedisAdapter(),
    now: dependencies?.now ?? Date.now,
    ...(dependencies?.scheduleRetry
      ? { scheduleRetry: dependencies.scheduleRetry }
      : {}),
    sleep:
      dependencies?.sleep ??
      (milliseconds =>
        new Promise(resolve => setTimeout(resolve, milliseconds))),
  };
}

function recordKey(jobId: string): string {
  return `vd:character-prompt-job:${jobId}`;
}

function activePointerKey(owner: VerticalDramaCharacterPromptJobOwner): string {
  return [
    "vd:character-prompt-job:active",
    owner.tenantId,
    owner.userId,
    owner.seriesId,
    owner.characterId,
  ].join(":");
}

function ownerMatches(
  record: VerticalDramaCharacterPromptJobRecord,
  owner: VerticalDramaCharacterPromptJobOwner
): boolean {
  return (
    record.tenantId === owner.tenantId &&
    record.userId === owner.userId &&
    record.seriesId === owner.seriesId &&
    record.characterId === owner.characterId
  );
}

function isActive(status: VerticalDramaCharacterPromptJobStatus): boolean {
  return status === "queued" || status === "running";
}

function boundedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.trim() || "Character prompt preview failed").slice(
    0,
    MAX_ERROR_CHARS
  );
}

/** True only for the provider's temporary in-flight credit-capacity error. */
export function isVerticalDramaCharacterPromptCreditCapacityError(
  error: unknown,
): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ");
  return (
    message.includes("would exceed your available credits") &&
    message.includes("in-flight")
  );
}

async function readRecord(
  jobId: string,
  deps: VerticalDramaCharacterPromptJobStoreDependencies
): Promise<VerticalDramaCharacterPromptJobRecord | null> {
  const raw = await deps.redis.get(recordKey(jobId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerticalDramaCharacterPromptJobRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VerticalDramaCharacterPromptJobRecord,
  deps: VerticalDramaCharacterPromptJobStoreDependencies
): Promise<void> {
  await deps.redis.set(
    recordKey(record.jobId),
    JSON.stringify(record),
    "EX",
    RECORD_TTL_SECONDS
  );
  if (isActive(record.status)) {
    const pointer = activePointerKey(record);
    if ((await deps.redis.get(pointer)) === record.jobId) {
      await deps.redis.set(pointer, record.jobId, "EX", POINTER_TTL_SECONDS);
    }
  }
}

async function clearPointer(
  record: VerticalDramaCharacterPromptJobRecord,
  deps: VerticalDramaCharacterPromptJobStoreDependencies
): Promise<void> {
  await deps.redis
    .compareDelete(activePointerKey(record), record.jobId)
    .catch(() => false);
}

export async function getVerticalDramaCharacterPromptJobStatus(
  jobId: string,
  owner: VerticalDramaCharacterPromptJobOwner,
  dependencies?: Partial<VerticalDramaCharacterPromptJobStoreDependencies>
): Promise<VerticalDramaCharacterPromptJobRecord | null> {
  const record = await readRecord(jobId, resolveDependencies(dependencies));
  return record && ownerMatches(record, owner) ? record : null;
}

export async function getActiveVerticalDramaCharacterPromptJob(
  owner: VerticalDramaCharacterPromptJobOwner,
  dependencies?: Partial<VerticalDramaCharacterPromptJobStoreDependencies>
): Promise<VerticalDramaCharacterPromptJobRecord | null> {
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

export async function enqueueVerticalDramaCharacterPromptJob(
  payload: VerticalDramaCharacterPromptJobPayload,
  dependencies?: VerticalDramaCharacterPromptJobEnqueueDependencies
): Promise<{
  jobId: string;
  status: VerticalDramaCharacterPromptJobStatus;
  deduped: boolean;
}> {
  const deps = resolveDependencies(dependencies);
  const pointer = activePointerKey(payload);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existingJobId = await deps.redis.get(pointer);
    if (existingJobId) {
      const existing = await readRecord(existingJobId, deps);
      if (
        existing &&
        ownerMatches(existing, payload) &&
        isActive(existing.status)
      ) {
        return {
          jobId: existing.jobId,
          status: existing.status,
          deduped: true,
        };
      }
      await deps.redis.compareDelete(pointer, existingJobId).catch(() => false);
    }

    const jobId = randomUUID();
    const nowIso = new Date(deps.now()).toISOString();
    const record: VerticalDramaCharacterPromptJobRecord = {
      ...payload,
      jobId,
      status: "queued",
      result: null,
      error: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await writeRecord(record, deps);
    if (!(await deps.redis.setNx(pointer, jobId, POINTER_TTL_SECONDS)))
      continue;

    try {
      await (dependencies?.enqueueBullmqJob ?? defaultEnqueueBullmqJob)(jobId);
    } catch (error) {
      const failed = {
        ...record,
        status: "failed" as const,
        error: boundedError(error),
        updatedAt: new Date(deps.now()).toISOString(),
      };
      await writeRecord(failed, deps);
      await clearPointer(failed, deps);
      debugError(
        "verticalDramaCharacterPromptJobs",
        `Failed to enqueue character prompt job ${jobId}`,
        error
      );
      return { jobId, status: "failed", deduped: false };
    }
    return { jobId, status: "queued", deduped: false };
  }

  const winnerId = await deps.redis.get(pointer);
  const winner = winnerId ? await readRecord(winnerId, deps) : null;
  if (winner && ownerMatches(winner, payload) && isActive(winner.status)) {
    return { jobId: winner.jobId, status: winner.status, deduped: true };
  }
  throw new Error("Unable to reserve the character prompt job slot — retry");
}

export async function runVerticalDramaCharacterPromptJob(
  jobId: string,
  executor: VerticalDramaCharacterPromptJobExecutor,
  dependencies?: Partial<VerticalDramaCharacterPromptJobStoreDependencies>
): Promise<void> {
  const deps = resolveDependencies(dependencies);
  const record = await readRecord(jobId, deps);
  if (!record || !isActive(record.status)) return;

  const running = {
    ...record,
    status: "running" as const,
    error: null,
    waitingReason: undefined,
    nextRetryAt: undefined,
    updatedAt: new Date(deps.now()).toISOString(),
  };
  await writeRecord(running, deps);
  const token = randomUUID();
  activeWorkerExecutions.set(jobId, token);
  let keepActivePointer = false;
  try {
    for (
      let retryIndex = running.capacityRetryCount ?? 0;
      ;
      retryIndex += 1
    ) {
      try {
        const result = await executor(running, { jobId, token });
        await writeRecord(
          {
            ...running,
            status: "succeeded",
            result,
            error: null,
            capacityRetryCount: 0,
            waitingReason: undefined,
            nextRetryAt: undefined,
            updatedAt: new Date(deps.now()).toISOString(),
          },
          deps
        );
        return;
      } catch (error) {
        const retryDelay =
          CREDIT_CAPACITY_RETRY_BACKOFF_MS[
            Math.min(retryIndex, CREDIT_CAPACITY_RETRY_BACKOFF_MS.length - 1)
          ];
        if (
          !isVerticalDramaCharacterPromptCreditCapacityError(error) ||
          (!deps.scheduleRetry &&
            retryIndex >= CREDIT_CAPACITY_RETRY_BACKOFF_MS.length)
        ) {
          await writeRecord(
            {
              ...running,
              status: "failed",
              result: null,
              error: boundedError(error),
              updatedAt: new Date(deps.now()).toISOString(),
            },
            deps
          ).catch(() => {});
          return;
        }

        debugError(
          "verticalDramaCharacterPromptJobs",
          `Character prompt job ${jobId} is waiting for provider credit capacity before retry ${retryIndex + 1}`,
          { retryDelay }
        );
        if (deps.scheduleRetry) {
          const retryCount = retryIndex + 1;
          const queued = {
            ...running,
            status: "queued" as const,
              result: null,
              error: null,
              capacityRetryCount: retryCount,
              waitingReason: "provider_capacity" as const,
              nextRetryAt: new Date(
                deps.now() + retryDelay,
              ).toISOString(),
              updatedAt: new Date(deps.now()).toISOString(),
          };
          await writeRecord(queued, deps);
          try {
            await deps.scheduleRetry(jobId, retryDelay, retryCount);
            keepActivePointer = true;
            return;
          } catch (scheduleError) {
            await writeRecord(
              {
                ...queued,
                status: "failed",
                error: boundedError(scheduleError),
                waitingReason: undefined,
                nextRetryAt: undefined,
                updatedAt: new Date(deps.now()).toISOString(),
              },
              deps
            ).catch(() => {});
            return;
          }
        }
        await deps.sleep!(retryDelay);
      }
    }
  } finally {
    activeWorkerExecutions.delete(jobId);
    if (!keepActivePointer) await clearPointer(running, deps);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let queue: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let worker: any = null;

async function defaultEnqueueBullmqJob(jobId: string): Promise<void> {
  if (!queue) {
    throw new Error(
      `${VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE} queue is not initialized`
    );
  }
  await queue.add(
    "run",
    { jobId },
    { jobId, attempts: 1, removeOnComplete: true, removeOnFail: { age: 86400 } }
  );
}

async function defaultScheduleRetry(
  jobId: string,
  delayMs: number,
  retryCount: number,
): Promise<void> {
  if (!queue) {
    throw new Error(
      `${VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE} queue is not initialized`,
    );
  }
  await queue.add(
    "run",
    { jobId },
    {
      jobId: `retry-${jobId}-${retryCount}`,
      delay: delayMs,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { age: 86400 },
    },
  );
}

export async function initVerticalDramaCharacterPromptJobsQueue(): Promise<void> {
  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE, {
      connection,
    });
    worker = new Worker(
      VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE,
      async (job: { data: { jobId: string } }) => {
        const { runVerticalDramaCharacterPromptJobExecutor } =
          await import("../routers/verticalDramaCharacters");
        await runVerticalDramaCharacterPromptJob(
          job.data.jobId,
          runVerticalDramaCharacterPromptJobExecutor,
          { scheduleRetry: defaultScheduleRetry },
        );
      },
      { connection, concurrency: WORKER_CONCURRENCY }
    );
    worker.on("failed", (job: { id?: string } | undefined, error: Error) =>
      console.error(
        `[${VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE}] job ${job?.id} failed`,
        error.message
      )
    );
  } catch (error) {
    console.warn(
      `[${VERTICAL_DRAMA_CHARACTER_PROMPT_JOBS_QUEUE}] initialization skipped`,
      boundedError(error)
    );
  }
}

export async function closeVerticalDramaCharacterPromptJobsQueue(): Promise<void> {
  try {
    await worker?.close();
    await queue?.close();
  } finally {
    queue = null;
    worker = null;
  }
}
