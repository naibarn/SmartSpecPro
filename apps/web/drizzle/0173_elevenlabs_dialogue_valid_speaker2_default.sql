WITH target_model AS (
  SELECT
    id,
    "configJson"::jsonb AS config_json
  FROM media_models
  WHERE "modelId" = 'elevenlabs/text-to-dialogue'
),
rewritten_fields AS (
  SELECT
    target_model.id,
    jsonb_agg(
      CASE
        WHEN field_json ->> 'key' = 'voice_id_2' THEN
          field_json || jsonb_build_object('default', 'pNInz6obpgDQGcFmaJgB')
        ELSE field_json
      END
      ORDER BY ordinality
    ) AS input_fields
  FROM target_model
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(target_model.config_json -> 'inputFields', '[]'::jsonb)) WITH ORDINALITY AS fields(field_json, ordinality)
  GROUP BY target_model.id
)
UPDATE media_models
SET "configJson" = jsonb_set(media_models."configJson"::jsonb, '{inputFields}', rewritten_fields.input_fields)
FROM rewritten_fields
WHERE media_models.id = rewritten_fields.id;--> statement-breakpoint
