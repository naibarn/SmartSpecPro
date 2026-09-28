# Research Notes

## Research decision

- Codebase research: required. SocratiCode MCP was not available in this runtime, so targeted shell discovery (`rg`, `sed`) was used and exact paths were verified before planning.
- Web research: not required for this implementation. The feature must use the repository's existing HyperFrames and skill/vision boundaries; external provider behavior is not a design authority here.
- Testing: the Worker App has TypeScript `tsc --noEmit`, Rust `cargo test`, and the web package uses Vitest. Pure matching logic should be covered without provider or paid-model calls.

## Verified seams

- `apps/worker-app/src/screens/media-workspace/AutoSubtitleModal.tsx` invokes `worker_app_transcribe_audio`, parses HyperFrames' canonical `audio-transcript.v1`, and writes subtitle clips to T1. It currently defaults word timestamps off.
- `apps/worker-app/src-tauri/src/commands.rs` owns HyperFrames invocation and normalization. The canonical response includes segment/word timestamps, timing origin, model/runtime revision, checksum, and warnings.
- `apps/worker-app/src/types/nleProject.ts` models `audio_voice`, `video_main`, `video_broll`, image assets, source paths/URLs, trim ranges, and `VideoProjectDraft.metadata`.
- `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx` owns NLE state and applies subtitle updates. `MultiTrackTimeline` already emits full-project updates.
- The Worker App is already connected to the server using execution/upload tokens and device proof. `apps/web/server/routes/workerSeriesControlPlane.ts` provides authenticated worker-scoped routes and series authorization.
- The server has image/vision helpers in `apps/web/server/routers/skills.ts`, including tenant-scoped image URL resolution and vision LLM calls. Existing public skill execution has credit/delegation semantics and is not suitable for sending arbitrary local paths directly.
- `worker_app_upload_to_library` currently assumes video/mp4, so the implementation must not silently reuse it for images without adding content-type validation and a compatible upload contract.
- `apps/tauri-shell` contains a local image LLM command, but the Worker App does not register that command. The feature therefore needs an explicit server skill/vision adapter or a clear unavailable state; it must not guess that local Gemma is available.
- Existing Worker App release version is `0.1.339`; its package scripts expose `typecheck`, `cargo test`, and Tauri build/release scripts.

## Key risks discovered

1. A source audio file's timestamps are not automatically project timeline timestamps after trim, speed, or offset changes. The plan must persist a source-to-project time map and refuse silent approximation when multiple sources cannot be mapped.
2. Image captions need a stable asset fingerprint and analyzer/model revision so previews are reproducible and stale analyses cannot be applied to a changed image.
3. Automatic reorder can produce a visually plausible but semantically wrong result. Original order remains the fallback, reordering requires a global margin and per-image confidence threshold, and users must preview before apply.
4. A worker route must keep tenant, worker, series, and skill authorization server-derived. Local file paths and raw secrets must never be sent to an LLM or stored in the project.
5. A preview must be side-effect free. Apply should be one guarded NLE update, preserve voice/subtitles, and retain an undo snapshot.
