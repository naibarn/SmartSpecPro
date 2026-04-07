# Implementation Plan

## 1. Planning goal

This plan implements Feature 072 as the layer that makes workers meaningfully useful inside SmartSpecPro. Feature 071 already established the worker control plane. Feature 072 must add the missing delegated-access and execution semantics so that a Bound Worker can act like a digital operator on the user’s behalf without becoming an unrestricted permanent session.

The implementation should preserve three truths at the same time:

1. the worker is a real execution partner, not only a routing target
2. downstream platform usage keeps its real billing and audit identity
3. the system remains tenant-safe, grant-based, revocable, and operator-controllable
4. the feature defaults to self-service personal workers rather than shared workers

## 2. Codebase baseline and constraints

The plan must build on the current `apps/web` worker stack rather than replacing it.

Important starting points:

- `teamService` already binds external connectors to workers, but only permits `openclaw_gateway`
- `workerSchedulerService` already queues worker jobs and reserves parent `worker_runtime` credits
- `workerAuthService`, `workerRegistryService`, and `workerRuntime` routes already implement worker registration, execution tokens, lease claim, diagnostics, and artifact publication
- `/v1/*` public API routes already exist for skills, agencies, media, presentations, video projects, jobs, and LLM
- `requireScopes` currently treats generic bearer auth as full access, so delegated-worker auth cannot simply reuse the current bearer path
- MCP public routes are useful but still incomplete for several high-value actions

The implementation therefore needs a new layer that spans worker services, public API auth, billing metadata, route authorization, callback publishing, audit, and team/runtime eligibility.

## 3. Target end state

After this feature is implemented:

- a claimed worker job can request a short-lived delegated platform session
- the delegated session is tied to the live lease, worker job, tenant, acting user, runtime type, allowed routes, allowed tool namespaces, and resource grants
- delegated usage should only succeed when the acting user matches the worker owner and the tenant matches exactly
- the worker can call selected `/v1/*` routes as a delegated platform client
- the worker can optionally use selected MCP surfaces where parity is already real
- the worker can discover what is available through a stable HTTP contract plus a job-scoped delegated capability manifest
- the worker can use owner-bound library and RAG access where scopes and grants allow it
- the worker can publish results back to the originating room, workflow, or notification surface
- operators can see who delegated what, what the worker touched, what it cost, and why it was allowed
- runtime eligibility can expand beyond OpenClaw-only assumptions

## 4. Architecture changes

### 4.1 Add a delegated worker session layer

Introduce a dedicated job-scoped delegation layer for worker jobs. This layer should not be bolted into the existing worker execution token. It should be a separate issuance path with separate claims, separate revocation rules, and explicit scope and grant envelopes.

Recommended responsibilities:

- new delegated-session issuing service
- new persistence for delegated sessions and job grants
- new auth classification for delegated worker bearer tokens
- new route-level enforcement hooks for job-scoped access

The issuance path should live alongside the worker control plane, because only the worker control plane knows lease ownership and job state.

### 4.2 Add a resource-grant model

Scopes are not enough for this feature because the worker must not inherit broad tenant-wide visibility. The plan should add a server-side or token-linked grant model that can answer whether a worker job may access:

- a specific skill
- a specific agency
- a specific library item
- a specific presentation
- a specific video project
- a specific job type
- a specific room or workflow target
- a specific MCP namespace or server
- a specific provider profile, model family, or model ID where configurable generation or LLM routes are involved

The grant model should be consumable from both HTTP and MCP enforcement code paths.

The grant model should assume personal-worker ownership by default:

- worker owner user ID is persisted and enforced
- delegated session issuance requires `actingUserId == ownerUserId`
- cross-user and cross-tenant access is denied even if route scopes are present

The grant model should also cover owner knowledge access:

- library read or search scope
- RAG read or semantic-search scope
- library or RAG upload policy for allowed ingestion flows

### 4.3 Add a delegated budget ledger

The current `worker_runtime` reservation is useful but not enough. Delegated worker sessions need a budget envelope that can be decremented as downstream platform calls succeed.

The implementation should support:

- per-worker-job delegated budget issuance
- idempotent downstream charging
- remaining-budget visibility
- deterministic rejection when the delegated budget is exhausted
- concurrency ceilings for in-flight delegated actions
- reconciliation between parent worker reservation and downstream real source types

### 4.4 Add a delegated-worker auth mode

The current generic bearer classification in `requireScopes` cannot be reused safely. The platform should distinguish:

- browser sessions
- API key callers
- generic internal bearer callers
- delegated worker callers

Delegated worker callers should be scope-checked and grant-checked by default. They must not inherit the same implicit access semantics as the normal web app.

### 4.5 Make HTTP the first delivery surface

The first usable worker-platform experience should use the existing `/v1/*` surfaces where the system already has real behavior and billing.

Phase-one HTTP coverage should include:

- LLM gateway
- skills list and execute
- agency list and invoke
- media generation
- presentations
- video projects
- jobs
- owner-library and owner-RAG read or ingest surfaces where the platform already has real HTTP paths

This gives the worker immediate usefulness for real production work while avoiding false claims of MCP completeness.

This work should also publish a discovery story that workers can actually use:

- a stable machine-readable HTTP contract such as OpenAPI for product-wide route understanding
- a delegated capability manifest for job-scoped truth about grants, scopes, upload limits, and knowledge access

### 4.6 Add selected worker callback surfaces

The platform should add a controlled callback layer for worker jobs so the system can surface useful results back to the user without granting the worker uncontrolled write access to unrelated rooms or workflows.

This callback layer should support:

- room update publishing
- workflow update publishing
- user notification publishing

Each callback must be bound to the originating job context and subject to message and link safety rules.

Worker-generated artifacts also need a serving-safety policy so active-content outputs do not become a new delivery path for XSS or unsafe downloads inside SmartSpecPro.

### 4.7 Expand Bound Worker eligibility into a runtime-aware model

The UI label `Bound Worker` can remain, but the runtime model must stop assuming only OpenClaw can participate.

The implementation should:

- move eligibility checks toward capability or policy signals such as `supportsBoundConnector`
- preserve OpenClaw as the first production path
- define the extension point for `desktop_zeroclaw_managed` and future runtimes

### 4.8 Preserve truthful MCP positioning

MCP should not be presented as equivalent to HTTP where the codebase still has stubs. Instead, the plan should explicitly deliver:

- HTTP-first execution for high-value production surfaces
- selected MCP improvements only where there is real execution value
- documentation and help text that explain the difference honestly

### 4.9 Treat external content as untrusted

This feature enables autonomous workers that may consume browser results, tool output, skill output, and worker-local execution output. The implementation must treat all of that content as untrusted.

The platform should therefore enforce:

- server-side grants and allowlists that cannot be widened by prompt or tool output
- provider and model allowlists for routes that accept model selection
- callback target binding that does not trust worker-supplied references by default
- active-content artifact handling rules for HTML, SVG, and similar risky outputs

## 5. Resolved defaults for implementation

To keep `deep-implement` from inventing policy values mid-stream, this plan sets the following defaults:

- delegated session TTL default of 10 minutes, with a hard cap of 30 minutes before explicit re-issuance
- no silent delegated-session refresh; the worker must request a new delegated session through the control plane while it still owns the lease
- approved model alias or provider-profile selection only by default; raw provider model IDs remain denied unless a later policy explicitly enables them
- parent-budget overflow denied by default
- callback payloads plain-text only by default, with a 4,000-character summary limit and HTTPS-only external links
- HTML/SVG/script-like artifacts download-only by default until a sanctioned safe viewer or sanitizer exists
- macro-risk office-like artifacts scanned or quarantined first, then download-only by default

Default delegated concurrency ceilings per worker job:

- 4 concurrent lightweight read actions
- 2 concurrent LLM, skill, agency, or job-mutation actions
- 1 concurrent high-cost media generation action
- 1 concurrent MCP write action

Default worker spending-guardrail posture:

- worker time-window caps are optional and unset by default
- SmartSpecPro credit charging always uses the acting user's balance
- there is no separate worker wallet and no tenant-shared delegated wallet in this feature
- the default model is personal workers, so the acting user should also be the worker owner
- worker time-window caps apply to that personal worker's SmartSpecPro-billed delegated usage
- worker time-window caps are additional guardrails on top of acting-user balance checks
- worker count is not the primary safety control
- worker calls to external APIs with their own credentials are outside SmartSpecPro credit accounting unless a later feature explicitly meters them
- shared-worker semantics are out of scope for this feature unless a future spec introduces them explicitly

## 6. Implementation workstreams

### 6.1 Workstream A: contracts, schema, and persistence

Add the shared contracts and storage needed for delegated worker execution.

Likely additions:

- delegated-session records
- worker-job grant records
- delegated budget metadata
- worker owner-user linkage in delegated-session and worker/job records where needed
- delegated capability-manifest contract or equivalent schema
- shared TypeScript schema for delegated worker claims and route metadata

Likely files:

- `apps/web/drizzle/schema.ts`
- new migration files
- `apps/web/shared/*`
- worker runtime shared schema files

### 6.2 Workstream B: worker control-plane delegation endpoints

Extend the worker control-plane routes to issue and revoke delegated sessions.

Likely additions:

- `POST /api/worker-jobs/:jobId/delegated-session`
- internal revocation on lease loss, worker disable, job finalization, or kill-switch changes

Likely files:

- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- new delegated-session service

This workstream should also enforce owner-bound issuance:

- worker owner user ID must match the acting user for the job
- self-service personal worker registration remains the default path
- cross-user and cross-tenant issuance attempts are denied

The issuance path should also expose discovery metadata cleanly:

- session response or companion manifest should tell the worker what surfaces and knowledge access are available
- the manifest should be machine-readable and stable enough for OpenClaw, ZeroClaw, and similar runtimes to consume

### 6.3 Workstream C: public API delegated auth and route enforcement

Introduce a new delegated-worker auth class for `/v1/*` routes, then update route-level access control to respect scopes plus grants plus budget.

Likely files:

- `apps/web/server/middleware/requireScopes.ts`
- `apps/web/server/_core/authz.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/routes/publicSkillsApi.ts`
- `apps/web/server/routes/publicAgencyApi.ts`
- `apps/web/server/routes/publicMediaApi.ts`
- `apps/web/server/routes/publicPresentationsApi.ts`
- `apps/web/server/routes/publicVideoApi.ts`
- `apps/web/server/routes/publicJobsApi.ts`

This workstream should also carry provider/model allowlist enforcement where those routes allow caller-controlled model choice.

It should also cover capability discovery and owner knowledge surfaces:

- delegated-worker access to owner-library and owner-RAG routes where available
- machine-readable publication of stable HTTP route contracts, preferably OpenAPI
- a delegated capability manifest that reflects the real per-job truth rather than only product-wide route availability

### 6.4 Workstream D: downstream billing and audit propagation

Every delegated action must propagate worker-origin metadata into billing and audit systems without flattening the downstream source type into `worker_runtime`.

Likely files:

- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/workerBillingService.ts`
- downstream platform services that create credit transactions
- `apps/web/server/services/auditLogger.ts`

This workstream should also implement worker spending guardrails over rolling windows:

- hourly
- five-hour
- daily
- weekly
- monthly

and define the evaluation order between:

- acting-user credit balance
- worker time-window budgets
- delegated worker-job budget

This workstream should make the personal-worker semantics explicit:

- personal-worker budget windows are guardrails on that worker's usage
- downstream SmartSpecPro charges still land on the acting user who initiated the delegated session, which should match the worker owner in the default model
- worker-owned external API usage remains outside SmartSpecPro charging unless later metered deliberately

This workstream should also preserve correct downstream identity for knowledge operations:

- owner-library reads/searches should keep their real downstream source type
- owner-library or RAG ingestion should keep its real downstream source type

### 6.5 Workstream E: callback and publication flow

Add safe worker callback endpoints and connect them to artifact publication and user-visible result surfaces.

Likely files:

- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerArtifactService.ts`
- room/workflow update services
- monitoring and run-history surfaces that display delegated worker completion data

This workstream should define the safe-serving policy for worker-published active-content artifacts.

It should also connect worker outputs to owner knowledge ingestion safely:

- uploaded files should reuse the existing SmartSpecPro artifact, library, and indexing pipeline
- allowed file classes, file sizes, scanning, and indexing status should be visible to the worker and owner

### 6.6 Workstream F: team binding and runtime expansion

Adjust team binding and worker eligibility so Bound Worker is runtime-aware rather than OpenClaw-hardcoded.

Likely files:

- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/team.ts`
- `apps/web/client/src/pages/Teams.tsx`
- worker registration capability metadata

This workstream should also make the ownership model visible:

- users register their own personal workers
- worker pickers should only show workers owned by the current user
- team binding must not let one user bind another user's worker silently
- admin surfaces may inspect or disable, but not reuse, another user's worker as if it belonged to them

### 6.7 Workstream G: security, observability, and rollout controls

Implement the policy and operator controls that make powerful worker delegation safe enough to ship.

Required controls:

- feature-flag gating
- operator kill switch
- session revocation
- replay protection
- recursion-depth metadata and enforcement
- provider/model policy enforcement
- delegated concurrency ceilings
- untrusted-content and prompt-injection boundaries
- callback rate limits
- audit visibility
- diagnostics visibility

This workstream should also keep capability discovery truthful:

- OpenAPI or equivalent docs should not advertise worker-usable surfaces that delegated policy still blocks
- delegated manifests should not claim MCP, RAG, or upload abilities that are not actually implemented

This workstream should expose worker spending-guardrail state to operators, including:

- current spend by window
- remaining spend by window
- blocked-by-budget status

### 6.8 Workstream H: worker budget management UI

Add user-facing and operator-visible UI to manage worker spending caps and inspect current usage.

Likely files:

- worker fleet services
- admin monitoring routes
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- help and release documentation for worker budget controls

The UI should allow owners or authorized operators to:

- set or clear hourly caps
- set or clear five-hour caps
- set or clear daily caps
- set or clear weekly caps
- set or clear monthly caps
- see current spend and remaining budget for each window
- understand when a worker is blocked by a configured spending guardrail
- see that SmartSpecPro charges still come from the acting user's balance
- understand that worker spending caps are safety guardrails for a personal worker rather than a replacement for the owner's own credit balance

Likely files:

- `apps/web/server/services/featureFlags.ts`
- worker auth and registry services
- admin monitoring routes and pages
- help and operator documentation
- owner-facing worker settings pages or panels

## 7. Delivery phases

### Phase 1: delegation foundation

Deliver the new delegated-session model, the auth classification, the basic grant model, and the revocation rules. This phase should not try to solve every downstream route immediately. Its job is to make the delegation foundation real and safe.

### Phase 2: HTTP-first platform execution

Enable the delegated worker to call the strongest existing `/v1/*` routes with correct billing metadata, budget enforcement, and route-level ownership checks.

### Phase 3: callback and completion visibility

Add worker completion callbacks and make the user-visible result path strong enough that Bound Worker actually feels useful in practice.

### Phase 4: runtime-aware expansion

Generalize Bound Worker eligibility so future runtimes can join without breaking the OpenClaw-first production path.

### Phase 5: selected MCP parity

Replace the highest-value MCP placeholder bridges with real execution paths where it materially improves worker usefulness.

### Phase 6: hybrid autonomous workflows

Use the new delegation model to support end-to-end outcome-oriented worker flows that combine platform and local runtime strengths.

## 8. Error handling and policy rules

### 8.1 Session issuance denial cases

Delegated session issuance should fail when:

- the worker does not hold the active lease
- the job is canceled, failed, expired, or completed
- the worker is disabled or revoked
- the requested scope profile exceeds policy
- the operator kill switch is off

### 8.2 Downstream denial cases

Delegated downstream calls should fail deterministically when:

- scope entitlement is missing
- resource grant is missing
- tenant or team ownership does not match
- acting user and worker owner do not match
- recursion depth exceeds policy
- requested model or provider is outside the delegated allowlist
- delegated concurrency ceilings are exceeded
- worker hourly, five-hour, daily, weekly, or monthly spending guardrail is exhausted
- delegated budget is exhausted

### 8.3 Callback denial cases

Callback publishing should fail when:

- target IDs do not match the originating context
- message payload exceeds policy
- unsafe links are supplied
- idempotency checks indicate replay or spam
- the publication includes active-content artifacts that violate serving policy

## 9. Data and interface design expectations

This plan expects the implementation to define:

- delegated-session claims and storage shape
- worker-job grant records
- a reusable delegated-route authorization helper
- worker-origin billing metadata shape
- callback payload contracts
- runtime eligibility fields or capability flags
- owner-user linkage for personal-worker enforcement

These should be specified as interfaces, route contracts, and schema changes during implementation, but the plan intentionally leaves the exact low-level code details to `deep-implement`.

## 10. Testing strategy

The implementation should be test-first. The earliest tests should validate the security boundary before feature convenience:

1. delegated worker tokens are not treated like generic full-access bearer tokens
2. delegated sessions are lease-bound and become invalid when the lease is lost
3. grants are enforced in addition to scopes
4. delegated budgets prevent over-execution and double charging
5. callback surfaces reject unrelated targets and unsafe links
6. provider/model selections stay inside delegated policy
7. active-content artifacts follow safe-serving rules
8. team binding remains correct while becoming runtime-aware
9. worker time-window spending caps block runaway SmartSpecPro-billed delegated usage when configured
10. acting-user credit balance remains the charging source of truth
11. worker external-API usage outside SmartSpecPro billing surfaces does not consume SmartSpecPro credits automatically
12. personal workers cannot be delegated across users or tenants
13. capability discovery stays truthful through OpenAPI plus delegated manifests
14. owner-library and owner-RAG access stays owner-bound and follows the normal ingestion policy

The plan should use existing Vitest patterns across server, route, and client tests.

## 11. Main implementation risks

### 11.1 Auth confusion risk

If delegated worker auth is not clearly separated from existing bearer logic, the feature could accidentally grant too much access.

Mitigation:

- add a dedicated auth mode
- add route tests around `requireScopes`
- add explicit denylist coverage

### 11.2 Prompt-injection and untrusted-content escalation risk

If browser output, MCP tool output, or worker-generated intermediate content is treated as authority, the worker may be tricked into attempting unsafe actions or unrelated callbacks.

Mitigation:

- keep grants and callback targets server-side
- add untrusted-content regression tests
- require allowlists for provider/model selection and external publishing

### 11.3 Billing drift risk

If the parent worker envelope and downstream source types are not reconciled carefully, the system may undercharge, double-charge, or become opaque to operators.

Mitigation:

- add delegated budget tracking
- add idempotent downstream charging tests
- preserve worker-origin metadata in every downstream credit event

### 11.4 Worker spending-guardrail blind spot risk

If the platform only enforces per-job budget and per-user balance, a malfunctioning worker could still consume credits too aggressively over time windows before operators notice.

Mitigation:

- add rolling worker spend caps
- expose remaining worker window budgets in admin UI
- make budget-block reasons operator-visible and auditable

### 11.5 Runtime assumption risk

If the implementation hardcodes OpenClaw behavior everywhere, the feature will be difficult to extend to ZeroClaw later.

Mitigation:

- express eligibility through capability or policy signals
- isolate OpenClaw-specific behavior to the current production path

### 11.6 MCP parity overclaim risk

If documentation or UX imply full parity before it exists, users will hit incomplete tool flows.

Mitigation:

- ship HTTP-first
- document MCP as selective and evolving
- only expose worker-MCP workflows that have real execution value

### 11.7 Active-content artifact risk

If worker-generated HTML, SVG, or other active-content outputs are published without explicit policy, the feature could introduce unsafe rendering or download behavior.

Mitigation:

- define safe-serving policy as part of result publication
- add artifact-classification tests
- default uncertain artifact classes to safe download or quarantine behavior

### 11.8 Capability-drift and owner-knowledge-scope risk

If OpenAPI, delegated manifests, and real route enforcement drift apart, workers may believe they can use functions or owner knowledge surfaces that are not actually allowed, or gain broader library/RAG scope than intended.

Mitigation:

- publish machine-readable discovery from one canonical source where practical
- keep delegated manifests owner-bound and grant-bound
- add truthfulness tests for discovery outputs
- require normal ingestion controls for owner-library or RAG uploads

## 12. Completion criteria

This plan is complete when implementation can deliver a Bound Worker experience where a user assigns an outcome, the worker performs the necessary platform and runtime work safely, SmartSpecPro records the work and costs accurately, and the user gets a trustworthy result back inside the product without having to manually reproduce the same workflow in the web UI.
