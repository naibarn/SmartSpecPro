# Section 04 — Focused Verification

## Ownership

Own integration review, focused tests, and final evidence. Do not introduce
unrelated cleanup or broad formatting.

## Checks

Run from the repository root:

```bash
npm --workspace apps/web test -- --run \
  shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.sceneVisualStates.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.sceneVisualStateMutations.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaSceneLockRow.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx
```

Also run a bounded type/lint check appropriate to the touched files if the
repository supports it. Inspect `git diff --stat` and targeted diffs; do not
stage unrelated dirty files.

## Browser evidence

If authenticated browser tooling is available, verify the Location panel with
Scene Continuity enabled: initial collapsed state, explanatory copy, expansion,
sleep-surface edit, save confirmation, refresh, two affected shots marked stale,
and old images still previewable. If browser access is unavailable, report that
boundary explicitly.

## Acceptance

- All focused tests pass.
- No unrelated files are modified by this feature.
- Feature flag off remains behaviorally unchanged.
- No deployment/provider/production claim is made without evidence.

## UI/UX Contract

### Target User / JTBD

Author needs visible proof that a shared scene correction reached all intended
shots without destroying existing media.

### Surface Inventory

Location Inspector, affected-shot indicators, and retained image previews.

### Component Map

Focused UI tests cover `VerticalDramaSceneLockRow` and
`VerticalDramaStoryboardPanel`; browser smoke covers the integrated page.

### State Matrix

Verify disabled, empty, expanded, saving, success, stale, conflict, and error
states in tests or browser evidence.

### Responsive Matrix

Verify desktop and narrow-width stacking with no storyboard horizontal overflow.

### Accessibility Acceptance

Verify labels, keyboard expansion/save/cancel, focus visibility, and text-based
status/error announcements.

### Copy Contract

Verify the approved Thai title, purpose, field helpers, and save warning are
present; do not replace them with technical-only labels.

### Browser Evidence Required

Authenticated browser smoke is required when available; otherwise report its
absence explicitly in the final handoff.
