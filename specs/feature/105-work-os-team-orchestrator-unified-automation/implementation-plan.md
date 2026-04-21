# Implementation Plan

## Objective

Create a unified `Work OS + Team Orchestrator` planning layer that compiles governed intake context into an approved execution plan before Team runs start, while reusing the current chat, memory, library, skills, workflow, agency, media, video, and workpack systems.

## Current-codebase fit

This feature should extend current systems rather than replace them:

- `Work OS` already separates request creation from automation launch.
- `Team` already has run planning, planning review, runtime snapshots, and workflow UI.
- `Chat` and `Memory` already provide rich conversational and long-memory context.
- `Library` already supports explicit context packs and permission-aware retrieval.
- `Skills`, `Skill Studio`, `Workflow`, `Agency`, `Media Studio`, and `Video Editor` already exist as usable capability surfaces.
- `Workpack` already provides replay, readiness, promotion, and learning infrastructure.

The implementation should introduce a unifying planning layer, then progressively wire existing systems into it.

## Affected files and modules

Primary existing modules to extend:

- `apps/web/server/routers/workOs.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/services/workAutomationFabricService.ts`
- `apps/web/server/services/workAutomationPolicyService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/skillCapabilityManifestService.ts`
- `apps/web/server/services/workpackLearningService.ts`
- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`

Likely new shared/server modules:

- `apps/web/shared/workOrchestrator.ts`
- `apps/web/server/services/workIntakeBriefService.ts`
- `apps/web/server/services/workIntakeSourceResolver.ts`
- `apps/web/server/services/orchestratorCapabilityCatalogService.ts`
- `apps/web/server/services/preflightRevisionService.ts`
- `apps/web/server/services/preflightAccessPolicyService.ts`
- `apps/web/server/services/workOrchestratorPlanningService.ts`
- `apps/web/server/services/workOrchestratorSecurityPolicy.ts`
- `apps/web/server/services/approvalSourceSnapshotService.ts`
- `apps/web/server/services/teamResolutionPolicyService.ts`
- `apps/web/server/services/teamExecutionPlanService.ts`
- `apps/web/server/services/teamExecutionLaunchService.ts`
- `apps/web/server/services/orchestratorLearningService.ts`

Likely new client modules:

- `apps/web/client/src/components/work-os/CompiledWorkBriefPanel.tsx`
- `apps/web/client/src/components/work-os/CapabilityPlanReviewPanel.tsx`
- `apps/web/client/src/components/chat/CreateWorkRequestFromChatAction.tsx`

## Implementation approach

1. Define shared schemas for intake sources, compiled brief, approval snapshots, preflight revision fingerprints, capability entries, execution budgets, and execution plans.
2. Build a source resolver that can turn linked conversations, library refs, workpack refs, and policy blocks into governed planning context.
3. Build a compiled-work-brief service for Work OS, persist approval-time source snapshots with integrity markers, and compute a preflight revision fingerprint that invalidates stale previews.
4. Build a capability catalog service that merges skill manifests, workflow support, agency support, media/video capability, and maintenance surfaces into one view.
5. Extend the planning model with capability action variants and contract-compatibility state so `workflow` and `skill_studio` can be previewed safely before full contract migration.
6. Define a surface-governance policy service that determines which surfaces are planner-visible, auto-executable, approval-gated, or blocked, including `skill_studio` sub-actions.
7. Build a preflight planner that selects execution surfaces, outputs an explicit plan, and records blocked alternatives.
8. Add requester-safe preview access policy and redaction logic for preflight review.
9. Add deterministic team-resolution policy so launch can select a valid orchestration team or fail closed with review diagnostics.
10. Convert plan forecasts into an enforced execution-budget envelope and runtime caps.
11. Add plan preview and source review to the Work Request launch flow.
12. Persist the approved plan into the automation run and Team kickoff path.
13. Update Team runtime to honor the approved plan before falling back to heuristics.
14. Expand Work OS surface contracts across shared types, router schemas, and persistence before enabling runtime dispatch for new surfaces.
15. Feed post-run outcomes into workpack and skill-maintenance proposal generation.

## Risks and mitigations

- Risk: context assembly leaks data across scopes.
  - Mitigation: reuse read-time permission checks and explicit source inclusion records.
- Risk: privileged surfaces such as `workflow` or `skill_studio` are auto-routed without strong authorization.
  - Mitigation: introduce a surface-governance matrix with explicit approval and permission requirements.
- Risk: new planner-visible surfaces are selected before Work OS contracts can persist or route them safely.
  - Mitigation: add contract-compatibility state and block runtime dispatch until shared types, router schemas, and persistence enums are migrated.
- Risk: planning complexity explodes when every surface is enabled at once.
  - Mitigation: launch behind feature flags and keep blocked/unsupported reasons explicit.
- Risk: Team runtime and Work OS plan drift apart.
  - Mitigation: make the approved execution plan the source of truth for kickoff routing.
- Risk: approved sources drift after review and before launch.
  - Mitigation: capture approval snapshots and invalidate launch when required sources change materially.
- Risk: a user edits request inputs after preview and launches a stale plan.
  - Mitigation: compute a preflight revision fingerprint and require regenerate-and-reapprove before launch.
- Risk: preflight preview leaks privileged diagnostics to the requester.
  - Mitigation: add requester-safe preview ACLs with redacted diagnostics for non-admin callers.
- Risk: kickoff silently fails when no team can be resolved.
  - Mitigation: add explicit team-resolution policy with fail-closed review state.
- Risk: `skill_studio` governance either over-blocks legitimate create flows or over-allows auto-apply/publish actions.
  - Mitigation: split `skill_studio` policy by sub-action: create, improve, auto-apply, publish.
- Risk: budget previews do not actually prevent runaway execution.
  - Mitigation: translate approved budgets into hard runtime caps and stop policies.
- Risk: rollout destabilizes existing direct Team room creation.
  - Mitigation: keep the new path additive; do not break direct `auto_team` room flows.
- Risk: learning loop creates noisy maintenance suggestions.
  - Mitigation: reuse workpack replay/readiness thresholds and existing auto-apply eligibility rules.

## Acceptance criteria

- Work Request can display a compiled work brief with explicit linked sources.
- Launch preview shows planned surfaces, approvals, and costs before Team starts.
- Launch preview shows approval snapshot status, target-team resolution, and surface-governance status before Team starts.
- Launch preview is available to the requester in a redacted user-safe form without requiring domain-admin access.
- Editing request fields or linked sources after preview invalidates the preflight bundle until it is regenerated.
- Team kickoff consumes the approved plan.
- `workflow` becomes a first-class automation surface where allowed.
- Skill maintenance can be proposed through the learning loop and routed through governed workflows.
- Locked private-vault or drifted sources fail closed before launch.
- Missing team resolution produces an explainable review state instead of silent kickoff failure.
- Team resolution follows a deterministic precedence order with explicit resolution codes.
- `workflow` and `skill_studio` remain blocked with compatibility diagnostics until Work OS surface contracts are migrated.
- Runtime budgets are enforced, not only estimated.
- Existing Work Request, Team room, and direct room creation flows remain functional during rollout.

## Rollout and testing notes

- Start with backend-only services and contract tests.
- Delay UI launch until compiled-brief and capability-plan APIs are stable.
- Keep `workflow` and `skill_studio` surfaces behind feature flags initially.
- Keep `workflow` and `skill_studio` auto-execution disabled by default in v1 even when planner visibility is enabled.
- Ship contract-compatibility gating before enabling runtime dispatch for any new surface that is not yet part of Work OS unions/router schemas/persistence enums.
- Ship requester-safe preview ACLs together with the first user-visible preflight screen.
- Add security telemetry for snapshot drift, governance downgrades, and team-resolution failures before broad rollout.
- Add telemetry for stale-preview invalidations and contract-compatibility blocks.
- Reuse Team ledger and Work OS timeline outputs for observability before adding new dashboards.
