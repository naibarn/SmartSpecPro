# Section 03 — Provider mutation cache invalidation

## Ownership

Own `apps/web/server/routers/mediaProviders.ts` and focused provider-router
tests. Coordinate only through the exported `clearModelCache` call.

## Work

- Clear the model registry cache after provider create, update, and delete.
- Keep key encryption, provider validation, and response redaction unchanged.
- Ensure an enable/disable update is reflected on the next registry read.

## TDD expectations

- Mock `clearModelCache` and assert it runs after successful mutations.
- Assert failed mutations do not claim successful cache refresh.
- Reuse existing provider persistence tests; do not add provider-schema changes.

## Acceptance checks

- No stale recommended catalog remains solely because the registry TTL has not
  expired.
- Provider mutation responses remain backward compatible.

## Risks

- Avoid circular imports; use the existing model registry export.
- Do not clear unrelated skill or application caches unless current code shows
  they are required for this catalog contract.

## Implemented

- Provider create, update, and delete now clear the model registry cache.
