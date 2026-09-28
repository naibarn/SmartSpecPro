-- Series-owned Draft/QC integrity. Expand-only and data-preserving.
ALTER TABLE "vertical_drama_draft_ledgers"
  ADD COLUMN IF NOT EXISTS "seriesDeletedAt" timestamp with time zone;
--> statement-breakpoint

-- Preserve source packs and their source assets when a Series is deleted.
DO $$
DECLARE
  fk_name text;
BEGIN
  FOR fk_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE t.relname = 'vertical_drama_source_packs'
      AND c.contype = 'f'
      AND a.attname = 'seriesId'
  LOOP
    EXECUTE format(
      'ALTER TABLE "vertical_drama_source_packs" DROP CONSTRAINT %I',
      fk_name
    );
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "vertical_drama_source_packs"
  ADD CONSTRAINT "vertical_drama_source_packs_seriesId_vertical_drama_series_id_fk"
  FOREIGN KEY ("seriesId") REFERENCES "vertical_drama_series"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vdd_ledger_owner_series_delete_idx"
  ON "vertical_drama_draft_ledgers" ("tenantId", "userId", "seriesId", "seriesDeletedAt");
--> statement-breakpoint

-- A legacy retry could have created multiple active ledgers for one Series.
-- Keep the newest ledger as the active owner and archive the older shells;
-- this preserves every immutable version/QC row while making the invariant
-- enforceable on both fresh and already-used databases.
WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "seriesId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
    ) AS row_number
  FROM "vertical_drama_draft_ledgers"
  WHERE "seriesId" IS NOT NULL
    AND "seriesDeletedAt" IS NULL
    AND "archivedAt" IS NULL
)
UPDATE "vertical_drama_draft_ledgers" AS d
SET
  "jobStatus" = 'archived',
  "archivedAt" = NOW(),
  "lastError" = CASE
    WHEN "lastError" IS NULL THEN 'Archived duplicate Series Draft ledger; immutable Draft/QC history preserved'
    ELSE LEFT("lastError" || ' | Archived duplicate Series Draft ledger; immutable Draft/QC history preserved', 10000)
  END,
  "updatedAt" = NOW()
FROM ranked_duplicates r
WHERE d.id = r.id
  AND r.row_number > 1;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "vertical_drama_draft_ledgers"
    WHERE "seriesId" IS NOT NULL
      AND "seriesDeletedAt" IS NULL
      AND "archivedAt" IS NULL
    GROUP BY "seriesId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create vdd_active_series_unique: active duplicate Draft ledgers exist; audit before applying 0253';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vdd_active_series_unique"
  ON "vertical_drama_draft_ledgers" ("seriesId")
  WHERE "seriesId" IS NOT NULL
    AND "seriesDeletedAt" IS NULL
    AND "archivedAt" IS NULL;
