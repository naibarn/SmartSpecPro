-- Align Gemini Omni Enhanced duration metadata with the provider catalog.
-- The model exposes 4/6/8/10 second choices; keep the migration idempotent.

UPDATE "media_models"
SET "configJson" = jsonb_set(
  "configJson"::jsonb,
  '{videoCapabilityProfile,modes,0,maxVideoDurationSec}',
  '10'::jsonb,
  true
)::json
WHERE "modelId" IN ('gemini-omni-video', 'gemini-omni-flash-1-1')
  AND "modelType" = 'video'::media_model_type
  AND "configJson" IS NOT NULL;
