# Section 03 — Mockup-Aligned Builder Canvas and Inspector

Implement the Builder route with the approved mockup structure: left nav,
breadcrumb/header, top-down compact nodes, selected outline, right Configure/
Settings/Notes inspector, node inputs/outputs and bottom run/output/debug drawer.
Use existing tokens/primitives and `@xyflow/react` for presentation only; AI
creation remains primary. Tests cover all relevant UI states, keyboard/focus,
responsive layout and mockup screenshot evidence at 1440x900, 768x1024 and
390x844.

## UI/UX Contract

### Target User / JTBD
Users inspect and lightly correct an AI-generated workflow without manual wiring.
### Surface Inventory
Mockup 01: left nav, breadcrumb/header, top-down canvas, inspector and drawer.
### Component Map
Shell/header; canvas/node cards; inspector tabs/fields; drawer output/data/trace/logs/artifacts/cost.
### State Matrix
Loading, empty, selected, hover, focus, disabled, invalid, running, success and error.
### Responsive Matrix
Desktop canvas+inspector+drawer; tablet sheet; mobile stacked canvas/inspector/drawer.
### Accessibility Acceptance
Keyboard node selection, semantic controls, focus, labels, contrast and reduced motion.
### Copy Contract
Use existing Thai/English workflow locale keys and labeled actions.
### Browser Evidence Required
Compare 1440x900, 768x1024 and 390x844 hierarchy against mockup 01.
