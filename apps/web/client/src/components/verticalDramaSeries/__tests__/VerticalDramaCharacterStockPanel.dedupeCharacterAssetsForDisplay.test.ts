import { describe, expect, it } from "vitest";
import { dedupeCharacterAssetsForDisplay } from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import type { VerticalDramaCharacterAsset } from "@shared/verticalDramaSeries/characterAssets";

/**
 * Regression coverage for the character-reference duplicate-tile bug (repro
 * 2026-07-06, series 4 คุณหญิงเบญจวรรณ): dragging an already-linked reference
 * image from "ภาพตัวละครนี้" onto the character card used to create a second
 * link row for the same underlying image (one tile labeled "approved", one
 * "primary_p..."). `linkAsset` is now idempotent server-side (see
 * `verticalDramaCharacterStock.test.ts`), but this defensive UI-level dedupe
 * also protects against any already-duplicated rows still in the database
 * (old data the service-level fix cannot retroactively collapse without a
 * migration).
 */
function asset(over: Partial<VerticalDramaCharacterAsset>): VerticalDramaCharacterAsset {
  return {
    assetLinkId: "1",
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

describe("dedupeCharacterAssetsForDisplay", () => {
  it("collapses two rows for the same (mediaAssetId, role) into one, keeping the most recently updated", () => {
    const result = dedupeCharacterAssetsForDisplay([
      asset({
        assetLinkId: "1",
        role: "primary_portrait",
        state: "approved",
        updatedAt: "2026-07-05T00:00:00.000Z",
      }),
      asset({
        assetLinkId: "2",
        role: "primary_portrait",
        state: "approved",
        updatedAt: "2026-07-06T00:00:00.000Z",
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].assetLinkId).toBe("2");
  });

  it("prefers the approved row on an exact updatedAt tie", () => {
    const result = dedupeCharacterAssetsForDisplay([
      asset({ assetLinkId: "1", role: "primary_portrait", state: "generated", updatedAt: "2026-07-06T00:00:00.000Z" }),
      asset({ assetLinkId: "2", role: "primary_portrait", state: "approved", updatedAt: "2026-07-06T00:00:00.000Z" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].assetLinkId).toBe("2");
  });

  it("does NOT collapse the same mediaAssetId tagged under two different legitimate roles", () => {
    const result = dedupeCharacterAssetsForDisplay([
      asset({ assetLinkId: "1", role: "primary_portrait", mediaAssetId: "100" }),
      asset({ assetLinkId: "2", role: "character_sheet_full", mediaAssetId: "100" }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map(a => a.assetLinkId).sort()).toEqual(["1", "2"]);
  });

  it("passes through distinct assets unchanged", () => {
    const result = dedupeCharacterAssetsForDisplay([
      asset({ assetLinkId: "1", mediaAssetId: "100" }),
      asset({ assetLinkId: "2", mediaAssetId: "200" }),
    ]);
    expect(result).toHaveLength(2);
  });
});
