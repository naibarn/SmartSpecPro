import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { motion } from "framer-motion";
import {
  BarChart3,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  Download,
  Filter,
  Loader2,
  MessageSquare,
  ReceiptText,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpButton } from "@/components/help";
import { LocaleToggle } from "@/components/LocaleToggle";
import { DashboardCard, DashboardKpiCard, dashboardCardDescriptionClass, dashboardMetaLineClass } from "@/components/dashboard";
import FinanceAccessGate from "@/components/finance/FinanceAccessGate";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { cn } from "@/lib/utils";

function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function toExclusiveDate(dateString: string): Date {
  return addDays(new Date(`${dateString}T00:00:00`), 1);
}

function formatMoneyMinor(amountMinor: number | null | undefined, currency = "THB"): string {
  const amount = Number.isFinite(Number(amountMinor)) ? Number(amountMinor) / 100 : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

type DraftPayload = {
  amountMinor?: number;
  currency?: string;
  categoryCode?: string;
  merchantName?: string | null;
  note?: string | null;
  occurredAt?: string;
};

function getDraftPayload(draft: { payloadJson?: Record<string, unknown> | null }): DraftPayload {
  return (draft.payloadJson ?? {}) as DraftPayload;
}

function escapeMarkdownCell(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n+/g, " ")
    .trim();
}

function buildMarkdownTable(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const headerRow = `| ${headers.map(escapeMarkdownCell).join(" | ")} |`;
  const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
  const bodyRows = rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`);
  return [headerRow, dividerRow, ...bodyRows].join("\n");
}

function downloadServerArtifact(artifact: { fileName: string; mimeType: string; dataBase64: string }): void {
  const binary = atob(artifact.dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatDateLabel(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, "MMM d");
}

function resolveConversationId(search: string, fallbackId: number | null): number | null {
  const params = new URLSearchParams(search);
  const raw = params.get("c");
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackId;
}

export default function FinanceReportsPage() {
  const { t } = useScopedTranslation(["dashboard", "common", "nav"]);
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [transactionType, setTransactionType] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [categoryCode, setCategoryCode] = useState("");
  const [merchant, setMerchant] = useState("");
  const [dateFrom, setDateFrom] = useState(() => toDateInputValue(startOfMonth(new Date())));
  const [dateTo, setDateTo] = useState(() => toDateInputValue(endOfMonth(new Date())));
  const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null);
  const [evidenceQuery, setEvidenceQuery] = useState("");

  const personalConversationQuery = trpc.chat.getPersonalConversation.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createPersonalConversationMutation = trpc.chat.createPersonalConversation.useMutation({
    onSuccess: (conversation) => {
      setLocation(`/finance/reports?c=${conversation.id}`);
    },
  });

  const conversationId = useMemo(
    () => resolveConversationId(search, personalConversationQuery.data?.id ?? null),
    [personalConversationQuery.data?.id, search],
  );

  const transactionFilters = useMemo(
    () => ({
      conversationId: conversationId ?? 0,
      status: "confirmed" as const,
      type: transactionType === "all" ? undefined : transactionType,
      categoryCode: categoryCode.trim() || undefined,
      merchant: merchant.trim() || undefined,
      fromDate: new Date(`${dateFrom}T00:00:00`),
      toDate: toExclusiveDate(dateTo),
      limit: 100,
      offset: 0,
    }),
    [categoryCode, conversationId, dateFrom, dateTo, merchant, transactionType],
  );

  const dailySummaryQuery = trpc.finance.getDailySummary.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: Boolean(conversationId) },
  );
  const monthlySummaryQuery = trpc.finance.getMonthlySummary.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: Boolean(conversationId) },
  );
  const draftsQuery = trpc.finance.listDrafts.useQuery(
    { conversationId: conversationId ?? 0, limit: 10 },
    { enabled: Boolean(conversationId) },
  );
  const recurringRulesQuery = trpc.finance.listRecurringRules.useQuery(
    { conversationId: conversationId ?? 0, status: "active", limit: 10 },
    { enabled: Boolean(conversationId) },
  );
  const transactionsQuery = trpc.finance.listTransactions.useQuery(transactionFilters, {
    enabled: Boolean(conversationId),
  });
  const selectedTransaction = transactionsQuery.data?.find((transaction) => transaction.id === selectedTransactionId)
    ?? transactionsQuery.data?.[0]
    ?? null;
  const linkedDocumentsQuery = trpc.finance.listLinkedDocuments.useQuery(
    {
      conversationId: conversationId ?? 0,
      transactionId: selectedTransaction?.id ?? 0,
    },
    {
      enabled: Boolean(conversationId && selectedTransaction?.id),
    },
  );
  const evidenceQueryResult = trpc.finance.searchFinanceEvidence.useQuery(
    {
      conversationId: conversationId ?? 0,
      transactionId: selectedTransaction?.id ?? undefined,
      query: evidenceQuery.trim() || undefined,
      limit: 8,
    },
    {
      enabled: Boolean(conversationId && selectedTransaction?.id),
    },
  );

  useEffect(() => {
    if (!selectedTransactionId && transactionsQuery.data?.length) {
      setSelectedTransactionId(transactionsQuery.data[0].id);
    }
  }, [selectedTransactionId, transactionsQuery.data]);

  const categoryBreakdown = useMemo(() => {
    const buckets = new Map<string, { categoryCode: string; count: number; totalMinor: number; incomeMinor: number; expenseMinor: number }>();
    for (const tx of transactionsQuery.data ?? []) {
      const category = tx.categoryCode || "uncategorized";
      const bucket = buckets.get(category) ?? { categoryCode: category, count: 0, totalMinor: 0, incomeMinor: 0, expenseMinor: 0 };
      bucket.count += 1;
      bucket.totalMinor += tx.amountMinor;
      if (tx.type === "income") bucket.incomeMinor += tx.amountMinor;
      if (tx.type === "expense") bucket.expenseMinor += tx.amountMinor;
      buckets.set(category, bucket);
    }
    return Array.from(buckets.values()).sort((a, b) => b.totalMinor - a.totalMinor);
  }, [transactionsQuery.data]);

  const dailySeries = useMemo(() => {
    const buckets = new Map<string, { date: string; incomeMinor: number; expenseMinor: number; transferMinor: number; balanceMinor: number; count: number }>();
    for (const tx of transactionsQuery.data ?? []) {
      const key = format(new Date(tx.occurredAt), "yyyy-MM-dd");
      const bucket = buckets.get(key) ?? { date: key, incomeMinor: 0, expenseMinor: 0, transferMinor: 0, balanceMinor: 0, count: 0 };
      bucket.count += 1;
      if (tx.type === "income") {
        bucket.incomeMinor += tx.amountMinor;
        bucket.balanceMinor += tx.amountMinor;
      } else if (tx.type === "expense") {
        bucket.expenseMinor += tx.amountMinor;
        bucket.balanceMinor -= tx.amountMinor;
      } else {
        bucket.transferMinor += tx.amountMinor;
      }
      buckets.set(key, bucket);
    }
    return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [transactionsQuery.data]);

  const merchantBreakdown = useMemo(() => {
    const buckets = new Map<string, { merchantName: string; count: number; totalMinor: number }>();
    for (const tx of transactionsQuery.data ?? []) {
      const name = tx.merchantName?.trim() || "Unspecified";
      const bucket = buckets.get(name) ?? { merchantName: name, count: 0, totalMinor: 0 };
      bucket.count += 1;
      bucket.totalMinor += tx.amountMinor;
      buckets.set(name, bucket);
    }
    return Array.from(buckets.values()).sort((a, b) => b.totalMinor - a.totalMinor).slice(0, 8);
  }, [transactionsQuery.data]);

  const exportReportPdfMutation = trpc.finance.exportReportPdf.useMutation();

  const reportMarkdown = useMemo(() => {
    const title = t("dashboard:finance.report.pageTitle", "Finance reports");
    const summaryRows = [
      [t("dashboard:finance.summary.todayIncome"), formatMoneyMinor(dailySummaryQuery.data?.incomeMinor ?? 0)],
      [t("dashboard:finance.summary.todayExpense"), formatMoneyMinor(dailySummaryQuery.data?.expenseMinor ?? 0)],
      [t("dashboard:finance.summary.monthBalance"), formatMoneyMinor(monthlySummaryQuery.data?.balanceMinor ?? 0)],
      [t("dashboard:finance.summary.openDrafts"), String(draftsQuery.data?.length ?? 0)],
    ];

    const filterRows = [
      ["Conversation", conversationId ? String(conversationId) : "—"],
      ["Type", transactionType],
      ["Category", categoryCode.trim() || "—"],
      ["Merchant", merchant.trim() || "—"],
      ["Date from", dateFrom],
      ["Date to", dateTo],
    ];

    const transactionRows = (transactionsQuery.data ?? []).slice(0, 100).map((transaction) => [
      formatDateLabel(transaction.occurredAt),
      transaction.type,
      transaction.merchantName ?? transaction.categoryCode,
      transaction.categoryCode,
      formatMoneyMinor(transaction.amountMinor, transaction.currency),
      transaction.source,
      transaction.status,
    ]);

    const categoryRows = categoryBreakdown.map((entry) => [
      entry.categoryCode,
      String(entry.count),
      formatMoneyMinor(entry.totalMinor),
    ]);

    const draftRows = (draftsQuery.data ?? []).map((draft) => {
      const payload = getDraftPayload(draft);
      return [
        payload.merchantName ?? payload.categoryCode ?? "Draft",
        draft.type,
        payload.categoryCode ?? "uncategorized",
        formatMoneyMinor(payload.amountMinor, payload.currency),
        draft.source,
        draft.status,
        formatDateLabel(draft.createdAt),
      ];
    });

    const recurringRows = (recurringRulesQuery.data ?? []).map((rule) => [
      rule.merchantName ?? rule.categoryCode,
      formatMoneyMinor(rule.amountMinor, rule.currency),
      rule.categoryCode,
      rule.status,
      rule.autoConfirm ? "Auto-confirm" : "Draft first",
      rule.nextRunAt ? formatDateLabel(rule.nextRunAt) : "—",
    ]);

    const evidenceRows = [
      ...(linkedDocumentsQuery.data ?? []).map((link) => [
        link.libraryItem?.title ?? `Document ${link.libraryItemId}`,
        link.role,
        link.note ?? "—",
      ]),
      ...(evidenceQueryResult.data?.linkedDocuments ?? []).map((link) => [
        link.libraryItem?.title ?? `Document ${link.libraryItemId}`,
        link.role,
        link.note ?? "—",
      ]),
    ];

    const lines: string[] = [
      `# ${escapeMarkdownCell(title)}`,
      "",
      escapeMarkdownCell(
        t(
          "dashboard:finance.report.pageDescription",
          "Inspect daily and monthly trends, compare categories, and drill into receipts and evidence links in one place.",
        ),
      ),
      "",
      "## Summary",
      buildMarkdownTable(["Metric", "Value"], summaryRows),
      "",
      "## Filters",
      buildMarkdownTable(["Filter", "Value"], filterRows),
      "",
      "## Cashflow",
      buildMarkdownTable(
        ["Date", "Income", "Expense"],
        dailySeries.map((entry) => [
          formatDateLabel(entry.date),
          formatMoneyMinor(entry.incomeMinor),
          formatMoneyMinor(entry.expenseMinor),
        ]),
      ),
      "",
      "## Categories",
      buildMarkdownTable(["Category", "Count", "Total"], categoryRows),
    ];

    if (transactionRows.length > 0) {
      lines.push(
        "",
        "## Transactions",
        buildMarkdownTable(
          ["Date", "Type", "Merchant", "Category", "Amount", "Source", "Status"],
          transactionRows,
        ),
      );
    }

    if (draftRows.length > 0) {
      lines.push(
        "",
        "## Drafts",
        buildMarkdownTable(
          ["Merchant", "Type", "Category", "Amount", "Source", "Status", "Created"],
          draftRows,
        ),
      );
    }

    if (recurringRows.length > 0) {
      lines.push(
        "",
        "## Recurring",
        buildMarkdownTable(
          ["Merchant", "Amount", "Category", "Status", "Auto", "Next run"],
          recurringRows,
        ),
      );
    }

    if (evidenceRows.length > 0) {
      lines.push(
        "",
        "## Evidence",
        buildMarkdownTable(["Title", "Role", "Note"], evidenceRows),
      );
    }

    if (selectedTransaction) {
      lines.push(
        "",
        "## Selected transaction",
        buildMarkdownTable(
          ["Field", "Value"],
          [
            ["Merchant", selectedTransaction.merchantName ?? selectedTransaction.categoryCode],
            ["Type", selectedTransaction.type],
            ["Category", selectedTransaction.categoryCode],
            ["Amount", formatMoneyMinor(selectedTransaction.amountMinor, selectedTransaction.currency)],
            ["Source", selectedTransaction.source],
            ["Status", selectedTransaction.status],
            ["Occurred", formatDateLabel(selectedTransaction.occurredAt)],
          ],
        ),
      );
    }

    return lines.join("\n");
  }, [
    categoryBreakdown,
    categoryCode,
    dailySeries,
    dateFrom,
    dateTo,
    dailySummaryQuery.data?.expenseMinor,
    dailySummaryQuery.data?.incomeMinor,
    draftsQuery.data,
    evidenceQueryResult.data?.linkedDocuments,
    linkedDocumentsQuery.data,
    merchant,
    monthlySummaryQuery.data?.balanceMinor,
    recurringRulesQuery.data,
    selectedTransaction,
    t,
    transactionType,
    transactionsQuery.data,
    conversationId,
  ]);

  const handleCreatePersonalChat = async () => {
    await createPersonalConversationMutation.mutateAsync({
      title: t("dashboard:finance.title"),
    });
  };

  const handleExportPdf = async () => {
    if (!conversationId) {
      return;
    }

    try {
      const artifact = await exportReportPdfMutation.mutateAsync({
        conversationId,
        title: t("dashboard:finance.report.pageTitle", "Finance reports"),
        markdown: reportMarkdown,
      });
      downloadServerArtifact(artifact);
      toast.success(t("dashboard:finance.report.exportReady", "PDF download started"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dashboard:finance.report.exportFailed", "Failed to export PDF"));
    }
  };

  if (!conversationId && personalConversationQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef2ff_100%)] px-4 py-8 md:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                <Wallet className="mr-1 h-3.5 w-3.5" />
                {t("dashboard:finance.eyebrow")}
              </Badge>
              <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                {t("dashboard:finance.report.title")}
              </Badge>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              {t("dashboard:finance.report.pageTitle", "Finance reports")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              {t(
                "dashboard:finance.report.pageDescription",
                "Create a personal finance chat first to unlock detailed charts, drill-downs, and exportable monthly reports."
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button className="gap-2" onClick={() => void handleCreatePersonalChat()}>
                <Sparkles className="h-4 w-4" />
                {t("dashboard:finance.locked.createPersonal")}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setLocation("/finance")}>
                <ReceiptText className="h-4 w-4" />
                {t("dashboard:finance.page.backToFinance", "Open finance workspace")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.10),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f7fafc_45%,_#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-4 md:px-6 md:py-6">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-[28px] border border-white/70 bg-white/85 px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl print:hidden"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-sky-100 px-3 py-1 text-sky-800 hover:bg-sky-100">
                  <BarChart3 className="mr-1 h-3.5 w-3.5" />
                  {t("dashboard:finance.report.title")}
                </Badge>
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                  <Filter className="mr-1 h-3.5 w-3.5" />
                  {t("dashboard:finance.report.filterBadge", "Drill-down + filters")}
                </Badge>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                {t("dashboard:finance.report.pageTitle", "Finance reports")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                {t(
                  "dashboard:finance.report.pageDescription",
                  "Inspect daily and monthly trends, compare categories, and drill into receipts and evidence links in one place."
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <LocaleToggle className="hidden sm:inline-flex" />
              <HelpButton page="/finance/reports" variant="outline" size="sm" />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setLocation("/finance")}>
                <Wallet className="h-4 w-4" />
                {t("dashboard:finance.page.backToFinance", "Finance workspace")}
              </Button>
              <Button variant="ghost" size="sm" className="gap-2" onClick={() => setLocation("/chat?panel=finance")}>
                <MessageSquare className="h-4 w-4" />
                {t("dashboard:finance.page.backToChat", "Open chat")}
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-slate-950 text-white hover:bg-slate-900"
                onClick={() => void handleExportPdf()}
                disabled={exportReportPdfMutation.isPending}
              >
                {exportReportPdfMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t("dashboard:finance.report.exportPdf", "Export PDF")}
              </Button>
            </div>
          </div>
        </motion.header>

        <FinanceAccessGate className="flex-1">
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.86fr)]"
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DashboardKpiCard
                  label={t("dashboard:finance.summary.todayIncome")}
                  value={formatMoneyMinor(dailySummaryQuery.data?.incomeMinor ?? 0)}
                  icon={ArrowUpRight}
                  iconClassName="text-emerald-600"
                  iconContainerClassName="bg-emerald-50"
                />
                <DashboardKpiCard
                  label={t("dashboard:finance.summary.todayExpense")}
                  value={formatMoneyMinor(dailySummaryQuery.data?.expenseMinor ?? 0)}
                  icon={ArrowDownRight}
                  iconClassName="text-rose-600"
                  iconContainerClassName="bg-rose-50"
                />
                <DashboardKpiCard
                  label={t("dashboard:finance.summary.monthBalance")}
                  value={formatMoneyMinor(monthlySummaryQuery.data?.balanceMinor ?? 0)}
                  icon={Wallet}
                  iconClassName="text-sky-600"
                  iconContainerClassName="bg-sky-50"
                />
                <DashboardKpiCard
                  label={t("dashboard:finance.summary.openDrafts")}
                  value={String(draftsQuery.data?.length ?? 0)}
                  icon={ReceiptText}
                  iconClassName="text-amber-600"
                  iconContainerClassName="bg-amber-50"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <DashboardCard
                  eyebrow={t("dashboard:finance.report.cashflow")}
                  title={t("dashboard:finance.report.cashflow")}
                  description={t("dashboard:finance.report.cashflowDescription", "Daily flow across the selected range.")}
                >
                  <div className="h-[320px]">
                    {dailySeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailySeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tickFormatter={formatDateLabel} stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" />
                          <Tooltip
                            formatter={(value: number) => formatMoneyMinor(Number(value))}
                            labelFormatter={(label) => `Date: ${label}`}
                          />
                          <Legend />
                          <Area type="monotone" dataKey="incomeMinor" name="Income" stroke="#10b981" fill="#a7f3d0" fillOpacity={0.55} />
                          <Area type="monotone" dataKey="expenseMinor" name="Expense" stroke="#ef4444" fill="#fecaca" fillOpacity={0.45} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500">
                        {t("dashboard:finance.report.empty", "No transactions in this range")}
                      </div>
                    )}
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow={t("dashboard:finance.report.categoryBreakdown")}
                  title={t("dashboard:finance.report.categoryBreakdown")}
                  description={t("dashboard:finance.report.categoryBreakdownDescription")}
                >
                  <div className="h-[320px]">
                    {categoryBreakdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 8, right: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" stroke="#94a3b8" />
                          <YAxis dataKey="categoryCode" type="category" width={120} stroke="#94a3b8" />
                          <Tooltip formatter={(value: number) => formatMoneyMinor(Number(value))} />
                          <Bar dataKey="totalMinor" name="Total" radius={[0, 10, 10, 0]}>
                            {categoryBreakdown.map((entry, index) => (
                              <Cell
                                key={entry.categoryCode}
                                fill={["#38bdf8", "#22c55e", "#f59e0b", "#a855f7", "#ef4444"][index % 5]}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500">
                        {t("dashboard:finance.report.categoryBreakdownEmpty")}
                      </div>
                    )}
                  </div>
                </DashboardCard>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <DashboardCard
                  eyebrow={t("dashboard:finance.transactions.title")}
                  title={t("dashboard:finance.transactions.title")}
                  description={t("dashboard:finance.report.drilldownDescription", "Pick a transaction to inspect linked evidence.")}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={transactionType} onValueChange={(value) => setTransactionType(value as typeof transactionType)}>
                        <SelectTrigger className="h-10 w-[140px] rounded-2xl bg-white">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All types</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} placeholder="Category code" className="h-10 rounded-2xl" />
                      <Input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Merchant" className="h-10 rounded-2xl" />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 rounded-2xl" />
                      <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 rounded-2xl" />
                    </div>

                    <div className="space-y-2">
                      {(transactionsQuery.data ?? []).map((transaction) => (
                        <button
                          key={transaction.id}
                          type="button"
                          onClick={() => setSelectedTransactionId(transaction.id)}
                          className={cn(
                            "w-full rounded-2xl border px-4 py-3 text-left transition",
                            selectedTransaction?.id === transaction.id
                              ? "border-sky-300 bg-sky-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-950">{transaction.merchantName ?? transaction.categoryCode}</span>
                                <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-[0.18em]">
                                  {transaction.type}
                                </Badge>
                              </div>
                              <p className={cn("mt-1 text-xs", dashboardMetaLineClass)}>
                                <span>{formatDateLabel(transaction.occurredAt)}</span>
                                <span className="text-slate-300">|</span>
                                <span>{transaction.categoryCode}</span>
                                <span className="text-slate-300">|</span>
                                <span>{transaction.source}</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-950">
                                {formatMoneyMinor(transaction.amountMinor, transaction.currency)}
                              </p>
                              <p className="text-xs text-slate-500">{transaction.status}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                      {(transactionsQuery.data ?? []).length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                          {t("dashboard:finance.transactions.empty")}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </DashboardCard>

                <DashboardCard
                  eyebrow={t("dashboard:finance.report.evidenceTrail")}
                  title={t("dashboard:finance.report.evidenceTrail")}
                  description={t("dashboard:finance.report.evidenceTrailDescription")}
                >
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-slate-500" />
                        <Input
                          value={evidenceQuery}
                          onChange={(event) => setEvidenceQuery(event.target.value)}
                          placeholder={t("dashboard:finance.report.searchEvidencePlaceholder")}
                          className="h-10 rounded-2xl"
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => void evidenceQueryResult.refetch()}
                          disabled={evidenceQueryResult.isFetching}
                        >
                          {evidenceQueryResult.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                          {t("dashboard:finance.report.searchEvidence")}
                        </Button>
                        {selectedTransaction ? (
                          <span className="text-xs text-slate-500">
                            {t("dashboard:finance.report.inspectingTransaction", {
                              amount: formatMoneyMinor(selectedTransaction.amountMinor, selectedTransaction.currency),
                            })}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {selectedTransaction ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-sm font-semibold text-slate-950">
                          {selectedTransaction.merchantName ?? selectedTransaction.categoryCode}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatMoneyMinor(selectedTransaction.amountMinor, selectedTransaction.currency)}
                        </p>
                        <p className={cn("mt-2 text-xs", dashboardMetaLineClass)}>
                          <span>{selectedTransaction.type}</span>
                          <span className="text-slate-300">|</span>
                          <span>{formatDateLabel(selectedTransaction.occurredAt)}</span>
                          <span className="text-slate-300">|</span>
                          <span>{selectedTransaction.source}</span>
                        </p>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      {(linkedDocumentsQuery.data ?? []).length > 0 ? (
                        (linkedDocumentsQuery.data ?? []).map((link) => (
                          <div key={link.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="text-sm font-semibold text-slate-950">
                              {link.libraryItem?.title ?? `Document ${link.libraryItemId}`}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {link.role}
                              {link.note ? ` · ${link.note}` : ""}
                            </p>
                          </div>
                        ))
                      ) : evidenceQueryResult.data?.linkedDocuments?.length ? (
                        evidenceQueryResult.data.linkedDocuments.map((link) => (
                          <div key={link.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                            <p className="text-sm font-semibold text-slate-950">
                              {link.libraryItem?.title ?? `Document ${link.libraryItemId}`}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {link.role}
                              {link.note ? ` · ${link.note}` : ""}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4 text-sm text-slate-500">
                          {t("dashboard:finance.report.evidenceTrailEmpty")}
                        </div>
                      )}
                    </div>
                  </div>
                </DashboardCard>
              </div>
            </div>

            <div className="space-y-4">
              <DashboardCard
                eyebrow={t("dashboard:finance.drafts.title")}
                title={t("dashboard:finance.drafts.title")}
                description={t("dashboard:finance.drafts.empty")}
              >
                <div className="space-y-3">
                  {(draftsQuery.data ?? []).length > 0 ? (
                    (draftsQuery.data ?? []).map((draft) => {
                      const payload = getDraftPayload(draft);
                      return (
                        <div key={draft.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-sm font-semibold text-slate-950">
                            {payload.merchantName ?? payload.categoryCode ?? "Draft"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {draft.type} · {formatMoneyMinor(payload.amountMinor, payload.currency)} · {draft.source}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                      {t("dashboard:finance.drafts.empty")}
                    </div>
                  )}
                </div>
              </DashboardCard>

              <DashboardCard
                eyebrow={t("dashboard:finance.recurring.title")}
                title={t("dashboard:finance.recurring.title")}
                description={t("dashboard:finance.recurring.empty")}
              >
                <div className="space-y-3">
                  {(recurringRulesQuery.data ?? []).length > 0 ? (
                    (recurringRulesQuery.data ?? []).map((rule) => (
                      <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <p className="text-sm font-semibold text-slate-950">
                          {formatMoneyMinor(rule.amountMinor, rule.currency)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {rule.categoryCode} · {rule.status} · {rule.autoConfirm ? "Auto" : "Draft first"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                      {t("dashboard:finance.recurring.empty")}
                    </div>
                  )}
                </div>
              </DashboardCard>

              <DashboardCard
                eyebrow={t("dashboard:finance.report.categoryBreakdown")}
                title={t("dashboard:finance.report.categoryBreakdown")}
                description={t("dashboard:finance.page.categoryNotes", "Most common merchant groups in the current filter.")}
              >
                <div className="space-y-3">
                  {merchantBreakdown.length > 0 ? (
                    merchantBreakdown.map((entry) => (
                      <div key={entry.merchantName} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">{entry.merchantName}</p>
                            <p className="mt-1 text-xs text-slate-500">{entry.count} transactions</p>
                          </div>
                          <p className="text-sm font-semibold text-slate-950">{formatMoneyMinor(entry.totalMinor)}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
                      {t("dashboard:finance.report.categoryBreakdownEmpty")}
                    </div>
                  )}
                </div>
              </DashboardCard>
            </div>
          </motion.section>
        </FinanceAccessGate>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500 print:hidden">
          <Button variant="ghost" size="sm" className="gap-2 px-0 text-slate-600" onClick={() => setLocation("/finance")}>
            <ChevronLeft className="h-4 w-4" />
            {t("dashboard:finance.page.backToFinance", "Finance workspace")}
          </Button>
          <span>{t("dashboard:finance.report.exportHint", "Use Export PDF to save the current report")}</span>
          <span className="opacity-0">.</span>
        </div>
      </div>
    </div>
  );
}
