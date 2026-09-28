# Section 01 — continuity contract

## Ownership

Shared continuity validation and its focused tests.

## Targets

- `apps/web/shared/verticalDramaSeries/storyContinuity.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryContinuity.test.ts`

## TDD

- Add due-thread red tests before implementation.
- Keep season carry-over and same-episode resolution behavior unchanged.

## Acceptance

The validator reports exact thread ID, opening episode, due episode, and current episode without inventing a resolution.

## Risks

Legacy memories may omit expected-resolution metadata; preserve existing season-boundary behavior for those records.
