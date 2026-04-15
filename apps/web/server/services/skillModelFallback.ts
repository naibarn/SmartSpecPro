/**
 * Skill Model Fallback Service (Shared)
 *
 * Provides intelligent model-level fallback for LLM calls.
 * Reuses executeWithFallback() from llmRouter for provider-level fallback,
 * adding a model-level loop on top: when ALL providers for a model fail,
 * tries the next cheapest model matching requirements.
 *
 * Used by:
 *   - chat.ts (skill execution)
 *   - aiPresentationService.ts can migrate to this in the future
 *
 * Audit trail per attempt:
 *   - attempt number, modelId, providerName, error details
 *   - full fallback chain history (which models were tried and why they failed)
 */

import { auditLogger } from "./auditLogger";
import {
  executeWithFallback,
  getProviderForModel,
  type ProviderCandidate,
  type ExecuteResult,
} from "./llmRouter";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import {
  selectLlmModelCandidates,
  type CapabilityRequirements,
} from "./intelligentModelSelector";
import type { SkillExecutionPolicyResult } from "./skillExecutionPolicy";
import type { Message } from "../_core/llm";
import { debugLog, debugError } from "../_core/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillLlmRequest {
  messages: Array<{ role: string; content: string | unknown[] }>;
  skillSlug: string;
  userId: number;
  executionPolicy: SkillExecutionPolicyResult;
  /** Limit how many model candidates are tried for this request. Defaults to 5. */
  maxModelAttempts?: number;
  maxTokens?: number;
  temperature?: number;
  extraBodyParams?: Record<string, unknown>;
  stream?: boolean;
  /** Enable thinking/reasoning mode (sends reasoning.effort="high" to OpenRouter) */
  enableThinking?: boolean;
}

export interface FallbackAttempt {
  attempt: number;
  modelId: string;
  providerName: string;
  statusCode: number | null;
  errorType: string | null;
  errorMessage: string | null;
  durationMs: number;
  success: boolean;
}

export interface SkillLlmResult {
  success: boolean;
  content?: string;
  modelId?: string;
  provider?: ProviderCandidate;
  inputTokens?: number;
  outputTokens?: number;
  rawData?: Record<string, unknown>;
  error?: string;
  attempts: FallbackAttempt[];
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MODEL_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Core: Model-Level Fallback Loop
// ---------------------------------------------------------------------------

/**
 * Execute a skill LLM call with model-level fallback.
 *
 * For each candidate model (up to 5, sorted cheapest → expensive):
 *   1. Call executeWithFallback() which handles provider-level retry internally
 *   2. If success → return result
 *   3. If error → log attempt, try next model
 *   4. If all models fail → return error with full attempt history
 */
export async function executeSkillLlmWithFallback(
  request: SkillLlmRequest,
): Promise<SkillLlmResult> {
  const { messages, skillSlug, userId, executionPolicy, stream = false, enableThinking, maxTokens, temperature, extraBodyParams, maxModelAttempts } = request;
  const overallStart = Date.now();
  const attempts: FallbackAttempt[] = [];

  const candidateModelIds = await buildCandidateList(executionPolicy, maxModelAttempts);

  if (candidateModelIds.length === 0) {
    return {
      success: false,
      error: "No enabled LLM model available. Please check model settings.",
      attempts: [],
      totalDurationMs: Date.now() - overallStart,
    };
  }

  for (let i = 0; i < candidateModelIds.length; i++) {
    const modelId = candidateModelIds[i];
    const attemptStart = Date.now();

    // Audit: log attempt start
    auditLogger.log({
      eventType: "llm_request",
      userId,
      model: modelId,
      requestType: "skill",
      wasFallback: i > 0,
      fallbackAttempt: i,
      requestPayload: {
        skillSlug,
        attempt: i + 1,
        totalCandidates: candidateModelIds.length,
        maxModelAttempts: maxModelAttempts ?? MAX_MODEL_ATTEMPTS,
        messageCount: messages.length,
        ...(i > 0
          ? { previousAttempts: attempts.map(summarizeAttempt) }
          : {}),
      },
    });

    // Use executeWithFallback for provider-level retry within this model
    const result: ExecuteResult = await executeWithFallback({
      model: modelId,
      messages: messages as Message[],
      stream,
      userId,
      preferredProvider: i === 0 ? executionPolicy.preferredProviderId : undefined,
      enableThinking,
      maxTokens,
      temperature,
      extraBodyParams,
    });

    const durationMs = Date.now() - attemptStart;

    if (result.type === "success") {
      // ─── SUCCESS ───
      const response = result.response;
      const rawContent =
        typeof response === "string"
          ? response
          : response?.choices?.[0]?.message?.content;
      const content =
        typeof rawContent === "string"
          ? rawContent
          : "";
      const normalizedContent = content.trim();
      const inputTokens = response?.usage?.prompt_tokens ?? 0;
      const outputTokens = response?.usage?.completion_tokens ?? 0;

      if (!normalizedContent) {
        const errorMsg = "No response generated";

        attempts.push({
          attempt: i + 1,
          modelId,
          providerName: result.providerName,
          statusCode: 502,
          errorType: "empty_response",
          errorMessage: errorMsg,
          durationMs,
          success: false,
        });

        auditLogger.log({
          eventType: "llm_response",
          userId,
          model: modelId,
          requestType: "skill",
          errorType: "empty_response",
          errorMessage: errorMsg,
          timing: { totalMs: durationMs },
          wasFallback: i > 0,
          fallbackAttempt: i,
          metadata: {
            skillSlug,
            attempt: i + 1,
            willRetry: i < candidateModelIds.length - 1,
            attemptHistory: attempts.map(summarizeAttempt),
          },
        });

        debugError(
          "skillFallback",
          `Attempt ${i + 1}/${candidateModelIds.length} failed: ${modelId} → empty response. ` +
          (i < candidateModelIds.length - 1 ? `Trying next model...` : `No more candidates.`),
          {
            skillSlug,
            attempt: i + 1,
            modelId,
            errorMsg,
            willRetry: i < candidateModelIds.length - 1,
          },
        );

        continue;
      }

      attempts.push({
        attempt: i + 1,
        modelId,
        providerName: result.providerName,
        statusCode: 200,
        errorType: null,
        errorMessage: null,
        durationMs,
        success: true,
      });

      // Audit: log success (with fallback history if applicable)
      auditLogger.log({
        eventType: "llm_response",
        userId,
        providerId: result.providerId,
        providerName: result.providerName,
        model: modelId,
        requestType: "skill",
        inputTokens,
        outputTokens,
        statusCode: 200,
        timing: { totalMs: durationMs },
        wasFallback: i > 0,
        fallbackAttempt: i,
        responsePayload: {
          usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens },
          contentLength: typeof content === "string" ? content.length : 0,
          skillSlug,
          attempt: i + 1,
          ...(i > 0
            ? { fallbackHistory: attempts.filter((a) => !a.success).map(summarizeAttempt) }
            : {}),
        },
      });

      // Log if fallback was needed
      if (i > 0) {
        debugLog(
          "skillFallback",
          `Skill '${skillSlug}' succeeded on attempt ${i + 1} (${result.providerName}/${modelId}) after ${i} failed attempt(s)`,
          { skillSlug, attempt: i + 1, modelId, provider: result.providerName },
        );
      }

      // Resolve the full provider info for the caller
      const providerInfo = await getProviderForModel(modelId);

      return {
        success: true,
        content: typeof content === "string" ? content : JSON.stringify(content),
        modelId,
        provider: providerInfo ?? undefined,
        inputTokens,
        outputTokens,
        rawData: response,
        attempts,
        totalDurationMs: Date.now() - overallStart,
      };
    }

    // ─── FAILURE ───
    const errorMsg =
      result.type === "error"
        ? result.error
        : "LLM provider requires fallback consent";

    attempts.push({
      attempt: i + 1,
      modelId,
      providerName: "multi-provider",
      statusCode: result.type === "error" ? result.statusCode : null,
      errorType: result.type === "error" ? `http_${result.statusCode}` : "fallback_required",
      errorMessage: errorMsg,
      durationMs,
      success: false,
    });

    // Audit: log failed attempt
    auditLogger.log({
      eventType: "llm_response",
      userId,
      model: modelId,
      requestType: "skill",
      errorType: result.type === "error" ? `http_${result.statusCode}` : "fallback_required",
      errorMessage: errorMsg,
      timing: { totalMs: durationMs },
      wasFallback: i > 0,
      fallbackAttempt: i,
      metadata: {
        skillSlug,
        attempt: i + 1,
        willRetry: i < candidateModelIds.length - 1,
        attemptHistory: attempts.map(summarizeAttempt),
      },
    });

    debugError(
      "skillFallback",
      `Attempt ${i + 1}/${candidateModelIds.length} failed: ${modelId} → ${errorMsg.slice(0, 200)}. ` +
      (i < candidateModelIds.length - 1 ? `Trying next model...` : `No more candidates.`),
      { skillSlug, attempt: i + 1, modelId, errorMsg: errorMsg.slice(0, 200), willRetry: i < candidateModelIds.length - 1 },
    );
  }

  // All candidates failed
  const historyStr = attempts
    .map((a) => `attempt ${a.attempt} ${a.modelId}: ${a.errorMessage?.slice(0, 100) || "unknown"}`)
    .join("; ");

  auditLogger.log({
    eventType: "error",
    userId,
    requestType: "skill",
    errorType: "all_models_exhausted",
    errorMessage: `All ${attempts.length} model candidates failed for skill '${skillSlug}'`,
    metadata: {
      skillSlug,
      totalAttempts: attempts.length,
      attemptHistory: attempts.map(summarizeAttempt),
    },
  });

  return {
    success: false,
    error: `All ${attempts.length} models failed: ${historyStr}`,
    attempts,
    totalDurationMs: Date.now() - overallStart,
  };
}

// ---------------------------------------------------------------------------
// Candidate Builder
// ---------------------------------------------------------------------------

/**
 * Build ordered candidate list for model-level fallback.
 *
 * 1. Primary model from executionPolicy.modelId (first)
 * 2. If the model came from explicit skill configuration: stop there and honor it
 * 3. If requirements-based: additional models matching same requirements (by priority ASC)
 * 4. If legacy cascade: all enabled models by priority ASC
 * Deduplicates and caps at MAX_MODEL_ATTEMPTS.
 */
async function buildCandidateList(
  policy: SkillExecutionPolicyResult,
  maxModelAttempts: number = MAX_MODEL_ATTEMPTS,
): Promise<string[]> {
  const effectiveMaxAttempts = Math.max(1, Math.min(MAX_MODEL_ATTEMPTS, Math.floor(maxModelAttempts || MAX_MODEL_ATTEMPTS)));
  const rows = (await loadEnabledLlmModelRows()).filter(
    (row) => policy.allowFreeModels || row.isFree !== true,
  );
  if (rows.length === 0) return [];

  const primaryModel = policy.modelId;
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (m: string) => {
    if (m && !seen.has(m) && result.length < effectiveMaxAttempts) {
      seen.add(m);
      result.push(m);
    }
  };

  // 1. Primary model always first
  if (primaryModel) add(primaryModel);
  if (primaryModel && effectiveMaxAttempts === 1) {
    return result;
  }

  const honorsExplicitSkillModel =
    policy.modelSource === "skill_llmModelId" ||
    policy.modelSource === "skill_defaultModel" ||
    policy.modelSource === "skill_fixedModel";
  if (honorsExplicitSkillModel) {
    return result;
  }

  // 2. If requirements matched, get more candidates matching same requirements
  if (
    policy.modelSource === "requirements_match" &&
    policy.matchedCapabilities?.length
  ) {
    const requirements: Partial<CapabilityRequirements> = {};
    for (const cap of policy.matchedCapabilities) {
      if (isCapabilityKey(cap)) {
        (requirements as Record<string, boolean>)[cap] = true;
      }
    }
    const candidates = selectLlmModelCandidates(requirements, rows, effectiveMaxAttempts);
    for (const c of candidates) add(c);
  }

  // 3. Fill remaining slots with all enabled models by priority (cheapest first)
  const allByPriority = [...rows]
    .sort((a, b) => a.priority - b.priority)
    .map((r) => r.modelId);
  for (const m of allByPriority) add(m);

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CAPABILITY_KEYS = [
  "supportsVision",
  "supportsThinking",
  "supportsFunctionTools",
  "supportsStructuredOutputs",
  "supportsJsonMode",
  "supportsStrictToolSchema",
  "supportsWebSearch",
  "supportsCodeExecution",
  "supportsComputerUse",
  "supportsBackground",
  "supportsResponses",
];

function isCapabilityKey(key: string): boolean {
  return CAPABILITY_KEYS.includes(key);
}

function summarizeAttempt(a: FallbackAttempt): Record<string, unknown> {
  return {
    attempt: a.attempt,
    model: a.modelId,
    provider: a.providerName,
    status: a.statusCode,
    error: a.errorType,
    ms: a.durationMs,
    ok: a.success,
  };
}
