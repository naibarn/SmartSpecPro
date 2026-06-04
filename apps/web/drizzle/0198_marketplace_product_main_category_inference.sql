WITH category_evidence AS (
  SELECT
    product."id",
    lower(concat_ws(
      ' ',
      product."productName",
      product."descriptionText",
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
    )) AS evidence
  FROM "marketplace_products" product
  LEFT JOIN "marketplace_capture_sessions" capture
    ON capture."id" = product."captureId"
  WHERE product."productCategory" IS NULL
     OR product."productCategory" = ''
     OR product."productCategory" = 'auto'
),
inferred AS (
  SELECT
    "id",
    CASE
      WHEN evidence ~ '(คอมพิวเตอร์และแล็ปท็อป|แล็ปท็อป|ปริ้นเตอร์|printer|keyboard|คีย์บอร์ด)' THEN 'computer_laptop'
      WHEN evidence ~ '(มือถือ|แท็บเล็ต|โทรศัพท์|สมาร์ทโฟน|tablet|mobile)' THEN 'mobile_tablet'
      WHEN evidence ~ '(กล้อง|ถ่ายภาพ|camera|photography)' THEN 'camera_photography'
      WHEN evidence ~ '(เกมส์|เกม|gaming)' THEN 'gaming_accessories'
      WHEN evidence ~ '(อุปกรณ์อิเล็กทรอนิกส์|electronics|หูฟัง|ลำโพง|power bank)' THEN 'electronics'
      WHEN evidence ~ '(เครื่องใช้ไฟฟ้า|ตู้เย็น|ไมโครเวฟ|หม้อทอด|พัดลม|แอร์)' THEN 'electrical_appliance'
      WHEN evidence ~ '(ของเล่น สินค้าแม่และเด็ก|สินค้าแม่และเด็ก|แม่และเด็ก|เด็ก|ทารก|เก้าอี้ทานข้าว)' THEN 'mother_baby'
      WHEN evidence ~ '(สัตว์เลี้ยง|อาหารสัตว์|pet)' THEN 'pet_supplies'
      WHEN evidence ~ '(กีฬาและกิจกรรมกลางแจ้ง|กีฬา|ฟิตเนส|ออกกำลังกาย|sports|fitness)' THEN 'sports_equipment'
      WHEN evidence ~ '(รถยนต์|มอเตอร์ไซค์|ยานยนต์|automotive)' THEN 'automotive'
      WHEN evidence ~ '(อาหาร|เครื่องดื่ม|food|beverage)' THEN 'food_beverage'
      WHEN evidence ~ '(เครื่องสำอาง|สกินแคร์|ความงาม|ดูแลช่องปาก|cosmetic|skincare)' THEN 'cosmetics'
      WHEN evidence ~ '(รองเท้า|shoes)' THEN 'shoes'
      WHEN evidence ~ '(เสื้อผ้า|แฟชั่น|fashion|clothing)' THEN 'fashion_clothing'
      WHEN evidence ~ '(นาฬิกา|แว่นตา|watch|eyewear)' THEN 'watch_eyewear'
      WHEN evidence ~ '(เครื่องประดับ|jewelry)' THEN 'jewelry'
      WHEN evidence ~ '(หนังสือ|books)' THEN 'books'
      WHEN evidence ~ '(เครื่องเขียน|stationery)' THEN 'stationery'
      WHEN evidence ~ '(เฟอร์นิเจอร์|โต๊ะ|เก้าอี้|โซฟา|เตียง|ชั้นวาง|furniture)' THEN 'furniture'
      WHEN evidence ~ '(เครื่องใช้ในบ้าน|จัดเก็บ|ไม้แขวน|home storage|household)' THEN 'household_product'
      ELSE NULL
    END AS "productCategory"
  FROM category_evidence
)
UPDATE "marketplace_products" product
SET
  "productCategory" = inferred."productCategory",
  "descriptionJson" = COALESCE(product."descriptionJson", '{}'::jsonb) || jsonb_build_object('productCategory', inferred."productCategory"),
  "platformRawJson" = COALESCE(product."platformRawJson", '{}'::jsonb) || jsonb_build_object('latestProductCategoryBackfill', inferred."productCategory"),
  "updatedAt" = now()
FROM inferred
WHERE product."id" = inferred."id"
  AND inferred."productCategory" IS NOT NULL
  AND (product."productCategory" IS NULL OR product."productCategory" = '' OR product."productCategory" = 'auto');
