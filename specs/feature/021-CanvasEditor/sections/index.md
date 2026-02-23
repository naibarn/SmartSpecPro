<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: bash -lc "cd apps/web && npm test"
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-canvas-runtime-foundation
section-02-v2-schema-and-contracts
section-03-desktop-interactions-and-command-model
section-04-mobile-safe-core-interactions
section-05-autosave-conflict-and-recovery
section-06-export-degradation-and-warning-contract
section-07-template-trust-boundary-and-security-guards
section-08-rollout-observability-and-ops-hardening
section-09-regression-performance-and-accessibility-gates
section-10-release-readiness-and-cutover
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-canvas-runtime-foundation | - | 02, 03, 04 | No |
| section-02-v2-schema-and-contracts | 01 | 03, 04, 05, 06, 07 | No |
| section-03-desktop-interactions-and-command-model | 01, 02 | 05, 06, 09 | No |
| section-04-mobile-safe-core-interactions | 01, 02 | 08, 09 | Yes |
| section-05-autosave-conflict-and-recovery | 02, 03 | 08, 09, 10 | Yes |
| section-06-export-degradation-and-warning-contract | 02, 03 | 08, 09, 10 | Yes |
| section-07-template-trust-boundary-and-security-guards | 02 | 08, 09, 10 | Yes |
| section-08-rollout-observability-and-ops-hardening | 04, 05, 06, 07 | 10 | No |
| section-09-regression-performance-and-accessibility-gates | 03, 04, 05, 06, 07 | 10 | No |
| section-10-release-readiness-and-cutover | 08, 09 | - | No |

## Execution Order

1. `section-01-canvas-runtime-foundation`
2. `section-02-v2-schema-and-contracts`
3. `section-03-desktop-interactions-and-command-model`
4. `section-04-mobile-safe-core-interactions`, `section-05-autosave-conflict-and-recovery`, `section-06-export-degradation-and-warning-contract`, `section-07-template-trust-boundary-and-security-guards`
5. `section-08-rollout-observability-and-ops-hardening`, `section-09-regression-performance-and-accessibility-gates`
6. `section-10-release-readiness-and-cutover`

## Section Summaries

### section-01-canvas-runtime-foundation
Create `presentation-canvas` module boundaries, Konva stage composition, and route-shell integration without breaking editor routing or deck lifecycle behavior.

### section-02-v2-schema-and-contracts
Define and enforce `presentation_canvas_v2` MVP object schema and shared validation/contract fixtures across client, server, and export boundaries.

### section-03-desktop-interactions-and-command-model
Implement desktop-first selection, transform, arrange, keyboard behavior, and deterministic undo/redo command bus.

### section-04-mobile-safe-core-interactions
Implement mobile pan/edit mode model, touch-safe selection/move/basic text flow, and mobile gesture safeguards with telemetry.

### section-05-autosave-conflict-and-recovery
Deliver debounced autosave, conflict burst protection, stale-version safeguards, and unchanged manual save/conflict CTA semantics.

### section-06-export-degradation-and-warning-contract
Implement deterministic degradation precedence and stable warning-code contract for PNG/MP4 export compatibility.

### section-07-template-trust-boundary-and-security-guards
Apply upload-equivalent validation for internal template assets and preserve tenant attribution/permission invariants for all touched paths.

### section-08-rollout-observability-and-ops-hardening
Implement feature-flag rollout gates, dashboard/alert readiness checks, rollback runbook wiring, and pre-launch rollback drill requirements.

### section-09-regression-performance-and-accessibility-gates
Build regression matrix and acceptance gates for contract stability, performance budgets, accessibility, and mobile safety behavior.

### section-10-release-readiness-and-cutover
Execute final canary readiness, backup/restore verification, rollout decision log, and production cutover/abort criteria.
