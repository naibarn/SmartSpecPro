import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getStaticFallbackModels, getStaticModelById } from "../modelRegistry";
import { calculateCreditCost } from "../pricingCalculator";

const repoRoot = path.resolve(import.meta.dirname, "../../../../../");
const webRoot = path.join(repoRoot, "apps/web");
const seedPath = path.join(webRoot, "scripts/seed-media-models-kie-ai.ts");
const drizzleDir = path.join(webRoot, "drizzle");
const migrationPath = path.join(
  drizzleDir,
  "0289_gpt_image_2_5_media_models.sql"
);
const pricingMigrationPath = path.join(
  drizzleDir,
  "0291_gpt_image_2_5_smartaihub_pricing.sql"
);
const journalPath = path.join(drizzleDir, "meta/_journal.json");

const variants = [
  {
    name: "Flare",
    id: "gpt-image-2-5-flare-text-to-image",
    imageToImageId: "gpt-image-2-5-flare-image-to-image",
  },
  {
    name: "Sunburst",
    id: "gpt-image-2-5-sunburst-text-to-image",
    imageToImageId: "gpt-image-2-5-sunburst-image-to-image",
  },
] as const;

describe("GPT Image 2.5 unified Kie model catalog", () => {
  it.each(variants)(
    "declares one $name row with unified reference routing",
    variant => {
      const model = getStaticModelById(variant.id);

      expect(model).toMatchObject({
        id: variant.id,
        name: `GPT Image 2.5 ${variant.name}`,
        type: "image",
        provider: "kie.ai",
        creditCost: 30,
        aspectRatios: [
          "auto",
          "1:1",
          "3:2",
          "2:3",
          "16:9",
          "9:16",
          "4:3",
          "3:4",
          "21:9",
          "27:16",
          "16:27",
          "9:8",
          "8:9",
        ],
        configJson: expect.objectContaining({
          kieModelId: variant.id,
          generateType: "text-to-image",
          maxReferenceImages: 16,
          inputFields: expect.arrayContaining([
            expect.objectContaining({
              key: "input_urls",
              type: "image_urls",
              required: false,
              maxItems: 16,
            }),
            expect.objectContaining({
              key: "resolution",
              affectsPricing: true,
            }),
          ]),
          apiConfig: expect.objectContaining({
            kie_model_id_with_references: variant.imageToImageId,
            reference_image_input_key: "input_urls",
            reference_image_input_type: "array",
          }),
          pricingTiers: { default: 30, "1K": 30, "2K": 50, "4K": 80 },
          pricingFormula: "flat",
        }),
        isEnabled: true,
      });
      expect(getStaticModelById(variant.imageToImageId)?.id).toBe(variant.id);
    }
  );

  it.each(variants)(
    "calculates SmartAIHub credits by resolution for $name",
    variant => {
      const model = getStaticModelById(variant.id);

      expect(model).toBeDefined();
      expect(calculateCreditCost(model!, { resolution: "1K" })).toBe(30);
      expect(calculateCreditCost(model!, { resolution: "2K" })).toBe(50);
      expect(calculateCreditCost(model!, { resolution: "4K" })).toBe(80);
      expect(calculateCreditCost(model!, {})).toBe(30);
    }
  );

  it("keeps image-to-image operation IDs out of the standalone catalog", () => {
    const catalogIds = new Set(
      getStaticFallbackModels().map(model => model.id)
    );
    for (const variant of variants) {
      expect(catalogIds.has(variant.imageToImageId)).toBe(false);
    }
  });

  it("keeps the seed and migration aligned with the two unified rows", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    const migration = fs.readFileSync(migrationPath, "utf8");
    const pricingMigration = fs.readFileSync(pricingMigrationPath, "utf8");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string }>;
    };

    expect(
      journal.entries.some(
        entry => entry.tag === "0289_gpt_image_2_5_media_models"
      )
    ).toBe(true);

    for (const variant of variants) {
      expect(seed).toContain(`modelId: "${variant.id}"`);
      expect(seed).toContain(
        `kie_model_id_with_references: "${variant.imageToImageId}"`
      );
      expect(migration).toContain(`'${variant.id}'`);
      expect(migration).toContain(`"${variant.imageToImageId}"`);
      expect(migration).not.toContain(`\n  '${variant.imageToImageId}',`);
    }

    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+"media_models"/i);
    expect(pricingMigration).toContain('"creditCost" = 30');
    expect(pricingMigration).toContain(
      '{"default":30,"1K":30,"2K":50,"4K":80}'
    );
    expect(pricingMigration).not.toMatch(/\bDELETE\s+FROM\s+"media_models"/i);
  });
});
