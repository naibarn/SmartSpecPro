-- Protection jobs are executed by the native Worker App. Older queued rows
-- were created with the default Node runtime before the routing boundary was
-- corrected; move only non-terminal rows so they can be claimed by a worker
-- advertising content-protection-v1. Terminal rows are recovered explicitly
-- by the audited retry path, which also applies this runtime correction.
UPDATE "worker_jobs"
SET "runtimeType" = 'desktop_zeroclaw_managed'
WHERE "jobType" = 'content_protection.protect'
  AND "runtimeType" = 'node_job_worker'
  AND "status" IN ('pending', 'queued', 'retry_scheduled');
