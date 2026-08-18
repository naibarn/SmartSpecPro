ALTER TABLE "mcp_oauth_grants"
  ADD COLUMN IF NOT EXISTS "redirectUri" varchar(1024);

UPDATE "mcp_oauth_grants"
SET "redirectUri" = 'oauth'
WHERE "redirectUri" IS NULL;

ALTER TABLE "mcp_oauth_grants"
  ALTER COLUMN "redirectUri" SET NOT NULL;
