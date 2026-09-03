-- Align both Nano Banana 2 image models with the provider's current input
-- contract: up to 14 reference images. Keep this targeted so admin-maintained
-- configuration for every other media model remains untouched.
UPDATE "media_models"
SET
  "configJson" = jsonb_set(
    jsonb_set(
      COALESCE("configJson"::jsonb, '{}'::jsonb),
      '{maxReferenceImages}',
      '14'::jsonb,
      true
    ),
    '{inputFields,0,maxItems}',
    '14'::jsonb,
    true
  ),
  "updatedAt" = NOW()
WHERE "modelId" IN ('google-banana-2', 'google-banana-2-lite');
