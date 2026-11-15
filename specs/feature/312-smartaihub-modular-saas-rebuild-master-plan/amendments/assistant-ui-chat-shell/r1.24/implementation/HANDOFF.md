# SPEC-312 R1.24 HandOff

- **Status:** implementation complete for the safe source/fixture work; actual DEV migration and release remain `BLOCKED` by missing DBA credential/bootstrap authority.
- **Baseline:** SmartSpecPro `main` was `49ef6b47161889b7f686d231e98a2ef53c732bda` and equal to `origin/main` at task start. Platform baseline remains `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5`. The R1.24 integrated source SHA is reported by the final Git reconciliation.
- **Target:** `modular-debian-dev`, `https://aimarkethubs.com/chat`, database `smartspec`, PostgreSQL 15.17. No Cloudflare, production or legacy deployment was touched.

## Credential incident

- Treat database principal `smartspec_dev` as compromised. Its secret was exposed in prior tool output and was not reused for this work.
- Metadata-only review identified local bindings under `/home/dev/.config/smartspec-dev/web.env` and `python.env`, plus dated backups. The reviewed active systemd units use different `.env` files and the separate `smartspec` principal; no active Modular service binding to `smartspec_dev` was found in the inspected unit metadata.
- No approved secret manager/rotation workflow for this Debian PostgreSQL target was found. A legacy Cloud Run/Neon rotation runbook does not apply. `gcloud` and a local PostgreSQL DBA socket are unavailable; `sudo` capability alone does not establish remote database authority.
- **Rotation:** `PENDING`. The DBA/operator must inspect role connection/audit evidence, provision/rotate through the authorized database credential authority, update only mapped consumers, verify reconnection, and revoke the exposed credential. Do not change the separate `smartspec` service credentials without evidence they are affected. Relevant secret scanner results were redacted; the scoped R1.24 source/evidence files contain no credential values.

## Migration implementation and PG15 evidence

- `apps/web/drizzle/0441_modular_chat_missions.sql` no longer creates/administers roles or grants membership. It checks the exact `smartspec_migrator_dev` login, role flags, prepared owner, exact database, transient runner privileges, 0439 Task Control ownership, and documented narrow projection reads before DDL.
- PostgreSQL 15.17 confirmed a `NOINHERIT` member cannot `CREATE OR REPLACE` a function owned by another role. The DBA bootstrap therefore transfers the existing Task Control function to the migration login temporarily; 0441 replaces it and transfers it and the Mission functions to `modular_chat_mission_owner`.
- The registered `pnpm --dir apps/web db:migrate` completed on an isolated disposable PostgreSQL `15.17 (Debian 15.17-1.pgdg13+1)` fixture using `smartspec_migrator_dev` with `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`, `NOREPLICATION`, and `NOINHERIT`. Synthetic 0439 and 0440 source migrations were executed first; their real source hashes and journal timestamps were recorded in that fixture. Drizzle then applied 0441 as the non-superuser and wrote its ledger entry.
- Fixture ledger: 0439 `d03fcb18c80b2d035cf7a8bac5d696fe5164c0ad6b4aaa0e81e520e58315e4a8` at `1794770000000`; 0440 `141f197c9c5c0f9b584691ad6e5001ecd194105aa0479a6fdc7b33b4e389c784` at `1794770000001`; 0441 `c242049230d02d298398acb3d206d4d6aea3f386e4135a098a9b6cf67d37a0aa` at `1794770000002`.
- Postconditions passed: all Mission FKs/checks/unique constraints validated; one Seedream row remained; all three SECURITY DEFINER functions are owned by the NOLOGIN owner, use fixed `pg_catalog, public` search paths, deny PUBLIC EXECUTE, and allow the DEV runtime role to execute; runtime cannot directly SELECT `worker_jobs`; owner has narrow column reads and no broad `worker_jobs` SELECT.
- Runtime fixture passed: duplicate explicit creation returns one stable Mission; Mission lifecycle stays `active` while its canonical Job is `succeeded`; Job/Run/Attempt/Event/Artifact correlation is returned; cross-workspace and cross-environment calls are denied; unavailable Agent identities remain empty; Task Control returns the existing Job/Attempt/Event/Artifact and uses the canonical finished/heartbeat/started/created timestamp order. A test-only SECURITY DEFINER assertion verified Task `updated_at` equals that canonical timestamp.
- Missing-bootstrap preflight failed with `MIGRATION_BOOTSTRAP_REQUIRED` before DDL. A test-only Drizzle migration that deliberately divided by zero rolled back its earlier `CREATE TABLE`; the probe table was absent and the ledger stayed at three rows.
- This was a schema/role fixture with synthetic rows, not a clone of the live DEV database. It proves PostgreSQL 15 syntax/privilege behavior and runner compatibility, not `MIGRATED_DEV`.

## Exact DEV next actions

1. Authorized DBA verifies current live DB target/version and 0439/0440 hashes, ensures 0441 is still unapplied, rotates/revokes the exposed principal through the approved provider, and provisions the no-password-in-source `smartspec_migrator_dev` credential through the approved secret store.
2. DBA executes only the one-time role/function/column-grant bootstrap in [DBA_MIGRATION_BOOTSTRAP.md](../DBA_MIGRATION_BOOTSTRAP.md). Bind the migration secret to the registered runner. Keep the runtime identity separate.
3. Re-run live target, role, applied-hash, source-hash, service-health and rollback preflight. Run only the registered `pnpm --dir apps/web db:migrate`; read back the ledger hash and all ACL/owner/schema postconditions. Revoke temporary CREATE, REFERENCES, membership, and ledger grants after proof.
4. Build immutable platform source and release only with the registered `modular-debian-dev` controller. Verify exact deployed SHA, Core/Chat/Shell/Mission/artifact/Task endpoints and actual target health before claiming `DEPLOYED_DEV` or `RUNTIME_VERIFIED`.
5. Complete normal-MFA browser UAT and separately verify the actual SPEC-277 owner deployment. Until then `UAT_PENDING`; do not bridge cookies or bypass MFA.

## Status

| Status | Result |
| --- | --- |
| `IMPLEMENTED` | Yes — source preflight and DBA bootstrap/cleanup runbook |
| `TESTED_PG15` | Yes — isolated PG15.17 synthetic fixture and registered non-superuser runner |
| `CREDENTIAL_ROTATED` | `PENDING` — approved authority/provider unavailable |
| `MIGRATED_DEV` | `BLOCKED` — no provisioned least-privilege credential; live DB was not mutated |
| `DEPLOYED_DEV` | `PENDING` — blocked on verified live schema |
| `RUNTIME_VERIFIED` | `PENDING` — no R1.24 DEV release |
| `UAT_VERIFIED` | `PENDING` — authenticated MFA browser session unavailable |

**Disposition:** `PARTIAL / CONTINUATION_REQUIRED`. Do not ask test users to exercise Mission Control until the actual DEV table is migrated and the authorized release is healthy.
