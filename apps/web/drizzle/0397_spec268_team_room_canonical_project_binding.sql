ALTER TABLE "team_rooms" ADD COLUMN "canonicalProjectId" varchar(36);--> statement-breakpoint
ALTER TABLE "team_rooms" ADD CONSTRAINT "team_rooms_canonical_project_fk" FOREIGN KEY ("tenantId","canonicalProjectId") REFERENCES "public"."canonical_projects"("tenant_id","project_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_rooms_canonical_project_idx" ON "team_rooms" USING btree ("tenantId","canonicalProjectId") WHERE "canonicalProjectId" IS NOT NULL;
