/**
 * Admin Monitoring Page — /admin/monitoring
 *
 * Displays server status, health check history, alerts, and metrics charts.
 * Tabs: Checks | Alerts | Metrics
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Bell,
  BellOff,
  Cpu,
  MemoryStick,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ServiceStatus = { name: string; status: string; [key: string]: unknown };
type MonitoringCheck = {
  id: number;
  checkType: string;
  status: string;
  details: Record<string, unknown> | null;
  alertSent: boolean;
  source: string;
  createdAt: Date;
};
type MonitoringAlert = {
  id: number;
  severity: string;
  title: string;
  message: string;
  channel: string;
  acknowledged: boolean;
  acknowledgedBy: number | null;
  acknowledgedAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};
type MetricPoint = {
  id: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
  cpuPercent: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusColor: Record<string, string> = {
  ok: "text-green-600 bg-green-50 border-green-200",
  warning: "text-yellow-600 bg-yellow-50 border-yellow-200",
  critical: "text-red-600 bg-red-50 border-red-200",
  error: "text-red-600 bg-red-50 border-red-200",
  active: "text-green-600 bg-green-50 border-green-200",
  failed: "text-red-600 bg-red-50 border-red-200",
  unknown: "text-gray-500 bg-gray-50 border-gray-200",
};

const severityColor: Record<string, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  warning: "text-yellow-600 bg-yellow-50 border-yellow-200",
  info: "text-blue-600 bg-blue-50 border-blue-200",
};

function statusIcon(status: string) {
  const s = status.toLowerCase();
  if (s === "ok" || s === "active") return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (s === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  if (s === "critical" || s === "error" || s === "failed")
    return <XCircle className="h-4 w-4 text-red-500" />;
  return <Activity className="h-4 w-4 text-gray-400" />;
}

function timeAgo(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatChartTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function StatusCards({
  services,
  criticalCount,
  warningCount,
  lastCheck,
}: {
  services: ServiceStatus[];
  criticalCount: number;
  warningCount: number;
  lastCheck: string | null;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {services.map((svc) => (
        <DashboardKpiCard
          key={svc.name}
          icon={Server}
          label={svc.name}
          value={String(svc.status)}
          valueClassName={cn(
            "capitalize",
            statusColor[String(svc.status).toLowerCase()]?.split(" ")[0] ?? "text-gray-500",
          )}
          subLabel={<div className="flex items-center gap-2">{statusIcon(String(svc.status))}</div>}
        />
      ))}

      {/* Critical alerts card */}
      <DashboardKpiCard
        icon={XCircle}
        label="Critical"
        value={criticalCount}
        subLabel="unacknowledged"
        valueClassName="text-red-600"
        iconContainerClassName={criticalCount > 0 ? "bg-red-50 text-red-600" : undefined}
      />

      {/* Warning alerts card */}
      <DashboardKpiCard
        icon={AlertTriangle}
        label="Warnings"
        value={warningCount}
        subLabel={`last check: ${timeAgo(lastCheck)}`}
        valueClassName="text-yellow-600"
        iconContainerClassName={warningCount > 0 ? "bg-yellow-50 text-yellow-600" : undefined}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checks Tab
// ---------------------------------------------------------------------------

function ChecksTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const limit = 15;

  const checksQuery = trpc.monitoring.getChecks.useQuery(
    {
      page,
      limit,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(typeFilter ? { checkType: typeFilter } : {}),
    },
    { refetchInterval: 30000 },
  );

  const checks: MonitoringCheck[] = (checksQuery.data?.checks as MonitoringCheck[]) ?? [];
  const total = checksQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={handleFilterChange(setStatusFilter)}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All statuses</option>
          <option value="ok">OK</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
        </select>
        <select
          value={typeFilter}
          onChange={handleFilterChange(setTypeFilter)}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All types</option>
          <option value="health_check">health_check</option>
          <option value="celery_health">celery_health</option>
          <option value="db_health">db_health</option>
          <option value="redis_health">redis_health</option>
          <option value="memory_check">memory_check</option>
          <option value="cpu_check">cpu_check</option>
          <option value="disk_check">disk_check</option>
        </select>
        {checksQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Time</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Source</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Alert Sent</th>
            </tr>
          </thead>
          <tbody>
            {checks.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {checksQuery.isLoading ? "Loading..." : "No checks found"}
                </td>
              </tr>
            )}
            {checks.map((check) => (
              <tr key={check.id} className="border-b last:border-0 hover:bg-muted/25 transition-colors">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(check.createdAt)}
                </td>
                <td className="px-4 py-2">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{check.checkType}</code>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                      statusColor[check.status.toLowerCase()] ?? statusColor.unknown,
                    )}
                  >
                    {statusIcon(check.status)}
                    {check.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{check.source}</td>
                <td className="px-4 py-2">
                  {check.alertSent ? (
                    <Bell className="h-3.5 w-3.5 text-orange-500" />
                  ) : (
                    <BellOff className="h-3.5 w-3.5 text-gray-300" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} total check{total !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts Tab
// ---------------------------------------------------------------------------

function AlertsTab() {
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<"info" | "warning" | "error" | "critical" | "">("");
  const [unackOnly, setUnackOnly] = useState(false);
  const limit = 15;

  const alertsQuery = trpc.monitoring.getAlerts.useQuery(
    {
      page,
      limit,
      ...(severityFilter ? { severity: severityFilter } : {}),
      ...(unackOnly ? { acknowledged: false } : {}),
    },
    { refetchInterval: 30000 },
  );

  const acknowledgeMutation = trpc.monitoring.acknowledgeAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged");
      void alertsQuery.refetch();
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to acknowledge: ${err.message}`);
    },
  });

  const alerts: MonitoringAlert[] = (alertsQuery.data?.alerts as MonitoringAlert[]) ?? [];
  const total = alertsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleSeverityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSeverityFilter(e.target.value as "info" | "warning" | "error" | "critical" | "");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={severityFilter}
          onChange={handleSeverityChange}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unackOnly}
            onChange={(e) => {
              setUnackOnly(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-gray-300"
          />
          Unacknowledged only
        </label>
        {alertsQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            {alertsQuery.isLoading ? "Loading..." : "No alerts found"}
          </div>
        )}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4",
              alert.acknowledged ? "opacity-60 bg-muted/20" : "",
              severityColor[alert.severity.toLowerCase()] ?? "bg-gray-50 border-gray-200",
            )}
          >
            <div className="mt-0.5 shrink-0">
              {alert.severity === "critical" ? (
                <XCircle className="h-5 w-5 text-red-500" />
              ) : alert.severity === "warning" ? (
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              ) : (
                <Bell className="h-5 w-5 text-blue-500" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{alert.title}</span>
                <Badge variant="outline" className="text-xs capitalize">
                  {alert.severity}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {alert.channel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo(alert.createdAt)}
                </span>
                {alert.acknowledged && alert.acknowledgedAt && (
                  <span className="text-xs text-muted-foreground">
                    Ack'd {timeAgo(alert.acknowledgedAt)}
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0">
              {alert.acknowledged ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Acknowledged
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => acknowledgeMutation.mutate({ alertId: alert.id })}
                  disabled={acknowledgeMutation.isPending}
                >
                  {acknowledgeMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Acknowledge"
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} alert{total !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metrics Tab
// ---------------------------------------------------------------------------

function MetricsTab() {
  const [hours, setHours] = useState(6);

  const metricsQuery = trpc.monitoring.getMetricsHistory.useQuery(
    { hours },
    { refetchInterval: 60000 },
  );

  const metrics: MetricPoint[] = (metricsQuery.data?.metrics as MetricPoint[]) ?? [];
  const latestMemory = metricsQuery.data?.latestMemoryPercent ?? 0;
  const latestCpu = metricsQuery.data?.latestCpuPercent ?? null;

  // Build chart data
  const chartData = metrics
    .slice()
    .reverse()
    .map((m) => ({
      time: formatChartTime(m.createdAt),
      memory: Math.round(m.memoryPercent * 10) / 10,
      cpu: m.cpuPercent !== null ? Math.round(m.cpuPercent * 10) / 10 : null,
      diskPercent:
        m.diskTotalGb && m.diskUsedGb
          ? Math.round(((m.diskUsedGb / m.diskTotalGb) * 100) * 10) / 10
          : null,
    }));

  const latestMetric = metrics[0];
  const diskPercent =
    latestMetric?.diskTotalGb && latestMetric?.diskUsedGb
      ? (latestMetric.diskUsedGb / latestMetric.diskTotalGb) * 100
      : null;

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Time range:</span>
        {([1, 6, 24, 48] as const).map((h) => (
          <Button
            key={h}
            variant={hours === h ? "default" : "outline"}
            size="sm"
            onClick={() => setHours(h)}
          >
            {h}h
          </Button>
        ))}
        {metricsQuery.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Current snapshot cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DashboardKpiCard
          icon={MemoryStick}
          label="RAM Usage"
          value={`${latestMemory.toFixed(1)}%`}
          subLabel={latestMetric ? `${latestMetric.memoryUsedMb.toFixed(0)} / ${latestMetric.memoryTotalMb.toFixed(0)} MB` : undefined}
          valueClassName={
            latestMemory >= 90
              ? "text-red-600"
              : latestMemory >= 70
                ? "text-yellow-600"
                : "text-green-600"
          }
        />
        <DashboardKpiCard
          icon={Cpu}
          label="CPU Usage"
          value={latestCpu !== null ? `${latestCpu.toFixed(1)}%` : "N/A"}
          valueClassName={
            latestCpu === null
              ? "text-gray-400"
              : latestCpu >= 90
                ? "text-red-600"
                : latestCpu >= 70
                  ? "text-yellow-600"
                  : "text-green-600"
          }
        />
        <DashboardKpiCard
          icon={Server}
          label="Disk Usage"
          value={diskPercent !== null ? `${diskPercent.toFixed(1)}%` : "N/A"}
          subLabel={latestMetric?.diskUsedGb !== null && latestMetric?.diskTotalGb !== null ? `${latestMetric?.diskUsedGb?.toFixed(1)} / ${latestMetric?.diskTotalGb?.toFixed(1)} GB` : undefined}
          valueClassName={
            diskPercent === null
              ? "text-gray-400"
              : diskPercent >= 90
                ? "text-red-600"
                : diskPercent >= 70
                  ? "text-yellow-600"
                  : "text-green-600"
          }
        />
      </div>

      {/* Time series chart */}
      {chartData.length > 0 ? (
        <DashboardCard
          title="Resource Usage Over Time"
          description={`Last ${hours} hour${hours !== 1 ? "s" : ""} — ${chartData.length} data points`}
        >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="memoryGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  unit="%"
                  width={40}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value?.toFixed(1)}%`,
                    name.charAt(0).toUpperCase() + name.slice(1),
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="memory"
                  name="RAM"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#memoryGrad)"
                  dot={false}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  name="CPU"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#cpuGrad)"
                  dot={false}
                  connectNulls
                />
                <Area
                  type="monotone"
                  dataKey="diskPercent"
                  name="Disk"
                  stroke="#f97316"
                  strokeWidth={2}
                  fill="url(#diskGrad)"
                  dot={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
        </DashboardCard>
      ) : (
        !metricsQuery.isLoading && (
          <div className="py-12 text-center text-muted-foreground">
            No metrics data available for the selected time range.
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Tab = "checks" | "alerts" | "metrics";

export default function AdminMonitoring() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("checks");

  const statusQuery = trpc.monitoring.getCurrentStatus.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // Auth guard
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <DashboardCard
          className="w-96"
          title="Access Denied"
          description="You need admin privileges to access this page."
        />
      </div>
    );
  }

  const services: ServiceStatus[] = (statusQuery.data?.services as ServiceStatus[]) ?? [];
  const criticalCount = statusQuery.data?.alerts?.critical ?? 0;
  const warningCount = statusQuery.data?.alerts?.warning ?? 0;
  const lastCheck = statusQuery.data?.lastCheck ?? null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "checks", label: "Checks" },
    { id: "alerts", label: `Alerts${criticalCount + warningCount > 0 ? ` (${criticalCount + warningCount})` : ""}` },
    { id: "metrics", label: "Metrics" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card shrink-0">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Dashboard
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Activity className="h-6 w-6" />
                  Server Monitoring
                </h1>
                <p className="text-sm text-muted-foreground">
                  Last check:{" "}
                  {statusQuery.isLoading ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> loading…
                    </span>
                  ) : (
                    timeAgo(lastCheck)
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void statusQuery.refetch()}
              disabled={statusQuery.isLoading}
            >
              {statusQuery.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-6 space-y-6">
        {/* Status Cards */}
        {statusQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading service status…
          </div>
        ) : (
          <StatusCards
            services={services}
            criticalCount={criticalCount}
            warningCount={warningCount}
            lastCheck={lastCheck}
          />
        )}

        {/* Critical alert banner */}
        {criticalCount > 0 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
            <span className="text-red-700 text-sm font-medium">
              {criticalCount} critical alert{criticalCount !== 1 ? "s" : ""} require attention
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setActiveTab("alerts")}
            >
              View Alerts
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div>
          <div className="flex border-b mb-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "checks" && <ChecksTab />}
          {activeTab === "alerts" && <AlertsTab />}
          {activeTab === "metrics" && <MetricsTab />}
        </div>
      </div>
    </div>
  );
}
