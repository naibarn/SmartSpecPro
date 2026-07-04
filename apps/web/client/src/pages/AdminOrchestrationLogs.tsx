/**
 * Admin Orchestration Logs — audit log viewer for Hybrid Skill Orchestrator.
 *
 * Part of Feature 045.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OpsEarlyWarningPanel } from "@/components/admin/OpsEarlyWarningPanel";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Loader2,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  Clock,
  CreditCard,
  BarChart3,
} from "lucide-react";
import { DashboardCard } from "@/components/dashboard";

const EVENT_LABELS: Record<string, string> = {
  orchestration_classify: "Classify",
  orchestration_pipeline: "Pipeline",
  orchestration_agent_step: "Agent Step",
  orchestration_quality_gate: "Quality Gate",
  orchestration_param_extract: "Param Extract",
  orchestration_fallback: "Fallback",
};

const EVENT_COLORS: Record<string, string> = {
  orchestration_classify: "bg-blue-500/10 text-blue-700 border-blue-200",
  orchestration_pipeline: "bg-purple-500/10 text-purple-700 border-purple-200",
  orchestration_agent_step: "bg-amber-500/10 text-amber-700 border-amber-200",
  orchestration_quality_gate: "bg-green-500/10 text-green-700 border-green-200",
  orchestration_param_extract: "bg-cyan-500/10 text-cyan-700 border-cyan-200",
  orchestration_fallback: "bg-red-500/10 text-red-700 border-red-200",
};

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function AdminOrchestrationLogs() {
  const [, navigate] = useLocation();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [eventType, setEventType] = useState<string>("");
  const [traceId, setTraceId] = useState("");
  const [userId, setUserId] = useState("");
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.audit.orchestrationEvents.useQuery(
    {
      date,
      eventType: (eventType || undefined) as any,
      traceId: traceId || undefined,
      userId: userId ? Number(userId) : undefined,
      limit: 200,
    },
    { refetchInterval: 30_000 },
  );

  const traceQuery = trpc.audit.orchestrationTrace.useQuery(
    { traceId: selectedTrace!, date },
    { enabled: !!selectedTrace },
  );
  const opsOverviewQuery = trpc.monitoring.getOpsOverview.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const stats = data?.stats;
  const entries = data?.entries ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      {/* Sticky Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin/dashboard")}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold leading-tight">
                    Orchestration Logs
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Classification, pipeline, and fallback events
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void Promise.all([refetch(), opsOverviewQuery.refetch()])}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            icon={<Activity className="h-4 w-4" />}
            label="Total Events"
            value={stats.totalEvents}
          />
          <StatCard
            icon={<Zap className="h-4 w-4 text-blue-500" />}
            label="Classifications"
            value={stats.classifyCount}
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            label="Fallbacks"
            value={stats.fallbackCount}
          />
          <StatCard
            icon={<BarChart3 className="h-4 w-4 text-purple-500" />}
            label="Pipelines"
            value={stats.pipelineCount}
          />
          <StatCard
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            label="Avg Classify"
            value={`${stats.avgClassifyLatencyMs}ms`}
          />
          <StatCard
            icon={<CreditCard className="h-4 w-4 text-green-500" />}
            label="Credits Used"
            value={stats.totalCreditsUsed}
          />
        </div>
      )}

      <OpsEarlyWarningPanel
        overview={opsOverviewQuery.data}
        isLoading={opsOverviewQuery.isLoading}
        showMonitoringLink
        description="Shared early-warning feed that correlates orchestration fallback patterns with service pressure, alert backlog, and audit spikes."
      />

      {/* Top Skills & Fallback Reasons */}
      {stats && (stats.topSkills.length > 0 || Object.keys(stats.fallbackReasons).length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.topSkills.length > 0 && (
            <DashboardCard>
              <div className="py-3 px-4">
                <h3 className="text-sm">Top Skills</h3>
              </div>
              <div className="px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {stats.topSkills.map((s) => (
                    <Badge key={s.skillId} variant="outline" className="text-xs">
                      {s.skillId}: {s.count}
                    </Badge>
                  ))}
                </div>
              </div>
            </DashboardCard>
          )}
          {Object.keys(stats.fallbackReasons).length > 0 && (
            <DashboardCard>
              <div className="py-3 px-4">
                <h3 className="text-sm">Fallback Reasons</h3>
              </div>
              <div className="px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.fallbackReasons).map(([reason, count]) => (
                    <Badge
                      key={reason}
                      variant="destructive"
                      className="text-xs"
                    >
                      {reason}: {count as number}
                    </Badge>
                  ))}
                </div>
              </div>
            </DashboardCard>
          )}
        </div>
      )}

      {/* Filters */}
      <DashboardCard>
        <div className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-36 h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Event Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="orchestration_classify">
                    Classify
                  </SelectItem>
                  <SelectItem value="orchestration_pipeline">
                    Pipeline
                  </SelectItem>
                  <SelectItem value="orchestration_fallback">
                    Fallback
                  </SelectItem>
                  <SelectItem value="orchestration_param_extract">
                    Param Extract
                  </SelectItem>
                  <SelectItem value="orchestration_quality_gate">
                    Quality Gate
                  </SelectItem>
                  <SelectItem value="orchestration_agent_step">
                    Agent Step
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trace ID</Label>
              <Input
                value={traceId}
                onChange={(e) => setTraceId(e.target.value)}
                placeholder="abc-123..."
                className="w-48 h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">User ID</Label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="123"
                className="w-24 h-8 text-sm"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <Search className="h-3.5 w-3.5 mr-1" />
              Search
            </Button>
          </div>
        </div>
      </DashboardCard>

      {/* Events Table */}
      <DashboardCard>
        <div className="py-3 px-4">
          <h3 className="text-sm">
            Events {entries.length > 0 ? `(${entries.length})` : ""}
          </h3>
        </div>
        <div className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No orchestration events found for this date.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Time</TableHead>
                    <TableHead className="w-32">Event</TableHead>
                    <TableHead className="w-16">User</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="w-20">Latency</TableHead>
                    <TableHead className="w-28">Trace</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry: any, idx: number) => (
                    <TableRow
                      key={idx}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedTrace(entry.traceId)}
                    >
                      <TableCell className="text-xs font-mono">
                        {formatTime(entry.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${EVENT_COLORS[entry.eventType] ?? ""}`}
                        >
                          {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.userId ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-sm truncate">
                        <EventDetails entry={entry} />
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {entry.metadata?.latencyMs
                          ? `${entry.metadata.latencyMs}ms`
                          : entry.metadata?.durationMs
                            ? `${entry.metadata.durationMs}ms`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-28">
                        {entry.traceId?.slice(0, 8)}...
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DashboardCard>

      </div>{/* end content */}

      {/* Trace Detail Dialog */}
      <Dialog
        open={!!selectedTrace}
        onOpenChange={(open) => !open && setSelectedTrace(null)}
      >
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">
              Trace: {selectedTrace}
            </DialogTitle>
          </DialogHeader>
          {traceQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Timeline view */}
              {traceQuery.data?.entries.map((entry: any, idx: number) => (
                <div
                  key={idx}
                  className="flex gap-3 items-start border-l-2 border-border pl-3 py-1"
                >
                  <div className="flex-shrink-0 w-16 text-xs font-mono text-muted-foreground">
                    {formatTime(entry.timestamp)}
                  </div>
                  <div className="flex-shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-xs ${EVENT_COLORS[entry.eventType] ?? ""}`}
                    >
                      {EVENT_LABELS[entry.eventType] ?? entry.eventType}
                    </Badge>
                  </div>
                  <div className="flex-1 text-xs space-y-1">
                    <EventDetails entry={entry} expanded />
                  </div>
                </div>
              ))}

              {/* Raw JSON for non-orchestration events */}
              {traceQuery.data?.allEntries
                .filter(
                  (e: any) => !e.eventType?.startsWith("orchestration_"),
                )
                .map((entry: any, idx: number) => (
                  <div
                    key={`other-${idx}`}
                    className="flex gap-3 items-start border-l-2 border-muted pl-3 py-1 opacity-60"
                  >
                    <div className="flex-shrink-0 w-16 text-xs font-mono text-muted-foreground">
                      {formatTime(entry.timestamp)}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {entry.eventType}
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {entry.model && `model: ${entry.model}`}
                      {entry.statusCode && ` | status: ${entry.statusCode}`}
                    </div>
                  </div>
                ))}

              {traceQuery.data?.entries.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No orchestration events found for this trace.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <DashboardCard>
      <div className="p-3 flex items-center gap-2">
        {icon}
        <div>
          <div className="text-lg font-semibold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </div>
    </DashboardCard>
  );
}

function EventDetails({
  entry,
  expanded,
}: {
  entry: any;
  expanded?: boolean;
}) {
  const meta = entry.metadata ?? {};

  switch (entry.eventType) {
    case "orchestration_classify":
      return (
        <span>
          <Badge variant="outline" className="text-xs mr-1">
            {meta.level}
          </Badge>
          {meta.skills?.[0] && (
            <>
              <span className="font-medium">{meta.skills[0].skillId}</span>
              <span className="text-muted-foreground ml-1">
                ({(meta.skills[0].confidence * 100).toFixed(0)}%)
              </span>
            </>
          )}
          {meta.skills?.length > 1 && (
            <span className="text-muted-foreground">
              {" "}
              +{meta.skills.length - 1} more
            </span>
          )}
          {expanded && meta.strategy && (
            <span className="text-muted-foreground ml-2">
              strategy: {meta.strategy}
            </span>
          )}
          {meta.injectionAttempt && (
            <Badge variant="destructive" className="text-xs ml-1">
              Injection Attempt
            </Badge>
          )}
        </span>
      );

    case "orchestration_fallback":
      return (
        <span className="text-destructive">
          reason: <span className="font-medium">{meta.reason}</span>
          {entry.errorMessage && (
            <span className="ml-1 text-muted-foreground">
              — {entry.errorMessage}
            </span>
          )}
        </span>
      );

    case "orchestration_pipeline":
      return (
        <span>
          {meta.steps?.length ?? 0} steps |{" "}
          {meta.steps?.filter((s: any) => s.status === "completed").length ?? 0}{" "}
          completed |{" "}
          {meta.steps?.filter((s: any) => s.status === "failed").length ?? 0}{" "}
          failed | {meta.totalCreditsUsed ?? 0} credits
          {expanded && meta.steps && (
            <div className="mt-1 space-y-0.5">
              {meta.steps.map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  {s.status === "completed" ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : s.status === "failed" ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                  ) : (
                    <Clock className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="font-mono">{s.skillId}</span>
                  <span className="text-muted-foreground">
                    {s.creditsUsed}cr {s.durationMs}ms
                  </span>
                  {s.error && (
                    <span className="text-destructive text-xs">
                      {s.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </span>
      );

    case "orchestration_param_extract":
      return (
        <span>
          <span className="font-medium">{meta.skillId}</span>
          {meta.fieldsExtracted?.length > 0 && (
            <span className="text-muted-foreground ml-1">
              extracted: {meta.fieldsExtracted.join(", ")}
            </span>
          )}
          {meta.fieldsMissing?.length > 0 && (
            <span className="text-destructive ml-1">
              missing: {meta.fieldsMissing.join(", ")}
            </span>
          )}
        </span>
      );

    case "orchestration_quality_gate":
      return (
        <span>
          {meta.pass ? (
            <Badge className="text-xs bg-green-500/10 text-green-700 border-green-200">
              PASS
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">
              FAIL
            </Badge>
          )}{" "}
          score: {meta.score?.toFixed(2)}
          {meta.issues?.length > 0 && expanded && (
            <div className="mt-1 text-destructive">
              {meta.issues.map((issue: string, i: number) => (
                <div key={i}>• {issue}</div>
              ))}
            </div>
          )}
        </span>
      );

    case "orchestration_agent_step":
      return (
        <span>
          iter #{meta.iteration} — {meta.action}
          {meta.skillId && (
            <span className="font-medium ml-1">{meta.skillId}</span>
          )}
          {expanded && meta.reasoning && (
            <div className="mt-1 text-muted-foreground italic">
              {meta.reasoning}
            </div>
          )}
        </span>
      );

    default:
      return (
        <span className="text-muted-foreground">
          {JSON.stringify(meta).slice(0, 100)}
        </span>
      );
  }
}
