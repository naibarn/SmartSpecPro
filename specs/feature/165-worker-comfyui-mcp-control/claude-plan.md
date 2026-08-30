# Feature 165 Implementation Plan

## 1. Implementation objective and constraints

Implement the approved Feature 165 ComfyUI control capability in the existing
SmartSpecPro repository. The implementation is additive and must preserve
legacy Worker settings, current Worker job types, Remotion, Hermes, existing
Comfy jobs, existing Web job responses, and historical data. New Comfy
execution goes through a native Rust MCP adapter; the SmartAIHub control plane
continues to use its authenticated Worker HTTP routes for pairing, claim/lease,
progress, monitoring, artifact upload, and publication.

The implementation is complete only when all four canonical Comfy job types,
all supported profile transports, workflow/schema resolution, permissions,
revision provenance, local output validation, optional Library publication,
restart recovery, shared Web/Worker monitoring, and bilingual UI states are
implemented and tested. HyperFrames is not a new dependency or readiness gate.

No section may expose secrets/local absolute paths through Web state, server
metadata, telemetry, job payloads, or error messages. No section may add a
second queue database, unauthenticated Worker REST server, or direct browser to
Comfy path.

## 2. Current implementation anchors and chosen architecture

### 2.1 Existing anchors

- Native entry/state: `apps/worker-app/src-tauri/src/lib.rs` and Tauri command
  registration in `commands.rs`.
- Legacy Worker settings: `apps/worker-app/src-tauri/src/settings.rs`.
- Existing local MCP stdio client: `apps/worker-app/src-tauri/src/comfy_mcp_client.rs`.
- Existing direct loopback Comfy REST executor:
  `apps/worker-app/src-tauri/src/comfy_executor.rs`.
- Job dispatch/progress and capability hints:
  `apps/worker-app/src-tauri/src/worker_executor.rs` and `worker_loop.rs`.
- Shared Zod contracts and job types: `apps/web/shared/workerRuntime.ts`.
- Worker permission catalog: `apps/web/shared/workerAccessKeys.ts`.
- Worker control-plane routes: `apps/web/server/routes/workerRuntime.ts`.
- Worker Series/media routes: `apps/web/server/routes/workerSeriesControlPlane.ts`.
- Worker job database: `apps/web/drizzle/schema.ts`.
- Web job monitor: `apps/web/server/routers/workerJobs.ts`,
  `workerJobMonitorService.ts`, and `RenderJobsPage.tsx`.
- Existing Rust tests are inline Cargo tests; Web tests use Vitest, with jsdom
  for browser-facing components.

### 2.2 Architecture decision

Create a transport-neutral `ComfyMcpAdapter` seam in the Rust Worker. It owns
profile resolution, secure credential lookup, MCP initialize/tool discovery,
typed tool invocation, session reconnect, execution correlation, output
collection, and close/cleanup. Implement transport modules behind this seam:

1. local stdio child process for same-machine `comfy-mcp`;
2. approved stdio bridge for a remote ComfyUI target;
3. Streamable HTTP self-hosted MCP;
4. fixed/allowlisted Comfy Cloud Streamable HTTP;
5. managed SSH tunnel that hands a validated local endpoint to one of the
   above adapters.

Keep the old `comfy_executor` REST path behind a legacy adapter selected only
for pre-existing payloads/settings during migration. New Feature 165 jobs must
resolve to `ComfyMcpAdapter` and must not receive arbitrary `baseUrl`, graph,
tool, or shell data from the browser.

Use server-owned records for profile projections, policy, workflow versions,
job envelopes, leases, revisions, and publication targets. Use Worker-local
records for secrets, local paths, staged files, execution/upload ledger, and
validated outputs.

## 3. End-to-end data flow

1. Admin publishes an approved workflow version and connection/policy limits.
2. User pairs a Worker and grants the initial scope set. The server stores the
   exact scope set and permission revision; later UI views render these grants
   checked/read-only.
3. Worker creates/updates a local secure profile, probes MCP, and sends a
   non-secret profile/capability projection. The server assigns profile,
   permission, connection-policy, and projection revisions.
4. Series owner binds approved image/video workflow versions and allowed
   profiles. The server validates active Series and revision-checks binding
   changes.
5. Shot UI or Worker Run Workflow UI submits typed intent only. Server resolves
   tenant/owner/job type, Worker/profile, workflow checksum/version, policy,
   input-resolution evidence, remote consent, budget, and authorized Library
   target into `ComfyRenderJob`.
6. Eligible Worker claims one lease atomically with capacity. Worker refreshes
   stale policy/capabilities, validates typed inputs and staged asset manifests,
   then passes the pre-submit gate.
7. Worker stages only approved inputs, invokes the selected MCP workflow,
   persists `ExecutionRef`, watches status, collects outputs into a confined
   workspace, validates every output, and atomically saves locally.
8. If requested, Worker uploads validated artifacts through the existing
   authenticated artifact protocol and reports publication/indexing. Upload
   resumes by checksum without rerunning Comfy.
9. Server projection updates are consumed identically by Web and Worker. The
   Worker Overview shows active work at the top and queue/wait reasons below.
10. On disconnect/crash/restart, the local ledger reconciles the remote
    execution by immutable reference before any new claim; orphan work cannot
    be duplicated or published.

## 4. Section plan and dependency order

| Section | Name | Depends on | Primary ownership |
|---|---|---|---|
| 01 | contracts-and-safe-migration | existing contracts/schema | shared TypeScript, Drizzle migration contracts |
| 02 | native-profiles-and-mcp-transports | 01 | Rust profiles, keychain, stdio/HTTP/SSH adapters |
| 03 | capability-and-workflow-resolution | 01, 02 | Rust capability engine, server registry/schema contracts |
| 04 | server-policy-and-comfy-jobs | 01, 03 | server schema, auth, job admission/lease/publication |
| 05 | worker-execution-and-recovery | 01, 02, 03, 04 | Rust executor, local ledger, output/retry lifecycle |
| 06 | shared-job-projection | 01, 04, 05 | server projection/API and Web adapter |
| 07 | worker-comfy-ui-and-overview | 02, 03, 05, 06 | Worker React/Tauri screens and i18n |
| 08 | series-shot-web-ui | 03, 04, 06 | Series settings, nine-shot generate drawer |
| 09 | integration-packaging-and-release | 01–08 | fixtures, e2e, runtime packaging, rollout gate |

Sections are executed in order. Section 02 may begin contract scaffolding after
Section 01; UI sections must wait for shared projection and contract names.
Section 09 is final and owns no duplicate production implementation.

## 5. Section 01 — contracts and safe migration

### Goal

Define the shared typed contract and additive persistence foundation before any
transport or UI work relies on it.

### Files and changes

- `apps/web/shared/workerRuntime.ts`: add canonical job type values for
  `comfy_video_generation` and `shot_video_generation`; add profile kind,
  transport, capability snapshot, workflow/version, canonical input, output
  policy, remote consent, resolution evidence, stable error, execution phase,
  shared summary, and contract negotiation schemas. Preserve old Comfy schemas
  and parse them through explicit legacy adapters.
- `apps/web/shared/workerAccessKeys.ts`: add `workers:jobs:read` as an additive
  scope and map it only to summary/detail visibility. Do not add it to existing
  pairings during migration.
- `apps/web/drizzle/schema.ts`: add tables/fields for
  `comfy_connection_profiles`, `comfy_capability_snapshots`, workflow registry
  and versions, Series operation bindings, Comfy execution runs, and the
  additive all-job projection/revision fields required by the spec. Reuse
  existing owner/tenant/Series helpers and existing artifact tables.
- `apps/web/drizzle/<next-numbered migration>.sql`: create nullable/defaulted records,
  indexes, unique active-default/binding/idempotency constraints, and safe
  status checks. Use the repository's migration naming convention.
- `apps/web/shared/__tests__/workerRuntime*.test.ts` and related server tests:
  add schema and legacy-adapter fixtures.

### Contract rules

- `ComfyRenderJob.connectionResolution` contains immutable selected profile,
  profile revision, effective permission revision, and connection-policy
  revision; all four are null together only when unassigned.
- Workflow resolution contains immutable workflow ID/version/checksum,
  binding revision, and registry revision.
- New jobs require paired `inputResolutionMode` and server-created evidence;
  legacy payloads keep both null and are never labeled Automated AI.
- `uploadLibrary=true` requires a non-null server-authorized logical Library
  target; local-only jobs never receive a target or remote consent.
- `WorkerJobSummary` is the only shared monitor shape; aliases preserve old Web
  field names without a second status calculation.
- Revisions carry typed namespace/scope metadata in audit records. A
  capability/projection refresh cannot grant scopes.

### TDD before implementation

- Parse all four Comfy job types and reject unknown/unsafe server-owned fields.
- Verify atomic null/non-null groups for profile/permission/policy resolution,
  remote consent, output target, and AI evidence.
- Verify old image/workflow payloads remain readable and retain null legacy
  evidence.
- Verify scope presets do not silently add `workers:jobs:read` to old pairings.
- Verify unique active profile/binding/idempotency constraints and tenant/owner
  foreign-key behavior.
- Verify migration dry-run/no-op behavior against representative existing
  Worker jobs/settings/artifacts and rollback-by-disabled-path behavior.

### Exit criteria

Shared schemas compile, legacy fixtures pass, migration is additive/idempotent,
and downstream sections have stable exported names for every referenced type.

## 6. Section 02 — native profiles and MCP transports

### Goal

Replace the single local-only connection assumption with secure multiple saved
profiles and one transport-neutral MCP session implementation.

### Files and changes

- `apps/worker-app/src-tauri/src/comfy_mcp_client.rs`: refactor the existing
  stdio client into the adapter/session seam. Preserve protocol-only stdout,
  no-shell argv, child supervision, request deadlines, tool allowlisting, and
  redacted stderr/diagnostics. Add MCP protocol negotiation, schema capture,
  session ID handling, reconnect, and execution-reference correlation.
- Add focused Rust modules with these ownership boundaries:
  `apps/worker-app/src-tauri/src/comfy_profiles.rs` owns the local profile
  model/store, active selection, profile revisions, and redacted projection;
  `apps/worker-app/src-tauri/src/comfy_mcp_transport.rs` owns Streamable HTTP,
  stdio session framing, protocol/session headers, reconnect and endpoint
  validation; `apps/worker-app/src-tauri/src/comfy_ssh_tunnel.rs` owns host-key,
  forwarding, process and cleanup lifecycle; and
  `apps/worker-app/src-tauri/src/comfy_execution_ledger.rs` owns the local
  execution/upload/reconciliation records. Keep modules small and expose only
  typed adapter interfaces to the executor.
- `apps/worker-app/src-tauri/src/settings.rs`: add versioned local profile,
  keychain reference, active profile, policy cache, and execution ledger state;
  preserve legacy Comfy settings exactly and import them once as an unverified
  legacy profile.
- `apps/worker-app/src-tauri/src/commands.rs` and `lib.rs`: register native
  profile CRUD/test/activate/revoke/capability commands and redacted status
  queries. Secret fields go straight to the OS secure store and never into
  React state or server payloads.
- `apps/worker-app/src-tauri/src/credentials.rs`: reuse existing credential
  protection and add profile-scoped keychain references, refresh/revoke, and
  expiry handling.

### Transport behavior

- Local stdio launches only an approved executable/argv and uses JSON-RPC
  newline messages. No shell interpolation or remote command is accepted.
- Self-hosted HTTP/Cloud use one MCP endpoint, negotiated protocol header,
  authenticated every-request headers, Origin/host allowlist, bounded timeout,
  optional `Mcp-Session-Id`, reconnect on session 404, and no query-string
  credential. Cloud endpoint is fixed/allowlisted.
- SSH validates host key, user/keychain reference, forwarding target, local
  port ownership, timeout, and cleanup. The adapter never treats a remote path
  as a local path.
- Legacy REST is used only by old compatible jobs/settings; new profiles and
  new jobs cannot choose it.

### TDD before implementation

- Profile validation for every kind on Windows/macOS path/URL/TLS/SSH rules.
- Secret redaction, keychain reference persistence, expiry/refresh/revoke, and
  no secret in serialized projection.
- stdio initialize/tool discovery/tool-call failure and child cleanup.
- Streamable HTTP headers/session lifecycle, Origin/SSRF rejection, auth on
  every request, 401/403/404 handling, reconnect, and timeout.
- SSH host-key/forwarding/cleanup and duplicate tunnel prevention.
- Legacy settings import is once-only and preserves old values.

### Exit criteria

One typed adapter can open/test/close a local fake MCP server and a fake HTTP
MCP server; all profile mutations are revisioned locally/server-side; direct
Comfy REST is unreachable from new job code paths.

## 7. Section 03 — capability and workflow resolution

### Goal

Turn negotiated MCP capabilities and workflow descriptors into approved,
version-pinned, schema-driven execution inputs.

### Files and changes

- Extend the native capability model in the Section 02 adapter to capture
  protocol/server/tool/schema/workflow/input/output/limits/auth/expiry data and
  produce a hashable snapshot.
- Add server services with explicit boundaries:
  `apps/web/server/services/comfyWorkflowRegistryService.ts` owns workflow
  discovery/approval/version/checksum and schema records;
  `apps/web/server/services/comfyConnectionProfileService.ts` owns profile
  projection/capability revisions and policy checks; and
  `apps/web/server/services/comfyJobService.ts` owns typed Comfy job enrichment
  and preflight resolution. Job admission/lease/publication owns a separate
  `apps/web/server/services/workerComfyJobAdmissionService.ts` boundary so
  resolution and queue mutation cannot drift or collide. Use repository
  service/router patterns.
- Add shared schema/mapping helpers under `apps/web/shared/` for canonical
  typed fields and stable mapping errors.
- Add a server/admin router or extend the established router for discovery,
  approval, publish/deprecate/disable, and binding revision updates.

### Resolution rules

- Discovered workflow descriptors are review-only until admin/publisher
  approval. Published versions are immutable by checksum.
- The selector resolves a precise profile and workflow version. Display names
  are never used as execution identity.
- Mapping supports image/video/audio/mask/start/last/ordered reference frames,
  duration/FPS/size/aspect/seed/model/output format and provider extension data.
- Preflight returns structured errors and checks schema, checksum, capability,
  profile permission, Series binding, remote consent, input-resolution mode,
  budget and output policy.
- MiniMax H3 is a required-capability/workflow example only; no hardcoded
  provider path is added.

### TDD before implementation

- Capability snapshot hash/expiry and stale re-probe behavior.
- Alias/missing-tool negotiation and fail-closed required-family behavior.
- Workflow approval lifecycle, checksum immutability, revision conflict,
  compatible connection kinds, and deleted/disabled parent handling.
- Schema mapping for start frame, last frame, ordered references and video
  duration; invalid/missing/unsupported inputs produce stable codes.
- Manual/Guided AI/Automated AI evidence and policy gates.

### Exit criteria

An approved workflow version and capability snapshot can produce a typed,
server-valid preflight plan without raw graph/tool/endpoint input from the
browser.

## 8. Section 04 — server policy and Comfy jobs

### Goal

Create and route the four Comfy job types through existing authenticated Worker
lease/control-plane behavior, with immutable authorization and policy evidence.

### Files and changes

- `apps/web/server/routes/workerRuntime.ts`: add authenticated profile
  projection/capability report and `worker.jobs.summary` endpoint in the
  existing route family. Enforce Worker ID/token identity, scopes, contract
  range, and redaction.
- Add `workerComfyJobAdmissionService.ts` for profile policy, permission
  revisions, Comfy admission, target Worker routing, and artifact publication.
  Consume `comfyJobService.ts` for enrichment/preflight and reuse
  `workerSchedulerService.ts` and existing lease helpers.
- Keep the route contract explicit: Worker-authenticated `GET
  /api/worker-runtime/comfy/profiles`, `POST /api/worker-runtime/comfy/probe`,
  `GET /api/worker-runtime/jobs/summary`, and the existing claim/progress/
  artifact routes; Web uses authenticated tRPC procedures for create,
  preflight, cancel, retry, and detail. Route names are constants shared by
  server tests and native client wrappers, not strings supplied by a job.
- `apps/web/server/routes/workerSeriesControlPlane.ts`: expose only safe Series
  binding/profile/workflow projections required by the Worker; preserve local
  folder paths as native-only.
- `apps/web/client/src/pages/AdminMonitoring.tsx`: extend the existing admin
  worker-fleet/diagnostics surface for Comfy profile capability, policy, workflow
  approval/defaults, and revoke/drain visibility; add a new admin route only if
  the existing surface cannot host the controls without duplication.
- `apps/web/server/routers/workerJobs.ts` and
  `workerJobMonitorService.ts`: add shared summary/detail projection adapters,
  job-type filters, server-calculated wait/cancel/recovery fields, and preserve
  legacy tRPC response aliases.
- Extend Drizzle schema from Section 01 with server-owned profile policy,
  profile/permission/policy revisions, job execution ledger, capacity slot,
  event sequence/key, output target, and projection fields.

### Admission/lease behavior

- Browser sends typed intent only. Server derives all identity, tenant, job
  type, timestamps, revisions, budget, approval, and Library target fields.
- Claim locks job and Worker capacity atomically, validates current compatible
  revisions/capabilities/policy, assigns one lease/slot, and writes claim event
  before commit. Default capacity is serial across all Worker job families.
- Permission revocation blocks affected claim/preflight/submit/upload/publish
  operations immediately. `workers:jobs:read` controls monitor visibility only.
- Expiry is terminal for the attempt and returns `JOB_EXPIRED`; retry creates a
  new attempt. All mutations are request/idempotency/revision checked.
- Legacy rows remain readable; no migration invents AI evidence or profile
  provenance.

### TDD before implementation

- Tenant/owner/admin/profile/Series/workflow authorization and missing identity.
- Job enrichment rejects browser-owned server fields and unsafe asset refs.
- All four job types, selected Worker/profile matching, serial capacity, lease
  race, lease loss, expiry, cancel, retry, and idempotent replay.
- Permission revoke and revision conflict between queue, claim, and pre-submit.
- Library target pair validation and no execution side effect on failure.
- Worker-token summary/detail scope, Worker ID mismatch, cursor/projection
  revision, redaction, and Web legacy alias parity.

### Exit criteria

Server can create, queue, claim, monitor, cancel/retry and authorize all four
Comfy job types with durable revisions and no second job state implementation.

## 9. Section 05 — Worker execution and recovery

### Goal

Execute the server job contract in the native Worker using the selected MCP
profile/workflow, then save and publish safely across failures and restarts.

### Files and changes

- `apps/worker-app/src-tauri/src/worker_executor.rs`: add dispatch for
  `comfy_image_generation`, `comfy_video_generation`,
  `shot_video_generation`, and `comfy_workflow_run` while keeping Remotion,
  Hermes, media ingest, and existing compatibility branches isolated.
- `apps/worker-app/src-tauri/src/worker_loop.rs`: add profile/workflow
  capability hints, summary sync, claim preconditions, lease heartbeat,
  serial capacity and stale-policy revalidation. Do not advertise Comfy from a
  stale cached snapshot.
- Replace new calls to `comfy_executor.rs` with the Section 02 adapter. Keep
  direct REST only in a clearly named legacy compatibility path with tests.
- Consume the local execution ledger owned by Section 02 for job attempt, lease,
  execution reference, event sequence, output fingerprints, upload session/
  parts, cleanup state and reconciliation deadline; Section 05 owns lifecycle
  transitions, not a second ledger implementation.
- Reuse existing ffprobe/media safety helpers where possible for image/video
  output validation; add magic/MIME, codec/dimension/duration/count/size and
  role mapping checks.

### Execution phases

Implement the authoritative evidence sequence: preflight → stage inputs → MCP
submit → remote running → collect outputs → validate → atomic local save →
optional multipart artifact publication → completion. Every transition includes
job/attempt/lease and safe profile/workflow/revision provenance. An old lease,
sequence, or duplicate event is ignored idempotently.

On control-plane loss before claim do not claim; after claim continue only
within lease grace and reconcile. After MCP submit, reconnect/query the stored
execution reference and never blindly resubmit. On restart reconcile all
nonterminal records before polling for new work. Orphaned remote executions are
cancelled where supported and cannot publish until reconciled.

### TDD before implementation

- Dispatch and capability gates for all four types plus legacy Remotion/Hermes
  isolation.
- Typed input staging, one-time Worker-local staged IDs, hash/type/role/Series
  checks, remote consent and no local-only transfer.
- MCP execution correlation, progress mapping, cancellation, deadline/lease
  expiry and retry attempt creation.
- Output handle/path safety, image magic bytes, ffprobe video validation,
  multi-output role mapping, atomic save, local-only completion.
- Multipart upload init/part/complete/abort/resume, checksum mismatch and no
  rerun after publication failure.
- Crash/window close/sleep/network suspension/restart reconciliation and orphan
  prevention.

### Exit criteria

Fake MCP execution can run each job type end-to-end to a validated local file,
resume publication, recover after restart, and prove no duplicate remote run or
Library artifact.

## 10. Section 06 — shared job projection

### Goal

Make the Web job list and Worker Overview show identical authoritative job
identity/state while respecting different visibility scopes.

### Files and changes

- Add a projection builder/service near
  `apps/web/server/services/workerJobMonitorService.ts` that returns
  `WorkerJobSummary` for all supported Worker families, including active,
  waiting, recent, queue position, capacity slot, phase, timestamps, Worker
  identity, Series context, profile/workflow, safe error/recovery/cancel state,
  event sequence and stale time.
- Add server-maintained timestamps/event sequence/idempotent event key as
  additive fields or a read model on `worker_jobs`/`worker_job_events`.
- Add Worker-token route mapping in `workerRuntime.ts` with bounded cursor,
  projection revision, server clock, stale threshold, and
  `workers:jobs:read`. Worker sees assigned active jobs and eligible waiting
  jobs only; Web uses user session authorization.
- Adapt `workerJobs.ts` and `RenderJobsPage.tsx` to shared fields/status/type
  localization while preserving existing aliases and filters.

### TDD before implementation

- Projection parity fixture serializes one job identically before locale/time
  formatting for Web and Worker.
- Ordering/priority/FIFO/tie-breaker/cursor restart and projection revision.
- Active/waiting/recent all-job-family inclusion and Worker eligibility filter.
- Stale response cannot overwrite a newer event; server stale clock is shown.
- Redaction of local paths, prompts, tokens, inaccessible jobs and output refs.
- Old Web clients continue to receive their current response shape.

### Exit criteria

Web and Worker consume the same summary/detail projection and a busy Worker
shows every additional job waiting without claiming it prematurely.

## 11. Section 07 — Worker Comfy UI and Overview

### Goal

Implement a focused, bilingual Worker experience with one canonical Sidebar and
truthful connection/job status.

### Files and changes

- `apps/worker-app/src/app/workerRoutes.ts`, `WorkerAppShell.tsx`, `WorkerTopbar.tsx`,
  `CanonicalWorkerRouteScreen.tsx`: add canonical ComfyUI routes and remove the
  duplicate top Quick Actions surface. Keep cross-links to one owning screen.
- Add screens/components under `apps/worker-app/src/screens/` for Connections,
  Workflows, Comfy Jobs, and the Overview active-job dashboard. Keep Series and
  Media Workspace responsibilities separate.
- Add native invoke wrappers for profile operations, capability probe,
  workflow discovery/run, summary sync, and diagnostics. Every button must map
  to a real command/API/state transition with pending/error/reconcile states.
- Add Worker-wide locale state and translation catalog entries for `th`/`en`;
  dates, durations, status/error labels, accessibility names and recovery copy
  must use the selected locale.

### UI/UX contract

**Users/job:** Worker owner/operator manages local connections and wants to know
immediately whether the machine is connected, busy, waiting, or blocked.

**Routes:** Overview, Connection, Series, Media Workspace, Queue, Published,
AI Plan, ComfyUI/Connections, ComfyUI/Workflows, ComfyUI/Jobs, Runtime,
Settings. No duplicate queue or Quick Actions strip.

**Components:** header status triplet (control plane/loop/Comfy session), active
job card, waiting list, recent list, profile cards, permission inspector,
workflow schema form, preflight panel, output/publication panel, diagnostics.

**State matrix:** loading disables actions; populated shows effective data;
empty gives the next action; stale/offline is read-only with observation time;
permission denied names the missing scope; capability unavailable names the
missing tool/model; validation error points to typed field; server error shows
safe code/correlation/retry; destructive actions require localized confirmation.

**Responsive matrix:** desktop uses Sidebar + content; laptop collapses detail
panels without hiding status; tablet stacks cards and keeps active job first;
mobile uses one-column cards, sticky status/recovery action, and accessible
drawers for advanced inputs. No horizontal scroll for core status/actions.

**Accessibility:** keyboard navigation and visible focus, semantic headings/
landmarks, labels/error association, status live-region with throttled updates,
contrast, reduced-motion handling, copyable Job ID, and no color-only state.

**Copy:** Thai and English catalogs share keys; raw job type/ID remain available
for comparison; missing translations fall back to English with a diagnostic
marker; provider text is never rendered as an untrusted third language.

**Browser/evidence:** test the actual Tauri/WebView flow for locale switch,
profile add/test/expiry/revoke, workflow selector/preflight, active Overview,
busy queue, stale/disconnected recovery, and every destructive confirmation.

### TDD before implementation

- Sidebar route ownership and absence of duplicate Quick Actions/queue/editor.
- Profile cards, permission source/revision/actor/time, checked initial grants,
  revocation acknowledgement, expiry and reconnect guidance.
- Workflow discovery/approval/schema-driven inputs, frame ordering, preflight,
  output target and real pending/error states.
- Header truthfulness and Overview active/waiting/recent parity, stale thresholds,
  serial busy behavior and full/copyable job details.
- Thai/English coverage for every screen/status/error/accessibility label.
- Keyboard/responsive/reduced-motion and secret/path redaction assertions.

### Exit criteria

Worker UI has one clear navigation model, no mock buttons, complete bilingual
states, and Overview visibly explains all current work without opening another
screen.

## 12. Section 08 — Series settings and nine-shot Web UI

### Goal

Allow users to bind approved Comfy workflows and submit image/video generation
for each storyboard shot without exposing transport complexity or duplicating
the queue.

### Files and changes

- Edit the existing Drama Series surfaces at
  `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` and
  `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx`
  for the `Worker + ComfyUI` Series settings panel. The existing
  `workerMediaWorkflowPolicy`/`mediaWorkflowPolicySnapshotSchema` seam is the
  compatibility boundary; extend it instead of creating a parallel Series
  policy store. Edit
  `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` and
  `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  for the nine-shot generate drawer. The drawer must reuse the existing
  Worker-shot inspector boundary and must not create a second queue surface. Reuse
  `VerticalDramaEpisodeWorkspace.tsx` and
  `VerticalDramaWorkerShotInspector.tsx` only for existing composition/inspector
  seams; do not create a second storyboard or job editor.
- Add a compact Generate with Worker drawer to the existing nine-shot card:
  Worker/profile, mode, exact workflow version, duration, start/last/reference
  frames, schema-driven advanced inputs, Manual/Guided/Automated AI mode,
  preflight, cost/consent summary, submit, inline job status and detail link.
- Use shared server procedures/contracts from Sections 03–06. The Web does not
  call Comfy directly, create staged local IDs, or see local paths/secrets.
- Add Web localization keys and tests for Thai/English and all UI states.

### UI/UX contract

Keep defaults visible and advanced workflow/profile selection behind a clearly
labeled “Change workflow/Advanced inputs” disclosure. Show why an alternative
Worker/profile is eligible and the exact resolved workflow version. If none is
eligible, show the actionable cause. The shot card remains a single submit
surface; full job details open the canonical Web job detail.

### TDD before implementation

- Series owner/admin authorization, deleted/archived Series filtering, binding
  revision conflict and image/video default persistence.
- Nine shots select the correct episode/shot and create one canonical job per
  submit with correct frames/duration/workflow version.
- Guided/Automated AI diff/evidence/policy gates and remote transfer consent.
- Missing Worker/profile/capability, budget, Library target, stale binding and
  preflight errors prevent submit and show localized recovery.
- Responsive/accessibility/browser evidence for shot drawer and inline status.

### Exit criteria

An episode user can safely submit both image and video shot jobs with start,
last, and ordered reference frames, see the real queue/result, and never reach
an alternate queue/editor implementation.

## 13. Section 09 — integration, packaging, and release

### Goal

Prove the sections work together, package the runtime safely, and gate rollout
without claiming unperformed provider/production connectivity.

### Files and changes

- Add fake stdio and fake Streamable HTTP MCP fixtures under existing test
  conventions; cover handshake, tools, schemas, async execution, output,
  expiry, cancel, reconnect and malformed responses.
- Add Web/Rust integration fixtures for four job types, revisions, permission
  revocation, lease race, projection parity, migrations, and no duplicate
  artifact publication.
- Update `apps/worker-app/scripts/prepare-runtime-pack.mjs`, runtime manifest,
  release packaging and platform diagnostics only as necessary to include
  pinned MCP compatibility metadata. Do not install arbitrary Python/custom
  nodes and do not make HyperFrames required.
- Add rollout flags from the spec and a controlled local/remote/Cloud smoke
  checklist. Keep real credentials/GPU tests outside CI and label them as
  release evidence.

### TDD/release gates

- `npm --workspace apps/worker-app test`
- `npm --workspace apps/worker-app run typecheck`
- `npm --workspace apps/web test -- <focused-file-or-pattern>` followed by
  `npm --workspace apps/web test`; Vitest does not use the Jest-only
  `--runInBand` flag in this repository.
- `npm --workspace apps/web run typecheck`
- migration checker/dry-run and schema tests;
- existing `mcp:smoke`, `mcp:failure-harness`, and `mcp:readiness` where their
  contract applies;
- controlled local, self-hosted remote, and Cloud smoke tests for each enabled
  flag, including real auth/output expiry/cancel/recovery.

### Exit criteria

All section tests and focused typechecks pass, migration dry-run is safe,
cross-section contracts match, browser evidence exists for UI changes, and
release notes distinguish static/fake proof from real environment proof.

## 14. Cross-cutting security and operational rules

- Keep authorization at the server and profile/secret boundaries; missing
  identity or revision mismatch fails closed.
- Treat MCP-discovered tool/schema/output/path data as untrusted. Allowlist
  tools, validate every field, reject shell/path traversal/SSRF/symlink and
  unsafe output.
- Keep credential/session expiry separate from SmartAIHub Worker pairing
  expiry; report each source independently in the header.
- Use bounded timeouts, backoff/jitter, queue depth, output size/count, disk
  reservation, rate limits, and tenant quotas.
- Add structured redacted correlation logs and audit records for all profile,
  permission, workflow, Series binding, job, lease, artifact, cancel, retry,
  and publication mutations.
- Preserve legacy behavior by adapters and feature flags, not by broad schema
  rewrites or data deletion.

## 15. Implementation review and gap-closure loop

After each section, re-read its section plan against changed files, run focused
tests, and classify gaps as MUST_FIX or NICE_TO_HAVE. Fix every MUST_FIX before
moving on. Before Section 09, perform three cross-section checks for shared
names, routes, revisions, job fields, UI states, and migration order. After all
sections, perform at least five full review rounds:

1. contract/schema and legacy compatibility;
2. transport/security/secret/path boundaries;
3. job lifecycle/lease/recovery/output idempotency;
4. server/Web/Worker projection and UI parity;
5. tests/build/migration/release evidence.

Each round must compare implementation to this plan and `spec.md`, fix any
MUST_FIX immediately, rerun affected tests, and record the result in the
section/review state. Completion means no unresolved MUST_FIX or blocked
section remains; environment-dependent smoke tests are explicitly recorded as
pending rather than falsely marked passed.
