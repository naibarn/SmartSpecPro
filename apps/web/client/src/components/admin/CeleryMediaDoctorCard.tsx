import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Container, Loader2, RefreshCw, ShieldCheck, Siren } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard";

function statusLabel(status: string) {
  if (status === "running") return "Healthy";
  if (status === "duplicate") return "Duplicate blocked";
  if (status === "unhealthy") return "Unhealthy";
  if (status === "missing") return "Missing";
  if (status === "stopped") return "Stopped";
  return "Unavailable";
}

function statusClass(status: string) {
  return status === "running"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : status === "duplicate" || status === "unavailable"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
}

function normalizeUserId(value: number | string | null | undefined): number | undefined {
  const userId = typeof value === "number" ? value : Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : undefined;
}

export function CeleryMediaDoctorCard({ currentUserId }: { currentUserId: number | string }) {
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(() => normalizeUserId(currentUserId));
  const statusQuery = trpc.infrastructure.getCeleryMediaDoctorStatus.useQuery(
    selectedUserId == null ? undefined : { userId: selectedUserId },
    { refetchInterval: 30_000 },
  );
  const doctorMutation = trpc.infrastructure.runCeleryMediaDoctor.useMutation({
    onSuccess: () => void statusQuery.refetch(),
  });
  const data = statusQuery.data;
  const selectedUser = data?.selectedUser;
  const incidentUsers = useMemo(() => (data?.users ?? []).filter((user) => user.stalePendingCount > 0), [data?.users]);

  useEffect(() => {
    if (selectedUserId == null && incidentUsers[0]) setSelectedUserId(incidentUsers[0].userId);
  }, [incidentUsers, selectedUserId]);

  if (statusQuery.error && !data) {
    return (
      <DashboardCard title="Celery Media Doctor" description="Live worker, beat, queue, and duplicate-container safety checks.">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-rose-700">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Unable to load Celery status.</span>
          <Button size="sm" variant="outline" onClick={() => void statusQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      </DashboardCard>
    );
  }

  if (!data) {
    return (
      <DashboardCard title="Celery Media Doctor" description="Live worker, beat, queue, and duplicate-container safety checks.">
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking Celery runtime…</div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Celery Media Doctor"
      description="Live worker, beat, queue, and duplicate-container safety checks."
      trailing={
        <Button size="sm" variant="outline" onClick={() => doctorMutation.mutate()} disabled={doctorMutation.isPending}>
          {doctorMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Run Doctor
        </Button>
      }
    >
      <div className="grid gap-3 lg:grid-cols-4">
        {[data.workers.media, data.workers.beat].map((service) => (
          <div key={service.service} className="rounded-xl border border-slate-200 bg-white/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Container className="h-4 w-4" />{service.service}</span>
              <Badge className={statusClass(service.status)}>{statusLabel(service.status)}</Badge>
            </div>
            <p className="mt-2 text-xs text-slate-500">{service.containerName}</p>
            {service.duplicate ? <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-700"><AlertTriangle className="h-3 w-3" /> Auto-repair blocked</p> : null}
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Activity className="h-4 w-4" /> Media queue</span>
          <p className="mt-2 text-2xl font-bold text-slate-900">{data.queue.redisMediaDepth ?? "—"}</p>
          <p className="text-xs text-slate-500">Redis messages · {data.queue.inFlightCount}/3 in-flight · {data.queue.pendingCount} pending ({data.queue.unclaimedPendingCount} waiting)</p>
        </div>
        <div className={`rounded-xl border p-3 ${data.queue.stalePendingCount ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">{data.queue.stalePendingCount ? <Siren className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />} Dispatch stall &gt; 3 min</span>
          <p className="mt-2 text-2xl font-bold text-slate-900">{data.queue.stalePendingCount}</p>
          <p className="text-xs text-slate-500">Only old waiting work with an available user slot is urgent</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ShieldCheck className="h-4 w-4 text-sky-600" /> User queue inspection</div>
          <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" aria-label="Inspect user queue" value={selectedUserId ?? ""} onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : undefined)}>
            <option value="">All users</option>
            {(data.users ?? []).map((user) => <option key={user.userId} value={user.userId}>{user.name || user.email || `User #${user.userId}`}</option>)}
          </select>
        </div>
        {selectedUser ? <p className="mt-2 text-sm text-slate-600">Selected/current user: <span className="font-semibold">{selectedUser.name || selectedUser.email || `#${selectedUser.userId}`}</span> · {selectedUser.inFlightCount}/3 in-flight · {selectedUser.pendingCount} pending ({selectedUser.unclaimedPendingCount} waiting) · {selectedUser.stalePendingCount} dispatch stall</p> : <p className="mt-2 text-sm text-slate-500">Current user has no active image work. {data.users.length} other user(s) currently have active image work.</p>}
        {selectedUser && selectedUser.pendingCount > 0 && selectedUser.stalePendingCount === 0 ? <p className="mt-2 text-xs text-slate-500">Waiting backlog is normal while the user's three in-flight slots are occupied.</p> : null}
        {incidentUsers.length > 0 ? <p className="mt-2 text-xs font-medium text-rose-700">Urgent: {incidentUsers.length} user queue(s) have a dispatch stall with available capacity.</p> : null}
      </div>
    </DashboardCard>
  );
}
