import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { TRPCError } from "@trpc/server";
import { and, eq, lt, ne, sql } from "drizzle-orm";

import { debugLog } from "../_core/logger";
import { getDb } from "../db";
import { documentExtractions, type DocumentExtraction } from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";
import { checkRateLimit } from "../middleware/distributedRateLimit";
import { checkAbuseGuard, hashPrompt } from "./abuseGuard";
import { getConversationById, isPersonalProjectId } from "./chatService";
import { getLibraryItemById, type LibraryItemDto } from "./libraryService";
import { enrichLibraryUploadContent } from "./libraryUploadPipeline";
import { getFinanceOcrDebugTraceId, recordFinanceOcrDebugStep } from "./financeOcrDebug";
import { getAppRuntimeConfig } from "./appRuntimeConfig";
import { storageGet } from "../storage";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { deductCredits, hasEnoughCredits } from "./creditService";
import {
  calculateOcrCredits,
  classifyOcrFileClass,
  getDocumentOcrSettings,
  getDocumentOcrCreditsPerUnit,
  isOcrExtractor,
  resolveOcrPageCount,
  resolveOcrProvider,
} from "./documentOcrSettings";
import {
  extractDocumentOccurredAtIso,
  buildFinanceStructuredDraftFromText,
  applyPinnedMerchantPresetsToDraftAsync,
  extractFinanceStructuredDraftFromOcrText,
  parseDocumentToDraft,
  type FinanceDraftRecord,
  type FinanceScope,
} from "./financeService";
import { getTraceId } from "./traceContext";
import { resolveTenantIdVarchar } from "./tenantContext";

type FinanceDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface IngestFinanceDocumentInput {
  conversationId: number;
  libraryItemId: number;
  userId: number;
  tenantId?: string | null;
  counterpartyName?: string | null;
  captureIntent?: "receipt" | "transfer_slip" | "statement";
  idempotencyKey?: string;
  model?: string;
  debugTraceId?: string | null;
}

export interface FinanceDocumentExtractionResult {
  extraction: DocumentExtraction;
  draft: FinanceDraftRecord;
  libraryItem: LibraryItemDto;
}

const FINANCE_MIME_ALLOWLIST = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const FINANCE_OCR_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const FINANCE_OCR_MAX_PAGE_COUNT = 25;
const FINANCE_OCR_BURST_LIMIT = 5;
const FINANCE_OCR_DAILY_LIMIT = 30;
const DEFAULT_FINANCE_OCR_RAW_RETENTION_DAYS = 30;
const MIN_FINANCE_OCR_RAW_RETENTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resolveFinanceOcrRawRetentionDays(): number {
  const raw = process.env.FINANCE_OCR_RAW_RETENTION_DAYS;
  if (!raw) return DEFAULT_FINANCE_OCR_RAW_RETENTION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_FINANCE_OCR_RAW_RETENTION_DAYS;
  if (parsed <= 0) return 0;
  return Math.max(parsed, MIN_FINANCE_OCR_RAW_RETENTION_DAYS);
}

function resolveFinanceOcrTraceId(explicitTraceId?: string | null): string {
  const candidate = String(explicitTraceId ?? getTraceId() ?? "").trim();
  if (candidate) {
    return candidate.replace(/[^A-Za-z0-9._:-]+/g, "").slice(0, 128) || randomUUID();
  }
  return randomUUID();
}

function buildAllowedScopes(userId: number): string[] {
  return [`user:${userId}`];
}

function normalizeFinanceMimeType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function coercePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return null;
}

function extractNumericMetadata(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = coercePositiveInteger(metadata[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function extractLibraryText(metadata: Record<string, unknown>): string | null {
  const candidates = [
    metadata.ocr_text,
    metadata.raw_ocr_text,
    metadata.text,
    metadata.full_text,
    metadata.extracted_text,
    metadata.unified_payin_slip_summary,
    metadata.finance_unified_payin_slip_summary,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function formatUnifiedParty(party: unknown): string | null {
  if (!party || typeof party !== "object" || Array.isArray(party)) {
    return null;
  }
  const record = party as Record<string, unknown>;
  const parts: string[] = [];
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const issuerName = typeof record.issuer_name === "string" ? record.issuer_name.trim() : "";
  const accountNumber = typeof record.account_number === "string" ? record.account_number.trim() : "";
  const merchantName = typeof record.merchant_name === "string" ? record.merchant_name.trim() : "";

  if (name) {
    parts.push(name);
  } else if (merchantName) {
    parts.push(merchantName);
  }
  if (issuerName && !parts.includes(issuerName)) {
    parts.push(issuerName);
  }
  if (accountNumber) {
    parts.push(accountNumber);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function extractUnifiedPayinSlipText(metadata: Record<string, unknown>): string | null {
  const structuredResult = metadata.unified_payin_slip_result ?? metadata.finance_unified_payin_slip_result;
  if (structuredResult && typeof structuredResult === "object" && !Array.isArray(structuredResult)) {
    const result = structuredResult as Record<string, unknown>;
    const transaction = result.transaction && typeof result.transaction === "object" && !Array.isArray(result.transaction)
      ? result.transaction as Record<string, unknown>
      : {};
    const payer = formatUnifiedParty(result.payer);
    const payee = formatUnifiedParty(result.payee);
    const detectedIssuer = result.detected_issuer && typeof result.detected_issuer === "object" && !Array.isArray(result.detected_issuer)
      ? result.detected_issuer as Record<string, unknown>
      : {};
    const validation = result.validation && typeof result.validation === "object" && !Array.isArray(result.validation)
      ? result.validation as Record<string, unknown>
      : {};

    const lines: string[] = [];
    const transactionType = typeof transaction.transaction_type === "string" ? transaction.transaction_type.trim() : "";
    const amount = typeof transaction.amount === "number" && Number.isFinite(transaction.amount)
      ? `${transaction.amount.toFixed(2)} ${typeof transaction.currency === "string" && transaction.currency.trim() ? transaction.currency.trim().toUpperCase() : "THB"}`
      : null;
    const fee = typeof transaction.fee === "number" && Number.isFinite(transaction.fee)
      ? `${transaction.fee.toFixed(2)} ${typeof transaction.fee_currency === "string" && transaction.fee_currency.trim() ? transaction.fee_currency.trim().toUpperCase() : "THB"}`
      : null;
    const referenceId = typeof transaction.reference_id === "string" ? transaction.reference_id.trim() : "";
    const merchantCode = typeof transaction.merchant_code === "string" ? transaction.merchant_code.trim() : "";
    const merchantReference = typeof transaction.merchant_reference === "string" ? transaction.merchant_reference.trim() : "";
    const merchantTaxId = typeof transaction.merchant_tax_id === "string" ? transaction.merchant_tax_id.trim() : "";
    const rawDateText = typeof transaction.transaction_datetime_local === "string"
      ? transaction.transaction_datetime_local.trim()
      : typeof transaction.raw_date_text === "string"
        ? transaction.raw_date_text.trim()
        : "";
    const issuerName = typeof detectedIssuer.issuer_name_th === "string"
      ? detectedIssuer.issuer_name_th.trim()
      : typeof detectedIssuer.issuer_name_en === "string"
        ? detectedIssuer.issuer_name_en.trim()
        : typeof detectedIssuer.issuer_code === "string"
          ? detectedIssuer.issuer_code.trim()
          : "";
    const issuerType = typeof detectedIssuer.issuer_type === "string" ? detectedIssuer.issuer_type.trim() : "";
    const status = typeof transaction.status === "string" ? transaction.status.trim() : "";
    const warnings = Array.isArray(validation.warnings)
      ? validation.warnings.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const missingFields = Array.isArray(validation.missing_fields)
      ? validation.missing_fields.map((item) => String(item).trim()).filter(Boolean)
      : [];

    lines.push("สรุปรายการสลิปโอนเงิน");
    if (transactionType) {
      lines.push(`• ประเภท: ${transactionType}`);
    }
    if (issuerName) {
      lines.push(`• ผู้ให้บริการ: ${issuerName}${issuerType ? ` (${issuerType})` : ""}`);
    }
    if (status) {
      lines.push(`• สถานะ: ${status}`);
    }
    if (amount) {
      lines.push(`• จำนวนเงิน: ${amount}`);
    }
    if (fee) {
      lines.push(`• ค่าธรรมเนียม: ${fee}`);
    }
    if (payer) {
      lines.push(`• โอนจาก: ${payer}`);
    }
    if (payee) {
      lines.push(`• โอนไปยัง: ${payee}`);
    }
    if (referenceId) {
      lines.push(`• รหัสอ้างอิง: ${referenceId}`);
    }
    if (merchantCode) {
      lines.push(`• รหัสร้านค้า: ${merchantCode}`);
    }
    if (merchantReference) {
      lines.push(`• หมายเลขอ้างอิงร้านค้า: ${merchantReference}`);
    }
    if (merchantTaxId) {
      lines.push(`• เลขผู้เสียภาษี: ${merchantTaxId}`);
    }
    if (rawDateText) {
      lines.push(`• วันที่และเวลา: ${rawDateText}`);
    }
    if (missingFields.length > 0) {
      lines.push(`• ข้อมูลที่ยังไม่ครบ: ${missingFields.join(", ")}`);
    }
    if (warnings.length > 0) {
      lines.push(`• หมายเหตุ: ${warnings.slice(0, 3).join("; ")}`);
    }

    const structuredText = lines.join("\n").trim();
    if (structuredText) {
      return structuredText;
    }
  }

  const rawTextCandidates = [
    metadata.ocr_text,
    metadata.raw_ocr_text,
    metadata.text,
    metadata.full_text,
  ];
  for (const candidate of rawTextCandidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  const directSummaryCandidates = [
    metadata.unified_payin_slip_summary,
    metadata.finance_unified_payin_slip_summary,
  ];
  for (const candidate of directSummaryCandidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
}

function extractFileExtension(fileName: string): string {
  const normalized = fileName.trim();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) {
    return "";
  }
  return normalized.slice(dotIndex + 1).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function normalizeCaptureIntent(value?: string | null): "receipt" | "transfer_slip" | "statement" | null {
  if (value === "receipt" || value === "transfer_slip" || value === "statement") {
    return value;
  }
  return null;
}

function buildFinanceScope(
  conversation: { id: number; tenantId: string | null; projectId: string | null },
  userId: number,
  tenantId?: string | null,
): FinanceScope {
  const resolvedTenantId = resolveTenantIdVarchar(tenantId ?? conversation.tenantId, conversation.tenantId);
  if (!resolvedTenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for finance OCR" });
  }

  if (!conversation.projectId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Finance OCR requires a project-scoped conversation" });
  }

  return {
    tenantId: resolvedTenantId,
    ownerUserId: userId,
    projectId: conversation.projectId,
    conversationId: conversation.id,
    personal: isPersonalProjectId(conversation.projectId),
    allowedScopes: buildAllowedScopes(userId),
  };
}

async function ensureLibraryItemMatchesScope(
  libraryItem: LibraryItemDto,
  scope: FinanceScope,
): Promise<void> {
  if (libraryItem.tenantId !== scope.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Library item tenant does not match finance scope" });
  }

  if (libraryItem.ownerUserId !== scope.ownerUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Library item owner does not match finance scope" });
  }

  if (!libraryItem.projectId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Finance document uploads must carry an explicit project scope",
    });
  }

  if (libraryItem.projectId !== scope.projectId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Library item project does not match the active finance conversation",
    });
  }
}

export async function sweepDocumentExtractionOcrRetention(): Promise<{
  retentionDays: number;
  redacted: number;
}> {
  const retentionDays = resolveFinanceOcrRawRetentionDays();
  if (retentionDays <= 0) {
    return { retentionDays, redacted: 0 };
  }

  const db = await getDb();
  if (!db) {
    return { retentionDays, redacted: 0 };
  }

  const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);
  const redactedAt = new Date().toISOString();
  const rows = await db
    .update(documentExtractions)
    .set({
      ocrText: "",
      ocrJson: sql`${documentExtractions.ocrJson} || ${JSON.stringify({
        ocr_text_redacted_at: redactedAt,
        ocr_text_retention_days: retentionDays,
      })}::jsonb`,
    })
    .where(and(
      lt(documentExtractions.createdAt, cutoff),
      ne(documentExtractions.ocrText, ""),
    ))
    .returning({ id: documentExtractions.id });

  return {
    retentionDays,
    redacted: rows.length,
  };
}

function ensureAllowedFinanceMime(mimeType: string | null): string {
  if (!mimeType || !FINANCE_MIME_ALLOWLIST.has(mimeType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Finance OCR accepts only PDF, JPEG, PNG, WebP, GIF, HEIC, and HEIF uploads",
    });
  }

  return mimeType;
}

function isPublicSourceUrl(value: string | null | undefined): boolean {
  const candidate = String(value ?? "").trim();
  if (!candidate) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return false;
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    return false;
  }

  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }
  if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return false;
  }

  const ipv4 = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (ipv4) {
    const [a, b] = hostname.split(".").map((part) => Number(part));
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    return true;
  }

  if (hostname.includes(":")) {
    if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
      return false;
    }
  }

  return true;
}

function redactSourceUrlHost(value: string | null | undefined): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    return null;
  }

  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "127.0.0.1" || hostname === "::1") {
    return "localhost";
  }
  if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return hostname;
  }

  const ipv4 = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (ipv4) {
    const [a, b] = hostname.split(".").map((part) => Number(part));
    if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
      return "private-ip";
    }
    return hostname;
  }

  if (hostname.includes(":")) {
    if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
      return "private-ip";
    }
    return hostname;
  }

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) {
    return hostname;
  }
  const firstLabel = labels[0] ?? "";
  const firstLabelRedacted = firstLabel.length > 3 ? `${firstLabel.slice(0, 3)}…` : `${firstLabel}…`;
  return [firstLabelRedacted, ...labels.slice(1)].join(".");
}

async function resolveLibraryItemDownloadUrl(libraryItem: LibraryItemDto): Promise<string | null> {
  const metadata = (libraryItem.metadata ?? {}) as Record<string, unknown>;
  const sourceKey = typeof metadata.source_key === "string" ? metadata.source_key.trim() : "";
  const directSourceUrl = typeof libraryItem.sourceUrl === "string" ? libraryItem.sourceUrl.trim() : "";

  let resolvedUrl: string | null = null;
  if (sourceKey) {
    try {
      resolvedUrl = (await storageGet(sourceKey)).url;
    } catch {
      resolvedUrl = null;
    }
  }

  if (!resolvedUrl && directSourceUrl) {
    resolvedUrl = directSourceUrl;
  }

  if (!resolvedUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(resolvedUrl)) {
    return resolvedUrl;
  }

  const runtime = await getAppRuntimeConfig();
  const baseUrl = runtime.publicUrl || runtime.appPublicUrl || runtime.appUrl || runtime.internalNodeUrl || "http://localhost:3000";
  return new URL(resolvedUrl, baseUrl).toString();
}

async function reextractLibraryItemTextFromSource(
  libraryItem: LibraryItemDto,
  fileType: string,
  captureIntent: "receipt" | "transfer_slip" | "statement" | null,
  analysisProfile: string | null,
  tenantId: string | null | undefined,
  traceId?: string | null,
  debugTraceId?: string | null,
  externalProcessingAllowed?: boolean,
): Promise<{ text: string | null; extractor: string | null; warnings: string[]; sourceUrl: string | null; metadata: Record<string, unknown> | null }> {
  const sourceUrl = await resolveLibraryItemDownloadUrl(libraryItem);
  const sourceUrlPublic = isPublicSourceUrl(sourceUrl);
  const sourceUrlHostRedacted = redactSourceUrlHost(sourceUrl);
  debugLog("finance_ocr", "reextract source start", {
    traceId: traceId ?? "unknown",
    debugTraceId,
    libraryItemId: libraryItem.id,
    fileType,
    captureIntent,
    hasSourceKey: Boolean((libraryItem.metadata ?? {}).source_key),
    hasSourceUrl: Boolean(libraryItem.sourceUrl),
    sourceUrlPresent: Boolean(sourceUrl),
    sourceUrlPublic,
    sourceUrlHostRedacted,
  });
  if (!sourceUrl) {
    debugLog("finance_ocr", "reextract source missing", {
      traceId: traceId ?? "unknown",
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      sourceUrlPublic,
      sourceUrlHostRedacted,
    });
    return {
      text: null,
      extractor: null,
      warnings: ["Original file source is unavailable for OCR fallback"],
      sourceUrl: null,
      metadata: null,
    };
  }

  if (externalProcessingAllowed === false) {
    return {
      text: null,
      extractor: "document_ocr_policy_blocked",
      warnings: ["External document OCR processing is disabled for this tenant."],
      sourceUrl,
      metadata: null,
    };
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    debugLog("finance_ocr", "reextract source download failed", {
      traceId: traceId ?? "unknown",
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      status: response.status,
      sourceUrlPublic,
      sourceUrlHostRedacted,
    });
    return {
      text: null,
      extractor: null,
      warnings: [`Failed to download original upload for OCR fallback (${response.status})`],
      sourceUrl,
      metadata: null,
    };
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) {
    debugLog("finance_ocr", "reextract source empty", {
      traceId: traceId ?? "unknown",
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      sourceUrlPresent: Boolean(sourceUrl),
      sourceUrlPublic,
      sourceUrlHostRedacted,
    });
    return {
      text: null,
      extractor: null,
      warnings: ["Original file download for OCR fallback was empty"],
      sourceUrl,
      metadata: null,
    };
  }

  const metadata = (libraryItem.metadata ?? {}) as Record<string, unknown>;
  const fileName = typeof metadata.file_name === "string" && metadata.file_name.trim()
    ? metadata.file_name.trim()
    : libraryItem.title;
  const enrichment = await enrichLibraryUploadContent({
    fileBuffer: Buffer.from(arrayBuffer),
    fileName,
    fileType,
    extension: extractFileExtension(fileName),
    fallbackText: null,
    sourceUrl,
    metadata: {
      analysis_profile: analysisProfile ?? "document_ocr",
      ...(captureIntent ? { finance_capture_intent: captureIntent } : {}),
    },
    traceId,
    externalProcessingAllowed,
    tenantId: tenantId ? resolveTenantIdVarchar(tenantId) : undefined,
  });
  debugLog("finance_ocr", "reextract source result", {
    traceId: traceId ?? "unknown",
    debugTraceId,
    libraryItemId: libraryItem.id,
    fileType,
    captureIntent,
    extractor: enrichment.extractor,
    textLength: enrichment.extractedText?.length ?? 0,
    warningCount: enrichment.warnings.length,
    sourceUrlPublic,
    sourceUrlHostRedacted,
  });

  return {
    text: enrichment.extractedText,
    extractor: enrichment.extractor,
    warnings: enrichment.warnings,
    sourceUrl,
    metadata: enrichment.extraMetadata ?? null,
  };
}

async function enforceFinanceOcrRequestBudget(
  scope: FinanceScope,
  libraryItem: LibraryItemDto,
  mimeType: string,
): Promise<void> {
  const metadata = (libraryItem.metadata ?? {}) as Record<string, unknown>;
  const fileSizeBytes = extractNumericMetadata(metadata, [
    "file_size_bytes",
    "fileSizeBytes",
    "size_bytes",
  ]);
  if (fileSizeBytes === null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Finance OCR requires file size metadata",
    });
  }
  if (fileSizeBytes > FINANCE_OCR_MAX_FILE_SIZE_BYTES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Finance OCR accepts uploads up to 25 MB",
    });
  }

  const pageCount = extractNumericMetadata(metadata, [
    "page_count",
    "pageCount",
    "pages",
  ]) ?? (mimeType === "application/pdf" ? null : 1);

  if (pageCount === null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Finance OCR requires page count metadata for PDFs",
    });
  }

  if (pageCount > FINANCE_OCR_MAX_PAGE_COUNT) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Finance OCR accepts PDFs up to 25 pages",
    });
  }

  const abuseResult = await checkAbuseGuard({
    userId: scope.ownerUserId,
    namespace: "finance",
    promptHash: hashPrompt(
      [
        scope.tenantId,
        scope.projectId,
        libraryItem.id,
        fileSizeBytes,
        pageCount,
      ].join(":"),
    ),
  });

  if (!abuseResult.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Finance OCR request was blocked by abuse detection",
    });
  }
}

async function selectExistingExtraction(db: FinanceDb, params: {
  tenantId: string;
  projectId: string;
  ownerUserId: number;
  idempotencyKey: string;
}): Promise<DocumentExtraction | null> {
  const rows = await db
    .select()
    .from(documentExtractions)
    .where(and(
      eq(documentExtractions.tenantId, params.tenantId),
      eq(documentExtractions.projectId, params.projectId),
      eq(documentExtractions.ownerUserId, params.ownerUserId),
      eq(documentExtractions.idempotencyKey, params.idempotencyKey),
    ))
    .limit(1);

  return rows[0] ?? null;
}

export async function ingestFinanceDocumentFromLibraryItem(
  input: IngestFinanceDocumentInput,
): Promise<FinanceDocumentExtractionResult> {
  const traceId = resolveFinanceOcrTraceId();
  const debugTraceId = getFinanceOcrDebugTraceId(input.debugTraceId);
  debugLog("finance_ocr", "ingest start", {
    traceId,
    debugTraceId,
    conversationId: input.conversationId,
    libraryItemId: input.libraryItemId,
    userId: input.userId,
    tenantId: input.tenantId ?? null,
    captureIntent: input.captureIntent ?? null,
    hasIdempotencyKey: Boolean(input.idempotencyKey),
  });
  recordFinanceOcrDebugStep("finance_ingest_start", {
    traceId: debugTraceId ?? traceId,
    traceIdInternal: traceId,
    conversationId: input.conversationId,
    libraryItemId: input.libraryItemId,
    userId: input.userId,
    tenantId: input.tenantId ?? null,
    captureIntent: input.captureIntent ?? null,
    hasIdempotencyKey: Boolean(input.idempotencyKey),
  });
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const conversation = await getConversationById(input.conversationId, input.userId);
  if (!conversation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  }

  const scope = buildFinanceScope(conversation, input.userId, input.tenantId);
  const rateLimitResult = await Promise.all([
    checkRateLimit(`finance_ocr:burst:${scope.tenantId}:${scope.ownerUserId}`, FINANCE_OCR_BURST_LIMIT, 60),
    checkRateLimit(`finance_ocr:daily:${scope.tenantId}:${scope.ownerUserId}`, FINANCE_OCR_DAILY_LIMIT, 86_400),
  ]);
  if (rateLimitResult.some((result) => !result.allowed)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Finance OCR intake is temporarily throttled",
    });
  }

  const libraryItem = await getLibraryItemById(input.libraryItemId, {
    userId: input.userId,
    tenantId: scope.tenantId,
  });

  if (!libraryItem) {
    debugLog("finance_ocr", "ingest library item missing", {
      traceId,
      conversationId: input.conversationId,
      libraryItemId: input.libraryItemId,
    });
    throw new TRPCError({ code: "NOT_FOUND", message: "Library item not found" });
  }

  await ensureLibraryItemMatchesScope(libraryItem, scope);
  const metadata = (libraryItem.metadata ?? {}) as Record<string, unknown>;
  const fileType = ensureAllowedFinanceMime(normalizeFinanceMimeType(
    metadata.file_type ?? metadata.fileType ?? metadata.mime_type ?? metadata.mimeType,
  ));
  const fileName = typeof metadata.file_name === "string" && metadata.file_name.trim()
    ? metadata.file_name.trim()
    : libraryItem.title;
  const ocrFileClass = classifyOcrFileClass({
    mimeType: fileType,
    fileName,
  });
  await enforceFinanceOcrRequestBudget(scope, libraryItem, fileType);
  const featureFlags = await getTenantFeatureFlags(scope.tenantId);
  const externalProcessingAllowed = featureFlags.documentOcrExternalProcessing;
  const captureIntent = normalizeCaptureIntent(
    input.captureIntent
    ?? (typeof metadata.finance_capture_intent === "string" ? metadata.finance_capture_intent : null)
    ?? (typeof metadata.capture_intent === "string" ? metadata.capture_intent : null)
    ?? (typeof metadata.document_role === "string" ? metadata.document_role : null),
  );
  const analysisProfile = typeof metadata.analysis_profile === "string"
    ? metadata.analysis_profile
    : typeof metadata.upload_analysis_profile === "string"
      ? metadata.upload_analysis_profile
      : null;
  const isUnifiedSlipParser = analysisProfile === "finance_payin_llm_parser" && captureIntent === "transfer_slip";
  let directOcrText = isUnifiedSlipParser
    ? extractUnifiedPayinSlipText(metadata) ?? extractLibraryText(metadata)
    : extractLibraryText(metadata);
  const hasUnifiedResult = Boolean(metadata.unified_payin_slip_result || metadata.finance_unified_payin_slip_result);
  const hasUnifiedSummary = Boolean(metadata.unified_payin_slip_summary || metadata.finance_unified_payin_slip_summary);
  if (isUnifiedSlipParser) {
    recordFinanceOcrDebugStep("finance_ingest_unified_parser_selected", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      analysisProfile,
      hasUnifiedResult,
      hasUnifiedSummary,
      unifiedResultKeys: metadata.unified_payin_slip_result && typeof metadata.unified_payin_slip_result === "object"
        ? Object.keys(metadata.unified_payin_slip_result as Record<string, unknown>).slice(0, 20)
        : [],
      directTextLength: directOcrText?.length ?? 0,
      directTextPreview: directOcrText?.slice(0, 240) ?? null,
    });
  }
  debugLog("finance_ocr", "ingest metadata inspected", {
    traceId,
    debugTraceId,
    libraryItemId: libraryItem.id,
    fileType,
    ocrFileClass,
    analysisProfile,
    captureIntent,
    hasDirectOcrText: Boolean(directOcrText),
    directTextLength: directOcrText?.length ?? 0,
    metadataKeys: Object.keys(metadata).slice(0, 20),
  });
  recordFinanceOcrDebugStep("finance_ingest_metadata_inspected", {
    traceId: debugTraceId ?? traceId,
    traceIdInternal: traceId,
    libraryItemId: libraryItem.id,
    fileType,
    ocrFileClass,
    analysisProfile,
    captureIntent,
    hasDirectOcrText: Boolean(directOcrText),
    directTextLength: directOcrText?.length ?? 0,
    metadataKeys: Object.keys(metadata).slice(0, 20),
  });
  if (!directOcrText && !externalProcessingAllowed && !isUnifiedSlipParser) {
    debugLog("finance_ocr", "ingest external processing disabled but continuing with source re-extraction", {
      traceId,
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
    });
    recordFinanceOcrDebugStep("finance_ingest_external_processing_disabled", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
    });
  }
  const shouldAttemptUnifiedReextract = isUnifiedSlipParser && !directOcrText && !hasUnifiedResult && !hasUnifiedSummary;
  const ocrFallback = (directOcrText || (isUnifiedSlipParser && !shouldAttemptUnifiedReextract))
    ? null
    : await reextractLibraryItemTextFromSource(
      libraryItem,
      fileType,
      captureIntent,
      analysisProfile,
      scope.tenantId,
      traceId,
      debugTraceId,
      true,
    );
  const mergedMetadata = ocrFallback?.metadata
    ? { ...metadata, ...ocrFallback.metadata }
    : metadata;
  if (!directOcrText && isUnifiedSlipParser) {
    directOcrText = extractUnifiedPayinSlipText(mergedMetadata) ?? extractLibraryText(mergedMetadata);
  }
  const unifiedSyntheticText = isUnifiedSlipParser
    ? "สรุปรายการสลิปโอนเงิน\nไม่พบข้อความจากสลิป"
    : null;
  const ocrText = directOcrText ?? ocrFallback?.text ?? unifiedSyntheticText ?? null;
  const ocrSource = directOcrText
    ? "library_metadata"
    : ocrFallback?.text
      ? "storage_fallback"
      : isUnifiedSlipParser
        ? "unified_parser_metadata"
        : null;
  if (isUnifiedSlipParser) {
    recordFinanceOcrDebugStep("finance_ingest_unified_parser_text_resolved", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      analysisProfile,
      ocrSource,
      ocrTextLength: ocrText?.length ?? 0,
      ocrTextPreview: ocrText?.slice(0, 240) ?? null,
      usedFallback: Boolean(ocrFallback?.text),
      usedSyntheticText: Boolean(!directOcrText && isUnifiedSlipParser && unifiedSyntheticText),
    });
  }
  if (ocrFallback) {
    debugLog("finance_ocr", "ingest fallback resolved", {
      traceId,
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      ocrFileClass,
      captureIntent,
      fallbackExtractor: ocrFallback.extractor,
      fallbackTextLength: ocrFallback.text?.length ?? 0,
      fallbackWarningCount: ocrFallback.warnings.length,
    });
    recordFinanceOcrDebugStep("finance_ingest_fallback_resolved", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      fileType,
      ocrFileClass,
      captureIntent,
      fallbackExtractor: ocrFallback.extractor,
      fallbackTextLength: ocrFallback.text?.length ?? 0,
      fallbackWarningCount: ocrFallback.warnings.length,
    });
  }
  if (!ocrText) {
      debugLog("finance_ocr", "ingest no ocr text", {
        traceId,
        debugTraceId,
        libraryItemId: libraryItem.id,
        fileType,
        captureIntent,
        ocrSource,
        fallbackWarnings: ocrFallback?.warnings ?? [],
      });
      recordFinanceOcrDebugStep("finance_ingest_no_ocr_text", {
        traceId: debugTraceId ?? traceId,
        traceIdInternal: traceId,
        libraryItemId: libraryItem.id,
        fileType,
        captureIntent,
        ocrSource,
        fallbackWarnings: ocrFallback?.warnings ?? [],
      });
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Finance OCR could not extract text from this upload. Try a clearer photo, a PDF, or upload the receipt / transfer slip again.",
      });
  }

  const sourceHash = typeof metadata.content_checksum_sha256 === "string"
    ? metadata.content_checksum_sha256
    : typeof metadata.checksumSha256 === "string"
      ? metadata.checksumSha256
      : typeof metadata.file_hash === "string"
        ? metadata.file_hash
        : null;
  const documentOccurredAt = extractDocumentOccurredAtIso(ocrText);
  const documentRole = captureIntent ?? "receipt";

  const idempotencyKey = input.idempotencyKey ?? `finance-document:${scope.tenantId}:${scope.projectId}:${libraryItem.id}`;
  auditLogger.log({
    eventType: "finance_document_ocr_started",
    userId: input.userId,
    tenantId: scope.tenantId,
        metadata: {
          conversationId: input.conversationId,
          libraryItemId: libraryItem.id,
          projectId: scope.projectId,
          idempotencyKey,
          mimeType: fileType,
          ocrFileClass,
          textSource: ocrSource,
        },
      });

  try {
    const existingExtraction = await selectExistingExtraction(db, {
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      idempotencyKey,
    });

    if (existingExtraction) {
      debugLog("finance_ocr", "ingest existing extraction reused", {
        traceId,
        debugTraceId,
        libraryItemId: libraryItem.id,
        extractionId: existingExtraction.id,
        documentOccurredAt,
        captureIntent,
      });
      recordFinanceOcrDebugStep("finance_ingest_existing_extraction_reused", {
        traceId: debugTraceId ?? traceId,
        traceIdInternal: traceId,
        libraryItemId: libraryItem.id,
        extractionId: existingExtraction.id,
        documentOccurredAt,
        captureIntent,
      });
      const draft = await parseDocumentToDraft({
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: scope.tenantId,
        documentExtractionId: existingExtraction.id,
        ...(input.counterpartyName ? { counterpartyName: input.counterpartyName } : {}),
        idempotencyKey,
      });

      auditLogger.log({
        eventType: "finance_document_ocr_completed",
        userId: input.userId,
        tenantId: scope.tenantId,
        metadata: {
          conversationId: input.conversationId,
          libraryItemId: libraryItem.id,
          projectId: scope.projectId,
          extractionId: existingExtraction.id,
          draftId: draft.id,
          reusedExistingExtraction: true,
        },
      });

      return {
        extraction: existingExtraction,
        draft,
        libraryItem,
      };
    }

    if (ocrFallback && isOcrExtractor(ocrFallback.extractor)) {
      const ocrSettings = await getDocumentOcrSettings();
      const ocrMetadata = {
        ...(metadata ?? {}),
        ...(ocrFallback.metadata ?? {}),
      } as Record<string, unknown>;
      const fileClass = classifyOcrFileClass({
        mimeType: fileType,
        fileName: typeof metadata.file_name === "string" ? metadata.file_name : libraryItem.title,
      });
      const ocrProvider = resolveOcrProvider(ocrMetadata, ocrFallback.extractor);
      const creditsPerUnit = getDocumentOcrCreditsPerUnit({
        settings: ocrSettings,
        providerId: ocrProvider,
        fileClass,
      });
      if (creditsPerUnit > 0) {
        const pageCount = resolveOcrPageCount(ocrMetadata, fileType);
        const amount = calculateOcrCredits(pageCount, creditsPerUnit);
        if (amount > 0) {
          const hasCredits = await hasEnoughCredits(scope.ownerUserId, amount);
          if (!hasCredits) {
            throw new Error(`Insufficient credits. Required: ${amount}`);
          }
          const ocrFileName = typeof metadata.file_name === "string" && metadata.file_name.trim()
            ? metadata.file_name.trim()
            : libraryItem.title;
          const billingUnit = fileClass === "pdf" ? "page" : "image";
          const unitCount = fileClass === "pdf" ? pageCount : 1;
          await deductCredits({
            userId: scope.ownerUserId,
            amount,
            tenantId: scope.tenantId,
            sourceType: "other",
            description: `OCR (${ocrProvider || "document_ocr"}): ${ocrFileName} · ${unitCount} ${billingUnit}${unitCount === 1 ? "" : "s"}`,
            idempotencyKey: `ocr:finance:${idempotencyKey}`,
            metadata: {
              service: "finance.ocr",
              source: "finance_ocr",
              conversationId: input.conversationId,
              libraryItemId: libraryItem.id,
              projectId: scope.projectId,
              fileName: ocrFileName,
              fileType,
              fileClass,
              fileSizeBytes: extractNumericMetadata(metadata, [
                "file_size_bytes",
                "fileSizeBytes",
                "size_bytes",
              ]),
              pageCount,
              billingUnit,
              creditsPerUnit,
              ocrProvider,
              extractor: ocrFallback.extractor,
              traceId,
            },
          });
        }
      }
    }

    debugLog("finance_ocr", "ingest draft build start", {
      traceId,
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      documentOccurredAt,
      ocrSource,
      ocrTextLength: ocrText.length,
    });
    recordFinanceOcrDebugStep("finance_ingest_draft_build_start", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      documentOccurredAt,
      ocrSource,
      ocrTextLength: ocrText.length,
    });
    let extracted: ReturnType<typeof buildFinanceStructuredDraftFromText>;
    try {
      const sourceFileName = typeof metadata.file_name === "string" && metadata.file_name.trim()
        ? metadata.file_name.trim()
        : libraryItem.title;
      extracted = await extractFinanceStructuredDraftFromOcrText({
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: scope.tenantId,
        text: ocrText,
        typeHint: captureIntent === "transfer_slip"
          ? "transfer"
          : captureIntent === "receipt"
            ? "expense"
            : null,
        categoryHint: null,
        counterpartyHint: input.counterpartyName ?? null,
        occurredAt: documentOccurredAt,
        captureIntent,
        sourceFileName,
        sourceUrl: typeof libraryItem.sourceUrl === "string" ? libraryItem.sourceUrl : null,
        sourceMessageId: null,
        paymentMethodKind: null,
        paymentDirection: null,
        paymentSourceAccountId: null,
        paymentDestinationAccountId: null,
        paymentSourceLabel: null,
        paymentDestinationLabel: null,
        paymentSourceInstitutionName: null,
        paymentDestinationInstitutionName: null,
        paymentInstitutionName: null,
        paymentAccountNickname: null,
        paymentAccountLast4: null,
        paymentAccountMaskedIdentifier: null,
        paymentInstrumentConfidence: null,
        model: input.model,
        debugTraceId: debugTraceId ?? traceId,
      });
    } catch (error) {
      debugLog("finance_ocr", "ingest llm extract failed", {
        traceId,
        debugTraceId,
        libraryItemId: libraryItem.id,
        fileType,
        captureIntent,
        documentOccurredAt,
        ocrSource,
        ocrTextLength: ocrText.length,
        error: error instanceof Error ? error.message : String(error),
      });
      recordFinanceOcrDebugStep("finance_ingest_llm_extract_failed", {
        traceId: debugTraceId ?? traceId,
        traceIdInternal: traceId,
        libraryItemId: libraryItem.id,
        fileType,
        captureIntent,
        documentOccurredAt,
        ocrSource,
        ocrTextLength: ocrText.length,
        error: error instanceof Error ? error.message : String(error),
      });
      extracted = buildFinanceStructuredDraftFromText({
        text: ocrText,
        typeHint: captureIntent === "transfer_slip"
          ? "transfer"
          : captureIntent === "receipt"
            ? "expense"
            : null,
        categoryHint: null,
        counterpartyHint: input.counterpartyName ?? null,
        occurredAt: documentOccurredAt,
        captureIntent,
      });
      extracted = await applyPinnedMerchantPresetsToDraftAsync(extracted, ocrText);
    }
    debugLog("finance_ocr", "ingest draft built", {
      traceId,
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      documentOccurredAt,
      ocrSource,
      ocrTextLength: ocrText.length,
      type: extracted.type,
      amountMinor: extracted.amountMinor,
      currency: extracted.currency,
      needsClarification: extracted.needsClarification,
      missingFields: extracted.missingFields,
    });
    recordFinanceOcrDebugStep("finance_ingest_draft_built", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      documentOccurredAt,
      ocrSource,
      ocrTextLength: ocrText.length,
      type: extracted.type,
      amountMinor: extracted.amountMinor,
      currency: extracted.currency,
      needsClarification: extracted.needsClarification,
      missingFields: extracted.missingFields,
    });

    const [extraction] = await db
      .insert(documentExtractions)
      .values({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        ownerUserId: scope.ownerUserId,
        libraryItemId: libraryItem.id,
        source: "ocr_document",
        idempotencyKey,
    sourceHash,
        ocrProvider: String(
          metadata.ocr_provider
          ?? metadata.ocrProvider
          ?? metadata.provider
          ?? metadata.extractor
          ?? metadata.extraction_method
          ?? "library_upload_pipeline",
        ),
        ocrText,
        ocrJson: {
          source: "library_upload_pipeline",
          file_name: metadata.file_name ?? libraryItem.title,
          file_type: fileType,
          upload_pipeline: metadata.upload_pipeline ?? null,
          document_occurred_at: documentOccurredAt,
          capture_intent: captureIntent,
          document_role: documentRole,
          text_source: ocrSource,
          ocr_provider: metadata.ocr_provider ?? metadata.ocrProvider ?? metadata.provider ?? null,
          ocr_provider_request_id: metadata.provider_request_id ?? metadata.providerRequestId ?? null,
          ocr_model_version: metadata.model_version ?? metadata.modelVersion ?? null,
          fallback_warnings: ocrFallback?.warnings ?? [],
          fallback_extractor: ocrFallback?.extractor ?? null,
        },
        extractedJson: {
          ...extracted,
          occurredAt: documentOccurredAt ?? extracted.occurredAt,
          documentOccurredAt,
          documentRole,
          sourceLibraryItemId: libraryItem.id,
        },
        confidenceJson: {
          confidence: extracted.confidence,
          needsClarification: extracted.needsClarification,
          missingFields: extracted.missingFields,
        },
        mimeType: fileType,
        fileHash: String(sourceHash ?? libraryItem.id),
        pageCount: Number(metadata.page_count ?? metadata.pageCount ?? 1),
        sourceMessageId: null,
        allowedScopes: scope.allowedScopes,
      })
      .returning();

    if (!extraction) {
      throw new Error("Failed to persist finance document extraction");
    }

    const draft = await parseDocumentToDraft({
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: scope.tenantId,
      documentExtractionId: extraction.id,
      ...(input.counterpartyName ? { counterpartyName: input.counterpartyName } : {}),
      idempotencyKey,
    });
    debugLog("finance_ocr", "ingest completed", {
      traceId,
      debugTraceId,
      libraryItemId: libraryItem.id,
      extractionId: extraction.id,
      draftId: draft.id,
      ocrSource,
      ocrTextLength: ocrText.length,
      documentOccurredAt,
      captureIntent,
      ocrFileClass,
    });
    recordFinanceOcrDebugStep("finance_ingest_completed", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      extractionId: extraction.id,
      draftId: draft.id,
      ocrSource,
      ocrTextLength: ocrText.length,
      documentOccurredAt,
      captureIntent,
      ocrFileClass,
    });

    auditLogger.log({
      eventType: "finance_document_ocr_completed",
      userId: input.userId,
      tenantId: scope.tenantId,
      metadata: {
        conversationId: input.conversationId,
          libraryItemId: libraryItem.id,
          projectId: scope.projectId,
          extractionId: extraction.id,
          draftId: draft.id,
          reusedExistingExtraction: false,
          ocrTextLength: ocrText.length,
          textSource: ocrSource,
          ocrFileClass,
        },
      });

      return {
        extraction,
        draft,
        libraryItem,
      };
  } catch (error) {
    debugLog("finance_ocr", "ingest failed", {
      traceId,
      debugTraceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      ocrSource,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    recordFinanceOcrDebugStep("finance_ingest_failed", {
      traceId: debugTraceId ?? traceId,
      traceIdInternal: traceId,
      libraryItemId: libraryItem.id,
      fileType,
      captureIntent,
      ocrSource,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    auditLogger.log({
      eventType: "finance_document_ocr_failed",
      userId: input.userId,
      tenantId: scope.tenantId,
      metadata: {
        conversationId: input.conversationId,
        libraryItemId: libraryItem.id,
        projectId: scope.projectId,
        idempotencyKey,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
