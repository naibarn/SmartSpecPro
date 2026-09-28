-- Add candidate ordering index for bounded heartbeat retention cleanup.
CREATE INDEX IF NOT EXISTS "worker_heartbeats_created_at_idx"
  ON "worker_heartbeats" ("createdAt");
