# Section 06 — Browser editor extraction and platform adapter

## Scope and dependencies

Port Worker editor capability using Section 01 project/assets and Section 02 persistence. The browser owns editing and interactive preview; Section 04 owns heavy jobs. The Worker editor remains a fallback.

## Tests first

- Characterize reducer/time-map behavior from Worker fixtures before extraction; test trim/split/move/resize, transforms, overlays, audio ducking, subtitles and undo.
- Test load/import/proxy playback/save/autosave/conflict/offline recovery and assert no Tauri/native import in the browser path.
- Add jsdom component tests and authenticated Playwright route/screenshots at mobile/tablet/laptop/desktop sizes for keyboard/focus, dark/light and async states.

## Implementation and UI/UX contract

Extract pure logic from `apps/worker-app/src/screens/media-workspace/{timelineEdits,mediaWorkspaceTimeline,audioDuckingEngine,projectPersistence,useProjectAutosave}.ts` into shared/editor-core-compatible modules. Keep file picker, local path, reveal-file, capture and notification behavior behind a typed `PlatformAdapter`; implement the browser adapter under `apps/web/client/src/services/` and retain a desktop adapter for Worker.

Port UI into `apps/web/client/src/components/videoeditor/*` and `pages/VideoEditorPage.tsx`, gated by `video_editor_mode`. Surface inventory is project load/import, asset drawer, timeline, preview, captions/overlays/audio panels, export, job status and conflict/recovery dialogs. State matrix covers loading, empty, importing/uploading, proxy pending/failed, unsaved/saving/saved, offline/conflict, no-worker, queued/running/uploading/publishing and terminal/review states. Desktop/laptop supports full edit; tablet supports inspect/load/save/status; mobile supports read/status/recovery with an explicit advanced-editing limitation. Controls are semantic/keyboard accessible with visible focus, reduced motion, contrast, and screen-reader status announcements. Thai primary copy uses `คิวงานประมวลผลของฉัน`/`คิวงาน Worker` with English fallback.

## Acceptance and evidence

Record reducer characterization, no-Tauri static/bundle check, jsdom results and Playwright evidence. This section covers AC-01–AC-04, AC-07, AC-08, AC-12, AC-14 and browser portions of AC-17.

## Safety and rollback

Keep existing Web consumers and Worker UI until parity gates pass. Browser must not silently perform heavy render when Worker/capability is unavailable.

## Implementation status

Implemented browser-only `VideoEditorPlatformAdapter` and the full Phase 3 Web editor at `/video-editor`, preserving the no-Tauri boundary. The surface now includes local import, Library and Media History sources, project Bin drag/drop, multitrack timeline scrolling and track controls, the complete existing editing toolbar/panel set, Smart Camera face/object/auto pan/zoom controls, compact-payload migration and Worker handoff; `?legacy=1` is the explicit rollback path. Offline/conflict recovery, proxy/analysis runtime adapters, dynamic face tracking in the headless executor and Playwright evidence remain gated.

## UI/UX Contract
### Target User / JTBD
Creator edits multi-track video with responsive preview and durable autosave.
### Surface Inventory
`/video-editor`, asset drawer, timeline, preview, captions/overlays/audio, export, jobs, conflict/recovery.
### Component Map
Editor core owns commands/time; editor UI owns interaction; adapter owns native bridge; server owns policy.
### State Matrix
Loading, empty, import/upload, proxy pending/failed, unsaved/saving/saved, offline/conflict, no-worker, queued/running/publishing, terminal/stale review.
### Responsive Matrix
Laptop/desktop full editing; tablet inspect/load/save/status; mobile read/status/recovery with advanced editing limitation.
### Accessibility Acceptance
Semantic controls, keyboard timeline shortcuts, visible focus, reduced motion, contrast, and screen-reader status.
### Copy Contract
Thai primary with English fallback; use `คิวงานประมวลผลของฉัน` and `คิวงาน Worker`.
### Browser Evidence Required
Authenticated Playwright screenshots/E2E at mobile/tablet/laptop/desktop plus jsdom async-state tests.
