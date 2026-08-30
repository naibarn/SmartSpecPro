/**
 * Shared editor upload helper.
 * Uploads through the library pipeline so every inserted asset is indexed for RAG.
 */
import { uploadLibraryFileDirect } from "@/services/libraryUploadClient";

export type EditorUploadType = "image" | "video" | "audio" | "file";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ACCEPTED_TYPES: Record<EditorUploadType, string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"],
  file: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.rar",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/xml",
    "text/html",
  ],
};

const ACCEPTED_EXTENSIONS: Record<EditorUploadType, string[]> = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "svg"],
  video: ["mp4", "webm", "mov", "avi", "mkv"],
  audio: ["mp3", "wav", "ogg", "m4a", "aac"],
  file: [
    "pdf",
    "doc",
    "docx",
    "ppt",
    "pptx",
    "xls",
    "xlsx",
    "zip",
    "rar",
    "7z",
    "txt",
    "md",
    "markdown",
    "csv",
    "json",
    "xml",
    "html",
    "htm",
  ],
};

const MIME_HINTS_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export interface UploadMediaResult {
  fileName: string;
  fileType: string;
  fileBase64: string;
}

export interface EditorAssetUploadResult {
  url: string;
  assetId: string;
  title: string;
  itemType: string;
  mimeType: string;
  thumbnailUrl: string | null;
  sourceUrl: string;
  metadata: Record<string, unknown>;
}

function getFileExtension(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

function getMimeTypeForFile(file: File): string {
  const ext = getFileExtension(file);
  if (file.type) return file.type;
  return MIME_HINTS_BY_EXTENSION[ext] || "application/octet-stream";
}

export function resolveEditorFileMimeType(file: File): string {
  return getMimeTypeForFile(file);
}

function isAcceptedFileType(file: File, uploadType: EditorUploadType): boolean {
  const mimeType = getMimeTypeForFile(file).toLowerCase();
  const ext = getFileExtension(file);
  return ACCEPTED_TYPES[uploadType].includes(mimeType)
    || ACCEPTED_EXTENSIONS[uploadType].includes(ext);
}

export function validateMediaFile(
  file: File,
  mediaType: "image" | "video" | "audio",
): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return "File is too large (max 50MB).";
  }
  if (!isAcceptedFileType(file, mediaType)) {
    return "Invalid file type.";
  }
  return null;
}

export function validateAttachmentFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return "File is too large (max 50MB).";
  }

  const mimeType = getMimeTypeForFile(file).toLowerCase();
  const ext = getFileExtension(file);

  if (
    mimeType.startsWith("image/")
    || mimeType.startsWith("video/")
    || mimeType.startsWith("audio/")
  ) {
    return "Use the media insert flow for images, videos, or audio files.";
  }

  if (!isAcceptedFileType(file, "file")) {
    return "Invalid file type.";
  }

  return null;
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:<mime>;base64, prefix — server expects raw base64
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function getAcceptString(mediaType: EditorUploadType): string {
  const mimeTypes = ACCEPTED_TYPES[mediaType] || [];
  const extensions = ACCEPTED_EXTENSIONS[mediaType] || [];
  return [
    ...mimeTypes,
    ...extensions.map((ext) => `.${ext}`),
  ].join(",");
}

/**
 * Determine the editor asset type for a given File.
 * Returns null if the file is not a supported upload for the editor.
 */
export function classifyMediaType(
  mimeType: string,
): "image" | "video" | "audio" | null {
  // SVG can contain embedded scripts — reject for paste/drop uploads
  if (mimeType === "image/svg+xml") return null;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

/**
 * Upload a file to the library pipeline and return the inserted asset metadata.
 * This keeps editor uploads indexed in RAG.
 */
export async function uploadMedia(
  file: File,
  options?: {
    title?: string;
    visibility?: "private" | "team" | "public";
    metadata?: Record<string, unknown>;
  },
): Promise<EditorAssetUploadResult> {
  const fileType = getMimeTypeForFile(file);
  const result = await uploadLibraryFileDirect(file, {
    title: options?.title ?? file.name.replace(/\.[^.]+$/, ""),
    visibility: options?.visibility ?? "private",
    metadata: options?.metadata,
  });

  const item = result?.item ?? {};
  const sourceUrl = String(item.sourceUrl ?? item.source_url ?? result?.sourceUrl ?? result?.source_url ?? "");
  if (!sourceUrl) {
    throw new Error("Upload response missing source URL");
  }

  return {
    url: sourceUrl,
    sourceUrl,
    assetId: String(item.id ?? result?.id ?? ""),
    title: String(item.title ?? options?.title ?? file.name),
    itemType: String(item.itemType ?? item.item_type ?? "file"),
    mimeType: String(item.metadata?.file_type ?? fileType),
    thumbnailUrl: (item.thumbnailUrl ?? item.thumbnail_url ?? null) as string | null,
    metadata: (item.metadata ?? {}) as Record<string, unknown>,
  };
}
