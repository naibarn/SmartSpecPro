DO $$
BEGIN
  IF to_regtype('public.reminder_priority') IS NULL THEN
    CREATE TYPE "public"."reminder_priority" AS ENUM('low', 'normal', 'high', 'critical');
  ELSIF (
    SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
    FROM pg_enum
    WHERE enumtypid = 'public.reminder_priority'::regtype
  ) IS DISTINCT FROM ARRAY['low', 'normal', 'high', 'critical']::text[] THEN
    RAISE EXCEPTION 'Existing reminder_priority enum does not match the expected labels';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "isSimpleReminder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN IF NOT EXISTS "priority" "reminder_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN IF NOT EXISTS "priority" "reminder_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
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
