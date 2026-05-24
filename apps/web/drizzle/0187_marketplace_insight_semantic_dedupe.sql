ALTER TABLE "marketplace_capture_insights"
  ADD COLUMN IF NOT EXISTS "semanticKey" varchar(160);

UPDATE "marketplace_capture_insights"
SET "semanticKey" = 'insight:' || md5(
  "platform"::text || '|' ||
  COALESCE("payloadJson"->'__syncMetadata'->'sourceIdentity'->>'canonicalSourceUrl',
           "payloadJson"->'__syncMetadata'->'sourceIds'->>'canonicalSourceUrl',
           "sourceUrl") || '|' ||
  COALESCE("payloadJson"->'__syncMetadata'->'sourceIdentity'->>'externalProductId',
           "payloadJson"->'__syncMetadata'->'sourceIds'->>'externalProductId',
           '') || '|' ||
  COALESCE("payloadJson"->'__syncMetadata'->'sourceIdentity'->>'externalShopId',
           "payloadJson"->'__syncMetadata'->'sourceIds'->>'externalShopId',
           '') || '|' ||
  "insightType" || '|' ||
  "provider" || '|' ||
  "schemaVersion" || '|' ||
  COALESCE(substring("idempotencyKey" from '([^:]+)$'), "payloadHash")
)
WHERE "semanticKey" IS NULL;

CREATE TABLE IF NOT EXISTS "marketplace_capture_insights_dedup_backup_0187" AS
SELECT *
FROM "marketplace_capture_insights"
WHERE false;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "userId", COALESCE("tenantId", 'personal'), "semanticKey"
      ORDER BY
        ("productId" IS NOT NULL) DESC,
        ("captureId" IS NOT NULL) DESC,
        (COALESCE(jsonb_array_length("claimResolutionsJson"), 0) > 0) DESC,
        (COALESCE(("payloadJson"->'__syncMetadata'->>'storyOptionVideoBriefCount')::int, 0)) DESC,
        "updatedAt" DESC,
        "createdAt" DESC,
        id DESC
    ) AS duplicate_rank
  FROM "marketplace_capture_insights"
  WHERE "semanticKey" IS NOT NULL
),
duplicates AS (
  SELECT id
  FROM ranked
  WHERE duplicate_rank > 1
)
INSERT INTO "marketplace_capture_insights_dedup_backup_0187"
SELECT insight.*
FROM "marketplace_capture_insights" insight
JOIN duplicates ON duplicates.id = insight.id;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "userId", COALESCE("tenantId", 'personal'), "semanticKey"
      ORDER BY
        ("productId" IS NOT NULL) DESC,
        ("captureId" IS NOT NULL) DESC,
        (COALESCE(jsonb_array_length("claimResolutionsJson"), 0) > 0) DESC,
        (COALESCE(("payloadJson"->'__syncMetadata'->>'storyOptionVideoBriefCount')::int, 0)) DESC,
        "updatedAt" DESC,
        "createdAt" DESC,
        id DESC
    ) AS duplicate_rank
  FROM "marketplace_capture_insights"
  WHERE "semanticKey" IS NOT NULL
)
DELETE FROM "marketplace_capture_insights"
USING ranked
WHERE "marketplace_capture_insights".id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_insights_semantic"
  ON "marketplace_capture_insights" ("userId", COALESCE("tenantId", 'personal'), "semanticKey")
  WHERE "semanticKey" IS NOT NULL;
