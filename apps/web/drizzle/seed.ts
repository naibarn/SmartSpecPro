/**
 * Seed script for OpenCode Zen provider and free models
 * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING)
 */

import { db } from "../server/db";
import { llmProviders, modelProviderMap, routingRules } from "./schema";
import { eq } from "drizzle-orm";

export async function seedZenProvider(): Promise<void> {
  const apiKey = process.env.OPENCODE_ZEN_API_KEY || "";
  const hasKey = !!apiKey;

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
    })
    .onConflictDoNothing({ target: llmProviders.providerName });

  // 2. Get provider ID
  const [zenProvider] = await db
    .select({ id: llmProviders.id })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, "opencode-zen"))
    .limit(1);

  if (!zenProvider) {
    console.warn("[Seed] Failed to find OpenCode Zen provider after insert");
    return;
  }

  const providerId = zenProvider.id;

  if (!hasKey) {
    console.warn("[Seed] OPENCODE_ZEN_API_KEY not set — provider seeded but disabled");
  }

  // 3. Upsert free model mappings
  const freeModels = [
    {
      modelId: "kimi-k2.5-free",
      modelName: "Kimi K2.5",
      providerModelId: "kimi-k2.5",
      contextLength: 131072,
    },
    {
      modelId: "minimax-m2.1-free",
      modelName: "MiniMax M2.1",
      providerModelId: "minimax-m2.1",
      contextLength: 245760,
    },
    {
      modelId: "glm-4.7-free",
      modelName: "GLM 4.7",
      providerModelId: "glm-4.7",
      contextLength: 131072,
    },
  ];

  for (const model of freeModels) {
    await db
      .insert(modelProviderMap)
      .values({
        modelId: model.modelId,
        providerId,
        modelName: model.modelName,
        providerModelId: model.providerModelId,
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        contextLength: model.contextLength,
        isEnabled: true,
        priority: 0,
      })
      .onConflictDoNothing();
  }

  // 4. Seed default routing rule for free models
  await db
    .insert(routingRules)
    .values({
      modelPattern: "*-free",
      routingMode: "cost",
      providerOrder: null,
      maxFallbacks: 3,
      isActive: true,
    })
    .onConflictDoNothing();

  console.log(`[Seed] OpenCode Zen provider seeded with ${freeModels.length} free models`);
}
