import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { validateJobSpec, VALID_JOB_TYPES } from "../../shared/types/mediaJob";
import type { MediaJobSpec, MediaJobProgress } from "../../shared/types/mediaJob";
import { sanitizeUri, validateWebJobSpec } from "../../shared/types/mediaJobValidation";
import { nanoid } from "nanoid";
import type { Express, Request, Response } from "express";
import type { VideoEditorProject } from "../../client/src/types/videoEditor";
import { authorizeRequest } from "../_core/authz";
import type { TenantRequest } from "../_core/tenant";
import { rateLimit } from "../_core/limits";
import multer from "multer";
import { storagePut, storagePutFromPath } from "../storage";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { mediaAssets } from "../../drizzle/schema";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { assertTextClipRolloutEnabledForSpec } from "../services/textClipRollout";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { buildMediaJobHandle, shouldPollAsyncJobHandle } from "../services/asyncJobHandle";
import { shouldUseCloudTasksForMediaJobs } from "../services/mediaJobDispatchMode";
import { classifyCreditFailure } from "../services/creditFailurePolicy";

type MediaJobAssetAuth = { userId: string; tenantId: string | null };

/** Register media-jobs files in the canonical asset table so consumers can
 * resolve a stable, owner-scoped storage URL after the upload response. */
async function registerMediaJobAsset(input: {
  auth: MediaJobAssetAuth;
  storageKey: string;
  originalUrl: string | null;
  mimeType: string;
  fileSize: number;
  status: "pending" | "ready";
  sourceType?: "media_job_upload" | "media_job_import";
}): Promise<number | null> {
  if (!input.auth.tenantId) return null;
  const userId = Number(input.auth.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid authenticated user id");
  }

  const database = getDb();
  const [inserted] = await database
    .insert(mediaAssets)
    .values({
      tenantId: input.auth.tenantId,
      userId,
      sourceType: input.sourceType ?? "media_job_upload",
      status: input.status,
      storageKey: input.storageKey,
      originalUrl: input.originalUrl,
      mimeType: input.mimeType || "application/octet-stream",
      fileSize: input.fileSize > 0 ? input.fileSize : null,
    })
    .returning({ id: mediaAssets.id });
  return inserted?.id ?? null;
}

/** Mark a presigned object ready, or repair a completion from an older client
 * that did not create the pending row during upload init. */
async function finalizeMediaJobAsset(input: {
  auth: MediaJobAssetAuth;
  storageKey: string;
  originalUrl: string;
  mimeType?: string;
  fileSize?: number;
}): Promise<number | null> {
  if (!input.auth.tenantId) return null;
  const userId = Number(input.auth.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid authenticated user id");
  }

  const database = getDb();
  const [existing] = await database
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, input.auth.tenantId),
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.storageKey, input.storageKey),
      ),
    )
    .limit(1);

  if (existing) {
    await database
      .update(mediaAssets)
      .set({
        status: "ready",
        originalUrl: input.originalUrl,
        ...(input.mimeType ? { mimeType: input.mimeType } : {}),
        ...(input.fileSize && input.fileSize > 0
          ? { fileSize: input.fileSize }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, existing.id));
    return existing.id;
  }

  return registerMediaJobAsset({
    auth: input.auth,
    storageKey: input.storageKey,
    originalUrl: input.originalUrl,
    mimeType: input.mimeType || "application/octet-stream",
    fileSize: input.fileSize ?? 0,
    status: "ready",
  });
}

// ========================================
// Redis helpers (lazy import to avoid circular deps)
// ========================================

async function getRedis() {
  const { getRedisClient } = await import("../services/redis");
  return getRedisClient();
}

const JOB_TTL = 86400; // 24 hours

async function setJobKey(jobId: string, suffix: string, data: unknown) {
  const redis = await getRedis();
  await redis.set(
    `media-job:${jobId}:${suffix}`,
    JSON.stringify(data),
    "EX",
    JOB_TTL,
  );
}

async function getJobKey(jobId: string, suffix: string) {
  const redis = await getRedis();
  const raw = await redis.get(`media-job:${jobId}:${suffix}`);
  return raw ? JSON.parse(raw) : null;
}

async function publishProgress(jobId: string, data: unknown) {
  const redis = await getRedis();
  await redis.publish(
    `media-job-progress:${jobId}`,
    JSON.stringify(data),
  );
}

// ========================================
// Per-user active job tracking (Redis Set)
// ========================================

const ACTIVE_JOBS_KEY = (userId: string) =>
  `media-jobs:user:${userId}:active`;
const MAX_CONCURRENT_JOBS = 3;

async function addActiveJob(userId: string, jobId: string): Promise<void> {
  const redis = await getRedis();
  await redis.sadd(ACTIVE_JOBS_KEY(userId), jobId);
}

async function removeActiveJob(userId: string, jobId: string): Promise<void> {
  const redis = await getRedis();
  await redis.srem(ACTIVE_JOBS_KEY(userId), jobId);
}

async function getActiveJobIds(userId: string): Promise<string[]> {
  const redis = await getRedis();
  return redis.smembers(ACTIVE_JOBS_KEY(userId));
}

// Per-user recent job history (Sorted Set — score = submittedAt timestamp)
// Unlike active set, entries are NOT removed on completion, so /tasks page can list them.
const RECENT_JOBS_KEY = (userId: string) =>
  `media-jobs:user:${userId}:recent`;

async function addRecentJob(userId: string, jobId: string): Promise<void> {
  const redis = await getRedis();
  await redis.zadd(RECENT_JOBS_KEY(userId), Date.now(), jobId);
  await redis.expire(RECENT_JOBS_KEY(userId), JOB_TTL);
}

async function getRecentJobIds(userId: string, limit = 50): Promise<string[]> {
  const redis = await getRedis();
  return redis.zrevrange(RECENT_JOBS_KEY(userId), 0, limit - 1);
}

const STALE_QUEUED_MS = 10 * 60 * 1000; // 10 min: queued but never picked up
const STALE_PROCESSING_MS = 60 * 60 * 1000; // 60 min: processing but never finished

// ========================================
// Job failure notification helper
// ========================================

async function notifyJobFailure(
  userId: string,
  jobId: string,
  errorMessage: string,
) {
  try {
    const creditClassification = classifyCreditFailure({
      errorMessage,
      path: "media_jobs",
      context: { modelKind: "media" },
    });
    if (creditClassification.isCreditFailure) {
      const { reportSystemFailure } = await import("../services/systemAutoReportService");
      await reportSystemFailure({
        source: "media_jobs",
        userId: userId,
        jobId,
        title: "Media job credit failure",
        errorMessage,
        creditContext: {
          source: creditClassification.source,
          modelKind: "media",
          requestedCredits: creditClassification.requestedCredits,
          provider: creditClassification.provider,
        },
      });
      return;
    }

    const { getDb } = await import("../db");
    const { users } = await import("../../drizzle/schema");
    const { createNotification } = await import("../services/notificationService");
    const db = await getDb();
    if (!db) return;

    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum)) return;

    // Notify the job owner
    await createNotification({
      db,
      userId: userIdNum,
      type: "alert",
      title: "Media Job Failed",
      content: `Your media job (${jobId.slice(0, 8)}...) failed: ${errorMessage.slice(0, 200)}`,
      priority: "high",
      relatedResourceType: "media_job",
      relatedResourceId: jobId,
      actionUrl: `/media-studio?jobId=${jobId}`,
      actionLabel: "View in Media Studio",
      groupKey: `media_job_failure:${userIdNum}`,
      metadata: {
        source: "media_jobs",
        errorDetails: {
          errorMessage: errorMessage.slice(0, 500),
        },
      },
    });

    // Notify all admins
    const adminRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));

    for (const admin of adminRows) {
      if (admin.id === userIdNum) continue; // skip if user is already admin
      await createNotification({
        db,
        userId: admin.id,
        type: "alert",
        title: "Media Job Failed (Admin Alert)",
        content: `User ${userId} — job ${jobId}: ${errorMessage.slice(0, 200)}`,
        priority: "high",
        relatedResourceType: "media_job",
        relatedResourceId: jobId,
        actionUrl: `/media-studio?jobId=${jobId}`,
        actionLabel: "View in Media Studio",
        metadata: {
          source: "media_jobs",
          errorDetails: {
            errorMessage: errorMessage.slice(0, 500),
          },
          relatedItems: { userId },
        },
      });
    }

    // System auto-report: file (or dedup-update) a diagnostic feedback
    // ticket for this failure — richer than the truncated bell notification
    // above, and admin-visible in AdminFeedbackHub. Best-effort, does not
    // affect the notifications sent above.
    const { reportSystemFailure } = await import("../services/systemAutoReportService");
    await reportSystemFailure({
      source: "media_jobs",
      userId: userIdNum,
      jobId,
      title: "Media job failed",
      errorMessage,
    });
  } catch {
    // Best effort — don't break the caller
  }
}

async function checkConcurrencyLimit(userId: string): Promise<boolean> {
  const activeIds = await getActiveJobIds(userId);
  const now = Date.now();

  // Prune stale entries (terminal status OR stuck too long)
  for (const id of activeIds) {
    const status = await getJobKey(id, "status");
    if (
      !status ||
      status.status === "done" ||
      status.status === "error" ||
      status.status === "canceled"
    ) {
      await removeActiveJob(userId, id);
      continue;
    }

    // Prune jobs that have been queued/processing for too long (worker likely down)
    const meta = await getJobKey(id, "meta");
    const age = meta?.submittedAt ? now - meta.submittedAt : Infinity;
    if (status.status === "queued" && age > STALE_QUEUED_MS) {
      await setJobKey(id, "status", {
        ...status,
        status: "error",
        message: "Timed out waiting for worker (stale after 10 min)",
      });
      await removeActiveJob(userId, id);
    } else if (status.status === "processing" && age > STALE_PROCESSING_MS) {
      await setJobKey(id, "status", {
        ...status,
        status: "error",
        message: "Timed out during processing (stale after 60 min)",
      });
      await removeActiveJob(userId, id);
    }
  }
  const currentCount = (await getActiveJobIds(userId)).length;
  return currentCount < MAX_CONCURRENT_JOBS;
}

function resolveTenantIdForContext(ctx: { tenantId?: unknown; user?: { currentTenantId?: unknown } }): unknown {
  return ctx.tenantId ?? ctx.user?.currentTenantId ?? null;
}

function extractFirstArtifactUrl(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const artifacts = (result as { artifacts?: unknown }).artifacts;
  if (!Array.isArray(artifacts)) return null;
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") continue;
    const uri = (artifact as { uri?: unknown; url?: unknown }).uri ?? (artifact as { url?: unknown }).url;
    if (typeof uri === "string" && uri.trim()) return uri.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function compactMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  );
}

function extractRenderTraceabilityMetadata(spec: unknown, inputMetadata: unknown): Record<string, unknown> {
  const specRecord = asRecord(spec);
  const params = asRecord(specRecord.params);
  const sourceMetadata = asRecord(params.sourceMetadata ?? params.renderTraceability ?? params.traceability);
  return compactMetadata({
    ...sourceMetadata,
    ...asRecord(inputMetadata),
  });
}

function getRenderLibraryTitle(spec: unknown, fallbackJobId: string, explicitTitle?: string): string {
  const title = explicitTitle?.trim();
  if (title) return title;

  const outputTarget =
    spec && typeof spec === "object"
      ? (spec as { output?: { target?: unknown } }).output?.target
      : null;
  if (typeof outputTarget === "string" && outputTarget.trim()) {
    return `Final video - ${path.basename(outputTarget.trim())}`;
  }

  return `Final video - ${fallbackJobId}`;
}

// ========================================
// Celery dispatch (HTTP bridge to Python backend)
// ========================================

/**
 * Resolve relative URIs (e.g. /uploads/...) in a job spec to absolute URLs
 * so the Python Celery worker can fetch them over HTTP.
 */
function resolveRelativeUris(specJson: string): string {
  const nodeBaseUrl =
    process.env.NODE_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  const spec = JSON.parse(specJson);
  if (spec.inputs?.assets) {
    for (const asset of spec.inputs.assets) {
      if (typeof asset.uri === "string" && asset.uri.startsWith("/")) {
        asset.uri = `${nodeBaseUrl}${asset.uri}`;
      }
    }
  }
  return JSON.stringify(spec);
}

async function dispatchToCelery(
  specJson: string,
  userId: string,
  jobId: string,
  requestId?: string,
): Promise<{ kie_job_id?: string }> {
  const runtime = await getAppRuntimeConfig();
  const pythonUrl = runtime.pythonBackendUrl;

  // Resolve relative asset URIs so Python worker can access them via HTTP
  const resolvedSpecJson = resolveRelativeUris(specJson);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const internalToken = (process.env.MEDIA_JOB_INTERNAL_TOKEN || "").trim();
  if (internalToken) headers["x-internal-token"] = internalToken;
  if (requestId) headers["x-request-id"] = requestId;

  const res = await fetch(`${pythonUrl}/api/v1/media-jobs/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({ spec_json: resolvedSpecJson, user_id: userId, job_id: jobId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Celery dispatch failed: ${res.status} ${body}`);
  }

  const body = await res.json().catch(() => ({}));
  return { kie_job_id: body?.task_id || body?.kie_job_id };
}

/**
 * Enqueue a Cloud Tasks polling task for Kie AI job status.
 * The polling handler (Python /tasks/poll-job) will check Kie AI status
 * with exponential backoff (2min, 4min, 8min, ... capped at 30min).
 */
async function enqueuePollingTask(jobId: string, kieJobId: string) {
  const { enqueueTask, getCloudTasksConfigStatus } = await import("../services/cloudTasks");
  const config = getCloudTasksConfigStatus("python");
  if (!config.configured) {
    console.warn(
      `[MediaJobs] Skipping Cloud Tasks polling safety net; missing config: ${config.missingKeys.join(", ")}`,
    );
    return;
  }
  await enqueueTask({
    queueName: "polling-tasks",
    handlerPath: "/_internal/tasks/poll-job",
    payload: {
      job_id: jobId,
      kie_job_id: kieJobId,
      attempt: 0,
      submitted_at: Date.now(),
    },
    delaySeconds: 120, // First poll after 2 minutes
    taskId: `poll-${jobId}-0`,
  });
}

/**
 * Conditional dispatch: routes to Cloud Tasks or Celery based on feature flag.
 * When using Cloud Tasks, also enqueues a polling task for Kie AI status checks.
 */
async function dispatchJob(specJson: string, userId: string, jobId: string, requestId?: string) {
  const { getFeatureFlag } = await import("../services/featureFlags");
  const useCloudTasks = await getFeatureFlag("USE_CLOUD_TASKS");

  if (useCloudTasks) {
    const { enqueueTask, getCloudTasksConfigStatus } = await import("../services/cloudTasks");
    const config = getCloudTasksConfigStatus("python");
    if (config.configured) {
      const resolvedSpecJson = resolveRelativeUris(specJson);
      await enqueueTask({
        queueName: "media-jobs",
        handlerPath: "/_internal/tasks/process-media",
        payload: { spec_json: resolvedSpecJson, user_id: userId, job_id: jobId, request_id: requestId },
      });
      return;
    }
    console.warn(
      `[MediaJobs] USE_CLOUD_TASKS is enabled but Cloud Tasks config is incomplete; falling back to Python dispatch. Missing: ${config.missingKeys.join(", ")}`,
    );
  }

  const result = await dispatchToCelery(specJson, userId, jobId, requestId);
  // If the Python backend returned a kie_job_id, enqueue polling as a safety net
  if (result.kie_job_id) {
    try {
      await enqueuePollingTask(jobId, result.kie_job_id);
    } catch (e) {
      // Polling is a safety net; don't fail the submission
      console.warn("Failed to enqueue polling task:", e);
    }
  }
}

export interface InternalMediaJobStatus {
  jobId: string;
  status: string;
  progress?: number;
  message?: string;
  result?: unknown;
  resultUrl?: string;
  error?: unknown;
  errorMessage?: string;
}

export async function submitInternalMediaJob(input: {
  spec: MediaJobSpec;
  userId: string | number;
  requestId?: string;
  skipConcurrencyLimit?: boolean;
}): Promise<{ jobId: string }> {
  const spec = input.spec;
  const baseValidation = validateJobSpec(spec);
  if (!baseValidation.valid) {
    throw new Error(`Invalid job spec: ${baseValidation.errors.join("; ")}`);
  }
  const webValidation = validateWebJobSpec(spec, "web_backend");
  if (!webValidation.valid) {
    throw new Error(`Invalid web job spec: ${webValidation.errors.join("; ")}`);
  }
  assertTextClipRolloutEnabledForSpec(spec, undefined);

  const jobId = spec.jobId;
  const userId = String(input.userId);

  if (!input.skipConcurrencyLimit && !(await checkConcurrencyLimit(userId))) {
    throw new Error("Maximum 3 concurrent media jobs allowed. Wait for a job to complete.");
  }

  await setJobKey(jobId, "spec", spec);
  const submittedAt = Date.now();
  await setJobKey(jobId, "meta", {
    userId,
    submittedAt,
    nextPollAt: submittedAt + 120_000,
    source: "auto_team_media_pipeline",
  });
  await setJobKey(jobId, "status", {
    status: "queued",
    progress: 0,
    jobId,
  });
  await addActiveJob(userId, jobId);
  await addRecentJob(userId, jobId);

  try {
    await dispatchJob(JSON.stringify(spec), userId, jobId, input.requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to dispatch media job";
    await setJobKey(jobId, "status", {
      status: "error",
      progress: 0,
      jobId,
      message,
    });
    await removeActiveJob(userId, jobId);
    throw error;
  }

  return { jobId };
}

export async function getInternalMediaJobStatus(
  jobId: string,
): Promise<InternalMediaJobStatus | null> {
  const status = await getJobKey(jobId, "status");
  if (!status) return null;

  const result = status.status === "done" ? await getJobKey(jobId, "result") : null;
  const error = status.status === "error" ? await getJobKey(jobId, "error") : null;
  const resultUrl =
    typeof result?.artifacts?.[0]?.uri === "string"
      ? result.artifacts[0].uri
      : typeof status.resultUrl === "string"
        ? status.resultUrl
        : undefined;
  const errorMessage =
    typeof error?.message === "string"
      ? error.message
      : typeof status.message === "string"
        ? status.message
        : undefined;

  return {
    jobId,
    status: String(status.status),
    progress: typeof status.progress === "number" ? status.progress : undefined,
    message: typeof status.message === "string" ? status.message : undefined,
    result,
    resultUrl,
    error,
    errorMessage,
  };
}

// ========================================
// tRPC Router
// ========================================

const jobSpecInputSchema = z.object({
  specVersion: z.literal("0.1"),
  jobId: z.string().optional(),
  jobType: z.enum(VALID_JOB_TYPES as [string, ...string[]]),
  priority: z.enum(["low", "normal", "high"]).optional(),
  inputs: z.object({
    assets: z
      .array(
        z.object({
          assetId: z.string(),
          kind: z.enum(["video", "audio", "image", "subtitle"]),
          uri: z.string(),
          mime: z.string().optional(),
          label: z.string().optional(),
          durationMs: z.number().optional(),
          contentHash: z.string().optional(),
          extra: z.record(z.unknown()).optional(),
        }),
      )
      .optional(),
    project: z
      .object({
        projectId: z.string(),
        fps: z.number(),
        width: z.number(),
        height: z.number(),
        tracks: z.array(
          z.object({
            trackId: z.string(),
            type: z.enum(["video", "audio", "subtitle"]),
            clips: z.array(
              z.object({
                clipId: z.string(),
                assetId: z.string(),
                inMs: z.number().optional(),
                outMs: z.number().optional(),
                durationMs: z.number().optional(),
                startMs: z.number(),
                playbackRate: z.number().optional(),
                volume: z.number().optional(),
                mute: z.boolean().optional(),
                inTransition: z.object({
                  name: z.string(),
                  durationMs: z.number(),
                }).optional(),
              }),
            ),
          }),
        ),
      })
      .nullable()
      .optional(),
  }),
  params: z.record(z.unknown()).optional(),
  output: z.object({
    mode: z.enum(["file", "dir", "memory"]),
    target: z.string(),
    overwrite: z.boolean().optional(),
  }),
  engine: z
    .object({
      strategy: z.enum(["desktop_sidecar", "web_backend", "web_wasm"]),
      hints: z.record(z.unknown()).optional(),
    })
    .optional(),
  cache: z
    .object({ enabled: z.boolean().optional(), key: z.string().optional() })
    .optional(),
  telemetry: z
    .object({ traceId: z.string().optional() })
    .optional(),
});

// ========================================
// Render submission schema
// ========================================

const renderSubmitSchema = z.object({
  project: z.object({
    settings: z.object({
      width: z.number(),
      height: z.number(),
      fps: z.number(),
      sampleRate: z.number(),
    }).passthrough(),
    timeline: z.object({
      tracks: z.array(z.object({
        type: z.string(),
        name: z.string(),
        clips: z.array(z.any()),
      }).passthrough()),
    }),
  }).passthrough(),
  profile: z.enum(["preview", "standard", "high"]),
  inputAssetKeys: z.record(z.string(), z.string()),
});

export const mediaJobsRouter = router({
  submitRender: protectedProcedure
    .input(renderSubmitSchema)
    .mutation(async ({ input, ctx }) => {
      const { computeRenderHash } = await import("../services/renderHash");
      const { routeVideoJob } = await import("../services/videoJobRouter");

      const project = input.project as unknown as VideoEditorProject;
      const profile = input.profile;
      const inputAssetKeys = input.inputAssetKeys;
      const tenantId = resolveTenantIdForContext(ctx);

      try {
        assertTextClipRolloutEnabledForSpec(
          { inputs: { project: project as any } } as MediaJobSpec,
          tenantId,
        );
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: error instanceof Error ? error.message : "Text clip rollout is disabled",
        });
      }

      // Compute render hash
      const renderHash = computeRenderHash(project, inputAssetKeys, profile);
      const outputKey = `renders/${profile}/${renderHash}.mp4`;

      // Check R2 cache — if the render already exists, return it immediately
      try {
        const { storageResolveUrl } = await import("../storage");
        const existingUrl = await storageResolveUrl(outputKey);
        if (existingUrl) {
          return { cached: true, url: existingUrl, renderHash };
        }
      } catch {
        // Fail-open: proceed with rendering if cache check fails
      }

      // Determine queue
      const queueName = routeVideoJob(project);
      const jobId = `render-${nanoid(21)}`;

      // Build render spec
      const renderSpec = {
        project,
        profile,
        renderHash,
        outputKey,
        inputAssetKeys,
        jobId,
      };

      // Store job in Redis for tracking
      const submittedAt = Date.now();
      await setJobKey(jobId, "meta", {
        userId: String(ctx.user.id),
        submittedAt,
        nextPollAt: submittedAt + 120_000,
      });
      await setJobKey(jobId, "status", {
        status: "queued",
        progress: 0,
        jobId,
      });
      await addActiveJob(String(ctx.user.id), jobId);
      await addRecentJob(String(ctx.user.id), jobId);

      // Enqueue to Cloud Tasks when configured, otherwise dispatch directly to Python.
      try {
        if (await shouldUseCloudTasksForMediaJobs()) {
          const { enqueueTask } = await import("../services/cloudTasks");
          await enqueueTask({
            queueName,
            handlerPath: "/_internal/tasks/process-video",
            payload: {
              render_spec: renderSpec,
              queue_name: queueName,
            },
          });
        } else {
          // Dispatch via direct HTTP to Python backend
          const runtime = await getAppRuntimeConfig();
          const pythonUrl = runtime.pythonBackendUrl;
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (ctx.req.requestId) headers["x-request-id"] = ctx.req.requestId;
          const resp = await fetch(`${pythonUrl}/api/v1/media/tasks/process-video`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              render_spec: renderSpec,
              queue_name: queueName,
            }),
          });
          if (!resp.ok) {
            throw new Error(`Python backend returned ${resp.status}: ${resp.statusText}`);
          }
        }
      } catch (e: unknown) {
        await setJobKey(jobId, "status", {
          status: "error",
          progress: 0,
          jobId,
          message: "Failed to dispatch render job",
        });
        await removeActiveJob(String(ctx.user.id), jobId);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to dispatch render job",
        });
      }

      return { cached: false, jobId, renderHash, queueName };
    }),

  submitJob: protectedProcedure
    .input(jobSpecInputSchema)
    .mutation(async ({ input, ctx }) => {
      const jobId = input.jobId || nanoid(21);
      const spec: MediaJobSpec = { ...input, jobId } as MediaJobSpec;
      const tenantId = resolveTenantIdForContext(ctx);

      // Validate (includes SSRF, codec allowlist, resolution/bitrate limits)
      const validation = validateWebJobSpec(spec, "web_backend");
      if (!validation.valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid job spec: ${validation.errors.join("; ")}`,
        });
      }
      try {
        assertTextClipRolloutEnabledForSpec(spec, tenantId);
      } catch (error) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: error instanceof Error ? error.message : "Text clip rollout is disabled",
        });
      }

      // Check concurrent job limit (max 3 per user)
      if (!(await checkConcurrencyLimit(String(ctx.user.id)))) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Maximum 3 concurrent media jobs allowed. Wait for a job to complete.",
        });
      }

      // Store in Redis
      await setJobKey(jobId, "spec", spec);
      const submittedAt = Date.now();
      await setJobKey(jobId, "meta", {
        userId: String(ctx.user.id),
        submittedAt,
        nextPollAt: submittedAt + 120_000,
      });
      await setJobKey(jobId, "status", {
        status: "queued",
        progress: 0,
        jobId,
      });
      await addActiveJob(String(ctx.user.id), jobId);
      await addRecentJob(String(ctx.user.id), jobId);

      // Dispatch to worker (Cloud Tasks or Celery based on feature flag)
      try {
        await dispatchJob(JSON.stringify(spec), String(ctx.user.id), jobId, ctx.req.requestId);
      } catch (e: unknown) {
        await setJobKey(jobId, "status", {
          status: "error",
          progress: 0,
          jobId,
          message: "Failed to dispatch to worker",
        });
        await removeActiveJob(String(ctx.user.id), jobId);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to dispatch media job to worker",
        });
      }

      // Audit log (best-effort)
      try {
        const { auditLogger } = await import("../services/auditLogger");
        auditLogger.log({
          eventType: "media_request",
          traceId: spec.telemetry?.traceId,
          userId: ctx.user.id,
          requestPayload: { jobId, jobType: spec.jobType },
        });
      } catch {
        // Best-effort
      }

      // PostHog: job_submitted event (best-effort)
      try {
        const { captureServerEvent } = await import("../services/posthog");
        captureServerEvent(String(ctx.user.id), "job_submitted", {
          job_type: spec.jobType,
          job_id: jobId,
        });
      } catch {
        // Best-effort
      }

      return { jobId };
    }),

  getStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Check ownership
      const meta = await getJobKey(input.jobId, "meta");
      if (!meta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (meta.userId !== String(ctx.user.id) && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const status = await getJobKey(input.jobId, "status");
      if (!status) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      const jobHandle = buildMediaJobHandle({
        jobId: input.jobId,
        status: status.status,
        submittedAt: meta.submittedAt,
        nextPollAt: meta.nextPollAt ?? null,
        resultSummary: typeof status.message === "string" ? status.message : null,
        failureReason: status.status === "error" ? (status.message ?? null) : null,
      });
      const pollable = shouldPollAsyncJobHandle(jobHandle);

      // Attach result or error if terminal
      if (status.status === "done") {
        const result = await getJobKey(input.jobId, "result");
        return { ...status, result, jobHandle, pollable };
      }
      if (status.status === "error") {
        const error = await getJobKey(input.jobId, "error");
        return { ...status, error, jobHandle, pollable };
      }
      return { ...status, jobHandle, pollable };
    }),

  addCompletedRenderToLibrary: protectedProcedure
    .input(
      z.object({
        jobId: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const meta = await getJobKey(input.jobId, "meta");
      if (!meta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (meta.userId !== String(ctx.user.id) && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const status = await getJobKey(input.jobId, "status");
      if (!status) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (status.status !== "done") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only completed render jobs can be added to library",
        });
      }

      const tenantId = resolveTenantIdForContext(ctx);
      if (tenantId === null || tenantId === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant context is required for render library storage",
        });
      }

      const { isLibraryEnabledForTenant } = await import("../services/libraryFeatureFlags");
      if (!isLibraryEnabledForTenant(tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Library feature is disabled for this tenant",
        });
      }

      const result = await getJobKey(input.jobId, "result");
      const sourceUrl = extractFirstArtifactUrl(result);
      if (!sourceUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Render result URL is missing",
        });
      }

      const spec = await getJobKey(input.jobId, "spec");
      const jobType = spec && typeof spec === "object"
        ? (spec as { jobType?: unknown }).jobType
        : null;
      const outputTarget = spec && typeof spec === "object"
        ? (spec as { output?: { target?: unknown } }).output?.target
        : null;
      const traceabilityMetadata = extractRenderTraceabilityMetadata(spec, input.metadata);
      const { getDb } = await import("../db");
      const {
        createLibraryItem,
        safeEnqueueLibraryIndexJob,
      } = await import("../services/libraryService");
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const created = await createLibraryItem(
        {
          itemType: "video",
          source: "video_editor_render",
          title: getRenderLibraryTitle(spec, input.jobId, input.title),
          description: "Rendered final video from Video Editor",
          status: "indexing",
          visibility: "private",
          metadata: {
            source_type: "video_editor_render",
            media_job_id: input.jobId,
            job_type: typeof jobType === "string" ? jobType : null,
            output_target: typeof outputTarget === "string" ? outputTarget : null,
            submitted_at: typeof meta.submittedAt === "number" ? meta.submittedAt : null,
            ...traceabilityMetadata,
            render_traceability: traceabilityMetadata,
          },
          sourceUrl,
          thumbnailUrl: null,
          sourceLink: {
            linkType: "media_job",
            linkId: input.jobId,
            providerTaskId: null,
          },
        },
        {
          userId: ctx.user.id,
          tenantId: tenantId as string | number,
          role: ctx.user.role,
        },
        db,
      );

      const indexJob = await safeEnqueueLibraryIndexJob(
        {
          libraryItemId: created.item.id,
          tenantId: tenantId as string | number,
          jobType: "initial_index",
          domain: "gallery",
          operation: "index",
          source: "gallery.video_editor_render",
          sourceMetadata: {
            ingestion: "render_to_library",
            mediaJobId: input.jobId,
            ...traceabilityMetadata,
          },
          allowThrottle: true,
        },
        db,
      );

      return {
        itemId: created.item.id,
        created: !created.idempotent,
        indexJob,
      };
    }),

  cancelJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const meta = await getJobKey(input.jobId, "meta");
      if (!meta) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      if (meta.userId !== String(ctx.user.id) && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const cancelStatus = {
        jobId: input.jobId,
        status: "canceled",
        progress: 0,
      };
      await setJobKey(input.jobId, "status", cancelStatus);
      await publishProgress(input.jobId, cancelStatus);
      await removeActiveJob(meta.userId, input.jobId);

      return { success: true };
    }),

  listJobs: protectedProcedure.query(async ({ ctx }) => {
    const userId = String(ctx.user.id);

    // Read from recent-jobs sorted set (includes completed/failed jobs)
    let jobIds = await getRecentJobIds(userId, 50);

    // Fallback to active set for backward compat (jobs submitted before this change)
    if (jobIds.length === 0) {
      jobIds = await getActiveJobIds(userId);
    }

    const jobs: Array<{
      jobId: string;
      status: string;
      progress: number;
      message?: string;
      submittedAt: number;
      jobType: string;
      outputTarget: string;
      resultUrl?: string;
      errorMessage?: string;
      jobHandle: ReturnType<typeof buildMediaJobHandle>;
      pollable: boolean;
    }> = [];

    for (const jobId of jobIds.slice(0, 50)) {
      const meta = await getJobKey(jobId, "meta");
      if (!meta) continue; // Redis key expired

      const statusRaw = await getJobKey(jobId, "status");
      if (!statusRaw) continue;

      const spec = await getJobKey(jobId, "spec");

      // For completed jobs, fetch the result to get the output URL
      let resultUrl: string | undefined;
      let errorMessage: string | undefined;
      if (statusRaw.status === "done") {
        const result = await getJobKey(jobId, "result");
        if (result?.artifacts?.[0]?.uri) {
          resultUrl = result.artifacts[0].uri;
        }
      }
      if (statusRaw.status === "error") {
        const error = await getJobKey(jobId, "error");
        errorMessage = error?.message || statusRaw.message;
      }

      const jobHandle = buildMediaJobHandle({
        jobId,
        status: statusRaw.status,
        submittedAt: meta.submittedAt,
        nextPollAt: meta.nextPollAt ?? null,
        resultSummary: typeof statusRaw.message === "string" ? statusRaw.message : null,
        failureReason: errorMessage ?? null,
      });
      const pollable = shouldPollAsyncJobHandle(jobHandle);

      jobs.push({
        jobId,
        status: statusRaw.status || "unknown",
        progress: statusRaw.progress || 0,
        message: statusRaw.message,
        submittedAt: meta.submittedAt,
        jobType: spec?.jobType || "unknown",
        outputTarget: spec?.output?.target || "",
        resultUrl,
        errorMessage,
        jobHandle,
        pollable,
      });
    }

    return jobs.sort((a, b) => b.submittedAt - a.submittedAt);
  }),
});

// ========================================
// Express SSE Route
// ========================================

export function registerMediaJobRoutes(app: Express) {
  // SSE endpoint for real-time progress
  app.get("/api/media-jobs/:id/events", async (req: Request, res: Response) => {
    const jobId = req.params.id;

    // Auth: use authorizeRequest for consistent userId (numeric DB ID)
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userId = auth.sub;

    // Verify ownership
    const meta = await getJobKey(jobId, "meta");
    if (!meta) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    if (meta.userId !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let closed = false;

    // Subscribe to Redis pub/sub
    let subRedis: any = null;
    try {
      const { createRedisConnection } = await import("../services/redis");
      subRedis = await createRedisConnection();
      const channel = `media-job-progress:${jobId}`;

      await subRedis.subscribe(channel);
      subRedis.on("message", async (_ch: string, message: string) => {
        if (closed) return;
        try {
          let data = JSON.parse(message);
          // Enrich "done" events with result data from Redis if missing
          if (data.status === "done" && !data.result) {
            try {
              const result = await getJobKey(jobId, "result");
              if (result) data = { ...data, result };
            } catch { /* ignore enrichment failure */ }
          }
          const eventType =
            data.status === "done"
              ? "done"
              : data.status === "error"
                ? "error"
                : "progress";
          res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);

          if (data.status === "done" || data.status === "error" || data.status === "canceled") {
            cleanup();
          }
        } catch {
          // Ignore parse errors
        }
      });
    } catch (e) {
      console.error("[MediaJobs SSE] Redis sub error:", e);
    }

    // Polling fallback: every 2s
    const pollInterval = setInterval(async () => {
      if (closed) return;
      try {
        let status = await getJobKey(jobId, "status");
        if (status) {
          // Enrich done/error with result/error data
          if (status.status === "done" && !status.result) {
            const result = await getJobKey(jobId, "result");
            if (result) status = { ...status, result };
          }
          const eventType =
            status.status === "done"
              ? "done"
              : status.status === "error"
                ? "error"
                : "progress";
          res.write(`event: ${eventType}\ndata: ${JSON.stringify(status)}\n\n`);

          if (
            status.status === "done" ||
            status.status === "error" ||
            status.status === "canceled"
          ) {
            cleanup();
          }
        }
      } catch {
        // Ignore
      }
    }, 2000);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pollInterval);
      if (subRedis) {
        subRedis.unsubscribe().catch((err: unknown) => console.error("[MediaJobs] Redis unsubscribe failed:", err));
        subRedis.disconnect();
      }
      res.end();
    };

    req.on("close", cleanup);
  });

  // ========================================
  // REST auth helper
  // ========================================

  async function authenticateMediaJobRequest(
    req: Request,
    res: Response,
  ): Promise<{ userId: string; tenantId: string | null } | null> {
    const auth = await authorizeRequest(req, {
      allowBearer: true,
      allowSession: true,
    });
    if (!auth.ok) {
      res.status(401).json({ error: auth.error });
      return null;
    }

    const tenantReq = req as TenantRequest;
    return { userId: auth.sub, tenantId: tenantReq.tenant?.id ?? null };
  }

  // ========================================
  // File upload endpoint
  // IMPORTANT: This route has NO rate limiting to support large file uploads
  // that may take several minutes. Do NOT add rate limiting middleware here.
  // ========================================

  const ALLOWED_UPLOAD_EXTENSIONS = new Set([
    "mp4", "webm", "mov", "avi", "mkv",
    "mp3", "wav", "ogg", "flac", "aac",
    "srt", "vtt",
    "jpg", "jpeg", "png", "webp", "gif",
  ]);
  const MAX_UPLOAD_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB (support large video files)
  const REMOTE_IMPORT_MEDIA_TYPES = new Set(["audio", "video", "image"]);
  const REMOTE_IMPORT_DEFAULT_EXTENSION: Record<string, string> = {
    audio: "mp3",
    video: "mp4",
    image: "jpg",
  };
  const REMOTE_IMPORT_CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-wav": "wav",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/avi": "avi",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi",
  };

  function normalizeRemoteImportMediaType(value: unknown): "audio" | "video" | "image" | null {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    return REMOTE_IMPORT_MEDIA_TYPES.has(normalized) ? normalized as "audio" | "video" | "image" : null;
  }

  function normalizeRemoteImportContentType(value: string | null | undefined): string {
    return String(value || "application/octet-stream").split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
  }

  function isAllowedRemoteImportContentType(contentType: string, mediaType: "audio" | "video" | "image"): boolean {
    return (
      contentType === "application/octet-stream"
      || contentType.startsWith(`${mediaType}/`)
      || (mediaType === "audio" && contentType === "application/x-mpegurl")
    );
  }

  function inferRemoteImportExtension(
    sourceUrl: string,
    contentType: string,
    mediaType: "audio" | "video" | "image",
  ): string {
    const mapped = REMOTE_IMPORT_CONTENT_TYPE_EXTENSIONS[contentType];
    if (mapped && ALLOWED_UPLOAD_EXTENSIONS.has(mapped)) return mapped;
    try {
      const parsed = new URL(sourceUrl);
      const ext = parsed.pathname.split("/").pop()?.split(".").pop()?.toLowerCase() || "";
      if (ext && ALLOWED_UPLOAD_EXTENSIONS.has(ext)) return ext;
    } catch {
      // Keep the default below.
    }
    return REMOTE_IMPORT_DEFAULT_EXTENSION[mediaType];
  }

  async function writeRemoteResponseToTempFile(params: {
    response: globalThis.Response;
    tempPath: string;
    maxBytes: number;
  }): Promise<number> {
    if (!params.response.body) {
      throw new Error("Remote asset response has no body");
    }
    const file = await fs.open(params.tempPath, "w");
    let totalBytes = 0;
    try {
      for await (const chunk of params.response.body as any) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > params.maxBytes) {
          const error = new Error(`Remote asset exceeds maximum size of ${Math.round(params.maxBytes / (1024 * 1024))}MB`);
          (error as any).statusCode = 413;
          throw error;
        }
        await file.write(buffer);
      }
    } finally {
      await file.close();
    }
    return totalBytes;
  }

  // Use disk storage to avoid memory issues with large files
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, os.tmpdir());
      },
      filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        cb(null, `upload-${uniqueSuffix}-${file.originalname}`);
      },
    }),
    // Temporarily disable limit to debug
    // limits: { fileSize: MAX_UPLOAD_SIZE },
  });

  app.post(
    "/api/media-jobs/upload",
    upload.single("file") as any,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      try {
        console.log("[MediaJobs Upload] Request received, file:", !!(req as any).file);
        console.log("[MediaJobs Upload] Client IP:", req.ip);
        console.log("[MediaJobs Upload] Content-Length:", req.headers['content-length']);

        const authResult = await authenticateMediaJobRequest(req, res);
        if (!authResult) {
          console.log("[MediaJobs Upload] Auth failed");
          return;
        }
        console.log("[MediaJobs Upload] Auth successful, userId:", authResult.userId);

        const file = (req as any).file as {
          path: string;
          originalname: string;
          mimetype: string;
          size: number;
        } | undefined;

        if (!file) {
          res.status(400).json({ error: "No file provided" });
          return;
        }

        console.log("[MediaJobs Upload] File:", file.originalname, file.size, "bytes");

        try {
          // Validate extension
          const ext = file.originalname.split(".").pop()?.toLowerCase() || "";
          if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
            await fs.unlink(file.path).catch(() => {}); // Clean up temp file
            res.status(400).json({
              error: `Unsupported file type: .${ext}. Allowed: ${Array.from(ALLOWED_UPLOAD_EXTENSIONS).join(", ")}`,
            });
            return;
          }

          // Validate MIME type
          const ALLOWED_MIMES = new Set([
            "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/wav",
            "image/jpeg", "image/png", "image/webp", "application/octet-stream",
          ]);
          if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype)) {
            await fs.unlink(file.path).catch(() => {}); // Clean up temp file
            res.status(400).json({ error: `Unsupported MIME type: ${file.mimetype}` });
            return;
          }

          const assetId = nanoid(21);
          const storageKey = `media-jobs/assets/${assetId}/${file.originalname}`;

          console.log("[MediaJobs Upload] File received:", file.originalname, file.size, "bytes");

          // Check storage provider
          const { getActiveStorageConfig } = await import("../storage");
          const storageConfig = await getActiveStorageConfig();

          let url: string;
          if (storageConfig.provider === "local") {
            // Local storage: move file directly without buffering
            console.log("[MediaJobs Upload] Using local storage - moving file");
            const { getUploadsDir } = await import("../storage");
            const uploadsDir = getUploadsDir();
            const targetDir = path.join(uploadsDir, "media-jobs", "assets", assetId);
            await fs.mkdir(targetDir, { recursive: true });
            const targetPath = path.join(targetDir, file.originalname);
            await fs.rename(file.path, targetPath);
            url = `/uploads/media-jobs/assets/${assetId}/${file.originalname}`;
            console.log("[MediaJobs Upload] File moved to:", targetPath);
          } else {
            // Remote storage: read and upload
            console.log("[MediaJobs Upload] Using remote storage - buffering file");
            const fileBuffer = await fs.readFile(file.path);
            console.log("[MediaJobs Upload] File read complete:", fileBuffer.length, "bytes");

            const { url: storageUrl } = await storagePut(
              storageKey,
              fileBuffer,
              file.mimetype || "application/octet-stream",
            );
            url = storageUrl;
            console.log("[MediaJobs Upload] Storage upload complete");

            // Clean up temp file
            await fs.unlink(file.path).catch(e => console.warn("[Upload] Cleanup failed:", e));
          }

          const mediaAssetId = await registerMediaJobAsset({
            auth: authResult,
            storageKey,
            originalUrl: url,
            mimeType: file.mimetype || "application/octet-stream",
            fileSize: file.size,
            status: "ready",
          });

          const uploadDuration = Date.now() - startTime;
          console.log("[MediaJobs Upload] Success:", url, `(${uploadDuration}ms)`);
          res.json({
            assetId,
            uri: url,
            ...(mediaAssetId ? { mediaAssetId: String(mediaAssetId) } : {}),
          });
        } catch (e: any) {
          // Clean up temp file on error
          if (file?.path) {
            await fs.unlink(file.path).catch(() => {});
          }
          throw e;
        }
      } catch (e: any) {
        const uploadDuration = Date.now() - startTime;
        console.error("[MediaJobs Upload] Error after", uploadDuration, "ms:", e);
        console.error("[MediaJobs Upload] Error stack:", e.stack);

        // Never return 429 from upload route - it has no rate limiting
        const statusCode = e.statusCode || 500;
        if (statusCode === 429) {
          console.error("[MediaJobs Upload] WARNING: 429 error from upload route - this should not happen!");
        }

        res.status(statusCode).json({ error: e.message || "Upload failed" });
      }
    },
  );

  // Multer error handler for upload route
  app.use("/api/media-jobs/upload", ((err: any, _req: Request, res: Response, next: any) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: `File exceeds maximum size of ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB`,
      });
      return;
    }
    if (err?.name === "MulterError" || err?.storageErrors) {
      res.status(400).json({ error: err.message || "Upload error" });
      return;
    }
    next(err);
  }) as any);

  // ========================================
  // Presigned URL upload (bypasses Cloudflare size limit)
  // Phase 1: Client requests a presigned PUT URL
  // Phase 2: Client uploads directly to R2/S3
  // Phase 3: Client confirms upload to get public URI
  // ========================================

  app.post(
    "/api/media-jobs/upload/init",
    async (req: Request, res: Response) => {
      try {
        const authResult = await authenticateMediaJobRequest(req, res);
        if (!authResult) return;

        const { filename, contentType, fileSize } = req.body as {
          filename?: string;
          contentType?: string;
          fileSize?: number;
        };

        if (!filename || typeof filename !== "string") {
          res.status(400).json({ error: "Missing filename" });
          return;
        }
        if (!fileSize || typeof fileSize !== "number" || fileSize <= 0) {
          res.status(400).json({ error: "Missing or invalid fileSize" });
          return;
        }
        if (fileSize > MAX_UPLOAD_SIZE) {
          res.status(400).json({
            error: `File too large: ${(fileSize / (1024 * 1024 * 1024)).toFixed(1)}GB exceeds limit of ${MAX_UPLOAD_SIZE / (1024 * 1024 * 1024)}GB`,
          });
          return;
        }

        const ext = filename.split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
          res.status(400).json({
            error: `Unsupported file type: .${ext}. Allowed: ${Array.from(ALLOWED_UPLOAD_EXTENSIONS).join(", ")}`,
          });
          return;
        }

        const assetId = nanoid(21);
        const storageKey = `media-jobs/assets/${assetId}/${filename}`;

        const { storagePresignPut } = await import("../storage");
        const ct = contentType || "application/octet-stream";
        const presigned = await storagePresignPut(storageKey, ct, fileSize);

        if (!presigned) {
          res.json({ method: "multipart" as const });
          return;
        }

        const mediaAssetId = await registerMediaJobAsset({
          auth: authResult,
          storageKey: presigned.key,
          originalUrl: null,
          mimeType: ct,
          fileSize,
          status: "pending",
        });

        console.log("[MediaJobs Upload/Init]", authResult.userId, assetId, filename, fileSize);
        res.json({
          method: "presigned" as const,
          assetId,
          key: presigned.key,
          uploadUrl: presigned.url,
          ...(mediaAssetId ? { mediaAssetId: String(mediaAssetId) } : {}),
        });
      } catch (e: any) {
        console.error("[MediaJobs Upload/Init] Error:", e);
        res.status(500).json({ error: e.message || "Init failed" });
      }
    },
  );

  app.post(
    "/api/media-jobs/upload/complete",
    async (req: Request, res: Response) => {
      try {
        const authResult = await authenticateMediaJobRequest(req, res);
        if (!authResult) return;

        const { assetId, key } = req.body as {
          assetId?: string;
          key?: string;
          contentType?: string;
          fileSize?: number;
        };

        if (!assetId || !key) {
          res.status(400).json({ error: "Missing assetId or key" });
          return;
        }

        const expectedPrefix = `media-jobs/assets/${assetId}/`;
        if (!key.startsWith(expectedPrefix)) {
          res.status(400).json({ error: "Invalid key for assetId" });
          return;
        }

        const { storageResolveUrl } = await import("../storage");
        const url = await storageResolveUrl(key);

        if (!url) {
          res.status(500).json({ error: "Failed to resolve storage URL" });
          return;
        }

        const mediaAssetId = await finalizeMediaJobAsset({
          auth: authResult,
          storageKey: key,
          originalUrl: url,
          mimeType: req.body?.contentType,
          fileSize: req.body?.fileSize,
        });

        console.log("[MediaJobs Upload/Complete]", authResult.userId, assetId, url);
        res.json({
          assetId,
          uri: url,
          ...(mediaAssetId ? { mediaAssetId: String(mediaAssetId) } : {}),
        });
      } catch (e: any) {
        console.error("[MediaJobs Upload/Complete] Error:", e);
        res.status(500).json({ error: e.message || "Complete failed" });
      }
    },
  );

  app.post(
    "/api/media-jobs/import-url",
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      let tempPath: string | null = null;
      try {
        const authResult = await authenticateMediaJobRequest(req, res);
        if (!authResult) return;

        const { url, mediaType } = req.body as {
          url?: string;
          mediaType?: string;
        };
        const sourceUrlInput = typeof url === "string" ? url.trim() : "";
        const normalizedMediaType = normalizeRemoteImportMediaType(mediaType);

        if (!sourceUrlInput || !normalizedMediaType) {
          res.status(400).json({ error: "Missing remote asset URL or media type" });
          return;
        }

        let sourceUrl: string;
        try {
          sourceUrl = sanitizeUri(sourceUrlInput, "web_backend");
        } catch {
          res.status(400).json({ error: "Invalid or unsafe remote asset URL" });
          return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
        let response: globalThis.Response;
        try {
          response = await fetch(sourceUrl, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!response.ok) {
          res.status(502).json({ error: `Remote asset fetch failed (${response.status})` });
          return;
        }

        const contentType = normalizeRemoteImportContentType(response.headers.get("content-type"));
        if (!isAllowedRemoteImportContentType(contentType, normalizedMediaType)) {
          res.status(400).json({ error: `Remote asset is not a ${normalizedMediaType} file` });
          return;
        }

        const contentLength = Number(response.headers.get("content-length") || 0);
        if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_SIZE) {
          res.status(413).json({
            error: `Remote asset too large: ${(contentLength / (1024 * 1024 * 1024)).toFixed(1)}GB exceeds limit of ${MAX_UPLOAD_SIZE / (1024 * 1024 * 1024)}GB`,
          });
          return;
        }

        const assetId = nanoid(21);
        const extension = inferRemoteImportExtension(sourceUrl, contentType, normalizedMediaType);
        const filename = `${normalizedMediaType}-${Date.now()}-${nanoid(8)}.${extension}`;
        const storageKey = `media-jobs/assets/${assetId}/${filename}`;
        tempPath = path.join(os.tmpdir(), `media-import-${assetId}-${filename}`);
        const bytes = await writeRemoteResponseToTempFile({
          response,
          tempPath,
          maxBytes: MAX_UPLOAD_SIZE,
        });

        const { url: storageUrl } = await storagePutFromPath(storageKey, tempPath, contentType);
        await fs.unlink(tempPath).catch(() => {});
        tempPath = null;

        const mediaAssetId = await registerMediaJobAsset({
          auth: authResult,
          storageKey,
          originalUrl: storageUrl,
          mimeType: contentType,
          fileSize: bytes,
          status: "ready",
          sourceType: "media_job_import",
        });

        const duration = Date.now() - startTime;
        console.log("[MediaJobs ImportUrl] Success:", authResult.userId, assetId, normalizedMediaType, bytes, `(${duration}ms)`);
        res.json({
          assetId,
          uri: storageUrl,
          bytes,
          contentType,
          ...(mediaAssetId ? { mediaAssetId: String(mediaAssetId) } : {}),
        });
      } catch (e: any) {
        if (tempPath) {
          await fs.unlink(tempPath).catch(() => {});
        }
        const statusCode = e?.statusCode || (e?.name === "AbortError" ? 504 : 500);
        console.error("[MediaJobs ImportUrl] Error:", e?.message || e);
        res.status(statusCode).json({ error: e?.message || "Remote asset import failed" });
      }
    },
  );

  // ========================================
  // REST endpoints (non-tRPC) for direct HTTP access
  // ========================================

  const mediaJobLimiter = rateLimit("media-jobs", { rpm: 30 });
  const mediaJobStatusLimiter = rateLimit("media-jobs-status", { rpm: 600 });

  app.post("/api/media-jobs", mediaJobLimiter, async (req: Request, res: Response) => {
    try {
      const authResult = await authenticateMediaJobRequest(req, res);
      if (!authResult) return;
      const userId = authResult.userId;

      const spec = req.body as MediaJobSpec;
      const jobId = spec.jobId || nanoid(21);
      const fullSpec = { ...spec, jobId };

      const validation = validateWebJobSpec(fullSpec, "web_backend");
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors.join("; ") });
        return;
      }
      try {
        assertTextClipRolloutEnabledForSpec(fullSpec, authResult.tenantId);
      } catch (error) {
        res.status(403).json({
          error:
            error instanceof Error ? error.message : "Text clip rollout is disabled for this tenant cohort",
        });
        return;
      }

      // Check concurrent job limit
      if (!(await checkConcurrencyLimit(userId))) {
        res.status(429).json({
          error:
            "Maximum 3 concurrent media jobs allowed. Wait for a job to complete.",
        });
        return;
      }

      await setJobKey(jobId, "spec", fullSpec);
      const submittedAt = Date.now();
      await setJobKey(jobId, "meta", { userId, submittedAt, nextPollAt: submittedAt + 120_000 });
      await setJobKey(jobId, "status", {
        status: "queued",
        progress: 0,
        jobId,
      });
      await addActiveJob(userId, jobId);
      await addRecentJob(userId, jobId);

      try {
        await dispatchJob(JSON.stringify(fullSpec), userId, jobId, req.requestId);
      } catch (dispatchErr: any) {
        const detail = dispatchErr?.message || "unknown";
        const errMsg = `Failed to dispatch to worker: ${detail}`;
        console.error("[MediaJobs] dispatch failed:", detail);
        await setJobKey(jobId, "status", {
          status: "error",
          progress: 0,
          jobId,
          message: errMsg,
        });
        await removeActiveJob(userId, jobId);
        notifyJobFailure(userId, jobId, errMsg);
        res.status(502).json({ error: errMsg });
        return;
      }

      res.json({ jobId });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.get("/api/media-jobs/:id", mediaJobStatusLimiter, async (req: Request, res: Response) => {
    try {
      const authResult = await authenticateMediaJobRequest(req, res);
      if (!authResult) return;

      const meta = await getJobKey(req.params.id, "meta");
      if (!meta) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      if (meta.userId !== authResult.userId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const status = await getJobKey(req.params.id, "status");
      if (!status) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      // Attach result/error for terminal states (matches tRPC getStatus)
      if (status.status === "done") {
        const result = await getJobKey(req.params.id, "result");
        res.json({ ...status, result });
        return;
      }
      if (status.status === "error") {
        const error = await getJobKey(req.params.id, "error");
        res.json({ ...status, error });
        return;
      }

      res.json(status);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.delete("/api/media-jobs/:id", mediaJobLimiter, async (req: Request, res: Response) => {
    try {
      const authResult = await authenticateMediaJobRequest(req, res);
      if (!authResult) return;

      const meta = await getJobKey(req.params.id, "meta");
      if (!meta) {
        res.status(404).json({ error: "Job not found" });
        return;
      }
      if (meta.userId !== authResult.userId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const cancelStatus = {
        jobId: req.params.id,
        status: "canceled",
        progress: 0,
      };
      await setJobKey(req.params.id, "status", cancelStatus);
      await publishProgress(req.params.id, cancelStatus);
      await removeActiveJob(authResult.userId, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  // Stale job cleanup moved to Cloud Scheduler: cleanup-redis-stale (every 5 min)
  // See python-backend/app/api/v1/task_handlers.py cleanup_redis_stale endpoint
}
