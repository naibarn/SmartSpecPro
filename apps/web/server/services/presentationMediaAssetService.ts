import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { MediaTask } from "./mediaGenerationService";
import {
  downloadMediaToTempFile,
  type VerticalDramaMediaType,
} from "./verticalDramaMediaAssetService";
import { getDb } from "../db";
import { mediaAssets } from "../../drizzle/schema";
import { assertR2StorageActive, storageExists, storagePutFromPath } from "../storage";

export type PresentationMediaType = "image" | "video";

export type DurablePresentationMedia = {
  task: MediaTask;
  durableUrl: string;
  storageKey: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function managedStorageKey(value: string): string | null {
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

function safePart(value: string | number | undefined): string {
  return String(value ?? "unknown").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
}

function extensionFor(mediaType: PresentationMediaType, mimeType: string): string {
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

function extensionForSource(
  mediaType: PresentationMediaType,
  sourceUrl: string,
  fallbackMimeType: string,
): string {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const extension = pathname.match(/\.(avif|bmp|gif|jpe?g|mov|mp4|png|tiff?|webm|webp)$/)?.[0];
    if (extension) return extension === ".jpeg" ? ".jpg" : extension;
  } catch {
    // Fall back to the media type when the provider URL is not parseable.
  }
  return extensionFor(mediaType, fallbackMimeType);
}

async function registerPresentationMediaAsset(input: {
  tenantId: string;
  userId: number;
  deckId: number;
  storageKey: string;
  durableUrl: string;
  mimeType: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(
      eq(mediaAssets.tenantId, input.tenantId),
      eq(mediaAssets.userId, input.userId),
      eq(mediaAssets.storageKey, input.storageKey),
    ))
    .limit(1);

  if (existing) {
    await db
      .update(mediaAssets)
      .set({
        sourceType: "presentation_generated",
        projectId: `presentation:${input.deckId}`,
        status: "ready",
        originalUrl: input.durableUrl,
        mimeType: input.mimeType,
        updatedAt: new Date(),
      })
      .where(and(
        eq(mediaAssets.id, existing.id),
        eq(mediaAssets.tenantId, input.tenantId),
        eq(mediaAssets.userId, input.userId),
      ));
    return existing.id;
  }

  const [inserted] = await db
    .insert(mediaAssets)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      projectId: `presentation:${input.deckId}`,
      sourceType: "presentation_generated",
      status: "ready",
      storageKey: input.storageKey,
      originalUrl: input.durableUrl,
      mimeType: input.mimeType,
    })
    .returning({ id: mediaAssets.id });
  if (!inserted) throw new Error("Failed to register Presentation media asset");
  return inserted.id;
}

function buildDurableTask(
  task: MediaTask,
  storageKey: string,
  durableUrl: string,
  mediaAssetId: number,
): MediaTask {
  return {
    ...task,
    resultUrl: durableUrl,
    // Do not return provider URLs from completed Presentation tasks. The
    // browser only needs the durable URL and the audit identifiers below.
    resultData: {
      presentationDurabilityStatus: "ready",
      presentationStorageKey: storageKey,
      presentationMediaAssetId: mediaAssetId,
    },
  };
}

export async function ensurePresentationTaskResultDurable(input: {
  tenantId: string;
  userId: number;
  deckId: number;
  task: MediaTask;
  mediaType: PresentationMediaType;
  slotId?: string;
}): Promise<DurablePresentationMedia | null> {
  if (input.task.status !== "completed") return null;
  const sourceUrl = input.task.resultUrl?.trim();
  if (!isNonEmptyString(sourceUrl)) return null;

  const existingKey = managedStorageKey(sourceUrl);
  if (existingKey) {
    if (!(await storageExists(existingKey))) return null;
    const durableUrl = `/api/storage/files/${encodeURI(existingKey)}`;
    const mediaAssetId = await registerPresentationMediaAsset({
      tenantId: input.tenantId,
      userId: input.userId,
      deckId: input.deckId,
      storageKey: existingKey,
      durableUrl,
      mimeType: input.mediaType === "image" ? "image/png" : "video/mp4",
    });
    return {
      task: buildDurableTask(input.task, existingKey, durableUrl, mediaAssetId),
      durableUrl,
      storageKey: existingKey,
    };
  }

  await assertR2StorageActive();
  const identity = input.task.id || sourceUrl;
  const fallbackMimeType = input.mediaType === "image" ? "image/png" : "video/mp4";
  const contentHash = crypto
    .createHash("sha256")
    .update(`${input.tenantId}:${input.userId}:${input.deckId}:${input.mediaType}:${identity}`)
    .digest("hex");
  const storageKeyPrefix = [
    "presentation",
    safePart(input.tenantId),
    `deck-${safePart(input.deckId)}`,
    input.mediaType,
    safePart(input.slotId || "media"),
  ].join("/");
  const storageKey = `${storageKeyPrefix}/${safePart(identity)}-${contentHash}${extensionForSource(input.mediaType, sourceUrl, fallbackMimeType)}`;
  const durableUrl = `/api/storage/files/${encodeURI(storageKey)}`;

  // Polling can call this function repeatedly after the provider has already
  // expired its URL. Reuse the registered object before touching the provider.
  if (await storageExists(storageKey)) {
    const mediaAssetId = await registerPresentationMediaAsset({
      tenantId: input.tenantId,
      userId: input.userId,
      deckId: input.deckId,
      storageKey,
      durableUrl,
      mimeType: fallbackMimeType,
    });
    return {
      task: buildDurableTask(input.task, storageKey, durableUrl, mediaAssetId),
      durableUrl,
      storageKey,
    };
  }

  const downloaded = await downloadMediaToTempFile(
    sourceUrl,
    input.mediaType as VerticalDramaMediaType,
    fallbackMimeType,
  );
  try {
    const stored = await storagePutFromPath(storageKey, downloaded.tempPath, downloaded.mimeType);
    const storedUrl = `/api/storage/files/${encodeURI(stored.key)}`;
    const mediaAssetId = await registerPresentationMediaAsset({
      tenantId: input.tenantId,
      userId: input.userId,
      deckId: input.deckId,
      storageKey: stored.key,
      durableUrl: storedUrl,
      mimeType: downloaded.mimeType,
    });
    return {
      task: buildDurableTask(input.task, stored.key, storedUrl, mediaAssetId),
      durableUrl: storedUrl,
      storageKey: stored.key,
    };
  } finally {
    const fs = await import("node:fs/promises");
    await fs.rm(downloaded.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
