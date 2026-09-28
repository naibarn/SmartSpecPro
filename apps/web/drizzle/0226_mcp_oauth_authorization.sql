CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" varchar(256) NOT NULL UNIQUE,
  "clientName" varchar(255) NOT NULL,
  "clientUri" varchar(1024),
  "logoUri" varchar(1024),
  "redirectUris" jsonb NOT NULL,
  "grantTypes" jsonb NOT NULL DEFAULT '["authorization_code","refresh_token"]'::jsonb,
  "responseTypes" jsonb NOT NULL DEFAULT '["code"]'::jsonb,
  "tokenEndpointAuthMethod" varchar(32) NOT NULL DEFAULT 'none',
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "lastUsedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mcp_oauth_clients_status_idx" ON "mcp_oauth_clients" ("status");

CREATE TABLE IF NOT EXISTS "mcp_oauth_transactions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" varchar(256) NOT NULL,
  "redirectUri" varchar(1024) NOT NULL,
  "resource" varchar(1024) NOT NULL,
  "state" varchar(2048),
  "codeChallenge" varchar(128) NOT NULL,
  "codeChallengeMethod" varchar(8) NOT NULL DEFAULT 'S256',
  "requestedScopes" jsonb NOT NULL,
  "approvedScopes" jsonb,
  "userId" integer REFERENCES "users"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE CASCADE,
  "authorizationCodeHash" varchar(128) UNIQUE,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "expiresAt" timestamptz NOT NULL,
  "approvedAt" timestamptz,
  "consumedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mcp_oauth_transactions_client_idx" ON "mcp_oauth_transactions" ("clientId", "status");
CREATE INDEX IF NOT EXISTS "mcp_oauth_transactions_expiry_idx" ON "mcp_oauth_transactions" ("expiresAt");

CREATE TABLE IF NOT EXISTS "mcp_oauth_grants" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" varchar(256) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "deviceIdHash" varchar(64),
  "scopesJson" jsonb NOT NULL,
  "refreshFamilyId" varchar(128) NOT NULL UNIQUE,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "lastUsedAt" timestamptz,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "revokedAt" timestamptz,
  "revokedByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "revocationReason" varchar(255),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_owner_idx" ON "mcp_oauth_grants" ("tenantId", "userId", "status");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_client_idx" ON "mcp_oauth_grants" ("clientId", "status");
CREATE INDEX IF NOT EXISTS "mcp_oauth_grants_expiry_idx" ON "mcp_oauth_grants" ("refreshTokenExpiresAt");

CREATE TABLE IF NOT EXISTS "mcp_oauth_refresh_tokens" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "grantId" varchar(36) NOT NULL REFERENCES "mcp_oauth_grants"("id") ON DELETE CASCADE,
  "familyId" varchar(128) NOT NULL,
  "tokenHash" varchar(128) NOT NULL UNIQUE,
  "parentTokenHash" varchar(128),
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mcp_oauth_refresh_tokens_grant_idx" ON "mcp_oauth_refresh_tokens" ("grantId");
CREATE INDEX IF NOT EXISTS "mcp_oauth_refresh_tokens_family_idx" ON "mcp_oauth_refresh_tokens" ("familyId");
