/**
 * TeamRoomView — multi-agent conversation room view.
 *
 * Renders multi-avatar messages, system bubbles, and agent status indicators.
 * Integrates with useRunStream for live updates and tRPC for initial data.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useRunStream, type RunStreamEvent } from "@/hooks/useRunStream";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  ArrowRight,
  CheckCircle2,
  MessageSquareReply,
  PlusSquare,
  RefreshCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface TeamRoomActor {
  id: string;
  displayName?: string | null;
  memberKind?: "assistant" | "human" | "external_connector" | string | null;
  memberRole?: string | null;
  humanUserId?: number | null;
  isLead?: boolean | null;
}

interface TeamRoomMessageMetadata {
  messageType?: string | null;
  workItemId?: string | null;
  replyToMessageId?: string | null;
  threadRootMessageId?: string | null;
  citationRefs?: Array<{ id?: string; title?: string; url?: string; note?: string }>;
}

interface WorkItemSummary {
  id: string;
  title: string;
  status?: string | null;
  revisionVersion?: number | null;
  approverMemberId?: string | null;
}

interface ReplyTarget {
  messageId: string;
  threadRootMessageId?: string | null;
  workItemId?: string | null;
  actorLabel: string;
  preview: string;
}

interface TeamRoomViewProps {
  roomId: string;
  teamId?: string;
  runId?: string;
  teamName?: string;
  actors?: TeamRoomActor[];
  viewMode?: "transparent" | "milestone" | "summary";
  runStatus?: "idle" | "queued" | "running" | "paused" | "completed" | "failed" | "stopped";
  runStatusReason?: string | null;
  focusMessageRequest?: {
    messageId: string;
    nonce: number;
    workItemId?: string;
    composeReply?: boolean;
  } | null;
  onStartRun?: () => void;
  onPauseRun?: () => void;
  onResumeRun?: () => void;
  onAdvanceRun?: (maxTurns: number) => void;
  onStopRun?: () => void;
  runControlsBusy?: boolean;
  onSendMessage?: (input: {
    content: string;
    replyToMessageId?: string;
    threadRootMessageId?: string;
    workItemId?: string;
  }) => void;
}

const ACTOR_COLORS: Record<string, { bg: string; border: string; avatar: string }> = {
  system: { bg: "bg-amber-50", border: "border-amber-200", avatar: "bg-amber-500" },
  user: { bg: "bg-slate-50", border: "border-slate-200", avatar: "bg-slate-600" },
  assistant: { bg: "bg-blue-50", border: "border-blue-200", avatar: "bg-blue-500" },
};

const AGENT_AVATAR_COLORS = [
  "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-cyan-500",
  "bg-orange-500", "bg-indigo-500", "bg-teal-500", "bg-pink-500",
];

function getAgentColor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
  }
  return AGENT_AVATAR_COLORS[Math.abs(hash) % AGENT_AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function normalizeMessageMetadata(value: unknown): TeamRoomMessageMetadata {
  if (!value || typeof value !== "object") return {};
  const metadata = value as Record<string, unknown>;
  return {
    messageType: typeof metadata.messageType === "string" ? metadata.messageType : null,
    workItemId: typeof metadata.workItemId === "string" ? metadata.workItemId : null,
    replyToMessageId: typeof metadata.replyToMessageId === "string" ? metadata.replyToMessageId : null,
    threadRootMessageId: typeof metadata.threadRootMessageId === "string" ? metadata.threadRootMessageId : null,
    citationRefs: Array.isArray(metadata.citationRefs) ? (metadata.citationRefs as TeamRoomMessageMetadata["citationRefs"]) : [],
  };
}

function getEventPriorityScore(event: RunStreamEvent): number {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const metadata = normalizeMessageMetadata(data.metadata);
  let score = String(event.eventId).startsWith("history:") ? 2 : 1;
  if (metadata.messageType || metadata.workItemId || metadata.replyToMessageId || metadata.threadRootMessageId) {
    score += 3;
  }
  if (Array.isArray(metadata.citationRefs) && metadata.citationRefs.length > 0) {
    score += 1;
  }
  return score;
}

function formatMessageTypeLabel(
  messageType: string | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  switch (messageType) {
    case "work_update":
      return t("orchestrator.room.messageType.workUpdate");
    case "revision":
      return t("orchestrator.room.messageType.revision");
    case "critique":
      return t("orchestrator.room.messageType.critique");
    case "suggestion":
      return t("orchestrator.room.messageType.suggestion");
    case "approval":
      return t("orchestrator.room.messageType.approval");
    case "decision":
      return t("orchestrator.room.messageType.decision");
    case "summary":
      return t("orchestrator.room.messageType.summary");
    default:
      return null;
  }
}

function truncateInline(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function selectCoordinatorMemberId(actors: TeamRoomActor[]): string | null {
  return (
    actors.find((actor) => actor.memberKind === "assistant" && actor.memberRole === "orchestrator")?.id ??
    actors.find((actor) => actor.memberKind === "assistant" && actor.isLead)?.id ??
    actors.find((actor) => actor.memberKind === "assistant")?.id ??
    null
  );
}

function getNextWorkflowStep(status?: string | null): "research" | "review" | "approval" | null {
  if (status === "planned" || status === "needs_revision" || status === "blocked") return "research";
  if (status === "in_progress") return "review";
  if (status === "in_review") return "approval";
  return null;
}

function getNextWorkflowStepLabel(
  step: "research" | "review" | "approval",
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

interface QuickReplyTemplate {
  label: string;
  content: string;
  tone: "primary" | "warning" | "neutral";
}

function getQuickReplyTemplatesForStatus(
  status: string | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): QuickReplyTemplate[] {
  switch (status) {
    case "awaiting_approval":
      return [
        {
          label: t("orchestrator.room.quickReply.approve"),
          content: t("orchestrator.room.quickReply.approveContent"),
          tone: "primary",
        },
        {
          label: t("orchestrator.room.quickReply.requestChanges"),
          content: t("orchestrator.room.quickReply.requestChangesContent"),
          tone: "warning",
        },
        {
          label: t("orchestrator.room.quickReply.needSources"),
          content: t("orchestrator.room.quickReply.needSourcesContent"),
          tone: "neutral",
        },
        {
          label: t("orchestrator.room.quickReply.continue"),
          content: t("orchestrator.room.quickReply.continueContent"),
          tone: "neutral",
        },
      ];
    case "in_review":
      return [
        {
          label: t("orchestrator.room.quickReply.needSources"),
          content: t("orchestrator.room.quickReply.needSourcesContent"),
          tone: "warning",
        },
        {
          label: t("orchestrator.room.quickReply.continue"),
          content: t("orchestrator.room.quickReply.continueContent"),
          tone: "primary",
        },
        {
          label: t("orchestrator.room.quickReply.requestChanges"),
          content: t("orchestrator.room.quickReply.requestChangesContent"),
          tone: "warning",
        },
        {
          label: t("orchestrator.room.quickReply.approve"),
          content: t("orchestrator.room.quickReply.reviewApproveContent"),
          tone: "neutral",
        },
      ];
    default:
      return [
        {
          label: t("orchestrator.room.quickReply.approve"),
          content: t("orchestrator.room.quickReply.approveContent"),
          tone: "primary",
        },
        {
          label: t("orchestrator.room.quickReply.requestChanges"),
          content: t("orchestrator.room.quickReply.requestChangesContent"),
          tone: "warning",
        },
        {
          label: t("orchestrator.room.quickReply.needSources"),
          content: t("orchestrator.room.quickReply.needSourcesContent"),
          tone: "neutral",
        },
        {
          label: t("orchestrator.room.quickReply.continue"),
          content: t("orchestrator.room.quickReply.continueContent"),
          tone: "neutral",
        },
      ];
  }
}

function getQuickReplyTemplateClasses(tone: QuickReplyTemplate["tone"]): string {
  switch (tone) {
    case "primary":
      return "border-blue-300 bg-blue-100 text-blue-900 hover:bg-blue-200";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100";
    case "neutral":
    default:
      return "border-blue-200 bg-white text-blue-800 hover:bg-blue-100";
  }
}

export function TeamRoomView({
  roomId,
  teamId,
  runId,
  teamName,
  actors = [],
  viewMode = "transparent",
  runStatus = "idle",
  runStatusReason,
  focusMessageRequest,
  onStartRun,
  onPauseRun,
  onResumeRun,
  onAdvanceRun,
  onStopRun,
  runControlsBusy = false,
  onSendMessage,
}: TeamRoomViewProps) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { t } = useScopedTranslation('agency');
  const hasControllableRun = Boolean(runId && (runStatus === "running" || runStatus === "paused"));
  const canStartRun = Boolean(onStartRun) && (!runId || runStatus === "completed" || runStatus === "stopped" || runStatus === "failed");
  const streamEnabled = Boolean(runId && hasControllableRun);
  const [liveEvents, setLiveEvents] = useState<RunStreamEvent[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastMarkedViewedKeyRef = useRef<string | null>(null);
  const coordinatorMemberId = useMemo(() => selectCoordinatorMemberId(actors), [actors]);
  const actorLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const actor of actors) {
      if (actor.displayName?.trim()) {
        labels.set(actor.id, actor.displayName.trim());
      }
      if (actor.humanUserId) {
        labels.set(
          `user:${actor.humanUserId}`,
          actor.displayName?.trim() || t("orchestrator.common.userNumber", { id: actor.humanUserId }),
        );
      }
    }
    if (user?.id) {
      labels.set(`user:${user.id}`, user.name || user.email || t("orchestrator.common.userNumber", { id: user.id }));
    }
    return labels;
  }, [actors, t, user?.email, user?.id, user?.name]);

  const { data: historyMessages, isLoading: loadingHistory } = trpc.teamRoom.getMessages.useQuery(
    {
      roomId,
      viewMode,
      limit: 100,
    },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
      refetchInterval: 4000,
    },
  );

  const { data: viewerState } = trpc.teamRoom.viewerState.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
    },
  );

  const { data: workItems } = trpc.teamWorkItem.listByRoom.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
      refetchInterval: 5000,
    },
  );

  const invalidateRoomState = useCallback(async () => {
    await Promise.all([
      utils.teamRoom.getMessages.invalidate({ roomId }),
      utils.teamRoom.viewerState.invalidate({ roomId }),
      utils.teamWorkItem.listByRoom.invalidate({ roomId }),
      runId ? utils.teamRun.get.invalidate({ runId }) : Promise.resolve(),
    ]);
  }, [roomId, runId, utils.teamRoom.getMessages, utils.teamRoom.viewerState, utils.teamWorkItem.listByRoom, utils.teamRun.get]);

  const markViewedMutation = trpc.teamRoom.markViewed.useMutation({
    onSuccess: (data) => {
      utils.teamRoom.viewerState.setData({ roomId }, data);
    },
  });

  const createWorkItemMutation = trpc.teamWorkItem.create.useMutation({
    onSuccess: async () => {
      await invalidateRoomState();
      toast.success(t("orchestrator.room.toast.workItemCreated"));
    },
    onError: (error) => toast.error(error.message),
  });

  const advanceWorkflowMutation = trpc.teamWorkItem.advanceWorkflow.useMutation({
    onSuccess: async (_, variables) => {
      await invalidateRoomState();
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
      await invalidateRoomState();
      toast.success(t("orchestrator.room.toast.workItemApproved"));
    },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = trpc.teamWorkItem.reject.useMutation({
    onSuccess: async () => {
      await invalidateRoomState();
      toast.success(t("orchestrator.room.toast.workItemChangesRequested"));
    },
    onError: (error) => toast.error(error.message),
  });

  const { connected } = useRunStream({
    runId,
    enabled: streamEnabled,
    onEvent: useCallback((event: RunStreamEvent) => {
      setLiveEvents((prev) => [...prev.slice(-199), event]);
    }, []),
  });

  useEffect(() => {
    setLiveEvents([]);
  }, [roomId, runId]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const historyEvents = useMemo<RunStreamEvent[]>(() => {
    return ((historyMessages ?? []) as any[]).map((message) => {
      const senderUserId = message.senderUserId ? String(message.senderUserId) : null;
      const senderAssistantId = message.senderAssistantId ? String(message.senderAssistantId) : null;
      const actorType = message.senderType === "assistant"
        ? "assistant"
        : message.senderType === "system"
          ? "system"
          : "user";

      const actorId = actorType === "assistant"
        ? senderAssistantId ?? "assistant"
        : actorType === "user"
          ? `user:${senderUserId ?? "unknown"}`
          : "system";

      return {
        eventId: `history:${message.id}`,
        eventType: `history:${message.turnType ?? "message"}`,
        tenantId: "",
        teamId: "",
        roomId: message.roomId,
        runId: message.runId ?? runId ?? "",
        ts: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
        actorType,
        actorId,
        visibility: message.visibility ?? "transparent",
        data: {
          content: message.content,
          summaryContent: message.summaryContent,
          messageId: message.id,
          turnType: message.turnType,
          metadata: message.metadataJson,
          artifactRefsJson: message.artifactRefsJson,
        },
      } satisfies RunStreamEvent;
    });
  }, [historyMessages, runId]);

  const events = useMemo(() => {
    const merged = [...historyEvents, ...liveEvents];
    const deduped = new Map<string, RunStreamEvent>();

    for (const event of merged) {
      const data = (event.data ?? {}) as Record<string, unknown>;
      const key = typeof data.messageId === "string" ? `message:${data.messageId}` : `event:${event.eventId}`;
      const existing = deduped.get(key);
      if (!existing || getEventPriorityScore(event) > getEventPriorityScore(existing)) {
        deduped.set(key, event);
      }
    }

    return Array.from(deduped.values()).sort(
      (left, right) => new Date(left.ts).getTime() - new Date(right.ts).getTime(),
    );
  }, [historyEvents, liveEvents]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleSend = () => {
    if (!messageInput.trim()) return;
    onSendMessage?.({
      content: messageInput.trim(),
      replyToMessageId: replyTarget?.messageId,
      threadRootMessageId: replyTarget?.threadRootMessageId ?? replyTarget?.messageId,
      workItemId: replyTarget?.workItemId ?? undefined,
    });
    setMessageInput("");
    setReplyTarget(null);
  };

  const postReplyContent = (content: string) => {
    if (!replyTarget) return;
    onSendMessage?.({
      content,
      replyToMessageId: replyTarget.messageId,
      threadRootMessageId: replyTarget.threadRootMessageId ?? replyTarget.messageId,
      workItemId: replyTarget.workItemId ?? undefined,
    });
    setMessageInput("");
    setReplyTarget(null);
  };

  const applyQuickReplyTemplate = (content: string) => {
    setMessageInput(content);
    window.setTimeout(() => {
      composerRef.current?.focus();
    }, 0);
  };

  const handlePromoteToWorkItem = async (event: RunStreamEvent, messageId: string, content: string) => {
    if (!teamId) {
      toast.error(t("orchestrator.room.error.teamContextRequired"));
      return;
    }
    const suggestedTitle = truncateInline(content, 72);
    const title = window.prompt(
      t("orchestrator.room.prompt.createWorkItem"),
      t("orchestrator.room.prompt.followUpTitle", { title: suggestedTitle }),
    );
    if (title === null) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error(t("orchestrator.room.error.workItemTitleRequired"));
      return;
    }

    try {
      const created = await createWorkItemMutation.mutateAsync({
        teamId,
        roomId,
        runId: event.runId || undefined,
        sourceType: "room_message",
        sourceRef: messageId,
        title: trimmedTitle,
        objective: content,
        roomComment: t("orchestrator.room.comment.promotedMessage"),
        replyToMessageId: messageId,
      });

      if (!coordinatorMemberId) return;

      await advanceWorkflowMutation.mutateAsync({
        workItemId: created.workItem.id,
        expectedRevisionVersion: created.workItem.revisionVersion,
        targetStep: "research",
        actorAssistantId: coordinatorMemberId,
        replyToMessageId: created.roomMessage.id,
        roomComment: t("orchestrator.room.comment.startedResearch"),
      });
    } catch {
      // Mutation onError already reports the failure to the user.
    }
  };

  const handleAdvanceWorkItem = async (
    workItem: WorkItemSummary,
    targetStep: "research" | "review" | "approval",
    replyToMessageId?: string,
  ) => {
    if (!coordinatorMemberId) {
      toast.error(t("orchestrator.room.error.coordinatorRequired"));
      return;
    }

    try {
      await advanceWorkflowMutation.mutateAsync({
        workItemId: workItem.id,
        expectedRevisionVersion: workItem.revisionVersion ?? 1,
        targetStep,
        actorAssistantId: coordinatorMemberId,
        replyToMessageId,
      });
    } catch {
      // Mutation onError already reports the failure to the user.
    }
  };

  const handleApproveWorkItem = async (
    workItem: WorkItemSummary,
    approverMemberId: string,
    replyToMessageId?: string,
  ): Promise<boolean> => {
    try {
      await approveMutation.mutateAsync({
        workItemId: workItem.id,
        expectedRevisionVersion: workItem.revisionVersion ?? 1,
        approverMemberId,
        replyToMessageId,
      });
      return true;
    } catch {
      // Mutation onError already reports the failure to the user.
      return false;
    }
  };

  const handleRejectWorkItem = async (
    workItem: WorkItemSummary,
    approverMemberId: string,
    replyToMessageId?: string,
    presetReason?: string,
  ): Promise<boolean> => {
    const reason = presetReason ?? window.prompt(
      t("orchestrator.room.prompt.improveBeforeApproval"),
      t("orchestrator.room.prompt.reviseDraftDefault"),
    );
    if (reason === null) return false;

    try {
      await rejectMutation.mutateAsync({
        workItemId: workItem.id,
        expectedRevisionVersion: workItem.revisionVersion ?? 1,
        approverMemberId,
        reason: reason.trim() || undefined,
        replyToMessageId,
      });
      return true;
    } catch {
      // Mutation onError already reports the failure to the user.
      return false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Filter events by view mode
  const filteredEvents = events.filter((e) => {
    if (viewMode === "transparent") return e.visibility !== "private_internal";
    if (viewMode === "milestone") return e.visibility === "transparent" || e.visibility === "milestone";
    if (viewMode === "summary") return e.visibility === "summary_only" || e.eventType.includes("summary");
    return true;
  });

  const latestVisibleMessageMarker = useMemo(() => {
    const latestEvent = filteredEvents[filteredEvents.length - 1];
    if (!latestEvent) return `${roomId}:empty`;
    const eventData = (latestEvent.data ?? {}) as Record<string, unknown>;
    const messageId = typeof eventData.messageId === "string" ? eventData.messageId : latestEvent.eventId;
    return `${roomId}:${messageId}:${latestEvent.ts}`;
  }, [filteredEvents, roomId]);

  const viewerLastViewedAtMs = useMemo(() => {
    if (!viewerState?.lastViewedAt) return null;
    const ts = new Date(viewerState.lastViewedAt).getTime();
    return Number.isFinite(ts) ? ts : null;
  }, [viewerState?.lastViewedAt]);

  const workItemById = useMemo(() => {
    const entries: Array<[string, WorkItemSummary]> = ((workItems ?? []) as WorkItemSummary[]).map((item) => [item.id, item]);
    return new Map<string, WorkItemSummary>(entries);
  }, [workItems]);

  const eventByMessageId = useMemo(() => {
    const map = new Map<string, RunStreamEvent>();
    for (const event of events) {
      const messageId = (event.data as Record<string, unknown> | undefined)?.messageId;
      if (typeof messageId === "string") {
        map.set(messageId, event);
      }
    }
    return map;
  }, [events]);

  const latestThreadMessageIdByRoot = useMemo(() => {
    const map = new Map<string, { messageId: string; ts: number; count: number }>();
    for (const event of events) {
      const eventData = (event.data ?? {}) as Record<string, unknown>;
      const messageId = typeof eventData.messageId === "string" ? eventData.messageId : null;
      if (!messageId) continue;
      const metadata = normalizeMessageMetadata(eventData.metadata);
      const rootId = metadata.threadRootMessageId ?? (metadata.workItemId ? messageId : null);
      if (!rootId) continue;
      const ts = new Date(event.ts).getTime();
      const existing = map.get(rootId);
      if (!existing) {
        map.set(rootId, { messageId, ts, count: 1 });
        continue;
      }
      map.set(rootId, {
        messageId: ts >= existing.ts ? messageId : existing.messageId,
        ts: Math.max(ts, existing.ts),
        count: existing.count + 1,
      });
    }
    return map;
  }, [events]);

  const activeReplyWorkItem = useMemo<WorkItemSummary | null>(() => {
    if (!replyTarget?.workItemId) return null;
    return workItemById.get(replyTarget.workItemId) ?? null;
  }, [replyTarget?.workItemId, workItemById]);

  const activeReplyApproverMemberId = activeReplyWorkItem?.approverMemberId ?? coordinatorMemberId ?? null;

  const quickReplyTemplates = useMemo(
    () => getQuickReplyTemplatesForStatus(activeReplyWorkItem?.status ?? null, t),
    [activeReplyWorkItem?.status, t],
  );

  const handleQuickApproveAndPost = async () => {
    if (!replyTarget || !activeReplyWorkItem || !activeReplyApproverMemberId) return;
    const approved = await handleApproveWorkItem(
      activeReplyWorkItem,
      activeReplyApproverMemberId,
      replyTarget.messageId,
    );
    if (approved) {
      postReplyContent(t("orchestrator.room.quickReply.approveContent"));
    }
  };

  const handleQuickRejectAndPost = async () => {
    if (!replyTarget || !activeReplyWorkItem || !activeReplyApproverMemberId) return;
    const reason = t("orchestrator.room.quickReply.requestChangesContent");
    const rejected = await handleRejectWorkItem(
      activeReplyWorkItem,
      activeReplyApproverMemberId,
      replyTarget.messageId,
      reason,
    );
    if (rejected) {
      postReplyContent(reason);
    }
  };

  useEffect(() => {
    if (!focusMessageRequest?.messageId) return;
    const targetEvent = eventByMessageId.get(focusMessageRequest.messageId);
    const element = messageRefs.current.get(focusMessageRequest.messageId);
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(focusMessageRequest.messageId);

    if (focusMessageRequest.composeReply && targetEvent) {
      const eventData = (targetEvent.data ?? {}) as Record<string, unknown>;
      const metadata = normalizeMessageMetadata(eventData.metadata);
      const actorLabel =
        actorLabelById.get(targetEvent.actorId) ??
        (targetEvent.actorType === "assistant"
          ? targetEvent.actorId.slice(0, 12)
          : targetEvent.actorType === "system"
            ? t("orchestrator.common.system")
            : t("orchestrator.common.user"));

      setReplyTarget({
        messageId: focusMessageRequest.messageId,
        threadRootMessageId: metadata.threadRootMessageId ?? focusMessageRequest.messageId,
        workItemId: focusMessageRequest.workItemId ?? metadata.workItemId ?? null,
        actorLabel,
        preview: truncateInline(
          typeof eventData.content === "string" ? eventData.content : targetEvent.eventType,
          140,
        ),
      });

      window.setTimeout(() => {
        composerRef.current?.focus();
      }, 120);
    }

    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === focusMessageRequest.messageId ? null : current,
      );
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [actorLabelById, eventByMessageId, focusMessageRequest]);

  useEffect(() => {
    if (!roomId || loadingHistory) return;
    if (!pageVisible) return;
    if (lastMarkedViewedKeyRef.current === latestVisibleMessageMarker) return;

    const timer = window.setTimeout(() => {
      lastMarkedViewedKeyRef.current = latestVisibleMessageMarker;
      markViewedMutation.mutate({ roomId });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [latestVisibleMessageMarker, loadingHistory, markViewedMutation, pageVisible, roomId]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-start gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
            {teamName ? getInitials(teamName) : "TR"}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{teamName ?? t("orchestrator.room.title")}</h2>
            <span className="text-xs text-muted-foreground">{roomId.slice(0, 8)}...</span>
          </div>
        </div>

        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          {/* Connection status */}
          {hasControllableRun && (
            <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              connected
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
              {connected ? t("orchestrator.common.live") : t("orchestrator.common.disconnected")}
            </div>
          )}

          {/* Run controls */}
          {hasControllableRun ? (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {runStatus === "paused" ? (
                <button
                  onClick={onResumeRun}
                  disabled={runControlsBusy}
                  className="rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  title={t("orchestrator.room.action.resumeRun")}
                >
                  {t("orchestrator.common.resume")}
                </button>
              ) : (
                <button
                  onClick={onPauseRun}
                  disabled={runControlsBusy || runStatus !== "running"}
                  className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  title={t("orchestrator.room.action.pauseRun")}
                >
                  {t("orchestrator.common.pause")}
                </button>
              )}
              {runStatus === "running" && onAdvanceRun && (
                <>
                  <button
                    onClick={() => onAdvanceRun(1)}
                    disabled={runControlsBusy}
                    className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    title={t("orchestrator.room.action.advanceOneTurn")}
                  >
                    {t("orchestrator.room.action.nextTurn")}
                  </button>
                  <button
                    onClick={() => onAdvanceRun(3)}
                    disabled={runControlsBusy}
                    className="rounded-md px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    title={t("orchestrator.room.action.advanceThreeTurns")}
                  >
                    {t("orchestrator.room.action.runThree")}
                  </button>
                </>
              )}
              <button
                onClick={onStopRun}
                disabled={runControlsBusy}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                title={t("orchestrator.room.action.stopRun")}
              >
                {t("orchestrator.common.stop")}
              </button>
            </div>
          ) : canStartRun && !runId ? (
            <button onClick={onStartRun} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
              {t("orchestrator.common.startRun")}
            </button>
          ) : null}
        </div>
      </div>

      {runStatusReason && (
        <div className="border-b bg-amber-50/70 px-4 py-2 text-xs text-amber-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{runStatusReason}</span>
            {canStartRun && onStartRun && (
              <button
                type="button"
                onClick={onStartRun}
                className="rounded-md border border-blue-200 bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                {t("orchestrator.common.startNewRun")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loadingHistory && filteredEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("orchestrator.room.loadingHistory")}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
            <p className="text-sm font-medium">
              {hasControllableRun ? t("orchestrator.room.waitingForActivity") : t("orchestrator.room.noActiveRun")}
            </p>
            <p className="text-xs max-w-[300px] text-center">
              {hasControllableRun
                ? t("orchestrator.room.waitingForActivityHelp")
                : t("orchestrator.room.noActiveRunHelp")}
            </p>
          </div>
        ) : (
          filteredEvents.map((event) => {
            const colors = ACTOR_COLORS[event.actorType] ?? ACTOR_COLORS.assistant;
            const avatarColor = event.actorType === "assistant"
              ? getAgentColor(event.actorId)
              : colors.avatar;
            const eventData = (event.data ?? {}) as Record<string, unknown>;
            const metadata = normalizeMessageMetadata(eventData.metadata);
            const displayName =
              actorLabelById.get(event.actorId) ??
              (event.actorType === "assistant"
                ? event.actorId.slice(0, 12)
                : event.actorType === "system"
                  ? t("orchestrator.common.system")
                  : t("orchestrator.common.user"));
            const workItem: WorkItemSummary | null = metadata.workItemId
              ? workItemById.get(metadata.workItemId) ?? null
              : null;
            const replyTarget = metadata.replyToMessageId ? eventByMessageId.get(metadata.replyToMessageId) : null;
            const replyTargetContent = typeof replyTarget?.data?.content === "string"
              ? truncateInline(replyTarget.data.content)
              : null;
            const messageTypeLabel = formatMessageTypeLabel(metadata.messageType, t);
            const citationCount = Array.isArray(metadata.citationRefs) ? metadata.citationRefs.length : 0;
            const isThreadReply = Boolean(metadata.replyToMessageId);
            const isWorkLinked = Boolean(workItem);
            const messageId = typeof eventData.messageId === "string" ? eventData.messageId : null;
            const nextStep = getNextWorkflowStep(workItem?.status);
            const approverMemberId = workItem?.approverMemberId ?? coordinatorMemberId;
            const threadRootId = metadata.threadRootMessageId ?? (metadata.workItemId ? messageId : null);
            const threadActivity = threadRootId ? latestThreadMessageIdByRoot.get(threadRootId) : null;
            const isLatestThreadUpdate = Boolean(
              messageId &&
              threadActivity &&
              threadActivity.count > 1 &&
              threadActivity.messageId === messageId,
            );
            const isUnreadThreadUpdate = Boolean(
              isLatestThreadUpdate &&
              viewerLastViewedAtMs !== null &&
              threadActivity &&
              threadActivity.ts > viewerLastViewedAtMs,
            );

            return (
              <div
                key={event.eventId}
                className={cn(
                  "flex gap-3",
                  event.actorType === "user" ? "flex-row-reverse" : "",
                  isThreadReply && event.actorType !== "user" ? "pl-4" : "",
                )}
              >
                {/* Avatar */}
                <div className={`h-8 w-8 shrink-0 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold`}>
                  {event.actorType === "system" ? "SYS" : getInitials(displayName)}
                </div>

                {/* Message bubble */}
                <div
                  ref={(node) => {
                    if (!messageId) return;
                    if (node) {
                      messageRefs.current.set(messageId, node);
                    } else {
                      messageRefs.current.delete(messageId);
                    }
                  }}
                  className={cn(
                    `max-w-[75%] rounded-xl px-4 py-2.5 ${colors.bg} border ${colors.border}`,
                    isThreadReply && "shadow-[inset_3px_0_0_0_rgba(59,130,246,0.35)]",
                    isWorkLinked && "ring-1 ring-blue-100",
                    highlightedMessageId === messageId && "ring-2 ring-blue-400 ring-offset-2",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold capitalize">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(event.ts).toLocaleTimeString()}
                    </span>
                    {event.visibility !== "transparent" && (
                      <span className="rounded bg-gray-200 px-1 py-0.5 text-[9px] uppercase tracking-wider">
                        {event.visibility}
                      </span>
                    )}
                  </div>
                  {(messageTypeLabel || workItem || citationCount > 0) && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {messageTypeLabel && (
                        <Badge variant="outline" className="text-[10px]">
                          {messageTypeLabel}
                        </Badge>
                      )}
                      {workItem && (
                        <Badge variant="secondary" className="max-w-full text-[10px]">
                          {truncateInline(workItem.title, 48)}
                          {workItem.status ? ` · ${t(`orchestrator.workflow.status.${workItem.status}`)}` : ""}
                        </Badge>
                      )}
                      {citationCount > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("orchestrator.room.sourcesCount", { count: citationCount })}
                        </Badge>
                      )}
                      {isLatestThreadUpdate && (
                        <Badge
                          className={cn(
                            "border text-[10px]",
                            isUnreadThreadUpdate
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-slate-200 bg-slate-50 text-slate-700",
                          )}
                        >
                          {isUnreadThreadUpdate
                            ? t("orchestrator.room.unreadThreadUpdate")
                            : t("orchestrator.room.latestThreadUpdate")}
                        </Badge>
                      )}
                    </div>
                  )}
                  {replyTargetContent && (
                    <div className="mb-2 rounded-lg border border-blue-200/70 bg-white/60 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">{t("orchestrator.room.replyingTo")}</span>
                      <div className="mt-1">{replyTargetContent}</div>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap">
                    {(event.data as any)?.content ?? event.eventType}
                  </div>
                  {metadata.threadRootMessageId && metadata.threadRootMessageId !== metadata.replyToMessageId && (
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      {t("orchestrator.room.threadLabel")}: {metadata.threadRootMessageId.slice(0, 8)}...
                    </div>
                  )}
                  {(messageId || (workItem && (nextStep || workItem.status === "awaiting_approval"))) && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {!workItem && messageId && typeof eventData.content === "string" && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                          onClick={() => void handlePromoteToWorkItem(event, messageId, eventData.content as string)}
                          disabled={createWorkItemMutation.isPending || advanceWorkflowMutation.isPending}
                        >
                          <PlusSquare className="h-3.5 w-3.5" />
                          {t("orchestrator.room.action.promoteToWorkItem")}
                        </button>
                      )}
                      {workItem && nextStep && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                          onClick={() => void handleAdvanceWorkItem(workItem, nextStep, messageId ?? undefined)}
                          disabled={advanceWorkflowMutation.isPending}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          {getNextWorkflowStepLabel(nextStep, t)}
                        </button>
                      )}
                      {workItem?.status === "awaiting_approval" && approverMemberId && (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                            onClick={() => void handleApproveWorkItem(workItem, approverMemberId, messageId ?? undefined)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t("orchestrator.common.approve")}
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-50"
                            onClick={() => void handleRejectWorkItem(workItem, approverMemberId, messageId ?? undefined)}
                            disabled={rejectMutation.isPending}
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            {t("orchestrator.common.requestChanges")}
                          </button>
                        </>
                      )}
                      {messageId && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                        onClick={() =>
                          setReplyTarget({
                            messageId,
                            threadRootMessageId: metadata.threadRootMessageId ?? messageId,
                            workItemId: metadata.workItemId ?? null,
                            actorLabel: displayName,
                            preview: truncateInline(
                              typeof eventData.content === "string" ? eventData.content : event.eventType,
                              140,
                            ),
                          })
                        }
                      >
                        <MessageSquareReply className="h-3.5 w-3.5" />
                        {t("orchestrator.common.reply")}
                      </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3 shrink-0">
        {replyTarget && (
          <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-blue-900">
                  {t("orchestrator.room.replyingToActor", { name: replyTarget.actorLabel })}
                </div>
                <div className="mt-1 truncate text-blue-900/80">{replyTarget.preview}</div>
                {replyTarget.workItemId && (
                  <div className="mt-1 text-[10px] text-blue-900/70">
                    {t("orchestrator.room.linkedWorkItem")}: {replyTarget.workItemId.slice(0, 8)}...
                  </div>
                )}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-blue-900/70 transition-colors hover:bg-blue-100 hover:text-blue-950"
                onClick={() => setReplyTarget(null)}
                title={t("orchestrator.room.action.cancelReply")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeReplyWorkItem?.status === "awaiting_approval" && activeReplyApproverMemberId && (
                <>
                  <button
                    type="button"
                    className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-900 transition-colors hover:bg-emerald-200"
                    onClick={() => void handleQuickApproveAndPost()}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    {t("orchestrator.room.action.approveAndPost")}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100"
                    onClick={() => void handleQuickRejectAndPost()}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    {t("orchestrator.room.action.requestChangesAndPost")}
                  </button>
                </>
              )}
              {quickReplyTemplates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    getQuickReplyTemplateClasses(template.tone),
                  )}
                  onClick={() => applyQuickReplyTemplate(template.content)}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={composerRef}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={replyTarget ? t("orchestrator.room.replyPlaceholder") : t("orchestrator.room.messagePlaceholder")}
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!messageInput.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("orchestrator.common.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
