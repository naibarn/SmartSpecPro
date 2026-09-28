#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
web_root="$repo_root/apps/web"
pg_bin="${PG_BIN:-}"
if [[ -z "$pg_bin" ]]; then
  initdb_path="$(find /usr/lib/postgresql -mindepth 3 -maxdepth 3 -type f -name initdb -print 2>/dev/null | sort -V | tail -n 1)"
  if [[ -z "$initdb_path" ]]; then
    echo "PostgreSQL server binaries are required (initdb, pg_ctl and psql). Set PG_BIN to their directory." >&2
    exit 2
  fi
  pg_bin="$(dirname "$initdb_path")"
fi
for command_name in initdb pg_ctl psql; do
  if [[ ! -x "$pg_bin/$command_name" ]]; then
    echo "Missing executable: $pg_bin/$command_name" >&2
    exit 2
  fi
done

tmp_root="$(mktemp -d /tmp/spec231-inference-db.XXXXXX)"
data_dir="$tmp_root/data"
socket_dir="$tmp_root/socket"
mkdir "$socket_dir"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"

cleanup() {
  "$pg_bin/pg_ctl" -D "$data_dir" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$tmp_root"
}
trap cleanup EXIT

"$pg_bin/initdb" -D "$data_dir" --encoding=UTF8 --auth-local=trust --auth-host=reject --no-instructions >/dev/null
"$pg_bin/pg_ctl" -D "$data_dir" -o "-p $port -k $socket_dir -h ''" -l "$tmp_root/postgres.log" start >/dev/null

export PGHOST="$socket_dir"
export PGPORT="$port"
export PGUSER="$(id -un)"
export PGDATABASE=postgres
export DATABASE_URL=postgres:///

"$pg_bin/psql" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE tenants (id varchar(36) PRIMARY KEY);
CREATE TABLE users (id integer PRIMARY KEY);
CREATE TABLE conversations (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "tenantId" varchar(36),
  "messageCount" integer NOT NULL DEFAULT 0,
  "totalCreditsUsed" numeric(12,4) NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE messages (
  id serial PRIMARY KEY,
  "conversationId" integer NOT NULL,
  role varchar(16) NOT NULL,
  content text NOT NULL,
  "inputTokens" integer DEFAULT 0,
  "outputTokens" integer DEFAULT 0,
  "creditsUsed" numeric(10,4) DEFAULT 0,
  "modelUsed" varchar(100),
  attachments json DEFAULT '[]'::json,
  artifacts json DEFAULT '[]'::json,
  "skillUsed" varchar(100),
  "skillArgs" json,
  error text,
  "isRegenerated" boolean DEFAULT false,
  "parentMessageId" integer,
  "sourceChannel" varchar(20),
  "sourceConnectionId" varchar(36),
  "externalSourceId" varchar(64),
  "traceId" varchar(32),
  "runtimeMetadata" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE credit_transactions (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES users(id),
  amount integer NOT NULL,
  type varchar(32) NOT NULL,
  description varchar(512),
  metadata json,
  "balanceAfter" integer NOT NULL,
  "referenceId" varchar(128),
  "idempotencyKey" varchar(256),
  "traceId" varchar(32),
  "conversationId" integer,
  "skillSlug" varchar(128),
  "sourceType" varchar(32),
  "tenantId" varchar(36) REFERENCES tenants(id),
  "reversalOfTransactionId" integer,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE worker_jobs (
  id varchar(36) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "attempt" integer NOT NULL,
  "fencingVersion" bigint NOT NULL,
  "leaseOwnerToken" varchar(256) NOT NULL,
  "leaseExpiresAt" timestamptz NOT NULL
);
CREATE TABLE worker_job_attempts (
  id varchar(36) PRIMARY KEY,
  "workerJobId" varchar(36) NOT NULL,
  "attempt" integer NOT NULL,
  "leaseGeneration" bigint NOT NULL,
  "leaseTokenHash" varchar(256) NOT NULL,
  "leaseExpiresAt" timestamptz NOT NULL
);
CREATE TABLE worker_job_events (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "workerJobId" varchar(36) NOT NULL REFERENCES worker_jobs(id),
  "eventType" varchar(100) NOT NULL,
  "assignmentId" varchar(160),
  sequence integer,
  "eventSequence" integer,
  "eventIdempotencyKey" varchar(200),
  "attemptId" varchar(36),
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX worker_job_events_job_event_sequence_unique
  ON worker_job_events("workerJobId", "eventSequence")
  WHERE "eventSequence" IS NOT NULL;
CREATE UNIQUE INDEX worker_job_events_idempotency_unique
  ON worker_job_events("workerJobId", "eventIdempotencyKey")
  WHERE "eventIdempotencyKey" IS NOT NULL;
INSERT INTO tenants(id) VALUES ('tenant-1'), ('tenant-2');
INSERT INTO users(id) VALUES (1);
INSERT INTO conversations("userId", "tenantId") VALUES (1, 'tenant-1'), (1, 'tenant-2');
SQL

for migration in \
  0353_spec231_inference_plans_attempts.sql \
  0354_spec231_policy_authority.sql \
  0355_spec231_qualification_profiles.sql \
  0356_spec231_inference_probe_runs.sql \
  0357_spec231_policy_revision_rollback_events.sql \
  0358_spec231_signed_rollout_bundles.sql \
  0359_spec231_separate_profile_candidates.sql \
  0360_spec231_durable_credit_reservations.sql \
  0361_spec231_capability_probe_suite.sql \
  0362_spec231_profile_certifications.sql \
  0363_spec231_chat_message_idempotency.sql \
  0364_spec231_chat_response_delivery.sql; do
  "$pg_bin/psql" -v ON_ERROR_STOP=1 -c 'BEGIN' \
    -f "$web_root/drizzle/$migration" -c 'COMMIT'
done

cd "$web_root"
INFERENCE_ROLLOUT_KEYS_JSON='{"test-2026-01":"BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc="}' \
INFERENCE_ROLLOUT_ACTIVE_KEY_ID='test-2026-01' \
RUN_INFERENCE_DB_TESTS=true npm test -- --environment jsdom \
  server/services/inference \
  server/services/chatService.spec231.test.ts \
  server/services/llmRouter.test.ts \
  server/routers/llmProviders.test.ts \
  server/_core/llmChatRolloutHandoff.test.ts \
  client/src/components/admin/__tests__/AdminInferencePolicyPanel.test.tsx \
  client/src/components/admin/__tests__/AdminInferenceRolloutPanel.test.tsx \
  client/src/locales/__tests__/localeParity.test.ts

cd "$repo_root"
python3 - <<'PY'
import importlib.util
from pathlib import Path

test_path = Path("python-backend/tests/test_spec231_llm_caller_inventory.py")
spec = importlib.util.spec_from_file_location("spec231_caller_inventory", test_path)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not load {test_path}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.test_direct_python_llm_callers_match_reviewed_inventory()
module.test_static_python_callers_have_runtime_owner_and_adoption_records()
print("Python caller inventory: 2 checks passed")
PY
