# Git Operations

Git handling for /deep-implement.

## Safety Principles

1. **Never run destructive commands** unless explicitly requested
   - No `git reset --hard`
   - No `git push --force`
   - No `git clean -fd`

2. **Never skip hooks** unless user explicitly chooses to

3. **Never modify git config**

4. **Validate paths** before any file operation

## Git Detection

```python
check_git_repo(target_dir) -> {"available": bool, "root": str}
```

Run at setup. Git is required - if not available, the setup script will fail with an error.

## Canonical Baseline Check

The setup script runs the repository's configured canonical-source preflight,
which fetches `remote/canonical_ref` and proves the task branch contains that
exact SHA. A canonical branch, stale base, dirty implementation workspace, or
in-progress Git operation blocks implementation. Preserve all existing work;
create/reconcile an isolated task worktree from the fetched SHA before resume.
Repositories without `.development-repository.toml` use their documented
trunk workflow and must still begin from a freshly fetched base.

## Staging Changes

Always name every task-owned path explicitly, including new and modified files:
```bash
git add -- path/to/new/file1.py path/to/modified/file2.py
```

This is ordinary task staging. For merge/rebase/cherry-pick conflicts, do not
use ordinary or broad staging as a resolution shortcut. Use the shared
`skills/development-lifecycle/git_capabilities.py resolve --repo <worktree>
--path <owned-path>` policy, adding `--expected-unmerged <path>` for each
explicitly known conflict that remains in the integration. Unlisted paths
block continuation. The policy selects native `git add --resolved --`
starting with Git 2.56 and an explicit-path, marker-checked fallback on older
Git. Check staged-before, intended paths, staged-after, remaining unmerged
paths, and `git diff --cached --check`; keep semantic verification separate.

## Generating Diffs

For code review:
```bash
git diff --staged
```

## Commit Style Detection

Read recent commits and detect style:

```bash
git log --oneline -20 --format=%s
```

**Conventional:** `feat:`, `fix:`, `docs:`, `chore:`, etc.
**Simple:** Regular sentences

Match the detected style in commit messages.

## Commit Creation

Use HEREDOC for message formatting:

```bash
git commit -m "$(cat <<'EOF'
Implement section 01: Foundation

- Very concise summary of features/changes

Plan: section-01-foundation.md
Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Storing Commit Hash

After successful commit:

```bash
git rev-parse HEAD
```

Store in session config for resume verification.

## Resume Verification

To check if a commit hash is valid:

```bash
git cat-file -t <hash>
```

Returns "commit" if valid, error otherwise.

## Path Safety

Before any file write, validate path is under allowed root:

```python
def validate_path_safety(path: Path, allowed_root: Path) -> bool:
    resolved_path = path.resolve()
    resolved_root = allowed_root.resolve()
    return str(resolved_path).startswith(str(resolved_root))
```

Reject:
- Absolute paths outside root
- Paths with `..` that escape root
- Symlinks pointing outside root
