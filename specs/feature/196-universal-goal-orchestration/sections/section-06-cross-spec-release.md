# Section 06 — Cross-Spec Integration and Release

## Source coverage

Feature 196 sections 202–242, 265–283 and trailing codebase baseline/summary/acceptance sections.

## Deliverable

Verify event correlation, plan hash/idempotency, Feature 195 handoff, Runner control requirements, MCP/Agent attenuation, context/assets provenance, result inbox, degraded mode and mixed-version/rollback evidence.

## TDD steps

Add the cross-spec contract matrix tests first; run against 195 contracts; implement integration adapters and release docs; rerun focused Web/Python suites and diff-check.

## Completion gate

No circular dependency or duplicate control plane remains; any environment-only proof gap is recorded explicitly.

## UI/UX Contract

### Target User / JTBD
N/A — integration/release gate only; UI behavior is verified by section-05.

### Existing Pattern Reference
N/A — no UI is created; existing Chat/Job/Runner patterns remain canonical.

### Surface Inventory
N/A — no new route/component.

### Component Map
N/A — contract matrix and release evidence only.

### State Matrix
N/A — state checks are delegated to UI tests.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence.
