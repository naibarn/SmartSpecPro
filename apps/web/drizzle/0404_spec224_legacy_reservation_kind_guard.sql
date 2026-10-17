-- 0325 declared this column-level CHECK without an explicit name. PostgreSQL
-- named it reservationKind_check; 0403 replaced only the later kind_check
-- spelling, so historical databases still rejected every model_call row.
-- Keep 0403's expanded kind_check and remove only the superseded guard.
ALTER TABLE "worker_job_provider_reservations"
  DROP CONSTRAINT IF EXISTS "worker_job_provider_reservations_reservationKind_check";
