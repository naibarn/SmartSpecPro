# Section 03 — Verification

## Ownership

Run focused tests and inspect only scoped diffs. Do not clean or stage unrelated dirty files.

## Checks

1. Wizard resolver/component Vitest suites.
2. Preset synthesis/router focused tests.
3. Skill fixture verifier.
4. `git diff --check` for changed files.
5. Changed-file TypeScript diagnostics/build command if supported by the package scripts.
6. Confirm no migration, old-series data, episode duration, or 9-shot files changed.

## Recorded verification (2026-08-11)

- Focused Vitest: 5 files, 159 tests passed, including the wizard's 43 tests,
  resolver tests, v1/v2 synthesis tests, and premise/router tests. The wizard
  checks also cover always-visible optional-field guidance outside the inputs.
- Lineage regression: 1 file, 18 tests passed after updating its fixture to
  follow the real draft-gate flow (generate, choose/enter title, apply).
- Skill fixture verifier: passed without provider calls.
- Partial-input contract: verified in both v1 and v2 prompt tests. Blank
  creator fields are sent as permission for coherent AI completion; a missing
  creator title requires 4-5 title candidates, while a supplied title remains
  authoritative.
- Full web TypeScript check: the first run exhausted the default Node heap;
  the 8 GB rerun completed with existing errors in unrelated admin/chat/media/
  marketplace/episode/presentation/worker files. No error referenced the
  changed wizard, synthesis service, or skill files.
- `git diff --check`: passed for the scoped implementation files.
- Existing dirty worktree changes were preserved. The scoped implementation
  does not add a migration or modify episode duration/shot planning behavior.

## Acceptance

Report focused passes separately from any pre-existing repository-wide failures. Stop and fix
any scoped regression before considering the feature complete.
