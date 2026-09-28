# 03: runtime-packs-and-readiness

Status: implemented in this workspace slice. Dependencies: 01.

## Context and ownership

Parent Feature 180 additive extension. Preserve Whisper.cpp and existing saved projects. Ownership surface: Worker runtime_manifest.rs, packaging/install validation, runtime tests. Exact new paths must follow adjacent module conventions. Shared schemas are owned by section 01; downstream sections request contract changes there rather than fork DTOs. Preserve unrelated dirty changes.

## Required design

Add optional independently versioned ASR/alignment/diarization packs. Pin runner, model, tokenizer, dependency hashes and licenses with device/language support. Install explicitly with atomic activation and rollback. Probe actual inference readiness; preserve old manifests and render requirements. Separate Python environments for incompatible dependencies.

Follow the versioned contracts, privacy rules, resource bounds and source-timebase rules in [master plan](../claude-plan.md). No fake inference, confidence, timestamps, speaker identity, capability readiness or silent fallback.

## Actual files and deviations

- `apps/worker-app/src-tauri/src/runtime_manifest.rs` now carries optional Faster-Whisper/WhisperX/VibeVoice profile descriptors.
- `worker_app_transcription_capabilities` reports file-backed readiness and never marks an absent pack ready.
- Existing bundled Whisper.cpp remains the only ready profile in the current runtime manifest; no model download was performed.

## Tests to write first

Legacy manifest still parses; absent optional pack does not disable rendering; corrupt download cannot activate; offline ready pack works; unsupported GPU/language returns reason; ASR and Music3 cannot simultaneously acquire an exclusive GPU lease.

Use existing Vitest/Rust conventions and fake subprocess fixtures for default CI; genuine model checks are opt-in and separately reported. A failed test must demonstrate the relevant behavior before implementation.

## Implementation sequence

1. Inspect affected imports/callers and existing tests; establish the narrow baseline.
2. Add the specified behavioral tests and record expected failures.
3. Implement the smallest compatible change using existing lifecycle and artifact abstractions.
4. Run targeted tests, inspect diff and document any runtime-only verification still pending.

## Completion evidence

Attach changed paths, exact test commands/results, schema/runtime revisions and remaining deployment gates. Required tests must pass; unrun GPU/provider/browser checks remain explicitly unverified. Do not enable a profile before its real runtime gate passes.
