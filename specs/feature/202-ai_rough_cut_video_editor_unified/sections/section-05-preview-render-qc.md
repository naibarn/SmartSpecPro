# Section 05 — Preview, render, QC, and artifact UX

## Objective

Keep preview, Full Scan, and final render on the same source/revision/plan
identity, and expose QC/artifact commit truthfully.

## Files and ownership

- Existing editor render/handoff/panel components under
  `apps/web/client/src/components/videoeditor/`.
- Existing shared render handoff helpers and focused tests.
- Use Spec 203 artifact/QC service; do not create a second artifact store.

## Behavior

- Source path and canonical plan hash are identical across preview/scan/render.
- Progress stages and cancel are visible; stale results cannot attach to a
  newer revision.
- QC warning/error states are distinct; final artifact is visible only after
  server commit and project link.
- Restore/rollback returns to a known revision without deleting history.

## TDD and acceptance

Test source/plan parity, progress/cancel, stale artifact fencing, QC warning vs
error, commit visibility, and restore. Browser evidence covers final artifact
and blocked/stale states.

## UI/UX Contract

Use a live region for progress, visible focus for cancel/review, non-color QC
severity, responsive panel collapse, Thai-first actionable copy, and reduced
motion. No completed label before artifact commit.

### Target User / JTBD
Editor needs preview and final output whose source and revision are trustworthy.

### Surface Inventory
Preview player, render panel, progress, QC, artifact, restore/rollback controls.

### Component Map
Render services own truth; handoff owns transport; panel owns progress/QC/artifact.

### State Matrix
Previewing, rendering, uploading, QC warning/error, commit pending, completed,
stale, canceled, failed, restore.

### Responsive Matrix
Mobile status-first; tablet/laptop player plus panel; desktop full detail.

### Accessibility Acceptance
Live progress, keyboard cancel/restore, semantic QC severity, focus, reduced
motion, and no color-only success.

### Copy Contract
Thai-first distinction between rendering, verifying, committed, and failed.

### Browser Evidence Required
Authenticated preview/render/QC/commit/stale/restore evidence.
