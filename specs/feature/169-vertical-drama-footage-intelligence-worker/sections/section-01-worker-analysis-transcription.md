# Section 01 — Worker media intelligence and transcription

## Ownership

Own probe, local audio extraction, VAD/dead-air, visual diagnostics, keyframes, HyperFrames/Whisper invocation, transcript artifact and `vd-footage-guide-v1`. Do not generate story prose, deduct credits or mutate Character DNA.

## Target areas

- `apps/worker-app/src-tauri/src/worker_executor.rs`
- `apps/worker-app/src-tauri/src/worker_loop.rs`
- `apps/worker-app/src-tauri/src/commands.rs`
- `apps/worker-app/src-tauri/src/media_pipeline.rs`
- runtime manifest/doctor and HyperFrames runtime pack
- `apps/web/shared/workerRuntime.ts` compatibility fixtures

## Required behavior

- validate managed/local source boundary and checksum
- run FFprobe and record structured metadata
- transcribe original audio with Thai `large-v3` when requested
- preserve word-level original timestamps
- expose silence/speech/scene/keyframe data with confidence and provenance
- produce bounded guide with facts, observations, recommendations and unknowns
- use the pinned runtime-pack Node/HyperFrames executable without `npx` or network installation
- publish integer-millisecond timestamps and explicit complete/partial/unavailable status
- fail clearly when runtime/model is missing; allow deterministic no-transcript mode only when policy permits

## TDD and acceptance

Fixtures must prove transcript tokens and guide output are deterministic under a fixed runtime, timestamps survive later trimming, speech is not cut by an unapproved dead-air suggestion, and no full video is sent to an LLM for semantic guidance.
