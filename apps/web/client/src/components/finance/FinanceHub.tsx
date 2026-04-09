import { useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, ReceiptText, Upload, CheckCircle2, ArrowDownRight, ArrowUpRight, Pause, Play, FileText, Wallet, Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { readFileAsBase64 } from "@/components/editor/uploadMedia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DashboardCard,
  DashboardKpiCard,
  dashboardCardDescriptionClass,
  dashboardMetaLineClass,
} from "@/components/dashboard";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

const DEFAULT_CURRENCY = "THB";

export interface FinanceHubProps {
  conversationId: number | null;
  compact?: boolean;
  className?: string;
  onCreatePersonalChat?: () => Promise<void> | void;
  onOpenFinancePanel?: () => void;
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

export function FinanceHub({
  conversationId,
  compact = false,
  className,
  onCreatePersonalChat,
  onOpenFinancePanel,
}: FinanceHubProps) {
  const { t } = useScopedTranslation("dashboard");
  const utils = trpc.useUtils();
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [draftText, setDraftText] = useState("");

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

  const parseTextMutation = trpc.finance.parseTextToDraft.useMutation({
    onSuccess: async () => {
      setDraftText("");
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
        utils.finance.listTransactions.invalidate({
          conversationId: conversationId ?? 0,
          status: "confirmed",
          limit: transactionLimit,
        }),
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
        utils.finance.listTransactions.invalidate({
          conversationId: conversationId ?? 0,
          status: "confirmed",
          limit: transactionLimit,
        }),
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
      utils.finance.listTransactions.invalidate({
        conversationId,
        status: "confirmed",
        limit: transactionLimit,
      }),
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

    await parseTextMutation.mutateAsync({
      conversationId,
      text: draftText.trim(),
    });
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

    await ingestDocumentMutation.mutateAsync({
      conversationId,
      libraryItemId,
      idempotencyKey: `finance-ocr:${conversationId}:${libraryItemId}`,
    });
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

  const openDrafts = draftsQuery.data ?? [];
  const recentTransactions = transactionsQuery.data ?? [];
  const recurringRules = recurringRulesQuery.data ?? [];

  return (
    <div className={cn("space-y-4", className)}>
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                    value={draftText}
                    onChange={(event) => setDraftText(event.target.value)}
                    placeholder={t("dashboard:finance.quick.textPlaceholder")}
                    className="min-h-[100px] bg-white"
                  />
                  <div className="flex flex-wrap items-center gap-2">
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
                    <Input
                      ref={receiptInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf"
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

            <div className={cn("grid gap-4", compact ? "lg:grid-cols-2" : "xl:grid-cols-3")}>
              <DashboardCard
                eyebrow={t("dashboard:finance.drafts.title")}
                title={t("dashboard:finance.drafts.title")}
                description={t("dashboard:finance.drafts.empty")}
              >
                {openDrafts.length > 0 ? (
                  <div className="space-y-3">
                    {openDrafts.map((draft) => (
                      <div key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {getTransactionTypeLabel(draft.type)}
                              <span className="ml-2 text-xs text-slate-500">
                                {formatMoneyMinor(draft.amountMinor, draft.currency)}
                              </span>
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              {draft.merchantName ?? t("dashboard:finance.drafts.empty")}
                            </p>
                            <p className={dashboardMetaLineClass}>
                              <span>{draft.categoryCode}</span>
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
                              onClick={() => {
                                if (!conversationId) return;
                                confirmDraftMutation.mutate({
                                  conversationId,
                                  draftId: draft.id,
                                });
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
                    ))}
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
                            </p>
                          </div>
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
            </div>
          </div>
        ) : (
          lockedState
        )}
      </DashboardCard>
    </div>
  );
}
