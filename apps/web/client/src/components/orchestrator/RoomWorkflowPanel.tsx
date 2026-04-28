import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  FileStack,
  GitBranchPlus,
  Loader2,
  MessageSquareQuote,
  Play,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  ChevronDown,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { getExecutionRouteBadge } from "./executionRouteBadge";
import { AutoTeamLedgerPanel } from "./AutoTeamLedgerPanel";

interface WorkflowMemberSummary {
  id: string;
  displayName?: string | null;
  memberKind?: "assistant" | "human" | "external_connector" | string | null;
  memberRole?: string | null;
  isLead?: boolean | null;
}

interface RoomWorkflowPanelProps {
  roomId: string;
  runId?: string;
  roomType?: string | null;
  roomGoal?: string | null;
  roomLanguage?: "en" | "th";
  runtimeState?: {
    currentPhase: string;
    waitingReason: string | null;
    policyGateReason: string | null;
    selectedSkillId: string | null;
    routeReason: string | null;
    traceId?: string | null;
    nextPollAt: string | null;
    choiceDeadlineAt: string | null;
    finalReviewDeadlineAt: string | null;
    riskClass: string | null;
    reviewerPersona: string | null;
    verificationState: string;
    governedContext?: {
      version: 1;
      tenantId: string;
      principalScope: string;
      objective: string;
      generatedAt: string;
      selectedCount: number;
      excludedCount: number;
      summary: string;
      items: Array<{
        id: string;
        label: string;
        sourceType: string;
        scope: "tenant" | "team" | "room" | "case" | "request" | "workpack";
        trustTier: "trusted" | "derived" | "untrusted";
        freshnessTier: "fresh" | "warm" | "stale";
        score: number;
        included: boolean;
        reason: string;
        evidenceRefs: string[];
        redacted: boolean;
      }>;
    } | null;
    traceEnvelope?: {
      version: 1;
      traceId: string;
      tenantId: string;
      source: string;
      entityId: string;
      eventType: string;
      generatedAt: string;
      requestId?: string | null;
      parentTraceId?: string | null;
      summary: string;
      evidenceRefs: string[];
    } | null;
    readinessRecord?: {
      version: 1;
      kind: "team_run" | "workpack";
      entityId: string;
      generatedAt: string;
      score: number;
      status: "ready" | "staged" | "blocked";
      reason: string;
      evidenceRefs: string[];
    } | null;
    finalReview: {
      status: "pending" | "passed" | "failed";
      reviewerPersona: string | null;
      score: number | null;
      recommendation: string | null;
      comment: string | null;
      issues: string[];
    } | null;
    evidenceRefs: string[];
    planArtifact?: {
      version: 1;
      runId: string;
      roomId: string;
      teamId: string;
      caseId: string | null;
      requestId: string | null;
      objective: string;
      source: "team_run" | "work_os";
      status:
        | "planning"
        | "ready"
        | "executing"
        | "blocked"
        | "completed"
        | "failed";
      generatedAt: string;
      lastUpdatedAt: string;
      steps: Array<{
        stepKey: string;
        title: string;
        objective: string;
        ownerPersona: string;
        ownerMemberId: string | null;
        reviewerPersona: string;
        reviewerMemberId: string | null;
        verificationMethod: string;
        retryRule: string;
        evidenceRequirements: string[];
        status:
          | "planned"
          | "in_progress"
          | "waiting_for_worker"
          | "waiting_for_poll"
          | "awaiting_human_approval"
          | "blocked"
          | "completed"
          | "failed";
        evidenceRefs: string[];
        notes: string | null;
      }>;
      evidenceRefs: string[];
      planEvidenceRefs: string[];
      reviewerMatrix: Array<{
        riskClass: "low" | "medium" | "high" | "critical";
        reviewerPersona: string;
        escalationRule: string;
      }>;
      exploration: {
        selectedCandidateId: string;
        selectionReason: string;
        criteria: string[];
        candidates: Array<{
          candidateId: string;
          title: string;
          strategy: string;
          summary: string;
          strengths: string[];
          tradeoffs: string[];
          riskClass: "low" | "medium" | "high" | "critical";
        }>;
      } | null;
      review: {
        status: "pending" | "passed" | "failed";
        iteration: number;
        reviewedAt: string | null;
        reviewerPersona: string;
        issues: string[];
        score: number | null;
        recommendation: string | null;
      };
    } | null;
    workOsLinkage?: {
      teamId: string;
      roomId: string;
      projectedWorkOsState: string;
    } | null;
    statusBridge?: {
      teamRunStatus: string;
      workOsState: string;
      note?: string | null;
    } | null;
  } | null;
  teamMembers: WorkflowMemberSummary[];
  runStatus?:
    | "idle"
    | "queued"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "stopped";
  runStatusReason?: string | null;
  onResumeRun?: () => void;
  onChooseExplorationCandidate?: (
    candidateId: string,
    comment?: string
  ) => void;
  onRejectExplorationCandidates?: (reason?: string) => void;
  onApproveFinalResult?: (comment?: string) => void;
  onRejectFinalResult?: (reason?: string) => void;
  onFocusThread?: (
    messageId: string,
    options?: {
      workItemId?: string;
      composeReply?: boolean;
      messageAnchorId?: string | null;
    }
  ) => void;
  runControlsBusy?: boolean;
  className?: string;
}

type WorkflowStatus =
  | "planned"
  | "in_progress"
  | "in_review"
  | "needs_revision"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled"
  | "superseded";

type WorkflowStep = "research" | "review" | "approval";
type WorkflowBoardFilter = "all" | "attention" | "blocked";

interface WorkItemRecord {
  id: string;
  title: string;
  objective?: string | null;
  status: WorkflowStatus;
  revisionVersion: number;
  priority?: string | null;
  riskClass?: string | null;
  assignedMemberId?: string | null;
  reviewerMemberId?: string | null;
  approverMemberId?: string | null;
  threadRootMessageId?: string | null;
  activeDraftArtifactId?: string | null;
  artifactRefsJson?: unknown;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  dueAt?: string | Date | null;
  approvalState?: string | null;
}

interface RoomMessageRecord {
  id: string;
  createdAt?: string | Date | null;
  senderType?: string | null;
  metadataJson?: unknown;
}

interface WorkflowMessageMetadata {
  workItemId?: string | null;
  threadRootMessageId?: string | null;
}

interface RoomViewerStateRecord {
  lastViewedAt?: string | Date | null;
}

type PolicyGateKind =
  | "approval"
  | "evidence"
  | "repair_loop"
  | "escalation"
  | "other";

function normalizeWorkflowMessageMetadata(
  value: unknown
): WorkflowMessageMetadata {
  if (!value || typeof value !== "object") return {};
  const metadata = value as Record<string, unknown>;
  return {
    workItemId:
      typeof metadata.workItemId === "string" ? metadata.workItemId : null,
    threadRootMessageId:
      typeof metadata.threadRootMessageId === "string"
        ? metadata.threadRootMessageId
        : null,
  };
}

function formatWorkflowStatus(
  status: WorkflowStatus,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  switch (status) {
    case "planned":
      return t("orchestrator.workflow.status.planned");
    case "in_progress":
      return t("orchestrator.workflow.status.in_progress");
    case "in_review":
      return t("orchestrator.workflow.status.in_review");
    case "needs_revision":
      return t("orchestrator.workflow.status.needs_revision");
    case "awaiting_approval":
      return t("orchestrator.workflow.status.awaiting_approval");
    case "completed":
      return t("orchestrator.workflow.status.completed");
    case "failed":
      return t("orchestrator.workflow.status.failed");
    case "blocked":
      return t("orchestrator.workflow.status.blocked");
    case "cancelled":
      return t("orchestrator.workflow.status.cancelled");
    case "superseded":
      return t("orchestrator.workflow.status.superseded");
    default:
      return t("orchestrator.workflow.status.unknown");
  }
}

function getStatusClasses(status: WorkflowStatus): string {
  switch (status) {
    case "planned":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "in_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "needs_revision":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "awaiting_approval":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "blocked":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-500";
    case "superseded":
      return "border-slate-200 bg-slate-100 text-slate-500";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function classifyPolicyGateReason(reason: string): {
  kind: PolicyGateKind;
  label: string;
  classes: string;
} {
  const normalized = reason.toLowerCase();

  if (normalized.includes("approval")) {
    return {
      kind: "approval",
      label: "Approval",
      classes: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  if (normalized.includes("evidence")) {
    return {
      kind: "evidence",
      label: "Evidence",
      classes: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (
    normalized.includes("repair") ||
    normalized.includes("retry") ||
    normalized.includes("loop")
  ) {
    return {
      kind: "repair_loop",
      label: "Repair loop",
      classes: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (
    normalized.includes("escalat") ||
    normalized.includes("unsafe") ||
    normalized.includes("policy")
  ) {
    return {
      kind: "escalation",
      label: "Escalation",
      classes: "border-red-200 bg-red-50 text-red-700",
    };
  }

  return {
    kind: "other",
    label: "Other",
    classes: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function getNextStepForStatus(status: WorkflowStatus): WorkflowStep | null {
  if (
    status === "planned" ||
    status === "needs_revision" ||
    status === "blocked"
  )
    return "research";
  if (status === "in_progress") return "review";
  if (status === "in_review") return "approval";
  return null;
}

function getNextStepLabel(
  step: WorkflowStep,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  switch (step) {
    case "research":
      return t("orchestrator.workflow.action.startResearch");
    case "review":
      return t("orchestrator.workflow.action.sendToReview");
    case "approval":
      return t("orchestrator.workflow.action.sendToApproval");
    default:
      return t("orchestrator.workflow.action.advance");
  }
}

function formatRelativeDate(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function formatCountdown(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return "00:00";
  const totalSeconds = Math.ceil(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getArtifactCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function formatPlanStatusLabel(status: string): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "in_progress":
      return "In progress";
    case "waiting_for_worker":
      return "Waiting for worker";
    case "waiting_for_poll":
      return "Waiting for poll";
    case "awaiting_human_approval":
      return "Waiting for approval";
    case "blocked":
      return "Blocked";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function formatPlanReviewLabel(status: string): string {
  switch (status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "pending":
    default:
      return "Pending";
  }
}

function formatPlanReviewScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score))
    return "n/a";
  return score.toFixed(2);
}

function formatReadinessScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score))
    return "n/a";
  return score.toFixed(2);
}

function getPlanReviewScoreClasses(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  if (score >= 0.85) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (score >= 0.65) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function getPlanReviewScoreTooltip(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score))
    return "Plan review score is unavailable";
  if (score >= 0.85) return "High-confidence plan review result";
  if (score >= 0.65)
    return "Moderate-confidence plan review result that may need minor revision";
  return "Low-confidence plan review result that should be revised before execution";
}

function getPlanRecommendationClasses(recommendation: string | null): string {
  if (!recommendation) return "border-slate-200 bg-slate-50 text-slate-700";
  const normalized = recommendation.toLowerCase();
  if (/(proceed|continue|ready|approved|pass)/i.test(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (/(revise|repair|refine|improve|retry|loop)/i.test(normalized)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (/(block|halt|stop|escalate|human)/i.test(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatPlanRecommendationBadge(recommendation: string | null): string {
  if (!recommendation) return "Recommendation";
  const normalized = recommendation.toLowerCase();
  if (/(proceed|continue|ready|approved|pass)/i.test(normalized))
    return "Proceed";
  if (/(revise|repair|refine|improve|retry|loop)/i.test(normalized))
    return "Revise";
  if (/(block|halt|stop|escalate|human)/i.test(normalized)) return "Block";
  return "Review";
}

function getPlanRecommendationTooltip(recommendation: string | null): string {
  if (!recommendation) return "Recommendation from plan review";
  const normalized = recommendation.toLowerCase();
  if (/(proceed|continue|ready|approved|pass)/i.test(normalized)) {
    return "Plan review recommends proceeding to execution";
  }
  if (/(revise|repair|refine|improve|retry|loop)/i.test(normalized)) {
    return "Plan review recommends revising the plan before execution";
  }
  if (/(block|halt|stop|escalate|human)/i.test(normalized)) {
    return "Plan review recommends blocking execution or escalating to a human reviewer";
  }
  return "Plan review recommendation";
}

function getPlanReviewClasses(status: string): string {
  switch (status) {
    case "passed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "pending":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getPlanStatusClasses(status: string): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "waiting_for_worker":
    case "waiting_for_poll":
    case "awaiting_human_approval":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "blocked":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "planned":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getPlanVersionTooltip(version: number): string {
  return `Durable plan artifact version ${version}`;
}

function getPlanStatusTooltip(status: string): string {
  switch (status) {
    case "completed":
      return "Plan execution is completed";
    case "in_progress":
      return "Plan is currently being executed";
    case "waiting_for_worker":
      return "Plan is waiting for an async worker to finish";
    case "waiting_for_poll":
      return "Plan is waiting for the next poll cycle";
    case "awaiting_human_approval":
      return "Plan is waiting for human approval before it can continue";
    case "blocked":
      return "Plan is blocked and needs attention";
    case "failed":
      return "Plan execution failed";
    case "planned":
    default:
      return "Plan has been prepared but not yet executed";
  }
}

function getPlanReviewStatusTooltip(status: string): string {
  switch (status) {
    case "passed":
      return "Plan review passed all checks";
    case "failed":
      return "Plan review failed and needs repair";
    case "pending":
    default:
      return "Plan review is pending";
  }
}

function getPlanLoopsTooltip(iteration: number): string {
  return `Plan review iteration ${iteration}`;
}

function getPlanStepsTooltip(stepCount: number): string {
  return `Plan contains ${stepCount} executable steps`;
}

function getExplorationBadgeClasses(
  selected: boolean,
  riskClass: "low" | "medium" | "high" | "critical"
): string {
  const base = selected
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
  if (selected) return base;
  switch (riskClass) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "high":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "low":
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function getExplorationCandidateTooltip(candidate: {
  candidateId: string;
  title: string;
  strategy: string;
  summary: string;
  strengths: string[];
  tradeoffs: string[];
  riskClass: "low" | "medium" | "high" | "critical";
}): string {
  return [
    `${candidate.title} (${candidate.riskClass})`,
    `Strategy: ${candidate.strategy}`,
    `Summary: ${candidate.summary}`,
    `Strengths: ${candidate.strengths.join(", ")}`,
    `Tradeoffs: ${candidate.tradeoffs.join(", ")}`,
  ].join(" | ");
}

function getPlanStepTooltip(step: {
  stepKey: string;
  title: string;
  objective: string;
  ownerPersona: string;
  reviewerPersona: string;
  verificationMethod: string;
  retryRule: string;
  evidenceRequirements: string[];
  status: string;
  notes: string | null;
}): string {
  const parts = [
    `${step.title} (${formatPlanStatusLabel(step.status)})`,
    `Owner: ${step.ownerPersona}`,
    `Reviewer: ${step.reviewerPersona}`,
    `Verification: ${step.verificationMethod}`,
    `Retry: ${step.retryRule}`,
    `Evidence: ${step.evidenceRequirements.join(", ")}`,
  ];
  if (step.notes) {
    parts.push(`Note: ${step.notes}`);
  }
  return parts.join(" | ");
}

function selectCoordinatorMemberId(
  teamMembers: WorkflowMemberSummary[]
): string | null {
  return (
    teamMembers.find(
      member =>
        member.memberKind === "assistant" &&
        member.memberRole === "orchestrator"
    )?.id ??
    teamMembers.find(
      member => member.memberKind === "assistant" && member.isLead
    )?.id ??
    teamMembers.find(member => member.memberKind === "assistant")?.id ??
    null
  );
}

function getResponsibleMemberId(item: WorkItemRecord): string | null {
  if (item.status === "in_review") return item.reviewerMemberId ?? null;
  if (item.status === "awaiting_approval") return item.approverMemberId ?? null;
  return item.assignedMemberId ?? null;
}

function getPauseKindFromReason(
  reason?: string | null
): "human" | "external_connector" | null {
  if (reason?.includes("human member")) return "human";
  if (reason?.includes("external connector")) return "external_connector";
  return null;
}

function getRecommendedAction(input: {
  item: WorkItemRecord;
  pauseKind: "human" | "external_connector" | null;
  requiresAttention: boolean;
  runStatus:
    | "idle"
    | "queued"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "stopped";
  t: (key: string, vars?: Record<string, string | number>) => string;
}): { label: string; tone: "amber" | "blue" | "emerald" | "slate" } {
  const { item, pauseKind, requiresAttention, runStatus, t } = input;

  if (requiresAttention && pauseKind === "human") {
    return {
      label:
        item.status === "awaiting_approval"
          ? t("orchestrator.workflow.recommended.needsHumanApproval")
          : t("orchestrator.workflow.recommended.needsHumanReview"),
      tone: "amber",
    };
  }

  if (requiresAttention && pauseKind === "external_connector") {
    return {
      label: t("orchestrator.workflow.recommended.waitingExternal"),
      tone: "amber",
    };
  }

  if (
    runStatus === "paused" &&
    item.status === "awaiting_approval" &&
    item.approvalState === "approved"
  ) {
    return {
      label: t("orchestrator.workflow.recommended.readyToResume"),
      tone: "emerald",
    };
  }

  switch (item.status) {
    case "planned":
      return {
        label: t("orchestrator.workflow.recommended.startResearch"),
        tone: "blue",
      };
    case "in_progress":
      return {
        label: t("orchestrator.workflow.recommended.prepareReview"),
        tone: "blue",
      };
    case "in_review":
      return {
        label: t("orchestrator.workflow.recommended.reviewFeedbackPending"),
        tone: "amber",
      };
    case "needs_revision":
      return {
        label: t("orchestrator.workflow.recommended.reviseContinue"),
        tone: "amber",
      };
    case "awaiting_approval":
      return {
        label: t("orchestrator.workflow.recommended.approvalNeeded"),
        tone: "amber",
      };
    case "blocked":
      return {
        label: t("orchestrator.workflow.recommended.unblockFirst"),
        tone: "amber",
      };
    case "completed":
      return {
        label: t("orchestrator.workflow.status.completed"),
        tone: "emerald",
      };
    case "failed":
      return {
        label: t("orchestrator.workflow.recommended.needsRecovery"),
        tone: "amber",
      };
    case "cancelled":
    case "superseded":
      return {
        label: t("orchestrator.workflow.recommended.noFurtherAction"),
        tone: "slate",
      };
    default:
      return {
        label: t("orchestrator.workflow.recommended.reviewNextStep"),
        tone: "slate",
      };
  }
}

function getRecommendedActionClasses(
  tone: "amber" | "blue" | "emerald" | "slate"
): string {
  switch (tone) {
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "blue":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "slate":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function RoomWorkflowPanel({
  roomId,
  runId,
  roomType,
  roomGoal,
  roomLanguage = "en",
  runtimeState,
  teamMembers,
  runStatus = "idle",
  runStatusReason,
  onResumeRun,
  onChooseExplorationCandidate,
  onRejectExplorationCandidates,
  onApproveFinalResult,
  onRejectFinalResult,
  onFocusThread,
  runControlsBusy = false,
  className,
}: RoomWorkflowPanelProps) {
  const [activeFilter, setActiveFilter] = useState<WorkflowBoardFilter>("all");
  const [clockTick, setClockTick] = useState<number>(Date.now());
  const utils = trpc.useUtils();
  const { t } = useScopedTranslation("agency");
  const coordinatorMemberId = selectCoordinatorMemberId(teamMembers);
  const memberNameById = new Map(
    teamMembers.map(member => [
      member.id,
      member.displayName?.trim() || member.id,
    ])
  );
  const memberKindById = new Map(
    teamMembers.map(member => [member.id, member.memberKind ?? null])
  );
  const policyGateMeta = useMemo(() => {
    if (!runtimeState?.policyGateReason) return null;
    return classifyPolicyGateReason(runtimeState.policyGateReason);
  }, [runtimeState?.policyGateReason]);
  const routeBadge = useMemo(
    () =>
      runtimeState
        ? getExecutionRouteBadge({
            selectedSkillId: runtimeState.selectedSkillId,
            routeReason: runtimeState.routeReason,
          })
        : null,
    [runtimeState]
  );
  const explorationChoiceCountdown = useMemo(
    () => formatCountdown(runtimeState?.choiceDeadlineAt),
    [clockTick, runtimeState?.choiceDeadlineAt]
  );
  const finalApprovalCountdown = useMemo(
    () => formatCountdown(runtimeState?.finalReviewDeadlineAt),
    [clockTick, runtimeState?.finalReviewDeadlineAt]
  );
  const runtimeStateRawJson = useMemo(
    () => (runtimeState ? JSON.stringify(runtimeState, null, 2) : null),
    [runtimeState]
  );
  useEffect(() => {
    if (!runtimeState?.choiceDeadlineAt) return;
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [runtimeState?.choiceDeadlineAt]);

  const {
    data: workItems,
    isLoading,
    error: workItemsError,
  } = trpc.teamWorkItem.listByRoom.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchInterval: 5000,
      retry: false,
    }
  );

  const { data: roomMessages } = trpc.teamRoom.getMessages.useQuery(
    {
      roomId,
      viewMode: "transparent",
      limit: 100,
    },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
      refetchInterval: 5000,
    }
  );

  const { data: viewerState } = trpc.teamRoom.viewerState.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
    }
  );

  const invalidateWorkflow = async () => {
    await Promise.all([
      utils.teamWorkItem.listByRoom.invalidate({ roomId }),
      roomType === "auto_team"
        ? utils.teamRoom.getAutoTeamLedger.invalidate({
            roomId,
            runId,
          })
        : Promise.resolve(),
      runId ? utils.teamRun.get.invalidate({ runId }) : Promise.resolve(),
    ]);
  };

  const { data: autoTeamLedger, error: autoTeamLedgerError } = trpc.teamRoom.getAutoTeamLedger.useQuery(
    {
      roomId,
      runId,
      limitMessages: 200,
    },
    {
      enabled: roomType === "auto_team" && !!roomId,
      refetchOnWindowFocus: false,
      refetchInterval: roomType === "auto_team" ? 4000 : false,
    }
  );

  const advanceWorkflowMutation = trpc.teamWorkItem.advanceWorkflow.useMutation(
    {
      onSuccess: async (_, variables) => {
        await invalidateWorkflow();
        toast.success(
          t("orchestrator.room.toast.workItemAdvanced", {
            stage: variables.targetStep ?? t("orchestrator.workflow.nextStage"),
          })
        );
      },
      onError: error => toast.error(error.message),
    }
  );

  const approveMutation = trpc.teamWorkItem.approve.useMutation({
    onSuccess: async () => {
      await invalidateWorkflow();
      toast.success(t("orchestrator.room.toast.workItemApproved"));
    },
    onError: error => toast.error(error.message),
  });

  const rejectMutation = trpc.teamWorkItem.reject.useMutation({
    onSuccess: async () => {
      await invalidateWorkflow();
      toast.success(t("orchestrator.workflow.toast.revisionSentBack"));
    },
    onError: error => toast.error(error.message),
  });

  const items = [...((workItems ?? []) as WorkItemRecord[])].sort(
    (left, right) => {
      const rightTs = new Date(
        right.updatedAt ?? right.createdAt ?? 0
      ).getTime();
      const leftTs = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
      return rightTs - leftTs;
    }
  );

  const counts = {
    open: items.filter(
      item => !["completed", "cancelled", "superseded"].includes(item.status)
    ).length,
    inReview: items.filter(item => item.status === "in_review").length,
    approval: items.filter(item => item.status === "awaiting_approval").length,
    completed: items.filter(item => item.status === "completed").length,
  };

  const threadActivityByRoot = new Map<
    string,
    { latestAt: number; totalMessages: number; nonSystemMessages: number }
  >();
  for (const message of (roomMessages ?? []) as RoomMessageRecord[]) {
    const metadata = normalizeWorkflowMessageMetadata(message.metadataJson);
    const rootId =
      metadata.threadRootMessageId ?? (metadata.workItemId ? message.id : null);
    if (!rootId) continue;
    const createdAt = new Date(message.createdAt ?? 0).getTime();
    const existing = threadActivityByRoot.get(rootId) ?? {
      latestAt: 0,
      totalMessages: 0,
      nonSystemMessages: 0,
    };

    existing.latestAt = Math.max(
      existing.latestAt,
      Number.isFinite(createdAt) ? createdAt : 0
    );
    existing.totalMessages += 1;
    if (message.senderType && message.senderType !== "system") {
      existing.nonSystemMessages += 1;
    }
    threadActivityByRoot.set(rootId, existing);
  }

  const pauseKind = getPauseKindFromReason(runStatusReason);
  const viewerLastViewedAtMs = (() => {
    const value = (viewerState as RoomViewerStateRecord | undefined)
      ?.lastViewedAt;
    if (!value) return null;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : null;
  })();
  const blockedActionItems = pauseKind
    ? items.filter(item => {
        const responsibleMemberId = getResponsibleMemberId(item);
        if (!responsibleMemberId) return false;
        return memberKindById.get(responsibleMemberId) === pauseKind;
      })
    : [];

  const enrichedItems = useMemo(() => {
    return items.map(item => {
      const responsibleMemberId = getResponsibleMemberId(item);
      const requiresAttention =
        pauseKind !== null &&
        responsibleMemberId !== null &&
        memberKindById.get(responsibleMemberId) === pauseKind;
      const recommendedAction = getRecommendedAction({
        item,
        pauseKind,
        requiresAttention,
        runStatus,
        t,
      });
      const threadActivity = item.threadRootMessageId
        ? threadActivityByRoot.get(item.threadRootMessageId)
        : undefined;
      const updatedAtTs = new Date(
        item.updatedAt ?? item.createdAt ?? 0
      ).getTime();
      const hasNewThreadActivity = Boolean(
        threadActivity &&
        (viewerLastViewedAtMs !== null
          ? threadActivity.nonSystemMessages > 0 &&
            threadActivity.latestAt > viewerLastViewedAtMs
          : threadActivity.nonSystemMessages > 1 &&
            threadActivity.latestAt > updatedAtTs)
      );
      const isBlockedLike =
        item.status === "blocked" ||
        item.status === "awaiting_approval" ||
        item.status === "needs_revision";

      return {
        item,
        responsibleMemberId,
        requiresAttention,
        recommendedAction,
        hasNewThreadActivity,
        isBlockedLike,
      };
    });
  }, [
    items,
    memberKindById,
    pauseKind,
    runStatus,
    t,
    threadActivityByRoot,
    viewerLastViewedAtMs,
  ]);

  const filterCounts = {
    all: enrichedItems.length,
    attention: enrichedItems.filter(
      entry => entry.requiresAttention || entry.hasNewThreadActivity
    ).length,
    blocked: enrichedItems.filter(entry => entry.isBlockedLike).length,
  };

  const filteredItems = enrichedItems.filter(entry => {
    if (activeFilter === "attention") {
      return entry.requiresAttention || entry.hasNewThreadActivity;
    }
    if (activeFilter === "blocked") {
      return entry.isBlockedLike;
    }
    return true;
  });

  const handleAdvance = (item: WorkItemRecord, targetStep: WorkflowStep) => {
    if (!coordinatorMemberId) {
      toast.error(
        t("orchestrator.workflow.error.assistantCoordinatorRequired")
      );
      return;
    }

    advanceWorkflowMutation.mutate({
      workItemId: item.id,
      expectedRevisionVersion: item.revisionVersion,
      targetStep,
      actorAssistantId: coordinatorMemberId,
    });
  };

  const handleApprove = async (
    item: WorkItemRecord,
    options?: { resumeAfter?: boolean }
  ) => {
    const approverMemberId = item.approverMemberId ?? coordinatorMemberId;
    if (!approverMemberId) {
      toast.error(t("orchestrator.workflow.error.noApprover"));
      return;
    }

    await approveMutation.mutateAsync({
      workItemId: item.id,
      expectedRevisionVersion: item.revisionVersion,
      approverMemberId,
    });

    if (options?.resumeAfter) {
      onResumeRun?.();
    }
  };

  const handleReject = async (
    item: WorkItemRecord,
    options?: { resumeAfter?: boolean }
  ) => {
    const approverMemberId = item.approverMemberId ?? coordinatorMemberId;
    if (!approverMemberId) {
      toast.error(t("orchestrator.workflow.error.noApprover"));
      return;
    }

    const reason = window.prompt(
      t("orchestrator.workflow.prompt.improveBeforeRevision"),
      t("orchestrator.workflow.prompt.reviseLatestDraft")
    );
    if (reason === null) return;

    await rejectMutation.mutateAsync({
      workItemId: item.id,
      expectedRevisionVersion: item.revisionVersion,
      approverMemberId,
      reason: reason.trim() || undefined,
    });

    if (options?.resumeAfter) {
      onResumeRun?.();
    }
  };

  if (roomType === "auto_team") {
    return (
      <AutoTeamLedgerPanel
        ledger={autoTeamLedger ?? null}
        ledgerError={autoTeamLedgerError?.message ?? null}
        roomMessages={roomMessages ?? []}
        runtimeState={runtimeState}
        roomLanguage={roomLanguage}
        teamMembers={teamMembers}
        runStatus={runStatus}
        runStatusReason={runStatusReason}
        onFocusThread={onFocusThread}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-l bg-muted/20",
        className
      )}
    >
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranchPlus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {t("orchestrator.workflow.title")}
          </h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("orchestrator.workflow.description")}
        </p>
        {roomGoal && (
          <div className="mt-3 rounded-lg border bg-background px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              {t("orchestrator.workflow.currentObjective")}
            </div>
            <p className="mt-1 text-sm">{roomGoal}</p>
          </div>
        )}
        {runtimeState && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Phase: {runtimeState.currentPhase}
              </Badge>
              <Badge variant="outline">
                Verification: {runtimeState.verificationState}
              </Badge>
              {(runtimeState.traceId ||
                runtimeState.traceEnvelope?.traceId) && (
                <Badge variant="outline" className="font-mono">
                  Trace:{" "}
                  {(
                    runtimeState.traceId ?? runtimeState.traceEnvelope?.traceId
                  )?.slice(0, 12)}
                </Badge>
              )}
              {runtimeState.riskClass && (
                <Badge variant="outline">Risk: {runtimeState.riskClass}</Badge>
              )}
              {runtimeState.reviewerPersona && (
                <Badge variant="outline">
                  Reviewer: {runtimeState.reviewerPersona}
                </Badge>
              )}
              {runtimeState.policyGateReason && policyGateMeta && (
                <Badge
                  title={`Policy gate (${policyGateMeta.label}): ${runtimeState.policyGateReason}`}
                  className={cn("border", policyGateMeta.classes)}
                >
                  Policy gate: {policyGateMeta.label}
                </Badge>
              )}
              {runtimeState.selectedSkillId && (
                <Badge
                  variant="outline"
                  className="border-sky-200 bg-sky-50 text-sky-700"
                  title={
                    runtimeState.routeReason
                      ? `Route reason: ${runtimeState.routeReason}`
                      : `Selected skill: ${runtimeState.selectedSkillId}`
                  }
                >
                  Skill: {runtimeState.selectedSkillId}
                </Badge>
              )}
              {routeBadge && (
                <Badge
                  variant="outline"
                  title={routeBadge.title}
                  className={cn("text-[11px]", routeBadge.className)}
                >
                  {routeBadge.label}
                </Badge>
              )}
            </div>
            <div className="mt-2 space-y-1">
              {runtimeState.waitingReason && (
                <p>Waiting: {runtimeState.waitingReason}</p>
              )}
              {runtimeState.policyGateReason && (
                <p className="text-amber-700">
                  Policy gate: {runtimeState.policyGateReason}
                </p>
              )}
              {runtimeState.selectedSkillId && (
                <p className="text-sky-700">
                  Route: {routeBadge?.label ?? runtimeState.selectedSkillId}
                  {runtimeState.routeReason
                    ? ` · ${runtimeState.routeReason}`
                    : ""}
                </p>
              )}
              {runtimeState.nextPollAt && (
                <p>Next poll: {runtimeState.nextPollAt}</p>
              )}
              <p>Evidence refs: {runtimeState.evidenceRefs.length}</p>
              {runtimeState.readinessRecord && (
                <p>
                  Readiness: {runtimeState.readinessRecord.status} ·{" "}
                  {formatReadinessScore(runtimeState.readinessRecord.score)}
                </p>
              )}
              {runtimeState.governedContext && (
                <p>Context: {runtimeState.governedContext.summary}</p>
              )}
              {runtimeState.workOsLinkage && (
                <p>
                  Work OS mirror:{" "}
                  {runtimeState.workOsLinkage.projectedWorkOsState} (
                  {runtimeState.workOsLinkage.teamId}/
                  {runtimeState.workOsLinkage.roomId})
                </p>
              )}
            </div>
          </div>
        )}
        {runtimeState?.planArtifact ? (
          <Tabs defaultValue="summary" className="mt-3">
            <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="evidence">Evidence</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-background px-3 py-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    title={getPlanVersionTooltip(
                      runtimeState.planArtifact.version
                    )}
                    variant="outline"
                  >
                    Plan v{runtimeState.planArtifact.version}
                  </Badge>
                  <Badge
                    title={getPlanStatusTooltip(
                      runtimeState.planArtifact.status
                    )}
                    className={cn(
                      "border",
                      getPlanStatusClasses(runtimeState.planArtifact.status)
                    )}
                  >
                    {formatPlanStatusLabel(runtimeState.planArtifact.status)}
                  </Badge>
                  <Badge
                    title={getPlanReviewStatusTooltip(
                      runtimeState.planArtifact.review.status
                    )}
                    className={cn(
                      "border",
                      getPlanReviewClasses(
                        runtimeState.planArtifact.review.status
                      )
                    )}
                  >
                    Review:{" "}
                    {formatPlanReviewLabel(
                      runtimeState.planArtifact.review.status
                    )}
                  </Badge>
                  <Badge
                    title={getPlanReviewScoreTooltip(
                      runtimeState.planArtifact.review.score
                    )}
                    className={cn(
                      "border",
                      getPlanReviewScoreClasses(
                        runtimeState.planArtifact.review.score
                      )
                    )}
                  >
                    Score:{" "}
                    {formatPlanReviewScore(
                      runtimeState.planArtifact.review.score
                    )}
                  </Badge>
                  {runtimeState.planArtifact.review.recommendation && (
                    <Badge
                      title={getPlanRecommendationTooltip(
                        runtimeState.planArtifact.review.recommendation
                      )}
                      className={cn(
                        "border",
                        getPlanRecommendationClasses(
                          runtimeState.planArtifact.review.recommendation
                        )
                      )}
                    >
                      {formatPlanRecommendationBadge(
                        runtimeState.planArtifact.review.recommendation
                      )}
                    </Badge>
                  )}
                  <Badge
                    title={getPlanLoopsTooltip(
                      runtimeState.planArtifact.review.iteration
                    )}
                    variant="outline"
                  >
                    Loops: {runtimeState.planArtifact.review.iteration}
                  </Badge>
                  <Badge
                    title={getPlanStepsTooltip(
                      runtimeState.planArtifact.steps.length
                    )}
                    variant="outline"
                  >
                    Steps: {runtimeState.planArtifact.steps.length}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Durable plan artifact written at{" "}
                  {formatRelativeDate(
                    runtimeState.planArtifact.lastUpdatedAt
                  ) ?? "n/a"}
                  .
                </p>
                {runtimeState.planArtifact.review.recommendation && (
                  <p className="mt-2 text-xs text-slate-700">
                    Recommendation:{" "}
                    {runtimeState.planArtifact.review.recommendation}
                  </p>
                )}
                {runtimeState.planArtifact.review.issues.length > 0 && (
                  <p className="mt-2 text-xs text-rose-700">
                    Review issues:{" "}
                    {runtimeState.planArtifact.review.issues.join(", ")}
                  </p>
                )}
              </div>

              {runtimeState.planArtifact.exploration && (
                <div className="rounded-md border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      title="Candidate plan comparison summary"
                      variant="outline"
                    >
                      Exploration
                    </Badge>
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Selected:{" "}
                      {
                        runtimeState.planArtifact.exploration
                          .selectedCandidateId
                      }
                    </Badge>
                    <Badge
                      variant="outline"
                      title="Comparison criteria used to rank candidate plans"
                    >
                      {runtimeState.planArtifact.exploration.criteria.length}{" "}
                      criteria
                    </Badge>
                    {runtimeState.currentPhase === "awaiting_human_choice" && (
                      <Badge
                        className="border-amber-200 bg-amber-50 text-amber-700"
                        title="Human choice window is open"
                      >
                        Choice window
                        {explorationChoiceCountdown
                          ? ` · ${explorationChoiceCountdown}`
                          : ""}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-700">
                    {runtimeState.planArtifact.exploration.selectionReason}
                  </p>
                  {runtimeState.currentPhase === "awaiting_human_choice" && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                      <p className="font-medium">Human in the loop</p>
                      <p className="mt-1">
                        Choose one candidate now or reject all to brainstorm
                        again. If the countdown ends without a decision, the
                        run stays paused so the choice remains explicit.
                      </p>
                      {runtimeState.choiceDeadlineAt && (
                        <p className="mt-1 font-medium">
                          Deadline:{" "}
                          {formatRelativeDate(runtimeState.choiceDeadlineAt) ??
                            "n/a"}
                        </p>
                      )}
                      {explorationChoiceCountdown && (
                        <p className="mt-1 font-semibold">
                          Time left: {explorationChoiceCountdown}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {runtimeState.planArtifact?.exploration?.candidates.map(
                          candidate => (
                            <Button
                              key={candidate.candidateId}
                              type="button"
                              size="sm"
                              variant={
                                candidate.candidateId ===
                                runtimeState.planArtifact?.exploration
                                  ?.selectedCandidateId
                                  ? "default"
                                  : "outline"
                              }
                              onClick={() =>
                                onChooseExplorationCandidate?.(
                                  candidate.candidateId
                                )
                              }
                              disabled={!onChooseExplorationCandidate}
                            >
                              Choose {candidate.title}
                            </Button>
                          )
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() =>
                            onRejectExplorationCandidates?.(
                              "Human rejected all candidate plans; brainstorm again."
                            )
                          }
                          disabled={!onRejectExplorationCandidates}
                        >
                          Reject all and replan
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 grid gap-2">
                    {runtimeState.planArtifact?.exploration?.candidates.map(
                      candidate => {
                        const isSelected =
                          candidate.candidateId ===
                          runtimeState.planArtifact?.exploration
                            ?.selectedCandidateId;
                        return (
                          <div
                            key={candidate.candidateId}
                            title={getExplorationCandidateTooltip(candidate)}
                            className={cn(
                              "rounded-md border p-2 text-xs",
                              getExplorationBadgeClasses(
                                isSelected,
                                candidate.riskClass
                              )
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className={cn(
                                  "border",
                                  getExplorationBadgeClasses(
                                    isSelected,
                                    candidate.riskClass
                                  )
                                )}
                              >
                                {candidate.title}
                              </Badge>
                              <span className="text-[11px] uppercase tracking-wide opacity-70">
                                {candidate.strategy}
                              </span>
                              {isSelected && (
                                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                  Chosen
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] opacity-90">
                              {candidate.summary}
                            </p>
                            <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                Strengths: {candidate.strengths.join(", ")}
                              </div>
                              <div className="sm:col-span-2">
                                Tradeoffs: {candidate.tradeoffs.join(", ")}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

              {runtimeState.currentPhase === "awaiting_final_approval" &&
                runtimeState.finalReview && (
                  <div className="rounded-md border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className="border-violet-200 bg-violet-50 text-violet-700"
                        title="The automation reviewer scored the final output"
                      >
                        Final reviewer
                      </Badge>
                      <Badge
                        className="border-slate-200 bg-white text-slate-700"
                        title="Final reviewer persona"
                      >
                        {runtimeState.finalReview.reviewerPersona ?? "reviewer"}
                      </Badge>
                      <Badge
                        title="Final reviewer score"
                        className={cn(
                          "border",
                          getPlanReviewScoreClasses(
                            runtimeState.finalReview.score
                          )
                        )}
                      >
                        Score:{" "}
                        {formatPlanReviewScore(runtimeState.finalReview.score)}
                      </Badge>
                      {runtimeState.finalReview.recommendation && (
                        <Badge
                          title={getPlanRecommendationTooltip(
                            runtimeState.finalReview.recommendation
                          )}
                          className={cn(
                            "border",
                            getPlanRecommendationClasses(
                              runtimeState.finalReview.recommendation
                            )
                          )}
                        >
                          {formatPlanRecommendationBadge(
                            runtimeState.finalReview.recommendation
                          )}
                        </Badge>
                      )}
                      {runtimeState.finalReviewDeadlineAt && (
                        <Badge
                          className="border-violet-200 bg-violet-50 text-violet-700"
                          title="Human approval window"
                        >
                          Approval window
                          {finalApprovalCountdown
                            ? ` · ${finalApprovalCountdown}`
                            : ""}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-violet-900/90">
                      {runtimeState.finalReview.comment ??
                        "The reviewer has approved the run and is waiting for a human decision."}
                    </p>
                    {runtimeState.finalReview.issues.length > 0 && (
                      <p className="mt-2 text-xs text-rose-700">
                        Review issues:{" "}
                        {runtimeState.finalReview.issues.join(", ")}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          onApproveFinalResult?.(
                            "Human approved the final reviewed output."
                          )
                        }
                        disabled={!onApproveFinalResult}
                      >
                        Approve final result
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() =>
                          onRejectFinalResult?.(
                            "Human rejected the final reviewed output; replan needed."
                          )
                        }
                        disabled={!onRejectFinalResult}
                      >
                        Reject and replan
                      </Button>
                    </div>
                  </div>
                )}
            </TabsContent>

            <TabsContent value="evidence" className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-background px-3 py-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    Evidence refs: {runtimeState.evidenceRefs.length}
                  </Badge>
                  {runtimeState.workOsLinkage && (
                    <Badge variant="outline">
                      Work OS mirror:{" "}
                      {runtimeState.workOsLinkage.projectedWorkOsState}
                    </Badge>
                  )}
                  {runtimeState.policyGateReason && policyGateMeta && (
                    <Badge className={cn("border", policyGateMeta.classes)}>
                      Policy gate: {policyGateMeta.label}
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  These are the evidence-bearing details behind the summary
                  view.
                </p>
              </div>
              <div className="space-y-2">
                {runtimeState.planArtifact.steps.map(step => (
                  <Collapsible
                    key={step.stepKey}
                    defaultOpen={step.status !== "completed"}
                  >
                    <div
                      title={getPlanStepTooltip(step)}
                      className="rounded-md border bg-muted/20 p-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              title={`Step status: ${formatPlanStatusLabel(step.status)}`}
                              className={cn(
                                "border",
                                getPlanStatusClasses(step.status)
                              )}
                            >
                              {formatPlanStatusLabel(step.status)}
                            </Badge>
                            <span className="min-w-0 text-xs font-medium text-foreground">
                              {step.title}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {step.objective}
                          </p>
                        </div>
                        <CollapsibleTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                          >
                            <ChevronDown className="mr-1 h-3.5 w-3.5" />
                            Details
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                      <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                        <div>Owner: {step.ownerPersona}</div>
                        <div>Reviewer: {step.reviewerPersona}</div>
                        <div>Verification: {step.verificationMethod}</div>
                        <div>Retry: {step.retryRule}</div>
                      </div>
                      <CollapsibleContent className="mt-2">
                        <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            Evidence: {step.evidenceRequirements.join(", ")}
                          </div>
                          {step.notes && (
                            <div className="sm:col-span-2">
                              Note: {step.notes}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="raw" className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-background px-3 py-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Runtime snapshot</Badge>
                  <Badge variant="outline">Plan artifact</Badge>
                  <Badge variant="outline">Bridge state</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Raw JSON is useful for debugging and for comparing the
                  underlying state with the summary and evidence views.
                </p>
              </div>
              <div className="rounded-md border bg-slate-950 p-3 text-xs text-slate-100">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium">runtimeState</p>
                  <Badge
                    variant="outline"
                    className="border-slate-700 bg-slate-900 text-slate-200"
                  >
                    JSON
                  </Badge>
                </div>
                <pre className="overflow-auto whitespace-pre-wrap break-words">
                  {runtimeStateRawJson ?? "null"}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b px-4 py-3">
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">
            {t("orchestrator.workflow.count.open")}
          </div>
          <div className="text-lg font-semibold">{counts.open}</div>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">
            {t("orchestrator.workflow.count.inReview")}
          </div>
          <div className="text-lg font-semibold">{counts.inReview}</div>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">
            {t("orchestrator.workflow.count.awaitingApproval")}
          </div>
          <div className="text-lg font-semibold">{counts.approval}</div>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">
            {t("orchestrator.workflow.count.completed")}
          </div>
          <div className="text-lg font-semibold">{counts.completed}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b px-4 py-3">
        <Button
          type="button"
          size="sm"
          variant={activeFilter === "all" ? "default" : "outline"}
          onClick={() => setActiveFilter("all")}
        >
          {t("orchestrator.workflow.filter.all")}
          <span className="ml-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px]">
            {filterCounts.all}
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeFilter === "attention" ? "default" : "outline"}
          onClick={() => setActiveFilter("attention")}
        >
          {t("orchestrator.workflow.filter.attention")}
          <span className="ml-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px]">
            {filterCounts.attention}
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeFilter === "blocked" ? "default" : "outline"}
          onClick={() => setActiveFilter("blocked")}
        >
          {t("orchestrator.workflow.filter.blocked")}
          <span className="ml-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px]">
            {filterCounts.blocked}
          </span>
        </Button>
      </div>

      {runStatus === "paused" && runStatusReason && (
        <div className="border-b bg-amber-50/80 px-4 py-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-700" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-amber-900">
                {pauseKind === "human"
                  ? t("orchestrator.workflow.pause.humanRequired")
                  : pauseKind === "external_connector"
                    ? t("orchestrator.workflow.pause.externalRequired")
                    : t("orchestrator.workflow.pause.runPaused")}
              </div>
              <p className="mt-1 text-xs text-amber-800">{runStatusReason}</p>
              {blockedActionItems.length > 0 && (
                <p className="mt-2 text-xs text-amber-900">
                  {t("orchestrator.workflow.pause.waitingItems", {
                    count: blockedActionItems.length,
                  })}
                </p>
              )}
              {runId && blockedActionItems.length === 0 && onResumeRun && (
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={onResumeRun}
                    disabled={runControlsBusy}
                  >
                    <Play className="mr-1 h-4 w-4" />
                    {t("orchestrator.common.resumeRun")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-3 p-4 pb-24">
          {workItemsError ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-6 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {t("orchestrator.workflow.loadErrorTitle")}
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    {t("orchestrator.workflow.loadErrorDescription")}
                  </p>
                  <p className="mt-2 break-words font-mono text-[11px] text-amber-900/80">
                    {workItemsError.message}
                  </p>
                </div>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center rounded-lg border bg-background px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("orchestrator.workflow.loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border bg-background px-4 py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileStack className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-medium">
                {t("orchestrator.workflow.emptyTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("orchestrator.workflow.emptyDescription")}
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border bg-background px-4 py-8 text-center">
              <p className="text-sm font-medium">
                {t("orchestrator.workflow.emptyFilterTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("orchestrator.workflow.emptyFilterDescription")}
              </p>
            </div>
          ) : (
            filteredItems.map(
              ({
                item,
                requiresAttention,
                recommendedAction,
                hasNewThreadActivity,
              }) => {
                const nextStep = getNextStepForStatus(item.status);
                const artifactCount = getArtifactCount(item.artifactRefsJson);
                const updatedAt = formatRelativeDate(item.updatedAt);
                const dueAt = formatRelativeDate(item.dueAt);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-xl border bg-background p-4 shadow-sm",
                      requiresAttention &&
                        "border-amber-300 ring-1 ring-amber-200"
                    )}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="truncate text-sm font-semibold">
                            {item.title}
                          </h4>
                          <Badge variant="outline">
                            v{item.revisionVersion}
                          </Badge>
                          {requiresAttention && (
                            <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                              {pauseKind === "human"
                                ? t("orchestrator.workflow.waitingForHuman")
                                : t("orchestrator.workflow.waitingForExternal")}
                            </Badge>
                          )}
                        </div>
                        {item.objective && (
                          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                            {item.objective}
                          </p>
                        )}
                      </div>
                      <Badge
                        className={cn("border", getStatusClasses(item.status))}
                      >
                        {formatWorkflowStatus(item.status, t)}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge
                        className={cn(
                          "border",
                          getRecommendedActionClasses(recommendedAction.tone)
                        )}
                      >
                        {recommendedAction.label}
                      </Badge>
                      {item.priority && (
                        <Badge variant="secondary">{item.priority}</Badge>
                      )}
                      {item.riskClass && (
                        <Badge variant="outline">
                          <ShieldAlert className="mr-1 h-3 w-3" />
                          {item.riskClass}
                        </Badge>
                      )}
                      {artifactCount > 0 && (
                        <Badge variant="outline">
                          <ClipboardCheck className="mr-1 h-3 w-3" />
                          {t("orchestrator.workflow.artifactCount", {
                            count: artifactCount,
                          })}
                        </Badge>
                      )}
                      {item.activeDraftArtifactId && (
                        <Badge variant="outline">
                          <MessageSquareQuote className="mr-1 h-3 w-3" />
                          {t("orchestrator.workflow.draftReady")}
                        </Badge>
                      )}
                      {hasNewThreadActivity && (
                        <Badge className="border border-amber-200 bg-amber-50 text-amber-800">
                          {t("orchestrator.workflow.unreadThreadActivity")}
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-3.5 w-3.5" />
                        <span>
                          {t("orchestrator.workflow.researchLabel")}:{" "}
                          {item.assignedMemberId
                            ? (memberNameById.get(item.assignedMemberId) ??
                              item.assignedMemberId)
                            : t("orchestrator.workflow.unassigned")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserRound className="h-3.5 w-3.5" />
                        <span>
                          {t("orchestrator.workflow.reviewLabel")}:{" "}
                          {item.reviewerMemberId
                            ? (memberNameById.get(item.reviewerMemberId) ??
                              item.reviewerMemberId)
                            : t("orchestrator.workflow.unassigned")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserRound className="h-3.5 w-3.5" />
                        <span>
                          {t("orchestrator.workflow.approvalLabel")}:{" "}
                          {item.approverMemberId
                            ? (memberNameById.get(item.approverMemberId) ??
                              item.approverMemberId)
                            : t("orchestrator.workflow.unassigned")}
                        </span>
                      </div>
                      {updatedAt && (
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span>
                            {t("orchestrator.workflow.updatedAt", {
                              value: updatedAt,
                            })}
                          </span>
                        </div>
                      )}
                      {dueAt && (
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-3.5 w-3.5" />
                          <span>
                            {t("orchestrator.workflow.dueAt", { value: dueAt })}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.threadRootMessageId && onFocusThread && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            onFocusThread(item.threadRootMessageId!, {
                              workItemId: item.id,
                              composeReply: true,
                            })
                          }
                        >
                          <MessageSquareQuote className="mr-1 h-4 w-4" />
                          {t("orchestrator.workflow.openThread")}
                        </Button>
                      )}
                      {nextStep && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdvance(item, nextStep)}
                          disabled={
                            advanceWorkflowMutation.isPending ||
                            !coordinatorMemberId
                          }
                        >
                          {advanceWorkflowMutation.isPending ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRight className="mr-1 h-4 w-4" />
                          )}
                          {getNextStepLabel(nextStep, t)}
                        </Button>
                      )}
                      {item.status === "awaiting_approval" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleApprove(item)}
                            disabled={
                              approveMutation.isPending || runControlsBusy
                            }
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                            )}
                            {t("orchestrator.common.approve")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleReject(item)}
                            disabled={
                              rejectMutation.isPending || runControlsBusy
                            }
                          >
                            {rejectMutation.isPending ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCcw className="mr-1 h-4 w-4" />
                            )}
                            {t("orchestrator.common.requestChanges")}
                          </Button>
                          {requiresAttention &&
                            pauseKind === "human" &&
                            onResumeRun && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    void handleApprove(item, {
                                      resumeAfter: true,
                                    })
                                  }
                                  disabled={
                                    approveMutation.isPending || runControlsBusy
                                  }
                                >
                                  <Play className="mr-1 h-4 w-4" />
                                  {t("orchestrator.workflow.approveAndResume")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void handleReject(item, {
                                      resumeAfter: true,
                                    })
                                  }
                                  disabled={
                                    rejectMutation.isPending || runControlsBusy
                                  }
                                >
                                  <Play className="mr-1 h-4 w-4" />
                                  {t("orchestrator.workflow.reviseAndResume")}
                                </Button>
                              </>
                            )}
                        </>
                      )}
                    </div>
                  </div>
                );
              }
            )
          )}
        </div>
      </div>
    </div>
  );
}
