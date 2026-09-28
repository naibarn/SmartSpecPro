# Section 04 — Chat, Assistant and Control UI

## Source coverage

Feature 198 sections 46–80, 134–158, 199 and all UI/UX/accessibility/localization/feedback/troubleshooting requirements.

## Deliverable

Extend `/chat`, Universal Assistant launcher/Side Panel, plan/approval/live-task/result/source/capability/connection/trace/evaluation surfaces using existing components and state conventions.

## UI/UX Contract

### Target User / JTBD
End users ask for outcomes, understand the plan and safely approve/monitor work from Chat or Assistant.

### Existing Pattern Reference
Reuse current Chat, MCP settings, job monitor, Help Center and media task card patterns; document any intentional divergence.

### Surface Inventory
Composer, activity strip, source/capability chips, plan, approval, live task, retrieval result, clarification, compare/result, connections, capability, trace and evaluation views.

### Component Map
Chat owns presentation/state; Feature 196 owns command/plan; Feature 195 owns Job; Feature 197/199/200 own runtime-specific details.

### State Matrix
Loading, empty, error, success, partial, disabled, selected, hover, focus, approval-expired, disconnected and unknown.

### Responsive Matrix
Mobile 390×844, tablet 768×1024, laptop 1024×768, desktop 1440×900 and wide desktop 1280×800 for dense results.

### Accessibility Acceptance
Keyboard-only request/approval/control path, visible focus, live-region semantics, labels, contrast and reduced motion.

### Copy Contract
Thai/English copy explicitly distinguishes Preview, Needs input, Approved, Running, Paused, Failed, Unknown and Verified; fallback localization is deterministic.

### Browser Evidence Required
Submit → plan → approval → live task → result, reconnect, mobile and keyboard evidence.

## TDD steps

Write state-matrix/component tests first, implement, run focused jsdom/browser checks and inspect screenshots where available.

