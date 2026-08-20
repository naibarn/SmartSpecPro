# TDD guidance

## First tests

Add pure tests in the existing character CRUD test file for the disclosure
default helper:

- `hasPrimaryPortrait: false` returns `true` (expanded).
- `hasPrimaryPortrait: true` returns `false` (collapsed).

If the current component test harness can support a focused render without
mounting the entire component, assert the trigger's `aria-expanded` and content
test id. Do not create a broad page test solely for this state change.

## Implementation proof

- Run the target character component test files, especially reference-picker,
  candidate-recovery, CRUD, and portrait-asset resolver tests.
- Run `pnpm exec prettier --check` only if the repository's existing scripts
  require it; otherwise use the package's focused Vitest command.
- Run `git diff --check`.
- Run changed-file TypeScript diagnostics if available; distinguish baseline
  full-repo failures.

## Regression checks

Verify by source/test evidence that:

- `setPrimaryPortrait` payload and mutation remain unchanged.
- `buildPreviewCharacterPromptInput` still accepts 1–5 counts.
- polling effects are not inside the collapsed conditional branch.
- read-only guards remain intact.
