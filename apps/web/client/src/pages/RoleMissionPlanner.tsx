import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

export default function RoleMissionPlanner() {
  const [, params] = useRoute("/role-monitor/:roleId/mission");
  const roleId = params?.roleId ?? "";
  const utils = trpc.useUtils();
  const detailQuery = trpc.roleMonitor.detail.useQuery({ roleId }, { enabled: Boolean(roleId) });

  const [missionStatement, setMissionStatement] = useState("");
  const [autonomyTier, setAutonomyTier] = useState("guided");
  const [monthlyBudgetLimit, setMonthlyBudgetLimit] = useState("100");
  const [bindingLabel, setBindingLabel] = useState("Primary workpack binding");
  const [workpackFamily, setWorkpackFamily] = useState("");
  const [resolutionPolicy, setResolutionPolicy] = useState<"pinned_version" | "follow_benchmark_track" | "follow_latest_ready_in_family">("follow_latest_ready_in_family");
  const [pinnedVersionId, setPinnedVersionId] = useState("");

  useEffect(() => {
    if (!detailQuery.data) return;
    setMissionStatement(detailQuery.data.activeContract?.missionStatement ?? "");
    setAutonomyTier(detailQuery.data.role.currentAutonomyTier);
    setMonthlyBudgetLimit(String(detailQuery.data.activeContract?.authorityEnvelope.monthlyBudgetLimit ?? 100));
    if (!workpackFamily) {
      setWorkpackFamily(detailQuery.data.bindings[0]?.workpackFamily ?? "");
    }
  }, [detailQuery.data, workpackFamily]);

  const updateMissionMutation = trpc.roleMonitor.updateMission.useMutation({
    onSuccess: async () => {
      toast.success("Mission update queued for review");
      await utils.roleMonitor.detail.invalidate({ roleId });
    },
    onError: (error) => toast.error(error.message),
  });

  const upsertBindingMutation = trpc.roleMonitor.upsertBinding.useMutation({
    onSuccess: async () => {
      toast.success("Role-workpack binding saved");
      await utils.roleMonitor.detail.invalidate({ roleId });
    },
    onError: (error) => toast.error(error.message),
  });

  if (detailQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading mission planner...</div>;
  }

  if (!detailQuery.data) {
    return <div className="p-6 text-sm text-slate-500">Mission planner is unavailable.</div>;
  }

  const detail = detailQuery.data;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Role Mission Planner</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{detail.role.name}</h1>
          <p className="mt-2 text-sm text-slate-600">Edit mission, autonomy, and workpack-family bindings without losing the active operational context.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/role-monitor/${roleId}`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">
            Role detail
          </Link>
          <Link href={`/role-monitor/${roleId}/routines`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">
            Routine scheduler
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <DashboardCard title="Mission and Authority Envelope" description="Changes create reviewable contract revisions instead of silently widening autonomy">
          <div className="space-y-4">
            <Textarea value={missionStatement} onChange={(event) => setMissionStatement(event.target.value)} className="min-h-[160px]" />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-600">
                Autonomy tier
                <select
                  className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                  value={autonomyTier}
                  onChange={(event) => setAutonomyTier(event.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="guided">Guided</option>
                  <option value="supervised">Supervised</option>
                  <option value="autonomous">Autonomous</option>
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                Monthly budget limit
                <Input value={monthlyBudgetLimit} onChange={(event) => setMonthlyBudgetLimit(event.target.value)} />
              </label>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              High-risk changes remain pending review. The active contract is not replaced automatically from this screen.
            </div>
            <Button
              disabled={updateMissionMutation.isPending || !missionStatement.trim()}
              onClick={() => updateMissionMutation.mutate({
                roleId,
                missionStatement,
                autonomyTier: autonomyTier as "manual" | "guided" | "supervised" | "autonomous",
                monthlyBudgetLimit: Number(monthlyBudgetLimit || "0"),
              })}
            >
              {updateMissionMutation.isPending ? "Saving..." : "Queue mission revision"}
            </Button>
          </div>
        </DashboardCard>

        <DashboardCard title="Role-Workpack Bindings" description="Choose how this role resolves workpack families and rollback baselines">
          <div className="space-y-4">
            <Input value={bindingLabel} onChange={(event) => setBindingLabel(event.target.value)} placeholder="Binding label" />
            <Input value={workpackFamily} onChange={(event) => setWorkpackFamily(event.target.value)} placeholder="Workpack family id" />
            <label className="block text-sm text-slate-600">
              Resolution policy
              <select
                className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                value={resolutionPolicy}
                onChange={(event) => setResolutionPolicy(event.target.value as typeof resolutionPolicy)}
              >
                <option value="follow_latest_ready_in_family">Follow latest ready in family</option>
                <option value="follow_benchmark_track">Follow benchmark track</option>
                <option value="pinned_version">Pinned version</option>
              </select>
            </label>
            {resolutionPolicy === "pinned_version" ? (
              <Input value={pinnedVersionId} onChange={(event) => setPinnedVersionId(event.target.value)} placeholder="Pinned version id" />
            ) : null}
            <Button
              disabled={upsertBindingMutation.isPending || !workpackFamily.trim() || !detail.activeContract}
              onClick={() => upsertBindingMutation.mutate({
                roleId,
                contractId: detail.activeContract?.id ?? "",
                label: bindingLabel,
                workpackFamily,
                resolutionPolicy,
                pinnedVersionId: resolutionPolicy === "pinned_version" ? pinnedVersionId || undefined : undefined,
              })}
            >
              {upsertBindingMutation.isPending ? "Saving..." : "Save binding"}
            </Button>

            <div className="space-y-3">
              {detail.bindings.map((binding) => (
                <div key={binding.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">{binding.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {binding.workpackFamily} • {binding.resolutionPolicy} • rollback {binding.rollbackBaselineVersionId ?? "n/a"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
