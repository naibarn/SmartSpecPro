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
import { calculateCreditCost } from "./pricingCalculator";
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

  /**
   * Video-only capability metadata (Vertical Drama Storyboard plan, Phase 0).
   * These are explicit, first-class flags — previously some of this had to be
   * inferred ad-hoc from `configJson` (e.g. `configJson.apiPayloadFormat ===
   * "veo"` or scanning `inputFields` for `FIRST_AND_LAST_FRAMES_2_VIDEO`).
   * Optional so every existing model definition (and every DB row that
   * predates this field) keeps working unchanged; `dbModelToDefinition`
   * back-fills these from `configJson` for DB-backed rows (see below) so admin
   * imports/edits do not need a schema migration to carry this metadata.
   */
  /** Model accepts a start-frame / first-frame (image-to-video or first+last-frame bridge) input. */
  supportsStartFrame?: boolean;

  /** Max number of reference images the model accepts in one generation call (0 = none). */
  maxReferenceImages?: number;

  /** Model can embed spoken dialogue directly in the video (native audio + lip sync), vs requiring separate TTS. */
  nativeAudioDialogue?: boolean;

  /**
   * Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt option,
   * added 2026-07-09) — true when this model's OWN metadata/description
   * verifies it generates synchronized audio natively as part of the
   * rendered clip (ambient soundscape + SFX, directed via the video prompt
   * text — never dialogue/music, which stay owned by the TTS and BGM layers
   * respectively; see `skills/vertical-drama-shot-video-prompt/skill.md`'s
   * "NATIVE AUDIO DIRECTION" section). Deliberately mirrors
   * `nativeAudioDialogue` (both are driven by the exact same underlying
   * technical fact — "this model renders audio in-clip, not just video" —
   * whether the caller then directs that audio channel toward speech or
   * toward ambience/SFX is a PROMPTING choice, not a separate model
   * capability) rather than being derived independently, so every model
   * verified to support native lip-synced dialogue also carries this flag;
   * `undefined`/`false` for any model this catalog cannot verify generates
   * native audio at all. Optional so every pre-existing definition (and
   * every DB row that predates this field) keeps working unchanged, exactly
   * like the other Vertical Drama capability flags above.
   */
  supportsNativeAudio?: boolean;

  /** Model has 9:16 + video quality sufficient for Vertical Drama Series episode rendering. */
  verticalDramaReady?: boolean;
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

/**
 * Derive the 5 Vertical Drama capability flags (`supportsStartFrame`,
 * `maxReferenceImages`, `nativeAudioDialogue`, `supportsNativeAudio`,
 * `verticalDramaReady`) from a model's already-known
 * type/aspectRatios/configJson, ONLY for entries that don't set them
 * explicitly below. Centralizing this keeps every video model — including
 * future ones — consistent, and lets `dbModelToDefinition` reuse the exact
 * same derivation for DB-backed rows (so admin-imported/edited models get
 * sensible capability badges without needing a manual DB edit).
 */
export function deriveVerticalDramaCapabilities(model: {
  type: MediaType;
  aspectRatios?: string[];
  configJson?: Record<string, any>;
}): Pick<
  ModelDefinition,
  | "supportsStartFrame"
  | "maxReferenceImages"
  | "nativeAudioDialogue"
  | "supportsNativeAudio"
  | "verticalDramaReady"
> {
  if (model.type === "image") {
    // An image model qualifies for the vertical-drama start-frame picker as
    // long as it can render 9:16 — `verticalDramaReady` is unaffected by
    // `maxReferenceImages` (that logic is unchanged from before this fix).
    //
    // Latent-bug fix (confirmed 2026-07-14): this branch used to return
    // BEFORE ever parsing the image-reference limit, so
    // `imageCapabilities.maxReferenceImages` was ALWAYS `undefined` for
    // every image model — even ones (e.g. `google-banana-2-lite: 10`, see
    // the `STATIC_MODEL_REGISTRY` entry below) that explicitly declare it.
    // That silently no-op'd the fail-closed capacity guard
    // (`assertRequiredCharacterReferenceCapacity` in
    // `verticalDramaEpisodes.ts`) and the trim in
    // `mergeAndTrimReferenceImageUrls` for ALL image models. Mirrors the
    // video branch's own `rawMaxReferenceImages`/`maxReferenceImages`
    // parsing below. DB-imported and Hermes rows use
    // `referenceImageLimit`, while older/static rows use
    // `maxReferenceImages`; normalize both names here so the generation
    // path enforces the same limit displayed by the catalog.
    // Undefined/null/non-finite values still resolve to `undefined`, so a
    // model without either field remains byte-identical to the prior
    // behavior.
    const imgCfg = model.configJson ?? {};
    const rawImageMaxReferenceImages =
      imgCfg.maxReferenceImages ?? imgCfg.referenceImageLimit;
    const imageMaxReferenceImages =
      rawImageMaxReferenceImages === undefined || rawImageMaxReferenceImages === null
        ? undefined
        : Number.isFinite(Number(rawImageMaxReferenceImages))
          ? Number(rawImageMaxReferenceImages)
          : undefined;
    return {
      maxReferenceImages: imageMaxReferenceImages,
      verticalDramaReady: (model.aspectRatios ?? []).includes("9:16"),
    };
  }
  if (model.type !== "video") {
    return {};
  }
  const cfg = model.configJson ?? {};
  const inputFields = Array.isArray(cfg.inputFields) ? cfg.inputFields : [];
  const hasFirstLastFrameOption = inputFields.some(
    (f: any) =>
      Array.isArray(f?.options) &&
      f.options.some((o: any) => o?.value === "FIRST_AND_LAST_FRAMES_2_VIDEO"),
  );
  // Distinguish "no signal at all" (unknown — must NOT be treated as a hard
  // 0-image limit by callers) from an EXPLICIT 0 in configJson (storyboard
  // plan Phase 6.4 — a model without `maxReferenceImages` metadata used to
  // resolve to `0`, and the client's reference-strip badge then displayed
  // "สูงสุด 0 ภาพ" as if 0 references were ever allowed, hard-blocking valid
  // uploads on models that never opted into this metadata at all). Only a
  // configJson value that is actually present and coerces to a finite number
  // stays as that number (including a real `0`); everything else resolves to
  // `undefined` so the client's existing "undefined = unlimited/no badge"
  // handling takes over instead of a false "0 max" warning.
  const rawMaxReferenceImages = cfg.maxReferenceImages;
  const maxReferenceImages =
    rawMaxReferenceImages === undefined || rawMaxReferenceImages === null
      ? undefined
      : Number.isFinite(Number(rawMaxReferenceImages))
        ? Number(rawMaxReferenceImages)
        : undefined;
  const generateType = String(cfg.generateType ?? "").toLowerCase();
  const supportsStartFrame =
    cfg.apiPayloadFormat === "veo" ||
    hasFirstLastFrameOption ||
    (maxReferenceImages ?? 0) > 0 ||
    generateType.includes("image-to-video");
  const nativeAudioDialogue = cfg.hasAudio === true || cfg.nativeAudio === true;
  // Task #36 — same underlying signal as `nativeAudioDialogue` (see that
  // field's doc comment on `ModelDefinition`): a model whose configJson
  // marks it as generating native audio at all is verified to support the
  // NATIVE AUDIO DIRECTION prompt option too, whether the caller then
  // directs that audio toward speech (nativeAudioDialogue's use) or toward
  // ambience/SFX (this flag's use).
  const supportsNativeAudio = nativeAudioDialogue;
  const supports9x16 = (model.aspectRatios ?? []).includes("9:16");
  return {
    supportsStartFrame,
    maxReferenceImages,
    nativeAudioDialogue,
    supportsNativeAudio,
    verticalDramaReady: supports9x16 && supportsStartFrame,
  };
}

/**
 * Provider-independent Grok video-family classifier.
 *
 * The invariant intentionally lives above individual provider catalogs: a
 * Grok video remains native-audio capable whether it is routed through Kie,
 * Higgsfield, Magnific, KNPLabs, or a future MCP provider. Image/upscale
 * models are excluded even when their ids contain the Grok token.
 */
export function isGrokVideoFamily(
  modelId: string,
  model: {
    type: MediaType;
    configJson?: Record<string, any>;
  },
): boolean {
  if (model.type !== "video") return false;

  const cfg = model.configJson ?? {};
  const candidates = [
    modelId,
    cfg.providerModelId,
    cfg.kieModelId,
    cfg.modelId,
    cfg.mcp?.providerModelId,
  ];
  return candidates.some(
    value =>
      typeof value === "string" &&
      /(^|[^a-z0-9])grok([^a-z0-9]|$)/i.test(value),
  );
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
    // Multi-view fix (planning/marketplace-multi-product-reference-images):
    // static-registry parity for cold-start + unit tests. The DB row carries
    // the same maxReferenceImages, so the sequential cap resolver
    // (getSequentialReferenceImageModelCap -> getModelById) reports 14 — kie.ai
    // nano-banana-2 accepts up to 14 input images — instead of the ?? 5
    // fallback. Provider generation still uses the DB configJson at dispatch.
    configJson: {
      kieModelId: "nano-banana-2",
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      generateType: "text-to-image",
      maxReferenceImages: 14,
      inputFields: [
        { key: "image_input", label: "Reference Images", type: "image_urls", syncWith: "none" },
      ],
    },
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
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    // Task #36 — description above states "with native audio" explicitly
    // (Veo 3.1 family, verified).
    supportsNativeAudio: true,
    verticalDramaReady: true,
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
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    // Task #36 — description above states "with native audio" explicitly
    // (Veo 3.1 family, verified).
    supportsNativeAudio: true,
    verticalDramaReady: true,
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
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    // Task #36 — description above states "with native audio" explicitly
    // (Veo 3.1 family, verified).
    supportsNativeAudio: true,
    verticalDramaReady: true,
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
    // Extends an EXISTING Veo task (requires a source taskId) — not a
    // start-frame-capable primary render model, so it's excluded from the
    // Vertical Drama episode model picker despite being a Veo-family model.
    supportsStartFrame: false,
    maxReferenceImages: 0,
    nativeAudioDialogue: true,
    // Task #36 — same Veo 3.1 technology as the 3 render-capable tiers above
    // (not start-frame-capable itself, so it never reaches the Vertical
    // Drama picker anyway, but the capability metadata stays accurate).
    supportsNativeAudio: true,
    verticalDramaReady: false,
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
    supportsStartFrame: false,
    maxReferenceImages: 0,
    nativeAudioDialogue: false,
    verticalDramaReady: false,
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
    // Single source image = the start frame — no 9:16 aspect ratio listed
    // above (image-to-video omits explicit aspect ratio, inherited from the
    // source image instead), so it doesn't qualify as verticalDramaReady
    // under the strict 9:16-catalog-entry check even though it works in
    // practice; flagged here rather than silently marked ready.
    supportsStartFrame: true,
    maxReferenceImages: 1,
    nativeAudioDialogue: false,
    verticalDramaReady: false,
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
    supportsStartFrame: true,
    maxReferenceImages: 9,
    nativeAudioDialogue: false,
    verticalDramaReady: true,
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
    // Edits an EXISTING source video — not a start-frame render model.
    supportsStartFrame: false,
    maxReferenceImages: 5,
    nativeAudioDialogue: false,
    verticalDramaReady: false,
  },
  {
    // Verified callable on kie.ai: `grok-imagine-video-1-5-preview` is a real,
    // already-mapped model id in the Python provider's
    // `FALLBACK_MODEL_NAME_MAP` (`kie_ai_provider.py`) AND in
    // `MODEL_METADATA` (`core/media_models.py`) — it requires exactly one
    // reference image (`requires_reference_image: True, max_reference_images:
    // 1`, i.e. image-to-video only, no text-to-video mode), which the generic
    // "market" `/api/v1/jobs/createTask` dispatch (same code path as
    // `gemini-omni-video`/HappyHorse below) already supports via
    // `image_urls`. No dedicated first/last-frame bridge mode is documented
    // for this model (single start-frame reference only). Grok Imagine v1.x
    // generates native in-video audio including speech (xAI added
    // synchronized audio in late 2025; user-confirmed 2026-07-06), so
    // dialogue is embedded verbatim for Vertical Drama.
    id: "grok-imagine-video-1-5-preview",
    type: "video",
    name: "Grok Imagine Video 1.5",
    provider: "kie.ai",
    description: "xAI Grok Imagine Video 1.5 — image-to-video generation from a single reference frame",
    aliases: [
      "grok imagine 1.5",
      "grok imagine video 1.5",
      "grok-imagine-video-1.5",
      "grok-imagine-video-1-5-preview",
      "grok imagine video",
      "grok video 1.5",
    ],
    creditCost: 90,
    durations: [6, 10, 15],
    aspectRatios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"],
    isEnabled: true,
    priority: 19,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiQueryEndpoint: "/api/v1/jobs/recordInfo",
      apiPayloadFormat: "market",
      kieModelId: "grok-imagine-video-1-5-preview",
      generateType: "image-to-video",
      hasAudio: true,
      maxDuration: 15,
      maxPromptLength: 5000,
      maxReferenceImages: 1,
      supportedDurations: [6, 10, 15],
      supportedAspectRatios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"],
      supportedResolutions: ["480p", "720p"],
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
      },
      inputFields: [
        { key: "image_urls", label: "Start Frame (required)", type: "image_urls", required: true, syncWith: "reference_images" },
        {
          key: "aspect_ratio",
          label: "Aspect Ratio",
          type: "select",
          options: [
            { value: "auto", label: "Auto" },
            { value: "1:1", label: "1:1" },
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "4:3", label: "4:3" },
            { value: "3:4", label: "3:4" },
          ],
          default: "auto",
          syncWith: "aspect_ratio",
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [6, 10, 15].map((seconds) => ({ value: String(seconds), label: `${seconds}s` })),
          default: "6",
          affectsPricing: true,
        },
        { key: "resolution", label: "Resolution", type: "select", options: [{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }], default: "720p" },
        { key: "seed", label: "Seed", type: "number", required: false },
      ],
      pricingTiers: { default: 90 },
      pricingFormula: "flat",
    },
    supportsStartFrame: true,
    maxReferenceImages: 1,
    nativeAudioDialogue: true,
    // Task #36 — see this entry's own comment above: xAI added synchronized
    // in-video audio (incl. speech) to Grok Imagine v1.x in late 2025,
    // user-confirmed 2026-07-06.
    supportsNativeAudio: true,
    verticalDramaReady: true,
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
    // No image/reference input in this catalog entry (text-to-video only) and
    // OpenAI's human-face bridge stays policy-gated off by default (see
    // `verticalDramaProviderRouting.ts` `openAiHumanFaceBridgeEnabled`).
    supportsStartFrame: false,
    maxReferenceImages: 0,
    nativeAudioDialogue: false,
    verticalDramaReady: false,
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
    // No image/start-frame input wired in this catalog entry (text-to-video only).
    supportsStartFrame: false,
    maxReferenceImages: 0,
    nativeAudioDialogue: false,
    verticalDramaReady: false,
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
    // KNPLabs "form" video models (`create_video_veo`) are text-to-video
    // only — the multipart/form-data submission has no image field, unlike
    // the JSON models (see `grok-video-3` below). Verified against
    // `python-backend/app/llm_proxy/providers/knplabai_provider.py`
    // `create_video_veo()`.
    supportsStartFrame: false,
    maxReferenceImages: 0,
    nativeAudioDialogue: false,
    verticalDramaReady: false,
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
    // KNPLabs "JSON" video models accept an `images` array in the request
    // body (`create_video_json()` in `knplabai_provider.py`) — usable as a
    // start-frame reference, though the provider does not document a
    // dedicated first/last-frame bridge mode (single reference only). Grok
    // video-family models always expose native synchronized audio regardless
    // of the provider carrying the request.
    supportsStartFrame: true,
    maxReferenceImages: 1,
    nativeAudioDialogue: true,
    supportsNativeAudio: true,
    verticalDramaReady: true,
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
    ...deriveVerticalDramaCapabilities({
      type: seed.modelType,
      aspectRatios: seed.aspectRatios,
      configJson: seed.configJson,
    }),
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
    ...deriveVerticalDramaCapabilities({
      type: seed.modelType,
      aspectRatios: seed.aspectRatios,
      configJson: seed.configJson,
    }),
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
    supportsStartFrame: true,
    maxReferenceImages: 7,
    nativeAudioDialogue: true,
    // Task #36 — `configJson.hasAudio: true` above + "multimodal video
    // generation" description; Gemini Omni's native audio channel is
    // verified the same way the other `nativeAudioDialogue: true` entries
    // in this catalog are.
    supportsNativeAudio: true,
    verticalDramaReady: true,
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
  grokNativeAudioInvariantRepairs: 0,
};

export function getModelRegistryCounters(): Readonly<typeof _registryCounters> {
  return { ..._registryCounters };
}

export function resetModelRegistryCounters(): void {
  _registryCounters.staticFallbackHits = 0;
  _registryCounters.cacheHits = 0;
  _registryCounters.grokNativeAudioInvariantRepairs = 0;
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
 * Resolve the 4 Vertical Drama capability flags for ANY model id (static
 * catalog OR DB-only), preferring the hand-tuned static catalog entry's
 * capability flags when this id corresponds to a known static model (covers
 * nuances the generic `deriveVerticalDramaCapabilities` heuristic can't
 * capture — e.g. `veo3/extend-video` being Veo-family but NOT
 * start-frame-capable, or `happyhorse/image-to-video` supporting a start
 * frame despite not declaring an explicit 9:16 aspect ratio list). Falls back
 * to deriving from the given type/aspectRatios/configJson for models the
 * static catalog doesn't know about (admin-created models, future imports)
 * so they still get sensible capability metadata without a manual DB edit.
 * Exported for `mediaModels.ts`'s public `list` procedure, which reads model
 * rows straight from the DB and needs the exact same resolution the internal
 * `dbModelToDefinition` below uses.
 */
export function resolveVerticalDramaCapabilities(
  modelId: string,
  model: { type: MediaType; aspectRatios?: string[]; configJson?: Record<string, any> },
): Pick<
  ModelDefinition,
  | "supportsStartFrame"
  | "maxReferenceImages"
  | "nativeAudioDialogue"
  | "supportsNativeAudio"
  | "verticalDramaReady"
> {
  const staticMatch = getStaticModelById(modelId);
  let resolved: ReturnType<typeof deriveVerticalDramaCapabilities>;
  if (
    staticMatch &&
    (staticMatch.supportsStartFrame !== undefined ||
      staticMatch.maxReferenceImages !== undefined ||
      staticMatch.nativeAudioDialogue !== undefined ||
      staticMatch.supportsNativeAudio !== undefined ||
      staticMatch.verticalDramaReady !== undefined)
  ) {
    resolved = {
      supportsStartFrame: staticMatch.supportsStartFrame,
      maxReferenceImages: staticMatch.maxReferenceImages,
      nativeAudioDialogue: staticMatch.nativeAudioDialogue,
      supportsNativeAudio: staticMatch.supportsNativeAudio,
      verticalDramaReady: staticMatch.verticalDramaReady,
    };
  } else {
    resolved = deriveVerticalDramaCapabilities(model);
  }

  // Model-family invariant: persisted catalog metadata may be absent, stale,
  // or explicitly false after a provider sync. Such row-level state must not
  // disable native audio for any Grok video route.
  if (isGrokVideoFamily(modelId, model)) {
    if (resolved.nativeAudioDialogue !== true || resolved.supportsNativeAudio !== true) {
      _registryCounters.grokNativeAudioInvariantRepairs += 1;
    }
    return {
      ...resolved,
      nativeAudioDialogue: true,
      supportsNativeAudio: true,
    };
  }
  return resolved;
}

/**
 * Vertical Drama task #36 — convenience single-arg lookup: true when the
 * given model id resolves (via the cache-aware registry, so both DB-backed
 * and static-catalog entries work) to a video model whose own metadata
 * verifies it generates native audio. Mirrors `getModelById`'s "id-only, no
 * model shape needed" convention, for callers that only have an id in hand
 * (e.g. a router-level gate deciding whether to even accept the caller's
 * NATIVE AUDIO DIRECTION request). Callers that already resolved a
 * `resolveVerticalDramaCapabilities(...)` object for this same model
 * (`verticalDramaVideoMotionPromptGeneration.ts`,
 * `verticalDramaVideoPromptFormatter.ts`) should read
 * `capabilities.supportsNativeAudio` directly instead of calling this a
 * second time — same "prefer the already-resolved object" guidance the
 * `resolveEpisodeVideoModel` doc comment gives for `nativeAudioDialogue`.
 */
export function videoModelSupportsNativeAudio(modelId: string): boolean {
  return getModelById(modelId)?.supportsNativeAudio === true;
}

/** One selectable resolution/size option surfaced to the client, with the
 *  credit cost that option resolves to (when the model's pricing is
 *  resolution-tiered) so the UI can show a price per option before the user
 *  picks one. */
export interface ModelResolutionOption {
  value: string;
  label: string;
  creditCost?: number;
}

/**
 * Derive a normalized `resolutionOptions` list for a model from whatever
 * signal its `configJson`/`sizes` column already carries (storyboard-complete
 * plan Phase 6.2) — every media model already has SOME representation of its
 * selectable output sizes, but in 3 different shapes depending on how/when it
 * was added to the catalog:
 *
 *  1. `configJson.inputFields` containing a `select`-type field whose `key`
 *     is `"resolution"` or `"size"` (or an alias like `"quality"` for the
 *     rare model that names it that way) — the richest source, since each
 *     option already carries a display `label` (e.g. Veo 3.1's
 *     `VEO_31_INPUT_FIELDS`, HappyHorse/Gemini Omni's resolution selects).
 *     This is checked FIRST because it's the most explicit/curated source.
 *  2. `configJson.supportedResolutions` — a plain string array some configs
 *     set alongside (or instead of) `inputFields` (e.g. `buildVeo31Config`,
 *     `buildHappyHorseConfig`). Used when no `inputFields` resolution/size
 *     select exists.
 *  3. The DB/static `sizes` column (e.g. `google-nano-banana-pro`'s
 *     `["1024x1024", "1024x1792", "1792x1024"]`, `flux-2.0`'s same shape,
 *     `google-banana-2-lite`'s `["1K"]`) — the fallback for image models that
 *     predate `configJson.inputFields` entirely.
 *
 * If a resolution-tiered pricing config is present (`pricingFormula ===
 * "matrix"` with a single pricing field keyed `resolution`/`size`, e.g. Veo
 * 3.1's 720p/1080p/4K tiers), each option's `creditCost` is computed via
 * `calculateCreditCost` with that single value selected — giving the client
 * an exact per-option price without re-implementing the pricing matrix logic.
 * Models with flat/non-resolution pricing simply omit `creditCost` per option
 * (the model's base `creditCost` still applies uniformly).
 *
 * Returns `undefined` (never an empty array) when the model has no
 * resolution/size signal at all, so the client can treat "no dropdown" and
 * "empty dropdown" as the same state.
 */
export function deriveModelResolutionOptions(
  model: {
    creditCost: number;
    sizes?: string[] | null;
    configJson?: Record<string, any> | null;
  },
): ModelResolutionOption[] | undefined {
  const cfg = model.configJson ?? {};
  const inputFields = Array.isArray(cfg.inputFields) ? cfg.inputFields : [];
  const RESOLUTION_FIELD_KEYS = new Set(["resolution", "size", "quality"]);

  const resolutionField = inputFields.find(
    (f: any) =>
      f &&
      typeof f.key === "string" &&
      RESOLUTION_FIELD_KEYS.has(f.key) &&
      Array.isArray(f.options) &&
      f.options.length > 0,
  );

  let rawOptions: Array<{ value: string; label?: string }> | undefined;
  if (resolutionField) {
    rawOptions = resolutionField.options
      .filter((o: any) => o && typeof o.value === "string" && o.value.length > 0)
      .map((o: any) => ({ value: o.value, label: typeof o.label === "string" ? o.label : o.value }));
  } else if (Array.isArray(cfg.supportedResolutions) && cfg.supportedResolutions.length > 0) {
    rawOptions = cfg.supportedResolutions
      .filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
      .map((v: string) => ({ value: v, label: v }));
  } else if (Array.isArray(model.sizes) && model.sizes.length > 0) {
    rawOptions = model.sizes
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map((v) => ({ value: v, label: v }));
  }

  if (!rawOptions || rawOptions.length === 0) return undefined;

  // De-duplicate by value (keep first) — some configs list the same value
  // via both an inputFields option AND supportedResolutions.
  const seen = new Set<string>();
  const deduped = rawOptions.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });

  const hasMatrixResolutionPricing =
    cfg.pricingFormula === "matrix" &&
    cfg.pricingTiers &&
    typeof cfg.pricingTiers === "object" &&
    (resolutionField ? RESOLUTION_FIELD_KEYS.has(resolutionField.key) : true);

  return deduped.map((o) => {
    if (!hasMatrixResolutionPricing) return { value: o.value, label: o.label ?? o.value };
    const creditCost = calculateCreditCost(
      { creditCost: model.creditCost, configJson: cfg },
      { resolution: o.value },
    );
    return { value: o.value, label: o.label ?? o.value, creditCost };
  });
}

/**
 * A DB-backed catalog REPLACES the static registry outright (see
 * `loadModelsFromDatabase`) rather than merging with it, so a row whose
 * `durations` column is NULL does not "inherit" the static default — it
 * erases it. Field incident 2026-07-30: `veo3/generate-veo-3-video-lite`
 * declares `durations: [8]` in `STATIC_MODEL_REGISTRY` (and the unit test
 * asserting a 10s shot snaps to 8s passed happily against it), while the
 * live DB row had NULL. In production the duration fitter therefore saw no
 * constraint, submitted 10 seconds, and Kie.ai rejected the whole task with
 * "Duration must be 4, 6 or 8 seconds". 56 of 111 enabled video rows are in
 * that same NULL state.
 *
 * Fill from the static entry only when the DB row declares nothing. A DB row
 * that DOES declare durations still wins outright — this can only add a
 * constraint where there was none, never override operator-entered data.
 */
export function resolveDbModelDurations(dbModel: any): number[] | undefined {
  const dbDurations = dbModel.durations;
  if (Array.isArray(dbDurations) && dbDurations.length > 0) {
    return dbDurations;
  }
  const staticDurations = getStaticModelById(String(dbModel.modelId ?? ""))
    ?.durations;
  return Array.isArray(staticDurations) && staticDurations.length > 0
    ? [...staticDurations]
    : undefined;
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

  const modelType = dbModel.modelType as MediaType;
  const aspectRatios = dbModel.aspectRatios || undefined;
  const configJson =
    typeof dbModel.configJson === "string"
      ? (() => {
          try {
            return JSON.parse(dbModel.configJson);
          } catch {
            return undefined;
          }
        })()
      : dbModel.configJson || undefined;

  const capabilities = resolveVerticalDramaCapabilities(dbModel.modelId, {
    type: modelType,
    aspectRatios,
    configJson,
  });

  return {
    id: dbModel.modelId,
    type: modelType,
    name: dbModel.name,
    provider: dbModel.provider,
    description: dbModel.description || "",
    aliases,
    creditCost: dbModel.creditCost,
    aspectRatios,
    sizes: dbModel.sizes || undefined,
    durations: resolveDbModelDurations(dbModel),
    voices: dbModel.voices || undefined,
    isEnabled: dbModel.isEnabled,
    priority: dbModel.priority,
    configJson,
    ...capabilities,
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

/**
 * Whether the DB-backed model catalog is currently loaded, versus serving the
 * small hardcoded `STATIC_MODEL_REGISTRY` fallback.
 *
 * During a cold start (the HTTP server accepts a request before the DB/model
 * cache is warm) or a transient DB outage, `loadModelsFromDatabase()` returns
 * empty and `_cachedModels` stays `null`, so `getModelsByType` serves only the
 * static subset — which OMITS every DB-only model (e.g. the higgsfield/magnific
 * catalog). A model-resolution guard should NOT declare a user-selected model
 * "unavailable" (nor silently swap it for a default) in that window, because it
 * genuinely cannot verify the catalog yet. `false` here means "cannot verify —
 * trust the caller's selection and let the actual generation validate it."
 */
export function isDbModelCatalogLoaded(): boolean {
  return _cachedModels !== null;
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
