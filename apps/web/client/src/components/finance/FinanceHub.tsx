import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, ReceiptText, Upload, CheckCircle2, ArrowDownRight, ArrowUpRight, Pause, Play, FileText, Wallet, Sparkles, Search, Mic, MicOff, RotateCcw, Landmark, CreditCard, Plus, ChevronDown, Trash2, MoreVertical } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { readFileAsBase64 } from "@/components/editor/uploadMedia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceCounterpartyAutocomplete } from "@/components/finance/FinanceCounterpartyAutocomplete";
import { createFinanceOcrDebugTraceId, logFinanceOcrClientStep } from "./financeOcrDebug";
import { getDocumentOcrProviderLabel } from "../../../../shared/documentOcrRouting.ts";
import {
  applyFinanceSlipMappingPresetToDraft,
  DEFAULT_FINANCE_SLIP_MAPPING_PRESETS,
  applyFinancePinnedMerchantPresetToDraft,
  findBestFinancePinnedMerchantPreset,
  rankFinanceSlipMappingPresets,
  type FinanceEvidenceItem,
  type FinanceSlipMappingPreset,
  type FinanceStructuredDraft,
} from "../../../../shared/finance";
import {
  DashboardCard,
  DashboardKpiCard,
  dashboardCardDescriptionClass,
  dashboardMetaLineClass,
} from "@/components/dashboard";
import { useIsMobile } from "@/hooks/useMobile";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { usePushToTalk } from "@/hooks/usePushToTalk";

const DEFAULT_CURRENCY = "THB";
const FINANCE_ACTION_REASON_SESSION_KEYS = {
  cancelDraft: "finance.cancelDraftReason",
  voidConfirmedTransaction: "finance.confirmedTransactionVoidReason",
} as const;

type FinanceActionReasonKey = keyof typeof FINANCE_ACTION_REASON_SESSION_KEYS;

function readStoredActionReason(action: FinanceActionReasonKey): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.sessionStorage.getItem(FINANCE_ACTION_REASON_SESSION_KEYS[action]) ?? "";
  } catch {
    return "";
  }
}

function storeActionReason(action: FinanceActionReasonKey, reason: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(FINANCE_ACTION_REASON_SESSION_KEYS[action], reason.trim());
  } catch {
    // Ignore storage failures; the mutation still proceeds.
  }
}

export interface FinanceHubProps {
  conversationId: number | null;
  surface?: "panel" | "dashboard" | "page";
  compact?: boolean;
  className?: string;
  onCreatePersonalChat?: () => Promise<void> | void;
  onOpenFinancePanel?: () => void;
  onMirrorFinanceActivity?: (message: {
    content: string;
    artifacts: Array<{
      id: string;
      type: "markdown" | "table" | "chart";
      title?: string;
      content: string | string[];
      metadata?: Record<string, unknown>;
    }>;
  }) => Promise<void> | void;
}

function formatMoneyMinor(amountMinor: number | string | null | undefined, currency = DEFAULT_CURRENCY): string {
  const minor = typeof amountMinor === "string" ? Number(amountMinor) : amountMinor ?? 0;
  const safeAmount = Number.isFinite(minor) ? minor / 100 : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    return `${currency} ${safeAmount.toFixed(2)}`;
  }
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return "—";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return format(parsed, "MMM d, HH:mm");
}

function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function toTimeInputValue(date: Date): string {
  return format(date, "HH:mm");
}

function getCurrentDraftDateTime(): { date: string; time: string } {
  const now = new Date();
  return {
    date: toDateInputValue(now),
    time: toTimeInputValue(now),
  };
}

function buildDraftOccurredAtIso(dateValue: string, timeValue: string): string | null {
  const now = new Date();
  const date = dateValue.trim() || toDateInputValue(now);
  const time = timeValue.trim() || toTimeInputValue(now);
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const candidate = new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return candidate.toISOString();
}

function parseRecurringRuleSummary(rrule: string, nextRunAt: string | Date | null | undefined, timezone: string): string {
  try {
    const parsed = JSON.parse(rrule) as Record<string, unknown>;
    const frequency = typeof parsed.frequency === "string" ? parsed.frequency : "custom";
    const interval = typeof parsed.interval === "number" ? parsed.interval : 1;
    const dayOfMonth = typeof parsed.dayOfMonth === "number" ? parsed.dayOfMonth : null;
    const daysOfWeek = Array.isArray(parsed.daysOfWeek) ? parsed.daysOfWeek : [];

    let core = frequency;
    if (frequency === "monthly" && dayOfMonth) {
      core = `monthly on day ${dayOfMonth}`;
    } else if (frequency === "weekly" && daysOfWeek.length > 0) {
      core = `weekly (${daysOfWeek.join(",")})`;
    }

    const intervalLabel = interval > 1 ? ` every ${interval}` : "";
    const nextRunLabel = nextRunAt ? ` · next ${formatDateTime(nextRunAt)}` : "";
    return `${core}${intervalLabel}${nextRunLabel} · ${timezone}`;
  } catch {
    return `${rrule}${nextRunAt ? ` · next ${formatDateTime(nextRunAt)}` : ""}`;
  }
}

function getTransactionTypeLabel(type: string): string {
  switch (type) {
    case "income":
      return "รายรับ";
    case "expense":
      return "รายจ่าย";
    case "transfer":
      return "โอนเงิน";
    default:
      return "รายการเงิน";
  }
}

function getFinanceSourceLabel(source: string): string {
  switch (source) {
    case "ocr_document":
      return "ใบเสร็จ/OCR";
    case "chat_text":
      return "ฉบับร่างจากแชท";
    case "recurring_rule":
      return "กฎรายการประจำ";
    case "api":
      return "เชื่อมต่อ API";
    case "import":
      return "นำเข้า";
    default:
      return source;
  }
}

function getCaptureIntentLabel(intent: "receipt" | "transfer_slip" | "statement"): string {
  switch (intent) {
    case "receipt":
      return "ใบเสร็จ";
    case "transfer_slip":
      return "สลิปโอนเงิน";
    case "statement":
      return "สเตทเมนต์";
  }
}

function normalizePreviewComparisonText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function extractPreviewMaskedIdentifier(label: string | null | undefined): string | null {
  if (!label) {
    return null;
  }

  const maskedMatch = label.match(/(?:••••\d{1,4}|\d{4,})/);
  return maskedMatch?.[0] ?? null;
}

function extractPreviewAccountName(label: string | null | undefined): string | null {
  if (!label) {
    return null;
  }

  const firstSegment = label.split("·")[0]?.trim();
  return firstSegment || null;
}

function getEvidenceFieldLabel(field: string): string {
  switch (field) {
    case "amountMinor":
      return "จำนวนเงิน";
    case "counterpartyName":
      return "คู่ค้า/ผู้เกี่ยวข้อง";
    case "paymentSourceInstitutionName":
      return "ธนาคารผู้โอน";
    case "paymentDestinationInstitutionName":
      return "ธนาคารผู้รับเงิน";
    case "paymentSourceLabel":
      return "บัญชีผู้โอน";
    case "paymentDestinationLabel":
      return "บัญชีผู้รับเงิน";
    case "merchantName":
      return "ร้านค้า/คู่ค้า";
    case "paymentAccountNickname":
      return "ชื่อย่อบัญชี";
    case "paymentAccountLast4":
      return "เลขท้าย 4 ตัว";
    case "paymentAccountMaskedIdentifier":
      return "เลขที่ถูกปิดบัง";
    case "slipReference":
      return "เลขอ้างอิงสลิป";
    case "merchantId":
      return "รหัสร้านค้า";
    case "paymentFeeMinor":
      return "ค่าธรรมเนียม";
    case "occurredAt":
      return "วันเวลา";
    default:
      return field;
  }
}

function buildEvidenceSummaryLine(evidence: FinanceEvidenceItem[]): string {
  if (evidence.length === 0) {
    return "ยังไม่มีหลักฐานที่จับได้";
  }

  const priorityFields = [
    "amountMinor",
    "paymentSourceInstitutionName",
    "paymentDestinationInstitutionName",
    "counterpartyName",
    "paymentSourceLabel",
    "paymentDestinationLabel",
    "paymentSourceName",
    "paymentDestinationName",
    "occurredAt",
    "merchantName",
    "paymentAccountNickname",
    "paymentAccountLast4",
    "paymentAccountMaskedIdentifier",
    "slipReference",
    "merchantId",
    "paymentFeeMinor",
  ];

  const summaryLabels: string[] = [];

  for (const field of priorityFields) {
    if (evidence.some((item) => item.field === field)) {
      const label = getEvidenceFieldLabel(field);
      if (!summaryLabels.includes(label)) {
        summaryLabels.push(label);
      }
    }
  }

  for (const item of evidence) {
    const label = getEvidenceFieldLabel(item.field);
    if (!summaryLabels.includes(label)) {
      summaryLabels.push(label);
    }
  }

  const previewLabels = summaryLabels.slice(0, 4);
  const suffix = summaryLabels.length > previewLabels.length ? "…" : "";
  return `จับได้ ${evidence.length} รายการหลักฐาน: ${previewLabels.join(", ")}${suffix}`;
}

function buildTransferSummaryLine(
  sides: Array<{
    title: string;
    bank: string;
    account: string;
    accountName: string | null;
  }>,
  isSelfTransfer: boolean,
): string {
  if (sides.length < 2) {
    return "จับรายละเอียดการโอนแล้ว";
  }

  const source = sides[0];
  const destination = sides[1];
  const sourceLabel = source.accountName ? `${source.bank} · ${source.accountName}` : source.bank;
  const destinationLabel = destination.accountName ? `${destination.bank} · ${destination.accountName}` : destination.bank;
  if (isSelfTransfer) {
    return `โอนระหว่างบัญชีตัวเอง: ${sourceLabel} → ${destinationLabel}`;
  }

  return `รายการโอน: ${sourceLabel} → ${destinationLabel}`;
}

type FinanceCaptureIntent = "receipt" | "transfer_slip" | "statement";

type FinanceDraftPayload = {
  amountMinor?: number;
  currency?: string;
  categoryCode?: string;
  counterpartyId?: number | null;
  counterpartyName?: string | null;
  merchantName?: string | null;
  note?: string | null;
  humanReadableSummary?: string | null;
  evidence?: FinanceEvidenceItem[];
  missingFields?: string[];
  occurredAt?: string;
  documentRole?: string | null;
  paymentMethodKind?: "bank_account" | "credit_card" | "cash" | "unknown" | null;
  paymentDirection?: "outbound" | "inbound" | "both" | "unknown" | null;
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
};

type DraftEditState = {
  date: string;
  time: string;
  counterpartyName: string;
  paymentSourceLabel?: string;
  paymentDestinationLabel?: string;
  paymentSourceName?: string;
  paymentDestinationName?: string;
  paymentSourceInstitutionName?: string;
  paymentDestinationInstitutionName?: string;
  sourceUrl?: string;
  sourceFileName?: string;
  status: QuickActionStatus;
};

type MerchantSuggestion = {
  displayName: string;
  categoryCode: string | null;
  type: "income" | "expense" | "transfer";
  usageCount: number;
  lastSeenAt: string | null;
  aliases: string[];
};

type FrequentMerchantPatternSuggestion = {
  merchant: MerchantSuggestion;
  matchedLabel: string;
};

function findFrequentMerchantPatternSuggestion(
  preview: {
    counterpartyName: string | null;
    merchantName: string | null;
    paymentSourceName: string | null;
    paymentDestinationName: string | null;
    paymentAccountNickname: string | null;
  },
  merchants: MerchantSuggestion[],
  minimumUsageCount = 2,
): FrequentMerchantPatternSuggestion | null {
  const haystacks = [
    preview.counterpartyName,
    preview.merchantName,
    preview.paymentSourceName,
    preview.paymentDestinationName,
    preview.paymentAccountNickname,
  ]
    .map((value) => normalizePreviewComparisonText(value))
    .filter((value) => value.length > 0);

  if (haystacks.length === 0) {
    return null;
  }

  const candidates = merchants
    .filter((merchant) => merchant.usageCount >= minimumUsageCount)
    .map((merchant) => {
      const names = [merchant.displayName, ...merchant.aliases]
        .map((value) => normalizePreviewComparisonText(value))
        .filter((value) => value.length > 0);
      const matchedLabel = haystacks.find((haystack) => names.some((name) => haystack === name || haystack.includes(name) || name.includes(haystack)));
      return matchedLabel ? { merchant, matchedLabel } : null;
    })
    .filter((item): item is FrequentMerchantPatternSuggestion => Boolean(item))
    .sort((left, right) => right.merchant.usageCount - left.merchant.usageCount
      || new Date(right.merchant.lastSeenAt ?? 0).getTime() - new Date(left.merchant.lastSeenAt ?? 0).getTime()
      || left.merchant.displayName.localeCompare(right.merchant.displayName));

  return candidates[0] ?? null;
}

function getDraftPayload(draft: { payloadJson?: Record<string, unknown> | null }): FinanceDraftPayload {
  return (draft.payloadJson ?? {}) as FinanceDraftPayload;
}

function getDraftDateTimeInputState(value: string | Date | null | undefined): { date: string; time: string } {
  const candidate = value instanceof Date
    ? value
    : typeof value === "string" && value.trim()
      ? new Date(value)
      : new Date();

  if (Number.isNaN(candidate.getTime())) {
    return getCurrentDraftDateTime();
  }

  return {
    date: toDateInputValue(candidate),
    time: toTimeInputValue(candidate),
  };
}

function getFinanceCounterpartyLabel(type: "income" | "expense" | "transfer", counterpartyName: string | null | undefined, merchantName: string | null | undefined): string {
  const name = (counterpartyName ?? merchantName ?? "").trim();
  if (name) {
    return name;
  }

  switch (type) {
    case "income":
      return "ไม่ระบุผู้จ่าย";
    case "expense":
      return "ไม่ระบุผู้รับเงิน";
    default:
      return "ไม่ระบุคู่ค้า";
  }
}

function getFinanceFlowLabel(type: "income" | "expense" | "transfer", t: (key: string, fallback?: string) => string): string {
  switch (type) {
    case "income":
      return t("dashboard:finance.labels.receivedFrom", "รับจาก");
    case "expense":
      return t("dashboard:finance.labels.paidTo", "จ่ายให้");
    default:
      return t("dashboard:finance.labels.transferWith", "โอนกับ");
  }
}

function getPaymentInstrumentLabel(kind: "bank_account" | "credit_card" | "cash" | "unknown"): string {
  switch (kind) {
    case "bank_account":
      return "บัญชีธนาคาร";
    case "credit_card":
      return "บัตรเครดิต";
    case "cash":
      return "เงินสด";
    default:
      return "วิธีชำระเงิน";
  }
}

function getPaymentDirectionLabel(direction: "outbound" | "inbound" | "both" | "unknown"): string {
  switch (direction) {
    case "outbound":
      return "จ่ายออก";
    case "inbound":
      return "รับเข้า";
    case "both":
      return "โอนเงิน";
    default:
      return "รายการเงิน";
  }
}

function getFinanceOcrProviderLabel(providerId: string): string {
  if (providerId === "finance_payin_llm_parser") {
    return "ตัวแปลง LLM";
  }
  return getDocumentOcrProviderLabel(providerId);
}

function buildReadableSlipSummary(input: {
  humanReadableSummary: string | null;
  type: "income" | "expense" | "transfer";
  amountLabel: string;
  currency: string;
  counterpartyName: string | null;
  note: string | null;
  occurredAt: string | Date | null | undefined;
  paymentSourceInstitutionName: string | null | undefined;
  paymentDestinationInstitutionName: string | null | undefined;
  paymentSourceLabel: string | null | undefined;
  paymentDestinationLabel: string | null | undefined;
  paymentSourceName: string | null | undefined;
  paymentDestinationName: string | null | undefined;
  paymentInstitutionName: string | null | undefined;
  paymentDirection: "outbound" | "inbound" | "both" | "unknown" | null | undefined;
  slipReference: string | null;
  merchantId: string | null;
  paymentFeeMinor: number | null;
}): string {
  const clean = (value: string | null | undefined) => (value ?? "").trim();
  if (clean(input.humanReadableSummary)) {
    return clean(input.humanReadableSummary);
  }

  const occurredAt = input.occurredAt ? formatDateTime(input.occurredAt) : "—";
  const amount = input.amountLabel !== "—" ? input.amountLabel : "—";
  const counterparty = clean(input.counterpartyName) || "—";
  const sourceParty = [clean(input.paymentSourceInstitutionName), clean(input.paymentSourceLabel)].filter(Boolean).join(" · ") || clean(input.paymentInstitutionName) || "—";
  const destinationParty = [clean(input.paymentDestinationInstitutionName), clean(input.paymentDestinationLabel)].filter(Boolean).join(" · ") || clean(input.paymentInstitutionName) || "—";
  const note = clean(input.note);
  const feeLabel = input.paymentFeeMinor !== null ? ` · ค่าธรรมเนียม ${formatMoneyMinor(input.paymentFeeMinor, input.currency)}` : "";
  const refLabel = clean(input.slipReference) ? ` · อ้างอิง ${clean(input.slipReference)}` : "";

  if (input.type === "transfer") {
    const directionLabel = input.paymentDirection === "inbound"
      ? "รับเงิน"
      : input.paymentDirection === "outbound"
        ? "จ่ายเงิน"
        : "โอนเงิน";
    return [
      `สรุปสลิป: ${directionLabel} ${amount}${feeLabel}${refLabel}`,
      `ผู้โอน: ${sourceParty}`,
      `ผู้รับเงิน: ${destinationParty}`,
      `เมื่อ ${occurredAt}`,
      note ? `หมายเหตุ: ${note}` : "",
    ].filter(Boolean).join(" · ");
  }

  const verb = input.type === "income" ? "รับเงิน" : "จ่ายเงิน";
  return [
    `สรุปสลิป: ${verb} ${amount}${feeLabel}${refLabel}`,
    `คู่ค้า/ผู้รับ: ${counterparty}`,
    `ผ่าน ${clean(input.paymentInstitutionName) || "payment instrument"}`,
    `เมื่อ ${occurredAt}`,
    note ? `หมายเหตุ: ${note}` : "",
  ].filter(Boolean).join(" · ");
}

function buildPaymentAccountDisplayLabel(item: {
  nickname: string;
  institutionName: string;
  kind: string;
  last4?: string | null;
  maskedIdentifier?: string | null;
}): string {
  const parts = [item.nickname, item.institutionName];
  if (item.last4) {
    parts.push(`••••${item.last4}`);
  } else if (item.maskedIdentifier) {
    parts.push(item.maskedIdentifier);
  }
  if (item.kind === "credit_card") {
    parts.push("card");
  } else if (item.kind === "bank_account") {
    parts.push("account");
  }
  return parts.filter(Boolean).join(" · ");
}

function paymentAccountOptionList(items: Array<{
  id: number;
  displayLabel?: string;
  nickname: string;
  institutionName: string;
  kind: string;
  last4?: string | null;
  maskedIdentifier?: string | null;
  aliases?: string[];
  usageCount?: number;
}>): Array<{ id: number; displayName: string; aliases?: string[]; usageCount?: number }> {
  return items.map((item) => ({
    id: item.id,
    displayName: item.displayLabel ?? buildPaymentAccountDisplayLabel(item),
    aliases: item.aliases,
    usageCount: item.usageCount,
  }));
}

function resolvePaymentAccountSelection(
  displayName: string,
  items: Array<{
    id: number;
    displayLabel?: string;
    nickname: string;
    institutionName: string;
    kind: string;
    last4?: string | null;
    maskedIdentifier?: string | null;
    aliases?: string[];
  }>,
) {
  const normalized = displayName.trim().toLowerCase();
  return items.find((item) => {
    const label = (item.displayLabel ?? buildPaymentAccountDisplayLabel(item)).trim().toLowerCase();
    return label === normalized
      || item.nickname.trim().toLowerCase() === normalized
      || item.aliases?.some((alias) => alias.trim().toLowerCase() === normalized) === true;
  }) ?? null;
}

const QUICK_DRAFT_INTENT_PREFIX = /^\s*(?:Expense|Income|Transfer):\s*/i;

type FinanceSemanticDuplicateWarningRecord = {
  sourceKind: "exact_draft" | "exact_transaction" | "candidate_draft" | "candidate_transaction";
  sourceLabel: string;
  draftId: number;
  transactionId: number | null;
  type: "income" | "expense" | "transfer";
  amountMinor: number;
  currency: string;
  occurredAt: string;
  counterpartyName: string | null;
  merchantName: string | null;
  note: string | null;
  paymentMethodKind: "bank_account" | "credit_card" | "cash" | "unknown" | null;
  paymentDirection: "outbound" | "inbound" | "both" | "unknown" | null;
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
};

function buildSemanticDuplicateWarningSummary(record: FinanceSemanticDuplicateWarningRecord): string {
  return buildReadableSlipSummary({
    humanReadableSummary: null,
    type: record.type,
    amountLabel: formatMoneyMinor(record.amountMinor, record.currency),
    currency: record.currency,
    counterpartyName: record.counterpartyName ?? record.merchantName ?? null,
    note: record.note ?? null,
    occurredAt: record.occurredAt,
    paymentSourceInstitutionName: record.paymentSourceInstitutionName,
    paymentDestinationInstitutionName: record.paymentDestinationInstitutionName,
    paymentSourceLabel: record.paymentSourceLabel,
    paymentDestinationLabel: record.paymentDestinationLabel,
    paymentSourceName: record.paymentSourceName,
    paymentDestinationName: record.paymentDestinationName,
    paymentInstitutionName: record.paymentInstitutionName,
    paymentDirection: record.paymentDirection,
    slipReference: record.slipReference,
    merchantId: record.merchantId,
    paymentFeeMinor: record.paymentFeeMinor,
  });
}

function FinanceSemanticDuplicateWarningCard({
  conversationId,
  draftId,
}: {
  conversationId: number | null;
  draftId: number | null;
}) {
  const duplicateWarningQuery = trpc.finance.getSemanticDuplicateWarning.useQuery(
    {
      conversationId: conversationId ?? 0,
      draftId: draftId ?? 0,
    },
    {
      enabled: Boolean(conversationId && draftId),
    },
  );

  const duplicate = duplicateWarningQuery.data;
  if (!duplicate) {
    return null;
  }

  const summary = buildSemanticDuplicateWarningSummary(duplicate);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Possible duplicate slip
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {duplicate.sourceLabel}
          </p>
        </div>
        <Badge variant="outline" className="border-amber-200 bg-white text-amber-700">
          Review before confirm
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-800">
        {summary}
      </p>
    </div>
  );
}

type QuickActionStatus =
  | { kind: "idle"; message: null }
  | { kind: "saving"; message: string }
  | { kind: "saved"; message: string }
  | { kind: "draft"; message: string }
  | { kind: "error"; message: string };

type ReceiptUploadStatus =
  | { phase: "idle"; message: null; provider: null; fileName: null }
  | { phase: "reading"; message: string; provider: null; fileName: string }
  | { phase: "ocr"; message: string; provider: string | null; fileName: string }
  | { phase: "uploading"; message: string; provider: string | null; fileName: string }
  | { phase: "drafting"; message: string; provider: string | null; fileName: string }
  | { phase: "completed"; message: string; provider: string | null; fileName: string }
  | { phase: "error"; message: string; provider: string | null; fileName: string };

type FinanceTransactionPreviewRecord = {
  id: number;
  type: "income" | "expense" | "transfer";
  amountMinor: number;
  currency: string;
  occurredAt: Date;
  categoryCode: string;
  counterpartyName: string | null;
  merchantName: string | null;
  note: string | null;
  status: string;
  source: string;
  paymentMethodKind: "bank_account" | "credit_card" | "cash" | "unknown" | null;
  paymentDirection: "outbound" | "inbound" | "both" | "unknown" | null;
  paymentFeeMinor: number | null;
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
  slipReference?: string | null;
  merchantId?: string | null;
  sourceUrl?: string | null;
  sourceFileName?: string | null;
  paymentInstrumentConfidence?: number | null;
};

function getFinanceErrorMessage(error: unknown, fallback: string): string {
  const candidates: string[] = [];

  if (error instanceof Error && typeof error.message === "string") {
    candidates.push(error.message);
  }

  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    const maybeShapeMessage = (error as { shape?: { message?: unknown } }).shape?.message;
    const maybeDataMessage = (error as { data?: { message?: unknown } }).data?.message;
    const maybeCauseMessage = (error as { cause?: { message?: unknown } }).cause?.message;
    for (const value of [maybeMessage, maybeShapeMessage, maybeDataMessage, maybeCauseMessage]) {
      if (typeof value === "string") {
        candidates.push(value);
      }
    }
  }

  for (const candidate of candidates) {
    const message = candidate.trim();
    if (!message) continue;
    const normalized = message.toLowerCase();
    if (normalized === "no message available" || normalized === "undefined" || normalized === "null") {
      continue;
    }
    if (
      normalized.includes("unexpected token '<'")
      || normalized.includes("<!doctype")
      || normalized.includes("<html")
      || normalized.includes("returned html instead of json")
    ) {
      return `${fallback} The server returned HTML instead of JSON.`;
    }
    return message;
  }

  return fallback;
}

export function FinanceHub({
  conversationId,
  surface = "panel",
  compact = false,
  className,
  onCreatePersonalChat,
  onOpenFinancePanel,
  onMirrorFinanceActivity,
}: FinanceHubProps) {
  const { t } = useScopedTranslation("dashboard");
  const getLocalizedTransactionTypeLabel = (type: string): string => {
    switch (type) {
      case "income":
        return t("finance.values.transactionType.income");
      case "expense":
        return t("finance.values.transactionType.expense");
      case "transfer":
        return t("finance.values.transactionType.transfer");
      default:
        return t("finance.values.transactionType.default");
    }
  };
  const getLocalizedFinanceSourceLabel = (source: string): string => {
    switch (source) {
      case "ocr_document":
        return t("finance.values.source.ocrDocument");
      case "chat_text":
        return t("finance.values.source.chatText");
      case "recurring_rule":
        return t("finance.values.source.recurringRule");
      case "api":
        return t("finance.values.source.api");
      case "import":
        return t("finance.values.source.import");
      default:
        return source;
    }
  };
  const getLocalizedPaymentInstrumentLabel = (
    kind: "bank_account" | "credit_card" | "cash" | "unknown",
  ): string => {
    switch (kind) {
      case "bank_account":
        return t("finance.values.paymentInstrument.bankAccount");
      case "credit_card":
        return t("finance.values.paymentInstrument.creditCard");
      case "cash":
        return t("finance.values.paymentInstrument.cash");
      default:
        return t("finance.values.paymentInstrument.unknown");
    }
  };
  const getLocalizedPaymentDirectionLabel = (
    direction: "outbound" | "inbound" | "both" | "unknown",
  ): string => {
    switch (direction) {
      case "outbound":
        return t("finance.values.paymentDirection.outbound");
      case "inbound":
        return t("finance.values.paymentDirection.inbound");
      case "both":
        return t("finance.values.paymentDirection.both");
      default:
        return t("finance.values.paymentDirection.unknown");
    }
  };
  const getLocalizedFinanceCounterpartyLabel = (
    type: "income" | "expense" | "transfer",
    counterpartyName: string | null | undefined,
    merchantName: string | null | undefined,
  ): string => {
    const name = (counterpartyName ?? merchantName ?? "").trim();
    if (name) {
      return name;
    }

    switch (type) {
      case "income":
        return t("finance.values.counterparty.unspecifiedPayer");
      case "expense":
        return t("finance.values.counterparty.unspecifiedPayee");
      default:
        return t("finance.values.counterparty.unspecifiedCounterparty");
    }
  };
  const buildLocalizedReadableSlipSummary = (input: {
    type: "income" | "expense" | "transfer";
    amountLabel: string;
    counterpartyName: string | null;
    occurredAt: string | Date | null | undefined;
    paymentSourceInstitutionName: string | null;
    paymentDestinationInstitutionName: string | null;
    paymentSourceLabel: string | null;
    paymentDestinationLabel: string | null;
    paymentSourceName: string | null;
    paymentDestinationName: string | null;
    paymentInstitutionName: string | null;
    slipReference: string | null;
    paymentFeeMinor: number | null;
    currency: string;
  }): string => {
    const clean = (value: string | null | undefined) => (value ?? "").trim();
    const feeLabel = input.paymentFeeMinor !== null
      ? t("finance.confirmed.summary.fee", {
          amount: formatMoneyMinor(input.paymentFeeMinor, input.currency),
        })
      : "";
    const refLabel = clean(input.slipReference)
      ? t("finance.confirmed.summary.reference", {
          reference: clean(input.slipReference),
        })
      : "";
    const occurredAt = formatDateTime(input.occurredAt);

    if (input.type === "transfer") {
      const source = clean(input.paymentSourceName)
        || clean(input.paymentSourceLabel)
        || clean(input.paymentSourceInstitutionName)
        || t("finance.values.counterparty.unspecifiedPayer");
      const destination = clean(input.paymentDestinationName)
        || clean(input.paymentDestinationLabel)
        || clean(input.paymentDestinationInstitutionName)
        || t("finance.values.counterparty.unspecifiedPayee");
      return t("finance.confirmed.summary.transfer", {
        amount: input.amountLabel,
        source,
        destination,
        fee: feeLabel,
        reference: refLabel,
        date: occurredAt,
      });
    }

    const counterparty = clean(input.counterpartyName)
      || clean(input.paymentInstitutionName)
      || (input.type === "income"
        ? t("finance.values.counterparty.unspecifiedPayer")
        : t("finance.values.counterparty.unspecifiedPayee"));

    return t(
      input.type === "income"
        ? "finance.confirmed.summary.income"
        : "finance.confirmed.summary.expense",
      {
        amount: input.amountLabel,
        counterparty,
        fee: feeLabel,
        reference: refLabel,
        date: occurredAt,
      },
    );
  };
  const utils = trpc.useUtils();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [draftText, setDraftText] = useState("");
  const [draftCategoryHint, setDraftCategoryHint] = useState("");
  const [draftCounterpartyName, setDraftCounterpartyName] = useState("");
  const [draftTypeHint, setDraftTypeHint] = useState<"auto" | "income" | "expense" | "transfer">("auto");
  const initialDraftDateTime = useMemo(() => getCurrentDraftDateTime(), []);
  const [draftDate, setDraftDate] = useState(initialDraftDateTime.date);
  const [draftTime, setDraftTime] = useState(initialDraftDateTime.time);
  const [quickActionStatus, setQuickActionStatus] = useState<QuickActionStatus>({ kind: "idle", message: null });
  const [draftEditStates, setDraftEditStates] = useState<Record<number, DraftEditState>>({});
  const [pendingVoidTransactionId, setPendingVoidTransactionId] = useState<number | null>(null);
  const [pendingVoidReason, setPendingVoidReason] = useState(() => readStoredActionReason("voidConfirmedTransaction"));
  const [selectedEvidenceTransactionId, setSelectedEvidenceTransactionId] = useState<number | null>(null);
  const [evidenceSearchText, setEvidenceSearchText] = useState("");
  const [captureIntent, setCaptureIntent] = useState<FinanceCaptureIntent>("receipt");
  const proofUploadIntentRef = useRef<FinanceCaptureIntent | null>(null);
  const [draftPaymentSourceLabel, setDraftPaymentSourceLabel] = useState("");
  const [draftPaymentDestinationLabel, setDraftPaymentDestinationLabel] = useState("");
  const [draftPaymentSourceInstitutionName, setDraftPaymentSourceInstitutionName] = useState("");
  const [draftPaymentDestinationInstitutionName, setDraftPaymentDestinationInstitutionName] = useState("");
  const [draftPaymentInstitutionName, setDraftPaymentInstitutionName] = useState("");
  const [draftPaymentInstitutionKind, setDraftPaymentInstitutionKind] = useState<"bank" | "issuer" | "other">("bank");
  const [draftPaymentAccountKind, setDraftPaymentAccountKind] = useState<"bank_account" | "credit_card" | "cash" | "unknown">("bank_account");
  const [draftPaymentAccountNickname, setDraftPaymentAccountNickname] = useState("");
  const [draftPaymentAccountLast4, setDraftPaymentAccountLast4] = useState("");
  const [draftPaymentAccountMaskedIdentifier, setDraftPaymentAccountMaskedIdentifier] = useState("");
  const [draftPaymentAccountAliases, setDraftPaymentAccountAliases] = useState("");
  const [receiptUploadPreviewExpanded, setReceiptUploadPreviewExpanded] = useState(false);
  const [receiptUploadOverviewExpanded, setReceiptUploadOverviewExpanded] = useState(false);
  const [receiptUploadPreviewDetailsExpanded, setReceiptUploadPreviewDetailsExpanded] = useState(false);
  const [receiptUploadPreviewEvidenceExpanded, setReceiptUploadPreviewEvidenceExpanded] = useState(false);
  const [receiptUploadPreviewVisible, setReceiptUploadPreviewVisible] = useState(false);
  const [receiptUploadPreviewContentVisible, setReceiptUploadPreviewContentVisible] = useState(false);
  const [receiptUploadDraftId, setReceiptUploadDraftId] = useState<number | null>(null);
  const [receiptUploadDraftVersion, setReceiptUploadDraftVersion] = useState<number | null>(null);
  const [receiptUploadAppliedPresetLabel, setReceiptUploadAppliedPresetLabel] = useState<string | null>(null);
  const [receiptUploadPresetAlternativesVisible, setReceiptUploadPresetAlternativesVisible] = useState(false);
  const [receiptUploadPreview, setReceiptUploadPreview] = useState<{
    type: "income" | "expense" | "transfer";
    amountMinor: number | null;
    currency: string;
    categoryCode: string | null;
    counterpartyName: string | null;
    merchantName: string | null;
    note: string | null;
    occurredAt: string | null;
    paymentMethodKind: "bank_account" | "credit_card" | "cash" | "unknown" | null;
    paymentDirection: "outbound" | "inbound" | "both" | "unknown" | null;
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
    humanReadableSummary: string | null;
    confidence: number | null;
    missingFields: string[];
    evidence: FinanceEvidenceItem[];
    sourceUrl: string | null;
    sourceFileName: string | null;
    mimeType: string | null;
  } | null>(null);
  const quickActionModeRef = useRef<"manual" | "quick" | null>(null);
  const deferredCounterpartySearch = useDeferredValue(draftCounterpartyName.trim());
  const isMobileViewport = useIsMobile();
  const [receiptUploadStatus, setReceiptUploadStatus] = useState<ReceiptUploadStatus>({
    phase: "idle",
    message: null,
    provider: null,
    fileName: null,
  });

  const { isRecording, isTranscribing, startRecording, stopRecording } = usePushToTalk({
    onTranscription: (text) => {
      setDraftText((current) => {
        const trimmed = current.trim();
        return trimmed ? `${trimmed} ${text}` : text;
      });
      draftTextareaRef.current?.focus();
    },
    onError: (message) => toast.error(message),
    maxRecordingMs: 60_000,
  });

  const conversationQuery = trpc.chat.getConversation.useQuery(
    { id: conversationId ?? 0 },
    { enabled: conversationId !== null },
  );

  const isPersonalConversation = conversationQuery.data?.projectId === "personal";
  const financeReady = Boolean(conversationId && isPersonalConversation);
  const draftLimit = compact ? 3 : 5;
  const transactionLimit = compact ? 3 : 5;
  const recurringLimit = compact ? 3 : 5;

  const dailySummaryQuery = trpc.finance.getDailySummary.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: financeReady },
  );
  const monthlySummaryQuery = trpc.finance.getMonthlySummary.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: financeReady },
  );
  const slipMappingPresetsQuery = trpc.finance.getSlipMappingPresets.useQuery(
    undefined,
    { enabled: financeReady },
  );
  const pinnedMerchantPresetsQuery = trpc.finance.getPinnedMerchantPresets.useQuery(
    undefined,
    { enabled: financeReady },
  );
  const draftsQuery = trpc.finance.listDrafts.useQuery(
    { conversationId: conversationId ?? 0, limit: draftLimit },
    { enabled: financeReady },
  );
  const transactionsQuery = trpc.finance.listTransactions.useQuery(
    {
      conversationId: conversationId ?? 0,
      status: "confirmed",
      limit: transactionLimit,
    },
    { enabled: financeReady },
  );
  const recurringRulesQuery = trpc.finance.listRecurringRules.useQuery(
    { conversationId: conversationId ?? 0, status: "active", limit: recurringLimit },
    { enabled: financeReady },
  );
  const counterpartiesQuery = trpc.finance.listCounterparties.useQuery(
    {
      conversationId: conversationId ?? 0,
      query: deferredCounterpartySearch || undefined,
      limit: 8,
    },
    { enabled: financeReady },
  );
  const paymentInstitutionsQuery = trpc.finance.listPaymentInstitutions.useQuery(
    {
      conversationId: conversationId ?? 0,
      limit: 12,
    },
    { enabled: financeReady },
  );
  const paymentAccountsQuery = trpc.finance.listPaymentAccounts.useQuery(
    {
      conversationId: conversationId ?? 0,
      limit: 12,
    },
    { enabled: financeReady },
  );
  const financeSlipMappingPresets = slipMappingPresetsQuery.data?.length
    ? slipMappingPresetsQuery.data
    : DEFAULT_FINANCE_SLIP_MAPPING_PRESETS;
  const pinnedMerchantPresets = pinnedMerchantPresetsQuery.data ?? [];
  const draftsQueryErrorMessage = draftsQuery.error
    ? getFinanceErrorMessage(draftsQuery.error, "โหลดฉบับร่างที่เปิดอยู่ไม่สำเร็จ")
    : null;
  const financeDebugEnabled = import.meta.env.DEV;
  const monthlyTransactionsQuery = trpc.finance.listTransactions.useQuery(
    {
      conversationId: conversationId ?? 0,
      status: "confirmed",
      fromDate: monthlySummaryQuery.data?.rangeStart ? new Date(monthlySummaryQuery.data.rangeStart) : undefined,
      toDate: monthlySummaryQuery.data?.rangeEnd ? new Date(monthlySummaryQuery.data.rangeEnd) : undefined,
      limit: compact ? 25 : 100,
    },
    { enabled: financeReady && Boolean(monthlySummaryQuery.data?.rangeStart && monthlySummaryQuery.data?.rangeEnd) },
  );
  const financeEvidenceQuery = trpc.finance.searchFinanceEvidence.useQuery(
    {
      conversationId: conversationId ?? 0,
      transactionId: selectedEvidenceTransactionId ?? undefined,
      query: evidenceSearchText.trim() || undefined,
      limit: compact ? 3 : 5,
    },
    {
      enabled:
        financeReady
        && (selectedEvidenceTransactionId !== null || evidenceSearchText.trim().length > 0),
    },
  );
  const paymentAccountItems = paymentAccountOptionList(paymentAccountsQuery.data ?? []);
  const selectedDraftPaymentSourceAccount = useMemo(
    () => resolvePaymentAccountSelection(draftPaymentSourceLabel, paymentAccountsQuery.data ?? []),
    [draftPaymentSourceLabel, paymentAccountsQuery.data],
  );
  const selectedDraftPaymentDestinationAccount = useMemo(
    () => resolvePaymentAccountSelection(draftPaymentDestinationLabel, paymentAccountsQuery.data ?? []),
    [draftPaymentDestinationLabel, paymentAccountsQuery.data],
  );
  const selectedCapturePaymentAccount = draftTypeHint === "income"
    ? selectedDraftPaymentDestinationAccount
    : selectedDraftPaymentSourceAccount;

  const invalidateConfirmedTransactionQueries = async () => {
    if (!conversationId || !monthlySummaryQuery.data?.rangeStart || !monthlySummaryQuery.data?.rangeEnd) {
      await utils.finance.listTransactions.invalidate({
        conversationId: conversationId ?? 0,
        status: "confirmed",
        limit: transactionLimit,
      });
      return;
    }

    await Promise.all([
      utils.finance.listTransactions.invalidate({
        conversationId,
        status: "confirmed",
        limit: transactionLimit,
      }),
      utils.finance.listTransactions.invalidate({
        conversationId,
        status: "confirmed",
        fromDate: new Date(monthlySummaryQuery.data.rangeStart),
        toDate: new Date(monthlySummaryQuery.data.rangeEnd),
        limit: compact ? 25 : 100,
      }),
    ]);
  };

  const parseTextMutation = trpc.finance.parseTextToDraft.useMutation({
    onSuccess: async () => {
      setDraftText("");
      setDraftCategoryHint("");
      setDraftCounterpartyName("");
      setDraftTypeHint("auto");
      const next = getCurrentDraftDateTime();
      setDraftDate(next.date);
      setDraftTime(next.time);
      if (quickActionModeRef.current !== "quick") {
        setQuickActionStatus({ kind: "idle", message: null });
      }
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      if (quickActionModeRef.current !== "quick") {
        toast.success("Finance draft created");
      }
    },
    onError: (error) => toast.error(error.message || "สร้างฉบับร่างการเงินไม่สำเร็จ"),
  });

  const upsertPaymentInstitutionMutation = trpc.finance.upsertPaymentInstitution.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listPaymentInstitutions.invalidate({ conversationId: conversationId ?? 0, limit: 12 }),
        utils.finance.listPaymentAccounts.invalidate({ conversationId: conversationId ?? 0, limit: 12 }),
      ]);
    },
    onError: (error) => toast.error(error.message || "บันทึกสถาบันการเงินไม่สำเร็จ"),
  });

  const upsertPaymentAccountMutation = trpc.finance.upsertPaymentAccount.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listPaymentAccounts.invalidate({ conversationId: conversationId ?? 0, limit: 12 }),
        utils.finance.listPaymentInstitutions.invalidate({ conversationId: conversationId ?? 0, limit: 12 }),
      ]);
    },
    onError: (error) => toast.error(error.message || "บันทึกบัญชีชำระเงินไม่สำเร็จ"),
  });

  const archivePaymentAccountMutation = trpc.finance.archivePaymentAccount.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listPaymentAccounts.invalidate({ conversationId: conversationId ?? 0, limit: 12 }),
        utils.finance.listPaymentInstitutions.invalidate({ conversationId: conversationId ?? 0, limit: 12 }),
      ]);
    },
    onError: (error) => toast.error(error.message || "ย้ายบัญชีชำระเงินไปเก็บถาวรไม่สำเร็จ"),
  });

  const updateDraftMutation = trpc.finance.updateDraft.useMutation({
    onSuccess: async () => {
      await utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit });
    },
    onError: (error) => toast.error(error.message || "อัปเดตฉบับร่างไม่สำเร็จ"),
  });

  const cancelDraftMutation = trpc.finance.cancelDraft.useMutation({
    onSuccess: async (_draft, variables) => {
      if (receiptUploadDraftId === variables.draftId) {
        setReceiptUploadDraftId(null);
        setReceiptUploadDraftVersion(null);
      }
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("Draft cancelled", {
        action: {
          label: "Undo",
          onClick: () => {
            if (!conversationId || variables.draftId === undefined) return;
            void restoreDraftMutation.mutateAsync({
              conversationId,
              draftId: variables.draftId,
            });
          },
        },
      });
    },
    onError: (error) => toast.error(error.message || "ยกเลิกฉบับร่างไม่สำเร็จ"),
  });

  const restoreDraftMutation = trpc.finance.restoreDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("Draft restored");
    },
    onError: (error) => toast.error(error.message || "กู้คืนฉบับร่างไม่สำเร็จ"),
  });

  const confirmDraftMutation = trpc.finance.confirmDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        invalidateConfirmedTransactionQueries(),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      if (quickActionModeRef.current !== "quick") {
        toast.success("Draft confirmed");
      }
    },
    onError: (error) => toast.error(error.message || "ยืนยันฉบับร่างไม่สำเร็จ"),
  });

  const voidTransactionMutation = trpc.finance.voidTransaction.useMutation({
    onSuccess: async (_transaction, variables) => {
      if (selectedEvidenceTransactionId === variables.transactionId) {
        setSelectedEvidenceTransactionId(null);
      }
      setPendingVoidTransactionId(null);
      setPendingVoidReason("");
      storeActionReason("voidConfirmedTransaction", variables.reason ?? "");
      await Promise.all([
        invalidateConfirmedTransactionQueries(),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("Confirmed transaction removed");
    },
    onError: (error) => toast.error(error.message || "ลบรายการที่ยืนยันแล้วไม่สำเร็จ"),
  });

  const pauseRecurringRuleMutation = trpc.finance.pauseRecurringRule.useMutation({
    onSuccess: async () => {
      await utils.finance.listRecurringRules.invalidate({
        conversationId: conversationId ?? 0,
        status: "active",
        limit: recurringLimit,
      });
      toast.success("Recurring rule paused");
    },
    onError: (error) => toast.error(error.message || "หยุดกฎรายการประจำชั่วคราวไม่สำเร็จ"),
  });

  const resumeRecurringRuleMutation = trpc.finance.resumeRecurringRule.useMutation({
    onSuccess: async () => {
      await utils.finance.listRecurringRules.invalidate({
        conversationId: conversationId ?? 0,
        status: "active",
        limit: recurringLimit,
      });
      toast.success("Recurring rule resumed");
    },
    onError: (error) => toast.error(error.message || "เริ่มใช้กฎรายการประจำอีกครั้งไม่สำเร็จ"),
  });

  const uploadFileMutation = trpc.library.uploadFile.useMutation();
  const analyzeAttachmentAssistMutation = trpc.localAi.analyzeAttachmentAssist.useMutation();
  const ingestDocumentMutation = trpc.finance.ingestFinanceDocument.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("ประมวลผลใบเสร็จแล้ว");
    },
    onError: (error) => toast.error(getFinanceErrorMessage(error, "ประมวลผล OCR ใบเสร็จไม่สำเร็จ")),
  });

  const isReceiptUploadBusy = receiptUploadStatus.phase === "reading"
    || receiptUploadStatus.phase === "ocr"
    || receiptUploadStatus.phase === "uploading"
    || receiptUploadStatus.phase === "drafting";

  const refreshFinance = async () => {
    if (!conversationId) {
      return;
    }

    await Promise.all([
      utils.finance.listDrafts.invalidate({ conversationId, limit: draftLimit }),
      invalidateConfirmedTransactionQueries(),
      utils.finance.listRecurringRules.invalidate({
        conversationId,
        status: "active",
        limit: recurringLimit,
      }),
      utils.finance.getDailySummary.invalidate({ conversationId }),
      utils.finance.getMonthlySummary.invalidate({ conversationId }),
    ]);
  };

  const buildQuickDraftText = (nextType: "income" | "expense", currentText: string) => {
    const seed = nextType === "expense"
      ? t("dashboard:finance.quick.expenseSeed", "รายจ่าย: ")
      : t("dashboard:finance.quick.incomeSeed", "รายรับ: ");

    const trimmed = currentText.trim();
    if (!trimmed) {
      return seed;
    }

    const normalized = currentText.replace(QUICK_DRAFT_INTENT_PREFIX, "").trimStart();
    return `${seed}${normalized}`;
  };

  const handleResetDraftDateTime = () => {
    const next = getCurrentDraftDateTime();
    setDraftDate(next.date);
    setDraftTime(next.time);
    setQuickActionStatus({ kind: "idle", message: null });
  };

  const buildPaymentPayloadForType = (type: "income" | "expense" | "transfer") => {
    const source = resolvePaymentAccountSelection(draftPaymentSourceLabel, paymentAccountsQuery.data ?? []);
    const destination = resolvePaymentAccountSelection(draftPaymentDestinationLabel, paymentAccountsQuery.data ?? []);
    const selectedAccount = type === "income" ? destination : source;
    const paymentDirection: "outbound" | "inbound" | "both" | "unknown" = type === "income"
      ? "inbound"
      : type === "transfer"
        ? "both"
        : "outbound";
    const paymentMethodKind = (selectedAccount?.kind as "bank_account" | "credit_card" | "cash" | "unknown" | undefined) ?? "unknown";
    const paymentInstitutionName = selectedAccount?.institutionName ?? (draftPaymentInstitutionName.trim() || null);
    const paymentAccountNickname = selectedAccount?.nickname ?? (draftPaymentAccountNickname.trim() || null);
    const paymentAccountLast4 = selectedAccount?.last4 ?? (draftPaymentAccountLast4.trim() || null);
    const paymentSourceInstitutionName = type === "income"
      ? null
      : source?.institutionName ?? (draftPaymentSourceInstitutionName.trim() || null);
    const paymentDestinationInstitutionName = type === "expense"
      ? null
      : destination?.institutionName ?? (draftPaymentDestinationInstitutionName.trim() || null);
    return {
      paymentMethodKind,
      paymentDirection,
      paymentSourceAccountId: type === "income" ? null : source?.id ?? null,
      paymentDestinationAccountId: type === "income" ? destination?.id ?? null : type === "transfer" ? destination?.id ?? null : null,
      paymentSourceLabel: type === "income" ? null : (source?.displayLabel ?? (draftPaymentSourceLabel.trim() || null)),
      paymentDestinationLabel: type === "income" ? (destination?.displayLabel ?? (draftPaymentDestinationLabel.trim() || null)) : type === "transfer" ? (destination?.displayLabel ?? (draftPaymentDestinationLabel.trim() || null)) : null,
      paymentSourceInstitutionName,
      paymentDestinationInstitutionName,
      paymentInstitutionName,
      paymentAccountNickname,
      paymentAccountLast4,
      paymentAccountMaskedIdentifier: selectedAccount?.maskedIdentifier ?? (draftPaymentAccountMaskedIdentifier.trim() || null),
      paymentInstrumentConfidence: selectedAccount ? 0.9 : 0.35,
    };
  };

  const selectPaymentAccountAsActive = (label: string, accountType: "source" | "destination") => {
    const selected = resolvePaymentAccountSelection(label, paymentAccountsQuery.data ?? []);
    if (accountType === "source") {
      setDraftPaymentSourceLabel(label);
      setDraftPaymentSourceInstitutionName(selected?.institutionName ?? "");
    } else {
      setDraftPaymentDestinationLabel(label);
      setDraftPaymentDestinationInstitutionName(selected?.institutionName ?? "");
    }
  };

  const handleSavePaymentAccount = async () => {
    if (!conversationId) {
      return;
    }

    const institutionName = draftPaymentInstitutionName.trim();
    const nickname = draftPaymentAccountNickname.trim();
    if (!institutionName || !nickname) {
      toast.error("กรุณาระบุชื่อธนาคาร/ผู้ออกบัตรและชื่อเล่น");
      return;
    }

    try {
      await upsertPaymentAccountMutation.mutateAsync({
        conversationId,
        paymentInstitutionName: institutionName,
        paymentInstitutionKind: draftPaymentInstitutionKind,
        kind: draftPaymentAccountKind,
        nickname,
        last4: draftPaymentAccountLast4.trim() || null,
        maskedIdentifier: draftPaymentAccountMaskedIdentifier.trim() || null,
        aliases: draftPaymentAccountAliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        isPrimary: false,
      });
      setDraftPaymentAccountNickname("");
      setDraftPaymentAccountLast4("");
      setDraftPaymentAccountMaskedIdentifier("");
      setDraftPaymentAccountAliases("");
      toast.success("บันทึกบัญชีแล้ว");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "บันทึกบัญชีไม่สำเร็จ");
    }
  };

  const handleResetPaymentAccountForm = () => {
    setDraftPaymentInstitutionName("");
    setDraftPaymentInstitutionKind("bank");
    setDraftPaymentAccountKind("bank_account");
    setDraftPaymentAccountNickname("");
    setDraftPaymentAccountLast4("");
    setDraftPaymentAccountMaskedIdentifier("");
    setDraftPaymentAccountAliases("");
    setDraftPaymentSourceInstitutionName("");
    setDraftPaymentDestinationInstitutionName("");
  };

  const handleSelectPaymentInstitution = (item: { displayName: string; kind: string }) => {
    setDraftPaymentInstitutionName(item.displayName);
    if (item.kind === "bank" || item.kind === "issuer" || item.kind === "other") {
      setDraftPaymentInstitutionKind(item.kind);
    }
    if (item.kind === "issuer") {
      setDraftPaymentAccountKind("credit_card");
    }
  };

  const handleParseText = async () => {
    if (!conversationId || !draftText.trim()) {
      return;
    }

    const occurredAt = buildDraftOccurredAtIso(draftDate, draftTime);
    if (!occurredAt) {
      toast.error(t("dashboard:finance.quick.statusInvalidDateTime", "กรุณาเลือกวันและเวลาที่ถูกต้อง"));
      return;
    }

    quickActionModeRef.current = "manual";
    try {
      const paymentPayload = buildPaymentPayloadForType(
        draftTypeHint === "auto" ? "expense" : draftTypeHint,
      );
      const draft = await parseTextMutation.mutateAsync({
        conversationId,
        text: draftText.trim(),
        categoryHint: draftCategoryHint.trim() || null,
        counterpartyName: draftCounterpartyName.trim() || null,
        typeHint: draftTypeHint === "auto" ? null : draftTypeHint,
        occurredAt,
        ...paymentPayload,
      });
      const draftPayload = getDraftPayload(draft);
      const counterpartyLabel = getFinanceCounterpartyLabel(
        draft.type,
        draftPayload.counterpartyName,
        draftPayload.merchantName,
      );
      if (onMirrorFinanceActivity) {
        try {
          await onMirrorFinanceActivity({
            content: `สร้างฉบับร่างการเงินจากข้อความแชท: ${counterpartyLabel} · วันที่ ${formatDateTime(draftPayload.occurredAt)}`,
            artifacts: [
              {
                id: `finance-draft-${draft.id}`,
                type: "table",
                title: "ฉบับร่างการเงิน",
                content: [
                  `ประเภท: ${getTransactionTypeLabel(draft.type)}`,
                  `จำนวนเงิน: ${formatMoneyMinor(draftPayload.amountMinor, draftPayload.currency)}`,
                  `คู่ค้า/ผู้เกี่ยวข้อง: ${counterpartyLabel}`,
                  `หมวดหมู่: ${draftPayload.categoryCode ?? "ไม่ระบุหมวดหมู่"}`,
                  `วันที่ทำรายการ: ${formatDateTime(draftPayload.occurredAt)}`,
                  `แหล่งที่มา: ${getFinanceSourceLabel(draft.source)}`,
                ],
                metadata: {
                  finance: {
                    kind: "draft",
                    draftId: draft.id,
                    type: draft.type,
                    amountMinor: draftPayload.amountMinor ?? null,
                    currency: draftPayload.currency ?? DEFAULT_CURRENCY,
                    categoryCode: draftPayload.categoryCode ?? "uncategorized",
                    counterpartyName: draftPayload.counterpartyName ?? draftPayload.merchantName ?? null,
                    merchantName: draftPayload.merchantName ?? null,
                    source: draft.source,
                    status: draft.status,
                    confidence: draft.confidence,
                    projectId: conversationQuery.data?.projectId ?? null,
                  },
                },
              },
            ],
          });
        } catch {
          // Best-effort mirror to chat; do not block finance drafting if chat persistence fails.
        }
      }
      await refreshFinance();
    } finally {
      quickActionModeRef.current = null;
    }
  };

  const handleQuickDraftAction = async (nextType: "income" | "expense") => {
    if (!conversationId) {
      return;
    }

    const hasUserContent = draftText.replace(QUICK_DRAFT_INTENT_PREFIX, "").trim().length > 0;
    const preparedText = buildQuickDraftText(nextType, draftText);
    setDraftTypeHint(nextType);
    setDraftText(preparedText);
    draftTextareaRef.current?.focus();

    if (!hasUserContent) {
      setQuickActionStatus({
        kind: "draft",
        message: t(
          "dashboard:finance.quick.statusNeedText",
          "พิมพ์รายละเอียดก่อน แล้วกดบันทึกด่วนอีกครั้งเพื่อบันทึก",
        ),
      });
      return;
    }

    quickActionModeRef.current = "quick";
    setQuickActionStatus({
      kind: "saving",
      message: t("dashboard:finance.quick.statusSaving", "กำลังประมวลผลและบันทึก..."),
    });

    const occurredAt = buildDraftOccurredAtIso(draftDate, draftTime);
    if (!occurredAt) {
      setQuickActionStatus({
        kind: "error",
        message: t("dashboard:finance.quick.statusInvalidDateTime", "กรุณาเลือกวันและเวลาที่ถูกต้อง"),
      });
      quickActionModeRef.current = null;
      return;
    }

    try {
      const paymentPayload = buildPaymentPayloadForType(nextType);
      const draft = await parseTextMutation.mutateAsync({
        conversationId,
        text: preparedText.trim(),
        categoryHint: draftCategoryHint.trim() || null,
        counterpartyName: draftCounterpartyName.trim() || null,
        typeHint: nextType,
        occurredAt,
        ...paymentPayload,
      });
      const draftPayload = getDraftPayload(draft);
      const counterpartyLabel = getFinanceCounterpartyLabel(
        draft.type,
        draftPayload.counterpartyName,
        draftPayload.merchantName,
      );

      if (draft.needsClarification) {
        setQuickActionStatus({
          kind: "draft",
          message: t(
            "dashboard:finance.quick.statusDraft",
            "บันทึกเป็นฉบับร่างเพราะยังต้องตรวจสอบบางรายละเอียด",
          ),
        });
        toast.info(
          t(
            "dashboard:finance.quick.statusDraftToast",
            "บันทึกเป็นฉบับร่างและพร้อมตรวจสอบแล้ว",
          ),
        );
        return;
      }

      await confirmDraftMutation.mutateAsync({
        conversationId,
        draftId: draft.id,
      });

      setQuickActionStatus({
        kind: "saved",
        message: t(
          "dashboard:finance.quick.statusSaved",
          "บันทึกลงสมุดการเงินและอัปเดตสรุปด้านบนแล้ว",
        ),
      });

      if (onMirrorFinanceActivity) {
        try {
          await onMirrorFinanceActivity({
            content: `บันทึกรายการ ${draft.type} จากการบันทึกด่วน: ${counterpartyLabel} · วันที่ ${formatDateTime(draftPayload.occurredAt)}`,
            artifacts: [
              {
                id: `finance-transaction-${draft.id}`,
                type: "table",
                title: "รายการการเงิน",
                content: [
                  `ประเภท: ${getTransactionTypeLabel(draft.type)}`,
                  `จำนวนเงิน: ${formatMoneyMinor(draftPayload.amountMinor, draftPayload.currency)}`,
                  `คู่ค้า/ผู้เกี่ยวข้อง: ${counterpartyLabel}`,
                  `หมวดหมู่: ${draftPayload.categoryCode ?? "ไม่ระบุหมวดหมู่"}`,
                  `วันที่ทำรายการ: ${formatDateTime(draftPayload.occurredAt)}`,
                  `สถานะ: ยืนยันแล้ว`,
                ],
                metadata: {
                  finance: {
                    kind: "transaction",
                    transactionId: draft.id,
                    type: draft.type,
                    amountMinor: draftPayload.amountMinor ?? null,
                    currency: draftPayload.currency ?? DEFAULT_CURRENCY,
                    categoryCode: draftPayload.categoryCode ?? "uncategorized",
                    counterpartyName: draftPayload.counterpartyName ?? draftPayload.merchantName ?? null,
                    merchantName: draftPayload.merchantName ?? null,
                    source: draft.source,
                    status: "confirmed",
                    confidence: draft.confidence,
                    projectId: conversationQuery.data?.projectId ?? null,
                  },
                },
              },
            ],
          });
        } catch {
          // Best-effort mirror to chat; the finance transaction is already committed.
        }
      }

      toast.success(
        t(
          "dashboard:finance.quick.statusSavedToast",
          "บันทึกแล้วและอัปเดตสรุป",
        ),
      );
      await refreshFinance();
    } catch (error) {
      setQuickActionStatus({
        kind: "error",
        message: error instanceof Error ? error.message : t("dashboard:finance.quick.statusError", "บันทึกรายการการเงินไม่สำเร็จ"),
      });
      toast.error(error instanceof Error ? error.message : t("dashboard:finance.quick.statusError", "บันทึกรายการการเงินไม่สำเร็จ"));
    } finally {
      quickActionModeRef.current = null;
    }
  };

  const handleReceiptUpload = async (file: File) => {
    if (!conversationId || !financeReady) {
      return;
    }

    const captureIntentToUse = proofUploadIntentRef.current ?? captureIntent;
    const debugTraceId = createFinanceOcrDebugTraceId();
    let selectedOcrProviderId: string | null = null;
    let assistResult: Awaited<ReturnType<typeof analyzeAttachmentAssistMutation.mutateAsync>> | null = null;
    let assistAnalysisProfile = "document_ocr";
    let assistMetadata: Record<string, unknown> = {};
    setReceiptUploadStatus({
      phase: "reading",
      message: `กำลังอ่าน ${file.name} ก่อนเริ่มประมวลผล...`,
      provider: null,
      fileName: file.name,
    });
    setReceiptUploadPreview(null);
    setReceiptUploadDraftId(null);
    setReceiptUploadDraftVersion(null);
    setReceiptUploadAppliedPresetLabel(null);
    setReceiptUploadPreviewExpanded(false);
    logFinanceOcrClientStep("receipt_upload_start", {
      debugTraceId,
      conversationId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      captureIntent: captureIntentToUse,
    });

    try {
      const fileBase64 = await readFileAsBase64(file);
      setReceiptUploadStatus({
        phase: "ocr",
        message: `กำลังประมวลผล ${file.name} ด้วยตัวแปลงสลิปที่ตั้งค่าไว้...`,
        provider: null,
        fileName: file.name,
      });
      logFinanceOcrClientStep("receipt_upload_base64_ready", {
        debugTraceId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64Length: fileBase64.length,
      });
      const runAttachmentAssist = async (analysisProfile: "document_ocr" | "finance_payin_llm_parser") => {
        logFinanceOcrClientStep(
          "receipt_upload_analyze_start",
          {
            debugTraceId,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            captureIntent: captureIntentToUse,
            analysisProfile,
          },
        );
        const result = await analyzeAttachmentAssistMutation.mutateAsync({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: fileBase64,
          mode: file.type.toLowerCase() === "application/pdf" ? "extract_text" : "document_ocr",
          analysisProfile,
          captureIntent: captureIntentToUse,
          debugTraceId,
        });
        const metadata = result.metadata ?? {};
        const text = (result.ocrText || result.extractedText || "").trim() || null;
        return {
          result,
          metadata,
          text,
          analysisProfile: typeof metadata.analysis_profile === "string" ? metadata.analysis_profile : analysisProfile,
          provider: typeof metadata.ocr_provider === "string" ? metadata.ocr_provider : null,
        };
      };

      let extractedText: string | null = null;
      try {
        const primaryAssist = await runAttachmentAssist("document_ocr");
        assistResult = primaryAssist.result;
        assistMetadata = primaryAssist.metadata;
        extractedText = primaryAssist.text;
        assistAnalysisProfile = primaryAssist.analysisProfile;
        const assistOcrProviderId = primaryAssist.provider;
        selectedOcrProviderId = assistAnalysisProfile === "finance_payin_llm_parser"
          ? "finance_payin_llm_parser"
          : assistOcrProviderId;
        const providerLabel = assistAnalysisProfile === "finance_payin_llm_parser"
          ? "ตัวแปลง LLM"
          : getDocumentOcrProviderLabel(selectedOcrProviderId);
        setReceiptUploadStatus({
          phase: "uploading",
          message: extractedText
            ? `ประมวลผลเสร็จผ่าน ${providerLabel} แล้ว กำลังอัปโหลดไปยังคลังการเงิน...`
            : `ตัวแปลงที่ตั้งค่าผ่าน ${providerLabel} ไม่พบข้อความ กำลังทำงานต่อจากข้อมูลเมตาของสลิปที่อัปโหลด...`,
          provider: selectedOcrProviderId,
          fileName: file.name,
        });
        logFinanceOcrClientStep("receipt_upload_analyze_success", {
          debugTraceId,
          fileName: file.name,
          extractedTextLength: extractedText?.length ?? 0,
          provider: assistOcrProviderId,
          searchQuality: assistResult.searchQuality ?? null,
        });

        if (!extractedText) {
          logFinanceOcrClientStep("receipt_upload_analyze_no_text", {
            debugTraceId,
            fileName: file.name,
            provider: assistOcrProviderId,
            analysisProfile: assistAnalysisProfile,
          });
        }
      } catch (error) {
        logFinanceOcrClientStep("receipt_upload_analyze_failed", {
          debugTraceId,
          fileName: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
        const message = getFinanceErrorMessage(error, "ประมวลผล OCR ใบเสร็จไม่สำเร็จ");
        setReceiptUploadStatus({
          phase: "error",
          message,
          provider: null,
          fileName: file.name,
        });
        throw error instanceof Error ? error : new Error(message);
      }

      const currentAssistResult = assistResult;
      if (!currentAssistResult) {
        throw new Error("OCR analysis did not return a result");
      }

      setReceiptUploadStatus({
        phase: "uploading",
        message: `กำลังอัปโหลด ${file.name} ไปยังคลังการเงิน...`,
        provider: selectedOcrProviderId,
        fileName: file.name,
      });
      logFinanceOcrClientStep("receipt_upload_library_upload_start", {
        debugTraceId,
        fileName: file.name,
        projectId: conversationQuery.data?.projectId ?? null,
        hasExtractedText: Boolean(extractedText),
      });
      const uploadResult = await uploadFileMutation.mutateAsync({
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileBase64,
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        visibility: "private",
        projectId: conversationQuery.data?.projectId ?? undefined,
        metadata: {
          finance_intake: true,
          source: "finance_chat",
          original_file_name: file.name,
          finance_capture_intent: captureIntentToUse,
          analysis_profile: assistAnalysisProfile,
          finance_debug_trace_id: debugTraceId,
          debug_trace_id: debugTraceId,
          ...(extractedText
            ? {
                extracted_text: extractedText,
                ocr_text: extractedText,
              }
            : {}),
          ...(typeof assistMetadata.unified_payin_slip_summary === "string"
            ? { unified_payin_slip_summary: assistMetadata.unified_payin_slip_summary }
            : {}),
          ...(typeof assistMetadata.unified_payin_slip_result === "object"
            ? { unified_payin_slip_result: assistMetadata.unified_payin_slip_result }
            : {}),
        },
      } as any);
      logFinanceOcrClientStep("receipt_upload_library_upload_success", {
        debugTraceId,
        fileName: file.name,
        libraryItemId: (uploadResult as any)?.item?.id ?? (uploadResult as any)?.id ?? null,
      });

      const uploadResultAny = uploadResult as any;
      const uploadedItem = uploadResultAny?.item ?? uploadResultAny;
      const libraryItemId = Number(uploadedItem?.id);
      const sourceUrl = String(uploadedItem?.sourceUrl ?? uploadedItem?.source_url ?? uploadResultAny?.sourceUrl ?? uploadResultAny?.source_url ?? "").trim() || null;
      const sourceFileName = String(uploadedItem?.title ?? file.name).trim() || file.name;
      if (!Number.isFinite(libraryItemId) || libraryItemId <= 0) {
        throw new Error("ผลอัปโหลดไม่มีรหัสรายการในคลังเอกสาร");
      }

      logFinanceOcrClientStep("receipt_upload_ingest_start", {
        debugTraceId,
        fileName: file.name,
        libraryItemId,
        captureIntent: captureIntentToUse,
      });
      setReceiptUploadStatus({
        phase: "drafting",
        message: `กำลังสร้างฉบับร่างจาก ${file.name}...`,
        provider: selectedOcrProviderId,
        fileName: file.name,
      });
      const result = await ingestDocumentMutation.mutateAsync({
        conversationId,
        libraryItemId,
        counterpartyName: draftCounterpartyName.trim() || null,
        captureIntent: captureIntentToUse,
        idempotencyKey: `finance-ocr:${conversationId}:${libraryItemId}`,
        debugTraceId,
      });
      logFinanceOcrClientStep("receipt_upload_ingest_success", {
        debugTraceId,
        fileName: file.name,
        libraryItemId,
        draftId: (result as { draft?: { id?: number | null } | null } | null)?.draft?.id ?? null,
      });
      const draft = (result as { draft?: { id: number; version?: number; type: string; source?: string; status?: string; confidence?: string | number | null; payloadJson: Record<string, unknown> } | null } | null)?.draft;
      if (draft && onMirrorFinanceActivity) {
        const draftPayload = getDraftPayload(draft);
        const counterpartyLabel = getFinanceCounterpartyLabel(
          draft.type as "income" | "expense" | "transfer",
          draftPayload.counterpartyName,
          draftPayload.merchantName,
        );
        try {
          await onMirrorFinanceActivity({
            content: `Receipt OCR created a ${draft.type} draft for ${counterpartyLabel} · occurred ${formatDateTime(draftPayload.occurredAt)}.`,
            artifacts: [
              {
                id: `finance-ocr-${libraryItemId}`,
                type: "table",
                title: "OCR receipt",
                content: [
                  `Receipt: ${file.name}`,
                  `Draft type: ${getTransactionTypeLabel(draft.type)}`,
                  `Amount: ${formatMoneyMinor(draftPayload.amountMinor, draftPayload.currency)}`,
                  `Counterparty: ${counterpartyLabel}`,
                  `Category: ${draftPayload.categoryCode ?? "uncategorized"}`,
                  `Occurred: ${formatDateTime(draftPayload.occurredAt)}`,
                  `Source: OCR receipt`,
                ],
                metadata: {
                  finance: {
                    kind: "receipt",
                    draftId: draft.id,
                    type: draft.type,
                    amountMinor: draftPayload.amountMinor ?? null,
                    currency: draftPayload.currency ?? DEFAULT_CURRENCY,
                    categoryCode: draftPayload.categoryCode ?? "uncategorized",
                    counterpartyName: draftPayload.counterpartyName ?? draftPayload.merchantName ?? null,
                    merchantName: draftPayload.merchantName ?? null,
                    source: draft.source ?? "ocr_document",
                    status: draft.status ?? "draft",
                    confidence: draft.confidence ?? null,
                    projectId: conversationQuery.data?.projectId ?? null,
                    libraryItemId,
                  },
                },
              },
            ],
          });
        } catch {
          // Best-effort mirror to chat; the OCR draft is already persisted.
        }
      }

      if (draft) {
        setReceiptUploadDraftId(draft.id);
        setReceiptUploadDraftVersion(typeof draft.version === "number" ? draft.version : null);
        const draftPayload = getDraftPayload(draft);
        const occurredAtState = getDraftDateTimeInputState(draftPayload.occurredAt ?? new Date().toISOString());
        const nextPaymentKind = draftPayload.paymentMethodKind === "credit_card"
          ? "issuer"
          : draftPayload.paymentMethodKind === "bank_account"
            ? "bank"
            : "other";
        setDraftText((draftPayload.note ?? extractedText ?? "").trim());
        setDraftCategoryHint((draftPayload.categoryCode ?? "").trim());
        setDraftCounterpartyName((draftPayload.counterpartyName ?? draftPayload.merchantName ?? "").trim());
        setDraftTypeHint((draft.type as "income" | "expense" | "transfer") ?? "auto");
        setDraftDate(occurredAtState.date);
        setDraftTime(occurredAtState.time);
        setDraftPaymentSourceLabel((draftPayload.paymentSourceLabel ?? "").trim());
        setDraftPaymentDestinationLabel((draftPayload.paymentDestinationLabel ?? "").trim());
        setDraftPaymentSourceInstitutionName((draftPayload.paymentSourceInstitutionName ?? "").trim());
        setDraftPaymentDestinationInstitutionName((draftPayload.paymentDestinationInstitutionName ?? "").trim());
        setDraftPaymentInstitutionName((
          draftPayload.paymentInstitutionName
          ?? draftPayload.paymentSourceInstitutionName
          ?? draftPayload.paymentDestinationInstitutionName
          ?? ""
        ).trim());
        setDraftPaymentInstitutionKind(nextPaymentKind);
        setDraftPaymentAccountKind((draftPayload.paymentMethodKind ?? "unknown") as typeof draftPaymentAccountKind);
        setDraftPaymentAccountNickname((draftPayload.paymentAccountNickname ?? "").trim());
        setDraftPaymentAccountLast4((draftPayload.paymentAccountLast4 ?? "").trim());
        setDraftPaymentAccountMaskedIdentifier((draftPayload.paymentAccountMaskedIdentifier ?? "").trim());
        setReceiptUploadPreview({
          type: draft.type as "income" | "expense" | "transfer",
          amountMinor: typeof draftPayload.amountMinor === "number" ? draftPayload.amountMinor : null,
          currency: draftPayload.currency ?? DEFAULT_CURRENCY,
          categoryCode: draftPayload.categoryCode ?? null,
          counterpartyName: draftPayload.counterpartyName ?? draftPayload.merchantName ?? null,
          merchantName: draftPayload.merchantName ?? null,
          note: draftPayload.note ?? extractedText ?? null,
          humanReadableSummary: draftPayload.humanReadableSummary ?? null,
          occurredAt: draftPayload.occurredAt ?? null,
          paymentMethodKind: draftPayload.paymentMethodKind ?? null,
          paymentDirection: draftPayload.paymentDirection ?? null,
          paymentSourceLabel: draftPayload.paymentSourceLabel ?? null,
          paymentDestinationLabel: draftPayload.paymentDestinationLabel ?? null,
          paymentSourceName: draftPayload.paymentSourceName ?? null,
          paymentDestinationName: draftPayload.paymentDestinationName ?? null,
          paymentSourceInstitutionName: draftPayload.paymentSourceInstitutionName ?? null,
          paymentDestinationInstitutionName: draftPayload.paymentDestinationInstitutionName ?? null,
          paymentInstitutionName: draftPayload.paymentInstitutionName ?? null,
          paymentAccountNickname: draftPayload.paymentAccountNickname ?? null,
          paymentAccountLast4: draftPayload.paymentAccountLast4 ?? null,
          paymentAccountMaskedIdentifier: draftPayload.paymentAccountMaskedIdentifier ?? null,
          slipReference: draftPayload.slipReference ?? null,
          merchantId: draftPayload.merchantId ?? null,
          paymentFeeMinor: draftPayload.paymentFeeMinor ?? null,
          confidence: typeof draft.confidence === "number" ? draft.confidence : null,
          missingFields: Array.isArray(draftPayload.missingFields)
            ? draftPayload.missingFields.filter((field): field is string => typeof field === "string" && field.trim().length > 0)
            : [],
          evidence: Array.isArray(draftPayload.evidence)
            ? draftPayload.evidence.filter((item): item is FinanceEvidenceItem => Boolean(
              item
              && typeof item.field === "string"
              && typeof item.snippet === "string"
              && item.field.trim().length > 0
              && item.snippet.trim().length > 0,
            ))
            : [],
          sourceUrl: draftPayload.sourceUrl ?? sourceUrl,
          sourceFileName: draftPayload.sourceFileName ?? sourceFileName,
          mimeType: file.type || "application/octet-stream",
        });
      }
      setReceiptUploadStatus({
        phase: "completed",
        message: `ประมวลผล ${file.name} เสร็จแล้ว`,
        provider: selectedOcrProviderId,
        fileName: file.name,
      });
      logFinanceOcrClientStep("receipt_upload_complete", {
        debugTraceId,
        fileName: file.name,
        libraryItemId,
      });
    } catch (error) {
      setReceiptUploadStatus({
        phase: "error",
        message: getFinanceErrorMessage(error, "ประมวลผล OCR ใบเสร็จไม่สำเร็จ"),
        provider: selectedOcrProviderId,
        fileName: file.name,
      });
      logFinanceOcrClientStep("receipt_upload_failed", {
        debugTraceId,
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      proofUploadIntentRef.current = null;
    }
  };

  const openProofUpload = (intent: FinanceCaptureIntent) => {
    setCaptureIntent(intent);
    proofUploadIntentRef.current = intent;
    receiptInputRef.current?.click();
  };

  const summaryCards = financeReady ? [
    {
      label: t("dashboard:finance.summary.todayIncome"),
      value: formatMoneyMinor(dailySummaryQuery.data?.incomeMinor ?? 0),
      icon: ArrowUpRight,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: t("dashboard:finance.summary.todayExpense"),
      value: formatMoneyMinor(dailySummaryQuery.data?.expenseMinor ?? 0),
      icon: ArrowDownRight,
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
    {
      label: t("dashboard:finance.summary.monthBalance"),
      value: formatMoneyMinor(monthlySummaryQuery.data?.balanceMinor ?? 0),
      icon: Wallet,
      color: "text-sky-600",
      bg: "bg-sky-50",
    },
    {
      label: t("dashboard:finance.summary.openDrafts"),
      value: String(draftsQuery.data?.length ?? 0),
      icon: ReceiptText,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ] : [];

  const openDrafts = draftsQuery.data ?? [];
  const recentTransactions = (transactionsQuery.data ?? []) as FinanceTransactionPreviewRecord[];
  const recurringRules = recurringRulesQuery.data ?? [];
  const monthlyTransactions = monthlyTransactionsQuery.data ?? [];
  const receiptUploadPreviewAmount = receiptUploadPreview?.amountMinor !== null && receiptUploadPreview?.amountMinor !== undefined
    ? formatMoneyMinor(receiptUploadPreview.amountMinor, receiptUploadPreview.currency)
    : "—";
  const receiptUploadPreviewIsImage = Boolean(
    receiptUploadPreview?.mimeType
    && receiptUploadPreview.mimeType.toLowerCase().startsWith("image/")
    && receiptUploadPreview.sourceUrl,
  );
  const receiptUploadPreviewIsTransfer = receiptUploadPreview?.type === "transfer";
  const receiptUploadPreviewIsSelfTransfer = Boolean(
    receiptUploadPreviewIsTransfer && (
      (
        normalizePreviewComparisonText(receiptUploadPreview.paymentSourceInstitutionName)
        && normalizePreviewComparisonText(receiptUploadPreview.paymentSourceInstitutionName) === normalizePreviewComparisonText(receiptUploadPreview.paymentDestinationInstitutionName)
      )
      || (
        normalizePreviewComparisonText(receiptUploadPreview.paymentSourceLabel)
        && normalizePreviewComparisonText(receiptUploadPreview.paymentSourceLabel) === normalizePreviewComparisonText(receiptUploadPreview.paymentDestinationLabel)
      )
    ),
  );
  const receiptUploadPreviewTransferSides = receiptUploadPreviewIsTransfer ? [
      {
        title: "ฝั่งผู้โอน",
        labelBank: "ธนาคารผู้โอน",
        labelAccount: "บัญชีผู้โอน",
        labelName: "ชื่อผู้โอน",
        bank: receiptUploadPreview.paymentSourceInstitutionName ?? "—",
        account: receiptUploadPreview.paymentSourceLabel ?? "—",
        partyName: receiptUploadPreview.paymentSourceName ?? null,
        accountName: extractPreviewAccountName(receiptUploadPreview.paymentSourceLabel),
        maskedIdentifier: extractPreviewMaskedIdentifier(receiptUploadPreview.paymentSourceLabel),
        tone: "border border-l-4 border-rose-200 border-l-rose-500 bg-rose-50/90 text-rose-800 shadow-sm",
        badgeTone: "border-rose-200 bg-rose-100 text-rose-800",
        badgeLabel: "เงินออก",
      },
      {
        title: "ฝั่งผู้รับเงิน",
        labelBank: "ธนาคารผู้รับเงิน",
        labelAccount: "บัญชีผู้รับเงิน",
        labelName: "ชื่อผู้รับเงิน",
        bank: receiptUploadPreview.paymentDestinationInstitutionName ?? "—",
        account: receiptUploadPreview.paymentDestinationLabel ?? "—",
        partyName: receiptUploadPreview.paymentDestinationName ?? null,
        accountName: extractPreviewAccountName(receiptUploadPreview.paymentDestinationLabel),
        maskedIdentifier: extractPreviewMaskedIdentifier(receiptUploadPreview.paymentDestinationLabel),
        tone: "border border-l-4 border-emerald-200 border-l-emerald-500 bg-emerald-50/90 text-emerald-800 shadow-sm",
        badgeTone: "border-emerald-200 bg-emerald-100 text-emerald-800",
        badgeLabel: "เงินเข้า",
      },
  ] : [];
  const receiptUploadPreviewTransferSummary = buildTransferSummaryLine(receiptUploadPreviewTransferSides, receiptUploadPreviewIsSelfTransfer);
  const receiptUploadPreviewEvidence = receiptUploadPreview?.evidence ?? [];
  const receiptUploadPreviewMissingFields = receiptUploadPreview?.missingFields ?? [];
  const receiptUploadPreviewEvidenceSummary = buildEvidenceSummaryLine(receiptUploadPreviewEvidence);
  const receiptUploadPreviewCombinedSummary = receiptUploadPreviewTransferSummary
    ? `${receiptUploadPreviewEvidenceSummary} • ${receiptUploadPreviewTransferSummary}`
    : receiptUploadPreviewEvidenceSummary;
  const receiptUploadPreviewReadableSummary = receiptUploadPreview
    ? buildReadableSlipSummary({
      humanReadableSummary: receiptUploadPreview.humanReadableSummary,
      type: receiptUploadPreview.type,
      amountLabel: receiptUploadPreviewAmount,
      currency: receiptUploadPreview.currency,
      counterpartyName: receiptUploadPreview.counterpartyName,
      note: receiptUploadPreview.note,
      occurredAt: receiptUploadPreview.occurredAt,
      paymentSourceInstitutionName: receiptUploadPreview.paymentSourceInstitutionName,
      paymentDestinationInstitutionName: receiptUploadPreview.paymentDestinationInstitutionName,
      paymentSourceLabel: receiptUploadPreview.paymentSourceLabel,
      paymentDestinationLabel: receiptUploadPreview.paymentDestinationLabel,
      paymentSourceName: receiptUploadPreview.paymentSourceName ?? null,
      paymentDestinationName: receiptUploadPreview.paymentDestinationName ?? null,
      paymentInstitutionName: receiptUploadPreview.paymentInstitutionName,
      paymentDirection: receiptUploadPreview.paymentDirection,
      slipReference: receiptUploadPreview.slipReference ?? null,
      merchantId: receiptUploadPreview.merchantId ?? null,
      paymentFeeMinor: receiptUploadPreview.paymentFeeMinor ?? null,
    })
    : null;
  const receiptUploadPreviewKeyFields = receiptUploadPreview ? [
    { label: "ประเภท", value: getTransactionTypeLabel(receiptUploadPreview.type) },
    { label: "จำนวนเงิน", value: receiptUploadPreviewAmount },
    { label: "คู่ค้า/ผู้เกี่ยวข้อง", value: receiptUploadPreview.counterpartyName ?? "—" },
    { label: "หมวดหมู่", value: receiptUploadPreview.categoryCode ?? "—" },
    { label: "วันเวลา", value: formatDateTime(receiptUploadPreview.occurredAt) },
    { label: "เลขอ้างอิงสลิป", value: receiptUploadPreview.slipReference ?? "—" },
    { label: "รหัสร้านค้า", value: receiptUploadPreview.merchantId ?? "—" },
    { label: "ค่าธรรมเนียม", value: receiptUploadPreview.paymentFeeMinor !== null ? formatMoneyMinor(receiptUploadPreview.paymentFeeMinor, receiptUploadPreview.currency) : "—" },
    { label: "ชื่อผู้โอน", value: receiptUploadPreview.paymentSourceName ?? "—" },
    { label: "ชื่อผู้รับเงิน", value: receiptUploadPreview.paymentDestinationName ?? "—" },
    { label: "ธนาคารผู้โอน", value: receiptUploadPreview.paymentSourceInstitutionName ?? "—" },
    { label: "ธนาคารผู้รับเงิน", value: receiptUploadPreview.paymentDestinationInstitutionName ?? "—" },
    { label: "บัญชีผู้โอน", value: receiptUploadPreview.paymentSourceLabel ?? "—" },
    { label: "บัญชีผู้รับเงิน", value: receiptUploadPreview.paymentDestinationLabel ?? "—" },
    { label: "ชื่อย่อบัญชี", value: receiptUploadPreview.paymentAccountNickname ?? "—" },
    { label: "เลขที่ถูกปิดบัง", value: receiptUploadPreview.paymentAccountMaskedIdentifier ?? "—" },
    { label: "ธนาคาร/ผู้ออกหลัก", value: receiptUploadPreview.paymentInstitutionName ?? "—" },
    { label: "ไฟล์ต้นฉบับ", value: receiptUploadPreview.sourceFileName ?? "—" },
  ] : [];
  const receiptUploadPreviewEssentialFieldLabels = receiptUploadPreview?.type === "transfer"
    ? [
        "ประเภท",
        "จำนวนเงิน",
        "วันเวลา",
        "ธนาคารผู้โอน",
        "ธนาคารผู้รับเงิน",
        "ชื่อผู้โอน",
        "ชื่อผู้รับเงิน",
        "บัญชีผู้โอน",
        "บัญชีผู้รับเงิน",
        "ค่าธรรมเนียม",
        "เลขอ้างอิงสลิป",
        "รหัสร้านค้า",
      ]
    : [
        "ประเภท",
        "จำนวนเงิน",
        "คู่ค้า/ผู้เกี่ยวข้อง",
        "วันเวลา",
        "เลขอ้างอิงสลิป",
        "รหัสร้านค้า",
        "ค่าธรรมเนียม",
      ];
  const receiptUploadPreviewEssentialFields = receiptUploadPreviewKeyFields
    .filter((field) => receiptUploadPreviewEssentialFieldLabels.includes(field.label))
    .slice(0, 6);
  const receiptUploadPresetSuggestions = useMemo(() => {
    if (!receiptUploadPreview) {
      return [];
    }

    const ranked = rankFinanceSlipMappingPresets(
      {
        text: [
          receiptUploadPreviewReadableSummary ?? "",
          receiptUploadPreview.humanReadableSummary ?? "",
          receiptUploadPreview.note ?? "",
          draftText,
          receiptUploadPreview.sourceFileName ?? "",
        ].join(" "),
        counterpartyName: receiptUploadPreview.counterpartyName ?? null,
        merchantName: receiptUploadPreview.counterpartyName ?? receiptUploadPreview.paymentDestinationName ?? receiptUploadPreview.paymentSourceName ?? null,
        paymentSourceName: receiptUploadPreview.paymentSourceName ?? null,
        paymentDestinationName: receiptUploadPreview.paymentDestinationName ?? null,
        paymentSourceLabel: receiptUploadPreview.paymentSourceLabel ?? null,
        paymentDestinationLabel: receiptUploadPreview.paymentDestinationLabel ?? null,
        slipReference: receiptUploadPreview.slipReference ?? null,
        merchantId: receiptUploadPreview.merchantId ?? null,
      },
      financeSlipMappingPresets,
    );

    return (ranked.length > 0
      ? ranked
      : financeSlipMappingPresets.map((preset) => ({ preset, score: 0 }))).slice(0, 4);
  }, [
    draftText,
    financeSlipMappingPresets,
    receiptUploadPreview,
    receiptUploadPreviewReadableSummary,
  ]);
  const receiptUploadPrimaryPresetSuggestion = receiptUploadPresetSuggestions[0] ?? null;
  const receiptUploadPresetAlternatives = receiptUploadPresetSuggestions.slice(1, 3);
  const receiptUploadPinnedMerchantPresetSuggestion = useMemo(() => {
    if (!receiptUploadPreview || pinnedMerchantPresets.length === 0) {
      return null;
    }

    return findBestFinancePinnedMerchantPreset(
      {
        text: [
          receiptUploadPreviewReadableSummary ?? "",
          receiptUploadPreview.humanReadableSummary ?? "",
          receiptUploadPreview.note ?? "",
          draftText,
          receiptUploadPreview.sourceFileName ?? "",
        ].join(" "),
        counterpartyName: receiptUploadPreview.counterpartyName ?? null,
        merchantName: receiptUploadPreview.merchantName ?? receiptUploadPreview.counterpartyName ?? receiptUploadPreview.paymentDestinationName ?? receiptUploadPreview.paymentSourceName ?? null,
        paymentSourceName: receiptUploadPreview.paymentSourceName ?? null,
        paymentDestinationName: receiptUploadPreview.paymentDestinationName ?? null,
        paymentSourceLabel: receiptUploadPreview.paymentSourceLabel ?? null,
        paymentDestinationLabel: receiptUploadPreview.paymentDestinationLabel ?? null,
        slipReference: receiptUploadPreview.slipReference ?? null,
        merchantId: receiptUploadPreview.merchantId ?? null,
      },
      pinnedMerchantPresets,
    );
  }, [
    draftText,
    pinnedMerchantPresets,
    receiptUploadPreview,
    receiptUploadPreviewReadableSummary,
  ]);
  const monthlyCategoryBreakdown = useMemo(() => {
    const buckets = new Map<string, {
      categoryCode: string;
      count: number;
      expenseMinor: number;
      incomeMinor: number;
    }>();

    for (const transaction of monthlyTransactions) {
      const categoryCode = transaction.categoryCode || "uncategorized";
      const bucket = buckets.get(categoryCode) ?? {
        categoryCode,
        count: 0,
        expenseMinor: 0,
        incomeMinor: 0,
      };
      bucket.count += 1;
      if (transaction.type === "income") {
        bucket.incomeMinor += transaction.amountMinor;
      } else if (transaction.type === "expense") {
        bucket.expenseMinor += transaction.amountMinor;
      }
      buckets.set(categoryCode, bucket);
    }

    return Array.from(buckets.values())
      .sort((left, right) => (right.expenseMinor + right.incomeMinor) - (left.expenseMinor + left.incomeMinor))
      .slice(0, compact ? 3 : 5);
  }, [compact, monthlyTransactions]);
  const monthlyTransactionTotalMinor = useMemo(
    () => monthlyTransactions.reduce((sum, transaction) => sum + transaction.amountMinor, 0),
    [monthlyTransactions],
  );
  const merchantSuggestions = useMemo<MerchantSuggestion[]>(() => {
    const buckets = new Map<string, {
      displayName: string;
      categoryCounts: Map<string, number>;
      typeCounts: Map<"income" | "expense" | "transfer", number>;
      usageCount: number;
      lastSeenAt: number;
      aliases: Set<string>;
    }>();

    for (const transaction of monthlyTransactions) {
      const displayName = (transaction.merchantName ?? transaction.counterpartyName ?? "").trim();
      if (!displayName) {
        continue;
      }

      const key = normalizePreviewComparisonText(displayName);
      if (!key) {
        continue;
      }

      const bucket = buckets.get(key) ?? {
        displayName,
        categoryCounts: new Map<string, number>(),
        typeCounts: new Map<"income" | "expense" | "transfer", number>(),
        usageCount: 0,
        lastSeenAt: 0,
        aliases: new Set<string>(),
      };
      bucket.displayName = bucket.displayName || displayName;
      bucket.usageCount += 1;
      const time = new Date(transaction.occurredAt ?? transaction.createdAt ?? Date.now()).getTime();
      if (Number.isFinite(time)) {
        bucket.lastSeenAt = Math.max(bucket.lastSeenAt, time);
      }
      const categoryCode = (transaction.categoryCode ?? "").trim();
      if (categoryCode) {
        bucket.categoryCounts.set(categoryCode, (bucket.categoryCounts.get(categoryCode) ?? 0) + 1);
      }
      bucket.typeCounts.set(transaction.type, (bucket.typeCounts.get(transaction.type) ?? 0) + 1);
      if (transaction.counterpartyName?.trim()) {
        bucket.aliases.add(transaction.counterpartyName.trim());
      }
      if (transaction.merchantName?.trim()) {
        bucket.aliases.add(transaction.merchantName.trim());
      }
      buckets.set(key, bucket);
    }

    const toSuggestion = (bucket: {
      displayName: string;
      categoryCounts: Map<string, number>;
      typeCounts: Map<"income" | "expense" | "transfer", number>;
      usageCount: number;
      lastSeenAt: number;
      aliases: Set<string>;
    }): MerchantSuggestion => {
      const categoryEntries = Array.from(bucket.categoryCounts.entries()).sort((left, right) => right[1] - left[1]);
      const typeEntries = Array.from(bucket.typeCounts.entries()).sort((left, right) => right[1] - left[1]);
      const topCategory = categoryEntries[0]?.[0] ?? null;
      const topType = typeEntries[0]?.[0] ?? "expense";
      return {
        displayName: bucket.displayName,
        categoryCode: topCategory,
        type: topType,
        usageCount: bucket.usageCount,
        lastSeenAt: bucket.lastSeenAt > 0 ? new Date(bucket.lastSeenAt).toISOString() : null,
        aliases: Array.from(bucket.aliases).slice(0, 3),
      };
    };

    const sorted = Array.from(buckets.values())
      .map((bucket) => toSuggestion(bucket))
      .sort((left, right) => right.usageCount - left.usageCount || new Date(right.lastSeenAt ?? 0).getTime() - new Date(left.lastSeenAt ?? 0).getTime() || left.displayName.localeCompare(right.displayName));

    const repeated = sorted.filter((item) => item.usageCount >= 2);
    const source = repeated.length > 0 ? repeated : sorted;
    return source.slice(0, compact ? 4 : 6);
  }, [compact, monthlyTransactions]);
  const receiptUploadMerchantPatternSuggestion = useMemo(() => {
    if (!receiptUploadPreview) {
      return null;
    }

    return findFrequentMerchantPatternSuggestion(
      {
        counterpartyName: receiptUploadPreview.counterpartyName,
        merchantName: receiptUploadPreview.merchantName,
        paymentSourceName: receiptUploadPreview.paymentSourceName,
        paymentDestinationName: receiptUploadPreview.paymentDestinationName,
        paymentAccountNickname: receiptUploadPreview.paymentAccountNickname,
      },
      merchantSuggestions,
    );
  }, [
    merchantSuggestions,
    receiptUploadPreview,
  ]);

  const activeDraftIntentLabel = draftTypeHint === "income"
    ? t("dashboard:finance.quick.intent.income", "Income")
    : draftTypeHint === "expense"
      ? t("dashboard:finance.quick.intent.expense", "Expense")
      : draftTypeHint === "transfer"
        ? t("dashboard:finance.quick.intent.transfer", "Transfer")
        : t("dashboard:finance.quick.intent.auto", "Auto intent");

  const dueSoonRecurringRules = useMemo(() => {
    const now = Date.now();
    const soonThreshold = now + 14 * 24 * 60 * 60 * 1000;
    return recurringRules
      .filter((rule) => {
        if (!rule.nextRunAt) {
          return false;
        }
        const nextRunAt = new Date(rule.nextRunAt).getTime();
        return Number.isFinite(nextRunAt) && nextRunAt >= now && nextRunAt <= soonThreshold;
      })
      .sort((left, right) => new Date(left.nextRunAt ?? 0).getTime() - new Date(right.nextRunAt ?? 0).getTime())
      .slice(0, compact ? 2 : 4);
  }, [compact, recurringRules]);

  const evidenceResults = financeEvidenceQuery.data?.searchResults?.results ?? [];
  const linkedDocuments = financeEvidenceQuery.data?.linkedDocuments ?? [];
  const activeEvidenceTransaction = useMemo<FinanceTransactionPreviewRecord | null>(
    () => recentTransactions.find((transaction) => transaction.id === selectedEvidenceTransactionId) ?? recentTransactions[0] ?? null,
    [recentTransactions, selectedEvidenceTransactionId],
  );
  const pendingVoidTransaction = useMemo(() => {
    if (pendingVoidTransactionId === null) {
      return null;
    }
    return recentTransactions.find((transaction) => transaction.id === pendingVoidTransactionId)
      ?? (activeEvidenceTransaction?.id === pendingVoidTransactionId ? activeEvidenceTransaction : null);
  }, [pendingVoidTransactionId, recentTransactions, activeEvidenceTransaction]);
  const pendingVoidReasonTrimmed = pendingVoidReason.trim();
  const isPendingVoidReasonValid = pendingVoidReasonTrimmed.length >= 3;
  const activeEvidenceTransactionDetails = useMemo(() => {
    if (!activeEvidenceTransaction) {
      return null;
    }

    const transaction = activeEvidenceTransaction;
    const amountLabel = formatMoneyMinor(transaction.amountMinor, transaction.currency);
    const sourceAccountLabel = transaction.paymentSourceLabel ?? transaction.paymentSourceName ?? transaction.paymentSourceInstitutionName ?? "—";
    const destinationAccountLabel = transaction.paymentDestinationLabel ?? transaction.paymentDestinationName ?? transaction.paymentDestinationInstitutionName ?? "—";

    return {
      summary: buildLocalizedReadableSlipSummary({
        type: transaction.type,
        amountLabel,
        counterpartyName: transaction.counterpartyName ?? transaction.merchantName ?? null,
        occurredAt: transaction.occurredAt,
        paymentSourceInstitutionName: transaction.paymentSourceInstitutionName ?? null,
        paymentDestinationInstitutionName: transaction.paymentDestinationInstitutionName ?? null,
        paymentSourceLabel: transaction.paymentSourceLabel ?? null,
        paymentDestinationLabel: transaction.paymentDestinationLabel ?? null,
        paymentSourceName: transaction.paymentSourceName ?? null,
        paymentDestinationName: transaction.paymentDestinationName ?? null,
        paymentInstitutionName: transaction.paymentInstitutionName ?? null,
        slipReference: transaction.slipReference ?? null,
        paymentFeeMinor: transaction.paymentFeeMinor ?? null,
        currency: transaction.currency,
      }),
      overviewFields: [
        { label: t("finance.confirmed.fields.type"), value: getLocalizedTransactionTypeLabel(transaction.type) },
        { label: t("finance.confirmed.fields.amount"), value: amountLabel },
        { label: t("finance.confirmed.fields.category"), value: transaction.categoryCode || "—" },
        { label: t("finance.confirmed.fields.counterparty"), value: transaction.counterpartyName ?? transaction.merchantName ?? "—" },
        { label: t("finance.confirmed.fields.status"), value: transaction.status },
        { label: t("finance.confirmed.fields.source"), value: getLocalizedFinanceSourceLabel(transaction.source) },
        { label: t("finance.confirmed.fields.occurredAt"), value: formatDateTime(transaction.occurredAt) },
        { label: t("finance.confirmed.fields.note"), value: transaction.note ?? "—" },
      ],
      routingFields: [
        { label: t("finance.confirmed.fields.paymentDirection"), value: getLocalizedPaymentDirectionLabel(transaction.paymentDirection ?? "unknown") },
        { label: t("finance.confirmed.fields.paymentMethod"), value: transaction.paymentMethodKind ? getLocalizedPaymentInstrumentLabel(transaction.paymentMethodKind) : "—" },
        { label: t("finance.confirmed.fields.sourceBank"), value: transaction.paymentSourceInstitutionName ?? "—" },
        { label: t("finance.confirmed.fields.sourceAccount"), value: sourceAccountLabel },
        { label: t("finance.confirmed.fields.sourceName"), value: transaction.paymentSourceName ?? "—" },
        { label: t("finance.confirmed.fields.destinationBank"), value: transaction.paymentDestinationInstitutionName ?? "—" },
        { label: t("finance.confirmed.fields.destinationAccount"), value: destinationAccountLabel },
        { label: t("finance.confirmed.fields.destinationName"), value: transaction.paymentDestinationName ?? "—" },
        { label: t("finance.confirmed.fields.primaryInstitution"), value: transaction.paymentInstitutionName ?? "—" },
        { label: t("finance.confirmed.fields.accountNickname"), value: transaction.paymentAccountNickname ?? "—" },
        { label: t("finance.confirmed.fields.accountLast4"), value: transaction.paymentAccountLast4 ?? "—" },
        { label: t("finance.confirmed.fields.maskedIdentifier"), value: transaction.paymentAccountMaskedIdentifier ?? "—" },
      ],
      metadataFields: [
        { label: t("finance.confirmed.fields.slipReference"), value: transaction.slipReference ?? "—" },
        { label: t("finance.confirmed.fields.merchantId"), value: transaction.merchantId ?? "—" },
        {
          label: t("finance.confirmed.fields.paymentFee"),
          value: transaction.paymentFeeMinor !== null ? formatMoneyMinor(transaction.paymentFeeMinor, transaction.currency) : "—",
        },
        {
          label: t("finance.confirmed.fields.confidence"),
          value: transaction.paymentInstrumentConfidence != null
            ? `${Math.round(transaction.paymentInstrumentConfidence * 100)}%`
            : "—",
        },
        { label: t("finance.confirmed.fields.sourceFile"), value: transaction.sourceFileName ?? "—" },
      ],
    };
  }, [activeEvidenceTransaction, t]);
  const summaryGridClass = surface === "page"
    ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    : surface === "dashboard"
      ? "grid gap-3 sm:grid-cols-2"
      : "grid gap-3 md:grid-cols-2";
  const sectionsGridClass = surface === "page"
    ? "grid gap-4 xl:grid-cols-3"
    : surface === "dashboard"
      ? "grid gap-4 lg:grid-cols-2"
      : "grid gap-4";

  useEffect(() => {
    if (selectedEvidenceTransactionId === null && recentTransactions.length > 0) {
      setSelectedEvidenceTransactionId(recentTransactions[0].id);
    }
  }, [recentTransactions, selectedEvidenceTransactionId]);

  useEffect(() => {
    const next = getCurrentDraftDateTime();
    setDraftDate(next.date);
    setDraftTime(next.time);
    setDraftText("");
    setDraftCategoryHint("");
    setDraftCounterpartyName("");
    setDraftTypeHint("auto");
    setQuickActionStatus({ kind: "idle", message: null });
    setDraftEditStates({});
    setSelectedEvidenceTransactionId(null);
    setEvidenceSearchText("");
    setReceiptUploadDraftId(null);
    setReceiptUploadDraftVersion(null);
    setReceiptUploadAppliedPresetLabel(null);
    quickActionModeRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    const draftList = draftsQuery.data;
    if (!draftList) {
      return;
    }

    setDraftEditStates((current) => {
      let changed = Object.keys(current).length !== draftList.length;
      const next: Record<number, DraftEditState> = {};

      for (const draft of draftList) {
        const existing = current[draft.id];
        if (existing) {
          next[draft.id] = existing;
          continue;
        }

        const payload = getDraftPayload(draft);
        const nextDateTime = getDraftDateTimeInputState(payload.occurredAt ?? draft.createdAt);
        next[draft.id] = {
          date: nextDateTime.date,
          time: nextDateTime.time,
          counterpartyName: (payload.counterpartyName ?? payload.merchantName ?? "").trim(),
          status: { kind: "idle", message: null },
        };
        changed = true;
      }

      if (!changed) {
        return current;
      }

      return next;
    });
  }, [draftsQuery.data]);

  useEffect(() => {
    if (!receiptUploadPreview) {
      setReceiptUploadPreviewVisible(false);
      setReceiptUploadPreviewContentVisible(false);
      setReceiptUploadOverviewExpanded(false);
      setReceiptUploadPreviewDetailsExpanded(false);
      setReceiptUploadPreviewEvidenceExpanded(false);
      setReceiptUploadDraftId(null);
      setReceiptUploadDraftVersion(null);
      setReceiptUploadAppliedPresetLabel(null);
      setReceiptUploadPresetAlternativesVisible(false);
      return;
    }

    setReceiptUploadPreviewVisible(false);
    setReceiptUploadOverviewExpanded(false);
    setReceiptUploadPreviewDetailsExpanded(false);
    setReceiptUploadPreviewEvidenceExpanded(false);
    setReceiptUploadPresetAlternativesVisible(false);
    const frame = window.requestAnimationFrame(() => {
      setReceiptUploadPreviewVisible(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [receiptUploadPreview]);

  useEffect(() => {
    if (!receiptUploadPreviewExpanded) {
      setReceiptUploadPreviewContentVisible(false);
      return;
    }

    setReceiptUploadPreviewContentVisible(false);
    const frame = window.requestAnimationFrame(() => {
      setReceiptUploadPreviewContentVisible(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [receiptUploadPreviewExpanded]);

  const buildReceiptUploadBaseDraft = (): FinanceStructuredDraft | null => {
    if (!receiptUploadPreview) {
      return null;
    }

    const occurredAt = receiptUploadPreview.occurredAt ?? new Date().toISOString();
    return {
      type: receiptUploadPreview.type,
      amountMinor: Math.max(1, receiptUploadPreview.amountMinor ?? 1),
      currency: receiptUploadPreview.currency || DEFAULT_CURRENCY,
      occurredAt,
      categoryCode: receiptUploadPreview.categoryCode ?? "uncategorized",
      documentRole: captureIntent === "transfer_slip" ? "transfer_slip" : captureIntent === "statement" ? "statement" : "receipt",
      counterpartyName: receiptUploadPreview.counterpartyName,
      merchantName: receiptUploadPreview.paymentDestinationName ?? receiptUploadPreview.paymentSourceName ?? receiptUploadPreview.counterpartyName,
      note: receiptUploadPreview.note,
      humanReadableSummary: receiptUploadPreview.humanReadableSummary,
      evidence: receiptUploadPreview.evidence,
      sourceUrl: receiptUploadPreview.sourceUrl,
      sourceFileName: receiptUploadPreview.sourceFileName,
      slipReference: receiptUploadPreview.slipReference,
      merchantId: receiptUploadPreview.merchantId,
      paymentFeeMinor: receiptUploadPreview.paymentFeeMinor,
      paymentMethodKind: receiptUploadPreview.paymentMethodKind,
      paymentDirection: receiptUploadPreview.paymentDirection,
      paymentSourceAccountId: null,
      paymentDestinationAccountId: null,
      paymentSourceLabel: receiptUploadPreview.paymentSourceLabel,
      paymentDestinationLabel: receiptUploadPreview.paymentDestinationLabel,
      paymentSourceName: receiptUploadPreview.paymentSourceName,
      paymentDestinationName: receiptUploadPreview.paymentDestinationName,
      paymentSourceInstitutionName: receiptUploadPreview.paymentSourceInstitutionName,
      paymentDestinationInstitutionName: receiptUploadPreview.paymentDestinationInstitutionName,
      paymentInstitutionName: receiptUploadPreview.paymentInstitutionName,
      paymentAccountNickname: receiptUploadPreview.paymentAccountNickname,
      paymentAccountLast4: receiptUploadPreview.paymentAccountLast4,
      paymentAccountMaskedIdentifier: receiptUploadPreview.paymentAccountMaskedIdentifier,
      paymentInstrumentConfidence: receiptUploadPreview.confidence,
      confidence: receiptUploadPreview.confidence ?? 0,
      needsClarification: receiptUploadPreview.missingFields.length > 0,
      missingFields: receiptUploadPreview.missingFields,
      sourceMessageId: null,
      sourceLibraryItemId: receiptUploadDraftId,
      recurringRuleId: null,
    } as FinanceStructuredDraft;
  };

  const handleApplyReceiptUploadPreset = async (preset: FinanceSlipMappingPreset) => {
    const baseDraft = buildReceiptUploadBaseDraft();
    if (!baseDraft) {
      return;
    }

    const appliedDraft = applyFinanceSlipMappingPresetToDraft(baseDraft, preset);
    const nextSummary = buildReadableSlipSummary({
      humanReadableSummary: appliedDraft.humanReadableSummary ?? null,
      type: appliedDraft.type,
      amountLabel: formatMoneyMinor(appliedDraft.amountMinor, appliedDraft.currency),
      currency: appliedDraft.currency,
      counterpartyName: appliedDraft.counterpartyName ?? appliedDraft.merchantName ?? null,
      note: appliedDraft.note ?? null,
      occurredAt: appliedDraft.occurredAt,
      paymentSourceInstitutionName: appliedDraft.paymentSourceInstitutionName ?? null,
      paymentDestinationInstitutionName: appliedDraft.paymentDestinationInstitutionName ?? null,
      paymentSourceLabel: appliedDraft.paymentSourceLabel ?? null,
      paymentDestinationLabel: appliedDraft.paymentDestinationLabel ?? null,
      paymentSourceName: appliedDraft.paymentSourceName ?? null,
      paymentDestinationName: appliedDraft.paymentDestinationName ?? null,
      paymentInstitutionName: appliedDraft.paymentInstitutionName,
      paymentDirection: appliedDraft.paymentDirection,
      slipReference: appliedDraft.slipReference ?? null,
      merchantId: appliedDraft.merchantId ?? null,
      paymentFeeMinor: appliedDraft.paymentFeeMinor ?? null,
    });

    const patch = {
      type: appliedDraft.type,
      categoryCode: appliedDraft.categoryCode,
      counterpartyName: appliedDraft.counterpartyName,
      merchantName: appliedDraft.merchantName,
      note: appliedDraft.note,
      humanReadableSummary: nextSummary,
      evidence: appliedDraft.evidence,
    } satisfies Partial<FinanceStructuredDraft>;

    if (receiptUploadDraftId !== null && receiptUploadDraftVersion !== null) {
      const updatedDraft = await updateDraftMutation.mutateAsync({
        conversationId: conversationId ?? 0,
        draftId: receiptUploadDraftId,
        expectedVersion: receiptUploadDraftVersion,
        patch,
      });
      setReceiptUploadDraftVersion(updatedDraft.version ?? receiptUploadDraftVersion);
      const updatedPayload = getDraftPayload(updatedDraft);
      setDraftTypeHint(updatedDraft.type);
      setDraftCategoryHint(updatedPayload.categoryCode ?? "");
      setDraftCounterpartyName((updatedPayload.counterpartyName ?? updatedPayload.merchantName ?? "").trim());
      setDraftText((current) => (updatedPayload.note?.trim() ? updatedPayload.note.trim() : current));
      setDraftPaymentSourceLabel((updatedPayload.paymentSourceLabel ?? "").trim());
      setDraftPaymentDestinationLabel((updatedPayload.paymentDestinationLabel ?? "").trim());
      setDraftPaymentSourceInstitutionName((updatedPayload.paymentSourceInstitutionName ?? "").trim());
      setDraftPaymentDestinationInstitutionName((updatedPayload.paymentDestinationInstitutionName ?? "").trim());
      setDraftPaymentInstitutionName((
        updatedPayload.paymentInstitutionName
        ?? updatedPayload.paymentSourceInstitutionName
        ?? updatedPayload.paymentDestinationInstitutionName
        ?? ""
      ).trim());
      setDraftPaymentInstitutionKind(
        updatedPayload.paymentMethodKind === "credit_card"
          ? "issuer"
          : updatedPayload.paymentMethodKind === "bank_account"
            ? "bank"
            : "other",
      );
      setDraftPaymentAccountKind((updatedPayload.paymentMethodKind ?? "unknown") as typeof draftPaymentAccountKind);
      setDraftPaymentAccountNickname((updatedPayload.paymentAccountNickname ?? "").trim());
      setDraftPaymentAccountLast4((updatedPayload.paymentAccountLast4 ?? "").trim());
      setDraftPaymentAccountMaskedIdentifier((updatedPayload.paymentAccountMaskedIdentifier ?? "").trim());
      const currentPreview = receiptUploadPreview;
      if (!currentPreview) {
        return;
      }
      setReceiptUploadPreview({
        ...currentPreview,
        type: updatedDraft.type,
        categoryCode: updatedPayload.categoryCode ?? currentPreview.categoryCode,
        counterpartyName: updatedPayload.counterpartyName ?? updatedPayload.merchantName ?? currentPreview.counterpartyName,
        merchantName: updatedPayload.merchantName ?? currentPreview.merchantName,
        note: updatedPayload.note ?? currentPreview.note,
        humanReadableSummary: updatedPayload.humanReadableSummary ?? nextSummary,
        evidence: Array.isArray(updatedPayload.evidence)
          ? updatedPayload.evidence.filter((item): item is FinanceEvidenceItem => Boolean(
            item
            && typeof item.field === "string"
            && typeof item.snippet === "string"
            && item.field.trim().length > 0
            && item.snippet.trim().length > 0,
          ))
          : currentPreview.evidence,
        paymentSourceLabel: updatedPayload.paymentSourceLabel ?? currentPreview.paymentSourceLabel,
        paymentDestinationLabel: updatedPayload.paymentDestinationLabel ?? currentPreview.paymentDestinationLabel,
        paymentSourceName: updatedPayload.paymentSourceName ?? currentPreview.paymentSourceName,
        paymentDestinationName: updatedPayload.paymentDestinationName ?? currentPreview.paymentDestinationName,
        paymentSourceInstitutionName: updatedPayload.paymentSourceInstitutionName ?? currentPreview.paymentSourceInstitutionName,
        paymentDestinationInstitutionName: updatedPayload.paymentDestinationInstitutionName ?? currentPreview.paymentDestinationInstitutionName,
        paymentInstitutionName: updatedPayload.paymentInstitutionName ?? currentPreview.paymentInstitutionName,
        paymentAccountNickname: updatedPayload.paymentAccountNickname ?? currentPreview.paymentAccountNickname,
        paymentAccountLast4: updatedPayload.paymentAccountLast4 ?? currentPreview.paymentAccountLast4,
        paymentAccountMaskedIdentifier: updatedPayload.paymentAccountMaskedIdentifier ?? currentPreview.paymentAccountMaskedIdentifier,
      });
    } else {
      setDraftTypeHint(appliedDraft.type);
      setDraftCategoryHint(appliedDraft.categoryCode);
      setDraftCounterpartyName((appliedDraft.counterpartyName ?? appliedDraft.merchantName ?? "").trim());
      setDraftText((current) => (appliedDraft.note?.trim() ? appliedDraft.note.trim() : current));
      setDraftPaymentSourceLabel((appliedDraft.paymentSourceLabel ?? "").trim());
      setDraftPaymentDestinationLabel((appliedDraft.paymentDestinationLabel ?? "").trim());
      setDraftPaymentSourceInstitutionName((appliedDraft.paymentSourceInstitutionName ?? "").trim());
      setDraftPaymentDestinationInstitutionName((appliedDraft.paymentDestinationInstitutionName ?? "").trim());
      setDraftPaymentInstitutionName((
        appliedDraft.paymentInstitutionName
        ?? appliedDraft.paymentSourceInstitutionName
        ?? appliedDraft.paymentDestinationInstitutionName
        ?? ""
      ).trim());
      setDraftPaymentInstitutionKind(
        appliedDraft.paymentMethodKind === "credit_card"
          ? "issuer"
          : appliedDraft.paymentMethodKind === "bank_account"
            ? "bank"
            : "other",
      );
      setDraftPaymentAccountKind((appliedDraft.paymentMethodKind ?? "unknown") as typeof draftPaymentAccountKind);
      setDraftPaymentAccountNickname((appliedDraft.paymentAccountNickname ?? "").trim());
      setDraftPaymentAccountLast4((appliedDraft.paymentAccountLast4 ?? "").trim());
      setDraftPaymentAccountMaskedIdentifier((appliedDraft.paymentAccountMaskedIdentifier ?? "").trim());
      const currentPreview = receiptUploadPreview;
      if (!currentPreview) {
        return;
      }
      setReceiptUploadPreview({
        ...currentPreview,
        type: appliedDraft.type,
        categoryCode: appliedDraft.categoryCode,
        counterpartyName: appliedDraft.counterpartyName ?? appliedDraft.merchantName ?? currentPreview.counterpartyName,
        merchantName: appliedDraft.merchantName ?? currentPreview.merchantName,
        note: appliedDraft.note ?? null,
        humanReadableSummary: nextSummary,
        evidence: appliedDraft.evidence,
      });
    }

    setReceiptUploadAppliedPresetLabel(preset.label);
    setReceiptUploadPresetAlternativesVisible(false);
    toast.success(`ใช้รูปแบบ: ${preset.label}`);
  };

  const handleApplyReceiptUploadPinnedMerchantSuggestion = async () => {
    if (!receiptUploadPinnedMerchantPresetSuggestion) {
      return;
    }

    const baseDraft = buildReceiptUploadBaseDraft();
    if (!baseDraft) {
      return;
    }

    const preset = receiptUploadPinnedMerchantPresetSuggestion;
    const merchantLabel = preset.merchantName?.trim() || preset.label.trim();
    const appliedDraft = applyFinancePinnedMerchantPresetToDraft(baseDraft, preset);
    const nextSummary = buildReadableSlipSummary({
      humanReadableSummary: appliedDraft.humanReadableSummary ?? null,
      type: appliedDraft.type,
      amountLabel: formatMoneyMinor(appliedDraft.amountMinor, appliedDraft.currency),
      currency: appliedDraft.currency,
      counterpartyName: appliedDraft.counterpartyName ?? appliedDraft.merchantName ?? merchantLabel,
      note: appliedDraft.note ?? null,
      occurredAt: appliedDraft.occurredAt,
      paymentSourceInstitutionName: appliedDraft.paymentSourceInstitutionName ?? null,
      paymentDestinationInstitutionName: appliedDraft.paymentDestinationInstitutionName ?? null,
      paymentSourceLabel: appliedDraft.paymentSourceLabel ?? null,
      paymentDestinationLabel: appliedDraft.paymentDestinationLabel ?? null,
      paymentSourceName: appliedDraft.paymentSourceName ?? null,
      paymentDestinationName: appliedDraft.paymentDestinationName ?? null,
      paymentInstitutionName: appliedDraft.paymentInstitutionName,
      paymentDirection: appliedDraft.paymentDirection,
      slipReference: appliedDraft.slipReference ?? null,
      merchantId: appliedDraft.merchantId ?? null,
      paymentFeeMinor: appliedDraft.paymentFeeMinor ?? null,
    });

    const nextEvidence = [
      ...appliedDraft.evidence,
      {
        field: "merchantPinnedPreset",
        value: preset.label,
        snippet: `pinned merchant "${merchantLabel}" matched merchant preset "${preset.label}"`,
        confidence: 0.95,
      },
    ] satisfies FinanceEvidenceItem[];

    const appliedWithSummary: FinanceStructuredDraft = {
      ...appliedDraft,
      humanReadableSummary: nextSummary,
      evidence: nextEvidence,
      counterpartyName: appliedDraft.counterpartyName ?? merchantLabel,
      merchantName: appliedDraft.merchantName ?? merchantLabel,
    };

    const patch = {
      type: appliedWithSummary.type,
      categoryCode: appliedWithSummary.categoryCode,
      counterpartyName: appliedWithSummary.counterpartyName,
      merchantName: appliedWithSummary.merchantName,
      humanReadableSummary: appliedWithSummary.humanReadableSummary,
      evidence: appliedWithSummary.evidence,
    } satisfies Partial<FinanceStructuredDraft>;

    if (receiptUploadDraftId !== null && receiptUploadDraftVersion !== null) {
      const updatedDraft = await updateDraftMutation.mutateAsync({
        conversationId: conversationId ?? 0,
        draftId: receiptUploadDraftId,
        expectedVersion: receiptUploadDraftVersion,
        patch,
      });
      setReceiptUploadDraftVersion(updatedDraft.version ?? receiptUploadDraftVersion);
      const updatedPayload = getDraftPayload(updatedDraft);
      setDraftTypeHint(updatedDraft.type);
      setDraftCategoryHint(updatedPayload.categoryCode ?? "");
      setDraftCounterpartyName((updatedPayload.counterpartyName ?? updatedPayload.merchantName ?? "").trim());
      setDraftText((current) => (updatedPayload.note?.trim() ? updatedPayload.note.trim() : current));
      setDraftPaymentSourceLabel((updatedPayload.paymentSourceLabel ?? "").trim());
      setDraftPaymentDestinationLabel((updatedPayload.paymentDestinationLabel ?? "").trim());
      setDraftPaymentSourceInstitutionName((updatedPayload.paymentSourceInstitutionName ?? "").trim());
      setDraftPaymentDestinationInstitutionName((updatedPayload.paymentDestinationInstitutionName ?? "").trim());
      setDraftPaymentInstitutionName((
        updatedPayload.paymentInstitutionName
        ?? updatedPayload.paymentSourceInstitutionName
        ?? updatedPayload.paymentDestinationInstitutionName
        ?? ""
      ).trim());
      setDraftPaymentInstitutionKind(
        updatedPayload.paymentMethodKind === "credit_card"
          ? "issuer"
          : updatedPayload.paymentMethodKind === "bank_account"
            ? "bank"
            : "other",
      );
      setDraftPaymentAccountKind((updatedPayload.paymentMethodKind ?? "unknown") as typeof draftPaymentAccountKind);
      setDraftPaymentAccountNickname((updatedPayload.paymentAccountNickname ?? "").trim());
      setDraftPaymentAccountLast4((updatedPayload.paymentAccountLast4 ?? "").trim());
      setDraftPaymentAccountMaskedIdentifier((updatedPayload.paymentAccountMaskedIdentifier ?? "").trim());
      const currentPreview = receiptUploadPreview;
      if (!currentPreview) {
        return;
      }
      setReceiptUploadPreview({
        ...currentPreview,
        type: updatedDraft.type,
        categoryCode: updatedPayload.categoryCode ?? currentPreview.categoryCode,
        counterpartyName: updatedPayload.counterpartyName ?? updatedPayload.merchantName ?? currentPreview.counterpartyName,
        merchantName: updatedPayload.merchantName ?? currentPreview.merchantName,
        note: updatedPayload.note ?? currentPreview.note,
        humanReadableSummary: updatedPayload.humanReadableSummary ?? nextSummary,
        evidence: Array.isArray(updatedPayload.evidence)
          ? updatedPayload.evidence.filter((item): item is FinanceEvidenceItem => Boolean(
            item
            && typeof item.field === "string"
            && typeof item.snippet === "string"
            && item.field.trim().length > 0
            && item.snippet.trim().length > 0,
          ))
          : currentPreview.evidence,
        paymentSourceLabel: updatedPayload.paymentSourceLabel ?? currentPreview.paymentSourceLabel,
        paymentDestinationLabel: updatedPayload.paymentDestinationLabel ?? currentPreview.paymentDestinationLabel,
        paymentSourceName: updatedPayload.paymentSourceName ?? currentPreview.paymentSourceName,
        paymentDestinationName: updatedPayload.paymentDestinationName ?? currentPreview.paymentDestinationName,
        paymentSourceInstitutionName: updatedPayload.paymentSourceInstitutionName ?? currentPreview.paymentSourceInstitutionName,
        paymentDestinationInstitutionName: updatedPayload.paymentDestinationInstitutionName ?? currentPreview.paymentDestinationInstitutionName,
        paymentInstitutionName: updatedPayload.paymentInstitutionName ?? currentPreview.paymentInstitutionName,
        paymentAccountNickname: updatedPayload.paymentAccountNickname ?? currentPreview.paymentAccountNickname,
        paymentAccountLast4: updatedPayload.paymentAccountLast4 ?? currentPreview.paymentAccountLast4,
        paymentAccountMaskedIdentifier: updatedPayload.paymentAccountMaskedIdentifier ?? currentPreview.paymentAccountMaskedIdentifier,
      });
    } else {
      setDraftTypeHint(appliedWithSummary.type);
      setDraftCategoryHint(appliedWithSummary.categoryCode);
      setDraftCounterpartyName((appliedWithSummary.counterpartyName ?? appliedWithSummary.merchantName ?? "").trim());
      setDraftText((current) => (appliedWithSummary.note?.trim() ? appliedWithSummary.note.trim() : current));
      setDraftPaymentSourceLabel((appliedWithSummary.paymentSourceLabel ?? "").trim());
      setDraftPaymentDestinationLabel((appliedWithSummary.paymentDestinationLabel ?? "").trim());
      setDraftPaymentSourceInstitutionName((appliedWithSummary.paymentSourceInstitutionName ?? "").trim());
      setDraftPaymentDestinationInstitutionName((appliedWithSummary.paymentDestinationInstitutionName ?? "").trim());
      setDraftPaymentInstitutionName((
        appliedWithSummary.paymentInstitutionName
        ?? appliedWithSummary.paymentSourceInstitutionName
        ?? appliedWithSummary.paymentDestinationInstitutionName
        ?? ""
      ).trim());
      setDraftPaymentInstitutionKind(
        appliedWithSummary.paymentMethodKind === "credit_card"
          ? "issuer"
          : appliedWithSummary.paymentMethodKind === "bank_account"
            ? "bank"
            : "other",
      );
      setDraftPaymentAccountKind((appliedWithSummary.paymentMethodKind ?? "unknown") as typeof draftPaymentAccountKind);
      setDraftPaymentAccountNickname((appliedWithSummary.paymentAccountNickname ?? "").trim());
      setDraftPaymentAccountLast4((appliedWithSummary.paymentAccountLast4 ?? "").trim());
      setDraftPaymentAccountMaskedIdentifier((appliedWithSummary.paymentAccountMaskedIdentifier ?? "").trim());
      const currentPreview = receiptUploadPreview;
      if (!currentPreview) {
        return;
      }
      setReceiptUploadPreview({
        ...currentPreview,
        type: appliedWithSummary.type,
        categoryCode: appliedWithSummary.categoryCode,
        counterpartyName: appliedWithSummary.counterpartyName ?? appliedWithSummary.merchantName ?? currentPreview.counterpartyName,
        merchantName: appliedWithSummary.merchantName ?? currentPreview.merchantName,
        note: appliedWithSummary.note ?? null,
        humanReadableSummary: nextSummary,
        evidence: appliedWithSummary.evidence,
      });
    }

    setReceiptUploadAppliedPresetLabel(preset.label);
    setReceiptUploadPresetAlternativesVisible(false);
    toast.success(`ใช้ร้านค้าปักหมุด: ${preset.label}`);
  };

  const handleApplyReceiptUploadMerchantSuggestion = async () => {
    if (!receiptUploadMerchantPatternSuggestion) {
      return;
    }

    const baseDraft = buildReceiptUploadBaseDraft();
    if (!baseDraft) {
      return;
    }

    const merchant = receiptUploadMerchantPatternSuggestion.merchant;
    const merchantLabel = merchant.displayName.trim();
    const nextSummary = buildReadableSlipSummary({
      humanReadableSummary: null,
      type: baseDraft.type,
      amountLabel: formatMoneyMinor(baseDraft.amountMinor, baseDraft.currency),
      currency: baseDraft.currency,
      counterpartyName: baseDraft.counterpartyName ?? merchantLabel,
      note: baseDraft.note ?? null,
      occurredAt: baseDraft.occurredAt,
      paymentSourceInstitutionName: baseDraft.paymentSourceInstitutionName ?? null,
      paymentDestinationInstitutionName: baseDraft.paymentDestinationInstitutionName ?? null,
      paymentSourceLabel: baseDraft.paymentSourceLabel ?? null,
      paymentDestinationLabel: baseDraft.paymentDestinationLabel ?? null,
      paymentSourceName: baseDraft.paymentSourceName ?? null,
      paymentDestinationName: baseDraft.paymentDestinationName ?? null,
      paymentInstitutionName: baseDraft.paymentInstitutionName,
      paymentDirection: baseDraft.paymentDirection,
      slipReference: baseDraft.slipReference ?? null,
      merchantId: baseDraft.merchantId ?? null,
      paymentFeeMinor: baseDraft.paymentFeeMinor ?? null,
    });

    const appliedDraft: FinanceStructuredDraft = {
      ...baseDraft,
      type: merchant.type,
      categoryCode: merchant.categoryCode ?? baseDraft.categoryCode,
      counterpartyName: baseDraft.counterpartyName ?? merchantLabel,
      merchantName: baseDraft.merchantName ?? merchantLabel,
      humanReadableSummary: nextSummary,
      evidence: [
        ...baseDraft.evidence,
        {
          field: "merchantHistorySuggestion",
          value: merchantLabel,
          snippet: `matched frequent merchant "${merchantLabel}" used ${merchant.usageCount} times`,
          confidence: 0.9,
        },
      ],
    };

    const patch = {
      type: appliedDraft.type,
      categoryCode: appliedDraft.categoryCode,
      counterpartyName: appliedDraft.counterpartyName,
      merchantName: appliedDraft.merchantName,
      humanReadableSummary: appliedDraft.humanReadableSummary,
      evidence: appliedDraft.evidence,
    } satisfies Partial<FinanceStructuredDraft>;

    if (receiptUploadDraftId !== null && receiptUploadDraftVersion !== null) {
      const updatedDraft = await updateDraftMutation.mutateAsync({
        conversationId: conversationId ?? 0,
        draftId: receiptUploadDraftId,
        expectedVersion: receiptUploadDraftVersion,
        patch,
      });
      setReceiptUploadDraftVersion(updatedDraft.version ?? receiptUploadDraftVersion);
      const updatedPayload = getDraftPayload(updatedDraft);
      setDraftTypeHint(updatedDraft.type);
      setDraftCategoryHint(updatedPayload.categoryCode ?? "");
      setDraftCounterpartyName((updatedPayload.counterpartyName ?? updatedPayload.merchantName ?? "").trim());
      setDraftText((current) => (updatedPayload.note?.trim() ? updatedPayload.note.trim() : current));
      setDraftPaymentSourceLabel((updatedPayload.paymentSourceLabel ?? "").trim());
      setDraftPaymentDestinationLabel((updatedPayload.paymentDestinationLabel ?? "").trim());
      setDraftPaymentSourceInstitutionName((updatedPayload.paymentSourceInstitutionName ?? "").trim());
      setDraftPaymentDestinationInstitutionName((updatedPayload.paymentDestinationInstitutionName ?? "").trim());
      setDraftPaymentInstitutionName((
        updatedPayload.paymentInstitutionName
        ?? updatedPayload.paymentSourceInstitutionName
        ?? updatedPayload.paymentDestinationInstitutionName
        ?? ""
      ).trim());
      setDraftPaymentInstitutionKind(
        updatedPayload.paymentMethodKind === "credit_card"
          ? "issuer"
          : updatedPayload.paymentMethodKind === "bank_account"
            ? "bank"
            : "other",
      );
      setDraftPaymentAccountKind((updatedPayload.paymentMethodKind ?? "unknown") as typeof draftPaymentAccountKind);
      setDraftPaymentAccountNickname((updatedPayload.paymentAccountNickname ?? "").trim());
      setDraftPaymentAccountLast4((updatedPayload.paymentAccountLast4 ?? "").trim());
      setDraftPaymentAccountMaskedIdentifier((updatedPayload.paymentAccountMaskedIdentifier ?? "").trim());
      const currentPreview = receiptUploadPreview;
      if (!currentPreview) {
        return;
      }
      setReceiptUploadPreview({
        ...currentPreview,
        type: updatedDraft.type,
        categoryCode: updatedPayload.categoryCode ?? currentPreview.categoryCode,
        counterpartyName: updatedPayload.counterpartyName ?? updatedPayload.merchantName ?? currentPreview.counterpartyName,
        merchantName: updatedPayload.merchantName ?? currentPreview.merchantName,
        note: updatedPayload.note ?? currentPreview.note,
        humanReadableSummary: updatedPayload.humanReadableSummary ?? nextSummary,
        evidence: Array.isArray(updatedPayload.evidence)
          ? updatedPayload.evidence.filter((item): item is FinanceEvidenceItem => Boolean(
            item
            && typeof item.field === "string"
            && typeof item.snippet === "string"
            && item.field.trim().length > 0
            && item.snippet.trim().length > 0,
          ))
          : currentPreview.evidence,
        paymentSourceLabel: updatedPayload.paymentSourceLabel ?? currentPreview.paymentSourceLabel,
        paymentDestinationLabel: updatedPayload.paymentDestinationLabel ?? currentPreview.paymentDestinationLabel,
        paymentSourceName: updatedPayload.paymentSourceName ?? currentPreview.paymentSourceName,
        paymentDestinationName: updatedPayload.paymentDestinationName ?? currentPreview.paymentDestinationName,
        paymentSourceInstitutionName: updatedPayload.paymentSourceInstitutionName ?? currentPreview.paymentSourceInstitutionName,
        paymentDestinationInstitutionName: updatedPayload.paymentDestinationInstitutionName ?? currentPreview.paymentDestinationInstitutionName,
        paymentInstitutionName: updatedPayload.paymentInstitutionName ?? currentPreview.paymentInstitutionName,
        paymentAccountNickname: updatedPayload.paymentAccountNickname ?? currentPreview.paymentAccountNickname,
        paymentAccountLast4: updatedPayload.paymentAccountLast4 ?? currentPreview.paymentAccountLast4,
        paymentAccountMaskedIdentifier: updatedPayload.paymentAccountMaskedIdentifier ?? currentPreview.paymentAccountMaskedIdentifier,
      });
    } else {
      setDraftTypeHint(appliedDraft.type);
      setDraftCategoryHint(appliedDraft.categoryCode);
      setDraftCounterpartyName((appliedDraft.counterpartyName ?? appliedDraft.merchantName ?? "").trim());
      setDraftText((current) => (appliedDraft.note?.trim() ? appliedDraft.note.trim() : current));
      setDraftPaymentSourceLabel((appliedDraft.paymentSourceLabel ?? "").trim());
      setDraftPaymentDestinationLabel((appliedDraft.paymentDestinationLabel ?? "").trim());
      setDraftPaymentSourceInstitutionName((appliedDraft.paymentSourceInstitutionName ?? "").trim());
      setDraftPaymentDestinationInstitutionName((appliedDraft.paymentDestinationInstitutionName ?? "").trim());
      setDraftPaymentInstitutionName((
        appliedDraft.paymentInstitutionName
        ?? appliedDraft.paymentSourceInstitutionName
        ?? appliedDraft.paymentDestinationInstitutionName
        ?? ""
      ).trim());
      setDraftPaymentInstitutionKind(
        appliedDraft.paymentMethodKind === "credit_card"
          ? "issuer"
          : appliedDraft.paymentMethodKind === "bank_account"
            ? "bank"
            : "other",
      );
      setDraftPaymentAccountKind((appliedDraft.paymentMethodKind ?? "unknown") as typeof draftPaymentAccountKind);
      setDraftPaymentAccountNickname((appliedDraft.paymentAccountNickname ?? "").trim());
      setDraftPaymentAccountLast4((appliedDraft.paymentAccountLast4 ?? "").trim());
      setDraftPaymentAccountMaskedIdentifier((appliedDraft.paymentAccountMaskedIdentifier ?? "").trim());
      const currentPreview = receiptUploadPreview;
      if (!currentPreview) {
        return;
      }
      setReceiptUploadPreview({
        ...currentPreview,
        type: appliedDraft.type,
        categoryCode: appliedDraft.categoryCode,
        counterpartyName: appliedDraft.counterpartyName ?? appliedDraft.merchantName ?? currentPreview.counterpartyName,
        merchantName: appliedDraft.merchantName ?? currentPreview.merchantName,
        note: appliedDraft.note ?? null,
        humanReadableSummary: nextSummary,
        evidence: appliedDraft.evidence,
      });
    }

    setReceiptUploadAppliedPresetLabel(merchantLabel);
    setReceiptUploadPresetAlternativesVisible(false);
    toast.success(`Applied merchant pattern: ${merchantLabel}`);
  };

  const lockedState = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
        <p className="text-sm font-semibold text-slate-900">
          {t("dashboard:finance.locked.title")}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {t("dashboard:finance.locked.description")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onCreatePersonalChat ? (
          <Button
            className="gap-2"
            onClick={() => void onCreatePersonalChat()}
          >
            <Sparkles className="h-4 w-4" />
            {t("dashboard:finance.locked.createPersonal")}
          </Button>
        ) : null}
        {onOpenFinancePanel ? (
          <Button
            variant="outline"
            className="gap-2"
            onClick={onOpenFinancePanel}
          >
            <ReceiptText className="h-4 w-4" />
            {t("dashboard:finance.locked.openPanel")}
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-4", surface === "page" ? "rounded-[32px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl" : "", className)}>
      <DashboardCard
        eyebrow={t("dashboard:finance.eyebrow")}
        title={t("dashboard:finance.title")}
        description={t("dashboard:finance.description")}
        trailing={onOpenFinancePanel ? (
          <Button variant="outline" size="sm" className="gap-2" onClick={onOpenFinancePanel}>
            <ReceiptText className="h-4 w-4" />
            {t("dashboard:finance.openPanel")}
          </Button>
        ) : null}
      >
        {financeReady ? (
          <div className="space-y-4">
            <div className={summaryGridClass}>
              {summaryCards.map((card) => (
                <DashboardKpiCard
                  key={card.label}
                  icon={card.icon}
                  label={card.label}
                  value={card.value}
                  iconClassName={card.color}
                  iconContainerClassName={card.bg}
                />
              ))}
            </div>

            {!compact ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-900">
                  {t("dashboard:finance.quick.title")}
                </p>
                </div>
                <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
                  {t("dashboard:finance.quick.description")}
                </p>
                <div className="mt-4 space-y-3">
                  <Textarea
                    ref={draftTextareaRef}
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder={t("dashboard:finance.quick.textPlaceholder")}
                    className="min-h-[118px] bg-white"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={draftCategoryHint}
                      onChange={(event) => setDraftCategoryHint(event.target.value)}
                      placeholder={t(
                        "dashboard:finance.quick.categoryPlaceholder",
                        "คำใบ้หมวดหมู่ เช่น taxi / coffee / rent",
                      )}
                      className="bg-white"
                    />
                    <FinanceCounterpartyAutocomplete
                      value={draftCounterpartyName}
                      placeholder={t(
                        "dashboard:finance.quick.counterpartyPlaceholder",
                        "คู่ค้า / ผู้รับ / ผู้จ่าย เช่น Starbucks หรือ ACME",
                      )}
                      onValueChange={setDraftCounterpartyName}
                      items={counterpartiesQuery.data ?? []}
                      helperText={t(
                        "dashboard:finance.quick.counterpartyHelper",
                        "เลือกชื่อมาตรฐานจากรายการเพื่อเลี่ยงการสะกดซ้ำในอนาคต",
                      )}
                      className="bg-white"
                      inputClassName="bg-white"
                    />
                  </div>
                  {merchantSuggestions.length > 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            ร้านค้าที่ใช้บ่อยและหมวดหมู่ที่แนะนำ
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            เลือกร้านค้าที่ใช้บ่อยเพื่อใช้หมวดหมู่และประเภทรายการที่น่าจะถูกที่สุด
                          </p>
                        </div>
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                          {merchantSuggestions.length}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {merchantSuggestions.map((suggestion) => (
                          <Button
                            key={`${suggestion.displayName}-${suggestion.categoryCode ?? "uncategorized"}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-auto max-w-full flex-col items-start gap-1 rounded-2xl px-3 py-2 text-left"
                            onClick={() => {
                              setDraftCounterpartyName(suggestion.displayName);
                              if (suggestion.categoryCode) {
                                setDraftCategoryHint(suggestion.categoryCode);
                              }
                              if (suggestion.type !== "transfer") {
                                setDraftTypeHint(suggestion.type);
                              }
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {suggestion.displayName}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "border-slate-200 bg-slate-50 text-slate-600",
                                  suggestion.type === "expense"
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : suggestion.type === "income"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-sky-200 bg-sky-50 text-sky-700",
                                )}
                              >
                                {getTransactionTypeLabel(suggestion.type)}
                              </Badge>
                            </span>
                            <span className="text-xs text-slate-500">
                              {suggestion.categoryCode ?? "uncategorized"} · used {suggestion.usageCount} {suggestion.usageCount === 1 ? "time" : "times"}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={draftTypeHint}
                      onValueChange={(value) => setDraftTypeHint(value as typeof draftTypeHint)}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder={t("dashboard:finance.quick.intentLabel", "ประเภท")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t("dashboard:finance.quick.intent.auto", "Auto intent")}</SelectItem>
                        <SelectItem value="income">{t("dashboard:finance.quick.intent.income", "Income")}</SelectItem>
                        <SelectItem value="expense">{t("dashboard:finance.quick.intent.expense", "Expense")}</SelectItem>
                        <SelectItem value="transfer">{t("dashboard:finance.quick.intent.transfer", "Transfer")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    {t(
                      "dashboard:finance.quick.categoryHelper",
                      "If the category is unclear, type your own label here and the parser will still infer whether the message is income, expense, or transfer."
                    )}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {t("dashboard:finance.quick.dateLabel", "Date")}
                      </span>
                      <Input
                        aria-label={t("dashboard:finance.quick.dateLabel", "Date")}
                        type="date"
                        value={draftDate}
                        onChange={(event) => setDraftDate(event.target.value)}
                        className="bg-white"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {t("dashboard:finance.quick.timeLabel", "Time")}
                      </span>
                      <Input
                        aria-label={t("dashboard:finance.quick.timeLabel", "Time")}
                        type="time"
                        value={draftTime}
                        onChange={(event) => setDraftTime(event.target.value)}
                        className="bg-white"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs leading-5 text-slate-500">
                      {t(
                        "dashboard:finance.quick.datetimeHelper",
                        "Defaults to the current date and time. OCR receipts use the receipt date and default to 00:00 when time is missing.",
                      )}
                    </p>
                    <Button type="button" variant="ghost" size="sm" className="gap-2 text-slate-600" onClick={handleResetDraftDateTime}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("dashboard:finance.quick.now", "Now")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-500" aria-live="polite">
                    <Badge
                      variant={draftTypeHint === "auto" ? "outline" : "secondary"}
                      className={cn(
                        "rounded-full px-3 py-1",
                        draftTypeHint === "expense"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : draftTypeHint === "income"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : draftTypeHint === "transfer"
                              ? "border-sky-200 bg-sky-50 text-sky-700"
                              : "border-slate-200 bg-white text-slate-600",
                      )}
                    >
                      {t("dashboard:finance.quick.intentLabel", "ประเภท")}: {activeDraftIntentLabel}
                    </Badge>
                    <span>
                      {draftTypeHint === "auto"
                        ? t(
                          "dashboard:finance.quick.intentHelperAuto",
                          "Pick expense or income to lock the parser to that intent."
                        )
                        : t(
                          "dashboard:finance.quick.intentHelperLocked",
                          "The selected intent will be used when you click Parse Text."
                        )}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={draftTypeHint === "expense" ? "default" : "secondary"}
                      className="gap-2"
                      aria-pressed={draftTypeHint === "expense"}
                      onClick={() => void handleQuickDraftAction("expense")}
                    >
                      <ArrowDownRight className="h-4 w-4" />
                      {t("dashboard:finance.quick.addExpense")}
                    </Button>
                    <Button
                      type="button"
                      variant={draftTypeHint === "income" ? "default" : "secondary"}
                      className="gap-2"
                      aria-pressed={draftTypeHint === "income"}
                      onClick={() => void handleQuickDraftAction("income")}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      {t("dashboard:finance.quick.addIncome")}
                    </Button>
                    <Button
                      type="button"
                      className="gap-2"
                      onClick={() => {
                        quickActionModeRef.current = "manual";
                        void handleParseText();
                      }}
                      disabled={!draftText.trim() || parseTextMutation.isPending}
                    >
                      {parseTextMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {t("dashboard:finance.quick.parseText")}
                    </Button>
                    <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {t("dashboard:finance.quick.uploadTitle", "อัปโหลดหลักฐาน")}
                          </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {t(
                            "dashboard:finance.quick.uploadDescription",
                              "ใช้ใบเสร็จ สลิปโอนเงิน หรือสเตทเมนต์ รูปภาพจะถูกประมวลผลด้วยตัวแปลงสลิปที่ตั้งค่าไว้ก่อนสร้างฉบับร่าง",
                          )}
                        </p>
                        </div>
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                          {getCaptureIntentLabel(captureIntent)}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <Button
                          type="button"
                          variant={captureIntent === "receipt" ? "default" : "outline"}
                          className="justify-start gap-2"
                          onClick={() => openProofUpload("receipt")}
                          disabled={uploadFileMutation.isPending || ingestDocumentMutation.isPending || isReceiptUploadBusy}
                        >
                          {uploadFileMutation.isPending || ingestDocumentMutation.isPending || isReceiptUploadBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ReceiptText className="h-4 w-4" />
                          )}
                          {t("dashboard:finance.quick.upload", "อัปโหลดใบเสร็จ")}
                        </Button>
                        <Button
                          type="button"
                          variant={captureIntent === "transfer_slip" ? "default" : "outline"}
                          className="justify-start gap-2"
                          onClick={() => openProofUpload("transfer_slip")}
                          disabled={uploadFileMutation.isPending || ingestDocumentMutation.isPending || isReceiptUploadBusy}
                        >
                          {uploadFileMutation.isPending || ingestDocumentMutation.isPending || isReceiptUploadBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          {t("dashboard:finance.quick.uploadSlip", "อัปโหลดสลิปโอนเงิน")}
                        </Button>
                        <Button
                          type="button"
                          variant={captureIntent === "statement" ? "default" : "outline"}
                          className="justify-start gap-2"
                          onClick={() => openProofUpload("statement")}
                          disabled={uploadFileMutation.isPending || ingestDocumentMutation.isPending || isReceiptUploadBusy}
                        >
                          {uploadFileMutation.isPending || ingestDocumentMutation.isPending || isReceiptUploadBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          {t("dashboard:finance.quick.uploadStatement", "อัปโหลดสเตทเมนต์")}
                        </Button>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {t(
                          "dashboard:finance.quick.uploadHelper",
                          "การอัปโหลดใบเสร็จ สลิปโอนเงิน และสเตทเมนต์จะผ่านตัวแปลงที่ตั้งค่าไว้โดยอัตโนมัติ เพื่อเชื่อมข้อความที่แยกได้กลับไปยังรายการธุรกรรม",
                        )}
                      </p>
                      {receiptUploadStatus.phase !== "idle" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-600" aria-live="polite">
                          <Badge
                            variant={receiptUploadStatus.phase === "error" ? "destructive" : receiptUploadStatus.phase === "completed" ? "default" : "secondary"}
                            className={cn(
                              "rounded-full px-3 py-1",
                              receiptUploadStatus.phase === "completed"
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                : receiptUploadStatus.phase === "error"
                                  ? "bg-rose-50 text-rose-700 hover:bg-rose-50"
                                  : "bg-sky-50 text-sky-700 hover:bg-sky-50",
                            )}
                          >
                            {receiptUploadStatus.phase === "reading"
                              ? "กำลังอ่าน"
                              : receiptUploadStatus.phase === "ocr"
                                ? "กำลังประมวลผล"
                                : receiptUploadStatus.phase === "uploading"
                                  ? "กำลังอัปโหลด"
                                  : receiptUploadStatus.phase === "drafting"
                                    ? "กำลังสร้างฉบับร่าง"
                                    : receiptUploadStatus.phase === "completed"
                                      ? "เสร็จแล้ว"
                                      : "เกิดข้อผิดพลาด"}
                          </Badge>
                          <span>{receiptUploadStatus.message}</span>
                          {receiptUploadStatus.provider ? (
                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                              {getFinanceOcrProviderLabel(receiptUploadStatus.provider)}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                      {receiptUploadPreview ? (
                        <div
                          className={cn(
                            "mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out will-change-transform motion-reduce:transition-none",
                            receiptUploadPreviewVisible
                              ? "translate-y-0 scale-100 opacity-100"
                              : "translate-y-2 scale-[0.985] opacity-0",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                ตัวอย่างจาก OCR
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                <span className="sm:hidden">ดูข้อมูลที่แยกแล้วก่อนยืนยัน</span>
                                <span className="hidden sm:inline">Parser จะเติมข้อมูลเหล่านี้ก่อนยืนยันฉบับร่าง โดยจะแยกฝั่งผู้โอนและผู้รับเงินไว้ชัดเจน รวมถึงกรณีโอนระหว่างบัญชีของตัวเอง</span>
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                                {receiptUploadPreview.paymentDirection === "both"
                                  ? "สลิปโอนเงิน"
                                  : receiptUploadPreview.paymentDirection === "inbound"
                                    ? "รับเข้า"
                                    : receiptUploadPreview.paymentDirection === "outbound"
                                      ? "จ่ายออก"
                                      : "รายการเงิน"}
                              </Badge>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-2 rounded-full"
                                onClick={() => setReceiptUploadPreviewExpanded((current) => !current)}
                              >
                                {receiptUploadPreviewExpanded ? "ย่อการแสดงผล" : "ขยายดูเพิ่มเติม"}
                              </Button>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-500">
                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                              {receiptUploadPreview.sourceFileName ?? "ไฟล์ต้นฉบับ"}
                            </Badge>
                            {receiptUploadPreview.sourceUrl ? (
                              <a
                                href={receiptUploadPreview.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-sky-700 underline-offset-4 hover:underline"
                              >
                                เปิดไฟล์ต้นฉบับ
                              </a>
                            ) : (
                              <span>ไม่มีลิงก์ต้นฉบับ</span>
                            )}
                          </div>
                          <div className="mt-4">
                            <FinanceSemanticDuplicateWarningCard
                              conversationId={conversationId}
                              draftId={receiptUploadDraftId}
                            />
                          </div>
                          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  สรุปจาก AI และฟิลด์สำคัญ
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  <span className="sm:hidden">เปิดเพื่อดูสรุปและฟิลด์ที่บันทึก</span>
                                  <span className="hidden sm:inline">แสดงสรุปสั้นก่อน แล้วค่อยขยายเพื่อดูฟิลด์ที่แยกได้ทั้งหมดและหลักฐานประกอบ</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                                  {receiptUploadPreview.confidence !== null
                                    ? `ความมั่นใจ ${Math.round(receiptUploadPreview.confidence * 100)}%`
                                    : "ยังไม่มีคะแนนความมั่นใจ"}
                                </Badge>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-2 rounded-full"
                                  onClick={() => setReceiptUploadOverviewExpanded((current) => !current)}
                                >
                                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", receiptUploadOverviewExpanded ? "rotate-180" : "")} />
                                  {receiptUploadOverviewExpanded ? "ซ่อนรายละเอียด" : "แสดงรายละเอียด"}
                                </Button>
                              </div>
                            </div>
                            <div className="mt-4 rounded-2xl border border-sky-200 bg-white/90 p-4 shadow-sm">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    ฟิลด์หลัก
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-slate-500">
                                    ฟิลด์ที่มักต้องใช้ทันที ก่อนเปิดดูรายละเอียดฉบับเต็ม
                                  </p>
                                </div>
                                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                                  {receiptUploadPreviewEssentialFields.length} ฟิลด์
                                </Badge>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {receiptUploadPreviewEssentialFields.map((field, index) => (
                                  <div
                                    key={`${field.label}-${index}`}
                                    className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs leading-5 shadow-sm"
                                  >
                                    <p className="font-semibold uppercase tracking-[0.16em] text-slate-500">
                                      {field.label}
                                    </p>
                                    <p className="mt-1 break-words text-sm text-slate-900">
                                      {field.value}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {receiptUploadPinnedMerchantPresetSuggestion ? (
                              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  ร้านค้าปักหมุด
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  แอดมินปักหมุดร้านค้านี้ไว้ จึงขึ้นก่อนคำแนะนำทั่วไป
                                </p>
                              </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {receiptUploadAppliedPresetLabel ? (
                                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                                        ใช้แล้ว: {receiptUploadAppliedPresetLabel}
                                      </Badge>
                                    ) : null}
                                    <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                                      ร้านค้าปักหมุด
                                    </Badge>
                                    {receiptUploadPresetAlternatives.length > 0 ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 rounded-full px-3 text-sky-800 hover:bg-sky-100"
                                        onClick={() => setReceiptUploadPresetAlternativesVisible((current) => !current)}
                                      >
                                        {receiptUploadPresetAlternativesVisible
                                          ? "ซ่อนตัวเลือกเพิ่มเติม"
                                          : `ตัวเลือกเพิ่มเติม (${receiptUploadPresetAlternatives.length})`}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="mt-3 rounded-2xl border border-sky-200 bg-white p-3 shadow-sm">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {receiptUploadPinnedMerchantPresetSuggestion.merchantName?.trim()
                                          || receiptUploadPinnedMerchantPresetSuggestion.label}
                                      </p>
                                      <p className="mt-1 text-xs leading-5 text-slate-500">
                                        {receiptUploadPinnedMerchantPresetSuggestion.note?.trim()
                                          || "ใช้การจับคู่ที่ปักหมุดนี้ก่อนรูปแบบทั่วไป"}
                                      </p>
                                    </div>
                                    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                                      {receiptUploadPinnedMerchantPresetSuggestion.categoryCode ?? "uncategorized"}
                                    </Badge>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-3 h-auto w-full justify-between rounded-2xl border-sky-200 bg-white px-4 py-3 text-left text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                                  onClick={() => { void handleApplyReceiptUploadPinnedMerchantSuggestion(); }}
                                  >
                                    <span className="flex flex-col items-start gap-1">
                                      <span className="text-sm font-semibold text-slate-900">
                                        ใช้ {receiptUploadPinnedMerchantPresetSuggestion.merchantName?.trim()
                                          || receiptUploadPinnedMerchantPresetSuggestion.label}
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        เติมฉบับร่างด้วยการจับคู่ร้านค้าที่แอดมินปักหมุด
                                      </span>
                                    </span>
                                    <ChevronDown className="h-4 w-4 -rotate-90 text-sky-700" />
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                            {!receiptUploadPinnedMerchantPresetSuggestion && receiptUploadMerchantPatternSuggestion ? (
                              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      ร้านค้าที่เคยใช้บ่อย
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      ร้านค้านี้ปรากฏบ่อยในประวัติ จึงนำรูปแบบเดิมมาใช้ได้ทันที
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {receiptUploadAppliedPresetLabel ? (
                                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                        ใช้แล้ว: {receiptUploadAppliedPresetLabel}
                                      </Badge>
                                    ) : null}
                                    <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                                      ใช้ไปแล้ว {receiptUploadMerchantPatternSuggestion.merchant.usageCount} ครั้ง
                                    </Badge>
                                    {receiptUploadPresetAlternatives.length > 0 ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 rounded-full px-3 text-emerald-800 hover:bg-emerald-100"
                                        onClick={() => setReceiptUploadPresetAlternativesVisible((current) => !current)}
                                      >
                                        {receiptUploadPresetAlternativesVisible
                                          ? "ซ่อนตัวเลือกเพิ่มเติม"
                                          : `ตัวเลือกเพิ่มเติม (${receiptUploadPresetAlternatives.length})`}
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="mt-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {receiptUploadMerchantPatternSuggestion.merchant.displayName}
                                      </p>
                                      <p className="mt-1 text-xs leading-5 text-slate-500">
                                        {receiptUploadMerchantPatternSuggestion.merchant.type === "expense"
                                          ? "ใช้รูปแบบรายจ่ายล่าสุดของร้านค้านี้"
                                          : receiptUploadMerchantPatternSuggestion.merchant.type === "income"
                                            ? "ใช้รูปแบบรายได้ล่าสุดของร้านค้านี้"
                                            : "ใช้รูปแบบการโอนล่าสุดของร้านค้านี้"}
                                      </p>
                                    </div>
                                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                      {receiptUploadMerchantPatternSuggestion.merchant.categoryCode ?? "uncategorized"}
                                    </Badge>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="mt-3 h-auto w-full justify-between rounded-2xl border-emerald-200 bg-white px-4 py-3 text-left text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                                    onClick={() => { void handleApplyReceiptUploadMerchantSuggestion(); }}
                                  >
                                    <span className="flex flex-col items-start gap-1">
                                      <span className="text-sm font-semibold text-slate-900">
                                        ใช้ {receiptUploadMerchantPatternSuggestion.merchant.displayName}
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        เติมฉบับร่างด้วยรูปแบบร้านค้าจากประวัติของคุณ
                                      </span>
                                    </span>
                                    <ChevronDown className="h-4 w-4 -rotate-90 text-emerald-700" />
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                            {(!receiptUploadMerchantPatternSuggestion || receiptUploadPresetAlternativesVisible) ? (
                              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      รูปแบบที่แนะนำ
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      แสดงตัวเลือกที่ตรงที่สุดก่อน เพื่อให้เลือกได้เร็ว ตัวเลือกอื่นจะซ่อนไว้จนกว่าจะต้องใช้
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {receiptUploadAppliedPresetLabel ? (
                                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                        ใช้แล้ว: {receiptUploadAppliedPresetLabel}
                                      </Badge>
                                    ) : null}
                                    <Badge variant="outline" className="border-amber-200 bg-white text-amber-700">
                                      {receiptUploadPrimaryPresetSuggestion ? "แนะนำ" : "ไม่ตรง"}
                                    </Badge>
                                  </div>
                                </div>
                                {receiptUploadPrimaryPresetSuggestion ? (
                                  <div className="mt-3 rounded-2xl border border-amber-200 bg-white p-3 shadow-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                      {receiptUploadPrimaryPresetSuggestion.score > 0 ? "ตรงที่สุด" : "รูปแบบที่พบบ่อย"}
                                        </p>
                                        <p className="mt-1 text-xs leading-5 text-slate-500">
                                          {receiptUploadPrimaryPresetSuggestion.score > 0
                                            ? "นี่คือรูปแบบที่ใกล้เคียงที่สุดจากข้อความในสลิปและฟิลด์ปัจจุบัน"
                                            : "ไม่พบตัวตรงเป๊ะ จึงแสดงรูปแบบที่ใช้งานบ่อยและมีประโยชน์ก่อน"}
                                        </p>
                                      </div>
                                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                        {receiptUploadPrimaryPresetSuggestion.preset.transactionType}
                                      </Badge>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="mt-3 h-auto w-full justify-between rounded-2xl border-amber-200 bg-white px-4 py-3 text-left text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                                      onClick={() => { void handleApplyReceiptUploadPreset(receiptUploadPrimaryPresetSuggestion.preset); }}
                                    >
                                      <span className="flex flex-col items-start gap-1">
                                        <span className="text-sm font-semibold text-slate-900">
                                          ใช้ {receiptUploadPrimaryPresetSuggestion.preset.label}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          กดครั้งเดียวแล้วเติมฉบับร่างด้วยการจับคู่ที่น่าจะใช่ที่สุด
                                        </span>
                                      </span>
                                      <ChevronDown className="h-4 w-4 -rotate-90 text-amber-700" />
                                    </Button>
                                  </div>
                                ) : null}
                                {receiptUploadPresetAlternativesVisible && receiptUploadPresetAlternatives.length > 0 ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {receiptUploadPresetAlternatives.map(({ preset, score }) => (
                                      <Button
                                        key={preset.id}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                          "h-auto rounded-full border-amber-200 bg-white px-3 py-2 text-left text-slate-700 hover:border-amber-300 hover:bg-amber-50",
                                          score > 0 ? "ring-1 ring-amber-200" : "",
                                        )}
                                        onClick={() => { void handleApplyReceiptUploadPreset(preset); }}
                                      >
                                        <span className="flex items-center gap-2">
                                          <span className="font-semibold text-slate-900">ใช้ {preset.label}</span>
                                          <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                            {preset.transactionType}
                                          </span>
                                        </span>
                                      </Button>
                                    ))}
                                  </div>
                                ) : null}
                                <p className="mt-2 text-xs leading-5 text-slate-500">
                                  {receiptUploadPrimaryPresetSuggestion
                                    ? "แสดงตัวแนะนำก่อน ให้เปิดตัวเลือกอื่นเมื่อรูปแบบแนะนำไม่ตรง"
                                    : "ยังไม่มีตัวตรงเป๊ะ จึงแสดงรูปแบบที่พบบ่อยก่อน"}
                                </p>
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                "mt-4 overflow-hidden transition-all duration-300 ease-out",
                                receiptUploadOverviewExpanded
                                  ? "max-h-[2000px] opacity-100"
                                  : "max-h-0 opacity-0",
                              )}
                            >
                              <div className="grid gap-4">
                                <div className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 shadow-sm line-clamp-1">
                                  {receiptUploadPreviewReadableSummary
                                    ?? (receiptUploadPreviewMissingFields.length > 0
                                      ? `${receiptUploadPreviewMissingFields.length} ฟิลด์ยังต้องยืนยัน`
                                      : "สลิปถูกแปลงเป็นข้อมูลโครงสร้างแล้ว ตรวจฟิลด์สำคัญด้านล่างก่อนบันทึกฉบับร่าง")}
                                </div>
                                {receiptUploadPreviewMissingFields.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {receiptUploadPreviewMissingFields.map((field) => (
                                      <Badge key={field} variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                        ขาด {field}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        ฟิลด์สำคัญ
                                      </p>
                                      <p className="mt-1 text-xs leading-5 text-slate-500">
                                        ค่าด้านล่างคือข้อมูลจริงที่จะถูกบันทึกลงในฉบับร่าง
                                      </p>
                                    </div>
                                    <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                                      {receiptUploadPreviewKeyFields.length} ฟิลด์
                                    </Badge>
                                  </div>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {receiptUploadPreviewKeyFields.map((field, index) => (
                                      <div
                                        key={field.label}
                                        className={cn(
                                          "rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs leading-5 shadow-sm transition-all duration-300",
                                          receiptUploadPreviewVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                                        )}
                                        style={{
                                          transitionDelay: receiptUploadPreviewVisible ? `${index * 36}ms` : "0ms",
                                        }}
                                      >
                                        <p className="font-semibold uppercase tracking-[0.16em] text-slate-500">
                                          {field.label}
                                        </p>
                                        <p className="mt-1 break-words text-sm text-slate-900">
                                          {field.value}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            {isMobileViewport ? (
                                <div className="rounded-xl border border-sky-200 bg-white/80 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                      หลักฐานและรายละเอียดการโอน
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      มุมมองแบบย่อของฟิลด์ที่ใช้บันทึกฉบับร่าง
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-2 rounded-full"
                                    onClick={() => setReceiptUploadPreviewDetailsExpanded((current) => !current)}
                                  >
                                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", receiptUploadPreviewDetailsExpanded ? "rotate-180" : "")} />
                                    {receiptUploadPreviewDetailsExpanded ? "ซ่อนรายละเอียด" : "แสดงรายละเอียด"}
                                  </Button>
                                </div>
                                <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-600">
                                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                                    {receiptUploadPreviewEvidence.length}
                                  </span>
                                  <span>{receiptUploadPreviewCombinedSummary}</span>
                                </div>
                                {receiptUploadPreviewDetailsExpanded ? (
                                  <div className="mt-3 space-y-3">
                                    <div className="rounded-xl border border-sky-200 bg-white px-3 py-2 shadow-sm">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                          รายการหลักฐาน
                                        </p>
                                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                                          {receiptUploadPreviewEvidence.length}
                                        </Badge>
                                      </div>
                                      <p className="mt-2 text-xs leading-5 text-slate-600">
                                        {receiptUploadPreviewEvidenceSummary}
                                      </p>
                                    </div>
                                    {receiptUploadPreviewIsTransfer ? (
                                      <div className="rounded-xl border border-sky-200 bg-white px-3 py-2 shadow-sm">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            รายละเอียดการโอน
                                          </p>
                                          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                                            โอนเงิน
                                          </Badge>
                                        </div>
                                        <p className="mt-2 text-xs leading-5 text-slate-600">
                                          {receiptUploadPreviewTransferSummary}
                                        </p>
                                        {receiptUploadPreviewIsSelfTransfer ? (
                                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-sky-200 bg-sky-50/70 px-3 py-2 text-xs leading-5 text-sky-800">
                                            <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                                              โอนระหว่างบัญชีตัวเอง
                                            </Badge>
                                            <span>
                                              บัญชีทั้งสองฝั่งอยู่ธนาคารเดียวกัน ระบบจะแยกฝั่งผู้โอนและผู้รับเงินไว้คนละช่อง
                                            </span>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-sky-200 bg-white/80 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    รายการหลักฐาน
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                                      {receiptUploadPreviewEvidence.length}
                                    </Badge>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8 gap-2 rounded-full"
                                      onClick={() => setReceiptUploadPreviewEvidenceExpanded((current) => !current)}
                                    >
                                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", receiptUploadPreviewEvidenceExpanded ? "rotate-180" : "")} />
                                      {receiptUploadPreviewEvidenceExpanded ? "ซ่อนหลักฐาน" : "แสดงหลักฐาน"}
                                    </Button>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-600">
                                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                                    {receiptUploadPreviewEvidence.length}
                                  </span>
                                  <span>{receiptUploadPreviewEvidenceSummary}</span>
                                </div>
                                {receiptUploadPreviewEvidenceExpanded ? (
                                  <div className="mt-3 grid gap-2">
                                    {receiptUploadPreviewEvidence.map((item, index) => (
                                      <div
                                        key={`${item.field}-${index}`}
                                        className={cn(
                                          "rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 shadow-sm transition-all duration-300",
                                          receiptUploadPreviewVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                                        )}
                                        style={{
                                          transitionDelay: receiptUploadPreviewVisible ? `${(receiptUploadPreviewKeyFields.length + index) * 36}ms` : "0ms",
                                        }}
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="font-semibold uppercase tracking-[0.16em] text-slate-500">
                                            {getEvidenceFieldLabel(item.field)}
                                          </p>
                                          {typeof item.confidence === "number" ? (
                                            <span className="text-[11px] text-slate-500">
                                              {Math.round(item.confidence * 100)}%
                                            </span>
                                          ) : null}
                                        </div>
                                        {item.value ? (
                                          <p className="mt-1 break-words text-sm text-slate-900">
                                            {item.value}
                                          </p>
                                        ) : null}
                                        <p className="mt-1 break-words text-xs text-slate-500">
                                          {item.snippet}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                          {receiptUploadPreviewExpanded ? (
                            <div
                              className={cn(
                                "mt-4 space-y-4 transition-all duration-300 ease-out",
                                receiptUploadPreviewContentVisible
                                  ? "translate-y-0 opacity-100"
                                  : "translate-y-2 opacity-0",
                              )}
                            >
                              {receiptUploadPreviewIsImage ? (
                                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                  <img
                                    src={receiptUploadPreview.sourceUrl ?? undefined}
                                    alt={receiptUploadPreview.sourceFileName ?? "สลิปต้นฉบับ"}
                                    className="max-h-[320px] w-full object-contain"
                                  />
                                </div>
                              ) : null}
                              {receiptUploadPreviewIsTransfer ? (
                                !isMobileViewport ? (
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                          รายละเอียดการโอน
                                        </Badge>
                                        <span className="text-xs leading-5 text-slate-500">
                                          <span className="sm:hidden">เปิดเพื่อดูรายละเอียดธนาคารทั้งฝั่งผู้โอนและผู้รับเงิน</span>
                                          <span className="hidden sm:inline">ฝั่งผู้โอนและผู้รับเงินจะแสดงพร้อมกันบนหน้าจอเดสก์ท็อป</span>
                                        </span>
                                      </div>
                                    </div>
                                    <div className="grid gap-3 md:grid-cols-2">
                                      {receiptUploadPreviewTransferSides.map((side, index) => (
                                        <div
                                          key={side.title}
                                          className={cn(
                                            "rounded-2xl border p-4 shadow-sm transition-all duration-300 transform-gpu",
                                            receiptUploadPreviewContentVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                                            side.tone,
                                          )}
                                          style={{
                                            transitionDelay: receiptUploadPreviewContentVisible ? `${index * 90}ms` : "0ms",
                                          }}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                              {side.title}
                                            </p>
                                            <Badge variant="outline" className={cn("inline-flex items-center gap-1.5 border px-3 py-1 text-xs font-semibold shadow-sm", side.badgeTone)}>
                                              {side.title === "ฝั่งผู้โอน" ? (
                                                <ArrowDownRight className="h-3.5 w-3.5" />
                                              ) : (
                                                <ArrowUpRight className="h-3.5 w-3.5" />
                                              )}
                                              {side.badgeLabel}
                                            </Badge>
                                          </div>
                                          <div className="mt-3 space-y-3">
                                            <div>
                                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                {side.labelBank}
                                              </p>
                                              <p className="mt-1 break-words text-sm font-medium text-slate-950">
                                                {side.bank}
                                              </p>
                                            </div>
                                            <div>
                                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                {side.labelAccount}
                                              </p>
                                              <p className="mt-1 break-words text-sm font-medium text-slate-950">
                                                {side.account}
                                              </p>
                                            </div>
                                            <div>
                                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                {side.labelName}
                                              </p>
                                              <p className="mt-1 break-words text-sm font-medium text-slate-950">
                                                {side.partyName ?? "—"}
                                              </p>
                                            </div>
                                            <div className="overflow-hidden rounded-xl bg-white/80 px-3 py-2 ring-1 ring-white/80">
                                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                ชื่อบัญชี
                                              </p>
                                              <p className="mt-1 break-words text-sm font-semibold text-slate-950">
                                                {side.accountName ?? "—"}
                                              </p>
                                              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                เลขที่ปิดบัง
                                              </p>
                                              <p className="mt-1 break-words font-mono text-xs font-semibold text-slate-700">
                                                {side.maskedIdentifier ?? "—"}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null
                              ) : null}
                              {!isMobileViewport && receiptUploadPreviewIsSelfTransfer ? (
                                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-800">
                                  <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                                    โอนระหว่างบัญชีตัวเอง
                                  </Badge>
                                  <span>
                                    บัญชีทั้งสองฝั่งอยู่ธนาคารเดียวกัน ระบบจะแยกฝั่งผู้โอนและผู้รับเงินไว้คนละช่อง
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant={isRecording ? "destructive" : "outline"}
                      className="gap-2"
                      onClick={() => {
                        if (isRecording) {
                          stopRecording();
                        } else {
                          void startRecording();
                        }
                      }}
                      disabled={isTranscribing}
                    >
                      {isRecording ? (
                        <MicOff className="h-4 w-4" />
                      ) : isTranscribing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                      {isRecording
                        ? t("dashboard:finance.quick.voiceStop", "Stop mic")
                        : isTranscribing
                          ? t("dashboard:finance.quick.voiceTranscribing", "Transcribing")
                          : t("dashboard:finance.quick.voiceInput", "Voice input")}
                    </Button>
                  </div>
                  {quickActionStatus.kind !== "idle" ? (
                    <div className="flex items-center gap-2 text-xs leading-5 text-slate-500" aria-live="polite">
                      <Badge
                        variant={quickActionStatus.kind === "error" ? "destructive" : quickActionStatus.kind === "saved" ? "default" : "secondary"}
                        className={cn(
                          "rounded-full px-3 py-1",
                          quickActionStatus.kind === "saved"
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                            : quickActionStatus.kind === "draft"
                              ? "bg-amber-50 text-amber-700 hover:bg-amber-50"
                              : quickActionStatus.kind === "saving"
                                ? "bg-sky-50 text-sky-700 hover:bg-sky-50"
                                : "",
                        )}
                      >
                        {quickActionStatus.kind === "saving"
                          ? t("dashboard:finance.quick.statusSavingLabel", "Saving")
                          : quickActionStatus.kind === "saved"
                            ? t("dashboard:finance.quick.statusSavedLabel", "บันทึกแล้ว")
                            : quickActionStatus.kind === "draft"
                              ? t("dashboard:finance.quick.statusDraftLabel", "Draft")
                              : t("dashboard:finance.quick.statusErrorLabel", "Error")}
                      </Badge>
                      <span>{quickActionStatus.message}</span>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {t("dashboard:finance.payment.title", "Payment account / card")}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {t(
                            "dashboard:finance.payment.helper",
                            "Pick a canonical nickname first. The system will reuse the same bank account or credit card without creating duplicate names.",
                          )}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                        {getPaymentDirectionLabel(
                          draftTypeHint === "income"
                            ? "inbound"
                            : draftTypeHint === "transfer"
                              ? "both"
                              : "outbound",
                        )}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {draftTypeHint !== "income" ? (
                        <FinanceCounterpartyAutocomplete
                          value={draftPaymentSourceLabel}
                          placeholder={t(
                            "dashboard:finance.payment.sourcePlaceholder",
                            "บัญชี/บัตรที่จ่ายออก",
                          )}
                          onValueChange={setDraftPaymentSourceLabel}
                          items={paymentAccountItems}
                          helperText={t(
                            "dashboard:finance.payment.sourceHelper",
                            "เลือกบัญชีหรือบัตรที่ใช้จ่ายออก",
                          )}
                          className="bg-white"
                          inputClassName="bg-white"
                        />
                      ) : null}
                      {draftTypeHint === "income" || draftTypeHint === "transfer" ? (
                        <FinanceCounterpartyAutocomplete
                          value={draftPaymentDestinationLabel}
                          placeholder={t(
                            "dashboard:finance.payment.destinationPlaceholder",
                            "บัญชี/ช่องทางที่รับเข้า",
                          )}
                          onValueChange={setDraftPaymentDestinationLabel}
                          items={paymentAccountItems}
                          helperText={t(
                            "dashboard:finance.payment.destinationHelper",
                            "เลือกบัญชีที่รับเงินเข้า",
                          )}
                          className="bg-white"
                          inputClassName="bg-white"
                        />
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {paymentAccountsQuery.data?.slice(0, 6).map((item) => (
                        <Button
                          key={item.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-8 gap-2 rounded-full",
                            selectedDraftPaymentSourceAccount?.id === item.id || selectedDraftPaymentDestinationAccount?.id === item.id
                              ? "border-sky-300 bg-sky-50 text-sky-700"
                              : "",
                          )}
                          onClick={() => {
                            const label = item.displayLabel ?? buildPaymentAccountDisplayLabel(item);
                            if (draftTypeHint === "income") {
                              selectPaymentAccountAsActive(label, "destination");
                            } else {
                              selectPaymentAccountAsActive(label, "source");
                            }
                            if (draftTypeHint === "transfer") {
                              setDraftPaymentDestinationLabel(label);
                            }
                          }}
                        >
                          {item.kind === "credit_card" ? <CreditCard className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                          <span className="max-w-[14rem] truncate">{item.displayLabel ?? buildPaymentAccountDisplayLabel(item)}</span>
                        </Button>
                      ))}
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {t("dashboard:finance.payment.manageTitle", "เพิ่มบัญชีธนาคารหรือบัตรเครดิต")}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {t(
                              "dashboard:finance.payment.manageDescription",
                              "Use nicknames for each account or card. One bank or issuer can have many instruments, and the same nickname will be reused across drafts and reports.",
                            )}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                          {selectedCapturePaymentAccount
                            ? selectedCapturePaymentAccount.displayLabel
                            : t("dashboard:finance.payment.noneSelected", "ยังไม่ได้เลือกบัญชี")}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <Input
                          value={draftPaymentInstitutionName}
                          onChange={(event) => setDraftPaymentInstitutionName(event.target.value)}
                          placeholder={t("dashboard:finance.payment.institutionPlaceholder", "ชื่อธนาคารหรือผู้ออกบัตร")}
                          className="bg-white"
                        />
                        <Select
                          value={draftPaymentInstitutionKind}
                          onValueChange={(value) => setDraftPaymentInstitutionKind(value as typeof draftPaymentInstitutionKind)}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={t("dashboard:finance.payment.institutionKind", "ประเภทสถาบัน")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank">{t("dashboard:finance.payment.institutionBank", "Bank")}</SelectItem>
                            <SelectItem value="issuer">{t("dashboard:finance.payment.institutionIssuer", "Card issuer")}</SelectItem>
                            <SelectItem value="other">{t("dashboard:finance.payment.institutionOther", "Other")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={draftPaymentAccountKind}
                          onValueChange={(value) => {
                            const nextKind = value as typeof draftPaymentAccountKind;
                            setDraftPaymentAccountKind(nextKind);
                            if (nextKind === "credit_card") {
                              setDraftPaymentInstitutionKind((current) => (current === "other" ? current : "issuer"));
                            } else if (nextKind === "bank_account") {
                              setDraftPaymentInstitutionKind((current) => (current === "other" ? current : "bank"));
                            }
                          }}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder={t("dashboard:finance.payment.accountKind", "ประเภทบัญชี")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank_account">{t("dashboard:finance.payment.accountBank", "บัญชีธนาคาร")}</SelectItem>
                            <SelectItem value="credit_card">{t("dashboard:finance.payment.accountCard", "บัตรเครดิต")}</SelectItem>
                            <SelectItem value="cash">{t("dashboard:finance.payment.accountCash", "เงินสด")}</SelectItem>
                            <SelectItem value="unknown">{t("dashboard:finance.payment.accountUnknown", "ไม่ทราบ")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={draftPaymentAccountNickname}
                          onChange={(event) => setDraftPaymentAccountNickname(event.target.value)}
                          placeholder={t("dashboard:finance.payment.nicknamePlaceholder", "ชื่อเล่น เช่น SCB Main หรือ KTC Blue")}
                          className="bg-white"
                        />
                        <Input
                          value={draftPaymentAccountLast4}
                          onChange={(event) => setDraftPaymentAccountLast4(event.target.value.replace(/\D+/g, "").slice(0, 4))}
                          placeholder={t("dashboard:finance.payment.last4Placeholder", "เลขท้าย 4 ตัว")}
                          inputMode="numeric"
                          maxLength={4}
                          className="bg-white"
                        />
                        <Input
                          value={draftPaymentAccountMaskedIdentifier}
                          onChange={(event) => setDraftPaymentAccountMaskedIdentifier(event.target.value)}
                          placeholder={t("dashboard:finance.payment.maskedPlaceholder", "เลขที่ปิดบัง หรือเลขบัญชีบางส่วน")}
                          className="bg-white"
                        />
                        <Input
                          value={draftPaymentAccountAliases}
                          onChange={(event) => setDraftPaymentAccountAliases(event.target.value)}
                          placeholder={t("dashboard:finance.payment.aliasesPlaceholder", "ชื่ออื่นคั่นด้วยจุลภาค")}
                          className="bg-white"
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          className="gap-2"
                          onClick={() => void handleSavePaymentAccount()}
                          disabled={upsertPaymentAccountMutation.isPending}
                        >
                          {upsertPaymentAccountMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          {t("dashboard:finance.payment.saveInstrument", "บันทึกบัญชี / บัตร")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2"
                          onClick={handleResetPaymentAccountForm}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {t("dashboard:finance.payment.reset", "รีเซ็ต")}
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {paymentInstitutionsQuery.data?.slice(0, 8).map((institution) => (
                          <Button
                            key={institution.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-2 rounded-full"
                            onClick={() => handleSelectPaymentInstitution(institution)}
                          >
                            <Landmark className="h-3.5 w-3.5" />
                            <span className="max-w-[12rem] truncate">
                              {institution.displayName}
                            </span>
                          </Button>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {t(
                          "dashboard:finance.payment.manageHelper",
                          "Select a nickname or institution to reuse the same payment instrument when recording reports, OCR slips, or quick drafts.",
                        )}
                      </p>
                    </div>
                  </div>
                  <Input
                    ref={receiptInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                      className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) {
                        return;
                      }
                      try {
                        await handleReceiptUpload(file);
                      } catch (error) {
                        toast.error(getFinanceErrorMessage(error, "ประมวลผล OCR ใบเสร็จไม่สำเร็จ"));
                      }
                    }}
                  />
                </div>
              </div>
            ) : null}

            {(financeDebugEnabled || draftsQuery.isError) ? (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 p-4 text-xs text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">
                    Finance debug
                  </p>
                  <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                    {draftsQuery.isError ? "คิวรีฉบับร่างมีปัญหา" : "คิวรีฉบับร่างปกติ"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">ห้องสนทนา</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      #{conversationId ?? "n/a"} · {conversationQuery.data?.title ?? "No conversation"} · {conversationQuery.data?.projectId ?? "no project"}
                    </p>
                      <p className="mt-1 text-xs text-slate-500">
                        tenant: {(conversationQuery.data as { tenantId?: string | null } | undefined)?.tenantId ?? "n/a"} · personal: {financeReady ? "yes" : "no"}
                      </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">คิวรีฉบับร่าง</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      status=draft · limit={draftLimit} · returned={openDrafts.length}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      กำลังโหลด: {draftsQuery.isLoading ? "ใช่" : "ไม่ใช่"} · ดึงข้อมูล: {draftsQuery.isFetching ? "ใช่" : "ไม่ใช่"} · error: {draftsQuery.isError ? "ใช่" : "ไม่ใช่"}
                    </p>
                  </div>
                </div>
                {draftsQueryErrorMessage ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                    {draftsQueryErrorMessage}
                  </p>
                ) : null}
                <p className="mt-3 text-[12px] leading-5 text-slate-500">
                  ถ้ามีฉบับร่างในฐานข้อมูลแต่แผงนี้ขึ้นเป็นศูนย์ ให้ตรวจ scope ของห้องสนทนาและผลคิวรีฉบับร่างก่อนเป็นอันดับแรก
                </p>
              </div>
            ) : null}

            <div className={sectionsGridClass}>
              <DashboardCard
                eyebrow={t("dashboard:finance.drafts.title")}
                title={t("dashboard:finance.drafts.title")}
                description={t("dashboard:finance.drafts.empty")}
              >
                {openDrafts.length > 0 ? (
                  <div className="space-y-3">
                    {openDrafts.map((draft) => {
                      const payload = getDraftPayload(draft);
                      const counterpartyLabel = getFinanceCounterpartyLabel(
                        draft.type,
                        payload.counterpartyName,
                        payload.merchantName,
                      );
                      const flowLabel = getFinanceFlowLabel(draft.type, t);
                      const fallbackDraftEditState = getDraftDateTimeInputState(payload.occurredAt ?? draft.createdAt);
                      const draftEditState = draftEditStates[draft.id] ?? {
                        date: fallbackDraftEditState.date,
                        time: fallbackDraftEditState.time,
                        counterpartyName: (payload.counterpartyName ?? payload.merchantName ?? "").trim(),
                        status: { kind: "idle", message: null },
                      };
                      const draftEditStatus = draftEditState.status;
                      return (
                        <div key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">
                                {getTransactionTypeLabel(draft.type)}
                                <span className="ml-2 text-xs text-slate-500">
                                  {formatMoneyMinor(payload.amountMinor, payload.currency)}
                                </span>
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {flowLabel}: {counterpartyLabel}
                              </p>
                              <p className={dashboardMetaLineClass}>
                                <span>{payload.categoryCode ?? "uncategorized"}</span>
                                <span className="text-slate-300">|</span>
                                <span>{getFinanceSourceLabel(draft.source)}</span>
                                <span className="text-slate-300">|</span>
                                <span>{formatDateTime(payload.occurredAt ?? draft.createdAt)}</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                                {Number(draft.confidence ?? 0).toFixed(2)}
                              </Badge>
                              <Button
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={async () => {
                                  if (!conversationId) return;
                                  const confirmedTransaction = await confirmDraftMutation.mutateAsync({
                                    conversationId,
                                    draftId: draft.id,
                                  });
                                  setSelectedEvidenceTransactionId(confirmedTransaction.id);
                                }}
                                disabled={!financeReady || confirmDraftMutation.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {t("dashboard:finance.actions.confirm")}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                    disabled={!financeReady || cancelDraftMutation.isPending}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    ยกเลิกฉบับร่าง
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Cancel this draft?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      The draft will be removed from the open list and won’t affect your balances.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Keep draft</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 text-white hover:bg-red-700"
                                      onClick={async () => {
                                        if (!conversationId) return;
                                        await cancelDraftMutation.mutateAsync({
                                          conversationId,
                                          draftId: draft.id,
                                        });
                                      }}
                                    >
                                      ยกเลิกฉบับร่าง
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                          {draft.needsClarification ? (
                            <p className="mt-2 text-xs font-medium text-amber-700">
                              {t("dashboard:finance.labels.needsAttention")}
                            </p>
                          ) : null}
                          {draft.source === "ocr_document" ? (
                            <div className="mt-3">
                              <FinanceSemanticDuplicateWarningCard
                                conversationId={conversationId}
                                draftId={draft.id}
                              />
                            </div>
                          ) : null}
                          <div className="mt-3 rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                                  {t("dashboard:finance.drafts.editSectionTitle", "Edit date, time, and counterparty")}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {t(
                                    "dashboard:finance.drafts.editDescription",
                                    "ปรับวัน เวลา หรือคู่ค้าที่ได้จาก OCR ก่อนยืนยันฉบับร่างนี้",
                                  )}
                                </p>
                              </div>
                              <Badge
                                variant={draftEditStatus.kind === "error" ? "destructive" : draftEditStatus.kind === "saved" ? "default" : "secondary"}
                                className={cn(
                                  "rounded-full px-3 py-1",
                                  draftEditStatus.kind === "saved"
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                    : draftEditStatus.kind === "saving"
                                      ? "bg-sky-50 text-sky-700 hover:bg-sky-50"
                                      : draftEditStatus.kind === "error"
                                        ? ""
                                        : "bg-slate-50 text-slate-600 hover:bg-slate-50",
                                )}
                              >
                                {draftEditStatus.kind === "saving"
                                  ? t("dashboard:finance.quick.statusSavingLabel", "กำลังบันทึก")
                                  : draftEditStatus.kind === "saved"
                                    ? t("dashboard:finance.quick.statusSavedLabel", "บันทึกแล้ว")
                                    : draftEditStatus.kind === "error"
                                      ? t("dashboard:finance.quick.statusErrorLabel", "ผิดพลาด")
                                      : t("dashboard:finance.quick.statusDraftLabel", "ฉบับร่าง")}
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label className="space-y-1.5 sm:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {t("dashboard:finance.drafts.editCounterpartyLabel", "คู่ค้า/ผู้เกี่ยวข้อง")}
                                </span>
                                <Input
                                  aria-label={t("dashboard:finance.drafts.editCounterpartyLabel", "คู่ค้า/ผู้เกี่ยวข้อง")}
                                  value={draftEditState.counterpartyName}
                                  onChange={(event) => {
                                    const nextCounterparty = event.target.value;
                                    setDraftEditStates((current) => {
                                      const previous = current[draft.id] ?? draftEditState;
                                      return {
                                        ...current,
                                        [draft.id]: {
                                          ...previous,
                                          counterpartyName: nextCounterparty,
                                          status: { kind: "idle", message: null },
                                        },
                                      };
                                    });
                                  }}
                                  placeholder={t(
                                    "dashboard:finance.drafts.editCounterpartyPlaceholder",
                                    "จ่ายให้ใคร หรือใครจ่ายให้คุณ",
                                  )}
                                  className="bg-white"
                                />
                              </label>
                              <label className="space-y-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {t("dashboard:finance.drafts.editDateLabel", "วัน")}
                                </span>
                                <Input
                                  aria-label={t("dashboard:finance.drafts.editDateLabel", "วัน")}
                                  type="date"
                                  value={draftEditState.date}
                                  onChange={(event) => {
                                    const nextDate = event.target.value;
                                    setDraftEditStates((current) => {
                                      const previous = current[draft.id] ?? draftEditState;
                                      return {
                                        ...current,
                                        [draft.id]: {
                                          ...previous,
                                          date: nextDate,
                                          status: { kind: "idle", message: null },
                                        },
                                      };
                                    });
                                  }}
                                  className="bg-white"
                                />
                              </label>
                              <label className="space-y-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {t("dashboard:finance.drafts.editTimeLabel", "เวลา")}
                                </span>
                                <Input
                                  aria-label={t("dashboard:finance.drafts.editTimeLabel", "เวลา")}
                                  type="time"
                                  value={draftEditState.time}
                                  onChange={(event) => {
                                    const nextTime = event.target.value;
                                    setDraftEditStates((current) => {
                                      const previous = current[draft.id] ?? draftEditState;
                                      return {
                                        ...current,
                                        [draft.id]: {
                                          ...previous,
                                          time: nextTime,
                                          status: { kind: "idle", message: null },
                                        },
                                      };
                                    });
                                  }}
                                  className="bg-white"
                                />
                              </label>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => {
                                  const resetState = getDraftDateTimeInputState(payload.occurredAt ?? draft.createdAt);
                                  setDraftEditStates((current) => ({
                                    ...current,
                                    [draft.id]: {
                                      date: resetState.date,
                                      time: resetState.time,
                                      counterpartyName: (payload.counterpartyName ?? payload.merchantName ?? "").trim(),
                                      status: { kind: "idle", message: null },
                                    },
                                  }));
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                {t("dashboard:finance.drafts.resetToOriginal", "รีเซ็ต")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="gap-2"
                                onClick={async () => {
                                  if (!conversationId) {
                                    return;
                                  }

                                  const occurredAt = buildDraftOccurredAtIso(draftEditState.date, draftEditState.time);
                                  if (!occurredAt) {
                                    const message = t(
                                      "dashboard:finance.quick.statusInvalidDateTime",
                                      "Please choose a valid date and time.",
                                    );
                                    setDraftEditStates((current) => ({
                                      ...current,
                                      [draft.id]: {
                                        ...draftEditState,
                                        status: { kind: "error", message },
                                      },
                                    }));
                                    toast.error(message);
                                    return;
                                  }

                                  const savingMessage = t(
                                    "dashboard:finance.drafts.editSaving",
                                    "Saving draft changes...",
                                  );
                                  setDraftEditStates((current) => ({
                                    ...current,
                                    [draft.id]: {
                                      ...draftEditState,
                                      status: { kind: "saving", message: savingMessage },
                                    },
                                  }));

                                  try {
                                    const updatedDraft = await updateDraftMutation.mutateAsync({
                                      conversationId,
                                      draftId: draft.id,
                                      expectedVersion: draft.version,
                                      patch: {
                                        occurredAt,
                                        counterpartyName: draftEditState.counterpartyName.trim() || null,
                                      },
                                    });
                                    const updatedPayload = getDraftPayload(updatedDraft);
                                    const resolvedDraftTime = getDraftDateTimeInputState(updatedPayload.occurredAt ?? occurredAt);
                                    const successMessage = t(
                                      "dashboard:finance.drafts.editSaved",
                                      "Draft changes saved.",
                                    );
                                    setDraftEditStates((current) => ({
                                      ...current,
                                      [draft.id]: {
                                        date: resolvedDraftTime.date,
                                        time: resolvedDraftTime.time,
                                        counterpartyName: (updatedPayload.counterpartyName ?? updatedPayload.merchantName ?? "").trim(),
                                        status: { kind: "saved", message: successMessage },
                                      },
                                    }));
                                    toast.success(successMessage);
                                  } catch (error) {
                                    const message = error instanceof Error ? error.message : t(
                                      "dashboard:finance.drafts.editError",
                                      "Could not save draft changes.",
                                    );
                                    setDraftEditStates((current) => ({
                                      ...current,
                                      [draft.id]: {
                                        ...draftEditState,
                                        status: { kind: "error", message },
                                      },
                                    }));
                                  }
                                }}
                                disabled={!financeReady || updateDraftMutation.isPending}
                              >
                                {updateDraftMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                {t("dashboard:finance.drafts.saveEdit", "บันทึกวัน/เวลา")}
                              </Button>
                            </div>
                            {draftEditStatus.kind !== "idle" ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-500" aria-live="polite">
                                <Badge
                                  variant={draftEditStatus.kind === "error" ? "destructive" : draftEditStatus.kind === "saved" ? "default" : "secondary"}
                                  className={cn(
                                    "rounded-full px-3 py-1",
                                    draftEditStatus.kind === "saved"
                                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                      : draftEditStatus.kind === "saving"
                                        ? "bg-sky-50 text-sky-700 hover:bg-sky-50"
                                        : draftEditStatus.kind === "error"
                                          ? ""
                                          : "bg-slate-50 text-slate-600 hover:bg-slate-50",
                                  )}
                                >
                                  {draftEditStatus.kind === "saving"
                                    ? t("dashboard:finance.quick.statusSavingLabel", "Saving")
                                    : draftEditStatus.kind === "saved"
                                      ? t("dashboard:finance.quick.statusSavedLabel", "บันทึกแล้ว")
                                      : t("dashboard:finance.quick.statusErrorLabel", "Error")}
                                </Badge>
                                <span>{draftEditStatus.message}</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-sm text-slate-500">
                    {t("dashboard:finance.drafts.empty")}
                  </div>
                )}
              </DashboardCard>

              <DashboardCard
                eyebrow={t("dashboard:finance.transactions.title")}
                title={t("dashboard:finance.transactions.title")}
                description={t("dashboard:finance.transactions.empty")}
              >
                {recentTransactions.length > 0 ? (
                  <div className="space-y-3">
                    {recentTransactions.map((transaction) => {
                      const transactionCounterparty = getLocalizedFinanceCounterpartyLabel(
                        transaction.type,
                        transaction.counterpartyName ?? null,
                        transaction.merchantName ?? null,
                      );
                      const transactionFlowLabel = getFinanceFlowLabel(transaction.type, t);

                      return (
                        <div key={transaction.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">
                                {getLocalizedTransactionTypeLabel(transaction.type)}
                                <span className="ml-2 text-xs text-slate-500">
                                  {formatMoneyMinor(transaction.amountMinor, transaction.currency)}
                                </span>
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {transactionFlowLabel}: {transactionCounterparty}
                              </p>
                              <p className={dashboardMetaLineClass}>
                                <span>{formatDateTime(transaction.occurredAt)}</span>
                                <span className="text-slate-300">|</span>
                                <span>{transaction.status}</span>
                                <span className="text-slate-300">|</span>
                                <span>{getLocalizedFinanceSourceLabel(transaction.source)}</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-600"
                                    aria-label={`เมนูการจัดการรายการของ ${transactionCounterparty}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="gap-2"
                                    onClick={() => setSelectedEvidenceTransactionId(transaction.id)}
                                  >
                                    <Search className="h-3.5 w-3.5" />
                                    {t("dashboard:finance.report.inspect")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2 text-red-700 focus:text-red-700"
                                    onClick={() => setPendingVoidTransactionId(transaction.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    ลบ / โมฆะ
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-sm text-slate-500">
                    {t("dashboard:finance.transactions.empty")}
                  </div>
                )}
              </DashboardCard>

              <DashboardCard
                eyebrow={t("finance.confirmed.eyebrow")}
                title={t("finance.confirmed.title")}
                description={t("finance.confirmed.description")}
              >
                {activeEvidenceTransaction && activeEvidenceTransactionDetails ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        {t("finance.confirmed.readableSummary")}
                      </div>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
                        {activeEvidenceTransactionDetails.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                          {getLocalizedTransactionTypeLabel(activeEvidenceTransaction.type)}
                        </Badge>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                          {formatMoneyMinor(activeEvidenceTransaction.amountMinor, activeEvidenceTransaction.currency)}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                          {getLocalizedFinanceSourceLabel(activeEvidenceTransaction.source)}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      {[
                        {
                          title: t("finance.confirmed.sections.overview"),
                          fields: activeEvidenceTransactionDetails.overviewFields,
                        },
                        {
                          title: t("finance.confirmed.sections.routing"),
                          fields: activeEvidenceTransactionDetails.routingFields,
                        },
                        {
                          title: t("finance.confirmed.sections.metadata"),
                          fields: activeEvidenceTransactionDetails.metadataFields,
                        },
                      ].map((section) => (
                        <div key={section.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="text-xs uppercase tracking-wide text-slate-500">{section.title}</div>
                          <dl className="mt-3 space-y-3">
                            {section.fields.map((field) => (
                              <div key={field.label} className="flex items-start justify-between gap-3 border-b border-dashed border-slate-100 pb-2 last:border-b-0 last:pb-0">
                                <dt className="min-w-0 text-xs font-medium uppercase tracking-wide text-slate-500">
                                  {field.label}
                                </dt>
                                <dd className="max-w-[65%] text-right text-sm text-slate-900">
                                  {field.label === t("finance.confirmed.fields.sourceFile") && activeEvidenceTransaction.sourceUrl ? (
                                    <a
                                      href={activeEvidenceTransaction.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-800"
                                    >
                                      {field.value}
                                    </a>
                                  ) : (
                                    field.value
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </div>

                    {activeEvidenceTransaction.sourceUrl ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                        <span className="text-slate-500">
                          {t("finance.confirmed.sourceFileLabel")}:
                        </span>
                        <a
                          href={activeEvidenceTransaction.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-800"
                        >
                          {activeEvidenceTransaction.sourceFileName ?? activeEvidenceTransaction.sourceUrl}
                        </a>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-red-800">
                            {t("finance.confirmed.voidTitle")}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-red-700">
                            {t("finance.confirmed.voidDescription")}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 gap-2 border-red-300 bg-white text-red-700 hover:bg-red-100 hover:text-red-800"
                          onClick={() => setPendingVoidTransactionId(activeEvidenceTransaction.id)}
                          disabled={!financeReady || voidTransactionMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("finance.confirmed.voidAction")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-sm text-slate-500">
                    {t("finance.confirmed.emptySelection")}
                  </div>
                )}
              </DashboardCard>

              <DashboardCard
                eyebrow={t("dashboard:finance.recurring.title")}
                title={t("dashboard:finance.recurring.title")}
                description={t("dashboard:finance.recurring.empty")}
              >
                {recurringRules.length > 0 ? (
                  <div className="space-y-3">
                      {recurringRules.map((rule) => {
                      const isActive = rule.status === "active";
                      const ruleCounterparty = getLocalizedFinanceCounterpartyLabel(
                        rule.type,
                        rule.counterpartyName ?? null,
                        rule.merchantName ?? null,
                      );
                      return (
                        <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">
                                {formatMoneyMinor(rule.amountMinor, rule.currency)}
                                <span className="ml-2 text-xs text-slate-500">
                                  {rule.categoryCode}
                                </span>
                              </p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {parseRecurringRuleSummary(rule.rrule, rule.nextRunAt, rule.timezone)}
                              </p>
                              <p className={dashboardMetaLineClass}>
                                <span>{getFinanceFlowLabel(rule.type, t)}: {ruleCounterparty}</span>
                                <span className="text-slate-300">|</span>
                                <span>
                                  {rule.autoConfirm
                                    ? t("finance.recurring.autoConfirm")
                                    : t("finance.recurring.draftFirst")}
                                </span>
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <Badge variant="outline" className={cn("capitalize", isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600")}>
                                {rule.status}
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => {
                                  if (!conversationId) return;
                                  if (isActive) {
                                    pauseRecurringRuleMutation.mutate({
                                      conversationId,
                                      recurringRuleId: rule.id,
                                    });
                                  } else {
                                    resumeRecurringRuleMutation.mutate({
                                      conversationId,
                                      recurringRuleId: rule.id,
                                    });
                                  }
                                }}
                                disabled={!financeReady || pauseRecurringRuleMutation.isPending || resumeRecurringRuleMutation.isPending}
                              >
                                {isActive ? (
                                  <>
                                    <Pause className="h-3.5 w-3.5" />
                                    {t("dashboard:finance.actions.pause")}
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-3.5 w-3.5" />
                                    {t("dashboard:finance.actions.resume")}
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-sm text-slate-500">
                    {t("dashboard:finance.recurring.empty")}
                  </div>
                )}
              </DashboardCard>

              <DashboardCard
                eyebrow={t("dashboard:finance.report.categoryBreakdown")}
                title={t("dashboard:finance.report.categoryBreakdown")}
                description={t("dashboard:finance.report.categoryBreakdownDescription")}
              >
                {monthlyCategoryBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {monthlyCategoryBreakdown.map((category) => {
                      const totalMinor = category.expenseMinor + category.incomeMinor;
                      return (
                        <div key={category.categoryCode} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{category.categoryCode}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {category.count} {category.count === 1 ? "transaction" : "transactions"}
                              </p>
                            </div>
                            <div className="text-right text-xs text-slate-500">
                              <p className="font-medium text-slate-700">
                                {formatMoneyMinor(totalMinor)}
                              </p>
                              <p className="mt-1">
                                {category.expenseMinor > 0
                                  ? t("finance.report.categoryExpense", {
                                      amount: formatMoneyMinor(category.expenseMinor),
                                    })
                                  : ""}
                                {category.expenseMinor > 0 && category.incomeMinor > 0 ? " · " : ""}
                                {category.incomeMinor > 0
                                  ? t("finance.report.categoryIncome", {
                                      amount: formatMoneyMinor(category.incomeMinor),
                                    })
                                  : ""}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                              style={{
                                width: `${Math.max(12, Math.min(100, totalMinor > 0 ? Math.round((totalMinor / Math.max(1, monthlyTransactionTotalMinor)) * 100) : 0))}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-sm text-slate-500">
                    {t("dashboard:finance.report.categoryBreakdownEmpty")}
                  </div>
                )}
              </DashboardCard>

              <DashboardCard
                eyebrow={t("dashboard:finance.report.evidenceTrail")}
                title={t("dashboard:finance.report.evidenceTrail")}
                description={t("dashboard:finance.report.evidenceTrailDescription")}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {recentTransactions.slice(0, compact ? 2 : 4).map((transaction) => (
                      <Button
                        key={transaction.id}
                        variant={selectedEvidenceTransactionId === transaction.id ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => setSelectedEvidenceTransactionId(transaction.id)}
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        {formatMoneyMinor(transaction.amountMinor, transaction.currency)}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-slate-500" />
                      <Input
                        value={evidenceSearchText}
                        onChange={(event) => setEvidenceSearchText(event.target.value)}
                        placeholder={t("dashboard:finance.report.searchEvidencePlaceholder")}
                        className="h-9"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => void financeEvidenceQuery.refetch()}
                        disabled={financeEvidenceQuery.isFetching}
                      >
                        {financeEvidenceQuery.isFetching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Search className="h-3.5 w-3.5" />
                        )}
                        {t("dashboard:finance.report.searchEvidence")}
                      </Button>
                      {activeEvidenceTransaction ? (
                        <span className="text-xs text-slate-500">
                          {t("dashboard:finance.report.inspectingTransaction", {
                            amount: formatMoneyMinor(activeEvidenceTransaction.amountMinor, activeEvidenceTransaction.currency),
                          })}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {linkedDocuments.length > 0 ? (
                    <div className="space-y-2">
                      {linkedDocuments.map((link) => (
                        <div key={link.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {link.libraryItem?.title ?? `เอกสาร ${link.libraryItemId}`}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {link.role}
                            {link.note ? ` · ${link.note}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {link.libraryItem?.source ?? "คลังเอกสาร"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : evidenceResults.length > 0 ? (
                    <div className="space-y-2">
                      {evidenceResults.map((result) => (
                        <div key={result.item_id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-sm font-semibold text-slate-900">{result.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {result.source} · {result.item_type}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-sm text-slate-500">
                      {t("dashboard:finance.report.evidenceTrailEmpty")}
                    </div>
                  )}
                </div>
              </DashboardCard>

              <DashboardCard
                eyebrow={t("dashboard:finance.report.recurringDueSoon")}
                title={t("dashboard:finance.report.recurringDueSoon")}
                description={t("dashboard:finance.report.recurringDueSoonDescription")}
              >
                {dueSoonRecurringRules.length > 0 ? (
                  <div className="space-y-3">
                    {dueSoonRecurringRules.map((rule) => (
                      <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {formatMoneyMinor(rule.amountMinor, rule.currency)}
                              <span className="ml-2 text-xs text-slate-500">{rule.categoryCode}</span>
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {parseRecurringRuleSummary(rule.rrule, rule.nextRunAt, rule.timezone)}
                            </p>
                            <p className={dashboardMetaLineClass}>
                              <span>{getLocalizedFinanceSourceLabel("recurring_rule")}</span>
                              <span className="text-slate-300">|</span>
                              <span>
                                {rule.autoConfirm
                                  ? t("finance.recurring.autoConfirm")
                                  : t("finance.recurring.draftFirst")}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-sm text-slate-500">
                    {t("dashboard:finance.report.recurringDueSoonEmpty")}
                  </div>
                )}
              </DashboardCard>

              <AlertDialog
                open={pendingVoidTransactionId !== null}
                onOpenChange={(open) => {
                  if (!open) {
                    setPendingVoidTransactionId(null);
                    setPendingVoidReason("");
                  }
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ลบรายการที่ยืนยันแล้วใช่หรือไม่?</AlertDialogTitle>
                    <AlertDialogDescription>
                      ระบบจะลบรายการนี้ออกจากยอดคงเหลือและรายงานสรุป แต่ยังเก็บประวัติการตรวจสอบไว้
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {pendingVoidTransaction ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">
                        {getTransactionTypeLabel(pendingVoidTransaction.type)} · {formatMoneyMinor(pendingVoidTransaction.amountMinor, pendingVoidTransaction.currency)}
                      </div>
                      <div className="mt-1">
                        {getFinanceFlowLabel(pendingVoidTransaction.type, t)}: {getFinanceCounterpartyLabel(
                          pendingVoidTransaction.type,
                          pendingVoidTransaction.counterpartyName ?? null,
                          pendingVoidTransaction.merchantName ?? null,
                        )}
                      </div>
                      <div className="mt-1">{formatDateTime(pendingVoidTransaction.occurredAt)}</div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <label htmlFor="void-transaction-reason" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      เหตุผล (จำเป็น)
                    </label>
                    <Textarea
                      id="void-transaction-reason"
                      value={pendingVoidReason}
                      onChange={(event) => setPendingVoidReason(event.target.value)}
                      placeholder="เหตุผลสั้น ๆ เช่น สลิปซ้ำ"
                      className="bg-white"
                    />
                    <p className="text-xs text-slate-500">
                      ระบุเหตุผลสั้น ๆ สำหรับประวัติการตรวจสอบ อย่างน้อย 3 ตัวอักษร
                    </p>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>เก็บรายการไว้</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 text-white hover:bg-red-700"
                      disabled={!isPendingVoidReasonValid}
                      onClick={() => {
                        if (!conversationId || pendingVoidTransactionId === null || !isPendingVoidReasonValid) return;
                        storeActionReason("voidConfirmedTransaction", pendingVoidReasonTrimmed);
                        void voidTransactionMutation.mutateAsync({
                          conversationId,
                          transactionId: pendingVoidTransactionId,
                          reason: pendingVoidReasonTrimmed,
                        });
                      }}
                    >
                                    ลบ / โมฆะ
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          lockedState
        )}
      </DashboardCard>
    </div>
  );
}
