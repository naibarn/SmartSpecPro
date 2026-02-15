# Implementation Plan (TDD): Feature 012 AddTextClip (T1 Only)

- date: 2026-02-15
- source plan: `implementation-plan.md`
- testing conventions: `research-notes.md` (`## Testing`)
- frontend runner: `cd apps/web && npm test`
- backend runner: `cd python-backend && uv run pytest`

## 1) Delivery Objective

Test stubs to write first:
- Test: text clip authored on `T1` renders deterministically in preview for fixed timestamps.
- Test: rendered output for supported capabilities matches expected parity fixture outcomes.
- Test: fast-path eligibility never bypasses ASS when any unsupported semantic is present.

## 2) Impact Map (Potential Regressions)

### apps/web/client/src/services/projectManager.ts
- Test: project validation accepts `text` track type and valid text clip payload.
- Test: malformed text payload or out-of-range keyframe values fail with deterministic errors.
- Test: legacy payload without text fields loads with safe defaults.

### apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx
- Test: Add Text always targets/creates `T1` and applies default clip fields.
- Test: text clip move guards prevent cross-track behavior regressions.
- Test: overlapping text clips preserve deterministic clip-array order.

### apps/web/client/src/components/videoeditor/PreviewPlayer.tsx
- Test: preview renders text clip fields (content/style/transform) from canonical payload.
- Test: preview ordering for overlapping clips matches clip array order.
- Test: missing/invalid font ID behavior is deterministic and logged/observable.

### apps/web/shared/types/mediaJob.ts
- Test: project->timeline conversion preserves text semantics and ordering metadata.
- Test: timeline->project round-trip preserves text track identity without silent loss.
- Test: mixed-version contract behavior follows explicit reject/downgrade policy.

### python-backend/app/tasks/media_job_worker.py
- Test: ASS generation path includes expected text styles/events for representative inputs.
- Test: drawtext fast-path gate returns explicit reason codes and falls back to ASS on mismatch.
- Test: text escaping and font mapping resist injection/path misuse patterns.

### Existing test suites
- Test: new text-specific coverage is added in existing frontend/backend suites without breaking non-text baselines.

## 3) Plan of Record

## Phase 1: Contract and Validation Foundation

Test stubs to write first:
- Test: text tracks are accepted by save/load validation and normalized with defaults.
- Test: keyframe times are constrained to valid bounds and reject invalid shapes.
- Test: capability matrix compliance check fails when UI exposes unsupported controls.
- Test: mixed-version payload handling enforces configured policy (`reject_with_clear_error` or gated downgrade).
- Test: rollout-window compatibility fixture set covers frontend/backend version skew scenarios.

## Phase 2: Editor and Timeline Behavior

Test stubs to write first:
- Test: Add Text creates deterministic defaults on `T1` for legacy and new projects.
- Test: select/move/trim/delete operations work for text clips without regressions to video/audio flows.
- Test: overlap behavior allows collisions and preserves deterministic z-order by array index.
- Test: unsupported controls are hidden/disabled under strict-parity mode.

## Phase 3: Text Authoring and Keyframe Model

Test stubs to write first:
- Test: style/layout field edits persist losslessly through save/load.
- Test: transform keyframe create/update/delete enforces no-duplicate timestamps.
- Test: segment easing and per-property override persistence follow schema expectations.
- Test: when property override is absent, interpolation falls back to segment easing.

## Phase 4: Preview Parity Engine

Test stubs to write first:
- Test: preview uses bundled whitelist fonts and waits for deterministic font load readiness.
- Test: representative timestamp assertions verify style/position/order parity against fixtures.
- Test: i18n fixtures (multiline Unicode, RTL, ligatures) behave per declared capability boundaries.
- Test: unsupported-script behavior is explicit (documented and asserted where applicable).

## Phase 5: Render Pipeline (Canonical ASS + Fast-Path Gate)

Test stubs to write first:
- Test: ASS renderer path is canonical for all text clips and produces expected event/style output.
- Test: fast-path accepts only fully equivalent cases and emits structured accept/reject reasons.
- Test: any unsupported style/animation forces deterministic ASS fallback.
- Test: missing/invalid font IDs follow deterministic policy (fallback or hard-fail) with telemetry.
- Test: escaping/encoding for text/effects prevents filter-breaking or injection-like payload behavior.

## Phase 6: Verification and Hardening

Test stubs to write first:
- Test: parity matrix suite validates overlap ordering and keyframe interpolation at representative timestamps.
- Test: legacy snapshot fixtures confirm compatibility for older project payloads.
- Test: text-heavy benchmark fixture validates pre-release performance threshold.
- Test: mixed-version integration suite verifies behavior across deployment windows.
- Test: fallback-path suite verifies missing-font and invalid-font handling parity outcomes.
- Test: diagnostics outputs include required triage fields (job ID, reason code, ASS status, font resolution status).

## 4) Regression Prevention Strategy

Test stubs to write first:
- Test: contract round-trip tests enforce no text field loss during conversion cycles.
- Test: canary/feature-toggle path can disable text exposure without breaking non-text editing.
- Test: monitoring instrumentation emits text-render failure and fallback metrics in expected formats.

## 5) Data Safety Strategy

Test stubs to write first:
- Test: no DB migration is required/executed for text clip rollout scope.
- Test: rollback path preserves project JSON payload integrity and legacy load/save behavior.
- Test: post-save validation catches malformed text payloads before render enqueue.

## 6) Compatibility Notes

Test stubs to write first:
- Test: non-text projects and renders are behaviorally unchanged after text feature introduction.
- Test: older render-contract consumers receive predictable behavior on extended fields.
- Test: unsupported contract versions never fail silently.
- Test: clip order semantics for existing clips remain unchanged unless explicitly edited.

## 7) Key Risks and Mitigations

Risk-oriented test stubs to write first:
- Test: parity drift sentinel fixtures detect preview/render mismatch in layout or ordering.
- Test: fast-path misclassification suite ensures conservative fallback behavior.
- Test: performance guard fixtures detect regression under high text clip/keyframe density.
- Test: security fixtures validate escaping and whitelist font mapping constraints.

## 8) Done Criteria

Verification stubs required before implementation completion:
- Test evidence: all new text feature suites pass in frontend and backend CI.
- Test evidence: parity fixtures pass for agreed representative cases.
- Test evidence: mixed-version compatibility cases pass with explicit policy outcomes.
- Test evidence: missing-font deterministic behavior and telemetry assertions pass.
- Test evidence: rollback/monitoring diagnostics checks are documented and validated.
