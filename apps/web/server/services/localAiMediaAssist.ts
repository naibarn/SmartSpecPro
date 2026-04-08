import { getAppRuntimeConfig, getPreferredInternalToken } from "./appRuntimeConfig";

const INTERNAL_REQUEST_TIMEOUT_MS = 30_000;
const MAX_LOCAL_AI_MEDIA_ASSIST_BYTES = 12 * 1024 * 1024;

export type LocalAiAttachmentAssistMode =
  | "auto"
  | "real_world_vision"
  | "document_ocr"
  | "extract_text";

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

export interface LocalAiAttachmentAssistResult {
  kind: "vision" | "document_ocr" | "extract_text";
  extractedText: string | null;
  extractor: string | null;
  caption: string | null;
  ocrText: string | null;
  warning: string | null;
  searchQuality: "full_text" | "metadata_only";
  metadata: Record<string, unknown>;
}

function decodeBase64Payload(contentBase64: string): Buffer {
  const trimmed = contentBase64.trim();
  if (!trimmed) {
    throw new Error("Attachment content is required");
  }
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === 0) {
    throw new Error("Attachment content is empty");
  }
  if (decoded.length > MAX_LOCAL_AI_MEDIA_ASSIST_BYTES) {
    throw new Error(
      `Attachment exceeds the local AI assist limit of ${
        MAX_LOCAL_AI_MEDIA_ASSIST_BYTES / (1024 * 1024)
      } MB`,
    );
  }
  return decoded;
}

async function postInternalJson<TResponse>(
  path: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const [internalProxyToken, runtime] = await Promise.all([
    getPreferredInternalToken(),
    getAppRuntimeConfig(),
  ]);
  if (!internalProxyToken) {
    throw new Error("SMARTSPEC proxy token is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNAL_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${runtime.pythonBackendUrl}${path}`, {
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
      throw new Error(`Internal attachment assist failed (${response.status}): ${detail}`);
    }

    return (await response.json()) as TResponse;
  } finally {
    clearTimeout(timer);
  }
}

function resolveAssistMode(input: {
  mode: LocalAiAttachmentAssistMode;
  mimeType: string;
}): Exclude<LocalAiAttachmentAssistMode, "auto"> {
  if (input.mode !== "auto") {
    return input.mode;
  }

  const normalizedMimeType = input.mimeType.trim().toLowerCase();
  if (normalizedMimeType === "application/pdf") {
    return "extract_text";
  }
  return normalizedMimeType.startsWith("image/")
    ? "document_ocr"
    : "extract_text";
}

export async function analyzeLocalAiAttachmentAssist(input: {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  mode: LocalAiAttachmentAssistMode;
}): Promise<LocalAiAttachmentAssistResult> {
  decodeBase64Payload(input.contentBase64);
  const resolvedMode = resolveAssistMode({
    mode: input.mode,
    mimeType: input.mimeType,
  });

  if (resolvedMode === "extract_text") {
    const payload = await postInternalJson<ExtractTextResponse>(
      "/api/internal/library/extract-text",
      {
        file_name: input.fileName,
        mime_type: input.mimeType,
        content_base64: input.contentBase64,
      },
    );
    const extractedText = (payload.text ?? "").trim();
    return {
      kind: "extract_text",
      extractedText: extractedText || null,
      extractor: payload.method ?? "extract_text",
      caption: null,
      ocrText: extractedText || null,
      warning: payload.warning ?? null,
      searchQuality: extractedText ? "full_text" : "metadata_only",
      metadata: {},
    };
  }

  const payload = await postInternalJson<MediaEnrichmentResponse>(
    "/api/internal/library/enrich-media",
    {
      file_name: input.fileName,
      mime_type: input.mimeType,
      content_base64: input.contentBase64,
      analysis_profile: resolvedMode,
      enable_vision: true,
      enable_transcript: false,
    },
  );

  const extractedText = (payload.text ?? "").trim();
  const metadata = payload.metadata ?? {};
  const ocrText =
    typeof metadata.ocr_text === "string" && metadata.ocr_text.trim().length > 0
      ? metadata.ocr_text.trim()
      : null;

  return {
    kind: resolvedMode === "document_ocr" ? "document_ocr" : "vision",
    extractedText: extractedText || null,
    extractor: payload.method ?? null,
    caption:
      typeof payload.caption === "string" && payload.caption.trim().length > 0
        ? payload.caption.trim()
        : null,
    ocrText,
    warning: payload.warning ?? null,
    searchQuality: payload.search_quality ?? "metadata_only",
    metadata,
  };
}
