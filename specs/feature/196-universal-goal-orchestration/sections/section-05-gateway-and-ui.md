# Section 05 — Command Gateway and UI

## Source coverage

Feature 196 sections 63–76, 147–212, 261–266 and all Goal UX, mobile, multi-channel and acceptance UI requirements.

## Deliverable

Expose preview/clarification/approval/submit/cancel/replan/explainability through existing route conventions and render plans using Chat/Assistant patterns.

## UI/UX Contract

### Target User / JTBD
An end user states an outcome in `/chat`, Side Panel or authorized channel and approves a transparent executable plan.

### Existing Pattern Reference
Reuse current Chat plan/task/approval cards, capability chips, settings forms and worker-job states; no new interaction pattern without a documented missing state.

### Surface Inventory
Composer, clarification prompt, plan card, approval card, capability details, live task handoff and decision/why view.

### Component Map
Command gateway and Chat integration own data flow; plan/approval components own presentation; Feature 195 owns Job state.

### State Matrix
Loading, empty, error, success, partial, disabled, selected, hover, focus, approval-expired and stale-plan states must be explicit and tested.

### Responsive Matrix
Mobile 390×844, tablet 768×1024, laptop 1024×768 and desktop 1440×900 retain the same semantics with stacked/scrollable cards.

### Accessibility Acceptance
Keyboard-only preview/approve/cancel path, visible focus, semantic headings/status/live regions, labels, contrast and reduced motion.

### Copy Contract
Thai/English labels distinguish Draft, Needs input, Ready for approval, Approved, Running, Failed and Unknown; fallback localization is deterministic.

### Browser Evidence Required
Browser proof for command → preview → approval → Job state, mobile layout and keyboard path.

## TDD steps

Test route schemas and UI state matrix first; implement gateway/UI; run focused jsdom/browser checks.

