# TDD guidance

## Red tests first

1. Premium chunk 2 prompt contains a thread ID opened by chunk 1.
2. Premium missing-episode recovery receives the same canonical ID set.
3. A thread with `expectedResolutionEpisode: 4` unresolved after episode 4 produces a due issue.
4. A `season` thread remains valid at the season boundary.
5. Recovery rejects an invalid checkpoint without calling the persistence writer.

## Regression tests

- Existing story continuity suite.
- Existing standard and Premium deep-draft suites.
- New bounded repair/recovery suite with mocked Redis and database boundaries.
- Router/job failure shape test proving the original bible is not written before validation.

## Verification

- Run focused Vitest files from `apps/web`.
- Run `git diff --check` on changed files.
- Query the existing Redis checkpoint and PostgreSQL series #25 before and after recovery.
- Report repository-wide typecheck separately if unrelated baseline diagnostics remain.
