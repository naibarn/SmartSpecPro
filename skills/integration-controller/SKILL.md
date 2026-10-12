---
name: integration-controller
description: Promote independently useful development checkpoints promptly through the existing protected Git path; leave full acceptance to later phases.
---

# Integration Controller

The configured canonical ref is the shared **development** baseline, not a fully accepted production release. Integrate useful work while a larger SPEC still has open tasks. Follow repository branch protection and [development lifecycle](../development-lifecycle/SKILL.md).

## Normal integration of the current WorkUnit

1. Read the owned change and current canonical SHA. Do not start with a global scan of historical branches/worktrees for each normal development merge.
2. Check the smallest affected syntax/compile/focused test boundary, absence of unresolved Git conflicts, no accidentally committed secrets, and **actual required repository checks**. Repair a confirmed failure. Do not require full build, browser UAT, final SPEC verification, production resources, or unrelated workspace convergence unless they really are mandatory repository checks for that PR.
3. Preserve unrelated staged, unstaged and untracked files. Stage/commit only owned paths; use the existing version-aware `git_capabilities.py` for conflict resolution when relevant. Never force-push, bypass protection or conceal a failed check.
4. Persist the source branch, WorkUnit, owned commit SHA, intended PR and pending action in the **existing HandOff before promotion**. Push through the established non-force PR/merge-queue flow. Wait for the required GitHub merge conditions, repair failures that belong to the slice, then merge through the authorized path. A PR is not complete until the resulting canonical SHA is confirmed.
5. Record the confirmed merged SHA, PR, WorkUnit/section, remaining gaps, checks pending and next action in the same HandOff. If interrupted between merge and record-write, first query GitHub/current Main to reconcile **whether it already merged**; do not create duplicate PRs or repeat a commit. Refresh next-slice work from the verified SHA without resetting other active worktrees.
6. Queue additional verification and development preview **after integration**; if it finds a defect, repair and promote a new checkpoint.

If a delta is not integration-ready, split out a smaller independently useful checkpoint and preserve the rest. If an actual required GitHub check cannot pass, keep the PR open with the precise failing check and actionable repair; proceed on independent work. Never mark a skipped, resource-blocked or absent check PASS.

## Resume and repository recovery

A user-requested *repository recovery* may inventory old PRs, merged/squash-equivalent branches, dirty worktrees and unique unpushed work. That expensive inventory is **not** part of every normal feature merge. Never delete, clean, prune, reset or retire another session's work without ownership and preservation proof. A dirty canonical user checkout is preserved; it does not prevent integration from a clean registered task checkout.

## Completion report

Provide only source branch/owned scope, canonical SHA before/after, required check status, integrated result (or actual merge blocker), and HandOff next action. For Spec-backed work update the existing canonical HandOff using `skills/development-lifecycle/spec-handoff-contract.md` when available. Integration does not certify UAT or production readiness.

If development previews are part of the workflow, track time-to-first-preview as a delivery metric; a preview is not requirement acceptance.
