# Section 03: Focused verification

## Ownership

- No production or deployment files.
- Test commands and focused source review.

## Checks

1. Run Rust focused tests for health classification.
2. Run Worker App TypeScript typecheck.
3. Run the full Worker App Rust suite.
4. Run `git diff --check` on owned paths.
5. Inspect the final diff for accidental edits outside owned paths.

## Acceptance

- All focused checks pass.
- Any baseline/dirty-worktree failure is reported separately.
- Manual Windows/Tauri runtime acceptance is explicitly marked unperformed if
  unavailable in this environment.
