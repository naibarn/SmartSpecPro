/**
 * TeamRoomView — multi-agent conversation room view.
 *
 * Renders multi-avatar messages, system bubbles, and agent status indicators.
 * Integrates with useRunStream for live updates and tRPC for initial data.
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { useRunStream, type RunStreamEvent } from "@/hooks/useRunStream";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { getExecutionRouteBadge } from "./executionRouteBadge";
import {
  ArrowRight,
  CheckCircle2,
  Search,
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
  reviewStatus?: string | null;
  reviewScore?: number | null;
  reviewIteration?: number | null;
  reviewRecommendation?: string | null;
  reviewIssues?: string[] | null;
  selectedSkillId?: string | null;
  selectedProvider?: string | null;
  selectedModelId?: string | null;
  planStatus?: string | null;
  planSteps?: TeamRoomPlanSummaryStep[] | null;
  details?: Record<string, unknown> | null;
  stepResult?: TeamRoomStepResultMetadata | null;
  runtimeMetadata?: {
    selectedSkillId?: string | null;
    routeReason?: string | null;
    route?: string | null;
    llmModelId?: string | null;
    runtimeEngine?: string | null;
    runtimeMode?: string | null;
    runtimeStatus?: string | null;
    runtimeTraceId?: string | null;
    runtimeSdkVersion?: string | null;
    runtimeAdapterVersion?: string | null;
    runtimeCheckpointId?: string | null;
    runtimeCheckpointStatus?: string | null;
    runtimeResumeCursor?: string | null;
    runtimeArtifactRefs?: string[] | null;
    requestedSubagent?: string | null;
    subagentTopology?:
      | {
          nativeBundleReady?: boolean | null;
          nativeBundlePath?: string | null;
          bundleTopology?: string | null;
          nativeBundleFiles?: string[] | null;
          specialistAgentCount?: number | null;
        }
      | null;
  } | null;
  runtimeDisclosure?: {
    source?: "cloud" | "hybrid" | null;
    taskClass?: string | null;
    profileId?: string | null;
    fallbackReason?: string | null;
    voiceInputMode?: string | null;
  } | null;
  citationRefs?: Array<{
    id?: string;
    title?: string;
    url?: string;
    note?: string;
  }>;
}

type TeamRoomRuntimeSubagentTopology = {
  nativeBundleReady?: boolean | null;
  nativeBundlePath?: string | null;
  bundleTopology?: string | null;
  nativeBundleFiles?: string[] | null;
  specialistAgentCount?: number | null;
} | null;

interface TeamRoomPlanSummaryStep {
  stepKey?: string | null;
  title?: string | null;
  objective?: string | null;
  deliverable?: string | null;
  ownerPersona?: string | null;
  ownerMemberId?: string | null;
  reviewerPersona?: string | null;
  reviewerMemberId?: string | null;
  verificationMethod?: string | null;
  retryRule?: string | null;
  evidenceRequirements?: string[];
  qualityCriteria?: string[];
  reviewChecklist?: string[];
  status?: string | null;
  notes?: string | null;
}

interface TeamRoomStepResultMetadata {
  phase?: "execution" | "review" | "repair" | "handoff" | "finalize" | string | null;
  stepKey?: string | null;
  stepTitle?: string | null;
  stepObjective?: string | null;
  stepDeliverable?: string | null;
  ownerPersona?: string | null;
  ownerMemberId?: string | null;
  reviewerPersona?: string | null;
  reviewerMemberId?: string | null;
  attempt?: number | null;
  verificationMethod?: string | null;
  retryRule?: string | null;
  evidenceRequirements?: string[];
  qualityCriteria?: string[];
  reviewChecklist?: string[];
  selectedSkillId?: string | null;
  selectedProvider?: string | null;
  selectedModelId?: string | null;
  resultSummary?: string | null;
  reviewStatus?: string | null;
  reviewScore?: number | null;
  reviewIteration?: number | null;
  reviewNote?: string | null;
  repairInstructions?: string | null;
  nextAction?: string | null;
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
  roomGoal?: string | null;
  roomLanguage?: "en" | "th";
  roomCreatedAt?: string | Date | null;
  roomType?: string | null;
  roomAutonomy?: string | null;
  runMode?: string | null;
  selectedSkillId?: string | null;
  routeReason?: string | null;
  actors?: TeamRoomActor[];
  viewMode?: "transparent" | "milestone" | "summary";
  runStatus?:
    | "idle"
    | "queued"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "stopped";
  runStatusReason?: string | null;
  focusMessageRequest?: {
    messageId: string;
    nonce: number;
    workItemId?: string;
    composeReply?: boolean;
    messageAnchorId?: string | null;
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

const ACTOR_COLORS: Record<
  string,
  { bg: string; border: string; avatar: string }
> = {
  system: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    avatar: "bg-amber-500",
  },
  user: {
    bg: "bg-slate-50",
    border: "border-slate-200",
    avatar: "bg-slate-600",
  },
  assistant: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    avatar: "bg-blue-500",
  },
};

const AGENT_AVATAR_COLORS = [
  "bg-violet-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-pink-500",
];

type ConversationSide = "left" | "right";

interface ConversationMessageLayout {
  side: ConversationSide;
  rowClassName: string;
  bubbleClassName: string;
  headerClassName: string;
}

function getAgentColor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
  }
  return AGENT_AVATAR_COLORS[Math.abs(hash) % AGENT_AVATAR_COLORS.length];
}

function getConversationMessageLayout(
  actorType: RunStreamEvent["actorType"],
  side: ConversationSide
): ConversationMessageLayout {
  if (actorType === "user") {
    return {
      side: "right",
      rowClassName: "flex-row-reverse",
      bubbleClassName:
        "border-emerald-200 bg-emerald-50/90 text-emerald-950 shadow-[0_12px_32px_-24px_rgba(16,185,129,0.6)]",
      headerClassName: "justify-end text-right",
    };
  }

  if (actorType === "system") {
    return {
      side: "left",
      rowClassName: "flex-row",
      bubbleClassName:
        "border-amber-200 bg-amber-50/90 text-amber-950 shadow-[0_12px_32px_-24px_rgba(245,158,11,0.45)]",
      headerClassName: "justify-start",
    };
  }

  if (side === "right") {
    return {
      side,
      rowClassName: "flex-row-reverse",
      bubbleClassName:
        "border-violet-200 bg-violet-50/90 text-violet-950 shadow-[0_12px_32px_-24px_rgba(139,92,246,0.6)]",
      headerClassName: "justify-end text-right",
    };
  }

  return {
    side: "left",
    rowClassName: "flex-row",
    bubbleClassName:
      "border-sky-200 bg-sky-50/90 text-sky-950 shadow-[0_12px_32px_-24px_rgba(14,165,233,0.6)]",
    headerClassName: "justify-start",
  };
}

const LONG_MESSAGE_PREVIEW_LENGTH = 240;

function normalizePreviewText(value: string, maxLength = LONG_MESSAGE_PREVIEW_LENGTH): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function readStringField(
  source: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumberField(
  source: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  if (!source) return null;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArrayField(
  source: Record<string, unknown> | null | undefined,
  key: string
): string[] {
  if (!source) return [];
  const value = source[key];
  return Array.isArray(value)
    ? value
        .map(item =>
          typeof item === "string" && item.trim().length > 0
            ? item.trim()
            : null
        )
        .filter((item): item is string => Boolean(item))
    : [];
}

function readPlanSummaryStepArrayField(
  source: Record<string, unknown> | null | undefined,
  key: string
): TeamRoomPlanSummaryStep[] {
  if (!source) return [];
  const value = source[key];
  if (!Array.isArray(value)) return [];

  return value
    .map(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const step = item as Record<string, unknown>;
      return {
        stepKey: readStringField(step, "stepKey"),
        title: readStringField(step, "title"),
        objective: readStringField(step, "objective"),
        deliverable: readStringField(step, "deliverable"),
        ownerPersona: readStringField(step, "ownerPersona"),
        ownerMemberId: readStringField(step, "ownerMemberId"),
        reviewerPersona: readStringField(step, "reviewerPersona"),
        reviewerMemberId: readStringField(step, "reviewerMemberId"),
        verificationMethod: readStringField(step, "verificationMethod"),
        retryRule: readStringField(step, "retryRule"),
        evidenceRequirements: readStringArrayField(step, "evidenceRequirements"),
        qualityCriteria: readStringArrayField(step, "qualityCriteria"),
        reviewChecklist: readStringArrayField(step, "reviewChecklist"),
        status: readStringField(step, "status"),
        notes: readStringField(step, "notes"),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function readPlanSummaryStepArrayFields(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[]
): TeamRoomPlanSummaryStep[] {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const steps = readPlanSummaryStepArrayField(source, key);
      if (steps.length > 0) return steps;
    }
  }
  return [];
}

function normalizeMessageMetadata(value: unknown): TeamRoomMessageMetadata {
  if (!value || typeof value !== "object") return {};
  const metadata = value as Record<string, unknown>;
  const details =
    metadata.details && typeof metadata.details === "object" && !Array.isArray(metadata.details)
      ? (metadata.details as Record<string, unknown>)
      : null;
  const stepResultPhase = readStringField(details, "stepResultPhase");
  const stepResult: TeamRoomStepResultMetadata | null = details
    ? {
        phase: stepResultPhase,
        stepKey: readStringField(details, "stepKey"),
        stepTitle: readStringField(details, "stepTitle"),
        stepObjective: readStringField(details, "stepObjective"),
        stepDeliverable: readStringField(details, "stepDeliverable"),
        ownerPersona: readStringField(details, "stepOwnerPersona"),
        ownerMemberId: readStringField(details, "stepOwnerMemberId"),
        reviewerPersona: readStringField(details, "stepReviewerPersona"),
        reviewerMemberId: readStringField(details, "stepReviewerMemberId"),
        attempt: readNumberField(details, "stepAttempt"),
        verificationMethod: readStringField(details, "stepVerificationMethod"),
        retryRule: readStringField(details, "stepRetryRule"),
        evidenceRequirements: readStringArrayField(details, "stepEvidenceRequirements"),
        qualityCriteria: readStringArrayField(details, "stepQualityCriteria"),
        reviewChecklist: readStringArrayField(details, "stepReviewChecklist"),
        selectedSkillId: readStringField(details, "stepSelectedSkillId"),
        selectedProvider: readStringField(details, "stepSelectedProvider"),
        selectedModelId: readStringField(details, "stepSelectedModelId"),
        resultSummary: readStringField(details, "stepResultSummary"),
        reviewStatus: readStringField(details, "stepReviewStatus"),
        reviewScore: readNumberField(details, "stepReviewScore"),
        reviewIteration: readNumberField(details, "stepReviewIteration"),
        reviewNote: readStringField(details, "stepReviewNote"),
        repairInstructions: readStringField(details, "stepRepairInstructions"),
        nextAction: readStringField(details, "stepNextAction"),
      }
    : null;
  const reviewStatus =
    readStringField(metadata, "reviewStatus") ??
    readStringField(details, "reviewStatus") ??
    stepResult?.reviewStatus ??
    null;
  const reviewScore =
    readNumberField(metadata, "reviewScore") ??
    readNumberField(details, "reviewScore") ??
    stepResult?.reviewScore ??
    null;
  const reviewIteration =
    readNumberField(metadata, "reviewIteration") ??
    readNumberField(details, "reviewIteration") ??
    stepResult?.reviewIteration ??
    null;
  const reviewRecommendation =
    readStringField(metadata, "reviewRecommendation") ??
    readStringField(details, "reviewRecommendation") ??
    null;
  const metadataReviewIssues = readStringArrayField(metadata, "reviewIssues");
  const reviewIssues =
    metadataReviewIssues.length > 0 || Object.prototype.hasOwnProperty.call(metadata, "reviewIssues")
      ? metadataReviewIssues
      : readStringArrayField(details, "reviewIssues");
  const planSteps = readPlanSummaryStepArrayFields(
    [details, metadata],
    ["steps", "planSteps"]
  );
  return {
    messageType:
      typeof metadata.messageType === "string" ? metadata.messageType : null,
    workItemId:
      typeof metadata.workItemId === "string" ? metadata.workItemId : null,
    replyToMessageId:
      typeof metadata.replyToMessageId === "string"
        ? metadata.replyToMessageId
        : null,
    threadRootMessageId:
      typeof metadata.threadRootMessageId === "string"
        ? metadata.threadRootMessageId
        : null,
    reviewStatus,
    reviewScore,
    reviewIteration,
    reviewRecommendation,
    reviewIssues,
    planStatus:
      readStringField(metadata, "planStatus") ??
      readStringField(details, "planStatus") ??
      null,
    planSteps,
    details,
    stepResult,
    runtimeMetadata:
      metadata.runtimeMetadata && typeof metadata.runtimeMetadata === "object"
        ? {
            selectedSkillId:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .selectedSkillId === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .selectedSkillId as string)
                : null,
            routeReason:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .routeReason === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .routeReason as string)
                : null,
            route:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .route === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .route as string)
                : null,
            llmModelId:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .llmModelId === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .llmModelId as string)
                : null,
            runtimeEngine:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeEngine === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeEngine as string)
                : null,
            runtimeMode:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeMode === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeMode as string)
                : null,
            runtimeStatus:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeStatus === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeStatus as string)
                : null,
            runtimeTraceId:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeTraceId === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeTraceId as string)
                : null,
            runtimeSdkVersion:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeSdkVersion === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeSdkVersion as string)
                : null,
            runtimeAdapterVersion:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeAdapterVersion === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeAdapterVersion as string)
                : null,
            runtimeCheckpointId:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeCheckpointId === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeCheckpointId as string)
                : null,
            runtimeCheckpointStatus:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeCheckpointStatus === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeCheckpointStatus as string)
                : null,
            runtimeResumeCursor:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .runtimeResumeCursor === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .runtimeResumeCursor as string)
                : null,
            runtimeArtifactRefs:
              Array.isArray((metadata.runtimeMetadata as Record<string, unknown>).runtimeArtifactRefs)
                ? ((metadata.runtimeMetadata as Record<string, unknown>).runtimeArtifactRefs as unknown[])
                    .filter((value): value is string => typeof value === "string")
                : null,
            requestedSubagent:
              typeof (metadata.runtimeMetadata as Record<string, unknown>)
                .requestedSubagent === "string"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .requestedSubagent as string)
                : null,
            subagentTopology:
              (metadata.runtimeMetadata as Record<string, unknown>).subagentTopology &&
              typeof (metadata.runtimeMetadata as Record<string, unknown>).subagentTopology === "object"
                ? ((metadata.runtimeMetadata as Record<string, unknown>)
                    .subagentTopology as TeamRoomRuntimeSubagentTopology)
                : null,
          }
        : null,
    runtimeDisclosure:
      metadata.runtimeDisclosure &&
      typeof metadata.runtimeDisclosure === "object"
        ? {
            source:
              metadata.runtimeDisclosure &&
              typeof (metadata.runtimeDisclosure as Record<string, unknown>)
                .source === "string"
                ? ((metadata.runtimeDisclosure as Record<string, unknown>)
                    .source as "cloud" | "hybrid")
                : null,
            taskClass:
              typeof (metadata.runtimeDisclosure as Record<string, unknown>)
                .taskClass === "string"
                ? ((metadata.runtimeDisclosure as Record<string, unknown>)
                    .taskClass as string)
                : null,
            profileId:
              typeof (metadata.runtimeDisclosure as Record<string, unknown>)
                .profileId === "string"
                ? ((metadata.runtimeDisclosure as Record<string, unknown>)
                    .profileId as string)
                : null,
            fallbackReason:
              typeof (metadata.runtimeDisclosure as Record<string, unknown>)
                .fallbackReason === "string"
                ? ((metadata.runtimeDisclosure as Record<string, unknown>)
                    .fallbackReason as string)
                : null,
            voiceInputMode:
              typeof (metadata.runtimeDisclosure as Record<string, unknown>)
                .voiceInputMode === "string"
                ? ((metadata.runtimeDisclosure as Record<string, unknown>)
                    .voiceInputMode as string)
                : null,
          }
        : null,
    citationRefs: Array.isArray(metadata.citationRefs)
      ? (metadata.citationRefs as TeamRoomMessageMetadata["citationRefs"])
      : [],
  };
}

function getEventPriorityScore(event: RunStreamEvent): number {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const metadata = normalizeMessageMetadata(data.metadata);
  let score = String(event.eventId).startsWith("history:") ? 2 : 1;
  if (
    metadata.messageType ||
    metadata.workItemId ||
    metadata.replyToMessageId ||
    metadata.threadRootMessageId
  ) {
    score += 3;
  }
  if (
    Array.isArray(metadata.citationRefs) &&
    metadata.citationRefs.length > 0
  ) {
    score += 1;
  }
  return score;
}

function formatMessageTypeLabel(
  messageType: string | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
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
    case "plan_summary":
      return t("orchestrator.room.messageType.summary");
    case "step_result":
      return t("orchestrator.room.messageType.stepResult");
    default:
      return null;
  }
}

function getStepResultPhaseLabel(
  phase: string | null | undefined,
  roomLanguage: "en" | "th"
): string {
  switch (phase) {
    case "review":
      return roomLanguage === "th" ? "ผลการตรวจ" : "Review result";
    case "repair":
      return roomLanguage === "th" ? "รอบแก้ไข" : "Repair loop";
    case "handoff":
      return roomLanguage === "th" ? "ส่งต่องาน" : "Handoff";
    case "finalize":
      return roomLanguage === "th" ? "ผลลัพธ์สุดท้าย" : "Final result";
    case "execution":
    default:
      return roomLanguage === "th" ? "ผลลัพธ์การทำงาน" : "Execution result";
  }
}

function getStepReviewBadgeTone(
  reviewStatus: string | null | undefined
): string {
  switch (reviewStatus) {
    case "passed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "not_required":
      return "border-slate-200 bg-slate-50 text-slate-700";
    case "pending":
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function getStepReviewLabel(
  reviewStatus: string | null | undefined,
  roomLanguage: "en" | "th"
): string | null {
  switch (reviewStatus) {
    case "passed":
      return roomLanguage === "th" ? "ตรวจผ่าน" : "Review passed";
    case "failed":
      return roomLanguage === "th" ? "ตรวจไม่ผ่าน" : "Review failed";
    case "pending":
      return roomLanguage === "th" ? "รอตรวจ" : "Review pending";
    case "not_required":
      return roomLanguage === "th" ? "ไม่ต้องตรวจ" : "Review not required";
    default:
      return null;
  }
}

type RoomLoopKind = "single" | "review_loop" | "system_issue" | "mixed";

interface RoomLoopSummary {
  kind: RoomLoopKind;
  label: string;
  detail: string;
}

const REVIEW_LOOP_KEYWORDS = [
  "revise",
  "rewrite",
  "refine",
  "adjust",
  "clarify",
  "expand",
  "strengthen",
  "stronger",
  "tighter",
  "update",
  "resubmit",
  "iterate",
  "repair",
  "แก้",
  "ปรับ",
  "ทบทวน",
  "เพิ่มเติม",
  "ขยาย",
  "ปรับปรุง",
];

const SYSTEM_LOOP_KEYWORDS = [
  "error",
  "timeout",
  "timed out",
  "schema",
  "provider",
  "invalid json",
  "parse",
  "undefined",
  "exception",
  "unavailable",
  "blocked",
  "fault",
  "crash",
  "ผิดพลาด",
  "ล้มเหลว",
  "หมดเวลา",
  "ไม่สามารถ",
  "ข้อผิดพลาด",
];

function countKeywordHits(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => {
    return text.includes(keyword) ? count + 1 : count;
  }, 0);
}

function getRoomLoopSummary(input: {
  roomLanguage: "en" | "th";
  count: number;
  reviewStatus?: string | null;
  reviewNote?: string | null;
  reviewRecommendation?: string | null;
  reviewIssues?: string[] | null;
  repairInstructions?: string | null;
  nextAction?: string | null;
  resultSummary?: string | null;
}): RoomLoopSummary | null {
  if (input.count <= 1) {
    return {
      kind: "single",
      label: input.roomLanguage === "th" ? "ทำครั้งเดียว" : "Single pass",
      detail:
        input.roomLanguage === "th"
          ? "ขั้นตอนนี้จบในรอบเดียว จึงไม่มีการวนซ้ำให้ตรวจเพิ่ม"
          : "This step finished in one pass, so there was no retry loop.",
    };
  }

  const combinedText = normalizeSearchQuery(
    [
      input.reviewNote,
      input.reviewRecommendation,
      input.reviewIssues?.join(" "),
      input.repairInstructions,
      input.nextAction,
      input.resultSummary,
      input.reviewStatus,
    ]
      .filter(Boolean)
      .join(" ")
  );
  const reviewHitCount = countKeywordHits(combinedText, REVIEW_LOOP_KEYWORDS);
  const systemHitCount = countKeywordHits(combinedText, SYSTEM_LOOP_KEYWORDS);

  let kind: RoomLoopKind = "review_loop";
  if (reviewHitCount > 0 && systemHitCount > 0) {
    kind = "mixed";
  } else if (systemHitCount > 0) {
    kind = "system_issue";
  }

  const countLabel =
    input.roomLanguage === "th" ? `${input.count} รอบ` : `${input.count}x`;
  const labels: Record<RoomLoopKind, string> =
    input.roomLanguage === "th"
      ? {
          single: "ทำครั้งเดียว",
          review_loop: "วนจากรีวิว",
          system_issue: "ติดปัญหาระบบ",
          mixed: "วนผสม",
        }
      : {
          single: "Single pass",
          review_loop: "Review loop",
          system_issue: "System issue",
          mixed: "Mixed loop",
        };
  const details: Record<RoomLoopKind, string> =
    input.roomLanguage === "th"
      ? {
          single: "ขั้นตอนนี้จบในรอบเดียว จึงไม่มีการวนซ้ำให้ตรวจเพิ่ม",
          review_loop:
            "รอบก่อนหน้าถูกแก้ตามฟีดแบ็กของผู้ตรวจ จึงต้องทำซ้ำก่อนจะไปต่อ",
          system_issue:
            "รอบก่อนหน้าสะดุดจากข้อผิดพลาดของระบบหรือผู้ให้บริการ ไม่ใช่แค่การปรับเนื้อหา",
          mixed:
            "มีทั้งฟีดแบ็กจากผู้ตรวจและข้อผิดพลาดของระบบปนกันในรอบต่าง ๆ",
        }
      : {
          single: "This step finished in one pass, so there was no retry loop.",
          review_loop:
            "Earlier passes were revised after reviewer feedback before continuing.",
          system_issue:
            "Earlier passes were retried because of a runtime or provider issue.",
          mixed:
            "Earlier passes mixed reviewer feedback with runtime or provider issues.",
        };

  return {
    kind,
    label: `${labels[kind]} · ${countLabel}`,
    detail: details[kind],
  };
}

function normalizeSearchQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildEventSearchText(
  event: RunStreamEvent,
  actorLabel: string,
  messageTypeLabel: string | null,
  roomLanguage: "en" | "th"
): string {
  const eventData = (event.data ?? {}) as Record<string, unknown>;
  const metadata = normalizeMessageMetadata(eventData.metadata);
  const content =
    typeof eventData.content === "string" ? eventData.content : "";
  const summaryContent =
    typeof eventData.summaryContent === "string" ? eventData.summaryContent : "";
  const citationText = (metadata.citationRefs ?? [])
    .map(ref => [ref.title, ref.note, ref.url].filter(Boolean).join(" "))
    .join(" ");
  const stepResult = metadata.stepResult;
  const planStepText = (metadata.planSteps ?? [])
    .map(step =>
      [
        step.stepKey,
        step.title,
        step.objective,
        step.deliverable,
        step.ownerPersona,
        step.ownerMemberId,
        step.reviewerPersona,
        step.reviewerMemberId,
        step.verificationMethod,
        step.retryRule,
        step.evidenceRequirements?.join(" "),
        step.qualityCriteria?.join(" "),
        step.reviewChecklist?.join(" "),
        step.notes,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");
  const reviewLabel =
    getStepReviewLabel(metadata.reviewStatus, roomLanguage) ?? "";
  const reviewScore =
    typeof metadata.reviewScore === "number" && Number.isFinite(metadata.reviewScore)
      ? metadata.reviewScore.toFixed(2)
      : "";

  return normalizeSearchQuery(
    [
      actorLabel,
      event.actorType,
      event.eventType,
      content,
      summaryContent,
      messageTypeLabel,
      metadata.messageType,
      metadata.planStatus,
      metadata.reviewStatus,
      reviewLabel,
      reviewScore,
      metadata.reviewRecommendation,
      (metadata.reviewIssues ?? []).join(" "),
      planStepText,
      stepResult?.phase,
      stepResult?.stepKey,
      stepResult?.stepTitle,
      stepResult?.stepObjective,
      stepResult?.stepDeliverable,
      stepResult?.ownerPersona,
      stepResult?.ownerMemberId,
      stepResult?.reviewerPersona,
      stepResult?.reviewerMemberId,
      stepResult?.verificationMethod,
      stepResult?.retryRule,
      (stepResult?.evidenceRequirements ?? []).join(" "),
      (stepResult?.qualityCriteria ?? []).join(" "),
      (stepResult?.reviewChecklist ?? []).join(" "),
      stepResult?.resultSummary,
      stepResult?.reviewNote,
      stepResult?.repairInstructions,
      stepResult?.nextAction,
      metadata.selectedSkillId,
      metadata.selectedProvider,
      metadata.selectedModelId,
      metadata.workItemId,
      citationText,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function StepResultCard({
  roomLanguage,
  metadata,
  content,
  messageId,
}: {
  roomLanguage: "en" | "th";
  metadata: TeamRoomStepResultMetadata;
  content: string;
  messageId: string;
}): React.ReactNode {
  const phaseLabel = getStepResultPhaseLabel(metadata.phase, roomLanguage);
  const reviewLabel = getStepReviewLabel(metadata.reviewStatus, roomLanguage);
  const reviewScore =
    typeof metadata.reviewScore === "number" && Number.isFinite(metadata.reviewScore)
      ? metadata.reviewScore.toFixed(2)
      : null;
  const resultSummary =
    metadata.resultSummary?.trim() || content.trim() || "";
  const loopSummary = getRoomLoopSummary({
    roomLanguage,
    count: typeof metadata.attempt === "number" ? metadata.attempt : 1,
    reviewStatus: metadata.reviewStatus ?? null,
    reviewNote: metadata.reviewNote ?? null,
    repairInstructions: metadata.repairInstructions ?? null,
    nextAction: metadata.nextAction ?? null,
    resultSummary,
  });

  return (
    <div className="mt-3 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-slate-50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">
            {metadata.stepTitle ?? metadata.stepKey ?? "Step result"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {metadata.stepKey ?? "step"}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {loopSummary && (
            <Badge
              variant="outline"
              title={loopSummary.detail}
              data-testid={`team-room-loop-badge-${messageId}`}
              className={cn("text-[10px]", getStepReviewBadgeTone(
                loopSummary.kind === "system_issue"
                  ? "failed"
                  : loopSummary.kind === "single"
                    ? "not_required"
                    : metadata.reviewStatus
              ))}
            >
              {loopSummary.label}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-sky-200 bg-sky-50 text-[10px] text-sky-700"
          >
            {phaseLabel}
          </Badge>
          {reviewLabel && (
            <Badge
              variant="outline"
              className={cn("text-[10px]", getStepReviewBadgeTone(metadata.reviewStatus))}
            >
              {reviewScore !== null ? `${reviewLabel} · ${reviewScore}` : reviewLabel}
            </Badge>
          )}
          {typeof metadata.attempt === "number" && Number.isFinite(metadata.attempt) && (
            <Badge variant="outline" className="text-[10px]">
              {roomLanguage === "th" ? `รอบ ${metadata.attempt}` : `Attempt ${metadata.attempt}`}
            </Badge>
          )}
        </div>
      </div>

      {loopSummary && (
        <div className="mt-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">
            {roomLanguage === "th" ? "เหตุผลการวนซ้ำ" : "Loop reason"}:
          </span>{" "}
          {loopSummary.detail}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {roomLanguage === "th" ? "ผู้รับผิดชอบ" : "Owner"}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {metadata.ownerPersona ?? metadata.ownerMemberId ?? "n/a"}
          </div>
          {metadata.ownerPersona &&
            metadata.ownerMemberId &&
            metadata.ownerPersona !== metadata.ownerMemberId && (
              <div className="mt-0.5 text-xs text-slate-500">
                {metadata.ownerMemberId}
              </div>
            )}
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {roomLanguage === "th" ? "ผู้ตรวจ" : "Reviewer"}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {metadata.reviewerPersona ?? metadata.reviewerMemberId ?? "n/a"}
          </div>
          {metadata.reviewerPersona &&
            metadata.reviewerMemberId &&
            metadata.reviewerPersona !== metadata.reviewerMemberId && (
              <div className="mt-0.5 text-xs text-slate-500">
                {metadata.reviewerMemberId}
              </div>
            )}
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {roomLanguage === "th" ? "เป้าหมาย" : "Objective"}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {metadata.stepObjective ?? "n/a"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {roomLanguage === "th" ? "ผลลัพธ์ที่ต้องส่ง" : "Deliverable"}
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {metadata.stepDeliverable ?? "n/a"}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-sky-100 bg-white/90 px-3 py-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-sky-700">
          {roomLanguage === "th" ? "ผลลัพธ์" : "Result"}
        </div>
        <ExpandableMessageText
          messageId={`${metadata.stepKey ?? "step"}:result`}
          roomLanguage={roomLanguage}
          fullText={resultSummary || (roomLanguage === "th" ? "ยังไม่มีผลลัพธ์" : "No result captured yet.")}
          previewText={content}
          contentClassName="text-sm leading-6 text-slate-800"
        />
      </div>

      {(metadata.reviewNote ||
        metadata.repairInstructions ||
        metadata.nextAction) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {metadata.reviewNote && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700">
                {roomLanguage === "th" ? "หมายเหตุผู้ตรวจ" : "Reviewer note"}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                {metadata.reviewNote}
              </div>
            </div>
          )}
          {metadata.repairInstructions && (
            <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-rose-700">
                {roomLanguage === "th" ? "คำแนะนำการแก้ไข" : "Repair instructions"}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-rose-950">
                {metadata.repairInstructions}
              </div>
            </div>
          )}
          {metadata.nextAction && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 sm:col-span-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-700">
                {roomLanguage === "th" ? "ขั้นถัดไป" : "Next action"}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-900">
                {metadata.nextAction}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-600">
        {metadata.selectedSkillId && (
          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] text-sky-700">
            Skill: {metadata.selectedSkillId}
          </Badge>
        )}
        {metadata.selectedProvider && (
          <Badge variant="outline" className="text-[10px]">
            Provider: {metadata.selectedProvider}
          </Badge>
        )}
        {metadata.selectedModelId && (
          <Badge variant="outline" className="text-[10px]">
            Model: {metadata.selectedModelId}
          </Badge>
        )}
      </div>
    </div>
  );
}

function PlanReviewCard({
  roomLanguage,
  metadata,
  messageId,
}: {
  roomLanguage: "en" | "th";
  metadata: TeamRoomMessageMetadata;
  messageId: string;
}): React.ReactNode {
  const reviewLabel = getStepReviewLabel(metadata.reviewStatus, roomLanguage);
  const reviewScore =
    typeof metadata.reviewScore === "number" && Number.isFinite(metadata.reviewScore)
      ? metadata.reviewScore.toFixed(2)
      : null;
  const recommendation = metadata.reviewRecommendation?.trim() || null;
  const issues = metadata.reviewIssues ?? [];
  const loopSummary = getRoomLoopSummary({
    roomLanguage,
    count: typeof metadata.reviewIteration === "number" ? metadata.reviewIteration : 1,
    reviewStatus: metadata.reviewStatus ?? null,
    reviewRecommendation: recommendation,
    reviewIssues: issues,
    resultSummary: recommendation,
  });
  const planSteps = metadata.planSteps ?? [];
  const makePlanStepAnchorId = (stepKey: string | null | undefined, index: number) => {
    const raw = stepKey?.trim() || `step-${index + 1}`;
    return `${messageId}::plan-step-${raw.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9:_-]/g, "-")}`;
  };

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-amber-950">
            {roomLanguage === "th" ? "สรุปผลตรวจแผน" : "Plan review summary"}
          </div>
          <div className="mt-1 text-[11px] text-amber-900/70">
            {metadata.planStatus
              ? roomLanguage === "th"
                ? `สถานะแผน: ${metadata.planStatus}`
                : `Plan status: ${metadata.planStatus}`
              : roomLanguage === "th"
                ? "ผลตรวจแผนก่อนเริ่มงาน"
                : "Plan review before execution"}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {loopSummary && (
            <Badge
              variant="outline"
              title={loopSummary.detail}
              data-testid={`team-room-loop-badge-${messageId}`}
              className={cn("text-[10px]", getStepReviewBadgeTone(
                loopSummary.kind === "system_issue"
                  ? "failed"
                  : loopSummary.kind === "single"
                    ? "not_required"
                    : metadata.reviewStatus
              ))}
            >
              {loopSummary.label}
            </Badge>
          )}
          {reviewLabel && (
            <Badge
              variant="outline"
              className={cn("text-[10px]", getStepReviewBadgeTone(metadata.reviewStatus))}
            >
              {reviewScore !== null ? `${reviewLabel} · ${reviewScore}` : reviewLabel}
            </Badge>
          )}
          {typeof metadata.reviewIteration === "number" &&
            Number.isFinite(metadata.reviewIteration) && (
              <Badge variant="outline" className="text-[10px]">
                {roomLanguage === "th"
                  ? `รอบตรวจ ${metadata.reviewIteration}`
                  : `Iteration ${metadata.reviewIteration}`}
              </Badge>
            )}
        </div>
      </div>

      {loopSummary && (
        <div className="mt-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold text-amber-900">
            {roomLanguage === "th" ? "เหตุผลการวนซ้ำ" : "Loop reason"}:
          </span>{" "}
          {loopSummary.detail}
        </div>
      )}

      {(recommendation || issues.length > 0) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {recommendation && (
            <div className="rounded-xl border border-amber-100 bg-white/90 px-3 py-2 sm:col-span-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-amber-700">
                {roomLanguage === "th" ? "หมายเหตุผู้ตรวจ" : "Reviewer note"}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                {recommendation}
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <div className="rounded-xl border border-rose-100 bg-white/90 px-3 py-2 sm:col-span-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-rose-700">
                {roomLanguage === "th" ? "รายการที่ต้องแก้" : "Issues to fix"}
              </div>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-6 text-rose-950">
                {issues.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {planSteps.length > 0 && (
        <div className="mt-3 rounded-xl border border-sky-100 bg-white/90 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-sky-700">
            {roomLanguage === "th" ? "ขั้นตอนในแผน" : "Plan steps"}
          </div>
          <div className="mt-2 space-y-2">
            {planSteps.map((step, index) => {
              const anchorId = makePlanStepAnchorId(step.stepKey, index);
              return (
                <div
                  key={anchorId}
                  id={anchorId}
                  className="scroll-mt-28 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-sky-800">
                      {index + 1}. {step.title ?? step.stepKey ?? "Step"}
                    </div>
                    {step.status && (
                      <Badge variant="outline" className="text-[10px]">
                        {step.status}
                      </Badge>
                    )}
                  </div>
                  {step.objective && (
                    <div className="mt-1 text-sm leading-6 text-slate-800">
                      {step.objective}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                    {(step.stepKey || step.ownerPersona || step.reviewerPersona) && (
                      <>
                        {step.stepKey && <span>Key: {step.stepKey}</span>}
                        {step.ownerPersona && <span>Owner: {step.ownerPersona}</span>}
                        {step.reviewerPersona && <span>Reviewer: {step.reviewerPersona}</span>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandableMessageText({
  messageId,
  roomLanguage,
  fullText,
  previewText,
  contentClassName,
}: {
  messageId: string;
  roomLanguage: "en" | "th";
  fullText: string;
  previewText?: string | null;
  contentClassName?: string;
}): React.ReactNode {
  const normalizedFullText = fullText.trim();
  const normalizedPreview = previewText?.trim() || null;
  const isExpandable =
    normalizedFullText.length > LONG_MESSAGE_PREVIEW_LENGTH ||
    normalizedFullText.split(/\n+/).length > 6;
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [messageId]);

  if (!normalizedFullText) {
    return null;
  }

  const displayText =
    isExpanded || !isExpandable
      ? normalizedFullText
      : normalizedPreview && normalizedPreview.length > 0
        ? normalizePreviewText(normalizedPreview)
        : normalizePreviewText(normalizedFullText);

  return (
    <div className="mt-1 space-y-1.5">
      <div className={cn("whitespace-pre-wrap", contentClassName)}>
        {displayText}
      </div>
      {isExpandable && (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
          onClick={() => setIsExpanded(value => !value)}
        >
          {isExpanded
            ? roomLanguage === "th"
              ? "แสดงโดยย่อ"
              : "Show less"
            : roomLanguage === "th"
              ? "แสดงเต็ม"
              : "Show more"}
        </button>
      )}
    </div>
  );
}

function truncateInline(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function selectCoordinatorMemberId(actors: TeamRoomActor[]): string | null {
  return (
    actors.find(
      actor =>
        actor.memberKind === "assistant" && actor.memberRole === "orchestrator"
    )?.id ??
    actors.find(actor => actor.memberKind === "assistant" && actor.isLead)
      ?.id ??
    actors.find(actor => actor.memberKind === "assistant")?.id ??
    null
  );
}

function getNextWorkflowStep(
  status?: string | null
): "research" | "review" | "approval" | null {
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

function getNextWorkflowStepLabel(
  step: "research" | "review" | "approval",
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

interface QuickReplyTemplate {
  label: string;
  content: string;
  tone: "primary" | "warning" | "neutral";
}

function getQuickReplyTemplatesForStatus(
  status: string | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
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

function getQuickReplyTemplateClasses(
  tone: QuickReplyTemplate["tone"]
): string {
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
  roomGoal,
  roomLanguage = "en",
  roomCreatedAt,
  roomType,
  roomAutonomy,
  runMode,
  selectedSkillId,
  routeReason,
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
  const { t } = useScopedTranslation("agency");
  const hasControllableRun = Boolean(
    runId && (runStatus === "running" || runStatus === "paused")
  );
  const canStartRun =
    Boolean(onStartRun) &&
    (!runId ||
      runStatus === "completed" ||
      runStatus === "stopped" ||
      runStatus === "failed");
  const streamEnabled = Boolean(runId && hasControllableRun);
  const [liveEvents, setLiveEvents] = useState<RunStreamEvent[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [expandedRuntimeMessageId, setExpandedRuntimeMessageId] = useState<
    string | null
  >(null);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible"
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollPinnedRef = useRef(true);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastMarkedViewedKeyRef = useRef<string | null>(null);
  const coordinatorMemberId = useMemo(
    () => selectCoordinatorMemberId(actors),
    [actors]
  );
  const actorLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    for (const actor of actors) {
      if (actor.displayName?.trim()) {
        labels.set(actor.id, actor.displayName.trim());
      }
      if (actor.humanUserId) {
        labels.set(
          `user:${actor.humanUserId}`,
          actor.displayName?.trim() ||
            t("orchestrator.common.userNumber", { id: actor.humanUserId })
        );
      }
    }
    if (user?.id) {
      labels.set(
        `user:${user.id}`,
        user.name ||
          user.email ||
          t("orchestrator.common.userNumber", { id: user.id })
      );
    }
    return labels;
  }, [actors, t, user?.email, user?.id, user?.name]);
  const actorLabelByIdRef = useRef(actorLabelById);
  const eventByMessageIdRef = useRef<Map<string, RunStreamEvent>>(new Map());

  useEffect(() => {
    actorLabelByIdRef.current = actorLabelById;
  }, [actorLabelById]);

  const { data: historyMessages, isLoading: loadingHistory } =
    trpc.teamRoom.getMessages.useQuery(
      {
        roomId,
        viewMode,
        limit: 100,
      },
      {
        enabled: !!roomId,
        refetchOnWindowFocus: false,
        refetchInterval: 4000,
      }
    );

  const { data: viewerState } = trpc.teamRoom.viewerState.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
    }
  );

  const { data: workItems } = trpc.teamWorkItem.listByRoom.useQuery(
    { roomId },
    {
      enabled: !!roomId,
      refetchOnWindowFocus: false,
      refetchInterval: 5000,
    }
  );

  const invalidateRoomState = useCallback(async () => {
    await Promise.all([
      utils.teamRoom.getMessages.invalidate({ roomId }),
      utils.teamRoom.viewerState.invalidate({ roomId }),
      utils.teamWorkItem.listByRoom.invalidate({ roomId }),
      runId ? utils.teamRun.get.invalidate({ runId }) : Promise.resolve(),
    ]);
  }, [
    roomId,
    runId,
    utils.teamRoom.getMessages,
    utils.teamRoom.viewerState,
    utils.teamWorkItem.listByRoom,
    utils.teamRun.get,
  ]);

  const markViewedMutation = trpc.teamRoom.markViewed.useMutation({
    onSuccess: data => {
      utils.teamRoom.viewerState.setData({ roomId }, data);
    },
  });

  const createWorkItemMutation = trpc.teamWorkItem.create.useMutation({
    onSuccess: async () => {
      await invalidateRoomState();
      toast.success(t("orchestrator.room.toast.workItemCreated"));
    },
    onError: error => toast.error(error.message),
  });

  const advanceWorkflowMutation = trpc.teamWorkItem.advanceWorkflow.useMutation(
    {
      onSuccess: async (_, variables) => {
        await invalidateRoomState();
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
      await invalidateRoomState();
      toast.success(t("orchestrator.room.toast.workItemApproved"));
    },
    onError: error => toast.error(error.message),
  });

  const rejectMutation = trpc.teamWorkItem.reject.useMutation({
    onSuccess: async () => {
      await invalidateRoomState();
      toast.success(t("orchestrator.room.toast.workItemChangesRequested"));
    },
    onError: error => toast.error(error.message),
  });

  const { connected } = useRunStream({
    runId,
    enabled: streamEnabled,
    onEvent: useCallback((event: RunStreamEvent) => {
      setLiveEvents(prev => [...prev.slice(-199), event]);
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
    return ((historyMessages ?? []) as any[]).map(message => {
      const senderUserId = message.senderUserId
        ? String(message.senderUserId)
        : null;
      const senderAssistantId = message.senderAssistantId
        ? String(message.senderAssistantId)
        : null;
      const actorType =
        message.senderType === "assistant"
          ? "assistant"
          : message.senderType === "system"
            ? "system"
            : "user";

      const actorId =
        actorType === "assistant"
          ? (senderAssistantId ?? "assistant")
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
        ts:
          message.createdAt instanceof Date
            ? message.createdAt.toISOString()
            : String(message.createdAt),
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
      const key =
        typeof data.messageId === "string"
          ? `message:${data.messageId}`
          : `event:${event.eventId}`;
      const existing = deduped.get(key);
      if (
        !existing ||
        getEventPriorityScore(event) > getEventPriorityScore(existing)
      ) {
        deduped.set(key, event);
      }
    }

    return Array.from(deduped.values()).sort(
      (left, right) =>
        new Date(left.ts).getTime() - new Date(right.ts).getTime()
    );
  }, [historyEvents, liveEvents]);

  const handleSend = () => {
    if (!messageInput.trim()) return;
    onSendMessage?.({
      content: messageInput.trim(),
      replyToMessageId: replyTarget?.messageId,
      threadRootMessageId:
        replyTarget?.threadRootMessageId ?? replyTarget?.messageId,
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
      threadRootMessageId:
        replyTarget.threadRootMessageId ?? replyTarget.messageId,
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

  const handlePromoteToWorkItem = async (
    event: RunStreamEvent,
    messageId: string,
    content: string
  ) => {
    if (!teamId) {
      toast.error(t("orchestrator.room.error.teamContextRequired"));
      return;
    }
    const suggestedTitle = truncateInline(content, 72);
    const title = window.prompt(
      t("orchestrator.room.prompt.createWorkItem"),
      t("orchestrator.room.prompt.followUpTitle", { title: suggestedTitle })
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
    replyToMessageId?: string
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
      if (targetStep === "research" && runStatus === "running") {
        onAdvanceRun?.(1);
      }
    } catch {
      // Mutation onError already reports the failure to the user.
    }
  };

  const handleApproveWorkItem = async (
    workItem: WorkItemSummary,
    approverMemberId: string,
    replyToMessageId?: string
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
    presetReason?: string
  ): Promise<boolean> => {
    const reason =
      presetReason ??
      window.prompt(
        t("orchestrator.room.prompt.improveBeforeApproval"),
        t("orchestrator.room.prompt.reviseDraftDefault")
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
  const filteredEvents = events.filter(e => {
    if (viewMode === "transparent") return e.visibility !== "private_internal";
    if (viewMode === "milestone")
      return e.visibility === "transparent" || e.visibility === "milestone";
    if (viewMode === "summary")
      return e.visibility === "summary_only" || e.eventType.includes("summary");
    return true;
  });

  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(messageSearchQuery),
    [messageSearchQuery]
  );

  const searchedEvents = useMemo(() => {
    if (!normalizedSearchQuery) return filteredEvents;

    return filteredEvents.filter(event => {
      const data = (event.data ?? {}) as Record<string, unknown>;
      const messageId =
        typeof data.messageId === "string" ? data.messageId : null;
      const messageContent =
        typeof data.content === "string" ? data.content : "";
      const summaryContent =
        typeof data.summaryContent === "string" ? data.summaryContent : "";
      const metadata = normalizeMessageMetadata(data.metadata);
      const actorLabel =
        actorLabelById.get(event.actorId) ??
        (event.actorType === "assistant"
          ? event.actorId.slice(0, 12)
          : event.actorType === "system"
            ? t("orchestrator.common.system")
            : t("orchestrator.common.user"));
      const messageTypeLabel = formatMessageTypeLabel(metadata.messageType, t);
      const searchText = buildEventSearchText(
        event,
        actorLabel,
        messageTypeLabel,
        roomLanguage
      );

      if (messageId && searchText.includes(normalizedSearchQuery)) return true;
      return (
        messageContent.toLowerCase().includes(normalizedSearchQuery) ||
        summaryContent.toLowerCase().includes(normalizedSearchQuery) ||
        searchText.includes(normalizedSearchQuery)
      );
    });
  }, [
    actorLabelById,
    filteredEvents,
    normalizedSearchQuery,
    roomLanguage,
    t,
  ]);

  const visibleEvents = normalizedSearchQuery ? searchedEvents : filteredEvents;

  const searchMatchCount = visibleEvents.length;
  const searchTotalCount = filteredEvents.length;

  const handleMessageListScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isAutoScrollPinnedRef.current = distanceFromBottom <= 120;
  };

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (normalizedSearchQuery) return;
    if (!scrollRef.current) return;
    if (!isAutoScrollPinnedRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events.length, normalizedSearchQuery, visibleEvents.length]);

  useEffect(() => {
    if (!normalizedSearchQuery || visibleEvents.length === 0) return;
    const firstMessage = visibleEvents[0];
    const firstMessageId = (() => {
      const data = (firstMessage.data ?? {}) as Record<string, unknown>;
      return typeof data.messageId === "string" ? data.messageId : null;
    })();
    if (!firstMessageId) return;

    const element = messageRefs.current.get(firstMessageId);
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightedMessageId(firstMessageId);

    const timer = window.setTimeout(() => {
      setHighlightedMessageId(current =>
        current === firstMessageId ? null : current
      );
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [normalizedSearchQuery, visibleEvents]);

  const conversationLayoutsByEventId = useMemo(() => {
    const layouts = new Map<string, ConversationMessageLayout>();
    let lastPersonaKey: string | null = null;
    let personaTurnIndex = -1;

    for (const event of visibleEvents) {
      const speakerKey = `${event.actorType}:${event.actorId}`;
      if (event.actorType === "user") {
        layouts.set(
          event.eventId,
          getConversationMessageLayout(event.actorType, "right")
        );
        continue;
      }

      if (event.actorType === "assistant") {
        if (speakerKey !== lastPersonaKey) {
          personaTurnIndex += 1;
          lastPersonaKey = speakerKey;
        }
        const side: ConversationSide =
          personaTurnIndex % 2 === 0 ? "left" : "right";
        layouts.set(
          event.eventId,
          getConversationMessageLayout(event.actorType, side)
        );
        continue;
      }

      layouts.set(
        event.eventId,
        getConversationMessageLayout(event.actorType, "left")
      );
    }

    return layouts;
  }, [visibleEvents]);

  const latestVisibleMessageMarker = useMemo(() => {
    const latestEvent = filteredEvents[filteredEvents.length - 1];
    if (!latestEvent) return `${roomId}:empty`;
    const eventData = (latestEvent.data ?? {}) as Record<string, unknown>;
    const messageId =
      typeof eventData.messageId === "string"
        ? eventData.messageId
        : latestEvent.eventId;
    return `${roomId}:${messageId}:${latestEvent.ts}`;
  }, [filteredEvents, roomId]);

  const viewerLastViewedAtMs = useMemo(() => {
    if (!viewerState?.lastViewedAt) return null;
    const ts = new Date(viewerState.lastViewedAt).getTime();
    return Number.isFinite(ts) ? ts : null;
  }, [viewerState?.lastViewedAt]);

  const workItemById = useMemo(() => {
    const entries: Array<[string, WorkItemSummary]> = (
      (workItems ?? []) as WorkItemSummary[]
    ).map(item => [item.id, item]);
    return new Map<string, WorkItemSummary>(entries);
  }, [workItems]);

  const eventByMessageId = useMemo(() => {
    const map = new Map<string, RunStreamEvent>();
    for (const event of events) {
      const messageId = (event.data as Record<string, unknown> | undefined)
        ?.messageId;
      if (typeof messageId === "string") {
        map.set(messageId, event);
      }
    }
    return map;
  }, [events]);

  useEffect(() => {
    eventByMessageIdRef.current = eventByMessageId;
  }, [eventByMessageId]);

  const latestThreadMessageIdByRoot = useMemo(() => {
    const map = new Map<
      string,
      { messageId: string; ts: number; count: number }
    >();
    for (const event of events) {
      const eventData = (event.data ?? {}) as Record<string, unknown>;
      const messageId =
        typeof eventData.messageId === "string" ? eventData.messageId : null;
      if (!messageId) continue;
      const metadata = normalizeMessageMetadata(eventData.metadata);
      const rootId =
        metadata.threadRootMessageId ??
        (metadata.workItemId ? messageId : null);
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

  const activeReplyApproverMemberId =
    activeReplyWorkItem?.approverMemberId ?? coordinatorMemberId ?? null;
  const routeBadge = useMemo(
    () =>
      getExecutionRouteBadge({
        route: null,
        selectedSkillId,
        routeReason,
      }),
    [routeReason, selectedSkillId]
  );

  const quickReplyTemplates = useMemo(
    () =>
      getQuickReplyTemplatesForStatus(activeReplyWorkItem?.status ?? null, t),
    [activeReplyWorkItem?.status, t]
  );

  const handleQuickApproveAndPost = async () => {
    if (!replyTarget || !activeReplyWorkItem || !activeReplyApproverMemberId)
      return;
    const approved = await handleApproveWorkItem(
      activeReplyWorkItem,
      activeReplyApproverMemberId,
      replyTarget.messageId
    );
    if (approved) {
      postReplyContent(t("orchestrator.room.quickReply.approveContent"));
    }
  };

  const handleQuickRejectAndPost = async () => {
    if (!replyTarget || !activeReplyWorkItem || !activeReplyApproverMemberId)
      return;
    const reason = t("orchestrator.room.quickReply.requestChangesContent");
    const rejected = await handleRejectWorkItem(
      activeReplyWorkItem,
      activeReplyApproverMemberId,
      replyTarget.messageId,
      reason
    );
    if (rejected) {
      postReplyContent(reason);
    }
  };

  useEffect(() => {
    if (!focusMessageRequest?.messageId) return;
    const targetEvent = eventByMessageIdRef.current.get(
      focusMessageRequest.messageId,
    );
    const element = messageRefs.current.get(focusMessageRequest.messageId);
    if (!element) return;

    const scrollToTarget = (target: HTMLElement) => {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    };

    setHighlightedMessageId(focusMessageRequest.messageId);

    if (focusMessageRequest.messageAnchorId) {
      window.requestAnimationFrame(() => {
        const anchorElement = document.getElementById(
          `${focusMessageRequest.messageId}::${focusMessageRequest.messageAnchorId}`,
        );
        if (anchorElement) {
          scrollToTarget(anchorElement);
          return;
        }
        scrollToTarget(element);
      });
    } else {
      scrollToTarget(element);
    }

    if (focusMessageRequest.composeReply && targetEvent) {
      const eventData = (targetEvent.data ?? {}) as Record<string, unknown>;
      const metadata = normalizeMessageMetadata(eventData.metadata);
      const actorLabel =
        actorLabelByIdRef.current.get(targetEvent.actorId) ??
        (targetEvent.actorType === "assistant"
          ? targetEvent.actorId.slice(0, 12)
          : targetEvent.actorType === "system"
            ? t("orchestrator.common.system")
            : t("orchestrator.common.user"));

      setReplyTarget({
        messageId: focusMessageRequest.messageId,
        threadRootMessageId:
          metadata.threadRootMessageId ?? focusMessageRequest.messageId,
        workItemId:
          focusMessageRequest.workItemId ?? metadata.workItemId ?? null,
        actorLabel,
        preview: truncateInline(
          typeof eventData.content === "string"
            ? eventData.content
            : targetEvent.eventType,
          140
        ),
      });

      window.setTimeout(() => {
        composerRef.current?.focus();
      }, 120);
    }

    const timer = window.setTimeout(() => {
      setHighlightedMessageId(current =>
        current === focusMessageRequest.messageId ? null : current
      );
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [
    focusMessageRequest?.messageId,
    focusMessageRequest?.messageAnchorId,
    focusMessageRequest?.composeReply,
    focusMessageRequest?.nonce,
    focusMessageRequest?.workItemId,
    t,
  ]);

  useEffect(() => {
    if (!roomId || loadingHistory) return;
    if (!pageVisible) return;
    if (lastMarkedViewedKeyRef.current === latestVisibleMessageMarker) return;

    const timer = window.setTimeout(() => {
      lastMarkedViewedKeyRef.current = latestVisibleMessageMarker;
      markViewedMutation.mutate({ roomId });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    latestVisibleMessageMarker,
    loadingHistory,
    markViewedMutation,
    pageVisible,
    roomId,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-start gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
            {teamName ? getInitials(teamName) : "TR"}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold">
                {teamName ?? t("orchestrator.room.title")}
              </h2>
              <Badge
                variant="outline"
                className="border-sky-200 bg-sky-50 text-[11px] text-sky-700"
              >
                {roomLanguage === "th" ? "ไทย" : "English"}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              {roomId.slice(0, 8)}...
            </span>
          </div>
        </div>

        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          {/* Connection status */}
          {hasControllableRun && (
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                connected
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
              />
              {connected
                ? t("orchestrator.common.live")
                : t("orchestrator.common.disconnected")}
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
            <button
              onClick={onStartRun}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {t("orchestrator.common.startRun")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="border-b bg-slate-50/70 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px]">
                {roomType ?? t("orchestrator.room.title")}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {roomLanguage === "th" ? "ไทย" : "English"}
              </Badge>
              {roomAutonomy && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700"
                >
                  {roomAutonomy}
                </Badge>
              )}
              {runMode && (
                <Badge
                  variant="outline"
                  className="border-violet-200 bg-violet-50 text-[11px] text-violet-700"
                >
                  {runMode}
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
              {selectedSkillId && (
                <Badge
                  variant="outline"
                  className="border-sky-200 bg-sky-50 text-[11px] text-sky-700"
                  title={
                    routeReason
                      ? `Route reason: ${routeReason}`
                      : `Selected skill: ${selectedSkillId}`
                  }
                >
                  Skill: {selectedSkillId}
                </Badge>
              )}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border bg-white px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Room ID
                </div>
                <div className="mt-1 truncate text-sm font-medium text-slate-900">
                  {roomId}
                </div>
              </div>
              <div className="rounded-xl border bg-white px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Created
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {roomCreatedAt
                    ? new Date(roomCreatedAt).toLocaleString()
                    : "n/a"}
                </div>
              </div>
              <div className="rounded-xl border bg-white px-3 py-2 sm:col-span-2 xl:col-span-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Current objective
                </div>
                <div className="mt-1 line-clamp-2 text-sm font-medium text-slate-900">
                  {roomGoal ?? t("orchestrator.room.noActiveRunHelp")}
                </div>
              </div>
            </div>
          </div>
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

      <div className="shrink-0 border-b bg-slate-50/80 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={messageSearchQuery}
              onChange={event => setMessageSearchQuery(event.target.value)}
              placeholder={t("orchestrator.room.searchPlaceholder")}
              aria-label={t("orchestrator.room.searchPlaceholder")}
              className="h-9 border-slate-200 bg-white pl-9 text-sm"
              data-testid="team-room-search-input"
            />
          </div>
          {normalizedSearchQuery ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-[10px] text-sky-700">
                {t("orchestrator.room.searchResults", {
                  count: searchMatchCount,
                  total: searchTotalCount,
                })}
              </Badge>
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                onClick={() => setMessageSearchQuery("")}
                data-testid="team-room-search-clear"
              >
                {t("orchestrator.room.searchClear")}
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              {t("orchestrator.room.searchHint")}
            </div>
          )}
        </div>
        {normalizedSearchQuery && searchMatchCount === 0 && (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs text-rose-700">
            {t("orchestrator.room.searchEmpty")}
          </div>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleMessageListScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
        data-testid="team-room-message-list"
      >
        {loadingHistory && filteredEvents.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("orchestrator.room.loadingHistory")}
          </div>
        ) : visibleEvents.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
            <p className="text-sm font-medium">
              {normalizedSearchQuery
                ? t("orchestrator.room.searchEmpty")
                : hasControllableRun
                ? t("orchestrator.room.waitingForActivity")
                : t("orchestrator.room.noActiveRun")}
            </p>
            <p className="text-xs max-w-[300px] text-center">
              {normalizedSearchQuery
                ? t("orchestrator.room.searchEmptyHelp")
                : hasControllableRun
                ? t("orchestrator.room.waitingForActivityHelp")
                : t("orchestrator.room.noActiveRunHelp")}
            </p>
          </div>
        ) : (
          visibleEvents.map(event => {
            const colors =
              ACTOR_COLORS[event.actorType] ?? ACTOR_COLORS.assistant;
            const layout =
              conversationLayoutsByEventId.get(event.eventId) ??
              getConversationMessageLayout(
                event.actorType,
                event.actorType === "user" ? "right" : "left"
              );
            const avatarColor =
              event.actorType === "assistant"
                ? getAgentColor(event.actorId)
                : colors.avatar;
            const eventData = (event.data ?? {}) as Record<string, unknown>;
            const metadata = normalizeMessageMetadata(eventData.metadata);
            const messageContent =
              typeof eventData.content === "string"
                ? eventData.content
                : event.eventType;
            const summaryContent =
              typeof eventData.summaryContent === "string"
                ? eventData.summaryContent
                : null;
            const displayName =
              actorLabelById.get(event.actorId) ??
              (event.actorType === "assistant"
                ? event.actorId.slice(0, 12)
                : event.actorType === "system"
                  ? t("orchestrator.common.system")
                  : t("orchestrator.common.user"));
            const workItem: WorkItemSummary | null = metadata.workItemId
              ? (workItemById.get(metadata.workItemId) ?? null)
              : null;
            const replyTarget = metadata.replyToMessageId
              ? eventByMessageId.get(metadata.replyToMessageId)
              : null;
            const replyTargetContent =
              typeof replyTarget?.data?.content === "string"
                ? truncateInline(replyTarget.data.content)
                : null;
            const messageTypeLabel = formatMessageTypeLabel(
              metadata.messageType,
              t
            );
            const planReviewStatus =
              metadata.messageType === "plan_summary" &&
              typeof metadata.reviewStatus === "string"
                ? metadata.reviewStatus
                : null;
            const stepResult =
              metadata.messageType === "step_result"
                ? metadata.stepResult
                : null;
            const citationCount = Array.isArray(metadata.citationRefs)
              ? metadata.citationRefs.length
              : 0;
            const isThreadReply = Boolean(metadata.replyToMessageId);
            const isWorkLinked = Boolean(workItem);
            const runtimeSource =
              metadata.runtimeDisclosure?.source === "hybrid"
                ? "hybrid"
                : metadata.runtimeDisclosure?.source === "cloud"
                  ? "cloud"
                  : null;
            const messageId =
              typeof eventData.messageId === "string"
                ? eventData.messageId
                : null;
            const nextStep = getNextWorkflowStep(workItem?.status);
            const approverMemberId =
              workItem?.approverMemberId ?? coordinatorMemberId;
            const threadRootId =
              metadata.threadRootMessageId ??
              (metadata.workItemId ? messageId : null);
            const threadActivity = threadRootId
              ? latestThreadMessageIdByRoot.get(threadRootId)
              : null;
            const isLatestThreadUpdate = Boolean(
              messageId &&
              threadActivity &&
              threadActivity.count > 1 &&
              threadActivity.messageId === messageId
            );
            const isUnreadThreadUpdate = Boolean(
              isLatestThreadUpdate &&
              viewerLastViewedAtMs !== null &&
              threadActivity &&
              threadActivity.ts > viewerLastViewedAtMs
            );

            return (
              <div
                key={event.eventId}
                className={cn(
                  "flex items-start gap-3",
                  layout.rowClassName,
                  isThreadReply
                    ? layout.side === "right"
                      ? "pr-4"
                      : "pl-4"
                    : ""
                )}
                data-testid={
                  messageId ? `team-room-message-${messageId}` : undefined
                }
              >
                {/* Avatar */}
                <div
                  className={`h-8 w-8 shrink-0 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-bold`}
                >
                  {event.actorType === "system"
                    ? "SYS"
                    : getInitials(displayName)}
                </div>

                {/* Message bubble */}
                <div
                  ref={node => {
                    if (!messageId) return;
                    if (node) {
                      messageRefs.current.set(messageId, node);
                    } else {
                      messageRefs.current.delete(messageId);
                    }
                  }}
                  className={cn(
                    "max-w-[75%] rounded-2xl border px-4 py-2.5",
                    layout.bubbleClassName,
                    isThreadReply &&
                      (layout.side === "right"
                        ? "shadow-[inset_-3px_0_0_0_rgba(139,92,246,0.35)]"
                        : "shadow-[inset_3px_0_0_0_rgba(59,130,246,0.35)]"),
                    isWorkLinked && "ring-1 ring-blue-100",
                    highlightedMessageId === messageId &&
                      "ring-2 ring-blue-400 ring-offset-2"
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex items-center gap-2",
                      layout.headerClassName
                    )}
                  >
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
                  {(messageTypeLabel ||
                    workItem ||
                    citationCount > 0 ||
                    runtimeSource) && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {runtimeSource && (
                        <Badge
                          title={
                            runtimeSource === "hybrid"
                              ? "Local preprocessing or compaction was used before the cloud/team response."
                              : "This team-room turn used the existing cloud runtime path."
                          }
                          variant="outline"
                          className="text-[10px]"
                        >
                          {runtimeSource === "hybrid" ? "Hybrid" : "Cloud"}
                        </Badge>
                      )}
                      {metadata.runtimeMetadata?.selectedSkillId && (
                        <>
                          {getExecutionRouteBadge({
                            route: metadata.runtimeMetadata.route,
                            selectedSkillId:
                              metadata.runtimeMetadata.selectedSkillId,
                            routeReason: metadata.runtimeMetadata.routeReason,
                          }) && (
                            <Badge
                              variant="outline"
                              title={
                                getExecutionRouteBadge({
                                  route: metadata.runtimeMetadata.route,
                                  selectedSkillId:
                                    metadata.runtimeMetadata.selectedSkillId,
                                  routeReason:
                                    metadata.runtimeMetadata.routeReason,
                                })?.title
                              }
                              className={cn(
                                "text-[10px]",
                                getExecutionRouteBadge({
                                  route: metadata.runtimeMetadata.route,
                                  selectedSkillId:
                                    metadata.runtimeMetadata.selectedSkillId,
                                  routeReason:
                                    metadata.runtimeMetadata.routeReason,
                                })?.className
                              )}
                            >
                              {
                                getExecutionRouteBadge({
                                  route: metadata.runtimeMetadata.route,
                                  selectedSkillId:
                                    metadata.runtimeMetadata.selectedSkillId,
                                  routeReason:
                                    metadata.runtimeMetadata.routeReason,
                                })?.label
                              }
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className="border-sky-200 bg-sky-50 text-[10px] text-sky-700"
                            title={
                              metadata.runtimeMetadata.routeReason
                                ? `Route reason: ${metadata.runtimeMetadata.routeReason}`
                                : metadata.runtimeMetadata.route
                                  ? `Route: ${metadata.runtimeMetadata.route}`
                                  : undefined
                            }
                          >
                            Skill: {metadata.runtimeMetadata.selectedSkillId}
                          </Badge>
                          {metadata.runtimeMetadata.runtimeEngine && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                metadata.runtimeMetadata.runtimeEngine === "openai_agents"
                                  ? "border-violet-200 bg-violet-50 text-violet-700"
                                  : "border-slate-200 bg-slate-50 text-slate-700"
                              )}
                              title={
                                metadata.runtimeMetadata.runtimeMode
                                  ? `Runtime mode: ${metadata.runtimeMetadata.runtimeMode}`
                                  : undefined
                              }
                            >
                              {metadata.runtimeMetadata.runtimeEngine === "openai_agents"
                                ? "OpenAI Agents Python"
                                : metadata.runtimeMetadata.runtimeEngine}
                              {metadata.runtimeMetadata.runtimeMode
                                ? ` · ${metadata.runtimeMetadata.runtimeMode}`
                                : ""}
                            </Badge>
                          )}
                          {metadata.runtimeMetadata.runtimeStatus && (
                            <Badge
                              variant="outline"
                              className="border-violet-200 bg-violet-50 text-[10px] text-violet-700"
                              title={
                                metadata.runtimeMetadata.runtimeTraceId
                                  ? `Trace id: ${metadata.runtimeMetadata.runtimeTraceId}`
                                  : metadata.runtimeMetadata.runtimeSdkVersion ||
                                      metadata.runtimeMetadata.runtimeAdapterVersion
                                    ? `SDK/adapter: ${metadata.runtimeMetadata.runtimeSdkVersion ?? "n/a"} / ${metadata.runtimeMetadata.runtimeAdapterVersion ?? "n/a"}`
                                    : undefined
                              }
                            >
                              Runtime: {metadata.runtimeMetadata.runtimeStatus}
                            </Badge>
                          )}
                          {metadata.runtimeMetadata &&
                            metadata.runtimeMetadata.runtimeStatus && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedRuntimeMessageId(current =>
                                    current === event.eventId ? null : event.eventId
                                  )
                                }
                                className="rounded-full border border-violet-200 bg-white px-2 py-1 text-[10px] font-medium text-violet-800 transition-colors hover:bg-violet-100"
                                aria-expanded={
                                  expandedRuntimeMessageId === event.eventId
                                }
                                data-testid={`team-room-runtime-trail-toggle-${event.eventId}`}
                              >
                                {expandedRuntimeMessageId === event.eventId
                                  ? "Hide trail"
                                  : "View trail"}
                              </button>
                            )}
                        </>
                      )}
                      {metadata.runtimeMetadata &&
                        expandedRuntimeMessageId === event.eventId && (
                          <div className="w-full rounded-xl border border-violet-200 bg-white/90 p-3 text-[10px] text-violet-950 shadow-sm">
                            <div className="grid gap-2 md:grid-cols-2">
                              <div>
                                <div className="uppercase tracking-[0.2em] text-violet-600">
                                  Trace id
                                </div>
                                <div className="mt-1 break-all">
                                  {metadata.runtimeMetadata.runtimeTraceId ?? "n/a"}
                                </div>
                              </div>
                              <div>
                                <div className="uppercase tracking-[0.2em] text-violet-600">
                                  SDK / adapter
                                </div>
                                <div className="mt-1 break-all">
                                  {metadata.runtimeMetadata.runtimeSdkVersion ?? "n/a"} /{" "}
                                  {metadata.runtimeMetadata.runtimeAdapterVersion ?? "n/a"}
                                </div>
                              </div>
                              <div>
                                <div className="uppercase tracking-[0.2em] text-violet-600">
                                  Requested subagent
                                </div>
                                <div className="mt-1 break-all">
                                  {metadata.runtimeMetadata.requestedSubagent ?? "n/a"}
                                </div>
                              </div>
                              <div>
                                <div className="uppercase tracking-[0.2em] text-violet-600">
                                  Checkpoint
                                </div>
                                <div className="mt-1 break-all">
                                  {metadata.runtimeMetadata.runtimeCheckpointId ?? "n/a"}
                                  {metadata.runtimeMetadata.runtimeCheckpointStatus
                                    ? ` · ${metadata.runtimeMetadata.runtimeCheckpointStatus}`
                                    : ""}
                                </div>
                              </div>
                              <div className="md:col-span-2">
                                <div className="uppercase tracking-[0.2em] text-violet-600">
                                  Native bundle files
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {(metadata.runtimeMetadata.subagentTopology?.nativeBundleFiles ?? [])
                                    .length > 0 ? (
                                    metadata.runtimeMetadata.subagentTopology?.nativeBundleFiles?.map(file => (
                                      <Badge
                                        key={file}
                                        variant="outline"
                                        className="border-violet-200 bg-violet-50 text-[10px] text-violet-700"
                                      >
                                        {file}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-violet-700">
                                      {metadata.runtimeMetadata.subagentTopology
                                        ? "n/a"
                                        : "No subagent topology"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      {metadata.runtimeMetadata?.subagentTopology && (
                        <div className="w-full rounded-xl border border-violet-200 bg-violet-50/70 p-3 text-[10px] text-violet-900">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="border-violet-200 bg-white text-[10px] text-violet-700">
                                {metadata.runtimeMetadata.subagentTopology.bundleTopology === "subagent-aware"
                                  ? "Subagent-aware"
                                  : "Single-agent"}
                              </Badge>
                              <Badge variant="outline" className="border-violet-200 bg-white text-[10px] text-violet-700">
                                {metadata.runtimeMetadata.subagentTopology.nativeBundleReady
                                  ? "Native bundle ready"
                                  : "Native bundle detected"}
                              </Badge>
                              {typeof metadata.runtimeMetadata.subagentTopology.specialistAgentCount === "number" && (
                                <Badge variant="outline" className="border-violet-200 bg-white text-[10px] text-violet-700">
                                  {metadata.runtimeMetadata.subagentTopology.specialistAgentCount} specialists
                                </Badge>
                              )}
                              {metadata.runtimeMetadata.requestedSubagent && (
                                <Badge variant="outline" className="border-violet-200 bg-white text-[10px] text-violet-700">
                                  Requested: {metadata.runtimeMetadata.requestedSubagent}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-1 md:grid-cols-2">
                            <div>
                              Bundle path: {metadata.runtimeMetadata.subagentTopology.nativeBundlePath ?? "n/a"}
                            </div>
                            <div>
                              Checkpoint: {metadata.runtimeMetadata.runtimeCheckpointId ?? "n/a"}
                              {metadata.runtimeMetadata.runtimeCheckpointStatus
                                ? ` · ${metadata.runtimeMetadata.runtimeCheckpointStatus}`
                                : ""}
                            </div>
                            <div className="md:col-span-2">
                              Resume cursor: {metadata.runtimeMetadata.runtimeResumeCursor ?? "n/a"}
                            </div>
                            <div className="md:col-span-2">
                              Artifact refs: {(metadata.runtimeMetadata.runtimeArtifactRefs ?? []).join(", ") || "n/a"}
                            </div>
                          </div>
                        </div>
                      )}
                      {messageTypeLabel && (
                        <Badge variant="outline" className="text-[10px]">
                          {messageTypeLabel}
                        </Badge>
                      )}
                      {planReviewStatus && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            planReviewStatus === "passed"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : planReviewStatus === "failed"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                          )}
                        >
                          {planReviewStatus === "passed"
                            ? roomLanguage === "th"
                              ? "ตรวจผ่าน"
                              : "Review passed"
                            : planReviewStatus === "failed"
                              ? roomLanguage === "th"
                                ? "ตรวจไม่ผ่าน"
                                : "Review failed"
                              : roomLanguage === "th"
                                ? "รอตรวจ"
                                : "Review pending"}
                        </Badge>
                      )}
                      {workItem && (
                        <Badge
                          variant="secondary"
                          className="max-w-full text-[10px]"
                        >
                          {truncateInline(workItem.title, 48)}
                          {workItem.status
                            ? ` · ${t(`orchestrator.workflow.status.${workItem.status}`)}`
                            : ""}
                        </Badge>
                      )}
                      {citationCount > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {t("orchestrator.room.sourcesCount", {
                            count: citationCount,
                          })}
                        </Badge>
                      )}
                      {isLatestThreadUpdate && (
                        <Badge
                          className={cn(
                            "border text-[10px]",
                            isUnreadThreadUpdate
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-slate-200 bg-slate-50 text-slate-700"
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
                      <span className="font-medium text-foreground/80">
                        {t("orchestrator.room.replyingTo")}
                      </span>
                      <div className="mt-1">{replyTargetContent}</div>
                    </div>
                  )}
                  {metadata.messageType === "plan_summary" && (
                    <PlanReviewCard
                      roomLanguage={roomLanguage}
                      metadata={metadata}
                      messageId={messageId ?? event.eventId}
                    />
                  )}
                  {stepResult ? (
                    <StepResultCard
                      roomLanguage={roomLanguage}
                      metadata={stepResult}
                      content={messageContent}
                      messageId={messageId ?? event.eventId}
                    />
                  ) : (
                    <ExpandableMessageText
                      messageId={messageId ?? event.eventId}
                      roomLanguage={roomLanguage}
                      fullText={messageContent}
                      previewText={summaryContent}
                      contentClassName="text-sm leading-6 text-slate-800"
                    />
                  )}
                  {metadata.threadRootMessageId &&
                    metadata.threadRootMessageId !==
                      metadata.replyToMessageId && (
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        {t("orchestrator.room.threadLabel")}:{" "}
                        {metadata.threadRootMessageId.slice(0, 8)}...
                      </div>
                    )}
                  {(messageId ||
                    (workItem &&
                      (nextStep ||
                        workItem.status === "awaiting_approval"))) && (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {!workItem &&
                        messageId &&
                        typeof eventData.content === "string" && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            onClick={() =>
                              void handlePromoteToWorkItem(
                                event,
                                messageId,
                                eventData.content as string
                              )
                            }
                            disabled={
                              createWorkItemMutation.isPending ||
                              advanceWorkflowMutation.isPending
                            }
                          >
                            <PlusSquare className="h-3.5 w-3.5" />
                            {t("orchestrator.room.action.promoteToWorkItem")}
                          </button>
                        )}
                      {workItem && nextStep && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                          onClick={() =>
                            void handleAdvanceWorkItem(
                              workItem,
                              nextStep,
                              messageId ?? undefined
                            )
                          }
                          disabled={advanceWorkflowMutation.isPending}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          {getNextWorkflowStepLabel(nextStep, t)}
                        </button>
                      )}
                      {workItem?.status === "awaiting_approval" &&
                        approverMemberId && (
                          <>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                              onClick={() =>
                                void handleApproveWorkItem(
                                  workItem,
                                  approverMemberId,
                                  messageId ?? undefined
                                )
                              }
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t("orchestrator.common.approve")}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-50"
                              onClick={() =>
                                void handleRejectWorkItem(
                                  workItem,
                                  approverMemberId,
                                  messageId ?? undefined
                                )
                              }
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
                              threadRootMessageId:
                                metadata.threadRootMessageId ?? messageId,
                              workItemId: metadata.workItemId ?? null,
                              actorLabel: displayName,
                              preview: truncateInline(
                                typeof eventData.content === "string"
                                  ? eventData.content
                                  : event.eventType,
                                140
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
                  {t("orchestrator.room.replyingToActor", {
                    name: replyTarget.actorLabel,
                  })}
                </div>
                <div className="mt-1 truncate text-blue-900/80">
                  {replyTarget.preview}
                </div>
                {replyTarget.workItemId && (
                  <div className="mt-1 text-[10px] text-blue-900/70">
                    {t("orchestrator.room.linkedWorkItem")}:{" "}
                    {replyTarget.workItemId.slice(0, 8)}...
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
              {activeReplyWorkItem?.status === "awaiting_approval" &&
                activeReplyApproverMemberId && (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-900 transition-colors hover:bg-emerald-200"
                      onClick={() => void handleQuickApproveAndPost()}
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                    >
                      {t("orchestrator.room.action.approveAndPost")}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100"
                      onClick={() => void handleQuickRejectAndPost()}
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                    >
                      {t("orchestrator.room.action.requestChangesAndPost")}
                    </button>
                  </>
                )}
              {quickReplyTemplates.map(template => (
                <button
                  key={template.label}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    getQuickReplyTemplateClasses(template.tone)
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
            onChange={e => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              replyTarget
                ? t("orchestrator.room.replyPlaceholder")
                : t("orchestrator.room.messagePlaceholder")
            }
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
