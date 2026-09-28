# Implementation Plan

## Objective

Restore the Marketplace Capture product-detail page by making its hook order invariant across loading, not-found, and loaded renders.

## Current-codebase fit

Keep all five Feature 136 hook bodies and dependency arrays unchanged. Relocate the block to immediately before the product-query guards, after all values referenced by the hooks have been declared. Extend the existing source-level sequential UI wiring test rather than mounting the oversized page.

## Affected files

- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.sequentialUiWiring.test.ts`

## Risks and mitigations

- Risk: moving the block above one of its dependencies. Mitigation: TypeScript check and targeted inspection.
- Risk: a later edit reintroduces hooks after the guards. Mitigation: source-level regression assertion.
- Risk: deployment hides the previous static build. Mitigation: the atomic script retains the previous dist during swap and verifies staging first.

## Acceptance criteria

- Every component hook executes before the loading/not-found early returns.
- Existing sequential storyboard wiring remains unchanged.
- Focused tests pass.
- Web TypeScript check passes.
- Production build completes, including widget build.
- After approved deployment, the affected route no longer reaches React error 310.
