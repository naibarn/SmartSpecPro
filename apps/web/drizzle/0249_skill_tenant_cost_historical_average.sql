-- Initialize tenant revenue pricing from historical skill debit usage.
-- Only explicit skill usage debits are included; refunds and revenue credits are excluded.
-- The result is always an even integer: ceil(average debit * 20% / 2) * 2.
WITH normalized_history AS (
  SELECT
    CASE
      WHEN ct."skillSlug" = 'elevenlabs-beauty-dialogue'
        THEN 'elevenlabs-product-voiceover-dialogue'
      ELSE ct."skillSlug"
    END AS canonical_slug,
    ABS(ct.amount)::numeric AS debit_amount
  FROM "credit_transactions" ct
  WHERE ct."sourceType" = 'skill'
    AND ct."type" = 'usage'
    AND ct."skillSlug" IS NOT NULL
    AND ct.amount < 0
), calculated AS (
  SELECT
    canonical_slug,
    (CEIL((AVG(debit_amount) * 0.20) / 2.0) * 2)::int AS tenant_cost
  FROM normalized_history
  GROUP BY canonical_slug
)
UPDATE "skills" s
SET "tenantCreditCost" = calculated.tenant_cost,
    "updatedAt" = NOW()
FROM calculated
WHERE s."slug" = calculated.canonical_slug;

DO $$
DECLARE
  unresolved_slugs text;
BEGIN
  SELECT string_agg(unresolved.slug, ', ' ORDER BY unresolved.slug)
  INTO unresolved_slugs
  FROM (
    SELECT DISTINCT ct."skillSlug" AS slug
    FROM "credit_transactions" ct
    LEFT JOIN "skills" s
      ON s."slug" = CASE
        WHEN ct."skillSlug" = 'elevenlabs-beauty-dialogue'
          THEN 'elevenlabs-product-voiceover-dialogue'
        ELSE ct."skillSlug"
      END
    WHERE ct."sourceType" = 'skill'
      AND ct."type" = 'usage'
      AND ct."skillSlug" IS NOT NULL
      AND ct.amount < 0
      AND s.id IS NULL
  ) unresolved;

  IF unresolved_slugs IS NOT NULL THEN
    RAISE NOTICE 'Skill tenant-cost history has unresolved slugs: %', unresolved_slugs;
  END IF;
END $$;
