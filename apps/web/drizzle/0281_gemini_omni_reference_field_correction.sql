-- Correct the Gemini Omni provider field mapping without rewriting prompt/media data.
-- 0280 is kept immutable after being applied; this follow-up is idempotent.

UPDATE "media_models"
SET "configJson" = jsonb_set(
  jsonb_set(
    "configJson"::jsonb,
    '{videoCapabilityProfile,modes,0,maxTotalReferences}',
    'null'::jsonb,
    true
  ),
  '{videoCapabilityProfile,modes,0,nativeFieldMap,audio}',
  '"audio_ids"'::jsonb,
  true
)::json
WHERE "modelId" IN ('gemini-omni-video', 'gemini-omni-flash-1-1')
  AND "modelType" = 'video'::media_model_type
  AND "configJson" IS NOT NULL;
