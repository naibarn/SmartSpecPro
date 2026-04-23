import { Loader2, RefreshCcw, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ContextEngineHealthDetails {
  source: string | null;
  surface: string | null;
  traceId: string | null;
  tenantId: string | null;
  userId: number | null;
  conversationId: number | null;
  roomId: string | null;
  runId: string | null;
  skillId: string | null;
  latencyMs: number | null;
  notes: string | null;
  intent: string | null;
  budgetProfile: string | null;
  retrievalModes: string[];
  estimatedTokens: number | null;
  tokenHeadroom: number | null;
  dedupedMessages: number | null;
  injectedMessages: number | null;
  totalSlots: number | null;
  activeNoteSlots: number | null;
  recentNoteSlots: number | null;
  projectStateSlots: number | null;
  workingSummarySlots: number | null;
  durableMemorySlots: number | null;
  retrievedEvidenceSlots: number | null;
  toolResultSlots: number | null;
  resourceSlots: number | null;
  promptAssetSlots: number | null;
  freshSlots: number | null;
  recentSlots: number | null;
  staleSlots: number | null;
  retrievalCoverage: number | null;
  groundingScore: number | null;
  staleContextRatio: number | null;
  freshnessScore: number | null;
  tokenPressureRatio: number | null;
  healthScore: number | null;
}

interface ContextEngineHealthCheckSummary {
  id: number;
  checkType: string;
  status: string;
  source: string;
  createdAt: string;
  details: ContextEngineHealthDetails;
}

interface ContextEngineHealthSummary {
  scope: {
    tenantId: string;
    teamId: string | null;
    roomId: string | null;
    runId: string | null;
    skillId: string | null;
    userId: number | null;
    since: string | null;
    limit: number;
  };
  window: {
    matchedChecks: number;
    latestCreatedAt: string | null;
  };
  totals: {
    total: number;
    ok: number;
    warning: number;
    critical: number;
    error: number;
  };
  latest: ContextEngineHealthCheckSummary | null;
  recentChecks: ContextEngineHealthCheckSummary[];
  averages: {
    healthScore: number | null;
    groundingScore: number | null;
    retrievalCoverage: number | null;
    freshnessScore: number | null;
    staleContextRatio: number | null;
    tokenPressureRatio: number | null;
    latencyMs: number | null;
  };
  sourceBreakdown: Array<{ source: string; count: number }>;
  scopeBreakdown?: Array<{
    teamId: string | null;
    roomId: string | null;
    runId: string | null;
    skillId: string | null;
    count: number;
    latestCreatedAt: string | null;
    latestStatus: string | null;
    latestSource: string | null;
    latestHealthScore: number | null;
    latestGroundingScore: number | null;
    latestRetrievalCoverage: number | null;
  }>;
}

interface ContextEngineHealthPanelProps {
  summary?: ContextEngineHealthSummary | null;
  loading?: boolean;
  error?: string | null;
  scopeLabel?: string;
  emptyMessage?: string;
  className?: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function scoreToPercent(score: number | null | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "critical":
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function metricTone(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "text-slate-500";
  }
  if (value >= 0.8) return "text-emerald-700";
  if (value >= 0.55) return "text-amber-700";
  return "text-rose-700";
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

function metricCard({
  label,
  value,
  helper,
  valueClassName,
}: {
  label: string;
  value: string;
  helper?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className={cn("mt-1 text-lg font-semibold text-slate-900", valueClassName)}>
        {value}
      </p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

export function ContextEngineHealthPanel({
  summary,
  loading = false,
  error = null,
  scopeLabel,
  emptyMessage = "No context-engine checks matched the current scope yet.",
  className,
}: ContextEngineHealthPanelProps) {
  if (loading) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500", className)}>
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Loading context-engine health…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700", className)}>
        {error}
      </div>
    );
  }

  if (!summary || summary.totals.total === 0) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500", className)}>
        {emptyMessage}
      </div>
    );
  }

  const latest = summary.latest;
  const latestDetails = latest?.details ?? null;
  const healthScore = latestDetails?.healthScore ?? summary.averages.healthScore;
  const groundingScore = latestDetails?.groundingScore ?? summary.averages.groundingScore;
  const retrievalCoverage =
    latestDetails?.retrievalCoverage ?? summary.averages.retrievalCoverage;
  const freshnessScore = latestDetails?.freshnessScore ?? summary.averages.freshnessScore;
  const staleContextRatio =
    latestDetails?.staleContextRatio ?? summary.averages.staleContextRatio;
  const tokenPressureRatio =
    latestDetails?.tokenPressureRatio ?? summary.averages.tokenPressureRatio;
  const latencyMs = latestDetails?.latencyMs ?? summary.averages.latencyMs;
  const scorePercent = scoreToPercent(healthScore);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {scopeLabel ?? "Context engine"}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              Recent health snapshot
            </p>
            <p className="text-sm text-slate-600">
              Window since {formatDate(summary.scope.since)} · {summary.window.matchedChecks}{" "}
              check{summary.window.matchedChecks === 1 ? "" : "s"}
            </p>
          </div>
          <Badge variant="outline" className={cn("capitalize", statusBadgeClass(latest?.status ?? "unknown"))}>
            {latest?.status ?? "unknown"}
          </Badge>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>Health score</span>
            <span className={cn("font-medium", metricTone(healthScore))}>
              {formatNumber(healthScore)}
            </span>
          </div>
          <Progress value={scorePercent} className="mt-2 h-2.5" />
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
            <Badge variant="outline" className="border-slate-200 bg-white">
              Grounding {formatNumber(groundingScore)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white">
              Retrieval {formatPercent(retrievalCoverage)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white">
              Freshness {formatPercent(freshnessScore)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white">
              Token pressure {formatPercent(tokenPressureRatio)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white">
              Stale {formatPercent(staleContextRatio)}
            </Badge>
            {typeof latencyMs === "number" ? (
              <Badge variant="outline" className="border-slate-200 bg-white">
                <Clock3 className="mr-1 h-3 w-3" />
                {Math.round(latencyMs)} ms
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metricCard({
            label: "Latest source",
            value: latestDetails?.source ?? latest?.source ?? "n/a",
            helper: latestDetails?.surface ? `Surface: ${latestDetails.surface}` : undefined,
          })}
          {metricCard({
            label: "Latest run",
            value:
              latestDetails?.runId ??
              summary.scope.runId ??
              "n/a",
            helper: latestDetails?.roomId ? `Room: ${latestDetails.roomId}` : undefined,
          })}
          {metricCard({
            label: "Window total",
            value: String(summary.totals.total),
            helper: `ok ${summary.totals.ok} · warn ${summary.totals.warning} · critical ${summary.totals.critical}`,
          })}
          {metricCard({
            label: "Latest updated",
            value: formatDate(summary.window.latestCreatedAt ?? latest?.createdAt ?? null),
            helper: latestDetails?.intent ? `Intent: ${latestDetails.intent}` : undefined,
          })}
        </div>

        {latestDetails?.retrievalModes?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {latestDetails.retrievalModes.map(mode => (
              <Badge key={mode} variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                {mode}
              </Badge>
            ))}
          </div>
        ) : null}

        {summary.sourceBreakdown.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-600">
            {summary.sourceBreakdown.map(item => (
              <Badge
                key={item.source}
                variant="outline"
                className="border-slate-200 bg-slate-50 text-slate-700"
              >
                {item.source}: {item.count}
              </Badge>
            ))}
          </div>
        ) : null}

        {summary.scopeBreakdown?.length ? (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Scope breakdown
              </p>
              <p className="text-[11px] text-slate-500">
                Room / run slices with the freshest latest signal
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.scopeBreakdown.slice(0, 8).map(item => (
                <Badge
                  key={[
                    item.teamId ?? "any",
                    item.roomId ?? "any",
                    item.runId ?? "any",
                    item.skillId ?? "any",
                  ].join(":")}
                  variant="outline"
                  className="border-cyan-200 bg-white text-cyan-800"
                >
                  {item.teamId ? `team ${item.teamId}` : "team any"} ·{" "}
                  {item.roomId ? `room ${item.roomId}` : "room any"} ·{" "}
                  {item.runId ? `run ${item.runId}` : "run any"} · {item.count}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3">
        {summary.recentChecks.slice(0, 4).map(check => (
          <div key={check.id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {check.source}
                </p>
                <p className="text-xs text-slate-500">
                  {check.details.surface ?? "n/a"} · {formatDate(check.createdAt)}
                </p>
              </div>
              <Badge variant="outline" className={cn("capitalize", statusBadgeClass(check.status))}>
                {check.status}
              </Badge>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {metricCard({
                label: "Health",
                value: formatNumber(check.details.healthScore),
                valueClassName: metricTone(check.details.healthScore),
              })}
              {metricCard({
                label: "Grounding",
                value: formatNumber(check.details.groundingScore),
              })}
              {metricCard({
                label: "Retrieval",
                value: formatPercent(check.details.retrievalCoverage),
              })}
              {metricCard({
                label: "Freshness",
                value: formatPercent(check.details.freshnessScore),
              })}
            </div>

            {check.details.notes ? (
              <p className="mt-3 text-xs text-slate-600">
                {check.details.notes}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {summary.recentChecks.length > 4 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
          <RefreshCcw className="mr-1 inline h-3.5 w-3.5" />
          {summary.recentChecks.length - 4} older checks hidden from the preview.
        </div>
      ) : null}
    </div>
  );
}
