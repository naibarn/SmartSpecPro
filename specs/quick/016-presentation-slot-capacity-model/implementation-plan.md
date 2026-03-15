## Objective

Introduce a reusable language-aware slot capacity model that:

- derives Thai and English guidance from existing slot budgets
- clamps generated text using weighted text capacity instead of raw character count alone
- exposes concise capacity hints in Presentation Edit

## Current-Codebase Fit

- Builds on `PRESENTATION_COMPONENT_SLOT_BUDGETS` instead of replacing it
- Reuses current slot-based editing flow
- Avoids schema migrations

## Affected Files

- `apps/web/shared/presentation/componentRecipes.ts`
- `apps/web/shared/presentation/componentRecipeSlotBindings.ts`
- `apps/web/client/src/presentation-canvas/components/ComponentInspector.tsx`
- test files under shared/client presentation areas

## Approach

1. Add shared helpers to estimate slot capacity for English and Thai from the existing budget.
2. Add a weighted text-unit clamp so Thai copy is handled more realistically than raw `.length`.
3. Show concise slot guidance in the inspector for text and list slots.

## Risks And Mitigations

- Risk: Thai clamp becomes too strict.
  Mitigation: keep current `maxChars` as the base unit budget and weight Thai only moderately.
- Risk: UI clutter.
  Mitigation: show short helper text under each editable slot only.

## Acceptance Criteria

- Every built-in component slot with `maxChars` can expose English and Thai guidance.
- AI slot binding clamping uses the new weighted capacity helper.
- The inspector shows clear per-slot guidance for editable text/list slots.

