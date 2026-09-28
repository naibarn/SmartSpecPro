<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-contracts
section-02-resolver-linking
section-03-billing-propagation
section-04-backfill-audit
section-05-reports-api
section-06-credits-ui
section-07-verification-operations
END_MANIFEST -->

# Feature 166 Implementation Sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-schema-contracts | - | 02, 03, 04, 05 | No |
| section-02-resolver-linking | 01 | 03, 04, 05 | No |
| section-03-billing-propagation | 01, 02 | 04, 05 | No |
| section-04-backfill-audit | 01, 02, 03 | 05, 07 | No |
| section-05-reports-api | 01, 02, 03, 04 | 06, 07 | No |
| section-06-credits-ui | 05 | 07 | No |
| section-07-verification-operations | 01-06 | - | No |

## Execution Order

1. Schema/type foundation.
2. Resolver/link writer/lifecycle.
3. Central billing and audited caller propagation.
4. Backfill, audit, static caller guard, and runbook.
5. Shared reports and APIs.
6. Credits UI.
7. Full verification, parity, observability, and final quality pass.

## Section Summaries

### section-01-schema-contracts
Add the native UUID schema/migration and shared context/source/report contract
types. Migration is 0264 after the existing 0263 journal entry.

### section-02-resolver-linking
Implement registry-backed resolution, ownership/root validation, atomic links,
lifecycle reconciliation, snapshots, audit, and metrics.

### section-03-billing-propagation
Integrate context into central debit/refund/reservation/Skill/LLM boundaries,
preserve idempotency and queue authorization, and classify caller coverage.

### section-04-backfill-audit
Implement dry-run/resumable historical lineage backfill, read-only audit, AST
caller inventory, and operational rollout runbook.

### section-05-reports-api
Implement one accounting/report service and self/admin history extension,
summary, detail, and export procedures with watermark and tenant isolation.

### section-06-credits-ui
Add readable context labels, summary/data-quality totals, filters/detail/export
states, localization, and responsive accessible Credits behavior.

### section-07-verification-operations
Close cross-section gaps, run focused/full tests and typechecks, validate
migrations/audits/parity, and record local versus authenticated evidence.
