# Worktree Discipline

Use worktree discipline to isolate risky or broad code changes from unrelated
dirty work. This is a workflow rule, not a requirement for every tiny edit.

Workspace freshness is a separate required outcome: after integration, a dirty
or task-branch worktree remains preserved, while a clean worktree at the latest
configured canonical SHA is made available for new/unrelated work and reported
by absolute path. Do not conflate keeping an active task isolated with leaving
the user's only visible editor/SSH workspace stale.

## When Worktrees Are Required

Create or recommend a separate worktree when any of these are true:

- scope is `large` or `project`
- risk is `high` or `critical`
- the repository has unrelated dirty files in the same paths that will be edited
- multiple write agents would otherwise touch overlapping directories
- the work involves migrations, release automation, or large mechanical rewrites

## When Worktrees Are Optional

Worktrees are optional for:

- skill documentation and agent registry updates
- small single-domain patches with clean ownership
- read-only audits and planning
- work where the user explicitly asks to stay on the current branch

## Procedure

1. Check `git status --short`.
2. Identify unrelated dirty files and record them in `orchestra/progress.md`.
3. If the next edit overlaps unrelated dirty files, stop and ask for direction.
4. If worktree isolation is appropriate, create the task worktree through the
   shared workspace authority command. It performs filesystem admission,
   retries a resource failure only on an authorized policy fallback, preserves
   the requested base SHA, and registers task/session ownership:

   ```bash
   python3 scripts/development-lifecycle/workspace_authority.py create \
     --repository <repository-root> \
     --workspace <absolute-destination> \
     --base-sha <canonical-base-sha> \
     --role TASK_WORKTREE \
     --task-id <task-id> \
     --session-id <session-id>
   ```

   Continue from the returned `workspace` and `base_sha`; if fallback was
   selected, report that exact path. Do not replace this with raw
   `git worktree add` in a session workflow.
5. Never run destructive git commands to make a worktree clean.

## Repository Default

For repo-local skill-system updates, staying in the current worktree is allowed
when edits are confined to `skills/`, `.claude/agents/`, and `orchestra/`.
Existing dirty application files must be ignored and preserved.
