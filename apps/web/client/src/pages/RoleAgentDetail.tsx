import { useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { RoleCommsStream } from "@/components/role-monitor/RoleCommsStream";
import { RoleHealthBadge } from "@/components/role-monitor/RoleHealthBadge";
import { RoleWorkpackLinks } from "@/components/role-monitor/RoleWorkpackLinks";

function toneForState(value: string): "healthy" | "warning" | "danger" | "muted" {
  if (value === "healthy" || value === "ready" || value === "active") return "healthy";
  if (value === "review_required" || value === "staged" || value === "paused" || value === "degraded") return "warning";
  if (value === "blocked" || value === "quarantined") return "danger";
  return "muted";
}

export default function RoleAgentDetail() {
  const [, params] = useRoute("/role-monitor/:roleId");
  const roleId = params?.roleId ?? "";
  const utils = trpc.useUtils();
  const [intentType, setIntentType] = useState<"status_summary" | "handoff" | "approval_request" | "shared_finding">("status_summary");
  const [recipientRoleId, setRecipientRoleId] = useState("");
  const [contentSummary, setContentSummary] = useState("Shift summary ready for review.");

  const detailQuery = trpc.roleMonitor.detail.useQuery({ roleId }, { enabled: Boolean(roleId) });
  const timelineQuery = trpc.roleMonitor.timeline.useQuery({ roleId }, { enabled: Boolean(roleId) });
  const telemetryQuery = trpc.roleMonitor.telemetry.useQuery({ roleId }, { enabled: Boolean(roleId) });
  const rosterQuery = trpc.roleMonitor.roster.useQuery();
  const roleMessagesQuery = trpc.teamRoom.getRoleMessages.useQuery({ roleId }, { enabled: Boolean(roleId) });

  const sendRoleMessageMutation = trpc.teamRoom.sendRoleMessage.useMutation({
    onSuccess: async () => {
      toast.success("Typed role message sent");
      await Promise.all([
        utils.teamRoom.getRoleMessages.invalidate({ roleId }),
        utils.roleMonitor.detail.invalidate({ roleId }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  if (detailQuery.isLoading || timelineQuery.isLoading || telemetryQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading role detail...</div>;
  }

  if (!detailQuery.data || !timelineQuery.data || !telemetryQuery.data) {
    return <div className="p-6 text-sm text-slate-500">Role detail is unavailable.</div>;
  }

  const detail = detailQuery.data;
  const recipients = (rosterQuery.data ?? []).filter((entry) => entry.roleId !== roleId);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <RoleHealthBadge label={detail.role.lifecycleState} tone={toneForState(detail.role.lifecycleState)} />
            <RoleHealthBadge label={`Gate ${detail.gate.gateResult}`} tone={toneForState(detail.gate.gateResult)} />
            <RoleHealthBadge label={`Autonomy ${detail.role.currentAutonomyTier}`} />
          </div>
          <h1 className="text-3xl font-semibold text-slate-950">{detail.role.name}</h1>
          <p className="text-sm text-slate-600">{detail.activeContract?.missionStatement ?? "No mission statement yet."}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/role-monitor/${detail.role.id}/mission`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">
            Mission planner
          </Link>
          <Link href={`/role-monitor/${detail.role.id}/routines`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">
            Routine scheduler
          </Link>
          <Link href="/role-monitor" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">
            Back to monitor
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <DashboardCard title="Contract and KPI" description="Current mission, contract version, and KPI posture">
          <div className="space-y-3 text-sm text-slate-600">
            <p>Active contract: {detail.activeContract?.id ?? "n/a"}</p>
            <p>Contract history: {detail.contracts.length}</p>
            <p>Checkpoint freshness: {detail.checkpointHealth.ageMinutes ?? 0} minutes</p>
            <p>Quality score: {(telemetryQuery.data.qualityScore * 100).toFixed(0)}%</p>
            <p>Replay pass rate: {(telemetryQuery.data.replayPassRate * 100).toFixed(0)}%</p>
          </div>
        </DashboardCard>
        <DashboardCard title="Workpack Dependencies" description="Role-selected workpacks remain the execution source of truth">
          <div className="space-y-4">
            {(detail.workpackDependencies ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No linked workpacks yet.</p>
            ) : (
              detail.workpackDependencies.map((dependency: any) => (
                <div key={dependency.workpackId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{dependency.workpackId}</p>
                      <p className="mt-1 text-xs text-slate-500">{dependency.readiness.nextAction}</p>
                    </div>
                    <RoleHealthBadge label={dependency.readiness.gateResult} tone={toneForState(dependency.readiness.gateResult)} />
                  </div>
                  <div className="mt-3">
                    <RoleWorkpackLinks workpackId={dependency.workpackId} />
                  </div>
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <DashboardCard title="Routine Cycles" description="Current and recent role_routine_run projections">
          <div className="space-y-3">
            {timelineQuery.data.length === 0 ? (
              <p className="text-sm text-slate-500">No routine cycles recorded yet.</p>
            ) : (
              timelineQuery.data.map((run) => (
                <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{run.routineId}</p>
                    <RoleHealthBadge label={run.status} tone={toneForState(run.status)} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Trigger {run.triggerSource}</span>
                    <span>Workpack {run.selectedWorkpackFamily ?? "n/a"}</span>
                    <span>Version {run.resolvedWorkpackVersionId ?? "n/a"}</span>
                    <span>Recovery {run.recoveryState}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Internal Comms Stream" description="Typed handoffs, approvals, escalations, and summaries">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[0.7fr,0.3fr]">
              <Textarea
                value={contentSummary}
                onChange={(event) => setContentSummary(event.target.value)}
                className="min-h-[110px]"
                placeholder="Summarize the typed role message"
              />
              <div className="space-y-3">
                <label className="block text-sm text-slate-600">
                  Intent
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    value={intentType}
                    onChange={(event) => setIntentType(event.target.value as typeof intentType)}
                  >
                    <option value="status_summary">Status summary</option>
                    <option value="shared_finding">Shared finding</option>
                    <option value="handoff">Handoff</option>
                    <option value="approval_request">Approval request</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-600">
                  Recipient
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    value={recipientRoleId}
                    onChange={(event) => setRecipientRoleId(event.target.value)}
                  >
                    <option value="">No specific recipient</option>
                    {recipients.map((entry) => (
                      <option key={entry.roleId} value={entry.roleId}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  className="w-full"
                  disabled={sendRoleMessageMutation.isPending || !contentSummary.trim()}
                  onClick={() => sendRoleMessageMutation.mutate({
                    senderRoleId: roleId,
                    recipientRoleId: recipientRoleId || undefined,
                    intentType,
                    contentSummary,
                    relatedRoutineId: detail.currentRoutineRun?.routineId ?? undefined,
                    relatedRoutineRunId: detail.currentRoutineRun?.id ?? undefined,
                    relatedWorkpackFamily: detail.currentRoutineRun?.selectedWorkpackFamily ?? undefined,
                  })}
                >
                  {sendRoleMessageMutation.isPending ? "Sending..." : "Send typed message"}
                </Button>
              </div>
            </div>
            <RoleCommsStream messages={roleMessagesQuery.data ?? detail.messages ?? []} />
          </div>
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <DashboardCard title="Exceptions and Handoffs" description="Who owns blocked work right now">
          <div className="space-y-3">
            {(detail.roleExceptions ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No bound exceptions right now.</p>
            ) : (
              detail.roleExceptions.map((exception: any) => (
                <div key={exception.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">{exception.workpackExceptionId}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Owner {exception.triageOwnerRoleId ?? "n/a"} • Action {exception.nextAction} • Source {exception.source}
                  </p>
                </div>
              ))
            )}
            {(detail.handoffs ?? []).slice(0, 3).map((handoff: any) => (
              <div key={handoff.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{handoff.purpose}</p>
                <p className="mt-1 text-xs text-slate-500">Status {handoff.status} • Recipient {handoff.recipientRoleId}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
        <DashboardCard title="Improvement and Promotion" description="Role maturity remains evidence-backed and reviewable">
          <div className="space-y-3">
            {(detail.improvementProposals ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No improvement proposals yet.</p>
            ) : (
              detail.improvementProposals.map((proposal: any) => (
                <div key={proposal.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{proposal.targetType.replace(/_/g, " ")}</p>
                    <RoleHealthBadge label={proposal.riskClass} tone={toneForState(proposal.riskClass === "critical" ? "blocked" : proposal.riskClass)} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{proposal.expectedBenefit}</p>
                </div>
              ))
            )}
            {(detail.promotionGates ?? []).slice(0, 2).map((gate: any) => (
              <div key={gate.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">{gate.recommendedDecision}</p>
                <p className="mt-1 text-xs text-slate-500">{gate.reasonCodes.join(", ") || "steady_state"}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
