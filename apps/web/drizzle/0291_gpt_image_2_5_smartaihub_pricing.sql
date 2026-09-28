-- Align GPT Image 2.5 provider pricing with SmartAIHub credits.
-- SmartAIHub uses 1 USD = 1,000 credits: $0.03/$0.05/$0.08 => 30/50/80.
-- Keep one unified catalog row per variant; reference-image mode has the same price.
UPDATE "media_models"
SET
  "creditCost" = 30,
  "configJson" = jsonb_set(
    jsonb_set(
      jsonb_set(
        "configJson"::jsonb,
        '{pricingTiers}',
        '{"default":30,"1K":30,"2K":50,"4K":80}'::jsonb,
        true
      ),
      '{pricingFormula}',
      '"flat"'::jsonb,
      true
    ),
    '{inputFields,2,affectsPricing}',
    'true'::jsonb,
    true
  )::json,
  "updatedAt" = NOW()
WHERE "modelId" IN (
  'gpt-image-2-5-flare-text-to-image',
  'gpt-image-2-5-sunburst-text-to-image'
);
