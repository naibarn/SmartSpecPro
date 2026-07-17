<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-role-contract-migration
section-02-creation-reconciliation
section-03-legacy-normalization
section-04-skill-contract-bundle
section-05-skill-runtime-prompt-ownership
section-06-character-ui
section-07-visual-qa-observability
section-08-integration-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-role-contract-migration | — | 02, 03, 04, 05, 06 | No (schema single-writer) |
| section-02-creation-reconciliation | 01 | 03, 05, 06 | No |
| section-03-legacy-normalization | 01, 02 | 05 | No |
| section-04-skill-contract-bundle | 01 | 05 | Yes with 03 after 01 |
| section-05-skill-runtime-prompt-ownership | 03, 04 | 06, 07 | No |
| section-06-character-ui | 01, 02, 05 | 08 | No |
| section-07-visual-qa-observability | 05 | 08 | Yes with 06 after 05 |
| section-08-integration-verification | 01–07 | — | No |

## Execution Order

1. section-01-role-contract-migration (sequential DB/shared-contract foundation)
2. section-02-creation-reconciliation (after 01)
3. section-03-legacy-normalization and section-04-skill-contract-bundle (after 02/01,
   disjoint ownership; may be parallel if tooling permits)
4. section-05-skill-runtime-prompt-ownership (after 03 and 04)
5. section-06-character-ui and section-07-visual-qa-observability (after 05, disjoint
   ownership; UI browser evidence remains sequential within 06)
6. section-08-integration-verification (after all prior sections)

## Section Summaries

### section-01-role-contract-migration

Shared role taxonomy, DTOs, additive manual SQL migration, and contract tests.

### section-02-creation-reconciliation

Preset, wizard, seeding, Story Bible reconciliation, and all character creation paths.

### section-03-legacy-normalization

Idempotent backfill, review-required state, and V1-to-V2 input normalization.

### section-04-skill-contract-bundle

Skill V2 schemas, system/core/reference structure, fixtures, examples, and verification.

### section-05-skill-runtime-prompt-ownership

Runtime loader, canonical role propagation, semantic retries, model floor, and removal of
external prompt composition.

### section-06-character-ui

Canonical role/occupation labels, editor, warnings, responsive/accessibility behavior, and
browser evidence.

### section-07-visual-qa-observability

Post-generation QA, skill-owned revisions, provenance, and audit-safe telemetry.

### section-08-integration-verification

Focused test matrix, typecheck/migration/skill gates, impact review, and scoped diff proof.
