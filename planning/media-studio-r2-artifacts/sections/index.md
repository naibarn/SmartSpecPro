<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-artifact-ledger
section-02-transport-integration
section-03-backfill-command
section-04-history-ui
section-05-focused-verification
END_MANIFEST -->

# Implementation Sections Index

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-artifact-ledger | - | 02, 03, 04 | No; schema single-writer |
| section-02-transport-integration | 01 | 04, 05 | No |
| section-03-backfill-command | 01 | 05 | Yes after 01 |
| section-04-history-ui | 02 | 05 | No |
| section-05-focused-verification | 01-04 | - | No |

## Execution order

1. Schema and artifact service.
2. Transport integration.
3. Backfill command can follow section 01, but its shared service contract must remain frozen.
4. Media History UI after the normalized task projection exists.
5. Focused verification, migration checks, and residual-risk report.
