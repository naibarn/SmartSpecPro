import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, ReceiptText, Upload, CheckCircle2, ArrowDownRight, ArrowUpRight, Pause, Play, FileText, Wallet, Sparkles, Search, Mic, MicOff } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { readFileAsBase64 } from "@/components/editor/uploadMedia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  merchantName?: string | null;
  note?: string | null;
  occurredAt?: string;
};

function getDraftPayload(draft: { payloadJson?: Record<string, unknown> | null }): FinanceDraftPayload {
  return (draft.payloadJson ?? {}) as FinanceDraftPayload;
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
  const utils = trpc.useUtils();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [draftText, setDraftText] = useState("");
  const [draftCategoryHint, setDraftCategoryHint] = useState("");
  const [draftTypeHint, setDraftTypeHint] = useState<"auto" | "income" | "expense" | "transfer">("auto");
  const [selectedEvidenceTransactionId, setSelectedEvidenceTransactionId] = useState<number | null>(null);
  const [evidenceSearchText, setEvidenceSearchText] = useState("");

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
      setDraftTypeHint("auto");
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("Finance draft created");
    },
    onError: (error) => toast.error(error.message || "Failed to create finance draft"),
  });

  const confirmDraftMutation = trpc.finance.confirmDraft.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.finance.listDrafts.invalidate({ conversationId: conversationId ?? 0, limit: draftLimit }),
        invalidateMonthlyConfirmedTransactions(),
        utils.finance.getDailySummary.invalidate({ conversationId: conversationId ?? 0 }),
        utils.finance.getMonthlySummary.invalidate({ conversationId: conversationId ?? 0 }),
      ]);
      toast.success("Draft confirmed");
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

  const handleParseText = async () => {
    if (!conversationId || !draftText.trim()) {
      return;
    }

    const draft = await parseTextMutation.mutateAsync({
      conversationId,
      text: draftText.trim(),
      categoryHint: draftCategoryHint.trim() || null,
      typeHint: draftTypeHint === "auto" ? null : draftTypeHint,
    });
    const draftPayload = getDraftPayload(draft);
    if (onMirrorFinanceActivity) {
      try {
        await onMirrorFinanceActivity({
          content: `Created a finance draft from chat text: ${draftPayload.merchantName ?? draftPayload.categoryCode ?? "draft"}`,
          artifacts: [
            {
              id: `finance-draft-${draft.id}`,
              type: "table",
              title: "Finance draft",
              content: [
                `Type: ${getTransactionTypeLabel(draft.type)}`,
                `Amount: ${formatMoneyMinor(draftPayload.amountMinor, draftPayload.currency)}`,
                `Category: ${draftPayload.categoryCode ?? "uncategorized"}`,
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
      idempotencyKey: `finance-ocr:${conversationId}:${libraryItemId}`,
    });
    const draft = (result as { draft?: { id: number; type: string; source?: string; status?: string; confidence?: string | number | null; payloadJson: Record<string, unknown> } | null } | null)?.draft;
    if (draft && onMirrorFinanceActivity) {
      const draftPayload = getDraftPayload(draft);
      try {
        await onMirrorFinanceActivity({
          content: `Receipt OCR created a ${draft.type} draft for ${draftPayload.merchantName ?? draftPayload.categoryCode ?? "draft"}.`,
          artifacts: [
            {
              id: `finance-ocr-${libraryItemId}`,
              type: "table",
              title: "OCR receipt",
              content: [
                `Receipt: ${file.name}`,
                `Draft type: ${getTransactionTypeLabel(draft.type)}`,
                `Amount: ${formatMoneyMinor(draftPayload.amountMinor, draftPayload.currency)}`,
                `Category: ${draftPayload.categoryCode ?? "uncategorized"}`,
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      className="gap-2"
                      onClick={() => {
                        setDraftText((current) => current.trim() ? current : "Expense: ");
                        draftTextareaRef.current?.focus();
                      }}
                    >
                      <ArrowDownRight className="h-4 w-4" />
                      {t("dashboard:finance.quick.addExpense")}
                    </Button>
                    <Button
                      variant="secondary"
                      className="gap-2"
                      onClick={() => {
                        setDraftText((current) => current.trim() ? current : "Income: ");
                        draftTextareaRef.current?.focus();
                      }}
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      {t("dashboard:finance.quick.addIncome")}
                    </Button>
                    <Button
                      className="gap-2"
                      onClick={() => void handleParseText()}
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
                                {payload.merchantName ?? t("dashboard:finance.drafts.empty")}
                              </p>
                              <p className={dashboardMetaLineClass}>
                                <span>{payload.categoryCode ?? "uncategorized"}</span>
                                <span className="text-slate-300">|</span>
                                <span>{getFinanceSourceLabel(draft.source)}</span>
                                <span className="text-slate-300">|</span>
                                <span>{formatDateTime(draft.createdAt)}</span>
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
                    {recentTransactions.map((transaction) => (
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
                              {transaction.merchantName ?? transaction.categoryCode}
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
                    ))}
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
                                <span>{rule.merchantName ?? t("dashboard:finance.recurring.title")}</span>
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
