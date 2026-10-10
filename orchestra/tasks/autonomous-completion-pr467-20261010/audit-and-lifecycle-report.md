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
- This PR adds the read-only `alerts.backlogWithFreeWorkerCapacity` aggregate signal and contract coverage through the existing admin tRPC summary. It is true only with pending/queued work, at least one fresh online worker, known capacity, and at least one free slot. It does not prove per-job capability compatibility, dispatch work, mutate job state, or add a queue, scheduler, approval service, schema, or runtime.
- A GitHub PR lifecycle reconciler that autonomously repairs/merges/cleans owned PR resources was not found in the audited existing skill/controller paths. The existing lifecycle skills provide policy and safe manual/controller procedures, not evidence of automated end-to-end GitHub reconciliation.
- No multi-machine benchmark or Windows/Debian failure-recovery run was performed. Multi-machine execution remains opt-in/unverified.

## Open PR and workspace reconciliation

| Item | Observed state | Reconciliation action |
|---|---|---|
| PR #467 | Open RFC-only PR; preview check is `SKIPPED` | Treated as architecture input only; `SKIPPED` is not a pass. |
| PR #438 | Open guardrail/spec PR; overlaps SPEC-276 and generated handoff/registry artifacts; preview is `SKIPPED` | No overlapping files edited. |
| Primary checkout | `/home/dev/projects/SmartSpecPro`, local `main` at `ccd4cd11`; 109 commits behind observed canonical SHA and has unrelated staged/unstaged/untracked task work | Preserved unchanged; no checkout, reset, clean, merge, or staging performed there. |
| Implementation PR #471 | [feat(worker-jobs): expose backlog with free capacity signal](https://github.com/naibarn/SmartSpecPro/pull/471), open; head `528b6d2d028cedf38aabc25166e8248676fc98c3`, base `0b2eee336eb6bbddf26f3812054226ea95d5a814`; `reviewDecision` empty; latest `build-preview` is `SKIPPED` | PR is reviewable but not integrated. No skipped check is counted as a pass. |
| This task workspace | `/home/dev/worktrees/autonomous-completion-idle-signal-20261010`, branch `codex/autonomous-completion-idle-signal-20261010`, registered as `TASK_WORKTREE` for `autonomous-completion-pr467-20261010` | Only this task's service, service-test, route-test files and task evidence are owned here. |
| Existing related worktrees | SPEC-224 runner/trust, SPEC-269 acceptance, SPEC-277 evidence, skills candidates and other runner worktrees are present | Ownership could not be safely inferred from path/name. None were edited, deleted, pruned, or merged. |

The task branch is a temporary candidate, not a canonical integration. It was reconciled against `origin/main` at `e6d33045f0b954444349213d5de88b941a9c5167`; intervening changes concern SPEC-269 handoff artifacts and do not overlap task-owned edits. It passed the local fast integration gate and was delivered through normal PR #471. The latest `build-preview` is `SKIPPED`; no review decision exists and no merge occurred. The primary user workspace remains at `ccd4cd11...` with unrelated dirty changes preserved, so no convergence was performed. No branch protection or required review is bypassed. Cleanup remains pending until remote PR state, exact ownership and integration are verified.

## Continuation audit: PR #471, scheduler recovery, and spec ownership

### PR #471 reconciliation snapshot (2026-10-10 continuation)

- PR API still reports open head `c69e06e9bd2599c5df9692acae6e17c1e87c94bf`, base `e6d33045f0b954444349213d5de88b941a9c5167`, `UNKNOWN` mergeability, no review decision, and only `build-preview=SKIPPED`. That state is stale because refreshed `origin/main` advanced first to `72439f958…` and then `d3566cc4…` during this audit.
- Against refreshed `origin/main`, the PR head is 18 commits ahead / 33 behind. The user-reported 18/7 count corresponds to an earlier snapshot; the behind count grew as unrelated PRs integrated. The 18 PR-only commits are all task work, with duplicate feature patch IDs in the branch history. The PR changed-file set contains only the original monitor helper/service test, router test, and task evidence. No unrelated implementation files were found.
- Current continuation worktree `HEAD` includes the task branch's prior canonical merges and a normal merge of refreshed `origin/main` `d3566cc4e0f6011c1b262bf0456fcf5c83803d1f`. The merge completed without conflicts; the post-merge 8-file focused suite passed (181 passed, 2 skipped). The original PR branch and worktree remain intact. Normal push is pending; no clean candidate branch is needed unless the live merge result changes.
- Live repository inspection returned branch-protection 404 and an empty ruleset list; no required check/review rule is configured. This does not convert the skipped preview to a pass. Local targeted tests are evidence for the changed scope; merge is not yet recorded and must not be reported complete without rechecking live repo policy, PR checks, and ancestry after the normal push.

### Existing runtime and safe repair

- SPEC-267's existing `worker_jobs` + outbox, `jobReconciler`, `jobOutboxPublisher`, authenticated worker claim path, per-worker capability selector, health/queue checks, and fenced leases already perform periodic due-retry and expired-lease recovery. Keep using these; no second queue or scheduler is needed.
- The dashboard `backlogWithFreeWorkerCapacity` is aggregate telemetry. It cannot authorize dispatch to a specific worker because it does not establish that worker's job capability, runtime/adapter compatibility, live readiness, resource admission, or claim authority. The authenticated claim path performs those checks and CAS/fencing. Automatically claiming based only on the dashboard signal would risk duplicate execution and wrong-worker side effects.
- A concrete deadlock gap was safe to fix locally: queued jobs with a multi-node dependency cycle could wait indefinitely. The existing transactional claim path now walks unresolved dependency edges with a 128-node budget. A proven cycle fails once with `dependency_cycle` and operator review; a scan over budget is left queued and is never mislabeled as a cycle. Existing failure event and outbox cancellation semantics are reused. Tests cover 2-node and transitive cycles, one-time failure event, independent work continuing, and budget exhaustion.
- Remaining runtime gaps: no persisted generic `no_compatible_worker` reason, no trusted cross-runtime free-capacity placement, and no generic queue-stall classifier. External runner authorization/trust and resource authority remain real boundaries. Next work belongs to an owned SPEC-267/SPEC-276 WorkUnit after its current handoff; it must connect authoritative worker registration/capability/health/resource evidence to existing claims, not add a scheduler.

### Spec consolidation and next WorkUnits

- Feature 077 remains the existing Distributed Worker Fabric owner; no new Distributed Execution spec is warranted. The shared `autonomous-completion-contract.md` already defines completion evidence, blocker analysis, freshness, dependency waits and independent work.
- Ownership audit remains: SPEC-224 owns goal/Git lifecycle reconciliation; SPEC-226 only the task-control bridge; SPEC-267 the durable jobs/scheduler/leases; SPEC-269 goal understanding and delegation; SPEC-276 execution capability and adapters; SPEC-277 task-control UX. Do not amend generated status/manifests or active handoffs from other owners' worktrees. No canonical spec or handoff was edited in this continuation.
- Next WorkUnits: `WU-PR471-CANONICAL-RECONCILE` (conductor; merge latest `origin/main`, rerun exact fast gate, push normally, reconcile checks/review/merge eligibility); `WU-SPEC267-COMPATIBLE-PLACEMENT` (owner needed; prove compatible worker placement from authenticated capability/health/resource signals); `WU-SPEC224-GIT-LIFECYCLE` (owner needed; build PR repair/merge/cleanup only on owned refs with existing protection honored); `WU-SPEC077-BENCHMARK-RECOVERY` (owner needed; single-machine baseline, then controlled multi-machine failure recovery). Independent next work may proceed while PR status is pending.

## Verification evidence and remaining work

- RED: focused monitor tests failed before the helper existed (`deriveIdleWithBacklogAlert is not a function`; 5 cases failed, 2 existing unit tests passed, 2 DB integration tests skipped).
- GREEN at source commit `8d8e67452d3539d3c2bb1701190894b7b0b226a9`: `pnpm exec vitest run server/services/__tests__/jobControlPlaneMonitor.test.ts server/routers/__tests__/workerJobs.test.ts` from `apps/web` — 2 files passed, 15 passed, 2 DB integration tests skipped. Completed at 2026-10-10 14:39 Asia/Bangkok; covers aggregate decision and admin tRPC field forwarding.
- Passed: clean canonical reconciliations in prior snapshots and normal PR creation (#471); current exact fast gate for the continuation is pending its checkpoint.
- Passed: focused service + router tests at source commit `8d8e67452d3539d3c2bb1701190894b7b0b226a9`; local fast gate for that code/test candidate.
- Passed (continuation): `pnpm exec vitest run server/services/__tests__/jobControlPlane.test.ts -t 'does not claim a dependent Job|fails a dependent Job closed|fails a multi-job dependency cycle|detects a dependency cycle through|keeps oversized dependency scans|rejects a known adapter|fences stale workers|increments the business attempt once|does not auto-dispatch an operator-review retry|recovers a lease-expired story checkpoint'` — 1 file, 10 passed, 63 skipped, 2026-10-10 15:13 Asia/Bangkok.
- Passed (continuation, earlier run): 8 focused files across control plane, reconciler, outbox, worker registry/scheduler, monitor and router — 181 passed, 2 skipped. This is local targeted evidence only.
- Pending: CI/review and post-merge ancestry verification. Current `build-preview` is skipped, not passed; there is no merge SHA.
- Canonical reconciliation update: `origin/main` advanced to `e6d33045f0b954444349213d5de88b941a9c5167` after PR #471 was opened. The branch now contains this SHA in its ancestry; intervening changes touch SPEC-269 handoff artifacts, outside this slice's edits.
- Not verified: six-spec normative amendment (deferred due ownership and active handoffs), UI presentation of the new field, per-job compatible-worker automatic dispatch, DB-backed monitor behavior, live runner loss/lease expiry, GitHub CI failure repair/automatic merge/cleanup, process restart UAT, single-machine benchmark followed by multi-machine verification, Windows/Debian execution, deployment, production readiness. `SKIPPED` checks are not passes.

## Next safe actions

1. Reconcile and push the updated PR branch normally; recheck current repository rules and required checks on the refreshed exact head. Never treat `SKIPPED` as passed.
2. Merge only when live repository policy permits and required checks/reviews pass; verify the resulting SHA is reachable from `origin/main` before recording integration.
3. Continue spec allocation with existing work owners after their current handoffs/PRs reconcile; never edit another task's active paths.
4. Implement compatible placement and Git lifecycle work only within an owned SPEC-267/SPEC-276 or SPEC-224 WorkUnit using existing authority/control-plane boundaries.
5. Add restart/failure-repair recovery evidence and a single-machine benchmark before any default multi-machine execution; keep production readiness separate.
