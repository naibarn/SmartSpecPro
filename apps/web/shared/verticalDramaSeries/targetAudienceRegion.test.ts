import { describe, it, expect } from "vitest";
import {
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS,
  VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
  VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS,
  normalizeTargetAudienceRegion,
  buildTargetAudienceRegionInstruction,
  readTargetAudienceRegionFromBible,
} from "./targetAudienceRegion";

describe("normalizeTargetAudienceRegion", () => {
  it("returns every documented region value unchanged", () => {
    for (const region of VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS) {
      expect(normalizeTargetAudienceRegion(region)).toBe(region);
    }
  });

  it("falls back to the default for unknown/invalid values", () => {
    expect(normalizeTargetAudienceRegion("atlantis")).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(normalizeTargetAudienceRegion(undefined)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(normalizeTargetAudienceRegion(null)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(normalizeTargetAudienceRegion(42)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
  });

  it("defaults to 'thai'", () => {
    expect(VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION).toBe("thai");
  });
});

describe("buildTargetAudienceRegionInstruction", () => {
  it("includes the correct English descriptor for every region", () => {
    for (const region of VERTICAL_DRAMA_TARGET_AUDIENCE_REGIONS) {
      const instruction = buildTargetAudienceRegionInstruction(region);
      expect(instruction).toContain(VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[region]);
    }
  });

  it("always phrases the instruction as a DEFAULT that a character description can override", () => {
    const instruction = buildTargetAudienceRegionInstruction("western");
    expect(instruction).toMatch(/default/i);
    expect(instruction).toMatch(/description does not already/i);
    expect(instruction).toMatch(/always takes precedence/i);
  });

  it("falls back to the default region's descriptor when given null/undefined", () => {
    const instruction = buildTargetAudienceRegionInstruction(undefined);
    expect(instruction).toContain(
      VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_DESCRIPTORS[VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION],
    );
  });
});

describe("readTargetAudienceRegionFromBible", () => {
  it("reads a valid region off the bible payload", () => {
    expect(readTargetAudienceRegionFromBible({ targetAudienceRegion: "south_asian" })).toBe(
      "south_asian",
    );
  });

  it("normalizes an invalid/missing value to the default", () => {
    expect(readTargetAudienceRegionFromBible({ targetAudienceRegion: "bogus" })).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(readTargetAudienceRegionFromBible({})).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(readTargetAudienceRegionFromBible(null)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
    expect(readTargetAudienceRegionFromBible(undefined)).toBe(
      VERTICAL_DRAMA_DEFAULT_TARGET_AUDIENCE_REGION,
    );
  });
});
