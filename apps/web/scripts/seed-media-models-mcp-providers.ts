/**
 * Seed MCP-backed media models for user-connected provider accounts.
 * Run with: npx tsx scripts/seed-media-models-mcp-providers.ts
 */

import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

type McpMediaModelSeed = {
  modelId: string;
  name: string;
  description: string;
  modelType: "image" | "video";
  provider: "magnific" | "higgsfield";
  providerModelId: string;
  toolName: string;
  argumentShape: string;
  aliases: string[];
  creditCost: number;
  aspectRatios: string[];
  durations?: number[];
  sizes?: string[];
  defaultParams?: Record<string, unknown>;
  referenceImageLimit?: number;
  priority: number;
  sortOrder: number;
};

const IMAGE_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];
const GOOGLE_IMAGE_ASPECT_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "9:16", "16:9", "21:9"];
const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"];

const MCP_MEDIA_MODELS: McpMediaModelSeed[] = [
  {
    modelId: "higgsfield/nano_banana_2",
    name: "Nano Banana 2 (Higgsfield MCP)",
    description: "Google Nano Banana 2 image generation via Higgsfield MCP provider-account credits.",
    modelType: "image",
    provider: "higgsfield",
    providerModelId: "nano_banana_2",
    toolName: "generate_image",
    argumentShape: "higgsfield.generate_image",
    aliases: ["higgsfield nano banana 2", "nano_banana_2", "gemini 3.1 flash image"],
    creditCost: 0,
    aspectRatios: GOOGLE_IMAGE_ASPECT_RATIOS,
    sizes: ["1k", "2k", "4k"],
    priority: 16,
    sortOrder: 216,
  },
  {
    modelId: "higgsfield/nano_banana_pro",
    name: "Nano Banana Pro (Higgsfield MCP)",
    description: "Google Nano Banana Pro image generation via Higgsfield MCP provider-account credits.",
    modelType: "image",
    provider: "higgsfield",
    providerModelId: "nano_banana_pro",
    toolName: "generate_image",
    argumentShape: "higgsfield.generate_image",
    aliases: ["higgsfield nano banana pro", "nano_banana_pro", "gemini pro image"],
    creditCost: 0,
    aspectRatios: GOOGLE_IMAGE_ASPECT_RATIOS,
    sizes: ["1k", "2k", "4k"],
    priority: 17,
    sortOrder: 217,
  },
  {
    modelId: "higgsfield/z_image",
    name: "Z-Image (Higgsfield MCP)",
    description: "Higgsfield MCP image generation via the connected user's Higgsfield account.",
    modelType: "image",
    provider: "higgsfield",
    providerModelId: "z_image",
    toolName: "generate_image",
    argumentShape: "higgsfield.generate_image",
    aliases: ["higgsfield", "z image", "z_image"],
    creditCost: 0,
    aspectRatios: IMAGE_ASPECT_RATIOS,
    sizes: [],
    priority: 20,
    sortOrder: 220,
  },
  {
    modelId: "higgsfield/recraft-v4-1",
    name: "Recraft V4.1 (Higgsfield MCP)",
    description: "Recraft image generation through Higgsfield MCP provider-account credits.",
    modelType: "image",
    provider: "higgsfield",
    providerModelId: "recraft-v4-1",
    toolName: "generate_image",
    argumentShape: "higgsfield.generate_image",
    aliases: ["higgsfield recraft", "recraft-v4-1"],
    creditCost: 0,
    aspectRatios: IMAGE_ASPECT_RATIOS,
    sizes: [],
    priority: 21,
    sortOrder: 221,
  },
  {
    modelId: "higgsfield/seedance_2_0",
    name: "Seedance 2.0 (Higgsfield MCP)",
    description: "Higgsfield MCP text-to-video generation using a connected Higgsfield account.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "seedance_2_0",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield seedance", "seedance_2_0"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 6, 8],
    priority: 23,
    sortOrder: 223,
  },
  {
    modelId: "higgsfield/seedance_2_0_fast",
    name: "Seedance 2.0 Fast (Higgsfield MCP)",
    description: "Seedance 2.0 Fast video generation through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "seedance_2_0_fast",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield seedance fast", "seedance_2_0_fast", "seedance 2.0 fast"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 5, 6, 8, 10, 15],
    sizes: ["480p", "720p"],
    priority: 24,
    sortOrder: 224,
  },
  {
    modelId: "higgsfield/kling3_0",
    name: "Kling 3.0 (Higgsfield MCP)",
    description: "Kling 3.0 high-quality video generation with native audio through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "kling3_0",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield kling 3", "kling 3.0", "kling3_0"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [3, 5, 10, 15],
    sizes: ["720p", "1080p", "4k"],
    priority: 25,
    sortOrder: 225,
  },
  {
    modelId: "higgsfield/kling3_0_turbo",
    name: "Kling 3.0 Turbo (Higgsfield MCP)",
    description: "Kling 3.0 Turbo text-to-video and start-frame animation through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "kling3_0_turbo",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield kling 3", "kling 3.0", "kling3_0_turbo"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [3, 5, 10, 15],
    sizes: ["720p", "1080p"],
    priority: 26,
    sortOrder: 226,
  },
  {
    modelId: "higgsfield/kling3_0_motion_control",
    name: "Kling 3.0 Motion Control (Higgsfield MCP)",
    description: "Kling 3.0 Motion Control transfers motion from source video to generated output through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "kling-3-motion-control",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: [
      "higgsfield kling motion control",
      "kling 3.0 motion control",
      "kling-3-motion-control",
    ],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [3, 5, 10, 15, 30],
    sizes: ["720p", "1080p"],
    defaultParams: { resolution: "1080p" },
    priority: 27,
    sortOrder: 227,
  },
  {
    modelId: "higgsfield/veo3_1",
    name: "Veo 3.1 Pro (Higgsfield MCP)",
    description: "Google Veo 3.1 high-quality cinematic video through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "veo3_1",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield veo 3.1 pro", "veo3_1", "veo 3.1 pro"],
    creditCost: 0,
    aspectRatios: ["16:9", "9:16"],
    durations: [4, 6, 8],
    sizes: ["720p", "1080p"],
    defaultParams: { quality: "ultra", generate_audio: true },
    priority: 28,
    sortOrder: 228,
  },
  {
    modelId: "higgsfield/veo3_1_lite",
    name: "Veo 3.1 Lite (Higgsfield MCP)",
    description: "Google Veo 3.1 Lite fast batch video through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "veo3_1_lite",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield veo 3.1 lite", "veo3_1_lite", "veo 3.1 lite"],
    creditCost: 0,
    aspectRatios: ["16:9", "9:16", "auto"],
    durations: [4, 6, 8],
    sizes: ["720p", "1080p"],
    defaultParams: { generate_audio: false },
    priority: 29,
    sortOrder: 229,
  },
  {
    modelId: "higgsfield/grok_video",
    name: "Grok Imagine (Higgsfield MCP)",
    description: "xAI Grok Imagine video generation through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "grok_video",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield grok imagine", "grok_video", "grok imagine video"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [1, 2, 5, 10, 15],
    sizes: ["480p", "720p"],
    defaultParams: { resolution: "720p" },
    priority: 30,
    sortOrder: 230,
  },
  {
    modelId: "higgsfield/grok_video_v15",
    name: "Grok Imagine 1.5 (Higgsfield MCP)",
    description: "xAI Grok Imagine 1.5 image-to-video preview through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "grok_video_v15",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield grok imagine 1.5", "grok_video_v15", "grok imagine video 1.5"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [2, 5, 10, 15],
    sizes: ["480p", "720p"],
    defaultParams: { resolution: "720p" },
    priority: 31,
    sortOrder: 231,
  },
  {
    modelId: "higgsfield/happy-horse",
    name: "HappyHorse (Higgsfield MCP)",
    description: "HappyHorse video generation with native audio through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "happy-horse",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield happyhorse", "happy-horse", "happyhorse"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [3, 5, 10, 15],
    sizes: ["720p", "1080p"],
    defaultParams: { resolution: "1080p" },
    priority: 32,
    sortOrder: 232,
  },
  {
    modelId: "higgsfield/wan2_7",
    name: "Wan 2.7 (Higgsfield MCP)",
    description: "Wan 2.7 synchronized-audio and character-consistent video through Higgsfield MCP.",
    modelType: "video",
    provider: "higgsfield",
    providerModelId: "wan2_7",
    toolName: "generate_video",
    argumentShape: "higgsfield.generate_video",
    aliases: ["higgsfield wan 2.7", "wan2_7", "wan 2.7"],
    creditCost: 0,
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    durations: [2, 5, 10, 15],
    sizes: ["720p", "1080p"],
    defaultParams: { resolution: "720p" },
    priority: 33,
    sortOrder: 233,
  },
  {
    modelId: "magnific-mcp/gpt-2",
    name: "GPT 2 (Magnific MCP)",
    description: "Magnific MCP image generation through the connected user's Magnific account.",
    modelType: "image",
    provider: "magnific",
    providerModelId: "gpt-2",
    toolName: "images_generate",
    argumentShape: "magnific.images_generate",
    aliases: ["magnific mcp", "gpt-2"],
    creditCost: 0,
    aspectRatios: ["auto", ...IMAGE_ASPECT_RATIOS, "2:1", "3:1", "21:9"],
    sizes: ["1k", "2k", "4k"],
    priority: 28,
    sortOrder: 228,
  },
  {
    modelId: "magnific-mcp/imagen-nano-banana-2-flash",
    name: "Nano Banana 2 (Magnific MCP)",
    description: "Nano Banana 2 / Gemini Flash image generation through Magnific MCP provider-account credits.",
    modelType: "image",
    provider: "magnific",
    providerModelId: "imagen-nano-banana-2-flash",
    toolName: "images_generate",
    argumentShape: "magnific.images_generate",
    aliases: ["magnific nano banana 2", "imagen-nano-banana-2-flash", "nano banana 2"],
    creditCost: 0,
    aspectRatios: ["auto", ...GOOGLE_IMAGE_ASPECT_RATIOS],
    sizes: ["1k", "2k", "4k"],
    priority: 29,
    sortOrder: 229,
  },
  {
    modelId: "magnific-mcp/imagen-nano-banana-2",
    name: "Nano Banana Pro (Magnific MCP)",
    description: "Nano Banana Pro image generation through Magnific MCP provider-account credits.",
    modelType: "image",
    provider: "magnific",
    providerModelId: "imagen-nano-banana-2",
    toolName: "images_generate",
    argumentShape: "magnific.images_generate",
    aliases: ["magnific nano banana pro", "imagen-nano-banana-2", "nano banana pro"],
    creditCost: 0,
    aspectRatios: ["auto", ...GOOGLE_IMAGE_ASPECT_RATIOS],
    sizes: ["1k", "2k", "4k"],
    priority: 30,
    sortOrder: 230,
  },
  {
    modelId: "magnific-mcp/bytedance-seedance-pro-2.0",
    name: "Seedance Pro 2.0 (Magnific MCP)",
    description: "Magnific MCP video generation through provider-account credits.",
    modelType: "video",
    provider: "magnific",
    providerModelId: "bytedance-seedance-pro-2.0",
    toolName: "video_generate",
    argumentShape: "magnific.video_generate",
    aliases: ["magnific seedance pro", "bytedance-seedance-pro-2.0"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 6, 8],
    priority: 31,
    sortOrder: 231,
  },
  {
    modelId: "magnific-mcp/kling-v3-pro",
    name: "Kling 3 Pro (Magnific MCP)",
    description: "Kling 3.0 Pro video generation through Magnific MCP provider-account credits.",
    modelType: "video",
    provider: "magnific",
    providerModelId: "kling-v3-pro",
    toolName: "video_generate",
    argumentShape: "magnific.video_generate",
    aliases: ["magnific kling 3", "kling-v3-pro", "kling 3.0"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 6, 8, 10],
    sizes: ["720p", "1080p"],
    priority: 32,
    sortOrder: 232,
  },
  {
    modelId: "magnific-mcp/kling-v3-omni-pro",
    name: "Kling 3 Omni Pro (Magnific MCP)",
    description: "Kling 3.0 Omni Pro video generation through Magnific MCP provider-account credits.",
    modelType: "video",
    provider: "magnific",
    providerModelId: "kling-v3-omni-pro",
    toolName: "video_generate",
    argumentShape: "magnific.video_generate",
    aliases: ["magnific kling 3 omni", "kling-v3-omni-pro", "kling 3.0 omni"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 6, 8, 10],
    sizes: ["720p", "1080p"],
    priority: 33,
    sortOrder: 233,
  },
  {
    modelId: "magnific-mcp/veo-3-1-text-to-video",
    name: "Veo 3.1 Pro (Magnific MCP)",
    description: "Google Veo 3.1 high-quality text-to-video through Magnific MCP provider-account credits.",
    modelType: "video",
    provider: "magnific",
    providerModelId: "veo-3-1-text-to-video",
    toolName: "video_generate",
    argumentShape: "magnific.video_generate",
    aliases: ["magnific veo 3.1 pro", "veo-3-1-text-to-video", "veo 3.1"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 6, 8],
    sizes: ["720p", "1080p"],
    priority: 34,
    sortOrder: 234,
  },
  {
    modelId: "magnific-mcp/veo-3-1-text-to-video-fast",
    name: "Veo 3.1 Lite/Fast (Magnific MCP)",
    description: "Google Veo 3.1 fast text-to-video through Magnific MCP provider-account credits.",
    modelType: "video",
    provider: "magnific",
    providerModelId: "veo-3-1-text-to-video-fast",
    toolName: "video_generate",
    argumentShape: "magnific.video_generate",
    aliases: ["magnific veo 3.1 lite", "veo-3-1-text-to-video-fast", "veo 3.1 fast"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 6, 8],
    sizes: ["720p", "1080p"],
    priority: 35,
    sortOrder: 235,
  },
  {
    modelId: "magnific-mcp/wan-v2-7-text-to-video",
    name: "Wan 2.7 Text to Video (Magnific MCP)",
    description: "Wan 2.7 text-to-video through Magnific MCP provider-account credits.",
    modelType: "video",
    provider: "magnific",
    providerModelId: "wan-v2-7-text-to-video",
    toolName: "video_generate",
    argumentShape: "magnific.video_generate",
    aliases: ["magnific wan 2.7", "wan-v2-7-text-to-video", "wan 2.7"],
    creditCost: 0,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durations: [4, 6, 8],
    sizes: ["720p", "1080p"],
    priority: 36,
    sortOrder: 236,
  },
];

function buildConfigJson(model: McpMediaModelSeed): Record<string, unknown> {
  return {
    transport: "mcp",
    provider: model.provider,
    providerModelId: model.providerModelId,
    generateType: model.modelType === "video" ? "image-to-video" : "reference-to-image",
    supportsReferenceImages: true,
    referenceInputs: {
      image: true,
      video: model.modelType === "video",
    },
    referenceImageLimit: model.referenceImageLimit ?? 5,
    mcp: {
      providerKey: model.provider,
      providerModelId: model.providerModelId,
      toolName: model.toolName,
      argumentShape: model.argumentShape,
      defaultParams: model.defaultParams ?? {},
    },
    inputFields: [
      {
        key: "aspect_ratio",
        label: "Aspect Ratio",
        type: "select",
        options: model.aspectRatios.map((value) => ({ value, label: value })),
        default: model.aspectRatios.includes("1:1") ? "1:1" : model.aspectRatios[0],
      },
      ...(model.modelType === "video"
        ? [{
          key: "duration",
          label: "Duration",
          type: "select",
          options: (model.durations ?? [4, 6, 8]).map((value) => ({ value: String(value), label: `${value}s` })),
          default: String((model.durations ?? [4])[0]),
        }]
        : []),
      ...(model.sizes?.length
        ? [{
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: model.sizes.map((value) => ({ value, label: value })),
          default: model.sizes[0],
        }]
        : []),
      {
        key: "reference_image_urls",
        label: "Reference Images",
        type: "image_urls",
        syncWith: "reference_images",
        maxItems: model.referenceImageLimit ?? 5,
        includeInPayload: false,
      },
    ],
    pricing: {
      formula: "provider_account",
      defaultCredits: 0,
      note: "Uses the connected provider account's credits; SmartSpecPro credits are not deducted.",
    },
    readiness: "mcp-verified",
    adminVisible: true,
  };
}

export async function seedMcpProviderMediaModels(options: { dryRun?: boolean } = {}): Promise<void> {
  console.log("Seeding MCP provider media models...\n");
  for (const model of MCP_MEDIA_MODELS) {
    console.log(`  ${options.dryRun ? "dry-run " : ""}${model.modelId} -> ${model.provider}:${model.providerModelId}`);
  }
  if (options.dryRun) return;

  const sql = postgres(DATABASE_URL);
  try {
    for (const model of MCP_MEDIA_MODELS) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "creditCost", "aspectRatios", durations, sizes,
          priority, "sortOrder", "configJson", "isEnabled"
        ) VALUES (
          ${model.modelId},
          ${model.name},
          ${model.description},
          ${model.modelType},
          ${model.provider},
          ${sql.json(model.aliases)},
          ${model.creditCost},
          ${sql.json(model.aspectRatios)},
          ${sql.json(model.durations ?? [])},
          ${sql.json(model.sizes ?? [])},
          ${model.priority},
          ${model.sortOrder},
          ${sql.json(buildConfigJson(model))},
          true
        )
        ON CONFLICT ("modelId") DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          "modelType" = EXCLUDED."modelType",
          provider = EXCLUDED.provider,
          aliases = EXCLUDED.aliases,
          "aspectRatios" = EXCLUDED."aspectRatios",
          durations = EXCLUDED.durations,
          sizes = EXCLUDED.sizes,
          priority = EXCLUDED.priority,
          "sortOrder" = EXCLUDED."sortOrder",
          "configJson" = EXCLUDED."configJson",
          "isEnabled" = media_models."isEnabled"
      `;
    }
    console.log(`\nUpserted ${MCP_MEDIA_MODELS.length} MCP media model records.`);
  } finally {
    await sql.end();
  }
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void seedMcpProviderMediaModels({
    dryRun: process.argv.includes("--dry-run"),
  });
}
