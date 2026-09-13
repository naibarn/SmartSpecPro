# 04: faster-whisper-whisperx

Status: contract, routing and readiness implemented; signed Faster-Whisper/WhisperX runtime remains an external promotion gate. Dependencies: 01,02,03.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: new Worker ASR runner/adapters; existing transcription command facade. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Implement real Faster-Whisper inference and consume lazy segments. Use WhisperX as optional forced alignment over recognized text; pyannote is independent optional diarization. Resolve source audio stream/range, resample with exact offsets, normalize output, stream measured progress and supervise process trees. Window long input with overlap and durable hashed checkpoints.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Actual files and deviations

- Worker routing accepts a manifest-backed `faster-whisper` profile and passes explicit word/diarization flags to its pinned runner protocol.
- No Faster-Whisper/WhisperX runtime is present in the current pack, so the profile remains unavailable and requires an opt-in runtime release plus genuine Thai smoke evidence.

## Tests to write first

Fixture runner handles silence, malformed output, stderr flooding, cancellation, crash and checkpoint resume; repeated seam speech is not dropped; chunk offsets apply once; unaligned words remain null; real opt-in Thai smoke proves native/forced timing distinction.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
