DROP INDEX IF EXISTS "social_posts_marketplace_photo_intent_unique";

CREATE UNIQUE INDEX "social_posts_marketplace_photo_intent_unique"
  ON "social_posts" (
    "tenantId",
    "pageId",
    ("metadata"->>'autoReviewRunId'),
    (COALESCE("metadata"->>'imageChecksum', "metadata"->>'imageStorageKey'))
  )
  WHERE "metadata"->>'source' = 'marketplace_auto_review_photo_post'
    AND "metadata"->>'autoReviewRunId' IS NOT NULL
    AND COALESCE("metadata"->>'imageChecksum', "metadata"->>'imageStorageKey') IS NOT NULL;
