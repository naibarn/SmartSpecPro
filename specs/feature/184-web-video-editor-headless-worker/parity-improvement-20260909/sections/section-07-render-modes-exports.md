# Section 07 — Auto/Manual/GPU render, MP3 and still export

## Goal

Expose all Worker render paths from the Web editor with truthful capability
admission, revision-pinned jobs and reviewable artifacts. Support Auto, Manual
Remotion, Manual FFmpeg, GPU, MP3 and current-frame image output.

## Render modes and admission

The Render & Export dialog offers:

- **Auto**: server deterministically prefers an advertised GPU profile when the
  codec is eligible; otherwise it selects Remotion for subtitle/React/Three.js/
  effect composition and FFmpeg for typed cut/audio/dead-air plans. When both
  CPU engines are eligible, the stable tie-break is `Remotion` if the document
  contains composition/effect/overlay/subtitle/privacy work, otherwise
  `FFmpeg`; the response includes a reason code, capability snapshot timestamp
  and selected profile.
- **Manual → Remotion**: full composition for subtitles, overlays, symbols,
  privacy, ducking, transitions and keyframes.
- **Manual → FFmpeg**: normal, dead-air/silence and audio-only profiles using
  typed operations.
- **GPU**: explicit GPU capability/codec/profile request; no silent CPU fallback.

Preflight validates saved revision, plan hash, asset readiness, subtitle/privacy
review, Worker capability freshness, queue capacity, output role/codec/dimensions,
credit policy and idempotency. Submit creates `render`/`export_mp3`/
`render_still` on existing `worker_jobs`. Worker emits stage events, heartbeat,
artifact manifest and QC; server verifies checksum, size, MIME, duration,
dimensions and declared role before publication.

The existing `buildCanonicalWorkerProject` reports unsupported effects,
transitions, overlay/text tracks and unresolved assets. A non-empty report is a
preflight blocker for any output that would lose those fields. Show the field
list and offer a compatible Remotion/Worker capability or an explicit,
user-approved flattening operation that creates a new revision.

## MP3 and current frame

`Export MP3` accepts bitrate, sample rate, channel layout, metadata-safe filename
and optional time range. The audio-only adapter uses allowlisted FFmpeg options
and publishes a managed audio artifact with metadata and checksum. `Save current
frame to image` first captures the browser preview at device-pixel ratio with
requested color profile, pixel dimensions and PNG/JPEG settings for an immediate
download or optional Bin import. If cross-origin media or render-faithful effects
prevent safe capture, submit `render_still` and show progress; never report a
blank canvas as success.

## Worker execution

Implement provider selection in the headless Worker executor. Remotion receives
the validated composition/manifest and calls its server renderer; FFmpeg receives
constructed argv/filter options; GPU workers advertise codec/profile and memory
limits and record worker ID, device, driver/runtime, encoder and selected
profile in the output manifest. Progress events carry stage ID, attempt, lease
and monotonic sequence. Cancellation kills the process tree within grace, fences
late events and prevents publication when cancel wins. Retry/replay retains
source revision and labels exact versus equivalent output.

## Files and sequence

1. Extend `ExportDialog.tsx` and `VideoEditorPhase3.tsx` with preflight/mode/
   result components; keep legacy MP4 action behind compatibility adapter.
2. Add server preflight/submit/export procedures and artifact/QC services.
3. Add Worker Remotion/FFmpeg/GPU adapters and fixtures.
4. Add MP3/frame capture and Media History/Library projection.

## UI/UX Contract

### Target User / JTBD

A creator needs to choose how a project is rendered, understand why a mode is
available, export audio or a frame, and recover safely from a long Worker job.

### Surface Inventory

Render & Export dialog, mode cards, preflight checklist, estimate/credit consent,
progress drawer, cancel/retry/replay controls, artifact review and download/
Bin-attach actions.

### Component Map

`ExportDialog` owns options and preflight; `RenderModeSelector` owns Auto/
Manual/GPU; `EditorJobStatus` owns stages; `ArtifactReview` owns QC/apply;
server owns admission/credits; Worker owns providers and upload.

### State Matrix

| State | Required behavior |
|---|---|
| unsaved/stale | require save/rebase before preflight |
| preflight blocked | list capability/privacy/subtitle/asset reason |
| ready/estimate | show mode, provider/profile and credits |
| queued/running | stage progress, reconnect, cancel |
| uploading/publishing | retain job status and prevent duplicate submit |
| completed | checksum/QC, preview, download/publish |
| failed/canceled | typed retry/replay with no duplicate charge |
| stale result | review current revision; explicit apply only |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | job status/download; advanced mode editing deferred |
| 390x844 | stacked mode/preflight sheet |
| 768x1024 | preflight and result review in bottom sheet |
| 1024x768 | compact side dialog |
| 1280x800 | full mode, checklist and timeline context |
| 1440x900 | full dialog with progress and artifact details |

### Accessibility Acceptance

Mode cards are radios with descriptions, unavailable capabilities are announced,
estimate/credit consent is keyboard reachable, progress uses `aria-live`, cancel
requires confirmation and result links expose file type/size/QC text.

### Copy Contract

Use `Render & Export`, `อัตโนมัติ (Auto)`, `Manual: Remotion`, `Manual: FFmpeg`,
`เรนเดอร์ด้วย GPU`, `ส่งงานเข้า Worker`, `ส่งออก MP3`, `บันทึกเฟรมปัจจุบัน`,
`ตรวจสอบก่อนส่ง` and `ไม่มี Worker ที่รองรับ`. Keep `render` operation labels in
diagnostics while queue title remains `คิวงาน Worker`.

### Browser Evidence Required

Mock all mode/preflight/stage/error states and frame/MP3 actions. Staging proof
must include one real Worker artifact round trip and capability rejection. GPU,
provider credits and deployment are separate environment gates.

## Tests and acceptance

- Auto/manual/GPU admission, revision/plan hash, capability freshness, privacy/
  subtitle gates, estimate and credit idempotency.
- Worker provider allowlists, cancellation, QC/checksum/MIME and duplicate
  publication.
- MP3 metadata/checksum and frame capture/CORS/render-still fallback.
- Browser keyboard/responsive result review and stale apply.

## Risks and stop conditions

Never silently switch from GPU/Remotion to another mode. Stop publication on QC,
checksum, MIME, dimensions, cancellation or revision mismatch.
