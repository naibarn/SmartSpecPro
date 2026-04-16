import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, BookOpen, ClipboardList, Clock3, Copy, Loader2, RefreshCw, ShieldAlert, Layers3 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getStatusBridgeBadgeClass, mapWorkOsStateToTeamRunStatus } from "../../../shared/workStatusBridge";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "n/a";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function stateBadgeClass(state: string): string {
  switch (state) {
    case "completed":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "blocked":
    case "escalated":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "waiting_for_approval":
    case "waiting_for_input":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "in_progress":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

function sourceBadgeClass(source: string): string {
  switch (source) {
    case "role_routine":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "team_run":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "workpack_record":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "legacy_work_item":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "browser_automation":
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case "role_routine":
      return "Role Routine";
    case "team_run":
      return "Team Run";
    case "workpack_record":
      return "Workpack";
    case "legacy_work_item":
      return "Legacy Work Item";
    case "browser_automation":
      return "Browser Automation";
    case "work_os":
      return "Work OS";
    default:
      return source;
  }
}

function sourceDescription(source: string): string {
  switch (source) {
    case "role_routine":
      return "Show role-routine evidence only";
    case "team_run":
      return "Show team-run evidence only";
    case "workpack_record":
      return "Show workpack evidence only";
    case "legacy_work_item":
      return "Show legacy task evidence only";
    case "browser_automation":
      return "Show browser automation evidence only";
    case "work_os":
      return "Show the main Work OS case view";
    default:
      return `Show ${source} evidence only`;
  }
}

function explorationBadgeClass(candidateId: string | null | undefined): string {
  switch (candidateId) {
    case "workflow-first":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "swarm-first":
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
    case "balanced-hybrid":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function finalReviewRecommendationClass(recommendation: string | null | undefined): string {
  switch (recommendation?.toLowerCase()) {
    case "proceed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "revise":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "block":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "review":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function readinessRecordClass(status: string | null | undefined): string {
  switch (status) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "staged":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function buildCasePath(caseId: string, timelineSource?: string | null): string {
  const params = new URLSearchParams();
  params.set("caseId", caseId);
  if (timelineSource) {
    params.set("timelineSource", timelineSource);
  }
  return `/admin/work-os?${params.toString()}`;
}

function copyCaseLink(caseId: string, timelineSource?: string | null, successMessage = "Case link copied"): void {
  const url = `${window.location.origin}${buildCasePath(caseId, timelineSource)}`;
  void navigator.clipboard
    .writeText(url)
    .then(() => {
      toast.success(successMessage);
    })
    .catch(() => {
      toast.error("Could not copy the case link");
    });
}

function getExplorationSummary(detail: Record<string, unknown> | null): {
  selectedCandidateId: string | null;
  selectionReason: string | null;
  candidateCount: number;
  criteria: string[];
} | null {
  if (!detail) return null;

  const exploration =
    (detail.exploration as Record<string, unknown> | undefined)
    ?? ((detail.planArtifact as Record<string, unknown> | undefined)?.exploration as Record<string, unknown> | undefined);
  if (!exploration || typeof exploration !== "object") return null;

  const selectedCandidateId = typeof exploration.selectedCandidateId === "string" ? exploration.selectedCandidateId : null;
  const selectionReason = typeof exploration.selectionReason === "string" ? exploration.selectionReason : null;
  const criteria = Array.isArray(exploration.criteria)
    ? exploration.criteria.filter((item): item is string => typeof item === "string")
    : [];
  const candidates = Array.isArray(exploration.candidates) ? exploration.candidates : [];
  const candidateCount = typeof exploration.candidateCount === "number" && Number.isFinite(exploration.candidateCount)
    ? exploration.candidateCount
    : candidates.length;

  if (!selectedCandidateId && !selectionReason && criteria.length === 0 && candidates.length === 0) {
    return null;
  }

  return {
    selectedCandidateId,
    selectionReason,
    candidateCount,
    criteria,
  };
}

function timelineSummary(entry: {
  source: string;
  eventType: string;
  detailJson: Record<string, unknown> | null;
}): string {
  const detail = entry.detailJson ?? {};
  const verificationGate = detail.verificationGate as Record<string, unknown> | undefined;
  const gateReason = typeof verificationGate?.reason === "string" ? verificationGate.reason.trim() : null;
  const gateStatus = typeof verificationGate?.status === "string" ? verificationGate.status.trim() : null;
  const exploration = getExplorationSummary(detail);
  const finalReview = detail.finalReview as Record<string, unknown> | undefined;
  const traceEnvelope = detail.traceEnvelope as Record<string, unknown> | undefined;
  const traceId = typeof detail.traceId === "string" ? detail.traceId : (typeof traceEnvelope?.traceId === "string" ? traceEnvelope.traceId : null);
  const readinessRecord = detail.readinessRecord as Record<string, unknown> | undefined;
  const finalReviewSummary = finalReview
    ? [
        typeof finalReview.reviewerPersona === "string" ? `reviewer ${finalReview.reviewerPersona}` : null,
        typeof finalReview.score === "number" ? `score ${finalReview.score.toFixed(2)}` : null,
        typeof finalReview.recommendation === "string" ? finalReview.recommendation : null,
      ].filter(Boolean).join(" · ")
    : null;

  if (entry.source === "role_routine") {
    const routineId = typeof detail.routineId === "string" ? detail.routineId : null;
    const routineRunId = typeof detail.routineRunId === "string" ? detail.routineRunId : null;
    const workpackFamily = typeof detail.selectedWorkpackFamily === "string" ? detail.selectedWorkpackFamily : null;
    const parts = [routineId ? `routine ${routineId}` : null, routineRunId ? `run ${routineRunId}` : null, workpackFamily ? `family ${workpackFamily}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Role routine evidence";
  }

  if (entry.source === "team_run") {
    const runId = typeof detail.runId === "string" ? detail.runId : null;
    const status = typeof detail.status === "string" ? detail.status : null;
    const teamId = typeof detail.teamId === "string" ? detail.teamId : null;
    const parts = [runId ? `run ${runId}` : null, teamId ? `team ${teamId}` : null, status ? `status ${status}` : null].filter(Boolean);
    if (exploration) {
      parts.push("exploration");
      if (exploration.selectedCandidateId) {
        parts.push(`selected ${exploration.selectedCandidateId}`);
      }
      parts.push(`${exploration.candidateCount} candidates`);
    }
    if (gateStatus || gateReason) {
      parts.push(gateStatus ? `gate ${gateStatus}` : "gate");
      if (gateReason) parts.push(gateReason);
    }
    if (finalReviewSummary) {
      parts.push("final review");
      parts.push(finalReviewSummary);
    }
    if (traceId) {
      parts.push(`trace ${traceId.slice(0, 12)}`);
    }
    if (readinessRecord && typeof readinessRecord.status === "string") {
      parts.push(`readiness ${readinessRecord.status}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Team run evidence";
  }

  if (entry.source === "workpack_record") {
    const recordType = typeof detail.recordType === "string" ? detail.recordType : null;
    const workpackId = typeof detail.workpackId === "string" ? detail.workpackId : null;
    const recordId = typeof detail.recordId === "string" ? detail.recordId : null;
    const parts = [recordType, workpackId ? `workpack ${workpackId}` : null, recordId ? `record ${recordId}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Workpack evidence";
  }

  if (entry.source === "legacy_work_item") {
    const status = typeof detail.taskStatus === "string" ? detail.taskStatus : null;
    const eventTypeLabel = entry.eventType.replaceAll("_", " ");
    const parts = [status ? `task ${status}` : null, eventTypeLabel].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Legacy task evidence";
  }

  if (entry.source === "browser_automation") {
    const taskId = typeof detail.taskId === "string" ? detail.taskId : null;
    const status = typeof detail.status === "string" ? detail.status : null;
    const executionId = typeof detail.executionId === "string" ? detail.executionId : null;
    const parts = [taskId ? `task ${taskId}` : null, executionId ? `exec ${executionId}` : null, status ? `status ${status}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Browser automation evidence";
  }

  if (entry.source === "work_os") {
    const parts = [entry.eventType.replaceAll("_", " ")];
    if (typeof detail.sourceType === "string") parts.push(detail.sourceType);
    if (typeof detail.teamId === "string") parts.push(`team ${detail.teamId}`);
    if (gateStatus || gateReason) {
      parts.push(gateStatus ? `gate ${gateStatus}` : "gate");
      if (gateReason) parts.push(gateReason);
    }
    if (traceId) {
      parts.push(`trace ${traceId.slice(0, 12)}`);
    }
    return parts.join(" · ");
  }

  return entry.eventType.replaceAll("_", " ");
}

function automationModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case "manual_assist":
      return "Manual assist";
    case "semi_auto":
      return "Semi-auto";
    case "fully_auto":
      return "Fully auto";
    default:
      return mode ?? "n/a";
  }
}

function automationModeBadgeClass(mode: string | null | undefined): string {
  switch (mode) {
    case "manual_assist":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "semi_auto":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "fully_auto":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function automationStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
    case "pending":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "waiting_for_input":
    case "waiting_for_approval":
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "failed":
    case "cancelled":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function checkpointStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "resumed":
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "open":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "cancelled":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default function AdminWorkOsDashboard() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const selectedCaseIdFromUrl = urlParams.get("caseId");
  const timelineSourceFromUrl = urlParams.get("timelineSource");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(selectedCaseIdFromUrl);
  const [timelineSourceFilter, setTimelineSourceFilter] = useState<string | null>(timelineSourceFromUrl);
  const [explorationOnlyFilter, setExplorationOnlyFilter] = useState(false);
  const [showRawTimelineJson, setShowRawTimelineJson] = useState(false);

  const selectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    params.set("caseId", caseId);
    if (timelineSourceFilter) {
      params.set("timelineSource", timelineSourceFilter);
    } else {
      params.delete("timelineSource");
    }
    setLocation(`/admin/work-os?${params.toString()}`, { replace: true });
  };

  const selectTimelineSource = (source: string | null) => {
    setTimelineSourceFilter(source);
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    if (source) {
      params.set("timelineSource", source);
    } else {
      params.delete("timelineSource");
    }
    if (selectedCaseId) {
      params.set("caseId", selectedCaseId);
    }
    setLocation(`/admin/work-os?${params.toString()}`, { replace: true });
  };

  useEffect(() => {
    setSelectedCaseId(selectedCaseIdFromUrl);
  }, [selectedCaseIdFromUrl]);

  useEffect(() => {
    setTimelineSourceFilter(timelineSourceFromUrl);
  }, [timelineSourceFromUrl]);

  const overviewQuery = trpc.workOs.overview.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const inboxQuery = trpc.workOs.inbox.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const caseQuery = trpc.workOs.getCase.useQuery(
    selectedCaseId ? { caseId: selectedCaseId } : skipToken,
    { refetchInterval: 15_000 },
  );
  const resumeAutomationCheckpointMutation = trpc.workOs.resumeAutomationCheckpoint.useMutation({
    onSuccess: async () => {
      toast.success("Automation checkpoint resumed");
      await caseQuery.refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to resume automation checkpoint");
    },
  });

  useEffect(() => {
    if (!selectedCaseId && inboxQuery.data?.[0]?.id) {
      const nextId = inboxQuery.data[0].id;
      selectCase(nextId);
    }
  }, [inboxQuery.data, selectedCaseId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "domain_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <DashboardCard className="w-full max-w-md" title="Access Denied" description="Work OS is available to admin and domain admin operators only." />
      </div>
    );
  }

  const selectedCase = caseQuery.data?.case ?? null;
  const assignment = caseQuery.data?.assignments?.[0] ?? null;
  const automation = caseQuery.data?.automation ?? null;
  const automationRun = automation?.run ?? null;
  const automationLatestStep = automation?.steps?.[0] ?? null;
  const automationLatestCheckpoint = automation?.checkpoints?.[0] ?? null;
  const automationLatestEvent = automation?.events?.[0] ?? null;
  const timeline = caseQuery.data?.timeline ?? [];
  const latestTeamRunExploration = useMemo(() => {
    for (const entry of timeline) {
      if (entry.source !== "team_run") continue;
      const exploration = getExplorationSummary(entry.detailJson);
      if (exploration) return exploration;
    }
    return null;
  }, [timeline]);
  const selectedCaseBridgeStatus = selectedCase ? mapWorkOsStateToTeamRunStatus(selectedCase.currentState) : null;
  const timelineSourceOptions = useMemo(
    () => Array.from(new Set(timeline.map((entry) => entry.source))).sort(),
    [timeline],
  );
  const inboxCases = useMemo(() => {
    const items = inboxQuery.data ?? [];
    if (!explorationOnlyFilter) return items;
    return items.filter((item) => item.latestExploration);
  }, [explorationOnlyFilter, inboxQuery.data]);
  const selectedInboxCase = useMemo(
    () => inboxCases.find((item) => item.id === selectedCase?.id) ?? null,
    [inboxCases, selectedCase?.id],
  );
  const filteredTimeline = timelineSourceFilter
    ? timeline.filter((entry) => entry.source === timelineSourceFilter)
    : timeline;

  useEffect(() => {
    if (!timelineSourceFilter || filteredTimeline.length === 0) {
      return;
    }

    const firstEntry = filteredTimeline[0];
    const target = document.getElementById(`timeline-${firstEntry.source}-${firstEntry.id}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filteredTimeline, timelineSourceFilter]);

  useEffect(() => {
    if (selectedCaseIdFromUrl === selectedCaseId) {
      return;
    }
    if (selectedCaseIdFromUrl) {
      setSelectedCaseId(selectedCaseIdFromUrl);
    }
  }, [selectedCaseId, selectedCaseIdFromUrl]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/admin/monitoring")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Monitoring
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <ClipboardList className="h-6 w-6" />
                Work OS Console
              </h1>
              <p className="text-sm text-muted-foreground">Inbox, case timeline, ownership history, and live risk state</p>
              <p className="mt-1 text-xs text-slate-500">
                Bookmarkable links keep `caseId` and `timelineSource` in the URL so you can return to the same
                evidence slice later.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                  `work_os` = main case view
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                  `role_routine` = role routine evidence
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                  `team_run` = team run evidence
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                  `workpack_record` = workpack evidence
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation("/help/work-os")}>
              <BookOpen className="mr-1 h-4 w-4" />
              Open guide
            </Button>
            <Button variant="outline" size="sm" onClick={() => overviewQuery.refetch()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh overview
            </Button>
            <Button variant="outline" size="sm" onClick={() => inboxQuery.refetch()}>
              <Layers3 className="mr-1 h-4 w-4" />
              Refresh inbox
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/admin/queues")}>
              Queue dashboard
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <DashboardKpiCard icon={ClipboardList} label="Completed" value={overviewQuery.data?.completed ?? 0} />
          <DashboardKpiCard icon={Clock3} label="Overdue SLA" value={overviewQuery.data?.overdueSla ?? 0} valueClassName="text-amber-600" />
          <DashboardKpiCard icon={ShieldAlert} label="Open Exceptions" value={overviewQuery.data?.openExceptions ?? 0} valueClassName="text-rose-600" />
          <DashboardKpiCard icon={Layers3} label="States" value={Object.keys(overviewQuery.data?.byState ?? {}).length} />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
          <DashboardCard title="Work Inbox" description="Tenant-scoped queue of open business work">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={explorationOnlyFilter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExplorationOnlyFilter((current) => !current)}
                >
                  {explorationOnlyFilter ? "Exploration only" : "Show exploration-backed"}
                </Button>
                <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                  {inboxCases.filter((item) => item.latestExploration).length} with exploration
                </Badge>
              </div>
              {inboxCases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No work cases are available yet.</p>
              ) : (
                inboxCases.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectCase(item.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition hover:border-sky-300",
                      selectedCaseId === item.id ? "border-sky-400 bg-sky-50/60" : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="text-sm text-slate-600">Case {item.id}</p>
                        <p className={cn("mt-1 text-[10px] font-medium", getStatusBridgeBadgeClass(item.currentState as any))}>
                          Bridge: {mapWorkOsStateToTeamRunStatus(item.currentState)}
                        </p>
                        {item.latestExploration ? (
                          <Badge variant="outline" className={cn("mt-2 text-[10px] font-medium", explorationBadgeClass(item.latestExploration.selectedCandidateId))}>
                            Exploration: {item.latestExploration.selectedCandidateId}
                          </Badge>
                        ) : null}
                        {item.latestFinalReview ? (
                          <div className="mt-2 space-y-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-medium",
                                finalReviewRecommendationClass(item.latestFinalReview.recommendation),
                              )}
                              title="Final review recommendation"
                            >
                              Final review: {item.latestFinalReview.recommendation ?? "n/a"}
                            </Badge>
                            <p className="text-[11px] text-slate-500">
                              Reviewer {item.latestFinalReview.reviewerPersona ?? "n/a"} · Score{" "}
                              {item.latestFinalReview.score != null ? item.latestFinalReview.score.toFixed(2) : "n/a"}
                            </p>
                          </div>
                        ) : null}
                        {item.latestTraceId ? (
                          <Badge variant="outline" className="mt-2 border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-700">
                            Trace: {item.latestTraceId.slice(0, 12)}
                          </Badge>
                        ) : null}
                        {item.latestReadiness ? (
                          <div className="mt-2 space-y-1">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] font-medium", readinessRecordClass(item.latestReadiness.status))}
                              title="Latest enterprise readiness record"
                            >
                              Readiness: {item.latestReadiness.status}
                            </Badge>
                            <p className="text-[11px] text-slate-500">
                              Score {item.latestReadiness.score.toFixed(2)} · {item.latestReadiness.reason}
                            </p>
                          </div>
                        ) : null}
                        {item.latestContext ? (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Context: {item.latestContext.summary}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="outline" className={cn("capitalize", stateBadgeClass(item.currentState))}>
                        {item.currentState}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span>Owner: {item.ownerType ?? "unassigned"}{item.ownerId ? ` / ${item.ownerId}` : ""}</span>
                      <span>Priority: {item.priority}</span>
                      <span>Risk: {item.riskLevel}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </DashboardCard>

          <DashboardCard title="Selected Case" description="Assignment history, exceptions, outcomes, SLA, and timeline evidence">
            {!selectedCase ? (
              <p className="text-sm text-muted-foreground">Select a case from the inbox to inspect the full lifecycle.</p>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">Case {selectedCase.id}</p>
                      <h2 className="text-lg font-semibold text-slate-900">{selectedCase.title}</h2>
                      {selectedCase.summary ? <p className="mt-1 text-sm text-slate-600">{selectedCase.summary}</p> : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline" className={stateBadgeClass(selectedCase.currentState)}>
                        {selectedCase.currentState}
                      </Badge>
                      {selectedCaseBridgeStatus ? (
                        <Badge variant="secondary" className={cn("capitalize", getStatusBridgeBadgeClass(selectedCase.currentState))}>
                          Bridge: {selectedCaseBridgeStatus}
                        </Badge>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const url = `${window.location.origin}${location}`;
                          try {
                            await navigator.clipboard.writeText(url);
                            toast.success("Case link copied");
                          } catch {
                            toast.error("Could not copy the case link");
                          }
                        }}
                      >
                        <Copy className="mr-1 h-4 w-4" />
                        Copy permalink
                      </Button>
                    </div>
                  </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500">Owner</p>
                      <p className="font-medium text-slate-900">
                        {selectedCase.ownerType ?? "unassigned"}
                        {selectedCase.ownerId ? ` / ${selectedCase.ownerId}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Primary task</p>
                      <p className="font-medium text-slate-900">{selectedCase.primaryTaskId ?? "n/a"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Created</p>
                      <p className="font-medium text-slate-900">{formatDate(selectedCase.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Updated</p>
                      <p className="font-medium text-slate-900">{formatDate(selectedCase.updatedAt)}</p>
                    </div>
                  </div>

                {selectedInboxCase?.latestExploration ? (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Inbox exploration</p>
                        <Badge variant="outline" className={cn("border-violet-200 bg-white text-violet-700", explorationBadgeClass(selectedInboxCase.latestExploration.selectedCandidateId))}>
                          Selected: {selectedInboxCase.latestExploration.selectedCandidateId}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                          {selectedInboxCase.latestExploration.candidateCount} candidates
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{selectedInboxCase.latestExploration.selectionReason}</p>
                    </div>
                  ) : null}

                {selectedInboxCase?.latestFinalReview ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Final review</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-medium",
                            finalReviewRecommendationClass(selectedInboxCase.latestFinalReview.recommendation),
                          )}
                          title="Final review recommendation"
                        >
                          {selectedInboxCase.latestFinalReview.recommendation ?? "n/a"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        Reviewer {selectedInboxCase.latestFinalReview.reviewerPersona ?? "n/a"} · Score{" "}
                        {selectedInboxCase.latestFinalReview.score != null
                          ? selectedInboxCase.latestFinalReview.score.toFixed(2)
                          : "n/a"}
                      </p>
                      {selectedInboxCase.latestFinalReview.comment ? (
                        <p className="mt-1 text-sm text-slate-600">{selectedInboxCase.latestFinalReview.comment}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedInboxCase?.latestTraceId || selectedInboxCase?.latestReadiness || selectedInboxCase?.latestContext ? (
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">Enterprise context</p>
                        {selectedInboxCase.latestTraceId ? (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-700">
                            Trace: {selectedInboxCase.latestTraceId.slice(0, 12)}
                          </Badge>
                        ) : null}
                        {selectedInboxCase.latestReadiness ? (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] font-medium", readinessRecordClass(selectedInboxCase.latestReadiness.status))}
                          >
                            Readiness: {selectedInboxCase.latestReadiness.status}
                          </Badge>
                        ) : null}
                      </div>
                      {selectedInboxCase.latestContext ? (
                        <p className="mt-2 text-sm text-slate-600">{selectedInboxCase.latestContext.summary}</p>
                      ) : null}
                      {selectedInboxCase.latestReadiness ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Score {selectedInboxCase.latestReadiness.score.toFixed(2)} · {selectedInboxCase.latestReadiness.reason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <Tabs defaultValue="summary" className="space-y-4">
                  <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="evidence">Evidence</TabsTrigger>
                    <TabsTrigger value="raw">Raw</TabsTrigger>
                  </TabsList>

                  <TabsContent value="summary" className="space-y-6">
                    {automationRun ? (
                  <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Automation Run Summary</p>
                        <p className="text-xs text-slate-600">
                          Current mode, step, checkpoint, and disposition for this case.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("capitalize", automationModeBadgeClass(automationRun.currentMode))}>
                          {automationModeLabel(automationRun.currentMode)}
                        </Badge>
                        <Badge variant="outline" className={cn("capitalize", automationStatusBadgeClass(automationRun.status))}>
                          {automationRun.status.replaceAll("_", " ")}
                        </Badge>
                        {automationRun.templateFamily ? (
                          <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                            {automationRun.templateFamily}
                          </Badge>
                        ) : null}
                        {automationRun.templateSource ? (
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                            {automationRun.templateSource.replaceAll("_", " ")}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-cyan-100 bg-white p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Run</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">{automationRun.title}</p>
                        <p className="text-xs text-slate-600">{automationRun.objective ?? "No objective recorded"}</p>
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-white p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Current step</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {automationLatestStep ? automationLatestStep.title : "n/a"}
                        </p>
                        <p className="text-xs text-slate-600">
                          {automationLatestStep ? `${automationLatestStep.stepKey} · ${automationLatestStep.surface}` : "No step recorded yet"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-white p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Checkpoint</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {automationLatestCheckpoint ? automationLatestCheckpoint.checkpointKey : "n/a"}
                        </p>
                        {automationLatestCheckpoint ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline" className={cn("capitalize", automationStatusBadgeClass(automationLatestCheckpoint.approvalState))}>
                              {automationLatestCheckpoint.approvalState}
                            </Badge>
                            <Badge variant="outline" className={cn("capitalize", checkpointStatusBadgeClass(automationLatestCheckpoint.checkpointStatus))}>
                              {automationLatestCheckpoint.checkpointStatus}
                            </Badge>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600">No checkpoint recorded yet</p>
                        )}
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-white p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Disposition</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {automationRun.finalDisposition ?? "n/a"}
                        </p>
                        <p className="text-xs text-slate-600">
                          Updated {formatDate(automationRun.updatedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm">
                      <div>
                        <p className="text-slate-500">Mode source</p>
                        <p className="font-medium text-slate-900">{automationRun.templateSource ?? "n/a"}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Steps</p>
                        <p className="font-medium text-slate-900">{automation?.steps.length ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Checkpoints</p>
                        <p className="font-medium text-slate-900">{automation?.checkpoints.length ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Events</p>
                        <p className="font-medium text-slate-900">{automation?.events.length ?? 0}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!automationLatestCheckpoint) return;
                          resumeAutomationCheckpointMutation.mutate({
                            caseId: selectedCase.id,
                            runId: automationRun.id,
                            checkpointId: automationLatestCheckpoint.id,
                          });
                        }}
                        disabled={
                          !automationLatestCheckpoint
                          || automationLatestCheckpoint.checkpointStatus === "resumed"
                          || automationLatestCheckpoint.checkpointStatus === "cancelled"
                          || resumeAutomationCheckpointMutation.isPending
                        }
                      >
                        {resumeAutomationCheckpointMutation.isPending ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-4 w-4" />
                        )}
                        Resume checkpoint
                      </Button>
                      {automationLatestEvent ? (
                        <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                          Latest event: {automationLatestEvent.eventType.replaceAll("_", " ")}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                    ) : (
                  <div className="rounded-2xl border border-dashed border-cyan-100 bg-cyan-50/40 p-4 text-sm text-slate-600">
                    No automation run recorded yet for this case.
                  </div>
                    )}

                    {latestTeamRunExploration ? (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">Planning exploration</p>
                      <Badge variant="outline" className="border-violet-200 bg-white text-violet-700">
                        Selected: {latestTeamRunExploration.selectedCandidateId ?? "n/a"}
                      </Badge>
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                        {latestTeamRunExploration.candidateCount} candidates
                      </Badge>
                    </div>
                    {latestTeamRunExploration.selectionReason ? (
                      <p className="mt-2 text-sm text-slate-600">{latestTeamRunExploration.selectionReason}</p>
                    ) : null}
                    {latestTeamRunExploration.criteria.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Criteria: {latestTeamRunExploration.criteria.join(", ")}
                      </p>
                    ) : null}
                  </div>
                    ) : null}

                    {assignment ? (
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Latest assignment</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {assignment.previousOwnerType ?? "none"}{assignment.previousOwnerId ? ` / ${assignment.previousOwnerId}` : ""} → {assignment.ownerType}{assignment.ownerId ? ` / ${assignment.ownerId}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {assignment.assignmentSource} • {formatDate(assignment.createdAt)}
                    </p>
                    {assignment.reason ? <p className="mt-2 text-sm text-slate-600">{assignment.reason}</p> : null}
                  </div>
                    ) : null}

                    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Share current view</p>
                      <p className="text-xs text-slate-600">
                        This permalink keeps the selected case and active timeline source together.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                        Case {selectedCase.id}
                      </Badge>
                      <Badge variant="outline" className="border-sky-200 bg-white text-sky-700">
                        {timelineSourceFilter ? sourceLabel(timelineSourceFilter) : "All sources"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(`${window.location.origin}${location}`);
                            toast.success("Current permalink copied");
                          } catch {
                            toast.error("Could not copy the current permalink");
                          }
                        }}
                      >
                        <Copy className="mr-1 h-4 w-4" />
                        Copy permalink
                      </Button>
                    </div>
                  </div>
                    </div>
                  </TabsContent>

                <TabsContent value="evidence" className="space-y-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Approvals</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.approvals ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No approvals recorded.</p>
                      ) : (
                        caseQuery.data!.approvals.map((approval) => (
                          <div key={approval.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{approval.approvalStatus}</span>
                              <span className="text-xs text-slate-500">{formatDate(approval.createdAt)}</span>
                            </div>
                            {approval.comment ? <p className="mt-1 text-slate-600">{approval.comment}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Exceptions</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.exceptions ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No exceptions recorded.</p>
                      ) : (
                        caseQuery.data!.exceptions.map((exception) => (
                          <div key={exception.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{exception.exceptionType}</span>
                              <Badge variant="outline">{exception.status}</Badge>
                            </div>
                            <p className="mt-1 text-slate-600">{exception.reason ?? "No reason"}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">Outcomes</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.outcomes ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No outcomes recorded.</p>
                      ) : (
                        caseQuery.data!.outcomes.map((outcome) => (
                          <div key={outcome.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{outcome.disposition}</span>
                              <span className="text-xs text-slate-500">{formatDate(outcome.createdAt)}</span>
                            </div>
                            {outcome.summary ? <p className="mt-1 text-slate-600">{outcome.summary}</p> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">SLA</p>
                    <div className="mt-3 space-y-3">
                      {(caseQuery.data?.slas ?? []).length === 0 ? (
                        <p className="text-sm text-slate-500">No SLA records yet.</p>
                      ) : (
                        caseQuery.data!.slas.map((sla) => (
                          <div key={sla.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-slate-900">{sla.breachState}</span>
                              <span className="text-xs text-slate-500">{formatDate(sla.createdAt)}</span>
                            </div>
                            <p className="mt-1 text-slate-600">
                              Due {formatDate(sla.dueAt)} • policy {sla.policyId ?? "n/a"}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Timeline</p>
                    <div className="flex items-center gap-2">
                      {timelineSourceFilter ? (
                        <Button variant="ghost" size="sm" onClick={() => selectTimelineSource(null)}>
                          Clear filter
                        </Button>
                      ) : null}
                      {timelineSourceFilter ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const firstEntry = filteredTimeline[0];
                            if (!firstEntry) return;
                            const target = document.getElementById(`timeline-${firstEntry.source}-${firstEntry.id}`);
                            target?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          Jump to first
                        </Button>
                      ) : null}
                      <p className="text-xs text-slate-500">{filteredTimeline.length} of {timeline.length} entries</p>
                    </div>
                  </div>
                  {timelineSourceOptions.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant={timelineSourceFilter ? "outline" : "default"}
                        size="sm"
                        onClick={() => selectTimelineSource(null)}
                      >
                        All sources
                      </Button>
                      {timelineSourceOptions.map((source) => (
                        <div key={source} className="flex items-center gap-2">
                          <Button
                            variant={timelineSourceFilter === source ? "default" : "outline"}
                            size="sm"
                            onClick={() => selectTimelineSource(source)}
                            title={sourceDescription(source)}
                          >
                            {sourceLabel(source)}
                          </Button>
                          {selectedCaseId ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Copy ${sourceLabel(source).toLowerCase()} evidence`}
                              onClick={() => copyCaseLink(selectedCaseId, source, `${sourceLabel(source)} link copied`)}
                              title={`Copy ${sourceLabel(source)} link`}
                            >
                              <Copy className="mr-1 h-4 w-4" />
                              Copy {sourceLabel(source).toLowerCase()} evidence
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                    <p className="font-medium text-slate-800">Timeline source glossary</p>
                    <p className="mt-1">
                      `work_os` is the main case stream. `role_routine`, `team_run`, and `workpack_record`
                      jump to evidence slices. Open the
                      {" "}
                      <button
                        type="button"
                        className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-800"
                        onClick={() => setLocation("/help/work-os")}
                      >
                        Open guide
                      </button>
                      {" "}
                      for permalink examples and source definitions.
                    </p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {filteredTimeline.length === 0 ? (
                      <p className="text-sm text-slate-500">No timeline entries available.</p>
                    ) : (
                      filteredTimeline.map((entry) => (
                        <div
                          key={`${entry.source}-${entry.id}`}
                          id={`timeline-${entry.source}-${entry.id}`}
                          className="rounded-xl border border-slate-200 p-3 text-sm"
                        >
                          {entry.source === "team_run" && entry.detailJson?.finalReview ? (() => {
                            const finalReview = entry.detailJson.finalReview as Record<string, unknown>;
                            const recommendation = typeof finalReview.recommendation === "string" ? finalReview.recommendation : null;
                            const reviewerPersona = typeof finalReview.reviewerPersona === "string" ? finalReview.reviewerPersona : null;
                            const score = typeof finalReview.score === "number" ? finalReview.score : null;
                            const comment = typeof finalReview.comment === "string" ? finalReview.comment : null;
                            return (
                              <div className="mb-2 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px] font-medium",
                                      finalReviewRecommendationClass(recommendation),
                                    )}
                                    title="Final review recommendation"
                                  >
                                    Final review: {recommendation ?? "n/a"}
                                  </Badge>
                                  <span className="text-[11px] text-slate-500">
                                    Reviewer {reviewerPersona ?? "n/a"} · Score {score != null ? score.toFixed(2) : "n/a"}
                                  </span>
                                </div>
                                {comment ? <p className="text-[11px] text-slate-500">Comment: {comment}</p> : null}
                              </div>
                            );
                          })() : null}
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-900">{entry.eventType.replaceAll("_", " ")}</span>
                              <Badge variant="outline" className={cn("text-xs font-medium", sourceBadgeClass(entry.source))}>
                                {sourceLabel(entry.source)}
                              </Badge>
                            </div>
                            <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-700">{timelineSummary(entry)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                  </TabsContent>

                  <TabsContent value="raw" className="space-y-6">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Raw timeline payloads</p>
                          <p className="text-xs text-slate-600">
                            Use this layer when you need the full event payload without the curated summary view.
                          </p>
                        </div>
                        <Button
                          variant={showRawTimelineJson ? "default" : "outline"}
                          size="sm"
                          onClick={() => setShowRawTimelineJson((current) => !current)}
                        >
                          {showRawTimelineJson ? "Hide raw JSON" : "Show raw JSON"}
                        </Button>
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">Raw layer guidance</p>
                        <p className="mt-1">
                          This tab is intentionally verbose and intended for operators or engineers who need to inspect
                          the source payloads behind the summary and evidence views.
                        </p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {filteredTimeline.length === 0 ? (
                          <p className="text-sm text-slate-500">No timeline entries available.</p>
                        ) : (
                          filteredTimeline.map((entry) => (
                            <div
                              key={`raw-${entry.source}-${entry.id}`}
                              className="rounded-xl border border-slate-200 p-3 text-sm"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-slate-900">{entry.eventType.replaceAll("_", " ")}</span>
                                  <Badge variant="outline" className={cn("text-xs font-medium", sourceBadgeClass(entry.source))}>
                                    {sourceLabel(entry.source)}
                                  </Badge>
                                </div>
                                <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">{timelineSummary(entry)}</p>
                              {showRawTimelineJson && entry.detailJson ? (
                                <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                                  {JSON.stringify(entry.detailJson, null, 2)}
                                </pre>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">Toggle raw JSON to inspect the underlying payload.</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
