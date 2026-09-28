import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { desc, eq } from "drizzle-orm";

import { getDb } from "../db";
import {
  storageDelete,
  storageHeadFile,
  storagePresignPut,
  storagePutFromPath,
  storageStreamFile,
} from "../storage";
import {
  users,
  workerRuntimeRunnerArtifacts,
} from "../../drizzle/schema";
import {
  workerRuntimeRunnerArtifactCatalogSchema,
  workerRuntimeRunnerArtifactSchema,
  type WorkerRuntimeRunnerArtifact,
  type WorkerRuntimeRunnerArtifactCatalog,
  type WorkerRuntimeRunnerArtifactUpload,
  workerRuntimeRunnerArtifactUploadSchema,
} from "../../shared/workerRuntimeReleases";

export const MAX_WORKER_RUNTIME_RUNNER_BYTES = 1024 * 1024 * 1024;
export const WORKER_RUNTIME_RUNNER_STORAGE_PREFIX =
  "worker-runtime-runners/";
const WORKER_RUNTIME_RUNNER_UPLOAD_PREFIX = "worker-runtime-runner-uploads/";
const TEMP_RUNNER_FINALIZE_DIR = path.join(
  os.tmpdir(),
  "smartspec-worker-runtime-runner-finalize"
);
fs.mkdirSync(TEMP_RUNNER_FINALIZE_DIR, { recursive: true });

export class WorkerRuntimeRunnerArtifactError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "WorkerRuntimeRunnerArtifactError";
  }
}

type RunnerRow = typeof workerRuntimeRunnerArtifacts.$inferSelect & {
  uploadedByName: string | null;
};

function mapRunner(row: RunnerRow): WorkerRuntimeRunnerArtifact {
  return workerRuntimeRunnerArtifactSchema.parse({
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    fileSizeBytes: Number(row.fileSizeBytes),
    fileSha256: row.fileSha256,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedByUserId: row.uploadedBy,
    uploadedByName: row.uploadedByName,
    downloadUrl: `/api/admin/worker-runtime/runner-artifacts/${row.id}/download`,
  });
}

async function selectRunnerById(id: number): Promise<RunnerRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: workerRuntimeRunnerArtifacts.id,
      fileName: workerRuntimeRunnerArtifacts.fileName,
      contentType: workerRuntimeRunnerArtifacts.contentType,
      storageKey: workerRuntimeRunnerArtifacts.storageKey,
      fileSizeBytes: workerRuntimeRunnerArtifacts.fileSizeBytes,
      fileSha256: workerRuntimeRunnerArtifacts.fileSha256,
      uploadedBy: workerRuntimeRunnerArtifacts.uploadedBy,
      uploadedAt: workerRuntimeRunnerArtifacts.uploadedAt,
      uploadedByName: users.name,
    })
    .from(workerRuntimeRunnerArtifacts)
    .leftJoin(users, eq(workerRuntimeRunnerArtifacts.uploadedBy, users.id))
    .where(eq(workerRuntimeRunnerArtifacts.id, id))
    .limit(1);
  return (row as RunnerRow | undefined) ?? null;
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

function validateRunnerUploadInput(
  input: WorkerRuntimeRunnerArtifactUpload
): WorkerRuntimeRunnerArtifactUpload {
  const parsed = workerRuntimeRunnerArtifactUploadSchema.parse(input);
  const safeName = path.basename(parsed.fileName);
  if (!safeName.toLowerCase().endsWith(".exe")) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_invalid_extension",
      422,
      "Speaker-aware runner must be a .exe file."
    );
  }
  if (
    parsed.fileSizeBytes <= 2 ||
    parsed.fileSizeBytes > MAX_WORKER_RUNTIME_RUNNER_BYTES
  ) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_size_invalid",
      422,
      "Speaker-aware runner size is invalid or exceeds the 1 GB limit."
    );
  }
  return { ...parsed, fileName: safeName };
}

export async function presignWorkerRuntimeRunnerArtifactUpload(
  input: WorkerRuntimeRunnerArtifactUpload
): Promise<{ uploadUrl: string; storageKey: string } | null> {
  const parsed = validateRunnerUploadInput(input);
  const storageKey = `${WORKER_RUNTIME_RUNNER_UPLOAD_PREFIX}${crypto.randomUUID()}-${parsed.fileName}`;
  const presign = await storagePresignPut(
    storageKey,
    parsed.contentType,
    parsed.fileSizeBytes,
    60 * 30
  );
  return presign ? { uploadUrl: presign.url, storageKey: presign.key } : null;
}

async function downloadStorageObjectToTemp(storageKey: string): Promise<string> {
  const stored = await storageStreamFile(storageKey);
  if (!stored) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_upload_not_found",
      404,
      "Uploaded runner was not found in storage."
    );
  }
  const filePath = path.join(
    TEMP_RUNNER_FINALIZE_DIR,
    `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.exe`
  );
  const sourceStream = stored.stream as any;
  const stream =
    typeof sourceStream.pipe === "function"
      ? sourceStream
      : typeof sourceStream.getReader === "function"
        ? Readable.fromWeb(sourceStream)
        : null;
  if (!stream) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_storage_stream_invalid",
      502,
      "Storage did not provide a readable runner stream."
    );
  }
  try {
    await pipeline(stream, fs.createWriteStream(filePath));
    return filePath;
  } catch (error) {
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function listWorkerRuntimeRunnerArtifacts(): Promise<WorkerRuntimeRunnerArtifactCatalog> {
  const db = getDb();
  const rows = await db
    .select({
      id: workerRuntimeRunnerArtifacts.id,
      fileName: workerRuntimeRunnerArtifacts.fileName,
      contentType: workerRuntimeRunnerArtifacts.contentType,
      storageKey: workerRuntimeRunnerArtifacts.storageKey,
      fileSizeBytes: workerRuntimeRunnerArtifacts.fileSizeBytes,
      fileSha256: workerRuntimeRunnerArtifacts.fileSha256,
      uploadedBy: workerRuntimeRunnerArtifacts.uploadedBy,
      uploadedAt: workerRuntimeRunnerArtifacts.uploadedAt,
      uploadedByName: users.name,
    })
    .from(workerRuntimeRunnerArtifacts)
    .leftJoin(users, eq(workerRuntimeRunnerArtifacts.uploadedBy, users.id))
    .orderBy(desc(workerRuntimeRunnerArtifacts.uploadedAt))
    .limit(50);
  return workerRuntimeRunnerArtifactCatalogSchema.parse({
    generatedAt: new Date().toISOString(),
    artifacts: rows.map(row => mapRunner(row as RunnerRow)),
  });
}

export async function persistWorkerRuntimeRunnerArtifactFromPath(input: {
  filePath: string;
  fileName: string;
  contentType?: string;
  uploadedByUserId: number;
}): Promise<WorkerRuntimeRunnerArtifact> {
  const safeName = path.basename(input.fileName);
  if (!safeName.toLowerCase().endsWith(".exe")) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_invalid_extension",
      422,
      "Speaker-aware runner must be a .exe file."
    );
  }
  const stat = await fs.promises.stat(input.filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 2 || stat.size > MAX_WORKER_RUNTIME_RUNNER_BYTES) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_size_invalid",
      422,
      "Speaker-aware runner size is invalid or exceeds the 1 GB limit."
    );
  }
  const header = Buffer.alloc(2);
  const handle = await fs.promises.open(input.filePath, "r");
  try {
    await handle.read(header, 0, 2, 0);
  } finally {
    await handle.close();
  }
  if (header[0] !== 0x4d || header[1] !== 0x5a) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_not_pe",
      422,
      "Speaker-aware runner must be a Windows MZ/PE executable."
    );
  }

  const fileSha256 = await hashFileSha256(input.filePath);
  const db = getDb();
  const [existing] = await db
    .select({ id: workerRuntimeRunnerArtifacts.id })
    .from(workerRuntimeRunnerArtifacts)
    .where(eq(workerRuntimeRunnerArtifacts.fileSha256, fileSha256))
    .limit(1);
  if (existing) {
    const row = await selectRunnerById(existing.id);
    if (row) return mapRunner(row);
  }

  const storageKey = `${WORKER_RUNTIME_RUNNER_STORAGE_PREFIX}${fileSha256}.exe`;
  await storagePutFromPath(
    storageKey,
    input.filePath,
    input.contentType || "application/octet-stream"
  );
  try {
    const [created] = await db
      .insert(workerRuntimeRunnerArtifacts)
      .values({
        fileName: safeName,
        contentType: input.contentType || "application/octet-stream",
        storageKey,
        fileSizeBytes: stat.size,
        fileSha256,
        uploadedBy: input.uploadedByUserId,
      })
      .returning({ id: workerRuntimeRunnerArtifacts.id });
    if (!created) throw new Error("worker_runtime_runner_record_create_failed");
    const row = await selectRunnerById(created.id);
    if (!row) throw new Error("worker_runtime_runner_record_load_failed");
    return mapRunner(row);
  } catch (error) {
    // Keep a deduplicated object if another request won the unique hash race.
    const [winner] = await db
      .select({ id: workerRuntimeRunnerArtifacts.id })
      .from(workerRuntimeRunnerArtifacts)
      .where(eq(workerRuntimeRunnerArtifacts.fileSha256, fileSha256))
      .limit(1);
    if (winner) {
      const row = await selectRunnerById(winner.id);
      if (row) return mapRunner(row);
    }
    await storageDelete(storageKey).catch(() => false);
    throw error;
  }
}

export async function finalizeWorkerRuntimeRunnerArtifactUpload(input: {
  upload: WorkerRuntimeRunnerArtifactUpload & {
    storageKey: string;
    fileSha256?: string;
  };
  uploadedByUserId: number;
}): Promise<WorkerRuntimeRunnerArtifact> {
  const upload = validateRunnerUploadInput(input.upload);
  if (!input.upload.storageKey.startsWith(WORKER_RUNTIME_RUNNER_UPLOAD_PREFIX)) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_storage_key_invalid",
      400,
      "Runner upload storage key is invalid."
    );
  }
  const head = await storageHeadFile(input.upload.storageKey);
  if (!head) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_upload_not_found",
      404,
      "Uploaded runner was not found in storage."
    );
  }
  if (head.contentLength !== upload.fileSizeBytes) {
    throw new WorkerRuntimeRunnerArtifactError(
      "worker_runtime_runner_size_mismatch",
      422,
      "Uploaded runner size does not match the declared size."
    );
  }
  const filePath = await downloadStorageObjectToTemp(input.upload.storageKey);
  try {
    const fileSha256 = await hashFileSha256(filePath);
    if (input.fileSha256 && input.fileSha256.toLowerCase() !== fileSha256) {
      throw new WorkerRuntimeRunnerArtifactError(
        "worker_runtime_runner_hash_mismatch",
        422,
        "Uploaded runner hash does not match the client declaration."
      );
    }
    return await persistWorkerRuntimeRunnerArtifactFromPath({
      filePath,
      fileName: upload.fileName,
      contentType: upload.contentType,
      uploadedByUserId: input.uploadedByUserId,
    });
  } finally {
    await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
    await storageDelete(input.upload.storageKey).catch(() => false);
  }
}

export async function streamWorkerRuntimeRunnerArtifact(id: number) {
  const row = await selectRunnerById(id);
  if (!row) return null;
  const stored = await storageStreamFile(row.storageKey);
  return stored ? { row, stored } : null;
}
