ALTER TABLE "marketplace_products"
  ADD COLUMN IF NOT EXISTS "productCategory" varchar(64);

UPDATE "marketplace_products" product
SET "productCategory" = candidate."productCategory"
FROM (
  SELECT
    product."id",
    COALESCE(
      NULLIF(product."productCategory", ''),
      NULLIF(product."platformRawJson"->>'productCategory', ''),
      NULLIF(product."platformRawJson"->>'mainCategory', ''),
      NULLIF((product."platformRawJson"->'latestProductDraft')->>'productCategory', ''),
      NULLIF((product."descriptionJson")->>'productCategory', ''),
      NULLIF((product."specsJson")->>'productCategory', ''),
      NULLIF(capture."rawPayloadJson"->>'productCategory', ''),
      NULLIF(capture."normalizedResultJson"->>'productCategory', ''),
      NULLIF(brief."payloadJson"->>'productCategory', ''),
      NULLIF(handoff."payloadJson"->>'productCategory', '')
    ) AS "productCategory"
  FROM "marketplace_products" product
  LEFT JOIN "marketplace_capture_sessions" capture
    ON capture."id" = product."captureId"
  LEFT JOIN LATERAL (
    SELECT insight."payloadJson"
    FROM "marketplace_capture_insights" insight
    WHERE insight."productId" = product."id"
      AND insight."insightType" = 'product_brief'
    ORDER BY insight."createdAt" DESC
    LIMIT 1
  ) brief ON true
  LEFT JOIN LATERAL (
    SELECT insight."payloadJson"
    FROM "marketplace_capture_insights" insight
    WHERE insight."productId" = product."id"
      AND insight."insightType" = 'storytelling_handoff'
    ORDER BY insight."createdAt" DESC
    LIMIT 1
  ) handoff ON true
) candidate
WHERE product."id" = candidate."id"
  AND candidate."productCategory" IN (
    'auto',
    'household_product',
    'computer_laptop',
    'electrical_appliance',
    'food_beverage',
    'electronics',
    'fashion_clothing',
    'shoes',
    'watch_eyewear',
    'mobile_tablet',
    'jewelry',
    'mother_baby',
    'pet_supplies',
    'sports_equipment',
    'camera_photography',
    'gaming_accessories',
    'automotive',
    'stationery',
    'books',
    'furniture',
    'cosmetics'
  )
  AND (product."productCategory" IS NULL OR product."productCategory" = '');
