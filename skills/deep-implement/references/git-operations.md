# Git Operations (Codex)

Git safety and commit workflow for section-based implementation.

## Safety Rules

- Never run destructive commands unless explicitly requested.
- Never force-push as part of this skill.
- Never amend unrelated user commits.

## Preflight Commands

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

If on protected branch (`main`, `master`, `release/*`), warn and ask user whether to continue.

If working tree is dirty, warn and confirm continuation.

## Staging

```bash
git add -u
git add <new_files_if_any>
```

## Review Diff

```bash
git diff --staged
```

## Commit

One commit per section, including tests and section-doc updates.

Suggested template:

```text
Implement section NN: <short-name>

- <change 1>
- <change 2>

Plan: section-NN-<short-name>.md
```

## Commit Hash

Capture after success:

```bash
git rev-parse HEAD
```

Store in implementation progress notes.
