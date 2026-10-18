---
name: integration-controller
description: Promote independently useful development checkpoints promptly through the existing protected Git path; leave full acceptance to later phases.
---

# Integration Controller

The configured canonical ref is the shared **development** baseline, not a fully accepted production release. Integrate useful work while a larger SPEC still has open tasks. Follow repository branch protection and [development lifecycle](../development-lifecycle/SKILL.md).

**Checkpoint trigger:** when the user asks to stop, pause, hand off, or switch subtasks, immediately checkpoint safe task-owned changes. Do not wait for the parent task, adjacent work, full verification or UAT. After the FAST INTEGRATION GATE, commit and push to `origin/main` when allowed. Use a PR only when branch protection requires it; do not add optional review steps. Never bypass real protection. Continue unrelated work while a required PR check is pending or failing.

## Normal integration of the current WorkUnit

1. Read the owned change and current canonical SHA. Do not start with a global scan of historical branches/worktrees for each normal development merge.
2. Check the smallest affected syntax/compile/focused test boundary, absence of unresolved Git conflicts, and no accidentally committed secrets. Repair failures caused by the change. Run actual required repository checks when branch protection requires them; they apply only to merging that PR and do not block independent work. Do not require full build, browser UAT, final SPEC verification, production resources, or workspace convergence for an ordinary code checkpoint.
3. Preserve unrelated staged, unstaged and untracked files. Stage/commit only owned paths; use the existing version-aware `git_capabilities.py` for conflict resolution when relevant. Never force-push, bypass protection or conceal a failed check.
4. Record the owned commit and pending action in the existing HandOff when one is already used for the task. Push directly to `main` when repository rules allow; otherwise open/use the required PR flow. Do not wait for unrelated work or full acceptance. For a PR, repair failures that belong to the slice and merge as soon as required conditions pass. Confirm the resulting canonical SHA.
5. Record the confirmed merged SHA, PR, WorkUnit/section, remaining gaps, checks pending and next action in the same HandOff. If interrupted between merge and record-write, first query GitHub/current Main to reconcile **whether it already merged**; do not create duplicate PRs or repeat a commit. Refresh next-slice work from the verified SHA without resetting other active worktrees. Workspace convergence is separate housekeeping: never let a dirty checkout delay this PR flow; if safe convergence is attempted and blocked, record the concrete reason and keep working from a clean canonical worktree.
6. Run additional verification or a development preview after integration when requested or useful for the change. These are not default prerequisites for every checkpoint. If verification finds a defect, repair and promote a new checkpoint.

If a delta is not integration-ready, split out a smaller independently useful checkpoint and preserve the rest. If an actual required GitHub check cannot pass, keep the PR open with the precise failing check and actionable repair; proceed on independent work. Never mark a skipped, resource-blocked or absent check PASS.


## Promote a ready PR

After the owned change passes required checks and the PR head is current, invoke the existing executor from the repository root:

```bash
python3 skills/integration-controller/scripts/promote_ready_pr.py --pr <number> --expected-head <sha> --execute
```

The executor rechecks the head, base, review and required checks, then merges with a head guard. Treat `ALREADY_MERGED` as a recovery result: verify the canonical SHA and record the existing merge receipt without merging again. Reconcile changed head/base/check state before retrying; retry at most three times, then preserve the blocker and continue independent work.

After integration, continue with the next ready independent WorkUnit. A parent task may remain open after partial canonicalization.

## Resume and repository recovery

A user-requested *repository recovery* may inventory old PRs, merged/squash-equivalent branches, dirty worktrees and unique unpushed work. That expensive inventory is **not** part of every normal feature merge. Never delete, clean, prune, reset or retire another session's work without ownership and preservation proof. A dirty canonical user checkout is preserved; it does not prevent integration from a clean registered task checkout.

## Completion report

Provide only source branch/owned scope, canonical SHA before/after, required check status, integrated result (or actual merge blocker), and HandOff next action. For Spec-backed work update the existing canonical HandOff using `skills/development-lifecycle/spec-handoff-contract.md` when available. Integration does not certify UAT or production readiness.

If development previews are part of the workflow, track time-to-first-preview as a delivery metric; a preview is not requirement acceptance.
