import { useEffect, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, ClipboardList, Clock3, Loader2, RefreshCw, ShieldAlert, Layers3 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { cn } from "@/lib/utils";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "n/a";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function stateBadgeClass(state: string): string {
  switch (state) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "blocked":
    case "escalated":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "waiting_for_approval":
    case "waiting_for_input":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "in_progress":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export default function AdminWorkOsDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("caseId");
  });

  const overviewQuery = trpc.workOs.overview.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const inboxQuery = trpc.workOs.inbox.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const caseQuery = trpc.workOs.getCase.useQuery(
    selectedCaseId ? { caseId: selectedCaseId } : skipToken,
    { refetchInterval: 15_000 },
  );

  useEffect(() => {
    if (!selectedCaseId && inboxQuery.data?.[0]?.id) {
      setSelectedCaseId(inboxQuery.data[0].id);
    }
  }, [inboxQuery.data, selectedCaseId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "domain_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <DashboardCard className="w-full max-w-md" title="Access Denied" description="Work OS is available to admin and domain admin operators only." />
      </div>
    );
  }

  const selectedCase = caseQuery.data?.case ?? null;
  const assignment = caseQuery.data?.assignments?.[0] ?? null;
  const timeline = caseQuery.data?.timeline ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/monitoring")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Monitoring
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <ClipboardList className="h-6 w-6" />
                Work OS Console
              </h1>
              <p className="text-sm text-muted-foreground">Inbox, case timeline, ownership history, and live risk state</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => overviewQuery.refetch()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh overview
            </Button>
            <Button variant="outline" size="sm" onClick={() => inboxQuery.refetch()}>
              <Layers3 className="mr-1 h-4 w-4" />
              Refresh inbox
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/admin/queues")}>
              Queue dashboard
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <DashboardKpiCard icon={ClipboardList} label="Completed" value={overviewQuery.data?.completed ?? 0} />
          <DashboardKpiCard icon={Clock3} label="Overdue SLA" value={overviewQuery.data?.overdueSla ?? 0} valueClassName="text-amber-600" />
          <DashboardKpiCard icon={ShieldAlert} label="Open Exceptions" value={overviewQuery.data?.openExceptions ?? 0} valueClassName="text-rose-600" />
          <DashboardKpiCard icon={Layers3} label="States" value={Object.keys(overviewQuery.data?.byState ?? {}).length} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
          <DashboardCard title="Work Inbox" description="Tenant-scoped queue of open business work">
            <div className="space-y-3">
              {(inboxQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No work cases are available yet.</p>
              ) : (
                (inboxQuery.data ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedCaseId(item.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition hover:border-sky-300",
                      selectedCaseId === item.id ? "border-sky-400 bg-sky-50/60" : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="text-sm text-slate-600">Case {item.id}</p>
                      </div>
                      <Badge variant="outline" className={cn("capitalize", stateBadgeClass(item.currentState))}>
                        {item.currentState}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span>Owner: {item.ownerType ?? "unassigned"}{item.ownerId ? ` / ${item.ownerId}` : ""}</span>
                      <span>Priority: {item.priority}</span>
                      <span>Risk: {item.riskLevel}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </DashboardCard>

          <DashboardCard title="Selected Case" description="Assignment history, exceptions, outcomes, SLA, and timeline evidence">
            {!selectedCase ? (
              <p className="text-sm text-muted-foreground">Select a case from the inbox to inspect the full lifecycle.</p>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">Case {selectedCase.id}</p>
                      <h2 className="text-lg font-semibold text-slate-900">{selectedCase.title}</h2>
                      {selectedCase.summary ? <p className="mt-1 text-sm text-slate-600">{selectedCase.summary}</p> : null}
                    </div>
                    <Badge variant="outline" className={stateBadgeClass(selectedCase.currentState)}>
                      {selectedCase.currentState}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500">Owner</p>
                      <p className="font-medium text-slate-900">
                        {selectedCase.ownerType ?? "unassigned"}
                        {selectedCase.ownerId ? ` / ${selectedCase.ownerId}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Primary task</p>
                      <p className="font-medium text-slate-900">{selectedCase.primaryTaskId ?? "n/a"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Created</p>
                      <p className="font-medium text-slate-900">{formatDate(selectedCase.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Updated</p>
                      <p className="font-medium text-slate-900">{formatDate(selectedCase.updatedAt)}</p>
                    </div>
                  </div>
                </div>

                {assignment ? (
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Latest assignment</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {assignment.previousOwnerType ?? "none"}{assignment.previousOwnerId ? ` / ${assignment.previousOwnerId}` : ""} → {assignment.ownerType}{assignment.ownerId ? ` / ${assignment.ownerId}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {assignment.assignmentSource} • {formatDate(assignment.createdAt)}
                    </p>
                    {assignment.reason ? <p className="mt-2 text-sm text-slate-600">{assignment.reason}</p> : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Approvals</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.approvals ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No approvals recorded.</p>
                      ) : (
                        caseQuery.data!.approvals.map((approval) => (
                          <div key={approval.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{approval.approvalStatus}</span>
                              <span className="text-xs text-slate-500">{formatDate(approval.createdAt)}</span>
                            </div>
                            {approval.comment ? <p className="mt-1 text-slate-600">{approval.comment}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Exceptions</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.exceptions ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No exceptions recorded.</p>
                      ) : (
                        caseQuery.data!.exceptions.map((exception) => (
                          <div key={exception.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{exception.exceptionType}</span>
                              <Badge variant="outline">{exception.status}</Badge>
                            </div>
                            <p className="mt-1 text-slate-600">{exception.reason ?? "No reason"}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Outcomes</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.outcomes ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No outcomes recorded.</p>
                      ) : (
                        caseQuery.data!.outcomes.map((outcome) => (
                          <div key={outcome.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{outcome.disposition}</span>
                              <span className="text-xs text-slate-500">{formatDate(outcome.createdAt)}</span>
                            </div>
                            {outcome.summary ? <p className="mt-1 text-slate-600">{outcome.summary}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">SLA</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.slas ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No SLA records yet.</p>
                      ) : (
                        caseQuery.data!.slas.map((sla) => (
                          <div key={sla.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{sla.breachState}</span>
                              <span className="text-xs text-slate-500">{formatDate(sla.createdAt)}</span>
                            </div>
                            <p className="mt-1 text-slate-600">
                              Due {formatDate(sla.dueAt)} • policy {sla.policyId ?? "n/a"}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Timeline</p>
                    <p className="text-xs text-slate-500">{timeline.length} entries</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {timeline.length === 0 ? (
                      <p className="text-sm text-slate-500">No timeline entries available.</p>
                    ) : (
                      timeline.map((entry) => (
                        <div key={`${entry.source}-${entry.id}`} className="rounded-xl border border-slate-200 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">{entry.eventType}</span>
                            <span className="text-xs text-slate-500">{entry.source}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{formatDate(entry.createdAt)}</p>
                          {entry.detailJson ? (
                            <pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                              {JSON.stringify(entry.detailJson, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
