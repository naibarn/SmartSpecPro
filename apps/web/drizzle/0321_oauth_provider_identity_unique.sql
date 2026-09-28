-- Existing oauth_connections data was checked for duplicate provider subjects
-- before this constraint was applied. This closes the concurrent-link race.
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_connections_provider_subject_unique"
  ON "oauth_connections" ("provider", "provider_user_id");
