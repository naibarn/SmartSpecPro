import { useEffect, useMemo, useState } from "react";
import { skipToken } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardList,
  Clock3,
  Copy,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Layers3,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DashboardCard, DashboardKpiCard } from "@/components/dashboard";
import { ContextEngineHealthPanel } from "@/components/orchestrator/ContextEngineHealthPanel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getStatusBridgeBadgeClass,
  mapWorkOsStateToTeamRunStatus,
} from "../../../shared/workStatusBridge";
import { getExecutionRouteBadge } from "../components/orchestrator/executionRouteBadge";

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
    case "context_engine":
      return "border-cyan-200 bg-cyan-50 text-cyan-700";
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
    case "context_engine":
      return "Context Engine";
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
    case "context_engine":
      return "Show context-engine traces only";
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

function finalReviewRecommendationClass(
  recommendation: string | null | undefined
): string {
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

const CONTEXT_ENGINE_TREND_COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#10b981",
  "#f97316",
  "#14b8a6",
];

function abbreviateIdentifier(value: string | null | undefined): string {
  if (!value) return "any";
  if (value.length <= 10) return value;
  return `${value.slice(0, 8)}…`;
}

function formatContextEngineScopeLabel(scope: {
  teamId: string | null;
  roomId: string | null;
  runId: string | null;
}): string {
  return [
    `team ${abbreviateIdentifier(scope.teamId)}`,
    `room ${abbreviateIdentifier(scope.roomId)}`,
    `run ${abbreviateIdentifier(scope.runId)}`,
  ].join(" · ");
}

function scoreToPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCasePath(caseId: string, timelineSource?: string | null): string {
  const params = new URLSearchParams();
  params.set("caseId", caseId);
  if (timelineSource) {
    params.set("timelineSource", timelineSource);
  }
  return `/admin/work-os?${params.toString()}`;
}

function buildTeamRoomPath(
  teamId?: string | null,
  roomId?: string | null,
  panel?: "chat" | "workflow" | "run"
): string {
  if (!teamId) return "/teams";
  const params = new URLSearchParams();
  if (roomId) {
    params.set("roomId", roomId);
  }
  if (panel) {
    params.set("panel", panel);
  }
  const query = params.toString();
  return query ? `/teams/${teamId}?${query}` : `/teams/${teamId}`;
}

function buildWorkRequestPath(requestId?: string | null): string {
  if (!requestId) return "/work/request";
  return `/work/request?requestId=${encodeURIComponent(requestId)}`;
}

function buildContextEngineMonitoringPath(scope?: {
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("tab", "context");
  if (scope?.teamId) {
    params.set("teamId", scope.teamId);
  }
  if (scope?.roomId) {
    params.set("roomId", scope.roomId);
  }
  if (scope?.runId) {
    params.set("runId", scope.runId);
  }
  const query = params.toString();
  return query ? `/admin/monitoring?${query}` : "/admin/monitoring?tab=context";
}

function copyCaseLink(
  caseId: string,
  timelineSource?: string | null,
  successMessage = "Case link copied"
): void {
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
    (detail.exploration as Record<string, unknown> | undefined) ??
    ((detail.planArtifact as Record<string, unknown> | undefined)
      ?.exploration as Record<string, unknown> | undefined);
  if (!exploration || typeof exploration !== "object") return null;

  const selectedCandidateId =
    typeof exploration.selectedCandidateId === "string"
      ? exploration.selectedCandidateId
      : null;
  const selectionReason =
    typeof exploration.selectionReason === "string"
      ? exploration.selectionReason
      : null;
  const criteria = Array.isArray(exploration.criteria)
    ? exploration.criteria.filter(
        (item): item is string => typeof item === "string"
      )
    : [];
  const candidates = Array.isArray(exploration.candidates)
    ? exploration.candidates
    : [];
  const candidateCount =
    typeof exploration.candidateCount === "number" &&
    Number.isFinite(exploration.candidateCount)
      ? exploration.candidateCount
      : candidates.length;

  if (
    !selectedCandidateId &&
    !selectionReason &&
    criteria.length === 0 &&
    candidates.length === 0
  ) {
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
  const verificationGate = detail.verificationGate as
    | Record<string, unknown>
    | undefined;
  const gateReason =
    typeof verificationGate?.reason === "string"
      ? verificationGate.reason.trim()
      : null;
  const gateStatus =
    typeof verificationGate?.status === "string"
      ? verificationGate.status.trim()
      : null;
  const exploration = getExplorationSummary(detail);
  const finalReview = detail.finalReview as Record<string, unknown> | undefined;
  const traceEnvelope = detail.traceEnvelope as
    | Record<string, unknown>
    | undefined;
  const traceId =
    typeof detail.traceId === "string"
      ? detail.traceId
      : typeof traceEnvelope?.traceId === "string"
        ? traceEnvelope.traceId
        : null;
  const readinessRecord = detail.readinessRecord as
    | Record<string, unknown>
    | undefined;
  const runtimeMetadata =
    (detail.runtimeMetadata as Record<string, unknown> | undefined) ??
    ((detail.metadata as Record<string, unknown> | undefined)
      ?.runtimeMetadata as Record<string, unknown> | undefined);
  const selectedSkillId =
    typeof runtimeMetadata?.selectedSkillId === "string"
      ? runtimeMetadata.selectedSkillId
      : null;
  const routeReason =
    typeof runtimeMetadata?.routeReason === "string"
      ? runtimeMetadata.routeReason
      : null;
  const routeLabel =
    typeof runtimeMetadata?.route === "string" ? runtimeMetadata.route : null;
  const finalReviewSummary = finalReview
    ? [
        typeof finalReview.reviewerPersona === "string"
          ? `reviewer ${finalReview.reviewerPersona}`
          : null,
        typeof finalReview.score === "number"
          ? `score ${finalReview.score.toFixed(2)}`
          : null,
        typeof finalReview.recommendation === "string"
          ? finalReview.recommendation
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  if (entry.source === "role_routine") {
    const routineId =
      typeof detail.routineId === "string" ? detail.routineId : null;
    const routineRunId =
      typeof detail.routineRunId === "string" ? detail.routineRunId : null;
    const workpackFamily =
      typeof detail.selectedWorkpackFamily === "string"
        ? detail.selectedWorkpackFamily
        : null;
    const parts = [
      routineId ? `routine ${routineId}` : null,
      routineRunId ? `run ${routineRunId}` : null,
      workpackFamily ? `family ${workpackFamily}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Role routine evidence";
  }

  if (entry.source === "team_run") {
    const runId = typeof detail.runId === "string" ? detail.runId : null;
    const status = typeof detail.status === "string" ? detail.status : null;
    const teamId = typeof detail.teamId === "string" ? detail.teamId : null;
    const parts = [
      runId ? `run ${runId}` : null,
      teamId ? `team ${teamId}` : null,
      status ? `status ${status}` : null,
    ].filter(Boolean);
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
    if (selectedSkillId) {
      parts.push(`skill ${selectedSkillId}`);
      if (routeReason) parts.push(routeReason);
    } else if (routeLabel) {
      parts.push(`route ${routeLabel}`);
      if (routeReason) parts.push(routeReason);
    }
    if (readinessRecord && typeof readinessRecord.status === "string") {
      parts.push(`readiness ${readinessRecord.status}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Team run evidence";
  }

  if (entry.source === "workpack_record") {
    const recordType =
      typeof detail.recordType === "string" ? detail.recordType : null;
    const workpackId =
      typeof detail.workpackId === "string" ? detail.workpackId : null;
    const recordId =
      typeof detail.recordId === "string" ? detail.recordId : null;
    const parts = [
      recordType,
      workpackId ? `workpack ${workpackId}` : null,
      recordId ? `record ${recordId}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Workpack evidence";
  }

  if (entry.source === "legacy_work_item") {
    const status =
      typeof detail.taskStatus === "string" ? detail.taskStatus : null;
    const eventTypeLabel = entry.eventType.replaceAll("_", " ");
    const parts = [status ? `task ${status}` : null, eventTypeLabel].filter(
      Boolean
    );
    return parts.length > 0 ? parts.join(" · ") : "Legacy task evidence";
  }

  if (entry.source === "browser_automation") {
    const taskId = typeof detail.taskId === "string" ? detail.taskId : null;
    const status = typeof detail.status === "string" ? detail.status : null;
    const executionId =
      typeof detail.executionId === "string" ? detail.executionId : null;
    const parts = [
      taskId ? `task ${taskId}` : null,
      executionId ? `exec ${executionId}` : null,
      status ? `status ${status}` : null,
    ].filter(Boolean);
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

  if (entry.source === "context_engine") {
    const status =
      typeof detail.status === "string" ? detail.status : null;
    const source = typeof detail.source === "string" ? detail.source : null;
    const roomId = typeof detail.roomId === "string" ? detail.roomId : null;
    const runId = typeof detail.runId === "string" ? detail.runId : null;
    const traceId = typeof detail.traceId === "string" ? detail.traceId : null;
    const healthScore =
      typeof detail.healthScore === "number" ? detail.healthScore : null;
    const groundingScore =
      typeof detail.groundingScore === "number" ? detail.groundingScore : null;
    const retrievalCoverage =
      typeof detail.retrievalCoverage === "number"
        ? detail.retrievalCoverage
        : null;
    const freshnessScore =
      typeof detail.freshnessScore === "number" ? detail.freshnessScore : null;
    const parts = [
      entry.eventType.replaceAll("_", " "),
      status ? `status ${status}` : null,
      source ? `source ${source}` : null,
      roomId ? `room ${roomId}` : null,
      runId ? `run ${runId}` : null,
      healthScore != null ? `health ${healthScore.toFixed(2)}` : null,
      groundingScore != null ? `grounding ${groundingScore.toFixed(2)}` : null,
      retrievalCoverage != null
        ? `retrieval ${Math.round(retrievalCoverage * 100)}%`
        : null,
      freshnessScore != null
        ? `freshness ${Math.round(freshnessScore * 100)}%`
        : null,
      traceId ? `trace ${traceId.slice(0, 12)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "Context engine trace";
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

function executionModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case "auto_team":
      return "Auto team";
    case "team_chat":
      return "Team chat";
    case "review":
      return "Review";
    default:
      return mode ?? "n/a";
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

function automationProgressPercent(
  automation:
    | {
        run?: { status?: string | null } | null;
        steps?: Array<{ status?: string | null }> | null;
      }
    | null
    | undefined
): number {
  if (!automation?.run) return 0;
  const steps = automation.steps ?? [];
  const total = steps.length;
  if (total === 0) {
    if (automation.run.status === "completed") return 100;
    if (automation.run.status === "running") return 10;
    return 0;
  }
  const completed = steps.filter(
    step => step.status === "succeeded" || step.status === "skipped"
  ).length;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

function summarizeAutomationSteps(
  automation:
    | {
        run?: { status?: string | null } | null;
        steps?: Array<{ status?: string | null }> | null;
      }
    | null
    | undefined
): {
  total: number;
  completed: number;
  running: number;
  awaitingApproval: number;
  blocked: number;
  needsInput: number;
  failed: number;
} {
  const steps = automation?.steps ?? [];
  return {
    total: steps.length,
    completed: steps.filter(
      step => step.status === "succeeded" || step.status === "skipped"
    ).length,
    running: steps.filter(step => step.status === "running").length,
    awaitingApproval: steps.filter(step => step.status === "awaiting_approval")
      .length,
    blocked: steps.filter(step => step.status === "blocked").length,
    needsInput: steps.filter(step => step.status === "needs_input").length,
    failed: steps.filter(step => step.status === "failed").length,
  };
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
  const canAccessWorkOs =
    !!user && (user.role === "admin" || user.role === "domain_admin");
  const [location, setLocation] = useLocation();
  const urlParams = useMemo(
    () => new URLSearchParams(location.split("?")[1] ?? ""),
    [location]
  );
  const selectedCaseIdFromUrl = urlParams.get("caseId");
  const timelineSourceFromUrl = urlParams.get("timelineSource");
  const selectedCaseId = selectedCaseIdFromUrl;
  const [timelineSourceFilter, setTimelineSourceFilter] = useState<
    string | null
  >(timelineSourceFromUrl);
  const [explorationOnlyFilter, setExplorationOnlyFilter] = useState(false);
  const [showRawTimelineJson, setShowRawTimelineJson] = useState(false);
  const [editRequestOpen, setEditRequestOpen] = useState(false);
  const [editRequestTitle, setEditRequestTitle] = useState("");
  const [editRequestObjective, setEditRequestObjective] = useState("");
  const [editRequestSourceType, setEditRequestSourceType] = useState("");
  const [editRequestSourceRef, setEditRequestSourceRef] = useState("");
  const [editRequestBusinessDomain, setEditRequestBusinessDomain] =
    useState("");
  const [editRequestUrgency, setEditRequestUrgency] = useState("");
  const [editRequestRiskLevel, setEditRequestRiskLevel] = useState("");
  const [editRequestOwnerMode, setEditRequestOwnerMode] = useState<
    "inherit" | "self" | "queue" | "role" | "hybrid"
  >("inherit");
  const [editRequestOwnerId, setEditRequestOwnerId] = useState("");

  const selectCase = (caseId: string) => {
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    if (
      params.get("caseId") === caseId &&
      params.get("timelineSource") === (timelineSourceFilter ?? "")
    ) {
      return;
    }
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
    if (
      params.get("caseId") === (selectedCaseId ?? "") &&
      params.get("timelineSource") === (source ?? "")
    ) {
      return;
    }
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
    setTimelineSourceFilter(timelineSourceFromUrl);
  }, [timelineSourceFromUrl]);

  const overviewQuery = trpc.workOs.overview.useQuery(undefined, {
    enabled: canAccessWorkOs,
    refetchInterval: 15_000,
  });
  const inboxQuery = trpc.workOs.inbox.useQuery(undefined, {
    enabled: canAccessWorkOs,
    refetchInterval: 15_000,
  });
  const caseQuery = trpc.workOs.getCase.useQuery(
    selectedCaseId ? { caseId: selectedCaseId } : skipToken,
    { enabled: canAccessWorkOs, refetchInterval: 15_000 }
  );
  const resumeAutomationCheckpointMutation =
    trpc.workOs.resumeAutomationCheckpoint.useMutation({
      onSuccess: async () => {
        toast.success("Automation checkpoint resumed");
        await caseQuery.refetch();
      },
      onError: (error: { message: string }) => {
        toast.error(error.message || "Failed to resume automation checkpoint");
      },
    });
  const updateRequestMutation = trpc.workOs.updateRequest.useMutation({
    onSuccess: async () => {
      toast.success("Work request updated");
      setEditRequestOpen(false);
      await Promise.all([
        caseQuery.refetch(),
        inboxQuery.refetch(),
        overviewQuery.refetch(),
      ]);
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "Failed to update work request");
    },
  });

  useEffect(() => {
    if (!selectedCaseIdFromUrl && inboxQuery.data?.[0]?.id) {
      const nextId = inboxQuery.data[0].id;
      selectCase(nextId);
    }
  }, [inboxQuery.data, selectedCaseIdFromUrl, timelineSourceFilter]);

  const selectedCase = caseQuery.data?.case ?? null;
  const selectedRequest = caseQuery.data?.request ?? null;
  const assignment = caseQuery.data?.assignments?.[0] ?? null;
  const automation = caseQuery.data?.automation ?? null;
  const automationRun = automation?.run ?? null;
  const automationLatestStep = automation?.steps?.[0] ?? null;
  const automationLatestCheckpoint = automation?.checkpoints?.[0] ?? null;
  const automationLatestEvent = automation?.events?.[0] ?? null;
  const automationProgressPercentValue = useMemo(
    () => automationProgressPercent(automation),
    [automation]
  );
  const automationStepSummary = useMemo(
    () => summarizeAutomationSteps(automation),
    [automation]
  );
  const caseTimeline = caseQuery.data?.timeline ?? [];
  const latestTeamRunExploration = useMemo(() => {
    for (const entry of caseTimeline) {
      if (entry.source !== "team_run") continue;
      const exploration = getExplorationSummary(entry.detailJson);
      if (exploration) return exploration;
    }
    return null;
  }, [caseTimeline]);
  const selectedCaseBridgeStatus = selectedCase
    ? mapWorkOsStateToTeamRunStatus(selectedCase.currentState)
    : null;
  useEffect(() => {
    if (!editRequestOpen) return;
    setEditRequestTitle(selectedCase?.title ?? "");
    setEditRequestObjective(
      selectedRequest?.objective ?? selectedCase?.summary ?? ""
    );
    setEditRequestSourceType(selectedRequest?.sourceType ?? "");
    setEditRequestSourceRef(selectedRequest?.sourceRef ?? "");
    setEditRequestBusinessDomain(selectedRequest?.businessDomain ?? "");
    setEditRequestUrgency(selectedRequest?.urgency ?? "");
    setEditRequestRiskLevel(selectedRequest?.riskLevel ?? "");
    setEditRequestOwnerMode(
      selectedRequest?.defaultOwnerType === "queue"
        ? "queue"
        : selectedRequest?.defaultOwnerType === "role"
          ? "role"
          : selectedRequest?.defaultOwnerType === "hybrid"
            ? "hybrid"
            : selectedRequest?.defaultOwnerType === "human"
              ? "self"
              : "inherit"
    );
    setEditRequestOwnerId(
      selectedRequest?.defaultOwnerId ?? selectedRequest?.defaultQueueId ?? ""
    );
  }, [editRequestOpen, selectedCase, selectedRequest]);
  const inboxCases = useMemo(() => {
    const items = inboxQuery.data ?? [];
    if (!explorationOnlyFilter) return items;
    return items.filter(item => item.latestExploration);
  }, [explorationOnlyFilter, inboxQuery.data]);
  const selectedInboxCase = useMemo(
    () => inboxCases.find(item => item.id === selectedCase?.id) ?? null,
    [inboxCases, selectedCase?.id]
  );
  const contextEngineLookbackSince = useMemo(
    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    []
  );
  const contextEngineHealthQuery = trpc.monitoring.getContextEngineHealth.useQuery(
    {
      teamId: selectedInboxCase?.latestTeamId ?? undefined,
      roomId: selectedInboxCase?.latestTeamRoomId ?? undefined,
      runId: selectedInboxCase?.latestTeamRunId ?? undefined,
      limit: 8,
      since: contextEngineLookbackSince,
    },
    {
      refetchInterval: 15_000,
    }
  );
  const contextEngineTraceEntries = useMemo(
    () =>
      (contextEngineHealthQuery.data?.recentChecks ?? []).map(check => ({
        id: `context-engine-${check.id}`,
        source: "context_engine",
        eventType: check.checkType,
        createdAt: check.createdAt,
        detailJson: {
          ...check.details,
          status: check.status,
          checkId: check.id,
          source: check.source,
          traceId: check.details.traceId ?? null,
          notes: check.details.notes ?? null,
          healthScore: check.details.healthScore,
          groundingScore: check.details.groundingScore,
          retrievalCoverage: check.details.retrievalCoverage,
          freshnessScore: check.details.freshnessScore,
          latencyMs: check.details.latencyMs,
          intent: check.details.intent,
          roomId: check.details.roomId,
          runId: check.details.runId,
          skillId: check.details.skillId,
          teamId: contextEngineHealthQuery.data?.scope.teamId ?? null,
          scope: {
            tenantId: contextEngineHealthQuery.data?.scope.tenantId ?? null,
            teamId: contextEngineHealthQuery.data?.scope.teamId ?? null,
            roomId: contextEngineHealthQuery.data?.scope.roomId ?? null,
            runId: contextEngineHealthQuery.data?.scope.runId ?? null,
            skillId: contextEngineHealthQuery.data?.scope.skillId ?? null,
            userId: contextEngineHealthQuery.data?.scope.userId ?? null,
          },
        },
      })),
    [contextEngineHealthQuery.data]
  );
  const contextEngineTrendSeries = useMemo(() => {
    const checks = [...(contextEngineHealthQuery.data?.recentChecks ?? [])].sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    );
    if (checks.length === 0) return [];

    const fallbackScope = contextEngineHealthQuery.data?.scope ?? null;
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        color: string;
        count: number;
        latestCreatedAt: string | null;
        points: Map<
          string,
          {
            createdAt: string;
            label: string;
            healthValues: number[];
            groundingValues: number[];
            retrievalValues: number[];
            freshnessValues: number[];
            latencyValues: number[];
          }
        >;
      }
    >();

    for (const check of checks) {
      const detail = check.details ?? {};
      const teamId =
        typeof detail.teamId === "string"
          ? detail.teamId
          : fallbackScope?.teamId ?? null;
      const roomId =
        typeof detail.roomId === "string"
          ? detail.roomId
          : fallbackScope?.roomId ?? null;
      const runId =
        typeof detail.runId === "string"
          ? detail.runId
          : fallbackScope?.runId ?? null;
      const key = [teamId ?? "any", roomId ?? "any", runId ?? "any"].join("|");
      const existing = groups.get(key);
      const createdAtLabel = new Date(check.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const bucket =
        existing ??
        (() => {
          const next = {
            key,
            label: formatContextEngineScopeLabel({ teamId, roomId, runId }),
            color: CONTEXT_ENGINE_TREND_COLORS[groups.size % CONTEXT_ENGINE_TREND_COLORS.length],
            count: 0,
            latestCreatedAt: null as string | null,
            points: new Map<
              string,
              {
                createdAt: string;
                label: string;
                healthValues: number[];
                groundingValues: number[];
                retrievalValues: number[];
                freshnessValues: number[];
                latencyValues: number[];
              }
            >(),
          };
          groups.set(key, next);
          return next;
        })();

      bucket.count += 1;
      bucket.latestCreatedAt = check.createdAt;
      const pointKey = check.createdAt;
      const point =
        bucket.points.get(pointKey) ??
        (() => {
          const nextPoint = {
            createdAt: check.createdAt,
            label: createdAtLabel,
            healthValues: [] as number[],
            groundingValues: [] as number[],
            retrievalValues: [] as number[],
            freshnessValues: [] as number[],
            latencyValues: [] as number[],
          };
          bucket.points.set(pointKey, nextPoint);
          return nextPoint;
        })();

      const healthScore = scoreToPercent(detail.healthScore);
      const groundingScore = scoreToPercent(detail.groundingScore);
      const retrievalCoverage = scoreToPercent(detail.retrievalCoverage);
      const freshnessScore = scoreToPercent(detail.freshnessScore);
      const latencyMs =
        typeof detail.latencyMs === "number" && Number.isFinite(detail.latencyMs)
          ? detail.latencyMs
          : null;

      if (healthScore != null) point.healthValues.push(healthScore);
      if (groundingScore != null) point.groundingValues.push(groundingScore);
      if (retrievalCoverage != null) point.retrievalValues.push(retrievalCoverage);
      if (freshnessScore != null) point.freshnessValues.push(freshnessScore);
      if (latencyMs != null) point.latencyValues.push(latencyMs);
    }

    return Array.from(groups.values())
      .map(group => {
        const points = Array.from(group.points.values())
          .sort(
            (left, right) =>
              new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
          )
          .map(point => ({
            createdAt: point.createdAt,
            label: point.label,
            healthScore: average(point.healthValues),
            groundingScore: average(point.groundingValues),
            retrievalCoverage: average(point.retrievalValues),
            freshnessScore: average(point.freshnessValues),
            latencyMs: average(point.latencyValues),
          }));
        return {
          ...group,
          points,
          latestPoint: points[points.length - 1] ?? null,
        };
      })
      .sort((left, right) => {
        if (right.count !== left.count) return right.count - left.count;
        const leftTime = left.latestCreatedAt
          ? new Date(left.latestCreatedAt).getTime()
          : 0;
        const rightTime = right.latestCreatedAt
          ? new Date(right.latestCreatedAt).getTime()
          : 0;
        return rightTime - leftTime;
      })
      .slice(0, 4);
  }, [contextEngineHealthQuery.data]);
  const timeline = useMemo(() => {
    const combined = [...caseTimeline, ...contextEngineTraceEntries];
    return combined.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  }, [caseTimeline, contextEngineTraceEntries]);
  const timelineSourceOptions = useMemo(
    () => Array.from(new Set(timeline.map(entry => entry.source))).sort(),
    [timeline]
  );
  const filteredTimeline = timelineSourceFilter
    ? timeline.filter(entry => entry.source === timelineSourceFilter)
    : timeline;

  useEffect(() => {
    if (!timelineSourceFilter || filteredTimeline.length === 0) {
      return;
    }

    const firstEntry = filteredTimeline[0];
    const target = document.getElementById(
      `timeline-${firstEntry.source}-${firstEntry.id}`
    );
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filteredTimeline, timelineSourceFilter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!canAccessWorkOs) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <DashboardCard
          className="w-full max-w-md"
          title="Access Denied"
          description="Work OS is available to admin and domain admin operators only."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-none items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/admin/monitoring")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Monitoring
            </Button>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <ClipboardList className="h-6 w-6" />
                Work OS Console
              </h1>
              <p className="text-sm text-muted-foreground">
                Inbox, case timeline, ownership history, and live risk state
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Bookmarkable links keep `caseId` and `timelineSource` in the URL
                so you can return to the same evidence slice later.
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/help/work-os")}
            >
              <BookOpen className="mr-1 h-4 w-4" />
              Open guide
            </Button>
            {selectedRequest ? (
              <Button asChild variant="outline" size="sm">
                <Link href={buildWorkRequestPath(selectedRequest.id)}>
                  Edit request
                </Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => overviewQuery.refetch()}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh overview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inboxQuery.refetch()}
            >
              <Layers3 className="mr-1 h-4 w-4" />
              Refresh inbox
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation("/admin/queues")}
            >
              Queue dashboard
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <DashboardCard
          className="xl:sticky xl:top-4 xl:z-10"
          title="Live automation job"
          description="Monitor the active job, current step, checkpoint state, and progress while automation is running."
        >
          {automationRun ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Live job pulse
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {automationRun.title}
                    </p>
                    <p className="text-sm text-slate-600">
                      {automationRun.objective ?? "No objective recorded"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        automationStatusBadgeClass(automationRun.status)
                      )}
                    >
                      {automationRun.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        automationModeBadgeClass(automationRun.currentMode)
                      )}
                    >
                      {automationModeLabel(automationRun.currentMode)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-white text-slate-700"
                    >
                      Run {automationRun.id.slice(0, 8)}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>Progress</span>
                    <span>
                      {automationStepSummary.total > 0
                        ? `${automationStepSummary.completed}/${automationStepSummary.total} steps complete`
                        : automationRun.status === "running"
                          ? "Starting execution"
                          : "No steps recorded yet"}
                    </span>
                  </div>
                  <Progress
                    value={automationProgressPercentValue}
                    className="mt-2 h-2.5"
                  />
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                    <Badge
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      {automationStepSummary.completed} done
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-sky-200 bg-sky-50 text-sky-700"
                    >
                      {automationStepSummary.running} running
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-amber-700"
                    >
                      {automationStepSummary.awaitingApproval +
                        automationStepSummary.needsInput}{" "}
                      waiting
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-rose-200 bg-rose-50 text-rose-700"
                    >
                      {automationStepSummary.blocked +
                        automationStepSummary.failed}{" "}
                      blocked
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">
                    {automationLatestStep ? (
                      <>
                        Current step:{" "}
                        <span className="font-medium text-slate-900">
                          {automationLatestStep.title}
                        </span>{" "}
                        <span className="text-slate-500">
                          ({automationLatestStep.stepKey} ·{" "}
                          {automationLatestStep.surface})
                        </span>
                      </>
                    ) : (
                      "Waiting for the first step to start."
                    )}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Current step
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {automationLatestStep
                        ? automationLatestStep.title
                        : "n/a"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {automationLatestStep
                        ? `${automationLatestStep.stepKey} · ${automationLatestStep.surface}`
                        : "No step recorded yet"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Checkpoint
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {automationLatestCheckpoint
                        ? automationLatestCheckpoint.checkpointKey
                        : "n/a"}
                    </p>
                    {automationLatestCheckpoint ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            automationStatusBadgeClass(
                              automationLatestCheckpoint.approvalState
                            )
                          )}
                        >
                          {automationLatestCheckpoint.approvalState}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize",
                            checkpointStatusBadgeClass(
                              automationLatestCheckpoint.checkpointStatus
                            )
                          )}
                        >
                          {automationLatestCheckpoint.checkpointStatus}
                        </Badge>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">
                        No checkpoint recorded yet
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Run status
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {automationRun.finalDisposition ?? automationRun.status}
                    </p>
                    <p className="text-xs text-slate-600">
                      Updated {formatDate(automationRun.updatedAt)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {automationLatestCheckpoint ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!selectedCase) {
                          return;
                        }
                        resumeAutomationCheckpointMutation.mutate({
                          caseId: selectedCase.id,
                          runId: automationRun.id,
                          checkpointId: automationLatestCheckpoint.id,
                        });
                      }}
                      disabled={
                        automationLatestCheckpoint.checkpointStatus ===
                          "resumed" ||
                        automationLatestCheckpoint.checkpointStatus ===
                          "cancelled" ||
                        resumeAutomationCheckpointMutation.isPending
                      }
                    >
                      {resumeAutomationCheckpointMutation.isPending ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1 h-4 w-4" />
                      )}
                      Resume checkpoint
                    </Button>
                  ) : null}
                  {selectedRequest ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={buildWorkRequestPath(selectedRequest.id)}>
                        Edit request
                      </Link>
                    </Button>
                  ) : null}
                  {automationLatestEvent ? (
                    <Badge
                      variant="outline"
                      className="border-cyan-200 bg-white text-cyan-700"
                    >
                      Latest event:{" "}
                      {automationLatestEvent.eventType.replaceAll("_", " ")}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
          ) : selectedCase ? (
            <div className="space-y-4 rounded-2xl border border-dashed border-cyan-100 bg-cyan-50/40 p-4 text-sm text-slate-600">
              <div className="max-w-2xl">
                <p className="font-semibold text-slate-900">
                  No automation run recorded yet for this case.
                </p>
                <p className="mt-1 text-slate-600">
                  Review the request preflight first, then approve launch to
                  turn this request into a live execution plan.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedCase.requestId ?? selectedRequest?.id ? (
                  <Button asChild size="sm">
                    <Link
                      href={buildWorkRequestPath(
                        selectedCase.requestId ?? selectedRequest?.id
                      )}
                    >
                      Review and approve automation
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" disabled>
                    Link a request before launch
                  </Button>
                )}
                {selectedRequest ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildWorkRequestPath(selectedRequest.id)}>
                      Edit request
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
              Select a case from the inbox to inspect a live automation run.
            </div>
          )}
        </DashboardCard>

        <DashboardCard
          title="Context engine health"
          description="Recent freshness, grounding, retrieval, and token-pressure signals for the selected case or tenant."
        >
          <ContextEngineHealthPanel
            summary={contextEngineHealthQuery.data ?? null}
            loading={contextEngineHealthQuery.isLoading}
            error={contextEngineHealthQuery.error?.message ?? null}
            scopeLabel={
              selectedInboxCase
                ? "Selected case"
                : "Tenant-wide"
            }
            emptyMessage="No context-engine metrics recorded yet."
          />
        </DashboardCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <DashboardKpiCard
            icon={ClipboardList}
            label="Completed"
            value={overviewQuery.data?.completed ?? 0}
          />
          <DashboardKpiCard
            icon={Clock3}
            label="Overdue SLA"
            value={overviewQuery.data?.overdueSla ?? 0}
            valueClassName="text-amber-600"
          />
          <DashboardKpiCard
            icon={ShieldAlert}
            label="Open Exceptions"
            value={overviewQuery.data?.openExceptions ?? 0}
            valueClassName="text-rose-600"
          />
          <DashboardKpiCard
            icon={Layers3}
            label="States"
            value={Object.keys(overviewQuery.data?.byState ?? {}).length}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
          <DashboardCard
            title="Work Inbox"
            description="Tenant-scoped queue of open business work"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={explorationOnlyFilter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExplorationOnlyFilter(current => !current)}
                >
                  {explorationOnlyFilter
                    ? "Exploration only"
                    : "Show exploration-backed"}
                </Button>
                <Badge
                  variant="outline"
                  className="border-violet-200 bg-violet-50 text-violet-700"
                >
                  {inboxCases.filter(item => item.latestExploration).length}{" "}
                  with exploration
                </Badge>
              </div>
              {inboxCases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No work cases are available yet.
                </p>
              ) : (
                inboxCases.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectCase(item.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition hover:border-sky-300",
                      selectedCaseId === item.id
                        ? "border-sky-400 bg-sky-50/60"
                        : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.title}
                        </p>
                        <p className="text-sm text-slate-600">Case {item.id}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px] font-medium",
                            getStatusBridgeBadgeClass(item.currentState as any)
                          )}
                        >
                          Bridge:{" "}
                          {mapWorkOsStateToTeamRunStatus(item.currentState)}
                        </p>
                        {item.latestExploration ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "mt-2 text-[10px] font-medium",
                              explorationBadgeClass(
                                item.latestExploration.selectedCandidateId
                              )
                            )}
                          >
                            Exploration:{" "}
                            {item.latestExploration.selectedCandidateId}
                          </Badge>
                        ) : null}
                        {item.latestFinalReview ? (
                          <div className="mt-2 space-y-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-medium",
                                finalReviewRecommendationClass(
                                  item.latestFinalReview.recommendation
                                )
                              )}
                              title="Final review recommendation"
                            >
                              Final review:{" "}
                              {item.latestFinalReview.recommendation ?? "n/a"}
                            </Badge>
                            <p className="text-[11px] text-slate-500">
                              Reviewer{" "}
                              {item.latestFinalReview.reviewerPersona ?? "n/a"}{" "}
                              · Score{" "}
                              {item.latestFinalReview.score != null
                                ? item.latestFinalReview.score.toFixed(2)
                                : "n/a"}
                            </p>
                          </div>
                        ) : null}
                        {item.latestTraceId ? (
                          <Badge
                            variant="outline"
                            className="mt-2 border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-700"
                          >
                            Trace: {item.latestTraceId.slice(0, 12)}
                          </Badge>
                        ) : null}
                        {item.latestTeamId && item.latestTeamRoomId ? (
                          <div className="mt-2 space-y-1">
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className="border-sky-200 bg-sky-50 text-sky-700"
                              >
                                Team: {item.latestTeamId}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="border-cyan-200 bg-cyan-50 text-cyan-700"
                              >
                                Room: {item.latestTeamRoomId}
                              </Badge>
                              {item.latestTeamRunStatus ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "capitalize",
                                    automationStatusBadgeClass(
                                      item.latestTeamRunStatus
                                    )
                                  )}
                                >
                                  Run: {item.latestTeamRunStatus}
                                </Badge>
                              ) : null}
                              {item.latestTeamRunMode ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "capitalize",
                                    automationModeBadgeClass(
                                      item.latestTeamRunMode
                                    )
                                  )}
                                >
                                  {executionModeLabel(item.latestTeamRunMode)}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild variant="outline" size="sm">
                                <Link
                                  href={buildTeamRoomPath(
                                    item.latestTeamId,
                                    item.latestTeamRoomId,
                                    "workflow"
                                  )}
                                >
                                  Open room
                                </Link>
                              </Button>
                              <Button asChild variant="outline" size="sm">
                                <Link href={buildCasePath(item.id, "team_run")}>
                                  Open run history
                                </Link>
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        {item.latestReadiness ? (
                          <div className="mt-2 space-y-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-medium",
                                readinessRecordClass(
                                  item.latestReadiness.status
                                )
                              )}
                              title="Latest enterprise readiness record"
                            >
                              Readiness: {item.latestReadiness.status}
                            </Badge>
                            <p className="text-[11px] text-slate-500">
                              Score {item.latestReadiness.score.toFixed(2)} ·{" "}
                              {item.latestReadiness.reason}
                            </p>
                          </div>
                        ) : null}
                        {item.latestContext ? (
                          <p className="mt-2 text-[11px] text-slate-500">
                            Context: {item.latestContext.summary}
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize",
                          stateBadgeClass(item.currentState)
                        )}
                      >
                        {item.currentState}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span>
                        Owner: {item.ownerType ?? "unassigned"}
                        {item.ownerId ? ` / ${item.ownerId}` : ""}
                      </span>
                      <span>Priority: {item.priority}</span>
                      <span>Risk: {item.riskLevel}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Selected Case"
            description="Assignment history, exceptions, outcomes, SLA, and timeline evidence"
          >
            {!selectedCase ? (
              <p className="text-sm text-muted-foreground">
                Select a case from the inbox to inspect the full lifecycle.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">
                        Case {selectedCase.id}
                      </p>
                      <h2 className="text-lg font-semibold text-slate-900">
                        {selectedCase.title}
                      </h2>
                      {selectedCase.summary ? (
                        <p className="mt-1 text-sm text-slate-600">
                          {selectedCase.summary}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge
                        variant="outline"
                        className={stateBadgeClass(selectedCase.currentState)}
                      >
                        {selectedCase.currentState}
                      </Badge>
                      {selectedCaseBridgeStatus ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize",
                            getStatusBridgeBadgeClass(selectedCase.currentState)
                          )}
                        >
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
                        {selectedCase.ownerId
                          ? ` / ${selectedCase.ownerId}`
                          : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Primary task</p>
                      <p className="font-medium text-slate-900">
                        {selectedCase.primaryTaskId ?? "n/a"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Created</p>
                      <p className="font-medium text-slate-900">
                        {formatDate(selectedCase.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Updated</p>
                      <p className="font-medium text-slate-900">
                        {formatDate(selectedCase.updatedAt)}
                      </p>
                    </div>
                  </div>

                  {selectedInboxCase?.latestExploration ? (
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          Inbox exploration
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "border-violet-200 bg-white text-violet-700",
                            explorationBadgeClass(
                              selectedInboxCase.latestExploration
                                .selectedCandidateId
                            )
                          )}
                        >
                          Selected:{" "}
                          {
                            selectedInboxCase.latestExploration
                              .selectedCandidateId
                          }
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-white text-slate-700"
                        >
                          {selectedInboxCase.latestExploration.candidateCount}{" "}
                          candidates
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {selectedInboxCase.latestExploration.selectionReason}
                      </p>
                    </div>
                  ) : null}

                  {selectedInboxCase?.latestFinalReview ? (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          Final review
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-medium",
                            finalReviewRecommendationClass(
                              selectedInboxCase.latestFinalReview.recommendation
                            )
                          )}
                          title="Final review recommendation"
                        >
                          {selectedInboxCase.latestFinalReview.recommendation ??
                            "n/a"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        Reviewer{" "}
                        {selectedInboxCase.latestFinalReview.reviewerPersona ??
                          "n/a"}{" "}
                        · Score{" "}
                        {selectedInboxCase.latestFinalReview.score != null
                          ? selectedInboxCase.latestFinalReview.score.toFixed(2)
                          : "n/a"}
                      </p>
                      {selectedInboxCase.latestFinalReview.comment ? (
                        <p className="mt-1 text-sm text-slate-600">
                          {selectedInboxCase.latestFinalReview.comment}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedInboxCase?.latestTraceId ||
                  selectedInboxCase?.latestReadiness ||
                  selectedInboxCase?.latestContext ||
                  selectedInboxCase?.latestTeamId ? (
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          Enterprise context
                        </p>
                        {selectedInboxCase.latestTraceId ? (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-700"
                          >
                            Trace:{" "}
                            {selectedInboxCase.latestTraceId.slice(0, 12)}
                          </Badge>
                        ) : null}
                        {selectedInboxCase.latestReadiness ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-medium",
                              readinessRecordClass(
                                selectedInboxCase.latestReadiness.status
                              )
                            )}
                          >
                            Readiness:{" "}
                            {selectedInboxCase.latestReadiness.status}
                          </Badge>
                        ) : null}
                      </div>
                      {selectedInboxCase.latestContext ? (
                        <p className="mt-2 text-sm text-slate-600">
                          {selectedInboxCase.latestContext.summary}
                        </p>
                      ) : null}
                      {selectedInboxCase.latestReadiness ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Score{" "}
                          {selectedInboxCase.latestReadiness.score.toFixed(2)} ·{" "}
                          {selectedInboxCase.latestReadiness.reason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedInboxCase?.latestTeamId &&
                  selectedInboxCase?.latestTeamRoomId ? (
                    <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          Execution trail
                        </p>
                        <Badge
                          variant="outline"
                          className="border-sky-200 bg-white text-sky-700"
                        >
                          Team {selectedInboxCase.latestTeamId}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-cyan-200 bg-white text-cyan-700"
                        >
                          Room {selectedInboxCase.latestTeamRoomId}
                        </Badge>
                        {selectedInboxCase.latestTeamRunStatus ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize",
                              automationStatusBadgeClass(
                                selectedInboxCase.latestTeamRunStatus
                              )
                            )}
                          >
                            Run {selectedInboxCase.latestTeamRunStatus}
                          </Badge>
                        ) : null}
                        {selectedInboxCase.latestTeamRunMode ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize",
                              automationModeBadgeClass(
                                selectedInboxCase.latestTeamRunMode
                              )
                            )}
                          >
                            {executionModeLabel(
                              selectedInboxCase.latestTeamRunMode
                            )}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        This case has already been handed off to the room above;
                        keep tracking updates here so older work does not feel
                        lost when execution continues in the team room.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={buildTeamRoomPath(
                              selectedInboxCase.latestTeamId,
                              selectedInboxCase.latestTeamRoomId,
                              "workflow"
                            )}
                          >
                            Open room
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link
                            href={buildCasePath(selectedCase.id, "team_run")}
                          >
                            Open run history
                          </Link>
                        </Button>
                      </div>
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
                            <p className="text-sm font-semibold text-slate-900">
                              Automation Run Summary
                            </p>
                            <p className="text-xs text-slate-600">
                              Current mode, step, checkpoint, and disposition
                              for this case.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize",
                                automationModeBadgeClass(
                                  automationRun.currentMode
                                )
                              )}
                            >
                              {automationModeLabel(automationRun.currentMode)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize",
                                automationStatusBadgeClass(automationRun.status)
                              )}
                            >
                              {automationRun.status.replaceAll("_", " ")}
                            </Badge>
                            {automationRun.templateFamily ? (
                              <Badge
                                variant="outline"
                                className="border-cyan-200 bg-white text-cyan-700"
                              >
                                {automationRun.templateFamily}
                              </Badge>
                            ) : null}
                            {automationRun.templateSource ? (
                              <Badge
                                variant="outline"
                                className="border-slate-200 bg-white text-slate-700"
                              >
                                {automationRun.templateSource.replaceAll(
                                  "_",
                                  " "
                                )}
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-cyan-100 bg-white p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              Run
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">
                              {automationRun.title}
                            </p>
                            <p className="text-xs text-slate-600">
                              {automationRun.objective ??
                                "No objective recorded"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-cyan-100 bg-white p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              Current step
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">
                              {automationLatestStep
                                ? automationLatestStep.title
                                : "n/a"}
                            </p>
                            <p className="text-xs text-slate-600">
                              {automationLatestStep
                                ? `${automationLatestStep.stepKey} · ${automationLatestStep.surface}`
                                : "No step recorded yet"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-cyan-100 bg-white p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              Checkpoint
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-900">
                              {automationLatestCheckpoint
                                ? automationLatestCheckpoint.checkpointKey
                                : "n/a"}
                            </p>
                            {automationLatestCheckpoint ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "capitalize",
                                    automationStatusBadgeClass(
                                      automationLatestCheckpoint.approvalState
                                    )
                                  )}
                                >
                                  {automationLatestCheckpoint.approvalState}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "capitalize",
                                    checkpointStatusBadgeClass(
                                      automationLatestCheckpoint.checkpointStatus
                                    )
                                  )}
                                >
                                  {automationLatestCheckpoint.checkpointStatus}
                                </Badge>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-600">
                                No checkpoint recorded yet
                              </p>
                            )}
                          </div>
                          <div className="rounded-xl border border-cyan-100 bg-white p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              Disposition
                            </p>
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
                            <p className="font-medium text-slate-900">
                              {automationRun.templateSource ?? "n/a"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Steps</p>
                            <p className="font-medium text-slate-900">
                              {automation?.steps.length ?? 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Checkpoints</p>
                            <p className="font-medium text-slate-900">
                              {automation?.checkpoints.length ?? 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500">Events</p>
                            <p className="font-medium text-slate-900">
                              {automation?.events.length ?? 0}
                            </p>
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
                              !automationLatestCheckpoint ||
                              automationLatestCheckpoint.checkpointStatus ===
                                "resumed" ||
                              automationLatestCheckpoint.checkpointStatus ===
                                "cancelled" ||
                              resumeAutomationCheckpointMutation.isPending
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
                            <Badge
                              variant="outline"
                              className="border-cyan-200 bg-white text-cyan-700"
                            >
                              Latest event:{" "}
                              {automationLatestEvent.eventType.replaceAll(
                                "_",
                                " "
                              )}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-cyan-100 bg-cyan-50/40 p-4 text-sm text-slate-600">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-2xl">
                            <p className="font-semibold text-slate-900">
                              No automation run recorded yet for this case.
                            </p>
                            <p className="mt-1 text-slate-600">
                              Review the request preflight first, then approve
                              launch to turn this request into a live execution
                              plan.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditRequestOpen(true)}
                              disabled={!selectedCase || !!automationRun}
                            >
                              Edit request
                            </Button>
                            {selectedCase.requestId ?? selectedRequest?.id ? (
                              <Button asChild size="sm">
                                <Link
                                  href={buildWorkRequestPath(
                                    selectedCase.requestId ??
                                      selectedRequest?.id
                                  )}
                                >
                                  Review and approve automation
                                </Link>
                              </Button>
                            ) : (
                              <Button size="sm" disabled>
                                Link a request before launch
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {latestTeamRunExploration ? (
                      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            Planning exploration
                          </p>
                          <Badge
                            variant="outline"
                            className="border-violet-200 bg-white text-violet-700"
                          >
                            Selected:{" "}
                            {latestTeamRunExploration.selectedCandidateId ??
                              "n/a"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-white text-slate-700"
                          >
                            {latestTeamRunExploration.candidateCount} candidates
                          </Badge>
                        </div>
                        {latestTeamRunExploration.selectionReason ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {latestTeamRunExploration.selectionReason}
                          </p>
                        ) : null}
                        {latestTeamRunExploration.criteria.length > 0 ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Criteria:{" "}
                            {latestTeamRunExploration.criteria.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {assignment ? (
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-sm font-semibold text-slate-900">
                          Latest assignment
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {assignment.previousOwnerType ?? "none"}
                          {assignment.previousOwnerId
                            ? ` / ${assignment.previousOwnerId}`
                            : ""}{" "}
                          → {assignment.ownerType}
                          {assignment.ownerId ? ` / ${assignment.ownerId}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {assignment.assignmentSource} •{" "}
                          {formatDate(assignment.createdAt)}
                        </p>
                        {assignment.reason ? (
                          <p className="mt-2 text-sm text-slate-600">
                            {assignment.reason}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Share current view
                          </p>
                          <p className="text-xs text-slate-600">
                            This permalink keeps the selected case and active
                            timeline source together.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="border-sky-200 bg-white text-sky-700"
                          >
                            Case {selectedCase.id}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-sky-200 bg-white text-sky-700"
                          >
                            {timelineSourceFilter
                              ? sourceLabel(timelineSourceFilter)
                              : "All sources"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  `${window.location.origin}${location}`
                                );
                                toast.success("Current permalink copied");
                              } catch {
                                toast.error(
                                  "Could not copy the current permalink"
                                );
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
                        <p className="text-sm font-semibold text-slate-900">
                          Approvals
                        </p>
                        <div className="mt-3 space-y-3">
                          {(caseQuery.data?.approvals ?? []).length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No approvals recorded.
                            </p>
                          ) : (
                            caseQuery.data!.approvals.map(approval => (
                              <div
                                key={approval.id}
                                className="rounded-xl border border-slate-200 p-3 text-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-slate-900">
                                    {approval.approvalStatus}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {formatDate(approval.createdAt)}
                                  </span>
                                </div>
                                {approval.comment ? (
                                  <p className="mt-1 text-slate-600">
                                    {approval.comment}
                                  </p>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-sm font-semibold text-slate-900">
                          Exceptions
                        </p>
                        <div className="mt-3 space-y-3">
                          {(caseQuery.data?.exceptions ?? []).length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No exceptions recorded.
                            </p>
                          ) : (
                            caseQuery.data!.exceptions.map(exception => (
                              <div
                                key={exception.id}
                                className="rounded-xl border border-slate-200 p-3 text-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-slate-900">
                                    {exception.exceptionType}
                                  </span>
                                  <Badge variant="outline">
                                    {exception.status}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-slate-600">
                                  {exception.reason ?? "No reason"}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-sm font-semibold text-slate-900">
                          Outcomes
                        </p>
                        <div className="mt-3 space-y-3">
                          {(caseQuery.data?.outcomes ?? []).length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No outcomes recorded.
                            </p>
                          ) : (
                            caseQuery.data!.outcomes.map(outcome => (
                              <div
                                key={outcome.id}
                                className="rounded-xl border border-slate-200 p-3 text-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-slate-900">
                                    {outcome.disposition}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {formatDate(outcome.createdAt)}
                                  </span>
                                </div>
                                {outcome.summary ? (
                                  <p className="mt-1 text-slate-600">
                                    {outcome.summary}
                                  </p>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-sm font-semibold text-slate-900">
                          SLA
                        </p>
                        <div className="mt-3 space-y-3">
                          {(caseQuery.data?.slas ?? []).length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No SLA records yet.
                            </p>
                          ) : (
                            caseQuery.data!.slas.map(sla => (
                              <div
                                key={sla.id}
                                className="rounded-xl border border-slate-200 p-3 text-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-slate-900">
                                    {sla.breachState}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {formatDate(sla.createdAt)}
                                  </span>
                                </div>
                                <p className="mt-1 text-slate-600">
                                  Due {formatDate(sla.dueAt)} • policy{" "}
                                  {sla.policyId ?? "n/a"}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {contextEngineTraceEntries.length > 0 ? (
                      <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              Context engine live traces
                            </p>
                            <p className="text-xs text-slate-600">
                              Retrieval, grounding, freshness, and token
                              pressure checks now appear in the same evidence
                              timeline so you can audit the agent context
                              while the case is still open.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-cyan-200 bg-white text-cyan-700"
                            >
                              {contextEngineTraceEntries.length} recent traces
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => selectTimelineSource("context_engine")}
                            >
                              Focus traces
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link
                                href={buildContextEngineMonitoringPath({
                                  teamId: selectedInboxCase?.latestTeamId ?? null,
                                  roomId: selectedInboxCase?.latestTeamRoomId ?? null,
                                  runId: selectedInboxCase?.latestTeamRunId ?? null,
                                })}
                              >
                                Open evaluation dashboard
                              </Link>
                            </Button>
                          </div>
                        </div>
                        {contextEngineTrendSeries.length > 0 ? (
                          <div className="mt-4 grid gap-3 xl:grid-cols-2">
                            {contextEngineTrendSeries.map(series => {
                              const latest = series.latestPoint;
                              const latestHealth =
                                latest?.healthScore != null
                                  ? `${Math.round(latest.healthScore)}%`
                                  : "n/a";
                              const latestGrounding =
                                latest?.groundingScore != null
                                  ? `${Math.round(latest.groundingScore)}%`
                                  : "n/a";
                              const latestRetrieval =
                                latest?.retrievalCoverage != null
                                  ? `${Math.round(latest.retrievalCoverage)}%`
                                  : "n/a";
                              const latestFreshness =
                                latest?.freshnessScore != null
                                  ? `${Math.round(latest.freshnessScore)}%`
                                  : "n/a";
                              const latestLatency =
                                latest?.latencyMs != null
                                  ? `${Math.round(latest.latencyMs)} ms`
                                  : "n/a";

                              return (
                                <div
                                  key={series.key}
                                  className="rounded-2xl border border-cyan-100 bg-white p-4 shadow-sm"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        Health trend by room/run
                                      </p>
                                      <p className="text-xs text-slate-600">
                                        {series.label}
                                      </p>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="border-cyan-200 bg-cyan-50 text-cyan-700"
                                    >
                                      {series.count} checks
                                    </Badge>
                                  </div>
                                  <div className="mt-3 h-44">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart
                                        data={series.points}
                                        margin={{
                                          top: 8,
                                          right: 8,
                                          bottom: 0,
                                          left: 0,
                                        }}
                                      >
                                        <XAxis
                                          dataKey="label"
                                          tickLine={false}
                                          axisLine={false}
                                          minTickGap={24}
                                          tick={{ fill: "#64748b", fontSize: 11 }}
                                        />
                                        <YAxis
                                          domain={[0, 100]}
                                          tickLine={false}
                                          axisLine={false}
                                          width={32}
                                          tick={{ fill: "#64748b", fontSize: 11 }}
                                        />
                                        <Tooltip
                                          formatter={(value: number | string) => [
                                            `${Math.round(Number(value))}%`,
                                            "Health",
                                          ]}
                                          labelFormatter={label => `Time ${label}`}
                                          contentStyle={{
                                            borderRadius: "12px",
                                            borderColor: "#bae6fd",
                                          }}
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="healthScore"
                                          stroke={series.color}
                                          strokeWidth={3}
                                          dot={false}
                                          connectNulls
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-5">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                        Latest health
                                      </p>
                                      <p className="mt-1 font-semibold text-slate-900">
                                        {latestHealth}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                        Grounding
                                      </p>
                                      <p className="mt-1 font-semibold text-slate-900">
                                        {latestGrounding}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                        Retrieval
                                      </p>
                                      <p className="mt-1 font-semibold text-slate-900">
                                        {latestRetrieval}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                        Freshness
                                      </p>
                                      <p className="mt-1 font-semibold text-slate-900">
                                        {latestFreshness}
                                      </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                        Latency
                                      </p>
                                      <p className="mt-1 font-semibold text-slate-900">
                                        {latestLatency}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {contextEngineHealthQuery.data?.scopeBreakdown?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {contextEngineHealthQuery.data.scopeBreakdown
                              .slice(0, 6)
                              .map(slice => (
                                <Badge
                                  key={[
                                    slice.teamId ?? "any",
                                    slice.roomId ?? "any",
                                    slice.runId ?? "any",
                                  ].join(":")}
                                  variant="outline"
                                  className="border-cyan-200 bg-white text-cyan-800"
                                >
                                  {slice.teamId ? `team ${slice.teamId}` : "team any"} ·{" "}
                                  {slice.roomId ? `room ${slice.roomId}` : "room any"} ·{" "}
                                  {slice.runId ? `run ${slice.runId}` : "run any"} ·{" "}
                                  {slice.count}
                                </Badge>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          Timeline
                        </p>
                        <div className="flex items-center gap-2">
                          {timelineSourceFilter ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => selectTimelineSource(null)}
                            >
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
                                const target = document.getElementById(
                                  `timeline-${firstEntry.source}-${firstEntry.id}`
                                );
                                target?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                              }}
                            >
                              Jump to first
                            </Button>
                          ) : null}
                          <p className="text-xs text-slate-500">
                            {filteredTimeline.length} of {timeline.length}{" "}
                            entries
                          </p>
                        </div>
                      </div>
                      {timelineSourceOptions.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant={
                              timelineSourceFilter ? "outline" : "default"
                            }
                            size="sm"
                            onClick={() => selectTimelineSource(null)}
                          >
                            All sources
                          </Button>
                          {timelineSourceOptions.map(source => (
                            <div
                              key={source}
                              className="flex items-center gap-2"
                            >
                              <Button
                                variant={
                                  timelineSourceFilter === source
                                    ? "default"
                                    : "outline"
                                }
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
                                  onClick={() =>
                                    copyCaseLink(
                                      selectedCaseId,
                                      source,
                                      `${sourceLabel(source)} link copied`
                                    )
                                  }
                                  title={`Copy ${sourceLabel(source)} link`}
                                >
                                  <Copy className="mr-1 h-4 w-4" />
                                  Copy {sourceLabel(source).toLowerCase()}{" "}
                                  evidence
                                </Button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">
                          Timeline source glossary
                        </p>
                        <p className="mt-1">
                          `work_os` is the main case stream. `role_routine`,
                          `team_run`, and `workpack_record` jump to evidence
                          slices. Open the{" "}
                          <button
                            type="button"
                            className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-800"
                            onClick={() => setLocation("/help/work-os")}
                          >
                            Open guide
                          </button>{" "}
                          for permalink examples and source definitions.
                        </p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {filteredTimeline.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No timeline entries available.
                          </p>
                        ) : (
                          filteredTimeline.map(entry => (
                            <div
                              key={`${entry.source}-${entry.id}`}
                              id={`timeline-${entry.source}-${entry.id}`}
                              className="rounded-xl border border-slate-200 p-3 text-sm"
                            >
                              {entry.source === "team_run" &&
                              ((entry.detailJson ?? {}) as Record<string, unknown>)
                                .finalReview
                                ? (() => {
                                    const finalReview = (
                                      (entry.detailJson ?? {}) as Record<
                                        string,
                                        unknown
                                      >
                                    ).finalReview as Record<string, unknown>;
                                    const recommendation =
                                      typeof finalReview.recommendation ===
                                      "string"
                                        ? finalReview.recommendation
                                        : null;
                                    const reviewerPersona =
                                      typeof finalReview.reviewerPersona ===
                                      "string"
                                        ? finalReview.reviewerPersona
                                        : null;
                                    const score =
                                      typeof finalReview.score === "number"
                                        ? finalReview.score
                                        : null;
                                    const comment =
                                      typeof finalReview.comment === "string"
                                        ? finalReview.comment
                                        : null;
                                    return (
                                      <div className="mb-2 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "text-[10px] font-medium",
                                              finalReviewRecommendationClass(
                                                recommendation
                                              )
                                            )}
                                            title="Final review recommendation"
                                          >
                                            Final review:{" "}
                                            {recommendation ?? "n/a"}
                                          </Badge>
                                          <span className="text-[11px] text-slate-500">
                                            Reviewer {reviewerPersona ?? "n/a"}{" "}
                                            · Score{" "}
                                            {score != null
                                              ? score.toFixed(2)
                                              : "n/a"}
                                          </span>
                                        </div>
                                        {comment ? (
                                          <p className="text-[11px] text-slate-500">
                                            Comment: {comment}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })()
                                : null}
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-slate-900">
                                    {entry.eventType.replaceAll("_", " ")}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-xs font-medium",
                                      sourceBadgeClass(entry.source)
                                    )}
                                  >
                                    {sourceLabel(entry.source)}
                                  </Badge>
                                  {entry.source === "team_run"
                                    ? (() => {
                                        const detail = (entry.detailJson ??
                                          {}) as Record<string, unknown>;
                                        const runtimeMetadata =
                                          (detail.runtimeMetadata as
                                            | Record<string, unknown>
                                            | undefined) ??
                                          ((
                                            detail.metadata as
                                              | Record<string, unknown>
                                              | undefined
                                          )?.runtimeMetadata as
                                            | Record<string, unknown>
                                            | undefined);
                                        const routeBadge =
                                          getExecutionRouteBadge({
                                            route:
                                              typeof runtimeMetadata?.route ===
                                              "string"
                                                ? runtimeMetadata.route
                                                : null,
                                            selectedSkillId:
                                              typeof runtimeMetadata?.selectedSkillId ===
                                              "string"
                                                ? runtimeMetadata.selectedSkillId
                                                : null,
                                            routeReason:
                                              typeof runtimeMetadata?.routeReason ===
                                              "string"
                                                ? runtimeMetadata.routeReason
                                                : null,
                                          });
                                        return routeBadge ? (
                                          <Badge
                                            variant="outline"
                                            title={routeBadge.title}
                                            className={cn(
                                              "text-xs font-medium",
                                              routeBadge.className
                                            )}
                                          >
                                            {routeBadge.label}
                                          </Badge>
                                        ) : null;
                                      })()
                                    : null}
                                </div>
                                <span className="text-xs text-slate-500">
                                  {formatDate(entry.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">
                                {timelineSummary(entry)}
                              </p>
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
                          <p className="text-sm font-semibold text-slate-900">
                            Raw timeline payloads
                          </p>
                          <p className="text-xs text-slate-600">
                            Use this layer when you need the full event payload
                            without the curated summary view.
                          </p>
                        </div>
                        <Button
                          variant={showRawTimelineJson ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            setShowRawTimelineJson(current => !current)
                          }
                        >
                          {showRawTimelineJson
                            ? "Hide raw JSON"
                            : "Show raw JSON"}
                        </Button>
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">
                          Raw layer guidance
                        </p>
                        <p className="mt-1">
                          This tab is intentionally verbose and intended for
                          operators or engineers who need to inspect the source
                          payloads behind the summary and evidence views.
                        </p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {filteredTimeline.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No timeline entries available.
                          </p>
                        ) : (
                          filteredTimeline.map(entry => (
                            <div
                              key={`raw-${entry.source}-${entry.id}`}
                              className="rounded-xl border border-slate-200 p-3 text-sm"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-slate-900">
                                    {entry.eventType.replaceAll("_", " ")}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-xs font-medium",
                                      sourceBadgeClass(entry.source)
                                    )}
                                  >
                                    {sourceLabel(entry.source)}
                                  </Badge>
                                </div>
                                <span className="text-xs text-slate-500">
                                  {formatDate(entry.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-700">
                                {timelineSummary(entry)}
                              </p>
                              {showRawTimelineJson && entry.detailJson ? (
                                <pre className="mt-2 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                                  {JSON.stringify(entry.detailJson, null, 2)}
                                </pre>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">
                                  Toggle raw JSON to inspect the underlying
                                  payload.
                                </p>
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

      <Dialog
        open={editRequestOpen}
        onOpenChange={open => {
          setEditRequestOpen(open);
          if (!open) {
            setEditRequestTitle("");
            setEditRequestObjective("");
            setEditRequestSourceType("");
            setEditRequestSourceRef("");
            setEditRequestBusinessDomain("");
            setEditRequestUrgency("");
            setEditRequestRiskLevel("");
            setEditRequestOwnerMode("inherit");
            setEditRequestOwnerId("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit request</DialogTitle>
            <DialogDescription>
              Update the request details before starting automation. Once a run
              exists, this edit flow is locked.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-request-title">Title</Label>
              <Input
                id="edit-request-title"
                value={editRequestTitle}
                onChange={event => setEditRequestTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="edit-request-objective">Details</Label>
              <Textarea
                id="edit-request-objective"
                value={editRequestObjective}
                onChange={event => setEditRequestObjective(event.target.value)}
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-request-source-type">Source type</Label>
              <Input
                id="edit-request-source-type"
                value={editRequestSourceType}
                onChange={event => setEditRequestSourceType(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-request-source-ref">Source reference</Label>
              <Input
                id="edit-request-source-ref"
                value={editRequestSourceRef}
                onChange={event => setEditRequestSourceRef(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-request-business-domain">
                Business domain
              </Label>
              <Input
                id="edit-request-business-domain"
                value={editRequestBusinessDomain}
                onChange={event =>
                  setEditRequestBusinessDomain(event.target.value)
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-request-urgency">Urgency</Label>
              <Input
                id="edit-request-urgency"
                value={editRequestUrgency}
                onChange={event => setEditRequestUrgency(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-request-risk-level">Risk level</Label>
              <Input
                id="edit-request-risk-level"
                value={editRequestRiskLevel}
                onChange={event => setEditRequestRiskLevel(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-request-owner-mode">Owner mode</Label>
              <select
                id="edit-request-owner-mode"
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                value={editRequestOwnerMode}
                onChange={event =>
                  setEditRequestOwnerMode(
                    event.target.value as typeof editRequestOwnerMode
                  )
                }
              >
                <option value="inherit">Keep current</option>
                <option value="self">Assign to me</option>
                <option value="queue">Assign to queue</option>
                <option value="role">Assign to role</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-request-owner-id">Owner / queue id</Label>
              <Input
                id="edit-request-owner-id"
                value={editRequestOwnerId}
                onChange={event => setEditRequestOwnerId(event.target.value)}
                placeholder="Leave blank to keep current"
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditRequestOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedCase || !selectedRequest) return;
                const nextOwnerType =
                  editRequestOwnerMode === "inherit"
                    ? undefined
                    : editRequestOwnerMode === "self"
                      ? "human"
                      : editRequestOwnerMode;
                const nextOwnerId =
                  editRequestOwnerMode === "self"
                    ? String(user?.id ?? "")
                    : editRequestOwnerMode === "queue"
                      ? editRequestOwnerId.trim() || null
                      : editRequestOwnerMode === "role" ||
                          editRequestOwnerMode === "hybrid"
                        ? editRequestOwnerId.trim() || null
                        : undefined;
                updateRequestMutation.mutate({
                  requestId: selectedRequest.id,
                  title: editRequestTitle.trim(),
                  objective: editRequestObjective.trim() || null,
                  sourceType: editRequestSourceType.trim() || undefined,
                  sourceRef: editRequestSourceRef.trim() || null,
                  businessDomain: editRequestBusinessDomain.trim() || null,
                  urgency: editRequestUrgency.trim() || undefined,
                  riskLevel: editRequestRiskLevel.trim() || undefined,
                  defaultOwnerType: nextOwnerType,
                  defaultOwnerId:
                    nextOwnerType === "human"
                      ? nextOwnerId
                      : nextOwnerType === "queue"
                        ? null
                        : (nextOwnerId ?? null),
                  defaultQueueId:
                    nextOwnerType === "queue" ? nextOwnerId : null,
                });
              }}
              disabled={
                updateRequestMutation.isPending ||
                !selectedRequest ||
                !editRequestTitle.trim()
              }
            >
              {updateRequestMutation.isPending ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
