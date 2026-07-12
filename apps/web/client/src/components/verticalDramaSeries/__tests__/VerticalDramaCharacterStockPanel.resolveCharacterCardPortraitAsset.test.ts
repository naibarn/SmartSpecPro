import { describe, expect, it } from "vitest";
import { resolveCharacterCardPortraitAsset } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import type { VerticalDramaCharacterAsset } from "@shared/verticalDramaSeries/characterAssets";

/**
 * Coverage for the character-card image-controls feature
 * (planning/vertical-drama-character-card-image-controls/plan.md): the
 * card-level delete button (main portrait + variant "look" chips) needs the
 * WINNING `primary_portrait` asset's `assetLinkId`, not just its thumbnail
 * URL — `resolveCharacterCardPortraitAsset` carries the exact same
 * selection rule the roster card thumbnail has always used (approved-first,
 * then newest generated/imported, then session cache) while also returning
 * that `assetLinkId` so the new delete button knows what to delete.
 */
function asset(
  over: Partial<VerticalDramaCharacterAsset>
): VerticalDramaCharacterAsset {
  return {
    assetLinkId: "link-1",
    seriesId: "10",
    characterId: "5",
    mediaAssetId: "100",
    assetType: "character_reference",
    role: "primary_portrait",
    state: "draft",
    approved: false,
    qcStatus: "pending",
    source: "imported",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("resolveCharacterCardPortraitAsset", () => {
  it("returns null when there are no primary_portrait assets and no session cache", () => {
    expect(resolveCharacterCardPortraitAsset([], "5")).toBeNull();
  });

  it("ignores assets for other characters or other roles", () => {
    const result = resolveCharacterCardPortraitAsset(
      [
        asset({ characterId: "other", thumbnailUrl: "https://x/other.jpg" }),
        asset({
          characterId: "5",
          role: "expression",
          thumbnailUrl: "https://x/expr.jpg",
        }),
      ],
      "5"
    );
    expect(result).toBeNull();
  });

  it("prefers the approved asset over a more-recently-updated generated one", () => {
    const result = resolveCharacterCardPortraitAsset(
      [
        asset({
          assetLinkId: "generated-1",
          state: "generated",
          thumbnailUrl: "https://x/generated.jpg",
          updatedAt: "2026-07-10T00:00:00.000Z",
        }),
        asset({
          assetLinkId: "approved-1",
          state: "approved",
          thumbnailUrl: "https://x/approved.jpg",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
      "5"
    );
    expect(result).toEqual({
      thumbnailUrl: "https://x/approved.jpg",
      assetLinkId: "approved-1",
    });
  });

  it("falls back to the most recently updated generated/imported asset when none is approved", () => {
    const result = resolveCharacterCardPortraitAsset(
      [
        asset({
          assetLinkId: "older",
          state: "imported",
          thumbnailUrl: "https://x/older.jpg",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
        asset({
          assetLinkId: "newer",
          state: "generated",
          thumbnailUrl: "https://x/newer.jpg",
          updatedAt: "2026-07-05T00:00:00.000Z",
        }),
      ],
      "5"
    );
    expect(result).toEqual({
      thumbnailUrl: "https://x/newer.jpg",
      assetLinkId: "newer",
    });
  });

  it("ignores rejected/stale/draft assets when picking the fallback", () => {
    const result = resolveCharacterCardPortraitAsset(
      [
        asset({
          assetLinkId: "rejected",
          state: "rejected",
          thumbnailUrl: "https://x/rejected.jpg",
          updatedAt: "2026-07-09T00:00:00.000Z",
        }),
        asset({
          assetLinkId: "imported",
          state: "imported",
          thumbnailUrl: "https://x/imported.jpg",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
      "5"
    );
    expect(result).toEqual({
      thumbnailUrl: "https://x/imported.jpg",
      assetLinkId: "imported",
    });
  });

  it("falls back to the session-generated-image cache, carrying the matching asset's assetLinkId, when the chosen asset has no thumbnailUrl yet", () => {
    const result = resolveCharacterCardPortraitAsset(
      [
        asset({
          assetLinkId: "just-linked",
          state: "generated",
          mediaAssetId: "999",
          thumbnailUrl: undefined,
          updatedAt: "2026-07-10T00:00:00.000Z",
        }),
      ],
      "5",
      { imageUrl: "https://cache/session.jpg", mediaAssetId: "999" }
    );
    expect(result).toEqual({
      thumbnailUrl: "https://cache/session.jpg",
      assetLinkId: "just-linked",
    });
  });

  it("does NOT use the session cache when its mediaAssetId doesn't match the chosen asset", () => {
    const result = resolveCharacterCardPortraitAsset(
      [
        asset({
          assetLinkId: "just-linked",
          state: "generated",
          mediaAssetId: "999",
          thumbnailUrl: undefined,
        }),
      ],
      "5",
      { imageUrl: "https://cache/session.jpg", mediaAssetId: "different" }
    );
    expect(result).toBeNull();
  });

  it("returns a null assetLinkId (nothing durable to delete yet) when only the session cache matches, with no backing asset row at all", () => {
    const result = resolveCharacterCardPortraitAsset([], "5", {
      imageUrl: "https://cache/session.jpg",
      mediaAssetId: "999",
    });
    expect(result).toEqual({
      thumbnailUrl: "https://cache/session.jpg",
      assetLinkId: null,
    });
  });
});
