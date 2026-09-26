CREATE TABLE IF NOT EXISTS "revoked_token_jtis" (
  "jti_hash" varchar(64) PRIMARY KEY,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revoked_token_jtis_expires_at_idx"
  ON "revoked_token_jtis" ("expires_at");
