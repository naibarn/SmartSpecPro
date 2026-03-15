## Codebase Scan

- `componentRecipes.ts` is the source of truth for built-in component ids, slot budgets, slot targets, and layout metadata.
- `componentRecipeSlotBindings.ts` clamps AI-generated narrative content against slot budgets before creating slot bindings.
- `ComponentInspector.tsx` is the most direct UI surface for showing slot editing guidance to users.
- `getPresentationComponentCanvasSlotAreas()` already maps slot ids to rendered bounds and could expose more metadata later if needed.

## Current Gaps

- `maxChars` is language-agnostic.
- Thai text is clamped using the same raw `.length` logic as English text.
- The editor does not surface per-slot capacity guidance.

## Existing Fit

- Current metadata already includes `preferredLines`, which is useful for UI hints.
- Shared tests already validate that every component has budgets and that slot binding output is bounded.
- This task fits as a shared utility enhancement rather than an architectural change.

## Risks

- Overly aggressive Thai weighting could over-truncate existing content.
- UI hints can become noisy if shown for every slot without concise formatting.

## Mitigation

- Keep English capacity aligned with existing `maxChars`.
- Derive Thai guidance conservatively from weighted text units instead of replacing all budgets wholesale.
- Surface concise hints in the inspector only.

