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

## Branch Check

At setup, check current branch:

```bash
git branch --show-current
```

Use the configured canonical branch in the primary checkout by default when repository policy permits it. A `main`/`master` label is not proof of GitHub branch protection and does not require a warning, feature branch or worktree. If actual repository protection requires a PR, use a temporary branch in this same checkout and integrate it through the required path. Preserve unrelated edits during any branch switch.

## Working Tree Check

At setup, check if working tree is clean:

```bash
git status --porcelain
```

If dirty, inspect ownership and preserve unrelated files. Continue only with explicit task-owned paths; never stage or overwrite another session's work.

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

## Integration and temporary source cleanup

A stored local commit or pushed branch is not canonical integration. Follow the
shared development lifecycle workspace policy: fetch/reconcile, pass the
focused fast gate, push directly when allowed or merge the required PR, and
verify the actual integrated SHA. Return to the primary canonical checkout.
If this task created an exceptional worktree/branch, finish safe retirement
after integration or record its exact path and concrete cleanup blocker in the
existing HandOff. Do not create another worktree per implementation section.

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
