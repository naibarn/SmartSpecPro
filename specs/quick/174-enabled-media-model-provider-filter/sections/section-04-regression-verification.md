# Section 04 — Regression verification

## Ownership

Own focused test additions and verification output. Do not alter unrelated
worktree files or broad-format the repository.

## Work

- Run registry, media-model-router, provider-router, and existing generation
  selection tests.
- Inspect `git diff --stat`, owned hunks, and `git diff --check`.
- Separate focused proof from known repository-wide typecheck or environment
  failures.

## Acceptance checks

- Image, video, and audio disabled-provider regressions pass.
- Recommended endpoints and public catalog agree.
- Admin visibility and direct generation fail-closed tests pass.
- No migration, deployment, browser, production DB, or paid provider claim is
  made without corresponding evidence.

## Implemented

- Focused catalog/provider suites pass: 4 files and 61 tests.
- The related `media.getModels` disabled-provider regression passes separately.
- Full web typecheck exceeded the bounded 45-second verification window with
  no diagnostics and is not claimed as passing.
