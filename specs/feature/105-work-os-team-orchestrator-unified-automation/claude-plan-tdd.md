# Claude Implementation Plan - TDD

## Test Strategy

Implementation should proceed contract-first. Each section starts with focused Vitest tests that fail for the missing behavior, then implementation is added through existing service/router/UI boundaries.

Run focused tests from `apps/web` with:

```bash
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm exec -- vitest run <test-files>
```

Use `npm run check -- --pretty false` when practical, but expect unrelated repo-wide TypeScript failures until existing debt is addressed.

## Section 01 - Intake Review And Compiled Brief

Tests to write first:

- `apps/web/server/services/__tests__/workIntakeSourceResolver.test.ts`
  - Test: rejects malformed linked source refs.
  - Test: preserves explicit linked conversation, workpack, role-routine, and document refs.
  - Test: marks locked or unauthorized sources as omitted with diagnostics.
  - Test: applies tenant/RBAC/private-vault rules from `WorkIntakeActorContext`.
- `apps/web/server/services/__tests__/workIntakeActorContext.test.ts`
  - Test: derives tenant, actor, requester, roles, domain, and private-vault unlock state from server auth context.
  - Test: ignores client-provided trusted actor, role, permission, and unlock fields.
  - Test: distinguishes requester, admin, domain-admin, and unrelated user preview access.
- `apps/web/server/services/__tests__/workIntakeBriefService.test.ts`
  - Test: compiles request title/objective plus linked source summaries into `CompiledWorkBrief`.
  - Test: records source trust, freshness, inclusion, and omission diagnostics.
  - Test: redacts secret-bearing source fields before persistence.
  - Test: respects snippet/token budgets.
- `apps/web/server/routers/__tests__/workOs.intakeSources.test.ts`
  - Test: request create/update accepts valid linked sources.
  - Test: request create/update rejects invalid source payloads.
- `apps/web/client/src/pages/__tests__/WorkRequest.compiledBrief.test.tsx`
  - Test: shows linked source list.
  - Test: shows compiled brief preview.
  - Test: does not auto-start automation after request creation.

## Section 02 - Governed Context And Capability Catalog

Tests to write first:

- `apps/web/server/services/__tests__/orchestratorCapabilityCatalogService.test.ts`
  - Test: emits catalog entries for all orchestrator surfaces.
  - Test: includes selected and blocked reasons.
  - Test: marks `workflow` and `skill_studio` compatibility-blocked until migration.
  - Test: splits `skill_studio` by sub-action.
  - Test: never marks privileged surfaces auto-executable by default.
- `apps/web/server/services/__tests__/workOrchestratorSecurityPolicy.test.ts`
  - Test: returns minimum gates, required flags, and permissions per surface.
  - Test: distinguishes authorization, flag, and contract-compatibility failures.
- `apps/web/server/services/__tests__/governedContextAssembly.test.ts`
  - Test: carries unlock and sanitization metadata.
  - Test: omits restricted sources without unlock state.
  - Test: keeps policy and budget blocks explicit.
  - Test: produces different requester-safe vs admin-diagnostic views from the same decisions.

## Section 03 - Preflight Plan And Launch Bridge

Tests to write first:

- `apps/web/server/services/__tests__/workOrchestratorPlanningService.test.ts`
  - Test: produces `CapabilityPlan` and `TeamExecutionPlan` from brief and catalog.
  - Test: records blocked alternatives.
  - Test: includes approval boundaries and budget envelope.
- `apps/web/server/services/__tests__/approvalSourceSnapshotService.test.ts`
  - Test: creates stable source snapshots with integrity markers.
  - Test: detects drift for required sources.
  - Test: preserves unlock and sanitization state.
- `apps/web/server/services/__tests__/preflightRevisionService.test.ts`
  - Test: request/source/policy/team changes alter the fingerprint.
  - Test: equivalent source order normalizes deterministically.
- `apps/web/server/services/__tests__/preflightAccessPolicyService.test.ts`
  - Test: requester receives requester-safe preview.
  - Test: admin receives diagnostic preview.
  - Test: unrelated non-admin is blocked.
- `apps/web/server/services/__tests__/teamResolutionPolicyService.test.ts`
  - Test: explicit authorized team wins.
  - Test: case owner queue beats request default queue.
  - Test: missing team fails closed.
- `apps/web/server/routers/__tests__/workOs.preflight.test.ts`
  - Test: preview returns brief, catalog, team decision, revision, and diagnostics.
  - Test: requester diagnostics are redacted.
  - Test: stale approved bundle cannot launch.
- `apps/web/server/services/__tests__/preflightApprovalLifecycleService.test.ts`
  - Test: valid transitions cover draft, previewed, approved, stale, launch_blocked, launching, launched, cancelled, and superseded.
  - Test: invalid transitions fail closed with stable reason codes.
  - Test: regeneration supersedes the previous current bundle.
  - Test: approval is idempotent for identical input and conflicts for changed input.
- `apps/web/server/routers/__tests__/workOs.preflightApiContracts.test.ts`
  - Test: preview, regenerate, approve, get, invalidate, and launch procedures validate shared input/output contracts.
  - Test: launch compare-and-set prevents duplicate runs from concurrent requests.
  - Test: requester-safe read redacts admin diagnostics while admin read preserves them.
- `apps/web/server/services/__tests__/workAutomationFabricService.approvedPlan.test.ts`
  - Test: persists approved plan, snapshots, revision, and budget metadata.
- `apps/web/server/services/__tests__/approvedPlanPersistenceDecision.test.ts`
  - Test: JSON metadata path validates approved bundle schema at read time.
  - Test: migration-required decision is returned when cross-run query, dashboard, independent retention, or ledger/workpack join requirements are enabled.
  - Test: rollout cannot leave preview/beta without a recorded persistence decision.

## Section 04 - Team Execution Graph And Surface Adapters

Tests to write first:

- `apps/web/server/services/__tests__/teamExecutionPlanService.test.ts`
  - Test: loads approved execution plan for a run.
  - Test: rejects missing, stale, or incompatible plans when feature flag requires plan-first launch.
- `apps/web/server/services/__tests__/teamExecutionLaunchService.test.ts`
  - Test: seeds room/run with compiled brief and approved step graph.
  - Test: fails closed on drifted snapshots or missing team resolution.
- `apps/web/server/services/__tests__/runEngine.planSeed.test.ts`
  - Test: stores plan seed metadata without breaking direct room runs.
- `apps/web/server/services/__tests__/teamRunSkillExecutor.planRouting.test.ts`
  - Test: chooses explicit planned capability before heuristics.
  - Test: blocks compatibility-blocked surfaces.
  - Test: re-checks privileged surface authority at dispatch.
  - Test: records downgrade/block events.
- `apps/web/server/services/__tests__/agentRuntimeRequestBuilder.governedContext.test.ts`
  - Test: runtime request includes source refs and sanitization metadata.
  - Test: runtime request excludes secrets.
- `apps/web/server/services/__tests__/executionBudgetEnvelope.test.ts`
  - Test: dispatch stops when token/tool/media/runtime caps are exceeded.
- `apps/web/server/services/__tests__/runtimeDispatchPolicy.test.ts`
  - Test: compiles dispatch policy with authority, compatibility, input hash, budget reservation, timeout, retry, cancel, and dead-letter fields.
  - Test: next action reserves budget before dispatch and reconciles actual usage after completion.
  - Test: side-effecting retry requires unchanged input hash and idempotency verification.
  - Test: timeout, cancel, and dead-letter outcomes record stable reason codes and recovery hints.

## Section 05 - Learning Loop, Workpacks, And Skill Maintenance

Tests to write first:

- `apps/web/server/services/__tests__/orchestratorLearningService.test.ts`
  - Test: successful repeated Team runs produce workpack candidates.
  - Test: repeated exceptions produce explainable improvement proposals.
  - Test: low-confidence or noisy outcomes are suppressed.
- `apps/web/server/services/__tests__/learningProposalLifecycle.test.ts`
  - Test: proposals transition through generated, deduped, triaged, accepted, scheduled, applied, rejected, expired, and superseded states.
  - Test: rejected, expired, and superseded proposals remain auditable but do not auto-reopen.
  - Test: applied proposals link to resulting workpack, workflow change, skill version, or maintenance task.
- `apps/web/server/services/__tests__/workpackLearningBridge.test.ts`
  - Test: reuses replay/readiness thresholds.
  - Test: packages evidence refs into workpack candidates.
- `apps/web/server/services/__tests__/skillMaintenanceHandoff.test.ts`
  - Test: routes skill improvement proposals through Skill Studio governance.
  - Test: blocks auto-apply for non-admin callers.
  - Test: blocks publish/widen-visibility without required authority.

## Section 06 - Security, Surface Governance, And Release Gates

Tests to write first:

- `apps/web/server/services/__tests__/workOrchestratorSecurityPolicy.test.ts`
  - Test: all surfaces have explicit governance rules.
  - Test: `workflow` requires flags, permission, approval, and contract support.
  - Test: `skill_studio` sub-actions have distinct authority.
  - Test: reason-code families are exported from small policy helpers rather than hidden in route/UI logic.
- `apps/web/server/services/__tests__/workOrchestratorSecurityPolicyBoundaries.test.ts`
  - Test: surface governance helper does not perform source drift checks.
  - Test: source drift helper does not perform budget enforcement.
  - Test: redaction helper returns requester-safe diagnostics without exposing admin-only fields.
  - Test: contract compatibility helper distinguishes migration blocks from authorization blocks.
- `apps/web/server/services/__tests__/approvalSourceSnapshotService.test.ts`
  - Test: drift blocks launch and runtime.
  - Test: locked private-vault state is preserved and enforced.
- `apps/web/server/services/__tests__/executionBudgetEnvelope.test.ts`
  - Test: approved forecast converts to runtime caps.
  - Test: runtime cap failures are distinguishable from auth failures.
- `apps/web/server/services/__tests__/runtimeDispatchSecurityPolicy.test.ts`
  - Test: side-effecting retries require authority and idempotency validation.
  - Test: dead-letter recovery requires manual approval or a new approved plan revision.
- `apps/web/server/routers/__tests__/workOs.preflightSecurity.test.ts`
  - Test: requester preview is redacted.
  - Test: unrelated users cannot preview.
  - Test: privileged diagnostics require admin/domain-admin.
- `apps/web/server/services/__tests__/contractCompatibilityGates.test.ts`
  - Test: planner-visible but non-migrated surfaces cannot dispatch.
  - Test: compatibility failures are recorded separately from authorization failures.

## Section 07 - UI, Observability, And Rollout Controls

Tests to write first:

- `apps/web/client/src/pages/__tests__/WorkRequest.preflight.test.tsx`
  - Test: user can review compiled brief and capability plan before launch.
  - Test: launch button is disabled for stale preview.
  - Test: missing team resolution displays actionable review-required state.
  - Test: requester-safe blocked reasons are visible without admin internals.
- `apps/web/client/src/pages/__tests__/Chat.createWorkRequest.test.tsx`
  - Test: chat action opens Work Request with conversation linkage prefilled.
  - Test: user can edit title/objective before saving.
- `apps/web/client/src/components/orchestrator/__tests__/AutoTeamLedgerPanel.planTrace.test.tsx`
  - Test: ledger displays planned vs actual surface choices.
  - Test: ledger displays compatibility and governance block diagnostics.
- `apps/web/server/services/__tests__/workOrchestratorTelemetry.test.ts`
  - Test: emits source inclusion/exclusion events.
  - Test: emits stale preview, team resolution, budget, and compatibility events.
- `apps/web/server/services/__tests__/workOrchestratorTelemetryTaxonomy.test.ts`
  - Test: every Feature 105 event has event name, version, severity, actor class, redaction mode, correlation ids when available, and primary reason code.
  - Test: requester-safe telemetry omits admin-only fields and raw source excerpts.
  - Test: runtime and UI events can be correlated by request, preflight bundle, automation run, Team run, and plan step ids.
- `apps/web/server/services/__tests__/workOrchestratorFeatureFlags.test.ts`
  - Test: rollout flags disable new privileged surfaces by default.
  - Test: flags allow planner visibility without runtime dispatch.
- `apps/web/client/src/pages/__tests__/WorkRequest.preflightAccessibility.test.tsx`
  - Test: preflight review is keyboard navigable and manages focus after regenerate/block states.
  - Test: disabled launch controls expose a screen-reader-accessible reason.
  - Test: user-facing reason summaries and action labels come from translation keys.
  - Test: admin diagnostics remain hidden behind progressive disclosure for requester-safe views.

## Broad Regression Suite

Run or extend focused regressions for:

- Work OS router and service tests.
- Work Request and My Requests UI tests.
- Team run and skill executor tests.
- Context builder and runtime request builder tests.
- Workpack learning tests.
- Skill Studio governance tests.
- Team ledger and monitoring tests.
