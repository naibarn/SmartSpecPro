import { TRPCError } from "@trpc/server";

import { agencyBridge } from "./agencyBridge";
import { createLibraryItem } from "./libraryService";
import { mediaGenerationService } from "./mediaGenerationService";
import { executeAutomationCopilotTask } from "./automationCopilotExecutionService";
import { createPresentationDeckForLibraryItem } from "./presentationService";
import { executeSkill } from "./skillExecutor";
import { getSkillByIdAsync } from "./skillRegistry";
import * as automationFabricService from "./workAutomationFabricService";
import {
  claimBrowserAutomationTask,
  getBrowserAutomationTaskClaimByTaskId,
  updateBrowserAutomationTaskClaim,
} from "./workAutomationBrowserTaskService";
import {
  resolveAutomationLaunchPolicy,
  resolveAutomationStepRoute,
  type WorkAutomationLaunchPolicy,
  type WorkAutomationSurface,
} from "./workAutomationPolicyService";
import { getWorkCaseProjection } from "./workOsService";
import type {
  WorkAutomationRun,
  WorkAutomationRunCheckpoint,
  WorkAutomationRunStep,
} from "../../drizzle/schema";

const DEFAULT_CONTENT_SKILL_ID = "general-article-writer";
const AUTOMATION_STEP_IDEMPOTENCY_CACHE = new Map<string, ExecuteAutomationStepResult>();
const SUPPORTED_REPLAY_ADAPTER_KINDS = new Set<ExecuteAutomationStepResult["adapterKind"]>([
  "browser",
  "skill",
  "agency",
  "document",
  "media",
  "video",
  "manual",
  "work_os",
]);

type WorkAutomationExecutionStatus = "succeeded" | "failed" | "awaiting_approval";

export interface ExecuteAutomationStepInput {
  tenantId: string;
  caseId: string;
  runId: string;
  stepKey: string;
  stepIndex: number;
  title: string;
  objective?: string | null;
  prompt?: string | null;
  requestedSurface?: WorkAutomationSurface | null;
  approvalState?: "pending" | "approved" | "rejected" | "not_required" | null;
  idempotencyKey?: string | null;
  inputRefsJson?: string[];
  skillId?: string | null;
  agencyId?: string | null;
  agencyConversationId?: string | null;
  agencyRecipientAgent?: string | null;
  agencyAdditionalInstructions?: string | null;
  libraryItemType?: string | null;
  librarySource?: string | null;
  libraryTitle?: string | null;
  mediaModel?: string | null;
  videoModel?: string | null;
  aspectRatio?: string | null;
  size?: string | null;
  duration?: number | null;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  publicUrl?: string | null;
  userToken: string;
  actorUserId: number;
  actorAssistantId?: string | null;
}

export interface ExecuteAutomationStepResult {
  run: WorkAutomationRun;
  step: WorkAutomationRunStep;
  checkpoint: WorkAutomationRunCheckpoint | null;
  surface: WorkAutomationSurface;
  outputRefsJson: string[];
  adapterKind: "browser" | "skill" | "agency" | "document" | "media" | "video" | "manual" | "work_os";
  adapterDetail: Record<string, unknown>;
  libraryItemId: number | null;
  deckId: number | null;
  agencyRunId: string | null;
  skillId: string | null;
}

interface StepExecutionContext {
  tenantId: string;
  caseId: string;
  runId: string;
  stepKey: string;
  stepIndex: number;
  title: string;
  objective: string | null;
  prompt: string;
  route: ReturnType<typeof resolveAutomationStepRoute>;
  policy: WorkAutomationLaunchPolicy;
  actorUserId: number;
  actorAssistantId?: string | null;
  userToken: string;
  publicUrl?: string | null;
  idempotencyKey?: string | null;
  inputRefsJson?: string[];
  skillId?: string | null;
  agencyId?: string | null;
  agencyConversationId?: string | null;
  agencyRecipientAgent?: string | null;
  agencyAdditionalInstructions?: string | null;
  libraryItemType?: string | null;
  librarySource?: string | null;
  libraryTitle?: string | null;
  mediaModel?: string | null;
  videoModel?: string | null;
  aspectRatio?: string | null;
  size?: string | null;
  duration?: number | null;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function defaultSkillIdForStep(stepKey: string): string {
  switch (stepKey) {
    case "brief":
    case "draft":
    case "storyboard":
    case "export":
      return DEFAULT_CONTENT_SKILL_ID;
    default:
      return DEFAULT_CONTENT_SKILL_ID;
  }
}

function buildAutomationArtifactMetadata(input: {
  tenantId: string;
  caseId: string;
  runId: string;
  stepKey: string;
  routeSurface: WorkAutomationSurface;
  policy: WorkAutomationLaunchPolicy;
  adapterKind: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    workAutomation: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      runId: input.runId,
      stepKey: input.stepKey,
      routeSurface: input.routeSurface,
      templateKey: input.policy.templateKey,
      templateFamily: input.policy.templateFamily,
      templateVersion: input.policy.templateVersion,
      templateSource: input.policy.templateSource,
      adapterKind: input.adapterKind,
    },
    ...(input.extra ?? {}),
  };
}

function buildExecutionPrompt(context: StepExecutionContext): string {
  return normalizeText(context.prompt)
    || normalizeText(context.objective)
    || context.title;
}

function buildOutputRef(prefix: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? `${prefix}:${normalized}` : null;
}

function parseOutputRefValue(outputRefs: string[], prefix: string): string | null {
  const match = outputRefs.find((ref) => ref.startsWith(`${prefix}:`));
  if (!match) {
    return null;
  }
  return match.slice(prefix.length + 1).trim() || null;
}

function parseNumericOutputRefValue(outputRefs: string[], prefix: string): number | null {
  const raw = parseOutputRefValue(outputRefs, prefix);
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReplayAdapterKind(value: unknown): ExecuteAutomationStepResult["adapterKind"] {
  if (typeof value === "string" && SUPPORTED_REPLAY_ADAPTER_KINDS.has(value as ExecuteAutomationStepResult["adapterKind"])) {
    return value as ExecuteAutomationStepResult["adapterKind"];
  }
  return "work_os";
}

function buildIdempotencyCacheKey(input: Pick<ExecuteAutomationStepInput, "tenantId" | "runId" | "stepKey" | "idempotencyKey">): string | null {
  const idempotencyKey = normalizeText(input.idempotencyKey);
  if (!idempotencyKey) {
    return null;
  }
  return `${input.tenantId}:${input.runId}:${input.stepKey}:${idempotencyKey}`;
}

function browserTaskIdForStep(input: Pick<ExecuteAutomationStepInput, "runId" | "stepKey">): string {
  return `${input.runId}:${input.stepKey}`;
}

function buildReplayResultFromExistingStep(
  existingStep: WorkAutomationRunStep,
  run: WorkAutomationRun,
  checkpoint: WorkAutomationRunCheckpoint | null,
): ExecuteAutomationStepResult {
  const detailJson = (existingStep.detailJson && typeof existingStep.detailJson === "object")
    ? existingStep.detailJson as Record<string, unknown>
    : {};
  const adapterDetail = (detailJson.adapterDetail && typeof detailJson.adapterDetail === "object")
    ? detailJson.adapterDetail as Record<string, unknown>
    : {
        idempotentReplay: true,
        stepId: existingStep.id,
      };
  const adapterKind = parseReplayAdapterKind(detailJson.adapterKind);
  const outputRefsJson = existingStep.outputRefsJson ?? [];

  return {
    run,
    step: existingStep,
    checkpoint,
    surface: existingStep.surface,
    outputRefsJson,
    adapterKind,
    adapterDetail,
    libraryItemId: parseNumericOutputRefValue(outputRefsJson, "library-item"),
    deckId: parseNumericOutputRefValue(outputRefsJson, "presentation-deck"),
    agencyRunId: parseOutputRefValue(outputRefsJson, "agency-run"),
    skillId: parseOutputRefValue(outputRefsJson, "skill"),
  };
}

function buildActor(tenantId: string, actorUserId: number): { userId: number; tenantId: string; role: string } {
  return {
    userId: actorUserId,
    tenantId,
    role: "domain_admin",
  };
}

async function loadPolicyProjection(input: ExecuteAutomationStepInput): Promise<{
  projection: Awaited<ReturnType<typeof getWorkCaseProjection>>;
  runProjection: Awaited<ReturnType<typeof automationFabricService.getAutomationRunProjection>>;
  policy: WorkAutomationLaunchPolicy;
  route: ReturnType<typeof resolveAutomationStepRoute>;
}> {
  const projection = await getWorkCaseProjection(input.caseId, input.tenantId);
  const runProjection = await automationFabricService.getAutomationRunProjection(input.runId, input.tenantId);
  if (runProjection.run.caseId !== input.caseId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Automation run ${input.runId} does not belong to case ${input.caseId}`,
    });
  }

  const policy = resolveAutomationLaunchPolicy({
    caseRecord: projection.case,
    requestRecord: projection.request,
    templateKey: runProjection.run.templateKey,
    templateVersion: runProjection.run.templateVersion ?? null,
    mode: runProjection.run.currentMode,
  });
  const route = resolveAutomationStepRoute({
    stepKey: input.stepKey,
    policy,
    requestedSurface: input.requestedSurface ?? null,
  });
  return { projection, runProjection, policy, route };
}

async function recordAwaitingApprovalStep(
  context: StepExecutionContext,
  route: ReturnType<typeof resolveAutomationStepRoute>,
  checkpoint: WorkAutomationRunCheckpoint | null,
  reason: string,
  cacheKey: string | null,
): Promise<ExecuteAutomationStepResult> {
  const stepResult = await automationFabricService.recordAutomationRunStepProgress({
    tenantId: context.tenantId,
    caseId: context.caseId,
    runId: context.runId,
    stepKey: context.stepKey,
    stepIndex: context.stepIndex,
    title: context.title,
    status: "awaiting_approval",
    surface: route.surface,
    inputRefsJson: context.inputRefsJson ?? [],
    outputRefsJson: checkpoint ? [buildOutputRef("automation-checkpoint", checkpoint.id)].filter(Boolean) as string[] : [],
    idempotencyKey: context.idempotencyKey ?? null,
    summary: reason,
    detailJson: {
      adapterKind: "manual",
      reason,
      checkpointId: checkpoint?.id ?? null,
      checkpointKey: checkpoint?.checkpointKey ?? null,
      route: {
        stepKey: route.stepKey,
        surface: route.surface,
        checkpointKey: route.checkpointKey,
        requiresApproval: route.requiresApproval,
      },
    },
    runStatus: "waiting_for_approval",
    createdByUserId: context.actorUserId,
    createdByAssistantId: context.actorAssistantId ?? null,
  });

  const result: ExecuteAutomationStepResult = {
    run: stepResult.run,
    step: stepResult.step,
    checkpoint,
    surface: route.surface,
    outputRefsJson: checkpoint ? [buildOutputRef("automation-checkpoint", checkpoint.id)].filter(Boolean) as string[] : [],
    adapterKind: "manual",
    adapterDetail: {
      reason,
      checkpointId: checkpoint?.id ?? null,
      checkpointKey: checkpoint?.checkpointKey ?? null,
    },
    libraryItemId: null,
    deckId: null,
    agencyRunId: null,
    skillId: null,
  };
  if (cacheKey) {
    AUTOMATION_STEP_IDEMPOTENCY_CACHE.set(cacheKey, result);
  }
  return result;
}

async function executeSkillStep(context: StepExecutionContext, policy: WorkAutomationLaunchPolicy): Promise<Omit<ExecuteAutomationStepResult, "run" | "step" | "checkpoint">> {
  const resolvedSkillId = normalizeText(context.skillId) || defaultSkillIdForStep(context.stepKey);
  const skill = await getSkillByIdAsync(resolvedSkillId) ?? await getSkillByIdAsync(DEFAULT_CONTENT_SKILL_ID);
  if (!skill) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Skill not found: ${resolvedSkillId}` });
  }

  const result = await executeSkill(
    skill,
    {
      prompt: buildExecutionPrompt(context),
      conversationId: `${context.runId}:${context.stepKey}`,
      extraParams: {
        caseId: context.caseId,
        runId: context.runId,
        stepKey: context.stepKey,
        templateKey: policy.templateKey,
        templateFamily: policy.templateFamily,
        routeSurface: context.route.surface,
      },
    },
    context.actorUserId,
    context.userToken,
    context.tenantId,
  );

  const text = normalizeText(result.message ?? result.error ?? result.resultUrl ?? "");
  const item = await createLibraryItem({
    itemType: result.type === "image" || result.type === "video" || result.type === "audio" ? result.type : "document",
    source: "work_automation_skill",
    title: context.title,
    description: text || buildExecutionPrompt(context),
    status: "ready",
    visibility: "private",
    metadata: buildAutomationArtifactMetadata({
      tenantId: context.tenantId,
      caseId: context.caseId,
      runId: context.runId,
      stepKey: context.stepKey,
      routeSurface: context.route.surface,
      policy,
      adapterKind: "skill",
      extra: {
        skillId: skill.id,
        executionMode: skill.executionMode ?? null,
        resultType: result.type,
        result: {
          success: result.success,
          creditsUsed: result.creditsUsed ?? 0,
          taskId: result.taskId ?? null,
          isAsync: result.isAsync ?? false,
        },
      },
    }),
    sourceLink: {
      linkType: "work_automation_step",
      linkId: `${context.runId}:${context.stepKey}`,
      providerTaskId: result.taskId ?? null,
    },
  }, buildActor(context.tenantId, context.actorUserId));

  const outputRefs = [
    buildOutputRef("library-item", item.item.id),
    buildOutputRef("skill", skill.id),
  ].filter(Boolean) as string[];

  return {
    surface: context.route.surface,
    outputRefsJson: outputRefs,
    adapterKind: "skill",
    adapterDetail: {
      skillId: skill.id,
      resultType: result.type,
      success: result.success,
      creditsUsed: result.creditsUsed ?? 0,
    },
    libraryItemId: item.item.id,
    deckId: null,
    agencyRunId: null,
    skillId: skill.id,
  };
}

async function executeAgencyStep(context: StepExecutionContext, policy: WorkAutomationLaunchPolicy): Promise<Omit<ExecuteAutomationStepResult, "run" | "step" | "checkpoint">> {
  const agencyId = normalizeText(context.agencyId);
  if (!agencyId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Agency step ${context.stepKey} requires an agencyId`,
    });
  }

  const result = await agencyBridge.executeRun({
    agencyId,
    conversationId: normalizeText(context.agencyConversationId) || `${context.runId}:${context.stepKey}`,
    message: normalizeText(context.prompt) || normalizeText(context.objective) || context.title,
    userToken: context.userToken,
    tenantId: context.tenantId,
    userId: context.actorUserId,
    taskMetadata: {
      source: "work_automation",
      caseId: context.caseId,
      runId: context.runId,
      stepKey: context.stepKey,
      templateKey: policy.templateKey,
      templateFamily: policy.templateFamily,
    } as any,
    recipientAgent: normalizeText(context.agencyRecipientAgent) || undefined,
    additionalInstructions: normalizeText(context.agencyAdditionalInstructions) || undefined,
  });

  const item = await createLibraryItem({
    itemType: "document",
    source: "work_automation_agency",
    title: context.title,
    description: normalizeText(result.response) || normalizeText(context.objective) || context.title,
    status: "ready",
    visibility: "private",
    metadata: buildAutomationArtifactMetadata({
      tenantId: context.tenantId,
      caseId: context.caseId,
      runId: context.runId,
      stepKey: context.stepKey,
      routeSurface: context.route.surface,
      policy,
      adapterKind: "agency",
      extra: {
        agencyId,
        agencyRunId: result.runId,
        structuredResult: result.structuredResult,
        hybridSummary: result.hybridSummary,
        previewArtifacts: result.previewArtifacts,
      },
    }),
    sourceLink: {
      linkType: "work_automation_step",
      linkId: `${context.runId}:${context.stepKey}`,
      providerTaskId: result.runId,
    },
  }, buildActor(context.tenantId, context.actorUserId));

  const outputRefs = [
    buildOutputRef("library-item", item.item.id),
    buildOutputRef("agency-run", result.runId),
  ].filter(Boolean) as string[];

  return {
    surface: context.route.surface,
    outputRefsJson: outputRefs,
    adapterKind: "agency",
    adapterDetail: {
      agencyId,
      agencyRunId: result.runId,
      status: result.status,
      creditsUsed: result.creditsUsed,
    },
    libraryItemId: item.item.id,
    deckId: null,
    agencyRunId: result.runId,
    skillId: null,
  };
}

async function executeDocumentStep(context: StepExecutionContext, policy: WorkAutomationLaunchPolicy): Promise<Omit<ExecuteAutomationStepResult, "run" | "step" | "checkpoint">> {
  const libraryType = normalizeText(context.libraryItemType) || (context.stepKey === "storyboard" ? "presentation" : "document");
  const librarySource = normalizeText(context.librarySource) || "work_automation";
  const title = normalizeText(context.libraryTitle) || context.title;
  const description = normalizeText(context.prompt) || normalizeText(context.objective) || context.title;

  const item = await createLibraryItem({
    itemType: libraryType,
    source: librarySource,
    title,
    description,
    status: "ready",
    visibility: "private",
    metadata: buildAutomationArtifactMetadata({
      tenantId: context.tenantId,
      caseId: context.caseId,
      runId: context.runId,
      stepKey: context.stepKey,
      routeSurface: context.route.surface,
      policy,
      adapterKind: "document",
      extra: {
        source: librarySource,
        itemType: libraryType,
      },
    }),
    sourceLink: {
      linkType: "work_automation_step",
      linkId: `${context.runId}:${context.stepKey}`,
      providerTaskId: null,
    },
  }, buildActor(context.tenantId, context.actorUserId));

  let deckId: number | null = null;
  if (context.stepKey === "storyboard" || libraryType === "presentation") {
    const deck = await createPresentationDeckForLibraryItem({
      libraryItemId: item.item.id,
      title,
      description,
    }, buildActor(context.tenantId, context.actorUserId));
    deckId = deck.deck.id;
  }

  const outputRefs = [
    buildOutputRef("library-item", item.item.id),
    deckId ? buildOutputRef("presentation-deck", deckId) : null,
  ].filter(Boolean) as string[];

  return {
    surface: context.route.surface,
    outputRefsJson: outputRefs,
    adapterKind: "document",
    adapterDetail: {
      itemType: libraryType,
      librarySource,
      deckId,
    },
    libraryItemId: item.item.id,
    deckId,
    agencyRunId: null,
    skillId: null,
  };
}

async function executeMediaStep(context: StepExecutionContext, policy: WorkAutomationLaunchPolicy, mediaType: "image" | "video"): Promise<Omit<ExecuteAutomationStepResult, "run" | "step" | "checkpoint">> {
  const prompt = buildExecutionPrompt(context);
  const commonRequest = {
    prompt,
    model: mediaType === "image"
      ? normalizeText(context.mediaModel) || undefined
      : normalizeText(context.videoModel) || undefined,
    aspectRatio: normalizeText(context.aspectRatio) || undefined,
    publicUrl: context.publicUrl ?? undefined,
    referenceImageUrls: context.referenceImageUrls ?? undefined,
    auditContext: {
      userId: context.actorUserId,
      source: "work_automation",
      stepKey: context.stepKey,
      runId: context.runId,
      caseId: context.caseId,
    },
  } as const;

  const response = mediaType === "image"
    ? await mediaGenerationService.generateImage({
        ...commonRequest,
        size: normalizeText(context.size) || undefined,
      } as any, context.userToken)
    : await mediaGenerationService.generateVideo({
        ...commonRequest,
        duration: typeof context.duration === "number" ? context.duration : undefined,
        referenceVideoUrls: context.referenceVideoUrls ?? undefined,
      } as any, context.userToken);

  const firstResult = response.data[0] ?? null;
  const sourceUrl = firstResult?.url ?? null;
  const item = await createLibraryItem({
    itemType: mediaType,
    source: `work_automation_${mediaType}`,
    title: context.title,
    description: prompt,
    status: "ready",
    visibility: "private",
    metadata: buildAutomationArtifactMetadata({
      tenantId: context.tenantId,
      caseId: context.caseId,
      runId: context.runId,
      stepKey: context.stepKey,
      routeSurface: context.route.surface,
      policy,
      adapterKind: mediaType,
      extra: {
        mediaType,
        model: response.model,
        creditsUsed: response.creditsUsed,
        creditsBalance: response.creditsBalance,
        mediaResult: firstResult,
      },
    }),
    sourceUrl,
    thumbnailUrl: mediaType === "image" ? sourceUrl : null,
    sourceLink: {
      linkType: "work_automation_step",
      linkId: `${context.runId}:${context.stepKey}`,
      providerTaskId: firstResult?.id ?? null,
    },
  }, buildActor(context.tenantId, context.actorUserId));

  const outputRefs = [
    buildOutputRef("library-item", item.item.id),
    buildOutputRef(`media-${mediaType}`, firstResult?.id ?? null),
  ].filter(Boolean) as string[];

  return {
    surface: context.route.surface,
    outputRefsJson: outputRefs,
    adapterKind: mediaType === "image" ? "media" : "video",
    adapterDetail: {
      model: response.model,
      mediaType,
      taskId: firstResult?.id ?? null,
      sourceUrl,
    },
    libraryItemId: item.item.id,
    deckId: null,
    agencyRunId: null,
    skillId: null,
  };
}

async function executeBrowserStep(context: StepExecutionContext, policy: WorkAutomationLaunchPolicy): Promise<Omit<ExecuteAutomationStepResult, "run" | "step" | "checkpoint">> {
  const taskId = `${context.runId}:${context.stepKey}`;
  const executionId = `${context.runId}:${context.stepKey}:browser`;
  const intentJson = JSON.stringify({
    source: "work_automation",
    caseId: context.caseId,
    runId: context.runId,
    stepKey: context.stepKey,
    title: context.title,
    objective: context.objective,
    prompt: buildExecutionPrompt(context),
    templateKey: policy.templateKey,
    templateFamily: policy.templateFamily,
    requestedSurface: context.route.surface,
    inputRefsJson: context.inputRefsJson ?? [],
  });

  const result = await executeAutomationCopilotTask({
    tenantId: context.tenantId,
    userId: context.actorUserId,
    taskId,
    executionId,
    intentJson,
  });

  const outputRefs = [
    buildOutputRef("browser-task", result.taskId),
    buildOutputRef("browser-execution", result.executionId),
    buildOutputRef("browser-reservation", result.reservationId),
  ].filter(Boolean) as string[];

  return {
    surface: context.route.surface,
    outputRefsJson: outputRefs,
    adapterKind: "browser",
    adapterDetail: {
      taskId: result.taskId,
      executionId: result.executionId,
      reservationId: result.reservationId,
      queued: true,
    },
    libraryItemId: null,
    deckId: null,
    agencyRunId: null,
    skillId: null,
  };
}

export async function executeAutomationStep(input: ExecuteAutomationStepInput): Promise<ExecuteAutomationStepResult> {
  const { projection, runProjection, policy, route } = await loadPolicyProjection(input);
  const cacheKey = buildIdempotencyCacheKey(input);
  if (cacheKey && AUTOMATION_STEP_IDEMPOTENCY_CACHE.has(cacheKey)) {
    return AUTOMATION_STEP_IDEMPOTENCY_CACHE.get(cacheKey)!;
  }
  const requiresUserToken = route.surface === "skill"
    || route.surface === "agency"
    || route.surface === "media_studio"
    || route.surface === "video_editor";
  if (requiresUserToken && !normalizeText(input.userToken)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Automation step ${input.stepKey} on ${route.surface} requires a user token`,
    });
  }
  const existingStep = input.idempotencyKey
    ? runProjection.steps.find((step) => step.idempotencyKey === input.idempotencyKey && step.stepKey === input.stepKey)
    : null;
  if (existingStep) {
    const replayResult = buildReplayResultFromExistingStep(
      existingStep,
      runProjection.run,
      runProjection.checkpoints.find((checkpoint) => checkpoint.stepKey === input.stepKey) ?? null,
    );
    if (cacheKey) {
      AUTOMATION_STEP_IDEMPOTENCY_CACHE.set(cacheKey, replayResult);
    }
    return replayResult;
  }
  if (route.surface === "browser") {
    const browserTaskId = browserTaskIdForStep(input);
    const existingBrowserClaim = await getBrowserAutomationTaskClaimByTaskId(input.tenantId, browserTaskId);
    if (existingBrowserClaim) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Browser automation ${input.stepKey} is already ${existingBrowserClaim.status}`,
      });
    }
  }

  const executionContext: StepExecutionContext = {
    tenantId: input.tenantId,
    caseId: input.caseId,
    runId: input.runId,
    stepKey: input.stepKey,
    stepIndex: input.stepIndex,
    title: input.title,
    objective: normalizeText(input.objective),
    prompt: normalizeText(input.prompt) || normalizeText(input.objective) || projection.case.summary || projection.case.title,
    route,
    policy,
    actorUserId: input.actorUserId,
    actorAssistantId: input.actorAssistantId ?? null,
    userToken: input.userToken,
    publicUrl: input.publicUrl ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    inputRefsJson: input.inputRefsJson ?? [],
    skillId: input.skillId ?? null,
    agencyId: input.agencyId ?? null,
    agencyConversationId: input.agencyConversationId ?? null,
    agencyRecipientAgent: input.agencyRecipientAgent ?? null,
    agencyAdditionalInstructions: input.agencyAdditionalInstructions ?? null,
    libraryItemType: input.libraryItemType ?? null,
    librarySource: input.librarySource ?? null,
    libraryTitle: input.libraryTitle ?? null,
    mediaModel: input.mediaModel ?? null,
    videoModel: input.videoModel ?? null,
    aspectRatio: input.aspectRatio ?? null,
    size: input.size ?? null,
    duration: input.duration ?? null,
    referenceImageUrls: input.referenceImageUrls ?? [],
    referenceVideoUrls: input.referenceVideoUrls ?? [],
  };

  let checkpoint: ExecuteAutomationStepResult["checkpoint"] = null;
  let adapterResult: Omit<ExecuteAutomationStepResult, "run" | "step" | "checkpoint"> | null = null;
  let finalStatus: WorkAutomationExecutionStatus = "succeeded";
  let runStatus: "running" | "waiting_for_approval" | "waiting_for_input" | "completed" = "running";
  let summary = normalizeText(input.prompt) || normalizeText(input.objective) || input.title;
  let finalDisposition: string | null = null;
  let finalDispositionReason: string | null = null;
  let outputRefs: string[] = [];
  let browserQueued = false;

  try {
    if (route.requiresApproval || route.surface === "manual") {
      const checkpointRecord = await automationFabricService.recordAutomationCheckpoint({
        tenantId: input.tenantId,
        caseId: input.caseId,
        runId: input.runId,
        stepKey: input.stepKey,
        checkpointKey: route.checkpointKey ?? `${input.stepKey}-approval`,
        resumeCursor: `${input.runId}:${input.stepKey}`,
        approvalState: input.approvalState ?? "pending",
        checkpointStatus: input.approvalState === "approved" ? "approved" : "open",
        editSnapshotRefsJson: input.inputRefsJson ?? [],
        snapshotJson: {
          route: {
            stepKey: route.stepKey,
            surface: route.surface,
            checkpointKey: route.checkpointKey,
            requiresApproval: route.requiresApproval,
          },
          input: {
            prompt: executionContext.prompt,
            objective: executionContext.objective,
            title: executionContext.title,
          },
        },
        detailJson: {
          reason: route.requiresApproval ? "approval_required" : "manual_surface",
          surface: route.surface,
        },
        requestedByUserId: input.actorUserId,
        approvedByUserId: input.approvalState === "approved" ? input.actorUserId : null,
        actorAssistantId: input.actorAssistantId ?? null,
      });
      checkpoint = checkpointRecord.checkpoint;

      if (input.approvalState !== "approved" && route.surface === "manual") {
        finalStatus = "awaiting_approval";
        runStatus = "waiting_for_approval";
        summary = `Approval required for ${input.stepKey}`;
        return await recordAwaitingApprovalStep(
          executionContext,
          route,
          checkpoint,
          summary,
          cacheKey,
        );
      }

      if (input.approvalState !== "approved" && route.requiresApproval) {
        finalStatus = "awaiting_approval";
        runStatus = "waiting_for_approval";
        summary = `Approval required for ${input.stepKey}`;
        return await recordAwaitingApprovalStep(
          executionContext,
          route,
          checkpoint,
          summary,
          cacheKey,
        );
      }
    }

    if (route.surface === "manual") {
      adapterResult = {
        surface: route.surface,
        outputRefsJson: checkpoint ? [buildOutputRef("automation-checkpoint", checkpoint.id)].filter(Boolean) as string[] : [],
        adapterKind: "manual",
        adapterDetail: {
          approved: input.approvalState === "approved",
          checkpointId: checkpoint?.id ?? null,
          checkpointKey: checkpoint?.checkpointKey ?? null,
        },
        libraryItemId: null,
        deckId: null,
        agencyRunId: null,
        skillId: null,
      };
    } else if (route.surface === "skill") {
      adapterResult = await executeSkillStep(executionContext, policy);
    } else if (route.surface === "agency") {
      adapterResult = await executeAgencyStep(executionContext, policy);
    } else if (route.surface === "document_management") {
      adapterResult = await executeDocumentStep(executionContext, policy);
    } else if (route.surface === "media_studio") {
      adapterResult = await executeMediaStep(executionContext, policy, "image");
    } else if (route.surface === "video_editor") {
      adapterResult = await executeMediaStep(executionContext, policy, "video");
    } else if (route.surface === "browser") {
      const browserTaskId = browserTaskIdForStep(input);
      const browserExecutionId = `${input.runId}:${input.stepKey}:browser`;
      const browserClaim = await claimBrowserAutomationTask({
        tenantId: input.tenantId,
        caseId: input.caseId,
        runId: input.runId,
        stepKey: input.stepKey,
        stepIndex: input.stepIndex,
        title: input.title,
        idempotencyKey: input.idempotencyKey ?? null,
        taskId: browserTaskId,
        executionId: browserExecutionId,
        reservationId: null,
        inputRefsJson: input.inputRefsJson ?? [],
        detailJson: {
          source: "work_automation",
          caseId: input.caseId,
          runId: input.runId,
          stepKey: input.stepKey,
          title: input.title,
          objective: executionContext.objective,
          prompt: buildExecutionPrompt(executionContext),
          templateKey: policy.templateKey,
          templateFamily: policy.templateFamily,
          requestedSurface: route.surface,
        },
        createdByUserId: input.actorUserId,
        createdByAssistantId: input.actorAssistantId ?? null,
      });

      try {
        adapterResult = await executeBrowserStep(executionContext, policy);
      } catch (error) {
        await updateBrowserAutomationTaskClaim({
          tenantId: input.tenantId,
          claimId: browserClaim.claim.id,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Browser automation enqueue failed",
          detailJson: {
            ...(browserClaim.claim.detailJson ?? {}),
            enqueueFailed: true,
          },
        }).catch(() => {});
        throw error;
      }

      browserQueued = true;
      finalDisposition = "queued";
      outputRefs = adapterResult.outputRefsJson;
      const browserStepRecord = await automationFabricService.recordAutomationRunStepProgress({
        tenantId: input.tenantId,
        caseId: input.caseId,
        runId: input.runId,
        stepKey: input.stepKey,
        stepIndex: input.stepIndex,
        title: input.title,
        status: "running",
        surface: route.surface,
        inputRefsJson: input.inputRefsJson ?? [],
        outputRefsJson: adapterResult.outputRefsJson,
        idempotencyKey: input.idempotencyKey ?? null,
        summary: "Browser automation queued",
        detailJson: {
          route: {
            stepKey: route.stepKey,
            surface: route.surface,
            checkpointKey: route.checkpointKey,
            requiresApproval: route.requiresApproval,
          },
          adapterKind: adapterResult.adapterKind,
          adapterDetail: adapterResult.adapterDetail,
          checkpointId: checkpoint?.id ?? null,
          browserClaimId: browserClaim.claim.id,
          browserTaskId,
          browserExecutionId,
        },
        runStatus,
        finalDisposition,
        finalDispositionReason,
        createdByUserId: input.actorUserId,
        createdByAssistantId: input.actorAssistantId ?? null,
      });

      await updateBrowserAutomationTaskClaim({
        tenantId: input.tenantId,
        claimId: browserClaim.claim.id,
        status: "queued",
        taskId: adapterResult.adapterDetail && typeof adapterResult.adapterDetail === "object"
          ? String((adapterResult.adapterDetail as Record<string, unknown>).taskId ?? browserTaskId)
          : browserTaskId,
        executionId: adapterResult.adapterDetail && typeof adapterResult.adapterDetail === "object"
          ? String((adapterResult.adapterDetail as Record<string, unknown>).executionId ?? browserExecutionId)
          : browserExecutionId,
        reservationId: adapterResult.adapterDetail && typeof adapterResult.adapterDetail === "object"
          ? (adapterResult.adapterDetail as Record<string, unknown>).reservationId as string | null | undefined
          : null,
        stepId: browserStepRecord.step.id,
        inputRefsJson: input.inputRefsJson ?? [],
        outputRefsJson: adapterResult.outputRefsJson,
        detailJson: {
          ...(browserClaim.claim.detailJson ?? {}),
          browserQueued: true,
          browserStepId: browserStepRecord.step.id,
          browserTaskId,
          browserExecutionId,
          browserReservationId: adapterResult.adapterDetail && typeof adapterResult.adapterDetail === "object"
            ? (adapterResult.adapterDetail as Record<string, unknown>).reservationId ?? null
            : null,
        },
        nextPollAt: new Date(Date.now() + 15_000),
        pollCount: 0,
      }).catch(() => {});

      const browserResult: ExecuteAutomationStepResult = {
        run: browserStepRecord.run,
        step: browserStepRecord.step,
        checkpoint,
        surface: route.surface,
        outputRefsJson: outputRefs,
        adapterKind: adapterResult.adapterKind,
        adapterDetail: {
          ...adapterResult.adapterDetail,
          claimId: browserClaim.claim.id,
          stepId: browserStepRecord.step.id,
          browserTaskId,
          browserExecutionId,
        },
        libraryItemId: null,
        deckId: null,
        agencyRunId: null,
        skillId: null,
      };
      if (cacheKey) {
        AUTOMATION_STEP_IDEMPOTENCY_CACHE.set(cacheKey, browserResult);
      }
      return browserResult;
    } else if (route.surface === "work_os") {
      const item = await createLibraryItem({
        itemType: normalizeText(input.libraryItemType) || "document",
        source: normalizeText(input.librarySource) || "work_automation_export",
        title: normalizeText(input.libraryTitle) || input.title,
        description: normalizeText(input.prompt) || normalizeText(input.objective) || input.title,
        status: "ready",
        visibility: "private",
        metadata: buildAutomationArtifactMetadata({
          tenantId: input.tenantId,
          caseId: input.caseId,
          runId: input.runId,
          stepKey: input.stepKey,
          routeSurface: route.surface,
          policy,
          adapterKind: "work_os",
          extra: {
            export: true,
          },
        }),
        sourceLink: {
          linkType: "work_automation_step",
          linkId: `${input.runId}:${input.stepKey}`,
          providerTaskId: null,
        },
      }, buildActor(input.tenantId, input.actorUserId));
      adapterResult = {
        surface: route.surface,
        outputRefsJson: [buildOutputRef("library-item", item.item.id)].filter(Boolean) as string[],
        adapterKind: "work_os",
        adapterDetail: {
          itemId: item.item.id,
        },
        libraryItemId: item.item.id,
        deckId: null,
        agencyRunId: null,
        skillId: null,
      };
      finalDisposition = "exported";
    } else {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Surface ${route.surface} is not supported by the automation execution service`,
      });
    }

    outputRefs = adapterResult.outputRefsJson;
    summary = normalizeText(input.prompt) || normalizeText(input.objective) || input.title;
    if (route.surface === "skill" && adapterResult.adapterDetail && typeof adapterResult.adapterDetail === "object") {
      const skillDetail = adapterResult.adapterDetail as Record<string, unknown>;
      summary = normalizeText(String(skillDetail.resultType ?? "")) || summary;
    }

    if (browserQueued) {
      finalStatus = "succeeded";
      runStatus = "running";
      finalDispositionReason = null;
      const recordedBrowser = await automationFabricService.recordAutomationRunStepProgress({
        tenantId: input.tenantId,
        caseId: input.caseId,
        runId: input.runId,
        stepKey: input.stepKey,
        stepIndex: input.stepIndex,
        title: input.title,
        status: "running",
        surface: route.surface,
        inputRefsJson: input.inputRefsJson ?? [],
        outputRefsJson: outputRefs,
        idempotencyKey: input.idempotencyKey ?? null,
        summary: "Browser automation queued",
        detailJson: {
          route: {
            stepKey: route.stepKey,
            surface: route.surface,
            checkpointKey: route.checkpointKey,
            requiresApproval: route.requiresApproval,
          },
          adapterKind: adapterResult.adapterKind,
          adapterDetail: adapterResult.adapterDetail,
          checkpointId: checkpoint?.id ?? null,
        },
        runStatus,
        finalDisposition,
        finalDispositionReason,
        createdByUserId: input.actorUserId,
        createdByAssistantId: input.actorAssistantId ?? null,
      });

      const browserResult: ExecuteAutomationStepResult = {
        run: recordedBrowser.run,
        step: recordedBrowser.step,
        checkpoint,
        surface: route.surface,
        outputRefsJson: outputRefs,
        adapterKind: adapterResult.adapterKind,
        adapterDetail: adapterResult.adapterDetail,
        libraryItemId: null,
        deckId: null,
        agencyRunId: null,
        skillId: null,
      };
      if (cacheKey) {
        AUTOMATION_STEP_IDEMPOTENCY_CACHE.set(cacheKey, browserResult);
      }
      return browserResult;
    }

    if (route.surface === "work_os" && finalDisposition === "exported") {
      runStatus = "completed";
    }
  } catch (error) {
    runStatus = "running";
    finalDisposition = "failed";
    finalDispositionReason = error instanceof Error ? error.message : "Automation step failed";
    await automationFabricService.recordAutomationRunStepProgress({
      tenantId: input.tenantId,
      caseId: input.caseId,
      runId: input.runId,
      stepKey: input.stepKey,
      stepIndex: input.stepIndex,
      title: input.title,
      status: "failed",
      surface: route.surface,
      inputRefsJson: input.inputRefsJson ?? [],
      outputRefsJson: [],
      idempotencyKey: input.idempotencyKey ?? null,
      summary: finalDispositionReason,
      detailJson: {
        route: {
          stepKey: route.stepKey,
          surface: route.surface,
          checkpointKey: route.checkpointKey,
          requiresApproval: route.requiresApproval,
        },
        error: finalDispositionReason,
      },
      runStatus,
      finalDisposition,
      finalDispositionReason,
      createdByUserId: input.actorUserId,
      createdByAssistantId: input.actorAssistantId ?? null,
    });

    throw error instanceof TRPCError ? error : new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: finalDispositionReason,
    });
  }

  const recorded = await automationFabricService.recordAutomationRunStepProgress({
    tenantId: input.tenantId,
    caseId: input.caseId,
    runId: input.runId,
    stepKey: input.stepKey,
    stepIndex: input.stepIndex,
    title: input.title,
    status: "succeeded",
    surface: route.surface,
    inputRefsJson: input.inputRefsJson ?? [],
    outputRefsJson: outputRefs,
    idempotencyKey: input.idempotencyKey ?? null,
    summary,
    detailJson: {
      route: {
        stepKey: route.stepKey,
        surface: route.surface,
        checkpointKey: route.checkpointKey,
        requiresApproval: route.requiresApproval,
      },
      adapterKind: adapterResult.adapterKind,
      adapterDetail: adapterResult.adapterDetail,
      checkpointId: checkpoint?.id ?? null,
    },
    runStatus,
    finalDisposition,
    finalDispositionReason,
    createdByUserId: input.actorUserId,
    createdByAssistantId: input.actorAssistantId ?? null,
  });

  const result: ExecuteAutomationStepResult = {
    run: recorded.run,
    step: recorded.step,
    checkpoint,
    surface: route.surface,
    outputRefsJson: outputRefs,
    adapterKind: adapterResult.adapterKind,
    adapterDetail: adapterResult.adapterDetail,
    libraryItemId: adapterResult.libraryItemId,
    deckId: adapterResult.deckId,
    agencyRunId: adapterResult.agencyRunId,
    skillId: adapterResult.skillId,
  };
  if (cacheKey) {
    AUTOMATION_STEP_IDEMPOTENCY_CACHE.set(cacheKey, result);
  }
  return result;
}
