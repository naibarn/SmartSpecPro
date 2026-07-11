import { describe, expect, it } from "vitest";
import {
  buildReferenceCandidates,
  resolveDefaultReferenceAssetLinkId,
  type VdReferenceCandidateCharacterFields,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";
import type { VerticalDramaCharacterAsset } from "@shared/verticalDramaSeries/characterAssets";

/**
 * Coverage for the reference-image picker
 * (planning/vertical-drama-reference-picker-outfit-lock/plan.md, Phase D3):
 * the character-detail-panel picker needs to (1) list every candidate
 * `primary_portrait` a character can attach as its next generate call's
 * identity-lock reference — its own portraits, plus (for a variant/twin) its
 * source character's portraits — and (2) know which one the backend would
 * auto-pick today so the picker's default selection never silently changes
 * existing behavior until the user actively overrides it.
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
    thumbnailUrl: "https://x/default.jpg",
    ...over,
  };
}

function character(
  over: Partial<VdReferenceCandidateCharacterFields> & { characterId: string }
): VdReferenceCandidateCharacterFields {
  return {
    characterId: over.characterId,
    parentCharacterId: undefined,
    sharesFaceWithCharacterId: undefined,
    ...over,
  };
}

describe("buildReferenceCandidates", () => {
  it("returns an empty list for a character with zero own portraits and no variant/twin relationship", () => {
    const result = buildReferenceCandidates(
      [asset({ characterId: "other", assetLinkId: "other-1" })],
      character({ characterId: "5" }),
      new Map()
    );
    expect(result).toEqual([]);
  });

  it("lists every own primary_portrait asset (not just one) for a character with 2+ portraits", () => {
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "5",
          assetLinkId: "portrait-1",
          thumbnailUrl: "https://x/1.jpg",
        }),
        asset({
          characterId: "5",
          assetLinkId: "portrait-2",
          thumbnailUrl: "https://x/2.jpg",
        }),
      ],
      character({ characterId: "5" }),
      new Map()
    );
    expect(result).toHaveLength(2);
    expect(result.map(c => c.assetLinkId).sort()).toEqual([
      "portrait-1",
      "portrait-2",
    ]);
    expect(result.every(c => c.sourceLabel === "own")).toBe(true);
  });

  it("labels a variant's parent portraits as 'parent' with the resolved source name, when the variant has no portrait of its own", () => {
    const charactersById = new Map([
      ["1", { characterId: "1", name: "หนูนา" }],
    ]);
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "1",
          assetLinkId: "parent-portrait",
          thumbnailUrl: "https://x/parent.jpg",
        }),
      ],
      character({ characterId: "2", parentCharacterId: "1" }),
      charactersById
    );
    expect(result).toEqual([
      {
        assetLinkId: "parent-portrait",
        thumbnailUrl: "https://x/parent.jpg",
        sourceLabel: "parent",
        sourceName: "หนูนา",
      },
    ]);
  });

  it("labels a twin's shares-face source portraits as 'twin' with the resolved source name", () => {
    const charactersById = new Map([
      ["1", { characterId: "1", name: "เอิร์ธ" }],
    ]);
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "1",
          assetLinkId: "twin-source-portrait",
          thumbnailUrl: "https://x/twin.jpg",
        }),
      ],
      character({ characterId: "2", sharesFaceWithCharacterId: "1" }),
      charactersById
    );
    expect(result).toEqual([
      {
        assetLinkId: "twin-source-portrait",
        thumbnailUrl: "https://x/twin.jpg",
        sourceLabel: "twin",
        sourceName: "เอิร์ธ",
      },
    ]);
  });

  it("includes both a character's own portraits AND its variant/twin source's portraits together", () => {
    const charactersById = new Map([
      ["1", { characterId: "1", name: "หนูนา" }],
    ]);
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "2",
          assetLinkId: "own-portrait",
          thumbnailUrl: "https://x/own.jpg",
        }),
        asset({
          characterId: "1",
          assetLinkId: "parent-portrait",
          thumbnailUrl: "https://x/parent.jpg",
        }),
      ],
      character({ characterId: "2", parentCharacterId: "1" }),
      charactersById
    );
    expect(result).toHaveLength(2);
    const own = result.find(c => c.assetLinkId === "own-portrait");
    const parent = result.find(c => c.assetLinkId === "parent-portrait");
    expect(own).toEqual({
      assetLinkId: "own-portrait",
      thumbnailUrl: "https://x/own.jpg",
      sourceLabel: "own",
    });
    expect(parent).toEqual({
      assetLinkId: "parent-portrait",
      thumbnailUrl: "https://x/parent.jpg",
      sourceLabel: "parent",
      sourceName: "หนูนา",
    });
  });

  it("2026-07-11 fix: labels a PARENT's own variant portraits as 'variant' with the variant's label, when viewing the parent (reverse of the 'parent' case above)", () => {
    const charactersById = new Map([
      [
        "2",
        {
          characterId: "2",
          name: "ฝ้าย",
          parentCharacterId: "1",
          variantLabel: "ชุดยูนิฟอร์ม",
        },
      ],
    ]);
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "1",
          assetLinkId: "parent-own-portrait",
          thumbnailUrl: "https://x/parent-own.jpg",
        }),
        asset({
          characterId: "2",
          assetLinkId: "variant-portrait",
          thumbnailUrl: "https://x/variant.jpg",
        }),
      ],
      character({ characterId: "1" }),
      charactersById
    );
    expect(result).toHaveLength(2);
    const own = result.find(c => c.assetLinkId === "parent-own-portrait");
    const variant = result.find(c => c.assetLinkId === "variant-portrait");
    expect(own).toEqual({
      assetLinkId: "parent-own-portrait",
      thumbnailUrl: "https://x/parent-own.jpg",
      sourceLabel: "own",
    });
    expect(variant).toEqual({
      assetLinkId: "variant-portrait",
      thumbnailUrl: "https://x/variant.jpg",
      sourceLabel: "variant",
      sourceName: "ชุดยูนิฟอร์ม",
    });
  });

  it("2026-07-11 fix: labels a twin-source's portraits as 'twin' when viewing the SOURCE character (reverse of the 'twin' case above)", () => {
    const charactersById = new Map([
      ["2", { characterId: "2", name: "มีน", sharesFaceWithCharacterId: "1" }],
    ]);
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "2",
          assetLinkId: "twin-portrait",
          thumbnailUrl: "https://x/twin.jpg",
        }),
      ],
      character({ characterId: "1" }),
      charactersById
    );
    expect(result).toEqual([
      {
        assetLinkId: "twin-portrait",
        thumbnailUrl: "https://x/twin.jpg",
        sourceLabel: "twin",
        sourceName: "มีน",
      },
    ]);
  });

  it("falls back to the variant's own name when it has no variantLabel set", () => {
    const charactersById = new Map([
      ["2", { characterId: "2", name: "ฝ้าย (สำรอง)", parentCharacterId: "1" }],
    ]);
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "2",
          assetLinkId: "variant-portrait",
          thumbnailUrl: "https://x/variant.jpg",
        }),
      ],
      character({ characterId: "1" }),
      charactersById
    );
    expect(result).toEqual([
      {
        assetLinkId: "variant-portrait",
        thumbnailUrl: "https://x/variant.jpg",
        sourceLabel: "variant",
        sourceName: "ฝ้าย (สำรอง)",
      },
    ]);
  });

  it("ignores assets with no thumbnailUrl and assets of other roles", () => {
    const result = buildReferenceCandidates(
      [
        asset({
          characterId: "5",
          assetLinkId: "no-thumbnail",
          thumbnailUrl: undefined,
        }),
        asset({
          characterId: "5",
          assetLinkId: "wrong-role",
          role: "character_sheet_full",
        }),
      ],
      character({ characterId: "5" }),
      new Map()
    );
    expect(result).toEqual([]);
  });
});

describe("resolveDefaultReferenceAssetLinkId", () => {
  it("returns null when the character has no primary_portrait of its own yet (e.g. a brand-new variant/twin)", () => {
    const result = resolveDefaultReferenceAssetLinkId(
      [asset({ characterId: "1", assetLinkId: "parent-portrait" })],
      "2"
    );
    expect(result).toBeNull();
  });

  it("prefers the approved portrait over a more-recently-updated generated one, matching getPrimaryPortraitUrl", () => {
    const result = resolveDefaultReferenceAssetLinkId(
      [
        asset({
          characterId: "5",
          assetLinkId: "generated-1",
          state: "generated",
          updatedAt: "2026-07-10T00:00:00.000Z",
        }),
        asset({
          characterId: "5",
          assetLinkId: "approved-1",
          state: "approved",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
      ],
      "5"
    );
    expect(result).toBe("approved-1");
  });

  it("falls back to the most recently updated portrait when none is approved", () => {
    const result = resolveDefaultReferenceAssetLinkId(
      [
        asset({
          characterId: "5",
          assetLinkId: "older",
          state: "imported",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
        asset({
          characterId: "5",
          assetLinkId: "newer",
          state: "generated",
          updatedAt: "2026-07-05T00:00:00.000Z",
        }),
      ],
      "5"
    );
    expect(result).toBe("newer");
  });
});
