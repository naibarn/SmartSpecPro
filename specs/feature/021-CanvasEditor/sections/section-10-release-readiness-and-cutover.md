# Section 10: Release Readiness and Cutover

## Objective
Execute final release readiness checks, backup/restore validation, and controlled production cutover for CanvasEditor v2 with explicit abort and rollback criteria.

## Dependencies
- `section-08-rollout-observability-and-ops-hardening`
- `section-09-regression-performance-and-accessibility-gates`

## Scope
- Run final release gate checklist and ensure all required evidence artifacts are complete.
- Validate pre-rollout backup capture and restore rehearsal for impacted presentation tables.
- Execute staged canary progression and enforce abort thresholds.
- Confirm post-deploy consistency checks for slide count/order, byte totals, and asset links.
- Document final go/no-go decision record with owner signoff.

## Out of Scope
- Future roadmap enhancements after launch.
- Non-canvas unrelated release activities.

## Files to Add or Modify
- `specs/feature/021-CanvasEditor/release-gate-checklist.md`
- `specs/feature/021-CanvasEditor/rollback-drill-runbook.md`
- `specs/feature/021-CanvasEditor/migration-verification-report.md`
- `specs/feature/021-CanvasEditor/launch-decision-log.md`
- `apps/web/server/services/presentationWorkflowRegression.test.ts`

## Test-First Stubs (Write Before Implementation)
- Test: release gate validator fails when mandatory evidence files or metrics are missing.
- Test: backup checklist artifact exists before canary enablement.
- Test: restore simulation for sample tenant/deck recovery path succeeds.
- Test: canary abort criteria trigger rollback path when threshold is breached.
- Test: post-deploy consistency checks detect slide/order/asset-link anomalies.

## Implementation Tasks
1. Finalize and run release checklist command set from Section 09 outputs.
2. Capture and verify backup snapshot metadata for `presentation_decks`, `presentation_slides`, and `presentation_asset_links`.
3. Execute rollback drill and record detect/decide/execute/verify evidence.
4. Perform staged rollout sequence and log each stage decision outcome.
5. Run post-deploy consistency checks and attach results to verification report.
6. Record final launch decision and ownership handoff for incident classes.

## Acceptance Criteria
- All gate checks are green with recorded evidence.
- Backup and restore runbook has a successful rehearsal artifact.
- Canary rollout either advances with thresholds satisfied or aborts correctly with rollback proof.
- Launch decision log includes explicit owner signoff and timestamped approvals.

## Risk Controls
- No canary stage progression without completed dashboard and alert-route verification.
- Treat missing rollback evidence as hard blocker.
- Preserve ability to disable v2 flag immediately if degradation or conflict metrics exceed thresholds.

## As-Built

### Actual Files Changed
- `apps/web/server/services/presentationReleaseReadiness.ts`
- `apps/web/server/services/presentationReleaseReadiness.test.ts`
- `apps/web/server/services/presentationWorkflowRegression.test.ts`
- `specs/feature/021-CanvasEditor/release-gate-checklist.md`
- `specs/feature/021-CanvasEditor/rollback-drill-runbook.md`
- `specs/feature/021-CanvasEditor/migration-verification-report.md`
- `specs/feature/021-CanvasEditor/launch-decision-log.md`
- `specs/feature/021-CanvasEditor/scripts/validate-doc-sync.mjs`
- `specs/feature/021-CanvasEditor/reviews/section-10-review.md`

### Deviations From Plan
- Added a typed canary abort evaluator in release-readiness services to make stage-threshold rollback decisions deterministic and unit-testable.
- Reused existing release-readiness consistency evaluators for restore simulation checks instead of introducing a separate restore simulator module.
- Added strict fail-safe handling for malformed canary metrics (abort on invalid input) and explicit evidence-contract validation for release artifacts.

### Tests Added or Updated
- Updated:
  - `apps/web/server/services/presentationReleaseReadiness.test.ts`
  - `apps/web/server/services/presentationWorkflowRegression.test.ts`
- Targeted runs:
  - `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- server/services/presentationWorkflowRegression.test.ts server/services/presentationReleaseReadiness.test.ts"`
  - `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- client/src/pages/PresentationEditor.test.tsx client/src/lib/presentationEditorState.test.ts server/routers/presentation.test.ts server/services/presentationService.test.ts server/services/presentationPlaybackExport.test.ts server/services/presentationWorkflowRegression.test.ts client/src/e2e/presentation-editor.desktop.spec.ts client/src/e2e/presentation-editor.mobile.spec.ts client/src/e2e/presentation-editor.accessibility.spec.ts"`
  - `node specs/feature/021-CanvasEditor/scripts/validate-doc-sync.mjs`

### Known Follow-Ups
- Complete `ramp_25`/`ramp_50`/`ramp_100` stage timestamps in `launch-decision-log.md` after production canary windows elapse.
