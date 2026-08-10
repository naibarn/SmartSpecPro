import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { mediaAssets } from "../../drizzle/schema";
import type { MediaTask } from "./mediaGenerationService";
import { assertR2StorageActive, storagePutFromPath } from "../storage";
import { validateReferenceUrls } from "./ssrfValidation";

const DOWNLOAD_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_IMAGE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export type VerticalDramaMediaType = "image" | "video";

export type DurableVerticalDramaAsset = {
  mediaAssetId: number;
  storageKey: string;
  url: string;
  mimeType: string;
};

export type VerticalDramaTaskDurability = {
  task: MediaTask;
  mediaAssetId: number;
  storageKey: string;
  durableUrl: string;
};

function readExtraParams(task: MediaTask): Record<string, unknown> {
  const parameters = task.parameters;
  if (!parameters || typeof parameters !== "object") return {};
  const record = parameters as Record<string, unknown>;
  for (const key of ["extra_params", "extraParams"]) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return record;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getVerticalDramaTaskScope(task: MediaTask): {
  seriesId: string;
  episodeId?: string;
  shotNumber?: string;
  purpose?: string;
} | null {
  const extra = readExtraParams(task);
  const seriesId = extra.__vd_series_id;
  if (!isNonEmptyString(seriesId)) return null;
  return {
    seriesId: seriesId.trim(),
    ...(isNonEmptyString(extra.__vd_episode_id)
      ? { episodeId: extra.__vd_episode_id.trim() }
      : {}),
    ...(isNonEmptyString(extra.__vd_shot_number)
      ? { shotNumber: extra.__vd_shot_number.trim() }
      : {}),
    ...(isNonEmptyString(extra.__vd_purpose)
      ? { purpose: extra.__vd_purpose.trim() }
      : {}),
  };
}

function normalizeManagedStorageKey(value: string): string | null {
  const trimmed = value.trim();
  const prefix = "/api/storage/files/";
  if (!trimmed.startsWith(prefix)) return null;
  const encoded = trimmed.slice(prefix.length).split(/[?#]/, 1)[0];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded).replace(/^\/+/, "");
  } catch {
    return null;
  }
}

export function isVerticalDramaManagedMediaUrl(value: string | null | undefined): boolean {
  return Boolean(value && normalizeManagedStorageKey(value));
}

export function extractVerticalDramaManagedMediaKey(
  value: string | null | undefined,
): string | null {
  return value ? normalizeManagedStorageKey(value) : null;
}

function inferMimeType(
  mediaType: VerticalDramaMediaType,
  requestedMimeType: string | undefined,
  responseMimeType: string | undefined,
): string {
  const candidate = (requestedMimeType || responseMimeType || "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType === "image" && candidate.startsWith("image/")) return candidate;
  if (mediaType === "video" && candidate.startsWith("video/")) return candidate;
  return mediaType === "image" ? "image/png" : "video/mp4";
}

function extensionFor(mediaType: VerticalDramaMediaType, mimeType: string): string {
  const known: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
  };
  return known[mimeType] ?? (mediaType === "image" ? ".png" : ".mp4");
}

function safeTaskPart(value: string | undefined): string {
  return (value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);
}

export async function downloadMediaToTempFile(
  sourceUrl: string,
  mediaType: VerticalDramaMediaType,
  requestedMimeType?: string,
): Promise<{ tempDir: string; tempPath: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "vd-r2-"));
  const tempPath = path.join(tempDir, "source.bin");
  try {
    const dataUrlMatch = sourceUrl.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/i);
    if (dataUrlMatch) {
      const declaredMime = dataUrlMatch[1] || undefined;
      const payload = dataUrlMatch[3] || "";
      const buffer = dataUrlMatch[2]
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8");
      const maxBytes = mediaType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
      if (buffer.byteLength === 0) throw new Error("Vertical Drama data URL was empty");
      if (buffer.byteLength > maxBytes) {
        throw new Error(`Vertical Drama ${mediaType} exceeds the ${maxBytes} byte limit`);
      }
      await fs.writeFile(tempPath, buffer);
      return {
        tempDir,
        tempPath,
        mimeType: inferMimeType(mediaType, requestedMimeType, declaredMime),
      };
    }
    await validateReferenceUrls([sourceUrl]);
    // Do not let fetch follow an unvalidated redirect to a private address.
    // Kie and other media providers occasionally redirect their result URL.
    let currentUrl = sourceUrl;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      await validateReferenceUrls([currentUrl]);
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { Accept: mediaType === "image" ? "image/*" : "video/*" },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("Vertical Drama media redirect had no location");
      if (redirectCount === 5) throw new Error("Vertical Drama media has too many redirects");
      currentUrl = new URL(location, currentUrl).toString();
    }
    if (!response || !response.ok || !response.body) {
      throw new Error(`Vertical Drama media download failed (${response?.status ?? 0})`);
    }
    const mimeType = inferMimeType(
      mediaType,
      requestedMimeType,
      response.headers.get("content-type") ?? undefined,
    );
    const maxBytes = mediaType === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) {
      throw new Error(`Vertical Drama ${mediaType} exceeds the ${maxBytes} byte limit`);
    }

    const handle = await fs.open(tempPath, "w");
    let totalBytes = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          throw new Error(`Vertical Drama ${mediaType} exceeds the ${maxBytes} byte limit`);
        }
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    if (totalBytes === 0) throw new Error("Vertical Drama media download was empty");
    return { tempDir, tempPath, mimeType };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function findExistingAsset(
  tenantId: string,
  userId: number,
  checksumSha256: string,
): Promise<DurableVerticalDramaAsset | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      originalUrl: mediaAssets.originalUrl,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, tenantId),
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.checksumSha256, checksumSha256),
      ),
    )
    .limit(1);
  if (!row || !isVerticalDramaManagedMediaUrl(row.originalUrl)) return null;
  return {
    mediaAssetId: row.id,
    storageKey: row.storageKey,
    url: row.originalUrl!,
    mimeType: row.mimeType,
  };
}

export async function ingestVerticalDramaMediaAsset(input: {
  tenantId: string;
  userId: number;
  seriesId: string | number;
  mediaType: VerticalDramaMediaType;
  sourceUrl: string;
  mimeType?: string;
  identity?: string;
  purpose?: string;
}): Promise<DurableVerticalDramaAsset> {
  await assertR2StorageActive();
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) throw new Error("Vertical Drama media result URL is empty");
  const managedKey = normalizeManagedStorageKey(sourceUrl);
  if (managedKey) {
    return {
      mediaAssetId: 0,
      storageKey: managedKey,
      url: `/api/storage/files/${encodeURI(managedKey)}`,
      mimeType: input.mimeType || (input.mediaType === "image" ? "image/png" : "video/mp4"),
    };
  }

  const checksumSha256 = crypto
    .createHash("sha256")
    .update(`vertical-drama:${input.mediaType}:${input.identity || sourceUrl}`)
    .digest("hex");
  const existing = await findExistingAsset(input.tenantId, input.userId, checksumSha256);
  if (existing) return existing;

  const downloaded = await downloadMediaToTempFile(sourceUrl, input.mediaType, input.mimeType);
  try {
    const key = [
      "vertical-drama",
      safeTaskPart(String(input.seriesId)),
      input.mediaType,
      safeTaskPart(input.purpose),
      `${checksumSha256}${extensionFor(input.mediaType, downloaded.mimeType)}`,
    ].join("/");
    const stored = await storagePutFromPath(key, downloaded.tempPath, downloaded.mimeType);
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const durableUrl = stored.url || `/api/storage/files/${encodeURI(stored.key)}`;
    const [inserted] = await db
      .insert(mediaAssets)
      .values({
        tenantId: input.tenantId,
        userId: input.userId,
        sourceType: "vertical_drama_generated",
        status: "ready",
        storageKey: stored.key,
        originalUrl: durableUrl,
        thumbnailUrl: input.mediaType === "image" ? durableUrl : null,
        mimeType: downloaded.mimeType,
        checksumSha256,
      })
      .onConflictDoNothing()
      .returning({ id: mediaAssets.id });
    if (inserted) {
      return {
        mediaAssetId: inserted.id,
        storageKey: stored.key,
        url: durableUrl,
        mimeType: downloaded.mimeType,
      };
    }
    const raced = await findExistingAsset(input.tenantId, input.userId, checksumSha256);
    if (!raced) throw new Error("Vertical Drama durable asset insert did not return an asset");
    return raced;
  } finally {
    await fs.rm(downloaded.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Move an existing Vertical Drama media_assets row to R2 without changing its
 * ID. This is deliberately separate from ingest: every storyboard/character/
 * location reference keeps pointing at the same canonical row after a
 * backfill.
 */
export async function migrateExistingVerticalDramaMediaAsset(input: {
  assetId: number;
  tenantId: string;
  userId: number;
  seriesId: string | number;
  mediaType: VerticalDramaMediaType;
  sourceUrl: string;
  mimeType?: string;
  purpose?: string;
}): Promise<DurableVerticalDramaAsset> {
  await assertR2StorageActive();
  const sourceUrl = input.sourceUrl.trim();
  const managedKey = normalizeManagedStorageKey(sourceUrl);
  if (managedKey) {
    const durableUrl = `/api/storage/files/${encodeURI(managedKey)}`;
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
      .update(mediaAssets)
      .set({
        status: "ready",
        storageKey: managedKey,
        originalUrl: durableUrl,
        thumbnailUrl: input.mediaType === "image" ? durableUrl : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaAssets.id, input.assetId),
          eq(mediaAssets.tenantId, input.tenantId),
          eq(mediaAssets.userId, input.userId),
        ),
      );
    return {
      mediaAssetId: input.assetId,
      storageKey: managedKey,
      url: durableUrl,
      mimeType: input.mimeType || (input.mediaType === "image" ? "image/png" : "video/mp4"),
    };
  }

  const downloaded = await downloadMediaToTempFile(sourceUrl, input.mediaType, input.mimeType);
  try {
    const sourceHash = crypto.createHash("sha256").update(sourceUrl).digest("hex");
    const key = [
      "vertical-drama",
      safeTaskPart(String(input.seriesId)),
      input.mediaType,
      safeTaskPart(input.purpose || "backfill"),
      `asset-${input.assetId}-${sourceHash}${extensionFor(input.mediaType, downloaded.mimeType)}`,
    ].join("/");
    const stored = await storagePutFromPath(key, downloaded.tempPath, downloaded.mimeType);
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const durableUrl = stored.url || `/api/storage/files/${encodeURI(stored.key)}`;
    const fileSize = (await fs.stat(downloaded.tempPath)).size;
    const checksumSha256 = crypto
      .createHash("sha256")
      .update(`vertical-drama-backfill:${input.assetId}:${sourceUrl}`)
      .digest("hex");
    await db
      .update(mediaAssets)
      .set({
        sourceType: "vertical_drama_generated",
        status: "ready",
        storageKey: stored.key,
        originalUrl: durableUrl,
        thumbnailUrl: input.mediaType === "image" ? durableUrl : null,
        mimeType: downloaded.mimeType,
        fileSize,
        checksumSha256,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaAssets.id, input.assetId),
          eq(mediaAssets.tenantId, input.tenantId),
          eq(mediaAssets.userId, input.userId),
        ),
      );
    return {
      mediaAssetId: input.assetId,
      storageKey: stored.key,
      url: durableUrl,
      mimeType: downloaded.mimeType,
    };
  } finally {
    await fs.rm(downloaded.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function ensureVerticalDramaTaskResultDurable(input: {
  tenantId: string;
  userId: number;
  task: MediaTask;
}): Promise<VerticalDramaTaskDurability | null> {
  const scope = getVerticalDramaTaskScope(input.task);
  if (!scope || input.task.status !== "completed" || !isNonEmptyString(input.task.resultUrl)) {
    return null;
  }
  const mediaType = input.task.mediaType === "video" ? "video" : input.task.mediaType === "image" ? "image" : null;
  if (!mediaType) return null;
  const asset = await ingestVerticalDramaMediaAsset({
    tenantId: input.tenantId,
    userId: input.userId,
    seriesId: scope.seriesId,
    mediaType,
    sourceUrl: input.task.resultUrl,
    mimeType: mediaType === "image" ? "image/png" : "video/mp4",
    identity: input.task.id,
    purpose: scope.purpose || mediaType,
  });
  const resultData = {
    ...(input.task.resultData || {}),
    verticalDramaDurabilityStatus: "ready",
    verticalDramaMediaAssetId: asset.mediaAssetId || undefined,
    verticalDramaStorageKey: asset.storageKey,
  };
  return {
    mediaAssetId: asset.mediaAssetId,
    storageKey: asset.storageKey,
    durableUrl: asset.url,
    task: {
      ...input.task,
      resultUrl: asset.url,
      resultData,
    },
  };
}
