# Section 02: Router Context and Persistence

## Objective

Wire the section-01 contracts through preview, direct portrait, and direct Character Sheet
routes and persist the selected DNA atomically at the correct lifecycle point.

## Ownership

Primary files:

- `apps/web/server/routers/verticalDramaCharacters.ts`
- `apps/web/server/routers/__tests__/verticalDramaCharacters.characterDna.test.ts` (new)
- existing focused router tests only when their fixtures/contracts require additive updates

Do not edit the skill, shared schema, prompt service, or client in this section.

## Implementation contract

1. Load owned series/character exactly as today before assembling context.
2. Pass context into all LLM-generating paths.
3. Preview returns `approvedDesignSnapshot` and original prompt correlation data without
   writing the database.
4. Add an optional validated approved snapshot to the portrait-confirm input.
   Use explicit maximum string and array sizes and correlate it to the target character key;
   do not accept an unbounded passthrough object from the browser.
5. For direct portrait/sheet generation, use the just-generated validated snapshot.
6. Persist only after `generateImageAsync` returns a task successfully.
7. Perform an atomic nested `data.visualBible` JSONB update scoped by tenant/user/series/id.
8. Approved prompt without snapshot stays backward compatible and does not persist.
9. A preview snapshot must correlate to the current character key.
10. Catch post-submit persistence failure and return a non-fatal warning with the task ID.
11. Never retry or resubmit the media task after persistence failure.

## TDD expectations

Write route/helper tests before handler changes. Prefer exported pure persistence/context
helpers where that avoids bootstrapping the entire router, but keep ownership checks in real
route tests. Mock paid/media boundaries and assert call counts.

## Acceptance checks

- Preview: context yes, persistence no.
- Direct portrait: one LLM call, one media submit, one nested persistence update.
- Approved portrait: zero LLM calls; persistence only with valid matching snapshot.
- Direct sheet: one LLM call and persistence after submit.
- Submission failure: zero persistence.
- Persistence failure: task ID returned plus warning.
- No sibling JSONB key can be overwritten.
- Existing custom-instruction, model selection, sheet type, reference image, and credit
  behavior remain unchanged.

## Security checks

- Historical context is tenant+owner scoped.
- Snapshot schema validation is strict enough to prevent arbitrary large JSON payloads.
- Character correlation prevents accidentally persisting another preview's DNA.
- Existing rate limits and owned-row guards remain first-class.

## Implementation result

Status: complete.

- Preview, direct portrait, and direct Character Sheet all receive bounded design context.
- Preview returns a strict snapshot and never persists it.
- Unchanged confirmation persists its correlated snapshot without a second LLM call;
  edited and legacy approved prompts render without persisting stale DNA.
- Direct portrait/sheet persist the validated generated snapshot only after media-task
  submission succeeds.
- Persistence uses one owner-scoped atomic `jsonb_set` of `data.visualBible`, preserving
  every sibling JSONB field.
- Post-submit persistence failure returns the original task plus a warning and never
  retries, resubmits, or refunds that already-submitted task.
