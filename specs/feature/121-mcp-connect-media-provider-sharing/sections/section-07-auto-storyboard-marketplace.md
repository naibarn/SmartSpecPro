# Section 07: Auto Storyboard Review and Marketplace Capture Integration

## Goal

Propagate MCP transport metadata through Auto Storyboard Review and Marketplace Capture product-context generation without changing product evidence, product sharing, or non-v1 workflows.

## Depends On

- Section 04 transport resolver/media router.
- Section 06 Media Studio vertical slice.

## Files

Modify:

- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- production execution handoff helpers that call `scheduleProductionExecution` / `reconcileProductionExecution`
- extend `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
- add or extend Product Detail UI tests under `apps/web/client/src/pages/__tests__/`

## Auto Storyboard Review Behavior

- Store selected/default transport fields on the run/stage context using the shared `MediaTaskTransportMetadata` contract from Section 04.
- Pass the same metadata shape to image/video media tasks and the Storyboard Review handoff.
- Show batch-level transport and credit source.
- If MCP connection becomes unavailable, stop scheduling pending jobs.
- Offer reconnect or explicit fallback to Gateway API for remaining items.
- Completed items keep original metadata.

## Marketplace Capture Behavior

- Product truth/evidence remains immutable.
- Product context stays in `extraParams`.
- Scraped evidence/product payload cannot set transport, connection, group, budget, or fallback policy.
- Product sharing settings stay separate from MCP connection sharing.
- Generated assets show provider account and transport labels.

## UI/UX Contract

### Target User / JTBD

- Role: marketplace creator generating product review assets.
- Goal: use connected provider account for product-context generation without weakening product truth.
- Entry point: Marketplace Capture Product Detail and Auto Review actions.
- Success outcome: batch clearly shows API/MCP, provider account, credit source, and pending/fallback state.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Product Detail | `MarketplaceCaptureProductDetail.tsx` | transport labels/defaults for generation actions |
| Auto Review progress | existing product detail progress UI | batch summary and fallback actions |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Product detail transport summary | `MarketplaceCaptureProductDetail.tsx` | transport/account/credit labels for scoped jobs | run/stage transport metadata |
| Auto Review progress controls | `MarketplaceCaptureProductDetail.tsx` | reconnect/fallback actions for pending jobs | marketplace auto review status |
| Marketplace backend propagation | `marketplaceCapture.ts`, `marketplaceAutoReviewService.ts` | transport metadata persistence | media router contract |

### State Matrix

Cover: Gateway default, MCP configured, MCP missing, approval pending, connection lost mid-batch, fallback available, fallback denied, completed mixed batch.

### Responsive Matrix

Verify mobile/tablet/desktop product detail layout; transport badges must not mix with product sharing controls.

### Accessibility Acceptance

Fallback and approval actions keyboard reachable; status labels visible text, not color-only.

### Copy Contract

Use concise production workflow copy. Product evidence copy must not imply MCP controls alter product facts.

### Browser Evidence Required

Product Detail screenshots for configured MCP, connection lost/fallback, and default Gateway API.

## Tests First

- Test: auto review run stores transport metadata when selected.
- Test: generated media tasks receive `MediaTaskTransportMetadata` without creating workflow-specific variants.
- Test: product context remains in `extraParams`.
- Test: scraped evidence cannot override transport/share/budget.
- Test: connection loss stops pending scheduling.
- Test: fallback approval affects only remaining items.
- Test: completed items keep original transport.
- Test: UI keeps product sharing and MCP sharing separate.

Test file targets:

- `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
- `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.mcpConnect.test.tsx`

Verification commands:

- `cd apps/web && npm test -- server/services/__tests__/marketplaceAutoReviewService.test.ts client/src/pages/__tests__/MarketplaceCaptureProductDetail.mcpConnect.test.tsx`
- `cd apps/web && npm run check`

## Acceptance Criteria

- Marketplace Capture Standard Order and existing Auto Review still work with Gateway API.
- Product evidence immutability is preserved.
- Scoped MCP metadata reaches generated tasks and Storyboard Review handoff.
