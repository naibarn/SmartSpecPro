<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-safe-worker-projection
section-02-grouping-aggregate
section-03-router-contract
section-04-task-control-ui
section-05-integration-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-safe-worker-projection | - | 02, 03 | No |
| section-02-grouping-aggregate | 01 | 03, 04 | No |
| section-03-router-contract | 01, 02 | 04 | No |
| section-04-task-control-ui | 03 | 05 | No |
| section-05-integration-proof | 04 | - | No |

## Execution order

1. Safe projection and regression tests.
2. Grouping/aggregation and dependency coverage.
3. Protected router and plan metadata contract.
4. Expandable Task Control UI.
5. Browser proof, documentation and final review.

## Section summaries

### section-01-safe-worker-projection
Add safe persisted metadata/progress fields and scoped dependency reads.

### section-02-grouping-aggregate
Build the deterministic hierarchical task-group view model.

### section-03-router-contract
Expose the view model through protected tRPC and persist stable step order.

### section-04-task-control-ui
Render all open groups with accessible expansion, progress and cancellation.

### section-05-integration-proof
Prove the user flow responsively and document evidence/limitations.
