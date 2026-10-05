---
name: session-finish
description: Finish an implementation session by running the fast integration gate, committing its work, and promoting it into origin/main; heavy verification runs after promotion.
---

# Session Finish — Promote Completed Work Immediately

Use this skill when implementation is complete. A task is not delivered while its only copy is on a session branch, local worktree, or readiness marker.

## Required lifecycle

```text
implement
  → FAST INTEGRATION GATE
  → commit
  → integrate into origin/main
  → heavy test / full typecheck / integration / UAT
  → if a problem appears, repair on current main and promote that repair
```

The FAST INTEGRATION GATE checks only:

- no syntax or compile error in the changed scope;
- no unresolved merge conflict;
- no damaged or unusable patch;
- no accidental secret.

Run inexpensive scoped checks that establish these facts. Do not wait for full typecheck, repository-wide build, heavy tests, integration/UAT, provider/rights checks, or production gates before promotion. Resource limits defer those checks, not the integration.

## Steps

1. Identify the repository, task, current `origin/main`, and every changed path. Preserve unrelated dirty changes; stage only files owned by this task.
2. Inspect the task diff for conflict markers, malformed edits, and secrets. Run the cheapest available syntax/compile check for the changed scope. Do not run forbidden or resource-heavy global checks as part of the fast gate.
3. Fetch the latest `origin/main`, reconcile the task with it, and repeat the fast gate on the exact candidate commit.
4. Commit the task and integrate it into `origin/main` using the normal non-force GitHub path. Do not leave a completed task in `READY_FOR_INTEGRATION` or `READY_FOR_HEAVY_VERIFICATION`.
5. Confirm the integrated commit is reachable from the updated `origin/main`. Report its SHA and any post-integration checks still outstanding.
6. Run post-integration verification through CI, a dedicated runner, or an admitted safe resource window. Track each obligation against the integrated SHA with an owner, status, and next action.
7. If verification finds a regression, create a repair task from current `main`, fix it there, pass the same fast gate, and promote a new commit to `main`. Preserve history; do not hide the fix in a side branch.

## Promotion constraints

- Do not create or retain per-session branches as a substitute for central integration. If concurrency or required GitHub protection needs a temporary branch/PR, merge it within this lifecycle and remove the temporary ref only after verifying its commit is in `origin/main`.
- Serialize the short promotion step if needed to avoid races. Do not wait for unrelated sessions or a heavy-check slot.
- Never force-push or bypass required repository protection.
- A failed fast gate blocks promotion. Preserve the exact change durably and report `FAST_GATE_BLOCKED`, the failure, owner, and next action. This is not a completed session.
- A heavy-check failure after promotion does not remove or strand the integrated work. Repair on `main`.
- Preserve uncommitted work owned by other sessions. Never stage it, overwrite it, or remove its worktree as part of this lifecycle.

## Outcomes

- `PROMOTED_TO_MAIN`: fast gate passed; the implementation commit is reachable from `origin/main`. Post-integration checks may remain pending.
- `ALREADY_IN_MAIN`: equivalent implementation is already integrated and no unique valuable delta remains.
- `FAST_GATE_BLOCKED`: the exact fast-gate failure and durable recovery location are reported; this is not success.

Do not claim heavy verification, UAT, production readiness, or deployment unless each has its own passing evidence.
