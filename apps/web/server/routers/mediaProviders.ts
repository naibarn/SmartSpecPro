import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db, getDb } from "../db";
import { mediaProviders } from "../../drizzle/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import { encrypt, decrypt } from "../services/crypto";

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
    ],
  },
  {
    providerName: "fal_ai",
    displayName: "fal.ai",
    description: "Fast inference platform for generative AI - supports real-time image and video generation with optimized latency",
    providerType: "multimodal" as const,
    baseUrl: "https://fal.run",
    defaultModel: "fal-ai/flux/schnell",
    availableModels: [
      // Image models
      { id: "fal-ai/flux/schnell", name: "Flux Schnell", type: "image" as const, description: "Ultra-fast image generation" },
      { id: "fal-ai/flux/dev", name: "Flux Dev", type: "image" as const, description: "High quality image generation" },
      { id: "fal-ai/flux-pro", name: "Flux Pro", type: "image" as const, description: "Professional image generation" },
      { id: "fal-ai/stable-diffusion-v3-medium", name: "Stable Diffusion 3 Medium", type: "image" as const, description: "SD3 image generation" },
      // Video models
      { id: "fal-ai/minimax-video-01", name: "MiniMax Video", type: "video" as const, description: "Video generation" },
      { id: "fal-ai/kling-video/v1/standard/image-to-video", name: "Kling Image to Video", type: "video" as const, description: "Image to video conversion" },
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

      // Get max sort order
      const [maxSort] = await db
        .select({ max: sql<number>`COALESCE(MAX(${mediaProviders.sortOrder}), -1)` })
        .from(mediaProviders);

      const [provider] = await db
        .insert(mediaProviders)
        .values({
          ...data,
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

      // If setting as primary, unset other primaries of same type
      if (data.isPrimary) {
        const [current] = await db
          .select()
          .from(mediaProviders)
          .where(eq(mediaProviders.id, id));

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
        updateData.callbackUrl = callbackUrl; // null will clear, string will set
      }
      if (baseUrl !== undefined) {
        updateData.baseUrl = baseUrl; // null will clear, string will set
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
        switch (provider.providerName) {
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
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/i, /^127\.\d+\.\d+\.\d+$/, /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/, /^0\.0\.0\.0$/, /^\[::1?\]$/,
    /^::1$/, /^::ffff:127\./i, /^fe80:/i, /^fd[0-9a-f]{2}:/i,
    /\.internal$/i, /\.local$/i,
  ];
  if (blocked.some(r => r.test(hostname))) {
    throw new Error("URL points to a private/internal network address");
  }
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP(S) URLs are allowed");
  }
}

// Test functions for each provider
async function testKieAI(apiKey: string, baseUrl: string): Promise<{ success: boolean; message: string; balance?: number }> {
  // Kie AI uses Bearer token authentication
  validateExternalUrl(baseUrl);
  const response = await fetch(`${baseUrl}/account/balance`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, message: `API error: ${response.status} - ${text}` };
  }

  const data = await response.json();
  return {
    success: true,
    message: "Connection successful",
    balance: data.balance || data.credits,
  };
}

async function testFalAI(apiKey: string): Promise<{ success: boolean; message: string }> {
  // fal.ai authentication test
  const response = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "OPTIONS",
    headers: {
      "Authorization": `Key ${apiKey}`,
    },
  });

  // OPTIONS should return 200 or 204 if the key format is correct
  // For a real test, we'd need to make an actual inference call
  if (response.ok || response.status === 204) {
    return { success: true, message: "API key format validated" };
  }

  return { success: false, message: `API error: ${response.status}` };
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
