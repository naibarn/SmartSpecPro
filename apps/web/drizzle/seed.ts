/**
 * Seed script for multi-provider model mappings
 * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING)
 */

import { getDb } from "../server/db";
import { llmProviders, modelProviderMap, routingRules } from "./schema";
import { eq } from "drizzle-orm";

interface ModelMapping {
  modelId: string;
  modelName: string;
  providerModelId: string;
  pricingInput: string;  // per 1M tokens
  pricingOutput: string; // per 1M tokens
  isFree: boolean;
  contextLength: number;
  priority: number;
}

export async function seedZenProvider(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Seed] Database not available");
    return;
  }

  const apiKey = process.env.OPENCODE_ZEN_API_KEY || "";
  const hasKey = !!apiKey;

  // Define available models for OpenCode Zen
  // IMPORTANT: The 'id' field must match 'modelId' in modelProviderMap for correct routing
  const zenAvailableModels = [
    {
      id: "kimi-k2.5-free",
      name: "Kimi K2.5 (Free)",
      contextLength: 131072,
      pricing: { input: 0, output: 0 }
    },
    {
      id: "minimax-m2.1-free",
      name: "MiniMax M2.1 (Free)",
      contextLength: 245760,
      pricing: { input: 0, output: 0 }
    },
    {
      id: "glm-4.7-free",
      name: "GLM 4.7 (Free)",
      contextLength: 131072,
      pricing: { input: 0, output: 0 }
    },
  ];

  // 1. Upsert OpenCode Zen provider
  await db
    .insert(llmProviders)
    .values({
      providerName: "opencode-zen",
      displayName: "OpenCode Zen",
      description: "Secondary provider with free model access",
      baseUrl: "https://open-api.zen.com",
      apiKeyEncrypted: apiKey || null,
      hasApiKey: hasKey,
      isEnabled: hasKey,
      sortOrder: 10,
      providerType: "secondary",
      healthStatus: "healthy",
      failureCount: 0,
      successCount: 0,
      configJson: { firstChunkTimeoutMs: 15000 },
      availableModels: zenAvailableModels,
      defaultModel: "kimi-k2.5-free",
    })
    .onConflictDoNothing({ target: llmProviders.providerName });

  // Update availableModels if provider already exists
  await db
    .update(llmProviders)
    .set({
      availableModels: zenAvailableModels,
      defaultModel: "kimi-k2.5-free",
    })
    .where(eq(llmProviders.providerName, "opencode-zen"));

  // 2. Get provider IDs
  const [zenProvider] = await db
    .select({ id: llmProviders.id })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, "opencode-zen"))
    .limit(1);

  const [openrouterProvider] = await db
    .select({ id: llmProviders.id })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, "openrouter"))
    .limit(1);

  if (!zenProvider) {
    console.warn("[Seed] Failed to find OpenCode Zen provider after insert");
    return;
  }

  const zenId = zenProvider.id;
  const openrouterId = openrouterProvider?.id;

  if (!hasKey) {
    console.warn("[Seed] OPENCODE_ZEN_API_KEY not set — provider seeded but disabled");
  }

  // 3. OpenCode Zen free models (priority 0 = highest)
  // NOTE: OpenCode Zen uses model names directly WITHOUT any prefix (e.g., "kimi-k2.5-free", not "opencode/...")
  const zenFreeModels: ModelMapping[] = [
    {
      modelId: "kimi-k2.5-free",
      modelName: "Kimi K2.5",
      providerModelId: "kimi-k2.5-free",
      pricingInput: "0",
      pricingOutput: "0",
      isFree: true,
      contextLength: 131072,
      priority: 0,
    },
    {
      modelId: "minimax-m2.1-free",
      modelName: "MiniMax M2.1",
      providerModelId: "minimax-m2.1-free",
      pricingInput: "0",
      pricingOutput: "0",
      isFree: true,
      contextLength: 245760,
      priority: 0,
    },
    {
      modelId: "glm-4.7-free",
      modelName: "GLM 4.7",
      providerModelId: "glm-4.7-free",
      pricingInput: "0",
      pricingOutput: "0",
      isFree: true,
      contextLength: 131072,
      priority: 0,
    },
  ];

  // Insert OpenCode Zen models
  for (const model of zenFreeModels) {
    await db
      .insert(modelProviderMap)
      .values({
        modelId: model.modelId,
        providerId: zenId,
        modelName: model.modelName,
        providerModelId: model.providerModelId,
        pricingInput: model.pricingInput,
        pricingOutput: model.pricingOutput,
        isFree: model.isFree,
        contextLength: model.contextLength,
        isEnabled: true,
        priority: model.priority,
      })
      .onConflictDoNothing();
  }

  console.log(`[Seed] OpenCode Zen: ${zenFreeModels.length} free models`);

  // 4. OpenRouter models (paid fallbacks + additional models)
  if (openrouterId) {
    const openrouterModels: ModelMapping[] = [
      // Paid fallbacks for free models (priority 10 = lower than free)
      {
        modelId: "kimi-k2.5-free",
        modelName: "Kimi K2.5",
        providerModelId: "moonshotai/kimi-k2.5",
        pricingInput: "0.14",    // $0.14/1M
        pricingOutput: "0.42",   // $0.42/1M
        isFree: false,
        contextLength: 131072,
        priority: 10,
      },
      {
        modelId: "minimax-m2.1-free",
        modelName: "MiniMax M2.1",
        providerModelId: "minimax/minimax-m2.1",
        pricingInput: "0.15",
        pricingOutput: "0.45",
        isFree: false,
        contextLength: 245760,
        priority: 10,
      },
      {
        modelId: "glm-4.7-free",
        modelName: "GLM 4.7",
        providerModelId: "zhipu/glm-4.7",
        pricingInput: "0.10",
        pricingOutput: "0.30",
        isFree: false,
        contextLength: 131072,
        priority: 10,
      },
      // Popular paid-only models
      {
        modelId: "gpt-4o",
        modelName: "GPT-4o",
        providerModelId: "openai/gpt-4o",
        pricingInput: "2.50",
        pricingOutput: "10.00",
        isFree: false,
        contextLength: 128000,
        priority: 0,
      },
      {
        modelId: "gpt-4o-mini",
        modelName: "GPT-4o Mini",
        providerModelId: "openai/gpt-4o-mini",
        pricingInput: "0.15",
        pricingOutput: "0.60",
        isFree: false,
        contextLength: 128000,
        priority: 0,
      },
      {
        modelId: "claude-3.5-sonnet",
        modelName: "Claude 3.5 Sonnet",
        providerModelId: "anthropic/claude-3.5-sonnet",
        pricingInput: "3.00",
        pricingOutput: "15.00",
        isFree: false,
        contextLength: 200000,
        priority: 0,
      },
      {
        modelId: "claude-3.5-haiku",
        modelName: "Claude 3.5 Haiku",
        providerModelId: "anthropic/claude-3.5-haiku",
        pricingInput: "0.80",
        pricingOutput: "4.00",
        isFree: false,
        contextLength: 200000,
        priority: 0,
      },
      {
        modelId: "deepseek-chat",
        modelName: "DeepSeek Chat",
        providerModelId: "deepseek/deepseek-chat",
        pricingInput: "0.14",
        pricingOutput: "0.28",
        isFree: false,
        contextLength: 64000,
        priority: 0,
      },
      {
        modelId: "gemini-2.0-flash",
        modelName: "Gemini 2.0 Flash",
        providerModelId: "google/gemini-2.0-flash-001",
        pricingInput: "0.10",
        pricingOutput: "0.40",
        isFree: false,
        contextLength: 1000000,
        priority: 0,
      },
      {
        modelId: "llama-3.3-70b",
        modelName: "Llama 3.3 70B",
        providerModelId: "meta-llama/llama-3.3-70b-instruct",
        pricingInput: "0.12",
        pricingOutput: "0.30",
        isFree: false,
        contextLength: 131072,
        priority: 0,
      },
    ];

    for (const model of openrouterModels) {
      await db
        .insert(modelProviderMap)
        .values({
          modelId: model.modelId,
          providerId: openrouterId,
          modelName: model.modelName,
          providerModelId: model.providerModelId,
          pricingInput: model.pricingInput,
          pricingOutput: model.pricingOutput,
          isFree: model.isFree,
          contextLength: model.contextLength,
          isEnabled: true,
          priority: model.priority,
        })
        .onConflictDoNothing();
    }

    console.log(`[Seed] OpenRouter: ${openrouterModels.length} models (including paid fallbacks)`);
  } else {
    console.warn("[Seed] OpenRouter provider not found — skipping OpenRouter models");
  }

  // 5. Seed routing rules
  const rules = [
    { pattern: "*-free", mode: "cost" as const, maxFallbacks: 3 },
    { pattern: "*", mode: "cost" as const, maxFallbacks: 2 },
  ];

  for (const rule of rules) {
    await db
      .insert(routingRules)
      .values({
        modelPattern: rule.pattern,
        routingMode: rule.mode,
        providerOrder: null,
        maxFallbacks: rule.maxFallbacks,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  console.log(`[Seed] Routing rules seeded`);
  console.log(`[Seed] Done!`);
}
