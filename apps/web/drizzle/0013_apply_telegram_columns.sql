-- Manual application of 0013 migration (Telegram columns + fixes)
-- This script uses IF NOT EXISTS to avoid errors if columns already exist

-- Create enum type if not exists (for priority columns)
DO $$ BEGIN
  CREATE TYPE reminder_priority AS ENUM('low', 'normal', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add columns to scheduled_messages if they don't exist
DO $$ BEGIN
  ALTER TABLE scheduled_messages ADD COLUMN "isSimpleReminder" boolean DEFAULT false NOT NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE scheduled_messages ADD COLUMN "priority" reminder_priority DEFAULT 'normal' NOT NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add priority column to user_notifications if it doesn't exist
DO $$ BEGIN
  ALTER TABLE user_notifications ADD COLUMN "priority" reminder_priority DEFAULT 'normal' NOT NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add Telegram columns to users table
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN "telegramChatId" varchar(64);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN "telegramUsername" varchar(64);
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN "telegramVerified" boolean DEFAULT false NOT NULL;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE users ADD COLUMN "telegramVerifiedAt" timestamp with time zone;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Add passwordChangedAt column to users table (fix drift)
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN "passwordChangedAt" timestamp with time zone;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS scheduled_message_logs_schedule_id ON scheduled_message_logs USING btree ("scheduledMessageId","executedAt");
CREATE INDEX IF NOT EXISTS scheduled_messages_user_status ON scheduled_messages USING btree ("userId","status");
CREATE INDEX IF NOT EXISTS scheduled_messages_user_created ON scheduled_messages USING btree ("userId","createdAt");
CREATE INDEX IF NOT EXISTS scheduled_messages_status ON scheduled_messages USING btree ("status");
CREATE INDEX IF NOT EXISTS user_notifications_user_read ON user_notifications USING btree ("userId","isRead","createdAt");
CREATE INDEX IF NOT EXISTS user_notifications_user_priority ON user_notifications USING btree ("userId","isRead","priority");
