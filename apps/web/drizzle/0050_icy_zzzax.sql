ALTER TABLE "agencies" ADD COLUMN "requestedPublishAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "approvedBy" integer;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "approvedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "rejectionReason" text;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_approvedBy_users_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;