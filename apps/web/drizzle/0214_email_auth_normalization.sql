-- Normalize only email-bearing auth records. The email_verification_tokens.email
-- column also stores phone numbers for SMS channels and must not be lowercased.
DO $$
BEGIN
  IF EXISTS (
    SELECT lower(btrim("email"))
    FROM "users"
    WHERE "email" IS NOT NULL
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize auth emails: duplicate logical primary emails exist';
  END IF;
END $$;

UPDATE "users"
SET "email" = lower(btrim("email"))
WHERE "email" IS NOT NULL
  AND "email" <> lower(btrim("email"));

UPDATE "users"
SET "backupEmail" = lower(btrim("backupEmail"))
WHERE "backupEmail" IS NOT NULL
  AND "backupEmail" <> lower(btrim("backupEmail"));

UPDATE "email_verification_tokens"
SET "email" = lower(btrim("email"))
WHERE "email" IS NOT NULL
  AND "channel" IN (
    'email',
    'backup_email',
    'reset_email',
    'reset_backup',
    'disable_2fa_email'
  )
  AND "email" <> lower(btrim("email"));

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_trim_unique"
  ON "users" (lower(btrim("email")))
  WHERE "email" IS NOT NULL;
