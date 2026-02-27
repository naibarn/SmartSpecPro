/**
 * AgencyAdminPanel
 *
 * Admin panel for managing agency feature across tenants.
 * Tabs: Overview | Quotas | Tool Whitelists | Metrics | Kill Switch
 *
 * Mounted in the AdminSettings page alongside other admin panels.
 */

import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Save,
  Loader2,
  AlertTriangle,
  Activity,
  Shield,
  Settings,
  Zap,
} from "lucide-react";

export default function AgencyAdminPanel() {
  const [activeTab, setActiveTab] = useState("overview");
  const [tenantId, setTenantId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [showKillConfirm, setShowKillConfirm] = useState(false);

  // --- Quotas ---
  const [quotaForm, setQuotaForm] = useState({
    maxAgencies: 10,
    maxConcurrentRuns: 5,
    maxCreditPerRun: 100,
  });

  const quotasQuery = trpc.agency.adminGetQuotas.useQuery(
    { tenantId },
    { enabled: !!tenantId },
  );

  const setQuotasMutation = trpc.agency.adminSetQuotas.useMutation({
    onSuccess: () => {
      toast.success("Quotas updated");
      quotasQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // --- Agencies list ---
  const agenciesQuery = trpc.agency.adminListAgencies.useQuery(
    { tenantId: tenantId || undefined, limit: 50 },
    { enabled: true },
  );

  // --- Metrics ---
  const [windowHours, setWindowHours] = useState(24);
  const metricsQuery = trpc.agency.adminGetMetrics.useQuery(
    {
      agencyId: agencyId || undefined,
      tenantId: tenantId || undefined,
      windowHours,
    },
    { enabled: true },
  );

  const alertsQuery = trpc.agency.adminGetAlerts.useQuery(
    { tenantId: tenantId || undefined },
    { enabled: true },
  );

  // --- Kill Switch ---
  const killAllMutation = trpc.agency.adminKillAllRuns.useMutation({
    onSuccess: (data) => {
      toast.success(`Cancelled ${data.cancelledCount} runs`);
      setShowKillConfirm(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // --- Tool Whitelist ---
  const whitelistQuery = trpc.agency.adminGetToolWhitelist.useQuery(
    { agencyId },
    { enabled: !!agencyId },
  );

  return (
    <Card className="border-0 shadow-sm shadow-gray-200/50 rounded-2xl overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-purple-50/50 to-pink-50/30 pb-5">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="w-5 h-5 text-purple-500" />
          Agency Management
        </CardTitle>
        <CardDescription>
          Manage agency quotas, tool access, metrics, and emergency controls.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="quotas">Quotas</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="killswitch">Kill Switch</TabsTrigger>
          </TabsList>

          {/* Tenant/Agency Selector */}
          <div className="mt-4 flex gap-4">
            <div>
              <Label className="text-xs text-gray-500">Tenant ID</Label>
              <Input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="Enter tenant ID"
                className="w-64"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Agency ID</Label>
              <Input
                value={agencyId}
                onChange={(e) => setAgencyId(e.target.value)}
                placeholder="Enter agency ID"
                className="w-64"
              />
            </div>
          </div>

          {/* Tab: Overview */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">
                    {agenciesQuery.data?.agencies.length ?? 0}
                  </div>
                  <div className="text-sm text-gray-500">Total Agencies</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">
                    {agenciesQuery.data?.agencies.filter(
                      (a: any) => a.status === "published",
                    ).length ?? 0}
                  </div>
                  <div className="text-sm text-gray-500">Published</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">
                    {metricsQuery.data?.totalRuns ?? 0}
                  </div>
                  <div className="text-sm text-gray-500">
                    Total Runs ({windowHours}h)
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Alerts */}
            {(alertsQuery.data?.alerts.length ?? 0) > 0 && (
              <Card className="border-orange-200 bg-orange-50/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <span className="font-medium text-orange-700">
                      Active Alerts
                    </span>
                  </div>
                  {alertsQuery.data?.alerts.map((alert: any, i: number) => (
                    <div key={i} className="text-sm text-orange-600 ml-6">
                      Agency {alert.agencyId.slice(0, 8)}...: {alert.metric} ={" "}
                      {typeof alert.value === "number"
                        ? (alert.value * 100).toFixed(1) + "%"
                        : alert.value}{" "}
                      (threshold: {(alert.threshold * 100).toFixed(0)}%)
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Quotas */}
          <TabsContent value="quotas" className="mt-4 space-y-4">
            {!tenantId ? (
              <div className="text-sm text-gray-500">
                Enter a Tenant ID above to manage quotas.
              </div>
            ) : (
              <Card>
                <CardContent className="pt-4 space-y-4">
                  <div>
                    <Label>Max Agencies per Tenant</Label>
                    <Input
                      type="number"
                      value={quotasQuery.data?.maxAgencies ?? quotaForm.maxAgencies}
                      onChange={(e) =>
                        setQuotaForm((f) => ({
                          ...f,
                          maxAgencies: parseInt(e.target.value) || 0,
                        }))
                      }
                      min={0}
                      max={100}
                    />
                  </div>
                  <div>
                    <Label>Max Concurrent Runs</Label>
                    <Input
                      type="number"
                      value={
                        quotasQuery.data?.maxConcurrentRuns ??
                        quotaForm.maxConcurrentRuns
                      }
                      onChange={(e) =>
                        setQuotaForm((f) => ({
                          ...f,
                          maxConcurrentRuns: parseInt(e.target.value) || 0,
                        }))
                      }
                      min={0}
                      max={50}
                    />
                  </div>
                  <div>
                    <Label>Max Credits per Run</Label>
                    <Input
                      type="number"
                      value={
                        quotasQuery.data?.maxCreditPerRun ??
                        quotaForm.maxCreditPerRun
                      }
                      onChange={(e) =>
                        setQuotaForm((f) => ({
                          ...f,
                          maxCreditPerRun: parseInt(e.target.value) || 0,
                        }))
                      }
                      min={0}
                    />
                  </div>
                  <Button
                    onClick={() =>
                      setQuotasMutation.mutate({
                        tenantId,
                        ...quotaForm,
                      })
                    }
                    disabled={setQuotasMutation.isPending}
                  >
                    {setQuotasMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Quotas
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Tool Whitelists */}
          <TabsContent value="tools" className="mt-4 space-y-4">
            {!agencyId ? (
              <div className="text-sm text-gray-500">
                Enter an Agency ID above to manage tool whitelists.
              </div>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="font-medium">
                      Whitelisted Tools
                    </span>
                  </div>
                  {whitelistQuery.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <div className="space-y-2">
                      {(whitelistQuery.data?.tools ?? []).length === 0 ? (
                        <div className="text-sm text-gray-500">
                          No tools whitelisted for this agency.
                        </div>
                      ) : (
                        (whitelistQuery.data?.tools as string[])?.map(
                          (toolId) => (
                            <Badge key={toolId} variant="secondary">
                              {toolId.slice(0, 8)}...
                            </Badge>
                          ),
                        )
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Metrics */}
          <TabsContent value="metrics" className="mt-4 space-y-4">
            <div className="flex gap-2 mb-4">
              {[1, 6, 24, 168].map((h) => (
                <Button
                  key={h}
                  variant={windowHours === h ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWindowHours(h)}
                >
                  {h}h
                </Button>
              ))}
            </div>

            {metricsQuery.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-gray-500">
                        Success Rate
                      </span>
                    </div>
                    <div className="text-2xl font-bold mt-1">
                      {(
                        (metricsQuery.data?.successRate ?? 0) * 100
                      ).toFixed(1)}
                      %
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-500">
                        p95 Latency
                      </span>
                    </div>
                    <div className="text-2xl font-bold mt-1">
                      {Math.round(metricsQuery.data?.p95Latency ?? 0)}ms
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm text-gray-500">Total Runs</div>
                    <div className="text-2xl font-bold">
                      {metricsQuery.data?.totalRuns ?? 0}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm text-gray-500">Failed Runs</div>
                    <div className="text-2xl font-bold text-red-600">
                      {metricsQuery.data?.failedRuns ?? 0}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Tab: Kill Switch */}
          <TabsContent value="killswitch" className="mt-4 space-y-4">
            {!tenantId ? (
              <div className="text-sm text-gray-500">
                Enter a Tenant ID above to use the kill switch.
              </div>
            ) : (
              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-red-700">
                      Emergency Kill Switch
                    </span>
                  </div>
                  <p className="text-sm text-red-600 mb-4">
                    This will cancel ALL running agency runs for tenant{" "}
                    <strong>{tenantId}</strong>. This action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() => setShowKillConfirm(true)}
                    disabled={killAllMutation.isPending}
                  >
                    {killAllMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mr-2" />
                    )}
                    Cancel All Runs
                  </Button>
                </CardContent>
              </Card>
            )}

            <AlertDialog
              open={showKillConfirm}
              onOpenChange={setShowKillConfirm}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Cancel All Agency Runs?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will immediately cancel all running and queued agency
                    runs for tenant <strong>{tenantId}</strong>. Users will
                    see their runs marked as cancelled.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => killAllMutation.mutate({ tenantId })}
                  >
                    Confirm Kill All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
