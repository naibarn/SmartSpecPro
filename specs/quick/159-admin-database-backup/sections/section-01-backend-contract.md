# Section 01 — Backend Contract and Schema

## Ownership

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0241_admin_database_backups.sql`
- `apps/web/server/services/databaseBackupContracts.ts`
- `apps/web/server/routers/databaseBackups.ts`
- related backend contract tests

## Work

Define the durable job model, safe/full input, admin-only tRPC procedures, normalized summary shape,
and explicit artifact/status enums. Do not accept paths or arbitrary SQL from input.

## TDD

Cover validation, admin denial, row mapping, expiry visibility and malformed artifact values first.

## Risks

Migration must be scoped to the new table and not rewrite unrelated dirty migration files.
