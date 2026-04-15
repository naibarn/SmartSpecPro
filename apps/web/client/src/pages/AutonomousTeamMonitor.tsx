import { useEffect, useState } from "react";
import { Link } from "wouter";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { RoleHealthBadge } from "@/components/role-monitor/RoleHealthBadge";
import { RoleCommsStream } from "@/components/role-monitor/RoleCommsStream";
import { RoleWorkpackLinks } from "@/components/role-monitor/RoleWorkpackLinks";

function toneForGate(gateResult: string): "healthy" | "warning" | "danger" | "muted" {
  if (gateResult === "ready") return "healthy";
  if (gateResult === "review_required" || gateResult === "staged") return "warning";
  if (gateResult === "blocked") return "danger";
  return "muted";
}

export default function AutonomousTeamMonitor() {
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [departmentStopReason, setDepartmentStopReason] = useState("Manual operator stop");
  const [departmentLabel, setDepartmentLabel] = useState("");
  const utils = trpc.useUtils();

  const rosterQuery = trpc.roleMonitor.roster.useQuery();
  const autonomyQuery = trpc.monitoring.getRoleAutonomySummary.useQuery();
  const detailQuery = trpc.roleMonitor.detail.useQuery(
    { roleId: selectedRoleId },
    { enabled: Boolean(selectedRoleId) },
  );
  const stopDepartmentMutation = trpc.roleMonitor.stopDepartmentSlice.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.roleMonitor.roster.invalidate(),
        utils.monitoring.getRoleAutonomySummary.invalidate(),
      ]);
    },
  });

  useEffect(() => {
    if (!selectedRoleId && rosterQuery.data?.[0]?.roleId) {
      setSelectedRoleId(rosterQuery.data[0].roleId);
      setDepartmentLabel(rosterQuery.data[0].departmentLabel);
    }
  }, [rosterQuery.data, selectedRoleId]);

  if (rosterQuery.isLoading || autonomyQuery.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading autonomous team monitor...</div>;
  }

  const roster = rosterQuery.data ?? [];
  const telemetry = autonomyQuery.data?.telemetry ?? [];
  const selectedDetail = detailQuery.data;
  const readyRoles = roster.filter((item) => item.gateResult === "ready").length;
  const blockedRoles = roster.filter((item) => item.gateResult === "blocked").length;
  const pendingReviews = roster.filter((item) => item.gateResult === "review_required").length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Autonomous Team Monitor</p>
          <h1 className="text-3xl font-semibold text-slate-950">Persistent role operations center</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Monitor virtual workers by role, inspect routine cycles, checkpoint freshness, typed comms, and deep-link back into workpack truth when a role is blocked.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Department stop</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              value={departmentLabel}
              onChange={(event) => setDepartmentLabel(event.target.value)}
              placeholder="Department label"
              className="w-44"
            />
            <Input
              value={departmentStopReason}
              onChange={(event) => setDepartmentStopReason(event.target.value)}
              placeholder="Reason"
              className="w-64"
            />
            <Button
              variant="outline"
              disabled={!departmentLabel || stopDepartmentMutation.isPending}
              onClick={() => stopDepartmentMutation.mutate({
                departmentLabel,
                reason: departmentStopReason,
              })}
            >
              {stopDepartmentMutation.isPending ? "Stopping..." : "Stop department slice"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <DashboardCard title="Roles" description="Persistent virtual workers configured in this tenant">
          <p className="text-3xl font-semibold text-slate-950">{roster.length}</p>
        </DashboardCard>
        <DashboardCard title="Ready" description="Roles whose autonomy posture is currently healthy">
          <p className="text-3xl font-semibold text-emerald-700">{readyRoles}</p>
        </DashboardCard>
        <DashboardCard title="Review Required" description="Roles waiting on operator validation or safe resume">
          <p className="text-3xl font-semibold text-amber-700">{pendingReviews}</p>
        </DashboardCard>
        <DashboardCard title="Blocked" description="Roles currently blocked by incidents, readiness, or KPI drift">
          <p className="text-3xl font-semibold text-rose-700">{blockedRoles}</p>
        </DashboardCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr,0.8fr]">
        <DashboardCard title="Role Roster" description="Role-centric status instead of run-centric noise">
          <div className="space-y-3">
            {roster.length === 0 ? (
              <p className="text-sm text-slate-500">No role agents have been configured yet.</p>
            ) : (
              roster.map((item) => (
                <button
                  key={item.roleId}
                  type="button"
                  className={`w-full rounded-2xl border p-4 text-left transition ${selectedRoleId === item.roleId ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  onClick={() => setSelectedRoleId(item.roleId)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{item.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{item.departmentLabel}</p>
                    </div>
                    <RoleHealthBadge label={item.gateResult.replace(/_/g, " ")} tone={toneForGate(item.gateResult)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span>Autonomy {item.autonomyTier}</span>
                    <span>Checkpoint {item.checkpointFreshnessTier}</span>
                    <span>Backlog {item.backlogDepth}</span>
                    <span>Exceptions {item.exceptionCount}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Current Activity" description="Mission timeline, active cycle, and next actions">
          {!selectedDetail ? (
            <p className="text-sm text-slate-500">Select a role to inspect the current cycle.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <RoleHealthBadge label={selectedDetail.role.lifecycleState} tone={toneForGate(selectedDetail.gate.gateResult)} />
                <RoleHealthBadge label={`Autonomy ${selectedDetail.role.currentAutonomyTier}`} />
                <RoleHealthBadge label={`Checkpoint ${selectedDetail.checkpointHealth.freshnessTier}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-950">{selectedDetail.role.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{selectedDetail.activeContract?.missionStatement ?? "No active contract mission yet."}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current routine cycle</p>
                  <p className="mt-2 text-sm text-slate-800">
                    {selectedDetail.currentRoutineRun
                      ? `${selectedDetail.currentRoutineRun.status} • ${selectedDetail.currentRoutineRun.currentObjectiveSummary || "Routine in progress"}`
                      : "No active routine cycle"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Backlog and KPI</p>
                  <p className="mt-2 text-sm text-slate-800">
                    Backlog {selectedDetail.metric?.backlogDepth ?? 0} • SLA {((selectedDetail.metric?.slaHitRate ?? 0) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
              {(selectedDetail.workpackDependencies ?? []).map((dependency: any) => (
                <div key={dependency.workpackId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{dependency.workpackId}</p>
                      <p className="text-xs text-slate-500">{dependency.readiness.nextAction}</p>
                    </div>
                    <RoleHealthBadge label={dependency.readiness.gateResult} tone={toneForGate(dependency.readiness.gateResult)} />
                  </div>
                  <div className="mt-3">
                    <RoleWorkpackLinks workpackId={dependency.workpackId} />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-3">
                <Link href={`/role-monitor/${selectedDetail.role.id}`} className="text-sm font-medium text-sky-600 hover:text-sky-700">
                  Open role detail
                </Link>
                <Link href={`/role-monitor/${selectedDetail.role.id}/mission`} className="text-sm font-medium text-sky-600 hover:text-sky-700">
                  Mission planner
                </Link>
                <Link href={`/role-monitor/${selectedDetail.role.id}/routines`} className="text-sm font-medium text-sky-600 hover:text-sky-700">
                  Routine scheduler
                </Link>
              </div>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Health Rail" description="Autonomy, blockers, and improvement posture">
          {!selectedDetail ? (
            <p className="text-sm text-slate-500">Select a role to view health details.</p>
          ) : (
            <div className="space-y-4 text-sm text-slate-600">
              <p>Gate result: {selectedDetail.gate.gateResult}</p>
              <p>Checkpoint freshness: {selectedDetail.checkpointHealth.ageMinutes ?? 0} minutes</p>
              <p>Improvement proposals: {(selectedDetail.improvementProposals ?? []).length}</p>
              <p>Promotion gates: {(selectedDetail.promotionGates ?? []).length}</p>
              <div className="space-y-2">
                {(selectedDetail.gate.blockers ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">No active blockers.</p>
                ) : (
                  selectedDetail.gate.blockers.map((blocker: string) => (
                    <div key={blocker} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {blocker}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DashboardCard>
      </div>

      {selectedDetail ? (
        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <DashboardCard title="Exceptions and Improvement Queue" description="What still needs a human, and what the system learned">
            <div className="space-y-3">
              {(selectedDetail.roleExceptions ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No role-aware exceptions are active.</p>
              ) : (
                selectedDetail.roleExceptions.map((exception: any) => (
                  <div key={exception.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">{exception.workpackExceptionId}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Next action {exception.nextAction} • Owner {exception.triageOwnerRoleId ?? "unassigned"}
                    </p>
                  </div>
                ))
              )}
              {(selectedDetail.improvementProposals ?? []).slice(0, 3).map((proposal: any) => (
                <div key={proposal.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{proposal.targetType.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-xs text-slate-500">{proposal.expectedBenefit}</p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Internal Comms" description="Typed role-to-role messages, handoffs, and approvals">
            <RoleCommsStream messages={selectedDetail.messages ?? []} />
          </DashboardCard>
        </div>
      ) : null}

      <DashboardCard title="Telemetry Slice" description="Role-level KPI and autonomy posture for this tenant">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {telemetry.map((snapshot) => (
            <div key={snapshot.roleId} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{snapshot.roleId}</p>
                <RoleHealthBadge label={snapshot.riskTier} tone={snapshot.riskTier === "high" ? "danger" : snapshot.riskTier === "medium" ? "warning" : "healthy"} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Throughput {snapshot.throughput} • Replay {(snapshot.replayPassRate * 100).toFixed(0)}% • Connectors {snapshot.connectorFamilies.join(", ") || "n/a"}
              </p>
            </div>
          ))}
        </div>
      </DashboardCard>
    </div>
  );
}
