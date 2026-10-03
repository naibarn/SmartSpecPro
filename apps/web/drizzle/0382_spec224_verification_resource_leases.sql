CREATE TABLE IF NOT EXISTS "spec224_verification_leases" (
  "repositoryKey" varchar(72) PRIMARY KEY,
  "ownerTokenHash" varchar(64) NOT NULL,
  "fencingVersion" integer NOT NULL DEFAULT 1,
  "heartbeatAt" timestamptz NOT NULL,
  "leaseExpiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "spec224_verification_leases_fence_positive" CHECK ("fencingVersion" > 0),
  CONSTRAINT "spec224_verification_leases_key_format" CHECK ("repositoryKey" ~ '^repo:[a-f0-9]{64}$'),
  CONSTRAINT "spec224_verification_leases_owner_hash_format" CHECK ("ownerTokenHash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spec224_verification_leases_expiry_idx"
  ON "spec224_verification_leases" ("leaseExpiresAt");
