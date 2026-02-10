# Code Review - Section 02 (Library Schema)

## Scope Reviewed

- `python-backend/app/models/library.py`
- `python-backend/app/models/__init__.py`
- `python-backend/app/core/database.py`
- `python-backend/tests/unit/models/test_library_models.py`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0019_unified_library_schema.sql`
- `apps/web/drizzle/meta/_journal.json`
- `python-backend/migrations/003_library_schema_compat_20260210.md`

## Findings

1. `MEDIUM`: SQLAlchemy declarative reserved-name collision risk on `metadata` columns.
- Mitigation applied: map DB `metadata` column to `metadata_json` in Python models with constructor aliasing.

2. `LOW`: Queue selection performance could degrade without retry indexes on index jobs.
- Mitigation applied: added `(status, next_retry_at)` and `(tenant_id, status, run_at)` indexes.

3. `LOW`: Source lineage dedupe could allow drift if uniqueness is scoped too loosely.
- Mitigation applied: global unique source key `(link_type, link_id)`.

## Test Coverage Added

- `test_library_tables_created`
- `test_library_item_soft_delete_and_status_transition`
- `test_library_link_unique_constraint`
- `test_index_job_attempt_tracking`

## Residual Risks

- Migration has not yet been exercised against a live Postgres instance in this section.
- End-to-end API-level validation is deferred to Section 03+ where service endpoints are added.
