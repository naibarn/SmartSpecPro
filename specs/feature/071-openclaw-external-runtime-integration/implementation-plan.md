# Implementation Plan

## Objective

Deliver a complete implementation roadmap for Feature 071 so SmartSpecPro can:

- register and manage `openclaw_gateway` workers as first-class external runtimes
- route the right jobs to those workers without breaking Desktop + ZeroClaw or legacy `external_connector` flows
- publish worker outputs back into SmartSpecPro-owned library/indexing systems
- truthfully position the existing gateway as a Claw-family-compatible HTTP LLM proxy
- close the remaining gaps in MCP parity, tenant identity normalization, docs, rollout, and regression coverage

## Current-codebase fit

Primary integration points:

- worker/runtime foundation
  - `apps/web/drizzle/schema.ts`
  - `apps/web/shared/featureFlags.ts`
  - `apps/web/server/services/tenantFeatureFlagService.ts`
- worker and route hosting
  - `apps/web/server/_core/index.ts`
  - `apps/web/server/_core/tokens.ts`
  - `apps/web/server/routes/*`
- existing gateway surfaces
  - `apps/web/server/_core/llmRoutes.ts`
  - `apps/web/server/_core/responsesRoutes.ts`
  - `apps/web/server/_core/mcpPublicServer.ts`
  - `apps/web/server/_core/authz.ts`
  - `apps/web/server/middleware/requireScopes.ts`
  - `apps/web/server/routes/publicDocsApi.ts`
- product integration points
  - `apps/web/server/services/teamService.ts`
  - `apps/web/server/routers/team.ts`
  - `apps/web/server/services/runEngine.ts`
  - `apps/web/client/src/pages/Teams.tsx`
  - `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- billing, artifacts, and audit
  - `apps/web/server/services/creditService.ts`
  - `apps/web/server/services/libraryService.ts`
  - `apps/web/server/services/auditLogger.ts`
- test baselines to extend
  - `apps/web/server/_core/llmRoutes.test.ts`
  - `apps/web/server/__tests__/responsesRoutes.test.ts`
  - `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
  - `apps/web/server/routes/__tests__/publicDocsApi.test.ts`
  - feature-flag tests in `apps/web/shared/__tests__/*`

## Recommended implementation order

### 1. Contracts, schema, and rollout flags

- add worker-runtime enums and canonical tables in Drizzle:
  - `workers`
  - `worker_heartbeats`
  - `worker_jobs`
  - `worker_job_events`
  - `worker_artifacts`
  - `worker_policies`
  - `runtime_profiles`
- add `assistantProfiles.externalWorkerId`
- add shared worker contracts in `apps/web/shared/workerRuntime.ts`
- include worker protocol/version compatibility fields in shared contracts and registration payloads
- add tenant feature-flag support for `openClawExternalRuntime`
- decide and document the route-guard source of truth:
  - DB-backed tenant reads only
  - or DB + Redis sync if worker route guards need the same fast-path semantics as existing gateway flags

### 2. Worker control-plane REST API

- add Express routes under `/api/workers` and `/api/worker-jobs`
- implement:
  - register
  - heartbeat
  - policy fetch
  - job claim
  - job event reporting
  - artifact upload init
  - artifact completion
  - diagnostics
- reuse existing bearer-token infrastructure instead of inventing a second auth stack
- define a dedicated worker auth profile over that stack:
  - enrollment/bootstrap credential for initial registration
  - worker-bound JWTs with `aud`, `tenantId`, `workerId`, `runtimeType`, `jti`, and `exp`
  - explicit denial of generic bearer/session auth on worker routes unless a route is intentionally admin-facing
- add worker-specific scope checks and explicit `openClawExternalRuntime` enforcement for bearer-authenticated callers
- make idempotency and lease behavior concrete at the service layer, not just in route handlers
- require replay protection for mutating worker endpoints:
  - idempotency keys and/or monotonic event sequence numbers
  - optimistic state-transition guards for claim/start/upload/complete paths

### 3. HTTP gateway compatibility profile

- formalize the supported Claw-compatible HTTP gateway contract around:
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - `GET /v1/models`
  - `GET /v1/credits`
  - `GET /v1/events` where appropriate
- update public docs and discovery surfaces so the supported contract is explicit
- keep the contract truthful:
  - if embeddings are unsupported, say so explicitly
  - do not imply MCP parity where it does not exist

### 4. MCP LLM parity and auth normalization

- choose one path for `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models`:
  - implement them as real gateway proxies
  - or remove/hide them from MCP discovery until later
- normalize `McpSession` identity so initialization can safely support the chosen auth modes:
  - API key
  - signed bearer token
  - approved internal-token path
- revisit `requireScopes()` and MCP route assumptions so implicit bearer/session bypass does not create accidental trust expansion

### 5. Tenant-safe gateway identity and flag handling

- remove `tenantId = "default"` as the long-term path for external API-key/bearer callers on `/v1/responses`
- derive tenant identity from auth context wherever possible
- ensure feature-gated gateway routes use the same tenant semantics as the rest of the control plane
- add a small compatibility note for internal service-account callers that still need explicit `x-tenant-id`

### 6. Scheduler, billing, and artifact publication

- implement worker registry and scheduler services
- restrict OpenClaw routing to supported capability families
- reject or reroute:
  - GPU-required tasks
  - local Windows file tasks
  - secure-sandbox-only tasks
- introduce billing reservation/reconciliation rules for worker jobs
- add a worker-specific credit source such as `worker_job`
- publish worker outputs through canonical library services, checksums, and indexing flows
- validate worker artifacts before publication:
  - expected storage prefix
  - checksum and file size
  - content type / extension
  - safe serving policy for inline-previewable versus download-only files

### 7. Team, admin, and workflow integration

- extend team service/router/UI so `external_connector` members can bind to workers
- preserve `externalRef` even when `externalWorkerId` is present
- add admin fleet visibility and lifecycle controls:
  - status
  - policy
  - runtime metadata
  - diagnostics
  - disable/drain/revoke
- connect run/workflow dispatch to the scheduler for bound workers
- preserve current pause-reason compatibility in `RoomWorkflowPanel`

### 8. Security, observability, and fleet operations

- extend audit event types for worker lifecycle and artifact publication
- propagate `traceId` across worker/job/library paths
- define diagnostics visibility as admin-only
- define tenant-admin versus platform-admin authority for diagnostics, revoke, disable/drain, and cross-tenant fleet inspection
- define server-side redaction rules for worker diagnostics, logs, headers, tokens, provider keys, and signed URLs before persistence
- add route-specific rate limits for registration, heartbeat, claim, events, and diagnostics
- define SSRF-safe handling for worker-provided dashboard and health URLs:
  - opaque storage/display by default
  - explicit allowlist if any future server-side health fetch is introduced
- define retention and cleanup for:
  - heartbeat snapshots
  - diagnostics blobs
  - worker event logs
  - abandoned upload-init state
- add operational views for:
  - online/offline/unhealthy
  - stale heartbeats
  - job failure reasons
  - artifact publication state
  - version drift
- make SmartSpecPro, not the OpenClaw dashboard, the operational source of truth

### 9. Rollout, migration, and regression hardening

- ship `openClawExternalRuntime` defaulted to `false`
- expose admin visibility behind flags before enabling job dispatch
- preserve unresolved legacy external connectors throughout rollout
- update docs only when runtime behavior and tests match
- add regression gates so placeholder MCP parity or default-tenant fallback cannot silently reappear

## Recommended file and module additions

- worker/runtime modules
  - `apps/web/server/routes/workerRuntime.ts`
  - `apps/web/server/services/workerRegistryService.ts`
  - `apps/web/server/services/workerSchedulerService.ts`
  - `apps/web/server/services/workerPolicyService.ts`
  - `apps/web/server/services/workerArtifactService.ts`
  - `apps/web/server/services/workerBillingService.ts` or equivalent wrapper over `creditService.ts`
  - `apps/web/shared/workerRuntime.ts`
- admin/UI modules
  - `apps/web/client/src/pages/AdminWorkers.tsx` or equivalent admin surface
- optional gateway support helpers
  - `apps/web/server/services/gatewayTenantResolver.ts` or equivalent shared tenant-identity helper
  - `apps/web/server/services/mcpSessionIdentity.ts` or equivalent normalization helper

## Risks and mitigations

### Risk: external connectors already exist as free-form strings

Mitigation:

- keep `externalRef`
- add nullable worker binding
- treat unresolved connectors as valid legacy/manual state

### Risk: OpenClaw gets misused as a desktop worker

Mitigation:

- enforce capability-based scheduler rules
- reject GPU/local-file job classes from OpenClaw routing
- surface runtime-type warnings in admin UX and logs

### Risk: worker-runtime rollout diverges from gateway rollout

Mitigation:

- keep worker routes and gateway compatibility as separate workstreams with their own acceptance criteria
- do not block worker control-plane delivery on full MCP parity

### Risk: the gateway claims broader Claw-family support than the code really provides

Mitigation:

- publish an HTTP-first compatibility profile
- either implement or hide placeholder `smartspec.llm.*` MCP tools
- document embeddings support explicitly instead of implying it
- add docs and discovery tests that lock the advertised contract

### Risk: tenant identity is lost on external gateway calls

Mitigation:

- normalize tenant resolution for `/v1/responses` and any related gateway route before broad rollout
- test API-key and bearer callers independently
- keep explicit `x-tenant-id` only for internal service-account paths where necessary

### Risk: artifacts and audit become split-brained between SmartSpecPro and OpenClaw

Mitigation:

- SmartSpecPro remains authoritative for job records, artifact publish, and indexing state
- OpenClaw returns metadata; SmartSpecPro persists publication records and audit events

### Risk: existing workflow UI stops recognizing paused external-connector runs

Mitigation:

- preserve compatible human-readable pause reasons during rollout
- add structured reason codes in parallel
- cover `RoomWorkflowPanel` behavior with regression tests

## Security and boundary concerns

- worker APIs must use short-lived scoped tokens
- worker tokens must be audience-bound and tenant/worker-bound
- dashboard links and diagnostics must be admin-only
- artifact uploads must use signed URLs
- artifact publication must validate checksum, size, and safe-serving policy before becoming user-visible
- policy retrieval must be tenant- and worker-scoped
- no implicit desktop/local filesystem trust is granted by OpenClaw registration
- credit charging and refunds remain server-authoritative
- MCP session state must not assume API-key-shaped identities when bearer or internal-token callers are allowed
- logs and diagnostics must be redacted before persistence
- worker routes should have dedicated rate limits, not only shared public API throttles
- worker-provided URLs must not become implicit server-side fetch targets

## Acceptance criteria

- matches the acceptance criteria in `spec.md`
- gateway docs, discovery, and tests remain aligned with actual runtime behavior

## Rollout and testing notes

- deliver schema and worker APIs before team binding
- deliver HTTP gateway docs only after tests confirm the real contract
- keep MCP LLM parity behind a truthfulness rule: implemented or hidden
- validate unresolved legacy connectors before enabling auto-binding or worker-required flows
