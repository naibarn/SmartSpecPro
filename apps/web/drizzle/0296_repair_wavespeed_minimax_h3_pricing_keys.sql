-- Keep H3 video-edit reference surcharge keys aligned with dynamic input field names.
UPDATE "media_models"
SET "configJson" = jsonb_set(
  "configJson"::jsonb,
  '{pricingAdditionalReferenceCosts}',
  '{"reference_images":20,"reference_audios":20}'::jsonb
)::json,
"updatedAt" = NOW()
WHERE "provider" = 'wavespeed_ai'
  AND "modelId" = 'wavespeed-ai/minimax-h3/video-edit';
