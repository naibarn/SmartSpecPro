DO $$
BEGIN
  CREATE TYPE "public"."team_member_kind" AS ENUM('assistant', 'human', 'external_connector');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."team_member_role" AS ENUM('orchestrator', 'researcher', 'reviewer', 'publisher', 'specialist');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "assistant_profiles"
  ADD COLUMN IF NOT EXISTS "memberKind" "team_member_kind" DEFAULT 'assistant' NOT NULL,
  ADD COLUMN IF NOT EXISTS "humanUserId" integer,
  ADD COLUMN IF NOT EXISTS "externalRef" varchar(255),
  ADD COLUMN IF NOT EXISTS "externalConfigJson" jsonb,
  ADD COLUMN IF NOT EXISTS "memberRole" "team_member_role" DEFAULT 'specialist' NOT NULL;

ALTER TABLE "assistant_profiles"
  ALTER COLUMN "agencyAgentId" DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assistant_profiles_humanUserId_users_id_fk'
  ) THEN
    ALTER TABLE "assistant_profiles"
      ADD CONSTRAINT "assistant_profiles_humanUserId_users_id_fk"
      FOREIGN KEY ("humanUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

ALTER TABLE "persona_templates"
  ADD COLUMN IF NOT EXISTS "provisionedByBlueprintId" varchar(120),
  ADD COLUMN IF NOT EXISTS "provisionedByBlueprintMemberId" varchar(120);

CREATE INDEX IF NOT EXISTS "persona_templates_blueprint_origin_idx"
  ON "persona_templates" ("provisionedByBlueprintId", "provisionedByBlueprintMemberId");

CREATE INDEX IF NOT EXISTS "assistant_profiles_member_kind_idx"
  ON "assistant_profiles" ("teamId", "memberKind");

CREATE INDEX IF NOT EXISTS "assistant_profiles_member_role_idx"
  ON "assistant_profiles" ("teamId", "memberRole");

CREATE INDEX IF NOT EXISTS "assistant_profiles_human_user_idx"
  ON "assistant_profiles" ("humanUserId");

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_profiles_team_persona_unique"
  ON "assistant_profiles" ("teamId", "personaId")
  WHERE "personaId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_profiles_team_human_unique"
  ON "assistant_profiles" ("teamId", "humanUserId")
  WHERE "humanUserId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "assistant_profiles_team_external_ref_unique"
  ON "assistant_profiles" ("teamId", "externalRef")
  WHERE "externalRef" IS NOT NULL;
