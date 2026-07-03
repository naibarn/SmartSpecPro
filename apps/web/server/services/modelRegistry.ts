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
import {
  buildElevenLabsModelSeeds,
  buildMagnificModelSeeds,
  buildWaveSpeedModelSeeds,
} from "./mediaProviderUtils";
import {
  GEMINI_3_1_FLASH_TTS_CREDIT_COST,
  GEMINI_3_1_FLASH_TTS_MODEL_ID,
  GEMINI_3_1_FLASH_TTS_VOICES,
  buildGemini31FlashTtsInputFields,
} from "./falGeminiTts";

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
const wavespeedModelSeeds = buildWaveSpeedModelSeeds();
const elevenLabsModelSeeds = buildElevenLabsModelSeeds();
const magnificModelSeeds = buildMagnificModelSeeds();

const VEO_31_INPUT_FIELDS = [
  {
    key: "generationType",
    label: "Generation Mode",
    type: "select",
    options: [
      { value: "TEXT_2_VIDEO", label: "Text to Video" },
      { value: "FIRST_AND_LAST_FRAMES_2_VIDEO", label: "First & Last Frames to Video" },
      { value: "REFERENCE_2_VIDEO", label: "Reference to Video (Fast only)" },
    ],
    default: "TEXT_2_VIDEO",
  },
  {
    key: "imageUrls",
    label: "Start/End or Reference Images",
    type: "image_urls",
    syncWith: "reference_images",
  },
  {
    key: "resolution",
    label: "Output Quality",
    type: "select",
    options: [
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080P" },
      { value: "4K", label: "4K" },
    ],
    default: "720p",
    affectsPricing: true,
  },
  { key: "enableTranslation", label: "Enable Translation", type: "boolean", default: false },
  { key: "enableFallback", label: "Enable Fallback", type: "boolean", default: false },
  { key: "watermark", label: "Watermark", type: "text" },
  {
    key: "aspect_ratio",
    label: "Aspect Ratio",
    type: "select",
    options: [
      { value: "auto", label: "Auto" },
      { value: "16:9", label: "16:9" },
      { value: "9:16", label: "9:16" },
    ],
    default: "auto",
    syncWith: "aspect_ratio",
  },
];

const HAPPYHORSE_ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

const HAPPYHORSE_RESOLUTION_OPTIONS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

const HAPPYHORSE_DURATION_OPTIONS = Array.from({ length: 13 }, (_, index) => {
  const seconds = index + 3;
  return { value: String(seconds), label: `${seconds}s` };
});

const GEMINI_OMNI_DURATION_OPTIONS = [4, 6, 8, 10].map((seconds) => ({
  value: String(seconds),
  label: `${seconds}s`,
}));

const GEMINI_OMNI_RESOLUTION_OPTIONS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4K", label: "4K" },
];

const GEMINI_OMNI_ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

const GEMINI_OMNI_PRICING_TIERS = {
  default: 120,
  "720p-4s-without-video": 90,
  "720p-6s-without-video": 120,
  "720p-8s-without-video": 150,
  "720p-10s-without-video": 180,
  "1080p-4s-without-video": 90,
  "1080p-6s-without-video": 120,
  "1080p-8s-without-video": 150,
  "1080p-10s-without-video": 180,
  "4K-4s-without-video": 210,
  "4K-6s-without-video": 240,
  "4K-8s-without-video": 270,
  "4K-10s-without-video": 300,
  "720p-4s-with-video": 240,
  "720p-6s-with-video": 240,
  "720p-8s-with-video": 240,
  "720p-10s-with-video": 240,
  "1080p-4s-with-video": 240,
  "1080p-6s-with-video": 240,
  "1080p-8s-with-video": 240,
  "1080p-10s-with-video": 240,
  "4K-4s-with-video": 360,
  "4K-6s-with-video": 360,
  "4K-8s-with-video": 360,
  "4K-10s-with-video": 360,
};

const GEMINI_OMNI_INPUT_FIELDS = [
  { key: "image_urls", label: "Reference Images", type: "image_urls", required: false, syncWith: "reference_images", hidden: true, managedBySuite: true, providerPayloadKey: "image_urls", referenceUnitWeight: 1, maxItems: 7 },
  {
    key: "video_list",
    label: "Source Video",
    type: "video_urls",
    required: false,
    syncWith: "reference_videos",
    hidden: true,
    managedBySuite: true,
    providerPayloadKey: "video_list",
    referenceUnitWeight: 2,
    maxItems: 1,
    affectsPricing: true,
    pricingAliases: ["referenceVideoUrls", "referenceVideoUrl", "reference_video_urls", "reference_video_url", "video_url"],
    pricingPresenceLabels: { present: "with-video", absent: "without-video" },
  },
  { key: "character_ids", label: "Character References", type: "provider_asset_picker", required: false, hidden: true, advancedOnly: true, managedBySuite: true, assetType: "provider_asset", assetCapability: "gemini_omni_character", providerPayloadKey: "character_ids", referenceUnitWeight: 1, maxItems: 3 },
  { key: "audio_ids", label: "Voice / Audio References", type: "provider_asset_picker", required: false, hidden: true, advancedOnly: true, managedBySuite: true, assetType: "provider_asset", assetCapability: "gemini_omni_audio", providerPayloadKey: "audio_ids", maxItems: 7 },
  { key: "resolution", label: "Resolution", type: "select", options: GEMINI_OMNI_RESOLUTION_OPTIONS, default: "1080p", affectsPricing: true },
  { key: "duration", label: "Duration", type: "select", options: GEMINI_OMNI_DURATION_OPTIONS, default: "4", affectsPricing: true },
  { key: "aspect_ratio", label: "Aspect Ratio", type: "select", options: GEMINI_OMNI_ASPECT_RATIO_OPTIONS, default: "16:9", syncWith: "aspect_ratio" },
  { key: "seed", label: "Seed", type: "number", required: false, advancedOnly: true },
];

function buildHappyHorseConfig(
  kieModelId: "happyhorse/text-to-video" | "happyhorse/image-to-video" | "happyhorse/reference-to-video" | "happyhorse/video-edit",
  generateType: "text-to-video" | "image-to-video" | "reference-to-video" | "video-edit",
  inputFields: any[],
  extraConfig: Record<string, any> = {},
) {
  return {
    apiEndpoint: "/api/v1/jobs/createTask",
    apiQueryEndpoint: "/api/v1/jobs/recordInfo",
    apiPayloadFormat: "market",
    kieModelId,
    generateType,
    maxDuration: generateType === "video-edit" ? 60 : 15,
    maxPromptLength: 5000,
    supportedResolutions: ["720p", "1080p"],
    supportedDurations: generateType === "video-edit"
      ? undefined
      : HAPPYHORSE_DURATION_OPTIONS.map((option) => Number(option.value)),
    supportedAspectRatios: generateType === "image-to-video" || generateType === "video-edit"
      ? undefined
      : HAPPYHORSE_ASPECT_RATIO_OPTIONS.map((option) => option.value),
    inputFields,
    pricingTiers: { default: 100 },
    pricingFormula: "flat",
    ...extraConfig,
  };
}

function buildVeo31Config(kieModelId: "veo3" | "veo3_fast" | "veo3_lite", pricingTiers: Record<string, number>) {
  return {
    apiEndpoint: "/api/v1/veo/generate",
    apiQueryEndpoint: "/api/v1/veo/record-info",
    veo4kEndpoint: "/api/v1/veo/get-4k-video",
    apiPayloadFormat: "veo",
    kieModelId,
    generateType: "text-to-video",
    hasAudio: true,
    maxDuration: 8,
    maxPromptLength: 5000,
    maxReferenceImages: 3,
    supportedResolutions: ["720p", "1080p", "4K"],
    supportedAspectRatios: ["auto", "16:9", "9:16"],
    inputFields: VEO_31_INPUT_FIELDS,
    pricingTiers,
    pricingFormula: "matrix",
  };
}

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
    id: "google-banana-2-lite",
    type: "image",
    name: "Nano Banana 2 Lite",
    provider: "kie.ai",
    description: "Nano Banana 2 Lite for fast, cost-effective image generation and editing",
    aliases: [
      "google banana 2 lite",
      "banana 2 lite",
      "banana-2-lite",
      "nano banana 2 lite",
      "nano-banana-2-lite",
      "google/nano-banana-2-lite",
      "gemini 3.1 flash lite image",
      "gemini-3.1-flash-lite-image",
    ],
    creditCost: 35,
    aspectRatios: ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9", "auto"],
    sizes: ["1K"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "nano-banana-2-lite",
      generateType: "text-to-image",
      maxReferenceImages: 10,
      reference_image_input_key: "image_urls",
      reference_image_input_type: "array",
      inputFields: [
        { key: "image_urls", label: "Reference Images", type: "image_urls", syncWith: "reference_images" },
        {
          key: "aspect_ratio",
          label: "Aspect Ratio",
          type: "select",
          options: [
            { value: "1:1", label: "1:1" },
            { value: "1:4", label: "1:4" },
            { value: "1:8", label: "1:8" },
            { value: "2:3", label: "2:3" },
            { value: "3:2", label: "3:2" },
            { value: "3:4", label: "3:4" },
            { value: "4:1", label: "4:1" },
            { value: "4:3", label: "4:3" },
            { value: "4:5", label: "4:5" },
            { value: "5:4", label: "5:4" },
            { value: "8:1", label: "8:1" },
            { value: "9:16", label: "9:16" },
            { value: "16:9", label: "16:9" },
            { value: "21:9", label: "21:9" },
            { value: "auto", label: "Auto" },
          ],
          default: "auto",
        },
      ],
    },
    isEnabled: true,
    priority: 3,
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
    priority: 4,
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
    priority: 5,
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
    priority: 6,
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
    id: "veo3/generate-veo-3-video-lite",
    type: "video",
    name: "Veo 3.1 Lite",
    provider: "kie.ai",
    description: "Cost-effective Google Veo 3.1 video generation with native audio",
    aliases: ["veo 3.1 lite", "veo3-lite", "veo3_lite", "veo-3.1-lite"],
    creditCost: 150,
    durations: [8],
    aspectRatios: ["auto", "16:9", "9:16"],
    configJson: buildVeo31Config("veo3_lite", {
      "720p": 150,
      "1080p": 300,
      "4K": 600,
    }),
    isEnabled: true,
    priority: 1,
  },
  {
    id: "veo-3-1",
    type: "video",
    name: "Veo 3.1 Quality",
    provider: "kie.ai",
    description: "Flagship Google Veo 3.1 video generation with native audio",
    aliases: [
      "veo 3.1 quality",
      "veo 3.1",
      "veo 3",
      "veo3",
      "veo_3_1",
      "veo-3.1",
      "veo3/generate-veo-3-video",
      "google veo",
      "veo",
    ],
    creditCost: 2000,
    durations: [8],
    aspectRatios: ["auto", "16:9", "9:16"],
    configJson: buildVeo31Config("veo3", {
      "720p": 2000,
      "1080p": 2000,
      "4K": 4000,
    }),
    isEnabled: true,
    priority: 2,
  },
  {
    id: "veo3/generate-veo-3-video-fast",
    type: "video",
    name: "Veo 3.1 Fast",
    provider: "kie.ai",
    description: "Fast Google Veo 3.1 video generation with native audio",
    aliases: ["veo 3.1 fast", "veo3-fast", "veo3_fast", "veo-fast"],
    creditCost: 300,
    durations: [8],
    aspectRatios: ["auto", "16:9", "9:16"],
    configJson: buildVeo31Config("veo3_fast", {
      "720p": 300,
      "1080p": 300,
      "4K": 600,
    }),
    isEnabled: true,
    priority: 3,
  },
  {
    id: "veo3/extend-video",
    type: "video",
    name: "Veo 3.1 Extend",
    provider: "kie.ai",
    description: "Extend an existing video with Veo 3.1 technology",
    aliases: ["veo 3.1 extend", "veo3-extend", "veo-extend", "extend video"],
    creditCost: 1250,
    durations: [8],
    aspectRatios: ["auto", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/veo/extend",
      apiQueryEndpoint: "/api/v1/veo/record-info",
      apiPayloadFormat: "veo_extend",
      kieModelId: null,
      apiConfig: {
        extend_model: "fast",
      },
      generateType: "video-extend",
      maxPromptLength: 5000,
      inputFields: [
        { key: "source_task_id", label: "Original Veo Task ID", type: "text", required: true },
        { key: "video_urls", label: "Source Video Preview", type: "video_urls", required: false, syncWith: "reference_videos" },
        { key: "seeds", label: "Seed", type: "number", required: false },
        { key: "watermark", label: "Watermark", type: "text", required: false },
      ],
      pricingTiers: { default: 1250 },
      pricingFormula: "flat",
    },
    isEnabled: true,
    priority: 4,
  },
  {
    id: "happyhorse/text-to-video",
    type: "video",
    name: "HappyHorse 1.0 Text-to-Video",
    provider: "kie.ai",
    description: "Alibaba ATH HappyHorse 1.0 text-to-video generation",
    aliases: ["happyhorse", "happyhorse 1.0", "happyhorse-1.0", "happyhorse t2v", "happyhorse text to video"],
    creditCost: 100,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    configJson: buildHappyHorseConfig("happyhorse/text-to-video", "text-to-video", [
      { key: "resolution", label: "Resolution", type: "select", options: HAPPYHORSE_RESOLUTION_OPTIONS, default: "1080p", affectsPricing: true },
      { key: "aspect_ratio", label: "Aspect Ratio", type: "select", options: HAPPYHORSE_ASPECT_RATIO_OPTIONS, default: "16:9", syncWith: "aspect_ratio" },
      { key: "duration", label: "Duration", type: "select", options: HAPPYHORSE_DURATION_OPTIONS, default: "5", affectsPricing: true },
      { key: "seed", label: "Seed", type: "number", required: false },
    ]),
    isEnabled: true,
    priority: 5,
  },
  {
    id: "happyhorse/image-to-video",
    type: "video",
    name: "HappyHorse 1.0 Image-to-Video",
    provider: "kie.ai",
    description: "Animate a single source image with HappyHorse 1.0",
    aliases: ["happyhorse i2v", "happyhorse image to video", "happyhorse-image-to-video"],
    creditCost: 100,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    configJson: buildHappyHorseConfig("happyhorse/image-to-video", "image-to-video", [
      { key: "image_urls", label: "Source Image", type: "image_urls", required: true, syncWith: "reference_images" },
      { key: "resolution", label: "Resolution", type: "select", options: HAPPYHORSE_RESOLUTION_OPTIONS, default: "1080p", affectsPricing: true },
      { key: "duration", label: "Duration", type: "select", options: HAPPYHORSE_DURATION_OPTIONS, default: "5", affectsPricing: true },
      { key: "seed", label: "Seed", type: "number", required: false },
    ], {
      maxReferenceImages: 1,
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
        omit_aspect_ratio: true,
      },
    }),
    isEnabled: true,
    priority: 6,
  },
  {
    id: "happyhorse/reference-to-video",
    type: "video",
    name: "HappyHorse 1.0 Reference-to-Video",
    provider: "kie.ai",
    description: "Generate video from 1-9 character or style references with HappyHorse 1.0",
    aliases: ["happyhorse r2v", "happyhorse reference to video", "happyhorse-reference-to-video"],
    creditCost: 100,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    configJson: buildHappyHorseConfig("happyhorse/reference-to-video", "reference-to-video", [
      { key: "reference_image", label: "Reference Images", type: "image_urls", required: true, syncWith: "reference_images" },
      { key: "resolution", label: "Resolution", type: "select", options: HAPPYHORSE_RESOLUTION_OPTIONS, default: "1080p", affectsPricing: true },
      { key: "aspect_ratio", label: "Aspect Ratio", type: "select", options: HAPPYHORSE_ASPECT_RATIO_OPTIONS, default: "16:9", syncWith: "aspect_ratio" },
      { key: "duration", label: "Duration", type: "select", options: HAPPYHORSE_DURATION_OPTIONS, default: "5", affectsPricing: true },
      { key: "seed", label: "Seed", type: "number", required: false },
    ], {
      maxReferenceImages: 9,
      apiConfig: {
        reference_image_input_key: "reference_image",
        reference_image_input_type: "array",
      },
    }),
    isEnabled: true,
    priority: 7,
  },
  {
    id: "happyhorse/video-edit",
    type: "video",
    name: "HappyHorse 1.0 Video Edit",
    provider: "kie.ai",
    description: "Edit an existing video with optional reference images using HappyHorse 1.0",
    aliases: ["happyhorse edit", "happyhorse video edit", "happyhorse-video-edit"],
    creditCost: 100,
    configJson: buildHappyHorseConfig("happyhorse/video-edit", "video-edit", [
      { key: "video_url", label: "Source Video", type: "video_urls", required: true, syncWith: "reference_videos" },
      { key: "reference_image", label: "Reference Images", type: "image_urls", required: false, syncWith: "reference_images" },
      { key: "resolution", label: "Resolution", type: "select", options: HAPPYHORSE_RESOLUTION_OPTIONS, default: "1080p", affectsPricing: true },
      { key: "audio_setting", label: "Audio", type: "select", options: [{ value: "auto", label: "Auto" }, { value: "origin", label: "Original" }], default: "auto" },
      { key: "seed", label: "Seed", type: "number", required: false },
    ], {
      maxReferenceImages: 5,
      apiConfig: {
        reference_image_input_key: "reference_image",
        reference_image_input_type: "array",
        reference_video_input_key: "video_url",
        reference_video_input_type: "url",
        omit_aspect_ratio: true,
        omit_duration: true,
      },
    }),
    isEnabled: true,
    priority: 8,
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
    priority: 5,
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
    priority: 6,
  },
  {
    id: "veo_3_1-fast",
    type: "video",
    name: "Veo 3.1 Fast",
    provider: "knplabai",
    description: "KNPLabs fast form-data video generation",
    aliases: [
      "veo 3.1 fast",
      "veo_3_1-fast",
      "veo3_fast",
      "veo3/generate-veo-3-video-fast",
      "knplabs veo fast",
    ],
    creditCost: 35,
    durations: [5, 10, 15],
    aspectRatios: ["16:9", "9:16", "1:1"],
    configJson: { maxPromptLength: 5000, storyboardClipDurationSeconds: 8 },
    isEnabled: true,
    priority: 7,
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
    configJson: { storyboardClipDurationSeconds: 10 },
    isEnabled: true,
    priority: 5,
  },
  ...wavespeedModelSeeds.map((seed) => ({
    id: seed.modelId,
    type: seed.modelType,
    name: seed.name,
    provider: seed.provider,
    description: seed.description,
    aliases: seed.aliases,
    creditCost: seed.creditCost,
    durations: seed.durations,
    aspectRatios: seed.aspectRatios,
    configJson: seed.configJson,
    isEnabled: seed.isEnabled,
    priority: seed.priority,
  })),
  ...elevenLabsModelSeeds.map((seed) => ({
    id: seed.modelId,
    type: seed.modelType,
    name: seed.name,
    provider: seed.provider,
    description: seed.description,
    aliases: seed.aliases,
    creditCost: seed.creditCost,
    durations: seed.durations,
    aspectRatios: seed.aspectRatios,
    configJson: seed.configJson,
    isEnabled: seed.isEnabled,
    priority: seed.priority,
  })),
  ...magnificModelSeeds.map((seed) => ({
    id: seed.modelId,
    type: seed.modelType,
    name: seed.name,
    provider: seed.provider,
    description: seed.description,
    aliases: seed.aliases,
    creditCost: seed.creditCost,
    durations: seed.durations,
    aspectRatios: seed.aspectRatios,
    sizes: seed.sizes,
    configJson: seed.configJson,
    isEnabled: seed.isEnabled,
    priority: seed.priority,
  })),

  // ==================== Audio Models ====================
  {
    id: GEMINI_3_1_FLASH_TTS_MODEL_ID,
    type: "audio",
    name: "Gemini 3.1 Flash TTS",
    provider: "fal_ai",
    description: "Single- and multi-speaker text-to-speech with language steering, style instructions, and output format control",
    aliases: [
      "gemini 3.1 flash tts",
      "gemini-3.1-flash-tts",
      "gemini tts",
      "fal gemini tts",
    ],
    creditCost: GEMINI_3_1_FLASH_TTS_CREDIT_COST,
    voices: [...GEMINI_3_1_FLASH_TTS_VOICES],
    isEnabled: true,
    priority: 3,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-speech",
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
      pricingUnitSize: 1000,
      pricingUnitRounding: "ceil",
      pricingMinUnits: 1,
      inputFields: buildGemini31FlashTtsInputFields(),
      pricingTiers: {
        default: GEMINI_3_1_FLASH_TTS_CREDIT_COST,
      },
    },
  },
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
    id: "omnivoice-tts",
    type: "audio",
    name: "OmniVoice TTS",
    provider: "omnivoice",
    description: "Multilingual text-to-speech with optional voice design and cloning support",
    aliases: ["omnivoice", "omnivoice tts", "omni voice", "omnivoice-tts"],
    creditCost: 5,
    voices: ["managed", "custom"],
    isEnabled: true,
    priority: 3,
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
  {
    id: "gemini-omni-video",
    type: "video",
    name: "Gemini Omni Video",
    provider: "kie.ai",
    description: "Google Gemini Omni Flash multimodal video generation and editing via Kie.ai",
    aliases: [
      "gemini omni",
      "gemini omni video",
      "gemini omni flash",
      "gemini-omni",
      "gemini-omni-video",
      "google gemini omni",
    ],
    creditCost: 90,
    durations: [4, 6, 8, 10],
    aspectRatios: ["16:9", "9:16"],
    isEnabled: true,
    priority: 18,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiQueryEndpoint: "/api/v1/jobs/recordInfo",
      apiPayloadFormat: "market",
      kieModelId: "gemini-omni-video",
      generateType: "multimodal-video",
      hasAudio: true,
      maxDuration: 10,
      maxPromptLength: 5000,
      maxReferenceImages: 7,
      maxReferenceVideos: 1,
      maxReferenceAudios: 1,
      supportedDurations: [4, 6, 8, 10],
      supportedAspectRatios: ["16:9", "9:16"],
      supportedResolutions: ["720p", "1080p", "4K"],
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
        reference_video_input_key: "video_list",
        reference_video_input_type: "object_array",
      },
      inputFields: GEMINI_OMNI_INPUT_FIELDS,
      pricingTiers: GEMINI_OMNI_PRICING_TIERS,
      pricingFormula: "matrix",
    },
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

function normalizeStaticModelLookupKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function matchesStaticModelLookupKey(model: ModelDefinition, lookupKey: string): boolean {
  const normalizedLookupKey = normalizeStaticModelLookupKey(lookupKey);
  if (!normalizedLookupKey) {
    return false;
  }

  if (normalizeStaticModelLookupKey(model.id) === normalizedLookupKey) {
    return true;
  }

  return model.aliases.some((alias) => normalizeStaticModelLookupKey(alias) === normalizedLookupKey);
}

/**
 * Convert database model to ModelDefinition
 */
function dbModelToDefinition(dbModel: any): ModelDefinition {
  const aliases =
    Array.isArray(dbModel.aliases)
      ? dbModel.aliases.filter((alias: unknown): alias is string => typeof alias === "string")
      : typeof dbModel.aliases === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(dbModel.aliases);
              return Array.isArray(parsed)
                ? parsed.filter((alias: unknown): alias is string => typeof alias === "string")
                : [];
            } catch {
              return [];
            }
          })()
        : [];

  return {
    id: dbModel.modelId,
    type: dbModel.modelType as MediaType,
    name: dbModel.name,
    provider: dbModel.provider,
    description: dbModel.description || "",
    aliases,
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
 * Get the static fallback model definition by ID without consulting the database cache.
 * Useful for augmenting DB-backed models with defaults that should be present even
 * when older records are missing new config keys.
 */
export function getStaticModelById(id: string): ModelDefinition | undefined {
  return STATIC_MODEL_REGISTRY.find((m) => matchesStaticModelLookupKey(m, id));
}

/**
 * Get the full static fallback catalog without consulting the database cache.
 * Useful for admin tooling that needs to show importable templates.
 */
export function getStaticFallbackModels(): ModelDefinition[] {
  return STATIC_MODEL_REGISTRY.map((model) => ({
    ...model,
    aliases: [...model.aliases],
    aspectRatios: model.aspectRatios ? [...model.aspectRatios] : undefined,
    sizes: model.sizes ? [...model.sizes] : undefined,
    durations: model.durations ? [...model.durations] : undefined,
    voices: model.voices ? [...model.voices] : undefined,
    configJson: model.configJson ? { ...model.configJson } : undefined,
  }));
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
    nano_banana_2_lite: "google-banana-2-lite",
    google_banana_2_lite: "google-banana-2-lite",
    flux_2_0: "flux-2.0",
    z_image: "z-image",
    grok_imagine: "grok-imagine",
    veo_3_1: "veo3/generate-veo-3-video-lite",
    veo_3_1_extend: "veo3/extend-video",
    veo_extend: "veo3/extend-video",
    happyhorse: "happyhorse/text-to-video",
    happyhorse_1_0: "happyhorse/text-to-video",
    happyhorse_text_to_video: "happyhorse/text-to-video",
    happyhorse_image_to_video: "happyhorse/image-to-video",
    happyhorse_reference_to_video: "happyhorse/reference-to-video",
    happyhorse_video_edit: "happyhorse/video-edit",
    sora_2: "sora-2",
    kling_2_6: "kling-2.6",
    elevenlabs_tts: "elevenlabs-tts",
    elevenlabs_sfx: "elevenlabs-sfx",
    "wavespeed/gemini-2.5-flash/text-to-speech": "google/gemini-2.5-flash/text-to-speech",
    "wavespeed/gemini-2.5-pro/text-to-speech": "google/gemini-2.5-pro/text-to-speech",
    "wavespeed/lyria-3-clip/music": "google/lyria-3-clip/music",
    "wavespeed/lyria-3-pro/music": "google/lyria-3-pro/music",
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
