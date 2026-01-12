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

// Types
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
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

interface SyncedModel {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: {
    input: number;
    output: number;
  };
  provider?: string;
  description?: string;
}

interface SyncResult {
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

// Provider-specific model prefixes for filtering
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
 * Parse pricing string to number (e.g., "0.00001" -> 0.00001)
 */
function parsePricing(priceStr?: string): number {
  if (!priceStr) return 0;
  const parsed = parseFloat(priceStr);
  return isNaN(parsed) ? 0 : parsed;
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
  };
}

/**
 * Filter models by provider prefix
 */
function filterModelsByProvider(models: SyncedModel[], providerName: string): SyncedModel[] {
  const prefixes = PROVIDER_PREFIXES[providerName.toLowerCase()];
  if (!prefixes) {
    // If no prefix defined, try to match by provider field
    return models.filter(m => 
      m.provider?.toLowerCase() === providerName.toLowerCase()
    );
  }
  
  return models.filter(m => 
    prefixes.some(prefix => m.id.toLowerCase().startsWith(prefix.toLowerCase()))
  );
}

/**
 * Sync models for a specific provider from OpenRouter
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
    
    // Fetch all models from OpenRouter
    const allModels = await fetchOpenRouterModels(openRouterApiKey);
    const convertedModels = allModels.map(convertModel);
    
    // Filter models for this provider
    const providerModels = filterModelsByProvider(convertedModels, provider.providerName);
    
    // Get existing models
    const existingModels = (provider.availableModels as SyncedModel[]) || [];
    const existingIds = new Set(existingModels.map(m => m.id));
    const newIds = new Set(providerModels.map(m => m.id));
    
    // Calculate diff
    const addedModels = providerModels.filter(m => !existingIds.has(m.id));
    const removedModels = existingModels.filter(m => !newIds.has(m.id));
    const updatedModels: SyncedModel[] = [];
    
    // Check for updates (context length or pricing changes)
    for (const newModel of providerModels) {
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
    
    // Merge: keep existing models that are still available, add new ones
    const mergedModels = [
      ...existingModels.filter(m => newIds.has(m.id)).map(existing => {
        const updated = providerModels.find(m => m.id === existing.id);
        return updated || existing;
      }),
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
      modelsRemoved: removedModels.length,
      modelsUpdated: updatedModels.length,
      totalModels: mergedModels.length,
      addedModels: addedModels.map(m => m.id),
      removedModels: removedModels.map(m => m.id),
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
