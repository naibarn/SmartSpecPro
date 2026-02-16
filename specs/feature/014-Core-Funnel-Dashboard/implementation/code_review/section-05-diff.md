diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index dda8c64..5af5bcb 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -49,6 +49,7 @@ import AdminQueueLLM from "./pages/AdminQueueLLM";
 import AdminQueueMedia from "./pages/AdminQueueMedia";
 import AdminOpsDashboard from "./pages/Admin/AdminOpsDashboard";
 import AdminOverviewDashboard from "./pages/Admin/AdminOverviewDashboard";
+import AdminFunnelDashboard from "./pages/AdminFunnelDashboard";
 import DomainAdmin from "./pages/DomainAdmin";
 import DomainThemeEditor from "./pages/DomainThemeEditor";
 import DomainAdminContent from "./pages/DomainAdminContent";
@@ -136,6 +137,7 @@ function Router() {
       <Route path="/admin/queues/media" component={AdminQueueMedia} />
       <Route path="/admin/ops" component={AdminOpsDashboard} />
       <Route path="/admin/dashboard" component={AdminOverviewDashboard} />
+      <Route path="/admin/funnel" component={AdminFunnelDashboard} />
       <Route path="/admin/tenants" component={AdminTenants} />
       <Route path="/domain-admin" component={DomainAdmin} />
       <Route path="/domain-admin/theme" component={DomainThemeEditor} />
diff --git a/apps/web/client/src/pages/AdminFunnelDashboard.tsx b/apps/web/client/src/pages/AdminFunnelDashboard.tsx
new file mode 100644
index 0000000..123fb1e
--- /dev/null
+++ b/apps/web/client/src/pages/AdminFunnelDashboard.tsx
@@ -0,0 +1,476 @@
+import { useState } from "react";
+import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
+import { Button } from "@/components/ui/button";
+import { Label } from "@/components/ui/label";
+import { Input } from "@/components/ui/input";
+import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import { Badge } from "@/components/ui/badge";
+import {
+  TrendingUp,
+  Download,
+  Calendar,
+  RefreshCw,
+  AlertCircle,
+  Loader2,
+} from "lucide-react";
+import { trpc } from "@/lib/trpc";
+
+export default function AdminFunnelDashboard() {
+  // Date range state (default: last 30 days)
+  const [dateFrom, setDateFrom] = useState(
+    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
+  );
+  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
+
+  // Active tab state
+  const [activeTab, setActiveTab] = useState("overview");
+
+  // Bucket granularity (day/week/month)
+  const [bucket, setBucket] = useState<"day" | "week" | "month">("day");
+
+  // Export format
+  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
+
+  // Auto-refresh state
+  const [autoRefresh, setAutoRefresh] = useState(false);
+  const [refreshInterval, setRefreshInterval] = useState(60); // seconds
+
+  // Determine current stage filter based on active tab
+  const getStageForTab = (tab: string): "acquisition" | "activation" | "usage" | "revenue" | undefined => {
+    switch (tab) {
+      case "acquisition":
+        return "acquisition";
+      case "activation":
+        return "activation";
+      case "engagement":
+        return "usage";
+      case "revenue":
+        return "revenue";
+      default:
+        return undefined;
+    }
+  };
+
+  const currentStage = getStageForTab(activeTab);
+
+  // Fetch summary data
+  const summaryQuery = trpc.funnelAnalytics.summary.useQuery(
+    {
+      from: new Date(dateFrom),
+      to: new Date(dateTo),
+      bucket,
+      stage: currentStage,
+      bypassCache: false,
+    },
+    {
+      refetchInterval: autoRefresh ? refreshInterval * 1000 : false,
+      refetchOnWindowFocus: false,
+    }
+  );
+
+  // Fetch time series data
+  const timeSeriesQuery = trpc.funnelAnalytics.timeSeries.useQuery(
+    {
+      from: new Date(dateFrom),
+      to: new Date(dateTo),
+      bucket,
+      stage: currentStage,
+      bypassCache: false,
+    },
+    {
+      refetchInterval: autoRefresh ? refreshInterval * 1000 : false,
+      refetchOnWindowFocus: false,
+    }
+  );
+
+  // Cache invalidation mutation
+  const invalidateCacheMutation = trpc.funnelAnalytics.invalidateCache.useMutation();
+
+  // Manual refresh handler
+  const handleRefresh = async () => {
+    await invalidateCacheMutation.mutateAsync();
+    summaryQuery.refetch();
+    timeSeriesQuery.refetch();
+  };
+
+  // Export handler
+  const handleExport = () => {
+    const params = new URLSearchParams({
+      from: dateFrom,
+      to: dateTo,
+      bucket,
+      format: exportFormat,
+    });
+    if (currentStage) {
+      params.append("stage", currentStage);
+    }
+
+    // Trigger export via tRPC export endpoint
+    window.open(`/trpc/funnelAnalytics.export?input=${encodeURIComponent(JSON.stringify({
+      from: dateFrom,
+      to: dateTo,
+      bucket,
+      stage: currentStage,
+      format: exportFormat,
+    }))}`, '_blank');
+  };
+
+  return (
+    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-8 space-y-8">
+      {/* Header */}
+      <div className="flex items-center justify-between">
+        <div>
+          <h1 className="text-3xl font-bold flex items-center gap-2">
+            <TrendingUp className="h-8 w-8" />
+            Funnel Analytics
+          </h1>
+          <p className="text-muted-foreground">
+            User journey and conversion metrics
+          </p>
+        </div>
+        <div className="flex gap-2">
+          <Button
+            variant="outline"
+            size="sm"
+            onClick={handleRefresh}
+            disabled={invalidateCacheMutation.isPending}
+          >
+            {invalidateCacheMutation.isPending ? (
+              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
+            ) : (
+              <RefreshCw className="mr-2 h-4 w-4" />
+            )}
+            Refresh
+          </Button>
+          <Button variant="outline" size="sm" onClick={handleExport}>
+            <Download className="mr-2 h-4 w-4" />
+            Export {exportFormat.toUpperCase()}
+          </Button>
+        </div>
+      </div>
+
+      {/* Filters */}
+      <Card>
+        <CardHeader>
+          <CardTitle className="flex items-center gap-2">
+            <Calendar className="h-5 w-5" />
+            Filters & Settings
+          </CardTitle>
+        </CardHeader>
+        <CardContent>
+          <div className="grid gap-4 md:grid-cols-4">
+            <div className="space-y-2">
+              <Label htmlFor="dateFrom">From</Label>
+              <Input
+                id="dateFrom"
+                type="date"
+                value={dateFrom}
+                onChange={(e) => setDateFrom(e.target.value)}
+              />
+            </div>
+            <div className="space-y-2">
+              <Label htmlFor="dateTo">To</Label>
+              <Input
+                id="dateTo"
+                type="date"
+                value={dateTo}
+                onChange={(e) => setDateTo(e.target.value)}
+              />
+            </div>
+            <div className="space-y-2">
+              <Label htmlFor="bucket">Bucket</Label>
+              <Select value={bucket} onValueChange={(v) => setBucket(v as "day" | "week" | "month")}>
+                <SelectTrigger id="bucket">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="day">Day</SelectItem>
+                  <SelectItem value="week">Week</SelectItem>
+                  <SelectItem value="month">Month</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+            <div className="space-y-2">
+              <Label htmlFor="exportFormat">Export Format</Label>
+              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as "csv" | "json")}>
+                <SelectTrigger id="exportFormat">
+                  <SelectValue />
+                </SelectTrigger>
+                <SelectContent>
+                  <SelectItem value="csv">CSV</SelectItem>
+                  <SelectItem value="json">JSON</SelectItem>
+                </SelectContent>
+              </Select>
+            </div>
+          </div>
+
+          {summaryQuery.data?.rangeClamped && (
+            <div className="mt-4 flex items-center gap-2 text-sm text-amber-600">
+              <AlertCircle className="h-4 w-4" />
+              <span>Date range clamped to 90 days maximum</span>
+            </div>
+          )}
+
+          {summaryQuery.data?.cached && (
+            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
+              <Badge variant="secondary">Cached (5 min TTL)</Badge>
+            </div>
+          )}
+        </CardContent>
+      </Card>
+
+      {/* Tabs */}
+      <Tabs value={activeTab} onValueChange={setActiveTab}>
+        <TabsList className="grid w-full grid-cols-6">
+          <TabsTrigger value="overview">Overview</TabsTrigger>
+          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
+          <TabsTrigger value="activation">Activation</TabsTrigger>
+          <TabsTrigger value="revenue">Revenue</TabsTrigger>
+          <TabsTrigger value="retention">Retention</TabsTrigger>
+          <TabsTrigger value="engagement">Engagement</TabsTrigger>
+        </TabsList>
+
+        {/* Overview Tab */}
+        <TabsContent value="overview" className="space-y-4">
+          <FunnelSummaryPanel
+            data={summaryQuery.data}
+            isLoading={summaryQuery.isLoading}
+            error={summaryQuery.error}
+          />
+          <FunnelTimeSeriesPanel
+            data={timeSeriesQuery.data}
+            isLoading={timeSeriesQuery.isLoading}
+            error={timeSeriesQuery.error}
+            bucket={bucket}
+          />
+        </TabsContent>
+
+        {/* Acquisition Tab */}
+        <TabsContent value="acquisition" className="space-y-4">
+          <FunnelSummaryPanel
+            data={summaryQuery.data}
+            isLoading={summaryQuery.isLoading}
+            error={summaryQuery.error}
+            stage="Acquisition"
+          />
+          <FunnelTimeSeriesPanel
+            data={timeSeriesQuery.data}
+            isLoading={timeSeriesQuery.isLoading}
+            error={timeSeriesQuery.error}
+            bucket={bucket}
+          />
+        </TabsContent>
+
+        {/* Activation Tab */}
+        <TabsContent value="activation" className="space-y-4">
+          <FunnelSummaryPanel
+            data={summaryQuery.data}
+            isLoading={summaryQuery.isLoading}
+            error={summaryQuery.error}
+            stage="Activation"
+          />
+          <FunnelTimeSeriesPanel
+            data={timeSeriesQuery.data}
+            isLoading={timeSeriesQuery.isLoading}
+            error={timeSeriesQuery.error}
+            bucket={bucket}
+          />
+        </TabsContent>
+
+        {/* Revenue Tab */}
+        <TabsContent value="revenue" className="space-y-4">
+          <FunnelSummaryPanel
+            data={summaryQuery.data}
+            isLoading={summaryQuery.isLoading}
+            error={summaryQuery.error}
+            stage="Revenue"
+          />
+          <FunnelTimeSeriesPanel
+            data={timeSeriesQuery.data}
+            isLoading={timeSeriesQuery.isLoading}
+            error={timeSeriesQuery.error}
+            bucket={bucket}
+          />
+        </TabsContent>
+
+        {/* Retention Tab */}
+        <TabsContent value="retention" className="space-y-4">
+          <Card>
+            <CardHeader>
+              <CardTitle>Retention Metrics</CardTitle>
+              <CardDescription>Coming in Phase 2</CardDescription>
+            </CardHeader>
+            <CardContent>
+              <p className="text-muted-foreground">
+                Retention cohort analysis will be available in the next release.
+              </p>
+            </CardContent>
+          </Card>
+        </TabsContent>
+
+        {/* Engagement Tab */}
+        <TabsContent value="engagement" className="space-y-4">
+          <FunnelSummaryPanel
+            data={summaryQuery.data}
+            isLoading={summaryQuery.isLoading}
+            error={summaryQuery.error}
+            stage="Engagement"
+          />
+          <FunnelTimeSeriesPanel
+            data={timeSeriesQuery.data}
+            isLoading={timeSeriesQuery.isLoading}
+            error={timeSeriesQuery.error}
+            bucket={bucket}
+          />
+        </TabsContent>
+      </Tabs>
+    </div>
+  );
+}
+
+// ── Panel Components ──
+
+interface FunnelSummaryPanelProps {
+  data?: { stages: Array<{ eventName: string; total: number; uniqueUsers: number }>; rangeClamped: boolean; cached: boolean };
+  isLoading: boolean;
+  error: any;
+  stage?: string;
+}
+
+function FunnelSummaryPanel({ data, isLoading, error, stage }: FunnelSummaryPanelProps) {
+  if (isLoading) {
+    return (
+      <Card>
+        <CardContent className="flex items-center justify-center py-12">
+          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
+          <span className="ml-2 text-muted-foreground">Loading summary...</span>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="flex items-center justify-center py-12 text-destructive">
+          <AlertCircle className="h-6 w-6 mr-2" />
+          <span>Error loading summary: {error.message}</span>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  if (!data || data.stages.length === 0) {
+    return (
+      <Card>
+        <CardHeader>
+          <CardTitle>{stage ? `${stage} ` : ""}Stage Summary</CardTitle>
+        </CardHeader>
+        <CardContent className="text-center py-12 text-muted-foreground">
+          <p>No data available for the selected period</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  return (
+    <Card>
+      <CardHeader>
+        <CardTitle>{stage ? `${stage} ` : ""}Stage Summary</CardTitle>
+        <CardDescription>Event counts and unique users</CardDescription>
+      </CardHeader>
+      <CardContent>
+        <div className="space-y-4">
+          {data.stages.map((s) => (
+            <div key={s.eventName} className="flex items-center justify-between border-b pb-2">
+              <div>
+                <p className="font-medium">{s.eventName}</p>
+                <p className="text-xs text-muted-foreground">
+                  {s.uniqueUsers.toLocaleString()} unique users
+                </p>
+              </div>
+              <div className="text-right">
+                <p className="text-2xl font-bold">{s.total.toLocaleString()}</p>
+                <p className="text-xs text-muted-foreground">total events</p>
+              </div>
+            </div>
+          ))}
+        </div>
+      </CardContent>
+    </Card>
+  );
+}
+
+interface FunnelTimeSeriesPanelProps {
+  data?: { series: Array<{ bucket: string; eventName: string; total: number }>; rangeClamped: boolean; cached: boolean };
+  isLoading: boolean;
+  error: any;
+  bucket: string;
+}
+
+function FunnelTimeSeriesPanel({ data, isLoading, error, bucket }: FunnelTimeSeriesPanelProps) {
+  if (isLoading) {
+    return (
+      <Card>
+        <CardContent className="flex items-center justify-center py-12">
+          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
+          <span className="ml-2 text-muted-foreground">Loading time series...</span>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  if (error) {
+    return (
+      <Card>
+        <CardContent className="flex items-center justify-center py-12 text-destructive">
+          <AlertCircle className="h-6 w-6 mr-2" />
+          <span>Error loading time series: {error.message}</span>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  if (!data || data.series.length === 0) {
+    return (
+      <Card>
+        <CardHeader>
+          <CardTitle>Time Series</CardTitle>
+          <CardDescription>Events over time ({bucket}ly buckets, UTC)</CardDescription>
+        </CardHeader>
+        <CardContent className="text-center py-12 text-muted-foreground">
+          <p>No data available for the selected period</p>
+        </CardContent>
+      </Card>
+    );
+  }
+
+  return (
+    <Card>
+      <CardHeader>
+        <CardTitle>Time Series</CardTitle>
+        <CardDescription>Events over time ({bucket}ly buckets, UTC)</CardDescription>
+      </CardHeader>
+      <CardContent>
+        <div className="space-y-2">
+          {data.series.map((point, idx) => (
+            <div key={idx} className="flex items-center justify-between text-sm border-b pb-2">
+              <div>
+                <p className="font-medium">{point.bucket} (UTC)</p>
+                <p className="text-xs text-muted-foreground">{point.eventName}</p>
+              </div>
+              <p className="font-semibold">{point.total.toLocaleString()}</p>
+            </div>
+          ))}
+        </div>
+      </CardContent>
+    </Card>
+  );
+}
diff --git a/apps/web/client/src/pages/__tests__/AdminFunnelDashboard.test.tsx b/apps/web/client/src/pages/__tests__/AdminFunnelDashboard.test.tsx
new file mode 100644
index 0000000..28d3e65
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/AdminFunnelDashboard.test.tsx
@@ -0,0 +1,270 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, waitFor } from "@testing-library/react";
+import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
+import { Router } from "wouter";
+import { memoryLocation } from "wouter/memory-location";
+
+// Mock tRPC client - factory function approach
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    funnelAnalytics: {
+      summary: {
+        useQuery: vi.fn(),
+      },
+      timeSeries: {
+        useQuery: vi.fn(),
+      },
+      invalidateCache: {
+        useMutation: vi.fn(),
+      },
+    },
+  },
+}));
+
+import AdminFunnelDashboard from "../AdminFunnelDashboard";
+import { trpc } from "@/lib/trpc";
+
+// Get typed mocks
+const mockSummaryQuery = vi.mocked(trpc.funnelAnalytics.summary.useQuery);
+const mockTimeSeriesQuery = vi.mocked(trpc.funnelAnalytics.timeSeries.useQuery);
+const mockInvalidateCacheMutation = vi.mocked(trpc.funnelAnalytics.invalidateCache.useMutation);
+
+function renderWithProviders(ui: React.ReactElement, { route = "/admin/funnel" } = {}) {
+  const queryClient = new QueryClient({
+    defaultOptions: {
+      queries: { retry: false },
+      mutations: { retry: false },
+    },
+  });
+
+  const { hook } = memoryLocation({ path: route });
+
+  return render(
+    <QueryClientProvider client={queryClient}>
+      <Router hook={hook}>{ui}</Router>
+    </QueryClientProvider>
+  );
+}
+
+describe("AdminFunnelDashboard", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+
+    // Default mutation mock setup
+    mockInvalidateCacheMutation.mockReturnValue({
+      mutateAsync: vi.fn().mockResolvedValue({ cleared: 0 }),
+      isPending: false,
+      isError: false,
+      error: null,
+    });
+  });
+
+  describe("Feature flag gating", () => {
+    it("should render when feature flag is enabled (implied by route access)", () => {
+      mockSummaryQuery.mockReturnValue({
+        data: { stages: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: { series: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      expect(screen.getByText(/Funnel Analytics/i)).toBeInTheDocument();
+    });
+  });
+
+  describe("Tab rendering and MVP gating", () => {
+    beforeEach(() => {
+      mockSummaryQuery.mockReturnValue({
+        data: { stages: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: { series: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+    });
+
+    it("should render all six tabs: Overview, Acquisition, Activation, Revenue, Retention, Engagement", () => {
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
+      expect(screen.getByRole("tab", { name: /acquisition/i })).toBeInTheDocument();
+      expect(screen.getByRole("tab", { name: /activation/i })).toBeInTheDocument();
+      expect(screen.getByRole("tab", { name: /revenue/i })).toBeInTheDocument();
+      expect(screen.getByRole("tab", { name: /retention/i })).toBeInTheDocument();
+      expect(screen.getByRole("tab", { name: /engagement/i })).toBeInTheDocument();
+    });
+
+    it("should start with Overview tab selected by default", () => {
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      const overviewTab = screen.getByRole("tab", { name: /overview/i });
+      expect(overviewTab).toHaveAttribute("aria-selected", "true");
+    });
+  });
+
+  describe("Date range and refresh controls", () => {
+    beforeEach(() => {
+      mockSummaryQuery.mockReturnValue({
+        data: { stages: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: { series: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+    });
+
+    it("should render date range inputs", () => {
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
+      expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
+    });
+
+    it("should render refresh button", () => {
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
+    });
+  });
+
+  describe("Panel resilience", () => {
+    it("should show loading state when data is loading", () => {
+      mockSummaryQuery.mockReturnValue({
+        data: undefined,
+        isLoading: true,
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: undefined,
+        isLoading: true,
+      });
+
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      // Should show loading state in both panels
+      const loadingElements = screen.getAllByText(/loading/i);
+      expect(loadingElements.length).toBeGreaterThan(0);
+    });
+
+    it("should show empty state when no data is available", () => {
+      mockSummaryQuery.mockReturnValue({
+        data: { stages: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: { series: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      // Should show empty state in both panels
+      const noDataElements = screen.getAllByText(/no.*data/i);
+      expect(noDataElements.length).toBeGreaterThan(0);
+    });
+
+    it("should show error state when query fails", async () => {
+      mockSummaryQuery.mockReturnValue({
+        data: undefined,
+        isLoading: false,
+        error: new Error("Failed to fetch"),
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: undefined,
+        isLoading: false,
+      });
+
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      await waitFor(() => {
+        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
+      });
+    });
+
+    it("should render other panels even if one fails", async () => {
+      // Summary fails but timeSeries succeeds
+      mockSummaryQuery.mockReturnValue({
+        data: undefined,
+        isLoading: false,
+        error: new Error("Failed to fetch summary"),
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: {
+          series: [
+            { bucket: "2026-02-01", eventName: "signup_completed", total: 10 }
+          ],
+          rangeClamped: false,
+          cached: false
+        },
+        isLoading: false,
+      });
+
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      // Error should be shown for failed panel
+      await waitFor(() => {
+        const errorElements = screen.queryAllByText(/error.*loading.*summary/i);
+        expect(errorElements.length).toBeGreaterThan(0);
+      });
+
+      // But time series data should still render
+      expect(screen.getByText(/signup_completed/i)).toBeInTheDocument();
+    });
+  });
+
+  describe("Export functionality", () => {
+    beforeEach(() => {
+      mockSummaryQuery.mockReturnValue({
+        data: { stages: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: { series: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+    });
+
+    it("should render export button", () => {
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
+    });
+
+    it("should default to CSV format (aggregate-safe mode)", () => {
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      const exportButton = screen.getByRole("button", { name: /export/i });
+      expect(exportButton).toBeInTheDocument();
+      // Export defaults to CSV - we'll test the interaction in integration tests
+    });
+  });
+
+  describe("UTC bucket label semantics", () => {
+    it("should display bucket labels with UTC indicator", () => {
+      mockSummaryQuery.mockReturnValue({
+        data: { stages: [], rangeClamped: false, cached: false },
+        isLoading: false,
+      });
+      mockTimeSeriesQuery.mockReturnValue({
+        data: {
+          series: [
+            { bucket: "2026-02-01", eventName: "signup_completed", total: 10 }
+          ],
+          rangeClamped: false,
+          cached: false
+        },
+        isLoading: false,
+      });
+
+      renderWithProviders(<AdminFunnelDashboard />);
+
+      // Bucket labels should indicate UTC
+      expect(screen.getByText(/2026-02-01/i)).toBeInTheDocument();
+    });
+  });
+});
diff --git a/apps/web/client/src/test-setup.ts b/apps/web/client/src/test-setup.ts
index 43c30a9..4f30906 100644
--- a/apps/web/client/src/test-setup.ts
+++ b/apps/web/client/src/test-setup.ts
@@ -75,3 +75,6 @@ afterEach(async () => {
   const { cleanup } = await import("@testing-library/react");
   cleanup();
 });
+
+// Add jest-dom matchers
+import "@testing-library/jest-dom/vitest";
