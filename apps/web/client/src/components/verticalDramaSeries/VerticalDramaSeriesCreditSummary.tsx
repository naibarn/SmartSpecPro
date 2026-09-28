import {
  AlertCircle,
  ChevronDown,
  Coins,
  DollarSign,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import type { VerticalDramaLang } from "@/components/verticalDramaSeries/verticalDramaCopy";

const REFRESH_INTERVAL_MS = 15_000;

function formatCredits(value: number, lang: VerticalDramaLang): string {
  return new Intl.NumberFormat(lang === "th" ? "th-TH" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatUpdatedAt(
  value: Date | string | null | undefined,
  lang: VerticalDramaLang
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function VerticalDramaSeriesCreditSummary({
  seriesId,
  lang,
}: {
  seriesId: string;
  lang: VerticalDramaLang;
}) {
  const numericSeriesId = Number(seriesId);
  const validSeriesId =
    Number.isSafeInteger(numericSeriesId) && numericSeriesId > 0;
  const query = trpc.credits.seriesUsageSummary.useQuery(
    { seriesId: validSeriesId ? numericSeriesId : 0 },
    {
      enabled: validSeriesId,
      // A missing/unapplied credit-context migration is a deploy problem, not
      // a transient network failure. Stop the retry loop so the series page
      // reaches its actionable error state instead of showing the skeleton
      // while DevTools fills with repeated 500s.
      retry: false,
      staleTime: 0,
      refetchInterval: queryState =>
        queryState.state.status === "success" ? REFRESH_INTERVAL_MS : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }
  );

  if (query.isLoading) {
    return (
      <Card aria-busy="true" data-testid="vd-series-credit-summary-loading">
        <CardHeader>
          <Skeleton className="h-5 w-56" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card data-testid="vd-series-credit-summary-error">
        <CardContent className="flex items-center justify-between gap-3 py-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle
              className="h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            {lang === "th"
              ? "ไม่สามารถโหลดสรุปค่าใช้จ่ายของเรื่องนี้ได้"
              : "This series cost summary is unavailable."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            {lang === "th" ? "ลองใหม่" : "Retry"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = query.data;
  const updatedAt = formatUpdatedAt(summary.refreshedAt, lang);
  const coverageMessage =
    summary.coverage === "complete"
      ? lang === "th"
        ? "รวมรายการใช้และคืนเครดิตที่ผูกกับเรื่องนี้ครบแล้ว"
        : "Includes all linked usage and refunds for this series."
      : summary.coverage === "partial"
        ? lang === "th"
          ? "รวมรายการที่พบแล้ว แต่บางรายการยังอยู่ระหว่างการผูกข้อมูลอ้างอิง"
          : "Some matching transactions still need attribution reconciliation."
        : summary.coverage === "legacy_unattributed"
          ? lang === "th"
            ? "ยอดนี้รวมรายการเดิมที่พบจาก Series ID แล้ว แต่ยังไม่ได้ผูก context ถาวร"
            : "Includes legacy Series ID matches that are not permanently context-linked yet."
          : lang === "th"
            ? "ยังไม่มีรายการเครดิตที่บันทึกไว้สำหรับเรื่องนี้"
            : "No credit transactions have been recorded for this series yet.";

  return (
    <Collapsible defaultOpen={false}>
      <Card data-testid="vd-series-credit-summary">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="group h-auto w-full justify-start gap-2 p-0 text-left text-base hover:bg-transparent"
                  aria-label={
                    lang === "th"
                      ? "แสดงหรือซ่อนรายละเอียดค่าใช้จ่ายของเรื่องนี้"
                      : "Show or hide series cost details"
                  }
                >
                  <Coins
                    className="h-4 w-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {lang === "th" ? "ค่าใช้จ่ายของเรื่องนี้" : "Series cost"}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </Button>
              </CollapsibleTrigger>
            </CardTitle>
            <p
              className="mt-1 truncate text-sm font-medium"
              title={summary.seriesTitle}
            >
              {summary.seriesTitle}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lang === "th"
                ? `ประเมินจาก ${formatCredits(summary.creditsPerUsd, lang)} เครดิต = $1 และอัปเดตอัตโนมัติทุก 15 วินาที`
                : `Estimated at ${formatCredits(summary.creditsPerUsd, lang)} credits = $1; refreshes every 15 seconds.`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={
              lang === "th" ? "รีเฟรชค่าใช้จ่าย" : "Refresh series cost"
            }
            title={lang === "th" ? "รีเฟรชค่าใช้จ่าย" : "Refresh series cost"}
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              aria-hidden="true"
            />
          </Button>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">
                  {lang === "th" ? "เครดิตที่ใช้จริง" : "Net credits used"}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatCredits(summary.netActualCredits, lang)}
                </p>
              </div>
              <div className="rounded-lg border bg-emerald-500/5 p-3">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                  {lang === "th" ? "ประมาณการค่าใช้จ่าย" : "Estimated cost"}
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatUsd(summary.usdEstimate)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  {lang === "th" ? "เรียกเก็บทั้งหมด" : "Gross charged"}
                </p>
                <p className="mt-1 text-lg font-medium">
                  {formatCredits(summary.chargedCredits, lang)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lang === "th" ? "เครดิต" : "credits"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  {lang === "th" ? "คืนเครดิต" : "Refunded"}
                </p>
                <p className="mt-1 text-lg font-medium">
                  {formatCredits(summary.refundedCredits, lang)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lang === "th"
                    ? `${formatCredits(summary.transactionCount, lang)} รายการ ledger`
                    : `${formatCredits(summary.transactionCount, lang)} ledger entries`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant={
                  summary.coverage === "complete" || summary.coverage === "none"
                    ? "secondary"
                    : "outline"
                }
              >
                {summary.coverage === "complete"
                  ? lang === "th"
                    ? "ข้อมูลครบ"
                    : "Complete"
                  : summary.coverage === "none"
                    ? lang === "th"
                      ? "ยังไม่มีรายการ"
                      : "No usage yet"
                    : lang === "th"
                      ? "ต้องตรวจสอบการผูกข้อมูล"
                      : "Attribution review needed"}
              </Badge>
              <span>{coverageMessage}</span>
              {summary.integrityExceptionTransactionCount > 0 ? (
                <span className="text-amber-700">
                  {lang === "th"
                    ? `พบรายการผิดปกติ ${formatCredits(summary.integrityExceptionTransactionCount, lang)} รายการ ควรตรวจสอบในหน้า Credits`
                    : `${formatCredits(summary.integrityExceptionTransactionCount, lang)} integrity exception(s); review in Credits.`}
                </span>
              ) : null}
              {updatedAt ? (
                <span>
                  {lang === "th"
                    ? `ตรวจข้อมูลล่าสุด ${updatedAt}`
                    : `Checked ${updatedAt}`}
                </span>
              ) : null}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
