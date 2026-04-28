import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileClock,
  ListChecks,
  MessageSquareQuote,
  Link2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

interface AutoTeamLedgerPanelProps {
  ledger: any | null;
  ledgerError?: string | null;
  roomMessages?: Array<{
    id: string;
    createdAt?: string | Date | null;
    senderType?: string | null;
    messageType?: string | null;
    content?: string | null;
    summaryContent?: string | null;
    metadataJson?: unknown;
  }>;
  runtimeState?: {
    currentPhase?: string | null;
    waitingReason?: string | null;
  } | null;
  roomLanguage?: "en" | "th";
  teamMembers: Array<{
    id: string;
    displayName?: string | null;
    memberKind?: string | null;
    memberRole?: string | null;
    isLead?: boolean | null;
  }>;
  runStatus?: string | null;
  runStatusReason?: string | null;
  onFocusThread?: (
    messageId: string,
    options?: {
      workItemId?: string;
      composeReply?: boolean;
      messageAnchorId?: string | null;
    },
  ) => void;
  className?: string;
}

interface LinkedChatMessagePreview {
  id: string;
  createdAt: string | null;
  senderType: string;
  messageType: string | null;
  contentPreview: string;
}

function formatRelativeDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getTerminalClasses(state: string | null | undefined): string {
  switch (state) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "accepted_exception":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "waiting":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getGateClasses(status: string): string {
  switch (status) {
    case "passed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function getStatusClasses(status: string | null | undefined): string {
  switch (status) {
    case "completed":
    case "passed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "needs_revision":
    case "blocked":
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "waiting_human":
    case "reviewing":
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getTimelineToneClasses(tone: string): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50";
    case "warning":
      return "border-amber-200 bg-amber-50";
    case "danger":
      return "border-rose-200 bg-rose-50";
    default:
      return "border-slate-200 bg-white";
  }
}

function getMemberLabel(
  memberId: string | null | undefined,
  teamMembers: AutoTeamLedgerPanelProps["teamMembers"],
): string {
  if (!memberId) return "Unassigned";
  return (
    teamMembers.find((member) => member.id === memberId)?.displayName ??
    memberId
  );
}

function getCurrentStep(
  ledger: any | null,
): Record<string, any> | null {
  if (!ledger) return null;

  const steps = Array.isArray(ledger.steps) ? ledger.steps : [];
  const currentStepKey = ledger.summary?.currentStepKey ?? null;
  const currentStepTitle = ledger.summary?.currentStepTitle ?? null;

  return (
    steps.find((step: Record<string, any>) => step.stepKey === currentStepKey) ??
    steps.find((step: Record<string, any>) => step.title === currentStepTitle) ??
    null
  );
}

type StepLoopKind = "single" | "review_loop" | "system_issue" | "mixed";

function getAttemptSignal(attempt: Record<string, any> | null | undefined): string | null {
  if (!attempt) return null;
  const reviews = Array.isArray(attempt.reviews) ? attempt.reviews : [];
  const lastFailedReview = [...reviews]
    .reverse()
    .find((review: Record<string, any>) => review && review.passed === false);
  const latestReview = reviews.at(-1) ?? null;

  return (
    (typeof attempt.errorMessage === "string" && attempt.errorMessage.trim()) ||
    (typeof attempt.blockedReason === "string" && attempt.blockedReason.trim()) ||
    (typeof lastFailedReview?.repairInstructions === "string" &&
      lastFailedReview.repairInstructions.trim()) ||
    (typeof lastFailedReview?.comments === "string" &&
      lastFailedReview.comments.trim()) ||
    (typeof latestReview?.comments === "string" && latestReview.comments.trim()) ||
    (typeof attempt.summary === "string" && attempt.summary.trim()) ||
    null
  );
}

function getStepLoopInsight(stepAttempts: Record<string, any>[]): {
  kind: StepLoopKind;
  label: string;
  detail: string;
  guidance: string;
  attemptCount: number;
  failedReviewCount: number;
  resolvedReviewCount: number;
  erroredAttemptCount: number;
  latestNote: string | null;
} {
  const attemptCount = stepAttempts.length;
  const latestAttempt = stepAttempts.at(-1) ?? null;
  const reviews = stepAttempts.flatMap((attempt) =>
    Array.isArray(attempt.reviews) ? attempt.reviews : [],
  );
  const failedReviewCount = reviews.filter(
    (review: Record<string, any>) => review?.passed === false,
  ).length;
  const resolvedReviewCount = reviews.filter(
    (review: Record<string, any>) =>
      review?.passed === false && review?.resolution === "resolved",
  ).length;
  const erroredAttemptCount = stepAttempts.filter(
    (attempt) =>
      Boolean(
        (typeof attempt.errorMessage === "string" &&
          attempt.errorMessage.trim()) ||
          (typeof attempt.blockedReason === "string" &&
            attempt.blockedReason.trim()),
      ),
  ).length;
  const latestNote = getAttemptSignal(latestAttempt);

  let kind: StepLoopKind = "single";
  if (attemptCount > 1 && erroredAttemptCount > 0 && failedReviewCount > 0) {
    kind = "mixed";
  } else if (attemptCount > 1 && erroredAttemptCount > 0) {
    kind = "system_issue";
  } else if (attemptCount > 1 || failedReviewCount > 0) {
    kind = "review_loop";
  }

  switch (kind) {
    case "review_loop":
      return {
        kind,
        label: "Review loop",
        detail:
          attemptCount > 1
            ? `This step repeated ${attemptCount - 1} time(s) because review feedback requested changes.`
            : "This step has review feedback that explains why it needs another pass.",
        guidance:
          latestNote ??
          "Earlier attempts are useful because they show what changed before the latest pass.",
        attemptCount,
        failedReviewCount,
        resolvedReviewCount,
        erroredAttemptCount,
        latestNote,
      };
    case "system_issue":
      return {
        kind,
        label: "System issue",
        detail:
          latestNote ??
          "This step repeated because execution hit a blocking error or runtime issue.",
        guidance:
          "That usually points to a system or provider problem, not a content-quality revision loop.",
        attemptCount,
        failedReviewCount,
        resolvedReviewCount,
        erroredAttemptCount,
        latestNote,
      };
    case "mixed":
      return {
        kind,
        label: "Mixed loop",
        detail:
          latestNote ??
          "This step repeated because both review feedback and execution issues were observed.",
        guidance:
          "This is useful because it separates content corrections from infrastructure instability.",
        attemptCount,
        failedReviewCount,
        resolvedReviewCount,
        erroredAttemptCount,
        latestNote,
      };
    case "single":
    default:
      return {
        kind: "single",
        label: "Single pass",
        detail:
          latestNote ??
          "This step completed in one pass, so there is no retry loop to inspect.",
        guidance:
          "This is the clean baseline result and can be compared against later retries.",
        attemptCount,
        failedReviewCount,
        resolvedReviewCount,
        erroredAttemptCount,
        latestNote,
      };
  }
}

function getStepLoopBadgeClasses(kind: StepLoopKind): string {
  switch (kind) {
    case "review_loop":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "system_issue":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "mixed":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "single":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function buildPlanStepMessageAnchorId(
  stepKey: string | null | undefined,
): string | null {
  if (!stepKey) return null;
  return `plan-step-${stepKey
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9:_-]/g, "-")}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function previewContent(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 180);
}

function getLinkedChatMessageLabel(
  messageType: string | null | undefined,
): string {
  switch (messageType) {
    case "plan_summary":
      return "Plan anchor";
    case "step_result":
      return "Step result";
    case "summary":
      return "Summary";
    case "work_update":
      return "Work update";
    default:
      return messageType ? `Chat line · ${messageType}` : "Chat line";
  }
}

function getStepLinkLabel(linkType: string | null | undefined): string {
  switch (linkType) {
    case "plan_summary":
      return "Plan summary";
    case "plan_step":
      return "Step in chat";
    case "owner_result":
      return "Owner result";
    case "review_result":
      return "Review result";
    case "repair_result":
      return "Repair result";
    case "checkpoint":
      return "Checkpoint";
    case "terminal_result":
      return "Terminal";
    case "execution_trace":
      return "Trace";
    default:
      return linkType ? linkType.replace(/_/g, " ") : "Link";
  }
}

function extractStepLinkedRoomMessages(
  messages: AutoTeamLedgerPanelProps["roomMessages"] | undefined,
  stepKey: string | null | undefined,
): LinkedChatMessagePreview[] {
  const normalizedStepKey = stepKey?.trim();
  if (!normalizedStepKey) return [];

  return (messages ?? [])
    .map((message) => {
      const metadata = asRecord(message.metadataJson);
      const payload = asRecord(metadata?.details) ?? metadata;
      const messageType =
        asString(metadata?.messageType) ?? asString(payload?.messageType);
      const linkedStepKey =
        asString(payload?.stepKey) ??
        asString(metadata?.stepKey) ??
        asString(payload?.planStepKey) ??
        null;

      return {
        message,
        messageType,
        linkedStepKey,
      };
    })
    .filter(
      ({ messageType, linkedStepKey }) =>
        messageType !== "plan_summary" && linkedStepKey === normalizedStepKey,
    )
    .map(({ message, messageType }) => ({
      id: message.id,
      createdAt: message.createdAt
        ? new Date(message.createdAt).toISOString()
        : null,
      senderType: message.senderType ?? "system",
      messageType,
      contentPreview: previewContent(
        asString(message.content) ?? asString(message.summaryContent) ?? "",
      ),
    }));
}

function dedupeLinkedChatMessages(
  messages: LinkedChatMessagePreview[],
): LinkedChatMessagePreview[] {
  return messages.filter(
    (message, index, all) =>
      all.findIndex((candidate) => candidate.id === message.id) === index,
  );
}

function normalizePlanStep(
  step: Record<string, unknown> | null | undefined,
  index: number,
): Record<string, unknown> {
  const fallbackStepKey = `step-${index + 1}`;
  const stepKey = asString(step?.stepKey) ?? fallbackStepKey;
  return {
    stepKey,
    title: asString(step?.title) ?? stepKey,
    objective: asString(step?.objective),
    deliverable: asString(step?.deliverable),
    status: asString(step?.status) ?? "planned",
    ownerPersona: asString(step?.ownerPersona),
    ownerMemberId: asString(step?.ownerMemberId),
    reviewerPersona: asString(step?.reviewerPersona),
    reviewerMemberId: asString(step?.reviewerMemberId),
    verificationMethod: asString(step?.verificationMethod),
    retryRule: asString(step?.retryRule),
    evidenceRequirements: asStringArray(step?.evidenceRequirements),
    qualityCriteria: asStringArray(step?.qualityCriteria),
    reviewChecklist: asStringArray(step?.reviewChecklist),
    notes: asString(step?.notes),
  };
}

function extractChatPlanStepsFromMessage(
  metadata: Record<string, unknown> | null,
  payload: Record<string, unknown> | null,
): Record<string, unknown>[] {
  for (const source of [payload, metadata]) {
    if (!source) continue;
    for (const key of ["steps", "planSteps"]) {
      const value = source[key];
      if (!Array.isArray(value) || value.length === 0) continue;
      return value.map((step, index) =>
        normalizePlanStep(asRecord(step), index),
      );
    }
  }
  return [];
}

function extractRoomPlanArtifact(
  messages: AutoTeamLedgerPanelProps["roomMessages"] | undefined,
): {
  messageId: string;
  createdAt: string | null;
  messagePreview: string | null;
  objective: string | null;
  status: string | null;
  reviewStatus: string | null;
  reviewIteration: number | null;
  reviewScore: number | null;
  reviewRecommendation: string | null;
  reviewIssues: string[];
  stepCount: number;
  steps: Array<Record<string, unknown>>;
} | null {
  const candidates = (messages ?? [])
    .map((message) => {
      const metadata = asRecord(message.metadataJson);
      const payload = asRecord(metadata?.details) ?? metadata;
      const messageType =
        asString(metadata?.messageType) ?? asString(payload?.messageType);
      const steps = extractChatPlanStepsFromMessage(metadata, payload);
      return {
        message,
        metadata,
        payload,
        messageType,
        steps,
      };
    })
    .filter(({ messageType }) => messageType === "plan_summary")
    .sort((left, right) => {
      const leftAt = new Date(left.message.createdAt ?? 0).getTime();
      const rightAt = new Date(right.message.createdAt ?? 0).getTime();
      return rightAt - leftAt;
    });

  const latest = candidates.find((candidate) => candidate.steps.length > 0) ?? candidates[0];
  if (!latest) return null;

  return {
    messageId: latest.message.id,
    createdAt: latest.message.createdAt
      ? new Date(latest.message.createdAt).toISOString()
      : null,
    messagePreview: previewContent(
      asString(latest.message.content) ?? asString(latest.message.summaryContent) ?? "",
    ),
    objective: asString(latest.payload?.objective),
    status: asString(latest.payload?.planStatus),
    reviewStatus: asString(latest.payload?.reviewStatus),
    reviewIteration:
      typeof latest.payload?.reviewIteration === "number"
        ? latest.payload.reviewIteration
        : null,
    reviewScore:
      typeof latest.payload?.reviewScore === "number"
        ? latest.payload.reviewScore
        : null,
    reviewRecommendation: asString(latest.payload?.reviewRecommendation),
    reviewIssues: asStringArray(latest.payload?.reviewIssues),
    stepCount: latest.steps.length,
    steps: latest.steps,
  };
}

export function AutoTeamLedgerPanel({
  ledger,
  ledgerError,
  roomMessages,
  runtimeState,
  roomLanguage = "en",
  teamMembers,
  runStatus,
  runStatusReason,
  onFocusThread,
  className,
}: AutoTeamLedgerPanelProps) {
  const isThai = roomLanguage === "th";
  const currentStep = getCurrentStep(ledger);
  const auditedPlanSteps = Array.isArray(ledger?.steps) ? ledger.steps : [];
  const roomPlanArtifact = extractRoomPlanArtifact(roomMessages);
  const chatPlanArtifact =
    ledger?.chatPlan?.steps?.length > 0
      ? ledger.chatPlan
      : roomPlanArtifact ?? ledger?.chatPlan ?? null;
  const chatPlanSteps = Array.isArray(chatPlanArtifact?.steps)
    ? chatPlanArtifact.steps
    : [];
  const visiblePlanSteps =
    auditedPlanSteps.length > 0 ? auditedPlanSteps : chatPlanSteps;
  const planSource =
    auditedPlanSteps.length > 0
      ? "audited"
      : chatPlanSteps.length > 0
        ? "chat"
        : null;
  const planSourceLabel =
    planSource === "audited"
      ? "Audited plan"
      : planSource === "chat"
        ? "Chat draft"
        : null;
  const planSummarySource =
    ledger?.plan?.source ?? planSource ?? "audited";
  const planReviewScore =
    typeof ledger?.plan?.reviewScore === "number"
      ? ledger.plan.reviewScore
      : null;
  const planReviewRecommendation =
    typeof ledger?.plan?.reviewRecommendation === "string" &&
    ledger.plan.reviewRecommendation.trim().length > 0
      ? ledger.plan.reviewRecommendation.trim()
      : null;
  const planReviewIssues = Array.isArray(ledger?.plan?.reviewIssues)
    ? ledger.plan.reviewIssues
    : [];
  const latestPlanTimelineMessage = Array.isArray(ledger?.timeline)
    ? [...ledger.timeline]
        .reverse()
        .find(
          (entry: Record<string, any>) =>
            entry.kind === "message" &&
            typeof entry.messageId === "string" &&
            typeof entry.title === "string" &&
            entry.title.trim().toLowerCase() === "plan summary",
        ) ?? null
    : null;
  const planSummaryMessageId =
    ledger?.plan?.sourceMessageId ??
    chatPlanArtifact?.messageId ??
    latestPlanTimelineMessage?.messageId ??
    null;
  const planSummaryMessageCreatedAt =
    ledger?.plan?.sourceMessageCreatedAt ??
    chatPlanArtifact?.createdAt ??
    latestPlanTimelineMessage?.at ??
    null;
  const planSummaryMessagePreview =
    chatPlanArtifact?.messagePreview ??
    (typeof latestPlanTimelineMessage?.summary === "string" &&
    latestPlanTimelineMessage.summary.trim().length > 0
      ? latestPlanTimelineMessage.summary
      : null) ??
    "Plan shared in chat";
  const currentStepAttempt =
    currentStep &&
    Array.isArray(ledger?.attempts)
      ? ledger.attempts.find(
          (attempt: Record<string, any>) =>
            attempt.id === currentStep.latestAttemptId ||
            attempt.stepKey === currentStep.stepKey,
        ) ?? null
      : null;
  const currentStepValidation =
    currentStep?.validationState && typeof currentStep.validationState === "object"
      ? (currentStep.validationState as Record<string, any>)
      : null;
  const jumpToExecutionStep = (stepKey: string | null | undefined) => {
    if (!stepKey) return;

    const targetElement = document.getElementById(
      `auto-team-execution-step-${stepKey}`,
    );
    targetElement?.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  };

  if (!ledger) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden border-l bg-muted/20",
          className,
        )}
      >
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-2xl border bg-white p-8 text-center shadow-sm">
            <div
              className={cn(
                "mx-auto flex h-12 w-12 items-center justify-center rounded-2xl",
                ledgerError
                  ? "bg-rose-100 text-rose-600"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {ledgerError ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <FileClock className="h-5 w-5" />
              )}
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              {ledgerError ? "Team ledger failed to load" : "Waiting for the team ledger"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {ledgerError
                ? ledgerError
                : "The orchestration dashboard will appear as soon as the run emits structured plan and audit data."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-l bg-muted/20",
        className,
      )}
    >
      <div className="border-b bg-white px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              "border",
              getTerminalClasses(ledger.summary?.terminalState),
            )}
          >
            {ledger.summary?.terminalState ?? "running"}
          </Badge>
          <Badge variant="outline">Run: {runStatus ?? ledger.summary?.runStatus ?? "n/a"}</Badge>
          {runtimeState?.currentPhase && (
            <Badge variant="outline">Phase: {runtimeState.currentPhase}</Badge>
          )}
          <Badge variant="outline">Ledger: {ledger.derivedState}</Badge>
          <Badge variant="outline">Access: {ledger.accessLevel}</Badge>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[1.3fr_1fr_1fr]">
          <div className="rounded-2xl border bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Sparkles className="h-3.5 w-3.5" />
              Objective
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {ledger.objective ?? "No objective captured yet"}
            </p>
          </div>
          <div className="rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Next action
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {ledger.summary?.nextAction ?? "No next action"}
            </p>
            {runtimeState?.waitingReason && (
              <p className="mt-2 text-xs text-slate-600">
                Waiting: {runtimeState.waitingReason}
              </p>
            )}
          </div>
          <div className="rounded-2xl border bg-slate-50/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Terminal reason
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {ledger.summary?.terminalReason ?? runStatusReason ?? "Still running"}
            </p>
            {ledger.summary?.currentStepTitle && (
              <p className="mt-2 text-xs text-slate-600">
                Current step: {ledger.summary.currentStepTitle}
              </p>
            )}
          </div>
        </div>

        {ledger.plan && (
          <div className="mt-4 rounded-2xl border bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Plan: {ledger.plan.status}</Badge>
              <Badge variant="outline">Review: {ledger.plan.reviewStatus}</Badge>
              <Badge variant="outline">
                Iteration: {ledger.plan.reviewIteration ?? 0}
              </Badge>
              <Badge variant="outline">Steps: {ledger.plan.stepCount}</Badge>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  planSummarySource === "audited"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700",
                )}
              >
                Source: {planSummarySource === "audited" ? "audited" : "chat draft"}
              </Badge>
              {ledger.plan.explorationEnabled && (
                <Badge variant="outline">Exploration enabled</Badge>
              )}
            </div>
            {(planReviewScore !== null ||
              planReviewRecommendation ||
              planReviewIssues.length > 0) && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {planReviewScore !== null && (
                  <div className="rounded-xl border bg-white/80 px-3 py-2 text-xs text-slate-600">
                    <div className="font-semibold text-slate-500">Review score</div>
                    <div className="mt-1 text-slate-900">
                      {planReviewScore.toFixed(2)}
                    </div>
                  </div>
                )}
                {planReviewRecommendation && (
                  <div className="rounded-xl border bg-white/80 px-3 py-2 text-xs text-slate-600">
                    <div className="font-semibold text-slate-500">
                      Reviewer note
                    </div>
                    <div className="mt-1 text-slate-900">
                      {planReviewRecommendation}
                    </div>
                  </div>
                )}
                {planReviewIssues.length > 0 && (
                  <div className="rounded-xl border bg-white/80 px-3 py-2 text-xs text-slate-600 md:col-span-2">
                    <div className="font-semibold text-slate-500">
                      Review issues
                    </div>
                    <div className="mt-1 text-slate-900">
                      {planReviewIssues.join(", ")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4 pb-12">
          {visiblePlanSteps.length > 0 && (
            <section
              data-testid="auto-team-plan-snapshot"
              className="rounded-2xl border bg-white shadow-sm"
            >
              <div className="border-b px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                  <ListChecks className="h-4 w-4 text-slate-500" />
                  Plan snapshot
                  {planSourceLabel && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        planSource === "audited"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700",
                      )}
                    >
                      {planSourceLabel}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Compact plan view with direct links to the matching chat line
                  and execution step.
                </p>
              </div>
              {planSource === "chat" && (
                <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
                  Showing the plan directly from chat so you can inspect it
                  immediately. The audited ledger has not caught up yet, so
                  this is the pre-audit plan view.
                </div>
              )}
              <div className="max-h-[24rem] space-y-2 overflow-y-auto p-4">
                {visiblePlanSteps.map((step: any, index: number) => {
                const stepAttempts = (ledger.attempts ?? []).filter(
                  (attempt: any) => attempt.stepKey === step.stepKey,
                );
                const latestAttempt = stepAttempts.at(-1) ?? null;
                const linkedMessagePreviews = Array.isArray(
                  latestAttempt?.messagePreviews,
                )
                  ? latestAttempt.messagePreviews
                  : [];
                const roomStepLinkedMessages = extractStepLinkedRoomMessages(
                  roomMessages,
                  step.stepKey,
                );
                const planSummaryLinkedMessage = planSummaryMessageId
                  ? {
                      id: planSummaryMessageId,
                      createdAt: planSummaryMessageCreatedAt,
                      senderType: "system",
                      messageType: "plan_summary",
                      contentPreview: planSummaryMessagePreview,
                    }
                  : null;
                const combinedLinkedMessages = dedupeLinkedChatMessages([
                  ...linkedMessagePreviews,
                  ...roomStepLinkedMessages,
                ]);
                const executionLinkedMessages = combinedLinkedMessages.filter(
                  (message) => message.messageType !== "plan_summary",
                );
                const primaryLinkedMessage =
                  executionLinkedMessages.at(-1) ??
                  planSummaryLinkedMessage ??
                  combinedLinkedMessages.at(-1) ??
                  null;
                const planStepAnchorId = planSummaryMessageId
                  ? buildPlanStepMessageAnchorId(step.stepKey ?? `step-${index + 1}`)
                  : null;
                const stepLoopSummary = getStepLoopInsight(stepAttempts);
                const isCurrentStep =
                  step.stepKey === ledger.summary?.currentStepKey ||
                  step.title === ledger.summary?.currentStepTitle;
                const selectedLinkedChatMessage = primaryLinkedMessage;
                const selectedLinkedChatMessageAnchorId =
                  selectedLinkedChatMessage?.messageType === "plan_summary"
                    ? planStepAnchorId ?? undefined
                    : undefined;
                const openLinkedChatLine = () => {
                  if (!onFocusThread) return;
                  const targetMessageId =
                    selectedLinkedChatMessage?.id ?? null;
                  if (!targetMessageId) return;
                  onFocusThread(targetMessageId, {
                    workItemId: latestAttempt?.workItemId ?? undefined,
                    composeReply: false,
                    messageAnchorId: selectedLinkedChatMessageAnchorId,
                  });
                };
                const linkedChatMessages = dedupeLinkedChatMessages([
                  ...executionLinkedMessages,
                  ...(planSummaryLinkedMessage ? [planSummaryLinkedMessage] : []),
                ]);

                  return (
                    <div
                      key={`plan-snapshot-${step.stepKey}`}
                      role="button"
                      tabIndex={0}
                      aria-label={
                        selectedLinkedChatMessage
                          ? `Open linked chat line for ${step.title}`
                          : `Open execution step for ${step.title}`
                      }
                      onClick={() => {
                        if (selectedLinkedChatMessage && onFocusThread) {
                          openLinkedChatLine();
                          return;
                        }
                        jumpToExecutionStep(step.stepKey);
                      }}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (selectedLinkedChatMessage && onFocusThread) {
                            openLinkedChatLine();
                          } else {
                            jumpToExecutionStep(step.stepKey);
                          }
                        }
                      }}
                      data-testid={`auto-team-plan-snapshot-step-${step.stepKey}`}
                      data-current-step={isCurrentStep ? "true" : "false"}
                      data-plan-source={planSource ?? "none"}
                      className={cn(
                        "rounded-2xl border p-3 transition-colors hover:border-sky-300 hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
                        isCurrentStep
                          ? "border-sky-200 bg-sky-50/70 ring-1 ring-sky-200"
                          : "border-slate-200 bg-slate-50/60",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Step {index + 1}</Badge>
                            <Badge
                              className={cn("border", getStatusClasses(step.status))}
                            >
                              {step.status}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] text-slate-600">
                              {stepAttempts.length > 0
                                ? `Attempts: ${stepAttempts.length}`
                                : planSource === "chat"
                                  ? "Draft"
                                  : "Attempts: 0"}
                            </Badge>
                            {planSource === "chat" && stepAttempts.length === 0 && (
                              <Badge className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                                Pre-audit
                              </Badge>
                            )}
                          </div>
                          <h3 className="mt-2 text-sm font-semibold text-slate-900">
                            {step.title}
                          </h3>
                          {step.objective && (
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                              {step.objective}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                            <span>
                              Owner:{" "}
                              {step.ownerPersona ??
                                getMemberLabel(step.ownerMemberId, teamMembers)}
                            </span>
                            <span>
                              Reviewer:{" "}
                              {step.reviewerPersona ??
                                getMemberLabel(step.reviewerMemberId, teamMembers)}
                            </span>
                          </div>
                          {planSource === "chat" && stepAttempts.length === 0 && (
                            <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                              Draft plan loaded from chat. Audited execution
                              evidence will appear here once the ledger catches
                              up.
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {selectedLinkedChatMessage ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[10px] text-sky-700"
                              onClick={event => {
                                event.stopPropagation();
                                openLinkedChatLine();
                              }}
                              title={
                                selectedLinkedChatMessage?.messageType === "plan_summary"
                                  ? `Open the exact plan anchor for ${step.title} in chat`
                                  : `Open the latest linked chat line for ${step.title}`
                              }
                              data-testid={`auto-team-plan-snapshot-open-chat-${step.stepKey}`}
                            >
                              <MessageSquareQuote className="mr-1 h-3.5 w-3.5" />
                              {getLinkedChatMessageLabel(
                                selectedLinkedChatMessage?.messageType ?? null,
                              )}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            onClick={event => {
                              event.stopPropagation();
                              jumpToExecutionStep(step.stepKey);
                            }}
                            title={`Open execution step for ${step.title}`}
                            data-testid={`auto-team-plan-snapshot-open-execution-${step.stepKey}`}
                          >
                            <ChevronRight className="mr-1 h-3.5 w-3.5" />
                            Execution
                          </Button>
                        </div>
                      </div>

                      {step.deliverable && (
                        <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-xs text-sky-900">
                          <div className="font-semibold text-sky-700">
                            Deliverable
                          </div>
                          <div className="mt-1">{step.deliverable}</div>
                        </div>
                      )}

                      {latestAttempt?.summary && (
                        <div className="mt-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-slate-700">
                          <div className="font-semibold text-slate-500">
                            Latest result
                          </div>
                          <div className="mt-1 text-slate-900">
                            {latestAttempt.summary}
                          </div>
                        </div>
                      )}

                      {stepAttempts.length > 1 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge
                            className={cn(
                              "border text-[10px]",
                              getStepLoopBadgeClasses(stepLoopSummary.kind),
                            )}
                          >
                            {stepLoopSummary.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {stepLoopSummary.detail}
                          </Badge>
                        </div>
                      )}

                      {primaryLinkedMessage && (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold text-slate-500">
                            Linked chat line
                          </div>
                          <div className="mt-1 text-slate-900">
                            {primaryLinkedMessage.contentPreview}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section
            data-testid="auto-team-current-step"
            className="sticky top-0 z-20 rounded-2xl border border-sky-200 bg-white/95 p-4 shadow-sm backdrop-blur"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                    {isThai ? "ขั้นตอนปัจจุบัน" : "Current step"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn("border", getStatusClasses(currentStep?.status))}
                  >
                    {currentStep?.status ?? "n/a"}
                  </Badge>
                  {currentStep?.stepKey && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {currentStep.stepKey}
                    </Badge>
                  )}
                </div>
                <h2 className="mt-2 text-sm font-semibold text-slate-900">
                  {currentStep?.title ??
                    ledger.summary?.currentStepTitle ??
                    (isThai ? "ยังไม่พบขั้นตอนปัจจุบัน" : "Current step not captured yet")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {currentStep?.objective ??
                    ledger.summary?.nextAction ??
                    (isThai ? "ยังไม่มีสรุปขั้นตอน" : "No step summary captured yet")}
                </p>
                {currentStepValidation && (
                  <div
                    className={cn(
                      "mt-3 rounded-xl border px-3 py-2 text-xs",
                      currentStepValidation.status === "failed"
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : currentStepValidation.status === "passed"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-800",
                    )}
                  >
                    <div className="font-semibold">
                      {isThai ? "การตรวจ" : "Validation"}: {currentStepValidation.status ?? "pending"}
                      {typeof currentStepValidation.attempt === "number" &&
                        currentStepValidation.attempt > 0 &&
                        ` · ${isThai ? "รอบ" : "attempt"} ${currentStepValidation.attempt}${
                          typeof currentStepValidation.maxAttempts === "number" &&
                          currentStepValidation.maxAttempts > 0
                            ? `/${currentStepValidation.maxAttempts}`
                            : ""
                        }`}
                    </div>
                    {(currentStepValidation.summary ||
                      currentStepValidation.issues?.length > 0) && (
                      <div className="mt-1">
                        {currentStepValidation.summary ??
                          currentStepValidation.issues.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => jumpToExecutionStep(currentStep?.stepKey)}
                  disabled={!currentStep?.stepKey}
                  title={isThai ? "เลื่อนไปยังงานของขั้นตอนนี้" : "Scroll to the current execution step"}
                  data-testid="auto-team-current-step-jump-button"
                >
                  {isThai ? "ไปที่ขั้นตอน" : "Jump to step"}
                </Button>
                <div className="grid min-w-[220px] gap-2 text-xs text-slate-600">
                  <div className="rounded-xl border bg-slate-50/80 px-3 py-2">
                    <div className="font-semibold text-slate-500">
                      {isThai ? "ผู้รับผิดชอบ" : "Owner"}
                    </div>
                    <div className="mt-1 text-slate-900">
                      {currentStep?.ownerPersona ??
                        getMemberLabel(currentStep?.ownerMemberId, teamMembers)}
                    </div>
                  </div>
                  <div className="rounded-xl border bg-slate-50/80 px-3 py-2">
                    <div className="font-semibold text-slate-500">
                      {isThai ? "ผู้ตรวจ" : "Reviewer"}
                    </div>
                    <div className="mt-1 text-slate-900">
                      {currentStep?.reviewerPersona ??
                        getMemberLabel(currentStep?.reviewerMemberId, teamMembers)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-500">Deliverable</div>
                <div className="mt-1 text-slate-900">
                  {currentStep?.deliverable ?? "n/a"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-500">Next action</div>
                <div className="mt-1 text-slate-900">
                  {ledger.summary?.nextAction ?? "n/a"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-500">Latest result</div>
                <div className="mt-1 text-slate-900">
                  {currentStepAttempt?.summary ??
                    currentStepAttempt?.status ??
                    currentStep?.status ??
                    "n/a"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="font-semibold text-slate-500">Evidence required</div>
                <div className="mt-1">
                  {(currentStep?.evidenceRequirements ?? []).join(", ") || "n/a"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="font-semibold text-slate-500">Review notes</div>
                <div className="mt-1">
                  {currentStepAttempt?.reviews?.at(-1)?.comments ??
                    currentStep?.notes ??
                    "n/a"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileClock className="h-4 w-4 text-slate-500" />
                Plan and responsibilities
              </div>
              <p className="mt-1 text-xs text-slate-500">
                The team must lock each step with an owner, reviewer, evidence
                requirement, and retry rule before execution can be trusted.
              </p>
            </div>
            <div className="space-y-3 p-4">
              {planSource === "chat" && visiblePlanSteps.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="font-semibold">
                    Plan exists in chat and is shown immediately here.
                  </div>
                  <p className="mt-1 leading-6">
                    The audited ledger has not caught up yet, so these steps are
                    the pre-audit plan view. Once the execution ledger
                    persists, the same section will switch to audited step
                    history and retry counts.
                  </p>
                </div>
              )}
              {visiblePlanSteps.length === 0 && (
                <div
                  className={cn(
                    "rounded-2xl border p-4 text-sm",
                    ledger.plan
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-rose-200 bg-rose-50 text-rose-700",
                  )}
                >
                  <div className="font-semibold">
                    {ledger.chatPlan
                      ? "Plan exists in chat, but no draft steps were captured."
                      : "No audited plan steps were captured for this run."}
                  </div>
                  <p className="mt-1 leading-6">
                    {ledger.chatPlan
                      ? "The conversation already contains a plan message, but the structured step payload was not available. Check the room plan message for the full draft."
                      : "This run has no persisted plan steps yet, so the right panel cannot show the step-by-step plan comparison."}
                  </p>
                </div>
              )}
              {visiblePlanSteps.map((step: any, index: number) => {
                const stepAttempts = (ledger.attempts ?? []).filter(
                  (attempt: any) => attempt.stepKey === step.stepKey,
                );
                const latestAttempt = stepAttempts.at(-1) ?? null;
                const linkedMessagePreviews = Array.isArray(
                  latestAttempt?.messagePreviews,
                )
                  ? latestAttempt.messagePreviews
                  : [];
                const roomStepLinkedMessages = extractStepLinkedRoomMessages(
                  roomMessages,
                  step.stepKey,
                );
                const planSummaryLinkedMessage = planSummaryMessageId
                  ? {
                      id: planSummaryMessageId,
                      createdAt: planSummaryMessageCreatedAt,
                      senderType: "system",
                      messageType: "plan_summary",
                      contentPreview: planSummaryMessagePreview,
                    }
                  : null;
                const combinedLinkedMessages = dedupeLinkedChatMessages([
                  ...linkedMessagePreviews,
                  ...roomStepLinkedMessages,
                ]);
                const executionLinkedMessages = combinedLinkedMessages.filter(
                  (message) => message.messageType !== "plan_summary",
                );
                const primaryLinkedMessage =
                  executionLinkedMessages.at(-1) ??
                  planSummaryLinkedMessage ??
                  combinedLinkedMessages.at(-1) ??
                  null;
                const planStepAnchorId = planSummaryMessageId
                  ? buildPlanStepMessageAnchorId(step.stepKey ?? `step-${index + 1}`)
                  : null;
                const stepLoopSummary = getStepLoopInsight(stepAttempts);
                const isCurrentStep =
                  step.stepKey === ledger.summary?.currentStepKey ||
                  step.title === ledger.summary?.currentStepTitle;
                const selectedLinkedChatMessage = primaryLinkedMessage;
                const selectedLinkedChatMessageAnchorId =
                  selectedLinkedChatMessage?.messageType === "plan_summary"
                    ? planStepAnchorId ?? undefined
                    : undefined;
                const openLinkedChatLine = () => {
                  if (!onFocusThread) return;
                  const targetMessageId = selectedLinkedChatMessage?.id ?? null;
                  if (!targetMessageId) return;
                  onFocusThread(targetMessageId, {
                    workItemId: latestAttempt?.workItemId ?? undefined,
                    composeReply: false,
                    messageAnchorId: selectedLinkedChatMessageAnchorId,
                  });
                };
                const linkedChatMessages = dedupeLinkedChatMessages([
                  ...executionLinkedMessages,
                  ...(planSummaryLinkedMessage ? [planSummaryLinkedMessage] : []),
                ]);
                const stepLinks = Array.isArray(step.stepLinks)
                  ? step.stepLinks
                  : [];
                const availableStepLinks = stepLinks.filter(
                  (link: Record<string, any>) => link?.status === "available",
                );
                const pendingStepLinks = stepLinks.filter(
                  (link: Record<string, any>) => link?.status !== "available",
                );

                return (
                  <div
                    key={`plan-${step.stepKey}`}
                    role="button"
                    tabIndex={0}
                    aria-label={
                      selectedLinkedChatMessage
                        ? `Open linked chat line for ${step.title}`
                        : `Open execution step for ${step.title}`
                    }
                    onClick={() => {
                      if (selectedLinkedChatMessage && onFocusThread) {
                        openLinkedChatLine();
                        return;
                      }
                      jumpToExecutionStep(step.stepKey);
                    }}
                    onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (selectedLinkedChatMessage && onFocusThread) {
                          openLinkedChatLine();
                        } else {
                          jumpToExecutionStep(step.stepKey);
                        }
                      }
                    }}
                    id={`auto-team-plan-step-${step.stepKey}`}
                    data-testid={`auto-team-plan-step-${step.stepKey}`}
                    data-current-step={isCurrentStep ? "true" : "false"}
                    data-plan-source={planSource ?? "none"}
                    className={cn(
                      "rounded-2xl border p-4 scroll-mt-32 transition-colors hover:border-sky-300 hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300",
                      isCurrentStep
                        ? "border-sky-200 bg-sky-50/70 ring-1 ring-sky-200"
                        : "border-slate-200 bg-slate-50/60",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">Step {index + 1}</Badge>
                          <Badge
                            className={cn(
                              "border",
                              getStatusClasses(step.status),
                            )}
                          >
                            {step.status}
                          </Badge>
                          {planSource === "chat" && stepAttempts.length === 0 && (
                            <Badge className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                              Draft
                            </Badge>
                          )}
                          {selectedLinkedChatMessage ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[10px] text-sky-700"
                              onClick={event => {
                                event.stopPropagation();
                                openLinkedChatLine();
                              }}
                              title={
                                selectedLinkedChatMessage?.messageType === "plan_summary"
                                  ? `Open the exact plan anchor for ${step.title} in chat`
                                  : `Open the latest linked chat line for ${step.title}`
                              }
                              data-testid={`auto-team-plan-step-open-chat-${step.stepKey}`}
                            >
                              <MessageSquareQuote className="mr-1 h-3.5 w-3.5" />
                              {getLinkedChatMessageLabel(
                                selectedLinkedChatMessage.messageType ?? null,
                              )}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px] text-slate-500"
                            onClick={event => {
                              event.stopPropagation();
                              jumpToExecutionStep(step.stepKey);
                            }}
                            title={`Open execution step for ${step.title}`}
                            data-testid={`auto-team-plan-open-execution-${step.stepKey}`}
                          >
                            <ChevronRight className="mr-1 h-3.5 w-3.5" />
                            Execution
                          </Button>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-slate-900">
                          {step.title}
                        </h3>
                        {step.objective && (
                          <p className="mt-2 text-sm leading-6 text-slate-700">
                            {step.objective}
                          </p>
                        )}
                        {step.deliverable && (
                          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-900">
                            <div className="font-semibold text-sky-700">
                              Deliverable
                            </div>
                            <div className="mt-1">{step.deliverable}</div>
                          </div>
                        )}
                        {planSource === "chat" && stepAttempts.length === 0 && (
                          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                            This step is visible from the chat plan. Audited
                            execution evidence will appear here once the ledger
                            persists the run.
                          </div>
                        )}
                      </div>
                      <div className="grid min-w-[220px] gap-2 text-xs text-slate-600">
                        <div className="rounded-xl border bg-white px-3 py-2">
                          <div className="font-semibold text-slate-500">Owner</div>
                          <div className="mt-1 text-slate-900">
                            {step.ownerPersona ??
                              getMemberLabel(step.ownerMemberId, teamMembers)}
                          </div>
                        </div>
                        <div className="rounded-xl border bg-white px-3 py-2">
                          <div className="font-semibold text-slate-500">
                            Reviewer
                          </div>
                          <div className="mt-1 text-slate-900">
                            {step.reviewerPersona ??
                              getMemberLabel(step.reviewerMemberId, teamMembers)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                      <div className="rounded-xl border bg-white px-3 py-2">
                        <div className="font-semibold text-slate-500">
                          Evidence required
                        </div>
                        <div className="mt-1">
                          {(step.evidenceRequirements ?? []).join(", ") || "n/a"}
                        </div>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2">
                        <div className="font-semibold text-slate-500">
                          Verification
                        </div>
                        <div className="mt-1">{step.verificationMethod ?? "n/a"}</div>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2">
                        <div className="font-semibold text-slate-500">
                          Retry rule
                        </div>
                        <div className="mt-1">{step.retryRule ?? "n/a"}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                      <div className="rounded-xl border bg-white px-3 py-2">
                        <div className="font-semibold text-slate-500">
                          Quality criteria
                        </div>
                        <div className="mt-1">
                          {(step.qualityCriteria ?? []).join("; ") || "n/a"}
                        </div>
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-2">
                        <div className="font-semibold text-slate-500">
                          Review checklist
                        </div>
                        <div className="mt-1">
                          {(step.reviewChecklist ?? []).join("; ") || "n/a"}
                        </div>
                      </div>
                    </div>

                    {(availableStepLinks.length > 0 ||
                      pendingStepLinks.length > 0) && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <Link2 className="h-3.5 w-3.5" />
                          Step links
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {availableStepLinks.map((link: Record<string, any>) => {
                            const canOpenChat =
                              Boolean(link.messageId) &&
                              [
                                "plan_summary",
                                "plan_step",
                                "owner_result",
                                "review_result",
                                "repair_result",
                              ].includes(link.linkType);
                            const canJumpToExecution =
                              link.linkType === "execution_trace" ||
                              link.linkType === "checkpoint" ||
                              link.linkType === "terminal_result";

                            return canOpenChat ? (
                              <Button
                                key={`${step.stepKey}-${link.linkType}-${link.messageId}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-sky-700"
                                onClick={event => {
                                  event.stopPropagation();
                                  if (!onFocusThread || !link.messageId) return;
                                  onFocusThread(link.messageId, {
                                    workItemId:
                                      latestAttempt?.workItemId ?? undefined,
                                    composeReply: false,
                                    messageAnchorId: link.anchorId ?? undefined,
                                  });
                                }}
                                title={
                                  link.anchorId
                                    ? `Open ${getStepLinkLabel(link.linkType)} for ${step.title}`
                                    : `Open ${getStepLinkLabel(link.linkType)}`
                                }
                                data-testid={`auto-team-step-link-${step.stepKey}-${link.linkType}`}
                              >
                                <MessageSquareQuote className="mr-1 h-3.5 w-3.5" />
                                {getStepLinkLabel(link.linkType)}
                              </Button>
                            ) : canJumpToExecution ? (
                              <Button
                                key={`${step.stepKey}-${link.linkType}-${link.traceId ?? link.checkpointId ?? "jump"}`}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={event => {
                                  event.stopPropagation();
                                  jumpToExecutionStep(step.stepKey);
                                }}
                                title={`Open execution view for ${step.title}`}
                                data-testid={`auto-team-step-link-${step.stepKey}-${link.linkType}`}
                              >
                                <ChevronRight className="mr-1 h-3.5 w-3.5" />
                                {getStepLinkLabel(link.linkType)}
                              </Button>
                            ) : (
                              <Badge
                                key={`${step.stepKey}-${link.linkType}-${link.status}`}
                                variant="outline"
                                className="text-[10px] text-slate-500"
                                data-testid={`auto-team-step-link-${step.stepKey}-${link.linkType}`}
                              >
                                {getStepLinkLabel(link.linkType)}
                                {link.status === "pending" ? " · pending" : ""}
                              </Badge>
                            );
                          })}
                          {pendingStepLinks.length > 0 &&
                            pendingStepLinks.map((link: Record<string, any>) => (
                              <Badge
                                key={`${step.stepKey}-${link.linkType}-${link.status}-pending`}
                                variant="outline"
                                className="text-[10px] text-slate-400"
                                data-testid={`auto-team-step-link-pending-${step.stepKey}-${link.linkType}`}
                              >
                                {getStepLinkLabel(link.linkType)} · pending
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}

                    {latestAttempt && (
                      <div className="mt-3 rounded-xl border bg-white px-3 py-2 text-xs text-slate-600">
                        <div className="font-semibold text-slate-500">
                          Latest result
                        </div>
                        <div className="mt-1 text-slate-900">
                          {latestAttempt.summary ?? latestAttempt.status ?? "n/a"}
                        </div>
                      </div>
                    )}

                    {linkedChatMessages.length > 0 && onFocusThread && (
                      <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-slate-600">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                          <MessageSquareQuote className="h-3.5 w-3.5" />
                          Linked chat lines
                        </div>
                        <div className="mt-2 space-y-2">
                          {linkedChatMessages.map((message: any, messageIndex: number) => (
                            <button
                              key={message.id}
                              type="button"
                              data-testid={`auto-team-plan-chat-link-${step.stepKey}-${message.id}`}
                              className="w-full rounded-lg border border-sky-100 bg-white px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
                              onClick={event => {
                                event.stopPropagation();
                                onFocusThread(message.id, {
                                  workItemId:
                                    latestAttempt?.workItemId ?? undefined,
                                  composeReply: false,
                                  messageAnchorId:
                                    message.messageType === "plan_summary"
                                      ? planStepAnchorId ?? undefined
                                      : undefined,
                                });
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-sky-700">
                                  {getLinkedChatMessageLabel(
                                    message.messageType ?? null,
                                  )}
                                </span>
                                {message.createdAt && (
                                  <span className="text-[10px] text-slate-500">
                                    {formatRelativeDate(message.createdAt)}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 line-clamp-2 text-slate-700">
                                {message.contentPreview}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {stepAttempts.length > 1 && (
                      <div
                        data-testid={`auto-team-plan-loop-summary-${step.stepKey}`}
                        className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={cn(
                              "border text-[10px]",
                              getStepLoopBadgeClasses(stepLoopSummary.kind),
                            )}
                          >
                            {stepLoopSummary.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Attempts: {stepAttempts.length}
                          </Badge>
                        </div>
                        <p className="mt-2 text-slate-900">
                          {stepLoopSummary.detail}
                        </p>
                        <p className="mt-1 text-slate-500">
                          {stepLoopSummary.guidance}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-slate-500" />
                Completion gates
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Each gate explains whether the run can be considered complete or
                what is still missing.
              </p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {(ledger.gates ?? []).map((gate: any) => (
                <div
                  key={gate.key}
                  className={cn(
                    "rounded-2xl border p-4",
                    getGateClasses(gate.status),
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{gate.label}</div>
                    <Badge variant="outline" className="bg-white/80">
                      {gate.status}
                    </Badge>
                  </div>
                  {gate.detail && (
                    <p className="mt-2 text-xs leading-5">{gate.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ListChecks className="h-4 w-4 text-slate-500" />
                Execution steps
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Every step keeps its owner, reviewer, findings, fixes, and
                attempt history together so the loop can be audited end to end.
              </p>
            </div>
            <div className="space-y-3 p-4">
              {(ledger.steps ?? []).map((step: any) => {
                const stepAttempts = (ledger.attempts ?? []).filter(
                  (attempt: any) => attempt.stepKey === step.stepKey,
                );
                const latestAttempt = stepAttempts.at(-1) ?? null;
                const earlierAttempts = stepAttempts.slice(0, -1);
                const loopInsight = getStepLoopInsight(stepAttempts);
                const isCurrentStep =
                  step.stepKey === ledger.summary?.currentStepKey ||
                  step.title === ledger.summary?.currentStepTitle;

                return (
                  <div
                    key={step.stepKey}
                    id={`auto-team-execution-step-${step.stepKey}`}
                    data-testid={`auto-team-execution-step-${step.stepKey}`}
                    data-current-step={isCurrentStep ? "true" : "false"}
                    className={cn(
                      "rounded-2xl border p-4 scroll-mt-32",
                      isCurrentStep
                        ? "border-sky-200 bg-sky-50/70 ring-1 ring-sky-200"
                        : "border-slate-200 bg-slate-50/50",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {step.title}
                          </h3>
                          <Badge
                            className={cn(
                              "border",
                              getStatusClasses(step.status),
                            )}
                          >
                            {step.status}
                          </Badge>
                          {step.openFindingCount > 0 && (
                            <Badge className="border-rose-200 bg-rose-50 text-rose-700">
                              {step.openFindingCount} open finding
                              {step.openFindingCount === 1 ? "" : "s"}
                            </Badge>
                          )}
                          {step.resolvedFindingCount > 0 && (
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              {step.resolvedFindingCount} resolved
                            </Badge>
                          )}
                        </div>
                        {step.objective && (
                          <p className="mt-2 text-sm text-slate-700">
                            {step.objective}
                          </p>
                        )}
                        {step.deliverable && (
                          <p className="mt-2 text-xs text-slate-600">
                            Deliverable: {step.deliverable}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div>Owner: {step.ownerPersona ?? getMemberLabel(step.ownerMemberId, teamMembers)}</div>
                        <div className="mt-1">
                          Reviewer:{" "}
                          {step.reviewerPersona ??
                            getMemberLabel(step.reviewerMemberId, teamMembers)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                      <div>Verification: {step.verificationMethod ?? "n/a"}</div>
                      <div>Retry rule: {step.retryRule ?? "n/a"}</div>
                      <div>Attempts: {step.attemptIds?.length ?? 0}</div>
                      <div>Evidence: {(step.evidenceRequirements ?? []).join(", ") || "n/a"}</div>
                    </div>

                    <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                      <div>
                        Quality criteria:{" "}
                        {(step.qualityCriteria ?? []).join("; ") || "n/a"}
                      </div>
                      <div>
                        Review checklist:{" "}
                        {(step.reviewChecklist ?? []).join("; ") || "n/a"}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div
                        data-testid={`auto-team-step-loop-summary-${step.stepKey}`}
                        className={cn(
                          "rounded-2xl border p-3",
                          getStepLoopBadgeClasses(loopInsight.kind),
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={cn(
                              "border text-[10px]",
                              getStepLoopBadgeClasses(loopInsight.kind),
                            )}
                          >
                            {loopInsight.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Attempts: {loopInsight.attemptCount}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Review findings:{" "}
                            {step.openFindingCount + step.resolvedFindingCount}
                          </Badge>
                          {loopInsight.erroredAttemptCount > 0 && (
                            <Badge className="border-rose-200 bg-rose-50 text-[10px] text-rose-700">
                              {loopInsight.erroredAttemptCount} errored
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-xs font-medium text-slate-800">
                          {loopInsight.detail}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {loopInsight.guidance}
                        </p>
                        {loopInsight.latestNote &&
                          loopInsight.latestNote !== loopInsight.detail && (
                            <p className="mt-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-xs text-slate-700">
                              Latest note: {loopInsight.latestNote}
                            </p>
                          )}
                      </div>

                      {latestAttempt ? (
                        <div className="rounded-2xl border bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  className={cn(
                                    "border",
                                    getStatusClasses(latestAttempt.status),
                                  )}
                                >
                                  {latestAttempt.stageType} · #
                                  {latestAttempt.attempt}
                                </Badge>
                                <Badge variant="outline">
                                  {latestAttempt.selectedSkillId ?? "no-skill"}
                                </Badge>
                                {latestAttempt.selectedProvider && (
                                  <Badge variant="outline">
                                    {latestAttempt.selectedProvider}
                                    {latestAttempt.selectedModel
                                      ? `/${latestAttempt.selectedModel}`
                                      : ""}
                                  </Badge>
                                )}
                                {stepAttempts.length > 1 && (
                                  <Badge
                                    variant="outline"
                                    className="border-sky-200 bg-sky-50 text-sky-700"
                                  >
                                    Latest attempt
                                  </Badge>
                                )}
                              </div>
                              {latestAttempt.summary && (
                                <p className="mt-2 text-sm text-slate-700">
                                  {latestAttempt.summary}
                                </p>
                              )}
                              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                                {latestAttempt.startedAt && (
                                  <span>
                                    Started:{" "}
                                    {formatRelativeDate(latestAttempt.startedAt)}
                                  </span>
                                )}
                                {latestAttempt.completedAt && (
                                  <span>
                                    Completed:{" "}
                                    {formatRelativeDate(latestAttempt.completedAt)}
                                  </span>
                                )}
                                {latestAttempt.blockedReason && (
                                  <span>
                                    Blocked: {latestAttempt.blockedReason}
                                  </span>
                                )}
                                {latestAttempt.errorMessage && (
                                  <span>Error: {latestAttempt.errorMessage}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 space-y-4">
                            {latestAttempt.reviews?.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Review trail
                                </div>
                                {latestAttempt.reviews.map((review: any) => (
                                  <div
                                    key={review.id}
                                    className={cn(
                                      "rounded-xl border p-3",
                                      review.passed
                                        ? "border-emerald-200 bg-emerald-50/50"
                                        : review.resolution === "resolved"
                                          ? "border-amber-200 bg-amber-50/50"
                                          : "border-rose-200 bg-rose-50/60",
                                    )}
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge
                                        className={cn(
                                          "border",
                                          review.passed
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                            : "border-rose-200 bg-rose-50 text-rose-700",
                                        )}
                                      >
                                        {review.passed
                                          ? "passed"
                                          : "changes requested"}
                                      </Badge>
                                      <Badge variant="outline">
                                        Score {review.score}/{review.passThreshold}
                                      </Badge>
                                      <Badge variant="outline">
                                        Reviewer:{" "}
                                        {getMemberLabel(
                                          review.reviewerPersonaId,
                                          teamMembers,
                                        )}
                                      </Badge>
                                      {review.resolvedByAttemptId && (
                                        <Badge variant="outline">
                                          Resolved by {review.resolvedByAttemptId}
                                        </Badge>
                                      )}
                                    </div>
                                    {(review.comments ||
                                      review.repairInstructions) && (
                                      <div className="mt-2 space-y-1 text-xs text-slate-700">
                                        {review.comments && (
                                          <p>{review.comments}</p>
                                        )}
                                        {review.repairInstructions && (
                                          <p>{review.repairInstructions}</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {latestAttempt.messagePreviews?.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Linked room messages
                                </div>
                                {latestAttempt.messagePreviews.map(
                                  (message: any) => (
                                    <div
                                      key={message.id}
                                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                                    >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs text-slate-500">
                                          {getLinkedChatMessageLabel(
                                            message.messageType ?? null,
                                          )}
                                          {message.createdAt &&
                                            ` · ${formatRelativeDate(
                                              message.createdAt,
                                            )}`}
                                        </div>
                                        {onFocusThread && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs"
                                            onClick={() =>
                                              onFocusThread(message.id, {
                                                workItemId:
                                                  latestAttempt.workItemId ??
                                                  undefined,
                                                composeReply: false,
                                                messageAnchorId:
                                                  message.messageType ===
                                                  "plan_summary"
                                                    ? buildPlanStepMessageAnchorId(
                                                        latestAttempt.stepKey ??
                                                          message.id,
                                                      )
                                                    : undefined,
                                              })
                                            }
                                          >
                                            <MessageSquareQuote className="mr-1 h-3.5 w-3.5" />
                                            {getLinkedChatMessageLabel(
                                              message.messageType ?? null,
                                            )}
                                          </Button>
                                        )}
                                      </div>
                                      <p className="mt-2 text-sm text-slate-700">
                                        {message.contentPreview}
                                      </p>
                                    </div>
                                  ),
                                )}
                              </div>
                            )}

                            {latestAttempt.auditDetail && (
                              <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                                  Detailed audit metadata
                                </div>
                                <div className="grid gap-2 text-xs text-sky-900 md:grid-cols-2">
                                  <div>
                                    Provider/model:{" "}
                                    {latestAttempt.auditDetail.provider ?? "n/a"}
                                    {latestAttempt.auditDetail.model
                                      ? ` / ${latestAttempt.auditDetail.model}`
                                      : ""}
                                  </div>
                                  <div>
                                    Prompt refs:{" "}
                                    {(latestAttempt.auditDetail.promptRefs ?? []).join(
                                      ", ",
                                    ) || "none"}
                                  </div>
                                  <div>
                                    Context refs:{" "}
                                    {(latestAttempt.auditDetail.contextRefs ?? []).join(
                                      ", ",
                                    ) || "none"}
                                  </div>
                                  <div>
                                    Tool refs:{" "}
                                    {(latestAttempt.auditDetail.toolRefs ?? []).join(
                                      ", ",
                                    ) || "none"}
                                  </div>
                                  <div className="md:col-span-2">
                                    Raw output refs:{" "}
                                    {(latestAttempt.auditDetail.rawOutputRefs ?? []).join(
                                      ", ",
                                    ) || "none"}
                                  </div>
                                </div>
                              </div>
                            )}

                            {latestAttempt.runtimeMetadata && (
                              <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                                  Runtime metadata
                                </div>
                                <div className="grid gap-2 text-xs text-violet-900 md:grid-cols-2">
                                  <div>
                                    Engine/mode:{" "}
                                    {latestAttempt.runtimeMetadata.runtimeEngine ?? "n/a"}
                                    {latestAttempt.runtimeMetadata.runtimeMode
                                      ? ` / ${latestAttempt.runtimeMetadata.runtimeMode}`
                                      : ""}
                                  </div>
                                  <div>
                                    Selection reason:{" "}
                                    {latestAttempt.runtimeMetadata.runtimeSelectionReason ?? "n/a"}
                                  </div>
                                  <div>
                                    Trace id:{" "}
                                    {latestAttempt.runtimeMetadata.runtimeTraceId ?? "n/a"}
                                  </div>
                                  <div>
                                    SDK/adapter:{" "}
                                    {latestAttempt.runtimeMetadata.runtimeSdkVersion ?? "n/a"}
                                    {latestAttempt.runtimeMetadata.runtimeAdapterVersion
                                      ? ` / ${latestAttempt.runtimeMetadata.runtimeAdapterVersion}`
                                      : ""}
                                  </div>
                                  <div>
                                    Selected skill:{" "}
                                    {latestAttempt.runtimeMetadata.runtimeSelectedSkillSlug ?? "n/a"}
                                  </div>
                                  <div>
                                    Runtime status:{" "}
                                    {latestAttempt.runtimeMetadata.runtimeStatus ?? "n/a"}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
                          No execution attempt was captured for this step yet.
                        </div>
                      )}

                      {earlierAttempts.length > 0 && (
                        <Collapsible defaultOpen={false}>
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="text-[10px]">
                                    Earlier attempts
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px]">
                                    {earlierAttempts.length} hidden
                                  </Badge>
                                </div>
                                <p className="mt-2 text-xs text-slate-600">
                                  These records explain what changed before the latest
                                  attempt became the current result.
                                </p>
                              </div>
                              <CollapsibleTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-3 text-xs text-slate-500"
                                >
                                  <ChevronDown className="mr-1 h-3.5 w-3.5" />
                                  Details
                                </Button>
                              </CollapsibleTrigger>
                            </div>

                            <CollapsibleContent className="mt-3 space-y-2">
                              {earlierAttempts.map((attempt: any) => {
                                const attemptSignal = getAttemptSignal(attempt);
                                const attemptReviews = Array.isArray(attempt.reviews)
                                  ? attempt.reviews
                                  : [];
                                const latestReview = attemptReviews.at(-1) ?? null;
                                const reviewSummary =
                                  (typeof latestReview?.repairInstructions === "string" &&
                                    latestReview.repairInstructions.trim()) ||
                                  (typeof latestReview?.comments === "string" &&
                                    latestReview.comments.trim()) ||
                                  null;

                                return (
                                  <div
                                    key={attempt.id}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                          className={cn(
                                            "border text-[10px]",
                                            getStatusClasses(attempt.status),
                                          )}
                                        >
                                          {attempt.stageType} · #{attempt.attempt}
                                        </Badge>
                                        {attempt.selectedSkillId && (
                                          <Badge variant="outline" className="text-[10px]">
                                            {attempt.selectedSkillId}
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-slate-500">
                                        {attempt.completedAt
                                          ? `Completed ${formatRelativeDate(
                                              attempt.completedAt,
                                            )}`
                                          : attempt.startedAt
                                            ? `Started ${formatRelativeDate(
                                                attempt.startedAt,
                                              )}`
                                            : "No timestamp"}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-slate-900">
                                      {attempt.summary ?? "No summary captured."}
                                    </p>
                                    {(attemptSignal || reviewSummary) && (
                                      <p className="mt-1 text-slate-600">
                                        Why it changed: {attemptSignal ?? reviewSummary}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Clock3 className="h-4 w-4 text-slate-500" />
                Audit timeline
              </div>
              <p className="mt-1 text-xs text-slate-500">
                This is the ordered ledger of what happened, who acted, and what
                outcome each action produced.
              </p>
            </div>
            <div className="space-y-3 p-4">
              {(ledger.timeline ?? []).map((entry: any) => (
                <div
                  key={entry.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    getTimelineToneClasses(entry.statusTone),
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {entry.title}
                      </div>
                      <Badge variant="outline">{entry.kind}</Badge>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatRelativeDate(entry.at)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                    {entry.actorId && (
                      <span>Actor: {getMemberLabel(String(entry.actorId), teamMembers)}</span>
                    )}
                    {entry.stepKey && <span>Step: {entry.stepKey}</span>}
                    {entry.attemptId && <span>Attempt: {entry.attemptId}</span>}
                    {entry.workItemId && <span>Work item: {entry.workItemId}</span>}
                  </div>
                  {entry.summary && (
                    <p className="mt-2 text-sm text-slate-700">{entry.summary}</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {ledger.summary?.terminalReason && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
                <div>
                  <div className="text-sm font-semibold text-amber-900">
                    Why this run ended in its current state
                  </div>
                  <p className="mt-1 text-sm text-amber-900/90">
                    {ledger.summary.terminalReason}
                  </p>
                  {ledger.summary.latestOutcome && (
                    <p className="mt-2 text-xs text-amber-900/80">
                      Latest outcome: {ledger.summary.latestOutcome}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
