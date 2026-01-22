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
      "นาโน่บานาน่า",
    ],
    creditCost: 10,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    isEnabled: true,
    priority: 1,
  },
  {
    id: "flux-2.0",
    type: "image",
    name: "Flux 2.0",
    provider: "kie.ai",
    description: "Fast and creative image generation",
    aliases: ["flux 2.0", "flux 2", "flux2", "flux_2_0", "flux-2.0", "flux", "ฟลักซ์"],
    creditCost: 8,
    aspectRatios: ["1:1", "16:9", "9:16"],
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    isEnabled: true,
    priority: 2,
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
    priority: 3,
  },
  {
    id: "grok-imagine",
    type: "image",
    name: "Grok Imagine",
    provider: "kie.ai",
    description: "xAI's image generation model",
    aliases: ["grok imagine", "grok-imagine", "grok_imagine", "grokimagine", "grok", "กร็อก"],
    creditCost: 12,
    aspectRatios: ["1:1", "16:9", "9:16"],
    sizes: ["1024x1024", "1024x1792", "1792x1024"],
    isEnabled: true,
    priority: 4,
  },

  // ==================== Video Models ====================
  {
    id: "veo-3-1",
    type: "video",
    name: "Veo 3.1",
    provider: "kie.ai",
    description: "Google's video generation model",
    aliases: ["veo 3.1", "veo 3", "veo3", "veo_3_1", "veo-3.1", "google veo", "veo", "วีโอ"],
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
    aliases: ["sora 2", "sora2", "sora_2", "sora-2", "openai sora", "sora", "โซร่า"],
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
    aliases: ["kling 2.6", "kling 2", "kling2", "kling_2_6", "kling-2.6", "kling", "คลิง"],
    creditCost: 40,
    durations: [5, 10],
    aspectRatios: ["16:9", "9:16"],
    isEnabled: true,
    priority: 3,
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
      "อีเลฟเว่นแล็บ",
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
    aliases: ["elevenlabs sfx", "elevenlabs sound", "sound effects", "sfx", "เสียงเอฟเฟกต์"],
    creditCost: 3,
    isEnabled: true,
    priority: 2,
  },
];

// ==================== Cache Management ====================

/** Cached models from database */
let _cachedModels: ModelDefinition[] | null = null;
let _cacheLoadedAt: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

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
    console.log("[ModelRegistry] No models in database, using static fallback");
  }
}

/**
 * Get the current model registry (cached or static)
 */
function getModelRegistry(): ModelDefinition[] {
  // Check if cache is valid
  if (_cachedModels && Date.now() - _cacheLoadedAt < CACHE_TTL_MS) {
    return _cachedModels;
  }

  // Trigger async refresh in background (non-blocking)
  refreshModelCache().catch(() => {});

  // Return cached models or static fallback
  return _cachedModels || STATIC_MODEL_REGISTRY;
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
  // Map underscore format to hyphen format for API
  const mappings: Record<string, string> = {
    nano_banana_pro: "google-nano-banana-pro",
    flux_2_0: "flux-2.0",
    z_image: "z-image",
    grok_imagine: "grok-imagine",
    veo_3_1: "veo-3-1",
    sora_2: "sora-2",
    kling_2_6: "kling-2.6",
    elevenlabs_tts: "elevenlabs-tts",
    elevenlabs_sfx: "elevenlabs-sfx",
  };

  return mappings[internalId] || internalId;
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
