import { describe, expect, it } from "vitest";
import { normalizeGalleryTenantId } from "../galleryTenantScope";

describe("normalizeGalleryTenantId", () => {
  it("accepts current string tenant identifiers", () => {
    expect(normalizeGalleryTenantId("tenant-smartaihub")).toBe(
      "tenant-smartaihub"
    );
    expect(normalizeGalleryTenantId(7)).toBe("7");
  });

  it("fails closed for missing or invalid tenant identifiers", () => {
    expect(normalizeGalleryTenantId(undefined)).toBeNull();
    expect(normalizeGalleryTenantId(null)).toBeNull();
    expect(normalizeGalleryTenantId("NaN")).toBeNull();
    expect(normalizeGalleryTenantId(" ")).toBeNull();
  });
});
