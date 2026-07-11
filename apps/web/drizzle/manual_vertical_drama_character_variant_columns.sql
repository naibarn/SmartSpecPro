-- Vertical Drama Characters — character variant/twin relationship columns
-- (planning/vertical-drama-character-variants/plan.md, Phase A), added
-- 2026-07-11. Additive, nullable columns, IF NOT EXISTS guarded.
-- Hand-authored from drizzle/schema.ts because drizzle-kit generate is
-- blocked by the same pre-existing meta-journal collision (0146/0147)
-- documented for the prior vertical-drama migrations
-- (manual_vertical_drama_131.sql, manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql,
-- manual_vertical_drama_episode_ad_banner_plan.sql,
-- manual_vertical_drama_series_share_links.sql,
-- manual_vertical_drama_series_watermark.sql,
-- manual_vertical_drama_episode_text_overlay_plan.sql,
-- manual_vertical_drama_series_llm_model_policy.sql). Zero data-loss:
-- nullable ADD COLUMN, existing rows get all four new columns = NULL
-- (meaning "standalone character, not a variant or twin").
--
-- Columns support 3 relationships (see doc comment on
-- `verticalDramaCharacters` in drizzle/schema.ts for full detail):
-- - parentCharacterId + variantLabel + variantType — this row is a variant
--   of another character row (same person): variantType "outfit" = same
--   age/face, different look; "age_stage" = same identity, different
--   life-stage appearance (loose face reference, not locked).
-- - sharesFaceWithCharacterId — this row is a DIFFERENT person (e.g. a
--   twin) whose face reference should be resolved from another character
--   row.
--
-- Risk classification (root CLAUDE.md Database Safety Protocol): ADD COLUMN
-- (nullable) = Low risk, row-count check only, no backup required (no
-- existing data affected). Row count on vertical_drama_characters verified
-- unchanged immediately before/after applying this file (30 rows).
BEGIN;

ALTER TABLE vertical_drama_characters
  ADD COLUMN IF NOT EXISTS "parentCharacterId" bigint
    REFERENCES vertical_drama_characters(id),
  ADD COLUMN IF NOT EXISTS "variantLabel" varchar(64),
  ADD COLUMN IF NOT EXISTS "variantType" varchar(16),
  ADD COLUMN IF NOT EXISTS "sharesFaceWithCharacterId" bigint
    REFERENCES vertical_drama_characters(id);

COMMIT;
