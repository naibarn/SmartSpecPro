import { useMemo } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Activity, CheckCircle2, Loader2, Siren, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";
import { cn } from "@/lib/utils";

type OpsHealth = "healthy" | "warning" | "critical";

type OpsAnomaly = {
  id: string;
  severity: "warning" | "critical";
  category: "resources" | "services" | "monitoring" | "audit" | "orchestration";
  type: string;
  title: string;
  message: string;
  recommendation: string;
  signal: string | null;
  observedAt: string | null;
  source: string;
};

type OpsOverview = {
  health: OpsHealth;
  anomalies: OpsAnomaly[];
  summary: {
    totalAnomalies: number;
    criticalCount: number;
    warningCount: number;
    resourceCount: number;
    serviceCount: number;
    monitoringCount: number;
    auditCount: number;
    orchestrationCount: number;
  };
  leadingSignals: {
    memoryPercent: number | null;
    cpuPercent: number | null;
    diskPercent: number | null;
    maxRestartDelta: number | null;
    llmErrorRate: number | null;
    mediaErrorRate: number | null;
    llmP95LatencyMs: number | null;
    mediaP95LatencyMs: number | null;
    fallbackRate: number | null;
    qualityRiskRate: number | null;
  };
  windows: {
    metricsHours: number;
    auditHours: number;
    orchestrationHours: number;
  };
  updatedAt: string;
};

type OpsEarlyWarningPanelProps = {
  overview?: OpsOverview;
  isLoading?: boolean;
  className?: string;
  maxItems?: number;
  title?: string;
  description?: string;
  showMonitoringLink?: boolean;
  workpackRollout?: {
    blockedCount: number;
    readyCount: number;
    stagedCount: number;
    reviewCount: number;
    topReasonCodes?: string[];
  };
};

const severityBadgeClassName: Record<OpsHealth, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
};

const anomalySeverityClassName: Record<OpsAnomaly["severity"], string> = {
  warning: "border-amber-200 bg-amber-50/80 text-amber-800",
  critical: "border-rose-200 bg-rose-50/80 text-rose-800",
};

const categoryLabel: Record<OpsAnomaly["category"], string> = {
  resources: "Resources",
  services: "Services",
  monitoring: "Monitoring",
  audit: "Audit",
  orchestration: "Orchestration",
};

function percentLabel(value: number | null, digits = 0): string | null {
  if (value == null) return null;
  return `${(value * (digits === 0 && value <= 1 ? 100 : 1)).toFixed(digits)}%`;
}

function rawPercentLabel(value: number | null, digits = 0): string | null {
  if (value == null) return null;
  return `${value.toFixed(digits)}%`;
}

function latencyLabel(value: number | null): string | null {
  if (value == null) return null;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function relativeTimeLabel(value: string | null): string | null {
  if (!value) return null;
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

export function OpsEarlyWarningPanel({
  overview,
  isLoading = false,
  className,
  maxItems = 5,
  title = "Early Warning Signals",
  description = "Cross-check resources, alerts, audit logs, and orchestration so abnormal patterns show up before the server tips over.",
  showMonitoringLink = false,
  workpackRollout,
}: OpsEarlyWarningPanelProps) {
  const [, setLocation] = useLocation();

  const visibleAnomalies = useMemo(
    () => overview?.anomalies.slice(0, maxItems) ?? [],
    [maxItems, overview?.anomalies],
  );

  const signalPills = useMemo(() => {
    if (!overview) return [];
    const pills = [
      { label: "RAM", value: rawPercentLabel(overview.leadingSignals.memoryPercent, 1) },
      { label: "CPU", value: rawPercentLabel(overview.leadingSignals.cpuPercent, 1) },
      { label: "Disk", value: rawPercentLabel(overview.leadingSignals.diskPercent, 1) },
      { label: "LLM Errors", value: percentLabel(overview.leadingSignals.llmErrorRate, 0) },
      { label: "Media Errors", value: percentLabel(overview.leadingSignals.mediaErrorRate, 0) },
      { label: "LLM p95", value: latencyLabel(overview.leadingSignals.llmP95LatencyMs) },
      { label: "Media p95", value: latencyLabel(overview.leadingSignals.mediaP95LatencyMs) },
      { label: "Fallback", value: percentLabel(overview.leadingSignals.fallbackRate, 0) },
      { label: "Quality Risk", value: percentLabel(overview.leadingSignals.qualityRiskRate, 0) },
      { label: "Restarts", value: overview.leadingSignals.maxRestartDelta != null ? `+${overview.leadingSignals.maxRestartDelta}` : null },
    ];
    return pills.filter((pill): pill is { label: string; value: string } => Boolean(pill.value));
  }, [overview]);

  const HealthIcon = overview?.health === "critical"
    ? Siren
    : overview?.health === "warning"
      ? AlertTriangle
      : CheckCircle2;

  return (
    <DashboardCard
      className={cn(className)}
      title={title}
      description={description}
      leading={<HealthIcon className={cn("h-5 w-5", overview?.health === "critical" ? "text-rose-600" : overview?.health === "warning" ? "text-amber-600" : "text-emerald-600")} />}
      trailing={(
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("capitalize", severityBadgeClassName[overview?.health ?? "healthy"])}>
            {overview?.health ?? "healthy"}
          </Badge>
          {showMonitoringLink ? (
            <Button variant="outline" size="sm" onClick={() => setLocation("/admin/monitoring")}>
              Open Monitoring
            </Button>
          ) : null}
        </div>
      )}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Building unified anomaly summary…
        </div>
      ) : !overview ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-muted-foreground">
          Monitoring summary is not available yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <SignalStat label="Critical" value={overview.summary.criticalCount} tone="critical" />
            <SignalStat label="Warnings" value={overview.summary.warningCount} tone="warning" />
            <SignalStat label="Audit Risks" value={overview.summary.auditCount} tone="neutral" />
            <SignalStat label="Orchestration Risks" value={overview.summary.orchestrationCount} tone="neutral" />
          </div>

          {workpackRollout ? (
            <div className="grid gap-3 md:grid-cols-4">
              <SignalStat label="Workpacks Ready" value={workpackRollout.readyCount} tone="healthy" />
              <SignalStat label="Workpacks Blocked" value={workpackRollout.blockedCount} tone="critical" />
              <SignalStat label="Staged" value={workpackRollout.stagedCount} tone="warning" />
              <SignalStat label="Review Required" value={workpackRollout.reviewCount} tone="neutral" />
            </div>
          ) : null}

          {signalPills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {signalPills.map((pill) => (
                <Badge key={pill.label} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  {pill.label}: {pill.value}
                </Badge>
              ))}
            </div>
          ) : null}

          {workpackRollout?.topReasonCodes?.length ? (
            <div className="flex flex-wrap gap-2">
              {workpackRollout.topReasonCodes.map((reasonCode) => (
                <Badge key={reasonCode} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                  Workpack blocker: {reasonCode}
                </Badge>
              ))}
            </div>
          ) : null}

          {visibleAnomalies.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-4 text-sm text-emerald-800">
              No active early-warning signals in the current {overview.windows.metricsHours}h / {overview.windows.auditHours}h windows. Latest summary updated {relativeTimeLabel(overview.updatedAt) ?? "just now"}.
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAnomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  className={cn("rounded-2xl border px-4 py-4", anomalySeverityClassName[anomaly.severity])}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge variant="outline" className="border-current/20 bg-white/60 text-current">
                      {categoryLabel[anomaly.category]}
                    </Badge>
                    <Badge variant="outline" className="border-current/20 bg-white/60 text-current capitalize">
                      {anomaly.severity}
                    </Badge>
                    {anomaly.signal ? (
                      <Badge variant="outline" className="border-current/20 bg-white/60 text-current">
                        {anomaly.signal}
                      </Badge>
                    ) : null}
                    {anomaly.observedAt ? (
                      <span className="ml-auto text-xs text-current/80">
                        {relativeTimeLabel(anomaly.observedAt)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2">
                    <p className="text-sm font-semibold text-slate-900">{anomaly.title}</p>
                    <p className="mt-1 text-sm text-slate-700">{anomaly.message}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Recommended: {anomaly.recommendation}
                    </p>
                  </div>
                </div>
              ))}

              {overview.anomalies.length > visibleAnomalies.length ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {overview.anomalies.length - visibleAnomalies.length} more signals are available in Monitoring.
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            Windows: metrics {overview.windows.metricsHours}h, audit {overview.windows.auditHours}h, orchestration {overview.windows.orchestrationHours}h.
          </div>
        </div>
      )}
    </DashboardCard>
  );
}

function SignalStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "critical" | "warning" | "neutral" | "healthy";
}) {
  return (
    <div className={cn(
      "rounded-2xl border px-4 py-3",
      tone === "critical"
        ? "border-rose-200 bg-rose-50/70 text-rose-700"
        : tone === "warning"
          ? "border-amber-200 bg-amber-50/70 text-amber-700"
          : tone === "healthy"
            ? "border-emerald-200 bg-emerald-50/70 text-emerald-700"
            : "border-slate-200 bg-slate-50/80 text-slate-700",
    )}>
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-[0.16em] opacity-80">{label}</div>
    </div>
  );
}

export type { OpsOverview };
