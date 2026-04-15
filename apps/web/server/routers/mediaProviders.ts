import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db, getDb } from "../db";
import { mediaProviders } from "../../drizzle/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";
import {
  assertPublicSafeHttpUrl,
  getWaveSpeedProviderAvailableModels,
  normalizeMediaProviderName,
  normalizePersistedMediaProviderBaseUrl,
  normalizeWaveSpeedBaseUrl,
  WAVESPEED_LAUNCH_MODEL_ID,
  WAVESPEED_PROVIDER,
} from "../services/mediaProviderUtils";

// Provider templates for adding new providers
export const PROVIDER_TEMPLATES = [
  {
    providerName: "kie_ai",
    displayName: "Kie AI",
    description: "Unified API marketplace for AI generation - supports image, video, and audio generation with 100+ models including DALL-E, Midjourney, Sora, and more",
    providerType: "multimodal" as const,
    baseUrl: "https://api.kie.ai/api/v1",
    defaultModel: "nano-banana-pro",
    availableModels: [
      // Image models
      { id: "nano-banana-pro", name: "Nano Banana Pro", type: "image" as const, description: "Fast image generation" },
      { id: "z-image", name: "Z-Image", type: "image" as const, description: "High quality image generation" },
      { id: "seedream-4-5", name: "Seedream 4.5", type: "image" as const, description: "Dreamlike image generation" },
      { id: "flux-2", name: "Flux 2", type: "image" as const, description: "Creative image generation" },
      // Video models
      { id: "wan-2-6", name: "Wan 2.6", type: "video" as const, description: "Video generation" },
      { id: "seedance-1-5-pro", name: "Seedance 1.5 Pro", type: "video" as const, description: "Professional video generation" },
      { id: "sora-2-pro", name: "Sora 2 Pro", type: "video" as const, description: "OpenAI Sora video generation" },
      { id: "veo-3-1", name: "Veo 3.1", type: "video" as const, description: "Google Veo video generation" },
      // Audio models
      { id: "elevenlabs-tts", name: "ElevenLabs TTS", type: "audio" as const, description: "Text-to-speech" },
      { id: "elevenlabs-sound-effect", name: "ElevenLabs Sound Effects", type: "audio" as const, description: "Sound effect generation" },
      { id: "omnivoice-tts", name: "OmniVoice TTS", type: "audio" as const, description: "Multilingual text-to-speech with voice design and cloning" },
    ],
  },
  {
    providerName: "fal_ai",
    displayName: "fal.ai",
    description: "Fast inference platform for generative AI - LTX-2.3 video generation, Lux TTS voice synthesis, and Flux image generation",
    providerType: "multimodal" as const,
    baseUrl: "https://fal.run",
    defaultModel: "fal-ai/flux/schnell",
    availableModels: [
      // Image models
      { id: "fal-ai/flux/schnell", name: "Flux Schnell", type: "image" as const, description: "Ultra-fast image generation" },
      { id: "fal-ai/flux/dev", name: "Flux Dev", type: "image" as const, description: "High quality image generation" },
      { id: "fal-ai/flux-pro", name: "Flux Pro", type: "image" as const, description: "Professional image generation" },
      { id: "fal-ai/stable-diffusion-v3-medium", name: "Stable Diffusion 3 Medium", type: "image" as const, description: "SD3 image generation" },
      // Video models (existing)
      { id: "fal-ai/minimax-video-01", name: "MiniMax Video", type: "video" as const, description: "Video generation" },
      { id: "fal-ai/kling-video/v1/standard/image-to-video", name: "Kling Image to Video", type: "video" as const, description: "Image to video conversion" },
      // Video models (LTX-2.3)
      { id: "fal-ai/ltx-2.3/text-to-video", name: "LTX-2.3 Text to Video", type: "video" as const, description: "Text-to-video generation (standard quality)" },
      { id: "fal-ai/ltx-2.3/text-to-video/fast", name: "LTX-2.3 Text to Video (Fast)", type: "video" as const, description: "Fast text-to-video generation" },
      { id: "fal-ai/ltx-2.3/image-to-video", name: "LTX-2.3 Image to Video", type: "video" as const, description: "Image-to-video generation (standard quality)" },
      { id: "fal-ai/ltx-2.3/image-to-video/fast", name: "LTX-2.3 Image to Video (Fast)", type: "video" as const, description: "Fast image-to-video generation" },
      { id: "fal-ai/ltx-2.3/audio-to-video", name: "LTX-2.3 Audio to Video", type: "video" as const, description: "Audio-driven video generation" },
      { id: "fal-ai/ltx-2.3/extend-video", name: "LTX-2.3 Extend Video", type: "video" as const, description: "Extend existing video clips" },
      { id: "fal-ai/ltx-2.3/retake-video", name: "LTX-2.3 Retake Video", type: "video" as const, description: "Re-generate video with modified parameters" },
      // Audio models
      { id: "fal-ai/lux-tts", name: "Lux TTS", type: "audio" as const, description: "Text-to-speech with voice cloning" },
    ],
  },
  {
    providerName: "replicate",
    displayName: "Replicate",
    description: "Run open-source AI models with a cloud API - supports thousands of community models",
    providerType: "multimodal" as const,
    baseUrl: "https://api.replicate.com/v1",
    defaultModel: "stability-ai/sdxl",
    availableModels: [
      { id: "stability-ai/sdxl", name: "Stable Diffusion XL", type: "image" as const, description: "High quality image generation" },
      { id: "black-forest-labs/flux-schnell", name: "Flux Schnell", type: "image" as const, description: "Fast image generation" },
      { id: "lucataco/animate-diff", name: "AnimateDiff", type: "video" as const, description: "Animation generation" },
    ],
  },
  {
    providerName: "runpod",
    displayName: "RunPod",
    description: "GPU cloud platform for AI inference - run serverless or dedicated endpoints",
    providerType: "multimodal" as const,
    baseUrl: "https://api.runpod.ai/v2",
    defaultModel: "sdxl",
    availableModels: [
      { id: "sdxl", name: "Stable Diffusion XL", type: "image" as const, description: "Image generation" },
    ],
  },
  {
    providerName: "byteplus_modelark",
    displayName: "BytePlus ModelArk",
    description: "ByteDance's enterprise AI platform — Seedream models for synchronous image generation and Seedance models for asynchronous video generation via task polling",
    providerType: "multimodal" as const,
    baseUrl: "https://ark.ap-southeast.bytepluses.com/api/v3",
    defaultModel: "seedream-4-5-251128",
    availableModels: [
      // Image models (Seedream — synchronous)
      { id: "seedream-4-5-251128", name: "Seedream 4.5", type: "image" as const, description: "High-quality synchronous image generation (Seedream 4.5)" },
      { id: "seedream-4-0-250828", name: "Seedream 4.0", type: "image" as const, description: "Image generation with Seedream 4.0" },
      // Video models (Seedance — async task/polling)
      { id: "seedance-1-0-pro-fast-251015", name: "Seedance 1.0 Pro Fast", type: "video" as const, description: "Fast professional video generation (T2V + I2V)" },
      { id: "seedance-1-0-pro-250528",      name: "Seedance 1.0 Pro",      type: "video" as const, description: "Professional video generation (T2V + I2V)" },
      { id: "seedance-1-0-lite-t2v-250428", name: "Seedance 1.0 Lite T2V", type: "video" as const, description: "Lightweight text-to-video generation" },
      { id: "seedance-1-0-lite-i2v-250428", name: "Seedance 1.0 Lite I2V", type: "video" as const, description: "Lightweight image-to-video generation" },
    ],
  },
  {
    providerName: WAVESPEED_PROVIDER,
    displayName: "WaveSpeedAI",
    description: "WaveSpeed media-generation provider for cinematic and ByteDance Seedance 2.0 text-to-video / image-to-video generation",
    providerType: "multimodal" as const,
    baseUrl: "https://api.wavespeed.ai/api/v3",
    defaultModel: WAVESPEED_LAUNCH_MODEL_ID,
    availableModels: getWaveSpeedProviderAvailableModels(),
  },
  {
    providerName: "uvoice",
    displayName: "UVoice",
    description: "Thai-focused text-to-speech API with multiple voice tiers and configurable output formats",
    providerType: "audio" as const,
    baseUrl: "https://api.uvoice.ai",
    defaultModel: "uvoice/tts-standard",
    availableModels: [
      { id: "uvoice/tts-standard", name: "UVoice TTS Standard", type: "audio" as const, description: "Standard quality voices (up to 5,000 chars)" },
      { id: "uvoice/tts-natural", name: "UVoice TTS Natural", type: "audio" as const, description: "Natural voice quality (up to 1,500 chars)" },
      { id: "uvoice/tts-premium", name: "UVoice TTS Premium", type: "audio" as const, description: "Premium expressive voices (up to 1,500 chars)" },
    ],
  },
  {
    providerName: "omnivoice",
    displayName: "OmniVoice",
    description: "Multilingual text-to-speech with voice design, cloning, and narration-ready outputs",
    providerType: "audio" as const,
    baseUrl: "https://api.omnivoice.ai",
    defaultModel: "omnivoice-tts",
    availableModels: [
      { id: "omnivoice-tts", name: "OmniVoice TTS", type: "audio" as const, description: "Multilingual text-to-speech with voice design and cloning" },
    ],
  },
  {
    providerName: "knplabai",
    displayName: "KNPLabs AI",
    description: "Multi-provider media gateway for image, video, audio, and embeddings",
    providerType: "multimodal" as const,
    baseUrl: "https://api.knplabai.com/ai/v1",
    defaultModel: "gpt-image-1.5-all",
    availableModels: [
      { id: "gpt-image-1.5-all", name: "GPT Image 1.5 All", type: "image" as const, description: "OpenAI-compatible image generation" },
      { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", type: "image" as const, description: "Gemini native image generation" },
      { id: "veo_3_1-fast", name: "Veo 3.1 Fast", type: "video" as const, description: "Fast form-data video generation" },
      { id: "grok-video-3", name: "Grok Video 3", type: "video" as const, description: "JSON video generation" },
      { id: "gpt-4o-mini-tts", name: "GPT-4o Mini TTS", type: "audio" as const, description: "OpenAI-compatible text-to-speech" },
      { id: "tts-1", name: "TTS-1", type: "audio" as const, description: "OpenAI-compatible text-to-speech" },
    ],
  },
];

// Model schema for validation
const modelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["image", "video", "audio"]),
  description: z.string().optional(),
  pricing: z.object({
    perGeneration: z.number().optional(),
    perSecond: z.number().optional(),
    perMinute: z.number().optional(),
  }).optional(),
  config: z.object({
    maxDuration: z.number().optional(),
    maxResolution: z.string().optional(),
    supportedFormats: z.array(z.string()).optional(),
  }).optional(),
});

export const mediaProvidersRouter = router({
  // Admin: List all media providers
  adminList: adminProcedure.query(async () => {
    try {
      const dbInstance = await getDb();
      if (!dbInstance) return [];
      const providers = await dbInstance
        .select()
        .from(mediaProviders)
        .orderBy(asc(mediaProviders.sortOrder), asc(mediaProviders.displayName));

      // Don't expose encrypted keys
      return providers.map(p => ({
        ...p,
        apiKeyEncrypted: undefined,
      }));
    } catch (error: any) {
      // Table might not exist yet - return empty array
      console.warn("[MediaProviders] List query failed (table may not exist):", error.message);
      return [];
    }
  }),

  // Admin: Get single provider
  adminGet: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(mediaProviders)
        .where(eq(mediaProviders.id, input.id));

      if (!provider) return null;

      return {
        ...provider,
        apiKeyEncrypted: undefined,
      };
    }),

  // Admin: Get provider templates
  templates: adminProcedure.query(() => {
    return PROVIDER_TEMPLATES;
  }),

  // Admin: Create provider
  create: adminProcedure
    .input(z.object({
      providerName: z.string().min(1).max(64),
      displayName: z.string().min(1).max(128),
      description: z.string().optional(),
      providerType: z.enum(["image", "video", "audio", "multimodal"]).default("multimodal"),
      baseUrl: z.string().url().optional(),
      callbackUrl: z.string().url().optional(),
      apiKey: z.string().optional(),
      defaultModel: z.string().optional(),
      availableModels: z.array(modelSchema).optional(),
      configJson: z.record(z.any()).optional(),
      isEnabled: z.boolean().default(false),
      isPrimary: z.boolean().default(false),
      priority: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const { apiKey, ...data } = input;
      const normalizedProviderName = normalizeMediaProviderName(input.providerName);
      const normalizedBaseUrl = normalizePersistedMediaProviderBaseUrl(
        normalizedProviderName,
        input.baseUrl,
      );
      const normalizedCallbackUrl = input.callbackUrl?.trim();
      if (normalizedCallbackUrl) {
        assertPublicSafeHttpUrl(normalizedCallbackUrl, "Provider callback URL", { requireHttps: true });
      }

      // Get max sort order
      const [maxSort] = await db
        .select({ max: sql<number>`COALESCE(MAX(${mediaProviders.sortOrder}), -1)` })
        .from(mediaProviders);

      const [provider] = await db
        .insert(mediaProviders)
        .values({
          ...data,
          providerName: normalizedProviderName,
          baseUrl: normalizedBaseUrl,
          callbackUrl: normalizedCallbackUrl,
          apiKeyEncrypted: apiKey ? encrypt(apiKey) : null,
          hasApiKey: !!apiKey,
          sortOrder: (maxSort?.max ?? -1) + 1,
        })
        .returning();

      return { id: provider.id };
    }),

  // Admin: Update provider
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      displayName: z.string().min(1).max(128).optional(),
      description: z.string().optional(),
      providerType: z.enum(["image", "video", "audio", "multimodal"]).optional(),
      baseUrl: z.string().url().optional().nullable(),
      callbackUrl: z.string().url().optional().nullable(),
      apiKey: z.string().optional(),
      defaultModel: z.string().optional().nullable(),
      availableModels: z.array(modelSchema).optional(),
      configJson: z.record(z.any()).optional(),
      isEnabled: z.boolean().optional(),
      isPrimary: z.boolean().optional(),
      priority: z.number().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, apiKey, callbackUrl, baseUrl, ...data } = input;
      const needsCurrentProvider = data.isPrimary || baseUrl !== undefined;
      const [current] = needsCurrentProvider
        ? await db
          .select()
          .from(mediaProviders)
          .where(eq(mediaProviders.id, id))
        : [null];

      // If setting as primary, unset other primaries of same type
      if (data.isPrimary) {
        if (current) {
          await db
            .update(mediaProviders)
            .set({ isPrimary: false })
            .where(eq(mediaProviders.providerType, current.providerType));
        }
      }

      const updateData: any = {
        ...data,
        updatedAt: new Date(),
      };

      // Handle URL fields explicitly - allow clearing with null
      if (callbackUrl !== undefined) {
        const normalizedCallbackUrl = callbackUrl?.trim() || null;
        if (normalizedCallbackUrl) {
          assertPublicSafeHttpUrl(normalizedCallbackUrl, "Provider callback URL", { requireHttps: true });
        }
        updateData.callbackUrl = normalizedCallbackUrl; // null will clear, string will set
      }
      if (baseUrl !== undefined) {
        updateData.baseUrl = baseUrl == null
          ? null
          : normalizePersistedMediaProviderBaseUrl(current?.providerName ?? "", baseUrl);
      }

      // Only update API key if provided
      if (apiKey !== undefined) {
        if (apiKey) {
          updateData.apiKeyEncrypted = encrypt(apiKey);
          updateData.hasApiKey = true;
        } else {
          updateData.apiKeyEncrypted = null;
          updateData.hasApiKey = false;
        }
      }

      // Log only non-sensitive fields
      console.log("[MediaProviders] Updating provider", id);

      await db
        .update(mediaProviders)
        .set(updateData)
        .where(eq(mediaProviders.id, id));

      return { success: true };
    }),

  // Admin: Delete provider
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .delete(mediaProviders)
        .where(eq(mediaProviders.id, input.id));

      return { success: true };
    }),

  // Admin: Test provider connection
  testConnection: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(mediaProviders)
        .where(eq(mediaProviders.id, input.id));

      if (!provider) {
        return { success: false, message: "Provider not found" };
      }

      if (!provider.apiKeyEncrypted) {
        return { success: false, message: "API key not configured" };
      }

      const apiKey = decrypt(provider.apiKeyEncrypted);
      if (!apiKey) {
        return { success: false, message: "Failed to decrypt API key" };
      }

      const startTime = Date.now();
      let result: { success: boolean; message: string; latencyMs?: number; balance?: number };

      try {
        // Test based on provider type
        switch (normalizeMediaProviderName(provider.providerName)) {
          case "kie_ai":
            result = await testKieAI(apiKey, provider.baseUrl || "https://api.kie.ai/api/v1");
            break;
          case "fal_ai":
            result = await testFalAI(apiKey);
            break;
          case "replicate":
            result = await testReplicate(apiKey);
            break;
          case "byteplus_modelark":
            result = await testBytePlusModelArk(
              apiKey,
              provider.baseUrl || "https://ark.ap-southeast.bytepluses.com/api/v3"
            );
            break;
          case WAVESPEED_PROVIDER:
            result = await testWaveSpeedAI(
              apiKey,
              provider.baseUrl || "https://api.wavespeed.ai/api/v3"
            );
            break;
          case "uvoice":
            result = await testUVoice(
              apiKey,
              provider.baseUrl || "https://api.uvoice.ai"
            );
            break;
          default:
            // Generic test - just check if the base URL is reachable
            result = await testGenericProvider(apiKey, provider.baseUrl || "");
        }

        result.latencyMs = Date.now() - startTime;
      } catch (error: any) {
        result = {
          success: false,
          message: error.message || "Connection test failed",
          latencyMs: Date.now() - startTime,
        };
      }

      // Save test result
      await db
        .update(mediaProviders)
        .set({
          lastTestedAt: new Date(),
          lastTestResult: result,
          updatedAt: new Date(),
        })
        .where(eq(mediaProviders.id, input.id));

      return result;
    }),

  // Admin: Get provider stats
  stats: adminProcedure.query(async () => {
    try {
      const dbInstance = await getDb();
      if (!dbInstance) return { total: 0, enabled: 0, withApiKey: 0, byType: { image: 0, video: 0, audio: 0, multimodal: 0 } };
      const providers = await dbInstance.select().from(mediaProviders);

      return {
        total: providers.length,
        enabled: providers.filter(p => p.isEnabled).length,
        withApiKey: providers.filter(p => p.hasApiKey).length,
        byType: {
          image: providers.filter(p => p.providerType === "image").length,
          video: providers.filter(p => p.providerType === "video").length,
          audio: providers.filter(p => p.providerType === "audio").length,
          multimodal: providers.filter(p => p.providerType === "multimodal").length,
        },
      };
    } catch (error: any) {
      // Table might not exist yet - return empty stats
      console.warn("[MediaProviders] Stats query failed (table may not exist):", error.message);
      return {
        total: 0,
        enabled: 0,
        withApiKey: 0,
        byType: {
          image: 0,
          video: 0,
          audio: 0,
          multimodal: 0,
        },
      };
    }
  }),

  // Check if API key is configured (never returns the actual key)
  getApiKey: adminProcedure
    .input(z.object({ providerName: z.string() }))
    .query(async ({ input }) => {
      const [provider] = await db
        .select({
          apiKeyEncrypted: mediaProviders.apiKeyEncrypted,
          baseUrl: mediaProviders.baseUrl,
          callbackUrl: mediaProviders.callbackUrl,
          configJson: mediaProviders.configJson,
        })
        .from(mediaProviders)
        .where(eq(mediaProviders.providerName, input.providerName));

      if (!provider || !provider.apiKeyEncrypted) {
        return null;
      }

      const decrypted = decrypt(provider.apiKeyEncrypted);
      return {
        configured: !!decrypted,
        baseUrl: provider.baseUrl,
        callbackUrl: provider.callbackUrl,
        configJson: provider.configJson,
      };
    }),
});

/** Block SSRF: reject URLs pointing to private/internal networks */
function validateExternalUrl(url: string): void {
  try {
    assertPublicSafeHttpUrl(url);
  } catch (error) {
    if (error instanceof Error && /public host/i.test(error.message)) {
      throw new Error("URL points to a private/internal network address");
    }
    if (error instanceof Error && /http or https/i.test(error.message)) {
      throw new Error("Only HTTP(S) URLs are allowed");
    }
    throw error;
  }
}

// Test functions for each provider
export async function testKieAI(apiKey: string, baseUrl: string): Promise<{ success: boolean; message: string }> {
  // Kie AI uses a jobs API. Probe createTask with an intentionally invalid payload:
  // 400/422 means auth + endpoint are reachable without spending credits.
  validateExternalUrl(baseUrl);
  const response = await fetch(`${baseUrl}/jobs/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "__healthcheck__",
      input: {},
    }),
  });

  if (response.ok) {
    return { success: true, message: "Connection successful" };
  }

  const text = await response.text();
  if (response.status === 400 || response.status === 422) {
    return { success: true, message: "Authentication verified (validation error expected for health check)" };
  }

  return { success: false, message: `API error: ${response.status} - ${text}` };
}

export async function testFalAI(apiKey: string): Promise<{ success: boolean; message: string }> {
  // Send an authenticated POST to the queue endpoint with minimal payload.
  // A valid key returns 422 (validation error for missing required fields).
  // An invalid key returns 401.
  try {
    const response = await fetch("https://queue.fal.run/fal-ai/flux/schnell", {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (response.status === 422) {
      return { success: true, message: "API key validated (inference endpoint reachable)" };
    }
    if (response.status === 401) {
      return { success: false, message: "Invalid API key" };
    }
    if (response.status === 403) {
      return { success: false, message: "API key forbidden" };
    }
    if (response.status === 429) {
      return { success: true, message: "API key valid (rate limited)" };
    }
    if (response.ok) {
      return { success: true, message: "Connection successful" };
    }
    return { success: false, message: `fal.ai error (HTTP ${response.status})` };
  } catch (error: any) {
    return { success: false, message: `Connection failed: ${error.message}` };
  }
}

async function testReplicate(apiKey: string): Promise<{ success: boolean; message: string }> {
  // Replicate - get account info
  const response = await fetch("https://api.replicate.com/v1/account", {
    method: "GET",
    headers: {
      "Authorization": `Token ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, message: `API error: ${response.status} - ${text}` };
  }

  return { success: true, message: "Connection successful" };
}

export async function testBytePlusModelArk(
  apiKey: string,
  baseUrl: string
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  /**
   * Validates connectivity and API key for BytePlus ModelArk.
   * GETs the task list endpoint with a small page_size to confirm auth works.
   *
   * SSRF note: validateExternalUrl() is called BEFORE any fetch.
   */
  validateExternalUrl(baseUrl);
  const startTime = Date.now();
  const url = `${baseUrl.replace(/\/$/, "")}/contents/generations/tasks?page_size=3&filter.status=succeeded`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
  const latencyMs = Date.now() - startTime;

  if (response.status === 401) {
    return { success: false, message: "Invalid API key (401 Unauthorized)", latencyMs };
  }
  if (!response.ok) {
    const text = await response.text();
    return { success: false, message: `API error: ${response.status} - ${text}`, latencyMs };
  }
  return { success: true, message: "Connection successful", latencyMs };
}

function summarizeResponseText(text: string, maxLength = 160): string {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No response body";
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}

export async function testWaveSpeedAI(
  apiKey: string,
  baseUrl: string,
): Promise<{ success: boolean; message: string; latencyMs?: number; balance?: number }> {
  const normalizedBaseUrl = normalizeWaveSpeedBaseUrl(baseUrl);
  validateExternalUrl(normalizedBaseUrl);
  const startTime = Date.now();
  const response = await fetch(`${normalizedBaseUrl}/balance`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const latencyMs = Date.now() - startTime;

  if (response.status === 401) {
    return { success: false, message: "Invalid API key (401 Unauthorized)", latencyMs };
  }
  if (response.status === 403) {
    return { success: false, message: "WaveSpeed account is not authorized for this resource (403 Forbidden)", latencyMs };
  }
  if (response.status === 429) {
    return { success: false, message: "WaveSpeed rate limit reached (429 Too Many Requests)", latencyMs };
  }

  let payload: any = null;
  let responseSummary = "";
  try {
    payload = await response.json();
    responseSummary = summarizeResponseText(JSON.stringify(payload));
  } catch {
    responseSummary = summarizeResponseText(await response.text().catch(() => ""));
  }

  if (!response.ok) {
    return {
      success: false,
      message: `WaveSpeed API error (HTTP ${response.status}): ${responseSummary}`,
      latencyMs,
    };
  }

  const balance = payload?.data?.balance;
  if (typeof balance !== "number" || !Number.isFinite(balance)) {
    return {
      success: false,
      message: "WaveSpeed balance response did not include numeric data.balance",
      latencyMs,
    };
  }

  return {
    success: true,
    message: "Connection successful",
    latencyMs,
    balance,
  };
}

export async function testUVoice(
  apiKey: string,
  baseUrl: string
): Promise<{ success: boolean; message: string; latencyMs?: number; balance?: number }> {
  validateExternalUrl(baseUrl);
  const startTime = Date.now();
  const url = `${baseUrl.replace(/\/$/, "")}/generate`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      settings: {
        // Intentionally invalid (min length is 5) to validate auth without consuming generation quota.
        text: "test",
        voiceID: "TH-KantapongPremiumHD",
        outputType: "url",
        outputFormat: "mp3",
      },
    }),
  });

  const latencyMs = Date.now() - startTime;

  if (response.status === 401) {
    return { success: false, message: "Invalid API key (401 Unauthorized)", latencyMs };
  }
  if (response.status === 400 || response.status === 429) {
    return { success: true, message: "Connection successful (auth verified)", latencyMs };
  }
  if (!response.ok) {
    const text = await response.text();
    return { success: false, message: `API error: ${response.status} - ${text}`, latencyMs };
  }

  const payload: any = await response.json().catch(() => ({}));
  const balanceRaw =
    payload?.credits_remaining ??
    payload?.credits ??
    payload?.balance ??
    payload?.remaining_characters ??
    payload?.characters_remaining;
  const balance = typeof balanceRaw === "number" ? balanceRaw : undefined;

  return { success: true, message: "Connection successful", latencyMs, balance };
}

async function testGenericProvider(apiKey: string, baseUrl: string): Promise<{ success: boolean; message: string }> {
  if (!baseUrl) {
    return { success: false, message: "Base URL not configured" };
  }

  try {
    validateExternalUrl(baseUrl);
    const response = await fetch(baseUrl, {
      method: "HEAD",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    return {
      success: response.ok || response.status === 401, // 401 means the endpoint exists
      message: response.ok ? "Endpoint reachable" : `Status: ${response.status}`,
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}
