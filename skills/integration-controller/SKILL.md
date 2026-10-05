---
name: integration-controller
description: Recover completed, partial, or stranded work and promote every safe valuable fast-gate-passing checkpoint into origin/main; perform heavy verification after integration and repair on main.
---

# Integration Controller — Centralize Work in Main

`origin/main` is the first durable central landing point for safe development progress, including partial progress. Do not let readiness markers, heavy-check queues, branch discovery gaps, session shutdown, quota exhaustion, or another developer/session hide valuable work from central history.

Read `references/integration-verification.md` before running promotion or post-integration checks.

## Required rule

```text
SAFE CHECKPOINT → FAST INTEGRATION GATE → commit → integrate into origin/main → continue/handoff and heavy verification/UAT → repair on main
```

Before promotion, require only:

- no syntax/compile error in the changed scope;
- no unresolved merge conflict;
- no damaged or unusable patch;
- no accidental secret.

Full typecheck, full build, heavy tests, integration/UAT, provider/rights checks, and production gates run after the integrated SHA is recorded in `origin/main`. A resource block is never a reason to silently leave an implementation outside the central history.

## Canonicalization rule for partial work

Task completion is not a prerequisite for central integration. A checkpoint is eligible when it represents coherent valuable progress that can coexist safely with current `main`. Examples include a backend slice before UI completion, schema/repository layer before business logic, provider adapter disabled behind a feature flag, or a subset of a larger refactor that leaves the repository startable.

When a session is stopping because of quota/context/provider/time boundaries, treat that stop as an urgent reconciliation event: promote the largest safe subset now and hand off the remainder.

## Workflow

1. Refresh `origin/main` and inventory completed, partial, stranded, marked, **unmarked**, and dirty task refs/worktrees. Readiness markers are legacy evidence only and MUST NOT be required for discovery. Record each candidate's committed tip, dirty state, relation to main, likely owner/scope, and recoverable delta.
2. Preserve unrelated dirty changes. For a dirty task worktree, identify and durably commit/preserve the task-owned delta without staging other work. If ownership cannot be separated safely, report `FAST_GATE_BLOCKED` with the path, owner/session if known, durable location, and next action; never discard it.
3. Reconcile each candidate with current `origin/main`, inspect its diff, and identify the largest coherent safe checkpoint. Run the FAST INTEGRATION GATE against that checkpoint. If the whole delta is unsafe, split and promote independent safe subsets before preserving the remainder.
4. Commit and promote every fast-gate-passing safe checkpoint promptly through the normal non-force GitHub path, whether the parent task is complete or partial. Serialize only promotion when needed. Do not wait for unrelated sessions, task completion, or heavy verification.
5. Verify that each promoted SHA is reachable from the new `origin/main`. Record task/work ID, SHA, source ref/worktree, `PARTIAL|IMPLEMENTATION_COMPLETE`, completed scope, remaining scope, and next action in the integration report/handoff.
6. After promotion, queue heavy checks against the integrated SHA with a durable owner, status, and next action. A canceled, unavailable, or resource-blocked check is `NOT_RUN`/`PENDING`, never a pass.
7. If post-integration checks fail, create a repair task against latest `main`; pass the fast gate and promote the repair to `main`. Keep the original and repair commits visible in history.
8. Classify worktrees for cleanup only after proving their valuable changes are integrated or durably preserved. Never remove a dirty or unclassified worktree. Clean completed temporary refs only after their commits are verified in `origin/main`.

## Branch and worktree discipline

- Do not create or retain per-session branches as the durable progress destination. If required by concurrent isolation or repository protection, use a temporary branch/PR, but canonicalize safe checkpoints to main throughout the work lifecycle rather than waiting for final completion.
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

Controller completion requires that every discovered valuable delta is either integrated (partial or complete), already present in `main`, or explicitly preserved as `FAST_GATE_BLOCKED` with a durable recovery location and named next action. A parent task may remain open after partial canonicalization. Never require a readiness marker for visibility, never report pending validation as completion, and never allow an uncanonicalized valuable delta to disappear from inventory.
