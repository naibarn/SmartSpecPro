---
name: workspace-cleanup
description: "เก็บกวาด workspace: audit disk use, integrate stale task work, and retire redundant Git worktrees, build sources and release artifact copies using the repository's existing lifecycle controllers. Use for workspace cleanup, stale worktrees, disk space, or เก็บกวาด/ล้าง worktree."
---

# Workspace Cleanup

Use this skill when the user says `$workspace-cleanup`, “เก็บกวาด workspace”,
“ล้าง worktree เก่า”, or asks to reclaim repository/build disk space. Reuse
the [workspace policy](../development-lifecycle/workspace-policy.md) and the
existing controllers; do not create another cleanup engine or registry.

## Intent and authority

An explicit invocation without qualifiers means **inspect, then perform safe
cleanup**, including normal integration of valuable unfinished task work.
“Audit only”, “ตรวจอย่างเดียว” or “รายงานเท่านั้น” means no deletion or merge.
Creating/editing this skill alone does not invoke cleanup.

The single developer's cleanup request authorizes the routine path end to end.
Do not ask again before each eligible removal, merge, commit or push, or search
for another human owner. Lease/owner records coordinate real processes. Respect
actual repository protection and preserve in-flight writes and user data.

Work from the existing primary checkout. Do not create a branch, worktree,
replacement checkout, full build or deployment just to clean up. A cleanup
invocation does not request database mutation, service restart, deletion of
user uploads, or blanket removal of host history/backups.

## Inspect once, narrowly

1. Read `AGENTS.md`, `.development-repository.toml`, Git branch/index/diff and
   `git worktree list --porcelain`. Resolve the existing primary checkout and
   configured source/lease roots; a remote-tracking ref is not a directory.
2. Capture disk bytes/free inodes for the filesystems actually holding the
   primary checkout, source roots, artifacts and relevant backups. Fetch the
   configured canonical ref when checking integration. Preserve unrelated edits.
3. Use bounded `du -xhd1` only on identified hotspots. Avoid recursive whole-home
   or whole-disk scans and overlapping `du` jobs. Shared/hardlinked files make
   per-directory totals misleading; measure reclaimed space with before/after
   filesystem free bytes.
4. Treat a workspace with no job/source activity for **over one hour** as a stale
   candidate. Check completed build receipts, source writes and live lease/process
   evidence. Audit/status reads and registry housekeeping are not resumed work.
   Age alone is not proof that unique edits or serving/rollback input can be lost.

## Collect immutable build sources and artifacts

Run these from the primary repository root. The first command is a dry run;
inspect its eligible and retained lists. For a cleanup invocation, apply eligible
cleanup directly without another human checkpoint:

```bash
python3 scripts/development-lifecycle/canonical_source.py collect --repository .
python3 scripts/development-lifecycle/canonical_source.py collect --repository . --apply
```

The controller checks integration, detached source identity, generated content,
activity and the existing locks. It preserves two recent sources/artifacts and
all retained-release references, and keeps build/deployment receipts and fencing
history. Report those retained bytes separately from disposable accumulation.

If a build holds the source collector lock, continue with artifact-only cleanup;
it serializes only against release/publication and protects active build input:

```bash
python3 scripts/development-lifecycle/canonical_source.py collect-artifacts --repository .
python3 scripts/development-lifecycle/canonical_source.py collect-artifacts --repository . --apply
```

Do not spin/retry unchanged lock contention, cancel another job or falsely claim
its lock is held by this task. Retry source collection after the observed job
finishes when practical; otherwise report that exact deferred scope. Fix ordinary
controller errors within the authorized scope and continue independent cleanup.
If this repository lacks these controllers, inspect and report available supported
mechanisms; do not substitute forced deletion of unknown source/artifact roles.

## Integrate and retire stale task worktrees

Use this section only when non-build task/recovery worktrees actually exist.
Inspect registered roles and retirement eligibility through workspace authority:

```bash
python3 scripts/development-lifecycle/workspace_authority.py collect --repository . --mode AUDIT_ONLY
python3 scripts/development-lifecycle/workspace_authority.py retire --repository . --workspace-id ID
python3 scripts/development-lifecycle/workspace_authority.py retire --repository . --workspace-id ID --apply
```

- Replace `ID` with the inspected registered workspace ID. Use explicit per-path
  retirement after the stale check rather than treating every registry entry as
  disposable. Do not feed immutable build roles to task-worktree retirement.
- If the HEAD is already an ancestor of fetched canonical history, no duplicate
  merge is needed. For squash/cherry-pick history, verify the integrated change.
- If valuable code remains, use [development lifecycle](../development-lifecycle/SKILL.md)
  and [integration controller](../integration-controller/SKILL.md) to reconcile it,
  run a focused check, commit/push/integrate promptly, and verify reachability.
  Resolve ordinary conflicts in place; full UAT, optional full tests, historical
  cleanup and another owner's approval do not gate a safe development checkpoint.
- Preserve tracked, untracked and unknown ignored content. Fix stale local
  coordination records from actual process/Git evidence using supported authority
  operations; do not invent identities, grants or lease ownership. An unresolved
  overlapping edit blocks only that edit/workspace.
- For an explicitly requested recovery cleanup, use retirement's supported
  `--include-recovery` dry-run/apply path after verifying integration and retained
  content. This is not permission to delete all recovery archives.
- Remove a temporary branch only after proving its work integrated and unused.
  Keep shared stashes. Never use force-push, forced branch/worktree deletion,
  broad `git clean`, unknown resets/stashes, or raw recursive deletion as a shortcut.

## Orphan copies, archives and completion

Directories left by failed moves may no longer appear in `git worktree list`.
Check known recovery locations, manifests and backup evidence when disk use points
there. Distinguish active source, generated build output, orphan copies and
recovery/history bytes. Verify retained content/backup equivalence before retiring
an orphan; expired metadata or a broken `.git` pointer alone does not prove it
disposable. Keep unexplained content and report the exact path and next repair
action without turning it into a new approval workflow.

After applying, rerun the relevant dry run and filesystem measurements. If code or
skills changed, integrate owned paths and verify local canonical HEAD equals the
fetched remote tip; publish/verify changed mirrored skills. Do not stage others'
edits or run a full local typecheck/build as a cleanup check.

Reuse one local cleanup audit report (or the existing task HandOff). Record time,
profile (`quick` for inspection, `integration` for live retirement), revision,
commands, resource evidence, removed/retained paths and measured free-byte change.
Never copy secrets or lease tokens. If nothing eligible remains, finish; do not
repeatedly rediscover the same retained releases/archives as new work.

Reply concisely in Thai: space reclaimed and free on each relevant filesystem,
worktrees/artifacts removed and still active/retained, code/skill sync evidence
when changed, and any exact remaining path/reason. Do not claim retained bytes
were reclaimed or that an unrelated schema/release task is complete.
