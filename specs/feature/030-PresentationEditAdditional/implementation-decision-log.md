# Implementation Decision Log

## 2026-03-03 - Commit strategy on dirty workspace
- section_or_step: preflight-commit-strategy
- options_considered:
  - `strict` (docs-only commits until cleaner tree)
  - `full` (section staging on current tree)
- decision_taken: `full`
- mode_used: asked
- rationale: User explicitly selected full mode for progressing section commits on top of current workspace state.

## 2026-03-03 - Test command adaptation
- section_or_step: preflight-test-command
- options_considered:
  - `pnpm --dir apps/web test -- <target>` (from PROJECT_CONFIG)
  - `npm --prefix apps/web test -- <target>`
- decision_taken: Use `npm --prefix apps/web test -- <target>`
- mode_used: auto
- rationale: Environment reports pnpm blocked by project packageManager policy for npm, while npm is available via nvm.

## 2026-03-03 - Sandbox listen restriction during route tests
- section_or_step: section-01-test-execution
- options_considered:
  - run `slideRender` tests in sandbox
  - rerun with elevated permissions
- decision_taken: rerun with elevated permissions
- mode_used: auto
- rationale: sandbox denied local test-port bind (`listen EPERM`), and elevated run passed all route tests.
