# Apply Interview Fixes

Apply decisions recorded after section review triage.

## Source of Truth

Read:
- `{planning_dir}/reviews/section-NN-interview.md`

This file contains:
- user-approved changes
- auto-fixes selected during triage
- deferred items

## Steps

### 1) Load Decisions

Parse the interview notes and list concrete code/test updates to apply now.

### 2) Apply Fixes

For each selected fix:
1. Check if already applied
2. If not, implement it
3. Keep scope limited to current section

### 3) Validate

Run targeted tests (or section test command).

If tests fail, fix and re-run until green or escalate per section failure policy.

### 4) Re-Stage

```bash
git add -u
git add <new_files_if_any>
```

Then continue with section doc update and commit.

## Edge Cases

- If interview file has no actionable fixes, treat as no-op and proceed.
