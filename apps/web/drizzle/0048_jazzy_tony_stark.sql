CREATE TABLE "agency_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agencyId" varchar(36) NOT NULL,
	"groupId" integer NOT NULL,
	"grantedByUserId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "visibility" varchar(20) DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "agency_permissions" ADD CONSTRAINT "agency_permissions_agencyId_agencies_id_fk" FOREIGN KEY ("agencyId") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_permissions" ADD CONSTRAINT "agency_permissions_groupId_user_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_permissions" ADD CONSTRAINT "agency_permissions_grantedByUserId_users_id_fk" FOREIGN KEY ("grantedByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_permissions_unique" ON "agency_permissions" USING btree ("agencyId","groupId");--> statement-breakpoint
CREATE INDEX "agency_permissions_group_idx" ON "agency_permissions" USING btree ("groupId");--> statement-breakpoint
CREATE INDEX "agency_permissions_agency_idx" ON "agency_permissions" USING btree ("agencyId");