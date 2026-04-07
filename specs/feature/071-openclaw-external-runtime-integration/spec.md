# 071 - OpenClaw External Runtime Integration

Version: 1.0
Date: 2026-04-06
Status: Proposed
Depends-on: 059-external-worker-provider-framework, 004-desktop-app, 043-PublicAPI-ExternalAgentGateway
Supersedes: OpenClaw-specific positioning inside Feature 059 where the documents conflict
Audience: Web Control Plane, Teams, Workflow, Admin, Runtime, QA

---

## 1. Executive summary

Feature 059 established SmartSpecPro's broader worker-runtime direction, but OpenClaw still needs a focused follow-on feature that turns the revised worker-fabric guidance into an implementation-ready plan.

This feature adds **OpenClaw as the first canonical external runtime class** under SmartSpecPro's control plane by introducing:

- a worker registry for `openclaw_gateway`
- runtime profiles and worker policies for external runtimes
- REST worker APIs for register, heartbeat, job claim, policy refresh, progress, and artifact publication
- scheduler rules that route the right typed jobs to OpenClaw
- team-member binding from existing `external_connector` records to registered workers
- admin and fleet visibility for OpenClaw nodes

This feature does **not** change the MVP positioning that:

- SmartSpec Desktop + ZeroClaw remains the primary local Windows file/GPU/media worker path
- OpenClaw is an external general-purpose agent runtime
- NemoClaw and HiClaw remain future runtime families, not part of this implementation slice

---

## 2. Problem statement

SmartSpecPro already hints at external-agent integration in several places:

- teams can include `external_connector` members
- the UI already uses OpenClaw-flavored examples such as `openclaw://main-office`
- Feature 059 names `openclaw_gateway` as a future worker type

However, the current product still lacks the control-plane pieces needed to make OpenClaw real:

- there is no canonical `workers` registry
- there is no heartbeat or job-claim API for external runtimes
- team external connectors are only string references, not bindable runtime identities
- the scheduler cannot yet prefer OpenClaw for browser-, plugin-, or session-oriented jobs
- there is no OpenClaw-specific artifact and audit path under SmartSpecPro ownership

The result is a gap between product language and implementation reality. This feature closes that gap without dragging the entire desktop worker program into the same deliverable.

---

## 3. Goals

1. Register OpenClaw gateways as first-class workers inside SmartSpecPro.
2. Expose a worker/job/artifact model that future runtimes can reuse, while implementing only `openclaw_gateway` in this feature.
3. Let personas, workflows, and team members target OpenClaw through capability intent rather than hard-coded runtime assumptions.
4. Preserve SmartSpecPro ownership of auth, policy, audit, artifact publication, and indexing.
5. Keep current team and orchestration flows backward-compatible during migration from plain string connectors to registered workers.
6. Define a concrete gateway compatibility profile so Claw-family runtimes can reuse SmartSpecPro's central LLM proxy where the current code already supports it.

---

## 4. Non-goals

1. This feature does not ship SmartSpec Desktop or ZeroClaw provisioning work.
2. This feature does not treat OpenClaw as the default path for local Windows files, ffmpeg, GPU rendering, or ComfyUI.
3. This feature does not introduce NemoClaw secure pools or HiClaw clusters.
4. This feature does not require full OpenClaw dashboard, plugin, or channel parity inside SmartSpecPro UI.
5. This feature does not replace sandbox profiles, sandbox jobs, or existing desktop-local runtime paths.

---

## 5. Locked product decisions

### 5.1 Runtime semantics

- `openclaw_gateway` is an **external general-purpose runtime**, suitable for:
  - persistent agent sessions
  - plugin-heavy automation
  - browser and remote-tool flows
  - channel-assistant handoff
  - artifact-producing research or assistant tasks
- `openclaw_gateway` is **not** the preferred runtime for:
  - `video_assembly`
  - GPU-required media jobs
  - Windows-local workspace access
  - UNC-path or mapped-drive tasks

### 5.2 Relationship to Feature 059

- Feature 059 remains the umbrella worker-fabric baseline.
- Feature 071 narrows and updates the OpenClaw slice so implementation can start.
- If Feature 059 says "Desktop + ZeroClaw sidecar" and this feature needs OpenClaw to behave differently, Feature 071 controls OpenClaw behavior only.

### 5.3 Communication defaults

- Worker-to-web communication is outbound-only.
- Initial command model is polling + lease/claim.
- Artifact upload uses signed URLs by default.
- SSE/WebSocket may be added later for progress-heavy sessions, but is not required for v1.

### 5.4 Registration and identity defaults

Each registered OpenClaw worker must provide at least:

- `workerId`
- `tenantId`
- `runtimeType = "openclaw_gateway"`
- `displayName`
- `runtimeVersion`
- `gatewayMode`
- `platform`
- `pluginList`
- `enabledChannels`
- `workspaceRoot`
- `toolPolicyProfile`
- `healthSummary`
- optional admin-visible `dashboardUrl`

### 5.5 Team-member binding model

- `assistant_profiles.externalRef` remains required for `external_connector` members.
- New OpenClaw-aware team binding adds `assistantProfiles.externalWorkerId` as a nullable FK to `workers.id`.
- A team member may remain unresolved:
  - `externalRef` exists
  - `externalWorkerId` is null
- This preserves today's loose external-connector workflow while allowing managed binding when a matching OpenClaw worker exists.

### 5.6 Initial OpenClaw routing scope

OpenClaw v1 should accept only job requests that match one or more of these capability families:

- `persistent-agent-session`
- `plugin-automation`
- `browser-automation`
- `tool-using-research`
- `channel-assistant-handoff`
- `artifact-producing-session`

Jobs that require local Windows file access, GPU render, or strict secure-sandbox semantics must not default to OpenClaw.

### 5.7 Truthful admin visibility

- SmartSpecPro remains the source of truth for worker status, policy, job history, and published artifacts.
- OpenClaw dashboard URLs are convenience links only and must be admin-visible, not end-user default UI.

### 5.8 Rollout and feature-flag defaults

- This feature must add a new tenant feature flag, recommended name: `openClawExternalRuntime`.
- Default value should be `false`.
- Admin surfaces may expose worker records across environments, but worker registration, claim, and team binding flows must remain gated until the tenant flag is enabled.
- Because current `publicApiFeatureGuard` bypasses bearer-authenticated requests, worker routes must enforce this flag explicitly through worker-specific route/service guards rather than relying on `/v1` middleware behavior.

### 5.9 Credit and budget posture

- Worker-dispatched OpenClaw jobs must continue to use SmartSpecPro credit accounting.
- Execution must integrate with `creditService.deductCredits()` semantics, including:
  - idempotency keys
  - tenant budget checks
  - source-type attribution
- Implementation should extend the existing credit source vocabulary with a worker-specific source such as `worker_job`, instead of hiding usage under `other`.

### 5.10 Library and indexing publication contract

- Published outputs must reuse the existing library pipeline instead of inventing a second asset catalog.
- Worker artifact publication should create or link:
  - `library_items`
  - `library_links`
  - library index jobs through `safeEnqueueLibraryIndexJob()`
- Recommended library conventions for worker outputs:
  - `source = "worker_runtime"`
  - `library_links.linkType = "worker_job_artifact"` or `worker_job`
  - `worker_artifacts.publishedItemId` stores the resulting `library_items.id`

### 5.11 Run-state compatibility contract

- Current workflow UI pauses on string reasons that include `external connector`.
- OpenClaw integration must therefore preserve backward-compatible pause semantics while introducing structured machine-readable reasons.
- Recommended contract:
  - persist a structured code such as `awaiting_external_connector`
  - also keep a human-readable reason string containing `external connector` until the UI is upgraded to consume structured codes first

### 5.12 Gateway compatibility defaults

- SmartSpecPro's existing gateway should be treated as the preferred **central LLM proxy profile** for Claw-family runtimes when they need shared model routing, billing, and audit instead of direct provider keys.
- The current compatibility baseline is:
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - `GET /v1/models`
  - `GET /v1/credits`
  - `GET /v1/events`
- `POST /v1/mcp` is useful for tool access, but it must not be marketed as full LLM-gateway parity until the advertised `smartspec.llm.*` MCP tools execute real proxy behavior instead of placeholder responses.
- `POST /v1/embeddings` does not exist today; this must be either implemented or explicitly documented as unsupported for the Claw gateway compatibility profile in this phase.
- Family-level positioning for the current gateway:
  - OpenClaw: HTTP LLM proxy profile is viable now
  - ZeroClaw: HTTP LLM proxy profile is viable when local/runtime policy chooses central routing
  - NemoClaw: HTTP LLM proxy profile is viable for outbound-only secure pools, subject to stricter policy classes later
  - HiClaw: may reuse the HTTP LLM proxy for model access, but still requires separate collaborative-cluster semantics outside this feature

---

## 6. Current-codebase fit

### 6.1 Team and connector baseline

Current files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/team.ts`
- `apps/web/client/src/pages/Teams.tsx`

Fit:

- reuse the existing external-connector concept instead of inventing a new participant type
- extend the schema and UI so connectors can optionally bind to a registered worker

### 6.2 Orchestration baseline

Current file:

- `apps/web/server/services/runEngine.ts`

Fit:

- existing pause semantics for `external_connector` already align with an external runtime handoff model
- OpenClaw binding should integrate here rather than bypass the run engine

### 6.3 Admin/runtime profile baseline

Current files:

- `apps/web/drizzle/schema.ts` sandbox section
- `apps/web/server/routers/sandbox.ts`
- `apps/web/client/src/pages/AdminSandbox.tsx`

Fit:

- mirror the operational pattern of profiles, policies, jobs, and artifacts
- keep OpenClaw worker tables separate from sandbox tables so runtime semantics stay clean

### 6.4 Server integration baseline

Current files:

- `apps/web/server/_core/index.ts`
- `apps/web/server/routes/*`

Fit:

- expose worker registration and execution APIs as REST routes under `/api/workers` and `/api/worker-jobs`
- do not require OpenClaw runtimes to consume tRPC

### 6.5 Public gateway baseline

Current files:

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/publicDocsApi.ts`

Fit:

- the HTTP LLM gateway is already materially usable for external runtimes through `/v1/chat/completions`, `/v1/responses`, and `/v1/models`
- `/v1/responses` already includes tenant-flag checks, SSE, tool-loop handling, and central credit usage
- current `/v1/responses` tenant derivation for non-internal callers still needs normalization so external API-key/bearer tenants are not all treated as `default`
- `/v1/mcp` is only partially suitable as a family-wide LLM gateway today because:
  - `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models` currently return placeholder messages
  - MCP session initialization persists `tenantId`, `userId`, and `apiKeyId` from an auth shape that is currently safest for API-key callers, not clearly normalized for bearer/session callers
- public API docs currently expose `/v1/mcp`, but do not publish the LLM proxy endpoints as a formal compatibility contract for external Claw runtimes

### 6.6 Desktop boundary

Current file:

- `apps/tauri-shell/src-tauri/src/lib.rs`

Fit:

- desktop capability already has its own implementation path
- this feature must stay external-runtime focused and not redefine the desktop shell

---

## 7. Data model changes

### 7.1 New tables

Add the following canonical control-plane tables:

#### `workers`

Minimum fields:

- `id`
- `tenantId`
- `teamId` nullable
- `runtimeType`
- `workerMode`
- `machineId` nullable
- `machineName` nullable
- `displayName`
- `status`
- `runtimeVersion`
- `runtimeMode`
- `runtimeProfileId`
- `policyProfileId`
- `externalReference`
- `dashboardUrl` nullable
- `capabilitiesJson`
- `hardwareJson`
- `healthSummaryJson`
- `warningFlagsJson`
- `fileScopeMode`
- `lastSeenAt`
- `registeredByUserId`
- `createdAt`
- `updatedAt`

#### `worker_heartbeats`

- `id`
- `workerId`
- `runtimeType`
- `status`
- `metricsJson`
- `warningsJson`
- `currentJobCount`
- `queueDepth`
- `freeDiskBytes`
- `createdAt`

#### `worker_jobs`

- `id`
- `tenantId`
- `teamId`
- `workerId`
- `runtimeType`
- `workflowRunId` nullable
- `requestedByUserId` nullable
- `requestedByPersonaId` nullable
- `requestedBySystemComponent` nullable
- `jobType`
- `status`
- `statusReason`
- `priority`
- `resourceProfile`
- `capabilityRequirementsJson`
- `inputJson`
- `instructionsJson`
- `outputJson`
- `failureReason`
- `timeoutSeconds`
- `retryPolicyJson`
- `idempotencyKey`
- `leaseOwnerToken`
- `leaseExpiresAt`
- `createdAt`
- `startedAt`
- `finishedAt`

#### `worker_job_events`

- `id`
- `workerJobId`
- `eventType`
- `payloadJson`
- `createdAt`

#### `worker_artifacts`

- `id`
- `workerJobId`
- `artifactType`
- `storageRef`
- `metadataJson`
- `publishedItemId`
- `createdAt`

#### `worker_policies`

- `id`
- `tenantId`
- `name`
- `runtimeType`
- `rulesJson`
- `createdAt`
- `updatedAt`

#### `runtime_profiles`

- `id`
- `runtimeType`
- `name`
- `profileJson`
- `createdAt`
- `updatedAt`

### 7.2 Schema extension to existing teams

Add to `assistant_profiles`:

- `externalWorkerId` nullable FK to `workers.id` with `onDelete: set null`

Keep existing fields:

- `externalRef`
- `externalConfigJson`

Rationale:

- preserves current team UX and data shape
- allows resolvable worker binding without breaking unresolved/manual external connectors

### 7.3 Recommended enums

- `worker_runtime_type`
  - `openclaw_gateway`
  - `desktop_zeroclaw_managed`
  - `nemoclaw_sandbox`
  - `hiclaw_cluster`
- `worker_status`
  - `online`
  - `offline`
  - `unhealthy`
  - `disabled`
  - `draining`
- `worker_job_status`
  - `queued`
  - `claimed`
  - `preparing`
  - `running`
  - `uploading`
  - `publishing`
  - `indexing`
  - `completed`
  - `failed`
  - `canceled`
  - `expired`

Only `openclaw_gateway` needs to be used in seed/runtime logic for this feature, but the schema should stay forward-compatible.

---

## 8. API surface

Expose plain REST endpoints:

- `POST /api/workers/register`
- `POST /api/workers/:workerId/heartbeat`
- `POST /api/workers/:workerId/jobs/claim`
- `POST /api/worker-jobs/:jobId/events`
- `POST /api/worker-jobs/:jobId/artifacts/init-upload`
- `POST /api/worker-jobs/:jobId/artifacts/complete`
- `GET /api/workers/:workerId/policy`
- `POST /api/workers/:workerId/diagnostics`

### 8.1 Auth model

Use short-lived scoped bearer tokens:

- registration token
- execution token
- upload token

Tokens must be:

- tenant-scoped
- revocable
- rotatable
- auditable

Implementation should align with the existing bearer-token infrastructure in `apps/web/server/_core/tokens.ts` and `apps/web/server/_core/authz.ts`, rather than introducing a separate token parser.

Recommended worker scopes:

- `workers:register`
- `workers:heartbeat`
- `workers:claim`
- `workers:report`
- `workers:diagnostics`

### 8.1.1 Route hosting and middleware

- Worker routes should live under `/api/workers` and `/api/worker-jobs`, not `/v1`.
- Rationale:
  - `/v1` is the public API surface built around API keys, quota middleware, and `publicApiFeatureGuard`
  - bearer-authenticated worker callers already bypass `publicApiFeatureGuard`
- Worker routes should therefore use:
  - bearer auth
  - worker-specific scope checks
  - explicit `openClawExternalRuntime` flag enforcement
  - ordinary `/api` CSRF behavior, which already permits bearer-authenticated server-to-server requests without `Origin`

### 8.2 Claim model

- OpenClaw workers poll for work
- claim uses a lease so the scheduler can recover abandoned jobs
- one job can only be actively leased to one worker at a time

### 8.3 Artifact model

- worker requests signed upload targets
- worker uploads result files directly to object storage
- worker confirms completion with checksums and metadata
- SmartSpecPro creates artifact records and triggers indexing when required
- when a published output should enter the tenant library, the publication path must reuse existing `createLibraryItem()` and `safeEnqueueLibraryIndexJob()` flows

### 8.4 Idempotency and retries

- registration should be idempotent on `(tenantId, externalReference)` or a comparable worker identity key
- artifact completion should be idempotent on `(workerJobId, artifact checksum, artifact path/logical key)`
- retry behavior must distinguish:
  - transient claim/report/upload failures
  - permanent policy/auth failures
- control-plane retries should never double-charge credits or double-publish library items

### 8.5 Gateway compatibility profile for Claw runtimes

When a Claw-family runtime uses SmartSpecPro as its LLM gateway instead of calling providers directly, the compatibility contract for this phase should be:

- chat-style requests: `POST /v1/chat/completions`
- responses-first requests: `POST /v1/responses`
- model discovery: `GET /v1/models`
- credits visibility: `GET /v1/credits`
- event subscription where needed: `GET /v1/events`
- MCP tools: `POST /v1/mcp`, but only for tool groups that are actually implemented

Explicit current limitations that must be captured in docs and rollout messaging:

- no public `POST /v1/embeddings` route yet
- `smartspec.llm.*` MCP tools are not full proxy operations yet
- HiClaw-style collaborative orchestration is out of scope even if the cluster reuses the HTTP LLM proxy

### 8.5.1 MCP auth normalization requirement

If `/v1/mcp` or `/v1/responses` remains part of the advertised Claw gateway profile, gateway identity handling must normalize auth into a tenant-safe and session-safe object for all allowed caller modes:

- API key
- signed bearer token
- approved internal token path

Implementation must not:

- rely on API-key-only fields being present when the route is reachable by other auth modes
- fall back to `tenantId = "default"` for external callers when tenant identity can be derived from auth

---

## 9. Scheduling and job semantics

### 9.1 Scheduling rules

The scheduler should prefer `openclaw_gateway` when:

- the requested capability set matches OpenClaw-supported intents
- the task is remote/tool/session oriented
- the task does not require local desktop file authority
- the team, tenant policy, and worker policy allow the action

The scheduler must reject or reroute OpenClaw when:

- a job requires `gpu-required`
- a job depends on local Windows paths
- a job requires a stronger secure-sandbox class than OpenClaw v1 provides

### 9.2 Initial job shape

Do not introduce an OpenClaw-only top-level workflow model.

Instead, use canonical worker jobs with:

- `jobType`
- `capabilityRequirementsJson`
- `instructionsJson.intent`
- `resourceProfile`

Recommended initial `jobType` values for OpenClaw support:

- `external_agent_task`
- `browser_automation_task`
- `plugin_workflow_task`

### 9.3 Team and workflow routing

- personas and workflows request capabilities, not a specific dashboard brand
- team members may still refer to external connectors conceptually
- when a connector is bound to a registered OpenClaw worker, SmartSpecPro can route and observe work directly

### 9.4 Credit, budget, and charge timing

- OpenClaw job dispatch must reserve or deduct credits through the same central billing path used elsewhere in the platform
- recommended sequence:
  1. validate tenant flag, policy, and worker compatibility
  2. calculate or estimate cost envelope
  3. reserve/deduct credits with idempotency
  4. enqueue the worker job
  5. reconcile final usage on completion/failure
- if dispatch fails before claim, the reservation must be refundable

### 9.5 Artifact publication into existing library systems

When OpenClaw returns publishable outputs:

1. create `worker_artifacts` records
2. upload blobs through SmartSpecPro-issued signed URLs
3. create or reuse `library_items` for durable tenant-visible assets when requested
4. create `library_links` back to worker identity, recommended via `worker_job_artifact`
5. enqueue indexing through `safeEnqueueLibraryIndexJob()` when the artifact should become searchable

This keeps OpenClaw outputs inside the same library/indexing lifecycle already used by media, presentations, and agency artifacts.

---

## 10. UX and admin requirements

### 10.1 Teams page

Extend the current Teams experience so external connectors can:

- keep an `externalRef`
- optionally bind to a registered OpenClaw worker
- display worker status when bound
- show "unresolved" when only the string reference exists

Concrete compatibility requirements:

- `teamRouter` create/update inputs should accept optional `externalWorkerId`
- `teamService` must continue to normalize and deduplicate `externalRef`
- when `externalWorkerId` is present, UI should still display `externalRef` as the human-readable reference
- if a previously bound worker is deleted or revoked, `externalWorkerId` should become null without breaking the team member record

### 10.2 Admin workers page

Add an admin-visible worker/fleet surface that can:

- list workers
- filter by runtime type, status, tenant, team, and policy
- inspect runtime metadata and capability state
- disable, drain, or revoke workers
- view job history and artifact publication state

### 10.3 Runtime profile management

Create a dedicated runtime-profile admin flow inspired by sandbox profiles but separate from them.

Profiles should define:

- runtime type
- capability defaults
- policy defaults
- channel/plugin allowlists where needed
- max concurrency
- artifact visibility defaults

### 10.4 Run monitor and workflow board compatibility

Because the current orchestration UI derives pause state from text reasons:

- the run engine must continue to emit a compatible human-readable pause reason during rollout
- follow-up UI work should add structured reason support so `RoomWorkflowPanel` does not rely only on substring matching
- acceptance for this feature should include one paused external-connector run rendered correctly in the existing workflow board

---

## 11. Security and policy

### 11.1 Policy goals

- SmartSpecPro owns auth, policy, and audit
- OpenClaw workers execute only within explicit tenant and worker policy
- no unrestricted shell or filesystem promises are implied by OpenClaw registration

### 11.2 Required controls

- short-lived tokens
- explicit runtime and worker policy assignment
- audit trail for registration, claim, execution, artifact publication, and disable/revoke events
- admin-only dashboard URLs and diagnostics visibility
- upload destinations limited to SmartSpecPro-issued signed URLs

### 11.2.1 Audit event expansion

Implementation should extend `auditLogger.AuditEventType` with worker-runtime events such as:

- `worker_registered`
- `worker_heartbeat`
- `worker_job_claimed`
- `worker_job_completed`
- `worker_job_failed`
- `worker_artifact_published`
- `worker_token_revoked`

All worker actions should carry a `traceId` so runtime/API/library events can be correlated in admin investigations.

### 11.3 Backward-compatible migration rule

Existing `external_connector` members without a bound worker must continue to function as manual or unresolved collaborators.

This feature must not force all historical connectors to bind immediately.

---

## 12. Acceptance criteria

1. An admin can register at least one OpenClaw runtime as `openclaw_gateway` and see it in a worker registry UI.
2. The worker can send heartbeat updates and appear as `online`, `offline`, or `unhealthy`.
3. A team external connector can optionally bind to a registered OpenClaw worker while preserving `externalRef`.
4. A capability-routed task can be scheduled to a suitable OpenClaw worker, claimed through polling, and reported through job events.
5. OpenClaw-produced artifacts can be uploaded through signed URLs, published into SmartSpecPro records, and linked back to the originating run or workflow.
6. Tasks that require desktop-local file access or GPU render are not silently routed to OpenClaw.
7. Unresolved historical external connectors remain supported and do not break team or run flows.
8. The feature is rollout-gated by `openClawExternalRuntime`, default `false`, and worker routes enforce that gate explicitly for bearer-authenticated callers.
9. At least one published OpenClaw output can become a `library_items` record with a `library_links` back-reference and an indexing job request.
10. Credit usage for an OpenClaw-dispatched job is recorded through the central credit service with idempotency and can be reconciled on failure or completion.
11. A paused team run waiting on an OpenClaw-bound external connector still renders correctly in the current workflow UI.
12. At least one external runtime caller can use `/v1/chat/completions`, `/v1/responses`, and `/v1/models` with the documented auth profile as the Claw-compatible HTTP gateway contract.
13. `/v1/mcp` either hides unimplemented `smartspec.llm.*` tools from discovery or executes them as real gateway proxy operations; placeholder discovery is not acceptable for claimed LLM parity.
14. Gateway docs explicitly state whether embeddings are unsupported in this phase or expose a real public embeddings route.
15. Claw-compatible gateway routes derive tenant identity from auth for API-key/bearer callers instead of collapsing external traffic into the `default` tenant.

---

## 13. Rollout plan

### Phase 1

- schema and shared contract foundation
- worker registration and heartbeat
- admin worker listing

### Phase 2

- job claim, job events, artifact upload bootstrap
- scheduler routing for OpenClaw-supported task classes

### Phase 3

- team binding and workflow/persona integration
- richer observability and diagnostics

Deferred:

- NemoClaw pool support
- HiClaw cluster support
- Desktop + ZeroClaw provisioning work
- OpenClaw-native channel/plugin lifecycle UI inside SmartSpecPro

---

## 14. Open questions

1. Should `externalRef` be auto-generated from `workers.externalReference` when binding, or should the user remain free to keep a different human label?
2. Should worker assignment to a team be optional global tenancy visibility, or should OpenClaw workers always be team-scoped?
3. How much of OpenClaw plugin/channel metadata should be queryable in user-facing team flows versus admin-only views?

These questions do not block implementation of the foundational control-plane feature.
