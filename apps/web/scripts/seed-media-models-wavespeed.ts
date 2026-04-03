/**
 * Seed WaveSpeed media models.
 * Run with: npx tsx scripts/seed-media-models-wavespeed.ts
 */

import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { buildWaveSpeedLaunchModelSeed } from "../server/services/mediaProviderUtils";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

export function buildWaveSpeedSeedModel() {
  return buildWaveSpeedLaunchModelSeed();
}

export async function seedWaveSpeedMediaModels(): Promise<void> {
  console.log("Seeding WaveSpeed Media Models...\n");
  const sql = postgres(DATABASE_URL);

  try {
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'media_models'
      )
    `;

    if (!tableExists[0].exists) {
      console.log("ERROR: media_models table does not exist. Please run migrations first.");
      return;
    }

    const model = buildWaveSpeedSeedModel();
    await sql`
      INSERT INTO media_models (
        "modelId", name, description, "modelType", provider,
        aliases, "creditCost", "aspectRatios", durations,
        priority, "sortOrder", "configJson", "isEnabled"
      ) VALUES (
        ${model.modelId},
        ${model.name},
        ${model.description},
        ${model.modelType},
        ${model.provider},
        ${JSON.stringify(model.aliases)},
        ${model.creditCost},
        ${JSON.stringify(model.aspectRatios)},
        ${JSON.stringify(model.durations)},
        ${model.priority},
        ${model.sortOrder},
        ${JSON.stringify(model.configJson)},
        ${model.isEnabled}
      )
      ON CONFLICT ("modelId") DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        "modelType" = EXCLUDED."modelType",
        provider = EXCLUDED.provider,
        aliases = EXCLUDED.aliases,
        "creditCost" = EXCLUDED."creditCost",
        "aspectRatios" = EXCLUDED."aspectRatios",
        durations = EXCLUDED.durations,
        priority = EXCLUDED.priority,
        "sortOrder" = EXCLUDED."sortOrder",
        "configJson" = EXCLUDED."configJson",
        "isEnabled" = media_models."isEnabled"
    `;

    console.log(`  upsert ${model.name} (${model.creditCost} default credits, tiered via configJson.pricingTiers)`);
    console.log("\nUpserted 1 WaveSpeed video model.");
    console.log("Next step: Add a WaveSpeed provider key in Admin > Media Providers and enable provider.\n");
  } catch (error) {
    console.error("Error seeding WaveSpeed models:", error);
  } finally {
    await sql.end();
  }
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void seedWaveSpeedMediaModels();
}
