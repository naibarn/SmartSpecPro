import type { LibraryItemDto } from "./libraryService";

const MAX_TEMPLATE_ASSET_BYTES = 30 * 1024 * 1024;

const ALLOWED_TEMPLATE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
]);

const ALLOWED_TEMPLATE_MIME_PREFIXES = ["image/"];

export type TemplateAssetPolicyRejectReason =
  | "source_not_template_catalog"
  | "asset_not_ready"
  | "asset_deleted"
  | "mime_not_allowed"
  | "extension_not_allowed"
  | "byte_size_invalid"
  | "byte_size_exceeded";

export type TemplateAssetPolicyResult =
  | { ok: true; byteSize: number; mimeType: string | null; extension: string | null }
  | { ok: false; reason: TemplateAssetPolicyRejectReason; mimeType?: string | null; extension?: string | null };

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getExtension(item: LibraryItemDto): string | null {
  const metadataExtension = normalizeString(item.metadata.extension);
  if (metadataExtension) {
    return metadataExtension;
  }

  const title = normalizeString(item.title) ?? "";
  const ext = title.split(".").pop() ?? "";
  return ext.replace(/[^a-z0-9]/g, "");
}

function getMimeType(item: LibraryItemDto): string | null {
  return normalizeString(item.metadata.mimeType ?? item.metadata.fileType);
}

function getByteSize(item: LibraryItemDto): number {
  const raw = item.metadata.byteSize ?? item.metadata.size ?? 0;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return Number.NaN;
  }
  return Math.floor(value);
}

function isMimeAllowed(mimeType: string | null): boolean {
  if (!mimeType) {
    return false;
  }
  return ALLOWED_TEMPLATE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

export function validateTemplateAssetAgainstUploadPolicy(
  item: LibraryItemDto,
): TemplateAssetPolicyResult {
  if (item.source !== "internal_template_catalog") {
    return { ok: false, reason: "source_not_template_catalog" };
  }

  if (item.status !== "ready") {
    return { ok: false, reason: "asset_not_ready" };
  }

  if (item.deletedAt !== null) {
    return { ok: false, reason: "asset_deleted" };
  }

  const extension = getExtension(item);
  const mimeType = getMimeType(item);
  const byteSize = getByteSize(item);

  if (!isMimeAllowed(mimeType)) {
    return { ok: false, reason: "mime_not_allowed", extension, mimeType };
  }

  if (!extension || !ALLOWED_TEMPLATE_EXTENSIONS.has(extension)) {
    return { ok: false, reason: "extension_not_allowed", extension, mimeType };
  }

  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return { ok: false, reason: "byte_size_invalid", extension, mimeType };
  }

  if (byteSize > MAX_TEMPLATE_ASSET_BYTES) {
    return { ok: false, reason: "byte_size_exceeded", extension, mimeType };
  }

  return {
    ok: true,
    byteSize,
    mimeType,
    extension,
  };
}
