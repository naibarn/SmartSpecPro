# Worktree Discipline

Use worktree discipline to isolate risky or broad code changes from unrelated
dirty work. This is a workflow rule, not a requirement for every tiny edit.

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
4. If worktree isolation is appropriate, create a branch using the current repo
   naming convention and perform edits there.
5. Never run destructive git commands to make a worktree clean.

## Repository Default

For repo-local skill-system updates, staying in the current worktree is allowed
when edits are confined to `skills/`, `.claude/agents/`, and `orchestra/`.
Existing dirty application files must be ignored and preserved.

