-- Vertical Drama Series — read-only share links (Collab-lite L1, task #32,
-- F131AA, planning/vertical-drama-share-links/plan.md) — brand-new table,
-- CREATE IF NOT EXISTS, zero data-loss (no existing table touched).
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is
-- blocked by the same pre-existing meta-journal collision (0146/0147)
-- documented for the prior vertical-drama migrations
-- (manual_vertical_drama_131.sql, manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql,
-- manual_vertical_drama_episode_ad_banner_plan.sql).
--
-- `tokenHash` stores ONLY a SHA-256 hex digest of the raw share token
-- (crypto.randomBytes(32) -> base64url) — the raw token itself is never
-- persisted anywhere, only returned once in the create-mutation response
-- (see server/services/verticalDramaShareLinks.ts). `seriesId` is `bigint`
-- (not `integer`) to match `vertical_drama_series.id`'s actual `bigserial`
-- column type — a plain `integer` FK would fail to create against a
-- `bigint` primary key.
BEGIN;

CREATE TABLE IF NOT EXISTS vertical_drama_series_share_links (
  id serial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "createdByUserId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tokenHash" varchar(64) NOT NULL,
  scope varchar(30) NOT NULL DEFAULT 'series_read',
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "lastAccessedAt" timestamptz,
  "accessCount" integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS vds_share_links_token_hash_unique
  ON vertical_drama_series_share_links ("tokenHash");

-- Owner-side listing/cap-counting (`WHERE seriesId = ? AND revokedAt IS NULL
-- AND expiresAt > now()`) — see `listSeriesShareLinks`/cap check in
-- server/services/verticalDramaShareLinks.ts.
CREATE INDEX IF NOT EXISTS vds_share_links_series_idx
  ON vertical_drama_series_share_links ("seriesId", "revokedAt", "expiresAt");

COMMIT;
