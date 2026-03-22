import crypto from "crypto";

import { ENV } from "../_core/env";
import { MAX_AUDIO_BYTES, transcribe } from "./sttService";

const PYTHON_BACKEND_URL = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
const INTERNAL_REQUEST_TIMEOUT_MS = 30_000;

const COMPLEX_DOCUMENT_EXTENSIONS = new Set(["pdf", "docx", "pptx", "xlsx", "doc", "ppt", "xls"]);
const AUDIO_TRANSCRIBE_EXTENSIONS = new Set(["wav", "mp3", "ogg", "m4a"]);

export type LibraryUploadPipelineStage =
  | "uploading"
  | "uploaded"
  | "parsing"
  | "parsed"
  | "indexing"
  | "ready"
  | "failed"
  | "quarantined";

export interface LibraryUploadPipelineState {
  stage: LibraryUploadPipelineStage;
  stageMessage?: string;
  parserJobId?: string | null;
  parserStatus?: string | null;
  indexJobId?: number | null;
  checksumSha256?: string;
  extractor?: string | null;
  searchQuality?: "full_text" | "metadata_only";
  parseError?: string | null;
  warnings?: string[];
  updatedAt: string;
}

export interface LibraryUploadEnrichmentResult {
  extractedText: string | null;
  extractor: string | null;
  warnings: string[];
  searchQuality: "full_text" | "metadata_only";
  stageMessage?: string;
  extraMetadata?: Record<string, unknown>;
}

type UploadAnalysisProfile =
  | "metadata_only"
  | "document_ocr"
  | "real_world_vision"
  | "video_transcript";

interface ExtractTextResponse {
  text?: string;
  char_count?: number;
  method?: string;
  warning?: string | null;
}

interface MediaEnrichmentResponse {
  text?: string;
  char_count?: number;
  method?: string;
  search_quality?: "full_text" | "metadata_only";
  caption?: string | null;
  transcript?: string | null;
  warning?: string | null;
  metadata?: Record<string, unknown>;
}

function resolveUploadAnalysisProfile(metadata: Record<string, unknown> | undefined): UploadAnalysisProfile {
  const raw = typeof metadata?.analysis_profile === "string"
    ? metadata.analysis_profile
    : typeof metadata?.upload_analysis_profile === "string"
      ? metadata.upload_analysis_profile
      : typeof metadata?.vision_mode === "string"
        ? metadata.vision_mode
        : "";

  switch (raw) {
    case "document_ocr":
    case "real_world_vision":
    case "video_transcript":
      return raw;
    default:
      return "metadata_only";
  }
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function getInternalProxyToken(): string {
  return (
    process.env.SMARTSPEC_PROXY_TOKEN
    || process.env.SMARTSPEC_WEB_GATEWAY_TOKEN
    || ENV.webGatewayToken
    || ""
  );
}

export function buildUploadPipelineState(
  stage: LibraryUploadPipelineStage,
  overrides: Partial<LibraryUploadPipelineState> = {},
): LibraryUploadPipelineState {
  return {
    stage,
    updatedAt: nowIsoString(),
    ...overrides,
  };
}

function looksLikeUtf8Svg(buffer: Buffer): boolean {
  const sample = buffer.slice(0, 1024).toString("utf8").toLowerCase();
  return sample.includes("<svg");
}

function sniffMimeFromBuffer(
  fileBuffer: Buffer,
  extension: string,
): string | null {
  if (fileBuffer.length >= 8 && fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (fileBuffer.length >= 3 && fileBuffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }
  if (fileBuffer.length >= 6) {
    const header = fileBuffer.subarray(0, 6).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") {
      return "image/gif";
    }
  }
  if (fileBuffer.length >= 12) {
    const riff = fileBuffer.subarray(0, 4).toString("ascii");
    const webp = fileBuffer.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && webp === "WEBP") {
      return "image/webp";
    }
    const wave = fileBuffer.subarray(8, 12).toString("ascii");
    if (riff === "RIFF" && wave === "WAVE") {
      return "audio/wav";
    }
  }
  if (fileBuffer.length >= 5 && fileBuffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (fileBuffer.length >= 4 && fileBuffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return "application/zip";
  }
  if (fileBuffer.length >= 12) {
    const boxType = fileBuffer.subarray(4, 8).toString("ascii");
    if (boxType === "ftyp") {
      return extension === "m4a" ? "audio/mp4" : "video/mp4";
    }
  }
  if (fileBuffer.length >= 3 && fileBuffer.subarray(0, 3).toString("ascii") === "ID3") {
    return "audio/mpeg";
  }
  if (looksLikeUtf8Svg(fileBuffer)) {
    return "image/svg+xml";
  }
  return null;
}

function areMimeTypesCompatible(claimedMime: string, sniffedMime: string | null, extension: string): boolean {
  if (!sniffedMime) return true;
  if (!claimedMime || claimedMime === "application/octet-stream") return true;
  if (claimedMime === sniffedMime) return true;
  if (
    extension === "zip"
    && (
      (claimedMime === "application/zip" && sniffedMime === "application/x-zip-compressed")
      || (claimedMime === "application/x-zip-compressed" && sniffedMime === "application/zip")
    )
  ) {
    return true;
  }
  if (claimedMime.startsWith("text/") && sniffedMime === "image/svg+xml" && extension === "svg") return true;
  if (claimedMime === "audio/mp4" && sniffedMime === "video/mp4") return true;
  if (claimedMime === "video/mp4" && sniffedMime === "audio/mp4") return true;
  if (
    claimedMime === "application/msword"
    && extension === "doc"
    && sniffedMime === null
  ) {
    return true;
  }
  if (
    claimedMime === "application/vnd.ms-powerpoint"
    && extension === "ppt"
    && sniffedMime === null
  ) {
    return true;
  }
  if (
    claimedMime === "application/vnd.ms-excel"
    && extension === "xls"
    && sniffedMime === null
  ) {
    return true;
  }
  return false;
}

export function validateLibraryUploadSignature(
  fileBuffer: Buffer,
  fileType: string,
  extension: string,
): { sniffedMime: string | null } {
  const sniffedMime = sniffMimeFromBuffer(fileBuffer, extension);
  if (!areMimeTypesCompatible(fileType.toLowerCase(), sniffedMime, extension)) {
    throw new Error("Uploaded file contents do not match the declared file type");
  }
  return { sniffedMime };
}

export function computeLibraryUploadChecksum(fileBuffer: Buffer): string {
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

async function postInternalJson<TResponse>(
  path: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const internalProxyToken = getInternalProxyToken();
  if (!internalProxyToken) {
    throw new Error("SMARTSPEC proxy token is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNAL_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-token": internalProxyToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Internal extraction failed (${response.status}): ${detail}`);
    }

    return await response.json() as TResponse;
  } finally {
    clearTimeout(timer);
  }
}

async function extractComplexDocumentText(params: {
  fileBuffer: Buffer;
  fileName: string;
  fileType: string;
}): Promise<LibraryUploadEnrichmentResult> {
  const payload = await postInternalJson<ExtractTextResponse>(
    "/api/internal/library/extract-text",
    {
      file_name: params.fileName,
      mime_type: params.fileType,
      content_base64: params.fileBuffer.toString("base64"),
    },
  );

  const extractedText = typeof payload.text === "string" && payload.text.trim()
    ? payload.text.trim()
    : null;
  const warnings = payload.warning ? [payload.warning] : [];

  return {
    extractedText,
    extractor: payload.method ?? null,
    warnings,
    searchQuality: extractedText ? "full_text" : "metadata_only",
    stageMessage: extractedText
      ? "Document text extracted and queued for semantic indexing."
      : "File uploaded, but only metadata is currently searchable for this format.",
    extraMetadata: {},
  };
}

async function transcribeAudioUpload(params: {
  fileBuffer: Buffer;
  fileType: string;
  extension: string;
}): Promise<LibraryUploadEnrichmentResult> {
  if (params.fileBuffer.byteLength > MAX_AUDIO_BYTES) {
    return {
      extractedText: null,
      extractor: "audio_too_large",
      warnings: ["Audio file is too large for inline transcription during upload."],
      searchQuality: "metadata_only",
      stageMessage: "Audio uploaded. Semantic search will improve after transcript enrichment is available.",
    };
  }

  const format = params.extension === "wav"
    ? "wav"
    : params.extension === "mp3" || params.extension === "m4a" || params.extension === "ogg"
      ? "mp3"
      : "mp3";

  try {
    const transcript = await transcribe(params.fileBuffer, { format });
    const text = transcript.text.trim();
    return {
      extractedText: text || null,
      extractor: "stt",
      warnings: [],
      searchQuality: text ? "full_text" : "metadata_only",
      stageMessage: text
        ? "Audio transcript extracted and queued for semantic indexing."
        : "Audio uploaded. Transcript was empty, so search currently falls back to metadata.",
      extraMetadata: text ? { transcript: text } : {},
    };
  } catch (error) {
    return {
      extractedText: null,
      extractor: "stt_error",
      warnings: [error instanceof Error ? error.message : "Audio transcription failed."],
      searchQuality: "metadata_only",
      stageMessage: "Audio uploaded. Transcript enrichment is currently unavailable, so search will use metadata only.",
      extraMetadata: {},
    };
  }
}

async function enrichMediaUpload(params: {
  fileBuffer: Buffer;
  fileName: string;
  fileType: string;
  analysisProfile: UploadAnalysisProfile;
  enableVision: boolean;
  enableTranscript: boolean;
}): Promise<LibraryUploadEnrichmentResult> {
  try {
    const payload = await postInternalJson<MediaEnrichmentResponse>(
      "/api/internal/library/enrich-media",
      {
        file_name: params.fileName,
        mime_type: params.fileType,
        content_base64: params.fileBuffer.toString("base64"),
        analysis_profile: params.analysisProfile,
        enable_vision: params.enableVision,
        enable_transcript: params.enableTranscript,
      },
    );

    const extractedParts = [
      typeof payload.text === "string" ? payload.text.trim() : "",
      typeof payload.caption === "string" ? payload.caption.trim() : "",
      typeof payload.transcript === "string" ? payload.transcript.trim() : "",
    ].filter(Boolean);
    const dedupedText = Array.from(new Set(extractedParts)).join("\n\n").trim();

    return {
      extractedText: dedupedText || null,
      extractor: payload.method ?? "media_enrichment",
      warnings: payload.warning ? [payload.warning] : [],
      searchQuality: payload.search_quality === "full_text" && dedupedText ? "full_text" : "metadata_only",
      stageMessage: dedupedText
        ? "Media enrichment completed and searchable content is ready for indexing."
        : "Media uploaded. Search currently falls back to metadata because enrichment did not return searchable text.",
      extraMetadata: payload.metadata ?? {},
    };
  } catch (error) {
    return {
      extractedText: null,
      extractor: "media_enrichment_error",
      warnings: [error instanceof Error ? error.message : "Media enrichment failed."],
      searchQuality: "metadata_only",
      stageMessage: "Media uploaded. Enrichment is currently unavailable, so search will use metadata only.",
      extraMetadata: {},
    };
  }
}

export async function enrichLibraryUploadContent(params: {
  fileBuffer: Buffer;
  fileName: string;
  fileType: string;
  extension: string;
  fallbackText: string | null;
  metadata?: Record<string, unknown>;
}): Promise<LibraryUploadEnrichmentResult> {
  const analysisProfile = resolveUploadAnalysisProfile(params.metadata);

  if (params.fallbackText) {
    return {
      extractedText: params.fallbackText,
      extractor: "inline_text",
      warnings: [],
      searchQuality: "full_text",
      stageMessage: "Text extracted and queued for semantic indexing.",
      extraMetadata: {},
    };
  }

  if (COMPLEX_DOCUMENT_EXTENSIONS.has(params.extension)) {
    try {
      return await extractComplexDocumentText(params);
    } catch (error) {
      return {
        extractedText: null,
        extractor: "extract_error",
        warnings: [error instanceof Error ? error.message : "Document text extraction failed."],
        searchQuality: "metadata_only",
        stageMessage: "File uploaded. Full-text extraction failed, so search currently falls back to metadata.",
      };
    }
  }

  if (params.fileType.startsWith("audio/") && AUDIO_TRANSCRIBE_EXTENSIONS.has(params.extension)) {
    return transcribeAudioUpload(params);
  }

  if (params.fileType.startsWith("video/")) {
    return enrichMediaUpload({
      fileBuffer: params.fileBuffer,
      fileName: params.fileName,
      fileType: params.fileType,
      analysisProfile: analysisProfile === "video_transcript" ? "video_transcript" : "metadata_only",
      enableVision: false,
      enableTranscript: true,
    });
  }

  if (params.fileType.startsWith("image/")) {
    if (analysisProfile === "document_ocr" || analysisProfile === "real_world_vision") {
      return enrichMediaUpload({
        fileBuffer: params.fileBuffer,
        fileName: params.fileName,
        fileType: params.fileType,
        analysisProfile,
        enableVision: true,
        enableTranscript: false,
      });
    }

    return {
      extractedText: null,
      extractor: "image_metadata_only",
      warnings: [],
      searchQuality: "metadata_only",
      stageMessage: "Image uploaded. Search will use metadata unless OCR/Vision is explicitly requested for a real-world photo or scanned document.",
      extraMetadata: {
        analysis_profile: "metadata_only",
      },
    };
  }

  return {
    extractedText: null,
    extractor: null,
    warnings: [],
    searchQuality: "metadata_only",
    stageMessage: "File uploaded. Search will use metadata for this file type.",
    extraMetadata: {},
  };
}
