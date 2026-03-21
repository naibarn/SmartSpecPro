import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpButton } from "@/components/help";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bell,
  RefreshCw,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const PAGE_SIZE = 20;

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  normal: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
  critical: "bg-red-200 text-red-900",
};

/** Human-friendly labels for server severity enum values */
const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

const SOURCE_COLORS: Record<string, string> = {
  user: "bg-indigo-100 text-indigo-800",
  orchestrator: "bg-emerald-100 text-emerald-800",
  guardian: "bg-amber-100 text-amber-800",
};

interface UnifiedNotification {
  id: string;
  source: "user" | "orchestrator" | "guardian";
  title: string;
  content: string | null;
  priority: string;
  isRead: boolean;
  isDismissed: boolean;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  readAt?: string | null;
}

function isSafeUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://");
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

export default function AdminNotifications() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const featureEnabled = useTenantFeatureFlag("notificationUnifiedCenter");

  // Admin guard — allow both admin and domain_admin
  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "domain_admin") {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  // Filters — severity uses server enum values (low/normal/high/critical)
  const [source, setSource] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [selectedNotification, setSelectedNotification] =
    useState<UnifiedNotification | null>(null);

  // Data fetching
  const statsQuery = trpc.monitoring.getUnifiedStats.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const listQuery = trpc.monitoring.getUnifiedNotifications.useQuery({
    source: source === "all" ? undefined : (source as any),
    severity:
      severity === "all"
        ? undefined
        : (severity as "low" | "normal" | "high" | "critical"),
    startDate: dateFrom || undefined,
    endDate: dateTo || undefined,
    limit: PAGE_SIZE,
    page,
  });

  // Feature flag guard
  if (!featureEnabled) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Feature Not Enabled</h2>
            <p className="text-muted-foreground">
              The Notification Center is not enabled for this tenant.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = statsQuery.data;
  const items: UnifiedNotification[] =
    (listQuery.data?.items as any) ?? [];
  const hasMore = listQuery.data?.hasMore ?? false;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Notification Center</h1>
        </div>
        <div className="flex items-center gap-2">
        <HelpButton page="/admin/notifications" variant="ghost" size="sm" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            statsQuery.refetch();
            listQuery.refetch();
          }}
          disabled={statsQuery.isLoading || listQuery.isLoading}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${statsQuery.isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
        </div>
      </div>

      {/* Stat Cards */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="h-8 w-12 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : statsQuery.isError ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Failed to load statistics
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats?.total ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Unread</p>
              <p
                className={`text-2xl font-bold ${(stats?.unread ?? 0) > 0 ? "text-blue-600" : ""}`}
              >
                {stats?.unread ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Critical</p>
              <p
                className={`text-2xl font-bold ${(stats?.critical ?? 0) > 0 ? "text-red-600" : ""}`}
              >
                {stats?.critical ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Today</p>
              <p className="text-2xl font-bold">{stats?.today ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Source Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                By Source
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.bySource.map(
                (s: { source: string; count: number }) => {
                  const max = Math.max(
                    ...stats.bySource.map(
                      (x: { count: number }) => x.count,
                    ),
                    1,
                  );
                  return (
                    <div key={s.source} className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`w-24 justify-center ${SOURCE_COLORS[s.source] ?? ""}`}
                      >
                        {s.source}
                      </Badge>
                      <div className="h-5 flex-1 rounded bg-muted">
                        <div
                          className={`h-full rounded ${s.source === "user" ? "bg-indigo-500" : s.source === "orchestrator" ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{
                            width: `${(s.count / max) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-sm font-medium">
                        {s.count}
                      </span>
                    </div>
                  );
                },
              )}
            </CardContent>
          </Card>

          {/* Severity Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                By Severity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.bySeverity.map(
                (s: { severity: string; count: number }) => {
                  const max = Math.max(
                    ...stats.bySeverity.map(
                      (x: { count: number }) => x.count,
                    ),
                    1,
                  );
                  const barColor =
                    s.severity === "critical"
                      ? "bg-red-600"
                      : s.severity === "high"
                        ? "bg-red-400"
                        : s.severity === "normal"
                          ? "bg-yellow-400"
                          : "bg-blue-400";
                  return (
                    <div
                      key={s.severity}
                      className="flex items-center gap-2"
                    >
                      <Badge
                        variant="secondary"
                        className={`w-24 justify-center ${SEVERITY_COLORS[s.severity] ?? ""}`}
                      >
                        {SEVERITY_LABELS[s.severity] ?? s.severity}
                      </Badge>
                      <div className="h-5 flex-1 rounded bg-muted">
                        <div
                          className={`h-full rounded ${barColor}`}
                          style={{
                            width: `${(s.count / max) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-sm font-medium">
                        {s.count}
                      </span>
                    </div>
                  );
                },
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1">
            <Label htmlFor="source-filter">Source</Label>
            <Select
              value={source}
              onValueChange={(v) => {
                setSource(v);
                setPage(0);
              }}
            >
              <SelectTrigger
                id="source-filter"
                className="w-40"
                aria-label="Source"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="orchestrator">Orchestrator</SelectItem>
                <SelectItem value="guardian">Guardian</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="severity-filter">Severity</Label>
            <Select
              value={severity}
              onValueChange={(v) => {
                setSeverity(v);
                setPage(0);
              }}
            >
              <SelectTrigger
                id="severity-filter"
                className="w-40"
                aria-label="Severity"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="date-from">From</Label>
            <Input
              id="date-from"
              type="date"
              className="w-40"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              aria-label="From"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="date-to">To</Label>
            <Input
              id="date-to"
              type="date"
              className="w-40"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              aria-label="To"
            />
          </div>
        </CardContent>
      </Card>

      {/* Main content: list + detail */}
      <div className="flex gap-4">
        {/* Notification List */}
        <div className="min-w-0 flex-1">
          {listQuery.isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell className="mb-2 h-8 w-8" />
                No notifications found
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Source</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-24">Severity</TableHead>
                    <TableHead className="w-28">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={`cursor-pointer ${!item.isRead ? "font-medium" : ""} ${selectedNotification?.id === item.id ? "bg-muted" : ""}`}
                      tabIndex={0}
                      onClick={() => setSelectedNotification(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedNotification(item);
                        }
                      }}
                    >
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={SOURCE_COLORS[item.source] ?? ""}
                        >
                          {item.source}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={SEVERITY_COLORS[item.priority] ?? ""}
                        >
                          {SEVERITY_LABELS[item.priority] ?? item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(item.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Prev
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Detail Panel */}
        {selectedNotification && (
          <Card
            className="w-96 shrink-0"
            aria-label="Notification detail"
          >
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="text-lg">
                  {selectedNotification.title}
                </CardTitle>
                <div className="flex gap-2">
                  <Badge
                    variant="secondary"
                    className={
                      SOURCE_COLORS[selectedNotification.source] ?? ""
                    }
                  >
                    {selectedNotification.source}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={
                      SEVERITY_COLORS[selectedNotification.priority] ?? ""
                    }
                  >
                    {SEVERITY_LABELS[selectedNotification.priority] ??
                      selectedNotification.priority}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedNotification(null)}
                aria-label="Close detail panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Content */}
              {selectedNotification.content && (
                <p className="text-sm">
                  {selectedNotification.content}
                </p>
              )}

              {/* Action URL */}
              {selectedNotification.actionUrl &&
                (isSafeUrl(selectedNotification.actionUrl) ? (
                  <a
                    href={selectedNotification.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    {selectedNotification.actionUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {selectedNotification.actionUrl}
                  </span>
                ))}

              {/* Metadata */}
              {selectedNotification.metadata && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Metadata
                  </p>
                  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(
                      selectedNotification.metadata,
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground">
                <p>
                  Created:{" "}
                  {new Date(
                    selectedNotification.createdAt,
                  ).toLocaleString()}
                </p>
                {selectedNotification.readAt && (
                  <p>
                    Read:{" "}
                    {new Date(
                      selectedNotification.readAt,
                    ).toLocaleString()}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
