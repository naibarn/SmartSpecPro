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
        WHEN field_json ->> 'key' IN ('voice_id', 'voice_id_2')
          AND field_json ->> 'default' = '21m00Tcm4TlvDq8ikWAM'
          THEN jsonb_set(
            field_json || jsonb_build_object('default', 'pNInz6obpgDQGcFmaJgB'),
            '{options}',
            COALESCE((
              SELECT jsonb_agg(option_item ORDER BY option_ordinality)
              FROM jsonb_array_elements(COALESCE(field_json -> 'options', '[]'::jsonb)) WITH ORDINALITY AS options(option_item, option_ordinality)
              WHERE option_item ->> 'value' <> '21m00Tcm4TlvDq8ikWAM'
            ), '[]'::jsonb)
          )
        WHEN field_json ->> 'key' IN ('voice_id', 'voice_id_2')
          AND jsonb_typeof(field_json -> 'options') = 'array'
          THEN jsonb_set(
            field_json,
            '{options}',
            COALESCE((
              SELECT jsonb_agg(option_item ORDER BY option_ordinality)
              FROM jsonb_array_elements(COALESCE(field_json -> 'options', '[]'::jsonb)) WITH ORDINALITY AS options(option_item, option_ordinality)
              WHERE option_item ->> 'value' <> '21m00Tcm4TlvDq8ikWAM'
            ), '[]'::jsonb)
          )
        WHEN field_json ->> 'key' = 'inputs'
          AND jsonb_typeof(field_json -> 'itemFields') = 'array'
          THEN jsonb_set(
            field_json,
            '{itemFields}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN item_field ->> 'key' = 'voice_id'
                    AND item_field ->> 'default' = '21m00Tcm4TlvDq8ikWAM'
                    THEN jsonb_set(
                      item_field || jsonb_build_object('default', 'pNInz6obpgDQGcFmaJgB'),
                      '{options}',
                      COALESCE((
                        SELECT jsonb_agg(option_item ORDER BY option_ordinality)
                        FROM jsonb_array_elements(COALESCE(item_field -> 'options', '[]'::jsonb)) WITH ORDINALITY AS options(option_item, option_ordinality)
                        WHERE option_item ->> 'value' <> '21m00Tcm4TlvDq8ikWAM'
                      ), '[]'::jsonb)
                    )
                  WHEN item_field ->> 'key' = 'voice_id'
                    AND jsonb_typeof(item_field -> 'options') = 'array'
                    THEN jsonb_set(
                      item_field,
                      '{options}',
                      COALESCE((
                        SELECT jsonb_agg(option_item ORDER BY option_ordinality)
                        FROM jsonb_array_elements(COALESCE(item_field -> 'options', '[]'::jsonb)) WITH ORDINALITY AS options(option_item, option_ordinality)
                        WHERE option_item ->> 'value' <> '21m00Tcm4TlvDq8ikWAM'
                      ), '[]'::jsonb)
                    )
                  ELSE item_field
                END
                ORDER BY item_ordinality
              )
              FROM jsonb_array_elements(field_json -> 'itemFields') WITH ORDINALITY AS item_fields(item_field, item_ordinality)
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
