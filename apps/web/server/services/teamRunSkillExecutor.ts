import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { calculateCreditsForLLMDynamic } from "./creditService";
import {
  detectProviderFamily,
  buildWebSearchParams,
} from "./webSearchToolInjector";
import { getProviderForModel } from "./llmRouter";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { classifyIntent } from "./skillIntentClassifier";
import { routeRoomIntent } from "./roomIntentRouter";
import { agencyBridge } from "./agencyBridge";
import { buildAgencyTaskMetadata } from "./agencyEscalation";
import { getTeam } from "./teamService";
import { executeUnified } from "./unifiedOrchestrator";
import {
  getAutoTeamStoryboardAssetState,
  getAutoTeamStoryboardImageUrls,
  registerAutoTeamMediaArtifact,
  resolveAutoTeamClipPlan,
} from "./autoTeamMediaCompletionService";
import { estimateAutoTeamMediaPipelineCredits } from "./autoTeamBudgetService";
import { getApprovedPlanForRun } from "./teamExecutionPlanService";
import { parseNextSpeakerHint } from "./executors/textSkillExecutor";
import { normalizeMediaPrompt } from "./mediaPromptNormalization";
import { executeTeamRuntimeTurn } from "./agentRuntime/teamRuntimeOrchestrator";
import { buildNativeSkillRuntimePlanContext } from "./agentRuntime/skillRuntimeOrchestrator";
import { parsePromptResponse } from "./promptEnhancementService";
import {
  buildTeamExecutionContextPack,
  summarizeContextPack,
  type ContextPack,
} from "./contextEngineAdapter";
import { recordContextEngineMetric } from "./monitoringService";
import type {
  MediaJobResult,
  UnifiedExecutionRequest,
  UnifiedExecutionResult,
} from "./executors/types";
import { getDb } from "../db";
import {
  agencies,
  agencyPermissions,
  groupMembers,
  userGroups,
  type TeamRun,
} from "../../drizzle/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import type { SkillDefinition } from "@smartspec/skills";
import type { RuntimeDispatchPolicy } from "../../shared/workOrchestrator";

export interface TeamRunSkillExecutionInput {
  run: TeamRun;
  tenantId: string;
  userId: number;
  assistantId: string;
  assistantContext: {
    profile: {
      preferredModelId?: string | null;
      displayName?: string | null;
      roleTitle?: string | null;
    };
    agentModel?: string | null;
    personaContext?: string | null;
  };
  roomId: string;
  teamId: string;
  objective: string;
  dynamicParams?: Record<string, unknown>;
  route: {
    route: "chat" | "skill" | "agency" | "hybrid";
    reason: string;
    selectedSkillId?: string;
    selectedAgencyId?: string;
    selectedCapabilityId?: string;
    capabilityGapResolution?: Record<string, unknown>;
  };
}

export interface TeamRunSkillExecutionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costCredits: number;
  metadata: Record<string, unknown>;
  skillId: string;
  nextSpeakerHint?: string;
}

const GENERAL_FALLBACK_SKILL_ID = "general-article-writer";
const TEAM_ORCHESTRATOR_SKILL_ID = "skill-orchestrator";
const TEAM_AGENCY_SWARM_ID = "agency-swarm";
const PROMPT_SKILL_MEDIA_EXECUTION_MODES = new Set([
  "enhance-prompt",
  "llm-only",
]);
const TEAM_SYSTEM_PROMPT_MAX_CHARS = 12_000;
const AUTO_TEAM_VIDEO_SKILL_IDS = [
  "video-prompt-engineer",
  "video-storyboard-to-prompts",
  "cinematic-video-createprompt",
] as const;
const AUTO_TEAM_IMAGE_SKILL_IDS = [
  "image_prompt_engineer",
  "smart-landscape-designer",
] as const;

export function evaluateAutoTeamMediaChainBudgetPreflight(input: {
  maxBudgetCredits?: number | null;
  totalCreditsUsed?: number | null;
  promptCredits?: number | null;
  mediaType: "image" | "video";
  clipCount?: number | null;
}): {
  allowed: boolean;
  creditsNeeded: number;
  projectedCredits: number;
  maxBudgetCredits: number | null;
  blockedReason: string | null;
} {
  const creditsNeeded = estimateAutoTeamMediaPipelineCredits({
    mediaType: input.mediaType,
    clipCount: input.clipCount,
    includeComposition: input.mediaType === "video",
    includeProbe: input.mediaType === "video",
    includeFinalReview: input.mediaType === "video",
  });
  const totalCreditsUsed =
    typeof input.totalCreditsUsed === "number" && Number.isFinite(input.totalCreditsUsed)
      ? Math.max(0, input.totalCreditsUsed)
      : 0;
  const promptCredits =
    typeof input.promptCredits === "number" && Number.isFinite(input.promptCredits)
      ? Math.max(0, input.promptCredits)
      : 0;
  const maxBudgetCredits =
    typeof input.maxBudgetCredits === "number" && Number.isFinite(input.maxBudgetCredits)
      ? Math.max(0, input.maxBudgetCredits)
      : null;
  const projectedCredits = totalCreditsUsed + promptCredits + creditsNeeded;
  if (maxBudgetCredits != null && projectedCredits > maxBudgetCredits) {
    return {
      allowed: false,
      creditsNeeded,
      projectedCredits,
      maxBudgetCredits,
      blockedReason: "budget_cap_exceeded",
    };
  }
  return {
    allowed: true,
    creditsNeeded,
    projectedCredits,
    maxBudgetCredits,
    blockedReason: null,
  };
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    ? (value as Record<string, unknown>)
    : null;
}

function getRunTotalCreditsUsed(run: TeamRun): number {
  const snapshot = getRecord(run.budgetSnapshotJson);
  const value = snapshot?.totalCreditsUsed;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function getApprovedRunBudgetMaxCredits(run: TeamRun): number | null {
  const snapshot = getApprovedPlanForRun({
    constraintsJson: getRecord(run.constraintsJson),
    approvalPolicyJson: getRecord(run.approvalPolicyJson),
  });
  const value = snapshot?.budget.maxBudgetCredits;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const RESERVED_CAPABILITY_IDS = new Set([
  "skill",
  "agency",
  "browser",
  "document_management",
  "media_studio",
  "video_editor",
  "manual",
  "work_os",
  "workflow",
  "skill_studio",
]);
const SKILL_CREATOR_FALLBACK_SKILL_IDS = [
  "intelligence-skill-creator",
  "skill-creator",
] as const;

type ParsedCapabilityId = {
  kind:
    | "skill"
    | "agency"
    | "workflow"
    | "media_model"
    | "context_pack"
    | "skill_studio"
    | "surface";
  id: string;
  originalId: string;
};

function parseSelectedCapabilityId(
  capabilityId?: string | null
): ParsedCapabilityId | null {
  const originalId = capabilityId?.trim();
  if (!originalId) return null;

  const separatorIndex = originalId.indexOf(":");
  if (separatorIndex > 0) {
    const prefix = originalId.slice(0, separatorIndex);
    const id = originalId.slice(separatorIndex + 1).trim();
    if (!id) return null;
    if (
      prefix === "skill" ||
      prefix === "agency" ||
      prefix === "workflow" ||
      prefix === "media_model" ||
      prefix === "context_pack" ||
      prefix === "skill_studio"
    ) {
      return { kind: prefix, id, originalId };
    }
    if (RESERVED_CAPABILITY_IDS.has(prefix)) {
      return { kind: "surface", id: prefix, originalId };
    }
  }

  if (RESERVED_CAPABILITY_IDS.has(originalId)) {
    return { kind: "surface", id: originalId, originalId };
  }

  return { kind: "skill", id: originalId, originalId };
}

function summarizeNativeBundleTopology(skill: SkillDefinition): Record<string, unknown> | null {
  const skillRecord = skill as {
    nativeBundleReady?: unknown;
    nativeBundleFiles?: unknown;
    nativeBundlePath?: unknown;
  };
  const nativeBundleReady = Boolean(skillRecord.nativeBundleReady);
  const nativeBundleFiles = Array.isArray(skillRecord.nativeBundleFiles)
    ? (skillRecord.nativeBundleFiles as string[])
    : [];
  const nativeBundlePath =
    typeof skillRecord.nativeBundlePath === "string"
      ? skillRecord.nativeBundlePath
      : null;
  const specialistFiles = nativeBundleFiles.filter(
    file => file.startsWith("agents/specialists/") && file.endsWith(".md"),
  );
  const hasSubagentTopology =
    nativeBundleFiles.includes("subagents.json") ||
    nativeBundleFiles.includes("agents/orchestrator.md") ||
    specialistFiles.length > 0;

  if (!nativeBundleReady && !hasSubagentTopology) {
    return null;
  }

  return {
    nativeBundleReady,
    nativeBundlePath,
    bundleTopology: hasSubagentTopology ? "subagent-aware" : "single-agent",
    nativeBundleFiles,
    specialistAgentCount: specialistFiles.length,
  };
}

function buildTeamSessionState(input: {
  runId: string;
  teamId: string;
  roomId: string;
  assistantId: string;
  objective: string;
}) {
  return {
    title: "Session state",
    content: [
      `Run: ${input.runId}`,
      `Team: ${input.teamId}`,
      `Room: ${input.roomId}`,
      `Assistant: ${input.assistantId}`,
      `Objective: ${input.objective}`,
    ].join("\n"),
    source: `team_run:${input.runId}`,
    trust: "trusted" as const,
    freshness: "fresh" as const,
  };
}

async function resolveTeamRunSkill(
  selectedSkillId?: string
): Promise<SkillDefinition> {
  if (selectedSkillId) {
    const selected = await getSkillByIdAsync(selectedSkillId);
    if (selected) {
      return selected;
    }
  }

  const fallback = await getSkillByIdAsync(GENERAL_FALLBACK_SKILL_ID);
  if (fallback) {
    return fallback;
  }

  throw new Error(
    `No skill resolved for team run: tried ${selectedSkillId ?? "(none)"} and fallback ${GENERAL_FALLBACK_SKILL_ID}`
  );
}

async function executeAgencySwarmTurn(
  input: TeamRunSkillExecutionInput,
  routeReason: string
): Promise<TeamRunSkillExecutionResult> {
  const team = await getTeam(input.teamId, input.tenantId);
  const agencyId = input.route.selectedAgencyId ?? team?.agencyId ?? null;
  if (!agencyId) {
    throw new Error(`Team ${input.teamId} has no agency mapping`);
  }
  await assertAgencyCapabilityAuthorized({
    agencyId,
    tenantId: input.tenantId,
    userId: input.userId,
    teamAgencyId: team?.agencyId ?? null,
  });

  const plannerResult = await runPlanner({
    sourceType: "team_room",
    userId: input.userId,
    tenantId: input.tenantId,
    conversationModel:
      input.assistantContext.profile.preferredModelId ??
      input.assistantContext.agentModel ??
      undefined,
    skillSlug: TEAM_AGENCY_SWARM_ID,
    isAgencyEscalation: true,
  }).catch(() => null);

  const taskMetadata = plannerResult
    ? buildAgencyTaskMetadata({
        taskRunId: plannerResult.taskRunId,
        plan: plannerResult.plan,
        routeReason,
      })
    : undefined;

  const agencyResult = await agencyBridge.executeRun({
    agencyId,
    conversationId: `${input.run.id}:${input.roomId}`,
    message: input.objective,
    userToken: "",
    tenantId: input.tenantId,
    userId: input.userId,
    taskMetadata,
    additionalInstructions: input.assistantContext.personaContext ?? undefined,
  });

  if (plannerResult) {
    recordStepAttempt({
      taskRunId: plannerResult.taskRunId,
      plan: plannerResult.plan,
      model: plannerResult.resolvedModel ?? "agency",
      inputTokens: 0,
      outputTokens: 0,
      creditsUsed: agencyResult.creditsUsed,
      snapshot: plannerResult.snapshot,
    }).catch(() => {});
  }

  const summary =
    agencyResult.response?.trim() ||
    agencyResult.structuredResult?.summary?.trim() ||
    `Agency swarm completed for ${input.objective.trim() || "the current task"}.`;

  return {
    content: summary,
    inputTokens: 0,
    outputTokens: 0,
    costCredits: agencyResult.creditsUsed,
    metadata: {
      route: "agency",
      routeReason,
      selectedSkillId: TEAM_AGENCY_SWARM_ID,
      agencyId,
      selectedCapabilityId: input.route.selectedCapabilityId ?? null,
      capabilityGapResolution: input.route.capabilityGapResolution ?? null,
      agencyRunId: agencyResult.runId,
      agencyStatus: agencyResult.status ?? null,
      hybridSummary: agencyResult.hybridSummary,
      structuredResult: agencyResult.structuredResult,
      previewArtifacts: agencyResult.previewArtifacts,
      nextSpeakerHint: null,
      llmModelId: "agency",
    },
    skillId: TEAM_AGENCY_SWARM_ID,
  };
}

async function assertAgencyCapabilityAuthorized(input: {
  agencyId: string;
  tenantId: string;
  userId: number;
  teamAgencyId: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Cannot authorize selected agency: database unavailable");
  }

  const [agency] = await db
    .select({
      id: agencies.id,
      tenantId: agencies.tenantId,
      status: agencies.status,
      isPublished: agencies.isPublished,
      visibility: agencies.visibility,
      createdBy: agencies.createdBy,
    })
    .from(agencies)
    .where(
      and(
        eq(agencies.id, input.agencyId),
        eq(agencies.tenantId, input.tenantId),
      ),
    )
    .limit(1);

  if (!agency) {
    throw new Error(
      `Selected agency ${input.agencyId} is not available for this tenant`,
    );
  }
  const agencyStatus = String(agency.status ?? "").toLowerCase();
  const agencyVisibility = String(agency.visibility ?? "").toLowerCase();
  const isTeamMappedAgency = agency.id === input.teamAgencyId;
  const isRunnableStatus =
    ((agencyStatus === "published" || agencyStatus === "approved") &&
      agency.isPublished === true) ||
    (isTeamMappedAgency &&
      (agencyStatus === "active" ||
        agencyStatus === "published" ||
        agencyStatus === "approved"));
  if (!isRunnableStatus) {
    if (isTeamMappedAgency) {
      throw new Error(
        `Team agency ${input.agencyId} is not runnable for automation and should fall back to skill execution`,
      );
    }
    throw new Error(
      `Selected agency ${input.agencyId} is not published for automation`,
    );
  }
  const runnableVisibilities = new Set(["private", "shared", "public"]);
  if (!runnableVisibilities.has(agencyVisibility)) {
    throw new Error(
      `Selected agency ${input.agencyId} visibility '${agencyVisibility || "unknown"}' is not runnable for automation`,
    );
  }
  if (
    agencyVisibility === "private" &&
    agency.createdBy !== input.userId &&
    agency.id !== input.teamAgencyId
  ) {
    throw new Error(
      `Selected agency ${input.agencyId} is private and not available to this requester`,
    );
  }
  if (agencyVisibility === "shared" && agency.id !== input.teamAgencyId) {
    const [sharedPermission] = await db
      .select({ id: agencyPermissions.id })
      .from(agencyPermissions)
      .innerJoin(
        groupMembers,
        eq(groupMembers.groupId, agencyPermissions.groupId),
      )
      .innerJoin(userGroups, eq(userGroups.id, agencyPermissions.groupId))
      .where(
        and(
          eq(agencyPermissions.agencyId, input.agencyId),
          eq(userGroups.tenantId, input.tenantId),
          isNull(userGroups.deletedAt),
          eq(groupMembers.userId, input.userId),
          eq(groupMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!sharedPermission) {
      throw new Error(
        `Selected agency ${input.agencyId} is shared but not available to this requester`,
      );
    }
  }
}

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function isImageObjective(text: string): boolean {
  return matchesAnyPattern(text, [
    /(^|\b)(image|images|picture|pictures|photo|photos|illustration|illustrations|art|poster|drawing|graphic|graphics|thumbnail|cover)(\b|$)/i,
    /(^|\b)(สร้างภาพ|สร้างรูป|สร้างรูปภาพ|วาดภาพ|วาดรูป|ทำภาพ|ทำรูป|ภาพ|รูปภาพ|โปสเตอร์|ภาพถ่าย|อาร์ต)(\b|$)/i,
    /generate image|create image|make image|draw image|generate picture|create picture|make picture|create photo|generate photo/i,
  ]);
}

function isVideoObjective(text: string): boolean {
  return matchesAnyPattern(text, [
    /(^|\b)(video|videos|videoclip|clip|clips|movie|movies|film|films|veo|reel|reels)(\b|$)/i,
    /(^|\b)(สร้างวีดีโอ|สร้างวิดีโอ|สร้างคลิป|ทำวีดีโอ|ทำวิดีโอ|ทำคลิป|วีดีโอ|วิดีโอ|คลิป)(\b|$)/i,
    /generate video|create video|make video|generate clip|create clip|make clip/i,
  ]);
}

function isStoryboardObjective(text: string): boolean {
  return matchesAnyPattern(text, [
    /(^|\b)(storyboard|storyboards|scene|scenes|shot|shots|shotlist|sequence|sequences)(\b|$)/i,
    /(^|\b)(สตอรี่บอร์ด|บอร์ดภาพ|ช็อต|ฉาก|ลำดับภาพ|ไทม์ไลน์)(\b|$)/i,
  ]);
}

function normalizeStepRoutingText(value: string): string {
  return value.toLowerCase().trim();
}

function extractAutoTeamPlanStepContext(
  contextState: unknown
): {
  stepKey: string;
  title: string;
  objective: string | null;
  deliverable: string | null;
  surface: string | null;
  selectedCapabilityId: string | null;
  runtimeDispatchPolicy: RuntimeDispatchPolicy | null;
  validationAttempt: number;
  validationStatus: string | null;
} | null {
  if (!contextState || typeof contextState !== "object") return null;
  const projectState = (contextState as Record<string, unknown>).projectState;
  if (!projectState || typeof projectState !== "object") return null;
  const steps = (projectState as Record<string, unknown>).steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const activeStep =
    steps.find(step => {
      if (!step || typeof step !== "object") return false;
      const status = (step as Record<string, unknown>).status;
      return status !== "completed" && status !== "failed";
    }) ?? steps[0];

  if (!activeStep || typeof activeStep !== "object") return null;

  const stepRecord = activeStep as Record<string, unknown>;
  const stepKey = typeof stepRecord.stepKey === "string" ? stepRecord.stepKey : "";
  const title = typeof stepRecord.title === "string" ? stepRecord.title : "";
  if (!stepKey && !title) return null;

  const runtimeDispatchPolicy = (() => {
    const candidate = stepRecord.runtimeDispatchPolicy;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const record = candidate as Record<string, unknown>;
    if (
      typeof record.stepId !== "string" ||
      typeof record.authorityDecision !== "string" ||
      typeof record.surface !== "string"
    ) {
      return null;
    }
    return candidate as RuntimeDispatchPolicy;
  })();

  return {
    stepKey: stepKey || title,
    title: title || stepKey,
    objective:
      typeof stepRecord.objective === "string"
        ? stepRecord.objective
        : null,
    deliverable:
      typeof stepRecord.deliverable === "string"
        ? stepRecord.deliverable
        : null,
    surface:
      typeof stepRecord.surface === "string" ? stepRecord.surface : null,
    selectedCapabilityId:
      typeof stepRecord.selectedCapabilityId === "string"
        ? stepRecord.selectedCapabilityId
        : null,
    runtimeDispatchPolicy,
    validationAttempt:
      stepRecord.validationState &&
      typeof stepRecord.validationState === "object" &&
      typeof (stepRecord.validationState as Record<string, unknown>).attempt === "number"
        ? Math.max(0, Number((stepRecord.validationState as Record<string, unknown>).attempt))
        : 0,
    validationStatus:
      stepRecord.validationState &&
      typeof stepRecord.validationState === "object" &&
      typeof (stepRecord.validationState as Record<string, unknown>).status === "string"
        ? String((stepRecord.validationState as Record<string, unknown>).status)
        : null,
  };
}

function getExplicitPlanStepSkillId(step: {
  selectedCapabilityId: string | null;
}): string | null {
  const parsed = parseSelectedCapabilityId(step.selectedCapabilityId);
  return parsed?.kind === "skill" ? parsed.id : null;
}

function getExplicitPlanStepAgencyId(step: {
  selectedCapabilityId: string | null;
}): string | null {
  const parsed = parseSelectedCapabilityId(step.selectedCapabilityId);
  return parsed?.kind === "agency" ? parsed.id : null;
}

function getExplicitPlanStepMediaModelId(step: {
  selectedCapabilityId: string | null;
}): string | null {
  const parsed = parseSelectedCapabilityId(step.selectedCapabilityId);
  return parsed?.kind === "media_model" ? parsed.id : null;
}

function shouldRoutePlanStepToAgency(step: {
  surface: string | null;
  selectedCapabilityId: string | null;
}): boolean {
  return step.surface === "agency" || getExplicitPlanStepAgencyId(step) !== null;
}

function isRecoverableAgencyRuntimeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Agency service temporarily unavailable") ||
    message.includes("Agency run failed") ||
    message.includes("503") ||
    message.includes("ECONNREFUSED") ||
    message.includes("fetch failed") ||
    message.toLowerCase().includes("timeout") ||
    message.includes("Team agency") ||
    message.includes("should fall back to skill execution")
  );
}

function selectAutoTeamPlanStepSkill(step: {
  stepKey: string;
  title: string;
  objective: string | null;
  deliverable: string | null;
  surface: string | null;
  selectedCapabilityId: string | null;
  runtimeDispatchPolicy: RuntimeDispatchPolicy | null;
}): string | null {
  const explicitSkillId = getExplicitPlanStepSkillId(step);
  if (explicitSkillId) return explicitSkillId;

  const parsedCapability = parseSelectedCapabilityId(step.selectedCapabilityId);
  if (
    step.surface === "video_editor" ||
    (parsedCapability?.kind === "surface" && parsedCapability.id === "video_editor")
  ) {
    return "video-storyboard-to-prompts";
  }
  if (
    step.surface === "document_management" ||
    (parsedCapability?.kind === "surface" && parsedCapability.id === "document_management")
  ) {
    return isStoryboardObjective(
      [step.stepKey, step.title, step.objective, step.deliverable]
        .filter((value): value is string => Boolean(value))
        .join(" "),
    )
      ? "storyboard-writer"
      : "general-article-writer";
  }
  if (step.surface === "media_studio" || parsedCapability?.kind === "media_model") {
    return "image_prompt_engineer";
  }

  const routingText = normalizeStepRoutingText(
    [step.stepKey, step.title, step.objective, step.deliverable]
      .filter((value): value is string => Boolean(value))
      .join(" ")
  );

  if (
    /research|ค้นคว้า|วิจัย|สรุปทิศทาง|summary|brief|briefing|context/.test(
      routingText
    )
  ) {
    return "general-article-writer";
  }

  if (/storyboard|สตอรี่บอร์ด|shot list|shotlist|scene|scenes|ฉาก/.test(routingText)) {
    return "storyboard-writer";
  }

  if (/prompt|พรอมป์|veo|package|แพ็กเกจ/.test(routingText)) {
    return "video-prompt-engineer";
  }

  if (/handoff|finalize|approval|review|ส่งมอบ|ตรวจทาน|สรุป/.test(routingText)) {
    return "general-article-writer";
  }

  return null;
}

function buildRuntimeDispatchBlockedResult(input: {
  activePlanStep: NonNullable<ReturnType<typeof extractAutoTeamPlanStepContext>>;
}): TeamRunSkillExecutionResult {
  const policy = input.activePlanStep.runtimeDispatchPolicy!;
  const approvalRequired = policy.authorityDecision === "approval_required";
  const content = approvalRequired
    ? `Step "${input.activePlanStep.title}" is waiting for approval before ${policy.surface} execution. ${policy.deadLetterPolicy.recoveryHint}`
    : `Step "${input.activePlanStep.title}" is blocked from ${policy.surface} execution. ${policy.deadLetterPolicy.recoveryHint}`;

  return {
    content,
    inputTokens: 0,
    outputTokens: 0,
    costCredits: 0,
    metadata: {
      route: "manual",
      routeReason: `runtime_dispatch_policy:${policy.authorityDecision}`,
      selectedSkillId: input.activePlanStep.selectedCapabilityId,
      runtimeDispatchPolicy: policy,
      runtimeDispatchOutcome:
        policy.authorityDecision === "approval_required"
          ? "awaiting_human_approval"
          : "blocked",
      deadLetterPolicy: policy.deadLetterPolicy,
      nextSpeakerHint: null,
      llmModelId: null,
    },
    skillId: input.activePlanStep.selectedCapabilityId ?? "work-os-runtime-gate",
  };
}

function buildCapabilityGapSkillCreationObjective(input: {
  runObjective: string;
  activePlanStep: NonNullable<ReturnType<typeof extractAutoTeamPlanStepContext>>;
  missingSkillId?: string | null;
}): string {
  const parsedCapability = parseSelectedCapabilityId(
    input.activePlanStep.selectedCapabilityId
  );
  return [
    "Create a private or pending-review skill proposal for an Auto Team plan step.",
    "Do not publish the skill, widen visibility, execute external side effects, or auto-apply it without a separate governed approval.",
    "Return the proposed skill name, scope, input contract, output contract, safety limits, test fixture, and how the Auto Team should route to it next time.",
    "",
    `Original run objective: ${input.runObjective}`,
    `Plan step key: ${input.activePlanStep.stepKey}`,
    `Plan step title: ${input.activePlanStep.title}`,
    input.activePlanStep.objective
      ? `Step objective: ${input.activePlanStep.objective}`
      : null,
    input.activePlanStep.deliverable
      ? `Expected deliverable: ${input.activePlanStep.deliverable}`
      : null,
    input.activePlanStep.surface
      ? `Requested surface: ${input.activePlanStep.surface}`
      : null,
    input.activePlanStep.selectedCapabilityId
      ? `Selected capability: ${input.activePlanStep.selectedCapabilityId}`
      : null,
    input.missingSkillId ? `Missing skill id: ${input.missingSkillId}` : null,
    parsedCapability ? `Parsed capability kind: ${parsedCapability.kind}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

async function resolveSkillCreationFallbackSkillId(): Promise<string | null> {
  for (const skillId of SKILL_CREATOR_FALLBACK_SKILL_IDS) {
    const skill = await getSkillByIdAsync(skillId);
    if (skill) return skillId;
  }
  return null;
}

function shouldCreateSkillForCapabilityGap(input: {
  activePlanStep: NonNullable<ReturnType<typeof extractAutoTeamPlanStepContext>>;
  missingSkillId?: string | null;
  routeAlreadyResolved: boolean;
  allowGenericSkillGap?: boolean;
}): boolean {
  if (input.routeAlreadyResolved) return false;
  const parsedCapability = parseSelectedCapabilityId(
    input.activePlanStep.selectedCapabilityId
  );
  if (parsedCapability?.kind === "skill_studio") return true;
  if (parsedCapability?.kind === "workflow") return true;
  if (parsedCapability?.kind === "context_pack") return true;
  if (
    parsedCapability?.kind === "surface" &&
    parsedCapability.id === "workflow"
  ) {
    return true;
  }
  if (parsedCapability?.kind === "skill" && input.missingSkillId) return true;
  if (
    input.allowGenericSkillGap &&
    input.activePlanStep.surface === "skill" &&
    (!input.activePlanStep.selectedCapabilityId ||
      (input.activePlanStep.validationStatus === "failed" &&
        input.activePlanStep.validationAttempt >= 2))
  ) {
    return true;
  }
  return false;
}

async function buildCapabilityGapRoute(
  input: TeamRunSkillExecutionInput,
  activePlanStep: NonNullable<ReturnType<typeof extractAutoTeamPlanStepContext>>,
  missingSkillId?: string | null
): Promise<TeamRunSkillExecutionInput | null> {
  const selectedSkillId = await resolveSkillCreationFallbackSkillId();
  if (!selectedSkillId) return null;

  const parsedCapability = parseSelectedCapabilityId(
    activePlanStep.selectedCapabilityId
  );
  const capabilityGapResolution = {
    action: "create_private_skill_draft",
    selectedSkillId,
    missingSkillId: missingSkillId ?? null,
    selectedCapabilityId: activePlanStep.selectedCapabilityId,
    parsedCapabilityKind: parsedCapability?.kind ?? null,
    stepKey: activePlanStep.stepKey,
    safetyMode: "private_or_pending_review_only",
    publishAllowed: false,
    autoApplyAllowed: false,
    lifecycleState: "draft_requested",
    nextAction: "review_test_publish_then_retry_step",
    rerouteAfterApproval: true,
    retryPolicy: {
      trigger: "skill_published_or_approved",
      originalStepKey: activePlanStep.stepKey,
      originalCapabilityId: activePlanStep.selectedCapabilityId,
      maxAutomaticRetries: 1,
    },
  };
  const skillStudioPolicy = {
    action: "create_private_or_pending_review",
    visibility: "private",
    state: "draft_or_pending_review",
    publishAllowed: false,
    autoApplyAllowed: false,
    widenVisibilityAllowed: false,
    externalSideEffectsAllowed: false,
    approvalRequiredForPublish: true,
  };

  return {
    ...input,
    objective: buildCapabilityGapSkillCreationObjective({
      runObjective: input.objective,
      activePlanStep,
      missingSkillId,
    }),
    dynamicParams: {
      ...(input.dynamicParams ?? {}),
      capabilityGapResolution,
      skillStudioPolicy,
    },
    route: {
      ...input.route,
      route: "skill",
      reason: `auto_team_capability_gap:${activePlanStep.stepKey}:${selectedSkillId}`,
      selectedSkillId,
      selectedCapabilityId: activePlanStep.selectedCapabilityId ?? undefined,
      capabilityGapResolution: {
        ...capabilityGapResolution,
        skillStudioPolicy,
      },
    },
  };
}

function throwMissingSkillCreatorForCapabilityGap(
  activePlanStep: NonNullable<ReturnType<typeof extractAutoTeamPlanStepContext>>,
): never {
  throw new Error(
    `No approved skill creator is available for capability gap resolution on step ${activePlanStep.stepKey}`,
  );
}

function detectSkillStudioPolicyViolations(
  result: Pick<TeamRunSkillExecutionResult, "content" | "metadata">,
): string[] {
  const inspectedText = [
    result.content,
    JSON.stringify(result.metadata ?? {}),
  ].join("\n");
  const violations: string[] = [];
  const booleanPolicyPatterns = [
    {
      code: "publish_requested",
      pattern: /["']?(publishAllowed|publish|publishNow)["']?\s*[:=]\s*true/i,
    },
    {
      code: "auto_apply_requested",
      pattern: /["']?(autoApplyAllowed|autoApply|applyNow|installNow)["']?\s*[:=]\s*true/i,
    },
    {
      code: "visibility_widen_requested",
      pattern:
        /["']?(widenVisibilityAllowed|visibility)["']?\s*[:=]\s*["']?(public|shared|tenant)["']?/i,
    },
    {
      code: "external_side_effect_requested",
      pattern:
        /["']?(externalSideEffectsAllowed|externalSideEffect|externalWrite)["']?\s*[:=]\s*true/i,
    },
    {
      code: "published_state_requested",
      pattern: /["']?(state|status)["']?\s*[:=]\s*["']?(published|approved|active)["']?/i,
    },
    {
      code: "natural_language_publish_requested",
      pattern:
        /\b(publish this|publish now|make (it|this|the skill) public|set visibility to public|share with tenant|auto[- ]?apply|apply it automatically|install it now|execute external)\b/i,
    },
  ];
  for (const candidate of booleanPolicyPatterns) {
    if (candidate.pattern.test(inspectedText)) {
      violations.push(candidate.code);
    }
  }
  for (const violation of detectStructuredSkillStudioPolicyViolations(result)) {
    violations.push(violation);
  }
  return Array.from(new Set(violations));
}

function detectStructuredSkillStudioPolicyViolations(
  result: Pick<TeamRunSkillExecutionResult, "content" | "metadata">,
): string[] {
  const violations: string[] = [];
  const candidates: unknown[] = [result.metadata];
  const trimmed = result.content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      candidates.push(JSON.parse(trimmed));
    } catch {
      // Keep the regex guard for non-JSON content.
    }
  }

  const visit = (value: unknown, keyPath: string[] = []) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(item => visit(item, keyPath));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[_\-\s]/g, "");
      const normalizedValue =
        typeof child === "string"
          ? child.trim().toLowerCase().replace(/[_\-\s]/g, "")
          : child;
      const truthy =
        normalizedValue === true ||
        normalizedValue === "true" ||
        normalizedValue === "yes" ||
        normalizedValue === "allowed" ||
        normalizedValue === "approved" ||
        normalizedValue === "publish" ||
        normalizedValue === "published" ||
        normalizedValue === "public" ||
        normalizedValue === "shared" ||
        normalizedValue === "tenant";

      if (
        ["publishallowed", "publish", "publishnow", "autopublish"].includes(
          normalizedKey,
        ) &&
        truthy
      ) {
        violations.push("publish_requested");
      }
      if (
        ["autoapplyallowed", "autoapply", "applynow", "installnow"].includes(
          normalizedKey,
        ) &&
        truthy
      ) {
        violations.push("auto_apply_requested");
      }
      if (
        ["widenvisibilityallowed", "externalvisibility"].includes(
          normalizedKey,
        ) &&
        truthy
      ) {
        violations.push("visibility_widen_requested");
      }
      if (
        normalizedKey === "visibility" &&
        ["public", "shared", "tenant"].includes(String(normalizedValue))
      ) {
        violations.push("visibility_widen_requested");
      }
      if (
        ["externalsideeffectsallowed", "externalsideeffect", "externalwrite"].includes(
          normalizedKey,
        ) &&
        truthy
      ) {
        violations.push("external_side_effect_requested");
      }
      if (
        ["state", "status"].includes(normalizedKey) &&
        ["published", "approved", "active"].includes(String(normalizedValue))
      ) {
        violations.push("published_state_requested");
      }
      visit(child, [...keyPath, key]);
    }
  };

  candidates.forEach(candidate => visit(candidate));
  return violations;
}

function enforceCapabilityGapSkillStudioPolicy(
  result: TeamRunSkillExecutionResult,
  capabilityGapResolution?: Record<string, unknown>,
): TeamRunSkillExecutionResult {
  if (!capabilityGapResolution) return result;
  const skillStudioPolicy =
    capabilityGapResolution.skillStudioPolicy &&
    typeof capabilityGapResolution.skillStudioPolicy === "object"
      ? (capabilityGapResolution.skillStudioPolicy as Record<string, unknown>)
      : null;
  if (!skillStudioPolicy) return result;

  const violations = detectSkillStudioPolicyViolations(result);
  const enforcedMetadata = {
    ...result.metadata,
    capabilityGapPolicyEnforced: true,
    capabilityGapPolicy: {
      publishAllowed: false,
      autoApplyAllowed: false,
      widenVisibilityAllowed: false,
      externalSideEffectsAllowed: false,
      visibility: "private",
      state: "draft_or_pending_review",
      lifecycleState: "draft_requested",
      nextAction: "review_test_publish_then_retry_step",
      rerouteAfterApproval: true,
      retryPolicy: {
        trigger: "skill_published_or_approved",
        maxAutomaticRetries: 1,
      },
    },
    capabilityGapNextAction: "review_test_publish_then_retry_step",
    capabilityGapDraftEvidence: {
      required: true,
      expectedRefs: ["skill_draft", "input_contract", "output_contract", "safety_limits", "test_fixture"],
      persistence: "skill_creator_output_must_be_saved_as_private_or_pending_review_draft",
      retryAfterApproval: true,
    },
  };
  if (violations.length === 0) {
    return {
      ...result,
      metadata: enforcedMetadata,
    };
  }

  return {
    ...result,
    content:
      "Skill draft output was blocked by the Skill Studio safety policy. The proposed capability must remain a private or pending-review draft and cannot publish, auto-apply, widen visibility, or perform external side effects.",
    metadata: {
      ...enforcedMetadata,
      capabilityGapPolicyViolation: {
        blocked: true,
        violations,
      },
      runtimeDispatchOutcome: "blocked_by_skill_studio_policy",
      nextSpeakerHint: null,
    },
    nextSpeakerHint: undefined,
  };
}

function assertCapabilityGapSkillStudioPreExecutionPolicy(input: {
  skill: SkillDefinition;
  capabilityGapResolution?: Record<string, unknown>;
}): Record<string, unknown> | null {
  const resolution = input.capabilityGapResolution;
  if (!resolution) return null;

  if (!SKILL_CREATOR_FALLBACK_SKILL_IDS.includes(input.skill.id as any)) {
    throw new Error(
      `Capability gap route must execute a skill creator draft skill, not ${input.skill.id}`,
    );
  }

  const skillStudioPolicy =
    resolution.skillStudioPolicy &&
    typeof resolution.skillStudioPolicy === "object"
      ? (resolution.skillStudioPolicy as Record<string, unknown>)
      : null;
  if (!skillStudioPolicy) {
    throw new Error("Capability gap route is missing the Skill Studio safety policy");
  }

  const policyViolations = detectStructuredSkillStudioPolicyViolations({
    content: "",
    metadata: { skillStudioPolicy },
  });
  const visibility = String(skillStudioPolicy.visibility ?? "").toLowerCase();
  const action = String(skillStudioPolicy.action ?? "").toLowerCase();
  if (
    policyViolations.length > 0 ||
    visibility !== "private" ||
    action !== "create_private_or_pending_review" ||
    skillStudioPolicy.publishAllowed !== false ||
    skillStudioPolicy.autoApplyAllowed !== false ||
    skillStudioPolicy.widenVisibilityAllowed !== false ||
    skillStudioPolicy.externalSideEffectsAllowed !== false
  ) {
    throw new Error(
      "Capability gap skill creation must remain draft-only, private, approval-gated, and side-effect free before execution",
    );
  }

  return {
    checked: true,
    draftOnly: true,
    visibility: "private",
    publishAllowed: false,
    autoApplyAllowed: false,
    widenVisibilityAllowed: false,
    externalSideEffectsAllowed: false,
    approvalRequiredForPublish: true,
  };
}

function isPromptSkillChainCandidate(skill: SkillDefinition): boolean {
  const category = String((skill as { category?: string }).category ?? "")
    .toLowerCase()
    .replace(/-/g, "_");
  const executionMode = String(
    (skill as { executionMode?: string }).executionMode ?? ""
  ).toLowerCase();
  return (
    Boolean(skill.chainTo) &&
    (category.includes("prompt_generation") ||
      category === "prompt_enhancement" ||
      PROMPT_SKILL_MEDIA_EXECUTION_MODES.has(executionMode))
  );
}

function parseMediaPromptChainOutput(content: string): {
  prompt: string;
  extraParams: Record<string, unknown>;
} {
  const normalized = normalizeMediaPrompt(content);
  const extraParams: Record<string, unknown> = {};

  const candidates = [normalized, content];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const prompt =
        typeof parsed.prompt === "string" && parsed.prompt.trim()
          ? parsed.prompt.trim()
          : typeof parsed.promptEn === "string" && parsed.promptEn.trim()
            ? parsed.promptEn.trim()
            : typeof parsed.promptTh === "string" && parsed.promptTh.trim()
              ? parsed.promptTh.trim()
              : normalized;

      for (const key of [
        "aspectRatio",
        "style",
        "numImages",
        "quality",
        "duration",
        "clipCount",
        "model",
        "fps",
        "resolution",
        "referenceImageUrls",
        "referenceStyleUrl",
        "referenceVideoUrl",
        "referenceVideoUrls",
        "publicUrl",
        "language",
      ]) {
        const value = parsed[key];
        if (value !== undefined && value !== null && value !== "") {
          extraParams[key] = value;
        }
      }

      return { prompt, extraParams };
    } catch {
      // Try next candidate.
    }
  }

  const fallbackParsed = parsePromptResponse(content);
  const prompt =
    fallbackParsed.promptEn?.trim() ||
    fallbackParsed.promptTh?.trim() ||
    normalized ||
    content.trim();

  return { prompt, extraParams };
}

function summarizeMediaExecutionResult(input: {
  promptSkillId: string;
  mediaSkillId: string;
  mediaSkillName: string;
  mediaType: "image" | "video" | "audio";
  mediaResult: {
    route: { reason: string; executorId: string; capability: string };
    result: { type: "media_job" | "text" | "delegated"; jobPayload?: unknown };
    tokens: { input: number; output: number };
    costCredits: number;
    modelUsed: string | null;
    skillId: string;
    nextSpeakerHint?: string;
    metadata: Record<string, unknown>;
    telemetry: { attempts: unknown[]; totalDurationMs: number };
  };
  promptText: string;
}): string {
  const payload =
    input.mediaResult.result.type === "media_job"
      ? (input.mediaResult.result.jobPayload as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const taskId =
    typeof payload?.taskId === "string" && payload.taskId.trim()
      ? payload.taskId.trim()
      : typeof payload?.id === "string" && payload.id.trim()
        ? payload.id.trim()
        : typeof payload?.task_id === "string" && payload.task_id.trim()
          ? payload.task_id.trim()
          : null;
  const resultUrl =
    typeof payload?.resultUrl === "string" && payload.resultUrl.trim()
      ? payload.resultUrl.trim()
      : typeof payload?.result_url === "string" && payload.result_url.trim()
        ? payload.result_url.trim()
        : typeof payload?.sourceUrl === "string" && payload.sourceUrl.trim()
          ? payload.sourceUrl.trim()
          : null;
  const status =
    typeof payload?.status === "string" && payload.status.trim()
      ? payload.status.trim().toLowerCase()
      : typeof payload?.providerStatus === "string" && payload.providerStatus.trim()
        ? payload.providerStatus.trim().toLowerCase()
        : null;
  const errorMessage =
    typeof payload?.errorMessage === "string" && payload.errorMessage.trim()
      ? payload.errorMessage.trim()
      : typeof payload?.error_message === "string" && payload.error_message.trim()
        ? payload.error_message.trim()
        : null;
  const mediaLabel =
    input.mediaType === "image"
      ? "image"
      : input.mediaType === "audio"
        ? "audio"
        : "video";
  const mediaArticle = mediaLabel === "image" || mediaLabel === "audio" ? "an" : "a";
  const action =
    status && ["failed", "error", "cancelled", "canceled"].includes(status)
      ? `returned a failed ${mediaLabel} generation job`
      : resultUrl
        ? `produced ${mediaArticle} ${mediaLabel} artifact`
        : `queued ${mediaLabel} generation`;
  const pieces = [
    `${input.mediaSkillName} ${action}.`,
    `Prompt skill: ${input.promptSkillId}.`,
    taskId ? `Task: ${taskId}.` : null,
    status ? `Status: ${status}.` : null,
    errorMessage ? `Error: ${errorMessage}.` : null,
    resultUrl ? `Result: ${resultUrl}.` : null,
    input.promptText ? `Prompt: ${input.promptText}` : null,
  ].filter(Boolean);
  return pieces.join(" ");
}

type UnifiedMediaJobExecutionResult = UnifiedExecutionResult & {
  result: MediaJobResult;
};

function isUnifiedMediaJobResult(
  result: UnifiedExecutionResult,
): result is UnifiedMediaJobExecutionResult {
  return result.result.type === "media_job";
}

function readNumberParam(
  value: unknown,
): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

async function buildDirectMediaJobExecutionResult(input: {
  executionInput: TeamRunSkillExecutionInput;
  skill: SkillDefinition;
  result: UnifiedMediaJobExecutionResult;
  routeInput: TeamRunSkillExecutionInput;
}): Promise<TeamRunSkillExecutionResult> {
  const mediaJob = input.result.result;
  const mediaParams = input.executionInput.dynamicParams ?? {};
  const promptText =
    typeof mediaParams.prompt === "string" && mediaParams.prompt.trim()
      ? mediaParams.prompt.trim()
      : input.executionInput.objective;
  const clipPlan =
    mediaJob.mediaType === "video"
      ? resolveAutoTeamClipPlan({
          objective: input.executionInput.objective,
          durationSeconds: readNumberParam(mediaParams.duration),
          requestedClipCount: readNumberParam(mediaParams.clipCount),
        })
      : null;

  if (mediaJob.mediaType === "image" || mediaJob.mediaType === "video") {
    await registerAutoTeamMediaArtifact({
      runId: input.executionInput.run.id,
      roomId: input.executionInput.roomId,
      teamId: input.executionInput.teamId,
      tenantId: input.executionInput.tenantId,
      userId: input.executionInput.userId,
      assistantId: input.executionInput.assistantId,
      objective: input.executionInput.objective,
      mediaType: mediaJob.mediaType,
      mediaPayload: mediaJob.jobPayload,
      promptText,
      promptSkillId: input.skill.id,
      mediaSkillId: input.result.skillId,
      modelId: input.result.modelUsed,
      plannedDurationSeconds: clipPlan?.durationSeconds,
      clipIndex: mediaJob.mediaType === "video" ? 1 : undefined,
      clipCount: clipPlan?.clipCount,
    });
  }

  const mediaSkillName =
    input.skill.name || input.result.skillId || input.skill.id;
  const awaitingPipeline = mediaJob.mediaType === "video";

  return {
    content: summarizeMediaExecutionResult({
      promptSkillId: input.skill.id,
      mediaSkillId: input.result.skillId,
      mediaSkillName,
      mediaType: mediaJob.mediaType,
      mediaResult: input.result,
      promptText,
    }),
    inputTokens: input.result.tokens.input,
    outputTokens: input.result.tokens.output,
    costCredits: input.result.costCredits,
    metadata: {
      ...input.result.metadata,
      unifiedPath: true,
      route: input.result.route.capability,
      routeReason: input.result.route.reason,
      selectedSkillId: input.result.skillId,
      selectedCapabilityId: input.routeInput.route.selectedCapabilityId ?? null,
      capabilityGapResolution:
        input.routeInput.route.capabilityGapResolution ?? null,
      nextSpeakerHint: input.result.nextSpeakerHint ?? null,
      attempts: input.result.telemetry.attempts,
      llmModelId: input.result.modelUsed,
      mediaJob,
      mediaJobs: [mediaJob],
      mediaChain: {
        promptSkillId: input.skill.id,
        mediaSkillId: input.result.skillId,
        mediaSkillName,
        mediaType: mediaJob.mediaType,
        mediaRoute: input.result.route,
        mediaMetadata: input.result.metadata,
        promptText,
        clipCount: clipPlan?.clipCount ?? 1,
      },
      ...(awaitingPipeline
        ? {
            mediaPipelineAwaitingAssets: true,
            runtimeDispatchOutcome: "awaiting_async_assets",
            retryAfterMs: 30_000,
          }
        : {}),
    },
    skillId: input.result.skillId,
    nextSpeakerHint: input.result.nextSpeakerHint,
  };
}

function buildUnifiedExecutionFailureResult(input: {
  skill: SkillDefinition;
  result: UnifiedExecutionResult;
  routeInput: TeamRunSkillExecutionInput;
}): TeamRunSkillExecutionResult {
  const error =
    typeof input.result.metadata?.error === "string" &&
    input.result.metadata.error.trim()
      ? input.result.metadata.error.trim()
      : input.result.route.reason || "executor_failed";
  const fallbackContent =
    input.result.result.type === "text" && input.result.result.content.trim()
      ? input.result.result.content.trim()
      : `${input.skill.name || input.result.skillId || input.skill.id} failed before producing a result. Error: ${error}.`;

  return {
    content: fallbackContent,
    inputTokens: input.result.tokens.input,
    outputTokens: input.result.tokens.output,
    costCredits: input.result.costCredits,
    metadata: {
      ...input.result.metadata,
      unifiedPath: true,
      route: input.result.route.capability,
      routeReason: `unified_executor_failed:${input.result.route.reason}`,
      selectedSkillId: input.result.skillId,
      selectedCapabilityId: input.routeInput.route.selectedCapabilityId ?? null,
      capabilityGapResolution:
        input.routeInput.route.capabilityGapResolution ?? null,
      nextSpeakerHint: input.result.nextSpeakerHint ?? null,
      attempts: input.result.telemetry.attempts,
      llmModelId: input.result.modelUsed,
      runtimeDispatchOutcome: "execution_failed",
      executionError: error,
    },
    skillId: input.result.skillId,
    nextSpeakerHint: input.result.nextSpeakerHint,
  };
}

async function maybeChainPromptSkillToMedia(
  input: TeamRunSkillExecutionInput,
  skill: SkillDefinition,
  promptContent: string,
  promptResult: {
    inputTokens: number;
    outputTokens: number;
    costCredits: number;
    metadata: Record<string, unknown>;
    skillId: string;
    nextSpeakerHint?: string;
    modelId?: string | null;
    attempts?: unknown[];
  }
): Promise<TeamRunSkillExecutionResult> {
  if (!isPromptSkillChainCandidate(skill)) {
    return {
      content: promptContent,
      inputTokens: promptResult.inputTokens,
      outputTokens: promptResult.outputTokens,
      costCredits: promptResult.costCredits,
      metadata: {
        ...promptResult.metadata,
        selectedSkillId: skill.id,
      },
      skillId: skill.id,
      nextSpeakerHint: promptResult.nextSpeakerHint,
    };
  }

  const chainTargetId = skill.chainTo?.trim();
  if (!chainTargetId) {
    return {
      content: promptContent,
      inputTokens: promptResult.inputTokens,
      outputTokens: promptResult.outputTokens,
      costCredits: promptResult.costCredits,
      metadata: {
        ...promptResult.metadata,
        selectedSkillId: skill.id,
      },
      skillId: skill.id,
      nextSpeakerHint: promptResult.nextSpeakerHint,
    };
  }

  const chainTarget = await getSkillByIdAsync(chainTargetId);
  if (!chainTarget) {
    throw new Error(
      `Prompt skill '${skill.id}' chain target '${chainTargetId}' not found`
    );
  }

  const { prompt, extraParams } = parseMediaPromptChainOutput(promptContent);
  const mediaParams = { ...extraParams };
  if (chainTarget.id === "image-creator") {
    mediaParams.numImages =
      typeof mediaParams.numImages === "number" && mediaParams.numImages > 0
        ? mediaParams.numImages
        : 6;
  }
  if (chainTarget.id === "video-creator") {
    mediaParams.duration =
      typeof mediaParams.duration === "number" && mediaParams.duration > 0
        ? mediaParams.duration
        : 10;
  }
  const clipPlan =
    chainTarget.id === "video-creator"
      ? resolveAutoTeamClipPlan({
          objective: input.objective,
          durationSeconds:
            typeof mediaParams.duration === "number"
              ? mediaParams.duration
              : undefined,
          requestedClipCount:
            typeof mediaParams.clipCount === "number"
              ? mediaParams.clipCount
              : undefined,
        })
      : null;
  const mediaRunCount = clipPlan?.clipCount ?? 1;
  const activePlanStep = extractAutoTeamPlanStepContext(
    input.dynamicParams?.contextState,
  );
  const explicitMediaModelId = activePlanStep
    ? getExplicitPlanStepMediaModelId(activePlanStep)
    : null;
  const mediaBudgetGate = evaluateAutoTeamMediaChainBudgetPreflight({
    maxBudgetCredits: getApprovedRunBudgetMaxCredits(input.run),
    totalCreditsUsed: getRunTotalCreditsUsed(input.run),
    promptCredits: promptResult.costCredits,
    mediaType: chainTarget.id === "video-creator" ? "video" : "image",
    clipCount: mediaRunCount,
  });
  if (!mediaBudgetGate.allowed) {
    const runtimeDispatchPolicy = activePlanStep?.runtimeDispatchPolicy
      ? {
          ...activePlanStep.runtimeDispatchPolicy,
          authorityDecision: "blocked" as const,
          budgetReservation: {
            ...activePlanStep.runtimeDispatchPolicy.budgetReservation,
            mediaJobs: mediaRunCount,
            costCredits: mediaBudgetGate.creditsNeeded,
          },
          deadLetterPolicy: {
            ...activePlanStep.runtimeDispatchPolicy.deadLetterPolicy,
            reasonCode: "budget_cap_exceeded",
            recoveryHint:
              "Increase the approved budget envelope or reduce the requested media duration/clip count before retrying automation.",
          },
        }
      : null;
    return {
      content: `Step "${activePlanStep?.title ?? skill.id}" is blocked before media fan-out because the approved budget envelope would be exceeded.`,
      inputTokens: promptResult.inputTokens,
      outputTokens: promptResult.outputTokens,
      costCredits: promptResult.costCredits,
      metadata: {
        ...promptResult.metadata,
        route: "manual",
        routeReason: "auto_team_media_budget_preflight:budget_cap_exceeded",
        selectedSkillId: chainTarget.id,
        promptSkillId: skill.id,
        runtimeDispatchPolicy,
        runtimeDispatchOutcome: "blocked",
        budgetGate: mediaBudgetGate,
        autoReplanRequested: true,
        mediaChain: {
          promptSkillId: skill.id,
          mediaSkillId: chainTarget.id,
          mediaSkillName: chainTarget.name,
          mediaType: chainTarget.id === "video-creator" ? "video" : "image",
          clipCount: mediaRunCount,
        },
      },
      skillId: chainTarget.id,
      nextSpeakerHint: promptResult.nextSpeakerHint,
    };
  }
  const storyboardState =
    chainTarget.id === "video-creator"
      ? await getAutoTeamStoryboardAssetState(input.run.id).catch(() => null)
      : null;
  if (
    chainTarget.id === "video-creator" &&
    storyboardState &&
    (storyboardState.pendingImageTaskCount > 0 || storyboardState.failedImageTaskCount > 0)
  ) {
    if (storyboardState.failedImageTaskCount > 0) {
      throw new Error(
        `Storyboard image generation has ${storyboardState.failedImageTaskCount} failed task(s); repair storyboard assets before generating video clips.`,
      );
    }
    return {
      content:
        `Storyboard image generation is still running (${storyboardState.pendingImageTaskCount} task(s) pending). ` +
        "Video clip generation will resume automatically after the storyboard assets are ready.",
      inputTokens: promptResult.inputTokens,
      outputTokens: promptResult.outputTokens,
      costCredits: promptResult.costCredits,
      metadata: {
        ...promptResult.metadata,
        route: "skill",
        routeReason: `auto_team_media_chain:${skill.id}->${chainTarget.id}:awaiting_storyboard_assets`,
        selectedSkillId: chainTarget.id,
        promptSkillId: skill.id,
        mediaPipelineAwaitingAssets: true,
        runtimeDispatchOutcome: "awaiting_async_assets",
        retryAfterMs: 30_000,
        storyboardAssetState: storyboardState,
      },
      skillId: chainTarget.id,
      nextSpeakerHint: promptResult.nextSpeakerHint,
    };
  }
  const storyboardImageUrls =
    chainTarget.id === "video-creator"
      ? (storyboardState?.urls ?? await getAutoTeamStoryboardImageUrls(input.run.id).catch(() => []))
      : [];

  const mediaResults: Awaited<ReturnType<typeof executeUnified>>[] = [];
  for (let index = 0; index < mediaRunCount; index += 1) {
    const clipPrompt =
      mediaRunCount > 1
        ? `${prompt}\n\nClip ${index + 1} of ${mediaRunCount}: generate a distinct storyboard segment that connects with the previous and next clip.`
        : prompt;
    const referenceImageUrl =
      storyboardImageUrls.length > 0
        ? storyboardImageUrls[index % storyboardImageUrls.length]
        : null;
    const dynamicMediaParams = {
      ...mediaParams,
      ...(explicitMediaModelId && !mediaParams.model
        ? { model: explicitMediaModelId }
        : {}),
      ...(clipPlan ? { duration: clipPlan.durationSeconds } : {}),
      ...(referenceImageUrl && !mediaParams.referenceImageUrls
        ? { referenceImageUrls: [referenceImageUrl] }
        : {}),
    };

    const mediaResult = await executeUnified({
      channel: "team_room",
      userId: input.userId,
      tenantId: input.tenantId,
      userMessage: clipPrompt,
      teamContext: {
        assistantId: input.assistantId,
        roomId: input.roomId,
        teamId: input.teamId,
        runId: input.run.id,
        objective: input.objective,
        initiatedByUserId: input.userId,
        currentMessage: input.objective,
      },
      routeHint: {
        selectedSkillId: chainTarget.id,
        route: "skill",
        reason: `auto_team_media_chain:${skill.id}->${chainTarget.id}`,
      },
      creditMode: "deduct",
      dynamicParams: {
        ...(input.dynamicParams ?? {}),
        contextState: {
          ...(typeof input.dynamicParams?.contextState === "object" &&
          input.dynamicParams?.contextState
            ? (input.dynamicParams.contextState as Record<string, unknown>)
            : {}),
          sessionState: buildTeamSessionState({
            runId: input.run.id,
            teamId: input.teamId,
            roomId: input.roomId,
            assistantId: input.assistantId,
            objective: input.objective,
          }),
        },
        prompt: clipPrompt,
        ...dynamicMediaParams,
        __autoTeamPromptSkillId: skill.id,
        __autoTeamPromptChainFrom: skill.id,
        __autoTeamClipIndex: index + 1,
        __autoTeamClipCount: mediaRunCount,
      },
    });

    if (mediaResult.result.type !== "media_job") {
      throw new Error(
        `Media chain for '${skill.id}' -> '${chainTarget.id}' did not produce a media job`
      );
    }

    mediaResults.push(mediaResult);
    const mediaJob = mediaResult.result;
    if (mediaJob.mediaType === "image" || mediaJob.mediaType === "video") {
      try {
        await registerAutoTeamMediaArtifact({
          runId: input.run.id,
          roomId: input.roomId,
          teamId: input.teamId,
          tenantId: input.tenantId,
          userId: input.userId,
          assistantId: input.assistantId,
          objective: input.objective,
          mediaType: mediaJob.mediaType,
          mediaPayload: mediaJob.jobPayload,
          promptText: clipPrompt,
          promptSkillId: skill.id,
          mediaSkillId: mediaResult.skillId,
          modelId: mediaResult.modelUsed ?? null,
          plannedDurationSeconds: clipPlan?.durationSeconds,
          clipIndex: index + 1,
          clipCount: mediaRunCount,
        });
      } catch (error) {
        throw new Error(
          `Auto-team media artifact registration failed for ${mediaJob.mediaType} clip ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  const firstMediaResult = mediaResults[0];
  if (!firstMediaResult || firstMediaResult.result.type !== "media_job") {
    throw new Error(
      `Media chain for '${skill.id}' -> '${chainTarget.id}' did not produce a media job`
    );
  }
  const firstMediaJob = firstMediaResult.result;
  const combinedCost =
    promptResult.costCredits +
    mediaResults.reduce((sum, result) => sum + result.costCredits, 0);
  const combinedInputTokens =
    promptResult.inputTokens +
    mediaResults.reduce((sum, result) => sum + result.tokens.input, 0);
  const combinedOutputTokens =
    promptResult.outputTokens +
    mediaResults.reduce((sum, result) => sum + result.tokens.output, 0);
  const summary =
    mediaResults.length === 1
      ? summarizeMediaExecutionResult({
          promptSkillId: skill.id,
          mediaSkillId: firstMediaResult.skillId,
          mediaSkillName: chainTarget.name,
          mediaType: firstMediaJob.mediaType,
          mediaResult: firstMediaResult,
          promptText: prompt,
        })
      : `${chainTarget.name} queued ${mediaResults.length} video clips for the final composition. Prompt skill: ${skill.id}. The room will wait for all clips, compose the final video, and then run the completion check.`;

  return {
    content: summary,
    inputTokens: combinedInputTokens,
    outputTokens: combinedOutputTokens,
    costCredits: combinedCost,
    metadata: {
      ...promptResult.metadata,
      mediaChain: {
        promptSkillId: skill.id,
        mediaSkillId: firstMediaResult.skillId,
        mediaSkillName: chainTarget.name,
        mediaType: firstMediaJob.mediaType,
        mediaRoute: firstMediaResult.route,
        mediaMetadata: firstMediaResult.metadata,
        promptText: prompt,
        clipCount: mediaResults.length,
      },
      selectedSkillId: firstMediaResult.skillId,
      promptSkillId: skill.id,
      nextSpeakerHint:
        firstMediaResult.nextSpeakerHint ?? promptResult.nextSpeakerHint ?? null,
      mediaJob: firstMediaResult.result,
      mediaJobs: mediaResults.map(result => result.result),
      ...(firstMediaJob.mediaType === "video"
        ? {
            mediaPipelineAwaitingAssets: true,
            runtimeDispatchOutcome: "awaiting_async_assets",
            retryAfterMs: 30_000,
          }
        : {}),
      llmModelId: firstMediaResult.modelUsed ?? promptResult.modelId ?? null,
      attempts: promptResult.attempts ?? [],
    },
    skillId: firstMediaResult.skillId,
    nextSpeakerHint:
      firstMediaResult.nextSpeakerHint ?? promptResult.nextSpeakerHint,
  };
}

export async function executeTeamRunSkillTurn(
  input: TeamRunSkillExecutionInput
): Promise<TeamRunSkillExecutionResult> {
  const contextState =
    typeof input.dynamicParams?.contextState === "object" &&
    input.dynamicParams.contextState
      ? (input.dynamicParams.contextState as Record<string, unknown>)
      : null;
  const activePlanStep = extractAutoTeamPlanStepContext(contextState);
  if (
    activePlanStep?.runtimeDispatchPolicy &&
    activePlanStep.runtimeDispatchPolicy.authorityDecision !== "allowed"
  ) {
    return buildRuntimeDispatchBlockedResult({
      activePlanStep,
    });
  }

  const routeInput = await resolveTeamOrchestratorRoute(input);
  if (routeInput.route.route === "agency") {
    try {
      return await executeAgencySwarmTurn(routeInput, routeInput.route.reason);
    } catch (error) {
      if (!isRecoverableAgencyRuntimeError(error)) {
        throw error;
      }
      const fallbackSkillId =
        (activePlanStep ? selectAutoTeamPlanStepSkill(activePlanStep) : null) ??
        GENERAL_FALLBACK_SKILL_ID;
      console.warn("[teamRunSkillExecutor] Agency route unavailable; falling back to skill execution", {
        runId: input.run.id,
        roomId: input.roomId,
        teamId: input.teamId,
        selectedAgencyId: routeInput.route.selectedAgencyId ?? null,
        fallbackSkillId,
        error: error instanceof Error ? error.message : String(error),
      });
      routeInput.route = {
        ...routeInput.route,
        route: "skill",
        reason: `agency_unavailable_fallback:${routeInput.route.reason}`,
        selectedSkillId: fallbackSkillId,
        selectedAgencyId: undefined,
      };
    }
  }
  const executionInput = routeInput;
  const skill = await resolveTeamRunSkill(routeInput.route.selectedSkillId);
  const capabilityGapPreflight =
    assertCapabilityGapSkillStudioPreExecutionPolicy({
      skill,
      capabilityGapResolution: routeInput.route.capabilityGapResolution,
    });
  const conversationModel =
    input.assistantContext.profile.preferredModelId ??
    input.assistantContext.agentModel ??
    undefined;
  const executionPolicy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel,
  });
  const plannerResult = await runPlanner({
    sourceType: "skill",
    userId: input.userId,
    tenantId: input.tenantId,
    conversationModel,
    skillSlug: skill.id,
    executionPolicy: skill.executionPolicy,
  });
  const sessionState = buildTeamSessionState({
    runId: input.run.id,
    teamId: input.teamId,
    roomId: input.roomId,
    assistantId: input.assistantId,
    objective: executionInput.objective,
  });
  const teamPromptContext: UnifiedExecutionRequest = {
    channel: "team_room",
    userId: input.userId,
    tenantId: input.tenantId,
    userMessage: executionInput.objective,
    dynamicParams: {
      ...(executionInput.dynamicParams ?? {}),
      contextState: {
        ...(typeof executionInput.dynamicParams?.contextState === "object" &&
        executionInput.dynamicParams?.contextState
          ? (executionInput.dynamicParams.contextState as Record<string, unknown>)
          : {}),
        sessionState,
      },
    },
    teamContext: {
      assistantId: input.assistantId,
      roomId: input.roomId,
      teamId: input.teamId,
      runId: input.run.id,
      objective: executionInput.objective,
      initiatedByUserId: input.userId,
      currentMessage: executionInput.objective,
    },
  };
  let contextPack: ContextPack | null = null;

  // ── Unified Orchestrator Path (feature-flagged) ─────────────────
  let handledByUnified = false;
  try {
    const flags = await getTenantFeatureFlags(input.tenantId);
    if (flags.unifiedSkillExecution && !capabilityGapPreflight) {
      const request: UnifiedExecutionRequest = {
        ...teamPromptContext,
        routeHint: {
          selectedSkillId: routeInput.route.selectedSkillId,
          route: routeInput.route.route,
          reason: routeInput.route.reason,
        },
        creditMode: "calculate_only",
      };

      const result = await executeUnified(request);
      handledByUnified = true;

      // Check for orchestrator-level error results (all terminal failure reasons)
      const errorReasons = [
        "orchestrator_error",
        "skill_resolution_failed",
        "executor_not_found",
        "capability_not_allowed",
        "rate_limited",
      ];
      if (errorReasons.includes(result.route.reason)) {
        throw new Error(`Orchestrator error: ${result.route.reason}`);
      }

      if (isUnifiedMediaJobResult(result)) {
        const finalResult = await buildDirectMediaJobExecutionResult({
          executionInput,
          skill,
          result,
          routeInput,
        });

        if (plannerResult) {
          const finalModelId =
            typeof finalResult.metadata.llmModelId === "string" &&
            finalResult.metadata.llmModelId.trim()
              ? finalResult.metadata.llmModelId.trim()
              : (result.modelUsed ?? executionPolicy.modelId ?? "unknown");
          recordStepAttempt({
            taskRunId: plannerResult.taskRunId,
            plan: plannerResult.plan,
            model: finalModelId,
            provider: undefined,
            inputTokens: finalResult.inputTokens,
            outputTokens: finalResult.outputTokens,
            snapshot: plannerResult.snapshot,
            creditsUsed: finalResult.costCredits,
          }).catch(() => {});
        }

        return finalResult;
      }

      if (result.metadata?.success === false) {
        const finalResult = buildUnifiedExecutionFailureResult({
          skill,
          result,
          routeInput,
        });

        if (plannerResult) {
          recordStepAttempt({
            taskRunId: plannerResult.taskRunId,
            plan: plannerResult.plan,
            model: result.modelUsed ?? executionPolicy.modelId ?? "unknown",
            provider: undefined,
            inputTokens: finalResult.inputTokens,
            outputTokens: finalResult.outputTokens,
            snapshot: plannerResult.snapshot,
            creditsUsed: finalResult.costCredits,
          }).catch(() => {});
        }

        return finalResult;
      }

      const primaryResult: TeamRunSkillExecutionResult = {
        content: result.result.type === "text" ? result.result.content : "",
        inputTokens: result.tokens.input,
        outputTokens: result.tokens.output,
        costCredits: result.costCredits,
        metadata: {
          unifiedPath: true,
          route: result.route.capability,
          routeReason: result.route.reason,
          selectedSkillId: result.skillId,
          selectedCapabilityId: routeInput.route.selectedCapabilityId ?? null,
          capabilityGapResolution: routeInput.route.capabilityGapResolution ?? null,
          nextSpeakerHint: result.nextSpeakerHint ?? null,
          attempts: result.telemetry.attempts,
          llmModelId: result.modelUsed,
        },
        skillId: result.skillId,
        nextSpeakerHint: result.nextSpeakerHint,
      };

      const finalResult = await maybeChainPromptSkillToMedia(
        executionInput,
        skill,
        primaryResult.content,
        {
          inputTokens: primaryResult.inputTokens,
          outputTokens: primaryResult.outputTokens,
          costCredits: primaryResult.costCredits,
          metadata: primaryResult.metadata,
          skillId: primaryResult.skillId,
          nextSpeakerHint: primaryResult.nextSpeakerHint,
          modelId: result.modelUsed,
          attempts: result.telemetry.attempts,
        }
      );

      if (plannerResult) {
        const finalModelId =
          typeof finalResult.metadata.llmModelId === "string" &&
          finalResult.metadata.llmModelId.trim()
            ? finalResult.metadata.llmModelId.trim()
            : (result.modelUsed ?? executionPolicy.modelId ?? "unknown");
        recordStepAttempt({
          taskRunId: plannerResult.taskRunId,
          plan: plannerResult.plan,
          model: finalModelId,
          provider: undefined,
          inputTokens: finalResult.inputTokens,
          outputTokens: finalResult.outputTokens,
          snapshot: plannerResult.snapshot,
          creditsUsed: finalResult.costCredits,
        }).catch(() => {});
      }

      return finalResult;
    }
  } catch (err) {
    if (handledByUnified) {
      // Orchestrator already committed (credits logged, audit emitted) — do NOT fall through
      // to legacy path, which would double-execute. Re-throw to surface the error.
      throw err;
    }
    // Orchestrator failed before committing — safe to fall through to legacy path
    console.error(
      "[teamRunSkillExecutor] Unified orchestrator failed, falling back:",
      err
    );
  }
  // ── END Unified Orchestrator Path ───────────────────────────────

  const contextAssemblyStartMs = Date.now();
  contextPack = await buildTeamExecutionContextPack(teamPromptContext, input.tenantId, {
    skillSystemPrompt: skill.systemPrompt
      ? skill.systemPrompt.substring(0, TEAM_SYSTEM_PROMPT_MAX_CHARS)
      : null,
    dynamicParams: executionInput.dynamicParams ?? null,
    label: `team:${input.teamId}/${input.roomId}`,
  });

  void recordContextEngineMetric({
    source: "team_run_legacy",
    surface: contextPack.surface,
    contextPack,
    tenantId: input.tenantId,
    teamId: input.teamId,
    userId: input.userId,
    roomId: input.roomId,
    runId: input.run.id,
    projectId:
      typeof executionInput.dynamicParams?.projectId === "string"
        ? executionInput.dynamicParams.projectId
        : null,
    skillId: skill.id,
    latencyMs: Date.now() - contextAssemblyStartMs,
  }).catch((err) => {
    console.warn("[teamRunSkillExecutor] context-engine metric failed:", err);
  });

  const messages = contextPack.messages;

  // Determine if web search should be enabled for this turn
  const requiresWebSearch =
    skill.executionPolicy?.requires_web_search === true ||
    skill.executionPolicy?.requirements?.supportsWebSearch === true ||
    executionInput.route.reason?.includes("web_search") ||
    false;

  let extraBodyParams: Record<string, unknown> | undefined;
  if (requiresWebSearch && executionPolicy.modelId) {
    try {
      // Resolve actual provider to inject correct web search tool format
      const provider = await getProviderForModel(executionPolicy.modelId, {
        preferredProviderId: executionPolicy.preferredProviderId ?? undefined,
        strictProviderPin: executionPolicy.strictProviderPin ?? undefined,
      });
      if (provider) {
        const family = detectProviderFamily(provider.providerName);
        const webParams = buildWebSearchParams(family);
        extraBodyParams = webParams.bodyParams;

        // Append web search instruction if provider doesn't support native tools
        if (
          webParams.systemPromptSuffix &&
          messages.length > 0 &&
          messages[0].role === "system"
        ) {
          messages[0] = {
            ...messages[0],
            content: messages[0].content + webParams.systemPromptSuffix,
          };
        }
      }
    } catch {
      // Provider resolution failed — proceed without web search (non-blocking)
    }
  }

  const runtimeTurn = await executeTeamRuntimeTurn({
    tenantId: input.tenantId,
    userId: input.userId,
    objective: executionInput.objective,
    skillSlug: skill.id,
    executionPolicy,
    contextPackRequest: {
      surface: "team_room",
      request: teamPromptContext,
      tenantId: input.tenantId,
      skillSystemPrompt: skill.systemPrompt
        ? skill.systemPrompt.substring(0, TEAM_SYSTEM_PROMPT_MAX_CHARS)
        : null,
      dynamicParams: executionInput.dynamicParams ?? null,
      label: `team:${input.teamId}/${input.roomId}`,
    },
    planContext: {
      nativeSkillRuntime: (() => {
        const skillRecord = skill as unknown as Record<string, unknown>;
        return buildNativeSkillRuntimePlanContext(
          {
            id: skill.id,
            slug: skill.id,
            folderPath: typeof skill.skillFilePath === "string" ? skill.skillFilePath : null,
            nativeBundlePath:
              typeof skillRecord.nativeBundlePath === "string"
                ? skillRecord.nativeBundlePath
                : typeof skillRecord.folderPath === "string"
                  ? skillRecord.folderPath
                  : null,
            nativeBundleReady: Boolean(skillRecord.nativeBundleReady),
          },
          {
            requestedSubagent:
              typeof executionInput.dynamicParams?.requestedSubagent === "string"
                ? executionInput.dynamicParams.requestedSubagent
                : null,
            taskHint: executionInput.objective,
          },
        );
      })(),
    },
    requestLabel: `team:${skill.id}`,
    roomId: input.roomId,
    runId: input.run.id,
    approvalGranted: capabilityGapPreflight ? false : true,
    allowedTools: capabilityGapPreflight ? [] : undefined,
    allowedAgents: capabilityGapPreflight ? [] : undefined,
    sideEffectKind: capabilityGapPreflight ? null : undefined,
    legacyExecute: () =>
      executeSkillLlmWithFallback({
        messages,
        skillSlug: skill.id,
        userId: input.userId,
        executionPolicy,
        enableThinking:
          skill.executionPolicy?.thinking_level_hint === "high" ||
          skill.executionPolicy?.thinking_level_hint === "medium" ||
          undefined,
        extraBodyParams,
    }),
  });

  const fallback = runtimeTurn.value;
  const runtimeMetadata = {
    runtimeEngine: runtimeTurn.runtime.selection.engine,
    runtimeMode: runtimeTurn.runtime.selection.mode,
    runtimeSelectionReason: runtimeTurn.runtime.selection.selectionReason,
    runtimeTraceId: runtimeTurn.runtime.traceId ?? null,
    runtimeSdkVersion: runtimeTurn.runtimeResponse?.sdkVersion ?? null,
    runtimeAdapterVersion: runtimeTurn.runtimeResponse?.adapterVersion ?? null,
    runtimeSelectedSkillSlug: runtimeTurn.runtime.selectedSkillSlug ?? null,
    runtimeStatus: runtimeTurn.runtime.status,
    runtimeCheckpointId: runtimeTurn.runtimeResponse?.checkpoint?.checkpointId ?? null,
    runtimeCheckpointStatus: runtimeTurn.runtimeResponse?.checkpoint?.status ?? null,
    runtimeResumeCursor: runtimeTurn.runtimeResponse?.checkpoint?.resumeCursor ?? null,
    runtimeArtifactRefs:
      runtimeTurn.runtimeResponse?.artifacts
        ?.map(artifact => artifact.contentRef ?? artifact.artifactId)
        .filter((value): value is string => typeof value === "string" && value.length > 0) ?? [],
    requestedSubagent:
      typeof executionInput.dynamicParams?.requestedSubagent === "string"
        ? executionInput.dynamicParams.requestedSubagent
        : null,
    subagentTopology: summarizeNativeBundleTopology(skill),
  };

  if (!fallback.success) {
    throw new Error(fallback.error || `Skill execution failed for ${skill.id}`);
  }

  const rawContent = fallback.content ?? "";
  const { cleaned, hint: nextSpeakerHint } = parseNextSpeakerHint(rawContent);

  const costCredits = await calculateCreditsForLLMDynamic(
    fallback.inputTokens ?? 0,
    fallback.outputTokens ?? 0,
    fallback.modelId ?? executionPolicy.modelId ?? "unknown"
  );

  const baseResult: TeamRunSkillExecutionResult = {
    content: cleaned,
    inputTokens: fallback.inputTokens ?? 0,
    outputTokens: fallback.outputTokens ?? 0,
    costCredits,
    metadata: {
      route: "skill",
      routeReason: routeInput.route.reason,
      selectedSkillId: skill.id,
      selectedCapabilityId: routeInput.route.selectedCapabilityId ?? null,
      capabilityGapResolution: routeInput.route.capabilityGapResolution ?? null,
      capabilityGapPreflight,
      nextSpeakerHint: nextSpeakerHint ?? null,
      contextEngine: contextPack
        ? {
            summary: summarizeContextPack(contextPack),
            surface: contextPack.surface,
            intent: contextPack.intent,
            budgetProfile: contextPack.budgetProfile,
            estimatedTokens: contextPack.estimatedTokens,
            tokenHeadroom: contextPack.compaction.tokenHeadroom,
            dedupedMessages: contextPack.compaction.dedupedMessages,
          }
        : null,
        planner: plannerResult
        ? {
            taskRunId: plannerResult.taskRunId,
            resolvedModel: plannerResult.resolvedModel,
          }
        : null,
      runtimeMetadata,
      llmModelId: fallback.modelId ?? executionPolicy.modelId ?? null,
      attempts: fallback.attempts,
    },
    skillId: skill.id,
    nextSpeakerHint,
  };

  const finalResult = await maybeChainPromptSkillToMedia(
    executionInput,
    skill,
    cleaned,
    {
      inputTokens: baseResult.inputTokens,
      outputTokens: baseResult.outputTokens,
      costCredits: baseResult.costCredits,
      metadata: baseResult.metadata,
      skillId: baseResult.skillId,
      nextSpeakerHint: baseResult.nextSpeakerHint,
      modelId: fallback.modelId ?? executionPolicy.modelId ?? null,
      attempts: fallback.attempts,
    }
  );
  const policyCheckedResult = enforceCapabilityGapSkillStudioPolicy(
    finalResult,
    routeInput.route.capabilityGapResolution,
  );

  if (plannerResult) {
    const finalModelId =
      typeof policyCheckedResult.metadata.llmModelId === "string" &&
      policyCheckedResult.metadata.llmModelId.trim()
        ? policyCheckedResult.metadata.llmModelId.trim()
        : (fallback.modelId ?? executionPolicy.modelId ?? "unknown");
    recordStepAttempt({
      taskRunId: plannerResult.taskRunId,
      plan: plannerResult.plan,
      model: finalModelId,
      provider: fallback.provider?.providerName,
      inputTokens: policyCheckedResult.inputTokens,
      outputTokens: policyCheckedResult.outputTokens,
      snapshot: plannerResult.snapshot,
      creditsUsed: policyCheckedResult.costCredits,
    }).catch(() => {});
  }

  return policyCheckedResult;
}

async function resolveTeamOrchestratorRoute(
  input: TeamRunSkillExecutionInput
): Promise<TeamRunSkillExecutionInput> {
  if (input.route.selectedSkillId !== TEAM_ORCHESTRATOR_SKILL_ID) {
    return input;
  }

  const userPrompt = input.objective.trim();
  if (!userPrompt) {
    return input;
  }

  const contextState =
    typeof input.dynamicParams?.contextState === "object" &&
    input.dynamicParams.contextState
      ? (input.dynamicParams.contextState as Record<string, unknown>)
      : null;
  const activePlanStep = extractAutoTeamPlanStepContext(contextState);
  const stepSpecificSkillId = activePlanStep
    ? selectAutoTeamPlanStepSkill(activePlanStep)
    : null;
  if (activePlanStep && shouldRoutePlanStepToAgency(activePlanStep)) {
    const selectedAgencyId = getExplicitPlanStepAgencyId(activePlanStep) ?? undefined;
    return {
      ...input,
      route: {
        ...input.route,
        route: "agency",
        reason: `auto_team_plan_surface:${activePlanStep.stepKey}`,
        selectedSkillId: TEAM_AGENCY_SWARM_ID,
        selectedAgencyId,
        selectedCapabilityId: activePlanStep.selectedCapabilityId ?? undefined,
      },
    };
  }
  if (
    activePlanStep &&
    shouldCreateSkillForCapabilityGap({
      activePlanStep,
      missingSkillId: null,
      routeAlreadyResolved: false,
      allowGenericSkillGap: false,
    })
  ) {
    const capabilityGapRoute = await buildCapabilityGapRoute(
      input,
      activePlanStep,
      null,
    );
    if (capabilityGapRoute) return capabilityGapRoute;
    throwMissingSkillCreatorForCapabilityGap(activePlanStep);
  }
  let missingExplicitSkillId: string | null = null;
  if (stepSpecificSkillId) {
    const skill = await getSkillByIdAsync(stepSpecificSkillId);
    if (skill) {
      return {
        ...input,
        route: {
          ...input.route,
          route: "skill",
          reason: `auto_team_plan_step:${activePlanStep?.stepKey ?? stepSpecificSkillId}`,
          selectedSkillId: stepSpecificSkillId,
          selectedCapabilityId: activePlanStep?.selectedCapabilityId ?? undefined,
        },
      };
    }
    if (activePlanStep && getExplicitPlanStepSkillId(activePlanStep) === stepSpecificSkillId) {
      missingExplicitSkillId = stepSpecificSkillId;
    }
  }
  if (
    activePlanStep &&
    shouldCreateSkillForCapabilityGap({
      activePlanStep,
      missingSkillId: missingExplicitSkillId,
      routeAlreadyResolved: false,
      allowGenericSkillGap: false,
    })
  ) {
    const capabilityGapRoute = await buildCapabilityGapRoute(
      input,
      activePlanStep,
      missingExplicitSkillId
    );
    if (capabilityGapRoute) return capabilityGapRoute;
    throwMissingSkillCreatorForCapabilityGap(activePlanStep);
  }

  const normalizedPrompt = userPrompt.toLowerCase();
  const wantsImage = isImageObjective(normalizedPrompt);
  const wantsVideo = isVideoObjective(normalizedPrompt);
  const wantsStoryboard = isStoryboardObjective(normalizedPrompt);

  try {
    const intentRoute = await routeRoomIntent({
      message: userPrompt,
      origin: "assistant",
      context: "run_turn",
      userId: input.userId,
      tenantId: input.tenantId,
      roomId: input.roomId,
      teamId: input.teamId,
      assistantId: input.assistantId,
    });
    if (intentRoute.route === "agency" || intentRoute.route === "hybrid") {
      return {
        ...input,
        route: {
          ...input.route,
          route: "agency",
          reason: `auto_team_orchestrator_agency:${intentRoute.reason}`,
          selectedSkillId: TEAM_AGENCY_SWARM_ID,
        },
      };
    }
  } catch {
    // Continue to media and skill-specific routing below.
  }

  if (wantsImage) {
    for (const skillId of AUTO_TEAM_IMAGE_SKILL_IDS) {
      const skill = await getSkillByIdAsync(skillId);
      if (skill) {
        return {
          ...input,
          route: {
            ...input.route,
            route: "skill",
            reason: `auto_team_image:${skillId}`,
            selectedSkillId: skillId,
          },
        };
      }
    }
  }

  if (wantsVideo) {
    const orderedVideoSkillIds = wantsStoryboard
      ? [
          "video-storyboard-to-prompts",
          "video-prompt-engineer",
          "cinematic-video-createprompt",
        ]
      : AUTO_TEAM_VIDEO_SKILL_IDS;

    for (const skillId of orderedVideoSkillIds) {
      const skill = await getSkillByIdAsync(skillId);
      if (skill) {
        return {
          ...input,
          route: {
            ...input.route,
            route: "skill",
            reason: `auto_team_video:${skillId}`,
            selectedSkillId: skillId,
          },
        };
      }
    }
  }

  try {
    const classification = await classifyIntent(
      userPrompt,
      input.userId,
      input.tenantId,
      undefined,
      undefined,
      { hasImages: false }
    );

    const bestMatch = classification?.skills?.[0];
    if (classification?.level === "complex") {
      return {
        ...input,
        route: {
          ...input.route,
          route: "agency",
          reason: `auto_team_orchestrator_complex:${classification.strategy}`,
          selectedSkillId: TEAM_AGENCY_SWARM_ID,
        },
      };
    }
    if (bestMatch && bestMatch.confidence >= 0.5 && bestMatch.skillId) {
      return {
        ...input,
        route: {
          ...input.route,
          route: "skill",
          reason: `auto_team_orchestrator:${bestMatch.skillId}`,
          selectedSkillId: bestMatch.skillId,
        },
      };
    }
  } catch {
    // Fall through to room intent fallback below.
  }

  try {
    const fallbackRoute = await routeRoomIntent({
      message: userPrompt,
      origin: "assistant",
      context: "run_turn",
      userId: input.userId,
      tenantId: input.tenantId,
      roomId: input.roomId,
      teamId: input.teamId,
      assistantId: input.assistantId,
    });

    if (fallbackRoute.selectedSkillId) {
      return {
        ...input,
        route: {
          ...input.route,
          route: fallbackRoute.route,
          reason: `auto_team_orchestrator_fallback:${fallbackRoute.reason}`,
          selectedSkillId: fallbackRoute.selectedSkillId,
        },
      };
    }
  } catch {
    // Keep the original route if both classification and fallback routing fail.
  }

  if (
    activePlanStep &&
    shouldCreateSkillForCapabilityGap({
      activePlanStep,
      missingSkillId: missingExplicitSkillId,
      routeAlreadyResolved: false,
      allowGenericSkillGap: true,
    })
  ) {
    const capabilityGapRoute = await buildCapabilityGapRoute(
      input,
      activePlanStep,
      missingExplicitSkillId
    );
    if (capabilityGapRoute) return capabilityGapRoute;
    throwMissingSkillCreatorForCapabilityGap(activePlanStep);
  }

  return input;
}
