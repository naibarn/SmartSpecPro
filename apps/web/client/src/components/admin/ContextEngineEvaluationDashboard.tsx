import { useMemo, useState } from "react";
import { Loader2, RefreshCcw, Search, Filter, RotateCcw, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ContextEngineHealthPanel } from "@/components/orchestrator/ContextEngineHealthPanel";
import { cn } from "@/lib/utils";

type ScopeDraft = {
  teamId: string;
  roomId: string;
  runId: string;
  skillId: string;
  userId: string;
  sinceDays: string;
  limit: string;
};

type ScopeSlice = {
  teamId: string | null;
  roomId: string | null;
  runId: string | null;
  skillId: string | null;
  count: number;
  latestCreatedAt: string | null;
  latestStatus: string | null;
  latestSource: string | null;
  latestHealthScore: number | null;
  latestGroundingScore: number | null;
  latestRetrievalCoverage: number | null;
};

type EvaluationTrendPoint = {
  bucket: string;
  surface: string;
  averageHealthScore: number | null;
  averageGroundingScore: number | null;
  averageRetrievalCoverage: number | null;
  averageLatencyMs: number | null;
};

const DEFAULT_DRAFT: ScopeDraft = {
  teamId: "",
  roomId: "",
  runId: "",
  skillId: "",
  userId: "",
  sinceDays: "7",
  limit: "12",
};

function buildQueryScope(scope: ScopeDraft) {
  const sinceDays = Math.max(1, Number(scope.sinceDays) || 7);
  const limit = Math.max(1, Math.min(Number(scope.limit) || 12, 50));
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const parsedUserId =
    scope.userId.trim().length > 0 ? Number(scope.userId) : undefined;
  const userId =
    typeof parsedUserId === "number" && Number.isFinite(parsedUserId)
      ? parsedUserId
      : undefined;

  return {
    teamId: scope.teamId.trim() || undefined,
    roomId: scope.roomId.trim() || undefined,
    runId: scope.runId.trim() || undefined,
    skillId: scope.skillId.trim() || undefined,
    userId,
    since,
    limit,
  };
}

function formatSliceLabel(slice: ScopeSlice): string {
  const parts = [
    slice.teamId ? `team ${slice.teamId}` : "team any",
    slice.roomId ? `room ${slice.roomId}` : "room any",
    slice.runId ? `run ${slice.runId}` : "run any",
  ];
  return parts.join(" · ");
}

function formatScore(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

export function ContextEngineEvaluationDashboard({
  className,
  initialScope,
}: {
  className?: string;
  initialScope?: Partial<ScopeDraft>;
}) {
  const initialDraft = useMemo<ScopeDraft>(
    () => ({
      ...DEFAULT_DRAFT,
      ...Object.fromEntries(
        Object.entries(initialScope ?? {}).filter(([, value]) =>
          typeof value === "string" ? value.length > 0 : value != null,
        ),
      ),
    }),
    [initialScope],
  );
  const [draft, setDraft] = useState<ScopeDraft>(initialDraft);
  const [applied, setApplied] = useState<ScopeDraft>(initialDraft);

  const queryScope = useMemo(() => buildQueryScope(applied), [applied]);
  const contextQuery = trpc.monitoring.getContextEngineHealth.useQuery(queryScope, {
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });
  const evaluationReportQuery = trpc.monitoring.getContextEngineEvaluationReport.useQuery(
    queryScope,
    {
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
    },
  );

  const summary = contextQuery.data ?? null;
  const scopeBreakdown = (summary?.scopeBreakdown ?? []) as ScopeSlice[];
  const evaluationReport = evaluationReportQuery.data ?? null;
  const trendSeries = (evaluationReport?.trend ?? []) as EvaluationTrendPoint[];
  const parityRows = evaluationReport?.parity ?? [];

  const applyScope = () => setApplied(draft);
  const resetScope = () => {
    setDraft(DEFAULT_DRAFT);
    setApplied(DEFAULT_DRAFT);
  };
  const focusScope = (slice: ScopeSlice) => {
    const next: ScopeDraft = {
      ...draft,
      teamId: slice.teamId ?? "",
      roomId: slice.roomId ?? "",
      runId: slice.runId ?? "",
      skillId: slice.skillId ?? "",
      userId: "",
    };
    setDraft(next);
    setApplied(next);
  };

  const downloadEvaluationReport = () => {
    if (!evaluationReport) return;
    const blob = new Blob([JSON.stringify(evaluationReport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `context-engine-report-${queryScope.teamId ?? "tenant"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <DashboardCard
        title="Context engine evaluation"
        description="Filter the context-engine stream by team, room, run, skill, or user to inspect retrieval, grounding, freshness, and stale-context health."
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <label
                htmlFor="context-team-id"
                className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
              >
                Team ID
              </label>
              <Input
                id="context-team-id"
                value={draft.teamId}
                onChange={event => setDraft(current => ({ ...current, teamId: event.target.value }))}
                placeholder="team-123"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="context-room-id"
                className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
              >
                Room ID
              </label>
              <Input
                id="context-room-id"
                value={draft.roomId}
                onChange={event => setDraft(current => ({ ...current, roomId: event.target.value }))}
                placeholder="room-123"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="context-run-id"
                className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
              >
                Run ID
              </label>
              <Input
                id="context-run-id"
                value={draft.runId}
                onChange={event => setDraft(current => ({ ...current, runId: event.target.value }))}
                placeholder="run-123"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="context-skill-id"
                className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
              >
                Skill ID
              </label>
              <Input
                id="context-skill-id"
                value={draft.skillId}
                onChange={event => setDraft(current => ({ ...current, skillId: event.target.value }))}
                placeholder="skill-123"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="context-user-id"
                className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
              >
                User ID
              </label>
              <Input
                id="context-user-id"
                value={draft.userId}
                onChange={event => setDraft(current => ({ ...current, userId: event.target.value }))}
                placeholder="42"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label
                  htmlFor="context-window-days"
                  className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
                >
                  Window days
                </label>
                <Input
                  id="context-window-days"
                  type="number"
                  min={1}
                  max={30}
                  value={draft.sinceDays}
                  onChange={event =>
                    setDraft(current => ({ ...current, sinceDays: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="context-limit"
                  className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
                >
                  Limit
                </label>
                <Input
                  id="context-limit"
                  type="number"
                  min={1}
                  max={50}
                  value={draft.limit}
                  onChange={event =>
                    setDraft(current => ({ ...current, limit: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={applyScope} disabled={contextQuery.isLoading}>
              {contextQuery.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Apply scope
            </Button>
            <Button variant="outline" onClick={resetScope} disabled={contextQuery.isLoading}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button variant="outline" onClick={() => void contextQuery.refetch()} disabled={contextQuery.isFetching}>
              {contextQuery.isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
              <Filter className="mr-1 h-3 w-3" />
              {summary?.scope.teamId ? `team ${summary.scope.teamId}` : "tenant"}
            </Badge>
            {summary?.window.latestCreatedAt ? (
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                Latest {new Date(summary.window.latestCreatedAt).toLocaleString()}
              </Badge>
            ) : null}
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        title="Current slice"
        description="The selected scope summary uses the shared context engine health panel so room/run traces and rollups stay consistent with Work OS and Teams."
      >
        <ContextEngineHealthPanel
          summary={summary}
          loading={contextQuery.isLoading}
          error={contextQuery.error?.message ?? null}
          scopeLabel="Context engine"
          emptyMessage="No context-engine checks matched this scope yet."
        />
      </DashboardCard>

      <DashboardCard
        title="Scope slices"
        description="Click a room/run slice to drill into the exact execution trail and compare grounding or retrieval health across runs."
      >
        {scopeBreakdown.length > 0 ? (
          <div className="space-y-2">
            {scopeBreakdown.map(slice => {
              const active =
                draft.teamId.trim() === (slice.teamId ?? "") &&
                draft.roomId.trim() === (slice.roomId ?? "") &&
                draft.runId.trim() === (slice.runId ?? "") &&
                draft.skillId.trim() === (slice.skillId ?? "") &&
                draft.userId.trim() === "";
              return (
                <button
                  key={[
                    slice.teamId ?? "any",
                    slice.roomId ?? "any",
                    slice.runId ?? "any",
                    slice.skillId ?? "any",
                  ].join(":")}
                  type="button"
                  onClick={() => focusScope(slice)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                    active
                      ? "border-cyan-300 bg-cyan-50/70 shadow-sm"
                      : "border-slate-200 bg-white hover:border-cyan-200 hover:bg-cyan-50/40",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatSliceLabel(slice)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {slice.skillId ? `skill ${slice.skillId}` : "skill any"} ·{" "}
                        {slice.count} check{slice.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {slice.latestStatus ?? "unknown"}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        Health {formatScore(slice.latestHealthScore)}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        Grounding {formatScore(slice.latestGroundingScore)}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        Retrieval{" "}
                        {typeof slice.latestRetrievalCoverage === "number"
                          ? `${Math.round(slice.latestRetrievalCoverage * 100)}%`
                          : "n/a"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Latest {slice.latestSource ?? "n/a"} ·{" "}
                    {slice.latestCreatedAt
                      ? new Date(slice.latestCreatedAt).toLocaleString()
                      : "n/a"}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
            No room/run scope slices are available for this filter window.
          </div>
        )}
      </DashboardCard>

      <DashboardCard
        title="Evaluation export"
        description="Compare Chat and Team from the same evaluation dataset, or export a JSON snapshot for offline review."
      >
        {evaluationReportQuery.isLoading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Loading evaluation export…
          </div>
        ) : evaluationReportQuery.error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {evaluationReportQuery.error.message}
          </div>
        ) : evaluationReport ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={downloadEvaluationReport}
                disabled={!evaluationReport}
              >
                <Download className="mr-2 h-4 w-4" />
                Export JSON
              </Button>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                {evaluationReport.records.length} evaluation{evaluationReport.records.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {parityRows.map(row => (
                <div key={row.surface} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {row.surface}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {row.total} check{row.total === 1 ? "" : "s"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    ok {row.ok} · warning {row.warning} · critical {row.critical}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    health {formatScore(row.averageHealthScore)} · grounding {formatScore(row.averageGroundingScore)} · retrieval {formatScore(row.averageRetrievalCoverage)}
                  </p>
                </div>
              ))}
            </div>

            {trendSeries.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Hourly trend buckets
                  </p>
                  <p className="text-xs text-slate-500">
                    Grouped by surface and hour to spot regressions in health, grounding, retrieval, and latency.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Bucket</th>
                        <th className="px-4 py-3">Surface</th>
                        <th className="px-4 py-3">Health</th>
                        <th className="px-4 py-3">Grounding</th>
                        <th className="px-4 py-3">Retrieval</th>
                        <th className="px-4 py-3">Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {trendSeries.slice(0, 12).map(point => (
                        <tr key={`${point.bucket}:${point.surface}`} className="text-slate-700">
                          <td className="px-4 py-3">{point.bucket}</td>
                          <td className="px-4 py-3">{point.surface}</td>
                          <td className="px-4 py-3">{formatScore(point.averageHealthScore)}</td>
                          <td className="px-4 py-3">{formatScore(point.averageGroundingScore)}</td>
                          <td className="px-4 py-3">{formatScore(point.averageRetrievalCoverage)}</td>
                          <td className="px-4 py-3">
                            {typeof point.averageLatencyMs === "number"
                              ? `${Math.round(point.averageLatencyMs)} ms`
                              : "n/a"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-500">
                No trend buckets yet for this scope.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            No export data matched this scope.
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
