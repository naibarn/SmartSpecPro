-- Magnific MCP image generation expects lowercase resolution tokens.
-- Earlier MCP normalization used 2K/4K, but provider status reported
-- "Unsupported resolution: 2K" for Nano Banana. Keep UI defaults aligned.

WITH target AS (
  SELECT id, "configJson"::jsonb AS config_json
  FROM media_models
  WHERE "modelId" IN (
    'magnific-mcp/gpt-2',
    'magnific-mcp/imagen-nano-banana-2-flash',
    'magnific-mcp/imagen-nano-banana-2'
  )
), rewritten AS (
  SELECT
    id,
    jsonb_set(
      jsonb_set(
        config_json,
        '{inputFields}',
        (
          SELECT jsonb_agg(
            CASE
              WHEN field->>'key' = 'resolution' THEN jsonb_set(
                jsonb_set(field, '{default}', '"1k"'::jsonb, true),
                '{options}',
                '[{"label":"1k","value":"1k"},{"label":"2k","value":"2k"},{"label":"4k","value":"4k"}]'::jsonb,
                true
              )
              ELSE field
            END
            ORDER BY ord
          )
          FROM jsonb_array_elements(COALESCE(config_json->'inputFields', '[]'::jsonb)) WITH ORDINALITY AS fields(field, ord)
        ),
        true
      ),
      '{mcp,defaultParams,resolution}',
      '"1k"'::jsonb,
      true
    ) AS config_json
  FROM target
)
UPDATE media_models m
SET
  sizes = '["1k","2k","4k"]'::jsonb,
  "configJson" = rewritten.config_json,
  "updatedAt" = now()
FROM rewritten
WHERE m.id = rewritten.id;
