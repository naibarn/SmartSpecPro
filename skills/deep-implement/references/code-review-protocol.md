# Code Review Protocol

Code review workflow for a completed section before commit.

## Purpose

Catch correctness, regression, security, and test coverage issues before creating the section commit.

## Artifacts

Write review artifacts under:
- `{planning_dir}/reviews/section-NN-diff.md`
- `{planning_dir}/reviews/section-NN-review.md`

## Steps

### 1) Ensure Staged Diff Exists

```bash
git diff --staged > {planning_dir}/reviews/section-NN-diff.md
```

If staged diff is empty, skip review and continue.

### 2) Perform Local Review

Review the staged diff against `section-NN-*.md` requirements:
- Functional correctness
- Regressions against existing behavior
- Security/authorization/tenant checks
- Performance red flags
- Missing tests for changed behavior

### 3) Write Review Notes

Create `{planning_dir}/reviews/section-NN-review.md` with:
- Findings (severity-tagged if needed)
- Suggested fixes
- Optional follow-up items (non-blocking)

Keep notes concise and implementation-focused.

### 4) Continue to Triage

Use `code-review-interview.md` to decide:
- what to auto-fix,
- what to ask user.
