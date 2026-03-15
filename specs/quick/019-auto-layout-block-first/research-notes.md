# Research Notes

## Current State
- `Auto Layout` dialog still exposes legacy template choices in `PresentationEditor.tsx`
- Auto-layout relayout payload can send either `templateId` or `componentRecipeId`
- Relayout server path already scores built-in component recipes, but if none clears threshold it falls back to plain templates
- Client-side rebuild path already auto-fits A4 built-in components to canvas

## Key Findings
- Hiding template options in the dialog is a client-only change
- True block-first behavior requires server relayout selection changes, not just UI cleanup
- Current relayout recipe scoring is not canvas-aware because `resolveRelayoutComponentRecipeSelection()` calls `scoreAIComponentRecipes()` without canvas dimensions
- Existing built-in blocks cover most old template shapes closely enough for migration:
  - `hero_center` -> `poster-spotlight`
  - `split_left_image` / `split_right_image` -> `framed-image-story`
  - `top_image_text_bottom` / `bottom_image_text_top` -> `photo-collage`
  - `feature_boxes_right` -> `feature-highlights`

## Risks
- Some relayout tests currently assert `componentRecipeId` is undefined on fallback
- Over-aggressive block forcing could choose media-heavy blocks when source media is missing
- User-facing warnings should stop mentioning `plain template`
