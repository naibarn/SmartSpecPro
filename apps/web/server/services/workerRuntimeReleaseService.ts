import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "../db";
import {
  storageDelete,
  storagePresignPut,
  storagePutFromPath,
  storageStreamFile,
} from "../storage";
import { users, workerRuntimeReleases } from "../../drizzle/schema";
import {
  workerRuntimeIdValues,
  workerRuntimeReleaseAssetSchema,
  workerRuntimeReleaseCatalogSchema,
  workerRuntimeReleaseUploadSchema,
  type WorkerRuntimeChannel,
  type WorkerRuntimeId,
  type WorkerRuntimePlatform,
  type WorkerRuntimeReleaseAsset,
  type WorkerRuntimeReleaseCatalog,
  type WorkerRuntimeReleaseUpload,
} from "../../shared/workerRuntimeReleases";
import { validateRuntimePackArchive } from "./workerRuntimePackValidation";
import { getWorkerRuntimeSigningKey } from "./workerRuntimeSigningKeyService";

export const WORKER_RUNTIME_RELEASE_STORAGE_PREFIX = "worker-runtime-releases/";
export const MAX_WORKER_RUNTIME_RELEASE_BYTES = 8 * 1024 * 1024 * 1024;

const TEMP_RUNTIME_RELEASE_DIR = path.join(
  os.tmpdir(),
  "smartspec-worker-runtime-releases"
);
fs.mkdirSync(TEMP_RUNTIME_RELEASE_DIR, { recursive: true });

type ReleaseRow = typeof workerRuntimeReleases.$inferSelect;
type ReleaseWithUploader = ReleaseRow & {
  uploadedByName: string | null;
};

export class WorkerRuntimeReleaseError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "WorkerRuntimeReleaseError";
  }
}

function expectedPlatform(runtimeId: WorkerRuntimeId): WorkerRuntimePlatform {
  return runtimeId === "hyperframes-macos-arm64" ? "macos" : "windows";
}

function sanitizePathSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 96) || "release"
  );
}

function validateUploadInput(
  input: WorkerRuntimeReleaseUpload
): WorkerRuntimeReleaseUpload {
  const parsed = workerRuntimeReleaseUploadSchema.parse(
    input
  ) as WorkerRuntimeReleaseUpload;
  const expectedName = `smart-ai-hub-worker-runtime-${parsed.runtimeId}-${parsed.version}.zip`;
  if (parsed.platform !== expectedPlatform(parsed.runtimeId)) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_platform_mismatch",
      400,
      `Runtime ${parsed.runtimeId} must be uploaded as ${expectedPlatform(parsed.runtimeId)}.`
    );
  }
  if (parsed.fileName !== expectedName) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_filename_invalid",
      400,
      `Filename must be ${expectedName}.`
    );
  }
  if (!/\.zip$/i.test(parsed.fileName)) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_archive_invalid",
      400,
      "Runtime release must be a ZIP archive."
    );
  }
  if (
    !/^application\/(?:zip|x-zip-compressed)$|^application\/octet-stream$/i.test(
      parsed.contentType
    )
  ) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_content_type_invalid",
      400,
      "Runtime release must have a ZIP content type."
    );
  }
  if (parsed.fileSizeBytes > MAX_WORKER_RUNTIME_RELEASE_BYTES) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_archive_too_large",
      413,
      `Runtime release exceeds the ${(MAX_WORKER_RUNTIME_RELEASE_BYTES / 1024 / 1024 / 1024).toFixed(0)} GB limit.`
    );
  }
  return parsed;
}

export function createWorkerRuntimeReleaseStorageKey(input: {
  version: string;
  runtimeId: WorkerRuntimeId;
  channel: WorkerRuntimeChannel;
  fileName: string;
}): string {
  return `${WORKER_RUNTIME_RELEASE_STORAGE_PREFIX}${sanitizePathSegment(input.runtimeId)}/${sanitizePathSegment(input.version)}/${sanitizePathSegment(input.channel)}/${path.basename(input.fileName)}`;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function compareVersions(left: string, right: string): number {
  const leftParts = left
    .trim()
    .split(/[.+-]/)
    .map(part => part || "0");
  const rightParts = right
    .trim()
    .split(/[.+-]/)
    .map(part => part || "0");
  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const a = leftParts[index] ?? "0";
    const b = rightParts[index] ?? "0";
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
      const result = Number(a) - Number(b);
      if (result !== 0) return result;
    } else if (a !== b) {
      return a.localeCompare(b);
    }
  }
  return 0;
}

function mapRelease(row: ReleaseWithUploader): WorkerRuntimeReleaseAsset {
  return workerRuntimeReleaseAssetSchema.parse({
    id: row.id,
    version: row.version,
    runtimeId: row.runtimeId,
    platform: row.platform,
    channel: row.channel,
    fileName: row.fileName,
    contentType: row.contentType,
    fileSizeBytes: Number(row.fileSizeBytes),
    fileSha256: row.fileSha256,
    manifest: row.manifestJson,
    validationStatus: row.validationStatus,
    validationChecks: row.validationChecksJson,
    isPublished: row.isPublished,
    publishedAt: toIso(row.publishedAt),
    withdrawnAt: toIso(row.withdrawnAt),
    uploadedAt: toIso(row.uploadedAt) ?? new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date().toISOString(),
    uploadedByUserId: row.uploadedBy,
    uploadedByName: row.uploadedByName ?? null,
    downloadUrl: `/api/workers/runtime-pack/download/${encodeURIComponent(row.fileName)}`,
  });
}

async function selectRows(
  includeUnpublished: boolean
): Promise<ReleaseWithUploader[]> {
  const db = getDb();
  const query = db
    .select({
      id: workerRuntimeReleases.id,
      version: workerRuntimeReleases.version,
      runtimeId: workerRuntimeReleases.runtimeId,
      platform: workerRuntimeReleases.platform,
      channel: workerRuntimeReleases.channel,
      fileName: workerRuntimeReleases.fileName,
      contentType: workerRuntimeReleases.contentType,
      storageKey: workerRuntimeReleases.storageKey,
      fileSizeBytes: workerRuntimeReleases.fileSizeBytes,
      fileSha256: workerRuntimeReleases.fileSha256,
      manifestJson: workerRuntimeReleases.manifestJson,
      validationStatus: workerRuntimeReleases.validationStatus,
      validationChecksJson: workerRuntimeReleases.validationChecksJson,
      isPublished: workerRuntimeReleases.isPublished,
      publishedAt: workerRuntimeReleases.publishedAt,
      withdrawnAt: workerRuntimeReleases.withdrawnAt,
      uploadedBy: workerRuntimeReleases.uploadedBy,
      uploadedAt: workerRuntimeReleases.uploadedAt,
      updatedAt: workerRuntimeReleases.updatedAt,
      uploadedByName: users.name,
    })
    .from(workerRuntimeReleases)
    .leftJoin(users, eq(workerRuntimeReleases.uploadedBy, users.id));
  const rows = includeUnpublished
    ? await query
    : await query.where(
        and(
          eq(workerRuntimeReleases.isPublished, true),
          eq(workerRuntimeReleases.validationStatus, "valid"),
          isNull(workerRuntimeReleases.withdrawnAt)
        )
      );
  return rows as ReleaseWithUploader[];
}

async function selectRowById(id: number): Promise<ReleaseWithUploader | null> {
  const rows = await selectRows(true);
  return rows.find(row => row.id === id) ?? null;
}

export async function listWorkerRuntimeReleaseCatalog(
  input: { includeUnpublished?: boolean } = {}
): Promise<WorkerRuntimeReleaseCatalog> {
  const releases = (await selectRows(Boolean(input.includeUnpublished)))
    .map(mapRelease)
    .sort(
      (left, right) =>
        compareVersions(right.version, left.version) || right.id - left.id
    );
  const currentByRuntime = Object.fromEntries(
    workerRuntimeIdValues.map(runtimeId => [
      runtimeId,
      releases.find(
        release =>
          release.runtimeId === runtimeId &&
          release.channel === "stable" &&
          release.isPublished &&
          release.validationStatus === "valid" &&
          !release.withdrawnAt
      ) ?? null,
    ])
  );
  return workerRuntimeReleaseCatalogSchema.parse({
    generatedAt: new Date().toISOString(),
    releases,
    currentByRuntime,
  });
}

export async function getLatestPublishedWorkerRuntimeRelease(
  runtimeId: WorkerRuntimeId,
  channel: WorkerRuntimeChannel = "stable"
): Promise<ReleaseRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(workerRuntimeReleases)
    .where(
      and(
        eq(workerRuntimeReleases.runtimeId, runtimeId),
        eq(workerRuntimeReleases.channel, channel),
        eq(workerRuntimeReleases.isPublished, true),
        eq(workerRuntimeReleases.validationStatus, "valid"),
        isNull(workerRuntimeReleases.withdrawnAt)
      )
    )
    .orderBy(
      desc(workerRuntimeReleases.publishedAt),
      desc(workerRuntimeReleases.id)
    );
  return (
    (rows as ReleaseRow[]).sort((left, right) =>
      compareVersions(right.version, left.version)
    )[0] ?? null
  );
}

export async function getPublishedWorkerRuntimeReleaseByFileName(
  fileName: string
): Promise<ReleaseRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workerRuntimeReleases)
    .where(
      and(
        eq(workerRuntimeReleases.fileName, path.basename(fileName)),
        eq(workerRuntimeReleases.isPublished, true),
        eq(workerRuntimeReleases.validationStatus, "valid"),
        isNull(workerRuntimeReleases.withdrawnAt)
      )
    )
    .limit(1);
  return (row as ReleaseRow | undefined) ?? null;
}

export async function presignWorkerRuntimeReleaseUpload(
  input: WorkerRuntimeReleaseUpload
): Promise<{ uploadUrl: string; storageKey: string } | null> {
  const parsed = validateUploadInput(input);
  const storageKey = createWorkerRuntimeReleaseStorageKey(parsed);
  const presign = await storagePresignPut(
    storageKey,
    parsed.contentType,
    parsed.fileSizeBytes,
    60 * 30
  );
  return presign ? { uploadUrl: presign.url, storageKey: presign.key } : null;
}

async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadStorageObjectToTemp(
  storageKey: string
): Promise<string> {
  const stored = await storageStreamFile(storageKey);
  if (!stored) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_upload_not_found",
      404,
      "Uploaded runtime archive was not found in storage."
    );
  }
  const filePath = path.join(
    TEMP_RUNTIME_RELEASE_DIR,
    `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.zip`
  );
  const sourceStream = stored.stream as any;
  const stream =
    typeof sourceStream.pipe === "function"
      ? sourceStream
      : typeof sourceStream.getReader === "function"
        ? Readable.fromWeb(sourceStream)
        : null;
  if (!stream) {
    await fs.promises.rm(filePath, { force: true });
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_storage_stream_invalid",
      502,
      "Storage did not provide a readable runtime archive stream."
    );
  }
  try {
    await pipeline(stream, fs.createWriteStream(filePath));
  } catch (error) {
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
    throw error;
  }
  return filePath;
}

async function insertValidatedRelease(input: {
  upload: WorkerRuntimeReleaseUpload;
  storageKey: string;
  filePath: string;
  uploadedByUserId: number;
}): Promise<WorkerRuntimeReleaseAsset> {
  const upload = validateUploadInput(input.upload);
  const stat = await fs.promises.stat(input.filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0 || stat.size !== upload.fileSizeBytes) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_size_mismatch",
      422,
      "Uploaded runtime archive size does not match the declared size."
    );
  }
  const fileSha256 = await hashFileSha256(input.filePath);
  const signingKey = await getWorkerRuntimeSigningKey();
  const validation = await validateRuntimePackArchive({
    filePath: input.filePath,
    fileName: upload.fileName,
    version: upload.version,
    runtimeId: upload.runtimeId,
    publicKey: signingKey.active?.publicKey ?? null,
  });
  if (!validation.valid || !validation.manifest) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_release_invalid",
      422,
      "Runtime archive failed the official runtime validation gate.",
      { checks: validation.checks }
    );
  }

  const db = getDb();
  try {
    const [existing] = await db
      .select({ id: workerRuntimeReleases.id })
      .from(workerRuntimeReleases)
      .where(
        and(
          eq(workerRuntimeReleases.runtimeId, upload.runtimeId),
          eq(workerRuntimeReleases.version, upload.version),
          eq(workerRuntimeReleases.channel, upload.channel)
        )
      )
      .limit(1);
    if (existing) {
      throw new WorkerRuntimeReleaseError(
        "worker_runtime_release_duplicate",
        409,
        "A runtime release with this version, platform, and channel already exists."
      );
    }
    const [created] = await db
      .insert(workerRuntimeReleases)
      .values({
        version: upload.version,
        runtimeId: upload.runtimeId,
        platform: upload.platform,
        channel: upload.channel,
        fileName: upload.fileName,
        contentType: upload.contentType,
        storageKey: input.storageKey,
        fileSizeBytes: stat.size,
        fileSha256,
        manifestJson: validation.manifest,
        validationStatus: "valid",
        validationChecksJson: validation.checks,
        isPublished: false,
        publishedAt: null,
        withdrawnAt: null,
        uploadedBy: input.uploadedByUserId,
        uploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: workerRuntimeReleases.id });
    if (!created)
      throw new Error("worker_runtime_release_record_create_failed");
    const row = await selectRowById(created.id);
    if (!row) throw new Error("worker_runtime_release_record_load_failed");
    return mapRelease(row);
  } catch (error) {
    await storageDelete(input.storageKey).catch(() => false);
    throw error;
  }
}

export async function finalizeWorkerRuntimeReleaseUpload(input: {
  upload: WorkerRuntimeReleaseUpload & {
    storageKey: string;
    fileSha256?: string;
  };
  uploadedByUserId: number;
}): Promise<WorkerRuntimeReleaseAsset> {
  const upload = validateUploadInput(input.upload);
  const expectedKey = createWorkerRuntimeReleaseStorageKey(upload);
  if (
    input.upload.storageKey !== expectedKey ||
    !input.upload.storageKey.startsWith(WORKER_RUNTIME_RELEASE_STORAGE_PREFIX)
  ) {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_storage_key_invalid",
      400,
      "Runtime upload storage key does not match the selected release."
    );
  }
  const filePath = await downloadStorageObjectToTemp(input.upload.storageKey);
  try {
    const calculatedHash = await hashFileSha256(filePath);
    if (
      input.upload.fileSha256 &&
      input.upload.fileSha256.toLowerCase() !== calculatedHash
    ) {
      throw new WorkerRuntimeReleaseError(
        "worker_runtime_hash_mismatch",
        422,
        "Uploaded runtime archive hash does not match the client declaration."
      );
    }
    try {
      return await insertValidatedRelease({
        upload,
        storageKey: input.upload.storageKey,
        filePath,
        uploadedByUserId: input.uploadedByUserId,
      });
    } catch (error) {
      await storageDelete(input.upload.storageKey).catch(() => false);
      throw error;
    }
  } finally {
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
  }
}

export async function persistWorkerRuntimeReleaseUploadFromPath(input: {
  upload: WorkerRuntimeReleaseUpload;
  filePath: string;
  uploadedByUserId: number;
}): Promise<WorkerRuntimeReleaseAsset> {
  const upload = validateUploadInput(input.upload);
  const storageKey = createWorkerRuntimeReleaseStorageKey(upload);
  const stored = await storagePutFromPath(
    storageKey,
    input.filePath,
    upload.contentType
  );
  try {
    return await insertValidatedRelease({
      upload,
      storageKey: stored.key,
      filePath: input.filePath,
      uploadedByUserId: input.uploadedByUserId,
    });
  } catch (error) {
    await storageDelete(stored.key).catch(() => false);
    throw error;
  }
}

export async function publishWorkerRuntimeRelease(
  id: number
): Promise<WorkerRuntimeReleaseAsset | null> {
  const current = await selectRowById(id);
  if (!current) return null;
  if (current.validationStatus !== "valid") {
    throw new WorkerRuntimeReleaseError(
      "worker_runtime_release_invalid",
      422,
      "Only a valid runtime release can be published.",
      { checks: current.validationChecksJson }
    );
  }
  const db = getDb();
  await db
    .update(workerRuntimeReleases)
    .set({
      isPublished: true,
      publishedAt: new Date(),
      withdrawnAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workerRuntimeReleases.id, id));
  const updated = await selectRowById(id);
  return updated ? mapRelease(updated) : null;
}

export async function withdrawWorkerRuntimeRelease(
  id: number
): Promise<WorkerRuntimeReleaseAsset | null> {
  const current = await selectRowById(id);
  if (!current) return null;
  const db = getDb();
  await db
    .update(workerRuntimeReleases)
    .set({ isPublished: false, withdrawnAt: new Date(), updatedAt: new Date() })
    .where(eq(workerRuntimeReleases.id, id));
  const updated = await selectRowById(id);
  return updated ? mapRelease(updated) : null;
}
