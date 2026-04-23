# Feature 105 - Work OS + Team Orchestrator Unified Automation

Version: 1.3
Date: 2026-04-21
Status: Draft
Depends-on: 101-openai-agents-sdk-chat-team-orchestration, 103-obsidian-inspired-md-knowledge-vault, 104-md-knowledge-vault-production-readiness
Audience: Product, Work OS, Team Orchestrator, Chat/Memory, Library, Skills, Workflow, Agency, Media, Data, Security, QA, Operations

---

## 1. Executive Summary

SmartSpecPro already has most of the hard pieces required for a serious automation platform:

- Work OS intake and reviewed launch
- Team room orchestration and run monitoring
- chat conversations and memory
- knowledge-vault context packs
- media generation and video editing
- skill marketplace and skill maintenance
- agency swarm plus ADK hybrid execution
- workflow execution via LangGraph
- workpack replay, readiness, and learning

What it does not yet have is a unified automation brain.

Today, the system can launch automation, but it still behaves as if each subsystem is mostly independent. The Team layer does not consistently see the full set of upstream context or the full set of execution capabilities before it starts planning.

Feature 105 introduces a new architecture where:

1. a user reviews and confirms a work request,
2. the platform compiles a governed work brief from chat, memory, documents, and prior operational evidence,
3. a capability planner chooses the best mix of skills, workflows, agency runs, media steps, document steps, and editing steps,
4. the user reviews that preflight plan,
5. Team executes from a constrained execution graph instead of a thin prompt,
6. successful patterns feed back into workpack and skill-improvement systems.

The result should be a system that remains safe and reviewable, while becoming much more automatic after launch approval.

---

## 2. Problem Statement

### 2.1 Work intake is too disconnected from upstream thinking

Work OS request records can already link conversations, workpacks, and role-routine runs, but the default intake UX does not elevate those sources into an explainable preflight brief. Users still have to manually carry thinking from chat into a request.

### 2.2 Team planning starts from too little structured context

`runEngine` can build and review an auto-team plan, but it primarily starts from room goal text plus room work items. That is not enough for a platform whose best context may live in:

- linked chat conversations
- memory summaries
- knowledge-vault packs
- prior workpack replay and readiness signals
- attached files and project documents
- previously improved skills

### 2.3 Capability selection is fragmented

The platform already supports many execution surfaces, but they are not described and chosen through one shared planning model. Today:

- Team skill routing still relies heavily on heuristics
- automation policy is content-production-centric
- workflow and skill-maintenance surfaces are not first-class launch targets
- media, workflow, agency, and document surfaces are not evaluated together through one capability graph

### 2.4 The system does not yet learn from repeated Team success well enough

The repo already has workpack replay, readiness, promotion, and skill-improvement logic. Team automation should feed those systems automatically so repeated successful orchestration becomes a reusable asset rather than repeating freeform execution forever.

---

## 3. Goals

### 3.1 Product goals

- Keep request creation review-first and human-confirmed.
- Let users start automation from a richer, explainable work brief.
- Make Team orchestration capability-aware across chat, docs, skills, workflows, agency runs, media, and video surfaces.
- Make preflight planning reviewable before a costly run starts.
- Make post-run learning feed workpack and skill-improvement loops.

### 3.2 Architecture goals

- Reuse existing code paths wherever practical.
- Add a shared orchestration layer rather than duplicating business logic inside each subsystem.
- Keep execution plans explicit enough for telemetry, replay, and approval logic.
- Preserve tenant and permission boundaries across all context sources.

### 3.3 Safety goals

- No implicit auto-run on request creation.
- No hidden context expansion from chat, memory, or vault sources.
- No direct execution against a surface that is not present in the approved execution plan.
- No widened access to private-vault, library, workflow, or connector scopes without explicit policy checks.
- No privileged `workflow` or `skill_studio` execution without surface-specific authorization, feature gates, and approval rules.
- No launch from mutable upstream sources unless an approval-time source snapshot has been captured and validated.
- No automation kickoff when target-team resolution is ambiguous or missing.
- No reliance on budget previews alone; approved plan budgets must become enforced runtime caps.
- No dispatch to a surface whose shared/router/persistence contracts have not been migrated yet.
- No launch from a stale preflight preview after request fields, linked sources, or approval inputs have changed.
- No launch from an invalid `PreflightApprovalBundle` lifecycle state.
- No context or capability decision may trust client-provided tenant, role, permission, or private-vault unlock fields.
- No runtime retry, cancellation, or dead-letter recovery may bypass the approved dispatch policy for side-effecting surfaces.

---

## 4. Non-Goals

- Do not remove the existing `Start automation` approval step from Work Request.
- Do not replace Team room chat with a hidden backend-only runner.
- Do not make every request fully autonomous on day one.
- Do not auto-create or auto-publish skills without governance.
- Do not silently widen memory retrieval to all chat history or all vault content.
- Do not rebuild workflow, agency, media, or library systems from scratch.

---

## 5. Current Codebase Fit

Feature 105 is a composition feature. It should reuse and connect systems that already exist.

### 5.1 Work intake and launch

- `apps/web/server/routers/workOs.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/services/workAutomationFabricService.ts`
- `apps/web/server/services/workAutomationPolicyService.ts`
- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`

Current behavior:

- Request creation and automation launch are already separate.
- `createRequest` supports `linkedConversationIds`, `linkedWorkpackRunIds`, and `linkedRoleRoutineRunIds`.
- `createAutomationRun` immediately creates an auto-team room and starts kickoff.

### 5.2 Team orchestration

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx`

Current behavior:

- Auto-team planning, review, snapshots, and run-loop logic already exist.
- The room UI already supports run controls, live messages, and plan visibility.

### 5.3 Context and memory

- `apps/web/server/routers/chat.ts`
- `apps/web/server/routers/memory.ts`
- `apps/web/server/services/memoryService.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/libraryContextPackService.ts`

Current behavior:

- Chat and long-memory systems exist.
- Library context packs already flow into runtime context.

### 5.4 Capability systems

- `apps/web/server/services/skillCapabilityManifestService.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/server/routers/workflow.ts`
- `apps/web/server/routes/workflowWorkerRuntime.ts`
- `apps/web/server/services/agencyHybridCompile.ts`

Current behavior:

- Skills, skill maintenance, media, workflow, agency, and video surfaces already exist.
- They are not yet normalized into one orchestrator planning model.
- Work OS automation contracts currently stop at `video_editor`; `workflow` and `skill_studio` are not yet represented across the shared surface unions, router schemas, or persisted automation-step enum.

### 5.5 Workpack governance and learning

- `apps/web/server/services/workpackIntakeService.ts`
- `apps/web/server/services/workpackCompilerService.ts`
- `apps/web/server/services/workpackLearningService.ts`
- `apps/web/server/routers/workpack.ts`

Current behavior:

- Workpack already supports replay, readiness, learning, promotion, and enterprise evidence packaging.

### 5.6 Existing security primitives

- `apps/web/server/_core/context.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/routes/workflowWorkerRuntime.ts`

Current behavior:

- Private-vault unlock state is already modeled through `x-private-vault-token`.
- Runtime request building already sanitizes suspicious plan-context keys such as secrets, tokens, passwords, direct queries, and connector credentials.
- Library context-pack resolution already defaults to `privateVaultUnlocked: false` unless explicit unlock state is carried.
- Workflow worker-runtime routes already authenticate the caller and reject delegated-worker misuse.
- Work Request launch is requester/admin gated today, while automation-plan inspection APIs remain more admin-oriented.

These primitives should be elevated into first-class rules for Feature 105 rather than reimplemented ad hoc.

---

## 6. Proposed Experience

### 6.1 Stage A - Draft and review the request

The request form remains the place where users confirm intent before spending automation budget.

New behavior:

- Users can create a request from chat, from Team room context, or manually.
- The request screen can show linked conversations, linked docs, linked workpacks, and linked routines.
- The user still edits and confirms the final title/objective before launch.

### 6.2 Stage B - Compile a governed work brief

Before any Team run starts, the system compiles a `Compiled Work Brief` from:

- request title and objective
- linked conversation summaries and relevant message excerpts
- project memory and scoped memory summaries
- selected library context packs and related documents
- linked workpack replay/readiness evidence
- linked role-routine context
- operator policies and budget constraints
- source unlock and trust state

Before the final launch action, the platform captures an approval-time snapshot of every selected source. The snapshot must include enough immutable evidence to detect drift before execution, such as:

- source ids and source type
- excerpt or rendered summary used for approval
- content hash or version marker when available
- trust/freshness classification
- private-vault unlock state and sanitization status

The brief should answer:

- what the user is trying to accomplish
- what the deliverables are
- what constraints or policies matter
- what evidence and references are approved for use
- what success looks like

### 6.3 Stage C - Generate a capability plan

The system then builds a `Capability Plan` that chooses the best mix of:

- `skill`
- `agency`
- `workflow`
- `browser`
- `document_management`
- `media_studio`
- `video_editor`
- `work_os`
- `manual`
- `skill_studio` for maintenance or preparation tasks when explicitly allowed

The plan is reviewable before launch. It must show:

- selected execution surfaces
- step order and dependencies
- expected outputs and evidence
- approval boundaries
- estimated token/tool/media cost
- execution authority for each surface
- fallback paths and blocked surfaces

The plan must also apply a v1 surface-governance matrix:

| Surface | Planner-visible | Auto-executable by default | Minimum gate |
|---|---|---|---|
| `skill` | yes | yes | manifest + risk policy |
| `agency` | yes | yes | capability + risk policy |
| `workflow` | yes | no | feature flag + runtime permission + explicit approval |
| `browser` | yes | conditional | connector/domain policy |
| `document_management` | yes | conditional | bounded-write scope |
| `media_studio` | yes | conditional | provider/model allowlist + quota |
| `video_editor` | yes | no | explicit approval |
| `work_os` | yes | no for irreversible writes | explicit approval |
| `manual` | yes | no | human action |
| `skill_studio` | yes | no | sub-action policy + explicit approval |

`skill_studio` governance is action-specific in v1:

- `create_private_or_pending_review`: requester/admin scope + explicit launch approval; never auto-publish
- `improve_owned_skill`: skill owner/admin scope + explicit launch approval
- `auto_apply_proposal` and `publish_or_widen_visibility`: admin-only + dedicated approval

The planner must also record `contractCompatibilityState` for every selected or blocked capability. Until shared Work OS surface contracts are migrated, `workflow` and `skill_studio` may appear only as blocked or preview-only options with an explainable reason such as `surface_contract_not_migrated`.

### 6.4 Stage D - Approve and launch Team

When the user confirms launch:

- Work OS persists the approved execution plan,
- resolves the target team through an explicit deterministic team-resolution policy,
- creates or selects the target Team room only when the team resolution is valid,
- starts the Team run,
- seeds Team with the compiled brief, allowed surfaces, candidate capabilities, and step graph.

If no eligible team can be resolved, launch fails closed into a review-required state with diagnostics and suggested next actions instead of silently dropping kickoff.

In v1, team resolution order must be:

1. explicit team override carried by the approved execution plan when authorized
2. current case owner when `ownerType = "queue"` and the team is eligible
3. `request.defaultQueueId` when eligible
4. `request.defaultOwnerType = "queue"` plus `request.defaultOwnerId` when eligible
5. tenant-level fallback orchestration team only when explicitly configured and eligible
6. otherwise fail closed with a `TeamResolutionDecision`

The system must not perform hidden heuristic search across unrelated teams when these inputs do not resolve cleanly.

Team planning still exists, but now it refines and assigns work inside an approved frame instead of inventing the plan from scratch.

### 6.5 Stage E - Learn from the outcome

After the run:

- execution evidence flows into timeline and ledger artifacts,
- repeated success can generate workpack or benchmark candidates,
- repeated friction can generate skill-maintenance or workflow-improvement proposals,
- the next run gets smarter through governed reuse rather than unchecked prompt drift.

---

## 7. Architecture

### 7.1 Layer 1 - Intake Review Layer

Primary responsibility:

- convert chat, manual, or project-derived intent into a reviewed `Work Request`

Key rules:

- request creation never auto-runs by default
- request fields remain editable until launch begins
- linked sources are explicit and visible

Primary additions:

- `Create Work Request from Chat` entry point
- `Send to Work OS` action from chat or Team room
- source selector for linked conversations, docs, workpacks, and role routines
- server-derived `WorkIntakeActorContext` for every source-resolution and preview path

### 7.2 Layer 2 - Governed Context Fabric

Primary responsibility:

- assemble the exact context allowed for planning and runtime

This layer should extend the current `contextPackBuilder` pattern into a broader governed context assembly step that can combine:

- conversation summary blocks
- scoped memory and archive results
- library context packs
- request metadata
- workpack replay and readiness evidence
- policy and budget blocks
- approval-time source snapshots
- secret/private-vault sanitization metadata

Outputs:

- `CompiledWorkBrief`
- `WorkIntakeActorContext`
- `GovernedContextSnapshot`
- `ApprovalSourceSnapshot[]`
- traceable evidence references

### 7.3 Layer 3 - Capability Catalog

Primary responsibility:

- normalize all usable execution options into one planner-readable catalog

Catalog inputs:

- skill capability manifests
- workflow templates and workflow runtime support
- agency hybrid compile support
- media-studio capabilities
- video-editor capability
- document-management capability
- skill-studio maintenance capability
- workpack-derived preferred runtime hints

Outputs:

- candidate capability list
- blocked/unsupported reasons
- surface allowlist
- risk and approval metadata
- execution authority metadata
- default auto/manual eligibility
- capability action variant
- contract compatibility state

### 7.4 Layer 4 - Preflight Planner

Primary responsibility:

- transform the compiled brief and capability catalog into an explicit execution graph

Required outputs:

- ordered plan steps
- each step's target surface
- each step's selected capability or fallback candidates
- expected artifacts
- approval and retry policies
- token/tool/media budget forecast
- enforced execution budget envelope
- team-resolution decision
- preflight revision fingerprint
- `PreflightApprovalBundle` lifecycle state

This planner should be mostly deterministic up to the point where LLM reasoning is actually useful. LLMs can help with decomposition and tradeoffs, but not with unconstrained surface discovery.

### 7.5 Layer 5 - Team Execution Bridge

Primary responsibility:

- feed the approved execution graph into Team run startup and runtime routing

Required behavior:

- `runEngine` accepts a precomputed execution plan
- `teamRunSkillExecutor` respects the plan's explicit step surface and capability choices
- heuristic routing becomes fallback-only
- runtime requests carry the governed context snapshot and approved surface set
- runtime dispatch compiles a `RuntimeDispatchPolicy` for each executable step before calling a surface

### 7.6 Layer 6 - Learning and Packaging

Primary responsibility:

- convert repeated success and repeated failure into reusable assets

Required outputs:

- workpack candidates
- skill-improvement proposals
- workflow-refinement proposals
- maintenance tasks
- promotion and readiness signals
- learning proposal lifecycle records

This layer should reuse existing Workpack and Skill Studio systems instead of inventing a second learning product.

### 7.7 Layer 7 - Security, Surface Governance, and Release Gates

Primary responsibility:

- turn safety requirements into explicit, enforceable launch and runtime gates

Required outputs:

- surface-governance policy
- approval-source snapshot validator
- team-resolution policy
- execution budget envelope
- launch drift diagnostics
- release-gate status for privileged surfaces
- stable reason-code and telemetry event taxonomy

---

## 8. Functional Requirements

### 8.1 Request and review

- Users can create a request from chat, Team room, or manual form entry.
- Users can attach linked conversations, library packs, workpack runs, and role-routine runs before launch.
- The request stays editable until an automation run is created.
- Launch is still a deliberate user action.
- Request-scoped preflight preview must be accessible to the requester and admins/domain admins.
- Non-admin preview callers must receive a user-safe view that redacts privileged diagnostics, permission internals, and secret-bearing excerpts.
- Source resolution, preview generation, approval, and launch must receive server-derived actor context. Client payloads may request sources or teams but may not declare trusted tenant, role, permission, or private-vault unlock state.

### 8.2 Compiled work brief

- The system must create a stable `Compiled Work Brief` before automation launch.
- The brief must contain source references and evidence citations.
- The brief must fail closed when a required source cannot be resolved safely.
- Optional sources may degrade with diagnostics.
- Every selected source must produce an `ApprovalSourceSnapshot` before launch approval is finalized.
- Locked private-vault sources must not be included unless the caller's unlock state is explicitly present and captured in the snapshot.
- Sanitized planning context must exclude raw secrets, tokens, credentials, passwords, and direct-query material.
- If a required source changes after approval in a way that invalidates its snapshot, the run must not launch until it is re-reviewed.
- Any change to request title, objective, linked sources, policy inputs, or selected approval sources after preview must invalidate the approved preflight bundle until it is regenerated.
- Launch must compare the current `PreflightRevisionFingerprint` to the approved revision before kickoff.
- `PreflightApprovalBundle` must follow a valid lifecycle: `draft`, `previewed`, `approved`, `stale`, `launch_blocked`, `launching`, `launched`, `cancelled`, or `superseded`.
- Mutating preflight APIs must be idempotent and must reject idempotency-key reuse with different inputs.
- Concurrent launch attempts must not create duplicate automation runs or Team rooms.

### 8.3 Capability planning

- The orchestrator must choose surfaces and capabilities from a normalized catalog.
- The planner must support at least `workflow` and `skill_studio` as first-class plan targets in addition to existing surfaces.
- The planner must surface blocked or unsupported options rather than silently ignoring them.
- The approved plan becomes the authority for launch-time routing.
- Every planned step must include surface-governance metadata describing:
  - who may invoke the surface
  - whether the surface may auto-execute
  - which feature flags and permissions are required
  - whether approval is mandatory regardless of mode
- `workflow` and `skill_studio` must be review-gated by default in v1.
- Every planned step must include a `contractCompatibilityState` showing whether the surface is executable under the currently deployed shared types, router schemas, and persisted automation-step contracts.
- A surface that is not yet supported by current contracts may be previewed, but it must remain blocked with an explicit compatibility reason until the migration is complete.
- `skill_studio` sub-actions must follow these rules:
  - `create_private_or_pending_review` may be planned for requester/admin-scoped launches with explicit approval
  - `improve_owned_skill` requires owner/admin scope for the targeted skill and local-skill support
  - `auto_apply_proposal` and `publish_or_widen_visibility` are admin-only and remain non-auto-executable in v1

### 8.4 Team execution

- Team runs must receive the compiled work brief and approved execution plan at kickoff.
- Runtime requests must include governed context metadata and evidence references.
- Step routing should first honor the execution plan, then fall back to existing heuristics only when the plan is incomplete.
- Manual approvals inside the run should be reserved for real risk boundaries, not for missing preflight structure.
- Launch must fail closed when team resolution is missing, ambiguous, or blocked by policy.
- Team resolution must follow this deterministic precedence order:
  - approved explicit team override
  - current case queue owner
  - request `defaultQueueId`
  - request queue-style `defaultOwner`
  - explicitly configured tenant fallback orchestration team
  - else fail closed
- Team resolution must emit explainable codes such as `resolved_plan_override`, `resolved_case_owner`, `resolved_request_default_queue`, `resolved_request_default_owner`, `resolved_tenant_fallback`, `missing_team`, `inactive_team`, `ambiguous_team`, or `unauthorized_team`.
- The system must not fall back to heuristic cross-team search unless a future spec introduces a separately governed resolver.
- The approved execution plan must translate budget forecasts into hard runtime controls, including:
  - Team `stopPolicy`
  - per-surface max attempts
  - media/render quotas
  - retry disposition for side-effecting steps
- Runtime budget enforcement must use stable units for tokens, tool calls, media jobs, workflow runs, agency runs, wall-clock duration, retry count, and internal cost credits.
- Runtime dispatch must define timeout, cancellation, retry, idempotency, and dead-letter behavior for every long-running or side-effecting step.
- Privileged surfaces must re-check execution authority at runtime before dispatch.

### 8.5 Learning and improvement

- Successful repeated runs should be analyzable as workpack candidates.
- Improvement hotspots should generate skill/workflow maintenance proposals.
- Workpack readiness and replay signals should be available as future planning inputs.
- Maintenance surfaces must remain governed and optionally approval-gated.
- Learning proposals must move through explicit lifecycle states such as generated, deduped, triaged, accepted, scheduled, applied, rejected, expired, or superseded.
- Rejected, expired, and superseded proposals must remain auditable but must not re-trigger automatic follow-up work.

### 8.6 Observability and safety

- Every compiled brief and execution plan must be auditable.
- The system must record which sources were included or excluded and why.
- The system must record why a capability was selected or blocked.
- Budget estimates and approval boundaries must be visible before launch.
- The system must record approval snapshot hashes/version markers and any drift detected before dispatch.
- The system must record team-resolution decisions and failure reasons.
- The system must record any governance downgrade where the planner requested a surface that runtime refused.
- The system must record the approved `PreflightRevisionFingerprint`, the current fingerprint at launch time, and the reason when launch is invalidated as stale.
- The system must record contract-compatibility blocks separately from authorization or feature-flag blocks.
- Observability events must use a shared taxonomy with stable event names, correlation ids, redaction mode, actor class, and primary reason code.
- UI telemetry must record launch-disabled states, regeneration actions, rollout-gate decisions, and requester-safe reason codes without exposing admin-only diagnostics.

### 8.7 Security and authorization

- `workflow` execution requires the relevant workflow runtime permission, feature-flag enablement, and an approved execution-plan step.
- Request-scoped preview APIs must authorize the requester or an admin/domain admin, with privileged diagnostics redacted for non-admins.
- `skill_studio` create-private or pending-review actions may run for the requester after explicit launch approval, but they must not publish or widen visibility implicitly.
- `skill_studio` improve-skill actions require owner/admin authority for the targeted skill scope and must not auto-apply by default.
- `skill_studio` auto-apply or publish actions require admin authority plus explicit dedicated approval.
- Private-vault, restricted library, and connector-backed sources must be re-authorized at read time even after planning.
- Delegated workers must not inherit broader privileges than the approved plan and runtime actor explicitly grant.
- Approval snapshots must never store raw secrets or connector credentials; only redacted excerpts and integrity markers are allowed.
- Dead-letter recovery and side-effecting retries require explicit authority and idempotency verification.
- Requester-safe diagnostics must be created by redacting canonical admin decisions, not by making a separate weaker policy decision.

---

## 9. Proposed Contracts and Persistence

### 9.1 New logical artifacts

- `CompiledWorkBrief`
- `WorkIntakeActorContext`
- `ApprovalSourceSnapshot`
- `PreflightRevisionFingerprint`
- `PreflightApprovalBundle`
- `CapabilityPlan`
- `SurfaceGovernancePolicy`
- `TeamExecutionPlan`
- `TeamResolutionDecision`
- `ExecutionBudgetEnvelope`
- `RuntimeDispatchPolicy`
- `OrchestratorLearningRecord`
- `LearningProposal`
- `OrchestratorTelemetryEvent`

### 9.2 Storage strategy

Phase 1:

- persist these artifacts inside existing JSON/snapshot channels where possible:
  - `workAutomationRuns.policyJson`
  - Team monitoring snapshots
  - work timeline/event payloads
- persist immutable approval snapshots alongside the approved launch record so source drift can be detected before dispatch
- persist the approved preflight revision fingerprint and launch-time fingerprint comparison outcome alongside the launch record
- until Work OS surface contracts are migrated, store compatibility blocks and preview-only capability diagnostics without attempting dispatch against unsupported surfaces
- enforce a formal persistence decision gate before requester-visible launch UI leaves preview/beta:
  - JSON metadata may remain the v1 storage path only if approved bundles are read mostly by a single run, do not need cross-run search, and can be validated with schema guards at read time
  - a dedicated migration is required before broader rollout if approved plans must be queried across runs, audited in bulk, filtered in dashboards, retained independently, or joined with Team ledger/workpack learning records
- document the selected storage path in the decision log before enabling Feature 105 launch enforcement beyond internal/admin users

Phase 2:

- normalize into dedicated tables if the product needs cross-run querying, dashboards, and bulk governance workflows
- if Phase 2 is triggered, normalize at minimum:
  - approved preflight bundles
  - approval source snapshots
  - plan step graph records
  - budget envelope state
  - team-resolution decisions
  - governance/compatibility block records

### 9.3 Shared schemas

Add shared contracts under `apps/web/shared/` for:

- intake brief schema
- source-ref schema
- actor-context schema
- approval-source snapshot schema
- preflight revision schema
- preflight approval bundle schema
- capability catalog entry schema
- surface-governance policy schema
- execution-plan schema
- execution-budget envelope schema
- runtime-dispatch policy schema
- team-resolution decision schema
- review decision schema
- learning proposal handoff schema
- observability event envelope schema

---

## 10. Implementation Areas

Feature 105 should be implemented in seven slices:

1. Intake review and compiled-work-brief generation
2. Governed context assembly and capability catalog
3. Preflight planning and launch bridge
4. Team execution graph and surface adapters
5. Learning loop into workpack and skill maintenance
6. Security, surface governance, and release gates
7. UI, observability, rollout, and governance controls

Each slice is detailed in the section files.

---

## 11. Acceptance Criteria

- A user can create a work request from chat context without copying everything manually.
- The request page shows the linked sources and compiled brief before launch.
- Starting automation launches Team from an approved execution plan, not only from freeform objective text.
- Workflow and skill-maintenance surfaces are first-class planning options where allowed.
- Team runtime can explain which sources and capabilities it used.
- Repeated successful runs can produce workpack or skill-improvement outputs.
- Existing manual review before launch remains intact.
- Existing Team rooms and direct room creation continue to work during rollout.
- Locked or drifted approval sources block launch until re-review.
- Editing request inputs or linked sources after preview invalidates the approved preflight bundle until it is regenerated.
- Missing team resolution blocks kickoff with an explainable review state.
- Team resolution follows a deterministic precedence order and records which source won.
- Approved budgets become enforced runtime caps during execution.
- `workflow` and `skill_studio` cannot auto-execute in v1 without explicit governance approval.
- Requesters can review a redacted preflight preview for their own request without needing domain-admin access.
- Surfaces whose shared/router/persistence contracts are not yet migrated remain blocked with explicit compatibility reasons instead of failing later at dispatch.
- Preflight preview, regeneration, approval, invalidation, bundle-read, and launch APIs follow one lifecycle contract.
- Runtime dispatch records retry, timeout, cancellation, and dead-letter outcomes with stable reason codes.
- Learning proposals have explicit lifecycle states and cannot auto-apply or publish without action-specific governance.
- Preflight UI supports keyboard/screen-reader use, progressive disclosure, and localization through stable reason-code translation keys.

---

## 12. Rollout Strategy

### 12.1 Phase 1 - Hidden backend scaffolding

- Add shared schemas and services for compiled work briefs and capability planning.
- Persist artifacts in snapshots/JSON only.
- No user-visible change outside admin or debug surfaces.

### 12.2 Phase 2 - Request review enhancements

- Add chat-to-request entry points.
- Add linked-source selectors and compiled-brief preview in `WorkRequest`.
- Keep launch behavior unchanged apart from showing richer preflight information.

### 12.3 Phase 3 - Plan-driven Team kickoff

- Seed Team runs from approved execution plans.
- Make routing plan-first and heuristic-second.
- Keep capability expansion behind flags.
- Keep `workflow` and `skill_studio` in preview-only or blocked state until shared surface contracts, router schemas, and persistence enums are migrated.
- run the storage decision gate before exposing requester-visible final launch approval:
  - continue JSON-only if this remains a narrow beta with focused run-scoped read paths
  - add migrations first if operators need searchable audit, dashboards, or cross-run learning over approved plan data

### 12.4 Phase 4 - Security and release gates

- Enforce approval snapshots, team-resolution policy, and budget envelopes.
- Gate `workflow` and `skill_studio` surfaces behind explicit security and rollout controls.
- Enforce requester-safe preview ACLs and stale-preview invalidation before broad release.
- Enforce `PreflightApprovalBundle` lifecycle transitions and idempotency before requester-visible launch approval.
- Enforce runtime dispatch policy for retries, timeouts, cancellations, and dead-letter recovery before enabling long-running privileged surfaces.
- Adopt the shared observability event taxonomy before operator dashboards or broad rollout decisions depend on telemetry.
- split shared security implementation into small policy modules before parallel implementation:
  - surface governance and reason codes
  - approval snapshot drift checks
  - budget envelope enforcement
  - requester/admin preflight redaction
  - contract compatibility gates
  - team-resolution launch gate integration

### 12.5 Phase 5 - Learning loop

- Feed successful runs into workpack and skill improvement systems.
- Add readiness and replay-aware suggestions for future requests.
- Add learning proposal lifecycle UI or admin review surfaces before any automatic proposal follow-up.

### 12.6 Phase 6 - Expand autonomy carefully

- Only after plan quality, telemetry, and safety metrics are stable should the platform reduce manual pauses inside low-risk run types.

---

## 13. Appendices

- `appendices/contracts-and-migration.md`
- `appendices/security-and-authorization.md`
- `appendices/preflight-lifecycle-and-api-contracts.md`
- `appendices/runtime-budget-dispatch-policy.md`
- `appendices/observability-event-taxonomy.md`
