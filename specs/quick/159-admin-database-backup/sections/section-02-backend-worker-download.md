# Section 02 — Export Worker and Secure Download

## Ownership

- `apps/web/server/services/databaseBackupService.ts`
- `apps/web/server/services/databaseBackupExportService.ts`
- `apps/web/server/jobs/databaseBackupJob.ts`
- `apps/web/server/routes/databaseBackupRoutes.ts`
- `apps/web/server/_core/index.ts`
- related service/route tests

## Work

Implement BullMQ execution, `pg_dump`, catalog-based application JSONL export, safe redaction, ZIP manifests,
checksum/integrity validation, cleanup, startup reconciliation, and session/admin authenticated streaming download.

## TDD

Mock process/DB/Filesystem boundaries; prove no partial artifact is reported completed and no unsafe path is streamed.

## Risks

Never include credentials in logs/errors. Limit concurrency and ensure cleanup is job-directory scoped.
