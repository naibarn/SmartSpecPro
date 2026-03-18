# Pre-Commit Hook Handling

Handling pre-commit hooks during /deep-implement commits.

## Detection

At setup, detect pre-commit configuration:

1. **Framework:** `.pre-commit-config.yaml`
2. **Native:** `.git/hooks/pre-commit` (executable)

### Known Formatters

These hooks modify files and may require re-staging:

**Python:**
- black, isort, autopep8, yapf, ruff-format

**JavaScript/TypeScript:**
- prettier, eslint (with --fix)

**Rust:**
- rustfmt, fmt

**Go:**
- gofmt, goimports

## Commit Workflow

```
┌─────────────────────────────────────┐
│         Attempt git commit          │
└─────────────────┬───────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
    SUCCESS              FAILED
        │                   │
   Record hash        ┌─────┴─────┐
   Continue           │           │
                   Modified   Lint Error
                   Files      (no mods)
                      │           │
                  Re-stage    Present to
                  Retry       User
                  (max 2)        │
                      │      ┌───┴───┐
                      │      │   │   │
                      └──────│───│───┘
                             │   │
                           Fix Skip Stop
```

## Handling Modified Files

When commit fails and `git status` shows modified files:

1. Log which files were modified:
   ```
   Pre-commit modified files:
     - src/models.py (formatter)
     - src/utils.py (formatter)
   ```

2. Re-stage modified files:
   ```bash
   git add src/models.py src/utils.py
   ```

3. Retry commit (fresh commit, NOT amend)

4. Max 2 retries to prevent infinite loops

5. If still failing after retries, auto-fix (see below)

## Handling Lint Errors (Auto-Fix)

When commit fails with lint/check errors (no file modifications):

**Do NOT ask the user. Auto-fix in this order:**

1. Parse pre-commit output for specific errors
2. Run the project's formatter/linter fix command (e.g., `prettier --write`, `black`, `ruff --fix`)
3. If specific errors identified → fix them directly in the code
4. Run tests to verify fixes don't break functionality
5. Re-stage all changes
6. Retry commit

**If auto-fix fails after 2 attempts:**
- Log: `Pre-commit hook still failing after auto-fix attempts.`
- **Do NOT use --no-verify** — pre-commit hooks may include secret scanning and security checks that must not be bypassed
- Skip this section's commit — leave staged changes in place
- Log in review file: "Note: Section commit deferred due to persistent pre-commit failure"
- Continue to next section — the uncommitted section will be flagged in finalization report

**Never stop the workflow for pre-commit failures, but never bypass security hooks either.** Deferred commits are safer than bypassed hooks.

## State Tracking

Store pre-commit info per section in session config:

```json
{
  "sections_state": {
    "section-01-foundation": {
      "status": "complete",
      "commit_hash": "abc123",
      "pre_commit": {
        "hooks_ran": true,
        "modification_retries": 1,
        "skipped": false
      }
    }
  }
}
```

## Native Hook Limitations

For native hooks (`.git/hooks/pre-commit`):

- Cannot introspect behavior
- Warn user: "Native hook detected, behavior unknown"
- Apply same retry logic for modifications
- Cannot identify specific formatters
