# SPEC-312 R1.24 HandOff

- **Current status:** DEV credential rotation, migration 0441, and Modular DEV deployment are complete. Authenticated MFA UAT remains pending; SPEC-312 stays open.
- **Baseline:** SmartSpecPro `main` was `49ef6b47161889b7f686d231e98a2ef53c732bda` and equal to `origin/main` at task start. R1.24 implementation commit `847ed7baca5baf1c16817d65575fe0dea71f94dd` is fetched and verified as `main == origin/main`. Platform baseline remains `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5`.
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

## 2026-11-15 authority and DEV recheck

- SmartSpecPro is still `f137f228048e17de7ace02528ffe4a0e26d1b3ab` and equals `origin/main`; Platform is still `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5` and equals `origin/main`. Existing unrelated dirty worktree changes were preserved.
- The registered `modular-debian-dev` target and its release receipt identify source `ca4f5a58dd7f7cc29db97bea0aebf0dd95362eb2`, target `modular-debian-dev`, domain `aimarkethubs.com`, PostgreSQL database `smartspec`, and Debian/Workerd runtime. Public `GET /livez`, `/api/chat/livez`, and `/login` each returned HTTP 200. This confirms current public health and configured release evidence; it does not prove a database migration or Mission Control readiness.
- Current source SHA-256 values are 0439 `d03fcb18c80b2d035cf7a8bac5d696fe5164c0ad6b4aaa0e81e520e58315e4a8`, 0440 `141f197c9c5c0f9b584691ad6e5001ecd194105aa0479a6fdc7b33b4e389c784`, and 0441 `c242049230d02d298398acb3d206d4d6aea3f386e4135a098a9b6cf67d37a0aa`. These hashes match the existing fixture evidence. Live DEV ledger hashes and 0441 absence were not independently confirmed because no approved live DB read credential was available.
- No database/secret-management tool or registered DBA authority for the remote Debian PostgreSQL target was discoverable. The local Orca `migration-v1.json` is only a migration-home record (`migratedHomeCount: 0`), not a DB credential authority. `psql` being installed does not establish DBA access. `gcloud`, `vault`, and `cf` are unavailable. The exposed `smartspec_dev` credential was not read, reused, or modified.
- **Operator handoff:** the authorized owner of the actual PostgreSQL DEV cluster and its secret authority must (1) verify `modular-debian-dev` / `aimarkethubs.com` / PostgreSQL 15.17 / `smartspec`; (2) inspect/audit consumers, rotate and revoke compromised `smartspec_dev` through its registered authority; (3) provision `smartspec_migrator_dev` with the required least-privilege flags and securely bind its secret only to the registered migration runner; (4) verify live 0439/0440 hashes and 0441 absence; (5) execute the one-time bootstrap SQL below, run `pnpm --dir apps/web db:migrate`, verify the exact 0441 hash plus schema/owner/ACL/runtime authorization postconditions, then apply the documented temporary privilege cleanup. If a partial migration or hash mismatch is found, stop and follow the recovery instructions in the same runbook; do not edit migration 0441 or bypass preflight.
- **Missing authority:** the approved DBA identity/control plane for the remote PostgreSQL DEV cluster and the approved secret manager/binding authority could not be identified from connected tools or registered local configuration. The operator must supply/use that registered authority; OS sudo and local `psql` availability are not substitutes.
- **Ready to resume:** once that DBA/secret binding is provisioned, resume at the live target/ledger/hash preflight in [DBA_MIGRATION_BOOTSTRAP.md](../DBA_MIGRATION_BOOTSTRAP.md), then proceed through its bootstrap, migration, verification, and cleanup steps. Do not rerun the completed PG15 fixture absent a material source/privilege/environment change.

| Status | Recheck result |
| --- | --- |
| `CREDENTIAL_ROTATED` | `BLOCKED` — authorized secret/DBA authority unavailable |
| `DBA_BOOTSTRAPPED` | `BLOCKED` — no authorized live DBA execution |
| `MIGRATED_DEV` | `BLOCKED` — live ledger not accessed and migration not run |
| `DEPLOYED_DEV` | `PENDING` — existing configured release remains `ca4f5a58`; no new release |
| `RUNTIME_VERIFIED` | `PARTIAL` — public Core, Chat, and Shell health routes return 200; Mission Control post-migration endpoints not verified |
| `UAT_VERIFIED` | `UAT_PENDING` — no authenticated MFA browser session available |
| `SPEC_ACCEPTANCE` | `PENDING` — blocked by live migration, new release, and authenticated UAT |

## 2026-11-15 single-owner DEV authority resolution

The owner explicitly authorized autonomous DEV administration and deployment; no external DBA chain or enterprise secret manager is required. The previously recorded “authority unavailable” entries above are historical and are superseded by this evidence and policy.

- SmartSpecPro baseline is `97fe0b329e985987d8fbca97b0d4da66b93a4746` and equals `origin/main`; Platform baseline remains `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5`. Unrelated dirty worktree changes remain preserved.
- The owner-only local checkpoint binding is protected (`/home/dev/.config/smartspec-dev/python.env`, mode 0600, current owner). A read-only live query confirmed `smartspec`, PostgreSQL 15.17, authenticated role `smartspec` with actual `rolsuper=true`. Live rows 418/419 exactly match 0439/0440 hashes and timestamps; 0441 is absent; the Mission table and owner role do not exist. The exposed `smartspec_dev` role itself is still a superuser and currently owns the 0439 Task Control function.
- `0441_modular_chat_missions.sql` now supports the explicitly marked actual-superuser DEV profile while preserving the restricted NOLOGIN owner, SECURITY DEFINER, fixed search path, tenant authorization, PUBLIC EXECUTE denial, and runtime isolation. Source hash is now `feaea1d8c41d61b53bc2f9cbaaa630dc9583cbc9454267c2e98fc0ffcb80db0b`; do not use the earlier fixture hash for this amended source. Runner guards enforce the exact `modular-debian-dev` / `aimarkethubs.com` target, actual PG15 superuser identity, exact 0439/0440 ledger hashes and timestamps, and 0441 absence. The new focused guard suite passes 17/17.
- Known `smartspec_dev` local bindings are `python.env` and `web.env`; a local dev web process reads `web.env`, while the active Python service reads `python.env`. These bindings and active consumers are being rotated/restarted through the verified admin path. No credential values are recorded here.
- No live schema mutation, migration, or release has happened yet. The next authorized step is a private schema/ledger backup, secure credential rotation and consumer reconnection, then restricted owner-role bootstrap and the registered `pnpm --dir apps/web db:migrate` command. Re-read the live ledger/hash and target immediately before migration.
- Deployment remains only `modular-debian-dev` (`https://aimarkethubs.com/chat`) through its registered controller after migration. No production or legacy target is authorized. Authenticated MFA UAT remains pending until a normal browser session is available.

| Status | Current result |
| --- | --- |
| `CREDENTIAL_ROTATED` | `PENDING` — secure rotation and consumer reconnection not yet performed |
| `DBA_BOOTSTRAPPED` | `PENDING` — verified owner path exists; restricted function-owner role not yet prepared |
| `MIGRATED_DEV` | `PENDING` — live 0441 remains unapplied |
| `DEPLOYED_DEV` | `PENDING` — preserved release remains `ca4f5a58`; no new release |
| `RUNTIME_VERIFIED` | `PARTIAL` — public Core/Chat/Shell health only; Mission/Task/artifact checks pending |
| `UAT_VERIFIED` | `UAT_PENDING` — authenticated MFA browser session not available |
| `SPEC_ACCEPTANCE` | `PENDING` — migration, deployment, runtime verification, and UAT remain |


## 2026-11-15 execution closeout — DEV migrated and deployed

The owner authorized autonomous development-only database administration and release. This section is the current status and supersedes earlier blocked/pending snapshots above; those snapshots remain as historical evidence. Production and `smartaihub.app` were not changed.

### Credential and database

- Rotated the previously exposed `smartspec_dev` password through the verified superuser connection. The old password is invalid; the replacement was kept in owner-only mode-0600 `python.env` and `web.env`, and mapped consumers were restarted/reconnected. No credential value or connection string was emitted.
- Preserved pre-migration schema dump: `/home/dev/.config/smartspec-dev/backups/spec312-r124-pre-0441-20261115T160007Z.dump` (mode 0600, `pg_restore -l` verified, SHA-256 `d6a66e4dfa58ff44df12985ebda203895179be72548a95af3b6d388a511f2bcb`).
- Used the actual owner-authorized PostgreSQL administrator on database `smartspec`, PostgreSQL 15.17. The preflight read actual `rolsuper=true`, verified `modular-debian-dev` / `aimarkethubs.com`, the exact 0439/0440 ledger hashes and timestamps, and 0441 absence. The registered command `pnpm --dir apps/web db:migrate` applied 0441 at journal timestamp `1794770000002`, hash `feaea1d8c41d61b53bc2f9cbaaa630dc9583cbc9454267c2e98fc0ffcb80db0b`. The runner receipt is stored at `/home/dev/.config/smartspec-dev/backups/spec312-r124-0441-migration-receipt.jsonl`.
- Readback confirmed the Mission table and seven constraints; all three Mission/Task projection functions are owned by `modular_chat_mission_owner`, `SECURITY DEFINER`, fixed to `search_path=pg_catalog, public`, and not executable by PUBLIC. DEV auth can execute them; DEV auth cannot directly SELECT `worker_jobs`; the owner role has no broad `worker_jobs` SELECT and temporary schema CREATE has been revoked.

### Immutable build and deployment

- Built Core, Shell, and Chat from canonical Platform SHA `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5` with pinned pnpm 10.4.1 and Wrangler dry-runs. Build completed; Chat emitted the known Vite advisory because the main chunk is 537.66 kB. No Worker was deployed.
- Release artifact: `/home/dev/modular-development-releases/modular-debian-dev-9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5-r124-mission-control`; controller receipt: `release-manifest.json`.
- Registered controller result: `DEPLOYED_AND_VERIFIED` at `2026-11-15T16:19:58Z`, target `modular-debian-dev`, `https://aimarkethubs.com`, exact source SHA above. Local Core/Chat/Shell are 200, anonymous Chat session is 401, module manifest and entry are 200. Public shell root/login, Chat health, and module manifest are 200; anonymous Chat session is 401. Rollback config and service drop-in backups are retained under the release `rollback/` directory; legacy rollback service remains `smartspec-dev-web.service:3100`.
- Independent local GET checks returned 200 for `/livez`, `/api/chat/livez`, and `/login`; 401 for anonymous session, Mission list, Task Control, and artifact-list endpoints. An additional Python `urllib` public probe received edge 403s, while controller public smoke and local curls passed; do not treat the urllib probe as authenticated or as deployment failure.

### Current status

| Status | Result |
| --- | --- |
| `CREDENTIAL_ROTATED` | `COMPLETE` — previous exposed password invalidated; mapped local bindings refreshed and consumers reconnected |
| `DBA_BOOTSTRAPPED` | `COMPLETE` — restricted owner role prepared; temporary schema CREATE revoked |
| `MIGRATED_DEV` | `COMPLETE` — live 0441 ledger/hash and schema/ACL postconditions verified |
| `DEPLOYED_DEV` | `COMPLETE` — exact Platform SHA `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5` via registered controller |
| `RUNTIME_VERIFIED` | `PARTIAL` — health, release asset delivery, and anonymous denial verified; authenticated Mission/Task/artifact behavior awaits MFA UAT |
| `UAT_VERIFIED` | `UAT_PENDING` — no normal authenticated MFA browser session was available to this execution |
| `SPEC_ACCEPTANCE` | `PENDING` — keep SPEC-312 open until authenticated UAT is completed |

**Ready to resume:** sign in normally at `https://aimarkethubs.com/login` and complete MFA, then create a Mission for a Chat conversation, verify stable Mission ID after refresh and canonical Job/Attempt/Event relationships, exercise Task navigation and private artifact retrieval, and verify cross-workspace denial and no duplicate dispatch. No MFA bypass or cookie bridging is permitted.
