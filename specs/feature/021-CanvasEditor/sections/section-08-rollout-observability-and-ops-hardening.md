# Section 08: Rollout, Observability, and Ops Hardening

## Objective
Operationalize CanvasEditor v2 rollout with feature-flag gating, measurable canary thresholds, alert/dashboard readiness, and tested rollback responsibilities before broad tenant ramp.

## Dependencies
- `section-04-mobile-safe-core-interactions`
- `section-05-autosave-conflict-and-recovery`
- `section-06-export-degradation-and-warning-contract`
- `section-07-template-trust-boundary-and-security-guards`

## Scope
- Wire feature flags for staged enablement (`PRESENTATION_CANVAS_V2_ENABLED`, optional mobile gate if retained).
- Emit required telemetry/metrics for transform performance, autosave outcomes, conflict rate, degradation rate, and export failures.
- Define alert thresholds and verify on-call routing before canary progression.
- Add rollout checklist with owner, stage gate, abort threshold, and rollback command references.
- Require pre-launch rollback drill with named roles: detect, decide, execute, verify.

## Out of Scope
- Long-term analytics product dashboards unrelated to rollout safety.
- Post-launch experimentation framework.

## Files to Add or Modify
- `apps/web/client/src/lib/analytics/presentationEvents.ts`
- `apps/web/server/services/presentationObservability.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationService.ts`
- `specs/feature/021-CanvasEditor/release-gate-checklist.md`
- `specs/feature/021-CanvasEditor/rollback-drill-runbook.md`
- `apps/web/server/services/presentationWorkflowRegression.test.ts`

## Test-First Stubs (Write Before Implementation)
- Test: feature flag toggles v2 runtime on/off without route breakage.
- Test: required metrics/events are emitted with tenant, deck, and operation context fields.
- Test: rollback toggle returns users to stable editor path while preserving deck readability.
- Test: alert threshold evaluation path can detect abnormal conflict/export/degradation spikes.
- Test: dashboard-readiness checklist fails when required signals are missing.

## Implementation Tasks
1. Add centralized feature-flag checks in route/editor runtime selection and server guards.
2. Implement observability event emitters for key editor and export workflows.
3. Define and codify canary SLO gate thresholds in release checklist artifacts.
4. Add alert configuration validation and on-call routing verification steps to runbook.
5. Add rollback drill template with role assignments and verification evidence fields.
6. Extend regression tests for flag toggling and observability event coverage.

## Acceptance Criteria
- Rollout can proceed in explicit internal -> selected tenants -> ramp stages with hard stop criteria.
- Alerting and dashboards are validated before tenant canary expansion.
- Rollback drill is rehearsed and documented with role-based ownership.

## Risk Controls
- Prevent flag drift by using a single source of truth for runtime gate evaluation.
- Require hard evidence artifact completion before stage advancement.
- Treat missing telemetry as rollout-blocking, not advisory.

## As-Built

### Actual Files Changed
- `apps/web/server/services/presentationObservability.ts`
- `apps/web/server/services/presentationObservability.test.ts`
- `apps/web/server/services/presentationPlaybackExport.ts`
- `apps/web/server/services/presentationPlaybackExport.test.ts`
- `apps/web/server/services/presentationService.ts`
- `apps/web/server/services/presentationWorkflowRegression.test.ts`
- `apps/web/server/routers/presentation.test.ts`
- `apps/web/client/src/lib/analytics/presentationEvents.ts`
- `apps/web/client/src/lib/analytics/presentationEvents.test.ts`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- `specs/feature/021-CanvasEditor/release-gate-checklist.md`
- `specs/feature/021-CanvasEditor/rollback-drill-runbook.md`
- `specs/feature/021-CanvasEditor/reviews/section-08-review.md`

### Deviations From Plan
- Existing feature-gate wiring in router paths was retained and hardened via explicit guard toggle test coverage; no additional runtime flag selector module was introduced in this section.
- Rollout readiness was codified as documentation + validator utilities rather than adding deployment automation scripts in this section.

### Tests Added or Updated
- Updated:
  - `apps/web/server/services/presentationObservability.test.ts`
  - `apps/web/server/services/presentationPlaybackExport.test.ts`
  - `apps/web/server/services/presentationWorkflowRegression.test.ts`
  - `apps/web/server/routers/presentation.test.ts`
  - `apps/web/client/src/lib/analytics/presentationEvents.test.ts`
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
- Targeted run:
  - `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- server/services/presentationObservability.test.ts server/services/presentationPlaybackExport.test.ts server/services/presentationWorkflowRegression.test.ts server/routers/presentation.test.ts client/src/lib/analytics/presentationEvents.test.ts client/src/pages/PresentationEditor.test.tsx"`

### Known Follow-Ups
- Wire checklist artifacts into CI release automation and attach stage evidence links automatically.
- Expand dashboard-readiness validation to include render performance/fps gate ingestion from production telemetry.
