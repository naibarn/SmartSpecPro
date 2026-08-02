-- Correct the Kie AI "Seedream 5.0 Pro" unified row (modelId
-- 'seedream/5-pro-text-to-image') from the estimated placeholder pricing
-- seeded in 0215_seedream_5_pro_auto_routing.sql to the provider's real
-- published rates:
--   - 1K ("basic" quality tier): $0.035 per image
--   - 2K ("high" quality tier):  $0.07 per image
-- Platform conversion (creditService.ts ~line 1146, planning/llm-multi-provider/spec.md
-- line 168): 1 credit = $0.001 USD, i.e. credits = USD * 1000. This yields:
--   - basic: $0.035 * 1000 = 35 credits
--   - high:  $0.07  * 1000 = 70 credits
-- "creditCost" (the flat/default fallback) is set to 70, matching the high
-- tier, consistent with how the 0215 row was originally set up.
--
-- NOTE: kie.ai also charges $0.0025 per input/reference image (first image
-- free). The current "pricingFormula" values ("flat" | "per_unit" |
-- "per_duration") have no representation for "per-item surcharge stacked on
-- top of a flat base price", so this per-input-image cost is NOT charged.
-- At the maxReferenceImages cap of 10 (9 billable after the first free
-- image), this under-charges heavy multi-reference image-to-image use by
-- up to 9 * $0.0025 = $0.0225 => ~22 credits per generation. This is a known
-- gap, not something this migration attempts to fix.
--
-- This is a targeted, idempotent UPDATE of exactly one row. Do NOT edit
-- 0215 (already applied to the live DB, sha256 recorded in
-- drizzle.__drizzle_migrations) and do NOT touch any other model row.
UPDATE "media_models"
SET
  "creditCost" = 70,
  "configJson" = (
    jsonb_set(
      jsonb_set(
        "configJson"::jsonb,
        '{pricingTiers,basic}',
        '35'::jsonb,
        true
      ),
      '{pricingTiers,high}',
      '70'::jsonb,
      true
    )
  )::json,
  "updatedAt" = NOW()
WHERE "modelId" = 'seedream/5-pro-text-to-image';
