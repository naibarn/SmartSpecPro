import { describe, expect, it } from "vitest";
import { marketplaceAssetMediaUrl, marketplaceMediaUrl } from "./marketplaceMediaUrl";

describe("marketplaceMediaUrl", () => {
  it("always prefers the managed storage key over a stale persisted URL", () => {
    expect(marketplaceMediaUrl(
      "marketplace-captures/cap-1/images/product_01.png",
      "https://old-cdn.example/product.png",
    )).toBe("/api/storage/files/marketplace-captures/cap-1/images/product_01.png");
  });

  it("encodes storage key segments without changing the key contract", () => {
    expect(marketplaceMediaUrl(
      "marketplace-captures/cap-1/images/product image.png",
      null,
    )).toBe("/api/storage/files/marketplace-captures/cap-1/images/product%20image.png");
  });

  it("preserves an external URL only when no managed key exists", () => {
    expect(marketplaceAssetMediaUrl({ url: "https://cdn.example/product.png" })).toBe(
      "https://cdn.example/product.png",
    );
  });

  it("rejects unsafe storage keys and does not manufacture a proxy URL", () => {
    expect(marketplaceMediaUrl("../secret.png", "https://cdn.example/product.png")).toBe(
      "https://cdn.example/product.png",
    );
    expect(marketplaceMediaUrl("", null)).toBe("");
  });
});
