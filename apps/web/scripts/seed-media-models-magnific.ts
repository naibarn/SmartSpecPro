/**
 * Seed Magnific media models.
 * Run with: npx tsx scripts/seed-media-models-magnific.ts
 */

import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { buildMagnificModelSeeds } from "../server/services/mediaProviderUtils";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://smartspec:smartspec123@localhost:5432/smartspec";

export function buildMagnificSeedModels() {
  return buildMagnificModelSeeds();
}

export function summarizeMagnificSeedModels(models = buildMagnificSeedModels()) {
  const byType = models.reduce<Record<string, number>>((acc, model) => {
    acc[model.modelType] = (acc[model.modelType] ?? 0) + 1;
    return acc;
  }, {});
  const enabled = models.filter((model) => model.isEnabled).length;
  const disabled = models.length - enabled;
  return {
    total: models.length,
    enabled,
    disabled,
    byType,
    modelIds: models.map((model) => model.modelId),
  };
}

export async function seedMagnificMediaModels(options: { dryRun?: boolean } = {}): Promise<void> {
  const models = buildMagnificSeedModels();
  const summary = summarizeMagnificSeedModels(models);

  console.log("Seeding Magnific Media Models...\n");
  console.log(`Models: ${summary.total} total (${summary.enabled} enabled, ${summary.disabled} disabled)`);
  console.log(`By type: ${Object.entries(summary.byType).map(([type, count]) => `${type}=${count}`).join(", ")}`);

  if (options.dryRun) {
    console.log("\nDry run model ids:");
    for (const modelId of summary.modelIds) {
      console.log(`  ${modelId}`);
    }
    return;
  }

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

    for (const model of models) {
      await sql`
        INSERT INTO media_models (
          "modelId", name, description, "modelType", provider,
          aliases, "creditCost", "aspectRatios", durations, sizes,
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
          ${JSON.stringify(model.sizes)},
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
          "creditCost" = media_models."creditCost",
          "aspectRatios" = EXCLUDED."aspectRatios",
          durations = EXCLUDED.durations,
          sizes = EXCLUDED.sizes,
          priority = EXCLUDED.priority,
          "sortOrder" = EXCLUDED."sortOrder",
          "configJson" = EXCLUDED."configJson",
          "isEnabled" = media_models."isEnabled"
      `;

      const readiness = String(model.configJson.readinessReason ?? "estimated-pricing");
      console.log(`  upsert ${model.modelId} (${model.modelType}, ${model.creditCost} credits, ${readiness})`);
    }

    console.log(`\nUpserted ${models.length} Magnific media models.`);
    console.log("Next step: configure Magnific API key in Admin > Media Providers and run connection test.\n");
  } catch (error) {
    console.error("Error seeding Magnific models:", error);
  } finally {
    await sql.end();
  }
}

const isMainModule = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMainModule) {
  void seedMagnificMediaModels({
    dryRun: process.argv.includes("--dry-run"),
  });
}
