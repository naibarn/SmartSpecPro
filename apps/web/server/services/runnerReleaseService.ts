import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { and, desc, eq, isNull, type SQL } from "drizzle-orm";

import { runnerReleaseAssets } from "../../drizzle/schema";
import {
  runnerReleaseIdentitySchema,
  runnerReleaseTargetKey,
  projectRunnerReleaseRow as mapRow,
  projectRunnerReleaseCatalog,
  type RunnerReleaseAsset,
  type RunnerReleaseCatalogResponse,
  type RunnerReleaseChannel,
  type RunnerReleaseIdentity,
  type RunnerReleasePlatform,
  type RunnerReleaseArchitecture,
  type RunnerReleaseProfile,
} from "../../shared/runnerReleases";
import { getDb } from "../db";
import { storageDelete, storagePutFromPath, storageStreamFile } from "../storage";

export const MAX_RUNNER_RELEASE_BYTES = 750 * 1024 * 1024;

export class RunnerReleaseError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode = 400,
    message = code,
  ) {
    super(message);
    this.name = "RunnerReleaseError";
  }
}

type ReleaseFilter = {
  includeUnpublished?: boolean;
  platform?: RunnerReleasePlatform;
  architecture?: RunnerReleaseArchitecture;
  profile?: RunnerReleaseProfile;
  channel?: RunnerReleaseChannel;
};

function safeFileName(value: string): string {
  const fileName = path.basename(value).trim();
  const sanitized = fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 180);
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new RunnerReleaseError("runner_release_file_name_invalid");
  }
  return sanitized;
}

function safeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "") || "release";
}

async function hashFile(filePath: string): Promise<string> {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new RunnerReleaseError("runner_release_file_invalid");
  if (stat.size > MAX_RUNNER_RELEASE_BYTES) {
    throw new RunnerReleaseError("runner_release_file_too_large", 413);
  }
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function selectRows(filter: ReleaseFilter): Promise<typeof runnerReleaseAssets.$inferSelect[]> {
  const db = getDb();
  const conditions: SQL[] = [];
  if (!filter.includeUnpublished) {
    conditions.push(
      eq(runnerReleaseAssets.isPublished, true),
      isNull(runnerReleaseAssets.withdrawnAt),
      eq(runnerReleaseAssets.validationStatus, "valid"),
    );
  }
  if (filter.platform) conditions.push(eq(runnerReleaseAssets.platform, filter.platform));
  if (filter.architecture) conditions.push(eq(runnerReleaseAssets.architecture, filter.architecture));
  if (filter.profile) conditions.push(eq(runnerReleaseAssets.profile, filter.profile));
  if (filter.channel) conditions.push(eq(runnerReleaseAssets.channel, filter.channel));
  const query = db.select().from(runnerReleaseAssets).orderBy(desc(runnerReleaseAssets.updatedAt));
  return conditions.length ? await query.where(and(...conditions)) : await query;
}

export async function listRunnerReleaseAssets(filter: ReleaseFilter = {}): Promise<RunnerReleaseAsset[]> {
  return (await selectRows(filter)).map(mapRow);
}

export async function listRunnerReleaseCatalog(filter: ReleaseFilter = {}): Promise<RunnerReleaseCatalogResponse> {
  const releases = await listRunnerReleaseAssets(filter);
  return projectRunnerReleaseCatalog(releases);
}

export async function getRunnerReleaseAssetById(id: number, includeUnpublished = false): Promise<RunnerReleaseAsset | null> {
  const rows = await selectRows({ includeUnpublished });
  const row = rows.find(candidate => candidate.id === id);
  return row ? mapRow(row) : null;
}

export async function getLatestRunnerRelease(input: {
  platform: RunnerReleasePlatform;
  architecture: RunnerReleaseArchitecture;
  profile: RunnerReleaseProfile;
  channel?: RunnerReleaseChannel;
}): Promise<{ package: RunnerReleaseAsset | null; updateBinary: RunnerReleaseAsset | null }> {
  const catalog = await listRunnerReleaseCatalog({ ...input, channel: input.channel ?? "stable" });
  const target = catalog.latestByTarget.find(candidate => candidate.targetKey === runnerReleaseTargetKey({ ...input, channel: input.channel ?? "stable" }));
  return { package: target?.package ?? null, updateBinary: target?.updateBinary ?? null };
}

export async function persistRunnerReleaseAssetFromPath(input: {
  identity: RunnerReleaseIdentity;
  filePath: string;
  fileName: string;
  contentType?: string;
  signature?: string | null;
  contractVersion?: string;
  manifest?: Record<string, unknown> | null;
  validationStatus?: "valid" | "invalid" | "pending";
  validationChecks?: Array<{ id: string; status: "ok" | "error"; message: string }>;
  provenance: { sourceCommit: string; workflowRunId?: string | null; releaseTag?: string | null; signatureAlgorithm?: string | null };
  releaseNotes?: string | null;
  uploadedByUserId?: number | null;
  publish?: boolean;
}): Promise<RunnerReleaseAsset> {
  const identity = runnerReleaseIdentitySchema.parse(input.identity);
  const fileName = safeFileName(input.fileName);
  const fileSha256 = await hashFile(input.filePath);
  const stat = await fs.promises.stat(input.filePath);
  const storageKey = [
    "runner-releases",
    safeStorageSegment(identity.profile),
    safeStorageSegment(identity.channel),
    safeStorageSegment(identity.version),
    `${Date.now()}-${fileName}`,
  ].join("/");
  await storagePutFromPath(storageKey, input.filePath, input.contentType ?? "application/octet-stream");
  try {
    const db = getDb();
    const [row] = await db.insert(runnerReleaseAssets).values({
      ...identity,
      fileName,
      contentType: input.contentType ?? "application/octet-stream",
      storageKey,
      fileSizeBytes: stat.size,
      fileSha256,
      signature: input.signature ?? null,
      contractVersion: input.contractVersion ?? "sah-runner-v1",
      manifestJson: input.manifest ?? null,
      validationStatus: input.validationStatus ?? "valid",
      validationChecksJson: input.validationChecks ?? [{ id: "sha256", status: "ok", message: "SHA-256 recomputed from uploaded bytes" }],
      provenanceJson: {
        sourceCommit: input.provenance.sourceCommit,
        workflowRunId: input.provenance.workflowRunId ?? null,
        releaseTag: input.provenance.releaseTag ?? null,
        signatureAlgorithm: input.provenance.signatureAlgorithm ?? null,
      },
      releaseNotes: input.releaseNotes ?? null,
      isPublished: input.publish === true,
      publishedAt: input.publish === true ? new Date() : null,
      uploadedBy: input.uploadedByUserId ?? null,
    }).returning();
    return mapRow(row);
  } catch (error) {
    await storageDelete(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    if (/unique|duplicate/i.test(message)) {
      throw new RunnerReleaseError("runner_release_identity_exists", 409);
    }
    throw error;
  }
}

export async function updateRunnerReleasePublication(id: number, input: { publish?: boolean; withdraw?: boolean }): Promise<RunnerReleaseAsset> {
  if (input.publish === input.withdraw) throw new RunnerReleaseError("runner_release_action_invalid");
  const db = getDb();
  const [row] = await db.update(runnerReleaseAssets).set({
    isPublished: input.publish === true,
    publishedAt: input.publish === true ? new Date() : undefined,
    withdrawnAt: input.withdraw === true ? new Date() : input.publish === true ? null : undefined,
    updatedAt: new Date(),
  }).where(eq(runnerReleaseAssets.id, id)).returning();
  if (!row) throw new RunnerReleaseError("runner_release_not_found", 404);
  return mapRow(row);
}

export async function getRunnerReleaseStorageInfo(id: number): Promise<{ storageKey: string; fileName: string; contentType: string; isPublished: boolean; withdrawnAt: Date | null; validationStatus: string } | null> {
  const db = getDb();
  const [row] = await db.select({
    storageKey: runnerReleaseAssets.storageKey,
    fileName: runnerReleaseAssets.fileName,
    contentType: runnerReleaseAssets.contentType,
    isPublished: runnerReleaseAssets.isPublished,
    withdrawnAt: runnerReleaseAssets.withdrawnAt,
    validationStatus: runnerReleaseAssets.validationStatus,
  }).from(runnerReleaseAssets).where(eq(runnerReleaseAssets.id, id)).limit(1);
  return row ?? null;
}

export async function streamRunnerReleaseAsset(id: number, range?: string) {
  const storage = await getRunnerReleaseStorageInfo(id);
  if (!storage || !storage.isPublished || storage.withdrawnAt || storage.validationStatus !== "valid") {
    throw new RunnerReleaseError("runner_release_not_available", 404);
  }
  const result = await storageStreamFile(storage.storageKey, range);
  if (!result) throw new RunnerReleaseError("runner_release_storage_missing", 503);
  return { ...result, fileName: storage.fileName, contentType: storage.contentType };
}
