# Orchestra Artifact Management

> **Note:** `orchestra/` is at project root and is shared across sessions.

The `orchestra/` working directory is the single source of truth for an orchestration session. It lives at the project root — for example, `<absolute-repo-root>/orchestra/` — relative to the current working directory when `/orchestra` is invoked.

**Concurrent-session limitation:** If two developers simultaneously run `/orchestra` sessions, they will share this directory — this is an acceptable limitation for a single-developer workflow tool.

---

## File Inventory

| File | Created When | Updated When | Retired When | Purpose |
|------|-------------|--------------|--------------|---------|
| `plan.md` | Step 1 (task analysis) | Step 2 (routing), Step 3 (wave plan) | Never | Scope, risk, route, wave structure |
| `progress.md` | Step 5 (first wave complete) | Every wave integration | Never | Wave status: completed / in-progress / pending |
| `backlog.md` | Step 2 (when any planning/implementation chain is needed) | When items are resolved | Never | Pending items, expected artifact paths from automatic deep-* chains |
| `decisions.md` | First auto-decision | Every auto-decision (append-only) | Never | Timestamped log of all conductor decisions |
| `contracts.md` | Step 3 (contract definition) | Never after Wave 1 | Never | Agent interface contracts (frozen after Wave 1) |
| `platform.md` | First platform detection | Never (permanent) | User deletes it | Detected platform (claude-code / standard / open-code) |
| `decision-mode.md` | First mode selection | Never (permanent) | Never | Decision mode (ask_every_choice / smart_auto / auto_by_default); user may edit the value but the file is never removed |
| `risk_register.md` | When security gate triggers | Each security gate run | Never | All security findings regardless of verdict |
| `snapshot.json` | Red-state CHC trigger | Every red-state checkpoint | Never | Structured machine-readable session checkpoint |
| `snapshot.md` | Red-state CHC trigger | Every red-state checkpoint | Never | Human-readable session summary for context restoration |
| `archive/` | First fresh-start run | Never | Never | Timestamped copies of old `orchestra/` contents |

---

## Lifecycle Rules

### `contracts.md` — Frozen After Wave 1

`contracts.md` is written once during Step 3 (contract definition, before Wave 1 begins) and **never modified** after Wave 1 starts. This ensures that all sub-agents operating in Wave 1 and later work from stable interface definitions. If a contract must change:

1. Document the required change in `decisions.md` with a timestamp and rationale.
2. Plan a new wave specifically to re-define contracts.
3. Only write the new `contracts.md` after that wave is fully planned and gated.

### `decisions.md` — Append-Only with Timestamps

Every entry in `decisions.md` is timestamped and appended to the end of the file. **No entry is ever deleted or edited after it is written.** Format:

```
[YYYY-MM-DDTHH:MM:SSZ] DECISION: <what was decided>
  Context: <why this was needed>
  Alternatives considered: <if any>
```

This append-only constraint provides a full audit trail across compaction events and session resumes.

### `progress.md` — Wave Status Log

`progress.md` is updated after every wave integration. Each wave gets a status line; completed waves are never removed. Use the format:

```
[COMPLETE] wave-N-name — {brief description of what was delivered}
[IN-PROGRESS] wave-N-name — {current sub-step}
[PENDING] wave-N-name — {planned, not yet started}
```

### `risk_register.md` — Security Gate Output (Append-Only)

`risk_register.md` accumulates all security findings from every security gate run. Like `decisions.md`, it is **append-only** — no finding is ever deleted or overwritten. Findings that are resolved are noted with a `[RESOLVED]` annotation appended after the original entry, not by editing the original.

### `snapshot.json` and `snapshot.md` — Checkpoint Files

Both snapshot files are overwritten (not appended) each time a red-state CHC triggers. The previous snapshot is superseded by the new one. If you need a snapshot history, commit the files to git before the next checkpoint. See `compaction-safety.md` for the write protocol.

---

## Fresh Start vs. Resume

When `/orchestra` is invoked and an existing `orchestra/` directory is detected at the project root:

1. **Archive the existing directory:** Move the entire `orchestra/` directory to `orchestra/archive/<ISO-8601-timestamp>/`. For example: `orchestra/archive/2026-02-22T14:30:00Z/`.
2. **Create a fresh `orchestra/` directory** and proceed with a new session.

This convention ensures that old session data is never deleted — only moved aside — so recovery from an incorrect fresh start is possible by moving the archived directory back.

**Do NOT delete** the old `orchestra/` directory. Archiving is mandatory.

---

## Git Tracking

`orchestra/` **should be committed** to the project repository. It is not ephemeral — it documents decisions, contracts, and progress that have long-term value as project history.

Use git/GitHub as the default recovery mechanism for orchestration state. This means the conductor should prefer recoverable file/history workflows over interactive confirmation prompts whenever the risk is limited to repo-local changes.

**Important:** Your project's `.gitignore` must **NOT** exclude `orchestra/`. Verify this before and after adding the directory to git.

Recommended commit workflow:
- Commit `orchestra/` at the end of each wave cycle, together with the wave's output artifacts.
- Use commit messages like: `chore: orchestra progress — wave N complete`

Confirmation policy:
- Do not ask the user for approval just because a repo-local change might need future rollback.
- Use git history, branches, and the GitHub-backed remote as the control/recovery layer instead.
- Ask only when the next action can destroy data or state that is not safely recoverable from the repository.

Backup-first extension:
- If the upcoming action risks data loss beyond ordinary repo-local edits, create a timestamped backup file set first.
- Store backup paths and restore notes in `orchestra/decisions.md` or `orchestra/progress.md`.
- Continue automatically after the backup is captured; lack of a backup is the blocker, not lack of user confirmation.

## Backup Conventions

Use a dedicated backup root inside the project when practical:

```text
{project_root}/orchestra/backups/
```

If the backup is feature-specific and should live near the work, this is also acceptable:

```text
{planning_dir}/backups/
```

### Naming Standard

Use timestamped names with UTC-like precision and a short purpose suffix:

```text
backup-{YYYYMMDD-HHMMSSZ}-{scope}-{kind}.{ext}
```

Examples:
- `backup-20260307-101530Z-users-table-pre-drop.sql`
- `backup-20260307-101530Z-media-library-json-export.json`
- `backup-20260307-101530Z-config-tree-pre-refactor.tar.gz`
- `backup-20260307-101530Z-sqlite-db-pre-migration.sqlite3`

### Required Backup Log Fields

Whenever a backup is created, record:
- absolute path
- timestamp
- source scope (table, file tree, config, dataset, etc.)
- backup format
- restore command or restore steps
- reason backup was required

Log these in `orchestra/decisions.md` or `orchestra/progress.md`.

### Preferred Formats by Data Type

| Risk Type | Preferred Backup |
|---|---|
| Postgres table/schema change | `.sql` dump or `.dump` archive |
| MySQL table/schema change | `.sql` dump |
| SQLite migration | copied `.sqlite` / `.db` file |
| JSON/CSV bulk rewrite | exported `.json` / `.csv` snapshot |
| File tree refactor | `tar.gz` archive or mirrored copy |
| Generated artifacts overwrite | copied artifact directory with timestamp suffix |

### Restore Note Standard

Always write a short restore note next to the backup log entry:

```text
Restore:
- command: <exact command if known>
- validation: <how to confirm restore worked>
```

**`orchestra/archive/` — Retention Guidance:**
The `archive/` subdirectory can accumulate many timestamped old sessions over time. To prevent unbounded growth:
- Exclude `orchestra/archive/` from git by adding it to `.gitignore` (it is not needed for project history).
- Periodically prune old archive entries manually once they are no longer needed for audit purposes: `rm -rf orchestra/archive/2025-*/`
- Never delete an archive entry from the current session — only prune entries from sessions you are confident are no longer needed.
