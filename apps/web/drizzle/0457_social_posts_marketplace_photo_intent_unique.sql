CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_marketplace_photo_intent_unique"
  ON "social_posts" ("tenantId", "pageId", ("metadata"->>'autoReviewRunId'))
  WHERE "metadata"->>'source' = 'marketplace_auto_review_photo_post'
    AND "metadata"->>'autoReviewRunId' IS NOT NULL;
