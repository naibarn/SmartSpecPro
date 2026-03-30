/**
 * Admin Monitoring Page — /admin/monitoring
 *
 * Displays server status, health check history, alerts, and metrics charts.
 * Tabs: Checks | Alerts | Metrics
 */

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { OpsEarlyWarningPanel, type OpsOverview } from "@/components/admin/OpsEarlyWarningPanel";
import { HelpButton } from "@/components/help/HelpButton";
import { Badge } from "@/components/ui/badge";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { getOpsIncidentGuidance } from "@/lib/opsMonitoringGuidance";
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
  Info,
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

function parseMonitoringRoute(location: string): { incidentKey: string | null; tab: Tab | null } {
  const search = location.includes("?") ? location.slice(location.indexOf("?")) : "";
  const params = new URLSearchParams(search);
  const rawTab = params.get("tab");
  const tab = rawTab === "checks" || rawTab === "alerts" || rawTab === "metrics" ? rawTab : null;
  return {
    incidentKey: params.get("incident"),
    tab,
  };
}

function buildMonitoringPath(tab: Tab, incidentKey?: string | null): string {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (incidentKey) {
    params.set("incident", incidentKey);
  }
  return `/admin/monitoring?${params.toString()}`;
}

function incidentKeyFromAnomaly(anomaly: OpsOverview["anomalies"][number] | null | undefined): string | null {
  if (!anomaly) return null;
  return `ops-overview:${anomaly.id}`;
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

type Tab = "checks" | "alerts" | "metrics";

export default function AdminMonitoring() {
  const { user, loading: authLoading } = useAuth();
  const { locale } = useScopedTranslation("admin");
  const [location, setLocation] = useLocation();
  const routeState = useMemo(() => parseMonitoringRoute(location), [location]);
  const [activeTab, setActiveTab] = useState<Tab>(routeState.tab ?? (routeState.incidentKey ? "alerts" : "checks"));

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
  const forceFreshCheckMutation = trpc.monitoring.forceFreshCheck.useMutation({
    onSuccess: async () => {
      toast.success("Fresh monitoring check recorded");
      await Promise.all([
        statusQuery.refetch(),
        opsOverviewQuery.refetch(),
        ...(routeState.incidentKey ? [focusedIncidentQuery.refetch()] : []),
      ]);
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to force a fresh check");
    },
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
  const focusedIncident = ((focusedIncidentQuery.data?.items as OpsIncidentTimelineItem[] | undefined) ?? [])[0] ?? null;
  const anomalies = opsOverviewQuery.data?.anomalies ?? [];
  const adminUsers = ((adminUsersQuery.data?.users as AdminUserOption[] | undefined) ?? [])
    .filter((candidate) => candidate.role === "admin" || candidate.role === "domain_admin");
  const focusedAnomaly = routeState.incidentKey
    ? anomalies.find((anomaly) => incidentKeyFromAnomaly(anomaly) === routeState.incidentKey) ?? null
    : anomalies[0] ?? null;

  const navigateToTab = (tab: Tab) => {
    setActiveTab(tab);
    setLocation(buildMonitoringPath(tab, routeState.incidentKey));
  };

  const clearIncidentFocus = () => {
    setLocation(buildMonitoringPath(activeTab, null));
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
                {routeState.incidentKey && (
                  <p className="text-xs text-slate-500 mt-1">
                    Incident focus: {routeState.incidentKey}
                  </p>
                )}
              </div>
            </div>
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
              onClick={() => forceFreshCheckMutation.mutate()}
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

        <OpsEarlyWarningPanel
          overview={opsOverviewQuery.data}
          isLoading={opsOverviewQuery.isLoading}
          showMonitoringLink={false}
          description="Normalized anomaly feed across service metrics, alert backlog, audit failures, and orchestration fallback patterns."
        />

        {(focusedIncident || focusedAnomaly) && (
          <IncidentSummaryCard
            locale={locale}
            incident={focusedIncident}
            anomaly={focusedAnomaly}
            lastCheck={lastCheck}
            onOpenAlerts={() => navigateToTab("alerts")}
            onOpenChecks={() => navigateToTab("checks")}
            onOpenMetrics={() => navigateToTab("metrics")}
            onClearFocus={routeState.incidentKey ? clearIncidentFocus : null}
          />
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
              onClick={() => navigateToTab("alerts")}
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
        </div>
      </div>
    </div>
  );
}
