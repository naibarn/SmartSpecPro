# Section 02 — Focused proof

## Ownership

Own:
`apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.characterCrud.test.ts`.

## Work

- Test the pure default-state helper for both primary/no-primary cases.
- Preserve and rerun existing reference and candidate helper coverage.
- Use jsdom only if a render assertion is added; pure tests remain Node-safe.

## Acceptance

- Focused Vitest tests pass.
- `git diff --check` passes.
- Any full-repo typecheck failures are reported as baseline unless they point
  to changed files.
