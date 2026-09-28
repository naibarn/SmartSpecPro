<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-profile-contracts
section-02-persistence-migrations
section-03-source-pack-api-gate
section-04-ingestion-vision
section-05-wizard-source-hub
section-06-draft-digest-integration
section-07-broll-production
section-08-legacy-rollout
section-09-convergence-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section                             | Depends On             | Blocks             | Parallelizable |
| ----------------------------------- | ---------------------- | ------------------ | -------------- |
| section-01-profile-contracts        | -                      | 02, 03, 04, 05, 06 | Yes            |
| section-02-persistence-migrations   | 01                     | 03, 04, 08         | No             |
| section-03-source-pack-api-gate     | 01, 02                 | 04, 05, 06, 08     | No             |
| section-04-ingestion-vision         | 01, 02, 03             | 05, 06, 07         | Limited        |
| section-05-wizard-source-hub        | 01, 03, 04             | 06, 08, 09         | No             |
| section-06-draft-digest-integration | 01, 03, 04, 05         | 07, 08, 09         | No             |
| section-07-broll-production         | 03, 04, 06             | 09                 | No             |
| section-08-legacy-rollout           | 01, 02, 03, 05, 06, 07 | 09                 | No             |
| section-09-convergence-proof        | 01-08                  | -                  | No             |

## Execution Order

1. section-01-profile-contracts
2. section-02-persistence-migrations
3. section-03-source-pack-api-gate
4. section-04-ingestion-vision
5. section-05-wizard-source-hub
6. section-06-draft-digest-integration
7. section-07-broll-production
8. section-08-legacy-rollout
9. section-09-convergence-proof

## Section Summaries

### section-01-profile-contracts

Create the single canonical profile registry and adapters for existing format,
look, visual grounding, evidence, disclosure, and source-slot contracts.

### section-02-persistence-migrations

Add normalized Source Pack, asset, slot, analysis, rights, readiness, session,
and audit persistence with staged-to-series ownership and safe migration.

### section-03-source-pack-api-gate

Expose owner/tenant-scoped tRPC operations, idempotent mutations, readiness
errors, staged-session claims, and server-enforced draft/creation gates.

### section-04-ingestion-vision

Implement upload/managed-media ingestion, place/product snapshots, slot
analysis, bounded vision descriptions, evidence normalization, and retries.

### section-05-wizard-source-hub

Replace conflicting creator controls with one profile-driven flow and add the
pre-draft Story Sources & Media hub with clear states, slots, and previews.

### section-06-draft-digest-integration

Compose Source Pack claims into draft prompts and bounded long-form digests,
combine source readiness with existing Draft Quality QC, and invalidate stale
inputs safely.

### section-07-broll-production

Bind approved images/video shots to B-roll and production prompts while
enforcing rights, disclosure, safe-zone, trim, and media durability checks.

### section-08-legacy-rollout

Project legacy product/look fields, preserve old projects, add feature flags,
observability, rollback/reconciliation, and migration compatibility proof.

### section-09-convergence-proof

Run focused tests, typecheck, static contract checks, five-plus review loops,
and document residual provider/browser/deployment boundaries explicitly.
