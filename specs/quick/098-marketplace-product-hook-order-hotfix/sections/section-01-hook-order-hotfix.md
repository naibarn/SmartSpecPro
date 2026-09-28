# Section 01 — Hook Order Hotfix

## Ownership

Own only the Feature 136 derived-state hooks in `MarketplaceCaptureProductDetail.tsx` and their source-level regression assertion. Do not change UI output, network calls, data contracts, or styling.

## TDD expectations

- Red: the new test proves the Feature 136 hook block currently follows the product loading guard.
- Green: relocate the block so its first hook and all remaining hooks precede both early returns.
- Refactor: retain existing comments, hook bodies, and dependency arrays; format only touched lines.

## Acceptance checks

- Focused page tests pass.
- TypeScript check passes.
- Atomic build succeeds.

## UI/UX Contract

- Target user/job: authenticated Marketplace Capture users opening product details.
- Surface inventory/component map: no visual or component-tree changes.
- State matrix: loading, not-found, and loaded renders must all invoke an identical hook sequence.
- Responsive/accessibility/design tokens/copy: unchanged.
- Browser evidence: after deployment, reload the affected production route and confirm product content renders without the application error boundary or React error 310.

## Review stabilization

1. Coverage and boundaries checked; no auto-fix.
2. Hook dependency ordering checked; no auto-fix.
3. Loading and not-found states checked; no auto-fix.
4. Accessibility and copy confirmed unchanged; no auto-fix.
5. Browser evidence requirement confirmed; no auto-fix.

## Implementation result

- Modified `MarketplaceCaptureProductDetail.tsx` by relocating the five Feature 136 derived-state hooks before both product-query early returns. Hook bodies and dependency arrays were preserved.
- Extended `MarketplaceCaptureProductDetail.sequentialUiWiring.test.ts` with a regression assertion covering both the loading and not-found guards.
- Independent review produced one Low finding: initially only the loading guard was asserted. The test was strengthened to cover both guards.
- Focused tests: 10 passed across 2 files.
- Production-equivalent staging build: passed for the main app (15,979 modules) and widget.
- Full web TypeScript check remains blocked by pre-existing errors in unrelated files; neither hotfix file appears in the error list.
- Production browser evidence is pending the explicit deployment gate.
