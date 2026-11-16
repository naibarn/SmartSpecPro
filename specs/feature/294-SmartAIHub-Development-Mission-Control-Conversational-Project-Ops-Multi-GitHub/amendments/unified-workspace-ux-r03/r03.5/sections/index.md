<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-runner-harness-contract
section-02-canonical-binding-and-read-model
section-03-core-api-and-live-integration
section-04-proof-dev-deploy-and-handoff
END_MANIFEST -->

# R03.5 Implementation Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-runner-harness-contract | — | 02 | No |
| section-02-canonical-binding-and-read-model | 01 | 03 | No |
| section-03-core-api-and-live-integration | 02 | 04 | No |
| section-04-proof-dev-deploy-and-handoff | 01, 02, 03 | — | No |

## Execution Order

1. Implement authenticated Runner Harness registration and tests.
2. Persist and reauthorize exact canonical bindings through the existing Job control plane.
3. Add Core projection and connect the existing LIVE Mission Control/Task Control navigation.
4. Run focused proof, migrate/deploy authorized DEV, inspect Runner availability, and update the existing handoff/spec ledger.
