import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { validateJobSpec, VALID_JOB_TYPES } from "../../shared/types/mediaJob";
import type { MediaJobSpec } from "../../shared/types/mediaJob";
import { sanitizeUri, validateWebJobSpec } from "../../shared/types/mediaJobValidation";
import { nanoid } from "nanoid";
import type { Express, Request, Response } from "express";
import type { VideoEditorProject } from "../../client/src/types/videoEditor";
import { authorizeRequest } from "../_core/authz";
import type { TenantRequest } from "../_core/tenant";
import { rateLimit } from "../_core/limits";
import multer from "multer";
import { assertR2StorageActive, storagePut, storagePutFromPath } from "../storage";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { mediaAssets, videoEditorProjectAssets, videoEditorProjects, workerJobs } from "../../drizzle/schema";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { assertTextClipRolloutEnabledForSpec } from "../services/textClipRollout";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { buildMediaJobHandle, shouldPollAsyncJobHandle } from "../services/asyncJobHandle";
import { classifyCreditFailure } from "../services/creditFailurePolicy";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { createJobControlPlane } from "../services/jobControlPlane";

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

type CanonicalMediaJobSnapshot = {
  jobId: string;
  jobType: string;
  tenantId: string;
  status: string;
  requestedByUserId: number | null;
  input: Record<string, unknown>;
  progress: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredMediaJobSpec = Record<string, unknown> & {
  jobType?: string;
  output?: { target?: string };
};

function toStoredMediaJobSpec(value: unknown): StoredMediaJobSpec {
  const record = asRecord(value);
  const output = asRecord(record.output);
  return {
    ...record,
    ...(typeof record.jobType === "string" ? { jobType: record.jobType } : {}),
    ...(typeof output.target === "string" ? { output: { target: output.target } } : {}),
  };
}

function parseStoredMediaSpec(snapshot: CanonicalMediaJobSnapshot): StoredMediaJobSpec | null {
  const input = asRecord(snapshot.input);
  if (snapshot.jobType === "video.render") {
    const renderSpec = asRecord(input.renderSpec);
    return Object.keys(renderSpec).length > 0
      ? toStoredMediaJobSpec({
          ...renderSpec,
          jobType: "render_mp4_h264",
          output: { target: renderSpec.outputKey },
        })
      : toStoredMediaJobSpec(input);
  }
  if (snapshot.jobType !== "python.legacy_task" || input.taskName !== "app.tasks.media_job_worker.execute_media_job") {
    return null;
  }
  const args = Array.isArray(input.args) ? input.args : [];
  const rawSpec = args[0];
  if (typeof rawSpec === "string") {
    try {
      const parsed: unknown = JSON.parse(rawSpec);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? toStoredMediaJobSpec(parsed)
        : null;
    } catch {
      return null;
    }
  }
  return rawSpec && typeof rawSpec === "object" && !Array.isArray(rawSpec)
    ? toStoredMediaJobSpec(rawSpec)
    : null;
}

function canonicalStatusToMediaStatus(status: string): string {
  switch (status) {
    case "pending":
    case "queued":
    case "retry_scheduled":
      return "queued";
    case "leased":
    case "claimed":
    case "preparing":
    case "running":
    case "waiting_external":
    case "uploading":
    case "publishing":
    case "indexing":
      return "processing";
    case "succeeded":
    case "completed":
      return "done";
    case "cancelled":
    case "canceled":
      return "canceled";
    case "failed":
    case "expired":
      return "error";
    default:
      return status;
  }
}

type MediaJobArtifact = {
  uri?: string;
};

type StoredMediaJobResult = Record<string, unknown> & {
  artifacts?: MediaJobArtifact[];
  resultUrl?: string;
};

type StoredMediaJobStatus = {
  jobId: string;
  status: string;
  progress?: number;
  stage?: string;
  message?: string;
  result?: StoredMediaJobResult;
  resultUrl?: string;
};

type StoredMediaJobMeta = {
  userId: string;
  tenantId: string;
  submittedAt: number;
  nextPollAt?: number | null;
};

type StoredMediaJobError = {
  code: string | null;
  message: string | null;
};

function toStoredMediaJobResult(value: unknown): StoredMediaJobResult {
  const record = asRecord(value);
  const artifacts = Array.isArray(record.artifacts)
    ? record.artifacts.flatMap(artifact => {
        const item = asRecord(artifact);
        return typeof item.uri === "string" ? [{ uri: item.uri }] : [];
      })
    : undefined;
  const resultUrl = typeof record.resultUrl === "string" ? record.resultUrl : undefined;

  return {
    ...record,
    ...(artifacts ? { artifacts } : {}),
    ...(resultUrl ? { resultUrl } : {}),
  };
}

function toMediaJobStatus(snapshot: CanonicalMediaJobSnapshot): StoredMediaJobStatus {
  const progress = asRecord(snapshot.progress);
  const legacy = asRecord(progress.legacyStatus);
  const output = toStoredMediaJobResult(snapshot.output ?? legacy.result);
  const outputUrl = extractFirstArtifactUrl(output);
  return {
    jobId: snapshot.jobId,
    status: canonicalStatusToMediaStatus(snapshot.status),
    progress: typeof progress.progress === "number" ? progress.progress / 100 : 0,
    stage: typeof progress.stage === "string" ? progress.stage : undefined,
    message: snapshot.errorMessage ?? (typeof progress.message === "string" ? progress.message : undefined),
    ...(output ? { result: output } : {}),
    ...(outputUrl ? { resultUrl: outputUrl } : {}),
  };
}

function getJobKey(jobId: string, suffix: "meta"): Promise<StoredMediaJobMeta | null>;
function getJobKey(jobId: string, suffix: "spec"): Promise<StoredMediaJobSpec | null>;
function getJobKey(jobId: string, suffix: "status"): Promise<StoredMediaJobStatus | null>;
function getJobKey(jobId: string, suffix: "result"): Promise<StoredMediaJobResult | null>;
function getJobKey(jobId: string, suffix: "error"): Promise<StoredMediaJobError | null>;
async function getJobKey(
  jobId: string,
  suffix: "meta" | "spec" | "status" | "result" | "error",
): Promise<
  | StoredMediaJobMeta
  | StoredMediaJobSpec
  | StoredMediaJobStatus
  | StoredMediaJobResult
  | StoredMediaJobError
  | null
> {
  const snapshot = await createJobControlPlane().getJobSnapshot(jobId) as CanonicalMediaJobSnapshot | null;
  if (!snapshot) return null;
  const status = toMediaJobStatus(snapshot);
  switch (suffix) {
    case "meta":
      return {
        userId: snapshot.requestedByUserId === null ? "" : String(snapshot.requestedByUserId),
        tenantId: snapshot.tenantId,
        submittedAt: Date.parse(snapshot.createdAt),
      };
    case "spec":
      return parseStoredMediaSpec(snapshot);
    case "status":
      return status;
    case "result":
      return toStoredMediaJobResult(
        snapshot.output ?? asRecord(asRecord(snapshot.progress).legacyStatus).result,
      );
    case "error":
      return snapshot.errorMessage || snapshot.errorCode
        ? { code: snapshot.errorCode, message: snapshot.errorMessage }
        : null;
    default:
      return null;
  }
}

async function getRecentJobIds(userId: string, limit = 50): Promise<string[]> {
  const numericUserId = Number(userId);
  if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) return [];
  const database = getDb();
  const rows = await database
    .select({ id: workerJobs.id, jobType: workerJobs.jobType, input: workerJobs.inputJson })
    .from(workerJobs)
    .where(eq(workerJobs.requestedByUserId, numericUserId))
    .orderBy(desc(workerJobs.createdAt), desc(workerJobs.id))
    .limit(Math.min(200, limit * 4));
  return rows
    .filter(row => row.jobType === "video.render" || (
      row.jobType === "python.legacy_task" &&
      asRecord(row.input).taskName === "app.tasks.media_job_worker.execute_media_job"
    ))
    .slice(0, limit)
    .map(row => row.id);
}

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

function resolveTenantIdForContext(ctx: { tenantId?: unknown; user?: { currentTenantId?: unknown } }): string | null {
  const value = ctx.tenantId ?? ctx.user?.currentTenantId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
// Canonical Python job dispatch boundary
// ========================================

/**
 * Resolve relative URIs (e.g. /uploads/...) in a job spec to absolute URLs
 * so the Python job worker can fetch them over HTTP.
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

async function dispatchToPythonJobEndpoint(
  specJson: string,
  userId: string,
  jobId: string,
  tenantId?: string | null,
  requestId?: string,
): Promise<{ jobId: string }> {
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
    body: JSON.stringify({
      spec_json: resolvedSpecJson,
      user_id: userId,
      job_id: jobId,
      tenant_id: tenantId || undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Python job dispatch failed: ${res.status} ${body}`);
  }

  const body = await res.json().catch(() => ({}));
  if (typeof body?.taskId !== "string" || !body.taskId) {
    throw new Error("Python job dispatch did not return a canonical worker job ID");
  }
  return { jobId: body.taskId };
}

async function dispatchJob(
  specJson: string,
  userId: string,
  jobId: string,
  tenantId?: string | null,
  requestId?: string,
) : Promise<{ jobId: string }> {
  // Provider polling is owned by the durable canonical control plane. The
  // The Python ingress endpoint creates the canonical job; transport selection
  // remains server-owned by the control-plane outbox.
  return dispatchToPythonJobEndpoint(specJson, userId, jobId, tenantId, requestId);
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
  tenantId?: string | null;
  requestId?: string;
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

  const requestedJobId = spec.jobId || nanoid(21);
  const userId = String(input.userId);
  const canonicalSpec = { ...spec, jobId: requestedJobId };
  return dispatchJob(JSON.stringify(canonicalSpec), userId, requestedJobId, input.tenantId, input.requestId);
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
      if (!tenantId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant context is required for video rendering" });
      }

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

      // Admit rendering directly to the canonical PostgreSQL control plane.
      try {
        const created = await createControlPlaneJob({
          context: {
            tenantId,
            actorType: "user",
            actorId: ctx.user.id,
            authorizationScope: "media:render",
            correlationId: `media-render:${jobId}`,
            idempotencyKey: `media-render:${tenantId}:${jobId}`,
          },
          definition: {
            contractVersion: "feature-186-v1",
            jobType: "video.render",
            executionClass: "cpu",
            input: { renderSpec, queueName },
            retryPolicy: {
              maxAttempts: 3,
              baseDelayMs: 5_000,
              maxDelayMs: 15 * 60_000,
              jitter: "bounded",
              deadlineMs: 6 * 60 * 60 * 1000,
              allowedErrorClasses: ["retryable", "timeout", "unavailable"],
            },
            timeoutPolicy: {
              softTimeoutMs: 30 * 60_000,
              hardTimeoutMs: 35 * 60_000,
            },
            requiredCapabilities: { runtime: "cloudflare-container", queue: queueName },
          },
        });
        return { cached: false, jobId: created.jobId, renderHash, queueName };
      } catch (e: unknown) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to dispatch render job",
        });
      }

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

      // Dispatch through the canonical Python job boundary.
      let canonicalJobId: string;
      try {
        ({ jobId: canonicalJobId } = await dispatchJob(JSON.stringify(spec), String(ctx.user.id), jobId, tenantId, ctx.req.requestId));
      } catch (e: unknown) {
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
          requestPayload: { jobId: canonicalJobId, jobType: spec.jobType },
        });
      } catch {
        // Best-effort
      }

      // PostHog: job_submitted event (best-effort)
      try {
        const { captureServerEvent } = await import("../services/posthog");
        captureServerEvent(String(ctx.user.id), "job_submitted", {
          job_type: spec.jobType,
          job_id: canonicalJobId,
        });
      } catch {
        // Best-effort
      }

      return { jobId: canonicalJobId };
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

      await createJobControlPlane().cancel(
        input.jobId,
        "cancelled_by_request",
        undefined,
        ctx.user.id,
        ctx.user.role === "admin" ? undefined : {
          tenantId: meta.tenantId,
          requestedByUserId: ctx.user.id,
        },
      );

      return { success: true };
    }),

  listJobs: protectedProcedure.query(async ({ ctx }) => {
    const userId = String(ctx.user.id);

    const jobIds = await getRecentJobIds(userId, 50);

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
      if (!meta) continue;

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

    // PostgreSQL worker_jobs is authoritative; SSE polls durable state instead
    // of depending on a Redis Pub/Sub side channel.
    const writeSnapshot = async () => {
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
    };
    const pollInterval = setInterval(() => void writeSnapshot(), 2000);
    void writeSnapshot();

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(pollInterval);
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
        const projectId = typeof req.body?.projectId === "string" || typeof req.body?.projectId === "number"
          ? req.body.projectId
          : undefined;

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
            "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska",
            "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/aac", "audio/mp4", "audio/webm",
            "image/jpeg", "image/png", "image/webp", "image/gif", "application/octet-stream",
          ]);
          if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype)) {
            await fs.unlink(file.path).catch(() => {}); // Clean up temp file
            res.status(400).json({ error: `Unsupported MIME type: ${file.mimetype}` });
            return;
          }

          const assetId = nanoid(21);
          const safeFilename = path.basename(file.originalname).replace(/[\u0000-\u001f\\/]+/g, "_").slice(0, 220) || "upload";
          const storageKey = `media-jobs/assets/${assetId}/${safeFilename}`;

          console.log("[MediaJobs Upload] File received:", file.originalname, file.size, "bytes");

          // Generated/editor media must never be published from local disk.
          const { assertR2StorageActive } = await import("../storage");
          await assertR2StorageActive();
          console.log("[MediaJobs Upload] Uploading to protected R2 storage");
          const fileBuffer = await fs.readFile(file.path);
          console.log("[MediaJobs Upload] File read complete:", fileBuffer.length, "bytes");

          const { url } = await storagePut(
            storageKey,
            fileBuffer,
            file.mimetype || "application/octet-stream",
          );
          console.log("[MediaJobs Upload] Storage upload complete");

          // Clean up temp file only after the R2 upload has completed.
          await fs.unlink(file.path).catch(e => console.warn("[Upload] Cleanup failed:", e));

          const mediaAssetId = await registerMediaJobAsset({
            auth: authResult,
            storageKey,
            originalUrl: url,
            mimeType: file.mimetype || "application/octet-stream",
            fileSize: file.size,
            status: "ready",
          });

          const numericProjectId = typeof projectId === "number" ? projectId : Number(projectId);
          const userId = Number(authResult.userId);
          if (mediaAssetId && Number.isInteger(numericProjectId) && numericProjectId > 0 && Number.isInteger(userId) && userId > 0 && authResult.tenantId) {
            const database = getDb();
            const [ownedProject] = await database.select({ id: videoEditorProjects.id })
              .from(videoEditorProjects)
              .where(and(eq(videoEditorProjects.id, numericProjectId), eq(videoEditorProjects.userId, userId)))
              .limit(1);
            if (ownedProject) {
              await database.insert(videoEditorProjectAssets).values({
                projectId: numericProjectId,
                tenantId: authResult.tenantId,
                namespace: "media_asset",
                assetRef: { namespace: "media_asset", id: mediaAssetId },
              }).onConflictDoNothing();
            }
          }

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

        const { filename, contentType, fileSize, projectId, idempotencyKey } = req.body as {
          filename?: string;
          contentType?: string;
          fileSize?: number;
          projectId?: number | string;
          idempotencyKey?: string;
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
        const safeFilename = path.basename(filename).replace(/[\u0000-\u001f\\/]+/g, "_").slice(0, 220) || "upload";
        const storageKey = `media-jobs/assets/${assetId}/${safeFilename}`;

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
          ...(projectId !== undefined ? { projectId } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
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

        const { assetId, key, projectId } = req.body as {
          assetId?: string;
          key?: string;
          contentType?: string;
          fileSize?: number;
          projectId?: number | string;
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

        const numericProjectId = typeof projectId === "number" ? projectId : Number(projectId);
        const userId = Number(authResult.userId);
        let ownsProject = false;
        if (Number.isInteger(numericProjectId) && numericProjectId > 0 && Number.isInteger(userId) && userId > 0) {
          const database = getDb();
          const [project] = await database.select({ id: videoEditorProjects.id })
            .from(videoEditorProjects)
            .where(and(eq(videoEditorProjects.id, numericProjectId), eq(videoEditorProjects.userId, userId)))
            .limit(1);
          ownsProject = !!project;
        }
        if (mediaAssetId && ownsProject && Number.isInteger(numericProjectId) && numericProjectId > 0 && authResult.tenantId) {
          const database = getDb();
          await database.insert(videoEditorProjectAssets).values({
            projectId: numericProjectId,
            tenantId: authResult.tenantId,
            namespace: "media_asset",
            assetRef: { namespace: "media_asset", id: mediaAssetId },
          }).onConflictDoNothing();
        }

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

        const { url, mediaType, projectId } = req.body as {
          url?: string;
          mediaType?: string;
          projectId?: number | string;
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

        await assertR2StorageActive();
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

        const numericProjectId = typeof projectId === "number" ? projectId : Number(projectId);
        const userId = Number(authResult.userId);
        if (mediaAssetId && Number.isInteger(numericProjectId) && numericProjectId > 0 && Number.isInteger(userId) && userId > 0 && authResult.tenantId) {
          const database = getDb();
          const [ownedProject] = await database.select({ id: videoEditorProjects.id })
            .from(videoEditorProjects)
            .where(and(eq(videoEditorProjects.id, numericProjectId), eq(videoEditorProjects.userId, userId)))
            .limit(1);
          if (ownedProject) {
            await database.insert(videoEditorProjectAssets).values({
              projectId: numericProjectId,
              tenantId: authResult.tenantId,
              namespace: "media_asset",
              assetRef: { namespace: "media_asset", id: mediaAssetId },
            }).onConflictDoNothing();
          }
        }

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

      let canonicalJobId: string;
      try {
        ({ jobId: canonicalJobId } = await dispatchJob(JSON.stringify(fullSpec), userId, jobId, authResult.tenantId, req.requestId));
      } catch (dispatchErr: any) {
        const detail = dispatchErr?.message || "unknown";
        const errMsg = `Failed to dispatch to worker: ${detail}`;
        console.error("[MediaJobs] dispatch failed:", detail);
        notifyJobFailure(userId, jobId, errMsg);
        res.status(502).json({ error: errMsg });
        return;
      }

      res.json({ jobId: canonicalJobId });
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

      await createJobControlPlane().cancel(
        req.params.id,
        "cancelled_by_request",
        undefined,
        Number(authResult.userId),
        {
          tenantId: meta.tenantId,
          requestedByUserId: Number(authResult.userId),
        },
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  // Canonical worker_jobs retention and recovery are managed by the job control plane.
}
