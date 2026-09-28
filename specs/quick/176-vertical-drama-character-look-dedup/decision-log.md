# Decision log

## 2026-08-30

- Chose stable canonical intent for deduplication while retaining the
  context-rich request key for design evidence.
- Added legacy label/intent fallback because older user-created rows may not
  contain `lookSemanticKey` or `lookRequestKey`.
- Candidate selection prefers portrait readiness, then system provenance, then
  stable row order so reuse does not depend on nondeterministic array order.
- Kept the change migration-free and did not auto-clean existing duplicates.

## Self-review

- Scope: limited to shared look matching plus the existing episode persistence
  boundary and focused tests.
- Safety: variant type and parent id remain required; all DB reads/writes keep
  existing tenant/user/series predicates.
- Compatibility: request keys and manual overrides remain unchanged; reused
  user rows are not updated.
- Missing proof: live database and browser behavior are not available from the
  current local context and must not be claimed as verified.
