# Pre-Commit Handling

Guidelines for handling commit failures caused by hooks/linters/formatters.

## Common Outcomes

1. Hooks modified files (formatters)
2. Hooks failed with errors (lint/type/test)

## Case 1: Hooks Modified Files

1. Re-stage changed files:

```bash
git add -u
git add <new_files_if_any>
```

2. Retry commit (max 2 retries).
3. If still changing repeatedly, stop and report loop behavior.

## Case 2: Lint/Type Errors

Summarize key errors to user and ask for direction:
- `fix_now` = Fix now and continue
- `no_verify` = Commit with `--no-verify`
- `pause` = Pause

Use `--no-verify` only with explicit user approval.

## Logging

Record hook behavior in section progress artifact:
- retries
- whether hooks were bypassed
- notable errors
