-- Vertical Drama Character Aliases — canonical identity resolution table
-- (planning/vd-character-identity-repair/plan.md, Phase 2.2). Brand-new
-- table, additive, CREATE TABLE IF NOT EXISTS. Hand-authored from
-- drizzle/schema.ts because drizzle-kit generate is blocked by the same
-- pre-existing meta-journal collision (0146/0147) documented for the prior
-- vertical-drama migrations (manual_vertical_drama_131.sql,
-- manual_vertical_drama_character_narrative_role.sql,
-- manual_vertical_drama_character_variant_columns.sql,
-- manual_vertical_drama_character_voice_config.sql).
--
-- Purpose: each row records one spelling/short-form/romanization/nickname
-- (`alias`) that resolves to exactly one `vertical_drama_characters` row
-- within a series (e.g. "คิริน", "Kirin", "คีริน" all resolving to the same
-- "คิริน วัฒนเมธา" row). `normalizedAlias` is written by the app in the
-- `normalizeStoryCharacterName()` form
-- (server/services/verticalDramaCharacterRosterAutoRegister.ts:
-- `.trim().toLowerCase().replace(/\s+/g," ")`) — this table does not
-- reimplement that normalizer.
--
-- UNIQUE ("seriesId","normalizedAlias") is the DB-level guarantee that one
-- spelling resolves to exactly one character — the guard
-- ("seriesId","characterKey") was never able to provide for Thai names,
-- because `slugifyForCharacterKey` strips all non-[a-z0-9] characters and
-- every Thai name collapses to the same "character" fallback.
--
-- Risk classification (root CLAUDE.md Database Safety Protocol): CREATE
-- TABLE (brand-new, no existing data) = cannot lose data. Row counts on
-- vertical_drama_characters/vertical_drama_series/vertical_drama_episodes
-- verified unchanged immediately before/after applying this file
-- (baseline: characters=76, series=10, episodes=106 — captured
-- .db-backups/vertical_drama_{characters,series,episodes}_20260717_135244.sql).
BEGIN;

CREATE TABLE IF NOT EXISTS vertical_drama_character_aliases (
  id bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "seriesId" bigint NOT NULL REFERENCES vertical_drama_series(id) ON DELETE CASCADE,
  "characterId" bigint NOT NULL REFERENCES vertical_drama_characters(id) ON DELETE CASCADE,
  alias varchar(255) NOT NULL,
  "normalizedAlias" varchar(255) NOT NULL,
  source varchar(24) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vds_character_alias_unique
  ON vertical_drama_character_aliases ("seriesId", "normalizedAlias");

CREATE INDEX IF NOT EXISTS vds_character_alias_lookup_idx
  ON vertical_drama_character_aliases ("tenantId", "seriesId", "characterId");

COMMIT;
