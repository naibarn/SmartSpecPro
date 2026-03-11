# Integration Notes

## 2026-03-11 Self-Review Uplift

Applied follow-up improvements after deep-plan self-review:

1. Locked `task_runs.planJson` as immutable run-intent and separated execution enrichments into step-attempt/billing state.
2. Moved resolved model state fully to step-attempt scope so immutable run plans no longer duplicate execution snapshots.
3. Added catalog/capability snapshot identifiers to resolved model snapshots for reproducible replay and audit.
4. Added explicit approval timing for premium fallback and escalation flows, and separated approval policy from approval decision.
5. Expanded `ResolvedModelSnapshot.reason` so audit trails can distinguish fixed, hybrid, override, and quality-escalation paths.
6. Added approval/reservation context to step-attempt records.
7. Defined fail-closed behavior for incompatible stored plan versions.
8. Defined canonical profile ordering for approval escalation checks.
9. Defined canonical budget-band ordering and clarified run-level approval timestamp semantics.
10. Clarified that `preferredProviderId` is a hint, not a lock.
11. Synced implementation plan, TDD plan, and section summaries with capability-first model resolution.
12. Added concrete `website_build` and `agency_swarm` plan examples plus a sequence diagram for planner/resolver/reclaim flow.

Current status:

- planning package is considered complete for Phase 1 implementation work
