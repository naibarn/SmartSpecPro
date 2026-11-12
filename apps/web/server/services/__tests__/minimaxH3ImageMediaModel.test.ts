import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getStaticFallbackModels, getStaticModelById } from "../modelRegistry";
import { calculateCreditCost } from "../pricingCalculator";

const repoRoot = path.resolve(import.meta.dirname, "../../../../../");
const webRoot = path.join(repoRoot, "apps/web");
const seedPath = path.join(webRoot, "scripts/seed-media-models-kie-ai.ts");
const migrationPath = path.join(webRoot, "drizzle/0435_minimax_h3_image_media_model.sql");
const journalPath = path.join(webRoot, "drizzle/meta/_journal.json");
const modelId = "minimax-h3/text-to-image";
const imageEditId = "minimax-h3/image-edit";

function getInputField(key: string) {
  const model = getStaticModelById(modelId);
  const fields = (model?.configJson?.inputFields ?? []) as Array<Record<string, unknown>>;
  return fields.find(field => field.key === key);
}

describe("MiniMax H3 Image unified Kie.ai model", () => {
  it("uses one catalog row and switches to image edit when references are attached", () => {
    const model = getStaticModelById(modelId);

    expect(model).toMatchObject({
      id: modelId,
      name: "MiniMax H3 Image",
      type: "image",
      provider: "kie.ai",
      aspectRatios: ["auto", "1:1", "5:4", "4:5", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"],
      configJson: expect.objectContaining({
        apiEndpoint: "/api/v1/jobs/createTask",
        apiPayloadFormat: "market",
        kieModelId: modelId,
        generateType: "text-to-image",
        maxPromptLength: 5000,
        maxReferenceImages: 16,
        apiConfig: expect.objectContaining({
          kie_model_id_with_references: imageEditId,
          reference_image_input_key: "image_urls",
          reference_image_input_type: "array",
        }),
      }),
      isEnabled: true,
    });

    expect(getStaticModelById(imageEditId)?.id).toBe(modelId);
    expect(getInputField("image_urls")).toMatchObject({ type: "image_urls", required: false, maxItems: 16 });
    expect(getInputField("resolution")).toMatchObject({
      type: "select",
      default: "2K",
      affectsPricing: true,
      options: [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }, { value: "4K", label: "4K" }],
    });
    expect(getInputField("expand_prompt")).toMatchObject({ type: "boolean", default: true });
    expect(getInputField("output_format")).toMatchObject({ type: "select", default: "png" });
  });

  it("uses one image model entry and charges by resolution tier", () => {
    const model = getStaticModelById(modelId)!;
    const catalogIds = new Set(getStaticFallbackModels().map(entry => entry.id));

    expect(catalogIds.has(imageEditId)).toBe(false);
    expect(calculateCreditCost(model, { resolution: "1K" })).toBe(30);
    expect(calculateCreditCost(model, { resolution: "2K" })).toBe(30);
    expect(calculateCreditCost(model, { resolution: "4K" })).toBe(60);
    expect(calculateCreditCost(model, {})).toBe(30);
  });

  it("keeps the seeded model and migration journal aligned", () => {
    const seed = fs.readFileSync(seedPath, "utf8");
    const migration = fs.readFileSync(migrationPath, "utf8");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string }>;
    };

    expect(seed).toContain(`modelId: "${modelId}"`);
    expect(seed).toContain(`kie_model_id_with_references: "${imageEditId}"`);
    expect(migration).toContain(`'${modelId}'`);
    expect(migration).toContain(`"kie_model_id_with_references": "${imageEditId}"`);
    expect(journal.entries.some(entry => entry.tag === "0435_minimax_h3_image_media_model")).toBe(true);
  });
});
