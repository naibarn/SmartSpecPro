# Primary Checkout and Worktree Policy

Repository/user instructions take precedence. For single-developer work, use
the existing primary source checkout on the configured canonical branch
(normally local `main` tracking `origin/main`). A remote-tracking ref is not a
workspace. Do not create a checkout per task, SPEC, section, agent or retry.
Older parallel examples do not override this policy.

## Select and refresh source in place

1. Inspect the current branch, staged/unstaged/untracked paths, any active Git
   operation and task ownership. Fetch the configured canonical ref. On a clean
   canonical branch that is behind, fast-forward with `git merge --ff-only` to
   its remote-tracking ref. If already current, continue there.
2. Resume existing task-owned edits/commits in place. Preserve unrelated dirty
   files and stage only owned paths (or owned hunks in a shared file). A dirty
   status alone does not require isolation. Verify the actual source/base used;
   do not claim a dirty checkout is an exact immutable canonical revision.
3. If stale or divergent, inspect the actual incoming changes, checkpoint safe
   owned progress and reconcile in the same checkout. Never stash, reset,
   switch over or commit unknown edits merely to obtain a clean status. An
   ownership ambiguity blocks only the overlapping edit; continue independent
   work and ask only if that ambiguity cannot be resolved from evidence.
4. Serialize writers that need the same file, index or branch. Read-only
   helpers and disjoint owned edits do not need separate worktrees. Only the
   conductor stages, commits, switches branches and integrates in a shared
   checkout; other writers must be idle for those operations.
5. Push directly to the configured canonical branch when allowed. If protection
   requires a PR, use a temporary branch in the same checkout, pass its actual
   required checks and merge it. A PR does not itself require another worktree.

Task size, security risk, migrations, documentation work, a new session and
optional full verification are not standalone reasons for another worktree.
Use the relevant safety/check controls in the primary checkout.

## Exceptions requiring another source directory

Use an additional worktree only for an explicit user request, demonstrated
concurrent operations that need incompatible revisions/outputs and cannot
safely be serialized, or an existing immutable build/release controller.

Before task-worktree creation, inspect existing worktrees and reuse/resume a
suitable owned one. Record the reason the primary checkout cannot serve the
operation, owner, base SHA, integration target and cleanup condition in the
existing HandOff; do not introduce a new approval form or ledger. In a
single-developer session, keep at most one temporary task worktree. Finish or
reuse that exception instead of accumulating more. Do not take over an active,
dirty or unknown workspace based only on its name or apparent age.

Where provided, create/register task worktrees through
`scripts/development-lifecycle/workspace_authority.py create`, outside the
source directory. Exact immutable artifact builds use the established
`canonical_source.py` controller and its leases. Creation utilities do not
imply that ordinary development or focused tests need isolation.

## Integration and closure

Commit a coherent safe owned slice after its focused fast gate and integrate
promptly through the normal non-force path. Fix ordinary conflicts and
task-caused failures. Optional reviews, UAT, full builds, old worktree cleanup
and overall SPEC acceptance do not postpone an otherwise permitted checkpoint.
Actual required repository checks still apply. A local commit, pushed feature
branch or open PR is not evidence of canonical integration.

After fetching the canonical ref, verify the integrated commit is reachable
from it. With a squash merge, reconcile the actual merged SHA and owned diff
instead of asserting the original feature SHA is an ancestor. Return to the
primary checkout and safely refresh the canonical branch. If dirty ownership
prevents a switch/update, preserve it and report the exact source path/SHA and
reason; do not manufacture a permanent alternate primary directory.

For a temporary task worktree/branch created by this task, complete cleanup in
the same lifecycle after integration and before claiming workspace closure:

- Leave the temporary directory and finish/release its owned writers/lease.
- Verify integration/equivalence and inspect tracked, untracked, ignored and
  local-only content. Never delete valuable files or another owner's data.
- Use the registered authority's `retire --workspace-id <id>` dry run, then
  `retire --workspace-id <id> --apply` only when it reports eligibility. Remove
  an owned temporary branch only after its work is proven integrated. Never
  force-delete a branch merely because Git cannot prove a squash merge.
- If retirement is blocked, report the exact path, retained content, blocker
  and next action in the existing HandOff. Repair safe task-owned causes;
  do not hide the leftover behind a completion claim or open another copy.

Existing immutable build/release directories have separate lease, artifact
retention and rollback ownership. Lease expiry does not mean disk cleanup.
Do not delete a serving generation, required artifact or rollback source, and
do not apply the task-worktree retirement command to an unsupported source
role. Use the controller's supported retention path; a missing cleanup path is
an explicit engineering gap, not permission for `rm -rf` or forced pruning.

## Decision examples

| Situation | Action |
|---|---|
| Clean `main`, new SPEC or large change | Work in the primary checkout |
| Unrelated dirty files outside owned scope | Preserve them and work in place |
| Dirty edits belonging to the same task | Resume/reconcile in place |
| Two writers need the same file | Serialize their edits |
| Required GitHub PR | Branch in the same checkout; merge and return to `main` |
| Focused tests or Markdown verification | Run in the current source checkout |
| Immutable artifact build/release | Use the existing exact-SHA controller |
| Owned task worktree already exists | Finish/reuse it before creating another |
