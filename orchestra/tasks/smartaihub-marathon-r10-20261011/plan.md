# SmartAIHub Marathon R10 — Work Plan

## Task Classification
- Scope: large
- Risk: high
- Affected domains: SPEC-224 DevelopmentRun persistence, worker_jobs/Task Control, disposable Git and independent verification evidence, Spec handoffs
- Estimated file count: 4 implementation/test files, plus evidence and handoff records
- Chosen route: direct conductor implementation in clean canonical worktree; no agent delegation
- Bug route: true
- Classification notes: The acceptance crosses durable PostgreSQL run projection, phase reconciliation and worker-job evidence. The brief supplies concrete acceptance and safety rules, so use its design and keep live/production authority closed.

## Acceptance Slice

1. Run one same-identity DevelopmentRun through all 12 canonical phases in owner-marked disposable PostgreSQL.
2. Create a real app and functional test in an owner-marked temporary Git repository, commit a failing candidate, repair it at most twice, and prove retry idempotency.
3. Run a separate-process verifier against the exact candidate, real diff, artifacts and acceptance tests. Reject stale SHA, foreign tenant and conflicting digest.
4. Persist verifier result and artifact bytes in the existing worker job output; reread them and Task Control state from a fresh process.
5. Exercise the real Final Verify gate and leave the run incomplete when genuine workspace convergence/retirement receipts are absent.
6. Expire and reclaim a worker lease within the same persisted DevelopmentRun; prove stale settlement is rejected without writes and the new fence advances.
7. Preserve fail-closed production verification and protected dispatch. No production migration, live Runner, release or deployment.

## Changed Paths

- `apps/web/server/services/spec224DevelopmentRunPersistence.ts`
- `apps/web/server/services/__tests__/spec224DevelopmentRunPersistence.test.ts`
- `apps/web/server/services/__tests__/spec224DevelopmentRunTaskControl.integration.test.ts`
- `apps/web/server/services/__tests__/support/spec224DisposableGitAcceptance.ts`

## Checkpoint

- Clean isolated worktree: `/home/dev/worktrees/r10-developmentrun-acceptance-20261011`
- Canonical base: `b73ef6dd783e91e2ebb4d9c6079ff143b53b8adc`
- Integrated checkpoint: PR #676 merge `86d744878dcd67e1f8187a125f713b9364353573`. Follow-up checkpoint: `f42e3d9f241b457b02b5c41248046055afa50023`
- Focused PostgreSQL/persistence evidence: `specs/feature/224-Autonomous Development Orchestrator Runtime/handoff/evidence/r10-developmentrun-synthetic-repair-20261011.json`
- Next action: open a follow-up PR for the same-run stale-lease proof, run exact gates, and obey the guarded promotion result. If CI is blocked by the known baseline failures, preserve the PR and continue the next ready independent WorkUnit without bypass.
