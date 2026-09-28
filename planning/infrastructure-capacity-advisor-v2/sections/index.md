<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation-policy-migration
section-02-collector-workload-storage
section-03-deterministic-assessment-forecast
section-04-skill-contract-reconciliation
section-05-guarded-runs-scheduler
section-06-admin-summary-details-ui
section-07-tests-observability-runbook
section-08-integration-rollout-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 foundation/policy/migration | - | 02, 03, 04, 05, 06 | No |
| 02 collector/workload/storage | 01 | 03, 04, 06 | Yes after 01 |
| 03 deterministic assessment/forecast | 01, 02 | 04, 06 | No |
| 04 skill contract/reconciliation | 01, 03 | 05, 06 | No |
| 05 guarded runs/scheduler | 01, 03, 04 | 07, 08 | No |
| 06 Admin summary/details UI | 01, 03, 04, 05 | 07, 08 | No |
| 07 tests/observability/runbook | 01–06 interfaces | 08 | Partial |
| 08 integration/rollout proof | 01–07 | - | No |

## Execution order

1. Complete section 01.
2. Implement sections 02 and the contract fixtures from 04 only where they do
   not depend on runtime behavior; otherwise keep 04 after 03.
3. Complete sections 02 → 03 → 04.
4. Complete sections 05 and 06 in dependency order; UI can proceed once DTO and
   lifecycle contracts are stable.
5. Complete section 07, then section 08 for target DB, scheduler, and browser
   proof.

## Section summaries

### section-01-foundation-policy-migration

Define canonical metric/coverage/policy/run types, additive schema/migration,
versioning, retention metadata, and baseline safeguards.

### section-02-collector-workload-storage

Normalize worker/job/queue evidence, host/container namespaces, disk/temp/Docker
storage, source freshness, and monitoring collection quality.

### section-03-deterministic-assessment-forecast

Implement pure status, threshold, coverage, trend, growth, forecast, and action
classification logic plus persisted decision evidence.

### section-04-skill-contract-reconciliation

Harden the infrastructure skill schemas/prompt/fixtures and reconcile every LLM
claim against authoritative server evidence.

### section-05-guarded-runs-scheduler

Implement the shared asynchronous run lifecycle, lock/idempotency, retry/timeout,
daily scheduling, audit metadata, retention execution, and Admin procedures.

### section-06-admin-summary-details-ui

Split and complete the Hybrid Admin UI with clear verdict/evidence, workload and
temp details, history, freshness/coverage/error states, and accessible responsive
behavior.

### section-07-tests-observability-runbook

Add focused tests, metrics/logging/runbook content, safe error handling, and
operational interpretation guidance.

### section-08-integration-rollout-proof

Run migration verification, focused and baseline-separated diagnostics, scheduler
and manual smoke tests, authenticated browser evidence, and rollout/rollback
gates.
