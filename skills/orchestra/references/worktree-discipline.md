# Worktree Discipline

Follow the shared [primary checkout and worktree policy](../../development-lifecycle/workspace-policy.md).
Use the primary source checkout for ordinary work, including large changes,
migrations, skill updates and focused verification. Neither risk labels nor
dirty files alone require a worktree. Preserve unrelated edits and serialize
overlapping writers. A required PR can use a branch in the same checkout.

## Exceptional isolation

Only an explicit user request, demonstrated incompatible concurrent source
needs that cannot safely be serialized, or the existing immutable artifact
controller justifies another source directory. First reuse/resume a suitable
owned workspace. Record the reason, owner, integration target and cleanup
condition in the existing HandOff; no new approval step is needed.

If a task worktree is still necessary, create it outside the source checkout
through the existing authority, preserving resource admission and ownership:

```bash
python3 scripts/development-lifecycle/workspace_authority.py create \
  --repository <repository-root> \
  --workspace <absolute-destination-outside-repository> \
  --base-sha <canonical-base-sha> \
  --role TASK_WORKTREE \
  --task-id <task-id> \
  --session-id <session-id>
```

Use the returned path and base SHA. Do not call raw `git worktree add` as a
session shortcut. For a single developer, finish/reuse the one temporary task
worktree instead of creating another for each section or retry. Immutable
build/release source workspaces remain owned by their existing controller.

## Close the exception

The conductor owns integration and cleanup in the same task lifecycle. Pass
the focused fast gate, integrate through the permitted Git path and confirm
the resulting commit in fetched canonical history. Return to the primary
checkout and safely refresh it. Leave the temporary directory, finish/release
its owned writers/lease, inspect remaining content, then run the authority's
retirement dry run and apply only when eligible.

Never discard dirty, local-only, ignored, unknown or serving/rollback data to
force cleanup. A blocked retirement must identify the path, content, exact
reason and next action. Repair safe task-owned causes instead of silently
abandoning the workspace. Historical cleanup and optional full verification
do not block integration of a safe current slice.
