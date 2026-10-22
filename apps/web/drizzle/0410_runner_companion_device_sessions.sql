-- Bind SmartAIHub Runner Companion OAuth device grants to a distinct client,
-- installation identity and browser-authorized tenant. Existing web device
-- grants retain their historical defaults and do not gain Runner scopes.
ALTER TABLE "oauth_device_authorizations"
  ADD COLUMN IF NOT EXISTS "client_id" varchar(96) NOT NULL DEFAULT 'smartaihub-web';
ALTER TABLE "oauth_device_authorizations"
  ADD COLUMN IF NOT EXISTS "device_id_hash" varchar(64);
ALTER TABLE "oauth_device_authorizations"
  ADD COLUMN IF NOT EXISTS "session_id" varchar(64);
ALTER TABLE "oauth_device_authorizations"
  ADD COLUMN IF NOT EXISTS "authorized_tenant_id" varchar(128);
CREATE INDEX IF NOT EXISTS "oauth_device_authorizations_session_idx"
  ON "oauth_device_authorizations" ("session_id");
