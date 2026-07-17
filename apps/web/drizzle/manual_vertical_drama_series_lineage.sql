-- Vertical Drama Series — season/special-edition lineage columns
-- (planning/vd-series-memory-and-lineage/plan.md, Stage 2.1), added
-- 2026-07-17. Additive, nullable columns, IF NOT EXISTS guarded.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is
-- blocked by the same pre-existing meta-journal collision (0146/0147)
-- documented for the prior vertical-drama migrations
-- (manual_vertical_drama_131.sql, manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql,
-- manual_vertical_drama_character_variant_columns.sql,
-- manual_vertical_drama_character_narrative_role.sql,
-- manual_vertical_drama_episode_ad_banner_plan.sql,
-- manual_vertical_drama_series_share_links.sql,
-- manual_vertical_drama_series_watermark.sql,
-- manual_vertical_drama_episode_text_overlay_plan.sql,
-- manual_vertical_drama_series_llm_model_policy.sql,
-- manual_vertical_drama_locations.sql). Zero data-loss: nullable ADD
-- COLUMN, existing rows get all four new columns = NULL.
--
-- NULL semantics (deliberate — do NOT backfill a 'original' sentinel):
-- - createMode NULL     = an ORIGINAL series (every row that exists today).
--                         "Original mode is unchanged" is therefore a
--                         STRUCTURAL guarantee, not merely a tested one, and
--                         matches this table's convention for every prior
--                         additive column (trailer, watermark,
--                         llmModelPolicy, productionEpisodesManifest).
--                         Non-NULL values: 'sequel' | 'special_edition'.
-- - parentSeriesId NULL = not derived from another series.
-- - seasonNumber NULL   = not part of a numbered season lineage.
-- - lineage NULL        = no lineage payload (carry-over decisions the user
--                         approved, special-edition source config, and a
--                         parentTitle/parentEpisodeCount snapshot so a
--                         child's badge survives parent deletion).
--
-- ON DELETE SET NULL — a DELIBERATE divergence from the bare `REFERENCES`
-- used by manual_vertical_drama_character_variant_columns.sql. Deleting
-- season 1 must NOT cascade-delete season 2: the child degrades to an
-- orphan that still renders its badge from lineage->>'parentTitle'.
-- Cascade here would silently destroy an entire separate production.
--
-- Risk classification (root CLAUDE.md Database Safety Protocol): ADD COLUMN
-- (nullable) = Low risk, row-count check only, no backup required (no
-- existing data affected). Row count on vertical_drama_series verified
-- unchanged immediately before/after applying this file (10 rows).
--
-- DEPLOY ORDER — MANDATORY: apply this SQL BEFORE merging the matching
-- drizzle/schema.ts change. `loadOwnedSeries` and every other VD read use
-- Drizzle `.select()`, which emits the column list from the TS table
-- description — so a schema.ts that lands first makes Postgres reject EVERY
-- vertical-drama read immediately, in dev and prod alike.
BEGIN;

ALTER TABLE vertical_drama_series
  ADD COLUMN IF NOT EXISTS "parentSeriesId" bigint
    REFERENCES vertical_drama_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "createMode" varchar(24),
  ADD COLUMN IF NOT EXISTS "seasonNumber" integer,
  ADD COLUMN IF NOT EXISTS "lineage" jsonb;

-- Lists a parent's children ("ภาค 2 / ภาคพิเศษ ของเรื่องนี้") without a
-- sequential scan, and is tenant-scoped to match vds_series_list_idx's
-- leading column.
CREATE INDEX IF NOT EXISTS vds_series_parent_idx
  ON vertical_drama_series ("tenantId", "parentSeriesId");

COMMIT;
