WITH product_category_evidence AS (
  SELECT
    product."id",
    lower(concat_ws(
      ' ',
      product."descriptionJson"->>'categoryText',
      product."descriptionJson"->>'categoryPath',
      product."specsJson"->>'categoryText',
      product."specsJson"->>'categoryPath',
      product."platformRawJson"->>'categoryText',
      product."platformRawJson"->>'categoryPath',
      capture."rawPayloadJson"->>'categoryText',
      capture."rawPayloadJson"->>'categoryPath',
      capture."normalizedResultJson"->>'categoryText',
      capture."normalizedResultJson"->>'categoryPath'
    )) AS marketplace_category_evidence
  FROM "marketplace_products" product
  LEFT JOIN "marketplace_capture_sessions" capture
    ON capture."id" = product."captureId"
),
path_priority_inferred AS (
  SELECT
    "id",
    CASE
      WHEN marketplace_category_evidence ~ '(คอมพิวเตอร์และแล็ปท็อป|ปริ้นเตอร์และอุปกรณ์เสริม)' THEN 'computer_laptop'
      WHEN marketplace_category_evidence ~ '(มือถือและแท็บเล็ต)' THEN 'mobile_tablet'
      WHEN marketplace_category_evidence ~ '(กล้องและอุปกรณ์ถ่ายภาพ)' THEN 'camera_photography'
      WHEN marketplace_category_evidence ~ '(เกมส์|เกม)' THEN 'gaming_accessories'
      WHEN marketplace_category_evidence ~ '(เครื่องใช้ไฟฟ้า)' THEN 'electrical_appliance'
      WHEN marketplace_category_evidence ~ '(ของเล่น สินค้าแม่และเด็ก|สินค้าแม่และเด็ก|เก้าอี้ทานข้าวและเบาะรองนั่ง)' THEN 'mother_baby'
      WHEN marketplace_category_evidence ~ '(กีฬาและกิจกรรมกลางแจ้ง|อุปกรณ์ฟิตเนสและออกกำลังกาย|เครื่องออกกำลังกาย)' THEN 'sports_equipment'
      WHEN marketplace_category_evidence ~ '(เฟอร์นิเจอร์|เตียง|โซฟา|ชั้นวางของ|โต๊ะ)' THEN 'furniture'
      WHEN marketplace_category_evidence ~ '(เครื่องใช้ในบ้าน|อุปกรณ์สำหรับจัดเก็บ|home storage hooks|ไม้แขวน)' THEN 'household_product'
      WHEN marketplace_category_evidence ~ '(ความงามและของใช้ส่วนตัว|ดูแลช่องปาก|เครื่องสำอาง|สกินแคร์)' THEN 'cosmetics'
      ELSE NULL
    END AS "productCategory"
  FROM product_category_evidence
)
UPDATE "marketplace_products" product
SET
  "productCategory" = inferred."productCategory",
  "descriptionJson" = COALESCE(product."descriptionJson", '{}'::jsonb) || jsonb_build_object('productCategory', inferred."productCategory"),
  "platformRawJson" = COALESCE(product."platformRawJson", '{}'::jsonb) || jsonb_build_object('latestProductCategoryPathPriorityBackfill', inferred."productCategory"),
  "updatedAt" = now()
FROM path_priority_inferred inferred
WHERE product."id" = inferred."id"
  AND inferred."productCategory" IS NOT NULL
  AND COALESCE(product."productCategory", '') <> inferred."productCategory";
