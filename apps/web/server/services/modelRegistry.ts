/**
 * Model Registry - Single source of truth for all AI models
 * Used by skillDetector, skillExecutor, and mediaGenerationService
 *
 * Supports both:
 * - Static models (fallback when database is unavailable)
 * - Dynamic models from database (preferred when available)
 */

import { db } from "../db";
import { mediaModels } from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";

export type MediaType = "image" | "video" | "audio";

export interface ModelDefinition {
  id: string;
  type: MediaType;
  name: string;
  provider: string;
  description: string;

  /** Aliases for natural language detection */
  aliases: string[];

  /** Credit cost per generation */
  creditCost: number;

  /** Supported aspect ratios */
  aspectRatios?: string[];

  /** Supported sizes */
  sizes?: string[];

  /** Supported durations for video */
  durations?: number[];

  /** Supported voices for audio */
  voices?: string[];

  /** Whether this model is enabled */
  isEnabled?: boolean;

  /** Priority for selection (lower = higher priority) */
  priority?: number;

  /** Provider-specific config (e.g., kieModelId, apiEndpoint) */
  configJson?: Record<string, any>;
}

/**
 * Static fallback registry - used when database is unavailable
 * This ensures the system works even without database connection
 */
const STATIC_MODEL_REGISTRY: ModelDefinition[] = [
  // ==================== Image Models ====================
  {
    id: "google-nano-banana-pro",
    type: "image",
    name: "Google Nano Banana Pro",
    provider: "kie.ai",
    description: "High-quality image generation with Google's latest model",
    aliases: [
      "nano banana pro",
      "nano_banana_pro",
      "nanobananapro",
      "google nano banana",
      "gemini 3",
      "banana pro",
      "nano-banana-pro",
    ],
    creditCost: 10,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    isEnabled: true,
    priority: 1,
  },
  {
    id: "google-banana-2",
    type: "image",
    name: "Google Banana 2",
    provider: "kie.ai",
    description: "Gemini 3.1 Flash Image model with fast 4K generation and strong consistency",
    aliases: [
      "google banana 2",
      "banana 2",
      "banana-2",
      "nano banana 2",
      "nano-banana-2",
      "google/nano-banana-2",
    ],
    creditCost: 40,
    aspectRatios: ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9", "auto"],
    isEnabled: true,
    priority: 2,
  },
  {
    id: "flux-2.0",
    type: "image",
    name: "Flux 2.0",
    provider: "kie.ai",
    description: "Fast and creative image generation",
    aliases: ["flux 2.0", "flux 2", "flux2", "flux_2_0", "flux-2.0", "flux"],
    creditCost: 8,
    aspectRatios: ["1:1", "16:9", "9:16"],
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    isEnabled: true,
    priority: 3,
  },
  {
    id: "z-image",
    type: "image",
    name: "Z-Image",
    provider: "kie.ai",
    description: "Artistic style image generation",
    aliases: ["z-image", "z image", "z_image", "zimage"],
    creditCost: 5,
    aspectRatios: ["1:1"],
    sizes: ["1024x1024"],
    isEnabled: true,
    priority: 4,
  },
  {
    id: "grok-imagine",
    type: "image",
    name: "Grok Imagine",
    provider: "kie.ai",
    description: "xAI's image generation model",
    aliases: ["grok imagine", "grok-imagine", "grok_imagine", "grokimagine", "grok"],
    creditCost: 12,
    aspectRatios: ["1:1", "16:9", "9:16"],
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    isEnabled: true,
    priority: 5,
  },
  {
    id: "gpt-image-1.5-all",
    type: "image",
    name: "GPT Image 1.5 All",
    provider: "knplabai",
    description: "OpenAI-compatible image generation via KNPLabs",
    aliases: ["gpt image 1.5 all", "gpt-image-1.5-all", "knplabs image"],
    creditCost: 12,
    aspectRatios: ["1:1", "16:9", "9:16"],
    sizes: ["1024x1024", "1536x1536"],
    isEnabled: true,
    priority: 6,
  },
  {
    id: "gemini-3.1-flash-image-preview",
    type: "image",
    name: "Gemini 3.1 Flash Image",
    provider: "knplabai",
    description: "Gemini native image generation via KNPLabs",
    aliases: ["gemini 3.1 flash image", "gemini-3.1-flash-image-preview", "knplabs gemini image"],
    creditCost: 14,
    aspectRatios: ["1:1", "16:9", "9:16"],
    isEnabled: true,
    priority: 7,
  },

  // ==================== Video Models ====================
  {
    id: "veo-3-1",
    type: "video",
    name: "Veo 3.1",
    provider: "kie.ai",
    description: "Google's video generation model",
    aliases: ["veo 3.1", "veo 3", "veo3", "veo_3_1", "veo-3.1", "google veo", "veo"],
    creditCost: 50,
    durations: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    isEnabled: true,
    priority: 1,
  },
  {
    id: "sora-2",
    type: "video",
    name: "Sora 2",
    provider: "kie.ai",
    description: "OpenAI's video generation model",
    aliases: ["sora 2", "sora2", "sora_2", "sora-2", "openai sora", "sora"],
    creditCost: 80,
    durations: [5, 10, 15, 20],
    aspectRatios: ["16:9", "9:16", "1:1"],
    isEnabled: true,
    priority: 2,
  },
  {
    id: "kling-2.6",
    type: "video",
    name: "Kling 2.6",
    provider: "kie.ai",
    description: "Kling video generation model",
    aliases: ["kling 2.6", "kling 2", "kling2", "kling_2_6", "kling-2.6", "kling"],
    creditCost: 40,
    durations: [5, 10],
    aspectRatios: ["16:9", "9:16"],
    isEnabled: true,
    priority: 3,
  },
  {
    id: "veo_3_1-fast",
    type: "video",
    name: "Veo 3.1 Fast",
    provider: "knplabai",
    description: "KNPLabs fast form-data video generation",
    aliases: ["veo 3.1 fast", "veo_3_1-fast", "knplabs veo fast"],
    creditCost: 35,
    durations: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    isEnabled: true,
    priority: 4,
  },
  {
    id: "grok-video-3",
    type: "video",
    name: "Grok Video 3",
    provider: "knplabai",
    description: "KNPLabs JSON video generation",
    aliases: ["grok video 3", "grok-video-3", "knplabs grok video"],
    creditCost: 36,
    durations: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    isEnabled: true,
    priority: 5,
  },

  // ==================== Audio Models ====================
  {
    id: "elevenlabs-tts",
    type: "audio",
    name: "ElevenLabs Text-to-Speech",
    provider: "kie.ai",
    description: "High-quality text-to-speech",
    aliases: [
      "elevenlabs tts",
      "elevenlabs",
      "eleven labs",
      "11labs",
      "text to speech",
      "tts",
    ],
    creditCost: 5,
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    isEnabled: true,
    priority: 1,
  },
  {
    id: "elevenlabs-sfx",
    type: "audio",
    name: "ElevenLabs Sound Effects",
    provider: "kie.ai",
    description: "Sound effects generation",
    aliases: ["elevenlabs sfx", "elevenlabs sound", "sound effects", "sfx"],
    creditCost: 3,
    isEnabled: true,
    priority: 2,
  },
  {
    id: "gpt-4o-mini-tts",
    type: "audio",
    name: "GPT-4o Mini TTS",
    provider: "knplabai",
    description: "KNPLabs OpenAI-compatible text-to-speech",
    aliases: ["gpt 4o mini tts", "gpt-4o-mini-tts", "knplabs tts"],
    creditCost: 4,
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    isEnabled: true,
    priority: 3,
  },
  {
    id: "tts-1",
    type: "audio",
    name: "TTS-1",
    provider: "knplabai",
    description: "KNPLabs OpenAI-compatible TTS",
    aliases: ["tts 1", "tts-1", "knplabs tts 1"],
    creditCost: 3,
    voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    isEnabled: true,
    priority: 4,
  },
];

// ==================== Cache Management ====================

/** Cached models from database */
let _cachedModels: ModelDefinition[] | null = null;
let _cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const _registryCounters = {
  staticFallbackHits: 0,
  cacheHits: 0,
};

export function getModelRegistryCounters(): Readonly<typeof _registryCounters> {
  return { ..._registryCounters };
}

export function resetModelRegistryCounters(): void {
  _registryCounters.staticFallbackHits = 0;
  _registryCounters.cacheHits = 0;
}

function reportStaticFallback(reason: string): void {
  const details = { reason, staticFallbackHits: _registryCounters.staticFallbackHits };
  if (process.env.NODE_ENV === "production") {
    console.error("[ModelRegistry] STATIC FALLBACK ACTIVE", details);
    return;
  }
  console.warn("[ModelRegistry] Using static fallback registry", details);
}

/**
 * Convert database model to ModelDefinition
 */
function dbModelToDefinition(dbModel: any): ModelDefinition {
  return {
    id: dbModel.modelId,
    type: dbModel.modelType as MediaType,
    name: dbModel.name,
    provider: dbModel.provider,
    description: dbModel.description || "",
    aliases: dbModel.aliases || [],
    creditCost: dbModel.creditCost,
    aspectRatios: dbModel.aspectRatios || undefined,
    sizes: dbModel.sizes || undefined,
    durations: dbModel.durations || undefined,
    voices: dbModel.voices || undefined,
    isEnabled: dbModel.isEnabled,
    priority: dbModel.priority,
    configJson: typeof dbModel.configJson === "string"
      ? (() => { try { return JSON.parse(dbModel.configJson); } catch { return undefined; } })()
      : dbModel.configJson || undefined,
  };
}

/**
 * Load models from database (async)
 */
async function loadModelsFromDatabase(): Promise<ModelDefinition[]> {
  try {
    const dbModels = await db
      .select()
      .from(mediaModels)
      .where(eq(mediaModels.isEnabled, true))
      .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority));

    if (dbModels.length > 0) {
      return dbModels.map(dbModelToDefinition);
    }
  } catch (error) {
    console.warn("[ModelRegistry] Database load failed, using static fallback:", error);
  }

  return [];
}

/**
 * Refresh the model cache from database
 */
export async function refreshModelCache(): Promise<void> {
  const dbModels = await loadModelsFromDatabase();
  if (dbModels.length > 0) {
    _cachedModels = dbModels;
    _cacheLoadedAt = Date.now();
    console.log(`[ModelRegistry] Loaded ${dbModels.length} models from database`);
  } else {
    _cachedModels = null;
    _registryCounters.staticFallbackHits += 1;
    reportStaticFallback("empty_db_model_list");
  }
}

/**
 * Get the current model registry (cached or static)
 */
function getModelRegistry(): ModelDefinition[] {
  // Check if cache is valid
  if (_cachedModels && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) {
    _registryCounters.cacheHits += 1;
    return _cachedModels;
  }

  // Trigger async refresh in background (non-blocking)
  refreshModelCache().catch(() => {});

  // Return cached models or static fallback
  if (_cachedModels) {
    return _cachedModels;
  }

  _registryCounters.staticFallbackHits += 1;
  reportStaticFallback("cache_miss_or_refresh_pending");
  return STATIC_MODEL_REGISTRY;
}

/**
 * Clear the model cache (forces reload on next access)
 */
export function clearModelCache(): void {
  _cachedModels = null;
  _cacheLoadedAt = 0;
}

// ==================== Backward Compatible Exports ====================

/**
 * @deprecated Use dynamic registry instead
 * Kept for backward compatibility
 */
export const MODEL_REGISTRY = STATIC_MODEL_REGISTRY;

// ==================== Helper Functions ====================

/**
 * Get all models
 */
export function getAllModels(): ModelDefinition[] {
  return getModelRegistry();
}

/**
 * Get enabled models
 */
export function getEnabledModels(): ModelDefinition[] {
  return getModelRegistry().filter((m) => m.isEnabled !== false);
}

/**
 * Get models by type
 */
export function getModelsByType(type: MediaType): ModelDefinition[] {
  return getModelRegistry().filter((m) => m.type === type && m.isEnabled !== false);
}

/**
 * Get model by ID
 */
export function getModelById(id: string): ModelDefinition | undefined {
  return getModelRegistry().find((m) => m.id === id);
}

/**
 * Get model IDs by type (for skill registry)
 */
export function getModelIdsByType(type: MediaType): string[] {
  return getModelsByType(type)
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .map((m) => m.id);
}

/**
 * Get default model for a type
 */
export function getDefaultModel(type: MediaType): ModelDefinition | undefined {
  const models = getModelsByType(type);
  return models.sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];
}

/**
 * Find model by alias (case-insensitive)
 */
export function findModelByAlias(
  alias: string,
  type?: MediaType
): ModelDefinition | undefined {
  const lowerAlias = alias.toLowerCase().trim();
  const models = type ? getModelsByType(type) : getEnabledModels();

  for (const model of models) {
    // Check ID
    if (model.id.toLowerCase() === lowerAlias) {
      return model;
    }

    // Check aliases
    for (const modelAlias of model.aliases) {
      if (modelAlias.toLowerCase() === lowerAlias) {
        return model;
      }
      // Partial match for longer aliases
      if (
        lowerAlias.includes(modelAlias.toLowerCase()) ||
        modelAlias.toLowerCase().includes(lowerAlias)
      ) {
        return model;
      }
    }
  }

  return undefined;
}

/**
 * Detect model from message text
 */
export function detectModelFromMessage(
  message: string,
  type?: MediaType
): ModelDefinition | undefined {
  const lowerMessage = message.toLowerCase();
  const models = type ? getModelsByType(type) : getEnabledModels();

  // Sort by priority so we check higher priority models first
  const sortedModels = [...models].sort((a, b) => (a.priority || 99) - (b.priority || 99));

  for (const model of sortedModels) {
    // Check all aliases
    for (const alias of model.aliases) {
      if (lowerMessage.includes(alias.toLowerCase())) {
        return model;
      }
    }

    // Check ID variations
    const idVariations = [
      model.id,
      model.id.replace(/-/g, " "),
      model.id.replace(/-/g, "_"),
      model.id.replace(/\./g, " "),
    ];

    for (const variation of idVariations) {
      if (lowerMessage.includes(variation.toLowerCase())) {
        return model;
      }
    }
  }

  return undefined;
}

/**
 * Get all aliases for all models (for prompt cleaning)
 */
export function getAllModelAliases(): Map<string, string> {
  const aliasMap = new Map<string, string>();
  const registry = getModelRegistry();

  for (const model of registry) {
    // Add ID
    aliasMap.set(model.id.toLowerCase(), model.id);

    // Add all aliases
    for (const alias of model.aliases) {
      aliasMap.set(alias.toLowerCase(), model.id);
    }
  }

  return aliasMap;
}

/**
 * Map internal model ID to API model ID (if different)
 * This handles mapping from skill registry names to actual API names
 */
export function mapToApiModelId(internalId: string): string {
  const trimmed = internalId.trim();
  if (!trimmed) {
    return internalId;
  }

  // Exact ID hit
  const exact = getModelById(trimmed);
  if (exact) {
    return exact.id;
  }

  // Resolve from aliases (DB/static registry aware)
  const aliasMap = getAllModelAliases();
  const candidates = Array.from(new Set([
    trimmed,
    trimmed.toLowerCase(),
    trimmed.replace(/_/g, "-"),
    trimmed.replace(/_/g, " "),
    trimmed.replace(/-/g, " "),
    trimmed.replace(/\./g, " "),
    trimmed.replace(/\s+/g, "-"),
    trimmed.replace(/\s+/g, "_"),
  ]));

  for (const candidate of candidates) {
    const resolved = aliasMap.get(candidate.toLowerCase());
    if (resolved) {
      return resolved;
    }
  }

  // Legacy hardcoded compatibility map (last fallback).
  const legacyMappings: Record<string, string> = {
    nano_banana_pro: "google-nano-banana-pro",
    nano_banana_2: "google-banana-2",
    google_banana_2: "google-banana-2",
    flux_2_0: "flux-2.0",
    z_image: "z-image",
    grok_imagine: "grok-imagine",
    veo_3_1: "veo-3-1",
    sora_2: "sora-2",
    kling_2_6: "kling-2.6",
    elevenlabs_tts: "elevenlabs-tts",
    elevenlabs_sfx: "elevenlabs-sfx",
  };

  return legacyMappings[trimmed] || trimmed;
}

/**
 * Get model metadata for media generation service format
 */
export function getModelMetadata(modelId: string):
  | {
      id: string;
      type: MediaType;
      name: string;
      provider: string;
      description: string;
      creditCost: number;
      supportsAspectRatios?: string[];
      supportsSizes?: string[];
      supportsDurations?: number[];
      supportsVoices?: string[];
    }
  | undefined {
  const model = getModelById(modelId) || getModelById(mapToApiModelId(modelId));

  if (!model) return undefined;

  return {
    id: model.id,
    type: model.type,
    name: model.name,
    provider: model.provider,
    description: model.description,
    creditCost: model.creditCost,
    supportsAspectRatios: model.aspectRatios,
    supportsSizes: model.sizes,
    supportsDurations: model.durations,
    supportsVoices: model.voices,
  };
}

// ==================== Async Variants ====================

/**
 * Get all models (async - ensures fresh data from database)
 */
export async function getAllModelsAsync(): Promise<ModelDefinition[]> {
  await refreshModelCache();
  return getModelRegistry();
}

/**
 * Get models by type (async - ensures fresh data from database)
 */
export async function getModelsByTypeAsync(type: MediaType): Promise<ModelDefinition[]> {
  await refreshModelCache();
  return getModelsByType(type);
}
