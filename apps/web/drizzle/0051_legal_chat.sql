ALTER TYPE "public"."template_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "requestedPublishAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "requestedPublishAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "approvedBy" integer;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "approvedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "rejectionReason" text;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;