# SPEC-312 R1.24 — DEV migration authority and PostgreSQL 15 recovery

**Disposition:** continuation of R1.23 infrastructure recovery. This amendment does not restart Mission Control feature development.

## Objective

Remove the 0441 privilege incompatibility without weakening database or authentication controls, prove the migration through the registered runner on PostgreSQL 15.17 with a non-superuser identity, document the authorized one-time DBA bootstrap, then migrate and release only to `modular-debian-dev` when the target identity is provisioned and verified.

## Requirements

1. Treat the previously exposed `smartspec_dev` credential as compromised. Do not reuse or disclose it. Identify affected local secret bindings and dependent services from metadata only; rotate/revoke only through the authorized DBA and existing secret authority.
2. Keep DBA bootstrap, dedicated migration identity, SECURITY DEFINER owner role, and application runtime identity distinct. Routine migration must use the dedicated `smartspec_migrator_dev` login without superuser, `CREATEROLE`, `CREATEDB`, replication, bypass-RLS, or inherited privileges. The runner needs temporary database/schema `CREATE` and ledger write grants; revoke those after migration verification.
3. Migration 0441 must not create roles or grant membership to itself. It must preflight exact target, role flags, required transient DDL/ledger privileges, owner-role column reads, the existing Task Control function owner, and 0439/0440 history before making schema changes.
4. Transfer the existing Task Control function to the dedicated migration login immediately before migration so PostgreSQL 15 permits `CREATE OR REPLACE`; 0441 then transfers it with the Mission functions to `modular_chat_mission_owner`. Remove transient privileges after successful postcondition checks.
5. Test 0439 → 0440 → 0441 on isolated PG15.17 synthetic fixtures. Run 0441 through `pnpm --dir apps/web db:migrate` as a non-superuser. Verify ledger source hashes, table constraints, function ownership/ACL/search path, isolation, idempotency, canonical execution correlation, Task Control freshness, and DDL rollback.
6. Apply 0441 on the actual development database and release only through the registered `modular-debian-dev` controller after DBA bootstrap, redacted credential rotation, exact-target preflight, and approved runner configuration. Never route to `smartsihub.com` or the legacy deployment.
7. Keep authenticated browser UAT pending until normal MFA access is available. Do not bypass authentication. Keep SmartSpecPro owner API verification separate from Modular Core runtime evidence.

## Acceptance evidence

- `IMPLEMENTED`: 0441 privilege model and exact DBA bootstrap/cleanup runbook are integrated.
- `TESTED_PG15`: registered migration runner succeeds on a disposable PG15.17 synthetic fixture using a dedicated non-superuser role; runtime and rollback checks pass.
- `CREDENTIAL_ROTATED`, `MIGRATED_DEV`, `DEPLOYED_DEV`, `RUNTIME_VERIFIED`, and `UAT_VERIFIED` require evidence from their actual authorized systems. Fixture evidence cannot satisfy these statuses.
- If the DBA/credential authority is unavailable, record exact actions and leave only the affected DEV migration/release path `BLOCKED`; continue independent source verification.

## Scope boundaries

No SmartSpecPro owner API contract changed, so SPEC-277 and SPEC-294 need no source amendment. No Cloudflare, production database, production release, retired system, authentication bypass, or unrelated service credential changes are authorized by this amendment.
