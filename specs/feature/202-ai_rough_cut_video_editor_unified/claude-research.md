# Deep-plan research — Spec 202

## Research decision

- Codebase: required. This is an existing git repository with a React Web
  Video Editor, TypeScript server, shared media contracts, PostgreSQL/Drizzle
  schema, and a Rust/Tauri Worker.
- Web topics: required by the planning workflow because the spec names FFmpeg,
  Remotion, Tauri, and Cloudflare Containers. Only official documentation was
  used for stable boundary guidance; existing repository contracts remain the
  implementation authority.
- Testing: Vitest is used for Web/shared TypeScript tests; the Worker uses Rust
  unit tests. Browser evidence is required for UI claims but is not substituted
  by unit tests.

## Codebase findings

### Existing Web and shared contracts

- The active Web route is `apps/web/client/src/pages/VideoEditorPage.tsx`, with
  Phase 3 implemented in
  `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`.
- Shared editor job validation lives in
  `packages/shared/src/video-editor/mediaExecutionContract.ts`. It already
  validates protocol/version, tenant/project/revision IDs, managed asset
  namespaces, canonical project shape, operation plans, capability/resource
  requirements, retry, billing, and unsafe input rejection.
- `apps/web/server/services/editorMediaJobContract.ts` maps logical media
  operations into existing `worker_jobs` job types and adds operation-specific
  claim capabilities. The current submit router still inserts directly into
  `worker_jobs` and does not transactionally pin a server revision/snapshot or
  publish an outbox record.

### Current project/revision stores

- The active Phase 3 Web Editor uses `video_editor_projects` through
  `apps/web/server/routers/videoEditorProjects.ts`; its save/autosave path is
  user-scoped but lacks server CAS.
- Feature 184 already defines `video_editor_project_revisions`, managed asset
  links, and project-job links in `apps/web/drizzle/schema.ts`, but the active
  editor path does not yet make them authoritative.
- A separate `video_projects` / `video_project_revisions` domain in
  `apps/web/server/routers/videoProjects.ts` has optimistic concurrency. It is
  Video Studio/Intelligence state and must not be joined to the active Web
  Editor by ID or used as a third editor store.
- `/video-editor?legacy=1` is a rollback surface and must use a versioned
  adapter without bypassing the canonical revision/CAS boundary.

### Composition scan and Worker boundary

- `media.composition_scan` is submitted by the Phase 3 Full Scan UI and maps to
  the Node `video.composition_scan` executor through
  `apps/web/server/services/compositionScanJob.ts` and
  `apps/web/server/services/jobExecutorRegistry.ts`.
- The current Node executor returns `status: degraded` with
  `object_interaction_detector_unavailable`. The current
  `promoteCompositionScan` route does not reject that status, so implementation
  must fail closed before promotion is exposed as approved evidence.
- The Rust Worker advertises an exact subset of media operations and does not
  advertise composition scan. Queueing a row is not evidence of capability
  readiness; unsupported operations must be capability-blocked or routed to the
  Node adapter, while an eligible but offline Worker may be `waiting_agent`.

### Existing verification

Focused baseline tests currently cover shared media contracts, Web Worker render
handoff/project mapping, and the composition-scan adapter. The safe baseline
command is:

```text
cd apps/web && pnpm exec vitest run shared/videoEditorContracts.test.ts client/src/components/videoeditor/__tests__/workerRenderHandoff.test.ts client/src/components/videoeditor/__tests__/workerEditorProject.test.ts server/services/__tests__/compositionScanJob.test.ts
```

Repository policy prohibits `npm run typecheck` or equivalent unless explicitly
requested because of RAM constraints. Browser, Windows Worker, deployment, and
production proof remain separate gates.

## Official external references

- FFmpeg filters: https://ffmpeg.org/ffmpeg-filters.html — trim/concat and
  filter semantics must be represented by a deterministic render plan, not
  hidden in UI state.
- FFmpeg FAQ: https://www.ffmpeg.org/faq.html — concat choices differ between
  filter and demuxer paths; the compiler must choose explicitly.
- Remotion: https://www.remotion.dev/ — React composition/rendering is an
  existing optional render surface, not a replacement for the canonical job
  control plane.
- Tauri architecture: https://tauri.app/concept/architecture/ — Webview/Rust
  message passing supports the Worker boundary, but server contracts remain
  authoritative for shared project state.
- Cloudflare Containers: https://developers.cloudflare.com/containers/ — the
  approved isolated runtime is a deployment profile, not a second queue or
  project store.

## Planning constraints extracted from research

1. Implement the smallest server-authoritative contract that can fence stale
   edits and unsafe promotion without inventing a second queue.
2. Preserve legacy Web projects through an explicit adapter and keep unsupported
   Worker capabilities visible as blocked/waiting rather than successful.
3. Keep AI/editor algorithms behind typed Evidence → Intent → Compile →
   Validate interfaces; do not claim an algorithm is production-ready merely by
   adding a UI button or queue row.
4. Use focused Vitest/Rust tests and browser/runtime evidence appropriate to the
   touched boundary.
