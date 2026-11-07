# Section 02 checkpoint — audio runtime truthfulness

Date: 2026-11-07

## Changes

- Removed Demucs audio capabilities from the Remotion executor heartbeat and
  claim hints. The executor advertises only rendering capabilities that its
  managed runtime currently verifies.
- Audio repair dispatch now matches the dedicated job type only; an unrelated
  job carrying a generic `targetIssue` field cannot enter the repair path.
- The legacy Demucs script now reports `unavailable` when Demucs v4/PyTorch are
  missing. It refuses to report success without a source video, a matching TTS
  file, successful stem separation, a successful mix/remux, and a non-empty
  output. It no longer falls back to passing the original audio through as a
  repaired result.
- The Audio QC evaluator now requires worker-supplied speech, sync, loudness,
  peak, phase, clipping, DC-offset, and bleed measurements. Missing or invalid
  measurements fail closed instead of receiving defaults that could create a
  fabricated pass report.

## Verification

- `JWT_SECRET=local-test-secret pnpm exec vitest run server/services/__tests__/verticalDramaAudioQc.test.ts`
  — passed, 13 tests.
- `pnpm exec node --test --import tsx test/audioRepair.test.ts`
  — passed, 3 tests.
- `python3 -m py_compile scripts/demucs-repair.py` — passed.
- `python3 scripts/demucs-repair.py --check-status-only` — valid status;
  current workspace reports `demucsInstalled: false`, `engine: unavailable`.
- `git diff --check` — passed.
- Repository-wide TypeScript check was not run under the local resource policy.

## Remaining runtime prerequisite

Feature 175 repair, per-shot QC generation, persisted mastering measurements,
and separable Foley/Ambience stems remain unavailable. The current runtime has
no installed Demucs v4/PyTorch engine; the current Worker App audio lane handles
episode analysis and score mixing, not Feature 175 stem repair. The repair
mutation remains precondition-failed, QC remains `UNAVAILABLE` until a real
report exists, and the mix UI keeps Foley/Ambience controls disabled. No audio
job or measurement was fabricated. These optional audio paths do not gate
image generation, video generation, or successful video assembly.

To finish the remaining feature gap, an approved worker runtime must be selected
and provisioned with the required codecs/model runtime, source-clip and matching
TTS artifact binding, canonical `worker_jobs` plus outbox admission, idempotent
credit reservation, and manifest/QC writeback. No new queue or compute target
was introduced in this checkpoint.
