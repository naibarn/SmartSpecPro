ALTER TABLE IF EXISTS "marketplace_extension_pairings"
  ADD COLUMN IF NOT EXISTS "deviceIdHash" varchar(64);

ALTER TABLE IF EXISTS "marketplace_extension_pairings"
  ADD COLUMN IF NOT EXISTS "tokenJti" varchar(128);

CREATE INDEX IF NOT EXISTS "idx_marketplace_extension_pairings_device"
  ON "marketplace_extension_pairings" ("deviceIdHash", "status");
