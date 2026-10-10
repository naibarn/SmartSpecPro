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

## Follow-up checkpoint candidate (2026-10-10)

Current canonical main at start of this follow-up: `66ba886c9c7e6c0e30682cd5def300214679c48d` (PR #554); latest refreshed main while working: `7e436e27989c6a12167a80e7c7e3e9a64a43e3ab` (PRs #555–556 integrated). The task branch merged latest main with the normal non-force path; intervening changes were limited to SPEC-271 evidence and did not overlap. Primary checkout remains untouched.

- Connected the existing Goal Grant evaluator to the existing Spec 224 Runner authorization gate as an alternate, mutually exclusive authority source. It revalidates exact child job/attempt budget hold, Goal/tenant/actor/workspace/repository/source SHA/action/path/capability scope and Grant expiry/revocation, then still requires trusted online Runner session, fresh capability snapshot, tool authentication, workspace binding, and all Grant-requested capabilities on that snapshot.
- A child job approval cannot be combined with Goal Grant evidence; no approval is created, persisted, or borrowed by this code. The Goal Grant evidence must come from the canonical Approval Authority reader at its eventual service call site.
- Added regression checks for successful child authorization, ambiguous authority denial, revocation, expiry, source SHA scope, missing budget, and missing Runner capability.
- Focused Vitest on authorization binding, Goal delegation, DevelopmentRun contract, and durable economic holds: 4 files, 45 tests passed. `git diff --check` passed. No live Runner or PostgreSQL test was run for this pure binding slice.
- Main CI remains baseline-failing on `c3d7cef8`: SmartSpecWeb broad UI suite and Python collection fail; turbo typecheck includes existing errors in `spec224AuthorizationService.ts` (same errors also present at `b422fc7d`) and `spec224DevelopmentRunContracts.ts` (also present at `b422fc7`), among many unrelated baseline TS failures. Main migration workflow also fails independently. CI is not being represented as passing.

## Remaining work and blockers

1. Wire an authenticated Goal Grant reference and server-loaded Approval evidence into `Spec224AuthorizationService.bind/status`; derive the bounded repair scope from durable work-unit data and reserve each attempt with `economicDurableService` before binding. Current evaluator is test-covered but not a live dispatch path yet.
2. Add GitHub signature/replay-safe event ingress and create only canonical `worker_jobs`/outbox repair work.
3. Exercise issuance/revocation/budget/concurrent reservations against isolated current-schema PostgreSQL; enroll and verify a Linux Runner through the real trust flow; collect an execution receipt.
4. Diagnose CI baseline failures independently. These are not caused by this follow-up and do not authorize changing required checks.

Current follow-up state: PR #557 (`https://github.com/naibarn/SmartSpecPro/pull/557`) contains the 45-test-passing source/test/handoff delta. The branch has been reconciled with `7e436e27989c6a12167a80e7c7e3e9a64a43e3ab`. Repository API reports `main` is not protected (404), and the PR preview check is `SKIPPED` (not passed); the repository has no required checks to bypass. Next action: merge normally, verify the merge SHA in `origin/main`, then continue with the canonical Approval reader/service wiring and event ingress. Do not claim Autonomous Repair dispatch or live execution until items 1–3 have evidence.
