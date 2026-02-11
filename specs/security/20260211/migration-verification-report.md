# Migration Verification Report (2026-02-11)

## Scope
- Section 02: legacy URL policy migration for `library_items` URL fields.
- Section 07: callback tenant attribution migration/backfill for:
  - `media_callback_events.tenant_id`
  - `media_callback_dlq.tenant_id`

## Artifact References
- Section 02 commit: `c4c4ecd`
- Section 07 commit: `d28f958`
- Migration files:
  - `apps/web/drizzle/0020_library_tenant_id_varchar.sql`
  - `apps/web/drizzle/0021_callback_tenant_attribution.sql`

## Verification Checklist
- [x] Backup snapshot captured before migration apply.
- [x] Migration applied successfully in target environment.
- [x] No unexpected schema drift after migration.
- [x] Backfill dry-run reviewed.
- [x] Backfill apply run reviewed.
- [x] Unresolved rows reviewed and dispositioned.

## Suggested SQL Verification Queries
```sql
-- Callback rows still missing tenant attribution
SELECT
  (SELECT COUNT(*) FROM media_callback_events WHERE tenant_id IS NULL) AS event_missing_tenant,
  (SELECT COUNT(*) FROM media_callback_dlq WHERE tenant_id IS NULL) AS dlq_missing_tenant;

-- Distinct tenant footprint after backfill
SELECT tenant_id, COUNT(*)
FROM media_callback_events
GROUP BY tenant_id
ORDER BY COUNT(*) DESC;

-- DLQ rows with tenant mismatch vs linked event (should be zero)
SELECT COUNT(*) AS mismatch_count
FROM media_callback_dlq d
JOIN media_callback_events e ON e.id = d.event_id
WHERE d.tenant_id IS NOT NULL
  AND e.tenant_id IS NOT NULL
  AND d.tenant_id <> e.tenant_id;
```

## Execution Notes
- URL migration behavior was validated via service-level tests (dry-run/normalize/enforce behavior).
- Callback attribution backfill supports dry-run and apply modes via service:
  - `apps/web/server/services/libraryOpsTenantAttributionService.ts`
- Expected unresolved scenarios:
  - Missing `provider_task_id`
  - Ambiguous `provider_task_id` mapping to multiple tenants
- Backup snapshot (pre-0021):
  - Container path: `/tmp/smartspec-pre-0021.dump`
  - Size: `535.1K`
- Migration apply evidence (`0021_callback_tenant_attribution.sql`):
  - Output: `DO`, `DO`, `CREATE INDEX`, `CREATE INDEX`, `UPDATE 0`, `UPDATE 0`, `UPDATE 0`
- Post-migration schema checks:
  - `media_callback_events.tenant_id` exists (`character varying`)
  - `media_callback_dlq.tenant_id` exists (`character varying`)
  - FK constraints present:
    - `media_callback_events_tenant_id_tenants_id_fk`
    - `media_callback_dlq_tenant_id_tenants_id_fk`
  - Indexes present:
    - `media_callback_events_tenant_status_retry_idx`
    - `media_callback_dlq_tenant_status_idx`
- Data verification query results (local DB at 2026-02-12 02:22:33 +07):
  - `library_items` total rows: `5`
  - `library_items` unsafe `source_url` schemes (`javascript/data/file/ftp`): `0`
  - `library_items` unsafe `thumbnail_url` schemes (`javascript/data/file/ftp`): `0`
  - `media_callback_events` total rows: `0`
  - `media_callback_dlq` total rows: `0`
  - `media_callback_events` missing `tenant_id`: `0`
  - `media_callback_dlq` missing `tenant_id`: `0`
  - callback tenant mismatch (`dlq` vs linked `event`): `0`

## Result Summary
- Verification status: `completed (local environment)`
- Owner: Codex automation (pending human owner acknowledgment)
- Date/time: 2026-02-12 02:22:33 +07
- Notes:
  - No callback rows existed in this local environment at verification time.
  - Staging/production run should repeat the same SQL checks before external release.
