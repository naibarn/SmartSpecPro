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


## 2026-11-16 Task Control and Mission Control UI entry

The modular DEV Chat sidebar now opens both interactive workbench previews. This addendum updates UI availability only; it does not change the database, live Mission/Task runtime, credit behavior, or the pending authenticated UAT status above.

- Integrated Platform source is `c58886fb7d8f0275dd14e8415331b6118cf97e6c` (`main == origin/main`). The immutable Core/Shell/Chat build and registered `modular-debian-dev` deployment completed successfully.
- The controller returned `DEPLOYED_AND_VERIFIED` for `https://aimarkethubs.com`; public routes `/chat?view=missions` and `/chat?view=tasks` both returned HTTP 200. The Chat sidebar entries route to those views on the DEV host. The prototype provides a Task Control execution workbench, Mission Control fleet view, area switching, and Back to Chat.
- All displayed execution values remain synthetic fixtures. This preview does not prove live Task or Mission integration and does not perform backend mutations.
- Exact build, route, health, target and remaining UAT evidence: [Task Control and Mission Control UI entry release](../../../../handoff/evidence/task-mission-control-ui-entry-release-20261116.md).

| UI entry status | Result |
| --- | --- |
| `DEV_UI_DEPLOYED` | `COMPLETE` — exact Platform SHA deployed through the registered target controller |
| `PUBLIC_ROUTE_CHECK` | `COMPLETE` — Task and Mission query routes return HTTP 200 |
| `AUTHENTICATED_BROWSER_UAT` | `UAT_PENDING` — normal signed-in click-through and responsive review remain outstanding |
| `LIVE_TASK_MISSION_INTEGRATION` | `PENDING` — synthetic UX preview is not live backend integration |

**Resume:** sign in normally at `https://aimarkethubs.com/login`, then select **Task Control** or **Mission Control** from Chat's left Menu tab. Direct DEV preview routes are `/chat?view=tasks` and `/chat?view=missions`.

## 2026-11-15 execution closeout — DEV migrated and deployed

The owner authorized autonomous development-only database administration and release. This section is the current status and supersedes earlier blocked/pending snapshots above; those snapshots remain as historical evidence. Production and `smartaihub.app` were not changed.

- **Integrated source identities:** SmartSpecPro current handoff revision `94cd3347cfd2059d1ba35351d5d557cda8353626` (`main == origin/main`); migration/admin-profile implementation source `40fa00bf8a6218502ec3762b0463ba3860e8df00`; Platform deployed source `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5`.

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

## 2026-11-18 Modular Debian Runner approval-link relay fix

The owner reported that Chat's **Create Runner approval link** control stayed at “request is still being processed” and never exposed a URL to open. The pairing-relay queue was checked only once per normal Runner loop, whose default refresh cadence is 300 seconds. The modular Runner now polls the relay independently every 15 seconds while idle/backing off; normal control refresh cadence remains unchanged.

- SmartSpecPro change `e0584cfa55b03d176815cf4a0d392955509e8135` (`main == origin/main`), limited to `apps/runner-app/src/diagnostics.rs`; focused `cargo check --manifest-path apps/runner-app/Cargo.toml --bin smartaihub-runner`, release build, and `git diff --check` passed.
- Installed only the Modular Runner executable used by `modular-debian-dev` / `aimarkethubs.com`; did not retarget or restart the legacy `smartaihub.app` Runner. The prior executable is retained at `/home/dev/modular-development-releases/runner-pairing-poll-e0584cfa55/smartsihub-modular-dev-runner.previous`. New executable SHA-256: `f9ef067d6fd8ecd235bcaf841b9981322eaef9a8550d04eed6b0e12d53705971`.
- `smartsihub-modular-dev-runner.service` restarted and remained active. Core journal then recorded successful `GET /api/runners/pairing-relay/poll` responses at 09:22:45, 09:22:50, 09:22:59, and 09:23:14 local time (HTTP 200; 19–25 ms). This proves the deployed Runner is checking for requests frequently; it does not prove a fresh approval request was created or approved in an authenticated browser.
- Existing Chat behavior opens a blank tab from the user gesture, redirects it when the Runner publishes a real `verificationUriComplete`, and renders that URL as a clickable link. The newly installed polling cadence should let the request complete promptly. Normal signed-in browser UAT is still required to confirm the end-to-end link appears and opens on the owner's browser. Do not invent a URL or approve pairing on the user's behalf.
- Runner control refresh separately logs `RUNNER_ACCESS_TOKEN_REQUIRED_FOR_CONTROL`; the pairing-relay poll itself returns 200. If Runner enrollment or subsequent execution remains unavailable after link approval, diagnose that control credential separately; do not confuse it with relay queue polling.

**Resume:** hard-refresh `https://aimarkethubs.com/chat`, click **Create Runner approval link**, and wait for the new-tab redirect or click the visible approval URL. Complete approval only on a device the owner controls. If the link still does not appear, capture the new UI state and matching Core/Runner timestamps; polling is now every 15 seconds, so a persistent wait indicates a different request/relay failure.

## 2026-11-18 Runner approval service 503 repair

The owner reported that opening a generated `/runner/approve` URL showed “The approval service is temporarily unavailable.” Runtime logs showed the approval endpoint returning 503 while relay polling was healthy. The database approval function still authorized through the Chat workspace guard, which does not recognize the reserved system tenant used by the System Admin account.

- Integrated SmartSpecPro source: `e6c791770f566d9c8e2fd68f09e3754a2ae40fb1` (`main == origin/main`). Migration `0450_modular_runner_system_admin_approval.sql` SHA-256: `c35161b144561ab7759bc83876c73fd20784d6f183ee5d42f54d79b4c2a68e2b`.
- The registered `pnpm --dir apps/web db:migrate` runner applied 0450 to the verified `modular-debian-dev` / `aimarkethubs.com` PostgreSQL `smartspec` target. Live ledger readback has migration row `id=430`, timestamp `1795000000000`, and the exact source hash above.
- Read-only catalog/ACL verification confirms the function remains owned by `modular_chat_mission_owner`; DEV auth can execute it; PUBLIC cannot; the owner has no standing `CREATE` on schema `public`; and the function calls `assert_modular_runner_pairing_access` rather than the old workspace guard. The migration uses a temporary schema CREATE grant and revokes it before commit.
- Focused migration regression test passed 3/3. `https://aimarkethubs.com/livez` and `/api/chat/livez` both returned HTTP 200 after the database change. No application/Runner release was required for this database-only fix; legacy `smartaihub.app` and Cloudflare production were untouched.
- Authenticated browser approval has not yet been re-performed, so `UAT_PENDING` remains. Reload the approval URL while it is still valid and sign in as the authorized System Admin before approving. If it has expired, create a fresh link in Chat and open its returned URL in a new tab. Do not reuse an expired pairing code.

| Status | Result |
| --- | --- |
| `APPROVAL_503_ROOT_CAUSE` | `FIXED` — wrong workspace authorization guard in the database approval function |
| `MIGRATED_DEV` | `COMPLETE` — 0450 applied by the registered runner; exact ledger/source hash matches |
| `APPROVAL_FUNCTION_ACL` | `VERIFIED` — restricted owner, runtime EXECUTE only, temporary schema CREATE revoked |
| `DEV_HEALTH` | `PASS` — Core and Chat livez return HTTP 200 |
| `APPROVAL_BROWSER_UAT` | `UAT_PENDING` — owner must confirm approval from an authenticated browser session |

## 2026-11-21 Task and Mission Control navigation on DEV

- The shared top navigation opens `/task-control` and `/mission-control` from Chat and from existing preview bookmarks. The Chat sidebar opens the same destinations with the selected workspace. Both routes preserve their destination through sign-in. The explicit prototype URLs retain their demo label and sample records.
- Task Control lists jobs attached to the selected authorized Mission. Mission Control reads the workspace Mission and Harness catalog. Execution links carry the exact Mission, conversation, Job, and Attempt to the read-only workbench. Core checks access on each request.
- Platform `4600db10d8be7949b72e358597f463ba3a0845cd` deployed to `modular-debian-dev` at 21:26 ICT. The registered release receipt is `/home/dev/modular-development-releases/modular-debian-dev-4600db10d8be7949b72e358597f463ba3a0845cd-live-control-nav/release-manifest.json`. Public Shell and Chat asset bytes match that artifact.
- The focused Shell and Chat checks passed 29 cases. Chromium clicked both headings on the deployed site at 1440×900, 820×1180, and 390×844 using intercepted session and API responses. It also verified the demo header exit and Mission → Task → Mission round trip. The public signed-out redirect preserved both destinations, and live Core rejected anonymous data requests with HTTP 401.
- Authenticated owner UAT remains pending. Verify both destinations with the owner's normal session and a workspace containing real Missions and Jobs. This release verifies the navigation change and does not certify complete execution evidence or Harness parity.

## 2026-11-22 Recorded Chat Jobs and explicit Missions on DEV

- Platform `c1fa8eb7b99f8ca9e5c89399b7e5559a67e54a46` is serving on `modular-debian-dev` as of 08:34 ICT. The registered controller returned `DEPLOYED_AND_VERIFIED`. The immutable release and rollback receipt are in `/home/dev/modular-development-releases/modular-debian-dev-c1fa8eb7b99f8ca9e5c89399b7e5559a67e54a46-chat-jobs/release-manifest.json`. The public Shell entry, live page chunk, and Chat manifest and entry matched local artifact bytes.
- Chat header and sidebar links carry the selected workspace and conversation. Task Control loads recorded Jobs directly from the authorized conversation projection. Its landing view selects the latest authorized conversation and exposes the recent conversation list. The exact execution link validates the returned workspace, conversation, Job, and Attempt. Mission-specific execution links retain their stricter Mission binding check.
- The Chat conversation inspector exposes **Create Mission for this conversation** and **Send messages to this Mission**. The latter is unchecked until the user selects it. The existing turn endpoint writes a canonical Job with the selected Mission. Read-only navigation makes no dispatch or Mission creation request. Existing ordinary Chat Jobs remain visible in Task Control.
- Migration `0451_modular_harness_projection_job_tenant_read` grants the restricted projection owner a column-level read of the Job tenant used in an existing join. The registered runner applied exact SHA-256 `f86167e9b2cd0db2d78f29dde7539dc9b22944831ea5639bbf48251ecb873033`. The Core DEV role retains function access and has no direct read of that column. The restricted function owner has no table-wide SELECT. A verified schema and ACL backup precedes the migration.
- Read-only DEV database verification through `modular_core_auth_dev` returned the reported conversation #304 Job `75a86f51-3ee7-45f7-94a8-53ea4d690d9d`, Attempt `6fecad26-7c3d-474a-8be9-473eeeaa47a8`, status `succeeded`, and one artifact reference. Conversation #304 had zero Missions. Harness projection returned successfully with zero authorized records for the same workspace.
- Scoped verification used the package profile against Platform `c1fa8eb7` on 2026-11-22 ICT. Shell ChatPage and live page tests passed 11 cases, Chat workspace and API passed 32, and Core auth and Chat service passed 42. Focused Shell and Chat TypeScript checks passed. Host evidence before the build showed 19,639 MiB available RAM and 348 GiB disk free. Chromium exercised the deployed Chat → exact Job/Attempt → explicit Mission creation → Mission Control flow at 1440×900, 820×1180, and 390×844 with intercepted fixture data. Anonymous Mission, Task and Harness reads returned 401.
- Owner browser UAT remains pending. Open Chat #304 and use **Task Control** for the existing Job. To verify Mission Control with real records, open conversation details, create a Mission, select **Send messages to this Mission**, and submit a message. The new Job should appear under the Mission. SPEC-224 Goal preparation and native Harness execution acceptance remain separate.
