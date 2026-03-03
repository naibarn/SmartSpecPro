export type WatermarkFormat = "png" | "jpg";

export interface LibraryWatermarkOption {
  id: number;
  label: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  format: WatermarkFormat;
}

interface LibraryImageRowLike {
  id?: number;
  title?: string | null;
  source_url?: string | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

function normalizeExt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function extensionFromUrl(url: string): string | null {
  const withoutQuery = url.split(/[?#]/, 1)[0] ?? "";
  const ext = withoutQuery.slice(withoutQuery.lastIndexOf(".") + 1).trim().toLowerCase();
  return ext.length > 0 ? ext : null;
}

function extensionFromTitle(title: string): string | null {
  const ext = title.slice(title.lastIndexOf(".") + 1).trim().toLowerCase();
  return ext.length > 0 ? ext : null;
}

function inferFormatFromMetadata(metadata?: Record<string, unknown> | null): WatermarkFormat | null {
  if (!metadata || Array.isArray(metadata)) {
    return null;
  }
  const extension = normalizeExt(metadata.extension);
  if (extension === "png") {
    return "png";
  }
  if (extension === "jpg" || extension === "jpeg") {
    return "jpg";
  }

  const mimeType = normalizeExt(metadata.mimeType ?? metadata.fileType);
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/jpg" || mimeType === "image/jpeg") {
    return "jpg";
  }
  return null;
}

export function inferWatermarkFormatFromLibraryImage(row: {
  sourceUrl: string;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
}): WatermarkFormat | null {
  const metadataFormat = inferFormatFromMetadata(row.metadata);
  if (metadataFormat) {
    return metadataFormat;
  }

  const sourceExt = extensionFromUrl(row.sourceUrl);
  if (sourceExt === "png") {
    return "png";
  }
  if (sourceExt === "jpg" || sourceExt === "jpeg") {
    return "jpg";
  }

  const titleExt = extensionFromTitle(String(row.title ?? ""));
  if (titleExt === "png") {
    return "png";
  }
  if (titleExt === "jpg" || titleExt === "jpeg") {
    return "jpg";
  }

  return null;
}

export function normalizeWatermarkLibraryOptions(rows: unknown): LibraryWatermarkOption[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  const options: LibraryWatermarkOption[] = [];
  const seen = new Set<string>();

  for (const raw of rows) {
    const row = raw as LibraryImageRowLike;
    if (typeof row.id !== "number" || !Number.isFinite(row.id)) {
      continue;
    }
    const sourceUrl = String(row.source_url ?? "").trim();
    if (!sourceUrl) {
      continue;
    }
    if (seen.has(sourceUrl)) {
      continue;
    }
    const format = inferWatermarkFormatFromLibraryImage({
      sourceUrl,
      title: row.title,
      metadata: row.metadata,
    });
    if (!format) {
      continue;
    }
    seen.add(sourceUrl);
    const title = String(row.title ?? `Watermark #${row.id}`).trim() || `Watermark #${row.id}`;
    const thumbnailUrl = String(row.thumbnail_url ?? row.preview_url ?? "").trim() || null;
    options.push({
      id: row.id,
      label: title,
      sourceUrl,
      thumbnailUrl,
      format,
    });
  }

  return options;
}
