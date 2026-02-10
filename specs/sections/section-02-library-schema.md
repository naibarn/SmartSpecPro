# Section 02 - Library Schema

## Objective

Introduce the relational data model required for a unified media/document library and indexing job lifecycle.

## Scope

- Create core library tables and indexes.
- Align schema ownership and Python model compatibility.
- Add migration-safe backfill scaffolding.

## Primary Files

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/*.sql` (new migration files)
- `python-backend/app/models/` (new SQLAlchemy models aligned to schema)

## Implementation Steps

1. Add `library_items` with tenant/user/source/type/status/visibility metadata fields.
2. Add `library_links` for source lineage and uniqueness constraints.
3. Add `library_chunks` for indexed chunk metadata and vector reference IDs.
4. Add `library_permissions` (or equivalent ACL extension table).
5. Add `library_index_jobs` with retryable state and scheduling fields.
6. Add indexes for tenant + visibility + status query performance.
7. Create migration notes for Python service compatibility.

## Test-First Checklist

- Test: all new tables created with expected constraints/indexes.
- Test: soft delete and status transitions on `library_items`.
- Test: source link deduplication and lookup integrity.
- Test: index-job attempt and retry fields update correctly.

## Verification

- Run schema migration and smoke query checks.
- Run Python model initialization against migrated schema.

## Exit Criteria

- Core library schema exists and supports add/index/search workflows.
- Schema contract is consumable by both Node and Python runtimes.
