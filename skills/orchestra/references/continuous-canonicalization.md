# Continuous Canonicalization and Durable Handoff

## Meaning of the configured canonical ref

The repository/project policy's `canonical_ref` is the latest integrated development state. A repository may configure `origin/main`, `origin/develop`, `origin/trunk`, or another protected ref. This state does not certify release readiness, production readiness, or full validation. Release, tagging, production deployment, and runtime correctness have separate gates and evidence.

## Checkpoint policy

Do not wait for a task, feature, or spec to finish before integration. Promote a coherent, valuable checkpoint as soon as it passes the FAST INTEGRATION GATE defined by `session-finish` and the repo instructions. Examples include a backend slice before UI, schema/repository work before business logic, or an adapter kept disabled until provider validation.

Use an existing containment boundary for unfinished behavior when needed: a disabled feature flag, internal-only route, unregistered adapter, or equivalent. Checkpointing must not activate production behavior, execute a production migration, or bypass an established safety gate.

After each implementation wave or coherent task-owned slice:

1. Preserve unrelated work and identify the exact task-owned delta.
2. Reconcile with the latest configured canonical ref and select the largest coherent safe subset.
3. Pass the bounded FAST INTEGRATION GATE on that exact candidate.
4. Commit and promote the safe checkpoint through the normal non-force path; honor branch protection.
5. Verify the promoted SHA is reachable from the updated configured canonical ref.
6. Record the handoff and pending post-integration checks against that SHA.
7. Continue implementation from the new canonical state.

If the entire delta is not safe, split and promote an independent safe subset. Preserve the remainder durably with an owner, recovery location, failure/blocker, and next action. Resource-blocked heavy checks stay pending after integration and never turn a passing fast gate into a promotion blocker.

## Mandatory stop and handoff triggers

Run `$session-finish` before a user-requested pause/stop, quota or context exhaustion, provider timeout/rate limit, agent/developer ownership transfer, end of work window, or final session close. Also checkpoint whenever valuable work reaches a coherent safe boundary during implementation.

A partial handoff must include:

- work/task ID and `PARTIAL` or `IMPLEMENTATION_COMPLETE` state;
- integrated SHA and proof it is reachable from the configured canonical ref;
- completed and remaining scope;
- pending validation, known failures, and post-integration obligations tied to the SHA;
- owner, next action, and durable recovery/handoff reference.

Use `CHECKPOINT_PROMOTED_PARTIAL` when safe partial progress is integrated and the task remains open. Use `FAST_GATE_BLOCKED` only when a specific delta cannot pass the fast gate; state the exact failure and preserve the work durably. A checkpoint is not task completion, and task incompleteness is not a reason to strand safe code outside the configured canonical ref.

## Recovery path

The next session starts from current configured canonical ref, reads the durable handoff, verifies its referenced SHA and remaining scope, then continues. Heavy validation, UAT, provider/rights checks, release readiness, and production deployment are separate obligations. If a post-integration check finds a regression, create a repair task from latest configured canonical ref, pass the fast gate, and promote the repair as a new commit.
