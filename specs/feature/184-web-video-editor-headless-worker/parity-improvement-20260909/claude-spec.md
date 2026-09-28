# Synthesized specification — Web Media Workspace parity

## Product contract

The browser route `/video-editor` is the authoring and review workspace. The
creator can import, arrange and inspect media locally in the browser, while the
server persists tenant-owned project revisions and submits durable work to the
canonical `worker_jobs` queue. Worker capability negotiation decides whether a
job runs with FFmpeg, Remotion, GPU, vision, audio analysis or another adapter.
Every asynchronous result is immutable and tied to the input revision; applying
an analysis/edit map requires explicit user review and an expected revision.

The current Phase 3 editor and existing Worker App behavior are the baseline. The
follow-up closes the missing browser workflows and adds contracts where current
Worker execution is incomplete. It must preserve old project reads and the
`/render-jobs` compatibility redirect.

## Capability matrix

| Capability | Browser responsibility | Server/shared responsibility | Worker responsibility | Required proof |
|---|---|---|---|---|
| Bin upload | Picker, multi-select, progress, retry/cancel, empty state, local preview | Authenticated upload session, R2 key, media asset row, checksum/size validation | Optional probe/proxy/transcode | unit, route, R2 integration, browser |
| Transform/keyframes | Pointer/numeric authoring, interpolation preview, pin/delete, guides | Persist normalized transform/keyframe schema | Apply evaluated track deterministically | reducer, component, fixture render |
| Silence cut | Settings, waveform, segment review, approval/edit-map UI | Versioned analysis artifact and apply CAS | FFmpeg silence/VAD analysis and render | analysis contract, Rust, E2E |
| Extract audio | Select source, placement and status | Managed derived asset lineage | FFmpeg extraction when browser cannot do it | service + media fixture |
| AI music | Prompt/controls, estimate/consent, status, placement | Provider/job authorization, credits, artifact publication | Provider or media synthesis adapter | mocked job lifecycle + provider gate |
| AI Media Studio | Skill/provider-aware image/video/audio draft controls, preview and placement | Server-authorized generation job, credit/consent and provenance | Existing media generation adapters and managed artifact publication | mocked generation lifecycle + artifact lineage |
| Privacy blur | Region/keyframe editor, preview, review | Analysis artifact/approval policy | Face/object track and blur render | fail-closed privacy fixture |
| Recording | Device picker, permission, MediaRecorder, meter, retry | Managed upload and lineage | Optional normalize/transcode | browser device mock + upload |
| Speaker planning | Select source, stage progress, review/mapping, apply | Versioned speaker/subtitle/edit-plan artifact | ASR/diarization/plan adapter | contract + stale-result test |
| Render/export | Auto/manual/GPU choice, preflight, progress, result review | Capability/credit/idempotency/lease/artifact publication | FFmpeg/Remotion/GPU execution and QC | server + Worker fixture + E2E |
| MP3/frame export | Options, save/download and status | Artifact publication | `renderMedia`/FFmpeg audio or `renderStill` | output MIME/checksum fixture |
| Subtitles | Create/import/export/edit/style/review | Typed subtitle artifact | ASR/render inclusion | timing/style/export + render fixture |
| Preview/rulers | Fit/render-faithful modes, guides, adaptive frame ruler | N/A | N/A for interactive mode | browser screenshot and keyboard |
| Ducking/waveform | Presets, envelope/gain UI | Persist audio mix map | `sidechaincompress`/mix render | audio fixture and waveform bounds |
| Symbols/SVG | Search/catalog, insert, style, sanitize | License/source metadata | Overlay render | SVG sanitizer and snapshot |
| AI code overlays | Prompt/manifest editor, sandbox preview, approval | Artifact validation/audit | Remotion composition render | sandbox security + render |

## Data and version rules

- Project revision owns a canonical NLE document. Clip transforms contain a
  normalized base state and optional keyframes in clip-local normalized time; a
  keyframe at an existing time replaces that point within a defined epsilon.
  The enriched revision schema negotiates with the existing `nle.web.1` wire
- Analysis artifacts contain `analysisKind`, algorithm/version, source asset IDs,
  input revision, checksum, status, confidence and review decision. Dedicated
  editor analysis rows link these artifacts to the Worker job and applied
  revision; they cannot mutate a newer revision without an explicit expected
  revision.
- Upload sessions contain tenant/user/project, object key, size/MIME, checksum
  expectation, method, part size, uploaded part ETags, expiration and status;
  initial browser policy is 64 MiB single PUT, 32 MiB multipart parts with three
  per-file/four global concurrent parts; browser concurrency is globally bounded
  and server completion is fenced and
  can compute a checksum when the browser cannot stream one.
- Upload/session and editor-analysis rows are tenant scoped and idempotent;
  project access verifies authenticated tenant membership together with revision
  and asset-link tenant equality. Render outputs continue to use the existing
  `worker_artifacts` registry.
- Upload session admission reserves configured file/project/tenant byte and
  object quotas and releases reservations on abort or expiry.
- Render requests contain mode/profile, capability requirements, output role,
  codec/container, dimensions/fps, audio settings, GPU preference, plan hash,
  idempotency key and revision ID. Result artifacts include checksum, MIME,
  dimensions/duration, color/frame settings and QC report; Worker events carry
  attempt/lease/sequence metadata.
- The plan hash excludes job/requester/idempotency/trace and lease credentials;
  equivalent retries therefore retain one work identity while callbacks remain
  fenced by assignment and sequence.
- Generated code/SVG is stored as an immutable, sanitized artifact plus a
  human-readable source/prompt record. Execution accepts only the validated
  declarative manifest in an isolated opaque-origin sandbox with deterministic
  seed/dependency versions.

## State and failure contract

All panels must expose loading, empty, error, success, disabled, selected, focus
and in-progress states. Uploads additionally expose partial success, retrying,
canceled and expired. Analysis/render jobs expose draft, preflight, queued,
running, uploading, publishing, completed, failed, canceled and stale-result.

Failures must preserve the last saved revision, identify the failed file/clip or
capability, and provide a retry/relink/fallback action. If no Worker capability is
available, the UI may save and preview but must disable submit with a reason. A
privacy blur request without a verified track or approved manual region must fail
closed. Missing audio streams, denied microphone permission, unsupported MIME,
R2 checksum mismatch, stale revision, expired upload sessions, invalid subtitle
timing and generated-code sandbox violations are typed errors. Applied silence
maps can be undone through a new inverse revision; extracted audio never mutates
the source video.

## UI/UX contract summary

- Primary route: `/video-editor`; queue route: `/worker-jobs`; compatibility:
  `/render-jobs` redirects to the canonical queue.
- Sidebar default: `Bin / สื่อในโปรเจกต์`. Adjacent tabs: Library, Media History,
  Audio/Ducking, Ratio, History, FX, Overlay, Camera, Worker, Draft AI,
  AI Media Studio, Silence, Text/Subtitle, Symbols and Code Overlay as
  capabilities are enabled.
- Main surfaces: media picker/upload drawer, preview/inspector, adaptive ruler and
  scrollable multi-track timeline, analysis review sheets, render/export dialog,
  and job/result review panel.
- Thai-first copy: “Bin / สื่อในโปรเจกต์”, “คิวงาน Worker”, “ตัดความเงียบ”,
  “Transform (ตำแหน่ง/ขนาด)”, “Keyframes (จุดเปลี่ยนตามเวลา)”. English labels are
  available as fallback.
- Desktop/laptop: full authoring surface. Tablet: inspect/edit common controls,
  save and submit. Mobile: load/review/status/recovery with advanced controls
  disabled and explained.
- Controls are keyboard reachable, have visible focus, labelled sliders/regions,
  live status announcements, adequate contrast and reduced-motion behavior.

## Acceptance outcome

An authenticated user can complete an end-to-end local authoring flow with one or
many Bin uploads, drag assets to tracks, create/preview/apply transforms and
keyframes, review silence/speaker/blur results, extract or record audio, create
subtitles, configure ducking, insert sanitized SVG/code overlays, select Auto or
Manual render/export including MP3/frame, submit a durable Worker job, and review
the immutable result. Unsupported runtime capabilities are explicit and cannot
silently drop edits, privacy regions or media references.
