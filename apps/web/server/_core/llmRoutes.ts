import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { decrypt } from "../services/crypto";
import { ENV } from "./env";
import { compareCachedInternalToken, getCachedAppRuntimeConfig } from "../services/appRuntimeConfig";
import { authorizeRequest, AuthResult } from "./authz";
import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
import { getUserByOpenId, getUserById, getDb, db } from "../db";
import { llmProviders, modelProviderMap } from "../../drizzle/schema";
import { eq, asc, and } from "drizzle-orm";
import {
  getCreditBalance,
  getCreditBalanceByOpenId,
  hasEnoughCredits,
  deductCredits,
  calculateCreditsFromCost,
  calculateCreditsForLLM,
} from "../services/creditService";
import { debugLog, debugError } from "./logger";
import { handleChatWithRouter, handleStreamWithRouter } from "../services/llmRoutesHandler";
import { auditLogger } from "../services/auditLogger";
import { getTraceId } from "../services/traceContext";
import { buildContextStateMessages } from "../services/contextEngineAdapter";
import {
  acquireDelegatedWorkerConcurrencySlot,
  buildDelegatedWorkerOriginMetadata,
  DelegatedWorkerPlatformError,
  enforceDelegatedWorkerLlmRoutePolicy,
  enforceDelegatedWorkerModelSelectionPolicy,
  enforceDelegatedWorkerSpendGuardrails,
} from "../services/delegatedWorkerPlatformService";
import { logRequest as logCostRequest } from "../services/costTracker";
import { registerResponsesRoutes } from "./responsesRoutes";
import { runPlanner } from "../services/taskPlannerMiddleware";
import {
  deriveChatSelectionContext,
  readStoredChatModelSelectionState,
  resolveChatModelSelection,
  storedSelectionStateFromResolved,
  writeStoredChatModelSelectionState,
} from "../services/chatModelSelection";
import {
  findCatalogModel,
  isSafeProviderModelId,
  type AvailableLlmProviderModel,
  type LlmRequestConfig,
} from "../services/llmProviderCatalog";
import {
  normalizeLlmUsage,
  type NormalizedLlmUsage,
} from "../services/llmUsage";
import { getConversationById, updateConversation } from "../services/chatService";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { estimateMessages } from "../utils/tokenEstimator";

// --- Provider-specific Rate Limiter with Queue System ---
// Uses Bottleneck with Redis for distributed rate limiting when available
// Falls back to in-memory limiting for single-instance deployments

import {
  getProviderLimiter,
  getProviderLimitConfig,
  scheduleWithLimiter,
  getLimiterStats,
  getAllLimiterStats,
  getLimiterCounts,
  recordModelUsage,
  type LimiterStats,
} from "../services/llmRateLimiter";
import { buildModelProviderMapLookupCondition } from "../services/modelLookup";
import { isRedisAvailable } from "../services/redis";

// In-memory fallback for when Redis/Bottleneck is not available
interface ProviderQueueConfig {
  minDelayMs: number;
  maxConcurrent: number;
  freeModelMultiplier: number;
}

interface ProviderRateLimiter {
  lastRequestTime: number;
  activeRequests: number;
  waitingCount: number;
  config: ProviderQueueConfig;
}

const providerRateLimiters: Map<string, ProviderRateLimiter> = new Map();

const PROVIDER_QUEUE_CONFIGS: Record<string, ProviderQueueConfig> = {
  'opencode-zen': { minDelayMs: 1500, maxConcurrent: 2, freeModelMultiplier: 2 },
  'opencode': { minDelayMs: 1500, maxConcurrent: 2, freeModelMultiplier: 2 },
  'openrouter': { minDelayMs: 50, maxConcurrent: 10, freeModelMultiplier: 1.5 },
  'default': { minDelayMs: 200, maxConcurrent: 5, freeModelMultiplier: 1.5 },
};

function getInMemoryRateLimiter(providerName: string): ProviderRateLimiter {
  const key = providerName.toLowerCase();
  let limiter = providerRateLimiters.get(key);

  if (!limiter) {
    const config = PROVIDER_QUEUE_CONFIGS[key] ?? PROVIDER_QUEUE_CONFIGS['default'];
    limiter = { lastRequestTime: 0, activeRequests: 0, waitingCount: 0, config };
    providerRateLimiters.set(key, limiter);
  }

  return limiter;
}

/**
 * Acquire a slot in the provider queue
 * Uses Bottleneck with Redis when available, falls back to in-memory
 */
async function acquireProviderSlot(providerName: string, isFreeModel: boolean = false): Promise<{ queuePosition: number }> {
  // Try to use Bottleneck if available (has Redis)
  // Note: For streaming, we still need the slot pattern since we can't wrap
  // the entire stream in scheduleWithLimiter
  const limiter = getInMemoryRateLimiter(providerName);
  limiter.waitingCount++;
  const queuePosition = limiter.waitingCount + limiter.activeRequests;

  // Wait for concurrency slot
  while (limiter.activeRequests >= limiter.config.maxConcurrent) {
    debugLog("LLM", `Waiting for slot: ${providerName} (active: ${limiter.activeRequests}/${limiter.config.maxConcurrent})`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Apply rate limit delay
  const now = Date.now();
  const timeSinceLastRequest = now - limiter.lastRequestTime;
  let requiredDelay = limiter.config.minDelayMs;

  if (isFreeModel) {
    requiredDelay = Math.floor(requiredDelay * limiter.config.freeModelMultiplier);
  }

  if (timeSinceLastRequest < requiredDelay) {
    const waitTime = requiredDelay - timeSinceLastRequest;
    debugLog("LLM", `Rate limiting ${providerName}: waiting ${waitTime}ms (free=${isFreeModel})`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  limiter.lastRequestTime = Date.now();
  limiter.activeRequests++;
  limiter.waitingCount--;

  return { queuePosition };
}

/**
 * Release a slot in the provider queue
 */
function releaseProviderSlot(providerName: string): void {
  const limiter = getInMemoryRateLimiter(providerName);
  limiter.activeRequests = Math.max(0, limiter.activeRequests - 1);
}

/**
 * Get current queue status for a provider
 */
function getProviderQueueStatus(providerName: string): { active: number; waiting: number; maxConcurrent: number } {
  const limiter = getInMemoryRateLimiter(providerName);
  return {
    active: limiter.activeRequests,
    waiting: limiter.waitingCount,
    maxConcurrent: limiter.config.maxConcurrent,
  };
}

// Legacy function for backwards compatibility
async function waitForRateLimit(providerName: string): Promise<void> {
  await acquireProviderSlot(providerName, false);
}

// Export for use by other modules
export { acquireProviderSlot, releaseProviderSlot, getProviderQueueStatus, getLimiterStats, getAllLimiterStats };

// --- User-friendly Error Parsing ---

interface ParsedError {
  message: string;
  userMessage: string;
  errorType: 'rate_limit' | 'overloaded' | 'invalid_model' | 'auth' | 'network' | 'unknown';
  suggestedAction: 'retry' | 'wait' | 'switch_provider' | 'check_model' | 'contact_support';
  provider?: string;
  retryAfterMs?: number;
}

/**
 * Parse provider error response into user-friendly format
 */
function parseProviderError(errorText: string, providerName: string): ParsedError {
  const lowerError = errorText.toLowerCase();

  // Rate limit / Too many requests
  if (lowerError.includes('too_many_requests') || lowerError.includes('rate_limit') || lowerError.includes('rate limit')) {
    return {
      message: errorText,
      userMessage: `${providerName} is currently handling many requests. Please wait a moment and try again.`,
      errorType: 'rate_limit',
      suggestedAction: 'wait',
      provider: providerName,
      retryAfterMs: 5000,
    };
  }

  // Service overloaded / Deadline exceeded
  if (lowerError.includes('overload') || lowerError.includes('deadline') || lowerError.includes('service is overloaded')) {
    return {
      message: errorText,
      userMessage: `${providerName} is currently overloaded. Try using a different provider like OpenRouter, or wait a few minutes.`,
      errorType: 'overloaded',
      suggestedAction: 'switch_provider',
      provider: providerName,
      retryAfterMs: 30000,
    };
  }

  // Invalid model
  if (lowerError.includes('invalid') && lowerError.includes('model') || lowerError.includes('not a valid model')) {
    return {
      message: errorText,
      userMessage: `This model may be temporarily unavailable. Please try a different model.`,
      errorType: 'invalid_model',
      suggestedAction: 'check_model',
      provider: providerName,
    };
  }

  // Authentication errors
  if (lowerError.includes('unauthorized') || lowerError.includes('invalid api key') || lowerError.includes('authentication')) {
    return {
      message: errorText,
      userMessage: `Authentication failed for ${providerName}. Please check the API key configuration.`,
      errorType: 'auth',
      suggestedAction: 'contact_support',
      provider: providerName,
    };
  }

  // Network / Connection errors
  if (lowerError.includes('network') || lowerError.includes('connection') || lowerError.includes('timeout')) {
    return {
      message: errorText,
      userMessage: `Connection to ${providerName} failed. Please check your network and try again.`,
      errorType: 'network',
      suggestedAction: 'retry',
      provider: providerName,
      retryAfterMs: 2000,
    };
  }

  // Default unknown error
  return {
    message: errorText,
    userMessage: `An error occurred with ${providerName}. Please try again or use a different provider.`,
    errorType: 'unknown',
    suggestedAction: 'retry',
    provider: providerName,
  };
}

/**
 * Format error response for API
 */
function formatErrorResponse(error: ParsedError): object {
  return {
    error: {
      message: error.message,
      userMessage: error.userMessage,
      errorType: error.errorType,
      suggestedAction: error.suggestedAction,
      provider: error.provider,
      retryAfterMs: error.retryAfterMs,
    },
  };
}

// Cached provider config (refreshed periodically)
interface LlmProviderConfig {
  providerId?: number;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string | null;
  availableModels?: AvailableLlmProviderModel[] | null;
}

let cachedProvider: LlmProviderConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // Refresh every 60 seconds

export function resetLlmRouteStateForTests(): void {
  cachedProvider = null;
  cacheTimestamp = 0;
  providerRateLimiters.clear();
}

type ResolvedModel = {
  providerModelId: string;
  apiStyle: 'chat-completions' | 'responses' | 'messages' | 'gemini';
} | null;

type KieValidationError = {
  status: number;
  message: string;
};

/**
 * Resolve the provider-specific model ID and API style from the database
 * Returns both the providerModelId and apiStyle for correct endpoint routing
 *
 * Lookup strategy:
 * 1. First try exact match on modelId (e.g., "kimi-k2.5-free")
 * 2. If not found, try matching on providerModelId (e.g., "moonshotai/kimi-k2.5")
 * This provides flexibility for clients using either format
 */
async function resolveProviderModel(modelId: string, providerId: number): Promise<ResolvedModel> {
  try {
    const { modelProviderMap } = await import("../../drizzle/schema");
    let [mapping] = await db
      .select({
        providerModelId: modelProviderMap.providerModelId,
        apiStyle: modelProviderMap.apiStyle,
      })
      .from(modelProviderMap)
      .where(and(
        buildModelProviderMapLookupCondition(modelId),
        eq(modelProviderMap.providerId, providerId),
        eq(modelProviderMap.isEnabled, true)
      ))
      .limit(1);

    if (!mapping) return null;

    return {
      providerModelId: mapping.providerModelId,
      apiStyle: mapping.apiStyle as 'chat-completions' | 'responses' | 'messages' | 'gemini',
    };
  } catch (error) {
    console.error("[LLM] Failed to resolve provider model:", { modelId, providerId, error });
    return null;
  }
}

/**
 * Resolve a provider-specific model ID across ALL enabled providers (no provider constraint).
 * Used when no preferredProvider is specified — picks the highest-priority enabled mapping.
 */
async function resolveProviderModelAny(modelId: string): Promise<ResolvedModel> {
  try {
    const { modelProviderMap } = await import("../../drizzle/schema");
    let [mapping] = await db
      .select({
        providerModelId: modelProviderMap.providerModelId,
        apiStyle: modelProviderMap.apiStyle,
      })
      .from(modelProviderMap)
      .where(and(
        buildModelProviderMapLookupCondition(modelId),
        eq(modelProviderMap.isEnabled, true),
      ))
      .orderBy(asc(modelProviderMap.priority))
      .limit(1);

    if (!mapping) return null;
    return {
      providerModelId: mapping.providerModelId,
      apiStyle: mapping.apiStyle as 'chat-completions' | 'responses' | 'messages' | 'gemini',
    };
  } catch (error) {
    console.error("[LLM] Failed to resolve model (any provider):", { modelId, error });
    return null;
  }
}

/**
 * Get a specific LLM provider configuration by ID
 */
async function getLlmProviderById(providerId: number): Promise<LlmProviderConfig | null> {
  try {
    const [provider] = await db
      .select({
        providerId: llmProviders.id,
        providerName: llmProviders.providerName,
        baseUrl: llmProviders.baseUrl,
        apiKeyEncrypted: llmProviders.apiKeyEncrypted,
        defaultModel: llmProviders.defaultModel,
        availableModels: llmProviders.availableModels,
      })
      .from(llmProviders)
      .where(and(eq(llmProviders.id, providerId), eq(llmProviders.isEnabled, true)))
      .limit(1);

    if (!provider || !provider.apiKeyEncrypted || !provider.baseUrl) {
      return null;
    }

    const apiKey = decrypt(provider.apiKeyEncrypted);
    if (!apiKey) {
      console.warn("[LLM] Failed to decrypt API key for provider:", provider.providerName);
      return null;
    }

    return {
      providerId: provider.providerId,
      providerName: provider.providerName,
      baseUrl: provider.baseUrl,
      apiKey,
      defaultModel: provider.defaultModel,
      availableModels: provider.availableModels as AvailableLlmProviderModel[] | null,
    };
  } catch (error) {
    console.error("[LLM] Failed to get provider config by ID:", providerId, error);
    return null;
  }
}

/**
 * Get the active LLM provider configuration from database
 */
async function getActiveLlmProvider(): Promise<LlmProviderConfig | null> {
  const now = Date.now();

  // Return cached config if still valid
  if (cachedProvider && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProvider;
  }

  try {
    // Get the first enabled provider with an API key
    const [provider] = await db
      .select({
        providerId: llmProviders.id,
        providerName: llmProviders.providerName,
        baseUrl: llmProviders.baseUrl,
        apiKeyEncrypted: llmProviders.apiKeyEncrypted,
        defaultModel: llmProviders.defaultModel,
        availableModels: llmProviders.availableModels,
      })
      .from(llmProviders)
      .where(eq(llmProviders.isEnabled, true))
      .orderBy(asc(llmProviders.sortOrder))
      .limit(1);

    if (!provider || !provider.apiKeyEncrypted || !provider.baseUrl) {
      cachedProvider = null;
      cacheTimestamp = now;
      return null;
    }

    const apiKey = decrypt(provider.apiKeyEncrypted);
    if (!apiKey) {
      console.warn("[LLM] Failed to decrypt API key for provider:", provider.providerName);
      cachedProvider = null;
      cacheTimestamp = now;
      return null;
    }

    cachedProvider = {
      providerId: provider.providerId,
      providerName: provider.providerName,
      baseUrl: provider.baseUrl,
      apiKey,
      defaultModel: provider.defaultModel,
      availableModels: provider.availableModels as AvailableLlmProviderModel[] | null,
    };
    cacheTimestamp = now;

    return cachedProvider;
  } catch (error) {
    console.error("[LLM] Failed to get provider config from database:", error);
    return null;
  }
}

const MAX_LLM_BODY_BYTES = parseInt(process.env.WEB_LLM_MAX_BODY_BYTES || "2097152"); // 2MB
const LLM_RPM = parseInt(process.env.WEB_LLM_RPM || "120");

// Minimum credits required to make an LLM request
const MIN_CREDITS_REQUIRED = parseInt(process.env.WEB_LLM_MIN_CREDITS || "1");

// Whether to skip credit check for static tokens (server-to-server)
const SKIP_CREDIT_CHECK_FOR_STATIC = process.env.WEB_LLM_SKIP_CREDIT_FOR_STATIC === "true";

interface LLMUsageInfo {
  userId: number | null;
  openId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerCostUsd?: number; // Actual cost from provider (e.g. OpenRouter usage.cost)
}

/**
 * Determine the API style based on model ID
 * OpenCode Zen uses different endpoints for different model families
 */
export type ApiStyle = 'chat-completions' | 'responses' | 'messages' | 'gemini';

function getModelCatalogEntry(
  provider: Pick<LlmProviderConfig, "availableModels"> | null | undefined,
  providerModelId: string,
): AvailableLlmProviderModel | null {
  return findCatalogModel(provider?.availableModels, providerModelId);
}

function getModelRequestConfig(
  provider: Pick<LlmProviderConfig, "availableModels"> | null | undefined,
  providerModelId: string,
): LlmRequestConfig | null {
  return getModelCatalogEntry(provider, providerModelId)?.config ?? null;
}

function isKieProvider(providerName: string): boolean {
  return providerName.trim().toLowerCase() === "kie_ai";
}

function isFunctionTool(tool: unknown): boolean {
  return !!tool && typeof tool === "object" && (tool as { type?: unknown }).type === "function";
}

function isWebSearchTool(tool: unknown): boolean {
  const type = typeof tool === "object" && tool ? String((tool as { type?: unknown }).type ?? "") : "";
  return type.includes("web_search");
}

function isGoogleSearchTool(tool: unknown): boolean {
  const type = typeof tool === "object" && tool ? String((tool as { type?: unknown }).type ?? "") : "";
  return type.includes("google") && type.includes("search");
}

function getConfiguredRequestFieldKeys(
  requestConfig: LlmRequestConfig | null | undefined,
): Set<string> {
  return new Set([
    ...((requestConfig?.inputFields ?? []).map((field) => field.key)),
    ...(requestConfig?.passthroughFields ?? []),
  ]);
}

function hasConflictField(body: any, field: string): boolean {
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  const hasFunctionTools = tools.some(isFunctionTool);
  const hasWebSearch = tools.some(isWebSearchTool);
  const hasGoogleSearch = tools.some(isGoogleSearchTool);

  switch (field) {
    case "function_tools":
      return hasFunctionTools;
    case "web_search":
      return hasWebSearch;
    case "google_search":
      return hasGoogleSearch;
    case "response_format":
      return body?.response_format !== undefined || body?.text?.format !== undefined;
    default: {
      const value = body?.[field];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null;
    }
  }
}

function validateKieToolConflicts(
  body: any,
  apiStyle: ApiStyle | undefined,
  requestConfig: LlmRequestConfig | null,
): KieValidationError | null {
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  const hasFunctionTools = tools.some(isFunctionTool);
  const hasWebSearch = tools.some(isWebSearchTool);
  const hasGoogleSearch = tools.some(isGoogleSearchTool);
  const hasResponseFormat =
    body?.response_format !== undefined
    || body?.text?.format !== undefined;

  for (const conflict of requestConfig?.conflicts ?? []) {
    const activeFields = conflict.fields.filter((field) => hasConflictField(body, field));
    if (activeFields.length < 2) {
      continue;
    }

    const fieldSet = new Set(activeFields);
    if (fieldSet.has("web_search") && fieldSet.has("function_tools") && apiStyle === "responses") {
      return {
        status: 400,
        message: "Kie responses models do not allow web-search tools together with function tools.",
      };
    }

    if (fieldSet.has("google_search") && fieldSet.has("function_tools") && apiStyle === "chat-completions") {
      return {
        status: 400,
        message: "Kie Gemini models do not allow Google Search and function tools in the same request.",
      };
    }

    if (fieldSet.has("response_format") && fieldSet.has("function_tools") && apiStyle === "chat-completions") {
      return {
        status: 400,
        message: "Kie Gemini models do not allow response_format together with function tools.",
      };
    }

    return {
      status: 400,
      message: `Kie model does not allow ${activeFields.join(" together with ")}.`,
    };
  }

  if (apiStyle === "responses" && hasWebSearch && hasFunctionTools) {
    return {
      status: 400,
      message: "Kie responses models do not allow web-search tools together with function tools.",
    };
  }

  if (apiStyle === "chat-completions" && hasGoogleSearch && hasFunctionTools) {
    return {
      status: 400,
      message: "Kie Gemini models do not allow Google Search and function tools in the same request.",
    };
  }

  if (apiStyle === "chat-completions" && hasResponseFormat && hasFunctionTools) {
    return {
      status: 400,
      message: "Kie Gemini models do not allow response_format together with function tools.",
    };
  }

  return null;
}

function getApiStyleForModel(modelId: string): ApiStyle {
  const id = modelId.toLowerCase();

  // OpenAI Responses API (gpt-5.x models)
  if (id.startsWith('gpt-')) {
    return 'responses';
  }

  // Anthropic Messages API (claude models)
  if (id.startsWith('claude-')) {
    return 'messages';
  }

  // Google Gemini (special per-model endpoint)
  if (id.startsWith('gemini-')) {
    return 'gemini';
  }

  // Default: OpenAI-compatible Chat Completions (kimi, glm, minimax, qwen, big-pickle, etc.)
  return 'chat-completions';
}

/**
 * Resolve the API endpoint URL based on provider base URL and API style
 * The apiStyle is read from database (model_provider_map.apiStyle)
 *
 * Provider-specific endpoint handling:
 * - OpenCode Zen: Uses apiStyle from database (chat-completions, responses, messages, gemini)
 * - Anthropic: Uses /messages endpoint (native API)
 * - Google: Uses /models/{model}:generateContent endpoint (native API)
 * - Others: Use standard /chat/completions (OpenAI-compatible)
 */
export function resolveApiUrl(
  baseUrl: string,
  modelId: string,
  providerName: string,
  apiStyle?: ApiStyle
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const providerLower = providerName.toLowerCase();

  if (providerLower === "kie_ai") {
    if (apiStyle === "messages") {
      return `${base}/claude/v1/messages`;
    }
    if (apiStyle === "responses") {
      if (modelId === "gpt-5-4") {
        return `${base}/codex/v1/responses`;
      }
      return `${base}/api/v1/responses`;
    }
    if (apiStyle === "chat-completions") {
      return `${base}/${modelId}/v1/chat/completions`;
    }
  }

  // OpenCode Zen: Use apiStyle from database for endpoint routing
  if (providerLower.includes('opencode') || providerLower.includes('zen')) {
    const style = apiStyle || getApiStyleForModel(modelId);

    switch (style) {
      case 'responses':
        return base.includes("/v1") ? `${base}/responses` : `${base}/v1/responses`;
      case 'messages':
        return base.includes("/v1") ? `${base}/messages` : `${base}/v1/messages`;
      case 'gemini':
        return base.includes("/v1") ? `${base}/models/${modelId}` : `${base}/v1/models/${modelId}`;
      case 'chat-completions':
      default:
        return base.includes("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    }
  }

  // Direct Anthropic: Uses /messages endpoint with native API format
  if (providerLower === 'anthropic') {
    // Anthropic API: https://api.anthropic.com/v1/messages
    return base.includes("/v1") ? `${base}/messages` : `${base}/v1/messages`;
  }

  // Direct Google AI: Uses /models/{model}:generateContent endpoint
  if (providerLower === 'google' || providerLower.includes('gemini')) {
    // Google AI API: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    // Note: Google uses different versioning (v1beta vs v1)
    return `${base}/models/${modelId}:generateContent`;
  }

  // Generic apiStyle routing for any provider (e.g., direct OpenAI with Responses API)
  if (apiStyle === 'responses') {
    return base.includes("/v1") ? `${base}/responses` : `${base}/v1/responses`;
  }

  // All other providers: Use standard OpenAI-compatible /chat/completions
  // This includes: OpenRouter, OpenAI, Groq, DeepSeek, Qwen, Zhipu, Minimax, Moonshot, Together, Fireworks, Ollama
  if (base.includes("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

// Legacy function for backward compatibility
function resolveChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (base.includes("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * Build upstream headers based on provider type
 * Different providers require different authentication methods
 */
function upstreamHeaders(apiKey: string, providerName?: string): Record<string, string> {
  const providerLower = (providerName || '').toLowerCase();

  // Anthropic: Uses x-api-key header and requires anthropic-version
  if (providerLower === 'anthropic') {
    return {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
  }

  // Google AI: Uses x-goog-api-key header
  if (providerLower === 'google' || providerLower.includes('gemini')) {
    return {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    };
  }

  // All other providers: Standard Bearer token auth
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Internal fields that should NOT be sent to upstream LLM APIs
 * These are used for internal routing and message tracking
 */
const INTERNAL_FIELDS = [
  'conversationId',
  'preferredProvider',
  'modelSelection',
  'modelSelectionContext',
  'skillUsed',
  'skillArgs',
  'saveMessage',
  '_internal',
] as const;

/**
 * Extract only valid OpenAI Chat Completions API fields from request body
 * Filters out internal fields that are not part of the LLM API spec
 */
function extractOpenAIFields(
  body: any,
  extraAllowedFields: string[] = [],
): Record<string, any> {
  // Valid OpenAI Chat Completions API fields
  const validFields = new Set([
    'messages',
    'temperature',
    'top_p',
    'max_tokens',
    'frequency_penalty',
    'presence_penalty',
    'stop',
    'n',
    'user',
    'logit_bias',
    'logprobs',
    'top_logprobs',
    'response_format',
    'seed',
    'tools',
    'tool_choice',
    'parallel_tool_calls',
    'service_tier',
    // Note: 'model' and 'stream' are handled separately
    ...extraAllowedFields,
  ]);

  const result: Record<string, any> = {};
  for (const field of validFields) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }
  return result;
}

export function validateKieRequestFields(
  body: any,
  apiStyle: ApiStyle | undefined,
  requestConfig: LlmRequestConfig | null,
): KieValidationError | null {
  const internalAllowed = new Set([
    "conversationId",
    "preferredProvider",
    "skillUsed",
    "skillArgs",
    "saveMessage",
    "_internal",
  ]);

  const routeAllowedByStyle: Record<string, string[]> = {
    responses: [
      "model",
      "input",
      "instructions",
      "text",
      "temperature",
      "top_p",
      "max_output_tokens",
      "store",
      "metadata",
      "stream",
      "previous_response_id",
      "max_budget_credits",
    ],
    messages: [
      "model",
      "messages",
      "max_tokens",
      "temperature",
      "top_p",
      "metadata",
      "stream",
    ],
    "chat-completions": [
      "model",
      "messages",
      "temperature",
      "top_p",
      "max_tokens",
      "frequency_penalty",
      "presence_penalty",
      "stop",
      "n",
      "user",
      "logit_bias",
      "logprobs",
      "top_logprobs",
      "seed",
      "parallel_tool_calls",
      "service_tier",
      "stream",
    ],
  };

  const configuredFieldKeys = getConfiguredRequestFieldKeys(requestConfig);

  const allowed = new Set([
    ...(routeAllowedByStyle[apiStyle ?? "chat-completions"] ?? []),
    ...configuredFieldKeys,
    ...INTERNAL_FIELDS,
    ...internalAllowed,
  ]);

  const unknownKeys = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    return {
      status: 400,
      message: `Unsupported request fields for Kie model: ${unknownKeys.join(", ")}`,
    };
  }

  return validateKieToolConflicts(body, apiStyle, requestConfig);
}

/**
 * Estimate a reasonable max_tokens based on the skill category and message context.
 *
 * This prevents requesting more tokens than needed — especially important for
 * providers like OpenRouter where max_tokens counts against your balance even
 * if the model generates far fewer tokens.
 *
 * Categories:
 *   - Media prompt generation (image/video/audio skills): short structured output → 2048
 *   - Chat/translation/brainstorm: medium conversational output → 4096
 *   - Article/review/content writing: long-form content → 8192
 *   - Complex/unknown: generous default → 4096
 *
 * The client or skill's executionPolicy can always override this.
 */
function estimateMaxTokens(skillUsed?: string, messages?: any[]): number {
  // If no skill, estimate from conversation length
  if (!skillUsed) {
    // Short conversations need less output
    const msgCount = Array.isArray(messages) ? messages.length : 0;
    if (msgCount <= 2) return 4096;
    if (msgCount <= 6) return 4096;
    return 8192;
  }

  // Skill-based estimation using slug patterns (no hardcoded skill IDs)
  const slug = skillUsed.toLowerCase();

  // Media prompt skills: generate short structured prompts (JSON/text)
  if (
    slug.includes("image") ||
    slug.includes("video") ||
    slug.includes("audio") ||
    slug.includes("prompt-engineer") ||
    slug.includes("infographic") ||
    slug.includes("media")
  ) {
    return 2048;
  }

  // Article/content/review skills: long-form output
  if (
    slug.includes("article") ||
    slug.includes("writer") ||
    slug.includes("review") ||
    slug.includes("blog") ||
    slug.includes("content") ||
    slug.includes("seo")
  ) {
    return 8192;
  }

  // Code/analysis skills: medium-to-large output
  if (
    slug.includes("code") ||
    slug.includes("analyze") ||
    slug.includes("debug")
  ) {
    return 8192;
  }

  // Scheduling/alert skills: very short output
  if (slug.includes("alert") || slug.includes("schedule")) {
    return 1024;
  }

  // Default: reasonable middle ground
  return 4096;
}

/**
 * Transform OpenAI-format request body to provider-specific format
 * IMPORTANT: This function filters out internal fields (conversationId, preferredProvider, etc.)
 * to prevent them from being sent to upstream LLM APIs
 */
export function transformRequestBody(
  body: any,
  providerName: string,
  model: string,
  stream: boolean,
  apiStyle?: ApiStyle,
  requestConfig?: LlmRequestConfig | null,
): any {
  const providerLower = providerName.toLowerCase();
  const isKieMessagesProvider = isKieProvider(providerName);

  const configuredFieldKeys = getConfiguredRequestFieldKeys(requestConfig);

  const normalizeAnthropicContentValue = (content: unknown): unknown => {
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === "string") {
          return { type: "text", text: part };
        }
        if (
          part
          && typeof part === "object"
          && (part as { type?: unknown }).type === "text"
          && typeof (part as { text?: unknown }).text !== "string"
          && typeof (part as { content?: unknown }).content === "string"
        ) {
          return { type: "text", text: (part as { content: string }).content };
        }
        return part;
      });
    }
    if (content && typeof content === "object") {
      return [content];
    }
    return content ?? "";
  };

  const toAnthropicTextBlocks = (content: unknown): Array<Record<string, unknown>> => {
    const normalizedContent = normalizeAnthropicContentValue(content);
    if (typeof normalizedContent === "string") {
      return normalizedContent.length > 0
        ? [{ type: "text", text: normalizedContent }]
        : [];
    }
    if (!Array.isArray(normalizedContent)) {
      return [];
    }
    return normalizedContent.flatMap((part) => {
      if (typeof part === "string") {
        return part.length > 0 ? [{ type: "text", text: part }] : [];
      }
      if (part && typeof part === "object") {
        return [part as Record<string, unknown>];
      }
      return [];
    });
  };

  const parseToolCallArguments = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  };

  const buildAnthropicMessages = (messages: any[]): any[] => {
    const transformedMessages: any[] = [];
    let pendingToolResults: Array<Record<string, unknown>> = [];

    const flushPendingToolResults = () => {
      if (pendingToolResults.length === 0) {
        return;
      }
      transformedMessages.push({
        role: "user",
        content: pendingToolResults,
      });
      pendingToolResults = [];
    };

    for (const message of messages) {
      if (!message || typeof message !== "object") {
        continue;
      }

      if (message.role === "tool" || message.role === "function") {
        pendingToolResults.push({
          type: "tool_result",
          tool_use_id:
            typeof message.tool_call_id === "string" && message.tool_call_id.length > 0
              ? message.tool_call_id
              : crypto.randomUUID(),
          content:
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content ?? ""),
        });
        continue;
      }

      flushPendingToolResults();

      if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        const contentBlocks = [
          ...toAnthropicTextBlocks(message.content),
          ...message.tool_calls.flatMap((toolCall: any) => {
            if (
              !toolCall
              || typeof toolCall !== "object"
              || typeof toolCall.function?.name !== "string"
            ) {
              return [];
            }
            return [{
              type: "tool_use",
              id:
                typeof toolCall.id === "string" && toolCall.id.length > 0
                  ? toolCall.id
                  : crypto.randomUUID(),
              name: toolCall.function.name,
              input: parseToolCallArguments(toolCall.function.arguments),
            }];
          }),
        ];

        transformedMessages.push({
          role: "assistant",
          content: contentBlocks.length > 0 ? contentBlocks : "",
        });
        continue;
      }

      transformedMessages.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content: normalizeAnthropicContentValue(message.content),
      });
    }

    flushPendingToolResults();
    return transformedMessages;
  };

  const normalizeResponsesContentPart = (
    part: unknown,
  ): Record<string, unknown> | null => {
    if (typeof part === "string") {
      const text = part.trim();
      return text.length > 0 ? { type: "input_text", text } : null;
    }

    if (!part || typeof part !== "object") {
      return null;
    }

    const record = part as Record<string, unknown>;

    if (typeof record.text === "string" && record.text.trim().length > 0) {
      return { type: "input_text", text: record.text };
    }

    if (record.type === "text" && typeof record.content === "string" && record.content.trim().length > 0) {
      return { type: "input_text", text: record.content };
    }

    if (record.type === "image_url") {
      const imageValue = record.image_url;
      const imageUrl =
        typeof imageValue === "string"
          ? imageValue.trim()
          : imageValue && typeof imageValue === "object"
            ? typeof (imageValue as Record<string, unknown>).url === "string"
              ? String((imageValue as Record<string, unknown>).url).trim()
              : ""
            : "";

      if (!imageUrl) {
        return null;
      }

      const detail =
        imageValue && typeof imageValue === "object" && typeof (imageValue as Record<string, unknown>).detail === "string"
          ? String((imageValue as Record<string, unknown>).detail)
          : typeof record.detail === "string"
            ? String(record.detail)
            : undefined;

      return detail
        ? { type: "input_image", image_url: imageUrl, detail }
        : { type: "input_image", image_url: imageUrl };
    }

    if (record.type === "file_url") {
      const fileValue = record.file_url;
      const fileUrl =
        typeof fileValue === "string"
          ? fileValue.trim()
          : fileValue && typeof fileValue === "object"
            ? typeof (fileValue as Record<string, unknown>).url === "string"
              ? String((fileValue as Record<string, unknown>).url).trim()
              : ""
            : "";

      if (!fileUrl) {
        return null;
      }

      return { type: "input_file", file_url: fileUrl };
    }

    if (typeof record.content === "string" && record.content.trim().length > 0) {
      return { type: "input_text", text: record.content };
    }

    return null;
  };

  const normalizeResponsesMessageContent = (
    content: unknown,
  ): string | Array<Record<string, unknown>> => {
    if (typeof content === "string") {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const parts = content
        .map((part) => normalizeResponsesContentPart(part))
        .filter((part): part is Record<string, unknown> => Boolean(part));

      if (parts.length === 0) {
        return "";
      }

      const hasNonTextPart = parts.some((part) => part.type !== "input_text");
      if (!hasNonTextPart) {
        return parts
          .map((part) => (typeof part.text === "string" ? part.text : ""))
          .filter((part) => part.length > 0)
          .join("\n");
      }

      return parts;
    }

    const normalized = normalizeResponsesContentPart(content);
    if (!normalized) {
      return "";
    }
    return normalized.type === "input_text" && typeof normalized.text === "string"
      ? normalized.text
      : [normalized];
  };

  const extractResponsesTextFromContent = (content: unknown): string => {
    const normalized = normalizeResponsesMessageContent(content);
    if (typeof normalized === "string") {
      return normalized;
    }
    return normalized
      .map((part) => {
        if (part.type === "input_text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter((part) => part.length > 0)
      .join("\n");
  };

  if (apiStyle === "responses") {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const instructions = messages
      .filter((message: any) => message?.role === "system")
      .map((message: any) => extractResponsesTextFromContent(message.content))
      .filter((part: string) => part.length > 0)
      .join("\n\n");

    const input = messages
      .filter((message: any) => message?.role !== "system")
      .map((message: any) => ({
        role: message?.role === "assistant" ? "assistant" : "user",
        content: normalizeResponsesMessageContent(message?.content),
      }));

    const normalizedText = (() => {
      const incomingText =
        body.text && typeof body.text === "object" && !Array.isArray(body.text)
          ? { ...(body.text as Record<string, unknown>) }
          : undefined;

      if (body.response_format !== undefined) {
        return {
          ...(incomingText ?? {}),
          format: body.response_format,
        };
      }

      return incomingText;
    })();

    const transformed: Record<string, unknown> = {
      model,
      input,
      stream,
      ...(instructions ? { instructions } : {}),
      ...(normalizedText ? { text: normalizedText } : {}),
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
      ...(body.max_output_tokens !== undefined
        ? { max_output_tokens: body.max_output_tokens }
        : body.max_tokens !== undefined
          ? { max_output_tokens: body.max_tokens }
          : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      ...(body.tools !== undefined ? { tools: body.tools } : {}),
      ...(body.tool_choice !== undefined ? { tool_choice: body.tool_choice } : {}),
      ...(body.previous_response_id !== undefined ? { previous_response_id: body.previous_response_id } : {}),
    };

    for (const field of requestConfig?.passthroughFields ?? []) {
      if (field === "response_format") {
        continue;
      }
      if (field === "text" && normalizedText) {
        continue;
      }
      if (
        body[field] !== undefined
        && !Object.prototype.hasOwnProperty.call(transformed, field)
      ) {
        transformed[field] = body[field];
      }
    }

    return transformed;
  }

  // Messages-style APIs: Anthropic native and Kie Claude
  if (apiStyle === "messages" || providerLower === 'anthropic') {
    const messages = body.messages || [];

    // Extract system message (Anthropic uses separate 'system' field)
    const systemMessages = messages.filter((m: any) => m.role === 'system');
    const nonSystemMessages = messages.filter((m: any) => m.role !== 'system');

    const transformed: Record<string, unknown> = {
      model,
      max_tokens: body.max_tokens || 4096,
      stream,
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      system: systemMessages.map((m: any) => m.content).join('\n\n') || undefined,
      messages: buildAnthropicMessages(nonSystemMessages),
      ...(body.tools !== undefined && (!isKieMessagesProvider || configuredFieldKeys.has("tools")) ? { tools: body.tools } : {}),
      ...(body.tool_choice !== undefined && (!isKieMessagesProvider || configuredFieldKeys.has("tool_choice")) ? { tool_choice: body.tool_choice } : {}),
      ...(body.thinkingFlag !== undefined && (!isKieMessagesProvider || configuredFieldKeys.has("thinkingFlag")) ? { thinkingFlag: body.thinkingFlag } : {}),
      ...(body.output_config !== undefined && (!isKieMessagesProvider || configuredFieldKeys.has("output_config")) ? { output_config: body.output_config } : {}),
    };

    for (const field of requestConfig?.passthroughFields ?? []) {
      if (
        body[field] !== undefined
        && !Object.prototype.hasOwnProperty.call(transformed, field)
      ) {
        transformed[field] = body[field];
      }
    }

    return transformed;
  }

  // Google AI: Completely different format
  if (providerLower === 'google' || providerLower.includes('gemini')) {
    const messages = body.messages || [];

    // Convert to Google's format
    const contents = messages
      .filter((m: any) => m.role !== 'system')
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // System instruction (if any)
    const systemMessages = messages.filter((m: any) => m.role === 'system');
    const systemInstruction = systemMessages.length > 0
      ? { parts: [{ text: systemMessages.map((m: any) => m.content).join('\n\n') }] }
      : undefined;

    return {
      contents,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: body.max_tokens || 8192,
        temperature: body.temperature ?? 1.0,
        topP: body.top_p ?? 0.95,
      },
    };
  }

  // All other providers: Standard OpenAI format
  // Filter out internal fields to prevent validation errors from upstream APIs
  const cleanBody = extractOpenAIFields(body, requestConfig?.passthroughFields ?? []);
  return { ...cleanBody, model, stream };
}

function extractResponsesOutputText(output: unknown): string {
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const record = item as Record<string, unknown>;
      if (record.type === "message" && Array.isArray(record.content)) {
        return record.content.flatMap((part) => {
          if (!part || typeof part !== "object") {
            return [];
          }
          const contentPart = part as Record<string, unknown>;
          const textValue = contentPart.text;
          if (typeof textValue === "string") {
            return [textValue];
          }
          return [];
        });
      }

      if (record.type === "output_text" && typeof record.text === "string") {
        return [record.text];
      }

      return [];
    })
    .join("");
}

function extractAssistantTextFromChatLikeContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (typeof part === "string") {
        return [part];
      }
      if (!part || typeof part !== "object") {
        return [];
      }
      const record = part as Record<string, unknown>;
      if (typeof record.text === "string") {
        return [record.text];
      }
      if (typeof record.content === "string") {
        return [record.content];
      }
      return [];
    })
    .join("");
}

function extractAnyAssistantText(rawData: any): string {
  const directOutputText = typeof rawData?.output_text === "string"
    ? rawData.output_text
    : typeof rawData?.response?.output_text === "string"
      ? rawData.response.output_text
      : "";
  if (directOutputText) {
    return directOutputText;
  }

  const responsesOutputText = extractResponsesOutputText(rawData?.output ?? rawData?.response?.output);
  if (responsesOutputText) {
    return responsesOutputText;
  }

  const chatLikeMessageContent = rawData?.choices?.[0]?.message?.content;
  const chatLikeText = extractAssistantTextFromChatLikeContent(chatLikeMessageContent);
  if (chatLikeText) {
    return chatLikeText;
  }

  if (typeof chatLikeMessageContent === "string") {
    return chatLikeMessageContent;
  }

  if (typeof rawData?.content === "string") {
    return rawData.content;
  }

  if (typeof rawData?.response?.content === "string") {
    return rawData.response.content;
  }

  return "";
}

function normalizeResponsesApiResponseToChatCompletion(
  rawData: any,
  requestedModelId: string,
) {
  const normalizedUsage = normalizeLlmUsage(rawData, "responses");
  const extractedText = extractAnyAssistantText(rawData);

  return {
    id: rawData?.id || `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: rawData?.model || requestedModelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: extractedText,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: normalizedUsage.inputTokens,
      completion_tokens: normalizedUsage.outputTokens,
      total_tokens: normalizedUsage.totalTokens,
      ...(normalizedUsage.providerReportedCostUsd !== undefined
        ? { cost: normalizedUsage.providerReportedCostUsd }
        : {}),
    },
  };
}

function mapMessagesStopReasonToChatFinishReason(
  stopReason: unknown,
): "stop" | "length" | "tool_calls" | null {
  switch (stopReason) {
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "end_turn":
    case "stop_sequence":
    case "pause_turn":
      return "stop";
    default:
      return null;
  }
}

function extractMessagesTextContent(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  const textParts = content.flatMap((part) => {
    if (!part || typeof part !== "object") {
      return [];
    }

    const candidate =
      (part as { text?: unknown }).text
      ?? (part as { content?: unknown }).content;
    if (typeof candidate === "string" && candidate.length > 0) {
      return [candidate];
    }
    return [];
  });

  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

function extractMessagesToolCalls(content: unknown): Array<{
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}> | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const toolCalls = content.flatMap((part) => {
    if (!part || typeof part !== "object") {
      return [];
    }

    const typedPart = part as {
      id?: unknown;
      type?: unknown;
      name?: unknown;
      input?: unknown;
    };
    if (typedPart.type !== "tool_use" || typeof typedPart.name !== "string") {
      return [];
    }

    return [{
      id: typeof typedPart.id === "string" ? typedPart.id : crypto.randomUUID(),
      type: "function" as const,
      function: {
        name: typedPart.name,
        arguments: JSON.stringify(typedPart.input ?? {}),
      },
    }];
  });

  return toolCalls.length > 0 ? toolCalls : undefined;
}

export function normalizeMessagesApiResponseToChatCompletion(
  data: any,
  model: string,
): any {
  if (!data || typeof data !== "object") {
    return data;
  }

  const normalizedUsage = normalizeLlmUsage(data, "messages");
  const messageContent = extractMessagesTextContent(data.content);
  const toolCalls = extractMessagesToolCalls(data.content);

  return {
    id: typeof data.id === "string" ? data.id : `chatcmpl_${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: typeof data.model === "string" ? data.model : model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: toolCalls && !messageContent ? null : messageContent,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: mapMessagesStopReasonToChatFinishReason(data.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: normalizedUsage.inputTokens,
      completion_tokens: normalizedUsage.outputTokens,
      total_tokens: normalizedUsage.totalTokens,
    },
  };
}

function mergeNormalizedUsage(
  current: NormalizedLlmUsage,
  next: NormalizedLlmUsage,
): NormalizedLlmUsage {
  const inputTokens = Math.max(current.inputTokens, next.inputTokens);
  const outputTokens = Math.max(current.outputTokens, next.outputTokens);
  const totalTokens = Math.max(
    current.totalTokens,
    next.totalTokens,
    inputTokens + outputTokens,
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    providerReportedCostUsd:
      next.providerReportedCostUsd ?? current.providerReportedCostUsd,
    providerReportedCreditsConsumed:
      next.providerReportedCreditsConsumed
      ?? current.providerReportedCreditsConsumed,
  };
}

function extractUsageFromCandidate(
  candidate: unknown,
  apiStyle?: ApiStyle,
): NormalizedLlmUsage {
  if (!candidate || typeof candidate !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  return normalizeLlmUsage(candidate, apiStyle);
}

export function extractStreamingUsageFromSsePayload(
  accumulatedData: string,
  apiStyle?: ApiStyle,
): NormalizedLlmUsage {
  let merged: NormalizedLlmUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  const dataLines = accumulatedData
    .split("\n")
    .filter((line) => line.startsWith("data:"));

  for (const line of dataLines) {
    const raw = line.slice("data:".length).trim();
    if (!raw || raw === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      merged = mergeNormalizedUsage(
        merged,
        extractUsageFromCandidate(parsed, apiStyle),
      );

      if (apiStyle === "messages" && parsed?.message?.usage) {
        merged = mergeNormalizedUsage(
          merged,
          extractUsageFromCandidate(
            { usage: parsed.message.usage, cost: parsed.message.cost },
            "messages",
          ),
        );
      }

      if (apiStyle === "responses" && parsed?.response) {
        merged = mergeNormalizedUsage(
          merged,
          extractUsageFromCandidate(parsed.response, "responses"),
        );
      }
    } catch {
      // Ignore non-JSON or partial lines.
    }
  }

  return {
    ...merged,
    totalTokens:
      merged.totalTokens || merged.inputTokens + merged.outputTokens,
  };
}

type MessagesStreamToolState = {
  id: string;
  name: string;
  argumentsText: string;
  index: number;
};

type MessagesSseTransformState = {
  buffer: string;
  currentEventName: string | null;
  currentDataLines: string[];
  roleSent: boolean;
  completionId: string;
  created: number;
  model: string;
  pendingFinishReason: "stop" | "length" | "tool_calls" | null;
  toolBlocks: Map<number, MessagesStreamToolState>;
  doneSent: boolean;
  sawTerminalEvent: boolean;
  unsupportedEventCounts: Map<string, number>;
};

export function createMessagesSseTransformState(
  fallbackModel: string,
): MessagesSseTransformState {
  return {
    buffer: "",
    currentEventName: null,
    currentDataLines: [],
    roleSent: false,
    completionId: `chatcmpl_${crypto.randomUUID()}`,
    created: Math.floor(Date.now() / 1000),
    model: fallbackModel,
    pendingFinishReason: null,
    toolBlocks: new Map(),
    doneSent: false,
    sawTerminalEvent: false,
    unsupportedEventCounts: new Map(),
  };
}

function recordUnsupportedMessagesEvent(
  state: MessagesSseTransformState,
  key: string,
  payload: unknown,
): void {
  const nextCount = (state.unsupportedEventCounts.get(key) ?? 0) + 1;
  state.unsupportedEventCounts.set(key, nextCount);
  if (nextCount === 1) {
    debugLog("LLM", "Unsupported Claude SSE event encountered", {
      key,
      payload,
    });
  }
}

function encodeChatCompletionSseChunk(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function buildChatCompletionChunk(
  state: MessagesSseTransformState,
  delta: Record<string, unknown>,
  finishReason: "stop" | "length" | "tool_calls" | null = null,
): string {
  return encodeChatCompletionSseChunk({
    id: state.completionId,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  });
}

function ensureAssistantRoleChunk(state: MessagesSseTransformState): string {
  if (state.roleSent) {
    return "";
  }
  state.roleSent = true;
  return buildChatCompletionChunk(state, { role: "assistant" });
}

function processMessagesSseEvent(
  state: MessagesSseTransformState,
  fallbackModel: string,
): string {
  const rawData = state.currentDataLines.join("\n").trim();
  const currentEventName = state.currentEventName;
  state.currentEventName = null;
  state.currentDataLines = [];

  if (!rawData) {
    return "";
  }

  if (rawData === "[DONE]") {
    if (state.doneSent) {
      return "";
    }
    state.sawTerminalEvent = true;
    state.doneSent = true;
    return "data: [DONE]\n\n";
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return "";
  }

  const eventType =
    typeof parsed?.type === "string"
      ? parsed.type
      : currentEventName;

  if (typeof parsed?.message?.id === "string") {
    state.completionId = parsed.message.id;
  }
  if (typeof parsed?.model === "string") {
    state.model = parsed.model;
  } else if (typeof parsed?.message?.model === "string") {
    state.model = parsed.message.model;
  } else {
    state.model = state.model || fallbackModel;
  }

  switch (eventType) {
    case "message_start":
      return ensureAssistantRoleChunk(state);

    case "content_block_start": {
      const block = parsed?.content_block;
      if (!block || typeof block !== "object") {
        return "";
      }

      let output = ensureAssistantRoleChunk(state);
      if (block.type === "tool_use" && typeof parsed?.index === "number") {
        const serializedInput =
          block.input && typeof block.input === "object"
            ? JSON.stringify(block.input)
            : "";
        const hasSeedArguments =
          serializedInput.length > 0 && serializedInput !== "{}";
        const toolState: MessagesStreamToolState = {
          id:
            typeof block.id === "string" && block.id.length > 0
              ? block.id
              : crypto.randomUUID(),
          name: typeof block.name === "string" ? block.name : "tool",
          argumentsText: serializedInput,
          index: parsed.index,
        };
        state.toolBlocks.set(parsed.index, toolState);
        output += buildChatCompletionChunk(state, {
          tool_calls: [
            {
              index: toolState.index,
              id: toolState.id,
              type: "function",
              function: {
                name: toolState.name,
                arguments: hasSeedArguments ? toolState.argumentsText : "",
              },
            },
          ],
        });
      }
      return output;
    }

    case "content_block_delta": {
      const delta = parsed?.delta;
      if (!delta || typeof delta !== "object") {
        return "";
      }

      if (delta.type === "text_delta" && typeof delta.text === "string") {
        return (
          ensureAssistantRoleChunk(state)
          + buildChatCompletionChunk(state, { content: delta.text })
        );
      }

      if (
        delta.type === "input_json_delta"
        && typeof parsed?.index === "number"
        && typeof delta.partial_json === "string"
      ) {
        const toolState = state.toolBlocks.get(parsed.index);
        if (!toolState) {
          return "";
        }
        toolState.argumentsText += delta.partial_json;
        return (
          ensureAssistantRoleChunk(state)
          + buildChatCompletionChunk(state, {
            tool_calls: [
              {
                index: toolState.index,
                id: toolState.id,
                type: "function",
                function: {
                  name: toolState.name,
                  arguments: delta.partial_json,
                },
              },
            ],
          })
        );
      }

      recordUnsupportedMessagesEvent(
        state,
        `content_block_delta:${String((delta as { type?: unknown }).type ?? "unknown")}`,
        parsed,
      );
      return "";
    }

    case "message_delta":
      state.pendingFinishReason = mapMessagesStopReasonToChatFinishReason(
        parsed?.delta?.stop_reason,
      );
      return "";

    case "message_stop": {
      let output = "";
      state.sawTerminalEvent = true;
      if (state.pendingFinishReason !== null) {
        output += buildChatCompletionChunk(
          state,
          {},
          state.pendingFinishReason,
        );
      }
      if (!state.doneSent) {
        state.doneSent = true;
        output += "data: [DONE]\n\n";
      }
      return output;
    }

    default:
      recordUnsupportedMessagesEvent(
        state,
        `event:${String(eventType ?? "unknown")}`,
        parsed,
      );
      return "";
  }
}

export function transformMessagesSseChunkToOpenAi(
  rawChunk: string,
  state: MessagesSseTransformState,
  fallbackModel: string,
): string {
  let output = "";
  state.buffer += rawChunk;

  while (true) {
    const newlineIndex = state.buffer.indexOf("\n");
    if (newlineIndex === -1) {
      break;
    }

    const line = state.buffer.slice(0, newlineIndex).replace(/\r$/, "");
    state.buffer = state.buffer.slice(newlineIndex + 1);

    if (line.length === 0) {
      output += processMessagesSseEvent(state, fallbackModel);
      continue;
    }

    if (line.startsWith("event:")) {
      state.currentEventName = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      state.currentDataLines.push(line.slice("data:".length).trim());
    }
  }

  return output;
}

export function finalizeMessagesSseTransformToOpenAi(
  state: MessagesSseTransformState,
  fallbackModel: string,
): { output: string; completedGracefully: boolean } {
  let output = "";

  const trailingLine = state.buffer.replace(/\r$/, "");
  state.buffer = "";
  if (trailingLine) {
    if (trailingLine.startsWith("event:")) {
      state.currentEventName = trailingLine.slice("event:".length).trim();
    } else if (trailingLine.startsWith("data:")) {
      state.currentDataLines.push(trailingLine.slice("data:".length).trim());
    }
  }

  if (state.currentDataLines.length > 0) {
    output += processMessagesSseEvent(state, fallbackModel);
  }

  if (!state.sawTerminalEvent) {
    return { output, completedGracefully: false };
  }

  if (!state.doneSent) {
    if (state.pendingFinishReason !== null) {
      output += buildChatCompletionChunk(
        state,
        {},
        state.pendingFinishReason,
      );
    }
    state.doneSent = true;
    output += "data: [DONE]\n\n";
  }

  return { output, completedGracefully: true };
}

/**
 * Extract user ID from auth result
 */
async function getUserIdFromAuth(auth: AuthResult & { ok: true }): Promise<number | null> {
  // For API key auth, userId is directly available
  if (auth.mode === "api_key") {
    return auth.userId;
  }

  if (auth.mode === "delegated_worker") {
    return auth.userId;
  }

  // For session auth, user object contains id
  if (auth.mode === "session" && auth.user?.id) {
    return auth.user.id;
  }

  // For bearer auth with openId (sub), look up user
  if (auth.sub && auth.sub !== "static") {
    // First try openId lookup (session JWTs use openId as sub)
    const userByOpenId = await getUserByOpenId(auth.sub);
    if (userByOpenId) return userByOpenId.id;

    // Fallback: sub may be a numeric user ID (internal JWTs)
    const numericId = parseInt(auth.sub, 10);
    if (!isNaN(numericId) && String(numericId) === auth.sub) {
      const userById = await getUserById(numericId);
      return userById?.id ?? null;
    }
  }

  return null;
}

/**
 * Check if user has enough credits for LLM request
 */
async function checkCredits(
  auth: AuthResult & { ok: true },
  res: Response
): Promise<{ ok: true; userId: number } | { ok: false }> {
  // Skip credit check for internal server-to-server static tokens only.
  // Logs every bypass for audit trail — disable in production if not needed.
  if (auth.mode === "bearer" && auth.sub === "static" && SKIP_CREDIT_CHECK_FOR_STATIC) {
    debugLog("LLM", "[CreditBypass] Static token credit skip — internal service request");
    return { ok: true, userId: 0 }; // userId 0 means no credit tracking
  }

  const userId = await getUserIdFromAuth(auth);
  if (!userId) {
    res.status(403).json({
      error: {
        message: "User not found. Please ensure you are logged in.",
        code: "user_not_found",
      },
    });
    return { ok: false };
  }

  const hasCredits = await hasEnoughCredits(userId, MIN_CREDITS_REQUIRED);
  if (!hasCredits) {
    res.status(402).json({
      error: {
        message: "Insufficient credits. Please purchase more credits to continue.",
        code: "insufficient_credits",
      },
    });
    return { ok: false };
  }

  return { ok: true, userId };
}

/**
 * Deduct credits after successful LLM call
 * Uses actual LLM cost to calculate credits (1 credit = $0.001 USD)
 */
async function deductCreditsForUsage(
  userId: number,
  usage: LLMUsageInfo,
  options?: { sourceType?: import("../services/creditService").CreditSourceType; conversationId?: number }
): Promise<void> {
  if (userId === 0) return; // Skip for static tokens

  // Import the cost-based calculation
  const { calculateCreditsForLLM, calculateLLMCostUsd, calculateCreditsFromCost } = await import("../services/creditService");

  // Prefer actual provider cost (e.g. OpenRouter returns usage.cost in USD)
  let costUsd: number;
  let creditsToDeduct: number;
  if (usage.providerCostUsd && usage.providerCostUsd > 0) {
    costUsd = usage.providerCostUsd;
    creditsToDeduct = calculateCreditsFromCost(costUsd);
    debugLog("LLM", "Using provider-reported cost", { costUsd, creditsToDeduct, model: usage.model });
  } else {
    costUsd = calculateLLMCostUsd(usage.promptTokens, usage.completionTokens, usage.model);
    creditsToDeduct = calculateCreditsForLLM(usage.promptTokens, usage.completionTokens, usage.model);
  }

  try {
    await deductCredits({
      userId,
      amount: creditsToDeduct,
      description: `LLM usage: ${usage.model}`,
      sourceType: options?.sourceType,
      conversationId: options?.conversationId,
      metadata: {
        model: usage.model,
        provider: cachedProvider?.providerName || "unknown",
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        costUsd,
        endpoint: "/v1/chat/completions",
      },
    });
  } catch (error) {
    // Log error but don't fail the request - credits were already checked
    console.error("[LLM] Failed to deduct credits:", error);
  }
}

/**
 * Parse usage info from OpenAI-compatible response
 */
function parseUsageFromResponse(data: any, model: string): LLMUsageInfo {
  const usage = data?.usage || {};
  return {
    userId: null,
    openId: null,
    model: data?.model || model || "unknown",
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    providerCostUsd: typeof usage.cost === "number" && usage.cost > 0 ? usage.cost : undefined,
  };
}

function getChatSelectionErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("not enabled for this tenant") ? 403 : 400;
}

/**
 * Proxy chat request with credit tracking
 * If conversationId is provided for streaming, saves the assistant message at the end
 */
async function proxyChatWithCredits(
  req: Request,
  res: Response,
  mode: "stream" | "json",
  userId: number,
  conversationId?: number,
  skillUsed?: string
) {
  debugLog("LLM", "proxyChatWithCredits called", { mode, userId, conversationId, skillUsed });
  const requestStartedAt = Date.now();
  const timing = {
    providerLookupMs: 0,
    enabledModelLookupMs: 0,
    plannerMs: 0,
    providerModelLookupMs: 0,
    queueWaitMs: 0,
    upstreamConnectMs: 0,
    firstChunkMs: null as number | null,
    firstChunkFromRequestMs: null as number | null,
    firstVisibleContentMs: null as number | null,
    firstVisibleContentFromRequestMs: null as number | null,
    streamReadMs: 0,
    creditsDeductionMs: 0,
    messageSaveMs: 0,
    finalizeMs: 0,
  };
  let queuePosition = 0;
  const allowImplicitResponsesBridge = req.path.startsWith("/api/llm/");
  const { clientMessageRuntimeMetadataInputSchema, sanitizeMessageRuntimeMetadata } =
    await import("../services/localAiRuntimeMetadata");
  const runtimeMetadataHintParsed =
    clientMessageRuntimeMetadataInputSchema.safeParse(
      req.body?.runtimeMetadataHint,
    );
  const runtimeMetadataHint = runtimeMetadataHintParsed.success
    ? sanitizeMessageRuntimeMetadata(runtimeMetadataHintParsed.data)
    : sanitizeMessageRuntimeMetadata(undefined);

  const conversationForSelection = conversationId
    ? await getConversationById(conversationId, userId)
    : undefined;
  const storedSelectionState = readStoredChatModelSelectionState(conversationForSelection?.skillSettings);
  const tenantId = (req as any).tenantId ?? "default";
  const autoSelectionEnabled = (await getTenantFeatureFlags(tenantId)).chatAutoModelSelection;

  let resolvedChatSelection;
  try {
    resolvedChatSelection = await resolveChatModelSelection({
      bodyModel: req.body?.model,
      bodyPreferredProvider: req.body?.preferredProvider ? Number(req.body.preferredProvider) : null,
      bodyModelSelection: req.body?.modelSelection,
      storedSelectionState,
      messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
      selectionContext: deriveChatSelectionContext(req.body?.modelSelectionContext),
      autoSelectionEnabled,
    });
  } catch (error: any) {
    const statusCode = getChatSelectionErrorStatus(error);
    if (mode === "json") {
      res.status(statusCode).json({ error: { message: error?.message || "Invalid chat model selection" } });
    } else {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.write(`event: error\ndata: ${JSON.stringify({ message: error?.message || "Invalid chat model selection", statusCode })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
    return;
  }

  // Check if a specific provider is requested (multi-provider support)
  const preferredProviderId = resolvedChatSelection.preferredProviderId;
  let provider: LlmProviderConfig | null = null;

  const providerLookupStartedAt = Date.now();
  if (preferredProviderId != null) {
    // Use the specified provider
    provider = await getLlmProviderById(preferredProviderId);
    debugLog("LLM", "Using preferred provider", { providerId: preferredProviderId, found: !!provider });
    if (!provider && resolvedChatSelection.strictProviderPin) {
      throw new Error("Pinned provider is not available for this chat selection");
    }
  }

  // Fallback to default provider if no specific provider requested or not found
  if (!provider) {
    provider = await getActiveLlmProvider();
    debugLog("LLM", "Using default provider", provider ? { name: provider.providerName, baseUrl: provider.baseUrl, hasKey: !!provider.apiKey } : null);
  }
  timing.providerLookupMs = Date.now() - providerLookupStartedAt;

  if (!provider) {
    throw new Error(
      "No LLM provider configured. Please add and enable an LLM provider with API key in the admin settings."
    );
  }

  const enabledModelLookupStartedAt = Date.now();
  const legacyModelId = resolvedChatSelection.resolvedModelId;
  timing.enabledModelLookupMs = Date.now() - enabledModelLookupStartedAt;

  // Keep planner telemetry for skill-driven chat flows, but do not allow it to
  // override resolved chat model selection.
  let plannerResult: Awaited<ReturnType<typeof runPlanner>> = null;
  if (skillUsed) {
    const plannerStartedAt = Date.now();
    plannerResult = await runPlanner({
      sourceType: "chat",
      userId,
      tenantId,
      conversationModel: legacyModelId,
      skillSlug: skillUsed,
      hasTools: false,
    });
    timing.plannerMs = Date.now() - plannerStartedAt;
  } else {
    timing.plannerMs = 0;
  }
  const requestedModelId = legacyModelId;
  debugLog("LLM", "Planner resolution", {
    conversationId,
    legacyModelId,
    plannerResolvedModel: plannerResult?.resolvedModel ?? null,
    requestedModelId,
    skillUsed: skillUsed ?? null,
    plannerTaskRunId: plannerResult?.taskRunId ?? null,
    plannerBypassed: !skillUsed,
  });

  // Resolve the provider-specific model ID and API style from database
  let model = requestedModelId;
  let apiStyle: ApiStyle | undefined;

  const providerModelLookupStartedAt = Date.now();
  if (preferredProviderId != null) {
    const resolved = await resolveProviderModel(requestedModelId, preferredProviderId);
    if (resolved) {
      model = resolved.providerModelId;
      apiStyle = resolved.apiStyle;
      debugLog("LLM", "Resolved provider model", {
        requestedModelId,
        providerModelId: resolved.providerModelId,
        apiStyle: resolved.apiStyle,
        providerId: preferredProviderId
      });
    } else {
      debugLog("LLM", "Failed to resolve provider model, using requested ID", { requestedModelId, providerId: preferredProviderId });
    }
  } else {
    // No preferredProvider given — try global resolution so internal model IDs
    // (e.g. "kimi-k2.5") are mapped to their provider-specific IDs (e.g. "moonshotai/kimi-k2.5")
    const resolved = await resolveProviderModelAny(requestedModelId);
    if (resolved) {
      model = resolved.providerModelId;
      apiStyle = resolved.apiStyle;
      debugLog("LLM", "Resolved model (global)", { requestedModelId, providerModelId: resolved.providerModelId });
    }
  }
  timing.providerModelLookupMs = Date.now() - providerModelLookupStartedAt;

  enforceDelegatedWorkerModelSelectionPolicy({
    auth: req.auth,
    rawRequestedModel: typeof req.body?.model === "string" ? req.body.model : null,
    resolvedModelId: requestedModelId,
    preferredProviderId,
    providerName: provider.providerName,
  });
  await enforceDelegatedWorkerLlmRoutePolicy({
    auth: req.auth,
    requestedModelId,
    resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
    providerName: provider.providerName,
  });
  await enforceDelegatedWorkerSpendGuardrails({
    auth: req.auth,
    estimatedCredits: estimateDelegatedChatCredits(
      req.body?.messages,
      req.body?.max_tokens,
      requestedModelId,
    ),
    idempotencyKey: req.get("Idempotency-Key") || undefined,
  });
  const delegatedExecutionHandle = await acquireDelegatedWorkerConcurrencySlot({
    auth: req.auth,
    actionClass: "compute",
  });

  try {
  const stream = mode === "stream";
  const bridgeResponsesForChat = allowImplicitResponsesBridge && apiStyle === "responses";
  const requestConfig = getModelRequestConfig(provider, model);
  const requestBody = transformRequestBody(
    req.body,
    provider.providerName,
    model,
    bridgeResponsesForChat ? false : stream,
    apiStyle,
    requestConfig,
  );
  if (isKieProvider(provider.providerName)) {
    if (!isSafeProviderModelId(model)) {
      res.status(400).json({
        error: { message: "Invalid provider model identifier for Kie routing." },
      });
      return;
    }

    if (apiStyle === "responses" && !bridgeResponsesForChat) {
      res.status(400).json({
        error: { message: "This model requires /v1/responses. Use the Responses API endpoint instead." },
      });
      return;
    }

    const validationError = validateKieRequestFields(
      bridgeResponsesForChat ? requestBody : req.body,
      apiStyle,
      requestConfig,
    );
    if (validationError) {
      res.status(validationError.status).json({ error: { message: validationError.message } });
      return;
    }
  }

  // Use the resolved model ID and API style to determine the correct endpoint
  const url = resolveApiUrl(provider.baseUrl, model, provider.providerName, apiStyle);
  debugLog("LLM", "Request details", { url, model, requestedModelId, apiStyle, providerName: provider.providerName });

  const controller = new AbortController();
  req.on("aborted", () => controller.abort());

  // Transform request body for provider-specific API format
  // Apply provider-specific rate limiting with queue system to avoid API rate limit errors
  const isFreeModel = model.toLowerCase().includes('free') || model.toLowerCase().includes('-free');
  const queueWaitStartedAt = Date.now();
  const slot = await acquireProviderSlot(provider.providerName, isFreeModel);
  timing.queueWaitMs = Date.now() - queueWaitStartedAt;
  queuePosition = slot.queuePosition;

  let upstream: globalThis.Response;
  const upstreamFetchStartedAt = Date.now();
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: upstreamHeaders(provider.apiKey, provider.providerName),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (fetchError: any) {
    // Release slot on fetch error (network issues, etc.)
    releaseProviderSlot(provider.providerName);
    // Record failed request
    recordModelUsage(provider.providerName, requestedModelId, false);
    const parsedError = parseProviderError(fetchError?.message || "Network error", provider.providerName);
    res.status(500).json(formatErrorResponse(parsedError));
    return;
  }
  timing.upstreamConnectMs = Date.now() - upstreamFetchStartedAt;

  debugLog("LLM", "Upstream response", { status: upstream.status, statusText: upstream.statusText });

  if (!upstream.ok) {
    // Release slot on upstream error
    releaseProviderSlot(provider.providerName);
    // Record failed request
    recordModelUsage(provider.providerName, requestedModelId, false);
    const message = await upstream.text().catch(() => upstream.statusText);
    debugLog("LLM", "Upstream error", message);
    // Parse error into user-friendly format
    const parsedError = parseProviderError(message, provider.providerName);
    res.status(upstream.status || 500).json(formatErrorResponse(parsedError));
    return;
  }

  if (bridgeResponsesForChat && stream) {
    releaseProviderSlot(provider.providerName);

    const text = await upstream.text();
    let rawData: any;
    try {
      rawData = JSON.parse(text);
    } catch {
      rawData = {};
    }

    const data = normalizeResponsesApiResponseToChatCompletion(rawData, requestedModelId);
    const normalizedUsage = normalizeLlmUsage(rawData, "responses");
    const inputTokens = normalizedUsage.inputTokens;
    const outputTokens = normalizedUsage.outputTokens;
    const providerCostUsd = normalizedUsage.providerReportedCostUsd;
    const fullContent = data?.choices?.[0]?.message?.content ?? "";
    const {
      deductCreditsForModel,
      calculateCreditsForLLM,
      calculateCreditsFromCost,
      calculateLLMCostUsd,
    } = await import("../services/creditService");
    const bridgedCreditsUsed = (providerCostUsd && providerCostUsd > 0)
      ? calculateCreditsFromCost(providerCostUsd)
      : calculateCreditsForLLM(inputTokens, outputTokens, model);
    const trackedCostUsd = providerCostUsd && providerCostUsd > 0
      ? providerCostUsd
      : calculateLLMCostUsd(inputTokens, outputTokens, requestedModelId);
    await enforceDelegatedWorkerLlmRoutePolicy({
      auth: req.auth,
      requestedModelId,
      resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
      providerName: provider.providerName,
    });
    await enforceDelegatedWorkerSpendGuardrails({
      auth: req.auth,
      estimatedCredits: bridgedCreditsUsed,
      idempotencyKey: req.get("Idempotency-Key") || undefined,
    });

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.flushHeaders?.();

    recordModelUsage(provider.providerName, requestedModelId, true, inputTokens, outputTokens);

    debugLog("LLM", "Bridged responses chat payload ready", {
      requestedModelId,
      providerName: provider.providerName,
      inputTokens,
      outputTokens,
      fullContentLength: fullContent.length,
      bridgedCreditsUsed,
      rawResponseKeys: rawData && typeof rawData === "object" ? Object.keys(rawData).slice(0, 12) : [],
    });

    if (!fullContent) {
      debugLog("LLM", "Bridged responses payload had no assistant text", {
        requestedModelId,
        providerName: provider.providerName,
        outputText: rawData?.output_text ?? rawData?.response?.output_text ?? null,
        choicesPreview:
          typeof rawData?.choices?.[0]?.message?.content === "string"
            ? rawData.choices[0].message.content.slice(0, 200)
            : Array.isArray(rawData?.choices?.[0]?.message?.content)
              ? JSON.stringify(rawData.choices[0].message.content).slice(0, 200)
              : null,
        outputPreview: Array.isArray(rawData?.output)
          ? JSON.stringify(rawData.output).slice(0, 200)
          : Array.isArray(rawData?.response?.output)
            ? JSON.stringify(rawData.response.output).slice(0, 200)
            : null,
      });
    }

    if (fullContent) {
      res.write(`data: ${JSON.stringify({
        id: data.id,
        object: "chat.completion.chunk",
        created: data.created,
        model: data.model,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: fullContent,
            },
            finish_reason: null,
          },
        ],
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({
      id: data.id,
      object: "chat.completion.chunk",
      created: data.created,
      model: data.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    })}\n\n`);

    res.write(`event: message_complete\ndata: ${JSON.stringify({
      content: fullContent,
      creditsUsed: bridgedCreditsUsed,
      resolvedModelId: requestedModelId,
      resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
      resolvedProviderName: provider.providerName,
      routeFamily: resolvedChatSelection.routeFamily,
      selectionMode: resolvedChatSelection.selectionMode,
    })}\n\n`);

    res.write("data: [DONE]\n\n");
    res.end();

    void (async () => {
      try {
        await deductCreditsForModel({
          userId,
          model: requestedModelId,
          provider: provider.providerName,
          inputTokens,
          outputTokens,
          costUsd: trackedCostUsd,
          sourceType: "chat",
          conversationId,
        });

        if (conversationId && fullContent) {
          const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
          const conversation = await getConversationById(conversationId, userId);
          if (conversation) {
            if (bridgedCreditsUsed > 0) {
              await updateConversationCredits(conversationId, bridgedCreditsUsed);
            }

            if (resolvedChatSelection.shouldPersistSelectionState) {
              const nextSkillSettings = writeStoredChatModelSelectionState(
                (conversationForSelection?.skillSettings as Record<string, unknown> | null | undefined) ?? {},
                storedSelectionStateFromResolved({
                  selection: resolvedChatSelection.selection,
                  resolvedModelId: requestedModelId,
                  resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
                  resolvedProviderName: provider.providerName,
                  routeFamily: resolvedChatSelection.routeFamily,
                }),
              );
              await updateConversation(conversationId, userId, {
                model: resolvedChatSelection.selection.mode === "explicit" ? requestedModelId : null,
                skillSettings: nextSkillSettings as any,
              });
            }

            await createMessage({
              conversationId,
              role: "assistant",
              content: fullContent,
              inputTokens,
              outputTokens,
              creditsUsed: String(bridgedCreditsUsed),
              modelUsed: model || conversation.model || undefined,
              skillUsed,
              traceId: getTraceId(),
            });
          }
        }

        logCostRequest({
          userId,
          providerId: provider.providerId ?? preferredProviderId ?? 0,
          modelUsed: model,
          inputTokens,
          outputTokens,
          costUsd: trackedCostUsd,
          creditsCharged: bridgedCreditsUsed,
          responseTimeMs: Date.now() - requestStartedAt,
          statusCode: 200,
          wasFallback: false,
          traceId: getTraceId(),
        }).catch((err: any) => debugError("LLM", "Failed to log bridged responses request:", err.message));

        auditLogger.log({
          eventType: "llm_stream_end",
          userId,
          providerId: provider.providerId ?? preferredProviderId ?? null,
          providerName: provider.providerName,
          model,
          requestType: "chat_stream",
          inputTokens,
          outputTokens,
          costUsd: trackedCostUsd || undefined,
          statusCode: 200,
          metadata: {
            route: "/api/llm/stream",
            conversationId,
            skillUsed: skillUsed || null,
            queuePosition,
            bridgedResponsesFamily: true,
            fullContentLength: fullContent.length,
          },
        });
      } catch (backgroundError: any) {
        debugError("LLM", "Bridged responses background finalize failed", backgroundError);
      }
    })();
    return;
  }

  if (!stream) {
    // Non-streaming: parse response, deduct credits, return
    // Release slot immediately since we have the response
    releaseProviderSlot(provider.providerName);

    const text = await upstream.text();
    let rawData: any;
    try {
      rawData = JSON.parse(text);
    } catch {
      rawData = {};
    }

    // Deduct credits based on normalized usage
    const normalizedUsage = normalizeLlmUsage(rawData, apiStyle);
    const inputTokens = normalizedUsage.inputTokens;
    const outputTokens = normalizedUsage.outputTokens;
    const costUsd = normalizedUsage.providerReportedCostUsd;
    const data = apiStyle === "messages"
      ? normalizeMessagesApiResponseToChatCompletion(rawData, requestedModelId)
      : apiStyle === "responses"
        ? normalizeResponsesApiResponseToChatCompletion(rawData, requestedModelId)
        : rawData;
    const actualCreditsUsed = costUsd && costUsd > 0
      ? calculateCreditsFromCost(costUsd)
      : calculateCreditsForLLM(inputTokens, outputTokens, requestedModelId);
    await enforceDelegatedWorkerLlmRoutePolicy({
      auth: req.auth,
      requestedModelId,
      resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
      providerName: provider.providerName,
    });
    await enforceDelegatedWorkerSpendGuardrails({
      auth: req.auth,
      estimatedCredits: actualCreditsUsed,
      idempotencyKey: req.get("Idempotency-Key") || undefined,
    });

    const { deductCreditsForModel } = await import("../services/creditService");
    await deductCreditsForModel({
      userId,
      model: requestedModelId,  // Use generic model ID for pricing lookup
      provider: provider.providerName,
      inputTokens,
      outputTokens,
      costUsd,
      sourceType: "chat",
      conversationId,
      idempotencyKey: req.get("Idempotency-Key") || undefined,
      metadata: buildDelegatedWorkerOriginMetadata(req.auth, "llm.chat_completions", {
        endpoint: "/v1/chat/completions",
        providerName: provider.providerName,
        requestedModelId,
      }),
    });

    // Record model usage for analytics
    recordModelUsage(provider.providerName, requestedModelId, true, inputTokens, outputTokens);

    // Add credit info to response (optional, for client awareness)
    if (userId > 0) {
      const balance = await getCreditBalance(userId);
      const creditsUsed = costUsd && costUsd > 0
        ? calculateCreditsFromCost(costUsd)
        : calculateCreditsForLLM(inputTokens, outputTokens, requestedModelId);
      if (data && typeof data === "object") {
        data._credits = {
          used: creditsUsed,
          remaining: balance?.credits ?? 0,
        };
        data._resolvedModel = {
          modelId: requestedModelId,
          providerId: provider.providerId ?? preferredProviderId ?? null,
          providerName: provider.providerName,
          routeFamily: resolvedChatSelection.routeFamily,
          selectionMode: resolvedChatSelection.selectionMode,
        };
        data._meta = {
          ...(data._meta && typeof data._meta === "object" ? data._meta : {}),
          normalizedUsage: {
            inputTokens,
            outputTokens,
            totalTokens: normalizedUsage.totalTokens,
            providerReportedCostUsd: normalizedUsage.providerReportedCostUsd,
            providerReportedCreditsConsumed: normalizedUsage.providerReportedCreditsConsumed,
          },
        };
      }

      if (conversationId && resolvedChatSelection.shouldPersistSelectionState) {
        const nextSkillSettings = writeStoredChatModelSelectionState(
          (conversationForSelection?.skillSettings as Record<string, unknown> | null | undefined) ?? {},
          storedSelectionStateFromResolved({
            selection: resolvedChatSelection.selection,
            resolvedModelId: requestedModelId,
            resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
            resolvedProviderName: provider.providerName,
            routeFamily: resolvedChatSelection.routeFamily,
          }),
        );
        await updateConversation(conversationId, userId, {
          model: resolvedChatSelection.selection.mode === "explicit" ? requestedModelId : null,
          skillSettings: nextSkillSettings as any,
        });
      }
    }

    res.status(upstream.status);
    res.type("application/json");
    res.send(JSON.stringify(data));
    return;
  }

  // Streaming mode
  if (!upstream.body) {
    res.status(500).json({ error: { message: "Upstream stream body missing" } });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  let clientDisconnected = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      controller.abort();
    }
  });

  const reader = upstream.body.getReader();
  let totalChunks = 0;
  let totalStreamBytes = 0;
  let accumulatedData = "";
  let fullContent = ""; // Accumulate the actual content for saving
  let nonContentDeltaCount = 0;
  let reasoningDeltaCount = 0;
  let reasoningTextChars = 0;
  const messagesStreamState = apiStyle === "messages"
    ? createMessagesSseTransformState(requestedModelId)
    : null;
  let streamCompletedSuccessfully = false;
  const streamReadStartedAt = Date.now();

  const writeNormalizedStreamChunk = (proxiedChunkStr: string) => {
    if (!proxiedChunkStr) {
      return;
    }

    const chunk = Buffer.from(proxiedChunkStr);
    res.write(chunk);
    totalStreamBytes += chunk.length;

    const lines = proxiedChunkStr.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const data = line.slice("data:".length).trim();
        if (data && data !== "[DONE]") {
          try {
            const j = JSON.parse(data);
            const deltaPayload = j?.choices?.[0]?.delta;
            const deltaContent = deltaPayload?.content;
            if (typeof deltaContent === "string") {
              if (timing.firstVisibleContentMs == null) {
                timing.firstVisibleContentMs = Date.now() - upstreamFetchStartedAt;
                timing.firstVisibleContentFromRequestMs = Date.now() - requestStartedAt;
                debugLog("LLM", "First visible content received", {
                  provider: provider.providerName,
                  model,
                  conversationId,
                  firstVisibleContentMs: timing.firstVisibleContentMs,
                  firstVisibleContentFromRequestMs: timing.firstVisibleContentFromRequestMs,
                });
              }
              fullContent += deltaContent;
            } else if (deltaPayload && typeof deltaPayload === "object") {
              nonContentDeltaCount++;

              const reasoningValue =
                (deltaPayload as Record<string, unknown>).reasoning
                ?? (deltaPayload as Record<string, unknown>).reasoning_content
                ?? (deltaPayload as Record<string, unknown>).reasoningContent;
              if (typeof reasoningValue === "string" && reasoningValue.length > 0) {
                reasoningDeltaCount++;
                reasoningTextChars += reasoningValue.length;
              } else if (Array.isArray(reasoningValue)) {
                reasoningDeltaCount++;
                reasoningTextChars += reasoningValue.reduce((sum: number, part: unknown) => {
                  if (typeof part === "string") return sum + part.length;
                  if (part && typeof part === "object" && "text" in part) {
                    const text = (part as { text?: unknown }).text;
                    return typeof text === "string" ? sum + text.length : sum;
                  }
                  return sum;
                }, 0);
              }
            }
          } catch {
            // Not JSON, ignore
          }
        }
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        if (timing.firstChunkMs == null) {
          timing.firstChunkMs = Date.now() - upstreamFetchStartedAt;
          timing.firstChunkFromRequestMs = Date.now() - requestStartedAt;
          debugLog("LLM", "First stream chunk received", {
            provider: provider.providerName,
            model,
            conversationId,
            firstChunkMs: timing.firstChunkMs,
            firstChunkFromRequestMs: timing.firstChunkFromRequestMs,
            queueWaitMs: timing.queueWaitMs,
          });
        }
        const rawChunk = Buffer.from(value);
        totalChunks++;
        accumulatedData += rawChunk.toString();

        const proxiedChunkStr = messagesStreamState
          ? transformMessagesSseChunkToOpenAi(
            rawChunk.toString(),
            messagesStreamState,
            requestedModelId,
          )
          : rawChunk.toString();

        writeNormalizedStreamChunk(proxiedChunkStr);
      }
    }

    if (messagesStreamState) {
      const finalized = finalizeMessagesSseTransformToOpenAi(
        messagesStreamState,
        requestedModelId,
      );
      streamCompletedSuccessfully = finalized.completedGracefully;
      writeNormalizedStreamChunk(finalized.output);
      if (!streamCompletedSuccessfully && !clientDisconnected) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: "Upstream Claude stream ended before a terminal event was received." })}\n\n`,
        );
      }
    } else {
      streamCompletedSuccessfully = true;
    }
  } catch (streamError: any) {
    streamCompletedSuccessfully = false;
    if (!clientDisconnected) {
      debugError("LLM", "Streaming read failed", streamError);
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: streamError?.message || "Streaming read failed" })}\n\n`,
        );
      }
    }
  } finally {
    timing.streamReadMs = Date.now() - streamReadStartedAt;
    try {
      reader.releaseLock();
    } catch {}

    // Release provider slot after streaming completes
    releaseProviderSlot(provider.providerName);

    // Try to extract usage from the accumulated SSE transcript.
    let inputTokens = 0;
    let outputTokens = 0;
    let providerCostUsd = 0;
    try {
      const normalizedUsage = extractStreamingUsageFromSsePayload(
        accumulatedData,
        apiStyle,
      );
      inputTokens = normalizedUsage.inputTokens;
      outputTokens =
        normalizedUsage.outputTokens
        || Math.max(0, normalizedUsage.totalTokens - normalizedUsage.inputTokens)
        || 0;
      providerCostUsd = normalizedUsage.providerReportedCostUsd ?? 0;
      if (outputTokens === 0) {
        // Estimate based on chunks (rough approximation)
        outputTokens = Math.max(100, totalChunks * 10);
      }
    } catch {
      outputTokens = Math.max(100, totalChunks * 10);
    }
    const actualStreamCredits = providerCostUsd > 0
      ? calculateCreditsFromCost(providerCostUsd)
      : calculateCreditsForLLM(inputTokens, outputTokens, requestedModelId);

    if (!streamCompletedSuccessfully || clientDisconnected) {
      recordModelUsage(provider.providerName, requestedModelId, false);
      auditLogger.log({
        eventType: "llm_stream_end",
        userId,
        providerId: provider.providerId ?? preferredProviderId ?? null,
        providerName: provider.providerName,
        model,
        requestType: "chat_stream",
        timing: {
          queueWaitMs: timing.queueWaitMs,
          networkMs: timing.upstreamConnectMs,
          parseMs: 0,
          totalMs: Date.now() - requestStartedAt,
        },
        inputTokens,
        outputTokens,
        costUsd: providerCostUsd || undefined,
        statusCode: clientDisconnected ? 499 : 502,
        metadata: {
          route: "/api/llm/stream",
          conversationId,
          skillUsed: skillUsed || null,
          queuePosition,
          streamCompletedSuccessfully,
          clientDisconnected,
          unsupportedMessagesEventKeys: messagesStreamState
            ? Array.from(messagesStreamState.unsupportedEventCounts.keys())
            : [],
          totalChunks,
          totalStreamBytes,
          fullContentLength: fullContent.length,
        },
      });
      res.end();
      return;
    }

    // Deduct credits for streaming
    await enforceDelegatedWorkerLlmRoutePolicy({
      auth: req.auth,
      requestedModelId,
      resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
      providerName: provider.providerName,
    });
    await enforceDelegatedWorkerSpendGuardrails({
      auth: req.auth,
      estimatedCredits: actualStreamCredits,
      idempotencyKey: req.get("Idempotency-Key") || undefined,
    });
    const { deductCreditsForModel } = await import("../services/creditService");
    const creditsDeductionStartedAt = Date.now();
    await deductCreditsForModel({
      userId,
      model: requestedModelId,  // Use generic model ID for pricing lookup
      provider: provider.providerName,
      inputTokens,
      outputTokens,
      costUsd: providerCostUsd,
      sourceType: "chat",
      conversationId,
      idempotencyKey: req.get("Idempotency-Key") || undefined,
      metadata: buildDelegatedWorkerOriginMetadata(req.auth, "llm.chat_completions", {
        endpoint: "/v1/chat/completions",
        providerName: provider.providerName,
        requestedModelId,
      }),
    });
    timing.creditsDeductionMs = Date.now() - creditsDeductionStartedAt;

    // Record model usage for analytics
    recordModelUsage(provider.providerName, requestedModelId, true, inputTokens, outputTokens);

    // If conversationId provided, save the assistant message and send final event
    if (conversationId && fullContent) {
      const messageSaveStartedAt = Date.now();
      try {
        const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
        const { calculateCreditsForLLM, calculateCreditsFromCost } = await import("../services/creditService");
        // Verify conversation ownership
        const conversation = await getConversationById(conversationId, userId);
        if (conversation) {
          // Use provider-reported cost if available, otherwise estimate from token counts
          const creditsUsed = (providerCostUsd > 0)
            ? calculateCreditsFromCost(providerCostUsd)
            : calculateCreditsForLLM(inputTokens, outputTokens, model);
          if (creditsUsed > 0) {
            await updateConversationCredits(conversationId, creditsUsed);
          }

          // Get traceId for cost correlation
          const traceId = getTraceId();

          if (resolvedChatSelection.shouldPersistSelectionState) {
            const nextSkillSettings = writeStoredChatModelSelectionState(
              (conversationForSelection?.skillSettings as Record<string, unknown> | null | undefined) ?? {},
              storedSelectionStateFromResolved({
                selection: resolvedChatSelection.selection,
                resolvedModelId: requestedModelId,
                resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
                resolvedProviderName: provider.providerName,
                routeFamily: resolvedChatSelection.routeFamily,
              }),
            );
            await updateConversation(conversationId, userId, {
              model: resolvedChatSelection.selection.mode === "explicit" ? requestedModelId : null,
              skillSettings: nextSkillSettings as any,
            });
          }

          const message = await createMessage({
            conversationId,
            role: "assistant",
            content: fullContent,
            inputTokens,
            outputTokens,
            creditsUsed: creditsUsed.toString(),
            modelUsed: model || conversation.model || undefined,
            skillUsed,
            runtimeMetadata: sanitizeMessageRuntimeMetadata({
              source: runtimeMetadataHint.source,
              taskClass: runtimeMetadataHint.taskClass,
              profileId: runtimeMetadataHint.profileId,
              tokenSavedEstimate: runtimeMetadataHint.tokenSavedEstimate,
              voiceInputMode: runtimeMetadataHint.voiceInputMode,
              provider: provider.providerName,
              model: requestedModelId,
            }),
            traceId,
          });

          // Log to providerUsageLog for cost correlation
          logCostRequest({
            userId,
            providerId: provider.providerId ?? preferredProviderId ?? 0,
            modelUsed: model,
            inputTokens,
            outputTokens,
            costUsd: providerCostUsd,
            creditsCharged: creditsUsed,
            responseTimeMs: 0,
            statusCode: 200,
            wasFallback: false,
            traceId,
          }).catch((err: any) => debugError("LLM", "Failed to log streaming request:", err.message));

          debugLog("LLM", "Message saved after streaming", { messageId: message.id, creditsUsed });

          // Send final event with saved message info
          res.write(`event: message_saved\n`);
          res.write(`data: ${JSON.stringify({
            id: message.id,
            creditsUsed,
            inputTokens,
            outputTokens,
            resolvedModelId: requestedModelId,
            resolvedProviderId: provider.providerId ?? preferredProviderId ?? null,
            resolvedProviderName: provider.providerName,
            routeFamily: resolvedChatSelection.routeFamily,
            selectionMode: resolvedChatSelection.selectionMode,
            runtimeMetadata: sanitizeMessageRuntimeMetadata({
              source: runtimeMetadataHint.source,
              taskClass: runtimeMetadataHint.taskClass,
              profileId: runtimeMetadataHint.profileId,
              tokenSavedEstimate: runtimeMetadataHint.tokenSavedEstimate,
              voiceInputMode: runtimeMetadataHint.voiceInputMode,
              provider: provider.providerName,
              model: requestedModelId,
            }),
          })}\n\n`);
        } else {
          debugLog("LLM", "Conversation not found for saving", { conversationId, userId });
        }
      } catch (saveError: any) {
        debugError("LLM", "Failed to save message after streaming", saveError);
        // Send error event but don't fail the stream
        res.write(`event: save_error\n`);
        res.write(`data: ${JSON.stringify({ error: saveError?.message || "Failed to save message" })}\n\n`);
      } finally {
        timing.messageSaveMs = Date.now() - messageSaveStartedAt;
      }
    }

    const finalizeStartedAt = Date.now();
    auditLogger.log({
      eventType: "llm_stream_end",
      userId,
      providerId: provider.providerId ?? preferredProviderId ?? null,
      providerName: provider.providerName,
      model,
      requestType: "chat_stream",
      timing: {
        queueWaitMs: timing.queueWaitMs,
        networkMs: timing.upstreamConnectMs,
        parseMs: timing.creditsDeductionMs + timing.messageSaveMs,
        totalMs: Date.now() - requestStartedAt,
      },
      inputTokens,
      outputTokens,
      costUsd: providerCostUsd || undefined,
      statusCode: 200,
      metadata: {
        route: "/api/llm/stream",
        conversationId,
        skillUsed: skillUsed || null,
        queuePosition,
        providerLookupMs: timing.providerLookupMs,
        enabledModelLookupMs: timing.enabledModelLookupMs,
        plannerMs: timing.plannerMs,
        providerModelLookupMs: timing.providerModelLookupMs,
        firstChunkMs: timing.firstChunkMs,
        firstChunkFromRequestMs: timing.firstChunkFromRequestMs,
        firstVisibleContentMs: timing.firstVisibleContentMs,
        firstVisibleContentFromRequestMs: timing.firstVisibleContentFromRequestMs,
        streamReadMs: timing.streamReadMs,
        creditsDeductionMs: timing.creditsDeductionMs,
        messageSaveMs: timing.messageSaveMs,
        totalChunks,
        totalStreamBytes,
        fullContentLength: fullContent.length,
        nonContentDeltaCount,
        reasoningDeltaCount,
        reasoningTextChars,
        unsupportedMessagesEventKeys: messagesStreamState
          ? Array.from(messagesStreamState.unsupportedEventCounts.keys())
          : [],
      },
    });
    timing.finalizeMs = Date.now() - finalizeStartedAt;
    debugLog("LLM", "Stream timing summary", {
      provider: provider.providerName,
      model,
      conversationId,
      queuePosition,
      totalMs: Date.now() - requestStartedAt,
      ...timing,
      totalChunks,
      totalStreamBytes,
      fullContentLength: fullContent.length,
      nonContentDeltaCount,
      reasoningDeltaCount,
      reasoningTextChars,
    });

    res.end();
  }
  } finally {
    await delegatedExecutionHandle.release();
  }
}

function unauthorized(res: Response) {
  res.status(401).json({ error: { message: "Unauthorized" } });
}

function insufficientCredits(res: Response) {
  res.status(402).json({
    error: {
      message: "Insufficient credits. Please purchase more credits to continue.",
      code: "insufficient_credits",
    },
  });
}

function respondDelegatedWorkerPlatformError(
  res: Response,
  error: DelegatedWorkerPlatformError,
): void {
  res.status(error.statusCode).json({
    error: {
      message: error.message,
      code: error.code,
      type: error.type,
    },
  });
}

function estimateDelegatedChatCredits(
  messages: unknown,
  maxTokens: unknown,
  requestedModelId: string,
): number {
  const estimatedInputTokens = Array.isArray(messages) ? estimateMessages(messages as any[]) : 0;
  const estimatedOutputTokens = Math.max(
    64,
    Number.isFinite(Number(maxTokens)) ? Number(maxTokens) : 512,
  );
  return Math.max(
    MIN_CREDITS_REQUIRED,
    calculateCreditsForLLM(
      estimatedInputTokens,
      estimatedOutputTokens,
      requestedModelId,
    ),
  );
}

export function registerLLMRoutes(app: Express) {
  // Initialize database connection
  try {
    void getDb();
  } catch (err: unknown) {
    console.warn("[LLM] Database init warning:", err);
  }

  const guardWithCredits = async (
    req: Request,
    res: Response
  ): Promise<{ ok: true; userId: number } | { ok: false }> => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return { ok: false };
    }

    // Check credits
    return checkCredits(auth, res);
  };

  /**
   * Verify X-Internal-Token header using timing-safe comparison.
   * Returns true if the token is valid, false otherwise.
   */
  const verifyInternalToken = (req: Request): boolean => {
    const token = req.headers["x-internal-token"] as string | undefined;
    return compareCachedInternalToken(token);
  };

  const SERVICE_ACCOUNT_ID = getCachedAppRuntimeConfig().llmGatewayServiceAccountId || 1;

  /**
   * Auth wrapper that accepts either X-Internal-Token (service-to-service)
   * or falls through to JWT auth via guardWithCredits.
   */
  const guardWithCreditsOrInternalToken = async (
    req: Request,
    res: Response
  ): Promise<{ ok: true; userId: number; isInternal: boolean } | { ok: false }> => {
    // Use cached verification result from middleware if available, otherwise verify
    const isInternal = (res.locals as any).verifiedInternalToken === true || verifyInternalToken(req);
    if (isInternal) {
      const userIdHeader = req.headers["x-user-id"] as string | undefined;
      const userId = userIdHeader ? parseInt(userIdHeader, 10) : SERVICE_ACCOUNT_ID;
      if (isNaN(userId)) {
        res.status(400).json({ error: { message: "Invalid X-User-Id header", code: "bad_request" } });
        return { ok: false };
      }

      // Check credits for the specified user (internal callers still need credits)
      const hasCredits = await hasEnoughCredits(userId, MIN_CREDITS_REQUIRED);
      if (!hasCredits) {
        res.status(402).json({ error: { message: "Insufficient credits", code: "insufficient_credits" } });
        return { ok: false };
      }

      return { ok: true, userId, isInternal: true };
    }

    // Fall through to JWT auth
    const result = await guardWithCredits(req, res);
    if (!result.ok) return { ok: false };
    return { ...result, isInternal: false };
  };

  const llmLimiter = rateLimit("llm", { rpm: LLM_RPM });

  // OpenAI-compatible gateway endpoints for LLM proxy callers.
  app.post(
    "/v1/chat/completions",
    (req: Request, res: Response, next: Function) => {
      // Skip IP rate limiter for internal token callers; cache result to avoid double verification
      const isInternal = verifyInternalToken(req);
      if (isInternal) {
        (res.locals as any).skipIpRateLimit = true;
        (res.locals as any).verifiedInternalToken = true;
      }
      next();
    },
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      // LLM calls (especially workflow generation with large prompts) can take
      // longer than the server-level 120s timeout.  Extend per-request.
      req.socket.setTimeout(600_000);  // 10 min
      res.setTimeout(600_000);

      const check = await guardWithCreditsOrInternalToken(req, res);
      if (!check.ok) return;

      const stream = Boolean(req.body?.stream);
      // Smart max_tokens for non-streaming requests too
      if (!req.body.max_tokens) {
        req.body.max_tokens = estimateMaxTokens(req.body?.skillUsed, req.body?.messages);
      }
      try {
        await proxyChatWithCredits(req, res, stream ? "stream" : "json", check.userId);
      } catch (err: any) {
        if (err instanceof DelegatedWorkerPlatformError) {
          respondDelegatedWorkerPlatformError(res, err);
          return;
        }
        if (res.headersSent) {
          debugError("LLM", "Streaming route failed after headers were sent", err);
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        res.status(500).json({ error: { message: err?.message || "LLM error" } });
      }
    }
  );

  // Responses API endpoint (/v1/responses) — for GPT-5.x web_search & function tools
  registerResponsesRoutes(app, {
    guardWithCreditsOrInternalToken,
    verifyInternalToken,
    getActiveLlmProvider,
    getLlmProviderById,
    resolveProviderModelAny,
    resolveProviderModel,
    acquireProviderSlot,
    releaseProviderSlot,
    recordModelUsage,
  });

  // Models endpoint - returns models from enabled providers in database
  app.get("/v1/models", llmLimiter, async (req: Request, res: Response) => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return;
    }

    try {
      const rows = await db
        .select({
          providerName: llmProviders.providerName,
          modelId: modelProviderMap.modelId,
        })
        .from(modelProviderMap)
        .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
        .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
        .orderBy(asc(llmProviders.sortOrder), asc(modelProviderMap.priority), asc(modelProviderMap.id));

      const models: Array<{ id: string; object: string; owned_by?: string }> = [];
      const seenModels = new Set<string>();

      for (const row of rows) {
        if (seenModels.has(row.modelId)) {
          continue;
        }
        seenModels.add(row.modelId);
        models.push({
          id: row.modelId,
          object: "model",
          owned_by: row.providerName,
        });
      }

      res.json({
        object: "list",
        data: models,
      });
    } catch (error) {
      console.error("[LLM] Failed to fetch models:", error);
      res.json({
        object: "list",
        data: [],
      });
    }
  });

  // Credit balance endpoint for LLM clients
  app.get("/v1/credits", llmLimiter, async (req: Request, res: Response) => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return;
    }

    const userId = await getUserIdFromAuth(auth);
    if (!userId) {
      res.status(404).json({ error: { message: "User not found" } });
      return;
    }

    const balance = await getCreditBalance(userId);
    res.json({
      credits: balance?.credits ?? 0,
      plan: balance?.plan ?? "free",
    });
  });

  // UI-friendly REST wrappers (same auth rules)
  app.post(
    "/api/llm/chat",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      try {
        const skillUsed = req.body?.skillUsed;
        if ((!skillUsed || skillUsed === "help-assistant") && Array.isArray(req.body?.messages)) {
          try {
            const { injectHelpContextMessage } = await import("../services/helpContextInjector");
            const result = await injectHelpContextMessage(req.body.messages, {
              force: skillUsed === "help-assistant",
            });
            if (result.injected) {
              debugLog("LLM", "Help context injected for chat request", {
                route: "/api/llm/chat",
                locale: result.locale,
                reason: result.reason,
                skillUsed: skillUsed ?? null,
              });
            }
          } catch (err: any) {
            debugLog("LLM", "Help context injection failed (non-fatal)", err?.message);
          }
        }
        await proxyChatWithCredits(req, res, "json", check.userId);
      } catch (err: any) {
        if (err instanceof DelegatedWorkerPlatformError) {
          respondDelegatedWorkerPlatformError(res, err);
          return;
        }
        res.status(500).json({ error: { message: err?.message || "LLM error" } });
      }
    }
  );

  app.post(
    "/api/llm/stream",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      // Extract conversationId and skillUsed from request body for server-side message saving
      const conversationId = req.body?.conversationId ? Number(req.body.conversationId) : undefined;
      const skillUsed = req.body?.skillUsed;

      debugLog("LLM", "Stream request", { conversationId, skillUsed, userId: check.userId });

      // Generic skill context injection: inject systemPrompt for any active skill
      if (skillUsed && Array.isArray(req.body?.messages)) {
        try {
          const { getDb } = await import("../db");
          const { skills: skillsTable } = await import("../../drizzle/schema");
          const { eq: eqOp } = await import("drizzle-orm");
          const dbInst = await getDb();

          if (dbInst) {
            const [skillRow] = await dbInst
              .select({
                systemPrompt: skillsTable.systemPrompt,
                knowledgebase: skillsTable.knowledgebase,
              })
              .from(skillsTable)
              .where(eqOp(skillsTable.slug, skillUsed))
              .limit(1);

            if (skillRow?.systemPrompt) {
              const parts: string[] = [skillRow.systemPrompt.substring(0, 12000)];
              if (skillRow.knowledgebase) {
                parts.push(`\n\n[DOMAIN KNOWLEDGE]\n${skillRow.knowledgebase.substring(0, 4000)}`);
              }
              const skillMsg = {
                role: "system",
                content: parts.join(""),
              };
              const firstNonSystem = req.body.messages.findIndex((m: any) => m.role !== "system");
              if (firstNonSystem > 0) {
                req.body.messages.splice(firstNonSystem, 0, skillMsg);
              } else {
                req.body.messages.unshift(skillMsg);
              }
              debugLog("LLM", `Skill context injected for '${skillUsed}' (${parts.join("").length} chars)`);
            }
          }
        } catch (err: any) {
          debugLog("LLM", "Skill context injection failed (non-fatal)", err?.message);
        }
      }

      // Context7 integration: inject library docs when code-docs-assistant skill is active
      if (skillUsed === "code-docs-assistant" && Array.isArray(req.body?.messages)) {
        try {
          const { fetchDocsForMessage } = await import("../services/context7");

          // Fetch user's personal Context7 API key from DB
          let userContext7Key: string | undefined;
          try {
            const { getDb } = await import("../db");
            const { systemSettings: sysSettings } = await import("../../drizzle/schema");
            const { eq: eqOp, and: andOp } = await import("drizzle-orm");
            const dbInst = await getDb();
            if (dbInst && check.userId) {
              const [row] = await dbInst
                .select()
                .from(sysSettings)
                .where(andOp(
                  eqOp(sysSettings.category, "context7"),
                  eqOp(sysSettings.key, `api_key_user_${check.userId}`)
                ))
                .limit(1);
              if (row?.value) {
                // Decrypt the stored key
                const { decrypt } = await import("../services/crypto");
                const decrypted = decrypt(row.value);
                userContext7Key = decrypted || undefined;
              }
            }
          } catch { /* use env fallback */ }

          const lastUserMsg = [...req.body.messages].reverse().find((m: any) => m.role === "user");
          if (lastUserMsg?.content) {
            const result = await fetchDocsForMessage(lastUserMsg.content, userContext7Key);
            if (result?.docs) {
              const contextStateMessages = result.contextState
                ? buildContextStateMessages(result.contextState)
                : [];
              // Inject docs as a system message right before the last user message
              const docsMessage = {
                role: "system",
                content: `## Reference Documentation for ${result.libraryName} (from Context7)\n\nUse the following up-to-date documentation to answer the user's question accurately:\n\n${result.docs}`,
              };
              // Insert after the first system message but before user messages
              const firstNonSystem = req.body.messages.findIndex((m: any) => m.role !== "system");
              const docsMessages = [
                ...contextStateMessages,
                docsMessage,
              ];
              if (firstNonSystem > 0) {
                req.body.messages.splice(firstNonSystem, 0, ...docsMessages);
              } else {
                req.body.messages.unshift(...docsMessages);
              }
              debugLog("LLM", `Context7: injected ${result.docs.length} chars of ${result.libraryName} docs${contextStateMessages.length > 0 ? ` and ${contextStateMessages.length} context hints` : ""}`);
            }
          }
        } catch (err: any) {
          debugLog("LLM", "Context7 injection failed (non-fatal)", err?.message);
        }
      }

      // Help docs integration: always available for the dedicated help skill,
      // and auto-enabled for normal chat when the user asks about this product.
      if ((!skillUsed || skillUsed === "help-assistant") && Array.isArray(req.body?.messages)) {
        try {
          const { injectHelpContextMessage } = await import("../services/helpContextInjector");
          const result = await injectHelpContextMessage(req.body.messages, {
            force: skillUsed === "help-assistant",
          });
          if (result.injected) {
            debugLog("LLM", "Help context injected", {
              route: "/api/llm/stream",
              locale: result.locale,
              reason: result.reason,
              skillUsed: skillUsed ?? null,
            });
          }
        } catch (err: any) {
          debugLog("LLM", "Help context injection failed (non-fatal)", err?.message);
        }
      }

      // ── Smart max_tokens: auto-set based on skill category and task type ───
      // Prevents requesting more tokens than needed (and avoids 402 credit errors
      // on providers like OpenRouter where max_tokens counts against balance).
      if (!req.body.max_tokens) {
        req.body.max_tokens = estimateMaxTokens(skillUsed, req.body?.messages);
      }

      try {
        await proxyChatWithCredits(req, res, "stream", check.userId, conversationId, skillUsed);
      } catch (err: any) {
        if (err instanceof DelegatedWorkerPlatformError) {
          respondDelegatedWorkerPlatformError(res, err);
          return;
        }
        // Best-effort SSE error
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.write(`event: error\n`);
        res.write(
          `data: ${JSON.stringify({ message: err?.message || "Stream error" })}\n\n`
        );
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    }
  );

  // Speech-to-Text endpoint
  app.post(
    "/api/stt/transcribe",
    llmLimiter,
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      try {
        const { audioBase64, mimeType = "audio/webm", language } = req.body || {};
        if (!audioBase64 || typeof audioBase64 !== "string") {
          res.status(400).json({ error: "audioBase64 is required" });
          return;
        }

        const audioBuffer = Buffer.from(audioBase64, "base64");
        const sizeMB = audioBuffer.length / (1024 * 1024);
        if (sizeMB > 16) {
          res.status(400).json({ error: "Audio exceeds 16MB limit" });
          return;
        }

        // Forward to Whisper API — try env vars first, then fall back to DB provider
        const { ENV } = await import("./env");
        const { getCachedAppRuntimeConfig } = await import("../services/appRuntimeConfig");
        const runtimeConfig = getCachedAppRuntimeConfig();
        let sttApiUrl = runtimeConfig.forgeApiUrl || ENV.forgeApiUrl;
        let sttApiKey = runtimeConfig.forgeApiKey || ENV.forgeApiKey;
        let sttModel = "whisper-1";

        // Credit cost per minute (default 6 for OpenAI Whisper)
        let sttCreditCostPerMinute = 6;

        if (!sttApiUrl || !sttApiKey) {
          // Look for dedicated STT providers first (stt-*), then fall back to LLM providers
          try {
            const { db } = await import("../db");
            const { llmProviders } = await import("../../drizzle/schema");
            const { eq, asc, like } = await import("drizzle-orm");
            const { decrypt } = await import("../services/crypto");

            // 1) Try dedicated STT providers (stt-groq, stt-openai, etc.)
            const sttProviders = await db
              .select({
                providerName: llmProviders.providerName,
                baseUrl: llmProviders.baseUrl,
                apiKeyEncrypted: llmProviders.apiKeyEncrypted,
                defaultModel: llmProviders.defaultModel,
                configJson: llmProviders.configJson,
              })
              .from(llmProviders)
              .where(like(llmProviders.providerName, "stt-%"))
              .orderBy(asc(llmProviders.sortOrder));

            const enabledStt = sttProviders.filter((p: (typeof sttProviders)[number]) => p.apiKeyEncrypted);
            let chosen: (typeof enabledStt)[0] | null = null;

            // Prefer stt-groq (free), then stt-openai, then any
            for (const pref of ["stt-groq", "stt-openai"]) {
              chosen = enabledStt.find((p: (typeof enabledStt)[number]) => p.providerName === pref) || null;
              if (chosen) break;
            }
            if (!chosen && enabledStt.length > 0) chosen = enabledStt[0];

            // 2) Fall back to LLM providers (groq, openai)
            if (!chosen) {
              const llmProv = await db
                .select({
                  providerName: llmProviders.providerName,
                  baseUrl: llmProviders.baseUrl,
                  apiKeyEncrypted: llmProviders.apiKeyEncrypted,
                  defaultModel: llmProviders.defaultModel,
                  configJson: llmProviders.configJson,
                })
                .from(llmProviders)
                .where(eq(llmProviders.isEnabled, true));

              for (const name of ["groq", "openai"]) {
                chosen = llmProv.find((p: (typeof llmProv)[number]) => p.providerName === name && p.apiKeyEncrypted) || null;
                if (chosen) break;
              }
              if (!chosen) {
                chosen = llmProv.find((p: (typeof llmProv)[number]) => p.providerName !== "openrouter" && p.apiKeyEncrypted) || null;
              }
            }

            if (chosen) {
              sttApiUrl = chosen.baseUrl || "https://api.openai.com/v1";
              sttApiKey = decrypt(chosen.apiKeyEncrypted);
              if (chosen.defaultModel) sttModel = chosen.defaultModel;

              // Provider-specific defaults
              const pName = chosen.providerName;
              if (pName === "stt-groq" || pName === "groq") {
                if (!chosen.defaultModel) sttModel = "whisper-large-v3-turbo";
                if (!chosen.baseUrl) sttApiUrl = "https://api.groq.com/openai/v1";
              }

              // Read creditCostPerMinute from configJson
              const cfg = chosen.configJson as Record<string, any> | null;
              if (cfg?.creditCostPerMinute !== undefined) {
                sttCreditCostPerMinute = Number(cfg.creditCostPerMinute);
              } else if (pName === "stt-groq" || pName === "groq") {
                sttCreditCostPerMinute = 0;
              }

              console.log(`[STT] Using provider: ${pName}, url: ${sttApiUrl}, model: ${sttModel}, cost: ${sttCreditCostPerMinute}/min`);
            }
          } catch (dbErr) {
            console.error("[STT] Failed to load provider from DB:", dbErr);
          }
        }

        if (!sttApiUrl || !sttApiKey) {
          res.status(500).json({ error: "STT service not configured. Add a Groq or OpenAI provider with API key in Settings." });
          return;
        }

        const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("wav") ? "wav" : "webm";
        const formData = new FormData();
        const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", audioBlob, `audio.${ext}`);
        formData.append("model", sttModel);
        formData.append("response_format", "verbose_json");
        if (language) formData.append("language", language);

        const baseUrl = sttApiUrl.endsWith("/") ? sttApiUrl : `${sttApiUrl}/`;
        const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();

        // Audit: log STT request (no PII — just metadata)
        const sttStartTime = Date.now();
        auditLogger.log({
          eventType: "llm_request",
          userId: check.userId,
          model: sttModel,
          requestType: "stt",
          requestPayload: {
            audioSizeMB: sizeMB.toFixed(2),
            mimeType,
            language: language || "auto",
          },
        });

        const whisperRes = await fetch(fullUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${sttApiKey}`,
            "Accept-Encoding": "identity",
          },
          body: formData,
        });

        if (!whisperRes.ok) {
          const errText = await whisperRes.text().catch(() => "");
          auditLogger.log({
            eventType: "llm_response",
            userId: check.userId,
            model: sttModel,
            requestType: "stt",
            statusCode: whisperRes.status,
            errorType: `http_${whisperRes.status}`,
            errorMessage: errText.slice(0, 500),
            timing: { totalMs: Date.now() - sttStartTime },
          });
          res.status(500).json({ error: "Transcription failed", details: errText.slice(0, 500) });
          return;
        }

        const result = await whisperRes.json() as { text: string; language: string; duration: number };

        // Audit: log STT response
        auditLogger.log({
          eventType: "llm_response",
          userId: check.userId,
          model: sttModel,
          requestType: "stt",
          statusCode: 200,
          timing: { totalMs: Date.now() - sttStartTime },
          responsePayload: {
            durationSeconds: result.duration,
            language: result.language,
            textLength: result.text?.length ?? 0,
          },
        });

        // Calculate credits based on provider's creditCostPerMinute
        const durationMin = (result.duration || 0) / 60;
        const creditsUsed = sttCreditCostPerMinute === 0
          ? 0
          : Math.max(1, Math.ceil(durationMin * sttCreditCostPerMinute));

        // Deduct credits (skip if free provider)
        if (creditsUsed > 0) {
          const { deductCredits } = await import("../services/creditService");
          await deductCredits({
            userId: check.userId,
            amount: creditsUsed,
            description: `STT transcription (${Math.round(result.duration || 0)}s)`,
            sourceType: "stt",
          });
        }

        res.json({
          text: result.text,
          language: result.language,
          duration: result.duration,
          creditsUsed,
        });
      } catch (err: any) {
        debugError("STT", "Transcription error", err);
        res.status(500).json({ error: err?.message || "STT failed" });
      }
    }
  );

  // Test endpoint for debugging
  app.get("/api/chat/test", (_req: Request, res: Response) => {
    debugLog("Chat API", "test endpoint hit");
    res.json({ ok: true, timestamp: Date.now() });
  });

  // ALTERNATIVE: Save endpoint under /api/llm/ namespace (which we know works)
  app.post(
    "/api/llm/save-message",
    async (req: Request, res: Response) => {
      debugLog("LLM API", "=== SAVE-MESSAGE HANDLER START ===");
      debugLog("LLM API", "save-message endpoint hit", req.body);

      const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
      if (!auth.ok) {
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }

      const userId = await getUserIdFromAuth(auth);
      debugLog("LLM API", "Auth result", {
        mode: auth.mode,
        sub: auth.sub,
        hasUser: !!(auth as any).user,
        userId,
        userFromAuth: (auth as any).user?.id
      });

      if (!userId) {
        debugLog("LLM API", "No userId from auth");
        return res.status(403).json({ error: { message: "User not found" } });
      }

      try {
        const { conversationId: rawConversationId, content, inputTokens, outputTokens, modelUsed, skillUsed } = req.body;
        if (!rawConversationId || !content) {
          return res.status(400).json({ error: { message: "conversationId and content are required" } });
        }

        // Ensure conversationId is a number (in case it's passed as a string)
        const conversationId = typeof rawConversationId === 'string' ? parseInt(rawConversationId, 10) : rawConversationId;
        if (isNaN(conversationId)) {
          debugLog("LLM API", "Invalid conversationId", { rawConversationId });
          return res.status(400).json({ error: { message: "Invalid conversationId" } });
        }

        const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
        const { calculateCreditsForLLM } = await import("../services/creditService");
        const { sanitizeMessageRuntimeMetadata } = await import("../services/localAiRuntimeMetadata");

        debugLog("LLM API", "Looking up conversation", {
          conversationId,
          conversationIdType: typeof conversationId,
          userId,
          userIdType: typeof userId
        });

        // First, try to get conversation with user ownership check
        let conversation = await getConversationById(conversationId, userId);
        debugLog("LLM API", "Conversation lookup result", { found: !!conversation, conversationId, userId });

        if (!conversation) {
          return res.status(404).json({ error: { message: "Conversation not found" } });
        }

        const effectiveModel = modelUsed || conversation.model || undefined;
        const creditsUsed = calculateCreditsForLLM(inputTokens || 0, outputTokens || 0, effectiveModel);
        if (creditsUsed > 0) {
          await updateConversationCredits(conversationId, creditsUsed);
        }

        const message = await createMessage({
          conversationId,
          role: "assistant",
          content,
          inputTokens: inputTokens || 0,
          outputTokens: outputTokens || 0,
          creditsUsed: creditsUsed.toString(),
          modelUsed: effectiveModel,
          skillUsed,
          runtimeMetadata: sanitizeMessageRuntimeMetadata({
            source: "cloud",
            model: effectiveModel,
          }),
        });

        debugLog("LLM API", "Message saved", { messageId: message.id });
        res.json({ id: message.id, creditsUsed });
      } catch (err: any) {
        debugError("LLM API", "Save failed", err);
        res.status(500).json({ error: { message: err?.message || "Failed to save message" } });
      }
    }
  );

  // REST endpoint for saving assistant messages (bypasses tRPC)
  // NOTE: No rate limiter here - this is called after streaming completes
  app.post(
    "/api/chat/save-assistant",
    async (req: Request, res: Response) => {
      debugLog("Chat API", "=== SAVE-ASSISTANT HANDLER START ===");
      debugLog("Chat API", "save-assistant endpoint hit", {
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        contentType: req.headers["content-type"],
      });
      debugLog("Chat API", "save-assistant body", req.body);

      const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
      if (!auth.ok) {
        debugLog("Chat API", "Unauthorized");
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }

      const userId = await getUserIdFromAuth(auth);
      if (!userId) {
        debugLog("Chat API", "User not found");
        return res.status(403).json({ error: { message: "User not found" } });
      }

      try {
        const { conversationId, content, inputTokens, outputTokens, modelUsed, skillUsed } = req.body;

        // Validate required fields
        if (!conversationId) {
          debugLog("Chat API", "Missing conversationId");
          return res.status(400).json({ error: { message: "conversationId is required" } });
        }
        if (!content) {
          debugLog("Chat API", "Missing content");
          return res.status(400).json({ error: { message: "content is required" } });
        }

        debugLog("Chat API", "Saving message", { conversationId, contentLength: content?.length, userId });

        // Dynamic import to avoid circular dependencies
        const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
        const { calculateCreditsForLLM } = await import("../services/creditService");
        const { sanitizeMessageRuntimeMetadata } = await import("../services/localAiRuntimeMetadata");

        // Verify conversation ownership
        const conversation = await getConversationById(conversationId, userId);
        if (!conversation) {
          debugLog("Chat API", "Conversation not found");
          return res.status(404).json({ error: { message: "Conversation not found" } });
        }

        // Calculate credits for tracking (use actual model for accurate cost)
        const effectiveModel = modelUsed || conversation.model || undefined;
        const creditsUsed = calculateCreditsForLLM(inputTokens || 0, outputTokens || 0, effectiveModel);

        // Update conversation credits tracking
        if (creditsUsed > 0) {
          await updateConversationCredits(conversationId, creditsUsed);
        }

        // Create assistant message
        const message = await createMessage({
          conversationId,
          role: "assistant",
          content,
          inputTokens: inputTokens || 0,
          outputTokens: outputTokens || 0,
          creditsUsed: creditsUsed.toString(),
          modelUsed: effectiveModel,
          skillUsed,
          runtimeMetadata: sanitizeMessageRuntimeMetadata({
            source: "cloud",
            model: effectiveModel,
          }),
        });

        debugLog("Chat API", "Message saved", { messageId: message.id, creditsUsed });

        res.json({
          id: message.id,
          creditsUsed,
        });
      } catch (err: any) {
        debugError("Chat API", "Save failed", err);
        res.status(500).json({ error: { message: err?.message || "Failed to save message" } });
      }
    }
  );

  // ─── Brainstorm endpoint (DEPRECATED — replaced by Team Discussions) ──
  app.post(
    "/api/llm/brainstorm",
    (_req: Request, res: Response) => {
      res.status(410).json({
        error: {
          message: "Brainstorm mode has been replaced by Team Discussions. Use the Teams page to start a collaborative discussion.",
          code: "GONE",
        },
      });
    },
  );

  /* Legacy brainstorm handler removed — replaced by Team Discussions.
     Historical brainstorm messages (skillUsed="brainstorm") remain readable in the DB.
     Credit source type "brainstorm" is kept for backward compatibility with credit_transactions.
     Full handler code is preserved in git history. */

  // ─── Multi-provider router endpoints ──────────────────────────────
  // These use the new llmRouter with provider fallback and health tracking.
  // Clients can opt-in by sending requests to /api/llm/v2/* instead of /api/llm/*.

  app.post(
    "/api/llm/v2/chat",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      try {
        await handleChatWithRouter({
          model: req.body?.model,
          messages: req.body?.messages || [],
          userId: check.userId,
          tenantId: (req as any).tenantId || "default",
          conversationId: req.body?.conversationId ? Number(req.body.conversationId) : undefined,
          preferredProvider: req.body?.preferredProvider ? Number(req.body.preferredProvider) : undefined,
          modelSelection: req.body?.modelSelection,
          modelSelectionContext: req.body?.modelSelectionContext,
          skillUsed: req.body?.skillUsed,
          res,
        });
      } catch (err: any) {
        if (err instanceof DelegatedWorkerPlatformError) {
          respondDelegatedWorkerPlatformError(res, err);
          return;
        }
        if (!res.headersSent) {
          res.status(500).json({ error: { message: err?.message || "LLM error" } });
        }
      }
    }
  );

  app.post(
    "/api/llm/v2/stream",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      try {
        await handleStreamWithRouter({
          model: req.body?.model,
          messages: req.body?.messages || [],
          userId: check.userId,
          tenantId: (req as any).tenantId || "default",
          conversationId: req.body?.conversationId ? Number(req.body.conversationId) : undefined,
          preferredProvider: req.body?.preferredProvider ? Number(req.body.preferredProvider) : undefined,
          modelSelection: req.body?.modelSelection,
          modelSelectionContext: req.body?.modelSelectionContext,
          skillUsed: req.body?.skillUsed,
          res,
        });
      } catch (err: any) {
        if (!res.headersSent) {
          res.status(200);
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        }
        res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message || "Stream error" })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    }
  );
}
