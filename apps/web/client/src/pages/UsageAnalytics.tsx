/**
 * Usage Analytics Page
 *
 * User-facing page showing personal usage stats:
 * - Stats cards (requests, credits, models, cost)
 * - Provider and model breakdown tables
 * - Transaction history with expandable payload viewer
 * - Admin mode: user selector dropdown
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Loader2,
  Activity,
  BarChart3,
  CreditCard,
  DollarSign,
  Brain,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { DateRangeSelector } from "@/components/analytics/DateRangeSelector";
import { StatsCards } from "@/components/analytics/StatsCards";
import { BreakdownTable } from "@/components/analytics/BreakdownTable";
import { TransactionDetailDialog } from "@/components/analytics/TransactionDetailDialog";
import { LocaleToggle } from "@/components/LocaleToggle";
import { formatCurrency, formatLatency } from "@/lib/formatters";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export default function UsageAnalytics() {
  const { t, locale } = useScopedTranslation("billing");
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState<number>(7);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const isAdmin = user?.role === "admin";
  const targetUserId = isAdmin && selectedUserId ? selectedUserId : undefined;

  // User's own overview (or admin viewing another user)
  const overview = targetUserId
    ? trpc.usage.getAdminUserUsage.useQuery(
        { userId: targetUserId, days },
        { staleTime: 5 * 60 * 1000 }
      )
    : trpc.usage.getUserOverview.useQuery(
        { days },
        { staleTime: 5 * 60 * 1000 }
      );

  // Transaction history (admin can view another user's transactions)
  const transactions = trpc.usage.getUserTransactions.useQuery(
    {
      days,
      limit: pageSize,
      offset: page * pageSize,
      ...(targetUserId ? { userId: targetUserId } : {}),
    },
    { staleTime: 60 * 1000 }
  );

  // Admin user list
  const userList = trpc.usage.getUsers.useQuery(undefined, {
    enabled: isAdmin,
    staleTime: 10 * 60 * 1000,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <DashboardCard className="w-96">
          <div>
            <h3>{t("usage.auth.title")}</h3>
            <p>{t("usage.auth.description")}</p>
          </div>
        </DashboardCard>
      </div>
    );
  }

  const data = overview.data;
  const txns = transactions.data?.transactions || [];
  const totalTxns = transactions.data?.total || 0;
  const totalPages = Math.ceil(totalTxns / pageSize);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {t("usage.backToDashboard")}
                </Button>
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />
                  {t("usage.title")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isAdmin && selectedUserId
                    ? t("usage.subtitle.user", { id: selectedUserId })
                    : t("usage.subtitle.self")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:ml-auto">
              <LocaleToggle className="shrink-0" />
              {/* Admin user selector */}
              {isAdmin && userList.data && (
                <select
                  className="px-3 py-1.5 border rounded-md text-sm bg-background"
                  value={selectedUserId ?? ""}
                  onChange={e => {
                    const val = e.target.value;
                    setSelectedUserId(val ? Number(val) : null);
                    setPage(0);
                  }}
                >
                  <option value="">{t("usage.filters.myUsage")}</option>
                  {userList.data.users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name ||
                        u.email ||
                        t("usage.filters.userFallback", { id: u.id })}
                    </option>
                  ))}
                </select>
              )}
              <DateRangeSelector
                value={days}
                onChange={d => {
                  setDays(d);
                  setPage(0);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stats Cards */}
        {overview.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            <StatsCards
              items={[
                {
                  label: t("usage.stats.requests"),
                  value: data.totalRequests.toLocaleString(),
                  icon: Activity,
                  color: "text-blue-500",
                },
                {
                  label: t("usage.stats.creditsUsed"),
                  value: data.totalCredits.toLocaleString(),
                  icon: CreditCard,
                  color: "text-green-500",
                },
                {
                  label: t("usage.stats.modelsUsed"),
                  value: data.activeModels,
                  icon: Brain,
                  color: "text-purple-500",
                },
                {
                  label: t("usage.stats.totalCost"),
                  value: formatCurrency(data.totalCost),
                  icon: DollarSign,
                  color: "text-yellow-500",
                },
              ]}
            />

            {/* Provider + Model Breakdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DashboardCard>
                <div>
                  <h3 className="text-base">
                    {t("usage.providerBreakdown.title")}
                  </h3>
                </div>
                <div>
                  <BreakdownTable
                    columns={[
                      {
                        header: t("usage.columns.provider"),
                        accessor: (r: any) => r.providerName,
                      },
                      {
                        header: t("usage.columns.requests"),
                        accessor: (r: any) => r.requests.toLocaleString(),
                        align: "right",
                      },
                      {
                        header: t("usage.columns.credits"),
                        accessor: (r: any) => r.totalCredits.toLocaleString(),
                        align: "right",
                      },
                    ]}
                    data={data.providerBreakdown}
                    emptyMessage={t("usage.providerBreakdown.empty")}
                  />
                </div>
              </DashboardCard>

              <DashboardCard>
                <div>
                  <h3 className="text-base">
                    {t("usage.modelBreakdown.title")}
                  </h3>
                </div>
                <div>
                  <BreakdownTable
                    columns={[
                      {
                        header: t("usage.columns.model"),
                        accessor: (r: any) => {
                          const m = r.model || t("usage.unknownModel");
                          return m.length > 25 ? m.substring(0, 25) + "..." : m;
                        },
                      },
                      {
                        header: t("usage.columns.requests"),
                        accessor: (r: any) => r.requests.toLocaleString(),
                        align: "right",
                      },
                      {
                        header: t("usage.columns.credits"),
                        accessor: (r: any) => r.totalCredits.toLocaleString(),
                        align: "right",
                      },
                    ]}
                    data={data.modelBreakdown}
                    emptyMessage={t("usage.modelBreakdown.empty")}
                  />
                </div>
              </DashboardCard>
            </div>
          </>
        ) : null}

        {/* Transaction History */}
        <DashboardCard>
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3>{t("usage.transactionHistory.title")}</h3>
                <p>
                  {totalTxns > 0
                    ? t("usage.transactionHistory.range", {
                        start: page * pageSize + 1,
                        end: Math.min((page + 1) * pageSize, totalTxns),
                        total: totalTxns,
                      })
                    : t("usage.transactionHistory.emptyPeriod")}
                </p>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {page + 1}/{totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div>
            {transactions.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : txns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t("usage.transactionHistory.emptyFound")}
              </div>
            ) : (
              <>
                {/* Mobile card list — hidden on sm+ */}
                <div className="sm:hidden divide-y divide-border">
                  {txns.map(tx => (
                    <div key={tx.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {tx.requestType ||
                              tx.type ||
                              t("usage.mobile.defaultType")}
                          </Badge>
                          {tx.errorType ? (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          )}
                        </div>
                        <span className="text-sm font-semibold tabular-nums">
                          {t("usage.mobile.creditsShort", {
                            count: tx.creditsCharged ?? 0,
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {tx.model || "-"}
                      </div>
                      {tx.traceId && (
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          {t("usage.mobile.trace", { traceId: tx.traceId })}
                        </div>
                      )}
                      {tx.errorMessage && (
                        <div className="text-xs text-red-600 break-words">
                          {tx.errorMessage}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{tx.providerName || "-"}</span>
                        <span>
                          {tx.createdAt
                            ? new Date(tx.createdAt).toLocaleString(locale, {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {tx.inputTokens != null && (
                          <span>
                            {t("usage.mobile.tokensShort", {
                              input: tx.inputTokens,
                              output: tx.outputTokens ?? 0,
                            })}
                          </span>
                        )}
                        {tx.responseTimeMs != null && (
                          <span>{formatLatency(tx.responseTimeMs)}</span>
                        )}
                        <div className="ml-auto">
                          <TransactionDetailDialog
                            traceId={tx.traceId || undefined}
                            txId={tx.id}
                            txType={tx.type as "llm" | "media"}
                            date={
                              tx.createdAt
                                ? new Date(tx.createdAt)
                                    .toISOString()
                                    .slice(0, 10)
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table — hidden on mobile */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("usage.table.time")}</TableHead>
                        <TableHead>{t("usage.table.type")}</TableHead>
                        <TableHead>{t("usage.table.model")}</TableHead>
                        <TableHead>{t("usage.table.provider")}</TableHead>
                        <TableHead className="text-right">
                          {t("usage.table.credits")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("usage.table.tokens")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("usage.table.latency")}
                        </TableHead>
                        <TableHead>{t("usage.table.status")}</TableHead>
                        <TableHead>{t("usage.table.traceError")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txns.map(tx => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {tx.createdAt
                              ? new Date(tx.createdAt).toLocaleString(locale, {
                                  month: "numeric",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {tx.requestType ||
                                tx.type ||
                                t("usage.mobile.defaultType")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs max-w-[120px] truncate">
                            {tx.model || "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {tx.providerName || "-"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {tx.creditsCharged ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {tx.inputTokens != null
                              ? `${tx.inputTokens}/${tx.outputTokens}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {tx.responseTimeMs != null
                              ? formatLatency(tx.responseTimeMs)
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {tx.errorType ? (
                                <XCircle className="h-4 w-4 text-red-500" />
                              ) : (
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {tx.statusCode ?? "-"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[280px]">
                            <div className="space-y-1">
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                {tx.traceId || "-"}
                              </div>
                              {tx.errorMessage ? (
                                <div
                                  className="text-xs text-red-600 truncate"
                                  title={tx.errorMessage}
                                >
                                  {tx.errorMessage}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">
                                  -
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <TransactionDetailDialog
                              traceId={tx.traceId || undefined}
                              txId={tx.id}
                              txType={tx.type as "llm" | "media"}
                              date={
                                tx.createdAt
                                  ? new Date(tx.createdAt)
                                      .toISOString()
                                      .slice(0, 10)
                                  : undefined
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
