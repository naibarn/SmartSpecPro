# Section 02 Code Review: Database Schema -- New Tables and Extensions

## Severity Legend
- **CRITICAL**: Will cause data corruption, security breach, or runtime crash
- **HIGH**: Will cause incorrect behavior or query failures in production
- **MEDIUM**: Deviation from plan, naming inconsistency, or missing coverage
- **LOW**: Style issue or minor improvement opportunity

---

## CRITICAL Issues

### 1. `library_links.tenantId` unique index does NOT enforce uniqueness for NULL tenantId rows

**File:** `apps/web/drizzle/schema.ts` line 1566

In PostgreSQL, `NULL != NULL` in unique indexes. Rows with `tenantId IS NULL` will NOT be constrained by this index. Two rows with identical `(linkType, linkId, tenantId=NULL)` can coexist.

**Fix:** Either (a) make the backfill part of the migration transaction, or (b) use `NULLS NOT DISTINCT` in the unique index (PostgreSQL 15+), or (c) add a partial unique index for the NULL case.

### 2. `library_links.tenantId` has no FK reference to `tenants.id`

**File:** `apps/web/drizzle/schema.ts` line 1563

Every other `tenantId` column references `tenants.id` with `onDelete: "cascade"`. This column has no `.references()` call. Nullable FK columns are valid in PostgreSQL.

**Fix:** Add `.references(() => tenants.id, { onDelete: "cascade" })`.

---

## HIGH Issues

### 3. Column naming inconsistency: `idempotency_key` uses snake_case in a camelCase table

**File:** `apps/web/drizzle/schema.ts` line 219

The `creditTransactions` table uses camelCase for column names (`userId`, `balanceAfter`, `referenceId`, `createdAt`). The new column breaks convention with snake_case `idempotency_key`.

### 4. `folderSelections` and `fileTypeFilter` use `json` instead of `jsonb` as specified in plan

**File:** `apps/web/drizzle/schema.ts` lines 1678-1679

The plan specifies `jsonb`. These columns will be queried with containment operators for folder matching, which requires `jsonb` for indexing.

### 5. `channelToken` stored in plaintext -- security concern

**File:** `apps/web/drizzle/schema.ts` line 1682

The plan describes `channel_token` as a crypto-random token for webhook validation. Per CLAUDE.md: "API keys, passwords, tokens -> Store encrypted." Consider hashing or encrypting.

---

## MEDIUM Issues

### 6. Python migration numbered `004` but plan specifies `003` — Acceptable deviation.

### 7. Missing Vitest test cases for index/constraint verification and column defaults.

### 8. Missing pytest test case: `test_migration_is_reversible`.

### 9. No backfill SQL documented in migration (was run manually).

### 10. `json` vs `jsonb` propagated to migration SQL.

---

## LOW Issues

### 11. Journal tag rename for migration 0022 (unrelated change).
### 12. `oauth_connections.status` lacks CHECK constraint.
### 13. `oauth_connections.scopes` stores as comma-separated text.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 3 |
| MEDIUM | 5 |
| LOW | 3 |
