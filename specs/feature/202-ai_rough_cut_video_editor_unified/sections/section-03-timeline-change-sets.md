# Section 03 — Timeline, EDL, change sets, undo/redo, protected ranges

## Objective

Map product EDL/Rough Cut intent into Spec 203 executable plans and apply
non-destructive change sets safely to the canonical timeline.

## Files and ownership

- Existing canonical NLE conversion/timeline modules under
  `packages/shared/src/video-editor/`.
- Web timeline/Transcript components under
  `apps/web/client/src/components/videoeditor/`.
- New server change-set service/tests only where the current path has no
  revision-bound application boundary.

## Behavior

- Use canonical time and stable source anchors; legacy millisecond inputs are
  adapted once.
- Change sets include deterministic operation IDs, expected revision, inverse
  metadata, protected-range checks, and unsupported metadata preservation.
- Apply/reject/undo/redo are revision-safe and idempotent.
- Linked audio/video, ripple/gap, clip bounds, and stale evidence are validated
  before mutation.

## TDD and acceptance

Test EDL mapping, apply/reject, protected ranges, undo/redo, linked A/V,
canonical timing, invalidated evidence, and unknown metadata preservation.

## UI/UX Contract

Change-set review shows before/after summary, protected/skipped operations,
confidence and evidence refs. States include draft, selected, applying,
conflict, rejected, applied, and undo available. Keyboard shortcuts are
announced and reduced motion is respected.

### Target User / JTBD
Editor needs safe, reviewable, reversible AI edits on the timeline.

### Surface Inventory
Timeline, transcript anchors, change-set review, protected-range markers,
undo/redo controls.

### Component Map
Compiler/change-set service owns operations; timeline renders; review controls
own apply/reject/undo.

### State Matrix
Draft, selected, applying, conflict, rejected, applied, undo available, blocked.

### Responsive Matrix
Mobile review summary; tablet split timeline/review; desktop full inspector.

### Accessibility Acceptance
Keyboard timeline and review actions, focus preservation, semantic summaries,
and reduced motion.

### Copy Contract
Thai-first before/after and protected-range explanation with English fallback.

### Browser Evidence Required
Authenticated change-set review/apply/reject/undo evidence.
