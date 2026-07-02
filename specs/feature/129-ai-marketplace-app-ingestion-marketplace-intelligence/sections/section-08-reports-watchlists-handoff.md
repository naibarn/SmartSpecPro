# Section 08 - Reports Watchlists Handoff

## Objective

Turn validated snapshots into operational marketplace intelligence and product/content workflows.

## Scope

- Competitive report generation from stored snapshots.
- Keyword Product Discovery workspace and reports for broad keywords before exact SKUs are known.
- Multi-day exact SKU/seller monitor reports.
- Shareable image summary templates.
- Report-specific image prompt skills and provider adapter handoff.
- Watchlists for keywords, sellers, brands, and SKUs.
- Change events.
- Product/content handoff from high-confidence snapshot items.
- Marketplace Capture enrichment UI and product metric update handoff.
- Snapshot list/detail UI.
- Field dictionary / capability review UI.
- Marketplace Intelligence overview and local navigation integration.
- Diagnostics/audit UI for schema drift, retention, and rollback metadata.

## Implementation Notes

- Reports must use stored snapshots, not live connector data.
- Highlight visibility winners, hero SKUs, price leaders, review leaders, official store leaders, promotion signals, and opportunity recommendations.
- Keyword Product Discovery must be separate from known SKU/product intelligence. It starts from broad terms such as `notebook`, `กางเกงผ้าอ้อม`, or `กระดาษทิชชู่`, then identifies brands, model families, product types, intended-use clusters, price tiers, seller/trust mix, representative listings, and refinement suggestions.
- Keyword Product Discovery must not require a Marketplace Capture product ID. It can later hand off to create/link products, create candidates, generate content briefs, create reports, or create watchlists.
- Report templates should support Top Search Results Preview, Executive Summary, Brand Visibility / Share of Shelf, Seller Power Map, Winners by KPI, Strategy Matrix, Keyword Product Discovery Map, Price Tier / Product Type Ladder, Discovery Handoff Actions, Monitor Cards, New Competitor Watch, Marketing Insight, and What To Do Next blocks.
- Multi-day monitor reports must compare exact seller/SKU/model matches first and mark new entrants as baseline missing instead of comparing them against unrelated items.
- Estimated units sold/day must be labeled as estimated and derived from cumulative sold delta over the snapshot date range.
- Shareable image summaries must support 1:1, 4:5, 9:16, and 16:9 templates with source mode, captured date range, keyword, item count, and disclaimer footer.
- Shareable image generation must run through report image skills. The service builds a sanitized data package, the selected skill returns an image prompt package, and the configured provider adapter renders the final image. Default provider/model is `gpt-image-2`, but tenant/user configuration can override it when allowed.
- Initial skills should include `keyword_competitive_summary_image`, `keyword_product_discovery_image`, and `multi_day_sku_monitor_image`; later skills can cover pricing, opportunity, and product/content briefs.
- Image skills must be versioned, fixture-tested, and forbidden from inventing metrics, products, sellers, prices, ranks, dates, or recommendations outside supplied evidence.
- Watchlist events should cover rank movement, price change, review/sold velocity, competitor entry/exit, and new unknown fields.
- Handoff should link to existing marketplace product/content workflows only when confidence is high; otherwise require user confirmation.
- Reports must expose source mode and freshness: fixture, recorded MCP sample, live MCP, extension capture, or mixed.
- Marketplace Capture product pages should show latest connector-derived evidence for the current user: linked snapshot, capturedAt, metric differences, confidence, and whether the update is user-only.
- Watchlist automation is user-scoped in v1 because connector access is user-scoped. Tenant/team sharing can consume stored reports later, but cannot reuse another user's grant.
- Snapshot detail must show source mode, capturedAt, item count, quality score, field coverage, product-link candidates, and owner-only raw access state before report actions.
- Intelligence overview must be reachable from the existing Marketplace Capture main sidebar item through local subnav, not a new v1 main sidebar item.
- Intelligence overview should summarize latest snapshots, latest discoveries, latest reports, watchlist events, field coverage health, connector status, and next recommended action.
- Intelligence overview must offer two clear starts: explore a keyword/category and track/enrich a known Marketplace Capture product.
- Report Detail must link every claim to stored snapshot item evidence and matched Marketplace Capture products/candidates where available.
- Shareable Image Summary must be launched from Report Detail or Monitor Report. It should not appear as a standalone primary menu item.
- Marketplace Product Detail must show a compact Market Intelligence panel only when the current user has related snapshots, reports, or enrichment evidence; otherwise show a low-noise empty state with a "Create snapshot/report" action when appropriate.
- Candidate Batch detail must expose create snapshot/report/compare actions inline, preserving the user's batch review workflow.
- Field dictionary must group useful fields into product, price, sales, rating/review, seller/shop, brand/category, ranking/search, logistics, and diagnostics. Each field row should show type, sample value, coverage, normalized/raw-only status, storage recommendation, and promote/defer state.
- Product enrichment actions must show before/after metric values, link confidence, evidence source, and explicit confirmation before applying updates to Marketplace Capture metrics.
- Diagnostics UI must expose import health, schema drift, retention/redaction, rate-limit, and rollback/write-back-disabled state without exposing raw payloads to non-owners.

## Tests First

- Reports are deterministic for fixture snapshots.
- Partial data quality is shown clearly and does not invent missing metrics.
- Keyword Product Discovery clusters broad keyword results into brand/model/type/use-case/price-tier groups with representative listing evidence and confidence.
- Keyword Product Discovery renders ambiguous keyword, no clear clusters, low field coverage, and saved discovery states.
- Multi-day monitor reports use exact match keys and mark fuzzy/new items for review.
- Shareable image summary blocks render only evidence-backed metrics and include source/disclaimer metadata.
- Report image skill tests verify data package validation, required-block warnings, generated prompt package, provider/model selection, prompt hash, and no unsupported metrics.
- Watchlists detect expected changes between snapshots.
- High-confidence handoff links existing products.
- Low-confidence handoff requires review.
- Marketplace Capture product enrichment appends metric/evidence rows and preserves user-edited product truth.
- User A cannot see User B's connector-only evidence through shared Marketplace Capture product access.
- Field dictionary renders new, stable, changed, raw-only, and promoted fields from fixture/recorded samples.
- Snapshot detail renders full-quality, partial-quality, raw-hidden, stale, and product-link-needs-review states.
- Product enrichment confirmation verifies before/after values and refuses low-confidence silent updates.
- Diagnostics renders schema drift, retention/redaction, rate-limit, and rollback/write-back-disabled states without raw payload leakage.
- Navigation tests verify Marketplace Intelligence and Keyword Discovery are discoverable from Marketplace Capture local subnav, Settings connector card, Product Detail, Candidate Batch, Snapshot Detail, Report Detail, and optional Dashboard/Marketplace Capture landing card.
- Cross-link tests verify Discovery Detail, Product Detail, Candidate Batch, Snapshot Detail, and Report Detail preserve back-links and do not strand the user in a dead-end route.

## UI/UX Contract

### Target User / JTBD
Growth, category, and content operators need to turn validated snapshots into competitor insight, product/category discovery, watchlist alerts, and product/content actions.

### Surface Inventory
Existing main sidebar `Marketplace Capture`, Marketplace Capture local subnav, future `/marketplace-capture/intelligence`, `/marketplace-capture/intelligence/discovery`, `/marketplace-capture/intelligence/discovery/:discoveryId`, `/marketplace-capture/intelligence/snapshots`, `/marketplace-capture/intelligence/snapshots/:snapshotId`, `/marketplace-capture/intelligence/fields`, `/marketplace-capture/intelligence/reports`, `/marketplace-capture/intelligence/reports/:reportId`, `/marketplace-capture/intelligence/watchlists`, `/marketplace-capture/intelligence/watchlists/:watchlistId`, `/marketplace-capture/intelligence/diagnostics`, snapshot item handoff actions, Marketplace Capture candidate batch detail, and Marketplace Capture product detail enrichment panels.

### Component Map
Marketplace Capture local subnav, Intelligence overview workflow chooser, keyword discovery search panel, discovery cluster map, brand/model/type/use-case cards, representative listing tray, price tier ladder, discovery handoff action bar, snapshot list, snapshot detail summary, field dictionary table, report list, report summary, evidence link tray, matched product/candidate link badges, top result preview, executive summary cards, visibility winner table, hero SKU table, seller power map, winners-by-KPI panel, strategy matrix, monitor cards, new competitor watch, price band chart/table, shareable image preview, report image skill selector, provider/model selector when permitted, prompt preview for staff/debug mode, watchlist event list, Marketplace Capture enrichment panel, handoff confirmation dialog, diagnostics/audit panel.

### State Matrix
Intelligence overview empty, workflow chooser, local subnav active/mobile-overflow, keyword discovery empty/analyzing/clusters-ready/ambiguous/no-clear-clusters/low-field-coverage/saved, snapshot empty/loading/partial/stale, raw hidden, field dictionary new/stable/changed/raw-only/promoted, report list empty, report loading, report ready, partial data, no comparable snapshots, monitor baseline missing, exact match incomplete, new competitor detected, image skill missing required block, image prompt generated, image export generating, image provider unavailable, image export failed, watchlist empty, watchlist paused, watchlist event detected, live unavailable, handoff high-confidence, handoff needs review, handoff failed, product enrichment available, product enrichment private, product enrichment stale, diagnostics schema drift, rollback active.

### Responsive Matrix
Mobile prioritizes local nav overflow, source status, summary, winners, metric deltas, and primary actions before dense diagnostics. Desktop supports local subnav, denser comparison tables, field dictionaries, product-link review, and diagnostics side-by-side.

### Accessibility Acceptance
Tables use semantic headers, charts have textual summaries, alerts are not color-only, raw-hidden and permission states are visible text, and confirmation dialogs trap and restore focus correctly.

### Copy Contract
Thai and English copy must avoid overstating low-confidence findings, clearly label partial data, and mark sold/day, total sold, and market share as captured public marketplace signals.

### Browser Evidence Required
Playwright covers Marketplace Capture local subnav, Intelligence overview workflow chooser, Keyword Discovery search/detail, discovery ambiguous/low-confidence states, field dictionary, snapshot detail, report list/detail, report ready, multi-day monitor, shareable image preview, image skill required-block warning, provider unavailable state, partial data, empty watchlist, detected event, diagnostics schema drift, Marketplace Capture product enrichment panel, Candidate Batch report action, handoff review states, mobile layout, and unavailable/error states.

## Acceptance Criteria

- Stored connector data becomes useful for pricing analysis, share-of-shelf tracking, competitor monitoring, and content planning.
- The team can expand analytics after field discovery proves which data is consistently available.
- Existing Marketplace Capture products can be kept more current with connector-derived marketplace metrics while preserving provenance and user ownership.
- Broad keyword/category exploration works even when no Marketplace Capture product exists yet, and can later hand off to products, candidates, reports, watchlists, or content briefs.
- Users can evaluate exactly which fields are available and useful before relying on reports.
- Every recommendation or handoff action links back to stored snapshot/evidence IDs.
- UI/UX coverage includes Settings, Connector Lab, Keyword Discovery, Field Dictionary, Snapshot Detail, Product Enrichment, Report, Watchlist, Diagnostics, mobile, and unavailable/error states.
- Report templates cover keyword product discovery, keyword competitive analysis, and multi-day seller/SKU monitoring patterns seen in current marketplace-intelligence usage.
- Shareable image reports are generated through report-specific prompt skills from sanitized report data packages, with provider/model selection and audit metadata stored on export rows.
- Navigation is production-grade: Marketplace Intelligence is discoverable from Marketplace Capture, Settings, Product Detail, Candidate Batch, Snapshot Detail, and Report Detail, while avoiding duplicate main sidebar entries in v1.

## Implementation Status

Completed:

- Added Marketplace Intelligence workspace routes for overview, discovery, snapshots, reports, watchlists, fields, diagnostics, Connector Lab, and browser authorization handoff.
- Added keyword-first snapshot creation from the recorded connector probe, separate from exact Marketplace Capture product pages.
- Added report payload generation that packages stored snapshot evidence for report-specific image prompt skills and defaults to `gpt-image-2`.
- Added report export records for image prompt packages with template/model metadata and prompt/data hashes.
- Added watchlist creation/listing for user-scoped keyword monitoring.
- Added watchlist event recording/listing for rank, price, new competitor, hero SKU, and field drift signals.
- Added Marketplace Capture handoff payload creation from snapshot item evidence.
- Added Marketplace Capture candidate batch handoff from keyword snapshots so broad keyword searches can move into the existing candidate review workflow before exact SKUs/products are confirmed.
- Added Field Dictionary UI from useful field contracts and diagnostics UI from service diagnostics.
- Added Settings > Integrations connector panel and links from Intelligence to Settings/Lab.
- Connector Lab saves field samples and creates search snapshots through the Marketplace Intelligence API, not local-only simulation.
- Added deep-link detail states for `/snapshots/:snapshotId`, `/reports/:reportId`, and `/watchlists/:watchlistId` inside the Marketplace Intelligence workspace.
- Snapshot detail shows source/freshness, field coverage, official-like share, price summary, brand/seller share-of-shelf, and a Marketplace Capture candidate batch handoff action.
- Report detail shows evidence-backed executive summary, recommendations, KPI cards, source snapshot link, and image prompt export action.
- Report detail lists saved export records with export type/status and prompt hashes.
- Watchlist detail shows cadence/alert summary, event timeline, and manual review marker action.
- Keyword Discovery now has a browser detail state that lists product-family clusters, opportunity signals, source snapshot handoff, watch keyword, and report payload actions without requiring a Marketplace Capture product/SKU first.
- Intelligence overview now separates `Explore keyword/category` from `Track known product/SKU` so broad keyword discovery is not confused with exact product enrichment.
- Marketplace Capture Candidate Batch detail now exposes Marketplace Intelligence provenance from snapshot handoff, including snapshot ID, capturedAt, median price, sold signal, official-like count, top seller visibility, and links back to snapshot, reports, discovery, and Connector Lab.
- Marketplace Capture Product Detail includes a Market Intelligence panel with keyword prefill, current product evidence, links to keyword exploration, reports, and connector settings.
- Marketplace Capture Product Detail can now confirm exact snapshot-item metric enrichment for a product when shop/item IDs match, preserving user-scoped confidence, provenance, rank, price, sold, rating, and review evidence in append-only connector metric rows.
- Reports now include a multi-day exact SKU monitor path from two stored snapshots, using exact match comparison, baseline-missing new entrant counts, metric deltas, and a `multi_day_sku_monitor_image` prompt package.
- Report Detail now shows a shareable image preview package with skill key, source snapshot, aspect ratio, model, and export action before image-provider rendering.
- Report contracts now include the spec-facing report type/aspect-ratio aliases for competitive landscape, pricing analysis, seller visibility, opportunity finder, content strategy, keyword product discovery, multi-day SKU monitor, shareable summaries, and `4:5` image output.
- Field Dictionary now promotes the latest saved field sample into capability-review rows with state, coverage, type, sample, use, and storage recommendation instead of showing only static field names.
- Diagnostics now renders rollout-safety cards for import health, schema drift, retention/redaction, rate-limit metadata, and rollback/write-back-disabled state, while keeping raw diagnostic payloads hidden.
- Tenant Config surfaces all Marketplace Intelligence sub-feature flags, including imports, keyword discovery, reports, report image skills, shareable exports, watchlists, and MCP writes.
- Backend snapshot comparison foundation is available for monitor reports: exact item matches, new entrants, missing items, price/rank/sold deltas, and aggregate metric deltas.

Current limitation:

- Live connector execution, external image-provider rendering/storage for final bitmap assets, full Playwright browser evidence, retention cleanup jobs, complete audit coverage, and rate-limit metadata remain before broad live rollout. The browser UI now exposes product enrichment, monitor reports, and shareable image prompt packages from stored evidence.
