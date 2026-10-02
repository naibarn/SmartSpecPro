SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_hydro_stations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceId" varchar(36) NOT NULL REFERENCES "emergency_intel_sources"("id") ON DELETE RESTRICT,
  "stationRef" varchar(160) NOT NULL,
  "displayName" varchar(200) NOT NULL,
  "latitude" numeric(9,6) NOT NULL,
  "longitude" numeric(9,6) NOT NULL,
  "crsCode" varchar(32) NOT NULL DEFAULT 'EPSG:4326',
  "catchmentRef" varchar(160),
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_hydro_station_coordinates_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "emergency_hydro_station_crs_check" CHECK ("crsCode" = 'EPSG:4326'),
  CONSTRAINT "emergency_hydro_station_source_tenant_fk" FOREIGN KEY ("tenantId", "sourceId") REFERENCES "emergency_intel_sources"("tenantId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_hydro_station_tenant_ref_unique" ON "emergency_hydro_stations" ("tenantId", "sourceId", "stationRef");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_hydro_station_tenant_id_unique" ON "emergency_hydro_stations" ("tenantId", "id");
CREATE INDEX IF NOT EXISTS "emergency_hydro_station_catchment_idx" ON "emergency_hydro_stations" ("tenantId", "catchmentRef") WHERE "catchmentRef" IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_hydro_observations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "stationId" varchar(36) NOT NULL REFERENCES "emergency_hydro_stations"("id") ON DELETE RESTRICT,
  "captureId" varchar(36) NOT NULL REFERENCES "emergency_intel_captures"("id") ON DELETE RESTRICT,
  "variableCode" varchar(64) NOT NULL,
  "value" numeric(18,6) NOT NULL,
  "unitCode" varchar(32) NOT NULL,
  "qualityCode" varchar(32) NOT NULL DEFAULT 'unknown',
  "observedAt" timestamptz NOT NULL,
  "sourceRevision" varchar(160) NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "provenanceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_hydro_observation_value_check" CHECK ("value"::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  CONSTRAINT "emergency_hydro_observation_variable_check" CHECK ("variableCode" ~ '^[a-z][a-z0-9._-]{0,63}$'),
  CONSTRAINT "emergency_hydro_observation_unit_check" CHECK ("unitCode" ~ '^[A-Z][A-Z0-9._/-]{0,31}$'),
  CONSTRAINT "emergency_hydro_observation_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "emergency_hydro_observation_quality_check" CHECK ("qualityCode" IN ('unknown', 'valid', 'suspect', 'invalid', 'corrected')),
  CONSTRAINT "emergency_hydro_observation_station_tenant_fk" FOREIGN KEY ("tenantId", "stationId") REFERENCES "emergency_hydro_stations"("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "emergency_hydro_observation_capture_tenant_fk" FOREIGN KEY ("tenantId", "captureId") REFERENCES "emergency_intel_captures"("tenantId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_hydro_observation_identity_unique" ON "emergency_hydro_observations" ("tenantId", "stationId", "variableCode", "observedAt", "contentHash");
CREATE INDEX IF NOT EXISTS "emergency_hydro_observation_series_idx" ON "emergency_hydro_observations" ("tenantId", "stationId", "variableCode", "observedAt" DESC);
CREATE INDEX IF NOT EXISTS "emergency_hydro_observation_capture_idx" ON "emergency_hydro_observations" ("tenantId", "captureId");
