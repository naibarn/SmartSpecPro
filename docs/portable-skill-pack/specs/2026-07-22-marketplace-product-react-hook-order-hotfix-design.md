# Marketplace Product React Hook Order Hotfix

## Incident

The production Marketplace Capture product-detail route renders the application error boundary after the product query changes from loading to loaded. React reports minified error 310.

## Root Cause

Feature 136 added five hook declarations after the component's loading and not-found early returns in `MarketplaceCaptureProductDetail.tsx`. The initial loading render skips those hooks, while the loaded render calls them, violating React's requirement that hooks run in the same order on every render.

## Design

Move the complete sequential-storyboard derived-state hook block above both product-query early returns. Preserve the hook bodies, dependencies, state ownership, and rendered UI unchanged. Do not roll back Feature 136 or change API/data behavior.

Add a focused source-level regression test that verifies no React hook declaration appears after the component's product loading/not-found guard. Existing sequential UI wiring tests remain responsible for validating Feature 136 component integration.

## Verification

1. Run the focused Marketplace Capture tests.
2. Run web TypeScript checking.
3. Run the production atomic build.
4. After explicit production-deploy confirmation, perform the atomic swap and verify the affected URL and health endpoint.

## Risk and Rollback

The change only reorders declarations inside one component and does not alter persisted data or network contracts. Rollback is a normal Git revert of the hotfix commit; no database rollback is required.
