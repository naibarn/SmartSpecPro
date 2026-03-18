import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { GuardianChat } from "@/components/guardian/GuardianChat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@smartspec/ui/src/components/ui/tabs";
import { Badge } from "@smartspec/ui/src/components/ui/badge";
import { Button } from "@smartspec/ui/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@smartspec/ui/src/components/ui/card";

export default function AdminSystemGuardian() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const statsQuery = trpc.virtualAdmin.getDashboardStats.useQuery();
  const incidentsQuery = trpc.virtualAdmin.listIncidents.useQuery({ status: "open", limit: 20 });
  const approvalsQuery = trpc.virtualAdmin.listPendingApprovals.useQuery();
  const sensorsQuery = trpc.virtualAdmin.getSensorStatus.useQuery();

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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.openIncidents ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-600">Critical</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.criticalCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-yellow-600">Warning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.warningCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Last 24h</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.last24hCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingApprovals ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Incidents</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="sensors">Sensors</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-3 mt-4">
          {incidentsQuery.data?.map((incident) => (
            <Card key={incident.id}>
              <CardContent className="flex items-center justify-between py-3">
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
              </CardContent>
            </Card>
          ))}
          {incidentsQuery.data?.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No open incidents</p>
          )}
        </TabsContent>

        <TabsContent value="approvals" className="space-y-3 mt-4">
          {approvalsQuery.data?.map((approval: any) => (
            <Card key={approval.id}>
              <CardContent className="flex items-center justify-between py-3">
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
              </CardContent>
            </Card>
          ))}
          {approvalsQuery.data?.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No pending approvals</p>
          )}
        </TabsContent>

        <TabsContent value="sensors" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sensorsQuery.data?.map((s: any) => (
              <Card key={s.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{s.name}</span>
                    <Badge className={severityColor[s.reading?.status === "healthy" ? "info" : s.reading?.status === "degraded" ? "warning" : "critical"] ?? ""}>
                      {s.reading?.status ?? "unknown"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.reading?.message}</p>
                </CardContent>
              </Card>
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
