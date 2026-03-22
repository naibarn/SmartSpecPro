# Section 04 Review — Database Schema and Migration
# Feature 048: Auth Token Storage Hardening

**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-19
**Files reviewed:**
- `apps/web/drizzle/schema.ts` (lines 6626–6643)
- `apps/web/drizzle/0090_skinny_bucky.sql`
- `apps/web/drizzle/meta/_journal.json` (entry idx 90)

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| MEDIUM | `schema.ts:6638–6639` | `createdAt` and `updatedAt` are declared without `.notNull()`. Every comparable table in the schema (users:370–371, userSkillVisibility:2658–2659, userCreditBudgets:2367–2368, userOrchestratorProfiles:5809–5810) uses `.defaultNow().notNull()`. Without `.notNull()`, Drizzle infers these columns as `timestamp | null` in TypeScript, forcing null-checks everywhere in the service layer even though the DB default ensures they are never actually null. | Add `.notNull()` after `.defaultNow()` on both timestamp columns in `schema.ts`. Re-run `pnpm db:push` — the generated SQL will include `NOT NULL` in the `CREATE TABLE`. |
| MEDIUM | `schema.ts:6634` | `tenantId` is nullable, uses the camelCase DB column name `"tenantId"`, and has no FK reference to `tenants.id`. The dominant convention in the schema for every tenant-scoped table uses `tenant_id` (snake_case DB name) with `.notNull().references(() => tenants.id, { onDelete: "cascade" })`. The new table is inconsistent on all three axes. Per the section plan (line 96), this is intentional ("consistent with some other tables") — but the one table used as a precedent (line 992) is itself an outlier. More importantly, without a FK and without `.notNull()`, rows for a deleted tenant will silently remain with a stale `tenantId` value, and cross-tenant isolation depends entirely on application-layer enforcement with no DB guarantee. | If `tenantId` is required for the multi-tenant isolation queries documented in the plan, it should be `.notNull().references(() => tenants.id, { onDelete: "cascade" })`. If it is genuinely optional (single-tenant deployments or future use), document this explicitly in a code comment and at minimum add an index on `tenantId` so the service-layer query `WHERE tenantId = $1` is fast. |
| LOW | `0090_skinny_bucky.sql:14–15` | The migration SQL generates `DEFAULT now()` for both timestamp columns without `NOT NULL`. This is consistent with the schema.ts definition, but it means the DB column itself allows NULL even though the application will never write NULL. If the `schema.ts` fix (finding above) is applied, a new migration regeneration is required before this SQL is applied to production; applying the current SQL and then patching is fragile. | Fix `schema.ts` first, then regenerate the migration so the SQL contains `DEFAULT now() NOT NULL`. Do not apply the current SQL and then ALTER the table separately. |
| LOW | `schema.ts:6634` | `tenantId` column uses camelCase DB column name `"tenantId"` while all other `tenantId` columns in the schema use snake_case `"tenant_id"` as the actual PostgreSQL column name (see lines 992, 1745, 1780, 1828, etc.). The ORM field name is `tenantId` in all cases — only the DB column string differs. This means a raw SQL query or psql inspection will see `tenantId` as the column name instead of `tenant_id`, diverging from every other tenant column in the database. | Change `varchar("tenantId", ...)` to `varchar("tenant_id", ...)` so the DB column name follows the established convention. The TypeScript property name remains `tenantId` (ORM field alias). |
| LOW | `schema.ts:6626–6643` | No `export type` lines after the table definition. Every other user-related table in the schema exports both `Type` and `InsertType` (e.g., `UserSkillVisibility` / `InsertUserSkillVisibility` at 2664–2665, `UserCreditBudget` / `InsertUserCreditBudget` at 2373–2374, `UserOrchestratorProfile` / `InsertUserOrchestratorProfile` at 5815–5816). The section-05 service will need these types for `$inferSelect` and `$inferInsert` — they must be added here or inlined at the use site. Without the export, type safety across the service boundary is weakened. | Add after the table definition: `export type UserLlmApiKey = typeof userLlmApiKeys.$inferSelect;` and `export type InsertUserLlmApiKey = typeof userLlmApiKeys.$inferInsert;` |
| INFO | `0090_skinny_bucky.sql:20` | The SQL file is missing a trailing newline (diff shows `\ No newline at end of file` on line 21). Not a correctness issue, but it is inconsistent with the other migration files in the repo and will produce a noisy git diff if the file is ever touched. | Add a trailing newline to the SQL file. |
| INFO | `schema.ts:6637` | `keyHint: varchar("keyHint", { length: 8 })` is described in the plan (line 99) as storing "the last 4 characters of the plaintext API key". The column length of 8 provides 4 characters of headroom beyond the described use, which is fine. However, the plan also implies this is always set on insert (`user sees sk-...abcd`), yet the column is nullable with no default. If `keyHint` is expected to be present whenever a key exists, consider `.notNull()` or at least documenting that a null value means the hint is unavailable. | No immediate change required if nullable is intentional. Document the null case in the column comment. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| Table name matches plan (`user_llm_api_keys`) | PASS | `schema.ts:6631`, SQL line 1 |
| Primary key: `serial` integer | PASS | `schema.ts:6632`, SQL line 2 |
| `userId` FK to `users.id` with `onDelete: "cascade"` | PASS | `schema.ts:6633`, SQL line 12 |
| `provider varchar(50) NOT NULL` | PASS | `schema.ts:6635`, SQL line 5 |
| `apiKeyEncrypted text NOT NULL` (encrypted, no plaintext) | PASS | `schema.ts:6636`, SQL line 6 — column name follows `*Encrypted` convention per CLAUDE.md encryption rules |
| `keyHint varchar(8)` nullable | PASS | `schema.ts:6637`, SQL line 7 — last-4-chars hint, not reconstructable |
| Unique index on `(userId, provider)` | PASS | `schema.ts:6641`, SQL line 13 |
| Non-unique index on `userId` | PASS | `schema.ts:6642`, SQL line 14 |
| Migration journal entry `0090_skinny_bucky` | PASS | `_journal.json` idx 90 |
| No plaintext secret columns | PASS | Only `apiKeyEncrypted` (ciphertext) and `keyHint` (last 4 chars, not secret) |
| No existing tables modified | PASS | Diff shows only `ADD TABLE`, no `ALTER TABLE` on existing tables |
| `tenantId` nullable, no FK | CONDITIONAL — see MEDIUM finding above | Deviates from schema convention; plan acknowledges but justification is weak |
| `createdAt` / `updatedAt` `.notNull()` | FAIL — see MEDIUM finding above | `.notNull()` missing; inconsistent with all comparable tables |
| `export type` declarations present | FAIL — see LOW finding above | Missing `UserLlmApiKey` and `InsertUserLlmApiKey` exports |

---

### Summary

The core schema intent is correct: `apiKeyEncrypted` follows the `*Encrypted` convention and is `NOT NULL`, cascade delete is properly wired to `users.id`, and the unique constraint on `(userId, provider)` correctly enforces the one-key-per-provider-per-user business rule. The migration SQL and journal entry are consistent with each other and the schema definition.

Two issues need to be fixed before section-05 can build on this safely: `createdAt`/`updatedAt` must have `.notNull()` added (and the migration regenerated), and `export type` declarations must be added so the service layer can import `UserLlmApiKey` without re-deriving the type. The `tenantId` column naming and FK omission are lower-priority but represent a meaningful divergence from the schema's multi-tenancy convention that will complicate future cross-tenant queries.
