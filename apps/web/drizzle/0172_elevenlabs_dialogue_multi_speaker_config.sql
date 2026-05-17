WITH target_model AS (
  SELECT
    id,
    "configJson"::jsonb AS config_json,
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE("configJson"::jsonb -> 'inputFields', '[]'::jsonb)) AS field
      WHERE field ->> 'key' = 'voice_id_2'
    ) AS has_speaker_2_voice
  FROM media_models
  WHERE "modelId" = 'elevenlabs/text-to-dialogue'
),
rewritten_fields AS (
  SELECT
    target_model.id,
    jsonb_agg(field_items.field_json ORDER BY source_fields.ordinality, field_items.extra_ordinality) AS input_fields
  FROM target_model
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(target_model.config_json -> 'inputFields', '[]'::jsonb)) WITH ORDINALITY AS source_fields(field_json, ordinality)
  CROSS JOIN LATERAL (
    SELECT
      0 AS extra_ordinality,
      CASE
        WHEN source_fields.field_json ->> 'key' = 'voice_id' THEN
          source_fields.field_json
            || jsonb_build_object(
              'label', 'Speaker 1 Voice',
              'includeInPayload', false,
              'description', 'Used for Speaker 1, and for single-speaker dialogue when no Speaker 2 lines are present.'
            )
        WHEN source_fields.field_json ->> 'key' = 'inputs' THEN
          source_fields.field_json
            || jsonb_build_object(
              'promptSync',
              jsonb_build_object(
                'strategy', 'speaker_lines',
                'textKey', 'text',
                'defaultVoiceField', 'voice_id',
                'speakerPattern', '^\s*Speaker\s*(\d+)\s*[:：-]\s*(.*)$',
                'speakerVoiceFields', jsonb_build_object('1', 'voice_id', '2', 'voice_id_2')
              )
            )
        ELSE source_fields.field_json
      END AS field_json
    UNION ALL
    SELECT
      1 AS extra_ordinality,
      source_fields.field_json
        || jsonb_build_object(
          'key', 'voice_id_2',
          'label', 'Speaker 2 Voice',
          'includeInPayload', false,
          'default', 'pNInz6obpgDQGcFmaJgB',
          'description', 'Used for Speaker 2 when the generated dialogue contains Speaker 2 lines.'
        ) AS field_json
    WHERE source_fields.field_json ->> 'key' = 'voice_id'
      AND NOT target_model.has_speaker_2_voice
  ) AS field_items
  GROUP BY target_model.id
)
UPDATE media_models
SET "configJson" = jsonb_set(media_models."configJson"::jsonb, '{inputFields}', rewritten_fields.input_fields)
FROM rewritten_fields
WHERE media_models.id = rewritten_fields.id;--> statement-breakpoint
