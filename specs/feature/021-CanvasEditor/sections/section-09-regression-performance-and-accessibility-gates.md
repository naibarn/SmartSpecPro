# Section 09: Regression, Performance, and Accessibility Gates

## Objective
Create a comprehensive verification matrix that prevents regressions across routing, schema, transform behavior, autosave, export, security boundaries, performance budgets, and accessibility requirements before release.

## Dependencies
- `section-03-desktop-interactions-and-command-model`
- `section-04-mobile-safe-core-interactions`
- `section-05-autosave-conflict-and-recovery`
- `section-06-export-degradation-and-warning-contract`
- `section-07-template-trust-boundary-and-security-guards`

## Scope
- Expand unit, integration, and e2e coverage for all high-risk paths identified in the plan.
- Add performance gate tests for interaction latency, viewport frame rate, and autosave latency.
- Add accessibility-focused keyboard and warning semantics verification.
- Add deterministic snapshot tests for degradation precedence/warning codes.
- Add template-apply repeatability and data-integrity regression checks.

## Out of Scope
- Production load testing infrastructure buildout.
- New non-functional goals outside existing rollout thresholds.

## Files to Add or Modify
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationWorkflowRegression.test.ts`
- `apps/web/client/src/e2e/presentation-editor.desktop.spec.ts`
- `apps/web/client/src/e2e/presentation-editor.mobile.spec.ts`
- `apps/web/client/src/e2e/presentation-editor.accessibility.spec.ts`

## Test-First Stubs (Write Before Implementation)
- Test: create -> edit -> autosave -> reload flow preserves deterministic content.
- Test: conflict path under autosave preserves CTA and no retry storm.
- Test: export warning surfacing matches warning contract and remains stable over time.
- Test: desktop keyboard flows maintain visible focus and expected movement constraints.
- Test: mobile safe-core workflow supports pan/zoom/select/basic edit without accidental transform drift.
- Test: performance budgets pass (`drag/transform p95 <= 120ms`, `FPS thresholds`, `autosave p95 <= 1500ms`).
- Test: template apply repeatability avoids duplicate asset links/objects.
- Test: tenant and permission boundary regressions remain blocked.

## Implementation Tasks
1. Build regression matrix mapped directly to impact map and uplift items.
2. Add fixture/snapshot harness for degradation and warning code determinism.
3. Add e2e coverage for desktop, mobile, and accessibility critical paths.
4. Add benchmark harness or instrumentation assertions for performance gates.
5. Integrate regression suite into release checklist command set.
6. Record known acceptable test flakiness thresholds and quarantine policy if required.

## Acceptance Criteria
- Regression suite covers all high-risk areas and passes in CI.
- Performance and accessibility gates are measured and documented with pass evidence.
- Warning/contract snapshot suites are stable across reruns.

## Risk Controls
- Keep performance tests deterministic by controlling fixture size and environment assumptions.
- Prefer focused suites over broad brittle end-to-end chains.
- Treat any tenant-scope regression as release-blocking severity.

## As-Built

### Actual Files Changed
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `apps/web/client/src/pages/PresentationEditor.test.tsx`
- `apps/web/client/src/lib/presentationEditorState.test.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/server/services/presentationService.test.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationWorkflowRegression.test.ts`
- `apps/web/client/src/e2e/presentation-editor.desktop.spec.ts`
- `apps/web/client/src/e2e/presentation-editor.mobile.spec.ts`
- `apps/web/client/src/e2e/presentation-editor.accessibility.spec.ts`
- `apps/web/vitest.config.ts`
- `specs/feature/021-CanvasEditor/release-gate-checklist.md`
- `specs/feature/021-CanvasEditor/reviews/section-09-review.md`

### Deviations From Plan
- Added lightweight e2e spec files executed under Vitest (`client/src/**/*.spec.ts`) instead of introducing a separate browser-e2e runtime.
- Performance gates are currently deterministic fixture assertions that codify release thresholds; production telemetry enforcement remains governed by Section 08 readiness controls.

### Tests Added or Updated
- Updated:
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - `apps/web/client/src/lib/presentationEditorState.test.ts`
  - `apps/web/server/routers/presentation.test.ts`
  - `apps/web/server/services/presentationService.test.ts`
  - `apps/web/server/services/presentationPlaybackExport.test.ts`
  - `apps/web/server/services/presentationWorkflowRegression.test.ts`
- Added:
  - `apps/web/client/src/e2e/presentation-editor.desktop.spec.ts`
  - `apps/web/client/src/e2e/presentation-editor.mobile.spec.ts`
  - `apps/web/client/src/e2e/presentation-editor.accessibility.spec.ts`
- Targeted run:
  - `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- client/src/pages/PresentationEditor.test.tsx client/src/lib/presentationEditorState.test.ts server/routers/presentation.test.ts server/services/presentationService.test.ts server/services/presentationPlaybackExport.test.ts server/services/presentationWorkflowRegression.test.ts client/src/e2e/presentation-editor.desktop.spec.ts client/src/e2e/presentation-editor.mobile.spec.ts client/src/e2e/presentation-editor.accessibility.spec.ts"`

### Known Follow-Ups
- Replace fixture-based performance assertions with captured canary telemetry ingest once performance collector hooks are available.
- Evaluate whether browser-driven e2e coverage is required for release sign-off beyond current Vitest spec gates.
