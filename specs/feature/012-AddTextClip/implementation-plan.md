# Implementation Plan: Feature 012 AddTextClip (T1 Only)

- date: 2026-02-15
- inputs: `implementation-spec.md`, `research-notes.md`, `interview-notes.md`
- planning_intent: `resume_progress`
- decision_mode: `smart_auto`

## 1) Delivery Objective

Deliver production-usable text clips on `T1` with deterministic preview/render parity, using ASS/libass as canonical render path and optional `drawtext` fast-path only for lossless-equivalent cases.

## 2) Impact Map (Potential Regressions)

1. `apps/web/client/src/services/projectManager.ts`
- Risk: save/load validation may fail if `text` track acceptance/defaulting is incomplete.

2. `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- Risk: add/select/move logic can regress existing clip handling if track filters are not isolated.

3. `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`
- Risk: introducing text layering may disturb current overlay/video compositing or performance.

4. `apps/web/shared/types/mediaJob.ts`
- Risk: contract changes may break existing job payload parsing for non-text clips if not backward compatible.

5. `python-backend/app/tasks/media_job_worker.py`
- Risk: new subtitle generation/render path can affect render latency and FFmpeg stability.

6. test suites under `apps/web/client/src/components/videoeditor/__tests__` and `python-backend/tests/unit`
- Risk: insufficient coverage may hide regressions in ordering, interpolation, and fallback behavior.

## 3) Plan of Record

## Phase 1: Contract and Validation Foundation

1. Extend project validation/defaulting to accept `text` tracks and text clip payload.
2. Define canonical text payload normalization on load/save, including defaults for optional fields.
3. Add schema checks for keyframe times and transform ranges.
4. Preserve backward compatibility for legacy projects lacking text fields.
5. Define a versioned **capability matrix** as strict-parity contract:
   - UI-exposed text/style controls
   - ASS canonical support status
   - drawtext fast-path eligibility status
6. Introduce explicit render/job contract versioning with mixed-version behavior policy for staggered deployments:
   - frontend/backend version negotiation or compatibility check
   - deterministic handling when unsupported text fields are encountered (`reject_with_clear_error` or gated downgrade path)
   - rollout-window compatibility tests for cross-version interactions

Exit criteria:
- load/save succeeds for legacy and new text projects.
- invalid payloads are rejected with deterministic errors.
- capability matrix is published and referenced by UI + render mapping logic.
- mixed-version compatibility behavior is defined and validated by tests.

## Phase 2: Editor and Timeline Behavior

1. Ensure Add Text creates/targets `T1` consistently and initializes defaults.
2. Enforce overlap-allowed semantics while preserving deterministic clip array order as z-order source.
3. Update timeline labels/markers for text clips and keyframe presence.
4. Keep text clip move guards constrained to text tracks.
5. Enforce strict-parity controls in UI (disable/hide unsupported capabilities).

Exit criteria:
- timeline interactions (select/move/trim/delete) work on `T1` text clips.
- overlapping clips render in expected order per clip array.
- unsupported controls are not user-selectable.

## Phase 3: Text Authoring and Keyframe Model

1. Align `TextClipEditor` controls with strict parity capability set.
2. Add/confirm support for required style/layout controls and transform controls.
3. Persist keyframes with segment easing plus optional per-property overrides in data model.
4. Keep UI initially simple if needed, but do not block schema support for per-property override.

Exit criteria:
- edits persist losslessly across save/load.
- no unsupported renderer features are exposed in strict parity mode.

## Phase 4: Preview Parity Engine

1. Render text clips in preview using canonical payload fields.
2. Load font whitelist via `@font-face` so preview and render share font assets.
3. Implement clip compositing order to match canonical clip array order.
4. Apply keyframe interpolation semantics matching canonical easing rules.
5. Create deterministic **parity golden fixtures** (fonts + timeline + timestamps) for overlap/easing/style checks.
6. Extend parity fixtures with i18n shaping cases (multiline Unicode, RTL, ligatures) and explicitly document any unsupported script behavior for v1.

Exit criteria:
- representative timestamp checks show expected position/style/order in preview.
- golden fixtures are reusable by automated tests.

## Phase 5: Render Pipeline (Canonical ASS + Fast-Path Gate)

1. Extend render contract conversion to retain text semantics end-to-end.
2. Build ASS generation path for text clip events/styles as canonical backend representation.
3. Integrate libass subtitle burn-in in worker render flow for text clips.
4. Implement `drawtext` fast-path gate with strict 100% equivalence check; fallback to ASS on any mismatch.
5. Emit structured reason codes for fast-path accept/reject decisions.
6. Ensure safe escaping/encoding for text content and style values in FFmpeg invocation.
7. Enforce whitelist font ID -> bundled asset mapping only.
8. Define deterministic missing-font behavior shared by preview and render paths (configured fallback font or explicit hard-fail), with telemetry for unresolved font IDs.

Exit criteria:
- render output contains text clips with expected style/transform.
- fast-path never activates for partially supported semantics.
- fast-path telemetry enables fallback diagnosis.

## Phase 6: Verification and Hardening

1. Add unit/component/backend tests for validation, contract mapping, ordering, interpolation, and fallback behavior.
2. Add parity-focused test matrix for representative timestamps and overlapping clips.
3. Add snapshot-based compatibility tests for legacy project payloads.
4. Add a reproducible text-heavy benchmark scenario (clip/keyframe density profile) with explicit pass/fail render-time threshold before release.
5. Add security-focused tests for filter escaping and font mapping boundaries.
6. Document operational diagnostics for text render failures.
7. Add mixed-version compatibility tests for render/job contracts across deployment windows.
8. Add fallback-path tests for missing/invalid font IDs to verify deterministic behavior and parity outcomes.

Exit criteria:
- new tests pass and guard major regression vectors.
- parity mismatches are detectable via repeatable tests.
- legacy compatibility snapshots pass.

## 4) Regression Prevention Strategy

1. Test gates
- Add focused tests in frontend and backend for text-specific flows.
- Add contract round-trip tests for project/timeline conversion.
- Add mixed-version contract compatibility tests for staggered rollout scenarios.
- Add golden parity fixtures to catch visual regressions.
- Add legacy snapshot fixtures for backward compatibility.

2. Rollout strategy
- Ship behind feature toggle if available in editor entry point.
- Enable internal/canary users first, then broaden once parity test outcomes are stable.

3. Monitoring and ownership
- Capture render failure rate and text-render-specific error counts from worker logs.
- Record fast-path decisions with reason codes and fallback metrics.
- Maintain an incident triage checklist with required diagnostics: job ID, fast-path reason code, ASS generation status, and font ID resolution status.
- Define release SLO baseline:
  - text render success rate target >= 99.5%
  - parity-critical error budget <= 0.5% of text render jobs
- Alert triggers:
  - 15-minute text render failure spike above baseline
  - repeated fast-path misclassification signals
- Ownership: video editor frontend + media worker maintainers share sign-off.

## 5) Data Safety Strategy

- Risk classification: `none` for DB schema migration.
- Reason: `video_editor_projects.projectData` already stores flexible JSON; no relational schema or destructive data migration is required.

Backup and migration policy:
1. Pre-migration backup plan
- Not required for DB schema in this scope because no DB migration executes.

2. Restore/rollback runbook (application-level)
- Trigger conditions:
  - elevated render failures tied to text processing
  - parity regressions in production validation checks
  - project load/save failures for existing users
- Actions:
  - disable text feature flag/canary exposure
  - rollback deployment to previous stable build
  - preserve project JSON payloads as-is (no destructive transformations)
- Verification after rollback:
  - legacy projects open and save successfully
  - non-text renders return to baseline success rate
  - text feature remains gated until fixes are validated

3. Non-destructive migration-first approach
- For this scope, `expand -> migrate/backfill -> contract` is not needed because no data migration is introduced.
- If future schema extraction occurs, this sequence becomes mandatory.

4. Automated consistency checks
- Add post-save validation assertions and render-contract validation tests to ensure text payload integrity.

## 6) Compatibility Notes

1. Existing non-text functionality must remain behaviorally unchanged.
2. Legacy projects lacking text payload remain loadable with safe defaults.
3. Existing render contract consumers must accept extended text fields without breaking older job payloads.
4. Mixed-version rollout behavior is explicit: unsupported contract versions must fail predictably (clear error) or follow gated downgrade policy; no silent data loss.
5. clip order semantics for existing clips remain unchanged unless explicitly edited.

## 7) Key Risks and Mitigations

1. Parity drift between browser and FFmpeg text layout
- Mitigation: strict capability matrix gating, shared fonts, timestamp-based parity tests.

2. FFmpeg expression/escaping errors for dynamic text
- Mitigation: centralized escaping strategy and targeted worker security tests.

3. Fast-path misclassification causing visual mismatch
- Mitigation: conservative eligibility rules, reason-code telemetry, and default fallback to ASS.

4. Performance regressions with many text clips
- Mitigation: early profiling and capped complexity for v1 where needed.

## 8) Done Criteria

1. Feature requirements in `implementation-spec.md` are satisfied for T1 scope.
2. Automated tests cover critical text flows and pass in CI.
3. Preview/render parity validated for agreed representative cases.
4. Rollback controls and monitoring are documented and usable by maintainers.
5. Capability matrix is in use and strict-parity UI behavior is enforced.
6. Mixed-version contract compatibility behavior is implemented and covered by automated tests.
7. Missing-font handling is deterministic, instrumented, and parity-validated.
