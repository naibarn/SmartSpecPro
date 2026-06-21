-- Higgsfield MCP rejects the legacy SmartAIHub alias `seedance_unlimited`
-- as a provider-native model id. Keep the SmartAIHub model id/alias stable,
-- but send Higgsfield's accepted provider model id.

WITH target AS (
  SELECT
    id,
    "configJson"::jsonb AS config_json
  FROM media_models
  WHERE
    "modelId" IN (
      'higgsfield/seedance_unlimited',
      'higgsfield-mcp/enhanced-seedance-2-fast-unlimited'
    )
    OR (
      "configJson"::jsonb ->> 'transport' = 'mcp'
      AND COALESCE(
        "configJson"::jsonb ->> 'provider',
        "configJson"::jsonb #>> '{mcp,providerKey}'
      ) = 'higgsfield'
      AND COALESCE(
        "configJson"::jsonb ->> 'providerModelId',
        "configJson"::jsonb #>> '{mcp,providerModelId}'
      ) IN ('seedance_unlimited', 'enhanced-seedance-2-fast-unlimited')
    )
), rewritten AS (
  SELECT
    id,
    jsonb_set(
      jsonb_set(
        config_json,
        '{providerModelId}',
        '"seedance_2_0_fast"'::jsonb,
        true
      ),
      '{mcp,providerModelId}',
      '"seedance_2_0_fast"'::jsonb,
      true
    ) AS config_json
  FROM target
)
UPDATE media_models m
SET
  "configJson" = rewritten.config_json,
  "updatedAt" = now()
FROM rewritten
WHERE m.id = rewritten.id;
