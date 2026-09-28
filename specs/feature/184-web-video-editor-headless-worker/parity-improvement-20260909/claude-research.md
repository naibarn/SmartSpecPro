# Research findings — Feature 184 parity improvement

## Research decision

- Codebase research: **yes**. This is an existing git repository with a React/Vite
  web app, Express/tRPC services, shared TypeScript contracts, a Rust/Tauri Worker
  App, Drizzle migrations, and Vitest tests.
- SocratiCode: **unavailable in this portable runtime** (no `codebase_status` or
  `codebase_search` tool was registered). Findings below use targeted `rg` and
  line-range reads as the documented fallback.
- Web research: **yes** for R2 multipart uploads, browser media capture, FFmpeg
  filter capabilities, Remotion rendering, and Three.js primitives. Sources are
  recorded below.
- Testing: existing Vitest/jsdom for Web components and services, Rust `cargo test`
  for Worker App primitives, and targeted build/esbuild checks. The user requested
  that memory-heavy type checking remain out of this wave.

## Existing architecture and seams

### Web route and editor

- `apps/web/client/src/pages/VideoEditorPage.tsx` is the route entry. It currently
  selects `VideoEditorPhase3` for the primary route and retains the compact editor
  behind `?legacy=1`.
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx` owns the
  authoring state, preview, timeline, toolbar, project save/load, existing panels,
  and Worker handoff. It already has transform keyframe helpers, track lock/mute/
  visibility, trim/split/move/resize, audio ducking, silence detection, text,
  overlay, transitions, aspect ratio, Draft AI and export paths.
- `Timeline.tsx` already provides multiple tracks, horizontal and vertical
  overflow, drop validation, snap, selection, edge resize and track controls.
- `PreviewPlayer.tsx`, `OverlayPanel.tsx`, and `transformKeyframes.ts` already
  support evaluated transform values, pointer drag/resize, keyframe insertion and
  interpolation. The main gaps are a clearer model/UX contract, full test coverage,
  still-image parity, and Worker render application.
- `MediaLibraryPanel.tsx` has one/multiple browser file selection and sequential
  uploads through `WebAssetResolver`. It shows upload only in generated mode, while
  `ProjectBinPanel.tsx` currently only lists project assets and offers Add/drag. This
  explains why an empty Bin cannot upload directly.

### Upload and managed media

- `apps/web/client/src/services/webAssetResolver.ts` calls
  `/api/media-jobs/upload/init`, prefers a presigned PUT, falls back to a server
  `multipart/form-data` route, and confirms through `/upload/complete`. The resolver
  carries a `mediaAssetId` when the server returns one.
- `apps/web/server/routers/mediaJobs.ts` registers canonical media assets and has
  presigned PUT and single multipart endpoints. The legacy multipart route reads
  the complete temp file into a Buffer before `storagePut`; it is unsuitable for
  large browser video and should not be the Bin's large-file path.
- `apps/web/server/storage.ts` already has S3/R2 multipart primitives for server
  file paths, but no browser-facing create/upload-part/complete/abort abstraction.
- `media_assets`, `video_editor_project_assets`, and `worker_jobs` are existing
  durable boundaries. New upload state should be resumable and tenant-scoped; the
  project stores only managed IDs and safe proxy references.

### Worker media capabilities

- `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx` exposes
  the reference surface: quick silence analysis/cut, waveform, crop/reframe,
  focus mode and keyframes, render controls, Remotion composition render, FFmpeg
  normal/dead-air render and result upload.
- `apps/worker-app/src-tauri/src/media_pipeline.rs` already models
  `MediaPlanOptions`, `MediaFocusKeyframe`, silence analysis segments, waveform
  peaks, 9:16 reframe, still motion, focus expressions and allowlisted FFmpeg
  execution. This is the correct source for Web analysis/job contracts rather than
  duplicating ad-hoc browser algorithms.
- Worker executor capability advertisement and `editor_video_render` claim path
  exist, but the current canonical Web adapter does not yet apply every advanced
  effect, transition, subtitle, overlay, privacy region or dynamic analysis result.
  The plan must add capability negotiation and fail-closed unsupported metadata.

### Render, audio and AI seams

- `ExportDialog.tsx` is currently an MP4-oriented preset dialog and uses encoder
  detection. It needs a render mode/profile model (Auto, Remotion, FFmpeg, GPU),
  MP3 output, preflight and artifact review.
- Existing `AudioDuckingPanel.tsx` and `SilenceDetectionPanel/Dialog.tsx` are UI
  seams, while Worker Rust has authoritative silence and FFmpeg behavior. Audio
  extraction is already exposed from the toolbar but needs a managed-asset and
  alignment contract test.
- AI generation follows existing server/tRPC job patterns. AI Music, speaker
  analysis, subtitle generation and code-overlay generation should use typed
  `worker_jobs`/analysis artifacts, explicit credit/consent and idempotency rather
  than calling providers from a browser component.
- Existing artifact tables and library services can publish MP3, PNG/JPEG, SVG,
  subtitle and render outputs. The plan should reuse these services rather than
  introduce another media registry.

### Tests and verification

- Web tests use Vitest; component tests use jsdom and Testing Library. Existing
  tests cover editor migration, Worker Jobs route/menu, transform helpers and
  editor services. Add pure reducer/contract tests before UI tests.
- Worker App tests use Rust unit tests and React tests under
  `apps/worker-app/tests/media-workspace`.
- Build proof is available through `npm --workspace apps/web run build:unsafe` and
  focused `npx esbuild` checks. Authenticated Playwright, real R2, real Worker,
  migration dry-run and deployment/restart remain separate environment gates.

## Web research and recommendations

### R2 upload strategy

Cloudflare's current R2 guidance recommends a single PUT for small/medium objects
and multipart uploads for large video, resumability and parallelism. Multipart
parts are 5 MiB–5 GiB (except the final part), with at most 10,000 parts; failed
uploads should be aborted and the part ETags retained for completion. The browser
flow should therefore be: authenticated init → server-issued upload identity and
part URLs → bounded concurrent part PUTs with persisted upload state → complete →
server HEAD/size/checksum validation → media asset ready. Use an object key scoped
to tenant/user/project and do not trust a browser filename as a path.

Sources: [Cloudflare R2 upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/),
[R2 multipart API](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/),
[R2 API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[R2 limits](https://developers.cloudflare.com/r2/platform/limits/).

### Browser microphone recording

`getUserMedia({audio: ...})` is restricted to secure contexts and explicit user
permission. `enumerateDevices()` may hide non-default devices until permission is
granted. `MediaRecorder.isTypeSupported()` should choose a browser-supported MIME
type, and `dataavailable` chunks should be collected with a timeslice so the UI can
show progress and avoid a single unbounded in-memory Blob. Stop tracks on cancel or
unmount. The recorded Blob is uploaded as a managed asset; device IDs and raw
paths are never persisted in the project.

Sources: [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[MDN enumerateDevices](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices),
[MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder),
[MDN MediaRecorder start/dataavailable](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start).

### FFmpeg and Remotion render split

FFmpeg has native filters for silence detection/removal, `sidechaincompress`,
`amix`, `volume`, crop/scale, blur and draw overlays. These are appropriate for
deterministic audio/video operations after an approved edit map. Remotion's
server-side renderer provides `renderMedia()` for video/audio and `renderStill()`
for frame capture, making it the correct path for subtitles, React/CSS/Three.js
composition and frame export. Mode selection must be capability-driven; a GPU
button cannot claim GPU use unless the Worker advertises the matching runtime and
records the selected encoder/device in job metadata.

Sources: [FFmpeg Filters Documentation](https://ffmpeg.org/ffmpeg-filters.html),
[Remotion renderer APIs](https://www.remotion.dev/docs/renderer).

### SVG/Three.js overlay safety

The existing Three.js API surface includes explicit cameras, loaders, materials,
animation/keyframe tracks and render targets. For AI-authored overlays, generate a
small declarative manifest (scene graph, props and assets), validate it, and render
inside an isolated browser/Remotion composition. Do not execute arbitrary imports,
network requests, filesystem calls, DOM escape, or unbounded loops from generated
code. SVG must be parsed/sanitized before insertion, with source/license metadata
kept next to the asset.

Source: [Three.js API documentation](https://threejs.org/docs/).

## Research conclusions

1. The fastest safe path is to extend existing editor panels/contracts and the
   Worker media pipeline, not replace Phase 3 or reintroduce Tauri APIs into Web.
2. Bin upload needs a first-class browser multipart protocol; the existing single
   upload fallback is the direct cause of the reported empty-Bin failure mode.
3. Keyframe and Transform are already distinct in code. The work is to expose the
   distinction consistently, add tested invariants, and carry evaluated keyframes
   into Worker/Remotion render plans.
4. Silence, reframe, speaker analysis, blur tracking and render mode selection are
   analysis/job workflows with review and version gates, not only local UI state.
5. AI code overlays and microphone recording require explicit security and browser
   capability handling; they should degrade with a truthful message when a browser,
   Worker or provider capability is missing.
