import { useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, Clock3, Database, Loader2, RefreshCw, Server, Activity, TimerReset } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";

function formatAge(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function statusTone(hasIncident: boolean) {
  return hasIncident
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: typeof Server;
  label: string;
  value: string | number;
  detail: string;
  tone?: "neutral" | "warning" | "danger" | "positive";
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white/80",
    warning: "border-amber-200 bg-amber-50/80",
    danger: "border-rose-200 bg-rose-50/80",
    positive: "border-emerald-200 bg-emerald-50/80",
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

export function WorkerJobMonitorCard() {
  const { t } = useScopedTranslation("dashboard");
  const [, setLocation] = useLocation();
  const summaryQuery = trpc.workerJobs.adminDashboardSummary.useQuery(undefined, {
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const data = summaryQuery.data;

  if (summaryQuery.error && !data) {
    return (
      <DashboardCard
        title={t("dashboard:workerMonitor.title")}
        description={t("dashboard:workerMonitor.description")}
        leading={<Server className="h-5 w-5 text-sky-600" aria-hidden="true" />}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{t("dashboard:workerMonitor.loadError")}</span>
          <Button size="sm" variant="outline" onClick={() => void summaryQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{t("dashboard:workerMonitor.retry")}
          </Button>
        </div>
      </DashboardCard>
    );
  }

  if (!data) {
    return (
      <DashboardCard
        title={t("dashboard:workerMonitor.title")}
        description={t("dashboard:workerMonitor.description")}
        leading={<Server className="h-5 w-5 text-sky-600" aria-hidden="true" />}
      >
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("dashboard:workerMonitor.checking")}</div>
      </DashboardCard>
    );
  }

  const incident = data.alerts.hasIncident || data.alerts.capacityExhausted;
  const workerDetail = `${data.capacity.workersOnline}/${data.capacity.workersTotal} online · ${data.capacity.workersStale} stale`;
  const queueCount = data.counts.pending + data.counts.queued + data.counts.retryScheduled;
  const queueDetail = `${data.counts.pending} pending · ${data.counts.queued} queued · ${data.counts.retryScheduled} retry scheduled`;
  const executingDetail = Object.entries(data.counts.executingByStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status} ${count}`)
    .join(" · ") || "none";
  const activeDetail = `${executingDetail} · ${data.counts.waitingExternal} waiting external`;
  const outboxDetail = `${data.outbox.failed} failed · ${data.outbox.quarantined} quarantined`;
  const freeSlotsDetail = data.capacity.capacityKnown
    ? t("dashboard:workerMonitor.verifiedCapacity", {
      free: data.capacity.freeSlots,
      total: data.capacity.totalSlots,
    })
    : t("dashboard:workerMonitor.partialCapacity", {
      free: data.capacity.freeSlots,
      unknown: data.capacity.unknownCapacityWorkers,
    });

  return (
    <DashboardCard
      title={t("dashboard:workerMonitor.title")}
      description={t("dashboard:workerMonitor.description")}
      leading={<Server className="h-5 w-5 text-sky-600" aria-hidden="true" />}
      trailing={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`gap-1.5 ${statusTone(incident)}`}>
            {incident ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {incident ? t("dashboard:workerMonitor.attention") : t("dashboard:workerMonitor.healthy")}
          </Badge>
          <Button aria-label={t("dashboard:workerMonitor.refresh")} size="sm" variant="outline" onClick={() => void summaryQuery.refetch()} disabled={summaryQuery.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${summaryQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />{t("dashboard:workerMonitor.refresh")}
          </Button>
          <Button size="sm" onClick={() => setLocation("/admin/queues")}>{t("dashboard:workerMonitor.openQueue")}</Button>
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Clock3} label={t("dashboard:workerMonitor.queued")} value={queueCount} detail={queueDetail} tone={queueCount > 0 ? "warning" : "neutral"} />
        <Metric icon={Activity} label={t("dashboard:workerMonitor.activeJobs")} value={data.counts.active} detail={`${activeDetail} · ${t("dashboard:workerMonitor.staleLeases", { count: data.counts.stale })}`} tone={data.counts.stale > 0 ? "danger" : "neutral"} />
        <Metric icon={Server} label={t("dashboard:workerMonitor.freeSlots")} value={data.capacity.freeSlots} detail={`${freeSlotsDetail} · ${workerDetail}`} tone={data.capacity.freeSlots === 0 && (data.counts.queued + data.counts.pending) > 0 ? "warning" : "positive"} />
        <Metric icon={Database} label={t("dashboard:workerMonitor.outboxPending")} value={data.outbox.pending} detail={outboxDetail} tone={data.outbox.failed + data.outbox.quarantined > 0 ? "danger" : "neutral"} />
      </div>

      {data.openJobs.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {t("dashboard:workerMonitor.openJobs", { count: data.openJobs.length })}
            </div>
            <span className="text-xs text-amber-700">{t("dashboard:workerMonitor.openJobsDescription")}</span>
          </div>
          <div className="max-h-96 divide-y divide-amber-100 overflow-y-auto">
            {data.openJobs.map(job => (
              <div key={job.id} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{job.jobType}</p>
                  <p className="truncate text-xs text-slate-600">{job.id} · {job.statusReason || t("dashboard:workerMonitor.noStatusReason")}</p>
                </div>
                <Badge variant="outline" className="w-fit capitalize">{job.status.replaceAll("_", " ")}</Badge>
                <div className="text-xs text-slate-600 lg:text-right">
                  <p>{t("dashboard:workerMonitor.jobAge", { age: formatAge(job.ageSeconds) })}</p>
                  <p>{job.workerId ? `${t("dashboard:workerMonitor.workerId")}: ${job.workerId}` : t("dashboard:workerMonitor.noWorkerAssigned")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {t("dashboard:workerMonitor.noOpenJobs")}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Server className="h-4 w-4 text-sky-600" aria-hidden="true" />
            {t("dashboard:workerMonitor.slotSources")}
          </div>
          <p className="mt-1 text-xs text-slate-500">{t("dashboard:workerMonitor.slotSourcesDescription")}</p>
        </div>
        <div className="divide-y divide-slate-100">
          {data.capacity.slotSources.map(source => (
            <div key={source.workerId} className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1.2fr)] lg:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{source.displayName}</p>
                <p className="truncate text-xs text-slate-500">{source.workerId} · {source.runtimeType}</p>
              </div>
              <Badge variant="outline" className={source.eligible ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"}>
                {source.capacity == null
                  ? t("dashboard:workerMonitor.capacityUnknown")
                  : t("dashboard:workerMonitor.slotCount", { free: source.freeSlots ?? 0, total: source.capacity })}
              </Badge>
              <div className="text-xs text-slate-600 lg:text-right">
                <p>{source.eligible ? t("dashboard:workerMonitor.workerEligible") : t("dashboard:workerMonitor.workerExcluded")}</p>
                <p>{t("dashboard:workerMonitor.slotEvidence", {
                  source: source.capacitySource || t("dashboard:workerMonitor.notAdvertised"),
                  assigned: source.assignedJobCount,
                  reported: source.reportedJobCount ?? "—",
                })}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("dashboard:workerMonitor.backlogAge")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatAge(data.backlog.oldestQueuedAgeSeconds)}</p>
          <p className="text-xs text-slate-500">{t("dashboard:workerMonitor.oldestQueued")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("dashboard:workerMonitor.outboxAge")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatAge(data.outbox.oldestPendingAgeSeconds)}</p>
          <p className="text-xs text-slate-500">{t("dashboard:workerMonitor.oldestOutbox")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("dashboard:workerMonitor.workerHealth")}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{t("dashboard:workerMonitor.unhealthy", { count: data.capacity.workersUnhealthy })}</p>
          <p className="text-xs text-slate-500">{t("dashboard:workerMonitor.heartbeatDetail", { stale: data.capacity.workersStale, depth: data.capacity.queueDepth })}</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><TimerReset className="h-4 w-4 text-sky-600" aria-hidden="true" />{t("dashboard:workerMonitor.recentJobs")}</div>
          <span className="text-xs text-slate-500">{t("dashboard:workerMonitor.autoRefresh")}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {data.recentJobs.length === 0 ? <p className="px-4 py-5 text-sm text-slate-500">{t("dashboard:workerMonitor.noJobs")}</p> : data.recentJobs.slice(0, 5).map(job => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{job.jobType}</p>
                <p className="truncate text-xs text-slate-500">{job.runtimeType} · {job.executionClass}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{job.status.replaceAll("_", " ")}</Badge>
                {job.failureReason ? <AlertTriangle className="h-4 w-4 text-rose-600" aria-label={t("dashboard:workerMonitor.jobFailed")} /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  );
}
