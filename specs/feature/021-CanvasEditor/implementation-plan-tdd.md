# Implementation Plan (TDD): Feature 021 Canvas Editor

## 1. Plan Objective
Define test-first execution for the Canvas Editor rollout so each implementation slice lands with regression protection before feature code is completed.

## 2. Testing Context (Existing Codebase)
- Runtime: TypeScript React + Node in `apps/web`
- Existing test surfaces to extend:
  - `apps/web/client/src/pages/PresentationEditor.test.tsx`
  - `apps/web/client/src/lib/presentationEditorState.test.ts`
  - `apps/web/server/routers/presentation.test.ts`
  - `apps/web/server/services/presentationService.test.ts`
  - `apps/web/server/services/presentationPlaybackExport.test.ts`
  - `apps/web/server/services/presentationWorkflowRegression.test.ts`
- Test command baseline: run `apps/web` test suite prior to merge and at rollout gates.

## 3. Impact Map Test Stubs

### High-Risk Existing Areas
- Test: route `/presentation-editor/:docId` still resolves and hydrates editor shell after canvas module split.
- Test: shared contracts reject invalid `presentation_canvas_v2` payloads with deterministic errors.
- Test: export service preserves PNG/MP4 completion semantics when v2 slide payloads include degraded constructs.
- Test: Document Management create/open flow still routes into editable deck without manual recovery.

### Medium-Risk Existing Areas
- Test: new/additive router handlers preserve actor/tenant error mapping and status codes.
- Test: service-layer conflict logic still emits existing conflict states under autosave traffic.

### Low-Risk Existing Areas
- Test: no schema migration DDL is attempted during feature rollout path.

## 4. Workstream A: Canvas Runtime Foundation (Tests First)
- Test: canvas module boundary renders stage/layer shell with serialized slide content as sole source of truth.
- Test: stage rerender updates only changed layer segments for object updates.
- Test: route-level teardown/remount does not leak stage listeners or viewport state.

## 5. Workstream B: v2 Schema and Contracts (Tests First)
- Test: validator accepts MVP object types (`text`, `image`, `shape`, `line`) with required common fields.
- Test: validator rejects unknown type/field combinations with stable error codes.
- Test: client and server fixture matrix produces byte-for-byte stable normalized payload outputs.
- Test: warning-code fixtures remain stable for deterministic degradation scenarios.

## 6. Workstream C: Desktop Editing UX (Tests First)
- Test: select/move/resize/rotate updates object geometry deterministically.
- Test: snap engine emits expected edge/center align behavior for representative object positions.
- Test: arrange commands (`forward/back/front/back`) preserve deterministic z-order.
- Test: undo/redo command bus restores prior states without drift after multi-step transforms.
- Test: keyboard selection/movement flows preserve visible focus and bounded movement behavior.

## 7. Workstream D: Mobile Safe-Core UX (Tests First)
- Test: pinch + pan update viewport transform while preserving selected object state.
- Test: pan/edit mode toggle blocks advanced transforms in pan mode.
- Test: touch interactions avoid accidental transform activation below minimum hit target threshold.
- Test: mobile-safe core supports select/move/basic text edit without desktop-only controls.

## 8. Workstream E: Save/Conflict/Recovery (Tests First)
- Test: autosave debounce batches rapid edits into bounded mutation frequency.
- Test: stale-version writes enter conflict state without retry storm.
- Test: cooldown guard suppresses immediate autosave retries after repeated conflicts.
- Test: manual save and conflict recovery CTA semantics remain unchanged from baseline.

## 9. Workstream F: Export Compatibility (Tests First)
- Test: unsupported constructs degrade via documented precedence order.
- Test: export status includes slide-level warning summary with stable warning codes.
- Test: deterministic degradation snapshots remain unchanged for same input payload.
- Test: export endpoint contract and job state transitions remain backward compatible.

## 10. Workstream G: Rollout, Security, and Ops Hardening (Tests First)
- Test: `PRESENTATION_CANVAS_V2_ENABLED` gates v2 runtime on/off without route breakage.
- Test: tenant/permission checks deny cross-tenant read/write for all touched endpoints.
- Test: internal template assets pass upload-equivalent validation and tenant-scoped linking.
- Test: rollback toggle returns users to stable editor path while preserving deck readability.
- Test: observability events and metrics emit required fields for conflict/export/degradation classes.

## 11. Data Safety Strategy Verification Stubs
- Test: pre-rollout backup checklist artifacts exist before canary enablement.
- Test: post-deploy consistency checks verify slide count/order, bytes, and orphan-link absence.
- Test: restore runbook simulation succeeds for sample tenant/deck recovery path.

## 12. Compatibility Verification Stubs
- Test: existing API namespace and route contracts remain callable by current clients.
- Test: hard-switch behavior is only active when feature flag is enabled.
- Test: unsupported legacy payload path is blocked with deterministic operator guidance.

## 13. Regression Prevention and SLO Gate Stubs
- Test: desktop drag/transform p95 latency meets <=120ms target in benchmark harness.
- Test: viewport frame-rate thresholds meet >=45 FPS normal and >=30 FPS at 200-object stress.
- Test: autosave mutation p95 latency meets <=1500ms under canary load profile.
- Test: alert thresholds trigger for conflict/export/degradation anomalies and route to on-call recipients.

## 14. Final Release Readiness Stubs
- Test: canary checklist enforces regression, consistency, monitoring, rollback drill completion.
- Test: rollback drill evidence includes detect/decide/execute/verify ownership signoff.
- Test: Definition-of-Done checks pass for desktop MVP, mobile safe-core, export warnings, and accessibility criteria.
