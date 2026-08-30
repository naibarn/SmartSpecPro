-- Promote legacy Series rows whose bible already contains a generated story.
-- This is intentionally narrow and reversible: only rows still marked draft
-- and carrying a non-empty mainPlot plus narrative structure are changed.
-- Planning shells, premise-only rows, active production, and archived rows
-- remain untouched.
UPDATE "vertical_drama_series"
SET
  "status" = 'story_ready',
  "updatedAt" = NOW()
WHERE "status" = 'draft'
  AND jsonb_typeof("bible") = 'object'
  AND NULLIF(BTRIM("bible" ->> 'mainPlot'), '') IS NOT NULL
  AND (
    NULLIF(BTRIM("bible" ->> 'logline'), '') IS NOT NULL
    OR NULLIF(BTRIM("bible" ->> 'seasonArc'), '') IS NOT NULL
    OR NULLIF(BTRIM("bible" ->> 'expandedSeasonArc'), '') IS NOT NULL
    OR jsonb_typeof("bible" -> 'storyContract') = 'object'
    OR jsonb_typeof("bible" -> 'storyDesign') = 'object'
    OR (
      jsonb_typeof("bible" -> 'episodeBreakdown') = 'array'
      AND jsonb_array_length("bible" -> 'episodeBreakdown') > 0
    )
  );
