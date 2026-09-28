import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { GuardianChat } from "@/components/guardian/GuardianChat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@smartspec/ui/src/components/ui/tabs";
import { Badge } from "@smartspec/ui/src/components/ui/badge";
import { Button } from "@smartspec/ui/src/components/ui/button";
import { DashboardCard } from "@/components/dashboard";

export default function AdminSystemGuardian() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const search = useSearch();
  const incidentId = useMemo(() => {
    const raw = new URLSearchParams(search).get("incident");
    if (!raw || !/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }, [search]);
  const statsQuery = trpc.virtualAdmin.getDashboardStats.useQuery();
  const incidentsQuery = trpc.virtualAdmin.listIncidents.useQuery({ status: "open", limit: 20 });
  const approvalsQuery = trpc.virtualAdmin.listPendingApprovals.useQuery();
  const sensorsQuery = trpc.virtualAdmin.getSensorStatus.useQuery();
  const linkedIncidentQuery = trpc.virtualAdmin.getIncident.useQuery(
    { id: incidentId! },
    { enabled: incidentId !== null },
  );

  useEffect(() => {
    if (incidentId !== null) setActiveTab("dashboard");
  }, [incidentId]);

  const acknowledgeMutation = trpc.virtualAdmin.acknowledgeIncident.useMutation({
    onSuccess: () => incidentsQuery.refetch(),
  });
  const resolveMutation = trpc.virtualAdmin.resolveIncident.useMutation({
    onSuccess: () => {
      incidentsQuery.refetch();
      statsQuery.refetch();
    },
  });
  const decideMutation = trpc.virtualAdmin.decideApproval.useMutation({
    onSuccess: () => approvalsQuery.refetch(),
  });

  const stats = statsQuery.data;

  const severityColor: Record<string, string> = {
    info: "bg-blue-100 text-blue-800",
    warning: "bg-yellow-100 text-yellow-800",
    error: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">System Guardian</h1>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <DashboardCard>
          <div className="pb-2">
            <h3 className="text-sm text-muted-foreground">Open</h3>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats?.openIncidents ?? 0}</div>
          </div>
        </DashboardCard>
        <DashboardCard>
          <div className="pb-2">
            <h3 className="text-sm text-red-600">Critical</h3>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{stats?.criticalCount ?? 0}</div>
          </div>
        </DashboardCard>
        <DashboardCard>
          <div className="pb-2">
            <h3 className="text-sm text-yellow-600">Warning</h3>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">{stats?.warningCount ?? 0}</div>
          </div>
        </DashboardCard>
        <DashboardCard>
          <div className="pb-2">
            <h3 className="text-sm text-muted-foreground">Last 24h</h3>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats?.last24hCount ?? 0}</div>
          </div>
        </DashboardCard>
        <DashboardCard>
          <div className="pb-2">
            <h3 className="text-sm text-muted-foreground">Pending Approvals</h3>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats?.pendingApprovals ?? 0}</div>
          </div>
        </DashboardCard>
      </div>

      {incidentId !== null && linkedIncidentQuery.isError && (
        <DashboardCard className="mb-6 border-amber-200 bg-amber-50">
          <div className="py-3 text-sm text-amber-900">
            Incident #{incidentId} could not be loaded for the current admin scope.
          </div>
        </DashboardCard>
      )}

      {linkedIncidentQuery.data && (
        <DashboardCard className="mb-6 border-blue-200 bg-blue-50">
          <div className="py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Linked Incident #{linkedIncidentQuery.data.id}
            </div>
            <div className="mt-1 font-medium text-blue-950">
              {linkedIncidentQuery.data.title}
            </div>
            <div className="mt-1 text-sm text-blue-900">
              {linkedIncidentQuery.data.message ?? "No incident message"}
            </div>
            <div className="mt-2 text-xs text-blue-800">
              Status: {linkedIncidentQuery.data.status} · Severity: {linkedIncidentQuery.data.severity}
            </div>
          </div>
        </DashboardCard>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Incidents</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="sensors">Sensors</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-3 mt-4">
          {incidentsQuery.data?.map((incident) => (
            <DashboardCard key={incident.id}>
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Badge className={severityColor[incident.severity] ?? ""}>
                    {incident.severity}
                  </Badge>
                  <div>
                    <div className="font-medium text-sm">{incident.title}</div>
                    <div className="text-xs text-muted-foreground">{incident.message}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {incident.status === "open" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledgeMutation.mutate({ id: incident.id })}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => resolveMutation.mutate({ id: incident.id })}
                      >
                        Resolve
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </DashboardCard>
          ))}
          {incidentsQuery.data?.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No open incidents</p>
          )}
        </TabsContent>

        <TabsContent value="approvals" className="space-y-3 mt-4">
          {approvalsQuery.data?.map((approval: any) => (
            <DashboardCard key={approval.id}>
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium text-sm">
                    {approval.actionType} — Incident #{approval.incidentId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {approval.incident?.title ?? "Loading..."}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      decideMutation.mutate({ approvalId: approval.id, decision: "approved" })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      decideMutation.mutate({ approvalId: approval.id, decision: "rejected" })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </DashboardCard>
          ))}
          {approvalsQuery.data?.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No pending approvals</p>
          )}
        </TabsContent>

        <TabsContent value="sensors" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sensorsQuery.data?.map((s: any) => (
              <DashboardCard key={s.id}>
                <div className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{s.name}</span>
                    <Badge className={severityColor[s.reading?.status === "healthy" ? "info" : s.reading?.status === "degraded" ? "warning" : "critical"] ?? ""}>
                      {s.reading?.status ?? "unknown"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.reading?.message}</p>
                </div>
              </DashboardCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <GuardianChat />
        </TabsContent>
      </Tabs>
    </div>
  );
}
