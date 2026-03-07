#!/usr/bin/env tsx
/**
 * Seed GPT-5.4 model entry and Feature 032 system settings defaults.
 *
 * Idempotent: uses ON CONFLICT DO UPDATE for model_provider_map
 * and check-before-insert for system_settings.
 *
 * Feature: 032-Browser-Automation-Copilot, Section 01
 */

import { getDb } from "../server/db";
import {
  modelProviderMap,
  llmProviders,
  systemSettings,
} from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

async function seedGpt54() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  console.log("Seeding GPT-5.4 model and Feature 032 system settings...\n");

  // ── 1. Find OpenAI or OpenCode Zen provider ──────────────
  // Prefer opencode-zen (primary LLM provider), fall back to openai/openrouter
  const providers = await db
    .select({ id: llmProviders.id, providerName: llmProviders.providerName })
    .from(llmProviders)
    .where(
      sql`LOWER(${llmProviders.providerName}) IN ('opencode-zen', 'openai', 'openrouter')`,
    );

  // Pick opencode-zen first, then openai, then openrouter (case-insensitive)
  const lower = (s: string) => s.toLowerCase();
  const provider =
    providers.find((p) => lower(p.providerName) === "opencode-zen") ??
    providers.find((p) => lower(p.providerName) === "openai") ??
    providers[0];

  if (!provider) {
    console.error("No OpenAI or OpenCode provider found!");
    console.log("Please ensure a provider is created first.");
    process.exit(1);
  }

  console.log(
    `Found provider: ${provider.providerName} (ID: ${provider.id})\n`,
  );

  // ── 2. Upsert GPT-5.4 into model_provider_map ────────────
  console.log("Step 1: Upserting GPT-5.4 model mapping...");

  await db
    .insert(modelProviderMap)
    .values({
      modelId: "gpt-5.4",
      providerId: provider.id,
      modelName: "GPT-5.4",
      providerModelId: "gpt-5.4",
      pricingInput: "2.50000000",
      pricingOutput: "15.00000000",
      isFree: false,
      contextLength: 128000,
      isEnabled: true,
      priority: 0,
      apiStyle: "responses",
    })
    .onConflictDoUpdate({
      target: [modelProviderMap.modelId, modelProviderMap.providerId],
      set: {
        pricingInput: "2.50000000",
        pricingOutput: "15.00000000",
        apiStyle: "responses",
        isEnabled: true,
      },
    });

  console.log("Done: GPT-5.4 model mapping upserted\n");

  // ── 3. Seed system settings defaults ──────────────────────
  console.log("Step 2: Seeding system settings defaults...");

  const settingsToSeed = [
    {
      category: "automation",
      key: "vision_model",
      value: "gpt-4o",
      description: "Default vision model for automation copilot",
    },
    {
      category: "llm",
      key: "max_search_calls_per_request",
      value: "5",
      description: "Max web_search calls per Responses API request",
    },
    {
      category: "llm",
      key: "max_credits_per_request",
      value: "500",
      description: "Default credit budget cap per request",
    },
    {
      category: "automation",
      key: "max_browser_sessions",
      value: "3",
      description: "Max concurrent browser sessions per tenant",
    },
  ];

  for (const setting of settingsToSeed) {
    const [existing] = await db
      .select({ id: systemSettings.id })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, setting.category),
          eq(systemSettings.key, setting.key),
        ),
      )
      .limit(1);

    if (existing) {
      console.log(
        `  Skip: ${setting.category}.${setting.key} (already exists)`,
      );
    } else {
      await db.insert(systemSettings).values({
        category: setting.category,
        key: setting.key,
        value: setting.value,
        description: setting.description,
        isSensitive: false,
      });
      console.log(`  Added: ${setting.category}.${setting.key} = ${setting.value}`);
    }
  }

  console.log("\nDone: System settings seeded");

  // ── 4. Set responsesApi feature flag (default OFF) ────────
  console.log("\nStep 3: Setting responsesApi feature flag...");
  try {
    const { getRedisClient } = await import("../server/services/redis");
    const redis = getRedisClient();
    const existing = await redis.get("feature-flag:responsesApi");
    if (existing === null) {
      await redis.set("feature-flag:responsesApi", "false");
      console.log("  Set: feature-flag:responsesApi = false (default OFF)");
    } else {
      console.log(`  Skip: feature-flag:responsesApi already set to ${existing}`);
    }
  } catch (err) {
    console.log("  Skip: Redis not available, feature flag not set");
  }

  console.log("\nAll Feature 032 Section 01 seeds complete.");
}

seedGpt54()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
