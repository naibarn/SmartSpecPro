export const WAVESPEED_PROVIDER = "wavespeed_ai";
export const WAVESPEED_LAUNCH_MODEL_ID = "wavespeed-ai/cinematic-video-generator";
export const WAVESPEED_LAUNCH_MODEL_NAME = "Seedance 2.0 Grade Cinematic Video Generator";
export const WAVESPEED_LAUNCH_MODEL_DESCRIPTION =
  "WaveSpeed Seedance 2.0 cinematic video generation with optional image guidance and native audio.";
export const WAVESPEED_ALLOWED_DURATIONS = [5, 10, 15] as const;
export const WAVESPEED_ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4"] as const;
export const WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"] as const;
export const WAVESPEED_MAX_REFERENCE_IMAGES = 4;
export const WAVESPEED_PRICING_TIERS = {
  "5s": 800,
  "10s": 1600,
  "15s": 2400,
} as const;
export const WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS = {
  "5s": 900,
  "10s": 1800,
  "15s": 2700,
} as const;
export const WAVESPEED_SEEDANCE_FAST_PRICING_TIERS = {
  "5s": 600,
  "10s": 1200,
  "15s": 1800,
} as const;
export const WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0-fast/text-to-video";
export const WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0-fast/image-to-video";
export const WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0/text-to-video";
export const WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID = "bytedance/seedance-2.0/image-to-video";

const ALLOWED_RELATIVE_MEDIA_REFERENCE_PREFIXES = [
  "/uploads/",
  "/api/storage/files/",
] as const;

export type WaveSpeedLaunchModelSeed = {
  modelId: string;
  name: string;
  description: string;
  modelType: "video";
  provider: string;
  aliases: string[];
  creditCost: number;
  aspectRatios: string[];
  durations: number[];
  priority: number;
  sortOrder: number;
  isEnabled: boolean;
  configJson: Record<string, unknown>;
};

export type WaveSpeedModelSeed = WaveSpeedLaunchModelSeed;

type WaveSpeedGenerateType = "text-to-video" | "image-to-video";
type WaveSpeedModelDefinition = {
  modelId: string;
  name: string;
  description: string;
  aliases: string[];
  submitEndpoint: string;
  generateType: WaveSpeedGenerateType;
  pricingTiers: Record<string, number>;
  aspectRatios: readonly string[];
  durations: readonly number[];
  maxReferenceImages: number;
  referenceImagesRequired: boolean;
  nativeAudio: boolean;
  priority: number;
  sortOrder: number;
};

type ModelInputFieldRecord = Record<string, unknown>;
type PublicUrlValidationOptions = {
  requireHttps?: boolean;
};

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[::1?\]$/,
  /^::1$/,
  /^::ffff:127\./i,
  /^fe80:/i,
  /^fd[0-9a-f]{2}:/i,
  /^host\.docker\.internal$/i,
  /\.internal$/i,
  /\.local$/i,
];

const WAVESPEED_MODEL_DEFINITIONS: readonly WaveSpeedModelDefinition[] = [
  {
    modelId: WAVESPEED_LAUNCH_MODEL_ID,
    name: WAVESPEED_LAUNCH_MODEL_NAME,
    description: WAVESPEED_LAUNCH_MODEL_DESCRIPTION,
    aliases: [
      "wavespeed cinematic video generator",
      "wavespeed-ai cinematic video generator",
      "wavespeedai cinematic video generator",
      "seedance 2.0 grade cinematic video generator",
      "wavespeed_ai/cinematic-video-generator",
    ],
    submitEndpoint: "/wavespeed-ai/cinematic-video-generator",
    generateType: "text-to-video",
    pricingTiers: { ...WAVESPEED_PRICING_TIERS },
    aspectRatios: WAVESPEED_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: false,
    nativeAudio: true,
    priority: 6,
    sortOrder: 60,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_TEXT_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Text-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 text-to-video generation with native audio and optional reference-image guidance.",
    aliases: [
      "seedance 2.0 text to video",
      "seedance 2 text to video",
      "seedance 2.0 t2v",
      "bytedance seedance 2.0 text to video",
      "bytedance/seedance-2.0/text-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0/text-to-video",
    generateType: "text-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: false,
    nativeAudio: true,
    priority: 7,
    sortOrder: 61,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_IMAGE_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Image-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 image-to-video generation with required reference images and native audio.",
    aliases: [
      "seedance 2.0 image to video",
      "seedance 2 image to video",
      "seedance 2.0 i2v",
      "bytedance seedance 2.0 image to video",
      "bytedance/seedance-2.0/image-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0/image-to-video",
    generateType: "image-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_STANDARD_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: true,
    nativeAudio: true,
    priority: 8,
    sortOrder: 62,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_FAST_TEXT_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Fast Text-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 Fast text-to-video generation optimized for faster turnaround and lower cost.",
    aliases: [
      "seedance 2.0 fast text to video",
      "seedance 2 fast text to video",
      "seedance 2.0 fast t2v",
      "bytedance seedance 2.0 fast text to video",
      "bytedance/seedance-2.0-fast/text-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0-fast/text-to-video",
    generateType: "text-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_FAST_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: false,
    nativeAudio: true,
    priority: 9,
    sortOrder: 63,
  },
  {
    modelId: WAVESPEED_SEEDANCE_2_FAST_IMAGE_TO_VIDEO_MODEL_ID,
    name: "Seedance 2.0 Fast Image-to-Video",
    description: "WaveSpeed ByteDance Seedance 2.0 Fast image-to-video generation with required reference images, native audio, and faster turnaround.",
    aliases: [
      "seedance 2.0 fast image to video",
      "seedance 2 fast image to video",
      "seedance 2.0 fast i2v",
      "bytedance seedance 2.0 fast image to video",
      "bytedance/seedance-2.0-fast/image-to-video",
    ],
    submitEndpoint: "/bytedance/seedance-2.0-fast/image-to-video",
    generateType: "image-to-video",
    pricingTiers: { ...WAVESPEED_SEEDANCE_FAST_PRICING_TIERS },
    aspectRatios: WAVESPEED_SEEDANCE_ALLOWED_ASPECT_RATIOS,
    durations: WAVESPEED_ALLOWED_DURATIONS,
    maxReferenceImages: WAVESPEED_MAX_REFERENCE_IMAGES,
    referenceImagesRequired: true,
    nativeAudio: true,
    priority: 10,
    sortOrder: 64,
  },
] as const;

function decodeUrlPathForValidation(value: string, label: string): string {
  let decoded = value;

  for (let idx = 0; idx < 2; idx += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      throw new Error(`${label} contains invalid percent-encoding`);
    }
  }

  return decoded;
}

function getWaveSpeedModelDefinition(modelId: string): WaveSpeedModelDefinition | undefined {
  return WAVESPEED_MODEL_DEFINITIONS.find((definition) => definition.modelId === modelId);
}

function requireWaveSpeedModelDefinition(modelId: string): WaveSpeedModelDefinition {
  return getWaveSpeedModelDefinition(modelId)
    ?? getWaveSpeedModelDefinition(WAVESPEED_LAUNCH_MODEL_ID)
    ?? WAVESPEED_MODEL_DEFINITIONS[0]!;
}

function buildWaveSpeedInputFields(definition: WaveSpeedModelDefinition): ModelInputFieldRecord[] {
  return [
    {
      key: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
      syncWith: "prompt",
    },
    {
      key: "image_urls",
      label: definition.referenceImagesRequired ? "Start / Reference Images" : "Reference Images",
      type: "image_urls",
      required: definition.referenceImagesRequired,
      syncWith: "reference_images",
      maxItems: definition.maxReferenceImages,
    },
    {
      key: "aspect_ratio",
      label: "Aspect Ratio",
      type: "select",
      required: true,
      syncWith: "aspect_ratio",
      default: definition.aspectRatios[0],
      options: definition.aspectRatios.map((value) => ({ value, label: value })),
    },
    {
      key: "duration",
      label: "Duration",
      type: "select",
      required: true,
      default: String(definition.durations[0]),
      affectsPricing: true,
      options: definition.durations.map((value) => ({ value: String(value), label: `${value}s` })),
    },
  ];
}

export function normalizeMediaProviderName(providerName: string | null | undefined): string {
  const normalized = String(providerName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");

  if (!normalized) {
    return "";
  }
  if (normalized === "kie" || normalized === "kie_ai" || normalized === "kieai") {
    return "kie_ai";
  }
  if (normalized === "uvoice" || normalized === "u_voice" || normalized === "uvoice_ai" || normalized === "uvoiceapp") {
    return "uvoice";
  }
  if (
    normalized === "byteplus"
    || normalized === "modelark"
    || normalized === "byteplus_modelark"
    || normalized === "byteplus_model_ark"
  ) {
    return "byteplus_modelark";
  }
  if (normalized === "knplabs" || normalized === "knplabai" || normalized === "knplabs_ai" || normalized === "knplabsai") {
    return "knplabai";
  }
  if (normalized === "wavespeed_ai" || normalized === "wavespeedai") {
    return WAVESPEED_PROVIDER;
  }
  return normalized;
}

export function isPublicSafeHttpUrl(value: string, options?: PublicUrlValidationOptions): boolean {
  try {
    assertPublicSafeHttpUrl(value, "URL", options);
    return true;
  } catch {
    return false;
  }
}

export function assertPublicSafeHttpUrl(
  value: string,
  label = "URL",
  options?: PublicUrlValidationOptions,
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid http(s) URL`);
  }

  if (options?.requireHttps) {
    if (parsed.protocol !== "https:") {
      throw new Error(`${label} must use https`);
    }
  } else if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https`);
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname || PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error(`${label} must point to a public host`);
  }
}

export function normalizePersistedMediaProviderBaseUrl(
  providerName: string,
  baseUrl: string | null | undefined,
): string | null | undefined {
  if (baseUrl == null) {
    return baseUrl;
  }

  const trimmed = String(baseUrl).trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalizedProviderName = normalizeMediaProviderName(providerName);
  const normalizedUrl = normalizedProviderName === WAVESPEED_PROVIDER
    ? normalizeWaveSpeedBaseUrl(trimmed)
    : new URL(trimmed).toString().replace(/\/$/, "");

  assertPublicSafeHttpUrl(normalizedUrl, "Provider base URL", { requireHttps: true });
  return normalizedUrl;
}

export function assertRelativeUploadMediaReferencePath(value: string, label = "Reference URL"): void {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }

  const decoded = decodeUrlPathForValidation(trimmed, label);
  if (decoded.includes("..")) {
    throw new Error(`${label} may not contain '..'`);
  }

  const normalized = decoded.startsWith("/") ? decoded : `/${decoded}`;
  if (!ALLOWED_RELATIVE_MEDIA_REFERENCE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error(
      `${label} must reference a file under /uploads/ or /api/storage/files/`,
    );
  }
}

export function normalizeWaveSpeedBaseUrl(baseUrl: string | null | undefined): string {
  const rawValue = String(baseUrl ?? "").trim() || "https://api.wavespeed.ai";
  const parsed = new URL(rawValue);
  const pathname = parsed.pathname.replace(/\/+$/, "");

  if (!pathname || pathname === "/") {
    parsed.pathname = "/api/v3";
  } else if (pathname.endsWith("/api/v3")) {
    parsed.pathname = pathname;
  } else {
    parsed.pathname = `${pathname}/api/v3`;
  }

  return parsed.toString().replace(/\/$/, "");
}

export function normalizeRelativeMediaEndpointPath(
  rawValue: string,
  options?: { allowRequestIdPlaceholder?: boolean },
): string {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    throw new Error("Endpoint path is required");
  }
  const decoded = decodeUrlPathForValidation(trimmed, "Endpoint path");

  if (/^https?:\/\//i.test(decoded) || decoded.startsWith("//")) {
    throw new Error("Endpoint paths must be relative URLs");
  }
  if (decoded.includes("..")) {
    throw new Error("Endpoint paths may not contain '..'");
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalizedDecoded = decoded.startsWith("/") ? decoded : `/${decoded}`;
  const placeholders = Array.from(normalizedDecoded.matchAll(/\{([^{}]+)\}/g), (match) => match[1]?.trim()).filter(Boolean);
  const allowedPlaceholders = new Set<string>(options?.allowRequestIdPlaceholder ? ["requestId"] : []);

  for (const placeholder of placeholders) {
    if (!allowedPlaceholders.has(placeholder)) {
      throw new Error(`Unsupported endpoint placeholder {${placeholder}}`);
    }
  }

  return normalized;
}

export function sanitizeMediaModelConfigJson(
  configJson: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!configJson || typeof configJson !== "object" || Array.isArray(configJson)) {
    return configJson;
  }

  const next: Record<string, unknown> = { ...configJson };
  if (typeof next.apiEndpoint === "string") {
    next.apiEndpoint = normalizeRelativeMediaEndpointPath(next.apiEndpoint);
  }
  if (typeof next.apiQueryEndpoint === "string") {
    next.apiQueryEndpoint = normalizeRelativeMediaEndpointPath(next.apiQueryEndpoint, {
      allowRequestIdPlaceholder: true,
    });
  }

  const apiConfig = next.apiConfig;
  if (apiConfig && typeof apiConfig === "object" && !Array.isArray(apiConfig)) {
    const apiConfigRecord = { ...(apiConfig as Record<string, unknown>) };
    if (typeof apiConfigRecord.provider === "string") {
      apiConfigRecord.provider = normalizeMediaProviderName(apiConfigRecord.provider);
    }
    next.apiConfig = apiConfigRecord;
  }

  return next;
}

function getConfigInputFields(configJson: unknown): ModelInputFieldRecord[] {
  return Array.isArray((configJson as { inputFields?: unknown } | null | undefined)?.inputFields)
    ? (((configJson as { inputFields?: unknown }).inputFields as unknown[]) as ModelInputFieldRecord[])
    : [];
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function getReferenceImageField(configJson: unknown): ModelInputFieldRecord | undefined {
  return getConfigInputFields(configJson).find((field) => {
    const rawType = String(field.type ?? "").trim().toLowerCase();
    const rawSyncWith = String(field.syncWith ?? "").trim().toLowerCase();
    if (rawSyncWith === "reference_images") {
      return true;
    }
    if (rawType !== "image_urls") {
      return false;
    }
    const normalizedKey = String(field.key ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    return normalizedKey.includes("image");
  });
}

export function isReferenceImageRequiredFromConfig(configJson: unknown): boolean {
  const field = getReferenceImageField(configJson);
  return Boolean(field?.required)
    || Boolean((configJson as Record<string, unknown> | null | undefined)?.requiresReferenceImages);
}

export function getReferenceImageLimitFromConfig(configJson: unknown): number | null {
  const field = getReferenceImageField(configJson);
  if (!field) {
    return null;
  }

  return (
    parsePositiveInteger(field.maxItems)
    ?? parsePositiveInteger(field.maxImages)
    ?? parsePositiveInteger(field.maxCount)
    ?? parsePositiveInteger((configJson as Record<string, unknown> | null | undefined)?.maxReferenceImages)
  );
}

export function getAllowedAspectRatiosFromConfig(
  configJson: unknown,
  fallback: readonly string[] = [],
): string[] {
  const field = getConfigInputFields(configJson).find((entry) => String(entry.key ?? "").trim() === "aspect_ratio");
  if (field && Array.isArray(field.options)) {
    const values = field.options
      .map((option) => {
        if (!option || typeof option !== "object") {
          return null;
        }
        const value = String((option as Record<string, unknown>).value ?? "").trim();
        return value || null;
      })
      .filter((value): value is string => Boolean(value));
    if (values.length > 0) {
      return values;
    }
  }
  return [...fallback];
}

export function getAllowedDurationsFromConfig(
  configJson: unknown,
  fallback: readonly number[] = [],
): number[] {
  const field = getConfigInputFields(configJson).find((entry) => String(entry.key ?? "").trim() === "duration");
  if (field && Array.isArray(field.options)) {
    const values = field.options
      .map((option) => {
        if (!option || typeof option !== "object") {
          return null;
        }
        return parsePositiveInteger((option as Record<string, unknown>).value);
      })
      .filter((value): value is number => value !== null);
    if (values.length > 0) {
      return values;
    }
  }
  return [...fallback];
}

export function buildWaveSpeedModelConfigJson(modelId: string): Record<string, unknown> {
  const definition = requireWaveSpeedModelDefinition(modelId);
  return sanitizeMediaModelConfigJson({
    apiPayloadFormat: "wavespeed",
    generateType: definition.generateType,
    providerModelId: definition.modelId,
    apiEndpoint: definition.submitEndpoint,
    apiQueryEndpoint: "/predictions/{requestId}/result",
    pricingFormula: "per_duration",
    pricingTiers: { ...definition.pricingTiers },
    nativeAudio: definition.nativeAudio,
    useSyncMode: false,
    supportsReferenceImages: definition.maxReferenceImages > 0,
    requiresReferenceImages: definition.referenceImagesRequired,
    maxReferenceImages: definition.maxReferenceImages,
    inputFields: buildWaveSpeedInputFields(definition),
    apiConfig: {
      provider: WAVESPEED_PROVIDER,
      provider_model_id: definition.modelId,
      generate_type: definition.generateType,
      use_sync_mode: false,
    },
  }) as Record<string, unknown>;
}

export function buildWaveSpeedLaunchModelConfigJson(): Record<string, unknown> {
  return buildWaveSpeedModelConfigJson(WAVESPEED_LAUNCH_MODEL_ID);
}

export function buildWaveSpeedModelSeed(modelId: string): WaveSpeedModelSeed {
  const definition = requireWaveSpeedModelDefinition(modelId);
  return {
    modelId: definition.modelId,
    name: definition.name,
    description: definition.description,
    modelType: "video",
    provider: WAVESPEED_PROVIDER,
    aliases: [...definition.aliases],
    creditCost: definition.pricingTiers["5s"] ?? WAVESPEED_PRICING_TIERS["5s"],
    aspectRatios: [...definition.aspectRatios],
    durations: [...definition.durations],
    priority: definition.priority,
    sortOrder: definition.sortOrder,
    isEnabled: true,
    configJson: buildWaveSpeedModelConfigJson(definition.modelId),
  };
}

export function buildWaveSpeedLaunchModelSeed(): WaveSpeedLaunchModelSeed {
  return buildWaveSpeedModelSeed(WAVESPEED_LAUNCH_MODEL_ID);
}

export function buildWaveSpeedModelSeeds(): WaveSpeedModelSeed[] {
  return WAVESPEED_MODEL_DEFINITIONS.map((definition) => buildWaveSpeedModelSeed(definition.modelId));
}

export function getWaveSpeedProviderAvailableModels(): Array<{
  id: string;
  name: string;
  type: "video";
  description: string;
}> {
  return WAVESPEED_MODEL_DEFINITIONS.map((definition) => ({
    id: definition.modelId,
    name: definition.name,
    type: "video",
    description: definition.description,
  }));
}
