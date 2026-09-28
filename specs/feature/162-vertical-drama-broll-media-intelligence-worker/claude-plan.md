# Feature 162 implementation plan

## Outcome and boundaries

Implement a production-shaped Worker-first media pipeline for Vertical Drama
source footage and shot-video generation. A source file is discovered and
processed on the Worker machine; the server receives bounded metadata and only
accepts a verified derived artifact after checksum, manifest, Series ownership,
rights, duration, dimensions, and QC validation. The browser/storyboard never
reads a raw local path or source URL.

Feature 162 consumes the Series/root context and host routes owned by Feature
163. It owns shared media contracts, deterministic planning/QC, local Worker
processing primitives, server job admission/publication/index projection, and
media-specific storyboard/Media Workspace surfaces. Existing generic Worker
jobs and media assets remain backward compatible.

## Repository evidence and integration points

- Extend `apps/web/shared/workerRuntime.ts` for job/capability/stage schemas.
- Add focused shared media contracts under
  `apps/web/shared/verticalDramaMedia/` and tests beside them.
- Reuse `apps/web/server/services/verticalDramaBrollService.ts` and
  `verticalDramaMediaAssetService.ts` for provenance and Series media rules.
- Extend `apps/web/server/routes/workerRuntime.ts` only through typed route
  helpers and existing device-proof/token verification; route registration is
  already in `apps/web/server/_core/index.ts`.
- Add server services for media job admission, artifact verification,
  projection/index records, and workflow resolution. Keep DB writes in
  Drizzle transactions and use existing storage/presign helpers.
- Extend `apps/worker-app/src-tauri/src/control_plane.rs` and add native
  media modules for root-local scanning, FFprobe/FFmpeg execution, checkpoint
  state, and publication. The React webview receives safe projections only.
- Add media-specific React components under
  `apps/web/client/src/components/verticalDramaSeries/` and Worker App screen
  components under `apps/worker-app/src/` without creating a second shell.

The neutral Series access extraction is owned by
`apps/web/server/services/verticalDramaSeriesAccessService.ts` and is shared by
the browser router and Feature 163 Control Plane. Feature 162 does not add a
second authorization predicate. Its route tests distinguish execution-token
job admission from upload-token derived-artifact publication.

## Data and contract design

### Shared schemas

Create bounded Zod schemas/types for:

- `MediaRootBinding`, `SourceManifestEntry`, `MediaProbe`, `MediaAnalysis`,
  `DeadAirPolicy`, `FocusPolicy`, `ReframePolicy`, `StillMotionPolicy`,
  `ShotBudgetPolicy`, `MediaEditPlan`, `MediaQcReport`;
- typed `StartFrameManifest` and ordered `ReferenceFrameManifest` with asset
  ID/revision/fingerprint/role/order, optional last-frame/reference-video/audio
  manifests, and input contract hash;
- `WorkflowRequest`, `WorkflowPolicySnapshot`, and immutable
  `WorkflowResolution` with selection source, rejected candidates, route,
  MCP/tool/runtime versions, capability probe, and input manifest hash;
- job request/result/artifact manifest/error schemas for
  `vertical_drama_media_ingest`, `vertical_drama_broll_preprocess`, and
  `vertical_drama_shot_video_generation`.

All schemas are strict, bounded, tenant/Series references are server-owned,
and unknown keys, absolute paths, URLs, shell commands, raw graphs, provider
credentials, and browser-supplied R2 keys are rejected.

### Workflow and capability resolution

Implement a registry/resolver that selects an Admin default, allowed user
override, or safe auto-resolved workflow only after validating operation,
input roles, target profile, MCP route, model/license readiness, GPU/VRAM,
privacy route, cost/time budget, and QC support. Persist the resolution before
dispatch. Policy changes make queued resolutions stale; completed artifacts
retain their snapshot. MiniMax H3 entries are probe-gated and distinguish
T2V, I2V/first-last-frame, and reference-to-video contracts.

## Persistence and server services

Add an additive migration for Series/Worker media-root bindings and media
metadata/index projections. The migration must be nullable/additive where
possible, have tenant/Series/Worker indexes and active uniqueness, and include
dry-run conflict reporting. Do not blind-backfill unresolved owners or raw
paths. Store only opaque root IDs, versioned device-local fingerprint,
safe labels, policy snapshot, revisions, artifact keys, analysis/QC metadata,
and audit references.

Server logs and projections redact source filenames, relative labels, raw paths,
provider URLs, and fingerprints unless a bounded local-only diagnostic is
explicitly requested. Artifact finalization re-resolves the current Worker
principal, Series access, root status, policy revision, rights state, and shot
revision before accepting the upload; a job snapshot alone is never a current
authorization grant.

Implement:

- `verticalDramaMediaJobService`: server-derived principal validation, job
  idempotency, Feature 162 policy snapshot, capability admission, and state
  transition guards;
- `verticalDramaMediaPublicationService`: upload-token admission, checksum /
  manifest / artifact lineage / rights / Series validation, durable media
  asset creation, and vector-index enqueue;
- `verticalDramaMediaIndexService`: SeriesID + tenant filtered metadata
  projection and idempotent embedding/index updates;
- `verticalDramaWorkflowResolver`: admin default/user override/auto selection,
  compatibility rejection reasons, and immutable snapshot;
- worker route handlers for typed submit/progress/artifact finalize/projection
  operations with stable errors, idempotency, request IDs, and no source URL.

## Native Worker pipeline

Implement native typed commands and durable local state:

1. validate and bind an existing source root or managed workspace without
   symlink/junction traversal, unstable-file reads, source mutation, or
   derived-output re-ingestion;
2. scan bounded media files and create an atomic local manifest/checkpoint;
3. probe with FFprobe; detect silence/dead-air, black/frozen/blur/duplicate
   frames, scenes, and subject candidates;
4. resolve a typed edit plan; trim within the selected shot budget;
5. render subject-aware 9:16 using face/person/object/manual focus and smooth
   keyframed crop/reframe; render still-image push/pull/pan/parallax only when
   inputs support it;
6. run output probe/QC, create immutable artifact manifest and preview;
7. upload only the verified derived artifact using the existing Worker upload
   token and complete publication; never upload original source bytes.

Native checkpoints pin `jobId`, `seriesId`, `rootId`, binding/policy
revisions, source fingerprint, idempotency key, remote execution ID, stage,
and output checksum. Crash/power-loss recovery resumes only matching state,
reconciles remote execution before retry, and quarantines partial output.

Stages are monotonic across `queued → claimed → staging → probing →
analyzing → planning → rendering → encoding → qc → uploading → publishing →
indexing`; retries create an explicit attempt and never reuse a completed
publication. If the Worker loses contact after upload or a provider finishes
remotely, reconciliation checks the remote execution/artifact ID and checksum
before retrying. Revoke/unbind blocks new stages, lets a safe local checkpoint
finish within drain grace, and quarantines any output that cannot prove its
pinned root/policy/revision. No transport `completed` state becomes `Ready`
without domain QC and verified artifact manifest.

## ComfyUI/MCP shot-video path

The Worker launches/communicates with the official local MCP adapter through a
typed `ComfyMcpAdapter`. It negotiates a pinned tool manifest, probes
capabilities, resolves the workflow registry entry, stages approved frame and
reference assets locally, dispatches a typed job, observes progress, and
ingests output into the same QC/publication contract. Direct ComfyUI HTTP is
not a Worker/browser contract. Unsupported MCP/tool/model/runtime versions
produce `CAPABILITY_UNAVAILABLE` rather than silently falling back.

## UI/UX contract

### Target user and JTBD

The drama creator needs to turn many imperfect local clips into trustworthy
B-roll and attach a generated/derived result to one of nine storyboard shots
without manually watching every file or losing framing intent.

### Surface inventory and ownership

- Media Workspace: Intake, Inventory, AI Plan, Review/QC, Processing, Published;
  mounted by Feature 163 and owned by Feature 162 for media semantics.
- Nine-shot storyboard: each shot card shows source/derived readiness,
  start/reference frame attachments, workflow resolution, QC, and actions.
- Shot drawer: intent/focus/trim/motion/reference editor, compact workflow
  override, preview, approval, retry, replace, apply.
- Admin Workflow Policy Console: defaults, allowlist, lock/override,
  fallback, resource/cost limits, audit.

### State matrix

Every surface must represent loading, empty, error, offline/stale, access
denied, blocked prerequisite, processing/progress, needs review, verified
ready, publishing, published, failed/retry, and revoked-root states. `Ready`
is never derived from transport completion alone; it requires verified manifest
and domain QC.

### Responsive/accessibility/copy

Use existing semantic UI tokens and component patterns. Desktop uses a
two-column inventory/review layout; tablet collapses detail to a drawer; narrow
viewports use a single-column flow with sticky action bar. All controls have
labels, focus order, keyboard operation, disabled explanations, semantic
status announcements, contrast, reduced-motion behavior, and localized Thai /
English copy. Native absolute paths are shown only locally in the Worker.

### Browser/native evidence

Require focused component tests plus browser evidence for nine-shot cards,
shot drawer, Media Workspace states, workflow chooser, and admin policy. Require
native/Tauri evidence for folder picker, local-only path disclosure, crash
recovery, and derived-only publication. Live GPU/MCP/provider evidence is a
separate environment gate.

The nine-shot card owns only intent/attachment/action dispatch and renders the
server/native projection; the drawer owns unsaved draft state and must prompt
before switching shots. Batch actions report per-shot accepted/blocked results
and never hide incompatible shots. Use existing semantic design tokens and
avoid introducing a second navigation/sidebar system.

## Test and verification strategy

- Shared contract tests: strict bounds, forbidden fields, workflow resolution,
  start/reference ordering, idempotency and revision invariants.
- Server service/route tests: tenant/principal fail-closed, scope separation,
  hidden Series, publish verification, duplicate/replay, stale policy/root,
  vector index tenant/Series filters, stable errors.
- Native Rust tests: root safety, settle/fingerprint, HMAC identity,
  checkpoint atomicity, trim/reframe plan, QC gate, quarantine/recovery, and
  single coordinator behavior.
- UI tests: nine-shot state/action matrix, workflow chooser policy, local-only
  copy, disabled/stale/offline/access-denied paths, keyboard/focus.
- Integration fixtures: local source → derived artifact → R2 verification →
  Series media projection → vector index → shot picker.
- Focused commands: `npm --workspace apps/web test -- <files>`,
  `npm --workspace apps/worker-app run typecheck`,
  `npm --workspace apps/worker-app test`; use `git diff --check`.

## Rollout and recovery

Use independent flags for shared contracts, local ingest, AI planning, shot
generation, publication, and indexing. Canary with a Worker fixture, then
enable local scan/processing before publication. Rollback stops new admissions,
drains/quarantines active work, preserves source/artifacts/history, and leaves
old storyboard behavior available. Record metrics for queue time, processing,
QC rejection, publication/index lag, MCP capability failures, and policy/root
revocations.

Missing GPU, MCP, provider, or model readiness must produce a typed blocked
state and actionable diagnostics; it must never be simulated as a successful
render. Focused tests prove contracts and deterministic/local behavior only.
Migration execution, real R2, GPU, MCP, provider, browser, and deployment
evidence are separate gates and must be reported as unperformed until run.

## Implementation order

1. shared contracts and deterministic resolver/QC primitives;
2. additive schema/migration and server services;
3. Worker native root/scan/process/checkpoint/publication;
4. ComfyUI MCP/workflow adapter and generated-shot path;
5. Media Workspace and nine-shot UI integration;
6. integration fixtures, rollout flags, observability, and final audit.
