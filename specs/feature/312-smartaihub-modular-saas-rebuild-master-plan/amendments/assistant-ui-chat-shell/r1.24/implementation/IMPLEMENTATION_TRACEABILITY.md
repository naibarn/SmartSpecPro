# SPEC-312 R1.24 Implementation Traceability

**Current disposition:** `PARTIAL / UAT_PENDING` · **Actual DEV migration:** `COMPLETE` · **Release:** `DEPLOYED_AND_VERIFIED` · **Task base:** SmartSpecPro `49ef6b47161889b7f686d231e98a2ef53c732bda` (`main == origin/main` at start) · **Integrated R1.24 implementation:** `847ed7baca5baf1c16817d65575fe0dea71f94dd` (`main == origin/main`) · **Platform base:** `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5`

| Requirement | Implementation / evidence | Result | Remaining action |
| --- | --- | --- | --- |
| R1.24-01 credential exposure | Prior disclosure principal is `smartspec_dev`; local env/backup bindings identified by secret metadata only. Active systemd unit metadata points at separate `smartspec` credentials. No approved rotation/secrets authority was found for the remote Debian DB; no credential was reused, printed, rotated or revoked. | `CREDENTIAL_ROTATED: PENDING` | Authorized DBA maps/audits consumers, rotates/revokes through approved authority, updates only mapped bindings and verifies reconnection. |
| R1.24-02 least-privilege migration identity | 0441 preflights exact login `smartspec_migrator_dev`, non-superuser/no role-admin/no DB-create/no replication/no bypass-RLS/no-inherit flags, prepared NOLOGIN owner role, required short-lived database/schema/ledger/FK grants, owner reads, and existing Task Control ownership. No role DDL or self-membership grant remains. | `IMPLEMENTED` | Provision/login binding exists only in the documented DBA runbook; not present in actual DEV yet. |
| R1.24-03 PostgreSQL 15 privilege semantics | Exact PG15.17 disposable cluster proved that `NOINHERIT` membership does not permit replacing a function owned by another role. DBA must transfer Task Control to migration login before runner invocation; 0441 transfers it back to the function owner. | `TESTED_PG15` | Confirm the same owner and ACL state in actual DEV immediately before migration. |
| R1.24-04 migration sequencing and runner | On synthetic PG15.17, executed actual 0439 then 0440 sources, recorded their computed source hashes/timestamps, then used registered `pnpm --dir apps/web db:migrate` as non-superuser `smartspec_migrator_dev` to apply actual 0441. Successful runner receipt at `2026-11-15T14:33:58Z`; 0441 ledger hash `c242049230d02d298398acb3d206d4d6aea3f386e4135a098a9b6cf67d37a0aa`, timestamp `1794770000002`. | `TESTED_PG15` on disposable fixture only | Revalidate live 0439/0440 hashes and 0441 absence; run registered runner against authorized DEV secret. |
| R1.24-05 table/functions/ACLs | Synthetic PG15 postcondition queries: seven validated table constraints (PK, unique, FKs and checks); owner role on all Mission/Task functions; `SECURITY DEFINER`; fixed `pg_catalog, public`; PUBLIC EXECUTE false; DEV runtime EXECUTE true; runtime direct `worker_jobs` SELECT false; owner broad table SELECT false and needed column SELECT true. | `TESTED_PG15` | Repeat exact readback against actual DEV after migration. |
| R1.24-06 customer/Job correlation and Task repair | Auth-role runtime fixture verified idempotent Mission creation, independent `active` Mission lifecycle beside a `succeeded` canonical Job, Job/Run/Attempt/Event/Artifact linkage, empty unavailable Agent IDs, cross-workspace and cross-environment denial, and Task `updated_at` computed from finished/heartbeat/started/created. Test-only wrapper compared returned Task timestamp to that canonical expression. One Job remained; one Mission persisted. | `TESTED_PG15` on synthetic fixture | Exercise with actual authorized Modular DEV identity after release. |
| R1.24-07 bootstrap and transaction rollback | Removing owner-role membership made the exact 0441 preflight fail with `MIGRATION_BOOTSTRAP_REQUIRED`. A test-only Drizzle migration intentionally failed after `CREATE TABLE`; PostgreSQL rolled back the table and ledger remained at three applied rows. | `TESTED_PG15` | None for fixture. Preserve normal live recovery/rollback controls. |
| R1.24-08 live migration and release | R1.23's last live observation showed PG15.17, 0439/0440 applied and 0441 absent. No new live DB read/mutation was attempted with the compromised application credential. No release controller was run. | `MIGRATED_DEV: BLOCKED`; `DEPLOYED_DEV: PENDING` | Complete DBA/secret steps, actual DB migration and readback, then exact-SHA `modular-debian-dev` release and runtime health. |
| R1.24-09 authenticated user acceptance | No normal authenticated MFA browser session or new deployed runtime exists. SPEC-277 owner API was not checked by Modular fixture evidence. | `RUNTIME_VERIFIED: PENDING`; `UAT_VERIFIED: PENDING` | Verify normal MFA Mission flow after release; test owner API separately on its actual deployment. |

## Scoped verification record

- **Profile:** `integration` (isolated database + registered migration runner + runtime SQL fixture).
- **Source:** integrated SmartSpecPro implementation SHA `847ed7baca5baf1c16817d65575fe0dea71f94dd`; migration SHA-256 `c242049230d02d298398acb3d206d4d6aea3f386e4135a098a9b6cf67d37a0aa`.
- **Target:** disposable local PostgreSQL `15.17 (Debian 15.17-1.pgdg13+1)` on loopback port `55439`; no application data copied. Fixture contained only synthetic schema/rows and the three executed migration ledger records.
- **Command/scope:** `pnpm --dir apps/web db:migrate` with development-only localhost fixture metadata; actual registered wrapper and Drizzle Kit runner applied only pending 0441. Runtime SQL executed as `modular_core_auth_dev`; catalog/ACL checks executed by the disposable-cluster admin.
- **Time/outcome:** `2026-11-15T14:33:58Z`, pass. Focused role, ACL, constraints, runtime isolation/correlation and rollback assertions passed. No local repository-wide typecheck was run.
- **Resource evidence:** host memory admission was not captured for this scoped run; the test completed normally without OOM, SIGKILL or exit 137.
- **Credential scanning:** prior incident investigation outputs were redacted. Do not interpret the earlier timed-out repository-wide scan as a clean pass; the task-scoped source/evidence review found no credential values.

## Applied migration hashes in disposable evidence

| Tag | SHA-256 | Journal timestamp |
| --- | --- | ---: |
| `0439_modular_chat_output_artifacts` | `d03fcb18c80b2d035cf7a8bac5d696fe5164c0ad6b4aaa0e81e520e58315e4a8` | `1794770000000` |
| `0440_seedream_5_5_unified_model` | `141f197c9c5c0f9b584691ad6e5001ecd194105aa0479a6fdc7b33b4e389c784` | `1794770000001` |
| `0441_modular_chat_missions` | `c242049230d02d298398acb3d206d4d6aea3f386e4135a098a9b6cf67d37a0aa` | `1794770000002` |

## 2026-11-15 authority and DEV recheck

- **SmartSpecPro:** `f137f228048e17de7ace02528ffe4a0e26d1b3ab` (`main == origin/main`). **Platform:** `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5` (`main == origin/main`). Unrelated dirty worktree changes were preserved.
- Registered target and release receipt still identify `modular-debian-dev`, `aimarkethubs.com`, `smartspec`, and source release `ca4f5a58dd7f7cc29db97bea0aebf0dd95362eb2`. Public `/livez`, `/api/chat/livez`, and `/login` each returned HTTP 200. No new deployment occurred; public health does not establish migrated Mission Control readiness.
- Recomputed source SHA-256: 0439 `d03fcb18c80b2d035cf7a8bac5d696fe5164c0ad6b4aaa0e81e520e58315e4a8`; 0440 `141f197c9c5c0f9b584691ad6e5001ecd194105aa0479a6fdc7b33b4e389c784`; 0441 `c242049230d02d298398acb3d206d4d6aea3f386e4135a098a9b6cf67d37a0aa`. The first two values are source hashes matching the earlier fixture evidence, not freshly queried live ledger hashes. Live 0441 absence is unverified.
- Authority search found no registered DBA or secret-management interface for this remote Debian PostgreSQL cluster. Local `migration-v1.json` reports `migratedHomeCount: 0` and is not credential authority. No compromised credential was accessed. `psql` availability alone is not DBA authority.
- `CREDENTIAL_ROTATED: BLOCKED`; `DBA_BOOTSTRAPPED: BLOCKED`; `MIGRATED_DEV: BLOCKED`; `DEPLOYED_DEV: PENDING` (preserved release `ca4f5a58`); `RUNTIME_VERIFIED: PARTIAL` (public shell/chat/core health only); `UAT_VERIFIED: UAT_PENDING`; `SPEC_ACCEPTANCE: PENDING`.
- **Resume condition:** the authorized PostgreSQL DBA and secret-binding owner must rotate/revoke `smartspec_dev`, provision and bind `smartspec_migrator_dev`, and perform live preflight. Then follow [DBA_MIGRATION_BOOTSTRAP.md](../DBA_MIGRATION_BOOTSTRAP.md) without changing migration 0441; apply/revoke the documented scoped privileges, verify ledger/schema/ACL, and only then release and run authenticated UAT.

## 2026-11-15 single-owner policy and live-target evidence

The owner has authorized normal DEV database administration and deployment by Codex. This supersedes the earlier organizational-DBA/secret-manager blocker; it grants no production authority. The authoritative policy is `SINGLE_OWNER_DEV_ADMIN_MODE` in `../spec.md`, and the operator procedure is `../DBA_MIGRATION_BOOTSTRAP.md`.

- **Source/target:** SmartSpecPro `97fe0b329e985987d8fbca97b0d4da66b93a4746 == origin/main`; Platform `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5 == origin/main`; registered target `modular-debian-dev`, `aimarkethubs.com`, DB `smartspec`, Debian/local Workerd. Unrelated dirty work was preserved.
- **Read-only live verification:** protected local checkpoint binding mode 0600; actual database `smartspec`; PostgreSQL `15.17`; connected role `smartspec`, `rolsuper=true`; live ledger 0439 hash `d03fcb18c80b2d035cf7a8bac5d696fe5164c0ad6b4aaa0e81e520e58315e4a8` at `1794770000000`, 0440 hash `141f197c9c5c0f9b584691ad6e5001ecd194105aa0479a6fdc7b33b4e389c784` at `1794770000001`; 0441 absent; Mission table and restricted owner role absent. The exposed `smartspec_dev` principal is still a superuser, has active local consumers, and currently owns the Task Control projection; no exposed value was read or reused.
- **New source preflight:** exact target ID/domain/database/environment, explicit admin profile marker, actual login/superuser status and PG15 are required. Exact 0439/0440 hashes/timestamps, 0441 absence, and latest-head position are verified before invoking Drizzle. Focused Vitest `scripts/__tests__/sharedTenantDevMigrationTarget.test.ts`: 17 passed. Migration 0441 hash after the admin-profile change: `feaea1d8c41d61b53bc2f9cbaaa630dc9583cbc9454267c2e98fc0ffcb80db0b`.
- **Remaining:** credential rotation and mapped-consumer reconnection; schema backup; restricted owner-role bootstrap; registered live migration and exact postconditions; immutable source build and registered modular DEV release; Core/Chat/Shell plus Mission/Task/artifact runtime checks; authenticated MFA UAT when a normal browser session is available. No schema mutation, live migration, release, or UAT is claimed by this evidence.

| Status | Current result |
| --- | --- |
| `CREDENTIAL_ROTATED` | `PENDING` |
| `DBA_BOOTSTRAPPED` | `PENDING` |
| `MIGRATED_DEV` | `PENDING` |
| `DEPLOYED_DEV` | `PENDING` — current preserved source remains `ca4f5a58` |
| `RUNTIME_VERIFIED` | `PARTIAL` — public basic health only |
| `UAT_VERIFIED` | `UAT_PENDING` |
| `SPEC_ACCEPTANCE` | `PENDING` |


## 2026-11-15 single-owner DEV execution evidence

This is the latest authoritative execution status. Prior blocked reports remain as historical snapshots and are superseded by the evidence below.

- **Integrated revisions:** SmartSpecPro current `94cd3347cfd2059d1ba35351d5d557cda8353626` (`main == origin/main`); migration/admin-profile implementation `40fa00bf8a6218502ec3762b0463ba3860e8df00`; Platform deployed `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5` (`main == origin/main`).

- **Credential:** rotated `smartspec_dev` using the verified DEV administrator path; old secret invalidated, mapped mode-0600 local bindings refreshed, and consumers reconnected. Secret values were not emitted.
- **Database preflight:** exact target `modular-debian-dev`, domain `aimarkethubs.com`, database `smartspec`, PostgreSQL 15.17, authenticated superuser identity. Ledger 0439=`d03fcb18c80b2d035cf7a8bac5d696fe5164c0ad6b4aaa0e81e520e58315e4a8` / `1794770000000`; 0440=`141f197c9c5c0f9b584691ad6e5001ecd194105aa0479a6fdc7b33b4e389c784` / `1794770000001`; 0441 absent at preflight.
- **Backup:** `/home/dev/.config/smartspec-dev/backups/spec312-r124-pre-0441-20261115T160007Z.dump`, mode 0600, verified listing, SHA-256 `d6a66e4dfa58ff44df12985ebda203895179be72548a95af3b6d388a511f2bcb`.
- **Migration:** registered `pnpm --dir apps/web db:migrate` succeeded using profile `single-owner-dev-admin` and the dedicated marker. Live 0441 hash `feaea1d8c41d61b53bc2f9cbaaa630dc9583cbc9454267c2e98fc0ffcb80db0b` at `1794770000002`; receipt `/home/dev/.config/smartspec-dev/backups/spec312-r124-0441-migration-receipt.jsonl`. Mission table exists with seven constraints. All three functions have restricted owner `modular_chat_mission_owner`, `SECURITY DEFINER`, `pg_catalog, public` search path, PUBLIC EXECUTE false and DEV runtime EXECUTE true. Runtime direct SELECT on `worker_jobs` is false; broad owner SELECT false; required narrow source reads true; temporary owner schema CREATE false.
- **Deployment:** immutable Platform source SHA `9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5`; canonical source lease build and artifact at `/home/dev/modular-development-releases/modular-debian-dev-9755c2ea9c1c0bf8155d795ae5bbe288ab4672b5-r124-mission-control`; target-gated controller result `DEPLOYED_AND_VERIFIED` at `2026-11-15T16:19:58Z`. Core/Chat/Shell and module manifest/entry local smoke passed; public shell root/login/chat health/manifest passed; anonymous session returned 401. Rollback config and service drop-in backups are retained under the artifact.
- **Endpoint boundary checks:** local GET of `/v1/core/chat/conversations/1/missions`, `/v1/core/chat/conversations/1/task-control`, and `/v1/core/chat/conversations/1/artifacts` returned 401 without a session, confirming authentication boundaries only. They do not establish authenticated response correctness. The extra urllib public probes returned edge 403, but registered controller public smoke and local curl checks passed.
- **Build:** Core, Shell, Chat builds and Wrangler dry-runs passed; Chat main JS chunk warning at 537.66 kB minified (non-blocking). No repository-wide typecheck was run.
- **UAT:** no normal signed-in MFA browser context was available. Mission creation/stable ID refresh, signed-in Task/Artifact reads, cross-workspace denial, no duplicate dispatch, and responsive authenticated UI remain `UAT_PENDING`. No production or legacy target was used.

| Status | Current result |
| --- | --- |
| `CREDENTIAL_ROTATED` | `COMPLETE` |
| `DBA_BOOTSTRAPPED` | `COMPLETE` |
| `MIGRATED_DEV` | `COMPLETE` |
| `DEPLOYED_DEV` | `DEPLOYED_AND_VERIFIED` |
| `RUNTIME_VERIFIED` | `PARTIAL` — health, asset delivery, and anonymous-denial boundary proven; signed-in behavior pending |
| `UAT_VERIFIED` | `UAT_PENDING` |
| `SPEC_ACCEPTANCE` | `PENDING` — remain open pending normal MFA UAT |

## 2026-11-18 Runner approval-link relay follow-up

| Requirement | Implementation / evidence | Result | Remaining action |
| --- | --- | --- | --- |
| Chat admin can create a Runner approval link and open it in a new browser tab | Existing Chat client opens a tab synchronously on the click and redirects it to the Runner-provided verification URL; it also renders the returned URL as an anchor. Modular Runner previously consumed relay requests only on the 300-second normal refresh loop. Commit `e0584cfa55b03d176815cf4a0d392955509e8135` changes `apps/runner-app/src/diagnostics.rs` to poll the relay every 15 seconds while idle, without changing normal control refresh. | `IMPLEMENTED_AND_INSTALLED`; Runner service active; relay polls returned HTTP 200 at approximately 15-second cadence | Owner browser UAT: hard-refresh Chat, create a fresh request, verify the URL appears and opens in the new tab, then complete pairing. No fresh authenticated request/approval was performed by this change. |
| Keep legacy Runner and production isolated | Installed the binary only to `smartsihub-modular-dev-runner.service` for `modular-debian-dev` / `aimarkethubs.com`; legacy Runner and Cloudflare production were untouched. Previous Modular Runner binary retained for rollback. | `PASS` | None. |

**Focused verification:** profile `package`; `cargo check --manifest-path apps/runner-app/Cargo.toml --bin smartaihub-runner`, release binary build, and `git diff --check` passed. Deployed binary SHA-256 is `f9ef067d6fd8ecd235bcaf841b9981322eaef9a8550d04eed6b0e12d53705971`. Runtime journal showed relay poll HTTP 200 at 09:22:45, 09:22:50, 09:22:59, and 09:23:14 (Asia/Bangkok), after service restart. These are relay availability/polling checks, not authenticated UI approval evidence.

**Current handoff:** click the Chat sidebar control after a hard refresh. A genuine fresh pairing URL is produced only after the Runner claims the request; the browser then opens/navigates its tab to the returned verification URI. Authenticated browser confirmation remains `UAT_PENDING`. A separate `RUNNER_ACCESS_TOKEN_REQUIRED_FOR_CONTROL` warning was observed on the Runner's normal control refresh and should be investigated only if it prevents post-pairing enrollment/execution; relay polling currently succeeds.

## 2026-11-18 Runner approval service 503 repair evidence

- **Root cause:** the live `approve_modular_runner_pairing(jsonb)` function used the Chat workspace authorization guard, which rejected the reserved system tenant for System Admin approval. The endpoint surfaced that failure as HTTP 503 even though approval-link relay polling worked.
- **Integrated SmartSpecPro:** `e6c791770f566d9c8e2fd68f09e3754a2ae40fb1` (`main == origin/main`). Migration 0450 source SHA-256: `c35161b144561ab7759bc83876c73fd20784d6f183ee5d42f54d79b4c2a68e2b`.
- **DEV target:** `modular-debian-dev`, `https://aimarkethubs.com`, PostgreSQL database `smartspec`. Registered `pnpm --dir apps/web db:migrate` completed successfully. Read-only live ledger confirms `id=430`, timestamp `1795000000000`, exact migration source hash.
- **Postconditions:** approval function is owned by `modular_chat_mission_owner`, calls `assert_modular_runner_pairing_access`, grants execution to `modular_core_auth_dev`, denies PUBLIC execution, and leaves no schema CREATE privilege on the restricted owner. No production or legacy service was changed.
- **Verification:** `runnerSystemAdminApprovalMigration.test.ts` passed 3/3; public `/livez` and `/api/chat/livez` returned 200; live catalog/ACL checks passed. No repository-wide typecheck was run.
- **Acceptance:** authenticated approval click-through after this fix remains `UAT_PENDING`; overall SPEC-312 remains open. Use a fresh pairing link if the prior code expired.
