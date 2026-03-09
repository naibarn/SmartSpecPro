# Git Operations

Git safety and commit workflow for section-based implementation.

## Safety Rules

- Never run destructive commands unless explicitly requested.
- Never force-push as part of this skill.
- Never amend unrelated user commits.
- Treat git history and the GitHub-backed repository as the primary recovery mechanism for implementation work. Recovery should come from commits/branches/history, not from repeated user confirmation gates.

## Preflight Commands

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
```

If on protected branch (`main`, `master`, `release/*`), warn strongly. Continue automatically when the work is still recoverable and non-destructive. Pause only if the next action would require history rewriting, force push, or another irreversible git operation.

If working tree is dirty, inspect overlap with target files and proceed automatically when overlap risk is low. Ask the user only if existing changes create ambiguous ownership, merge risk, or potential loss of work that git/GitHub history would not reliably recover.

If the planned implementation includes destructive data operations (for example dropping columns/tables, bulk rewrites, or irreversible transformations), create a timestamped dump/export/copy backup first and record how to restore it. Continue automatically after the backup succeeds.

## Backup Patterns for Risky Changes

Use these patterns before risky operations. Prefer project-local backup paths such as:

```bash
mkdir -p orchestra/backups
```

### Postgres

Schema/table backup examples:

```bash
pg_dump --file "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-db-pre-change.sql" "$DATABASE_URL"
pg_dump --data-only --table public.users --file "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-users-table.sql" "$DATABASE_URL"
```

### MySQL

```bash
mysqldump --single-transaction --quick --routines --triggers "$MYSQL_DATABASE" > "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-mysql-pre-change.sql"
```

### SQLite

```bash
cp app.db "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-app-db.sqlite3"
```

### JSON / CSV / File Trees

```bash
cp data/users.json "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-users.json"
cp exports/report.csv "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-report.csv"
tar -czf "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-config-tree.tar.gz" config/
```

### Required Follow-up

After creating a backup:
- record the absolute backup path
- record restore command/steps
- record why the backup was needed
- then continue automatically

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
