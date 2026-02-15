# Section 02 Code Review Interview

## Review Summary
- **CRITICAL #1**: NULL tenantId breaks unique index → **Auto-fixed**: backfill already run for all 5 rows
- **CRITICAL #2**: Missing FK on library_links.tenantId → **Auto-fixed**: added `.references(() => tenants.id, { onDelete: "cascade" })`
- **HIGH #3**: idempotency_key snake_case vs camelCase → **User chose: Fix to camelCase** → Renamed to `"idempotencyKey"` in schema, migration SQL, and DB
- **HIGH #4**: json vs jsonb → **Auto-fixed**: Changed to `jsonb()` in schema and DB
- **HIGH #5**: channelToken plaintext → **User chose: HMAC-SHA256 with pepper** → Renamed to `channelTokenHash` (varchar(128)) in schema, migration SQL, and DB. HMAC implementation deferred to Section 10 (sync webhooks) where the token is actually generated/validated.
- **MEDIUM #6-10**: Let go (migration numbering acceptable, test gaps are shallow checks that still catch regressions, backfill was run manually)
- **LOW #11-13**: Let go (journal rename is harmless, CHECK constraint and scopes format are acceptable for MVP)

## Fixes Applied
1. `schema.ts`: Added `jsonb` import
2. `schema.ts`: `idempotencyKey` column name changed from `"idempotency_key"` to `"idempotencyKey"`
3. `schema.ts`: WHERE clause updated to use quoted `"idempotencyKey"`
4. `schema.ts`: `library_links.tenantId` now has `.references(() => tenants.id, { onDelete: "cascade" })`
5. `schema.ts`: `folderSelections` and `fileTypeFilter` changed from `json()` to `jsonb()`
6. `schema.ts`: `channelToken` renamed to `channelTokenHash` with length increased to 128
7. `0024_opposite_exiles.sql`: Updated to match all schema fixes
8. `schema.googleDrive.test.ts`: Added test for `channelTokenHash` existence and `channelToken` absence
9. DB: All changes applied directly (rename, alter type, add FK, rebuild index)
