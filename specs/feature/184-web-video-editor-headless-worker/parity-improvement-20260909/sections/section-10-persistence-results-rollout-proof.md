# Section 10 — Persistence, Worker Jobs results, rollout and acceptance proof

## Goal

Connect all capabilities to durable revisions and the canonical Worker Jobs
experience, then prove the eighteen requested workflows with explicit
environment gates and rollback controls.

## Persistence and migration

Add only additive schema changes for upload sessions/parts, revision metadata,
analysis artifacts, audio mix maps, subtitle documents, privacy tracks, overlay
manifests, render output roles and project-job links. Use JSON schema version
fields and preserve unknown fields. Index tenant/project/status/source hash/job
status and add tombstones for deleted assets/projects. Existing
`video_editor_projects`, `media_assets`, `worker_jobs` and legacy render jobs
remain readable.

Existing revisions, project assets, project-job links and generic
`worker_artifacts` remain the source of truth. The next migration after the
latest migration recorded in the Drizzle journal (0289 exists in the current
worktree, so use 0290 if it remains) adds
`video_editor_upload_sessions`, `video_editor_upload_parts` and
`video_editor_analysis_artifacts`. Sessions include method/object key,
size/MIME/checksum, part size/ETags, expiry/status and idempotency. Analysis rows
include kind, source asset IDs/revision, algorithm/model version, checksum,
confidence, review decision, applied revision and Worker job ID. Render outputs
and generated manifests stay in `worker_artifacts`/revision documents; no second
artifact registry is introduced.

The migration contract is concrete: `video_editor_upload_sessions` has
`id`, `tenantId`, `projectId`, `userId`, `sourceHash`, `objectKey`, `method`,
`sizeBytes`, `mimeType`, `partSizeBytes`, checksum algorithm/expected checksum,
status, idempotency key, reserved bytes/object count, expiry and
created/completed/aborted timestamps;
`video_editor_upload_parts` has session ID, part number, ETag, size/checksum,
status and a unique `(sessionId, partNumber)` constraint;
`video_editor_analysis_artifacts` has `id`, tenant/project/revision/job links,
analysis kind, source asset IDs, algorithm/model version, artifact JSON,
checksum, confidence summary, review decision, applied revision and timestamps.
All tenant/project indexes and uniqueness checks are included in the migration
dry run. Because `video_editor_projects` currently has no tenant column, every
read/write must verify the authenticated user's tenant membership and the
revision/link tenant in the same transaction; adding a project tenant column is
an explicit migration decision only if that invariant cannot be enforced by
the existing ownership join.

Every mutation uses expected revision and idempotency. A job pins revision and
plan hash. Analysis/subtitle/reframe/privacy application creates a new revision
only after explicit review; a stale result is viewable but cannot overwrite the
current document. Autosave conflict/recovery and two-tab ordering are retained.

## Worker Jobs and menu

Complete `/worker-jobs` as the canonical queue page with Thai title
`คิวงานประมวลผลของฉัน` and short menu `คิวงาน Worker`. Keep `/render-jobs` as a
query-preserving redirect alias. Show operation labels for render, proxy, probe,
waveform, silence, audio, speaker, tracking and code overlay; do not rename API
or database job IDs. Preserve filters, selected job, reconnect, cancel,
retry/replay, historical renders and artifact links.

Update Dashboard and editor navigation together: the Dashboard editor entry
opens `/video-editor`, the queue entry opens `/worker-jobs`, and deep links from
legacy render history retain `jobId`, `projectId`, `status` and `operation` while
redirecting. The compact `?legacy=1` editor is not linked or reachable in the
default/canary cohorts; it is retained only as an emergency rollback surface
until the rollout drain completes, while legacy project files remain readable.
Add route-level tests so a menu can never send the user back to the legacy
compact editor by accident.

Editor result review shows revision, plan hash, output role, checksum/QC,
privacy/subtitle decisions and actions: preview, download, publish to Library/
Media History, review/apply with expected revision. Failed/stale artifacts stay
private. Notifications are deduplicated by job/terminal state.

Preserve the existing `Draft AI` panel and prompt/draft flows in the parity
ledger. Its generated text, media or analysis requests use the same typed Worker
job envelope, credit/consent and provenance rules as the new AI panels; the
browser must never call a provider directly or lose the original draft version.

The Worker App control inventory is an explicit migration ledger, not a visual
approximation. `Media Bin/local import` maps to Bin single/multiple managed R2
upload; `Cloud Library` maps to Library and Media History; `Play/Split/Trim/
Resize/Ripple/Razor/Copy/Paste` maps to the Web timeline commands; `Detach
Audio` maps to Extract Audio with lineage; `Compound/Decompose` maps to grouped
clips; `Ken Burns` maps to the Transform/Keyframe camera preset; `Subtitle`,
`Text`, `3D Overlay`, `Stock SVG`, `Blur`, `Voiceover`, `AI Music` and `AI Media
Studio` map to their reviewable Web panels and typed jobs; `Snap`, `M/S/Duck/
Volume` and track creation map to timeline headers; `Project` maps to Ratio,
canvas/FPS settings; `Save/Open project file` maps to cloud revisions plus an
optional portable JSON download/upload with schema validation and no local path;
`CapCut` maps to a browser-downloadable, managed draft manifest; and `Render/Export` maps to the
Auto/Manual/GPU dialog. Local folder browsing, absolute paths, opening an
Explorer window and direct local render output have no Web equivalent: they are
replaced by managed asset picking and authenticated download, and this
adaptation is shown in the UI rather than silently omitted.

## Rollout and operations

Use `web_beta`, tenant canary and `web_default` gates with emergency rollback and
cache invalidation. Measure Bin success/partial/retry, revision conflicts,
queue wait/execution/QC, stale applies, duplicate credits, browser errors,
capability rejection, R2 multipart failures and `/render-jobs` alias hits.
Retain source/plan/runtime references through the replay/retention window;
remove legacy UI/alias only after explicit evidence gates and active-job drain.
Before deleting or archiving a project, block when active jobs exist or cancel
and fence them transactionally. Run migration dry-run, rollback rehearsal and
artifact-retention checks before enabling the next cohort.

## Acceptance proof matrix

The final integration run records commands, fixture IDs, screenshots, manifests,
checksums, logs and skipped gates for:

1. One/multiple Bin upload to R2, default Bin and drag from Library/History.
2. Image/video Transform, Keyframes, pin/lock, pan/zoom and Worker parity.
3. Quick Silence Cut review/apply and audio extraction.
4. AI Music, microphone capture and speaker/edit-plan review.
5. Blur tracking fail-closed and approved render.
6. Auto/Manual Remotion/FFmpeg/GPU, MP3 and frame export.
7. Subtitle create/import/render, preview modes, frame guides and detailed ruler.
8. 20+ timeline tracks with scroll, ducking waveform/presets, SVG catalog and
   AI CSS/React/Three.js sandbox/render.
9. Save/reload, two-tab conflict, cancel/retry/replay, stale result and queue
   alias behavior.
10. Worker App parity inventory: compound/decompose, Ken Burns, CapCut draft,
    Project settings, AI Media Studio, portable project JSON and local-folder
    adaptation are each exercised or explicitly marked as browser-only/managed
    replacements.

Before sign-off, maintain a parity ledger with one row for every visible panel
and toolbar action: Library, Bin, Media History, Audio/Ducking, Ratio, History,
FX/Blur, Overlay, Camera/Auto Pan-Zoom, Worker, Draft AI, Silence, Text/Subtitle,
3D Overlay, AI Music/Audio, AI Media Studio, Symbols, AI Code Overlay, play/seek,
split/trim/resize, ripple, razor, copy/paste, group/ungroup, compound/decompose,
Ken Burns, snap, undo/redo, Keyframes, frame guide, preview zoom/quality,
fullscreen, add video/audio/overlay/text track, track mute/solo/duck/volume,
Project settings/Ratio, save/open project file, CapCut draft, export and Worker handoff. Each row
links the Worker source function, Web component, browser versus Worker
ownership, keyboard route, state tests and browser artifact. An unaccounted row
is a release blocker.

The existing Web component owners are `AspectRatioSelector.tsx` (Ratio),
`HistoryPanel.tsx` (revision undo/redo), `TransitionsPanel.tsx` (FX/transition),
`OverlayPanel.tsx` (overlay/Transform), `SmartCameraPanel.tsx` (camera),
`VideoDraftAIPanel.tsx` (Draft AI), `SilenceDetectionPanel/Dialog.tsx`,
`AudioDuckingPanel.tsx`, `MediaLibraryPanel.tsx`, `ProjectBinPanel.tsx` and
`ExportDialog.tsx`. New panels must extend these seams or document a deliberate
replacement and migration; `SubtitleEditorPanel` owns SRT/VTT export,
`AiMediaStudioPanel` owns generated image/video/audio drafts;
`CodeOverlayPanel`/`OverlaySandbox` owns AI code manifests,
`Timeline` owns compound/Ken Burns/track commands, and `CapCutDraftAdapter`
owns the portable draft download; `ProjectFileAdapter` owns validated portable
JSON import/export. No toolbar action may remain an unowned inline stub.

Focused tests, esbuild/build, Rust tests, mocked browser/device/provider tests,
authenticated browser evidence, staging R2 multipart, one real Worker claim/
lease/artifact round trip, security tests and rollback drill are separate
evidence levels. Repository-wide typecheck is deliberately deferred per user
request; deployment/restart, paid provider and GPU evidence require an
environment owner.

Performance proof includes a 20-track fixture with ruler/timeline interaction
remaining responsive under the agreed frame budget, bounded virtualized-row
memory, cached waveform/thumbnail reuse and upload concurrency respecting the
global semaphore.

## UI/UX Contract

### Target User / JTBD

A creator needs one coherent editor-to-Worker journey, clear result ownership and
safe recovery when a long job or revision conflict occurs.

### Surface Inventory

`/video-editor`, `/worker-jobs`, `/render-jobs` alias, result drawer, review/apply
sheet, Library/Media History projection, notifications and rollback/status page.

### Component Map

`VideoEditorPhase3` owns editor state; `WorkerJobsPage` owns queue; `JobDetails`
owns artifact/QC; `ReviewApplyDialog` owns expected revision; feature-flag and
notification services own rollout and terminal updates.

### State Matrix

| State | Required behavior |
|---|---|
| loading/empty/offline | retain local view and recovery action |
| saving/conflict | preserve last revision; explicit rebase |
| queued/running/uploading/publishing | reconnect and stage progress |
| completed | artifact QC, preview, download/publish |
| failed/canceled/expired | typed retry/replay/cancel outcome |
| stale result | review only; explicit apply after rebase |
| feature disabled | explain cohort/capability and keep legacy path |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | queue/status/recovery and artifact download |
| 390x844 | stacked result review |
| 768x1024 | queue plus review sheet |
| 1024x768 | compact editor/queue layout |
| 1280x800 | full editor and Worker Jobs details |
| 1440x900 | full result/QC/review controls |

### Accessibility Acceptance

Route titles and selected job are announced, filters are keyboardable, terminal
states use live regions, artifact links expose MIME/size, stale/apply warnings
receive focus and all modal/dialog focus returns correctly.

### Copy Contract

Use `คิวงาน Worker`, `คิวงานประมวลผลของฉัน`, `กำลังตรวจสอบผลลัพธ์`, `ผลลัพธ์จาก
เวอร์ชันเก่า`, `ตรวจสอบและนำไปใช้`, `ส่งออก MP3` and operation-specific labels.
Keep `/render-jobs` only as a compatibility URL with an explanatory redirect.

### Browser Evidence Required

Authenticated browser runs must cover editor → queue → result → review/apply,
alias query preservation, responsive screenshots, keyboard/accessibility states,
notification reconnect and rollback-disabled copy. Record real R2/Worker proof
separately from mocked UI evidence.

## Tests and acceptance

- Migration/unknown-field/tombstone/tenant and CAS tests.
- Worker Jobs canonical/alias/operation-label/result/reconnect tests.
- Review/apply stale conflict, publication and notification dedupe tests.
- Feature-flag/canary/retention/audit/rollback tests.
- Cross-section browser and Worker integration matrix with explicit pending gates.

## Risks and stop conditions

Do not clean up legacy routes/UI or delete artifacts until active jobs, replay,
retention and rollback gates pass. Never mark a mocked provider, R2, microphone,
GPU or deployment check as production proof.
