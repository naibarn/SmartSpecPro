/**
 * Feature 135 — Hermes Grok media worker: `hermesMedia` task projection,
 * fee reconciliation, cancel, and claim-time reference-URL minting.
 *
 * Mirrors `mcpMediaAdapter.ts`'s public surface, but stores nothing new —
 * every projection is built from the existing worker fabric tables
 * (`worker_jobs`, `worker_artifacts`) via an injectable repo. Section 05
 * (`hermesMediaScheduler.ts`) already owns job submission; this module is a
 * pure read + narrow side-effect (cancel, fee refund, URL mint) layer on
 * top of it.
 *
 * Namespace note: this is the `hermesMedia` / `hermes_media` namespace —
 * see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`. This
 * file must never reference the unrelated pre-existing agent-gateway
 * Hermes lane's queueing helper or tenant runtime flag
 * (`server/services/workerSchedulerService.ts`).
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import {
  mediaAssets,
  workerJobEvents,
  workerJobs,
  type WorkerJob,
} from "../../drizzle/schema";
import {
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
} from "../../shared/workerRuntime";
import {
  hermesErrorCopy,
  parseHermesErrorMessage,
  type HermesMediaErrorCode,
  type HermesMediaJobContract,
} from "../../shared/hermesMedia";
import type { MediaTask, TaskStatus } from "./mediaGenerationService";
import { storagePresignGet, storageResolveUrl } from "../storage";
import { cancelQueuedUserWorkerJob } from "./workerJobMonitorService";
import {
  billingEnvelopeFromMetadata,
  type WorkerJobBillingEnvelope,
} from "./workerBillingService";
import { refundReservation } from "./creditService";
import { getCacheClient } from "./redisClients";
import { debugError } from "../_core/logger";

// ────────────────────────────────────────────────────────────────────────
// Task id helpers
// ────────────────────────────────────────────────────────────────────────

const HERMES_TASK_ID_PREFIX = "hermes_";

/** True for `hermes_<jobId>` with a non-empty remainder — false for the
 *  bare `"hermes_"` string, `mcp_` ids, and any other transport's ids. */
export function isHermesMediaTaskId(taskId: string): boolean {
  return (
    typeof taskId === "string" &&
    taskId.startsWith(HERMES_TASK_ID_PREFIX) &&
    taskId.length > HERMES_TASK_ID_PREFIX.length
  );
}

export function hermesTaskIdToJobId(taskId: string): string {
  return taskId.slice(HERMES_TASK_ID_PREFIX.length);
}

function isHermesMediaJobType(jobType: string): boolean {
  return jobType === HERMES_MEDIA_IMAGE_JOB_TYPE || jobType === HERMES_MEDIA_VIDEO_JOB_TYPE;
}

// ────────────────────────────────────────────────────────────────────────
// Repo seam
// ────────────────────────────────────────────────────────────────────────

export interface HermesMediaAssetRow {
  id: number;
  storageKey: string;
}

export interface HermesMediaAdapterRepo {
  getJobById(jobId: string): Promise<WorkerJob | null>;
  /** Re-verifies tenant + owner at read/mint time — never trusts a cached id. */
  getMediaAssetForOwner(params: {
    id: number;
    tenantId: string;
    userId: number;
  }): Promise<HermesMediaAssetRow | null>;
  appendJobEvent(params: {
    jobId: string;
    eventType: string;
    payloadJson: Record<string, unknown>;
  }): Promise<void>;
}

export const defaultHermesMediaAdapterRepo: HermesMediaAdapterRepo = {
  async getJobById(jobId) {
    const db = getDb();
    const [row] = await db.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
    return row ?? null;
  },

  async getMediaAssetForOwner({ id, tenantId, userId }) {
    if (!Number.isFinite(id)) return null;
    const db = getDb();
    const [row] = await db
      .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, id),
          eq(mediaAssets.tenantId, tenantId),
          eq(mediaAssets.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async appendJobEvent({ jobId, eventType, payloadJson }) {
    const db = getDb();
    await db.insert(workerJobEvents).values({ workerJobId: jobId, eventType, payloadJson });
  },
};

// ────────────────────────────────────────────────────────────────────────
// Status mapping
// ────────────────────────────────────────────────────────────────────────

const HERMES_CANCEL_REQUESTED_EVENT_TYPE = "hermes_media_cancel_requested";
const HERMES_ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set([
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
]);

function deriveHermesTaskStatus(jobStatus: string): { status: TaskStatus; errorCode?: HermesMediaErrorCode } {
  if (jobStatus === "queued" || jobStatus === "claimed" || jobStatus === "preparing") {
    return { status: "pending" };
  }
  if (
    jobStatus === "running" ||
    jobStatus === "uploading" ||
    jobStatus === "publishing" ||
    jobStatus === "indexing"
  ) {
    return { status: "processing" };
  }
  if (jobStatus === "completed") return { status: "completed" };
  if (jobStatus === "canceled") return { status: "failed", errorCode: "HERMES_JOB_CANCELLED" };
  // failed | expired
  return { status: "failed" };
}

function deriveHermesErrorMessage(
  failureReason: string | null | undefined,
  errorCodeOverride?: HermesMediaErrorCode,
): string | undefined {
  if (errorCodeOverride) return hermesErrorCopy(errorCodeOverride).th;
  if (!failureReason) return undefined;
  const parsedCode = parseHermesErrorMessage(failureReason);
  if (parsedCode) return hermesErrorCopy(parsedCode).th;
  // Never fabricate a message, but never surface raw stderr either — if the
  // worker didn't follow the `[HERMES_X] ...` convention, fall back to the
  // stored failureReason as-is (it is at minimum a human-authored string,
  // never a stack trace, since only `recordWorkerJobEvent`'s sanitized
  // payload ever reaches this column).
  return failureReason;
}

async function resolveSignedUrl(
  storageKey: string,
  presign: typeof storagePresignGet,
  expiresInSeconds = 3600,
): Promise<string> {
  const presigned = await presign(storageKey, expiresInSeconds);
  if (presigned) return presigned.url;
  const resolved = await storageResolveUrl(storageKey);
  return resolved ?? `/api/storage/files/${storageKey}`;
}

// ────────────────────────────────────────────────────────────────────────
// getHermesMediaTask
// ────────────────────────────────────────────────────────────────────────

export interface GetHermesMediaTaskDeps {
  repo?: HermesMediaAdapterRepo;
  presign?: typeof storagePresignGet;
}

export async function getHermesMediaTask(
  taskId: string,
  userId: number,
  deps: GetHermesMediaTaskDeps = {},
): Promise<MediaTask | null> {
  const repo = deps.repo ?? defaultHermesMediaAdapterRepo;
  const presign = deps.presign ?? storagePresignGet;

  const jobId = hermesTaskIdToJobId(taskId);
  const job = await repo.getJobById(jobId);
  if (!job) return null;
  // Ownership: never leak details about a job belonging to another user (or
  // tenant — `requestedByUserId` is only ever set for the tenant that
  // created it, so a mismatch here also catches a cross-tenant lookup).
  if (job.requestedByUserId == null || job.requestedByUserId !== userId) return null;

  const contract = (job.inputJson ?? {}) as Partial<HermesMediaJobContract>;
  const mediaType: MediaTask["mediaType"] = job.jobType === HERMES_MEDIA_VIDEO_JOB_TYPE ? "video" : "image";
  const { status, errorCode } = deriveHermesTaskStatus(job.status);
  const workerBilling = billingEnvelopeFromMetadata(
    (job.instructionsJson as Record<string, unknown> | null | undefined)?.workerBilling,
  );

  let resultUrl: string | undefined;
  if (status === "completed") {
    const outputJson = (job.outputJson ?? {}) as Record<string, unknown>;
    const mediaAssetIdRaw = outputJson.mediaAssetId;
    const mediaAssetId = typeof mediaAssetIdRaw === "string" || typeof mediaAssetIdRaw === "number"
      ? Number(mediaAssetIdRaw)
      : NaN;
    if (Number.isFinite(mediaAssetId) && job.requestedByUserId != null) {
      const asset = await repo.getMediaAssetForOwner({
        id: mediaAssetId,
        tenantId: job.tenantId,
        userId: job.requestedByUserId,
      });
      if (asset?.storageKey) {
        resultUrl = await resolveSignedUrl(asset.storageKey, presign);
      }
    }
    // A "completed" job with no registered asset is a diagnosable state —
    // `resultUrl` is intentionally left undefined rather than fabricated
    // from an un-finalized artifact.
  }

  const errorMessage = status === "failed"
    ? deriveHermesErrorMessage(job.failureReason, errorCode)
    : undefined;

  const capabilityRequirements = (job.capabilityRequirementsJson ?? {}) as Record<string, unknown>;

  const task: MediaTask = {
    id: taskId,
    taskId: job.id,
    userId: String(userId),
    mediaType,
    status,
    model: contract.settings?.model ?? "",
    prompt: contract.prompt ?? "",
    parameters: {
      ...contract,
      ...(workerBilling ? { workerBilling } : {}),
    },
    ...(resultUrl ? { resultUrl } : {}),
    resultData: {
      jobId: job.id,
      jobType: job.jobType,
      connectionId: typeof capabilityRequirements.connectionId === "string" ? capabilityRequirements.connectionId : undefined,
    },
    ...(errorMessage ? { errorMessage } : {}),
    creditsUsed: workerBilling?.reservedCredits ?? 0,
    createdAt: (job.createdAt instanceof Date ? job.createdAt : new Date(job.createdAt)).toISOString(),
    ...(job.startedAt ? { startedAt: new Date(job.startedAt).toISOString() } : {}),
    ...(job.finishedAt ? { completedAt: new Date(job.finishedAt).toISOString() } : {}),
  };

  return task;
}

// ────────────────────────────────────────────────────────────────────────
// cancelHermesMediaTask
// ────────────────────────────────────────────────────────────────────────

export interface CancelHermesMediaTaskDeps {
  repo?: HermesMediaAdapterRepo;
  cancelQueuedJob?: typeof cancelQueuedUserWorkerJob;
}

export async function cancelHermesMediaTask(
  taskId: string,
  userId: number,
  deps: CancelHermesMediaTaskDeps = {},
): Promise<void> {
  const repo = deps.repo ?? defaultHermesMediaAdapterRepo;
  const cancelQueuedJob = deps.cancelQueuedJob ?? cancelQueuedUserWorkerJob;

  const jobId = hermesTaskIdToJobId(taskId);
  const job = await repo.getJobById(jobId);
  if (!job || job.requestedByUserId == null || job.requestedByUserId !== userId) {
    throw new Error(`Task ${taskId} not found`);
  }

  if (job.status === "queued") {
    await cancelQueuedJob({ auth: { tenantId: job.tenantId, userId }, jobId });
    return;
  }

  if (HERMES_ACTIVE_JOB_STATUSES.has(job.status)) {
    // The worker-side graceful termination handler is section 07 — this
    // just records the request so the worker (or a future sweep) can act on
    // it. Never mutates job status directly here.
    await repo.appendJobEvent({
      jobId,
      eventType: HERMES_CANCEL_REQUESTED_EVENT_TYPE,
      payloadJson: {},
    });
    return;
  }

  // Already terminal — idempotent no-op.
}

// ────────────────────────────────────────────────────────────────────────
// Fee reconciliation (shared by `reconcileTaskCredits` and the section-04
// terminal sweep's `onTerminalHermesMediaJob` hook — ONE implementation).
// ────────────────────────────────────────────────────────────────────────

/** The only statuses this function ever acts on. Everything else (queued,
 *  claimed, preparing, running, uploading, publishing, indexing — i.e. any
 *  in-flight job) is a defense-in-depth no-op: this function must NEVER
 *  refund (or otherwise touch) a reservation for a job that hasn't actually
 *  reached a terminal state, no matter what a caller passes in. */
const HERMES_FEE_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "failed",
  "canceled",
  "expired",
]);

export interface ReconcileHermesMediaJobFeeParams {
  taskId: string;
  /** Raw terminal `worker_jobs`/`MediaTask` status — pass it through
   *  unmapped; this function does its own terminal-status classification
   *  (see `HERMES_FEE_TERMINAL_STATUSES`) rather than trusting a caller's
   *  pre-collapsed "completed" | "failed" mapping. */
  status: string;
  billing: WorkerJobBillingEnvelope | null;
}

export interface ReconcileHermesMediaJobFeeDeps {
  getRedis?: () => { get(key: string): Promise<string | null>; set(...args: any[]): Promise<unknown> };
  refundReservation?: typeof refundReservation;
}

export async function reconcileHermesMediaJobFee(
  params: ReconcileHermesMediaJobFeeParams,
  deps: ReconcileHermesMediaJobFeeDeps = {},
): Promise<{ adjusted: boolean; difference: number; action: "refund" | "charge" | "none" }> {
  const noOp = { adjusted: false, difference: 0, action: "none" as const };

  // Internal terminal-status guard — a non-terminal (in-flight) status is
  // always a no-op, regardless of what the caller passes.
  if (!HERMES_FEE_TERMINAL_STATUSES.has(params.status)) return noOp;
  if (!params.billing) return noOp;

  const getRedis = deps.getRedis ?? (() => getCacheClient());
  const refund = deps.refundReservation ?? refundReservation;
  const reconcileKey = `credit:reconciled:${params.taskId}`;

  try {
    const redis = getRedis();
    const alreadyReconciled = await redis.get(reconcileKey);
    if (alreadyReconciled) return noOp;

    if (params.status === "completed") {
      await redis.set(
        reconcileKey,
        JSON.stringify({ action: "none", difference: 0, timestamp: Date.now() }),
        "EX",
        86400,
      );
      return noOp;
    }

    // failed | canceled | expired — refund the whole reserved fee, exactly
    // once.
    await refund(params.billing.reservationId);
    const difference = -params.billing.reservedCredits;
    await redis.set(
      reconcileKey,
      JSON.stringify({ action: "refund", difference, timestamp: Date.now() }),
      "EX",
      86400,
    );
    return { adjusted: true, difference, action: "refund" };
  } catch (error) {
    debugError("hermesMediaAdapter", "Fee reconciliation failed", error);
    return noOp;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Reference URL minting — shared by claim-time enrichment and the
// `/api/worker-jobs/:jobId/references/urls` re-mint route (workerRuntime.ts).
// ────────────────────────────────────────────────────────────────────────

export class HermesReferenceAssetOwnershipError extends Error {
  readonly assetId: string;

  constructor(assetId: string) {
    super(`Hermes media reference asset ${assetId} is not owned by the requester`);
    this.name = "HermesReferenceAssetOwnershipError";
    this.assetId = assetId;
  }
}

export interface HermesReferenceUrlMintResult {
  assetId: string;
  url: string;
  expiresAt: string;
}

const HERMES_REFERENCE_URL_TTL_SECONDS = 900;

export interface MintHermesMediaReferenceUrlsParams {
  tenantId: string;
  requestedByUserId: number;
  references: Array<{ assetId: string }>;
  expiresInSeconds?: number;
}

export interface MintHermesMediaReferenceUrlsDeps {
  repo?: HermesMediaAdapterRepo;
  presign?: typeof storagePresignGet;
  now?: () => Date;
}

/**
 * Mints one short-lived signed GET URL per reference `assetId`,
 * re-verifying tenant + requester ownership of the underlying `media_assets`
 * row at mint time (never trusting a cached/prior check). A reference the
 * requester no longer owns is a typed failure
 * (`HermesReferenceAssetOwnershipError`), never a silent skip — the caller
 * decides how to surface that (claim response vs. HTTP error).
 */
export async function mintHermesMediaReferenceUrls(
  params: MintHermesMediaReferenceUrlsParams,
  deps: MintHermesMediaReferenceUrlsDeps = {},
): Promise<HermesReferenceUrlMintResult[]> {
  const repo = deps.repo ?? defaultHermesMediaAdapterRepo;
  const presign = deps.presign ?? storagePresignGet;
  const now = deps.now ?? (() => new Date());
  const expiresInSeconds = params.expiresInSeconds ?? HERMES_REFERENCE_URL_TTL_SECONDS;

  const results: HermesReferenceUrlMintResult[] = [];
  for (const reference of params.references) {
    const assetId = Number(reference.assetId);
    const asset = Number.isFinite(assetId)
      ? await repo.getMediaAssetForOwner({
          id: assetId,
          tenantId: params.tenantId,
          userId: params.requestedByUserId,
        })
      : null;
    if (!asset) {
      throw new HermesReferenceAssetOwnershipError(reference.assetId);
    }
    const url = await resolveSignedUrl(asset.storageKey, presign, expiresInSeconds);
    results.push({
      assetId: reference.assetId,
      url,
      expiresAt: new Date(now().getTime() + expiresInSeconds * 1000).toISOString(),
    });
  }
  return results;
}

/** Extracts the `references[].assetId` list from a hermes media job's
 *  frozen `inputJson` contract — pure/defensive (never throws on a
 *  malformed row). Callers holding a loosely-typed `Record<string, any>`
 *  job row (e.g. `claimWorkerJob`'s return in `server/routes/workerRuntime.ts`)
 *  must cast to `WorkerJob` first — a `Record<string, any>` intersection
 *  does not statically satisfy `Pick<WorkerJob, "inputJson">` even though
 *  the runtime value has the field. */
export function extractHermesJobReferenceAssetIds(job: Pick<WorkerJob, "inputJson">): Array<{ assetId: string }> {
  const references = (job.inputJson as Record<string, unknown> | null | undefined)?.references;
  if (!Array.isArray(references)) return [];
  return references
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const assetId = (entry as Record<string, unknown>).assetId;
      return typeof assetId === "string" && assetId.length > 0 ? { assetId } : null;
    })
    .filter((entry): entry is { assetId: string } => Boolean(entry));
}

export { isHermesMediaJobType };
