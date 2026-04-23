export const AUTO_TEAM_ROUTE_CLASSES = [
  "media.video",
  "media.image",
  "agency.swarm",
  "workflow.automation",
  "research.synthesis",
  "document.writing",
  "unknown.blocked",
] as const;

export const AUTO_TEAM_CAPABILITY_FAMILIES = [
  "media.video",
  "media.image",
  "video.prompt",
  "image.prompt",
  "research.synthesis",
  "document.writing",
  "writing.review",
  "agency.swarm",
  "workflow.automation",
] as const;

export const AUTO_TEAM_STAGE_TYPES = [
  "route",
  "plan",
  "research",
  "storyboard",
  "prompt",
  "media_submit",
  "media_poll",
  "agency_delegate",
  "review",
  "repair",
  "human_approval",
  "finalize",
] as const;

export const AUTO_TEAM_STAGE_STATUSES = [
  "queued",
  "in_progress",
  "waiting_provider",
  "waiting_human",
  "reviewing",
  "completed",
  "needs_revision",
  "blocked",
  "failed",
  "cancelled",
  "superseded",
] as const;

export const AUTO_TEAM_FINAL_RESULT_STATUSES = [
  "completed",
  "failed",
  "cancelled",
  "legacy_unverified",
] as const;

export const AUTO_TEAM_MEDIA_TYPES = ["image", "video"] as const;

export type AutoTeamRouteClass = (typeof AUTO_TEAM_ROUTE_CLASSES)[number];
export type AutoTeamCapabilityFamily =
  (typeof AUTO_TEAM_CAPABILITY_FAMILIES)[number];
export type AutoTeamStageType = (typeof AUTO_TEAM_STAGE_TYPES)[number];
export type AutoTeamStageStatus = (typeof AUTO_TEAM_STAGE_STATUSES)[number];
export type AutoTeamFinalResultStatus =
  (typeof AUTO_TEAM_FINAL_RESULT_STATUSES)[number];
export type AutoTeamMediaType = (typeof AUTO_TEAM_MEDIA_TYPES)[number];

export interface AutoTeamRequiredEvidence {
  requiresMediaJob: boolean;
  requiresPromptArtifact: boolean;
  requiresReview: boolean;
  requiresHumanApproval: boolean;
  requiresAgencyHandle: boolean;
  requiresFinalArtifact: boolean;
  promptOnlyInsufficient: boolean;
  requiredArtifactTypes: AutoTeamArtifactType[];
}

export interface AutoTeamStageTimeoutPolicy {
  stageType: AutoTeamStageType;
  timeoutMs: number;
  retryable: boolean;
  escalatesToHuman: boolean;
  blockedReason?: string | null;
}

export interface AutoTeamProviderDecision {
  requestedProvider: string | null;
  requestedModel: string | null;
  selectedProvider: string | null;
  selectedModel: string | null;
  selectedReason: string | null;
  substituted: boolean;
  blockedReason: string | null;
}

export interface AutoTeamBudgetDecision {
  allowed: boolean;
  creditsNeeded: number;
  creditsReserved: number;
  budgetKey: string | null;
  blockedReason: string | null;
}

export interface AutoTeamAccessDecision {
  allowed: boolean;
  scope: "tenant" | "team" | "room" | "run" | "review" | "artifact";
  blockedReason: string | null;
  redactedReason: string | null;
}

export type AutoTeamArtifactType =
  | "research_summary"
  | "storyboard"
  | "media_prompt"
  | "media_result"
  | "review_note"
  | "final_result"
  | "repair_note"
  | "trace_log";

export interface AutoTeamArtifactRef {
  id?: string;
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string | null;
  stageId: string | null;
  workItemId: string | null;
  artifactType: AutoTeamArtifactType;
  artifactRole:
    | "prompt"
    | "evidence"
    | "result"
    | "review"
    | "repair"
    | "trace"
    | "summary";
  storageRef: string | null;
  externalRef: string | null;
  contentHash: string | null;
  visibility: "private" | "tenant" | "room" | "team" | "public";
  retentionPolicyJson: Record<string, unknown> | null;
  safetyStatus:
    | "safe"
    | "needs_review"
    | "blocked"
    | "redacted"
    | "unknown";
  source: string | null;
  createdAt?: string | Date;
}

export interface AutoTeamRouteDecision {
  id?: string;
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string | null;
  workRequestId: string | null;
  workCaseId: string | null;
  routeClass: AutoTeamRouteClass;
  routeConfidence: number | null;
  allowedCapabilityFamiliesJson: AutoTeamCapabilityFamily[];
  selectedPolicyJson: Record<string, unknown> | null;
  selectedOrchestratorPersonaId: string | null;
  language: "en" | "th";
  decisionReason: string | null;
  source: string;
  blockedReason: string | null;
  idempotencyKey: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AutoTeamExecutionStage {
  id?: string;
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string;
  routeDecisionId: string | null;
  workItemId: string | null;
  planStepKey: string;
  stageType: AutoTeamStageType;
  status: AutoTeamStageStatus;
  assignedPersonaId: string | null;
  expectedCapabilityFamily: AutoTeamCapabilityFamily | null;
  selectedSkillId: string | null;
  selectedProvider: string | null;
  inputArtifactRefsJson: string[];
  outputArtifactRefsJson: string[];
  jobRefIdsJson: string[];
  attempt: number;
  maxAttempts: number;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  deadlineAt: string | Date | null;
  blockedReason: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string;
  metadataJson: Record<string, unknown> | null;
  claimToken?: string | null;
  claimExpiresAt?: string | Date | null;
  claimedBy?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AutoTeamMediaJobRef {
  id?: string;
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string;
  stageId: string | null;
  workItemId: string | null;
  mediaType: AutoTeamMediaType;
  provider: string;
  model: string;
  providerTaskId: string | null;
  providerStatus: string;
  submittedPromptArtifactRef: string | null;
  resultArtifactRefsJson: string[];
  providerRequestHash: string | null;
  idempotencyKey: string;
  lastPolledAt: string | Date | null;
  completedAt: string | Date | null;
  failedAt: string | Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadataJson: Record<string, unknown> | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AutoTeamReviewRecord {
  id?: string;
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string;
  stageId: string | null;
  workItemId: string | null;
  reviewerPersonaId: string | null;
  reviewType: string;
  score: number;
  passThreshold: number;
  passed: boolean;
  reviewedArtifactRefsJson: string[];
  reviewedJobRefIdsJson: string[];
  comments: string | null;
  repairInstructions: string | null;
  idempotencyKey: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AutoTeamFinalResult {
  id?: string;
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string;
  routeDecisionId: string | null;
  status: AutoTeamFinalResultStatus;
  finalArtifactRefsJson: string[];
  mediaJobRefIdsJson: string[];
  reviewRecordRefIdsJson: string[];
  humanApprovalStatus: "pending" | "approved" | "rejected" | "not_required";
  summary: string | null;
  failureReason: string | null;
  blockedReason: string | null;
  idempotencyKey: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AutoTeamTraceEvent {
  id?: string;
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string;
  stageId: string | null;
  workItemId: string | null;
  traceEventId: string;
  sequence: number;
  eventName: string;
  sourceComponent: string;
  severity: "debug" | "info" | "warn" | "error";
  summary: string | null;
  redactedMetadataJson: Record<string, unknown> | null;
  idempotencyKey: string;
  createdAt?: string | Date;
}

export interface AutoTeamRunSnapshot {
  tenantId: string;
  teamId: string | null;
  roomId: string | null;
  runId: string;
  routeDecision: AutoTeamRouteDecision | null;
  currentStage: AutoTeamExecutionStage | null;
  stages: AutoTeamExecutionStage[];
  mediaJobs: AutoTeamMediaJobRef[];
  reviews: AutoTeamReviewRecord[];
  finalResult: AutoTeamFinalResult | null;
  traceEvents: AutoTeamTraceEvent[];
  updatedAt: string;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getRequiredEvidenceForRoute(
  routeClass: AutoTeamRouteClass,
): AutoTeamRequiredEvidence {
  switch (routeClass) {
    case "media.video":
    case "media.image":
      return {
        requiresMediaJob: true,
        requiresPromptArtifact: true,
        requiresReview: true,
        requiresHumanApproval: routeClass === "media.video",
        requiresAgencyHandle: false,
        requiresFinalArtifact: true,
        promptOnlyInsufficient: true,
        requiredArtifactTypes:
          routeClass === "media.video"
            ? ["research_summary", "storyboard", "media_prompt", "media_result"]
            : ["media_prompt", "media_result"],
      };
    case "agency.swarm":
      return {
        requiresMediaJob: false,
        requiresPromptArtifact: false,
        requiresReview: true,
        requiresHumanApproval: true,
        requiresAgencyHandle: true,
        requiresFinalArtifact: true,
        promptOnlyInsufficient: false,
        requiredArtifactTypes: ["research_summary", "review_note", "final_result"],
      };
    case "workflow.automation":
      return {
        requiresMediaJob: false,
        requiresPromptArtifact: false,
        requiresReview: true,
        requiresHumanApproval: false,
        requiresAgencyHandle: false,
        requiresFinalArtifact: true,
        promptOnlyInsufficient: false,
        requiredArtifactTypes: ["review_note", "final_result"],
      };
    case "research.synthesis":
      return {
        requiresMediaJob: false,
        requiresPromptArtifact: false,
        requiresReview: true,
        requiresHumanApproval: false,
        requiresAgencyHandle: false,
        requiresFinalArtifact: true,
        promptOnlyInsufficient: false,
        requiredArtifactTypes: ["research_summary", "review_note", "final_result"],
      };
    case "document.writing":
      return {
        requiresMediaJob: false,
        requiresPromptArtifact: false,
        requiresReview: true,
        requiresHumanApproval: false,
        requiresAgencyHandle: false,
        requiresFinalArtifact: true,
        promptOnlyInsufficient: false,
        requiredArtifactTypes: ["review_note", "final_result"],
      };
    case "unknown.blocked":
    default:
      return {
        requiresMediaJob: false,
        requiresPromptArtifact: false,
        requiresReview: false,
        requiresHumanApproval: false,
        requiresAgencyHandle: false,
        requiresFinalArtifact: false,
        promptOnlyInsufficient: false,
        requiredArtifactTypes: [],
      };
  }
}

export function routeRequiresMediaJob(routeClass: AutoTeamRouteClass): boolean {
  return routeClass === "media.video" || routeClass === "media.image";
}

export function routeAllowsCapability(
  routeClass: AutoTeamRouteClass,
  capabilityFamily: AutoTeamCapabilityFamily,
): boolean {
  const allowed = getAllowedCapabilityFamilies(routeClass);
  return allowed.includes(capabilityFamily);
}

export function getAllowedCapabilityFamilies(
  routeClass: AutoTeamRouteClass,
): AutoTeamCapabilityFamily[] {
  switch (routeClass) {
    case "media.video":
      return ["video.prompt", "research.synthesis", "writing.review", "media.video"];
    case "media.image":
      return ["image.prompt", "research.synthesis", "writing.review", "media.image"];
    case "agency.swarm":
      return ["agency.swarm", "research.synthesis", "writing.review"];
    case "workflow.automation":
      return ["workflow.automation", "document.writing", "research.synthesis", "writing.review"];
    case "research.synthesis":
      return ["research.synthesis", "writing.review"];
    case "document.writing":
      return ["document.writing", "research.synthesis", "writing.review"];
    case "unknown.blocked":
    default:
      return [];
  }
}

export function isTerminalStageStatus(status: AutoTeamStageStatus): boolean {
  return [
    "completed",
    "needs_revision",
    "blocked",
    "failed",
    "cancelled",
    "superseded",
  ].includes(status);
}

export function isTerminalMediaStatus(status: string): boolean {
  const normalized = normalizeString(status).toLowerCase();
  return ["succeeded", "failed", "cancelled", "expired"].includes(normalized);
}

export function isFinalResultTerminal(status: AutoTeamFinalResultStatus): boolean {
  return [
    "completed",
    "failed",
    "cancelled",
    "legacy_unverified",
  ].includes(status);
}

export function validateArtifactRef(
  ref: Partial<AutoTeamArtifactRef> | null | undefined,
): ref is AutoTeamArtifactRef {
  if (!ref) return false;
  if (!normalizeString(ref.tenantId)) return false;
  if (!normalizeString(ref.artifactType)) return false;
  if (!normalizeString(ref.artifactRole)) return false;
  if (!normalizeString(ref.visibility)) return false;
  if (!normalizeString(ref.safetyStatus)) return false;
  if (!normalizeString(ref.storageRef) && !normalizeString(ref.externalRef)) {
    return false;
  }
  if (ref.retentionPolicyJson !== null && ref.retentionPolicyJson !== undefined) {
    if (typeof ref.retentionPolicyJson !== "object") return false;
  }
  return true;
}

export function assertCanonicalArtifactRef(
  ref: Partial<AutoTeamArtifactRef> | null | undefined,
): AutoTeamArtifactRef {
  if (!validateArtifactRef(ref)) {
    throw new Error("Invalid canonical auto-team artifact ref");
  }
  return ref;
}

