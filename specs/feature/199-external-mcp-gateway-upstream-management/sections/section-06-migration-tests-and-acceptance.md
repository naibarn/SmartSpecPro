# Section 06 — Migration, Compatibility and Acceptance

## Source coverage

Feature 199 sections 26–30, all testing/acceptance/definition-of-done requirements and Appendices A–Q.

## Deliverable

Stage read-only mapping, discovery/quarantine, approved execution, Runner bridge, RAG projection and UI; prove mixed protocol/SAH versions, rollback, load, credential rotation and incident recovery.

## TDD steps

Write migration/security/load/recovery/compatibility gates first; implement safe changes/docs; rerun focused Web/Python suites and diff-check.

## Completion gate

No existing MCP path is removed without parity/rollback proof and no local test is presented as production activation.

## UI/UX Contract

### Target User / JTBD
N/A — migration/acceptance gates; MCP UI evidence is covered by section-05.

### Existing Pattern Reference
N/A — uses existing release-gate/runbook conventions.

### Surface Inventory
N/A — no browser surface.

### Component Map
N/A — gates/docs only.

### State Matrix
N/A — state checks are delegated to UI tests.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns route-level browser evidence.
