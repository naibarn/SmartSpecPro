# Adversarial Self-Review — Round 1

## Findings

1. **Status expansion can regress the existing reconciler.** The current ledger reconciler knows `active`, `stalled`, and `resolved`. If `parked`, `sequel_hook`, or `legacy_unknown` are added without an explicit transition table, a later reconciliation pass could treat them as active and re-open them. The plan must require status-preserving transitions and regression tests for every non-active terminal/review status.
2. **Legacy fallback IDs are not canonical identities.** Existing fallback paths can derive episode-specific IDs from `open_loops`. The migration must classify these as legacy observations unless they match a registered opening; it must not promote their strings into the new durable ledger automatically.
3. **The UI surface is split across two memory concepts.** The plan correctly reuses both tabs, but the implementation must keep the materialized state tab and append-only event-log tab distinct and link them by evidence/event ID rather than combining their writes.
4. **The seed/ledger boundary needs a testable contract.** The plan now requires a seed, but the implementation must prove that a ledger planner output cannot replace the approved breakdown. Add a fixture where the seed conflicts with the breakdown and expect review state with no outline mutation.

## Resolution

Findings 1–4 are high-confidence fixes and are incorporated into the implementation plan. No user decision is needed because they preserve the requested safety and existing ownership boundaries.
