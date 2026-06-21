-- Enable top-level reference image attachments for MCP-backed media models.
-- The Media Studio attachment UI reads configJson reference support, while
-- MCP transport sends the resolved URLs through provider-specific arguments.

WITH target AS (
  SELECT
    id,
    "modelType",
    "configJson"::jsonb AS config_json
  FROM media_models
  WHERE "configJson"::jsonb ->> 'transport' = 'mcp'
), rewritten AS (
  SELECT
    id,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              config_json,
              '{supportsReferenceImages}',
              'true'::jsonb,
              true
            ),
            '{referenceInputs}',
            jsonb_build_object('image', true, 'video', "modelType" = 'video'),
            true
          ),
          '{referenceImageLimit}',
          '5'::jsonb,
          true
        ),
        '{generateType}',
        to_jsonb(CASE WHEN "modelType" = 'video' THEN 'image-to-video' ELSE 'reference-to-image' END),
        true
      ),
      '{inputFields}',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(config_json->'inputFields', '[]'::jsonb)) AS field
          WHERE field->>'syncWith' = 'reference_images'
             OR field->>'type' = 'image_urls'
        ) THEN COALESCE(config_json->'inputFields', '[]'::jsonb)
        ELSE COALESCE(config_json->'inputFields', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object(
            'key', 'reference_image_urls',
            'label', 'Reference Images',
            'type', 'image_urls',
            'syncWith', 'reference_images',
            'maxItems', 5,
            'includeInPayload', false
          )
        )
      END,
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
