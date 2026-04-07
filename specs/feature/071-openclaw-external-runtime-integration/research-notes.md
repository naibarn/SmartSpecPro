# Research Notes

## Existing spec baseline

### `specs/feature/059-external-worker-provider-framework/spec.md`

Key findings:

- Feature 059 already introduces worker-runtime ideas and names `openclaw_gateway` as a future runtime type
- the document still frames ZeroClaw as a bundled sidecar and does not fully reflect the newer "managed local runtime" positioning
- OpenClaw is covered only as one subsection inside a broader worker-runtime program, so there is room for a follow-on feature that isolates OpenClaw implementation scope

Implication:

- a new feature can safely extend 059 and explicitly supersede only the OpenClaw-specific decisions that changed in the revised guideline

## Current codebase touchpoints

### Team and external-connector model

Files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/team.ts`
- `apps/web/client/src/pages/Teams.tsx`

Findings:

- `assistant_profiles` already supports `memberKind = "external_connector"`
- external connectors currently use `externalRef` plus optional `externalConfigJson`
- `teamService` normalizes `externalRef` to lowercase and enforces uniqueness per team
- the Teams UI already includes OpenClaw-flavored placeholders such as `openclaw://main-office`

Implication:

- OpenClaw support should preserve the string-based external reference for backward compatibility, but add a canonical worker binding so a connector can map to a registered runtime

### Run-engine behavior

File:

- `apps/web/server/services/runEngine.ts`

Findings:

- the orchestration engine already distinguishes `external_connector` members
- auto-team runs pause when work is waiting on an external connector

Implication:

- OpenClaw worker binding can reuse this behavior and later allow controlled resume/handoff instead of inventing a new team-execution primitive

### Runtime-profile and job-management precedent

Files:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/sandbox.ts`
- `apps/web/client/src/pages/AdminSandbox.tsx`

Findings:

- the repo already has reusable patterns for runtime profiles, job records, artifacts, policy, and admin visibility through the sandbox subsystem
- those patterns are helpful for naming, admin UX, and observability, but OpenClaw should not be forced into `sandbox_profiles` / `sandbox_jobs`

Implication:

- create dedicated worker-runtime tables and services, while borrowing operational conventions from the sandbox stack

### REST route hosting

Files:

- `apps/web/server/_core/index.ts`
- `apps/web/server/routes/*`

Findings:

- the Node/Express server already exposes multiple REST routes under `/api/*` and webhook-style endpoints under `/webhooks/*`
- external systems are not required to use tRPC

Implication:

- worker registration, heartbeat, claim, event, and artifact-upload bootstrap should be plain REST endpoints under `/api/workers` and `/api/worker-jobs`

### Desktop surface

File:

- `apps/tauri-shell/src-tauri/src/lib.rs`

Findings:

- the Tauri shell already manages local runtime and video-editor commands

Implication:

- this feature should not create another desktop host model; it should remain explicitly external-runtime focused

### Existing HTTP LLM gateway

Files:

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/_core/authz.ts`

Findings:

- `/v1/chat/completions` is a real multi-provider LLM proxy route with bearer/session/internal-token support
- `/v1/responses` is a real proxy route with SSE, tool-call handling, and `responsesApi` feature gating
- `/v1/models` is a real authenticated discovery endpoint
- provider family routing already distinguishes `responses`, `messages`, `gemini`, and `chat-completions`
- the current gateway therefore already supports an HTTP-first compatibility profile for external runtimes better than the earlier spec implied

Implication:

- the implementation plan should treat the HTTP gateway as a first-class Claw compatibility surface, not as an afterthought

### Tenant and feature-flag behavior

Files:

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/server/services/featureFlags.ts`
- `apps/web/server/middleware/publicApiFeatureGuard.ts`

Findings:

- tenant flags are defined in shared code and merged with defaults via `tenantFeatureFlagService`
- route guards on the public API use a mix of DB-backed tenant flags and Redis-backed flag lookups depending on subsystem
- bearer-authenticated callers bypass `publicApiFeatureGuard`
- `/v1/responses` currently performs tenant flag checks, but non-internal callers still fall back to `tenantId = "default"`

Implication:

- the plan must include one explicit tenant-identity normalization task for gateway callers, plus one explicit decision on whether `openClawExternalRuntime` needs Redis sync in addition to DB-backed tenant resolution

### Public MCP gateway

Files:

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/middleware/requireScopes.ts`
- `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`

Findings:

- `POST /v1/mcp` is a real JSON-RPC/MCP endpoint with session lifecycle and tool registry
- `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models` are still placeholder handlers
- MCP session creation currently persists `tenantId`, `userId`, and `apiKeyId` from an auth object that is safest for API-key callers
- `requireScopes()` implicitly allows bearer/session callers to pass without per-scope enforcement, so the MCP session path must be explicit about which auth modes it wants to support

Implication:

- the plan must choose between:
  - implementing real MCP LLM proxy handlers now
  - or hiding/removing placeholder LLM tools from MCP discovery until parity exists

### Public docs and external discoverability

Files:

- `apps/web/server/routes/publicDocsApi.ts`
- `apps/web/server/routes/__tests__/publicDocsApi.test.ts`

Findings:

- public docs currently expose `/v1/mcp`
- they do not yet publish `/v1/chat/completions`, `/v1/responses`, `/v1/models`, or `/v1/credits` as a formal external-runtime compatibility contract
- there is no public `/v1/embeddings` route

Implication:

- implementation must include a docs/update workstream so external Claw runtimes know what is really supported

### Test baseline relevant to this feature

Files:

- `apps/web/server/_core/llmRoutes.test.ts`
- `apps/web/server/__tests__/responsesRoutes.test.ts`
- `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
- `apps/web/server/__tests__/publicApiFeatureGuard.test.ts`
- shared feature-flag tests under `apps/web/shared/__tests__/*`

Findings:

- the repo already has route-level tests around `llmRoutes`, `responsesRoutes`, MCP public server behavior, and feature flags
- this is a strong base for extending gateway coverage without inventing a new test strategy

Implication:

- the plan should add explicit regression suites for gateway contract, tenant normalization, MCP parity truthfulness, and worker runtime rollout gates

## Gaps confirmed in the current repo

- no `workers` registry table
- no `worker_jobs` or `worker_heartbeats` schema
- no worker registration or heartbeat REST API
- no canonical binding between `external_connector` team members and a registered worker
- no scheduler path that can choose OpenClaw based on capability intent
- no public `POST /v1/embeddings` route
- no public docs contract for Claw-family HTTP gateway usage
- no real MCP LLM proxy behavior despite discovery entries for `smartspec.llm.*`
- no tenant-safe normalization path yet for external `/v1/responses` callers

## Recommended scope from research

Keep the feature focused on:

- OpenClaw worker registration and lifecycle
- canonical worker/job/artifact models
- team and workflow binding to registered workers
- scheduler and policy rules that treat OpenClaw as an external runtime
- admin/fleet visibility
- HTTP gateway compatibility contract for Claw-family runtimes
- MCP truthfulness and auth normalization
- public docs, rollout, and regression coverage for gateway claims

Do not fold in:

- Desktop + ZeroClaw implementation
- NemoClaw secure-pool rollout
- HiClaw cluster support
- OpenClaw channel/plugin feature parity beyond the registration metadata needed for routing
- speculative embeddings support unless a public route is intentionally added in the same implementation effort
