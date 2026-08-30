import { describe, expect, it } from "vitest";
import {
  SERIES_PROFILE_REGISTRY,
  buildSeriesProfileInvalidation,
  getSeriesProfile,
  projectProfileToLegacy,
  resolveSeriesProfile,
} from "../seriesProfile";

describe("series profile registry", () => {
  it("contains the twelve canonical profiles", () => {
    expect(SERIES_PROFILE_REGISTRY).toHaveLength(13);
    expect(
      new Set(SERIES_PROFILE_REGISTRY.map(item => item.profileId)).size
    ).toBe(13);
  });

  it("gives every profile strict profile-specific grounding", () => {
    for (const item of SERIES_PROFILE_REGISTRY) {
      expect(item.grounding.mode).toBe("strict_genre");
      expect(item.grounding.requiredObservableCues.length).toBeGreaterThan(0);
      expect(item.grounding.cuePatterns.length).toBeGreaterThan(0);
      expect(item.grounding.genreKey).toBe(item.visualGenreKey);
    }
  });

  it("requires source evidence for every non-fiction profile", () => {
    for (const item of SERIES_PROFILE_REGISTRY) {
      expect(item.sourceGatePolicy).toBe(
        item.contentKind === "fiction" ? "optional" : "required"
      );
    }
  });

  it("resolves legacy values without writing a new profile during read", () => {
    const result = resolveSeriesProfile({
      seriesFormat: { kind: "restaurant_review" },
      lookLockControl: { genreKey: "sci_fi_cyberpunk" },
    });
    expect(result.profile.profileId).toBe("restaurant_review");
    expect(result.source).toBe("series_format");
  });

  it("never projects a non-fiction profile into the fiction look enum", () => {
    expect(
      projectProfileToLegacy("software_review").legacyLookLockGenreKey
    ).toBeUndefined();
    expect(
      projectProfileToLegacy("fantasy_fairytale_xianxia").legacyLookLockGenreKey
    ).toBe("fantasy_fairytale");
  });

  it("invalidates digest and source analysis on profile changes", () => {
    const previous = getSeriesProfile("drama_romance");
    const next = getSeriesProfile("documentary");
    const result = buildSeriesProfileInvalidation(previous, next);
    expect(result.invalidateDigest).toBe(true);
    expect(result.invalidateSourceAnalysis).toBe(true);
    expect(result.requiresSourceGate).toBe(true);
  });
});
