-- Migration 051: Stop legacy team runs that used the old Python-bridge pipeline.
-- These runs cannot continue under the new Node.js-only pipeline.
-- Time-bound guard (MED-1): only stop runs started more than 5 minutes ago
-- to avoid stopping newly created runs during staggered deployment.
UPDATE team_runs
SET status = 'stopped',
    "stopReason" = 'system_migration_051',
    "endedAt" = NOW()
WHERE status IN ('running', 'paused')
  AND "startedAt" < NOW() - INTERVAL '5 minutes';
