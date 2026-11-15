# SPEC-312 R1.24 — Single-owner DEV migration and PostgreSQL 15 recovery

**Disposition:** continuation of R1.23 infrastructure recovery. This amendment does not restart Mission Control feature development.

## Objective

Move the tested 0441 Mission Control schema into DEV using the single owner/operator's verified PostgreSQL administrator access. Keep production isolated, verify the target from connection facts and environment metadata, and release only through `modular-debian-dev` after the registered migration runner and post-checks pass.

## Requirements

1. `SINGLE_OWNER_DEV_ADMIN_MODE` applies only to development. The owner/operator is the DEV database administrator and may authorize Codex to run normal DEV migrations and deployments without an external DBA workflow or repeated approval.
2. Verify the registered `modular-debian-dev` target, domain `aimarkethubs.com`, database `smartspec`, PostgreSQL major version, development/shared-tenant environment, and actual connected role privileges before DDL. Do not infer target safety from a username suffix such as `_dev`.
3. The registered migration runner requires the explicit `SMARTSPEC_DEV_MIGRATION_PROFILE=single-owner-dev-admin` profile, exact DEV target metadata, a PostgreSQL superuser identity confirmed from `pg_roles`, and the dedicated `application_name` marker. Migration 0441 retains a guarded least-privilege profile as an alternative; the admin profile never removes target, identity, ledger, or function-owner checks.
4. Migration 0441 must not create roles or grant itself SECURITY DEFINER authority. Prepare `modular_chat_mission_owner` as a restricted `NOLOGIN` role with only required source-column reads and access to the workspace authorization function. The migration assigns all Mission and Task projection functions to that owner and preserves fixed search paths, tenant checks, and PUBLIC EXECUTE denial.
5. Treat the previously exposed `smartspec_dev` credential as compromised. Never reuse or disclose it. Use the verified DEV admin path to rotate/revoke it, update only bindings confirmed from metadata, and restart mapped consumers after the new secret is securely stored. Local owner-only secret files are acceptable; do not place credentials in source, logs, command arguments, or receipts.
6. Before running 0441, back up relevant schema/function owner/ACL state; verify the live 0439/0440 ledger hashes, 0441 absence, and exact 0441 source hash. Run only `pnpm --dir apps/web db:migrate`, then verify ledger, schema, function owners/ACL/search paths, canonical Job relationships, Task projection repair, and tenant isolation. Revoke temporary `CREATE` from `modular_chat_mission_owner` after verification.
7. Deploy only through the registered `modular-debian-dev` controller after migration succeeds. Verify exact deployed SHA, Core/Chat/Shell health, Mission/Task endpoints, artifact retrieval, and rollback readiness. Never route to `smartsihub.com` or the legacy deployment.
8. Keep authenticated browser UAT pending until normal MFA access is available. Do not bypass authentication. Keep SmartSpecPro owner API verification separate from Modular Core runtime evidence.

## Acceptance evidence

- `IMPLEMENTED`: 0441 privilege model and exact DBA bootstrap/cleanup runbook are integrated.
- `TESTED_PG15`: registered migration runner and explicit DEV-admin preflight pass on PostgreSQL 15.17; runtime and rollback checks pass.
- `CREDENTIAL_ROTATED`, `MIGRATED_DEV`, `DEPLOYED_DEV`, `RUNTIME_VERIFIED`, and `UAT_VERIFIED` require evidence from their actual authorized systems. Fixture evidence cannot satisfy these statuses.
- If a real DEV credential or infrastructure dependency is missing, record that technical dependency and leave only the affected migration/release path `BLOCKED`; organizational DBA approval is not required for DEV.

## Scope boundaries

No SmartSpecPro owner API contract changed, so SPEC-277 and SPEC-294 need no source amendment. No Cloudflare, production database, production release, retired system, authentication bypass, or unrelated service credential changes are authorized by this amendment.


## Current execution status — 2026-11-15

The single-owner DEV path is now exercised on the registered target. The exposed prior `smartspec_dev` password was rotated without disclosure; target preflight confirmed PostgreSQL 15.17, `smartspec`, and the exact live 0439/0440 ledger before the registered migration runner applied 0441. Restricted function ownership and runtime isolation were verified from PostgreSQL catalogs. The immutable Platform source `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5` is deployed to `modular-debian-dev` through the registered controller with rollback retained. Runtime health and anonymous authorization boundaries passed. Authenticated Mission creation, Task projection, and private artifact retrieval remain **UAT_PENDING** until exercised with the user's normal MFA browser session; SPEC-312 remains open. See the latest implementation handoff and traceability evidence.
