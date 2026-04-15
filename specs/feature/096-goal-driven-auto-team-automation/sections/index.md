<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-runtime-state-and-evidence-model
section-02-goal-driven-orchestration-loop
section-03-async-worker-polling
section-04-verification-review-risk-escalation
section-05-runtime-status-projection-ui
section-06-teams-ui-plan-visibility
section-07-tests-compatibility-rollout
END_MANIFEST -->

# Implementation Sections Index - Feature 096: Goal-Driven Auto Team Automation

This feature is a TypeScript / Vitest implementation inside `apps/web`. The runtime state model is expected to be layered over the existing team-run lifecycle, with richer snapshot data and UI projections.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-runtime-state-and-evidence-model | - | 02, 03, 04, 05, 06 | Yes (foundation) |
| section-02-goal-driven-orchestration-loop | 01 | 03, 04, 05, 06 | No |
| section-03-async-worker-polling | 01, 02 | 04, 05, 06 | No |
| section-04-verification-review-risk-escalation | 01, 02 | 05, 06, 07 | Yes after 02 |
| section-05-runtime-status-projection-ui | 01, 04 | 06, 07 | No |
| section-06-teams-ui-plan-visibility | 01, 04, 05 | 07 | No |
| section-07-tests-compatibility-rollout | 01, 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. `section-01-runtime-state-and-evidence-model` (foundation)
2. `section-02-goal-driven-orchestration-loop` and `section-04-verification-review-risk-escalation` (parallel after section 01, with section 02 first if needed for local dependencies)
3. `section-03-async-worker-polling` (after sections 01 and 02)
4. `section-05-runtime-status-projection-ui` and `section-06-teams-ui-plan-visibility` (after sections 01 and 04, with 06 following 05 as needed for shared UI state)
5. `section-07-tests-compatibility-rollout` (final integration and regression pass)

## Section Summaries

### section-01-runtime-state-and-evidence-model
Define the durable runtime overlay for team runs, extend snapshot capture, and establish the evidence payload that downstream steps will write and read.

### section-02-goal-driven-orchestration-loop
Refactor `runEngine` to continue based on goal progress and actionable work instead of a short turn budget.

### section-03-async-worker-polling
Add job-handle, polling, and completion semantics for async workers so the workflow waits on jobs instead of people.

### section-04-verification-review-risk-escalation
Encode the verification policy, reviewer routing, risk classes, and escalation boundaries that determine whether a step can advance.

### section-05-runtime-status-projection-ui
Expose the richer runtime state through read models and UI surfaces so operators can see what the run is waiting for.

### section-06-teams-ui-plan-visibility
Expose the durable plan in Teams so operators can inspect steps, owners, reviewers, status, and evidence continuously.

### section-07-tests-compatibility-rollout
Cover the new behavior with regression tests and preserve compatibility with existing paused/running/completed flows.
