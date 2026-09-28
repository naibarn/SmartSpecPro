# Section 06 — Agency freeze and migration guard

## Objective

Stop new Agency Swarm execution immediately while keeping historical data recoverable. Implement a read-only migration/reconciliation seam and an audit guard; destructive deletion is deferred until proof gates pass.

## Files

- Add `apps/web/server/services/agentRuntime/agencyDecommissionService.ts` and focused tests.
- Add `python-backend/app/services/agency_migration_export.py` and focused tests.
- Add a CI audit script that fails active execution references while allowing explicitly allowlisted migration/archive code.
- Change only the authoritative feature flag/route boundary needed to reject new Agency origins; do not drop tables or remove imports before migration evidence exists.

## Acceptance

Active Orchestra requests cannot select Agency or use it as fallback. Export/reconciliation is idempotent, checksum-based, tenant-scoped, and read-only. Existing historical records remain accessible. The audit reports every remaining active reference and prevents accidental reintroduction.
