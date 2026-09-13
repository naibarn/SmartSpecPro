# Deep-plan research — Feature 184

## Research decision

- Codebase research: required because this is an existing git repository with Web, Worker App, Drizzle, tRPC, Rust/Tauri, FFmpeg, and Remotion implementations.
- SocratiCode: unavailable in this session; targeted `rg` and line-range inspection were used and this fallback is recorded for the plan.
- Web research: selected for current upstream behavior around PostgreSQL row locking, FFmpeg probing, Tauri sidecars, and Remotion browser preview/server rendering.
- Testing research: existing Web tests use Vitest and Testing Library, browser suites use Playwright, and Worker Rust code has Cargo tests. The repository package manager is npm at the root while `apps/web/package.json` declares pnpm; implementation must use the repo's established command for each workspace and record the exact command used.

## Codebase findings

### Existing Web editor and persistence

- `apps/web/client/src/App.tsx` currently routes `/render-jobs` to the queue page and `/video-editor` to `VideoEditorPage`.
- `apps/web/client/src/pages/RenderJobsPage.tsx` already uses `trpc.workerJobs.list/detail`, maps the existing worker statuses, shows output links, cancellation, and a render-oriented title. It is the primary page to generalize and rename to Worker Jobs.
- The existing Web editor is `apps/web/client/src/components/videoeditor/VideoEditor.tsx`, which re-exports `VideoEditorPhase3`; `VideoEditorPhase3` already uses `videoEditorProjects` CRUD and a browser `MediaJobClient` for render-related operations.
- `apps/web/drizzle/schema.ts` already defines `video_editor_projects` with `userId`, `projectData`, metadata, and timestamps. `apps/web/server/routers/videoEditorProjects.ts` provides list/get/save/autoSave/delete/rename and is consumed by Video Editor, Storyboard Review, and Media Studio. A new plan must evolve this store or add companion revision/asset tables; it must not create an unconnected duplicate `editor_projects` table.
- `apps/web/shared/types/mediaJob.ts` contains an older browser/job model (`MediaJobSpec` version `0.1`, ms-based timeline, valid job types). It is a compatibility source, not automatically the new server canonical contract.

### Existing queue, worker protocol, and artifacts

- `apps/web/drizzle/schema.ts` defines `worker_jobs` with `jobType`, status enum (`queued`, `claimed`, `preparing`, `running`, `uploading`, `publishing`, `indexing`, `completed`, `failed`, `canceled`, `expired`), JSON contract fields, idempotency key, lease owner token, expiry, and timestamps.
- `apps/web/server/services/workerSchedulerService.ts` already validates job-specific payloads, capability hints, retries, billing, leases, and routing. New editor jobs should be additive allowlisted mappings and must not break existing families.
- `apps/web/server/routers/workerJobs.ts` exposes the user-facing list/detail/cancel surface used by `RenderJobsPage`.
- `apps/web/server/routes/workerRuntime.ts` already contains worker heartbeat, atomic claim, event, reference URL, and artifact upload endpoints under `/api/worker-jobs/*`.
- `apps/web/server/services/workerArtifactService.ts` and `workerJobMonitorService.js` already own artifact publication and terminal reconciliation. The feature should reuse these paths and make verification/publication idempotent.

### Existing Worker editor and execution

- `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx`, `MultiTrackTimeline.tsx`, `timelineEdits.ts`, `mediaWorkspaceTimeline.ts`, `audioDuckingEngine.ts`, `projectPersistence.ts`, and `useProjectAutosave.ts` contain the more capable Worker editing behavior.
- `apps/worker-app/src/types/nleProject.ts` defines the SmartSpec NLE 1.0.0 shape. It contains local file paths and Tauri-dependent source handling that must be converted through explicit asset-ingest adapters before Web persistence.
- `apps/worker-app/src-tauri/src/commands.rs` includes `worker_app_detect_silence_custom`, `worker_app_process_media_interactive`, and NLE load/save commands. The headless worker should reuse underlying execution through adapters while keeping file pickers/reveal-file/native commands in a platform adapter.
- Worker Rust loop tests already cover claim hints, heartbeat, lease fencing, stale callbacks, and render job lifecycle. New contract fixtures should extend those tests rather than inventing a parallel protocol.

### Architecture and test conventions

- Web source is TypeScript/React with tRPC, Zod, Drizzle, Vitest, Testing Library, and Playwright.
- Browser-facing Vitest tests should run in `jsdom` where DOM behavior is exercised. Server/service tests run with the repository's Vitest configuration.
- `apps/worker-app` uses TypeScript/React for UI and Rust/Tauri for native execution. Rust contract and lifecycle tests use Cargo's built-in test harness.
- Existing code has a dirty worktree with unrelated changes. Implementation must use owned paths/hunks and avoid reset/checkout of unrelated work.

## External reference findings

- PostgreSQL documents that `SELECT ... FOR UPDATE` locks selected rows against concurrent updates; this supports an atomic claim/CAS design, but ordering and isolation behavior still need application-level tests. Source: https://www.postgresql.org/docs/current/sql-select.html
- FFprobe is intended to gather machine-readable multimedia stream/container information and returns a failure when input cannot be opened or recognized; use it for authoritative probe/verification stages rather than trusting client metadata. Source: https://ffmpeg.org/ffprobe.html
- Tauri's sidecar guidance treats native binaries as packaged desktop resources; this supports keeping sidecar/native file operations behind a desktop adapter and out of the browser bundle. Source: https://v2.tauri.app/learn/sidecar-nodejs/
- Remotion describes `@remotion/player` for interactive browser preview and server-side rendering for real video output; this supports browser preview plus Worker final rendering. Source: https://www.remotion.dev/

External references inform implementation patterns only. The repository's existing auth, queue, billing, artifact, and runtime contracts remain authoritative.

## Testing approach

1. Add shared schema/fixture tests for canonical project, job envelope, operation allowlist, version negotiation, and migration round trips.
2. Add tRPC/router/service tests for ownership, revision CAS, idempotency, queue admission, billing reserve/reconcile, allowed transitions, stale leases, artifact verification, and notification dedupe.
3. Add browser component/route tests for the Web editor, `/worker-jobs`, `/render-jobs` alias, autosave/conflict states, accessibility labels, responsive state, and result revision display.
4. Add Rust contract/executor tests and a real FFmpeg/Remotion smoke path where the runtime is available; keep mocked tests labeled separately.
5. Add authenticated Playwright E2E for create/edit/save/reload/proxy/submit/status/cancel/result and close/reopen recovery. Record skipped environment-dependent proof rather than treating it as pass.
