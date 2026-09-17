# Section 02 — Provider Adapter Boundary

## Source coverage

Feature 200 sections 8, 15–18, 40–42, 47–48, 52 and provider/risk requirements.

## Deliverable

Implement one adapter interface for Codex, Claude Code, Antigravity and DeepSeek start/stream/pause/resume/cancel/collect/health, preserving provider-native evidence and platform error taxonomy.

## TDD steps

Test capabilities, malformed/empty output, timeout, duplicate/out-of-order events, cancellation and provider process failures first; implement; rerun focused Python/Web tests.

## Completion gate

Provider volatility is isolated; credentials never enter manifests, logs or UI.

## UI/UX Contract

### Target User / JTBD
N/A — provider adapter backend; Agent UI is covered by section-05.

### Existing Pattern Reference
N/A — no UI is created; section-05 reuses Chat/provider patterns.

### Surface Inventory
N/A — no route/component changes.

### Component Map
N/A — provider adapter layer only.

### State Matrix
N/A — provider states are rendered/tested in section-05.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — section-05 owns browser evidence.
