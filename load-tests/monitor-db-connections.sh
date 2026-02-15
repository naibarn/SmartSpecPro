#!/bin/bash
set -e

DB_URL="${NEON_STAGING_DB_URL:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "Error: Set NEON_STAGING_DB_URL or DATABASE_URL environment variable"
  exit 1
fi

echo "Monitoring database connections (Ctrl+C to stop)..."
echo ""

while true; do
  psql "$DB_URL" -c "
    SELECT
      now() as timestamp,
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle,
      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
    FROM pg_stat_activity
    WHERE datname = current_database();
  " || echo "Warning: Failed to query database"
  sleep 10
done
