-- Keep normal Sub-episode numbers independent from Special Tie-in numbers.
--
-- Existing special rows created before the allocator fix may have consumed a
-- normal number (for example series 53 had SPECIAL 04 at episodeNumber 51).
-- Move only those legacy special rows into the 501+ namespace. The operation
-- is transactional and idempotent; normal rows and specialSequence values are
-- never changed.

BEGIN;

CREATE TEMP TABLE "vd_special_episode_number_repair" ON COMMIT DROP AS
SELECT
  "id",
  "tenantId",
  "seriesId",
  "specialSequence"
FROM "vertical_drama_episodes"
WHERE "episodeKind" = 'special_tie_in'
  AND "episodeNumber" < 501;

-- Free the old numbers before assigning the new namespace. Temporary negative
-- values are unique per row in this transaction and are never committed.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "id") AS "temporaryNumber"
  FROM "vd_special_episode_number_repair"
)
UPDATE "vertical_drama_episodes" AS episode
SET "episodeNumber" = -(numbered."temporaryNumber")::integer
FROM numbered
WHERE episode."id" = numbered."id";

DO $$
DECLARE
  special_row RECORD;
  candidate INTEGER;
BEGIN
  FOR special_row IN
    SELECT "id", "tenantId", "seriesId"
    FROM "vd_special_episode_number_repair"
    ORDER BY "tenantId", "seriesId", "specialSequence" NULLS LAST, "id"
  LOOP
    candidate := 501;
    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "vertical_drama_episodes" AS occupied
        WHERE occupied."tenantId" = special_row."tenantId"
          AND occupied."seriesId" = special_row."seriesId"
          AND occupied."episodeNumber" = candidate
      );
      candidate := candidate + 1;
    END LOOP;

    UPDATE "vertical_drama_episodes"
    SET "episodeNumber" = candidate,
        "updatedAt" = NOW()
    WHERE "id" = special_row."id";
  END LOOP;
END $$;

COMMIT;
