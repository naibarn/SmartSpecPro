-- Feature 186: make the daily capacity schedule durable across process
-- restarts. The domain row remains authoritative for the assessment itself;
-- this key only prevents duplicate scheduled domain runs.
ALTER TABLE "capacity_assessments"
  ADD COLUMN IF NOT EXISTS "scheduledOccurrenceKey" varchar(200);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "capacity_assessments_scheduled_occurrence_unique"
  ON "capacity_assessments" ("scheduledOccurrenceKey")
  WHERE "scheduledOccurrenceKey" IS NOT NULL;
