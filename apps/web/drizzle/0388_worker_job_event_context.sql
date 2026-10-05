ALTER TABLE "worker_job_events"
  ADD COLUMN IF NOT EXISTS "workerJobAttempt" integer,
  ADD COLUMN IF NOT EXISTS "leaseFencingVersion" bigint;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.populate_worker_job_event_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."workerJobAttempt" IS NULL OR NEW."leaseFencingVersion" IS NULL THEN
    SELECT
      COALESCE(NEW."workerJobAttempt", jobs."attempt"),
      COALESCE(NEW."leaseFencingVersion", jobs."fencingVersion")
    INTO NEW."workerJobAttempt", NEW."leaseFencingVersion"
    FROM public.worker_jobs AS jobs
    WHERE jobs.id = NEW."workerJobId";
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS worker_job_events_context_before_insert ON "worker_job_events";
--> statement-breakpoint
CREATE TRIGGER worker_job_events_context_before_insert
  BEFORE INSERT ON "worker_job_events"
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_worker_job_event_context();
