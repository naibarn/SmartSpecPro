SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

ALTER TABLE "emergency_hydro_observations"
  ADD COLUMN IF NOT EXISTS "sourceId" varchar(36),
  ADD COLUMN IF NOT EXISTS "sourceObservationRef" varchar(160),
  ADD COLUMN IF NOT EXISTS "rawValue" numeric(18,6),
  ADD COLUMN IF NOT EXISTS "rawUnit" varchar(32),
  ADD COLUMN IF NOT EXISTS "normalizedValue" numeric(18,6),
  ADD COLUMN IF NOT EXISTS "normalizedUnit" varchar(32),
  ADD COLUMN IF NOT EXISTS "receivedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "normalizedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "freshnessCode" varchar(16),
  ADD COLUMN IF NOT EXISTS "verticalDatumRef" varchar(160),
  ADD COLUMN IF NOT EXISTS "supersedesObservationId" varchar(36);
--> statement-breakpoint

UPDATE "emergency_hydro_observations" o
SET "sourceId" = s."sourceId",
    "sourceObservationRef" = 'legacy:' || o."id",
    "rawValue" = o."value",
    "rawUnit" = o."unitCode",
    "normalizedValue" = o."value",
    "normalizedUnit" = o."unitCode",
    "receivedAt" = o."createdAt",
    "normalizedAt" = o."createdAt",
    "freshnessCode" = 'unknown',
    "provenanceJson" = o."provenanceJson" || '{"legacyBackfill":{"clockBasis":"createdAt-fallback","measurementBasis":"legacy-value-unit"}}'::jsonb
FROM "emergency_hydro_stations" s
WHERE s."tenantId" = o."tenantId" AND s."id" = o."stationId"
  AND (o."sourceId" IS NULL OR o."sourceObservationRef" IS NULL OR o."receivedAt" IS NULL);
--> statement-breakpoint

ALTER TABLE "emergency_hydro_observations"
  ALTER COLUMN "sourceId" SET NOT NULL,
  ALTER COLUMN "sourceObservationRef" SET NOT NULL,
  ALTER COLUMN "receivedAt" SET NOT NULL,
  ALTER COLUMN "normalizedAt" SET NOT NULL,
  ALTER COLUMN "freshnessCode" SET DEFAULT 'unknown',
  ALTER COLUMN "freshnessCode" SET NOT NULL,
  ALTER COLUMN "value" DROP NOT NULL,
  ALTER COLUMN "unitCode" DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE "emergency_hydro_observations"
  DROP CONSTRAINT IF EXISTS "emergency_hydro_observation_quality_check";
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_hydro_observation_tenant_id_unique"
  ON "emergency_hydro_observations" ("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_hydro_station_source_id_unique"
  ON "emergency_hydro_stations" ("tenantId", "sourceId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_intel_capture_source_id_unique"
  ON "emergency_intel_captures" ("tenantId", "sourceId", "id");
ALTER TABLE "emergency_hydro_observations"
  ADD CONSTRAINT "emergency_hydro_observation_quality_check"
    CHECK ("qualityCode" IN ('unknown', 'valid', 'suspect', 'invalid', 'corrected', 'estimated', 'missing', 'censored', 'rejected')),
  ADD CONSTRAINT "emergency_hydro_observation_freshness_check"
    CHECK ("freshnessCode" IN ('current', 'stale', 'delayed', 'unknown')),
  ADD CONSTRAINT "emergency_hydro_observation_source_ref_check"
    CHECK ("sourceObservationRef" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  ADD CONSTRAINT "emergency_hydro_observation_raw_pair_check"
    CHECK (("rawValue" IS NULL) = ("rawUnit" IS NULL)),
  ADD CONSTRAINT "emergency_hydro_observation_normalized_pair_check"
    CHECK (("normalizedValue" IS NULL) = ("normalizedUnit" IS NULL)),
  ADD CONSTRAINT "emergency_hydro_observation_missing_quality_check"
    CHECK ("qualityCode" <> 'missing' OR ("rawValue" IS NULL AND "normalizedValue" IS NULL)),
  ADD CONSTRAINT "emergency_hydro_observation_source_tenant_fk"
    FOREIGN KEY ("tenantId", "sourceId") REFERENCES "emergency_intel_sources"("tenantId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "emergency_hydro_observation_station_source_tenant_fk"
    FOREIGN KEY ("tenantId", "sourceId", "stationId") REFERENCES "emergency_hydro_stations"("tenantId", "sourceId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "emergency_hydro_observation_capture_source_tenant_fk"
    FOREIGN KEY ("tenantId", "sourceId", "captureId") REFERENCES "emergency_intel_captures"("tenantId", "sourceId", "id") ON DELETE RESTRICT,
  ADD CONSTRAINT "emergency_hydro_observation_supersedes_tenant_fk"
    FOREIGN KEY ("tenantId", "supersedesObservationId") REFERENCES "emergency_hydro_observations"("tenantId", "id") ON DELETE RESTRICT;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "emergency_hydro_observation_revision_unique"
  ON "emergency_hydro_observations" ("tenantId", "sourceId", "stationId", "variableCode", "sourceObservationRef", "sourceRevision");
CREATE INDEX IF NOT EXISTS "emergency_hydro_observation_source_received_idx"
  ON "emergency_hydro_observations" ("tenantId", "sourceId", "receivedAt" DESC);
