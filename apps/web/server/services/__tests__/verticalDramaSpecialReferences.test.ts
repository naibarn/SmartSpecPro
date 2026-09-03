import { describe, expect, it } from "vitest";
import {
  buildSpecialSceneLocationKey,
  isUsableSpecialCharacterReference,
} from "../verticalDramaSpecialReferences";

describe("special tie-in scene roster identity", () => {
  it("keeps the same background slot stable across idea selection and worker recovery", () => {
    expect(buildSpecialSceneLocationKey(53, "ห้องนั่งเล่น")).toBe(
      buildSpecialSceneLocationKey(53, "ห้องนั่งเล่น")
    );
    expect(buildSpecialSceneLocationKey(53, "ห้องนั่งเล่น")).not.toBe(
      buildSpecialSceneLocationKey(54, "ห้องนั่งเล่น")
    );
    expect(buildSpecialSceneLocationKey(53, "ห้องนั่งเล่น")).toHaveLength(63);
  });
});

describe("special tie-in character reference admission", () => {
  it("accepts an accessible character reference without approval", () => {
    expect(
      isUsableSpecialCharacterReference({
        mediaAssetId: 101,
        originalUrl: "https://cdn.example.test/portrait.png",
        status: "pending",
        assetType: "character_reference",
      }),
    ).toBe(true);
  });

  it("rejects a missing, expired, or non-character asset", () => {
    expect(
      isUsableSpecialCharacterReference({
        mediaAssetId: 101,
        originalUrl: "https://cdn.example.test/portrait.png",
        status: "expired",
        assetType: "character_reference",
      }),
    ).toBe(false);
    expect(
      isUsableSpecialCharacterReference({
        mediaAssetId: 101,
        originalUrl: "https://cdn.example.test/product.png",
        status: "ready",
        assetType: "product_reference",
      }),
    ).toBe(false);
  });
});
