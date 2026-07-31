import { describe, expect, it } from "vitest";
import {
  buildShotCharacterLookOptions,
  swapShotCharacterRefKey,
} from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";
import type { VerticalDramaCharacterPortraitMap } from "@shared/verticalDramaSeries/storyboard";

/**
 * Per-shot look switching (`planning/vd-look-image-not-replace-primary/plan.md`
 * §5). The per-shot reference picker could already express this as a
 * check/uncheck pair, but as a multi-select list it models "who is in this
 * shot", not "which look is this character wearing here". These helpers back
 * the one-click switcher on the character chip itself.
 */

const PORTRAITS = {
  "character-2": {
    characterId: "71",
    name: "ลลิน ศิริกุล",
    portraitUrl: "https://cdn.example.test/lalin.jpg",
  },
  "character-2-variant": {
    characterId: "112",
    name: "ลลิน ศิริกุล",
    portraitUrl: "https://cdn.example.test/lalin-casual.jpg",
    parentCharacterId: "71",
    variantLabel: "ชุดลำลอง",
    variantType: "outfit" as const,
  },
  "character-2-variant-2": {
    characterId: "113",
    name: "ลลิน ศิริกุล",
    portraitUrl: null,
    parentCharacterId: "71",
    variantLabel: "ชุดทำงาน",
    variantType: "outfit" as const,
  },
  "character-3": {
    characterId: "72",
    name: "ธีร์",
    portraitUrl: null,
  },
} as unknown as VerticalDramaCharacterPortraitMap;

describe("buildShotCharacterLookOptions", () => {
  it("offers the base character plus every look, from the BASE chip", () => {
    const options = buildShotCharacterLookOptions(PORTRAITS, "character-2");

    expect(options.map(o => o.key)).toEqual([
      "character-2",
      "character-2-variant",
      "character-2-variant-2",
    ]);
    expect(options[0]).toMatchObject({ isBase: true, label: "ลลิน ศิริกุล" });
    expect(options[1]).toMatchObject({ isBase: false, label: "ชุดลำลอง" });
  });

  it("offers the SAME family from a LOOK chip — switching works in both directions", () => {
    const fromLook = buildShotCharacterLookOptions(
      PORTRAITS,
      "character-2-variant"
    );

    expect(fromLook.map(o => o.key)).toEqual([
      "character-2",
      "character-2-variant",
      "character-2-variant-2",
    ]);
  });

  it("returns nothing for a character with no looks — the affordance stays hidden", () => {
    expect(buildShotCharacterLookOptions(PORTRAITS, "character-3")).toEqual([]);
  });

  it("returns nothing for a key that is not in the roster at all (a stale ref)", () => {
    expect(buildShotCharacterLookOptions(PORTRAITS, "ghost-key")).toEqual([]);
  });
});

describe("swapShotCharacterRefKey", () => {
  it("replaces only the chosen key and preserves position", () => {
    expect(
      swapShotCharacterRefKey(
        ["character", "character-2", "character-3"],
        "character-2",
        "character-2-variant"
      )
    ).toEqual(["character", "character-2-variant", "character-3"]);
  });

  it("never leaves the same person in the shot twice when the target was already present", () => {
    expect(
      swapShotCharacterRefKey(
        ["character-2", "character-2-variant"],
        "character-2",
        "character-2-variant"
      )
    ).toEqual(["character-2-variant"]);
  });

  it("is a no-op when the chosen look is already the one in use", () => {
    expect(
      swapShotCharacterRefKey(
        ["character-2", "character-3"],
        "character-2",
        "character-2"
      )
    ).toEqual(["character-2", "character-3"]);
  });

  it("leaves other shots' concerns alone — it only ever returns one shot's list", () => {
    const keys = ["character-2"];
    const result = swapShotCharacterRefKey(keys, "character-2", "character-2-variant");

    expect(result).toEqual(["character-2-variant"]);
    expect(keys).toEqual(["character-2"]); // input untouched
  });
});
