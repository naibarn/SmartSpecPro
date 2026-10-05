---
name: session-finish
description: Checkpoint or finish an implementation session by promoting every safe valuable delta into configured canonical ref; task completion is not required and heavy verification runs after promotion.
---

# Session Finish — Canonicalize Safe Progress Before Pause or Finish

Follow the shared [development lifecycle contract](../development-lifecycle/SKILL.md) for WorkUnit ownership, checkpoint triggers, non-terminal waits, and machine-readable handoff fields.

Use this skill whenever a session reaches a safe checkpoint, is about to pause/stop/handoff, approaches quota or context exhaustion, or completes implementation. Task completion is **not** required. Safe valuable progress must not remain only on a session branch, local worktree, sandbox, or chat context.

## Required lifecycle

```text
implement / partial progress
  → SAFE CHECKPOINT
  → FAST INTEGRATION GATE
  → commit
  → integrate into configured canonical ref
  → heavy test / full typecheck / integration / UAT
  → if a problem appears, repair on current canonical state and promote that repair
```

The FAST INTEGRATION GATE checks only:

- no syntax or compile error in the changed scope;
- no unresolved merge conflict;
- no damaged or unusable patch;
- no accidental secret.

Run inexpensive scoped checks that establish these facts. Do not wait for full typecheck, repository-wide build, heavy tests, integration/UAT, provider/rights checks, or production gates before promotion. Resource limits defer those checks, not the integration.

## Steps

1. Identify the repository, task, current configured canonical ref, and every changed path. Preserve unrelated dirty changes; stage only files owned by this task.
2. Inspect the task diff for conflict markers, malformed edits, and secrets. Run the cheapest available syntax/compile check for the changed scope. Do not run forbidden or resource-heavy global checks as part of the fast gate.
3. Fetch the latest configured canonical ref, reconcile the task with it, and repeat the fast gate on the exact candidate commit.
4. Commit the largest safe task-owned checkpoint and integrate it into configured canonical ref using the normal non-force GitHub path. Do not wait for the whole task to complete. If only a subset can safely integrate, split that subset, promote it, and preserve the unsafe/incomplete remainder with an explicit handoff/recovery reference.
5. Confirm the integrated commit is reachable from the updated configured canonical ref. Report its SHA, whether progress is `PARTIAL` or `IMPLEMENTATION_COMPLETE`, remaining scope, next action, and post-integration checks still outstanding.
6. Run post-integration verification through CI, a dedicated runner, or an admitted safe resource window. Track each obligation against the integrated SHA with an owner, status, and next action.
7. If verification finds a regression, create a repair task from current configured canonical ref, fix it there, pass the same fast gate, and promote a new commit to configured canonical ref. Preserve history; do not hide the fix in a side branch.

## Mandatory checkpoint triggers

Run this lifecycle proactively when any of the following is true:

- implementation scope completes;
- user pauses/stops or requests handoff;
- provider/session quota is near exhaustion or exhausted;
- context window is near exhaustion;
- provider disconnect/rate limit/timeout will end the current execution context;
- end-of-work-window or scheduled pause is reached;
- ownership transfers to another agent, harness, session, or developer;
- a long-running mutation reaches a coherent safe boundary;
- watchdog detects valuable uncanonicalized progress at risk of being stranded.

The trigger asks **"what valuable progress can safely be canonicalized now?"**, not **"is the whole task finished?"**.

A partial checkpoint must record at minimum: integrated SHA, completed scope, remaining scope, pending validation, known failures, next action, and handoff/recovery reference. Also preserve exact unresolved requirements, blocker classification and root cause, strategies already tried and prohibited from repeating, next safe strategies, machine-checkable waiting/reactivation predicates, evidence freshness, and the next ready WorkUnit.

Use the shared contract in `../development-lifecycle/SKILL.md`. A recoverable
gap, missing owner, or resource wait remains open and actionable; a handoff is
not task completion until the outcome's Definition of Done is met.

## Promotion constraints

- Do not create or retain per-session branches as a substitute for central integration. If concurrency or required GitHub protection needs a temporary branch/PR, merge it within this lifecycle and remove the temporary ref only after verifying its commit is in configured canonical ref.
- Serialize the short promotion step if needed to avoid races. Do not wait for unrelated sessions or a heavy-check slot.
- Never force-push or bypass required repository protection.
- A failed fast gate blocks promotion of the failing delta, not all useful progress. First split and promote any independent safe subset when possible. Preserve the remaining exact change durably and report `FAST_GATE_BLOCKED`, the failure, owner, and next action.
- A heavy-check failure after promotion does not remove or strand the integrated work. Repair on configured canonical ref.
- Preserve uncommitted work owned by other sessions. Never stage it, overwrite it, or remove its worktree as part of this lifecycle.

## Outcomes

- `CHECKPOINT_PROMOTED_PARTIAL`: safe valuable partial progress is reachable from configured canonical ref; task remains open with a durable handoff/next action.
- `PROMOTED_TO_CANONICAL`: implementation scope is complete and the implementation commit is reachable from configured canonical ref; post-integration checks may remain pending.
- `ALREADY_CANONICAL`: equivalent progress is already integrated and no unique valuable delta remains.
- `FAST_GATE_BLOCKED`: the remaining delta cannot safely enter the configured canonical ref; exact failure, durable recovery location, owner, and next action are recorded. This is not completion.

Do not claim heavy verification, UAT, production readiness, or deployment unless each has its own passing evidence.
