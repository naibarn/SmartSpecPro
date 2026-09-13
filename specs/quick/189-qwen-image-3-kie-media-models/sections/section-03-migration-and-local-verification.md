# Section 03: Migration and Local Verification

## Ownership

Conductor-owned files:

- `apps/web/drizzle/0302_qwen_image_3_media_models.sql`
- `apps/web/drizzle/meta/_journal.json`

## Work

After catalog definitions are stable, create an idempotent data migration that upserts exactly the two Qwen3 canonical rows with quoted camelCase columns, JSON config, enabled state, priority/sort order, and 30/50 pricing tiers. Append the next journal record after the confirmed `0301` head.

## TDD expectations

Add or update a migration source test that checks both model IDs, `image_urls`, paired IDs, pricing, `ON CONFLICT`, and journal tag. Run the migration tool against the configured local PostgreSQL database and query both rows directly.

## Acceptance checks

- `npm --workspace apps/web run db:migrate` applies `0302` without errors.
- SQL confirms exactly two intended rows with correct `configJson.apiConfig` and `configJson.inputFields`.
- A second migration invocation reports no pending `0302` work and does not duplicate rows.
- No schema generation or destructive operation is required.

## Risks

The local database may contain unrelated pending migrations from the dirty worktree. Inspect the migration table and report any pre-existing failure; do not mark the Qwen migration applied by manually editing migration bookkeeping.
