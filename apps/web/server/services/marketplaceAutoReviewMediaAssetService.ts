import crypto from "crypto";
import fs from "fs/promises";
import type { MediaTask } from "./mediaGenerationService";
import {
  downloadMediaToTempFile,
  type VerticalDramaMediaType,
} from "./verticalDramaMediaAssetService";
import { assertR2StorageActive, storagePutFromPath } from "../storage";

export type MarketplaceAutoReviewTaskDurability = {
  task: MediaTask;
  durableUrl: string;
  storageKey: string;
};

export type MarketplaceAutoReviewMediaUrlDurability = {
  durableUrl: string;
  storageKey: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

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

function safeTaskPart(value: string | undefined): string {
  return (value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
}

function extensionFor(
  mediaType: VerticalDramaMediaType,
  mimeType: string
): string {
  const known: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
  };
  return known[mimeType] ?? (mediaType === "image" ? ".png" : ".mp4");
}

function taskScope(task: MediaTask): {
  runId: string;
  mediaType: VerticalDramaMediaType;
  purpose: string;
} | null {
  const extra = readExtraParams(task);
  const runId = extra.__auto_review_run_id;
  if (!isNonEmptyString(runId)) return null;
  const mediaType =
    task.mediaType === "video"
      ? "video"
      : task.mediaType === "image"
        ? "image"
        : null;
  if (!mediaType) return null;
  return {
    runId: runId.trim(),
    mediaType,
    purpose: isNonEmptyString(extra.__unit_id)
      ? extra.__unit_id.trim()
      : mediaType,
  };
}

/**
 * Provider results for Marketplace Auto Review are copied to R2 before any
 * domain pipeline treats them as completed. The returned task is a safe
 * in-memory projection; callers persist its durable URL in their own JSON
 * checkpoint shape.
 */
export async function ensureMarketplaceAutoReviewTaskResultDurable(input: {
  tenantId?: string | null;
  userId: number;
  task: MediaTask;
}): Promise<MarketplaceAutoReviewTaskDurability | null> {
  const scope = taskScope(input.task);
  const sourceUrl = input.task.resultUrl?.trim();
  if (!scope || input.task.status !== "completed" || !sourceUrl) return null;

  const existingKey = managedStorageKey(sourceUrl);
  if (existingKey) {
    return {
      task: {
        ...input.task,
        resultData: {
          ...(input.task.resultData ?? {}),
          marketplaceAutoReviewDurabilityStatus: "ready",
          marketplaceAutoReviewStorageKey: existingKey,
        },
      },
      durableUrl: sourceUrl,
      storageKey: existingKey,
    };
  }

  const resultData =
    input.task.resultData && typeof input.task.resultData === "object"
      ? (input.task.resultData as Record<string, unknown>)
      : {};
  const previouslyDurable = resultData.marketplaceAutoReviewDurableUrl;
  const previousKey = resultData.marketplaceAutoReviewStorageKey;
  if (isNonEmptyString(previouslyDurable) && isNonEmptyString(previousKey)) {
    return {
      task: {
        ...input.task,
        resultUrl: previouslyDurable,
        resultData: {
          ...resultData,
          marketplaceAutoReviewDurabilityStatus: "ready",
        },
      },
      durableUrl: previouslyDurable,
      storageKey: previousKey,
    };
  }

  const durable = await ensureMarketplaceAutoReviewMediaUrlDurable({
    tenantId: input.tenantId,
    runId: scope.runId,
    sourceUrl,
    mediaType: scope.mediaType,
    purpose: scope.purpose,
    identity: input.task.id,
  });
  return {
    task: {
      ...input.task,
      resultUrl: durable.durableUrl,
      resultData: {
        ...resultData,
        marketplaceAutoReviewDurabilityStatus: "ready",
        marketplaceAutoReviewDurableUrl: durable.durableUrl,
        marketplaceAutoReviewStorageKey: durable.storageKey,
        marketplaceAutoReviewSourceUrl: sourceUrl,
      },
    },
    durableUrl: durable.durableUrl,
    storageKey: durable.storageKey,
  };
}

export async function ensureMarketplaceAutoReviewMediaUrlDurable(input: {
  tenantId?: string | null;
  runId: string;
  sourceUrl: string;
  mediaType: VerticalDramaMediaType;
  purpose?: string;
  identity?: string;
}): Promise<MarketplaceAutoReviewMediaUrlDurability> {
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) throw new Error("Marketplace Auto Review media URL is empty");
  const existingKey = managedStorageKey(sourceUrl);
  if (existingKey) {
    return { durableUrl: sourceUrl, storageKey: existingKey };
  }

  await assertR2StorageActive();
  const downloaded = await downloadMediaToTempFile(
    sourceUrl,
    input.mediaType,
    input.mediaType === "image" ? "image/png" : "video/mp4"
  );
  try {
    const contentHash = crypto
      .createHash("sha256")
      .update(
        `${input.runId}:${input.mediaType}:${input.identity || sourceUrl}:${sourceUrl}`
      )
      .digest("hex");
    const tenantPart = safeTaskPart(input.tenantId || "personal");
    const key = [
      "marketplace-auto-review",
      tenantPart,
      safeTaskPart(input.runId),
      "media",
      input.mediaType,
      `${safeTaskPart(input.purpose || input.mediaType)}-${contentHash}${extensionFor(
        input.mediaType,
        downloaded.mimeType
      )}`,
    ].join("/");
    const stored = await storagePutFromPath(
      key,
      downloaded.tempPath,
      downloaded.mimeType
    );
    const durableUrl =
      stored.url || `/api/storage/files/${encodeURI(stored.key)}`;
    return { durableUrl, storageKey: stored.key };
  } finally {
    await fs
      .rm(downloaded.tempDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
}
