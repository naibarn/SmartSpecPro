ALTER TABLE "skill_maintenance_schedules"
  ADD COLUMN IF NOT EXISTS "runningAt" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "skill_maintenance_schedules"
  ADD COLUMN IF NOT EXISTS "lockToken" varchar(80);
--> statement-breakpoint
ALTER TABLE "skill_maintenance_schedules"
  ADD COLUMN IF NOT EXISTS "lockExpiresAt" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_maintenance_schedules_lock_expiry_idx"
  ON "skill_maintenance_schedules" USING btree ("status", "lockExpiresAt");
