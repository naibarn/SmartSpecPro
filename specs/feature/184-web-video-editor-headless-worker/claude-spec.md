# Synthesized implementation specification — Feature 184

## Outcome

Deliver a Web-first video editor whose editing state is server-backed and whose heavy media work is executed by a headless Worker. The Web surface replaces the current legacy Web editor at `/video-editor` after a controlled rollout. The Worker App editor remains a temporary fallback while parity and reliability are measured.

## In-scope capabilities

- Reuse the Worker editor's timeline behavior: multi-track video/B-roll/audio/subtitles, trim/split/move/resize, transforms, reframe, text/image/SVG/blur/code overlays, fades/ducking, silence/dead-air review, subtitles, and project import/export.
- Extract platform-neutral timeline/model/reducer logic and browser UI; native file picker, local paths, reveal-file, and credentials stay behind a platform adapter.
- Persist a canonical versioned NLE project on the server. Reuse `video_editor_projects` as the current Web project base and add revision/asset/job relationships safely; do not collide with Feature 133 scene-based `videoProjects`.
- Migrate Worker NLE and legacy Web project formats with immutable source retention, explicit asset mapping, missing/unsupported-field reports, and no silent data loss.
- Use managed assets and proxy artifacts for browser playback. Original media remains authoritative for final render and timing.
- Define a versioned `smartaihub.media.job` envelope with allowlisted operations and typed stages, resource/capability requirements, verification, retry, billing, and output declarations.
- Extend existing `worker_jobs`/scheduler/lease/event/artifact lifecycle. Worker pulls jobs, executes deterministic FFmpeg/Remotion adapters, uploads verified artifacts, and server publishes idempotently.
- Provide API procedures for project CRUD/revisions/import, preflight/submit/status/cancel/retry/replay/apply-review, with auth, tenant ownership, CAS, idempotency, stable error codes, and credit reserve/reconcile.
- Rename the queue UI to `Worker Jobs` at `/worker-jobs`; use Thai `คิวงานประมวลผลของฉัน`, short navigation `คิวงาน Worker`, and operation-specific labels. Keep `/render-jobs` as a query-preserving alias without renaming APIs, DB tables, job IDs, or historical operation names.
- Provide diagnostics, replay, retention, notification, rollout, rollback, and measurable feature-parity gates.

## Non-goals and safety

Do not implement the Spec 02 semantic editing/EDL/B-roll intelligence/GPU optimization scope, rewrite all sidecars, remove Worker UI immediately, call LLM/provider APIs from Worker, execute arbitrary shell/Python/remote overlay code, or spend credits/modify production data as part of proof.

## Required acceptance

The implementation must pass the 18 acceptance scenarios in the source spec, including project import, browser-only editing, CAS/offline recovery, duplicate submit, real FFmpeg/Remotion output, proxy timing, no-worker behavior, leases/cancel/retry, artifact integrity, stale-result review, cross-tenant security, replay, existing job-family compatibility, rollout/rollback, and Worker Jobs naming/route migration.

## Implementation constraints

- Preserve unrelated dirty work.
- Use existing repository conventions and package manager commands.
- Make schema changes single-writer and migration-safe.
- Tests must cover shared TypeScript/Rust fixtures, server/router contracts, browser states/accessibility, real sidecar smoke where available, and explicit skipped evidence.
- All browser-visible UI sections must document loading/empty/error/success/disabled/focus/selected states, responsive behavior, copy, and browser evidence.
