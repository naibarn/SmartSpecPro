-- Align the persisted Kie.ai Grok Imagine Video 1.5 catalog row with the
-- current API contract: up to seven images, 480p/720p/1080p, and 1-15s.
-- Keep this migration idempotent so environments that already have the row
-- can safely receive the corrected metadata.
WITH updated AS (
  SELECT
    "modelId",
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            "configJson"::jsonb,
            '{maxReferenceImages}',
            '7'::jsonb
          ),
          '{supportedResolutions}',
          '["480p", "720p", "1080p"]'::jsonb
        ),
        '{supportedDurations}',
        '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]'::jsonb
      ),
      '{supportedAspectRatios}',
      '["auto", "1:1", "16:9", "9:16", "3:2", "2:3"]'::jsonb
    ) AS "baseConfigJson"
  FROM "media_models"
  WHERE "modelId" = 'grok-imagine-video-1-5-preview'
),
with_fields AS (
  SELECT
    u."modelId",
    jsonb_set(
      u."baseConfigJson",
      '{inputFields}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE field->>'key'
              WHEN 'image_urls' THEN field || '{"maxItems": 7}'::jsonb
              WHEN 'aspect_ratio' THEN field || jsonb_build_object(
                'options', jsonb_build_array(
                  jsonb_build_object('value', 'auto', 'label', 'Auto'),
                  jsonb_build_object('value', '1:1', 'label', '1:1'),
                  jsonb_build_object('value', '16:9', 'label', '16:9'),
                  jsonb_build_object('value', '9:16', 'label', '9:16'),
                  jsonb_build_object('value', '3:2', 'label', '3:2'),
                  jsonb_build_object('value', '2:3', 'label', '2:3')
                )
              )
              WHEN 'resolution' THEN field || jsonb_build_object(
                'options', jsonb_build_array(
                  jsonb_build_object('value', '480p', 'label', '480p'),
                  jsonb_build_object('value', '720p', 'label', '720p'),
                  jsonb_build_object('value', '1080p', 'label', '1080p')
                )
              )
              ELSE field
            END
            ORDER BY ordinality
          )
          FROM jsonb_array_elements(u."baseConfigJson"->'inputFields')
            WITH ORDINALITY AS fields(field, ordinality)
        ),
        '[]'::jsonb
      )
    ) AS "configJson"
  FROM updated u
)
UPDATE "media_models" AS model
SET
  "aspectRatios" = '["auto", "1:1", "16:9", "9:16", "3:2", "2:3"]'::json,
  "durations" = '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]'::json,
  "configJson" = with_fields."configJson"::json,
  "updatedAt" = NOW()
FROM with_fields
WHERE model."modelId" = with_fields."modelId";
