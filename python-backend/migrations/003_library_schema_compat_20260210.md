# Library Schema Compatibility Notes (Section 02)

The authoritative relational migration for library/RAG tables is in:
- `apps/web/drizzle/0019_unified_library_schema.sql`

Python model mapping file:
- `python-backend/app/models/library.py`

## Compatibility Contract

- Table names use snake_case and must remain stable:
  - `library_items`
  - `library_links`
  - `library_chunks`
  - `library_permissions`
  - `library_index_jobs`
- `metadata` columns in `library_items` and `library_chunks` map to SQLAlchemy attributes
  `metadata_json` to avoid declarative reserved-name conflicts.
- Enum-backed columns in Postgres are treated as string values in Python:
  - `library_items.status`
  - `library_items.visibility`
  - `library_index_jobs.status`

## Runtime Expectation

- Apply Drizzle migration before enabling Python services that create/read these tables.
- Python `init_db()` now imports `app.models.library` so local bootstrap creates tables when running against empty databases.
