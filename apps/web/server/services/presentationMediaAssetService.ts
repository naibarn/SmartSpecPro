import crypto from "node:crypto";
import type { MediaTask } from "./mediaGenerationService";
import {
  downloadMediaToTempFile,
  type VerticalDramaMediaType,
} from "./verticalDramaMediaAssetService";
import { assertR2StorageActive, storagePutFromPath } from "../storage";

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
    const durableUrl = `/api/storage/files/${encodeURI(existingKey)}`;
    return {
      task: {
        ...input.task,
        resultData: {
          ...(input.task.resultData ?? {}),
          presentationDurabilityStatus: "ready",
          presentationStorageKey: existingKey,
        },
      },
      resultUrl: durableUrl,
      durableUrl,
      storageKey: existingKey,
    };
  }

  await assertR2StorageActive();
  const downloaded = await downloadMediaToTempFile(
    sourceUrl,
    input.mediaType as VerticalDramaMediaType,
    input.mediaType === "image" ? "image/png" : "video/mp4",
  );
  try {
    const identity = input.task.id || sourceUrl;
    const contentHash = crypto
      .createHash("sha256")
      .update(`${input.tenantId}:${input.userId}:${input.deckId}:${input.mediaType}:${identity}`)
      .digest("hex");
    const storageKey = [
      "presentation",
      safePart(input.tenantId),
      `deck-${safePart(input.deckId)}`,
      input.mediaType,
      safePart(input.slotId || "media"),
      `${safePart(identity)}-${contentHash}${extensionFor(input.mediaType, downloaded.mimeType)}`,
    ].join("/");
    const stored = await storagePutFromPath(storageKey, downloaded.tempPath, downloaded.mimeType);
    const durableUrl = `/api/storage/files/${encodeURI(stored.key)}`;
    const resultData = {
      ...(input.task.resultData ?? {}),
      presentationDurabilityStatus: "ready",
      presentationStorageKey: stored.key,
      presentationSourceUrl: sourceUrl,
    };
    return {
      task: {
        ...input.task,
        resultUrl: durableUrl,
        resultData,
      },
      durableUrl,
      storageKey: stored.key,
    };
  } finally {
    const fs = await import("node:fs/promises");
    await fs.rm(downloaded.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
