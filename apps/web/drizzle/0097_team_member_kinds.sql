CREATE TYPE "public"."team_member_kind" AS ENUM('assistant', 'human', 'external_connector');
--> statement-breakpoint
ALTER TABLE "assistant_profiles"
  ADD COLUMN "memberKind" "team_member_kind" DEFAULT 'assistant' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_profiles"
  ALTER COLUMN "agencyAgentId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_profiles"
  ADD COLUMN "humanUserId" integer;
--> statement-breakpoint
ALTER TABLE "assistant_profiles"
  ADD COLUMN "externalRef" varchar(255);
--> statement-breakpoint
ALTER TABLE "assistant_profiles"
  ADD COLUMN "externalConfigJson" jsonb;
--> statement-breakpoint
ALTER TABLE "assistant_profiles"
  ADD CONSTRAINT "assistant_profiles_humanUserId_users_id_fk"
  FOREIGN KEY ("humanUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assistant_profiles_member_kind_idx"
  ON "assistant_profiles" USING btree ("teamId", "memberKind");
--> statement-breakpoint
CREATE INDEX "assistant_profiles_human_user_idx"
  ON "assistant_profiles" USING btree ("humanUserId");
