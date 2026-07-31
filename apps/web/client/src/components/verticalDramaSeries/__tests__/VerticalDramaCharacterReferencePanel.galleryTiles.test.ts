import { describe, expect, it } from "vitest";
import {
  buildCharacterGalleryTiles,
  type VdGalleryAssetFields,
  type VdGalleryCharacterFields,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterReferencePanel";

/**
 * `planning/vd-look-image-not-replace-primary/plan.md` §2.
 *
 * Reported bug: generating a new LOOK image ended up replacing the base
 * character's main portrait. Reproduced in production as
 * `vertical_drama_character_assets` rows 275 (look 112, `generated`) and 277
 * (parent 71, `imported`) both pointing at media asset 1207.
 *
 * The path was the "ภาพตัวละครนี้" swap gallery: it spans the whole look family
 * (correct — same person, swapping between them is a real workflow) but every
 * tile was captioned with its raw `role`, which is `primary_portrait` for all of
 * them, and one click promoted the picked image to the SELECTED character's main
 * portrait. So the look's brand-new image sat unlabeled among the parent's own
 * images and one click overwrote the parent.
 *
 * These tests pin the fact each tile must now carry — whose image is this —
 * which is what lets the UI both label the tile and gate a cross-row pick behind
 * a confirmation.
 */

const BASE: VdGalleryCharacterFields = {
  characterId: "71",
  name: "ลลิน ศิริกุล",
};
const LOOK: VdGalleryCharacterFields = {
  characterId: "112",
  name: "ลลิน ศิริกุล",
  parentCharacterId: "71",
  variantLabel: "ชุดลำลอง",
};
const SIBLING_LOOK: VdGalleryCharacterFields = {
  characterId: "113",
  name: "ลลิน ศิริกุล",
  parentCharacterId: "71",
  variantLabel: "ชุดสูท",
};
const UNRELATED: VdGalleryCharacterFields = {
  characterId: "70",
  name: "คิริน วัฒนเมธา",
};

function asset(over: Partial<VdGalleryAssetFields> = {}): VdGalleryAssetFields {
  return {
    assetLinkId: "link-1",
    characterId: "71",
    mediaAssetId: "1207",
    role: "primary_portrait",
    state: "approved",
    thumbnailUrl: "https://cdn.example.test/a.jpg",
    ...over,
  };
}

const CHARACTERS = [BASE, LOOK, SIBLING_LOOK, UNRELATED];

describe("buildCharacterGalleryTiles — owner attribution", () => {
  it("marks the swap target's own images as own, with no owner caption", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [asset({ assetLinkId: "l-own", characterId: "71" })],
      targetCharacterId: 71,
    });

    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      assetLinkId: "l-own",
      isOwn: true,
      ownerKind: null,
      ownerName: null,
    });
  });

  it("attributes a LOOK's image to that look while the BASE character is the swap target — the exact tile that used to overwrite the main portrait unlabeled", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [asset({ assetLinkId: "l-look", characterId: "112" })],
      targetCharacterId: 71,
    });

    expect(tiles[0]).toMatchObject({
      assetLinkId: "l-look",
      isOwn: false,
      ownerKind: "look",
      ownerName: "ชุดลำลอง",
    });
  });

  it("attributes the BASE character's image when a LOOK is the swap target", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [asset({ assetLinkId: "l-base", characterId: "71" })],
      targetCharacterId: 112,
    });

    expect(tiles[0]).toMatchObject({
      isOwn: false,
      ownerKind: "base",
      ownerName: "ลลิน ศิริกุล",
    });
  });

  it("includes SIBLING looks (same family root) and attributes them to their own label", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [asset({ assetLinkId: "l-sib", characterId: "113" })],
      targetCharacterId: 112,
    });

    expect(tiles[0]).toMatchObject({ ownerKind: "look", ownerName: "ชุดสูท" });
  });

  it("falls back to the owner's name when a look row has no variantLabel", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: [
        BASE,
        { characterId: "112", name: "ลลิน ศิริกุล", parentCharacterId: "71" },
      ],
      assets: [asset({ characterId: "112" })],
      targetCharacterId: 71,
    });

    expect(tiles[0]).toMatchObject({ ownerKind: "look", ownerName: "ลลิน ศิริกุล" });
  });
});

describe("buildCharacterGalleryTiles — identity-safe filtering (unchanged rules)", () => {
  it("excludes another family's characters entirely", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [
        asset({ assetLinkId: "l-mine", characterId: "71" }),
        asset({ assetLinkId: "l-other", characterId: "70" }),
      ],
      targetCharacterId: 71,
    });

    expect(tiles.map(tile => tile.assetLinkId)).toEqual(["l-mine"]);
  });

  it("excludes portrait_candidate rows — those are deliberately DIFFERENT people", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [
        asset({ assetLinkId: "l-primary", role: "primary_portrait" }),
        asset({ assetLinkId: "l-candidate", role: "portrait_candidate" }),
      ],
      targetCharacterId: 71,
    });

    expect(tiles.map(tile => tile.assetLinkId)).toEqual(["l-primary"]);
  });

  it("excludes rows with no attached media asset", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [asset({ mediaAssetId: null })],
      targetCharacterId: 71,
    });

    expect(tiles).toEqual([]);
  });

  it("returns nothing for a non-numeric swap target (the shot-start-frame placeholder mount)", () => {
    const tiles = buildCharacterGalleryTiles({
      characters: CHARACTERS,
      assets: [asset()],
      targetCharacterId: Number("shot-3"),
    });

    expect(tiles).toEqual([]);
  });
});
