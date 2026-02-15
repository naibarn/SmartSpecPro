# section-08-rollout-observability-runbook

## Objective

Finalize production readiness for Text Clip rollout with explicit feature gating, monitoring, alerting, ownership, and rollback guidance.

## Scope

- Implement rollout controls (feature flag/canary path).
- Ensure required telemetry is emitted and queryable.
- Define alert triggers, SLO ownership, and incident triage checklist.
- Document rollback and verification runbook steps.

## Dependencies

- Requires `section-06-compatibility-font-fallback` and `section-07-verification-hardening`.

## Primary Files

- `specs/feature/012-AddTextClip/implementation-plan.md` (update if needed)
- operational docs/runbooks in repository (as applicable)
- monitoring/alert config artifacts (if repo-managed)

## Tests First (Write Before Implementation)

1. Test: feature-toggle disabled path preserves existing non-text behavior.
2. Test: text-render telemetry emits required fields (reason codes, ASS status, font resolution, job ID).
3. Test: alert trigger rules can be validated with synthetic error scenarios (where feasible).
4. Test: rollback checklist validation confirms expected post-rollback health indicators.

## Implementation Tasks

1. Wire or confirm feature flag/canary controls for staged rollout.
2. Ensure telemetry coverage for render outcomes and fallback decisions.
3. Define ownership and alert thresholds aligned with release SLOs.
4. Produce/update incident triage and rollback verification checklist.
5. Confirm documentation and operational references are linked from feature artifacts.

## Acceptance Criteria

1. Rollout can be staged and reversed without destructive data actions.
2. On-call diagnostics are clear and sufficient for first-response triage.
3. Monitoring and alert definitions align with text-render SLO targets.

## Risks and Notes

- Operational readiness is incomplete if telemetry fields are emitted but not visible in dashboards.
- Keep rollback criteria concrete to avoid delayed incident response.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/client/src/components/videoeditor/textRollout.ts`
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- `apps/web/client/src/components/videoeditor/__tests__/textRollout.test.ts`
- `apps/web/client/src/components/videoeditor/__tests__/Toolbar.textRollout.test.tsx`
- `python-backend/app/tasks/media_job_worker.py`
- `python-backend/tests/unit/test_media_job_text_render.py`
- `specs/feature/012-AddTextClip/text-rollout-runbook.md`

### Implementation Notes

1. Added explicit text rollout gate resolution with:
   - env control: `VITE_ENABLE_TEXT_CLIP_T1`
   - runtime canary override: `window.__SMARTSPEC_FEATURES__.textClipT1`
2. Updated editor behavior so disabled rollout cohorts:
   - do not see Add Text entry points in toolbar/sidebar,
   - are prevented from creating text clips via guarded handler fallback.
3. Extended render telemetry for on-call diagnostics with:
   - `jobId`
   - `assApplied`
   - existing fast-path/version/font resolution fields.
4. Added synthetic alert and rollback evaluation helpers:
   - 15-minute trigger evaluation for failure/parity/misclassification spikes.
   - rollback health indicator checklist evaluation.
5. Added operational runbook documenting rollout controls, triage, alert rules, and rollback verification.

### Deviations From Plan

- Alert and rollback validations were implemented as deterministic helper evaluations plus tests rather than external dashboard/infrastructure config changes inside this repository.

### Tests Added/Updated

- Added `apps/web/client/src/components/videoeditor/__tests__/textRollout.test.ts`.
- Added `apps/web/client/src/components/videoeditor/__tests__/Toolbar.textRollout.test.tsx`.
- Updated `python-backend/tests/unit/test_media_job_text_render.py` with telemetry field checks and synthetic alert/rollback validations.

### Follow-Ups

- Wire alert helpers to production monitoring pipeline dashboards/queries if/when infra-managed alert config is brought into this repository.
- `fix_now` hardening follow-up applied post-section: backend submission paths now enforce tenant-aware text rollout admission to prevent API bypass of UI-only gating.
