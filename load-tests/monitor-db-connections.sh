#!/bin/bash
set -euo pipefail

DB_URL="${NEON_STAGING_DB_URL:-$DATABASE_URL}"

if [[ -z "$DB_URL" ]]; then
  echo "Error: Set NEON_STAGING_DB_URL or DATABASE_URL environment variable"
  exit 1
fi

if [[ ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "Error: Invalid database URL format (must start with postgres:// or postgresql://)"
  exit 1
fi

echo "Monitoring database connections (Ctrl+C to stop)..."
echo ""

FAILURE_COUNT=0
while true; do
  if psql "$DB_URL" -c "
    SELECT
      now() as timestamp,
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle,
      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
    FROM pg_stat_activity
    WHERE datname = current_database();
  "; then
    FAILURE_COUNT=0
  else
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    echo "Warning: Failed to query database (failure count: $FAILURE_COUNT)"
    if [[ $FAILURE_COUNT -ge 5 ]]; then
      echo "Error: Too many consecutive failures. Exiting."
      exit 1
    fi
  fi
  sleep 10
done
