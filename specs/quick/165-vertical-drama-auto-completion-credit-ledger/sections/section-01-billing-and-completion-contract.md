# Section 01 — billing and completion contract

## Ownership

Shared Vertical Drama billing helper, effective-model propagation, canonical episode completeness predicate, and story-job checkpoint types.

## Target areas

- `apps/web/server/services/creditService.ts`
- new focused Vertical Drama billing/completion service under `apps/web/server/services/`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- shared schemas/types only if required

## TDD expectations

Write failing tests for exact slug, actual model, per-attempt idempotency, and dialogue/shot completeness before changing callers.

## Acceptance checks

Every real response is billed before acceptance; same key is idempotent; distinct repair round is charged; no missing dialogue is classified as complete.

## Risks

Do not change fixed skill revenue semantics or infer a model from the UI after the provider call. Use the returned effective model.
