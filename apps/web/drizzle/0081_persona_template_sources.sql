ALTER TABLE "persona_templates" ADD COLUMN "sourceTemplateIds" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "sourceTemplateLabels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "persona_templates" ADD COLUMN "sourceTemplateCategories" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "persona_templates_source_template_ids_idx" ON "persona_templates" USING gin ("sourceTemplateIds");
