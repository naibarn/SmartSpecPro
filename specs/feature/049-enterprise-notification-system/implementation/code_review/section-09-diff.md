diff --git a/apps/web/client/src/App.tsx b/apps/web/client/src/App.tsx
index c67ce6b7..33a32e27 100644
--- a/apps/web/client/src/App.tsx
+++ b/apps/web/client/src/App.tsx
@@ -61,6 +61,7 @@ const AdminQueueMedia = lazy(() => import("./pages/AdminQueueMedia"));
 const AdminAlertRules = lazy(() => import("./pages/AdminAlertRules"));
 const AdminAuditLogs = lazy(() => import("./pages/AdminAuditLogs"));
 const AdminOrchestrationLogs = lazy(() => import("./pages/AdminOrchestrationLogs"));
+const AdminNotifications = lazy(() => import("./pages/AdminNotifications"));
 const AdminAPIKeys = lazy(() => import("./pages/AdminAPIKeys"));
 const AdminOpsDashboard = lazy(() => import("./pages/Admin/AdminOpsDashboard"));
 const AdminOverviewDashboard = lazy(() => import("./pages/Admin/AdminOverviewDashboard"));
@@ -263,6 +264,9 @@ function Router() {
         <Route path="/admin/orchestration-logs">
           <RequireAdmin><AdminOrchestrationLogs /></RequireAdmin>
         </Route>
+        <Route path="/admin/notifications">
+          <RequireAdmin><AdminNotifications /></RequireAdmin>
+        </Route>
         <Route path="/admin/api-keys">
           <RequireAdmin><AdminAPIKeys /></RequireAdmin>
         </Route>
diff --git a/apps/web/client/src/pages/AdminNotifications.tsx b/apps/web/client/src/pages/AdminNotifications.tsx
new file mode 100644
index 00000000..a2d2cdc1
--- /dev/null
+++ b/apps/web/client/src/pages/AdminNotifications.tsx
@@ -0,0 +1,600 @@
+import { useEffect, useState } from "react";
+import { useLocation } from "wouter";
+import { useAuth } from "@/_core/hooks/useAuth";
+import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
+import { trpc } from "@/lib/trpc";
+import {
+  Card,
+  CardContent,
+  CardHeader,
+  CardTitle,
+} from "@/components/ui/card";
+import { Badge } from "@/components/ui/badge";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { Label } from "@/components/ui/label";
+import {
+  Select,
+  SelectContent,
+  SelectItem,
+  SelectTrigger,
+  SelectValue,
+} from "@/components/ui/select";
+import {
+  Table,
+  TableBody,
+  TableCell,
+  TableHead,
+  TableHeader,
+  TableRow,
+} from "@/components/ui/table";
+import {
+  Bell,
+  RefreshCw,
+  X,
+  ExternalLink,
+  ChevronLeft,
+  ChevronRight,
+  Loader2,
+  AlertTriangle,
+} from "lucide-react";
+
+const PAGE_SIZE = 20;
+
+const SEVERITY_COLORS: Record<string, string> = {
+  info: "bg-blue-100 text-blue-800",
+  low: "bg-blue-100 text-blue-800",
+  warning: "bg-yellow-100 text-yellow-800",
+  normal: "bg-yellow-100 text-yellow-800",
+  error: "bg-red-100 text-red-800",
+  high: "bg-red-100 text-red-800",
+  critical: "bg-red-200 text-red-900",
+};
+
+const SOURCE_COLORS: Record<string, string> = {
+  user: "bg-indigo-100 text-indigo-800",
+  orchestrator: "bg-emerald-100 text-emerald-800",
+  guardian: "bg-amber-100 text-amber-800",
+};
+
+interface UnifiedNotification {
+  id: string;
+  source: "user" | "orchestrator" | "guardian";
+  title: string;
+  content: string | null;
+  priority: string;
+  isRead: boolean;
+  isDismissed: boolean;
+  actionUrl: string | null;
+  metadata: Record<string, unknown> | null;
+  createdAt: string;
+}
+
+function formatRelativeTime(dateStr: string): string {
+  const now = Date.now();
+  const date = new Date(dateStr).getTime();
+  const diffMs = now - date;
+  const diffMin = Math.floor(diffMs / 60_000);
+  if (diffMin < 1) return "just now";
+  if (diffMin < 60) return `${diffMin}m ago`;
+  const diffHrs = Math.floor(diffMin / 60);
+  if (diffHrs < 24) return `${diffHrs}h ago`;
+  const diffDays = Math.floor(diffHrs / 24);
+  return `${diffDays}d ago`;
+}
+
+export default function AdminNotifications() {
+  const { user } = useAuth();
+  const [, setLocation] = useLocation();
+  const featureEnabled = useTenantFeatureFlag(
+    "NOTIFICATION_UNIFIED_CENTER" as any,
+  );
+
+  // Admin guard
+  useEffect(() => {
+    if (user && user.role !== "admin") {
+      setLocation("/dashboard");
+    }
+  }, [user, setLocation]);
+
+  // Filters
+  const [source, setSource] = useState("all");
+  const [severity, setSeverity] = useState("all");
+  const [dateFrom, setDateFrom] = useState("");
+  const [dateTo, setDateTo] = useState("");
+  const [page, setPage] = useState(0);
+  const [selectedNotification, setSelectedNotification] =
+    useState<UnifiedNotification | null>(null);
+
+  // Data fetching
+  const statsQuery = trpc.monitoring.getUnifiedStats.useQuery(undefined, {
+    refetchInterval: 60_000,
+  });
+
+  const listQuery = trpc.monitoring.getUnifiedNotifications.useQuery({
+    source: source === "all" ? undefined : (source as any),
+    severity: severity === "all" ? undefined : severity,
+    startDate: dateFrom || undefined,
+    endDate: dateTo || undefined,
+    limit: PAGE_SIZE,
+    page,
+  });
+
+  // Feature flag guard
+  if (!featureEnabled) {
+    return (
+      <div className="mx-auto max-w-7xl p-6">
+        <Card>
+          <CardContent className="flex flex-col items-center justify-center py-12">
+            <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
+            <h2 className="text-lg font-semibold">Feature Not Enabled</h2>
+            <p className="text-muted-foreground">
+              The Notification Center is not enabled for this tenant.
+            </p>
+          </CardContent>
+        </Card>
+      </div>
+    );
+  }
+
+  const stats = statsQuery.data;
+  const items: UnifiedNotification[] = (listQuery.data?.items as any) ?? [];
+  const hasMore = listQuery.data?.hasMore ?? false;
+
+  return (
+    <div className="mx-auto max-w-7xl space-y-6 p-6">
+      {/* Header */}
+      <div className="flex items-center justify-between">
+        <div className="flex items-center gap-3">
+          <Bell className="h-6 w-6" />
+          <h1 className="text-2xl font-bold">Notification Center</h1>
+        </div>
+        <Button
+          variant="outline"
+          size="sm"
+          onClick={() => {
+            statsQuery.refetch();
+            listQuery.refetch();
+          }}
+          disabled={statsQuery.isLoading || listQuery.isLoading}
+        >
+          <RefreshCw
+            className={`mr-2 h-4 w-4 ${statsQuery.isLoading ? "animate-spin" : ""}`}
+          />
+          Refresh
+        </Button>
+      </div>
+
+      {/* Stat Cards */}
+      {statsQuery.isLoading ? (
+        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
+          {Array.from({ length: 4 }).map((_, i) => (
+            <Card key={i}>
+              <CardContent className="p-4">
+                <div className="animate-pulse space-y-2">
+                  <div className="h-4 w-20 rounded bg-muted" />
+                  <div className="h-8 w-12 rounded bg-muted" />
+                </div>
+              </CardContent>
+            </Card>
+          ))}
+        </div>
+      ) : statsQuery.isError ? (
+        <Card>
+          <CardContent className="flex items-center gap-2 p-4 text-destructive">
+            <AlertTriangle className="h-5 w-5" />
+            Failed to load statistics
+          </CardContent>
+        </Card>
+      ) : (
+        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
+          <Card>
+            <CardContent className="p-4">
+              <p className="text-sm text-muted-foreground">Total</p>
+              <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
+            </CardContent>
+          </Card>
+          <Card>
+            <CardContent className="p-4">
+              <p className="text-sm text-muted-foreground">Unread</p>
+              <p
+                className={`text-2xl font-bold ${(stats?.unread ?? 0) > 0 ? "text-blue-600" : ""}`}
+              >
+                {stats?.unread ?? 0}
+              </p>
+            </CardContent>
+          </Card>
+          <Card>
+            <CardContent className="p-4">
+              <p className="text-sm text-muted-foreground">Critical</p>
+              <p
+                className={`text-2xl font-bold ${(stats?.critical ?? 0) > 0 ? "text-red-600" : ""}`}
+              >
+                {stats?.critical ?? 0}
+              </p>
+            </CardContent>
+          </Card>
+          <Card>
+            <CardContent className="p-4">
+              <p className="text-sm text-muted-foreground">Today</p>
+              <p className="text-2xl font-bold">{stats?.today ?? 0}</p>
+            </CardContent>
+          </Card>
+        </div>
+      )}
+
+      {/* Charts Row */}
+      {stats && (
+        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
+          {/* Source Breakdown */}
+          <Card>
+            <CardHeader className="pb-2">
+              <CardTitle className="text-sm font-medium">
+                By Source
+              </CardTitle>
+            </CardHeader>
+            <CardContent className="space-y-2">
+              {stats.bySource.map(
+                (s: { source: string; count: number }) => {
+                  const max = Math.max(
+                    ...stats.bySource.map(
+                      (x: { count: number }) => x.count,
+                    ),
+                    1,
+                  );
+                  return (
+                    <div key={s.source} className="flex items-center gap-2">
+                      <Badge
+                        variant="secondary"
+                        className={`w-24 justify-center ${SOURCE_COLORS[s.source] ?? ""}`}
+                      >
+                        {s.source}
+                      </Badge>
+                      <div className="h-5 flex-1 rounded bg-muted">
+                        <div
+                          className={`h-full rounded ${s.source === "user" ? "bg-indigo-500" : s.source === "orchestrator" ? "bg-emerald-500" : "bg-amber-500"}`}
+                          style={{
+                            width: `${(s.count / max) * 100}%`,
+                          }}
+                        />
+                      </div>
+                      <span className="w-8 text-right text-sm font-medium">
+                        {s.count}
+                      </span>
+                    </div>
+                  );
+                },
+              )}
+            </CardContent>
+          </Card>
+
+          {/* Severity Distribution */}
+          <Card>
+            <CardHeader className="pb-2">
+              <CardTitle className="text-sm font-medium">
+                By Severity
+              </CardTitle>
+            </CardHeader>
+            <CardContent className="space-y-2">
+              {stats.bySeverity.map(
+                (s: { severity: string; count: number }) => {
+                  const max = Math.max(
+                    ...stats.bySeverity.map(
+                      (x: { count: number }) => x.count,
+                    ),
+                    1,
+                  );
+                  const barColor =
+                    s.severity === "critical"
+                      ? "bg-red-600"
+                      : s.severity === "error"
+                        ? "bg-red-400"
+                        : s.severity === "warning"
+                          ? "bg-yellow-400"
+                          : "bg-blue-400";
+                  return (
+                    <div
+                      key={s.severity}
+                      className="flex items-center gap-2"
+                    >
+                      <Badge
+                        variant="secondary"
+                        className={`w-24 justify-center ${SEVERITY_COLORS[s.severity] ?? ""}`}
+                      >
+                        {s.severity}
+                      </Badge>
+                      <div className="h-5 flex-1 rounded bg-muted">
+                        <div
+                          className={`h-full rounded ${barColor}`}
+                          style={{
+                            width: `${(s.count / max) * 100}%`,
+                          }}
+                        />
+                      </div>
+                      <span className="w-8 text-right text-sm font-medium">
+                        {s.count}
+                      </span>
+                    </div>
+                  );
+                },
+              )}
+            </CardContent>
+          </Card>
+        </div>
+      )}
+
+      {/* Filter Bar */}
+      <Card>
+        <CardContent className="flex flex-wrap items-end gap-4 p-4">
+          <div className="space-y-1">
+            <Label htmlFor="source-filter">Source</Label>
+            <Select
+              value={source}
+              onValueChange={(v) => {
+                setSource(v);
+                setPage(0);
+              }}
+            >
+              <SelectTrigger
+                id="source-filter"
+                className="w-40"
+                aria-label="Source"
+              >
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">All</SelectItem>
+                <SelectItem value="user">User</SelectItem>
+                <SelectItem value="orchestrator">Orchestrator</SelectItem>
+                <SelectItem value="guardian">Guardian</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+
+          <div className="space-y-1">
+            <Label htmlFor="severity-filter">Severity</Label>
+            <Select
+              value={severity}
+              onValueChange={(v) => {
+                setSeverity(v);
+                setPage(0);
+              }}
+            >
+              <SelectTrigger
+                id="severity-filter"
+                className="w-40"
+                aria-label="Severity"
+              >
+                <SelectValue />
+              </SelectTrigger>
+              <SelectContent>
+                <SelectItem value="all">All</SelectItem>
+                <SelectItem value="info">Info</SelectItem>
+                <SelectItem value="warning">Warning</SelectItem>
+                <SelectItem value="error">Error</SelectItem>
+                <SelectItem value="critical">Critical</SelectItem>
+              </SelectContent>
+            </Select>
+          </div>
+
+          <div className="space-y-1">
+            <Label htmlFor="date-from">From</Label>
+            <Input
+              id="date-from"
+              type="date"
+              className="w-40"
+              value={dateFrom}
+              onChange={(e) => {
+                setDateFrom(e.target.value);
+                setPage(0);
+              }}
+              aria-label="From"
+            />
+          </div>
+
+          <div className="space-y-1">
+            <Label htmlFor="date-to">To</Label>
+            <Input
+              id="date-to"
+              type="date"
+              className="w-40"
+              value={dateTo}
+              onChange={(e) => {
+                setDateTo(e.target.value);
+                setPage(0);
+              }}
+              aria-label="To"
+            />
+          </div>
+        </CardContent>
+      </Card>
+
+      {/* Main content: list + detail */}
+      <div className="flex gap-4">
+        {/* Notification List */}
+        <div className="min-w-0 flex-1">
+          {listQuery.isLoading ? (
+            <Card>
+              <CardContent className="flex items-center justify-center py-12">
+                <Loader2 className="h-6 w-6 animate-spin" />
+              </CardContent>
+            </Card>
+          ) : items.length === 0 ? (
+            <Card>
+              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
+                <Bell className="mb-2 h-8 w-8" />
+                No notifications found
+              </CardContent>
+            </Card>
+          ) : (
+            <Card>
+              <Table>
+                <TableHeader>
+                  <TableRow>
+                    <TableHead className="w-28">Source</TableHead>
+                    <TableHead>Title</TableHead>
+                    <TableHead className="w-24">Severity</TableHead>
+                    <TableHead className="w-28">Time</TableHead>
+                  </TableRow>
+                </TableHeader>
+                <TableBody>
+                  {items.map((item) => (
+                    <TableRow
+                      key={item.id}
+                      className={`cursor-pointer ${!item.isRead ? "font-medium" : ""} ${selectedNotification?.id === item.id ? "bg-muted" : ""}`}
+                      tabIndex={0}
+                      onClick={() => setSelectedNotification(item)}
+                      onKeyDown={(e) => {
+                        if (e.key === "Enter" || e.key === " ") {
+                          e.preventDefault();
+                          setSelectedNotification(item);
+                        }
+                      }}
+                    >
+                      <TableCell>
+                        <Badge
+                          variant="secondary"
+                          className={SOURCE_COLORS[item.source] ?? ""}
+                        >
+                          {item.source}
+                        </Badge>
+                      </TableCell>
+                      <TableCell>{item.title}</TableCell>
+                      <TableCell>
+                        <Badge
+                          variant="secondary"
+                          className={SEVERITY_COLORS[item.priority] ?? ""}
+                        >
+                          {item.priority}
+                        </Badge>
+                      </TableCell>
+                      <TableCell className="text-sm text-muted-foreground">
+                        {formatRelativeTime(item.createdAt)}
+                      </TableCell>
+                    </TableRow>
+                  ))}
+                </TableBody>
+              </Table>
+
+              {/* Pagination */}
+              <div className="flex items-center justify-between border-t px-4 py-2">
+                <Button
+                  variant="ghost"
+                  size="sm"
+                  disabled={page === 0}
+                  onClick={() => setPage((p) => Math.max(0, p - 1))}
+                  aria-label="Previous page"
+                >
+                  <ChevronLeft className="mr-1 h-4 w-4" />
+                  Prev
+                </Button>
+                <span className="text-sm text-muted-foreground">
+                  Page {page + 1}
+                </span>
+                <Button
+                  variant="ghost"
+                  size="sm"
+                  disabled={!hasMore}
+                  onClick={() => setPage((p) => p + 1)}
+                  aria-label="Next page"
+                >
+                  Next
+                  <ChevronRight className="ml-1 h-4 w-4" />
+                </Button>
+              </div>
+            </Card>
+          )}
+        </div>
+
+        {/* Detail Panel */}
+        {selectedNotification && (
+          <Card
+            className="w-96 shrink-0"
+            aria-label="Notification detail"
+          >
+            <CardHeader className="flex flex-row items-start justify-between pb-2">
+              <div className="space-y-1">
+                <CardTitle className="text-lg">
+                  {selectedNotification.title}
+                </CardTitle>
+                <div className="flex gap-2">
+                  <Badge
+                    variant="secondary"
+                    className={
+                      SOURCE_COLORS[selectedNotification.source] ?? ""
+                    }
+                  >
+                    {selectedNotification.source}
+                  </Badge>
+                  <Badge
+                    variant="secondary"
+                    className={
+                      SEVERITY_COLORS[selectedNotification.priority] ?? ""
+                    }
+                  >
+                    {selectedNotification.priority}
+                  </Badge>
+                </div>
+              </div>
+              <Button
+                variant="ghost"
+                size="icon"
+                onClick={() => setSelectedNotification(null)}
+                aria-label="Close detail panel"
+              >
+                <X className="h-4 w-4" />
+              </Button>
+            </CardHeader>
+            <CardContent className="space-y-4">
+              {/* Content */}
+              {selectedNotification.content && (
+                <p className="text-sm">
+                  {selectedNotification.content}
+                </p>
+              )}
+
+              {/* Action URL */}
+              {selectedNotification.actionUrl && (
+                <a
+                  href={selectedNotification.actionUrl}
+                  target="_blank"
+                  rel="noopener noreferrer"
+                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
+                >
+                  {selectedNotification.actionUrl}
+                  <ExternalLink className="h-3 w-3" />
+                </a>
+              )}
+
+              {/* Metadata */}
+              {selectedNotification.metadata && (
+                <div>
+                  <p className="mb-1 text-xs font-medium text-muted-foreground">
+                    Metadata
+                  </p>
+                  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
+                    {JSON.stringify(
+                      selectedNotification.metadata,
+                      null,
+                      2,
+                    )}
+                  </pre>
+                </div>
+              )}
+
+              {/* Timestamps */}
+              <div className="text-xs text-muted-foreground">
+                <p>
+                  Created:{" "}
+                  {new Date(
+                    selectedNotification.createdAt,
+                  ).toLocaleString()}
+                </p>
+              </div>
+            </CardContent>
+          </Card>
+        )}
+      </div>
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/__tests__/AdminNotifications.test.tsx b/apps/web/client/src/pages/__tests__/AdminNotifications.test.tsx
new file mode 100644
index 00000000..14ff1932
--- /dev/null
+++ b/apps/web/client/src/pages/__tests__/AdminNotifications.test.tsx
@@ -0,0 +1,299 @@
+import { describe, expect, it, vi, beforeEach } from "vitest";
+import { render, screen, within } from "@testing-library/react";
+import userEvent from "@testing-library/user-event";
+import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
+
+const setLocationMock = vi.fn();
+
+vi.mock("wouter", () => ({
+  useLocation: () => ["/admin/notifications", setLocationMock],
+}));
+
+vi.mock("@/_core/hooks/useAuth", () => ({
+  useAuth: vi.fn(() => ({
+    user: { id: 1, role: "admin" },
+    loading: false,
+  })),
+}));
+
+import { useAuth } from "@/_core/hooks/useAuth";
+const mockedUseAuth = vi.mocked(useAuth);
+
+vi.mock("@/hooks/useTenantFeatureFlag", () => ({
+  useTenantFeatureFlag: vi.fn(() => true),
+}));
+
+import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
+const mockedUseFlag = vi.mocked(useTenantFeatureFlag);
+
+const mockStatsQuery = vi.fn();
+const mockListQuery = vi.fn();
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    monitoring: {
+      getUnifiedStats: {
+        useQuery: (...args: any[]) => mockStatsQuery(...args),
+      },
+      getUnifiedNotifications: {
+        useQuery: (...args: any[]) => mockListQuery(...args),
+      },
+    },
+  },
+}));
+
+import AdminNotifications from "../AdminNotifications";
+
+function wrapper({ children }: { children: React.ReactNode }) {
+  const qc = new QueryClient({
+    defaultOptions: { queries: { retry: false } },
+  });
+  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
+}
+
+const sampleStats = {
+  total: 42,
+  unread: 5,
+  critical: 2,
+  today: 8,
+  bySource: [
+    { source: "user", count: 20 },
+    { source: "orchestrator", count: 15 },
+    { source: "guardian", count: 7 },
+  ],
+  bySeverity: [
+    { severity: "info", count: 25 },
+    { severity: "warning", count: 10 },
+    { severity: "error", count: 5 },
+    { severity: "critical", count: 2 },
+  ],
+};
+
+const sampleItems = [
+  {
+    id: "user:1",
+    source: "user",
+    title: "New login detected",
+    content: "Login from new device",
+    priority: "normal",
+    isRead: false,
+    isDismissed: false,
+    actionUrl: "https://example.com/action",
+    createdAt: "2026-03-20T10:00:00.000Z",
+    metadata: { ip: "1.2.3.4" },
+  },
+  {
+    id: "orch:2",
+    source: "orchestrator",
+    title: "Run completed",
+    content: "Team room run finished successfully",
+    priority: "low",
+    isRead: true,
+    isDismissed: false,
+    actionUrl: null,
+    createdAt: "2026-03-20T09:00:00.000Z",
+    metadata: null,
+  },
+  {
+    id: "user:3",
+    source: "guardian",
+    title: "Security alert",
+    content: "Unusual activity detected",
+    priority: "critical",
+    isRead: false,
+    isDismissed: false,
+    actionUrl: null,
+    createdAt: "2026-03-20T08:00:00.000Z",
+    metadata: { reason: "brute_force" },
+  },
+];
+
+function setupDefaultMocks() {
+  mockStatsQuery.mockReturnValue({
+    data: sampleStats,
+    isLoading: false,
+    isError: false,
+    error: null,
+    refetch: vi.fn(),
+  });
+  mockListQuery.mockReturnValue({
+    data: { items: sampleItems, hasMore: true },
+    isLoading: false,
+    isError: false,
+    error: null,
+    refetch: vi.fn(),
+  });
+  mockedUseAuth.mockReturnValue({
+    user: { id: 1, role: "admin" },
+    loading: false,
+  } as any);
+  mockedUseFlag.mockReturnValue(true);
+}
+
+describe("AdminNotifications", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    setLocationMock.mockClear();
+    setupDefaultMocks();
+  });
+
+  describe("stat cards", () => {
+    it("renders 4 stat cards with correct counts (total, unread, critical, today)", () => {
+      render(<AdminNotifications />, { wrapper });
+      // Check the stat card grid specifically
+      const statCards = document.querySelectorAll(
+        ".grid.grid-cols-2.lg\\:grid-cols-4 [data-slot='card']",
+      );
+      expect(statCards).toHaveLength(4);
+      expect(statCards[0]!.textContent).toContain("42");
+      expect(statCards[1]!.textContent).toContain("5");
+      expect(statCards[2]!.textContent).toContain("2");
+      expect(statCards[3]!.textContent).toContain("8");
+    });
+
+    it("shows loading skeleton while stats query is pending", () => {
+      mockStatsQuery.mockReturnValue({
+        data: undefined,
+        isLoading: true,
+        isError: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      render(<AdminNotifications />, { wrapper });
+      const skeletons = document.querySelectorAll(".animate-pulse");
+      expect(skeletons.length).toBeGreaterThan(0);
+    });
+
+    it("shows error state when stats query fails", () => {
+      mockStatsQuery.mockReturnValue({
+        data: undefined,
+        isLoading: false,
+        isError: true,
+        error: new Error("Network error"),
+        refetch: vi.fn(),
+      });
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
+    });
+  });
+
+  describe("charts", () => {
+    it("renders source breakdown display with user/orchestrator/guardian counts", () => {
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByText("20")).toBeInTheDocument();
+      expect(screen.getByText("15")).toBeInTheDocument();
+      expect(screen.getByText("7")).toBeInTheDocument();
+    });
+
+    it("renders severity distribution display with info/warning/error/critical counts", () => {
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByText("25")).toBeInTheDocument();
+      expect(screen.getByText("10")).toBeInTheDocument();
+    });
+  });
+
+  describe("filter bar", () => {
+    it("renders source dropdown with default 'all' value", () => {
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByLabelText(/source/i)).toBeInTheDocument();
+    });
+
+    it("renders severity dropdown with default 'all' value", () => {
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
+    });
+
+    it("renders date range inputs (from/to)", () => {
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
+      expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
+    });
+  });
+
+  describe("notification list", () => {
+    it("renders unified notification rows with source badge, title, severity, timestamp", () => {
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByText("New login detected")).toBeInTheDocument();
+      expect(screen.getByText("Run completed")).toBeInTheDocument();
+      expect(screen.getByText("Security alert")).toBeInTheDocument();
+    });
+
+    it("applies correct source badge text per source type", () => {
+      render(<AdminNotifications />, { wrapper });
+      const badges = screen.getAllByText(/^(user|orchestrator|guardian)$/i);
+      expect(badges.length).toBeGreaterThanOrEqual(3);
+    });
+
+    it("shows empty state when no notifications match filters", () => {
+      mockListQuery.mockReturnValue({
+        data: { items: [], hasMore: false },
+        isLoading: false,
+        isError: false,
+        error: null,
+        refetch: vi.fn(),
+      });
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
+    });
+
+    it("renders pagination controls (prev/next) when hasMore is true", () => {
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
+      expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument();
+    });
+
+    it("disables prev button on first page", () => {
+      render(<AdminNotifications />, { wrapper });
+      const prevBtn = screen.getByRole("button", { name: /prev/i });
+      expect(prevBtn).toBeDisabled();
+    });
+  });
+
+  describe("detail panel", () => {
+    it("shows detail panel when a notification row is clicked", async () => {
+      const user = userEvent.setup();
+      render(<AdminNotifications />, { wrapper });
+      await user.click(screen.getByText("New login detected"));
+      expect(screen.getByLabelText("Notification detail")).toBeInTheDocument();
+      expect(screen.getByText("Login from new device")).toBeInTheDocument();
+    });
+
+    it("displays full content, metadata, and action URL in detail panel", async () => {
+      const user = userEvent.setup();
+      render(<AdminNotifications />, { wrapper });
+      await user.click(screen.getByText("New login detected"));
+      expect(screen.getByText("Login from new device")).toBeInTheDocument();
+      expect(screen.getByText(/example\.com/)).toBeInTheDocument();
+      expect(screen.getByText(/"ip"/)).toBeInTheDocument();
+    });
+
+    it("hides detail panel when close button is clicked", async () => {
+      const user = userEvent.setup();
+      render(<AdminNotifications />, { wrapper });
+      await user.click(screen.getByText("New login detected"));
+      expect(screen.getByLabelText("Notification detail")).toBeInTheDocument();
+      await user.click(screen.getByLabelText("Close detail panel"));
+      expect(screen.queryByLabelText("Notification detail")).not.toBeInTheDocument();
+    });
+  });
+
+  describe("feature flag guard", () => {
+    it("renders fallback message when NOTIFICATION_UNIFIED_CENTER is false", () => {
+      mockedUseFlag.mockReturnValue(false);
+      render(<AdminNotifications />, { wrapper });
+      expect(screen.getByText("Feature Not Enabled")).toBeInTheDocument();
+      expect(screen.queryByText("42")).not.toBeInTheDocument();
+    });
+  });
+
+  describe("admin guard", () => {
+    it("redirects non-admin users to dashboard", () => {
+      mockedUseAuth.mockReturnValue({
+        user: { id: 2, role: "user" },
+        loading: false,
+      } as any);
+      render(<AdminNotifications />, { wrapper });
+      expect(setLocationMock).toHaveBeenCalledWith("/dashboard");
+    });
+  });
+});
diff --git a/packages/shared/src/constants/menu.ts b/packages/shared/src/constants/menu.ts
index 8a62a812..d239022d 100644
--- a/packages/shared/src/constants/menu.ts
+++ b/packages/shared/src/constants/menu.ts
@@ -28,7 +28,7 @@ export const defaultMenuItems: MenuItem[] = [
   { id: 'workflows',     label: 'Workflows',      labelTh: 'เวิร์กโฟลว์',    icon: 'GitBranch',       path: '/workflows',      platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.5 },
   { id: 'webhook-triggers', label: 'Webhook Triggers', labelTh: 'เว็บฮุก', icon: 'Webhook', path: '/webhook-triggers', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.6, requiresFeature: 'webhookTriggers' },
   { id: 'agencies',      label: 'Agencies',       labelTh: 'เอเจนซี่',       icon: 'Users',           path: '/agencies',       platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.7, requiresFeature: 'AGENCY_SWARM_ENABLED' },
-  { id: 'teams',         label: 'Teams',          labelTh: 'ทีม AI',         icon: 'UsersRound',      path: '/teams',          platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.75, requiresFeature: 'ORCHESTRATOR_ENABLED' },
+  { id: 'teams',         label: 'Teams',          labelTh: 'ทีม AI',         icon: 'UsersRound',      path: '/teams',          platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.75, requiresFeature: 'orchestratorEnabled' },
   { id: 'automation',    label: 'Automation Copilot', labelTh: 'ระบบอัตโนมัติ', icon: 'Bot', path: '/automation', platforms: ['web', 'desktop'], group: 'main', sortOrder: 3.8, requiresFeature: 'automationCopilot' },
   { id: 'media-history', label: 'Media History',  labelTh: 'ประวัติมีเดีย',  icon: 'Clock',           path: '/media-history',  platforms: ['web', 'desktop'], group: 'main', sortOrder: 4 },
   { id: 'document-management', label: 'Library', labelTh: 'คลังเอกสาร', icon: 'FileText', path: '/document-management', platforms: ['web', 'desktop'], group: 'main', sortOrder: 4.2 },
@@ -56,6 +56,7 @@ export const defaultMenuItems: MenuItem[] = [
   { id: 'admin-queues-media',   label: 'Media Monitor',     icon: 'PlayCircle',  path: '/admin/queues/media',       platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.7 },
   { id: 'admin-audit-logs',     label: 'Audit Logs',        labelTh: 'บันทึกตรวจสอบ', icon: 'Activity', path: '/admin/audit-logs', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.75 },
   { id: 'admin-orchestration-logs', label: 'Orchestration Logs', labelTh: 'บันทึก Orchestrator', icon: 'Workflow', path: '/admin/orchestration-logs', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.8 },
+  { id: 'admin-notifications', label: 'Notifications', labelTh: 'การแจ้งเตือน', icon: 'Bell', path: '/admin/notifications', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.85, requiresFeature: 'NOTIFICATION_UNIFIED_CENTER' },
   { id: 'admin-task-queue',     label: 'Task Queue',        labelTh: 'คิวงาน',  icon: 'ListChecks', path: '/tasks',                    platforms: ['web', 'desktop'], group: 'main', sortOrder: 9.6 },
   { id: 'admin-docker',         label: 'Docker Status',     icon: 'Activity',    path: 'https://docker.smartaihub.app',    platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 22,   external: true },
   { id: 'admin-glitchtip',      label: 'Error Tracking',    icon: 'Bug',         path: 'https://glitchtip.smartaihub.app', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 22.5, external: true },
@@ -66,7 +67,7 @@ export const defaultMenuItems: MenuItem[] = [
   { id: 'admin-media-models',   label: 'Media AI Models',   icon: 'Sparkles',    path: '/admin/media-models',       platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 27 },
   { id: 'admin-skills',         label: 'Skills',            icon: 'Wand2',       path: '/admin/skills',             platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 28 },
   { id: 'admin-skill-repos',    label: 'Skill Repos',       icon: 'GitBranch',   path: '/admin/skill-repositories', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 29 },
-  { id: 'admin-personas',       label: 'Personas',          icon: 'UserCircle',  path: '/admin/personas',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 30.5, requiresFeature: 'AI_PERSONA_ENABLED' },
+  { id: 'admin-personas',       label: 'Personas',          icon: 'UserCircle',  path: '/admin/personas',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 30.5, requiresFeature: 'personaSystem' },
   { id: 'admin-agencies',       label: 'Agencies',          icon: 'Bot',         path: '/admin/agencies',           platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 30 },
   { id: 'admin-channel-router', label: 'Channel Router',    labelTh: 'ตัวกำหนดเส้นทาง', icon: 'GitFork', path: '/admin/channel-router', platforms: ['web', 'desktop'], roles: ['admin', 'domain_admin'], group: 'admin', sortOrder: 30.2, requiresFeature: 'channelRouter' },
   { id: 'admin-guardian',       label: 'System Guardian',   labelTh: 'ผู้พิทักษ์ระบบ', icon: 'ShieldCheck', path: '/admin/system-guardian', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 19, requiresFeature: 'VIRTUAL_ADMIN_ENABLED' },
