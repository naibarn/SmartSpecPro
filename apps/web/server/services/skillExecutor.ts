/**
 * Skill Executor Service
 * Executes detected skills by calling the appropriate service
 */

import { SkillDefinition } from "./skillRegistry";
import {
  mediaGenerationService,
  ImageModel,
  VideoModel,
  AudioModel,
  MediaGenerationResponse,
} from "./mediaGenerationService";
import { hasEnoughCredits } from "./creditService";
import {
  getModelById,
  getDefaultModel,
  mapToApiModelId,
} from "./modelRegistry";
import { calculateCreditCost } from "./pricingCalculator";

// Simple in-memory rate limiter per user per skill type
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  "image-generation": 10,
  "video-generation": 5,
  "audio-generation": 10,
};
const DEFAULT_RATE_LIMIT = 20;

function checkRateLimit(userId: number, skillType: string): boolean {
  const key = `${userId}:${skillType}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  const limit = RATE_LIMITS[skillType] || DEFAULT_RATE_LIMIT;

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export interface SkillExecutionParams {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  style?: string;
  numImages?: number;
  duration?: number;
  voice?: string;
  resolution?: string;
  /** Reference images for image/video generation (1-5 URLs) */
  referenceImageUrls?: string[];
  /** Reference style URL for style transfer */
  referenceStyleUrl?: string;
  /** Per-model API config from configJson (endpoint, kieModelId, etc.) */
  apiConfig?: Record<string, string>;
  /** Dynamic input field values from configJson.inputFields */
  extraParams?: Record<string, any>;
}

export interface SkillExecutionResult {
  success: boolean;
  skillId: string;
  type: "image" | "video" | "audio" | "text" | "action";
  data?: MediaGenerationResponse;
  resultUrl?: string;
  resultUrls?: string[];
  message?: string;
  error?: string;
  creditsUsed?: number;
  taskId?: string;
  isAsync?: boolean;
}

/**
 * Execute a detected skill
 */
export async function executeSkill(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string
): Promise<SkillExecutionResult> {
  // Rate limit check
  if (!checkRateLimit(userId, skill.type)) {
    return {
      success: false,
      skillId: skill.id,
      type: skill.type as any,
      error: "Rate limit exceeded. Please wait before trying again.",
    };
  }

  switch (skill.type) {
    case "image-generation":
      return executeImageGeneration(skill, params, userId, userToken);

    case "video-generation":
      return executeVideoGeneration(skill, params, userId, userToken);

    default:
      return {
        success: false,
        skillId: skill.id,
        type: "text",
        error: `Skill type '${skill.type}' is not yet implemented for automatic execution`,
      };
  }
}

/**
 * Execute image generation skill
 */
async function executeImageGeneration(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string
): Promise<SkillExecutionResult> {
  // Get model from params or defaults (already API format from modelRegistry)
  const modelInput = params.model || skill.defaultModel;
  const model = (modelInput ? mapToApiModelId(modelInput) : getDefaultModel("image")?.id || "google-nano-banana-pro") as ImageModel;

  // Get model metadata from registry
  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return {
      success: false,
      skillId: skill.id,
      type: "image",
      error: `Unknown image model: ${model}`,
    };
  }

  // Calculate credits using pricing tiers
  const creditCost = calculateCreditCost(modelMeta, {
    numImages: params.numImages,
    resolution: (params as any).resolution,
    quality: params.quality,
  });

  // Check credits
  const hasCredits = await hasEnoughCredits(userId, creditCost);
  if (!hasCredits) {
    return {
      success: false,
      skillId: skill.id,
      type: "image",
      error: `Insufficient credits. Need ${creditCost} credits for image generation.`,
    };
  }

  try {
    // Build apiConfig from params (client already built from configJson) or from model's configJson
    const apiConfig: Record<string, string> = params.apiConfig ? { ...params.apiConfig } : {};
    const configJson = modelMeta.configJson;
    if (configJson && !apiConfig.kie_model_id) {
      if (configJson.apiEndpoint) apiConfig.endpoint = configJson.apiEndpoint;
      if (configJson.apiPayloadFormat) apiConfig.payload_format = configJson.apiPayloadFormat;
      if (configJson.kieModelId) apiConfig.kie_model_id = configJson.kieModelId;
    }

    // Generate image — forward all params including extraParams from configJson.inputFields
    const result = await mediaGenerationService.generateImage(
      {
        prompt: params.prompt,
        model,
        aspectRatio: params.aspectRatio,
        numImages: params.numImages,
        resolution: params.resolution,
        referenceImageUrls: params.referenceImageUrls,
        referenceStyleUrl: params.referenceStyleUrl,
        ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        ...(params.extraParams && Object.keys(params.extraParams).length > 0 ? { extraParams: params.extraParams } : {}),
      } as any,
      userToken
    );

    // Credits already deducted by Python backend via gateway_unified._deduct_credits()
    // Do NOT deduct again here to avoid double-charging

    // Extract URLs
    const urls = result.data?.map((d) => d.url).filter((u): u is string => !!u) || [];

    return {
      success: true,
      skillId: skill.id,
      type: "image",
      data: result,
      resultUrl: urls[0],
      resultUrls: urls,
      message: `Generated ${urls.length} image${urls.length > 1 ? "s" : ""} using ${modelMeta.name}`,
      creditsUsed: result.creditsUsed || creditCost,
    };
  } catch (error) {
    return {
      success: false,
      skillId: skill.id,
      type: "image",
      error: error instanceof Error ? error.message : "Image generation failed",
    };
  }
}

/**
 * Execute video generation skill (always async)
 */
async function executeVideoGeneration(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string
): Promise<SkillExecutionResult> {
  // Get model from params or defaults (already API format from modelRegistry)
  const modelInput = params.model || skill.defaultModel;
  const model = (modelInput ? mapToApiModelId(modelInput) : getDefaultModel("video")?.id || "veo-3-1") as VideoModel;

  // Get model metadata from registry
  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return {
      success: false,
      skillId: skill.id,
      type: "video",
      error: `Unknown video model: ${model}`,
    };
  }

  // Calculate credits using pricing tiers
  const duration = params.duration || 5;
  const creditCost = calculateCreditCost(modelMeta, {
    duration: String(duration),
    resolution: (params as any).resolution,
    quality: params.quality,
  });

  // Check credits
  const hasCredits = await hasEnoughCredits(userId, creditCost);
  if (!hasCredits) {
    return {
      success: false,
      skillId: skill.id,
      type: "video",
      error: `Insufficient credits. Need ${creditCost} credits for ${duration}s video generation.`,
    };
  }

  try {
    // Build apiConfig from params or model's configJson
    const apiConfig: Record<string, string> = params.apiConfig ? { ...params.apiConfig } : {};
    const configJson = modelMeta.configJson;
    if (configJson && !apiConfig.kie_model_id) {
      if (configJson.apiEndpoint) apiConfig.endpoint = configJson.apiEndpoint;
      if (configJson.apiPayloadFormat) apiConfig.payload_format = configJson.apiPayloadFormat;
      if (configJson.kieModelId) apiConfig.kie_model_id = configJson.kieModelId;
    }

    // Generate video asynchronously — forward all params including extraParams
    const task = await mediaGenerationService.generateVideoAsync(
      {
        prompt: params.prompt,
        model,
        duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        referenceImageUrls: params.referenceImageUrls,
        ...(Object.keys(apiConfig).length > 0 ? { apiConfig } : {}),
        ...(params.extraParams && Object.keys(params.extraParams).length > 0 ? { extraParams: params.extraParams } : {}),
      } as any,
      userToken
    );

    return {
      success: true,
      skillId: skill.id,
      type: "video",
      taskId: task.id,
      isAsync: true,
      message: `Video generation started using ${modelMeta.name}. Task ID: ${task.id}. You can check the status in the Media Generation panel.`,
      creditsUsed: creditCost, // Credits will be deducted by backend when task completes
    };
  } catch (error) {
    return {
      success: false,
      skillId: skill.id,
      type: "video",
      error: error instanceof Error ? error.message : "Video generation failed",
    };
  }
}

/**
 * Execute audio generation skill
 */
export async function executeAudioGeneration(
  params: SkillExecutionParams,
  userId: number,
  userToken: string
): Promise<SkillExecutionResult> {
  // Get model from params or defaults (already API format from modelRegistry)
  const modelInput = params.model;
  const model = (modelInput ? mapToApiModelId(modelInput) : getDefaultModel("audio")?.id || "elevenlabs-tts") as AudioModel;

  // Get model metadata from registry
  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: `Unknown audio model: ${model}`,
    };
  }

  // Calculate credits using pricing tiers
  const audioCreditCost = calculateCreditCost(modelMeta, {
    voice: params.voice,
  });
  const hasCredits = await hasEnoughCredits(userId, audioCreditCost);
  if (!hasCredits) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: `Insufficient credits. Need ${audioCreditCost} credits for audio generation.`,
    };
  }

  try {
    const result = await mediaGenerationService.generateAudio(
      {
        text: params.prompt,
        model,
        voice: params.voice,
        ...(params.extraParams && Object.keys(params.extraParams).length > 0 ? { extraParams: params.extraParams } : {}),
      } as any,
      userToken
    );

    // Credits already deducted by Python backend via gateway_unified._deduct_credits()
    // Do NOT deduct again here to avoid double-charging

    // Extract URL
    const url = result.data?.[0]?.url;

    return {
      success: true,
      skillId: "audio-generation",
      type: "audio",
      data: result,
      resultUrl: url,
      message: `Generated audio using ${modelMeta.name}`,
      creditsUsed: result.creditsUsed || audioCreditCost,
    };
  } catch (error) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: error instanceof Error ? error.message : "Audio generation failed",
    };
  }
}

/**
 * Get estimated credit cost for skill execution
 */
export function estimateSkillCost(
  skill: SkillDefinition,
  params: SkillExecutionParams
): number {
  const modelInput = params.model || skill.defaultModel;
  const model = modelInput ? mapToApiModelId(modelInput) : null;

  if (!model) {
    return 0;
  }

  const modelMeta = getModelById(model);
  if (!modelMeta) {
    return 0;
  }

  let cost = modelMeta.creditCost;

  // Multiply for multiple images
  if (skill.type === "image-generation" && params.numImages) {
    cost *= params.numImages;
  }

  // Multiply for video duration
  if (skill.type === "video-generation" && params.duration) {
    cost *= Math.ceil(params.duration / 5);
  }

  return cost;
}

/**
 * Check if a skill can be automatically executed
 */
export function canAutoExecute(skill: SkillDefinition): boolean {
  // Media generation skills can be auto-executed
  return ["image-generation", "video-generation", "audio-generation"].includes(skill.type);
}
