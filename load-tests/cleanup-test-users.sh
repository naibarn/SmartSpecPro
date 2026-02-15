#!/bin/bash
set -e

DB_URL="${NEON_STAGING_DB_URL:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "Error: Set NEON_STAGING_DB_URL or DATABASE_URL environment variable"
  exit 1
fi

echo "Cleaning up load test users..."

# Count users to be deleted
USER_COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM users WHERE email LIKE 'loadtest-user-%@example.com';")
echo "Found $USER_COUNT load test users to clean up"

if [ "$USER_COUNT" -eq 0 ]; then
  echo "No test users to clean up"
  exit 0
fi

# Delete in dependency order to respect foreign keys.
# Tables with ON DELETE CASCADE are handled automatically when users are deleted.
# Tables WITHOUT cascade need explicit deletion first.
psql "$DB_URL" <<'EOF'
BEGIN;

-- Tables without ON DELETE CASCADE (must delete explicitly)
DELETE FROM credit_transactions WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
);

DELETE FROM provider_usage_log WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
);

DELETE FROM workflow_executions WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
);

-- Nullable FK columns: set to NULL instead of deleting rows
UPDATE api_audit_events SET "userId" = NULL WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
);

UPDATE registration_events SET "userId" = NULL WHERE "userId" IN (
  SELECT id FROM users WHERE email LIKE 'loadtest-user-%@example.com'
);

-- Delete users (all ON DELETE CASCADE tables are auto-cleaned:
-- conversations, messages, entity_memories, skill_preferences,
-- library_items, scheduled_messages, user_follows, user_notifications,
-- direct_messages, device_fingerprints, video_editor_projects,
-- email_verification_tokens, skill_likes, skill_comments, etc.)
DELETE FROM users WHERE email LIKE 'loadtest-user-%@example.com';

COMMIT;
EOF

echo "Test users cleaned up successfully"
