-- Align the unified Kie AI GPT Image 2 catalog row with the provider's
-- current image-to-image contract:
--   prompt: <= 20,000 characters
--   input_urls: <= 16 items
--
-- Keep this update targeted. Re-running the full Kie AI seed would replace
-- configJson for every catalog row and could discard admin-maintained values.
UPDATE "media_models"
SET
  "configJson" = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE("configJson"::jsonb, '{}'::jsonb),
        '{maxPromptLength}',
        '20000'::jsonb,
        true
      ),
      '{maxReferenceImages}',
      '16'::jsonb,
      true
    ),
    '{inputFields,0,maxItems}',
    '16'::jsonb,
    true
  ),
  "updatedAt" = NOW()
WHERE "modelId" = 'gpt-image-2-text-to-image';
