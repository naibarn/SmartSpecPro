# 072 - Claw Worker Platform Access

Version: 1.0
Date: 2026-04-07
Status: Proposed
Depends-on: 071-openclaw-external-runtime-integration, 059-external-worker-provider-framework, 043-PublicAPI-ExternalAgentGateway, 004-desktop-app
Audience: Web Control Plane, Public API, MCP, Teams, Runtime, Billing, Security, QA

---

## 1. Executive summary

Feature 071 made OpenClaw a real external worker class inside SmartSpecPro. It added worker registration, job claim, artifact publication, team binding, and fleet visibility.

However, Feature 071 deliberately stopped at the **worker control plane**.

This follow-on feature adds the next missing layer:

- **delegated platform access** for worker jobs
- **runtime-aware Bound Worker expansion** beyond OpenClaw-only routing
- **worker-driven automation** across LLM, skills, agencies, media, presentations, video projects, and jobs
- **credit-correct platform usage** when workers call SmartSpecPro surfaces
- a clear **HTTP-first / MCP-second** model for production worker execution

The intended result is that a worker becomes a genuinely useful autonomous execution partner, not only a registered remote endpoint.

The most important product meaning of this feature is:

- `Bound Worker` should behave like a delegated worker or delegated worker team that can complete assigned work on the user's behalf
- the user should be able to ask for an outcome and let the worker carry the execution burden
- the user should not need to manually repeat the same operational steps through the normal web UI just to get value from the worker
- the worker is personal to the user who registered it, not a shared worker that other users automatically inherit

---

## 2. Problem statement

Today, the product has three separate truths:

1. Feature 071 already gives us a real worker control plane
2. SmartSpecPro already has real HTTP APIs for LLM, skills, agencies, media, presentations, video projects, and jobs
3. Bound Worker still mostly behaves like a routing decision instead of a high-value execution context

This creates a product gap:

- a team can bind an external connector to a worker
- the run engine can queue worker jobs
- the worker can report progress and artifacts
- but the worker cannot yet safely act like a delegated platform client for that job

The consequence is that worker integration is still weaker than it should be:

- platform capabilities are underused
- local worker runtimes and platform runtimes are not composed together
- Bound Worker is useful, but not yet powerful enough for full autonomous production tasks
- users still have to fall back to clicking through the normal web UI for too much of the actual work

This feature closes that gap.

---

## 3. Goals

1. Introduce a **delegated worker platform session** that lets workers safely call SmartSpecPro APIs during a claimed job.
2. Make `Bound Worker` behave like a delegated operator that can carry out multi-step work on behalf of the user instead of forcing the user to click every step in the normal web UI.
3. Let Bound Worker jobs call the existing platform surfaces with correct credit attribution.
4. Expand Bound Worker semantics from OpenClaw-only routing to a runtime-aware worker model that can later include ZeroClaw and other Claw runtimes.
5. Define a clear API vs MCP strategy so the product uses the strongest available surface instead of forcing one protocol everywhere.
6. Let workers combine:
   - local execution
   - platform execution
   - artifact publication
   - room/workflow callbacks
7. Keep the system safe by separating worker control-plane auth from delegated platform auth.
8. Keep personal-worker ownership explicit: each user registers their own workers, and those workers act only for that same user inside the same tenant.

---

## 4. Non-goals

1. This feature does not replace Feature 071.
2. This feature does not remove the existing worker registry, job queue, or artifact flow.
3. This feature does not make every worker an unrestricted permanent user session.
4. This feature does not promise full MCP parity across all product surfaces in phase 1.
5. This feature does not collapse OpenClaw, ZeroClaw, NemoClaw, and HiClaw into identical runtime semantics.
6. This feature does not force desktop-local GPU/media work through HTTP APIs when worker-local execution is the better path.
7. This feature does not introduce shared department workers or tenant-wide shared workers as the default model.

---

## 5. Current baseline truth

### 5.1 What exists now

Current codebase reality after Feature 071:

- `external_connector` members can bind to a worker through `assistant_profiles.externalWorkerId`
- worker registration and control-plane routes exist under `/api/workers` and `/api/worker-jobs`
- OpenClaw jobs can be queued from the run engine
- worker jobs already support reservation/reconciliation through `worker_runtime`
- SmartSpecPro already exposes real HTTP APIs for:
  - LLM gateway
  - skills
  - agencies
  - media
  - presentations
  - video projects
  - jobs
- MCP exists and is useful for tool access, but not all high-value MCP tools are fully implemented end-to-end

### 5.2 What does not exist yet

- no delegated worker platform session
- no safe worker token specifically meant for `/v1/*` usage
- no full worker-to-platform callback loop for room/workflow updates
- no runtime-aware Bound Worker support beyond `openclaw_gateway`
- no clear product contract for "worker as a web-equivalent automation client"

### 5.3 Current Bound Worker meaning

Today, `Bound Worker` means:

- route external connector follow-up work to a specific worker

Today it does **not** mean:

- automatic API access
- automatic MCP access
- automatic skill/media/swarm rights
- full user-equivalent platform access

This distinction must remain explicit in the design.

---

## 6. Locked architectural decisions

### 6.1 Bound Worker is a delegated operator, not a passive route

The product promise of `Bound Worker` is not merely "send the job to another runtime."

The intended meaning is:

- the worker acts like a delegated operator or delegated team member for the assigned outcome
- the worker may plan and execute multiple steps across platform and local tools
- the worker should reduce or remove the need for the user to manually drive the same steps through the normal web interface

The security boundary is still important:

- the worker acts on behalf of the user only within the delegated job context
- the worker is not a permanent unrestricted clone of the user's full account
- every powerful action still depends on policy, grants, budget, and auditability

### 6.2 Binding is routing, delegation is auth

`Bound Worker` remains a routing concept.

It must not automatically become:

- a browser session
- a permanent API session
- a blanket bearer token with full user power

If a worker needs platform access, it must receive a separate delegated session.

### 6.3 Two execution planes

Workers must support two different execution planes:

#### A. Platform execution

Use SmartSpecPro's existing platform services for:

- LLM gateway
- skills
- agencies
- media generation
- presentations
- video projects
- jobs

#### B. Worker-local execution

Use the worker's own machine/runtime for:

- local GPU
- ffmpeg
- ComfyUI
- local file access
- runtime-native tools
- worker-native agent skills

### 6.4 Hybrid execution is the target

The product must allow one worker job to combine:

- local execution
- platform execution
- artifact publication

This is the key to making workers genuinely useful.

### 6.5 HTTP-first, MCP-second

For production worker automation:

- HTTP APIs are the preferred primary surface for platform actions that already exist as durable public APIs
- MCP is the preferred tool/workspace/browser surface where MCP semantics fit best

This feature must not overstate MCP parity where the current codebase still uses placeholder delegation.

### 6.6 Runtime-aware Bound Worker expansion

The field name `Bound Worker` can remain in the UI, but the underlying product model must become runtime-aware.

Recommended rule:

- a worker may be eligible for binding only if it advertises `supportsBoundConnector = true` or an equivalent capability/policy signal

Initial target runtimes:

- `openclaw_gateway`
- `desktop_zeroclaw_managed` later in this feature family

### 6.7 Personal-worker ownership model

This feature should treat worker registration and usage as a self-service personal-worker flow.

Required rules:

- a normal end user registers their own worker
- admin involvement is not required for the normal add-worker path
- a worker is owned by the user who registered it
- a personal worker may receive delegated platform sessions only for jobs requested by that same owner user
- the platform may allow admins to observe, disable, or investigate workers for safety reasons, but not to silently repurpose one user's worker for another user

### 6.8 No cross-user and no cross-tenant delegation

Personal workers must remain tightly owner-bound and tenant-bound.

Required rules:

- a worker must not receive delegated access for another user in the same tenant
- a worker must not access another user's rooms, chats, workflows, files, connectors, skills, or artifacts unless that access is already represented inside the owner's delegated job context and normal product authorization
- a worker must never cross tenant boundaries
- delegated sessions must be denied if `actingUserId` does not match the worker owner's user ID
- delegated sessions must be denied if the worker tenant and job tenant do not match exactly

Future runtimes may join later:

- `nemoclaw_sandbox`
- `hiclaw_cluster`

### 6.9 Credit truth must remain service-accurate

When a worker calls platform services, the system must preserve:

- the parent worker job context
- the real downstream service billing type

This means:

- the parent worker assignment still tracks as `worker_runtime`
- downstream calls still track as their true source types such as:
  - `api_chat`
  - `api_skill`
  - `api_agency`
  - `api_media`
  - `api_video_project`
  - `api_mcp`

Worker context must be attached in metadata rather than flattened into one opaque source type.

### 6.10 Control-plane tokens and delegated platform tokens must be separate

The following token classes must be distinct:

- worker registration token
- worker control-plane execution token
- worker upload token
- delegated worker platform token
- browser/session auth
- API key auth

No single token should cover all of these responsibilities.

### 6.11 Product-surface allowlist and denylist

This feature is about worker access to **production work surfaces**, not all possible web-user actions.

Workers may eventually be delegated access to surfaces such as:

- LLM gateway
- skills
- agencies
- media
- presentations
- video projects
- jobs
- selected MCP tools

Workers must **not** receive delegated access to:

- tenant settings
- admin monitoring mutation surfaces that are unrelated to the claimed worker job
- billing admin actions
- user profile management
- API key management
- auth/session/device-management endpoints
- feature-flag management
- destructive library or workspace actions unless those are explicitly granted by job policy

This denylist must be treated as a locked default.

### 6.12 Delegation must be lease-bound, not merely job-bound

A delegated platform session must only be issuable when all of the following are true:

- the worker currently holds the active lease for the worker job
- the worker is not revoked
- the worker is not disabled
- the worker job is still in a state that allows downstream execution
- the requested delegated scopes fit the job policy and runtime profile

Loss of lease ownership must invalidate the delegated session.

### 6.13 Resource access must be grant-based

Scopes alone are not enough.

Delegated worker sessions must also carry resource grants or equivalent server-side grant records for the specific job.

Examples of resource grants:

- allowed skill IDs
- allowed agency IDs
- allowed library item IDs
- allowed presentation deck IDs
- allowed video project IDs
- allowed job types
- allowed room/workflow target IDs
- allowed MCP server IDs or tool namespaces
- allowed workspace roots or drive scopes when relevant
- allowed model families, model IDs, or provider profiles when the worker calls LLM or media surfaces

Workers must not inherit broad tenant-wide visibility just because they have a delegated session.

### 6.14 Recursive worker spawning must be bounded

Workers that can run skills, agencies, jobs, or MCP tools must not be allowed to create uncontrolled recursive execution loops.

This feature must include:

- hop-count or recursion-depth tracking
- worker-origin metadata propagation
- policy to deny or require approval when a worker-triggered action would create another worker-triggered action beyond the allowed depth

### 6.15 Publishing and notifications are privileged actions

Publishing a room update, workflow update, or user notification is not a free-form surface.

These actions must be bound to:

- the originating job context
- allowed target IDs
- message-size limits
- plain-text or safely sanitized rich-text policy
- URL allowlist or safe-link policy
- idempotency controls

Workers must not be able to post arbitrary uncontrolled messages into unrelated rooms or workflows.

### 6.16 External content and tool output are untrusted

Workers may consume:

- web research results
- browser snapshots
- MCP tool output
- skill output
- agency output
- worker-local tool output

All of these must be treated as untrusted data, not as authority.

This means:

- untrusted content must not expand scopes, grants, or callback targets
- untrusted content must not override worker policy or tenant policy
- downstream action selection must continue to enforce server-side grants and allowlists
- prompt injection resistance must be treated as a product requirement, not only an implementation detail

---

## 7. Product model

### 7.1 Worker as a digital operator

In product terms, a `Bound Worker` should be treated like a digital operator that can take an assignment such as:

- research this topic
- write the article
- generate the supporting images
- assemble the presentation
- build the video
- publish the outputs back into SmartSpecPro

The user should be able to request the outcome and let the worker carry the operational burden.

This does **not** mean the worker gets unlimited rights.

It means the worker receives:

- a job
- a delegated working context
- scoped access to the tools and resources needed for that job
- a requirement to return traceable results back to the system

### 7.2 Worker execution profiles

Workers should advertise one of these profiles:

- `router_only`
- `gateway_client`
- `local_executor`
- `hybrid_executor`
- `sandbox_executor`

Meaning:

- `router_only`: can receive jobs but cannot call platform services or do rich local execution
- `gateway_client`: can call SmartSpecPro platform services through delegated auth
- `local_executor`: runs local work but does not depend heavily on SmartSpecPro APIs
- `hybrid_executor`: can do both local and platform execution
- `sandbox_executor`: like hybrid, but under stricter security policy

### 7.3 Capability families

Add or normalize worker capability families such as:

- `llm-gateway-client`
- `skills-client`
- `agencies-client`
- `media-client`
- `presentation-client`
- `video-project-client`
- `jobs-client`
- `library-client`
- `rag-search-client`
- `rag-ingest-client`
- `mcp-client`
- `worker-native-skill-runtime`
- `browser-automation`
- `gpu-nvidia`
- `video-edit`
- `comfyui-image`
- `comfyui-video`
- `local-file-access`
- `artifact-publisher`

### 7.4 Recommended new job types

The worker fabric should support typed job classes such as:

- `worker_skill_run`
- `worker_skill_chain`
- `worker_research_publish`
- `worker_media_pipeline`
- `worker_presentation_build`
- `worker_video_build`
- `worker_local_gpu_task`
- `worker_browser_research`
- `worker_hybrid_content_pipeline`

These job types should coexist with the current OpenClaw job types rather than replacing them all at once.

---

## 8. Delegated platform access model

### 8.1 New concept: delegated worker platform session

When a worker claims a job, the control plane may issue a short-lived delegated session that allows the worker to call SmartSpecPro platform surfaces for that specific job.

Recommended endpoint:

- `POST /api/worker-jobs/{job_id}/delegated-session`

Response should include:

- delegated bearer token
- allowed scopes
- expiration
- maximum credits or budget envelope
- acting tenant/user context
- worker ID
- worker job ID
- allowed platform surfaces
- delegated resource grants
- revocation conditions
- session correlation metadata

### 8.1.1 Session issuance rules

The delegated session endpoint must:

- require the worker's control-plane execution token
- verify active lease ownership
- verify worker/job/tenant alignment
- verify worker owner / acting user alignment
- verify the worker has not been revoked, disabled, or drained out of eligibility for the requested action class
- deny issuance if the job is canceled, failed, expired, or already finalized

The endpoint should be idempotent for the same live lease and action envelope, but it must not create effectively unbounded parallel delegated sessions for the same worker job.

### 8.1.2 Session revocation triggers

Delegated sessions must be revoked or treated as invalid when:

- the worker lease expires or is replaced
- the worker is revoked
- the worker is disabled
- the worker job is canceled, failed, expired, or completed
- the job budget envelope is exhausted
- the operator kill switch for delegated worker access is turned off

### 8.2 Required token claims

Recommended claims:

- `aud = "smartspec-worker-gateway"`
- `tokenUse = "worker_gateway_delegate"`
- `tenantId`
- `userId`
- `ownerUserId`
- `workerId`
- `teamId`
- `workerJobId`
- `boundProfileId`
- `runtimeType`
- `scopes`
- `maxCredits`
- `leaseId` or equivalent lease fingerprint
- `grantSetId` or equivalent resource-grant reference
- `jti`
- `traceId`
- `originSurface = "worker_runtime"`
- `recursionDepth`
- `issuedAtPolicyVersion`

Claims must be sufficient for the server to reject header spoofing and resource confusion without relying on caller-supplied tenant or user headers.

### 8.3 Allowed platform scopes

Scopes should be explicit, not implied.

Examples:

- `llm:chat`
- `skills:list`
- `skills:execute`
- `agencies:list`
- `agencies:invoke`
- `media:generate`
- `presentations:create`
- `video_projects:create`
- `jobs:create`
- `jobs:read`
- `library:read`
- `library:search`
- `library:upload`
- `rag:search`
- `rag:ingest`
- `mcp:read`
- `mcp:write`

### 8.3.1 Scope profiles

Define explicit delegated scope profiles instead of issuing arbitrary scope sets ad hoc.

Recommended starter profiles:

- `worker_gateway_readonly`
- `worker_gateway_content_creator`
- `worker_gateway_researcher`
- `worker_gateway_media_operator`
- `worker_gateway_hybrid_executor`

Each profile should map to:

- allowed HTTP routes
- allowed MCP tool namespaces
- allowed action classes
- maximum budget envelope
- allowed providers or model families where relevant
- concurrency ceiling
- whether publishing callbacks are allowed

### 8.3.2 Default delegated policy values

To reduce implementation ambiguity, this feature sets the following defaults for phase 1 and phase 2:

- delegated session TTL default: `10 minutes`
- delegated session TTL hard maximum without re-issuance: `30 minutes`
- refresh model: no silent refresh; the worker must request a new delegated session through the worker control plane while it still owns the lease
- model selection default: only SmartSpecPro-approved model aliases or approved provider profiles are allowed; raw provider model IDs are denied by default
- overflow policy default: deny delegated execution that would exceed the parent reservation unless an explicit operator policy allows controlled overflow reconciliation

Default concurrency ceilings per worker job:

- read-only or lightweight route actions: up to `4` concurrent in-flight calls
- LLM, skills, agency, or job mutation actions: up to `2` concurrent in-flight calls
- high-cost media generation actions: up to `1` concurrent in-flight call
- MCP write actions: up to `1` concurrent in-flight call unless a stricter policy applies

Default approval gates:

- any single delegated action above the operator-configured per-action credit threshold
- any external publishing outside SmartSpecPro-owned destinations
- any destructive library or workspace mutation
- any model or provider request outside the default allowlist

### 8.4 Scope enforcement rule

Public API middleware must distinguish:

- browser session auth
- API key auth
- delegated worker bearer auth

Delegated worker bearer auth must **not** rely on the current generic "bearer bypasses scope checks" behavior.

This feature should introduce a more explicit auth classification so delegated worker tokens are scope-checked correctly.

### 8.5 Resource grant model

Introduce a job-scoped resource-grant model.

Recommended storage and contract:

- `worker_job_grants`
  - `id`
  - `worker_job_id`
  - `tenant_id`
  - `grant_type`
  - `resource_id`
  - `resource_scope_json`
  - `created_at`
  - `expires_at`

Recommended grant types:

- `skill`
- `agency`
- `library_item`
- `library_search_scope`
- `library_upload_policy`
- `presentation`
- `video_project`
- `job_type`
- `rag_scope`
- `mcp_server`
- `room_target`
- `workflow_target`
- `workspace_scope`

Every delegated action must validate both:

- scope entitlement
- resource grant

### 8.6 Worker-to-platform session budget enforcement

The delegated session must not only describe `maxCredits`; it must be enforceable.

Required behavior:

- reserve or bind a budget envelope to the worker job
- decrement remaining delegated budget as downstream calls succeed
- reject downstream calls when the budget envelope is exhausted
- preserve idempotency for retried downstream calls
- expose remaining delegated budget in operator-visible diagnostics

Budget exhaustion must be a first-class error state, not an implicit failure.

### 8.6.1 Worker-to-platform session concurrency enforcement

Delegated sessions must also have a concurrency and rate profile.

Required behavior:

- enforce a maximum number of in-flight delegated actions per worker job
- enforce stricter ceilings for high-cost generation routes when needed
- reject or queue delegated actions when concurrency ceilings are exceeded
- expose current delegated concurrency state to operators

Budget caps alone are not sufficient protection against runaway delegated execution.

### 8.6.2 Worker spending guardrails over time windows

In addition to per-job delegated budgets, the platform must support optional worker spending guardrails across rolling time windows for SmartSpecPro-billed usage.

Required windows:

- hourly
- five-hour
- daily
- weekly
- monthly

Each window must support:

- explicit credit cap
- or `unlimited / not set`

Required behavior:

- evaluate worker spending before allowing another SmartSpecPro-billed delegated downstream action
- reject delegated execution when the relevant worker window budget is exhausted
- expose current spend and remaining budget for each active window to operators
- surface the denial reason clearly as worker spending guardrail exhaustion
- treat these windows as per-worker guardrails for that worker's SmartSpecPro-billed delegated usage

### 8.6.3 Credit charging source of truth

SmartSpecPro credit charging for delegated worker actions must always be based on the acting user tied to the delegated session.

This means:

- credit-balance availability checks use the acting user's current SmartSpecPro credit balance
- downstream SmartSpecPro-billed usage deducts from that acting user's credit balance
- there is no separate worker credit wallet and no tenant-level shared wallet for delegated charging in this feature
- in the default personal-worker model, the acting user must be the same user who owns the worker
- worker spending guardrails are an additional protection layer on top of user balance checks
- worker count itself is not the primary protection mechanism

When a worker uses external APIs or providers with its own credentials outside SmartSpecPro billing surfaces:

- those calls are outside this credit model
- those calls must not deduct SmartSpecPro user credits automatically
- those calls must not consume worker spending guardrail quotas unless the product later adds explicit metering for them
- those calls may continue to run normally even when SmartSpecPro worker budgets or SmartSpecPro user credits would block SmartSpecPro-billed paths

### 8.6.4 Worker budget UI requirements

The product must include operator-facing UI to manage worker spending guardrails.

Minimum UI requirements:

- set or clear hourly worker credit cap
- set or clear five-hour worker credit cap
- set or clear daily worker credit cap
- set or clear weekly worker credit cap
- set or clear monthly worker credit cap
- display current spend and remaining budget for each active window
- show whether a worker is currently blocked by a time-window budget
- explain that SmartSpecPro credits are still charged against the acting user's balance
- explain that worker budgets are safety guardrails for that personal worker and do not replace the owner's own SmartSpecPro credit balance

These controls should live with worker administration surfaces, not be hidden only in config or database-only paths.

---

## 9. HTTP vs MCP strategy

### 9.1 Preferred now

Use HTTP APIs as the primary surface for:

- `/v1/chat/completions`
- `/v1/responses`
- `/v1/skills/*`
- `/v1/agencies/*`
- `/v1/media/*`
- `/v1/presentations/*`
- `/v1/video-projects/*`
- `/v1/jobs/*`
- owner-library and owner-RAG HTTP surfaces

### 9.2 Preferred MCP usage

Use MCP as the primary surface for:

- workspace tools
- file/drive tools
- browser action tools
- interactive tool discovery
- future tool composition where MCP parity is real

### 9.3 Explicit rule for media and high-cost generation

In the initial phase of this feature:

- image/video/audio generation should use HTTP APIs
- MCP media tools may remain secondary until their execution path is fully real

### 9.4 Capability discovery contract

Workers such as OpenClaw, ZeroClaw, and future Claw runtimes must not be forced to guess which SmartSpecPro functions are available.

This feature should provide two discovery layers:

#### A. Static platform contract

For stable HTTP platform surfaces, SmartSpecPro should publish a machine-readable contract such as OpenAPI.

This contract should describe:

- available route families
- request and response shapes
- auth mode expectations
- idempotency requirements where relevant
- error shapes
- file upload semantics where relevant

#### B. Delegated runtime manifest

OpenAPI alone is not enough because each worker job may have different scopes, grants, budgets, feature flags, and owner-bound resource access.

The delegated worker flow should therefore expose a job-scoped capability manifest, either:

- directly in the delegated-session response
- or through a companion endpoint such as `GET /api/worker-jobs/{job_id}/delegated-manifest`

The delegated manifest should tell the worker exactly what is usable for that job and owner context, including:

- allowed HTTP route families
- allowed MCP namespaces
- allowed scope profile
- allowed provider profiles or model aliases
- allowed skills and agencies when preselected
- owner-library and owner-RAG access capabilities
- upload limits, file-type allowlists, and size limits
- callback targets that are permitted
- whether the current implementation surface is production-ready, experimental, or unavailable

Workers should treat the delegated manifest as the runtime truth for the current job, while OpenAPI remains the broader product contract for HTTP integration.

---

## 10. Billing and credit model

### 10.1 Parent job accounting

The worker assignment itself remains tracked through:

- `worker_runtime`

This covers:

- orchestration reservation
- worker job ownership
- reconciliation at worker-job level

### 10.2 Downstream platform accounting

When the worker calls platform services, those requests must keep their true downstream source types.

Examples:

- worker uses LLM gateway -> `api_chat`
- worker runs a skill -> `api_skill`
- worker runs an agency -> `api_agency`
- worker generates media -> `api_media`
- worker creates a video project -> `api_video_project`
- worker calls MCP -> `api_mcp`

### 10.3 Required downstream metadata

Each downstream transaction should carry metadata such as:

- `originSurface = "worker_runtime"`
- `workerId`
- `workerJobId`
- `runtimeType`
- `boundProfileId`
- `delegatedByUserId`
- `traceId`
- `leaseId`
- `delegatedSessionId`
- `recursionDepth`

### 10.4 Why this is required

This preserves:

- correct finance/accounting truth
- cost analysis by product surface
- roll-up by worker job for operator visibility

### 10.5 Budget reconciliation rules

This feature must define how delegated worker platform usage and parent worker-job reconciliation interact.

Required rules:

- the parent worker job reservation remains the outer envelope
- downstream API/MCP actions consume budget from the delegated worker-job envelope
- retries must not double-charge
- canceled or failed downstream actions must follow the same idempotency and refund policies as their existing platform surfaces
- overflow beyond the parent reservation must be denied by default, and only reconciled when an explicit operator policy enables controlled overflow

### 10.6 Worker guardrails and user balance interaction

Worker spending guardrails and user credit balance checks must both be enforced for SmartSpecPro-billed actions.

The decision order should be deterministic:

1. the acting user has enough SmartSpecPro credits
2. worker time-window budgets allow the action
3. worker-job delegated budget allows the action
4. route, grant, and policy checks allow the action

Multiple workers may exist without an artificial platform fleet-size cap.

Each user may register multiple personal workers, but each worker remains owner-bound.

The financial protections are:

- per-user acting-user credit balance
- worker time-window spending guardrails
- worker-job delegated budget

Worker calls to external APIs outside SmartSpecPro billing surfaces are not part of this credit model.

---

## 11. Result publication model

### 11.1 Worker outputs must return to SmartSpecPro

Workers must be able to:

- upload artifacts
- publish or link library items
- attach result metadata
- post a user-facing completion summary back into the originating surface

Artifacts that may contain active content must follow explicit serving policy.

Examples:

- HTML
- SVG
- downloadable script bundles
- office-like formats with macro or active-content risk

The platform must define whether these are:

- sanitized
- rendered through a safe viewer
- forced to download only
- quarantined pending policy or scanning

Default active-content policy:

- HTML, SVG, and script-like bundles: `download-only` by default in early phases
- office-like formats with macro or active-content risk: `quarantine or scan first`, then `download-only` unless a safer viewer exists
- only explicitly sanitized or viewer-supported artifact classes may be inline-rendered

### 11.2 New callback surfaces

Recommended endpoints:

- `POST /api/worker-jobs/{job_id}/publish-room-update`
- `POST /api/worker-jobs/{job_id}/publish-workflow-update`
- `POST /api/worker-jobs/{job_id}/publish-user-notification`

These callbacks should let the worker send:

- summary text
- artifact links
- presentation link
- video link
- external dashboard link if relevant

### 11.2.1 Callback safety rules

Callback endpoints must enforce:

- target binding to the originating room/workflow/user context
- idempotency keys
- plain-text by default, or safely sanitized rich text if explicitly enabled
- maximum message length
- allowed URL schemes
- artifact-link validation against SmartSpecPro-owned or explicitly allowed destinations
- anti-spam rate limits per worker job

Default callback limits:

- payload format: plain text only by default
- maximum summary length: `4,000` characters
- maximum link count: `10`
- allowed external URL scheme: `https` only
- external dashboard domains: admin allowlist only
- default worker-job callback rate ceiling: `10` publishes per `10` minutes

External dashboard links should be treated as secondary convenience links, not as the system of record.

### 11.3 Acceptance target

When a worker completes a content workflow, the user should receive:

- a success/failure status
- a readable summary
- links to outputs
- access to published artifacts in SmartSpecPro

### 11.4 Owner library and RAG access

This feature should let a personal worker use the owning user's SmartSpecPro knowledge surfaces when the delegated scope profile and grants allow it.

Required capabilities:

- read the owner's allowed library items
- search the owner's allowed library and RAG scope
- perform owner-bound vector search or semantic retrieval
- retrieve chunk or document references needed for downstream work
- upload new files into the owner's library/RAG ingestion flow when the file class is allowed

Required rules:

- all knowledge access stays bound to the worker owner and the same tenant
- the worker must not read another user's private library or private RAG data
- upload should reuse the existing artifact, library, and indexing pipeline rather than writing directly into vector storage through a side channel
- file types, file sizes, malware scanning, and indexing policy must follow the normal SmartSpecPro ingestion rules
- upload success should return artifact or library references plus indexing status

This keeps worker knowledge access useful without breaking the existing SmartSpecPro system of record.

---

## 12. ZeroClaw and future runtime fit

### 12.1 ZeroClaw position

Feature 071 kept Bound Worker focused on OpenClaw first.

This feature must avoid encoding OpenClaw-only assumptions that would block ZeroClaw later.

Recommended product rule:

- ZeroClaw may participate when it can advertise:
  - `supportsBoundConnector = true`
  - `gateway_client` or `hybrid_executor`
  - the required capability families for the assigned work

### 12.2 Why this matters

The user goal is not merely "OpenClaw support."

The broader goal is:

- Claw-family runtimes become useful workers inside SmartSpecPro

So the design must remain open to:

- OpenClaw as remote agent runtime
- ZeroClaw as local/hybrid runtime
- future secure or collaborative runtimes later

---

## 13. Security model

### 13.1 Non-negotiable rules

1. Control-plane tokens must not become general platform tokens.
2. Delegated platform sessions must be short-lived and scoped.
3. Platform actions must stay tenant-safe and auditable.
4. Workers must not receive unrestricted permanent user rights.

### 13.2 Required protections

- token audience separation
- token use separation
- explicit scope allowlists
- per-job budget caps
- tenant and team ownership checks
- audit logs for delegated calls
- revocation support
- kill switch support
- safe callback destinations
- SSRF protections for worker-supplied URLs
- replay protection for delegated sessions
- lease-loss invalidation
- resource-grant enforcement
- owner-library and owner-RAG grant enforcement
- provider and model allowlists where routes support model selection
- delegated concurrency ceilings
- recursion-depth enforcement
- prompt-injection and untrusted-tool-output boundaries
- active-content artifact serving policy
- upload file-type, file-size, and scanning enforcement for owner knowledge ingestion
- explicit action-class approval gates for high-risk operations

### 13.2.1 Approval-gated action classes

The following action classes should require explicit policy enablement and, by default, should be denied or approval-gated:

- destructive file or library mutations
- broad library or RAG export outside the delegated grant scope
- external publishing outside SmartSpecPro-owned destinations
- high-credit-budget media or swarm runs above tenant policy thresholds
- MCP write operations outside the job's resource grants
- model or provider selection outside the job's allowlist
- any action that would manage credentials, settings, billing, or auth state

### 13.2.2 Secrets model

Workers must never receive raw provider secrets or tenant secrets merely because they have delegated platform access.

Recommended rule:

- platform-managed providers stay behind SmartSpecPro's gateway
- worker delegated sessions call the gateway
- local runtime secrets remain local to the worker only when explicitly configured for local execution modes
- secrets must never be echoed into standard logs, callbacks, or artifact metadata
- delegated sessions must not reveal hidden provider routing or secret-bearing internal headers back to the worker

### 13.2.3 Audit and observability requirements

Every delegated worker platform action must emit auditable records that include:

- tenant ID
- worker ID
- worker job ID
- delegated session ID
- acting user ID
- owner user ID
- requested surface
- requested action
- granted scopes
- grant set or resource grant ID
- credits used
- result status
- trace ID

Operators must be able to answer:

- which worker performed the action
- on whose behalf it acted
- what it touched
- what it cost
- why it was allowed

### 13.2.4 Retention defaults

Default retention behavior for delegated-worker security records:

- delegated-session records: retain at least `30 days` after expiry or revocation
- worker-job grant records: retain at least `30 days` after job finalization
- delegated callback audit records: follow normal audit retention, but never store raw secrets
- high-risk denied actions: retain audit evidence long enough for incident review under platform audit policy

### 13.3 MCP security note

Delegated worker sessions that use MCP must still obey:

- `mcp:read` vs `mcp:write`
- tool-level scope checks
- tenant feature flags
- write-tool policy restrictions

MCP delegated worker sessions must also validate resource grants for:

- allowed tool namespaces
- allowed MCP server IDs
- allowed workspace or drive scopes

MCP or tool output must not be treated as policy authority for further delegated actions.

---

## 14. Suggested implementation phases

### Phase 1 — Delegated session foundation

Deliver:

- delegated worker platform session endpoint
- explicit token audience and token use
- auth middleware classification for worker-delegated bearer tokens
- audit and trace metadata
- lease-bound issuance and revocation
- resource-grant model foundation
- operator kill switch and feature-flag gating for delegated worker access

### Phase 2 — HTTP-first worker platform client

Deliver:

- worker-driven access to:
  - LLM gateway
  - skills
  - agencies
  - media
  - presentations
  - video projects
  - jobs
- correct downstream billing metadata
- budget-envelope enforcement
- worker spending-guardrail enforcement
- callback-safe result publishing foundation

### Phase 3 — Callback and publish flow

Deliver:

- room/workflow update callbacks
- artifact link publishing
- user-visible result summaries

### Phase 4 — Runtime-aware Bound Worker expansion

Deliver:

- binding eligibility model beyond OpenClaw-only assumptions
- initial path for ZeroClaw participation where appropriate

### Phase 5 — Real MCP parity for selected surfaces

Deliver:

- remove placeholder MCP bridges where they block real worker value
- implement real high-value MCP tool execution selectively

### Phase 6 — Hybrid local + platform automation

Deliver:

- complex autonomous flows such as:
  - research -> article -> image -> presentation
  - research -> script -> video -> publish artifact
  - local GPU generation + platform publication

---

## 15. Acceptance criteria

This feature is considered successful when all of the following are true:

### 15.1 Delegated access

- a claimed worker job can obtain a delegated platform session
- that session is tenant-safe, scoped, revocable, and short-lived
- that session becomes invalid when lease ownership is lost
- that session cannot access resources outside explicit grants
- that session is denied unless the acting user matches the worker owner

### 15.2 Platform execution

- a worker can call at least the following with delegated auth:
  - `/v1/chat/completions` or `/v1/responses`
  - `/v1/skills/:skillId/execute`
  - `/v1/agencies/:agencyId/invoke`
  - `/v1/media/images/generate`
  - `/v1/media/videos/generate`
  - owner-library and owner-RAG read/search surfaces

### 15.3 Credit correctness

- worker-parent job usage remains visible as `worker_runtime`
- downstream platform usage remains visible as its real source type
- downstream records include worker-origin metadata
- delegated budget exhaustion prevents further downstream execution
- retried delegated calls do not double-charge
- worker hourly/five-hour/daily/weekly/monthly limits block further SmartSpecPro-billed delegated execution when configured
- acting-user credit balance remains the balance source of truth for SmartSpecPro-billed worker actions
- there is no worker-level wallet and no tenant-level wallet for delegated charging
- personal-worker usage remains charged to the worker owner's SmartSpecPro balance through the acting-user identity
- external API usage by the worker outside SmartSpecPro billing surfaces is not auto-charged against SmartSpecPro credits

### 15.4 Ownership safety

- a user can self-register one or more personal workers without requiring admins to create them first
- a personal worker cannot receive delegated access for another user
- a personal worker cannot cross tenant boundaries
- binding and delegated-session issuance fail safely when owner, acting user, or tenant alignment is missing

### 15.5 Capability discovery

- a worker can obtain machine-readable guidance about what platform functions are available
- stable HTTP surfaces are documented through OpenAPI or an equivalent machine-readable contract
- job-scoped delegated access is documented through a delegated capability manifest
- the delegated manifest tells the worker what routes, scopes, skills, agencies, knowledge access, and upload limits are actually usable for that job

### 15.6 User-visible usefulness

- a worker can publish a summary and links back to the originating room/workflow
- a user can see that the worker actually produced usable outputs
- a user can assign an outcome and allow the worker to execute the necessary steps without manually reproducing those steps through the normal web UI
- callback endpoints reject unrelated targets or unsafe link payloads

### 15.7 Runtime extensibility

- the model does not block ZeroClaw from joining later through the same worker fabric

### 15.8 Truthful protocol positioning

- HTTP platform surfaces are documented as the primary execution plane where they are already real
- MCP is documented honestly where parity is still incomplete

### 15.9 Knowledge usefulness

- the personal worker can search the owner's allowed library or RAG scope when granted
- the personal worker can upload allowed files into the owner's library/RAG ingestion flow
- vector-search and ingestion flows stay owner-bound, tenant-bound, and auditable

### 15.10 Security regression gates

- delegated worker tokens are scope-checked even when they use bearer auth
- delegated worker tokens cannot reach admin/account/billing/auth-management surfaces
- revoked or disabled workers cannot mint or keep delegated sessions
- resource-grant violations are rejected deterministically and audited
- delegated workers cannot invoke disallowed model/provider selections or exceed delegated concurrency ceilings
- active-content artifacts from worker flows follow explicit safe-serving policy

---

## 16. Final recommendation

Feature 071 should remain the worker-control-plane feature.

Feature 072 should become the **worker platform usefulness feature**.

Its job is to ensure that Bound Worker is no longer just a routing hint, but a secure and productive delegated execution model that can:

- act like a delegated worker or worker team on behalf of the user
- use SmartSpecPro platform capabilities
- use worker-local runtime strengths
- publish meaningful outputs back to users
- charge credits correctly
- scale beyond OpenClaw to ZeroClaw and future Claw-family runtimes
