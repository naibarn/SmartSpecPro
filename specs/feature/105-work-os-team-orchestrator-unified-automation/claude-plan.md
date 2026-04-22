# Claude Implementation Plan

## Objective

Build a unified `Work OS + Team Orchestrator` automation path that turns reviewed Work Requests into governed, capability-aware Team runs. The implementation must keep request creation review-first, compile explicit upstream context into a work brief, generate a preflight execution plan, enforce security and budget gates, and feed successful patterns into reusable workpacks and skill improvements.

## Current State

Work OS already separates request creation from automation launch, and Team already has room/run orchestration. Chat, memory, document management, skills, workflow, agency, media, video editing, and workpack systems already exist. The gap is that Team planning does not consistently receive the full governed context or a normalized capability model before launch.

The first backend foundation is already partially present:

- `apps/web/shared/workOrchestrator.ts` defines shared orchestrator contracts.
- `preflightRevisionService` fingerprints preview inputs.
- `preflightAccessPolicyService` separates requester-safe and admin-diagnostic preview access.
- `teamResolutionPolicyService` resolves target teams deterministically and fails closed.
- `workOs.resolvePreflightPreview` returns an initial preflight preview.

The remaining work should extend these foundations into full intake, planning, launch, runtime, learning, security, and UI slices.

## Shared Contracts And Persistence Strategy

All sections should reuse `apps/web/shared/workOrchestrator.ts` as the shared type boundary. New data structures should be added there first when they cross client/server or service boundaries. Server-only implementation details can live inside service-local types, but any value persisted in Work OS automation metadata, Team run constraints, Team ledger diagnostics, or UI preview responses must have a shared schema or a clearly documented JSON contract.

Add these shared contracts before wiring UI or runtime behavior:

- `WorkIntakeActorContext`
- `PreflightApprovalBundle`
- `RuntimeDispatchPolicy`
- `LearningProposal`
- `OrchestratorTelemetryEvent`

Early phases may persist approved plans, approval snapshots, budget envelopes, and team resolution inside existing JSON metadata fields such as automation policy/detail JSON, Team run constraints JSON, or Work OS timeline metadata. Before enabling broad runtime dispatch for new surfaces, add explicit persistence migrations if JSON-only storage becomes too opaque for querying, audit, or replay.

Before requester-visible launch enforcement leaves preview/beta, run an explicit approved-plan persistence decision gate:

- Keep JSON metadata for v1 only if approved bundles are loaded mostly by run id, remain small enough for cheap hydration, and can be schema-validated at read time.
- Add dedicated migrations first if approved bundles, source snapshots, plan steps, budget envelopes, team-resolution decisions, or governance blocks need cross-run search, dashboards, independent retention, or reliable joins with Team ledger and workpack learning.
- Record the decision in `decision-log.md` and reference it in rollout notes so implementation does not accidentally grow a permanent opaque JSON blob.

`workflow` and `skill_studio` require a staged migration:

1. Planner-visible contracts in shared schemas.
2. Router validation that accepts preview-only compatibility states.
3. Persistence support for approved plan metadata.
4. Runtime dispatch gates that reject compatibility-blocked surfaces.
5. Only after shared/router/persistence/runtime are aligned, enable dispatch behind feature flags.

## Security Policy Decomposition

`workOrchestratorSecurityPolicy` is the shared concept, but it should not become one large conflict-prone file. Implement it as small helpers or clearly separated exported groups:

- surface governance and stable reason codes
- approval source snapshot drift checks
- budget envelope conversion and runtime cap checks
- requester-safe/admin-diagnostic redaction rules
- contract compatibility gates
- team-resolution launch gate integration
- preflight lifecycle transition and idempotency gates
- runtime retry/timeout/cancel/dead-letter gates

Section 02 may introduce catalog-facing governance helpers. Section 03 may consume launch/preview gates. Section 04 may consume runtime gates. Section 06 owns final enforcement semantics and reason-code stability. Section 07 only consumes redacted UI-safe diagnostics.

## Preflight Lifecycle And API Contracts

Section 03 must implement the lifecycle contract in `appendices/preflight-lifecycle-and-api-contracts.md` before requester-visible launch approval is enabled.

Required states:

- `draft`
- `previewed`
- `approved`
- `stale`
- `launch_blocked`
- `launching`
- `launched`
- `cancelled`
- `superseded`

Required API/router procedures:

- `resolvePreflightPreview`
- `regeneratePreflightPreview`
- `approvePreflightBundle`
- `getPreflightBundle`
- `invalidatePreflightBundle`
- `launchApprovedAutomation`

All mutating procedures need idempotency keys, compare-and-set state transitions where relevant, and stable conflict/error codes.

## Runtime Budget And Dispatch Policy

Section 04 and Section 06 must treat `appendices/runtime-budget-dispatch-policy.md` as an implementation contract.

Budget dimensions:

- tokens
- tool calls
- media jobs
- workflow runs
- agency runs
- wall-clock duration
- retry count
- internal cost credits

Each executable step compiles to `RuntimeDispatchPolicy` immediately before dispatch. Runtime re-checks authority, contract compatibility, source snapshots, idempotency, and budget availability before calling media, workflow, agency, video, document, skill, or Skill Studio surfaces.

## Observability Event Taxonomy

Section 07 must consume the taxonomy in `appendices/observability-event-taxonomy.md`; Section 06 owns stable reason-code families.

Every Feature 105 event should include available correlation ids across request, preflight bundle, automation run, Team room/run, work item, plan step, surface, capability, and idempotency key. Requester-safe telemetry must include stable reason codes and redacted summaries only.

## End-To-End Data Flow

1. User creates or edits a Work Request with explicit linked source refs.
2. Work OS derives `WorkIntakeActorContext` from authenticated server context.
3. Work OS resolves those refs through `workIntakeSourceResolver`.
4. `workIntakeBriefService` compiles a governed `CompiledWorkBrief`.
5. `orchestratorCapabilityCatalogService` builds the capability catalog.
6. `workOrchestratorPlanningService` produces a `CapabilityPlan`, `TeamExecutionPlan`, budget envelope, source snapshots, and team resolution.
7. `resolvePreflightPreview` returns requester-safe or admin-diagnostic views.
8. The user approves the current preflight revision.
9. Launch validates lifecycle state, fingerprint, source snapshots, team resolution, compatibility, authority, and budget.
10. Work OS persists the approved bundle and starts Team through `teamExecutionLaunchService`.
11. Team runtime compiles `RuntimeDispatchPolicy`, executes plan-first, and records plan-vs-actual telemetry.
12. Learning services package successful patterns as workpack and skill/workflow improvement proposals.

## Cross-Cutting Failure Modes

- Missing or ambiguous target team: block launch and show review-required diagnostics.
- Stale preflight fingerprint: block launch and require regeneration.
- Drifted required source snapshot: block launch or runtime dispatch depending on when detected.
- Restricted or locked source without unlock state: omit from brief or block if required.
- Privileged surface without permission/flag/approval: block with governance diagnostics.
- Contract-incompatible surface: allow preview visibility but block runtime dispatch.
- Budget cap exceeded: stop runtime and record budget-specific failure.
- Legacy direct Team room without approved plan: allow fallback, but mark plan source as legacy/plan-absent.

## Section 01 - Intake Review And Compiled Brief

### Purpose

Make Work Request intake preserve the thinking that already happened in chat, Team rooms, documents, workpacks, and routines while keeping the final request editable and reviewed by a human.

### Implementation

- Extend Work OS request creation and update paths to preserve explicit linked source refs.
- Add `workIntakeSourceResolver` to normalize source refs from conversations, library/docs, workpack runs, role routine runs, and request metadata.
- Add `WorkIntakeActorContext` derivation at the Work OS router boundary and pass it explicitly to source resolution and brief compilation.
- Add `workIntakeBriefService` to produce a `CompiledWorkBrief` from explicit source refs.
- Include source diagnostics for included, omitted, locked, stale, malformed, and over-budget sources.
- Keep source extraction bounded by snippet/token budgets.
- Add Work Request UI panels for linked sources and compiled brief preview.
- Add chat entry points that prefill Work Request linkage without bypassing review.
- Ensure client payloads never provide trusted tenant, role, permission, or private-vault unlock fields.

### Key Files

- `apps/web/shared/workOrchestrator.ts`
- `apps/web/server/routers/workOs.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/services/workIntakeSourceResolver.ts`
- `apps/web/server/services/workIntakeBriefService.ts`
- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/work-os/CompiledWorkBriefPanel.tsx`

### Constraints

- Do not start automation from request creation.
- Do not silently pull global chat or vault content.
- Do not persist raw secret-bearing source excerpts.

## Section 02 - Governed Context And Capability Catalog

### Purpose

Give the planner a deterministic view of context and capabilities across the whole product.

### Implementation

- Add `orchestratorCapabilityCatalogService`.
- Normalize capability entries for skills, agency, workflow, browser, document management, media studio, video editor, Work OS, manual actions, and Skill Studio.
- Carry governance metadata: planner visibility, auto-executable default, approval requirement, minimum gate, required flags, required permissions, and blocked reason.
- Include contract compatibility state for surfaces not fully migrated through Work OS.
- Add `workOrchestratorSecurityPolicy` for shared surface rules.
- Extend context assembly to include trust, freshness, unlock state, sanitization state, source budgets, and approval snapshot readiness.
- Consume `WorkIntakeActorContext` when resolving tenant/RBAC/private-vault source access and requester-safe/admin-diagnostic catalog views.
- Treat existing `workAutomationPolicyService` output as an input to the richer catalog/planner, not as the final plan.

### Key Files

- `apps/web/server/services/orchestratorCapabilityCatalogService.ts`
- `apps/web/server/services/workOrchestratorSecurityPolicy.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/services/skillCapabilityManifestService.ts`
- `apps/web/server/routers/workflow.ts`
- `apps/web/server/services/agencyHybridCompile.ts`
- `apps/web/server/routers/videoEditorProjects.ts`

### Constraints

- `workflow` and `skill_studio` can appear in plans only with explicit compatibility and governance state.
- `skill_studio` actions must be evaluated separately.
- Capability blocks must be explainable, not silent drops.

## Section 03 - Preflight Plan And Launch Bridge

### Purpose

Generate a reviewable execution plan before launch, then persist the approved bundle into Work OS automation and Team kickoff.

### Implementation

- Add `workOrchestratorPlanningService`.
- Produce a `CapabilityPlan` and `TeamExecutionPlan` from the compiled brief, catalog, policy inputs, source snapshots, budget estimates, and team resolution.
- Implement `PreflightApprovalBundle` lifecycle transitions and explicit preflight API contracts.
- Add `approvalSourceSnapshotService` to capture approval-time source hashes, summaries, unlock state, and sanitization state.
- Extend `resolvePreflightPreview` from initial preview to full plan preview.
- Add launch-time validation that compares the approved `PreflightRevisionFingerprint` with the current fingerprint.
- Persist approved plan, budget envelope, source snapshots, and team decision into automation run metadata.
- Run the approved-plan persistence decision gate before the requester-visible launch UI leaves preview/beta.
- Update `createAutomationRun` to require a valid approved bundle when the new Feature 105 path is active.
- Keep legacy launch compatibility behind explicit fallback logic.
- Add idempotency keys for preview generation and approval capture so repeated clicks do not create competing approved bundles.
- Add compare-and-set launch transition from `approved` to `launching` to prevent duplicate automation runs.

### Key Files

- `apps/web/server/services/workOrchestratorPlanningService.ts`
- `apps/web/server/services/approvalSourceSnapshotService.ts`
- `apps/web/server/services/preflightRevisionService.ts`
- `apps/web/server/services/preflightAccessPolicyService.ts`
- `apps/web/server/services/teamResolutionPolicyService.ts`
- `apps/web/server/services/workAutomationFabricService.ts`
- `apps/web/server/routers/workOs.ts`
- `apps/web/client/src/components/work-os/CapabilityPlanReviewPanel.tsx`

### Constraints

- Missing team resolution blocks launch.
- Stale preview blocks launch.
- Drifted required snapshots block launch.
- Requester-safe previews must remain redacted.

## Section 04 - Team Execution Graph And Surface Adapters

### Purpose

Make Team execution consume the approved plan instead of relying primarily on heuristics.

### Implementation

- Add `teamExecutionPlanService` to load and validate approved plans for Team runtime.
- Add `teamExecutionLaunchService` to seed room goal, compiled brief, execution graph, and budget envelope into Team kickoff.
- Extend `runEngine` to accept plan seed metadata while preserving direct Team room fallback.
- Update `teamRunSkillExecutor` to route plan-first by step id, selected capability, surface authority, and compatibility state.
- Propagate governed source metadata into runtime requests.
- Record plan-vs-actual execution drift into Team ledger and Work OS timeline.
- Enforce budget envelope and per-surface authority at dispatch time.
- Include idempotency and resume semantics for long-running Team steps so replay does not double-dispatch media, workflow, or agency jobs.
- Add `RuntimeDispatchPolicy` compilation for each executable step, including timeout, retry, cancellation, dead-letter, budget reservation, and side-effect class behavior.

### Key Files

- `apps/web/server/services/teamExecutionPlanService.ts`
- `apps/web/server/services/teamExecutionLaunchService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx`

### Constraints

- Plan-absent legacy rooms continue to work.
- Runtime never dispatches compatibility-blocked surfaces.
- Runtime re-checks authority and budget, not only preview estimates.

## Section 05 - Learning Loop, Workpacks, And Skill Maintenance

### Purpose

Turn successful repeated Team work into reusable workpacks, workflow refinements, and governed skill improvements.

### Implementation

- Add `orchestratorLearningService`.
- Read Team outcomes, final artifacts, review records, execution traces, and repeated exception patterns.
- Reuse workpack readiness and replay thresholds before creating reusable candidates.
- Generate workpack candidates and improvement proposals with evidence summaries.
- Feed skill improvement briefs into existing Skill Studio flows.
- Keep auto-apply and publish/widen-visibility actions admin-gated.
- Persist learning proposal lifecycle states: `generated`, `deduped`, `triaged`, `accepted`, `scheduled`, `applied`, `rejected`, `expired`, and `superseded`.

### Key Files

- `apps/web/server/services/orchestratorLearningService.ts`
- `apps/web/server/services/workpackLearningService.ts`
- `apps/web/server/services/workpackCompilerService.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`

### Constraints

- Prefer proposals over blind mutation.
- Deduplicate noisy proposals.
- Preserve governance by Skill Studio sub-action.

## Section 06 - Security, Surface Governance, And Release Gates

### Purpose

Convert safety requirements into enforceable launch and runtime rules.

### Implementation

- Finalize `workOrchestratorSecurityPolicy`.
- Enforce surface governance matrix for all surfaces.
- Enforce approval source snapshot drift checks.
- Enforce budget envelope caps in launch and runtime.
- Add feature flags for workflow planning, skill studio planning, learning loop automation, privileged auto-execution, and snapshot enforcement.
- Add telemetry for stale previews, missing team resolution, compatibility blocks, redaction mode, and governance downgrades.
- Add contract-migration gates before enabling new Work OS persisted surfaces.
- Add audit-friendly reason codes for every block path, using stable values suitable for UI, logs, and tests.
- Own stable reason-code families for lifecycle, budget, runtime dispatch, telemetry, and learning proposal gates.

### Key Files

- `apps/web/server/services/workOrchestratorSecurityPolicy.ts`
- `apps/web/server/services/approvalSourceSnapshotService.ts`
- `apps/web/server/services/workAutomationPolicyService.ts`
- `apps/web/server/services/workAutomationFabricService.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/server/routes/workflowWorkerRuntime.ts`
- `apps/web/server/_core/context.ts`

### Constraints

- Authorization, feature-flag failure, budget failure, drift failure, and contract-compatibility failure must remain distinguishable.
- Requester-safe diagnostics cannot expose privileged policy internals or secrets.
- Fail closed when authority cannot be proven.

## Section 07 - UI, Observability, And Rollout Controls

### Purpose

Make the new automation path understandable and safely rollable out to users and operators.

### Implementation

- Add Work Request preview UI for linked sources, compiled brief, capability plan, cost/budget, approvals, stale preview state, and team resolution.
- Add chat-to-request controls.
- Extend Team ledger and Work OS timeline to show plan-vs-actual and blocked reasons.
- Add admin/operator diagnostics for contract compatibility and governance blocks.
- Implement telemetry events from `appendices/observability-event-taxonomy.md`.
- Add accessibility, i18n, and progressive-disclosure acceptance to the preflight UI.
- Add rollout flags and staged enablement.
- Keep direct Team and legacy Work OS flows visible and working.

### Key Files

- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/work-os/CompiledWorkBriefPanel.tsx`
- `apps/web/client/src/components/work-os/CapabilityPlanReviewPanel.tsx`
- `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx`
- `apps/web/server/services/monitoringService.ts`

### Constraints

- UI must make blocked reasons actionable.
- Requester-safe UI should avoid admin-only diagnostics.
- Stale preview state should offer regenerate/re-review, not a dead end.

## Rollout

1. Backend contracts and initial preflight services.
2. Compiled brief and source resolver.
3. Capability catalog and governance matrix.
4. Full preflight planner and approval bundle persistence.
5. Team plan-first launch bridge.
6. Runtime dispatch enforcement.
7. UI preview and observability.
8. Learning loop proposals.
9. Gradual enablement of `workflow` and `skill_studio` after contract migration.

## Validation Strategy

Use focused Vitest suites per section, then run broader Work OS, Team, runtime, and UI regressions. Full TypeScript checking may include unrelated repository failures; touched files should still be checked and focused tests must pass.
