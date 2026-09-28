# Implementation Plan

## Objective

Implement the approved admin database backup flow with two ZIP artifacts, background execution,
24-hour cleanup, secure downloads, and a responsive admin page.

## File ownership and waves

### Wave 1 — schema and shared server contract

- Add `backupJobs` table to `apps/web/drizzle/schema.ts`.
- Add explicit migration `apps/web/drizzle/0241_admin_database_backups.sql`.
- Add `apps/web/server/services/databaseBackupContracts.ts` for status/mode/artifact types and Zod input.

### Wave 2 — backend implementation

- Add `apps/web/server/services/databaseBackupService.ts`.
- Add `apps/web/server/services/databaseBackupExportService.ts`.
- Add `apps/web/server/jobs/databaseBackupJob.ts` and startup/shutdown wiring in `_core/index.ts`.
- Add `apps/web/server/routers/databaseBackups.ts` and register it in `routers.ts`.
- Add `apps/web/server/routes/databaseBackupRoutes.ts` and register it in `_core/index.ts`.

### Wave 3 — UI integration

- Add `apps/web/client/src/pages/AdminDatabaseBackups.tsx`.
- Register lazy page and `/admin/database-backups` route in `client/src/App.tsx`.
- Add shared admin menu definition and Thai/English nav/admin translations following existing patterns.

### Wave 4 — proof and closure

- Add service/route/router tests and page tests.
- Run focused tests, `git diff --check`, relevant lint/typecheck, and inspect migration/schema consistency.
- Review security surfaces: admin auth, CSRF route behavior, path containment, redaction, expiry and cleanup.

## Backend contract

- `databaseBackups.create`: input `{ mode: "safe" | "full" }`; returns job summary.
- `databaseBackups.list`: input optional limit; returns newest jobs with artifact availability and download URLs.
- `databaseBackups.get`: input `{ id }`; returns one scoped job summary.
- `GET /api/admin/database-backups/:id/:artifact(database|application)/download`: session-authenticated admin stream.

## Acceptance criteria

See the design document. The key invariant is that no non-admin or expired/failed job can read either artifact.

## Rollout

Apply migration and ensure `pg_dump` exists in the web runtime before enabling the menu in production.
Do not claim live backup/restore proof from repository tests.
