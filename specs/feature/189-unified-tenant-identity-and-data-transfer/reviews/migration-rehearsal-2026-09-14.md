# Feature 189 migration rehearsal — 2026-09-14

Status: `PASS / LOCAL NON-PRODUCTION ONLY`

This rehearsal verifies the additive Feature 189 schema and identity backfill
against the repository's local PostgreSQL target. It is not production
deployment evidence and does not authorize any Feature 189 runtime flag.

## Applied migrations

- `apps/web/drizzle/0316_feature_189_tenant_identity_and_data_transfer.sql`
- `apps/web/drizzle/0317_feature_189_tenant_identity_backfill_completion.sql`
- Drizzle journal latest entry: `idx=303`
- Both journal hashes match `drizzle.__drizzle_migrations`.
- `npm run db:migrate` was run twice; the second run completed successfully
  without changing the observed result.

## Database result

- Seven Feature 189 tables exist.
- `users.tenantIdentityMigrationReason`,
  `users.tenantIdentityMigratedAt`, and
  `tenant_data_transfer_previews.createdByUserId` exist.
- Required foreign keys, unique indexes, partial destination uniqueness, and
  state/command checks exist.
- Twelve users were assigned from a unique active registered-domain match and
  twelve immutable `tenant_identity_events` backfill rows were recorded.
- Three non-system users and one system user remain without a tenant binding;
  no arbitrary tenant was selected for them.
- Backfill event `priorCredits` equals `currentCredits` for every recorded row.
- No `tenant_data_transfer` job, preview, or transfer item was created.

## Verification

The read-only post-migration loop passed `20/20` checks covering journal
ordering, applied hashes, table/column presence, indexes, foreign keys, check
constraints, additive SQL safety, and bounded/idempotent backfill results.

`npm type check` / `tsc` was intentionally not run because the available RAM
was insufficient; this is an explicit verification limitation, not a pass.

Production gates remain open for Feature 186 compatibility retirement, Feature
187/188 acceptance, Feature 189 runtime/handler/UI implementation, provider and
PITR recovery evidence, and deployment approval.

## Existing ledger note

The repository contains historical/manual SQL artifacts that are not a one-to-
one match with the Drizzle journal and the local database's older migration
rows. No bulk ledger rewrite, deletion, or reordering was attempted. This
rehearsal used the Drizzle journal as migration authority and verified the
exact `0316`/`0317` journal entries and hashes; full historical ledger
reconciliation remains a separate release gate before production use.
