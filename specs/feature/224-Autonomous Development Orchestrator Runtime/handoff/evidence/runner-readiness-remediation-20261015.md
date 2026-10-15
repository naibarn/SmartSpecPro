# SPEC-224 Runner readiness remediation — 2026-10-15

Source candidate: `11a2aa39df31f12d0668fd192da3731a0d29fcbc` (based on canonical `b38213f3d03df87b5b6e9eb82d56ae684f88ff1f`).

## Runtime and isolation

- Provisioned a new disposable PostgreSQL 15.17 container `codex-spec224-safe-pg-6df2850f` on private network `codex-spec224-safe-net-6df2850f` with per-run bind data under `/tmp/codex-spec224-safe-postgres-6df2850f/pgdata`.
- Container and network carry SPEC-224 ownership labels; PostgreSQL has no published port. A loopback-only proxy exposed port 55496 for the tests.
- Test database identity was `spec224-safe-6df2850f|spec224_d385_test|spec224_d385_runtime|PostgreSQL 15.17`; runtime role was non-superuser. Existing SPEC-224 baseline migration profile generated and applied missing schema migrations on this disposable database.
- The previous unknown-ownership `spec224-d385-pg` container/volume was not used.

## Passing evidence

All tests below ran from candidate SHA `11a2aa39df31f12d0668fd192da3731a0d29fcbc`, using the existing SPEC-224 quick verification profile (one Vitest worker). Resource samples showed 23,611–24,059 MiB available and no OOM signal.

- `server/services/__tests__/spec224RunnerContinuationPostgres.integration.test.ts`: 5/5 passed. Exercises PostgreSQL process restart, duplicate receipt replay, concurrent reconciliation, unknown outcome and revoked authorization, and a process boundary between canonical settlement and projection recovery.
- `server/services/__tests__/spec224RegisteredRunnerE2E.integration.test.ts`: 1/1 passed. Starts the registered Rust Runner binary against the existing ephemeral WebSocket control server and PostgreSQL repositories; this harness uses a deterministic loopback provider fixture and verifies that dispatch remains guarded without protected admission. It is not a Live Codex/Agents SDK turn, a protected remote Runner dispatch, or final independent verification.
- `server/services/__tests__/spec224DisposablePostgres.test.ts`: 6/6 passed before the candidate commit; container/database guards also ran within the registered Runner E2E above.
- `miniAppFactoryRunnerSettlement.test.ts`: 4/4 passed before the candidate commit.
- `drizzle-kit check --config drizzle.spec224-baseline.config.ts`: passed before the candidate commit.

## Remediation

`reconcileSpec224RunnerContinuations` now invokes Mini-App Factory stage settlement only for `mini_app_factory.stage` jobs. Canonical external-job settlement and DevelopmentRun projection reconciliation remain active for other job types. This repairs a PostgreSQL recovery failure where unrelated completed Runner jobs were incorrectly treated as Factory child runs and raised `FACTORY_RUNNER_STAGE_LINK_MISSING`.

The registered Runner E2E guard now validates an ownership-labeled per-run disposable PostgreSQL target and confirms the application DB singleton resolves to the expected database and runtime role. Its instructions no longer point at the old fixed port/container/volume.

## Remaining external gate

The existing protected dispatch gate remains fail-closed. A crash-mode attempt reached the canonical admission check and the job was terminalized with `DevelopmentRun protected dispatch is fail-closed until canonical admission commits a durable execution-start`. No owner-authorized live Runner grant bound to current Runner identity, capability snapshot, source revision, workspace, allowed operations, lease/fencing and expiry was available in the isolated test runtime. No grant was created or widened.

Next action: discover/provision an owner-authorized isolated Runner registration and matching protected dispatch grant. Then run the existing real Agents SDK + Codex subscription adapter path, crash/restart/quota resume, durable receipt reconciliation, and independent final verification. Keep Revision 24 hosted Mini-App/Gateway acceptance separate.
