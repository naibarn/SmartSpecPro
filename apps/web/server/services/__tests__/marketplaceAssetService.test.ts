import { describe, expect, it } from "vitest";

import { marketplaceImageCandidateFileBaseNameForTest } from "../marketplaceAssetService";

describe("marketplace image candidate storage names", () => {
  it("uses compact product image names instead of product-title slugs", () => {
    expect(marketplaceImageCandidateFileBaseNameForTest("main", 0)).toBe(
      "product_main_01"
    );
    expect(
      marketplaceImageCandidateFileBaseNameForTest("description", 11)
    ).toBe("product_description_12");
    expect(marketplaceImageCandidateFileBaseNameForTest("review", 1)).toBe(
      "product_review_02"
    );
  });
});
