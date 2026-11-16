<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test:core
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-db-correlation-read-model
section-02-core-api-contracts
section-03-live-ui-integration
section-04-proof-deploy-handoff
END_MANIFEST -->

# R03.4 Implementation Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-db-correlation-read-model | - | 02, 03 | No |
| section-02-core-api-contracts | 01 | 03 | No |
| section-03-live-ui-integration | 02 | 04 | No |
| section-04-proof-deploy-handoff | 01, 02, 03 | - | No |

## Execution Order

1. Implement and verify the DB correlation read model.
2. Implement authenticated Core contracts/routes and authorization tests.
3. Connect the existing LIVE route and exact Task Control deep links.
4. Run scoped verification, migrate/deploy DEV, and record evidence/UAT gaps.
