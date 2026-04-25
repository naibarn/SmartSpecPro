<!-- PROJECT_CONFIG
runtime: python-uv
test_command: bash -lc 'cd python-backend && uv run pytest && cd ../apps/web && npm run test'
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contract-and-validation
section-02-isc-create-improve-and-migration
section-03-python-runtime-and-supervisor
section-04-web-execution-plumbing-and-lineage-capture
section-05-maintenance-compatibility-and-automatic-repair
section-06-admin-ui-and-observability
section-07-testing-rollout-and-operational-hardening
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-contract-and-validation | - | section-02, section-03, section-04, section-05, section-06, section-07 | Yes |
| section-02-isc-create-improve-and-migration | section-01 | section-04, section-05, section-06, section-07 | Yes |
| section-03-python-runtime-and-supervisor | section-01 | section-04, section-05, section-06, section-07 | Yes |
| section-04-web-execution-plumbing-and-lineage-capture | section-01, section-03 | section-05, section-06, section-07 | No |
| section-05-maintenance-compatibility-and-automatic-repair | section-01, section-02, section-03, section-04 | section-06, section-07 | No |
| section-06-admin-ui-and-observability | section-01, section-04, section-05 | section-07 | No |
| section-07-testing-rollout-and-operational-hardening | section-01, section-02, section-03, section-04, section-05, section-06 | - | No |

## Execution Order

1. section-01-contract-and-validation
2. section-02-isc-create-improve-and-migration and section-03-python-runtime-and-supervisor in parallel
3. section-04-web-execution-plumbing-and-lineage-capture
4. section-05-maintenance-compatibility-and-automatic-repair
5. section-06-admin-ui-and-observability
6. section-07-testing-rollout-and-operational-hardening

## Section Summaries

### section-01-contract-and-validation
Define the machine-readable subagent bundle contract and teach validation/discovery layers to enforce it.

### section-02-isc-create-improve-and-migration
Teach ISC to generate, improve, and migrate subagent-aware bundles.

### section-03-python-runtime-and-supervisor
Extend the Python Agents runtime and supervisor to load subagent-aware bundles, execute specialists, and persist lineage.

### section-04-web-execution-plumbing-and-lineage-capture
Extend web execution surfaces to package, launch, and trace subagent-aware runs.

### section-05-maintenance-compatibility-and-automatic-repair
Make maintenance and compatibility scoring understand subagent contract drift and safe repair.

### section-06-admin-ui-and-observability
Show topology, lineage, and failure reasons in Admin Skills, run detail, and dashboard views.

### section-07-testing-rollout-and-operational-hardening
Cover the full flow with tests and roll out safely without breaking single-agent bundles.
