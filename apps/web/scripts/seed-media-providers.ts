/**
 * Seed Media Providers
 * Run with: npx tsx scripts/seed-media-providers.ts
 */

import postgres from "postgres";
import crypto from "crypto";
import {
  ELEVENLABS_BASE_URL,
  ELEVENLABS_PROVIDER,
  ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID,
  getElevenLabsProviderAvailableModels,
  getMagnificProviderAvailableModels,
  getWaveSpeedProviderAvailableModels,
  MAGNIFIC_BASE_URL,
  MAGNIFIC_DEFAULT_MODEL_ID,
  MAGNIFIC_PROVIDER,
  WAVESPEED_LAUNCH_MODEL_ID,
} from "../server/services/mediaProviderUtils";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";
const ENCRYPTION_KEY = process.env.MEDIA_ENCRYPTION_KEY || process.env.LLM_ENCRYPTION_KEY || "smartspec-media-key-32chars!";

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// Default providers to seed
export const DEFAULT_PROVIDERS = [
  {
    providerName: "kie_ai",
    displayName: "Kie AI",
    description: "Unified API marketplace for AI generation - supports image, video, and audio generation with 100+ models including DALL-E, Midjourney, Sora, and more",
    providerType: "multimodal",
    baseUrl: "https://api.kie.ai/api/v1",
    defaultModel: "flux-pro-v1.1",
    availableModels: [
      // Image models - from seed-media-models-kie-ai.ts
      { id: "flux-pro-v1.1", name: "Flux Pro 1.1", type: "image", description: "High-quality image generation" },
      { id: "midjourney-v6.1", name: "Midjourney V6.1", type: "image", description: "Premium artistic image generation" },
      { id: "dall-e-3", name: "DALL-E 3", type: "image", description: "OpenAI's latest image model" },
      { id: "gpt-4o-image", name: "GPT-4o Image", type: "image", description: "OpenAI GPT-4o image generation" },
      { id: "stable-diffusion-3.5-large", name: "SD 3.5 Large", type: "image", description: "Stability AI's latest model" },
      // Video models
      { id: "veo-3-fast", name: "Veo 3 Fast", type: "video", description: "Google's fast video generation" },
      { id: "veo-3-quality", name: "Veo 3 Quality", type: "video", description: "Google's high-quality video" },
      { id: "runway-gen-3-turbo", name: "Runway Gen-3 Turbo", type: "video", description: "Fast video generation" },
      { id: "sora-2-pro", name: "Sora 2 Pro", type: "video", description: "OpenAI's video model" },
      { id: "kling-1.6-standard", name: "Kling 1.6", type: "video", description: "Kuaishou video generation" },
      // Audio models
      { id: "suno-v4.5-plus", name: "Suno V4.5 Plus", type: "audio", description: "AI music generation" },
      { id: "elevenlabs-tts-v3", name: "ElevenLabs TTS V3", type: "audio", description: "Text-to-speech" },
      { id: "elevenlabs-sound-effects", name: "Sound Effects", type: "audio", description: "Sound effect generation" },
    ],
    isEnabled: true,
    isPrimary: true,
    priority: 0,
  },
  {
    providerName: "fal_ai",
    displayName: "fal.ai",
    description: "Fast inference platform for generative AI - LTX-2.3 video generation, Gemini/Lux TTS voice synthesis, and Flux image generation",
    providerType: "multimodal",
    baseUrl: "https://fal.run",
    defaultModel: "fal-ai/flux/schnell",
    availableModels: [
      // Image models
      { id: "fal-ai/flux/schnell", name: "Flux Schnell", type: "image", description: "Ultra-fast image generation" },
      { id: "fal-ai/flux/dev", name: "Flux Dev", type: "image", description: "High quality image generation" },
      { id: "fal-ai/flux-pro", name: "Flux Pro", type: "image", description: "Professional image generation" },
      { id: "fal-ai/stable-diffusion-v3-medium", name: "Stable Diffusion 3 Medium", type: "image", description: "SD3 image generation" },
      // Video models (pre-LTX)
      { id: "fal-ai/minimax-video-01", name: "MiniMax Video", type: "video", description: "Video generation" },
      { id: "fal-ai/kling-video/v1/standard/image-to-video", name: "Kling Image to Video", type: "video", description: "Image to video conversion" },
      // Video models (LTX-2.3)
      { id: "fal-ai/ltx-2.3/text-to-video", name: "LTX-2.3 Text to Video", type: "video", description: "Text-to-video generation (standard quality)" },
      { id: "fal-ai/ltx-2.3/text-to-video/fast", name: "LTX-2.3 Text to Video (Fast)", type: "video", description: "Fast text-to-video generation" },
      { id: "fal-ai/ltx-2.3/image-to-video", name: "LTX-2.3 Image to Video", type: "video", description: "Image-to-video generation (standard quality)" },
      { id: "fal-ai/ltx-2.3/image-to-video/fast", name: "LTX-2.3 Image to Video (Fast)", type: "video", description: "Fast image-to-video generation" },
      { id: "fal-ai/ltx-2.3/audio-to-video", name: "LTX-2.3 Audio to Video", type: "video", description: "Audio-driven video generation" },
      { id: "fal-ai/ltx-2.3/extend-video", name: "LTX-2.3 Extend Video", type: "video", description: "Extend existing video clips" },
      { id: "fal-ai/ltx-2.3/retake-video", name: "LTX-2.3 Retake Video", type: "video", description: "Re-generate video with modified parameters" },
      // Audio models
      { id: "fal-ai/gemini-3.1-flash-tts", name: "Gemini 3.1 Flash TTS", type: "audio", description: "Single- and multi-speaker text-to-speech with language steering" },
      { id: "fal-ai/lux-tts", name: "Lux TTS", type: "audio", description: "Text-to-speech with voice cloning" },
    ],
    isEnabled: false,
    isPrimary: false,
    priority: 10,
  },
  {
    providerName: "wavespeed_ai",
    displayName: "WaveSpeedAI",
    description: "WaveSpeed media-generation provider for cinematic and ByteDance Seedance 2.0 text-to-video / image-to-video generation",
    providerType: "multimodal",
    baseUrl: "https://api.wavespeed.ai/api/v3",
    defaultModel: WAVESPEED_LAUNCH_MODEL_ID,
    availableModels: getWaveSpeedProviderAvailableModels(),
    isEnabled: false,
    isPrimary: false,
    priority: 12,
  },
  {
    providerName: MAGNIFIC_PROVIDER,
    displayName: "Magnific",
    description: "Magnific media provider for image generation, enhancement, video generation, and video upscaling",
    providerType: "multimodal",
    baseUrl: MAGNIFIC_BASE_URL,
    defaultModel: MAGNIFIC_DEFAULT_MODEL_ID,
    availableModels: getMagnificProviderAvailableModels(),
    isEnabled: false,
    isPrimary: false,
    priority: 14,
  },
  {
    providerName: ELEVENLABS_PROVIDER,
    displayName: "ElevenLabs",
    description: "Direct ElevenLabs audio provider for text-to-speech, voice changing, speech-to-text, sound effects, and voice isolation",
    providerType: "audio",
    baseUrl: ELEVENLABS_BASE_URL,
    defaultModel: ELEVENLABS_TEXT_TO_SPEECH_MODEL_ID,
    availableModels: getElevenLabsProviderAvailableModels(),
    isEnabled: false,
    isPrimary: false,
    priority: 13,
  },
  {
    providerName: "uvoice",
    displayName: "UVoice",
    description: "Thai-focused text-to-speech provider with Standard/Natural/Premium voice tiers and configurable output format",
    providerType: "audio",
    baseUrl: "https://api.uvoice.ai",
    defaultModel: "uvoice/tts-standard",
    availableModels: [
      { id: "uvoice/tts-standard", name: "UVoice TTS Standard", type: "audio", description: "Standard quality voices (max 5,000 chars)" },
      { id: "uvoice/tts-natural", name: "UVoice TTS Natural", type: "audio", description: "Natural voices (max 1,500 chars)" },
      { id: "uvoice/tts-premium", name: "UVoice TTS Premium", type: "audio", description: "Premium voices (max 1,500 chars)" },
    ],
    isEnabled: false,
    isPrimary: false,
    priority: 15,
  },
  {
    providerName: "knplabai",
    displayName: "KNPLabs AI",
    description: "Multi-provider AI gateway for media generation, speech, and embeddings",
    providerType: "multimodal",
    baseUrl: "https://api.knplabai.com/ai/v1",
    defaultModel: "gpt-image-1.5-all",
    availableModels: [
      { id: "gpt-image-1.5-all", name: "GPT Image 1.5 All", type: "image", description: "OpenAI-compatible image generation" },
      { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", type: "image", description: "Gemini native image generation" },
      { id: "veo_3_1-fast", name: "Veo 3.1 Fast", type: "video", description: "Fast video generation" },
      { id: "grok-video-3", name: "Grok Video 3", type: "video", description: "JSON video generation" },
      { id: "gpt-4o-mini-tts", name: "GPT-4o Mini TTS", type: "audio", description: "OpenAI-compatible text-to-speech" },
      { id: "tts-1", name: "TTS-1", type: "audio", description: "OpenAI-compatible text-to-speech" },
    ],
    isEnabled: false,
    isPrimary: false,
    priority: 16,
  },
  {
    providerName: "replicate",
    displayName: "Replicate",
    description: "Run open-source AI models with a cloud API - supports thousands of community models",
    providerType: "multimodal",
    baseUrl: "https://api.replicate.com/v1",
    defaultModel: "stability-ai/sdxl",
    availableModels: [
      { id: "stability-ai/sdxl", name: "Stable Diffusion XL", type: "image", description: "High quality image generation" },
      { id: "black-forest-labs/flux-schnell", name: "Flux Schnell", type: "image", description: "Fast image generation" },
      { id: "lucataco/animate-diff", name: "AnimateDiff", type: "video", description: "Animation generation" },
    ],
    isEnabled: false,
    isPrimary: false,
    priority: 20,
  },
];

export async function seedMediaProviders() {
  console.log("Seeding Media Providers...\n");

  const sql = postgres(DATABASE_URL);

  try {
    // Check existing providers
    const existing = await sql`SELECT "providerName" FROM media_providers`;
    const existingNames = existing.map(p => p.providerName);
    console.log("Existing providers:", existingNames.join(", ") || "(none)");

    let added = 0;
    let skipped = 0;

    for (const provider of DEFAULT_PROVIDERS) {
      if (existingNames.includes(provider.providerName)) {
        console.log(`  [SKIP] ${provider.displayName} - already exists`);
        skipped++;
        continue;
      }

      await sql`
        INSERT INTO media_providers (
          "providerName",
          "displayName",
          "description",
          "providerType",
          "baseUrl",
          "defaultModel",
          "availableModels",
          "isEnabled",
          "isPrimary",
          "priority",
          "sortOrder",
          "hasApiKey"
        ) VALUES (
          ${provider.providerName},
          ${provider.displayName},
          ${provider.description},
          ${provider.providerType},
          ${provider.baseUrl},
          ${provider.defaultModel},
          ${JSON.stringify(provider.availableModels)},
          ${provider.isEnabled},
          ${provider.isPrimary},
          ${provider.priority},
          ${added},
          false
        )
      `;

      console.log(`  [ADD] ${provider.displayName}`);
      added++;
    }

    console.log(`\nDone! Added: ${added}, Skipped: ${skipped}`);

    // Show final count
    const count = await sql`SELECT COUNT(*) as count FROM media_providers`;
    console.log(`Total providers in database: ${count[0].count}`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void seedMediaProviders();
}
