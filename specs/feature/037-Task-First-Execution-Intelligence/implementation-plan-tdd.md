# Feature 037 TDD Plan

Testing frameworks:

- TypeScript: Vitest
- Python: pytest

## Section 1 — Runtime correction and execution-policy enforcement

### Files

- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/skillRegistry.ts`
- `packages/skills/src/types.ts`

### Tests first

```ts
// apps/web/server/routers/__tests__/chat.taskExecutionPolicy.test.ts
// Test: skill invocation uses skill llm policy instead of conversation.model
// Test: direct chat (non-skill) still uses conversation model
// Test: strictProviderPin is respected for skill-driven LLM calls
// Test: preferredProviderId is propagated correctly for skill policy paths
// Test: explicit per-skill override is only used when allowed by policy
```

```ts
// apps/web/server/__tests__/skillsPolicyParser.test.ts
// Test: parses execution_policy from skill frontmatter
// Test: preserves backward compatibility when execution_policy is absent
// Test: maps requirements/fixed/hybrid modes correctly into SkillDefinition
// Test: parses modelRequirements and preferredProfiles without pinning a concrete model
```

## Section 2 — Capability registry and skill policy schema

### Files

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/services/llmRouter.ts`
- `packages/shared/src/types/chat.ts`

### Tests first

```ts
// apps/web/server/routers/llmProviders.capabilities.test.ts
// Test: availableModels returns capability flags for enabled mapped models
// Test: disabled models are excluded from planner-visible catalog
// Test: contextLength and capability fields survive mergeAvailableLlmModels
```

```ts
// apps/web/server/services/taskModelFiltering.test.ts
// Test: filters out models missing required capabilities
// Test: filters out models below minContextLength
// Test: prefers healthy enabled providers for the same model
// Test: respects tenant/admin disablement rules
// Test: route-level capabilities differ across providers for same canonical model and planner chooses compatible route
// Test: the same requirement set resolves differently for tenant A vs tenant B when allow/block policy differs
```

## Section 3 — Task planner, task_runs, and billing normalization

### Files

- new planner service in `apps/web/server/services/`
- new model resolver service in `apps/web/server/services/`
- `apps/web/server/services/creditService.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- new DB table and router/service support for `task_runs`

### Tests first

```ts
// apps/web/server/services/taskExecutionPlanner.test.ts
// Test: classifies simple translation as direct_completion
// Test: classifies latest research request as responses_with_builtin_tools
// Test: classifies finished deck request as deterministic_pipeline or direct artifact path
// Test: classifies multi-role broad generation request as agency_swarm
// Test: chooses cheapest viable enabled model above success threshold
// Test: degrades gracefully when ideal capability set is unavailable
// Test: explicit skill invocation wins over conversation default model
// Test: explicit run override wins over planner auto selection
// Test: planner emits approvalPolicy when strategy requires browser/sandbox/tool escalation
// Test: planner output includes precedenceWinner, routeMode, and reservation policy fields for downstream execution
// Test: stored planVersion is validated before execute/resume
// Test: planner emits requirements/profile intent even when no concrete model is preselected
// Test: task_runs.planJson remains immutable while execution enrichments are written elsewhere
// Test: plan-level approval policy remains stable while approval decision is deferred to execution-time attempt state
// Test: incompatible stored planVersion fails closed and requires regeneration or explicit migration
// Test: plannedCapabilities/plannedTools in plan are not overwritten by observed runtime usage
// Test: preferredProviderId is treated as a hint and can be ignored when policy/capability/health disallow it
```

```ts
// apps/web/server/services/modelResolver.test.ts
// Test: resolves a concrete provider route from capability requirements at execution time
// Test: retry inside the same step attempt reuses the same resolved snapshot
// Test: fallback attempt creates a new snapshot with explicit reason
// Test: provider outage resolves a backup route without reusing a blocked route
// Test: attemptedModels and maxModelEscalations prevent A -> B -> A loops
// Test: premium fallback resolves candidate route first, then pauses for approval before opening a new attempt
// Test: resolved snapshot persists catalogSnapshotVersion and capabilitySnapshotVersion for replay
// Test: resolved snapshot references retained catalog/capability snapshot records that can be loaded for audit
// Test: profile ordering cheap < balanced < reliable < premium drives higher_profile approval checks consistently
```

```ts
// apps/web/server/services/taskBillingAdapter.test.ts
// Test: records task_runtime source type for planner-selected runs
// Test: records planner overhead separately when planner-judge is enabled
// Test: aggregates retries/fallback attempts without losing attempt-level detail
// Test: skill-initiated Responses API charges are classified as skill/task, not browser-only
// Test: soft reservation is created for async planner-selected runs
// Test: incremental settlements reconcile against reservation correctly
// Test: retry path does not double-charge already settled attempts
// Test: final task ledger matches aggregated settled usage after reservation release
// Test: fallback from cheap to premium uses the pricing snapshot of each attempt rather than current catalog prices
```

```ts
// apps/web/server/services/taskRunStateMachine.test.ts
// Test: task run transitions planned -> queued -> running -> succeeded
// Test: task run can enter waiting_tool / waiting_background / waiting_approval
// Test: failed retry creates retry linkage without mutating historical attempt record
// Test: idempotent rerun with same key does not duplicate artifact creation
// Test: worker reclaim after lease expiry continues with the persisted step snapshot
// Test: resume of a started step uses the same resolved snapshot even if catalog/policy changed
// Test: waiting_approval resume does not lose reservation or model snapshot semantics
// Test: step-attempt records retain approval and reservation snapshots needed for reconstructing state
// Test: step-attempt records store approval decision separately from the immutable run plan
// Test: lastApprovalSatisfiedAt reflects the latest satisfied approval event without replacing attempt-level approval history
```

## Section 4 — Direct artifact execution

### Files

- planner integration with `aiPresentationService.ts`
- new artifact-oriented internal tool/router glue
- message/artifact/task-run persistence

### Tests first

```ts
// apps/web/server/services/taskArtifactExecution.test.ts
// Test: presentation task routes into deterministic draft pipeline when fidelity is required
// Test: direct completion path can produce a structured report artifact envelope
// Test: artifact metadata is linked to task_runs and downstream messages
// Test: failed direct artifact generation can fall back to deterministic pipeline when configured
// Test: website/code artifact paths must satisfy minimum artifact contract before planner marks run successful
```

## Section 5 — AgencySwarm integration and rollout controls

### Files

- `apps/web/server/routers/agency.ts`
- `python-backend/app/services/agency_orchestrator.py`
- `python-backend/app/services/agency_tools.py`

### Tests first

```ts
// apps/web/server/routers/__tests__/agency.taskPlannerIntegration.test.ts
// Test: planner can escalate a task into agency execution
// Test: agency invocation receives model/budget/task metadata
// Test: agency-generated artifact outputs remain linked to task_runs
// Test: planner does not auto-escalate into agency when approval gate is unmet
```

```python
# python-backend/tests/test_agency_task_runtime_bridge.py
# Test: agency orchestrator receives planner-selected execution context
# Test: agency tool calls preserve task run identifiers
# Test: planner-selected budget metadata is available for downstream billing/audit
```

## Regression suite

### Required before rollout

- existing skill execution tests
- existing responses route tests
- existing AI draft / presentation tests
- existing agency router/orchestrator tests
- new billing attribution tests across task runtime paths
