# Deep-plan research — Spec 203

## Research decision

- Codebase: required. The repository already contains the Web Editor, shared
  media envelope, `worker_jobs` control plane, Feature 184 revision tables,
  Node composition scan, and a Rust/Tauri Worker.
- Web topics: required because the spec names FFmpeg, Remotion, Tauri, and
  Cloudflare Containers. Official references are recorded below; no external
  runtime was introduced by research.
- Testing: Vitest for Web/shared contracts and Rust unit tests for Worker
  capability/dispatch; browser, Windows, and deployment checks remain explicit
  release gates.

## Codebase findings

- The current implementation has a useful contract foundation in
  `packages/shared/src/video-editor/mediaExecutionContract.ts` and canonical
  NLE migration/validation helpers. It still models the active editor handoff
  around browser-generated revisions and direct `inputs.project` transport.
- `video_editor_projects` is the active Phase 3 persistence path, while
  `video_projects` and `video_project_revisions` are a separate Video
  Studio/Intelligence domain. Spec 203 must prevent accidental cross-domain
  joins and must not create a third store.
- Existing Feature 184 tables can support immutable revisions, assets, and
  project-job links, but transactionally creating a revision, execution
  snapshot, worker job, outbox publication, and idempotency record is not yet
  wired through the active router.
- `editorMediaJobs.submit` adds exact operation claim tokens, but an unsupported
  operation can still leave a queued row if admission is not strengthened.
  The target semantics distinguish `capability-blocked` from temporary
  `waiting_agent`.
- The current Node composition executor is intentionally degraded and the
  current promotion endpoint does not fail closed on that output. This is a
  concrete implementation blocker for approved Evidence/Intent promotion.
- The Rust Worker has native editor media operation constants and a claim
  capability builder, but no native composition-scan executor/capability.

## Official external references

- https://ffmpeg.org/ffmpeg-filters.html
- https://www.ffmpeg.org/faq.html
- https://www.remotion.dev/
- https://tauri.app/concept/architecture/
- https://developers.cloudflare.com/containers/

## Testing and evidence boundary

The implementation plan uses focused contract tests first, then router/service
integration tests, then Web component tests, and finally browser/Worker proof
where the environment exists. No typecheck command will be run under the repo
RAM policy. A green Vitest run cannot be reported as Windows or production
parity.

## Planning decisions

1. Spec 203 owns runtime identity, canonical time, revisions, snapshots,
   evidence, intent, compiler, validator, agent capability, and artifacts.
2. Spec 202 owns product UX, Rough Cut/EDL behavior, and optional tools; it
   consumes Spec 203 contracts and never adds another queue or timeline store.
3. Degraded evidence is diagnostic-only and non-promotable by default.
4. The implementation must preserve tenant-derived authorization and must not
   revive Agency, legacy workflows, OpenSandbox, Docker, or retired workpacks.
