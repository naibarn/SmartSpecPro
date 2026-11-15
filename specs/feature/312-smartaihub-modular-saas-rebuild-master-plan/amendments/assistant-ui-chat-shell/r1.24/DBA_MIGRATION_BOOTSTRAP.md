# SPEC-312 R1.24 DEV migration bootstrap

This is a one-time DBA operation for `modular-debian-dev`'s PostgreSQL DEV database. It is separate from normal migration execution. Do not run it against production or with the application runtime credential. Provision the login secret through the currently approved secret manager and bind it only to the migration runner after the DBA step.

## Target and identity

Before executing, confirm the registered target maps `modular-debian-dev` to `aimarkethubs.com`, the Modular Debian DEV database `smartspec`, PostgreSQL 15.17, and the intended DEV cluster. The normal migration login is `smartspec_migrator_dev`; it must be `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`, and `NOINHERIT`. Runtime remains a different principal. Never use the exposed `smartspec_dev` login.

The DBA must first verify that 0441 is not already applied on the persistent target and confirm the applied 0439/0440 hashes. Preserve existing audit and ledger evidence. If 0441 is applied with a different hash, stop and use the repository's immutable migration repair policy.

## One-time DBA SQL

Run as the authorized database administrator after verifying the target above. This SQL contains no password. Create/bind the login secret through the approved secret manager; do not place credentials in this file, shell history, CI output, or receipts.

```sql
DO $bootstrap$
BEGIN
  IF current_database() <> 'smartspec'
     OR current_setting('server_version_num')::integer / 10000 <> 15 THEN
    RAISE EXCEPTION 'WRONG_MODULAR_DEV_DATABASE_OR_VERSION';
  END IF;
END
$bootstrap$;

CREATE ROLE modular_chat_mission_owner
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE smartspec_migrator_dev
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE smartspec TO smartspec_migrator_dev;
-- drizzle-kit executes CREATE SCHEMA IF NOT EXISTS "drizzle" on every run;
-- PostgreSQL checks database CREATE even when the schema already exists.
GRANT CREATE ON DATABASE smartspec TO smartspec_migrator_dev;
GRANT USAGE ON SCHEMA public TO modular_chat_mission_owner;
GRANT CREATE ON SCHEMA public TO modular_chat_mission_owner;
GRANT CREATE ON SCHEMA public TO smartspec_migrator_dev;

GRANT REFERENCES (id) ON public.users TO smartspec_migrator_dev;
GRANT REFERENCES (id) ON public.conversations TO smartspec_migrator_dev;
GRANT REFERENCES (environment_tenant_id, id) ON public.modular_workspaces TO smartspec_migrator_dev;

GRANT USAGE ON SCHEMA drizzle TO smartspec_migrator_dev;
-- Drizzle also issues CREATE TABLE IF NOT EXISTS for its ledger.
GRANT CREATE ON SCHEMA drizzle TO smartspec_migrator_dev;
GRANT SELECT, INSERT ON drizzle.__drizzle_migrations TO smartspec_migrator_dev;
GRANT USAGE ON SEQUENCE drizzle.__drizzle_migrations_id_seq TO smartspec_migrator_dev;

GRANT SELECT (id) ON public.users TO modular_chat_mission_owner;
GRANT SELECT (id, "userId", "isArchived", "trashedAt", "tenantId")
  ON public.conversations TO modular_chat_mission_owner;
GRANT SELECT (environment_tenant_id, id, owner_user_id, is_default, workspace_type)
  ON public.modular_workspaces TO modular_chat_mission_owner;
GRANT SELECT (conversation_id, environment_tenant_id, workspace_id, owner_user_id)
  ON public.modular_chat_conversation_scopes TO modular_chat_mission_owner;
GRANT SELECT (id, "jobType", "requestedByUserId", environment_tenant_id, chat_workspace_id,
  thread_id, "inputJson", "createdAt", "startedAt", "heartbeatAt", "finishedAt", "progressJson", status)
  ON public.worker_jobs TO modular_chat_mission_owner;
GRANT SELECT (id, "workerJobId", attempt) ON public.worker_job_attempts TO modular_chat_mission_owner;
GRANT SELECT ("workerJobId", "eventSequence") ON public.worker_job_events TO modular_chat_mission_owner;
GRANT SELECT (id, "workerJobId", "artifactType", "metadataJson")
  ON public.worker_artifacts TO modular_chat_mission_owner;
GRANT EXECUTE ON FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar)
  TO modular_chat_mission_owner;

-- This function was created by 0439. PostgreSQL 15 requires the migration
-- login itself to own it for CREATE OR REPLACE; membership in a NOINHERIT
-- owner role is insufficient. Transfer through the authorized DBA path.
ALTER FUNCTION public.list_modular_chat_task_control_projection(integer, varchar, varchar, integer)
  OWNER TO smartspec_migrator_dev;
GRANT modular_chat_mission_owner TO smartspec_migrator_dev;
```

The database administrator must confirm each grant against the live table and function definitions. The owner role gets only columns read by the SECURITY DEFINER projections, plus mission-table DML granted by migration 0441. The migration login temporarily gets schema CREATE, FK REFERENCES, ledger access, and membership in the function owner role so it can create the table/functions and repair Task Control. No application runtime role receives DDL or role-admin privileges.

## Run, verify, and remove temporary authority

Bind `DATABASE_URL` through the approved secret manager into the registered DEV migration runner, then run only `pnpm --dir apps/web db:migrate` with the existing shared-tenant development environment and receipt configuration. Re-check the hostname/target ID, PostgreSQL version, authenticated role attributes, ledger hashes, and 0441 source hash immediately before execution. The migration preflight must succeed; do not bypass it.

After the registered runner succeeds and postconditions are read back, the DBA removes temporary privileges. Keep the owner role's `USAGE` on `public`, narrow source-table SELECT grants, and access to `assert_modular_chat_workspace_access`; remove its schema CREATE. The migration login should no longer be able to create arbitrary public objects, inherit owner privileges, or write the ledger after this change. The migration login can remain provisioned for future approved migrations only if its credential is separately stored and its ongoing scope is reviewed; otherwise disable it through the approved secret/DBA process.

```sql
REVOKE modular_chat_mission_owner FROM smartspec_migrator_dev;
REVOKE CREATE ON DATABASE smartspec FROM smartspec_migrator_dev;
REVOKE CREATE ON SCHEMA public FROM smartspec_migrator_dev;
REVOKE REFERENCES (id) ON public.users FROM smartspec_migrator_dev;
REVOKE REFERENCES (id) ON public.conversations FROM smartspec_migrator_dev;
REVOKE REFERENCES (environment_tenant_id, id) ON public.modular_workspaces FROM smartspec_migrator_dev;
REVOKE SELECT, INSERT ON drizzle.__drizzle_migrations FROM smartspec_migrator_dev;
REVOKE USAGE ON SEQUENCE drizzle.__drizzle_migrations_id_seq FROM smartspec_migrator_dev;
REVOKE USAGE ON SCHEMA drizzle FROM smartspec_migrator_dev;
REVOKE CREATE ON SCHEMA drizzle FROM smartspec_migrator_dev;
REVOKE CREATE ON SCHEMA public FROM modular_chat_mission_owner;
```

Do not run the cleanup until a future migration process has a reviewed replacement. Preserve connection/audit receipts. A later retirement of the legacy superuser runtime credential is a separate service-secret migration: map every consumer, update service bindings, verify reconnection, then revoke the old principal using the authorized DBA procedure. Do not change service environments as part of this migration bootstrap.
