---
name: integration-controller
description: Recover completed or stranded session work and promote every fast-gate-passing implementation into origin/main; perform heavy verification after integration and repair on main.
---

# Integration Controller — Centralize Work in Main

`origin/main` is the first durable central landing point for completed implementation. Do not let readiness markers, heavy-check queues, branch discovery gaps, or another session's status hide work from the central history.

Read `references/integration-verification.md` before running promotion or post-integration checks.

## Required rule

```text
FAST INTEGRATION GATE → commit → integrate into origin/main → heavy verification/UAT → repair on main
```

Before promotion, require only:

- no syntax/compile error in the changed scope;
- no unresolved merge conflict;
- no damaged or unusable patch;
- no accidental secret.

Full typecheck, full build, heavy tests, integration/UAT, provider/rights checks, and production gates run after the integrated SHA is recorded in `origin/main`. A resource block is never a reason to silently leave an implementation outside the central history.

## Workflow

1. Refresh `origin/main` and inventory known completed or stranded task refs, readiness markers, and worktrees. Record each task and its exact implementation SHA. Do not assume a branch name or marker is a complete inventory.
2. Preserve unrelated dirty changes. For a dirty task worktree, identify and durably commit/preserve the task-owned delta without staging other work. If ownership cannot be separated safely, report `FAST_GATE_BLOCKED` with the path, owner/session if known, durable location, and next action; never discard it.
3. Reconcile each task with current `origin/main`, inspect its diff, run the FAST INTEGRATION GATE, and repair any fast-gate issue within task scope.
4. Commit and promote every fast-gate-passing implementation promptly through the normal non-force GitHub path. Serialize only promotion when needed. Do not wait for unrelated sessions or heavy verification.
5. Verify that each promoted SHA is reachable from the new `origin/main`. Record the task, SHA, source ref/worktree, and result in the integration report.
6. After promotion, queue heavy checks against the integrated SHA with a durable owner, status, and next action. A canceled, unavailable, or resource-blocked check is `NOT_RUN`/`PENDING`, never a pass.
7. If post-integration checks fail, create a repair task against latest `main`; pass the fast gate and promote the repair to `main`. Keep the original and repair commits visible in history.
8. Classify worktrees for cleanup only after proving their valuable changes are integrated or durably preserved. Never remove a dirty or unclassified worktree. Clean completed temporary refs only after their commits are verified in `origin/main`.

## Branch and worktree discipline

- Do not create or retain per-session branches as the delivery destination. If required by concurrent isolation or repository branch protection, use a temporary branch/PR and merge it during the same completion lifecycle.
- Never force-push or bypass repository protection. If protection prevents immediate direct push, complete the required PR path promptly and keep the task visible as promotion-pending until the merge SHA is verified.
- Never use destructive reset/clean/prune/remove operations against another session's worktree. A worktree count is not proof that its contents are disposable.
- `origin/main` promotion is not deployment. Report deployment/runtime evidence separately.

## Required report

Report:

- initial and final `origin/main` SHA;
- each task found and its source SHA/ref;
- each promoted SHA and proof it is reachable from `origin/main`;
- fast-gate result;
- post-integration checks passed, failed, canceled, or pending, tied to the integrated SHA;
- preserved/blocked task work with owner and next action;
- worktrees/temporary refs safe to clean and any that must remain.

Controller completion requires that every discovered task is either integrated, already present in `main`, or explicitly preserved as `FAST_GATE_BLOCKED` with a durable recovery location and named next action. Never report a pending task as completed or allow it to disappear from the inventory.
