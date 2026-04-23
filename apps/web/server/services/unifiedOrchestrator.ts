import type { SkillDefinition } from "@smartspec/skills";
import { getSkillByIdAsync, getSkillById } from "./skillRegistry";
import { skillExecutionLimiter } from "./rateLimiter";
import { getExecutor } from "./executors/executorRegistry";
import {
  buildDynamicModelRequirements,
  buildPromptEnhancementContext,
  injectWebSearchIfNeeded,
} from "./executors/contextBuilder";
import {
  buildChatExecutionContextPack,
  buildTeamExecutionContextPack,
  summarizeContextPack,
  type ContextPack,
} from "./contextEngineAdapter";
import { recordContextEngineMetric } from "./monitoringService";
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
import { signBearerToken } from "../_core/tokens";
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
import { CAPABILITY_FAMILIES } from "./executors/types";

// ─── Executor Self-Registration (side-effect imports) ────────
// Importing these modules triggers their self-registration with the executor registry

import "./executors/textSkillExecutor";
import "./executors/imageExecutor";
import "./executors/videoExecutor";
import "./executors/audioExecutor";

// ─── Constants ──────────────────────────────────────────────

const ROUTER_VERSION = "1.0.0";
const POLICY_VERSION = "1.0.0";
const FALLBACK_SKILL_SLUG = "general-article-writer";

// ─── Persistence Hooks ──────────────────────────────────────

const persistenceHooks = new Map<string, PersistenceHook>();

export function registerPersistenceHook(hook: PersistenceHook): void {
  persistenceHooks.set(hook.channel, hook);
}

/** For tests only — removes all registered persistence hooks. */
export function clearPersistenceHooks(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("clearPersistenceHooks is not allowed in production");
  }
  persistenceHooks.clear();
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

  if (
    policy?.capability_family &&
    (CAPABILITY_FAMILIES as readonly string[]).includes(
      policy.capability_family as string,
    )
  ) {
    return policy.capability_family as CapabilityFamily;
  }

  // 2. Category-based mapping (normalize hyphens to underscores)
  const rawCategory = (skill as any).category || "";
  const category = rawCategory.toLowerCase().replace(/-/g, "_");
  if (CATEGORY_TO_CAPABILITY[category]) {
    return CATEGORY_TO_CAPABILITY[category];
  }

  // 3. Swarm mode (warn: no executor registered for this)
  if ((skill as any).executionMode === "swarm") {
    console.warn(
      "[unifiedOrchestrator] swarm capability requested but no dedicated executor — will fallback to text",
    );
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

  // 5. Skill factory detection
  if (
    (skill as any).executionMode === "skill_factory" ||
    (skill as any).category === "skill_factory"
  ) {
    console.warn(
      "[unifiedOrchestrator] skill_factory.create capability requested but no dedicated executor — will fallback to text",
    );
    return "skill_factory.create";
  }

  // 6. Default
  return "writing.article";
}

// ─── Security: Allowed route reasons ────────────────────────

const ALLOWED_ROUTE_REASONS = new Set([
  "user_selected",
  "auto_detected",
  "skill_chained",
  "default",
  "web_search_detected",
  "auto_web_search",
  "fallback",
]);

// ─── Security: Keys stripped from dynamicParams to prevent auth bypass ────

const SYSTEM_PROMPT_MAX_CHARS = 12_000;

// ─── Main Orchestrator ──────────────────────────────────────

export async function executeUnified(
  request: UnifiedExecutionRequest,
): Promise<UnifiedExecutionResult> {
  const startMs = Date.now();
  const traceId = request.traceId || getTraceId() || crypto.randomUUID();

  try {
    // ─── Rate Limiting (U04) ─────────────────────────────────
    const rateLimitKey = `user:${request.userId}`;
    if (!skillExecutionLimiter.isAllowed(rateLimitKey)) {
      return makeErrorResult(
        request,
        "rate_limited",
        "Too many requests",
        startMs,
      );
    }

    // ─── Step 0: Input Sanitization ──────────────────────────

    // U06: Validate routeHint.reason
    if (
      request.routeHint?.reason &&
      !ALLOWED_ROUTE_REASONS.has(request.routeHint.reason)
    ) {
      request = {
        ...request,
        routeHint: { ...request.routeHint, reason: "default" },
      };
    }

    // U01: Strip client-supplied auth tokens from dynamicParams
    // Media executors get server-generated tokens instead
    const sanitized = { ...(request.dynamicParams ?? {}) };
    // Only strip userToken (auth bypass risk); keep apiConfig (needed for provider routing)
    delete sanitized.userToken;
    // U01: Always inject server-generated bearer token for media executors
    sanitized.__serverUserToken = signBearerToken(
      { sub: String(request.userId), tenantId: request.tenantId },
      "5m",
    );
    request = { ...request, dynamicParams: sanitized };

    // ─── Step 1: Resolve Skill ──────────────────────────────
    const skillId = request.routeHint?.selectedSkillId;
    let skill: SkillDefinition | undefined;

    if (skillId) {
      skill = await getSkillByIdAsync(skillId);
      if (!skill) {
        console.warn(
          `[unifiedOrchestrator] skill ${skillId} not found, falling back to ${FALLBACK_SKILL_SLUG}`,
        );
        skill = await getSkillByIdAsync(FALLBACK_SKILL_SLUG);
        if (!skill) skill = getSkillById(FALLBACK_SKILL_SLUG);
      }
    } else {
      skill = await getSkillByIdAsync(FALLBACK_SKILL_SLUG);
      if (!skill) skill = getSkillById(FALLBACK_SKILL_SLUG);
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

    // Enforce capabilitiesAllowed if specified
    if (
      request.capabilitiesAllowed &&
      request.capabilitiesAllowed.length > 0 &&
      !request.capabilitiesAllowed.includes(capability)
    ) {
      return makeErrorResult(
        request,
        "capability_not_allowed",
        `Capability ${capability} not in allowed list`,
        startMs,
      );
    }

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
      eventType: "unified_route",
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
    let contextPack: ContextPack | null = null;
    const contextAssemblyStartMs = Date.now();

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
      // System prompt length cap to match legacy path
      const rawSysPrompt =
        (skill as any).systemPrompt || `Use ${skill.name}`;
      const cappedSysPrompt = rawSysPrompt.substring(
        0,
        SYSTEM_PROMPT_MAX_CHARS,
      );
      contextPack = await buildChatExecutionContextPack(
        request,
        {
          skillSystemPrompt: cappedSysPrompt,
          knowledgebase: (skill as any).knowledgebase || null,
          dynamicParams: request.dynamicParams ?? null,
          label: request.conversationContext?.conversationId
            ? `chat:${request.conversationContext.conversationId}`
            : "chat",
        },
      );
      messages = contextPack.messages;
    } else {
      // team_room
      const skillPrompt = (skill as any).systemPrompt
        ? ((skill as any).systemPrompt as string).substring(
            0,
            SYSTEM_PROMPT_MAX_CHARS,
          )
        : null;
      contextPack = await buildTeamExecutionContextPack(
        request,
        request.tenantId,
        {
          skillSystemPrompt: skillPrompt,
          dynamicParams: request.dynamicParams ?? null,
          label: request.teamContext?.roomId
            ? `team:${request.teamContext.roomId}`
            : "team_room",
        },
      );
      messages = contextPack.messages;
    }

    if (contextPack) {
      void recordContextEngineMetric({
        source: `unified:${request.channel}`,
        surface: contextPack.surface,
        contextPack,
        traceId,
        tenantId: request.tenantId,
        teamId: request.teamContext?.teamId ?? null,
        userId: request.userId,
        conversationId: request.conversationContext?.conversationId ?? null,
        roomId: request.teamContext?.roomId ?? null,
        runId: request.teamContext?.runId ?? null,
        projectId:
          typeof request.dynamicParams?.projectId === "string"
            ? request.dynamicParams.projectId
            : null,
        skillId: skill.id,
        latencyMs: Date.now() - contextAssemblyStartMs,
      }).catch((err) => {
        console.warn("[unifiedOrchestrator] context-engine metric failed:", err);
      });
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

    // Parse execution policy once (reuse from step 5 via skill.executionPolicy)
    const parsedEP =
      typeof skill.executionPolicy === "string"
        ? tryParseJson(skill.executionPolicy)
        : (skill.executionPolicy as Record<string, unknown> | null);
    const maxTokensHint: number | undefined =
      (parsedEP as any)?.max_tokens_hint ?? undefined;
    const temperatureHint: number | undefined =
      (parsedEP as any)?.temperature ?? undefined;

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
      maxTokens: maxTokensHint,
      temperature: temperatureHint,
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
      eventType: "unified_credit",
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
        ...(contextPack
          ? {
              contextEngine: {
                summary: summarizeContextPack(contextPack),
                surface: contextPack.surface,
                intent: contextPack.intent,
                budgetProfile: contextPack.budgetProfile,
                estimatedTokens: contextPack.estimatedTokens,
                tokenHeadroom: contextPack.compaction.tokenHeadroom,
                dedupedMessages: contextPack.compaction.dedupedMessages,
              },
            }
          : {}),
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
    // Unrecoverable error — log full details server-side only
    const errorDetail = String(err);
    auditLogger.log({
      eventType: "unified_error",
      userId: request.userId,
      requestPayload: {
        error: errorDetail,
        channel: request.channel,
        traceId,
      },
    });

    // U02: Sanitize error — do not expose internal details to caller
    return makeErrorResult(
      request,
      "orchestrator_error",
      "An internal error occurred during execution",
      startMs,
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────

/** Error reasons that indicate terminal failures (not normal execution). */
export const ERROR_REASONS = new Set([
  "skill_resolution_failed",
  "executor_not_found",
  "capability_not_allowed",
  "orchestrator_error",
  "rate_limited",
]);

function makeErrorResult(
  request: UnifiedExecutionRequest,
  reason: string,
  error: string,
  startMs: number,
): UnifiedExecutionResult {
  // U02: Never expose raw error strings — log server-side, return sanitized
  const sanitizedError = ERROR_REASONS.has(reason)
    ? reason // safe — these are our own constant strings
    : "internal_error";
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
    metadata: { error: sanitizedError },
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
