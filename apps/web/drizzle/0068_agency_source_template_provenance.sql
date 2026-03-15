ALTER TABLE "agencies" ADD COLUMN "sourceTemplateId" varchar(36);
--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_sourceTemplateId_agency_templates_id_fk" FOREIGN KEY ("sourceTemplateId") REFERENCES "public"."agency_templates"("id") ON DELETE set null ON UPDATE no action;
