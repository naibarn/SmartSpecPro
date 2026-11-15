# SPEC-312 R1.24 — Single-owner DEV migration runbook

This procedure applies only to the registered `modular-debian-dev` target. The owner/operator is the DEV database administrator and has authorized Codex to execute normal DEV administration, migration, and deployment without an external DBA chain or repeated approval. Production remains a separate authority and is out of scope.

## Target and preflight

Before DDL, verify `apps/web/scripts/deployment-targets.json` maps `modular-debian-dev` to `aimarkethubs.com`, `smartspec`, development, and the registered modular Debian controller. Use the owner-only `/home/dev/.config/smartspec-dev/python.env` checkpoint binding only after confirming its restrictive ownership/mode; never print or put its connection string in process arguments, logs, receipts, or source.

The registered runner requires all of the following: `NODE_ENV=development`, `SMARTSPEC_ENVIRONMENT=development`, `SMARTSPEC_DEV_DATABASE_MODE=shared-tenant`, `SMARTSPEC_DEV_MIGRATION_PROFILE=single-owner-dev-admin`, `DATABASE_TARGET_ID=modular-debian-dev`, `SMARTSPEC_DEV_TENANT_DOMAIN=aimarkethubs.com`, and `APP_URL=https://aimarkethubs.com`. The URL must target local PostgreSQL and database `smartspec`; the live connection must confirm PostgreSQL 15, a login-capable superuser, and application name `spec312-r124-single-owner-dev-admin`. Neither a role name suffix nor `NODE_ENV=production` is used to infer deployment authority.

The runner serializes migration execution, validates the canonical journal and checks the live 0439/0440 hashes/timestamps plus 0441 absence before starting Drizzle. The preflight must not be bypassed. If a different ledger head or an already-applied 0441 is observed, stop and use the repository's immutable migration repair policy.

## Credential rotation

Treat the previously exposed `smartspec_dev` credential as compromised and never reuse it. The owner-approved local admin binding is sufficient; no external secret platform or dedicated `smartspec_migrator_dev` login is required. Identify consumers from service/config metadata, take mode-0600 backups of bindings, rotate through the verified DEV admin connection, update only mapped bindings atomically, then gracefully restart and health-check each consumer. Existing sessions may remain connected during rotation; verify each consumer can establish a fresh connection before declaring rotation complete. Do not alter the separate production site or its credentials.

## Backup and restricted function owner

Before schema or role changes, create and verify a mode-0600 schema backup of `public` and `drizzle`, preserving owners and ACLs. Capture the live migration ledger and relevant function owner/ACL/search-path facts in the non-secret handoff.

The one-time bootstrap below creates only the restricted `NOLOGIN` function-owner role. It gives the role schema `USAGE` and temporary `CREATE`, the narrow source-column reads checked by migration 0441, and `EXECUTE` on the existing workspace authorization function. Migration 0441 assigns its SECURITY DEFINER projections to this role. Run bootstrap only after confirming the exact database, PG15, administrator identity, and backup.

```sql
DO $target$
BEGIN
  IF current_database() <> 'smartspec'
     OR current_setting('server_version_num')::integer / 10000 <> 15
     OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'WRONG_MODULAR_DEV_DATABASE_VERSION_OR_ADMIN';
  END IF;
END
$target$;

CREATE ROLE modular_chat_mission_owner
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE, CREATE ON SCHEMA public TO modular_chat_mission_owner;
GRANT SELECT (id) ON public.users TO modular_chat_mission_owner;
GRANT SELECT (id, "userId", "isArchived", "trashedAt", "tenantId") ON public.conversations TO modular_chat_mission_owner;
GRANT SELECT (environment_tenant_id, id, owner_user_id, is_default, workspace_type) ON public.modular_workspaces TO modular_chat_mission_owner;
GRANT SELECT (conversation_id, environment_tenant_id, workspace_id, owner_user_id) ON public.modular_chat_conversation_scopes TO modular_chat_mission_owner;
GRANT SELECT (id, "jobType", "requestedByUserId", environment_tenant_id, chat_workspace_id, thread_id,
  "inputJson", "createdAt", "startedAt", "heartbeatAt", "finishedAt", "progressJson", status)
  ON public.worker_jobs TO modular_chat_mission_owner;
GRANT SELECT (id, "workerJobId", attempt) ON public.worker_job_attempts TO modular_chat_mission_owner;
GRANT SELECT ("workerJobId", "eventSequence") ON public.worker_job_events TO modular_chat_mission_owner;
GRANT SELECT (id, "workerJobId", "artifactType", "metadataJson") ON public.worker_artifacts TO modular_chat_mission_owner;
GRANT EXECUTE ON FUNCTION public.assert_modular_chat_workspace_access(integer, varchar, varchar)
  TO modular_chat_mission_owner;
```

No dedicated migrator role or legacy function ownership transfer is needed for the explicit admin profile. The migration does not create roles or grant itself authority. The task projection stays SECURITY DEFINER with fixed `search_path`, tenant/workspace authorization, and PUBLIC EXECUTE revoked.

## Migration, verification, cleanup

Run only the registered command after setting the verified target/profile environment in the process environment (never in CLI arguments):

```sh
pnpm --dir apps/web db:migrate
```

Verify the 0441 ledger source hash, table/constraints, canonical Job correlations, Task projection, function owners, SECURITY DEFINER flags, fixed search paths, PUBLIC EXECUTE denial, intended runtime EXECUTE grants, and runtime-role isolation. Check cross-workspace/tenant authorization. Then revoke temporary owner-role schema creation while retaining only the narrow reads and required table/function privileges:

```sql
REVOKE CREATE ON SCHEMA public FROM modular_chat_mission_owner;
```

Verify role flags and ACLs again. Preserve the backup and rollback receipt. If migration fails, inspect transaction rollback and ledger before retrying; do not fabricate ledger rows or edit an applied migration. After migration succeeds, deploy only through the registered `modular-debian-dev` controller and verify its exact source SHA, Core/Chat/Shell health, Mission/Task APIs, artifact retrieval, and rollback readiness. Keep authenticated MFA UAT pending until exercised with a normal authorized browser session.
