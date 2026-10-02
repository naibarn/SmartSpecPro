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
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { createJobControlPlane } from "./jobControlPlane";
import {
  deleteEphemeralValue,
  listEphemeralValues,
  putEphemeralValue,
  putEphemeralValueIfOwned,
  readEphemeralValue,
} from "./postgresEphemeralStore";

type DeferredMediaType = "video";

type DeferredRetryStatus = "pending" | "submitting" | "processing" | "completed" | "failed" | "cancelled";

interface DeferredVideoRetryRecord {
  id: string;
  userId: string;
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
  workerJobId?: string;
}

const DEFERRED_TASK_NAMESPACE = "media-deferred-retry";
const DEFERRED_TASK_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;
const MIN_RETRY_DELAY_MS = 15 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 6;

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

async function saveRecord(
  record: DeferredVideoRetryRecord,
  expected?: DeferredVideoRetryRecord,
): Promise<boolean> {
  if (expected) {
    return putEphemeralValueIfOwned(
      DEFERRED_TASK_NAMESPACE,
      record.id,
      expected,
      record,
      DEFERRED_TASK_TTL_SECONDS,
    );
  }
  await putEphemeralValue(DEFERRED_TASK_NAMESPACE, record.id, record, DEFERRED_TASK_TTL_SECONDS);
  return true;
}

async function readRecord(id: string): Promise<DeferredVideoRetryRecord | null> {
  if (!id.startsWith("deferred-")) return null;
  return readEphemeralValue<DeferredVideoRetryRecord>(DEFERRED_TASK_NAMESPACE, id);
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

export async function scheduleDeferredVideoRetry(input: {
  userId: number | string;
  request: VideoGenerationRequest;
  retryDelayMs: number;
  errorMessage?: string;
  auditContext?: MediaAuditContext;
}): Promise<MediaTask> {
  const id = `deferred-${crypto.randomUUID()}`;
  const retryAt = Date.now() + clampRetryDelay(input.retryDelayMs);
  const tenantId = input.auditContext?.tenantId;
  if (!tenantId) {
    throw new Error("DEFERRED_MEDIA_TENANT_REQUIRED_FOR_DURABLE_QUEUE");
  }
  const record: DeferredVideoRetryRecord = {
    id,
    userId: String(input.userId),
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
  try {
    const job = await createControlPlaneJob({
      context: {
        tenantId,
        actorType: "user",
        actorId: Number(input.userId),
        authorizationScope: "media:deferred_retry",
        correlationId: `deferred-media:${id}`,
        idempotencyKey: `deferred-media:${tenantId}:${id}`,
      },
      definition: {
        contractVersion: "feature-186-v1",
        jobType: "media.deferred_retry",
        executionClass: "long",
        input: { deferredTaskId: id },
        scheduledAt: new Date(retryAt).toISOString(),
        retryPolicy: {
          maxAttempts: DEFAULT_MAX_RETRIES,
          baseDelayMs: MIN_RETRY_DELAY_MS,
          maxDelayMs: MAX_RETRY_DELAY_MS,
          jitter: "bounded",
          deadlineMs: DEFERRED_TASK_TTL_SECONDS * 1000,
          allowedErrorClasses: ["retryable", "timeout", "unavailable"],
        },
        timeoutPolicy: { softTimeoutMs: 10 * 60_000, hardTimeoutMs: 30 * 60_000 },
      },
    });
    await saveRecord({ ...record, workerJobId: job.jobId });
  } catch (error) {
    await saveRecord({
      ...record,
      status: "failed",
      updatedAt: nowIso(),
      errorMessage: error instanceof Error ? error.message : "Deferred retry queue unavailable",
    });
    throw error;
  }
  return toTask(record);
}

async function submitRecord(record: DeferredVideoRetryRecord): Promise<void> {
  const submitting: DeferredVideoRetryRecord = {
    ...record,
    status: "submitting",
    retryCount: record.retryCount + 1,
    updatedAt: nowIso(),
  };
  if (!(await saveRecord(submitting, record))) return;

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
    const processing: DeferredVideoRetryRecord = {
      ...submitting,
      status: "processing",
      providerTaskId: task.taskId,
      backendTaskId: task.id,
      updatedAt: nowIso(),
      errorMessage: undefined,
    };
    if (!(await saveRecord(processing, submitting))) {
      // Cancellation may win while the provider call is in flight. Preserve
      // the cancellation projection while recording that provider work was
      // already accepted, which also prevents an unsafe credit refund.
      const latest = await readRecord(record.id);
      if (latest?.status === "cancelled") {
        await saveRecord({
          ...latest,
          providerTaskId: task.taskId,
          backendTaskId: task.id,
          updatedAt: nowIso(),
        }, latest);
      }
    }
  } catch (error) {
    const retryDelayMs = getMediaRetryDelayMsFromError(error);
    if (retryDelayMs !== null && submitting.retryCount < submitting.maxRetries) {
      const retryAt = Date.now() + retryDelayMs;
      const retrying: DeferredVideoRetryRecord = {
        ...submitting,
        status: "pending",
        retryAt,
        updatedAt: nowIso(),
        errorMessage: error instanceof Error ? error.message : String(error ?? "Provider capacity limit"),
      };
      if (!(await saveRecord(retrying, submitting))) return;
      const retryable = new Error("MEDIA_PROVIDER_CAPACITY_RETRYABLE") as Error & {
        class: "retryable";
        code: string;
      };
      retryable.class = "retryable";
      retryable.code = "MEDIA_PROVIDER_CAPACITY_RETRYABLE";
      throw retryable;
    }

    await saveRecord({
      ...submitting,
      status: "failed",
      updatedAt: nowIso(),
      errorMessage: error instanceof Error ? error.message : String(error ?? "Deferred media retry failed"),
    }, submitting);
    throw error;
  }
}

export async function executeDeferredVideoRetryJob(deferredTaskId: string): Promise<Record<string, unknown>> {
  const record = await readRecord(deferredTaskId);
  if (!record) throw new Error("DEFERRED_MEDIA_TASK_NOT_FOUND");
  if (record.status === "submitting") {
    const failed: DeferredVideoRetryRecord = {
      ...record,
      status: "failed",
      updatedAt: nowIso(),
      errorMessage: "Provider submission outcome is unknown; automatic resubmission was stopped to avoid duplicate charges.",
    };
    await saveRecord(failed, record);
    const ambiguous = new Error("DEFERRED_MEDIA_SUBMISSION_OUTCOME_UNKNOWN") as Error & {
      class: "unknown";
      code: string;
    };
    ambiguous.class = "unknown";
    ambiguous.code = "DEFERRED_MEDIA_SUBMISSION_OUTCOME_UNKNOWN";
    throw ambiguous;
  }
  if (record.status !== "pending") {
    return { deferredTaskId, skipped: true, status: record.status };
  }
  await submitRecord(record);
  const submitted = await readRecord(deferredTaskId);
  return {
    deferredTaskId,
    status: submitted?.status ?? "unknown",
    providerTaskId: submitted?.providerTaskId ?? null,
    backendTaskId: submitted?.backendTaskId ?? null,
  };
}

/** In-process queue polling is retired; all submissions use worker_jobs. */
export async function runDueDeferredMediaRetries(): Promise<void> {
  return;
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
  if (record.workerJobId && ["pending", "submitting"].includes(record.status)) {
    await createJobControlPlane().cancel(
      record.workerJobId,
      "deferred_media_cancelled_by_user",
      undefined,
      Number(userId),
      { tenantId: record.auditContext?.tenantId, requestedByUserId: Number(userId) },
    ).catch(() => undefined);
  }
  const latest = await readRecord(taskId);
  if (!latest || latest.userId !== String(userId)) return null;
  const refundedRecord = await refundDeferredReservationIfNeeded(latest);

  const cancelled: DeferredVideoRetryRecord = {
    ...refundedRecord,
    status: "cancelled",
    updatedAt: nowIso(),
    errorMessage: "Deferred retry cancelled",
  };
  if (await saveRecord(cancelled, latest)) return toTask(cancelled);
  const winner = await readRecord(taskId);
  return winner ? toTask(winner) : null;
}

export async function deleteDeferredMediaTask(
  taskId: string,
  userId: number | string,
  tenantId?: string | null,
): Promise<boolean> {
  const record = await readRecord(taskId);
  if (!record || record.userId !== String(userId)) return false;
  if (tenantId && record.auditContext?.tenantId && record.auditContext.tenantId !== tenantId) return false;
  if (record.workerJobId && ["pending", "submitting"].includes(record.status)) {
    await createJobControlPlane().cancel(
      record.workerJobId,
      "deferred_media_deleted_by_user",
      undefined,
      Number(userId),
      { tenantId: record.auditContext?.tenantId, requestedByUserId: Number(userId) },
    ).catch(() => undefined);
  }
  await refundDeferredReservationIfNeeded(record);
  await deleteEphemeralValue(DEFERRED_TASK_NAMESPACE, taskId);
  return true;
}

export async function listDeferredMediaTasks(
  userId: number | string,
  limit = 50,
  tenantId?: string,
): Promise<MediaTask[]> {
  const records = await listEphemeralValues<DeferredVideoRetryRecord>(
    DEFERRED_TASK_NAMESPACE,
    Math.max(100, Math.min(5_000, limit * 20)),
  );
  const tasks: MediaTask[] = [];
  for (const record of records) {
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
  }
  return tasks
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export function startDeferredMediaRetryWorker(): void {
  console.info("[deferred-media-retry] PostgreSQL worker_jobs owns execution");
}
