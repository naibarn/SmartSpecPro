# Section 06 — Product acceptance and rollout

## Objective

Integrate all product sections, verify the Web Video Editor contract, and
document unsupported capabilities and external proof gates.

## Files and ownership

- Focused Web/router/service tests touched by sections 01–05.
- Feature implementation completion/review documentation in this directory.
- Browser evidence checklist and rollout/rollback notes.

## Required checks

- Open/save/autosave conflict and legacy route.
- Full Scan Node/degraded, capability-blocked, waiting-agent, completed, and
  promotion-rejection states.
- Change-set review/apply/reject/undo/redo and protected ranges.
- Preview/render/QC/final artifact and stale-result fencing.
- Thai/English copy, keyboard/focus, responsive state matrix, and reduced motion.
- Explicit gates for Windows Worker, deployment, and production artifacts.

## Acceptance

No feature is marked complete solely because a worker row exists. Every
unsupported module has a visible release/capability gate, and all tests are
focused and reproducible under repository memory constraints.

## UI/UX Contract

This section owns the browser evidence matrix: mobile, tablet, laptop, and
desktop; loading, empty, blocked, degraded, conflict, review, success, and
error; keyboard, screen-reader/live-region, contrast, and reduced-motion
acceptance. Evidence must be authenticated and tied to revision/job IDs.

### Target User / JTBD
Release owner needs reproducible proof of the real editor workflow.

### Surface Inventory
Authenticated browser matrix, feature flag, rollback route, completion record.

### Component Map
Focused tests, browser evidence, rollout flags, and implementation documents.

### State Matrix
Pass, blocked, unsupported, degraded, conflict, rollback, external-proof-pending.

### Responsive Matrix
Mobile/tablet/laptop/desktop evidence where the changed surface is visible.

### Accessibility Acceptance
Keyboard, focus, labels, live status, contrast, reduced motion, and semantic
severity are recorded in evidence.

### Copy Contract
Completion distinguishes tested, manually verified, and not proven.

### Browser Evidence Required
Authenticated evidence for all required state and responsive matrices.
