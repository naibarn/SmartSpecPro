# section-01-schema-and-migrations

## Objective

Create the data foundation for personal finance, OCR traceability, recurring rules, and scope-safe library evidence.

## Scope

This section owns the schema-first work that every later section depends on.

## Files to Change

- `apps/web/drizzle/schema.ts`
- `apps/web/server/__tests__/migrationOrdering.test.ts`
- generated migration files
- `apps/web/server/services/financeTypes.ts` or `apps/web/shared/finance.ts` if shared types are needed

## Implementation Notes

- Add `finance_transactions` with confirmed transaction fields, `tenant_id`, `project_id`, `owner_user_id`, `idempotency_key`, `source_hash`, and source trace fields.
- Add `finance_drafts` with `payload_json`, `missing_fields`, source trace fields, and a draft status lifecycle.
- Add `finance_recurring_rules` with schedule data, `auto_confirm`, next run bookkeeping, and ownership fields.
- Add `document_extractions` with OCR text, OCR JSON, extraction JSON, confidence JSON, MIME type, file hash, page count, ownership, and project scope.
- Add `finance_transaction_documents` to link confirmed transactions to supporting documents.
- Add `project_id` to `library_items`, `library_chunks`, and `library_index_jobs`.
- Keep `allowed_scopes` as the denormalized scope cache and make sure chunk rows can mirror their parent item’s scope.
- Make purge/backfill behavior explicit for library-backed finance evidence so deleted personal content cannot survive only inside chunks or vector artifacts.
- Add the indexes needed for tenant/project/owner lookup, occurred-at range queries, and idempotency de-duplication.
- Keep legacy library rows with `project_id = null` in compatibility mode until they are backfilled.
- Prepare the migration order so RLS and backfill changes land after the tables and columns exist.

## Data Rules

- Personal finance rows require `owner_user_id`.
- Personal finance rows must fail closed if the owner, tenant, or project context is missing.
- Money stays in minor units.
- `project_id = "personal"` is a reserved per-user namespace, not a tenant-wide bucket.
- Only the explicit personal-create flow may set `project_id = "personal"`; generic project update flows must reject the reserved slug.

## Validation

- Schema tests should prove the new tables and columns compile and expose the expected names.
- Migration-order tests should prove the RLS and backfill steps are present.
- Legacy compatibility tests should prove null-project rows are not accidentally treated as personal evidence.

## Implemented

### Files Created

- `apps/web/drizzle/0138_private_personal_finance_foundation.sql`
- `apps/web/drizzle/0139_private_personal_finance_security_backstop.sql`
- `apps/web/drizzle/financeSchema.test.ts`
- `apps/web/shared/finance.ts`
- `apps/web/shared/__tests__/finance.test.ts`

### Files Updated

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/server/__tests__/migrationOrdering.test.ts`

### Notes

- `financeStructuredDraftSchema` intentionally omits `projectId`; the active finance project is derived from authenticated request context instead of being accepted from structured output.
- Added DB checks so `finance_recurring_rules.amount_minor` and `finance_transactions.amount_minor` must be positive, and `document_extractions.page_count` must stay above zero.
- Legacy `library_items`, `library_chunks`, and `library_index_jobs` remain `project_id = null` compatible until later backfill and scope propagation sections run.
