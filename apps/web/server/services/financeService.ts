import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../db";
import {
  conversations,
  documentExtractions,
  financeCounterparties,
  financeCounterpartyAliases,
  financeDrafts,
  financePaymentAccountAliases,
  financePaymentAccounts,
  financePaymentInstitutionAliases,
  financePaymentInstitutions,
  financeRecurringRules,
  financeTransactionDocuments,
  financeTransactions,
  libraryItems,
  type Conversation,
  type FinanceCounterparty,
  type FinanceDraft,
  type InsertFinanceDraft,
  type InsertFinancePaymentAccount,
  type InsertFinancePaymentAccountAlias,
  type InsertFinancePaymentInstitution,
  type InsertFinancePaymentInstitutionAlias,
  type FinancePaymentAccount,
  type FinancePaymentInstitution,
  type InsertFinanceRecurringRule,
  type FinanceRecurringRule,
  type FinanceTransaction,
} from "../../drizzle/schema";
import {
  financeDocumentRoleSchema,
  financeDraftStatusSchema,
  financeCounterpartySuggestionSchema,
  financeMonthlySummarySchema,
  financePaymentDirectionSchema,
  financePaymentInstrumentKindSchema,
  financePaymentInstitutionKindSchema,
  financeRecurringRuleStatusSchema,
  financeStructuredDraftSchema,
  financeTransactionStatusSchema,
  financeTransactionTypeSchema,
  type FinanceEvidenceItem,
  type FinanceCounterpartySuggestion,
  type FinanceStructuredDraft,
  type FinanceMonthlySummary,
} from "../../shared/finance";
import { callLLMStructured } from "./callLLMStructured";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { getConversationById, isPersonalProjectId } from "./chatService";
import { resolveTenantIdVarchar } from "./tenantContext";
import { auditLogger } from "./auditLogger";
import { getLibraryItemById } from "./libraryService";
import { selectLlmModelCandidates } from "./intelligentModelSelector";
import {
  applyFinanceSlipMappingPresetsToDraft,
  applyFinanceSlipMappingPresetsToDraftAsync,
  getFinanceSlipMappingPresetsSnapshot,
} from "./financeSlipPresetSettings";
import {
  applyPinnedMerchantPresetsToDraft,
  applyPinnedMerchantPresetsToDraftAsync,
  getPinnedMerchantPresetsSnapshot,
} from "./financeMerchantPresetSettings";
import { getFinanceOcrDebugTraceId, recordFinanceOcrDebugStep } from "./financeOcrDebug";

export { applyPinnedMerchantPresetsToDraftAsync } from "./financeMerchantPresetSettings";

const personalScopeToken = (userId: number) => `user:${userId}`;

const draftPatchSchema = financeStructuredDraftSchema
  .partial()
  .omit({
    sourceMessageId: true,
    sourceLibraryItemId: true,
    recurringRuleId: true,
  })
  .extend({
    clarificationPrompt: z.string().nullable().optional(),
  })
  .strict();

const recurringScheduleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365).default(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

const MAX_SEMANTIC_DUPLICATE_AMOUNT_MINOR = 2_147_483_647;
const MAX_BARE_AMOUNT_MAJOR = 10_000_000_000;

const transactionListFiltersSchema = z.object({
  status: financeTransactionStatusSchema.optional(),
  type: financeTransactionTypeSchema.optional(),
  query: z.string().min(1).max(255).optional(),
  amountMinMinor: z.number().int().nonnegative().optional(),
  amountMaxMinor: z.number().int().nonnegative().optional(),
  categoryCode: z.string().min(1).max(64).optional(),
  counterparty: z.string().min(1).max(255).optional(),
  merchant: z.string().min(1).max(255).optional(),
  paymentMethodKind: financePaymentInstrumentKindSchema.optional(),
  paymentDirection: financePaymentDirectionSchema.optional(),
  paymentAccountId: z.number().int().positive().optional(),
  paymentInstitutionId: z.number().int().positive().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export interface FinanceScope {
  tenantId: string;
  ownerUserId: number;
  projectId: string;
  conversationId: number;
  personal: boolean;
  allowedScopes: string[];
}

export interface FinanceDraftRecord extends Omit<FinanceDraft, "payloadJson" | "allowedScopes"> {
  payloadJson: Record<string, unknown> & { version?: number };
  allowedScopes: string[];
  version: number;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  categoryCode: string;
  documentRole: string | null;
  counterpartyId: number | null;
  counterpartyName: string | null;
  merchantName: string | null;
  note: string | null;
  slipReference: string | null;
  merchantId: string | null;
  paymentFeeMinor: number | null;
  paymentMethodKind: FinancePaymentInstrumentKind | null;
  paymentDirection: FinancePaymentDirection | null;
  paymentSourceAccountId: number | null;
  paymentDestinationAccountId: number | null;
  paymentSourceLabel: string | null;
  paymentDestinationLabel: string | null;
  paymentSourceName: string | null;
  paymentDestinationName: string | null;
  paymentSourceInstitutionName: string | null;
  paymentDestinationInstitutionName: string | null;
  paymentInstitutionName: string | null;
  paymentAccountNickname: string | null;
  paymentAccountLast4: string | null;
  paymentAccountMaskedIdentifier: string | null;
  sourceUrl: string | null;
  sourceFileName: string | null;
  paymentInstrumentConfidence: number | null;
}

export interface FinanceSummaryResult extends FinanceMonthlySummary {
  granularity: "day" | "month";
}

export interface FinanceLinkedDocumentRecord {
  id: number;
  transactionId: number;
  libraryItemId: number;
  role: string;
  note: string | null;
  sourceExtractionId: number | null;
  createdAt: Date;
  updatedAt: Date;
  libraryItem: {
    id: number;
    title: string;
    source: string;
    metadata: Record<string, unknown>;
    projectId: string | null;
  } | null;
  extraction: {
    id: number;
    ocrProvider: string;
    mimeType: string;
    fileHash: string;
    pageCount: number;
  } | null;
}

export interface ParseTextToDraftInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  text: string;
  categoryHint?: string | null;
  counterpartyName?: string | null;
  typeHint?: FinanceTransaction["type"] | null;
  occurredAt?: string | null;
  paymentMethodKind?: FinancePaymentInstrumentKind | null;
  paymentDirection?: FinancePaymentDirection | null;
  paymentSourceAccountId?: number | null;
  paymentDestinationAccountId?: number | null;
  paymentSourceLabel?: string | null;
  paymentDestinationLabel?: string | null;
  paymentSourceName?: string | null;
  paymentDestinationName?: string | null;
  paymentSourceInstitutionName?: string | null;
  paymentDestinationInstitutionName?: string | null;
  paymentInstitutionName?: string | null;
  paymentAccountNickname?: string | null;
  paymentAccountLast4?: string | null;
  paymentAccountMaskedIdentifier?: string | null;
  sourceUrl?: string | null;
  sourceFileName?: string | null;
  paymentInstrumentConfidence?: number | null;
  slipReference?: string | null;
  merchantId?: string | null;
  paymentFeeMinor?: number | null;
  sourceMessageId?: number | null;
  model?: string;
  idempotencyKey?: string;
}

export interface ExtractFinanceStructuredDraftFromOcrTextInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  text: string;
  occurredAt?: string | null;
  categoryHint?: string | null;
  counterpartyHint?: string | null;
  typeHint?: FinanceTransaction["type"] | null;
  captureIntent?: "receipt" | "transfer_slip" | "statement" | null;
  sourceFileName?: string | null;
  sourceUrl?: string | null;
  sourceMessageId?: number | null;
  paymentMethodKind?: FinancePaymentInstrumentKind | null;
  paymentDirection?: FinancePaymentDirection | null;
  paymentSourceAccountId?: number | null;
  paymentDestinationAccountId?: number | null;
  paymentSourceLabel?: string | null;
  paymentDestinationLabel?: string | null;
  paymentSourceName?: string | null;
  paymentDestinationName?: string | null;
  paymentSourceInstitutionName?: string | null;
  paymentDestinationInstitutionName?: string | null;
  paymentInstitutionName?: string | null;
  paymentAccountNickname?: string | null;
  paymentAccountLast4?: string | null;
  paymentAccountMaskedIdentifier?: string | null;
  paymentInstrumentConfidence?: number | null;
  slipReference?: string | null;
  merchantId?: string | null;
  paymentFeeMinor?: number | null;
  model?: string;
  modelCandidates?: string[] | null;
  debugTraceId?: string | null;
}

export interface ParseDocumentToDraftInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  documentExtractionId: number;
  counterpartyName?: string | null;
  idempotencyKey?: string;
}

export interface UpdateDraftInput {
  draftId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
  expectedVersion: number;
  patch: z.infer<typeof draftPatchSchema>;
}

export interface ConfirmDraftInput {
  draftId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface CancelDraftInput {
  draftId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
  reason?: string | null;
}

export interface RestoreDraftInput {
  draftId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface VoidTransactionInput {
  transactionId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
  reason?: string | null;
}

export interface ListTransactionsInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  status?: FinanceTransaction["status"] | null;
  type?: FinanceTransaction["type"] | null;
  query?: string;
  amountMinMinor?: number;
  amountMaxMinor?: number;
  categoryCode?: string;
  counterparty?: string;
  merchant?: string;
  paymentMethodKind?: FinancePaymentInstrumentKind | null;
  paymentDirection?: FinancePaymentDirection | null;
  paymentAccountId?: number | null;
  paymentInstitutionId?: number | null;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ListDraftsInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  status?: FinanceDraft["status"] | null;
  limit?: number;
  offset?: number;
}

export interface ListRecurringRulesInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  status?: FinanceRecurringRule["status"] | null;
  limit?: number;
  offset?: number;
}

export interface CreateRecurringRuleInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  type: FinanceTransaction["type"];
  amountMinor: number;
  currency?: string;
  categoryCode: string;
  counterpartyName?: string | null;
  merchantName?: string | null;
  note?: string | null;
  rrule: z.infer<typeof recurringScheduleSchema> | string;
  timezone?: string;
  startDate?: Date;
  endDate?: Date | null;
  autoConfirm?: boolean;
  sourceMessageId?: number | null;
  sourceLibraryItemId?: number | null;
  idempotencyKey?: string;
}

type FinanceDb = ReturnType<typeof getDb>;
type FinanceDbExecutor = Pick<FinanceDb, "select" | "insert" | "update">;
type FinancePaymentInstitutionKind = "bank" | "issuer" | "other";
type FinancePaymentInstrumentKind = "bank_account" | "credit_card" | "cash" | "unknown";
type FinancePaymentDirection = "outbound" | "inbound" | "both" | "unknown";
type FinanceSemanticDuplicateSubject = {
  type: FinanceTransaction["type"];
  amountMinor: number;
  currency: string;
  occurredAt: string;
  counterpartyName?: string | null;
  merchantName?: string | null;
  slipReference?: string | null;
  merchantId?: string | null;
  paymentFeeMinor?: number | null;
  paymentMethodKind?: FinancePaymentInstrumentKind | null;
  paymentDirection?: FinancePaymentDirection | null;
  paymentSourceAccountId?: number | null;
  paymentDestinationAccountId?: number | null;
  paymentSourceName?: string | null;
  paymentDestinationName?: string | null;
};
type FinanceSemanticDuplicateMatchSourceKind = "exact_draft" | "exact_transaction" | "candidate_draft" | "candidate_transaction";
export interface FinanceSemanticDuplicateWarningRecord {
  sourceKind: FinanceSemanticDuplicateMatchSourceKind;
  sourceLabel: string;
  draftId: number;
  transactionId: number | null;
  type: FinanceTransaction["type"];
  amountMinor: number;
  currency: string;
  occurredAt: string;
  counterpartyName: string | null;
  merchantName: string | null;
  note: string | null;
  paymentMethodKind: FinancePaymentInstrumentKind | null;
  paymentDirection: FinancePaymentDirection | null;
  paymentSourceAccountId: number | null;
  paymentDestinationAccountId: number | null;
  paymentSourceLabel: string | null;
  paymentDestinationLabel: string | null;
  paymentSourceName: string | null;
  paymentDestinationName: string | null;
  paymentSourceInstitutionName: string | null;
  paymentDestinationInstitutionName: string | null;
  paymentInstitutionName: string | null;
  paymentAccountNickname: string | null;
  paymentAccountLast4: string | null;
  paymentAccountMaskedIdentifier: string | null;
  slipReference: string | null;
  merchantId: string | null;
  paymentFeeMinor: number | null;
}
type FinanceSemanticDuplicateMatch = {
  sourceKind: FinanceSemanticDuplicateMatchSourceKind;
  draft: FinanceDraftRecord;
  transaction: FinanceTransaction | null;
};
type FinanceDraftPayload = FinanceStructuredDraft & {
  version?: number;
  sourceKind?: string;
  documentExtractionId?: number | null;
  documentRole?: FinanceStructuredDraft["documentRole"];
  counterpartyId?: number | null;
  paymentSourceAccountId?: number | null;
  paymentDestinationAccountId?: number | null;
  paymentMethodKind?: FinanceTransaction["paymentMethodKind"] | null;
  paymentDirection?: FinanceTransaction["paymentDirection"] | null;
  paymentInstrumentConfidence?: number | string | null;
  slipReference?: string | null;
  merchantId?: string | null;
  paymentFeeMinor?: number | null;
};

export interface PauseRecurringRuleInput {
  recurringRuleId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface ResumeRecurringRuleInput {
  recurringRuleId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface ListLinkedDocumentsInput {
  transactionId: number;
  userId: number;
  tenantId?: string | null;
  conversationId: number;
}

export interface ListCounterpartiesInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  query?: string | null;
  limit?: number;
}

export interface ListPaymentInstitutionsInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  query?: string | null;
  kind?: FinancePaymentInstitutionKind | null;
  limit?: number;
}

export interface ListPaymentAccountsInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  query?: string | null;
  kind?: FinancePaymentInstrumentKind | null;
  paymentInstitutionId?: number | null;
  limit?: number;
  includeArchived?: boolean;
}

export interface UpsertPaymentInstitutionInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  displayName: string;
  kind?: FinancePaymentInstitutionKind | null;
  aliases?: string[];
  idempotencyKey?: string;
}

export interface UpsertPaymentAccountInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  paymentInstitutionName?: string | null;
  paymentInstitutionKind?: FinancePaymentInstitutionKind | null;
  paymentInstitutionId?: number | null;
  kind: FinancePaymentInstrumentKind;
  nickname: string;
  last4?: string | null;
  maskedIdentifier?: string | null;
  aliases?: string[];
  isPrimary?: boolean;
  archivedAt?: Date | null;
  idempotencyKey?: string;
}

export interface ArchivePaymentAccountInput {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
  paymentAccountId: number;
}

export interface FinanceCounterpartyRecord {
  id: number;
  tenantId: string;
  projectId: string;
  ownerUserId: number;
  displayName: string;
  normalizedName: string;
  usageCount: number;
  lastSeenAt: Date | null;
  aliases: string[];
  allowedScopes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancePaymentInstitutionRecord {
  id: number;
  tenantId: string;
  projectId: string;
  ownerUserId: number;
  kind: FinancePaymentInstitutionKind;
  displayName: string;
  normalizedName: string;
  usageCount: number;
  lastSeenAt: Date | null;
  aliases: string[];
  allowedScopes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancePaymentAccountRecord {
  id: number;
  tenantId: string;
  projectId: string;
  ownerUserId: number;
  paymentInstitutionId: number;
  institutionName: string;
  institutionKind: FinancePaymentInstitutionKind;
  kind: FinancePaymentInstrumentKind;
  nickname: string;
  normalizedNickname: string;
  last4: string | null;
  maskedIdentifier: string | null;
  usageCount: number;
  lastSeenAt: Date | null;
  isPrimary: boolean;
  archivedAt: Date | null;
  aliases: string[];
  allowedScopes: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancePaymentAccountSuggestion {
  id: number;
  displayLabel: string;
  nickname: string;
  institutionName: string;
  institutionKind: FinancePaymentInstitutionKind;
  kind: FinancePaymentInstrumentKind;
  last4: string | null;
  maskedIdentifier: string | null;
  usageCount: number;
  lastSeenAt: string | null;
  aliases: string[];
  isPrimary: boolean;
}

export interface RunRecurringRulesResult {
  scannedCount: number;
  draftsCreated: number;
  transactionsCreated: number;
  errors: number;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripFinanceOcrNoise(text: string, sourceFileName?: string | null): string {
  let cleaned = normalizeText(text);
  const fileName = normalizeText(sourceFileName ?? "");

  if (fileName) {
    const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fileNameStem = fileName.replace(/\.[^.]+$/, "");
    const escapedFileNameStem = fileNameStem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    cleaned = cleaned
      .replace(new RegExp(`\\b${escapedFileName}\\b`, "gi"), " ")
      .replace(new RegExp(`\\b${escapedFileNameStem}\\b`, "gi"), " ")
      .replace(new RegExp(`(?:ไฟล์|file(?:\\s*name)?|source file)\\s*[:#\\-]?\\s*${escapedFileName}`, "gi"), " ")
      .replace(new RegExp(`(?:ไฟล์|file(?:\\s*name)?|source file)\\s*[:#\\-]?\\s*${escapedFileNameStem}`, "gi"), " ");
  }

  cleaned = cleaned
    .replace(/\b(?:ไฟล์|file(?:\s*name)?|source file)\s*[:#\-]?\s*[^\n]+/gi, " ")
    .replace(/\b(?:โหมด|mode)\s*[:#\-]?\s*[^\n]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

function normalizeCounterpartyDisplayName(value: string): string {
  return normalizeText(value)
    .replace(/^[\s.,;:|/\\-]+|[\s.,;:|/\\-]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizeCounterpartyKey(value: string): string {
  const stripped = normalizeDigits(normalizeCounterpartyDisplayName(value))
    .toLowerCase()
    .replace(/[^0-9a-zก-๙]+/gi, " ")
    .replace(/\b(?:company|co|corp|corporation|inc|incorporated|ltd|limited|llc|plc|group|holdings?)\b/gi, " ")
    .replace(/\b(?:บริษัท|จำกัด|บจก\.?|บมจ\.?|มหาชน|หจก\.?|หจ\.?|คุณ|นาย|นางสาว|นาง|mr|mrs|ms|miss|dr|prof)\b/gi, " ");

  return stripped.replace(/\s+/g, " ").trim();
}

function buildCounterpartySearchKey(value: string): string {
  return normalizeCounterpartyKey(value);
}

function normalizePaymentInstitutionDisplayName(value: string): string {
  return normalizePaymentAccountNickname(value);
}

function normalizePaymentAccountNickname(value: string): string {
  return normalizeText(value)
    .replace(/^[\s.,;:|/\\-]+|[\s.,;:|/\\-]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalizePaymentAccountLast4(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = normalizeDigits(String(value)).replace(/\D+/g, "");
  if (digits.length === 0) {
    return null;
  }

  return digits.slice(-4).padStart(Math.min(4, digits.length), "0");
}

function normalizePaymentMaskedIdentifier(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = normalizeText(value);
  return trimmed.length > 0 ? trimmed : null;
}

function extractPaymentAccountLast4FromText(value: string): string | null {
  const normalized = normalizeDigits(normalizeText(value));
  if (!normalized) {
    return null;
  }

  const maskedSignals = /(บัญชี|account|acct|เลข(?:ที่)?บัญชี|masked|mask|••••|xxxx|x[-\s]*x|[*•·]{2,})/i.test(normalized);
  if (!maskedSignals) {
    return null;
  }

  const compactDigits = normalized.replace(/\D+/g, "");
  if (compactDigits.length === 0) {
    return null;
  }

  return compactDigits.slice(-4).padStart(Math.min(4, compactDigits.length), "0");
}

function buildPaymentInstrumentSearchKey(value: string): string {
  return normalizePaymentAccountNickname(value)
    .toLowerCase()
    .replace(/[^0-9a-zก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPaymentInstrumentDisplayLabel(account: Pick<FinancePaymentAccountRecord, "nickname" | "last4" | "institutionName" | "kind">): string {
  const nickname = account.nickname.trim();
  const institution = account.institutionName.trim();
  const parts = [nickname];
  if (institution) {
    parts.push(institution);
  }
  if (account.last4) {
    parts.push(`••••${account.last4}`);
  }
  if (account.kind === "credit_card") {
    parts.push("card");
  } else if (account.kind === "bank_account") {
    parts.push("account");
  }
  return parts.join(" · ");
}

function inferCounterpartyCandidateFromText(text: string, type: FinanceTransaction["type"]): string | null {
  const normalizedText = normalizeText(text);
  const patterns: Array<RegExp> = type === "income"
    ? [
        /(?:รับจาก|ได้เงินจาก|รับเงินจาก|received from|paid by|from)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
        /(?:salary from|income from)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
      ]
    : type === "transfer"
      ? [
          /(?:โอนให้|โอนไปให้|โอนไปยัง|transfer to|sent to|paid to|to|recipient|beneficiary|payee|ผู้รับเงิน|ชื่อผู้รับเงิน|ชื่อร้านค้า|ร้านค้า|merchant|vendor)\s*[:\-]?\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
        ]
      : [
          /(?:จ่ายให้|จ่ายแก่|จ่าย|โอนให้|ซื้อจาก|paid to|pay to|spent at)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
          /(?:ร้าน|shop at|merchant|vendor)\s+(.+?)(?=(?:\s+(?:[0-9][0-9.,]*|บาท|thb|usd|eur|jpy|฿|\$|€|¥)|\s*(?:เมื่อ|on|at|for|since|until)|[.,;]|$))/i,
        ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      const rawCandidate = normalizeCounterpartyDisplayName(match[1]);
      const referenceSplit = rawCandidate.split(/(?:หมายเลขอ้างอิง|เลขอ้างอิง|reference|ref)/i)[0]?.trim();
      const amountSplit = referenceSplit?.split(/(?:จำนวนเงิน|ยอดเงิน|amount|total)/i)[0]?.trim();
      const candidate = amountSplit?.trim() ?? "";
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

const THAI_DIGIT_MAP: Record<string, string> = {
  "๐": "0",
  "๑": "1",
  "๒": "2",
  "๓": "3",
  "๔": "4",
  "๕": "5",
  "๖": "6",
  "๗": "7",
  "๘": "8",
  "๙": "9",
};

function normalizeDigits(value: string): string {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGIT_MAP[digit] ?? digit);
}

function normalizeParsingText(value: string): string {
  return normalizeDigits(normalizeText(value)).toLowerCase();
}

function stripFinanceIntentPrefix(value: string): string {
  return normalizeText(
    normalizeDigits(value).replace(/^\s*(?:expense|income|transfer|รายจ่าย|รายรับ|โอนเงิน|โอน):\s*/i, ""),
  );
}

function inferFinanceTypeFromText(text: string, typeHint?: FinanceTransaction["type"] | null): FinanceTransaction["type"] {
  if (typeHint) {
    return typeHint;
  }

  const normalized = normalizeParsingText(text);
  if (
    normalized.includes("โอน")
    || normalized.includes("transfer")
    || normalized.includes("ย้ายเงิน")
    || normalized.includes("ส่งเงิน")
  ) {
    return "transfer";
  }

  if (
    normalized.includes("เงินเดือน")
    || normalized.includes("เงินเข้า")
    || normalized.includes("รับเงิน")
    || normalized.includes("รายรับ")
    || normalized.includes("income")
    || normalized.includes("salary")
    || normalized.includes("ได้เงิน")
  ) {
    return "income";
  }

  if (
    normalized.includes("จ่าย")
    || normalized.includes("ค่า")
    || normalized.includes("ซื้อ")
    || normalized.includes("ชำระ")
    || normalized.includes("expense")
    || normalized.includes("spent")
    || normalized.includes("pay")
    || normalized.includes("paid")
  ) {
    return "expense";
  }

  return "expense";
}

function inferCurrencyFromText(text: string): string {
  const normalized = normalizeParsingText(text);
  if (normalized.includes("usd") || normalized.includes("$")) return "USD";
  if (normalized.includes("eur") || normalized.includes("€")) return "EUR";
  if (normalized.includes("jpy") || normalized.includes("¥")) return "JPY";
  if (normalized.includes("บาท") || normalized.includes("฿") || normalized.includes("thb")) return "THB";
  return "THB";
}

function inferPaymentDirectionFromType(type: FinanceTransaction["type"]): FinancePaymentDirection {
  if (type === "income") {
    return "inbound";
  }
  if (type === "transfer") {
    return "both";
  }
  return "outbound";
}

function normalizeStructuredDraftMissingFields(draft: FinanceStructuredDraft): string[] {
  const missing = new Set((draft.missingFields ?? []).map((field) => String(field).trim()).filter(Boolean));
  if (draft.paymentDirection && draft.paymentDirection !== "unknown") {
    missing.delete("paymentDirection");
  }
  if (draft.paymentMethodKind && draft.paymentMethodKind !== "unknown") {
    missing.delete("paymentMethodKind");
  }
  if (draft.paymentSourceName || draft.paymentSourceLabel || draft.paymentSourceInstitutionName || draft.paymentSourceAccountId) {
    missing.delete("paymentSourceName");
    missing.delete("paymentSourceLabel");
    missing.delete("paymentSourceInstitutionName");
    missing.delete("paymentSourceAccountId");
  }
  if (draft.paymentDestinationName || draft.paymentDestinationLabel || draft.paymentDestinationInstitutionName || draft.paymentDestinationAccountId) {
    missing.delete("paymentDestinationName");
    missing.delete("paymentDestinationLabel");
    missing.delete("paymentDestinationInstitutionName");
    missing.delete("paymentDestinationAccountId");
  }
  return Array.from(missing);
}

function inferPaymentMethodKindFromText(text: string): FinancePaymentInstrumentKind {
  const normalized = normalizeParsingText(text);
  if (
    normalized.includes("card")
    || normalized.includes("credit")
    || normalized.includes("debit")
    || normalized.includes("visa")
    || normalized.includes("mastercard")
    || normalized.includes("amex")
    || normalized.includes("เครดิต")
  ) {
    return "credit_card";
  }
  if (
    normalized.includes("cash")
    || normalized.includes("เงินสด")
  ) {
    return "cash";
  }
  if (
    normalized.includes("bank")
    || normalized.includes("บัญชี")
    || normalized.includes("โอน")
    || normalized.includes("promptpay")
    || normalized.includes("พร้อมเพย์")
  ) {
    return "bank_account";
  }
  return "unknown";
}

const PAYMENT_INSTITUTION_PATTERNS: Array<{ name: string; patterns: RegExp[] }> = [
  {
    name: "Bangkok Bank",
    patterns: [/\bbbl\b/i, /\bbbk\b/i, /bangkok bank/i, /ธ\.?กรุงเทพ/i, /ธนาคารกรุงเทพ/i, /กรุงเทพ/i, /บัวหลวง/i, /bangkok\s*bank/i, /bangkokbank/i],
  },
  {
    name: "Siam Commercial Bank",
    patterns: [/\bscb\b/i, /scb\s*bank/i, /siam commercial bank/i, /ธ\.?ไทยพาณิชย์/i, /ธนาคารไทยพาณิชย์/i, /ไทยพาณิชย์/i, /สยามพาณิชย์/i, /scb\s*next/i, /scbnext/i],
  },
  {
    name: "Kasikornbank",
    patterns: [/\bkbank\b/i, /k\s*bank/i, /kasikorn(?:bank)?/i, /ธ\.?กสิกรไทย/i, /ธนาคารกสิกรไทย/i, /กสิกรไทย/i, /กสิกร/i, /ธนาคารกสิกร/i, /kbank thai/i, /kasikorn\s*bank/i],
  },
  {
    name: "Krungthai Bank",
    patterns: [/\bktb\b/i, /krungthai/i, /ธ\.?กรุงไทย/i, /ธนาคารกรุงไทย/i, /กรุงไทย/i, /ktb\s*netbank/i, /ktb\s*next/i, /ktbnext/i, /กรุงไทย\s*next/i],
  },
  {
    name: "Krungsri",
    patterns: [/krungsri/i, /krungsri\s*bank/i, /bay\b/i, /bank of ayudhya/i, /bank of ayutthaya/i, /ธ\.?กรุงศรี/i, /ธนาคารกรุงศรี/i, /กรุงศรี/i, /ธนาคารกรุงศรีอยุธยา/i, /อยุธยา/i],
  },
  {
    name: "TMBThanachart Bank",
    patterns: [/\bttb\b/i, /ttb\s*bank/i, /tmbthanachart/i, /thanachart/i, /ธ\.?ทหารไทยธนชาต/i, /ธนาคารทหารไทยธนชาต/i, /ทหารไทยธนชาต/i, /\btmb\b/i, /ธนาคารทหารไทย/i, /ธนชาต/i],
  },
  {
    name: "Government Savings Bank",
    patterns: [/\bgsb\b/i, /government savings bank/i, /ธ\.?ออมสิน/i, /ธนาคารออมสิน/i, /ออมสิน/i, /gsb\s*bank/i],
  },
  {
    name: "Bank for Agriculture and Agricultural Cooperatives",
    patterns: [/\bbaac\b/i, /bank for agriculture and agricultural cooperatives/i, /ธ\.?ก\.?ส\.?/i, /ธกส/i, /ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร/i, /ธนาคารเพื่อการเกษตร/i],
  },
  {
    name: "UOB",
    patterns: [/\buob\b/i, /uob\s*thai/i, /united overseas bank/i, /ยูโอบี/i, /ธ\.?ยูโอบี/i, /ธนาคารยูโอบี/i],
  },
  {
    name: "CIMB Thai Bank",
    patterns: [/\bcimb\b/i, /cimb thai/i, /cimb\s*thai\s*bank/i, /ซีไอเอ็มบี/i, /ธ\.?ซีไอเอ็มบี/i, /ธนาคารซีไอเอ็มบี/i],
  },
  {
    name: "Kiatnakin Phatra Bank",
    patterns: [/\bkkp\b/i, /kkp\s*bank/i, /kiatnakin/i, /kiatnakin\s*phatra/i, /เกียรตินาคิน/i, /เกียรตินาคินภัทร/i, /ธ\.?เกียรตินาคินภัทร/i],
  },
  {
    name: "Land and Houses Bank",
    patterns: [/\blhb\b/i, /lh\s*bank/i, /land and houses/i, /land and house/i, /ธ\.?แลนด์แอนด์เฮ้าส์/i, /ธนาคารแลนด์แอนด์เฮ้าส์/i, /แลนด์แอนด์เฮ้าส์/i],
  },
  {
    name: "Standard Chartered Bank",
    patterns: [/standard chartered/i, /\bscbth\b/i, /สแตนดาร์ดชาร์เตอร์ด/i, /ธ\.?สแตนดาร์ดชาร์เตอร์ด/i, /stan\s*chart/i, /stanchart/i, /standard\s*chartered\s*bank/i],
  },
  {
    name: "Tisco Bank",
    patterns: [/\btisco\b/i, /ทิสโก้/i, /ธ\.?ทิสโก้/i, /ธนาคารทิสโก้/i],
  },
];

function inferPaymentInstitutionNameFromText(text: string): string | null {
  const normalized = normalizeParsingText(text);
  let bestMatch: { name: string; index: number } | null = null;
  for (const entry of PAYMENT_INSTITUTION_PATTERNS) {
    for (const pattern of entry.patterns) {
      const index = normalized.search(pattern);
      if (index < 0) {
        continue;
      }
      if (!bestMatch || index < bestMatch.index) {
        bestMatch = { name: entry.name, index };
      }
      break;
    }
  }
  return bestMatch?.name ?? null;
}

function inferPaymentInstitutionNamesFromText(text: string): string[] {
  const normalized = normalizeParsingText(text);
  const matches = new Set<string>();
  for (const entry of PAYMENT_INSTITUTION_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      matches.add(entry.name);
    }
  }
  return Array.from(matches);
}

function buildPaymentAccountMaskedIdentifier(last4: string | null): string | null {
  if (!last4) {
    return null;
  }
  return `••••${last4}`;
}

function extractPaymentAccountLast4FromCandidate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeDigits(value);
  const clusters = Array.from(normalized.matchAll(/\d{4,}/g), (match) => match[0].replace(/\D+/g, ""));
  if (clusters.length === 0) {
    return extractPaymentAccountLast4FromText(value);
  }

  const candidate = clusters[0];
  if (!candidate) {
    return extractPaymentAccountLast4FromText(value);
  }

  return candidate.slice(-4).padStart(Math.min(4, candidate.length), "0");
}

function extractPaymentAccountCandidate(text: string, role: "source" | "destination"): string | null {
  const normalized = normalizeDigits(text).replace(/\s+/g, " ").trim();
  const markers = role === "source"
    ? [
        "โอนจาก",
        "จากบัญชี",
        "บัญชีต้นทาง",
        "บัญชีผู้โอน",
        "จ่ายจากบัญชี",
        "จ่ายจาก",
        "ถอนจากบัญชี",
        "บัญชีจ่าย",
        "บัญชีผู้จ่าย",
        "from",
        "paid from",
        "debit from",
        "withdrawn from",
        "source account",
        "account from",
        "source",
      ]
    : [
        "โอนไปยัง",
        "ไป ",
        "ไปบัญชี",
        "ไปยัง",
        "ไปยังบัญชี",
        "โอนเข้าบัญชี",
        "เข้าบัญชี",
        "บัญชีรับเงิน",
        "รับเข้าบัญชี",
        "บัญชีปลายทาง",
        "บัญชีผู้รับ",
        "to",
        "paid to",
        "credited to",
        "received into",
        "destination account",
        "account to",
        "destination",
      ];

  const stopTokens = [
    "ค่าเช่าห้อง",
    "ค่าใช้จ่าย",
    "ค่าบริการ",
    "ค่า",
    "ชื่อผู้รับเงิน",
    "ผู้รับเงิน",
    "ชื่อร้านค้า",
    "ร้านค้า",
    "recipient",
    "beneficiary",
    "payee",
    "merchant",
    "vendor",
    "หมายเลขอ้างอิง",
    "reference",
    "วันที่",
    "เวลา",
    "ยอดรวม",
    "ยอดเงิน",
    "จำนวน",
    "บาท",
    "thb",
    "usd",
    "eur",
    "jpy",
    "฿",
    "$",
    "€",
    "¥",
    " from ",
    " จาก ",
    "จาก",
    " source ",
    " ต้นทาง ",
    " payer ",
    " sender ",
    " paid from ",
    " debit from ",
    " withdrawn from ",
    " to ",
    " ไปยัง ",
    "ไปยัง",
    "โอนไปยัง",
    " destination ",
    " received into ",
    " เข้าบัญชี ",
    "เข้าบัญชี",
    " บัญชีปลายทาง ",
    "บัญชีปลายทาง",
    "โอนเข้าบัญชี",
    "รับเข้าบัญชี",
    " recipient ",
    " beneficiary ",
    " for ",
    " amount ",
    " ยอด ",
  ];

  for (const marker of markers) {
    const index = normalized.toLowerCase().indexOf(marker.toLowerCase());
    if (index < 0) {
      continue;
    }

    let candidate = normalized.slice(index + marker.length).trim();
    candidate = candidate.replace(/^[:\-]+\s*/, "");
    for (const stopToken of stopTokens) {
      const stopIndex = candidate.toLowerCase().indexOf(stopToken.toLowerCase());
      if (stopIndex >= 0) {
        candidate = candidate.slice(0, stopIndex).trim();
      }
    }
    candidate = candidate.split(/[|;]/)[0].trim();
    candidate = normalizePaymentAccountNickname(candidate);
    const referenceSplit = candidate.split(/(?:หมายเลขอ้างอิง|เลขอ้างอิง|reference|ref)/i)[0]?.trim();
    const amountSplit = referenceSplit?.split(/(?:จำนวนเงิน|ยอดเงิน|amount|total)/i)[0]?.trim();
    candidate = amountSplit?.trim() ?? "";
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function inferPaymentReferenceFromText(
  text: string,
  role: "source" | "destination",
): {
  label: string | null;
  institutionName: string | null;
  matchedInstitutions: string[];
  accountNickname: string | null;
  last4: string | null;
  maskedIdentifier: string | null;
  paymentMethodKind: FinancePaymentInstrumentKind;
} | null {
  const candidate = extractPaymentAccountCandidate(text, role);
  const institutionName = inferPaymentInstitutionNameFromText(candidate ?? text)
    ?? (candidate ? inferPaymentInstitutionNameFromText(text) : null);
  const matchedInstitutions = Array.from(new Set([
    ...inferPaymentInstitutionNamesFromText(candidate ?? text),
    ...(candidate ? inferPaymentInstitutionNamesFromText(text) : []),
  ]));
  const paymentMethodKind = inferPaymentMethodKindFromText(candidate ?? text);
  const last4 = extractPaymentAccountLast4FromCandidate(candidate)
    ?? (role === "source" ? extractPaymentAccountLast4FromCandidate(text) : null);
  const maskedIdentifier = buildPaymentAccountMaskedIdentifier(last4);
  const accountNickname = candidate
    ? normalizePaymentAccountNickname(
        candidate
          .replace(/\b(?:••••\d{1,4}|\d{4,})\b/g, " ")
          .replace(/\s+/g, " "),
      ) || null
    : null;

  const labelParts: string[] = [];
  const labelSource = accountNickname || institutionName || null;
  if (labelSource) {
    labelParts.push(labelSource);
  }
  if (maskedIdentifier) {
    labelParts.push(maskedIdentifier);
  } else if (last4) {
    labelParts.push(`••••${last4}`);
  }

  return {
    label: labelParts.length > 0 ? Array.from(new Set(labelParts)).join(" · ") : null,
    institutionName,
    matchedInstitutions,
    accountNickname,
    last4,
    maskedIdentifier,
    paymentMethodKind,
  };
}

function extractStructuredSlipReferenceFromText(text: string): string | null {
  const normalized = normalizeDigits(text).replace(/\s+/g, " ").trim();
  const markers = [
    /(?:หมายเลขอ้างอิง|เลขอ้างอิง|reference(?: number)?|ref(?:\s*no\.?)?|transaction(?:\s*id| no\.?)?|trace(?:\s*no\.?)?|รหัสอ้างอิง|รหัสรายการ)\s*[:#\-]?\s*([A-Za-z0-9\-_/]+(?:\s+[A-Za-z0-9\-_/]+){0,3})/i,
  ];

  for (const pattern of markers) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      return normalizeText(candidate).replace(/[|;,.]+$/g, "");
    }
  }

  return null;
}

function extractStructuredMerchantIdFromText(text: string): string | null {
  const normalized = normalizeDigits(text).replace(/\s+/g, " ").trim();
  const patterns = [
    /(?:merchant(?:\s*id|(?:\s*no\.?)?)|merchant\s*code|ร้านค้า(?:\s*id|(?:\s*no\.?)?)|รหัสร้านค้า|รหัสร้าน|store(?:\s*id|(?:\s*no\.?)?)|shop(?:\s*id|(?:\s*no\.?)?))\s*[:#\-]?\s*([A-Za-z0-9\-_/]+(?:\s+[A-Za-z0-9\-_/]+){0,2})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate) {
      return normalizeText(candidate).replace(/[|;,.]+$/g, "");
    }
  }

  return null;
}

function extractPaymentFeeMinorFromText(text: string, currency: string): number | null {
  const normalized = normalizeDigits(text).replace(/,/g, " ");
  const markers = [
    "ค่าธรรมเนียม",
    "fee",
    "service charge",
    "charge",
    "transfer fee",
    "ค่าบริการ",
  ];

  for (const marker of markers) {
    const index = normalized.toLowerCase().indexOf(marker.toLowerCase());
    if (index < 0) {
      continue;
    }

    const tail = normalized.slice(index + marker.length).replace(/^[:#\-]?\s*/, "");
    const amount = parseAmountMinorFromText(tail, currency);
    if (amount !== null) {
      return amount;
    }
  }

  return null;
}

function lineContainsAmountHints(line: string): boolean {
  const normalized = normalizeParsingText(line);
  return [
    "จำนวนเงิน",
    "amount",
    "ยอดเงิน",
    "ยอดชำระ",
    "ชำระเงิน",
    "total",
    "paid",
    "จ่าย",
    "โอน",
    "ค่าธรรมเนียม",
    "fee",
    "บาท",
    "thb",
    "฿",
    "usd",
    "eur",
    "jpy",
  ].some((token) => normalized.includes(token));
}

function lineLooksLikeAmountNoise(line: string): boolean {
  const normalized = normalizeParsingText(line);
  return [
    "reference",
    "อ้างอิง",
    "หมายเลขอ้างอิง",
    "transaction id",
    "เลขอ้างอิง",
    "merchant",
    "รหัสร้านค้า",
    "account",
    "บัญชี",
    "เลขที่บัญชี",
    "filename",
    "file name",
    ".jpg",
    ".jpeg",
    ".png",
    ".pdf",
    "qr",
  ].some((token) => normalized.includes(token));
}

function parseAmountMinorFromLine(text: string, currency: string): number | null {
  const normalized = normalizeDigits(text).replace(/,/g, "");
  const patterns = [
    /(?:จำนวนเงิน|ยอดเงิน|ยอดชำระ|ชำระเงิน|amount|total|paid)\s*[:#\-]?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /(?:฿|บาท|thb)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:฿|บาท|thb)/i,
    /(?:\$|usd)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:\$|usd)/i,
    /(?:€|eur)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:€|eur)/i,
    /(?:¥|jpy)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /([0-9]+(?:\.[0-9]{1,2})?)\s*(?:¥|jpy)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      const parsed = Number.parseFloat(match[1]);
      if (Number.isFinite(parsed)) {
        const multiplier = currency === "JPY" ? 1 : 100;
        return Math.max(1, Math.round(parsed * multiplier));
      }
    }
  }

  return null;
}

function inferPaymentDetailsFromText(
  text: string,
  type: FinanceTransaction["type"],
  documentRole: FinanceStructuredDraft["documentRole"],
): {
  paymentMethodKind: FinancePaymentInstrumentKind;
  paymentSourceLabel: string | null;
  paymentDestinationLabel: string | null;
  paymentSourceInstitutionName: string | null;
  paymentDestinationInstitutionName: string | null;
  paymentInstitutionName: string | null;
  paymentAccountNickname: string | null;
  paymentAccountLast4: string | null;
  paymentAccountMaskedIdentifier: string | null;
  paymentInstrumentConfidence: number;
} {
  const sourceReference = inferPaymentReferenceFromText(text, "source");
  const destinationReference = inferPaymentReferenceFromText(text, "destination");
  const transferCounterparty = type === "transfer"
    ? inferCounterpartyCandidateFromText(text, type)
    : null;
  const primaryReference = type === "income"
    ? destinationReference ?? sourceReference
    : sourceReference ?? destinationReference;

  const fallbackPaymentMethodKind = inferPaymentMethodKindFromText(text);
  const paymentMethodKind = primaryReference?.paymentMethodKind && primaryReference.paymentMethodKind !== "unknown"
    ? primaryReference.paymentMethodKind
    : fallbackPaymentMethodKind;

  return {
    paymentMethodKind,
    paymentSourceLabel: sourceReference?.label ?? null,
    paymentDestinationLabel: transferCounterparty ?? destinationReference?.label ?? null,
    paymentSourceInstitutionName: sourceReference?.institutionName ?? null,
    paymentDestinationInstitutionName: destinationReference?.institutionName ?? null,
    paymentInstitutionName: primaryReference?.institutionName ?? null,
    paymentAccountNickname: primaryReference?.accountNickname ?? transferCounterparty ?? null,
    paymentAccountLast4: primaryReference?.last4 ?? null,
    paymentAccountMaskedIdentifier: primaryReference?.maskedIdentifier ?? null,
    paymentInstrumentConfidence: primaryReference
      ? 0.78
      : documentRole
        ? 0.42
        : 0.2,
  };
}

function mergeInferredPaymentDetailsFromText(
  draft: FinanceStructuredDraft,
  text: string,
): FinanceStructuredDraft {
  const inferredCounterpartyName = draft.counterpartyName
    ?? draft.merchantName
    ?? inferCounterpartyCandidateFromText(text, draft.type)
    ?? null;
  const paymentDetails = inferPaymentDetailsFromText(text, draft.type, draft.documentRole ?? null);
  const paymentDirection = draft.paymentDirection ?? inferPaymentDirectionFromType(draft.type);
  const paymentMethodKind = draft.paymentMethodKind && draft.paymentMethodKind !== "unknown"
    ? draft.paymentMethodKind
    : paymentDetails.paymentMethodKind;
  const sourceLabel = draft.paymentSourceLabel ?? paymentDetails.paymentSourceLabel ?? null;
  const destinationLabel = draft.paymentDestinationLabel ?? paymentDetails.paymentDestinationLabel ?? null;
  const sourceInstitutionName = draft.paymentSourceInstitutionName ?? paymentDetails.paymentSourceInstitutionName ?? null;
  const destinationInstitutionName = draft.paymentDestinationInstitutionName ?? paymentDetails.paymentDestinationInstitutionName ?? null;
  const paymentInstitutionName = draft.paymentInstitutionName ?? paymentDetails.paymentInstitutionName ?? null;
  const paymentAccountNickname = draft.paymentAccountNickname
    ?? paymentDetails.paymentAccountNickname
    ?? sourceLabel
    ?? destinationLabel
    ?? null;
  const paymentAccountLast4 = draft.paymentAccountLast4 ?? paymentDetails.paymentAccountLast4 ?? null;
  const paymentAccountMaskedIdentifier = draft.paymentAccountMaskedIdentifier
    ?? paymentDetails.paymentAccountMaskedIdentifier
    ?? (paymentAccountLast4 ? buildPaymentAccountMaskedIdentifier(paymentAccountLast4) : null);
  const slipReference = draft.slipReference ?? extractStructuredSlipReferenceFromText(text);
  const merchantId = draft.merchantId ?? extractStructuredMerchantIdFromText(text);
  const paymentFeeMinor = draft.paymentFeeMinor ?? extractPaymentFeeMinorFromText(text, draft.currency);
  const humanReadableSummary = draft.humanReadableSummary
    ?? buildHumanReadableFinanceSummary({
      type: draft.type,
      amountMinor: draft.amountMinor,
      currency: draft.currency,
      counterpartyName: inferredCounterpartyName,
      merchantName: draft.merchantName ?? null,
      paymentSourceName: draft.paymentSourceName ?? null,
      paymentDestinationName: draft.paymentDestinationName ?? null,
      paymentSourceInstitutionName: sourceInstitutionName,
      paymentDestinationInstitutionName: destinationInstitutionName,
      paymentSourceLabel: sourceLabel,
      paymentDestinationLabel: destinationLabel,
      slipReference,
      merchantId,
      paymentFeeMinor,
    });

  const evidence = draft.evidence.length > 0 ? draft.evidence : buildFinanceEvidenceItems({
    text,
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    counterpartyName: inferredCounterpartyName ?? paymentAccountNickname,
    slipReference,
    merchantId,
    paymentFeeMinor,
    paymentSourceInstitutionName: sourceInstitutionName,
    paymentDestinationInstitutionName: destinationInstitutionName,
    paymentSourceLabel: sourceLabel,
    paymentDestinationLabel: destinationLabel,
    paymentSourceName: draft.paymentSourceName ?? null,
    paymentDestinationName: draft.paymentDestinationName ?? null,
  });

  return {
    ...draft,
    paymentDirection,
    paymentMethodKind,
    paymentSourceLabel: sourceLabel,
    paymentDestinationLabel: destinationLabel,
    paymentSourceName: draft.paymentSourceName ?? null,
    paymentDestinationName: draft.paymentDestinationName ?? null,
    paymentSourceInstitutionName: sourceInstitutionName,
    paymentDestinationInstitutionName: destinationInstitutionName,
    paymentInstitutionName,
    paymentAccountNickname,
    paymentAccountLast4,
    paymentAccountMaskedIdentifier,
    slipReference,
    merchantId,
    paymentFeeMinor,
    humanReadableSummary,
    counterpartyName: inferredCounterpartyName,
    paymentInstrumentConfidence: Math.max(
      Number(draft.paymentInstrumentConfidence ?? 0),
      paymentDetails.paymentInstrumentConfidence,
      paymentMethodKind !== "unknown" ? 0.6 : 0.15,
    ),
    evidence,
  };
}

function inferDocumentRoleFromText(text: string): FinanceStructuredDraft["documentRole"] {
  const normalized = normalizeParsingText(text);
  if (normalized.includes("statement") || normalized.includes("ยอดคงเหลือ") || normalized.includes("ยอดบัญชี")) {
    return "statement";
  }
  if (normalized.includes("slip") || normalized.includes("สลิป") || normalized.includes("โอน")) {
    return "transfer_slip";
  }
  if (normalized.includes("receipt") || normalized.includes("ใบเสร็จ") || normalized.includes("bill")) {
    return "receipt";
  }
  return null;
}

function normalizeDocumentRole(value?: string | null): FinanceStructuredDraft["documentRole"] {
  if (!value) {
    return null;
  }

  const parsed = financeDocumentRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseAmountMinorFromText(text: string, currency: string): number | null {
  const normalized = normalizeDigits(text).replace(/,/g, "");
  const lines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index];
    if (!lineContainsAmountHints(currentLine) || lineLooksLikeAmountNoise(currentLine)) {
      continue;
    }

    for (let offset = 0; offset <= 2; offset += 1) {
      const nextLine = lines[index + offset];
      if (!nextLine || lineLooksLikeAmountNoise(nextLine)) {
        continue;
      }
      const amount = parseAmountMinorFromLine(nextLine, currency);
      if (amount !== null) {
        return amount;
      }
    }
  }

  for (const line of lines) {
    if (lineLooksLikeAmountNoise(line) || /(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/.test(line)) {
      continue;
    }
    const amount = parseAmountMinorFromLine(line, currency);
    if (amount !== null) {
      return amount;
    }
  }

  const amountWithContext = parseAmountMinorFromLine(normalized, currency);
  if (amountWithContext !== null) {
    return amountWithContext;
  }

  const candidates = Array.from(normalized.matchAll(/([0-9]+(?:\.[0-9]{1,2})?)/g), (match) => Number.parseFloat(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (candidates.length === 0) {
    return null;
  }

  const preferredCandidates = candidates.filter((candidate) => candidate <= MAX_BARE_AMOUNT_MAJOR);
  const candidate = (preferredCandidates.length > 0 ? preferredCandidates : candidates)[0];
  if (!Number.isFinite(candidate)) {
    return null;
  }

  const multiplier = currency === "JPY" ? 1 : 100;
  return Math.max(1, Math.round(candidate * multiplier));
}

function isSuspiciousAmountMinor(amountMinor: number | null | undefined): boolean {
  return typeof amountMinor !== "number"
    || !Number.isFinite(amountMinor)
    || amountMinor <= 0
    || amountMinor > MAX_SEMANTIC_DUPLICATE_AMOUNT_MINOR;
}

const FINANCE_DEFAULT_TIME_ZONE = "Asia/Bangkok";

const MONTH_TOKEN_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  "ม.ค.": 1,
  "มค": 1,
  "มกราคม": 1,
  "ก.พ.": 2,
  "กพ": 2,
  "กุมภาพันธ์": 2,
  "มี.ค.": 3,
  "มีค": 3,
  "มีนาคม": 3,
  "เม.ย.": 4,
  "เมย": 4,
  "เมษายน": 4,
  "พ.ค.": 5,
  "พค": 5,
  "พฤษภาคม": 5,
  "มิ.ย.": 6,
  "มิย": 6,
  "มิถุนายน": 6,
  "ก.ค.": 7,
  "กค": 7,
  "กรกฎาคม": 7,
  "ส.ค.": 8,
  "สค": 8,
  "สิงหาคม": 8,
  "ก.ย.": 9,
  "กย": 9,
  "กันยายน": 9,
  "ต.ค.": 10,
  "ตค": 10,
  "ตุลาคม": 10,
  "พ.ย.": 11,
  "พย": 11,
  "พฤศจิกายน": 11,
  "ธ.ค.": 12,
  "ธค": 12,
  "ธันวาคม": 12,
};

function normalizeOccurrenceText(value: string): string {
  return normalizeDigits(normalizeText(value))
    .replace(/\u200b/g, "")
    .toLowerCase();
}

function compactOccurrenceText(value: string): string {
  return normalizeOccurrenceText(value).replace(/[.\-_/]/g, "");
}

function normalizeOccurrenceYear(value: number): number {
  if (value >= 2400) {
    return value - 543;
  }
  if (value < 100) {
    return 2000 + value;
  }
  return value;
}

function buildOccurredAtIsoFromParts(parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }): string {
  return timeZonePartsToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour ?? 0,
      minute: parts.minute ?? 0,
      second: parts.second ?? 0,
    },
    FINANCE_DEFAULT_TIME_ZONE,
  ).toISOString();
}

function parseExplicitTimeFromText(normalized: string): { hour: number; minute: number; second: number } | null {
  const timeMatch = normalized.match(/\b(?:เวลา\s*)?(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/i);
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const meridiem = timeMatch[3]?.toLowerCase();
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || hour > 23) {
      return null;
    }
    if (meridiem === "pm" && hour < 12) {
      hour += 12;
    } else if (meridiem === "am" && hour === 12) {
      hour = 0;
    }
    return { hour, minute, second: 0 };
  }

  const hourOnlyMatch = normalized.match(/\b(?:เวลา\s*)?(\d{1,2})\s*(?:นาฬิกา|โมง|hr|hrs|hour|hours)\b/i);
  if (hourOnlyMatch) {
    const hour = Number(hourOnlyMatch[1]);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      return { hour, minute: 0, second: 0 };
    }
  }

  return null;
}

function parseExplicitDateFromText(normalized: string): { year: number; month: number; day: number } | null {
  const candidates = [normalized, compactOccurrenceText(normalized)];

  for (const candidate of candidates) {
    const isoMatch = candidate.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (isoMatch) {
      const year = normalizeOccurrenceYear(Number(isoMatch[1]));
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }

    const dmyMatch = candidate.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const month = Number(dmyMatch[2]);
      const year = normalizeOccurrenceYear(Number(dmyMatch[3]));
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }

    const monthPatterns = [
      /\b(\d{1,2})\s*([a-zก-๙.]+)\s*(\d{2,4})\b/i,
      /\b([a-zก-๙.]+)\s*(\d{1,2}),?\s*(\d{2,4})\b/i,
    ];

    for (const pattern of monthPatterns) {
      const monthMatch = candidate.match(pattern);
      if (!monthMatch) {
        continue;
      }

      const firstToken = monthMatch[1];
      const secondToken = monthMatch[2];
      const thirdToken = monthMatch[3];
      const token = Number.isNaN(Number(firstToken)) ? firstToken : secondToken;
      const day = Number.isNaN(Number(firstToken)) ? Number(secondToken) : Number(firstToken);
      const tokenKey = token.toLowerCase();
      const normalizedToken = tokenKey.replace(/[.\-_/]/g, "");
      const month = MONTH_TOKEN_MAP[tokenKey] ?? MONTH_TOKEN_MAP[normalizedToken];
      const year = normalizeOccurrenceYear(Number(thirdToken));
      if (month && Number.isFinite(year) && Number.isFinite(day) && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }
  }

  return null;
}

function parseOccurredAtPartsFromText(text: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } | null {
  const normalized = normalizeOccurrenceText(text);
  const explicitDate = parseExplicitDateFromText(normalized);
  if (explicitDate) {
    const explicitTime = parseExplicitTimeFromText(normalized);
    return {
      ...explicitDate,
      hour: explicitTime?.hour ?? 0,
      minute: explicitTime?.minute ?? 0,
      second: explicitTime?.second ?? 0,
    };
  }

  return null;
}

export function extractDocumentOccurredAtIso(text: string): string | null {
  const explicit = parseOccurredAtPartsFromText(text);
  if (!explicit) {
    return null;
  }
  return buildOccurredAtIsoFromParts(explicit);
}

function inferCategoryCodeFromText(text: string, categoryHint: string | null | undefined, type: FinanceTransaction["type"]): string {
  const hint = categoryHint ? normalizeText(categoryHint) : "";
  if (hint) {
    return hint.slice(0, 64);
  }

  const normalized = normalizeParsingText(text);
  const keywordRules: Array<{ keywords: string[]; code: string }> = [
    { keywords: ["taxi", "grab", "bolt", "รถไฟฟ้า", "bts", "mrt", "เดินทาง", "transport", "ชาร์จรถ", "ชาร์จไฟรถ", "fuel", "gas"], code: "transport" },
    { keywords: ["coffee", "cafe", "restaurant", "food", "lunch", "dinner", "อาหาร", "กาแฟ", "ข้าว", "กิน"], code: "food" },
    { keywords: ["rent", "ค่าเช่า", "บ้าน", "หอ", "ที่พัก"], code: "housing.rent" },
    { keywords: ["electricity", "ไฟฟ้า", "utility", "น้ำ", "internet", "wifi"], code: "utilities" },
    { keywords: ["salary", "เงินเดือน", "โบนัส", "income"], code: "income.salary" },
    { keywords: ["health", "ยา", "หมอ", "clinic", "hospital"], code: "healthcare" },
    { keywords: ["education", "เรียน", "หนังสือ", "course"], code: "education" },
    { keywords: ["subscription", "netflix", "spotify", "prime"], code: "subscription" },
  ];

  for (const rule of keywordRules) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.code;
    }
  }

  return type === "income" ? "income.misc" : "other.misc";
}

function inferOccurredAtIso(text: string, fallback = new Date()): string {
  const explicit = parseOccurredAtPartsFromText(text);
  if (explicit) {
    return buildOccurredAtIsoFromParts(explicit);
  }

  const normalized = normalizeOccurrenceText(text);
  const now = new Date(fallback);
  if (normalized.includes("เมื่อวาน") || normalized.includes("yesterday")) {
    return new Date(now.getTime() - 86_400_000).toISOString();
  }
  if (normalized.includes("พรุ่งนี้") || normalized.includes("tomorrow")) {
    return new Date(now.getTime() + 86_400_000).toISOString();
  }
  if (normalized.includes("วันนี้") || normalized.includes("today")) {
    return now.toISOString();
  }
  return now.toISOString();
}

export function buildFinanceStructuredDraftFromText(params: {
  text: string;
  typeHint?: FinanceTransaction["type"] | null;
  categoryHint?: string | null;
  counterpartyHint?: string | null;
  occurredAt?: string | null;
  captureIntent?: "receipt" | "transfer_slip" | "statement" | null;
}): FinanceStructuredDraft {
  const type = inferFinanceTypeFromText(params.text, params.typeHint ?? null);
  const currency = inferCurrencyFromText(params.text);
  const amountMinor = parseAmountMinorFromText(params.text, currency);
  const categoryCode = inferCategoryCodeFromText(params.text, params.categoryHint ?? null, type);
  const inferredCounterparty = params.counterpartyHint?.trim()
    ? normalizeCounterpartyDisplayName(params.counterpartyHint)
    : inferCounterpartyCandidateFromText(params.text, type);
  const paymentDirection = inferPaymentDirectionFromType(type);
  const documentRole = params.captureIntent ?? inferDocumentRoleFromText(params.text);
  const paymentDetails = inferPaymentDetailsFromText(params.text, type, documentRole);
  const slipReference = extractStructuredSlipReferenceFromText(params.text);
  const merchantId = extractStructuredMerchantIdFromText(params.text);
  const paymentFeeMinor = extractPaymentFeeMinorFromText(params.text, currency);
  const humanReadableSummary = buildHumanReadableFinanceSummary({
    type,
    amountMinor: amountMinor ?? 1,
    currency,
    counterpartyName: inferredCounterparty ?? null,
    merchantName: null,
    paymentSourceName: null,
    paymentDestinationName: null,
    paymentSourceInstitutionName: paymentDetails.paymentSourceInstitutionName,
    paymentDestinationInstitutionName: paymentDetails.paymentDestinationInstitutionName,
    paymentSourceLabel: paymentDetails.paymentSourceLabel,
    paymentDestinationLabel: paymentDetails.paymentDestinationLabel,
    slipReference,
    merchantId,
    paymentFeeMinor,
  });
  const evidence = buildFinanceEvidenceItems({
    text: params.text,
    amountMinor,
    currency,
    counterpartyName: inferredCounterparty ?? null,
    slipReference,
    merchantId,
    paymentFeeMinor,
    paymentSourceInstitutionName: paymentDetails.paymentSourceInstitutionName,
    paymentDestinationInstitutionName: paymentDetails.paymentDestinationInstitutionName,
    paymentSourceLabel: paymentDetails.paymentSourceLabel,
    paymentDestinationLabel: paymentDetails.paymentDestinationLabel,
    paymentSourceName: null,
    paymentDestinationName: null,
  });
  const missingFields: string[] = [];

  if (amountMinor === null) {
    missingFields.push("amountMinor");
  }

  const needsClarification = missingFields.length > 0;

  const baseDraft: FinanceStructuredDraft = {
    type,
    amountMinor: amountMinor ?? 1,
    currency,
    occurredAt: params.occurredAt ?? inferOccurredAtIso(params.text),
    categoryCode,
    documentRole,
    counterpartyName: inferredCounterparty ?? null,
    merchantName: null,
    paymentMethodKind: paymentDetails.paymentMethodKind,
    paymentDirection,
    paymentSourceAccountId: null,
    paymentDestinationAccountId: null,
    paymentSourceLabel: paymentDetails.paymentSourceLabel,
    paymentDestinationLabel: paymentDetails.paymentDestinationLabel,
    paymentSourceInstitutionName: paymentDetails.paymentSourceInstitutionName,
    paymentDestinationInstitutionName: paymentDetails.paymentDestinationInstitutionName,
    paymentInstitutionName: paymentDetails.paymentInstitutionName,
    paymentAccountNickname: paymentDetails.paymentAccountNickname,
    paymentAccountLast4: paymentDetails.paymentAccountLast4,
    paymentAccountMaskedIdentifier: paymentDetails.paymentAccountMaskedIdentifier,
    humanReadableSummary,
    slipReference,
    merchantId,
    paymentFeeMinor,
    evidence,
    sourceUrl: null,
    sourceFileName: null,
    paymentInstrumentConfidence: paymentDetails.paymentInstrumentConfidence,
    confidence: needsClarification
      ? 0.38
      : params.categoryHint?.trim()
        ? 0.84
        : 0.7,
    needsClarification,
    missingFields,
    sourceMessageId: undefined,
    sourceLibraryItemId: undefined,
    recurringRuleId: undefined,
    note: stripFinanceIntentPrefix(params.text) || normalizeText(params.text),
  };

  const withGenericPreset = applyFinanceSlipMappingPresetsToDraft(baseDraft, params.text, getFinanceSlipMappingPresetsSnapshot());
  return applyPinnedMerchantPresetsToDraft(withGenericPreset, params.text, getPinnedMerchantPresetsSnapshot());
}

function formatEvidenceCurrencyMinor(amountMinor: number, currency: string): string {
  const safeCurrency = currency.trim().toUpperCase() || "THB";
  const amount = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
}

function buildFinanceEvidenceItems(input: {
  text: string;
  amountMinor: number | null;
  currency: string;
  counterpartyName: string | null;
  slipReference: string | null;
  merchantId: string | null;
  paymentFeeMinor: number | null;
  paymentSourceInstitutionName: string | null;
  paymentDestinationInstitutionName: string | null;
  paymentSourceLabel: string | null;
  paymentDestinationLabel: string | null;
  paymentSourceName: string | null;
  paymentDestinationName: string | null;
}): Array<{ field: string; value: string | null; snippet: string; confidence?: number | null }> {
  const items: Array<{ field: string; value: string | null; snippet: string; confidence?: number | null }> = [];
  const normalizedText = normalizeText(input.text);
  const fallbackSnippet = normalizedText ? normalizedText.slice(0, 160) : "OCR text";
  if (input.amountMinor !== null) {
    items.push({
      field: "amountMinor",
      value: formatEvidenceCurrencyMinor(input.amountMinor, input.currency),
      snippet: `amount ${formatEvidenceCurrencyMinor(input.amountMinor, input.currency)}`,
      confidence: 0.97,
    });
  }
  if (input.counterpartyName) {
    items.push({
      field: "counterpartyName",
      value: input.counterpartyName,
      snippet: `counterparty ${input.counterpartyName}`,
      confidence: 0.82,
    });
  }
  if (input.slipReference) {
    items.push({
      field: "slipReference",
      value: input.slipReference,
      snippet: `reference ${input.slipReference}`,
      confidence: 0.76,
    });
  }
  if (input.merchantId) {
    items.push({
      field: "merchantId",
      value: input.merchantId,
      snippet: `merchant id ${input.merchantId}`,
      confidence: 0.76,
    });
  }
  if (input.paymentFeeMinor !== null) {
    items.push({
      field: "paymentFeeMinor",
      value: formatEvidenceCurrencyMinor(input.paymentFeeMinor, input.currency),
      snippet: `fee ${formatEvidenceCurrencyMinor(input.paymentFeeMinor, input.currency)}`,
      confidence: 0.74,
    });
  }
  if (input.paymentSourceInstitutionName) {
    items.push({
      field: "paymentSourceInstitutionName",
      value: input.paymentSourceInstitutionName,
      snippet: `source bank ${input.paymentSourceInstitutionName}`,
      confidence: 0.84,
    });
  }
  if (input.paymentDestinationInstitutionName) {
    items.push({
      field: "paymentDestinationInstitutionName",
      value: input.paymentDestinationInstitutionName,
      snippet: `destination bank ${input.paymentDestinationInstitutionName}`,
      confidence: 0.84,
    });
  }
  if (input.paymentSourceLabel) {
    items.push({
      field: "paymentSourceLabel",
      value: input.paymentSourceLabel,
      snippet: `source account ${input.paymentSourceLabel}`,
      confidence: 0.78,
    });
  }
  if (input.paymentDestinationLabel) {
    items.push({
      field: "paymentDestinationLabel",
      value: input.paymentDestinationLabel,
      snippet: `destination account ${input.paymentDestinationLabel}`,
      confidence: 0.78,
    });
  }
  if (input.paymentSourceName) {
    items.push({
      field: "paymentSourceName",
      value: input.paymentSourceName,
      snippet: `source name ${input.paymentSourceName}`,
      confidence: 0.7,
    });
  }
  if (input.paymentDestinationName) {
    items.push({
      field: "paymentDestinationName",
      value: input.paymentDestinationName,
      snippet: `destination name ${input.paymentDestinationName}`,
      confidence: 0.7,
    });
  }
  if (items.length === 0) {
    items.push({
      field: "ocrText",
      value: null,
      snippet: fallbackSnippet,
      confidence: 0.3,
    });
  }

  return items;
}

function buildHumanReadableFinanceSummary(input: {
  type: FinanceTransaction["type"];
  amountMinor: number;
  currency: string;
  counterpartyName: string | null;
  merchantName: string | null;
  paymentSourceName: string | null;
  paymentDestinationName: string | null;
  paymentSourceInstitutionName: string | null;
  paymentDestinationInstitutionName: string | null;
  paymentSourceLabel: string | null;
  paymentDestinationLabel: string | null;
  slipReference: string | null;
  merchantId: string | null;
  paymentFeeMinor: number | null;
}): string {
  const amount = formatEvidenceCurrencyMinor(input.amountMinor, input.currency);
  const sourceText = input.paymentSourceLabel
    || input.paymentSourceInstitutionName
    || input.paymentSourceName
    || "บัญชีต้นทาง";
  const destinationText = input.paymentDestinationLabel
    || input.counterpartyName
    || input.merchantName
    || input.paymentDestinationInstitutionName
    || input.paymentDestinationName
    || "ผู้รับเงิน";
  const feeText = input.paymentFeeMinor !== null
    ? ` ค่าธรรมเนียม ${formatEvidenceCurrencyMinor(input.paymentFeeMinor, input.currency)}`
    : "";
  const referenceText = input.slipReference ? ` อ้างอิง ${input.slipReference}` : "";

  if (input.type === "transfer") {
    const sourceSummary = input.paymentSourceInstitutionName
      ? `${input.paymentSourceInstitutionName}${input.paymentSourceLabel ? ` · ${input.paymentSourceLabel}` : ""}${input.paymentSourceName ? ` · ${input.paymentSourceName}` : ""}`
      : sourceText;
    const destinationSummary = input.paymentDestinationInstitutionName
      ? `${input.paymentDestinationInstitutionName}${input.paymentDestinationLabel ? ` · ${input.paymentDestinationLabel}` : ""}${input.paymentDestinationName ? ` · ${input.paymentDestinationName}` : ""}`
      : destinationText;
    return `โอน ${amount}${feeText}${referenceText} จาก ${sourceSummary} ไปยัง ${destinationSummary}`;
  }

  if (input.type === "income") {
    return `รับ ${amount}${feeText}${referenceText} จาก ${destinationText}`;
  }

  return `จ่าย ${amount}${feeText}${referenceText} ให้ ${destinationText}`;
}

function ensureDb(db: FinanceDb | null | undefined): asserts db is FinanceDb {
  if (!db) {
    throw new Error("Database not available");
  }
}

function getTimeZoneParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday ?? "Sun"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function timeZonePartsToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const candidate = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    0,
  );

  let utc = candidate;
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utc), timeZone);
    const next = candidate - offset;
    if (next === utc) {
      break;
    }
    utc = next;
  }
  return new Date(utc);
}

function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const parts = getTimeZoneParts(date, timeZone);
  return timeZonePartsToUtc({ year: parts.year, month: parts.month, day: parts.day }, timeZone);
}

function startOfMonthInTimeZone(date: Date, timeZone: string): Date {
  const parts = getTimeZoneParts(date, timeZone);
  return timeZonePartsToUtc({ year: parts.year, month: parts.month, day: 1 }, timeZone);
}

function startOfNextMonthInTimeZone(date: Date, timeZone: string): Date {
  const parts = getTimeZoneParts(date, timeZone);
  let year = parts.year;
  let month = parts.month + 1;
  if (month > 12) {
    year += 1;
    month = 1;
  }
  return timeZonePartsToUtc({ year, month, day: 1 }, timeZone);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildClarificationPrompt(missingFields: string[]): string | null {
  if (missingFields.length === 0) {
    return null;
  }
  return `Please confirm: ${missingFields.join(", ")}.`;
}

function buildFinanceOcrStructuredExtractionPrompt(params: {
  occurredAt?: string | null;
  typeHint?: FinanceTransaction["type"] | null;
  categoryHint?: string | null;
  counterpartyHint?: string | null;
  captureIntent?: "receipt" | "transfer_slip" | "statement" | null;
}): string {
  const instructions = [
    "You extract a structured finance transaction draft from OCR text.",
    "The OCR text may contain duplicate headers, broken line wraps, repeated lines, or mixed language snippets.",
    "Return a single JSON object that matches the schema exactly. Do not include markdown fences or prose.",
    "Use the OCR text as the primary source of truth. Do not invent values that are not visible or strongly implied.",
    "If a value is not visible, use null where the schema allows it and set needsClarification when needed.",
    "If the OCR text looks like a transfer slip, set type to transfer and documentRole to transfer_slip.",
    "Do not use digits from filenames, URLs, QR codes, account masks, reference numbers, or merchant codes as the transaction amount.",
    "When the slip shows sender and receiver banks or accounts, keep paymentSourceInstitutionName and paymentDestinationInstitutionName separate.",
    "If the slip is a transfer between the user's own accounts, keep both sides separate instead of collapsing them into one field.",
    "When account names, nicknames, last 4 digits, or masked identifiers are visible, populate the matching payment fields.",
    "If sender and receiver names are visible, extract them separately into paymentSourceName and paymentDestinationName.",
    "If the slip shows a fee, extract it into paymentFeeMinor.",
    "If the slip shows a reference number, extract it into slipReference.",
    "If the slip shows a merchant or shop code, extract it into merchantId.",
    "Also provide a humanReadableSummary field in Thai that reads like a concise sentence. It should mention the transaction type, amount, source, destination or counterparty, and bank/account details when visible.",
    "Keep humanReadableSummary short, readable, and faithful to the OCR text.",
    "Provide an evidence array with one entry per important field you extracted.",
    "Each evidence item should include field, value, snippet, and optional confidence.",
    "Keep snippets short and grounded in visible OCR text.",
    "Prefer the most likely transaction amount shown on the slip. If there is a fee and a total, use the main transfer or payment amount as amountMinor unless the text clearly indicates otherwise.",
    "Prefer THB when the slip is in Thai Baht unless another currency is clearly visible.",
    "Use a precise occurredAt if the OCR text includes a clear date or time. Otherwise infer the best timestamp from the selected context.",
    params.typeHint
      ? `The user provided a type hint. Prefer it when the OCR text is ambiguous: ${params.typeHint}.`
      : "Infer the transaction type from the OCR text.",
    params.categoryHint
      ? `A user-provided category hint is available. Prefer it when the OCR text is ambiguous: ${params.categoryHint}.`
      : "Use the most specific categoryCode that matches the OCR text.",
    params.counterpartyHint
      ? `A user-provided counterparty hint is available. Prefer it when the OCR text is ambiguous: ${params.counterpartyHint}.`
      : "If a merchant, person, or organization name is visible, use it as counterpartyName or merchantName when appropriate.",
    params.captureIntent
      ? `The capture intent is: ${params.captureIntent}.`
      : "",
    params.occurredAt
      ? `The user already has a selected timestamp: ${params.occurredAt}. Use it unless the OCR text clearly conflicts.`
      : "If the OCR text has a clear date or time, use it.",
    "Return only valid JSON matching the schema.",
    "Populate missingFields and needsClarification when the OCR text does not provide enough detail.",
  ];

  return instructions.filter(Boolean).join("\n");
}

async function resolveFinanceOcrStructuredModelCandidates(input: {
  preferredModel?: string | null;
  maxCandidates?: number;
}): Promise<string[]> {
  const orderedCandidates: string[] = [];
  const preferredModel = input.preferredModel?.trim() ?? "";
  if (preferredModel) {
    orderedCandidates.push(preferredModel);
  }

  try {
    const enabledRows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
    const capabilityCandidates = selectLlmModelCandidates(
      { supportsStructuredOutputs: true },
      enabledRows,
      input.maxCandidates ?? 4,
    );
    for (const candidate of capabilityCandidates) {
      if (!orderedCandidates.includes(candidate)) {
        orderedCandidates.push(candidate);
      }
    }
  } catch {
    // If the model catalog is unavailable we still allow the caller to fall
    // back to the configured default model path in callLLMStructured.
  }

  return orderedCandidates;
}

export async function extractFinanceStructuredDraftFromOcrText(
  input: ExtractFinanceStructuredDraftFromOcrTextInput,
): Promise<FinanceStructuredDraft> {
  const normalizedText = normalizeText(input.text);
  const sanitizedText = stripFinanceOcrNoise(normalizedText, input.sourceFileName ?? null);
  const debugTraceId = getFinanceOcrDebugTraceId(input.debugTraceId);
  if (!sanitizedText) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Finance OCR text cannot be empty" });
  }
  if (!input.tenantId?.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for OCR extraction" });
  }

  recordFinanceOcrDebugStep("finance_structured_extract_start", {
    traceId: debugTraceId,
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
    textLength: sanitizedText.length,
    textPreview: sanitizedText.slice(0, 240),
    occurredAt: input.occurredAt ?? null,
    captureIntent: input.captureIntent ?? null,
    sourceFileName: input.sourceFileName ?? null,
    hasSourceUrl: Boolean(input.sourceUrl),
    modelHint: input.model ?? null,
    modelCandidates: input.modelCandidates ?? null,
  });

  const parsedOccurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
  const resolvedOccurredAt = parsedOccurredAt && Number.isFinite(parsedOccurredAt.getTime())
    ? parsedOccurredAt.toISOString()
    : null;

  const explicitModelCandidates = Array.isArray(input.modelCandidates)
    ? input.modelCandidates
      .map((candidate) => candidate?.trim())
      .filter((candidate): candidate is string => Boolean(candidate))
    : [];
  const modelCandidates = explicitModelCandidates.length > 0
    ? Array.from(new Set([
      ...(input.model?.trim() ? [input.model.trim()] : []),
      ...explicitModelCandidates,
    ]))
    : await resolveFinanceOcrStructuredModelCandidates({
      preferredModel: input.model ?? null,
    });
  const modelQueue = modelCandidates.length > 0
    ? modelCandidates
    : [input.model?.trim()].filter((model): model is string => Boolean(model));
  const attemptModels = modelQueue.length > 0 ? modelQueue : [undefined];
  let lastError: unknown = null;

  recordFinanceOcrDebugStep("finance_structured_extract_model_queue", {
    traceId: debugTraceId,
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
    candidateCount: attemptModels.length,
    candidates: attemptModels.map((candidate) => candidate ?? null),
    resolvedOccurredAt,
  });

  for (const model of attemptModels) {
    try {
      recordFinanceOcrDebugStep("finance_structured_extract_model_attempt", {
        traceId: debugTraceId,
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: input.tenantId,
        model: model ?? null,
        textLength: normalizedText.length,
        sourceFileName: input.sourceFileName ?? null,
        hasSourceUrl: Boolean(input.sourceUrl),
      });
      const structured = await callLLMStructured<FinanceStructuredDraft>({
        systemPrompt: buildFinanceOcrStructuredExtractionPrompt({
          occurredAt: resolvedOccurredAt,
          typeHint: input.typeHint ?? null,
          categoryHint: input.categoryHint ?? null,
          counterpartyHint: input.counterpartyHint ?? null,
          captureIntent: input.captureIntent ?? null,
        }),
        userMessage: JSON.stringify({
          sourceKind: "ocr_document",
          text: sanitizedText,
          occurredAt: resolvedOccurredAt,
          typeHint: input.typeHint ?? null,
          categoryHint: input.categoryHint ?? null,
          counterpartyHint: input.counterpartyHint ?? null,
          captureIntent: input.captureIntent ?? null,
          sourceMessageId: input.sourceMessageId ?? null,
          paymentMethodKind: input.paymentMethodKind ?? null,
          paymentDirection: input.paymentDirection ?? null,
          paymentSourceAccountId: input.paymentSourceAccountId ?? null,
          paymentDestinationAccountId: input.paymentDestinationAccountId ?? null,
          paymentSourceLabel: input.paymentSourceLabel ?? null,
          paymentDestinationLabel: input.paymentDestinationLabel ?? null,
          paymentSourceInstitutionName: input.paymentSourceInstitutionName ?? null,
          paymentDestinationInstitutionName: input.paymentDestinationInstitutionName ?? null,
          paymentInstitutionName: input.paymentInstitutionName ?? null,
          paymentAccountNickname: input.paymentAccountNickname ?? null,
          paymentAccountLast4: input.paymentAccountLast4 ?? null,
          paymentAccountMaskedIdentifier: input.paymentAccountMaskedIdentifier ?? null,
          paymentInstrumentConfidence: input.paymentInstrumentConfidence ?? null,
        }),
        zodSchema: financeStructuredDraftSchema,
        userId: input.userId,
        tenantId: input.tenantId,
        maxRetries: 1,
        billingDescription: "finance_ocr_to_draft",
        billingMetadata: {
          domain: "finance",
          source: "ocr_document",
          conversationId: input.conversationId,
          captureIntent: input.captureIntent ?? null,
        },
        model,
      });

      const data = structured.data;
      recordFinanceOcrDebugStep("finance_structured_extract_model_result", {
        traceId: debugTraceId,
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: input.tenantId,
        model: model ?? null,
        resultType: data.type ?? null,
        resultCurrency: data.currency ?? null,
        resultAmountMinor: data.amountMinor ?? null,
        resultOccurredAt: data.occurredAt ?? null,
        resultConfidence: data.confidence ?? null,
        resultMissingFields: data.missingFields ?? null,
        resultNeedsClarification: data.needsClarification ?? null,
      });
      const heuristicAmountMinor = parseAmountMinorFromText(sanitizedText, data.currency);
      const heuristicOccurredAt = extractDocumentOccurredAtIso(sanitizedText);
      const normalizedData = isSuspiciousAmountMinor(data.amountMinor) && heuristicAmountMinor !== null
        ? {
          ...data,
          amountMinor: heuristicAmountMinor,
        }
        : data;
      recordFinanceOcrDebugStep("finance_structured_extract_heuristics", {
        traceId: debugTraceId,
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: input.tenantId,
        model: model ?? null,
        dataAmountMinor: data.amountMinor ?? null,
        heuristicAmountMinor,
        dataOccurredAt: data.occurredAt ?? null,
        heuristicOccurredAt,
        usedHeuristicAmount: isSuspiciousAmountMinor(data.amountMinor) && heuristicAmountMinor !== null,
        usedHeuristicOccurredAt: Boolean(heuristicOccurredAt),
        normalizedCurrency: data.currency ?? null,
      });
      const merged = mergeInferredPaymentDetailsFromText({
        ...normalizedData,
        occurredAt: heuristicOccurredAt ?? normalizedData.occurredAt ?? resolvedOccurredAt,
      }, sanitizedText);
      const presetApplied = applyFinanceSlipMappingPresetsToDraft(merged, sanitizedText);
      const pinnedMerchantApplied = await applyPinnedMerchantPresetsToDraftAsync(presetApplied, sanitizedText);
      const finalOccurredAt = heuristicOccurredAt ?? pinnedMerchantApplied.occurredAt ?? resolvedOccurredAt ?? normalizedData.occurredAt;
      recordFinanceOcrDebugStep("finance_structured_extract_final", {
        traceId: debugTraceId,
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: input.tenantId,
        model: model ?? null,
        finalType: pinnedMerchantApplied.type ?? null,
        finalAmountMinor: pinnedMerchantApplied.amountMinor ?? null,
        finalOccurredAt,
        finalCounterpartyName: pinnedMerchantApplied.counterpartyName ?? null,
        finalMerchantName: pinnedMerchantApplied.merchantName ?? null,
        finalDocumentRole: pinnedMerchantApplied.documentRole ?? null,
        finalPaymentMethodKind: pinnedMerchantApplied.paymentMethodKind ?? null,
        finalPaymentDirection: pinnedMerchantApplied.paymentDirection ?? null,
        finalPaymentInstrumentConfidence: pinnedMerchantApplied.paymentInstrumentConfidence ?? null,
      });
      return {
        ...pinnedMerchantApplied,
        occurredAt: finalOccurredAt,
      };
    } catch (error) {
      lastError = error;
      recordFinanceOcrDebugStep("finance_structured_extract_model_failed", {
        traceId: debugTraceId,
        conversationId: input.conversationId,
        userId: input.userId,
        tenantId: input.tenantId,
        model: model ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (lastError instanceof Error) {
    recordFinanceOcrDebugStep("finance_structured_extract_failed", {
      traceId: debugTraceId,
      conversationId: input.conversationId,
      userId: input.userId,
      tenantId: input.tenantId,
      error: lastError.message,
    });
    throw lastError;
  }
  recordFinanceOcrDebugStep("finance_structured_extract_failed", {
    traceId: debugTraceId,
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
    error: "Finance OCR structured extraction failed",
  });
  throw new Error("Finance OCR structured extraction failed");
}

function buildAllowedScopes(userId: number): string[] {
  return [personalScopeToken(userId)];
}

function buildScopeFromConversation(conversation: Conversation, userId: number, ctxTenantId?: string | null): FinanceScope {
  const conversationTenantId = conversation.tenantId ?? null;
  const resolvedTenantId = resolveTenantIdVarchar(ctxTenantId ?? conversationTenantId, conversationTenantId);
  if (!resolvedTenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for finance operations",
    });
  }

  if (conversationTenantId && resolvedTenantId !== String(conversationTenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Conversation tenant does not match finance request tenant",
    });
  }

  if (!conversation.projectId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Finance operations require a conversation with a project scope",
    });
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

async function resolveScopeFromConversation(params: {
  conversationId: number;
  userId: number;
  tenantId?: string | null;
}): Promise<FinanceScope> {
  const conversation = await getConversationById(params.conversationId, params.userId);
  if (!conversation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }
  return buildScopeFromConversation(conversation, params.userId, params.tenantId);
}

function computeBaseSourceHash(parts: Array<string | number | null | undefined>): string {
  return sha256(parts.map((part) => String(part ?? "")).join("::"));
}

function normalizePayloadVersion(payloadJson: Record<string, unknown> | null | undefined): number {
  const raw = payloadJson?.version;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

function toFinanceConfidenceValue(value: number | string | null | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function toFinanceConfidenceNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
  }
  return null;
}

function readOptionalPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function materializeDraftPayload(row: Pick<FinanceDraft, "type" | "payloadJson" | "createdAt">): FinanceDraftPayload {
  const payloadJson = (row.payloadJson ?? {}) as Record<string, unknown>;
  const amountMinor = readOptionalPositiveInt(payloadJson.amountMinor) ?? 1;
  const currency = readOptionalString(payloadJson.currency)?.toUpperCase() ?? "THB";
  const occurredAt = readOptionalString(payloadJson.occurredAt) ?? row.createdAt.toISOString();
  const categoryCode = readOptionalString(payloadJson.categoryCode) ?? "uncategorized";
  const documentRole = normalizeDocumentRole(readOptionalString(payloadJson.documentRole));
  const counterpartyName = typeof payloadJson.counterpartyName === "string"
    ? payloadJson.counterpartyName
    : payloadJson.counterpartyName === null
      ? null
      : null;
  const counterpartyId = typeof payloadJson.counterpartyId === "number" && Number.isFinite(payloadJson.counterpartyId)
    ? payloadJson.counterpartyId
    : null;
  const merchantName = typeof payloadJson.merchantName === "string"
    ? payloadJson.merchantName
    : payloadJson.merchantName === null
      ? null
      : null;
  const note = typeof payloadJson.note === "string"
    ? payloadJson.note
    : payloadJson.note === null
      ? null
      : null;
  const slipReference = typeof payloadJson.slipReference === "string"
    ? payloadJson.slipReference
    : payloadJson.slipReference === null
      ? null
      : null;
  const merchantId = typeof payloadJson.merchantId === "string"
    ? payloadJson.merchantId
    : payloadJson.merchantId === null
      ? null
      : null;
  const paymentFeeMinor = typeof payloadJson.paymentFeeMinor === "number" && Number.isFinite(payloadJson.paymentFeeMinor)
    ? Math.max(0, Math.floor(payloadJson.paymentFeeMinor))
    : null;
  const paymentMethodKind = typeof payloadJson.paymentMethodKind === "string"
    ? financePaymentInstrumentKindSchema.safeParse(payloadJson.paymentMethodKind).success
      ? payloadJson.paymentMethodKind as FinancePaymentInstrumentKind
      : null
    : null;
  const paymentDirection = typeof payloadJson.paymentDirection === "string"
    ? financePaymentDirectionSchema.safeParse(payloadJson.paymentDirection).success
      ? payloadJson.paymentDirection as FinancePaymentDirection
      : null
    : null;
  const paymentSourceAccountId = typeof payloadJson.paymentSourceAccountId === "number" && Number.isFinite(payloadJson.paymentSourceAccountId)
    ? Math.floor(payloadJson.paymentSourceAccountId)
    : null;
  const paymentDestinationAccountId = typeof payloadJson.paymentDestinationAccountId === "number" && Number.isFinite(payloadJson.paymentDestinationAccountId)
    ? Math.floor(payloadJson.paymentDestinationAccountId)
    : null;
  const paymentSourceLabel = typeof payloadJson.paymentSourceLabel === "string"
    ? payloadJson.paymentSourceLabel
    : payloadJson.paymentSourceLabel === null
      ? null
      : null;
  const paymentDestinationLabel = typeof payloadJson.paymentDestinationLabel === "string"
    ? payloadJson.paymentDestinationLabel
    : payloadJson.paymentDestinationLabel === null
      ? null
      : null;
  const paymentSourceName = typeof payloadJson.paymentSourceName === "string"
    ? payloadJson.paymentSourceName
    : payloadJson.paymentSourceName === null
      ? null
      : null;
  const paymentDestinationName = typeof payloadJson.paymentDestinationName === "string"
    ? payloadJson.paymentDestinationName
    : payloadJson.paymentDestinationName === null
      ? null
      : null;
  const paymentSourceInstitutionName = typeof payloadJson.paymentSourceInstitutionName === "string"
    ? payloadJson.paymentSourceInstitutionName
    : payloadJson.paymentSourceInstitutionName === null
      ? null
      : null;
  const paymentDestinationInstitutionName = typeof payloadJson.paymentDestinationInstitutionName === "string"
    ? payloadJson.paymentDestinationInstitutionName
    : payloadJson.paymentDestinationInstitutionName === null
      ? null
      : null;
  const paymentInstitutionName = typeof payloadJson.paymentInstitutionName === "string"
    ? payloadJson.paymentInstitutionName
    : payloadJson.paymentInstitutionName === null
      ? null
      : null;
  const paymentAccountNickname = typeof payloadJson.paymentAccountNickname === "string"
    ? payloadJson.paymentAccountNickname
    : payloadJson.paymentAccountNickname === null
      ? null
      : null;
  const paymentAccountLast4 = typeof payloadJson.paymentAccountLast4 === "string"
    ? payloadJson.paymentAccountLast4
    : payloadJson.paymentAccountLast4 === null
      ? null
      : null;
  const paymentAccountMaskedIdentifier = typeof payloadJson.paymentAccountMaskedIdentifier === "string"
    ? payloadJson.paymentAccountMaskedIdentifier
    : payloadJson.paymentAccountMaskedIdentifier === null
      ? null
      : null;
  const sourceUrl = typeof payloadJson.sourceUrl === "string"
    ? payloadJson.sourceUrl
    : payloadJson.sourceUrl === null
      ? null
      : null;
  const sourceFileName = typeof payloadJson.sourceFileName === "string"
    ? payloadJson.sourceFileName
    : payloadJson.sourceFileName === null
      ? null
      : null;
  const paymentInstrumentConfidence = typeof payloadJson.paymentInstrumentConfidence === "number" && Number.isFinite(payloadJson.paymentInstrumentConfidence)
    ? payloadJson.paymentInstrumentConfidence
    : null;
  const confidence = typeof payloadJson.confidence === "number" && Number.isFinite(payloadJson.confidence)
    ? payloadJson.confidence
    : 0;
  const sourceMessageId = typeof payloadJson.sourceMessageId === "number" && Number.isFinite(payloadJson.sourceMessageId)
    ? payloadJson.sourceMessageId
    : null;
  const sourceLibraryItemId = typeof payloadJson.sourceLibraryItemId === "number" && Number.isFinite(payloadJson.sourceLibraryItemId)
    ? payloadJson.sourceLibraryItemId
    : null;
  const evidence = Array.isArray(payloadJson.evidence)
    ? payloadJson.evidence.filter((item): item is FinanceEvidenceItem => Boolean(
      item
      && typeof item === "object"
      && typeof (item as { field?: unknown }).field === "string"
      && typeof (item as { snippet?: unknown }).snippet === "string"
      && String((item as { field?: string }).field).trim().length > 0
      && String((item as { snippet?: string }).snippet).trim().length > 0,
    ))
    : [];
  const recurringRuleId = typeof payloadJson.recurringRuleId === "number" && Number.isFinite(payloadJson.recurringRuleId)
    ? payloadJson.recurringRuleId
    : null;
  const documentExtractionId = typeof payloadJson.documentExtractionId === "number" && Number.isFinite(payloadJson.documentExtractionId)
    ? payloadJson.documentExtractionId
    : null;

  const draftLike: FinanceDraftPayload = {
    type: row.type,
    amountMinor,
    currency,
    occurredAt,
    categoryCode,
    documentRole: documentRole ?? null,
    counterpartyId,
    counterpartyName,
    merchantName,
    note,
    slipReference,
    merchantId,
    paymentFeeMinor,
    paymentMethodKind: paymentMethodKind ?? null,
    paymentDirection: paymentDirection ?? null,
    paymentSourceAccountId,
    paymentDestinationAccountId,
    paymentSourceLabel,
    paymentDestinationLabel,
    paymentSourceName,
    paymentDestinationName,
    paymentSourceInstitutionName,
    paymentDestinationInstitutionName,
    paymentInstitutionName,
    paymentAccountNickname,
    paymentAccountLast4,
    paymentAccountMaskedIdentifier,
    sourceUrl,
    sourceFileName,
    paymentInstrumentConfidence,
    evidence,
    confidence,
    needsClarification: Boolean(payloadJson.needsClarification),
    missingFields: readStringArray(payloadJson.missingFields),
    sourceMessageId,
    sourceLibraryItemId,
    recurringRuleId,
    version: normalizePayloadVersion(payloadJson),
    sourceKind: readOptionalString(payloadJson.sourceKind) ?? undefined,
    documentExtractionId,
  };

  return {
    ...draftLike,
    missingFields: normalizeStructuredDraftMissingFields(draftLike),
  };
}

function mapDraftRow(row: FinanceDraft): FinanceDraftRecord {
  const payloadJson = (row.payloadJson ?? {}) as Record<string, unknown>;
  const version = normalizePayloadVersion(payloadJson);
  const materialized = materializeDraftPayload(row);
  return {
    ...row,
    amountMinor: materialized.amountMinor,
    currency: materialized.currency,
    occurredAt: materialized.occurredAt,
    categoryCode: materialized.categoryCode,
    documentRole: materialized.documentRole ?? null,
    counterpartyId: materialized.counterpartyId ?? null,
    counterpartyName: materialized.counterpartyName ?? null,
    merchantName: materialized.merchantName ?? null,
    note: materialized.note ?? null,
    slipReference: materialized.slipReference ?? null,
    merchantId: materialized.merchantId ?? null,
    paymentFeeMinor: materialized.paymentFeeMinor ?? null,
    paymentMethodKind: materialized.paymentMethodKind ?? null,
    paymentDirection: materialized.paymentDirection ?? null,
    paymentSourceAccountId: materialized.paymentSourceAccountId ?? null,
    paymentDestinationAccountId: materialized.paymentDestinationAccountId ?? null,
    paymentSourceLabel: materialized.paymentSourceLabel ?? null,
    paymentDestinationLabel: materialized.paymentDestinationLabel ?? null,
    paymentSourceName: materialized.paymentSourceName ?? null,
    paymentDestinationName: materialized.paymentDestinationName ?? null,
    paymentSourceInstitutionName: materialized.paymentSourceInstitutionName ?? null,
    paymentDestinationInstitutionName: materialized.paymentDestinationInstitutionName ?? null,
    paymentInstitutionName: materialized.paymentInstitutionName ?? null,
    paymentAccountNickname: materialized.paymentAccountNickname ?? null,
    paymentAccountLast4: materialized.paymentAccountLast4 ?? null,
    paymentAccountMaskedIdentifier: materialized.paymentAccountMaskedIdentifier ?? null,
    sourceUrl: materialized.sourceUrl ?? null,
    sourceFileName: materialized.sourceFileName ?? null,
    paymentInstrumentConfidence: materialized.paymentInstrumentConfidence ?? null,
    payloadJson,
    allowedScopes: row.allowedScopes ?? [],
    version,
  };
}

function mapTransactionRow(row: FinanceTransaction): FinanceTransaction {
  return row;
}

function toIdempotencyKey(defaultPrefix: string, parts: Array<string | number | null | undefined>): string {
  return `${defaultPrefix}:${sha256(parts.map((part) => String(part ?? "")).join("::"))}`;
}

function validateRecurringSchedule(input: z.infer<typeof recurringScheduleSchema>): z.infer<typeof recurringScheduleSchema> {
  const parsed = recurringScheduleSchema.parse(input);
  if (parsed.frequency === "weekly" && parsed.daysOfWeek && parsed.daysOfWeek.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Weekly recurring rules must include at least one day of week" });
  }
  return parsed;
}

function normalizeRecurringSchedule(input: z.infer<typeof recurringScheduleSchema> | string): z.infer<typeof recurringScheduleSchema> {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Recurring schedule cannot be empty" });
    }

    if (trimmed.startsWith("{")) {
      try {
        return validateRecurringSchedule(JSON.parse(trimmed) as z.infer<typeof recurringScheduleSchema>);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Invalid recurring schedule JSON",
        });
      }
    }

    const upper = trimmed.toUpperCase();
    if (upper === "DAILY") return validateRecurringSchedule({ frequency: "daily", interval: 1 });
    if (upper === "WEEKLY") return validateRecurringSchedule({ frequency: "weekly", interval: 1 });
    if (upper === "MONTHLY") return validateRecurringSchedule({ frequency: "monthly", interval: 1 });
    if (upper === "YEARLY") return validateRecurringSchedule({ frequency: "yearly", interval: 1 });

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unsupported recurring schedule format. Use JSON schedule or DAILY/WEEKLY/MONTHLY/YEARLY.",
    });
  }

  return validateRecurringSchedule(input);
}

function buildScheduleAnchor(startDate: Date, timeZone: string) {
  const parts = getTimeZoneParts(startDate, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    weekday: parts.weekday,
  };
}

function scheduleMatchesDate(
  candidate: Date,
  schedule: z.infer<typeof recurringScheduleSchema>,
  anchor: ReturnType<typeof buildScheduleAnchor>,
  timeZone: string,
): boolean {
  const candidateParts = getTimeZoneParts(candidate, timeZone);
  const daysSinceAnchor = Math.floor(
    (Date.UTC(candidateParts.year, candidateParts.month - 1, candidateParts.day) - Date.UTC(anchor.year, anchor.month - 1, anchor.day))
      / 86_400_000,
  );

  if (candidateParts.hour !== anchor.hour || candidateParts.minute !== anchor.minute || candidateParts.second !== anchor.second) {
    return false;
  }

  switch (schedule.frequency) {
    case "daily":
      return daysSinceAnchor >= 0 && daysSinceAnchor % schedule.interval === 0;
    case "weekly": {
      const weekdayOk = schedule.daysOfWeek?.length
        ? schedule.daysOfWeek.includes(candidateParts.weekday)
        : candidateParts.weekday === anchor.weekday;
      const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
      return daysSinceAnchor >= 0 && weekdayOk && weeksSinceAnchor >= 0 && weeksSinceAnchor % schedule.interval === 0;
    }
    case "monthly": {
      const monthsSinceAnchor = (candidateParts.year - anchor.year) * 12 + (candidateParts.month - anchor.month);
      const targetDay = schedule.dayOfMonth ?? anchor.day;
      const expectedDay = Math.min(targetDay, daysInMonth(candidateParts.year, candidateParts.month));
      return monthsSinceAnchor >= 0
        && monthsSinceAnchor % schedule.interval === 0
        && candidateParts.day === expectedDay;
    }
    case "yearly": {
      const yearsSinceAnchor = candidateParts.year - anchor.year;
      const targetMonth = schedule.month ?? anchor.month;
      const targetDay = schedule.dayOfMonth ?? anchor.day;
      const expectedDay = Math.min(targetDay, daysInMonth(candidateParts.year, targetMonth));
      return yearsSinceAnchor >= 0
        && yearsSinceAnchor % schedule.interval === 0
        && candidateParts.month === targetMonth
        && candidateParts.day === expectedDay;
    }
    default:
      return false;
  }
}

function computeNextRecurringRunAt(
  schedule: z.infer<typeof recurringScheduleSchema>,
  startDate: Date,
  timeZone: string,
  afterDate: Date,
): Date | null {
  const anchor = buildScheduleAnchor(startDate, timeZone);
  const maxDays = 366 * 5;

  for (let offset = 0; offset <= maxDays; offset += 1) {
    const candidateLocal = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + offset, anchor.hour, anchor.minute, anchor.second));
    const candidate = timeZonePartsToUtc(
      {
        year: candidateLocal.getUTCFullYear(),
        month: candidateLocal.getUTCMonth() + 1,
        day: candidateLocal.getUTCDate(),
        hour: anchor.hour,
        minute: anchor.minute,
        second: anchor.second,
      },
      timeZone,
    );

    if (candidate.getTime() < startDate.getTime()) {
      continue;
    }
    if (candidate.getTime() < afterDate.getTime()) {
      continue;
    }
    if (scheduleMatchesDate(candidate, schedule, anchor, timeZone)) {
      return candidate;
    }
  }

  return null;
}

async function selectExistingDraft(db: FinanceDbExecutor, scope: FinanceScope, identity: { idempotencyKey: string; sourceHash?: string | null; draftId?: number | null }): Promise<FinanceDraftRecord | null> {
  if (identity.draftId) {
    const [byId] = await db
      .select()
      .from(financeDrafts)
      .where(and(
        eq(financeDrafts.id, identity.draftId),
        eq(financeDrafts.tenantId, scope.tenantId),
        eq(financeDrafts.projectId, scope.projectId),
        eq(financeDrafts.ownerUserId, scope.ownerUserId),
      ))
      .limit(1);
    if (byId) {
      return mapDraftRow(byId);
    }
  }

  const [byIdempotency] = await db
    .select()
    .from(financeDrafts)
    .where(and(
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.idempotencyKey, identity.idempotencyKey),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);
  if (byIdempotency) {
    return mapDraftRow(byIdempotency);
  }

  if (identity.sourceHash) {
    const [byHash] = await db
      .select()
      .from(financeDrafts)
      .where(and(
        eq(financeDrafts.tenantId, scope.tenantId),
        eq(financeDrafts.sourceHash, identity.sourceHash),
        eq(financeDrafts.projectId, scope.projectId),
        eq(financeDrafts.ownerUserId, scope.ownerUserId),
      ))
      .limit(1);
    if (byHash) {
      return mapDraftRow(byHash);
    }
  }

  return null;
}

async function selectExistingConfirmedTransaction(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  draftId: number,
): Promise<FinanceTransaction | null> {
  const [row] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.confirmedFromDraftId, draftId),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);
  return row ?? null;
}

function normalizeSemanticDuplicateText(value?: string | null): string {
  return normalizeDigits(normalizeText(value ?? ""))
    .toLowerCase()
    .replace(/[^0-9a-zก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSemanticDuplicateAmount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return String(Math.max(0, Math.floor(value)));
}

function normalizeSemanticDuplicateOccurredAt(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 16);
}

function buildFinanceSemanticDuplicateFingerprint(subject: FinanceSemanticDuplicateSubject): string {
  return sha256([
    "finance-semantic-v1",
    subject.type,
    subject.amountMinor,
    subject.currency.trim().toUpperCase(),
    normalizeSemanticDuplicateOccurredAt(subject.occurredAt),
    normalizeCounterpartyKey(subject.counterpartyName ?? ""),
    normalizeCounterpartyKey(subject.merchantName ?? ""),
    normalizeSemanticDuplicateText(subject.slipReference),
    normalizeSemanticDuplicateText(subject.merchantId),
    normalizeSemanticDuplicateAmount(subject.paymentFeeMinor),
    subject.paymentMethodKind ?? "",
    subject.paymentDirection ?? "",
    subject.paymentSourceAccountId ?? "",
    subject.paymentDestinationAccountId ?? "",
    normalizeCounterpartyKey(subject.paymentSourceName ?? ""),
    normalizeCounterpartyKey(subject.paymentDestinationName ?? ""),
  ].join("::"));
}

function isSemanticDuplicateSubjectQueryable(subject: FinanceSemanticDuplicateSubject): boolean {
  if (!Number.isInteger(subject.amountMinor) || subject.amountMinor <= 0 || subject.amountMinor > MAX_SEMANTIC_DUPLICATE_AMOUNT_MINOR) {
    return false;
  }

  if (typeof subject.currency !== "string" || subject.currency.trim().length === 0) {
    return false;
  }

  const occurredAt = new Date(subject.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) {
    return false;
  }

  return true;
}

function buildFinanceSemanticDuplicateSubjectFromDraft(draft: FinanceStructuredDraft): FinanceSemanticDuplicateSubject {
  return {
    type: draft.type,
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    occurredAt: draft.occurredAt,
    counterpartyName: draft.counterpartyName ?? null,
    merchantName: draft.merchantName ?? null,
    slipReference: draft.slipReference ?? null,
    merchantId: draft.merchantId ?? null,
    paymentFeeMinor: draft.paymentFeeMinor ?? null,
    paymentMethodKind: draft.paymentMethodKind ?? null,
    paymentDirection: draft.paymentDirection ?? null,
    paymentSourceAccountId: draft.paymentSourceAccountId ?? null,
    paymentDestinationAccountId: draft.paymentDestinationAccountId ?? null,
    paymentSourceName: draft.paymentSourceName ?? null,
    paymentDestinationName: draft.paymentDestinationName ?? null,
  };
}

function buildFinanceSemanticDuplicateSubjectFromDraftRow(draft: FinanceDraftRecord): FinanceSemanticDuplicateSubject {
  return buildFinanceSemanticDuplicateSubjectFromDraft({
    ...materializeDraftPayload(draft),
    type: draft.type,
  });
}

function buildFinanceSemanticDuplicateSubjectFromTransaction(transaction: FinanceTransaction): FinanceSemanticDuplicateSubject {
  return {
    type: transaction.type,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt.toISOString(),
    counterpartyName: transaction.counterpartyName ?? null,
    merchantName: transaction.merchantName ?? null,
    slipReference: transaction.slipReference ?? null,
    merchantId: transaction.merchantId ?? null,
    paymentFeeMinor: transaction.paymentFeeMinor ?? null,
    paymentMethodKind: transaction.paymentMethodKind ?? null,
    paymentDirection: transaction.paymentDirection ?? null,
    paymentSourceAccountId: transaction.paymentSourceAccountId ?? null,
    paymentDestinationAccountId: transaction.paymentDestinationAccountId ?? null,
    paymentSourceName: transaction.paymentSourceName ?? null,
    paymentDestinationName: transaction.paymentDestinationName ?? null,
  };
}

async function selectExistingSemanticDraft(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  subject: FinanceSemanticDuplicateSubject,
  options: { ignoreDraftId?: number | null } = {},
): Promise<FinanceDraftRecord | null> {
  const match = await selectExistingSemanticDuplicateMatch(db, scope, subject, options);
  return match?.draft ?? null;
}

async function selectExistingSemanticDuplicateMatch(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  subject: FinanceSemanticDuplicateSubject,
  options: { ignoreDraftId?: number | null } = {},
): Promise<FinanceSemanticDuplicateMatch | null> {
  if (!isSemanticDuplicateSubjectQueryable(subject)) {
    return null;
  }

  const fingerprint = buildFinanceSemanticDuplicateFingerprint(subject);
  const ignoreDraftId = options.ignoreDraftId ?? null;

  const [exactDraft] = await db
    .select()
    .from(financeDrafts)
    .where(and(
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
      eq(financeDrafts.semanticFingerprint, fingerprint),
    ))
    .limit(1);
  if (exactDraft && exactDraft.id !== ignoreDraftId) {
    return {
      sourceKind: "exact_draft",
      draft: mapDraftRow(exactDraft),
      transaction: null,
    };
  }

  const [exactTransaction] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
      eq(financeTransactions.semanticFingerprint, fingerprint),
      isNull(financeTransactions.voidedAt),
    ))
    .limit(1);
  if (exactTransaction?.confirmedFromDraftId && exactTransaction.confirmedFromDraftId !== ignoreDraftId) {
    return {
      sourceKind: "exact_transaction",
      draft: await ensureDraftOwnership(db, scope, exactTransaction.confirmedFromDraftId),
      transaction: exactTransaction,
    };
  }

  const windowStart = new Date(new Date(subject.occurredAt).getTime() - 86_400_000);
  const windowEnd = new Date(new Date(subject.occurredAt).getTime() + 86_400_000);
  const draftCandidates = await db
    .select()
    .from(financeDrafts)
    .where(and(
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
      eq(financeDrafts.type, subject.type),
      sql`CASE
            WHEN (${financeDrafts.payloadJson} ->> 'amountMinor') ~ '^-?[0-9]+$'
              THEN (${financeDrafts.payloadJson} ->> 'amountMinor')::numeric
            ELSE NULL
          END = ${subject.amountMinor}`,
      sql`UPPER(COALESCE(${financeDrafts.payloadJson} ->> 'currency', '')) = ${subject.currency.trim().toUpperCase()}`,
      sql`COALESCE(${financeDrafts.payloadJson} ->> 'occurredAt', '') >= ${windowStart.toISOString()}`,
      sql`COALESCE(${financeDrafts.payloadJson} ->> 'occurredAt', '') < ${windowEnd.toISOString()}`,
    ))
    .orderBy(desc(financeDrafts.createdAt))
    .limit(200);

  for (const candidate of draftCandidates) {
    if (candidate.id === ignoreDraftId) {
      continue;
    }
    const candidateSubject = buildFinanceSemanticDuplicateSubjectFromDraftRow(mapDraftRow(candidate));
    if (buildFinanceSemanticDuplicateFingerprint(candidateSubject) === fingerprint) {
      return {
        sourceKind: "candidate_draft",
        draft: mapDraftRow(candidate),
        transaction: null,
      };
    }
  }

  const transactionCandidates = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
      eq(financeTransactions.type, subject.type),
      eq(financeTransactions.amountMinor, subject.amountMinor),
      eq(financeTransactions.currency, subject.currency),
      gte(financeTransactions.occurredAt, windowStart),
      lt(financeTransactions.occurredAt, windowEnd),
      isNull(financeTransactions.voidedAt),
    ))
    .orderBy(desc(financeTransactions.occurredAt))
    .limit(200);

  for (const candidate of transactionCandidates) {
    if (!candidate.confirmedFromDraftId || candidate.confirmedFromDraftId === ignoreDraftId) {
      continue;
    }
    const candidateSubject = buildFinanceSemanticDuplicateSubjectFromTransaction(candidate);
    if (buildFinanceSemanticDuplicateFingerprint(candidateSubject) === fingerprint && candidate.confirmedFromDraftId) {
      return {
        sourceKind: "candidate_transaction",
        draft: await ensureDraftOwnership(db, scope, candidate.confirmedFromDraftId),
        transaction: candidate,
      };
    }
  }

  return null;
}

function buildFinanceSemanticDuplicateWarningRecord(
  match: FinanceSemanticDuplicateMatch,
): FinanceSemanticDuplicateWarningRecord {
  const draft = match.draft;
  const payload = materializeDraftPayload(draft);
  const isTransaction = match.sourceKind === "exact_transaction" || match.sourceKind === "candidate_transaction";
  return {
    sourceKind: match.sourceKind,
    sourceLabel: isTransaction ? "Existing confirmed transaction" : "Existing open draft",
    draftId: draft.id,
    transactionId: match.transaction?.id ?? null,
    type: draft.type,
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    occurredAt: draft.occurredAt,
    counterpartyName: payload.counterpartyName ?? draft.counterpartyName ?? null,
    merchantName: payload.merchantName ?? draft.merchantName ?? null,
    note: payload.note ?? draft.note ?? null,
    paymentMethodKind: payload.paymentMethodKind ?? draft.paymentMethodKind ?? null,
    paymentDirection: payload.paymentDirection ?? draft.paymentDirection ?? null,
    paymentSourceAccountId: payload.paymentSourceAccountId ?? draft.paymentSourceAccountId ?? null,
    paymentDestinationAccountId: payload.paymentDestinationAccountId ?? draft.paymentDestinationAccountId ?? null,
    paymentSourceLabel: payload.paymentSourceLabel ?? draft.paymentSourceLabel ?? null,
    paymentDestinationLabel: payload.paymentDestinationLabel ?? draft.paymentDestinationLabel ?? null,
    paymentSourceName: payload.paymentSourceName ?? draft.paymentSourceName ?? null,
    paymentDestinationName: payload.paymentDestinationName ?? draft.paymentDestinationName ?? null,
    paymentSourceInstitutionName: payload.paymentSourceInstitutionName ?? draft.paymentSourceInstitutionName ?? null,
    paymentDestinationInstitutionName: payload.paymentDestinationInstitutionName ?? draft.paymentDestinationInstitutionName ?? null,
    paymentInstitutionName: payload.paymentInstitutionName ?? draft.paymentInstitutionName ?? null,
    paymentAccountNickname: payload.paymentAccountNickname ?? draft.paymentAccountNickname ?? null,
    paymentAccountLast4: payload.paymentAccountLast4 ?? draft.paymentAccountLast4 ?? null,
    paymentAccountMaskedIdentifier: payload.paymentAccountMaskedIdentifier ?? draft.paymentAccountMaskedIdentifier ?? null,
    slipReference: payload.slipReference ?? draft.slipReference ?? null,
    merchantId: payload.merchantId ?? draft.merchantId ?? null,
    paymentFeeMinor: payload.paymentFeeMinor ?? draft.paymentFeeMinor ?? null,
  };
}

export async function getSemanticDuplicateWarning(input: {
  conversationId: number;
  draftId: number;
  userId: number;
  tenantId?: string | null;
}): Promise<FinanceSemanticDuplicateWarningRecord | null> {
  const db = await getDb();
  ensureDb(db);

  const draft = await ensureDraftOwnership(db, await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId ?? null,
  }), input.draftId);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId ?? draft.tenantId,
  });

  const subject = buildFinanceSemanticDuplicateSubjectFromDraft({
    ...materializeDraftPayload(draft),
    type: draft.type,
  });
  const match = await selectExistingSemanticDuplicateMatch(db, scope, subject, { ignoreDraftId: draft.id });
  if (!match) {
    return null;
  }

  return buildFinanceSemanticDuplicateWarningRecord(match);
}

async function ensureDraftOwnership(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  draftId: number,
): Promise<FinanceDraftRecord> {
  const [draft] = await db
    .select()
    .from(financeDrafts)
    .where(and(
      eq(financeDrafts.id, draftId),
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (!draft) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
  }

  return mapDraftRow(draft);
}

async function ensureTransactionOwnership(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  transactionId: number,
): Promise<FinanceTransaction> {
  const [transaction] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.id, transactionId),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (!transaction) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
  }

  return transaction;
}

async function ensureRecurringRuleOwnership(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  recurringRuleId: number,
): Promise<FinanceRecurringRule> {
  const [rule] = await db
    .select()
    .from(financeRecurringRules)
    .where(and(
      eq(financeRecurringRules.id, recurringRuleId),
      eq(financeRecurringRules.tenantId, scope.tenantId),
      eq(financeRecurringRules.projectId, scope.projectId),
      eq(financeRecurringRules.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (!rule) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Recurring rule not found" });
  }

  return rule;
}

function buildDraftClarificationPayload(payload: FinanceStructuredDraft & { version?: number }, source: {
  sourceKind: "chat_text" | "ocr_document" | "recurring_rule";
  sourceMessageId?: number | null;
  sourceLibraryItemId?: number | null;
  recurringRuleId?: number | null;
  sourceHash?: string | null;
  documentExtractionId?: number | null;
}): Record<string, unknown> {
  return {
    ...payload,
    ...source,
    version: payload.version ?? 1,
  };
}

function buildSummaryRow(
  base: FinanceMonthlySummary,
  granularity: "day" | "month",
): FinanceSummaryResult {
  const parsed = financeMonthlySummarySchema.parse(base);
  return {
    ...parsed,
    granularity,
  };
}

function mapCounterpartyRow(row: FinanceCounterparty, aliases: string[] = []): FinanceCounterpartyRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    ownerUserId: row.ownerUserId,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    usageCount: row.usageCount,
    lastSeenAt: row.lastSeenAt ?? null,
    aliases,
    allowedScopes: row.allowedScopes ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCounterpartySuggestion(row: FinanceCounterparty, aliases: string[] = []): FinanceCounterpartySuggestion {
  return financeCounterpartySuggestionSchema.parse({
    id: row.id,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    usageCount: row.usageCount,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    aliases,
  });
}

async function loadCounterpartyAliases(db: FinanceDbExecutor, counterpartyId: number): Promise<string[]> {
  const rows = await db
    .select({
      aliasName: financeCounterpartyAliases.aliasName,
    })
    .from(financeCounterpartyAliases)
    .where(eq(financeCounterpartyAliases.counterpartyId, counterpartyId))
    .orderBy(desc(financeCounterpartyAliases.updatedAt), desc(financeCounterpartyAliases.id));

  return rows
    .map((row) => row.aliasName)
    .filter((alias) => typeof alias === "string" && alias.trim().length > 0);
}

async function loadCounterpartyAliasesForCounterparties(
  db: FinanceDbExecutor,
  counterpartyIds: number[],
): Promise<Map<number, string[]>> {
  if (counterpartyIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      counterpartyId: financeCounterpartyAliases.counterpartyId,
      aliasName: financeCounterpartyAliases.aliasName,
    })
    .from(financeCounterpartyAliases)
    .where(inArray(financeCounterpartyAliases.counterpartyId, counterpartyIds))
    .orderBy(desc(financeCounterpartyAliases.updatedAt), desc(financeCounterpartyAliases.id));

  const aliasesByCounterparty = new Map<number, string[]>();
  for (const row of rows) {
    if (!aliasesByCounterparty.has(row.counterpartyId)) {
      aliasesByCounterparty.set(row.counterpartyId, []);
    }
    const alias = typeof row.aliasName === "string" ? row.aliasName.trim() : "";
    if (alias) {
      aliasesByCounterparty.get(row.counterpartyId)?.push(alias);
    }
  }

  return aliasesByCounterparty;
}

async function selectCounterpartyByNormalizedName(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  normalizedName: string,
): Promise<FinanceCounterparty | null> {
  const [row] = await db
    .select()
    .from(financeCounterparties)
    .where(and(
      eq(financeCounterparties.tenantId, scope.tenantId),
      eq(financeCounterparties.projectId, scope.projectId),
      eq(financeCounterparties.ownerUserId, scope.ownerUserId),
      eq(financeCounterparties.normalizedName, normalizedName),
    ))
    .limit(1);
  return row ?? null;
}

async function selectCounterpartyByAlias(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  normalizedAlias: string,
): Promise<FinanceCounterparty | null> {
  const [row] = await db
    .select({
      id: financeCounterparties.id,
      tenantId: financeCounterparties.tenantId,
      projectId: financeCounterparties.projectId,
      ownerUserId: financeCounterparties.ownerUserId,
      displayName: financeCounterparties.displayName,
      normalizedName: financeCounterparties.normalizedName,
      usageCount: financeCounterparties.usageCount,
      lastSeenAt: financeCounterparties.lastSeenAt,
      allowedScopes: financeCounterparties.allowedScopes,
      createdAt: financeCounterparties.createdAt,
      updatedAt: financeCounterparties.updatedAt,
    })
    .from(financeCounterpartyAliases)
    .innerJoin(financeCounterparties, eq(financeCounterpartyAliases.counterpartyId, financeCounterparties.id))
    .where(and(
      eq(financeCounterpartyAliases.tenantId, scope.tenantId),
      eq(financeCounterpartyAliases.projectId, scope.projectId),
      eq(financeCounterpartyAliases.ownerUserId, scope.ownerUserId),
      eq(financeCounterpartyAliases.normalizedAlias, normalizedAlias),
    ))
    .limit(1);

  return row ?? null;
}

async function resolveCounterpartyRecord(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  params: {
    counterpartyName?: string | null;
    sourceText?: string | null;
    typeHint?: FinanceTransaction["type"] | null;
    allowInference?: boolean;
  },
): Promise<FinanceCounterpartyRecord | null> {
  const directCandidate = params.counterpartyName?.trim()
    ? normalizeCounterpartyDisplayName(params.counterpartyName)
    : null;
  const inferredCandidate = params.allowInference !== false && !directCandidate && params.sourceText
    ? inferCounterpartyCandidateFromText(params.sourceText, params.typeHint ?? "expense")
    : null;
  const candidate = directCandidate ?? inferredCandidate;

  if (!candidate) {
    return null;
  }

  const normalizedName = buildCounterpartySearchKey(candidate);
  if (!normalizedName) {
    return null;
  }

  const existing = await selectCounterpartyByAlias(db, scope, normalizedName)
    ?? await selectCounterpartyByNormalizedName(db, scope, normalizedName);

  if (existing) {
    const [updated] = await db
      .update(financeCounterparties)
      .set({
        usageCount: sql`${financeCounterparties.usageCount} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(financeCounterparties.id, existing.id))
      .returning();

    const aliasRows = await loadCounterpartyAliases(db, existing.id);
    const resolved = updated ?? existing;
    return mapCounterpartyRow(resolved, aliasRows);
  }

  const [inserted] = await db
    .insert(financeCounterparties)
    .values({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      displayName: candidate,
      normalizedName,
      usageCount: 1,
      lastSeenAt: new Date(),
      allowedScopes: scope.allowedScopes,
    })
    .returning();

  if (!inserted) {
    return null;
  }

  await db
    .insert(financeCounterpartyAliases)
    .values({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      counterpartyId: inserted.id,
      aliasName: candidate,
      normalizedAlias: normalizedName,
      allowedScopes: scope.allowedScopes,
    })
    .onConflictDoNothing();

  return mapCounterpartyRow(inserted, [candidate]);
}

function mapPaymentInstitutionRow(row: FinancePaymentInstitution, aliases: string[] = []): FinancePaymentInstitutionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    ownerUserId: row.ownerUserId,
    kind: row.kind as FinancePaymentInstitutionKind,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    usageCount: row.usageCount,
    lastSeenAt: row.lastSeenAt ?? null,
    aliases,
    allowedScopes: row.allowedScopes ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPaymentAccountRow(
  row: FinancePaymentAccount & { institutionName: string; institutionKind: FinancePaymentInstitutionKind },
  aliases: string[] = [],
): FinancePaymentAccountRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    ownerUserId: row.ownerUserId,
    paymentInstitutionId: row.paymentInstitutionId,
    institutionName: row.institutionName,
    institutionKind: row.institutionKind,
    kind: row.kind as FinancePaymentInstrumentKind,
    nickname: row.nickname,
    normalizedNickname: row.normalizedNickname,
    last4: row.last4 ?? null,
    maskedIdentifier: row.maskedIdentifier ?? null,
    usageCount: row.usageCount,
    lastSeenAt: row.lastSeenAt ?? null,
    isPrimary: row.isPrimary,
    archivedAt: row.archivedAt ?? null,
    aliases,
    allowedScopes: row.allowedScopes ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPaymentAccountSuggestion(
  row: FinancePaymentAccount & { institutionName: string; institutionKind: FinancePaymentInstitutionKind },
  aliases: string[] = [],
): FinancePaymentAccountSuggestion {
  return {
    id: row.id,
    displayLabel: buildPaymentInstrumentDisplayLabel({
      nickname: row.nickname,
      last4: row.last4 ?? null,
      institutionName: row.institutionName,
      kind: row.kind as FinancePaymentInstrumentKind,
    }),
    nickname: row.nickname,
    institutionName: row.institutionName,
    institutionKind: row.institutionKind,
    kind: row.kind as FinancePaymentInstrumentKind,
    last4: row.last4 ?? null,
    maskedIdentifier: row.maskedIdentifier ?? null,
    usageCount: row.usageCount,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    aliases,
    isPrimary: row.isPrimary,
  };
}

async function loadPaymentInstitutionAliases(db: FinanceDbExecutor, institutionId: number): Promise<string[]> {
  const rows = await db
    .select({
      aliasName: financePaymentInstitutionAliases.aliasName,
    })
    .from(financePaymentInstitutionAliases)
    .where(eq(financePaymentInstitutionAliases.paymentInstitutionId, institutionId))
    .orderBy(desc(financePaymentInstitutionAliases.updatedAt), desc(financePaymentInstitutionAliases.id));

  return rows
    .map((row) => row.aliasName)
    .filter((alias) => typeof alias === "string" && alias.trim().length > 0);
}

async function loadPaymentAccountAliases(db: FinanceDbExecutor, paymentAccountId: number): Promise<string[]> {
  const rows = await db
    .select({
      aliasName: financePaymentAccountAliases.aliasName,
    })
    .from(financePaymentAccountAliases)
    .where(eq(financePaymentAccountAliases.paymentAccountId, paymentAccountId))
    .orderBy(desc(financePaymentAccountAliases.updatedAt), desc(financePaymentAccountAliases.id));

  return rows
    .map((row) => row.aliasName)
    .filter((alias) => typeof alias === "string" && alias.trim().length > 0);
}

async function loadPaymentInstitutionAliasesForInstitutions(
  db: FinanceDbExecutor,
  institutionIds: number[],
): Promise<Map<number, string[]>> {
  if (institutionIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      paymentInstitutionId: financePaymentInstitutionAliases.paymentInstitutionId,
      aliasName: financePaymentInstitutionAliases.aliasName,
    })
    .from(financePaymentInstitutionAliases)
    .where(inArray(financePaymentInstitutionAliases.paymentInstitutionId, institutionIds))
    .orderBy(desc(financePaymentInstitutionAliases.updatedAt), desc(financePaymentInstitutionAliases.id));

  const aliasesByInstitution = new Map<number, string[]>();
  for (const row of rows) {
    const alias = typeof row.aliasName === "string" ? row.aliasName.trim() : "";
    if (!alias) {
      continue;
    }
    if (!aliasesByInstitution.has(row.paymentInstitutionId)) {
      aliasesByInstitution.set(row.paymentInstitutionId, []);
    }
    aliasesByInstitution.get(row.paymentInstitutionId)?.push(alias);
  }
  return aliasesByInstitution;
}

async function loadPaymentAccountAliasesForAccounts(
  db: FinanceDbExecutor,
  accountIds: number[],
): Promise<Map<number, string[]>> {
  if (accountIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      paymentAccountId: financePaymentAccountAliases.paymentAccountId,
      aliasName: financePaymentAccountAliases.aliasName,
    })
    .from(financePaymentAccountAliases)
    .where(inArray(financePaymentAccountAliases.paymentAccountId, accountIds))
    .orderBy(desc(financePaymentAccountAliases.updatedAt), desc(financePaymentAccountAliases.id));

  const aliasesByAccount = new Map<number, string[]>();
  for (const row of rows) {
    const alias = typeof row.aliasName === "string" ? row.aliasName.trim() : "";
    if (!alias) {
      continue;
    }
    if (!aliasesByAccount.has(row.paymentAccountId)) {
      aliasesByAccount.set(row.paymentAccountId, []);
    }
    aliasesByAccount.get(row.paymentAccountId)?.push(alias);
  }
  return aliasesByAccount;
}

async function selectPaymentInstitutionByNormalizedName(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  kind: FinancePaymentInstitutionKind,
  normalizedName: string,
): Promise<FinancePaymentInstitution | null> {
  const [row] = await db
    .select()
    .from(financePaymentInstitutions)
    .where(and(
      eq(financePaymentInstitutions.tenantId, scope.tenantId),
      eq(financePaymentInstitutions.projectId, scope.projectId),
      eq(financePaymentInstitutions.ownerUserId, scope.ownerUserId),
      eq(financePaymentInstitutions.kind, kind),
      eq(financePaymentInstitutions.normalizedName, normalizedName),
    ))
    .limit(1);
  return row ?? null;
}

async function selectPaymentInstitutionByAlias(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  normalizedAlias: string,
): Promise<FinancePaymentInstitution | null> {
  const [row] = await db
    .select({
      id: financePaymentInstitutions.id,
      tenantId: financePaymentInstitutions.tenantId,
      projectId: financePaymentInstitutions.projectId,
      ownerUserId: financePaymentInstitutions.ownerUserId,
      kind: financePaymentInstitutions.kind,
      displayName: financePaymentInstitutions.displayName,
      normalizedName: financePaymentInstitutions.normalizedName,
      usageCount: financePaymentInstitutions.usageCount,
      lastSeenAt: financePaymentInstitutions.lastSeenAt,
      allowedScopes: financePaymentInstitutions.allowedScopes,
      createdAt: financePaymentInstitutions.createdAt,
      updatedAt: financePaymentInstitutions.updatedAt,
    })
    .from(financePaymentInstitutionAliases)
    .innerJoin(financePaymentInstitutions, eq(financePaymentInstitutionAliases.paymentInstitutionId, financePaymentInstitutions.id))
    .where(and(
      eq(financePaymentInstitutionAliases.tenantId, scope.tenantId),
      eq(financePaymentInstitutionAliases.projectId, scope.projectId),
      eq(financePaymentInstitutionAliases.ownerUserId, scope.ownerUserId),
      eq(financePaymentInstitutionAliases.normalizedAlias, normalizedAlias),
    ))
    .limit(1);
  return row ?? null;
}

async function selectPaymentAccountByNicknameOrAlias(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  params: {
    kind?: FinancePaymentInstrumentKind | null;
    normalizedNickname?: string | null;
    normalizedAlias?: string | null;
    paymentInstitutionId?: number | null;
  },
): Promise<Array<FinancePaymentAccount & { institutionName: string; institutionKind: FinancePaymentInstitutionKind }>> {
  const conditions = [
    eq(financePaymentAccounts.tenantId, scope.tenantId),
    eq(financePaymentAccounts.projectId, scope.projectId),
    eq(financePaymentAccounts.ownerUserId, scope.ownerUserId),
  ];

  if (params.kind) {
    conditions.push(eq(financePaymentAccounts.kind, params.kind));
  }
  if (params.paymentInstitutionId) {
    conditions.push(eq(financePaymentAccounts.paymentInstitutionId, params.paymentInstitutionId));
  }

  const searchConditions = [];
  if (params.normalizedNickname) {
    searchConditions.push(eq(financePaymentAccounts.normalizedNickname, params.normalizedNickname));
  }

  let aliasExists = null;
  if (params.normalizedAlias) {
    aliasExists = sql<boolean>`exists (
      select 1
      from finance_payment_account_aliases alias
      where alias.payment_account_id = ${financePaymentAccounts.id}
        and alias.tenant_id = ${scope.tenantId}
        and alias.project_id = ${scope.projectId}
        and alias.owner_user_id = ${scope.ownerUserId}
        and alias.normalized_alias = ${params.normalizedAlias}
    )`;
  }

  const filtered = await db
    .select({
      id: financePaymentAccounts.id,
      tenantId: financePaymentAccounts.tenantId,
      projectId: financePaymentAccounts.projectId,
      ownerUserId: financePaymentAccounts.ownerUserId,
      paymentInstitutionId: financePaymentAccounts.paymentInstitutionId,
      kind: financePaymentAccounts.kind,
      nickname: financePaymentAccounts.nickname,
      normalizedNickname: financePaymentAccounts.normalizedNickname,
      last4: financePaymentAccounts.last4,
      maskedIdentifier: financePaymentAccounts.maskedIdentifier,
      usageCount: financePaymentAccounts.usageCount,
      lastSeenAt: financePaymentAccounts.lastSeenAt,
      isPrimary: financePaymentAccounts.isPrimary,
      archivedAt: financePaymentAccounts.archivedAt,
      allowedScopes: financePaymentAccounts.allowedScopes,
      createdAt: financePaymentAccounts.createdAt,
      updatedAt: financePaymentAccounts.updatedAt,
      institutionName: financePaymentInstitutions.displayName,
      institutionKind: financePaymentInstitutions.kind,
    })
    .from(financePaymentAccounts)
    .innerJoin(financePaymentInstitutions, eq(financePaymentAccounts.paymentInstitutionId, financePaymentInstitutions.id))
    .where(and(
      ...conditions,
      ...(searchConditions.length > 0 ? [or(...searchConditions)] : []),
      ...(aliasExists ? [aliasExists] : []),
    ))
    .orderBy(
      desc(financePaymentAccounts.isPrimary),
      desc(financePaymentAccounts.usageCount),
      desc(financePaymentAccounts.lastSeenAt),
      desc(financePaymentAccounts.updatedAt),
      asc(financePaymentAccounts.nickname),
      asc(financePaymentAccounts.id),
    );

  return filtered;
}

async function selectPaymentAccountById(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  paymentAccountId: number,
): Promise<(FinancePaymentAccount & { institutionName: string; institutionKind: FinancePaymentInstitutionKind }) | null> {
  const [row] = await db
    .select({
      id: financePaymentAccounts.id,
      tenantId: financePaymentAccounts.tenantId,
      projectId: financePaymentAccounts.projectId,
      ownerUserId: financePaymentAccounts.ownerUserId,
      paymentInstitutionId: financePaymentAccounts.paymentInstitutionId,
      kind: financePaymentAccounts.kind,
      nickname: financePaymentAccounts.nickname,
      normalizedNickname: financePaymentAccounts.normalizedNickname,
      last4: financePaymentAccounts.last4,
      maskedIdentifier: financePaymentAccounts.maskedIdentifier,
      usageCount: financePaymentAccounts.usageCount,
      lastSeenAt: financePaymentAccounts.lastSeenAt,
      isPrimary: financePaymentAccounts.isPrimary,
      archivedAt: financePaymentAccounts.archivedAt,
      allowedScopes: financePaymentAccounts.allowedScopes,
      createdAt: financePaymentAccounts.createdAt,
      updatedAt: financePaymentAccounts.updatedAt,
      institutionName: financePaymentInstitutions.displayName,
      institutionKind: financePaymentInstitutions.kind,
    })
    .from(financePaymentAccounts)
    .innerJoin(financePaymentInstitutions, eq(financePaymentAccounts.paymentInstitutionId, financePaymentInstitutions.id))
    .where(and(
      eq(financePaymentAccounts.id, paymentAccountId),
      eq(financePaymentAccounts.tenantId, scope.tenantId),
      eq(financePaymentAccounts.projectId, scope.projectId),
      eq(financePaymentAccounts.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);
  return row ?? null;
}

async function resolvePaymentInstitutionRecord(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  params: {
    displayName?: string | null;
    kind?: FinancePaymentInstitutionKind | null;
    allowInference?: boolean;
  },
): Promise<FinancePaymentInstitutionRecord | null> {
  const candidate = params.displayName?.trim()
    ? normalizePaymentInstitutionDisplayName(params.displayName)
    : null;

  if (!candidate) {
    return null;
  }

  const kind = params.kind ?? "bank";
  const normalizedName = buildPaymentInstrumentSearchKey(candidate);
  if (!normalizedName) {
    return null;
  }

  const existing = await selectPaymentInstitutionByAlias(db, scope, normalizedName)
    ?? await selectPaymentInstitutionByNormalizedName(db, scope, kind, normalizedName);

  if (existing) {
    const [updated] = await db
      .update(financePaymentInstitutions)
      .set({
        usageCount: sql`${financePaymentInstitutions.usageCount} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(financePaymentInstitutions.id, existing.id))
      .returning();

    const aliases = await loadPaymentInstitutionAliases(db, existing.id);
    return mapPaymentInstitutionRow(updated ?? existing, aliases);
  }

  const [inserted] = await db
    .insert(financePaymentInstitutions)
    .values({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      kind,
      displayName: candidate,
      normalizedName,
      usageCount: 1,
      lastSeenAt: new Date(),
      allowedScopes: scope.allowedScopes,
    })
    .returning();

  if (!inserted) {
    return null;
  }

  await db
    .insert(financePaymentInstitutionAliases)
    .values({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      paymentInstitutionId: inserted.id,
      aliasName: candidate,
      normalizedAlias: normalizedName,
      allowedScopes: scope.allowedScopes,
    })
    .onConflictDoNothing();

  return mapPaymentInstitutionRow(inserted, [candidate]);
}

async function resolvePaymentAccountRecord(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  params: {
    nickname?: string | null;
    last4?: string | null;
    maskedIdentifier?: string | null;
    institutionName?: string | null;
    institutionKind?: FinancePaymentInstitutionKind | null;
    kind?: FinancePaymentInstrumentKind | null;
    allowInference?: boolean;
  },
): Promise<FinancePaymentAccountRecord | null> {
  const candidateNickname = params.nickname?.trim()
    ? normalizePaymentAccountNickname(params.nickname)
    : null;
  const candidateInstitution = params.institutionName?.trim()
    ? normalizePaymentInstitutionDisplayName(params.institutionName)
    : null;
  const last4 = normalizePaymentAccountLast4(params.last4);
  const maskedIdentifier = normalizePaymentMaskedIdentifier(params.maskedIdentifier);
  const kind = params.kind ?? "unknown";
  const institutionKind = params.institutionKind ?? "bank";

  if (!candidateNickname && !last4 && !maskedIdentifier && !candidateInstitution) {
    return null;
  }

  let institution: FinancePaymentInstitutionRecord | null = null;
  if (candidateInstitution) {
    institution = await resolvePaymentInstitutionRecord(db, scope, {
      displayName: candidateInstitution,
      kind: institutionKind,
    });
  }

  const normalizedNickname = candidateNickname ? buildPaymentInstrumentSearchKey(candidateNickname) : null;
  const normalizedAlias = normalizedNickname;
  const candidateRows = await selectPaymentAccountByNicknameOrAlias(db, scope, {
    kind,
    paymentInstitutionId: institution?.id ?? null,
    normalizedNickname,
    normalizedAlias,
  });

  let selected = candidateRows[0] ?? null;
  if (!selected && last4) {
    const rows = await db
      .select({
        id: financePaymentAccounts.id,
        tenantId: financePaymentAccounts.tenantId,
        projectId: financePaymentAccounts.projectId,
        ownerUserId: financePaymentAccounts.ownerUserId,
        paymentInstitutionId: financePaymentAccounts.paymentInstitutionId,
        kind: financePaymentAccounts.kind,
        nickname: financePaymentAccounts.nickname,
        normalizedNickname: financePaymentAccounts.normalizedNickname,
        last4: financePaymentAccounts.last4,
        maskedIdentifier: financePaymentAccounts.maskedIdentifier,
        usageCount: financePaymentAccounts.usageCount,
        lastSeenAt: financePaymentAccounts.lastSeenAt,
        isPrimary: financePaymentAccounts.isPrimary,
        archivedAt: financePaymentAccounts.archivedAt,
        allowedScopes: financePaymentAccounts.allowedScopes,
        createdAt: financePaymentAccounts.createdAt,
        updatedAt: financePaymentAccounts.updatedAt,
        institutionName: financePaymentInstitutions.displayName,
        institutionKind: financePaymentInstitutions.kind,
      })
      .from(financePaymentAccounts)
      .innerJoin(financePaymentInstitutions, eq(financePaymentAccounts.paymentInstitutionId, financePaymentInstitutions.id))
      .where(and(
        eq(financePaymentAccounts.tenantId, scope.tenantId),
        eq(financePaymentAccounts.projectId, scope.projectId),
        eq(financePaymentAccounts.ownerUserId, scope.ownerUserId),
        eq(financePaymentAccounts.kind, kind),
        eq(financePaymentAccounts.last4, last4),
      ))
      .orderBy(
        desc(financePaymentAccounts.isPrimary),
        desc(financePaymentAccounts.usageCount),
        desc(financePaymentAccounts.lastSeenAt),
        asc(financePaymentAccounts.nickname),
        asc(financePaymentAccounts.id),
      );
    selected = rows[0] ?? null;
  }

  if (!selected) {
    return null;
  }

  const [updated] = await db
    .update(financePaymentAccounts)
    .set({
      usageCount: sql`${financePaymentAccounts.usageCount} + 1`,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(financePaymentAccounts.id, selected.id))
    .returning();

  const aliases = await loadPaymentAccountAliases(db, selected.id);
  const resolvedRow = updated
    ? {
        ...updated,
        institutionName: selected.institutionName,
        institutionKind: selected.institutionKind,
      }
    : selected;
  return mapPaymentAccountRow(resolvedRow, aliases);
}

async function hydrateStructuredPaymentFields(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  draft: FinanceStructuredDraft,
  params: {
    sourceText?: string | null;
    documentRole?: FinanceStructuredDraft["documentRole"];
  } = {},
): Promise<FinanceStructuredDraft> {
  const paymentDirection = draft.paymentDirection ?? inferPaymentDirectionFromType(draft.type);
  const sourceText = params.sourceText ?? draft.note ?? draft.counterpartyName ?? "";
  const inferredPaymentDetails = inferPaymentDetailsFromText(
    sourceText,
    draft.type,
    params.documentRole ?? draft.documentRole ?? null,
  );
  const paymentMethodKind = draft.paymentMethodKind
    ?? inferredPaymentDetails.paymentMethodKind
    ?? inferPaymentMethodKindFromText(sourceText);
  const genericNickname = normalizePaymentAccountNickname(
    draft.paymentAccountNickname
    ?? draft.paymentSourceLabel
    ?? draft.paymentDestinationLabel
    ?? inferredPaymentDetails.paymentAccountNickname
    ?? "",
  ) || null;
  const sourceLabel = normalizePaymentAccountNickname(
    draft.paymentSourceLabel
    ?? inferredPaymentDetails.paymentSourceLabel
    ?? (paymentDirection !== "inbound" ? genericNickname ?? "" : ""),
  ) || null;
  const destinationLabel = normalizePaymentAccountNickname(
    draft.paymentDestinationLabel
    ?? inferredPaymentDetails.paymentDestinationLabel
    ?? (paymentDirection !== "outbound" ? genericNickname ?? "" : ""),
  ) || null;
  const sourceInstitutionName = draft.paymentSourceInstitutionName
    ?? inferredPaymentDetails.paymentSourceInstitutionName
    ?? null;
  const destinationInstitutionName = draft.paymentDestinationInstitutionName
    ?? inferredPaymentDetails.paymentDestinationInstitutionName
    ?? null;
  const paymentInstitutionName = draft.paymentInstitutionName
    ?? inferredPaymentDetails.paymentInstitutionName
    ?? null;
  const paymentAccountNickname = draft.paymentAccountNickname
    ?? inferredPaymentDetails.paymentAccountNickname
    ?? genericNickname
    ?? null;
  const paymentAccountLast4 = draft.paymentAccountLast4
    ?? inferredPaymentDetails.paymentAccountLast4
    ?? null;
  const paymentAccountMaskedIdentifier = draft.paymentAccountMaskedIdentifier
    ?? inferredPaymentDetails.paymentAccountMaskedIdentifier
    ?? null;

  const sourceInstrument = draft.paymentSourceAccountId
    ? await selectPaymentAccountById(db, scope, draft.paymentSourceAccountId)
    : sourceLabel || sourceInstitutionName || paymentAccountLast4
      ? await resolvePaymentAccountRecord(db, scope, {
          nickname: sourceLabel || genericNickname,
          last4: paymentAccountLast4,
          maskedIdentifier: paymentAccountMaskedIdentifier ?? (paymentAccountLast4 ? `••••${paymentAccountLast4}` : null),
          institutionName: sourceInstitutionName,
          kind: paymentMethodKind,
          allowInference: true,
        })
      : null;

  const destinationInstrument = draft.paymentDestinationAccountId
    ? await selectPaymentAccountById(db, scope, draft.paymentDestinationAccountId)
    : destinationLabel || destinationInstitutionName || paymentAccountLast4
      ? await resolvePaymentAccountRecord(db, scope, {
          nickname: destinationLabel || genericNickname,
          last4: paymentAccountLast4,
          maskedIdentifier: paymentAccountMaskedIdentifier ?? (paymentAccountLast4 ? `••••${paymentAccountLast4}` : null),
          institutionName: destinationInstitutionName,
          kind: paymentMethodKind,
          allowInference: true,
        })
      : null;

  const resolvedSource = sourceInstrument && paymentDirection !== "inbound" ? sourceInstrument : null;
  const resolvedDestination = destinationInstrument && paymentDirection !== "outbound" ? destinationInstrument : null;
  const resolvedAccount = resolvedSource ?? resolvedDestination ?? sourceInstrument ?? destinationInstrument;

  return {
    ...draft,
    documentRole: params.documentRole ?? draft.documentRole ?? null,
    paymentDirection,
    paymentMethodKind: resolvedAccount?.kind ?? paymentMethodKind,
    paymentSourceAccountId: resolvedSource?.id ?? draft.paymentSourceAccountId ?? null,
    paymentDestinationAccountId: resolvedDestination?.id ?? draft.paymentDestinationAccountId ?? null,
    paymentSourceLabel: resolvedSource?.nickname ?? sourceLabel ?? draft.paymentSourceLabel ?? null,
    paymentDestinationLabel: resolvedDestination?.nickname ?? destinationLabel ?? draft.paymentDestinationLabel ?? null,
    paymentSourceInstitutionName: resolvedSource?.institutionName ?? sourceInstitutionName ?? draft.paymentSourceInstitutionName ?? null,
    paymentDestinationInstitutionName: resolvedDestination?.institutionName ?? destinationInstitutionName ?? draft.paymentDestinationInstitutionName ?? null,
    paymentInstitutionName: resolvedAccount?.institutionName ?? paymentInstitutionName ?? draft.paymentInstitutionName ?? null,
    paymentAccountNickname: resolvedAccount?.nickname ?? paymentAccountNickname ?? draft.paymentAccountNickname ?? null,
    paymentAccountLast4: resolvedAccount?.last4 ?? paymentAccountLast4 ?? draft.paymentAccountLast4 ?? null,
    paymentAccountMaskedIdentifier: resolvedAccount?.maskedIdentifier ?? paymentAccountMaskedIdentifier ?? draft.paymentAccountMaskedIdentifier ?? null,
    paymentInstrumentConfidence: Math.max(
      Number(draft.paymentInstrumentConfidence ?? 0),
      resolvedAccount ? 0.9 : paymentMethodKind !== "unknown" ? 0.6 : 0.15,
    ),
  };
}

async function selectPaymentInstitutionById(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  paymentInstitutionId: number,
): Promise<FinancePaymentInstitution | null> {
  const [row] = await db
    .select()
    .from(financePaymentInstitutions)
    .where(and(
      eq(financePaymentInstitutions.id, paymentInstitutionId),
      eq(financePaymentInstitutions.tenantId, scope.tenantId),
      eq(financePaymentInstitutions.projectId, scope.projectId),
      eq(financePaymentInstitutions.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);
  return row ?? null;
}

async function resolvePaymentInstitutionByInput(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  params: {
    paymentInstitutionId?: number | null;
    paymentInstitutionName?: string | null;
    paymentInstitutionKind?: FinancePaymentInstitutionKind | null;
  },
): Promise<FinancePaymentInstitutionRecord | null> {
  if (params.paymentInstitutionId) {
    const existing = await selectPaymentInstitutionById(db, scope, params.paymentInstitutionId);
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Payment institution not found" });
    }
    return mapPaymentInstitutionRow(existing, await loadPaymentInstitutionAliases(db, existing.id));
  }

  if (!params.paymentInstitutionName?.trim()) {
    return null;
  }

  return await resolvePaymentInstitutionRecord(db, scope, {
    displayName: params.paymentInstitutionName,
    kind: params.paymentInstitutionKind ?? "bank",
  });
}

export async function listPaymentInstitutions(input: ListPaymentInstitutionsInput): Promise<FinancePaymentInstitutionRecord[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const query = normalizeText(input.query ?? "");
  const normalizedQuery = buildPaymentInstrumentSearchKey(query);
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const fetchLimit = query ? Math.min(Math.max(limit * 5, 25), 100) : limit;

  const conditions = [
    eq(financePaymentInstitutions.tenantId, scope.tenantId),
    eq(financePaymentInstitutions.projectId, scope.projectId),
    eq(financePaymentInstitutions.ownerUserId, scope.ownerUserId),
  ];

  if (input.kind) {
    conditions.push(eq(financePaymentInstitutions.kind, input.kind));
  }

  if (query) {
    const aliasExists = sql<boolean>`exists (
      select 1
      from finance_payment_institution_aliases alias
      where alias.payment_institution_id = ${financePaymentInstitutions.id}
        and alias.tenant_id = ${scope.tenantId}
        and alias.project_id = ${scope.projectId}
        and alias.owner_user_id = ${scope.ownerUserId}
        and (
          alias.normalized_alias ilike ${`%${normalizedQuery}%`}
          or alias.alias_name ilike ${`%${query}%`}
        )
    )`;

    const searchCondition = or(
      ilike(financePaymentInstitutions.displayName, `%${query}%`),
      ilike(financePaymentInstitutions.normalizedName, `%${normalizedQuery}%`),
      aliasExists,
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const candidateRows = await db
    .select()
    .from(financePaymentInstitutions)
    .where(and(...conditions))
    .orderBy(
      desc(financePaymentInstitutions.usageCount),
      desc(financePaymentInstitutions.lastSeenAt),
      desc(financePaymentInstitutions.updatedAt),
      asc(financePaymentInstitutions.displayName),
      asc(financePaymentInstitutions.id),
    )
    .limit(fetchLimit);

  const aliasMap = await loadPaymentInstitutionAliasesForInstitutions(
    db,
    candidateRows.map((row) => row.id),
  );

  const queryKey = normalizedQuery;
  const filteredRows = queryKey
    ? candidateRows.filter((row) => {
        const aliases = aliasMap.get(row.id) ?? [];
        const normalizedDisplay = buildPaymentInstrumentSearchKey(row.displayName);
        return normalizedDisplay.includes(queryKey)
          || row.normalizedName.includes(queryKey)
          || aliases.some((alias) => buildPaymentInstrumentSearchKey(alias).includes(queryKey));
      })
    : candidateRows;

  return filteredRows.slice(0, limit).map((row) => mapPaymentInstitutionRow(row, aliasMap.get(row.id) ?? []));
}

export async function listPaymentAccounts(input: ListPaymentAccountsInput): Promise<FinancePaymentAccountSuggestion[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const query = normalizeText(input.query ?? "");
  const normalizedQuery = buildPaymentInstrumentSearchKey(query);
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const fetchLimit = query ? Math.min(Math.max(limit * 5, 25), 100) : limit;

  const conditions = [
    eq(financePaymentAccounts.tenantId, scope.tenantId),
    eq(financePaymentAccounts.projectId, scope.projectId),
    eq(financePaymentAccounts.ownerUserId, scope.ownerUserId),
  ];

  if (!input.includeArchived) {
    conditions.push(isNull(financePaymentAccounts.archivedAt));
  }
  if (input.kind) {
    conditions.push(eq(financePaymentAccounts.kind, input.kind));
  }
  if (input.paymentInstitutionId) {
    conditions.push(eq(financePaymentAccounts.paymentInstitutionId, input.paymentInstitutionId));
  }

  if (query) {
    const aliasExists = sql<boolean>`exists (
      select 1
      from finance_payment_account_aliases alias
      where alias.payment_account_id = ${financePaymentAccounts.id}
        and alias.tenant_id = ${scope.tenantId}
        and alias.project_id = ${scope.projectId}
        and alias.owner_user_id = ${scope.ownerUserId}
        and (
          alias.normalized_alias ilike ${`%${normalizedQuery}%`}
          or alias.alias_name ilike ${`%${query}%`}
        )
    )`;

    const searchCondition = or(
      ilike(financePaymentAccounts.nickname, `%${query}%`),
      ilike(financePaymentAccounts.normalizedNickname, `%${normalizedQuery}%`),
      ilike(financePaymentAccounts.last4, `%${normalizedQuery.replace(/\D+/g, "")}%`),
      aliasExists,
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const candidateRows = await db
    .select({
      id: financePaymentAccounts.id,
      tenantId: financePaymentAccounts.tenantId,
      projectId: financePaymentAccounts.projectId,
      ownerUserId: financePaymentAccounts.ownerUserId,
      paymentInstitutionId: financePaymentAccounts.paymentInstitutionId,
      kind: financePaymentAccounts.kind,
      nickname: financePaymentAccounts.nickname,
      normalizedNickname: financePaymentAccounts.normalizedNickname,
      last4: financePaymentAccounts.last4,
      maskedIdentifier: financePaymentAccounts.maskedIdentifier,
      usageCount: financePaymentAccounts.usageCount,
      lastSeenAt: financePaymentAccounts.lastSeenAt,
      isPrimary: financePaymentAccounts.isPrimary,
      archivedAt: financePaymentAccounts.archivedAt,
      allowedScopes: financePaymentAccounts.allowedScopes,
      createdAt: financePaymentAccounts.createdAt,
      updatedAt: financePaymentAccounts.updatedAt,
      institutionName: financePaymentInstitutions.displayName,
      institutionKind: financePaymentInstitutions.kind,
    })
    .from(financePaymentAccounts)
    .innerJoin(financePaymentInstitutions, eq(financePaymentAccounts.paymentInstitutionId, financePaymentInstitutions.id))
    .where(and(...conditions))
    .orderBy(
      desc(financePaymentAccounts.isPrimary),
      desc(financePaymentAccounts.usageCount),
      desc(financePaymentAccounts.lastSeenAt),
      desc(financePaymentAccounts.updatedAt),
      asc(financePaymentAccounts.nickname),
      asc(financePaymentAccounts.id),
    )
    .limit(fetchLimit);

  const aliasMap = await loadPaymentAccountAliasesForAccounts(
    db,
    candidateRows.map((row) => row.id),
  );

  const queryKey = normalizedQuery;
  const filteredRows = queryKey
    ? candidateRows.filter((row) => {
        const aliases = aliasMap.get(row.id) ?? [];
        const normalizedDisplay = buildPaymentInstrumentSearchKey(row.nickname);
        const last4Match = row.last4 ? row.last4.includes(queryKey.replace(/\D+/g, "")) : false;
        return normalizedDisplay.includes(queryKey)
          || buildPaymentInstrumentSearchKey(row.institutionName).includes(queryKey)
          || row.maskedIdentifier?.toLowerCase().includes(queryKey) === true
          || last4Match
          || aliases.some((alias) => buildPaymentInstrumentSearchKey(alias).includes(queryKey));
      })
    : candidateRows;

  return filteredRows.slice(0, limit).map((row) => mapPaymentAccountSuggestion(row, aliasMap.get(row.id) ?? []));
}

export async function upsertPaymentInstitution(input: UpsertPaymentInstitutionInput): Promise<FinancePaymentInstitutionRecord> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const displayName = normalizePaymentInstitutionDisplayName(input.displayName);
  if (!displayName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment institution name cannot be empty" });
  }

  const kind = input.kind ?? "bank";
  const aliasCandidates = Array.from(new Set([
    displayName,
    ...(input.aliases ?? []).map((alias) => normalizePaymentInstitutionDisplayName(alias)).filter(Boolean),
  ]));

  const resolved = await resolvePaymentInstitutionRecord(db, scope, {
    displayName,
    kind,
  });
  if (!resolved) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create or resolve payment institution" });
  }

  for (const alias of aliasCandidates) {
    const normalizedAlias = buildPaymentInstrumentSearchKey(alias);
    if (!normalizedAlias) {
      continue;
    }
    await db
      .insert(financePaymentInstitutionAliases)
      .values({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        ownerUserId: scope.ownerUserId,
        paymentInstitutionId: resolved.id,
        aliasName: alias,
        normalizedAlias,
        allowedScopes: scope.allowedScopes,
      })
      .onConflictDoNothing();
  }

  const refreshed = await selectPaymentInstitutionById(db, scope, resolved.id);
  return mapPaymentInstitutionRow(refreshed ?? {
    id: resolved.id,
    tenantId: resolved.tenantId,
    projectId: resolved.projectId,
    ownerUserId: resolved.ownerUserId,
    kind: resolved.kind,
    displayName: resolved.displayName,
    normalizedName: resolved.normalizedName,
    usageCount: resolved.usageCount,
    lastSeenAt: resolved.lastSeenAt ? new Date(resolved.lastSeenAt) : null,
    allowedScopes: resolved.allowedScopes,
    createdAt: resolved.createdAt,
    updatedAt: resolved.updatedAt,
  } as FinancePaymentInstitution, await loadPaymentInstitutionAliases(db, resolved.id));
}

export async function upsertPaymentAccount(input: UpsertPaymentAccountInput): Promise<FinancePaymentAccountRecord> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const nickname = normalizePaymentAccountNickname(input.nickname);
  if (!nickname) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment account nickname cannot be empty" });
  }

  const institution = await resolvePaymentInstitutionByInput(db, scope, {
    paymentInstitutionId: input.paymentInstitutionId ?? null,
    paymentInstitutionName: input.paymentInstitutionName ?? null,
    paymentInstitutionKind: input.paymentInstitutionKind ?? null,
  });
  if (!institution) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment institution is required" });
  }

  const last4 = normalizePaymentAccountLast4(input.last4);
  const maskedIdentifier = normalizePaymentMaskedIdentifier(input.maskedIdentifier);
  const kind = input.kind;
  const aliasCandidates = Array.from(new Set([
    nickname,
    ...(input.aliases ?? []).map((alias) => normalizePaymentAccountNickname(alias)).filter(Boolean),
  ]));

  const existingRows = await selectPaymentAccountByNicknameOrAlias(db, scope, {
    kind,
    paymentInstitutionId: institution.id,
    normalizedNickname: buildPaymentInstrumentSearchKey(nickname),
    normalizedAlias: buildPaymentInstrumentSearchKey(nickname),
  });
  let existing = existingRows[0] ?? null;
  if (!existing && last4) {
    const [byLast4] = await db
      .select({
        id: financePaymentAccounts.id,
        tenantId: financePaymentAccounts.tenantId,
        projectId: financePaymentAccounts.projectId,
        ownerUserId: financePaymentAccounts.ownerUserId,
        paymentInstitutionId: financePaymentAccounts.paymentInstitutionId,
        kind: financePaymentAccounts.kind,
        nickname: financePaymentAccounts.nickname,
        normalizedNickname: financePaymentAccounts.normalizedNickname,
        last4: financePaymentAccounts.last4,
        maskedIdentifier: financePaymentAccounts.maskedIdentifier,
        usageCount: financePaymentAccounts.usageCount,
        lastSeenAt: financePaymentAccounts.lastSeenAt,
        isPrimary: financePaymentAccounts.isPrimary,
        archivedAt: financePaymentAccounts.archivedAt,
        allowedScopes: financePaymentAccounts.allowedScopes,
        createdAt: financePaymentAccounts.createdAt,
        updatedAt: financePaymentAccounts.updatedAt,
        institutionName: financePaymentInstitutions.displayName,
        institutionKind: financePaymentInstitutions.kind,
      })
      .from(financePaymentAccounts)
      .innerJoin(financePaymentInstitutions, eq(financePaymentAccounts.paymentInstitutionId, financePaymentInstitutions.id))
      .where(and(
        eq(financePaymentAccounts.tenantId, scope.tenantId),
        eq(financePaymentAccounts.projectId, scope.projectId),
        eq(financePaymentAccounts.ownerUserId, scope.ownerUserId),
        eq(financePaymentAccounts.paymentInstitutionId, institution.id),
        eq(financePaymentAccounts.kind, kind),
        eq(financePaymentAccounts.last4, last4),
      ))
      .limit(1);
    existing = byLast4 ?? null;
  }

  if (existing) {
    const [updated] = await db
      .update(financePaymentAccounts)
      .set({
        nickname,
        normalizedNickname: buildPaymentInstrumentSearchKey(nickname),
        last4,
        maskedIdentifier,
        isPrimary: input.isPrimary ?? existing.isPrimary,
        archivedAt: input.archivedAt ?? existing.archivedAt,
        usageCount: sql`${financePaymentAccounts.usageCount} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(financePaymentAccounts.id, existing.id))
      .returning();

    for (const alias of aliasCandidates) {
      const normalizedAlias = buildPaymentInstrumentSearchKey(alias);
      if (!normalizedAlias) {
        continue;
      }
      await db
        .insert(financePaymentAccountAliases)
        .values({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          ownerUserId: scope.ownerUserId,
          paymentAccountId: existing.id,
          aliasName: alias,
          normalizedAlias,
          allowedScopes: scope.allowedScopes,
        })
        .onConflictDoNothing();
    }

    if (input.isPrimary) {
      await db
        .update(financePaymentAccounts)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(financePaymentAccounts.tenantId, scope.tenantId),
          eq(financePaymentAccounts.projectId, scope.projectId),
          eq(financePaymentAccounts.ownerUserId, scope.ownerUserId),
          eq(financePaymentAccounts.paymentInstitutionId, institution.id),
          eq(financePaymentAccounts.kind, kind),
          sql`${financePaymentAccounts.id} <> ${existing.id}`,
        ));
      await db
        .update(financePaymentAccounts)
        .set({
          isPrimary: true,
          updatedAt: new Date(),
        })
        .where(eq(financePaymentAccounts.id, existing.id));
    }

    const aliases = await loadPaymentAccountAliases(db, existing.id);
    const resolvedRow = updated
      ? {
          ...updated,
          institutionName: existing.institutionName,
          institutionKind: existing.institutionKind,
        }
      : {
          ...existing,
          nickname,
          normalizedNickname: buildPaymentInstrumentSearchKey(nickname),
          last4,
          maskedIdentifier,
          archivedAt: input.archivedAt ?? existing.archivedAt,
          isPrimary: input.isPrimary ?? existing.isPrimary,
        };
    return mapPaymentAccountRow(resolvedRow, aliases);
  }

  const [inserted] = await db
    .insert(financePaymentAccounts)
    .values({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      paymentInstitutionId: institution.id,
      kind,
      nickname,
      normalizedNickname: buildPaymentInstrumentSearchKey(nickname),
      last4,
      maskedIdentifier,
      usageCount: 1,
      lastSeenAt: new Date(),
      isPrimary: input.isPrimary ?? false,
      archivedAt: input.archivedAt ?? null,
      allowedScopes: scope.allowedScopes,
    })
    .returning();

  if (!inserted) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create payment account" });
  }

  for (const alias of aliasCandidates) {
    const normalizedAlias = buildPaymentInstrumentSearchKey(alias);
    if (!normalizedAlias) {
      continue;
    }
    await db
      .insert(financePaymentAccountAliases)
      .values({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        ownerUserId: scope.ownerUserId,
        paymentAccountId: inserted.id,
        aliasName: alias,
        normalizedAlias,
        allowedScopes: scope.allowedScopes,
      })
      .onConflictDoNothing();
  }

  if (input.isPrimary) {
    await db
      .update(financePaymentAccounts)
      .set({
        isPrimary: false,
        updatedAt: new Date(),
      })
      .where(and(
        eq(financePaymentAccounts.tenantId, scope.tenantId),
        eq(financePaymentAccounts.projectId, scope.projectId),
        eq(financePaymentAccounts.ownerUserId, scope.ownerUserId),
        eq(financePaymentAccounts.paymentInstitutionId, institution.id),
        eq(financePaymentAccounts.kind, kind),
        sql`${financePaymentAccounts.id} <> ${inserted.id}`,
      ));
    await db
      .update(financePaymentAccounts)
      .set({
        isPrimary: true,
        updatedAt: new Date(),
      })
      .where(eq(financePaymentAccounts.id, inserted.id));
  }

  const refreshed = await selectPaymentAccountById(db, scope, inserted.id);
  return mapPaymentAccountRow(refreshed ?? {
    ...inserted,
    institutionName: institution.displayName,
    institutionKind: institution.kind,
  }, await loadPaymentAccountAliases(db, inserted.id));
}

export async function archivePaymentAccount(input: ArchivePaymentAccountInput): Promise<FinancePaymentAccountRecord> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const existing = await selectPaymentAccountById(db, scope, input.paymentAccountId);
  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Payment account not found" });
  }

  const [updated] = await db
    .update(financePaymentAccounts)
    .set({
      archivedAt: new Date(),
      isPrimary: false,
      updatedAt: new Date(),
    })
    .where(eq(financePaymentAccounts.id, existing.id))
    .returning();

  return mapPaymentAccountRow(
    updated
      ? {
          ...updated,
          institutionName: existing.institutionName,
          institutionKind: existing.institutionKind,
        }
      : existing,
    await loadPaymentAccountAliases(db, existing.id),
  );
}

export async function listCounterparties(input: ListCounterpartiesInput): Promise<FinanceCounterpartySuggestion[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const query = normalizeText(input.query ?? "");
  const normalizedQuery = buildCounterpartySearchKey(query);
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const fetchLimit = query ? Math.min(Math.max(limit * 5, 25), 100) : limit;

  const conditions = [
    eq(financeCounterparties.tenantId, scope.tenantId),
    eq(financeCounterparties.projectId, scope.projectId),
    eq(financeCounterparties.ownerUserId, scope.ownerUserId),
  ];

  if (query) {
    const aliasExists = sql<boolean>`exists (
      select 1
      from finance_counterparty_aliases alias
      where alias.counterparty_id = ${financeCounterparties.id}
        and alias.tenant_id = ${scope.tenantId}
        and alias.project_id = ${scope.projectId}
        and alias.owner_user_id = ${scope.ownerUserId}
        and (
          alias.normalized_alias ilike ${`%${normalizedQuery}%`}
          or alias.alias_name ilike ${`%${query}%`}
        )
    )`;

    const searchCondition = or(
      ilike(financeCounterparties.displayName, `%${query}%`),
      ilike(financeCounterparties.normalizedName, `%${normalizedQuery}%`),
      aliasExists,
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const candidateRows = await db
    .select()
    .from(financeCounterparties)
    .where(and(...conditions))
    .orderBy(
      desc(financeCounterparties.usageCount),
      desc(financeCounterparties.lastSeenAt),
      desc(financeCounterparties.updatedAt),
      asc(financeCounterparties.displayName),
      asc(financeCounterparties.id),
    )
    .limit(fetchLimit);

  const aliasMap = await loadCounterpartyAliasesForCounterparties(
    db,
    candidateRows.map((row) => row.id),
  );

  const queryKey = normalizedQuery;
  const filteredRows = queryKey
    ? candidateRows.filter((row) => {
        const aliases = aliasMap.get(row.id) ?? [];
        const normalizedDisplay = buildCounterpartySearchKey(row.displayName);
        return normalizedDisplay.includes(queryKey)
          || row.normalizedName.includes(queryKey)
          || aliases.some((alias) => buildCounterpartySearchKey(alias).includes(queryKey));
      })
    : candidateRows;

  return filteredRows
    .slice(0, limit)
    .map((row) => mapCounterpartySuggestion(row, aliasMap.get(row.id) ?? []));
}

export interface ListMerchantPinCandidatesInput {
  tenantId: string;
  query?: string | null;
  limit?: number;
}

export async function listMerchantPinCandidates(
  input: ListMerchantPinCandidatesInput,
): Promise<FinanceCounterpartySuggestion[]> {
  const db = await getDb();
  ensureDb(db);

  const query = normalizeText(input.query ?? "");
  const normalizedQuery = buildCounterpartySearchKey(query);
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const fetchLimit = query ? Math.min(Math.max(limit * 5, 25), 100) : limit;

  const conditions = [
    eq(financeCounterparties.tenantId, input.tenantId),
  ];

  if (query) {
    const aliasExists = sql<boolean>`exists (
      select 1
      from finance_counterparty_aliases alias
      where alias.counterparty_id = ${financeCounterparties.id}
        and alias.tenant_id = ${input.tenantId}
        and (
          alias.normalized_alias ilike ${`%${normalizedQuery}%`}
          or alias.alias_name ilike ${`%${query}%`}
        )
    )`;

    const searchCondition = or(
      ilike(financeCounterparties.displayName, `%${query}%`),
      ilike(financeCounterparties.normalizedName, `%${normalizedQuery}%`),
      aliasExists,
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const candidateRows = await db
    .select()
    .from(financeCounterparties)
    .where(and(...conditions))
    .orderBy(
      desc(financeCounterparties.usageCount),
      desc(financeCounterparties.lastSeenAt),
      desc(financeCounterparties.updatedAt),
      asc(financeCounterparties.displayName),
      asc(financeCounterparties.id),
    )
    .limit(fetchLimit);

  const aliasMap = await loadCounterpartyAliasesForCounterparties(
    db,
    candidateRows.map((row) => row.id),
  );

  const merged = new Map<string, { row: FinanceCounterparty; aliases: string[] }>();
  for (const row of candidateRows) {
    const aliases = aliasMap.get(row.id) ?? [];
    const existing = merged.get(row.normalizedName);
    if (!existing) {
      merged.set(row.normalizedName, { row, aliases: [...aliases] });
      continue;
    }

    const nextAliases = new Set([...existing.aliases, ...aliases]);
    const rowIsBetter =
      row.usageCount > existing.row.usageCount
      || (
        row.usageCount === existing.row.usageCount
        && (
          (row.lastSeenAt?.getTime() ?? 0) > (existing.row.lastSeenAt?.getTime() ?? 0)
          || (
            (row.lastSeenAt?.getTime() ?? 0) === (existing.row.lastSeenAt?.getTime() ?? 0)
            && row.id < existing.row.id
          )
        )
      );

    merged.set(row.normalizedName, {
      row: rowIsBetter ? row : existing.row,
      aliases: Array.from(nextAliases),
    });
  }

  const filteredRows = query
    ? Array.from(merged.values()).filter(({ row, aliases }) => {
      const queryKey = normalizedQuery;
      const normalizedDisplay = buildCounterpartySearchKey(row.displayName);
      return normalizedDisplay.includes(queryKey)
        || row.normalizedName.includes(queryKey)
        || aliases.some((alias) => buildCounterpartySearchKey(alias).includes(queryKey));
    })
    : Array.from(merged.values());

  return filteredRows
    .slice(0, limit)
    .map(({ row, aliases }) => mapCounterpartySuggestion(row, aliases));
}

async function insertDraftWithIdempotency(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  draft: InsertFinanceDraft,
): Promise<FinanceDraftRecord> {
  try {
    const [inserted] = await db
      .insert(financeDrafts)
      .values(draft)
      .returning();
    if (!inserted) {
      throw new Error("Draft insert returned no rows");
    }
    return mapDraftRow(inserted);
  } catch (error: any) {
    if (error?.code === "23505") {
      const existing = await selectExistingDraft(db, scope, {
        idempotencyKey: draft.idempotencyKey,
        sourceHash: draft.sourceHash ?? null,
      });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

async function insertRecurringRuleWithIdempotency(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  rule: InsertFinanceRecurringRule,
): Promise<FinanceRecurringRule> {
  try {
    const [inserted] = await db
      .insert(financeRecurringRules)
      .values(rule)
      .returning();
    if (!inserted) {
      throw new Error("Recurring rule insert returned no rows");
    }
    return inserted;
  } catch (error: any) {
    if (error?.code === "23505") {
      const [existing] = await db
        .select()
        .from(financeRecurringRules)
        .where(and(
          eq(financeRecurringRules.tenantId, scope.tenantId),
          eq(financeRecurringRules.idempotencyKey, rule.idempotencyKey),
          eq(financeRecurringRules.projectId, scope.projectId),
          eq(financeRecurringRules.ownerUserId, scope.ownerUserId),
        ))
        .limit(1);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

function buildListRange(limit?: number, offset?: number) {
  return {
    limit: limit ?? 10,
    offset: offset ?? 0,
  };
}

async function createTransactionFromDraft(
  db: FinanceDbExecutor,
  scope: FinanceScope,
  draft: FinanceDraftRecord,
  options: { idempotencyKey?: string; confirmedAt?: Date; confirmUserId: number },
): Promise<FinanceTransaction> {
  const transactionIdempotency = options.idempotencyKey ?? `finance-confirm:${draft.id}`;
  const draftPayload = materializeDraftPayload(draft);
  const semanticSubject = buildFinanceSemanticDuplicateSubjectFromDraft(draftPayload);
  const semanticFingerprint = buildFinanceSemanticDuplicateFingerprint(semanticSubject);
  const [existingTransaction] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.confirmedFromDraftId, draft.id),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .limit(1);

  if (existingTransaction) {
    return existingTransaction;
  }

  const [existingSemanticTransaction] = await db
    .select()
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
      eq(financeTransactions.semanticFingerprint, semanticFingerprint),
      isNull(financeTransactions.voidedAt),
    ))
    .limit(1);
  if (existingSemanticTransaction) {
    return existingSemanticTransaction;
  }

  const occurredAt = new Date(draft.occurredAt);
  if (Number.isFinite(occurredAt.getTime())) {
    const windowStart = new Date(occurredAt.getTime() - 86_400_000);
    const windowEnd = new Date(occurredAt.getTime() + 86_400_000);
    const semanticTransactionCandidates = await db
      .select()
      .from(financeTransactions)
      .where(and(
        eq(financeTransactions.tenantId, scope.tenantId),
        eq(financeTransactions.projectId, scope.projectId),
        eq(financeTransactions.ownerUserId, scope.ownerUserId),
        eq(financeTransactions.type, draft.type),
        eq(financeTransactions.amountMinor, draft.amountMinor),
        eq(financeTransactions.currency, draft.currency),
        gte(financeTransactions.occurredAt, windowStart),
        lt(financeTransactions.occurredAt, windowEnd),
        isNull(financeTransactions.voidedAt),
      ))
      .orderBy(desc(financeTransactions.occurredAt))
      .limit(200);

    for (const candidate of semanticTransactionCandidates) {
      const candidateFingerprint = buildFinanceSemanticDuplicateFingerprint(
        buildFinanceSemanticDuplicateSubjectFromTransaction(candidate),
      );
      if (candidateFingerprint === semanticFingerprint) {
        return candidate;
      }
    }
  }

  let resolvedCounterparty: FinanceCounterpartyRecord | null = null;
  if (!draftPayload.counterpartyId) {
    resolvedCounterparty = await resolveCounterpartyRecord(db, scope, {
      counterpartyName: draftPayload.counterpartyName ?? draftPayload.merchantName ?? null,
      sourceText: draftPayload.note ?? null,
      typeHint: draft.type,
      allowInference: false,
    });
  }
  const counterpartyId = draftPayload.counterpartyId ?? resolvedCounterparty?.id ?? null;
  const counterpartyName = resolvedCounterparty?.displayName
    ?? draftPayload.counterpartyName
    ?? draftPayload.merchantName
    ?? null;
  const paymentMethodKind = draftPayload.paymentMethodKind ?? "unknown";
  const paymentDirection = draftPayload.paymentDirection ?? inferPaymentDirectionFromType(draft.type);
  const paymentInstrumentConfidence = toFinanceConfidenceValue(draftPayload.paymentInstrumentConfidence ?? null);
  const [insertedTransaction] = await db
    .insert(financeTransactions)
    .values({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      type: draft.type,
      status: "confirmed",
      source: draft.source,
      amountMinor: draft.amountMinor,
      currency: draft.currency,
      occurredAt: new Date(draft.occurredAt),
      categoryCode: draft.categoryCode,
      counterpartyId,
      counterpartyName,
      merchantName: counterpartyName ?? draft.merchantName ?? null,
      note: draft.note ?? null,
      slipReference: draftPayload.slipReference ?? null,
      merchantId: draftPayload.merchantId ?? null,
      paymentFeeMinor: draftPayload.paymentFeeMinor ?? null,
      paymentSourceAccountId: draftPayload.paymentSourceAccountId ?? null,
      paymentDestinationAccountId: draftPayload.paymentDestinationAccountId ?? null,
      paymentSourceName: draftPayload.paymentSourceName ?? null,
      paymentDestinationName: draftPayload.paymentDestinationName ?? null,
      paymentMethodKind,
      paymentDirection,
      paymentInstrumentConfidence,
      confidence: draft.confidence ?? null,
      idempotencyKey: transactionIdempotency,
      sourceHash: draft.sourceHash ?? null,
      semanticFingerprint,
      confirmedFromDraftId: draft.id,
      recurringRuleId: draft.recurringRuleId ?? null,
      sourceMessageId: draft.sourceMessageId ?? null,
      sourceLibraryItemId: draft.sourceLibraryItemId ?? null,
      confirmedAt: options.confirmedAt ?? new Date(),
      confirmedByUserId: options.confirmUserId,
      allowedScopes: draft.allowedScopes,
    })
    .returning();

  if (!insertedTransaction) {
    throw new Error("Transaction insert returned no rows");
  }

  if (draft.sourceLibraryItemId) {
    const role = draftPayload.documentRole
      ? financeDocumentRoleSchema.parse(draftPayload.documentRole)
      : draft.source === "ocr_document"
        ? "receipt"
        : "supporting";
    await db
      .insert(financeTransactionDocuments)
      .values({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        ownerUserId: scope.ownerUserId,
        transactionId: insertedTransaction.id,
        libraryItemId: draft.sourceLibraryItemId,
        sourceExtractionId: typeof draftPayload.documentExtractionId === "number"
          ? draftPayload.documentExtractionId
          : null,
        role,
        note: draft.note ?? null,
        allowedScopes: draft.allowedScopes,
      })
      .onConflictDoNothing();
  }

  await db
    .update(financeDrafts)
    .set({
      status: "confirmed",
      updatedAt: new Date(),
    })
    .where(eq(financeDrafts.id, draft.id));

  return insertedTransaction;
}

export async function parseTextToDraft(input: ParseTextToDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const conversation = await getConversationById(input.conversationId, input.userId);
  if (!conversation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
  }

  const scope = buildScopeFromConversation(conversation, input.userId, input.tenantId);
  const normalizedText = normalizeText(input.text);
  if (!normalizedText) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Finance text cannot be empty" });
  }
  const normalizedCategoryHint = normalizeText(input.categoryHint ?? "");
  const parsedOccurredAt = input.occurredAt ? new Date(input.occurredAt) : null;
  const resolvedOccurredAt = parsedOccurredAt && Number.isFinite(parsedOccurredAt.getTime())
    ? parsedOccurredAt.toISOString()
    : null;

  const sourceMessageId = input.sourceMessageId ?? null;
  const sourceHash = computeBaseSourceHash([
    scope.tenantId,
    scope.projectId,
    scope.ownerUserId,
    "chat_text",
    normalizedText,
    resolvedOccurredAt ?? "",
  ]);
  const normalizedTypeHint = input.typeHint && input.typeHint !== "transfer"
    ? input.typeHint
    : input.typeHint ?? null;
  const idempotencyKey = input.idempotencyKey ?? toIdempotencyKey("finance-draft-text", [
    scope.tenantId,
    scope.projectId,
    scope.ownerUserId,
    sourceMessageId ?? sourceHash,
    sourceHash,
    resolvedOccurredAt ?? "",
  ]);

  const existing = await selectExistingDraft(db, scope, {
    idempotencyKey,
    sourceHash,
  });
  if (existing) {
    return existing;
  }

  let structuredData: FinanceStructuredDraft;
  let usedFallback = false;

  try {
    const structured = await callLLMStructured<FinanceStructuredDraft>({
      systemPrompt: [
        "You extract a single finance transaction draft from user text.",
        "Do not change the tenant, project, or owner.",
        resolvedOccurredAt
          ? `The user has already selected the transaction timestamp. Use it unless the text explicitly conflicts: ${resolvedOccurredAt}.`
          : "If the text includes a clear date or time, use it. Otherwise infer the best timestamp from the current context.",
        normalizedTypeHint
          ? `The user provided a type hint. Prefer it when the text is ambiguous: ${normalizedTypeHint}.`
          : "Infer the transaction type from context. If the text is clearly about income, expense, or transfer, choose the closest type.",
        normalizedCategoryHint
          ? `A user-provided category hint is available. Prefer it when the text is ambiguous: ${normalizedCategoryHint}.`
          : "Use the most specific categoryCode that matches the text. If the category is unclear, choose a useful custom categoryCode and set needsClarification when needed.",
        input.paymentSourceAccountId || input.paymentDestinationAccountId || input.paymentAccountNickname || input.paymentInstitutionName
          ? "The user already selected a payment account/card. Preserve the selected payment instrument fields when they are provided."
          : "If the text mentions a bank account or card used to pay or receive money, fill payment fields with the canonical account nickname, institution name, and last4 when visible.",
        "When a transfer slip shows different banks for sender and receiver, keep paymentSourceInstitutionName and paymentDestinationInstitutionName separate instead of collapsing them into one institution field.",
        "If the text looks like a transfer slip, set documentRole to transfer_slip and preserve both source and destination payment hints when available.",
        "If the text mentions who was paid or who paid the user, set counterpartyName to that person or organization.",
        "If a merchant or business name is visible, use that as counterpartyName / merchantName instead of inventing a new label.",
        "If sender and receiver names are visible, extract them into paymentSourceName and paymentDestinationName.",
        "If the text shows a fee, reference number, or merchant id, extract them into paymentFeeMinor, slipReference, and merchantId when visible.",
        "Return only valid JSON matching the schema.",
        "Use missingFields and needsClarification when the user text does not provide enough detail.",
      ].join("\n"),
      userMessage: JSON.stringify({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        personal: scope.personal,
        text: normalizedText,
        occurredAt: resolvedOccurredAt,
        typeHint: normalizedTypeHint,
        categoryHint: normalizedCategoryHint || null,
        sourceMessageId,
        paymentMethodKind: input.paymentMethodKind ?? null,
        paymentDirection: input.paymentDirection ?? null,
        paymentSourceAccountId: input.paymentSourceAccountId ?? null,
        paymentDestinationAccountId: input.paymentDestinationAccountId ?? null,
        paymentSourceLabel: input.paymentSourceLabel ?? null,
        paymentDestinationLabel: input.paymentDestinationLabel ?? null,
        paymentSourceInstitutionName: input.paymentSourceInstitutionName ?? null,
        paymentDestinationInstitutionName: input.paymentDestinationInstitutionName ?? null,
        paymentInstitutionName: input.paymentInstitutionName ?? null,
        paymentAccountNickname: input.paymentAccountNickname ?? null,
        paymentAccountLast4: input.paymentAccountLast4 ?? null,
        paymentAccountMaskedIdentifier: input.paymentAccountMaskedIdentifier ?? null,
        paymentInstrumentConfidence: input.paymentInstrumentConfidence ?? null,
      }),
      zodSchema: financeStructuredDraftSchema,
      userId: input.userId,
      tenantId: scope.tenantId,
      maxRetries: 0,
      billingDescription: "finance_text_to_draft",
      billingMetadata: {
        domain: "finance",
        source: "chat_text",
        conversationId: input.conversationId,
      },
      model: input.model,
    });
    structuredData = structured.data;
    if (resolvedOccurredAt) {
      structuredData = {
        ...structuredData,
        occurredAt: resolvedOccurredAt,
      };
    }
    structuredData = await hydrateStructuredPaymentFields(db, scope, {
      ...structuredData,
      paymentMethodKind: input.paymentMethodKind ?? structuredData.paymentMethodKind ?? null,
      paymentDirection: input.paymentDirection ?? structuredData.paymentDirection ?? null,
      paymentSourceAccountId: input.paymentSourceAccountId ?? structuredData.paymentSourceAccountId ?? null,
      paymentDestinationAccountId: input.paymentDestinationAccountId ?? structuredData.paymentDestinationAccountId ?? null,
      paymentSourceLabel: input.paymentSourceLabel ?? structuredData.paymentSourceLabel ?? null,
      paymentDestinationLabel: input.paymentDestinationLabel ?? structuredData.paymentDestinationLabel ?? null,
      paymentSourceInstitutionName: input.paymentSourceInstitutionName ?? structuredData.paymentSourceInstitutionName ?? null,
      paymentDestinationInstitutionName: input.paymentDestinationInstitutionName ?? structuredData.paymentDestinationInstitutionName ?? null,
      paymentInstitutionName: input.paymentInstitutionName ?? structuredData.paymentInstitutionName ?? null,
      paymentAccountNickname: input.paymentAccountNickname ?? structuredData.paymentAccountNickname ?? null,
      paymentAccountLast4: input.paymentAccountLast4 ?? structuredData.paymentAccountLast4 ?? null,
      paymentAccountMaskedIdentifier: input.paymentAccountMaskedIdentifier ?? structuredData.paymentAccountMaskedIdentifier ?? null,
      paymentInstrumentConfidence: input.paymentInstrumentConfidence ?? structuredData.paymentInstrumentConfidence ?? null,
    }, {
      sourceText: normalizedText,
      documentRole: inferDocumentRoleFromText(normalizedText),
    });
  } catch (error) {
    usedFallback = true;
    structuredData = buildFinanceStructuredDraftFromText({
      text: normalizedText,
      typeHint: normalizedTypeHint,
      categoryHint: normalizedCategoryHint || null,
      counterpartyHint: input.counterpartyName ?? null,
      occurredAt: resolvedOccurredAt,
      captureIntent: null,
    });
    structuredData = await hydrateStructuredPaymentFields(db, scope, {
      ...structuredData,
      paymentMethodKind: input.paymentMethodKind ?? structuredData.paymentMethodKind ?? null,
      paymentDirection: input.paymentDirection ?? structuredData.paymentDirection ?? null,
      paymentSourceAccountId: input.paymentSourceAccountId ?? structuredData.paymentSourceAccountId ?? null,
      paymentDestinationAccountId: input.paymentDestinationAccountId ?? structuredData.paymentDestinationAccountId ?? null,
      paymentSourceLabel: input.paymentSourceLabel ?? structuredData.paymentSourceLabel ?? null,
      paymentDestinationLabel: input.paymentDestinationLabel ?? structuredData.paymentDestinationLabel ?? null,
      paymentSourceInstitutionName: input.paymentSourceInstitutionName ?? structuredData.paymentSourceInstitutionName ?? null,
      paymentDestinationInstitutionName: input.paymentDestinationInstitutionName ?? structuredData.paymentDestinationInstitutionName ?? null,
      paymentInstitutionName: input.paymentInstitutionName ?? structuredData.paymentInstitutionName ?? null,
      paymentAccountNickname: input.paymentAccountNickname ?? structuredData.paymentAccountNickname ?? null,
      paymentAccountLast4: input.paymentAccountLast4 ?? structuredData.paymentAccountLast4 ?? null,
      paymentAccountMaskedIdentifier: input.paymentAccountMaskedIdentifier ?? structuredData.paymentAccountMaskedIdentifier ?? null,
      paymentInstrumentConfidence: input.paymentInstrumentConfidence ?? structuredData.paymentInstrumentConfidence ?? null,
    }, {
      sourceText: normalizedText,
      documentRole: inferDocumentRoleFromText(normalizedText),
    });
    auditLogger.log({
      eventType: "orchestration_fallback",
      userId: input.userId,
      tenantId: scope.tenantId,
      metadata: {
        domain: "finance",
        source: "chat_text",
        conversationId: input.conversationId,
        reason: error instanceof Error ? error.message : "structured_llm_failed",
      },
    });
  }

  structuredData = await applyFinanceSlipMappingPresetsToDraftAsync(structuredData, normalizedText);

  const resolvedCounterparty = await resolveCounterpartyRecord(db, scope, {
    counterpartyName: input.counterpartyName ?? structuredData.counterpartyName ?? structuredData.merchantName ?? null,
    sourceText: normalizedText,
    typeHint: structuredData.type,
    allowInference: true,
  });

  if (resolvedCounterparty) {
    structuredData = {
      ...structuredData,
      counterpartyName: resolvedCounterparty.displayName,
      merchantName: resolvedCounterparty.displayName,
    };
  }

  structuredData = await applyPinnedMerchantPresetsToDraftAsync(structuredData, normalizedText);
  structuredData = {
    ...structuredData,
    missingFields: normalizeStructuredDraftMissingFields(structuredData),
  };

  const semanticSubject = buildFinanceSemanticDuplicateSubjectFromDraft(structuredData);
  const semanticFingerprint = buildFinanceSemanticDuplicateFingerprint(semanticSubject);
  const semanticDuplicate = await selectExistingSemanticDraft(db, scope, semanticSubject);
  if (semanticDuplicate) {
    auditLogger.log({
      eventType: "finance_semantic_duplicate_reused",
      userId: input.userId,
      tenantId: scope.tenantId,
      metadata: {
        conversationId: input.conversationId,
        source: "chat_text",
        draftId: semanticDuplicate.id,
      },
    });
    return semanticDuplicate;
  }

  const draftPayload = buildDraftClarificationPayload(structuredData, {
    sourceKind: "chat_text",
    sourceMessageId,
    sourceHash,
  });
  const draftCategoryCode = normalizedCategoryHint || structuredData.categoryCode;

  const draft = await insertDraftWithIdempotency(db, scope, {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    type: structuredData.type,
    status: "draft",
    source: "chat_text",
    idempotencyKey,
    sourceHash,
    payloadJson: {
      ...draftPayload,
      categoryCode: draftCategoryCode,
      counterpartyName: structuredData.counterpartyName ?? structuredData.merchantName ?? null,
      counterpartyId: resolvedCounterparty?.id ?? draftPayload.counterpartyId ?? null,
      merchantName: resolvedCounterparty?.displayName ?? structuredData.merchantName ?? structuredData.counterpartyName ?? null,
      version: 1,
    },
    semanticFingerprint,
    missingFields: structuredData.missingFields ?? [],
    confidence: toFinanceConfidenceValue(structuredData.confidence),
    needsClarification: structuredData.needsClarification,
    clarificationPrompt: buildClarificationPrompt(structuredData.missingFields ?? []),
    sourceMessageId,
    sourceLibraryItemId: null,
    recurringRuleId: null,
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    allowedScopes: scope.allowedScopes,
  });

  auditLogger.log({
    eventType: "finance_draft_created",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      source: "chat_text",
      draftId: draft.id,
      needsClarification: draft.needsClarification,
      usedFallback,
    },
  });

  return draft;
}

export async function parseDocumentToDraft(input: ParseDocumentToDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const [extraction] = await db
    .select()
    .from(documentExtractions)
    .where(eq(documentExtractions.id, input.documentExtractionId))
    .limit(1);

  if (!extraction) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Document extraction not found" });
  }

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId ?? extraction.tenantId,
  });

  if (
    extraction.tenantId !== scope.tenantId
    || extraction.projectId !== scope.projectId
    || extraction.ownerUserId !== scope.ownerUserId
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Document extraction is outside the active finance scope",
    });
  }

  if (extraction.financeDraftId) {
    const existingDraft = await selectExistingDraft(db, scope, {
      idempotencyKey: `finance-draft-doc:${extraction.id}`,
      draftId: extraction.financeDraftId,
      sourceHash: extraction.sourceHash ?? extraction.fileHash,
    });
    if (existingDraft) {
      return existingDraft;
    }
  }

  const extracted = financeStructuredDraftSchema.parse({
    ...extraction.extractedJson,
    sourceMessageId: extraction.sourceMessageId ?? null,
    sourceLibraryItemId: extraction.libraryItemId,
  });
  const hydratedExtracted = await hydrateStructuredPaymentFields(db, scope, extracted, {
    sourceText: extraction.ocrText,
    documentRole: normalizeDocumentRole(
      typeof extraction.extractedJson?.documentRole === "string"
        ? extraction.extractedJson.documentRole
        : typeof extraction.ocrJson?.document_role === "string"
          ? extraction.ocrJson.document_role
          : typeof extraction.ocrJson?.documentRole === "string"
            ? extraction.ocrJson.documentRole
            : null,
    ),
  });

  const resolvedCounterparty = await resolveCounterpartyRecord(db, scope, {
    counterpartyName: input.counterpartyName ?? hydratedExtracted.counterpartyName ?? hydratedExtracted.merchantName ?? null,
    sourceText: extraction.ocrText,
    typeHint: hydratedExtracted.type,
    allowInference: true,
  });

  const normalizedCounterpartyName = resolvedCounterparty?.displayName
    ?? (normalizeCounterpartyDisplayName(
      input.counterpartyName
      ?? hydratedExtracted.counterpartyName
      ?? hydratedExtracted.merchantName
      ?? inferCounterpartyCandidateFromText(extraction.ocrText, hydratedExtracted.type)
      ?? "",
    ) || null);

  const semanticDraftCandidate = {
    ...hydratedExtracted,
    counterpartyName: normalizedCounterpartyName ?? hydratedExtracted.counterpartyName ?? null,
    merchantName: normalizedCounterpartyName ?? hydratedExtracted.merchantName ?? null,
  };
  const semanticFingerprint = buildFinanceSemanticDuplicateFingerprint(
    buildFinanceSemanticDuplicateSubjectFromDraft(semanticDraftCandidate),
  );
  const semanticDuplicate = await selectExistingSemanticDraft(
    db,
    scope,
    buildFinanceSemanticDuplicateSubjectFromDraft(semanticDraftCandidate),
  );
  if (semanticDuplicate) {
    auditLogger.log({
      eventType: "finance_semantic_duplicate_reused",
      userId: input.userId,
      tenantId: scope.tenantId,
      metadata: {
        conversationId: input.conversationId,
        source: "ocr_document",
        draftId: semanticDuplicate.id,
        documentExtractionId: extraction.id,
      },
    });
    return semanticDuplicate;
  }

  const normalizedHydratedExtracted = {
    ...hydratedExtracted,
    missingFields: normalizeStructuredDraftMissingFields(hydratedExtracted),
  };

  const draftPayload = buildDraftClarificationPayload(normalizedHydratedExtracted, {
    sourceKind: "ocr_document",
    sourceMessageId: extraction.sourceMessageId ?? null,
    sourceLibraryItemId: extraction.libraryItemId,
    sourceHash: extraction.sourceHash ?? extraction.fileHash,
    documentExtractionId: extraction.id,
  });
  const sourceLibraryItem = await getLibraryItemById(
    extraction.libraryItemId,
    {
      userId: input.userId,
      tenantId: scope.tenantId,
      role: null,
      privateVaultUnlocked: false,
    },
    db,
  );

  const draft = await db.transaction(async (tx) => {
    const created = await insertDraftWithIdempotency(tx, scope, {
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      ownerUserId: scope.ownerUserId,
      type: extracted.type,
      status: "draft",
      source: "ocr_document",
      idempotencyKey: input.idempotencyKey ?? `finance-draft-doc:${extraction.id}`,
      sourceHash: extraction.sourceHash ?? extraction.fileHash,
      payloadJson: {
        ...draftPayload,
        version: 1,
        counterpartyName: normalizedCounterpartyName,
        counterpartyId: resolvedCounterparty?.id ?? draftPayload.counterpartyId ?? null,
        merchantName: normalizedCounterpartyName,
        sourceUrl: sourceLibraryItem?.sourceUrl ?? null,
        sourceFileName: sourceLibraryItem?.title ?? null,
      },
      semanticFingerprint,
      missingFields: normalizedHydratedExtracted.missingFields ?? [],
      confidence: toFinanceConfidenceValue(normalizedHydratedExtracted.confidence),
      needsClarification: normalizedHydratedExtracted.needsClarification,
      clarificationPrompt: buildClarificationPrompt(normalizedHydratedExtracted.missingFields ?? []),
      sourceMessageId: extraction.sourceMessageId ?? null,
      sourceLibraryItemId: extraction.libraryItemId,
      recurringRuleId: null,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      allowedScopes: scope.allowedScopes,
    });

    await tx
      .update(documentExtractions)
      .set({
        financeDraftId: created.id,
        updatedAt: new Date(),
      })
      .where(eq(documentExtractions.id, extraction.id));

    return created;
  });

  auditLogger.log({
    eventType: "finance_draft_created",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      source: "ocr_document",
      draftId: draft.id,
      documentExtractionId: extraction.id,
    },
  });

  return draft;
}

export async function updateDraft(input: UpdateDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const draft = await ensureDraftOwnership(db, scope, input.draftId);
  if (draft.status !== "draft") {
    throw new TRPCError({ code: "CONFLICT", message: "Draft is no longer editable" });
  }

  if (draft.version !== input.expectedVersion) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Draft version mismatch (expected ${input.expectedVersion}, found ${draft.version})`,
    });
  }

  const patch = draftPatchSchema.parse(input.patch);
  const nextVersion = draft.version + 1;
  const mergedDraftForResolution = financeStructuredDraftSchema.parse({
    ...materializeDraftPayload(draft),
    ...patch,
    type: patch.type ?? draft.type,
    confidence: toFinanceConfidenceNumber(patch.confidence ?? draft.confidence),
    needsClarification: patch.needsClarification ?? draft.needsClarification,
    missingFields: patch.missingFields ?? draft.missingFields,
    sourceMessageId: draft.sourceMessageId,
    sourceLibraryItemId: draft.sourceLibraryItemId,
    recurringRuleId: draft.recurringRuleId,
  });
  const hydratedDraft = await hydrateStructuredPaymentFields(db, scope, mergedDraftForResolution, {
    sourceText: patch.note ?? draft.note ?? null,
    documentRole: mergedDraftForResolution.documentRole ?? null,
  });
  const resolvedCounterparty = patch.counterpartyName || patch.merchantName
    ? await resolveCounterpartyRecord(db, scope, {
        counterpartyName: patch.counterpartyName ?? patch.merchantName ?? null,
        sourceText: patch.note ?? draft.note ?? null,
        typeHint: hydratedDraft.type,
        allowInference: false,
      })
    : null;
  const canonicalCounterpartyName = resolvedCounterparty?.displayName
    ?? (typeof patch.counterpartyName === "string" ? normalizeCounterpartyDisplayName(patch.counterpartyName) : null)
    ?? (typeof patch.merchantName === "string" ? normalizeCounterpartyDisplayName(patch.merchantName) : null)
    ?? readOptionalString((draft.payloadJson ?? {})["counterpartyName"])
    ?? readOptionalString((draft.payloadJson ?? {})["merchantName"]);
  const nextPayload = {
    ...(draft.payloadJson ?? {}),
    ...hydratedDraft,
    ...patch,
    counterpartyId: resolvedCounterparty?.id ?? readOptionalPositiveInt((draft.payloadJson ?? {}).counterpartyId) ?? null,
    counterpartyName: canonicalCounterpartyName,
    merchantName: canonicalCounterpartyName ?? patch.merchantName ?? draft.merchantName,
    version: nextVersion,
  };

  const [updated] = await db
    .update(financeDrafts)
    .set({
      type: patch.type ?? draft.type,
      confidence: toFinanceConfidenceValue(patch.confidence ?? draft.confidence),
      missingFields: patch.missingFields ?? draft.missingFields,
      needsClarification: patch.needsClarification ?? draft.needsClarification,
      clarificationPrompt: patch.clarificationPrompt === undefined ? draft.clarificationPrompt : patch.clarificationPrompt,
      payloadJson: nextPayload,
      updatedAt: new Date(),
    })
    .where(and(
      eq(financeDrafts.id, draft.id),
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update draft" });
  }

  return mapDraftRow(updated);
}

export async function confirmDraft(input: ConfirmDraftInput): Promise<FinanceTransaction> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  return db.transaction(async (tx) => {
    const draft = await ensureDraftOwnership(tx, scope, input.draftId);

    const existingTransaction = await selectExistingConfirmedTransaction(tx, scope, draft.id);
    if (existingTransaction) {
      return existingTransaction;
    }

    try {
      const transaction = await createTransactionFromDraft(tx, scope, draft, {
        confirmUserId: input.userId,
      });

      auditLogger.log({
        eventType: "finance_draft_confirmed",
        userId: input.userId,
        tenantId: scope.tenantId,
        metadata: {
          conversationId: input.conversationId,
          draftId: draft.id,
          transactionId: transaction.id,
        },
      });

      return transaction;
    } catch (error: any) {
      if (error?.code === "23505") {
        const existing = await selectExistingConfirmedTransaction(tx, scope, draft.id);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  });
}

export async function cancelDraft(input: CancelDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const draft = await ensureDraftOwnership(db, scope, input.draftId);
  if (draft.status === "cancelled") {
    return draft;
  }
  if (draft.status !== "draft") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only open drafts can be cancelled" });
  }

  const [updated] = await db
    .update(financeDrafts)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(and(
      eq(financeDrafts.id, draft.id),
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to cancel draft" });
  }

  auditLogger.log({
    eventType: "finance_draft_cancelled",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      draftId: draft.id,
      reason: input.reason ?? null,
    },
  });

  return mapDraftRow(updated);
}

export async function restoreDraft(input: RestoreDraftInput): Promise<FinanceDraftRecord> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const draft = await ensureDraftOwnership(db, scope, input.draftId);
  if (draft.status === "draft") {
    return draft;
  }
  if (draft.status !== "cancelled") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only cancelled drafts can be restored" });
  }

  const [updated] = await db
    .update(financeDrafts)
    .set({
      status: "draft",
      updatedAt: new Date(),
    })
    .where(and(
      eq(financeDrafts.id, draft.id),
      eq(financeDrafts.tenantId, scope.tenantId),
      eq(financeDrafts.projectId, scope.projectId),
      eq(financeDrafts.ownerUserId, scope.ownerUserId),
    ))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to restore draft" });
  }

  auditLogger.log({
    eventType: "finance_draft_restored",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      draftId: draft.id,
    },
  });

  return mapDraftRow(updated);
}

export async function voidTransaction(input: VoidTransactionInput): Promise<FinanceTransaction> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const transaction = await ensureTransactionOwnership(db, scope, input.transactionId);
  if (transaction.status === "voided" || transaction.voidedAt) {
    return mapTransactionRow(transaction);
  }

  const [updated] = await db
    .update(financeTransactions)
    .set({
      status: "voided",
      voidedAt: new Date(),
      voidedByUserId: input.userId,
      voidReason: input.reason ?? "Voided by user",
      updatedAt: new Date(),
    })
    .where(and(
      eq(financeTransactions.id, transaction.id),
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
    ))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to void transaction" });
  }

  auditLogger.log({
    eventType: "finance_transaction_voided",
    userId: input.userId,
    tenantId: scope.tenantId,
    metadata: {
      conversationId: input.conversationId,
      transactionId: updated.id,
      reason: input.reason ?? null,
    },
  });

  return updated;
}

export async function listTransactions(input: ListTransactionsInput): Promise<FinanceTransaction[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const filters = transactionListFiltersSchema.parse({
    status: input.status ?? "confirmed",
    type: input.type ?? undefined,
    query: input.query,
    amountMinMinor: input.amountMinMinor,
    amountMaxMinor: input.amountMaxMinor,
    categoryCode: input.categoryCode,
    counterparty: input.counterparty,
    merchant: input.merchant,
    paymentMethodKind: input.paymentMethodKind ?? undefined,
    paymentDirection: input.paymentDirection ?? undefined,
    paymentAccountId: input.paymentAccountId ?? undefined,
    paymentInstitutionId: input.paymentInstitutionId ?? undefined,
    fromDate: input.fromDate,
    toDate: input.toDate,
    limit: input.limit ?? 50,
    offset: input.offset ?? 0,
  });

  if (filters.fromDate && filters.toDate && filters.toDate.getTime() < filters.fromDate.getTime()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "toDate must be after fromDate" });
  }

  const conditions = [
    eq(financeTransactions.tenantId, scope.tenantId),
    eq(financeTransactions.projectId, scope.projectId),
    eq(financeTransactions.ownerUserId, scope.ownerUserId),
  ];

  if (filters.status) {
    conditions.push(eq(financeTransactions.status, filters.status));
  }
  if (filters.type) {
    conditions.push(eq(financeTransactions.type, filters.type));
  }
  if (filters.categoryCode) {
    conditions.push(eq(financeTransactions.categoryCode, filters.categoryCode));
  }
  if (filters.paymentMethodKind) {
    conditions.push(eq(financeTransactions.paymentMethodKind, filters.paymentMethodKind));
  }
  if (filters.paymentDirection) {
    conditions.push(eq(financeTransactions.paymentDirection, filters.paymentDirection));
  }
  if (filters.paymentAccountId) {
    const paymentAccountCondition = or(
      eq(financeTransactions.paymentSourceAccountId, filters.paymentAccountId),
      eq(financeTransactions.paymentDestinationAccountId, filters.paymentAccountId),
    );
    if (paymentAccountCondition) {
      conditions.push(paymentAccountCondition);
    }
  }
  if (filters.paymentInstitutionId) {
    conditions.push(sql`(
      exists (
        select 1
        from finance_payment_accounts payment_account
        where payment_account.id = ${financeTransactions.paymentSourceAccountId}
          and payment_account.payment_institution_id = ${filters.paymentInstitutionId}
      )
      or exists (
        select 1
        from finance_payment_accounts payment_account
        where payment_account.id = ${financeTransactions.paymentDestinationAccountId}
          and payment_account.payment_institution_id = ${filters.paymentInstitutionId}
      )
    )`);
  }
  if (filters.counterparty) {
    const counterpartyCondition = or(
      ilike(financeTransactions.counterpartyName, `%${filters.counterparty}%`),
      ilike(financeTransactions.merchantName, `%${filters.counterparty}%`),
    );
    if (counterpartyCondition) {
      conditions.push(counterpartyCondition);
    }
  }
  if (filters.merchant) {
    const merchantCondition = or(
      ilike(financeTransactions.merchantName, `%${filters.merchant}%`),
      ilike(financeTransactions.counterpartyName, `%${filters.merchant}%`),
    );
    if (merchantCondition) {
      conditions.push(merchantCondition);
    }
  }
  if (filters.query) {
    const trimmed = filters.query.trim();
    const searchVector = sql`to_tsvector('simple',
      COALESCE(${financeTransactions.note}, '') || ' ' ||
      COALESCE(${financeTransactions.counterpartyName}, '') || ' ' ||
      COALESCE(${financeTransactions.merchantName}, '') || ' ' ||
      COALESCE(${financeTransactions.categoryCode}, '') || ' ' ||
      COALESCE(${financeTransactions.slipReference}, '') || ' ' ||
      COALESCE(${financeTransactions.merchantId}, '') || ' ' ||
      COALESCE(${financeTransactions.paymentSourceName}, '') || ' ' ||
      COALESCE(${financeTransactions.paymentDestinationName}, '')
    )`;
    if (trimmed.length <= 2) {
      const term = `%${trimmed}%`;
      conditions.push(or(
        ilike(financeTransactions.counterpartyName, term),
        ilike(financeTransactions.merchantName, term),
        ilike(financeTransactions.note, term),
        ilike(financeTransactions.categoryCode, term),
        ilike(financeTransactions.slipReference, term),
        ilike(financeTransactions.merchantId, term),
        ilike(financeTransactions.paymentSourceName, term),
        ilike(financeTransactions.paymentDestinationName, term),
      ));
    } else {
      conditions.push(sql`${searchVector} @@ plainto_tsquery('simple', ${trimmed})`);
    }
  }
  if (filters.fromDate) {
    conditions.push(gte(financeTransactions.occurredAt, filters.fromDate));
  }
  if (filters.toDate) {
    conditions.push(lt(financeTransactions.occurredAt, filters.toDate));
  }
  if (typeof filters.amountMinMinor === "number") {
    conditions.push(gte(financeTransactions.amountMinor, filters.amountMinMinor));
  }
  if (typeof filters.amountMaxMinor === "number") {
    conditions.push(lte(financeTransactions.amountMinor, filters.amountMaxMinor));
  }

  return db
    .select()
    .from(financeTransactions)
    .where(and(...conditions))
    .orderBy(desc(financeTransactions.occurredAt), desc(financeTransactions.id))
    .limit(filters.limit)
    .offset(filters.offset);
}

export async function listDrafts(input: ListDraftsInput): Promise<FinanceDraftRecord[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const filters = {
    ...buildListRange(input.limit, input.offset),
    status: input.status ?? "draft",
  };

  const conditions = [
    eq(financeDrafts.tenantId, scope.tenantId),
    eq(financeDrafts.projectId, scope.projectId),
    eq(financeDrafts.ownerUserId, scope.ownerUserId),
  ];

  if (filters.status) {
    conditions.push(eq(financeDrafts.status, financeDraftStatusSchema.parse(filters.status)));
  }

  const rows = await db
    .select()
    .from(financeDrafts)
    .where(and(...conditions))
    .orderBy(desc(financeDrafts.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows.map(mapDraftRow);
}

export async function listRecurringRules(input: ListRecurringRulesInput): Promise<FinanceRecurringRule[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const filters = {
    ...buildListRange(input.limit, input.offset),
    status: input.status ?? null,
  };

  const conditions = [
    eq(financeRecurringRules.tenantId, scope.tenantId),
    eq(financeRecurringRules.projectId, scope.projectId),
    eq(financeRecurringRules.ownerUserId, scope.ownerUserId),
  ];

  if (filters.status) {
    conditions.push(eq(financeRecurringRules.status, financeRecurringRuleStatusSchema.parse(filters.status)));
  }

  const rows = await db
    .select()
    .from(financeRecurringRules)
    .where(and(...conditions))
    .orderBy(desc(financeRecurringRules.updatedAt), desc(financeRecurringRules.id))
    .limit(filters.limit)
    .offset(filters.offset);

  return rows;
}

async function aggregateSummary(
  scope: FinanceScope,
  referenceDate: Date,
  granularity: "day" | "month",
): Promise<FinanceSummaryResult> {
  const db = await getDb();
  ensureDb(db);

  const rangeStart = granularity === "day"
    ? startOfDayInTimeZone(referenceDate, "Asia/Bangkok")
    : startOfMonthInTimeZone(referenceDate, "Asia/Bangkok");
  const rangeEnd = granularity === "day"
    ? new Date(rangeStart.getTime() + 86_400_000)
    : startOfNextMonthInTimeZone(referenceDate, "Asia/Bangkok");

  const [row] = await db
    .select({
      incomeMinor: sql<number>`coalesce(sum(case when ${financeTransactions.type} = 'income' then ${financeTransactions.amountMinor} else 0 end), 0)::int`,
      expenseMinor: sql<number>`coalesce(sum(case when ${financeTransactions.type} = 'expense' then ${financeTransactions.amountMinor} else 0 end), 0)::int`,
      transferMinor: sql<number>`coalesce(sum(case when ${financeTransactions.type} = 'transfer' then ${financeTransactions.amountMinor} else 0 end), 0)::int`,
    })
    .from(financeTransactions)
    .where(and(
      eq(financeTransactions.tenantId, scope.tenantId),
      eq(financeTransactions.projectId, scope.projectId),
      eq(financeTransactions.ownerUserId, scope.ownerUserId),
      eq(financeTransactions.status, "confirmed"),
      isNull(financeTransactions.voidedAt),
      gte(financeTransactions.occurredAt, rangeStart),
      lt(financeTransactions.occurredAt, rangeEnd),
    ));

  const incomeMinor = Number(row?.incomeMinor ?? 0);
  const expenseMinor = Number(row?.expenseMinor ?? 0);
  const transferMinor = Number(row?.transferMinor ?? 0);
  const summary = buildSummaryRow({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    timezone: "Asia/Bangkok",
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    incomeMinor,
    expenseMinor,
    transferMinor,
    balanceMinor: incomeMinor - expenseMinor,
  }, granularity);

  return summary;
}

export async function getDailySummary(input: { conversationId: number; userId: number; tenantId?: string | null; referenceDate?: Date }): Promise<FinanceSummaryResult> {
  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });
  return await aggregateSummary(scope, input.referenceDate ?? new Date(), "day");
}

export async function getMonthlySummary(input: { conversationId: number; userId: number; tenantId?: string | null; referenceDate?: Date }): Promise<FinanceSummaryResult> {
  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });
  return await aggregateSummary(scope, input.referenceDate ?? new Date(), "month");
}

export async function createRecurringRule(input: CreateRecurringRuleInput): Promise<FinanceRecurringRule> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const schedule = normalizeRecurringSchedule(input.rrule);
  const timezone = input.timezone?.trim() || "Asia/Bangkok";
  const startDate = input.startDate ?? new Date();
  const endDate = input.endDate ?? null;
  const nextRunAt = computeNextRecurringRunAt(schedule, startDate, timezone, new Date());
  if (!nextRunAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Could not compute the next recurring run" });
  }
  if (endDate && nextRunAt.getTime() > endDate.getTime()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recurring schedule ends before the first run" });
  }

  const scheduleHash = sha256(JSON.stringify(schedule));
  const resolvedCounterparty = await resolveCounterpartyRecord(db, scope, {
    counterpartyName: input.counterpartyName ?? input.merchantName ?? null,
    sourceText: input.note ?? null,
    typeHint: input.type,
    allowInference: false,
  });
  const canonicalCounterpartyName = resolvedCounterparty?.displayName
    ?? (input.counterpartyName ? normalizeCounterpartyDisplayName(input.counterpartyName) : null)
    ?? (input.merchantName ? normalizeCounterpartyDisplayName(input.merchantName) : null)
    ?? null;
  const idempotencyKey = input.idempotencyKey ?? toIdempotencyKey("finance-recurring", [
    scope.tenantId,
    scope.projectId,
    scope.ownerUserId,
    scheduleHash,
    input.type,
    input.amountMinor,
    input.currency ?? "THB",
    input.categoryCode,
    canonicalCounterpartyName ?? input.merchantName ?? "",
    input.note ?? "",
    input.sourceMessageId ?? "",
    input.sourceLibraryItemId ?? "",
  ]);

  return await insertRecurringRuleWithIdempotency(db, scope, {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    type: input.type,
    amountMinor: input.amountMinor,
    currency: input.currency ?? "THB",
    categoryCode: input.categoryCode,
    counterpartyId: resolvedCounterparty?.id ?? null,
    counterpartyName: canonicalCounterpartyName,
    merchantName: canonicalCounterpartyName ?? input.merchantName ?? null,
    note: input.note ?? null,
    rrule: JSON.stringify(schedule),
    timezone,
    startDate,
    endDate,
    nextRunAt,
    lastRunAt: null,
    runCount: 0,
    autoConfirm: input.autoConfirm ?? false,
    status: "active",
    idempotencyKey,
    sourceHash: scheduleHash,
    sourceMessageId: input.sourceMessageId ?? null,
    sourceLibraryItemId: input.sourceLibraryItemId ?? null,
    allowedScopes: scope.allowedScopes,
  });
}

export async function pauseRecurringRule(input: PauseRecurringRuleInput): Promise<FinanceRecurringRule> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const rule = await ensureRecurringRuleOwnership(db, scope, input.recurringRuleId);
  if (rule.status === "paused") {
    return rule;
  }

  const [updated] = await db
    .update(financeRecurringRules)
    .set({
      status: "paused",
      updatedAt: new Date(),
    })
    .where(eq(financeRecurringRules.id, rule.id))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to pause recurring rule" });
  }

  return updated;
}

export async function resumeRecurringRule(input: ResumeRecurringRuleInput): Promise<FinanceRecurringRule> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  const rule = await ensureRecurringRuleOwnership(db, scope, input.recurringRuleId);
  if (rule.status === "active") {
    return rule;
  }

  const schedule = normalizeRecurringSchedule(rule.rrule);
  const nextRunAt = computeNextRecurringRunAt(schedule, rule.startDate, rule.timezone, new Date());
  if (!nextRunAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Could not compute the next recurring run" });
  }

  const [updated] = await db
    .update(financeRecurringRules)
    .set({
      status: "active",
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(financeRecurringRules.id, rule.id))
    .returning();

  if (!updated) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to resume recurring rule" });
  }

  return updated;
}

export async function listLinkedDocuments(input: ListLinkedDocumentsInput): Promise<FinanceLinkedDocumentRecord[]> {
  const db = await getDb();
  ensureDb(db);

  const scope = await resolveScopeFromConversation({
    conversationId: input.conversationId,
    userId: input.userId,
    tenantId: input.tenantId,
  });

  await ensureTransactionOwnership(db, scope, input.transactionId);

  const rows = await db
    .select({
      id: financeTransactionDocuments.id,
      transactionId: financeTransactionDocuments.transactionId,
      libraryItemId: financeTransactionDocuments.libraryItemId,
      sourceExtractionId: financeTransactionDocuments.sourceExtractionId,
      role: financeTransactionDocuments.role,
      note: financeTransactionDocuments.note,
      createdAt: financeTransactionDocuments.createdAt,
      updatedAt: financeTransactionDocuments.updatedAt,
      libraryItemIdFromJoin: libraryItems.id,
      libraryTitle: libraryItems.title,
      librarySource: libraryItems.source,
      libraryMetadata: libraryItems.metadata,
      libraryProjectId: libraryItems.projectId,
      extractionId: documentExtractions.id,
      extractionOcrProvider: documentExtractions.ocrProvider,
      extractionMimeType: documentExtractions.mimeType,
      extractionFileHash: documentExtractions.fileHash,
      extractionPageCount: documentExtractions.pageCount,
    })
    .from(financeTransactionDocuments)
    .leftJoin(libraryItems, eq(financeTransactionDocuments.libraryItemId, libraryItems.id))
    .leftJoin(documentExtractions, eq(financeTransactionDocuments.sourceExtractionId, documentExtractions.id))
    .where(and(
      eq(financeTransactionDocuments.tenantId, scope.tenantId),
      eq(financeTransactionDocuments.projectId, scope.projectId),
      eq(financeTransactionDocuments.ownerUserId, scope.ownerUserId),
      eq(financeTransactionDocuments.transactionId, input.transactionId),
    ))
    .orderBy(asc(financeTransactionDocuments.createdAt));

  return rows.map((row) => ({
    id: row.id,
    transactionId: row.transactionId,
    libraryItemId: row.libraryItemId,
    role: financeDocumentRoleSchema.parse(row.role),
    note: row.note ?? null,
    sourceExtractionId: row.sourceExtractionId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    libraryItem: row.libraryItemIdFromJoin
      ? {
          id: row.libraryItemIdFromJoin,
          title: row.libraryTitle ?? "",
          source: row.librarySource ?? "",
          metadata: (row.libraryMetadata ?? {}) as Record<string, unknown>,
          projectId: row.libraryProjectId ?? null,
        }
      : null,
    extraction: row.extractionId
      ? {
          id: row.extractionId,
          ocrProvider: row.extractionOcrProvider ?? "",
          mimeType: row.extractionMimeType ?? "",
          fileHash: row.extractionFileHash ?? "",
          pageCount: row.extractionPageCount ?? 1,
        }
      : null,
  }));
}

async function createRecurringDraftFromRule(
  tx: FinanceDbExecutor,
  scope: FinanceScope,
  rule: FinanceRecurringRule,
  runAt: Date,
): Promise<FinanceDraftRecord> {
  const draftPayload = buildDraftClarificationPayload({
    type: rule.type,
    amountMinor: rule.amountMinor,
    currency: rule.currency,
    occurredAt: runAt.toISOString(),
    categoryCode: rule.categoryCode,
    counterpartyName: rule.counterpartyName ?? rule.merchantName,
    merchantName: rule.counterpartyName ?? rule.merchantName,
    note: rule.note,
    evidence: [],
    confidence: 1,
    needsClarification: false,
    missingFields: [],
    sourceMessageId: rule.sourceMessageId ?? null,
    sourceLibraryItemId: rule.sourceLibraryItemId ?? null,
    recurringRuleId: rule.id,
  }, {
    sourceKind: "recurring_rule",
    sourceMessageId: rule.sourceMessageId ?? null,
    sourceLibraryItemId: rule.sourceLibraryItemId ?? null,
    recurringRuleId: rule.id,
    sourceHash: rule.sourceHash ?? null,
  });

  return await insertDraftWithIdempotency(tx, scope, {
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    ownerUserId: scope.ownerUserId,
    type: rule.type,
    status: "draft",
    source: "recurring_rule",
    idempotencyKey: `finance-recurring-draft:${rule.id}:${rule.runCount + 1}`,
    sourceHash: rule.sourceHash ?? null,
      payloadJson: {
      ...draftPayload,
      version: 1,
    },
    missingFields: [],
    confidence: toFinanceConfidenceValue(1),
    needsClarification: false,
    clarificationPrompt: null,
    sourceMessageId: rule.sourceMessageId ?? null,
    sourceLibraryItemId: rule.sourceLibraryItemId ?? null,
    recurringRuleId: rule.id,
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    allowedScopes: scope.allowedScopes,
  });
}

export async function runDueRecurringRules(now = new Date()): Promise<RunRecurringRulesResult> {
  const db = await getDb();
  ensureDb(db);

  const dueRules = await db
    .select()
    .from(financeRecurringRules)
    .where(and(
      eq(financeRecurringRules.status, "active"),
      or(
        isNull(financeRecurringRules.nextRunAt),
        lt(financeRecurringRules.nextRunAt, now),
        eq(financeRecurringRules.nextRunAt, now),
      ),
    ))
    .orderBy(asc(financeRecurringRules.nextRunAt), asc(financeRecurringRules.id))
    .limit(100);

  let draftsCreated = 0;
  let transactionsCreated = 0;
  let errors = 0;

  for (const rule of dueRules) {
    const scope: FinanceScope = {
      tenantId: rule.tenantId,
      ownerUserId: rule.ownerUserId,
      projectId: rule.projectId,
      conversationId: 0,
      personal: isPersonalProjectId(rule.projectId),
      allowedScopes: rule.allowedScopes?.length > 0 ? rule.allowedScopes : [personalScopeToken(rule.ownerUserId)],
    };

    try {
      let createdDraft: FinanceDraftRecord | null = null;
      let createdTransaction: FinanceTransaction | null = null;
      await db.transaction(async (tx) => {
        const schedule = normalizeRecurringSchedule(rule.rrule);
        const runAt = rule.nextRunAt ?? now;
        createdDraft = await createRecurringDraftFromRule(tx, scope, rule, runAt);

        if (rule.autoConfirm) {
          createdTransaction = await createTransactionFromDraft(tx, scope, createdDraft, {
            confirmUserId: rule.ownerUserId,
            confirmedAt: runAt,
          });
        }

        const nextRunAt = computeNextRecurringRunAt(schedule, rule.startDate, rule.timezone, new Date(runAt.getTime() + 1000));
        await tx
          .update(financeRecurringRules)
          .set({
            lastRunAt: runAt,
            nextRunAt,
            runCount: rule.runCount + 1,
            status: nextRunAt ? "active" : "ended",
            updatedAt: new Date(),
          })
          .where(eq(financeRecurringRules.id, rule.id));
      });
      if (createdDraft) {
        draftsCreated += 1;
      }
      if (createdTransaction) {
        transactionsCreated += 1;
      }
    } catch (error) {
      errors += 1;
      auditLogger.log({
        eventType: "finance_recurring_rule_failed",
        userId: rule.ownerUserId,
        tenantId: rule.tenantId,
        metadata: {
          recurringRuleId: rule.id,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return {
    scannedCount: dueRules.length,
    draftsCreated,
    transactionsCreated,
    errors,
  };
}
