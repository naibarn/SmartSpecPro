-- Vertical Drama Series — series-level LLM MODEL POLICY column (manual LLM
-- model override for the "generate start-frame render plan" / "generate
-- storyboard" pipeline stages, added 2026-07-11 — see
-- /home/dev/.claude/plans/polished-toasting-gadget.md). Additive, nullable
-- JSONB column, IF NOT EXISTS guarded. Hand-authored from drizzle/schema.ts
-- because drizzle-kit generate is blocked by the same pre-existing
-- meta-journal collision (0146/0147) documented for the prior vertical-drama
-- migrations (manual_vertical_drama_131.sql,
-- manual_vertical_drama_genre_presets.sql,
-- manual_vertical_drama_genre_preset_ownership.sql,
-- manual_vertical_drama_series_trailer.sql,
-- manual_vertical_drama_character_voice_config.sql,
-- manual_vertical_drama_episode_ad_banner_plan.sql,
-- manual_vertical_drama_series_share_links.sql,
-- manual_vertical_drama_series_watermark.sql,
-- manual_vertical_drama_episode_text_overlay_plan.sql). Zero data-loss:
-- nullable ADD COLUMN, existing rows get llmModelPolicy = NULL (server
-- treats NULL/absent field as "automatic" — the stage's own quality/
-- large-context model selector picks the model).
--
-- Stores `VerticalDramaSeriesLlmModelPolicy`
-- (`@shared/verticalDramaSeries/contracts.ts`): optional
-- startFramePlanModelId / storyboardModelId string model ids. Read/written
-- via `setSeriesLlmModelPolicy` / `listQualityPlanningModels`
-- (server/routers/verticalDramaSeries.ts) and resolved via
-- `resolveStartFramePlanModel` / `resolveStoryboardModel`
-- (server/services/verticalDramaImproveScript.ts).
--
-- Risk classification (root CLAUDE.md Database Safety Protocol): ADD COLUMN
-- (nullable) = Low risk, row-count check only, no backup required (no
-- existing data affected). Row count on vertical_drama_series verified
-- unchanged immediately before/after applying this file (5 rows).
BEGIN;

ALTER TABLE vertical_drama_series
  ADD COLUMN IF NOT EXISTS "llmModelPolicy" jsonb;

COMMIT;
