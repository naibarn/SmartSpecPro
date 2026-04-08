/**
 * Model Sync Service
 * 
 * Automatically syncs available models from various LLM providers.
 * Primary source: OpenRouter API (provides unified access to 420+ models)
 * Fallback: Direct provider APIs
 */

import { db } from "../db";
import { llmProviders } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { normalizeNvidiaHostedCatalogModel } from "./llmProviderCatalog";

// Types
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  created?: number; // Unix timestamp when model was added to OpenRouter
  pricing?: {
    prompt: string;
    completion: string;
    image?: string;
    request?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
}

// Configuration for model sync
const SYNC_CONFIG = {
  // Only sync models created within the last N days (3 months = ~90 days)
  maxAgeDays: 90,
  // Set to false to sync all models regardless of age
  filterByDate: false,
};

// Configuration for model cleanup
const CLEANUP_CONFIG = {
  // Delete models older than N days (6 months = ~180 days)
  maxAgeDays: 180,
  // If true, only delete models that have createdAt date
  // Models without createdAt will be kept (safety measure)
  requireCreatedAt: true,
};

export interface SyncedModel {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: {
    input: number;
    output: number;
  };
  provider?: string;
  description?: string;
  createdAt?: number; // Unix timestamp when model was added
  apiStyle?: "chat-completions" | "responses" | "messages" | "gemini";
  ownedBy?: string;
  surface?: "chat" | "embedding" | "parse" | "guardrail" | "reward" | "translation" | "multimodal" | "other";
  executionMode?: "public" | "internal-only" | "deferred";
  autoSelectionEligible?: boolean;
  embeddingDimension?: number;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsFunctionTools?: boolean;
  supportsResponses?: boolean;
}

interface OpenAICompatibleNativeModel {
  id: string;
  name?: string;
  created?: number;
  owned_by?: string;
  context_length?: number;
  context_window?: number;
  max_context_length?: number;
  max_model_len?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input?: string | number;
    output?: string | number;
  };
  supports_vision?: boolean;
  supportsVision?: boolean;
  supports_reasoning?: boolean;
  supportsThinking?: boolean;
  supports_responses?: boolean;
  supportsResponses?: boolean;
  supports_function_tools?: boolean;
  supportsFunctionTools?: boolean;
  supports_function_calling?: boolean;
  supports_tools?: boolean;
  embedding_dimension?: number;
  embeddingDimension?: number;
}

/**
 * Check if a model is within the allowed age range
 */
function isModelRecent(model: OpenRouterModel): boolean {
  if (!SYNC_CONFIG.filterByDate) return true;
  if (!model.created) return true; // If no date, include it

  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = SYNC_CONFIG.maxAgeDays * 24 * 60 * 60;
  const modelAge = now - model.created;

  return modelAge <= maxAgeSeconds;
}

export interface SyncResult {
  success: boolean;
  provider: string;
  modelsAdded: number;
  modelsRemoved: number;
  modelsUpdated: number;
  totalModels: number;
  addedModels: string[];
  removedModels: string[];
  updatedModels: string[];
  error?: string;
  syncedAt: Date;
}

// Provider-specific model prefixes for filtering (used when syncing from OpenRouter)
const PROVIDER_PREFIXES: Record<string, string[]> = {
  openai: ["openai/", "gpt-"],
  anthropic: ["anthropic/", "claude-"],
  google: ["google/", "gemini-"],
  meta: ["meta-llama/", "llama-"],
  mistral: ["mistralai/", "mistral-", "mixtral-"],
  deepseek: ["deepseek/"],
  qwen: ["qwen/", "alibaba/"],
  cohere: ["cohere/"],
  perplexity: ["perplexity/"],
  groq: ["groq/"],
  together: ["together/"],
  fireworks: ["fireworks/"],
  deepinfra: ["deepinfra/"],
  hyperbolic: ["hyperbolic/"],
  moonshot: ["moonshotai/", "kimi-"],
  minimax: ["minimax/"],
  zhipu: ["zhipu/", "glm-"],
  "opencode-zen": ["moonshotai/", "minimax/", "zhipu/", "kimi-", "glm-", "qwen", "big-pickle", "trinity-"],
};

// OpenRouter API configuration
const OPENROUTER_API = "https://openrouter.ai/api/v1";

/**
 * Fetch models from OpenRouter API
 */
async function fetchOpenRouterModels(apiKey?: string): Promise<OpenRouterModel[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${OPENROUTER_API}/models`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Fetch models from provider's native API
 * Each provider has different model listing endpoints
 */
async function fetchProviderNativeModels(
  providerName: string,
  baseUrl: string,
  apiKey: string
): Promise<SyncedModel[]> {
  const providerLower = providerName.toLowerCase();

  // OpenCode Zen - has its own models endpoint
  if (providerLower.includes('opencode') || providerLower.includes('zen')) {
    return fetchOpenCodeZenModels(baseUrl, apiKey);
  }

  // OpenAI-compatible providers (OpenAI, Groq, DeepSeek, Together, Fireworks, etc.)
  if (['openai', 'groq', 'deepseek', 'together', 'fireworks', 'moonshot', 'qwen', 'zhipu', 'minimax', 'nvidia_nim'].includes(providerLower)) {
    return fetchOpenAICompatibleModels(baseUrl, apiKey, providerLower);
  }

  // Anthropic - no models API, return hardcoded list
  if (providerLower === 'anthropic') {
    return getAnthropicModels();
  }

  // Google AI - special models endpoint
  if (providerLower === 'google') {
    return fetchGoogleAIModels(baseUrl, apiKey);
  }

  // Ollama - local models
  if (providerLower === 'ollama') {
    return fetchOllamaModels(baseUrl);
  }

  // Default: return empty (will fall back to OpenRouter sync)
  return [];
}

/**
 * Fetch models from OpenCode Zen API
 * Endpoint: GET /zen/v1/models
 */
async function fetchOpenCodeZenModels(baseUrl: string, apiKey: string): Promise<SyncedModel[]> {
  // Normalize base URL
  let modelsUrl = baseUrl.replace(/\/+$/, '');
  if (!modelsUrl.includes('/v1')) {
    modelsUrl = modelsUrl + '/v1';
  }
  modelsUrl = modelsUrl + '/models';

  const response = await fetch(modelsUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`OpenCode Zen API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const models = data.data || data.models || [];

  return models.map((m: any) => ({
    id: m.id,
    name: m.name || m.id,
    contextLength: m.context_length || m.contextLength,
    pricing: m.pricing ? {
      input: (parseFloat(m.pricing.prompt || m.pricing.input || '0') * 1000000),
      output: (parseFloat(m.pricing.completion || m.pricing.output || '0') * 1000000),
    } : { input: 0, output: 0 },
    provider: 'opencode-zen',
  }));
}

/**
 * Fetch models from OpenAI-compatible API
 * Endpoint: GET /v1/models
 */
async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string,
  providerName: string
): Promise<SyncedModel[]> {
  let modelsUrl = baseUrl.replace(/\/+$/, '');
  if (!modelsUrl.endsWith('/models')) {
    modelsUrl = modelsUrl.includes('/v1') ? modelsUrl + '/models' : modelsUrl + '/v1/models';
  }

  const response = await fetch(modelsUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`${providerName} API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const models = (data.data || data.models || []) as OpenAICompatibleNativeModel[];
  const normalized = models.map((model) => normalizeOpenAICompatibleNativeModel(model, providerName));
  return dedupeSyncedModels(normalized);
}

/**
 * Get Anthropic models (hardcoded - no models API)
 */
function getAnthropicModels(): SyncedModel[] {
  return [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000, pricing: { input: 3, output: 15 }, provider: 'anthropic' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextLength: 200000, pricing: { input: 0.8, output: 4 }, provider: 'anthropic' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextLength: 200000, pricing: { input: 15, output: 75 }, provider: 'anthropic' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextLength: 200000, pricing: { input: 3, output: 15 }, provider: 'anthropic' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextLength: 200000, pricing: { input: 0.25, output: 1.25 }, provider: 'anthropic' },
  ];
}

/**
 * Fetch models from Google AI API
 * Endpoint: GET /v1beta/models
 */
async function fetchGoogleAIModels(baseUrl: string, apiKey: string): Promise<SyncedModel[]> {
  const modelsUrl = `${baseUrl.replace(/\/+$/, '')}/models`;

  const response = await fetch(`${modelsUrl}?key=${apiKey}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Google AI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const models = data.models || [];

  return models
    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: any) => ({
      id: m.name.replace('models/', ''),
      name: m.displayName || m.name.replace('models/', ''),
      contextLength: m.inputTokenLimit,
      provider: 'google',
    }));
}

/**
 * Fetch models from Ollama
 * Endpoint: GET /api/tags (local Ollama)
 */
async function fetchOllamaModels(baseUrl: string): Promise<SyncedModel[]> {
  // Ollama uses /api/tags for listing models
  const modelsUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '') + '/api/tags';

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5 second timeout for local service
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    const models = data.models || [];

    return models.map((m: any) => ({
      id: m.name,
      name: m.name,
      provider: 'ollama',
    }));
  } catch (error) {
    // Ollama might not be running - return empty
    console.warn('[ModelSync] Ollama not reachable:', error);
    return [];
  }
}

/**
 * Parse pricing string to number (e.g., "0.00001" -> 0.00001)
 */
function parsePricing(priceStr?: string): number {
  if (!priceStr) return 0;
  const parsed = parseFloat(priceStr);
  return isNaN(parsed) ? 0 : parsed;
}

function parsePricingValue(value?: string | number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  return parsePricing(value);
}

function parseOptionalNumber(value?: string | number | null): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function pickBoolean(...values: Array<boolean | null | undefined>): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function mergeSyncedModels(current: SyncedModel, next: SyncedModel): SyncedModel {
  return {
    ...current,
    ...next,
    name: next.name || current.name,
    contextLength: next.contextLength ?? current.contextLength,
    pricing: next.pricing ?? current.pricing,
    provider: next.provider ?? current.provider,
    description: next.description ?? current.description,
    createdAt: next.createdAt ?? current.createdAt,
    apiStyle: next.apiStyle ?? current.apiStyle,
    ownedBy: next.ownedBy ?? current.ownedBy,
    surface: next.surface ?? current.surface,
    executionMode: next.executionMode ?? current.executionMode,
    autoSelectionEligible: next.autoSelectionEligible ?? current.autoSelectionEligible,
    embeddingDimension: next.embeddingDimension ?? current.embeddingDimension,
    supportsVision: next.supportsVision ?? current.supportsVision,
    supportsThinking: next.supportsThinking ?? current.supportsThinking,
    supportsFunctionTools: next.supportsFunctionTools ?? current.supportsFunctionTools,
    supportsResponses: next.supportsResponses ?? current.supportsResponses,
  };
}

function dedupeSyncedModels(models: SyncedModel[]): SyncedModel[] {
  const modelsById = new Map<string, SyncedModel>();

  for (const model of models) {
    const existing = modelsById.get(model.id);
    if (!existing) {
      modelsById.set(model.id, model);
      continue;
    }

    modelsById.set(model.id, mergeSyncedModels(existing, model));
  }

  return Array.from(modelsById.values());
}

function normalizeOpenAICompatibleNativeModel(
  model: OpenAICompatibleNativeModel,
  providerName: string,
): SyncedModel {
  const contextLength = model.context_window
    ?? model.context_length
    ?? model.max_context_length
    ?? model.max_model_len;
  const pricingInput = parsePricingValue(model.pricing?.prompt ?? model.pricing?.input);
  const pricingOutput = parsePricingValue(model.pricing?.completion ?? model.pricing?.output);

  if (providerName === "nvidia_nim") {
    return {
      ...normalizeNvidiaHostedCatalogModel({
        id: model.id,
        name: model.name ?? model.id,
        ownedBy: model.owned_by,
        contextLength,
        createdAt: model.created,
        pricing: pricingInput > 0 || pricingOutput > 0
          ? { input: pricingInput, output: pricingOutput }
          : undefined,
        embeddingDimension: parseOptionalNumber(model.embedding_dimension ?? model.embeddingDimension),
        supportsVision: pickBoolean(model.supports_vision, model.supportsVision),
        supportsThinking: pickBoolean(model.supports_reasoning, model.supportsThinking),
        supportsResponses: pickBoolean(model.supports_responses, model.supportsResponses),
        supportsFunctionTools: pickBoolean(
          model.supports_function_tools,
          model.supportsFunctionTools,
          model.supports_function_calling,
          model.supports_tools,
        ),
      }),
      provider: providerName,
    };
  }

  return {
    id: model.id,
    name: model.name || model.id,
    contextLength,
    pricing: pricingInput > 0 || pricingOutput > 0
      ? { input: pricingInput, output: pricingOutput }
      : undefined,
    provider: providerName,
    createdAt: model.created,
  };
}

/**
 * Convert OpenRouter model to our format
 */
function convertModel(model: OpenRouterModel): SyncedModel {
  // Extract provider from model ID (e.g., "openai/gpt-4" -> "openai")
  const provider = model.id.includes("/") ? model.id.split("/")[0] : undefined;

  // Create display name from model ID
  const displayName = model.name || model.id.split("/").pop() || model.id;

  return {
    id: model.id,
    name: displayName,
    contextLength: model.context_length || model.top_provider?.context_length,
    pricing: model.pricing ? {
      input: parsePricing(model.pricing.prompt) * 1000000, // Convert to per 1M tokens
      output: parsePricing(model.pricing.completion) * 1000000,
    } : undefined,
    provider,
    description: model.description,
    createdAt: model.created, // Preserve creation timestamp
  };
}

/**
 * Filter models by provider prefix
 *
 * Special case: "openrouter" provider gets ALL models since it's a gateway
 */
function filterModelsByProvider(models: SyncedModel[], providerName: string): SyncedModel[] {
  const lowerName = providerName.toLowerCase();

  // OpenRouter is a gateway - it should have access to ALL models
  if (lowerName === "openrouter") {
    return models; // Return all models without filtering
  }

  const prefixes = PROVIDER_PREFIXES[lowerName];
  if (!prefixes) {
    // If no prefix defined, try to match by provider field
    return models.filter(m =>
      m.provider?.toLowerCase() === lowerName
    );
  }

  return models.filter(m =>
    prefixes.some(prefix => m.id.toLowerCase().startsWith(prefix.toLowerCase()))
  );
}

/**
 * Sync models for a specific provider
 *
 * Strategy:
 * 1. Try provider's native API first (OpenCode Zen, OpenAI, Groq, etc.)
 * 2. Fall back to OpenRouter if native API fails or returns no models
 *
 * Behavior:
 * - KEEPS all existing models (never removes old models)
 * - ADDS only new models that are recent (within SYNC_CONFIG.maxAgeDays)
 * - UPDATES existing models if pricing/context length changed
 */
export async function syncProviderModels(
  providerId: number,
  openRouterApiKey?: string
): Promise<SyncResult> {
  const startTime = Date.now();

  try {
    // Get provider from database
    const [provider] = await db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, providerId))
      .limit(1);

    if (!provider) {
      throw new Error("Provider not found");
    }

    // Decrypt provider API key if available
    let providerApiKey: string | undefined;
    if (provider.apiKeyEncrypted) {
      const { decrypt } = await import("./crypto");
      providerApiKey = decrypt(provider.apiKeyEncrypted) || undefined;
    }

    let allProviderModels: SyncedModel[] = [];
    let useNativeApi = false;

    // Try provider's native API first (not for OpenRouter which IS the aggregator)
    if (provider.providerName.toLowerCase() !== 'openrouter' && providerApiKey && provider.baseUrl) {
      try {
        const nativeModels = await fetchProviderNativeModels(
          provider.providerName,
          provider.baseUrl,
          providerApiKey
        );
        if (nativeModels.length > 0) {
          allProviderModels = nativeModels;
          useNativeApi = true;
          console.log(`[ModelSync] ${provider.providerName}: Using native API, found ${nativeModels.length} models`);
        }
      } catch (nativeError) {
        console.warn(`[ModelSync] ${provider.providerName}: Native API failed, falling back to OpenRouter`, nativeError);
      }
    }

    // Fall back to OpenRouter if native API didn't work
    if (!useNativeApi) {
      // Fetch all models from OpenRouter
      const allModels = await fetchOpenRouterModels(openRouterApiKey);
      const allConvertedModels = allModels.map(convertModel);
      allProviderModels = filterModelsByProvider(allConvertedModels, provider.providerName);
      console.log(`[ModelSync] ${provider.providerName}: Using OpenRouter, found ${allProviderModels.length} models`);
    }

    // For native API, don't filter by date (we trust the provider's model list)
    const recentProviderModels = useNativeApi
      ? allProviderModels
      : allProviderModels.filter(m => !SYNC_CONFIG.filterByDate || isModelRecent({ created: (m as any).createdAt } as OpenRouterModel));

    // Get existing models
    const existingModels = (provider.availableModels as SyncedModel[]) || [];
    const existingIds = new Set(existingModels.map(m => m.id));
    const allProviderIds = new Set(allProviderModels.map(m => m.id));

    // Calculate diff
    // Only add models that are recent AND not already in our list
    const addedModels = recentProviderModels.filter(m => !existingIds.has(m.id));
    const updatedModels: SyncedModel[] = [];
    const skippedOldModels: string[] = [];

    // Count how many old models we're skipping
    const oldModelsNotAdded = allProviderModels.filter(m =>
      !existingIds.has(m.id) && !recentProviderModels.some(r => r.id === m.id)
    );
    skippedOldModels.push(...oldModelsNotAdded.map(m => m.id));

    // Check for updates (context length or pricing changes) - update all existing models
    for (const newModel of allProviderModels) {
      const existing = existingModels.find(m => m.id === newModel.id);
      if (existing) {
        const hasChanges =
          existing.contextLength !== newModel.contextLength ||
          existing.pricing?.input !== newModel.pricing?.input ||
          existing.pricing?.output !== newModel.pricing?.output;

        if (hasChanges) {
          updatedModels.push(newModel);
        }
      }
    }

    // Merge: KEEP ALL existing models + add only recent new ones
    const mergedModels = [
      // Keep all existing models, but update if changes found
      ...existingModels.map(existing => {
        const updated = allProviderModels.find(m => m.id === existing.id);
        return updated || existing; // Use updated data if available, otherwise keep as-is
      }),
      // Add only new recent models
      ...addedModels,
    ];

    // Sort by name
    mergedModels.sort((a, b) => a.name.localeCompare(b.name));

    // Update database
    await db
      .update(llmProviders)
      .set({
        availableModels: mergedModels,
        updatedAt: new Date(),
      })
      .where(eq(llmProviders.id, providerId));

    return {
      success: true,
      provider: provider.displayName,
      modelsAdded: addedModels.length,
      modelsRemoved: 0, // Never remove models
      modelsUpdated: updatedModels.length,
      totalModels: mergedModels.length,
      addedModels: addedModels.map(m => m.id),
      removedModels: [], // Never remove models
      updatedModels: updatedModels.map(m => m.id),
      syncedAt: new Date(),
    };
  } catch (error) {
    return {
      success: false,
      provider: "Unknown",
      modelsAdded: 0,
      modelsRemoved: 0,
      modelsUpdated: 0,
      totalModels: 0,
      addedModels: [],
      removedModels: [],
      updatedModels: [],
      error: error instanceof Error ? error.message : "Unknown error",
      syncedAt: new Date(),
    };
  }
}

/**
 * Sync models for all enabled providers
 */
export async function syncAllProviderModels(openRouterApiKey?: string): Promise<SyncResult[]> {
  const providers = await db
    .select()
    .from(llmProviders)
    .where(eq(llmProviders.isEnabled, true));
  
  const results: SyncResult[] = [];
  
  for (const provider of providers) {
    const result = await syncProviderModels(provider.id, openRouterApiKey);
    results.push(result);
  }
  
  return results;
}

/**
 * Fetch all available models from OpenRouter (for browsing)
 */
export async function fetchAllOpenRouterModels(apiKey?: string): Promise<{
  models: SyncedModel[];
  providers: string[];
  totalCount: number;
}> {
  const allModels = await fetchOpenRouterModels(apiKey);
  const convertedModels = allModels.map(convertModel);
  
  // Extract unique providers
  const providers = [...new Set(convertedModels.map(m => m.provider).filter(Boolean))] as string[];
  providers.sort();
  
  return {
    models: convertedModels,
    providers,
    totalCount: convertedModels.length,
  };
}

/**
 * Get sync status for a provider
 */
export async function getProviderSyncStatus(providerId: number): Promise<{
  lastSynced?: Date;
  modelCount: number;
  hasModels: boolean;
}> {
  const [provider] = await db
    .select({
      availableModels: llmProviders.availableModels,
      updatedAt: llmProviders.updatedAt,
    })
    .from(llmProviders)
    .where(eq(llmProviders.id, providerId))
    .limit(1);
  
  if (!provider) {
    return { modelCount: 0, hasModels: false };
  }
  
  const models = (provider.availableModels as SyncedModel[]) || [];
  
  return {
    lastSynced: provider.updatedAt || undefined,
    modelCount: models.length,
    hasModels: models.length > 0,
  };
}

/**
 * Import models from OpenRouter to a specific provider
 */
export async function importModelsFromOpenRouter(
  providerId: number,
  modelIds: string[],
  openRouterApiKey?: string
): Promise<{ success: boolean; imported: number; error?: string }> {
  try {
    // Fetch all models from OpenRouter
    const allModels = await fetchOpenRouterModels(openRouterApiKey);
    const convertedModels = allModels.map(convertModel);
    
    // Filter to only requested models
    const modelsToImport = convertedModels.filter(m => modelIds.includes(m.id));
    
    if (modelsToImport.length === 0) {
      return { success: false, imported: 0, error: "No matching models found" };
    }
    
    // Get existing models
    const [provider] = await db
      .select({ availableModels: llmProviders.availableModels })
      .from(llmProviders)
      .where(eq(llmProviders.id, providerId))
      .limit(1);
    
    if (!provider) {
      return { success: false, imported: 0, error: "Provider not found" };
    }
    
    const existingModels = (provider.availableModels as SyncedModel[]) || [];
    const existingIds = new Set(existingModels.map(m => m.id));
    
    // Add only new models
    const newModels = modelsToImport.filter(m => !existingIds.has(m.id));
    const mergedModels = [...existingModels, ...newModels];
    mergedModels.sort((a, b) => a.name.localeCompare(b.name));
    
    // Update database
    await db
      .update(llmProviders)
      .set({
        availableModels: mergedModels,
        updatedAt: new Date(),
      })
      .where(eq(llmProviders.id, providerId));
    
    return { success: true, imported: newModels.length };
  } catch (error) {
    return {
      success: false,
      imported: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if a synced model is too old and should be cleaned up
 */
function isModelTooOld(model: SyncedModel): boolean {
  // If model has no createdAt and we require it, keep the model (safety)
  if (!model.createdAt) {
    return !CLEANUP_CONFIG.requireCreatedAt;
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = CLEANUP_CONFIG.maxAgeDays * 24 * 60 * 60;
  const modelAge = now - model.createdAt;

  return modelAge > maxAgeSeconds;
}

/**
 * Cleanup result interface
 */
export interface CleanupResult {
  success: boolean;
  provider: string;
  modelsRemoved: number;
  modelsKept: number;
  removedModels: string[];
  error?: string;
}

/**
 * Clean up old models from a specific provider
 * Removes models older than CLEANUP_CONFIG.maxAgeDays
 */
export async function cleanupOldModels(providerId: number): Promise<CleanupResult> {
  try {
    const [provider] = await db
      .select()
      .from(llmProviders)
      .where(eq(llmProviders.id, providerId))
      .limit(1);

    if (!provider) {
      return {
        success: false,
        provider: "Unknown",
        modelsRemoved: 0,
        modelsKept: 0,
        removedModels: [],
        error: "Provider not found",
      };
    }

    const existingModels = (provider.availableModels as SyncedModel[]) || [];

    // Separate models to keep and remove
    const modelsToKeep: SyncedModel[] = [];
    const modelsToRemove: SyncedModel[] = [];

    for (const model of existingModels) {
      if (isModelTooOld(model)) {
        modelsToRemove.push(model);
      } else {
        modelsToKeep.push(model);
      }
    }

    // Update database if any models were removed
    if (modelsToRemove.length > 0) {
      await db
        .update(llmProviders)
        .set({
          availableModels: modelsToKeep,
          updatedAt: new Date(),
        })
        .where(eq(llmProviders.id, providerId));
    }

    return {
      success: true,
      provider: provider.displayName,
      modelsRemoved: modelsToRemove.length,
      modelsKept: modelsToKeep.length,
      removedModels: modelsToRemove.map(m => m.id),
    };
  } catch (error) {
    return {
      success: false,
      provider: "Unknown",
      modelsRemoved: 0,
      modelsKept: 0,
      removedModels: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Clean up old models from all providers
 */
export async function cleanupAllOldModels(): Promise<CleanupResult[]> {
  const providers = await db.select().from(llmProviders);

  const results: CleanupResult[] = [];

  for (const provider of providers) {
    const result = await cleanupOldModels(provider.id);
    results.push(result);
  }

  return results;
}

/**
 * Get cleanup preview - shows what would be deleted without actually deleting
 */
export async function getCleanupPreview(providerId?: number): Promise<{
  providers: Array<{
    id: number;
    name: string;
    modelsToRemove: string[];
    modelsToKeep: number;
  }>;
  totalToRemove: number;
  totalToKeep: number;
}> {
  const query = providerId
    ? db.select().from(llmProviders).where(eq(llmProviders.id, providerId))
    : db.select().from(llmProviders);

  const providers = await query;

  const result = {
    providers: [] as Array<{
      id: number;
      name: string;
      modelsToRemove: string[];
      modelsToKeep: number;
    }>,
    totalToRemove: 0,
    totalToKeep: 0,
  };

  for (const provider of providers) {
    const models = (provider.availableModels as SyncedModel[]) || [];
    const toRemove = models.filter(isModelTooOld);
    const toKeep = models.filter(m => !isModelTooOld(m));

    result.providers.push({
      id: provider.id,
      name: provider.displayName,
      modelsToRemove: toRemove.map(m => m.id),
      modelsToKeep: toKeep.length,
    });

    result.totalToRemove += toRemove.length;
    result.totalToKeep += toKeep.length;
  }

  return result;
}
