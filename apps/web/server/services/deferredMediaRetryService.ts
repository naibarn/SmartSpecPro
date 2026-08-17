import crypto from "crypto";
import { signBearerToken } from "../_core/tokens";
import type {
  MediaAuditContext,
  MediaTask,
  TaskStatus,
  VideoGenerationRequest,
} from "./mediaGenerationService";
import { mediaGenerationService } from "./mediaGenerationService";
import { refundCredits } from "./creditService";
import { getRedisClient } from "./redis";

type DeferredMediaType = "video";

type DeferredRetryStatus = "pending" | "submitting" | "processing" | "completed" | "failed" | "cancelled";

interface DeferredVideoRetryRecord {
  id: string;
  userId: string;
  userToken: string;
  mediaType: DeferredMediaType;
  status: DeferredRetryStatus;
  prompt: string;
  model: string;
  request: VideoGenerationRequest;
  retryAt: number;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
  providerTaskId?: string;
  backendTaskId?: string;
  refundedCredits?: number;
  auditContext?: MediaAuditContext;
}

const DEFERRED_TASK_PREFIX = "deferred-media:";
const DEFERRED_TASK_ZSET = "deferred-media:due";
const DEFERRED_TASK_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;
const MIN_RETRY_DELAY_MS = 15 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 6;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

function recordKey(id: string): string {
  return `${DEFERRED_TASK_PREFIX}${id}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampRetryDelay(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return DEFAULT_RETRY_DELAY_MS;
  return Math.max(MIN_RETRY_DELAY_MS, Math.min(MAX_RETRY_DELAY_MS, Math.ceil(ms)));
}

function extractStringValues(value: unknown, output: string[], depth = 0): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractStringValues(item, output, depth + 1));
    return;
  }
  if (typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => extractStringValues(item, output, depth + 1));
  }
}

export function getMediaRetryDelayMsFromError(error: unknown): number | null {
  const messages: string[] = [];
  if (error instanceof Error) messages.push(error.message);
  extractStringValues((error as any)?.responsePayload, messages);
  extractStringValues((error as any)?.data, messages);
  extractStringValues(error, messages);
  const text = messages.join("\n").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const isProviderLimit = /points used by apiKey has exceeded the hourly limit|hourly limit|rate limit exceeded for media generation|too many requests|quota/i.test(text);
  if (!isProviderLimit) return null;

  const secondsMatch = text.match(/try again in\s+(\d+(?:\.\d+)?)\s*seconds?/i)
    || text.match(/retry after\s+(\d+(?:\.\d+)?)\s*seconds?/i);
  if (secondsMatch) {
    return clampRetryDelay(Number(secondsMatch[1]) * 1000 + 5000);
  }

  return DEFAULT_RETRY_DELAY_MS;
}

export function isMediaProviderCapacityError(error: unknown): boolean {
  return getMediaRetryDelayMsFromError(error) !== null;
}

async function saveRecord(record: DeferredVideoRetryRecord): Promise<void> {
  const redis = getRedisClient();
  await redis.set(recordKey(record.id), JSON.stringify(record), "EX", DEFERRED_TASK_TTL_SECONDS);
  if (record.status === "pending") {
    await redis.zadd(DEFERRED_TASK_ZSET, record.retryAt, record.id);
  } else {
    await redis.zrem(DEFERRED_TASK_ZSET, record.id);
  }
}

async function readRecord(id: string): Promise<DeferredVideoRetryRecord | null> {
  if (!id.startsWith("deferred-")) return null;
  const redis = getRedisClient();
  const raw = await redis.get(recordKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeferredVideoRetryRecord;
  } catch {
    return null;
  }
}

function toTask(record: DeferredVideoRetryRecord): MediaTask {
  const reservedCredits = getReservedCredits(record);
  const status: TaskStatus =
    record.status === "failed" ? "failed" :
    record.status === "cancelled" ? "cancelled" :
    record.status === "completed" ? "completed" :
    record.status === "processing" || record.status === "submitting" ? "processing" :
    "pending";

  return {
    id: record.id,
    taskId: record.providerTaskId,
    userId: record.userId,
    mediaType: record.mediaType,
    status,
    model: record.model,
    prompt: record.prompt,
    parameters: {
      deferredRetry: true,
      retryAt: record.retryAt,
      retryCount: record.retryCount,
      maxRetries: record.maxRetries,
      linkedTaskId: record.providerTaskId ?? record.backendTaskId ?? null,
      linkedBackendTaskId: record.backendTaskId ?? null,
      linkedProviderTaskId: record.providerTaskId ?? null,
      reservedCredits,
      refundedCredits: record.refundedCredits ?? null,
    },
    resultUrl: undefined,
    resultData: {
      deferredRetry: true,
      retryAt: record.retryAt,
      retryCount: record.retryCount,
      maxRetries: record.maxRetries,
      linkedBackendTaskId: record.backendTaskId ?? null,
      linkedProviderTaskId: record.providerTaskId ?? null,
      reservedCredits,
      refundedCredits: record.refundedCredits ?? null,
    },
    errorMessage:
      record.status === "pending"
        ? `Waiting for provider quota. Retry scheduled in ${Math.max(0, Math.ceil((record.retryAt - Date.now()) / 1000))} seconds.`
        : record.errorMessage,
    createdAt: record.createdAt,
    startedAt: record.status === "submitting" || record.status === "processing" ? record.updatedAt : undefined,
    completedAt: record.status === "failed" || record.status === "completed" || record.status === "cancelled" ? record.updatedAt : undefined,
  };
}

function getReservedCredits(record: DeferredVideoRetryRecord): number {
  const extraParams = record.request.extraParams;
  if (!extraParams || typeof extraParams !== "object") return 0;
  const raw = (extraParams as Record<string, unknown>).__reserved_credits;
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function canRefundDeferredReservation(record: DeferredVideoRetryRecord): boolean {
  if (record.providerTaskId || record.backendTaskId) return false;
  if (record.refundedCredits && record.refundedCredits > 0) return false;
  return record.status === "pending" || record.status === "cancelled";
}

async function refundDeferredReservationIfNeeded(record: DeferredVideoRetryRecord): Promise<DeferredVideoRetryRecord> {
  if (!canRefundDeferredReservation(record)) return record;
  const reservedCredits = getReservedCredits(record);
  if (reservedCredits <= 0) return record;

  await refundCredits({
    userId: Number(record.userId),
    amount: reservedCredits,
    description: `Refund: Deferred video retry cancelled (${record.model})`,
    sourceType: "media_video",
    idempotencyKey: `deferred-media-refund:${record.id}`,
    metadata: {
      deferredTaskId: record.id,
      model: record.model,
      prompt: record.prompt.slice(0, 100),
      reason: "deferred_retry_cancelled_before_provider_submission",
      reservedCost: reservedCredits,
    },
  });

  return {
    ...record,
    refundedCredits: reservedCredits,
  };
}

async function resolveLinkedRecordTask(
  record: DeferredVideoRetryRecord,
  userToken: string,
  auditContext?: MediaAuditContext,
): Promise<MediaTask> {
  const linkedId = record.providerTaskId || record.backendTaskId;
  if (!linkedId || record.status !== "processing") {
    return toTask(record);
  }

  try {
    const linkedTask = await mediaGenerationService.getTask(linkedId, userToken, auditContext);
    if (linkedTask.status === "completed" || linkedTask.status === "failed" || linkedTask.status === "cancelled") {
      await saveRecord({
        ...record,
        status: linkedTask.status === "completed" ? "completed" : linkedTask.status === "cancelled" ? "cancelled" : "failed",
        updatedAt: nowIso(),
        errorMessage: linkedTask.errorMessage,
      });
    }
    return {
      ...linkedTask,
      id: record.id,
      taskId: linkedTask.taskId || linkedId,
      parameters: {
        ...(linkedTask.parameters ?? {}),
        deferredRetry: true,
        linkedTaskId: linkedId,
        linkedBackendTaskId: record.backendTaskId ?? null,
        linkedProviderTaskId: record.providerTaskId ?? null,
      },
      resultData: {
        ...(typeof linkedTask.resultData === "object" && linkedTask.resultData ? linkedTask.resultData : {}),
        deferredRetry: true,
        linkedBackendTaskId: record.backendTaskId ?? null,
        linkedProviderTaskId: record.providerTaskId ?? null,
      },
    };
  } catch {
    return toTask(record);
  }
}

function createDeferredMediaToken(userId: string, tenantId?: string | null): string {
  return signBearerToken({
    sub: userId,
    ...(tenantId ? { tenantId } : {}),
    type: "access",
    scopes: ["media:generate"],
    jti: `deferred_media_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
  }, "15m");
}

function scheduleWorker(delayMs = 1000): void {
  if (workerTimer) return;
  workerTimer = setTimeout(() => {
    workerTimer = null;
    void runDueDeferredMediaRetries();
  }, Math.max(1000, delayMs));
  workerTimer.unref?.();
}

export async function scheduleDeferredVideoRetry(input: {
  userId: number | string;
  userToken: string;
  request: VideoGenerationRequest;
  retryDelayMs: number;
  errorMessage?: string;
  auditContext?: MediaAuditContext;
}): Promise<MediaTask> {
  const id = `deferred-${crypto.randomUUID()}`;
  const retryAt = Date.now() + clampRetryDelay(input.retryDelayMs);
  const record: DeferredVideoRetryRecord = {
    id,
    userId: String(input.userId),
    userToken: input.userToken,
    mediaType: "video",
    status: "pending",
    prompt: input.request.prompt,
    model: input.request.model || "video",
    request: input.request,
    retryAt,
    retryCount: 0,
    maxRetries: DEFAULT_MAX_RETRIES,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    errorMessage: input.errorMessage,
    auditContext: input.auditContext,
  };
  await saveRecord(record);
  scheduleWorker(Math.max(1000, retryAt - Date.now()));
  return toTask(record);
}

async function submitRecord(record: DeferredVideoRetryRecord): Promise<void> {
  const submitting: DeferredVideoRetryRecord = {
    ...record,
    status: "submitting",
    retryCount: record.retryCount + 1,
    updatedAt: nowIso(),
  };
  await saveRecord(submitting);

  try {
    const task = await mediaGenerationService.generateVideoAsync(
      {
        ...submitting.request,
        auditContext: {
          ...(submitting.request.auditContext ?? {}),
          ...(submitting.auditContext ?? {}),
          stage: "deferred_retry_submission",
        },
      },
      createDeferredMediaToken(submitting.userId, submitting.auditContext?.tenantId),
    );
    await saveRecord({
      ...submitting,
      status: "processing",
      providerTaskId: task.taskId,
      backendTaskId: task.id,
      updatedAt: nowIso(),
      errorMessage: undefined,
    });
  } catch (error) {
    const retryDelayMs = getMediaRetryDelayMsFromError(error);
    if (retryDelayMs !== null && submitting.retryCount < submitting.maxRetries) {
      const retryAt = Date.now() + retryDelayMs;
      await saveRecord({
        ...submitting,
        status: "pending",
        retryAt,
        updatedAt: nowIso(),
        errorMessage: error instanceof Error ? error.message : String(error ?? "Provider capacity limit"),
      });
      scheduleWorker(Math.max(1000, retryAt - Date.now()));
      return;
    }

    await saveRecord({
      ...submitting,
      status: "failed",
      updatedAt: nowIso(),
      errorMessage: error instanceof Error ? error.message : String(error ?? "Deferred media retry failed"),
    });
  }
}

export async function runDueDeferredMediaRetries(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const redis = getRedisClient();
    const now = Date.now();
    const ids = await redis.zrangebyscore(DEFERRED_TASK_ZSET, 0, now, "LIMIT", 0, 5);
    if (ids.length === 0) {
      const next = await redis.zrange(DEFERRED_TASK_ZSET, 0, 0, "WITHSCORES");
      if (next.length >= 2) {
        scheduleWorker(Math.max(1000, Number(next[1]) - Date.now()));
      }
      return;
    }

    for (const id of ids) {
      await redis.zrem(DEFERRED_TASK_ZSET, id);
      const record = await readRecord(id);
      if (!record || record.status !== "pending") continue;
      await submitRecord(record);
    }

    scheduleWorker(1000);
  } finally {
    workerRunning = false;
  }
}

export async function getDeferredMediaTask(
  taskId: string,
  userId: number | string,
  userToken: string,
  auditContext?: MediaAuditContext,
): Promise<MediaTask | null> {
  const record = await readRecord(taskId);
  if (!record || record.userId !== String(userId)) return null;

  const expectedTenantId = auditContext?.tenantId;
  const recordTenantId = record.auditContext?.tenantId;
  if (expectedTenantId && recordTenantId && expectedTenantId !== recordTenantId) return null;

  return resolveLinkedRecordTask(
    record,
    userToken || createDeferredMediaToken(record.userId, recordTenantId),
    auditContext,
  );
}

export async function cancelDeferredMediaTask(
  taskId: string,
  userId: number | string,
  tenantId?: string | null,
): Promise<MediaTask | null> {
  const record = await readRecord(taskId);
  if (!record || record.userId !== String(userId)) return null;
  if (tenantId && record.auditContext?.tenantId && record.auditContext.tenantId !== tenantId) return null;
  const refundedRecord = await refundDeferredReservationIfNeeded(record);

  const cancelled: DeferredVideoRetryRecord = {
    ...refundedRecord,
    status: "cancelled",
    updatedAt: nowIso(),
    errorMessage: "Deferred retry cancelled",
  };
  await saveRecord(cancelled);
  return toTask(cancelled);
}

export async function deleteDeferredMediaTask(
  taskId: string,
  userId: number | string,
  tenantId?: string | null,
): Promise<boolean> {
  const record = await readRecord(taskId);
  if (!record || record.userId !== String(userId)) return false;
  if (tenantId && record.auditContext?.tenantId && record.auditContext.tenantId !== tenantId) return false;
  await refundDeferredReservationIfNeeded(record);

  const redis = getRedisClient();
  await redis.zrem(DEFERRED_TASK_ZSET, taskId);
  await redis.del(recordKey(taskId));
  return true;
}

export async function listDeferredMediaTasks(
  userId: number | string,
  limit = 50,
  tenantId?: string,
): Promise<MediaTask[]> {
  const redis = getRedisClient();
  const keys = await redis.keys(`${DEFERRED_TASK_PREFIX}deferred-*`);
  const tasks: MediaTask[] = [];
  for (const key of keys) {
    const raw = await redis.get(key);
    if (!raw) continue;
    try {
      const record = JSON.parse(raw) as DeferredVideoRetryRecord;
      const recordTenantId = typeof record.auditContext?.tenantId === "string"
        ? record.auditContext.tenantId
        : null;
      if (record.userId === String(userId) && (!tenantId || recordTenantId === tenantId)) {
        tasks.push(await resolveLinkedRecordTask(
          record,
          createDeferredMediaToken(record.userId, recordTenantId),
          {
            userId: Number.isFinite(Number(record.userId)) ? Number(record.userId) : undefined,
            ...(recordTenantId ? { tenantId: recordTenantId } : {}),
            source: "trpc.media.listTasks",
            stage: "deferred_history_refresh",
          },
        ));
      }
    } catch {
      // Ignore malformed cache entries.
    }
  }
  return tasks
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export function startDeferredMediaRetryWorker(): void {
  scheduleWorker(1000);
}
