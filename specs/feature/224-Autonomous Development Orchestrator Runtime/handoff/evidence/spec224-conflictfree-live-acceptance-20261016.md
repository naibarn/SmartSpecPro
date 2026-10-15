# SPEC-224 conflict-free live acceptance continuation — 2026-10-16

## Source and ownership

- Canonical ref fetched without merge/rebase: `origin/main` at `3738a0b2cbd4031265f10bc82a24561e9aa8b8f9`.
- Isolated task branch: `codex/spec224-live-acceptance-20261016-81c3d99524`.
- Worktree: `/mnt/SmartSpecDev/.tmp/spec224-live-acceptance-20261016-81c3d99524`.
- Existing workspace authority registration: `workspace:7c7ee30b-2255-4139-bc8e-37a5764d55cb`; task `SPEC224_REAL_RUNNER_ACCEPTANCE_20261016_81c3d99524`.
- Primary checkout and other worktrees were not edited. The shared SPEC-224 handoff `manifest.json`, `history.jsonl`, and generated `STATUS.md` were dirty in other worktrees and remain untouched.

## Coordination findings

- The requested ledger `/home/dev/.codex/coordination/smartaihub-20260926/active-work-ledger.md` is absent; no replacement ledger was found in the configured coordination directory. The existing `.git/workspace-authority.sqlite3` was used instead.
- The workspace registry contained 620 records after task registration. SPEC-224 records with old/expired leases and missing PIDs were preserved; none was adopted. Two worktrees had dirty handoff files (`spec224-quota-admission-20261015` and `/tmp/spec224-acceptance-8ae`) and were not touched. The unrelated `adaptive-acceptance-fixed-20261014` worktree was also dirty and untouched.
- The registered SPEC-224/Runner worktrees were checked directly; no live owner PID/lease was found for the old task records. A broad all-worktree status sweep was stopped after sustained shared-host I/O; unrelated registered workspace dirty counts were read from the existing registry. This limits the detailed dirty-file inventory to the SPEC-224/Runner scope and the primary checkout.
- PR #961 is open Draft, has no assignee/reviewer, and covers Mini-App preview provisioning; its paths do not overlap this patch. PR #944 is open Draft, has no assignee/reviewer, and its CI candidate gate plus baseline jobs fail; its paths do not overlap this patch. No GitHub Actions runs were queued or in progress during the check.
- Read-only aggregate inventory of the local Docker Compose development database (`smartspec` / PostgreSQL 15.17) found zero nonterminal `worker_jobs`, zero live outbox leases, and zero unpublished uncancelled outbox rows. No job data was modified. Production databases were not accessed.

## Runtime readiness and authority

- `smartaihub-runner status` reports local Runner `local-runner`, version `0.2.23`, contract `sah-runner-v1`, connect schema `sah-runner-connect-v2`, `toolCount=11`, `readyToolCount=0`, and `state=ready`. The Codex tool is installed but reports `auth_state=unknown`, `availability_state=unknown`, `trust_state=discovered`, and `probe_required`.
- `smartaihub-runner.service` is `inactive` and `disabled`; no local Runner process is running. It was not enabled, restarted, or reconfigured. `codex login status` reports a ChatGPT login, which does not establish Runner adapter authentication or dispatch authority.
- Docker Engine 29.2.0 is available. The shared `smartspec-postgres` and `smartspec-control-plane` containers were not modified. Old exited SPEC-224 containers, including the ownership-unknown `a1b2c3d4` run, were not reused.
- `SPEC224_PROFILE_ID`, `SPEC224_TEST_RUNNER_TOKEN`, `SPEC224_RUNNER_ID`, and `SPEC224_DISPATCH_GRANT_ID` are absent. No owner-authorized live Runner registration, fresh capability snapshot, or protected-start grant bound to the current source/workspace/lease/fencing was available. No authorization was created or widened.

## Unique disposable PostgreSQL target

- Run ID `fca1d657`; container `codex-spec224-safe-pg-fca1d657`; internal network `codex-spec224-safe-net-fca1d657`; unique bind-mounted data path `/tmp/codex-spec224-safe-postgres-fca1d657/pgdata`.
- Container/network labels bind them to `spec224-safe-postgres-admission` and the run ID. The container publishes no PostgreSQL port; a run-owned proxy binds only `127.0.0.1:55401`.
- Target identity: `spec224-safe-fca1d657|spec224_d385_test|spec224_d385_runtime|PostgreSQL 15.17`.
- Database is `spec224_d385_test`; migration and runtime roles are separate and non-superuser. The runtime role has no database or schema CREATE privilege. Database ownership remains `postgres`; no shared database was used.
- Existing read-only target preflight passed as `PREFLIGHT_PASS_NOT_APPROVAL` before migrations. Existing SPEC-224 baseline migration command completed successfully; `drizzle-kit check --config drizzle.spec224-baseline.config.ts` passed. The repository's existing `assertSpec224DisposableDatabaseUrl` and `assertSpec224OwnedPostgresContainer` guards passed for the target.
- A first migration-role grant attempt left the runtime role without table privileges; the first recovery test exposed `permission denied for table users`. Grants were corrected as the migration-role owner inside this disposable DB, and verification then showed runtime table access while `database_create=false`, `public_create=false`, and `rolsuper=false`.

## Acceptance-critical fix

The real PostgreSQL target preflight exposed that `inet_server_addr()::text` returns CIDR text such as `192.168.128.2/32`, while the target contract requires a plain IP address. This falsely blocked a correctly bound disposable target. The query now uses PostgreSQL `host(inet_server_addr())`; the existing unit test asserts the normalized query. No authorization check or production path was changed.

## Verification evidence

All commands ran against source SHA `3738a0b2cbd4031265f10bc82a24561e9aa8b8f9` plus the local preflight patch, using the `quick` profile and one Vitest worker where applicable.

| Check | Result | Evidence boundary |
|---|---:|---|
| `spec224-postgres-preflight.test.ts` | 23/23 passed | Unit policy coverage |
| Live read-only preflight against the new target | `PREFLIGHT_PASS_NOT_APPROVAL` | Target isolation/least-privilege check before schema replay |
| SPEC-224 baseline migration | Passed | Disposable database only |
| `drizzle-kit check --config drizzle.spec224-baseline.config.ts` | Passed | Baseline schema/migration consistency |
| `spec224RunnerContinuationPostgres.integration.test.ts` | 5/5 passed after role-grant repair | PostgreSQL process-boundary receipt/recovery; not a real provider turn |
| `spec224DeveloperFastLaneE2E.integration.test.ts -t 'three-day capacity wait|multi-day provider reset'` | 2 passed, 19 skipped | Injected-clock/test provider only; not a live Codex quota reset |
| `git diff --check` | Passed | Local patch whitespace/conflict-marker check |

The initial Vitest invocation used unsupported `--minWorkers`; it did not execute tests. The next run identified the disposable runtime role privilege gap noted above. After correcting the role grants, the process-boundary suite passed 5/5. These were harness/environment invocation issues, not code regressions.

The fast-lane multi-day cases used the existing fixture-owned local PostgreSQL harness and cleaned it on completion. They are explicitly not live quota-reset evidence.

## Acceptance status and resume condition

**SPEC-224 remains PARTIAL; completion is not eligible.** No real Codex subscription turn through an authorized Protected Runner, protected Runner receipt, live quota reset, independent final verification, or live durable settlement was produced. The registered Rust Runner E2E was not relabeled as live evidence.

Resume only when the existing authority owner provisions an isolated non-production Runner registration with a fresh heartbeat/capability snapshot (including Codex adapter auth/readiness) and a matching protected-start grant. Bind it to this run's source revision `3738a0b2cbd4031265f10bc82a24561e9aa8b8f9`, workspace `workspace:7c7ee30b-2255-4139-bc8e-37a5764d55cb`, the profile's protected `Runner dispatch` operation, exact DevelopmentRun/job/attempt, lease/fencing generation, budget, and expiry/revocation. Supply the non-secret profile ID and the protected runtime token through the existing secret channel. Then run the existing registered Runner E2E, real Agents SDK + Codex turn, crash/restart/resume and receipt reconciliation, followed by Independent Final Verification and settlement readback. Keep Revision 24 Hosted Mini-App/Gateway acceptance separate.
