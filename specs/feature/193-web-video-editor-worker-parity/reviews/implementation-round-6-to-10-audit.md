# Feature 193 implementation audit — rounds 6–10

**Date:** 2026-09-15
**Scope:** ten-pass consistency audit after the local implementation and the
camera-plan/render fixes. Each round checked the implementation against
`spec.md`; a gap was fixed before the next round.

| Round | Surface | Result and corrective action |
|---|---|---|
| 1 | Shared camera evidence | **PASS after fix.** Five-point evidence now carries an optional detector/model fingerprint; plan fingerprints are generated and validated against the normalized plan. |
| 2 | Browser Face Focus | **PASS after fix.** Browser analysis keeps the existing MediaPipe model path, records `browser_running`, uses the clip's source-time `trimRange` and returns clip-relative evidence, and refuses to replace an existing plan with an empty centre fallback when no face is detected. |
| 3 | Face + Activity | **PASS after fix.** Activity uses frame-difference regions associated with the detected face envelope; unrelated background motion is rejected and `activity_unavailable` remains an explicit degraded outcome. |
| 4 | Playback | **PASS.** `PreviewPlayer` evaluates the same `CameraMotionPlan` at clip elapsed time. A stale plan is no longer applied after a source/revision-changing edit. |
| 5 | Quick Silence Cut | **PASS after fix.** Timeline ripple cuts persist the normalized cut map and fence source-time camera plans as `stale`; the editor requires re-analysis instead of silently using wrong keyframe times. |
| 6 | Render timeline handoff | **PASS after fix.** `MediaClip.cameraMotionPlan` survives `projectToTimeline` and round-trip conversion. Legacy render params also carry revision, camera-plan, and silence-map metadata; browser trim analysis now uses the same source-time window. |
| 7 | Hosted FFmpeg render | **PASS after fix.** Python render now consumes the normalized plan with bounded frame-time scale/crop expressions, validates keyframes, and keeps the final keyframe when bounding the expression. Invalid plans fail closed. |
| 8 | Worker routing and revision gate | **PASS after fix.** Full Scan carries `projectRevisionId`, trim/aspect/mark/policy/capability fingerprints; the executor echoes the validated revision in its output and promotion checks include it. Generic nested operation options are normalized before validation. |
| 9 | Auth, limits, and safety | **PASS.** Router procedures remain tenant-scoped and editor-authorized; source URLs use existing managed-asset boundaries; plan/evidence sizes and keyframe counts are bounded; no raw frames or credentials enter project JSON. |
| 10 | Tests, docs, and rollout | **PASS.** Focused Web tests (10 files, 122 tests), shared contract tests (3 files, 4 tests), Python render tests (11 tests with `--no-cov`), Worker composition tests (2 tests), router import smoke, esbuild syntax checks, and `git diff --check` passed. The spec records the local FFmpeg parity path and explicitly retains target-account, browser-fixture, production recovery, and durable revision-write gates. |

## Verification commands

- `npm --workspace apps/web exec vitest run ...` — 10 files, 122 tests passed (including the trim-window regression); the focused browser-analysis rerun is 2 tests passed.
- Server control-plane/composition tests — 3 files, 12 tests passed; executor and router import smoke passed.
- Worker composition evidence contract — `python3 -m unittest test_composition_scan.py`, 2 tests passed.
- `npx vitest run packages/shared/src/video-editor/__tests__/... apps/web/shared/verticalDramaMedia/__tests__/cameraMotion.test.ts` — 4 tests passed.
- `DEBUG=false ./.venv/bin/pytest --no-cov -q tests/unit/test_media_job_render_transform.py` — 11 tests passed.
- `node --import tsx -e "import('./server/routers/editorMediaJobs.ts')..."` — import smoke passed.
- Targeted `esbuild` entrypoint compilation for browser/shared files, plus
  router/executor import smoke — passed.
- `git diff --check` excluding generated MediaPipe/model assets — passed.

The repository-wide Python coverage threshold is not used as a focused proof
for this audit; the targeted Python test module passes with `--no-cov`. No
workspace TypeScript typecheck was run because the repository instruction
prohibits it under the current RAM budget.
