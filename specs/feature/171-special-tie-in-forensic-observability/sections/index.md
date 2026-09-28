<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-forensic-storage
section-02-provider-observers
section-03-special-lifecycle
section-04-admin-retention
section-05-integration-proof
END_MANIFEST -->

# Implementation Sections Index

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-forensic-storage | - | 02, 03, 04 | Yes |
| section-02-provider-observers | 01 | 03 | No |
| section-03-special-lifecycle | 01, 02 | 04, 05 | No |
| section-04-admin-retention | 01 | 05 | Yes after 01 |
| section-05-integration-proof | 02, 03, 04 | - | No |

## Execution order

1. Storage/redaction contract and tests.
2. Provider/retry observer contract and tests.
3. Special adapter lifecycle integration and bounded progress.
4. Admin retrieval/retention and security tests.
5. Integration, regression, and quality gates.
