CREATE TABLE "notification_occurrences" (
	"id" serial PRIMARY KEY NOT NULL,
	"notificationId" integer NOT NULL,
	"content" text,
	"metadata" jsonb,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "groupKey" varchar(200);--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "occurrenceCount" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "firstOccurredAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "lastOccurredAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_occurrences" ADD CONSTRAINT "notification_occurrences_notificationId_user_notifications_id_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."user_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notif_occurrences_notif_time" ON "notification_occurrences" USING btree ("notificationId","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_notif_dedup_active" ON "user_notifications" USING btree ("userId","groupKey") WHERE "isDismissed" = false AND "groupKey" IS NOT NULL;