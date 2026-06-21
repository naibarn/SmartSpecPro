-- Higgsfield "Enhanced Seedance 2.0 Fast Unlimited" is a web/account
-- entitlement, not a provider-native MCP model. MCP generation consumes
-- provider credits and accepts Seedance 2.0 / Seedance 2.0 Fast model ids.

UPDATE media_models
SET
  "isEnabled" = false,
  name = 'Enhanced Seedance 2.0 Fast Unlimited (Higgsfield web only)',
  description = 'Disabled for MCP: Higgsfield Unlimited applies to the Higgsfield web product, not MCP generation. Use Seedance 2.0 Fast (Higgsfield MCP) for MCP video generation.',
  aliases = '["higgsfield enhanced seedance", "enhanced seedance 2.0 fast", "seedance_unlimited"]'::json,
  "configJson" = COALESCE("configJson"::jsonb, '{}'::jsonb)
    || '{
      "deprecated": true,
      "disabledReason": "higgsfield_unlimited_web_only",
      "replacementModelId": "higgsfield/seedance_2_0_fast",
      "mcpUnavailableReason": "Higgsfield Unlimited is not available via MCP; MCP calls use provider account credits."
    }'::jsonb,
  "updatedAt" = now()
WHERE "modelId" IN (
  'higgsfield/seedance_unlimited',
  'higgsfield-mcp/enhanced-seedance-2-fast-unlimited'
);
