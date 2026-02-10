# Section 02 - Library Schema

## Objective

Introduce the relational data model required for a unified media/document library and indexing job lifecycle.

## Implemented Scope

- Added new SQLAlchemy models for core library entities:
  - `library_items`
  - `library_links`
  - `library_chunks`
  - `library_permissions`
  - `library_index_jobs`
- Added relational constraints and indexes for tenant/visibility/status, source-link uniqueness, chunk ordering, ACL lookup, and index-job retry scanning.
- Added Drizzle schema definitions aligned to Python models, including enum-backed status/visibility fields.
- Added additive Drizzle migration SQL for Section 02 tables and indexes.
- Added Python compatibility notes documenting cross-runtime schema mapping and reserved-name handling.

## Actual Files Added

- `python-backend/app/models/library.py`
- `python-backend/tests/unit/models/test_library_models.py`
- `apps/web/drizzle/0019_unified_library_schema.sql`
- `python-backend/migrations/003_library_schema_compat_20260210.md`
- `specs/reviews/section-02-review.md`
- `specs/reviews/section-02-interview.md`

## Actual Files Modified

- `python-backend/app/models/__init__.py`
- `python-backend/app/core/database.py`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/meta/_journal.json`

## Key Implementation Notes

1. SQLAlchemy reserved-name compatibility:
- Database columns named `metadata` are mapped in Python as `metadata_json`.
- Constructor aliases were added so model creation can still accept `metadata=...` inputs.

2. Schema/index strategy:
- `library_items` now includes composite indexes supporting tenant-scoped listing by visibility/status.
- `library_links` enforces dedupe with unique `(link_type, link_id)` source mapping.
- `library_chunks` enforces deterministic ordering via unique `(library_item_id, chunk_index)`.
- `library_index_jobs` includes retry/queue indexes on `(status, next_retry_at)` and `(tenant_id, status, run_at)`.

3. Cross-runtime contract:
- Drizzle migration remains source-of-truth for relational DDL.
- Python `init_db()` now imports `app.models.library` to create these tables in local/bootstrap setups.

## Tests Added/Updated (TDD)

- `test_library_tables_created`
- `test_library_item_soft_delete_and_status_transition`
- `test_library_link_unique_constraint`
- `test_index_job_attempt_tracking`

Run commands used:
- `cd python-backend && uv run pytest -o addopts='' tests/unit/models/test_library_models.py -q`
- `cd python-backend && uv run pytest -o addopts='' tests/unit/services/test_media_callback_service.py tests/unit/models/test_library_models.py -q`

Results:
- 4 passed (section-only)
- 7 passed (section + previous reliability regression subset)

## Deviations from Initial Plan

1. Did not generate Drizzle `meta/*_snapshot.json` in this section.
- Rationale: migration SQL and journal update are complete for runtime migration; snapshot generation can be done during dedicated migration-tooling pass.

## Remaining Follow-ups

- Run migration apply test against a real Postgres instance (not SQLite) before enabling `library_enabled` in shared environments.
- Add integration tests that exercise these tables through library service APIs once Section 03 is implemented.
