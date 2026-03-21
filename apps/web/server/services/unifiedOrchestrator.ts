import type { SkillDefinition } from "@smartspec/skills";
import { getSkillByIdAsync, getSkillById } from "./skillRegistry";
import { getExecutor } from "./executors/executorRegistry";
import {
  buildChatContext,
  buildTeamContext,
  buildDynamicModelRequirements,
  buildPromptEnhancementContext,
  injectWebSearchIfNeeded,
} from "./executors/contextBuilder";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import {
  classifyArtifactIntent,
  selectExecutionRoute,
} from "./artifactRouter";
import {
  deductCreditsForModel,
  calculateCreditsForLLMDynamic,
} from "./creditService";
import { auditLogger } from "./auditLogger";
import { getTraceId } from "./traceContext";
import type {
  CapabilityFamily,
  UnifiedExecutionRequest,
  UnifiedExecutionResult,
  ExecutorInput,
  PersistenceHook,
  PersistenceContext,
  RouteDecision,
  TextResult,
  ExecutionTelemetry,
} from "./executors/types";

// ─── Constants ──────────────────────────────────────────────

const ROUTER_VERSION = "1.0.0";
const POLICY_VERSION = "1.0.0";
const FALLBACK_SKILL_SLUG = "general-article-writer";

// ─── Persistence Hooks ──────────────────────────────────────

const persistenceHooks = new Map<string, PersistenceHook>();

export function registerPersistenceHook(hook: PersistenceHook): void {
  persistenceHooks.set(hook.channel, hook);
}

// ─── Capability Classification ──────────────────────────────

const CATEGORY_TO_CAPABILITY: Record<string, CapabilityFamily> = {
  image_generation: "media.image",
  video_generation: "media.video",
  audio_generation: "media.audio",
};

export function classifyCapability(
  skill: SkillDefinition,
): CapabilityFamily {
  // 1. Explicit declaration in executionPolicy
  const policy =
    typeof skill.executionPolicy === "string"
      ? tryParseJson(skill.executionPolicy)
      : (skill.executionPolicy as Record<string, unknown> | null);

  if (policy?.capability_family) {
    return policy.capability_family as CapabilityFamily;
  }

  // 2. Category-based mapping
  const category = (skill as any).category || "";
  if (CATEGORY_TO_CAPABILITY[category]) {
    return CATEGORY_TO_CAPABILITY[category];
  }

  // 3. Swarm mode
  if ((skill as any).executionMode === "swarm") {
    return "orchestration.swarm";
  }

  // 4. Review pattern detection
  const slug = (skill as any).slug || skill.id || "";
  const tags = (skill as any).tags || [];
  const isReview =
    category.includes("review") ||
    slug.includes("review") ||
    tags.some((t: string) => t.includes("review"));
  if (isReview) {
    return "writing.review";
  }

  // 5. Default
  return "writing.article";
}

// ─── Main Orchestrator ──────────────────────────────────────

export async function executeUnified(
  request: UnifiedExecutionRequest,
): Promise<UnifiedExecutionResult> {
  const startMs = Date.now();
  const traceId = request.traceId || getTraceId() || crypto.randomUUID();

  try {
    // ─── Step 1: Resolve Skill ──────────────────────────────
    const skillId = request.routeHint?.selectedSkillId;
    let skill: SkillDefinition | undefined;

    if (skillId) {
      skill = await getSkillByIdAsync(skillId);
      if (!skill) {
        console.warn(
          `[unifiedOrchestrator] skill ${skillId} not found, falling back to ${FALLBACK_SKILL_SLUG}`,
        );
        skill = getSkillById(FALLBACK_SKILL_SLUG);
      }
    } else {
      skill = getSkillById(FALLBACK_SKILL_SLUG);
    }

    if (!skill) {
      return makeErrorResult(
        request,
        "skill_resolution_failed",
        "No skill could be resolved",
        startMs,
      );
    }

    // ─── Step 2: Classify Capability ────────────────────────
    const capability = classifyCapability(skill);

    // ─── Step 3: Select Executor ────────────────────────────
    const route: RouteDecision = {
      capability,
      executorId: "unknown",
      reason: request.routeHint?.reason || "default",
    };

    let executor = getExecutor(capability, route);
    if (!executor) {
      console.warn(
        `[unifiedOrchestrator] no executor for ${capability}, falling back to text executor`,
      );
      executor = getExecutor("writing.article");
    }

    if (!executor) {
      return makeErrorResult(
        request,
        "executor_not_found",
        `No executor for capability ${capability}`,
        startMs,
      );
    }

    route.executorId = executor.id;

    // Audit: unified_route
    auditLogger.log({
      eventType: "unified_route" as any,
      userId: request.userId,
      requestPayload: {
        capability,
        executorId: executor.id,
        skillId: skill.id,
        channel: request.channel,
        reason: route.reason,
        confidence: request.routeHint?.confidence,
        traceId,
      },
    });

    // ─── Step 4: Build Execution Context ────────────────────
    let messages: Array<{ role: string; content: string | unknown[] }>;

    // Check prompt enhancement first
    const enhancement = await buildPromptEnhancementContext(
      (skill as any).slug || skill.id,
      request.dynamicParams || {},
      request.userMessage,
    );

    if (enhancement) {
      messages = [
        { role: "system", content: enhancement.systemPrompt },
        { role: "user", content: enhancement.userPrompt },
      ];
    } else if (request.channel === "chat") {
      messages = await buildChatContext(
        request,
        (skill as any).systemPrompt || `Use ${skill.name}`,
        (skill as any).knowledgebase || null,
      );
    } else {
      // team_room
      const teamMessages = await buildTeamContext(request, request.tenantId);
      // Prepend skill system prompt
      const skillPrompt = (skill as any).systemPrompt;
      messages = skillPrompt
        ? [
            { role: "system", content: skillPrompt },
            ...teamMessages.map((m) => ({
              role: m.role,
              content: m.content as string | unknown[],
            })),
          ]
        : teamMessages.map((m) => ({
            role: m.role,
            content: m.content as string | unknown[],
          }));
    }

    // ─── Step 5: Build Dynamic Model Requirements ───────────
    const hasImages =
      (request.attachments || []).some((a) => a.type === "image") ||
      Array.isArray(request.dynamicParams?.reference_images);

    const { requirements: dynamicReqs, hasOverrides } =
      buildDynamicModelRequirements(
        {
          executionPolicy: skill.executionPolicy as any,
          category: (skill as any).category,
          type: (skill as any).type,
        },
        hasImages,
        request.routeHint?.reason,
      );

    // ─── Step 6: Resolve Execution Policy ───────────────────
    const policyResult = await resolveSkillExecutionPolicy({
      skill,
      conversationModel:
        request.conversationContext?.conversationModel ?? undefined,
    });

    // Merge dynamic requirements into the policy for model selection
    const mergedPolicy = hasOverrides
      ? {
          ...policyResult,
          ...((skill.executionPolicy as any) || {}),
          requirements: dynamicReqs,
        }
      : policyResult;

    // ─── Step 7: Run Task Planner ───────────────────────────
    const plannerResult = await runPlanner({
      sourceType: request.channel === "chat" ? "chat" : "team_room",
      userId: request.userId,
      tenantId: request.tenantId,
      conversationModel:
        request.conversationContext?.conversationModel ?? undefined,
      skillSlug: (skill as any).slug || skill.id,
      executionPolicy: mergedPolicy as any,
    });

    // If planner resolved a model override, apply it
    const dynamicModelOverride =
      (plannerResult as any)?.resolvedModelId ?? undefined;

    // ─── Step 8: Inject Web Search ──────────────────────────
    const webSearchResult = await injectWebSearchIfNeeded({
      skillPolicy: skill.executionPolicy as any,
      routeReason: request.routeHint?.reason,
      modelId: dynamicModelOverride || policyResult.modelId,
      preferredProviderId: policyResult.preferredProviderId ?? undefined,
      strictProviderPin: policyResult.strictProviderPin,
    });

    let extraBodyParams = webSearchResult?.extraBodyParams || {};
    if (webSearchResult?.systemPromptSuffix && messages.length > 0) {
      const sysMsg = messages[0];
      if (sysMsg.role === "system" && typeof sysMsg.content === "string") {
        sysMsg.content += `\n\n${webSearchResult.systemPromptSuffix}`;
      }
    }

    // ─── Step 9: Classify Artifact Intent (Text Only) ───────
    let artifactMetadata: Record<string, unknown> = {};
    if (
      capability === "writing.article" ||
      capability === "writing.review"
    ) {
      try {
        const artifactIntent = classifyArtifactIntent({
          skillSlug: (skill as any).slug || skill.id,
          sourceType: request.channel,
        });
        if (artifactIntent !== "chat_reply") {
          const artifactRoute = selectExecutionRoute({
            artifactIntent,
            complexity: "moderate",
          });
          artifactMetadata = {
            artifactIntent,
            artifactRoute: artifactRoute.route,
          };
        }
      } catch {
        // non-critical
      }
    }

    // ─── Step 10: Delegate to Executor ──────────────────────
    const enableThinking = !!(dynamicReqs as any)?.supportsThinking;

    const executorInput: ExecutorInput = {
      messages,
      executionPolicy: mergedPolicy as any,
      extraBodyParams,
      enableThinking,
      dynamicModelOverride,
      dynamicParams: request.dynamicParams,
      skill,
      skillSlug: (skill as any).slug || skill.id,
      userId: request.userId,
      channel: request.channel,
      traceId,
    };

    const executorResult = await executor.execute(executorInput);

    // ─── Step 11: Handle Credits ────────────────────────────
    const creditMode = request.creditMode || "deduct";
    let costCredits = 0;
    let creditsDeducted = 0;

    try {
      if (creditMode === "deduct" && executorResult.modelUsed) {
        const creditResult = await deductCreditsForModel({
          userId: request.userId,
          model: executorResult.modelUsed,
          inputTokens: executorResult.inputTokens,
          outputTokens: executorResult.outputTokens,
          skillSlug: (skill as any).slug || skill.id,
          tenantId: request.tenantId,
          idempotencyKey: traceId,
        });
        costCredits = creditResult.creditsUsed;
        creditsDeducted = creditResult.creditsUsed;
      } else if (creditMode === "calculate_only" && executorResult.modelUsed) {
        costCredits = await calculateCreditsForLLMDynamic(
          executorResult.inputTokens,
          executorResult.outputTokens,
          executorResult.modelUsed,
        );
      }
      // "skip" → 0
    } catch (err) {
      console.warn("[unifiedOrchestrator] credit handling failed:", err);
    }

    // Audit: unified_credit
    auditLogger.log({
      eventType: "unified_credit" as any,
      userId: request.userId,
      requestPayload: {
        creditMode,
        costCredits,
        creditsDeducted,
        modelUsed: executorResult.modelUsed,
        traceId,
      },
    });

    // ─── Step 12: Record Planner Step ───────────────────────
    if (plannerResult) {
      try {
        await recordStepAttempt({
          plannerResult,
          executorResult: {
            success: executorResult.success,
            modelUsed: executorResult.modelUsed,
            inputTokens: executorResult.inputTokens,
            outputTokens: executorResult.outputTokens,
            durationMs: executorResult.totalDurationMs,
          },
        } as any);
      } catch {
        // non-critical
      }
    }

    // ─── Step 13: Emit Persistence Hook ─────────────────────
    const persistenceContext: PersistenceContext = {
      conversationId: request.conversationContext?.conversationId,
      roomId: request.teamContext?.roomId,
      runId: request.teamContext?.runId,
    };

    const telemetry: ExecutionTelemetry = {
      routerVersion: ROUTER_VERSION,
      policyVersion: POLICY_VERSION,
      executorId: executor.id,
      attempts: executorResult.attempts,
      totalDurationMs: Date.now() - startMs,
    };

    // ─── Step 14: Return Unified Result ─────────────────────
    const textResult: TextResult = {
      type: "text",
      content: executorResult.content || "",
    };

    const result: UnifiedExecutionResult = {
      route,
      result: executorResult.mediaJob
        ? {
            type: "media_job",
            mediaType: executorResult.mediaJob.mediaType,
            jobPayload: executorResult.mediaJob.jobPayload,
          }
        : executorResult.delegated
          ? {
              type: "delegated",
              target: executorResult.delegated.target,
              payload: executorResult.delegated.payload,
            }
          : textResult,
      tokens: {
        input: executorResult.inputTokens,
        output: executorResult.outputTokens,
      },
      costCredits,
      creditsDeducted,
      modelUsed: executorResult.modelUsed || null,
      skillId: skill.id,
      nextSpeakerHint: executorResult.nextSpeakerHint,
      metadata: {
        ...artifactMetadata,
        traceId,
        success: executorResult.success,
        error: executorResult.error,
      },
      telemetry,
    };

    // Fire persistence hook (non-blocking)
    const hook = persistenceHooks.get(request.channel);
    if (hook) {
      try {
        await hook.onExecutionComplete(result, persistenceContext);
      } catch (err) {
        console.warn(
          "[unifiedOrchestrator] persistence hook failed:",
          err,
        );
      }
    }

    return result;
  } catch (err) {
    // Unrecoverable error
    auditLogger.log({
      eventType: "unified_route" as any,
      userId: request.userId,
      requestPayload: {
        error: String(err),
        channel: request.channel,
        traceId,
      },
    });

    return makeErrorResult(
      request,
      "orchestrator_error",
      String(err),
      startMs,
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────

function makeErrorResult(
  request: UnifiedExecutionRequest,
  reason: string,
  error: string,
  startMs: number,
): UnifiedExecutionResult {
  return {
    route: {
      capability: "writing.article",
      executorId: "unknown",
      reason,
    },
    result: { type: "text", content: "" },
    tokens: { input: 0, output: 0 },
    costCredits: 0,
    modelUsed: null,
    skillId: request.routeHint?.selectedSkillId ?? "unknown",
    metadata: { error },
    telemetry: {
      routerVersion: ROUTER_VERSION,
      policyVersion: POLICY_VERSION,
      executorId: "unknown",
      attempts: [],
      totalDurationMs: Date.now() - startMs,
    },
  };
}

function tryParseJson(
  str: string,
): Record<string, unknown> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
