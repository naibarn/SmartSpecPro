import { describe, expect, it } from "vitest";
import { listSpecialTieInModels } from "../verticalDramaSpecialModelCatalog";

describe("special model catalog", () => {
  it("returns separate image and video catalog arrays", async () => {
    const result = await listSpecialTieInModels({ durationSeconds: 12, dialogueMode: "none" });
    expect(Array.isArray(result.imageModels)).toBe(true);
    expect(Array.isArray(result.videoModels)).toBe(true);
    expect(result.imageModels.every(model => model.modelId && model.supportedAspectRatios)).toBe(true);
  });
});
