WITH target_models AS (
  SELECT
    id,
    "configJson"::jsonb AS config_json
  FROM media_models
  WHERE provider = 'elevenlabs'
),
rewritten_fields AS (
  SELECT
    target_models.id,
    jsonb_agg(
      CASE
        WHEN field_json ->> 'key' = 'stability'
          THEN field_json
            || jsonb_build_object(
              'description',
              'Auto is recommended. Use More expressive / ad energy for stronger sales delivery. Maximum stability sounds calmer and can reduce emotional punch.',
              'options',
              jsonb_build_array(
                jsonb_build_object('value', 'auto', 'label', 'Auto'),
                jsonb_build_object('value', '0.25', 'label', 'More expressive / ad energy (0.25)'),
                jsonb_build_object('value', '0.5', 'label', 'Balanced (0.5)'),
                jsonb_build_object('value', '0.75', 'label', 'Stable (0.75)'),
                jsonb_build_object('value', '1', 'label', 'Maximum stability (1.0)')
              )
            )
        ELSE field_json
      END
      ORDER BY field_ordinality
    ) AS input_fields
  FROM target_models
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(target_models.config_json -> 'inputFields', '[]'::jsonb)) WITH ORDINALITY AS fields(field_json, field_ordinality)
  GROUP BY target_models.id
)
UPDATE media_models
SET "configJson" = jsonb_set(media_models."configJson"::jsonb, '{inputFields}', rewritten_fields.input_fields)
FROM rewritten_fields
WHERE media_models.id = rewritten_fields.id;--> statement-breakpoint
