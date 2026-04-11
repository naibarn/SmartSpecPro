import crypto from "crypto";

import { debugLog } from "../_core/logger";
import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";
import { getTraceId } from "./traceContext";
import { MAX_AUDIO_BYTES, transcribe } from "./sttService";
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
  metadata?: Record<string, unknown>;
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

function resolveCaptureIntent(
  metadata: Record<string, unknown> | undefined,
): "receipt" | "transfer_slip" | "statement" | null {
  const candidates = [
    metadata?.capture_intent,
    metadata?.finance_capture_intent,
    metadata?.document_role,
  ];

  for (const candidate of candidates) {
    if (candidate === "receipt" || candidate === "transfer_slip" || candidate === "statement") {
      return candidate;
    }
  }

  return null;
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function resolveFinanceOcrTraceId(explicitTraceId?: string | null): string {
  const candidate = String(explicitTraceId ?? getTraceId() ?? "").trim();
  if (candidate) {
    return candidate.replace(/[^A-Za-z0-9._:-]+/g, "").slice(0, 128) || crypto.randomUUID();
  }
  return crypto.randomUUID();
}

function fingerprintToken(token: string | null | undefined): string | null {
  const value = String(token ?? "").trim();
  if (!value) {
    return null;
  }
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function getInternalProxyToken(): Promise<string> {
  const runtime = await getAppRuntimeConfig();
  return runtime.proxyToken || runtime.webGatewayToken || "";
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
  traceId?: string | null,
): Promise<TResponse> {
  const [internalProxyToken, runtime] = await Promise.all([
    getInternalProxyToken(),
    getAppRuntimeConfig(),
  ]);
  if (!internalProxyToken) {
    throw new Error("SMARTSPEC proxy token is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNAL_REQUEST_TIMEOUT_MS);
  const resolvedTraceId = resolveFinanceOcrTraceId(traceId);
  const tokenSource = runtime.proxyToken
    ? "SMARTSPEC_PROXY_TOKEN"
    : runtime.webGatewayToken
      ? "SMARTSPEC_WEB_GATEWAY_TOKEN"
      : "none";
  debugLog("finance_ocr", "internal auth token selected", {
    traceId: resolvedTraceId,
    tokenSource,
    tokenFingerprint: fingerprintToken(internalProxyToken),
    runtimeProxyTokenFingerprint: fingerprintToken(runtime.proxyToken),
    runtimeGatewayTokenFingerprint: fingerprintToken(runtime.webGatewayToken),
  });
  try {
    const response = await fetch(`${runtime.pythonBackendUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-proxy-token": internalProxyToken,
        "x-trace-id": resolvedTraceId,
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
  analysisProfile: UploadAnalysisProfile;
  captureIntent: "receipt" | "transfer_slip" | "statement" | null;
  externalProcessingAllowed: boolean;
  sourceUrl?: string | null;
  traceId?: string | null;
}): Promise<LibraryUploadEnrichmentResult> {
  const traceId = resolveFinanceOcrTraceId(params.traceId);
  debugLog("finance_ocr", "extract-text start", {
    traceId,
    fileName: params.fileName,
    fileType: params.fileType,
    analysisProfile: params.analysisProfile,
    captureIntent: params.captureIntent,
    contentBytes: params.fileBuffer.byteLength,
  });
  const payload = await postInternalJson<ExtractTextResponse>(
    "/api/internal/library/extract-text",
    {
      file_name: params.fileName,
      mime_type: params.fileType,
      content_base64: params.fileBuffer.toString("base64"),
      ...(params.sourceUrl ? { source_url: params.sourceUrl } : {}),
      analysis_profile: params.analysisProfile,
      ...(params.captureIntent ? { capture_intent: params.captureIntent } : {}),
    },
    traceId,
  );

  const extractedText = typeof payload.text === "string" && payload.text.trim()
    ? payload.text.trim()
    : null;
  const warnings = payload.warning ? [payload.warning] : [];
  const result: LibraryUploadEnrichmentResult = {
    extractedText,
    extractor: payload.method ?? null,
    warnings,
    searchQuality: extractedText ? "full_text" : "metadata_only",
    stageMessage: extractedText
      ? "Document text extracted and queued for semantic indexing."
      : "File uploaded, but only metadata is currently searchable for this format.",
    extraMetadata: payload.metadata ?? {},
  };
  debugLog("finance_ocr", "extract-text result", {
    traceId,
    fileName: params.fileName,
    method: payload.method ?? null,
    charCount: payload.char_count ?? 0,
    hasText: Boolean(extractedText),
    warning: payload.warning ?? null,
  });

  return result;
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
  captureIntent: "receipt" | "transfer_slip" | "statement" | null;
  enableVision: boolean;
  enableTranscript: boolean;
  externalProcessingAllowed: boolean;
  sourceUrl?: string | null;
  traceId?: string | null;
}): Promise<LibraryUploadEnrichmentResult> {
  const traceId = resolveFinanceOcrTraceId(params.traceId);
  debugLog("finance_ocr", "enrich-media start", {
    traceId,
    fileName: params.fileName,
    fileType: params.fileType,
    analysisProfile: params.analysisProfile,
    captureIntent: params.captureIntent,
    enableVision: params.enableVision,
    enableTranscript: params.enableTranscript,
    contentBytes: params.fileBuffer.byteLength,
  });
  try {
    const payload = await postInternalJson<MediaEnrichmentResponse>(
      "/api/internal/library/enrich-media",
      {
        file_name: params.fileName,
        mime_type: params.fileType,
        content_base64: params.fileBuffer.toString("base64"),
        ...(params.sourceUrl ? { source_url: params.sourceUrl } : {}),
        analysis_profile: params.analysisProfile,
        ...(params.captureIntent ? { capture_intent: params.captureIntent } : {}),
        enable_vision: params.enableVision,
        enable_transcript: params.enableTranscript,
      },
      traceId,
    );

    const extractedParts = [
      typeof payload.text === "string" ? payload.text.trim() : "",
      typeof payload.caption === "string" ? payload.caption.trim() : "",
      typeof payload.transcript === "string" ? payload.transcript.trim() : "",
    ].filter(Boolean);
    const dedupedText = Array.from(new Set(extractedParts)).join("\n\n").trim();
    const result: LibraryUploadEnrichmentResult = {
      extractedText: dedupedText || null,
      extractor: payload.method ?? "media_enrichment",
      warnings: payload.warning ? [payload.warning] : [],
      searchQuality: payload.search_quality === "full_text" && dedupedText ? "full_text" : "metadata_only",
      stageMessage: dedupedText
        ? "Media enrichment completed and searchable content is ready for indexing."
        : "Media uploaded. Search currently falls back to metadata because enrichment did not return searchable text.",
      extraMetadata: payload.metadata ?? {},
    };
    debugLog("finance_ocr", "enrich-media result", {
      traceId,
      fileName: params.fileName,
      method: payload.method ?? null,
      charCount: payload.char_count ?? 0,
      hasText: Boolean(dedupedText),
      searchQuality: payload.search_quality ?? null,
      warning: payload.warning ?? null,
      metadataKeys: payload.metadata ? Object.keys(payload.metadata).slice(0, 16) : [],
    });
    return result;
  } catch (error) {
    debugLog("finance_ocr", "enrich-media failed", {
      traceId,
      fileName: params.fileName,
      fileType: params.fileType,
      analysisProfile: params.analysisProfile,
      captureIntent: params.captureIntent,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
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
  sourceUrl?: string | null;
  metadata?: Record<string, unknown>;
  traceId?: string | null;
  externalProcessingAllowed?: boolean;
}): Promise<LibraryUploadEnrichmentResult> {
  const traceId = resolveFinanceOcrTraceId(params.traceId);
  const analysisProfile = resolveUploadAnalysisProfile(params.metadata);
  const captureIntent = resolveCaptureIntent(params.metadata);
  const externalProcessingAllowed = params.externalProcessingAllowed ?? true;
  debugLog("finance_ocr", "pipeline route", {
    traceId,
    fileName: params.fileName,
    fileType: params.fileType,
    extension: params.extension,
    analysisProfile,
    captureIntent,
    externalProcessingAllowed,
    hasFallbackText: Boolean(params.fallbackText),
  });

  if (params.fallbackText) {
    debugLog("finance_ocr", "pipeline inline text", {
      traceId,
      fileName: params.fileName,
      textLength: params.fallbackText.length,
    });
    return {
      extractedText: params.fallbackText,
      extractor: "inline_text",
      warnings: [],
      searchQuality: "full_text",
      stageMessage: "Text extracted and queued for semantic indexing.",
      extraMetadata: {},
    };
  }

  if (analysisProfile === "document_ocr" && !externalProcessingAllowed) {
    return {
      extractedText: null,
      extractor: "document_ocr_policy_blocked",
      warnings: ["External document OCR processing is disabled for this tenant."],
      searchQuality: "metadata_only",
      stageMessage: "Document uploaded. External OCR is disabled for this tenant, so search uses metadata only.",
      extraMetadata: {
        ocr_policy_blocked: true,
        analysis_profile: analysisProfile,
      },
    };
  }

  if (COMPLEX_DOCUMENT_EXTENSIONS.has(params.extension)) {
    try {
      return await extractComplexDocumentText({
        ...params,
        analysisProfile,
        captureIntent,
        externalProcessingAllowed,
        sourceUrl: params.sourceUrl,
        traceId,
      });
    } catch (error) {
      debugLog("finance_ocr", "pipeline complex document failed", {
        traceId,
        fileName: params.fileName,
        fileType: params.fileType,
        extension: params.extension,
        analysisProfile,
        captureIntent,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
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
      captureIntent: null,
      enableVision: false,
      enableTranscript: true,
      externalProcessingAllowed,
      traceId,
    });
  }

  if (params.fileType.startsWith("image/")) {
    if (analysisProfile === "document_ocr" || analysisProfile === "real_world_vision") {
      return enrichMediaUpload({
        fileBuffer: params.fileBuffer,
        fileName: params.fileName,
        fileType: params.fileType,
        analysisProfile,
        captureIntent,
        enableVision: true,
        enableTranscript: false,
        externalProcessingAllowed,
        sourceUrl: params.sourceUrl,
        traceId,
      });
    }

    debugLog("finance_ocr", "pipeline image metadata only", {
      traceId,
      fileName: params.fileName,
      fileType: params.fileType,
      extension: params.extension,
      analysisProfile,
    });
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

  debugLog("finance_ocr", "pipeline unsupported", {
    traceId,
    fileName: params.fileName,
    fileType: params.fileType,
    extension: params.extension,
    analysisProfile,
  });
  return {
    extractedText: null,
    extractor: null,
    warnings: [],
    searchQuality: "metadata_only",
    stageMessage: "File uploaded. Search will use metadata for this file type.",
    extraMetadata: {},
  };
}
