<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-authority-migration-baseline
section-02-durable-logical-execution-state
section-03-compiler-plan-policy-projection
section-04-dependency-aware-run-scheduler
section-05-canonical-job-executor-lifecycle
section-06-versioned-node-adapters-preflight
section-07-persisted-graph-control-flow
section-08-checkpoints-human-suspension-resume
section-09-effects-replay-recovery
section-10-authorization-placement-governance
section-11-economics-fairness-operations
section-12-conformance-migration-release-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 authority-migration-baseline | - | all | No |
| 02 durable-logical-execution-state | 01 | 03, 04, 05, 07, 08, 09 | No; schema single-writer |
| 03 compiler-plan-policy-projection | 01, 02 | 04, 06, 10, 11 | No |
| 04 dependency-aware-run-scheduler | 02, 03 | 05, 07, 08, 09 | No |
| 05 canonical-job-executor-lifecycle | 02, 04 | 06, 07, 08, 09 | No |
| 06 versioned-node-adapters-preflight | 03, 05 | 07, 10, 12 | No |
| 07 persisted-graph-control-flow | 04, 05, 06 | 08, 09, 12 | No |
| 08 checkpoints-human-suspension-resume | 02, 04, 05, 07 | 09, 12 | No |
| 09 effects-replay-recovery | 02, 04, 05, 07, 08 | 10, 11, 12 | No |
| 10 authorization-placement-governance | 03, 06, 09 | 12 | No |
| 11 economics-fairness-operations | 03, 09, 10 | 12 | No |
| 12 conformance-migration-release-proof | 01-11 | - | No |

## Execution Order

1. Section 01 — owner and migration baseline.
2. Section 02 — conductor-only additive schema/migration work.
3. Sections 03–06 in the listed dependency order.
4. Sections 07–11 in the listed dependency order; integrate after every section.
5. Section 12 — full local acceptance and external gate accounting.

## Section Summaries

### section-01-authority-migration-baseline
Reconcile Spec 214/215/Feature 195/186 and Specs 207/220/225/226/229/251 ownership, inspect compatibility data, correct the stale Spec 251 claim, and prevent legacy workflow-engine revival.

### section-02-durable-logical-execution-state
Add durable run/node/attempt/readiness/output/checkpoint records and idempotent state-transition persistence linked to canonical worker jobs.

### section-03-compiler-plan-policy-projection
Compile and lock immutable plans, validate bindings/scopes/policies, and translate declared execution policies into normalized runtime requirements.

### section-04-dependency-aware-run-scheduler
Activate root/ready nodes only and transactionally coordinate logical readiness with physical job/outbox admission.

### section-05-canonical-job-executor-lifecycle
Complete the Feature 195 job adapter, fenced claim/result callbacks, typed handler registry, and durable state reconciliation.

### section-06-versioned-node-adapters-preflight
Provide exact manifest-bound adapter resolution and safe preflight outcomes for every canonical node type.

### section-07-persisted-graph-control-flow
Implement persisted router/fan-out/join/loop/subflow/partial execution and dynamic expansion limits.

### section-08-checkpoints-human-suspension-resume
Persist checkpoints and suspended state; accept only authorized, idempotent Spec 225/226 resume actions.

### section-09-effects-replay-recovery
Make output/effect settlement, retries, cancellation, replay, cache and orphan recovery safe under duplicates and uncertain outcomes.

### section-10-authorization-placement-governance
Revalidate authorization, capability/placement, secrets, data classification, residency and revocation; keep retrieval gated by Specs 229/220.

### section-11-economics-fairness-operations
Apply budget/quota/fairness, progress, audit, metrics, safe operator actions and truthful projections.

### section-12-conformance-migration-release-proof
Cover all Spec 215 headings/amendments, 16 node types and Spec 212 corpus, compatibility/rollback/DR, and name all external production gates.
