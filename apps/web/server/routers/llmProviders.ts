import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db, getDb } from "../db";
import { llmProviders, modelProviderMap } from "../../drizzle/schema";
import { eq, asc, desc, sql, count, and } from "drizzle-orm";
import {
  syncProviderModels,
  syncAllProviderModels,
  fetchAllOpenRouterModels,
  getProviderSyncStatus,
  importModelsFromOpenRouter,
  cleanupOldModels,
  cleanupAllOldModels,
  getCleanupPreview,
} from "../services/modelSyncService";
import { encrypt, decrypt } from "../services/crypto";
import {
  availableLlmProviderModelSchema,
  buildKieLlmAvailableModels,
  buildKRouterLlmAvailableModels,
  type AvailableLlmProviderModel,
} from "../services/llmProviderCatalog";
import { listVisibleWorkerLlmModels } from "../services/workerLlmCatalog";

interface EnabledProviderRow {
  id: number;
  providerName: string;
  displayName: string;
  availableModels: AvailableLlmProviderModel[] | null;
  configJson: Record<string, unknown> | null;
  defaultModel: string | null;
}

interface EnabledMappedModelRow {
  providerId: number;
  providerName: string;
  providerDisplayName: string;
  modelId: string;
  modelName: string;
  contextLength: number | null;
  /** Admin-curated quality flag (model_provider_map.isRecommended). */
  isRecommended?: boolean | null;
}

function findProviderTemplate(providerName: string) {
  return PROVIDER_TEMPLATES.find((template) => template.providerName === providerName);
}

const ROUTING_GATEWAY_CONFIG = {
  trustTier: "routing-gateway",
  thirdPartyRelay: true,
  dataPolicyDisclosure: "Requests are routed through a third-party model gateway before reaching upstream model providers.",
} as const;

function mergeProviderAvailableModels(
  currentModels: AvailableLlmProviderModel[] | null | undefined,
  templateModels: AvailableLlmProviderModel[] | null | undefined,
): AvailableLlmProviderModel[] | null {
  if (!Array.isArray(currentModels) || currentModels.length === 0) {
    return templateModels ?? null;
  }
  if (!Array.isArray(templateModels) || templateModels.length === 0) {
    return currentModels;
  }

  const currentById = new Map(currentModels.map((model) => [model.id, model]));
  const merged: AvailableLlmProviderModel[] = [];

  for (const templateModel of templateModels) {
    const current = currentById.get(templateModel.id);
    currentById.delete(templateModel.id);
    if (!current) {
      merged.push(templateModel);
      continue;
    }

    merged.push({
      ...current,
      ...templateModel,
      contextLength: templateModel.contextLength ?? current.contextLength,
      createdAt: templateModel.createdAt ?? current.createdAt,
      pricing: templateModel.pricing ?? current.pricing,
      config: templateModel.config ?? current.config,
    });
  }

  for (const leftover of currentById.values()) {
    merged.push(leftover);
  }

  return merged;
}

export function resolveProviderCatalogDefaults<T extends {
  providerName: string;
  displayName?: string | null;
  description?: string | null;
  baseUrl?: string | null;
  defaultModel?: string | null;
  availableModels?: AvailableLlmProviderModel[] | null;
}>(provider: T): T & {
  displayName?: string | null;
  description?: string | null;
  baseUrl?: string | null;
  defaultModel?: string | null;
  availableModels: AvailableLlmProviderModel[] | null;
} {
  const template = findProviderTemplate(provider.providerName);
  const mergedAvailableModels = mergeProviderAvailableModels(
    provider.availableModels,
    template?.availableModels,
  );

  return {
    ...provider,
    displayName: provider.displayName ?? template?.displayName ?? provider.displayName,
    description: provider.description ?? template?.description ?? provider.description,
    baseUrl: provider.baseUrl ?? template?.baseUrl ?? provider.baseUrl,
    defaultModel: provider.defaultModel ?? template?.defaultModel ?? null,
    availableModels: mergedAvailableModels,
  };
}

export function mergeAvailableLlmModels(input: {
  providers: EnabledProviderRow[];
  mappedModels?: EnabledMappedModelRow[];
}): Array<{
  id: string;
  name: string;
  provider: string;
  providerDisplayName: string;
  contextLength?: number;
  isDefault?: boolean;
  isRecommended?: boolean;
}> {
  const providersById = new Map(input.providers.map((provider) => [provider.id, provider]));
  const merged = new Map<string, {
    id: string;
    name: string;
    provider: string;
    providerDisplayName: string;
    contextLength?: number;
    isDefault?: boolean;
    isRecommended?: boolean;
  }>();

  for (const mappedModel of input.mappedModels ?? []) {
    const provider = providersById.get(mappedModel.providerId);
    if (!provider) {
      continue;
    }

    const key = `${provider.id}:${mappedModel.modelId}`;
    merged.set(key, {
      id: mappedModel.modelId,
      name: mappedModel.modelName,
      provider: mappedModel.providerName,
      providerDisplayName: mappedModel.providerDisplayName,
      contextLength: mappedModel.contextLength ?? undefined,
      isDefault: mappedModel.modelId === provider.defaultModel,
      // Carried so quality-critical pickers can filter to the curated set.
      // (Row-rebuild trap: this literal is the ONLY place the merged shape is
      // constructed — a new column silently vanishes if not added here.)
      isRecommended: mappedModel.isRecommended === true,
    });
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.providerDisplayName !== right.providerDisplayName) {
      return left.providerDisplayName.localeCompare(right.providerDisplayName);
    }
    return left.name.localeCompare(right.name);
  });
}

/** Block SSRF: reject URLs pointing to private/internal networks */
function validateExternalUrl(url: string): void {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^\[::1?\]$/,
    /^::1$/, /^::ffff:127\./i, /^fe80:/i,
    /^fc[0-9a-f]{2}:/i, /^fd[0-9a-f]{2}:/i,
    /\.internal$/i,
    /\.local$/i,
  ];
  if (blocked.some(r => r.test(hostname))) {
    throw new Error("URL points to a private/internal network address");
  }
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP(S) URLs are allowed");
  }
}

// Provider templates for adding new providers
export const PROVIDER_TEMPLATES = [
  {
    providerName: "kie_ai",
    displayName: "Kie AI",
    description: "Kie AI marketplace gateway for GPT, Claude, Gemini, and Codex chat models",
    baseUrl: "https://api.kie.ai",
    defaultModel: "gpt-5-4",
    availableModels: buildKieLlmAvailableModels(),
  },
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
    providerName: "nvidia_nim",
    displayName: "NVIDIA NIM (Hosted)",
    description: "Hosted NVIDIA Integrate API for chat, retrieval, guardrail, and multimodal models",
    baseUrl: "https://integrate.api.nvidia.com",
    defaultModel: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  },
  {
    providerName: "openrouter",
    displayName: "OpenRouter",
    description: "Access 420+ models with unified API (Primary gateway with fallback)",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    configDefaults: {
      ...ROUTING_GATEWAY_CONFIG,
      dataPolicyUrl: "https://openrouter.ai/privacy",
      allow_fallbacks: true,
      route: "fallback",
      sort: ["throughput", "latency", "price"],
    },
  },
  {
    providerName: "krouter",
    displayName: "KRouter",
    description: "Third-party AI relay with a unified OpenAI-compatible endpoint for routed GPT and Codex models",
    baseUrl: "https://api.krouter.net/v1",
    defaultModel: "gpt-5.5",
    availableModels: buildKRouterLlmAvailableModels(),
    configDefaults: {
      ...ROUTING_GATEWAY_CONFIG,
      dataPolicyUrl: "https://krouter.net/",
      allow_fallbacks: true,
      route: "fallback",
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
  {
    providerName: "moonshot",
    displayName: "Moonshot AI (Kimi)",
    description: "Kimi models with extended context windows up to 128K",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-128k",
  },
  {
    providerName: "together",
    displayName: "Together AI",
    description: "Fast inference for open-source models including Llama, Mistral, and more",
    baseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  {
    providerName: "fireworks",
    displayName: "Fireworks AI",
    description: "High-performance inference for open models with function calling support",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
  },
  {
    providerName: "knplabai",
    displayName: "KNPLabs AI",
    description: "Multi-provider AI gateway for chat model routing, media generation, speech, and embeddings",
    baseUrl: "https://api.knplabai.com/ai/v1",
    defaultModel: "deepseek-v3.2",
  },
];

export const llmProvidersRouter = router({
  // Get all enabled mapped models from enabled providers (for Desktop App model selector)
  availableModels: protectedProcedure.query(async () => {
    try {
      const dbInstance = await getDb();
      if (!dbInstance) return { models: [], providers: [] };
      const [providers, mappedModels] = await Promise.all([
        dbInstance
          .select({
            id: llmProviders.id,
            providerName: llmProviders.providerName,
            displayName: llmProviders.displayName,
            availableModels: llmProviders.availableModels,
            configJson: llmProviders.configJson,
            defaultModel: llmProviders.defaultModel,
          })
          .from(llmProviders)
          .where(eq(llmProviders.isEnabled, true))
          .orderBy(asc(llmProviders.sortOrder)),
        dbInstance
          .select({
            providerId: modelProviderMap.providerId,
            providerName: llmProviders.providerName,
            providerDisplayName: llmProviders.displayName,
            modelId: modelProviderMap.modelId,
            modelName: modelProviderMap.modelName,
            contextLength: modelProviderMap.contextLength,
            isRecommended: modelProviderMap.isRecommended,
          })
          .from(modelProviderMap)
          .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
          .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
          .orderBy(asc(modelProviderMap.modelName), asc(modelProviderMap.priority)),
      ]);

      const enabledProviders = (providers as EnabledProviderRow[]).map((provider) =>
        resolveProviderCatalogDefaults(provider),
      );
      const models = mergeAvailableLlmModels({
        providers: enabledProviders,
        mappedModels: mappedModels.filter((row) =>
          enabledProviders.some((provider) => provider.id === row.providerId),
        ) as EnabledMappedModelRow[],
      });

      const workerModels = ctx.tenantId
        ? await listVisibleWorkerLlmModels({
            tenantId: ctx.tenantId,
            userId: ctx.user.id,
            task: "chat",
          })
        : [];
      return {
        models: [...models, ...workerModels],
        providers: [
          ...enabledProviders.map(p => ({
          name: p.providerName,
          displayName: p.displayName,
          isPrimary: (p.configJson as any)?.isPrimary === true,
          isFallback: (p.configJson as any)?.isFallback === true,
          })),
          ...(workerModels.length > 0
            ? [{ name: "worker_app", displayName: "Worker Local AI", isPrimary: false, isFallback: false }]
            : []),
        ],
      };
    } catch (error) {
      console.warn("[llmProviders.availableModels] falling back after query failure", error);
      const fallbackModels = buildKieLlmAvailableModels()
        .filter((model) => model.surface === "chat" || model.surface == null)
        .map((model) => ({
          id: model.id,
          name: model.name,
          provider: "kie_ai",
          providerDisplayName: "Kie AI",
          contextLength: model.contextLength,
          isDefault: model.id === "gpt-5-4",
          // Keep both return branches structurally identical — a shape that
          // differs only in the fallback path turns this procedure's result
          // into a union that downstream consumers (ChatView) cannot accept.
          isRecommended: false,
        }));

      return {
        models: fallbackModels,
        providers: [{
          name: "kie_ai",
          displayName: "Kie AI",
          isPrimary: true,
          isFallback: true,
        }],
      };
    }
  }),

  workerLocalModels: protectedProcedure
    .input(z.object({ task: z.enum(["chat", "completion", "vision", "embedding"]).default("chat") }).optional())
    .query(async ({ ctx, input }) => ctx.tenantId
      ? listVisibleWorkerLlmModels({
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          task: input?.task ?? "chat",
        })
      : []),

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
    
    return providers.map((provider: typeof providers[number]) => resolveProviderCatalogDefaults(provider as any));
  }),

  // Get all providers (admin)
  adminList: adminProcedure.query(async () => {
    // Get providers
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

    // Get model counts from model_provider_map for each provider
    const modelCounts = await db
      .select({
        providerId: modelProviderMap.providerId,
        count: count(),
      })
      .from(modelProviderMap)
      .where(eq(modelProviderMap.isEnabled, true))
      .groupBy(modelProviderMap.providerId);

    const countMap = new Map(modelCounts.map((c: (typeof modelCounts)[number]) => [c.providerId, Number(c.count)]));

    // Merge routed model count into providers
    return providers.map((p: (typeof providers)[number]) => {
      const hydrated = resolveProviderCatalogDefaults(p as any);
      return {
      ...hydrated,
      routedModelCount: countMap.get(p.id) ?? 0,
      };
    });
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
      availableModels: z.array(availableLlmProviderModelSchema).optional(),
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
      
      const [created] = await db.insert(llmProviders).values({
        ...(() => {
          const template = findProviderTemplate(input.providerName);
          return {
            configJson: input.configJson || (template as any)?.configDefaults || null,
          };
        })(),
        providerName: input.providerName,
        displayName: input.displayName,
        description: input.description || null,
        baseUrl: input.baseUrl || null,
        apiKeyEncrypted: input.apiKey ? encrypt(input.apiKey) : null,
        hasApiKey: !!input.apiKey,
        defaultModel: input.defaultModel || null,
        availableModels: input.availableModels || null,
        isEnabled: input.isEnabled,
        sortOrder: (maxOrder?.max || 0) + 1,
      }).returning({ id: llmProviders.id });
      
      return { id: created.id };
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
      availableModels: z.array(availableLlmProviderModelSchema).optional(),
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
      const [providerDetails] = await db
        .select({
          isEnabled: llmProviders.isEnabled,
          providerName: llmProviders.providerName,
          availableModels: llmProviders.availableModels,
          defaultModel: llmProviders.defaultModel,
        })
        .from(llmProviders)
        .where(eq(llmProviders.id, input.id))
        .limit(1);
      
      if (!providerDetails) {
        throw new Error("Provider not found");
      }

      const nextEnabled = !providerDetails.isEnabled;
      const hydrated = resolveProviderCatalogDefaults(providerDetails as any);
      
      await db
        .update(llmProviders)
        .set({
          isEnabled: nextEnabled,
          availableModels:
            nextEnabled
            && (!Array.isArray(providerDetails.availableModels) || providerDetails.availableModels.length === 0)
              ? hydrated.availableModels
              : undefined,
          defaultModel:
            nextEnabled
            && !providerDetails.defaultModel
            && hydrated.defaultModel
              ? hydrated.defaultModel
              : undefined,
        })
        .where(eq(llmProviders.id, input.id));
      
      return { isEnabled: nextEnabled };
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
          case "krouter":
          case "deepseek":
          case "ollama":
            testUrl = `${provider.baseUrl}/models`;
            headers = { Authorization: `Bearer ${apiKey}` };
            break;
          case "nvidia_nim":
            testUrl = provider.baseUrl.includes("/v1")
              ? `${provider.baseUrl}/models`
              : `${provider.baseUrl}/v1/models`;
            headers = { Authorization: `Bearer ${apiKey}` };
            break;
          case "anthropic":
            // Anthropic doesn't have a simple test endpoint
            return { success: true, message: "API key configured (Anthropic)" };
          case "google":
            testUrl = `${provider.baseUrl}/models`;
            headers = { "x-goog-api-key": apiKey };
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
        
        // SSRF protection: block private/internal URLs
        validateExternalUrl(testUrl);

        const response = await fetch(testUrl, {
          method: "GET",
          headers,
          redirect: "manual",  // Don't follow redirects to internal IPs
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          return { success: true, message: "Connection successful" };
        } else {
          return { success: false, message: `Connection failed: HTTP ${response.status}` };
        }
      } catch (error: any) {
        return { success: false, message: `Connection failed: ${error.message}` };
      }
    }),

  // Check if API key is configured (never returns the actual key)
  getApiKey: adminProcedure
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
        return { configured: false };
      }

      // Verify the key can be decrypted without returning it
      const decrypted = decrypt(provider.apiKeyEncrypted);
      return { configured: !!decrypted };
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
    
    const totalModels = providers.reduce((sum: number, p: (typeof providers)[number]) => {
      const hydrated = resolveProviderCatalogDefaults(p as any);
      const models = (hydrated.availableModels as any[]) || [];
      return sum + models.length;
    }, 0);
    
    return {
      total: providers.length,
      enabled: providers.filter((p: (typeof providers)[number]) => p.isEnabled).length,
      configured: providers.filter((p: (typeof providers)[number]) => p.hasApiKey).length,
      ready: providers.filter((p: (typeof providers)[number]) => p.isEnabled && p.hasApiKey).length,
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

  // Get cleanup preview - shows what would be deleted
  cleanupPreview: adminProcedure
    .input(z.object({ providerId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      return getCleanupPreview(input?.providerId);
    }),

  // Cleanup old models from a specific provider
  cleanupProvider: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      return cleanupOldModels(input.id);
    }),

  // Cleanup old models from all providers
  cleanupAll: adminProcedure.mutation(async () => {
    return cleanupAllOldModels();
  }),
});
