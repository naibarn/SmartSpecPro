<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-job-spec-types
section-02-media-job-client
section-03-desktop-engine-adapter
section-04-web-engine-adapter
section-05-frontend-consolidation
section-06-web-ui
section-07-ffmpeg-bundling
section-08-validation-security
section-09-testing
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-job-spec-types | - | 02, 03, 04, 05, 06, 07, 08 | Yes (start here) |
| section-02-media-job-client | 01 | 03, 04, 05, 06 | No |
| section-03-desktop-engine-adapter | 01, 02 | 05, 07 | Yes (with 04) |
| section-04-web-engine-adapter | 01, 02 | 05, 06 | Yes (with 03) |
| section-05-frontend-consolidation | 01, 02, 03, 04 | 06 | No |
| section-06-web-ui | 01, 02, 04, 05 | - | No |
| section-07-ffmpeg-bundling | 03 | - | Yes (with 05, 06) |
| section-08-validation-security | 01, 02 | - | Yes (with 03, 04) |
| section-09-testing | all | - | No (final) |

## Execution Order

1. **section-01-job-spec-types** (no dependencies)
2. **section-02-media-job-client** (after 01)
3. **section-03-desktop-engine-adapter**, **section-04-web-engine-adapter**, **section-08-validation-security** (parallel after 02)
4. **section-05-frontend-consolidation**, **section-07-ffmpeg-bundling** (parallel after 03+04)
5. **section-06-web-ui** (after 05)
6. **section-09-testing** (final verification)

## Section Summaries

### section-01-job-spec-types
Define the Media Job Spec TypeScript types in `apps/web/shared/types/mediaJob.ts`: Asset, Timeline, Clip, Job Envelope, Progress, Result, Error. Include validation function and seconds↔ms conversion helpers. Corresponding Python dataclasses for Celery worker.

### section-02-media-job-client
Create `MediaJobClient` with `IEngineAdapter` interface, auto-detection of platform (Tauri vs web), and typed convenience methods (probe, render, waveform, deadAir, etc.).

### section-03-desktop-engine-adapter
Tauri sidecar implementation: `TauriEngineAdapter` (TypeScript) + `job_dispatcher.rs` (Rust). Rebuild `build_filter_complex` for trim+concat. Implement real waveform extraction, silence detection. Fix process tracking bug. Handle audio-only/video-only assets.

### section-04-web-engine-adapter
Python/Celery worker (`media_job_worker.py`) for FFmpeg execution. Node.js API routes (`mediaJobs.ts`) with SSE progress streaming. Redis key schema for cross-language communication. Auth, rate limiting, audit logging integration.

### section-05-frontend-consolidation
Merge VideoEditor Phase0-3 into single component. Wire to MediaJobClient. Migrate time units to ms (version 2.0). Fix duplicate types, remove @ts-nocheck. Connect WaveformCanvas and SilenceDetectionPanel to real backends.

### section-06-web-ui
Enable video editor on web browsers. WebAssetResolver for file uploads. WebProjectManager for save/load. Platform-aware components (preview player, export dialog, media library). Navigation integration.

### section-07-ffmpeg-bundling
Configure Tauri 2 `externalBin` for FFmpeg/FFprobe sidecar. Platform-specific binary placement (macOS arm64/x64, Windows x64). Replace hardcoded paths with sidecar resolution. Graceful Linux fallback.

### section-08-validation-security
Job Spec schema validation. SSRF prevention for web URIs. Path sanitization extension (add subtitle/image extensions). Codec/preset allowlist. Desktop sandbox enforcement. Web backend resource limits.

### section-09-testing
Unit tests for all phases: TypeScript (Vitest), Rust (cargo test), Python (pytest). Integration tests for desktop and web pipelines. End-to-end job submission flow.
