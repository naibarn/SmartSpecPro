CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_marketplace_reels_intent_unique"
  ON "social_posts" ("tenantId", "pageId", ("metadata"->>'intentHash'))
  WHERE "metadata"->>'source' = 'marketplace_auto_review_reels'
    AND "metadata"->>'intentHash' IS NOT NULL;
