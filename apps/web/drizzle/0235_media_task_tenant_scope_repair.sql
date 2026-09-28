-- Repair legacy media task tenant scope only from an authoritative Vertical
-- Drama series owner mapping. Never infer a tenant from user defaults alone.
UPDATE "media_tasks" AS mt
SET "tenant_id" = series."tenantId"
FROM "vertical_drama_series" AS series
WHERE mt."tenant_id" IS NULL
  AND NULLIF(
    COALESCE(
      mt."parameters"->'extra_params'->>'__vd_series_id',
      mt."parameters"->>'__vd_series_id'
    ),
    ''
  ) = series."id"::text
  AND series."userId" = mt."user_id"
  AND series."tenantId" IS NOT NULL;
