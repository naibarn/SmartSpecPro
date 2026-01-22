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
  DEFAULT_MODELS,
  MEDIA_MODELS,
} from "./mediaGenerationService";
import { deductCredits, hasEnoughCredits } from "./creditService";

export interface SkillExecutionParams {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  quality?: string;
  style?: string;
  numImages?: number;
  duration?: number;
  voice?: string;
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

// Map skill model names to media generation models
const MODEL_MAP: Record<string, string> = {
  // Image models
  nano_banana_pro: "google-nano-banana-pro",
  flux_2_0: "flux-2.0",
  z_image: "z-image",
  grok_imagine: "grok-imagine",
  // Video models
  veo_3_1: "veo-3-1",
  sora_2: "sora-2",
  kling_2_6: "kling-2.6",
  // Audio models
  elevenlabs_tts: "elevenlabs-tts",
  elevenlabs_sfx: "elevenlabs-sfx",
};

/**
 * Execute a detected skill
 */
export async function executeSkill(
  skill: SkillDefinition,
  params: SkillExecutionParams,
  userId: number,
  userToken: string
): Promise<SkillExecutionResult> {
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
  // Map model name
  const modelInput = params.model || skill.defaultModel || "nano_banana_pro";
  const model = (MODEL_MAP[modelInput] || modelInput) as ImageModel;

  // Get model metadata for credit cost
  const modelMeta = MEDIA_MODELS[model];
  if (!modelMeta) {
    return {
      success: false,
      skillId: skill.id,
      type: "image",
      error: `Unknown image model: ${model}`,
    };
  }

  // Calculate credits needed
  const creditCost = modelMeta.creditCost * (params.numImages || 1);

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
    // Generate image
    const result = await mediaGenerationService.generateImage(
      {
        prompt: params.prompt,
        model,
        aspectRatio: params.aspectRatio,
        numImages: params.numImages,
      },
      userToken
    );

    // Deduct credits
    await deductCredits({
      userId,
      amount: result.creditsUsed || creditCost,
      description: `Image generation: ${model}`,
      metadata: {
        model,
        skillId: skill.id,
        prompt: params.prompt.slice(0, 100),
      },
    });

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
  // Map model name
  const modelInput = params.model || skill.defaultModel || "veo_3_1";
  const model = (MODEL_MAP[modelInput] || modelInput) as VideoModel;

  // Get model metadata for credit cost
  const modelMeta = MEDIA_MODELS[model];
  if (!modelMeta) {
    return {
      success: false,
      skillId: skill.id,
      type: "video",
      error: `Unknown video model: ${model}`,
    };
  }

  // Calculate credits needed (based on duration)
  const duration = params.duration || 5;
  const durationMultiplier = Math.ceil(duration / 5);
  const creditCost = modelMeta.creditCost * durationMultiplier;

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
    // Generate video asynchronously
    const task = await mediaGenerationService.generateVideoAsync(
      {
        prompt: params.prompt,
        model,
        duration,
        aspectRatio: params.aspectRatio,
      },
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
  const model = (params.model || DEFAULT_MODELS.audio) as AudioModel;

  // Get model metadata for credit cost
  const modelMeta = MEDIA_MODELS[model];
  if (!modelMeta) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: `Unknown audio model: ${model}`,
    };
  }

  // Check credits
  const hasCredits = await hasEnoughCredits(userId, modelMeta.creditCost);
  if (!hasCredits) {
    return {
      success: false,
      skillId: "audio-generation",
      type: "audio",
      error: `Insufficient credits. Need ${modelMeta.creditCost} credits for audio generation.`,
    };
  }

  try {
    const result = await mediaGenerationService.generateAudio(
      {
        text: params.prompt,
        model,
        voice: params.voice,
      },
      userToken
    );

    // Deduct credits
    await deductCredits({
      userId,
      amount: result.creditsUsed || modelMeta.creditCost,
      description: `Audio generation: ${model}`,
      metadata: {
        model,
        textLength: params.prompt.length,
      },
    });

    // Extract URL
    const url = result.data?.[0]?.url;

    return {
      success: true,
      skillId: "audio-generation",
      type: "audio",
      data: result,
      resultUrl: url,
      message: `Generated audio using ${modelMeta.name}`,
      creditsUsed: result.creditsUsed || modelMeta.creditCost,
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
  const model = modelInput ? MODEL_MAP[modelInput] || modelInput : null;

  if (!model) {
    return 0;
  }

  const modelMeta = MEDIA_MODELS[model];
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
  // Only image and video generation skills can be auto-executed
  return ["image-generation", "video-generation"].includes(skill.type);
}
