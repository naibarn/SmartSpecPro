<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test -- --run --environment jsdom
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-bin-r2-ingest
section-03-transform-keyframes-camera
section-04-silence-audio-ducking
section-05-ai-music-recording-speakers-subtitles
section-06-blur-object-tracking
section-07-render-modes-exports
section-08-preview-ruler-timeline
section-09-symbols-ai-code-overlays
section-10-persistence-results-rollout-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 shared contracts | — | 02–10 | Yes |
| 02 Bin/R2 ingest | 01 | 03, 07, 08, 10 | After 01 |
| 03 Transform/keyframes/camera | 01 | 07, 08, 10 | After 01 |
| 04 Silence/audio/ducking | 01, 02 | 05, 07, 08, 10 | After 02 |
| 05 AI/recording/speakers/subtitles | 01, 02, 04 | 07, 08, 10 | After 04 |
| 06 Blur/tracking | 01, 03 | 07, 08, 10 | After 03 |
| 07 Render/exports | 01–06 | 10 | No |
| 08 Preview/ruler/timeline | 03, 04 | 10 | After 03/04 |
| 09 Symbols/AI code | 01, 03 | 07, 08, 10 | After 03 |
| 10 Persistence/results/rollout/proof | 01–09 | — | No |

## Execution order

1. Shared contracts and fixtures.
2. Bin/R2 ingest and Transform/keyframe primitives can proceed in parallel.
3. Silence/audio/ducking, then AI/recording/speaker/subtitle and blur/tracking.
4. Preview/ruler/timeline and Symbols/AI overlays.
5. Render/export integration, persistence/results UX, rollout and final proof.

Each section owns its listed files and focused tests. Cross-section changes must
update the contract fixture and the dependent section's tests in the same
change. The implementation must preserve unrelated dirty worktree changes.

## Section summaries

- **01** freezes the shared NLE, upload, analysis, render and artifact schemas.
- **02** makes Bin the default and implements safe single/multipart R2 ingest.
- **03** ports Transform/Keyframes and camera pan/zoom with deterministic parity.
- **04** ports Quick Silence Cut, extraction and waveform/preset ducking.
- **05** ports AI Music, microphone recording, speaker planning and subtitles.
- **06** adds privacy blur and approved face/object tracking.
- **07** adds Auto/Manual/GPU render, MP3 and still-frame export.
- **08** adds preview modes, detailed adaptive rulers and many-track scrolling.
- **09** adds stock SVG symbols and sandboxed AI CSS/React/Three.js overlays.
- **10** migrates persistence, completes Worker Jobs/results UX and proves rollout.
