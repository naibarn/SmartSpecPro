# Plan Self-Review — Round 2

## Scorecard

| Category | Score | Result |
|---|---:|---|
| Structural integrity | 5/5 | All named boundaries have owners |
| Completeness vs spec | 5/6 | Rollout capability keys were not named |
| Implementability | 5/6 | Migration and feature flags were described but not normalized |
| Internal consistency | 4/4 | Shared names and modes align |
| Edge cases/failure modes | 4/4 | Lifecycle, stale state, and optional failures covered |
| **Total** | **23/25** | **Needs one fix** |

## Finding and fix

The plan required independent fail-closed flags but did not give stable names,
which could lead to different client/server behavior. Add canonical keys
`objectCatalog`, `objectDetection`, `objectImageGeneration`, and
`objectLegacyBackfill` to the shared capability contract and use the same keys
in router responses, UI gating, migration checks, and release evidence.

This fix is applied before the next round.
