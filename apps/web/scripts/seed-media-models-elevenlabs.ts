/**
 * Seed ElevenLabs direct media models.
 * Run with: npx tsx scripts/seed-media-models-elevenlabs.ts
 */

import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { buildElevenLabsModelSeeds } from "../server/services/mediaProviderUtils";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

export function buildElevenLabsSeedModel() {
  return buildElevenLabsModelSeeds();
}

export async function seedElevenLabsMediaModels(): Promise<void> {
  console.log("Seeding ElevenLabs Media Models...\n");
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

    const models = buildElevenLabsSeedModel();
    for (const model of models) {
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

      console.log(`  upsert ${model.name} (${model.creditCost} default credits, pricing via configJson)`);
    }

    console.log(`\nUpserted ${models.length} ElevenLabs media models.`);
    console.log("Next step: Add an ElevenLabs provider key in Admin > Media Providers and enable provider.\n");
  } catch (error) {
    console.error("Error seeding ElevenLabs models:", error);
  } finally {
    await sql.end();
  }
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void seedElevenLabsMediaModels();
}
