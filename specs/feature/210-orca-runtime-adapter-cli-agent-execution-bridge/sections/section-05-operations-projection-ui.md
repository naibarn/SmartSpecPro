# Section 05 — Operations Projection and UI

Expose readiness, session activity, receipt evidence and reconciliation through
existing operational projections. If rendered in Workflow Studio, use the
approved Spec 209 right inspector and bottom run/debug drawer structure. Cover
loading, empty, blocked, error, retry, focus and selected states, responsive
behavior and keyboard labels in focused UI tests; do not invent another page.

## UI/UX Contract

### Target User / JTBD
Operators inspect readiness, activity, evidence and safe recovery.
### Surface Inventory
Only Spec 209 inspector and bottom run/debug drawer; no standalone redesign.
### Component Map
Inspector readiness/config; drawer activity/trace/logs/artifacts/recovery.
### State Matrix
Loading, empty, disabled, setup-required, running, approval, blocked, success and error.
### Responsive Matrix
Desktop split, tablet sheet, mobile sequential stack.
### Accessibility Acceptance
Keyboard-safe recovery, focus, labels, status text and reduced motion.
### Copy Contract
Use existing workflow locale keys and explain the next safe action.
### Browser Evidence Required
Verify 1440x900, 768x1024 and 390x844 or record runtime blocker.
