import type { MediaLibraryAsset } from "../types/videoEditor";
import {
  getLibraryProductContextId,
  getLibraryRunContextId,
} from "./libraryUi";

type LibraryItemRecord = Record<string, unknown>;

function asRecord(value: unknown): LibraryItemRecord | null {
  return value && typeof value === "object" ? (value as LibraryItemRecord) : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  }
  return null;
}

function parseItemId(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number.parseInt(value.trim(), 10)
        : null;
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function extensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    const match = url.split("?")[0]?.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() ?? null;
  }
}

function parseCreatedAt(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(0);
}

export function parseVideoEditorLibraryItemId(search: string): number | null {
  const queryStart = search.indexOf("?");
  const query = queryStart >= 0 ? search.slice(queryStart) : search;
  const params = new URLSearchParams(query);
  const rawItemId = params.get("libraryItemId")?.trim() ?? "";
  if (!/^\d+$/.test(rawItemId)) return null;
  const itemId = Number.parseInt(rawItemId, 10);
  return Number.isFinite(itemId) && itemId > 0 ? itemId : null;
}

export function buildVideoEditorLibraryAssetFromItem(
  item: unknown
): MediaLibraryAsset | null {
  const record = asRecord(item);
  if (!record) return null;

  const metadata = asRecord(record.metadata) ?? asRecord(record.metadataJson) ?? {};
  const itemType = firstString(record.itemType, record.item_type, metadata.itemType, metadata.item_type)
    ?.toLowerCase();
  if (itemType !== "video") return null;

  const sourceUrl = firstString(
    record.sourceUrl,
    record.source_url,
    record.url,
    metadata.sourceUrl,
    metadata.source_url,
    metadata.url
  );
  const itemId =
    parseItemId(record.id) ??
    parseItemId(record.item_id) ??
    parseItemId(metadata.libraryItemId);
  if (!itemId || !sourceUrl) return null;

  const title =
    firstString(record.title, metadata.title, record.name, metadata.name) ??
    `Library item ${itemId}`;
  const durationSeconds =
    firstNumber(
      metadata.durationSeconds,
      metadata.duration_seconds,
      metadata.duration,
      record.durationSeconds,
      record.duration_seconds,
      record.duration
    ) ??
    (() => {
      const durationMs = firstNumber(
        metadata.durationMs,
        metadata.duration_ms,
        record.durationMs,
        record.duration_ms
      );
      return durationMs !== null ? durationMs / 1000 : 0;
    })();
  const format =
    firstString(metadata.format, record.format, extensionFromUrl(sourceUrl)) ?? "mp4";

  return {
    id: `library-${itemId}`,
    type: "video",
    title,
    thumbnailUrl:
      firstString(
        record.thumbnailUrl,
        record.thumbnail_url,
        metadata.thumbnailUrl,
        metadata.thumbnail_url
      ) ?? "",
    duration: durationSeconds,
    url: sourceUrl,
    model:
      firstString(record.model, metadata.model, record.source, metadata.source) ??
      "HyperFrames",
    createdAt: parseCreatedAt(record.createdAt ?? record.created_at ?? metadata.createdAt),
    resolution: firstString(record.resolution, metadata.resolution) ?? undefined,
    format,
    generationExtraParams: {
      source: firstString(record.source, metadata.source) ?? "library",
      libraryItemId: itemId,
      productId: getLibraryProductContextId(metadata) ?? null,
      runId: getLibraryRunContextId(metadata) ?? null,
      renderJobId: firstString(metadata.renderJobId, metadata.hyperframesRenderJobId),
    },
  };
}
