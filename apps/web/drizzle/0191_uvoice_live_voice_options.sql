WITH tier_config("modelId", endpoint) AS (
  VALUES
    ('uvoice/tts-standard', 'https://uvoice.app/?getVoice=true&lang_selected=en&filter=Standard&source=API-DOCS'),
    ('uvoice/tts-natural', 'https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS'),
    ('uvoice/tts-premium', 'https://uvoice.app/?getVoice=true&lang_selected=en&filter=Premium&source=API-DOCS')
),
tier_fields AS (
  SELECT
    "modelId",
    jsonb_build_array(
      jsonb_build_object(
        'key', 'voiceID',
        'label', 'Voice ID',
        'type', 'text',
        'searchable', true,
        'options', '[]'::jsonb,
        'optionsSource', jsonb_build_object(
          'type', 'public_api',
          'endpoint', endpoint,
          'method', 'GET',
          'itemsPath', '',
          'valueField', 'voiceID',
          'labelField', 'displayName',
          'previewField', 'path',
          'previewBaseUrl', 'https://cdn.uvoice.app/',
          'cacheTtlSeconds', 300
        ),
        'required', true
      ),
      jsonb_build_object('key', 'speed', 'label', 'Speed', 'type', 'number', 'default', 1.1),
      jsonb_build_object('key', 'volume', 'label', 'Volume', 'type', 'number', 'default', 1),
      jsonb_build_object('key', 'pitch', 'label', 'Pitch', 'type', 'number', 'default', 1),
      jsonb_build_object('key', 'key', 'label', 'Key', 'type', 'number', 'default', 0),
      jsonb_build_object('key', 'autoBreak', 'label', 'Auto Break (Thai punctuation)', 'type', 'boolean', 'default', true),
      jsonb_build_object(
        'key', 'outputFormat',
        'label', 'Output Format',
        'type', 'select',
        'options', jsonb_build_array(
          jsonb_build_object('value', 'mp3', 'label', 'MP3'),
          jsonb_build_object('value', 'wav', 'label', 'WAV')
        ),
        'default', 'mp3'
      ),
      jsonb_build_object(
        'key', 'outputType',
        'label', 'Output Type',
        'type', 'select',
        'options', jsonb_build_array(
          jsonb_build_object('value', 'url', 'label', 'URL'),
          jsonb_build_object('value', 'base64', 'label', 'Base64')
        ),
        'default', 'url'
      )
    ) AS input_fields
  FROM tier_config
)
UPDATE media_models
SET
  voices = '[]'::json,
  "configJson" = jsonb_set(
    COALESCE(media_models."configJson"::jsonb, '{}'::jsonb),
    '{inputFields}',
    tier_fields.input_fields,
    true
  )
FROM tier_fields
WHERE media_models."modelId" = tier_fields."modelId";--> statement-breakpoint
