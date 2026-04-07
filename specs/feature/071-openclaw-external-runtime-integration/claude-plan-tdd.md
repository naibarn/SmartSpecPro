# Deep TDD Plan

## Purpose

This document mirrors `claude-plan.md` and defines what to test before implementation in each delivery section.

Primary test command:

- `npm --prefix apps/web test`

## Section 1. Contracts and schema foundation

Test stubs:

- Test: worker runtime enums include `openclaw_gateway`
- Test: worker tables expose expected columns and indexes
- Test: `assistant_profiles.externalWorkerId` is nullable and does not invalidate legacy rows
- Test: `TenantFeatureFlags` includes `openClawExternalRuntime`
- Test: `FEATURE_FLAG_DEFAULTS.openClawExternalRuntime` is `false`
- Test: `ALLOWED_FEATURE_FLAGS` includes `openClawExternalRuntime`
- Test: Redis-synced flag wiring is present if worker route guards depend on it
- Test: worker shared contracts include protocol/version compatibility metadata

Expected failing condition:

- worker schema and flag wiring do not exist yet

## Section 2. Worker REST control plane

Test stubs:

- Test: worker registration rejects missing or invalid auth
- Test: worker registration accepts only enrollment/bootstrap credentials, not generic interactive bearer tokens
- Test: post-registration worker tokens must include valid `aud`, `tenantId`, `workerId`, and `runtimeType` claims
- Test: worker registration is idempotent for the same runtime identity
- Test: incompatible worker protocol versions are rejected with a deterministic compatibility error
- Test: heartbeat updates status and `lastSeenAt`
- Test: claim enforces lease exclusivity
- Test: worker event and artifact completion routes reject replayed or out-of-order mutations
- Test: illegal job-state transitions are rejected without mutating canonical records
- Test: policy fetch is worker- and tenant-scoped
- Test: artifact init and completion are idempotent and scoped correctly
- Test: diagnostics are limited to authorized callers
- Test: worker routes fail closed when `openClawExternalRuntime` is disabled

Expected failing condition:

- worker routes and services are not implemented

## Section 3. HTTP gateway compatibility and docs

Test stubs:

- Test: `/v1/chat/completions` remains available for documented external runtime auth modes
- Test: `/v1/responses` remains available for documented external runtime auth modes
- Test: `/v1/models` remains available for documented external runtime auth modes
- Test: `/v1/credits` matches the published contract
- Test: public docs expose the HTTP gateway contract explicitly
- Test: public docs do not imply embeddings support when no public route exists

Expected failing condition:

- docs and runtime contract are not yet aligned

## Section 4. MCP LLM parity and auth normalization

Test stubs:

- Test: `tools/list` does not advertise placeholder `smartspec.llm.*` tools as supported parity unless they are real
- Test: `smartspec.llm.chat` returns real proxy output if implemented
- Test: `smartspec.llm.embed` returns real output if implemented, otherwise is hidden
- Test: MCP session initialization stores normalized tenant/user identity for every supported auth mode
- Test: MCP scope handling does not accidentally expand access through bearer/session bypass

Expected failing condition:

- current MCP LLM parity is placeholder-based

## Section 5. Scheduler, billing, and artifact publication

Test stubs:

- Test: scheduler accepts supported OpenClaw capability families
- Test: scheduler rejects GPU/local-file/secure-sandbox-only job classes for OpenClaw
- Test: worker-job billing reserves or charges idempotently
- Test: retries do not double-charge credits
- Test: worker artifact publication writes canonical records and metadata
- Test: artifact publication rejects checksum, size, or content-type mismatches
- Test: unsafe artifact types stay download-only unless explicitly sanitized or supported
- Test: published worker outputs create `library_items` and `library_links`
- Test: searchable artifacts enqueue indexing via the existing library path

Expected failing condition:

- worker scheduler, billing wrapper, and artifact publication flow do not exist yet

## Section 6. Team, admin, and workflow integration

Test stubs:

- Test: team service binds and unbinds a connector to a registered worker while preserving `externalRef`
- Test: unresolved connectors remain valid
- Test: duplicate binding/reference edge cases are rejected or normalized correctly
- Test: Teams UI shows unresolved vs bound worker state
- Test: admin worker list renders status and runtime metadata
- Test: workflow board still renders the external-wait pause state for OpenClaw-bound runs

Expected failing condition:

- worker binding and admin worker UI do not exist yet

## Section 7. Security, observability, and fleet operations

Test stubs:

- Test: worker tokens respect expiry and revocation
- Test: worker routes reject generic bearer tokens that are not worker-bound
- Test: diagnostics and dashboard links are admin-only
- Test: tenant admin and platform admin role boundaries are enforced for diagnostics, revoke, and cross-tenant fleet actions
- Test: diagnostics and worker-log persistence redact secrets, credentials, and signed URLs
- Test: worker lifecycle audit events are emitted
- Test: `traceId` is carried through worker/job/library events
- Test: fleet state projections distinguish healthy, stale, and failed workers
- Test: disable/drain/revoke actions change observable worker behavior
- Test: registration, claim, heartbeat, and diagnostics endpoints enforce route-specific rate limits
- Test: worker-provided dashboard or health URLs are never server-fetched unless explicitly allowlisted
- Test: heartbeat/diagnostics/event retention jobs remove expired operational data on schedule

Expected failing condition:

- worker lifecycle observability and control-plane security events are not modeled yet

## Section 8. Rollout, migration, and regression matrix

Test stubs:

- Test: rollout gating keeps worker features disabled by default
- Test: unresolved legacy connectors remain operable through rollout
- Test: `/v1/responses` does not collapse external callers into `tenantId = "default"` when auth supplies real tenant context
- Test: MCP discovery stays truthful as parity changes
- Test: docs and discovery remain aligned with actual supported gateway routes
- Test: production kill switch can disable worker dispatch without removing existing fleet visibility

Expected failing condition:

- current rollout protections are incomplete and gateway truthfulness is not fully locked
