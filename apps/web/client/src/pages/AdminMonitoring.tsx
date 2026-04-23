/**
 * Admin Monitoring Page — /admin/monitoring
 *
 * Displays server status, health check history, alerts, and metrics charts.
 * Tabs: Checks | Alerts | Metrics
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTenantFeatureFlags } from "@/hooks/useTenantFeatureFlag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { OpsEarlyWarningPanel, type OpsOverview } from "@/components/admin/OpsEarlyWarningPanel";
import { HelpButton } from "@/components/help/HelpButton";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Badge } from "@/components/ui/badge";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { getOpsIncidentGuidance } from "@/lib/opsMonitoringGuidance";
import { ContextEngineEvaluationDashboard } from "@/components/admin/ContextEngineEvaluationDashboard";
import { KnowledgeVaultReadinessDashboard } from "@/components/admin/KnowledgeVaultReadinessDashboard";
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
  BellRing,
  CheckCheck,
  ClipboardList,
  Copy,
  BookOpen,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";
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
  latestResponseType: "acknowledged" | "note" | "handoff" | "resolved" | "reopened" | null;
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
type WorkOsOverview = {
  byState: Record<string, number>;
  openExceptions: number;
  overdueSla: number;
  completed: number;
};
type AlertMetadata = {
  source?: string;
  dedupeKey?: string;
  category?: string;
  signal?: string;
  recommendation?: string;
  observedAt?: string;
  checkId?: number;
  acknowledgement?: {
    actorId?: number;
    actorName?: string | null;
    actorEmail?: string | null;
    note?: string | null;
    at?: string | null;
  };
  incidentResponse?: {
    currentOwnerId?: number | null;
    currentOwnerName?: string | null;
    currentOwnerEmail?: string | null;
    latestEventType?: "acknowledged" | "note" | "handoff" | "resolved" | "reopened" | null;
    latestEventAt?: string | null;
    latestEventActorName?: string | null;
    latestEventActorEmail?: string | null;
    latestNote?: string | null;
    resolutionNote?: string | null;
    reopenReason?: string | null;
    history?: Array<{
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
  };
};
type AdminUserOption = {
  id: number;
  name: string | null;
  email: string | null;
  role: string | null;
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
type WorkerFleetRow = {
  id: string;
  displayName: string;
  runtimeType: string;
  runtimeLabel: string;
  runtimeFamily: string;
  runtimeVersion: string;
  status: string;
  teamId: string | null;
  externalReference: string;
  lastSeenAt: Date | string | null;
  compatibilityState: "compatible" | "attention_required" | "unknown";
  registrationSupport: "stable" | "feature_gated" | "admin_gated";
  dispatchSupport: "stable" | "limited" | "admin_gated";
  healthState: string;
  warningFlagsJson: string[];
  boundProfileCount: number;
  activeJobCount: number;
  diagnosticsAvailable: boolean;
  dashboardUrl: string | null;
  revokedAt: string | null;
  remoteEndpointPolicy: "loopback_only" | "audited_exception_granted" | "unknown" | null;
  profileName: string | null;
  profileLabel: string | null;
  profilePurpose: string | null;
  personaDisplayLabel: string;
  personaDisplayPurpose: string;
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  channelDisplayLabel: string;
  memorySyncEnabled: boolean;
  memorySyncScope: "personal" | "team_shared" | "workspace_shared" | "cross_channel" | null;
  memorySyncStatus: "disabled" | "active" | "inactive" | "quarantined" | "unknown";
  memorySyncDisplayLabel: string;
  llmRoutingMode: "auto" | "pinned_provider";
  preferredProviderId: number | null;
  preferredProviderName: string | null;
  providerRoutingDisplayLabel: string;
  workerAccessPolicyPreset: string | null;
  workerAccessPolicyScopeCount: number;
  workerAccessPolicyQuotaDisplayLabel: string;
};
type WorkerDiagnosticsSnapshot = {
  workerId: string;
  displayName: string;
  runtimeType: string;
  runtimeLabel: string;
  runtimeFamily: string;
  status: string;
  capturedAt: string | null;
  summaryJson: Record<string, unknown>;
  detailsJson: Record<string, unknown>;
  compatibilityState: "compatible" | "attention_required" | "unknown";
  compatibility: Record<string, unknown> | null;
  warningFlagsJson: string[];
  dashboardUrl: string | null;
  revokedAt: string | null;
  remoteEndpointPolicy: "loopback_only" | "audited_exception_granted" | "unknown" | null;
  profileName: string | null;
  profileLabel: string | null;
  profilePurpose: string | null;
  personaDisplayLabel: string;
  personaDisplayPurpose: string;
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  channelDisplayLabel: string;
  memorySyncEnabled: boolean;
  memorySyncScope: "personal" | "team_shared" | "workspace_shared" | "cross_channel" | null;
  memorySyncStatus: "disabled" | "active" | "inactive" | "quarantined" | "unknown";
  memorySyncDisplayLabel: string;
  llmRoutingMode: "auto" | "pinned_provider";
  preferredProviderId: number | null;
  preferredProviderName: string | null;
  providerRoutingDisplayLabel: string;
  workerAccessPolicyPreset: string | null;
  workerAccessPolicyScopeCount: number;
  workerAccessPolicyQuotaDisplayLabel: string;
};
type WorkerMcpInsightTotals = {
  sessionInitializations: number;
  toolListCalls: number;
  toolCalls: number;
  successCount: number;
  deniedCount: number;
  budgetDeniedCount: number;
  approvalRequiredCount: number;
  replayHitCount: number;
  failureCount: number;
};
type WorkerMcpFamilyMetric = {
  family: string;
  totalCalls: number;
  successCount: number;
  deniedCount: number;
  lastSeenAt: string | null;
};
type WorkerMcpToolMetric = {
  toolName: string;
  family: string;
  totalCalls: number;
  successCount: number;
  deniedCount: number;
  budgetDeniedCount: number;
  approvalRequiredCount: number;
  replayHitCount: number;
  lastSeenAt: string | null;
};
type WorkerMcpRecentEvent = {
  timestamp: string;
  traceId: string;
  event: string;
  toolName: string | null;
  family: string | null;
  reason: string | null;
};
type WorkerMcpInsights = {
  workerId: string;
  displayName: string;
  runtimeType: string;
  generatedAt: string;
  hours: number;
  manifestStatus: "ready" | "stale" | "unavailable";
  manifestReason: string | null;
  activeDelegatedSession: {
    sessionId: string;
    workerJobId: string;
    scopeProfile: string;
    activeMode: {
      taskMode: string;
      scopeProfile: string | null;
      displayLabel: string;
    };
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  } | null;
  manifest: {
    availability: {
      http: string;
      mcp: string;
      knowledge: string;
    };
    mcp: {
      enabled: boolean;
      availableFamilies: string[];
      families: Array<{
        family: string;
        enabled: boolean;
        availableToolCount: number;
        reason: string | null;
      }>;
      availableTools: Array<{
        name: string;
        family: string;
        toolGroup: string;
        availability: string;
        reason: string | null;
      }>;
      experimentalTools: Array<{
        name: string;
        family: string;
        toolGroup: string;
        availability: string;
        reason: string | null;
      }>;
      disabledTools: Array<{
        name: string;
        family: string;
        toolGroup: string;
        availability: string;
        reason: string | null;
      }>;
      operatorPolicy: {
        enabled: boolean;
        disabledFamilies: string[];
        disabledToolGroups: string[];
        approvalRequiredToolGroups: string[];
      };
    };
    discovery: {
      catalogUrl: string;
      manifestPath: string;
    };
    scopeProfile: string;
    workerJobId: string;
    expiresAt: string;
  } | null;
  totals: WorkerMcpInsightTotals;
  familyMetrics: WorkerMcpFamilyMetric[];
  toolMetrics: WorkerMcpToolMetric[];
  denialReasons: Array<{ reason: string; count: number }>;
  recentEvents: WorkerMcpRecentEvent[];
};
type TenantWorkerMcpOverviewWorkerMetric = {
  workerId: string;
  displayName: string;
  runtimeType: string;
  status: string;
  healthState: string;
  manifestStatus: "ready" | "stale" | "unavailable";
  toolCalls: number;
  blockedCount: number;
  lastSeenAt: string | null;
  lastEventAt: string | null;
  channelStatus: "connected" | "inactive" | "revoked" | "unknown";
  memorySyncStatus: "disabled" | "active" | "inactive" | "quarantined" | "unknown";
};
type TenantWorkerMcpOverviewRecentEvent = WorkerMcpRecentEvent & {
  workerId: string | null;
  workerDisplayName: string | null;
};
type TenantWorkerMcpOverview = {
  tenantId: string;
  generatedAt: string;
  hours: number;
  totalWorkers: number;
  workersWithRecentMcpCalls: number;
  workersWithActiveDelegatedSessions: number;
  manifestStatusCounts: {
    ready: number;
    stale: number;
    unavailable: number;
  };
  operatorPolicy: {
    enabled: boolean;
    disabledFamilies: string[];
    disabledToolGroups: string[];
    approvalRequiredToolGroups: string[];
  };
  totals: WorkerMcpInsightTotals;
  familyMetrics: WorkerMcpFamilyMetric[];
  toolMetrics: WorkerMcpToolMetric[];
  denialReasons: Array<{ reason: string; count: number }>;
  workerMetrics: TenantWorkerMcpOverviewWorkerMetric[];
  recentEvents: TenantWorkerMcpOverviewRecentEvent[];
};
type WorkerBudgetWindowSummary = {
  label: "hourly" | "five_hour" | "daily" | "weekly" | "monthly";
  capCredits: number | null;
  usedCredits: number;
  remainingCredits: number | null;
  blocked: boolean;
};
type WorkerBudgetSummary = {
  workerId: string;
  displayName: string;
  runtimeType: string;
  ownerUserId: number | null;
  budgets: {
    hourlyCredits?: number | null;
    fiveHourCredits?: number | null;
    dailyCredits?: number | null;
    weeklyCredits?: number | null;
    monthlyCredits?: number | null;
  };
  windows: WorkerBudgetWindowSummary[];
  blockedByBudget: boolean;
};
type WorkerBudgetDraft = {
  hourlyCredits: string;
  fiveHourCredits: string;
  dailyCredits: string;
  weeklyCredits: string;
  monthlyCredits: string;
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
  running: "text-green-600 bg-green-50 border-green-200",
  healthy: "text-green-600 bg-green-50 border-green-200",
  unhealthy: "text-red-600 bg-red-50 border-red-200",
  degraded: "text-yellow-600 bg-yellow-50 border-yellow-200",
  stale: "text-amber-700 bg-amber-50 border-amber-200",
  failed: "text-red-600 bg-red-50 border-red-200",
  unknown: "text-gray-500 bg-gray-50 border-gray-200",
};

function createWorkerBudgetDraft(summary?: WorkerBudgetSummary | null): WorkerBudgetDraft {
  return {
    hourlyCredits: summary?.budgets.hourlyCredits != null ? String(summary.budgets.hourlyCredits) : "",
    fiveHourCredits: summary?.budgets.fiveHourCredits != null ? String(summary.budgets.fiveHourCredits) : "",
    dailyCredits: summary?.budgets.dailyCredits != null ? String(summary.budgets.dailyCredits) : "",
    weeklyCredits: summary?.budgets.weeklyCredits != null ? String(summary.budgets.weeklyCredits) : "",
    monthlyCredits: summary?.budgets.monthlyCredits != null ? String(summary.budgets.monthlyCredits) : "",
  };
}

function parseWorkerBudgetDraft(draft: WorkerBudgetDraft) {
  const parseValue = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Budget values must be positive numbers or blank");
    }
    return Math.floor(parsed);
  };

  return {
    hourlyCredits: parseValue(draft.hourlyCredits),
    fiveHourCredits: parseValue(draft.fiveHourCredits),
    dailyCredits: parseValue(draft.dailyCredits),
    weeklyCredits: parseValue(draft.weeklyCredits),
    monthlyCredits: parseValue(draft.monthlyCredits),
  };
}

function humanizeMachineLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isHermesWorkerType(runtimeType: string | null | undefined): boolean {
  return runtimeType === "hermes_agent_gateway";
}

function formatHermesRemoteEndpointPolicy(value: string | null | undefined): string {
  switch (value) {
    case "audited_exception_granted":
      return "Audited HTTPS exception";
    case "loopback_only":
      return "Loopback only";
    case "unknown":
      return "Policy unknown";
    default:
      return "Policy unavailable";
  }
}

function formatWorkerAccessPolicy(worker: {
  workerAccessPolicyPreset: string | null;
  workerAccessPolicyScopeCount: number;
  workerAccessPolicyQuotaDisplayLabel: string;
}): string {
  const preset = worker.workerAccessPolicyPreset ?? "unavailable";
  return `${preset} · ${worker.workerAccessPolicyScopeCount} scopes · ${worker.workerAccessPolicyQuotaDisplayLabel}`;
}

function getHermesRemoteEndpointPolicyBadgeClass(value: string | null | undefined): string {
  switch (value) {
    case "audited_exception_granted":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "loopback_only":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "unknown":
      return "border-yellow-200 bg-yellow-50 text-yellow-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

function workerBudgetWindowLabel(label: WorkerBudgetWindowSummary["label"]): string {
  switch (label) {
    case "hourly":
      return "Hourly";
    case "five_hour":
      return "5-hour";
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
  }
}

const severityColor: Record<string, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  warning: "text-yellow-600 bg-yellow-50 border-yellow-200",
  info: "text-blue-600 bg-blue-50 border-blue-200",
};

const incidentCategoryLabel: Record<string, string> = {
  monitoring: "Monitoring Coverage",
  services: "Service Runtime",
  resources: "Resource Pressure",
  audit: "Audit & Provider Health",
  orchestration: "Automation Flow",
};

function statusIcon(status: string) {
  const s = status.toLowerCase();
  if (["ok", "active", "running", "healthy"].includes(s)) return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (["warning", "degraded", "stale"].includes(s)) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  if (["critical", "error", "failed", "unhealthy"].includes(s))
    return <XCircle className="h-4 w-4 text-red-500" />;
  return <Activity className="h-4 w-4 text-gray-400" />;
}

function serviceStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "unknown") return "No Data";
  if (normalized === "stale") return "Stale";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

function formatAbsoluteDateTime(date: Date | string | null | undefined): string {
  if (!date) return "No record";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString();
}

function parseAlertMetadata(metadata: Record<string, unknown> | null): AlertMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  return metadata as AlertMetadata;
}

function parseMonitoringRoute(location: string): {
  incidentKey: string | null;
  tab: Tab | null;
  contextScope: ContextEngineRouteScope;
} {
  const search = location.includes("?") ? location.slice(location.indexOf("?")) : "";
  const params = new URLSearchParams(search);
  const rawTab = params.get("tab");
  const tab =
    rawTab === "checks" ||
    rawTab === "alerts" ||
    rawTab === "metrics" ||
    rawTab === "context"
      ? rawTab
      : null;
  const userId = params.get("userId");
  return {
    incidentKey: params.get("incident"),
    tab,
    contextScope: {
      teamId: params.get("teamId"),
      roomId: params.get("roomId"),
      runId: params.get("runId"),
      skillId: params.get("skillId"),
      userId: userId ? Number(userId) : null,
    },
  };
}

function buildMonitoringPath(
  tab: Tab,
  incidentKey?: string | null,
  contextScope?: Partial<ContextEngineRouteScope>,
): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (incidentKey) {
    params.set("incident", incidentKey);
  }
  if (contextScope?.teamId) {
    params.set("teamId", contextScope.teamId);
  }
  if (contextScope?.roomId) {
    params.set("roomId", contextScope.roomId);
  }
  if (contextScope?.runId) {
    params.set("runId", contextScope.runId);
  }
  if (contextScope?.skillId) {
    params.set("skillId", contextScope.skillId);
  }
  if (
    typeof contextScope?.userId === "number" &&
    Number.isFinite(contextScope.userId)
  ) {
    params.set("userId", String(contextScope.userId));
  }
  return `/admin/monitoring?${params.toString()}`;
}

function incidentKeyFromAnomaly(anomaly: OpsOverview["anomalies"][number] | null | undefined): string | null {
  if (!anomaly) return null;
  return anomaly.dedupeKey ?? `ops-overview:${anomaly.id}`;
}

function incidentImpactSummary(
  incident: OpsIncidentTimelineItem | null,
  anomaly: OpsOverview["anomalies"][number] | null,
  lastCheck: string | null,
): string {
  if (anomaly?.type === "monitoring_stale") {
    return `Monitoring has not produced a fresh check since ${timeAgo(lastCheck)}. Service cards and alert freshness may already be outdated until the collector recovers.`;
  }
  if (anomaly?.type === "alert_backlog") {
    return `${incident?.openAlertCount ?? 0} high-severity alerts are still open. Without an owner, the same failure can silently compound while acknowledgement stays pending.`;
  }

  const category = anomaly?.category ?? incident?.category ?? null;
  switch (category) {
    case "services":
      return "Runtime health is drifting. User-facing requests or workers may fail if the affected service is not stabilized quickly.";
    case "resources":
      return "CPU, memory, disk, or restart pressure is climbing toward saturation and could trigger latency spikes or service crashes.";
    case "audit":
      return "Recent request failures or latency spikes are already visible in audit telemetry and may degrade AI output quality for users.";
    case "orchestration":
      return "Automation flows are falling back or slowing down, which can stall queue throughput and background job completion.";
    default:
      return "This incident is active and needs concrete operator action before it turns into user-visible downtime.";
  }
}

function incidentNextSteps(
  incident: OpsIncidentTimelineItem | null,
  anomaly: OpsOverview["anomalies"][number] | null,
): string[] {
  const base = [
    "Review the grouped alerts below and acknowledge the owner as soon as triage begins.",
    "Confirm the latest signal and timestamp so you know whether the incident is still active.",
  ];

  if (anomaly?.type === "monitoring_stale") {
    return [
      "Open Checks and verify the collector / scheduler is still producing fresh monitoring rows.",
      "Treat current service health cards as potentially stale until a new check lands.",
      "Only close the incident after fresh checks and alert emission both resume.",
    ];
  }

  if (anomaly?.type === "alert_backlog") {
    return [
      "Open the incident-scoped alerts list and separate duplicate symptoms from the first real failure.",
      "Assign ownership immediately so repeated critical alerts do not stay unacknowledged.",
      "If monitoring is also stale, restore monitoring first so you are not triaging blind.",
    ];
  }

  switch (anomaly?.category ?? incident?.category ?? null) {
    case "services":
      return [
        "Cross-check the affected service status and restart patterns before taking action.",
        "Use the alert evidence to decide whether this is a runtime outage, degraded worker, or dependency failure.",
        "Acknowledge only after someone owns the service-level fix.",
      ];
    case "resources":
      return [
        "Inspect recent CPU, memory, disk, and restart trends in Metrics before the host saturates.",
        "Check whether pressure is isolated to one process or systemic across the node.",
        "Plan the relief action now: restart, scale, drain, or reduce workload.",
      ];
    case "audit":
      return [
        "Check whether the error spike maps to one provider, model, or endpoint.",
        "Compare recent latency and failure rates before deciding whether to fail over.",
        "Keep the incident open until request quality and error rate settle back down.",
      ];
    case "orchestration":
      return [
        "Review fallback or classification drift patterns before jobs begin to pile up.",
        "Check queue pressure and worker behavior alongside the orchestration alerts.",
        "Acknowledge after the automation path is stable again, not just after a manual retry.",
      ];
    default:
      return base;
  }
}

function incidentResponseLabel(type: OpsIncidentTimelineItem["latestResponseType"]): string {
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

function incidentResponseBadgeClass(type: OpsIncidentTimelineItem["latestResponseType"]): string {
  switch (type) {
    case "resolved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "reopened":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "handoff":
    case "acknowledged":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "note":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
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
          value={serviceStatusLabel(String(svc.status))}
          valueClassName={cn(
            "capitalize",
            statusColor[String(svc.status).toLowerCase()]?.split(" ")[0] ?? "text-gray-500",
          )}
          subLabel={(
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {statusIcon(String(svc.status))}
              {String(svc.status).toLowerCase() === "stale"
                ? `last check ${timeAgo(lastCheck)}${svc.lastKnownStatus ? ` • last known ${String(svc.lastKnownStatus)}` : ""}`
                : String(svc.status).toLowerCase() === "unknown"
                  ? "no structured service status in latest metrics"
                  : null}
            </div>
          )}
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

function IncidentSummaryCard({
  locale,
  incident,
  anomaly,
  lastCheck,
  onOpenAlerts,
  onOpenChecks,
  onOpenMetrics,
  onClearFocus,
}: {
  locale: "en" | "th";
  incident: OpsIncidentTimelineItem | null;
  anomaly: OpsOverview["anomalies"][number] | null;
  lastCheck: string | null;
  onOpenAlerts: () => void;
  onOpenChecks: () => void;
  onOpenMetrics: () => void;
  onClearFocus?: (() => void) | null;
}) {
  const summaryTitle = incident?.title ?? anomaly?.title ?? "Priority incident";
  const summaryMessage = incident?.latestMessage ?? anomaly?.message ?? "An active issue needs investigation.";
  const categoryLabel = incidentCategoryLabel[anomaly?.category ?? incident?.category ?? "monitoring"] ?? "Operational Risk";
  const hasFocus = Boolean(incident);
  const guidance = getOpsIncidentGuidance({
    locale,
    title: summaryTitle,
    message: summaryMessage,
    category: anomaly?.category ?? incident?.category ?? null,
    signal: incident?.signal ?? anomaly?.signal ?? null,
    recommendation: incident?.recommendation ?? anomaly?.recommendation ?? null,
    groupKey: incident?.groupKey ?? incidentKeyFromAnomaly(anomaly ?? null),
    severity: incident?.severity ?? anomaly?.severity ?? null,
  });
  const technicalTitle = summaryTitle.trim() !== guidance.headline.trim() ? summaryTitle : null;

  return (
    <DashboardCard
      title={hasFocus ? (locale === "th" ? "โฟกัส Incident" : "Incident Focus") : (locale === "th" ? "Incident สำคัญ" : "Priority Incident")}
      description={locale === "th"
        ? "อ่านส่วนนี้ก่อน เพื่อเข้าใจว่าเกิดอะไรขึ้น เสี่ยงอย่างไร และควรตรวจอะไรต่อ"
        : "Read this first: what happened, why it matters, and what to do next."}
      leading={<ClipboardList className="h-5 w-5 text-rose-600" />}
      trailing={onClearFocus ? (
        <div className="flex items-center gap-2">
          <HelpButton
            page="/admin/monitoring"
            topic={guidance.helpTopicSlug}
            variant="outline"
            size="sm"
            label={guidance.helpLabel}
          />
          <Button variant="outline" size="sm" onClick={onClearFocus}>
            {locale === "th" ? "ล้างโฟกัส" : "Clear Focus"}
          </Button>
        </div>
      ) : undefined}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("capitalize", severityColor[(incident?.severity ?? anomaly?.severity ?? "info").toLowerCase()] ?? severityColor.info)}>
            {incident?.severity ?? anomaly?.severity ?? "info"}
          </Badge>
          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
            {categoryLabel}
          </Badge>
          {incident?.status ? (
            <Badge variant="outline" className={incident.status === "acknowledged" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>
              {incident.status === "acknowledged" ? "Actioned" : incident.status === "awaiting_action" ? "Awaiting action" : "Alerted"}
            </Badge>
          ) : null}
          {(incident?.signal ?? anomaly?.signal) ? (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
              {guidance.technicalLabel}: {incident?.signal ?? anomaly?.signal}
            </Badge>
          ) : null}
        </div>

        <div>
          <p className="text-base font-semibold text-slate-900">{guidance.headline}</p>
          <p className="mt-1 text-sm text-slate-600">{guidance.summary}</p>
          {technicalTitle ? (
            <p className="mt-2 text-xs text-slate-500">
              {guidance.technicalLabel}: {technicalTitle}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-medium">{guidance.impactLabel}:</span> {guidance.impactBody || incidentImpactSummary(incident, anomaly, lastCheck)}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DashboardKpiCard icon={Clock} label={locale === "th" ? "ตรวจล่าสุด" : "Last Check"} value={timeAgo(incident?.lastCheckedAt ?? lastCheck)} subLabel={formatAbsoluteDateTime(incident?.lastCheckedAt ?? lastCheck)} />
          <DashboardKpiCard icon={AlertTriangle} label={locale === "th" ? "Alert ที่ยังเปิด" : "Open Alerts"} value={incident?.openAlertCount ?? 0} subLabel={incident ? `${incident.totalAlertCount} ${locale === "th" ? "รายการรวมในกลุ่ม" : "grouped total"}` : (locale === "th" ? "เปิดแท็บ Alerts เพื่อตรวจรายละเอียด" : "Open Alerts tab to inspect")} valueClassName={(incident?.openAlertCount ?? 0) > 0 ? "text-red-600" : undefined} />
          <DashboardKpiCard icon={BellRing} label={locale === "th" ? "ส่งแจ้งเตือนแล้ว" : "Notification Sent"} value={incident?.notification.sent ? timeAgo(incident.notification.lastSentAt) : (locale === "th" ? "ยังไม่ส่ง" : "Not sent")} subLabel={incident?.notification.sent ? `${incident.notification.recipientCount} ${locale === "th" ? "แอดมิน," : "admins,"} ${incident.notification.readCount} ${locale === "th" ? "คนอ่านแล้ว" : "read"}` : (locale === "th" ? "ยังไม่มีหลักฐานการส่ง" : "No delivery recorded")} />
          <DashboardKpiCard icon={CheckCheck} label={locale === "th" ? "รับเรื่องแล้ว" : "Acknowledged"} value={incident?.lastAcknowledgedAt ? timeAgo(incident.lastAcknowledgedAt) : (locale === "th" ? "ยัง" : "Pending")} subLabel={incident?.lastAcknowledgedAt ? formatAbsoluteDateTime(incident.lastAcknowledgedAt) : (locale === "th" ? "ยังไม่มีการ acknowledge" : "No acknowledgement yet")} valueClassName={incident?.lastAcknowledgedAt ? "text-emerald-600" : "text-red-600"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Info className="h-4 w-4 text-slate-500" />
              {guidance.checkNowLabel}
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {guidance.checkNow.map((step) => (
                <p key={step}>• {step}</p>
              ))}
            </div>
            {(incident?.recommendation ?? anomaly?.recommendation) ? (
              <p className="mt-3 text-sm text-slate-700">
                {locale === "th" ? "คำแนะนำหลัก" : "Recommended action"}: <span className="font-medium">{incident?.recommendation ?? anomaly?.recommendation}</span>
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCheck className="h-4 w-4 text-slate-500" />
              {guidance.confirmFixedLabel}
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {guidance.confirmFixed.map((step) => (
                <p key={step}>• {step}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Bell className="h-4 w-4 text-slate-500" />
            {guidance.faqLabel}
          </div>
          <div className="mt-3 space-y-3">
            {guidance.faqItems.map((item) => (
              <div key={item.question} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-sm font-semibold text-slate-900">{item.question}</p>
                <p className="mt-1 text-sm text-slate-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Info className="h-4 w-4 text-slate-500" />
            {locale === "th" ? "วงจรตอบสนองล่าสุด" : "Latest Response Loop"}
          </div>
          {incident?.latestResponseType ? (
            <p className="mt-3 text-sm text-slate-700">
              {locale === "th" ? "อัปเดตล่าสุดจากผู้ดูแล" : "Latest operator update"}: <span className="font-medium">{incidentResponseLabel(incident.latestResponseType)}</span>
              {incident.latestResponseAt ? ` • ${formatAbsoluteDateTime(incident.latestResponseAt)}` : ""}
            </p>
          ) : null}
          {incident?.currentOwnerName ? (
            <p className="mt-2 text-sm text-slate-700">
              {locale === "th" ? "ผู้รับผิดชอบปัจจุบัน" : "Current owner"}: <span className="font-medium">{incident.currentOwnerName}</span>
              {incident.currentOwnerEmail ? ` (${incident.currentOwnerEmail})` : ""}
            </p>
          ) : null}
          {incident?.latestResponseNote ? (
            <p className="mt-2 text-sm text-slate-700">
              {locale === "th" ? "บันทึกล่าสุด" : "Latest action note"}: <span className="font-medium">{incident.latestResponseNote}</span>
            </p>
          ) : null}
          {incident?.resolutionNote ? (
            <p className="mt-2 text-sm text-emerald-700">
              {locale === "th" ? "บันทึกการแก้ไข" : "Resolution note"}: <span className="font-medium">{incident.resolutionNote}</span>
            </p>
          ) : null}
          {incident?.reopenReason ? (
            <p className="mt-2 text-sm text-rose-700">
              {locale === "th" ? "เหตุผลที่เปิดใหม่" : "Reopen reason"}: <span className="font-medium">{incident.reopenReason}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onOpenAlerts}>{locale === "th" ? "เปิดกล่อง Alert" : "Open Alert Inbox"}</Button>
          <Button size="sm" variant="outline" onClick={onOpenChecks}>{locale === "th" ? "เปิด Checks" : "Open Checks"}</Button>
          <Button size="sm" variant="outline" onClick={onOpenMetrics}>{locale === "th" ? "เปิด Metrics" : "Open Metrics"}</Button>
          <HelpButton
            page="/admin/monitoring"
            topic={guidance.helpTopicSlug}
            variant="outline"
            size="sm"
            label={guidance.helpLabel}
          />
        </div>
      </div>
    </DashboardCard>
  );
}

function IncidentOperatorLogCard({
  incident,
  currentUser,
  adminUsers,
  onAfterMutation,
}: {
  incident: OpsIncidentTimelineItem;
  currentUser: { id: number; name?: string | null; email?: string | null };
  adminUsers: AdminUserOption[];
  onAfterMutation: () => Promise<unknown> | void;
}) {
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(
    String(incident.currentOwnerId ?? currentUser.id),
  );
  const [actionNote, setActionNote] = useState("");

  useEffect(() => {
    setSelectedOwnerId(String(incident.currentOwnerId ?? currentUser.id));
    setActionNote("");
  }, [incident.groupKey, incident.currentOwnerId, currentUser.id]);

  const recordIncidentActionMutation = trpc.monitoring.recordIncidentAction.useMutation({
    onSuccess: async () => {
      toast.success("Incident response log updated");
      setActionNote("");
      await onAfterMutation();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to update incident log");
    },
  });

  const handleAction = (action: "note" | "handoff" | "resolved" | "reopened") => {
    const note = actionNote.trim() || undefined;
    if ((action === "resolved" || action === "reopened") && !note) {
      toast.error(action === "resolved" ? "Resolution note is required" : "Reopen reason is required");
      return;
    }

    recordIncidentActionMutation.mutate({
      groupKey: incident.groupKey,
      action,
      note,
      ownerUserId: action === "handoff" ? Number(selectedOwnerId) : undefined,
    });
  };

  return (
    <DashboardCard
      title="Operator Log"
      description="Assign ownership, record actions, and leave resolution or reopen evidence on the incident itself."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={incidentResponseBadgeClass(incident.latestResponseType)}>
            {incidentResponseLabel(incident.latestResponseType)}
          </Badge>
          {incident.latestResponseAt ? (
            <span className="text-xs text-slate-500">{formatAbsoluteDateTime(incident.latestResponseAt)}</span>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Owner</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {incident.currentOwnerName ?? "Unassigned"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {incident.currentOwnerEmail ?? "No owner recorded yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Latest Update</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {incident.latestResponseByName ?? "No operator recorded"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {incident.latestResponseNote ?? "No action note yet"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700">Assign owner</label>
            <select
              value={selectedOwnerId}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {adminUsers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name ?? option.email ?? `User ${option.id}`} {option.role ? `(${option.role})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Action note / resolution / reopen reason</label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder="Record what changed, what was checked, or why the incident is resolved / reopened."
              className="mt-2 min-h-[96px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => handleAction("handoff")}
              disabled={recordIncidentActionMutation.isPending}
            >
              {Number(selectedOwnerId) === currentUser.id ? "Take Ownership" : "Assign / Handoff"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("note")}
              disabled={recordIncidentActionMutation.isPending}
            >
              Add Note
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("resolved")}
              disabled={recordIncidentActionMutation.isPending}
            >
              Mark Resolved
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("reopened")}
              disabled={recordIncidentActionMutation.isPending}
            >
              Reopen
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent Operator History</p>
          <div className="mt-3 space-y-3">
            {incident.responseHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No operator actions recorded yet.</p>
            ) : incident.responseHistory.map((entry) => (
              <div key={`${entry.type}-${entry.at}-${entry.actorId ?? "na"}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={incidentResponseBadgeClass(entry.type)}>
                    {incidentResponseLabel(entry.type)}
                  </Badge>
                  <span className="text-xs text-slate-500">{formatAbsoluteDateTime(entry.at)}</span>
                </div>
                <p className="mt-2 text-sm text-slate-900">
                  {entry.actorName ?? "Unknown operator"}
                  {entry.actorEmail ? ` (${entry.actorEmail})` : ""}
                </p>
                {entry.ownerName ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Owner: {entry.ownerName}{entry.ownerEmail ? ` (${entry.ownerEmail})` : ""}
                  </p>
                ) : null}
                {entry.note ? (
                  <p className="mt-2 text-sm text-slate-600">{entry.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardCard>
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

function AlertsTab({
  incidentKey,
  incidentTitle,
  onClearFocus,
  onAfterAlertMutation,
}: {
  incidentKey: string | null;
  incidentTitle: string | null;
  onClearFocus: () => void;
  onAfterAlertMutation: () => Promise<unknown> | void;
}) {
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<"info" | "warning" | "error" | "critical" | "">("");
  const [unackOnly, setUnackOnly] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const limit = incidentKey ? 25 : 15;

  useEffect(() => {
    setPage(1);
  }, [incidentKey]);

  const alertsQuery = trpc.monitoring.getAlerts.useQuery(
    {
      page,
      limit,
      ...(severityFilter ? { severity: severityFilter } : {}),
      ...(unackOnly ? { acknowledged: false } : {}),
      ...(incidentKey ? { groupKey: incidentKey } : {}),
    },
    { refetchInterval: 30000 },
  );

  const acknowledgeMutation = trpc.monitoring.acknowledgeAlert.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("Alert acknowledged");
      setNoteDrafts((current) => {
        const next = { ...current };
        delete next[variables.alertId];
        return next;
      });
      void alertsQuery.refetch();
      void onAfterAlertMutation();
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
      {incidentKey && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
              Incident Focus
            </Badge>
            {incidentTitle ? (
              <span className="text-sm font-semibold text-slate-900">{incidentTitle}</span>
            ) : null}
            <span className="text-xs text-slate-500">{incidentKey}</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={onClearFocus}>
              Show All Alerts
            </Button>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            This inbox is filtered to the selected incident so you can triage, acknowledge, and verify closure without hunting across unrelated alerts.
          </p>
        </div>
      )}

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
            {(() => {
              const metadata = parseAlertMetadata(alert.metadata);
              const ackMeta = metadata.acknowledgement;
              const incidentResponse = metadata.incidentResponse;
              const noteDraft = noteDrafts[alert.id] ?? "";
              const showNoteComposer = !alert.acknowledged && Boolean(incidentKey);

              return (
                <>
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
              <p className={cn("text-xs text-muted-foreground mt-0.5", incidentKey ? "whitespace-pre-wrap" : "line-clamp-2")}>{alert.message}</p>
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
              {incidentResponse?.currentOwnerName || ackMeta?.actorName ? (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
                  <p>
                    <span className="font-semibold">Owner:</span> {incidentResponse?.currentOwnerName ?? ackMeta?.actorName}
                    {(incidentResponse?.currentOwnerEmail ?? ackMeta?.actorEmail) ? ` (${incidentResponse?.currentOwnerEmail ?? ackMeta?.actorEmail})` : ""}
                  </p>
                  {incidentResponse?.latestEventType ? (
                    <p className="mt-1">
                      <span className="font-semibold">Latest update:</span> {incidentResponseLabel(incidentResponse.latestEventType)}
                    </p>
                  ) : null}
                  {(incidentResponse?.latestNote ?? ackMeta?.note) ? (
                    <p className="mt-1">
                      <span className="font-semibold">Action note:</span> {incidentResponse?.latestNote ?? ackMeta?.note}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {(() => {
                const detailRows = [
                  metadata.signal ? { label: "Signal", value: metadata.signal } : null,
                  metadata.recommendation ? { label: "Recommended action", value: metadata.recommendation } : null,
                  metadata.source ? { label: "Source", value: metadata.source } : null,
                  metadata.category ? { label: "Category", value: metadata.category } : null,
                  metadata.dedupeKey ? { label: "Incident", value: metadata.dedupeKey } : null,
                  metadata.observedAt ? { label: "Observed", value: formatAbsoluteDateTime(metadata.observedAt) } : null,
                ].filter(Boolean) as Array<{ label: string; value: string }>;

                if (detailRows.length === 0) return null;

                return (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-600">
                    <div className="grid gap-2 md:grid-cols-2">
                      {detailRows.map((detail) => (
                        <p key={`${alert.id}-${detail.label}`}>
                          <span className="font-semibold text-slate-800">{detail.label}:</span> {detail.value}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {showNoteComposer ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <label className="block text-xs font-medium text-slate-700">
                    Action note for the operator log
                  </label>
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDrafts((current) => ({ ...current, [alert.id]: e.target.value }))}
                    placeholder="Example: Investigating collector worker. Restarting scheduler and verifying fresh checks."
                    className="mt-2 min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
              ) : null}
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
                  onClick={() => acknowledgeMutation.mutate({ alertId: alert.id, note: noteDraft || undefined })}
                  disabled={acknowledgeMutation.isPending}
                >
                  {acknowledgeMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    noteDraft.trim() ? "Acknowledge + Save Note" : "Acknowledge"
                  )}
                </Button>
              )}
            </div>
                </>
              );
            })()}
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

type Tab = "checks" | "alerts" | "metrics" | "context";

type ContextEngineRouteScope = {
  teamId: string | null;
  roomId: string | null;
  runId: string | null;
  skillId: string | null;
  userId: number | null;
};

function buildWorkOsPath(timelineSource?: "role_routine" | "team_run" | "workpack_record" | "browser_automation"): string {
  const params = new URLSearchParams();
  if (timelineSource) {
    params.set("timelineSource", timelineSource);
  }
  const query = params.toString();
  return query ? `/admin/work-os?${query}` : "/admin/work-os";
}

function copyWorkOsLink(path: string, successMessage: string): void {
  const url = `${window.location.origin}${path}`;
  void navigator.clipboard
    .writeText(url)
    .then(() => {
      toast.success(successMessage);
    })
    .catch(() => {
      toast.error("Could not copy the Work OS link");
    });
}

export default function AdminMonitoring() {
  const { user, loading: authLoading } = useAuth();
  const hermesFlags = useTenantFeatureFlags();
  const { locale } = useScopedTranslation("admin");
  const utils = trpc.useUtils();
  const [location, setLocation] = useLocation();
  const tabsSectionRef = useRef<HTMLDivElement | null>(null);
  const incidentSummaryRef = useRef<HTMLDivElement | null>(null);
  const autoFreshCheckScheduledRef = useRef(false);
  const freshCheckSourceRef = useRef<"auto" | "manual">("manual");
  const [flashTarget, setFlashTarget] = useState<"tabs" | "incident" | null>(null);
  const [autoFreshCheckState, setAutoFreshCheckState] = useState<"idle" | "waiting" | "checking" | "done">("idle");
  const routeState = useMemo(() => parseMonitoringRoute(location), [location]);
  const [activeTab, setActiveTab] = useState<Tab>(routeState.tab ?? (routeState.incidentKey ? "alerts" : "checks"));
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(routeState.tab ?? (routeState.incidentKey ? "alerts" : "checks"));
  }, [routeState.incidentKey, routeState.tab]);

  const statusQuery = trpc.monitoring.getCurrentStatus.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const opsOverviewQuery = trpc.monitoring.getOpsOverview.useQuery(undefined, {
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });
  const workOsOverviewQuery = trpc.monitoring.getWorkOsOverview.useQuery(undefined, {
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });
  const browserAutomationHealthQuery = trpc.workOs.getBrowserAutomationHealth.useQuery(undefined, {
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });
  const reconcileBrowserAutomationTasksMutation = trpc.workOs.reconcileBrowserAutomationTasks.useMutation({
    onSuccess: async (result: {
      processed: number;
      completed: number;
      failed: number;
      cancelled: number;
      pending: number;
    }) => {
      await Promise.all([
        browserAutomationHealthQuery.refetch(),
        workOsOverviewQuery.refetch(),
      ]);
      toast.success(
        `Reconciled ${result.processed} browser claims (${result.completed} completed, ${result.failed} failed, ${result.cancelled} cancelled, ${result.pending} pending)`,
      );
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to reconcile browser automation tasks");
    },
  });
  const focusedIncidentQuery = trpc.monitoring.getOpsIncidentTimeline.useQuery(
    routeState.incidentKey ? { limit: 1, groupKey: routeState.incidentKey } : undefined,
    {
      enabled: Boolean(routeState.incidentKey),
      refetchInterval: 30000,
      refetchOnWindowFocus: false,
    },
  );
  const adminUsersQuery = trpc.usage.getUsers.useQuery(undefined, {
    enabled: Boolean(routeState.incidentKey),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const workerFleetQuery = trpc.monitoring.listWorkers.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const tenantWorkerMcpOverviewQuery = trpc.monitoring.getTenantWorkerMcpOverview.useQuery(
    { hours: 24 },
    {
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );
  const workerDiagnosticsQuery = trpc.monitoring.getWorkerDiagnostics.useQuery(
    selectedWorkerId ? { workerId: selectedWorkerId } : skipToken,
    {
      enabled: Boolean(selectedWorkerId),
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );
  const workerMcpInsightsQuery = trpc.monitoring.getWorkerMcpInsights.useQuery(
    selectedWorkerId ? { workerId: selectedWorkerId, hours: 24 } : skipToken,
    {
      enabled: Boolean(selectedWorkerId),
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );
  const workerBudgetQuery = trpc.monitoring.getWorkerBudget.useQuery(
    selectedWorkerId ? { workerId: selectedWorkerId } : skipToken,
    {
      enabled: Boolean(selectedWorkerId),
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );
  const selectedWorkerBudget = (workerBudgetQuery.data as WorkerBudgetSummary | undefined) ?? null;
  const browserAutomationHealth = browserAutomationHealthQuery.data ?? null;
  const [workerBudgetDrafts, setWorkerBudgetDrafts] = useState<Record<string, WorkerBudgetDraft>>({});
  const updateWorkerStateMutation = trpc.monitoring.updateWorkerState.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.monitoring.listWorkers.invalidate(),
        utils.monitoring.getTenantWorkerMcpOverview.invalidate(),
        selectedWorkerId ? utils.monitoring.getWorkerDiagnostics.invalidate({ workerId: selectedWorkerId }) : Promise.resolve(),
        selectedWorkerId ? utils.monitoring.getWorkerMcpInsights.invalidate({ workerId: selectedWorkerId, hours: 24 }) : Promise.resolve(),
      ]);
      toast.success("Worker state updated");
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to update worker state");
    },
  });
  const redactLegacyWorkerDataMutation = trpc.monitoring.redactLegacyWorkerData.useMutation({
    onSuccess: async (result: {
      scannedWorkers: number;
      updatedWorkers: number;
      scannedArtifacts: number;
      updatedArtifacts: number;
    }) => {
      await Promise.all([
        utils.monitoring.listWorkers.invalidate(),
        utils.monitoring.getTenantWorkerMcpOverview.invalidate(),
        selectedWorkerId ? utils.monitoring.getWorkerDiagnostics.invalidate({ workerId: selectedWorkerId }) : Promise.resolve(),
        selectedWorkerId ? utils.monitoring.getWorkerMcpInsights.invalidate({ workerId: selectedWorkerId, hours: 24 }) : Promise.resolve(),
      ]);
      toast.success(
        `Legacy worker data redacted: ${result.updatedWorkers}/${result.scannedWorkers} workers, ${result.updatedArtifacts}/${result.scannedArtifacts} artifacts`,
      );
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to redact legacy worker data");
    },
  });
  const updateWorkerBudgetMutation = trpc.monitoring.updateWorkerBudget.useMutation({
    onSuccess: async (result: WorkerBudgetSummary) => {
      setWorkerBudgetDrafts((prev) => ({
        ...prev,
        [result.workerId]: createWorkerBudgetDraft(result),
      }));
      await Promise.all([
        utils.monitoring.getWorkerBudget.invalidate({ workerId: result.workerId }),
        utils.monitoring.listWorkers.invalidate(),
      ]);
      toast.success("Worker budget guardrails updated");
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to update worker budget");
    },
  });
  const forceFreshCheckMutation = trpc.monitoring.forceFreshCheck.useMutation({
    onSuccess: async () => {
      const source = freshCheckSourceRef.current;
      setAutoFreshCheckState("done");
      if (source === "manual") {
        toast.success("Fresh monitoring check recorded");
      }
      await Promise.all([
        utils.monitoring.getCurrentStatus.invalidate(),
        utils.monitoring.getOpsOverview.invalidate(),
        utils.monitoring.getChecks.invalidate(),
        utils.monitoring.getAlerts.invalidate(),
        utils.monitoring.getMetricsHistory.invalidate(),
        utils.monitoring.getOpsIncidentTimeline.invalidate(),
      ]);
    },
    onError: (error: { message: string }) => {
      setAutoFreshCheckState("idle");
      toast.error(error.message || "Failed to force a fresh check");
    },
  });

  useEffect(() => {
    if (authLoading || !user || user.role !== "admin") return;
    if (autoFreshCheckScheduledRef.current) return;
    autoFreshCheckScheduledRef.current = true;
    setAutoFreshCheckState("waiting");

    const timeoutId = window.setTimeout(() => {
      freshCheckSourceRef.current = "auto";
      setAutoFreshCheckState("checking");
      forceFreshCheckMutation.mutate();
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [authLoading, forceFreshCheckMutation, user]);

  useEffect(() => {
    if (!selectedWorkerBudget) return;
    setWorkerBudgetDrafts((prev) => (
      prev[selectedWorkerBudget.workerId]
        ? prev
        : { ...prev, [selectedWorkerBudget.workerId]: createWorkerBudgetDraft(selectedWorkerBudget) }
    ));
  }, [selectedWorkerBudget]);

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
  const focusedIncident = ((focusedIncidentQuery.data?.items as OpsIncidentTimelineItem[] | undefined) ?? [])[0] ?? null;
  const anomalies = opsOverviewQuery.data?.anomalies ?? [];
  const workOsOverview = (workOsOverviewQuery.data as WorkOsOverview | undefined) ?? null;
  const workerFleet = (workerFleetQuery.data as WorkerFleetRow[] | undefined) ?? [];
  const tenantWorkerMcpOverview = (tenantWorkerMcpOverviewQuery.data as TenantWorkerMcpOverview | undefined) ?? null;
  const selectedWorkerDiagnostics = (workerDiagnosticsQuery.data as WorkerDiagnosticsSnapshot | undefined) ?? null;
  const selectedWorkerMcpInsights = (workerMcpInsightsQuery.data as WorkerMcpInsights | undefined) ?? null;
  const selectedWorkerBudgetDraft = selectedWorkerId
    ? workerBudgetDrafts[selectedWorkerId] ?? createWorkerBudgetDraft(selectedWorkerBudget)
    : null;
  const adminUsers = ((adminUsersQuery.data?.users as AdminUserOption[] | undefined) ?? [])
    .filter((candidate) => candidate.role === "admin" || candidate.role === "domain_admin");
  const focusedAnomaly = routeState.incidentKey
    ? anomalies.find((anomaly) => incidentKeyFromAnomaly(anomaly) === routeState.incidentKey) ?? null
    : anomalies[0] ?? null;
  const staleServiceCount = services.filter((svc) => String(svc.status).toLowerCase() === "stale").length;
  const suggestedIncidentKey = !routeState.incidentKey ? incidentKeyFromAnomaly(focusedAnomaly ?? null) : null;
  const heroGuidance = getOpsIncidentGuidance({
    locale,
    title: focusedIncident?.title ?? focusedAnomaly?.title ?? null,
    message: focusedIncident?.latestMessage ?? focusedAnomaly?.message ?? null,
    category: focusedAnomaly?.category ?? focusedIncident?.category ?? null,
    signal: focusedIncident?.signal ?? focusedAnomaly?.signal ?? null,
    recommendation: focusedIncident?.recommendation ?? focusedAnomaly?.recommendation ?? null,
    groupKey: focusedIncident?.groupKey ?? suggestedIncidentKey,
    severity: focusedIncident?.severity ?? focusedAnomaly?.severity ?? null,
  });
  const heroSummary = staleServiceCount > 0 && staleServiceCount === services.length
    ? locale === "th"
      ? "ตอนนี้ service cards ทั้งหมดเป็น Stale แปลว่าข้อมูล monitoring ที่แสดงอาจเก่า ขั้นแรกให้กด Force Fresh Check ก่อน แล้วค่อยตรวจแท็บ Checks ถ้ายังไม่อัปเดต"
      : "All service cards are stale right now, which means the monitoring view may be showing old data. Start with Force Fresh Check, then inspect Checks if the page still does not refresh."
    : heroGuidance.summary;

  const workerLocaleText = locale === "th"
    ? {
        personaPrefix: "เพอร์โซนา:",
        channelPrefix: "แชนแนล:",
        memorySyncPrefix: "การซิงก์หน่วยความจำ:",
        providerRoutingPrefix: "เส้นทางผู้ให้บริการ LLM:",
        accessPolicyPrefix: "นโยบายสิทธิ์ worker:",
        diagnosticsTitle: "การตรวจสอบ worker",
        diagnosticsSummary: "ภาพรวม control plane ที่ถูกปกปิดสำหรับ",
        diagnosticsCapturedPrefix: "บันทึกเมื่อ",
        diagnosticsNoRecord: "ยังไม่มีบันทึก",
        diagnosticsUnavailable: "ยังไม่มีข้อมูล diagnostics",
        mcpTitle: "ข้อมูลเชิงลึก MCP ของ worker",
        mcpSummary: "ความจริงจาก runtime สำหรับ delegated MCP รวมถึงการใช้งาน worker MCP ช่วง 24 ชั่วโมงล่าสุด",
        manifestLabel: "Manifest",
        operatorPolicyLabel: "นโยบาย operator",
        toolCallsLabel: "การเรียกเครื่องมือ",
        delegatedSessionLabel: "เซสชันที่มอบสิทธิ์",
        activeFamiliesLabel: "families ที่ใช้งานอยู่",
        hiddenToolsLabel: "เครื่องมือที่ซ่อนอยู่",
        availableFamiliesLabel: "families ที่พร้อมใช้",
        operatorRestrictionsLabel: "ข้อจำกัดของ operator",
        enabledLabel: "เปิดใช้งาน",
        disabledLabel: "ปิดใช้งาน",
        observedLabel: "พบ session",
        noneLabel: "ไม่มี",
        noRecentSession: "ยังไม่มี delegated session ล่าสุดสำหรับ worker นี้",
        approvalGroupsSuffix: "กลุ่มที่ต้องอนุมัติ",
        succeededPrefix: "สำเร็จ",
        blockedPrefix: "ถูกบล็อก",
      }
    : {
        personaPrefix: "Persona:",
        channelPrefix: "Channel:",
        memorySyncPrefix: "Memory sync:",
        providerRoutingPrefix: "LLM provider routing:",
        accessPolicyPrefix: "Worker access policy:",
        diagnosticsTitle: "Worker diagnostics",
        diagnosticsSummary: "Redacted control-plane snapshot for",
        diagnosticsCapturedPrefix: "Captured",
        diagnosticsNoRecord: "No record",
        diagnosticsUnavailable: "No diagnostics available yet.",
        mcpTitle: "Worker MCP insights",
        mcpSummary: "Runtime truth for delegated MCP plus the last 24 hours of worker MCP usage.",
        manifestLabel: "Manifest",
        operatorPolicyLabel: "Operator policy",
        toolCallsLabel: "Tool calls",
        delegatedSessionLabel: "Delegated session",
        activeFamiliesLabel: "active families",
        hiddenToolsLabel: "hidden tools",
        availableFamiliesLabel: "Available families",
        operatorRestrictionsLabel: "Operator restrictions",
        enabledLabel: "Enabled",
        disabledLabel: "Disabled",
        observedLabel: "Observed",
        noneLabel: "None",
        noRecentSession: "No recent delegated session for this worker.",
        approvalGroupsSuffix: "approval-gated groups",
        succeededPrefix: "succeeded",
        blockedPrefix: "blocked",
      };

  const navigateToTab = (tab: Tab) => {
    setActiveTab(tab);
    setLocation(buildMonitoringPath(tab, routeState.incidentKey, routeState.contextScope));
  };

  const revealSection = (target: "tabs" | "incident") => {
    const node = target === "incident" ? incidentSummaryRef.current : tabsSectionRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlashTarget(target);
    window.setTimeout(() => {
      setFlashTarget((current) => (current === target ? null : current));
    }, 1800);
  };

  const navigateToTabAndReveal = (tab: Tab) => {
    navigateToTab(tab);
    window.setTimeout(() => revealSection("tabs"), 80);
  };

  const focusIncidentAndReveal = (incidentKey: string) => {
    setActiveTab("alerts");
    setLocation(buildMonitoringPath("alerts", incidentKey, routeState.contextScope));
    window.setTimeout(() => revealSection("incident"), 120);
  };

  const clearIncidentFocus = () => {
    setLocation(buildMonitoringPath(activeTab, null, routeState.contextScope));
  };

  const handleAlertMutationRefresh = async () => {
    const refetches: Array<Promise<unknown>> = [
      statusQuery.refetch(),
      opsOverviewQuery.refetch(),
    ];
    if (routeState.incidentKey) {
      refetches.push(focusedIncidentQuery.refetch());
    }
    await Promise.all(refetches);
  };

  const setSelectedWorkerBudgetField = (field: keyof WorkerBudgetDraft, value: string) => {
    if (!selectedWorkerId) return;
    setWorkerBudgetDrafts((prev) => ({
      ...prev,
      [selectedWorkerId]: {
        ...(prev[selectedWorkerId] ?? createWorkerBudgetDraft(selectedWorkerBudget)),
        [field]: value,
      },
    }));
  };

  const saveSelectedWorkerBudget = () => {
    if (!selectedWorkerId || !selectedWorkerBudgetDraft) return;
    try {
      updateWorkerBudgetMutation.mutate({
        workerId: selectedWorkerId,
        ...parseWorkerBudgetDraft(selectedWorkerBudgetDraft),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid worker budget");
    }
  };

  const clearSelectedWorkerBudget = () => {
    if (!selectedWorkerId) return;
    const emptyDraft = createWorkerBudgetDraft(null);
    setWorkerBudgetDrafts((prev) => ({
      ...prev,
      [selectedWorkerId]: emptyDraft,
    }));
    updateWorkerBudgetMutation.mutate({
      workerId: selectedWorkerId,
      hourlyCredits: null,
      fiveHourCredits: null,
      dailyCredits: null,
      weeklyCredits: null,
      monthlyCredits: null,
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "checks", label: "Checks" },
    { id: "alerts", label: `Alerts${criticalCount + warningCount > 0 ? ` (${criticalCount + warningCount})` : ""}` },
    { id: "metrics", label: "Metrics" },
    { id: "context", label: "Context & Knowledge" },
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
                onClick={() => setLocation("/admin/dashboard")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Command Center
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
                {autoFreshCheckState === "waiting" || autoFreshCheckState === "checking" ? (
                  <p className="mt-1 text-xs text-sky-600">
                    {locale === "th"
                      ? autoFreshCheckState === "waiting"
                        ? "กำลังเตรียมตรวจ runtime ล่าสุดอัตโนมัติ..."
                        : "กำลังเช็ก runtime ล่าสุดอัตโนมัติ..."
                      : autoFreshCheckState === "waiting"
                        ? "Preparing an automatic runtime refresh..."
                        : "Checking the latest runtime automatically..."}
                  </p>
                ) : null}
                {routeState.incidentKey && (
                  <p className="text-xs text-slate-500 mt-1">
                    Incident focus: {routeState.incidentKey}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LocaleToggle className="hidden sm:inline-flex" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/admin/work-os")}
              >
                Work OS
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLocation(
                    buildWorkpackEntrypointHref({
                      entrypoint: "dashboard",
                      surface: "intake",
                    }),
                  )
                }
              >
                Workpack Intake
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLocation(
                    buildWorkpackEntrypointHref({
                      entrypoint: "dashboard",
                      surface: "discovery",
                    }),
                  )
                }
              >
                Workpack Discovery
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLocation(
                    buildWorkpackEntrypointHref({
                      entrypoint: "dashboard",
                      surface: "roi",
                    }),
                  )
                }
              >
                Workpack ROI
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLocation(
                    buildWorkpackEntrypointHref({
                      entrypoint: "dashboard",
                      surface: "exceptions",
                    }),
                  )
                }
              >
                Workpack Exceptions
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void Promise.all([
                  statusQuery.refetch(),
                  opsOverviewQuery.refetch(),
                  ...(routeState.incidentKey ? [focusedIncidentQuery.refetch()] : []),
                ])}
                disabled={statusQuery.isLoading || opsOverviewQuery.isLoading}
              >
                {statusQuery.isLoading || opsOverviewQuery.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  freshCheckSourceRef.current = "manual";
                  setAutoFreshCheckState("checking");
                  forceFreshCheckMutation.mutate();
                }}
                disabled={forceFreshCheckMutation.isPending}
              >
                {forceFreshCheckMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCheck className="h-4 w-4 mr-2" />
                )}
                Force Fresh Check
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-6 space-y-6">
        {(focusedIncident || focusedAnomaly || staleServiceCount > 0 || criticalCount > 0) && (
          <DashboardCard
            title={locale === "th" ? "เริ่มจากตรงนี้" : "Start Here"}
            description={heroSummary}
            leading={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  {staleServiceCount > 0
                    ? locale === "th"
                      ? `${staleServiceCount} service stale`
                      : `${staleServiceCount} stale services`
                    : heroGuidance.headline}
                </Badge>
                {criticalCount > 0 ? (
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                    {locale === "th" ? `${criticalCount} critical ที่ยังเปิด` : `${criticalCount} critical still open`}
                  </Badge>
                ) : null}
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  {locale === "th" ? `ตรวจล่าสุด ${timeAgo(lastCheck)}` : `Last check ${timeAgo(lastCheck)}`}
                </Badge>
              </div>

              <div className="space-y-2 text-sm text-slate-700">
                {heroGuidance.checkNow.slice(0, 3).map((step) => (
                  <p key={step}>• {step}</p>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    freshCheckSourceRef.current = "manual";
                    setAutoFreshCheckState("checking");
                    forceFreshCheckMutation.mutate();
                  }}
                  disabled={forceFreshCheckMutation.isPending}
                >
                  {forceFreshCheckMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCheck className="h-4 w-4 mr-2" />
                  )}
                  {locale === "th" ? "เช็กใหม่ทันที" : "Force Fresh Check"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigateToTabAndReveal("checks")}>
                  {locale === "th" ? "เปิด Checks" : "Open Checks"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigateToTabAndReveal("alerts")}>
                  {locale === "th" ? "เปิด Alert Inbox" : "Open Alert Inbox"}
                </Button>
                {suggestedIncidentKey ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => focusIncidentAndReveal(suggestedIncidentKey)}
                  >
                    {locale === "th" ? "โฟกัส incident นี้" : "Focus This Incident"}
                  </Button>
                ) : null}
                <HelpButton
                  page="/admin/monitoring"
                  topic={heroGuidance.helpTopicSlug}
                  variant="outline"
                  size="sm"
                  label={heroGuidance.helpLabel}
                />
              </div>
            </div>
          </DashboardCard>
        )}

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

        <OpsEarlyWarningPanel
          overview={opsOverviewQuery.data}
          isLoading={opsOverviewQuery.isLoading}
          showMonitoringLink={false}
          description="Normalized anomaly feed across service metrics, alert backlog, audit failures, and orchestration fallback patterns."
          workOsOverview={workOsOverview ?? undefined}
          browserAutomationHealth={browserAutomationHealth ? {
            ...browserAutomationHealth,
            latestClaimedAt: browserAutomationHealth.latestClaimedAt ? new Date(browserAutomationHealth.latestClaimedAt).toISOString() : null,
            latestPolledAt: browserAutomationHealth.latestPolledAt ? new Date(browserAutomationHealth.latestPolledAt).toISOString() : null,
            latestUpdatedAt: browserAutomationHealth.latestUpdatedAt ? new Date(browserAutomationHealth.latestUpdatedAt).toISOString() : null,
            latestCompletedAt: browserAutomationHealth.latestCompletedAt ? new Date(browserAutomationHealth.latestCompletedAt).toISOString() : null,
            nextPollAt: browserAutomationHealth.nextPollAt ? new Date(browserAutomationHealth.nextPollAt).toISOString() : null,
          } : undefined}
        />

        <DashboardCard
          title="Work OS Coverage"
          description="Case ledger health, open exceptions, and SLA pressure for requests flowing through the Work OS pipeline."
          leading={<ClipboardList className="h-5 w-5 text-sky-600" />}
          trailing={(
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setLocation("/help/work-os")}>
                <BookOpen className="mr-1 h-4 w-4" />
                Open guide
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLocation(buildWorkOsPath())}>
                Open Work OS
              </Button>
              <Button variant="outline" size="sm" onClick={() => copyWorkOsLink(buildWorkOsPath(), "Work OS link copied")}>
                <Copy className="mr-1 h-4 w-4" />
                Copy permalink
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLocation(buildWorkOsPath("role_routine"))}>
                Role Routine
              </Button>
              <Button variant="outline" size="sm" aria-label="Copy role evidence" onClick={() => copyWorkOsLink(buildWorkOsPath("role_routine"), "Role Routine link copied")}>
                <Copy className="mr-1 h-4 w-4" />
                Copy role evidence
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLocation(buildWorkOsPath("team_run"))}>
                Team Run
              </Button>
              <Button variant="outline" size="sm" aria-label="Copy team evidence" onClick={() => copyWorkOsLink(buildWorkOsPath("team_run"), "Team Run link copied")}>
                <Copy className="mr-1 h-4 w-4" />
                Copy team evidence
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLocation(buildWorkOsPath("workpack_record"))}>
                Workpack
              </Button>
              <Button variant="outline" size="sm" aria-label="Copy workpack evidence" onClick={() => copyWorkOsLink(buildWorkOsPath("workpack_record"), "Workpack link copied")}>
                <Copy className="mr-1 h-4 w-4" />
                Copy workpack evidence
              </Button>
              <Button variant="outline" size="sm" onClick={() => setLocation(buildWorkOsPath("browser_automation"))}>
                Browser Automation
              </Button>
              <Button variant="outline" size="sm" aria-label="Copy browser evidence" onClick={() => copyWorkOsLink(buildWorkOsPath("browser_automation"), "Browser automation link copied")}>
                <Copy className="mr-1 h-4 w-4" />
                Copy browser evidence
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reconcileBrowserAutomationTasksMutation.mutate({ limit: 50 })}
                disabled={reconcileBrowserAutomationTasksMutation.isPending}
              >
                {reconcileBrowserAutomationTasksMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                Reconcile browser
              </Button>
            </div>
          )}
        >
          {workOsOverviewQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Work OS overview…
            </div>
          ) : workOsOverview ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <DashboardKpiCard icon={AlertTriangle} label="Open Exceptions" value={workOsOverview.openExceptions} />
                <DashboardKpiCard icon={Clock} label="Overdue SLA" value={workOsOverview.overdueSla} />
                <DashboardKpiCard icon={CheckCircle} label="Completed Cases" value={workOsOverview.completed} />
                <DashboardKpiCard
                  icon={ClipboardList}
                  label="Case States"
                  value={Object.values(workOsOverview.byState).reduce((sum, count) => sum + count, 0)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(workOsOverview.byState)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([state, count]) => (
                    <Badge key={state} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      {state}: {count}
                    </Badge>
                  ))}
              </div>
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Browser automation health</p>
                    <p className="text-xs text-slate-600">
                      Browser claims are reconciled in the background; use the button above to force a refresh.
                    </p>
                  </div>
                  <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                    {browserAutomationHealth ? `${browserAutomationHealth.pendingClaims} pending` : "loading…"}
                  </Badge>
                </div>
                {browserAutomationHealth ? (
                  <>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <DashboardKpiCard icon={Clock} label="Pending" value={browserAutomationHealth.pendingClaims} />
                      <DashboardKpiCard icon={RefreshCw} label="Stale" value={browserAutomationHealth.staleClaims} />
                      <DashboardKpiCard icon={CheckCircle} label="Running" value={browserAutomationHealth.runningClaims} />
                      <DashboardKpiCard icon={ClipboardList} label="Cases" value={browserAutomationHealth.distinctCases} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>Total claims: {browserAutomationHealth.totalClaims}</span>
                      <span>Completed: {browserAutomationHealth.completedClaims}</span>
                      <span>Failed: {browserAutomationHealth.failedClaims}</span>
                      <span>Cancelled: {browserAutomationHealth.cancelledClaims}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Latest polled at {browserAutomationHealth.latestPolledAt ? new Date(browserAutomationHealth.latestPolledAt).toLocaleString() : "n/a"} ·
                      next poll {browserAutomationHealth.nextPollAt ? new Date(browserAutomationHealth.nextPollAt).toLocaleString() : "n/a"} ·
                      updated {browserAutomationHealth.latestUpdatedAt ? new Date(browserAutomationHealth.latestUpdatedAt).toLocaleString() : "n/a"}
                    </p>
                  </>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Work OS links are bookmarkable. `timelineSource=work_os` keeps the main case view, while
                source-specific links jump straight to the corresponding evidence slice.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-4 text-sm text-muted-foreground">
              Work OS overview is not available yet.
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Claw Workers"
          description="Control-plane view of registered OpenClaw, Hermes, NemoClaw, and HiClaw workers, current load, and diagnostics availability."
          leading={<Server className="h-5 w-5 text-sky-600" />}
          trailing={(
            <div className="flex items-center gap-2">
              <HelpButton
                page="/admin/monitoring"
                topic="openclaw-workers"
                variant="outline"
                size="sm"
                label={locale === "th" ? "คู่มือ OpenClaw" : "OpenClaw Help"}
              />
              <HelpButton
                page="/admin/monitoring"
                topic="hermes-workers"
                variant="outline"
                size="sm"
                label={locale === "th" ? "คู่มือ Hermes" : "Hermes Help"}
              />
              <HelpButton
                page="/admin/monitoring"
                topic="nemo-claw-workers"
                variant="outline"
                size="sm"
                label={locale === "th" ? "คู่มือ NemoClaw" : "NemoClaw Help"}
              />
              <HelpButton
                page="/admin/monitoring"
                topic="hi-claw-workers"
                variant="outline"
                size="sm"
                label={locale === "th" ? "คู่มือ HiClaw" : "HiClaw Help"}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => redactLegacyWorkerDataMutation.mutate()}
                disabled={redactLegacyWorkerDataMutation.isPending}
              >
                {redactLegacyWorkerDataMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Redact Legacy Data
              </Button>
            </div>
          )}
        >
          <div className="space-y-3">
            <div className="rounded-xl border bg-slate-50 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Tenant MCP overview</p>
                  <p className="text-xs text-muted-foreground">
                    Last 24 hours of delegated MCP activity across all personal Claw workers in this tenant.
                  </p>
                </div>
                {tenantWorkerMcpOverview ? (
                  <Badge variant="outline">
                    Updated {timeAgo(tenantWorkerMcpOverview.generatedAt)}
                  </Badge>
                ) : null}
              </div>

              {tenantWorkerMcpOverviewQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading MCP overview…
                </div>
              ) : tenantWorkerMcpOverview ? (
                <div className="space-y-4">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "th" ? "Worker" : "Workers"}</p>
                      <p className="mt-1 text-sm font-medium">{tenantWorkerMcpOverview.totalWorkers}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tenantWorkerMcpOverview.workersWithActiveDelegatedSessions} {locale === "th" ? "delegated sessions ที่ใช้งานอยู่" : "active delegated sessions"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{workerLocaleText.toolCallsLabel}</p>
                      <p className="mt-1 text-sm font-medium">{tenantWorkerMcpOverview.totals.toolCalls}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tenantWorkerMcpOverview.totals.successCount} {workerLocaleText.succeededPrefix}, {tenantWorkerMcpOverview.totals.deniedCount + tenantWorkerMcpOverview.totals.budgetDeniedCount + tenantWorkerMcpOverview.totals.approvalRequiredCount} {workerLocaleText.blockedPrefix}
                      </p>
                    </div>
                    <div className="rounded-md border bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{locale === "th" ? "Worker ที่ใช้ MCP" : "Workers using MCP"}</p>
                      <p className="mt-1 text-sm font-medium">{tenantWorkerMcpOverview.workersWithRecentMcpCalls}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tenantWorkerMcpOverview.manifestStatusCounts.ready} {locale === "th" ? "พร้อมใช้" : "ready"} · {tenantWorkerMcpOverview.manifestStatusCounts.stale} {locale === "th" ? "ล้าสมัย" : "stale"} · {tenantWorkerMcpOverview.manifestStatusCounts.unavailable} {locale === "th" ? "ไม่พร้อมใช้" : "unavailable"}
                      </p>
                    </div>
                    <div className="rounded-md border bg-white p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{workerLocaleText.operatorPolicyLabel}</p>
                      <p className="mt-1 text-sm font-medium">
                        {tenantWorkerMcpOverview.operatorPolicy.enabled ? workerLocaleText.enabledLabel : workerLocaleText.disabledLabel}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tenantWorkerMcpOverview.operatorPolicy.disabledFamilies.length + tenantWorkerMcpOverview.operatorPolicy.disabledToolGroups.length + tenantWorkerMcpOverview.operatorPolicy.approvalRequiredToolGroups.length} {locale === "th" ? "ข้อจำกัดที่ใช้งานอยู่" : "active restrictions"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!tenantWorkerMcpOverview.operatorPolicy.enabled ? (
                      <Badge variant="destructive">{locale === "th" ? "ปิดใช้งาน Delegated MCP แบบรวม" : "Delegated MCP disabled globally"}</Badge>
                    ) : null}
                    {tenantWorkerMcpOverview.operatorPolicy.disabledFamilies.map((family) => (
                      <Badge key={`tenant-family-${family}`} variant="destructive">
                        {locale === "th" ? "ปิด family:" : "Family off:"} {family}
                      </Badge>
                    ))}
                    {tenantWorkerMcpOverview.operatorPolicy.disabledToolGroups.map((group) => (
                      <Badge key={`tenant-group-${group}`} variant="destructive">
                        {locale === "th" ? "ปิด group:" : "Group off:"} {group}
                      </Badge>
                    ))}
                    {tenantWorkerMcpOverview.operatorPolicy.approvalRequiredToolGroups.map((group) => (
                      <Badge key={`tenant-approval-${group}`} className="border border-amber-200 bg-amber-50 text-amber-800">
                        {locale === "th" ? "ต้องอนุมัติ:" : "Approval:"} {group}
                      </Badge>
                    ))}
                    {tenantWorkerMcpOverview.operatorPolicy.enabled
                      && tenantWorkerMcpOverview.operatorPolicy.disabledFamilies.length === 0
                      && tenantWorkerMcpOverview.operatorPolicy.disabledToolGroups.length === 0
                      && tenantWorkerMcpOverview.operatorPolicy.approvalRequiredToolGroups.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tenant-wide MCP restrictions are active right now.</p>
                      ) : null}
                  </div>

                  <div className="grid gap-3 xl:grid-cols-3">
                    <div className="rounded-md border bg-white p-3 xl:col-span-1">
                      <p className="text-xs font-medium text-slate-700">Top MCP families</p>
                      <div className="mt-2 space-y-2">
                        {tenantWorkerMcpOverview.familyMetrics.slice(0, 5).map((family) => (
                          <div key={family.family} className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs">
                            <div>
                              <div className="font-medium">{family.family}</div>
                              <div className="text-muted-foreground">
                                {family.successCount} success · {family.deniedCount} blocked
                              </div>
                            </div>
                            <Badge variant="outline">{family.totalCalls}</Badge>
                          </div>
                        ))}
                        {tenantWorkerMcpOverview.familyMetrics.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No delegated MCP family activity recorded yet.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-md border bg-white p-3 xl:col-span-1">
                      <p className="text-xs font-medium text-slate-700">Most active workers</p>
                      <div className="mt-2 space-y-2">
                        {tenantWorkerMcpOverview.workerMetrics.slice(0, 5).map((worker) => (
                          <div key={worker.workerId} className="rounded-md border border-dashed p-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{worker.displayName}</div>
                              <div className="text-muted-foreground">
                                {worker.runtimeType} · {humanizeMachineLabel(worker.healthState)} · {humanizeMachineLabel(worker.manifestStatus)}
                              </div>
                              {isHermesWorkerType(worker.runtimeType) ? (
                                <div className="text-muted-foreground">
                                  {humanizeMachineLabel(worker.channelStatus)} · {humanizeMachineLabel(worker.memorySyncStatus)}
                                </div>
                              ) : null}
                            </div>
                              <Button
                                size="sm"
                                variant={selectedWorkerId === worker.workerId ? "default" : "outline"}
                                onClick={() => setSelectedWorkerId(worker.workerId)}
                              >
                                Inspect
                              </Button>
                            </div>
                            <div className="mt-2 text-muted-foreground">
                              {worker.toolCalls} calls · {worker.blockedCount} blocked
                              {worker.lastEventAt ? ` · last ${formatAbsoluteDateTime(worker.lastEventAt)}` : ""}
                            </div>
                          </div>
                        ))}
                        {tenantWorkerMcpOverview.workerMetrics.every((worker) => worker.toolCalls === 0) ? (
                          <p className="text-xs text-muted-foreground">No workers have used delegated MCP in the selected window yet.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-md border bg-white p-3 xl:col-span-1">
                      <p className="text-xs font-medium text-slate-700">Top denial reasons</p>
                      <div className="mt-2 space-y-2">
                        {tenantWorkerMcpOverview.denialReasons.slice(0, 5).map((entry) => (
                          <div key={entry.reason} className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs">
                            <span>{humanizeMachineLabel(entry.reason)}</span>
                            <Badge variant="outline">{entry.count}</Badge>
                          </div>
                        ))}
                        {tenantWorkerMcpOverview.denialReasons.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No denied delegated MCP actions recorded in the selected window.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tenant MCP overview is available yet.</p>
              )}
            </div>

            {workerFleetQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading worker fleet…
              </div>
            ) : workerFleet.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No registered Claw workers for this tenant yet.
              </p>
            ) : (
              workerFleet.map((worker) => (
                <div
                  key={worker.id}
                  className={cn(
                    "rounded-xl border p-3",
                    selectedWorkerId === worker.id ? "border-sky-300 bg-sky-50/40" : "",
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{worker.displayName}</span>
                        <Badge className={cn("border", statusColor[worker.healthState] ?? statusColor.unknown)}>
                          {serviceStatusLabel(worker.healthState)}
                        </Badge>
                        <Badge variant="outline">{worker.status}</Badge>
                        <Badge variant="secondary">{worker.runtimeLabel}</Badge>
                        {isHermesWorkerType(worker.runtimeType) ? (
                          <Badge variant="outline">Hermes</Badge>
                        ) : null}
                        {isHermesWorkerType(worker.runtimeType) && hermesFlags.hermesProfileExperience ? (
                          <Badge variant="secondary">{worker.personaDisplayLabel}</Badge>
                        ) : null}
                        {isHermesWorkerType(worker.runtimeType) && hermesFlags.hermesChannelWorkflowExpansion ? (
                          <Badge variant="outline">{worker.channelDisplayLabel}</Badge>
                        ) : null}
                        {isHermesWorkerType(worker.runtimeType) && hermesFlags.hermesMemoryContextSync ? (
                          <Badge variant="secondary">{worker.memorySyncDisplayLabel}</Badge>
                        ) : null}
                        {isHermesWorkerType(worker.runtimeType) && worker.remoteEndpointPolicy && hermesFlags.hermesVisibilitySummaries ? (
                          <Badge className={cn("border", getHermesRemoteEndpointPolicyBadgeClass(worker.remoteEndpointPolicy))}>
                            {formatHermesRemoteEndpointPolicy(worker.remoteEndpointPolicy)}
                          </Badge>
                        ) : null}
                        <Badge
                          variant={worker.compatibilityState === "compatible" ? "outline" : "destructive"}
                        >
                          {humanizeMachineLabel(worker.compatibilityState)}
                        </Badge>
                        {worker.revokedAt ? <Badge variant="destructive">Revoked</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{worker.externalReference}</p>
                      <p className="text-xs text-muted-foreground">
                        {worker.runtimeFamily} · Runtime {worker.runtimeVersion} · {worker.activeJobCount} active jobs · {worker.boundProfileCount} bound connectors
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last seen {timeAgo(worker.lastSeenAt)} · registration {humanizeMachineLabel(worker.registrationSupport)} · dispatch {humanizeMachineLabel(worker.dispatchSupport)}{worker.dashboardUrl ? " · dashboard available" : ""}
                      </p>
                      {isHermesWorkerType(worker.runtimeType) && hermesFlags.hermesProfileExperience ? (
                        <p className="text-xs text-muted-foreground">
                          {workerLocaleText.personaPrefix} {worker.personaDisplayLabel}. {worker.personaDisplayPurpose}
                          {" "}Remote endpoint policy: {formatHermesRemoteEndpointPolicy(worker.remoteEndpointPolicy)}.
                        </p>
                      ) : null}
                      {isHermesWorkerType(worker.runtimeType) && hermesFlags.hermesChannelWorkflowExpansion ? (
                        <p className="text-xs text-muted-foreground">
                          {workerLocaleText.channelPrefix} {worker.channelDisplayLabel} · {workerLocaleText.memorySyncPrefix} {worker.memorySyncDisplayLabel}.
                        </p>
                      ) : null}
                      {isHermesWorkerType(worker.runtimeType) && hermesFlags.hermesVisibilitySummaries ? (
                        <p className="text-xs text-muted-foreground">
                          {workerLocaleText.providerRoutingPrefix} {worker.providerRoutingDisplayLabel}.
                        </p>
                      ) : null}
                      {worker.workerAccessPolicyPreset ? (
                        <p className="text-xs text-muted-foreground">
                          {workerLocaleText.accessPolicyPrefix} {formatWorkerAccessPolicy(worker)}.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedWorkerId(worker.id)}
                      >
                        Inspect
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateWorkerStateMutation.mutate({ workerId: worker.id, action: "drain" })}
                        disabled={updateWorkerStateMutation.isPending || worker.status === "draining" || Boolean(worker.revokedAt)}
                      >
                        Drain
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateWorkerStateMutation.mutate({ workerId: worker.id, action: "disable" })}
                        disabled={updateWorkerStateMutation.isPending || worker.status === "disabled"}
                      >
                        Disable
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateWorkerStateMutation.mutate({ workerId: worker.id, action: "resume" })}
                        disabled={updateWorkerStateMutation.isPending || (worker.status === "online" && !worker.revokedAt) || Boolean(worker.revokedAt)}
                      >
                        Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateWorkerStateMutation.mutate({ workerId: worker.id, action: "revoke" })}
                        disabled={updateWorkerStateMutation.isPending || Boolean(worker.revokedAt)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}

            {selectedWorkerId && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{workerLocaleText.diagnosticsTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {workerLocaleText.diagnosticsSummary} {selectedWorkerDiagnostics?.displayName ?? selectedWorkerId}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedWorkerId(null)}>
                    Close
                  </Button>
                </div>
                {workerDiagnosticsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading diagnostics…
                  </div>
                ) : selectedWorkerDiagnostics ? (
                  <div className="space-y-2 text-xs text-slate-700">
                    <p>
                      {workerLocaleText.diagnosticsCapturedPrefix} {selectedWorkerDiagnostics.capturedAt ? formatAbsoluteDateTime(selectedWorkerDiagnostics.capturedAt) : workerLocaleText.diagnosticsNoRecord}
                    </p>
                    <p>
                      {selectedWorkerDiagnostics.runtimeLabel} · {selectedWorkerDiagnostics.runtimeFamily} · {humanizeMachineLabel(selectedWorkerDiagnostics.compatibilityState)}
                    </p>
                    {isHermesWorkerType(selectedWorkerDiagnostics.runtimeType) && hermesFlags.hermesProfileExperience ? (
                      <p>
                        {workerLocaleText.personaPrefix} {selectedWorkerDiagnostics.personaDisplayLabel}. {selectedWorkerDiagnostics.personaDisplayPurpose}
                      </p>
                    ) : null}
                    {isHermesWorkerType(selectedWorkerDiagnostics.runtimeType) && hermesFlags.hermesChannelWorkflowExpansion ? (
                      <p>
                        {workerLocaleText.channelPrefix} {selectedWorkerDiagnostics.channelDisplayLabel} · {workerLocaleText.memorySyncPrefix} {selectedWorkerDiagnostics.memorySyncDisplayLabel}
                      </p>
                    ) : null}
                    {isHermesWorkerType(selectedWorkerDiagnostics.runtimeType) && hermesFlags.hermesVisibilitySummaries ? (
                      <p>
                        {workerLocaleText.providerRoutingPrefix} {selectedWorkerDiagnostics.providerRoutingDisplayLabel}
                      </p>
                    ) : null}
                    {isHermesWorkerType(selectedWorkerDiagnostics.runtimeType) && hermesFlags.hermesVisibilitySummaries ? (
                      <p>
                        Remote endpoint policy: {formatHermesRemoteEndpointPolicy(selectedWorkerDiagnostics.remoteEndpointPolicy)}.
                      </p>
                    ) : null}
                    {selectedWorkerDiagnostics.workerAccessPolicyPreset ? (
                      <p>
                        {workerLocaleText.accessPolicyPrefix} {formatWorkerAccessPolicy(selectedWorkerDiagnostics)}.
                      </p>
                    ) : null}
                    <pre className="max-h-64 overflow-auto rounded-md bg-white p-3 text-[11px] leading-5">
                      {JSON.stringify({
                        runtimeType: selectedWorkerDiagnostics.runtimeType,
                        runtimeLabel: selectedWorkerDiagnostics.runtimeLabel,
                        runtimeFamily: selectedWorkerDiagnostics.runtimeFamily,
                        compatibilityState: selectedWorkerDiagnostics.compatibilityState,
                        compatibility: selectedWorkerDiagnostics.compatibility,
                        remoteEndpointPolicy: selectedWorkerDiagnostics.remoteEndpointPolicy,
                        summary: selectedWorkerDiagnostics.summaryJson,
                        details: selectedWorkerDiagnostics.detailsJson,
                        warningFlags: selectedWorkerDiagnostics.warningFlagsJson,
                        dashboardUrl: selectedWorkerDiagnostics.dashboardUrl,
                        revokedAt: selectedWorkerDiagnostics.revokedAt,
                        workerAccessPolicyPreset: selectedWorkerDiagnostics.workerAccessPolicyPreset,
                        workerAccessPolicyScopeCount: selectedWorkerDiagnostics.workerAccessPolicyScopeCount,
                        workerAccessPolicyQuotaDisplayLabel: selectedWorkerDiagnostics.workerAccessPolicyQuotaDisplayLabel,
                      }, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{workerLocaleText.diagnosticsUnavailable}</p>
                )}

                <div className="mt-4 rounded-lg border bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{workerLocaleText.mcpTitle}</p>
                      <p className="text-xs text-muted-foreground">{workerLocaleText.mcpSummary}</p>
                    </div>
                    {selectedWorkerMcpInsights ? (
                      <Badge
                        className={cn(
                          "border",
                          selectedWorkerMcpInsights.manifestStatus === "ready"
                            ? statusColor.healthy
                            : selectedWorkerMcpInsights.manifestStatus === "stale"
                              ? statusColor.stale
                              : statusColor.failed,
                        )}
                      >
                        {humanizeMachineLabel(selectedWorkerMcpInsights.manifestStatus)}
                      </Badge>
                    ) : null}
                  </div>

                  {workerMcpInsightsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading MCP insights…
                    </div>
                  ) : selectedWorkerMcpInsights ? (
                    <div className="space-y-4">
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-md border p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{workerLocaleText.manifestLabel}</p>
                          <p className="mt-1 text-sm font-medium">
                            {humanizeMachineLabel(selectedWorkerMcpInsights.manifestStatus)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedWorkerMcpInsights.manifestReason ?? "Delegated MCP manifest is current."}
                          </p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{workerLocaleText.operatorPolicyLabel}</p>
                          <p className="mt-1 text-sm font-medium">
                            {selectedWorkerMcpInsights.manifest?.mcp.operatorPolicy.enabled === false ? workerLocaleText.disabledLabel : workerLocaleText.enabledLabel}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedWorkerMcpInsights.manifest?.mcp.operatorPolicy.approvalRequiredToolGroups.length ?? 0} {workerLocaleText.approvalGroupsSuffix}
                          </p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{workerLocaleText.toolCallsLabel}</p>
                          <p className="mt-1 text-sm font-medium">{selectedWorkerMcpInsights.totals.toolCalls}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedWorkerMcpInsights.totals.successCount} {workerLocaleText.succeededPrefix}, {selectedWorkerMcpInsights.totals.deniedCount + selectedWorkerMcpInsights.totals.budgetDeniedCount + selectedWorkerMcpInsights.totals.approvalRequiredCount} {workerLocaleText.blockedPrefix}
                          </p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{workerLocaleText.delegatedSessionLabel}</p>
                          <p className="mt-1 text-sm font-medium">
                            {selectedWorkerMcpInsights.activeDelegatedSession ? workerLocaleText.observedLabel : workerLocaleText.noneLabel}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedWorkerMcpInsights.activeDelegatedSession
                              ? `Job ${selectedWorkerMcpInsights.activeDelegatedSession.workerJobId} · expires ${formatAbsoluteDateTime(selectedWorkerMcpInsights.activeDelegatedSession.expiresAt)}`
                              : workerLocaleText.noRecentSession}
                          </p>
                          {selectedWorkerMcpInsights.activeDelegatedSession && hermesFlags.hermesTaskModes ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Mode {selectedWorkerMcpInsights.activeDelegatedSession.activeMode.displayLabel}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {selectedWorkerMcpInsights.manifest ? (
                        <div className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">
                              MCP {humanizeMachineLabel(selectedWorkerMcpInsights.manifest.availability.mcp)}
                            </Badge>
                            <Badge variant="outline">
                              Scope {humanizeMachineLabel(selectedWorkerMcpInsights.manifest.scopeProfile)}
                            </Badge>
                            {selectedWorkerMcpInsights.activeDelegatedSession && hermesFlags.hermesTaskModes ? (
                              <Badge variant="outline">
                                Mode {selectedWorkerMcpInsights.activeDelegatedSession.activeMode.displayLabel}
                              </Badge>
                            ) : null}
                            <Badge variant="outline">
                              {selectedWorkerMcpInsights.manifest.mcp.availableFamilies.length} {workerLocaleText.activeFamiliesLabel}
                            </Badge>
                            <Badge variant="outline">
                              {selectedWorkerMcpInsights.manifest.mcp.disabledTools.length} {workerLocaleText.hiddenToolsLabel}
                            </Badge>
                          </div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium text-slate-700">{workerLocaleText.availableFamiliesLabel}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedWorkerMcpInsights.manifest.mcp.families
                                  .filter((family) => family.enabled)
                                  .map((family) => (
                                    <Badge key={family.family} variant="secondary">
                                      {family.family} · {family.availableToolCount}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-700">{workerLocaleText.operatorRestrictionsLabel}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedWorkerMcpInsights.manifest.mcp.operatorPolicy.disabledFamilies.map((family) => (
                                  <Badge key={`family-${family}`} variant="destructive">
                                    Family off: {family}
                                  </Badge>
                                ))}
                                {selectedWorkerMcpInsights.manifest.mcp.operatorPolicy.disabledToolGroups.map((group) => (
                                  <Badge key={`group-${group}`} variant="destructive">
                                    Group off: {group}
                                  </Badge>
                                ))}
                                {selectedWorkerMcpInsights.manifest.mcp.operatorPolicy.approvalRequiredToolGroups.map((group) => (
                                  <Badge key={`approval-${group}`} className="border border-amber-200 bg-amber-50 text-amber-800">
                                    Approval: {group}
                                  </Badge>
                                ))}
                                {selectedWorkerMcpInsights.manifest.mcp.operatorPolicy.disabledFamilies.length === 0
                                  && selectedWorkerMcpInsights.manifest.mcp.operatorPolicy.disabledToolGroups.length === 0
                                  && selectedWorkerMcpInsights.manifest.mcp.operatorPolicy.approvalRequiredToolGroups.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No active MCP operator restrictions.</p>
                                  ) : null}
                              </div>
                            </div>
                          </div>

                          {selectedWorkerMcpInsights.manifest.mcp.disabledTools.length > 0 ? (
                            <div className="mt-3">
                              <p className="text-xs font-medium text-slate-700">Hidden or denied tools</p>
                              <div className="mt-2 space-y-2">
                                {selectedWorkerMcpInsights.manifest.mcp.disabledTools.slice(0, 8).map((tool) => (
                                  <div key={tool.name} className="rounded-md border border-dashed p-2 text-xs">
                                    <div className="font-medium">{tool.name}</div>
                                    <div className="text-muted-foreground">
                                      {tool.family} · {tool.toolGroup} · {humanizeMachineLabel(tool.reason)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-md border p-3">
                          <p className="text-xs font-medium text-slate-700">Top MCP tools</p>
                          <div className="mt-2 space-y-2">
                            {selectedWorkerMcpInsights.toolMetrics.slice(0, 8).map((tool) => (
                              <div key={tool.toolName} className="rounded-md border border-dashed p-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{tool.toolName}</span>
                                  <Badge variant="outline">{tool.totalCalls} calls</Badge>
                                </div>
                                <div className="mt-1 text-muted-foreground">
                                  {tool.family} · {tool.successCount} success · {tool.deniedCount + tool.budgetDeniedCount + tool.approvalRequiredCount} blocked
                                  {tool.lastSeenAt ? ` · last ${formatAbsoluteDateTime(tool.lastSeenAt)}` : ""}
                                </div>
                              </div>
                            ))}
                            {selectedWorkerMcpInsights.toolMetrics.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No MCP tool execution recorded for this worker in the selected window.</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-md border p-3">
                          <p className="text-xs font-medium text-slate-700">Denied reasons</p>
                          <div className="mt-2 space-y-2">
                            {selectedWorkerMcpInsights.denialReasons.slice(0, 8).map((entry) => (
                              <div key={entry.reason} className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-xs">
                                <span>{humanizeMachineLabel(entry.reason)}</span>
                                <Badge variant="outline">{entry.count}</Badge>
                              </div>
                            ))}
                            {selectedWorkerMcpInsights.denialReasons.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No denied MCP actions recorded in the current window.</p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-md border p-3">
                        <p className="text-xs font-medium text-slate-700">Recent MCP events</p>
                        <div className="mt-2 space-y-2">
                          {selectedWorkerMcpInsights.recentEvents.map((event) => (
                            <div key={`${event.traceId}-${event.timestamp}-${event.event}`} className="rounded-md border border-dashed p-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{humanizeMachineLabel(event.event)}</Badge>
                                {event.family ? <Badge variant="secondary">{event.family}</Badge> : null}
                                <span className="text-muted-foreground">{formatAbsoluteDateTime(event.timestamp)}</span>
                              </div>
                              <div className="mt-1 font-medium">{event.toolName ?? "Session-level event"}</div>
                              {event.reason ? (
                                <div className="mt-1 text-muted-foreground">{humanizeMachineLabel(event.reason)}</div>
                              ) : null}
                            </div>
                          ))}
                          {selectedWorkerMcpInsights.recentEvents.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No recent MCP audit events for this worker.</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No MCP insights available yet.</p>
                  )}
                </div>

                <div className="mt-4 rounded-lg border bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Worker credit guardrails</p>
                      <p className="text-xs text-muted-foreground">
                        Safety caps for this personal worker. Charges still come from the acting user's SmartAIHub balance.
                      </p>
                    </div>
                    {selectedWorkerBudget?.blockedByBudget ? (
                      <Badge variant="destructive">Blocked by budget</Badge>
                    ) : (
                      <Badge variant="outline">Personal worker budget</Badge>
                    )}
                  </div>

                  {workerBudgetQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading worker budget…
                    </div>
                  ) : selectedWorkerBudgetDraft ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        {([
                          ["hourlyCredits", "Hourly cap"],
                          ["fiveHourCredits", "5-hour cap"],
                          ["dailyCredits", "Daily cap"],
                          ["weeklyCredits", "Weekly cap"],
                          ["monthlyCredits", "Monthly cap"],
                        ] as Array<[keyof WorkerBudgetDraft, string]>).map(([key, label]) => (
                          <div key={key}>
                            <Label>{label}</Label>
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={selectedWorkerBudgetDraft[key]}
                              placeholder="Unlimited"
                              onChange={(event) => setSelectedWorkerBudgetField(key, event.target.value)}
                              className="mt-1"
                            />
                          </div>
                        ))}
                      </div>

                      {selectedWorkerBudget?.windows?.length ? (
                        <div className="space-y-1 rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
                          {selectedWorkerBudget.windows.map((window) => (
                            <div key={window.label} className="flex items-center justify-between gap-3">
                              <span>{workerBudgetWindowLabel(window.label)}</span>
                              <span className={cn(window.blocked ? "font-medium text-red-600" : "text-muted-foreground")}>
                                {window.usedCredits} used
                                {window.capCredits != null ? ` / ${window.capCredits} cap` : " / unlimited"}
                                {window.remainingCredits != null ? ` · ${window.remainingCredits} left` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={clearSelectedWorkerBudget}
                          disabled={updateWorkerBudgetMutation.isPending}
                        >
                          Clear caps
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveSelectedWorkerBudget}
                          disabled={updateWorkerBudgetMutation.isPending}
                        >
                          {updateWorkerBudgetMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Save worker budget
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No worker budget data available yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </DashboardCard>

        {(focusedIncident || focusedAnomaly) && (
          <div
            ref={incidentSummaryRef}
            className={cn(
              "rounded-3xl transition-all duration-500",
              flashTarget === "incident" ? "ring-2 ring-sky-300 ring-offset-2" : "",
            )}
          >
            <IncidentSummaryCard
              locale={locale}
              incident={focusedIncident}
              anomaly={focusedAnomaly}
              lastCheck={lastCheck}
              onOpenAlerts={() => navigateToTabAndReveal("alerts")}
              onOpenChecks={() => navigateToTabAndReveal("checks")}
              onOpenMetrics={() => navigateToTabAndReveal("metrics")}
              onClearFocus={routeState.incidentKey ? clearIncidentFocus : null}
            />
          </div>
        )}

        {focusedIncident && (
          <IncidentOperatorLogCard
            incident={focusedIncident}
            currentUser={{
              id: Number(user.id),
              name: user.name,
              email: user.email,
            }}
            adminUsers={adminUsers.length > 0 ? adminUsers : [{
              id: Number(user.id),
              name: user.name,
              email: user.email,
              role: user.role ?? "admin",
            }]}
            onAfterMutation={handleAlertMutationRefresh}
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
              onClick={() => navigateToTabAndReveal("alerts")}
            >
              View Alerts
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div
          ref={tabsSectionRef}
          className={cn(
            "rounded-3xl transition-all duration-500",
            flashTarget === "tabs" ? "ring-2 ring-sky-300 ring-offset-2" : "",
          )}
        >
          <div className="flex border-b mb-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => navigateToTab(tab.id)}
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
          {activeTab === "alerts" && (
            <AlertsTab
              incidentKey={routeState.incidentKey}
              incidentTitle={focusedIncident?.title ?? focusedAnomaly?.title ?? null}
              onClearFocus={clearIncidentFocus}
              onAfterAlertMutation={handleAlertMutationRefresh}
            />
          )}
          {activeTab === "metrics" && <MetricsTab />}
          {activeTab === "context" && (
            <div className="space-y-6">
              <KnowledgeVaultReadinessDashboard />
              <ContextEngineEvaluationDashboard
                className="space-y-6"
                initialScope={{
                  teamId: routeState.contextScope.teamId ?? undefined,
                  roomId: routeState.contextScope.roomId ?? undefined,
                  runId: routeState.contextScope.runId ?? undefined,
                  skillId: routeState.contextScope.skillId ?? undefined,
                  userId:
                    routeState.contextScope.userId != null
                      ? String(routeState.contextScope.userId)
                      : undefined,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
