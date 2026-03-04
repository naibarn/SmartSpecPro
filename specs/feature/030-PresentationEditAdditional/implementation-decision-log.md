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

## 2026-03-04 - Preflight continue on dirty workspace (rerun)
- section_or_step: preflight-continue-dirty-worktree
- options_considered:
  - stop until workspace is clean
  - continue implementation on top of existing changes
- decision_taken: continue implementation on top of existing changes
- mode_used: asked
- rationale: User explicitly replied `continue` during preflight gate for this run.

## 2026-03-04 - Section 05 ready-state contract shape
- section_or_step: section-05-ready-gate-contract
- options_considered:
  - keep boolean-only `window.__slideReady`
  - add `window.__slideReadyState` metadata with fail/degrade status and timeout code
- decision_taken: add `window.__slideReadyState` metadata with explicit status and timeout code
- mode_used: auto
- rationale: low-impact reversible protocol extension that preserves backward compatibility while enabling deterministic worker fail/degrade branching.

## 2026-03-04 - Section 06 warning-code compatibility model
- section_or_step: section-06-warning-contract-schema
- options_considered:
  - keep warning code enum strict and fail unknown codes
  - allow string warning codes with known-code taxonomy mapping
- decision_taken: allow string warning codes with taxonomy mapping helper
- mode_used: auto
- rationale: additive backward-compatible change that enables tolerant readers for mixed-version deployments.

## 2026-03-04 - Section 06 mixed-version promotion gate enforcement point
- section_or_step: section-06-warning-compat-gate
- options_considered:
  - enforce matrix gate only in docs/process
  - enforce matrix gate in `triggerPresentationExport` runtime path
- decision_taken: enforce runtime gate in `triggerPresentationExport`
- mode_used: auto
- rationale: this provides executable promotion blocking behavior and testable failure conditions for incomplete old/new reader-writer coverage.

## 2026-03-04 - Section 07 rollout policy verification approach
- section_or_step: section-07-runbook-verification
- options_considered:
  - document runbook text only
  - enforce required runbook clauses via docs-contract tests
- decision_taken: enforce required clauses via docs-contract tests
- mode_used: auto
- rationale: low-impact, reversible choice that prevents policy drift by making runbook requirements executable in CI.
