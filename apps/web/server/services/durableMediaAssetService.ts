import crypto from "crypto";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { mediaAssets } from "../../drizzle/schema";
import {
  assertR2StorageActive,
  storageExists,
  storagePut,
  storagePutFromPath,
} from "../storage";
import {
  downloadProviderMedia,
  extensionFor,
  fallbackMimeType,
  type DownloadedMedia,
} from "./mediaTaskArtifactService";
import type {
  MediaGenerationResponse,
  MediaGenerationResult,
  MediaType,
} from "./mediaGenerationService";

export type DurableMediaSourceType =
  | "media_studio_generated"
  | "media_sync_generated"
  | "library_migrated"
  | "presentation_export"
  | "video_editor_render"
  | "chat_generated"
  | "chat_attachment"
  | "vertical_drama_reference";

export type DurableMediaCopyInput = {
  tenantId: string;
  userId: number;
  mediaType: MediaType;
  sourceType: DurableMediaSourceType;
  sourceUrl?: string | null;
  sourcePath?: string | null;
  originalUrl?: string | null;
  mimeType?: string | null;
  identity?: string | null;
};

export type DurableMediaCopyResult = {
  storageKey: string;
  url: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  originalUrl: string | null;
};

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96) || "unknown";
}

async function checksumFile(filePath: string): Promise<{ size: number; checksumSha256: string }> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error("Media source file is empty or unavailable");
  const hash = crypto.createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return { size: stat.size, checksumSha256: hash.digest("hex") };
}

function extensionFromMimeOrPath(mediaType: MediaType, mimeType: string, source: string): string {
  const known = extensionFor(mediaType, mimeType, source);
  return /^\.[a-z0-9]{2,8}$/i.test(known)
    ? known.toLowerCase()
    : mediaType === "image"
      ? ".png"
      : mediaType === "video"
        ? ".mp4"
        : ".mp3";
}

function isManagedStorageUrl(value: string): boolean {
  return value.trim().startsWith("/api/storage/files/");
}

function managedStorageKey(value: string): string | null {
  if (!isManagedStorageUrl(value)) return null;
  const encoded = value.trim().slice("/api/storage/files/".length).split(/[?#]/, 1)[0];
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded).replace(/^\/+/, "");
    return decoded && !decoded.includes("..") ? decoded : null;
  } catch {
    return null;
  }
}

async function copyDownloadedToR2(
  downloaded: DownloadedMedia,
  input: DurableMediaCopyInput,
  originalUrl: string | null,
): Promise<DurableMediaCopyResult> {
  try {
    const storageKey = [
      "durable-media",
      safeSegment(input.tenantId),
      safeSegment(String(input.userId)),
      input.sourceType,
      `${downloaded.checksumSha256}${downloaded.extension}`,
    ].join("/");
    await assertR2StorageActive();
    if (!(await storageExists(storageKey))) {
      await storagePutFromPath(storageKey, downloaded.tempPath, downloaded.mimeType);
    }
    return {
      storageKey,
      url: `/api/storage/files/${encodeURI(storageKey)}`,
      mimeType: downloaded.mimeType,
      fileSize: downloaded.fileSize,
      checksumSha256: downloaded.checksumSha256,
      originalUrl,
    };
  } finally {
    await fs.rm(downloaded.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function copyMediaBufferToR2(
  input: DurableMediaCopyInput,
  data: Buffer | Uint8Array,
): Promise<DurableMediaCopyResult> {
  if (!input.tenantId || !input.userId) throw new Error("Tenant and user scope are required");
  if (!data || data.byteLength <= 0) throw new Error("Media source buffer is empty");
  await assertR2StorageActive();
  const buffer = Buffer.from(data);
  const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const mimeType = input.mimeType || fallbackMimeType(input.mediaType);
  const extension = extensionFromMimeOrPath(input.mediaType, mimeType, input.originalUrl || "");
  const storageKey = [
    "durable-media",
    safeSegment(input.tenantId),
    safeSegment(String(input.userId)),
    input.sourceType,
    `${checksumSha256}${extension}`,
  ].join("/");
  if (!(await storageExists(storageKey))) {
    await storagePut(storageKey, buffer, mimeType);
  }
  return {
    storageKey,
    url: `/api/storage/files/${encodeURI(storageKey)}`,
    mimeType,
    fileSize: buffer.byteLength,
    checksumSha256,
    originalUrl: input.originalUrl ?? null,
  };
}

export async function copyMediaSourceToR2(
  input: DurableMediaCopyInput,
): Promise<DurableMediaCopyResult> {
  if (!input.tenantId || !input.userId) throw new Error("Tenant and user scope are required");
  if (!input.sourceUrl && !input.sourcePath) throw new Error("Media source is required");
  await assertR2StorageActive();

  const sourceUrl = input.sourceUrl?.trim() || null;
  const managedKey = sourceUrl ? managedStorageKey(sourceUrl) : null;
  if (managedKey && (await storageExists(managedKey))) {
    return {
      storageKey: managedKey,
      url: `/api/storage/files/${encodeURI(managedKey)}`,
      mimeType: input.mimeType || fallbackMimeType(input.mediaType),
      fileSize: 0,
      checksumSha256: crypto.createHash("sha256").update(managedKey).digest("hex"),
      originalUrl: input.originalUrl ?? sourceUrl,
    };
  }

  if (input.sourcePath) {
    const file = await checksumFile(input.sourcePath);
    const mimeType = input.mimeType || fallbackMimeType(input.mediaType);
    const extension = extensionFromMimeOrPath(input.mediaType, mimeType, input.sourcePath);
    const storageKey = [
      "durable-media",
      safeSegment(input.tenantId),
      safeSegment(String(input.userId)),
      input.sourceType,
      `${file.checksumSha256}${extension}`,
    ].join("/");
    if (!(await storageExists(storageKey))) {
      await storagePutFromPath(storageKey, input.sourcePath, mimeType);
    }
    return {
      storageKey,
      url: `/api/storage/files/${encodeURI(storageKey)}`,
      mimeType,
      fileSize: file.size,
      checksumSha256: file.checksumSha256,
      originalUrl: input.originalUrl ?? null,
    };
  }

  const downloaded = await downloadProviderMedia(sourceUrl!, input.mediaType);
  return copyDownloadedToR2(downloaded, input, input.originalUrl ?? sourceUrl);
}

export async function ensureExternalMediaAssetDurable(
  input: DurableMediaCopyInput,
): Promise<{ assetId: number; copy: DurableMediaCopyResult }> {
  const db = getDb();
  const copy = await copyMediaSourceToR2(input);
  const existing = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(
      eq(mediaAssets.tenantId, input.tenantId),
      eq(mediaAssets.userId, input.userId),
      eq(mediaAssets.storageKey, copy.storageKey),
    ))
    .limit(1);
  if (existing[0]) return { assetId: existing[0].id, copy };

  const inserted = await db
    .insert(mediaAssets)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      sourceType: input.sourceType,
      status: "ready",
      storageKey: copy.storageKey,
      originalUrl: copy.originalUrl,
      thumbnailUrl: input.mediaType === "image" ? copy.url : null,
      mimeType: copy.mimeType,
      fileSize: copy.fileSize || null,
      checksumSha256: copy.checksumSha256,
    })
    .returning({ id: mediaAssets.id });
  if (!inserted[0]) throw new Error("Durable media asset insert failed");
  return { assetId: inserted[0].id, copy };
}

export async function durabilizeMediaGenerationResponse(
  response: MediaGenerationResponse,
  input: Omit<DurableMediaCopyInput, "sourceUrl" | "sourcePath" | "originalUrl" | "mimeType"> & {
    sourceType?: DurableMediaSourceType;
  },
): Promise<MediaGenerationResponse> {
  const data: MediaGenerationResult[] = [];
  for (const result of response.data ?? []) {
    if (!result.url) {
      data.push(result);
      continue;
    }
    const durable = await ensureExternalMediaAssetDurable({
      ...input,
      sourceType: input.sourceType ?? "media_sync_generated",
      sourceUrl: result.url,
      originalUrl: result.url,
      identity: result.id,
    });
    data.push({
      ...result,
      url: durable.copy.url,
      data: {
        ...(result.data ?? {}),
        providerOriginalUrl: result.url,
        mediaAssetId: durable.assetId,
        storageKey: durable.copy.storageKey,
      },
    });
  }
  return { ...response, data };
}
