# Section 02 — Regression Verification

## Ownership

`apps/web/server/services/__tests__/verticalDramaRemotionRender.test.ts` and focused command output.

## Work

- Add signed worker URL assertions for sub-episode assembly and production assembly.
- Add resolver failure coverage.
- Keep the existing preview and public CDN tests unchanged unless a shared helper requires fixture updates.

## Acceptance

- Focused Vitest passes.
- `git diff --check` passes.
- Any baseline-wide failures are reported separately from focused proof.
