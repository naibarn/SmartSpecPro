import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaCharacterCastingPreferences,
  characterCastingFormFromData,
  readCharacterCastingPreferencesFromData,
  VERTICAL_DRAMA_CHARACTER_CASTING_FORM_DEFAULTS,
  VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS,
  VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS,
} from "../characterCasting";

describe("vertical drama character casting preferences", () => {
  it("publishes the complete region and casting-look option sets", () => {
    expect(VERTICAL_DRAMA_CHARACTER_CASTING_REGIONS).toHaveLength(15);
    expect(VERTICAL_DRAMA_CHARACTER_CASTING_LOOKS).toHaveLength(9);
  });

  it("defaults legacy characters with no casting fields to Auto for both controls", () => {
    expect(readCharacterCastingPreferencesFromData({})).toEqual({
      version: 1,
      regionMode: "auto",
      lookMode: "auto",
    });
    expect(characterCastingFormFromData(null)).toEqual(
      VERTICAL_DRAMA_CHARACTER_CASTING_FORM_DEFAULTS
    );
  });

  it("carries legacy region and free-text ethnicity into the new skill contract", () => {
    expect(
      readCharacterCastingPreferencesFromData({
        region: "east_asian",
        ethnicityText: "Thai-Japanese mixed",
      })
    ).toEqual({
      version: 1,
      regionMode: "preset",
      region: "east_asian",
      lookMode: "auto",
      additionalDetails: "Thai-Japanese mixed",
    });
  });

  it("keeps additional details above explicit region and look choices", () => {
    const preferences = buildVerticalDramaCharacterCastingPreferences({
      region: "american_canadian",
      look: "natural_relatable",
      additionalDetails: "Korean-drama casting but an American character",
    });
    expect(preferences).toMatchObject({
      regionMode: "preset",
      region: "american_canadian",
      lookMode: "preset",
      look: "natural_relatable",
      additionalDetails: "Korean-drama casting but an American character",
    });
  });

  it("normalizes a persisted Auto selection without inventing a region or look", () => {
    expect(
      readCharacterCastingPreferencesFromData({
        castingPreferences: {
          version: 1,
          regionMode: "auto",
          lookMode: "auto",
        },
      })
    ).toEqual({
      version: 1,
      regionMode: "auto",
      lookMode: "auto",
    });
  });
});
