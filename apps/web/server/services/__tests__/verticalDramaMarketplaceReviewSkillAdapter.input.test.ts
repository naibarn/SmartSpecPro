import { describe, expect, it } from "vitest";
import { buildMarketplaceReviewIdeaInput } from "../verticalDramaMarketplaceReviewSkillAdapter";

const baseInput = {
  actor: { tenantId: "tenant-test", userId: 42 },
  seriesId: 53,
  referenceImages: [{ mediaAssetId: "501" }],
  dialogueMode: "none" as const,
  selectedCharacterIds: ["1"],
  variationSeed: "input-contract-test",
};

describe("Marketplace review idea source contract", () => {
  it("rejects an uploaded product without a user-provided product brief", async () => {
    await expect(
      buildMarketplaceReviewIdeaInput({
        ...baseInput,
        productSource: "upload",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("รายละเอียดสินค้า"),
    });
  });

  it("rejects Marketplace generation without a selected product", async () => {
    await expect(
      buildMarketplaceReviewIdeaInput({
        ...baseInput,
        productSource: "marketplace_capture",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Marketplace tie-in ideas require a selected product",
    });
  });
});
