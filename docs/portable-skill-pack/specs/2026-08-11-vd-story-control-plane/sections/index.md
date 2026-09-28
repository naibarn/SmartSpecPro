<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test --workspace apps/web
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-and-benchmark
section-02-story-seed-and-ledger-planner
section-03-episode-slot-and-script-contract
section-04-reconciliation-and-quality-loop
section-05-legacy-audit-and-rollout
section-06-ui-observability
section-07-integration-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contract-and-benchmark | - | 02, 03, 04, 05, 06, 07 | Yes |
| section-02-story-seed-and-ledger-planner | 01 | 03, 04, 05 | No |
| section-03-episode-slot-and-script-contract | 01, 02 | 04, 07 | No |
| section-04-reconciliation-and-quality-loop | 01, 02, 03 | 05, 07 | No |
| section-05-legacy-audit-and-rollout | 01, 04 | 07 | No |
| section-06-ui-observability | 01, 04, 05 | 07 | No |
| section-07-integration-verification | 01, 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. section-01-contract-and-benchmark
2. section-02-story-seed-and-ledger-planner
3. section-03-episode-slot-and-script-contract
4. section-04-reconciliation-and-quality-loop
5. section-05-legacy-audit-and-rollout and section-06-ui-observability (parallel only after their dependencies)
6. section-07-integration-verification

## Section Summaries

### section-01-contract-and-benchmark

Shared schemas, source-of-truth rules, status transitions, capability fixtures and no-write skill benchmark.

### section-02-story-seed-and-ledger-planner

Full-story `story_control_seed`, approved breakdown mapping, existing ledger planner upgrade, romance/advantage annotations and planner conflict behavior.

### section-03-episode-slot-and-script-contract

Bounded episode context, canonical cast packet, script-builder output actions and compatibility with existing `open_loops`/`episode_memory`.

### section-04-reconciliation-and-quality-loop

Deterministic evidence reconciliation, memory-planner observation adapter, quality review dimensions, repair boundary and auth/concurrency failure handling.

### section-05-legacy-audit-and-rollout

Read-only legacy audit, current series 21 future horizon, user dispositions, feature flags and safe rollout/kill switch.

### section-06-ui-observability

Existing memory tabs extended with control status, evidence, romance/advantage timeline, responsive/accessibility requirements and browser evidence.

### section-07-integration-verification

End-to-end flow proof, cross-section contract checks, focused test matrix, migration safety and completion handoff.
