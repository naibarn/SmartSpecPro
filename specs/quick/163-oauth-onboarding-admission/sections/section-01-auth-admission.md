# Section 01: OAuth admission predicate

## Ownership boundary

Own only the OAuth onboarding helper, its single server call site, and focused
tests. Do not alter provider configuration, schema, registration policy, or
production data.

## TDD expectations

The completed OAuth row with a true new-user claim must be covered first and
must fail against the old implementation. Pending rows must continue to return
true.

## Acceptance checks

- A completed row bypasses the invite-only onboarding branch.
- A pending OAuth row remains fail-closed through existing registration checks.
- Existing cleanup behavior still has access to the separate new-user claim.
