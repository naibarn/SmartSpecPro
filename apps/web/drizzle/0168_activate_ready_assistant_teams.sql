ALTER TABLE "assistant_teams"
  ALTER COLUMN "status" SET DEFAULT 'active';

UPDATE "assistant_teams" AS team
SET "status" = 'active',
    "updatedAt" = now()
WHERE team."status" = 'draft'
  AND (
    SELECT count(*)
    FROM "assistant_profiles" AS profile
    WHERE profile."teamId" = team."id"
      AND profile."memberKind" = 'assistant'
      AND profile."isLead" IS TRUE
      AND profile."isActive" IS TRUE
  ) = 1;
