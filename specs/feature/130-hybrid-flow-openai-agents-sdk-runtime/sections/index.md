<!-- PROJECT_CONFIG
runtime: typescript-npm + python-pytest
test_command: cd apps/web && npm test -- hybrid && cd ../../python-backend && pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-flags-routing-fixtures
section-02-durable-persistence-migration
section-03-neutral-router-runtime-coordinator
section-04-python-sdk-hybrid-stage-support
section-05-stage-runner-integration
section-06-chat-routing-and-card-ui
section-07-neutral-hybrid-workspace-ui
section-08-commit-approval-retry-cancel
section-09-replay-rollout-operator-gates
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-flags-routing-fixtures | - | all | No |
| section-02-durable-persistence-migration | 01 | 03, 05, 07, 08, 09 | No |
| section-03-neutral-router-runtime-coordinator | 01, 02 | 05, 06, 07, 08 | No |
| section-04-python-sdk-hybrid-stage-support | 01 | 05, 09 | Yes after 01 |
| section-05-stage-runner-integration | 02, 03, 04 | 07, 08, 09 | No |
| section-06-chat-routing-and-card-ui | 01, 03 | 07, 09 | Yes after 03 |
| section-07-neutral-hybrid-workspace-ui | 03, 05, 06 | 09 | No |
| section-08-commit-approval-retry-cancel | 02, 03, 05 | 09 | No |
| section-09-replay-rollout-operator-gates | all | - | No |

## Execution Order

1. `section-01-contracts-flags-routing-fixtures`
2. `section-02-durable-persistence-migration`
3. `section-03-neutral-router-runtime-coordinator` and `section-04-python-sdk-hybrid-stage-support` may proceed after contracts, but section 03 depends on the persistence shape from section 02.
4. `section-05-stage-runner-integration`
5. `section-06-chat-routing-and-card-ui`
6. `section-07-neutral-hybrid-workspace-ui`
7. `section-08-commit-approval-retry-cancel`
8. `section-09-replay-rollout-operator-gates`

## Section Summaries

### section-01-contracts-flags-routing-fixtures

Define shared Hybrid runtime contracts, feature flags, executor registry types, version constants, and routing fixtures.

### section-02-durable-persistence-migration

Add durable execution/stage persistence and migration discipline so Redis is not the source of truth for started runs.

### section-03-neutral-router-runtime-coordinator

Make the Hybrid router and runtime coordinator neutral and independent from Chat-origin Agency.

### section-04-python-sdk-hybrid-stage-support

Upgrade and pin `openai-agents`, then extend the existing Python adapter for Hybrid stage execution.

### section-05-stage-runner-integration

Wire Node stage runner to the agent runtime client and persist normalized stage results.

### section-06-chat-routing-and-card-ui

Protect direct skill/media/prompt-enhance fast paths and update Chat confirmation UI for neutral Hybrid preview.

### section-07-neutral-hybrid-workspace-ui

Create neutral preview/execution workspace routes and stage/approval UI states.

### section-08-commit-approval-retry-cancel

Implement allowlisted commit executor behavior, durable approval/resume, repair, retry, and cancel semantics.

### section-09-replay-rollout-operator-gates

Add replay fixtures, release gates, rollback validation, observability requirements, and operator recovery documentation.

## Spec Coverage By Section

| Spec Area | Owning Section | Required Evidence |
|---|---|---|
| Shared Hybrid contracts, feature flags, executor registry, contract versioning | section-01 | Shared tests and routing fixture baseline |
| Durable execution, stage persistence, preview token policy, Redis-loss recovery | section-02 | Migration tests and reload/resume tests |
| Agency-free Chat-origin Hybrid router and runtime coordinator | section-03 | Router/coordinator unit tests without Agency dependency |
| Latest pinned `openai-agents` runtime through the existing adapter | section-04 | Python adapter contract tests and SDK health metadata |
| Node stage runner integration, normalized results, cost metadata | section-05 | Stage execution tests and budget/cost assertions |
| Direct media/prompt-enhance fast paths and neutral Chat confirmation card | section-06 | Direct-route regression tests and UI contract tests |
| Neutral `/hybrid` workspace, stage details, approval/trace redaction | section-07 | Workspace route tests and redaction/tenant-bound token checks |
| Commit approval, executor allowlist, repair, retry, cancel, idempotency | section-08 | Idempotency, audit, policy-denial, stale approval tests |
| Replay fixtures, shadow mode, rollout gates, operator playbook | section-09 | Replay pass, rollout checklist, recovery playbook |

## Implementation Sequencing Notes

- Section 01 is the contract root and should be completed before all other sections.
- Section 04 may run after Section 01 while Section 02 is in progress, but it must wait for Section 05 before affecting user-visible Hybrid execution.
- Sections 02, 03, 05, and 08 should be reviewed as one state-machine chain because they share execution lifecycle semantics.
- Section 06 protects existing Chat behavior. Its direct-route fixtures should be used as a regression gate before any Hybrid auto-detect rollout.
- Section 09 is the final release gate owner and should verify every prior section's evidence before enabling staging or canary flags.
