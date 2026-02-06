import type { Express, Request, Response } from "express";
import { decrypt } from "../services/crypto";
import { ENV } from "./env";
import { authorizeRequest, AuthResult } from "./authz";
import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
import { getUserByOpenId, getDb, db } from "../db";
import { llmProviders } from "../../drizzle/schema";
import { eq, asc, and } from "drizzle-orm";
import {
  getCreditBalance,
  getCreditBalanceByOpenId,
  hasEnoughCredits,
  deductCredits,
  calculateCreditsFromCost,
} from "../services/creditService";
import { debugLog, debugError } from "./logger";
import { handleChatWithRouter, handleStreamWithRouter } from "../services/llmRoutesHandler";

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
  providerName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string | null;
}

let cachedProvider: LlmProviderConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // Refresh every 60 seconds

type ResolvedModel = {
  providerModelId: string;
  apiStyle: 'chat-completions' | 'responses' | 'messages' | 'gemini';
} | null;

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

    // First try exact modelId match
    let [mapping] = await db
      .select({
        providerModelId: modelProviderMap.providerModelId,
        apiStyle: modelProviderMap.apiStyle,
      })
      .from(modelProviderMap)
      .where(and(
        eq(modelProviderMap.modelId, modelId),
        eq(modelProviderMap.providerId, providerId),
        eq(modelProviderMap.isEnabled, true)
      ))
      .limit(1);

    // If not found, try matching on providerModelId (for backwards compatibility)
    if (!mapping) {
      [mapping] = await db
        .select({
          providerModelId: modelProviderMap.providerModelId,
          apiStyle: modelProviderMap.apiStyle,
        })
        .from(modelProviderMap)
        .where(and(
          eq(modelProviderMap.providerModelId, modelId),
          eq(modelProviderMap.providerId, providerId),
          eq(modelProviderMap.isEnabled, true)
        ))
        .limit(1);

      if (mapping) {
        debugLog("LLM", "Resolved model via providerModelId fallback", { modelId, providerId });
      }
    }

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
 * Get a specific LLM provider configuration by ID
 */
async function getLlmProviderById(providerId: number): Promise<LlmProviderConfig | null> {
  try {
    const [provider] = await db
      .select({
        providerName: llmProviders.providerName,
        baseUrl: llmProviders.baseUrl,
        apiKeyEncrypted: llmProviders.apiKeyEncrypted,
        defaultModel: llmProviders.defaultModel,
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
      providerName: provider.providerName,
      baseUrl: provider.baseUrl,
      apiKey,
      defaultModel: provider.defaultModel,
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
        providerName: llmProviders.providerName,
        baseUrl: llmProviders.baseUrl,
        apiKeyEncrypted: llmProviders.apiKeyEncrypted,
        defaultModel: llmProviders.defaultModel,
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
      providerName: provider.providerName,
      baseUrl: provider.baseUrl,
      apiKey,
      defaultModel: provider.defaultModel,
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
type ApiStyle = 'chat-completions' | 'responses' | 'messages' | 'gemini';

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
function resolveApiUrl(
  baseUrl: string,
  modelId: string,
  providerName: string,
  apiStyle?: ApiStyle
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const providerLower = providerName.toLowerCase();

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
  'skillUsed',
  'skillArgs',
  'saveMessage',
  '_internal',
] as const;

/**
 * Extract only valid OpenAI Chat Completions API fields from request body
 * Filters out internal fields that are not part of the LLM API spec
 */
function extractOpenAIFields(body: any): Record<string, any> {
  // Valid OpenAI Chat Completions API fields
  const validFields = [
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
  ];

  const result: Record<string, any> = {};
  for (const field of validFields) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }
  return result;
}

/**
 * Transform OpenAI-format request body to provider-specific format
 * IMPORTANT: This function filters out internal fields (conversationId, preferredProvider, etc.)
 * to prevent them from being sent to upstream LLM APIs
 */
function transformRequestBody(
  body: any,
  providerName: string,
  model: string,
  stream: boolean
): any {
  const providerLower = providerName.toLowerCase();

  // Anthropic: Different message format
  if (providerLower === 'anthropic') {
    const messages = body.messages || [];

    // Extract system message (Anthropic uses separate 'system' field)
    const systemMessages = messages.filter((m: any) => m.role === 'system');
    const nonSystemMessages = messages.filter((m: any) => m.role !== 'system');

    return {
      model,
      max_tokens: body.max_tokens || 4096,
      stream,
      system: systemMessages.map((m: any) => m.content).join('\n\n') || undefined,
      messages: nonSystemMessages.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };
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
  const cleanBody = extractOpenAIFields(body);
  return { ...cleanBody, model, stream };
}

/**
 * Extract user ID from auth result
 */
async function getUserIdFromAuth(auth: AuthResult & { ok: true }): Promise<number | null> {
  // For session auth, user object contains id
  if (auth.mode === "session" && auth.user?.id) {
    return auth.user.id;
  }

  // For bearer auth with openId (sub), look up user
  if (auth.sub && auth.sub !== "static") {
    const user = await getUserByOpenId(auth.sub);
    return user?.id ?? null;
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
  // Skip credit check for static tokens if configured
  if (auth.mode === "bearer" && auth.sub === "static" && SKIP_CREDIT_CHECK_FOR_STATIC) {
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
  usage: LLMUsageInfo
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
      metadata: {
        model: usage.model,
        provider: cachedProvider?.providerName || "unknown",
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        costUsd: costUsd.toFixed(6),
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

  // Check if a specific provider is requested (multi-provider support)
  const preferredProviderId = req.body?.preferredProvider;
  let provider: LlmProviderConfig | null = null;

  if (preferredProviderId != null) {
    // Use the specified provider
    provider = await getLlmProviderById(preferredProviderId);
    debugLog("LLM", "Using preferred provider", { providerId: preferredProviderId, found: !!provider });
  }

  // Fallback to default provider if no specific provider requested or not found
  if (!provider) {
    provider = await getActiveLlmProvider();
    debugLog("LLM", "Using default provider", provider ? { name: provider.providerName, baseUrl: provider.baseUrl, hasKey: !!provider.apiKey } : null);
  }

  if (!provider) {
    throw new Error(
      "No LLM provider configured. Please add and enable an LLM provider with API key in the admin settings."
    );
  }

  const requestedModelId = req.body?.model || provider.defaultModel || "gpt-4o-mini";

  // Resolve the provider-specific model ID and API style from database
  let model = requestedModelId;
  let apiStyle: ApiStyle | undefined;

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
  }

  // Use the resolved model ID and API style to determine the correct endpoint
  const url = resolveApiUrl(provider.baseUrl, model, provider.providerName, apiStyle);
  debugLog("LLM", "Request details", { url, model, requestedModelId, apiStyle, providerName: provider.providerName });

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const stream = mode === "stream";

  // Transform request body for provider-specific API format
  const requestBody = transformRequestBody(req.body, provider.providerName, model, stream);

  // Apply provider-specific rate limiting with queue system to avoid API rate limit errors
  const isFreeModel = model.toLowerCase().includes('free') || model.toLowerCase().includes('-free');
  await acquireProviderSlot(provider.providerName, isFreeModel);

  let upstream: Response;
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

  if (!stream) {
    // Non-streaming: parse response, deduct credits, return
    // Release slot immediately since we have the response
    releaseProviderSlot(provider.providerName);

    const text = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }

    // Deduct credits based on usage
    const inputTokens = data?.usage?.prompt_tokens ?? 0;
    const outputTokens = data?.usage?.completion_tokens ?? 0;
    const costUsd = data?.usage?.cost;

    const { deductCreditsForModel } = await import("../services/creditService");
    await deductCreditsForModel({
      userId,
      model: requestedModelId,  // Use generic model ID for pricing lookup
      provider: provider.providerName,
      inputTokens,
      outputTokens,
      costUsd,
    });

    // Record model usage for analytics
    recordModelUsage(provider.providerName, requestedModelId, true, inputTokens, outputTokens);

    // Add credit info to response (optional, for client awareness)
    if (userId > 0) {
      const { calculateCreditsForLLM } = await import("../services/creditService");
      const balance = await getCreditBalance(userId);
      if (data && typeof data === "object") {
        data._credits = {
          used: calculateCreditsForLLM(inputTokens, outputTokens, model),
          remaining: balance?.credits ?? 0,
        };
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

  const reader = upstream.body.getReader();
  let totalChunks = 0;
  let accumulatedData = "";
  let fullContent = ""; // Accumulate the actual content for saving

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = Buffer.from(value);
        res.write(chunk);
        totalChunks++;

        // Accumulate data to parse usage at the end
        const chunkStr = chunk.toString();
        accumulatedData += chunkStr;

        // Extract content from SSE data for saving
        const lines = chunkStr.split("\n");
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice("data:".length).trim();
            if (data && data !== "[DONE]") {
              try {
                const j = JSON.parse(data);
                const delta = j?.choices?.[0]?.delta?.content;
                if (typeof delta === "string") {
                  fullContent += delta;
                }
              } catch {
                // Not JSON, ignore
              }
            }
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}

    // Release provider slot after streaming completes
    releaseProviderSlot(provider.providerName);

    // Try to extract usage from the last SSE message
    // OpenAI/OpenRouter sends usage in the final chunk before [DONE]
    let inputTokens = 0;
    let outputTokens = 0;
    let providerCostUsd = 0;
    try {
      // Parse each SSE data line — last occurrence with usage wins
      const dataLines = accumulatedData.split("\n").filter(l => l.startsWith("data:"));
      for (const line of dataLines) {
        const raw = line.slice("data:".length).trim();
        if (raw && raw !== "[DONE]") {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || parsed.usage.total_tokens || 0;
              // OpenRouter returns actual cost in usage.cost (USD cents or USD depending on version)
              if (typeof parsed.usage.cost === "number" && parsed.usage.cost > 0) {
                providerCostUsd = parsed.usage.cost;
              }
            }
          } catch {}
        }
      }
      if (outputTokens === 0) {
        // Estimate based on chunks (rough approximation)
        outputTokens = Math.max(100, totalChunks * 10);
      }
    } catch {
      outputTokens = Math.max(100, totalChunks * 10);
    }

    // Deduct credits for streaming
    const { deductCreditsForModel } = await import("../services/creditService");
    await deductCreditsForModel({
      userId,
      model: requestedModelId,  // Use generic model ID for pricing lookup
      provider: provider.providerName,
      inputTokens,
      outputTokens,
      costUsd: providerCostUsd,
    });

    // Record model usage for analytics
    recordModelUsage(provider.providerName, requestedModelId, true, inputTokens, outputTokens);

    // If conversationId provided, save the assistant message and send final event
    if (conversationId && fullContent) {
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

          const message = await createMessage({
            conversationId,
            role: "assistant",
            content: fullContent,
            inputTokens,
            outputTokens,
            creditsUsed: creditsUsed.toString(),
            modelUsed: model || conversation.model || undefined,
            skillUsed,
          });

          debugLog("LLM", "Message saved after streaming", { messageId: message.id, creditsUsed });

          // Send final event with saved message info
          res.write(`event: message_saved\n`);
          res.write(`data: ${JSON.stringify({ id: message.id, creditsUsed, inputTokens, outputTokens })}\n\n`);
        } else {
          debugLog("LLM", "Conversation not found for saving", { conversationId, userId });
        }
      } catch (saveError: any) {
        debugError("LLM", "Failed to save message after streaming", saveError);
        // Send error event but don't fail the stream
        res.write(`event: save_error\n`);
        res.write(`data: ${JSON.stringify({ error: saveError?.message || "Failed to save message" })}\n\n`);
      }
    }

    res.end();
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

export function registerLLMRoutes(app: Express) {
  // Initialize database connection
  getDb().catch((err) => console.warn("[LLM] Database init warning:", err));

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

  const llmLimiter = rateLimit("llm", { rpm: LLM_RPM });

  // OpenAI-compatible gateway endpoints for LLM proxy callers.
  app.post(
    "/v1/chat/completions",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      const stream = Boolean(req.body?.stream);
      try {
        await proxyChatWithCredits(req, res, stream ? "stream" : "json", check.userId);
      } catch (err: any) {
        res.status(500).json({ error: { message: err?.message || "LLM error" } });
      }
    }
  );

  // Models endpoint - returns models from enabled providers in database
  app.get("/v1/models", llmLimiter, async (req: Request, res: Response) => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return;
    }

    try {
      // Fetch enabled providers with their models from database
      const providers = await db
        .select({
          providerName: llmProviders.providerName,
          availableModels: llmProviders.availableModels,
          defaultModel: llmProviders.defaultModel,
        })
        .from(llmProviders)
        .where(eq(llmProviders.isEnabled, true))
        .orderBy(asc(llmProviders.sortOrder));

      const models: Array<{ id: string; object: string; owned_by?: string }> = [];

      for (const provider of providers) {
        const providerModels = (provider.availableModels as Array<{ id: string; name: string }>) || [];
        for (const model of providerModels) {
          models.push({
            id: model.id,
            object: "model",
            owned_by: provider.providerName,
          });
        }
      }

      // If no models configured, return a sensible default
      if (models.length === 0) {
        models.push({ id: "gpt-4o-mini", object: "model" });
      }

      res.json({
        object: "list",
        data: models,
      });
    } catch (error) {
      console.error("[LLM] Failed to fetch models:", error);
      // Fallback to default models
      res.json({
        object: "list",
        data: [{ id: "gpt-4o-mini", object: "model" }],
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
        await proxyChatWithCredits(req, res, "json", check.userId);
      } catch (err: any) {
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
              // Inject docs as a system message right before the last user message
              const docsMessage = {
                role: "system",
                content: `## Reference Documentation for ${result.libraryName} (from Context7)\n\nUse the following up-to-date documentation to answer the user's question accurately:\n\n${result.docs}`,
              };
              // Insert after the first system message but before user messages
              const firstNonSystem = req.body.messages.findIndex((m: any) => m.role !== "system");
              if (firstNonSystem > 0) {
                req.body.messages.splice(firstNonSystem, 0, docsMessage);
              } else {
                req.body.messages.unshift(docsMessage);
              }
              debugLog("LLM", `Context7: injected ${result.docs.length} chars of ${result.libraryName} docs`);
            }
          }
        } catch (err: any) {
          debugLog("LLM", "Context7 injection failed (non-fatal)", err?.message);
        }
      }

      try {
        await proxyChatWithCredits(req, res, "stream", check.userId, conversationId, skillUsed);
      } catch (err: any) {
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
        let sttApiUrl = ENV.forgeApiUrl;
        let sttApiKey = ENV.forgeApiKey;
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

            const enabledStt = sttProviders.filter((p) => p.apiKeyEncrypted);
            let chosen: (typeof enabledStt)[0] | null = null;

            // Prefer stt-groq (free), then stt-openai, then any
            for (const pref of ["stt-groq", "stt-openai"]) {
              chosen = enabledStt.find((p) => p.providerName === pref) || null;
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
                chosen = llmProv.find((p) => p.providerName === name && p.apiKeyEncrypted) || null;
                if (chosen) break;
              }
              if (!chosen) {
                chosen = llmProv.find((p) => p.providerName !== "openrouter" && p.apiKeyEncrypted) || null;
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
          res.status(500).json({ error: "Transcription failed", details: errText });
          return;
        }

        const result = await whisperRes.json() as { text: string; language: string; duration: number };

        // Calculate credits based on provider's creditCostPerMinute
        const durationMin = (result.duration || 0) / 60;
        const creditsUsed = sttCreditCostPerMinute === 0
          ? 0
          : Math.max(1, Math.ceil(durationMin * sttCreditCostPerMinute));

        // Deduct credits (skip if free provider)
        if (creditsUsed > 0) {
          const { deductCredits } = await import("../services/creditService");
          await deductCredits(check.userId, creditsUsed, `STT transcription (${Math.round(result.duration || 0)}s)`);
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

        const effectiveModel = modelUsed || conversation.model || "gpt-4o-mini";
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

        // Verify conversation ownership
        const conversation = await getConversationById(conversationId, userId);
        if (!conversation) {
          debugLog("Chat API", "Conversation not found");
          return res.status(404).json({ error: { message: "Conversation not found" } });
        }

        // Calculate credits for tracking (use actual model for accurate cost)
        const effectiveModel = modelUsed || conversation.model || "gpt-4o-mini";
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

  // ─── Brainstorm endpoint ───────────────────────────────────────────
  // Multi-round debate between two LLM models with skill-aware context
  app.post(
    "/api/llm/brainstorm",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES * 2), // Allow larger payload for multi-round context
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      const { userId } = check;
      const {
        messages: contextMessages = [],
        modelA,
        modelB,
        conversationId,
        maxRounds = 3,
        userMessage,
      } = req.body;

      if (!modelA || !modelB || !userMessage) {
        return res.status(400).json({ error: { message: "modelA, modelB, and userMessage are required" } });
      }

      const HARD_LIMIT = Math.min(Math.max(1, maxRounds), 6);

      const provider = await getActiveLlmProvider();
      if (!provider) {
        return res.status(500).json({ error: { message: "No LLM provider configured" } });
      }

      const url = resolveChatUrl(provider.baseUrl);
      const controller = new AbortController();
      req.on("close", () => controller.abort());

      // Setup SSE
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Content-Type-Options", "nosniff");

      // Helper: stream a single model turn and return full content + usage
      async function streamModelTurn(
        model: string,
        msgs: Array<{ role: string; content: string }>,
        meta: { round: number; role: string },
      ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
        // Send turn start
        res.write(`event: brainstorm_turn\ndata: ${JSON.stringify({ round: meta.round, role: meta.role, model, status: "start" })}\n\n`);

        // Apply rate limiting with queue system before brainstorm API call
        const isFreeModel = model.toLowerCase().includes('free') || model.toLowerCase().includes('-free');
        await acquireProviderSlot(provider!.providerName, isFreeModel);

        let upstream: Response;
        try {
          upstream = await fetch(url, {
            method: "POST",
            headers: upstreamHeaders(provider!.apiKey, provider!.providerName),
            body: JSON.stringify({ model, messages: msgs, stream: true }),
            signal: controller.signal,
          });
        } catch (fetchError: any) {
          releaseProviderSlot(provider!.providerName);
          throw new Error(`Model ${model} failed: ${fetchError?.message || "Network error"}`);
        }

        if (!upstream.ok || !upstream.body) {
          releaseProviderSlot(provider!.providerName);
          const errText = await upstream.text().catch(() => "LLM request failed");
          throw new Error(`Model ${model} failed: ${errText}`);
        }

        const reader = upstream.body.getReader();
        let fullContent = "";
        let accData = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const chunkStr = Buffer.from(value).toString();
              accData += chunkStr;

              const lines = chunkStr.split("\n");
              for (const line of lines) {
                if (line.startsWith("data:")) {
                  const d = line.slice("data:".length).trim();
                  if (d && d !== "[DONE]") {
                    try {
                      const j = JSON.parse(d);
                      const delta = j?.choices?.[0]?.delta?.content;
                      if (typeof delta === "string") {
                        fullContent += delta;
                        res.write(`event: brainstorm_chunk\ndata: ${JSON.stringify({ round: meta.round, role: meta.role, model, content: delta })}\n\n`);
                      }
                    } catch {}
                  }
                }
              }
            }
          }
        } finally {
          try { reader.releaseLock(); } catch {}
          // Release provider slot after streaming completes
          releaseProviderSlot(provider!.providerName);
        }

        // Parse usage from the last SSE chunk that contains it
        let inputTokens = 0, outputTokens = 0;
        try {
          // Look for usage in each SSE data line (last occurrence wins)
          const dataLines = accData.split("\n").filter(l => l.startsWith("data:"));
          for (const line of dataLines) {
            const raw = line.slice("data:".length).trim();
            if (raw && raw !== "[DONE]") {
              try {
                const parsed = JSON.parse(raw);
                if (parsed?.usage) {
                  inputTokens = Math.round(parsed.usage.prompt_tokens || 0);
                  outputTokens = Math.round(parsed.usage.completion_tokens || parsed.usage.total_tokens || 0);
                }
              } catch {}
            }
          }
          if (outputTokens === 0) {
            outputTokens = Math.max(50, Math.ceil(fullContent.length / 4));
          }
        } catch {
          outputTokens = Math.max(50, Math.ceil(fullContent.length / 4));
        }

        // Send turn end
        res.write(`event: brainstorm_turn\ndata: ${JSON.stringify({ round: meta.round, role: meta.role, model, status: "end" })}\n\n`);

        return { content: fullContent, inputTokens, outputTokens };
      }

      try {
        const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
        const { calculateCreditsForLLM } = await import("../services/creditService");
        const { detectSkill } = await import("../services/skillDetector");

        // Skill-aware context injection
        let skillContext = "";
        let detectedSkillSlug = "";
        let detectedSkillName = "";
        try {
          const skillResult = await detectSkill(userMessage);
          if (skillResult.detected && skillResult.skill && skillResult.confidence >= 0.5) {
            detectedSkillSlug = skillResult.skill.slug;
            detectedSkillName = skillResult.skill.name;

            // Load skill knowledge from DB
            const { skills: skillsTable } = await import("../../drizzle/schema");
            const [skillRow] = await db
              .select({ knowledgebase: skillsTable.knowledgebase, systemPrompt: skillsTable.systemPrompt })
              .from(skillsTable)
              .where(eq(skillsTable.slug, detectedSkillSlug))
              .limit(1);

            if (skillRow?.knowledgebase || skillRow?.systemPrompt) {
              skillContext = [
                skillRow.systemPrompt ? `[SKILL EXPERTISE: ${detectedSkillName}]\n${skillRow.systemPrompt}` : "",
                skillRow.knowledgebase ? `[DOMAIN KNOWLEDGE]\n${skillRow.knowledgebase.substring(0, 8000)}` : "",
              ].filter(Boolean).join("\n\n");

              res.write(`event: brainstorm_skill\ndata: ${JSON.stringify({ skillSlug: detectedSkillSlug, skillName: detectedSkillName })}\n\n`);
            }
          }
        } catch (err) {
          debugLog("Brainstorm", "Skill detection failed (non-fatal)", err);
        }

        // System prompts
        const SYSTEM_A = `You are Model A in a collaborative brainstorm with another AI model.
Round 1: Provide your thorough initial analysis of the user's question.
Rounds 2+: Read Model B's response carefully. Acknowledge valid points, challenge weak ones, and add new insights. Do NOT repeat what you already said.
Be concise (200-400 words per round). Use structured formatting (bullets, headers).${skillContext ? `\n\n${skillContext}` : ""}`;

        const SYSTEM_B = `You are Model B in a collaborative brainstorm with another AI model.
Read Model A's response carefully before responding.
Offer different angles, identify blind spots, play devil's advocate where appropriate.
Agree and reinforce strong points, but always add something new.
Be concise (200-400 words per round). Use structured formatting (bullets, headers).${skillContext ? `\n\n${skillContext}` : ""}`;

        const SUMMARY_PROMPT = `You have completed a multi-round brainstorm debate. Now produce a final synthesized answer.
Integrate the strongest points from ALL rounds of both Model A and Model B.
Resolve any contradictions by explaining the nuance.
Structure as: Key Findings → Detailed Analysis → Recommendations (if applicable).
Start with "## Brainstorm Summary"
Be comprehensive but avoid redundancy.`;

        let totalCredits = 0;
        const debateHistory: Array<{ role: string; content: string }> = [];
        const savedMessageIds: number[] = [];

        // Verify conversation ownership
        const conversation = conversationId ? await getConversationById(conversationId, userId) : null;

        for (let round = 1; round <= HARD_LIMIT; round++) {
          // ── Model A turn ──
          const msgsA = [
            { role: "system", content: SYSTEM_A },
            ...contextMessages,
            { role: "user", content: userMessage },
            ...debateHistory,
            ...(round > 1 ? [{ role: "user", content: `Round ${round}: Build on or challenge the previous points. Add new insights.` }] : []),
          ];

          const resultA = await streamModelTurn(modelA, msgsA, { round, role: "model_a" });

          // Deduct credits
          await deductCreditsForUsage(userId, {
            userId, openId: null, model: modelA,
            promptTokens: resultA.inputTokens, completionTokens: resultA.outputTokens,
            totalTokens: resultA.inputTokens + resultA.outputTokens,
          });
          const creditsA = calculateCreditsForLLM(resultA.inputTokens, resultA.outputTokens, modelA);
          totalCredits += creditsA;
          res.write(`event: brainstorm_credits\ndata: ${JSON.stringify({ round, role: "model_a", credits: creditsA, totalCredits })}\n\n`);

          debateHistory.push({ role: "assistant", content: `[Model A - Round ${round}]: ${resultA.content}` });

          // Save message
          if (conversation) {
            const msg = await createMessage({
              conversationId, role: "assistant", content: resultA.content,
              inputTokens: resultA.inputTokens, outputTokens: resultA.outputTokens,
              creditsUsed: creditsA.toString(), modelUsed: modelA, skillUsed: "brainstorm",
              skillArgs: { brainstormRound: round, brainstormRole: "model_a" } as any,
            });
            savedMessageIds.push(msg.id);
          }

          // ── Model B turn ──
          const msgsB = [
            { role: "system", content: SYSTEM_B },
            ...contextMessages,
            { role: "user", content: userMessage },
            ...debateHistory,
          ];

          const resultB = await streamModelTurn(modelB, msgsB, { round, role: "model_b" });

          await deductCreditsForUsage(userId, {
            userId, openId: null, model: modelB,
            promptTokens: resultB.inputTokens, completionTokens: resultB.outputTokens,
            totalTokens: resultB.inputTokens + resultB.outputTokens,
          });
          const creditsB = calculateCreditsForLLM(resultB.inputTokens, resultB.outputTokens, modelB);
          totalCredits += creditsB;
          res.write(`event: brainstorm_credits\ndata: ${JSON.stringify({ round, role: "model_b", credits: creditsB, totalCredits })}\n\n`);

          debateHistory.push({ role: "assistant", content: `[Model B - Round ${round}]: ${resultB.content}` });

          if (conversation) {
            const msg = await createMessage({
              conversationId, role: "assistant", content: resultB.content,
              inputTokens: resultB.inputTokens, outputTokens: resultB.outputTokens,
              creditsUsed: creditsB.toString(), modelUsed: modelB, skillUsed: "brainstorm",
              skillArgs: { brainstormRound: round, brainstormRole: "model_b" } as any,
            });
            savedMessageIds.push(msg.id);
          }
        }

        // ── Final Summary ──
        const summaryMsgs = [
          { role: "system", content: SUMMARY_PROMPT },
          ...contextMessages,
          { role: "user", content: userMessage },
          ...debateHistory,
        ];

        const summaryResult = await streamModelTurn(modelA, summaryMsgs, { round: HARD_LIMIT + 1, role: "summary" });

        await deductCreditsForUsage(userId, {
          userId, openId: null, model: modelA,
          promptTokens: summaryResult.inputTokens, completionTokens: summaryResult.outputTokens,
          totalTokens: summaryResult.inputTokens + summaryResult.outputTokens,
        });
        const creditsSummary = calculateCreditsForLLM(summaryResult.inputTokens, summaryResult.outputTokens, modelA);
        totalCredits += creditsSummary;
        res.write(`event: brainstorm_credits\ndata: ${JSON.stringify({ round: 0, role: "summary", credits: creditsSummary, totalCredits })}\n\n`);

        if (conversation) {
          const msg = await createMessage({
            conversationId, role: "assistant", content: summaryResult.content,
            inputTokens: summaryResult.inputTokens, outputTokens: summaryResult.outputTokens,
            creditsUsed: creditsSummary.toString(), modelUsed: modelA, skillUsed: "brainstorm",
            skillArgs: { brainstormRound: 0, brainstormRole: "summary" } as any,
          });
          savedMessageIds.push(msg.id);
          await updateConversationCredits(conversationId, totalCredits);
        }

        // Done event
        res.write(`event: brainstorm_done\ndata: ${JSON.stringify({
          totalCredits, totalRounds: HARD_LIMIT, messageIds: savedMessageIds,
          skillUsed: detectedSkillSlug || null,
        })}\n\n`);
      } catch (err: any) {
        debugError("Brainstorm", "Error", err);
        res.write(`event: brainstorm_error\ndata: ${JSON.stringify({ error: err?.message || "Brainstorm failed" })}\n\n`);
      }

      res.end();
    }
  );

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
          model: req.body?.model || "gpt-4o-mini",
          messages: req.body?.messages || [],
          userId: check.userId,
          conversationId: req.body?.conversationId ? Number(req.body.conversationId) : undefined,
          preferredProvider: req.body?.preferredProvider ? Number(req.body.preferredProvider) : undefined,
          res,
        });
      } catch (err: any) {
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
          model: req.body?.model || "gpt-4o-mini",
          messages: req.body?.messages || [],
          userId: check.userId,
          conversationId: req.body?.conversationId ? Number(req.body.conversationId) : undefined,
          preferredProvider: req.body?.preferredProvider ? Number(req.body.preferredProvider) : undefined,
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
