# Section 01-08 Implementation Review

## Scope Reviewed

- Connector Lab, compatibility connect route, Settings connector panel, Intelligence workspace routes.
- Shared connector/status/source/report contracts.
- Recorded connector probe fixture and field dictionary.
- Browser auth grant routes and user/tenant-scoped grant service.
- Marketplace intelligence service, tRPC router, snapshot/discovery/report/watchlist/handoff flows.
- MCP registry tools for save/list/get snapshot, generate report, create Marketplace Capture candidate batch, list watchlists, and upsert watchlist.
- Section documentation and deep-implement state.

## Findings

- No blocking findings found in the implemented slice.
- Public API status values now use `pending` instead of `authorization_started`.
- Recorded sample source mode now uses `recorded_mcp_sample`.
- No product code fallback URL references the previously discussed external assistant host.
- Snapshot persistence deliberately stores normalized item fields and omits raw diagnostic payloads from reusable snapshot rows.
- MCP tool registration now uses the same marketplace intelligence service path as browser/tRPC flows and enforces per-session `mcp:read` / `mcp:write` visibility.
- Report export, watchlist event, and candidate batch handoff paths are implemented enough for downstream UI/API slices.
- MCP tool results include browser deep links for snapshots, reports, watchlists, and Marketplace Capture candidate batches.
- Marketplace Intelligence now resolves MCP/browser deep links for snapshot, report, and watchlist detail states.
- Snapshot detail exposes share-of-shelf and candidate batch handoff, report detail exposes prompt/export action, and watchlist detail exposes the event timeline.
- Canonical tRPC aliases now cover connector status, dry run, independent field sample save, save/list/get search snapshots, keyword discovery list/get/refresh, generate/get search report, report export list/get, upsert watchlist, compare snapshots, and diagnostics.
- Snapshot comparison service now provides exact match, new entrant, missing item, and metric-delta foundations for future monitor reports.
- Field sample persistence is now decoupled from snapshot creation, allowing Connector Lab/capability review to save sanitized field coverage without importing a full keyword snapshot.
- Connector Lab now calls the `saveFieldSample` and `createSnapshotFromProbe` tRPC paths from the UI instead of only simulating fixture/save state locally.
- Marketplace Intelligence now renders a first-class Keyword Discovery detail state with product-family clusters, opportunity signals, source snapshot handoff, watchlist action, and report payload action.
- Marketplace Intelligence overview now distinguishes broad keyword/category exploration from known product/SKU tracking.
- Marketplace Capture Candidate Batch detail now shows Marketplace Intelligence snapshot provenance, summary metrics, top seller visibility, and deep links back to snapshot/report/discovery/Lab flows.
- Candidate Batch sold-signal parsing now avoids treating the `m` in words such as `monthly` as a million-unit suffix.
- Marketplace Capture Product Detail now includes a Market Intelligence bridge panel with keyword-prefilled exploration, current product evidence summary, reports link, and connector settings link.
- Marketplace Capture Product Detail now includes an explicit exact-match metric enrichment confirmation path and enrichment history for user-scoped connector evidence.
- Marketplace Intelligence Reports now include a multi-day exact SKU monitor creation path backed by `compareSnapshots` and a report prompt package for `marketplace_report.multi_day_sku_monitor_image`.
- Report Detail now exposes a shareable image preview package before final bitmap rendering, including skill key, aspect ratio, model, source snapshot, and export action.
- Shared report contracts now include spec-facing report type aliases, `4:5` aspect ratio support, and bitmap export types that fail forward as `provider_required` until an image provider renders final assets.
- Field Dictionary now reads the current user's latest saved field sample when available and shows state, coverage, type, sample, use, and storage recommendation in the browser UI.
- Diagnostics now renders production rollout cards instead of only a raw JSON dump, including import health, schema drift, retention/redaction, rate-limit metadata, and rollback/live-disabled state.
- Marketplace Intelligence sub-feature flags now cover Lab, imports, keyword discovery, reports, report image skills, shareable image exports, watchlists, and MCP writes; tenant admin UI exposes each flag separately.
- tRPC mutation paths now fail closed by tenant flag when DB-backed tenant configuration is active, while local fixture-only development without `DATABASE_URL` remains usable for replay/read testing.
- MCP write executors now fail closed behind the tenant MCP-write flag and the matching imports/reports/watchlists sub-feature flag when DB-backed tenant configuration is active.

## Residual Risk

- Drizzle schema and migration now exist for durable persistence, and `npm --prefix apps/web run db:migrate` completed successfully in this workspace.
- Runtime live connector execution is not yet wired. Current flows use the recorded connector probe to test field discovery and downstream analysis.
- MCP tools currently save from the recorded connector probe path until live connector grants are available to the runtime.
- Retention cleanup jobs, complete audit-event coverage, and per-keyword/user rate-limit metadata remain follow-up hardening work.
- Full browser/Playwright screenshots are still required before broad UI rollout; current UI verification is jsdom route/component coverage.
- Live connector status is now exposed through the tRPC router by delegating to the same user/tenant-scoped grant service as the browser auth REST routes.

## Verification

- `npm --prefix apps/web run test -- shared/__tests__/marketplaceIntelligence.test.ts server/services/__tests__/marketplaceIntelligenceService.test.ts server/routers/__tests__/marketplaceIntelligence.test.ts server/routes/__tests__/marketplaceConnectorAuth.test.ts client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx`
- `npm --prefix apps/web run test -- drizzle/__tests__/marketplaceIntelligenceMigration.test.ts server/services/__tests__/marketplaceIntelligenceService.test.ts server/routers/__tests__/marketplaceIntelligence.test.ts server/routes/__tests__/marketplaceConnectorAuth.test.ts shared/__tests__/marketplaceIntelligence.test.ts client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx`
- `npm --prefix apps/web run test -- server/services/__tests__/marketplaceIntelligenceService.test.ts server/routers/__tests__/marketplaceIntelligence.test.ts server/_core/__tests__/mcpRegistry.marketplaceIntelligence.test.ts`
- `npm --prefix apps/web run test -- server/_core/__tests__/mcpRegistry.marketplaceIntelligence.test.ts`
- `npm --prefix apps/web run test -- client/src/pages/__tests__/MarketplaceIntelligence.test.tsx`
- `npm --prefix apps/web run test -- drizzle/__tests__/marketplaceIntelligenceMigration.test.ts shared/__tests__/marketplaceIntelligence.test.ts server/services/__tests__/marketplaceIntelligenceService.test.ts server/routers/__tests__/marketplaceIntelligence.test.ts server/routes/__tests__/marketplaceConnectorAuth.test.ts server/_core/__tests__/mcpRegistry.marketplaceIntelligence.test.ts client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx client/src/pages/__tests__/MarketplaceIntelligence.test.tsx`
- `npm --prefix apps/web run test -- server/services/__tests__/marketplaceIntelligenceService.test.ts server/routers/__tests__/marketplaceIntelligence.test.ts client/src/pages/__tests__/MarketplaceIntelligence.test.tsx`
- `npm --prefix apps/web run test -- shared/__tests__/marketplaceIntelligenceFeatureFlags.test.ts drizzle/__tests__/marketplaceIntelligenceMigration.test.ts shared/__tests__/marketplaceIntelligence.test.ts server/services/__tests__/marketplaceIntelligenceService.test.ts server/routers/__tests__/marketplaceIntelligence.test.ts server/routes/__tests__/marketplaceConnectorAuth.test.ts server/_core/__tests__/mcpRegistry.marketplaceIntelligence.test.ts client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx client/src/pages/__tests__/MarketplaceIntelligence.test.tsx client/src/pages/__tests__/MarketplaceCaptureProductDetail.autoReviewPolling.test.ts client/src/components/admin/__tests__/TenantFeatureFlagsPanel.marketplaceIntelligence.test.tsx`
- `npm --prefix apps/web run test -- client/src/pages/__tests__/MarketplaceIntelligence.test.tsx client/src/pages/__tests__/MarketplaceCaptureCandidateBatch.test.tsx client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx client/src/pages/__tests__/MarketplaceCaptureProductDetail.autoReviewPolling.test.ts client/src/components/admin/__tests__/TenantFeatureFlagsPanel.marketplaceIntelligence.test.tsx`
- `npm --prefix apps/web run test -- shared/__tests__/marketplaceIntelligenceFeatureFlags.test.ts drizzle/__tests__/marketplaceIntelligenceMigration.test.ts shared/__tests__/marketplaceIntelligence.test.ts server/services/__tests__/marketplaceIntelligenceService.test.ts server/routers/__tests__/marketplaceIntelligence.test.ts server/routes/__tests__/marketplaceConnectorAuth.test.ts server/_core/__tests__/mcpRegistry.marketplaceIntelligence.test.ts client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx client/src/pages/__tests__/MarketplaceIntelligence.test.tsx client/src/pages/__tests__/MarketplaceCaptureCandidateBatch.test.tsx client/src/pages/__tests__/MarketplaceCaptureProductDetail.autoReviewPolling.test.ts client/src/components/admin/__tests__/TenantFeatureFlagsPanel.marketplaceIntelligence.test.tsx`
- `npm --prefix apps/web run db:migrate`
- `npm --prefix apps/web run check`
