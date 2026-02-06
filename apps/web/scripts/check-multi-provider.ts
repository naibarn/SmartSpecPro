/**
 * Check multi-provider seed data
 */

import { getDb } from "../server/db";
import { llmProviders, modelProviderMap, routingRules } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) {
    console.log("Database not available");
    process.exit(1);
  }

  // Check OpenCode Zen provider
  const [zen] = await db
    .select({
      id: llmProviders.id,
      name: llmProviders.providerName,
      display: llmProviders.displayName,
      enabled: llmProviders.isEnabled,
      type: llmProviders.providerType,
      health: llmProviders.healthStatus,
    })
    .from(llmProviders)
    .where(eq(llmProviders.providerName, "opencode-zen"))
    .limit(1);

  console.log("\n=== OpenCode Zen Provider ===");
  if (zen) {
    console.log(`ID: ${zen.id}`);
    console.log(`Name: ${zen.name}`);
    console.log(`Display: ${zen.display}`);
    console.log(`Enabled: ${zen.enabled}`);
    console.log(`Type: ${zen.type}`);
    console.log(`Health: ${zen.health}`);

    // Check model mappings
    const mappings = await db
      .select({
        modelId: modelProviderMap.modelId,
        modelName: modelProviderMap.modelName,
        isFree: modelProviderMap.isFree,
        contextLength: modelProviderMap.contextLength,
      })
      .from(modelProviderMap)
      .where(eq(modelProviderMap.providerId, zen.id));

    console.log("\n=== Free Model Mappings ===");
    if (mappings.length === 0) {
      console.log("No mappings found");
    } else {
      mappings.forEach((m) => {
        console.log(`- ${m.modelId} (${m.modelName}) - Free: ${m.isFree}, Context: ${m.contextLength}`);
      });
    }
  } else {
    console.log("NOT FOUND");
  }

  // Check routing rules
  const rules = await db.select().from(routingRules);
  console.log("\n=== Routing Rules ===");
  if (rules.length === 0) {
    console.log("No routing rules found");
  } else {
    rules.forEach((r) => {
      console.log(`- Pattern: ${r.modelPattern}, Mode: ${r.routingMode}, MaxFallbacks: ${r.maxFallbacks}`);
    });
  }

  // Check all providers
  const allProviders = await db
    .select({
      id: llmProviders.id,
      name: llmProviders.providerName,
      display: llmProviders.displayName,
      enabled: llmProviders.isEnabled,
    })
    .from(llmProviders);

  console.log("\n=== All Providers ===");
  allProviders.forEach((p) => {
    console.log(`- ${p.id}: ${p.display} (${p.name}) - Enabled: ${p.enabled}`);
  });

  // Check all model mappings
  const allMappings = await db
    .select({
      modelId: modelProviderMap.modelId,
      modelName: modelProviderMap.modelName,
      providerId: modelProviderMap.providerId,
      isFree: modelProviderMap.isFree,
      pricingInput: modelProviderMap.pricingInput,
      pricingOutput: modelProviderMap.pricingOutput,
    })
    .from(modelProviderMap);

  console.log("\n=== All Model Mappings ===");
  const groupedByModel: Record<string, typeof allMappings> = {};
  allMappings.forEach((m) => {
    if (!groupedByModel[m.modelId]) groupedByModel[m.modelId] = [];
    groupedByModel[m.modelId].push(m);
  });

  Object.entries(groupedByModel).forEach(([modelId, providers]) => {
    console.log(`\n${modelId}:`);
    providers.forEach((p) => {
      const provider = allProviders.find((pr) => pr.id === p.providerId);
      const price = p.isFree ? "FREE" : `$${p.pricingInput}/$${p.pricingOutput} per 1M`;
      console.log(`  - ${provider?.name || p.providerId}: ${price}`);
    });
  });

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
