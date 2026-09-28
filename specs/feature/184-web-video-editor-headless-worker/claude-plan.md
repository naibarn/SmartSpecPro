# Feature 184 — Deep implementation plan

## Objective and delivery boundary

This plan turns the approved Feature 184 specification into an incremental implementation that can be reviewed and rolled back. The outcome is a browser-first video editor backed by server revisions, managed media, and the existing `worker_jobs` control plane. Heavy probe, proxy, analysis, encode, upload, and QC work runs in a headless Worker and returns verified artifacts. The plan does not delete the Worker editor during migration, does not create a second queue, and does not claim production or paid-job proof from mocked tests.

The implementation is intentionally additive. Existing `video_editor_projects`, `videoEditorProjects` consumers, `worker_jobs` families, `/api/worker-jobs/*` worker protocol, and Feature 133 scene-based `videoProjects` remain compatible. New code must be isolated behind typed adapters and feature flags until the parity and rollout gates pass.

## Source-of-truth constraints

- The source specification is `spec.md`; `claude-spec.md` is the synthesized input and `claude-research.md` records repository evidence.
- Existing Web project persistence is `video_editor_projects` plus `videoEditorProjects` router. Add revision/asset/job relations by migration or companion tables; never create an unconnected `editor_projects` store.
- Existing worker queue status values are lowercase and must remain the database truth. New media envelopes are stored in the existing JSON columns and validated before claim.
- Existing Worker Tauri UI is the parity baseline and remains a fallback. Native commands are not imported into the Web bundle.
- The new queue page is `/worker-jobs`, displayed in Thai as `คิวงานประมวลผลของฉัน`; `/render-jobs` is a query-preserving compatibility alias. `render job` remains valid terminology for render operations and is not globally replaced in diagnostics.

## Implementation strategy

Build in dependency order: freeze shared schemas and fixtures, make persistence/versioning safe, add contract and queue admission, extract headless execution and artifact verification, port the browser editor, migrate the queue UI/name, then wire rollout and end-to-end proof. Each section writes tests before implementation, updates the section document with actual paths, and records skipped runtime evidence. Schema changes have one owner and require a migration dry run before any production consideration.

## Section 01 — Shared contracts, fixtures, and compatibility boundary

Create the minimum shared contract surface without moving UI code yet. Define canonical NLE document types, discriminated asset references, `smartaihub.media.job` v1 envelope, operation/job-type allowlist, failure categories, stage/event schemas, resource/capability requirements, and output manifest schemas. Keep the existing `MediaJobSpec` v0.1 and current worker-family payloads behind compatibility adapters. Add deterministic JSON fixtures consumed by TypeScript and Rust tests.

Primary paths:

- `packages/shared/src/video-editor/` for the browser/Rust fixture source of truth (`nleProject.ts`, `mediaExecutionContract.ts`, `migrations.ts`, `fixtures/*.json`); do not create a new workspace package in this feature.
- `apps/web/shared/types/mediaJob.ts` and `apps/web/shared/workerRuntime.ts` compatibility adapters.
- New shared schema tests and `apps/worker-app/src-tauri` fixture parsing tests.

Contract requirements:

- Strict version parsing and major/minor negotiation; unknown major, operation, analysis kind, output role, or unsafe option fails validation before claim.
- Immutable envelope hash excludes attempt/lease/renewed URL execution metadata.
- Asset refs identify namespace and ID; no persisted local path or expiring URL.
- Render plan stores profile/provider/template versions, stage DAG, dependencies, resource limits, verification policy, retry policy, approval/billing scope, and declared output roles.
- Failure categories include validation, authorization, capability, asset, execution, verification, upload, publication, cancellation, timeout, and lease-lost. Database status remains `failed`, `canceled`, or `expired`.
- Fixtures cover unknown fields, duplicate roles, path traversal, URL/overlay rejection, version negotiation, hash stability, event sequence, and allowed transitions.

Tests first: schema accept/reject matrix, cross-language fixture parity, hash determinism, operation allowlist, resource-limit semantics, and compatibility projection from old `MediaJobSpec`.

## Section 02 — Canonical project persistence, revisions, and concurrency

Evolve the existing `video_editor_projects` persistence rather than introduce a duplicate. Add only the columns needed for tenant/owner scope, schema version, current timeline revision, migration provenance, and archival state, or use companion tables when a column would break existing consumers. Add immutable revision snapshots, asset links, and project-job links keyed to the existing project ID and `worker_jobs.id`.

Primary paths:

- `apps/web/drizzle/schema.ts` and a new numbered migration under `apps/web/drizzle/`.
- The migration owns `video_editor_project_revisions`, `video_editor_project_assets`, and `video_editor_project_jobs`; exact column/index names must be recorded in the migration and schema diff before implementation continues.
- `apps/web/server/routers/videoEditorProjects.ts` and a focused project/revision service.
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`, project manager/hooks, and shared project types.

Behavior:

- Preserve existing list/get/save/autoSave/delete/rename procedure behavior for current consumers while adding revision-aware procedures or optional fields.
- Every mutation includes expected revision, client mutation ID, schema version, and typed operation. Use transactional compare-and-swap; duplicate ID plus same payload returns the original result, different payload conflicts.
- Autosave serializes in-flight writes and never applies an older response over newer local state. IndexedDB recovery is scoped by tenant/user/project and requires explicit rebase on conflict.
- Restore creates a new revision and keeps the source snapshot. Render submission pins the exact revision and plan hash.
- Use transaction locking/CAS consistent with existing Drizzle patterns; add integration coverage for two tabs, stale response, restart, deletion while job is active, and unauthorized IDs.

Tests first: migration schema shape, ownership/tenant checks, CAS success/conflict, idempotent mutation, autosave ordering, restore, archive/delete guard, and legacy router regression.

## Section 03 — Asset ingest, import migration, and proxy artifacts

Port Worker NLE 1.0.0 and legacy Web `VideoEditorProject` through a previewable migration pipeline. Keep immutable input and a report of every converted, unresolved, or unsupported field. Resolve local paths only through an explicit user-selected ingest/Worker bridge; browser documents store managed asset refs.

Primary paths:

- `apps/web/client/src/services/projectManager.ts`, `webProjectManager.ts`, `videoEditorService.ts`, and new migration utilities.
- `apps/web/server` asset/storage service and existing R2/managed media abstractions.
- Worker executor adapter for probe/proxy/waveform/thumbnail operations.

Behavior:

- Validate size, MIME, duration, path containment, symlink/archive traversal, source hash, and tenant ownership before ingest.
- Import is idempotent by source hash plus migration version and project scope. Missing media becomes a relinkable placeholder; unsupported fields remain in provenance and block parity/final render when required.
- Proxy jobs use original-media timing, preserve VFR/source timestamps, audio alignment, rotation/color metadata, source/proxy hash, and profile version. Dedupe derived artifacts by tenant/source/profile.
- Browser playback uses authenticated range access and URL refresh; no public URL or NAS path is persisted.

Tests first: import round trips, field-preservation report, missing/relink flow, duplicate ingest, path/URL security, VFR/speed/trim/audio mapping golden fixtures, proxy metadata validation, and authenticated range behavior.

## Section 04 — Worker job API, scheduler, leases, and billing

Extend the existing worker scheduler and router to admit editor media operations. Do not add a new queue. Store the envelope in `worker_jobs.inputJson`, requirements in `capabilityRequirementsJson`, executor controls in `instructionsJson`, and verified results in `outputJson`.

Primary paths:

- `apps/web/server/routers/workerJobs.ts` and a new editor project/media-job router or service.
- The new user-facing procedures live in `apps/web/server/routers/editorMediaJobs.ts` (or an explicitly documented extension of `workerJobs.ts`) and use the `editorProjects`/`editorMediaJobs` names from the spec; the chosen location must be reflected in the router registration and tests.
- `apps/web/server/services/workerSchedulerService.ts`, `workerBillingService.ts`, and monitor/watchdog services.
- `apps/web/server/routes/workerRuntime.ts` existing heartbeat, claim, event, reference, and artifact routes.

Behavior:

- Add authenticated preflight/submit/status/cancel/retry/replay/apply procedures with stable error codes, trace IDs, retryability, and ownership checks.
- Preflight pins revision/plan/estimate with expiry. Submit revalidates revision, asset access, capability, queue capacity, approval, and credit policy in one transactional boundary.
- Credit state is idempotent: `not_required → reserved → consumed|released`; infra retries never reserve or charge again.
- Capability snapshots carry observed/expiry/hash/contract versions. Expired or incompatible workers are ineligible. Scheduler applies hard filters, bounded capacity, tenant quota, weighted fairness, aging, affinity, priority, and reliability.
- Claim and event updates are fenced by lease token/attempt ID. Enforce the allowed transition table server-side; stale callbacks and late uploads have no side effects. Persist stage DAG progress and dependency checksums.
- Preserve all existing job family validators and tests; new editor job types are allowlisted and adapters are explicit.

Tests first: auth/tenant/RBAC, preflight expiry, idempotent submit, credit reserve/release/consume, queue capacity, fair scheduling, capability freshness, claim fencing, transition rejection, cancellation race, retry/backoff, stale event, and existing job-family regressions.

## Section 05 — Headless Worker executor, providers, artifacts, and diagnostics

Separate execution context from Tauri UI while reusing existing sidecars. Add a headless media executor that accepts only the validated envelope and selects `NativeFFmpegProvider` or `RemotionProvider`. Worker downloads scoped assets, executes bounded stages, probes outputs, uploads via the existing artifact protocol, and emits structured progress/diagnostics.

Primary paths:

- `apps/worker-app/src-tauri/src/worker_executor.rs`, `worker_loop.rs`, runtime manifest/capability reporter, and new media adapter modules.
- The executor contract boundary is `apps/worker-app/src-tauri/src/media_execution/` with provider modules for native FFmpeg and Remotion; no Tauri command handler may call this boundary with an unvalidated payload.
- Existing FFmpeg/Remotion sidecar invocation paths, isolated working-directory helpers, and resource/cancel handling.
- `apps/web/server/services/workerArtifactService.ts`, `workerJobMonitorService.js`, and diagnostics routes/UI.

Behavior:

- Never accept arbitrary shell/Python/filtergraph/code. Construct argv from typed operation options and compile untrusted overlays into vetted versioned artifacts; block if sandbox proof is unavailable.
- Renew heartbeat during every stage and upload. Cancellation terminates the process tree within configured grace and prevents publication when cancel wins.
- Completion manifest includes checksum, size, MIME, codec, dimensions/duration, raw measurements, provenance, verification version/warnings, attempt/lease, and declared role. Verify the object server-side before publication.
- Publish and Library linkage are idempotent by job/role/checksum. Diagnostic bundles redact credentials, signed URLs, provider keys, and personal local paths. Replay creates a linked job with exact/equivalent labeling and audit.

Tests first: executor allowlist, resource/path sandbox, provider selection, cancellation, lease renewal, output probe/QC, checksum mismatch, upload resume, stale completion, duplicate publication, diagnostic redaction, and replay authorization.

## Section 06 — Browser editor extraction and Web platform adapter

Extract pure timeline reducers, commands, time mapping, autosave, and validation from the Worker editor. Port the Worker UI capability set into browser-compatible components and route `/video-editor` through the feature flag. Keep existing Web editor consumers and migration adapters until parity is measured.

Primary paths:

- `apps/worker-app/src/screens/media-workspace/{MediaVideoEditorPlayer,MultiTrackTimeline,timelineEdits,mediaWorkspaceTimeline,audioDuckingEngine,projectPersistence,useProjectAutosave}.ts(x)`.
- `apps/web/client/src/components/videoeditor/*`, `pages/VideoEditorPage.tsx`, `services/videoEditorService.ts`, and shared editor packages.
- New browser `PlatformAdapter` implementation and desktop adapter boundary tests.

UI/UX contract:

- Target user: a creator editing a multi-track project who needs responsive preview, safe autosave, and durable final render without keeping Worker App open.
- Surface inventory: `/video-editor`, project load/import, asset drawer, timeline, preview/player, captions/overlays/audio panels, export dialog, job status, conflict/recovery dialogs.
- Component ownership: editor-core owns commands/reducers/time; editor-ui owns rendering/interaction; server owns persistence/policy; platform adapter owns file/capture/notification integration.
- State matrix must cover loading, empty, importing/uploading, proxy pending/failed, unsaved/saving/saved, conflict/offline recovery, disabled/no worker, queued/running/uploading/publishing, completed/failed/canceled/expired, focus/selected/hover, and stale result review.
- Responsive matrix: full editing on laptop/desktop; tablet supports inspect, load, save, and job status without loss; mobile provides read/status/recovery with explicit advanced-editing limitation.
- Accessibility: semantic controls, labels, keyboard timeline shortcuts, visible focus, reduced motion, contrast in dark/light themes, and screen-reader status announcements.
- Copy: Thai primary with English fallback. Use `คิวงานประมวลผลของฉัน`/`คิวงาน Worker`; use operation-specific render/proxy/analysis/audio labels. Errors expose stable user-safe messages and trace IDs only when useful.
- Browser evidence: authenticated Playwright screenshots/E2E at mobile, tablet, laptop, and desktop, plus jsdom component tests for async states; no missing browser tooling is reported as pass.

Tests first: reducer/time mapping characterization, migrated Worker fixtures, keyboard/focus, autosave/conflict, platform adapter no-Tauri import, proxy playback, overlay sandbox, responsive state, and route-level browser tests.

## Section 07 — Worker Jobs page rename and queue UX

Generalize `RenderJobsPage` into the Worker Jobs surface without breaking existing data. Add `/worker-jobs` as canonical and route `/render-jobs` through a query-preserving alias. Update navigation and copy using the naming contract from the source spec.

Primary paths:

- `apps/web/client/src/App.tsx`, `pages/RenderJobsPage.tsx`, `pages/Dashboard.tsx`, navigation/menu configuration.
- `components/videoStudio/RenderPanel.tsx`, Vertical Drama copy/links, diagnostics deep links, and `pages/__tests__/RenderJobsPage.test.tsx`.

Behavior:

- Canonical title is `คิวงานประมวลผลของฉัน`, short navigation is `คิวงาน Worker`, and English metadata/route is `Worker Jobs`/`/worker-jobs`.
- Display operation-specific labels for render, proxy, probe, waveform, analysis, and audio. Do not globally replace valid `render job` operation logs.
- Preserve filters (`jobId`, `projectId`, `status`, `operation`), selected job, output links, cancellation, reconnect, terminal states, and historical render jobs.
- Add alias marker/telemetry, canonical URL metadata, and deprecation/retirement dashboards. Keep `workerJobs` tRPC and `/api/worker-jobs/*` names unchanged.

Tests first: canonical route, alias query preservation, navigation/copy labels, operation grouping, historical job rendering, status/error states, accessibility labels, and deep-link compatibility.

## Section 08 — Render submission, result application, replay, and user notifications

Replace browser/legacy direct render submission for the new Web editor with revision-pinned media-job submission. Reuse existing output/media history paths, but expose result revision and review/apply semantics so background output cannot overwrite newer edits.

Primary paths:

- `apps/web/client/src/components/videoeditor/ExportDialog.tsx`, `VideoEditorPhase3.tsx`, `videoEditorService.ts`, and new editor job client hooks.
- `apps/web/server/routers/videoEditorProjects.ts`, worker job service/router, billing, artifact publication, media history/library linkage.
- Notification/event service (`apps/web/server/services/jobCompletionNotificationService.ts` / `notificationService.ts`) and diagnostics deep links.

Behavior:

- Save/resolve conflict, run preflight, show estimate/approval, submit with idempotency key, and display server snapshot status.
- Allow cancel/retry/replay under policy. Show revision N output while current project is N+1; applying analysis/subtitle/reframe requires expected version and user review.
- Publish verified artifacts once, surface indexing recovery separately, and notify the owner with dedupe. Do not charge duplicate polls/retries.

Tests first: export preflight, stale revision, approval/credit flows, duplicate submit, status reconnect, cancel/retry/replay, old-result review/apply conflict, Library publication, notification dedupe, and error-copy localization.

## Section 09 — Rollout, telemetry, retention, and rollback

Add the `video_editor_mode` cohort decision and operational controls. Establish canary dashboards, data-integrity alerts, retention configuration, replay window, and rollback runbook before changing defaults. Keep the Worker UI for the required stable release cycle.

Primary paths:

- Existing feature-flag/tenant settings services, menu config, runtime release and rollout scripts.
- The first implementation reads/writes the existing `featureFlags`/`tenantFeatureFlags` services (`apps/web/server/services/featureFlags.ts`, `apps/web/server/routers/tenantFeatureFlags.ts`) and client gates (`apps/web/client/src/hooks/useTenantFeatureFlag.ts`); any new rollout store requires an ADR and migration owner.
- Worker Jobs analytics/diagnostics, audit/retention cleanup, support links, and deployment runbook docs under `docs/operations/feature-184/`.

Behavior:

- Roll out internal `web_beta`, tenant/user cohorts, then `web_default`; emergency rollback has precedence and flag cache invalidation is tested.
- Track parity denominator, save/import/proxy/render/duplicate-credit/cross-tenant metrics, alias hit-rate, queue wait versus execution, and support/error reports with owner thresholds.
- Keep source/plan/runtime references through replay window; delete only after active jobs and legal/retention checks, with tombstones against stale callbacks.
- Route retirement and legacy UI removal are separate decisions; remove `/render-jobs` alias and Worker UI only after the specified evidence gates.

Tests first: flag precedence/cache invalidation, cohort routing, canary stop condition, retention/delete guard, audit/redaction, rollback drill, and metric cardinality/privacy checks.

## Section 10 — Cross-section integration and acceptance proof

Wire the sections into one user flow and prove the 18 acceptance scenarios. Add fixtures and runbooks before claiming a section complete. Use focused tests after each section and a full integration review after all sections.

Required proof:

- Web create/import/edit/save/reload with two-tab conflict and offline recovery.
- Proxy/probe/thumbnail/waveform and final FFmpeg/Remotion job submission through existing queue, real Worker claim/lease, artifact verification, Library publication, and close/reopen recovery.
- Cancellation, retry, duplicate delivery, stale callback, missing capability, low disk, corrupt output, R2 timeout, and replay behavior.
- Cross-tenant/path/URL/overlay attack denial, secret redaction, billing idempotency, and notification behavior.
- `/worker-jobs` canonical route, `/render-jobs` alias, Thai/English copy, accessibility/responsive/browser evidence, and rollback.

Final quality gate is not a substitute for missing environment proof. Full Web typecheck/build, Playwright, Rust packaging, real sidecar execution, migration dry run, and deployment are recorded independently with exact commands and blockers.

## Cross-section risks and decisions

- Existing `video_editor_projects` is a compatibility constraint; schema owner must reconcile current `videoEditorProjects` consumers before adding fields.
- Existing `MediaJobSpec` and `worker_jobs` families have different status/payload shapes; adapters must be explicit and tested rather than broad casts.
- Tauri imports already exist in Web dependencies; the requirement is no runtime/transitive import from the new browser editor path, verified by bundle/static checks.
- The dirty worktree includes unrelated application/schema/spec changes. Stage only Feature 184 files and use a temporary index or clean worktree when commit proof is required.
- Runtime-dependent and paid/provider behavior cannot be proven by local unit tests alone; preserve explicit skipped evidence and do not spend credits during diagnosis.
