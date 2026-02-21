CREATE TYPE "public"."skill_visibility" AS ENUM('private', 'pending_approval', 'public', 'rejected');--> statement-breakpoint
CREATE TABLE "skill_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"skillId" integer NOT NULL,
	"groupId" integer NOT NULL,
	"grantedByUserId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "tenantId" varchar(36);--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "visibility" "skill_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "approvedBy" integer;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "approvedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "rejectionReason" text;--> statement-breakpoint
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_skillId_skills_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_groupId_user_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_permissions" ADD CONSTRAINT "skill_permissions_grantedByUserId_users_id_fk" FOREIGN KEY ("grantedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skill_permissions_unique" ON "skill_permissions" USING btree ("skillId","groupId");--> statement-breakpoint
CREATE INDEX "skill_permissions_group_idx" ON "skill_permissions" USING btree ("groupId");--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;