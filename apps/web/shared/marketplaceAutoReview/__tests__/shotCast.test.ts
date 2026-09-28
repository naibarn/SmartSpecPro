import { describe, expect, it } from "vitest";

import {
  buildShotOrderedReferenceItems,
  castIdForCharacterIndex,
  selectShotCharacterReferenceItems,
} from "../shotCast";

/**
 * `planning/marketplace-four-character-cast/plan.md` §5.
 *
 * The bug this closes: every active character was sent to EVERY shot's start
 * frame, because `castInShot` was never read by image generation. These tests
 * also pin the two invariants that keep the prompt honest — product-first
 * ordering (character tags are `@Image{productCount + i + 1}`) and "absent
 * castInShot means everyone", so pre-existing runs never silently lose their
 * cast.
 */

const character = (name: string) => ({ url: `https://cdn.test/${name}.png`, name });

describe("selectShotCharacterReferenceItems", () => {
  const characterItems = [
    character("host"),
    character("guest"),
    character("kid"),
    character("extra"),
  ];

  it("returns EVERY character when castInShot is absent (legacy runs keep their cast)", () => {
    expect(
      selectShotCharacterReferenceItems({ characterItems }).map(item => item.name)
    ).toEqual(["host", "guest", "kid", "extra"]);
  });

  it("returns every character when castInShot is an empty list", () => {
    expect(
      selectShotCharacterReferenceItems({ characterItems, castInShot: [] })
    ).toHaveLength(4);
  });

  it("keeps only the listed cast members, in manifest order", () => {
    expect(
      selectShotCharacterReferenceItems({
        characterItems,
        castInShot: ["cast-3", "cast-1"],
      }).map(item => item.name)
    ).toEqual(["host", "kid"]);
  });

  it("ignores a castId that no longer matches any manifest entry", () => {
    expect(
      selectShotCharacterReferenceItems({
        characterItems,
        castInShot: ["cast-1", "cast-9"],
      }).map(item => item.name)
    ).toEqual(["host"]);
  });

  it("applies a per-shot look override to that character's url only", () => {
    const selected = selectShotCharacterReferenceItems({
      characterItems,
      castInShot: ["cast-1", "cast-2"],
      castLooks: { "cast-1": { url: "https://cdn.test/host-casual.png" } },
    });
    expect(selected[0]).toMatchObject({
      name: "host",
      url: "https://cdn.test/host-casual.png",
    });
    // The other character is untouched, and so is the source array.
    expect(selected[1].url).toBe("https://cdn.test/guest.png");
    expect(characterItems[0].url).toBe("https://cdn.test/host.png");
  });

  it("ignores a blank/absent look url rather than blanking the reference", () => {
    const selected = selectShotCharacterReferenceItems({
      characterItems,
      castLooks: { "cast-1": { url: "   " }, "cast-2": { variantLabel: "x" } },
    });
    expect(selected[0].url).toBe("https://cdn.test/host.png");
    expect(selected[1].url).toBe("https://cdn.test/guest.png");
  });

  it("applies a look to a character that is NOT in this shot only by not returning it at all", () => {
    expect(
      selectShotCharacterReferenceItems({
        characterItems,
        castInShot: ["cast-2"],
        castLooks: { "cast-1": { url: "https://cdn.test/unused.png" } },
      }).map(item => item.name)
    ).toEqual(["guest"]);
  });
});

describe("buildShotOrderedReferenceItems", () => {
  it("puts products first so @Image tags keep pointing at the product", () => {
    const { ordered, shotCharacterItems } = buildShotOrderedReferenceItems({
      productItems: [character("product-hero"), character("product-angle")],
      characterItems: [character("host"), character("guest"), character("kid")],
      castInShot: ["cast-1", "cast-3"],
    });
    expect(ordered.map(item => item.name)).toEqual([
      "product-hero",
      "product-angle",
      "host",
      "kid",
    ]);
    // The kid is @Image4 in this shot: productCount(2) + index(1) + 1.
    expect(shotCharacterItems.map(item => item.name)).toEqual(["host", "kid"]);
  });
});

describe("castIdForCharacterIndex", () => {
  it("mints positional ids matching deriveStagedCastFromManifest", () => {
    expect([0, 1, 2, 3].map(castIdForCharacterIndex)).toEqual([
      "cast-1",
      "cast-2",
      "cast-3",
      "cast-4",
    ]);
  });
});
