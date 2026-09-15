<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts
section-02-persistence-migration
section-03-lifecycle-service
section-04-outbox-adapters
section-05-runtime-reconciler
section-06-monitor-security
section-07-python-celery-compatibility
section-08-verification-operations
END_MANIFEST -->

# Feature 186 Implementation Sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts | - | 02, 03, 04, 07 | Yes |
| 02 persistence/migration | 01 | 03, 04, 05, 06, 07 | No |
| 03 lifecycle service | 01, 02 | 04, 05, 06 | No |
| 04 outbox/adapters | 01, 02, 03 | 05, 07 | No |
| 05 runtime/reconciler | 03, 04 | 08 | No |
| 06 monitor/security | 03, 04 | 08 | Yes after 04 |
| 07 Python/Celery compatibility | 01, 04 | 08 | Yes after 04 |
| 08 verification/operations | 02–07 | - | No |

## Execution order

1. 01 contracts
2. 02 persistence/migration
3. 03 lifecycle service
4. 04 outbox/adapters
5. 05 runtime/reconciler, 06 monitor/security, and 07 Python/Celery compatibility
6. 08 verification/operations

## Section summaries

### section-01-contracts
Canonical types, status transitions, trusted identity, deterministic definition hashing, redaction, and contract tests.

### section-02-persistence-migration
Additive Drizzle schema/migration for lifecycle metadata, constraints/indexes, and safe dry-run/backfill tooling. Feature 189 owns transfer-specific plan/item/checkpoint schema.

### section-03-lifecycle-service
Transactional create/claim/lease/reporter/retry/cancel/reconcile operations with fencing and event sequencing.

### section-04-outbox-adapters
Transactional outbox publisher, dedupe/reclaim/quarantine behavior, and BullMQ/Celery-neutral transport adapters.

### section-05-runtime-reconciler
Executor/reporter integration, external wait, provider callback boundary, scheduler occurrence handling, and the existing reconciler job entry point.

### section-06-monitor-security
Canonical job monitor, cursor/timeline projection, guarded operator actions, tenant isolation, redaction, and the execution boundary consumed by Feature 189 for tenant-transfer cancellation/fencing.

### section-07-python-celery-compatibility
Python control-plane client, thin Celery wrappers/Beat intent helpers, and legacy reference migration inventory.

### section-08-verification-operations
Cross-section tests, rollout manifest, runbook, static inventory, migration verification, and final evidence gates.
