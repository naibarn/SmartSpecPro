/**
 * Media Generation Service
 * Proxies requests to Python backend for image, video, and audio generation
 * Uses rate limiting to prevent overwhelming external APIs
 */

import {
  scheduleMediaWithLimiter,
  recordMediaUsage,
  type MediaType as RateLimiterMediaType,
} from "./llmRateLimiter";
import { normalizeMediaPrompt } from "./mediaPromptNormalization";
import {
  isReusablePreparedEpisodeCoverSafety,
  isVerticalDramaImageRequest,
  prepareImagePromptSafety,
} from "./imagePromptSafetyService";
import { auditLogger } from "./auditLogger";
import { getModelById, mapToApiModelId } from "./modelRegistry";
import {
  getCachedInternalNodeUrl,
  getCachedPublicAppUrl,
  getCachedPythonBackendUrl,
} from "./appRuntimeConfig";
import {
  assertRelativeUploadMediaReferencePath,
  buildElevenLabsModelSeeds,
  buildMagnificModelSeeds,
  buildWaveSpeedModelSeeds,
  getReferenceImageLimitFromConfig,
  MAGNIFIC_PROVIDER,
  normalizeMediaProviderName,
  WAVESPEED_PROVIDER,
} from "./mediaProviderUtils";
import {
  GEMINI_3_1_FLASH_TTS_CREDIT_COST,
  GEMINI_3_1_FLASH_TTS_MODEL_ID,
  GEMINI_3_1_FLASH_TTS_VOICES,
  assertGemini31FlashTtsAudioRequest,
  assertGemini31FlashTtsExtraParams,
  normalizeGemini31FlashTtsExtraParams,
} from "./falGeminiTts";
import {
  inferMediaModelHintFromText,
  resolveEnabledMediaModelSelection,
} from "./enabledMediaModelSelection";
import { resolveMediaTransport } from "./mediaTransportResolver";
import { getMcpMediaTask, submitMcpMediaGeneration } from "./mcpMediaAdapter";
import { createProviderManagedStorageDownloadRef } from "./mcpDownloadBrokerService";
import { getHermesMediaTask, isHermesMediaTaskId } from "./hermesMediaAdapter";
import { normalizeMcpProviderModelIdForProvider } from "./mcpProviderModelAliases";
import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
import type {
  MediaAssetType,
  MediaOriginSurface,
  MediaTaskTransportMetadata,
} from "../../shared/mcpConnectTypes";
import { createInternalTokenFromAuth, verifyBearerToken } from "../_core/tokens";
import {
  ensureMediaTaskArtifactsForPolling,
  redactMediaTaskWithoutTenant,
} from "./mediaTaskArtifactService";

// ==================== Types ====================

export type MediaType = "image" | "video" | "audio";

// Use string IDs so newly added DB models don't require code changes.
export type ImageModel = string;
export type VideoModel = string;
export type AudioModel = string;

export type TaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ModelMetadata {
  id: string;
  type: MediaType;
  name: string;
  provider: string;
  description: string;
  supportsAspectRatios?: string[];
  supportsSizes?: string[];
  supportsDurations?: number[];
  supportsVoices?: string[];
  creditCost: number;
  configJson?: Record<string, unknown>;
}
export { normalizeMediaPrompt } from "./mediaPromptNormalization";

const wavespeedModelMetadata: Record<string, ModelMetadata> =
  Object.fromEntries(
    buildWaveSpeedModelSeeds().map(seed => [
      seed.modelId,
      {
        id: seed.modelId,
        type: seed.modelType,
        name: seed.name,
        provider: seed.provider,
        description: seed.description,
        supportsDurations: [...seed.durations],
        supportsAspectRatios: [...seed.aspectRatios],
        creditCost: seed.creditCost,
        configJson: seed.configJson,
      } satisfies ModelMetadata,
    ])
  );

const elevenLabsModelMetadata: Record<string, ModelMetadata> =
  Object.fromEntries(
    buildElevenLabsModelSeeds().map(seed => [
      seed.modelId,
      {
        id: seed.modelId,
        type: seed.modelType,
        name: seed.name,
        provider: seed.provider,
        description: seed.description,
        supportsDurations: [...seed.durations],
        supportsAspectRatios: [...seed.aspectRatios],
        creditCost: seed.creditCost,
        configJson: seed.configJson,
      } satisfies ModelMetadata,
    ])
  );

const magnificModelMetadata: Record<string, ModelMetadata> = Object.fromEntries(
  buildMagnificModelSeeds().map(seed => [
    seed.modelId,
    {
      id: seed.modelId,
      type: seed.modelType,
      name: seed.name,
      provider: seed.provider,
      description: seed.description,
      supportsDurations: [...seed.durations],
      supportsAspectRatios: [...seed.aspectRatios],
      supportsSizes: [...seed.sizes],
      creditCost: seed.creditCost,
      configJson: seed.configJson,
    } satisfies ModelMetadata,
  ])
);

const RETRYABLE_MEDIA_SETTINGS_ERROR = /\bSETTINGS_KEY_NOT_FOUND\b/i;
const MEDIA_SUBMIT_RETRY_DELAY_MS = 250;
const MEDIA_SUBMIT_MAX_ATTEMPTS = 2;

const mediaModelResolutionCounters = {
  providerFromApiConfig: 0,
  providerFromStaticRegistry: 0,
  providerDefaultFallback: 0,
  unknownModelRequests: 0,
};

export function getMediaModelResolutionCounters(): Readonly<
  typeof mediaModelResolutionCounters
> {
  return { ...mediaModelResolutionCounters };
}

export function resetMediaModelResolutionCounters(): void {
  mediaModelResolutionCounters.providerFromApiConfig = 0;
  mediaModelResolutionCounters.providerFromStaticRegistry = 0;
  mediaModelResolutionCounters.providerDefaultFallback = 0;
  mediaModelResolutionCounters.unknownModelRequests = 0;
}

type MediaApiConfig = Record<string, unknown>;

function resolveProviderFromApiConfig(
  apiConfig?: MediaApiConfig
): string | null {
  if (!apiConfig) return null;
  for (const key of ["provider", "provider_id", "providerId", "providerName"]) {
    const value = apiConfig[key as keyof typeof apiConfig];
    if (typeof value === "string" && value.trim().length > 0) {
      const normalized = normalizeMediaProviderName(value);
      return normalized === WAVESPEED_PROVIDER ||
        normalized === MAGNIFIC_PROVIDER
        ? normalized
        : value.trim();
    }
  }
  return null;
}

function resolveProvider(modelId: string, apiConfig?: MediaApiConfig): string {
  const providerFromConfig = resolveProviderFromApiConfig(apiConfig);
  if (providerFromConfig) {
    mediaModelResolutionCounters.providerFromApiConfig += 1;
    return providerFromConfig;
  }

  const modelMeta = MEDIA_MODELS[modelId];
  if (modelMeta?.provider) {
    mediaModelResolutionCounters.providerFromStaticRegistry += 1;
    return modelMeta.provider;
  }

  mediaModelResolutionCounters.providerDefaultFallback += 1;
  mediaModelResolutionCounters.unknownModelRequests += 1;
  console.warn("[MediaModelResolution] Unknown model provider fallback", {
    modelId,
  });
  return "kie.ai";
}

function setApiConfigString(
  target: MediaApiConfig,
  key: string,
  value: unknown
): void {
  if (typeof value === "string" && value.trim()) {
    target[key] = value.trim();
  }
}

function mergeApiConfigRecord(target: MediaApiConfig, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) {
      target[key] = raw.trim();
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      target[key] = String(raw);
    } else if (Array.isArray(raw) || (raw && typeof raw === "object")) {
      // Declarative provider routing (e.g. Kie's apiConfig.modes) contains
      // nested predicates and list-valued overrides. Keep those values intact
      // instead of silently reducing the config to scalar strings.
      target[key] = raw;
    }
  }
}

export function buildApiConfigFromModelConfig(
  configJson?: Record<string, unknown> | null
): MediaApiConfig {
  const apiConfig: MediaApiConfig = {};
  if (
    !configJson ||
    typeof configJson !== "object" ||
    Array.isArray(configJson)
  ) {
    return apiConfig;
  }

  setApiConfigString(apiConfig, "endpoint", configJson.apiEndpoint);
  setApiConfigString(apiConfig, "query_endpoint", configJson.apiQueryEndpoint);
  setApiConfigString(apiConfig, "payload_format", configJson.apiPayloadFormat);
  setApiConfigString(apiConfig, "kie_model_id", configJson.kieModelId);
  setApiConfigString(apiConfig, "generate_type", configJson.generateType);
  setApiConfigString(apiConfig, "veo_4k_endpoint", configJson.veo4kEndpoint);
  setApiConfigString(apiConfig, "veo_4k_endpoint", configJson.veo4KEndpoint);
  setApiConfigString(
    apiConfig,
    "veo_4k_endpoint",
    configJson.veo4kUpgradeEndpoint
  );
  setApiConfigString(
    apiConfig,
    "veo_4k_endpoint",
    configJson.veo4KUpgradeEndpoint
  );
  mergeApiConfigRecord(apiConfig, configJson.apiConfig);
  return apiConfig;
}

/**
 * Opt-in per-model provider input defaults —
 * `configJson.apiConfig.defaultInputParams`
 * (`planning/vd-media-model-default-input-params/plan.md`).
 *
 * Some providers REQUIRE a field that only the Media Studio dynamic form ever
 * supplied. Kie's `seedream/5-pro-image-to-image` requires `quality`
 * (`basic`/`high`); the catalog row declares it in `inputFields` with a
 * default, but `inputFields` is a FORM schema — nothing applies it on a
 * server-initiated generation. Every call from the Vertical Drama character
 * tab therefore submitted without `quality` and kie answered "This field is
 * required", leaving the task stuck in pending forever.
 *
 * Deliberately a NEW opt-in key rather than "apply every `inputFields`
 * default": 90 of the 148 enabled models carry `inputFields` defaults, and
 * most of them generate correctly today by letting the provider pick its own
 * default. Changing the outbound payload of 90 models to fix one is not a
 * trade worth making. A model that does not set `defaultInputParams` behaves
 * byte-identically to before this existed.
 *
 * Scalars only — these become provider input fields, and an object/array here
 * would be a config error rather than a value any provider expects.
 */
export function readModelDefaultInputParams(
  configJson?: Record<string, unknown> | null
): Record<string, string | number | boolean> | undefined {
  if (
    !configJson ||
    typeof configJson !== "object" ||
    Array.isArray(configJson)
  ) {
    return undefined;
  }
  const apiConfig = (configJson as { apiConfig?: unknown }).apiConfig;
  if (!apiConfig || typeof apiConfig !== "object" || Array.isArray(apiConfig)) {
    return undefined;
  }
  const raw = (apiConfig as { defaultInputParams?: unknown })
    .defaultInputParams;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const defaults: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      defaults[key] = value;
    }
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined;
}

/**
 * Layers the model's `defaultInputParams` UNDER whatever the caller sent, so a
 * caller that explicitly chose a value always wins and the defaults only fill
 * genuine gaps. Returns the caller's own object untouched when the model
 * declares no defaults.
 */
export function applyModelDefaultInputParams(
  callerExtraParams: Record<string, any> | undefined,
  defaults: Record<string, string | number | boolean> | undefined
): Record<string, any> | undefined {
  if (!defaults) return callerExtraParams;
  return { ...defaults, ...(callerExtraParams ?? {}) };
}

function resolveStaticModelConfigJson(
  modelId: string
): Record<string, unknown> | null {
  const normalizedModelId = mapToApiModelId(modelId);
  const candidates = [
    getModelById(modelId),
    normalizedModelId !== modelId ? getModelById(normalizedModelId) : undefined,
    MEDIA_MODELS[modelId],
    normalizedModelId !== modelId ? MEDIA_MODELS[normalizedModelId] : undefined,
  ];
  for (const candidate of candidates) {
    if (candidate?.configJson && typeof candidate.configJson === "object") {
      return candidate.configJson;
    }
  }
  return null;
}

function buildEffectiveApiConfig(input: {
  modelId: string;
  provider: string;
  providerName?: string | null;
  modelConfigJson?: Record<string, unknown> | null;
  requestedApiConfig?: MediaApiConfig;
}): MediaApiConfig | undefined {
  const modelApiConfig = buildApiConfigFromModelConfig(
    input.modelConfigJson ?? resolveStaticModelConfigJson(input.modelId)
  );
  const merged = {
    ...modelApiConfig,
    ...(input.requestedApiConfig ?? {}),
    provider: input.provider,
    ...(input.providerName ? { providerName: input.providerName } : {}),
    model: input.modelId,
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

async function resolveEffectiveMediaRequestModel(input: {
  mediaType: MediaType;
  requestedModel?: string | null;
  promptText?: string | null;
  requestedApiConfig?: MediaApiConfig;
  fallbackModel: string;
}): Promise<{
  modelId: string;
  provider: string;
  apiConfig?: MediaApiConfig;
  /** See `readModelDefaultInputParams` — opt-in, `undefined` for every model
   *  that does not declare any. */
  defaultInputParams?: Record<string, string | number | boolean>;
}> {
  const requestedProvider = resolveProviderFromApiConfig(
    input.requestedApiConfig
  );
  const requestedModel =
    input.requestedModel ??
    inferMediaModelHintFromText(input.mediaType, input.promptText);
  const selection = await resolveEnabledMediaModelSelection({
    mediaType: input.mediaType,
    requestedModel,
    requestedProvider,
    requireConfiguredProvider: true,
    allowSubstitution: true,
  });

  if (selection.ok) {
    return {
      modelId: selection.modelId,
      provider: selection.provider,
      apiConfig: buildEffectiveApiConfig({
        modelId: selection.modelId,
        provider: selection.provider,
        providerName: selection.providerName,
        modelConfigJson: selection.model.configJson,
        requestedApiConfig: input.requestedApiConfig,
      }),
      defaultInputParams: readModelDefaultInputParams(
        selection.model.configJson
      ),
    };
  }

  if (selection.reasonCode !== "media_registry_unavailable") {
    throw new Error(`${selection.reasonCode}: ${selection.message}`);
  }

  const modelId = requestedModel || input.fallbackModel;
  const provider = resolveProvider(modelId, input.requestedApiConfig);
  return {
    modelId,
    provider,
    apiConfig: buildEffectiveApiConfig({
      modelId,
      provider,
      requestedApiConfig: input.requestedApiConfig,
    }),
  };
}

function isMcpTransportRequest(request: {
  transportMetadata?: Partial<MediaTaskTransportMetadata>;
}): boolean {
  return request.transportMetadata?.transport === "mcp";
}

function resolveMcpRequestedMediaModel(input: {
  mediaType: "image" | "video";
  request: ImageGenerationRequest | VideoGenerationRequest;
}): {
  modelId: string;
  provider: string;
  apiConfig?: MediaApiConfig;
  defaultInputParams?: Record<string, string | number | boolean>;
} {
  const modelId = input.request.model || DEFAULT_MODELS[input.mediaType];
  if (input.request.transportMetadata?.providerKey) {
    return {
      modelId,
      provider: input.request.transportMetadata.providerKey,
      apiConfig: undefined,
    };
  }
  const transportConfig = resolveMediaModelTransportConfig({
    provider: input.request.transportMetadata?.providerKey,
    modelId,
    configJson: resolveStaticModelConfigJson(modelId),
  });
  return {
    modelId,
    provider:
      transportConfig.providerKey ??
      input.request.transportMetadata?.providerKey ??
      resolveProvider(modelId, input.request.apiConfig),
    apiConfig: undefined,
  };
}

const HAPPYHORSE_DURATIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const HAPPYHORSE_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const HAPPYHORSE_RESOLUTION_FIELD = {
  key: "resolution",
  label: "Resolution",
  type: "select",
  options: [
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
  ],
  default: "1080p",
  affectsPricing: true,
};
const HAPPYHORSE_DURATION_FIELD = {
  key: "duration",
  label: "Duration",
  type: "select",
  options: HAPPYHORSE_DURATIONS.map(seconds => ({
    value: String(seconds),
    label: `${seconds}s`,
  })),
  default: "5",
  affectsPricing: true,
};
const HAPPYHORSE_ASPECT_RATIO_FIELD = {
  key: "aspect_ratio",
  label: "Aspect Ratio",
  type: "select",
  options: HAPPYHORSE_ASPECT_RATIOS.map(ratio => ({
    value: ratio,
    label: ratio,
  })),
  default: "16:9",
  syncWith: "aspect_ratio",
};
const HAPPYHORSE_SEED_FIELD = {
  key: "seed",
  label: "Seed",
  type: "number",
  required: false,
};
const GEMINI_OMNI_DURATIONS = [4, 6, 8, 10];
const GEMINI_OMNI_RESOLUTIONS = ["720p", "1080p", "4K"];
const GEMINI_OMNI_FLASH_1_1_RESOLUTIONS = ["360p", ...GEMINI_OMNI_RESOLUTIONS];
const GEMINI_OMNI_ASPECT_RATIOS = ["16:9", "9:16"];
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
const GEMINI_OMNI_FLASH_1_1_PRICING_TIERS = {
  default: 420,
  "360p-4s-without-video": 315,
  "360p-6s-without-video": 420,
  "360p-8s-without-video": 525,
  "360p-10s-without-video": 630,
  "720p-4s-without-video": 315,
  "720p-6s-without-video": 420,
  "720p-8s-without-video": 525,
  "720p-10s-without-video": 630,
  "1080p-4s-without-video": 315,
  "1080p-6s-without-video": 420,
  "1080p-8s-without-video": 525,
  "1080p-10s-without-video": 630,
  "4K-4s-without-video": 735,
  "4K-6s-without-video": 840,
  "4K-8s-without-video": 945,
  "4K-10s-without-video": 1050,
  "360p-4s-with-video": 840,
  "360p-6s-with-video": 840,
  "360p-8s-with-video": 840,
  "360p-10s-with-video": 840,
  "720p-4s-with-video": 840,
  "720p-6s-with-video": 840,
  "720p-8s-with-video": 840,
  "720p-10s-with-video": 840,
  "1080p-4s-with-video": 840,
  "1080p-6s-with-video": 840,
  "1080p-8s-with-video": 840,
  "1080p-10s-with-video": 840,
  "4K-4s-with-video": 1260,
  "4K-6s-with-video": 1260,
  "4K-8s-with-video": 1260,
  "4K-10s-with-video": 1260,
};
const GEMINI_OMNI_INPUT_FIELDS = [
  {
    key: "image_urls",
    label: "Reference Images",
    type: "image_urls",
    required: false,
    syncWith: "reference_images",
    hidden: true,
    managedBySuite: true,
    providerPayloadKey: "image_urls",
    referenceUnitWeight: 1,
    maxItems: 7,
  },
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
    pricingAliases: [
      "referenceVideoUrls",
      "referenceVideoUrl",
      "reference_video_urls",
      "reference_video_url",
      "video_url",
    ],
    pricingPresenceLabels: {
      present: "with-video",
      absent: "without-video",
    },
  },
  {
    key: "character_ids",
    label: "Character References",
    type: "provider_asset_picker",
    required: false,
    hidden: true,
    advancedOnly: true,
    managedBySuite: true,
    assetType: "provider_asset",
    assetCapability: "gemini_omni_character",
    providerPayloadKey: "character_ids",
    referenceUnitWeight: 1,
    maxItems: 3,
  },
  {
    key: "audio_ids",
    label: "Voice / Audio References",
    type: "provider_asset_picker",
    required: false,
    hidden: true,
    advancedOnly: true,
    managedBySuite: true,
    assetType: "provider_asset",
    assetCapability: "gemini_omni_audio",
    providerPayloadKey: "audio_ids",
    maxItems: 7,
  },
  {
    key: "resolution",
    label: "Resolution",
    type: "select",
    options: GEMINI_OMNI_RESOLUTIONS.map(resolution => ({
      value: resolution,
      label: resolution,
    })),
    default: "1080p",
    affectsPricing: true,
  },
  {
    key: "duration",
    label: "Duration",
    type: "select",
    options: GEMINI_OMNI_DURATIONS.map(seconds => ({
      value: String(seconds),
      label: `${seconds}s`,
    })),
    default: "4",
    affectsPricing: true,
  },
  {
    key: "aspect_ratio",
    label: "Aspect Ratio",
    type: "select",
    options: GEMINI_OMNI_ASPECT_RATIOS.map(ratio => ({
      value: ratio,
      label: ratio,
    })),
    default: "16:9",
    syncWith: "aspect_ratio",
  },
  {
    key: "seed",
    label: "Seed",
    type: "number",
    required: false,
    advancedOnly: true,
  },
];
const GEMINI_OMNI_FLASH_1_1_INPUT_FIELDS = [
  ...GEMINI_OMNI_INPUT_FIELDS,
  { key: "first_frame_url", label: "First Frame URL", type: "text", required: false, advancedOnly: true, providerPayloadKey: "first_frame_url" },
  { key: "last_frame_url", label: "Last Frame URL", type: "text", required: false, advancedOnly: true, providerPayloadKey: "last_frame_url" },
];

// Model registry with metadata
export const MEDIA_MODELS: Record<string, ModelMetadata> = {
  // Image models
  "google-nano-banana-pro": {
    id: "google-nano-banana-pro",
    type: "image",
    name: "Google Nano Banana Pro",
    provider: "kie.ai",
    description: "High-quality image generation with Google's latest model",
    supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
    supportsAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    creditCost: 10,
  },
  "google-banana-2": {
    id: "google-banana-2",
    type: "image",
    name: "Google Banana 2",
    provider: "kie.ai",
    description:
      "Gemini 3.1 Flash Image model with fast 4K generation and image editing support",
    supportsAspectRatios: [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9",
      "auto",
    ],
    creditCost: 40,
  },
  "google-banana-2-lite": {
    id: "google-banana-2-lite",
    type: "image",
    name: "Nano Banana 2 Lite",
    provider: "kie.ai",
    description:
      "Nano Banana 2 Lite for fast, cost-effective image generation and editing",
    supportsSizes: ["1K"],
    supportsAspectRatios: [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9",
      "auto",
    ],
    creditCost: 35,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "nano-banana-2-lite",
      generateType: "text-to-image",
      maxReferenceImages: 10,
      reference_image_input_key: "image_urls",
      reference_image_input_type: "array",
    },
  },
  "flux-2.0": {
    id: "flux-2.0",
    type: "image",
    name: "Flux 2.0",
    provider: "kie.ai",
    description: "Fast and creative image generation",
    supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 8,
  },
  "z-image": {
    id: "z-image",
    type: "image",
    name: "Z-Image",
    provider: "kie.ai",
    description: "Artistic style image generation",
    supportsSizes: ["1024x1024"],
    supportsAspectRatios: ["1:1"],
    creditCost: 5,
  },
  "grok-imagine": {
    id: "grok-imagine",
    type: "image",
    name: "Grok Imagine",
    provider: "kie.ai",
    description: "xAI's image generation model",
    supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 12,
  },
  "gpt-image-1.5-all": {
    id: "gpt-image-1.5-all",
    type: "image",
    name: "GPT Image 1.5 All",
    provider: "knplabai",
    description: "OpenAI-compatible image generation via KNPLabs",
    supportsSizes: ["1024x1024", "1536x1536"],
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 12,
  },
  "gemini-3.1-flash-image-preview": {
    id: "gemini-3.1-flash-image-preview",
    type: "image",
    name: "Gemini 3.1 Flash Image",
    provider: "knplabai",
    description: "Gemini native image generation via KNPLabs",
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 14,
  },
  // Video models
  "veo3/generate-veo-3-video-lite": {
    id: "veo3/generate-veo-3-video-lite",
    type: "video",
    name: "Veo 3.1 Lite",
    provider: "kie.ai",
    description: "Google's cost-effective Veo 3.1 video generation model",
    supportsDurations: [8],
    supportsAspectRatios: ["auto", "16:9", "9:16"],
    creditCost: 150,
    configJson: {
      apiEndpoint: "/api/v1/veo/generate",
      apiQueryEndpoint: "/api/v1/veo/record-info",
      veo4kEndpoint: "/api/v1/veo/get-4k-video",
      apiPayloadFormat: "veo",
      kieModelId: "veo3_lite",
      maxPromptLength: 5000,
    },
  },
  "veo-3-1": {
    id: "veo-3-1",
    type: "video",
    name: "Veo 3.1 Quality",
    provider: "kie.ai",
    description: "Google's flagship Veo 3.1 video generation model",
    supportsDurations: [8],
    supportsAspectRatios: ["auto", "16:9", "9:16"],
    creditCost: 2000,
    configJson: {
      apiEndpoint: "/api/v1/veo/generate",
      apiQueryEndpoint: "/api/v1/veo/record-info",
      veo4kEndpoint: "/api/v1/veo/get-4k-video",
      apiPayloadFormat: "veo",
      kieModelId: "veo3",
      maxPromptLength: 5000,
    },
  },
  "veo3/generate-veo-3-video-fast": {
    id: "veo3/generate-veo-3-video-fast",
    type: "video",
    name: "Veo 3.1 Fast",
    provider: "kie.ai",
    description: "Google's fast Veo 3.1 video generation model",
    supportsDurations: [8],
    supportsAspectRatios: ["auto", "16:9", "9:16"],
    creditCost: 300,
    configJson: {
      apiEndpoint: "/api/v1/veo/generate",
      apiQueryEndpoint: "/api/v1/veo/record-info",
      veo4kEndpoint: "/api/v1/veo/get-4k-video",
      apiPayloadFormat: "veo",
      kieModelId: "veo3_fast",
      maxPromptLength: 5000,
    },
  },
  "veo3/extend-video": {
    id: "veo3/extend-video",
    type: "video",
    name: "Veo 3.1 Extend",
    provider: "kie.ai",
    description: "Extend an existing video with Veo 3.1 technology",
    supportsDurations: [8],
    supportsAspectRatios: ["auto", "16:9", "9:16"],
    creditCost: 1250,
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
        {
          key: "source_task_id",
          label: "Original Veo Task ID",
          type: "text",
          required: true,
        },
        {
          key: "video_urls",
          label: "Source Video Preview",
          type: "video_urls",
          required: false,
          syncWith: "reference_videos",
        },
        { key: "seeds", label: "Seed", type: "number", required: false },
        { key: "watermark", label: "Watermark", type: "text", required: false },
      ],
      pricingTiers: { default: 1250 },
      pricingFormula: "flat",
    },
  },
  "happyhorse/text-to-video": {
    id: "happyhorse/text-to-video",
    type: "video",
    name: "HappyHorse 1.0 Text-to-Video",
    provider: "kie.ai",
    description: "Alibaba ATH HappyHorse 1.0 text-to-video generation",
    supportsDurations: HAPPYHORSE_DURATIONS,
    supportsAspectRatios: HAPPYHORSE_ASPECT_RATIOS,
    creditCost: 100,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiQueryEndpoint: "/api/v1/jobs/recordInfo",
      apiPayloadFormat: "market",
      kieModelId: "happyhorse/text-to-video",
      generateType: "text-to-video",
      maxDuration: 15,
      maxPromptLength: 5000,
      supportedResolutions: ["720p", "1080p"],
      supportedDurations: HAPPYHORSE_DURATIONS,
      supportedAspectRatios: HAPPYHORSE_ASPECT_RATIOS,
      inputFields: [
        HAPPYHORSE_RESOLUTION_FIELD,
        HAPPYHORSE_ASPECT_RATIO_FIELD,
        HAPPYHORSE_DURATION_FIELD,
        HAPPYHORSE_SEED_FIELD,
      ],
      pricingTiers: { default: 100 },
      pricingFormula: "flat",
    },
  },
  "happyhorse/image-to-video": {
    id: "happyhorse/image-to-video",
    type: "video",
    name: "HappyHorse 1.0 Image-to-Video",
    provider: "kie.ai",
    description: "Animate a single source image with HappyHorse 1.0",
    supportsDurations: HAPPYHORSE_DURATIONS,
    creditCost: 100,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiQueryEndpoint: "/api/v1/jobs/recordInfo",
      apiPayloadFormat: "market",
      kieModelId: "happyhorse/image-to-video",
      generateType: "image-to-video",
      maxDuration: 15,
      maxPromptLength: 5000,
      maxReferenceImages: 1,
      supportedResolutions: ["720p", "1080p"],
      supportedDurations: HAPPYHORSE_DURATIONS,
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
        omit_aspect_ratio: true,
      },
      inputFields: [
        {
          key: "image_urls",
          label: "Source Image",
          type: "image_urls",
          required: true,
          syncWith: "reference_images",
        },
        HAPPYHORSE_RESOLUTION_FIELD,
        HAPPYHORSE_DURATION_FIELD,
        HAPPYHORSE_SEED_FIELD,
      ],
      pricingTiers: { default: 100 },
      pricingFormula: "flat",
    },
  },
  "happyhorse/reference-to-video": {
    id: "happyhorse/reference-to-video",
    type: "video",
    name: "HappyHorse 1.0 Reference-to-Video",
    provider: "kie.ai",
    description:
      "Generate video from 1-9 character or style references with HappyHorse 1.0",
    supportsDurations: HAPPYHORSE_DURATIONS,
    supportsAspectRatios: HAPPYHORSE_ASPECT_RATIOS,
    creditCost: 100,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiQueryEndpoint: "/api/v1/jobs/recordInfo",
      apiPayloadFormat: "market",
      kieModelId: "happyhorse/reference-to-video",
      generateType: "reference-to-video",
      maxDuration: 15,
      maxPromptLength: 5000,
      maxReferenceImages: 9,
      supportedResolutions: ["720p", "1080p"],
      supportedDurations: HAPPYHORSE_DURATIONS,
      supportedAspectRatios: HAPPYHORSE_ASPECT_RATIOS,
      apiConfig: {
        reference_image_input_key: "reference_image",
        reference_image_input_type: "array",
      },
      inputFields: [
        {
          key: "reference_image",
          label: "Reference Images",
          type: "image_urls",
          required: true,
          syncWith: "reference_images",
        },
        HAPPYHORSE_RESOLUTION_FIELD,
        HAPPYHORSE_ASPECT_RATIO_FIELD,
        HAPPYHORSE_DURATION_FIELD,
        HAPPYHORSE_SEED_FIELD,
      ],
      pricingTiers: { default: 100 },
      pricingFormula: "flat",
    },
  },
  "happyhorse/video-edit": {
    id: "happyhorse/video-edit",
    type: "video",
    name: "HappyHorse 1.0 Video Edit",
    provider: "kie.ai",
    description:
      "Edit an existing video with optional reference images using HappyHorse 1.0",
    creditCost: 100,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiQueryEndpoint: "/api/v1/jobs/recordInfo",
      apiPayloadFormat: "market",
      kieModelId: "happyhorse/video-edit",
      generateType: "video-edit",
      maxDuration: 60,
      maxPromptLength: 5000,
      maxReferenceImages: 5,
      supportedResolutions: ["720p", "1080p"],
      apiConfig: {
        reference_image_input_key: "reference_image",
        reference_image_input_type: "array",
        reference_video_input_key: "video_url",
        reference_video_input_type: "url",
        omit_aspect_ratio: true,
        omit_duration: true,
      },
      inputFields: [
        {
          key: "video_url",
          label: "Source Video",
          type: "video_urls",
          required: true,
          syncWith: "reference_videos",
        },
        {
          key: "reference_image",
          label: "Reference Images",
          type: "image_urls",
          required: false,
          syncWith: "reference_images",
        },
        HAPPYHORSE_RESOLUTION_FIELD,
        {
          key: "audio_setting",
          label: "Audio",
          type: "select",
          options: [
            { value: "auto", label: "Auto" },
            { value: "origin", label: "Original" },
          ],
          default: "auto",
        },
        HAPPYHORSE_SEED_FIELD,
      ],
      pricingTiers: { default: 100 },
      pricingFormula: "flat",
    },
  },
  "gemini-omni-video": {
    id: "gemini-omni-video",
    type: "video",
    name: "Gemini Omni Video",
    provider: "kie.ai",
    description:
      "Google Gemini Omni Flash multimodal video generation and editing via Kie.ai",
    supportsDurations: GEMINI_OMNI_DURATIONS,
    supportsAspectRatios: GEMINI_OMNI_ASPECT_RATIOS,
    creditCost: 90,
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
      supportedDurations: GEMINI_OMNI_DURATIONS,
      supportedAspectRatios: GEMINI_OMNI_ASPECT_RATIOS,
      supportedResolutions: GEMINI_OMNI_RESOLUTIONS,
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
  "gemini-omni-flash-1-1": {
    id: "gemini-omni-flash-1-1",
    type: "video",
    name: "Gemini Omni Flash 1.1",
    provider: "kie.ai",
    description: "Google Gemini Omni Flash 1.1 multimodal video generation via Kie.ai",
    supportsDurations: GEMINI_OMNI_DURATIONS,
    supportsAspectRatios: GEMINI_OMNI_ASPECT_RATIOS,
    creditCost: 315,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiQueryEndpoint: "/api/v1/jobs/recordInfo",
      apiPayloadFormat: "market",
      kieModelId: "google/gemini-omni-flash-1-1",
      generateType: "multimodal-video",
      hasAudio: true,
      maxDuration: 10,
      maxPromptLength: 5000,
      maxReferenceImages: 7,
      maxReferenceVideos: 1,
      maxReferenceAudios: 3,
      supportedDurations: GEMINI_OMNI_DURATIONS,
      supportedAspectRatios: GEMINI_OMNI_ASPECT_RATIOS,
      supportedResolutions: GEMINI_OMNI_FLASH_1_1_RESOLUTIONS,
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
        reference_video_input_key: "video_list",
        reference_video_input_type: "object_array",
      },
      inputFields: GEMINI_OMNI_FLASH_1_1_INPUT_FIELDS,
      pricingTiers: GEMINI_OMNI_FLASH_1_1_PRICING_TIERS,
      pricingFormula: "matrix",
    },
  },
  "sora-2": {
    id: "sora-2",
    type: "video",
    name: "Sora 2",
    provider: "kie.ai",
    description: "OpenAI's video generation model",
    supportsDurations: [5, 10, 15, 20],
    supportsAspectRatios: ["16:9", "9:16", "1:1"],
    creditCost: 80,
  },
  "kling-2.6": {
    id: "kling-2.6",
    type: "video",
    name: "Kling 2.6",
    provider: "kie.ai",
    description: "Kling video generation model",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 40,
  },
  "veo_3_1-fast": {
    id: "veo_3_1-fast",
    type: "video",
    name: "Veo 3.1 Fast",
    provider: "knplabai",
    description: "KNPLabs fast form-data video generation",
    supportsDurations: [5, 10, 15],
    supportsAspectRatios: ["16:9", "9:16", "1:1"],
    creditCost: 35,
  },
  "grok-video-3": {
    id: "grok-video-3",
    type: "video",
    name: "Grok Video 3",
    provider: "knplabai",
    description: "KNPLabs JSON video generation",
    supportsDurations: [5, 10, 15],
    supportsAspectRatios: ["16:9", "9:16", "1:1"],
    creditCost: 36,
  },
  ...wavespeedModelMetadata,
  ...elevenLabsModelMetadata,
  ...magnificModelMetadata,
  // ========== BytePlus ModelArk — Seedream Image Models ==========
  "seedream-4-5-251128": {
    id: "seedream-4-5-251128",
    type: "image",
    name: "Seedream 4.5",
    provider: "byteplus_modelark",
    description:
      "BytePlus Seedream 4.5 — high-quality image generation (synchronous)",
    supportsSizes: ["1024x1024", "2048x2048", "4096x4096"],
    creditCost: 15,
  },
  "seedream-4-0-250828": {
    id: "seedream-4-0-250828",
    type: "image",
    name: "Seedream 4.0",
    provider: "byteplus_modelark",
    description:
      "BytePlus Seedream 4.0 — cost-efficient image generation (synchronous)",
    supportsSizes: ["1024x1024", "2048x2048", "4096x4096"],
    creditCost: 10,
  },
  // ========== BytePlus ModelArk — Seedance Video Models ==========
  "seedance-1-0-pro-fast-251015": {
    id: "seedance-1-0-pro-fast-251015",
    type: "video",
    name: "Seedance Pro Fast",
    provider: "byteplus_modelark",
    description:
      "BytePlus Seedance Pro Fast — fast text-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  "seedance-1-0-pro-250528": {
    id: "seedance-1-0-pro-250528",
    type: "video",
    name: "Seedance Pro",
    provider: "byteplus_modelark",
    description:
      "BytePlus Seedance Pro — high-quality text-to-video and image-to-video (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 30,
  },
  "seedance-1-0-lite-t2v-250428": {
    id: "seedance-1-0-lite-t2v-250428",
    type: "video",
    name: "Seedance Lite T2V",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Lite — text-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  "seedance-1-0-lite-i2v-250428": {
    id: "seedance-1-0-lite-i2v-250428",
    type: "video",
    name: "Seedance Lite I2V",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Lite — image-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  // Audio models
  [GEMINI_3_1_FLASH_TTS_MODEL_ID]: {
    id: GEMINI_3_1_FLASH_TTS_MODEL_ID,
    type: "audio",
    name: "Gemini 3.1 Flash TTS",
    provider: "fal_ai",
    description:
      "Single- and multi-speaker text-to-speech with language steering",
    supportsVoices: [...GEMINI_3_1_FLASH_TTS_VOICES],
    creditCost: GEMINI_3_1_FLASH_TTS_CREDIT_COST,
  },
  "elevenlabs-tts": {
    id: "elevenlabs-tts",
    type: "audio",
    name: "ElevenLabs Text-to-Speech",
    provider: "kie.ai",
    description: "High-quality text-to-speech",
    supportsVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    creditCost: 5,
  },
  "elevenlabs-sfx": {
    id: "elevenlabs-sfx",
    type: "audio",
    name: "ElevenLabs Sound Effects",
    provider: "kie.ai",
    description: "Sound effects generation",
    creditCost: 3,
  },
  "omnivoice-tts": {
    id: "omnivoice-tts",
    type: "audio",
    name: "OmniVoice TTS",
    provider: "omnivoice",
    description:
      "Multilingual text-to-speech with optional voice design and cloning support",
    supportsVoices: ["managed", "custom"],
    creditCost: 5,
  },
  "gpt-4o-mini-tts": {
    id: "gpt-4o-mini-tts",
    type: "audio",
    name: "GPT-4o Mini TTS",
    provider: "knplabai",
    description: "KNPLabs OpenAI-compatible text-to-speech",
    supportsVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    creditCost: 4,
  },
  "tts-1": {
    id: "tts-1",
    type: "audio",
    name: "TTS-1",
    provider: "knplabai",
    description: "KNPLabs OpenAI-compatible text-to-speech",
    supportsVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    creditCost: 3,
  },
  "uvoice/tts-standard": {
    id: "uvoice/tts-standard",
    type: "audio",
    name: "UVoice TTS Standard",
    provider: "uvoice",
    description: "UVoice standard text-to-speech",
    creditCost: 150,
  },
  "uvoice/tts-natural": {
    id: "uvoice/tts-natural",
    type: "audio",
    name: "UVoice TTS Natural",
    provider: "uvoice",
    description: "UVoice natural text-to-speech",
    creditCost: 150,
  },
  "uvoice/tts-premium": {
    id: "uvoice/tts-premium",
    type: "audio",
    name: "UVoice TTS Premium",
    provider: "uvoice",
    description: "UVoice premium text-to-speech",
    creditCost: 300,
  },
};

// Default models
export const DEFAULT_MODELS = {
  image: "google-nano-banana-pro" as ImageModel,
  video: "veo3/generate-veo-3-video-lite" as VideoModel,
  audio: "elevenlabs-tts" as AudioModel,
};

// ==================== Request/Response Interfaces ====================

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  numImages?: number;
  /** Output resolution (e.g., "1K", "2K", "4K") */
  resolution?: string;
  /** Output format (e.g., "png", "jpeg") */
  outputFormat?: string;
  /** Per-model API overrides from model config */
  apiConfig?: MediaApiConfig;
  /** Dynamic model-specific input fields */
  extraParams?: Record<string, any>;
  /** Tenant public URL for resolving relative reference URLs */
  publicUrl?: string;
  /** Reference images for style transfer or img2img (1-5 URLs) */
  referenceImageUrls?: string[];
  /** Reference style URL for style transfer */
  referenceStyleUrl?: string;
  /** Optional audit metadata for end-to-end traceability */
  auditContext?: MediaAuditContext;
  /** Optional MCP/Gateway transport metadata for direct service callers */
  transportMetadata?: Partial<MediaTaskTransportMetadata>;
  /** Trusted server-only context set by Vertical Drama character renderers. */
  characterPromptContext?: {
    marker: "vertical_drama_character_v1";
    contractVersion: string;
    target: boolean;
    family?: string;
    maxPromptChars?: number;
    promptProfile?: string;
    semanticRetryCount?: number;
  };
}

export interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  duration?: number;
  aspectRatio?: string;
  fps?: number;
  /** Output resolution (e.g., "720p", "1080p") */
  resolution?: string;
  /** Per-model API overrides from model config */
  apiConfig?: MediaApiConfig;
  /** Dynamic model-specific input fields */
  extraParams?: Record<string, any>;
  /** Tenant public URL for resolving relative reference URLs */
  publicUrl?: string;
  /** Reference images for video generation (img2vid) */
  referenceImageUrls?: string[];
  /** Reference video URLs for vid2vid */
  referenceVideoUrls?: string[];
  /** Legacy single reference video URL for vid2vid */
  referenceVideoUrl?: string;
  /** Reference audio clips (minimax-h3 reference-to-video cites them by order) */
  referenceAudioUrls?: string[];
  /** Server-only signal: a validated typed video bundle owns ordering/limits. */
  preserveReferenceOrder?: boolean;
  /** Optional audit metadata for end-to-end traceability */
  auditContext?: MediaAuditContext;
  /** Optional MCP/Gateway transport metadata for direct service callers */
  transportMetadata?: Partial<MediaTaskTransportMetadata>;
}

export interface AudioGenerationRequest {
  text: string;
  model?: AudioModel;
  voice?: string;
  speed?: number;
  /** Per-model API overrides from model config */
  apiConfig?: MediaApiConfig;
  /** Dynamic model-specific input fields */
  extraParams?: Record<string, any>;
  /** Tenant public URL for resolving relative reference URLs */
  publicUrl?: string;
  /** Optional audit metadata for end-to-end traceability */
  auditContext?: MediaAuditContext;
}

export interface MediaAuditContext {
  userId?: number;
  tenantId?: string;
  traceId?: string;
  /** Fixed-credit skill billing marker consumed by the Python gateway. */
  skillRunId?: string;
  source?: string;
  stage?: string;
  [key: string]: unknown;
}

export interface MediaGenerationResult {
  id: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface MediaGenerationResponse {
  success: boolean;
  data: MediaGenerationResult[];
  creditsUsed: number;
  creditsBalance: number;
  model: string;
  error?: string;
}

export interface MediaTask {
  id: string;
  taskId?: string; // External provider task ID (e.g., Kie.ai)
  celeryTaskId?: string; // Internal Celery task UUID for tracking/monitoring
  userId: string;
  mediaType: MediaType;
  status: TaskStatus;
  model: string;
  prompt: string;
  parameters?: Record<string, unknown>;
  resultUrl?: string;
  resultData?: Record<string, unknown>;
  artifacts?: MediaTaskArtifactProjection[];
  errorMessage?: string;
  /** Section-06 amendment (Feature 135) — the typed `HermesMediaErrorCode`
   * (e.g. `HERMES_TIMEOUT`) for a failed/expired/canceled hermes_ task,
   * populated by `hermesMediaAdapter.ts`'s `getHermesMediaTask` alongside
   * the existing localized `errorMessage`. Left undefined for every other
   * transport/task — `errorMessage` remains the only field non-hermes
   * renderers need. Typed as `string` here (not the imported
   * `HermesMediaErrorCode` union) so this shared, transport-agnostic
   * interface never has to import from the hermes namespace. */
  errorCode?: string;
  creditsUsed?: number;
  creditsBalance?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface MediaTaskArtifactProjection {
  artifactId: string;
  outputIndex: number;
  r2Url?: string;
  r2StorageKey?: string;
  r2Status: string;
  providerOriginalUrl?: string;
  providerStatus: string;
  providerCheckedAt?: string;
  playbackUrl?: string;
  fallbackUrl?: string;
  availabilityStatus: string;
  availabilityReason?: string;
}

async function durabilizeCompletedMediaTask(
  task: MediaTask,
  auditContext?: MediaAuditContext,
): Promise<MediaTask> {
  if (task.status !== "completed") return task;
  const internalParams = {
    ...(task.parameters ?? {}),
    ...((task.parameters?.extra_params as Record<string, unknown> | undefined) ?? {}),
    ...((task.resultData?.extra_params as Record<string, unknown> | undefined) ?? {}),
  };
  const userId = auditContext?.userId;
  const tenantId = auditContext?.tenantId;
  // Vertical Drama and Marketplace Auto Review own separate asset ledgers;
  // their unified polling boundary performs the domain-specific projection.
  // A missing tenant must still fail closed even for those domain-owned tasks.
  if (internalParams.__vd_series_id || internalParams.__auto_review_run_id) {
    if (!Number.isInteger(userId) || (userId as number) <= 0 || !tenantId) {
      if (NODE_ENV === "test") return task;
      return redactMediaTaskWithoutTenant(task);
    }
    return task;
  }
  if (!Number.isInteger(userId) || (userId as number) <= 0 || !tenantId) {
    if (NODE_ENV === "test") return task;
    return redactMediaTaskWithoutTenant(task);
  }
  return ensureMediaTaskArtifactsForPolling({
    task,
    tenantId,
    userId: userId as number,
  });
}

function isMediaResultUrl(value: string): boolean {
  return /^(https?:\/\/|\/uploads\/|\/api\/storage\/)/i.test(value.trim());
}

/**
 * Keep the direct task response aligned with the list/history response. Some
 * providers persist the output only inside result_data, while Media History
 * derives the URL from that nested payload.
 */
function findMediaResultUrl(
  value: unknown,
  seen = new Set<unknown>()
): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isMediaResultUrl(trimmed)) return trimmed;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return findMediaResultUrl(JSON.parse(trimmed), seen);
      } catch {
        // Ignore provider payloads that use a non-JSON resultJson string.
      }
    }
    return undefined;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaResultUrl(item, seen);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    "resultUrl",
    "result_url",
    "imageUrl",
    "image_url",
    "videoUrl",
    "video_url",
    "audioUrl",
    "audio_url",
    "outputUrl",
    "output_url",
    "outputUrls",
    "output_urls",
    "result",
    "url",
  ]) {
    const found = findMediaResultUrl(record[key], seen);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findMediaResultUrl(nested, seen);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findMediaResultUrl(nested, seen);
    if (found) return found;
  }
  return undefined;
}

export interface TaskListResponse {
  tasks: MediaTask[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Service Class ====================

const NODE_ENV = process.env.NODE_ENV || "development";

function resolveMediaRequestTenantContext(request: {
  auditContext?: MediaAuditContext;
  transportMetadata?: Partial<MediaTaskTransportMetadata>;
}): { userId?: number; tenantId?: string } {
  const audit = request.auditContext;
  const transport = request.transportMetadata;
  const userId =
    typeof audit?.userId === "number"
      ? audit.userId
      : typeof transport?.actorUserId === "number"
        ? transport.actorUserId
        : undefined;
  const tenantId =
    typeof audit?.tenantId === "string" && audit.tenantId.trim()
      ? audit.tenantId.trim()
      : typeof transport?.tenantId === "string" && transport.tenantId.trim()
        ? transport.tenantId.trim()
        : undefined;
  return { userId, tenantId };
}

function requireTenantScopedMediaRequest(request: {
  auditContext?: MediaAuditContext;
  transportMetadata?: Partial<MediaTaskTransportMetadata>;
}): void {
  if (NODE_ENV === "test") return;
  const { userId, tenantId } = resolveMediaRequestTenantContext(request);
  if (!Number.isInteger(userId) || (userId as number) <= 0 || !tenantId) {
    throw new Error(
      "Media generation requires an authenticated user and tenant scope"
    );
  }
}

function getPythonMediaToken(
  request: {
    auditContext?: MediaAuditContext;
    transportMetadata?: Partial<MediaTaskTransportMetadata>;
  },
  userToken: string,
): string {
  if (NODE_ENV === "test") return userToken;
  const { userId, tenantId } = resolveMediaRequestTenantContext(request);
  if (!Number.isInteger(userId) || (userId as number) <= 0 || !tenantId) {
    return userToken;
  }
  return createInternalTokenFromAuth(
    { userId: userId as number, tenantId },
    ["media:generate"],
  );
}

/**
 * Convert relative public asset URLs (e.g., /uploads/xxx.png, /api/storage/files/xxx.png) to full URLs
 * so external services (like KIE AI) can download the files
 * @param url The URL to resolve
 * @param publicUrl Optional public URL from request context (tenant domain, e.g., https://smartaihub.app)
 */
export function resolveReferenceUrl(
  url: string,
  publicUrl?: string | null
): string {
  if (!url) return url;

  // If already a full URL, keep public URLs as-is.
  // Loopback/private hosts are rewritten to the internal Node URL so the
  // Python backend can fetch them and re-host them on R2 for Kie.ai.
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      if (!isLoopbackOrPrivateHost(parsed.hostname)) {
        return url;
      }

      const internalBase = new URL(getCachedInternalNodeUrl());
      internalBase.pathname = parsed.pathname;
      internalBase.search = parsed.search;
      internalBase.hash = parsed.hash;
      return internalBase.toString();
    } catch {
      return url;
    }
  }

  // Convert relative path to full URL
  // Priority: 1) Request's publicUrl (tenant domain) if public, 2) UI-managed public URL.
  // Internal-only fallbacks are rejected so external providers never receive app-internal paths.
  if (url.startsWith("/")) {
    assertRelativeUploadMediaReferencePath(url, "Reference URL");
    const cachedPublicUrl = getCachedPublicAppUrl();
    const baseUrl = isPublicHttpUrl(publicUrl || "")
      ? publicUrl!
      : isPublicHttpUrl(cachedPublicUrl || "")
        ? cachedPublicUrl
        : null;
    if (!baseUrl) {
      throw new Error(
        "Reference URL requires a public app URL to resolve /uploads/ assets safely"
      );
    }
    return `${baseUrl}${url}`;
  }

  return url;
}

function managedStorageKeyFromProviderReference(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/api/storage/files/")) {
      return decodeURIComponent(parsed.pathname.slice("/api/storage/files/".length));
    }
    if (parsed.pathname.startsWith("/uploads/")) {
      return decodeURIComponent(parsed.pathname.slice("/uploads/".length));
    }
  } catch {
    // Relative references are handled by resolveReferenceUrl before this helper.
  }
  return null;
}

async function resolveProviderReferenceUrls(
  urls: string[] | undefined,
  request: { auditContext?: MediaAuditContext },
  userToken: string,
  publicUrl?: string | null,
): Promise<string[] | undefined> {
  if (!urls?.length) return undefined;

  const containsManagedReference = urls.some((url) => {
    try {
      return managedStorageKeyFromProviderReference(
        resolveReferenceUrl(url, publicUrl),
      ) !== null;
    } catch {
      return false;
    }
  });

  let userId = request.auditContext?.userId;
  let tenantId = request.auditContext?.tenantId;
  if ((!userId || !tenantId) && userToken) {
    try {
      const claims = await verifyBearerToken(userToken);
      if (!userId && Number.isInteger(Number(claims.sub))) userId = Number(claims.sub);
      if (!tenantId && typeof claims.tenantId === "string") tenantId = claims.tenantId;
    } catch {
      // Session tokens may not be JWTs. In that case keep the original URL.
    }
  }
  if (!userId || !tenantId) {
    if (containsManagedReference) {
      throw new Error(
        "Reference image requires tenant-scoped access before provider submission"
      );
    }
    return urls;
  }

  const baseUrl = isPublicHttpUrl(publicUrl || "")
    ? publicUrl!
    : getCachedPublicAppUrl();
  if (!isPublicHttpUrl(baseUrl || "")) {
    // Unit fixtures intentionally use managed-looking relative URLs without
    // booting the runtime-config/database layer. Production callers still
    // fail closed below; this keeps pure prompt-generation tests focused on
    // their LLM contract rather than requiring a live app URL/config cache.
    if (process.env.NODE_ENV === "test") {
      return urls;
    }
    if (containsManagedReference) {
      throw new Error(
        "Reference image requires a public app URL for secure provider access"
      );
    }
    return urls;
  }

  const viewer = { tenantId, userId };
  return Promise.all(urls.map(async (url) => {
    const resolved = resolveReferenceUrl(url, publicUrl);
    const storageKey = managedStorageKeyFromProviderReference(resolved);
    if (!storageKey) return resolved;
    const ref = await createProviderManagedStorageDownloadRef(storageKey, viewer);
    return buildManagedStorageDownloadUrl(baseUrl!, ref.downloadRef, ref.fileName);
  }));
}

/**
 * Resolve one or more managed media references for an external consumer such
 * as an LLM vision endpoint or a media provider. Browser-facing storage URLs
 * are tenant-authenticated and therefore must never be sent to a third party.
 */
export async function resolveExternalMediaReferenceUrls(
  urls: string[] | undefined,
  viewer?: { userId: number; tenantId: string },
  publicUrl?: string | null,
): Promise<string[] | undefined> {
  return resolveProviderReferenceUrls(
    urls,
    { auditContext: viewer },
    "",
    publicUrl,
  );
}

export async function resolveExternalMediaReferenceUrl(
  url: string,
  viewer?: { userId: number; tenantId: string },
  publicUrl?: string | null,
): Promise<string> {
  const [resolved] = await resolveExternalMediaReferenceUrls([url], viewer, publicUrl) ?? [];
  return resolved ?? url;
}

/**
 * Resolve managed image/file URLs embedded in OpenAI-compatible message
 * content before the message is sent to an external provider. The browser
 * session cookie cannot be forwarded to those providers, so a protected
 * `/api/storage/files/*` URL must become a short-lived signed broker URL.
 */
export async function resolveExternalMediaMessageUrls(
  messages: Array<Record<string, unknown>>,
  viewer?: { userId: number; tenantId: string },
  publicUrl?: string | null,
): Promise<Array<Record<string, unknown>>> {
  const references: string[] = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      const field =
        record.type === "image_url"
          ? "image_url"
          : record.type === "file_url"
            ? "file_url"
            : null;
      if (!field) continue;
      const value = record[field];
      const url =
        typeof value === "string"
          ? value
          : value && typeof value === "object" && typeof (value as Record<string, unknown>).url === "string"
            ? String((value as Record<string, unknown>).url)
            : null;
      if (url) references.push(url);
    }
  }

  if (references.length === 0) return messages;

  const resolved = await resolveExternalMediaReferenceUrls(
    references,
    viewer,
    publicUrl,
  ) ?? references;
  let referenceIndex = 0;

  return messages.map(message => {
    if (!Array.isArray(message.content)) return message;
    const content = message.content.map(part => {
      if (!part || typeof part !== "object") return part;
      const record = part as Record<string, unknown>;
      const field =
        record.type === "image_url"
          ? "image_url"
          : record.type === "file_url"
            ? "file_url"
            : null;
      if (!field) return part;

      const value = record[field];
      const originalUrl =
        typeof value === "string"
          ? value
          : value && typeof value === "object" && typeof (value as Record<string, unknown>).url === "string"
            ? String((value as Record<string, unknown>).url)
            : null;
      if (!originalUrl) return part;

      const resolvedUrl = resolved[referenceIndex++] ?? originalUrl;
      return {
        ...record,
        [field]:
          typeof value === "string"
            ? resolvedUrl
            : { ...(value as Record<string, unknown>), url: resolvedUrl },
      };
    });
    return { ...message, content };
  });
}

export function buildManagedStorageDownloadUrl(
  baseUrl: string,
  downloadRef: string,
  fileName: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/api/mcp/downloads/${encodeURIComponent(downloadRef)}/${encodeURIComponent(fileName)}`;
}

function normalizeExtraParamKey(key: string): string {
  return String(key ?? "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isLikelyUrlLikeExtraParamKey(key: string): boolean {
  const normalizedKey = normalizeExtraParamKey(key);
  if (!normalizedKey) {
    return false;
  }

  return (
    normalizedKey === "url" ||
    normalizedKey.endsWith("url") ||
    normalizedKey.endsWith("urls") ||
    normalizedKey === "uri" ||
    normalizedKey.endsWith("uri") ||
    normalizedKey.endsWith("uris") ||
    normalizedKey === "audio" ||
    normalizedKey === "image" ||
    normalizedKey === "video" ||
    normalizedKey.includes("referenceimage") ||
    normalizedKey.includes("referencevideo") ||
    normalizedKey.includes("referenceaudio") ||
    normalizedKey.includes("imageurl") ||
    normalizedKey.includes("videourl") ||
    normalizedKey.includes("audiourl") ||
    normalizedKey === "videolist" ||
    normalizedKey.includes("imageinput") ||
    normalizedKey.includes("videoinput") ||
    normalizedKey.includes("audioinput") ||
    normalizedKey.includes("fileurl") ||
    normalizedKey.includes("filepath") ||
    normalizedKey.includes("sourceurl") ||
    normalizedKey.includes("asseturl") ||
    normalizedKey.includes("mediaurl")
  );
}

const CLIENT_ONLY_EXTRA_PARAM_KEYS = new Set([
  "marketplaceContext",
  "marketplaceProduct",
  "marketplace_context",
  "marketplace_product",
]);

const PROVIDER_INTERNAL_EXTRA_PARAM_KEYS = new Set([
  "reference_image_manifest",
  "referenceImageManifest",
  "reference_image_role_order",
  "referenceImageRoleOrder",
  "reference_image_role_counts",
  "referenceImageRoleCounts",
]);

const PERSISTED_INTERNAL_EXTRA_PARAM_KEYS = new Set([
  "__prompt_safety",
  // Credit reservation metadata for domain-owned async media tasks. These
  // remain app-side task parameters so terminal polling can refund a failed
  // reservation exactly once; they are never provider prompt semantics.
  "__reserved_credits",
  "__credit_source_type",
  "__credit_reservation_key",
  "__origin_surface",
  "__execution_path",
  "__no_node_canvas_execution",
  "__marketplace_product_id",
  "__marketplace_product_name",
  "__production_run_id",
  "__auto_review_run_id",
  "__auto_review_concept_id",
  "__unit_id",
  "__unit_role",
  "__repair_attempt",
  "__resolved_audio_strategy",
  // Vertical Drama Series provenance tags (2026-07-05, project-scoped media
  // panel filter) — additive, read back by `media.listTasks`'s optional
  // `seriesId` filter and by `mediaLibraryService`'s trace helpers. Never
  // used for anything provider-facing; purely app-side bookkeeping.
  "__vd_series_id",
  "__vd_episode_id",
  "__vd_character_id",
  "__vd_portrait_candidate_batch_id",
  "__vd_portrait_candidate_id",
  "__vd_portrait_candidate_asset_link_id",
  // Vertical Drama shot/image provenance tags (2026-07-06) — additive
  // bookkeeping only, not provider-facing. They are read by project-scoped
  // history/recovery paths and never sent as provider prompt semantics.
  "__vd_shot_number",
  // Vertical Drama video-clip provenance (2026-07-13) — identifies the exact
  // motion-prompt-pack clip for durable completion reconciliation. This is
  // distinct from `__vd_shot_number` because a speaker-aware shot can have
  // multiple clips (301/302/303) for one source shot.
  "__vd_clip_number",
  // User-facing media naming context. These values are app-side metadata used
  // by Media History/Library/Gallery and are never part of provider prompts.
  "__media_display_title",
  "__media_series_title",
  "__media_episode_number",
  "__media_shot_number",
  "__media_clip_number",
  // Vertical Drama logo slot provenance — distinguishes the title logo from
  // the channel/page logo when the generated task is applied back to Settings.
  "__vd_logo_slot",
  "__vd_purpose",
]);

function stripClientOnlyExtraParams(
  extraParams: Record<string, any>
): Record<string, any> {
  const sanitized = { ...extraParams };
  for (const key of CLIENT_ONLY_EXTRA_PARAM_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

// Exported for unit testing only (2026-07-06) — pure function, no side
// effects; verifies the Vertical Drama shot-tagging keys (`__vd_shot_number`,
// `__vd_purpose`) survive this filter alongside the pre-existing
// `__vd_series_id`/`__vd_episode_id` tags.
export function stripProviderInternalExtraParams(
  extraParams: Record<string, any>
): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(extraParams)) {
    if (
      (key.startsWith("__") && !PERSISTED_INTERNAL_EXTRA_PARAM_KEYS.has(key)) ||
      PROVIDER_INTERNAL_EXTRA_PARAM_KEYS.has(key)
    ) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * Process extraParams and resolve relative media URLs only for URL-like keys.
 * This keeps plain text fields such as style_instructions untouched even when
 * they happen to start with '/'.
 */
function resolveExtraParamsUrls(
  extraParams: Record<string, any>,
  publicUrl?: string | null
): Record<string, any> {
  const resolved = { ...extraParams };
  const resolveUrlLikeNestedValue = (entry: unknown): unknown => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return entry;
    }
    const next: Record<string, unknown> = {
      ...(entry as Record<string, unknown>),
    };
    for (const [nestedKey, nestedValue] of Object.entries(next)) {
      if (!isLikelyUrlLikeExtraParamKey(nestedKey)) {
        continue;
      }
      if (
        typeof nestedValue === "string" &&
        nestedValue.startsWith("/") &&
        !nestedValue.startsWith("//")
      ) {
        next[nestedKey] = resolveReferenceUrl(nestedValue, publicUrl);
      }
    }
    return next;
  };
  for (const [key, value] of Object.entries(resolved)) {
    if (!isLikelyUrlLikeExtraParamKey(key)) {
      continue;
    }

    // Resolve arrays of URL-like strings, preserving existing absolute URLs.
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(entry => typeof entry === "string")
    ) {
      const firstVal = String(value[0] ?? "").trim();
      if (firstVal.startsWith("/") && !firstVal.startsWith("//")) {
        resolved[key] = value.map((url: string) =>
          resolveReferenceUrl(url, publicUrl)
        );
      }
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.some(entry => entry && typeof entry === "object")
    ) {
      resolved[key] = value.map(entry => resolveUrlLikeNestedValue(entry));
      continue;
    }

    // Resolve a single URL-like string if it references a relative asset path.
    if (
      typeof value === "string" &&
      value.startsWith("/") &&
      !value.startsWith("//")
    ) {
      resolved[key] = resolveReferenceUrl(value, publicUrl);
    }
  }
  return resolved;
}

async function resolveProviderExtraParamsUrls(
  extraParams: Record<string, any>,
  request: { auditContext?: MediaAuditContext },
  userToken: string,
  publicUrl?: string | null,
): Promise<Record<string, any>> {
  const resolveValue = async (key: string, value: unknown): Promise<unknown> => {
    if (typeof value === "string" && isLikelyUrlLikeExtraParamKey(key)) {
      return (await resolveProviderReferenceUrls([value], request, userToken, publicUrl))?.[0] ?? value;
    }
    if (Array.isArray(value)) {
      if (value.every(entry => typeof entry === "string") && isLikelyUrlLikeExtraParamKey(key)) {
        return await resolveProviderReferenceUrls(value as string[], request, userToken, publicUrl) ?? value;
      }
      return Promise.all(value.map(entry =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? resolveObject(entry as Record<string, unknown>)
          : entry
      ));
    }
    if (value && typeof value === "object") {
      return resolveObject(value as Record<string, unknown>);
    }
    return value;
  };

  const resolveObject = async (value: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = await resolveValue(key, entry);
    }
    return next;
  };

  return resolveObject(extraParams) as Promise<Record<string, any>>;
}

function normalizeAspectRatioExtraParams(
  extraParams: Record<string, any>,
  aspectRatio?: string | null
): Record<string, any> {
  const normalized = { ...extraParams };
  const canonical = String(aspectRatio ?? "").trim();
  if (!canonical) return normalized;

  for (const key of ["aspect_ratio", "aspectRatio", "aspect.ratio"] as const) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = canonical;
    }
  }
  return normalized;
}

function buildPythonBackendExtraParams(
  extraParams: Record<string, any>,
  publicUrl?: string | null,
  aspectRatio?: string | null
): Record<string, any> {
  return resolveExtraParamsUrls(
    normalizeAspectRatioExtraParams(
      stripProviderInternalExtraParams(stripClientOnlyExtraParams(extraParams)),
      aspectRatio
    ),
    publicUrl
  );
}

export function buildPythonBackendExtraParamsForTest(
  extraParams: Record<string, any>,
  publicUrl?: string | null,
  aspectRatio?: string | null
): Record<string, any> {
  return buildPythonBackendExtraParams(extraParams, publicUrl, aspectRatio);
}

function assertValidAudioModelExtraParams(
  modelId: string,
  extraParams: Record<string, unknown> | undefined
): void {
  const normalizedModelId = mapToApiModelId(modelId);
  if (normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID) {
    assertGemini31FlashTtsExtraParams(extraParams);
  }
}

function assertValidAudioModelRequest(
  modelId: string,
  request: Pick<AudioGenerationRequest, "speed">
): void {
  const normalizedModelId = mapToApiModelId(modelId);
  if (normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID) {
    assertGemini31FlashTtsAudioRequest(request);
  }
}

function normalizeValidAudioModelExtraParams(
  modelId: string,
  extraParams: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const normalizedModelId = mapToApiModelId(modelId);
  if (normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID) {
    return normalizeGemini31FlashTtsExtraParams(extraParams);
  }
  return extraParams;
}

function getReferenceImageLimitForModel(modelId: string): number {
  const normalizedModelId = mapToApiModelId(modelId);
  const model =
    getModelById(normalizedModelId) ||
    getModelById(modelId) ||
    MEDIA_MODELS[modelId];
  return getReferenceImageLimitFromConfig(model?.configJson) ?? 5;
}

function isGptImageModel(modelId: string): boolean {
  const normalized = (modelId || "").toLowerCase();
  return normalized.includes("gpt-image") || normalized.includes("gpt_image");
}

function isBananaModel(modelId: string): boolean {
  const normalized = (modelId || "").toLowerCase();
  return normalized.includes("banana");
}

function resolveReferenceImageUrlsForModel(
  modelId: string,
  urls: string[] | undefined,
  publicUrl?: string | null,
  preserveReferenceOrder = false,
): string[] | undefined {
  if (!urls || urls.length === 0) {
    return undefined;
  }

  const model =
    getModelById(mapToApiModelId(modelId)) ||
    getModelById(modelId) ||
    MEDIA_MODELS[modelId];
  const hasDeclarativeVideoCapabilityProfile = Boolean(
    model?.configJson &&
    typeof model.configJson === "object" &&
    !Array.isArray(model.configJson) &&
    "videoCapabilityProfile" in model.configJson,
  );
  // Profile-backed video routes already validated the complete typed bundle
  // against per-modality/total limits. Do not apply the legacy image-only cap
  // here, otherwise mixed-reference providers lose ordered image items before
  // their adapter receives the bundle. Legacy models retain the old trim.
  const sliced = preserveReferenceOrder || hasDeclarativeVideoCapabilityProfile
    ? urls
    : urls.slice(0, getReferenceImageLimitForModel(modelId));
  const isGptImage = isGptImageModel(modelId) && !isBananaModel(modelId);

  return sliced.map(url => {
    let resolved = resolveReferenceUrl(url, publicUrl);
    if (isGptImage) {
      resolved = resolved.replace(/\.webp(\?.*)?$/i, ".jpg$1");
    }
    return resolved;
  });
}

export function resolveReferenceImageUrlsForModelForTest(
  modelId: string,
  urls: string[] | undefined,
  publicUrl?: string | null,
  preserveReferenceOrder = false,
): string[] | undefined {
  return resolveReferenceImageUrlsForModel(modelId, urls, publicUrl, preserveReferenceOrder);
}

type ReferenceImageInputType = "array" | "url";

function inferReferenceImageInputLabel(rawKey: string): string {
  const normalizedKey = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalizedKey.includes("video")) {
    return "Reference Videos";
  }
  if (normalizedKey.includes("audio")) {
    return "Reference Audio";
  }
  return "Reference Images";
}

function normalizeReferenceImageInputType(
  rawType: unknown
): ReferenceImageInputType | null {
  if (typeof rawType !== "string") {
    return null;
  }

  const type = rawType.trim().toLowerCase();
  if (!type) {
    return null;
  }

  if (
    type === "array" ||
    type === "image_urls" ||
    type === "video_urls" ||
    type === "audio_urls"
  ) {
    return "array";
  }

  if (type === "url" || type === "text" || type === "string") {
    return "url";
  }

  return null;
}

function inferReferenceImageInputConfig(
  modelId: string
): { key: string; label?: string; type: ReferenceImageInputType } | undefined {
  const normalizedModelId = mapToApiModelId(modelId);
  const model = getModelById(normalizedModelId) || getModelById(modelId);
  const inputFields = Array.isArray(
    (model?.configJson as { inputFields?: unknown } | undefined)?.inputFields
  )
    ? ((model?.configJson as { inputFields?: unknown } | undefined)
        ?.inputFields as unknown[])
    : [];

  for (const field of inputFields) {
    if (!field || typeof field !== "object") {
      continue;
    }

    const record = field as Record<string, unknown>;
    const rawKey = typeof record.key === "string" ? record.key.trim() : "";
    if (!rawKey) {
      continue;
    }

    const normalizedKey = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const rawSyncWith =
      typeof record.syncWith === "string" ? record.syncWith.trim() : "";
    const rawLabel =
      typeof record.label === "string" ? record.label.trim() : "";
    const looksLikeReferenceImageField =
      rawSyncWith === "reference_images" ||
      normalizedKey === "imageinput" ||
      normalizedKey === "referenceimages" ||
      normalizedKey.includes("referenceimage") ||
      normalizedKey.includes("imageurl");
    if (!looksLikeReferenceImageField) {
      continue;
    }

    const type = normalizeReferenceImageInputType(record.type);
    if (!type) {
      continue;
    }

    return {
      key: rawKey,
      label: rawLabel || inferReferenceImageInputLabel(rawKey),
      type,
    };
  }

  return undefined;
}

function buildApiConfigWithReferenceImageConfig(
  modelId: string,
  apiConfig: MediaApiConfig | undefined,
  referenceImageUrls?: string[]
): MediaApiConfig | undefined {
  const baseConfig = apiConfig ? { ...apiConfig } : undefined;
  if (!referenceImageUrls || referenceImageUrls.length === 0) {
    return baseConfig;
  }

  const referenceImageConfig = inferReferenceImageInputConfig(modelId);
  if (!referenceImageConfig) {
    return baseConfig;
  }

  return {
    ...(baseConfig ?? {}),
    reference_image_input_key: referenceImageConfig.key,
    ...(referenceImageConfig.label
      ? { reference_image_input_label: referenceImageConfig.label }
      : {}),
    reference_image_input_type: referenceImageConfig.type,
  };
}

/**
 * Validate and enforce HTTPS for backend URL in production
 */
function validateBackendUrl(url: string): string {
  const parsedUrl = new URL(url);

  // In production, enforce HTTPS
  if (NODE_ENV === "production") {
    if (parsedUrl.protocol !== "https:") {
      // Allow localhost in production for containerized deployments
      if (
        parsedUrl.hostname !== "localhost" &&
        parsedUrl.hostname !== "127.0.0.1"
      ) {
        console.error(
          `[SECURITY WARNING] Python backend URL must use HTTPS in production: ${url}`
        );
        // Attempt to upgrade to HTTPS
        parsedUrl.protocol = "https:";
        console.warn(
          `[SECURITY] Auto-upgrading backend URL to HTTPS: ${parsedUrl.toString()}`
        );
        return parsedUrl.toString().replace(/\/$/, ""); // Remove trailing slash
      }
    }
  } else if (NODE_ENV !== "development" && NODE_ENV !== "test") {
    // Staging or other environments - warn but don't block
    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.hostname !== "localhost" &&
      parsedUrl.hostname !== "127.0.0.1"
    ) {
      console.warn(
        `[SECURITY WARNING] Consider using HTTPS for Python backend URL: ${url}`
      );
    }
  }

  return url;
}

function isLoopbackOrPrivateHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower) return false;

  if (
    lower === "localhost" ||
    lower === "host.docker.internal" ||
    lower === "smartspec-web" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower === "[::1]"
  ) {
    return true;
  }

  if (/^127(?:\.\d{1,3}){3}$/.test(lower)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(lower)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(lower)) return true;
  if (/^169\.254(?:\.\d{1,3}){2}$/.test(lower)) return true;

  return false;
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return !isLoopbackOrPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

class MediaRequestError extends Error {
  statusCode: number;
  responsePayload: unknown;
  endpoint: string;

  constructor(
    message: string,
    statusCode: number,
    endpoint: string,
    responsePayload: unknown
  ) {
    super(message);
    this.name = "MediaRequestError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.responsePayload = responsePayload;
  }
}

function sanitizeAuditError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

function isRetryableMediaSubmitError(error: unknown): boolean {
  if (error instanceof MediaRequestError) {
    return false;
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return RETRYABLE_MEDIA_SETTINGS_ERROR.test(raw);
}

function enrichMediaSubmitError(error: unknown, endpointPath: string): Error {
  const raw =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (
    !RETRYABLE_MEDIA_SETTINGS_ERROR.test(raw) ||
    raw.includes(`[endpoint=${endpointPath}]`)
  ) {
    return error instanceof Error ? error : new Error(raw);
  }

  const enriched = new Error(`${raw} [endpoint=${endpointPath}]`);
  if (error instanceof Error && error.stack) {
    enriched.stack = error.stack;
  }
  return enriched;
}

function normalizeMcpOriginSurface(
  value: unknown,
  source?: string
): MediaOriginSurface {
  if (
    value === "media_studio" ||
    value === "auto_storyboard_review" ||
    value === "marketplace_capture" ||
    value === "storyboard_review"
  ) {
    return value;
  }
  if (
    source === "marketplace_auto_review" ||
    source === "marketplace_capture"
  ) {
    return "marketplace_capture";
  }
  if (source === "storyboard_review") {
    return "storyboard_review";
  }
  if (source === "auto_storyboard_review") {
    return "auto_storyboard_review";
  }
  return "media_studio";
}

function buildMcpServiceParameters(
  assetType: MediaAssetType,
  request: ImageGenerationRequest | VideoGenerationRequest
): Record<string, unknown> {
  const referenceImageUrls =
    request.referenceImageUrls && request.referenceImageUrls.length > 0
      ? request.referenceImageUrls.map(url =>
          resolveReferenceUrl(url, request.publicUrl)
        )
      : undefined;
  const extraParams = request.extraParams ?? {};
  const referenceImageManifest =
    extraParams.referenceImageManifest ?? extraParams.reference_image_manifest;
  const referenceImageRoleOrder =
    extraParams.referenceImageRoleOrder ??
    extraParams.reference_image_role_order;
  const referenceImageRoleCounts =
    extraParams.referenceImageRoleCounts ??
    extraParams.reference_image_role_counts;
  const common = {
    assetType,
    model: request.model,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    extraParams: request.extraParams,
    referenceImageUrls,
    referenceImageManifest,
    referenceImageRoleOrder,
    referenceImageRoleCounts,
    referenceImageCount: referenceImageUrls?.length ?? 0,
  };
  if (assetType === "image") {
    const imageRequest = request as ImageGenerationRequest;
    return {
      ...common,
      size: imageRequest.size,
      numImages: imageRequest.numImages,
      outputFormat: imageRequest.outputFormat,
      hasReferenceStyle: Boolean(imageRequest.referenceStyleUrl),
    };
  }
  const videoRequest = request as VideoGenerationRequest;
  return {
    ...common,
    duration: videoRequest.duration,
    fps: videoRequest.fps,
    referenceVideoUrls:
      videoRequest.referenceVideoUrls?.length
        ? videoRequest.referenceVideoUrls.map(url => resolveReferenceUrl(url, request.publicUrl))
        : undefined,
    referenceAudioUrls:
      videoRequest.referenceAudioUrls?.length
        ? videoRequest.referenceAudioUrls.map(url => resolveReferenceUrl(url, request.publicUrl))
        : undefined,
    firstFrameUrl: typeof videoRequest.extraParams?.first_frame_url === "string"
      ? resolveReferenceUrl(videoRequest.extraParams.first_frame_url, request.publicUrl)
      : undefined,
    lastFrameUrl: typeof videoRequest.extraParams?.last_frame_url === "string"
      ? resolveReferenceUrl(videoRequest.extraParams.last_frame_url, request.publicUrl)
      : undefined,
    referenceVideoCount:
      videoRequest.referenceVideoUrls?.length ??
      (videoRequest.referenceVideoUrl ? 1 : 0),
  };
}

function shouldOmitCharacterNegativePrompt(
  request: ImageGenerationRequest
): boolean {
  return isTrustedTargetCharacterPromptContext(request.characterPromptContext);
}

function isTrustedTargetCharacterPromptContext(
  context: ImageGenerationRequest["characterPromptContext"] | undefined
): context is NonNullable<ImageGenerationRequest["characterPromptContext"]> {
  if (
    context?.marker !== "vertical_drama_character_v1" ||
    context.contractVersion !== "vd_character_natural_human_v1" ||
    context.target !== true
  ) {
    return false;
  }

  const expected =
    context.family === "seedream"
      ? { maxPromptChars: 5_000, promptProfile: "compact" }
      : context.family === "gpt_image_2" || context.family === "nano_banana"
        ? { maxPromptChars: 20_000, promptProfile: "rich" }
        : null;
  return Boolean(
    expected &&
    context.maxPromptChars === expected.maxPromptChars &&
    context.promptProfile === expected.promptProfile
  );
}

async function prepareImageRequestForSafety(
  request: ImageGenerationRequest,
): Promise<ImageGenerationRequest> {
  if (isReusablePreparedEpisodeCoverSafety(request)) {
    return request;
  }
  const mode = isVerticalDramaImageRequest(request)
    ? request.extraParams?.__vd_purpose === "episode_cover"
      ? "vertical_drama_cover"
      : "vertical_drama_managed"
    : "standard";
  const safety = await prepareImagePromptSafety({
    prompt: request.prompt,
    negativePrompt: request.negativePrompt,
    model: request.model,
    aspectRatio: request.aspectRatio,
    referenceImageCount: request.referenceImageUrls?.length ?? 0,
    userId:
      typeof request.auditContext?.userId === "number"
        ? request.auditContext.userId
        : undefined,
    mode,
  });

  return {
    ...request,
    prompt: safety.prompt,
    extraParams: {
      ...(request.extraParams ?? {}),
      __prompt_safety: safety.metadata,
    },
  };
}

type MediaAuditRequest = {
  auditContext?: MediaAuditContext;
  prompt?: string;
  referenceImageUrls?: string[];
  characterPromptContext?: ImageGenerationRequest["characterPromptContext"];
};

export function buildMediaRequestAuditPayload(params: {
  request: MediaAuditRequest;
  requestType: string;
  mediaType: MediaType;
  provider: string;
  model: string;
  endpoint: string;
  payload: unknown;
}): Record<string, unknown> {
  const {
    request,
    requestType,
    mediaType,
    provider,
    model,
    endpoint,
    payload,
  } = params;
  const auditContext = request.auditContext;
  const base = {
    source: auditContext?.source ?? "media_generation_service",
    stage: auditContext?.stage ?? null,
    endpoint,
    provider,
    model,
  };
  const context = request.characterPromptContext;
  if (
    mediaType !== "image" ||
    !isTrustedTargetCharacterPromptContext(context)
  ) {
    return { ...base, payload };
  }

  const payloadRecord =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const prompt =
    typeof payloadRecord.prompt === "string"
      ? payloadRecord.prompt
      : (request.prompt ?? "");
  const referenceImageUrls = Array.isArray(request.referenceImageUrls)
    ? request.referenceImageUrls
    : Array.isArray(payloadRecord.reference_image_urls)
      ? payloadRecord.reference_image_urls
      : [];

  return {
    ...base,
    request_type: requestType,
    model_id: model,
    family: context.family ?? "other",
    prompt_profile: context.promptProfile ?? "legacy",
    max_prompt_chars: context.maxPromptChars ?? null,
    prompt_length: prompt.length,
    semantic_retry_count: Math.max(
      0,
      Math.floor(context.semanticRetryCount ?? 0)
    ),
    negative_prompt_submitted: false,
    contract_version: context.contractVersion,
    reference_image_count: referenceImageUrls.length,
  };
}

export class MediaGenerationService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const rawUrl = baseUrl || getCachedPythonBackendUrl();
    this.baseUrl = validateBackendUrl(rawUrl);
  }

  /**
   * Get auth headers for Python backend
   */
  private getHeaders(userToken: string): HeadersInit {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userToken}`,
    };
  }

  private getAuditContext(request: {
    auditContext?: MediaAuditContext;
  }): MediaAuditContext {
    return request.auditContext ?? {};
  }

  private async submitMcpMediaTaskIfRequested(
    assetType: MediaAssetType,
    request: (ImageGenerationRequest | VideoGenerationRequest) & {
      transportMetadata?: Partial<MediaTaskTransportMetadata>;
    },
    modelId: string,
    prompt: string
  ): Promise<MediaTask | null> {
    const rawMetadata = request.transportMetadata as
      | (Partial<MediaTaskTransportMetadata> & {
          mcpConnectionId?: string;
          approvalId?: string;
          mcpApprovalId?: string;
        })
      | null
      | undefined;
    if (rawMetadata?.transport !== "mcp") return null;

    const tenantId =
      typeof rawMetadata.tenantId === "string"
        ? rawMetadata.tenantId
        : typeof request.auditContext?.tenantId === "string"
          ? request.auditContext.tenantId
          : "";
    const actorUserId =
      typeof rawMetadata.actorUserId === "number"
        ? rawMetadata.actorUserId
        : typeof request.auditContext?.userId === "number"
          ? request.auditContext.userId
          : undefined;
    const connectionId =
      typeof rawMetadata.connectionId === "string"
        ? rawMetadata.connectionId
        : typeof rawMetadata.mcpConnectionId === "string"
          ? rawMetadata.mcpConnectionId
          : "";
    if (!tenantId || !actorUserId || !connectionId) {
      throw new Error(
        "MCP transport requires tenantId, actorUserId, and connectionId"
      );
    }

    const originSurface = normalizeMcpOriginSurface(
      rawMetadata.originSurface,
      typeof request.auditContext?.source === "string"
        ? request.auditContext.source
        : undefined
    );
    const modelTransport =
      rawMetadata.providerKey ||
      rawMetadata.providerModelId ||
      rawMetadata.toolName
        ? {
            providerKey: rawMetadata.providerKey,
            providerModelId: rawMetadata.providerModelId,
            toolName: rawMetadata.toolName,
            argumentShape: rawMetadata.argumentShape,
          }
        : await this.resolveMcpModelTransportConfig(
            assetType,
            modelId,
            rawMetadata.providerKey
          );
    const providerKey = rawMetadata.providerKey ?? modelTransport.providerKey;
    const rawProviderModelId =
      rawMetadata.providerModelId ?? modelTransport.providerModelId;
    const providerModelId =
      normalizeMcpProviderModelIdForProvider({
        providerKey,
        providerModelId: rawProviderModelId,
        assetType,
        argumentShape:
          rawMetadata.argumentShape ?? modelTransport.argumentShape,
      }) ?? rawProviderModelId;
    const metadata = await resolveMediaTransport({
      tenantId,
      actorUserId,
      originSurface,
      assetType,
      requestedTransport: "mcp",
      mcpConnectionId: connectionId,
      sharedGroupId: rawMetadata.sharedGroupId,
      approvalId: rawMetadata.approvalId ?? rawMetadata.mcpApprovalId,
      providerKey,
      providerModelId,
      model: providerModelId ?? modelId,
      toolName: rawMetadata.toolName ?? modelTransport.toolName,
      argumentShape: rawMetadata.argumentShape ?? modelTransport.argumentShape,
      idempotencyKey: rawMetadata.idempotencyKey,
    });
    const parameters = buildMcpServiceParameters(assetType, request);
    if (Array.isArray(parameters.referenceImageUrls)) {
      parameters.referenceImageUrls =
        (await resolveProviderReferenceUrls(
          parameters.referenceImageUrls.filter(
            (value): value is string => typeof value === "string"
          ),
          request,
          "",
          request.publicUrl,
        )) ?? parameters.referenceImageUrls;
    }
    for (const key of ["referenceVideoUrls", "referenceAudioUrls"] as const) {
      if (Array.isArray(parameters[key])) {
        parameters[key] =
          (await resolveProviderReferenceUrls(
            parameters[key].filter(
              (value): value is string => typeof value === "string",
            ),
            request,
            "",
            request.publicUrl,
          )) ?? parameters[key];
      }
    }
    return submitMcpMediaGeneration({
      tenantId,
      prompt,
      model: modelId,
      metadata,
      parameters,
    });
  }

  private async resolveMcpModelTransportConfig(
    assetType: MediaAssetType,
    modelId: string,
    providerKey?: string | null
  ) {
    const staticConfig = resolveMediaModelTransportConfig({
      provider: providerKey,
      modelId,
      configJson: resolveStaticModelConfigJson(modelId),
    });
    if (staticConfig.transport === "mcp" && staticConfig.toolName) {
      return staticConfig;
    }

    const selection = await resolveEnabledMediaModelSelection({
      mediaType: assetType,
      requestedModel: modelId,
      requestedProvider: providerKey,
      requireConfiguredProvider: false,
      allowSubstitution: false,
    });
    if (!selection.ok) {
      return staticConfig;
    }

    const dbConfig = resolveMediaModelTransportConfig({
      provider: selection.provider,
      modelId: selection.modelId,
      configJson: selection.model.configJson,
    });
    return dbConfig.transport === "mcp" ? dbConfig : staticConfig;
  }

  private logRetryableSubmitError(params: {
    request: { auditContext?: MediaAuditContext };
    provider: string;
    model: string;
    mediaType: MediaType;
    requestType: string;
    endpoint: string;
    attempt: number;
    maxAttempts: number;
    error: unknown;
  }): void {
    const auditContext = this.getAuditContext(params.request);
    const errorMessage = sanitizeAuditError(params.error);

    auditLogger.log({
      traceId:
        typeof auditContext.traceId === "string"
          ? auditContext.traceId
          : undefined,
      eventType: "error",
      userId:
        typeof auditContext.userId === "number" ? auditContext.userId : null,
      providerName: params.provider,
      model: params.model,
      mediaType: params.mediaType,
      requestType: params.requestType,
      endpoint: params.endpoint,
      errorType: "media_submit_retryable_error",
      errorMessage,
      metadata: {
        source: auditContext.source ?? "media_generation_service",
        stage: auditContext.stage ?? null,
        retryAttempt: params.attempt,
        maxAttempts: params.maxAttempts,
      },
    });

    console.warn(
      "[MediaGenerationService] Retrying transient media submit error",
      {
        traceId: auditContext.traceId,
        provider: params.provider,
        model: params.model,
        mediaType: params.mediaType,
        requestType: params.requestType,
        endpoint: params.endpoint,
        attempt: params.attempt,
        maxAttempts: params.maxAttempts,
        errorMessage,
      }
    );
  }

  private async submitTaskWithRetry(params: {
    request: { auditContext?: MediaAuditContext };
    requestType: string;
    mediaType: MediaType;
    provider: string;
    model: string;
    endpoint: string;
    userToken: string;
    payload: unknown;
  }): Promise<{ status: number; data: any }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MEDIA_SUBMIT_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await scheduleMediaWithLimiter(
          params.provider,
          params.mediaType as RateLimiterMediaType,
          async () =>
            this.postJson(
              getPythonMediaToken(params.request, params.userToken),
              params.endpoint,
              params.payload,
            )
        );
      } catch (error) {
        const enrichedError = enrichMediaSubmitError(error, params.endpoint);
        lastError = enrichedError;

        if (
          !isRetryableMediaSubmitError(enrichedError) ||
          attempt >= MEDIA_SUBMIT_MAX_ATTEMPTS
        ) {
          throw enrichedError;
        }

        this.logRetryableSubmitError({
          request: params.request,
          provider: params.provider,
          model: params.model,
          mediaType: params.mediaType,
          requestType: params.requestType,
          endpoint: params.endpoint,
          attempt,
          maxAttempts: MEDIA_SUBMIT_MAX_ATTEMPTS,
          error: enrichedError,
        });

        await new Promise(resolve =>
          setTimeout(resolve, MEDIA_SUBMIT_RETRY_DELAY_MS)
        );
      }
    }

    throw enrichMediaSubmitError(lastError, params.endpoint);
  }

  private logMediaRequest(params: {
    request: MediaAuditRequest;
    requestType: string;
    mediaType: MediaType;
    provider: string;
    model: string;
    endpoint: string;
    payload: unknown;
  }): void {
    const auditContext = this.getAuditContext(params.request);
    auditLogger.log({
      traceId:
        typeof auditContext.traceId === "string"
          ? auditContext.traceId
          : undefined,
      eventType: "media_request",
      userId:
        typeof auditContext.userId === "number" ? auditContext.userId : null,
      providerName: params.provider,
      model: params.model,
      mediaType: params.mediaType,
      requestType: params.requestType,
      requestPayload: buildMediaRequestAuditPayload(params),
    });
  }

  private logMediaResponse(params: {
    request: { auditContext?: MediaAuditContext };
    requestType: string;
    mediaType: MediaType;
    provider: string;
    model: string;
    statusCode: number;
    success: boolean;
    responsePayload?: unknown;
    errorMessage?: string;
  }): void {
    const auditContext = this.getAuditContext(params.request);
    auditLogger.log({
      traceId:
        typeof auditContext.traceId === "string"
          ? auditContext.traceId
          : undefined,
      eventType: "media_response",
      userId:
        typeof auditContext.userId === "number" ? auditContext.userId : null,
      providerName: params.provider,
      model: params.model,
      mediaType: params.mediaType,
      requestType: params.requestType,
      statusCode: params.statusCode,
      errorType: params.success ? undefined : "media_generation_failed",
      errorMessage: params.success ? undefined : params.errorMessage,
      responsePayload: {
        success: params.success,
        ...(!params.success && params.errorMessage
          ? { error: params.errorMessage }
          : {}),
        ...(params.responsePayload !== undefined
          ? { providerResponse: params.responsePayload }
          : {}),
      },
      metadata: {
        source: auditContext.source ?? "media_generation_service",
        stage: auditContext.stage ?? null,
      },
    });
  }

  private async postJson(
    userToken: string,
    endpointPath: string,
    payload: unknown
  ): Promise<{ status: number; data: any }> {
    const response = await fetch(`${this.baseUrl}${endpointPath}`, {
      method: "POST",
      headers: this.getHeaders(userToken),
      body: JSON.stringify(payload),
    });

    const rawText = await response.text().catch(() => "");
    let parsed: unknown;
    if (rawText.length === 0) {
      parsed = {};
    } else {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { raw: rawText.slice(0, 2000) };
      }
    }

    if (!response.ok) {
      const payloadObj =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : {};
      const nestedError =
        payloadObj.error && typeof payloadObj.error === "object"
          ? (payloadObj.error as Record<string, unknown>)
          : undefined;
      const code = nestedError?.code ?? payloadObj.code;
      const detail =
        nestedError?.message ??
        payloadObj.detail ??
        payloadObj.message ??
        payloadObj.error;
      const detailObj =
        detail && typeof detail === "object"
          ? (detail as Record<string, unknown>)
          : undefined;
      const detailMessage =
        typeof detail === "string" && detail.trim().length > 0
          ? detail
          : detailObj &&
              typeof detailObj.message === "string" &&
              detailObj.message.trim().length > 0
            ? detailObj.message
            : detailObj &&
                typeof detailObj.detail === "string" &&
                detailObj.detail.trim().length > 0
              ? detailObj.detail
              : detailObj &&
                  typeof detailObj.error === "string" &&
                  detailObj.error.trim().length > 0
                ? detailObj.error
                : null;
      const messageBase =
        detailMessage ?? `Media request failed: ${response.status}`;
      const message =
        typeof code === "string" && code.trim().length > 0
          ? `${code}: ${messageBase}`
          : messageBase;
      throw new MediaRequestError(
        message,
        response.status,
        endpointPath,
        parsed
      );
    }

    return { status: response.status, data: parsed };
  }

  /**
   * Generate image synchronously (with rate limiting)
   */
  async generateImage(
    request: ImageGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    requireTenantScopedMediaRequest(request);
    request = await prepareImageRequestForSafety(request);
    const {
      modelId,
      provider,
      apiConfig: effectiveApiConfig,
      defaultInputParams,
    } = await resolveEffectiveMediaRequestModel({
      mediaType: "image",
      requestedModel: request.model,
      promptText: request.prompt,
      requestedApiConfig: request.apiConfig,
      fallbackModel: DEFAULT_MODELS.image,
    });
    const normalizedPrompt =
      normalizeMediaPrompt(request.prompt) || request.prompt.trim();
    const omitCharacterNegativePrompt =
      shouldOmitCharacterNegativePrompt(request);
    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      size: request.size,
      aspect_ratio: request.aspectRatio,
      n: request.numImages || 1,
      ...(omitCharacterNegativePrompt
        ? {}
        : { negative_prompt: request.negativePrompt }),
    };
    if (request.auditContext?.skillRunId) {
      payload.skill_billing_run_id = request.auditContext.skillRunId;
    }

    // Add resolution if provided (e.g., "1K", "2K", "4K")
    if ((request as any).resolution) {
      payload.resolution = (request as any).resolution;
    }

    // Add output format if provided
    if ((request as any).outputFormat) {
      payload.output_format = (request as any).outputFormat;
    }

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = (request as any).publicUrl as string | undefined;

    // Add extra params from dynamic input fields, layered over the model's own
    // `defaultInputParams` (opt-in — see `readModelDefaultInputParams`; the
    // caller's values always win). Resolve any relative URLs (e.g. image_input
    // with /uploads/... paths).
    const effectiveExtraParams = applyModelDefaultInputParams(
      (request as any).extraParams,
      defaultInputParams
    );
    if (effectiveExtraParams) {
      payload.extra_params = await resolveProviderExtraParamsUrls(
        buildPythonBackendExtraParams(effectiveExtraParams, publicUrl, request.aspectRatio),
        request,
        userToken,
        publicUrl,
      );
    }

    // Add reference images if provided (1-5 images)
    // Convert relative URLs to full URLs for Python backend
    const resolvedReferenceImageUrls = await resolveProviderReferenceUrls(
      resolveReferenceImageUrlsForModel(
      modelId,
      request.referenceImageUrls,
      publicUrl,
      ),
      request,
      userToken,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    const apiConfig = buildApiConfigWithReferenceImageConfig(
      modelId,
      effectiveApiConfig,
      request.referenceImageUrls
    );
    if (apiConfig) {
      payload.api_config = apiConfig;
    }

    // Add reference style if provided
    if (request.referenceStyleUrl) {
      const [resolvedStyleUrl] = await resolveProviderReferenceUrls(
        [request.referenceStyleUrl], request, userToken, publicUrl,
      ) ?? [];
      payload.reference_style_url = resolvedStyleUrl;
    }

    this.logMediaRequest({
      request,
      requestType: "generateImage",
      mediaType: "image",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/image",
      payload,
    });

    // Use rate limiter to prevent overwhelming the API
    try {
      const result = await scheduleMediaWithLimiter(
        provider,
        "image" as RateLimiterMediaType,
        async () => {
          const { data, status } = await this.postJson(
            getPythonMediaToken(request, userToken),
            "/api/v1/media/image",
            payload
          );
          this.logMediaResponse({
            request,
            requestType: "generateImage",
            mediaType: "image",
            provider,
            model: modelId,
            statusCode: status,
            success: true,
            responsePayload: data,
          });
          return this.mapResponse(data);
        }
      );

      // Record successful usage
      recordMediaUsage(
        provider,
        modelId,
        "image" as RateLimiterMediaType,
        true,
        result.creditsUsed
      );
      return result;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateImage",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateImage",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      // Record failed usage
      recordMediaUsage(
        provider,
        modelId,
        "image" as RateLimiterMediaType,
        false,
        0
      );
      throw error;
    }
  }

  /**
   * Generate video synchronously (with rate limiting)
   */
  async generateVideo(
    request: VideoGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    requireTenantScopedMediaRequest(request);
    const {
      modelId,
      provider,
      apiConfig: effectiveApiConfig,
    } = await resolveEffectiveMediaRequestModel({
      mediaType: "video",
      requestedModel: request.model,
      promptText: request.prompt,
      requestedApiConfig: request.apiConfig,
      fallbackModel: DEFAULT_MODELS.video,
    });
    const normalizedPrompt =
      normalizeMediaPrompt(request.prompt) || request.prompt.trim();
    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
    };
    if (request.auditContext?.skillRunId) {
      payload.skill_billing_run_id = request.auditContext.skillRunId;
    }

    // Add resolution if provided (e.g., "720p", "1080p")
    if (request.resolution) {
      payload.resolution = request.resolution;
    }

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = (request as any).publicUrl as string | undefined;

    // Add extra params from dynamic input fields
    // Resolve any relative URLs (e.g., image_input with /uploads/... paths)
    if ((request as any).extraParams) {
      payload.extra_params = await resolveProviderExtraParamsUrls(
        buildPythonBackendExtraParams((request as any).extraParams, publicUrl, request.aspectRatio),
        request,
        userToken,
        publicUrl,
      );
    }

    // Add reference images for img2vid
    // Convert relative URLs to full URLs for Python backend
    const resolvedReferenceImageUrls = await resolveProviderReferenceUrls(
      resolveReferenceImageUrlsForModel(
      modelId,
      request.referenceImageUrls,
      publicUrl,
      ),
      request,
      userToken,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    const apiConfig = buildApiConfigWithReferenceImageConfig(
      modelId,
      effectiveApiConfig,
      request.referenceImageUrls
    );
    if (apiConfig) {
      payload.api_config = apiConfig;
    }

    // Add reference video(s) for vid2vid
    const referenceVideoUrls =
      request.referenceVideoUrls && request.referenceVideoUrls.length > 0
        ? request.referenceVideoUrls
        : request.referenceVideoUrl
          ? [request.referenceVideoUrl]
          : [];
    if (referenceVideoUrls.length > 0) {
      const resolvedVideoUrls = await resolveProviderReferenceUrls(
        referenceVideoUrls.map(url => resolveReferenceUrl(url, publicUrl)),
        request,
        userToken,
        publicUrl,
      ) ?? [];
      payload.reference_video_urls = resolvedVideoUrls;
      payload.reference_video_url = resolvedVideoUrls[0];
    }

    // Add reference audio — minimax-h3 reference-to-video accepts audio clips
    // that the prompt cites by order, alongside the image/video references.
    const referenceAudioUrls = request.referenceAudioUrls ?? [];
    if (referenceAudioUrls.length > 0) {
      payload.reference_audio_urls = await resolveProviderReferenceUrls(
        referenceAudioUrls.map(url => resolveReferenceUrl(url, publicUrl)),
        request,
        userToken,
        publicUrl,
      ) ?? [];
    }

    this.logMediaRequest({
      request,
      requestType: "generateVideo",
      mediaType: "video",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/video",
      payload,
    });

    // Use rate limiter with video priority (lower priority due to resource intensity)
    try {
      const result = await scheduleMediaWithLimiter(
        provider,
        "video" as RateLimiterMediaType,
        async () => {
          const { data, status } = await this.postJson(
            getPythonMediaToken(request, userToken),
            "/api/v1/media/video",
            payload
          );
          this.logMediaResponse({
            request,
            requestType: "generateVideo",
            mediaType: "video",
            provider,
            model: modelId,
            statusCode: status,
            success: true,
            responsePayload: data,
          });
          return this.mapResponse(data);
        }
      );

      recordMediaUsage(
        provider,
        modelId,
        "video" as RateLimiterMediaType,
        true,
        result.creditsUsed
      );
      return result;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateVideo",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateVideo",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(
        provider,
        modelId,
        "video" as RateLimiterMediaType,
        false,
        0
      );
      throw error;
    }
  }

  /**
   * Generate audio synchronously (with rate limiting)
   */
  async generateAudio(
    request: AudioGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    requireTenantScopedMediaRequest(request);
    const {
      modelId,
      provider,
      apiConfig: effectiveApiConfig,
    } = await resolveEffectiveMediaRequestModel({
      mediaType: "audio",
      requestedModel: request.model,
      promptText: request.text,
      requestedApiConfig: request.apiConfig,
      fallbackModel: DEFAULT_MODELS.audio,
    });
    assertValidAudioModelRequest(modelId, request);
    const normalizedExtraParams = normalizeValidAudioModelExtraParams(
      modelId,
      request.extraParams
    );
    assertValidAudioModelExtraParams(modelId, normalizedExtraParams);
    const payload: Record<string, unknown> = {
      text: request.text,
      model: modelId,
      voice: request.voice,
      speed: request.speed,
    };
    if (request.auditContext?.skillRunId) {
      payload.skill_billing_run_id = request.auditContext.skillRunId;
    }

    // Add apiConfig for model-specific endpoints and payload formats
    if (effectiveApiConfig) {
      payload.api_config = effectiveApiConfig;
    }

    // Add extraParams for model-specific fields
    if (normalizedExtraParams) {
      payload.extra_params = await resolveProviderExtraParamsUrls(
        buildPythonBackendExtraParams(normalizedExtraParams, request.publicUrl),
        request,
        userToken,
        request.publicUrl,
      );
    }

    this.logMediaRequest({
      request,
      requestType: "generateAudio",
      mediaType: "audio",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/audio",
      payload,
    });

    try {
      const result = await scheduleMediaWithLimiter(
        provider,
        "audio" as RateLimiterMediaType,
        async () => {
          const { data, status } = await this.postJson(
            getPythonMediaToken(request, userToken),
            "/api/v1/media/audio",
            payload
          );
          this.logMediaResponse({
            request,
            requestType: "generateAudio",
            mediaType: "audio",
            provider,
            model: modelId,
            statusCode: status,
            success: true,
            responsePayload: data,
          });
          return this.mapResponse(data);
        }
      );

      recordMediaUsage(
        provider,
        modelId,
        "audio" as RateLimiterMediaType,
        true,
        result.creditsUsed
      );
      return result;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateAudio",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateAudio",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(
        provider,
        modelId,
        "audio" as RateLimiterMediaType,
        false,
        0
      );
      throw error;
    }
  }

  /**
   * Generate image asynchronously (returns task ID for polling, with rate limiting)
   */
  async generateImageAsync(
    request: ImageGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    requireTenantScopedMediaRequest(request);
    request = await prepareImageRequestForSafety(request);
    const {
      modelId,
      provider,
      apiConfig: effectiveApiConfig,
      defaultInputParams,
    } = isMcpTransportRequest(request)
      ? resolveMcpRequestedMediaModel({ mediaType: "image", request })
      : await resolveEffectiveMediaRequestModel({
          mediaType: "image",
          requestedModel: request.model,
          promptText: request.prompt,
          requestedApiConfig: request.apiConfig,
          fallbackModel: DEFAULT_MODELS.image,
        });
    const normalizedPrompt =
      normalizeMediaPrompt(request.prompt) || request.prompt.trim();
    const omitCharacterNegativePrompt =
      shouldOmitCharacterNegativePrompt(request);
    const mcpTask = await this.submitMcpMediaTaskIfRequested(
      "image",
      request,
      modelId,
      normalizedPrompt
    );
    if (mcpTask) return mcpTask;

    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      size: request.size,
      aspect_ratio: request.aspectRatio,
      n: request.numImages || 1,
      resolution: request.resolution,
      output_format: request.outputFormat,
      ...(omitCharacterNegativePrompt
        ? {}
        : { negative_prompt: request.negativePrompt }),
    };

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = request.publicUrl;

    // Add extraParams for model-specific fields, layered over any provider
    // input fields the model declares as defaults (see
    // `readModelDefaultInputParams` — opt-in; `undefined` leaves this branch
    // byte-identical to before). This is what carries a REQUIRED provider
    // field on a server-initiated generation that never renders Media
    // Studio's dynamic form.
    const effectiveExtraParams = applyModelDefaultInputParams(
      request.extraParams,
      defaultInputParams
    );
    if (effectiveExtraParams) {
      payload.extra_params = await resolveProviderExtraParamsUrls(
        buildPythonBackendExtraParams(effectiveExtraParams, publicUrl, request.aspectRatio),
        request,
        userToken,
        publicUrl,
      );
    }

    // Add reference images if provided (1-5 images)
    const resolvedReferenceImageUrls = await resolveProviderReferenceUrls(
      resolveReferenceImageUrlsForModel(
      modelId,
      request.referenceImageUrls,
      publicUrl,
      ),
      request,
      userToken,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    const apiConfig = buildApiConfigWithReferenceImageConfig(
      modelId,
      effectiveApiConfig,
      request.referenceImageUrls
    );
    if (apiConfig) {
      payload.api_config = apiConfig;
    }

    // Add reference style if provided
    if (request.referenceStyleUrl) {
      const [resolvedStyleUrl] = await resolveProviderReferenceUrls(
        [request.referenceStyleUrl],
        request,
        userToken,
        publicUrl,
      ) ?? [];
      payload.reference_style_url = resolvedStyleUrl;
    }

    this.logMediaRequest({
      request,
      requestType: "generateImageAsync",
      mediaType: "image",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/async/image",
      payload,
    });

    try {
      const { data, status } = await this.submitTaskWithRetry({
        request,
        requestType: "generateImageAsync",
        mediaType: "image",
        provider,
        model: modelId,
        endpoint: "/api/v1/media/async/image",
        userToken,
        payload,
      });
      this.logMediaResponse({
        request,
        requestType: "generateImageAsync",
        mediaType: "image",
        provider,
        model: modelId,
        statusCode: status,
        success: true,
        responsePayload: data,
      });
      const task = this.mapTask(data);

      // Record task submission (actual completion tracked separately)
      recordMediaUsage(
        provider,
        modelId,
        "image" as RateLimiterMediaType,
        true,
        0
      );
      return task;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateImageAsync",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateImageAsync",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(
        provider,
        modelId,
        "image" as RateLimiterMediaType,
        false,
        0
      );
      throw error;
    }
  }

  /**
   * Generate video asynchronously (returns task ID for polling, with rate limiting)
   */
  async generateVideoAsync(
    request: VideoGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    requireTenantScopedMediaRequest(request);
    const {
      modelId,
      provider,
      apiConfig: effectiveApiConfig,
    } = isMcpTransportRequest(request)
      ? resolveMcpRequestedMediaModel({ mediaType: "video", request })
      : await resolveEffectiveMediaRequestModel({
          mediaType: "video",
          requestedModel: request.model,
          promptText: request.prompt,
          requestedApiConfig: request.apiConfig,
          fallbackModel: DEFAULT_MODELS.video,
        });
    const normalizedPrompt =
      normalizeMediaPrompt(request.prompt) || request.prompt.trim();
    const mcpTask = await this.submitMcpMediaTaskIfRequested(
      "video",
      request,
      modelId,
      normalizedPrompt
    );
    if (mcpTask) return mcpTask;

    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
      resolution: request.resolution,
    };
    if (request.auditContext?.skillRunId) {
      payload.skill_billing_run_id = request.auditContext.skillRunId;
    }

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = request.publicUrl;

    // Add reference images for img2vid
    const resolvedReferenceImageUrls = await resolveProviderReferenceUrls(
      resolveReferenceImageUrlsForModel(
        modelId,
        request.referenceImageUrls,
        publicUrl,
        request.preserveReferenceOrder === true,
      ),
      request,
      userToken,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    // Add reference video(s) for vid2vid
    const referenceVideoUrls =
      request.referenceVideoUrls && request.referenceVideoUrls.length > 0
        ? request.referenceVideoUrls
        : request.referenceVideoUrl
          ? [request.referenceVideoUrl]
          : [];
    if (referenceVideoUrls.length > 0) {
      const resolvedVideoUrls = await resolveProviderReferenceUrls(
        referenceVideoUrls.map(url => resolveReferenceUrl(url, publicUrl)),
        request,
        userToken,
        publicUrl,
      ) ?? [];
      payload.reference_video_urls = resolvedVideoUrls;
      payload.reference_video_url = resolvedVideoUrls[0];
    }

    // Add reference audio — minimax-h3 reference-to-video accepts audio clips
    // that the prompt cites by order, alongside the image/video references.
    const referenceAudioUrls = request.referenceAudioUrls ?? [];
    if (referenceAudioUrls.length > 0) {
      payload.reference_audio_urls = await resolveProviderReferenceUrls(
        referenceAudioUrls,
        request,
        userToken,
        publicUrl,
      ) ?? [];
    }

    // Add apiConfig for model-specific endpoints and payload formats (e.g., Veo 3)
    if (effectiveApiConfig) {
      payload.api_config = effectiveApiConfig;
    }

    // Add extraParams for additional model-specific parameters
    if (request.extraParams) {
      payload.extra_params = await resolveProviderExtraParamsUrls(
        buildPythonBackendExtraParams(request.extraParams, publicUrl, request.aspectRatio),
        request,
        userToken,
        publicUrl,
      );
    }

    this.logMediaRequest({
      request,
      requestType: "generateVideoAsync",
      mediaType: "video",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/async/video",
      payload,
    });

    try {
      const { data, status } = await this.submitTaskWithRetry({
        request,
        requestType: "generateVideoAsync",
        mediaType: "video",
        provider,
        model: modelId,
        endpoint: "/api/v1/media/async/video",
        userToken,
        payload,
      });
      this.logMediaResponse({
        request,
        requestType: "generateVideoAsync",
        mediaType: "video",
        provider,
        model: modelId,
        statusCode: status,
        success: true,
        responsePayload: data,
      });
      const task = this.mapTask(data);

      recordMediaUsage(
        provider,
        modelId,
        "video" as RateLimiterMediaType,
        true,
        0
      );
      return task;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateVideoAsync",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateVideoAsync",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(
        provider,
        modelId,
        "video" as RateLimiterMediaType,
        false,
        0
      );
      throw error;
    }
  }

  /**
   * Generate audio asynchronously (returns task ID for polling, with rate limiting)
   */
  async generateAudioAsync(
    request: AudioGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    requireTenantScopedMediaRequest(request);
    const {
      modelId,
      provider,
      apiConfig: effectiveApiConfig,
    } = await resolveEffectiveMediaRequestModel({
      mediaType: "audio",
      requestedModel: request.model,
      promptText: request.text,
      requestedApiConfig: request.apiConfig,
      fallbackModel: DEFAULT_MODELS.audio,
    });
    assertValidAudioModelRequest(modelId, request);
    const normalizedExtraParams = normalizeValidAudioModelExtraParams(
      modelId,
      request.extraParams
    );
    assertValidAudioModelExtraParams(modelId, normalizedExtraParams);
    const payload: Record<string, unknown> = {
      text: request.text,
      model: modelId,
      voice: request.voice,
      speed: request.speed,
    };

    // Add apiConfig for model-specific endpoints and payload formats
    if (effectiveApiConfig) {
      payload.api_config = effectiveApiConfig;
    }

    // Add extraParams for model-specific fields
    if (normalizedExtraParams) {
      payload.extra_params = await resolveProviderExtraParamsUrls(
        buildPythonBackendExtraParams(normalizedExtraParams, request.publicUrl),
        request,
        userToken,
        request.publicUrl,
      );
    }

    this.logMediaRequest({
      request,
      requestType: "generateAudioAsync",
      mediaType: "audio",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/async/audio",
      payload,
    });

    try {
      const { data, status } = await this.submitTaskWithRetry({
        request,
        requestType: "generateAudioAsync",
        mediaType: "audio",
        provider,
        model: modelId,
        endpoint: "/api/v1/media/async/audio",
        userToken,
        payload,
      });
      this.logMediaResponse({
        request,
        requestType: "generateAudioAsync",
        mediaType: "audio",
        provider,
        model: modelId,
        statusCode: status,
        success: true,
        responsePayload: data,
      });
      const task = this.mapTask(data);

      recordMediaUsage(
        provider,
        modelId,
        "audio" as RateLimiterMediaType,
        true,
        0
      );
      return task;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateAudioAsync",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateAudioAsync",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(
        provider,
        modelId,
        "audio" as RateLimiterMediaType,
        false,
        0
      );
      throw error;
    }
  }

  /**
   * Get task status by ID
   */
  async getTask(
    taskId: string,
    userToken: string,
    auditContext?: MediaAuditContext
  ): Promise<MediaTask> {
    auditLogger.log({
      traceId:
        typeof auditContext?.traceId === "string"
          ? auditContext.traceId
          : undefined,
      eventType: "media_request",
      userId:
        typeof auditContext?.userId === "number" ? auditContext.userId : null,
      requestType: "getTask",
      mediaTaskId: taskId,
      requestPayload: {
        source: auditContext?.source ?? "media_generation_service",
        endpoint: `/api/v1/media/tasks/${taskId}`,
      },
    });

    if (isHermesMediaTaskId(taskId)) {
      const userId =
        typeof auditContext?.userId === "number" ? auditContext.userId : null;
      if (!userId) {
        throw new Error(
          "Hermes media task polling requires authenticated user context"
        );
      }
      const task = await getHermesMediaTask(taskId, userId, {
        tenantId: typeof auditContext?.tenantId === "string" ? auditContext.tenantId : undefined,
      });
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      auditLogger.log({
        traceId:
          typeof auditContext?.traceId === "string"
            ? auditContext.traceId
            : undefined,
        eventType: "media_response",
        userId,
        requestType: "getTask",
        mediaTaskId: taskId,
        statusCode: 200,
        responsePayload: {
          transport: "hermes_worker",
          status: task.status,
          mediaType: task.mediaType,
        },
      });
      return await durabilizeCompletedMediaTask(task, auditContext);
    }

    if (taskId.startsWith("mcp_")) {
      const userId =
        typeof auditContext?.userId === "number" ? auditContext.userId : null;
      if (!userId) {
        throw new Error("MCP task polling requires authenticated user context");
      }
      const task = await getMcpMediaTask(
        taskId,
        userId,
        typeof auditContext?.tenantId === "string" ? auditContext.tenantId : undefined,
      );
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      auditLogger.log({
        traceId:
          typeof auditContext?.traceId === "string"
            ? auditContext.traceId
            : undefined,
        eventType: "media_response",
        userId,
        requestType: "getTask",
        mediaTaskId: taskId,
        statusCode: 200,
        responsePayload: {
          transport: "mcp",
          status: task.status,
          mediaType: task.mediaType,
        },
      });
      return await durabilizeCompletedMediaTask(task, auditContext);
    }

    const response = await fetch(
      `${this.baseUrl}/api/v1/media/tasks/${taskId}`,
      {
        method: "GET",
        headers: this.getHeaders(userToken),
      }
    );

    const rawText = await response.text().catch(() => "");
    let parsed: unknown;
    if (!rawText) {
      parsed = {};
    } else {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { raw: rawText.slice(0, 2000) };
      }
    }

    if (!response.ok) {
      const detail = (parsed as Record<string, unknown> | null)?.detail;
      const errorMessage =
        typeof detail === "string" && detail.trim().length > 0
          ? detail
          : `Get task failed: ${response.status}`;
      auditLogger.log({
        traceId:
          typeof auditContext?.traceId === "string"
            ? auditContext.traceId
            : undefined,
        eventType: "media_response",
        userId:
          typeof auditContext?.userId === "number" ? auditContext.userId : null,
        requestType: "getTask",
        mediaTaskId: taskId,
        statusCode: response.status,
        errorType: "media_task_fetch_failed",
        errorMessage: errorMessage.slice(0, 500),
        responsePayload: parsed,
      });
      throw new Error(errorMessage);
    }

    auditLogger.log({
      traceId:
        typeof auditContext?.traceId === "string"
          ? auditContext.traceId
          : undefined,
      eventType: "media_response",
      userId:
        typeof auditContext?.userId === "number" ? auditContext.userId : null,
      requestType: "getTask",
      mediaTaskId: taskId,
      statusCode: response.status,
      responsePayload: parsed,
    });
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid task payload");
    }
    return await durabilizeCompletedMediaTask(
      this.mapTask(parsed as Record<string, unknown>),
      auditContext,
    );
  }

  /**
   * List user's tasks
   */
  async listTasks(
    userToken: string,
    options?: {
      mediaType?: MediaType;
      status?: TaskStatus;
      limit?: number;
      offset?: number;
      daysAgo?: number;
    }
  ): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    if (options?.mediaType) params.append("media_type", options.mediaType);
    if (options?.status) params.append("status_filter", options.status);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.offset) params.append("offset", options.offset.toString());
    if (options?.daysAgo) params.append("days_ago", options.daysAgo.toString());

    const url = `${this.baseUrl}/api/v1/media/tasks${params.toString() ? `?${params}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(userToken),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `List tasks failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      tasks: (data.tasks || []).map((t: Record<string, unknown>) =>
        this.mapTask(t)
      ),
      total: data.total || 0,
      limit: data.limit || 50,
      offset: data.offset || 0,
    };
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, userToken: string): Promise<MediaTask> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/media/tasks/${taskId}/cancel`,
      {
        method: "PATCH",
        headers: this.getHeaders(userToken),
      }
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `Cancel task failed: ${response.status}`);
    }

    const data = await response.json();
    return this.mapTask(data.task);
  }

  /**
   * Get available models
   */
  getModels(type?: MediaType): ModelMetadata[] {
    const models = Object.values(MEDIA_MODELS);
    if (type) {
      return models.filter(m => m.type === type);
    }
    return models;
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): ModelMetadata | undefined {
    return MEDIA_MODELS[modelId];
  }

  /**
   * Map Python backend response to our format
   */
  private mapResponse(data: Record<string, unknown>): MediaGenerationResponse {
    return {
      success: true,
      data: (data.data as MediaGenerationResult[]) || [],
      creditsUsed: (data.credits_used as number) || 0,
      creditsBalance: (data.credits_balance as number) || 0,
      model: (data.model as string) || "",
    };
  }

  private extractTaskErrorMessage(
    data: Record<string, unknown>
  ): string | undefined {
    const directError = data.error_message;
    if (typeof directError === "string" && directError.trim()) {
      return directError.trim();
    }

    const resultData = data.result_data;
    if (!resultData || typeof resultData !== "object") {
      return undefined;
    }

    const seen = new Set<string>();
    const messages: string[] = [];
    const enqueue = (value: unknown) => {
      if (typeof value !== "string") return;
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      messages.push(normalized);
    };

    const extract = (value: unknown, depth: number) => {
      if (depth > 5 || value === null || value === undefined) return;
      if (typeof value === "string") {
        enqueue(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(item => extract(item, depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      const obj = value as Record<string, unknown>;

      // Prioritized keys commonly used by providers.
      const priorityKeys = [
        "error",
        "errorMessage",
        "failMsg",
        "message",
        "msg",
        "detail",
        "reason",
      ];
      for (const key of priorityKeys) {
        if (key in obj) {
          extract(obj[key], depth + 1);
        }
      }

      // Traverse common nested containers.
      const nestedKeys = [
        "data",
        "response",
        "submission",
        "output",
        "result",
        "resultJson",
        "kie_ai_response",
        "raw_response",
      ];
      for (const key of nestedKeys) {
        if (key in obj) {
          extract(obj[key], depth + 1);
        }
      }
    };

    extract(resultData, 0);
    return messages[0];
  }

  /**
   * Map Python backend task to our format
   */
  mapTask(data: Record<string, unknown>): MediaTask {
    const resultData = data.result_data as Record<string, unknown> | undefined;
    const resultUrl =
      typeof data.result_url === "string" && data.result_url.trim()
        ? data.result_url.trim()
        : findMediaResultUrl(resultData);
    return {
      id: data.id as string,
      taskId: data.task_id as string | undefined, // External provider task ID (e.g., Kie.ai)
      celeryTaskId: data.celery_task_id as string | undefined,
      userId: data.user_id as string,
      mediaType: data.media_type as MediaType,
      status: data.status as TaskStatus,
      model: data.model as string,
      prompt: normalizeMediaPrompt(data.prompt),
      parameters: data.parameters as Record<string, unknown>,
      ...(resultUrl ? { resultUrl } : {}),
      resultData,
      errorMessage: this.extractTaskErrorMessage(data),
      creditsUsed: data.credits_used as number,
      creditsBalance: data.credits_balance as number,
      createdAt: data.created_at as string,
      startedAt: data.started_at as string,
      completedAt: data.completed_at as string,
    };
  }
}

// Export singleton instance
export const mediaGenerationService = new MediaGenerationService();
