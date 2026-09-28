# Feature 179 Deep-Plan Research

## Research decision

- **Codebase research: required and completed.** The repository is a git worktree with existing Web, Worker App, Tauri/Rust, Remotion, and media-job code.
- **Web research: required and completed.** The specification names Silero VAD, FireRedVAD, TEN VAD, WebRTC VAD, pyannote, and MediaPipe.
- **Testing research: required and completed.** The repository uses Vitest for Web/shared/server tests, React tests for Worker UI, and Rust `cargo test` for Tauri/worker logic. The user has explicitly prohibited the memory-heavy full `npm run check`; the plan therefore uses focused TypeScript tests, Worker typecheck where affordable, Rust tests, contract checks, and `git diff --check`.

## Discovery limitation

AGENTS.md requires SocratiCode-first discovery. No `codebase_status`, `codebase_search`, `codebase_symbols`, or related SocratiCode MCP tool was exposed in this session. I used bounded `rg`, `rg --files`, `sed`, package metadata, and targeted symbol searches instead. This is static/local evidence, not a claim that the production Worker, GPU, model files, or live queue are currently healthy.

## Existing codebase findings

### Web/shared contracts

- `apps/web/shared/verticalDramaMedia/contracts.ts` already owns media asset, probe, dead-air, reframe, edit-plan, QC, and media-job Zod contracts.
- `apps/web/shared/verticalDramaMedia/workflow.ts` resolves capability-gated workflows and records immutable policy/capability snapshots. Feature 179 should follow this policy-snapshot pattern instead of creating an untracked configuration path.
- `apps/web/shared/verticalDramaMedia/audioScoringContracts.ts` already defines the audio-analysis/Music3/score-mix job family and is the closest precedent for durable worker payloads.
- `apps/web/server/routers/workerJobs.ts`, `workerSchedulerService.ts`, `workerCallbackService.ts`, and `workerArtifactService.ts` are the existing queue, callback, and artifact boundaries. New jobs must use these boundaries rather than direct UI-to-worker calls.

### Worker App and Tauri

- `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx` already contains aspect-ratio crop guides, MediaPipe face preview state, smooth focus movement, silence detection, waveform fallback, playhead skipping helpers, and FFmpeg/Remotion controls.
- `apps/worker-app/src/screens/media-workspace/mediaWorkspaceTimeline.ts` provides pure silence-range normalization, playable-time seeking, playhead advancement, dB threshold mapping, and waveform threshold placement. It is the natural home for shared edit-map and manual-range behavior, not a second UI-only implementation.
- `apps/worker-app/src-tauri/src/media_pipeline.rs` and `worker_loop.rs` already contain media probing, FFmpeg allowlisting, derived-output QC, and episode score mix execution. Feature 179 should add stage-specific composition and job dispatch around these functions.
- `apps/worker-app/src-tauri/src/worker_executor.rs` contains explicit media job type/capability constants for existing audio work. New scan and edit-plan job types belong beside them and must not be advertised as available unless the runtime preflight proves the executor exists.
- `apps/worker-app/tests/media-workspace/` contains timeline, browser-smoke, persistence, and media UI test patterns. Focused tests should be added here for workflow ordering, adapter policy, playhead mapping, and UI state transitions.

### Existing implementation gaps relevant to Feature 179

1. The current player has local face preview behavior but no durable full-video scan artifact with stable track IDs, evidence provenance, or active-speaker confidence.
2. Silence ranges and manual cuts exist as local/editor data, but there is no single immutable composed edit map consumed identically by FFmpeg and Remotion.
3. There is no user-visible adapter policy snapshot that distinguishes selected, unavailable, failed, and fallback-denied adapters.
4. Subtitle/transcript data is available in nearby worker/UI flows, but no workflow node explicitly declares authored subtitle versus observed ASR evidence or allows subtitle-first editing before reframe.
5. Worker job type constants and durable callbacks exist, but Feature 179 job payloads, scan artifact publication, stale parent edit-map checks, and idempotent retry semantics are not implemented.
6. Current face tracking can still be preview-only. A production result must never claim a face/speaker track without a detector/model identity and evidence checksum.

## Web research findings

### Silero VAD

Official repository/wiki: https://github.com/snakers4/silero-vad and https://github.com/snakers4/silero-vad/wiki/Version-history-and-Available-Models

The project publishes ONNX VAD models and supports streaming-style inference. The adapter should therefore make sample rate, model revision, model checksum, frame size, threshold, and hysteresis explicit in its immutable runtime evidence. It must not assume that a model import alone means inference is available.

### TEN VAD

Official repository: https://github.com/TEN-framework/ten-vad

TEN VAD is positioned as a low-latency, frame-level realtime VAD with lower computational cost than heavier alternatives. It is suitable for Worker preview/interactive feedback, but the plan keeps full-scan/export evidence separate from realtime preview evidence so a preview adapter cannot silently become the authoritative render decision.

### FireRedVAD

Official repository: https://github.com/FireRedTeam/FireRedVAD

FireRedVAD is treated as an experimental/benchmarkable adapter for Thai drama audio, music beds, and SFX. The system records the exact evaluation profile and comparison metrics; it does not automatically replace the configured baseline based on a single clip.

### WebRTC VAD

WebRTC VAD is retained as an explicitly selectable low-resource fallback. Its decisions are frame-oriented and should be normalized into the same interval schema as other adapters. Fallback is only allowed when the user policy permits it and the result records `fallbackFrom`, `fallbackReason`, and the actual adapter.

### Speaker diarization and active speaker

Official pyannote repository: https://github.com/pyannote/pyannote-audio

pyannote is appropriate as an optional, heavier diarization backend. It is not required for basic VAD and must not be bundled into the default low-resource path. Visual face/body tracking and audio speaker diarization remain separate evidence streams, joined by time-window scoring rather than by assuming that a face is speaking.

### MediaPipe face detection

Official documentation: https://developers.google.com/mediapipe/solutions/vision/face_detector

MediaPipe Face Detector can provide face detections/keypoints for the existing preview. The plan treats it as one visual evidence source, adds body/person fallback when the face is unavailable, and keeps active-speaker selection dependent on synchronized audio evidence.

## Testing strategy findings

- Pure contract and edit-map functions: Vitest, small deterministic fixtures.
- Worker UI state and workflow ordering: existing React/Vitest media-workspace tests; use jsdom where required.
- Rust media/job validation: `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml`.
- Runtime-dependent adapter tests: capability-matrix contract tests and explicit unavailable/error tests; no fake success when model binaries or GPU are absent.
- Browser evidence: Worker browser smoke if the existing harness starts; otherwise record skipped with the exact reason in `implementation/ui-browser-evidence.md`.

## Constraints carried into the plan

- Preserve the existing user-directed workflow model. Only invariants are immutable source/output references, explicit coordinate/edit-map mapping, adapter policy visibility, stale-input detection, and approval before destructive render.
- Preserve existing silence/dead-air editing and manual cuts. Feature 179 augments them and never makes speaker-aware reframing a prerequisite.
- Do not run full `npm run check` because the user stated RAM is insufficient.
- Do not claim genuine model/GPU/runtime success from a static test or unavailable local model.
- Worktree is already dirty across Web, Worker, Rust, schema, and docs files. No reset, broad cleanup, or unrelated rewrite is allowed.
