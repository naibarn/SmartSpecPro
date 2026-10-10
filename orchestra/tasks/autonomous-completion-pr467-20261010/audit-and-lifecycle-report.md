# Autonomous Completion Architecture — Audit and Lifecycle Report

Audit source: PR #467 RFC, canonical `origin/main` at `26df7b3a341370063fff65b0d0ee21057ac6d232`, repository state observed 2026-10-10. This report is a point-in-time audit, not an implementation or production certification.

## Canonical ownership and status

| Spec | Canonical scope | Handoff status at audit | Gap relevant to RFC |
|---|---|---|---|
| SPEC-224 | Goal-to-implementation, dependency progress, repair/replan, integration, verification, Git lifecycle reconciliation | `DORMANT_UNRESOLVED` / `WAITING_APPROVAL`; 0/1244 passed | Runtime contract has durable partial slices; protected dispatch remains denied pending Windows Runner, remote-trust, owner, economics, and persisted-proof evidence. |
| SPEC-226 | Existing task-control bridge/API | `DORMANT_VALID` / `MAINTENANCE_ONLY`; 0/309 passed | Narrow bridge exists; no approved upgrade work unit is active. |
| SPEC-267 | Durable job ledger, scheduler, leases/fencing, capacity and recovery | `DORMANT_UNRESOLVED` / `DISCOVERING`; 0/362 passed | Canonical `worker_jobs` plus outbox and reconciler already exist; do not create a competing scheduler/state machine. |
| SPEC-269 | Goal understanding, delegation and bounded decision authority | `ACTIVE_CANONICAL` / `PARTIAL_INTEGRATED`; 0/1677 passed | Direct T-01–T-23 acceptance remains next; preserve its current work and trust boundaries. |
| SPEC-276 | Execution capability, sandbox/agent adapters and runner protocol | `DORMANT_UNRESOLVED` / `DISCOVERING`; 0/236 passed | PR #438 is already proposing an R1.4 guardrail amendment; its files are excluded from this change. |
| SPEC-277 | User-facing task progress, machine status and exception-focused UX | `DORMANT_UNRESOLVED` / `DISCOVERING`; 0/429 passed | AutoTeam projection is integrated, but its handoff says evidence adapter and direct implementation work remain. |

Generated `handoff/STATUS.md` files were read as projections; no generated status or manifest was edited. Registry contains Feature 077, “Distributed Worker Fabric Completion” (67 open requirements), which already owns worker registration/heartbeat/claim/artifacts, runtime-generalized scheduling, desktop worker hosting and local worker profiles. Because RFC's proposed cross-machine enrollment, connectivity, capability and portable-artifact scope touches that existing fabric, no new Spec number was allocated. The exact boundary requires a follow-up reconciliation between SPEC-077, SPEC-267, SPEC-276 and the RFC before a new spec is justified.

## Existing implementation and selected slice

- `worker_jobs` and its outbox remain the durable control plane; existing reconciler, worker monitor and Rust runner lease/session registries are reused.
- `jobControlPlaneMonitor.ts` already projects pending/queued counts, recent heartbeats and known/free worker slots, but had no explicit signal for queued work while fresh workers had unoccupied capacity.
- This PR adds the read-only `alerts.backlogWithFreeWorkerCapacity` aggregate signal. It is true only with pending/queued work, at least one fresh online worker, known capacity, and at least one free slot. It does not prove per-job capability compatibility, dispatch work, mutate job state, or add a queue, scheduler, approval service, schema, or runtime.
- A GitHub PR lifecycle reconciler that autonomously repairs/merges/cleans owned PR resources was not found in the audited existing skill/controller paths. The existing lifecycle skills provide policy and safe manual/controller procedures, not evidence of automated end-to-end GitHub reconciliation.
- No multi-machine benchmark or Windows/Debian failure-recovery run was performed. Multi-machine execution remains opt-in/unverified.

## Open PR and workspace reconciliation

| Item | Observed state | Reconciliation action |
|---|---|---|
| PR #467 | Open RFC-only PR; preview check is `SKIPPED` | Treated as architecture input only; `SKIPPED` is not a pass. |
| PR #438 | Open guardrail/spec PR; overlaps SPEC-276 and generated handoff/registry artifacts; preview is `SKIPPED` | No overlapping files edited. |
| Primary checkout | `/home/dev/projects/SmartSpecPro`, local `main` at `ccd4cd11`; 109 commits behind observed canonical SHA and has unrelated staged/unstaged/untracked task work | Preserved unchanged; no checkout, reset, clean, merge, or staging performed there. |
| Implementation PR #471 | [feat(worker-jobs): expose backlog with free capacity signal](https://github.com/naibarn/SmartSpecPro/pull/471), open, reconciled base `564ccc092ca4be93dfc12b8d548bd729bfdbe78b`; `reviewDecision` empty; `build-preview` is `SKIPPED` | PR is reviewable but not integrated. See GitHub for the current head SHA. No skipped check is counted as a pass. |
| This task workspace | `/home/dev/worktrees/autonomous-completion-idle-signal-20261010`, branch `codex/autonomous-completion-idle-signal-20261010`, registered as `TASK_WORKTREE` for `autonomous-completion-pr467-20261010` | Only this task's two service/test files and task evidence are owned here. |
| Existing related worktrees | SPEC-224 runner/trust, SPEC-269 acceptance, SPEC-277 evidence, skills candidates and other runner worktrees are present | Ownership could not be safely inferred from path/name. None were edited, deleted, pruned, or merged. |

The task branch is a temporary candidate, not a canonical integration. It was reconciled against `origin/main` at `564ccc092ca4be93dfc12b8d548bd729bfdbe78b`, passed the local fast integration gate, and was delivered through normal PR #471. The only GitHub check observed is `build-preview: SKIPPED`; no review decision exists and no merge occurred. No branch protection or required review is bypassed. Cleanup remains pending until remote PR state, exact ownership and integration are verified.

## Verification evidence and remaining work

- RED: focused monitor tests failed before the helper existed (`deriveIdleWithBacklogAlert is not a function`; 5 cases failed, 2 existing unit tests passed, 2 DB integration tests skipped).
- GREEN: `pnpm exec vitest run server/services/__tests__/jobControlPlaneMonitor.test.ts` from `apps/web` — 1 file passed, 7 passed, 2 DB integration tests skipped. Fresh run completed at 2026-10-10 14:33 Asia/Bangkok after the aggregate-capacity naming/type annotation review repairs.
- Passed: clean rebase onto canonical SHA `564ccc092ca4be93dfc12b8d548bd729bfdbe78b`, local fast gate, and normal PR creation (#471).
- Pending: required CI/review and post-merge ancestry verification. Current `build-preview` is skipped, not passed.
- Not verified: six-spec normative amendment, UI presentation of the new field, job/worker capability compatibility, full failure/retry/conflict/runner-loss/duplicate-execution scenarios, automatic PR repair/merge/cleanup, benchmark, Windows/Debian execution, deployment, production readiness.

## Next safe actions

1. Create the implementation PR for this isolated monitor slice and verify CI/review without claiming `SKIPPED` as pass.
2. Continue the six-spec allocation with existing work owners after their current handoffs/PRs reconcile; never edit another task's active paths.
3. Reconcile SPEC-077 versus the proposed cross-machine capability/artifact/workspace portability boundary before assigning a registry number.
4. Plan an owned SPEC-224 Git lifecycle work unit using the existing authority/workspace and job control-plane contracts; require a separate authorization check before any automatic merge or cleanup action.
5. Add recovery matrix and same-task single-machine benchmark evidence before enabling remote placement by default.
