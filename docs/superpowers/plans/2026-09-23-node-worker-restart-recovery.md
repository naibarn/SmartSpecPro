# Node Worker Restart Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect active canonical jobs from false watchdog restarts and make hard-cutover Vertical Drama prompt jobs use `worker_jobs` only.

**Architecture:** Use the existing `worker_jobs` lease as the durable liveness signal. The watchdog and TypeScript recovery policy require no valid active lease before restarting for a stale process heartbeat. Under hard cutover, prompt submit/status/execute uses `worker_jobs` directly and returns business output to `worker_jobs.outputJson`; Redis/BullMQ remains compatibility-only when the legacy flag is off.

**Tech Stack:** Node.js 22, TypeScript, Drizzle/PostgreSQL, ioredis, Vitest, systemd shell watchdog.

**Spec:** `docs/portable-skill-pack/specs/2026-09-23-node-worker-restart-recovery-design.md`

## Global Constraints

- Preserve canonical `worker_jobs`, attempts, events, dispatches, outbox, and settlements as the only durable execution authority.
- Do not introduce a second queue, lease, settlement ledger, or retired workflow/OpenSandbox integration.
- Preserve unrelated dirty-worktree changes and edit only owned paths.
- Do not run repository typecheck because of the project RAM rule.
- Do not restart or deploy `smartspec-node-worker.service` from this change.

## Review Focus

- A stale file heartbeat with a valid active lease must not restart the worker — `nodeWorkerRecoveryPolicy.test.ts`.
- A stale file heartbeat with no valid lease must still restart — `nodeWorkerRecoveryPolicy.test.ts`.
- SIGTERM must stop new claims and wait for active canonical executions — `nodeWorkerShutdown.test.ts`.
- Hard-cutover prompt execution must not require a Redis projection; canonical status/output mapping is covered by the prompt service and control-plane paths.
- Shell watchdog SQL must expose valid active leases and apply the same restart guard — static shell assertions and targeted source check.

## Requirement-to-test matrix

| Requirement | Level | Test/evidence | Expected RED before implementation | Residual boundary |
|---|---|---|---|---|
| Valid active lease protects against stale process heartbeat | Unit | `server/jobs/nodeWorkerRecoveryPolicy.test.ts` | Policy returns restart for stale heartbeat despite active lease | Does not prove systemd ran the updated script |
| Expired/no active lease still recovers | Unit | Same test file | No explicit lease field exists | Does not prove actual process liveness |
| Shutdown drains active promises within bound | Unit | `server/jobs/nodeWorkerShutdown.test.ts` | Helper/controller absent | Does not prove a real provider honors shutdown |
| Hard-cutover prompt paths use worker_jobs status/output | Unit/contract | prompt services + executor registry | Redis projection was required | Requires DB-backed runtime proof after deployment |
| Shell watchdog matches lease-protection policy | Static | `rg` assertions over `scripts/smartspec-node-worker-watchdog.sh` | No `active_lease_valid_count`/guard | Requires runtime journal after deployment for final proof |

### Task 1: Lease-aware recovery policy

**Files:**
- Modify: `apps/web/server/jobs/nodeWorkerRecoveryPolicy.ts`
- Test: `apps/web/server/jobs/nodeWorkerRecoveryPolicy.test.ts`
- Modify: `apps/web/server/jobs/postgresNodeJobWorker.ts`
- Modify: `scripts/smartspec-node-worker-watchdog.sh`

- [ ] Add `activeLeaseValidCount` to the health snapshot and make stale-heartbeat restart conditional on it being zero.
- [ ] Add red/green tests for valid-lease protection and expired-lease recovery.
- [ ] Include `activeLeaseValidCount` in worker queue health SQL and shell watchdog SQL/logging.

### Task 2: Graceful canonical worker shutdown

**Files:**
- Create: `apps/web/server/jobs/nodeWorkerShutdown.ts`
- Test: `apps/web/server/jobs/nodeWorkerShutdown.test.ts`
- Modify: `apps/web/server/jobs/postgresNodeJobWorker.ts`

- [ ] Add a bounded `waitForNodeWorkerExecutions` helper with drained/timed-out outcomes.
- [ ] Stop claims on SIGTERM/SIGINT and wait for tracked canonical executions before process exit.
- [ ] Add tests for drain completion and timeout behavior.

### Task 3: Shot prompt worker_jobs authority

**Files:**
- Modify: `apps/web/server/services/verticalDramaShotPromptJobs.ts`
- Test: `apps/web/server/services/__tests__/verticalDramaShotPromptJobs.test.ts`

- [ ] Read prompt status and active jobs from `worker_jobs` when hard cutover is enabled.
- [ ] Execute the protected resolver directly under a worker execution token.
- [ ] Return the business result so `worker_jobs.outputJson` is authoritative.

### Task 4: Verification and review

- [ ] Run the focused Vitest files for policy, shutdown, and both prompt services.
- [ ] Run shell syntax/static assertions and `git diff --check`.
- [ ] Inspect only owned diffs and report runtime/systemd proof boundary.
