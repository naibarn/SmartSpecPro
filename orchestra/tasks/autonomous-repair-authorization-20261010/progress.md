# Autonomous Repair Authorization — Handoff

Status: `PARTIAL_INTEGRATED` only after this checkpoint is merged; until then `CHECKPOINT_READY`.

Owner: branch `codex/autonomous-repair-auth-unblock-20261010`, task worktree `/home/dev/worktrees/autonomous-repair-auth-unblock-20261010`.

## Implemented in this checkpoint

- Added a fail-closed Goal delegation scope evaluator for evidence loaded from the existing Approval Authority.
- It verifies approved state/count, tenant/requester/goal identity, expiry and revocation; child workspace/repository/source SHA/action/write paths/capabilities; and exact held budget by tenant/job/attempt/currency and grant ceiling.
- It produces a digest-bound child binding; it does not issue/persist Approval evidence or create a budget hold.
- Added optional stable `DevelopmentRun.goalId`; legacy runs keep `goal:${runId}` when creating the existing Feature 186 manifest/job.
- Test design and targeted regressions are in this directory and under the service tests.

## Evidence

- Targeted Vitest: Goal Grant contract, DevelopmentRun contracts, Spec 224 auth binding/revocation and economic durable hold unit tests.
- Targeted TS compile: Goal Grant module and its focused test.
- `git diff --check` and explicit-path staged-path inspection.

## Required next actions

1. Issue the Goal grant only through an authenticated owner/approver path in the existing Approval Authority, then add an internal authenticated read/revocation check for dispatch-time revalidation. Never treat a client supplied payload as authority.
2. Bind the child evaluator into current Spec 224 authorization status/bind/dispatch; preserve fresh Runner trust/session/capability checks and reserve every child attempt through the existing economic hold service.
3. Add verified GitHub CI event ingress with signature and replay defense, then persist deduplicated repair work only through `worker_jobs`/outbox.
4. Test issuance/delegation/revocation/budget exhaustion/concurrent reservations with an isolated current-schema PostgreSQL database.
5. Enroll a trusted Linux Runner through the existing enrollment flow and capture a real execution receipt before claiming live acceptance. Then test CI repair through retest/merge/verify/cleanup subject to repository policy.

No live Runner execution, approval issuance, event ingress, merge, or cleanup is claimed by this checkpoint. Repository-wide typecheck and Windows Protected Execution changes remain out of scope.
