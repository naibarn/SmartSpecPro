-- Close the pre-Series recovery loop without deleting Draft/QC history.
-- Only rows that cannot participate in the Series-first contract are archived.

-- Series shells created by the old automatic legacy recovery path are
-- deterministic: their planning state carries a legacyRecovery marker.
WITH legacy_series AS (
  SELECT id
  FROM "vertical_drama_series"
  WHERE status <> 'archived'
    AND title ~ '^กู้คืนงาน Draft #[0-9]+$'
    AND bible #> '{planningState,legacyRecovery}' IS NOT NULL
)
UPDATE "vertical_drama_draft_ledgers" AS d
SET
  "jobStatus" = 'archived',
  "archivedAt" = COALESCE("archivedAt", NOW()),
  "lastError" = CASE
    WHEN "lastError" IS NULL THEN 'Archived legacy recovery shell; immutable Draft/QC history preserved'
    ELSE LEFT("lastError" || ' | Archived legacy recovery shell; immutable Draft/QC history preserved', 10000)
  END,
  "updatedAt" = NOW()
FROM legacy_series s
WHERE d."seriesId" = s.id
  AND d."seriesDeletedAt" IS NULL
  AND d."archivedAt" IS NULL;
--> statement-breakpoint

WITH legacy_series AS (
  SELECT id
  FROM "vertical_drama_series"
  WHERE status <> 'archived'
    AND title ~ '^กู้คืนงาน Draft #[0-9]+$'
    AND bible #> '{planningState,legacyRecovery}' IS NOT NULL
)
UPDATE "vertical_drama_series" AS s
SET status = 'archived', "updatedAt" = NOW()
FROM legacy_series legacy
WHERE s.id = legacy.id;
--> statement-breakpoint

-- Remaining NULL-Series ledgers are legacy records with no authoritative
-- Series owner. Archive them rather than allowing a later compatibility call
-- to manufacture another Series. All immutable versions remain untouched and
-- can be inspected by an operator from the database if needed.
UPDATE "vertical_drama_draft_ledgers"
SET
  "jobStatus" = 'archived',
  "archivedAt" = NOW(),
  "lastError" = CASE
    WHEN "lastError" IS NULL THEN 'Archived unbound legacy Draft; immutable Draft/QC history preserved'
    ELSE LEFT("lastError" || ' | Archived unbound legacy Draft; immutable Draft/QC history preserved', 10000)
  END,
  "updatedAt" = NOW()
WHERE "seriesId" IS NULL
  AND "seriesDeletedAt" IS NULL
  AND "archivedAt" IS NULL;
