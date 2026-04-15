import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export default function RoleRoutineScheduler() {
  const [, params] = useRoute("/role-monitor/:roleId/routines");
  const roleId = params?.roleId ?? "";
  const utils = trpc.useUtils();
  const detailQuery = trpc.roleMonitor.detail.useQuery({ roleId }, { enabled: Boolean(roleId) });

  const [title, setTitle] = useState("Daily operational sweep");
  const [description, setDescription] = useState("Run routine operational checks on a regular cadence.");
  const [bindingId, setBindingId] = useState("");
  const [triggerType, setTriggerType] = useState<"schedule" | "manual">("schedule");
  const [intervalMinutes, setIntervalMinutes] = useState("60");
  const [concurrencyPolicy, setConcurrencyPolicy] = useState<"singleton" | "allow_overlap" | "partitioned_by_key">("singleton");
  const [slaMinutes, setSlaMinutes] = useState("60");

  useEffect(() => {
    if (!detailQuery.data) return;
    if (!bindingId) {
      setBindingId(detailQuery.data.bindings[0]?.id ?? "");
    }
  }, [bindingId, detailQuery.data]);

  const upsertRoutineMutation = trpc.roleMonitor.upsertRoutine.useMutation({
    onSuccess: async () => {
      toast.success("Routine saved");
      await utils.roleMonitor.detail.invalidate({ roleId });
    },
    onError: (error) => toast.error(error.message),
  });
  const pauseRoutineMutation = trpc.roleMonitor.pauseRoutine.useMutation({
    onSuccess: async () => {
      toast.success("Routine paused");
      await utils.roleMonitor.detail.invalidate({ roleId });
    },
    onError: (error) => toast.error(error.message),
  });
  const resumeRoutineMutation = trpc.roleMonitor.resumeRoutine.useMutation({
    onSuccess: async () => {
      toast.success("Routine resumed");
      await utils.roleMonitor.detail.invalidate({ roleId });
    },
    onError: (error) => toast.error(error.message),
  });
  const safeResumeReviewMutation = trpc.roleMonitor.requestSafeResumeReview.useMutation({
    onSuccess: async () => {
      toast.success("Safe resume review requested");
      await utils.roleMonitor.detail.invalidate({ roleId });
    },
    onError: (error) => toast.error(error.message),
  });

  if (detailQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading routine scheduler...</div>;
  }

  if (!detailQuery.data) {
    return <div className="p-6 text-sm text-slate-500">Routine scheduler is unavailable.</div>;
  }

  const detail = detailQuery.data;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Role Routine Scheduler</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{detail.role.name}</h1>
          <p className="mt-2 text-sm text-slate-600">Define routine cadence, concurrency, and safe-resume workflows for this persistent role.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/role-monitor/${roleId}`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">
            Role detail
          </Link>
          <Link href={`/role-monitor/${roleId}/mission`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">
            Mission planner
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <DashboardCard title="Create or Update Routine" description="Schedules should remain explicit, durable, and reviewable">
          <div className="space-y-4">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Routine title" />
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Routine description" />
            <label className="block text-sm text-slate-600">
              Workpack binding
              <select
                className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={bindingId}
                onChange={(event) => setBindingId(event.target.value)}
              >
                {detail.bindings.map((binding) => (
                  <option key={binding.id} value={binding.id}>
                    {binding.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block text-sm text-slate-600">
                Trigger type
                <select
                  className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  value={triggerType}
                  onChange={(event) => setTriggerType(event.target.value as typeof triggerType)}
                >
                  <option value="schedule">Schedule</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                Interval minutes
                <Input value={intervalMinutes} onChange={(event) => setIntervalMinutes(event.target.value)} />
              </label>
              <label className="block text-sm text-slate-600">
                SLA minutes
                <Input value={slaMinutes} onChange={(event) => setSlaMinutes(event.target.value)} />
              </label>
            </div>
            <label className="block text-sm text-slate-600">
              Concurrency policy
              <select
                className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={concurrencyPolicy}
                onChange={(event) => setConcurrencyPolicy(event.target.value as typeof concurrencyPolicy)}
              >
                <option value="singleton">Singleton</option>
                <option value="allow_overlap">Allow overlap</option>
                <option value="partitioned_by_key">Partitioned by key</option>
              </select>
            </label>
            <Button
              disabled={upsertRoutineMutation.isPending || !detail.activeContract || !bindingId}
              onClick={() => upsertRoutineMutation.mutate({
                roleId,
                contractId: detail.activeContract?.id ?? "",
                title,
                description,
                workpackBindingIds: [bindingId],
                autonomyTier: detail.role.currentAutonomyTier,
                triggerType,
                intervalMinutes: triggerType === "schedule" ? Number(intervalMinutes || "0") : undefined,
                concurrencyPolicy,
                slaMinutes: Number(slaMinutes || "0"),
              })}
            >
              {upsertRoutineMutation.isPending ? "Saving..." : "Save routine"}
            </Button>
          </div>
        </DashboardCard>

        <DashboardCard title="Existing Routines" description="Operator controls should stay close to current routine posture">
          <div className="space-y-3">
            {detail.routines.length === 0 ? (
              <p className="text-sm text-slate-500">No routines configured yet.</p>
            ) : (
              detail.routines.map((routine) => (
                <div key={routine.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{routine.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {routine.schedule.triggerType} • interval {routine.schedule.intervalMinutes ?? "n/a"} • concurrency {routine.concurrencyPolicy}
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                      {routine.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pauseRoutineMutation.isPending}
                      onClick={() => pauseRoutineMutation.mutate({
                        roleId,
                        routineId: routine.id,
                        reason: "Operator pause from routine scheduler",
                      })}
                    >
                      Pause
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={resumeRoutineMutation.isPending}
                      onClick={() => resumeRoutineMutation.mutate({
                        roleId,
                        routineId: routine.id,
                        reason: "Operator resume from routine scheduler",
                      })}
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      disabled={safeResumeReviewMutation.isPending}
                      onClick={() => safeResumeReviewMutation.mutate({
                        roleId,
                        routineId: routine.id,
                        note: "Review requested from routine scheduler",
                      })}
                    >
                      Request safe resume review
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
