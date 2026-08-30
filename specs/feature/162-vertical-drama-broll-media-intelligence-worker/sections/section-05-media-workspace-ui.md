# Section 05 — Media Workspace and nine-shot UI

## Goal

Implement media-specific UI mounted by Feature 163 and complete nine-shot shot
controls for intake, plan, review/QC, derived artifact, workflow, start frame,
reference frames, and approval.

## Files

- Add/extend media components under
  `apps/web/client/src/components/verticalDramaSeries/` and any existing
  storyboard episode page integration.
- Add Worker App Media Workspace screen modules only through Feature 163's
  shell/context contract; do not create another Sidebar/router.
- Add localized copy in existing Thai/English locale files as required.
- Add component tests and browser evidence fixture/specs where current test
  conventions support them.

## Required behavior

Nine shot cards show source/derived readiness, processing/QC/publish state,
workflow source/default/override, start/reference attachments, and safe actions.
Shot drawer owns unsaved draft intent and focus/trim/motion/reference editing;
context switch prompts. Batch actions return per-shot results and retain
incompatible shots unchanged. Feature 163 host routes show Intake, Inventory,
AI Plan, Review/QC, Processing, Published states with selected Series/root.

Use guided, AI-assisted review, and automated AI modes with server authority.
Show blocked/stale/offline/access-denied/capability/revoked-root states; never
show Ready from transport completion alone. Native absolute paths are local
only. Apply existing semantic tokens, keyboard/focus/live status/contrast/
reduced-motion, Thai/English labels, and responsive desktop/tablet/narrow
layouts.

## TDD/evidence requirements

Test state/action matrix, workflow chooser, frame manifest editor, QC approval,
batch partial results, keyboard semantics, and local-only copy. Browser proof
covers storyboard and Media Workspace; Tauri proof covers native picker/path
redaction. Live GPU/MCP/provider proof remains separate.

## Acceptance

Users can attach intent and frame references to any of nine shots, queue safe
work, review derived/QC state, and apply only a verified artifact to the shot.

## UI/UX Contract

### Target User / JTBD
Drama creator turns imperfect local footage into reviewable B-roll and attaches it to one of nine shots.
### Surface Inventory
Nine-shot cards/drawer; Media Workspace Intake, Inventory, AI Plan, Review/QC, Processing, Published.
### Component Map
Shot card owns dispatch/status; drawer owns draft intent/frame edits; Feature 163 owns shell/context.
### State Matrix
Loading, empty, stale/offline, denied, binding-required, capability-blocked, processing, QC, ready, publish, retry, revoked.
### Responsive Matrix
Desktop grid + drawer; tablet two-column/stacked drawer; narrow single-column cards with sticky action bar.
### Accessibility Acceptance
Keyboard/focus order, semantic labels, live progress/QC announcements, contrast, disabled explanations, reduced motion.
### Copy Contract
Thai/English copy for local-only, stale, blocked, review, ready, publish, retry, and recovery with locale fallback.
### Browser Evidence Required
Screenshots/tests for nine-shot cards, drawer, Media Workspace states, workflow chooser, and per-shot batch results.
