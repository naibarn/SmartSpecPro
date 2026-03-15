import { describe, expect, it } from "vitest";

import {
  evaluateDeckConsistency,
  type DeckConsistencySlideInput,
} from "./deckConsistency";
import type { PresentationAILayoutMode } from "./contentProfile";

function slide(
  mode: PresentationAILayoutMode,
  index: number,
  recipeId?: string,
): DeckConsistencySlideInput {
  return { slideIndex: index, mode, recipeId };
}

describe("evaluateDeckConsistency", () => {
  it("returns perfect score for an empty deck", () => {
    const result = evaluateDeckConsistency([]);
    expect(result.score).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns perfect score for a single slide", () => {
    const result = evaluateDeckConsistency([slide("structured_block", 0)]);
    expect(result.score).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns perfect score for uniform structured_block deck", () => {
    const result = evaluateDeckConsistency([
      slide("structured_block", 0),
      slide("structured_block", 1),
      slide("structured_block", 2),
      slide("structured_block", 3),
    ]);
    expect(result.score).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when full_slide_media appears more than once in a 3-slide window", () => {
    // Start with structured_block so cover exception doesn't apply
    const result = evaluateDeckConsistency([
      slide("structured_block", 0),
      slide("full_slide_media", 1),
      slide("full_slide_media", 2),
    ]);
    expect(result.score).toBeLessThan(1);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ rule: "full_slide_media_density" }),
    );
  });

  it("does not warn when full_slide_media slides are spaced far apart", () => {
    const result = evaluateDeckConsistency([
      slide("full_slide_media", 0),
      slide("structured_block", 1),
      slide("structured_block", 2),
      slide("structured_block", 3),
      slide("full_slide_media", 4),
    ]);
    const densityWarnings = result.warnings.filter(
      (w) => w.rule === "full_slide_media_density",
    );
    expect(densityWarnings).toHaveLength(0);
  });

  it("detects mode oscillation after threshold", () => {
    // Need 3+ switches to trigger warning (oscillationCount > 2)
    const result = evaluateDeckConsistency([
      slide("structured_block", 0),
      slide("full_slide_media", 1),
      slide("structured_block", 2),
      slide("full_slide_media", 3),
      slide("structured_block", 4),
    ]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ rule: "mode_oscillation" }),
    );
  });

  it("treats compatible long-form recipes as non-oscillating", () => {
    const result = evaluateDeckConsistency([
      slide("long_form_block", 0, "sectioned-explainer"),
      slide("long_form_block", 1, "two-column-article"),
      slide("long_form_block", 2, "profile-board"),
    ]);
    const oscillationWarnings = result.warnings.filter(
      (w) => w.rule === "mode_oscillation" || w.rule === "family_switch",
    );
    expect(oscillationWarnings).toHaveLength(0);
  });

  it("score decreases with more warnings", () => {
    const clean = evaluateDeckConsistency([
      slide("structured_block", 0),
      slide("structured_block", 1),
    ]);
    // Heavy oscillation to trigger warnings
    const oscillating = evaluateDeckConsistency([
      slide("structured_block", 0),
      slide("full_slide_media", 1),
      slide("structured_block", 2),
      slide("full_slide_media", 3),
      slide("structured_block", 4),
      slide("full_slide_media", 5),
    ]);
    expect(oscillating.score).toBeLessThan(clean.score);
  });
});
