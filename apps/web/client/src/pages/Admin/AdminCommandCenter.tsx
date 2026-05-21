import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LocaleToggle } from "@/components/LocaleToggle";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { useDesktopHostStatus } from "@/features/desktop-host/useDesktopHostStatus";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import {
  OpsEarlyWarningPanel,
  type OpsOverview,
} from "@/components/admin/OpsEarlyWarningPanel";
import { cn } from "@/lib/utils";
import { buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCheck,
  ChevronRight,
  Clock3,
  ClipboardList,
  ExternalLink,
  Gauge,
  Loader2,
  MonitorPlay,
  Package,
  RefreshCw,
  Server,
  ShieldAlert,
  Siren,
  Workflow,
} from "lucide-react";

type MonitoringAlert = {
  id: number;
  severity: string;
  title: string;
  message: string;
  acknowledged: boolean;
  acknowledgedAt: Date | string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
};

type UnifiedNotification = {
  id: string;
  source: "user" | "orchestrator" | "guardian";
  title: string;
  content: string | null;
  priority: string;
  isRead: boolean;
  isDismissed: boolean;
  actionUrl: string | null;
  createdAt: string | Date;
};

type OpsIncidentTimelineItem = {
  groupKey: string;
  title: string;
  severity: string;
  category: string | null;
  status: "alerted" | "awaiting_action" | "acknowledged";
  latestMessage: string;
  signal: string | null;
  recommendation: string | null;
  totalAlertCount: number;
  openAlertCount: number;
  firstObservedAt: string | null;
  lastCheckedAt: string | null;
  lastAlertAt: string;
  lastAcknowledgedAt: string | null;
  lastAcknowledgedByName: string | null;
  lastAcknowledgedByEmail: string | null;
  latestActionNote: string | null;
  currentOwnerId: number | null;
  currentOwnerName: string | null;
  currentOwnerEmail: string | null;
  latestResponseType:
    | "acknowledged"
    | "note"
    | "handoff"
    | "resolved"
    | "reopened"
    | null;
  latestResponseAt: string | null;
  latestResponseByName: string | null;
  latestResponseByEmail: string | null;
  latestResponseNote: string | null;
  resolutionNote: string | null;
  reopenReason: string | null;
  responseHistory: Array<{
    type: "acknowledged" | "note" | "handoff" | "resolved" | "reopened";
    at: string;
    actorId?: number | null;
    actorName?: string | null;
    actorEmail?: string | null;
    note?: string | null;
    ownerId?: number | null;
    ownerName?: string | null;
    ownerEmail?: string | null;
  }>;
  notification: {
    sent: boolean;
    firstSentAt: string | null;
    lastSentAt: string | null;
    recipientCount: number;
    readCount: number;
    occurrenceCount: number;
    latestTitle: string | null;
  };
};

function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000)
  );
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function formatAbsoluteTime(value: string | Date | null | undefined): string {
  if (!value) return "No record";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString();
}

function healthBadgeClass(health: OpsOverview["health"] | undefined): string {
  switch (health) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

function alertSeverityClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "error":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function notificationSourceClass(source: string): string {
  switch (source) {
    case "guardian":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "orchestrator":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function incidentStatusClass(
  status: OpsIncidentTimelineItem["status"]
): string {
  switch (status) {
    case "acknowledged":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "awaiting_action":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function incidentStatusLabel(
  status: OpsIncidentTimelineItem["status"]
): string {
  switch (status) {
    case "acknowledged":
      return "Actioned";
    case "awaiting_action":
      return "Awaiting action";
    default:
      return "Alerted";
  }
}

function buildIncidentMonitoringPath(groupKey?: string | null): string {
  if (!groupKey) return "/admin/monitoring";
  return `/admin/monitoring?tab=alerts&incident=${encodeURIComponent(groupKey)}`;
}

function parseAlertMetadata(metadata: Record<string, unknown> | null): {
  acknowledgement?: {
    actorName?: string | null;
    actorEmail?: string | null;
    note?: string | null;
  };
  incidentResponse?: {
    currentOwnerName?: string | null;
    currentOwnerEmail?: string | null;
    latestEventType?:
      | "acknowledged"
      | "note"
      | "handoff"
      | "resolved"
      | "reopened"
      | null;
    latestEventAt?: string | null;
    latestEventActorName?: string | null;
    latestEventActorEmail?: string | null;
    latestNote?: string | null;
    resolutionNote?: string | null;
    reopenReason?: string | null;
  };
} {
  if (!metadata || typeof metadata !== "object") return {};
  return metadata as {
    acknowledgement?: {
      actorName?: string | null;
      actorEmail?: string | null;
      note?: string | null;
    };
    incidentResponse?: {
      currentOwnerName?: string | null;
      currentOwnerEmail?: string | null;
      latestEventType?:
        | "acknowledged"
        | "note"
        | "handoff"
        | "resolved"
        | "reopened"
        | null;
      latestEventAt?: string | null;
      latestEventActorName?: string | null;
      latestEventActorEmail?: string | null;
      latestNote?: string | null;
      resolutionNote?: string | null;
      reopenReason?: string | null;
    };
  };
}

function incidentResponseLabel(
  type: OpsIncidentTimelineItem["latestResponseType"] | undefined | null
): string {
  switch (type) {
    case "acknowledged":
      return "Acknowledged";
    case "handoff":
      return "Ownership updated";
    case "resolved":
      return "Resolved";
    case "reopened":
      return "Reopened";
    case "note":
      return "Operator note";
    default:
      return "No operator update";
  }
}

export default function AdminCommandCenter() {
  const { user, loading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [refreshInterval, setRefreshInterval] = useState<number | null>(30_000);
  const incidentRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const desktopHostEnabled = useTenantFeatureFlag("desktopHostEnabled");
  const desktopGovernanceStatus = useDesktopHostStatus(
    desktopHostEnabled
      && Boolean(user?.currentTenantId)
      && (user?.role === "admin" || user?.role === "domain_admin"),
    "tenant",
  );
  const desktopGovernancePath =
    user?.role === "admin"
      ? "/admin/desktop-host/governance"
      : "/domain-admin/desktop-host/governance";

  const queryOptions = {
    refetchInterval: refreshInterval ?? false,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  } as const;

  const opsOverviewQuery = trpc.monitoring.getOpsOverview.useQuery(
    undefined,
    queryOptions
  );
  const currentStatusQuery = trpc.monitoring.getCurrentStatus.useQuery(
    undefined,
    queryOptions
  );
  const incidentTimelineQuery = trpc.monitoring.getOpsIncidentTimeline.useQuery(
    { limit: 6 },
    queryOptions
  );
  const alertsQuery = trpc.monitoring.getAlerts.useQuery(
    { page: 1, limit: 8 },
    queryOptions
  );
  const notificationStatsQuery = trpc.monitoring.getUnifiedStats.useQuery(
    undefined,
    queryOptions
  );
  const notificationsQuery = trpc.monitoring.getUnifiedNotifications.useQuery(
    { limit: 6, page: 0 },
    queryOptions
  );
  const queueSystemQuery = trpc.queues.getSystemStatus.useQuery(
    undefined,
    queryOptions
  );
  const syncOpsAlertsMutation = trpc.monitoring.syncOpsAlerts.useMutation({
    onSuccess: result => {
      toast.success(
        `Alert sync complete: ${result.emittedAlerts} alerts, ${result.emittedNotifications} notifications, ${result.skippedAsDuplicate} duplicates skipped.`
      );
      void Promise.all([
        opsOverviewQuery.refetch(),
        currentStatusQuery.refetch(),
        incidentTimelineQuery.refetch(),
        alertsQuery.refetch(),
        notificationStatsQuery.refetch(),
        notificationsQuery.refetch(),
      ]);
    },
    onError: error => {
      toast.error(error.message || "Failed to run alert sync");
    },
  });

  const isLoading =
    authLoading ||
    opsOverviewQuery.isLoading ||
    currentStatusQuery.isLoading ||
    incidentTimelineQuery.isLoading ||
    alertsQuery.isLoading ||
    notificationStatsQuery.isLoading ||
    notificationsQuery.isLoading;

  const alerts =
    (alertsQuery.data?.alerts as MonitoringAlert[] | undefined) ?? [];
  const notifications =
    (notificationsQuery.data?.items as UnifiedNotification[] | undefined) ?? [];
  const incidentTimeline =
    (incidentTimelineQuery.data?.items as
      | OpsIncidentTimelineItem[]
      | undefined) ?? [];
  const opsOverview = opsOverviewQuery.data;
  const currentStatus = currentStatusQuery.data;
  const queueSystem = queueSystemQuery.data;
  const selectedIncidentKey = useMemo(() => {
    const search = location.includes("?")
      ? location.slice(location.indexOf("?"))
      : "";
    return new URLSearchParams(search).get("incident");
  }, [location]);

  const latestAlert = alerts[0] ?? null;
  const latestAcknowledgedAlert =
    alerts
      .filter(alert => Boolean(alert.acknowledgedAt))
      .sort(
        (a, b) =>
          new Date(b.acknowledgedAt ?? 0).getTime() -
          new Date(a.acknowledgedAt ?? 0).getTime()
      )[0] ?? null;
  const latestOperatorUpdate =
    alerts
      .map(alert => {
        const metadata = parseAlertMetadata(alert.metadata);
        return {
          alert,
          response: metadata.incidentResponse,
          responseAt: metadata.incidentResponse?.latestEventAt
            ? new Date(metadata.incidentResponse.latestEventAt).getTime()
            : 0,
        };
      })
      .sort((a, b) => b.responseAt - a.responseAt)[0] ?? null;

  const serviceSummary = useMemo(() => {
    const services = currentStatus?.services ?? [];
    const totals = { healthy: 0, degraded: 0, critical: 0 };

    for (const service of services) {
      const normalized = String(service.status ?? "").toLowerCase();
      if (["running", "ok", "healthy", "active"].includes(normalized)) {
        totals.healthy += 1;
      } else if (
        ["warning", "degraded", "starting", "unknown", "restarting"].includes(
          normalized
        )
      ) {
        totals.degraded += 1;
      } else {
        totals.critical += 1;
      }
    }

    return totals;
  }, [currentStatus?.services]);

  const queueSummary = useMemo(() => {
    const totalQueued = queueSystem?.limiters?.totalQueued ?? 0;
    const cloudTasks = queueSystem?.cloudTasks?.totalTasks ?? 0;
    return {
      totalQueued,
      cloudTasks,
      combined: totalQueued + cloudTasks,
    };
  }, [queueSystem]);

  const workpackHubActions = [
    {
      title: "Intake Studio",
      description: "Start a governed workpack from incoming work.",
      path: buildWorkpackEntrypointHref({
        entrypoint: "dashboard",
        surface: "intake",
      }),
      icon: ClipboardList,
    },
    {
      title: "Discovery Library",
      description: "Browse reusable starter and benchmark packs.",
      path: buildWorkpackEntrypointHref({
        entrypoint: "dashboard",
        surface: "discovery",
      }),
      icon: Package,
    },
    {
      title: "ROI Dashboard",
      description: "Track readiness, blockers, and roadmap progress.",
      path: buildWorkpackEntrypointHref({
        entrypoint: "dashboard",
        surface: "roi",
      }),
      icon: Gauge,
    },
    {
      title: "Exceptions Inbox",
      description: "Review connector and policy exceptions.",
      path: buildWorkpackEntrypointHref({
        entrypoint: "dashboard",
        surface: "exceptions",
      }),
      icon: AlertTriangle,
    },
  ];

  const drilldowns = [
    {
      title: "Monitoring & Alert Inbox",
      description:
        "See checks, alert status, acknowledgements, and freshness in one place.",
      path: "/admin/monitoring",
      icon: Siren,
      badge: `${(currentStatus?.alerts.critical ?? 0) + (currentStatus?.alerts.warning ?? 0)} open`,
    },
    {
      title: "Services & Runtime",
      description:
        "Inspect service state, Docker runtime, CPU, memory, and logs.",
      path: "/admin/services",
      icon: Server,
      badge: `${serviceSummary.critical} critical`,
    },
    {
      title: "Queues & Workers",
      description:
        "Check queued load, worker pressure, and backlog before jobs stall.",
      path: "/admin/queues",
      icon: Gauge,
      badge: `${queueSummary.combined} queued`,
    },
    {
      title: "Desktop Governance",
      description:
        "See enrolled desktop devices, owner posture, local roots, package trust, and remote access controls.",
      path: desktopGovernancePath,
      icon: MonitorPlay,
      badge: !desktopHostEnabled
        ? "disabled"
        : desktopGovernanceStatus.isLoading
          ? "loading"
          : `${desktopGovernanceStatus.status?.devices.length ?? 0} devices`,
    },
    {
      title: "Audit Logs",
      description:
        "Trace failures, provider errors, and request anomalies in detail.",
      path: "/admin/audit-logs",
      icon: ShieldAlert,
      badge: `${opsOverview?.summary.auditCount ?? 0} risks`,
    },
    {
      title: "Orchestration Logs",
      description:
        "Review fallback spikes, classify latency, and quality-gate drift.",
      path: "/admin/orchestration-logs",
      icon: Workflow,
      badge: `${opsOverview?.summary.orchestrationCount ?? 0} risks`,
    },
    {
      title: "Notifications & Rules",
      description:
        "Confirm alerts were sent and tune escalation or delivery rules.",
      path: "/admin/notifications",
      icon: BellRing,
      badge: `${notificationStatsQuery.data?.today ?? 0} today`,
    },
  ];

  const handleRefresh = async () => {
    await Promise.all([
      opsOverviewQuery.refetch(),
      currentStatusQuery.refetch(),
      incidentTimelineQuery.refetch(),
      alertsQuery.refetch(),
      notificationStatsQuery.refetch(),
      notificationsQuery.refetch(),
      queueSystemQuery.refetch(),
    ]);
    desktopGovernanceStatus.refresh();
  };

  useEffect(() => {
    if (!selectedIncidentKey) return;
    const node = incidentRefs.current.get(selectedIncidentKey);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [incidentTimeline, selectedIncidentKey]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "domain_admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <DashboardCard
          className="w-96"
          title="Access Denied"
          description="You need admin privileges to access this page."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <header className="sticky top-0 z-10 border-b bg-white/70 backdrop-blur-xl">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/dashboard")}
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Dashboard
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold">Admin Command Center</h1>
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize",
                      healthBadgeClass(opsOverview?.health)
                    )}
                  >
                    {opsOverview?.health ?? "healthy"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Start here first. This page shows what changed recently, what
                  has already alerted, and whether anyone acted on it.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LocaleToggle className="shrink-0" />
              <Badge variant={refreshInterval ? "default" : "secondary"}>
                {refreshInterval ? "Auto-refresh: 30s" : "Paused"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setRefreshInterval(prev => (prev ? null : 30_000))
                }
              >
                <RefreshCw
                  className={cn(
                    "mr-2 h-4 w-4",
                    refreshInterval ? "animate-spin" : ""
                  )}
                />
                {refreshInterval ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRefresh()}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  syncOpsAlertsMutation.mutate({ includeWarnings: true })
                }
                disabled={syncOpsAlertsMutation.isPending}
              >
                {syncOpsAlertsMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <BellRing className="mr-2 h-4 w-4" />
                )}
                Run Alert Sync
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <DashboardKpiCard
            icon={Activity}
            label="Active Anomalies"
            value={opsOverview?.summary.totalAnomalies ?? 0}
          />
          <DashboardKpiCard
            icon={AlertTriangle}
            label="Critical Alerts Open"
            value={currentStatus?.alerts.critical ?? 0}
            valueClassName={
              (currentStatus?.alerts.critical ?? 0) > 0
                ? "text-rose-600"
                : undefined
            }
          />
          <DashboardKpiCard
            icon={Clock3}
            label="Last Monitoring Check"
            value={formatRelativeTime(currentStatus?.lastCheck)}
            subLabel={formatAbsoluteTime(currentStatus?.lastCheck)}
          />
          <DashboardKpiCard
            icon={BellRing}
            label="Last Alert Sent"
            value={formatRelativeTime(latestAlert?.createdAt)}
            subLabel={formatAbsoluteTime(latestAlert?.createdAt)}
          />
          <DashboardKpiCard
            icon={CheckCheck}
            label="Last Operator Update"
            value={formatRelativeTime(
              latestOperatorUpdate?.response?.latestEventAt ??
                latestAcknowledgedAlert?.acknowledgedAt
            )}
            subLabel={formatAbsoluteTime(
              latestOperatorUpdate?.response?.latestEventAt ??
                latestAcknowledgedAlert?.acknowledgedAt
            )}
          />
          <DashboardKpiCard
            icon={Gauge}
            label="Queue Pressure"
            value={queueSummary.combined}
            subLabel={`${queueSummary.totalQueued} limiter + ${queueSummary.cloudTasks} cloud tasks`}
          />
        </div>

        <DashboardCard
          title="Workpack Hub"
          description="Jump directly into the workpack surfaces used most often by operators."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workpackHubActions.map((action) => (
              <button
                key={action.title}
                type="button"
                className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
                onClick={() => setLocation(action.path)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </DashboardCard>

        <OpsEarlyWarningPanel
          overview={opsOverview}
          isLoading={opsOverviewQuery.isLoading}
          maxItems={6}
          showMonitoringLink={false}
          description="A single operational view of resource pressure, queue backlog, audit spikes, fallback drift, and alert freshness before the server tips into outage."
        />

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <DashboardCard
            title="Operational Evidence"
            description="Concrete signals that prove monitoring is alive, alerts are being emitted, and operators are responding."
          >
            <div className="space-y-3">
              <EvidenceRow
                label="Latest ops summary refresh"
                value={formatRelativeTime(opsOverview?.updatedAt)}
                detail={formatAbsoluteTime(opsOverview?.updatedAt)}
              />
              <EvidenceRow
                label="Latest monitoring check"
                value={formatRelativeTime(currentStatus?.lastCheck)}
                detail={`${currentStatus?.services.length ?? 0} services included`}
              />
              <EvidenceRow
                label="Latest alert emission"
                value={formatRelativeTime(latestAlert?.createdAt)}
                detail={
                  latestAlert ? latestAlert.title : "No alerts emitted yet"
                }
              />
              <EvidenceRow
                label="Latest acknowledgement"
                value={formatRelativeTime(
                  latestAcknowledgedAlert?.acknowledgedAt
                )}
                detail={
                  latestAcknowledgedAlert
                    ? (() => {
                        const ackMeta = parseAlertMetadata(
                          latestAcknowledgedAlert.metadata
                        ).acknowledgement;
                        if (ackMeta?.actorName && ackMeta?.note) {
                          return `${ackMeta.actorName}: ${ackMeta.note}`;
                        }
                        if (ackMeta?.actorName) {
                          return `${latestAcknowledgedAlert.title} • ${ackMeta.actorName}`;
                        }
                        return latestAcknowledgedAlert.title;
                      })()
                    : "No acknowledgement yet"
                }
              />
              <EvidenceRow
                label="Notifications sent today"
                value={String(notificationStatsQuery.data?.today ?? 0)}
                detail={`${notificationStatsQuery.data?.critical ?? 0} critical notifications in the unified center`}
              />
            </div>
          </DashboardCard>

          <DashboardCard
            title="System Readiness"
            description="What matters most before a failure becomes user-visible."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ReadinessStat
                label="Healthy Services"
                value={serviceSummary.healthy}
                tone="positive"
              />
              <ReadinessStat
                label="Degraded Services"
                value={serviceSummary.degraded}
                tone="warning"
              />
              <ReadinessStat
                label="Critical Services"
                value={serviceSummary.critical}
                tone="critical"
              />
              <ReadinessStat
                label="Open Warning Alerts"
                value={currentStatus?.alerts.warning ?? 0}
                tone={
                  (currentStatus?.alerts.warning ?? 0) > 0
                    ? "warning"
                    : "neutral"
                }
              />
            </div>
          </DashboardCard>
        </div>

        <DashboardCard
          title="Incident Response Timeline"
          description="A concrete chain for each grouped incident: when monitoring last checked, when the alert was raised, when notifications went out, and whether the operator loop was closed."
          trailing={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLocation(buildIncidentMonitoringPath(selectedIncidentKey))
              }
            >
              Open Monitoring
            </Button>
          }
        >
          <div className="space-y-4">
            {incidentTimeline.length === 0 ? (
              <EmptyState copy="No grouped incidents yet. When an anomaly triggers and enters the response loop, it will appear here with alert, notification, and acknowledgement evidence." />
            ) : (
              incidentTimeline.map(item => (
                <div
                  key={item.groupKey}
                  ref={node => {
                    incidentRefs.current.set(item.groupKey, node);
                  }}
                  className={cn(
                    "rounded-[24px] border bg-white/80 p-4 transition-all",
                    item.groupKey === selectedIncidentKey
                      ? "border-sky-400 ring-2 ring-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.25)]"
                      : "border-slate-200"
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {item.title}
                        </p>
                        <Badge
                          variant="outline"
                          className={alertSeverityClass(item.severity)}
                        >
                          {item.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={incidentStatusClass(item.status)}
                        >
                          {incidentStatusLabel(item.status)}
                        </Badge>
                        {item.category ? (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-700"
                          >
                            {item.category}
                          </Badge>
                        ) : null}
                        {item.groupKey === selectedIncidentKey ? (
                          <Badge
                            variant="outline"
                            className="border-sky-200 bg-sky-50 text-sky-700"
                          >
                            Opened from alert
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {item.latestMessage}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                          {item.openAlertCount > 0
                            ? `${item.openAlertCount} open alerts`
                            : "All grouped alerts closed"}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                          {item.notification.sent
                            ? `${item.notification.recipientCount} admins notified`
                            : "No notification sent yet"}
                        </span>
                        {item.notification.sent ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                            {item.notification.readCount} read
                          </span>
                        ) : null}
                        {item.signal ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                            Signal: {item.signal}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setLocation(buildIncidentMonitoringPath(item.groupKey))
                      }
                    >
                      Investigate
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <TimelineStep
                      label="Last Check"
                      value={formatRelativeTime(item.lastCheckedAt)}
                      detail={formatAbsoluteTime(item.lastCheckedAt)}
                      tone="neutral"
                    />
                    <TimelineStep
                      label="Alert Raised"
                      value={formatRelativeTime(item.lastAlertAt)}
                      detail={formatAbsoluteTime(item.lastAlertAt)}
                      tone={item.openAlertCount > 0 ? "critical" : "warning"}
                    />
                    <TimelineStep
                      label="Notification Sent"
                      value={
                        item.notification.sent
                          ? formatRelativeTime(item.notification.lastSentAt)
                          : "Not sent"
                      }
                      detail={
                        item.notification.sent
                          ? `${formatAbsoluteTime(item.notification.lastSentAt)} • ${item.notification.occurrenceCount} grouped sends`
                          : "No guardian notification was recorded for this incident yet"
                      }
                      tone={item.notification.sent ? "warning" : "neutral"}
                    />
                    <TimelineStep
                      label="Acknowledged"
                      value={
                        item.lastAcknowledgedAt
                          ? formatRelativeTime(item.lastAcknowledgedAt)
                          : "Pending"
                      }
                      detail={
                        item.lastAcknowledgedAt
                          ? `${formatAbsoluteTime(item.lastAcknowledgedAt)}${item.lastAcknowledgedByName ? ` • ${item.lastAcknowledgedByName}` : ""}`
                          : "No acknowledgement recorded yet"
                      }
                      tone={item.lastAcknowledgedAt ? "positive" : "critical"}
                    />
                  </div>

                  {item.firstObservedAt ||
                  item.recommendation ||
                  item.notification.latestTitle ||
                  item.currentOwnerName ||
                  item.latestResponseType ||
                  item.latestResponseNote ||
                  item.resolutionNote ||
                  item.reopenReason ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
                      {item.firstObservedAt ? (
                        <p>
                          First observed:{" "}
                          {formatAbsoluteTime(item.firstObservedAt)}
                        </p>
                      ) : null}
                      {item.notification.latestTitle ? (
                        <p className="mt-1">
                          Latest notification title:{" "}
                          {item.notification.latestTitle}
                        </p>
                      ) : null}
                      {item.recommendation ? (
                        <p className="mt-1">
                          Recommended action: {item.recommendation}
                        </p>
                      ) : null}
                      {item.currentOwnerName ? (
                        <p className="mt-1">
                          Current owner: {item.currentOwnerName}
                          {item.currentOwnerEmail
                            ? ` (${item.currentOwnerEmail})`
                            : ""}
                        </p>
                      ) : null}
                      {item.latestResponseType ? (
                        <p className="mt-1">
                          Latest operator update:{" "}
                          {incidentResponseLabel(item.latestResponseType)}
                          {item.latestResponseAt
                            ? ` • ${formatAbsoluteTime(item.latestResponseAt)}`
                            : ""}
                          {item.latestResponseByName
                            ? ` • ${item.latestResponseByName}`
                            : ""}
                        </p>
                      ) : null}
                      {item.latestResponseNote ? (
                        <p className="mt-1">
                          Latest action note: {item.latestResponseNote}
                        </p>
                      ) : null}
                      {item.resolutionNote ? (
                        <p className="mt-1 text-emerald-700">
                          Resolution note: {item.resolutionNote}
                        </p>
                      ) : null}
                      {item.reopenReason ? (
                        <p className="mt-1 text-rose-700">
                          Reopen reason: {item.reopenReason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </DashboardCard>

        <div className="grid gap-4 xl:grid-cols-2">
          <DashboardCard
            title="Recent Alerts"
            description="Latest monitoring alerts, whether they were acknowledged, and when they were raised."
            trailing={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLocation(buildIncidentMonitoringPath(selectedIncidentKey))
                }
              >
                Open Monitoring
              </Button>
            }
          >
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <EmptyState copy="No monitoring alerts yet. This usually means either the system is healthy or alert rules have not triggered." />
              ) : (
                alerts.map(alert => (
                  <div
                    key={alert.id}
                    className="rounded-2xl border border-slate-200 bg-white/80 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={alertSeverityClass(alert.severity)}
                      >
                        {alert.severity}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          alert.acknowledged
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }
                      >
                        {alert.acknowledged
                          ? "Acknowledged"
                          : "Waiting for action"}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatRelativeTime(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {alert.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {alert.message}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Raised {formatAbsoluteTime(alert.createdAt)}
                      {alert.acknowledgedAt
                        ? ` • acknowledged ${formatAbsoluteTime(alert.acknowledgedAt)}`
                        : ""}
                    </p>
                    {(() => {
                      const metadata = parseAlertMetadata(alert.metadata);
                      const ackMeta = metadata.acknowledgement;
                      const incidentResponse = metadata.incidentResponse;
                      if (
                        !ackMeta?.actorName &&
                        !ackMeta?.note &&
                        !incidentResponse?.currentOwnerName &&
                        !incidentResponse?.latestNote
                      )
                        return null;
                      return (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
                          {incidentResponse?.currentOwnerName ? (
                            <p>
                              Current owner: {incidentResponse.currentOwnerName}
                              {incidentResponse.currentOwnerEmail
                                ? ` (${incidentResponse.currentOwnerEmail})`
                                : ""}
                            </p>
                          ) : ackMeta?.actorName ? (
                            <p>
                              Owner: {ackMeta.actorName}
                              {ackMeta.actorEmail
                                ? ` (${ackMeta.actorEmail})`
                                : ""}
                            </p>
                          ) : null}
                          {incidentResponse?.latestEventType ? (
                            <p className="mt-1">
                              Latest update:{" "}
                              {incidentResponseLabel(
                                incidentResponse.latestEventType
                              )}
                            </p>
                          ) : null}
                          {incidentResponse?.latestNote ? (
                            <p className="mt-1">
                              Action note: {incidentResponse.latestNote}
                            </p>
                          ) : ackMeta?.note ? (
                            <p className="mt-1">Action note: {ackMeta.note}</p>
                          ) : null}
                          {incidentResponse?.resolutionNote ? (
                            <p className="mt-1">
                              Resolution note: {incidentResponse.resolutionNote}
                            </p>
                          ) : null}
                          {incidentResponse?.reopenReason ? (
                            <p className="mt-1">
                              Reopen reason: {incidentResponse.reopenReason}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                ))
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Recent Notifications"
            description="Latest operator-facing notifications so you can verify that alerts actually reached the admin center."
            trailing={
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/admin/notifications")}
              >
                Open Notifications
              </Button>
            }
          >
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <EmptyState copy="No notifications have been recorded yet." />
              ) : (
                notifications.map(notification => (
                  <button
                    key={notification.id}
                    onClick={() =>
                      setLocation(
                        notification.actionUrl &&
                          notification.actionUrl.startsWith("/")
                          ? notification.actionUrl
                          : "/admin/notifications"
                      )
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={notificationSourceClass(notification.source)}
                      >
                        {notification.source}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={alertSeverityClass(notification.priority)}
                      >
                        {notification.priority}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          notification.isRead
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }
                      >
                        {notification.isRead ? "Read" : "Unread"}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {notification.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {notification.content || "No additional message."}
                    </p>
                  </button>
                ))
              )}
            </div>
          </DashboardCard>
        </div>

        <DashboardCard
          title="Drill Down"
          description="Use these detail pages only when you need to go deeper. Start here, then branch into the exact subsystem."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {drilldowns.map(item => (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-slate-50 text-slate-700"
                    >
                      {item.badge}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {item.description}
                  </p>
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/admin/alert-rules")}
            >
              Alert Rules
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/admin/ops")}
            >
              Advanced Ops Panels
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Button>
          </div>
        </DashboardCard>
      </main>
    </div>
  );
}

function EvidenceRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-sm font-semibold text-slate-900">{value}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReadinessStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "warning" | "critical" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : tone === "critical"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-50 text-slate-700"
      )}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-[0.16em] opacity-80">
        {label}
      </div>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-muted-foreground">
      {copy}
    </div>
  );
}

function TimelineStep({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "warning" | "critical" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50/80"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50/80"
            : tone === "critical"
              ? "border-rose-200 bg-rose-50/80"
              : "border-slate-200 bg-slate-50/80"
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
