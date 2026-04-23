<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm run -w @smartspec/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-intake-review-and-compiled-brief
section-02-governed-context-and-capability-catalog
section-03-preflight-plan-and-launch-bridge
section-04-team-execution-graph-and-surface-adapters
section-05-learning-loop-workpacks-and-skill-maintenance
section-06-security-surface-governance-and-release-gates
section-07-ui-observability-and-rollout-controls
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-intake-review-and-compiled-brief | - | 02, 03, 07 | No |
| section-02-governed-context-and-capability-catalog | 01 | 03, 04, 06 | No |
| section-03-preflight-plan-and-launch-bridge | 01, 02 | 04, 06, 07 | No |
| section-04-team-execution-graph-and-surface-adapters | 02, 03 | 05, 06, 07 | No |
| section-05-learning-loop-workpacks-and-skill-maintenance | 04 | 07 | Yes |
| section-06-security-surface-governance-and-release-gates | 02, 03, 04 | 07 | Yes |
| section-07-ui-observability-and-rollout-controls | 01, 03, 04, 05, 06 | - | Yes |

## Execution Order

1. `section-01-intake-review-and-compiled-brief`
2. `section-02-governed-context-and-capability-catalog`
3. `section-03-preflight-plan-and-launch-bridge`
4. `section-04-team-execution-graph-and-surface-adapters`
5. `section-05-learning-loop-workpacks-and-skill-maintenance` and `section-06-security-surface-governance-and-release-gates`
6. `section-07-ui-observability-and-rollout-controls`

## Section Summaries

### section-01-intake-review-and-compiled-brief

Expose linked-source intake and build a governed `CompiledWorkBrief` before launch.

### section-02-governed-context-and-capability-catalog

Unify context sources and all execution surfaces into one planner-readable capability model.

### section-03-preflight-plan-and-launch-bridge

Generate a reviewable execution plan and persist it into the Work OS automation launch path.

### section-04-team-execution-graph-and-surface-adapters

Seed Team with the approved execution plan and make runtime routing plan-first.

### section-05-learning-loop-workpacks-and-skill-maintenance

Convert repeated outcomes into workpack, workflow, and skill-improvement proposals.

### section-06-security-surface-governance-and-release-gates

Codify privileged-surface rules, approval snapshots, team-resolution policy, and budget enforcement.

### section-07-ui-observability-and-rollout-controls

Deliver the request-review UX, telemetry, flags, and rollout controls needed for safe adoption.

## Supporting Appendices

- `../appendices/contracts-and-migration.md`
- `../appendices/security-and-authorization.md`
- `../appendices/preflight-lifecycle-and-api-contracts.md`
- `../appendices/runtime-budget-dispatch-policy.md`
- `../appendices/observability-event-taxonomy.md`

## Implementation Status

- 2026-04-22: sections 01-07 are now backed by shared contracts, Work OS preflight lifecycle APIs, Team runtime plan hydration, learning services, and request-page preflight review UI.
- Verification: `npm run -w @smartspec/web test -- client/src/pages/__tests__/WorkRequest.test.tsx`
- Verification: `npm run -w @smartspec/web test -- server/routers/__tests__/workOs.test.ts server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts server/services/__tests__/workIntakeSourceResolver.test.ts server/services/__tests__/workIntakeBriefService.test.ts server/services/__tests__/orchestratorCapabilityCatalogService.test.ts server/services/__tests__/preflightApprovalLifecycleService.test.ts server/services/__tests__/teamExecutionPlanService.test.ts server/services/__tests__/orchestratorLearningService.test.ts`
