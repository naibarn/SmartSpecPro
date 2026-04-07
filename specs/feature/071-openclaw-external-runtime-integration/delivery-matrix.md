# Delivery Matrix

## Purpose

This matrix turns the Feature 071 planning package into an execution checklist that implementers can scan quickly.

## Workstream matrix

| Workstream | Primary outputs | Main code areas | Key blocker to resolve first |
|---|---|---|---|
| Contracts and schema | worker tables, enums, shared types, feature flag wiring | `drizzle/schema.ts`, `shared/featureFlags.ts`, `shared/workerRuntime.ts` | no canonical worker model exists yet |
| Worker control plane | register/heartbeat/claim/events/artifacts/policy/diagnostics APIs | `/api/workers`, `/api/worker-jobs`, bearer-token services | bearer worker routes need explicit rollout gating |
| HTTP gateway profile | truthful external-runtime contract for `/v1/chat/completions`, `/v1/responses`, `/v1/models`, `/v1/credits` | `llmRoutes.ts`, `responsesRoutes.ts`, `publicDocsApi.ts` | public docs do not yet publish the real HTTP contract |
| MCP parity | either real `smartspec.llm.*` handlers or hidden discovery | `mcpPublicServer.ts`, `requireScopes.ts` | placeholder LLM MCP tools currently overstate support |
| Tenant normalization | tenant-safe auth path for external gateway callers | `responsesRoutes.ts`, auth helpers, feature-flag services | `/v1/responses` still falls back to `tenantId = "default"` |
| Scheduler and billing | capability-aware routing plus retry-safe charging | `workerSchedulerService.ts`, `creditService.ts`, billing wrapper | no worker scheduler or worker credit source exists yet |
| Artifact publication | canonical publication into library/indexing | `workerArtifactService.ts`, `libraryService.ts` | no worker artifact pipeline exists yet |
| Team/admin/workflow | worker binding, admin fleet UI, paused-run compatibility | `teamService.ts`, `team.ts`, `Teams.tsx`, `runEngine.ts`, `RoomWorkflowPanel.tsx` | teams only know free-form `externalRef` today |
| Security/observability | audit, trace correlation, drain/revoke, health views | `auditLogger.ts`, worker/admin queries, metrics projections | worker lifecycle events are not modeled yet |
| Rollout/regression | gated enablement, truthful docs, migration safety | feature flags, docs tests, regression suites | docs and discovery can drift from runtime reality without guard tests |

## Suggested execution slices

### Slice A: Foundation

- contracts and schema
- worker control plane
- minimal admin worker visibility

### Slice B: Gateway truthfulness

- HTTP gateway docs/profile
- tenant normalization
- MCP parity decision and implementation/hiding

### Slice C: Production worker lifecycle

- scheduler and billing
- artifact publication
- team/admin/workflow integration

### Slice D: Ship readiness

- security/observability
- rollout gates
- regression suite and docs lock

## Release blockers

Treat these as blockers before broad enablement:

1. Worker routes are not explicitly gated by `openClawExternalRuntime`.
2. `/v1/responses` still collapses external callers into the `default` tenant.
3. MCP discovery still advertises placeholder `smartspec.llm.*` parity.
4. Public docs still omit the real HTTP gateway contract or imply unsupported embeddings.
5. Legacy unresolved connectors fail or are forced to bind before rollout is ready.
