# Feature 179 TDD Plan

## Test layers

1. **Pure TypeScript contract tests:** valid/invalid schemas, bounded intervals, hash-linked parent artifacts, adapter policy rules, stage dependency ordering, and composed edit-map determinism.
2. **Pure workflow tests:** subtitle-first versus speaker-first recipes, manual override precedence, VAD/diarization/visual time-window joins, stable hold/slow-move/cut decisions, condensation proposal edits, stale plan detection, and output-to-source mapping.
3. **Worker UI tests:** panel state matrix, adapter preflight display, selected/disabled/fallback-denied states, scan progress/cancel/resume, evidence jump, and approval gating. Use jsdom for browser-facing components.
4. **Rust tests:** job type admission, capability preflight, policy snapshot parsing, external adapter JSONL validation, checkpoint idempotency, cancellation, safe command construction, and typed unavailable/failure outcomes.
5. **Integration contracts:** server job payload ↔ Worker job payload, callback/publication hashes, artifact ownership, and FFmpeg/Remotion input parity.
6. **Browser/manual evidence:** run the existing Worker browser smoke harness where possible and record canonical viewports/skip reasons.

## TDD rules per section

- Add the smallest failing test for each contract/behavior before implementation.
- Keep model/GPU tests deterministic by testing capability and evidence contracts; do not use mocked detections as real runtime success.
- For renderer tests, compare the compiled composed edit map and source-time mapping rather than pixels unless a fixture renderer is already available.
- After each fix, rerun only the focused test first, then the relevant section suite, then Rust tests if Rust changed.
- Do not run full `npm run check`.

## Exit criteria

Every section has passing focused tests or a documented unavailable runtime check. A section is not complete if it only compiles but has no failure-path test for its key contract.
