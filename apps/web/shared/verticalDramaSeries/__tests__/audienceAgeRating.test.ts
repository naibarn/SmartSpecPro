/**
 * Vertical Drama Series — series-level audience age rating (Phase 1 of a
 * 2-phase feature; see `../audienceAgeRating`'s own header doc comment).
 * Pure-function coverage mirroring `../speechProfile.test.ts`'s
 * `renderVoiceCardBlock` conventions (deterministic string, tier-distinct
 * content, no round-trip through a real LLM call needed).
 */
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_AGE_RATINGS,
  AUDIENCE_AGE_RATING_BADGE_LABEL,
  DEFAULT_AUDIENCE_AGE_RATING,
  isAudienceAgeRating,
  resolveAudienceAgeRating,
  renderAudienceAgeRatingBlock,
  type AudienceAgeRating,
} from "../audienceAgeRating";

describe("AUDIENCE_AGE_RATINGS / DEFAULT_AUDIENCE_AGE_RATING", () => {
  it("pins the documented 3-tier list", () => {
    expect(AUDIENCE_AGE_RATINGS).toEqual(["18plus", "13plus", "under13"]);
  });

  it("defaults to the least-restrictive 18plus tier", () => {
    expect(DEFAULT_AUDIENCE_AGE_RATING).toBe("18plus");
  });
});

describe("AUDIENCE_AGE_RATING_BADGE_LABEL", () => {
  it("maps every tier to its short render-time badge label", () => {
    expect(AUDIENCE_AGE_RATING_BADGE_LABEL).toEqual({
      "18plus": "18+",
      "13plus": "13+",
      under13: "ทั่วไป",
    });
  });

  it("has an entry for every documented tier (no missing/extra keys)", () => {
    expect(Object.keys(AUDIENCE_AGE_RATING_BADGE_LABEL).sort()).toEqual(
      [...AUDIENCE_AGE_RATINGS].sort(),
    );
  });

  it("every label is short (<=6 chars) — stays legible at the badge's small font size", () => {
    for (const rating of AUDIENCE_AGE_RATINGS) {
      expect(AUDIENCE_AGE_RATING_BADGE_LABEL[rating].length).toBeLessThanOrEqual(6);
    }
  });
});

describe("isAudienceAgeRating", () => {
  it("accepts every documented tier", () => {
    for (const rating of AUDIENCE_AGE_RATINGS) {
      expect(isAudienceAgeRating(rating)).toBe(true);
    }
  });

  it("rejects an invalid string, undefined, null, and a non-string value", () => {
    expect(isAudienceAgeRating("21plus")).toBe(false);
    expect(isAudienceAgeRating(undefined)).toBe(false);
    expect(isAudienceAgeRating(null)).toBe(false);
    expect(isAudienceAgeRating(42)).toBe(false);
  });
});

describe("resolveAudienceAgeRating", () => {
  it("returns each valid tier unchanged", () => {
    expect(resolveAudienceAgeRating("18plus")).toBe("18plus");
    expect(resolveAudienceAgeRating("13plus")).toBe("13plus");
    expect(resolveAudienceAgeRating("under13")).toBe("under13");
  });

  it("defaults an invalid string to 18plus", () => {
    expect(resolveAudienceAgeRating("21plus")).toBe("18plus");
  });

  it("defaults undefined/null/absent values to 18plus", () => {
    expect(resolveAudienceAgeRating(undefined)).toBe("18plus");
    expect(resolveAudienceAgeRating(null)).toBe("18plus");
  });

  it("defaults a non-string value (e.g. a stray number/object) to 18plus", () => {
    expect(resolveAudienceAgeRating(42)).toBe("18plus");
    expect(resolveAudienceAgeRating({})).toBe("18plus");
  });
});

describe("renderAudienceAgeRatingBlock", () => {
  it("produces a deterministic, stable string for a given tier", () => {
    expect(renderAudienceAgeRatingBlock("13plus")).toBe(
      renderAudienceAgeRatingBlock("13plus"),
    );
  });

  it("includes the shared HARD CONSTRAINT header for every tier", () => {
    for (const rating of AUDIENCE_AGE_RATINGS) {
      expect(renderAudienceAgeRatingBlock(rating)).toContain(
        "AUDIENCE AGE RATING (HARD CONSTRAINT)",
      );
    }
  });

  it("returns a non-empty, tier-distinct string for each of the 3 tiers", () => {
    const blocks = AUDIENCE_AGE_RATINGS.map(rating =>
      renderAudienceAgeRatingBlock(rating),
    );
    for (const block of blocks) {
      expect(block.length).toBeGreaterThan(0);
    }
    // Every tier's block must differ from every other tier's block.
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it("under13 block forbids romance and violence content", () => {
    const block = renderAudienceAgeRatingBlock("under13");
    expect(block).toContain("CHILDREN UNDER 13");
    expect(block).toMatch(/NO romantic or sexual content/i);
    expect(block).toMatch(/NO violence/i);
  });

  it("13plus block allows emotional romance but forbids explicit sexual content", () => {
    const block = renderAudienceAgeRatingBlock("13plus");
    expect(block).toContain("TEENS 13 AND OVER");
    expect(block).toMatch(/emotional romance/i);
    expect(block).toMatch(/NOT sexually explicit/i);
  });

  it("18plus block allows mature, intense drama", () => {
    const block = renderAudienceAgeRatingBlock("18plus");
    expect(block).toContain("ADULTS 18 AND OVER");
    expect(block).toMatch(/Mature, intense drama is allowed/i);
    expect(block).toMatch(/passionate romance/i);
  });

  it("falls back to the 18plus block for an unrecognized value cast through the type", () => {
    // Exercises the `default:` branch of the switch (defensive coverage for
    // a value that slips past the type system, e.g. a legacy DB row).
    const block = renderAudienceAgeRatingBlock(
      "unknown" as unknown as AudienceAgeRating,
    );
    expect(block).toBe(renderAudienceAgeRatingBlock("18plus"));
  });
});
