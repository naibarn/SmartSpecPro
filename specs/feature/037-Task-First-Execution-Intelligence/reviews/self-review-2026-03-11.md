# Self Review 2026-03-11

Review mode: `self_review`

## Summary

The planning package is now internally consistent around:

- capability-first skill policy
- execution-time model resolution
- immutable step-attempt snapshots
- pricing/credit snapshots
- worker lease and reclaim semantics

## Issues closed in this pass

1. Clarified that `task_runs.planJson` is the immutable run-intent contract.
2. Removed resolved model duplication from the immutable run plan and kept snapshots at step-attempt scope.
3. Added catalog/capability snapshot identifiers for reproducible resolution replay.
4. Clarified that premium fallback approval occurs after candidate resolution but before opening the new attempt.
5. Expanded snapshot reason enums to cover override and hybrid/fixed policy cases.
6. Added approval/reservation carry-forward fields to step-attempt records.
7. Added a concrete `website_build` plan example.
8. Added a concrete `agency_swarm` plan example.
9. Added a reference sequence diagram for planner/resolver/reclaim flow.
10. Synced section-level planning artifacts with the updated architecture.

## Remaining non-blocking gaps

None identified in this self-review pass.
