ALTER TABLE "runner_nodes"
  ADD COLUMN IF NOT EXISTS "activeSessionId" varchar(160);

CREATE INDEX IF NOT EXISTS "runner_nodes_active_session_idx"
  ON "runner_nodes" ("tenantId", "runnerId", "activeSessionId");
