ALTER TABLE "user_notifications" ADD COLUMN "relatedResourceType" varchar(50);--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "relatedResourceId" varchar(200);--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "actionUrl" text;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "actionLabel" varchar(100);--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "isDismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "expiresAt" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "user_notifications_resource" ON "user_notifications" USING btree ("relatedResourceType","relatedResourceId");