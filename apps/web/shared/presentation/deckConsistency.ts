/**
 * Deck-Level Consistency Evaluator (Spec 014 — Section 07)
 *
 * Checks adjacent slide mode coherence and penalizes incoherent
 * mode oscillation within a presentation deck.
 *
 * v1 heuristics from kickoff-defaults.md §4:
 *   1. No more than 1 full_slide_media in any 3-slide window (unless deck starts with cover).
 *   2. Prefer staying within the current layout family for adjacent slides.
 *   3. Avoid alternating full_slide_media ↔ dense text back-to-back without explicit reason.
 *   4. sectioned-explainer, article-focus, two-column-article, faq-stack, timeline-report, and profile-board are compatible long-form neighbors.
 */

import type { PresentationAILayoutMode } from "./contentProfile";

export interface DeckConsistencySlideInput {
  slideIndex: number;
  mode: PresentationAILayoutMode;
  modeLocked?: boolean;
  recipeId?: string;
}

export interface DeckConsistencyWarning {
  slideIndex: number;
  rule: string;
  severity: "warning" | "info";
  message: string;
}

export interface DeckConsistencyResult {
  score: number;
  warnings: DeckConsistencyWarning[];
}

const COMPATIBLE_LONG_FORM_RECIPES = new Set([
  "sectioned-explainer",
  "article-focus",
  "two-column-article",
  "faq-stack",
  "timeline-report",
  "profile-board",
]);

const MODE_FAMILIES: Record<PresentationAILayoutMode, string> = {
  structured_block: "structured",
  long_form_block: "long_form",
  llm_layout_dsl: "custom",
  full_slide_media: "media",
};

/**
 * Evaluate deck-level consistency across an ordered list of slides.
 *
 * Returns a score 0–1 (1 = fully consistent) and any warnings.
 */
export function evaluateDeckConsistency(
  slides: DeckConsistencySlideInput[],
): DeckConsistencyResult {
  if (slides.length <= 1) {
    return { score: 1, warnings: [] };
  }

  const warnings: DeckConsistencyWarning[] = [];
  let penalties = 0;
  const maxPenalties = Math.max(1, slides.length - 1);

  // Rule 1: No more than 1 full_slide_media in any 3-slide window
  // Exception: deck starts with a cover slide (index 0 is full_slide_media)
  const startsWithCover = slides[0]?.mode === "full_slide_media";
  for (let i = 0; i <= slides.length - 3; i++) {
    const window = slides.slice(i, i + 3);
    const mediaCount = window.filter((s) => s.mode === "full_slide_media").length;
    const threshold = startsWithCover && i === 0 ? 2 : 1;
    if (mediaCount > threshold) {
      warnings.push({
        slideIndex: window[window.length - 1].slideIndex,
        rule: "full_slide_media_density",
        severity: "warning",
        message: `${mediaCount} full-slide media slides in a 3-slide window (slides ${window.map((s) => s.slideIndex + 1).join(", ")}). Max ${threshold} recommended.`,
      });
      penalties += 0.5;
    }
  }

  // Rule 2 & 3: Adjacent slide family oscillation
  let oscillationCount = 0;
  for (let i = 1; i < slides.length; i++) {
    const prev = slides[i - 1];
    const curr = slides[i];
    const prevFamily = MODE_FAMILIES[prev.mode];
    const currFamily = MODE_FAMILIES[curr.mode];

    if (prevFamily === currFamily) continue;

    // Compatible long-form neighbors are okay
    if (
      prevFamily === "long_form" && currFamily === "long_form" &&
      COMPATIBLE_LONG_FORM_RECIPES.has(prev.recipeId ?? "") &&
      COMPATIBLE_LONG_FORM_RECIPES.has(curr.recipeId ?? "")
    ) {
      continue;
    }

    // Locked modes get a pass
    if (prev.modeLocked || curr.modeLocked) continue;

    // full_slide_media ↔ dense text is the worst oscillation
    if (
      (prev.mode === "full_slide_media" && (curr.mode === "long_form_block" || curr.mode === "structured_block")) ||
      (curr.mode === "full_slide_media" && (prev.mode === "long_form_block" || prev.mode === "structured_block"))
    ) {
      oscillationCount++;
      if (oscillationCount > 2) {
        warnings.push({
          slideIndex: curr.slideIndex,
          rule: "mode_oscillation",
          severity: "warning",
          message: `Slides ${prev.slideIndex + 1}→${curr.slideIndex + 1} oscillate between ${prev.mode} and ${curr.mode} without explicit lock. ${oscillationCount} switches so far.`,
        });
        penalties += 0.3;
      }
    } else {
      // Mild family switch
      oscillationCount++;
      if (oscillationCount > 2) {
        warnings.push({
          slideIndex: curr.slideIndex,
          rule: "family_switch",
          severity: "info",
          message: `Slide ${curr.slideIndex + 1} switches from ${prevFamily} to ${currFamily} family.`,
        });
        penalties += 0.1;
      }
    }
  }

  const score = Math.max(0, Math.min(1, 1 - (penalties / maxPenalties)));
  return {
    score: Number(score.toFixed(3)),
    warnings,
  };
}
