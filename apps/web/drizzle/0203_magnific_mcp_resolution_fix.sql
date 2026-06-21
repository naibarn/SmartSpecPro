-- Fix Magnific MCP image model resolutions.
-- Provider status checks rejected 1K image jobs with:
-- "Unsupported resolution: 1K". Keep generated media on supported sizes.

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
                jsonb_set(field, '{default}', '"2K"'::jsonb, true),
                '{options}',
                '[{"label":"2K","value":"2K"},{"label":"4K","value":"4K"}]'::jsonb,
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
      '"2K"'::jsonb,
      true
    ) AS config_json
  FROM target
)
UPDATE media_models m
SET
  sizes = '["2K","4K"]'::jsonb,
  "configJson" = rewritten.config_json,
  "updatedAt" = now()
FROM rewritten
WHERE m.id = rewritten.id;
