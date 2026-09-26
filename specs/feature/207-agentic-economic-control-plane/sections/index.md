<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-economic-contracts
section-02-ledger-persistence
section-03-reserve-capture-settlement
section-04-policy-routing-revenue
section-05-api-audit-projections
section-06-migration-release-gates
END_MANIFEST -->

# Spec 207 Sections Index

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-economic-contracts | - | 02, 03, 04, 05 | No |
| section-02-ledger-persistence | 01 | 03, 04, 05, 06 | No |
| section-03-reserve-capture-settlement | 01, 02 | 04, 05, 06 | No |
| section-04-policy-routing-revenue | 01, 02, 03 | 05, 06 | No |
| section-05-api-audit-projections | 01–04 | 06 | No |
| section-06-migration-release-gates | 01–05 | - | No |

## Execution order

Run sections in manifest order. Each section must pass its focused red/green
tests before the next section changes shared contracts.

