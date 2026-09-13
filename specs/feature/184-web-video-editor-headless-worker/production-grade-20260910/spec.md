# Web Video Editor production-grade completion plan

**Feature:** 184 Web Video Editor + headless Worker
**Plan revision:** 2026-09-10
**User-facing queue name:** `Worker Jobs` / `คิวงาน Worker` (Thai: `คิวงานประมวลผลของฉัน`)
**Primary route:** `/video-editor`

## Problem and outcome

The current Web editor exposes most of the Worker App control inventory, but the
runtime boundary is incomplete. Redis can be restoring a large RDB while the web
process performs its one startup ping, and the Worker previously advertised a
single generic editor capability even though only `editor_video_render` had a
real executor. The result is either a crash loop or a job that is accepted by the
queue and cannot execute.

This plan makes the boundary production-grade. The browser owns editing,
selection, preview, revision authoring and light transforms. Redis is a
recoverable, observable queue dependency. The Worker publishes an operation
manifest and claims only operations with a real executor or a healthy, versioned
adapter. Every output is revision-pinned, checksummed, QC-verified and returned
to the server for review before it becomes current media.

## Current evidence and explicit gaps

- The web server now reaches `Pre-flight checks passed (DB + Redis OK)` when the
  local Redis container is healthy; startup retry covers RDB restore timing.
- The Worker now has native FFmpeg/FFprobe executors for probe, proxy, waveform,
  thumbnail, analysis, Quick Silence Cut data, audio extraction, MP3 export,
  recording normalization, render still and full render.
- Operation-specific claim tokens prevent an FFmpeg-only Worker from claiming
  AI music, AI Media Studio, ASR, diarization, face/object tracking, subtitle
  alignment or privacy tracking. Those operations remain fail-closed until an
  adapter health probe and staging proof exist.
- Local focused tests and Rust tests pass. R2, real microphone devices, GPU,
  provider credits, external adapters, browser production smoke and deployment
  are separate evidence gates; they are not implied by unit tests.
- `video_editor_projects` still lacks a direct tenant column and the upload
  session tables do not yet have a complete resumable-session API. These are
  first-class work items below.

## Non-goals and safety

Do not delete the existing Redis volume, silently substitute a provider, upload
local-only paths, mutate a current revision from a stale Worker result, or expose
an unreviewed artifact as current. Keep `/render-jobs` as a query-preserving alias
and retain `?legacy=1` only as a time-bounded rollback surface. Do not run the
repository-wide TypeScript typecheck in this plan; use focused tests and bounded
transpilation while the memory constraint remains active.

## Delivery sections

1. Redis readiness, memory and queue reliability.
2. Worker capability manifest and adapter protocol.
3. Resumable Bin/Library uploads and asset durability.
4. Project tenant isolation, revision CAS and recovery.
5. Timeline correctness, Transform/Keyframes and multi-track performance.
6. Heavy media adapters: silence, audio, speaker, subtitle, blur and AI.
7. Render/export/output QC (Auto, Remotion, FFmpeg, GPU, MP3, still frame).
8. Preview, recording, accessibility and responsive browser UX.
9. Security, credits, observability and support operations.
10. Staged rollout, browser proof, rollback and acceptance matrix.

Each section below has ownership, API/data contracts, implementation tasks,
tests, staging evidence and a rollback condition. Dependencies flow in numeric
order; sections 1–3 can begin independently, while sections 4–10 require the
shared operation/capability contract.

## Acceptance gates

A release is production-ready only when all of the following are true:

- `/readyz` reports DB and Redis ready across restart, delayed Redis restore and
  transient reconnect scenarios; queue depth and rejected writes are observable.
- Worker registration includes a signed, versioned operation manifest. Claim
  selection is a full superset check with operation-level tokens; unsupported
  jobs remain queued with an actionable reason.
- Single and multiple Bin uploads complete through R2 with checksum, quota,
  idempotency, resume and abort behavior; Library, Media History and Bin share
  the same tenant-owned asset projection.
- Two-tab and stale-result tests prove revision CAS and no stale publication.
- At least 20 tracks scroll and virtualize without losing lock/mute/solo/volume,
  ruler, snap, split, trim, drag and keyboard behavior.
- Browser proof covers 390x844, 768x1024, 1280x800 and 1440x900. Real Worker
  claim, R2 artifact publication, microphone permission, GPU mode and every
  paid/provider adapter have explicit staging records.
- A rollback can disable web dispatch or one operation family without deleting
  queued jobs or user projects.
