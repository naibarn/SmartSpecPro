import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { llmProviders } from "../../drizzle/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import {
  syncProviderModels,
  syncAllProviderModels,
  fetchAllOpenRouterModels,
  getProviderSyncStatus,
  importModelsFromOpenRouter,
} from "../services/modelSyncService";

// Simple encryption for API keys (in production, use proper key management)
const ENCRYPTION_KEY = process.env.LLM_ENCRYPTION_KEY || "smartspec-llm-key-32chars!!";
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
    providerName: "openai",
    displayName: "OpenAI",
    description: "GPT-4, GPT-4o, GPT-3.5, and other OpenAI models",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    providerName: "anthropic",
    displayName: "Anthropic Claude",
    description: "Claude 3.5, Claude 3 Opus, Sonnet, and Haiku models",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-20241022",
  },
  {
    providerName: "google",
    displayName: "Google AI (Gemini)",
    description: "Gemini Pro, Gemini Flash, and other Google AI models",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
  },
  {
    providerName: "groq",
    displayName: "Groq",
    description: "Ultra-fast LLM inference with Llama, Mixtral, and Gemma models",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
  },
  {
    providerName: "openrouter",
    displayName: "OpenRouter",
    description: "Access 420+ models with unified API (Primary gateway with fallback)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    configDefaults: {
      allow_fallbacks: true,
      route: "fallback",
      sort: ["throughput", "latency", "price"],
    },
  },
  {
    providerName: "minimax",
    displayName: "Minimax",
    description: "Minimax AI models including MiniMax-Text-01 and abab series",
    baseUrl: "https://api.minimax.chat/v1",
    defaultModel: "MiniMax-Text-01",
  },
  {
    providerName: "qwen",
    displayName: "Qwen (Alibaba)",
    description: "Qwen series models from Alibaba Cloud",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-max",
  },
  {
    providerName: "ollama",
    displayName: "Ollama (Local)",
    description: "Run models locally with Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
  },
  {
    providerName: "zhipu",
    displayName: "Zhipu AI (GLM)",
    description: "GLM series models from Zhipu AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
  },
  {
    providerName: "deepseek",
    displayName: "DeepSeek",
    description: "DeepSeek AI models including DeepSeek-V3",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
];

export const llmProvidersRouter = router({
  // Get all available models from enabled providers (for Desktop App model selector)
  // This is a public endpoint that returns flattened model list
  availableModels: protectedProcedure.query(async () => {
    const providers = await db
      .select({
        providerName: llmProviders.providerName,
        displayName: llmProviders.displayName,
        availableModels: llmProviders.availableModels,
        configJson: llmProviders.configJson,
        defaultModel: llmProviders.defaultModel,
      })
      .from(llmProviders)
      .where(eq(llmProviders.isEnabled, true))
      .orderBy(asc(llmProviders.sortOrder));
    
    // Flatten models from all providers
    const models: Array<{
      id: string;
      name: string;
      provider: string;
      providerDisplayName: string;
      contextLength?: number;
      isDefault?: boolean;
    }> = [];
    
    for (const provider of providers) {
      const providerModels = provider.availableModels as Array<{
        id: string;
        name: string;
        contextLength?: number;
      }> || [];
      
      for (const model of providerModels) {
        models.push({
          id: model.id,
          name: model.name,
          provider: provider.providerName,
          providerDisplayName: provider.displayName,
          contextLength: model.contextLength,
          isDefault: model.id === provider.defaultModel,
        });
      }
    }
    
    return {
      models,
      providers: providers.map(p => ({
        name: p.providerName,
        displayName: p.displayName,
        isPrimary: (p.configJson as any)?.isPrimary === true,
        isFallback: (p.configJson as any)?.isFallback === true,
      })),
    };
  }),

  // Get all enabled providers (for users)
  list: protectedProcedure.query(async () => {
    const providers = await db
      .select({
        id: llmProviders.id,
        providerName: llmProviders.providerName,
        displayName: llmProviders.displayName,
        description: llmProviders.description,
        baseUrl: llmProviders.baseUrl,
        defaultModel: llmProviders.defaultModel,
        availableModels: llmProviders.availableModels,
        configJson: llmProviders.configJson,
        isEnabled: llmProviders.isEnabled,
      })
      .from(llmProviders)
      .where(eq(llmProviders.isEnabled, true))
      .orderBy(asc(llmProviders.sortOrder));
    
    return providers;
  }),

  // Get all providers (admin)
  adminList: adminProcedure.query(async () => {
    const providers = await db
      .select({
        id: llmProviders.id,
        providerName: llmProviders.providerName,
        displayName: llmProviders.displayName,
        description: llmProviders.description,
        baseUrl: llmProviders.baseUrl,
        hasApiKey: llmProviders.hasApiKey,
        defaultModel: llmProviders.defaultModel,
        availableModels: llmProviders.availableModels,
        configJson: llmProviders.configJson,
        isEnabled: llmProviders.isEnabled,
        sortOrder: llmProviders.sortOrder,
        createdAt: llmProviders.createdAt,
        updatedAt: llmProviders.updatedAt,
      })
      .from(llmProviders)
      .orderBy(asc(llmProviders.sortOrder));
    
    return providers;
  }),

  // Get provider templates
  templates: adminProcedure.query(() => {
    return PROVIDER_TEMPLATES;
  }),

  // Get single provider (admin)
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(llmProviders)
        .where(eq(llmProviders.id, input.id))
        .limit(1);
      
      if (!provider) {
        throw new Error("Provider not found");
      }
      
      // Don't return the encrypted API key
      return {
        ...provider,
        apiKeyEncrypted: undefined,
      };
    }),

  // Create provider (admin)
  create: adminProcedure
    .input(z.object({
      providerName: z.string().min(1).max(64),
      displayName: z.string().min(1).max(128),
      description: z.string().optional(),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      defaultModel: z.string().optional(),
      availableModels: z.array(z.object({
        id: z.string(),
        name: z.string(),
        contextLength: z.number().optional(),
        pricing: z.object({
          input: z.number(),
          output: z.number(),
        }).optional(),
      })).optional(),
      configJson: z.record(z.any()).optional(),
      isEnabled: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      // Check if provider already exists
      const existing = await db
        .select({ id: llmProviders.id })
        .from(llmProviders)
        .where(eq(llmProviders.providerName, input.providerName))
        .limit(1);
      
      if (existing.length > 0) {
        throw new Error("Provider with this name already exists");
      }
      
      // Get max sort order
      const [maxOrder] = await db
        .select({ max: sql<number>`MAX(${llmProviders.sortOrder})` })
        .from(llmProviders);
      
      const result = await db.insert(llmProviders).values({
        providerName: input.providerName,
        displayName: input.displayName,
        description: input.description || null,
        baseUrl: input.baseUrl || null,
        apiKeyEncrypted: input.apiKey ? encrypt(input.apiKey) : null,
        hasApiKey: !!input.apiKey,
        defaultModel: input.defaultModel || null,
        availableModels: input.availableModels || null,
        configJson: input.configJson || null,
        isEnabled: input.isEnabled,
        sortOrder: (maxOrder?.max || 0) + 1,
      });
      
      return { id: Number(result.insertId) };
    }),

  // Update provider (admin)
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      displayName: z.string().min(1).max(128).optional(),
      description: z.string().optional(),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(), // If provided, update the key
      defaultModel: z.string().optional(),
      availableModels: z.array(z.object({
        id: z.string(),
        name: z.string(),
        contextLength: z.number().optional(),
        pricing: z.object({
          input: z.number(),
          output: z.number(),
        }).optional(),
      })).optional(),
      configJson: z.record(z.any()).optional(),
      isEnabled: z.boolean().optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, apiKey, ...updates } = input;
      
      const updateData: any = { ...updates };
      
      // Handle API key update
      if (apiKey !== undefined) {
        if (apiKey === "") {
          // Clear API key
          updateData.apiKeyEncrypted = null;
          updateData.hasApiKey = false;
        } else {
          // Set new API key
          updateData.apiKeyEncrypted = encrypt(apiKey);
          updateData.hasApiKey = true;
        }
      }
      
      await db
        .update(llmProviders)
        .set(updateData)
        .where(eq(llmProviders.id, id));
      
      return { success: true };
    }),

  // Delete provider (admin)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(llmProviders).where(eq(llmProviders.id, input.id));
      return { success: true };
    }),

  // Toggle enabled status (admin)
  toggleEnabled: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [provider] = await db
        .select({ isEnabled: llmProviders.isEnabled })
        .from(llmProviders)
        .where(eq(llmProviders.id, input.id))
        .limit(1);
      
      if (!provider) {
        throw new Error("Provider not found");
      }
      
      await db
        .update(llmProviders)
        .set({ isEnabled: !provider.isEnabled })
        .where(eq(llmProviders.id, input.id));
      
      return { isEnabled: !provider.isEnabled };
    }),

  // Update sort order (admin)
  updateSortOrder: adminProcedure
    .input(z.object({
      updates: z.array(z.object({
        id: z.number(),
        sortOrder: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      for (const update of input.updates) {
        await db
          .update(llmProviders)
          .set({ sortOrder: update.sortOrder })
          .where(eq(llmProviders.id, update.id));
      }
      return { success: true };
    }),

  // Test provider connection (admin)
  testConnection: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [provider] = await db
        .select()
        .from(llmProviders)
        .where(eq(llmProviders.id, input.id))
        .limit(1);
      
      if (!provider) {
        throw new Error("Provider not found");
      }
      
      if (!provider.apiKeyEncrypted) {
        throw new Error("No API key configured");
      }
      
      const apiKey = decrypt(provider.apiKeyEncrypted);
      if (!apiKey) {
        throw new Error("Failed to decrypt API key");
      }
      
      // Test based on provider type
      try {
        let testUrl = provider.baseUrl || "";
        let headers: Record<string, string> = {};
        
        switch (provider.providerName) {
          case "openai":
          case "groq":
          case "openrouter":
          case "deepseek":
          case "ollama":
            testUrl = `${provider.baseUrl}/models`;
            headers = { Authorization: `Bearer ${apiKey}` };
            break;
          case "anthropic":
            // Anthropic doesn't have a simple test endpoint
            return { success: true, message: "API key configured (Anthropic)" };
          case "google":
            testUrl = `${provider.baseUrl}/models?key=${apiKey}`;
            break;
          case "minimax":
          case "qwen":
          case "zhipu":
            // These providers may have different auth methods
            testUrl = `${provider.baseUrl}/models`;
            headers = { Authorization: `Bearer ${apiKey}` };
            break;
          default:
            testUrl = `${provider.baseUrl}/models`;
            headers = { Authorization: `Bearer ${apiKey}` };
        }
        
        const response = await fetch(testUrl, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });
        
        if (response.ok) {
          return { success: true, message: "Connection successful" };
        } else {
          const error = await response.text();
          return { success: false, message: `Connection failed: ${response.status} - ${error.slice(0, 200)}` };
        }
      } catch (error: any) {
        return { success: false, message: `Connection failed: ${error.message}` };
      }
    }),

  // Get API key for internal use (not exposed to client)
  // This is used by the LLM gateway
  getApiKey: protectedProcedure
    .input(z.object({ providerName: z.string() }))
    .query(async ({ input }) => {
      const [provider] = await db
        .select({
          apiKeyEncrypted: llmProviders.apiKeyEncrypted,
          isEnabled: llmProviders.isEnabled,
        })
        .from(llmProviders)
        .where(eq(llmProviders.providerName, input.providerName))
        .limit(1);
      
      if (!provider || !provider.isEnabled || !provider.apiKeyEncrypted) {
        return null;
      }
      
      return decrypt(provider.apiKeyEncrypted);
    }),

  // Get provider stats (admin)
  stats: adminProcedure.query(async () => {
    const providers = await db
      .select({
        isEnabled: llmProviders.isEnabled,
        hasApiKey: llmProviders.hasApiKey,
        availableModels: llmProviders.availableModels,
      })
      .from(llmProviders);
    
    const totalModels = providers.reduce((sum, p) => {
      const models = (p.availableModels as any[]) || [];
      return sum + models.length;
    }, 0);
    
    return {
      total: providers.length,
      enabled: providers.filter(p => p.isEnabled).length,
      configured: providers.filter(p => p.hasApiKey).length,
      ready: providers.filter(p => p.isEnabled && p.hasApiKey).length,
      totalModels,
    };
  }),

  // Sync models for a specific provider from OpenRouter
  syncProvider: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Get OpenRouter API key if configured
      const [openRouter] = await db
        .select({ apiKeyEncrypted: llmProviders.apiKeyEncrypted })
        .from(llmProviders)
        .where(eq(llmProviders.providerName, "openrouter"))
        .limit(1);
      
      const apiKey = openRouter?.apiKeyEncrypted ? decrypt(openRouter.apiKeyEncrypted) : undefined;
      
      return syncProviderModels(input.id, apiKey);
    }),

  // Sync models for all enabled providers
  syncAll: adminProcedure.mutation(async () => {
    // Get OpenRouter API key if configured
    const [openRouter] = await db
      .select({ apiKeyEncrypted: llmProviders.apiKeyEncrypted })
      .from(llmProviders)
      .where(eq(llmProviders.providerName, "openrouter"))
      .limit(1);
    
    const apiKey = openRouter?.apiKeyEncrypted ? decrypt(openRouter.apiKeyEncrypted) : undefined;
    
    return syncAllProviderModels(apiKey);
  }),

  // Browse all available models from OpenRouter
  browseOpenRouterModels: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      provider: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      // Get OpenRouter API key if configured
      const [openRouter] = await db
        .select({ apiKeyEncrypted: llmProviders.apiKeyEncrypted })
        .from(llmProviders)
        .where(eq(llmProviders.providerName, "openrouter"))
        .limit(1);
      
      const apiKey = openRouter?.apiKeyEncrypted ? decrypt(openRouter.apiKeyEncrypted) : undefined;
      
      const result = await fetchAllOpenRouterModels(apiKey);
      
      let filteredModels = result.models;
      
      // Filter by provider
      if (input?.provider) {
        filteredModels = filteredModels.filter(m => 
          m.provider?.toLowerCase() === input.provider?.toLowerCase() ||
          m.id.toLowerCase().startsWith(input.provider?.toLowerCase() + "/")
        );
      }
      
      // Filter by search
      if (input?.search) {
        const search = input.search.toLowerCase();
        filteredModels = filteredModels.filter(m =>
          m.id.toLowerCase().includes(search) ||
          m.name.toLowerCase().includes(search)
        );
      }
      
      return {
        models: filteredModels,
        providers: result.providers,
        totalCount: result.totalCount,
        filteredCount: filteredModels.length,
      };
    }),

  // Get sync status for a provider
  getSyncStatus: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getProviderSyncStatus(input.id);
    }),

  // Import specific models from OpenRouter to a provider
  importModels: adminProcedure
    .input(z.object({
      providerId: z.number(),
      modelIds: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      // Get OpenRouter API key if configured
      const [openRouter] = await db
        .select({ apiKeyEncrypted: llmProviders.apiKeyEncrypted })
        .from(llmProviders)
        .where(eq(llmProviders.providerName, "openrouter"))
        .limit(1);
      
      const apiKey = openRouter?.apiKeyEncrypted ? decrypt(openRouter.apiKeyEncrypted) : undefined;
      
      return importModelsFromOpenRouter(input.providerId, input.modelIds, apiKey);
    }),
});
