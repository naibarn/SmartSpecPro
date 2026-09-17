# Section 03 — Task State, Artifacts, Traces and Continuity

## Source coverage

Feature 198 sections 31–45, 80–87, 123–130, 154, 161, 168–169, 173–183, 185, 193–195 and 203.

## Deliverable

Project canonical Job/Runner/Agent/MCP events into Chat, preserve decision/replay bundles, propagate cancel/approval, artifactize large results, notify across surfaces and enforce retention/consent/holdout rules.

## TDD steps

Test event order/dedupe, cancellation cascade, artifact ACL, cross-tab conflict, deletion reconciliation and evaluation leakage; implement; rerun.

## Completion gate

All projections retain correlation, provenance and an explicit unknown/degraded state.

## UI/UX Contract

### Target User / JTBD
N/A — projection/provenance layer; UI rendering is covered by section-04.

### Existing Pattern Reference
N/A — no UI is created; existing task cards remain the pattern.

### Surface Inventory
N/A — no new route/component.

### Component Map
N/A — projection and artifact services only.

### State Matrix
N/A — state display is tested in section-04.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-04 owns browser evidence.
