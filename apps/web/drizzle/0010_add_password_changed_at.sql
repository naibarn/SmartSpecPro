-- Add passwordChangedAt column for session invalidation after password reset
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP WITH TIME ZONE;
