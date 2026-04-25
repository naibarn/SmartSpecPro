/**
 * Seed Media Models from Kie AI
 * Run with: npx tsx scripts/seed-media-models-kie-ai.ts
 *
 * Credit conversion:
 * - Platform: 1 USD = 1000 credits (1 credit = $0.001)
 * - Kie AI: 1 credit = $0.005 USD
 * - Conversion: Kie credits * 5 = Platform credits
 *
 * Pricing based on Kie AI (https://kie.ai/pricing)
 * Last updated: January 2026
 */

import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

// ============================================================
// Model Definition Types (for configJson)
// ============================================================
interface InputField {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls" | "array";
  options?: { value: string; label: string }[];
  searchable?: boolean;
  optionsSource?: {
    type: "provider_api" | "public_api";
    endpoint: string;
    method?: "GET" | "POST";
    itemsPath?: string;
    valueField?: string;
    labelField?: string;
    valueTransform?: "none" | "before_dash";
    queryParam?: string;
    cacheTtlSeconds?: number;
  };
  default?: string | number | boolean;
  required?: boolean;
  affectsPricing?: boolean;
  syncWith?: "none" | "reference_images" | "prompt" | "aspect_ratio";
  itemTemplate?: Record<string, unknown>;
}

interface ModelDefinition {
  apiEndpoint: string;
  apiPayloadFormat: "market" | "veo" | "runway" | "suno" | "elevenlabs" | "custom";
  kieModelId: string | null;
  apiConfig?: Record<string, string | number | boolean>;
  inputFields: InputField[];
  pricingTiers?: Record<string, number>;
  pricingFormula: "flat" | "per_duration" | "matrix" | "per_unit";
  pricingUnitMetric?: "characters" | "items";
  pricingUnitField?: string;
  pricingUnitSize?: number;
  pricingUnitRounding?: "ceil" | "floor" | "round";
  pricingMinUnits?: number;
  generateType?: string;
  hasAudio?: boolean;
  maxDuration?: number;
  supportedResolutions?: string[];
  supportedDurations?: number[];
  supportedAspectRatios?: string[];
}

const ELEVENLABS_VOICE_LIST_URL = "https://api.elevenlabs.io/v1/voices";
const ELEVENLABS_DIALOGUE_VOICE_LIST_PATHS = [
  process.env.ELEVENLABS_DIALOGUE_VOICE_LIST_FILE?.trim(),
  resolve(process.cwd(), "scripts/data/elevenlabs-dialogue-v3-voices.txt"),
  resolve(process.cwd(), "apps/web/scripts/data/elevenlabs-dialogue-v3-voices.txt"),
].filter((entry): entry is string => Boolean(entry && entry.length > 0));

const FALLBACK_ELEVENLABS_VOICES: { value: string; label: string }[] = [
  { value: "Rachel", label: "Rachel" },
  { value: "Adam", label: "Adam" },
  { value: "Antoni", label: "Antoni" },
  { value: "Bella", label: "Bella" },
  { value: "Domi", label: "Domi" },
  { value: "Elli", label: "Elli" },
  { value: "Josh", label: "Josh" },
];

type ElevenLabsVoiceRecord = {
  voice_id?: unknown;
  voiceId?: unknown;
  name?: unknown;
  category?: unknown;
  description?: unknown;
};

function isLikelyVoiceId(value: string): boolean {
  return /^[A-Za-z0-9]{16,}$/.test(value.trim());
}

function parseVoiceOptionsText(raw: string): { value: string; label: string }[] {
  const lines = raw.split(/\r?\n/).map((line) => line.replace(/\u00A0/g, " ").trim());
  const parsed: { value: string; label: string }[] = [];
  let pendingVoiceId: string | null = null;

  const pushOption = (valueRaw: string, labelRaw?: string) => {
    const value = valueRaw.trim();
    const label = (labelRaw ?? valueRaw).trim();
    if (!value) return;
    parsed.push({ value, label: label || value });
  };

  for (const line of lines) {
    if (!line) continue;
    if (/^available voices:?$/i.test(line)) continue;

    const idWithLabel = line.match(/^([A-Za-z0-9]{16,})\s*-\s*(.+)$/);
    if (idWithLabel) {
      pushOption(idWithLabel[1], idWithLabel[2]);
      pendingVoiceId = null;
      continue;
    }

    if (isLikelyVoiceId(line)) {
      if (pendingVoiceId) {
        pushOption(pendingVoiceId);
      }
      pendingVoiceId = line;
      continue;
    }

    const bulletLabel = line.match(/^(?:[-*]\s*)(.+)$/);
    if (bulletLabel && pendingVoiceId) {
      pushOption(pendingVoiceId, bulletLabel[1]);
      pendingVoiceId = null;
      continue;
    }

    if (pendingVoiceId) {
      pushOption(pendingVoiceId, line.replace(/^(?:[-*]\s*)/, ""));
      pendingVoiceId = null;
      continue;
    }

    const plain = line.replace(/^(?:[-*]\s*)/, "").trim();
    if (plain) {
      pushOption(plain, plain);
    }
  }

  if (pendingVoiceId) {
    pushOption(pendingVoiceId);
  }

  const seen = new Set<string>();
  const deduped: { value: string; label: string }[] = [];
  for (const item of parsed) {
    const key = item.value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

async function loadVoiceOptionsFromCatalogFile(): Promise<{ value: string; label: string }[]> {
  for (const filePath of ELEVENLABS_DIALOGUE_VOICE_LIST_PATHS) {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = parseVoiceOptionsText(raw);
      if (parsed.length > 0) {
        console.log(`Loaded ${parsed.length} ElevenLabs voices from catalog file: ${filePath}`);
        return parsed;
      }
    } catch {
      // Ignore missing file and continue fallback chain.
    }
  }
  return [];
}

function normalizeElevenLabsVoiceValue(record: ElevenLabsVoiceRecord): string {
  const idRaw = typeof record.voice_id === "string"
    ? record.voice_id
    : typeof record.voiceId === "string"
      ? record.voiceId
      : "";
  const id = idRaw.trim();
  if (id) {
    return id;
  }
  const name = typeof record.name === "string" ? record.name.trim() : "";
  return name || "";
}

function normalizeElevenLabsVoiceLabel(record: ElevenLabsVoiceRecord): string {
  const rawName = typeof record.name === "string" ? record.name.trim() : "";
  const category = typeof record.category === "string" ? record.category.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!rawName) return "";
  if (description) {
    if (rawName.toLowerCase().includes(description.toLowerCase())) {
      return rawName;
    }
    return `${rawName} - ${description}`;
  }
  if (!category) {
    return rawName;
  }
  if (rawName.toLowerCase().includes(category.toLowerCase())) {
    return rawName;
  }
  return `${rawName} - ${category}`;
}

async function fetchElevenLabsVoiceOptions(): Promise<{ value: string; label: string }[]> {
  const response = await fetch(ELEVENLABS_VOICE_LIST_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const voices = Array.isArray(payload?.voices) ? payload.voices : [];
  const dedupe = new Map<string, { value: string; label: string }>();

  for (const entry of voices as ElevenLabsVoiceRecord[]) {
    const value = normalizeElevenLabsVoiceValue(entry);
    if (!value) continue;
    if (dedupe.has(value)) continue;

    const fallbackLabel = typeof entry?.name === "string" ? entry.name.trim() : value;
    const label = normalizeElevenLabsVoiceLabel(entry) || fallbackLabel;
    dedupe.set(value, { value, label });
  }

  return [...dedupe.values()].sort((a, b) => a.label.localeCompare(b.label));
}

async function loadElevenLabsVoiceOptions(): Promise<{ value: string; label: string }[]> {
  const fileOptions = await loadVoiceOptionsFromCatalogFile();
  if (fileOptions.length > 0) {
    return fileOptions;
  }

  try {
    const options = await fetchElevenLabsVoiceOptions();
    if (options.length > 0) {
      console.log(`Fetched ${options.length} ElevenLabs voices from public API.`);
      return options;
    }
    console.warn("ElevenLabs voice API returned 0 voices. Falling back to built-in voice list.");
  } catch (error) {
    console.warn("Failed to fetch ElevenLabs voice list. Falling back to built-in list.", error);
  }
  return FALLBACK_ELEVENLABS_VOICES;
}

// Video Models - Complete Kie AI catalog
const VIDEO_MODELS = [
  // === Google Veo 3 ===
  {
    modelId: "veo3/generate-veo-3-video",
    name: "Veo 3.1",
    description: "Google Veo 3.1 - High-quality video with synchronized audio. Best for final production.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["veo3", "veo-3.1", "google-veo"],
    creditCost: 2000,
    priority: 5,
    sortOrder: 5,
    configJson: {
      apiEndpoint: "/api/v1/veo/generate",
      apiPayloadFormat: "veo",
      kieModelId: "veo3",
      generateType: "text-to-video",
      hasAudio: true,
      maxDuration: 8,
      maxPromptLength: 5000,
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }],
          default: "16:9" },
      ],
      pricingTiers: { "default": 2000 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "veo3/generate-veo-3-video-fast",
    name: "Veo 3.1 Fast",
    description: "Google Veo 3.1 Fast - Quick video generation with audio. Best for prototyping.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["veo3-fast", "veo-fast"],
    creditCost: 300,
    priority: 10,
    sortOrder: 10,
    configJson: {
      apiEndpoint: "/api/v1/veo/generate",
      apiPayloadFormat: "veo",
      kieModelId: "veo3_fast",
      generateType: "text-to-video",
      hasAudio: true,
      maxDuration: 8,
      maxPromptLength: 5000,
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }],
          default: "16:9" },
      ],
      pricingTiers: { "default": 300 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "veo3/extend-video",
    name: "Veo 3.1 Extend",
    description: "Extend existing videos with Veo 3.1 technology.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["veo-extend"],
    creditCost: 1250,
    priority: 15,
    sortOrder: 15,
    configJson: {
      apiEndpoint: "/api/v1/veo/generate",
      apiPayloadFormat: "veo",
      kieModelId: "veo3",
      generateType: "video-extend",
      maxPromptLength: 5000,
      inputFields: [
        { key: "video_urls", label: "Source Video", type: "video_urls", required: true },
      ],
      pricingTiers: { "default": 1250 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Sora 2 ===
  {
    modelId: "sora2/sora-2-pro-text-to-video",
    name: "Sora 2 Pro",
    description: "OpenAI Sora 2 Pro - Premium video generation with realistic motion and native audio.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["sora", "sora-2-pro", "openai-sora"],
    creditCost: 825,
    priority: 3,
    sortOrder: 3,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "sora2/sora-2-pro-text-to-video",
      generateType: "text-to-video",
      hasAudio: true,
      maxDuration: 15,
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }, { value: "15", label: "15s" }],
          default: "5", affectsPricing: true },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }],
          default: "720p", affectsPricing: true },
      ],
      pricingTiers: { "720p-5s": 375, "720p-10s": 750, "720p-15s": 1350, "1080p-5s": 825, "1080p-10s": 1650, "1080p-15s": 3150 },
      pricingFormula: "matrix",
    } as ModelDefinition,
  },
  {
    modelId: "sora2/sora-2-text-to-video",
    name: "Sora 2",
    description: "OpenAI Sora 2 - High-quality text-to-video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["sora-2", "sora-standard"],
    creditCost: 75,
    priority: 8,
    sortOrder: 8,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "sora2/sora-2-text-to-video",
      generateType: "text-to-video",
      hasAudio: false,
      maxDuration: 10,
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }],
          default: "720p", affectsPricing: true },
      ],
      pricingTiers: { "720p-5s": 75, "720p-10s": 150, "1080p-5s": 375, "1080p-10s": 750 },
      pricingFormula: "matrix",
    } as ModelDefinition,
  },
  {
    modelId: "sora2/sora-2-pro-image-to-video",
    name: "Sora 2 Pro Image-to-Video",
    description: "OpenAI Sora 2 Pro - Transform images into videos with motion.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["sora-i2v", "sora-image-to-video"],
    creditCost: 375,
    priority: 6,
    sortOrder: 6,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "sora2/sora-2-pro-image-to-video",
      generateType: "image-to-video",
      inputFields: [
        { key: "image_urls", label: "Source Image", type: "image_urls", required: true },
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 375, "10s": 750 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },
  {
    modelId: "sora2/sora-2-characters",
    name: "Sora 2 Characters",
    description: "Create consistent character videos with Sora 2.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["sora-characters"],
    creditCost: 750,
    priority: 4,
    sortOrder: 4,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "sora2/sora-2-characters",
      generateType: "text-to-video",
      inputFields: [
        { key: "image_urls", label: "Character Reference", type: "image_urls" },
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 750, "10s": 1500 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },

  // === Runway ===
  {
    modelId: "runway/generate-ai-video",
    name: "Runway Gen-3 Alpha",
    description: "Runway Gen-3 Alpha - Industry-leading cinematic video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["runway", "runway-gen3", "gen3-alpha"],
    creditCost: 125,
    priority: 12,
    sortOrder: 12,
    configJson: {
      apiEndpoint: "/api/v1/runway/generate",
      apiPayloadFormat: "runway",
      kieModelId: null,
      generateType: "text-to-video",
      maxDuration: 10,
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
        { key: "quality", label: "Quality", type: "select",
          options: [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p (5s only)" }],
          default: "720p", affectsPricing: true },
        { key: "aspectRatio", label: "Aspect Ratio", type: "select",
          options: [{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }],
          default: "16:9" },
      ],
      pricingTiers: { "720p-5s": 125, "720p-10s": 250, "1080p-5s": 200 },
      pricingFormula: "matrix",
    } as ModelDefinition,
  },
  {
    modelId: "runway/extend-ai-video",
    name: "Runway Extend",
    description: "Extend existing videos with Runway AI.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["runway-extend"],
    creditCost: 125,
    priority: 18,
    sortOrder: 18,
    configJson: {
      apiEndpoint: "/api/v1/runway/generate",
      apiPayloadFormat: "runway",
      kieModelId: null,
      generateType: "video-extend",
      inputFields: [
        { key: "video_urls", label: "Source Video", type: "video_urls", required: true },
        { key: "duration", label: "Extend Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 125, "10s": 250 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },
  {
    modelId: "runway/generate-aleph-video",
    name: "Runway Aleph",
    description: "Runway Aleph - In-context video editing with scene reasoning.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["runway-aleph", "aleph"],
    creditCost: 200,
    priority: 11,
    sortOrder: 11,
    configJson: {
      apiEndpoint: "/api/v1/runway/generate",
      apiPayloadFormat: "runway",
      kieModelId: null,
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
        { key: "aspectRatio", label: "Aspect Ratio", type: "select",
          options: [{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }],
          default: "16:9" },
      ],
      pricingTiers: { "5s": 200, "10s": 400 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },

  // === Kling ===
  {
    modelId: "kling/text-to-video",
    name: "Kling 2.6",
    description: "Kling 2.6 - High-quality video with native audio support.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["kling", "kling-2.6"],
    creditCost: 100,
    priority: 14,
    sortOrder: 14,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "kling/text-to-video",
      generateType: "text-to-video",
      hasAudio: true,
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }],
          default: "720p", affectsPricing: true },
      ],
      pricingTiers: { "720p-5s": 100, "720p-10s": 200, "1080p-5s": 150, "1080p-10s": 300 },
      pricingFormula: "matrix",
    } as ModelDefinition,
  },
  {
    modelId: "kling/image-to-video",
    name: "Kling 2.6 Image-to-Video",
    description: "Transform images into videos with Kling 2.6.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["kling-i2v"],
    creditCost: 100,
    priority: 16,
    sortOrder: 16,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "kling/image-to-video",
      generateType: "image-to-video",
      inputFields: [
        { key: "image_urls", label: "Source Image", type: "image_urls", required: true },
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 100, "10s": 200 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },
  {
    modelId: "kling-2.6/motion-control",
    name: "Kling 2.6 Motion Control",
    description: "Kling 2.6 motion control video-to-video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["kling motion control 2.6", "kling motion-control 2.6", "kling-2.6 motion control"],
    creditCost: 100,
    priority: 15,
    sortOrder: 15,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "kling-2.6/motion-control",
      generateType: "video-to-video",
      inputFields: [
        { key: "input_urls", label: "Reference Image", type: "image_urls", required: true },
        { key: "video_urls", label: "Motion Video", type: "video_urls", required: true },
      ],
      pricingTiers: { default: 100 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "kling-3.0/motion-control",
    name: "Kling 3.0 Motion Control",
    description: "Kling 3.0 motion control video-to-video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["kling motion control", "kling motion-control", "kling-3 motion control", "kling-3.0 motion control"],
    creditCost: 100,
    priority: 16,
    sortOrder: 16,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "kling-3.0/motion-control",
      generateType: "video-to-video",
      inputFields: [
        { key: "input_urls", label: "Reference Image", type: "image_urls", required: true },
        { key: "video_urls", label: "Motion Video", type: "video_urls", required: true },
        {
          key: "mode",
          label: "Mode",
          type: "select",
          options: [
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
          ],
          default: "720p",
        },
        {
          key: "character_orientation",
          label: "Character Orientation",
          type: "select",
          options: [
            { value: "image", label: "Image" },
            { value: "video", label: "Video" },
          ],
          default: "image",
        },
        {
          key: "background_source",
          label: "Background Source",
          type: "select",
          options: [
            { value: "input_image", label: "Input Image" },
            { value: "input_video", label: "Input Video" },
          ],
          default: "input_video",
        },
      ],
      pricingTiers: { default: 100 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "kling/v2-5-turbo-text-to-video-pro",
    name: "Kling 2.5 Turbo Pro",
    description: "Kling 2.5 Turbo Pro - Fast high-quality video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["kling-turbo", "kling-2.5"],
    creditCost: 75,
    priority: 17,
    sortOrder: 17,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "kling/v2-5-turbo-text-to-video-pro",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 75, "10s": 150 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },
  {
    modelId: "kling/v2-1-master-text-to-video",
    name: "Kling 2.1 Master",
    description: "Kling 2.1 Master - Premium quality video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["kling-master"],
    creditCost: 125,
    priority: 13,
    sortOrder: 13,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "kling/v2-1-master-text-to-video",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }],
          default: "1080p", affectsPricing: true },
      ],
      pricingTiers: { "720p-5s": 125, "720p-10s": 250, "1080p-5s": 200, "1080p-10s": 400 },
      pricingFormula: "matrix",
    } as ModelDefinition,
  },
  {
    modelId: "kling/ai-avatar-pro",
    name: "Kling AI Avatar Pro",
    description: "Create AI avatar videos with Kling.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["kling-avatar"],
    creditCost: 150,
    priority: 19,
    sortOrder: 19,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "kling/ai-avatar-pro",
      generateType: "avatar",
      inputFields: [
        { key: "image_urls", label: "Avatar Reference", type: "image_urls", required: true },
        { key: "audio_urls", label: "Audio Source", type: "audio_urls" },
      ],
      pricingTiers: { "default": 150 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Wan ===
  {
    modelId: "wan/2-6-text-to-video",
    name: "Wan 2.6",
    description: "Wan 2.6 - Multi-shot HD video with native audio.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["wan", "wan-2.6"],
    creditCost: 75,
    priority: 20,
    sortOrder: 20,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "wan/2-6-text-to-video",
      generateType: "text-to-video",
      hasAudio: true,
      maxDuration: 15,
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }, { value: "15", label: "15s" }],
          default: "5", affectsPricing: true },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }],
          default: "720p", affectsPricing: true },
        { key: "multi_shots", label: "Multi-shot", type: "boolean", default: false },
      ],
      pricingTiers: {
        "720p-5s": 75, "720p-10s": 150, "720p-15s": 225,
        "1080p-5s": 110, "1080p-10s": 220, "1080p-15s": 330,
      },
      pricingFormula: "matrix",
    } as ModelDefinition,
  },
  {
    modelId: "wan/2-6-image-to-video",
    name: "Wan 2.6 Image-to-Video",
    description: "Transform images into videos with Wan 2.6.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["wan-i2v"],
    creditCost: 75,
    priority: 22,
    sortOrder: 22,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "wan/2-6-image-to-video",
      generateType: "image-to-video",
      maxDuration: 15,
      inputFields: [
        { key: "image_urls", label: "Source Image", type: "image_urls", required: true },
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }, { value: "15", label: "15s" }],
          default: "5", affectsPricing: true },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }],
          default: "720p", affectsPricing: true },
      ],
      pricingTiers: {
        "720p-5s": 75, "720p-10s": 150, "720p-15s": 225,
        "1080p-5s": 110, "1080p-10s": 220, "1080p-15s": 330,
      },
      pricingFormula: "matrix",
    } as ModelDefinition,
  },
  {
    modelId: "wan/2-2-a14b-text-to-video-turbo",
    name: "Wan 2.2 Turbo",
    description: "Wan 2.2 A14B Turbo - Fast video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["wan-turbo", "wan-2.2"],
    creditCost: 50,
    priority: 24,
    sortOrder: 24,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "wan/2-2-a14b-text-to-video-turbo",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 50, "10s": 100 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },

  // === Hailuo ===
  {
    modelId: "hailuo/02-text-to-video-pro",
    name: "Hailuo Pro",
    description: "Hailuo Pro - Professional video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["hailuo", "hailuo-pro"],
    creditCost: 125,
    priority: 25,
    sortOrder: 25,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "hailuo/02-text-to-video-pro",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 125, "10s": 250 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },
  {
    modelId: "hailuo/2-3-text-to-video",
    name: "Hailuo 2.3",
    description: "Hailuo 2.3 - Latest version with improved quality.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["hailuo-2.3"],
    creditCost: 150,
    priority: 23,
    sortOrder: 23,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "hailuo/2-3-text-to-video",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 150, "10s": 300 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },

  // === Grok Video ===
  {
    modelId: "grok-imagine/text-to-video",
    name: "Grok Imagine Video",
    description: "xAI Grok Imagine - Text-to-video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["grok-video", "grok-imagine-video"],
    creditCost: 100,
    priority: 26,
    sortOrder: 26,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "grok-imagine/text-to-video",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 100, "10s": 200 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },
  {
    modelId: "grok-imagine/image-to-video",
    name: "Grok Imagine I2V",
    description: "xAI Grok Imagine - Image-to-video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["grok-i2v"],
    creditCost: 75,
    priority: 27,
    sortOrder: 27,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "grok-imagine/image-to-video",
      generateType: "image-to-video",
      inputFields: [
        { key: "image_urls", label: "Source Image", type: "image_urls", required: true },
        { key: "mode", label: "Mode", type: "select",
          options: [{ value: "natural", label: "Natural" }, { value: "cinematic", label: "Cinematic" }],
          default: "natural" },
      ],
      pricingTiers: { "default": 75 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Bytedance/Seedance ===
  {
    modelId: "bytedance/seedance-1.5-pro",
    name: "Seedance 1.5 Pro",
    description: "Bytedance Seedance 1.5 Pro - Professional video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["seedance", "seedance-pro"],
    creditCost: 150,
    priority: 28,
    sortOrder: 28,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "bytedance/seedance-1.5-pro",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 150, "10s": 300 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },
  {
    modelId: "bytedance/v1-pro-text-to-video",
    name: "Bytedance V1 Pro",
    description: "Bytedance V1 Pro - High-quality video generation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["bytedance-pro"],
    creditCost: 125,
    priority: 29,
    sortOrder: 29,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "bytedance/v1-pro-text-to-video",
      generateType: "text-to-video",
      inputFields: [
        { key: "duration", label: "Duration", type: "select",
          options: [{ value: "5", label: "5s" }, { value: "10", label: "10s" }],
          default: "5", affectsPricing: true },
      ],
      pricingTiers: { "5s": 125, "10s": 250 },
      pricingFormula: "per_duration",
    } as ModelDefinition,
  },

  // === Luma ===
  {
    modelId: "luma-modify",
    name: "Luma Modify",
    description: "Luma Modify - Video-to-video transformation.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["luma", "luma-modify"],
    creditCost: 100,
    priority: 30,
    sortOrder: 30,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "luma-modify",
      generateType: "video-to-video",
      inputFields: [
        { key: "video_urls", label: "Source Video", type: "video_urls", required: true },
      ],
      pricingTiers: { "default": 100 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Utilities ===
  {
    modelId: "topaz/video-upscale",
    name: "Topaz Video Upscale",
    description: "Upscale videos to higher resolution with AI.",
    modelType: "video",
    provider: "kie.ai",
    aliases: ["video-upscale", "topaz-video"],
    creditCost: 50,
    priority: 50,
    sortOrder: 50,
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "topaz/video-upscale",
      generateType: "upscale",
      inputFields: [
        { key: "video_urls", label: "Source Video", type: "video_urls", required: true },
      ],
      pricingTiers: { "default": 50 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
];

// Image Models - Complete Kie AI catalog
const IMAGE_MODELS = [
  // === GPT-4o / OpenAI ===
  {
    modelId: "gpt-4o-image",
    name: "GPT-4o Image",
    description: "OpenAI GPT-4o native image generation with excellent instruction following.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["4o-image", "gpt4o-image", "openai-image"],
    creditCost: 60,
    priority: 5,
    sortOrder: 5,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "gpt-4o-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "gpt-image/1.5-text-to-image",
    name: "GPT Image 1.5",
    description: "OpenAI GPT Image 1.5 - Enhanced text-to-image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["gpt-image-1.5"],
    creditCost: 70,
    priority: 6,
    sortOrder: 6,
    aspectRatios: ["1:1", "2:3", "3:2"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "gpt-image/1.5-text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "2:3", label: "2:3 (Portrait)" }, { value: "3:2", label: "3:2 (Landscape)" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 70 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "gpt-image-2-text-to-image",
    name: "GPT Image 2 Text-to-Image",
    description: "OpenAI GPT Image 2 text-to-image generation via Kie AI createTask.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["gpt-image-2", "gpt image 2", "gpt image 2 text to image", "openai gpt image 2"],
    creditCost: 70,
    priority: 7,
    sortOrder: 7,
    aspectRatios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "gpt-image-2-text-to-image",
      documentationUrl: "https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [
            { value: "auto", label: "Auto" },
            { value: "1:1", label: "1:1" },
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "4:3", label: "4:3" },
            { value: "3:4", label: "3:4" },
          ],
          default: "auto",
          syncWith: "aspect_ratio" },
        { key: "nsfw_checker", label: "NSFW Checker", type: "boolean", default: false },
      ],
      pricingTiers: { "default": 70 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "gpt-image-2-image-to-image",
    name: "GPT Image 2 Image-to-Image",
    description: "OpenAI GPT Image 2 image-to-image generation via Kie AI createTask.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["gpt-image-2-image-to-image", "gpt image 2 image to image", "gpt-image-2-edit", "gpt image 2 edit"],
    creditCost: 70,
    priority: 8,
    sortOrder: 8,
    aspectRatios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "gpt-image-2-image-to-image",
      documentationUrl: "https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image",
      generateType: "image-to-image",
      supportsReferenceImages: true,
      maxReferenceImages: 4,
      inputFields: [
        { key: "input_urls", label: "Reference Images", type: "image_urls", required: true, syncWith: "reference_images" },
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [
            { value: "auto", label: "Auto" },
            { value: "1:1", label: "1:1" },
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
            { value: "4:3", label: "4:3" },
            { value: "3:4", label: "3:4" },
          ],
          default: "auto",
          syncWith: "aspect_ratio" },
        { key: "nsfw_checker", label: "NSFW Checker", type: "boolean", default: false },
      ],
      pricingTiers: { "default": 70 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Google Imagen ===
  {
    modelId: "google/imagen4",
    name: "Google Imagen 4",
    description: "Google Imagen 4 - Latest Google image generation model.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["imagen4", "google-imagen"],
    creditCost: 50,
    priority: 7,
    sortOrder: 7,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "google/imagen4",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 50 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "google/imagen4-fast",
    name: "Google Imagen 4 Fast",
    description: "Google Imagen 4 Fast - Quick image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["imagen4-fast"],
    creditCost: 25,
    priority: 12,
    sortOrder: 12,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "google/imagen4-fast",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 25 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "google/imagen4-ultra",
    name: "Google Imagen 4 Ultra",
    description: "Google Imagen 4 Ultra - Highest quality.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["imagen4-ultra"],
    creditCost: 100,
    priority: 4,
    sortOrder: 4,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "google/imagen4-ultra",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 100 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Nano Banana (Google) ===
  {
    modelId: "google/nano-banana",
    name: "Nano Banana",
    description: "Google Nano Banana - Fast and precise AI image generation with realistic physics.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["nano-banana", "banana"],
    creditCost: 20,
    priority: 15,
    sortOrder: 15,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "nano-banana",
      generateType: "text-to-image",
      inputFields: [
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }],
          default: "1K", affectsPricing: true },
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "1K": 20, "2K": 20 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "google-banana-2",
    name: "Google Banana 2",
    description: "Google Banana 2 (Gemini 3.1 Flash Image) - Fast 4K image generation with strong character consistency and editing support.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["google banana 2", "banana-2", "nano-banana-2", "google/nano-banana-2"],
    creditCost: 40,
    priority: 11,
    sortOrder: 11,
    aspectRatios: ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9", "auto"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "nano-banana-2",
      generateType: "text-to-image",
      maxPromptLength: 20000,
      inputFields: [
        { key: "image_input", label: "Reference Images", type: "image_urls" },
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [
            { value: "1:1", label: "1:1" }, { value: "1:4", label: "1:4" }, { value: "1:8", label: "1:8" },
            { value: "2:3", label: "2:3" }, { value: "3:2", label: "3:2" }, { value: "3:4", label: "3:4" },
            { value: "4:1", label: "4:1" }, { value: "4:3", label: "4:3" }, { value: "4:5", label: "4:5" },
            { value: "5:4", label: "5:4" }, { value: "8:1", label: "8:1" }, { value: "9:16", label: "9:16" },
            { value: "16:9", label: "16:9" }, { value: "21:9", label: "21:9" }, { value: "auto", label: "Auto" },
          ],
          default: "1:1" },
        { key: "google_search", label: "Google Search", type: "boolean", default: false },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }, { value: "4K", label: "4K" }],
          default: "1K", affectsPricing: true },
        { key: "output_format", label: "Format", type: "select",
          options: [{ value: "jpg", label: "JPG" }, { value: "png", label: "PNG" }],
          default: "jpg" },
      ],
      pricingTiers: { "1K": 40, "2K": 60, "4K": 90 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "google/pro-image-to-image",
    name: "Nano Banana Pro",
    description: "Nano Banana Pro - Advanced image editing and generation with 1K/2K/4K output.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["nano-banana-pro", "banana-pro"],
    creditCost: 40,
    priority: 10,
    sortOrder: 10,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2", "4:5", "5:4", "21:9"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "nano-banana-pro",
      generateType: "image-to-image",
      inputFields: [
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }, { value: "4K", label: "4K" }],
          default: "1K", affectsPricing: true },
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [
            { value: "1:1", label: "1:1" }, { value: "2:3", label: "2:3" }, { value: "3:2", label: "3:2" },
            { value: "3:4", label: "3:4" }, { value: "4:3", label: "4:3" }, { value: "4:5", label: "4:5" },
            { value: "5:4", label: "5:4" }, { value: "9:16", label: "9:16" }, { value: "16:9", label: "16:9" },
            { value: "21:9", label: "21:9" }, { value: "auto", label: "Auto" },
          ],
          default: "1:1" },
        { key: "output_format", label: "Format", type: "select",
          options: [{ value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }],
          default: "png" },
        { key: "image_input", label: "Reference Images", type: "image_urls" },
      ],
      pricingTiers: { "1K": 40, "2K": 40, "4K": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "google/nano-banana-edit",
    name: "Nano Banana Edit",
    description: "Nano Banana Edit - AI-powered image editing.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["nano-banana-edit", "banana-edit"],
    creditCost: 40,
    priority: 14,
    sortOrder: 14,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "nano-banana-edit",
      generateType: "edit",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
        { key: "resolution", label: "Resolution", type: "select",
          options: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }],
          default: "1K" },
      ],
      pricingTiers: { "default": 40 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Flux ===
  {
    modelId: "flux-kontext",
    name: "Flux Kontext",
    description: "Flux Kontext - Context-aware image editing and generation by Black Forest Labs.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["flux-kontext", "kontext"],
    creditCost: 50,
    priority: 8,
    sortOrder: 8,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "flux-kontext",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
        { key: "image_input", label: "Reference Image", type: "image_urls" },
      ],
      pricingTiers: { "default": 50 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "flux-2/pro-text-to-image",
    name: "Flux 2 Pro",
    description: "Flux 2 Pro - Latest professional image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["flux-2-pro", "flux2-pro"],
    creditCost: 45,
    priority: 9,
    sortOrder: 9,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "flux-2/pro-text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 45 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "flux-2/flex-text-to-image",
    name: "Flux 2 Flex",
    description: "Flux 2 Flex - Flexible text-to-image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["flux-2-flex", "flux2"],
    creditCost: 30,
    priority: 16,
    sortOrder: 16,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "flux-2/flex-text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 30 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Grok Imagine ===
  {
    modelId: "grok-imagine/text-to-image",
    name: "Grok Imagine",
    description: "xAI Grok Imagine - Text-to-image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["grok", "grok-imagine", "grok-image"],
    creditCost: 40,
    priority: 11,
    sortOrder: 11,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "grok-imagine/text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 40 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "grok-imagine/image-to-image",
    name: "Grok Imagine I2I",
    description: "xAI Grok Imagine - Image-to-image transformation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["grok-i2i"],
    creditCost: 35,
    priority: 17,
    sortOrder: 17,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "grok-imagine/image-to-image",
      generateType: "image-to-image",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 35 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "grok-imagine/upscale",
    name: "Grok Upscale",
    description: "xAI Grok - Image upscaling.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["grok-upscale"],
    creditCost: 20,
    priority: 40,
    sortOrder: 40,
    aspectRatios: ["1:1"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "grok-imagine/upscale",
      generateType: "upscale",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
      ],
      pricingTiers: { "default": 20 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Seedream ===
  {
    modelId: "seedream",
    name: "Seedream 3.0",
    description: "Seedream 3.0 - Dreamlike image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["seedream-3", "seedream3"],
    creditCost: 25,
    priority: 20,
    sortOrder: 20,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "seedream",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 25 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "seedream/seedream-v4-text-to-image",
    name: "Seedream 4.0",
    description: "Seedream 4.0 - Enhanced dreamlike image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["seedream-4", "seedream4"],
    creditCost: 35,
    priority: 18,
    sortOrder: 18,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "seedream/seedream-v4-text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 35 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "seedream/4.5-text-to-image",
    name: "Seedream 4.5",
    description: "Seedream 4.5 - Latest version with best quality.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["seedream-4.5", "seedream45"],
    creditCost: 45,
    priority: 13,
    sortOrder: 13,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "seedream/4.5-text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "quality", label: "Quality", type: "select",
          options: [{ value: "basic", label: "Basic" }, { value: "high", label: "High" }],
          default: "high", affectsPricing: true },
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
      ],
      pricingTiers: { "basic": 35, "high": 45 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Ideogram ===
  {
    modelId: "ideogram/character",
    name: "Ideogram Character",
    description: "Ideogram Character - Consistent character generation with excellent text rendering.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["ideogram", "ideogram-character"],
    creditCost: 50,
    priority: 19,
    sortOrder: 19,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "ideogram/character",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
        { key: "image_input", label: "Character Reference", type: "image_urls" },
      ],
      pricingTiers: { "default": 50 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "ideogram/v3-reframe",
    name: "Ideogram V3 Reframe",
    description: "Ideogram V3 Reframe - Reframe and extend images.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["ideogram-reframe"],
    creditCost: 40,
    priority: 25,
    sortOrder: 25,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "ideogram/v3-reframe",
      generateType: "reframe",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
        { key: "aspect_ratio", label: "Target Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "16:9" },
      ],
      pricingTiers: { "default": 40 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Qwen ===
  {
    modelId: "qwen/text-to-image",
    name: "Qwen Image",
    description: "Alibaba Qwen - Text-to-image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["qwen", "qwen-image"],
    creditCost: 30,
    priority: 22,
    sortOrder: 22,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "qwen/text-to-image",
      generateType: "text-to-image",
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 30 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "qwen/image-edit",
    name: "Qwen Image Edit",
    description: "Alibaba Qwen - AI image editing.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["qwen-edit"],
    creditCost: 25,
    priority: 26,
    sortOrder: 26,
    aspectRatios: ["1:1", "16:9", "9:16"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "qwen/image-edit",
      generateType: "edit",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
      ],
      pricingTiers: { "default": 25 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Z-Image ===
  {
    modelId: "z-image",
    name: "Z-Image",
    description: "Z-Image - High quality image generation.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["z-image", "zimage"],
    creditCost: 35,
    priority: 21,
    sortOrder: 21,
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "z-image",
      generateType: "text-to-image",
      maxPromptLength: 500, // Kie.ai limit for z-image
      inputFields: [
        { key: "aspect_ratio", label: "Aspect Ratio", type: "select",
          options: [{ value: "1:1", label: "1:1" }, { value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }],
          default: "1:1" },
      ],
      pricingTiers: { "default": 35 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Recraft ===
  {
    modelId: "recraft/crisp-upscale",
    name: "Recraft Upscale",
    description: "Recraft Crisp Upscale - Professional image upscaling.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["recraft-upscale", "crisp-upscale"],
    creditCost: 25,
    priority: 35,
    sortOrder: 35,
    aspectRatios: ["1:1"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "recraft/crisp-upscale",
      generateType: "upscale",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
      ],
      pricingTiers: { "default": 25 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "recraft/remove-background",
    name: "Background Removal",
    description: "Recraft - AI background removal.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["remove-bg", "bg-remove"],
    creditCost: 10,
    priority: 36,
    sortOrder: 36,
    aspectRatios: ["1:1"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "recraft/remove-background",
      generateType: "remove-background",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
      ],
      pricingTiers: { "default": 10 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Topaz ===
  {
    modelId: "topaz/image-upscale",
    name: "Topaz Image Upscale",
    description: "Topaz - Professional AI image upscaling.",
    modelType: "image",
    provider: "kie.ai",
    aliases: ["topaz-upscale", "topaz"],
    creditCost: 30,
    priority: 34,
    sortOrder: 34,
    aspectRatios: ["1:1"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "topaz/image-upscale",
      generateType: "upscale",
      inputFields: [
        { key: "image_input", label: "Source Image", type: "image_urls", required: true },
      ],
      pricingTiers: { "default": 30 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
];

// Audio/Music Models - Complete Kie AI catalog
const AUDIO_MODELS = [
  // === Suno Music ===
  {
    modelId: "suno/generate-music",
    name: "Suno V4.5 Plus",
    description: "Suno V4.5 Plus - Premium AI music generation with enhanced vocals, up to 8 minutes.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["suno", "suno-plus", "suno-4.5"],
    creditCost: 60,
    priority: 2,
    sortOrder: 2,
    voices: ["default"],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: "V4_5PLUS",
      generateType: "music-generation",
      maxDuration: 480,
      inputFields: [
        { key: "instrumental", label: "Instrumental Only", type: "boolean", default: false },
        { key: "customMode", label: "Custom Mode", type: "boolean", default: false },
        { key: "style", label: "Music Style", type: "text" },
        { key: "title", label: "Track Title", type: "text" },
      ],
      pricingTiers: { "default": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/extend-music",
    name: "Suno Extend",
    description: "Extend existing songs with Suno AI.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["suno-extend"],
    creditCost: 60,
    priority: 8,
    sortOrder: 8,
    voices: ["default"],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: "V4_5PLUS",
      generateType: "music-extend",
      inputFields: [
        { key: "audio_urls", label: "Source Audio", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/cover-suno",
    name: "Suno Music Cover",
    description: "Create AI covers of songs with different voices.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["suno-cover", "music-cover"],
    creditCost: 60,
    priority: 6,
    sortOrder: 6,
    voices: ["various"],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: null,
      generateType: "music-cover",
      inputFields: [
        { key: "audio_urls", label: "Source Audio", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/add-vocals",
    name: "Suno Add Vocals",
    description: "Add vocals to instrumental tracks.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["add-vocals"],
    creditCost: 60,
    priority: 10,
    sortOrder: 10,
    voices: ["various"],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: null,
      generateType: "add-vocals",
      inputFields: [
        { key: "audio_urls", label: "Instrumental Track", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/add-instrumental",
    name: "Suno Add Instrumental",
    description: "Add instrumental to vocal tracks.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["add-instrumental"],
    creditCost: 60,
    priority: 11,
    sortOrder: 11,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: null,
      generateType: "add-instrumental",
      inputFields: [
        { key: "audio_urls", label: "Vocal Track", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/separate-vocals",
    name: "Vocal & Instrument Separation",
    description: "Separate vocals from instrumentals (karaoke maker).",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["vocal-removal", "karaoke", "stem-split"],
    creditCost: 50,
    priority: 12,
    sortOrder: 12,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: null,
      generateType: "vocal-separation",
      inputFields: [
        { key: "audio_urls", label: "Source Audio", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 50 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/generate-lyrics",
    name: "AI Lyrics Generator",
    description: "Generate song lyrics with AI.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["lyrics", "generate-lyrics"],
    creditCost: 5,
    priority: 15,
    sortOrder: 15,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: null,
      generateType: "lyrics",
      inputFields: [
        { key: "style", label: "Music Style", type: "text" },
        { key: "title", label: "Song Title", type: "text" },
      ],
      pricingTiers: { "default": 5 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/generate-midi",
    name: "MIDI Generation",
    description: "Convert audio to MIDI or generate MIDI from prompts.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["midi", "audio-to-midi"],
    creditCost: 5,
    priority: 18,
    sortOrder: 18,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: null,
      generateType: "midi",
      inputFields: [
        { key: "audio_urls", label: "Source Audio (optional)", type: "audio_urls" },
      ],
      pricingTiers: { "default": 5 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "suno/create-music-video",
    name: "AI Music Video",
    description: "Create AI-generated music videos.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["music-video"],
    creditCost: 60,
    priority: 5,
    sortOrder: 5,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/generate",
      apiPayloadFormat: "suno",
      kieModelId: null,
      generateType: "music-video",
      inputFields: [
        { key: "audio_urls", label: "Music Track", type: "audio_urls" },
        { key: "style", label: "Visual Style", type: "text" },
      ],
      pricingTiers: { "default": 60 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === ElevenLabs ===
  {
    modelId: "elevenlabs/text-to-speech-multilingual-v2",
    name: "ElevenLabs TTS",
    description: "ElevenLabs Text-to-Speech - Ultra-realistic multilingual voice synthesis.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["elevenlabs", "tts", "text-to-speech"],
    creditCost: 15,
    priority: 3,
    sortOrder: 3,
    voices: ["rachel", "adam", "antoni", "bella", "domi", "elli", "josh"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "elevenlabs",
      kieModelId: "elevenlabs/text-to-speech-multilingual-v2",
      generateType: "text-to-speech",
      inputFields: [
        { key: "voice", label: "Voice", type: "select",
          options: [
            { value: "rachel", label: "Rachel" }, { value: "adam", label: "Adam" },
            { value: "antoni", label: "Antoni" }, { value: "bella", label: "Bella" },
            { value: "domi", label: "Domi" }, { value: "elli", label: "Elli" },
            { value: "josh", label: "Josh" },
          ],
          default: "rachel" },
        { key: "speed", label: "Speed", type: "number", default: 1.0 },
      ],
      pricingTiers: { "default": 15 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "elevenlabs/text-to-speech-turbo-2-5",
    name: "ElevenLabs TTS Turbo",
    description: "ElevenLabs TTS Turbo 2.5 - Fast text-to-speech.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["elevenlabs-turbo", "tts-fast"],
    creditCost: 10,
    priority: 7,
    sortOrder: 7,
    voices: ["default"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "elevenlabs",
      kieModelId: "elevenlabs/text-to-speech-turbo-2-5",
      generateType: "text-to-speech",
      inputFields: [
        { key: "voice", label: "Voice", type: "select",
          options: [{ value: "default", label: "Default" }],
          default: "default" },
      ],
      pricingTiers: { "default": 10 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "elevenlabs/text-to-dialogue-v3",
    name: "ElevenLabs Dialogue",
    description: "ElevenLabs Text-to-Dialogue - Generate multi-speaker conversations.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["dialogue", "multi-speaker"],
    creditCost: 70,
    priority: 9,
    sortOrder: 9,
    voices: ["multiple"],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "elevenlabs",
      kieModelId: "elevenlabs/text-to-dialogue-v3",
      generateType: "dialogue",
      apiConfig: {
        omit_text: "true",
        prepend_newline: true,
        apply_text_affix_to_dialogue: true,
      },
      inputFields: [
        {
          key: "voice",
          label: "Voice",
          type: "select",
          searchable: true,
          options: FALLBACK_ELEVENLABS_VOICES,
          optionsSource: {
            type: "public_api",
            endpoint: ELEVENLABS_VOICE_LIST_URL,
            method: "GET",
            itemsPath: "voices",
            valueField: "voice_id",
            labelField: "name",
            cacheTtlSeconds: 86400,
          },
          default: FALLBACK_ELEVENLABS_VOICES[0]?.value || "Adam",
        },
        {
          key: "dialogue",
          label: "Dialogue",
          type: "array",
          syncWith: "prompt",
          itemTemplate: {
            text: "{{item}}",
            voice: "{{fields.voice}}",
          },
        },
      ],
      pricingTiers: { "default": 70 },
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "dialogue",
      pricingUnitSize: 1000,
      pricingUnitRounding: "ceil",
      pricingMinUnits: 1,
    } as ModelDefinition,
  },
  {
    modelId: "elevenlabs/sound-effect-v2",
    name: "AI Sound Effects",
    description: "ElevenLabs Sound Effects V2 - Generate custom sound effects.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["sfx", "sound-effects"],
    creditCost: 20,
    priority: 14,
    sortOrder: 14,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "elevenlabs",
      kieModelId: "elevenlabs/sound-effect-v2",
      generateType: "sound-effects",
      maxDuration: 30,
      inputFields: [],
      pricingTiers: { "default": 20 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "elevenlabs/audio-isolation",
    name: "Audio Isolation",
    description: "ElevenLabs Audio Isolation - Remove background noise.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["noise-removal", "audio-clean"],
    creditCost: 15,
    priority: 16,
    sortOrder: 16,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "elevenlabs",
      kieModelId: "elevenlabs/audio-isolation",
      generateType: "audio-isolation",
      inputFields: [
        { key: "audio_urls", label: "Source Audio", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 15 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
  {
    modelId: "elevenlabs/speech-to-text",
    name: "Speech to Text",
    description: "ElevenLabs Speech-to-Text - Accurate transcription.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["stt", "transcribe"],
    creditCost: 10,
    priority: 17,
    sortOrder: 17,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "elevenlabs",
      kieModelId: "elevenlabs/speech-to-text",
      generateType: "speech-to-text",
      inputFields: [
        { key: "audio_urls", label: "Audio File", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 10 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },

  // === Infinitalk ===
  {
    modelId: "infinitalk/from-audio",
    name: "Infinitalk",
    description: "Infinitalk - AI conversation and audio processing.",
    modelType: "audio",
    provider: "kie.ai",
    aliases: ["infinitalk"],
    creditCost: 30,
    priority: 20,
    sortOrder: 20,
    voices: [],
    configJson: {
      apiEndpoint: "/api/v1/jobs/createTask",
      apiPayloadFormat: "market",
      kieModelId: "infinitalk/from-audio",
      generateType: "audio-processing",
      inputFields: [
        { key: "audio_urls", label: "Source Audio", type: "audio_urls", required: true },
      ],
      pricingTiers: { "default": 30 },
      pricingFormula: "flat",
    } as ModelDefinition,
  },
];

async function seed() {
  console.log("Seeding Kie AI Media Models (Complete Catalog)...\n");
  console.log("Credit Rate: 1 USD = 1000 credits\n");

  const sql = postgres(DATABASE_URL);

  try {
    // Check if table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'media_models'
      )
    `;

    if (!tableExists[0].exists) {
      console.log("ERROR: media_models table does not exist. Please run migrations first.");
      await sql.end();
      return;
    }

    console.log("Using UPSERT mode (no destructive delete)\n");
    const elevenLabsVoiceOptions = await loadElevenLabsVoiceOptions();
    const audioModels = AUDIO_MODELS.map((model) => {
      if (model.modelId !== "elevenlabs/text-to-dialogue-v3") {
        return model;
      }
      const defaultVoiceValue = elevenLabsVoiceOptions[0]?.value || "Adam";
      const inputFields = model.configJson.inputFields.map((field) => {
        if (field.key !== "voice") {
          return field;
        }
        return {
          ...field,
          searchable: true,
          options: elevenLabsVoiceOptions,
          default: defaultVoiceValue,
        } satisfies InputField;
      });
      return {
        ...model,
        voices: elevenLabsVoiceOptions.map((entry) => entry.value),
        configJson: {
          ...model.configJson,
          inputFields,
        },
      };
    });

    // Upsert Video Models
    console.log("=== VIDEO MODELS ===");
    for (const model of VIDEO_MODELS) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "creditCost", priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${model.modelId},
          ${model.name},
          ${model.description},
          ${model.modelType},
          ${model.provider},
          ${JSON.stringify(model.aliases)},
          ${model.creditCost},
          ${model.priority},
          ${model.sortOrder},
          ${JSON.stringify(model.configJson)},
          true
        )
        ON CONFLICT ("modelId") DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          "modelType" = EXCLUDED."modelType",
          provider = EXCLUDED.provider,
          aliases = EXCLUDED.aliases,
          "creditCost" = EXCLUDED."creditCost",
          priority = EXCLUDED.priority,
          "sortOrder" = EXCLUDED."sortOrder",
          "configJson" = EXCLUDED."configJson",
          "isEnabled" = media_models."isEnabled"
      `;
      console.log(`  upsert ${model.name} (${model.creditCost} credits)`);
    }
    console.log(`\nUpserted ${VIDEO_MODELS.length} video models\n`);

    // Upsert Image Models
    console.log("=== IMAGE MODELS ===");
    for (const model of IMAGE_MODELS) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "aspectRatios", "creditCost", priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${model.modelId},
          ${model.name},
          ${model.description},
          ${model.modelType},
          ${model.provider},
          ${JSON.stringify(model.aliases)},
          ${JSON.stringify(model.aspectRatios)},
          ${model.creditCost},
          ${model.priority},
          ${model.sortOrder},
          ${JSON.stringify(model.configJson)},
          true
        )
        ON CONFLICT ("modelId") DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          "modelType" = EXCLUDED."modelType",
          provider = EXCLUDED.provider,
          aliases = EXCLUDED.aliases,
          "aspectRatios" = EXCLUDED."aspectRatios",
          "creditCost" = EXCLUDED."creditCost",
          priority = EXCLUDED.priority,
          "sortOrder" = EXCLUDED."sortOrder",
          "configJson" = EXCLUDED."configJson",
          "isEnabled" = media_models."isEnabled"
      `;
      console.log(`  upsert ${model.name} (${model.creditCost} credits)`);
    }
    console.log(`\nUpserted ${IMAGE_MODELS.length} image models\n`);

    // Upsert Audio Models
    console.log("=== AUDIO MODELS ===");
    for (const model of audioModels) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, voices, "creditCost", priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${model.modelId},
          ${model.name},
          ${model.description},
          ${model.modelType},
          ${model.provider},
          ${JSON.stringify(model.aliases)},
          ${JSON.stringify(model.voices)},
          ${model.creditCost},
          ${model.priority},
          ${model.sortOrder},
          ${JSON.stringify(model.configJson)},
          true
        )
        ON CONFLICT ("modelId") DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          "modelType" = EXCLUDED."modelType",
          provider = EXCLUDED.provider,
          aliases = EXCLUDED.aliases,
          voices = EXCLUDED.voices,
          "creditCost" = EXCLUDED."creditCost",
          priority = EXCLUDED.priority,
          "sortOrder" = EXCLUDED."sortOrder",
          "configJson" = EXCLUDED."configJson",
          "isEnabled" = media_models."isEnabled"
      `;
      console.log(`  upsert ${model.name} (${model.creditCost} credits)`);
    }
    console.log(`\nUpserted ${audioModels.length} audio models\n`);

    // Summary
    const total = VIDEO_MODELS.length + IMAGE_MODELS.length + audioModels.length;
    console.log("=".repeat(50));
    console.log(`TOTAL: ${total} Kie AI models seeded successfully!`);
    console.log(`  - Video: ${VIDEO_MODELS.length} models`);
    console.log(`  - Image: ${IMAGE_MODELS.length} models`);
    console.log(`  - Audio: ${audioModels.length} models`);
    console.log("=".repeat(50));

  } catch (error) {
    console.error("Error seeding models:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
