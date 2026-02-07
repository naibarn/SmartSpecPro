CREATE TYPE "public"."reminder_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "isSimpleReminder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "priority" "reminder_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "priority" "reminder_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegramChatId" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegramUsername" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegramVerified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegramVerifiedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "scheduled_message_logs_schedule_id" ON "scheduled_message_logs" USING btree ("scheduledMessageId","executedAt");--> statement-breakpoint
CREATE INDEX "scheduled_messages_user_status" ON "scheduled_messages" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "scheduled_messages_user_created" ON "scheduled_messages" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "scheduled_messages_status" ON "scheduled_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_notifications_user_read" ON "user_notifications" USING btree ("userId","isRead","createdAt");--> statement-breakpoint
CREATE INDEX "user_notifications_user_priority" ON "user_notifications" USING btree ("userId","isRead","priority");