# Section 01 — Shared editor, upload and Worker-job contracts

## Goal

Freeze one versioned semantic contract so browser preview, server persistence,
and Tauri/FFmpeg/Remotion execution consume the same project document. This
section is a prerequisite for every later panel and must land before database or
UI behavior changes.

## Ownership and files

- `packages/shared/src/video-editor/` (use the existing shared package location;
  do not create a duplicate package): NLE document, transform, audio, subtitle,
  analysis, upload, render and manifest schemas.
- `apps/web/server/routers/editorMediaJobs.ts` and its service: zod adapters,
  preflight/submit/status/cancel/retry/replay/review/apply envelopes.
- `apps/web/client/src/services/webAssetResolver.ts`: browser upload-session
  client and compatibility projection for existing upload callers.
- `apps/worker-app/src-tauri/src/media_execution/`: Rust deserialization and
  fixture adapters, without importing Tauri UI code.

## Contract design

`NleProjectDocumentV2` contains project metadata, ordered tracks, clips,
`ClipTransformTrack`, audio mix map, subtitles, privacy regions, symbols and
validated overlay manifests. Clip-local transform time is normalized to `[0,1]`
and source/project timestamps remain available for render mapping. Unknown
future fields survive parse/serialize when their containing object is valid.

The current wire document `nle.web.1` and existing `MediaOperation` values remain
readable. `NleProjectDocumentV2` is the enriched internal/revision schema; its
serializer negotiates a Worker-supported version and may emit `nle.web.1` only
through a lossless compatibility projection. If a Worker cannot represent
keyframes, privacy, subtitle, overlay or audio-mix fields, admission blocks the
job and records the unsupported field instead of dropping it.

Compatibility maps the Web `text` track to the wire `subtitle`/text-overlay
representation only when styling, timing and speaker metadata remain lossless;
otherwise the admission report blocks the job or requires an explicit flattening
revision. Video, audio, overlay and privacy namespaces are never silently
coerced into one another.

The role registry includes `probe`, `proxy`, `waveform`, `thumbnail`,
`silence_edit_map`, `extracted_audio`, `ai_music`, `recording`, `speaker_plan`,
`subtitle_srt`, `subtitle_vtt`, `privacy_track`, `final_video`, `mp3`,
`still_image`, `sanitized_svg`, `code_overlay_manifest` and `capcut_draft`.
Each role declares whether it is an analysis artifact, managed media asset,
sidecar or browser download; a job cannot publish a role to the wrong registry.

`MediaJobEnvelopeV1` is the internal revision-pinned request and contains
`jobId`, operation, tenant/project/revision IDs, plan hash, input asset refs,
capability requirements, output roles, operation-discriminated `options`,
idempotency key, requester and trace ID. `tenantId`, `requestedBy` and the
server-issued idempotency scope are server-owned even when a client sends a
project/revision hint. `revisionId` is required for editor mutations and
outputs; upload/probe requests may omit it only when the operation contract
explicitly permits that. The current Web `MediaJobEnvelope` is a wire adapter
whose old fields (`inputs`, `plan`, `requirements`, `retry`, `billing`) are
projected from this internal request; no consumer may assume the old wire shape
contains `options` or `requestedBy`. Operations are the explicit allowlist in
`claude-plan.md`; render remains an operation and does not rename the queue.
Attempt, lease, callback URL and renewed URL are excluded from the immutable
hash.

`planHash` is computed from the canonical revision document, normalized input
asset IDs/hashes, operation, typed options, output roles and capability
requirements. It excludes job ID, tenant/requester identity, idempotency key,
trace ID, attempt/lease/callback credentials and signed URLs, so a retry or
equivalent replay can be compared without changing the work identity.

`UploadSession` contains tenant/project/file hash, object key, selected method,
size/MIME/checksum expectation, part size, part ETags, expiry and status. The
server chooses simple PUT or multipart; statuses are `created`, `uploading`,
`completing`, `completed`, `aborting`, `aborted`, `expired` or `failed`. A
complete call is the only point that can create a managed asset link.

`AnalysisArtifact`, `OutputManifest` and `OverlayManifest` include schema or
algorithm/template version, source revision, source asset IDs, checksum,
confidence/QC, review decision and publication status. A `review/apply` request
must include expected revision and client mutation ID. Analysis artifacts use
`queued`, `running`, `ready`, `rejected`, `stale`, `applied` or `failed`; a
`ready` artifact is still review-only until an explicit apply creates a new
revision.

Define typed failure categories (`validation`, `authorization`, `capability`,
`asset`, `execution`, `verification`, `upload`, `publication`, `cancellation`,
`timeout`, `lease_lost`, `stale_revision`) with retryability and safe user copy.
The internal names use underscores; the current shared wire contract spells
`lease_lost` as `lease-lost`, so the adapter accepts/emits that legacy spelling
without creating a second semantic category.
Define allowed transitions for upload, analysis and render; reject illegal
callbacks at the server boundary. Worker callbacks authenticate with the
server-issued assignment/lease credential (or equivalent signed callback
proof), and the server verifies job, tenant, attempt and expiry before accepting
an event or artifact. Every progress event carries `attemptId`,
`leaseToken`, `sequence`, `stageId` and normalized progress; duplicate and
out-of-order events are ignored idempotently. Reuse the existing
`worker_job_events.assignmentId` and unique `(workerJobId, assignmentId,
sequence)` constraint for attempt fencing; store the lease token only in
server-controlled job state/event validation, not as a client-authored field.
Reuse the existing database statuses `queued`, `claimed`, `preparing`,
`running`, `uploading`, `publishing`, `indexing`, `completed`, `failed`,
`canceled` and `expired`; `encoding` is a stage event inside `running`, not a
new status.

Keep user-facing operation IDs separate from existing wire operations through an
explicit adapter table: `quick_silence_cut → media.silence_detect`,
`probe → media.probe`, `proxy → media.proxy`, `waveform → media.waveform`,
`thumbnail → media.thumbnail`,
`speaker_plan → media.speaker_scan + media.transcribe/media.align`,
`subtitle_align → media.align`, `extract_audio → media.audio_extract`,
`audio_mix/ducking → media.audio_mix`,
`reframe → media.reframe`,
`ai_music → server-authorized provider/media task or negotiated media.ai_music`,
`privacy_track → negotiated media.privacy_track`,
`export_mp3 → negotiated media.audio_export`, `render_still → video.render_still`,
`render → video.render`,
`ai_media_studio → existing server-authorized image/video/audio generation
adapters`, and browser `record_audio` → managed upload plus optional normalize
job. `subtitle_export` is a server artifact operation. Add wire operations only
after capability negotiation and old-worker rejection tests. `asset_upload`,
`svg_catalog` and
`capcut_draft_export` remain server/storage or browser-download workflows, not
arbitrary Worker shell operations.

## API shape

Expose procedures with stable request/response/error schemas:

```text
editorMediaJobs.preflight({projectId, revisionId, operation, options})
editorMediaJobs.submit({preflightId, idempotencyKey, expectedRevision})
editorMediaJobs.status({jobId})
editorMediaJobs.cancel({jobId, reason})
editorMediaJobs.retry({jobId, expectedRevision})
editorMediaJobs.replay({jobId, mode: exact|equivalent})
editorMediaJobs.review({jobId, decision, edits})
editorMediaJobs.apply({jobId, expectedRevision, mutationId})
```

`preflight` returns a short-lived `preflightId`, the server-normalized envelope
snapshot, selected capability/mode, estimate and an expiry. `submit` may only
use that snapshot (or an explicitly revalidated equivalent) and derives an
idempotency scope of `tenant:user:project:revision:operation:clientMutationId`;
reusing the key returns the original job without a second charge. The server
owns `tenantId`, `requestedBy`, callback credentials and signed media URLs. The
status/review/apply responses never return local paths or secrets. The status
transition table is `queued → claimed → preparing → running → uploading →
publishing → indexing → completed`, with `failed`, `canceled` or `expired`
terminal branches from the stages allowed by the shared contract; a late
callback is accepted only when its assignment/lease and sequence still match.

Names may be adjusted to existing router conventions, but the operation and
error fields must remain stable and be registered in tests. Existing worker
families and `MediaJobSpec` continue through explicit adapters.

## Implementation sequence

1. Inventory current shared schemas and register the canonical discriminated
   unions without changing consumers.
2. Add fixtures for valid documents, old Web/Worker payloads, unknown fields,
   bad paths/URLs, duplicate output roles, unsafe SVG/code/filter options,
   hash stability and transition edges.
3. Add parsers/adapters and server API schemas; keep procedures feature-flagged
   until Section 10 rollout.
4. Add Rust fixture parsing and a compatibility projection test.

## UI/UX Contract

### Target User / JTBD

The editor creator needs predictable labels and errors before using uploads,
analysis or render controls; the contract should make unsupported work visible
without exposing internal payloads.

### Surface Inventory

Contract-driven surfaces are the upload drawer, editor inspector, analysis
review sheet, render preflight, Worker Jobs details and error/toast region.

### Component Map

`EditorJobStatus` owns lifecycle copy, `PreflightChecklist` owns capability and
revision reasons, `UploadQueue` owns per-file state, and domain panels own their
typed option fields. Shared components consume the envelope but cannot mutate
the project directly.

### State Matrix

Cover schema loading, unsupported operation, validation error, authorization
error, capability unavailable, stale revision, queued/running/publishing,
completed, failed, canceled and expired. Each state has a safe retry or recovery
action where applicable.

### Responsive Matrix

| Viewport | Contract-facing behavior |
|---|---|
| 360x800 | status/recovery sheet; advanced option editing deferred |
| 390x844 | upload/job status and accessible error details |
| 768x1024 | stacked preflight and review controls |
| 1024x768 | compact inspector plus timeline |
| 1280x800 | full editor and queue details |
| 1440x900 | full editor, inspector and job drawer |

### Accessibility Acceptance

Errors have a programmatic role and stable label, focus moves to the first
invalid field, status changes are announced politely, controls are keyboard
reachable and no state relies on colour alone.

### Copy Contract

Use Thai-first `ตรวจสอบก่อนส่ง`, `ความสามารถ Worker ไม่พร้อม`, `เวอร์ชันงาน
เปลี่ยนแล้ว`, `ลองใหม่` with English fallback. Keep `คิวงาน Worker` for the
queue and operation-specific render/proxy/analysis terms.

### Browser Evidence Required

Component tests must render every state and verify copy/ARIA. Authenticated
browser evidence in later sections must show a typed capability failure and a
stale-revision recovery without leaking payloads or URLs.

## Tests and acceptance

- Schema matrix rejects unknown major, unsafe path/URL, arbitrary filter/code,
  duplicate role and malformed normalized time.
- Immutable hash is stable and excludes lease/attempt fields.
- Old Web and Worker fixtures round-trip with a migration report.
- TypeScript and Rust parse the same JSON fixtures.
- API errors expose category, retryability, trace ID and no secret/local path.

## Risks and stop conditions

Stop if an existing consumer requires a breaking field rename; add an adapter
and migration instead. Do not allow a later section to define a second envelope
or a second queue.
