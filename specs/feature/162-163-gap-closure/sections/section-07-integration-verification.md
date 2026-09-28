# Section 07 — Integration Verification and Convergence

## Goal

Prove the implementation matches the approved design and close remaining safe
gaps before handoff.

## Gates

- focused Web/shared/server tests for every changed contract and route;
- Web and Worker TypeScript checks;
- Rust `cargo test --lib` and native fixture tests;
- Drizzle journal/migration dry-run/invariant checks and `git diff --check`;
- browser tests or explicit browser evidence boundary for storyboard/Worker UI;
- five review rounds plus two consecutive clean convergence rounds.

## Stop conditions

Do not claim full completion if a static in-scope path is absent. External
ComfyUI/MiniMax/GPU/R2/vector/packaged-Tauri/production gates are reported as
environment-bound only when the static call path and fail-closed behavior exist.

## UI/UX Contract

### Target User / JTBD

Reviewer needs evidence that the editor and Worker flows expose the same
Series/shot/job state and fail safely across their boundaries.

### Surface Inventory

Storyboard inspector, Worker sidebar routes, media batch review, queue,
published artifact, and integration status evidence.

### Component Map

Use focused browser tests for each canonical surface and contract tests for the
server/native boundary; do not substitute unit tests for user-flow evidence.

### State Matrix

Cover ready, loading, unavailable, stale, failed, canceled, revoked, and
partial-success states at every boundary that can display them.

### Responsive Matrix

Run the critical browser checks at desktop and narrow viewport dimensions.

### Accessibility Acceptance

Assert accessible names, status text, keyboard reachability, and focus behavior
for the new controls.

### Copy Contract

Evidence should identify the user-visible action and resulting state using the
same Thai labels defined by the feature surfaces.

### Browser Evidence Required

Record the exact test command or screenshot evidence; explicitly mark live GPU,
MCP, R2, vector, and production checks as unperformed when unavailable.
