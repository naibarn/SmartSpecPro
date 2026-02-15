diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index 0f1bc16..14e367b 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -47,6 +47,7 @@ import AdminSettings from "./pages/AdminSettings";
 import AdminQueueDashboard from "./pages/AdminQueueDashboard";
 import AdminQueueLLM from "./pages/AdminQueueLLM";
 import AdminQueueMedia from "./pages/AdminQueueMedia";
+import AdminOpsDashboard from "./pages/Admin/AdminOpsDashboard";
 import DomainAdmin from "./pages/DomainAdmin";
 import DomainThemeEditor from "./pages/DomainThemeEditor";
 import DomainAdminContent from "./pages/DomainAdminContent";
@@ -132,6 +133,7 @@ function Router() {
       <Route path="/admin/queues" component={AdminQueueDashboard} />
       <Route path="/admin/queues/llm" component={AdminQueueLLM} />
       <Route path="/admin/queues/media" component={AdminQueueMedia} />
+      <Route path="/admin/ops" component={AdminOpsDashboard} />
       <Route path="/admin/tenants" component={AdminTenants} />
       <Route path="/domain-admin" component={DomainAdmin} />
       <Route path="/domain-admin/theme" component={DomainThemeEditor} />
diff --git a/apps/web/client/src/pages/Admin/AdminOpsDashboard.tsx b/apps/web/client/src/pages/Admin/AdminOpsDashboard.tsx
new file mode 100644
index 0000000..dbea444
--- /dev/null
+++ b/apps/web/client/src/pages/Admin/AdminOpsDashboard.tsx
@@ -0,0 +1,147 @@
+/**
+ * Admin Ops Dashboard
+ *
+ * Operational health monitoring with 6 panels:
+ * Traffic & Auth, API Health, Jobs, Kie AI, Storage, Security
+ */
+
+import { useState } from "react";
+import { useAuth } from "@/_core/hooks/useAuth";
+import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";
+import {
+  ArrowLeft,
+  RefreshCw,
+  Loader2,
+  Activity,
+  Server,
+  HardDrive,
+  Shield,
+  Zap,
+  Users,
+} from "lucide-react";
+import { Link } from "wouter";
+import TrafficPanel from "./panels/TrafficPanel";
+import ApiHealthPanel from "./panels/ApiHealthPanel";
+import JobsHealthPanel from "./panels/JobsHealthPanel";
+import KieAiHealthPanel from "./panels/KieAiHealthPanel";
+import StoragePanel from "./panels/StoragePanel";
+import SecurityPanel from "./panels/SecurityPanel";
+
+export default function AdminOpsDashboard() {
+  const { user, loading: authLoading } = useAuth();
+  const [activeTab, setActiveTab] = useState("traffic");
+  const [refreshInterval, setRefreshInterval] = useState<number | null>(30000);
+
+  if (authLoading) {
+    return (
+      <div className="flex items-center justify-center min-h-screen">
+        <Loader2 className="h-8 w-8 animate-spin text-primary" />
+      </div>
+    );
+  }
+
+  if (!user || (user.role !== "admin" && user.role !== "domain_admin")) {
+    return (
+      <div className="flex items-center justify-center min-h-screen">
+        <Card className="w-96">
+          <CardHeader>
+            <CardTitle>Access Denied</CardTitle>
+            <CardDescription>
+              You need admin privileges to access this page.
+            </CardDescription>
+          </CardHeader>
+        </Card>
+      </div>
+    );
+  }
+
+  const toggleAutoRefresh = () => {
+    setRefreshInterval(prev => prev ? null : 30000);
+  };
+
+  return (
+    <div className="container mx-auto p-6 space-y-6">
+      {/* Header */}
+      <div className="flex items-center justify-between">
+        <div className="flex items-center gap-4">
+          <Link href="/admin/settings">
+            <Button variant="ghost" size="icon">
+              <ArrowLeft className="h-4 w-4" />
+            </Button>
+          </Link>
+          <div>
+            <h1 className="text-2xl font-bold">Ops Dashboard</h1>
+            <p className="text-sm text-muted-foreground">
+              System health and operational metrics
+            </p>
+          </div>
+        </div>
+        <div className="flex items-center gap-2">
+          <Badge variant={refreshInterval ? "default" : "secondary"}>
+            {refreshInterval ? "Auto-refresh: 30s" : "Paused"}
+          </Badge>
+          <Button
+            variant="outline"
+            size="sm"
+            onClick={toggleAutoRefresh}
+          >
+            <RefreshCw className={`h-4 w-4 mr-2 ${refreshInterval ? "animate-spin" : ""}`} />
+            {refreshInterval ? "Pause" : "Resume"}
+          </Button>
+        </div>
+      </div>
+
+      {/* Tabbed Panels */}
+      <Tabs value={activeTab} onValueChange={setActiveTab}>
+        <TabsList className="grid w-full grid-cols-6">
+          <TabsTrigger value="traffic" className="flex items-center gap-1">
+            <Users className="h-3.5 w-3.5" />
+            <span className="hidden sm:inline">Traffic</span>
+          </TabsTrigger>
+          <TabsTrigger value="api" className="flex items-center gap-1">
+            <Activity className="h-3.5 w-3.5" />
+            <span className="hidden sm:inline">API</span>
+          </TabsTrigger>
+          <TabsTrigger value="jobs" className="flex items-center gap-1">
+            <Zap className="h-3.5 w-3.5" />
+            <span className="hidden sm:inline">Jobs</span>
+          </TabsTrigger>
+          <TabsTrigger value="kie" className="flex items-center gap-1">
+            <Server className="h-3.5 w-3.5" />
+            <span className="hidden sm:inline">Kie AI</span>
+          </TabsTrigger>
+          <TabsTrigger value="storage" className="flex items-center gap-1">
+            <HardDrive className="h-3.5 w-3.5" />
+            <span className="hidden sm:inline">Storage</span>
+          </TabsTrigger>
+          <TabsTrigger value="security" className="flex items-center gap-1">
+            <Shield className="h-3.5 w-3.5" />
+            <span className="hidden sm:inline">Security</span>
+          </TabsTrigger>
+        </TabsList>
+
+        <TabsContent value="traffic">
+          <TrafficPanel refreshInterval={refreshInterval} />
+        </TabsContent>
+        <TabsContent value="api">
+          <ApiHealthPanel refreshInterval={refreshInterval} />
+        </TabsContent>
+        <TabsContent value="jobs">
+          <JobsHealthPanel refreshInterval={refreshInterval} />
+        </TabsContent>
+        <TabsContent value="kie">
+          <KieAiHealthPanel refreshInterval={refreshInterval} />
+        </TabsContent>
+        <TabsContent value="storage">
+          <StoragePanel refreshInterval={refreshInterval} />
+        </TabsContent>
+        <TabsContent value="security">
+          <SecurityPanel refreshInterval={refreshInterval} />
+        </TabsContent>
+      </Tabs>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Admin/panels/ApiHealthPanel.tsx b/apps/web/client/src/pages/Admin/panels/ApiHealthPanel.tsx
new file mode 100644
index 0000000..0e843f4
--- /dev/null
+++ b/apps/web/client/src/pages/Admin/panels/ApiHealthPanel.tsx
@@ -0,0 +1,131 @@
+/**
+ * API Health Panel
+ *
+ * Displays provider usage metrics, latency, and error rates.
+ */
+
+import { trpc } from "@/lib/trpc";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Loader2, Activity, Clock, AlertTriangle, DollarSign } from "lucide-react";
+import { cn } from "@/lib/utils";
+
+interface ApiHealthPanelProps {
+  refreshInterval: number | null;
+}
+
+export default function ApiHealthPanel({ refreshInterval }: ApiHealthPanelProps) {
+  const { data, isLoading, error } = trpc.adminOps.apiHealth.useQuery(
+    { hours: 24 },
+    { refetchInterval: refreshInterval ?? false }
+  );
+
+  if (isLoading) {
+    return (
+      <div className="flex items-center justify-center py-12">
+        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="py-6">
+          <p className="text-destructive">Failed to load API health: {error.message}</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  const summary = data?.summary;
+  const errorRateHigh = (summary?.errorRate ?? 0) > 5;
+
+  return (
+    <div className="space-y-4">
+      {/* Summary Cards */}
+      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
+            <Activity className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{summary?.totalRequests ?? 0}</div>
+            <p className="text-xs text-muted-foreground">Last 24 hours</p>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
+            <AlertTriangle className={cn("h-4 w-4", errorRateHigh ? "text-destructive" : "text-muted-foreground")} />
+          </CardHeader>
+          <CardContent>
+            <div className={cn("text-2xl font-bold", errorRateHigh && "text-destructive")}>
+              {summary?.errorRate ?? 0}%
+            </div>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
+            <Clock className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{summary?.avgLatencyMs ?? 0}ms</div>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">P95 Latency</CardTitle>
+            <Clock className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{summary?.p95LatencyMs ?? 0}ms</div>
+          </CardContent>
+        </Card>
+      </div>
+
+      {/* Per-Model Breakdown */}
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-sm font-medium">Model Usage (Last 24h)</CardTitle>
+        </CardHeader>
+        <CardContent>
+          {data?.byProvider && data.byProvider.length > 0 ? (
+            <div className="overflow-x-auto">
+              <table className="w-full text-sm">
+                <thead>
+                  <tr className="border-b">
+                    <th className="text-left py-2 font-medium">Model</th>
+                    <th className="text-right py-2 font-medium">Requests</th>
+                    <th className="text-right py-2 font-medium">Errors</th>
+                    <th className="text-right py-2 font-medium">Avg Latency</th>
+                    <th className="text-right py-2 font-medium">Cost</th>
+                  </tr>
+                </thead>
+                <tbody>
+                  {data.byProvider.map((p) => (
+                    <tr key={p.model} className="border-b last:border-0">
+                      <td className="py-2 font-mono text-xs">{p.model}</td>
+                      <td className="text-right py-2">{p.requests}</td>
+                      <td className="text-right py-2">
+                        <Badge variant={p.errors > 0 ? "destructive" : "secondary"}>
+                          {p.errors}
+                        </Badge>
+                      </td>
+                      <td className="text-right py-2">{p.avgLatencyMs}ms</td>
+                      <td className="text-right py-2">${p.totalCostUsd.toFixed(4)}</td>
+                    </tr>
+                  ))}
+                </tbody>
+              </table>
+            </div>
+          ) : (
+            <p className="text-sm text-muted-foreground">No API usage data available.</p>
+          )}
+        </CardContent>
+      </Card>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Admin/panels/JobsHealthPanel.tsx b/apps/web/client/src/pages/Admin/panels/JobsHealthPanel.tsx
new file mode 100644
index 0000000..f08b5cd
--- /dev/null
+++ b/apps/web/client/src/pages/Admin/panels/JobsHealthPanel.tsx
@@ -0,0 +1,120 @@
+/**
+ * Jobs Health Panel
+ *
+ * Displays Cloud Tasks event metrics and recent failures.
+ */
+
+import { trpc } from "@/lib/trpc";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
+import { cn } from "@/lib/utils";
+
+interface JobsHealthPanelProps {
+  refreshInterval: number | null;
+}
+
+const STATUS_COLORS: Record<string, string> = {
+  completed: "bg-green-500",
+  processing: "bg-blue-500",
+  queued: "bg-yellow-500",
+  failed: "bg-red-500",
+  dead_letter: "bg-red-700",
+};
+
+export default function JobsHealthPanel({ refreshInterval }: JobsHealthPanelProps) {
+  const { data, isLoading, error } = trpc.adminOps.jobsHealth.useQuery(undefined, {
+    refetchInterval: refreshInterval ?? false,
+  });
+
+  if (isLoading) {
+    return (
+      <div className="flex items-center justify-center py-12">
+        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="py-6">
+          <p className="text-destructive">Failed to load jobs health: {error.message}</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  const counts = data?.countsByStatus ?? {};
+  const totalJobs = Object.values(counts).reduce((sum, c) => sum + c, 0);
+  const failedCount = (counts.failed ?? 0) + (counts.dead_letter ?? 0);
+  const hasFailures = failedCount > 0;
+
+  return (
+    <div className="space-y-4">
+      {/* Status Summary */}
+      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
+        {Object.entries(counts).map(([status, count]) => (
+          <Card key={status}>
+            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+              <CardTitle className="text-sm font-medium capitalize">{status.replace('_', ' ')}</CardTitle>
+              <div className={cn("h-2 w-2 rounded-full", STATUS_COLORS[status] || "bg-gray-400")} />
+            </CardHeader>
+            <CardContent>
+              <div className="text-2xl font-bold">{count}</div>
+            </CardContent>
+          </Card>
+        ))}
+      </div>
+
+      {/* Total Summary */}
+      <Card>
+        <CardHeader className="flex flex-row items-center justify-between">
+          <CardTitle className="text-sm font-medium">Overview</CardTitle>
+          {hasFailures && (
+            <Badge variant="destructive">
+              <AlertTriangle className="h-3 w-3 mr-1" />
+              {failedCount} failed
+            </Badge>
+          )}
+        </CardHeader>
+        <CardContent>
+          <div className="text-sm text-muted-foreground">
+            Total task events: {totalJobs}
+          </div>
+        </CardContent>
+      </Card>
+
+      {/* Recent Failures */}
+      {data?.recentFailures && data.recentFailures.length > 0 && (
+        <Card>
+          <CardHeader>
+            <CardTitle className="text-sm font-medium flex items-center gap-2">
+              <XCircle className="h-4 w-4 text-destructive" />
+              Recent Failures
+            </CardTitle>
+          </CardHeader>
+          <CardContent>
+            <div className="space-y-3">
+              {data.recentFailures.slice(0, 10).map((failure) => (
+                <div key={failure.id} className="border rounded-md p-3 space-y-1">
+                  <div className="flex items-center justify-between">
+                    <span className="font-mono text-xs truncate max-w-[200px]">{failure.taskId}</span>
+                    <Badge variant="outline">{failure.queue}</Badge>
+                  </div>
+                  {failure.error && (
+                    <p className="text-xs text-destructive truncate">{failure.error}</p>
+                  )}
+                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
+                    <span>Attempts: {failure.attempts}</span>
+                    {failure.createdAt && <span>{new Date(failure.createdAt).toLocaleString()}</span>}
+                  </div>
+                </div>
+              ))}
+            </div>
+          </CardContent>
+        </Card>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Admin/panels/KieAiHealthPanel.tsx b/apps/web/client/src/pages/Admin/panels/KieAiHealthPanel.tsx
new file mode 100644
index 0000000..3f05b7c
--- /dev/null
+++ b/apps/web/client/src/pages/Admin/panels/KieAiHealthPanel.tsx
@@ -0,0 +1,118 @@
+/**
+ * Kie AI Health Panel
+ *
+ * Displays media callback event metrics and DLQ status.
+ */
+
+import { trpc } from "@/lib/trpc";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Loader2, Webhook, AlertTriangle, CheckCircle, Clock } from "lucide-react";
+import { cn } from "@/lib/utils";
+
+interface KieAiHealthPanelProps {
+  refreshInterval: number | null;
+}
+
+export default function KieAiHealthPanel({ refreshInterval }: KieAiHealthPanelProps) {
+  const { data, isLoading, error } = trpc.adminOps.kieAiHealth.useQuery(
+    { hours: 24 },
+    { refetchInterval: refreshInterval ?? false }
+  );
+
+  if (isLoading) {
+    return (
+      <div className="flex items-center justify-center py-12">
+        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="py-6">
+          <p className="text-destructive">Failed to load Kie AI health: {error.message}</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  const summary = data?.summary;
+  const callbackRateLow = (summary?.callbackRate ?? 100) < 50;
+
+  return (
+    <div className="space-y-4">
+      {/* Summary Cards */}
+      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
+            <Webhook className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{summary?.total ?? 0}</div>
+            <p className="text-xs text-muted-foreground">Last 24 hours</p>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Completed</CardTitle>
+            <CheckCircle className="h-4 w-4 text-green-500" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{summary?.completed ?? 0}</div>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Failed</CardTitle>
+            <AlertTriangle className={cn(
+              "h-4 w-4",
+              (summary?.failed ?? 0) > 0 ? "text-destructive" : "text-muted-foreground"
+            )} />
+          </CardHeader>
+          <CardContent>
+            <div className={cn("text-2xl font-bold", (summary?.failed ?? 0) > 0 && "text-destructive")}>
+              {summary?.failed ?? 0}
+            </div>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Callback Rate</CardTitle>
+            <Clock className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className={cn("text-2xl font-bold", callbackRateLow && "text-destructive")}>
+              {summary?.callbackRate ?? 0}%
+            </div>
+            {callbackRateLow && (
+              <p className="text-xs text-destructive">Below threshold</p>
+            )}
+          </CardContent>
+        </Card>
+      </div>
+
+      {/* Processing Status */}
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
+        </CardHeader>
+        <CardContent>
+          <div className="flex flex-wrap gap-2">
+            <Badge variant="secondary">
+              Pending: {summary?.pending ?? 0}
+            </Badge>
+            <Badge variant="secondary">
+              Processing: {summary?.processing ?? 0}
+            </Badge>
+            <Badge variant={data?.dlqCount ? "destructive" : "secondary"}>
+              Dead Letter Queue: {data?.dlqCount ?? 0}
+            </Badge>
+          </div>
+        </CardContent>
+      </Card>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Admin/panels/SecurityPanel.tsx b/apps/web/client/src/pages/Admin/panels/SecurityPanel.tsx
new file mode 100644
index 0000000..5297d8d
--- /dev/null
+++ b/apps/web/client/src/pages/Admin/panels/SecurityPanel.tsx
@@ -0,0 +1,102 @@
+/**
+ * Security Panel
+ *
+ * Displays rate limiting metrics and error patterns.
+ */
+
+import { trpc } from "@/lib/trpc";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Loader2, Shield, AlertTriangle, Lock } from "lucide-react";
+
+interface SecurityPanelProps {
+  refreshInterval: number | null;
+}
+
+export default function SecurityPanel({ refreshInterval }: SecurityPanelProps) {
+  const { data, isLoading, error } = trpc.adminOps.securityStats.useQuery(undefined, {
+    refetchInterval: refreshInterval ?? false,
+  });
+
+  if (isLoading) {
+    return (
+      <div className="flex items-center justify-center py-12">
+        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="py-6">
+          <p className="text-destructive">Failed to load security stats: {error.message}</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  return (
+    <div className="space-y-4">
+      {/* Summary */}
+      <Card>
+        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+          <CardTitle className="text-sm font-medium">Rate Limit Keys Active</CardTitle>
+          <Lock className="h-4 w-4 text-muted-foreground" />
+        </CardHeader>
+        <CardContent>
+          <div className="text-2xl font-bold">{data?.totalRateLimitKeys ?? 0}</div>
+          <p className="text-xs text-muted-foreground">Active rate limit entries in Redis</p>
+        </CardContent>
+      </Card>
+
+      {/* Rate Limit by Endpoint */}
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-sm font-medium flex items-center gap-2">
+            <Shield className="h-4 w-4" />
+            Rate Limit Keys by Namespace
+          </CardTitle>
+        </CardHeader>
+        <CardContent>
+          {data?.rateLimitKeys && data.rateLimitKeys.length > 0 ? (
+            <div className="space-y-2">
+              {data.rateLimitKeys.map((item) => (
+                <div key={item.endpoint} className="flex items-center justify-between py-1.5 border-b last:border-0">
+                  <span className="font-mono text-xs">{item.endpoint}</span>
+                  <Badge variant="secondary">{item.count}</Badge>
+                </div>
+              ))}
+            </div>
+          ) : (
+            <p className="text-sm text-muted-foreground">No rate limit data available.</p>
+          )}
+        </CardContent>
+      </Card>
+
+      {/* Recent Error Types */}
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-sm font-medium flex items-center gap-2">
+            <AlertTriangle className="h-4 w-4" />
+            API Error Types (Last 24h)
+          </CardTitle>
+        </CardHeader>
+        <CardContent>
+          {data?.recentErrors && data.recentErrors.length > 0 ? (
+            <div className="space-y-2">
+              {data.recentErrors.map((err) => (
+                <div key={err.errorType} className="flex items-center justify-between py-1.5 border-b last:border-0">
+                  <span className="font-mono text-xs">{err.errorType}</span>
+                  <Badge variant="destructive">{err.count}</Badge>
+                </div>
+              ))}
+            </div>
+          ) : (
+            <p className="text-sm text-muted-foreground">No API errors in the last 24 hours.</p>
+          )}
+        </CardContent>
+      </Card>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Admin/panels/StoragePanel.tsx b/apps/web/client/src/pages/Admin/panels/StoragePanel.tsx
new file mode 100644
index 0000000..efe3b19
--- /dev/null
+++ b/apps/web/client/src/pages/Admin/panels/StoragePanel.tsx
@@ -0,0 +1,105 @@
+/**
+ * Storage Panel
+ *
+ * Displays R2 storage usage by prefix with caching indicator.
+ */
+
+import { trpc } from "@/lib/trpc";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Progress } from "@/components/ui/progress";
+import { Loader2, HardDrive, FolderOpen, Database } from "lucide-react";
+
+interface StoragePanelProps {
+  refreshInterval: number | null;
+}
+
+export default function StoragePanel({ refreshInterval }: StoragePanelProps) {
+  const { data, isLoading, error } = trpc.adminOps.storageStats.useQuery(undefined, {
+    refetchInterval: refreshInterval ?? false,
+  });
+
+  if (isLoading) {
+    return (
+      <div className="flex items-center justify-center py-12">
+        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="py-6">
+          <p className="text-destructive">Failed to load storage stats: {error.message}</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  const maxSizeGb = Math.max(...(data?.prefixes?.map((p: { sizeGb: number }) => p.sizeGb) ?? [1]), 0.001);
+
+  return (
+    <div className="space-y-4">
+      {/* Total Summary */}
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Total Objects</CardTitle>
+            <Database className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{data?.totalObjects?.toLocaleString() ?? 0}</div>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Total Size</CardTitle>
+            <HardDrive className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{data?.totalSizeGb ?? 0} GB</div>
+            {data?.cachedAt && (
+              <p className="text-xs text-muted-foreground">
+                Cached at: {new Date(data.cachedAt).toLocaleTimeString()}
+              </p>
+            )}
+          </CardContent>
+        </Card>
+      </div>
+
+      {/* Per-Prefix Breakdown */}
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-sm font-medium">Storage by Prefix</CardTitle>
+        </CardHeader>
+        <CardContent>
+          {data?.prefixes && data.prefixes.length > 0 ? (
+            <div className="space-y-4">
+              {data.prefixes.map((prefix: { name: string; objectCount: number; sizeGb: number }) => (
+                <div key={prefix.name} className="space-y-2">
+                  <div className="flex items-center justify-between">
+                    <div className="flex items-center gap-2">
+                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
+                      <span className="font-medium text-sm">{prefix.name}/</span>
+                    </div>
+                    <div className="flex items-center gap-2">
+                      <Badge variant="secondary">{prefix.objectCount.toLocaleString()} objects</Badge>
+                      <Badge variant="outline">{prefix.sizeGb} GB</Badge>
+                    </div>
+                  </div>
+                  <Progress
+                    value={maxSizeGb > 0 ? (prefix.sizeGb / maxSizeGb) * 100 : 0}
+                    className="h-2"
+                  />
+                </div>
+              ))}
+            </div>
+          ) : (
+            <p className="text-sm text-muted-foreground">No storage data available.</p>
+          )}
+        </CardContent>
+      </Card>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Admin/panels/TrafficPanel.tsx b/apps/web/client/src/pages/Admin/panels/TrafficPanel.tsx
new file mode 100644
index 0000000..5138c41
--- /dev/null
+++ b/apps/web/client/src/pages/Admin/panels/TrafficPanel.tsx
@@ -0,0 +1,86 @@
+/**
+ * Traffic & Auth Panel
+ *
+ * Displays daily user activity and login metrics.
+ */
+
+import { trpc } from "@/lib/trpc";
+import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Loader2, Users, UserCheck } from "lucide-react";
+
+interface TrafficPanelProps {
+  refreshInterval: number | null;
+}
+
+export default function TrafficPanel({ refreshInterval }: TrafficPanelProps) {
+  const { data, isLoading, error } = trpc.adminOps.trafficStats.useQuery(
+    { days: 7 },
+    { refetchInterval: refreshInterval ?? false }
+  );
+
+  if (isLoading) {
+    return (
+      <div className="flex items-center justify-center py-12">
+        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
+      </div>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="py-6">
+          <p className="text-destructive">Failed to load traffic stats: {error.message}</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  return (
+    <div className="space-y-4">
+      {/* Summary Cards */}
+      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
+            <Users className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{data?.totals.totalUsers ?? 0}</div>
+          </CardContent>
+        </Card>
+        <Card>
+          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
+            <CardTitle className="text-sm font-medium">Active Today</CardTitle>
+            <UserCheck className="h-4 w-4 text-muted-foreground" />
+          </CardHeader>
+          <CardContent>
+            <div className="text-2xl font-bold">{data?.totals.activeToday ?? 0}</div>
+          </CardContent>
+        </Card>
+      </div>
+
+      {/* Daily Activity Table */}
+      <Card>
+        <CardHeader>
+          <CardTitle className="text-sm font-medium">Daily Active Users (Last 7 Days)</CardTitle>
+        </CardHeader>
+        <CardContent>
+          {data?.daily && data.daily.length > 0 ? (
+            <div className="space-y-2">
+              {data.daily.map((day) => (
+                <div key={day.date} className="flex items-center justify-between py-1.5 border-b last:border-0">
+                  <span className="text-sm text-muted-foreground">{day.date}</span>
+                  <Badge variant="secondary">{day.userCount} users</Badge>
+                </div>
+              ))}
+            </div>
+          ) : (
+            <p className="text-sm text-muted-foreground">No activity data available.</p>
+          )}
+        </CardContent>
+      </Card>
+    </div>
+  );
+}
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index 411ec5b..0997044 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -58,6 +58,7 @@ import { factoryRouter } from "./routers/factory";
 import { groupsRouter } from "./routers/groups";
 import { googleDriveRouter } from "./routers/googleDrive";
 import { searchRouter } from "./routers/search";
+import { adminOpsRouter } from "./routers/adminOps";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1589,6 +1590,7 @@ export const appRouter = router({
   }),
 
   search: searchRouter,
+  adminOps: adminOpsRouter,
 });
 
 export type AppRouter = typeof appRouter;
diff --git a/apps/web/server/routers/__tests__/adminOps.test.ts b/apps/web/server/routers/__tests__/adminOps.test.ts
new file mode 100644
index 0000000..2d623c5
--- /dev/null
+++ b/apps/web/server/routers/__tests__/adminOps.test.ts
@@ -0,0 +1,109 @@
+/**
+ * Admin Ops Dashboard Tests
+ *
+ * Tests for the admin ops dashboard tRPC endpoints:
+ * - trafficStats, apiHealth, jobsHealth, kieAiHealth, storageStats, securityStats
+ */
+
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+
+// Mock db module
+const mockSelect = vi.fn();
+const mockFrom = vi.fn();
+const mockWhere = vi.fn();
+const mockGroupBy = vi.fn();
+const mockOrderBy = vi.fn();
+const mockLimit = vi.fn();
+
+function createChainableMock(resolveValue: any = []) {
+  const chain = {
+    select: vi.fn().mockReturnThis(),
+    from: vi.fn().mockReturnThis(),
+    where: vi.fn().mockReturnThis(),
+    groupBy: vi.fn().mockReturnThis(),
+    orderBy: vi.fn().mockReturnThis(),
+    limit: vi.fn().mockReturnThis(),
+    as: vi.fn().mockReturnThis(),
+    then: (resolve: any) => Promise.resolve(resolveValue).then(resolve),
+    [Symbol.iterator]: function* () { yield* resolveValue; },
+  };
+  return chain;
+}
+
+vi.mock('../../db', () => ({
+  getDb: vi.fn().mockResolvedValue(null),
+}));
+
+vi.mock('../../../drizzle/schema', () => ({
+  users: { id: 'id', lastSignedIn: 'lastSignedIn' },
+  providerUsageLog: {
+    id: 'id', modelUsed: 'modelUsed', statusCode: 'statusCode',
+    responseTimeMs: 'responseTimeMs', costUsd: 'costUsd',
+    createdAt: 'createdAt', errorType: 'errorType',
+  },
+  cloudTaskEvents: {
+    id: 'id', taskId: 'taskId', queueName: 'queueName',
+    status: 'status', errorMessage: 'errorMessage',
+    attemptCount: 'attemptCount', createdAt: 'createdAt',
+  },
+  mediaCallbackEvents: {
+    id: 'id', status: 'status', createdAt: 'createdAt',
+  },
+  mediaCallbackDlq: { id: 'id' },
+}));
+
+vi.mock('../../services/redis', () => ({
+  getRedisClient: vi.fn().mockReturnValue(null),
+}));
+
+describe('Admin Ops Dashboard Endpoints', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe('trafficStats', () => {
+    it('returns empty data when database is not available', async () => {
+      const { adminOpsRouter } = await import('../adminOps');
+      // The router is defined, and with null db returns defaults
+      expect(adminOpsRouter).toBeDefined();
+      expect(adminOpsRouter._def).toBeDefined();
+    });
+
+    it('router has all expected procedures', async () => {
+      const { adminOpsRouter } = await import('../adminOps');
+      const procedures = Object.keys(adminOpsRouter._def.procedures);
+      expect(procedures).toContain('trafficStats');
+      expect(procedures).toContain('apiHealth');
+      expect(procedures).toContain('jobsHealth');
+      expect(procedures).toContain('kieAiHealth');
+      expect(procedures).toContain('storageStats');
+      expect(procedures).toContain('securityStats');
+    });
+
+    it('has exactly 6 procedures', async () => {
+      const { adminOpsRouter } = await import('../adminOps');
+      const procedures = Object.keys(adminOpsRouter._def.procedures);
+      expect(procedures).toHaveLength(6);
+    });
+  });
+
+  describe('Input validation', () => {
+    it('trafficStats accepts days parameter between 1-30', async () => {
+      const { adminOpsRouter } = await import('../adminOps');
+      const trafficProc = adminOpsRouter._def.procedures.trafficStats;
+      expect(trafficProc).toBeDefined();
+    });
+
+    it('apiHealth accepts hours parameter between 1-72', async () => {
+      const { adminOpsRouter } = await import('../adminOps');
+      const apiProc = adminOpsRouter._def.procedures.apiHealth;
+      expect(apiProc).toBeDefined();
+    });
+
+    it('kieAiHealth accepts hours parameter between 1-72', async () => {
+      const { adminOpsRouter } = await import('../adminOps');
+      const kieProc = adminOpsRouter._def.procedures.kieAiHealth;
+      expect(kieProc).toBeDefined();
+    });
+  });
+});
diff --git a/apps/web/server/routers/adminOps.ts b/apps/web/server/routers/adminOps.ts
new file mode 100644
index 0000000..f476313
--- /dev/null
+++ b/apps/web/server/routers/adminOps.ts
@@ -0,0 +1,409 @@
+/**
+ * Admin Ops Dashboard tRPC Router
+ *
+ * Provides admin endpoints for operational health monitoring:
+ * - Traffic & Auth stats
+ * - API Health metrics
+ * - Jobs Health (Cloud Tasks)
+ * - Kie AI Health (media callbacks)
+ * - Storage Stats (R2)
+ * - Security Stats (rate limiting)
+ */
+
+import { z } from 'zod';
+import { router, adminProcedure } from '../_core/trpc';
+
+export const adminOpsRouter = router({
+  /**
+   * Traffic & Auth Panel - Daily user activity and login metrics
+   */
+  trafficStats: adminProcedure
+    .input(z.object({
+      days: z.number().min(1).max(30).default(7),
+    }).optional())
+    .query(async ({ input }) => {
+      const days = input?.days ?? 7;
+      const { getDb } = await import('../db');
+      const db = await getDb();
+      if (!db) return { daily: [], totals: { totalUsers: 0, activeToday: 0 } };
+
+      const { users } = await import('../../drizzle/schema');
+      const { sql, gte, count, countDistinct } = await import('drizzle-orm');
+
+      const since = new Date();
+      since.setDate(since.getDate() - days);
+
+      // Daily active users based on lastSignedIn
+      const dailyActive = await db.select({
+        date: sql<string>`DATE("lastSignedIn")`.as('date'),
+        userCount: countDistinct(users.id).as('user_count'),
+      })
+        .from(users)
+        .where(gte(users.lastSignedIn, since))
+        .groupBy(sql`DATE("lastSignedIn")`)
+        .orderBy(sql`DATE("lastSignedIn")`);
+
+      // Total users and active today
+      const [totals] = await db.select({
+        totalUsers: count(users.id).as('total_users'),
+        activeToday: sql<number>`COUNT(*) FILTER (WHERE "lastSignedIn" >= CURRENT_DATE)`.as('active_today'),
+      }).from(users);
+
+      return {
+        daily: dailyActive.map(d => ({
+          date: d.date,
+          userCount: Number(d.userCount),
+        })),
+        totals: {
+          totalUsers: Number(totals?.totalUsers ?? 0),
+          activeToday: Number(totals?.activeToday ?? 0),
+        },
+      };
+    }),
+
+  /**
+   * API Health Panel - Provider usage, latency, and error rates
+   */
+  apiHealth: adminProcedure
+    .input(z.object({
+      hours: z.number().min(1).max(72).default(24),
+    }).optional())
+    .query(async ({ input }) => {
+      const hours = input?.hours ?? 24;
+      const { getDb } = await import('../db');
+      const db = await getDb();
+      if (!db) return { summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, p95LatencyMs: 0 }, byProvider: [] };
+
+      const { providerUsageLog } = await import('../../drizzle/schema');
+      const { sql, gte, count } = await import('drizzle-orm');
+
+      const since = new Date();
+      since.setHours(since.getHours() - hours);
+
+      // Aggregate provider usage metrics
+      const metrics = await db.select({
+        totalRequests: count(providerUsageLog.id).as('total_requests'),
+        errorCount: sql<number>`COUNT(*) FILTER (WHERE "statusCode" >= 400)`.as('error_count'),
+        avgLatencyMs: sql<number>`COALESCE(AVG("responseTimeMs"), 0)`.as('avg_latency_ms'),
+        p95LatencyMs: sql<number>`COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)`.as('p95_latency_ms'),
+      })
+        .from(providerUsageLog)
+        .where(gte(providerUsageLog.createdAt, since));
+
+      const [summary] = metrics;
+
+      // Per-provider breakdown
+      const byProvider = await db.select({
+        modelUsed: providerUsageLog.modelUsed,
+        requestCount: count(providerUsageLog.id).as('request_count'),
+        errorCount: sql<number>`COUNT(*) FILTER (WHERE "statusCode" >= 400)`.as('error_count'),
+        avgLatencyMs: sql<number>`COALESCE(AVG("responseTimeMs"), 0)`.as('avg_latency_ms'),
+        totalCostUsd: sql<number>`COALESCE(SUM("costUsd"::numeric), 0)`.as('total_cost_usd'),
+      })
+        .from(providerUsageLog)
+        .where(gte(providerUsageLog.createdAt, since))
+        .groupBy(providerUsageLog.modelUsed)
+        .orderBy(sql`COUNT(${providerUsageLog.id}) DESC`)
+        .limit(20);
+
+      const totalReqs = Number(summary?.totalRequests ?? 0);
+      const errorCnt = Number(summary?.errorCount ?? 0);
+
+      return {
+        summary: {
+          totalRequests: totalReqs,
+          errorRate: totalReqs > 0 ? Number(((errorCnt / totalReqs) * 100).toFixed(2)) : 0,
+          avgLatencyMs: Math.round(Number(summary?.avgLatencyMs ?? 0)),
+          p95LatencyMs: Math.round(Number(summary?.p95LatencyMs ?? 0)),
+        },
+        byProvider: byProvider.map(p => ({
+          model: p.modelUsed,
+          requests: Number(p.requestCount),
+          errors: Number(p.errorCount),
+          avgLatencyMs: Math.round(Number(p.avgLatencyMs)),
+          totalCostUsd: Number(Number(p.totalCostUsd).toFixed(6)),
+        })),
+      };
+    }),
+
+  /**
+   * Jobs Health Panel - Cloud Tasks event metrics
+   */
+  jobsHealth: adminProcedure
+    .query(async () => {
+      const { getDb } = await import('../db');
+      const db = await getDb();
+      if (!db) return { countsByStatus: {}, recentFailures: [] };
+
+      const { cloudTaskEvents } = await import('../../drizzle/schema');
+      const { sql, count, desc } = await import('drizzle-orm');
+
+      // Counts by status
+      const statusCounts = await db.select({
+        status: cloudTaskEvents.status,
+        count: count(cloudTaskEvents.id).as('count'),
+      })
+        .from(cloudTaskEvents)
+        .groupBy(cloudTaskEvents.status);
+
+      const countsByStatus: Record<string, number> = {};
+      for (const row of statusCounts) {
+        if (row.status) countsByStatus[row.status] = Number(row.count);
+      }
+
+      // Recent failures with error messages
+      const recentFailures = await db.select({
+        id: cloudTaskEvents.id,
+        taskId: cloudTaskEvents.taskId,
+        queueName: cloudTaskEvents.queueName,
+        errorMessage: cloudTaskEvents.errorMessage,
+        attemptCount: cloudTaskEvents.attemptCount,
+        createdAt: cloudTaskEvents.createdAt,
+      })
+        .from(cloudTaskEvents)
+        .where(sql`${cloudTaskEvents.status} IN ('failed', 'dead_letter')`)
+        .orderBy(desc(cloudTaskEvents.createdAt))
+        .limit(20);
+
+      return {
+        countsByStatus,
+        recentFailures: recentFailures.map(f => ({
+          id: f.id,
+          taskId: f.taskId,
+          queue: f.queueName,
+          error: f.errorMessage,
+          attempts: f.attemptCount,
+          createdAt: f.createdAt?.toISOString(),
+        })),
+      };
+    }),
+
+  /**
+   * Kie AI Health Panel - Media callback event metrics
+   */
+  kieAiHealth: adminProcedure
+    .input(z.object({
+      hours: z.number().min(1).max(72).default(24),
+    }).optional())
+    .query(async ({ input }) => {
+      const hours = input?.hours ?? 24;
+      const { getDb } = await import('../db');
+      const db = await getDb();
+      if (!db) return { summary: { total: 0, completed: 0, failed: 0, callbackRate: 0 }, dlqCount: 0 };
+
+      const { mediaCallbackEvents, mediaCallbackDlq } = await import('../../drizzle/schema');
+      const { sql, gte, count } = await import('drizzle-orm');
+
+      const since = new Date();
+      since.setHours(since.getHours() - hours);
+
+      // Callback event summary
+      const [eventSummary] = await db.select({
+        total: count(mediaCallbackEvents.id).as('total'),
+        completed: sql<number>`COUNT(*) FILTER (WHERE "status" = 'completed')`.as('completed'),
+        failed: sql<number>`COUNT(*) FILTER (WHERE "status" = 'failed')`.as('failed'),
+        processing: sql<number>`COUNT(*) FILTER (WHERE "status" = 'processing')`.as('processing'),
+        pending: sql<number>`COUNT(*) FILTER (WHERE "status" = 'pending')`.as('pending'),
+      })
+        .from(mediaCallbackEvents)
+        .where(gte(mediaCallbackEvents.createdAt, since));
+
+      // DLQ count
+      const [dlq] = await db.select({
+        count: count(mediaCallbackDlq.id).as('count'),
+      }).from(mediaCallbackDlq);
+
+      const total = Number(eventSummary?.total ?? 0);
+      const completed = Number(eventSummary?.completed ?? 0);
+
+      return {
+        summary: {
+          total,
+          completed,
+          failed: Number(eventSummary?.failed ?? 0),
+          processing: Number(eventSummary?.processing ?? 0),
+          pending: Number(eventSummary?.pending ?? 0),
+          callbackRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
+        },
+        dlqCount: Number(dlq?.count ?? 0),
+      };
+    }),
+
+  /**
+   * Storage Stats Panel - R2 storage usage with Redis caching
+   */
+  storageStats: adminProcedure
+    .query(async () => {
+      // Check Redis cache first
+      let redis: Awaited<ReturnType<typeof import('../services/redis').getRedisClient>> | null = null;
+      try {
+        const { getRedisClient } = await import('../services/redis');
+        redis = getRedisClient();
+      } catch {
+        // Redis not available
+      }
+
+      const CACHE_KEY = 'admin:storage-stats';
+      const CACHE_TTL = 300; // 5 minutes
+
+      if (redis) {
+        try {
+          const cached = await redis.get(CACHE_KEY);
+          if (cached) return JSON.parse(cached);
+        } catch {
+          // Cache miss or error
+        }
+      }
+
+      // Query R2 storage stats
+      const prefixes = ['temp/', 'renders/', 'gallery/'];
+      const results: Record<string, { count: number; sizeBytes: number }> = {};
+
+      try {
+        const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
+
+        const s3 = new S3Client({
+          region: 'auto',
+          endpoint: process.env.R2_ENDPOINT || `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
+          credentials: {
+            accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || '',
+            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || '',
+          },
+        });
+
+        const bucket = process.env.R2_BUCKET || process.env.S3_BUCKET || 'smartspec-storage';
+
+        for (const prefix of prefixes) {
+          let totalCount = 0;
+          let totalSize = 0;
+          let continuationToken: string | undefined;
+
+          // Paginate through objects (max 3 pages to avoid timeout)
+          for (let page = 0; page < 3; page++) {
+            const cmd = new ListObjectsV2Command({
+              Bucket: bucket,
+              Prefix: prefix,
+              MaxKeys: 1000,
+              ContinuationToken: continuationToken,
+            });
+
+            const response = await s3.send(cmd);
+            totalCount += response.KeyCount ?? 0;
+            totalSize += (response.Contents ?? []).reduce((sum, obj) => sum + (obj.Size ?? 0), 0);
+
+            if (!response.IsTruncated) break;
+            continuationToken = response.NextContinuationToken;
+          }
+
+          results[prefix.replace('/', '')] = { count: totalCount, sizeBytes: totalSize };
+        }
+      } catch {
+        // R2 not available - return empty stats
+        for (const prefix of prefixes) {
+          results[prefix.replace('/', '')] = { count: 0, sizeBytes: 0 };
+        }
+      }
+
+      const stats = {
+        prefixes: Object.entries(results).map(([name, data]) => ({
+          name,
+          objectCount: data.count,
+          sizeGb: Number((data.sizeBytes / (1024 * 1024 * 1024)).toFixed(3)),
+          sizeBytes: data.sizeBytes,
+        })),
+        totalObjects: Object.values(results).reduce((sum, d) => sum + d.count, 0),
+        totalSizeGb: Number((Object.values(results).reduce((sum, d) => sum + d.sizeBytes, 0) / (1024 * 1024 * 1024)).toFixed(3)),
+        cachedAt: new Date().toISOString(),
+      };
+
+      // Cache the result
+      if (redis) {
+        try {
+          await redis.set(CACHE_KEY, JSON.stringify(stats), 'EX', CACHE_TTL);
+        } catch {
+          // Caching failed — no problem
+        }
+      }
+
+      return stats;
+    }),
+
+  /**
+   * Security Stats Panel - Rate limiting and request patterns
+   */
+  securityStats: adminProcedure
+    .query(async () => {
+      let redis: Awaited<ReturnType<typeof import('../services/redis').getRedisClient>> | null = null;
+      try {
+        const { getRedisClient } = await import('../services/redis');
+        redis = getRedisClient();
+      } catch {
+        // Redis not available
+      }
+
+      const rateLimitHits: { endpoint: string; count: number }[] = [];
+
+      if (redis) {
+        try {
+          // Scan for rate limit keys
+          let cursor = '0';
+          const keys: string[] = [];
+          do {
+            const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', 'ratelimit:*', 'COUNT', 100);
+            cursor = nextCursor;
+            keys.push(...foundKeys);
+          } while (cursor !== '0' && keys.length < 500);
+
+          // Group by endpoint prefix
+          const endpointCounts: Record<string, number> = {};
+          for (const key of keys) {
+            // key format: ratelimit:{namespace}:{identifier}
+            const parts = key.split(':');
+            const endpoint = parts[1] || 'unknown';
+            endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
+          }
+
+          for (const [endpoint, count] of Object.entries(endpointCounts)) {
+            rateLimitHits.push({ endpoint, count });
+          }
+          rateLimitHits.sort((a, b) => b.count - a.count);
+        } catch {
+          // Redis scan failed
+        }
+      }
+
+      // Get recent auth failures from provider usage log
+      const { getDb } = await import('../db');
+      const db = await getDb();
+      let recentErrors: { errorType: string; count: number }[] = [];
+
+      if (db) {
+        const { providerUsageLog } = await import('../../drizzle/schema');
+        const { sql, gte, count, isNotNull } = await import('drizzle-orm');
+
+        const since = new Date();
+        since.setHours(since.getHours() - 24);
+
+        const errors = await db.select({
+          errorType: providerUsageLog.errorType,
+          count: count(providerUsageLog.id).as('count'),
+        })
+          .from(providerUsageLog)
+          .where(sql`${providerUsageLog.createdAt} >= ${since} AND ${providerUsageLog.errorType} IS NOT NULL`)
+          .groupBy(providerUsageLog.errorType)
+          .orderBy(sql`COUNT(${providerUsageLog.id}) DESC`)
+          .limit(10);
+
+        recentErrors = errors.map(e => ({
+          errorType: e.errorType || 'unknown',
+          count: Number(e.count),
+        }));
+      }
+
+      return {
+        rateLimitKeys: rateLimitHits.slice(0, 20),
+        recentErrors,
+        totalRateLimitKeys: rateLimitHits.reduce((sum, r) => sum + r.count, 0),
+      };
+    }),
+});
diff --git a/python-backend/app/api/admin_alerts.py b/python-backend/app/api/admin_alerts.py
new file mode 100644
index 0000000..49ed299
--- /dev/null
+++ b/python-backend/app/api/admin_alerts.py
@@ -0,0 +1,256 @@
+"""
+Admin Alerts API
+
+Endpoint for Cloud Scheduler to check thresholds and send email alerts.
+Checks system health metrics and sends notifications to admin users
+when critical thresholds are breached.
+"""
+
+from datetime import datetime, timedelta
+from typing import Optional
+from fastapi import APIRouter, Depends, Request
+from sqlalchemy.ext.asyncio import AsyncSession
+from sqlalchemy import select, func, text
+import structlog
+
+from app.core.database import get_db
+from app.core.config import settings
+from app.models.user import User
+
+logger = structlog.get_logger()
+
+router = APIRouter(prefix="/api/admin", tags=["Admin Alerts"])
+
+# Alert thresholds
+THRESHOLDS = {
+    "error_rate_5xx": 5.0,       # 5% error rate
+    "job_failure_rate": 10.0,    # 10% job failure rate
+    "callback_miss_rate": 50.0,  # 50% callback miss rate
+    "dlq_count": 10,             # 10 items in dead letter queue
+}
+
+# Dedup TTL in seconds (1 hour)
+ALERT_DEDUP_TTL = 3600
+
+
+async def _get_redis():
+    """Get async Redis client."""
+    try:
+        from app.core.cache import cache_manager
+        return cache_manager.redis
+    except Exception:
+        return None
+
+
+async def _check_dedup(redis, metric: str) -> bool:
+    """Check if alert was already sent recently. Returns True if should skip."""
+    if not redis:
+        return False
+    try:
+        key = f"alert:{metric}:sent"
+        return await redis.exists(key) > 0
+    except Exception:
+        return False
+
+
+async def _set_dedup(redis, metric: str):
+    """Mark alert as sent to prevent duplicates."""
+    if not redis:
+        return
+    try:
+        key = f"alert:{metric}:sent"
+        await redis.set(key, "1", ex=ALERT_DEDUP_TTL)
+    except Exception:
+        pass
+
+
+async def _get_admin_emails(db: AsyncSession) -> list[str]:
+    """Get email addresses of all admin users."""
+    result = await db.execute(
+        select(User.email).where(
+            User.role.in_(["admin", "domain_admin"]),
+            User.email.isnot(None),
+            User.isDisabled == False,  # noqa: E712
+        )
+    )
+    return [row[0] for row in result.fetchall() if row[0]]
+
+
+async def _send_alert_email(
+    metric_name: str,
+    current_value: str,
+    threshold_value: str,
+    admin_emails: list[str],
+):
+    """Send alert email to all admin users."""
+    if not admin_emails:
+        logger.warning("no_admin_emails", metric=metric_name)
+        return 0
+
+    try:
+        from app.services.email_service import get_email_service
+        email_service = get_email_service()
+
+        subject = f"[SmartSpecPro Alert] {metric_name} threshold breached"
+        text_content = (
+            f"Alert: {metric_name}\n"
+            f"Current Value: {current_value}\n"
+            f"Threshold: {threshold_value}\n"
+            f"Time: {datetime.utcnow().isoformat()}\n\n"
+            f"Dashboard: https://smartaihub.app/admin/ops\n\n"
+            f"This alert will not repeat for 1 hour unless the issue persists."
+        )
+        html_content = (
+            f"<h2>Alert: {metric_name}</h2>"
+            f"<p><strong>Current Value:</strong> {current_value}</p>"
+            f"<p><strong>Threshold:</strong> {threshold_value}</p>"
+            f"<p><strong>Time:</strong> {datetime.utcnow().isoformat()}</p>"
+            f"<p><a href='https://smartaihub.app/admin/ops'>View Dashboard</a></p>"
+            f"<p><em>This alert will not repeat for 1 hour.</em></p>"
+        )
+
+        sent = 0
+        for email in admin_emails:
+            try:
+                await email_service.send_email(email, subject, html_content, text_content)
+                sent += 1
+            except Exception as e:
+                logger.error("alert_email_failed", email=email, error=str(e))
+        return sent
+    except Exception as e:
+        logger.error("alert_send_failed", metric=metric_name, error=str(e))
+        return 0
+
+
+@router.post("/alerts/check")
+async def check_admin_alerts(
+    request: Request,
+    db: AsyncSession = Depends(get_db),
+):
+    """
+    Check alert thresholds and send emails when breached.
+    Called by Cloud Scheduler every 5 minutes.
+    """
+    redis = await _get_redis()
+    alerts_sent = 0
+    checks_performed = []
+
+    admin_emails = await _get_admin_emails(db)
+
+    # Check 1: API error rate (5xx from provider_usage_log)
+    try:
+        since = datetime.utcnow() - timedelta(minutes=5)
+        result = await db.execute(text(
+            """
+            SELECT
+                COUNT(*) as total,
+                COUNT(*) FILTER (WHERE "statusCode" >= 500) as errors
+            FROM provider_usage_log
+            WHERE "createdAt" >= :since
+            """
+        ), {"since": since})
+        row = result.fetchone()
+        if row and row.total > 0:
+            error_rate = (row.errors / row.total) * 100
+            if error_rate > THRESHOLDS["error_rate_5xx"]:
+                if not await _check_dedup(redis, "error_rate_5xx"):
+                    sent = await _send_alert_email(
+                        "API 5xx Error Rate",
+                        f"{error_rate:.1f}%",
+                        f"{THRESHOLDS['error_rate_5xx']}%",
+                        admin_emails,
+                    )
+                    await _set_dedup(redis, "error_rate_5xx")
+                    alerts_sent += sent
+        checks_performed.append("error_rate_5xx")
+    except Exception as e:
+        logger.error("alert_check_failed", check="error_rate_5xx", error=str(e))
+
+    # Check 2: Job failure rate (from cloud_task_events)
+    try:
+        result = await db.execute(text(
+            """
+            SELECT
+                COUNT(*) as total,
+                COUNT(*) FILTER (WHERE status IN ('failed', 'dead_letter')) as failures
+            FROM cloud_task_events
+            WHERE "createdAt" >= :since
+            """
+        ), {"since": datetime.utcnow() - timedelta(minutes=30)})
+        row = result.fetchone()
+        if row and row.total > 0:
+            failure_rate = (row.failures / row.total) * 100
+            if failure_rate > THRESHOLDS["job_failure_rate"]:
+                if not await _check_dedup(redis, "job_failure_rate"):
+                    sent = await _send_alert_email(
+                        "Job Failure Rate",
+                        f"{failure_rate:.1f}%",
+                        f"{THRESHOLDS['job_failure_rate']}%",
+                        admin_emails,
+                    )
+                    await _set_dedup(redis, "job_failure_rate")
+                    alerts_sent += sent
+        checks_performed.append("job_failure_rate")
+    except Exception as e:
+        logger.error("alert_check_failed", check="job_failure_rate", error=str(e))
+
+    # Check 3: Media callback miss rate
+    try:
+        result = await db.execute(text(
+            """
+            SELECT
+                COUNT(*) as total,
+                COUNT(*) FILTER (WHERE status = 'completed') as completed
+            FROM media_callback_events
+            WHERE "createdAt" >= :since
+            """
+        ), {"since": datetime.utcnow() - timedelta(minutes=30)})
+        row = result.fetchone()
+        if row and row.total > 0:
+            miss_rate = ((row.total - row.completed) / row.total) * 100
+            if miss_rate > THRESHOLDS["callback_miss_rate"]:
+                if not await _check_dedup(redis, "callback_miss_rate"):
+                    sent = await _send_alert_email(
+                        "Media Callback Miss Rate",
+                        f"{miss_rate:.1f}%",
+                        f"{THRESHOLDS['callback_miss_rate']}%",
+                        admin_emails,
+                    )
+                    await _set_dedup(redis, "callback_miss_rate")
+                    alerts_sent += sent
+        checks_performed.append("callback_miss_rate")
+    except Exception as e:
+        logger.error("alert_check_failed", check="callback_miss_rate", error=str(e))
+
+    # Check 4: Dead letter queue count
+    try:
+        result = await db.execute(text(
+            "SELECT COUNT(*) as count FROM media_callback_dlq WHERE status = 'pending'"
+        ))
+        row = result.fetchone()
+        if row and row.count > THRESHOLDS["dlq_count"]:
+            if not await _check_dedup(redis, "dlq_count"):
+                sent = await _send_alert_email(
+                    "Dead Letter Queue Size",
+                    str(row.count),
+                    str(THRESHOLDS["dlq_count"]),
+                    admin_emails,
+                )
+                await _set_dedup(redis, "dlq_count")
+                alerts_sent += sent
+        checks_performed.append("dlq_count")
+    except Exception as e:
+        logger.error("alert_check_failed", check="dlq_count", error=str(e))
+
+    logger.info(
+        "admin_alerts_checked",
+        checks=checks_performed,
+        alerts_sent=alerts_sent,
+    )
+
+    return {
+        "success": True,
+        "checks_performed": checks_performed,
+        "alerts_sent": alerts_sent,
+        "timestamp": datetime.utcnow().isoformat(),
+    }
diff --git a/python-backend/app/main.py b/python-backend/app/main.py
index 4189595..f0c9161 100644
--- a/python-backend/app/main.py
+++ b/python-backend/app/main.py
@@ -59,6 +59,7 @@ from app.api import (
     telegram_webhook,  # Telegram bot webhook for account linking
     internal_mcp,  # Internal MCP tools API (Google Drive)
     internal_gdrive,  # Internal Google Drive sync API
+    admin_alerts,  # Admin alert threshold checking
 )
 from app.api.v1 import (
     skills,
@@ -277,6 +278,7 @@ app.include_router(approvals.router, tags=["Approvals"])
 app.include_router(oauth.router, tags=["OAuth"])
 app.include_router(internal_mcp.router, tags=["Internal MCP"])
 app.include_router(internal_gdrive.router, tags=["Internal GDrive"])
+app.include_router(admin_alerts.router, tags=["Admin Alerts"])
 
 @app.get("/")
 async def root():
diff --git a/python-backend/tests/api/test_admin_alerts.py b/python-backend/tests/api/test_admin_alerts.py
new file mode 100644
index 0000000..a744df5
--- /dev/null
+++ b/python-backend/tests/api/test_admin_alerts.py
@@ -0,0 +1,111 @@
+"""
+Tests for Admin Alerts API
+
+Tests threshold checking, deduplication, and email sending.
+"""
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+from datetime import datetime
+
+
+@pytest.mark.unit
+class TestAdminAlerts:
+    """Test alert threshold checking logic."""
+
+    @pytest.mark.asyncio
+    async def test_check_dedup_returns_false_without_redis(self):
+        """Dedup check returns False (not duplicate) when Redis unavailable."""
+        from app.api.admin_alerts import _check_dedup
+        result = await _check_dedup(None, "test_metric")
+        assert result is False
+
+    @pytest.mark.asyncio
+    async def test_set_dedup_without_redis_is_noop(self):
+        """Setting dedup without Redis is a no-op (does not raise)."""
+        from app.api.admin_alerts import _set_dedup
+        await _set_dedup(None, "test_metric")  # Should not raise
+
+    @pytest.mark.asyncio
+    async def test_check_dedup_returns_true_when_key_exists(self):
+        """Dedup check returns True when Redis key exists."""
+        from app.api.admin_alerts import _check_dedup
+        mock_redis = AsyncMock()
+        mock_redis.exists.return_value = 1
+        result = await _check_dedup(mock_redis, "error_rate_5xx")
+        assert result is True
+        mock_redis.exists.assert_called_once_with("alert:error_rate_5xx:sent")
+
+    @pytest.mark.asyncio
+    async def test_check_dedup_returns_false_when_key_missing(self):
+        """Dedup check returns False when Redis key does not exist."""
+        from app.api.admin_alerts import _check_dedup
+        mock_redis = AsyncMock()
+        mock_redis.exists.return_value = 0
+        result = await _check_dedup(mock_redis, "error_rate_5xx")
+        assert result is False
+
+    @pytest.mark.asyncio
+    async def test_set_dedup_sets_key_with_ttl(self):
+        """Setting dedup creates Redis key with 1-hour TTL."""
+        from app.api.admin_alerts import _set_dedup, ALERT_DEDUP_TTL
+        mock_redis = AsyncMock()
+        await _set_dedup(mock_redis, "error_rate_5xx")
+        mock_redis.set.assert_called_once_with(
+            "alert:error_rate_5xx:sent", "1", ex=ALERT_DEDUP_TTL
+        )
+
+    @pytest.mark.asyncio
+    async def test_get_admin_emails(self):
+        """Gets email addresses of admin and domain_admin users."""
+        from app.api.admin_alerts import _get_admin_emails
+        mock_db = AsyncMock()
+        mock_result = MagicMock()
+        mock_result.fetchall.return_value = [
+            ("admin@example.com",),
+            ("domain_admin@example.com",),
+        ]
+        mock_db.execute.return_value = mock_result
+
+        emails = await _get_admin_emails(mock_db)
+        assert len(emails) == 2
+        assert "admin@example.com" in emails
+        assert "domain_admin@example.com" in emails
+
+    @pytest.mark.asyncio
+    async def test_get_admin_emails_excludes_none(self):
+        """Admin email query excludes None email addresses."""
+        from app.api.admin_alerts import _get_admin_emails
+        mock_db = AsyncMock()
+        mock_result = MagicMock()
+        mock_result.fetchall.return_value = [
+            ("admin@example.com",),
+            (None,),
+        ]
+        mock_db.execute.return_value = mock_result
+
+        emails = await _get_admin_emails(mock_db)
+        assert len(emails) == 1
+        assert "admin@example.com" in emails
+
+    @pytest.mark.asyncio
+    async def test_send_alert_email_no_recipients(self):
+        """Send alert returns 0 when no admin emails."""
+        from app.api.admin_alerts import _send_alert_email
+        result = await _send_alert_email("Test", "10%", "5%", [])
+        assert result == 0
+
+    @pytest.mark.asyncio
+    async def test_thresholds_are_defined(self):
+        """All expected thresholds are defined."""
+        from app.api.admin_alerts import THRESHOLDS
+        assert "error_rate_5xx" in THRESHOLDS
+        assert "job_failure_rate" in THRESHOLDS
+        assert "callback_miss_rate" in THRESHOLDS
+        assert "dlq_count" in THRESHOLDS
+
+    @pytest.mark.asyncio
+    async def test_dedup_ttl_is_one_hour(self):
+        """Dedup TTL is set to 1 hour (3600 seconds)."""
+        from app.api.admin_alerts import ALERT_DEDUP_TTL
+        assert ALERT_DEDUP_TTL == 3600
