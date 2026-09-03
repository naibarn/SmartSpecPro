import type { DrizzleDB } from "../db";
import {
  createNotification,
  type CreateNotificationParams,
  type NotificationMetadata,
  type ResourceType,
} from "./notificationService";

export type JobCompletionStatus =
  | "succeeded"
  | "failed"
  | "canceled"
  | "needs_review";

export interface JobCompletionNotificationInput {
  db: DrizzleDB;
  userId: number | null | undefined;
  tenantId?: string | null;
  jobId: string;
  jobType: string;
  status: JobCompletionStatus;
  title: string;
  successMessage?: string;
  failureMessage?: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  traceId?: string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  errorMessage?: string | null;
  retryCount?: number | null;
  maxRetries?: number | null;
  source?: string;
  relatedResourceType?: ResourceType;
  relatedResourceId?: string | null;
  relatedItems?: Record<string, string>;
}

function toMillis(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const millis = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function buildDurationMs(
  input: JobCompletionNotificationInput
): number | undefined {
  const started = toMillis(input.startedAt);
  const finished = toMillis(input.finishedAt);
  if (started === null || finished === null || finished < started)
    return undefined;
  return Math.min(finished - started, 7 * 24 * 60 * 60 * 1000);
}

function statusLabel(status: JobCompletionStatus): string {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "needs_review":
      return "needs_review";
  }
}

export function buildJobCompletionNotification(
  input: JobCompletionNotificationInput
): CreateNotificationParams | null {
  if (!input.userId || !input.jobId.trim() || !input.jobType.trim())
    return null;

  const failed = input.status === "failed";
  const needsReview = input.status === "needs_review";
  const canceled = input.status === "canceled";
  const status = statusLabel(input.status);
  const errorMessage = input.errorMessage?.trim().slice(0, 500) || null;
  const source = input.source?.trim().slice(0, 180) || "job_completion";
  const metadata: NotificationMetadata = {
    eventId: `job-completion:${input.jobType}:${input.jobId}`,
    source: "job_completion",
    signal: status,
    observedAt: new Date().toISOString(),
    errorDetails: errorMessage ? { errorMessage } : undefined,
    metrics:
      buildDurationMs(input) === undefined
        ? undefined
        : { durationMs: buildDurationMs(input) },
    retryInfo:
      input.retryCount == null && input.maxRetries == null
        ? undefined
        : {
            retryCount: input.retryCount ?? undefined,
            maxRetries: input.maxRetries ?? undefined,
          },
    relatedItems: {
      jobId: input.jobId,
      jobType: input.jobType,
      status,
      source,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.traceId ? { traceId: input.traceId } : {}),
      ...(input.relatedItems ?? {}),
    },
  };

  const content = failed
    ? input.failureMessage?.trim() ||
      `${input.title} ไม่สำเร็จ${errorMessage ? `: ${errorMessage}` : ""}`
    : needsReview
      ? input.failureMessage?.trim() || `${input.title} ต้องตรวจสอบเพิ่มเติม`
      : canceled
        ? input.failureMessage?.trim() ||
          `${input.title} ถูกยกเลิก${errorMessage ? `: ${errorMessage}` : ""}`
        : input.successMessage?.trim() || `${input.title} เสร็จเรียบร้อยแล้ว`;

  return {
    db: input.db,
    userId: input.userId,
    type: failed || needsReview || canceled ? "alert" : "system",
    title: failed
      ? `${input.title} ไม่สำเร็จ`
      : needsReview
        ? `${input.title} ต้องตรวจสอบ`
        : canceled
          ? `${input.title} ถูกยกเลิก`
          : `${input.title} เสร็จแล้ว`,
    content,
    priority: failed || needsReview ? "high" : "normal",
    relatedResourceType: input.relatedResourceType ?? "media_job",
    relatedResourceId: input.relatedResourceId ?? input.jobId,
    actionUrl: input.actionUrl ?? undefined,
    actionLabel:
      input.actionLabel ?? (input.actionUrl ? "เปิดผลลัพธ์" : undefined),
    groupKey: `job_completion:${input.jobType}:${input.jobId}`,
    metadata,
  };
}

/**
 * Terminal notification is intentionally best-effort. A notification outage
 * must never turn an already-persisted job result into a failed job.
 */
export async function notifyJobCompletion(
  input: JobCompletionNotificationInput
): Promise<{ notificationId: number | null; deduplicated: boolean } | null> {
  const payload = buildJobCompletionNotification(input);
  if (!payload) {
    console.warn("[JobCompletionNotification] skipped_missing_owner_or_job", {
      userId: input.userId ?? null,
      tenantId: input.tenantId ?? null,
      jobId: input.jobId,
      jobType: input.jobType,
      status: input.status,
    });
    return null;
  }

  try {
    const result = await createNotification(payload);
    console.info("[JobCompletionNotification] terminal_notification_created", {
      userId: input.userId,
      tenantId: input.tenantId ?? null,
      jobId: input.jobId,
      jobType: input.jobType,
      status: input.status,
      traceId: input.traceId ?? null,
      actionUrl: input.actionUrl ?? null,
      notificationId: result?.notificationId ?? null,
      deduplicated: result?.deduplicated ?? false,
    });
    return result
      ? {
          notificationId: result.notificationId,
          deduplicated: result.deduplicated,
        }
      : null;
  } catch (error) {
    console.error("[JobCompletionNotification] terminal_notification_failed", {
      userId: input.userId,
      tenantId: input.tenantId ?? null,
      jobId: input.jobId,
      jobType: input.jobType,
      status: input.status,
      traceId: input.traceId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function buildVerticalDramaEpisodeUrl(
  seriesId: unknown,
  episodeId: unknown
): string | undefined {
  const series = Number(seriesId);
  const episode = Number(episodeId);
  if (!Number.isSafeInteger(series) || series <= 0) return undefined;
  if (!Number.isSafeInteger(episode) || episode <= 0)
    return `/drama-series/${series}`;
  return `/drama-series/${series}/episodes/${episode}`;
}

export function buildWorkerJobActionUrl(job: {
  inputJson?: unknown;
  outputJson?: unknown;
  workflowRunId?: string | null;
}): string | undefined {
  const input =
    job.inputJson &&
    typeof job.inputJson === "object" &&
    !Array.isArray(job.inputJson)
      ? (job.inputJson as Record<string, unknown>)
      : {};
  const dramaUrl = buildVerticalDramaEpisodeUrl(
    input.seriesId,
    input.episodeId
  );
  if (dramaUrl) return dramaUrl;

  const runId =
    typeof job.workflowRunId === "string" && job.workflowRunId.trim()
      ? job.workflowRunId.trim()
      : typeof input.runId === "string" && input.runId.trim()
        ? input.runId.trim()
        : undefined;
  if (runId) return `/work/requests?runId=${encodeURIComponent(runId)}`;

  const output =
    job.outputJson &&
    typeof job.outputJson === "object" &&
    !Array.isArray(job.outputJson)
      ? (job.outputJson as Record<string, unknown>)
      : {};
  for (const key of ["resultUrl", "actionUrl", "detailsUrl"]) {
    const candidate = output[key];
    if (
      typeof candidate === "string" &&
      candidate.startsWith("/") &&
      !candidate.startsWith("//")
    ) {
      return candidate.slice(0, 2000);
    }
  }

  return undefined;
}
