# Decision Log

## Planning depth

`standard` quick-plan. The work crosses schema, worker, tRPC, Express download, navigation and UI,
but stays within one Node application and existing queue/auth/storage patterns. It does not require
Python or a new external service.

## Decisions

1. Use a DB-backed `backup_jobs` record plus BullMQ worker instead of in-process async work.
2. Keep artifacts in a dedicated server temp root for 24 hours; do not expose R2 or public URLs in v1.
3. Keep two ZIPs separate so admins can download only what they need.
4. Make `safe/full` explicit at creation; full mode requires a visible confirmation.
5. Use a streaming Express download route with session authentication rather than returning binary data through tRPC.
6. Use catalog-derived table/column metadata and a centralized redaction policy; no user-provided SQL.
7. Add migration/schema only for backup job metadata; do not backfill or alter existing data.

## Open operational risks

- Runtime image must provide `pg_dump` compatible with the PostgreSQL server.
- Local artifacts do not survive all deployment topologies or cross-instance routing; move to managed storage in a future version if required.
- Full export is intentionally powerful and should be limited to trusted admins in production.
