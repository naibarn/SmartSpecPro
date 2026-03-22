DO $$
BEGIN
  CREATE TYPE "public"."team_member_role" AS ENUM(
    'orchestrator',
    'researcher',
    'reviewer',
    'publisher',
    'specialist'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "assistant_profiles"
ADD COLUMN IF NOT EXISTS "memberRole" "team_member_role" DEFAULT 'specialist' NOT NULL;

CREATE INDEX IF NOT EXISTS "assistant_profiles_member_role_idx"
ON "assistant_profiles" ("teamId", "memberRole");
