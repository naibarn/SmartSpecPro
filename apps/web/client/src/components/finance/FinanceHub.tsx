import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, ReceiptText, Upload, CheckCircle2, ArrowDownRight, ArrowUpRight, Pause, Play, FileText, Wallet, Sparkles, Search, Mic, MicOff, RotateCcw } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { readFileAsBase64 } from "@/components/editor/uploadMedia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinanceCounterpartyAutocomplete } from "@/components/finance/FinanceCounterpartyAutocomplete";
import {
  DashboardCard,
  DashboardKpiCard,
  dashboardCardDescriptionClass,
  dashboardMetaLineClass,
} from "@/components/dashboard";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { usePushToTalk } from "@/hooks/usePushToTalk";

const DEFAULT_CURRENCY = "THB";

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
      return "Income";
    case "expense":
      return "Expense";
    case "transfer":
      return "Transfer";
    default:
      return type;
  }
}

function getFinanceSourceLabel(source: string): string {
  switch (source) {
    case "ocr_document":
      return "OCR receipt";
    case "chat_text":
      return "Chat draft";
    case "recurring_rule":
      return "Recurring rule";
    case "api":
      return "API";
    case "import":
      return "Import";
    default:
      return source;
  }
}

type FinanceDraftPayload = {
  amountMinor?: number;
  currency?: string;
  categoryCode?: string;
  counterpartyId?: number | null;
  counterpartyName?: string | null;
  merchantName?: string | null;
  note?: string | null;
  occurredAt?: string;
};

type DraftEditState = {
  date: string;
  time: string;
  counterpartyName: string;
  status: QuickActionStatus;
};

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
      return "Unspecified payer";
    case "expense":
      return "Unspecified payee";
    default:
      return "Unspecified counterparty";
  }
}

function getFinanceFlowLabel(type: "income" | "expense" | "transfer", t: (key: string, fallback?: string) => string): string {
  switch (type) {
    case "income":
      return t("dashboard:finance.labels.receivedFrom", "Received from");
    case "expense":
      return t("dashboard:finance.labels.paidTo", "Paid to");
    default:
      return t("dashboard:finance.labels.transferWith", "Transfer with");
  }
}

const QUICK_DRAFT_INTENT_PREFIX = /^\s*(?:Expense|Income|Transfer):\s*/i;

type QuickActionStatus =
  | { kind: "idle"; message: null }
  | { kind: "saving"; message: string }
  | { kind: "saved"; message: string }
  | { kind: "draft"; message: string }
  | { kind: "error"; message: string };

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
  const [selectedEvidenceTransactionId, setSelectedEvidenceTransactionId] = useState<number | null>(null);
  const [evidenceSearchText, setEvidenceSearchText] = useState("");
  const quickActionModeRef = useRef<"manual" | "quick" | null>(null);
  const deferredCounterpartySearch = useDeferredValue(draftCounterpartyName.trim());

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

  const invalidateMonthlyConfirmedTransactions = async () => {
    if (!conversationId || !monthlySummaryQuery.data?.rangeStart || !monthlySummaryQuery.data?.rangeEnd) {
      return;
    }

    await utils.finance.listTransactions.invalidate({
      conversationId,
      status: "confirmed",
      fromDate: new Date(monthlySummaryQuery.data.rangeStart),
      toDate: new Date(monthlySummaryQuery.data.rangeEnd),
      limit: compact ? 25 : 100,
    });
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
    onError: (error) => toast.error(error.message || "Failed to create finance draft"),
  });

  const updateDraftMutation = trpc.finance.updateDraft.useMutation({
    onSuccess: async () => {
      await utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit });
    },
    onError: (error) => toast.error(error.message || "Failed to update draft"),
  });

  const confirmDraftMutation = trpc.finance.confirmDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        invalidateMonthlyConfirmedTransactions(),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      if (quickActionModeRef.current !== "quick") {
        toast.success("Draft confirmed");
      }
    },
    onError: (error) => toast.error(error.message || "Failed to confirm draft"),
  });

  const voidTransactionMutation = trpc.finance.voidTransaction.useMutation({
    onSuccess: async () => {
      await Promise.all([
        invalidateMonthlyConfirmedTransactions(),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("Transaction voided");
    },
    onError: (error) => toast.error(error.message || "Failed to void transaction"),
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
    onError: (error) => toast.error(error.message || "Failed to pause rule"),
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
    onError: (error) => toast.error(error.message || "Failed to resume rule"),
  });

  const uploadFileMutation = trpc.library.uploadFile.useMutation();
  const ingestDocumentMutation = trpc.finance.ingestFinanceDocument.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("Receipt queued for OCR");
    },
    onError: (error) => toast.error(error.message || "Failed to queue receipt OCR"),
  });

  const refreshFinance = async () => {
    if (!conversationId) {
      return;
    }

    await Promise.all([
      utils.finance.listDrafts.invalidate({ conversationId, limit: draftLimit }),
      invalidateMonthlyConfirmedTransactions(),
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
      ? t("dashboard:finance.quick.expenseSeed", "Expense: ")
      : t("dashboard:finance.quick.incomeSeed", "Income: ");

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

  const handleParseText = async () => {
    if (!conversationId || !draftText.trim()) {
      return;
    }

    const occurredAt = buildDraftOccurredAtIso(draftDate, draftTime);
    if (!occurredAt) {
      toast.error(t("dashboard:finance.quick.statusInvalidDateTime", "Please choose a valid date and time."));
      return;
    }

    quickActionModeRef.current = "manual";
    try {
      const draft = await parseTextMutation.mutateAsync({
        conversationId,
        text: draftText.trim(),
        categoryHint: draftCategoryHint.trim() || null,
        counterpartyName: draftCounterpartyName.trim() || null,
        typeHint: draftTypeHint === "auto" ? null : draftTypeHint,
        occurredAt,
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
            content: `Created a finance draft from chat text: ${counterpartyLabel} · occurred ${formatDateTime(draftPayload.occurredAt)}`,
            artifacts: [
              {
                id: `finance-draft-${draft.id}`,
                type: "table",
                title: "Finance draft",
                content: [
                  `Type: ${getTransactionTypeLabel(draft.type)}`,
                  `Amount: ${formatMoneyMinor(draftPayload.amountMinor, draftPayload.currency)}`,
                  `Counterparty: ${counterpartyLabel}`,
                  `Category: ${draftPayload.categoryCode ?? "uncategorized"}`,
                  `Occurred: ${formatDateTime(draftPayload.occurredAt)}`,
                  `Source: ${getFinanceSourceLabel(draft.source)}`,
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
          "Type a note first, then click the quick action again to save it.",
        ),
      });
      return;
    }

    quickActionModeRef.current = "quick";
    setQuickActionStatus({
      kind: "saving",
      message: t("dashboard:finance.quick.statusSaving", "Processing and saving now..."),
    });

    const occurredAt = buildDraftOccurredAtIso(draftDate, draftTime);
    if (!occurredAt) {
      setQuickActionStatus({
        kind: "error",
        message: t("dashboard:finance.quick.statusInvalidDateTime", "Please choose a valid date and time."),
      });
      quickActionModeRef.current = null;
      return;
    }

    try {
      const draft = await parseTextMutation.mutateAsync({
        conversationId,
        text: preparedText.trim(),
        categoryHint: draftCategoryHint.trim() || null,
        counterpartyName: draftCounterpartyName.trim() || null,
        typeHint: nextType,
        occurredAt,
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
            "Saved as draft because a few details still need review.",
          ),
        });
        toast.info(
          t(
            "dashboard:finance.quick.statusDraftToast",
            "Saved as draft and ready for review",
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
          "Saved to your finance log and updated the summary above.",
        ),
      });

      if (onMirrorFinanceActivity) {
        try {
          await onMirrorFinanceActivity({
            content: `Saved a ${draft.type} transaction from quick capture: ${counterpartyLabel} · occurred ${formatDateTime(draftPayload.occurredAt)}.`,
            artifacts: [
              {
                id: `finance-transaction-${draft.id}`,
                type: "table",
                title: "Finance transaction",
                content: [
                  `Type: ${getTransactionTypeLabel(draft.type)}`,
                  `Amount: ${formatMoneyMinor(draftPayload.amountMinor, draftPayload.currency)}`,
                  `Counterparty: ${counterpartyLabel}`,
                  `Category: ${draftPayload.categoryCode ?? "uncategorized"}`,
                  `Occurred: ${formatDateTime(draftPayload.occurredAt)}`,
                  `Status: confirmed`,
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
          "Saved and updated the summary",
        ),
      );
      await refreshFinance();
    } catch (error) {
      setQuickActionStatus({
        kind: "error",
        message: error instanceof Error ? error.message : t("dashboard:finance.quick.statusError", "Could not save the finance entry."),
      });
      toast.error(error instanceof Error ? error.message : t("dashboard:finance.quick.statusError", "Could not save the finance entry."));
    } finally {
      quickActionModeRef.current = null;
    }
  };

  const handleReceiptUpload = async (file: File) => {
    if (!conversationId || !financeReady) {
      return;
    }

    const fileBase64 = await readFileAsBase64(file);
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
      },
    } as any);

    const uploadedItem = (uploadResult as any)?.item ?? uploadResult;
    const libraryItemId = Number(uploadedItem?.id);
    if (!Number.isFinite(libraryItemId) || libraryItemId <= 0) {
      throw new Error("Upload response missing library item id");
    }

    const result = await ingestDocumentMutation.mutateAsync({
      conversationId,
      libraryItemId,
      counterpartyName: draftCounterpartyName.trim() || null,
      idempotencyKey: `finance-ocr:${conversationId}:${libraryItemId}`,
    });
    const draft = (result as { draft?: { id: number; type: string; source?: string; status?: string; confidence?: string | number | null; payloadJson: Record<string, unknown> } | null } | null)?.draft;
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

    const next = getCurrentDraftDateTime();
    setDraftDate(next.date);
    setDraftTime(next.time);
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
  const recentTransactions = transactionsQuery.data ?? [];
  const recurringRules = recurringRulesQuery.data ?? [];
  const monthlyTransactions = monthlyTransactionsQuery.data ?? [];
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
  const activeEvidenceTransaction = useMemo(
    () => recentTransactions.find((transaction) => transaction.id === selectedEvidenceTransactionId) ?? recentTransactions[0] ?? null,
    [recentTransactions, selectedEvidenceTransactionId],
  );
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
                        "Custom category hint, e.g. taxi / coffee / rent",
                      )}
                      className="bg-white"
                    />
                    <FinanceCounterpartyAutocomplete
                      value={draftCounterpartyName}
                      placeholder={t(
                        "dashboard:finance.quick.counterpartyPlaceholder",
                        "Counterparty / payee / payer, e.g. Starbucks or ACME",
                      )}
                      onValueChange={setDraftCounterpartyName}
                      items={counterpartiesQuery.data ?? []}
                      helperText={t(
                        "dashboard:finance.quick.counterpartyHelper",
                        "Pick a canonical name from the dropdown to avoid duplicate spellings later.",
                      )}
                      className="bg-white"
                      inputClassName="bg-white"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={draftTypeHint}
                      onValueChange={(value) => setDraftTypeHint(value as typeof draftTypeHint)}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder={t("dashboard:finance.quick.intentLabel", "Intent")} />
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
                      {t("dashboard:finance.quick.intentLabel", "Intent")}: {activeDraftIntentLabel}
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
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => receiptInputRef.current?.click()}
                      disabled={uploadFileMutation.isPending || ingestDocumentMutation.isPending}
                    >
                      {uploadFileMutation.isPending || ingestDocumentMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {t("dashboard:finance.quick.upload")}
                    </Button>
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
                            ? t("dashboard:finance.quick.statusSavedLabel", "Saved")
                            : quickActionStatus.kind === "draft"
                              ? t("dashboard:finance.quick.statusDraftLabel", "Draft")
                              : t("dashboard:finance.quick.statusErrorLabel", "Error")}
                      </Badge>
                      <span>{quickActionStatus.message}</span>
                    </div>
                  ) : null}
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
                          toast.error(error instanceof Error ? error.message : "Failed to process receipt");
                        }
                      }}
                    />
                </div>
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
                            </div>
                          </div>
                          {draft.needsClarification ? (
                            <p className="mt-2 text-xs font-medium text-amber-700">
                              {t("dashboard:finance.labels.needsAttention")}
                            </p>
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
                                    "Adjust the OCR date, time, or counterparty before confirming this draft.",
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
                                  ? t("dashboard:finance.quick.statusSavingLabel", "Saving")
                                  : draftEditStatus.kind === "saved"
                                    ? t("dashboard:finance.quick.statusSavedLabel", "Saved")
                                    : draftEditStatus.kind === "error"
                                      ? t("dashboard:finance.quick.statusErrorLabel", "Error")
                                      : t("dashboard:finance.quick.statusDraftLabel", "Draft")}
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label className="space-y-1.5 sm:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {t("dashboard:finance.drafts.editCounterpartyLabel", "Counterparty")}
                                </span>
                                <Input
                                  aria-label={t("dashboard:finance.drafts.editCounterpartyLabel", "Counterparty")}
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
                                    "Who was paid or who paid you?",
                                  )}
                                  className="bg-white"
                                />
                              </label>
                              <label className="space-y-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {t("dashboard:finance.drafts.editDateLabel", "Date")}
                                </span>
                                <Input
                                  aria-label={t("dashboard:finance.drafts.editDateLabel", "Date")}
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
                                  {t("dashboard:finance.drafts.editTimeLabel", "Time")}
                                </span>
                                <Input
                                  aria-label={t("dashboard:finance.drafts.editTimeLabel", "Time")}
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
                                {t("dashboard:finance.drafts.resetToOriginal", "Reset")}
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
                                {t("dashboard:finance.drafts.saveEdit", "Save date/time")}
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
                                      ? t("dashboard:finance.quick.statusSavedLabel", "Saved")
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
                      const transactionCounterparty = getFinanceCounterpartyLabel(
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
                                {getTransactionTypeLabel(transaction.type)}
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
                                <span>{getFinanceSourceLabel(transaction.source)}</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-slate-600"
                                onClick={() => setSelectedEvidenceTransactionId(transaction.id)}
                              >
                                <Search className="h-3.5 w-3.5" />
                                {t("dashboard:finance.report.inspect")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-slate-600"
                                onClick={() => {
                                  if (!conversationId) return;
                                  void voidTransactionMutation.mutateAsync({
                                    conversationId,
                                    transactionId: transaction.id,
                                  });
                                }}
                                disabled={!financeReady || voidTransactionMutation.isPending}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {t("dashboard:finance.actions.void")}
                              </Button>
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
                eyebrow={t("dashboard:finance.recurring.title")}
                title={t("dashboard:finance.recurring.title")}
                description={t("dashboard:finance.recurring.empty")}
              >
                {recurringRules.length > 0 ? (
                  <div className="space-y-3">
                      {recurringRules.map((rule) => {
                      const isActive = rule.status === "active";
                      const ruleCounterparty = getFinanceCounterpartyLabel(
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
                                <span>{rule.autoConfirm ? "Auto-confirm" : "Draft first"}</span>
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
                                {category.expenseMinor > 0 ? `Expense ${formatMoneyMinor(category.expenseMinor)}` : ""}
                                {category.expenseMinor > 0 && category.incomeMinor > 0 ? " · " : ""}
                                {category.incomeMinor > 0 ? `Income ${formatMoneyMinor(category.incomeMinor)}` : ""}
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
                            {link.libraryItem?.title ?? `Document ${link.libraryItemId}`}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {link.role}
                            {link.note ? ` · ${link.note}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {link.libraryItem?.source ?? "library"}
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
                              <span>{getFinanceSourceLabel("recurring_rule")}</span>
                              <span className="text-slate-300">|</span>
                              <span>{rule.autoConfirm ? "Auto-confirm" : "Draft first"}</span>
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
            </div>
          </div>
        ) : (
          lockedState
        )}
      </DashboardCard>
    </div>
  );
}
