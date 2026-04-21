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

## Implementation notes

- Reuse skill manifests where they already exist.
- Reuse workflow/agency/media/video feature flags and runtime availability checks.
- Treat `skill_studio` as a governed preparation/maintenance surface with sub-actions such as `create_private_or_pending_review`, `improve_owned_skill`, `auto_apply_proposal`, and `publish_or_widen_visibility`.
- Carry private-vault unlock state and secret-sanitization metadata as first-class inputs, not optional annotations.
- Emit explicit compatibility blocks when a capability is planner-visible but not yet dispatchable under the current Work OS surface contracts.

## Tests to add first

- capability-catalog service tests
- governed-context source-resolution tests
- surface availability and blocked-reason contract tests
- approval-source snapshot generation tests
- surface contract-compatibility tests

## Risks

- catalog drift between feature flags and planner state
- mixed trust levels across sources

## Mitigations

- always emit trust, freshness, and blocked-reason metadata
- keep the catalog build deterministic from current repo/runtime state
