ALTER TABLE "connected_devices"
  ADD COLUMN IF NOT EXISTS "permissionPolicyJson" jsonb;

COMMENT ON COLUMN "connected_devices"."permissionPolicyJson" IS
  'Optional per-device MCP scope restriction. NULL means all granted scopes; values must be a subset of scopesJson.';
