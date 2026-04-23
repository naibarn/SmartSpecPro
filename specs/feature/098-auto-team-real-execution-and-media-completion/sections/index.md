<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-and-contracts
section-02-route-policy-and-family-gate
section-03-stage-engine-and-run-loop
section-04-media-job-lifecycle
section-05-agency-delegation-and-complex-work
section-06-review-finalization-and-loop-guards
section-07-workos-team-ui-and-monitoring
section-08-backfill-rollout-debugging-and-e2e
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-and-contracts | - | 02, 03, 04, 05, 06, 07, 08 | No |
| section-02-route-policy-and-family-gate | 01 | 03, 04, 05, 06, 08 | No |
| section-03-stage-engine-and-run-loop | 01, 02 | 04, 05, 06, 07, 08 | No |
| section-04-media-job-lifecycle | 01, 02, 03 | 06, 07, 08 | Yes |
| section-05-agency-delegation-and-complex-work | 01, 02, 03 | 06, 07, 08 | Yes |
| section-06-review-finalization-and-loop-guards | 01, 02, 03, 04, 05 | 07, 08 | No |
| section-07-workos-team-ui-and-monitoring | 01, 03, 04, 05, 06 | 08 | Yes |
| section-08-backfill-rollout-debugging-and-e2e | 01, 02, 03, 04, 05, 06, 07 | - | No |

## Execution Order

1. `section-01-schema-and-contracts`
2. `section-02-route-policy-and-family-gate`
3. `section-03-stage-engine-and-run-loop`
4. `section-04-media-job-lifecycle` and `section-05-agency-delegation-and-complex-work` after section 03
5. `section-06-review-finalization-and-loop-guards`
6. `section-07-workos-team-ui-and-monitoring`
7. `section-08-backfill-rollout-debugging-and-e2e`

## Section Summaries

### section-01-schema-and-contracts

Add canonical Auto-Team execution tables, trace events, artifact refs, shared TypeScript contracts, route/stage/review/final-result types, and schema tests.

### section-02-route-policy-and-family-gate

Classify objectives into route classes, enforce allowed capability families, block wrong skill families, and persist route decisions.

### section-03-stage-engine-and-run-loop

Create stage plans, claim/advance stages with DB-backed locking, emit durable trace events, apply timeout policy, attach work items/messages to stages, integrate with the run engine, inject Chat-grade memory sources into Team prompts, and make guided room sends resume real `team_chat` runs.

### section-04-media-job-lifecycle

Submit/poll media jobs through existing media capabilities, preserve provider/model decisions, enforce budget/safety/idempotency, persist job refs, and attach canonical media results/artifacts.

### section-05-agency-delegation-and-complex-work

Turn complex work into governed Agency Swarm stages with durable agency run handles, polling, and completion evidence.

### section-06-review-finalization-and-loop-guards

Add reviewer scoring, repair loops, human approval gates, route-specific completion evidence, duplicate-loop guard, stop, cancel, and retry.

### section-07-workos-team-ui-and-monitoring

Make Work OS, My Requests, Team rooms, run monitor, room switching, request language/editing, guided room assistant flow, scoped-memory ACL surfaces, RBAC-controlled actions, and collapsible panels reflect canonical execution state.

### section-08-backfill-rollout-debugging-and-e2e

Add feature flag rollout, rollback/read-only mode, legacy backfill markers, debug room/run snapshot tooling, migration verification, scoped-memory/access verification, and end-to-end coverage for media completion, guided room continuity, and misroute blocking.
