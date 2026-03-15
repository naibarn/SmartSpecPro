## TDD Strategy

### Priority Test Layers

1. Shared profiling and fit logic
2. AI routing and fallback orchestration
3. Recipe-aware slot compaction contracts
4. DSL validation/repair
5. Full-slide media routing metadata
6. Editor explanation and telemetry surfaces
7. User override/mode lock semantics
8. Golden-sample regression harness
9. Persistence/downgrade compatibility
10. Deck-level consistency behavior

### Suggested Test Files

- `apps/web/shared/presentation/contentProfile.test.ts`
- `apps/web/shared/presentation/layoutFit.test.ts`
- `apps/web/shared/presentation/componentRecipeSlotBindings.test.ts`
- `apps/web/shared/presentation/contracts.test.ts`
- `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- `apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/server/services/__tests__/aiPresentationRoutingEvaluation.test.ts`

### Required Regression Scenarios

1. Long Thai paragraph slide routes to long-form mode, not poster mode.
2. Recipe-aware compaction rewrites long text instead of only slicing.
3. Compact recipe overflow triggers fallback to long-form recipe.
4. Very dense sectioned content triggers split-slide behavior when needed.
5. DSL mode only accepts schema-valid bounded output.
6. Full-slide media mode records source narrative and mode-selection reason.
7. Existing compact slides still use compact block mode when appropriate.
8. User override locks the slide into the requested mode across relayout/regeneration.
9. Router refuses unsupported provider/mode combinations and downgrades cleanly.
10. Golden-sample Thai long-form cases show improved fit outcomes over baseline fixtures.
11. Persisted routing metadata downgrades safely for older slide/render paths.
12. Adjacent slides do not oscillate into incoherent mixed modes without an explicit reason.
13. Raw LLM responses are not persisted; only validated contract-shaped outputs are stored.
14. DSL outputs that exceed primitive or element budgets are rejected or repaired once, then downgraded.
15. Full-slide-media auto-routing is blocked when Thai text risk is `high`.
16. Quality thresholds trigger warn vs reject behavior at the documented fit-score boundaries.
