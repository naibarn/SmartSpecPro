# Section 01 — Authoritative evidence normalization

## Implementation status

Completed 2026-07-13.

## Ownership

- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- `apps/web/server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`

## TDD expectations

Start from the exact production mismatch. Assert first-response success, authoritative
persisted evidence, provisional status, and single credit deduction. Preserve strict
negative coverage for candidate count, role tier, approved identity, malformed prompts,
and structured-history score thresholds.

## Implementation contract

- Normalize before nested Character DNA validation.
- Clone; do not mutate raw output.
- Allowlist four server-observable evidence fields.
- Downgrade unsupported `pass` only.
- Keep defense-in-depth evidence equality checks.
- Log bounded correction metadata only.

## Acceptance checks

- Focused service tests pass.
- Related Character DNA tests pass.
- `npm run check` passes.
- Scoped `git diff --check` passes.

## Actual implementation

- Added a pure, immutable pre-validation normalizer in
  `verticalDramaCharacterImageGeneration.ts`.
- Normalized only the four server-observable comparison fields.
- Applied the one-way `pass` to `provisional` safety downgrade for adult leads with
  incomplete history.
- Preserved literal-3 candidate validation, role-tier validation, approved identity lock,
  prompt completeness, and structured-history score gates.
- Added bounded `skill_execute` audit metadata for corrections without story/prompt data.

## Verification

- Focused service suite: 119 tests passed.
- Related Character DNA suites: 180 tests passed across 4 files.
- TypeScript `tsc --noEmit`: passed immediately after the implementation. The final rerun
  was later blocked by unrelated concurrent workspace/dependency errors in admin/chat/editor,
  Tiptap, React types, and ioredis; no diagnostic referenced either changed file.
- Scoped `git diff --check`: passed.
- Direct conductor review: clean after one auto-fix to make audit correction assertions
  exact. Sub-agent review was skipped because delegation was not explicitly authorized.

## Coordination risk

The target service and test file are currently not modified in the dirty worktree, but
adjacent Vertical Drama files contain unrelated user work. Stage or commit only these
files and planning artifacts if explicitly requested later.
