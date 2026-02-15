# section-06-compatibility-font-fallback

## Objective

Apply the high-impact review decisions by enforcing explicit mixed-version compatibility behavior and deterministic missing-font policy across preview and render paths.

## Scope

- Implement runtime behavior for unsupported/newer contract versions.
- Ensure no silent data loss in downgrade/reject paths.
- Define and enforce deterministic missing-font behavior with telemetry.
- Align policy behavior between frontend preview and backend render.

## Dependencies

- Requires sections `01`, `04`, and `05`.

## Primary Files

- `apps/web/shared/types/mediaJob.ts`
- `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`
- `python-backend/app/tasks/media_job_worker.py`
- `apps/web/client/src/components/videoeditor/__tests__/...`
- `python-backend/tests/unit/...`

## Tests First (Write Before Implementation)

1. Test: unsupported contract versions trigger explicit policy outcome (clear reject or gated downgrade).
2. Test: downgrade policy never drops required text semantics silently.
3. Test: missing/invalid font IDs follow deterministic configured behavior in preview.
4. Test: missing/invalid font IDs follow the same deterministic behavior in backend render.
5. Test: telemetry includes version policy outcome and font-resolution outcome fields.

## Implementation Tasks

1. Add/complete version compatibility policy enforcement at conversion and render boundaries.
2. Add deterministic font fallback (or hard-fail) policy contract shared by frontend/backend.
3. Ensure policy outcome instrumentation is emitted in both preview diagnostics and worker logs.
4. Add compatibility notes in relevant code comments/docs where behavior is non-obvious.

## Acceptance Criteria

1. Mixed-version rollout behavior is explicit, deterministic, and test-covered.
2. Missing-font handling no longer produces undefined parity drift.
3. Operational logs include actionable policy and font-resolution diagnostics.

## Risks and Notes

- This section is high-impact; policy changes can alter production behavior for old clients.
- Reject path UX/error messaging must remain clear and actionable.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/shared/types/__tests__/mediaJob.test.ts`
- `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`
- `apps/web/client/src/components/videoeditor/__tests__/PreviewPlayer.textParity.test.tsx`
- `python-backend/app/tasks/media_job_worker.py`
- `python-backend/tests/unit/test_media_job_text_render.py`

### Implementation Notes

1. Strengthened mixed-version compatibility coverage by adding explicit test that `gated_downgrade` is rejected whenever text semantics are present.
2. Added deterministic preview font diagnostics via `onTextDiagnostics` callback:
   - per-clip requested/resolved font
   - explicit fallback boolean
   - aggregate fallback count
3. Added backend text-render telemetry builder with:
   - `versionPolicyOutcome`
   - per-clip `fontResolution`
   - `fontFallbackCount`
   - `fastPath` eligibility/reason and applied strategy.
4. Unified backend derived diagnostics emission through `_build_text_render_telemetry` for deterministic policy observability.

### Deviations From Plan

- Compatibility policy telemetry is emitted in render-derived diagnostics and preview callback outputs; no new external logging transport was added in this section.

### Tests Added/Updated

- Updated `apps/web/shared/types/__tests__/mediaJob.test.ts` with text-semantics downgrade rejection case.
- Updated `apps/web/client/src/components/videoeditor/__tests__/PreviewPlayer.textParity.test.tsx` with font-fallback diagnostics assertions.
- Updated `python-backend/tests/unit/test_media_job_text_render.py` with version-policy + font-resolution telemetry assertions.

### Follow-Ups

- Pipe preview diagnostics into centralized client telemetry sink once operational dashboards for text rollout are finalized.
