# section-05-render-pipeline-ass

## Objective

Implement canonical backend rendering for text clips via ASS/libass, with a strictly gated drawtext fast-path and safe escaping/font handling.

## Scope

- Preserve text semantics end-to-end in render contract conversion.
- Generate ASS events/styles from text clip payload.
- Integrate subtitle burn-in in worker render flow.
- Add drawtext equivalence gate and structured reason-code telemetry.

## Dependencies

- Requires `section-01-contract-validation-foundation`.

## Primary Files

- `apps/web/shared/types/mediaJob.ts`
- `python-backend/app/tasks/media_job_worker.py`
- `python-backend/tests/unit/...` (new/updated)

## Tests First (Write Before Implementation)

1. Test: project->timeline conversion preserves text style/keyframe semantics and ordering metadata.
2. Test: ASS output generation matches expected style/event fixtures.
3. Test: drawtext fast-path activates only for full-equivalence inputs.
4. Test: fast-path rejection emits explicit reason codes and falls back to ASS.
5. Test: escaping and font-mapping guards prevent injection/path misuse behavior.

## Implementation Tasks

1. Extend conversion types to carry canonical text payload semantics.
2. Implement ASS generation utility and integrate into worker render command flow.
3. Wire subtitle/libass burn-in path for text tracks in render job execution.
4. Add strict eligibility checker for drawtext fast-path.
5. Emit structured telemetry for accept/reject/fallback decisions.
6. Apply safe escaping and font whitelist mapping in FFmpeg invocation path.

## Acceptance Criteria

1. Render outputs include expected text overlays for representative fixtures.
2. Fast-path never applies when semantics are partial or ambiguous.
3. Security-sensitive text/font handling is test-covered.

## Risks and Notes

- FFmpeg filter construction errors are high-severity and must fail predictably.
- Keep ASS path as canonical default when uncertainty exists.

## As-Built Update (2026-02-15)

### Actual Files Changed

- `apps/web/shared/types/__tests__/mediaJob.test.ts`
- `python-backend/app/tasks/media_job_worker.py`
- `python-backend/tests/unit/test_media_job_text_render.py`

### Implementation Notes

1. Added deterministic text-render helper pipeline in worker:
   - text-clip extraction from timeline payload
   - ASS document generation (`_generate_ass_document`)
   - strict drawtext fast-path eligibility gate with reason codes (`_evaluate_drawtext_fast_path`)
   - drawtext filter builder with escaping and whitelist font fallback (`_build_drawtext_filter`)
2. Integrated canonical text burn-in flow into `handle_render_mp4`:
   - base render pass first
   - canonical ASS burn-in pass by default
   - optional drawtext fast-path only when strict-equivalence gate accepts input
   - drawtext runtime failures deterministically fallback to ASS
3. Added text-render diagnostics in render `derived.textRender` payload:
   - `strategy`
   - `fastPathEligible`
   - `fastPathReason`
   - `fontFallbackCount`
   - `textClipCount`
4. Added shared-type test coverage for project->timeline preservation of text payload semantics and deterministic `zOrder`.

### Deviations From Plan

- ASS integration currently runs as a second pass after base render output instead of in-graph burn-in during the primary render filter graph.
- Fast-path gate is intentionally conservative for v1 (rejects multiline/effects/animated transforms/etc.) to minimize parity-risk.

### Tests Added/Updated

- Added `python-backend/tests/unit/test_media_job_text_render.py` covering:
  - ASS generation fixtures + escaping
  - fast-path accept/reject reason codes
  - drawtext filter escaping + font fallback
- Updated `apps/web/shared/types/__tests__/mediaJob.test.ts` with text payload + `zOrder` contract preservation case.

### Follow-Ups

- Move ASS burn-in into single-pass render graph once filter-graph composition is stabilized.
- Expand fast-path equivalence checks for additional safe cases only after parity fixtures validate them.
