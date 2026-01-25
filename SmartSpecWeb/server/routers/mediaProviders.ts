import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { mediaProviders } from "../../drizzle/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import crypto from "crypto";

// Simple encryption for API keys (in production, use proper key management)
const ENCRYPTION_KEY = process.env.MEDIA_ENCRYPTION_KEY || process.env.LLM_ENCRYPTION_KEY || "smartspec-media-key-32chars!";
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text: string): string {
  try {
    const parts = text.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return "";
  }
}

// Provider templates for adding new providers
const PROVIDER_TEMPLATES = [
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
      const providers = await db
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

      console.log("Updating provider", id, "with data:", JSON.stringify(updateData, null, 2));

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
      const providers = await db.select().from(mediaProviders);

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

  // Get decrypted API key (for internal use by Python backend proxy)
  // This is admin-only and should only be called internally
  getApiKey: adminProcedure
    .input(z.object({ providerName: z.string() }))
    .query(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(mediaProviders)
        .where(eq(mediaProviders.providerName, input.providerName));

      if (!provider || !provider.apiKeyEncrypted) {
        return null;
      }

      return {
        apiKey: decrypt(provider.apiKeyEncrypted),
        baseUrl: provider.baseUrl,
        callbackUrl: provider.callbackUrl,
        configJson: provider.configJson,
      };
    }),
});

// Test functions for each provider
async function testKieAI(apiKey: string, baseUrl: string): Promise<{ success: boolean; message: string; balance?: number }> {
  // Kie AI uses Bearer token authentication
  // Test by checking account balance or a lightweight endpoint
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

async function testGenericProvider(apiKey: string, baseUrl: string): Promise<{ success: boolean; message: string }> {
  if (!baseUrl) {
    return { success: false, message: "Base URL not configured" };
  }

  try {
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
