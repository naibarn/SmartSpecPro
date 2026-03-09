# Backup Playbook

Shared backup-first guidance for skill workflows.

Use this reference whenever planned work may cause data loss, destructive
migration, bulk overwrite, or irreversible transformation.

## Core Rule

If the operation is risky, create a backup first and continue automatically
after backup succeeds.

Do not turn backup creation into a user confirmation gate unless:
- a reliable backup cannot be produced
- restore steps are unknown or untestable
- the operation affects external state outside the available recovery path

## Preferred Backup Location

Prefer project-local, timestamped backups:

```text
{project_root}/orchestra/backups/
```

If work is scoped to a planning directory, this is also acceptable:

```text
{planning_dir}/backups/
```

## Naming Standard

```text
backup-{YYYYMMDD-HHMMSSZ}-{scope}-{purpose}.{ext}
```

Examples:
- `backup-20260307-101530Z-users-table-pre-drop.sql`
- `backup-20260307-101530Z-media-library-pre-rewrite.json`
- `backup-20260307-101530Z-config-tree-pre-refactor.tar.gz`
- `backup-20260307-101530Z-sqlite-db-pre-migration.sqlite3`

## What To Log

For every backup, record:
- absolute path
- timestamp
- source scope
- format
- reason backup was required
- restore command or restore steps
- validation step after restore

## Quick Command Patterns

### Postgres

Full DB:

```bash
pg_dump --file "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-db-pre-change.sql" "$DATABASE_URL"
```

Single table:

```bash
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

### JSON / CSV

```bash
cp data/users.json "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-users.json"
cp exports/report.csv "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-report.csv"
```

### File Trees

```bash
tar -czf "orchestra/backups/backup-$(date -u +%Y%m%d-%H%M%SZ)-config-tree.tar.gz" config/
```

## Restore Note Template

```text
Restore:
- backup: /absolute/path/to/backup.ext
- command: <exact restore command if known>
- validation: <how to confirm restore succeeded>
```

## Verification Minimum

After backup creation, verify at least:
- file exists
- file size is non-zero
- path is logged into the current session notes

If verification fails, treat the risky operation as blocked until a valid backup
exists.
