# SPEC-224 writer lease and live runtime checkpoint

- Observed: 2026-10-28T14:37:47Z
- Canonical source: `1c3e57770260968a6666fd719bc2e30109fc8f55`
- Result: run/attempt lease implementation and connected PostgreSQL acceptance are integrated; the real Goal remains blocked before admission by expired server Runner state and rejected refresh credentials.

## Integrated implementation

The existing SPEC-293 `workspace_authority.py` database owns atomic execution leases bound to project, repository, internal authority workspace ID, Runner workspace ID, DevelopmentRun, Job, Attempt, tenant, actor, source SHA/fingerprint, finite write scope, fencing generation, expiry and renewal deadline. When the trusted SPEC-224 authorization service supplies the registered Runner workspace ID, the authority resolves only the single active canonical project workspace, verifies exact live SHA/fingerprint/dirty paths, and persists both identities in the lease. Validation, renewal, release, receipts and Runner-facing lease views preserve that binding. Existing authorization, shared budget/child hold, outbox release, Runner apply validation, renewal and terminal cleanup use the same lease.

## Verification

- `python3 -m unittest scripts.development-lifecycle.test_workspace_authority` — 74 passed, 1 skipped; includes distinct Runner and authority workspace identities.
- Disposable PostgreSQL connected production service test — 8/8 passed after changing the fixture to use two distinct persisted workspace IDs. Synthetic test receipts are not live evidence. Command:
  `python3 scripts/spec224_certification/run_disposable_postgres.py -- bash -lc 'cd apps/web && SPEC224_BASELINE_DATABASE_URL="$DATABASE_URL" corepack pnpm exec drizzle-kit migrate --config=drizzle.spec224-baseline.config.ts && RUN_DB_INTEGRATION_TESTS=true JWT_SECRET=spec224-test-secret-0123456789abcdef012345 corepack pnpm exec vitest run server/services/__tests__/spec224DelegatedChildContinuationPostgres.integration.test.ts'`
  Disposable image: `pgvector/pgvector:pg15@sha256:7f5681e45237acdf546cf7cdc0dfc0ed7752ede857fda6e54f6ea21b936f8742`.
- Focused authorization, revocation, Job Control and Runner dispatch suites — 179/179 passed.
- `git diff --check` — passed. Integrated commit: `1c3e57770260968a6666fd719bc2e30109fc8f55`.

## Development runtime and Runner evidence

- `smartspec-dev-web.service` is active from the existing development tunnel checkout; its startup identity is `1c3e57770260968a6666fd719bc2e30109fc8f55-dirty`, dev database mode is enabled, and `http://127.0.0.1:3100/healthz` returned 200. The unrelated dirty test file remains preserved. The development Web process loads `SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY=/home/dev/projects/SmartSpecPro`; no production service was changed.
- Development Web logs show the canonical PostgreSQL-pull runtime active with `external_agent_task` admitted. At inspection the development `worker_jobs` and `worker_job_outbox` tables each had zero rows. The separately installed production Node worker was not redirected or modified.
- The installed Runner identity remains `runner-f1328901deec1b147d200a818e12e4be`, version `0.2.51-spec224-probe-retry-20261028a`; local status reports Codex `0.165.0`, authenticated and task probe passed. This local probe is not server readiness.
- Last persisted dev-server Runner snapshot was observed at `2026-10-28T14:21:36.549Z`, expired at `14:26:36.549Z`, and points to source `a773f5482c64f42292d4a0dc5b986e97aaac3a1b`, not the current integrated revision. It reported 814 dirty paths and a passed but separately expiring Codex probe. No fresh server-applied capability ACK or matching current source snapshot was observed.
- After confirming no active local Runner executions, the same Runner process was restarted with its existing identity. Credential refresh was rejected with `RUNNER_CONNECT_REQUEST_REJECTED_401`. A reconnect request for that same Runner/device identity is pending owner approval; no new device or workspace was created. The systemd Runner service is stopped while the existing reconnect CLI waits for approval.

## Live acceptance still open

No Goal Grant was requested or approved, no Child Job was admitted to the development outbox, and no live Codex dispatch, execution receipt, settlement, automatic Child 2 or independent Final Verify exists. Safe source admission cannot be certified from the expired 814-path snapshot. After the owner approves the pending Runner reconnect, restore the existing Runner service, verify the fresh applied capability ACK and complete current dirty-path snapshot against `1c3e57770260968a6666fd719bc2e30109fc8f55`, then evaluate a bounded disjoint scope before creating/requesting the real Goal approval.
