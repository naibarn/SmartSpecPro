-- Align the persisted Grok Imagine Image 2 catalog row with Kie.ai's current
-- image-edit contract: up to five image_urls, aspect_ratio, and 390000-char prompts.
UPDATE "media_models"
SET "configJson" = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        "configJson"::jsonb,
        '{maxPromptLength}',
        '390000'::jsonb,
        true
      ),
      '{maxReferenceImages}',
      '5'::jsonb,
      true
    ),
    '{apiConfig,reference_image_input_key}',
    '"image_urls"'::jsonb,
    true
  ),
  '{apiConfig,reference_image_input_type}',
  '"array"'::jsonb,
  true
)::json,
"updatedAt" = NOW()
WHERE "modelId" = 'grok-imagine-image-2';

UPDATE "media_models"
SET "configJson" = jsonb_set(
  "configJson"::jsonb,
  '{apiConfig,operations,image-edit,drop_params}',
  '["resolution", "output_format", "sourceMediaTaskId", "grokOperation"]'::jsonb,
  true
)::json,
"updatedAt" = NOW()
WHERE "modelId" = 'grok-imagine-image-2';
