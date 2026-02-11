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
- [ ] Backup snapshot captured before migration apply.
- [ ] Migration applied successfully in target environment.
- [ ] No unexpected schema drift after migration.
- [ ] Backfill dry-run reviewed.
- [ ] Backfill apply run reviewed.
- [ ] Unresolved rows reviewed and dispositioned.

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

## Result Summary
- Verification status: `pending final environment run`
- Owner:
- Date/time:
- Notes:
