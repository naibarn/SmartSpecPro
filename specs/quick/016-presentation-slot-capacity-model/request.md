## Summary

Add a language-aware text capacity model for Presentation Edit blocks so each text slot can clearly communicate how much Thai or English copy it can safely hold.

## Context

- The current built-in presentation block system already defines `maxChars` and `preferredLines` per slot.
- Those budgets are treated as a single generic character cap, which is too coarse for Thai-heavy slides and makes long-form block tuning harder.
- The user wants slot-level clarity so text placement and future A4 full-page block design can be calculated more predictably.

## Likely Impacted Areas

- `apps/web/shared/presentation/componentRecipes.ts`
- `apps/web/shared/presentation/componentRecipeSlotBindings.ts`
- `apps/web/client/src/presentation-canvas/components/ComponentInspector.tsx`
- related shared/client tests

## Constraints

- Preserve existing built-in block behavior.
- Avoid a breaking schema change for component instances.
- Keep the first implementation lightweight enough to apply across all current blocks now.

## Assumptions

- Existing `maxChars` budgets remain the base capacity anchor.
- English capacity can stay close to current `maxChars`, while Thai capacity should be derived more conservatively.
- Capacity hints should be exposed in the editor inspector before adding larger A4 block families.

