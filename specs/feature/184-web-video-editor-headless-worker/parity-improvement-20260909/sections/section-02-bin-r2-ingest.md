# Section 02 — Bin default, single/multiple upload and managed R2 ingest

## Goal

Make the browser Bin usable on first load and make every imported video, image
and audio file a tenant-owned managed asset. A single picker selection, a
multiple selection and drag/drop must all result in independently reviewable
assets; one failed file must not hide successful files.

## Existing evidence and ownership

- `VideoEditorPhase3.tsx` currently selects the default source/panel and renders
  the Bin surface.
- `ProjectBinPanel.tsx` lists project assets and exposes drag/add behavior.
- `MediaLibraryPanel.tsx` owns Library/Media History source tabs and the current
  generated-source picker.
- `webAssetResolver.ts` has `/api/media-jobs/upload/init`, presigned PUT and a
  sequential multipart fallback.
- `apps/web/server/routers/mediaJobs.ts` has single-buffer upload,
  `/upload/init` and `/upload/complete`; `storage.ts` has server-side multipart
  helpers. Extend these contracts rather than introduce an upload service.

## Upload protocol

1. On picker/drop, calculate name, size, extension, sniffed MIME and a streaming
   hash where possible. Reject unsupported type or size before opening a session.
2. Call the existing `/api/media-jobs/upload/init` with compatible
   `filename/contentType/fileSize` fields plus `projectId`, source hash and
   idempotency key. The server verifies ownership and chooses `simple` for small
   files or `multipart` for large files. It returns a session ID, tenant/project
   scoped object key, part size, part URLs, expiry and already-uploaded part
   ETags. Normalize the filename to a basename; never use a browser path in the
   object key.
3. Use a configurable `simpleUploadMaxBytes` (initially 64 MiB) for one
   authenticated single PUT. Multipart uploads use a 32 MiB default part size
   constrained to 16–64 MiB, at most three active parts per file and four active
   parts globally, retained ETags and resumable IndexedDB metadata scoped by
   tenant/project/hash. Persist session ID, file hash, part state and ETags only;
   signed part URLs are memory-only and are reissued on resume. Retry only the
   failed part with bounded backoff.
4. `/api/media-jobs/upload/complete` rechecks session state, object size,
   checksum, MIME and object existence with a storage HEAD, then transactionally
   creates `media_assets` and the
   project link. `upload.abort` or expiry cleans incomplete parts and creates no
   published asset.
5. Refresh asset metadata through managed range/thumbnail/probe routes. Persist
   no presigned URL or local path in the project document.

Before issuing a session, enforce configured per-file, per-project and per-tenant
byte/object quotas and return a typed quota error with retry-after guidance.
Quota reservations are idempotent and released on abort/expiry; a partial
multi-file selection may still publish files whose reservations completed.

Use a global browser upload semaphore in addition to the per-file part limit,
and a scheduled server sweeper for expired multipart sessions. Configure R2 CORS
for exact authenticated origins, signed PUT headers and exposed `ETag` response
header. If a browser cannot
calculate a streaming checksum, the server computes it while validating the
completed object before publication. Init/complete/abort are idempotent and
concurrent completes for one session are fenced.

The API must return per-file results (`assetId`, state, error category and
retryability) and support cancellation. Duplicate source hash may offer “use
existing asset” only when the existing asset is owned by the same tenant and
project policy allows it.

Adapt the existing `method: "presigned"` response to the new `simple` method.
The current fallback response that only says `method: "multipart"` without a
session is incomplete for the new Bin; replace it with a resumable multipart
session while keeping legacy endpoint behavior for older clients.

## UI behavior

`ProjectBinPanel` is the default tab on `/video-editor`, even when the project is
empty and no import query is present. A `?libraryItemId=...` deep link may
temporarily select Library while it imports that item, then returns to the
normal source state; this exception is covered by a route-load test. Add an
obvious `นำเข้าสื่อจากเครื่อง` button, a dropzone and a multiple selection hint.
Asset cards show thumbnail, type, duration/dimensions, size, upload state and
actions: add to V1/V2/A1, retry, cancel, remove link and open details.
Dragging a card highlights compatible tracks; dropping onto the ruler uses the
playhead as insertion time.

`MediaLibraryPanel` keeps Library and Media History. Each source can add to Bin
or drag directly to a compatible track; direct use still creates a project
asset link through the authenticated managed-media resolver. The existing
`downloadToWorkspace`/`downloadUrlToWorkspace` path is a legacy desktop adapter
only and is forbidden for Web project persistence or Worker envelopes. Imported
items appear in Bin without a page reload. Empty Bin says
`ยังไม่มีสื่อในโปรเจกต์` and explains picker, drag/drop and Library options.

Implementation ownership is `ProjectBinPanel.tsx`, `MediaLibraryPanel.tsx`,
`VideoEditorPhase3.tsx`, `webAssetResolver.ts`, `mediaJobs.ts`, `storage.ts` and
the additive schema/migration. The first regression test asserts that the
current `sidebarView` initializer (`mediaHistory` in the existing component)
becomes `bin`. The `localPath` callback currently used by Bin/Library is replaced
by a managed asset reference and authenticated playback resolver; desktop
workspace downloads stay behind a legacy adapter and never enter the Web
project or Worker envelope. Runtime preview blobs may exist in memory, but
persistence strips `path`, `originalPath` and `localPath`; the saved asset
reference is `{ namespace: "media_asset", id }` (or another managed namespace).
Revoke object URLs and release preview blobs when an upload row, asset card or
editor session is removed/unmounted; preview memory is bounded independently of
the resumable upload queue.

## Schema and service changes

Use `video_editor_project_assets` as the link source of truth. Add an additive
`upload_sessions`/`upload_parts` relation only if the existing schema cannot
represent expiry, method, ETags and abort state. Index tenant/project/status,
source hash and object key. Use an idempotency key for init and complete. Preserve
existing single-upload route compatibility while routing new clients through
the session protocol.

## UI/UX Contract

### Target User / JTBD

A creator needs to bring one or many local media files into a project quickly,
see exactly which files reached R2, and drag a successful asset into a track.

### Surface Inventory

Default Bin tab, upload button, dropzone, upload queue, asset cards, Library,
Media History, track drop targets and asset details/retry dialog.

### Component Map

`ProjectBinPanel` owns source state and cards; `UploadQueue` owns session/progress
state; `MediaLibraryPanel` owns source switching; `Timeline` owns compatible
drop targets; `webAssetResolver` owns protocol calls; server routers own auth and
R2 completion.

### State Matrix

| State | Required behavior |
|---|---|
| empty | Bin selected by default with picker/drop instructions |
| selecting | picker accepts one/multiple and validates before upload |
| uploading | per-file bytes, aggregate progress, cancel |
| paused/offline | retain resumable session and offer resume |
| retrying | identify file/part and bounded retry |
| partial success | successful assets usable; failed rows actionable |
| duplicate | show existing owned asset or explicit new upload |
| unsupported/too-large | field-level reason before network |
| expired/forbidden | discard session and safe retry/relink |
| selected/dragging | compatible tracks highlighted |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | Bin as full-height sheet; upload queue before asset grid |
| 390x844 | one-column cards and sticky upload action |
| 768x1024 | two-column cards with stacked queue |
| 1024x768 | side Bin drawer beside preview/timeline |
| 1280x800 | drawer and timeline visible together |
| 1440x900 | full source drawer, queue and detailed cards |

### Accessibility Acceptance

File picker and dropzone have labelled buttons and keyboard activation, progress
has text percentage and `aria-live`, cards expose type/size and add target,
drag/drop has keyboard alternative, errors move focus to the failed row, and
focus remains visible in dark theme.

### Copy Contract

Use `Bin / สื่อในโปรเจกต์`, `นำเข้าสื่อจากเครื่อง`, `อัปโหลด 1 ไฟล์`,
`อัปโหลดหลายไฟล์`, `กำลังอัปโหลด`, `อัปโหลดบางไฟล์สำเร็จ`, `ลองใหม่` and
`เซสชันหมดอายุ`. English fallback is `Bin`, `Upload files`, `Retry`, `Resume`.

### Browser Evidence Required

Run mocked authenticated browser flows for one file, multiple files, partial
failure, resume, cancel and drag-to-track. Run one staging R2 single PUT and
multipart round trip with checksum and inspect that no local path/URL is saved.

## Tests and acceptance

- Unit/service: method selection, part ordering, ETag resume, concurrency cap,
  quota reservation/release, checksum/MIME/size mismatch and abort cleanup.
- Router: tenant/project authorization, idempotent complete, object existence,
  asset/link row and managed range access.
- UI: default Bin, upload states, source switching and track compatibility.
- Acceptance: both one/multiple uploads result in usable Bin items and library/
  history drag works without a page reload.

## Risks and stop conditions

Never use the current whole-file Buffer route for files above its safe memory
threshold. Stop publication on checksum or ownership mismatch. Do not silently
upload local-only references or replace a failed file with a different asset.
