# 074 - Claw Worker MCP Platform Completion

Version: 1.0
Date: 2026-04-07
Status: Proposed
Depends-on: 072-claw-worker-platform-access, 071-openclaw-external-runtime-integration, 059-external-worker-provider-framework, 043-PublicAPI-ExternalAgentGateway
Audience: Web Control Plane, Public API, MCP, Runtime, Billing, Security, QA, Admin Ops

---

## 1. Executive summary

Feature 071 made OpenClaw a real external worker class.

Feature 072 made Bound Worker useful through delegated HTTP platform access, owner-bound Library and RAG access, callback publishing, worker budgets, and credit-correct API usage.

The next major gap is MCP.

Today SmartSpecPro already has:

- a real MCP protocol server at `/v1/mcp`
- a legacy MCP tool layer at `/api/mcp/*`
- a large MCP tool registry
- working delegated worker sessions outside MCP

But it does **not** yet have a complete, truthful, delegated-worker-safe MCP execution surface.

This feature closes that gap by making MCP as complete as realistically possible on top of the current backend:

- enable delegated personal workers to use MCP safely
- remove or hide MCP tools that are only placeholders
- implement the highest-value tool families through real service execution
- unify public MCP and legacy MCP behavior behind one canonical tool execution model
- preserve owner-only, same-tenant, budgeted, auditable execution

The intended result is:

- workers can use HTTP where HTTP is still stronger
- workers can use MCP where MCP adds real value
- `tools/list` becomes truthful
- `tools/call` becomes credit-correct and security-correct
- OpenClaw, ZeroClaw, and future Claw runtimes can treat MCP as a real production integration surface instead of a partial demo layer

---

## 2. Problem statement

### 2.1 Protocol readiness is ahead of execution readiness

The codebase already supports:

- MCP initialize
- MCP sessions in Redis
- batch requests
- `tools/list`
- `tools/call`
- discovery manifest
- session termination

However, many registered tools still do one of the following:

- return a stub response
- return a "delegated to HTTP" message only
- expose a tool that has no real implementation path in the canonical public MCP server

### 2.2 Delegated worker MCP is still blocked

Feature 072 intentionally fail-closed delegated workers for MCP.

That was the correct choice then, but it means:

- Bound Worker cannot yet use MCP as a delegated tool surface
- OpenClaw and similar runtimes still have to prefer HTTP for nearly everything
- the platform cannot honestly claim full worker MCP support

### 2.3 Tool truth is split across two MCP systems

There are currently two MCP-style systems:

1. `/v1/mcp` public MCP server
2. legacy `/api/mcp/*` tool routes

The public server owns the canonical MCP protocol path, but the legacy routes still contain several real implementations:

- workspace file read/write
- drive tool proxying
- orchestrator room actions

This split creates duplication, drift, and overclaim risk.

### 2.4 MCP billing and grant enforcement are incomplete

Current MCP execution does not yet consistently apply:

- delegated worker grants
- worker budgets
- downstream billing attribution
- owner-bound resource enforcement
- tool-family concurrency policy

This makes MCP weaker than HTTP for real delegated production work.

---

## 3. Goals

1. Make `/v1/mcp` the canonical MCP surface for delegated workers and external runtimes.
2. Allow delegated personal workers to use MCP safely within the same owner and same tenant only.
3. Ensure `tools/list` only advertises tools that are actually executable for the current session.
4. Implement real execution for the highest-value tool families that already have backend services or durable public routes.
5. Unify or absorb the useful parts of legacy `/api/mcp/*` into the canonical MCP execution model.
6. Preserve correct billing, budgets, idempotency, concurrency, audit, and callback behavior for MCP calls.
7. Keep HTTP-first where HTTP remains the stronger surface, while making MCP broad enough to be genuinely useful in production.
8. Provide a phase plan toward the most complete feasible MCP surface without overpromising parity that the codebase does not yet support.

---

## 4. Non-goals

1. This feature does not replace Features 071 or 072.
2. This feature does not make MCP the only runtime surface; HTTP remains valid and often preferable.
3. This feature does not promise every theoretical MCP capability category such as prompts/resources/sampling in the first implementation pass.
4. This feature does not give workers unrestricted machine access.
5. This feature does not allow workers to use another user's data or cross tenant boundaries.
6. This feature does not require every existing MCP tool name to survive unchanged if renaming improves truthfulness and compatibility.

---

## 5. Current backend truth

### 5.1 What is already solid

The current `/v1/mcp` path already has:

- auth normalization
- Redis-backed MCP sessions
- batch request handling
- pagination for `tools/list`
- tool scope checks
- payload/result size guardrails
- discovery manifest at `/.well-known/mcp.json`

This means the protocol shell is not the main blocker.

### 5.2 What is still incomplete

Current public MCP reality:

- delegated workers are rejected
- many tools are still placeholders or bridge-only responses
- several tools are advertised before they are truly executable
- public MCP does not yet integrate delegated billing and grant checks the way HTTP now does
- knowledge/RAG tools are still missing from the canonical public MCP server

### 5.3 What exists in legacy MCP and should not be wasted

Legacy MCP routes already contain real behavior for:

- workspace file tools
- drive tool proxying to Python
- orchestrator room actions
- audit logging

These should be reused or migrated, not rewritten blindly.

### 5.4 Truthfulness problem to fix

The current public MCP registry mixes three tool categories:

1. real tools
2. thin bridge tools
3. not-yet-real tools

`tools/list` must stop treating those categories as equivalent.

---

## 6. Product outcome

After this feature, a Bound Worker or Claw runtime should be able to:

- initialize an MCP session through `/v1/mcp`
- discover only the tools it can really use
- execute those tools with owner-bound and tenant-bound enforcement
- spend the owner's SmartSpecPro credits correctly when MCP calls platform resources
- use knowledge, jobs, agencies, media, presentations, video projects, orchestrator actions, and selected workspace/browser/drive tools where granted
- continue using HTTP for routes where HTTP remains stronger or more complete

The product message should become:

- HTTP is the primary platform contract
- MCP is now a real delegated tool surface for high-value worker execution
- the worker should choose the stronger surface, not the more fashionable one

---

## 7. Locked architectural decisions

### 7.1 `/v1/mcp` is the canonical MCP endpoint

This feature standardizes on:

- canonical protocol endpoint: `/v1/mcp`
- canonical discovery manifest: `/.well-known/mcp.json`

Legacy `/api/mcp/*` becomes one of:

- an internal compatibility layer reused by `/v1/mcp`
- an admin/internal-only surface
- or a route family that is explicitly deprecated after parity is migrated

It must not remain a second product truth forever.

### 7.2 Delegated workers use delegated sessions, not raw user sessions

Delegated worker MCP access must be enabled by reusing Feature 072 delegated-session principles:

- owner-bound
- same-tenant only
- short-lived
- job-scoped
- grant-scoped
- revocable

The system must not treat MCP as a shortcut around delegated auth.

### 7.3 Truthful tools only

`tools/list` must be filtered by all of the following:

- authenticated scopes
- delegated grants where applicable
- tenant feature flags
- implementation availability
- runtime compatibility
- owner resource access

If a tool cannot really execute for this caller, it must be hidden or marked unavailable, not advertised as normal.

### 7.4 Shared execution adapters

Each MCP tool should resolve to one of these execution modes:

- `service_native`
- `http_wrapper`
- `python_proxy`
- `internal_route_adapter`
- `disabled`

This feature should introduce a shared registry or adapter layer so `tools/list` and `tools/call` use the same truth source.

### 7.5 HTTP-first remains the baseline

LLM, responses, models, credits, and other mature public APIs remain canonical HTTP surfaces.

MCP may wrap them for tool convenience, but HTTP remains:

- the main public contract
- the stronger production truth when parity differs

### 7.6 No placeholder parity claims

Tools that currently only say "delegated to `/v1/...`" are not yet production-complete MCP tools.

This feature should either:

- implement them for real
- or stop advertising them

### 7.7 Security model stays owner-bound

All delegated worker MCP execution must remain:

- owner-only
- same-tenant only
- budget-limited
- auditable
- grant-limited

### 7.8 Legacy real tools must move toward canonical public MCP

Workspace, drive, orchestrator, and browser-related MCP value should be exposed through the canonical public server instead of staying fragmented.

### 7.9 Personal-worker ownership remains explicit

This feature must not blur the personal-worker model established in Feature 072.

Required rules:

- the normal add-worker path remains self-service for the end user
- the worker owner is the only user who can receive delegated MCP sessions for that personal worker
- admin visibility and safety controls do not imply delegated usage rights
- a worker must not inherit another user's rights just because both users are in the same tenant
- a future shared-worker model, if ever added, must be designed as a separate product concept instead of being implied by this feature

---

## 8. Target MCP completion scope

This feature aims for the most complete feasible MCP surface based on the current backend.

| Family | Target MCP tools | Current truth | Target outcome |
|---|---|---|---|
| Gateway | models, credits, chat, responses | HTTP only | add thin but real MCP wrappers |
| Skills | list, get, detect, execute | mostly stub/bridge | real execution via existing services/routes |
| Agencies | list, invoke, status | mostly stub/bridge | real execution with billing and result status |
| Agency Tool Bridge | list tools, call tool | partially real | keep and harden |
| Knowledge | library search, library upload, rag search, rag ingest, library get | mostly missing in MCP | real owner-bound MCP tools |
| Media | image, video, audio generate, status | mostly stub/bridge | real async task creation/status tools |
| Presentations | generate, get deck, export, download, progress | route exists | real MCP wrappers |
| Video Projects | create, get, export download | route exists | real MCP wrappers |
| Jobs | create, list, get, cancel | route exists | real MCP wrappers |
| Workspace | read, write, list | legacy MCP only / partial public MCP overclaim | migrate into canonical public MCP |
| Drive | search, read, list/info | legacy MCP + Python proxy | migrate and keep owner-bound |
| Browser | execute actions | route exists outside MCP | add safe MCP wrapper only if policy checks are preserved |
| Orchestrator | room/work-item actions | real in multiple MCP paths | keep and consolidate |

---

## 9. Canonical tool registry model

This feature should introduce a canonical MCP tool registry abstraction with fields like:

- `toolName`
- `family`
- `requiredScopes`
- `requiredGrantType`
- `readWrite`
- `executionMode`
- `availability`
- `supportsDelegatedWorker`
- `featureFlag`
- `requiresOwnerResource`
- `chargesCredits`
- `actionClass`
- `toolVersion`
- `availabilityReason`
- `supportsStreaming`
- `idempotencyMode`
- `asyncStatusTool`
- `resultSafetyClass`
- `handler`

This registry should drive both:

- `tools/list`
- `tools/call`

This prevents the current mismatch where a tool appears in discovery but falls through to "not implemented" at runtime.

---

## 10. Security and billing requirements

### 10.1 Required security controls

Every delegated worker MCP call must enforce:

- delegated-session validity
- owner-user match
- tenant match
- required scopes
- required grants
- tool-family allowlist
- model/provider policy where applicable
- recursion depth guard
- replay protection where supported
- rate limits
- per-action concurrency ceilings
- output size caps
- safe error redaction
- approval-gated handling for high-risk write actions where delegated policy requires it
- callback-target allowlists where callbacks or follow-up links are produced
- untrusted-content handling for browser, workspace, drive, Library, and RAG derived content
- active-content restrictions for HTML, SVG, scriptable, or macro-bearing artifacts where relevant

### 10.2 Billing model

MCP calls that spend SmartSpecPro resources must behave like HTTP equivalents:

- use the owner's user balance
- preserve downstream service source types where possible
- keep parent worker job lineage
- obey worker budget caps
- obey reservation/draw/reconcile rules where applicable

Examples:

- LLM MCP wrappers must charge like LLM HTTP usage
- media MCP tools must charge like media HTTP usage
- browser MCP tools must keep browser reservation behavior
- knowledge upload/ingest tools must preserve current upload/index billing logic

### 10.3 Browser and workspace safety

Browser MCP tools must preserve:

- browser tenant feature flag checks
- domain allowlist enforcement
- concurrency semaphores
- pre-reservation / refund flow
- policy release checks

Workspace MCP tools must preserve:

- root sandboxing
- extension allowlists
- read/write size limits
- write token or equivalent write protection policy

### 10.4 Python proxy safety

Drive or other Python-proxied tools must preserve:

- proxy token authentication
- timeout guards
- owner user context
- tenant context
- safe fallback behavior when Python is unavailable

### 10.5 Untrusted content and prompt-injection safety

Content obtained from any of the following must be treated as untrusted:

- browser pages
- downloaded files
- drive file contents
- workspace files
- Library documents
- RAG chunks
- tool outputs from external runtimes

Required rules:

- untrusted content must never expand scopes, grants, callback targets, or budget
- tool instructions derived from untrusted content must still pass normal server-side allowlists and grants
- prompt or page content must not be able to silently switch model, provider, billing profile, or callback destination outside delegated policy
- the platform should preserve source attribution so operators can understand what content influenced a later MCP action

### 10.6 Approval-gated high-risk actions

This feature should preserve the approval-gate posture introduced by Feature 072 for especially sensitive delegated actions.

Examples that may require explicit policy enablement or approval:

- browser actions against sensitive domains or destructive page actions
- workspace or drive writes outside the default low-risk profile
- large-budget media or presentation generation above policy thresholds
- chained MCP actions that trigger other high-cost or high-impact downstream work

The MCP surface must not become a side door that bypasses those approval controls.

### 10.7 Idempotency and retry safety

Because MCP clients may retry `tools/call`, the canonical server must define retry-safe behavior for write or chargeable tools.

Required rules:

- every write-capable or chargeable tool must define an idempotency mode
- asynchronous tool calls should accept or derive a stable tool-call idempotency key
- duplicate retries must not double-charge, double-create, or double-publish results
- idempotent status tools must return the current state of the original operation rather than creating new work
- billing and audit records must preserve the first accepted call and any later duplicate replays

### 10.8 Artifact and result safety

MCP result publication must preserve the same serving safety as HTTP publication flows.

Required rules:

- HTML, SVG, and other active-content artifacts should default to safe handling such as download-only, safe viewer, or quarantine-first
- upload or ingest flows must preserve existing scan, validation, and indexing policy
- generated links returned in MCP results must be safe to share back to the owner but must not bypass normal authorization
- structured MCP results should prefer references, status handles, and artifact ids over dumping large unsafe payloads inline

### 10.9 Observability and kill switches

This feature must include operator-safe observability and emergency controls.

Required rules:

- audit events should distinguish MCP discovery, MCP execution, denied execution, replay rejection, budget denial, and owner-bound resource denial
- per-tool and per-family metrics should make it possible to see which delegated MCP surfaces are genuinely used
- feature flags should allow disabling delegated MCP globally, by family, or by high-risk tool group
- operator-visible diagnostics should show why a tool was hidden or denied for a delegated worker session

---

## 11. Tool execution design

### 11.1 Gateway wrappers

Add real MCP tools for:

- `smartspec.gateway.models.list`
- `smartspec.gateway.credits.get`
- `smartspec.gateway.chat.create`
- `smartspec.gateway.responses.create`

These may call shared services or route adapters, but they must produce real execution and real billing.

### 11.2 Knowledge tools

Canonical MCP knowledge family should include:

- `smartspec.knowledge.library.search`
- `smartspec.knowledge.library.get`
- `smartspec.knowledge.library.upload`
- `smartspec.knowledge.rag.search`
- `smartspec.knowledge.rag.ingest`

These must remain owner-bound and same-tenant.

### 11.3 Platform wrappers

The following families should become real MCP wrappers over existing backend capability:

- skills
- agencies
- media
- presentations
- video projects
- jobs

### 11.4 Migrated legacy tools

The following legacy tools should move into the canonical MCP server:

- workspace read/write/list
- drive search/read/list/info
- orchestrator room actions

### 11.5 Browser MCP

Browser MCP should be included only if it preserves all existing browser policy and billing controls.

If that cannot be done safely in the first pass, browser MCP should be:

- hidden for delegated workers
- or released behind a dedicated feature flag

### 11.6 Long-running tool conventions

Long-running MCP tools should use a consistent async convention instead of inventing per-family behavior.

Recommended rules:

- create or execute tools that start long-running work should return a stable operation id or downstream job/task id
- status tools should be named and documented predictably so runtimes can poll without guesswork
- cancel tools should exist for families where cancellation already exists in HTTP
- result payloads should include links, artifact refs, or status refs instead of large inline blobs when the work is still in progress

---

## 12. Manifest and discovery changes

Delegated manifests should gain an MCP section that tells the worker:

- whether delegated MCP is enabled for this job
- which MCP families are available
- which specific tools are available
- which tools are experimental or disabled
- whether browser/workspace/drive tools are enabled

OpenAPI remains the static HTTP contract.

The canonical MCP tool registry should also be publishable as a machine-readable static catalog for developer understanding, while authenticated `tools/list` remains the runtime truth for the current session.

MCP discovery becomes:

- the protocol-level discovery for tool execution
- session-specific and truthful after auth

---

## 13. Delivery phases

### Phase 1: Canonicalization and truthfulness

- enable delegated-worker auth path for `/v1/mcp`
- introduce shared MCP tool registry
- make `tools/list` filter by implementation availability and grants
- remove or hide currently fake tools
- wire billing/concurrency/grant hooks into `tools/call`

### Phase 2: High-value platform parity

Implement real MCP execution for:

- gateway models/credits/chat/responses
- skills
- agencies
- knowledge/RAG
- media
- jobs

### Phase 3: Presentation and artifact workflows

Implement real MCP execution for:

- presentations generate/get/export/progress/download
- video projects create/get/export
- artifact-friendly result formatting and links

### Phase 4: Legacy MCP migration

Move or absorb:

- workspace tools
- drive tools
- orchestrator tools
- agency bridge tools

into the canonical public MCP server truth model.

### Phase 5: Browser completion and advanced parity

If policy-safe:

- browser execute actions via MCP
- optional additional MCP capabilities such as resources or prompt templates where they add real value

---

## 14. Acceptance criteria

### 14.1 Delegated worker enablement

- a delegated worker can successfully initialize and use `/v1/mcp`
- owner and tenant boundaries are enforced
- revoked or expired delegated sessions fail closed

### 14.2 Truthful discovery

- `tools/list` only returns tools that can actually execute
- tools that are still disabled or unimplemented do not appear as normal available tools
- delegated manifest and `tools/list` do not contradict each other

### 14.3 Billing correctness

- MCP tool calls charge the owner user balance correctly
- worker budget caps are enforced
- downstream service attribution remains visible in audit/billing records
- duplicate retries do not double-charge or double-create work

### 14.4 Knowledge correctness

- the worker can search owner Library
- the worker can upload into owner Library where granted
- the worker can search owner RAG where granted
- the worker can ingest owner knowledge where granted
- the worker cannot read or write another user's knowledge

### 14.5 Platform usefulness

- the worker can complete meaningful multi-step work using MCP for at least:
  - one skill flow
  - one agency flow
  - one knowledge flow
  - one media flow
  - one job flow

### 14.6 Legacy parity

- workspace/drive/orchestrator tools that remain supported are reachable through the canonical MCP truth model
- no duplicated product claim remains between `/v1/mcp` and legacy `/api/mcp/*`

### 14.7 Safety correctness

- untrusted browser, drive, workspace, Library, and RAG content cannot expand worker grants or callback targets
- active-content artifacts returned through MCP follow safe-serving policy
- approval-gated high-risk MCP actions still require explicit policy enablement or approval where configured
- delegated MCP can be disabled quickly through kill switches without breaking unrelated HTTP worker flows

---

## 15. Estimated implementation size

This feature is **medium-to-large**, not a trivial cleanup.

Realistic backend effort:

- selective, high-value MCP completion: medium project
- broad MCP completion across all listed families: large project

Practical expectation:

- Phase 1 + Phase 2: strong first milestone
- Phase 3 + Phase 4: larger parity push
- Phase 5: optional or gated depending on browser-policy readiness

This is still more efficient than inventing a second protocol or leaving MCP permanently partial, because the current backend already has enough real services to justify completing it.

---

## 16. Final recommendations

1. Build this feature as a completion layer on top of Feature 072, not as a separate worker model.
2. Treat `/v1/mcp` as canonical and stop splitting product truth across two MCP systems.
3. Make `tools/list` truthful before chasing maximum tool count.
4. Implement high-value tools through real execution adapters that reuse existing HTTP/service behavior.
5. Keep HTTP-first as the product baseline, but let MCP become broad enough that Claw runtimes can genuinely rely on it for delegated work.
6. Do not open delegated worker MCP until grants, budgets, and billing are wired end-to-end.
