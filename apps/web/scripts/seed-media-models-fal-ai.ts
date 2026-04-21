/**
 * Seed fal.ai Media Models
 * Run with: npx tsx scripts/seed-media-models-fal-ai.ts
 *
 * Credit conversion:
 * - Platform: 1 USD = 1000 credits (1 credit = $0.001)
 * - fal.ai LTX-2.3 video: $0.036–$0.24 per clip (resolution × duration matrix)
 * - fal.ai Gemini 3.1 Flash TTS: ~$0.15 per 1000 characters
 * - fal.ai Lux TTS: ~$0.0014 per 1000 characters
 * - fal.ai Flux image: $0.01–$0.03 per image (flat)
 *
 * Pricing reference: fal.ai — https://fal.ai/pricing
 * Last updated: March 2026
 *
 * NOTE: Credit costs are estimates — verify against your fal.ai invoice and
 *       adjust per model via Admin > Media Models after seeding.
 */

import postgres from "postgres";
import {
  GEMINI_3_1_FLASH_TTS_CREDIT_COST,
  GEMINI_3_1_FLASH_TTS_MODEL_ID,
  buildGemini31FlashTtsInputFields,
} from "../server/services/falGeminiTts";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

// ============================================================
// Model Definition Types (for configJson)
// ============================================================
interface InputField {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls" | "array";
  options?: { value: string; label: string }[];
  default?: unknown;
  required?: boolean;
  affectsPricing?: boolean;
  placeholder?: string;
  description?: string;
  searchable?: boolean;
  itemLabel?: string;
  itemFields?: InputField[];
  maxItems?: number;
  syncWith?: "none" | "reference_images" | "prompt" | "aspect_ratio";
}

interface ModelDefinition {
  apiPayloadFormat: "market" | "veo" | "runway" | "suno" | "elevenlabs" | "custom" | "byteplus";
  generateType: string;
  inputFields: InputField[];
  pricingTiers: Record<string, number>;
  pricingFormula: "flat" | "per_duration" | "matrix" | "per_unit";
  pricingUnitMetric?: "characters" | "items";
  pricingUnitField?: string;
  pricingUnitSize?: number;
  pricingUnitRounding?: "ceil" | "floor" | "round";
  pricingMinUnits?: number;
  hasAudio?: boolean;
  maxDuration?: number;
}

interface VideoModelEntry {
  modelId: string;
  name: string;
  description: string;
  modelType: "video";
  provider: "fal_ai";
  aliases: string[];
  aspectRatios: string[];
  durations: number[];
  creditCost: number;
  priority: number;
  sortOrder: number;
  configJson: ModelDefinition;
}

interface AudioModelEntry {
  modelId: string;
  name: string;
  description: string;
  modelType: "audio";
  provider: "fal_ai";
  aliases: string[];
  creditCost: number;
  priority: number;
  sortOrder: number;
  configJson: ModelDefinition;
}

interface ImageModelEntry {
  modelId: string;
  name: string;
  description: string;
  modelType: "image";
  provider: "fal_ai";
  aliases: string[];
  aspectRatios: string[];
  sizes: string[];
  creditCost: number;
  priority: number;
  sortOrder: number;
  configJson: ModelDefinition;
}

// ============================================================
// Video Models — LTX-2.3 Family (async queue generation)
// ============================================================
const VIDEO_MODELS: VideoModelEntry[] = [
  // --- LTX-2.3 Text to Video (Standard) ---
  {
    modelId: "fal-ai/ltx-2.3/text-to-video",
    name: "LTX-2.3 Text to Video",
    description: "fal.ai LTX-2.3 — standard quality text-to-video generation with resolution and duration pricing matrix.",
    modelType: "video",
    provider: "fal_ai",
    aliases: ["ltx", "ltx-2.3", "ltx-t2v", "fal-video"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [6, 8, 10],
    creditCost: 360,
    priority: 60,
    sortOrder: 60,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-video",
      inputFields: [
        {
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [
            { value: "1080p", label: "1080p" },
            { value: "1440p", label: "1440p (2K)" },
            { value: "2160p", label: "2160p (4K)" },
          ],
          default: "1080p",
          affectsPricing: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "6", label: "6s" },
            { value: "8", label: "8s" },
            { value: "10", label: "10s" },
          ],
          default: "6",
          affectsPricing: true,
        },
        {
          key: "seed",
          label: "Seed",
          type: "number",
        },
      ],
      pricingTiers: {
        "1080p-6s": 360, "1080p-8s": 480, "1080p-10s": 600,
        "1440p-6s": 720, "1440p-8s": 960, "1440p-10s": 1200,
        "2160p-6s": 1440, "2160p-8s": 1920, "2160p-10s": 2400,
        "default": 360,
      },
      pricingFormula: "matrix",
    },
  },

  // --- LTX-2.3 Text to Video (Fast) ---
  {
    modelId: "fal-ai/ltx-2.3/text-to-video/fast",
    name: "LTX-2.3 Text to Video (Fast)",
    description: "fal.ai LTX-2.3 Fast — faster text-to-video with extended duration range up to 20s.",
    modelType: "video",
    provider: "fal_ai",
    aliases: ["ltx-fast", "ltx-2.3-fast", "ltx-t2v-fast"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [6, 8, 10, 12, 14, 16, 18, 20],
    creditCost: 240,
    priority: 61,
    sortOrder: 61,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-video",
      inputFields: [
        {
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [
            { value: "1080p", label: "1080p" },
            { value: "1440p", label: "1440p (2K)" },
            { value: "2160p", label: "2160p (4K)" },
          ],
          default: "1080p",
          affectsPricing: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "6", label: "6s" },
            { value: "8", label: "8s" },
            { value: "10", label: "10s" },
            { value: "12", label: "12s" },
            { value: "14", label: "14s" },
            { value: "16", label: "16s" },
            { value: "18", label: "18s" },
            { value: "20", label: "20s" },
          ],
          default: "6",
          affectsPricing: true,
        },
        {
          key: "seed",
          label: "Seed",
          type: "number",
        },
      ],
      pricingTiers: {
        "1080p-6s": 240, "1080p-8s": 320, "1080p-10s": 400,
        "1080p-12s": 480, "1080p-14s": 560, "1080p-16s": 640,
        "1080p-18s": 720, "1080p-20s": 800,
        "1440p-6s": 480, "1440p-8s": 640, "1440p-10s": 800,
        "1440p-12s": 960, "1440p-14s": 1120, "1440p-16s": 1280,
        "1440p-18s": 1440, "1440p-20s": 1600,
        "2160p-6s": 960, "2160p-8s": 1280, "2160p-10s": 1600,
        "2160p-12s": 1920, "2160p-14s": 2240, "2160p-16s": 2560,
        "2160p-18s": 2880, "2160p-20s": 3200,
        "default": 240,
      },
      pricingFormula: "matrix",
    },
  },

  // --- LTX-2.3 Image to Video (Standard) ---
  {
    modelId: "fal-ai/ltx-2.3/image-to-video",
    name: "LTX-2.3 Image to Video",
    description: "fal.ai LTX-2.3 — standard quality image-to-video generation. Requires a source image.",
    modelType: "video",
    provider: "fal_ai",
    aliases: ["ltx-i2v", "ltx-2.3-i2v"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [6, 8, 10],
    creditCost: 360,
    priority: 62,
    sortOrder: 62,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "image-to-video",
      inputFields: [
        {
          key: "image_url",
          label: "Source Image",
          type: "image_urls",
          required: true,
        },
        {
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [
            { value: "1080p", label: "1080p" },
            { value: "1440p", label: "1440p (2K)" },
            { value: "2160p", label: "2160p (4K)" },
          ],
          default: "1080p",
          affectsPricing: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "6", label: "6s" },
            { value: "8", label: "8s" },
            { value: "10", label: "10s" },
          ],
          default: "6",
          affectsPricing: true,
        },
        {
          key: "seed",
          label: "Seed",
          type: "number",
        },
      ],
      pricingTiers: {
        "1080p-6s": 360, "1080p-8s": 480, "1080p-10s": 600,
        "1440p-6s": 720, "1440p-8s": 960, "1440p-10s": 1200,
        "2160p-6s": 1440, "2160p-8s": 1920, "2160p-10s": 2400,
        "default": 360,
      },
      pricingFormula: "matrix",
    },
  },

  // --- LTX-2.3 Image to Video (Fast) ---
  {
    modelId: "fal-ai/ltx-2.3/image-to-video/fast",
    name: "LTX-2.3 Image to Video (Fast)",
    description: "fal.ai LTX-2.3 Fast — faster image-to-video with extended duration range.",
    modelType: "video",
    provider: "fal_ai",
    aliases: ["ltx-i2v-fast", "ltx-2.3-i2v-fast"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [6, 8, 10, 12, 14, 16, 18, 20],
    creditCost: 240,
    priority: 63,
    sortOrder: 63,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "image-to-video",
      inputFields: [
        {
          key: "image_url",
          label: "Source Image",
          type: "image_urls",
          required: true,
        },
        {
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [
            { value: "1080p", label: "1080p" },
            { value: "1440p", label: "1440p (2K)" },
            { value: "2160p", label: "2160p (4K)" },
          ],
          default: "1080p",
          affectsPricing: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "6", label: "6s" },
            { value: "8", label: "8s" },
            { value: "10", label: "10s" },
            { value: "12", label: "12s" },
            { value: "14", label: "14s" },
            { value: "16", label: "16s" },
            { value: "18", label: "18s" },
            { value: "20", label: "20s" },
          ],
          default: "6",
          affectsPricing: true,
        },
        {
          key: "seed",
          label: "Seed",
          type: "number",
        },
      ],
      pricingTiers: {
        "1080p-6s": 240, "1080p-8s": 320, "1080p-10s": 400,
        "1080p-12s": 480, "1080p-14s": 560, "1080p-16s": 640,
        "1080p-18s": 720, "1080p-20s": 800,
        "1440p-6s": 480, "1440p-8s": 640, "1440p-10s": 800,
        "1440p-12s": 960, "1440p-14s": 1120, "1440p-16s": 1280,
        "1440p-18s": 1440, "1440p-20s": 1600,
        "2160p-6s": 960, "2160p-8s": 1280, "2160p-10s": 1600,
        "2160p-12s": 1920, "2160p-14s": 2240, "2160p-16s": 2560,
        "2160p-18s": 2880, "2160p-20s": 3200,
        "default": 240,
      },
      pricingFormula: "matrix",
    },
  },

  // --- LTX-2.3 Audio to Video ---
  {
    modelId: "fal-ai/ltx-2.3/audio-to-video",
    name: "LTX-2.3 Audio to Video",
    description: "fal.ai LTX-2.3 — audio-driven video generation. Requires an audio file.",
    modelType: "video",
    provider: "fal_ai",
    aliases: ["ltx-a2v", "ltx-2.3-a2v", "ltx-audio-video"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [5, 6, 8, 10, 12, 14, 16, 18, 20],
    creditCost: 600,
    priority: 64,
    sortOrder: 64,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "audio-to-video",
      hasAudio: true,
      inputFields: [
        {
          key: "audio_url",
          label: "Audio File",
          type: "audio_urls",
          required: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "6", label: "6s" },
            { value: "8", label: "8s" },
            { value: "10", label: "10s" },
            { value: "12", label: "12s" },
            { value: "14", label: "14s" },
            { value: "16", label: "16s" },
            { value: "18", label: "18s" },
            { value: "20", label: "20s" },
          ],
          default: "6",
          affectsPricing: true,
        },
        {
          key: "seed",
          label: "Seed",
          type: "number",
        },
      ],
      pricingTiers: {
        "5s": 500, "6s": 600, "8s": 800, "10s": 1000,
        "12s": 1200, "14s": 1400, "16s": 1600,
        "18s": 1800, "20s": 2000,
        "default": 600,
      },
      pricingFormula: "per_duration",
    },
  },

  // --- LTX-2.3 Extend Video ---
  {
    modelId: "fal-ai/ltx-2.3/extend-video",
    name: "LTX-2.3 Extend Video",
    description: "fal.ai LTX-2.3 — extend existing video clips with AI continuation.",
    modelType: "video",
    provider: "fal_ai",
    aliases: ["ltx-extend", "ltx-2.3-extend"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [5, 6, 8, 10, 12, 14, 16, 18, 20],
    creditCost: 500,
    priority: 65,
    sortOrder: 65,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "extend-video",
      inputFields: [
        {
          key: "video_url",
          label: "Source Video",
          type: "video_urls",
          required: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "6", label: "6s" },
            { value: "8", label: "8s" },
            { value: "10", label: "10s" },
            { value: "12", label: "12s" },
            { value: "14", label: "14s" },
            { value: "16", label: "16s" },
            { value: "18", label: "18s" },
            { value: "20", label: "20s" },
          ],
          default: "6",
          affectsPricing: true,
        },
        {
          key: "seed",
          label: "Seed",
          type: "number",
        },
      ],
      pricingTiers: {
        "5s": 500, "6s": 600, "8s": 800, "10s": 1000,
        "12s": 1200, "14s": 1400, "16s": 1600,
        "18s": 1800, "20s": 2000,
        "default": 600,
      },
      pricingFormula: "per_duration",
    },
  },

  // --- LTX-2.3 Retake Video ---
  {
    modelId: "fal-ai/ltx-2.3/retake-video",
    name: "LTX-2.3 Retake Video",
    description: "fal.ai LTX-2.3 — re-generate video with modified parameters while keeping the original concept.",
    modelType: "video",
    provider: "fal_ai",
    aliases: ["ltx-retake", "ltx-2.3-retake"],
    aspectRatios: ["16:9", "9:16", "1:1"],
    durations: [5, 6, 8, 10, 12, 14, 16, 18, 20],
    creditCost: 500,
    priority: 66,
    sortOrder: 66,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "retake-video",
      inputFields: [
        {
          key: "video_url",
          label: "Source Video",
          type: "video_urls",
          required: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "6", label: "6s" },
            { value: "8", label: "8s" },
            { value: "10", label: "10s" },
            { value: "12", label: "12s" },
            { value: "14", label: "14s" },
            { value: "16", label: "16s" },
            { value: "18", label: "18s" },
            { value: "20", label: "20s" },
          ],
          default: "6",
          affectsPricing: true,
        },
        {
          key: "seed",
          label: "Seed",
          type: "number",
        },
      ],
      pricingTiers: {
        "5s": 500, "6s": 600, "8s": 800, "10s": 1000,
        "12s": 1200, "14s": 1400, "16s": 1600,
        "18s": 1800, "20s": 2000,
        "default": 600,
      },
      pricingFormula: "per_duration",
    },
  },
];

// ============================================================
// Audio Models — Gemini 3.1 Flash TTS + Lux TTS (synchronous)
// ============================================================
const AUDIO_MODELS: AudioModelEntry[] = [
  {
    modelId: GEMINI_3_1_FLASH_TTS_MODEL_ID,
    name: "Gemini 3.1 Flash TTS",
    description: "fal.ai Gemini 3.1 Flash TTS — language-steered single-speaker voice presets and multi-speaker dialogue support. Per-unit pricing based on character count.",
    modelType: "audio",
    provider: "fal_ai",
    aliases: ["gemini 3.1 flash tts", "gemini-3.1-flash-tts", "gemini tts", "fal gemini tts"],
    creditCost: GEMINI_3_1_FLASH_TTS_CREDIT_COST,
    priority: 66,
    sortOrder: 66,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-speech",
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "text",
      pricingUnitSize: 1000,
      pricingUnitRounding: "ceil",
      pricingMinUnits: 1,
      inputFields: buildGemini31FlashTtsInputFields() as InputField[],
      pricingTiers: {
        "default": GEMINI_3_1_FLASH_TTS_CREDIT_COST,
      },
    },
  },
  {
    modelId: "fal-ai/lux-tts",
    name: "Lux TTS",
    description: "fal.ai Lux TTS — text-to-speech with voice cloning. Per-unit pricing based on character count.",
    modelType: "audio",
    provider: "fal_ai",
    aliases: ["lux", "lux-tts", "fal-tts", "fal-audio"],
    creditCost: 2,
    priority: 67,
    sortOrder: 67,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-speech",
      pricingFormula: "per_unit",
      pricingUnitMetric: "characters",
      pricingUnitField: "prompt",
      pricingUnitSize: 1000,
      pricingUnitRounding: "ceil",
      pricingMinUnits: 1,
      inputFields: [
        {
          key: "audio_url",
          label: "Reference Voice (optional)",
          type: "audio_urls",
        },
      ],
      pricingTiers: {
        "default": 1.4,
      },
    },
  },
];

// ============================================================
// Image Models — Flux Family (synchronous)
// ============================================================
const IMAGE_MODELS: ImageModelEntry[] = [
  {
    modelId: "fal-ai/flux/schnell",
    name: "Flux Schnell",
    description: "fal.ai Flux Schnell — ultra-fast image generation optimized for speed.",
    modelType: "image",
    provider: "fal_ai",
    aliases: ["flux-schnell", "fal-flux-schnell"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "1024x768", "768x1024"],
    creditCost: 10,
    priority: 68,
    sortOrder: 68,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-image",
      inputFields: [],
      pricingTiers: { default: 10 },
      pricingFormula: "flat",
    },
  },
  {
    modelId: "fal-ai/flux/dev",
    name: "Flux Dev",
    description: "fal.ai Flux Dev — high quality image generation for development and testing.",
    modelType: "image",
    provider: "fal_ai",
    aliases: ["flux-dev", "fal-flux-dev"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "1024x768", "768x1024"],
    creditCost: 20,
    priority: 69,
    sortOrder: 69,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-image",
      inputFields: [],
      pricingTiers: { default: 20 },
      pricingFormula: "flat",
    },
  },
  {
    modelId: "fal-ai/flux-pro",
    name: "Flux Pro",
    description: "fal.ai Flux Pro — professional grade image generation with highest quality.",
    modelType: "image",
    provider: "fal_ai",
    aliases: ["flux-pro", "fal-flux-pro"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "1024x768", "768x1024"],
    creditCost: 30,
    priority: 70,
    sortOrder: 70,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-image",
      inputFields: [],
      pricingTiers: { default: 30 },
      pricingFormula: "flat",
    },
  },
  {
    modelId: "fal-ai/stable-diffusion-v3-medium",
    name: "Stable Diffusion 3 Medium",
    description: "fal.ai Stable Diffusion 3 Medium — balanced quality and speed image generation.",
    modelType: "image",
    provider: "fal_ai",
    aliases: ["sd3-medium", "fal-sd3", "stable-diffusion-3"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "1024x768", "768x1024"],
    creditCost: 15,
    priority: 71,
    sortOrder: 71,
    configJson: {
      apiPayloadFormat: "custom",
      generateType: "text-to-image",
      inputFields: [],
      pricingTiers: { default: 15 },
      pricingFormula: "flat",
    },
  },
];

// ============================================================
// Seed function
// ============================================================
async function seed() {
  console.log("Seeding fal.ai Media Models...\n");
  console.log("Credit Rate: 1 USD = 1000 credits\n");
  console.log("NOTE: Credit costs are estimates — verify against fal.ai invoice.\n");

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

    // Clear existing fal_ai models (idempotent)
    const deleted = await sql`
      DELETE FROM media_models WHERE provider = 'fal_ai'
      RETURNING id
    `;
    console.log(`Cleared ${deleted.length} existing fal.ai models\n`);

    // Insert Video Models
    console.log("=== VIDEO MODELS (LTX-2.3) ===");
    for (const model of VIDEO_MODELS) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "aspectRatios", durations, "creditCost",
          priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${model.modelId},
          ${model.name},
          ${model.description},
          ${model.modelType},
          ${model.provider},
          ${JSON.stringify(model.aliases)},
          ${JSON.stringify(model.aspectRatios)},
          ${JSON.stringify(model.durations)},
          ${model.creditCost},
          ${model.priority},
          ${model.sortOrder},
          ${JSON.stringify(model.configJson)},
          true
        )
      `;
      console.log(`  + ${model.name} (${model.creditCost} credits base)`);
    }
    console.log(`\nAdded ${VIDEO_MODELS.length} video models\n`);

    // Insert Audio Models
    console.log("=== AUDIO MODELS (Gemini 3.1 Flash TTS, Lux TTS) ===");
    for (const model of AUDIO_MODELS) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "creditCost",
          priority, "sortOrder", "configJson", "isEnabled"
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
      `;
      console.log(`  + ${model.name} (${model.creditCost} credits per 1000 chars)`);
    }
    console.log(`\nAdded ${AUDIO_MODELS.length} audio models\n`);

    // Insert Image Models
    console.log("=== IMAGE MODELS (Flux) ===");
    for (const model of IMAGE_MODELS) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "aspectRatios", sizes, "creditCost",
          priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${model.modelId},
          ${model.name},
          ${model.description},
          ${model.modelType},
          ${model.provider},
          ${JSON.stringify(model.aliases)},
          ${JSON.stringify(model.aspectRatios)},
          ${JSON.stringify(model.sizes)},
          ${model.creditCost},
          ${model.priority},
          ${model.sortOrder},
          ${JSON.stringify(model.configJson)},
          true
        )
      `;
      console.log(`  + ${model.name} (${model.creditCost} credits)`);
    }
    console.log(`\nAdded ${IMAGE_MODELS.length} image models\n`);

    // Summary
    const total = VIDEO_MODELS.length + AUDIO_MODELS.length + IMAGE_MODELS.length;
    console.log("=".repeat(50));
    console.log(`TOTAL: ${total} fal.ai models seeded successfully!`);
    console.log(`  - Video: ${VIDEO_MODELS.length} models (LTX-2.3)`);
    console.log(`  - Audio: ${AUDIO_MODELS.length} models (Gemini 3.1 Flash TTS, Lux TTS)`);
    console.log(`  - Image: ${IMAGE_MODELS.length} models (Flux)`);
    console.log("=".repeat(50));
    console.log("\nNext step: Verify in Admin > Media Models (filter by fal_ai)");
    console.log("Adjust credit costs per model after confirming fal.ai invoice pricing.\n");

  } catch (error) {
    console.error("Error seeding fal.ai models:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
