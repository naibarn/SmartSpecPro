# Section 05 — Run, Mini App and Marketplace

Implement the separate Run experience from mockup 03: inputs/uploads, progress
steps, step details, live activity log, artifacts, preview and safe recovery.
Add schema-driven result UI, dependency/readiness states, immutable publish,
access modes and catalog discovery using existing patterns without adding
callers to retired `/workflows`. Tests cover validation/upload ACL, Job states,
approval/blocked/error/retry, artifacts, publish immutability, sharing and
Marketplace filters.

## UI/UX Contract

### Target User / JTBD
Users fill a Mini App, monitor a run and recover/download its result.
### Surface Inventory
Mockup 03: Run header, input form, progress, activity, artifacts and preview.
### Component Map
Run form; timeline; step detail; activity log; artifacts; preview; recovery.
### State Matrix
Empty, uploading, validation error, running, approval, blocked, retry, success and failed.
### Responsive Matrix
Desktop two-column; tablet compressed; mobile single-column form/progress/artifacts.
### Accessibility Acceptance
Labeled uploads/fields, keyboard actions, focus, announcements, contrast and reduced motion.
### Copy Contract
Localized copy explains the next action and does not call ACK completion.
### Browser Evidence Required
Compare all three target viewports against mockup 03.
