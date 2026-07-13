# Section 03 — Storyboard Revision Safety

## Ownership

Shared Vertical Drama JSON contracts/helpers, storyboard persistence paths,
episode detail/use gates, stale UI state/copy, and focused tests.

## TDD

Prove regeneration changes revision, preserves but marks downstream artifacts,
blocks paid use of stale/legacy artifacts, and clears stale state after
regeneration against the current revision.

## Implementation

- Compute a deterministic canonical storyboard revision.
- Add additive source revision/stale metadata to derived artifacts.
- Atomically mark existing derived artifacts stale on storyboard replacement.
- Expose stale state and actionable Thai/English copy; block paid actions.

## UI/UX Contract

- User/JTBD: know whether displayed/generated media belongs to the current
  storyboard and recover without losing prior work.
- Surface: episode storyboard shot cards and paid generation actions.
- States: current, stale (`storyboard_changed`), legacy/unknown, regenerating,
  reconciled, error.
- Responsive/accessibility: existing card layout; warning text plus semantic
  status, keyboard-reachable regenerate action, no color-only signal.
- Copy: concise Thai/English warning explaining old content is preserved and
  must be regenerated; localization fallback to English.
- Browser evidence: focused component test is required; screenshot/manual
  route verification if the dev route is available.

## Acceptance

No old artifact is deleted or silently used as current.

