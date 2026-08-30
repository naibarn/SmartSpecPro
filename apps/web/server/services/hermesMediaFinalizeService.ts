/**
 * Feature 135 — Hermes Grok media worker: artifact finalize.
 *
 * Model: `hyperframesLibraryFinalizeService.ts`. Invoked from the
 * `/api/worker-jobs/:jobId/artifacts/complete` handler
 * (`server/routes/workerRuntime.ts`) after
 * `workerRegistryService.completeWorkerArtifact` has already moved the job
 * to `publishing` — this service re-validates the uploaded object, runs the
 * platform's content-safety gate, registers `media_assets` +
 * `library_items`, stamps `worker_artifacts.publishedItemId`, and completes
 * the job.
 *
 * Namespace note: this is the `hermesMedia` / `hermes_media` namespace —
 * see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import {
  libraryItems,
  mediaAssets,
  workerArtifacts,
  workerJobs,
  type WorkerArtifact,
  type WorkerJob,
} from "../../drizzle/schema";
import { HERMES_MEDIA_VIDEO_JOB_TYPE } from "../../shared/workerRuntime";
import { formatHermesErrorMessage, type HermesMediaErrorCode, type HermesMediaJobContract } from "../../shared/hermesMedia";
import { createLibraryItem, type LibraryActor } from "./libraryService";
import { getUploadsDir, storageResolveUrl, storageStreamFile } from "../storage";
import { isActiveContentUpload, isSvgUpload, sanitizeUploadedSvg } from "./uploadContentSafety";
import { debugError } from "../_core/logger";

// Strict Drizzle-inferred row types. Callers holding a loosely-typed
// `Record<string, any>` row from `workerRegistryService.ts`'s own private
// `WorkerJobRecord`/`WorkerArtifactRecord` conventions (e.g.
// `completeWorkerArtifact`'s return in `server/routes/workerRuntime.ts`)
// must cast to these types at the call site — an intersection with
// `Record<string, any>` does not statically satisfy a target type that
// declares a specific named property, even though the runtime shape
// matches.
type WorkerJobRecord = WorkerJob;
type WorkerArtifactRecord = WorkerArtifact;

// ────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────

export class HermesMediaFinalizeError extends Error {
  readonly code: HermesMediaErrorCode;
  readonly reason?: string;

  constructor(code: HermesMediaErrorCode, reason?: string) {
    super(formatHermesErrorMessage(code, reason));
    this.name = "HermesMediaFinalizeError";
    this.code = code;
    this.reason = reason;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Injectable seams
// ────────────────────────────────────────────────────────────────────────

export interface HermesMediaFinalizeRepo {
  insertMediaAsset(values: Record<string, unknown>): Promise<{ id: number; storageKey: string }>;
  updateArtifact(artifactId: string, values: Record<string, unknown>): Promise<void>;
  updateJob(jobId: string, values: Record<string, unknown>): Promise<void>;
}

export const defaultHermesMediaFinalizeRepo: HermesMediaFinalizeRepo = {
  async insertMediaAsset(values) {
    const db = getDb();
    const [row] = await db
      .insert(mediaAssets)
      .values(values as any)
      .returning({ id: mediaAssets.id, storageKey: mediaAssets.storageKey });
    return row;
  },

  async updateArtifact(artifactId, values) {
    const db = getDb();
    await db.update(workerArtifacts).set(values as any).where(eq(workerArtifacts.id, artifactId));
  },

  async updateJob(jobId, values) {
    const db = getDb();
    await db.update(workerJobs).set(values as any).where(eq(workerJobs.id, jobId));
  },
};

export interface HermesStoredObjectVerification {
  valid: boolean;
  reason?: string;
}

export interface VerifyHermesStoredObjectParams {
  storageRef: string;
  expectedChecksumSha256: string;
  expectedSizeBytes: number;
  expectedContentType?: string | null;
}

async function readStoredObjectBytes(storageRef: string): Promise<Buffer | null> {
  const streamed = await storageStreamFile(storageRef).catch(() => null);
  if (streamed) {
    const chunks: Buffer[] = [];
    const stream = streamed.stream as NodeJS.ReadableStream;
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    return Buffer.concat(chunks);
  }
  const filePath = path.join(getUploadsDir(), storageRef);
  if (!fs.existsSync(filePath)) return null;
  return fs.promises.readFile(filePath);
}

export async function defaultVerifyHermesStoredObject(
  params: VerifyHermesStoredObjectParams,
): Promise<HermesStoredObjectVerification> {
  const buffer = await readStoredObjectBytes(params.storageRef).catch(() => null);
  if (!buffer) return { valid: false, reason: "stored_object_unreadable" };
  const actualChecksum = crypto.createHash("sha256").update(buffer).digest("hex");
  if (params.expectedChecksumSha256 && actualChecksum !== params.expectedChecksumSha256) {
    return { valid: false, reason: "checksum_mismatch" };
  }
  if (params.expectedSizeBytes && buffer.length !== params.expectedSizeBytes) {
    return { valid: false, reason: "size_mismatch" };
  }
  return { valid: true };
}

export interface HermesContentSafetyGateParams {
  storageRef: string;
  contentType: string;
}

export interface HermesContentSafetyGateResult {
  safe: boolean;
  reason?: string;
}

/**
 * Reuses the platform's existing content-safety primitives
 * (`server/services/uploadContentSafety.ts` — spec §16) rather than
 * re-implementing format validation: blocks active-content uploads (HTML
 * disguised with a media content-type/extension) and rejects unsafe SVG.
 * Injectable so tests can stub pass/fail without touching real storage.
 */
export async function defaultHermesContentSafetyGate(
  params: HermesContentSafetyGateParams,
): Promise<HermesContentSafetyGateResult> {
  const extension = path.extname(params.storageRef);
  if (isActiveContentUpload(params.contentType, extension)) {
    return { safe: false, reason: "active_content_upload_blocked" };
  }
  if (isSvgUpload(params.contentType, extension)) {
    const buffer = await readStoredObjectBytes(params.storageRef).catch(() => null);
    if (!buffer) return { safe: false, reason: "stored_object_unreadable" };
    const result = sanitizeUploadedSvg(buffer);
    if (!result.safe) return { safe: false, reason: result.reason ?? "unsafe_svg" };
  }
  return { safe: true };
}

export interface ResolveHermesLibraryFolderOwnerParams {
  folderId: number;
  tenantId: string;
  userId: number;
}

/**
 * Code review fix — `contract.storage.libraryFolderId` is a user-supplied
 * value carried in the (worker-writable, but originally client-submitted)
 * job contract; a malicious/buggy value must never let a finalize publish
 * into a `library_items` folder the requester doesn't own. Returns `true`
 * only when the folder row exists AND belongs to this exact tenant + owner.
 * A missing folder and a foreign folder are deliberately indistinguishable
 * to the caller (both resolve to `false` → publish to root instead).
 */
export async function defaultResolveHermesLibraryFolderOwner(
  params: ResolveHermesLibraryFolderOwnerParams,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.id, params.folderId),
        eq(libraryItems.tenantId, params.tenantId),
        eq(libraryItems.ownerUserId, params.userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export interface HermesMediaFinalizeDeps {
  repo?: HermesMediaFinalizeRepo;
  now?: () => Date;
  verifyStoredObject?: (params: VerifyHermesStoredObjectParams) => Promise<HermesStoredObjectVerification>;
  contentSafetyGate?: (params: HermesContentSafetyGateParams) => Promise<HermesContentSafetyGateResult>;
  createLibraryItem?: typeof createLibraryItem;
  resolveStorageUrl?: (storageKey: string) => Promise<string | null>;
  /** Injectable folder-ownership check (code review fix) — defaults to a
   *  real `library_items` lookup. */
  resolveLibraryFolderOwner?: (params: ResolveHermesLibraryFolderOwnerParams) => Promise<boolean>;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function readMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readMetadataString(value: unknown, key: string): string | null {
  const record = readMetadataRecord(value);
  const raw = record[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readDimensions(metadata: Record<string, unknown>): { width?: number; height?: number } {
  const width = Number(metadata.width);
  const height = Number(metadata.height);
  return {
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
  };
}

function parseLibraryFolderId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function failFinalizeJob(
  repo: HermesMediaFinalizeRepo,
  job: WorkerJobRecord,
  code: HermesMediaErrorCode,
  reason?: string,
): Promise<void> {
  await repo.updateJob(job.id, {
    status: "failed",
    failureReason: formatHermesErrorMessage(code, reason),
    finishedAt: new Date(),
  });
}

// ────────────────────────────────────────────────────────────────────────
// finalizeHermesMediaArtifact
// ────────────────────────────────────────────────────────────────────────

export async function finalizeHermesMediaArtifact(
  params: { job: WorkerJobRecord; artifact: WorkerArtifactRecord },
  deps: HermesMediaFinalizeDeps = {},
): Promise<{ mediaAssetId: string; libraryItemId: string }> {
  const repo = deps.repo ?? defaultHermesMediaFinalizeRepo;
  const now = deps.now ?? (() => new Date());
  const verifyStoredObject = deps.verifyStoredObject ?? defaultVerifyHermesStoredObject;
  const contentSafetyGate = deps.contentSafetyGate ?? defaultHermesContentSafetyGate;
  const createLibraryItemFn = deps.createLibraryItem ?? createLibraryItem;
  const resolveStorageUrl = deps.resolveStorageUrl ?? ((key: string) => storageResolveUrl(key));
  const resolveLibraryFolderOwner = deps.resolveLibraryFolderOwner ?? defaultResolveHermesLibraryFolderOwner;

  const { job, artifact } = params;
  const metadata = readMetadataRecord(artifact.metadataJson);

  // Idempotency — a prior finalize attempt already fully registered this
  // artifact (artifact row itself was stamped).
  const existingMediaAssetId = readMetadataString(artifact.metadataJson, "mediaAssetId");
  if (artifact.publishedItemId != null && existingMediaAssetId) {
    return { mediaAssetId: existingMediaAssetId, libraryItemId: String(artifact.publishedItemId) };
  }

  const checksumSha256 = readMetadataString(artifact.metadataJson, "checksumSha256") ?? "";
  const contentType = readMetadataString(artifact.metadataJson, "contentType") ?? "application/octet-stream";
  const sizeBytesRaw = Number(metadata.sizeBytes);
  const sizeBytes = Number.isFinite(sizeBytesRaw) ? sizeBytesRaw : 0;

  const verification = await verifyStoredObject({
    storageRef: artifact.storageRef,
    expectedChecksumSha256: checksumSha256,
    expectedSizeBytes: sizeBytes,
    expectedContentType: contentType,
  });
  if (!verification.valid) {
    await failFinalizeJob(repo, job, "HERMES_OUTPUT_INVALID", verification.reason);
    throw new HermesMediaFinalizeError("HERMES_OUTPUT_INVALID", verification.reason);
  }

  const safety = await contentSafetyGate({ storageRef: artifact.storageRef, contentType });
  if (!safety.safe) {
    await failFinalizeJob(repo, job, "HERMES_LIBRARY_REGISTRATION_FAILED", safety.reason);
    throw new HermesMediaFinalizeError("HERMES_LIBRARY_REGISTRATION_FAILED", safety.reason);
  }

  if (!job.requestedByUserId) {
    await failFinalizeJob(repo, job, "HERMES_LIBRARY_REGISTRATION_FAILED", "missing_requester");
    throw new HermesMediaFinalizeError("HERMES_LIBRARY_REGISTRATION_FAILED", "missing_requester");
  }

  const contract = (job.inputJson ?? {}) as Partial<HermesMediaJobContract>;
  const dimensions = readDimensions(metadata);
  const jobOutputJson: Record<string, unknown> =
    job.outputJson && typeof job.outputJson === "object" ? (job.outputJson as Record<string, unknown>) : {};

  // Code review fix — the publish phase (insert media_assets → resolve URL
  // → create library item → stamp artifact → complete job) previously had
  // no error handling: any exception left the job stuck in `publishing`
  // forever (non-terminal — the sweep never fee-reconciles it, and a
  // polling client sees "processing" indefinitely), and a retry would
  // insert a SECOND `media_assets` row since `publishedItemId` was never
  // stamped. Now: (1) the whole phase is wrapped so ANY exception fails the
  // job with a typed reason and rethrows for the route's log; (2) the new
  // `media_assets` id is checkpointed into `job.outputJson.mediaAssetId`
  // immediately after insertion (job stays `publishing`) so an interrupted
  // retry reuses that row instead of inserting a duplicate.
  try {
    const checkpointedMediaAssetId = readMetadataString(jobOutputJson, "mediaAssetId");
    let mediaAssetId: string;
    let assetStorageKey: string;
    if (checkpointedMediaAssetId) {
      // Recovery path — a prior attempt already inserted the media_assets
      // row (and checkpointed it) but was interrupted before completing the
      // rest of the publish phase. Reuse it; never insert a duplicate.
      mediaAssetId = checkpointedMediaAssetId;
      assetStorageKey = artifact.storageRef;
    } else {
      const insertedAsset = await repo.insertMediaAsset({
        tenantId: job.tenantId,
        userId: job.requestedByUserId,
        sourceType: "hermes_media",
        status: "ready",
        storageKey: artifact.storageRef,
        mimeType: contentType,
        ...(sizeBytes ? { fileSize: sizeBytes } : {}),
        ...(checksumSha256 ? { checksumSha256 } : {}),
        ...dimensions,
      });
      mediaAssetId = String(insertedAsset.id);
      assetStorageKey = insertedAsset.storageKey;

      // Checkpoint — job remains `publishing`; only `outputJson` changes.
      await repo.updateJob(job.id, {
        outputJson: { ...jobOutputJson, mediaAssetId },
      });
    }

    const sourceUrl = await resolveStorageUrl(assetStorageKey);
    const mediaKind = job.jobType === HERMES_MEDIA_VIDEO_JOB_TYPE ? "video" : "image";
    const capabilityRequirements = (job.capabilityRequirementsJson ?? {}) as Record<string, unknown>;

    // Code review fix — never trust the user-supplied
    // `contract.storage.libraryFolderId` at face value: validate it belongs
    // to this exact tenant + requester before using it as `parentId`. A
    // missing or foreign folder silently defaults to root (never publishes
    // into someone else's folder) and is recorded as a lineage note.
    const requestedFolderId = parseLibraryFolderId(contract.storage?.libraryFolderId);
    let parentId: number | null = null;
    let libraryFolderNote: string | undefined;
    if (requestedFolderId != null) {
      const owned = await resolveLibraryFolderOwner({
        folderId: requestedFolderId,
        tenantId: job.tenantId,
        userId: job.requestedByUserId,
      });
      if (owned) {
        parentId = requestedFolderId;
      } else {
        libraryFolderNote = "requested_library_folder_not_owned_by_requester";
      }
    }

    const libraryResult = await createLibraryItemFn(
      {
        itemType: mediaKind,
        source: "hermes_media",
        title: contract.prompt ? contract.prompt.slice(0, 120) : "Hermes generated media",
        status: "ready",
        visibility: "private",
        sourceUrl,
        parentId,
        metadata: {
          operation: contract.operation,
          prompt: contract.prompt,
          model: contract.settings?.model,
          referenceAssetIds: (contract.references ?? []).map((reference) => reference.assetId),
          workerJobId: job.id,
          hermesVersion: typeof capabilityRequirements.hermesVersion === "string" ? capabilityRequirements.hermesVersion : undefined,
          connectionId: typeof capabilityRequirements.connectionId === "string" ? capabilityRequirements.connectionId : undefined,
          ...(requestedFolderId != null ? { requestedLibraryFolderId: String(requestedFolderId) } : {}),
          ...(libraryFolderNote ? { libraryFolderNote } : {}),
        },
        sourceLink: {
          linkType: "hermes_media_worker_artifact",
          linkId: `${job.id}:${artifact.id}`,
        },
      },
      { userId: job.requestedByUserId, tenantId: job.tenantId } as LibraryActor,
    );

    const libraryItemId = String((libraryResult.item as { id: string | number }).id);

    await repo.updateArtifact(artifact.id, {
      publishedItemId: Number(libraryItemId),
      metadataJson: { ...metadata, mediaAssetId },
    });

    await repo.updateJob(job.id, {
      status: "completed",
      finishedAt: now(),
      outputJson: {
        ...jobOutputJson,
        mediaAssetId,
        libraryItemId,
        hermesFinalized: true,
      },
    });

    return { mediaAssetId, libraryItemId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "publish_phase_failed";
    try {
      await failFinalizeJob(repo, job, "HERMES_LIBRARY_REGISTRATION_FAILED", reason);
    } catch (failError) {
      debugError(
        "hermesMediaFinalizeService",
        `Failed to mark job ${job.id} failed after a publish-phase error`,
        failError,
      );
    }
    throw error;
  }
}
