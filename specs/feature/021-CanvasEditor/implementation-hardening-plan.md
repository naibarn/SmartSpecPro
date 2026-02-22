# Implementation Hardening Plan

Date: 2026-02-22
Source: `implementation-security-review.md` + deferred blocked task queue
Mode: `plan_now`

## Objective
Close remaining medium/low-risk hardening gaps and the deferred runtime parity task without reopening section scope.

## Execution Status
- Stream A (Canary metric input safety): `implemented` on `2026-02-22`
- Stream B (Runtime-attested release evidence): `implemented` on `2026-02-22`
- Stream C (Konva runtime parity): `pending`

## Stream A: Canary Metric Input Safety (Medium)

### Status
- `implemented`

### Target
- `apps/web/server/services/presentationReleaseReadiness.ts`
- `apps/web/server/services/presentationReleaseReadiness.test.ts`

### Plan
1. Add input guards for canary abort metrics:
- percent fields constrained to `0..100`
- latency fields constrained to `>= 0`
- reject non-finite values (`NaN`, `Infinity`)
2. Fail closed on invalid input with deterministic reason code.
3. Keep existing rollback-scope logic unchanged for valid inputs.

### TDD Stubs
- invalid metric input returns abort result with `invalid_metric_input`.
- negative and `NaN` values are rejected deterministically.
- valid threshold breach behavior remains unchanged.

### Acceptance
- Abort evaluation cannot silently under-trigger due to malformed metrics.
- Existing section-10 release-readiness tests stay green.

## Stream B: Runtime-Attested Release Evidence (Low)

### Status
- `implemented`

### Target
- `specs/feature/021-CanvasEditor/release-gate-checklist.md`
- `specs/feature/021-CanvasEditor/migration-verification-report.md`
- `specs/feature/021-CanvasEditor/launch-decision-log.md`

### Plan
1. Define artifact attestation fields tied to command outputs and timestamps.
2. Add a lightweight verification script/checklist step to validate required evidence fields before canary advancement.
3. Require links/IDs for telemetry snapshot sources rather than free-form placeholders.

### TDD Stubs
- evidence validation fails when attestation IDs/timestamps are missing.
- evidence validation passes when all required fields are present.

### Acceptance
- Release artifacts are auditable and bound to measurable runtime evidence.

## Stream C: Konva Runtime Parity Follow-Up (Deferred Engineering Debt)

### Status
- `pending`

### Target
- `apps/web/client/src/presentation-canvas/**`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- related canvas interaction tests

### Plan
1. Introduce and validate `react-konva` dependency path in workspace.
2. Replace DOM stage scaffold with Konva stage/layer adapters.
3. Preserve command/selection/snap/mobile semantics from sections 03/04.
4. Add parity tests for render path and interaction behavior.

### TDD Stubs
- stage render contract tests pass on Konva runtime.
- command/selection/move interaction tests remain deterministic.
- mobile safe-core gesture guards remain intact.

### Acceptance
- Runtime parity achieved without regressions in section-09 matrix.

## Suggested Execution Order
1. Stream C

## Validation Command Set
- `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- server/services/presentationReleaseReadiness.test.ts server/services/presentationWorkflowRegression.test.ts"`
- `bash -lc "source ~/.nvm/nvm.sh && cd apps/web && npm test -- client/src/pages/PresentationEditor.test.tsx client/src/lib/presentationEditorState.test.ts client/src/e2e/presentation-editor.desktop.spec.ts client/src/e2e/presentation-editor.mobile.spec.ts client/src/e2e/presentation-editor.accessibility.spec.ts"`
- `node specs/feature/021-CanvasEditor/scripts/validate-doc-sync.mjs`
