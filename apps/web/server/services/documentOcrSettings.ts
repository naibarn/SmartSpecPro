import { eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import {
  classifyDocumentOcrFileClass,
  DOCUMENT_OCR_PROVIDER_IDS,
  normalizeDocumentOcrProviderId,
  resolveDocumentOcrRoute,
  type DocumentOcrFileClass,
  type DocumentOcrProviderId,
  type DocumentOcrRouteResolution,
} from "../../shared/documentOcrRouting";
import { getDb } from "../db";
import { decrypt } from "./crypto";

const CATEGORY = "document_ocr" as const;
const CATEGORY_GOOGLE_AI = "multimodal_embedding" as const;
const KEY_LANDINGAI_API = "landingai_ade_api_key";
const KEY_TYPHOON_API = "typhoon_ocr_api_key";
const KEY_IMAGE_PROVIDER = "image_ocr_provider";
const KEY_PDF_PROVIDER = "pdf_ocr_provider";
const KEY_CREDITS_PER_PAGE = "ocr_credits_per_page";
const KEY_NATIVE_IMAGE_CREDITS = "native_ocr_image_credits";
const KEY_NATIVE_PDF_CREDITS = "native_ocr_pdf_page_credits";
const KEY_TYPHOON_IMAGE_CREDITS = "typhoon_ocr_image_credits";
const KEY_TYPHOON_PDF_CREDITS = "typhoon_ocr_pdf_page_credits";
const KEY_GOOGLE_IMAGE_CREDITS = "google_ai_vision_image_credits";
const KEY_GOOGLE_PDF_CREDITS = "google_ai_vision_pdf_page_credits";
const KEY_LANDINGAI_IMAGE_CREDITS = "landingai_ade_image_credits";
const KEY_LANDINGAI_PDF_CREDITS = "landingai_ade_pdf_page_credits";
const KEY_GOOGLE_API = "google_api_key";
const KEY_GEMINI_API = "gemini_api_key";
const KEY_PAYIN_SLIP_PARSER_MODE = "payin_slip_parser_mode";

const DEFAULT_CREDITS_PER_PAGE = 1;
const CACHE_TTL_MS = 30_000;
export const DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES = {
  ocr: "ocr",
  unifiedLlmParser: "unified_llm_parser",
} as const;

export type DocumentOcrPayinSlipParserMode =
  (typeof DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES)[keyof typeof DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES];

export type DocumentOcrBillingRate = {
  imageCreditsPerUnit: number;
  pdfCreditsPerPage: number;
};

export type DocumentOcrBillingRates = Record<DocumentOcrProviderId, DocumentOcrBillingRate>;

export type DocumentOcrSettings = {
  imageOcrProvider: DocumentOcrProviderId;
  pdfOcrProvider: DocumentOcrProviderId;
  payinSlipParserMode: DocumentOcrPayinSlipParserMode;
  typhoonOcrApiKey: string;
  landingAiApiKey: string;
  googleAiApiKey: string;
  creditsPerPage: number;
  billingRates: DocumentOcrBillingRates;
};

type SettingsRow = {
  key: string;
  value: string | null;
  isSensitive: boolean | null;
};

let cachedSettings: DocumentOcrSettings | null = null;
let cacheExpiresAt = 0;
let refreshPromise: Promise<DocumentOcrSettings> | null = null;

function readRowValue(row?: SettingsRow): string {
  if (!row?.value) return "";
  if (!row.isSensitive) return row.value;
  try {
    return decrypt(row.value) || "";
  } catch {
    return "";
  }
}

function parseCreditsPerPage(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_CREDITS_PER_PAGE;
  return Math.max(0, parsed);
}

function parseCreditsValue(row?: SettingsRow, fallback = 0): number {
  if (!row) return fallback;
  return parseCreditsPerPage(readRowValue(row) || String(fallback));
}

function readProviderValue(row?: SettingsRow): DocumentOcrProviderId {
  const normalized = normalizeDocumentOcrProviderId(readRowValue(row));
  return normalized ?? DOCUMENT_OCR_PROVIDER_IDS.legacy;
}

function readPayinSlipParserMode(row?: SettingsRow): DocumentOcrPayinSlipParserMode {
  const normalized = readRowValue(row).trim().toLowerCase();
  if (normalized === DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser) {
    return DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.unifiedLlmParser;
  }
  return DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr;
}

function buildFallbackBillingRates(legacyFallbackCreditsPerPage: number): DocumentOcrBillingRates {
  return {
    legacy: {
      imageCreditsPerUnit: 0,
      pdfCreditsPerPage: legacyFallbackCreditsPerPage,
    },
    landingai_ade: {
      imageCreditsPerUnit: legacyFallbackCreditsPerPage,
      pdfCreditsPerPage: legacyFallbackCreditsPerPage,
    },
    typhoon_ocr_1_5: {
      imageCreditsPerUnit: legacyFallbackCreditsPerPage,
      pdfCreditsPerPage: legacyFallbackCreditsPerPage,
    },
    google_ai_vision: {
      imageCreditsPerUnit: legacyFallbackCreditsPerPage,
      pdfCreditsPerPage: legacyFallbackCreditsPerPage,
    },
  };
}

async function loadDocumentOcrSettings(): Promise<DocumentOcrSettings> {
  try {
    const db = await getDb();
    const [documentRows, googleRows] = db
      ? await Promise.all([
        db.select({ key: systemSettings.key, value: systemSettings.value, isSensitive: systemSettings.isSensitive })
          .from(systemSettings)
          .where(eq(systemSettings.category, CATEGORY)),
        db.select({ key: systemSettings.key, value: systemSettings.value, isSensitive: systemSettings.isSensitive })
          .from(systemSettings)
          .where(eq(systemSettings.category, CATEGORY_GOOGLE_AI)),
      ])
      : [[], []];
    const documentMap = new Map(documentRows.map((row) => [row.key, row]));
    const googleMap = new Map(googleRows.map((row) => [row.key, row]));
    const imageOcrProvider = readProviderValue(documentMap.get(KEY_IMAGE_PROVIDER));
    const pdfOcrProvider = readProviderValue(documentMap.get(KEY_PDF_PROVIDER));
    const payinSlipParserMode = readPayinSlipParserMode(documentMap.get(KEY_PAYIN_SLIP_PARSER_MODE));
    const typhoonOcrApiKey = readRowValue(documentMap.get(KEY_TYPHOON_API));
    const landingAiApiKey = readRowValue(documentMap.get(KEY_LANDINGAI_API));
    const googleAiApiKey = readRowValue(googleMap.get(KEY_GOOGLE_API)) || readRowValue(googleMap.get(KEY_GEMINI_API));
    const legacyFallbackCreditsPerPage = parseCreditsPerPage(readRowValue(documentMap.get(KEY_CREDITS_PER_PAGE)));
    const billingRates = {
      legacy: {
        imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_NATIVE_IMAGE_CREDITS), 0),
        pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_NATIVE_PDF_CREDITS), legacyFallbackCreditsPerPage),
      },
      landingai_ade: {
        imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_LANDINGAI_IMAGE_CREDITS), legacyFallbackCreditsPerPage),
        pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_LANDINGAI_PDF_CREDITS), legacyFallbackCreditsPerPage),
      },
      typhoon_ocr_1_5: {
        imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_TYPHOON_IMAGE_CREDITS), legacyFallbackCreditsPerPage),
        pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_TYPHOON_PDF_CREDITS), legacyFallbackCreditsPerPage),
      },
      google_ai_vision: {
        imageCreditsPerUnit: parseCreditsValue(documentMap.get(KEY_GOOGLE_IMAGE_CREDITS), legacyFallbackCreditsPerPage),
        pdfCreditsPerPage: parseCreditsValue(documentMap.get(KEY_GOOGLE_PDF_CREDITS), legacyFallbackCreditsPerPage),
      },
    } satisfies DocumentOcrBillingRates;
    return {
      imageOcrProvider,
      pdfOcrProvider,
      payinSlipParserMode,
      typhoonOcrApiKey,
      landingAiApiKey,
      googleAiApiKey,
      creditsPerPage: legacyFallbackCreditsPerPage,
      billingRates,
    };
  } catch {
    const billingRates = buildFallbackBillingRates(DEFAULT_CREDITS_PER_PAGE);
    return {
      imageOcrProvider: DOCUMENT_OCR_PROVIDER_IDS.legacy,
      pdfOcrProvider: DOCUMENT_OCR_PROVIDER_IDS.legacy,
      payinSlipParserMode: DOCUMENT_OCR_PAYIN_SLIP_PARSER_MODES.ocr,
      typhoonOcrApiKey: "",
      landingAiApiKey: "",
      googleAiApiKey: "",
      creditsPerPage: DEFAULT_CREDITS_PER_PAGE,
      billingRates,
    };
  }
}

export async function getDocumentOcrSettings(): Promise<DocumentOcrSettings> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiresAt) {
    return cachedSettings;
  }
  if (!refreshPromise) {
    refreshPromise = loadDocumentOcrSettings()
      .then((settings) => {
        cachedSettings = settings;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return settings;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export function clearDocumentOcrSettingsCache(): void {
  cachedSettings = null;
  cacheExpiresAt = 0;
  refreshPromise = null;
}

export function resolveOcrPageCount(metadata: Record<string, unknown>, mimeType?: string | null): number {
  const raw = extractNumericMetadata(metadata, [
    "page_count",
    "pageCount",
    "pages",
    "page_total",
  ]);
  const normalized = raw ?? (mimeType && mimeType.toLowerCase().includes("pdf") ? null : 1);
  if (normalized === null) return 1;
  if (!Number.isFinite(normalized) || normalized <= 0) return 1;
  return Math.min(Math.round(normalized), 500);
}

export function isOcrExtractor(extractor: string | null | undefined): boolean {
  const value = (extractor || "").toLowerCase().trim();
  if (!value) return false;
  if (value === "inline_text" || value === "document_ocr_policy_blocked") return false;
  return value.includes("ocr") || value.includes("landingai") || value.includes("ade");
}

export function resolveOcrProvider(metadata: Record<string, unknown>, extractor: string | null | undefined): string | null {
  const provider = typeof metadata.ocr_provider === "string"
    ? metadata.ocr_provider
    : typeof metadata.ocrProvider === "string"
      ? metadata.ocrProvider
      : typeof metadata.provider === "string"
        ? metadata.provider
        : null;
  if (provider && provider.trim()) return normalizeDocumentOcrProviderId(provider.trim()) ?? provider.trim();
  const method = typeof metadata.extraction_method === "string"
    ? metadata.extraction_method
    : typeof metadata.extractionMethod === "string"
      ? metadata.extractionMethod
      : null;
  if (method && method.trim()) return method.trim();
  const fallback = extractor ? extractor.trim() : "";
  return fallback ? fallback : null;
}

export function resolveDocumentOcrChargeProviderId(
  providerId: string | null | undefined,
): DocumentOcrProviderId {
  const normalized = normalizeDocumentOcrProviderId(providerId);
  if (
    normalized === DOCUMENT_OCR_PROVIDER_IDS.landingAiAde
    || normalized === DOCUMENT_OCR_PROVIDER_IDS.typhoonOcr15
    || normalized === DOCUMENT_OCR_PROVIDER_IDS.googleAiVision
    || normalized === DOCUMENT_OCR_PROVIDER_IDS.legacy
  ) {
    return normalized;
  }
  return DOCUMENT_OCR_PROVIDER_IDS.legacy;
}

export function getDocumentOcrCreditsPerUnit(params: {
  settings: Pick<DocumentOcrSettings, "creditsPerPage"> & { billingRates?: DocumentOcrBillingRates };
  providerId?: string | null;
  fileClass: DocumentOcrFileClass;
}): number {
  const providerId = resolveDocumentOcrChargeProviderId(params.providerId);
  const billingRates = params.settings.billingRates ?? buildFallbackBillingRates(params.settings.creditsPerPage);
  const rate = billingRates[providerId];
  if (!rate) {
    return params.settings.creditsPerPage;
  }
  return params.fileClass === "pdf"
    ? rate.pdfCreditsPerPage
    : rate.imageCreditsPerUnit;
}

export function resolveDocumentOcrRouting(params: {
  settings: DocumentOcrSettings;
  mimeType?: string | null;
  sniffedMimeType?: string | null;
  fileName?: string | null;
}): DocumentOcrRouteResolution {
  return resolveDocumentOcrRoute(params);
}

export function classifyOcrFileClass(params: {
  mimeType?: string | null;
  sniffedMimeType?: string | null;
  fileName?: string | null;
}): DocumentOcrFileClass {
  return classifyDocumentOcrFileClass(params);
}

function extractNumericMetadata(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

export function calculateOcrCredits(pageCount: number, creditsPerPage: number): number {
  if (creditsPerPage <= 0) return 0;
  return Math.max(0, Math.round(pageCount) * creditsPerPage);
}
