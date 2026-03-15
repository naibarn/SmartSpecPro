# Implementation Plan

## Objective

Raise auto-draft output quality by fixing persisted slide JSON for:
- missing images on slides that should be visual,
- repeated low-quality overlay layouts,
- long text escaping or visually fighting its block family.

## Approach

1. Use deck 55 as the regression target and classify broken slides by saved recipe/mode/media binding.
2. Tighten recipe family selection so dense informational slides do not all collapse to `sectioned-explainer`.
3. Prefer split/article layouts over image-overlay fallback when the slide has media plus long text.
4. Guarantee a media-aware fallback when a deck slide is expected to be visual but the chosen recipe is text-only and would otherwise persist without an image.
5. Add regression tests around recipe diversity, image persistence, and visible-layout note/text preservation.

## Risks

- Overcorrecting selection heuristics may break existing good recipe tests.
- Forcing media can harm genuinely text-only slides if applied too broadly.

## Mitigations

- Gate the new logic with content-profile signals and persisted media availability.
- Add focused tests for deck-like health/education content and preserve existing passing recipe tests.

## Acceptance Criteria

- Auto-draft no longer produces the deck-55 pattern of nearly all slides in `sectioned-explainer`.
- Slides with available generated media do not persist as visually blank/text-only by accident.
- Dense article-style content prefers split/article presentation rather than overlaying large text blocks over the full image by default.
