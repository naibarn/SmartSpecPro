# Implementation Plan TDD

## Test-first strategy

Lock the contracts in the order they will be trusted by other workstreams:

1. schema and shared flags
2. worker routes and gateway routes
3. scheduler/billing/publication
4. team/admin/workflow integration
5. rollout, docs, and regression truthfulness

## 1. Schema and shared-contract tests first

Add or update tests that prove:

- worker-runtime enums include `openclaw_gateway`
- new worker tables expose expected columns, indexes, and enum values
- `assistant_profiles` accepts nullable `externalWorkerId`
- legacy `external_connector` rows without `externalWorkerId` still validate
- `TenantFeatureFlags` accepts `openClawExternalRuntime`
- `ALLOWED_FEATURE_FLAGS` includes `openClawExternalRuntime`
- `FEATURE_FLAG_DEFAULTS.openClawExternalRuntime === false`
- if Redis-synced route guards are chosen, the flag is also wired into `REDIS_SYNCED_FLAGS`

Expected initial failing condition:

- schema/config tests fail because worker tables, new flag wiring, and team-binding columns do not exist yet

## 2. Worker control-plane route and service tests

Add tests for:

- worker registration auth and validation
- heartbeat updates changing worker status and `lastSeenAt`
- job claim lease semantics and exclusivity
- policy refresh scoped to worker and tenant
- artifact upload-init and completion flows
- diagnostics visibility and authorization
- bearer-authenticated worker routes still fail closed when `openClawExternalRuntime` is disabled
- idempotent registration and artifact completion behavior

Expected initial failing condition:

- route handlers and services are missing

## 3. HTTP gateway contract tests

Add or extend tests for:

- `/v1/chat/completions` remains usable for documented external runtime auth modes
- `/v1/responses` remains usable for documented external runtime auth modes
- `/v1/models` remains usable for documented external runtime auth modes
- `/v1/credits` behavior stays consistent with the published contract
- public docs explicitly expose the supported HTTP gateway contract
- docs do not imply embeddings support unless a real route exists

Expected initial failing condition:

- public docs and compatibility descriptions do not yet match the intended Claw-family contract

## 4. MCP parity and auth-normalization tests

Add tests for:

- `tools/list` does not advertise placeholder `smartspec.llm.*` operations as supported parity unless they are truly implemented
- if `smartspec.llm.chat` is implemented, it returns real proxy output instead of a static message
- if `smartspec.llm.embed` is implemented, it returns real embedding output or remains hidden
- if `/v1/mcp` allows bearer/internal-token callers, session initialization stores normalized tenant/user identity instead of API-key-only fields
- MCP session authorization does not gain accidental power through `requireScopes()` bearer/session bypass

Expected initial failing condition:

- current MCP tool registry/handlers are partially truthy but not fully implemented for LLM proxy semantics

## 5. Tenant-identity and feature-gate tests

Add tests for:

- `/v1/responses` derives tenant context from API-key auth
- `/v1/responses` derives tenant context from bearer auth where tenant is available
- `/v1/responses` still allows explicit internal-service tenant override via `x-tenant-id` where appropriate
- worker-route feature gating is independent from `/v1` `publicApiFeatureGuard`
- gateway routes do not collapse external callers into `tenantId = "default"` when auth can supply a real tenant

Expected initial failing condition:

- current `/v1/responses` tenant derivation still falls back to `default` for external callers

## 6. Scheduler, billing, and artifact-publication tests

Add tests for:

- scheduler acceptance of supported OpenClaw capability families
- scheduler rejection or rerouting of GPU/local-file/secure-sandbox-only jobs
- billing reservation and reconciliation for worker jobs
- retries do not double-charge credits
- artifact publication records checksum and metadata correctly
- published worker outputs create `library_items` and `library_links` through canonical services
- indexing is triggered through the existing library path when requested

Expected initial failing condition:

- worker scheduler, billing wrapper, and artifact publication services are not wired yet

## 7. Team, UI, and workflow tests

Add tests for:

- binding an external connector to a registered worker
- preserving `externalRef` during binding/unbinding
- unresolved connectors still behaving as valid team members
- duplicate binding/reference edge cases
- Teams page showing unresolved vs bound worker states
- admin worker list rendering status, runtime metadata, and controls
- paused runs still surface a workflow-board-compatible external-wait reason

Expected initial failing condition:

- team service/router currently knows only free-form `externalRef`

## 8. Rollout, docs, and regression checks

- historical team creation/edit flows still work with plain external connectors
- sandbox admin/profile screens remain unaffected
- unsupported job types do not route to OpenClaw
- gateway docs and discovery accurately describe supported versus deferred Claw gateway surfaces
- MCP discovery and public docs stay truthful when parity changes
- unresolved legacy connectors remain operable during rollout

## Fixtures and setup

- worker registration payload fixtures for `openclaw_gateway`
- legacy external connector fixtures without `externalWorkerId`
- scheduler fixtures for supported vs rejected capability combinations
- bearer token fixtures with worker scopes and tenant claims
- API-key fixtures for tenant-aware gateway calls
- library publication fixtures for `worker_job_artifact` link types
- MCP session fixtures for API-key, bearer, and internal-token caller modes

## Suggested test commands

- `npm --prefix apps/web test`
- targeted tests for:
  - worker routes/services
  - `llmRoutes`
  - `responsesRoutes`
  - `mcpPublicServer`
  - `publicDocsApi`
  - Teams/admin UI flows
