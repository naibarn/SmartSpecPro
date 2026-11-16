#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATION="$ROOT/apps/web/drizzle/0444_modular_runner_enrollment.sql"
CONTROL_MIGRATION="$ROOT/apps/web/drizzle/0445_modular_runner_control.sql"
CONTAINER="${SPEC224_TEST_PG_CONTAINER:-}"
if [[ -z "$CONTAINER" || -z "${SPEC224_TEST_DATABASE_IDENTITY:-}" ]]; then
  echo "MODULAR_RUNNER_PG_FIXTURE_REQUIRED" >&2
  exit 2
fi
if [[ "${SPEC224_TEST_DATABASE_IDENTITY}" != spec224-safe-*\|spec224_d385_test\|spec224_d385_runtime\|PostgreSQL\ 15.17 ]]; then
  echo "MODULAR_RUNNER_PG_FIXTURE_IDENTITY_REJECTED" >&2
  exit 2
fi

pg_bootstrap() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U spec224_bootstrap -d postgres "$@"
}
pg_migration() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U smartspec_migrator_dev -d smartspec "$@"
}
pg_runtime() {
  docker exec -i "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U modular_core_auth_dev -d smartspec "$@"
}

pg_bootstrap <<'SQL'
CREATE ROLE modular_chat_mission_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
CREATE ROLE smartspec_migrator_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
CREATE ROLE modular_core_auth_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
GRANT modular_chat_mission_owner TO smartspec_migrator_dev;
CREATE DATABASE smartspec OWNER spec224_bootstrap;
SQL

pg_bootstrap -d smartspec <<'SQL'
GRANT CREATE ON DATABASE smartspec TO smartspec_migrator_dev;
GRANT CREATE ON SCHEMA public TO smartspec_migrator_dev, modular_chat_mission_owner;
CREATE TABLE public.tenants(id varchar(36) PRIMARY KEY);
CREATE TABLE public.users(id integer PRIMARY KEY);
CREATE TABLE public.runner_nodes(
  "runnerId" varchar(160) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES public.tenants(id),
  "ownerUserId" integer REFERENCES public.users(id),
  "nodeKind" varchar(64) NOT NULL,
  profile varchar(64) NOT NULL,
  "deviceId" varchar(160) NOT NULL,
  "displayName" varchar(255) NOT NULL,
  "trustState" varchar(32) NOT NULL,
  status varchar(32) NOT NULL,
  "activeSessionId" varchar(64),
  "currentSnapshotRevision" varchar(128),
  "currentSnapshotJson" jsonb,
  "snapshotObservedAt" timestamptz,
  "snapshotExpiresAt" timestamptz,
  "lastSeenAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("tenantId", "deviceId")
);
ALTER TABLE public.runner_nodes OWNER TO smartspec_migrator_dev;
CREATE TABLE public.runner_capability_snapshots(
  "id" varchar(36) PRIMARY KEY,
  "runnerId" varchar(160) NOT NULL REFERENCES public.runner_nodes("runnerId") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "revision" varchar(128) NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "observedAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "snapshotJson" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("runnerId","revision"), UNIQUE("runnerId","idempotencyKey")
);
ALTER TABLE public.runner_capability_snapshots OWNER TO smartspec_migrator_dev;
CREATE TABLE public.runner_harness_instances(
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  "runnerId" varchar(160) NOT NULL REFERENCES public.runner_nodes("runnerId") ON DELETE CASCADE,
  "adapterId" varchar(128) NOT NULL, "toolId" varchar(160) NOT NULL, "displayName" varchar(255) NOT NULL,
  "adapterVersion" varchar(64), "trustState" varchar(32) NOT NULL, "availabilityState" varchar(32) NOT NULL,
  "workspaceIds" jsonb NOT NULL DEFAULT '[]'::jsonb, "capabilitySnapshotRevision" varchar(128) NOT NULL,
  "provenanceJson" jsonb NOT NULL, "registeredAt" timestamptz NOT NULL DEFAULT now(),
  "lastHeartbeatAt" timestamptz, "expiresAt" timestamptz NOT NULL, "revokedAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE("tenantId","runnerId","adapterId","toolId")
);
ALTER TABLE public.runner_harness_instances OWNER TO smartspec_migrator_dev;
INSERT INTO public.tenants VALUES ('tenant-dev-1');
INSERT INTO public.users VALUES (7);
CREATE FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar)
RETURNS varchar LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT CASE WHEN $1=7 AND $2='modular-development' AND $3='tenant-dev-1'
  AND session_user='modular_core_auth_dev' THEN 'owner' ELSE NULL END $$;
ALTER FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar)
  OWNER TO modular_chat_mission_owner;
GRANT EXECUTE ON FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar)
  TO modular_chat_mission_owner;
GRANT REFERENCES ON public.tenants, public.users, public.runner_nodes TO smartspec_migrator_dev;
GRANT SELECT ("runnerId", "tenantId", "ownerUserId", "displayName", "status", "trustState", "lastSeenAt", "revokedAt")
  ON public.runner_nodes TO modular_chat_mission_owner;
SQL

docker cp "$MIGRATION" "$CONTAINER:/tmp/0444_modular_runner_enrollment.sql" >/dev/null
pg_migration -f /tmp/0444_modular_runner_enrollment.sql >/dev/null
docker cp "$CONTROL_MIGRATION" "$CONTAINER:/tmp/0445_modular_runner_control.sql" >/dev/null
pg_migration -f /tmp/0445_modular_runner_control.sql >/dev/null
pg_bootstrap -d smartspec -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f',p.proowner))) a
    WHERE p.proname IN ('start_modular_runner_pairing','approve_modular_runner_pairing','get_modular_runner_pairing',
      'complete_modular_runner_pairing','rotate_modular_runner_refresh','get_modular_runner_device',
      'consume_modular_runner_proof_nonce','revoke_modular_runner_device','record_modular_runner_control')
      AND a.grantee=0 AND a.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'RUNNER_FUNCTION_PUBLIC_EXECUTE_NOT_REVOKED'; END IF;
  IF NOT pg_catalog.has_function_privilege('modular_core_auth_dev',
    'public.start_modular_runner_pairing(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'RUNNER_RUNTIME_EXECUTE_NOT_GRANTED';
  END IF;
END $$;
SQL

RESULTS="$(pg_runtime -At <<'SQL'
SELECT public.start_modular_runner_pairing(jsonb_build_array(jsonb_build_object(
  'codeHash',repeat('a',64),'nonceHash',repeat('b',64),'userCodeHash',repeat('c',64),
  'runnerId','runner-fixture-01','displayName','Fixture Runner','deviceId','device-fixture-01',
  'machineFingerprint','fixture-fingerprint','publicKey','fixture-public-key','runnerVersion','0.2.44-dev.1',
  'runnerContracts','["runner-job-v1"]'::jsonb,'connectRevisions','{}'::jsonb,
  'runnerSessionId','10000000-0000-4000-8000-000000000001','expiresAt',now()+interval '5 minutes')))->>'status';
SELECT public.approve_modular_runner_pairing(jsonb_build_array(jsonb_build_object(
  'userId',7,'tenantId','tenant-dev-1','userCodeHash',repeat('c',64))))->>'status';
SELECT public.get_modular_runner_pairing(jsonb_build_array(jsonb_build_object(
  'codeHash',repeat('a',64),'nonceHash',repeat('b',64))))->>'status';
SELECT public.complete_modular_runner_pairing(jsonb_build_array(jsonb_build_object(
  'codeHash',repeat('a',64),'nonceHash',repeat('b',64),'accessJti',repeat('d',64),
  'refreshJti',repeat('e',64),'refreshHash',repeat('f',64),'refreshExpiresAt',now()+interval '1 day')))->>'status';
SELECT public.complete_modular_runner_pairing(jsonb_build_array(jsonb_build_object(
  'codeHash',repeat('a',64),'nonceHash',repeat('b',64),'accessJti',repeat('d',64),
  'refreshJti',repeat('e',64),'refreshHash',repeat('f',64),'refreshExpiresAt',now()+interval '1 day')))->>'status';
SELECT public.get_modular_runner_device(jsonb_build_array(jsonb_build_object(
  'tenantId','tenant-dev-1','runnerId','runner-fixture-01','deviceId','device-fixture-01','accessJti',repeat('d',64))))->>'status';
SELECT public.consume_modular_runner_proof_nonce(jsonb_build_array(jsonb_build_object(
  'tenantId','tenant-dev-1','runnerId','runner-fixture-01','deviceId','device-fixture-01',
  'nonce','20000000-0000-4000-8000-000000000001','expiresAt',now()+interval '30 seconds')))->>'status';
SELECT public.consume_modular_runner_proof_nonce(jsonb_build_array(jsonb_build_object(
  'tenantId','tenant-dev-1','runnerId','runner-fixture-01','deviceId','device-fixture-01',
  'nonce','20000000-0000-4000-8000-000000000001','expiresAt',now()+interval '30 seconds')))->>'status';
SELECT public.consume_modular_runner_proof_nonce(jsonb_build_array(jsonb_build_object(
  'tenantId','tenant-dev-1','runnerId','runner-fixture-01','deviceId','device-fixture-01',
  'nonce','20000000-0000-4000-8000-000000000002','expiresAt',now()-interval '1 second')))->>'status';
SELECT public.rotate_modular_runner_refresh(jsonb_build_array(jsonb_build_object(
  'tenantId','tenant-dev-1','runnerId','runner-fixture-01','deviceId','device-fixture-01',
  'oldRefreshHash',repeat('f',64),'accessJti',repeat('1',64),'refreshJti',repeat('2',64),
  'refreshHash',repeat('3',64),'refreshExpiresAt',now()+interval '1 day')))->>'status';
SELECT public.record_modular_runner_control(jsonb_build_array(jsonb_build_object(
  'environmentTenantId','modular-development','tenantId','tenant-dev-1','runnerId','runner-fixture-01',
  'deviceId','device-fixture-01','runnerSessionId','10000000-0000-4000-8000-000000000001',
  'accessJti',repeat('1',64),'sequence',1,'idempotencyKey','runner-fixture-01:1','bodySha256',repeat('a',64),
  'envelope',jsonb_build_object('payload',jsonb_build_object('type','runner.capabilities.update','snapshot',jsonb_build_object(
    'revision','fixture-rev-1','observedAt',now(),'expiresAt',now()+interval '5 minutes',
    'capabilities',jsonb_build_array('tool.execute.codex'),'workspaceIds',jsonb_build_array('workspace-1'),
    'toolInventory',jsonb_build_array(jsonb_build_object('toolId','codex','displayName','Codex CLI','adapterId','codex.v1',
      'version','0.165.0','trustState','ready','availabilityState','available','authState','authenticated','healthState','healthy'))))))))->>'status';
SELECT public.record_modular_runner_control(jsonb_build_array(jsonb_build_object(
  'environmentTenantId','modular-development','tenantId','tenant-dev-1','runnerId','runner-fixture-01',
  'deviceId','device-fixture-01','runnerSessionId','10000000-0000-4000-8000-000000000001',
  'accessJti',repeat('1',64),'sequence',1,'idempotencyKey','runner-fixture-01:1','bodySha256',repeat('a',64),
  'envelope',jsonb_build_object('payload',jsonb_build_object('type','runner.capabilities.update','snapshot',jsonb_build_object(
    'revision','fixture-rev-1','observedAt',now(),'expiresAt',now()+interval '5 minutes',
    'capabilities',jsonb_build_array('tool.execute.codex'),'workspaceIds',jsonb_build_array('workspace-1'),
    'toolInventory',jsonb_build_array(jsonb_build_object('toolId','codex','displayName','Codex CLI','adapterId','codex.v1',
      'version','0.165.0','trustState','ready','availabilityState','available','authState','authenticated','healthState','healthy'))))))))->>'status';
SELECT public.record_modular_runner_control(jsonb_build_array(jsonb_build_object(
  'environmentTenantId','modular-development','tenantId','tenant-dev-1','runnerId','runner-fixture-01',
  'deviceId','device-fixture-01','runnerSessionId','10000000-0000-4000-8000-000000000001',
  'accessJti',repeat('1',64),'sequence',2,'idempotencyKey','runner-fixture-01:2','bodySha256',repeat('b',64),
  'envelope',jsonb_build_object('payload',jsonb_build_object('type','runner.reconcile','capabilityRevision','fixture-rev-1',
    'activeJobs',jsonb_build_array(),'command','keepalive')))))->>'status';
SELECT public.rotate_modular_runner_refresh(jsonb_build_array(jsonb_build_object(
  'tenantId','tenant-dev-1','runnerId','runner-fixture-01','deviceId','device-fixture-01',
  'oldRefreshHash',repeat('f',64),'accessJti',repeat('1',64),'refreshJti',repeat('2',64),
  'refreshHash',repeat('3',64),'refreshExpiresAt',now()+interval '1 day')))->>'status';
SQL
)"
EXPECTED=$'pending\napproved\napproved\napproved\ndenied\napproved\napproved\ndenied\ndenied\napproved\napplied\nduplicate\napplied\ndenied'
if [[ "$RESULTS" != "$EXPECTED" ]]; then
  printf 'MODULAR_RUNNER_PG_EXPECTED_STATUSES_MISMATCH\nObserved:\n%s\n' "$RESULTS" >&2
  exit 1
fi

pg_bootstrap -d smartspec -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.runner_nodes WHERE "runnerId"='runner-fixture-01'
      AND status='online' AND "currentSnapshotRevision"='fixture-rev-1' AND "lastSeenAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'RUNNER_HEARTBEAT_OR_SNAPSHOT_NOT_APPLIED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.runner_harness_instances WHERE "runnerId"='runner-fixture-01'
      AND "adapterId"='codex.v1' AND "toolId"='codex' AND "trustState"='trusted'
      AND "availabilityState"='available' AND "provenanceJson"->>'authState'='authenticated') THEN
    RAISE EXCEPTION 'RUNNER_HARNESS_PROJECTION_NOT_REGISTERED';
  END IF;
END $$;
SQL
REVOKE_STATUS="$(pg_runtime -Atc "SELECT public.revoke_modular_runner_device(jsonb_build_array(jsonb_build_object('userId',7,'tenantId','tenant-dev-1','runnerId','runner-fixture-01','deviceId','device-fixture-01')))->>'status'")"
if [[ "$REVOKE_STATUS" != "approved" ]]; then echo "MODULAR_RUNNER_REVOKE_FAILED" >&2; exit 1; fi

echo "MODULAR_RUNNER_ENROLLMENT_CONTROL_PG15_INTEGRATION_PASS"
