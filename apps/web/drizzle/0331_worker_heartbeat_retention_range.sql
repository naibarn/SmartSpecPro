-- Support latest-heartbeat exclusion with an indexable worker/time/id range.
CREATE INDEX IF NOT EXISTS "worker_heartbeats_worker_created_id_idx"
  ON "worker_heartbeats" ("workerId", "createdAt", "id");
