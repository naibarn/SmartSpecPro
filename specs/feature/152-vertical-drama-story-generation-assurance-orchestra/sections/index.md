<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-evidence
section-02-schema-credit
section-03-runtime-state
section-04-validation-repair
section-05-server-integration
section-06-ui-recovery
section-07-agents-adapter
section-08-rollout-observability
section-09-proof-gap-closure
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts/evidence | - | 02, 03, 04, 05 | Yes |
| 02 schema/credit | 01 | 03, 05 | No |
| 03 runtime state | 01, 02 | 05, 06 | No |
| 04 validation/repair | 01 | 05, 07 | Yes after 01 |
| 05 server integration | 02, 03, 04 | 06, 09 | No |
| 06 UI/recovery | 05 | 09 | No |
| 07 Agents adapter | 01, 04 | 09 | Yes after 04 |
| 08 rollout/observability | 03, 05 | 09 | Yes after 05 |
| 09 proof/gap closure | 01-08 | - | No |

## Execution Order

1. Section 01.
2. Sections 02 and 04, with 04 starting only after the shared contracts exist.
3. Section 03.
4. Section 05.
5. Sections 06, 07, and 08.
6. Section 09 and the acceptance-criteria gap loop.

## Section Summaries

### section-01-contracts-evidence
Pure contracts, canonicalization, fingerprints, snapshots, status rules, and
API summary types.

### section-02-schema-credit
Durable parent-run migration, repositories, episode linkage, and idempotent
credit reservation safety.

### section-03-runtime-state
Leases, fencing, event cursors, queue recovery, reconciliation, cancellation,
approval, and finalization.

### section-04-validation-repair
Bounded context, deterministic rule packs, plan alignment, Feature 132 quality
integration, and targeted repair.

### section-05-server-integration
Story job adapter and tRPC operations for generation, resume, repair, approval,
rejection, cancel, and validation.

### section-06-ui-recovery
Truthful series-detail statuses, progress, findings, and recovery actions.

### section-07-agents-adapter
Feature 151 contract adapter and optional, flag-gated Agents SDK orchestration.

### section-08-rollout-observability
Redacted telemetry, tenant-safe diagnostics, retention, migration preflight,
rollout flags, and operator runbook.

### section-09-proof-gap-closure
Golden/replay tests, focused verification, acceptance-criteria audit, and final
gap closure.
