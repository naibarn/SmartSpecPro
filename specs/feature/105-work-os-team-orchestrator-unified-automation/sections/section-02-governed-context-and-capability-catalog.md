# Section 02 - Governed Context and Capability Catalog

## Goal

Create the orchestrator's shared "brain inputs":

- governed planning context
- unified capability catalog

## Ownership boundaries

- source resolution and context assembly
- capability catalog normalization across systems
- blocked/allowed surface reasoning

This section does not start Team runs yet.

## Current touchpoints

- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/libraryContextPackService.ts`
- `apps/web/server/services/skillCapabilityManifestService.ts`
- `apps/web/server/routers/workflow.ts`
- `apps/web/server/services/agencyHybridCompile.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/server/services/workpackCompilerService.ts`

## Deliverables

1. Extend governed context assembly beyond library packs to include:
   - linked conversations
   - scoped memory summaries
   - workpack replay/readiness evidence
   - role-routine context
   - policy and budget blocks
   - approval-time source snapshots
   - trust, unlock, and sanitization metadata
   - actor authorization context from Section 01
2. Add `orchestratorCapabilityCatalogService` that produces normalized entries for:
   - `skill`
   - `agency`
   - `workflow`
   - `browser`
   - `document_management`
   - `media_studio`
   - `video_editor`
   - `work_os`
   - `manual`
   - `skill_studio`
3. Record explicit blocked reasons for unavailable capabilities.
4. Record default execution authority for every capability entry, including whether the surface is planner-visible only, approval-gated, or auto-executable.
5. Record capability action variants and `contractCompatibilityState` for surfaces whose shared/router/persistence contracts are still migrating.

## Interfaces produced

- `orchestratorCapabilityCatalogService.buildCapabilityCatalog(input)` returns catalog entries using shared `CapabilityCatalogEntry` contracts.
- `workOrchestratorSecurityPolicy.evaluateSurfaceGovernance(input)` returns planner visibility, auto-execution authority, approval requirements, feature flags, permissions, and block reasons.
- Governed context assembly returns source refs with trust, freshness, unlock, sanitization, and budget metadata.
- Governed context assembly consumes `WorkIntakeActorContext` and emits `GovernedContextSnapshot` without trusting client-provided tenant, role, or private-vault fields.

## Interfaces consumed by later sections

- Section 03 consumes the catalog and governance decisions to create the preflight execution plan.
- Section 04 consumes compatibility and authority decisions at dispatch time.
- Section 06 owns final enforcement rules and telemetry reason codes for governance failures.

## Implementation notes

- Reuse skill manifests where they already exist.
- Reuse workflow/agency/media/video feature flags and runtime availability checks.
- Treat `skill_studio` as a governed preparation/maintenance surface with sub-actions such as `create_private_or_pending_review`, `improve_owned_skill`, `auto_apply_proposal`, and `publish_or_widen_visibility`.
- Carry private-vault unlock state and secret-sanitization metadata as first-class inputs, not optional annotations.
- Emit explicit compatibility blocks when a capability is planner-visible but not yet dispatchable under the current Work OS surface contracts.
- Capability catalog decisions must be deterministic for the same actor context, tenant flags, source set, and runtime availability snapshot.
- Catalog entries must expose requester-safe explanations separately from admin-diagnostic policy details.

## Tests to add first

- capability-catalog service tests
- governed-context source-resolution tests
- actor-context propagation tests proving tenant/RBAC/private-vault state affects source and capability decisions
- surface availability and blocked-reason contract tests
- approval-source snapshot generation tests
- surface contract-compatibility tests
- `skill_studio` sub-action governance tests
- tests proving planner-visible surfaces are not necessarily runtime-dispatchable

## Done when

- Every orchestrator surface appears in the catalog with stable governance metadata.
- Blocked capabilities include machine-readable reason codes and user-explainable summaries.
- `workflow` and `skill_studio` are visible but compatibility-blocked until migration.
- Requester-safe and admin-diagnostic catalog views come from the same underlying decisions without leaking privileged details.

## Risks

- catalog drift between feature flags and planner state
- mixed trust levels across sources

## Mitigations

- always emit trust, freshness, and blocked-reason metadata
- keep the catalog build deterministic from current repo/runtime state

## Implementation update

- 2026-04-22: expanded `apps/web/shared/workOrchestrator.ts` with governed-context, capability-catalog, preflight lifecycle, telemetry, and learning contracts needed by later sections.
- 2026-04-22: added `apps/web/server/services/workIntakeActorContext.ts`, `workIntakeSourceResolver.ts`, and `orchestratorCapabilityCatalogService.ts` so source trust/unlock context and surface governance are assembled deterministically from authenticated server context.
- 2026-04-22: added focused coverage in `apps/web/server/services/__tests__/workIntakeSourceResolver.test.ts`, `workIntakeBriefService.test.ts`, and `orchestratorCapabilityCatalogService.test.ts`.
