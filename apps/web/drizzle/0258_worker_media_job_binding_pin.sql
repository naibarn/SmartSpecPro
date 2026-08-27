ALTER TABLE "worker_jobs"
  ADD COLUMN IF NOT EXISTS "workerSeriesBindingId" varchar(36),
  ADD COLUMN IF NOT EXISTS "workerSeriesBindingRevision" integer;

CREATE INDEX IF NOT EXISTS "worker_jobs_series_binding_idx"
  ON "worker_jobs" ("workerSeriesBindingId", "workerSeriesBindingRevision", "status");

-- Do not silently repair or delete legacy jobs. An orphaned pin is an
-- ownership-integrity violation and must be resolved explicitly before the
-- FK is installed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "worker_jobs" j
    WHERE j."workerSeriesBindingId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "worker_series_bindings" b
        WHERE b."id" = j."workerSeriesBindingId"
      )
  ) THEN
    RAISE EXCEPTION 'worker_jobs contains orphaned workerSeriesBindingId values; resolve them before migration';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'worker_jobs_series_binding_fk'
  ) THEN
    ALTER TABLE "worker_jobs"
      ADD CONSTRAINT "worker_jobs_series_binding_fk"
      FOREIGN KEY ("workerSeriesBindingId")
      REFERENCES "worker_series_bindings"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
