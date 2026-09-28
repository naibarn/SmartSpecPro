# Section 05 — Feature 162 Media Workspace integration

## Goal

Mount media-specific Feature 162 screens inside Feature 163's selected
Series/root shell and connect safe projections/actions without duplicating media
algorithms or navigation.

## Files

- Add Worker App Media Workspace host/screen adapters under
  `apps/worker-app/src/screens/media-workspace/`.
- Add/extend shared context adapters for Series/root/job references.
- Add UI/integration tests covering Feature 162 route contracts and queue/
  published/runtime/access boundaries.

## Required behavior

Media Workspace children are Intake, Inventory, AI Plan, Review/QC, Processing,
Published. Every child displays selected Series and binding badge, validates
stale deep links, and consumes Feature 162 typed projections/actions. Series
selection, folder binding, queue and runtime diagnostics remain Feature 163
ownership. Local path disclosure stays native-only; original source is never
treated as server/R2 input.

Quick Actions map to typed Feature 162 intents with current context/revision,
idempotency and capability checks. Queue distinguishes transport/domain state;
Published shows only verified derived artifacts and vector/index state.

## TDD requirements

Test selected-context guard, stale/revoked root recovery, action eligibility,
partial/blocked results, queue state mapping, published artifact projection,
offline read-only behavior, and cross-feature route ownership.

## Acceptance

Pair → select Series → bind root → open Media Workspace → scan/process/review/
publish can be driven through shared typed context with no duplicated shell or
algorithm implementation.

## UI/UX Contract

### Target User / JTBD
Creator manages local Series footage from the Worker shell without losing selected context or permission state.
### Surface Inventory
Media Workspace Intake, Inventory, AI Plan, Review/QC, Processing, Published, Queue and top-level Series/root context.
### Component Map
Feature 163 owns host/context/guards; Feature 162 owns media child semantics; Quick Actions use shared typed commands.
### State Matrix
Selected, binding-required, stale, offline-read-only, denied, capability-blocked, processing, QC, published, revoked, recovery.
### Responsive Matrix
Desktop host workspace; tablet stacked child panels; narrow single-column with context badge and sticky actions.
### Accessibility Acceptance
Context changes announced; focus preserved on route changes; actions labeled/disabled with reasons; reduced motion supported.
### Copy Contract
Thai/English Series/root/binding, local-only, stale, blocked, publish, and recovery copy with locale fallback.
### Browser Evidence Required
Cross-feature browser proof for selected context, Media Workspace host, queue/published projections, and stale/revoked recovery.
