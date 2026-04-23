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
import { parseNextSpeakerHint } from "./executors/textSkillExecutor";
import { normalizeMediaPrompt } from "./mediaPromptNormalization";
import { executeTeamRuntimeTurn } from "./agentRuntime/teamRuntimeOrchestrator";
import { parsePromptResponse } from "./promptEnhancementService";
import {
  buildTeamExecutionContextPack,
  summarizeContextPack,
  type ContextPack,
} from "./contextEngineAdapter";
import { recordContextEngineMetric } from "./monitoringService";
import type { UnifiedExecutionRequest } from "./executors/types";
import type { TeamRun } from "../../drizzle/schema";
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
  if (!team?.agencyId) {
    throw new Error(`Team ${input.teamId} has no agency mapping`);
  }

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
    agencyId: team.agencyId,
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
      agencyId: team.agencyId,
      agencyRunId: agencyResult.runId,
      hybridSummary: agencyResult.hybridSummary,
      structuredResult: agencyResult.structuredResult,
      previewArtifacts: agencyResult.previewArtifacts,
      nextSpeakerHint: null,
      llmModelId: "agency",
    },
    skillId: TEAM_AGENCY_SWARM_ID,
  };
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
  };
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
  if (step.selectedCapabilityId) {
    return step.selectedCapabilityId;
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
  const mediaLabel = input.mediaType === "image" ? "image" : "video";
  const pieces = [
    `${input.mediaSkillName} finished ${mediaLabel} generation.`,
    `Prompt skill: ${input.promptSkillId}.`,
    taskId ? `Task: ${taskId}.` : null,
    resultUrl ? `Result: ${resultUrl}.` : null,
    input.promptText ? `Prompt: ${input.promptText}` : null,
  ].filter(Boolean);
  return pieces.join(" ");
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
  const mediaResult = await executeUnified({
    channel: "team_room",
    userId: input.userId,
    tenantId: input.tenantId,
    userMessage: prompt,
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
      prompt,
      ...extraParams,
      __autoTeamPromptSkillId: skill.id,
      __autoTeamPromptChainFrom: skill.id,
    },
  });

  if (mediaResult.result.type !== "media_job") {
    throw new Error(
      `Media chain for '${skill.id}' -> '${chainTarget.id}' did not produce a media job`
    );
  }

  const combinedCost = promptResult.costCredits + mediaResult.costCredits;
  const combinedInputTokens =
    promptResult.inputTokens + mediaResult.tokens.input;
  const combinedOutputTokens =
    promptResult.outputTokens + mediaResult.tokens.output;
  const summary = summarizeMediaExecutionResult({
    promptSkillId: skill.id,
    mediaSkillId: mediaResult.skillId,
    mediaSkillName: chainTarget.name,
    mediaType: mediaResult.result.mediaType,
    mediaResult,
    promptText: prompt,
  });

  return {
    content: summary,
    inputTokens: combinedInputTokens,
    outputTokens: combinedOutputTokens,
    costCredits: combinedCost,
    metadata: {
      ...promptResult.metadata,
      mediaChain: {
        promptSkillId: skill.id,
        mediaSkillId: mediaResult.skillId,
        mediaSkillName: chainTarget.name,
        mediaType: mediaResult.result.mediaType,
        mediaRoute: mediaResult.route,
        mediaMetadata: mediaResult.metadata,
        promptText: prompt,
      },
      selectedSkillId: mediaResult.skillId,
      promptSkillId: skill.id,
      nextSpeakerHint:
        mediaResult.nextSpeakerHint ?? promptResult.nextSpeakerHint ?? null,
      mediaJob: mediaResult.result,
      llmModelId: mediaResult.modelUsed ?? promptResult.modelId ?? null,
      attempts: promptResult.attempts ?? [],
    },
    skillId: mediaResult.skillId,
    nextSpeakerHint:
      mediaResult.nextSpeakerHint ?? promptResult.nextSpeakerHint,
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
    return executeAgencySwarmTurn(input, routeInput.route.reason);
  }
  const skill = await resolveTeamRunSkill(routeInput.route.selectedSkillId);
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
    objective: input.objective,
  });
  const teamPromptContext: UnifiedExecutionRequest = {
    channel: "team_room",
    userId: input.userId,
    tenantId: input.tenantId,
    userMessage: input.objective,
    dynamicParams: {
      ...(input.dynamicParams ?? {}),
      contextState: {
        ...(typeof input.dynamicParams?.contextState === "object" &&
        input.dynamicParams?.contextState
          ? (input.dynamicParams.contextState as Record<string, unknown>)
          : {}),
        sessionState,
      },
    },
    teamContext: {
      assistantId: input.assistantId,
      roomId: input.roomId,
      teamId: input.teamId,
      runId: input.run.id,
      objective: input.objective,
      initiatedByUserId: input.userId,
      currentMessage: input.objective,
    },
  };
  let contextPack: ContextPack | null = null;

  // ── Unified Orchestrator Path (feature-flagged) ─────────────────
  let handledByUnified = false;
  try {
    const flags = await getTenantFeatureFlags(input.tenantId);
    if (flags.unifiedSkillExecution) {
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
          nextSpeakerHint: result.nextSpeakerHint ?? null,
          attempts: result.telemetry.attempts,
          llmModelId: result.modelUsed,
        },
        skillId: result.skillId,
        nextSpeakerHint: result.nextSpeakerHint,
      };

      const finalResult = await maybeChainPromptSkillToMedia(
        input,
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
    dynamicParams: input.dynamicParams ?? null,
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
      typeof input.dynamicParams?.projectId === "string"
        ? input.dynamicParams.projectId
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
    input.route.reason?.includes("web_search") ||
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
    objective: input.objective,
    skillSlug: skill.id,
    executionPolicy,
    contextPackRequest: {
      surface: "team_room",
      request: teamPromptContext,
      tenantId: input.tenantId,
      skillSystemPrompt: skill.systemPrompt
        ? skill.systemPrompt.substring(0, TEAM_SYSTEM_PROMPT_MAX_CHARS)
        : null,
      dynamicParams: input.dynamicParams ?? null,
      label: `team:${input.teamId}/${input.roomId}`,
    },
    requestLabel: `team:${skill.id}`,
    roomId: input.roomId,
    runId: input.run.id,
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
    input,
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

  if (plannerResult) {
    const finalModelId =
      typeof finalResult.metadata.llmModelId === "string" &&
      finalResult.metadata.llmModelId.trim()
        ? finalResult.metadata.llmModelId.trim()
        : (fallback.modelId ?? executionPolicy.modelId ?? "unknown");
    recordStepAttempt({
      taskRunId: plannerResult.taskRunId,
      plan: plannerResult.plan,
      model: finalModelId,
      provider: fallback.provider?.providerName,
      inputTokens: finalResult.inputTokens,
      outputTokens: finalResult.outputTokens,
      snapshot: plannerResult.snapshot,
      creditsUsed: finalResult.costCredits,
    }).catch(() => {});
  }

  return finalResult;
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
  if (activePlanStep?.surface === "agency") {
    return {
      ...input,
      route: {
        ...input.route,
        route: "agency",
        reason: `auto_team_plan_surface:${activePlanStep.stepKey}`,
        selectedSkillId: TEAM_AGENCY_SWARM_ID,
      },
    };
  }
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
        },
      };
    }
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

  return input;
}
