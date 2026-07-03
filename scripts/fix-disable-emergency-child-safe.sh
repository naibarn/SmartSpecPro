#!/usr/bin/env bash
# Disable F128G ageSafetyEmergencyChildSafeMode for tenant-ZCSKEM9s.
# This emergency kill-switch forces child-safe enforcement for ALL users
# (even adults). Default is false; it was left ON. Backup already taken at
# .db-backups/tenant-ZCSKEM9s_featureFlags_20260703_185523.json
set -euo pipefail
cd "$(dirname "$0")/.."

DBURL=$(grep -m1 '^DATABASE_URL=' apps/web/.env | cut -d= -f2- | tr -d '"')
TENANT="tenant-ZCSKEM9s"
TS=$(date +%Y%m%d_%H%M%S)

echo "== Fresh backup =="
psql "$DBURL" -A -t -c "SELECT \"featureFlags\"::text FROM tenants WHERE id='${TENANT}';" \
  > ".db-backups/${TENANT}_featureFlags_${TS}.json"
echo "backup: .db-backups/${TENANT}_featureFlags_${TS}.json ($(wc -c < ".db-backups/${TENANT}_featureFlags_${TS}.json") bytes)"

echo "== BEFORE =="
psql "$DBURL" -A -t -c "SELECT \"featureFlags\"->>'ageSafetyEmergencyChildSafeMode' FROM tenants WHERE id='${TENANT}';"

echo "== UPDATE (flip only the one key) =="
psql "$DBURL" -c "UPDATE tenants SET \"featureFlags\" = ((\"featureFlags\"::jsonb) || '{\"ageSafetyEmergencyChildSafeMode\": false}'::jsonb)::json WHERE id='${TENANT}';"

echo "== AFTER (expect emergency=false, policy/media unchanged) =="
psql "$DBURL" -A -F$'\t' -c "SELECT id, \"featureFlags\"->>'ageSafetyEmergencyChildSafeMode' AS emergency, \"featureFlags\"->>'ageSafetyPolicyEnabled' AS policy, \"featureFlags\"->>'ageSafetyMediaEnforcement' AS media FROM tenants WHERE id='${TENANT}';"

echo "Done. No restart needed — tenant flags are read live from the DB."
