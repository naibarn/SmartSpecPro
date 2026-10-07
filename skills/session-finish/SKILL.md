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
  → resolve/converge the registered canonical user workspace
  → retire the task worktree only after recovery/integration evidence
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
   Before declaring the session complete, inspect Git state with `python3 skills/development-lifecycle/git_capabilities.py inspect`. An intentional merge/rebase/cherry-pick must be completed or handed off explicitly; unresolved paths block completion. For conflict resolution, use the shared helper with explicit owned paths and verify its staged-before/intended/staged-after sets. Do not absorb pre-existing staged paths outside task ownership. Record the expected branch, commit SHA, remote push result where required, and worktree status in the handoff; a clean-looking status alone is not proof of integration.
3. Fetch the latest configured canonical ref, reconcile the task with it, and repeat the fast gate on the exact candidate commit.
4. Commit the largest safe task-owned checkpoint and integrate it into configured canonical ref using the normal non-force GitHub path. Do not wait for the whole task to complete. If only a subset can safely integrate, split that subset, promote it, and preserve the unsafe/incomplete remainder with an explicit handoff/recovery reference.
5. Confirm the integrated commit is reachable from the updated configured canonical ref. Report its SHA, whether progress is `PARTIAL` or `IMPLEMENTATION_COMPLETE`, remaining scope, next action, and post-integration checks still outstanding.
6. Resolve and converge the registry's `CANONICAL_USER_WORKSPACE` through `scripts/development-lifecycle/workspace_authority.py`, using the integrated SHA. When this is Spec 224 completion evidence, pass the exact development run ID with `--task-id` and register the task worktree with that same ID. The resolver preserves dirty work and records recovery evidence before any update. Do not substitute a newly created alternate folder for the registered user workspace. If convergence is blocked, record the exact reason and leave completion pending.
7. Record task workspace SHA, integrated SHA, canonical SHA, canonical user workspace SHA, convergence receipt, recovery linkage, and retirement status. Retire an owned temporary worktree only after its changes are verified integrated or durably archived; run dry-run first. A dirty/stashed/unpushed/live-owned/unknown worktree remains preserved and completion stays pending.
8. Run post-integration verification through CI, a dedicated runner, or an admitted safe resource window. Track each obligation against the integrated SHA with an owner, status, and next action.
9. If verification finds a regression, create a repair task from current configured canonical ref, fix it there, pass the same fast gate, promote a new commit to configured canonical ref, then converge the registered canonical workspace again. Preserve history; do not hide the fix in a side branch.

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
- Never force-push or bypass required repository protection. Reject `git push --force`, `git push -f`, `git push --force-with-lease`, and equivalent force refspecs in normal session-finish work. Reconcile with the remote and use the normal non-force PR path. An emergency/recovery exception requires its dedicated explicit authority path and durable before/after-ref recovery evidence; it is not a routine branch repair.
- A failed fast gate blocks promotion of the failing delta, not all useful progress. First split and promote any independent safe subset when possible. Preserve the remaining exact change durably and report `FAST_GATE_BLOCKED`, the failure, owner, and next action.
- A heavy-check failure after promotion does not remove or strand the integrated work. Repair on configured canonical ref.
- Preserve uncommitted work owned by other sessions. Never stage it, overwrite it, or remove its worktree as part of this lifecycle.
- Do not treat `git fetch`, a pushed branch, or an isolated build as proof that the editor/SSH workspace is current. Report the exact workspace path and SHA after synchronization; if a clean canonical workspace cannot be prepared, state the concrete blocker and preserve the old checkout.

## Outcomes

- `CHECKPOINT_PROMOTED_PARTIAL`: safe valuable partial progress is reachable from configured canonical ref; task remains open with a durable handoff/next action.
- `PROMOTED_TO_CANONICAL`: implementation scope is complete and the implementation commit is reachable from configured canonical ref; post-integration checks may remain pending.
- `ALREADY_CANONICAL`: equivalent progress is already integrated and no unique valuable delta remains.
- `FAST_GATE_BLOCKED`: the remaining delta cannot safely enter the configured canonical ref; exact failure, durable recovery location, owner, and next action are recorded. This is not completion.

Do not claim heavy verification, UAT, production readiness, or deployment unless each has its own passing evidence.

## Canonical Spec resume capsule

For Spec-backed work, persist the resume capsule through the canonical manifest writer described in `skills/development-lifecycle/spec-handoff-contract.md`. Include canonical SHA, manifest generation, completed WorkUnits, unresolved requirement IDs, blocker class/root cause, attempted and prohibited strategies, waiting/reactivation predicates, evidence freshness, next ready WorkUnit, and resume point. `orchestra/progress.md` links to this capsule and is not a competing Spec status source.
