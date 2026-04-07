# Deep Implementation Plan

## Goal

Implement Feature 071 as the first production-grade external runtime fabric slice for SmartSpecPro by combining:

- a real worker control plane for `openclaw_gateway`
- a truthful gateway compatibility contract for Claw-family runtimes
- rollout, migration, billing, publication, and observability paths that fit the existing codebase

## Why this plan exists

The repository is already beyond the stage of pure greenfield architecture. SmartSpecPro has real gateway code, real feature-flag behavior, real team/workflow seams, and real library/billing services. The planning challenge is therefore to **integrate with what exists** and to **stop over-claiming what does not yet exist**.

This plan is written to make implementation possible without re-opening the main product decisions.

## System outcome

At the end of this feature:

- SmartSpecPro can register and manage OpenClaw workers as first-class external runtimes
- teams and workflows can route appropriate work to those workers
- worker outputs flow back into SmartSpecPro-owned records and the library/indexing system
- the existing gateway is presented as an HTTP-first compatibility surface for Claw-family runtimes
- MCP parity is either real or explicitly deferred in a truthful way

## Architecture shape

The implementation should be split into eight delivery sections. Each section corresponds to a focused implementation slice and matches the section files already defined in `sections/`.

### Section 1. Contracts and schema foundation

Create the canonical worker-runtime schema:

- `workers`
- `worker_heartbeats`
- `worker_jobs`
- `worker_job_events`
- `worker_artifacts`
- `worker_policies`
- `runtime_profiles`

Extend `assistant_profiles` with nullable `externalWorkerId`.

Introduce shared worker contracts and add `openClawExternalRuntime` to the tenant feature-flag vocabulary.

Shared contracts should also include a protocol/version-compatibility field so worker registration and heartbeat can fail early when a runtime is too old or too new for the server contract.

This section must also decide whether worker-route guards require Redis-synced flag writes or whether DB-backed tenant resolution is sufficient.

### Section 2. Worker REST control plane

Implement the outbound worker loop under `/api/workers` and `/api/worker-jobs`.

Required operations:

- registration
- heartbeat
- policy fetch
- job claim with leases
- job-event reporting
- artifact upload bootstrap
- artifact completion
- diagnostics

This section must reuse the existing bearer-token stack rather than inventing a runtime-specific auth mechanism. It must also enforce `openClawExternalRuntime` explicitly, because current `/v1` middleware behavior does not protect bearer-authenticated worker routes.

This section must define a dedicated worker-auth profile on top of the existing bearer infrastructure:

- registration uses an enrollment/bootstrap credential
- post-registration worker tokens carry `workerId`, `tenantId`, `runtimeType`, `aud`, `jti`, and `exp`
- worker routes validate worker-bound claims directly instead of relying on generic `requireScopes()` bypass behavior
- mutating routes use idempotency keys or monotonic event sequencing so replayed `events` and `artifacts/complete` calls cannot corrupt state
- job state transitions reject stale leases and illegal orderings

### Section 3. HTTP gateway compatibility and docs

Treat the existing HTTP gateway as a first-class deliverable.

The published compatibility contract for this feature should center on:

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `GET /v1/models`
- `GET /v1/credits`
- `GET /v1/events` when the runtime needs public event consumption

This section is responsible for making the public docs truthful. If embeddings are not implemented publicly, the docs must say so. The system must not imply that MCP is the primary compatibility path when the current HTTP surface is already stronger.

### Section 4. MCP LLM parity and auth normalization

Resolve the biggest truthfulness gap in the current gateway:

- `smartspec.llm.chat`
- `smartspec.llm.embed`
- `smartspec.llm.models`

These currently exist as placeholder ideas, not real parity. This section must choose one of two paths:

1. Implement them as real proxy-backed MCP operations
2. Remove or hide them from discovery until later

The same section must normalize MCP session identity so the route is safe for the auth modes SmartSpecPro intends to support. Session state must not assume API-key-only identity fields if bearer or internal-token callers are accepted.

### Section 5. Scheduler, billing, and artifact publication

Add runtime-aware scheduling and worker billing/publication behavior.

OpenClaw must be eligible only for supported capability families such as:

- persistent agent session work
- plugin-heavy automation
- browser automation
- tool-using research
- channel-assistant handoff
- artifact-producing session work

OpenClaw must be rejected or rerouted for:

- GPU-required jobs
- Windows-local file authority jobs
- secure-sandbox-only jobs

Worker-billing behavior must use central credit logic with reservation/reconciliation and retry safety. Worker outputs must be published through the existing library pipeline, not through a parallel artifact catalog.

Worker artifacts must be treated as untrusted until SmartSpecPro validates:

- expected bucket/prefix ownership
- checksum and size
- content type and extension
- publication eligibility for inline serving versus download-only handling

### Section 6. Team, admin, and workflow integration

Bridge current `external_connector` behavior to registered workers without breaking loose coupling.

Key requirements:

- keep `externalRef`
- add optional worker binding
- show unresolved vs bound state in Teams UI
- add admin worker visibility and lifecycle controls
- connect workflow dispatch to the worker scheduler when a worker-bound connector is involved
- preserve current pause-reason compatibility for the workflow board

### Section 7. Security, observability, and fleet operations

Make SmartSpecPro the operational source of truth for worker status and outcomes.

This section should add:

- worker lifecycle audit events
- `traceId` propagation across worker, gateway, and library flows
- health and stale-heartbeat visibility
- diagnostics visibility rules
- disable, drain, and revoke controls
- route-specific rate limits for registration, heartbeat, claim, and diagnostics
- payload caps and redaction rules for worker logs and diagnostics
- retention and cleanup rules for heartbeats, diagnostics, event logs, and failed upload state
- SSRF-safe handling of worker-provided dashboard or health URLs
- explicit role boundaries for tenant admin versus platform admin fleet actions

OpenClaw dashboards remain convenience surfaces only; they are not the system of record.

### Section 8. Rollout, migration, and regression matrix

The feature must ship behind `openClawExternalRuntime`, default `false`.

This section owns:

- staged rollout order
- preservation of unresolved legacy connectors
- doc/discovery truthfulness checks
- regression guards for tenant identity, MCP parity, and gateway claims

It should treat truthfulness regressions as release blockers.

## Implementation order

Recommended order:

1. Section 1: schema, shared contracts, rollout flag
2. Section 2: worker control-plane APIs
3. Section 3: HTTP gateway docs/contract
4. Section 4: MCP truthfulness and identity normalization
5. Section 5: scheduler, billing, artifact publication
6. Section 6: team/admin/workflow integration
7. Section 7: observability and fleet operations
8. Section 8: rollout matrix and regression hardening

This order keeps the worker foundation ahead of UI, and the gateway truthfulness work ahead of broad enablement.

## Key implementation decisions

### OpenClaw remains an external runtime class, not a desktop runtime

This feature must not blur SmartSpecPro's runtime taxonomy. Desktop + ZeroClaw remains the preferred local file/GPU/media path. OpenClaw is the external general-purpose runtime.

### HTTP gateway is the primary gateway contract in this phase

The current repository already has strong HTTP routes. The plan should therefore ship an HTTP-first contract and treat MCP parity as secondary and explicitly governed.

### Tenant identity must be explicit

`tenantId = "default"` is acceptable only as a controlled internal fallback, not as the external multi-tenant model for Claw runtimes.

### Publication and billing stay server-authoritative

Worker runtimes may execute, upload, and report, but SmartSpecPro remains authoritative for:

- credits
- job state
- library publication
- indexing
- audit

## Risks and how to address them

### Risk: runtime claims drift ahead of implementation

Mitigation:

- treat docs and discovery as part of the deliverable
- either implement or hide placeholder MCP LLM parity
- lock the public contract with tests

### Risk: worker rollout breaks existing teams

Mitigation:

- preserve `externalRef`
- support unresolved connectors indefinitely during rollout
- make worker binding optional

### Risk: gateway support becomes tenant-unsafe

Mitigation:

- normalize tenant resolution from auth
- test API-key and bearer paths separately
- keep explicit `x-tenant-id` only where truly necessary for internal service accounts

### Risk: worker tokens are replayed or over-broadened

Mitigation:

- issue worker-bound JWTs with explicit audience and tenant/worker claims
- require revocation-aware `jti` handling
- reject generic bearer tokens that lack worker identity claims on worker routes
- enforce idempotency or event-sequence checks on mutating endpoints

### Risk: diagnostics and logs leak secrets or presigned URLs

Mitigation:

- redact sensitive headers, tokens, provider keys, cookies, and signed URLs before persistence
- cap log and diagnostics payload size
- store raw worker diagnostics only ephemerally when absolutely necessary

### Risk: worker metadata introduces SSRF or unsafe artifact serving

Mitigation:

- treat worker-provided URLs as untrusted metadata unless explicitly allowlisted for server-side access
- validate uploaded artifact checksum, size, and content type before publication
- keep unsafe formats download-only unless a sanitizer or safe viewer path exists

### Risk: OpenClaw absorbs jobs it should not run

Mitigation:

- enforce capability-based scheduler rules
- reject GPU/local-file/sandbox-only job classes at scheduling time

## Deliverables

The implementation is complete when:

- worker control-plane APIs exist and are gated
- worker auth, replay protection, and illegal state-transition handling are explicit and tested
- scheduler and billing/publication behavior exist
- teams and admin flows can use worker binding safely
- the HTTP gateway contract is documented and tested
- MCP no longer overstates LLM parity
- tenant identity is explicit and safe for external gateway callers

## Relationship to the existing planning package

This plan intentionally builds on the already-created Feature 071 package:

- `spec.md` remains the product-facing feature spec
- `implementation-plan.md` and `implementation-plan-tdd.md` remain concise execution docs
- this `claude-plan.md` is the deep-plan, self-contained blueprint for follow-up implementation
