CREATE TYPE "public"."reminder_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "priority" "public"."reminder_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "priority" "public"."reminder_priority" DEFAULT 'normal' NOT NULL;
