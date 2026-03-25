import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Timer,
  Activity,
  AlertTriangle,
  Calendar,
  ArrowLeft,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

// ── Helpers ──

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  success: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", label: "Success" },
  failure: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Failed" },
  started: { icon: Loader2, color: "text-blue-600", bg: "bg-blue-50", label: "Running" },
  timeout: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", label: "Timeout" },
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shortTaskName(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1].replace(/_/g, " ");
}

function rateColor(rate: number): string {
  if (rate >= 95) return "text-green-700 bg-green-100";
  if (rate >= 80) return "text-amber-700 bg-amber-100";
  return "text-red-700 bg-red-100";
}

// ── Component ──

export default function AdminScheduledJobs() {
  const [selectedTask, setSelectedTask] = useState<string | undefined>();
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const pageSize = 30;

  const scheduleQuery = trpc.queues.getScheduledJobs.useQuery();
  const statsQuery = trpc.queues.getScheduledJobStats.useQuery();
  const runsQuery = trpc.queues.getScheduledJobRuns.useQuery({
    taskName: selectedTask,
    status: selectedStatus,
    limit: pageSize,
    offset: page * pageSize,
  });

  const stats = (statsQuery.data as any)?.stats ?? [];
  const runs = (runsQuery.data as any)?.runs ?? [];
  const totalRuns = (runsQuery.data as any)?.total ?? 0;
  const scheduledTasks = (scheduleQuery.data as any)?.tasks ?? [];

  const isLoading = scheduleQuery.isLoading || statsQuery.isLoading;

  // Build a map: taskName → last run stats
  const statsMap = new Map<string, any>();
  for (const s of stats) {
    statsMap.set(s.taskName, s);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/queues">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Scheduled Jobs Monitor
            </h1>
            <p className="text-xs text-muted-foreground">
              {scheduledTasks.length} registered tasks — execution history, success rates, and performance
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { statsQuery.refetch(); runsQuery.refetch(); scheduleQuery.refetch(); }}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ── Registered Schedule ── */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Registered Schedule
        </h2>
        {scheduleQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {scheduledTasks.map((t: any) => {
              const stat = statsMap.get(t.task);
              const isCron = t.scheduleType === "crontab";
              const isSelected = selectedTask === t.task;

              return (
                <Card
                  key={t.name}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    isSelected && "ring-2 ring-primary shadow-md",
                  )}
                  onClick={() => {
                    setSelectedTask(isSelected ? undefined : t.task);
                    setPage(0);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isCron ? (
                            <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          ) : (
                            <Repeat className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                          )}
                          <span className="text-sm font-medium truncate capitalize">
                            {shortTaskName(t.name)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={t.task}>
                          {t.task}
                        </p>
                      </div>

                      {/* Success rate badge */}
                      {stat && (
                        <Badge className={cn("text-[10px] px-1.5 shrink-0", rateColor(stat.successRate))}>
                          {stat.successRate}%
                        </Badge>
                      )}
                    </div>

                    {/* Schedule + stats row */}
                    <div className="flex items-center gap-3 mt-2 text-[10px]">
                      <Badge variant="outline" className="text-[10px] font-normal gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {t.scheduleLabel}
                      </Badge>

                      {stat && (
                        <>
                          <span className="text-muted-foreground flex items-center gap-0.5">
                            <Activity className="h-2.5 w-2.5" /> {stat.totalRuns} runs
                          </span>
                          <span className="text-muted-foreground flex items-center gap-0.5">
                            <Timer className="h-2.5 w-2.5" /> {formatDuration(stat.avgDurationMs)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Last run */}
                    {stat?.lastRunAt && (
                      <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                        Last run: {formatTime(stat.lastRunAt)}
                        {stat.failureCount > 0 && (
                          <span className="text-red-500 ml-1">({stat.failureCount} failures)</span>
                        )}
                      </div>
                    )}
                    {!stat && (
                      <div className="text-[10px] text-muted-foreground/60 mt-1.5 italic">
                        No executions recorded yet
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Execution History ── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Execution History
            {totalRuns > 0 && (
              <span className="text-xs font-normal text-muted-foreground">({totalRuns})</span>
            )}
          </h2>
          <Select
            value={selectedStatus ?? "all"}
            onValueChange={(v) => { setSelectedStatus(v === "all" ? undefined : v); setPage(0); }}
          >
            <SelectTrigger className="h-7 w-[130px] text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failed</SelectItem>
              <SelectItem value="started">Running</SelectItem>
            </SelectContent>
          </Select>
          {selectedTask && (
            <Badge variant="secondary" className="text-xs capitalize">
              {shortTaskName(selectedTask)}
              <button className="ml-1.5 hover:text-foreground" onClick={() => { setSelectedTask(undefined); setPage(0); }}>×</button>
            </Badge>
          )}
        </div>

        {runsQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {selectedTask || selectedStatus
                  ? "No matching executions found. Try adjusting filters."
                  : "No executions recorded yet. Jobs will appear here as they run."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {runs.map((r: any) => {
              const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.started;
              const Icon = cfg.icon;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-xs",
                    r.status === "failure" && "border-red-200 bg-red-50/50",
                  )}
                >
                  {/* Status */}
                  <div className={cn("flex items-center gap-1.5 w-20 shrink-0", cfg.color)}>
                    <Icon className={cn("h-3.5 w-3.5", r.status === "started" && "animate-spin")} />
                    <span className="font-medium">{cfg.label}</span>
                  </div>

                  {/* Task name */}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium capitalize" title={r.taskName}>
                      {shortTaskName(r.taskName)}
                    </span>
                  </div>

                  {/* When */}
                  <div className="text-muted-foreground w-24 shrink-0 text-right" title={r.startedAt}>
                    {formatTime(r.startedAt)}
                  </div>

                  {/* Duration */}
                  <div className="w-16 shrink-0 text-right">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {formatDuration(r.durationMs)}
                    </Badge>
                  </div>

                  {/* Result / Error */}
                  <div className="w-64 shrink-0 truncate text-muted-foreground" title={r.errorMessage || r.result || ""}>
                    {r.errorMessage ? (
                      <span className="text-red-600">{r.errorMessage}</span>
                    ) : r.result ? (
                      <span>{r.result}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalRuns > pageSize && (
          <div className="flex justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              Page {page + 1} of {Math.ceil(totalRuns / pageSize)}
            </span>
            <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= totalRuns} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
