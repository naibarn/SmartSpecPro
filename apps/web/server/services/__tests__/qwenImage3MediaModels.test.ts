import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getStaticFallbackModels, getStaticModelById } from "../modelRegistry";
import { calculateCreditCost } from "../pricingCalculator";

const repoRoot = path.resolve(import.meta.dirname, "../../../../../");
const webRoot = path.join(repoRoot, "apps/web");
const seedPath = path.join(webRoot, "scripts/seed-media-models-kie-ai.ts");
const migrationPath = path.join(webRoot, "drizzle/0302_qwen_image_3_media_models.sql");
const journalPath = path.join(webRoot, "drizzle/meta/_journal.json");

const imageSizes = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];
const variants = [
  {
    name: "Pro",
    id: "qwen3/pro-text-to-image",
    imageToImageId: "qwen3/pro-image-to-image",
    displayName: "Qwen Image 3 Pro",
  },
  {
    name: "Standard",
    id: "qwen3/text-to-image",
    imageToImageId: "qwen3/image-to-image",
    displayName: "Qwen Image 3",
  },
] as const;

function getInputField(model: NonNullable<ReturnType<typeof getStaticModelById>>, key: string) {
  const fields = (model.configJson?.inputFields ?? []) as Array<Record<string, unknown>>;
  return fields.find(field => field.key === key);
}

describe("Qwen Image 3 unified Kie model catalog", () => {
  it.each(variants)(
    "declares one $name row with reference-driven image-to-image routing",
    variant => {
      const model = getStaticModelById(variant.id);

      expect(model).toMatchObject({
        id: variant.id,
        name: variant.displayName,
        type: "image",
        provider: "kie.ai",
        creditCost: 30,
        aspectRatios: imageSizes,
        configJson: expect.objectContaining({
          apiEndpoint: "/api/v1/jobs/createTask",
          apiPayloadFormat: "market",
          kieModelId: variant.id,
          generateType: "text-to-image",
          maxPromptLength: 5000,
          maxReferenceImages: 3,
          apiConfig: expect.objectContaining({
            kie_model_id_with_references: variant.imageToImageId,
            reference_image_input_key: "image_urls",
            reference_image_input_type: "array",
            drop_params: ["aspect_ratio"],
          }),
          pricingTiers: { default: 30, "1K": 30, "2K": 50 },
          pricingFormula: "flat",
        }),
        isEnabled: true,
      });

      expect(getStaticModelById(variant.imageToImageId)?.id).toBe(variant.id);
      expect(getInputField(model!, "image_urls")).toMatchObject({
        type: "image_urls",
        required: false,
        syncWith: "reference_images",
        maxItems: 3,
      });
      expect(getInputField(model!, "image_size")).toMatchObject({
        type: "select",
        default: "1:1",
        options: imageSizes.map(value => ({ value, label: value })),
      });
      expect(getInputField(model!, "resolution")).toMatchObject({
        type: "select",
        default: "1K",
        affectsPricing: true,
        options: [
          { value: "1K", label: "1K" },
          { value: "2K", label: "2K" },
        ],
      });
      expect(getInputField(model!, "output_format")).toMatchObject({
        type: "select",
        default: "png",
        options: [
          { value: "png", label: "PNG" },
          { value: "jpeg", label: "JPEG" },
        ],
      });
      expect(getInputField(model!, "prompt_extend")).toMatchObject({
        type: "boolean",
        default: true,
      });
      expect(getInputField(model!, "negative_prompt")).toMatchObject({
        type: "text",
      });
      expect(getInputField(model!, "seed")).toMatchObject({
        type: "number",
        min: 0,
        max: 2147483647,
      });
      expect(getInputField(model!, "nsfw_checker")).toMatchObject({
        type: "boolean",
        default: false,
      });
    },
  );

  it.each(variants)("calculates 1K/2K pricing for $name", variant => {
    const model = getStaticModelById(variant.id);

    expect(model).toBeDefined();
    expect(calculateCreditCost(model!, { resolution: "1K" })).toBe(30);
    expect(calculateCreditCost(model!, { resolution: "2K" })).toBe(50);
    expect(calculateCreditCost(model!, {})).toBe(30);
  });

  it("keeps paired image-to-image IDs out of the standalone catalog", () => {
    const catalogIds = new Set(getStaticFallbackModels().map(model => model.id));

    for (const variant of variants) {
      expect(catalogIds.has(variant.imageToImageId)).toBe(false);
    }
  });

  it("keeps seed, migration, and journal aligned", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    const migration = fs.readFileSync(migrationPath, "utf8");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string }>;
    };

    expect(journal.entries.some(entry => entry.tag === "0302_qwen_image_3_media_models")).toBe(true);
    expect(migration).toContain("ON CONFLICT (\"modelId\") DO UPDATE");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+\"media_models\"/i);

    for (const variant of variants) {
      expect(seed).toContain(`modelId: "${variant.id}"`);
      expect(seed).toContain(`kie_model_id_with_references: "${variant.imageToImageId}"`);
      expect(migration).toContain(`'${variant.id}'`);
      expect(migration).toContain(`"${variant.imageToImageId}"`);
    }

    expect(migration).toContain('"reference_image_input_key": "image_urls"');
    expect(migration).toContain('"drop_params": ["aspect_ratio"]');
    expect(migration).toContain('"pricingTiers": {"default": 30, "1K": 30, "2K": 50}');
  });
});
