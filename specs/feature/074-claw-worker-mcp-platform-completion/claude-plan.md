# Implementation Plan

## 1. Planning goal

This plan implements Feature 074 as the MCP completion layer on top of Features 071 and 072. The codebase already has a real public MCP protocol shell, a legacy MCP tool system with some real behavior, and a delegated-worker foundation through the HTTP path. The missing work is to make MCP truthful, delegated-worker-safe, and useful enough that Claw runtimes can rely on it for real production work without the platform overstating parity.

The plan must preserve five truths at the same time:

1. `/v1/mcp` is the canonical MCP protocol surface
2. workers remain personal, owner-bound, and same-tenant only
3. MCP must not become a shortcut around delegated auth, grants, budgets, or approvals
4. HTTP remains the stronger product contract where parity is still better
5. only truly executable MCP tools should be advertised

## 2. Codebase baseline and constraints

The implementation must build on the current `apps/web` backend rather than inventing a separate MCP platform.

Important starting points:

- `apps/web/server/_core/mcpPublicServer.ts` already implements the public protocol shell, sessions, `tools/list`, `tools/call`, and discovery
- the public MCP server currently rejects delegated-worker callers for this phase
- the same file registers a broad `smartspec.*` tool set, but several tool families still return stubs or bridge-only placeholder responses
- `apps/web/server/_core/mcpRoutes.ts` still contains real legacy behavior for workspace, drive, and orchestrator actions
- `apps/web/server/routes/workerRuntime.ts` already issues delegated sessions and delegated manifests for worker jobs
- `apps/web/server/services/workerDelegationService.ts` already contains owner-bound scope profiles, route-family policy, model allowlists, and knowledge defaults
- `apps/web/server/services/delegatedWorkerPlatformService.ts`, `workerBillingService.ts`, `workerBudgetService.ts`, and `workerCallbackService.ts` already establish the budget, billing, and callback posture that MCP should reuse
- public HTTP routes already exist for knowledge, media, agencies, presentations, video projects, jobs, LLM, and responses
- public API documentation already exposes OpenAPI-like route documentation through `publicDocsApi.ts`
- the test suite already contains protocol and security tests for MCP plus delegated-worker and knowledge tests in Vitest

The implementation therefore needs a completion layer, not a greenfield rewrite.

## 3. Target end state

After this feature is implemented:

- a delegated personal worker can initialize and use `/v1/mcp`
- the MCP session remains owner-bound, same-tenant, job-scoped, and revocable
- `tools/list` returns only tools that are genuinely executable for the current session
- `tools/call` executes through real service adapters, durable HTTP wrappers, or migrated legacy behavior
- chargeable MCP calls consume the owner user’s SmartSpecPro balance with correct downstream source attribution
- worker budget windows and delegated-job budgets are enforced exactly as they are for delegated HTTP
- owner Library and RAG access are available through canonical MCP tools where granted
- long-running tool families return durable job/task/status handles rather than fake “pending” placeholders
- legacy workspace, drive, and orchestrator behavior is absorbed into the canonical public MCP truth model
- operator controls can disable delegated MCP globally or by high-risk family without breaking unrelated HTTP worker flows

## 4. Architecture changes

### 4.1 Introduce a canonical MCP tool registry

The current public MCP implementation mixes registry data and ad hoc execution branches. Feature 074 should introduce a canonical tool registry abstraction that can answer both discovery and execution questions from one source of truth.

The registry should capture, at minimum:

- tool name and family
- required scopes
- required grant type
- delegated-worker eligibility
- current implementation mode
- feature flag dependency
- owner-resource dependency
- billing behavior
- result safety class
- async/status relationship
- idempotency mode
- current availability reason

This registry should be consumable by both:

- `tools/list`
- `tools/call`

The goal is to eliminate the current mismatch where a tool is advertised but still falls through to a placeholder or “not implemented” path.

### 4.1.1 Preserve protocol compliance while execution changes

Feature 074 changes execution truth, not the core JSON-RPC transport contract. The implementation should explicitly preserve the public MCP behaviors that already exist today unless a deliberate compatibility change is documented.

Important behaviors to preserve:

- initialize and protocol-version negotiation
- `Mcp-Session-Id` session semantics
- batch request handling and batch size limits
- `ping`
- `notifications/initialized` as a safe no-op unless a stronger behavior is intentionally introduced
- `DELETE /v1/mcp` session termination
- existing expired-session and missing-session behavior

The plan should also set a clear default for dynamic discovery behavior:

- keep `tools.listChanged = false` unless real list-changed notification support is implemented end-to-end
- if tool availability changes during a session because of kill switches, grant changes, or feature flags, execution must fail closed even if the client cached an older `tools/list` response

### 4.2 Add a delegated-worker auth path for public MCP

Feature 072 already introduced delegated sessions for HTTP access. Public MCP should adopt that same auth model instead of treating MCP as a special exception.

The delegated MCP auth path should:

- accept only delegated-worker sessions issued through the worker control plane
- require `actingUserId == ownerUserId`
- require exact tenant match
- require an active worker job and still-valid delegated session
- inherit the same grant envelope, route-family posture, model policy, and budget posture already present in `workerDelegationService`

This auth path should be explicit in `mcpPublicServer.ts`, not inferred indirectly from generic bearer handling.

### 4.3 Reuse delegated-worker enforcement services

Feature 074 should not re-implement billing, budget, or route-family policy in a second place. It should add MCP-specific adapters that reuse the existing delegated worker services wherever possible.

Important reuse targets:

- `workerDelegationService` for scope profile, grants, model policy, and manifest truth
- `delegatedWorkerPlatformService` for common enforcement posture around spend, route-family eligibility, and execution checks
- `workerBudgetService` for time-window and job-envelope budget enforcement
- `workerBillingService` for downstream attribution and reconciliation
- `workerCallbackService` and `workerArtifactService` for safe publication flows when MCP-triggered work creates artifacts or notifications

The same shared layer should also produce stable audit and tracing metadata so MCP calls can be correlated with:

- delegated session id
- worker id
- worker job id
- tool name and family
- downstream route or service
- retry or replay identity where applicable

### 4.4 Add a real execution-adapter layer

Each tool family should execute through one of a small number of well-defined adapter types:

- service-native execution for logic already available as services
- HTTP wrapper execution for routes that already expose the strongest production behavior
- internal route adapter for migrated legacy behavior
- Python proxy execution for drive-like tools that already rely on the Python backend
- disabled state when parity is still intentionally incomplete

The adapter layer should make it easy to say:

- this tool is listed and callable
- this tool is callable only for non-delegated sessions
- this tool is hidden for delegated workers until a family feature flag is enabled

### 4.5 Make discovery truthful at three levels

The product now has three discovery surfaces:

- OpenAPI or equivalent HTTP docs
- delegated capability manifest
- MCP discovery through `tools/list`

Feature 074 should make them complementary instead of contradictory:

- OpenAPI remains the static HTTP contract
- the delegated manifest remains the per-job truth for scopes, route families, knowledge access, budgets, and enabled MCP families
- `tools/list` becomes the session-specific truth for callable MCP tools

The plan should also add a static machine-readable MCP catalog or equivalent export so runtime developers can understand the tool surface without needing a live delegated session. That static catalog should describe the general product surface and availability classes, but it must not override authenticated `tools/list` or the delegated manifest for session-level truth.

### 4.6 Phase the tool families by production value

The implementation should prioritize tool families with the best ratio of user value to backend readiness.

Recommended order:

1. gateway wrappers for models, credits, chat, and responses
2. knowledge tools for Library and RAG
3. skills and agencies
4. media and jobs
5. presentations and video projects
6. legacy workspace, drive, and orchestrator migration
7. browser MCP only after current browser policy, billing, reservation, and concurrency controls can be preserved

This preserves the product truth that HTTP is still stronger for some families while moving MCP toward practical usefulness.

### 4.7 Normalize long-running MCP behavior

Several target families already behave asynchronously in HTTP. MCP wrappers should not invent inconsistent per-family patterns.

The public MCP layer should normalize:

- create or execute calls that return a durable task/job/operation identifier
- companion status tools where the family already supports status polling
- cancel tools where cancellation already exists
- artifact or download references that point back to the durable platform surface rather than dumping oversized results inline

Where a worker needs to report completion back to the owner-facing product surfaces, the implementation should reuse the existing worker callback posture from Feature 072 rather than inventing a second notification model inside MCP itself. MCP tools may return status handles, artifact refs, or safe links, while room/workflow/user notifications continue to flow through the existing worker callback services.

This is especially important for:

- media
- presentations
- video projects
- jobs

### 4.7.1 Standardize business idempotency for `tools/call`

JSON-RPC request ids are transport identifiers, not sufficient business idempotency keys for chargeable or write-capable MCP work. The implementation should define one canonical way for MCP clients to express idempotency for write or async create tools.

Recommended default:

- accept a stable business idempotency key through a standard MCP call metadata field such as `params._meta.idempotencyKey`
- do not treat JSON-RPC `id` alone as the business idempotency key
- where a client omits that field, only allow deterministic fallback behavior for families where the backend can safely derive it without risking duplicate charges or duplicate side effects

This should be documented clearly so OpenClaw, ZeroClaw, and future runtimes do not guess differently.

### 4.8 Preserve approval gates and high-risk action posture

Feature 072 already established that some delegated actions may require explicit policy enablement or approval. MCP must preserve that posture instead of acting as a side door around it.

Examples that should keep approval or policy gating:

- destructive or sensitive browser actions
- non-trivial workspace or drive writes
- large-budget or high-cost media generation
- chained tool patterns that trigger multiple high-impact downstream actions

The approval posture should be encoded at the registry or policy layer so discovery and execution remain aligned.

### 4.9 Treat external and retrieved content as untrusted

MCP makes it easy for runtimes to chain browser output, drive files, workspace files, Library content, RAG chunks, and external tool outputs into later actions. The backend must treat all such content as untrusted.

The implementation should therefore enforce:

- grants cannot be widened by content
- model/provider choices cannot be silently switched by content
- callback targets cannot be widened by content
- artifact publication remains subject to scan, validation, and safe-serving rules
- source attribution is retained so operators can inspect what influenced a later action

### 4.10 Add operator observability and emergency controls

MCP completion is not only a product feature; it is an operational surface. The implementation should include:

- audit events that distinguish discovery, execution, denial, replay rejection, budget denial, and owner-resource denial
- metrics by tool and family so operators can see which surfaces are actually used
- feature flags or kill switches that can disable delegated MCP globally, by family, or by high-risk group
- diagnostics explaining why a tool is hidden or denied for a given delegated session

## 5. Resolved defaults for implementation

To keep the later implementation phase concrete, this plan sets the following defaults:

- delegated-worker MCP remains disabled until the registry, auth path, grant checks, and billing hooks are wired end-to-end
- public MCP stays canonical at `/v1/mcp` and `/.well-known/mcp.json`
- placeholder tools are hidden rather than partially exposed
- browser MCP is gated behind a dedicated feature flag until current browser policy behavior is fully preserved
- active-content outputs such as HTML or SVG remain subject to download-only, safe-viewer, or quarantine-first handling
- idempotency is mandatory for write-capable or chargeable MCP tools
- tool results should prefer durable ids, artifact refs, and download/status links over large inline payloads
- worker ownership remains self-service and personal; shared-worker semantics are out of scope

## 6. Implementation workstreams

### 6.1 Workstream A: canonical registry and shared contracts

Define the registry, shared types, and discovery contracts that the rest of the feature will depend on.

Likely files:

- `apps/web/server/_core/mcpPublicServer.ts`
- new shared MCP registry module under `apps/web/server/_core` or `apps/web/shared`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/shared/*` for any new tool metadata schemas

Expected outcomes:

- registry metadata for all supported tool families
- clear availability and feature-flag posture
- machine-readable catalog contract
- manifest shape updates so delegated workers learn what MCP families and tools are actually enabled
- explicit protocol-capability posture for tools vs gated prompts/resources
- explicit default for `tools.listChanged` support

### 6.2 Workstream B: delegated-worker MCP auth and session enablement

Extend the public MCP layer to accept delegated-worker callers safely.

Likely files:

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/routes/workerRuntime.ts`

Expected outcomes:

- delegated-worker auth mode enabled for MCP
- owner-only and same-tenant enforcement
- active-job and active-session checks
- failure-closed behavior on revocation, lease loss, disablement, or expiry

### 6.3 Workstream C: billing, budget, idempotency, and concurrency hooks

Connect MCP execution to the same cost-control posture already used by delegated HTTP.

Likely files:

- `apps/web/server/services/delegatedWorkerPlatformService.ts`
- `apps/web/server/services/workerBudgetService.ts`
- `apps/web/server/services/workerBillingService.ts`
- `apps/web/server/_core/mcpPublicServer.ts`

Expected outcomes:

- budget enforcement before chargeable tool execution
- downstream source-type preservation
- idempotent write semantics for retries
- concurrency ceilings by action class or family
- duplicate retries that do not double-charge or double-create work
- one documented MCP business-idempotency contract that works in single-call and batch scenarios

### 6.4 Workstream D: gateway and knowledge parity

Implement the highest-value delegated-worker MCP wrappers first.

Gateway tools:

- models list
- credits get
- chat create
- responses create

Knowledge tools:

- Library search
- Library get
- Library upload
- RAG search
- RAG ingest

Likely files:

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/publicKnowledgeApi.ts`
- `apps/web/server/routes/publicDocsApi.ts`
- shared helpers used by HTTP and MCP wrappers

Expected outcomes:

- real execution rather than placeholder responses
- owner-bound knowledge access
- upload and ingest flows that still use the normal publication and indexing pipeline

### 6.5 Workstream E: skills, agencies, media, and jobs parity

Turn the major product families with existing public HTTP routes into truthful MCP surfaces.

Likely files:

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/publicSkillsApi.ts`
- `apps/web/server/routes/publicAgencyApi.ts`
- `apps/web/server/routes/publicMediaApi.ts`
- `apps/web/server/routes/publicJobsApi.ts`
- `apps/web/server/services/agencyMcpService.ts`

Expected outcomes:

- skill, agency, media, and job tools become real wrappers over current backend capability
- agency tool bridge is preserved and hardened rather than replaced blindly
- long-running families return durable ids and status handles

### 6.6 Workstream F: presentations, video projects, and artifact-safe results

Promote the presentation and video families from placeholder discovery to real MCP wrappers, while keeping artifacts safe to return to the worker and back to the owner.

Likely files:

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/publicPresentationsApi.ts`
- `apps/web/server/routes/publicVideoApi.ts`
- artifact-serving and publication helpers where needed

Expected outcomes:

- real create/export/download/progress wrappers
- durable task or export references
- safe artifact/result handling rather than raw inline binary or unsafe markup

### 6.7 Workstream G: legacy MCP migration

Migrate or absorb the useful legacy MCP behavior into the canonical public truth model.

Likely files:

- `apps/web/server/_core/mcpRoutes.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- shared adapters extracted from `mcpRoutes.ts`

Expected outcomes:

- workspace tools reachable through the canonical public MCP server
- drive tools still proxied safely to Python where necessary
- orchestrator room actions preserved
- legacy `/api/mcp/*` reduced to compatibility or internal-only status

### 6.8 Workstream H: browser MCP and advanced parity

Browser MCP should be the last major family because it already has strong policy, reservation, and concurrency constraints in the HTTP path.

Likely files:

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/browserTool.ts`
- `apps/web/server/services/browserPolicy*`

Expected outcomes:

- either a safe delegated-browser MCP wrapper
- or a deliberately hidden/gated browser family until policy parity is ready

This workstream may also consider later MCP capabilities such as prompts or resources, but only after the core tool surface is truthful and stable.

### 6.9 Workstream I: docs, observability, and rollout control

Update the discovery story, help content, feature flags, and operator guidance.

Likely files:

- `apps/web/server/routes/publicDocsApi.ts`
- help docs under `apps/web/docs/help`
- admin or operator monitoring surfaces if MCP visibility is surfaced there
- feature-flag definitions and rollout docs

Expected outcomes:

- public docs that explain HTTP-first plus MCP truthfully
- runtime-facing docs for catalog + manifest + session-specific discovery
- callback guidance that explains how MCP-triggered work should surface completion back to rooms, workflows, or user notifications
- clear rollout posture and kill-switch guidance

## 7. Delivery phases

### Phase 1: canonicalization and delegated auth

Deliver:

- canonical registry
- truthful `tools/list`
- delegated-worker auth enablement for `/v1/mcp`
- grant, budget, and billing hooks

This phase should still keep placeholder families hidden until their real execution adapters are ready.

### Phase 2: gateway and knowledge completion

Deliver:

- gateway wrappers
- knowledge tools
- static MCP catalog publication
- manifest alignment

This is the first milestone where delegated-worker MCP becomes genuinely useful even without full family parity.

### Phase 3: skills, agencies, media, and jobs

Deliver:

- real wrappers for those families
- async conventions and status tools
- idempotent write behavior for retried calls

### Phase 4: presentations, video, and artifact-safe result handling

Deliver:

- presentation and video family parity
- safe artifact/result references
- durable export/download flows

### Phase 5: legacy migration and browser decision

Deliver:

- workspace/drive/orchestrator migration into canonical public MCP
- browser wrapper only if policy parity is safe, otherwise explicit continued gating

## 8. Error handling and edge cases

The implementation should define explicit behavior for:

- delegated session expiry or revocation during long-running work
- retries of chargeable or write-capable tools
- batch requests that mix valid, invalid, notification, and delegated-worker denied operations
- tools that are hidden after session creation because a kill switch or feature flag changed
- duplicate async create calls
- Python backend unavailability for drive tools
- unavailable browser policy surface or reservation failure
- owner-resource mismatch for Library, RAG, jobs, decks, projects, or room actions
- oversized outputs or unsafe content in MCP results
- untrusted-content attempts to alter model choice, callback target, or permissions

## 9. Testing strategy

The implementation should follow the repo’s established Vitest pattern:

- route tests with `express` + `supertest` for protocol and HTTP wrapper behavior
- service tests for registry, enforcement, billing, and idempotency logic
- focused security tests for denial behavior and truthfulness

The most important tests are:

- delegated-worker enablement and fail-closed denial
- truthful `tools/list` behavior
- protocol-regression coverage for initialize, version negotiation, batch, ping, notifications, and session termination
- billing and budget correctness
- idempotent `tools/call` retries
- knowledge ownership enforcement
- legacy migration parity
- browser gating correctness

## 10. Main implementation risks

The biggest risks are not protocol syntax. They are:

- over-advertising tools before they are truly executable
- letting delegated-worker MCP bypass Feature 072 guardrails
- duplicating logic between public and legacy MCP
- charging incorrectly on retries or long-running status flows
- exposing unsafe content through MCP results or artifact links
- underestimating browser safety complexity

The plan therefore favors truthful phased delivery over “complete parity” marketing language.

## 11. Completion criteria

This plan is complete when the later implementation can make the following statement true:

“SmartSpecPro’s public MCP surface is a real delegated-worker production surface for the families it advertises. Personal workers can use it within owner-bound, same-tenant, budgeted, auditable policy, and the platform no longer claims MCP support for tools that are only placeholders.”
