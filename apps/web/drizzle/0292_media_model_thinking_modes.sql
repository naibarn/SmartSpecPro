-- Add first-class thinking-mode metadata to the media model catalog.
-- Models without provider thinking/reasoning support use the sentinel `none`.
ALTER TABLE "media_models"
  ADD COLUMN IF NOT EXISTS "thinkingModeDefault" varchar(32) NOT NULL DEFAULT 'none';

ALTER TABLE "media_models"
  ADD COLUMN IF NOT EXISTS "thinkingModes" json NOT NULL DEFAULT '["none"]'::json;

-- GPT Image 2.5 exposes thinking mode through Kie AI's `quality` parameter.
UPDATE "media_models"
SET
  "thinkingModeDefault" = 'medium',
  "thinkingModes" = '["low","medium","high","xhigh","max"]'::json,
  "configJson" = jsonb_set(
    jsonb_set(
      COALESCE("configJson"::jsonb, '{}'::jsonb),
      '{inputFields}',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE("configJson"::jsonb -> 'inputFields', '[]'::jsonb)) AS field
          WHERE field ->> 'key' = 'quality'
        ) THEN COALESCE("configJson"::jsonb -> 'inputFields', '[]'::jsonb)
        ELSE COALESCE("configJson"::jsonb -> 'inputFields', '[]'::jsonb) ||
          '[{"key":"quality","label":"Thinking Mode","type":"select","options":[{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"},{"value":"xhigh","label":"XHigh"},{"value":"max","label":"Max"}],"default":"medium"}]'::jsonb
      END,
      true
    ),
    '{apiConfig}',
    COALESCE("configJson"::jsonb -> 'apiConfig', '{}'::jsonb) ||
      jsonb_build_object(
        'defaultInputParams',
        COALESCE("configJson"::jsonb -> 'apiConfig' -> 'defaultInputParams', '{}'::jsonb) || '{"quality":"medium"}'::jsonb
      ),
    true
  )::json,
  "updatedAt" = NOW()
WHERE "modelId" IN (
  'gpt-image-2-5-flare-text-to-image',
  'gpt-image-2-5-sunburst-text-to-image'
);
