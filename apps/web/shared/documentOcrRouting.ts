export const DOCUMENT_OCR_PROVIDER_IDS = {
  legacy: "legacy",
  landingAiAde: "landingai_ade",
  typhoonOcr15: "typhoon_ocr_1_5",
  googleAiVision: "google_ai_vision",
} as const;

export type DocumentOcrProviderId =
  (typeof DOCUMENT_OCR_PROVIDER_IDS)[keyof typeof DOCUMENT_OCR_PROVIDER_IDS];

export const DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES = {
  ocr: "ocr",
  unifiedLlmParser: "unified_llm_parser",
} as const;

export type DocumentOcrPayinSlipParserMode =
  (typeof DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES)[keyof typeof DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES];

export const DOCUMENT_OCR_FILE_CLASSES = {
  image: "image",
  pdf: "pdf",
  legacy: "legacy",
} as const;

export type DocumentOcrFileClass =
  (typeof DOCUMENT_OCR_FILE_CLASSES)[keyof typeof DOCUMENT_OCR_FILE_CLASSES];

export const DOCUMENT_OCR_REQUEST_HEADERS = {
  landingAiApiKey: "x-landingai-ade-api-key",
  typhoonApiKey: "x-typhoon-ocr-api-key",
} as const;

export type DocumentOcrRouteSettings = {
  imageOcrProvider?: string | null;
  pdfOcrProvider?: string | null;
  landingAiApiKey?: string | null;
  typhoonOcrApiKey?: string | null;
  googleAiApiKey?: string | null;
};

export type DocumentOcrRouteResolution = {
  fileClass: DocumentOcrFileClass;
  requestedProviderId: DocumentOcrProviderId;
  providerId: DocumentOcrProviderId;
  fallbackReason: string | null;
  requestHeaders: Record<string, string> | null;
};

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const PDF_MIME_TYPES = new Set([
  "application/pdf",
]);

function normalizeString(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeDocumentOcrProviderId(
  value: string | null | undefined,
): DocumentOcrProviderId | null {
  const normalized = normalizeString(value).replace(/-/g, "_");
  if (!normalized) return null;
  if (normalized === DOCUMENT_OCR_PROVIDER_IDS.legacy) return DOCUMENT_OCR_PROVIDER_IDS.legacy;
  if (normalized === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde) return DOCUMENT_OCR_PROVIDER_IDS.landingAiAde;
  if (normalized === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15) return DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15;
  if (normalized === DOCUMENT_OCR_PROVIDER_IDS.googleAiVision) return DOCUMENT_OCR_PROVIDER_IDS.googleAiVision;
  if (normalized === "landing_ai_ade" || normalized === "landingai" || normalized === "ade") {
    return DOCUMENT_OCR_PROVIDER_IDS.landingAiAde;
  }
  if (normalized === "typhoon_ocr" || normalized === "typhoonocr" || normalized === "typhoonocr15") {
    return DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15;
  }
  if (
    normalized === "googleaivision"
    || normalized === "google_ai"
    || normalized === "google_vision"
    || normalized === "gemini_vision"
    || normalized === "gemini_ocr"
    || normalized === "geminiocr"
  ) {
    return DOCUMENT_OCR_PROVIDER_IDS.googleAiVision;
  }
  return null;
}

export function getDocumentOcrProviderLabel(
  providerId: string | null | undefined,
): string {
  if (providerId === "finance_payin_llm_parser") {
    return "LLM parser";
  }
  const normalized = normalizeDocumentOcrProviderId(providerId);
  switch (normalized) {
    case DOCUMENT_OCR_PROVIDER_IDS.landingAiAde:
      return "LandingAI ADE";
    case DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15:
      return "Typhoon OCR 1.5";
    case DOCUMENT_OCR_PROVIDER_IDS.googleAiVision:
      return "Google AI Vision OCR";
    default:
      return "Native extraction";
  }
}

export function getDocumentOcrPayinSlipParserModeLabel(
  mode: string | null | undefined,
): string {
  return mode === DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
    ? "Transfer slip parser"
    : "OCR";
}

export function getDocumentOcrPayinSlipParserModeDescription(
  mode: string | null | undefined,
): string {
  return mode === DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser
    ? "For image-based transfer slips, use the installed unified transfer-slip parser skill instead of OCR. PDF and non-slip documents still use the OCR routing above."
    : "For image-based transfer slips, use OCR extraction before finance draft parsing. PDF and non-slip documents still use the OCR routing above."
}

export function getDocumentOcrProviderOptions(): Array<{
  value: DocumentOcrProviderId;
  label: string;
  description: string;
}> {
  return [
    {
      value: DOCUMENT_OCR_PROVIDER_IDS.legacy,
      label: "Native extraction",
      description: "Use the existing parser and PDF fallback path for this file class.",
    },
    {
      value: DOCUMENT_OCR_PROVIDER_IDS.landingAiAde,
      label: "LandingAI ADE",
      description: "Use the existing external document OCR provider.",
    },
    {
      value: DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15,
      label: "Typhoon OCR 1.5",
      description: "Use OpenTyphoon OCR via API for Thai document extraction.",
    },
    {
      value: DOCUMENT_OCR_PROVIDER_IDS.googleAiVision,
      label: "Google AI Vision OCR",
      description: "Use Gemini 2.5 Flash OCR via the Google AI key configured above.",
    },
  ];
}

export function classifyDocumentOcrFileClass(params: {
  mimeType?: string | null;
  sniffedMimeType?: string | null;
  fileName?: string | null;
}): DocumentOcrFileClass {
  const normalizedMimeType = normalizeString(params.sniffedMimeType ?? params.mimeType);
  const fileName = normalizeString(params.fileName);
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : "";

  if (PDF_MIME_TYPES.has(normalizedMimeType)) {
    return DOCUMENT_OCR_FILE_CLASSES.pdf;
  }

  if (IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return DOCUMENT_OCR_FILE_CLASSES.image;
  }

  if (!normalizedMimeType || normalizedMimeType === "application/octet-stream") {
    if (extension === "pdf") {
      return DOCUMENT_OCR_FILE_CLASSES.pdf;
    }

    if (extension === "jpg" || extension === "jpeg" || extension === "png") {
      return DOCUMENT_OCR_FILE_CLASSES.image;
    }

    if (extension === "webp" || extension === "gif" || extension === "heic" || extension === "heif") {
      return DOCUMENT_OCR_FILE_CLASSES.image;
    }
  }

  return DOCUMENT_OCR_FILE_CLASSES.legacy;
}

export function resolveDocumentOcrRoute(params: {
  settings: DocumentOcrRouteSettings;
  mimeType?: string | null;
  sniffedMimeType?: string | null;
  fileName?: string | null;
}): DocumentOcrRouteResolution {
  const fileClass = classifyDocumentOcrFileClass({
    mimeType: params.mimeType,
    sniffedMimeType: params.sniffedMimeType,
    fileName: params.fileName,
  });

  const requestedProviderId = normalizeDocumentOcrProviderId(
    fileClass === DOCUMENT_OCR_FILE_CLASSES.image
      ? params.settings.imageOcrProvider
      : fileClass === DOCUMENT_OCR_FILE_CLASSES.pdf
        ? params.settings.pdfOcrProvider
        : DOCUMENT_OCR_PROVIDER_IDS.legacy,
  ) ?? DOCUMENT_OCR_PROVIDER_IDS.legacy;

  if (fileClass === DOCUMENT_OCR_FILE_CLASSES.legacy) {
    return {
      fileClass,
      requestedProviderId,
      providerId: DOCUMENT_OCR_PROVIDER_IDS.legacy,
      fallbackReason: "unsupported_file_class",
      requestHeaders: null,
    };
  }

  if (requestedProviderId === DOCUMENT_OCR_PROVIDER_IDS.legacy) {
    return {
      fileClass,
      requestedProviderId,
      providerId: DOCUMENT_OCR_PROVIDER_IDS.legacy,
      fallbackReason: "legacy_default",
      requestHeaders: null,
    };
  }

  if (requestedProviderId === DOCUMENT_OCR_PROVIDER_IDS.googleAiVision) {
    if (!params.settings.googleAiApiKey?.trim()) {
      return {
        fileClass,
        requestedProviderId,
        providerId: DOCUMENT_OCR_PROVIDER_IDS.legacy,
        fallbackReason: "missing_api_key",
        requestHeaders: null,
      };
    }

    return {
      fileClass,
      requestedProviderId,
      providerId: requestedProviderId,
      fallbackReason: null,
      requestHeaders: null,
    };
  }

  if (requestedProviderId === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15 && params.settings.typhoonOcrApiKey?.trim()) {
    return {
      fileClass,
      requestedProviderId,
      providerId: requestedProviderId,
      fallbackReason: null,
      requestHeaders: {
        [DOCUMENT_OCR_REQUEST_HEADERS.typhoonApiKey]: params.settings.typhoonOcrApiKey.trim(),
      },
    };
  }

  if (requestedProviderId === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde && params.settings.landingAiApiKey?.trim()) {
    return {
      fileClass,
      requestedProviderId,
      providerId: requestedProviderId,
      fallbackReason: null,
      requestHeaders: {
        [DOCUMENT_OCR_REQUEST_HEADERS.landingAiApiKey]: params.settings.landingAiApiKey.trim(),
      },
    };
  }

  return {
    fileClass,
    requestedProviderId,
    providerId: DOCUMENT_OCR_PROVIDER_IDS.legacy,
    fallbackReason: "missing_api_key",
    requestHeaders: null,
  };
}
