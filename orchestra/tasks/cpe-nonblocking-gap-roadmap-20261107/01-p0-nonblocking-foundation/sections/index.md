<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run <focused files>
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-canonical-reconciliation
section-02-advisory-hard-control-contract
section-03-nonblocking-regression-proof
END_MANIFEST -->

# P0 Sections — Non-Blocking CPE Foundation

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-canonical-reconciliation | - | 02, 03 | No |
| section-02-advisory-hard-control-contract | 01 | 03 | No |
| section-03-nonblocking-regression-proof | 01, 02 | P1–P4 implementation | No |

## Execution Order

1. Reconcile existing SPEC IDs and Feature 157 policy conflicts.
2. Freeze hard/advisory boundaries and preserve current contracts.
3. Prove the fault matrix and hard-control negative cases.

## Section Summaries

### section-01-canonical-reconciliation
Map every affected requirement to the current canonical owner, source path, tests, handoff state and conflict disposition. Do not allocate a new SPEC ID.

### section-02-advisory-hard-control-contract
Keep advisory result/report state distinct from media generation readiness and narrow any Feature 157 gate that conflates CPE quality with hard requirements.

### section-03-nonblocking-regression-proof
Add and run baseline-parity, failure-injection, explicit-approval/cancel, billing and hard-control tests; produce a report with evidence freshness.
