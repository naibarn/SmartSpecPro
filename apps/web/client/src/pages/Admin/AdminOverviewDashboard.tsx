/**
 * Admin Overview Dashboard
 *
 * Single-page operational summary aggregating key metrics from all admin
 * dashboards. Shows KPI cards, recharts visualizations, system health strip,
 * quick insights tables, and navigation links.
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocaleToggle } from "@/components/LocaleToggle";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Users,
  UserCheck,
  Activity,
  AlertTriangle,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  Zap,
  HardDrive,
  Shield,
  LayoutDashboard,
  ExternalLink,
  Server,
  Brain,
  Cpu,
  PlayCircle,
  ClipboardList,
  MonitorPlay,
  Settings,
  Building2,
  Package,
  Gauge,
  Timer,
  Workflow,
} from "lucide-react";

// --- Chart configs ---

const dailyUsersConfig: ChartConfig = {
  userCount: { label: "Users", color: "hsl(221, 83%, 53%)" },
};

const requestsConfig: ChartConfig = {
  success: { label: "Success", color: "hsl(221, 83%, 53%)" },
  errors: { label: "Errors", color: "hsl(0, 84%, 60%)" },
};

const JOB_STATUS_COLORS: Record<string, string> = {
  completed: "hsl(142, 71%, 45%)",
  processing: "hsl(221, 83%, 53%)",
  queued: "hsl(48, 96%, 53%)",
  pending: "hsl(199, 89%, 48%)",
  failed: "hsl(0, 84%, 60%)",
  dead_letter: "hsl(0, 72%, 51%)",
};

const LLM_MODEL_COLORS = [
  "hsl(221, 83%, 53%)", // blue
  "hsl(142, 71%, 45%)", // green
  "hsl(48, 96%, 53%)", // yellow
  "hsl(262, 83%, 58%)", // purple
  "hsl(24, 95%, 53%)", // orange
  "hsl(199, 89%, 48%)", // cyan (Other)
];

const mediaUsageConfig: ChartConfig = {
  image: { label: "Image", color: "hsl(221, 83%, 53%)" },
  video: { label: "Video", color: "hsl(142, 71%, 45%)" },
  audio: { label: "Audio", color: "hsl(262, 83%, 58%)" },
};

// --- Helpers ---

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatPercent(n: number | undefined | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatMs(n: number | undefined | null): string {
  if (n == null) return "—";
  return `${Math.round(n)}ms`;
}

function formatCost(n: number | undefined | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function formatGb(n: number | undefined | null): string {
  if (n == null) return "—";
  return `${n.toFixed(1)} GB`;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function healthColor(status: string | undefined | null): string {
  if (!status) return "bg-gray-300";
  const s = status.toLowerCase();
  if (s === "healthy" || s === "ok" || s === "true" || s === "connected")
    return "bg-green-500";
  if (s === "degraded" || s === "warning") return "bg-yellow-500";
  return "bg-red-500";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// --- Component ---

export default function AdminOverviewDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [refreshInterval, setRefreshInterval] = useState<number | null>(30000);

  const queryOpts = {
    refetchInterval: refreshInterval ?? false,
    staleTime: 10_000,
  } as const;

  // All queries in parallel
  const trafficStats = trpc.adminOps.trafficStats.useQuery(
    { days: 7 },
    queryOpts
  );
  const apiHealth = trpc.adminOps.apiHealth.useQuery({}, queryOpts);
  const jobsHealth = trpc.adminOps.jobsHealth.useQuery(undefined, queryOpts);
  const kieAiHealth = trpc.adminOps.kieAiHealth.useQuery({}, queryOpts);
  const storageStats = trpc.adminOps.storageStats.useQuery(
    undefined,
    queryOpts
  );
  const securityStats = trpc.adminOps.securityStats.useQuery(
    undefined,
    queryOpts
  );
  const auditStats = trpc.audit.stats.useQuery({ days: 7 }, queryOpts);
  const systemHealth = trpc.infrastructure.getSystemHealth.useQuery(
    undefined,
    queryOpts
  );
  const redisHealth = trpc.infrastructure.getRedisHealth.useQuery(
    undefined,
    queryOpts
  );
  const monitoringStatus = trpc.infrastructure.getMonitoringStatus.useQuery(
    undefined,
    queryOpts
  );
  const dailyLlmUsage = trpc.adminOps.dailyLlmUsage.useQuery(
    { days: 7 },
    queryOpts
  );
  const dailyMediaUsage = trpc.adminOps.dailyMediaUsage.useQuery(
    { days: 7 },
    queryOpts
  );
  const pendingApprovals = trpc.adminOps.pendingApprovalCounts.useQuery(
    undefined,
    queryOpts
  );
  const workpackReleaseHealth = trpc.adminOps.workpackReleaseHealth.useQuery(
    undefined,
    queryOpts
  );

  const workpackAccessActions = [
    {
      label: "Intake Studio",
      description: "Launch and shape incoming workpack intake.",
      href: "/workpacks/intake",
      icon: ClipboardList,
    },
    {
      label: "Discovery Library",
      description: "Browse starter and benchmark packs.",
      href: "/workpacks/discovery",
      icon: Package,
    },
    {
      label: "ROI Dashboard",
      description: "Monitor readiness, blockers, and roadmap progress.",
      href: "/workpacks/roi",
      icon: Gauge,
    },
    {
      label: "Exceptions Inbox",
      description: "Review policy and connector exceptions.",
      href: "/workpacks/exceptions",
      icon: AlertTriangle,
    },
    {
      label: "Work OS Console",
      description: "Inspect mirrored case state and automation flow.",
      href: "/admin/work-os",
      icon: MonitorPlay,
    },
  ];

  // --- Hooks: useMemo MUST be called before any early return (Rules of Hooks) ---

  const llmModels = dailyLlmUsage.data?.topModels ?? [];

  const llmChartData = useMemo(() => {
    if (!dailyLlmUsage.data?.daily?.length) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    for (const row of dailyLlmUsage.data.daily) {
      if (!row.date || !row.model) continue;
      const key = shortDate(row.date);
      if (!byDate.has(key)) byDate.set(key, { date: key });
      const entry = byDate.get(key)!;
      entry[row.model] = (Number(entry[row.model]) || 0) + Number(row.requests);
    }
    return Array.from(byDate.values());
  }, [dailyLlmUsage.data]);

  const llmChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (let i = 0; i < llmModels.length; i++) {
      const model = llmModels[i];
      if (typeof model !== "string" || !model) continue;
      const shortName = model.includes("/") ? model.split("/").pop()! : model;
      config[model] = {
        label: shortName,
        color: LLM_MODEL_COLORS[i] ?? LLM_MODEL_COLORS[5],
      };
    }
    if (llmChartData.some(d => "Other" in d)) {
      config["Other"] = { label: "Other", color: LLM_MODEL_COLORS[5] };
    }
    return config;
  }, [llmModels, llmChartData]);

  const mediaChartData = useMemo(() => {
    if (!dailyMediaUsage.data?.daily?.length) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    for (const row of dailyMediaUsage.data.daily) {
      if (!row.date || !row.mediaType) continue;
      const key = shortDate(row.date);
      if (!byDate.has(key)) byDate.set(key, { date: key });
      const entry = byDate.get(key)!;
      entry[row.mediaType] =
        (Number(entry[row.mediaType]) || 0) + Number(row.requests);
    }
    return Array.from(byDate.values());
  }, [dailyMediaUsage.data]);

  // --- Early returns (after all hooks) ---

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "domain_admin")) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <DashboardCard className="w-96" title="Access Denied">
          <div>
            <p className="text-sm text-muted-foreground">
              You need admin privileges to access this page.
            </p>
          </div>
        </DashboardCard>
      </div>
    );
  }

  // --- Data transforms ---

  const jobStatusData = jobsHealth.data?.countsByStatus
    ? Object.entries(jobsHealth.data.countsByStatus)
        .filter(([, v]) => (v as number) > 0)
        .map(([name, value]) => ({ name, value: value as number }))
    : [];

  const jobsPieConfig: ChartConfig = Object.fromEntries(
    jobStatusData.map(({ name }) => [
      name,
      { label: name, color: JOB_STATUS_COLORS[name] || "hsl(215, 16%, 47%)" },
    ])
  );

  const requestsPerDay = (auditStats.data?.requestsPerDay ?? []).map(
    (d: { date: string; count: number; errors: number }) => ({
      date: shortDate(d.date),
      success: d.count - d.errors,
      errors: d.errors,
    })
  );

  const dailyUsers = (trafficStats.data?.daily ?? []).map(
    (d: { date: string; userCount: number }) => ({
      date: shortDate(d.date),
      userCount: d.userCount,
    })
  );

  // --- KPI cards data ---

  const kpiCards: {
    label: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    color?: string;
  }[] = [
    {
      label: "Active Today",
      value: formatNumber(trafficStats.data?.totals?.activeToday),
      icon: Users,
    },
    {
      label: "Total Users",
      value: formatNumber(trafficStats.data?.totals?.totalUsers),
      icon: UserCheck,
    },
    {
      label: "API Requests (7d)",
      value: formatNumber(auditStats.data?.totalRequests),
      icon: Activity,
    },
    {
      label: "Error Rate",
      value: formatPercent(auditStats.data?.errorRate),
      icon: AlertTriangle,
      color:
        (auditStats.data?.errorRate ?? 0) > 0.05 ? "text-red-600" : undefined,
    },
    {
      label: "Avg Latency",
      value: formatMs(apiHealth.data?.summary?.avgLatencyMs),
      icon: Clock,
    },
    {
      label: "P95 Latency",
      value: formatMs(apiHealth.data?.summary?.p95LatencyMs),
      icon: Timer,
    },
    {
      label: "LLM Cost (7d)",
      value: formatCost(auditStats.data?.totalCost),
      icon: DollarSign,
    },
    {
      label: "Media Completed",
      value: formatNumber(kieAiHealth.data?.summary?.completed),
      icon: CheckCircle,
    },
    {
      label: "Media Failed",
      value: formatNumber(kieAiHealth.data?.summary?.failed),
      icon: XCircle,
      color:
        (kieAiHealth.data?.summary?.failed ?? 0) > 0
          ? "text-red-600"
          : undefined,
    },
    {
      label: "Jobs Processing",
      value: formatNumber(
        jobsHealth.data?.countsByStatus?.processing as number | undefined
      ),
      icon: Zap,
    },
    {
      label: "Storage",
      value: formatGb(storageStats.data?.totalSizeGb),
      icon: HardDrive,
    },
    {
      label: "Rate Limits",
      value: formatNumber(securityStats.data?.totalRateLimitKeys),
      icon: Shield,
    },
  ];

  // --- Health strip data ---

  type HealthItem = { label: string; status: string };
  const healthItems: HealthItem[] = [];

  // Python backend
  const sysStatus = systemHealth.data?.status;
  healthItems.push({
    label: "Python Backend",
    status:
      sysStatus === "error" || sysStatus === "unreachable"
        ? "error"
        : (sysStatus ?? "unknown"),
  });

  // Services from Python health
  const services = systemHealth.data?.services;
  if (services && typeof services === "object") {
    for (const [key, val] of Object.entries(services)) {
      if (val && typeof val === "object" && "status" in val) {
        healthItems.push({
          label: key.charAt(0).toUpperCase() + key.slice(1),
          status: (val as { status: string }).status,
        });
      }
    }
  }

  // Redis
  if (redisHealth.data) {
    const rh = redisHealth.data as Record<string, { healthy?: boolean }>;
    if (rh.cache)
      healthItems.push({
        label: "Redis Cache",
        status: rh.cache.healthy ? "healthy" : "error",
      });
    if (rh.realtime)
      healthItems.push({
        label: "Redis Realtime",
        status: rh.realtime.healthy ? "healthy" : "error",
      });
  }

  // Monitoring
  if (monitoringStatus.data) {
    const ms = monitoringStatus.data as Record<
      string,
      { configured?: boolean }
    >;
    if (ms.sentry)
      healthItems.push({
        label: "Sentry",
        status: ms.sentry.configured ? "healthy" : "warning",
      });
    if (ms.posthog)
      healthItems.push({
        label: "PostHog",
        status: ms.posthog.configured ? "healthy" : "warning",
      });
  }

  // --- Quick links ---

  const quickLinks = [
    { label: "Skill Revenue", icon: DollarSign, path: "/admin/skill-revenue" },
    { label: "Ops Dashboard", icon: Activity, path: "/admin/ops" },
    { label: "Queue Dashboard", icon: Gauge, path: "/admin/queues" },
    { label: "LLM Monitor", icon: Brain, path: "/admin/queues/llm" },
    { label: "LLM Models", icon: Cpu, path: "/admin/llm-models" },
    { label: "Media Monitor", icon: PlayCircle, path: "/admin/queues/media" },
    { label: "Audit Logs", icon: Shield, path: "/admin/audit-logs" },
    {
      label: "Orchestration Logs",
      icon: Workflow,
      path: "/admin/orchestration-logs",
    },
    { label: "Infrastructure", icon: Server, path: "/admin/settings" },
    { label: "Users", icon: Users, path: "/admin/users" },
    { label: "Tenants", icon: Building2, path: "/admin/tenants" },
    { label: "Packages", icon: Package, path: "/admin/packages" },
    { label: "Settings", icon: Settings, path: "/admin/settings" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                  <LayoutDashboard className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">Admin Overview</h1>
                  <p className="text-xs text-muted-foreground">
                    System-wide operational summary
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <LocaleToggle className="shrink-0" />
              <Badge variant={refreshInterval ? "default" : "secondary"}>
                {refreshInterval ? "Auto-refresh: 30s" : "Paused"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setRefreshInterval(prev => (prev ? null : 30000))
                }
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${refreshInterval ? "animate-spin" : ""}`}
                />
                {refreshInterval ? "Pause" : "Resume"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Section A: KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {kpiCards.map(({ label, value, icon: Icon, color }) => (
            <DashboardKpiCard
              key={label}
              icon={Icon}
              label={label}
              value={value}
              valueClassName={color}
            />
          ))}
        </div>

        {/* Pending Approvals Banner */}
        {(pendingApprovals.data?.total ?? 0) > 0 && (
          <DashboardCard className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-700">
            <div className="py-3 px-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
                  <Clock className="h-4.5 w-4.5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {pendingApprovals.data!.total} items pending approval
                  </p>
                  <div className="flex gap-2 mt-0.5">
                    {pendingApprovals.data!.skills > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-amber-100 text-amber-700"
                      >
                        {pendingApprovals.data!.skills} Skills
                      </Badge>
                    )}
                    {pendingApprovals.data!.agencies > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-amber-100 text-amber-700"
                      >
                        {pendingApprovals.data!.agencies} Agencies
                      </Badge>
                    )}
                    {pendingApprovals.data!.templates > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-amber-100 text-amber-700"
                      >
                        {pendingApprovals.data!.templates} Templates
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setLocation("/admin/approvals")}
              >
                Review All
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
            </div>
          </DashboardCard>
        )}

        {/* Workpack Release Health Banner */}
        {workpackReleaseHealth.data?.blockers?.length ? (
          <DashboardCard className="border-sky-300 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-700">
            <div className="py-3 px-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-4.5 w-4.5 text-sky-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">
                    {workpackReleaseHealth.data.blockers.length} workpack(s) need release attention
                  </p>
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {workpackReleaseHealth.data.blockers.slice(0, 4).map((item: any) => (
                      <Badge
                        key={item.workpackId}
                        variant="secondary"
                        className="text-[10px] bg-sky-100 text-sky-700"
                      >
                        {item.workpackId} · {item.gateResult}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700 text-white"
                onClick={() => setLocation("/workpacks/roi")}
              >
                Open ROI
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Button>
            </div>
          </DashboardCard>
        ) : null}

        <DashboardCard
          title="Workpack Access"
          description="Jump straight to the workpack surfaces that are reachable from this dashboard."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {workpackAccessActions.map((action) => (
              <button
                key={action.label}
                onClick={() => setLocation(action.href)}
                className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{action.label}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </DashboardCard>

        {/* Section B: Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart 1: Daily Active Users */}
          <DashboardCard>
            <div className="pb-2">
              <h3 className="text-sm font-medium">Daily Active Users (7d)</h3>
            </div>
            <div>
              {dailyUsers.length > 0 ? (
                <ChartContainer
                  config={dailyUsersConfig}
                  className="h-[200px] w-full aspect-auto"
                >
                  <AreaChart data={dailyUsers}>
                    <defs>
                      <linearGradient
                        id="fillUsers"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="var(--color-userCount)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-userCount)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={30}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="userCount"
                      stroke="var(--color-userCount)"
                      fill="url(#fillUsers)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  {trafficStats.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "No data"
                  )}
                </div>
              )}
            </div>
          </DashboardCard>

          {/* Chart 2: API Requests per Day */}
          <DashboardCard>
            <div className="pb-2">
              <h3 className="text-sm font-medium">API Requests per Day (7d)</h3>
            </div>
            <div>
              {requestsPerDay.length > 0 ? (
                <ChartContainer
                  config={requestsConfig}
                  className="h-[200px] w-full aspect-auto"
                >
                  <BarChart data={requestsPerDay}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="success"
                      stackId="a"
                      fill="var(--color-success)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="errors"
                      stackId="a"
                      fill="var(--color-errors)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  {auditStats.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "No data"
                  )}
                </div>
              )}
            </div>
          </DashboardCard>

          {/* Chart 3: Job Status Distribution */}
          <DashboardCard>
            <div className="pb-2">
              <h3 className="text-sm font-medium">Job Status Distribution</h3>
            </div>
            <div>
              {jobStatusData.length > 0 ? (
                <ChartContainer
                  config={jobsPieConfig}
                  className="h-[200px] w-full aspect-auto"
                >
                  <PieChart>
                    <ChartTooltip
                      content={<ChartTooltipContent nameKey="name" />}
                    />
                    <Pie
                      data={jobStatusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {jobStatusData.map(entry => (
                        <Cell
                          key={entry.name}
                          fill={
                            JOB_STATUS_COLORS[entry.name] ||
                            "hsl(215, 16%, 47%)"
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  {jobsHealth.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "No jobs data"
                  )}
                </div>
              )}
              {/* Legend */}
              {jobStatusData.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  {jobStatusData.map(({ name, value }) => (
                    <div key={name} className="flex items-center gap-1 text-xs">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: JOB_STATUS_COLORS[name] || "#999",
                        }}
                      />
                      <span className="text-muted-foreground">
                        {name}: {value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Section B2: LLM & Media Usage Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 4: LLM Usage per Day */}
          <DashboardCard>
            <div className="pb-2 flex flex-row items-center justify-between">
              <h3 className="text-sm font-medium">LLM Usage per Day (7d)</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1"
                onClick={() => setLocation("/admin/queues/llm")}
              >
                View all <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div>
              {llmChartData.length > 0 ? (
                <ChartContainer
                  config={llmChartConfig}
                  className="h-[200px] w-full aspect-auto"
                >
                  <BarChart data={llmChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {llmModels.map((model, i) => (
                      <Bar
                        key={model}
                        dataKey={model}
                        stackId="a"
                        fill={LLM_MODEL_COLORS[i] ?? LLM_MODEL_COLORS[5]}
                        radius={[0, 0, 0, 0]}
                      />
                    ))}
                    {llmChartData.some(d => "Other" in d) && (
                      <Bar
                        dataKey="Other"
                        stackId="a"
                        fill={LLM_MODEL_COLORS[5]}
                        radius={[4, 4, 0, 0]}
                      />
                    )}
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  {dailyLlmUsage.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "No LLM data"
                  )}
                </div>
              )}
              {llmChartData.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  {Object.entries(llmChartConfig).map(([key, conf]) => (
                    <div key={key} className="flex items-center gap-1 text-xs">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: conf.color as string }}
                      />
                      <span
                        className="text-muted-foreground truncate max-w-[100px]"
                        title={key}
                      >
                        {String(conf.label ?? key)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardCard>

          {/* Chart 5: Media Usage per Day */}
          <DashboardCard>
            <div className="pb-2 flex flex-row items-center justify-between">
              <h3 className="text-sm font-medium">Media Usage per Day (7d)</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1"
                onClick={() => setLocation("/admin/queues/media")}
              >
                View all <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div>
              {mediaChartData.length > 0 ? (
                <ChartContainer
                  config={mediaUsageConfig}
                  className="h-[200px] w-full aspect-auto"
                >
                  <BarChart data={mediaChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="image"
                      stackId="a"
                      fill="var(--color-image)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="video"
                      stackId="a"
                      fill="var(--color-video)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="audio"
                      stackId="a"
                      fill="var(--color-audio)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                  {dailyMediaUsage.isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "No media data"
                  )}
                </div>
              )}
              {mediaChartData.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  {Object.entries(mediaUsageConfig).map(([key, conf]) => (
                    <div key={key} className="flex items-center gap-1 text-xs">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: conf.color as string }}
                      />
                      <span className="text-muted-foreground">
                        {String(conf.label ?? key)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Section C: System Health Strip */}
        <DashboardCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">System Health</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {healthItems.length > 0 ? (
              healthItems.map(({ label, status }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 border text-xs"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${healthColor(status)}`}
                  />
                  <span>{label}</span>
                </div>
              ))
            ) : systemHealth.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-xs text-muted-foreground">
                Health data unavailable
              </span>
            )}
          </div>
        </DashboardCard>

        {/* Section D: Quick Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Recent Failures */}
          <DashboardCard>
            <div className="pb-2 flex flex-row items-center justify-between">
              <h3 className="text-sm font-medium">Recent Failures</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1"
                onClick={() => setLocation("/admin/ops")}
              >
                View all <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div>
              {jobsHealth.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              ) : jobsHealth.data?.recentFailures?.length ? (
                <div className="space-y-2">
                  {jobsHealth.data.recentFailures.slice(0, 5).map(f => (
                    <div key={f.id} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate max-w-[140px]">
                          {f.queue || "unknown"}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {timeAgo(f.createdAt)}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate">
                        {f.error || "No error message"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-green-600">No recent failures</p>
              )}
            </div>
          </DashboardCard>

          {/* Storage Breakdown */}
          <DashboardCard>
            <div className="pb-2 flex flex-row items-center justify-between">
              <h3 className="text-sm font-medium">Storage Breakdown</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-auto p-1"
                onClick={() => setLocation("/admin/ops")}
              >
                View all <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div>
              {storageStats.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              ) : storageStats.data?.prefixes?.length ? (
                <div className="space-y-2">
                  {storageStats.data.prefixes
                    .slice(0, 5)
                    .map(
                      (p: {
                        name: string;
                        sizeGb: number;
                        objectCount: number;
                      }) => {
                        const maxGb = Math.max(
                          ...storageStats.data!.prefixes.map(
                            (x: { sizeGb: number }) => x.sizeGb
                          ),
                          1
                        );
                        const pct = (p.sizeGb / maxGb) * 100;
                        return (
                          <div key={p.name} className="text-xs">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="truncate max-w-[140px]">
                                {p.name}
                              </span>
                              <span className="text-muted-foreground shrink-0">
                                {p.sizeGb.toFixed(2)} GB
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      }
                    )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No storage data</p>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Section E: Quick Links */}
        <DashboardCard className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Quick Links</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {quickLinks.map(({ label, icon: Icon, path }) => (
              <Button
                key={path + label}
                variant="outline"
                className="h-auto p-3 flex flex-col items-center gap-1.5"
                onClick={() => setLocation(path)}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs">{label}</span>
              </Button>
            ))}
          </div>
        </DashboardCard>
      </main>
    </div>
  );
}
