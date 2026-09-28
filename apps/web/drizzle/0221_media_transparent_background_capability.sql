-- Enable the provider-verified native alpha control for the unified Kie GPT Image 2 row.
-- Nano Banana rows remain opt-out because their provider contract does not verify alpha output.
UPDATE "media_models"
SET
  "configJson" = jsonb_set(
    jsonb_set(
      COALESCE("configJson"::jsonb, '{}'::jsonb),
      '{supportsTransparentBackground}',
      'true'::jsonb,
      true
    ),
    '{transparentBackground}',
    '{
      "inputKey": "background",
      "enabledValue": "transparent",
      "disabledValue": "auto",
      "outputFormat": "png"
    }'::jsonb,
    true
  ),
  "updatedAt" = NOW()
WHERE "modelId" = 'gpt-image-2-text-to-image';
