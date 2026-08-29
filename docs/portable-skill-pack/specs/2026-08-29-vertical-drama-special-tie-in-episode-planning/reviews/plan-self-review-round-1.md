# Plan self-review round 1

## Findings

- The plan described variable special shot handling but did not name a shared resolver at
  readiness/assembly boundaries. This could leave hard-coded normal loops in shared code.
- Model isolation needed to include shared browser preference state, not only server-side
  series memory.

## Fixes applied

Added `resolveVerticalDramaEpisodeShotContract(episodeKind)` to the shared foundation and
explicitly prohibited normal/shared browser model-memory hydration or writes.

## Scorecard

| Category | Result |
|---|---|
| Structural integrity | PASS |
| Completeness vs spec | PASS after fixes |
| Implementability | PASS |
| Internal consistency | PASS |
| Edge cases | PASS |
