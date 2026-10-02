CREATE TABLE IF NOT EXISTS "emergency_geo_watches" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "idempotencyKeyHash" varchar(64) NOT NULL,
  "watchJson" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "emergency_geo_watch_status_check" CHECK ("status" IN ('active', 'paused', 'revoked', 'expired')),
  CONSTRAINT "emergency_geo_watch_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "emergency_geo_watch_idempotency_hash_check" CHECK ("idempotencyKeyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "emergency_geo_watch_payload_size_check" CHECK (octet_length("watchJson"::text) <= 32768)
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_geo_watch_tenant_id_unique" ON "emergency_geo_watches" ("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_geo_watch_owner_idempotency_unique" ON "emergency_geo_watches" ("tenantId", "ownerUserId", "idempotencyKeyHash");
CREATE INDEX IF NOT EXISTS "emergency_geo_watch_owner_status_expiry_idx" ON "emergency_geo_watches" ("tenantId", "ownerUserId", "status", "expiresAt");

CREATE TABLE IF NOT EXISTS "emergency_geo_watch_transitions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "watchId" varchar(36) NOT NULL REFERENCES "emergency_geo_watches"("id") ON DELETE CASCADE,
  "idempotencyKey" varchar(256) NOT NULL,
  "eventRef" varchar(160) NOT NULL,
  "transition" varchar(24) NOT NULL,
  "observedAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "emergency_geo_watch_transition_kind_check" CHECK ("transition" IN ('enter', 'exit', 'material-update')),
  CONSTRAINT "emergency_geo_watch_transition_tenant_watch_fk" FOREIGN KEY ("tenantId", "watchId") REFERENCES "emergency_geo_watches"("tenantId", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_geo_watch_transition_tenant_idempotency_unique" ON "emergency_geo_watch_transitions" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "emergency_geo_watch_transition_watch_created_idx" ON "emergency_geo_watch_transitions" ("tenantId", "watchId", "createdAt");
