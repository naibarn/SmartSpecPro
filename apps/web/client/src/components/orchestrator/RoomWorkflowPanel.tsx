import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

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
  roomGoal?: string | null;
  teamMembers: WorkflowMemberSummary[];
  runStatus?: "idle" | "queued" | "running" | "paused" | "completed" | "failed" | "stopped";
  runStatusReason?: string | null;
  onResumeRun?: () => void;
  onFocusThread?: (messageId: string, options?: { workItemId?: string; composeReply?: boolean }) => void;
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

function normalizeWorkflowMessageMetadata(value: unknown): WorkflowMessageMetadata {
  if (!value || typeof value !== "object") return {};
  const metadata = value as Record<string, unknown>;
  return {
    workItemId: typeof metadata.workItemId === "string" ? metadata.workItemId : null,
    threadRootMessageId: typeof metadata.threadRootMessageId === "string" ? metadata.threadRootMessageId : null,
  };
}

function formatWorkflowStatus(
  status: WorkflowStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
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

function getNextStepForStatus(status: WorkflowStatus): WorkflowStep | null {
  if (status === "planned" || status === "needs_revision" || status === "blocked") return "research";
  if (status === "in_progress") return "review";
  if (status === "in_review") return "approval";
  return null;
}

function getNextStepLabel(
  step: WorkflowStep,
  t: (key: string, vars?: Record<string, string | number>) => string,
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

function getArtifactCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function selectCoordinatorMemberId(teamMembers: WorkflowMemberSummary[]): string | null {
  return (
    teamMembers.find((member) => member.memberKind === "assistant" && member.memberRole === "orchestrator")?.id ??
    teamMembers.find((member) => member.memberKind === "assistant" && member.isLead)?.id ??
    teamMembers.find((member) => member.memberKind === "assistant")?.id ??
    null
  );
}

function getResponsibleMemberId(item: WorkItemRecord): string | null {
  if (item.status === "in_review") return item.reviewerMemberId ?? null;
  if (item.status === "awaiting_approval") return item.approverMemberId ?? null;
  return item.assignedMemberId ?? null;
}

function getPauseKindFromReason(reason?: string | null): "human" | "external_connector" | null {
  if (reason?.includes("human member")) return "human";
  if (reason?.includes("external connector")) return "external_connector";
  return null;
}

function getRecommendedAction(input: {
  item: WorkItemRecord;
  pauseKind: "human" | "external_connector" | null;
  requiresAttention: boolean;
  runStatus: "idle" | "queued" | "running" | "paused" | "completed" | "failed" | "stopped";
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

  if (runStatus === "paused" && item.status === "awaiting_approval" && item.approvalState === "approved") {
    return {
      label: t("orchestrator.workflow.recommended.readyToResume"),
      tone: "emerald",
    };
  }

  switch (item.status) {
    case "planned":
      return { label: t("orchestrator.workflow.recommended.startResearch"), tone: "blue" };
    case "in_progress":
      return { label: t("orchestrator.workflow.recommended.prepareReview"), tone: "blue" };
    case "in_review":
      return { label: t("orchestrator.workflow.recommended.reviewFeedbackPending"), tone: "amber" };
    case "needs_revision":
      return { label: t("orchestrator.workflow.recommended.reviseContinue"), tone: "amber" };
    case "awaiting_approval":
      return { label: t("orchestrator.workflow.recommended.approvalNeeded"), tone: "amber" };
    case "blocked":
      return { label: t("orchestrator.workflow.recommended.unblockFirst"), tone: "amber" };
    case "completed":
      return { label: t("orchestrator.workflow.status.completed"), tone: "emerald" };
    case "failed":
      return { label: t("orchestrator.workflow.recommended.needsRecovery"), tone: "amber" };
    case "cancelled":
    case "superseded":
      return { label: t("orchestrator.workflow.recommended.noFurtherAction"), tone: "slate" };
    default:
      return { label: t("orchestrator.workflow.recommended.reviewNextStep"), tone: "slate" };
  }
}

function getRecommendedActionClasses(tone: "amber" | "blue" | "emerald" | "slate"): string {
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
  roomGoal,
  teamMembers,
  runStatus = "idle",
  runStatusReason,
  onResumeRun,
  onFocusThread,
  runControlsBusy = false,
  className,
}: RoomWorkflowPanelProps) {
  const [activeFilter, setActiveFilter] = useState<WorkflowBoardFilter>("all");
  const utils = trpc.useUtils();
  const { t } = useI18n();
  const coordinatorMemberId = selectCoordinatorMemberId(teamMembers);
  const memberNameById = new Map(
    teamMembers.map((member) => [member.id, member.displayName?.trim() || member.id]),
  );
  const memberKindById = new Map(
    teamMembers.map((member) => [member.id, member.memberKind ?? null]),
  );

  const { data: workItems, isLoading, error: workItemsError } = trpc.teamWorkItem.listByRoom.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchInterval: 5000,
      retry: false,
    },
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
    },
  );

  const { data: viewerState } = trpc.teamRoom.viewerState.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
    },
  );

  const invalidateWorkflow = async () => {
    await Promise.all([
      utils.teamWorkItem.listByRoom.invalidate({ roomId }),
      runId ? utils.teamRun.get.invalidate({ runId }) : Promise.resolve(),
    ]);
  };

  const advanceWorkflowMutation = trpc.teamWorkItem.advanceWorkflow.useMutation({
    onSuccess: async (_, variables) => {
      await invalidateWorkflow();
      toast.success(
        t("orchestrator.room.toast.workItemAdvanced", {
          stage: variables.targetStep ?? t("orchestrator.workflow.nextStage"),
        }),
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const approveMutation = trpc.teamWorkItem.approve.useMutation({
    onSuccess: async () => {
      await invalidateWorkflow();
      toast.success(t("orchestrator.room.toast.workItemApproved"));
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.teamWorkItem.reject.useMutation({
    onSuccess: async () => {
      await invalidateWorkflow();
      toast.success(t("orchestrator.workflow.toast.revisionSentBack"));
    },
    onError: (error) => toast.error(error.message),
  });

  const items = [...((workItems ?? []) as WorkItemRecord[])].sort((left, right) => {
    const rightTs = new Date(right.updatedAt ?? right.createdAt ?? 0).getTime();
    const leftTs = new Date(left.updatedAt ?? left.createdAt ?? 0).getTime();
    return rightTs - leftTs;
  });

  const counts = {
    open: items.filter((item) => !["completed", "cancelled", "superseded"].includes(item.status)).length,
    inReview: items.filter((item) => item.status === "in_review").length,
    approval: items.filter((item) => item.status === "awaiting_approval").length,
    completed: items.filter((item) => item.status === "completed").length,
  };

  const threadActivityByRoot = new Map<
    string,
    { latestAt: number; totalMessages: number; nonSystemMessages: number }
  >();
  for (const message of (roomMessages ?? []) as RoomMessageRecord[]) {
    const metadata = normalizeWorkflowMessageMetadata(message.metadataJson);
    const rootId = metadata.threadRootMessageId ?? (metadata.workItemId ? message.id : null);
    if (!rootId) continue;
    const createdAt = new Date(message.createdAt ?? 0).getTime();
    const existing = threadActivityByRoot.get(rootId) ?? {
      latestAt: 0,
      totalMessages: 0,
      nonSystemMessages: 0,
    };

    existing.latestAt = Math.max(existing.latestAt, Number.isFinite(createdAt) ? createdAt : 0);
    existing.totalMessages += 1;
    if (message.senderType && message.senderType !== "system") {
      existing.nonSystemMessages += 1;
    }
    threadActivityByRoot.set(rootId, existing);
  }

  const pauseKind = getPauseKindFromReason(runStatusReason);
  const viewerLastViewedAtMs = (() => {
    const value = (viewerState as RoomViewerStateRecord | undefined)?.lastViewedAt;
    if (!value) return null;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : null;
  })();
  const blockedActionItems = pauseKind
    ? items.filter((item) => {
        const responsibleMemberId = getResponsibleMemberId(item);
        if (!responsibleMemberId) return false;
        return memberKindById.get(responsibleMemberId) === pauseKind;
      })
    : [];

  const enrichedItems = useMemo(() => {
    return items.map((item) => {
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
      const updatedAtTs = new Date(item.updatedAt ?? item.createdAt ?? 0).getTime();
      const hasNewThreadActivity = Boolean(
        threadActivity && (
          viewerLastViewedAtMs !== null
            ? threadActivity.nonSystemMessages > 0 && threadActivity.latestAt > viewerLastViewedAtMs
            : threadActivity.nonSystemMessages > 1 && threadActivity.latestAt > updatedAtTs
        ),
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
  }, [items, memberKindById, pauseKind, runStatus, t, threadActivityByRoot, viewerLastViewedAtMs]);

  const filterCounts = {
    all: enrichedItems.length,
    attention: enrichedItems.filter((entry) => entry.requiresAttention || entry.hasNewThreadActivity).length,
    blocked: enrichedItems.filter((entry) => entry.isBlockedLike).length,
  };

  const filteredItems = enrichedItems.filter((entry) => {
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
      toast.error(t("orchestrator.workflow.error.assistantCoordinatorRequired"));
      return;
    }

    advanceWorkflowMutation.mutate({
      workItemId: item.id,
      expectedRevisionVersion: item.revisionVersion,
      targetStep,
      actorAssistantId: coordinatorMemberId,
    });
  };

  const handleApprove = async (item: WorkItemRecord, options?: { resumeAfter?: boolean }) => {
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

  const handleReject = async (item: WorkItemRecord, options?: { resumeAfter?: boolean }) => {
    const approverMemberId = item.approverMemberId ?? coordinatorMemberId;
    if (!approverMemberId) {
      toast.error(t("orchestrator.workflow.error.noApprover"));
      return;
    }

    const reason = window.prompt(
      t("orchestrator.workflow.prompt.improveBeforeRevision"),
      t("orchestrator.workflow.prompt.reviseLatestDraft"),
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

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden border-l bg-muted/20", className)}>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranchPlus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("orchestrator.workflow.title")}</h3>
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
      </div>

      <div className="grid grid-cols-2 gap-2 border-b px-4 py-3">
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">{t("orchestrator.workflow.count.open")}</div>
          <div className="text-lg font-semibold">{counts.open}</div>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">{t("orchestrator.workflow.count.inReview")}</div>
          <div className="text-lg font-semibold">{counts.inReview}</div>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">{t("orchestrator.workflow.count.awaitingApproval")}</div>
          <div className="text-lg font-semibold">{counts.approval}</div>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2">
          <div className="text-xs text-muted-foreground">{t("orchestrator.workflow.count.completed")}</div>
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
          <span className="ml-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px]">{filterCounts.all}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeFilter === "attention" ? "default" : "outline"}
          onClick={() => setActiveFilter("attention")}
        >
          {t("orchestrator.workflow.filter.attention")}
          <span className="ml-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px]">{filterCounts.attention}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeFilter === "blocked" ? "default" : "outline"}
          onClick={() => setActiveFilter("blocked")}
        >
          {t("orchestrator.workflow.filter.blocked")}
          <span className="ml-1 rounded bg-black/10 px-1.5 py-0.5 text-[10px]">{filterCounts.blocked}</span>
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
                  {t("orchestrator.workflow.pause.waitingItems", { count: blockedActionItems.length })}
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
                  <p className="font-medium">{t("orchestrator.workflow.loadErrorTitle")}</p>
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
              <p className="mt-3 text-sm font-medium">{t("orchestrator.workflow.emptyTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("orchestrator.workflow.emptyDescription")}
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border bg-background px-4 py-8 text-center">
              <p className="text-sm font-medium">{t("orchestrator.workflow.emptyFilterTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("orchestrator.workflow.emptyFilterDescription")}
              </p>
            </div>
          ) : (
            filteredItems.map(({ item, requiresAttention, recommendedAction, hasNewThreadActivity }) => {
              const nextStep = getNextStepForStatus(item.status);
              const artifactCount = getArtifactCount(item.artifactRefsJson);
              const updatedAt = formatRelativeDate(item.updatedAt);
              const dueAt = formatRelativeDate(item.dueAt);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border bg-background p-4 shadow-sm",
                    requiresAttention && "border-amber-300 ring-1 ring-amber-200",
                  )}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-sm font-semibold">{item.title}</h4>
                        <Badge variant="outline">v{item.revisionVersion}</Badge>
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
                    <Badge className={cn("border", getStatusClasses(item.status))}>
                      {formatWorkflowStatus(item.status, t)}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge
                      className={cn(
                        "border",
                        getRecommendedActionClasses(recommendedAction.tone),
                      )}
                    >
                      {recommendedAction.label}
                    </Badge>
                    {item.priority && <Badge variant="secondary">{item.priority}</Badge>}
                    {item.riskClass && (
                      <Badge variant="outline">
                        <ShieldAlert className="mr-1 h-3 w-3" />
                        {item.riskClass}
                      </Badge>
                    )}
                    {artifactCount > 0 && (
                      <Badge variant="outline">
                        <ClipboardCheck className="mr-1 h-3 w-3" />
                        {t("orchestrator.workflow.artifactCount", { count: artifactCount })}
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
                        {t("orchestrator.workflow.researchLabel")}: {item.assignedMemberId
                          ? memberNameById.get(item.assignedMemberId) ?? item.assignedMemberId
                          : t("orchestrator.workflow.unassigned")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserRound className="h-3.5 w-3.5" />
                      <span>
                        {t("orchestrator.workflow.reviewLabel")}: {item.reviewerMemberId
                          ? memberNameById.get(item.reviewerMemberId) ?? item.reviewerMemberId
                          : t("orchestrator.workflow.unassigned")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserRound className="h-3.5 w-3.5" />
                      <span>
                        {t("orchestrator.workflow.approvalLabel")}: {item.approverMemberId
                          ? memberNameById.get(item.approverMemberId) ?? item.approverMemberId
                          : t("orchestrator.workflow.unassigned")}
                      </span>
                    </div>
                    {updatedAt && (
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>{t("orchestrator.workflow.updatedAt", { value: updatedAt })}</span>
                      </div>
                    )}
                    {dueAt && (
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>{t("orchestrator.workflow.dueAt", { value: dueAt })}</span>
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
                        disabled={advanceWorkflowMutation.isPending || !coordinatorMemberId}
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
                          disabled={approveMutation.isPending || runControlsBusy}
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
                          disabled={rejectMutation.isPending || runControlsBusy}
                        >
                          {rejectMutation.isPending ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="mr-1 h-4 w-4" />
                          )}
                          {t("orchestrator.common.requestChanges")}
                        </Button>
                        {requiresAttention && pauseKind === "human" && onResumeRun && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleApprove(item, { resumeAfter: true })}
                              disabled={approveMutation.isPending || runControlsBusy}
                            >
                              <Play className="mr-1 h-4 w-4" />
                              {t("orchestrator.workflow.approveAndResume")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleReject(item, { resumeAfter: true })}
                              disabled={rejectMutation.isPending || runControlsBusy}
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
            })
          )}
        </div>
      </div>
    </div>
  );
}
