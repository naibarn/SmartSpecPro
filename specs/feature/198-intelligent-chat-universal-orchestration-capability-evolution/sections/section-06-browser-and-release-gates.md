# Section 06 — Browser, Integration and Release Gates

## Source coverage

Feature 198 sections 121–133, 154–159, 187–189, 203–207 and all final DoD/acceptance requirements.

## Deliverable

Verify the 195–200 contract matrix, browser UI evidence, performance/cardinality limits, localization/a11y, degraded mode, retention, rollback and deployment-boundary claims.

## TDD steps

Write integration/browser/release gate tests first; run focused Web/Python tests and browser checks; fix gaps and record any provider/deployment-only limitation.

## Completion gate

No local green test is presented as proof of production activation; all target gaps have explicit evidence or blocker records.

## UI/UX Contract

### Target User / JTBD
Operators need browser/release evidence; this section coordinates evidence rather than creating UI.

### Existing Pattern Reference
N/A — uses existing browser verification and release-gate conventions.

### Surface Inventory
N/A — no new UI surface.

### Component Map
N/A — integration/release gates only.

### State Matrix
N/A — UI state matrices are owned by section-04.

### Responsive Matrix
N/A — browser evidence is delegated to section-04.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no new copy.

### Browser Evidence Required
N/A — section-04 provides the route-level browser evidence.
