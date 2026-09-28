ALTER TABLE "skills"
  ADD COLUMN "tenantCreditPricingSource" varchar(32) NOT NULL DEFAULT 'default';

-- Historical averages are only applied to canonical, explicitly identified
-- skill usage. Keep that provenance separate from future admin overrides.
UPDATE "skills" s
SET "tenantCreditPricingSource" = 'historical_average'
WHERE EXISTS (
  SELECT 1
  FROM "credit_transactions" ct
  WHERE ct."sourceType" = 'skill'
    AND ct.type = 'usage'
    AND ct."skillSlug" IS NOT NULL
    AND CASE
      WHEN ct."skillSlug" = 'elevenlabs-beauty-dialogue'
        THEN 'elevenlabs-product-voiceover-dialogue'
      ELSE ct."skillSlug"
    END = s.slug
);

-- Skills without usable history receive a conservative tier by execution
-- size. All values remain integer and actual measured work still caps them.
UPDATE "skills" s
SET "tenantCreditCost" = CASE
      WHEN s.category IN ('video_generation', 'image_video_generation')
        OR s."executionMode" IN ('video-generate', 'media-generate') THEN 8
      WHEN s.category IN ('audio_generation', 'audio_prompt_generation')
        OR s."executionMode" IN ('audio-generate', 'tts') THEN 6
      WHEN s.category IN ('image_generation', 'image_prompt_generation')
        OR s."executionMode" IN ('image-generate', 'image-prompt') THEN 4
      WHEN s.category IN ('document_analysis', 'web_search', 'data_analysis', 'automation', 'product_review')
        OR s."executionMode" = 'python' THEN 4
      ELSE 2
    END,
    "tenantCreditPricingSource" = 'default_tier',
    "updatedAt" = NOW()
WHERE s."tenantCreditPricingSource" = 'default'
  AND NOT EXISTS (
    SELECT 1
    FROM "credit_transactions" ct
    WHERE ct."sourceType" = 'skill'
      AND ct.type = 'usage'
      AND ct."skillSlug" IS NOT NULL
      AND CASE
        WHEN ct."skillSlug" = 'elevenlabs-beauty-dialogue'
          THEN 'elevenlabs-product-voiceover-dialogue'
        ELSE ct."skillSlug"
      END = s.slug
  );
