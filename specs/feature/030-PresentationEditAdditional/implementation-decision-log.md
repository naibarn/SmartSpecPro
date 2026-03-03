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

## 2026-03-04 - SVG validation fallback strategy
- section_or_step: section-03-svg-parity
- options_considered:
  - strict SVG parser in all paths
  - lightweight markup heuristic with bounded placeholder fallback
- decision_taken: lightweight markup heuristic with bounded placeholder fallback
- mode_used: auto
- rationale: low-impact reversible choice that prevents blank artifacts immediately with minimal cross-runtime parsing risk.

## 2026-03-04 - Section 03 route-test execution mode
- section_or_step: section-03-test-execution
- options_considered:
  - keep route tests in sandbox
  - rerun with elevated permissions
- decision_taken: rerun with elevated permissions
- mode_used: auto
- rationale: sandbox port-bind restriction caused repeat `listen EPERM`, while elevated run validated all targeted suites.

## 2026-03-04 - Section 04 implementation scope
- section_or_step: section-04-video-hardening
- options_considered:
  - force production-code refactor despite passing behavior
  - add missing lifecycle/autoplay tests only and keep current implementation
- decision_taken: add tests only; no production-code delta
- mode_used: auto
- rationale: low-impact, reversible decision that avoids churn while increasing regression protection around autoplay/lifecycle contracts.
