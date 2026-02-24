/**
 * Seed BytePlus ModelArk Media Models
 * Run with: npx tsx scripts/seed-media-models-byteplus.ts
 *
 * Credit conversion:
 * - Platform: 1 USD = 1000 credits (1 credit = $0.001)
 * - BytePlus Seedream image: ~$0.02–$0.04 per image
 * - BytePlus Seedance video: ~$0.08–$0.50 per 5s clip (720p–1080p)
 *
 * Pricing reference: BytePlus ModelArk (Volcano Engine) — https://www.byteplus.com/en/product/modelark
 * Last updated: February 2026
 *
 * NOTE: Credit costs are estimates — verify against your BytePlus invoice and
 *       adjust per model via Admin > Media Models after seeding.
 */

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";

// ============================================================
// Model Definition Types (for configJson)
// ============================================================
interface InputField {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls";
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
  required?: boolean;
  affectsPricing?: boolean;
}

interface ModelDefinition {
  apiPayloadFormat: "market" | "veo" | "runway" | "suno" | "elevenlabs" | "custom" | "byteplus";
  generateType: string;
  inputFields: InputField[];
  pricingTiers: Record<string, number>;
  pricingFormula: "flat" | "per_duration" | "matrix";
  hasAudio?: boolean;
  maxDuration?: number;
}

interface VideoModelEntry {
  modelId: string;
  name: string;
  description: string;
  modelType: "video";
  provider: "byteplus_modelark";
  aliases: string[];
  aspectRatios: string[];
  durations: number[];
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
  provider: "byteplus_modelark";
  aliases: string[];
  aspectRatios: string[];
  sizes: string[];
  creditCost: number;
  priority: number;
  sortOrder: number;
  configJson: ModelDefinition;
}

// ============================================================
// Image Models — Seedream (synchronous generation)
// ============================================================
const IMAGE_MODELS: ImageModelEntry[] = [
  {
    modelId: "seedream-4-5-251128",
    name: "Seedream 4.5",
    description: "BytePlus Seedream 4.5 — high-quality synchronous image generation with fine detail and prompt adherence.",
    modelType: "image",
    provider: "byteplus_modelark",
    aliases: ["seedream", "seedream-4.5", "seedream45", "byteplus-image"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "2048x2048", "4096x4096"],
    creditCost: 30,
    priority: 50,
    sortOrder: 50,
    configJson: {
      apiPayloadFormat: "byteplus",
      generateType: "text-to-image",
      inputFields: [
        {
          key: "size",
          label: "Size",
          type: "select",
          options: [
            { value: "1024x1024", label: "1024×1024 (1K)" },
            { value: "2048x2048", label: "2048×2048 (2K)" },
            { value: "4096x4096", label: "4096×4096 (4K)" },
          ],
          default: "1024x1024",
          affectsPricing: false,
        },
      ],
      pricingTiers: { default: 30 },
      pricingFormula: "flat",
    },
  },
  {
    modelId: "seedream-4-0-250828",
    name: "Seedream 4.0",
    description: "BytePlus Seedream 4.0 — cost-efficient synchronous image generation.",
    modelType: "image",
    provider: "byteplus_modelark",
    aliases: ["seedream-4.0", "seedream40"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    sizes: ["1024x1024", "2048x2048", "4096x4096"],
    creditCost: 20,
    priority: 51,
    sortOrder: 51,
    configJson: {
      apiPayloadFormat: "byteplus",
      generateType: "text-to-image",
      inputFields: [
        {
          key: "size",
          label: "Size",
          type: "select",
          options: [
            { value: "1024x1024", label: "1024×1024 (1K)" },
            { value: "2048x2048", label: "2048×2048 (2K)" },
            { value: "4096x4096", label: "4096×4096 (4K)" },
          ],
          default: "1024x1024",
          affectsPricing: false,
        },
      ],
      pricingTiers: { default: 20 },
      pricingFormula: "flat",
    },
  },
];

// ============================================================
// Video Models — Seedance (async task + polling)
// ============================================================
const VIDEO_MODELS: VideoModelEntry[] = [
  // --- Seedance 1.0 Pro — flagship, T2V + I2V ---
  {
    modelId: "seedance-1-0-pro-250528",
    name: "Seedance 1.0 Pro",
    description: "BytePlus Seedance 1.0 Pro — high-quality async video generation. Supports text-to-video and image-to-video. Provides optional camera-fixed mode.",
    modelType: "video",
    provider: "byteplus_modelark",
    aliases: ["seedance", "seedance-pro", "seedance-1-pro", "byteplus-video"],
    aspectRatios: ["16:9", "9:16"],
    durations: [5, 10],
    creditCost: 200,
    priority: 52,
    sortOrder: 52,
    configJson: {
      apiPayloadFormat: "byteplus",
      generateType: "text-to-video",
      inputFields: [
        {
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
          ],
          default: "720p",
          affectsPricing: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "10", label: "10s" },
          ],
          default: "5",
          affectsPricing: true,
        },
        {
          key: "camerafixed",
          label: "Camera Fixed",
          type: "boolean",
          default: false,
        },
        {
          key: "reference_image_url",
          label: "Reference Image (optional — enables I2V)",
          type: "image_urls",
        },
      ],
      pricingTiers: {
        "720p-5s": 200,
        "720p-10s": 400,
        "1080p-5s": 400,
        "1080p-10s": 800,
      },
      pricingFormula: "matrix",
    },
  },

  // --- Seedance 1.0 Pro Fast — speed-optimised, T2V + I2V ---
  {
    modelId: "seedance-1-0-pro-fast-251015",
    name: "Seedance 1.0 Pro Fast",
    description: "BytePlus Seedance 1.0 Pro Fast — faster turnaround with comparable quality. Supports text-to-video and image-to-video.",
    modelType: "video",
    provider: "byteplus_modelark",
    aliases: ["seedance-fast", "seedance-pro-fast", "seedance-1-pro-fast"],
    aspectRatios: ["16:9", "9:16"],
    durations: [5, 10],
    creditCost: 100,
    priority: 53,
    sortOrder: 53,
    configJson: {
      apiPayloadFormat: "byteplus",
      generateType: "text-to-video",
      inputFields: [
        {
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
          ],
          default: "720p",
          affectsPricing: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "10", label: "10s" },
          ],
          default: "5",
          affectsPricing: true,
        },
        {
          key: "camerafixed",
          label: "Camera Fixed",
          type: "boolean",
          default: false,
        },
        {
          key: "reference_image_url",
          label: "Reference Image (optional — enables I2V)",
          type: "image_urls",
        },
      ],
      pricingTiers: {
        "720p-5s": 100,
        "720p-10s": 200,
        "1080p-5s": 200,
        "1080p-10s": 400,
      },
      pricingFormula: "matrix",
    },
  },

  // --- Seedance 1.0 Lite T2V — text-to-video only ---
  {
    modelId: "seedance-1-0-lite-t2v-250428",
    name: "Seedance 1.0 Lite T2V",
    description: "BytePlus Seedance 1.0 Lite — lightweight text-to-video generation for fast iteration.",
    modelType: "video",
    provider: "byteplus_modelark",
    aliases: ["seedance-lite", "seedance-lite-t2v", "seedance-1-lite"],
    aspectRatios: ["16:9", "9:16"],
    durations: [5, 10],
    creditCost: 80,
    priority: 54,
    sortOrder: 54,
    configJson: {
      apiPayloadFormat: "byteplus",
      generateType: "text-to-video",
      inputFields: [
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "10", label: "10s" },
          ],
          default: "5",
          affectsPricing: true,
        },
      ],
      pricingTiers: { "5s": 80, "10s": 160 },
      pricingFormula: "per_duration",
    },
  },

  // --- Seedance 1.0 Lite I2V — image-to-video only ---
  {
    modelId: "seedance-1-0-lite-i2v-250428",
    name: "Seedance 1.0 Lite I2V",
    description: "BytePlus Seedance 1.0 Lite — lightweight image-to-video generation. Requires a source image.",
    modelType: "video",
    provider: "byteplus_modelark",
    aliases: ["seedance-lite-i2v", "seedance-1-lite-i2v"],
    aspectRatios: ["16:9", "9:16"],
    durations: [5, 10],
    creditCost: 80,
    priority: 55,
    sortOrder: 55,
    configJson: {
      apiPayloadFormat: "byteplus",
      generateType: "image-to-video",
      inputFields: [
        {
          key: "reference_image_url",
          label: "Source Image",
          type: "image_urls",
          required: true,
        },
        {
          key: "duration",
          label: "Duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "10", label: "10s" },
          ],
          default: "5",
          affectsPricing: true,
        },
      ],
      pricingTiers: { "5s": 80, "10s": 160 },
      pricingFormula: "per_duration",
    },
  },
];

// ============================================================
// Seed function
// ============================================================
async function seed() {
  console.log("Seeding BytePlus ModelArk Media Models...\n");
  console.log("Credit Rate: 1 USD = 1000 credits\n");
  console.log("NOTE: Credit costs are estimates — verify against BytePlus invoice.\n");

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

    // Clear existing BytePlus models (idempotent)
    const deleted = await sql`
      DELETE FROM media_models WHERE provider = 'byteplus_modelark'
      RETURNING id
    `;
    console.log(`Cleared ${deleted.length} existing BytePlus ModelArk models\n`);

    // Insert Video Models
    console.log("=== VIDEO MODELS ===");
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

    // Insert Image Models
    console.log("=== IMAGE MODELS ===");
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
    const total = VIDEO_MODELS.length + IMAGE_MODELS.length;
    console.log("=".repeat(50));
    console.log(`TOTAL: ${total} BytePlus ModelArk models seeded successfully!`);
    console.log(`  - Video: ${VIDEO_MODELS.length} models (Seedance)`);
    console.log(`  - Image: ${IMAGE_MODELS.length} models (Seedream)`);
    console.log("=".repeat(50));
    console.log("\nNext step: Verify in Admin > Media Models (filter by byteplus_modelark)");
    console.log("Adjust credit costs per model after confirming BytePlus invoice pricing.\n");

  } catch (error) {
    console.error("Error seeding BytePlus models:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
