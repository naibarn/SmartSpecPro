# Decision Log

## Planning depth

- Depth: standard quick-plan
- Reason: three implementation domains are involved, but each change is
  localized, uses existing contracts, and requires no schema/API redesign.
- Promotion trigger: promote only if the existing split-clip contract cannot
  carry the authoritative start-frame ID without changing its public shape.

## Decisions

1. `startFramePlan.frames[].approvedMediaAssetId` is authoritative at render
   time.
2. Persisting the projection and reconciling at submission are both required:
   the first keeps state coherent; the second protects existing and stale data.
3. Existing `.img` assets are retained unchanged.
4. Format detection belongs in the Worker collection boundary, where bytes are
   already available and validated.
5. `File type not supported` is terminal because retrying an unchanged payload
   cannot succeed.

## Self-review stabilization

- Round 1: [AUTO-FIX] Added split-clip persistence coverage.
- Round 2: [AUTO-FIX] Added stale projected-ID override coverage, not only
  missing-ID coverage.
- Round 3: [AUTO-FIX] Kept legacy no-approved-frame behavior explicit.
- Round 4: clean; completeness, contradictions, security, and obvious missing
  improvements checked.
- Round 5: clean; cross-section ownership and verification commands checked.

