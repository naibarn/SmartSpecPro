# Spec 207 TDD Plan

Tests are written before implementation and run with focused Vitest commands.

## Section 1

- Reject non-integer/negative/unsupported-currency money.
- Accept server-derived tenant/actor context and preserve Job/attempt IDs.
- Deny payload tenant/actor overrides and replay the same idempotency key.

## Section 2

- Migration/schema tests assert required tables, unique keys and balance
  constraints.
- Ledger tests reject unbalanced, cross-tenant and duplicate journal writes.
- Concurrent insert/replay tests yield one canonical transaction.

## Section 3

- State-transition tests cover reserve, capture, release, reversal and illegal
  transitions.
- Outbox replay and late provider receipt tests prove idempotency and
  reconciliation-required behavior.

## Section 4

- Policy precedence tests cover tenant, project, user, agent and workflow caps.
- Revenue attribution tests prove stable publisher/tenant/job correlation.

## Section 5

- Router tests prove authenticated tenant isolation, redaction and freeze.
- Audit tests prove actor, policy version, idempotency and correlation fields.

## Section 6

- Compatibility tests cover existing Credits/skill paths through adapters.
- Migration dry-run/backfill tests prove repeatability and feature-off safety.

