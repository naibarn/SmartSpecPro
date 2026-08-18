ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "freeCreditGrantedAt" timestamptz;
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "freeCreditPolicyCancelledAt" timestamptz;
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "freeCreditNoticeSentAt" timestamptz;

CREATE INDEX IF NOT EXISTS "users_free_credit_policy_idx"
  ON "users" ("freeCreditGrantedAt", "freeCreditPolicyCancelledAt", "isDisabled");

-- Backfill only evidence-backed free grants. Legacy direct balance writes with
-- no ledger/provenance remain untouched rather than being auto-disabled.
WITH free_grants AS (
  SELECT
    "userId",
    MIN("createdAt") AS "grantedAt"
  FROM "credit_transactions"
  WHERE "amount" > 0
    AND "type" = 'bonus'
    AND (
      "metadata" ->> 'reason' = 'signup'
      OR "metadata" ? 'inviteCodeId'
    )
  GROUP BY "userId"
)
UPDATE "users" AS u
SET "freeCreditGrantedAt" = fg."grantedAt"
FROM free_grants AS fg
WHERE u."id" = fg."userId"
  AND u."freeCreditGrantedAt" IS NULL;

-- Invite-linked users with a positive configured new-user bonus are also
-- evidence-backed even when an older bonus ledger row was not recorded.
UPDATE "users" AS u
SET "freeCreditGrantedAt" = COALESCE(u."freeCreditGrantedAt", u."createdAt")
FROM "invite_codes" AS ic
WHERE u."referredByInviteCodeId" = ic."id"
  AND ic."bonusCreditsForNewUser" > 0
  AND u."freeCreditGrantedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "credit_transactions" AS ct
    WHERE ct."userId" = u."id"
      AND ct."type" = 'purchase'
  );

WITH purchases AS (
  SELECT
    "userId",
    MIN("createdAt") AS "purchasedAt"
  FROM "credit_transactions"
  WHERE "type" = 'purchase'
  GROUP BY "userId"
)
UPDATE "users" AS u
SET "freeCreditPolicyCancelledAt" = p."purchasedAt"
FROM purchases AS p
WHERE u."id" = p."userId"
  AND u."freeCreditPolicyCancelledAt" IS NULL;
