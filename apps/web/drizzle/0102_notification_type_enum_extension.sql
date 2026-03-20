-- This migration MUST run outside a transaction.
-- drizzle-kit cannot generate ALTER TYPE ADD VALUE; applied manually.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'direct_message';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'urgent_message';
