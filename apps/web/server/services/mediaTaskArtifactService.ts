import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  mediaAssets,
  mediaTaskArtifacts,
  type MediaTaskArtifact,
} from "../../drizzle/schema";
import {
  assertR2StorageActive,
  storageExists,
  storagePutFromPath,
} from "../storage";
import { validateReferenceUrls } from "./ssrfValidation";
import type {
  MediaTask,
  MediaTaskArtifactProjection,
  MediaType,
} from "./mediaGenerationService";

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BYTES: Record<MediaType, number> = {
  image: 100 * 1024 * 1024,
  video: 2 * 1024 * 1024 * 1024,
  audio: 250 * 1024 * 1024,
};

type ProviderStatus = "unknown" | "available" | "expired" | "unavailable";
type R2Status = "pending" | "ready" | "failed" | "missing";

export type MediaTaskArtifactSourceKind =
  | "provider"
  | "deferred"
  | "mcp"
  | "hermes"
  | "hyperframes";

export type DownloadedMedia = {
  tempDir: string;
  tempPath: string;
  mimeType: string;
  extension: string;
  fileSize: number;
  checksumSha256: string;
};

export type MediaTaskArtifactInput = {
  task: MediaTask;
  tenantId: string;
  userId: number;
  sourceKind?: MediaTaskArtifactSourceKind;
};

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMediaUrl(value: string): boolean {
  return /^(https?:\/\/|\/uploads\/|\/api\/storage\/)/i.test(value.trim());
}

function isManagedStorageUrl(value: string): boolean {
  return value.trim().startsWith("/api/storage/files/");
}

function managedStorageKey(value: string): string | null {
  if (!isManagedStorageUrl(value)) return null;
  const encoded = value
    .trim()
    .slice("/api/storage/files/".length)
    .split(/[?#]/, 1)[0];
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded).replace(/^\/+/, "");
    return decoded && !decoded.includes("..") ? decoded : null;
  } catch {
    return null;
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96) || "unknown";
}

export function extensionFor(
  mediaType: MediaType,
  mimeType: string,
  sourceUrl: string
): string {
  const known: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
  };
  const normalized = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (known[normalized]) return known[normalized];
  try {
    const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
  } catch {
    // Use the media type fallback below.
  }
  return mediaType === "image"
    ? ".png"
    : mediaType === "video"
      ? ".mp4"
      : ".mp3";
}

export function fallbackMimeType(mediaType: MediaType): string {
  return mediaType === "image"
    ? "image/png"
    : mediaType === "video"
      ? "video/mp4"
      : "audio/mpeg";
}

function sanitizeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return message.replace(/https?:\/\/\S+/gi, "[provider-url]").slice(0, 500);
}

export class ProviderResultError extends Error {
  readonly providerStatus: ProviderStatus;

  constructor(message: string, providerStatus: ProviderStatus) {
    super(message);
    this.name = "ProviderResultError";
    this.providerStatus = providerStatus;
  }
}

/**
 * A generic failure in the durability boundary is not proof that the provider
 * URL is unavailable. Keep it eligible as a temporary fallback so a storage
 * outage does not turn an otherwise viewable completed result into a blank
 * history card. ProviderResultError is reserved for failures observed while
 * validating/downloading the provider result itself.
 */
export function classifyMediaArtifactFailure(
  error: unknown,
  providerDownloadCompleted = false,
): ProviderStatus {
  if (error instanceof ProviderResultError) return error.providerStatus;
  return providerDownloadCompleted ? "available" : "unknown";
}

function collectUrls(
  value: unknown,
  output: string[],
  seen = new Set<unknown>(),
  depth = 0,
  keyHint = ""
): void {
  if (depth > 8 || value == null || seen.has(value)) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      isMediaUrl(trimmed) &&
      (!keyHint ||
        /(?:result|output|image|video|audio|file|download).*url|^url$/i.test(
          keyHint
        ))
    ) {
      output.push(trimmed);
    } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        collectUrls(JSON.parse(trimmed), output, seen, depth + 1, keyHint);
      } catch {
        // Ignore provider payload strings that are not JSON.
      }
    }
    return;
  }
  if (typeof value !== "object") return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => collectUrls(item, output, seen, depth + 1, keyHint));
    return;
  }
  const containerKeys = new Set([
    "data",
    "response",
    "result",
    "output",
    "resultJson",
    "kie_ai_response",
    "raw_response",
    "submission",
  ]);
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (
      containerKeys.has(key) ||
      /(?:result|output|image|video|audio|file|download).*url|^url$/i.test(key)
    ) {
      collectUrls(nested, output, seen, depth + 1, key);
    }
  }
}

export function extractMediaTaskOutputUrls(task: MediaTask): string[] {
  const candidates: string[] = [];
  if (isNonEmpty(task.resultUrl) && isMediaUrl(task.resultUrl))
    candidates.push(task.resultUrl.trim());
  collectUrls(task.resultData, candidates);
  return [...new Set(candidates)];
}

export function sourceKindForMediaTask(
  task: MediaTask
): MediaTaskArtifactSourceKind {
  if (task.id.startsWith("mcp_")) return "mcp";
  if (task.id.startsWith("hermes_")) return "hermes";
  if (task.id.startsWith("deferred-")) return "deferred";
  if (
    String(task.parameters?.source ?? "")
      .toLowerCase()
      .includes("hyperframes")
  ) {
    return "hyperframes";
  }
  return "provider";
}

function artifactR2Url(row: MediaTaskArtifact): string | undefined {
  if (!row.r2StorageKey || row.r2Status !== "ready") return undefined;
  return `/api/storage/files/${encodeURI(row.r2StorageKey)}`;
}

function projectArtifact(row: MediaTaskArtifact): MediaTaskArtifactProjection {
  const r2Url = artifactR2Url(row);
  const providerUrl = isNonEmpty(row.providerOriginalUrl)
    ? row.providerOriginalUrl.trim()
    : undefined;
  const fallbackAllowed = Boolean(
    providerUrl &&
    (row.providerStatus === "unknown" || row.providerStatus === "available")
  );
  const playbackUrl = r2Url ?? (fallbackAllowed ? providerUrl : undefined);
  const availabilityStatus = r2Url
    ? "ready"
    : row.providerStatus === "expired"
      ? "provider_expired"
      : row.r2Status === "missing"
        ? "r2_missing"
        : fallbackAllowed
          ? "provider_fallback"
          : "storage_pending";
  const availabilityReason =
    row.providerStatus === "expired"
      ? "The provider result URL has expired."
      : row.r2Status === "missing"
        ? "The R2 object is missing."
        : row.r2Status === "failed"
          ? "The result could not be copied to R2 yet."
          : undefined;
  return {
    artifactId: String(row.id),
    outputIndex: row.outputIndex,
    ...(r2Url ? { r2Url } : {}),
    ...(row.r2StorageKey ? { r2StorageKey: row.r2StorageKey } : {}),
    r2Status: row.r2Status,
    ...(providerUrl ? { providerOriginalUrl: providerUrl } : {}),
    providerStatus: row.providerStatus,
    ...(row.providerCheckedAt
      ? { providerCheckedAt: row.providerCheckedAt.toISOString() }
      : {}),
    ...(playbackUrl ? { playbackUrl } : {}),
    ...(fallbackAllowed && !r2Url ? { fallbackUrl: providerUrl } : {}),
    availabilityStatus,
    ...(availabilityReason ? { availabilityReason } : {}),
  };
}

export function applyMediaArtifactProjection(
  task: MediaTask,
  artifacts: MediaTaskArtifactProjection[]
): MediaTask {
  if (artifacts.length === 0) {
    // A completed task without a durable ledger row is still in the migration
    // window. Keep the provider URL as a temporary fallback for the owner so
    // the history card remains usable while durable storage is repaired; it
    // is not promoted to the canonical resultUrl field.
    const providerUrl = extractMediaTaskOutputUrls(task)[0];
    return task.status === "completed" && providerUrl
      ? {
          ...task,
          resultUrl: undefined,
          artifacts: [
            {
              artifactId: `storage-pending-${task.id}`,
              outputIndex: 0,
              r2Status: "pending",
              providerStatus: "unknown",
              providerOriginalUrl: providerUrl,
              availabilityStatus: "provider_fallback",
              availabilityReason:
                "Durable R2 playback is not available yet; using the provider result temporarily.",
            },
          ],
        }
      : task;
  }
  const primary =
    artifacts.find(item => item.outputIndex === 0) ?? artifacts[0];
  return {
    ...task,
    artifacts,
    ...(primary.playbackUrl
      ? { resultUrl: primary.playbackUrl }
      : { resultUrl: undefined }),
    resultData: {
      ...(task.resultData ?? {}),
      mediaArtifacts: artifacts,
    },
  };
}

/**
 * Legacy provider tasks can predate tenant propagation. Keep their provider
 * URL as server-side provenance, but never expose it as tenant playback until
 * ownership is repaired.
 */
export function redactMediaTaskWithoutTenant(task: MediaTask): MediaTask {
  if (task.status !== "completed" || extractMediaTaskOutputUrls(task).length === 0) {
    return task;
  }
  return applyMediaArtifactProjection(task, [{
    artifactId: `legacy-scope-${task.id}`,
    outputIndex: 0,
    r2Status: "failed",
    providerStatus: "unknown",
    availabilityStatus: "tenant_scope_missing",
    availabilityReason:
      "Tenant ownership is missing for this legacy media task; playback is blocked until it is repaired.",
  }]);
}

export async function downloadProviderMedia(
  sourceUrl: string,
  mediaType: MediaType
): Promise<DownloadedMedia> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "media-r2-"));
  const tempPath = path.join(tempDir, "source.bin");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    await validateReferenceUrls([sourceUrl]);
    let currentUrl = sourceUrl;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      await validateReferenceUrls([currentUrl]);
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Accept: `${mediaType}/*` },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirectCount === 5) {
        throw new ProviderResultError(
          "Provider result redirect was invalid",
          "unavailable"
        );
      }
      currentUrl = new URL(location, currentUrl).toString();
    }
    if (!response || !response.ok || !response.body) {
      const providerStatus: ProviderStatus =
        response && [401, 403, 404, 410].includes(response.status)
          ? "expired"
          : "unavailable";
      throw new ProviderResultError(
        `Provider result download failed (${response?.status ?? 0})`,
        providerStatus
      );
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_BYTES[mediaType]) {
      throw new ProviderResultError(
        "Provider result exceeds the media size limit",
        "unavailable"
      );
    }
    const mimeType =
      response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() || fallbackMimeType(mediaType);
    const hash = crypto.createHash("sha256");
    const handle = await fs.open(tempPath, "w");
    let fileSize = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        fileSize += chunk.byteLength;
        if (fileSize > MAX_BYTES[mediaType]) {
          throw new ProviderResultError(
            "Provider result exceeds the media size limit",
            "unavailable"
          );
        }
        hash.update(chunk);
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    if (fileSize === 0)
      throw new ProviderResultError("Provider result was empty", "unavailable");
    return {
      tempDir,
      tempPath,
      mimeType,
      extension: extensionFor(mediaType, mimeType, currentUrl),
      fileSize,
      checksumSha256: hash.digest("hex"),
    };
  } catch (error) {
    await fs
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findArtifact(
  sourceKind: MediaTaskArtifactSourceKind,
  sourceTaskId: string,
  outputIndex: number,
  tenantId: string,
  userId: number
): Promise<MediaTaskArtifact | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(mediaTaskArtifacts)
    .where(
      and(
        eq(mediaTaskArtifacts.sourceKind, sourceKind),
        eq(mediaTaskArtifacts.sourceTaskId, sourceTaskId),
        eq(mediaTaskArtifacts.outputIndex, outputIndex),
        eq(mediaTaskArtifacts.tenantId, tenantId),
        eq(mediaTaskArtifacts.userId, userId)
      )
    )
    .limit(1);
  return row ?? null;
}

async function ensureLedgerRow(input: {
  sourceKind: MediaTaskArtifactSourceKind;
  sourceTaskId: string;
  outputIndex: number;
  tenantId: string;
  userId: number;
  task: MediaTask;
  providerUrl?: string;
}): Promise<MediaTaskArtifact> {
  const db = getDb();
  await db
    .insert(mediaTaskArtifacts)
    .values({
      sourceKind: input.sourceKind,
      sourceTaskId: input.sourceTaskId,
      outputIndex: input.outputIndex,
      tenantId: input.tenantId,
      userId: input.userId,
      mediaType: input.task.mediaType,
      provider: undefined,
      model: input.task.model,
      providerOriginalUrl: input.providerUrl,
    })
    .onConflictDoNothing();
  const row = await findArtifact(
    input.sourceKind,
    input.sourceTaskId,
    input.outputIndex,
    input.tenantId,
    input.userId
  );
  if (!row) throw new Error("Media artifact ledger row was not created");
  if (input.providerUrl && row.providerOriginalUrl !== input.providerUrl) {
    const [updated] = await db
      .update(mediaTaskArtifacts)
      .set({ providerOriginalUrl: input.providerUrl, updatedAt: new Date() })
      .where(
        and(
          eq(mediaTaskArtifacts.id, row.id),
          eq(mediaTaskArtifacts.tenantId, input.tenantId),
          eq(mediaTaskArtifacts.userId, input.userId)
        )
      )
      .returning();
    return updated ?? { ...row, providerOriginalUrl: input.providerUrl };
  }
  return row;
}

async function attachExistingMediaAsset(
  row: MediaTaskArtifact,
  task: MediaTask,
  tenantId: string,
  userId: number
): Promise<MediaTaskArtifact> {
  const rawAssetId = task.resultData?.mediaAssetId;
  const mediaAssetId =
    typeof rawAssetId === "number" || typeof rawAssetId === "string"
      ? Number(rawAssetId)
      : NaN;
  if (!Number.isFinite(mediaAssetId)) return row;
  const db = getDb();
  const [asset] = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      status: mediaAssets.status,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, mediaAssetId),
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, userId)
      )
    )
    .limit(1);
  if (!asset || asset.status !== "ready") return row;
  const [updated] = await db
    .update(mediaTaskArtifacts)
    .set({
      mediaAssetId: asset.id,
      r2StorageKey: asset.storageKey,
      r2Status: "ready",
      r2Error: null,
      nextRetryAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaTaskArtifacts.id, row.id),
        eq(mediaTaskArtifacts.tenantId, tenantId),
        eq(mediaTaskArtifacts.userId, userId)
      )
    )
    .returning();
  return updated ?? row;
}

async function ingestOne(input: {
  row: MediaTaskArtifact;
  task: MediaTask;
  sourceUrl: string;
  tenantId: string;
  userId: number;
}): Promise<MediaTaskArtifact> {
  const db = getDb();
  if (input.row.r2Status === "ready" && input.row.r2StorageKey)
    return input.row;
  if (input.row.providerStatus === "expired") return input.row;
  if (input.row.nextRetryAt && input.row.nextRetryAt.getTime() > Date.now()) {
    return input.row;
  }
  const managedKey = managedStorageKey(input.sourceUrl);
  if (managedKey) {
    const [asset] = await db
      .select({
        id: mediaAssets.id,
        storageKey: mediaAssets.storageKey,
        status: mediaAssets.status,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.storageKey, managedKey),
          eq(mediaAssets.tenantId, input.tenantId),
          eq(mediaAssets.userId, input.userId),
          eq(mediaAssets.status, "ready")
        )
      )
      .limit(1);
    if (!asset) {
      const expectedMcpPrefix = `mcp-media/${input.tenantId}/${input.userId}/${input.row.sourceTaskId}/`;
      if (
        input.row.sourceKind !== "mcp" ||
        !managedKey.startsWith(expectedMcpPrefix) ||
        !(await storageExists(managedKey))
      ) {
        throw new Error(
          "Managed media result is not registered for this account"
        );
      }

      const durableUrl = `/api/storage/files/${encodeURI(managedKey)}`;
      const [registered] = await db
        .insert(mediaAssets)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          sourceType: "mcp_generated",
          status: "ready",
          storageKey: managedKey,
          originalUrl: durableUrl,
          thumbnailUrl: input.task.mediaType === "image" ? durableUrl : null,
          mimeType: fallbackMimeType(input.task.mediaType),
        })
        .returning({ id: mediaAssets.id, storageKey: mediaAssets.storageKey });
      if (!registered) throw new Error("MCP media asset registration failed");
      const [updated] = await db
        .update(mediaTaskArtifacts)
        .set({
          mediaAssetId: registered.id,
          r2StorageKey: registered.storageKey,
          r2Status: "ready",
          r2Error: null,
          nextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaTaskArtifacts.id, input.row.id),
            eq(mediaTaskArtifacts.tenantId, input.tenantId),
            eq(mediaTaskArtifacts.userId, input.userId)
          )
        )
        .returning();
      return updated ?? input.row;
    }
    const [updated] = await db
      .update(mediaTaskArtifacts)
      .set({
        mediaAssetId: asset.id,
        r2StorageKey: asset.storageKey,
        r2Status: "ready",
        r2Error: null,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaTaskArtifacts.id, input.row.id),
          eq(mediaTaskArtifacts.tenantId, input.tenantId),
          eq(mediaTaskArtifacts.userId, input.userId)
        )
      )
      .returning();
    return updated ?? input.row;
  }

  let downloaded: DownloadedMedia | null = null;
  try {
    await assertR2StorageActive();
    downloaded = await downloadProviderMedia(
      input.sourceUrl,
      input.task.mediaType
    );
    const keyHash = crypto
      .createHash("sha256")
      .update(
        `${input.row.sourceKind}:${input.row.sourceTaskId}:${input.row.outputIndex}`
      )
      .digest("hex");
    const storageKey = [
      "media-studio",
      safeSegment(input.tenantId),
      safeSegment(String(input.userId)),
      input.task.mediaType,
      `${safeSegment(input.row.sourceKind)}-${safeSegment(input.row.sourceTaskId)}-${keyHash.slice(0, 16)}${downloaded.extension}`,
    ].join("/");
    const stored = await storagePutFromPath(
      storageKey,
      downloaded.tempPath,
      downloaded.mimeType
    );
    const durableUrl =
      stored.url || `/api/storage/files/${encodeURI(stored.key)}`;
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        sourceType: "media_studio_generated",
        status: "ready",
        storageKey: stored.key,
        originalUrl: durableUrl,
        thumbnailUrl: input.task.mediaType === "image" ? durableUrl : null,
        mimeType: downloaded.mimeType,
        fileSize: downloaded.fileSize,
        checksumSha256: downloaded.checksumSha256,
      })
      .returning({ id: mediaAssets.id, storageKey: mediaAssets.storageKey });
    if (!asset) throw new Error("Media asset insert did not return an asset");
    const [updated] = await db
      .update(mediaTaskArtifacts)
      .set({
        mediaAssetId: asset.id,
        r2StorageKey: asset.storageKey,
        r2Status: "ready",
        providerStatus: "available",
        providerCheckedAt: new Date(),
        providerError: null,
        r2Error: null,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaTaskArtifacts.id, input.row.id),
          eq(mediaTaskArtifacts.tenantId, input.tenantId),
          eq(mediaTaskArtifacts.userId, input.userId)
        )
      )
      .returning();
    return updated ?? input.row;
  } catch (error) {
    const providerStatus = classifyMediaArtifactFailure(
      error,
      Boolean(downloaded),
    );
    const attemptCount = (input.row.attemptCount ?? 0) + 1;
    const retryDelayMs =
      providerStatus === "expired"
        ? 0
        : Math.min(
            15 * 60 * 1000,
            15 * 1000 * 2 ** Math.min(attemptCount - 1, 6)
          );
    const [updated] = await db
      .update(mediaTaskArtifacts)
      .set({
        providerStatus,
        providerCheckedAt: new Date(),
        providerError:
          providerStatus === "expired"
            ? "Provider result URL expired"
            : sanitizeError(error),
        r2Status: "failed",
        r2Error: sanitizeError(error),
        attemptCount,
        nextRetryAt:
          retryDelayMs > 0 ? new Date(Date.now() + retryDelayMs) : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaTaskArtifacts.id, input.row.id),
          eq(mediaTaskArtifacts.tenantId, input.tenantId),
          eq(mediaTaskArtifacts.userId, input.userId)
        )
      )
      .returning();
    return updated ?? input.row;
  } finally {
    if (downloaded)
      await fs
        .rm(downloaded.tempDir, { recursive: true, force: true })
        .catch(() => undefined);
  }
}

export async function projectMediaTaskArtifacts(input: {
  tasks: MediaTask[];
  tenantId: string;
  userId: number;
}): Promise<MediaTask[]> {
  if (!input.tenantId || !input.userId || input.tasks.length === 0)
    return input.tasks;
  const db = getDb();
  const taskIds = input.tasks.map(task => task.id).filter(Boolean);
  const rows = await db
    .select()
    .from(mediaTaskArtifacts)
    .where(
      and(
        eq(mediaTaskArtifacts.tenantId, input.tenantId),
        eq(mediaTaskArtifacts.userId, input.userId),
        inArray(mediaTaskArtifacts.sourceTaskId, taskIds)
      )
    )
    .orderBy(desc(mediaTaskArtifacts.outputIndex));
  const bySource = new Map<string, MediaTaskArtifact[]>();
  for (const row of rows) {
    const key = `${row.sourceKind}:${row.sourceTaskId}`;
    const list = bySource.get(key) ?? [];
    list.push(row);
    bySource.set(key, list);
  }
  return input.tasks.map(task => {
    const rowsForTask =
      bySource.get(`${sourceKindForMediaTask(task)}:${task.id}`) ?? [];
    return applyMediaArtifactProjection(
      task,
      rowsForTask
        .sort((a, b) => a.outputIndex - b.outputIndex)
        .map(projectArtifact)
    );
  });
}

export async function ensureMediaTaskArtifactsDurable(
  input: MediaTaskArtifactInput
): Promise<MediaTask> {
  if (!input.tenantId || !input.userId || input.task.status !== "completed")
    return input.task;
  const sourceKind = input.sourceKind ?? sourceKindForMediaTask(input.task);
  const urls = extractMediaTaskOutputUrls(input.task);
  const sourceTaskId = input.task.id;
  const artifacts: MediaTaskArtifactProjection[] = [];
  const candidateUrls = urls.length > 0 ? urls : [undefined];
  for (
    let outputIndex = 0;
    outputIndex < candidateUrls.length;
    outputIndex += 1
  ) {
    const providerUrl = candidateUrls[outputIndex];
    let row = await ensureLedgerRow({
      sourceKind,
      sourceTaskId,
      outputIndex,
      tenantId: input.tenantId,
      userId: input.userId,
      task: input.task,
      providerUrl,
    });
    row = await attachExistingMediaAsset(
      row,
      input.task,
      input.tenantId,
      input.userId
    );
    if (!providerUrl && row.r2Status === "pending" && !row.r2StorageKey) {
      const db = getDb();
      const [missing] = await db
        .update(mediaTaskArtifacts)
        .set({
          r2Status: "missing",
          r2Error: "Completed task has no media output URL",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaTaskArtifacts.id, row.id),
            eq(mediaTaskArtifacts.tenantId, input.tenantId),
            eq(mediaTaskArtifacts.userId, input.userId)
          )
        )
        .returning();
      row = missing ?? row;
    }
    if (providerUrl)
      row = await ingestOne({
        row,
        task: input.task,
        sourceUrl: providerUrl,
        tenantId: input.tenantId,
        userId: input.userId,
      });
    artifacts.push(projectArtifact(row));
  }
  return applyMediaArtifactProjection(input.task, artifacts);
}

export async function ensureMediaTaskArtifactsForPolling(input: {
  task: MediaTask;
  tenantId: string;
  userId: number;
}): Promise<MediaTask> {
  try {
    return await ensureMediaTaskArtifactsDurable(input);
  } catch (error) {
    // A durability outage must not turn a completed generation into a failed
    // generation. The ledger records failures when possible; polling remains
    // truthful and the backfill/retry path can repair it later.
    console.warn("[MediaArtifact] durability attempt failed", {
      taskId: input.task.id,
      mediaType: input.task.mediaType,
      error: sanitizeError(error),
    });
    return applyMediaArtifactProjection(input.task, []);
  }
}

const HISTORY_DURABILITY_CONCURRENCY = 4;
const HISTORY_DURABILITY_TIMEOUT_MS = 15_000;

function isDomainOwnedMediaTask(task: MediaTask): boolean {
  const internalParams = {
    ...(task.parameters ?? {}),
    ...((task.parameters?.extra_params as
      | Record<string, unknown>
      | undefined) ?? {}),
    ...((task.resultData?.extra_params as
      | Record<string, unknown>
      | undefined) ?? {}),
  };
  return Boolean(
    internalParams.__vd_series_id || internalParams.__auto_review_run_id
  );
}

/**
 * History is also a durability entry point. A completed task may have been
 * finalized by a provider callback without a subsequent task poll, so only
 * projecting the existing ledger leaves it stuck as "copying to R2" forever.
 * Keep the repair bounded because a history page can contain many completed
 * provider results, and never touch domain-owned media ledgers here.
 */
export async function durabilizeMediaTaskHistory(input: {
  tasks: MediaTask[];
  tenantId: string;
  userId: number;
}): Promise<MediaTask[]> {
  const output = [...input.tasks];
  const candidates = input.tasks
    .map((task, index) => ({ task, index }))
    .filter(
      ({ task }) => task.status === "completed" && !isDomainOwnedMediaTask(task)
    );

  for (
    let offset = 0;
    offset < candidates.length;
    offset += HISTORY_DURABILITY_CONCURRENCY
  ) {
    const batch = candidates.slice(
      offset,
      offset + HISTORY_DURABILITY_CONCURRENCY
    );
    await Promise.all(
      batch.map(({ task, index }) =>
        (async () => {
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          try {
            const result = await Promise.race([
              ensureMediaTaskArtifactsForPolling({
                task,
                tenantId: input.tenantId,
                userId: input.userId,
              }),
              new Promise<MediaTask>(resolve => {
                timeoutHandle = setTimeout(
                  () => resolve(task),
                  HISTORY_DURABILITY_TIMEOUT_MS
                );
              }),
            ]);
            output[index] = result;
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
          }
        })()
      )
    );
  }

  return output;
}
