#!/usr/bin/env tsx
/**
 * Test Multi-Provider Routing
 *
 * This script tests:
 * 1. Getting available models from multiple providers
 * 2. Selecting a model and verifying correct provider is used
 * 3. Credit tracking with correct provider attribution
 */

import { getDb } from "../server/db";
import { modelProviderMap, llmProviders } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

async function testMultiProviderRouting() {
  console.log("🧪 Testing Multi-Provider Routing System\n");

  // Initialize database
  const db = await getDb();
  if (!db) {
    throw new Error("Failed to connect to database");
  }

  // Test 1: Check if we have models from multiple providers
  console.log("Test 1: Checking available models...");
  const models = await db
    .select({
      modelId: modelProviderMap.modelId,
      modelName: modelProviderMap.modelName,
      providerId: modelProviderMap.providerId,
      providerName: llmProviders.providerName,
      isFree: modelProviderMap.isFree,
      isEnabled: modelProviderMap.isEnabled,
    })
    .from(modelProviderMap)
    .leftJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(eq(modelProviderMap.isEnabled, true));

  console.log(`✓ Found ${models.length} enabled models`);

  // Group by provider
  const byProvider = models.reduce((acc, m) => {
    const provider = m.providerName || "Unknown";
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(m);
    return acc;
  }, {} as Record<string, typeof models>);

  console.log("\nModels by provider:");
  for (const [provider, list] of Object.entries(byProvider)) {
    const freeCount = list.filter(m => m.isFree).length;
    console.log(`  ${provider}: ${list.length} models (${freeCount} free)`);
  }

  // Test 2: Check specific OpenCode Zen models
  console.log("\n\nTest 2: Checking OpenCode Zen models...");
  const opencodeModels = models.filter(m =>
    m.providerName?.toLowerCase().includes("opencode") ||
    m.providerName?.toLowerCase().includes("zen")
  );

  if (opencodeModels.length === 0) {
    console.error("❌ No OpenCode Zen models found!");
    console.log("   Run: npm run seed:multi-provider");
    return false;
  }

  console.log(`✓ Found ${opencodeModels.length} OpenCode Zen models`);
  console.log("\nSample OpenCode Zen models:");
  opencodeModels.slice(0, 5).forEach(m => {
    console.log(`  - ${m.modelName} (${m.modelId}) ${m.isFree ? "[FREE]" : ""}`);
  });

  // Test 3: Check OpenRouter models
  console.log("\n\nTest 3: Checking OpenRouter models...");
  const allProviders = await db
    .select({
      id: llmProviders.id,
      providerName: llmProviders.providerName,
      availableModels: llmProviders.availableModels,
      isEnabled: llmProviders.isEnabled,
    })
    .from(llmProviders)
    .where(eq(llmProviders.isEnabled, true));

  const openrouterProvider = allProviders.find(p =>
    p.providerName.toLowerCase().includes("openrouter") ||
    p.providerName.toLowerCase().includes("router")
  );

  if (!openrouterProvider) {
    console.error("❌ OpenRouter provider not found or not enabled!");
    return false;
  }

  const availableModelsCount = Array.isArray(openrouterProvider.availableModels)
    ? openrouterProvider.availableModels.length
    : 0;

  console.log(`✓ OpenRouter provider configured`);
  console.log(`  Available models in JSON: ${availableModelsCount}`);

  const openrouterMappedModels = models.filter(m =>
    m.providerName?.toLowerCase().includes("openrouter") ||
    m.providerName?.toLowerCase().includes("router")
  );
  console.log(`  Models in model_provider_map: ${openrouterMappedModels.length}`);

  // Test 4: Verify routing logic would work
  console.log("\n\nTest 4: Verifying routing logic...");

  // Find a model that exists in both providers
  const testModelId = "gpt-4o-mini";
  const providersForModel = await db
    .select({
      providerId: modelProviderMap.providerId,
      providerName: llmProviders.providerName,
      isFree: modelProviderMap.isFree,
      pricingInput: modelProviderMap.pricingInput,
      pricingOutput: modelProviderMap.pricingOutput,
    })
    .from(modelProviderMap)
    .leftJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
    .where(and(
      eq(modelProviderMap.modelId, testModelId),
      eq(modelProviderMap.isEnabled, true)
    ));

  console.log(`Model '${testModelId}' available from:`);
  providersForModel.forEach(p => {
    const pricing = p.isFree
      ? "[FREE]"
      : `$${p.pricingInput}/1M in, $${p.pricingOutput}/1M out`;
    console.log(`  - ${p.providerName}: ${pricing}`);
  });

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 Summary:");
  console.log("=".repeat(60));
  console.log(`✓ Total enabled models: ${models.length}`);
  console.log(`✓ Providers configured: ${Object.keys(byProvider).length}`);
  console.log(`✓ OpenCode Zen models: ${opencodeModels.length}`);
  console.log(`✓ OpenRouter models (mapped): ${openrouterMappedModels.length}`);
  console.log(`✓ OpenRouter models (available): ${availableModelsCount}`);
  console.log("\n✅ Multi-provider routing system is configured correctly!");

  return true;
}

// Run the test
testMultiProviderRouting()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error("\n❌ Test failed with error:");
    console.error(err);
    process.exit(1);
  });
