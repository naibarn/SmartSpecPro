-- Feature 163 integrity repair: one active local root per Worker/Series.
-- Fail before changing indexes when legacy data contains conflicting active
-- roots. Operators must resolve the reported rows explicitly; no blind
-- backfill or implicit root deletion is safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "worker_series_bindings"
    WHERE "status" IN ('pending', 'active', 'stale', 'revoking')
    GROUP BY "tenantId", "workerId", "seriesId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'worker_series_bindings has multiple active roots for one Worker/Series; resolve conflicts before migration';
  END IF;
END $$;

DROP INDEX IF EXISTS "worker_series_bindings_active_root_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "worker_series_bindings_active_series_unique"
  ON "worker_series_bindings" ("tenantId", "workerId", "seriesId")
  WHERE "status" IN ('pending', 'active', 'stale', 'revoking');
