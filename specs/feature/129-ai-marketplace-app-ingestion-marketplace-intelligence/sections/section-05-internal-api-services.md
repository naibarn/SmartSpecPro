# Section 05 - Internal API Services

## Objective

Implement the validated backend path used by Settings, browser UI, Marketplace Capture enrichment, and MCP tools.

## Scope

- Ingestion service.
- Metrics service.
- Keyword discovery clustering service.
- Report service foundation.
- tRPC router procedures for lab, samples, snapshots, keyword discoveries, and reports.
- Marketplace Capture matching/enrichment service.
- Field dictionary / capability review service.
- UI state-code contract for snapshot, enrichment, report, watchlist, and diagnostics screens.

## Implementation Notes

- Prefer a new `marketplaceIntelligenceRouter` registered in `apps/web/server/routers.ts`.
- Validate every input with shared schemas.
- Implement dry run, save field sample, create snapshot, list/get snapshots, create/list/get/refresh keyword discovery, create report, and diagnostics procedures.
- Implement field dictionary/capability review procedures from stored fixture and field samples.
- Normalize known fields and preserve unknown fields with diagnostics.
- Compute deterministic metrics and quality score.
- Compute keyword discovery clusters for broad searches without requiring a saved Marketplace Capture product. Cluster by brand, model family, product type, use case, price tier, seller/trust mix, and representative listings where evidence supports it.
- Link snapshot items to existing marketplace products using exact identifiers first, then URL, then bounded similarity.
- Relate connector snapshot items to existing Marketplace Capture candidate items and products using exact identifiers first, canonical URL second, and bounded title/seller similarity last.
- Enrich Marketplace Capture with connector-derived current metrics only through append-only metric/evidence records with provenance and confidence.
- Do not silently overwrite user-edited product names, descriptions, affiliate URLs, commission settings, or manually confirmed product truth.
- Return explicit actions for low-confidence matches: create product, link to existing product, ignore, or request review.
- Return explicit keyword discovery handoff actions: create report, create watchlist, create content brief, create product candidate, link to existing product, or refine keyword.
- Make duplicate payloads idempotent.
- Enforce user ownership for grants, raw payloads, snapshots, reports, and watchlists. Shared Marketplace Capture products do not grant access to another user's connector raw payload.
- Return stable UI state codes for partial data, stale source, raw hidden, link needs review, discovery ambiguous, discovery no clear clusters, discovery low field coverage, duplicate/idempotent save, permission denied, capability drift, provider unavailable, and enrichment private.

## Tests First

- Dry run validates payloads without writing snapshots.
- Save field sample stores sanitized coverage data.
- Create snapshot writes import, snapshot, and items idempotently.
- Metrics are deterministic.
- Keyword discovery clustering is deterministic for fixture snapshots and cites representative item evidence.
- Keyword discovery can be saved and reused when no Marketplace Capture product match exists.
- Product linking uses the expected priority order.
- Cross-user snapshot reads are rejected.
- Product enrichment appends metric/evidence rows for high-confidence matches and refuses unsafe overwrites.
- Marketplace Capture candidate/product update tests verify that existing product pages can show the newest connector evidence for the current user.
- Field dictionary tests verify useful Shopee connector fields are grouped into product, price, sales, rating/review, seller/shop, brand/category, ranking/search, logistics, and diagnostics categories.
- UI state-code tests verify APIs expose enough information for accessible empty/error/partial/stale/discovery ambiguity states without UI string parsing.

## UI/UX Contract

### Target User / JTBD
Connector Lab users need API-backed dry runs, samples, snapshots, and diagnostics to update the visible UI accurately.

### Surface Inventory
Backs Settings connection status, `/marketplace-capture/intelligence/connector-lab`, keyword discovery routes, field dictionary, snapshot list/detail routes, report routes, diagnostics, watchlists, and Marketplace Capture product/candidate enrichment surfaces.

### Component Map
N/A for direct component creation; API states feed the status panel, preview table, diagnostics panels, snapshot list, and report actions.

### State Matrix
Dry-run loading, dry-run success, validation error, sample save loading/success/error, snapshot create loading/success/error, keyword discovery analyzing/clusters-ready/ambiguous/no-clear-clusters/low-field-coverage/saved, duplicate/idempotent result, partial data quality, stale source, raw hidden, link needs review, capability drift, enrichment private, provider unavailable.

### Responsive Matrix
N/A for API implementation; returned payloads must support compact mobile summaries and desktop detail views.

### Accessibility Acceptance
API errors must provide stable messages/codes that UI can render in accessible alert regions.

### Copy Contract
Return stable error codes for localization instead of hard-coded long user copy.

### Browser Evidence Required
Playwright should verify API-driven dry-run success, validation error, idempotent snapshot result, keyword discovery ready/ambiguous states, and partial quality state.

## Acceptance Criteria

- Browser UI can create durable snapshots from fixture or live connector results.
- MCP tools can later reuse the same service without bypassing validation.
- Existing Marketplace Capture products can receive current connector-derived marketplace metrics with provenance and user-scoped permissions.
- Broad keyword/category discovery can produce reusable clusters, reports, watchlists, and handoff actions before any exact product is selected.
- Field Dictionary, Snapshot Detail, Product Enrichment, Report, Watchlist, and Diagnostics UI can render from stable service contracts without reverse-engineering raw payloads.

## Implementation Status

Completed:

- Added `apps/web/server/services/marketplaceIntelligenceService.ts`.
- Added `apps/web/server/routers/marketplaceIntelligence.ts` and registered it in `apps/web/server/routers.ts`.
- Exposed browser-friendly procedures plus canonical spec aliases: `getConnectorStatus`, `dryRunConnectorSearch`, `saveFieldSample`, `saveSearchSnapshot`, `listSearchSnapshots`, `getSearchSnapshot`, `createKeywordDiscovery`, `listKeywordDiscoveries`, `getKeywordDiscovery`, `refreshKeywordDiscoveryFromSnapshot`, `generateSearchReport`, `getSearchReport`, `listReportsBySnapshot`, `listReportExports`, `getReportExport`, `upsertWatchlist`, `compareSnapshots`, and `getDiagnostics`.
- Existing wrapper procedures remain available: `fieldDictionary`, `createSnapshotFromProbe`, `listSnapshots`, `getSnapshot`, `createDiscovery`, `createReport`, `createReportExport`, `listReports`, `getReport`, `createWatchlist`, `getWatchlist`, `recordWatchlistEvent`, `listWatchlistEvents`, `listWatchlists`, `createCaptureHandoff`, `createCaptureCandidateBatch`, and `diagnostics`.
- Metrics include share of shelf by brand/seller, price bands, official-like share, rating, and sold signal.
- Field samples can be saved independently from search snapshots so Connector Lab can inspect coverage/capability drift without importing competitive rows.
- Keyword discovery works without Marketplace Capture product IDs and returns product-family clusters plus opportunities.
- Report creation returns sanitized image-report prompt payloads with evidence and default `gpt-image-2` model selection.
- Report export creation persists image prompt export metadata and prompt/data hashes.
- Report export list/get paths expose prompt/data hashes and source summaries for browser detail pages.
- Service/router tests cover snapshot creation, dry run, canonical aliases, discovery list/get/refresh, report payload, report export list/get, watchlist, diagnostics, field dictionary, snapshot comparison, auth gating, and tRPC exposure.
- Detail read paths cover direct report and watchlist routes, plus reports scoped to a snapshot.
- Snapshot comparison returns exact item matches, new entrants, missing items, and metric deltas for monitor/report foundations.
- Watchlist event service/router paths cover monitored changes such as new competitors and hero SKU changes.
- Marketplace Capture candidate batch handoff can turn a keyword snapshot into the existing `marketplace_candidate_batches` review workflow without creating confirmed products automatically.
- Snapshot, discovery, report, watchlist, and grant flows now read/write durable Drizzle tables when DB is configured.

Current limitation:

- Live connector execution is not wired yet. API behavior still uses the recorded connector probe for source data, but saved outputs are durable when DB is configured.
