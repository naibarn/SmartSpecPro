# Section 09 — Skill Framework wizard UI

## Goal

Deliver the full-screen `/storyboard-review/new/skill-framework` form and project tabs.

## Screens and behavior

Use existing design tokens/components and current Storyboard language. Collect title, idea, story type, language/platform, 2–12 shots, optional product context, compatible skill, dynamic skill fields from the schema, 0–5 managed references, image model/conditional quality, video model, and project character bindings. Create draft before confirmation so Characters is durable. Show a single estimate/confirmation boundary, then progress with per-shot statuses, cancel, retry failed stages, and projection link.

Render only allowlisted schema fields; parent-owned fields appear once. Include loading/empty/invalid/dirty/queued/running/succeeded/partial/failed/retry/conflict/source-unavailable states. Use Thai-first and English fallback i18n keys, associated labels/errors, keyboard dialog/tabs/upload/focus restore, `aria-live` progress, non-color status, reduced motion, and responsive layouts at 320–1920 widths.

## Tests

Cover route, dynamic Cute Child fields, 0/5 refs, quality conditionality, 2/9/12 counts, mime/dialogue/hybrid, one confirmation, progress/retry, Characters tab, interop, mobile/desktop rendering, and accessible labels/focus.

## UI/UX Contract

### Target User / JTBD
Creator turns one idea into a continuous vertical storyboard and reuses a recognizable character.

### Surface Inventory
Full-screen wizard, tabs, dynamic fields, references, model/quality, estimate, confirmation, progress, retry, Characters.

### Component Map
Page coordinates steps; schema form renders allowlisted fields; character tab uses shared adapter; Review remains existing.

### State Matrix
Explicit loading, empty, disabled, selected, invalid, dirty, queued, running, succeeded, partial, failed, retry, conflict, unavailable.

### Responsive Matrix
Verify 320x800, 390x844, 768x1024, 1366x768, 1440x900, and 1920x1080.

### Accessibility Acceptance
Labels/errors associate; stepper/select/upload/tabs/dialogs keyboardable; focus traps/restores; progress live; status non-color; reduced motion.

### Copy Contract
Thai-first English fallback for 2–12, 10 seconds, optional 0–5 images, quality, one confirmation, snapshot import.

### Browser Evidence Required
Capture dynamic form, reference/count extremes, quality, confirmation, progress/retry, Characters, responsive, a11y.
