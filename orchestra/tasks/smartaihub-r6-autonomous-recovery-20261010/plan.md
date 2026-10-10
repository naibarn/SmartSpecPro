# SmartAIHub R6 Autonomous Recovery — Execution Plan

## Objective and baseline

- Objective: prove a synthetic AutoTeam run persists progress, is interrupted, is discovered/recovered by canonical scheduled worker paths, rejects stale completion, continues useful work, and reaches Final Verify while retaining one logical run.
- Canonical baseline: `origin/main` `c889afaa231c6abd0aec38860037283ff7aa3863`.
- Risk: high; runtime authorization, persistence, leasing/fencing, process boundaries, and current-schema fixture.
- Route: Orchestra multi-agent read-only reconnaissance followed by one-writer implementation waves in isolated task worktrees. Main conductor retains integration and evidence authority.
- The primary `/home/dev/projects/SmartSpecPro` checkout remains dirty at `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978` and is preserved.

## Bounded design choices

1. **Recommended:** extend a guarded disposable current-schema fixture using authoritative canonical table definitions; run actual scheduler and worker processes over PostgreSQL and the existing `worker_jobs`/outbox control plane.
2. Replaying the full historical migration chain is rejected because it includes retired Agency dependencies and does not provide safe current-schema provenance.
3. Mock-only scheduler/worker tests are insufficient for R6 because they cannot prove persisted occurrence, hard interruption, lease reclaim, stale-worker fencing, or restart continuity.

No production migrations, deployments, grants, production ingress changes, protected SPEC-224 dispatch, second scheduler/queue/store, or authority fabrication.

## WorkUnits

- `R6_AUTOTEAM_CURRENT_SCHEMA_SCHEDULED_RECOVERY_AND_FENCING_ACCEPTANCE` — highest priority; current-schema disposable DB, scheduled scan/evaluation, SIGKILL/restart, useful-work classification, fencing/idempotency, task continuity.
- `R6_SPEC271_WP2B_INDEPENDENT_RECEIPT_CONTRACT_AND_REPLAY` — independently inspect owner boundary; implement only contracts/tests safe without claiming authority.
- `R6_SPEC302_DURABLE_RECEIPT_PREPARATION` — independent contract/migration compatibility tests only unless actual owner assignment and migration authority are established.
- `R6_SPEC277_TASK_CONTROL_CONTINUITY` — use the existing logical run/projection and verify continuity after Lane A execution.
- `R6_SPEC224_NONPROTECTED_E2E_READINESS` — bounded read-only authority assessment; protected dispatch remains DENY.

## Ownership contracts for first reconnaissance wave

- AutoTeam runtime scout: read-only `apps/web/server/jobs/autoTeamRecoveryScanJob.ts`, `apps/web/server/services/autoTeamRecoveryScanExecutor.ts`, `apps/web/server/services/autoTeamRecoveryEvaluationExecutor.ts`, `apps/web/server/services/autoTeamRecoveryService.ts`, relevant `runEngine.ts` call paths, Feature186 scheduler and directly related tests. No edits.
- Current-schema fixture scout: read-only canonical definitions and the curated mini-app disposable bootstrap / test runners / migration journal relevant to team_rooms, team_runs, worker_jobs, events, leases and outbox. No DB connection, migrations, or edits.
- Authority scout: read-only SPEC-271 WP2B, SPEC-302 Phase 2, SPEC-224/267 ownership/authority source and handoffs. No edits or invented owner approval.

## Acceptance matrix (initial; revise after reconnaissance)

| Requirement | Observable behavior | Test level/location | RED evidence | Residual boundary |
|---|---|---|---|---|
| A1 isolated current schema | Unique owner-marked disposable DB, loopback-only; exact target checked before destructive fixture setup; required canonical tables present | guarded shell runner + PostgreSQL fixture | current R5 fixture lacks team_rooms/team_runs | no production or shared DB proof |
| A2 scheduled scan/evaluation | Persisted occurrence is idempotent; one eligible run selected, unauthorized/terminal/waiting runs not misclassified; evaluation enters canonical worker_jobs/outbox | real DB multi-process acceptance | current evidence is worker retry only | scheduler tests must execute actual registered scheduler path |
| A3 interruption/restart | SIGKILL after persisted checkpoint; restarted worker reloads same run and resumes; duplicate terminal events absent | process-boundary acceptance | current evidence did not kill active worker | no real user sessions/providers |
| A4 fencing/idempotency | concurrent lease reclaim wins once; stale worker rejected at side-effect mutation and terminal completion boundary | real PostgreSQL concurrency test | existing #543 claim tests do not cover AutoTeam side effects | require exact runEngine mutation/receipt boundary |
| A5 useful-work/waits | wait class retained; no false completion; bounded no-progress; unrelated ready work continues | service plus scheduled DB acceptance | prior recovery tests mocked | do not invent a second status authority |
| B SPEC-271 receipt | persisted authoritative state replays after process restart; fabricated/stale receipts rejected | authority-bound contract/integration test | WP2B owner assignments unresolved | test evidence cannot become production-authoritative receipt without owner |
| C SPEC-302 receipt | idempotency, normalized digest, ACL revocation/expiry and transaction race are specified/tested without enabling writes | contract tests and isolated migration compatibility analysis | Phase 2 schema owner/approval not established | durable Project-shared writes remain DENY |
| D Task Control continuity | same run id and event cursor reconstruct plan/progress/waiting state across restart | actual read-model integration test | R5 only checked DevelopmentRun persistence | no fake percentages or COMPLETE before Final Verify |
| E SPEC-224 boundary | only existing authorized non-protected local path may run; protected dispatch remains DENY | read-only readiness/evidence audit | no production runner capability | no grants or protected dispatch |
