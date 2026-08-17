# Decision log

- Depth: standard quick plan. The work spans shared JSON contracts, router/service
  behavior, UI workflow, and tests, but needs no migration or new subsystem.
- Use a human-confirmed ordered key list rather than a second AI opinion. Two
  vision calls can agree on the same wrong identity; the user can inspect the
  actual frame and stable portraits directly.
- Gate every physical multi-character shot. Solo flows remain compatible;
  silent multi-character clips are also blocked at paid render so legacy data
  cannot bypass the identity guard.
- Bind the lock to the exact active video anchor asset, not merely the shot.
- Resolve canonical display names to stable keys before split decisions,
  reference lookup, prompt assembly, and persistence.

## Stabilization rounds

1. [AUTO-FIX] Added paid-render revalidation; prompt-only validation would still
   permit an old clip after the image changes.
2. [AUTO-FIX] Added invalidation on cast membership changes and video-anchor
   changes, not only approved-image replacement.
3. [AUTO-FIX] Required exact set equality and uniqueness to prevent duplicate or
   omitted slot assignments.
4. Clean: completeness, contradictions, security boundaries, and obvious missing
   improvements checked; no material change.
5. Clean: UI state, localization copy, stale-data behavior, and regression proof
   checked; no material change. Stop after two consecutive clean rounds.
