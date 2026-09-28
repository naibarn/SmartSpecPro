-- Backfill only identities that can be proven from immutable ledger metadata
-- and the owner-scoped Drama Series row. Do not infer a tenant from a user's
-- current tenant because users may have changed tenant context over time.
UPDATE "credit_transactions" AS ct
SET "tenantId" = series."tenantId"
FROM "vertical_drama_series" AS series
WHERE ct."tenantId" IS NULL
  AND ct."userId" = series."userId"
  AND (
    ct."metadata"->>'seriesId' = series."id"::text
    OR ct."metadata"->>'series_id' = series."id"::text
  );
--> statement-breakpoint

-- Restore refund reversal links only when the refund points to one valid,
-- same-user usage transaction and there is no competing refund candidate.
UPDATE "credit_transactions" AS refund
SET
  "reversalOfTransactionId" = original."id",
  "tenantId" = COALESCE(refund."tenantId", original."tenantId")
FROM "credit_transactions" AS original
WHERE refund."type" = 'refund'
  AND refund."amount" > 0
  AND refund."reversalOfTransactionId" IS NULL
  AND (refund."metadata"->>'originalTransactionId') ~ '^[0-9]+$'
  AND original."id" = (refund."metadata"->>'originalTransactionId')::integer
  AND original."type" = 'usage'
  AND original."amount" < 0
  AND refund."userId" = original."userId"
  AND NOT EXISTS (
    SELECT 1
    FROM "credit_transactions" AS competing
    WHERE competing."id" <> refund."id"
      AND competing."type" = 'refund'
      AND competing."reversalOfTransactionId" IS NULL
      AND competing."metadata"->>'originalTransactionId' = refund."metadata"->>'originalTransactionId'
  );
--> statement-breakpoint

-- Only use the verified original tenant for a refund whose usage row was
-- safely attributed above. Legacy refunds without that evidence remain
-- explicitly unattributed for later operator review.
UPDATE "credit_transactions" AS refund
SET "tenantId" = original."tenantId"
FROM "credit_transactions" AS original
WHERE refund."reversalOfTransactionId" = original."id"
  AND refund."tenantId" IS NULL
  AND original."tenantId" IS NOT NULL;
