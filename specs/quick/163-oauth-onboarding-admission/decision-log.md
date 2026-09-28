# Decision log

## Depth

Use `micro` quick-plan depth. The change is a single admission predicate plus
focused regression coverage; no schema, provider, UI, or migration work is
needed.

## Decision

Make `isOAuthRegistrationPending(user)` the only input to the onboarding
decision. Remove the signed new-user claim from that predicate. Retain the
claim in the surrounding flow only for narrowly-scoped cleanup of a newly
created pending row.

## Self-review rounds

1. Completeness: covers the observed failure and both completed/pending paths.
2. Contradictions: does not disable invite-only registration or alter the new
   user insertion branch.
3. Security: incomplete rows remain fail-closed; no ownership or tenant is
   invented.
4. Regression: adds the missing completed-row-with-claim test.
5. Operational: application-only patch; production deployment remains a
   separate explicitly bounded action.
