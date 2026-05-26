# Review Findings

## Round 1
- Scope reviewed: planning artifact only, no product implementation.
- Inputs reviewed:
  - `orchestra/plan.md`
  - `orchestra/contracts.md`
  - `orchestra/backlog.md`
  - SocratiCode search/impact results recorded in `orchestra/plan.md`
- Findings:
  - No material correctness gaps in the plan for the requested workflow.
  - Residual product decision remains: whether infographic generation is manual per-card or automatic for all four cards.
  - Implementation gates are not run because no product code was edited in this pass.
- Stop reason: planning artifact reviewed; implementation deferred until user approval/product decision.

## Round 2
- Scope reviewed: implemented Production Director concept board, infographic generation wiring, generation defaults, planner skill guidance, and e2e updates.
- Findings:
  - No blocking correctness issues found after fixes.
  - Fixed typecheck issues where `productionGenerationDefaults` was declared after use and `capabilityIds` could include `undefined`.
  - Fixed e2e regression where the fullscreen dialog remained open before the workflow CTA assertion.
- Verification:
  - `npm run e2e:production-director` passed 25 tests.
  - `npm run check` passed.
- Residual risk:
  - The actual image-generation provider path was not called in tests; coverage verifies callback wiring and type safety, not provider execution.

## Round 3
- Scope reviewed: completeness review after implementation, focusing on async media task behavior, card regeneration state, model default persistence, accessibility, and shared ProductionSpace compatibility.
- Findings:
  - High: concept infographic generation can remain stuck as `generating` when `generateImageAsync` returns a queued task without an immediate URL. The card stores `infographicTaskId`, but it does not add/sync a local `generationTasks` entry or reconcile from media history back into `productionStoryConceptWizard`.
  - Medium: card-level regeneration preserves the previous card's `infographicUrl`, `infographicPrompt`, and status because `normalizeGeneratedStoryConcepts` intentionally carries base infographic fields forward. A regenerated concept can show an infographic created for the old concept.
  - Medium: `ProductionConceptCard` uses a `div role="button"` wrapper that contains nested buttons. This works in the current e2e path but is not ideal for keyboard and screen reader UX.
  - Low: `upgradeProductionSpaceSchema` does not copy top-level `generationDefaults`, so manual schema upgrade paths can drop the new contract field.
  - Low: browser screenshot evidence for mobile/tablet/desktop was not collected in this pass.
- Recommended fixes:
  - Track queued infographic tasks and reconcile by backend/provider task id from media history, or mark deferred status separately and expose "open queue/history".
  - Clear infographic metadata whenever a card concept is regenerated.
  - Refactor concept card selection into a dedicated select control or non-button article with separate actions.
  - Preserve `generationDefaults` in legacy/schema upgrade helpers and add a contract test.

## Round 4
- Scope reviewed: fixes for all Round 3 findings.
- Findings addressed:
  - Long-running infographic generation now stores `infographicTaskId`, backend task id, provider task id, submitted timestamp, and reconciles card status/result URL from the existing media history polling loop. The frontend does not mark a task failed by timeout; it waits for provider/backend failed or cancelled status.
  - Card-level regeneration now clears previous infographic task/url/status metadata so a new concept cannot display the prior concept's image.
  - Concept card selection now uses a real "Select concept" button inside an article-style card instead of a nested interactive `div role="button"`.
  - `upgradeProductionSpaceSchema` preserves `generationDefaults`, with server test coverage.
  - Browser evidence was refreshed through the existing Production Director Playwright gate.
- Verification:
  - `npm run check` passed.
  - `npm run e2e:production-director` passed 25 tests.
  - `npm test -- server/services/__tests__/productionSpaceService.test.ts` passed 35 tests.
  - `npm run e2e:production-director-browser` passed 24 tests.
  - `git diff --check` passed.
- Residual risk:
  - Provider execution itself is still not invoked in tests; reconciliation is covered through task id/status plumbing and existing queue/history patterns.
