# Implementation Plan - Marketplace MCP Connector Ingestion And Marketplace Intelligence

## Guiding Principles

- Build the Connector Lab first so browser evidence drives downstream schema, mapping, and report decisions.
- Keep intelligence views additive under `/marketplace-capture/intelligence/*`, but keep connector connection management under Settings > Integrations / Connections.
- Reuse existing marketplace capture auth, tenant, tRPC, Drizzle, LLM, audit, and product-linking patterns.
- Treat connector output as untrusted input until validated, redacted, and versioned.
- Keep OpenAI-hosted write-back optional in development through fixture replay and manual-paste payload import.
- Store new upstream fields without forcing every field into normalized columns on day one.
- Treat connector grants, write-back permissions, raw samples, and connector-derived snapshots as user-scoped by default. Tenant flags may enable the feature, but one user's connection must never power another user's import.
- Treat OpenAI/ChatGPT as the upstream execution host for the Shopee app in v1. SmartSpecPro does not own or reuse the Shopee connector session; it receives validated write-back payloads from the host.
- Never represent a SmartSpecPro write-back grant as proof that SmartSpecPro can call Shopee directly.
- Marketplace Capture remains the canonical product workspace for known products/SKUs; Keyword Product Discovery is a separate keyword/category workflow that can later hand off into Marketplace Capture after the user chooses products or clusters.

## Architecture Overview

The feature has six layers:

1. Settings UI: user-scoped SmartSpecPro write-back grants, defaults, revoke/reconnect, and safe capability status.
2. OpenAI-hosted connector execution: the user runs the Shopee app in the OpenAI/ChatGPT host, and the host obtains marketplace data with its own connector session.
3. SmartSpecPro write-back ingress: MCP tools and HTTPS API aliases that accept connector-host payloads, validate the user grant, and write into SmartSpecPro.
4. Browser Intelligence UI: Connector Lab, write-back evidence, field discovery, keyword discovery, snapshots, reports, and watchlists.
5. Persistence: connector imports, capabilities, grants, field samples, search snapshots, items, product links, keyword discoveries, reports, watchlists, and audit metadata.
6. Analytics and handoff: reports, watchlists, Marketplace Capture product enrichment, and image report payloads built from stored snapshots.

The primary connection UI should be a Settings > Integrations panel, following existing `McpConnectPanel` patterns where possible. `/marketplace-capture/intelligence/connect/shopee` can remain as a compatibility route that explains the connection and deep-links to Settings. The browser intelligence UI should use `/marketplace-capture/intelligence/connector-lab` and future snapshot/report/watchlist routes. The backend should prefer a new `marketplaceIntelligenceRouter` unless implementation review shows extending `marketplaceCaptureRouter` is simpler and still maintainable.

Keyword Discovery routes should live under `/marketplace-capture/intelligence/discovery` and `/marketplace-capture/intelligence/discovery/:discoveryId`. They are not product-detail pages and must not require a Marketplace Capture product ID.

## Cross-Cutting Requirement - Marketplace Capture Integration

Every stored connector snapshot item must attempt to relate to existing Marketplace Capture data:

- exact match by `platform + externalProductId + externalShopId`;
- exact/canonical source URL match where available;
- fallback title/seller similarity match with low-confidence review state;
- candidate batch item update for search-result evidence;
- product metric snapshot update for saved products when confidence is high;
- create/link handoff when no product exists.

Connector-derived data may update time-varying metrics and diagnostic metadata. It must not silently overwrite user-edited product names, descriptions, affiliate URLs, commission settings, or manually confirmed product truth.

Keyword-first discoveries should stay useful even when no known product exists. They should cluster broad marketplace results by brand, model family, product type, use case, price tier, seller/trust mix, and representative listings, then offer explicit handoffs to create/link products, create candidates, generate reports, create watchlists, or create content briefs.

## Section 01 - Browser Connector Lab UI First

Build the first visible slice before the full live connector is available.

Files likely changed:

- `apps/web/client/src/App.tsx`
- `apps/web/client/src/pages/MarketplaceConnectorLab.tsx`
- `apps/web/client/src/pages/MarketplaceConnectorConnect.tsx` (temporary compatibility route / Settings deep-link)
- `apps/web/client/src/pages/MarketplaceIntelligenceOverview.tsx`
- `apps/web/client/src/pages/MarketplaceKeywordDiscovery.tsx`
- `apps/web/client/src/pages/MarketplaceKeywordDiscoveryDetail.tsx`
- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/components/settings/*MarketplaceConnector*.tsx`
- `apps/web/client/src/components/marketplaceCapture/MarketplaceCaptureLocalNav.tsx`
- `apps/web/client/src/components/marketplaceIntelligence/*`
- `apps/web/client/src/locales/en/nav.json`
- `apps/web/client/src/locales/th/nav.json`
- `apps/web/client/src/locales/en/common.json`
- `apps/web/client/src/locales/th/common.json`
- `tests/e2e/marketplace-connector-lab.spec.ts`

Tasks:

- Run `npm run astryx -- build "marketplace connector lab"` before writing UI and follow the resulting component/template guidance.
- Keep the existing main sidebar `Marketplace Capture` menu item as the only v1 main navigation entry. Do not add a new main sidebar item for Marketplace Intelligence.
- Add `/marketplace-capture/intelligence` overview, compatibility connect page, and Connector Lab routes behind the appropriate feature flags.
- Add Marketplace Capture local subnav with Products, Captures/Candidates, Intelligence, Discovery, Connector Lab, Reports, Watchlists, Fields, and Diagnostics. Diagnostics is staff/admin only.
- Add Settings > Integrations / Connections entry for Shopee/OpenAI-hosted marketplace write-back configuration.
- Add Settings connector card links to open Connector Lab and Intelligence overview.
- Build a connection status panel with authorized, unauthorized, expired, revoked, loading, and error states; the full authorize/revoke flow lives in Settings, while Marketplace Intelligence can show status and deep-link there.
- Add browser actions for authorize, revoke, generate/open an OpenAI-hosted prompt, paste/import returned payload, save fixture, and create snapshot.
- Add keyword, region, locale, result limit, and replay/live mode controls.
- Add raw response viewer with default redaction, copy disabled for sensitive fields, and explicit owner-only warning.
- Add normalized preview table with stable columns for title, seller, price, sold count, rating/reviews, badges, rank, official store signal, and source confidence when available.
- Add field coverage matrix and unknown field detector.
- Display payload shape hash, connector capability version, fixture version, and ingestion dry-run result.
- Add empty, loading, disabled, error, partial-success, and success state copy in Thai and English.
- Verify with Playwright screenshots for desktop and mobile widths, local subnav active state, mobile subnav overflow, and at least one unavailable/error state.
- Add Intelligence overview workflow cards for `Explore keyword/category` and `Track known product/SKU` so users do not confuse broad discovery with product enrichment.

UI/UX contract:

- Target user: developer, staff operator, growth analyst, and product owner validating connector data before analytics rollout.
- Job-to-be-done: connect, run a search, see exactly what fields exist, save a reusable sample, and create a snapshot.
- Visual direction: dense operational tool, not a marketing page. Use restrained panels, tables, tabs, segmented controls, icon buttons, and status badges.
- Accessibility: keyboard reachable controls, focus states, labelled form inputs, table headers, no color-only status, reduced-motion-safe loaders.
- Responsive: desktop shows status, controls, preview, and diagnostics side-by-side; mobile stacks sections and keeps action buttons reachable.
- Navigation: Marketplace Intelligence is discoverable from the existing Marketplace Capture menu item and local subnav, not as a separate sidebar item.
- Browser evidence: Playwright must cover Intelligence overview entry, local subnav active state, unauthorized, fixture replay success, live-disabled fallback, field coverage, unknown fields, mobile subnav overflow, and create snapshot success.
- Field dictionary: expose grouped fields with sample value, type, coverage, normalized/raw-only status, storage recommendation, and promote/defer state.

## Section 02 - Browser Authorization And Write-Back Grants

Implement the browser authorization and SmartSpecPro write-back grant lifecycle. This grant authorizes the OpenAI-hosted connector flow to save data into SmartSpecPro for the current user. It is not a Shopee OAuth token and must not be used as a server-side Shopee session.

Files likely changed:

- `apps/web/server/routers/marketplaceIntelligence.ts`
- `apps/web/server/services/marketplaceConnectorGrantService.ts`
- `apps/web/shared/marketplaceIntelligence.ts`
- `apps/web/client/src/components/settings/MarketplaceConnectorSettingsPanel.tsx`
- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/server/routers.ts`

Tasks:

- Define grant status contract: `not_connected`, `pending`, `active`, `expired`, `revoked`, `scope_missing`, `provider_unavailable`.
- Add tRPC procedures for status, start authorization, complete authorization, revoke, and list recent connection events.
- Route the browser authorization confirmation through `/marketplace-capture/intelligence/connect/authorize` when a connector host needs a signed handoff page.
- Start authorization by returning a SmartSpecPro browser URL, signed write-back nonce, or redirect handoff, never by storing external Shopee/OpenAI credentials.
- Store only hashed grant identifiers, scopes, provider/account labels when safe, expiry, revocation metadata, and audit correlation IDs.
- Persist grant rows as user-owned records (`tenantId`, `userId`, provider, status, scopes, expiry, hash prefix) and deny all cross-user reads/writes.
- Keep Settings as the canonical management UI for authorize/revoke/reconnect/default region/locale; Connector Lab consumes status only.
- Fail closed when a grant is missing, expired, revoked, tenant-mismatched, or missing required scopes.
- Make the UI show the difference between `write-back ready`, `waiting for OpenAI-hosted Shopee payload`, and `snapshot saved`.
- Generate a copyable/openable OpenAI-hosted prompt that instructs the host to call the Shopee app for the keyword and then call SmartSpecPro's save tool/API with the returned structured data.
- Provide a manual paste/import fallback for host-returned JSON during developer mode, clearly marked as manual import rather than live MCP execution.

## Section 02A - OpenAI-Hosted Write-Back Handoff

Implement the handoff contract that lets data obtained in the OpenAI/ChatGPT Shopee app be written into SmartSpecPro.

Files likely changed:

- `apps/web/server/_core/mcpRegistry.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/marketplaceConnectorWriteback.ts`
- `apps/web/server/services/marketplaceConnectorWritebackService.ts`
- `apps/web/server/services/marketplaceIntelligenceService.ts`
- `apps/web/shared/marketplaceIntelligence.ts`
- `apps/web/client/src/pages/MarketplaceConnectorLab.tsx`
- `apps/web/client/src/components/settings/MarketplaceConnectorSettingsPanel.tsx`

Tasks:

- Register `save_marketplace_search_snapshot` as the canonical write tool for OpenAI-hosted connector output.
- Add an HTTPS API alias such as `POST /api/marketplace-connectors/shopee/writeback/search-snapshot` that uses the same schema and service as the MCP tool.
- Require authenticated SmartSpecPro MCP/session context or a short-lived write-back token bound to user, tenant, provider, nonce, and scope.
- Accept source provenance: `sourceProvider=openai_hosted_shopee_mcp`, `executionHost=openai_chatgpt`, upstream app ID, upstream tool name, host correlation ID, source captured time, and source freshness.
- Normalize OpenAI/Shopee item shapes into the existing marketplace probe/snapshot contract.
- Store raw payload only behind the owner-only raw retention policy.
- Return snapshot/report URLs and a concise summary for the OpenAI host to show the user.
- Add Connector Lab workflow: keyword prompt generator, write-back token status, last write-back event, payload hash, saved snapshot link, field coverage, and diagnostics.
- Add a developer manual-paste path using the same write-back service, explicitly labeled `manual_import` or `recorded_sample` unless the payload includes trusted OpenAI-hosted source provenance.
- Add audit events for write-back token creation, write-back accepted, duplicate/idempotent write-back, validation rejected, oversized payload rejected, and revoked token use.

## Section 03 - Fixture Replay And Connector Contract Harness

Build the safer testing path that keeps progress independent from live connector availability.

Files likely changed:

- `apps/web/shared/marketplaceIntelligence.ts`
- `apps/web/server/services/marketplaceConnectorFixtureService.ts`
- `apps/web/server/services/__tests__/marketplaceConnectorFixtureService.test.ts`
- `apps/web/server/fixtures/marketplace-connectors/shopee-search.sample.json`

Tasks:

- Define sanitized fixture format with source metadata, connector capability version, payload shape hash, redaction state, locale, keyword, and item samples.
- Preserve the recorded Shopee MCP `CGM` probe as a baseline fixture for field discovery and mapping evidence.
- Add field capability dictionary for useful fields: product, price, sales, rating/review, seller/shop, brand/category, ranking/search, logistics, diagnostics.
- Add fixture replay mode to the Connector Lab.
- Add shape hashing that is stable across value changes but changes when fields appear, disappear, or change type.
- Add unknown-field detection by comparing returned paths to active capability mappings.
- Add fixture promotion flow from field sample to committed test fixture.
- Add contract tests that replay fixture input through the same normalization path as live payloads.

## Section 04 - Database And Shared Contracts

Add the persistence layer only after the UI/harness contract is clear.

Files likely changed:

- `apps/web/drizzle/schema.ts`
- new SQL migration in `apps/web/drizzle/`
- `apps/web/shared/marketplaceIntelligence.ts`
- `apps/web/shared/marketplaceIntelligence.test.ts`

Tables:

- `marketplace_connector_imports`
- `marketplace_connector_capabilities`
- `marketplace_connector_grants`
- `marketplace_connector_field_samples`
- `marketplace_search_snapshots`
- `marketplace_search_snapshot_items`
- `marketplace_search_snapshot_product_links`
- `marketplace_product_metric_connector_snapshots`
- `marketplace_keyword_discoveries`
- `marketplace_keyword_discovery_clusters`
- `marketplace_search_reports`
- `marketplace_search_report_exports`
- `marketplace_watchlists`
- `marketplace_watchlist_events`

Tasks:

- Keep schema additive and tenant/user-owned. Connector grants, imports, raw samples, snapshots, reports, and watchlists are user-owned in v1.
- Add idempotency keys and payload hashes for imports and snapshots.
- Add raw retention fields: `rawRetentionExpiresAt`, `rawRedactedAt`, and redaction audit summary.
- Add mapping version fields so old snapshots remain interpretable after capability mappings evolve.
- Add indexes for tenant/user/date, source platform, keyword, seller/brand, snapshot/item rank, payload hash, and idempotency.
- Add foreign-key links to existing marketplace products where matching is possible.
- Add product-link confidence fields, link basis (`external_ids`, `source_url`, `title_seller_similarity`, `manual_review`), and last connector update timestamps.
- Add append-only connector metric snapshots for existing Marketplace Capture products instead of overwriting product truth.
- Add `marketplace_search_snapshot_product_links` and `marketplace_product_metric_connector_snapshots` as first-class tables, not just JSON fields on snapshot items.
- Add `marketplace_keyword_discoveries` and `marketplace_keyword_discovery_clusters` for keyword-first brand/model/type/use-case exploration before product matching.
- Add `externalModelId` / variant identifier support and index `(platform, externalShopId, externalProductId, externalModelId)` for exact seller/SKU monitor reports.
- Add multi-snapshot report fields: latest snapshot, baseline snapshot, optional comparison snapshot IDs, `sourceSummaryJson`, and `visualBlocksJson`.
- Add `marketplace_search_report_exports` for shareable image/CSV/JSON/PDF export metadata, template key, aspect ratio, status, storage keys, payload hash, source summary, and expiry.

## Section 05 - Ingestion Services And Internal API

Implement the backend path used by browser UI, MCP tools, and OpenAI-hosted write-back API aliases.

Files likely changed:

- `apps/web/server/services/marketplaceIntelligenceService.ts`
- `apps/web/server/services/marketplaceIntelligenceMetricsService.ts`
- `apps/web/server/services/marketplaceKeywordDiscoveryService.ts`
- `apps/web/server/services/marketplaceIntelligenceReportService.ts`
- `apps/web/server/routers/marketplaceIntelligence.ts`
- `apps/web/server/routers/__tests__/marketplaceIntelligence.test.ts`

Tasks:

- Add `createSnapshotFromConnectorPayload`, `saveOpenAiHostedShopeeSnapshot`, `saveFieldSample`, `listSnapshots`, `getSnapshot`, `createKeywordDiscovery`, `listKeywordDiscoveries`, `getKeywordDiscovery`, `refreshKeywordDiscoveryFromSnapshot`, `createReport`, and diagnostics procedures.
- Keep `dryRunConnectorSearch` fixture-only/developer-only unless an OpenAI-hosted payload has already been received. Browser dry-run must not imply SmartSpecPro can execute the Shopee app directly.
- Keep canonical router capability names aligned with the spec: `getConnectorStatus`, `saveSearchSnapshot`, `listSearchSnapshots`, `getSearchSnapshot`, `generateSearchReport`, `getSearchReport`, `listReportsBySnapshot`, `upsertWatchlist`, `listWatchlists`, `compareSnapshots`, and `getDiagnostics`.
- Add field dictionary/capability review procedures from stored samples.
- Validate all input with shared schemas.
- Normalize title, seller, price, sold count, ratings/reviews, rank, badges, official store signal, image URLs, external IDs, and source URLs when available.
- Normalize the fields proven useful by recorded MCP evidence: item/shop IDs, brand/category, price/original/discount/promotion, historical/monthly sold, rating distribution, verified shop, delivery text, merge rank, matched keywords, relevance level, and item type.
- Preserve raw and unknown fields in controlled JSON columns with redaction metadata.
- Compute deterministic metrics: share of shelf, seller visibility, brand visibility, price band, review strength, official store coverage, promotion signal, and data quality score.
- Compute deterministic Keyword Product Discovery clusters: brand/model/type/use-case, price tier, seller/trust mix, representative listings, confidence score, ambiguity warning, and refinement suggestions.
- Link snapshot items to existing `marketplace_products` using platform, external product/shop IDs, source URL, title similarity, and seller name.
- Update existing Marketplace Capture candidates/products with connector-derived metrics only through an enrichment service that records provenance and confidence.
- Append product price/metric snapshots and connector evidence for high-confidence product links.
- Return handoff actions for low-confidence matches instead of mutating product rows.
- Return idempotent results for duplicate payload hashes and idempotency keys.
- Return stable UI state codes for partial data, stale source, raw hidden, link needs review, discovery ambiguous, discovery no clear clusters, discovery low field coverage, duplicate/idempotent save, and permission denied.
- Return stable write-back state codes for `writeback_grant_missing`, `writeback_grant_expired`, `writeback_scope_missing`, `upstream_payload_invalid`, `upstream_payload_oversized`, `upstream_source_unverified`, `payload_duplicate`, and `snapshot_saved`.

## Section 06 - MCP Tools

Expose controlled tools for saving and reporting on marketplace connector data obtained by the OpenAI-hosted Shopee app.

Files likely changed:

- MCP server/tool registration files identified during implementation
- `apps/web/server/services/marketplaceIntelligenceService.ts`
- shared tool input schemas

Tools:

- `save_marketplace_search_snapshot`
- `generate_marketplace_competitive_report`
- `list_marketplace_snapshots`
- `get_marketplace_snapshot`

Tasks:

- Route all tool writes through the same write-back ingestion service as the browser/API alias.
- Require authenticated SmartSpecPro user context and active SmartSpecPro write-back grant where the operation saves connector-sourced data.
- Issue a signed user-scoped write-back token/package from the active grant for external connector hosts. Browser session auth is allowed for manual SmartSpecPro UI paste/import, but automated HTTPS write-back must not depend on session cookies.
- Do not require or store Shopee app credentials; the upstream execution host is responsible for Shopee connectivity.
- Include tool descriptions that tell the OpenAI host to call this tool after it obtains Shopee search results.
- Make the tool accept the raw source payload plus normalized hints, not just a pre-normalized SmartSpecPro shape.
- Require the same user who owns the connector grant; do not allow tenant-wide connector invocation in v1.
- Mark read-only and write-capable tools clearly in metadata.
- Make save operations idempotent.
- Return SmartSpecPro URLs for snapshots and reports.
- Never expose owner-only raw payloads through general read tools.

## Section 07 - Security, Observability, Retention, And Rollback

Make the feature production-safe before broader rollout.

Tasks:

- Add feature flags for lab, imports, MCP tools, reports, keyword discovery, report image skills, shareable image exports, and watchlists:
  - `MARKETPLACE_INTELLIGENCE_ENABLED`
  - `MARKETPLACE_CONNECTOR_LAB_ENABLED`
  - `MARKETPLACE_CONNECTOR_IMPORTS_ENABLED`
  - `MARKETPLACE_MCP_CONNECTOR_INGESTION_ENABLED`
  - `MARKETPLACE_INTELLIGENCE_LLM_REPORTS_ENABLED`
  - `MARKETPLACE_INTELLIGENCE_REPORT_EXPORTS_ENABLED`
  - `MARKETPLACE_INTELLIGENCE_SHAREABLE_IMAGE_ENABLED`
  - `MARKETPLACE_REPORT_IMAGE_SKILLS_ENABLED`
  - `MARKETPLACE_KEYWORD_DISCOVERY_ENABLED`
  - `MARKETPLACE_WATCHLISTS_ENABLED`
- Add audit events for authorization start/complete/revoke, write-back prompt/token creation, OpenAI-hosted write-back accepted/rejected, fixture replay, sample save, snapshot create, report create, raw read, and raw redact.
- Add audit events for Settings connection changes, capability refresh, Marketplace Capture product enrichment, product-link confirmation, and connector-derived metric update.
- Add rate limits by user, tenant, connector, keyword, and write action.
- Add structured logs with request ID, tenant ID, user ID, source mode, shape hash, quality score, and error code.
- Add redaction and retention cleanup jobs.
- Add rollback steps that can disable OpenAI-hosted write-back ingestion while leaving read-only snapshot browsing available.
- Add security tests for tenant isolation, revoked grants, raw payload access, replay/idempotency, oversized payloads, and unsafe image URLs.

## Section 08 - Reports, Watchlists, Handoff, And Product UI

Build value on top of validated snapshots after ingestion is stable.

Tasks:

- Generate competitive reports from stored snapshots, not live connector data.
- Add report sections for winner visibility, hero SKU, price leader, review leader, official store leader, promotion signal, and opportunity recommendations.
- Add Keyword Product Discovery workspace for broad terms before exact SKUs are known, including brand/model/type/use-case clusters, representative listings, price tiers, seller/trust mix, refinement suggestions, and handoff actions.
- Add report template blocks for Top Search Results Preview, Executive Summary, Brand Visibility / Share of Shelf, Seller Power Map, Winners by KPI, Strategy Matrix, Keyword Product Discovery Map, Price Tier / Product Type Ladder, Discovery Handoff Actions, Monitor Cards, New Competitor Watch, Marketing Insight, and What To Do Next.
- Add multi-day exact seller/SKU monitor reports with before/after price, rank, sold/day estimate, cumulative sold, monthly sold, rating, likes, and baseline-missing competitor detection.
- Add shareable image summary preview/export data for 1:1, 4:5, 9:16, and 16:9 layouts with source/disclaimer footer.
- Add report image skill registry and prompt generation service. Initial skills: `keyword_competitive_summary_image`, `keyword_product_discovery_image`, and `multi_day_sku_monitor_image`.
- Add `reportImageDataPackage` and `reportImagePromptPackage` contracts so report image generation remains auditable, provider-agnostic, and evidence-backed.
- Add image provider adapter handoff with default provider/model `gpt-image-2`, provider/model override policy, prompt hash, and export audit metadata.
- Register report types `competitive_landscape`, `pricing_analysis`, `seller_visibility`, `opportunity_finder`, `content_strategy`, `multi_day_sku_monitor`, `keyword_product_discovery`, and `shareable_image_summary`.
- Track future image skill keys `pricing_intelligence_image`, `opportunity_finder_image`, and `product_enrichment_image` even if v1 enables only the initial skill allowlist.
- Add watchlists for keywords, sellers, brands, and SKUs.
- Add change events for rank movement, price change, review/sold velocity, new unknown fields, and competitor entry/exit.
- Add handoff from snapshot item to existing marketplace product/content workflows where confidence is high.
- Add Marketplace Capture product enrichment panels showing latest connector evidence, last updated time, link confidence, and differences from current product metrics.
- Add user-only connection status badges on Marketplace Capture product pages when connector enrichment is available to the current user.
- Add contextual links from Marketplace Capture Product Detail, Candidate Batch detail, Snapshot Detail, and Report Detail so users can move between evidence, reports, watchlists, and products without dead-end routes.
- Add optional Dashboard/Marketplace Capture landing card for latest intelligence status when `MARKETPLACE_INTELLIGENCE_ENABLED` is enabled.
- Add dashboard/Marketplace Capture landing entry points that clearly separate keyword/category discovery from known product/SKU monitoring.
- Add snapshot list/detail pages with quality score, field coverage, source mode, capturedAt, item count, product-link candidates, and owner-only raw gate.
- Add field dictionary/capability review UI with grouped useful fields, type/sample/coverage, normalized/raw-only status, and promote/defer state.
- Add competitive report UI with winner cards, share-of-shelf, hero SKU, pricing bands, official/preferred badge signals, opportunity recommendations, and evidence links.
- Add watchlist detail UI with empty, paused, event detected, no-change, stale source, and write-back-unavailable states.
- Add diagnostics/audit UI for import health, schema drift, redaction/retention status, rate limits, and rollback/write-back-disabled state without exposing raw payloads to non-owners.
- Add mobile-first summary states and desktop dense table states for snapshot, report, product enrichment, watchlist, and diagnostics screens.

Tests and evidence:

- Deterministic reports are stable on fixture snapshots and every report claim cites snapshot item IDs or metric keys.
- Keyword Product Discovery tests verify cluster extraction for broad keywords, representative listing evidence, ambiguity warnings, refinement suggestions, and saved discovery reuse.
- Keyword Product Discovery UI tests verify empty, analyzing, clusters-ready, ambiguous, no-clear-clusters, low-field-coverage, saved, and handoff states.
- Multi-day monitor tests compare only exact seller/SKU/model matches and mark fuzzy/new items for review.
- Shareable image summary tests verify visual blocks include source mode, captured date range, item count, disclaimers, and evidence-backed metrics only.
- Report image skill tests verify sanitized data package input, required block validation, generated prompt package, provider/model selection, no unsupported metrics, and prompt/export audit persistence.
- Report export tests verify user ownership, source/disclaimer metadata, reproducible payload hash, and no raw payload leakage.
- Navigation tests verify Marketplace Intelligence and Keyword Discovery are discoverable from Marketplace Capture local subnav, Settings connector card, Product Detail, Candidate Batch, Snapshot Detail, Report Detail, and optional Dashboard/Marketplace Capture landing card.
- Cross-link tests verify back-links and breadcrumbs preserve context between Discovery Detail, Product Detail, Candidate Batch, Snapshot Detail, Report Detail, Watchlists, and Settings.
- Product enrichment UI hides connector-only raw/evidence for another user even when Marketplace Capture product sharing is enabled.
- Field dictionary UI renders new, stable, changed, raw-only, and promoted fields.
- Snapshot detail renders full-quality, partial-quality, raw-hidden, stale, and product-link-needs-review states.
- Watchlist UI renders empty, event-detected, paused, stale, and write-back-unavailable states.
- Diagnostics UI renders schema drift, retention/redaction, rate-limit, and rollback/write-back-disabled states without raw payload leakage.
- Playwright captures desktop and mobile evidence for Settings connector card, Connector Lab, Keyword Discovery search/detail, Field Dictionary, Snapshot Detail, Marketplace Product enrichment, Competitive Report, Keyword Product Discovery Report, Multi-day Monitor, Shareable Image Preview, image skill required-block warning, provider unavailable state, Watchlist, Diagnostics, and at least one unavailable/error state.

## Recommended Execution Order

1. Settings > Integrations write-back grant lifecycle and clear status copy.
2. SmartSpecPro MCP/API write-back receiver for OpenAI-hosted Shopee payloads.
3. Connector Lab prompt generator, write-back evidence viewer, fixture replay, recorded sample, shape hash, field coverage, capability summary, and sample save.
4. Database/contracts with user ownership, source provenance, Keyword Discovery, and Marketplace Capture product-link/enrichment tables.
5. Ingestion services, keyword discovery clustering, product matching, and Marketplace Capture metric enrichment.
6. MCP tools through the same user-owned write-back ingestion service.
7. Security/observability/retention gates.
8. Keyword Discovery, reports, watchlists, and Marketplace Capture handoff.

This order intentionally makes the write-back path real before deeper analytics work. It lets the team prove that OpenAI-hosted Shopee data can be saved into SmartSpecPro, update the spec with evidence, and avoid building dashboards on guessed data.

## Spec Phase Alignment

The implementation sections map to the phase plan in `spec.md`:

- `Phase 0 - Browser Connector Lab And Field Discovery` -> Sections 01, 02, 02A, 03
- `Phase 1 - Contracts Updated From Browser Evidence` -> Sections 02, 02A, 03, 06, 07
- `Phase 2 - Database And Service Layer` -> Sections 04, 05
- `Phase 3 - Internal API` -> Section 05
- `Phase 4 - SmartSpecPro MCP Tools` -> Section 06
- `Phase 5 - Web UI` -> Sections 01, 08
- `Phase 6 - AI Report Generation` -> Section 08
- `Phase 7 - Watchlists And Comparison` -> Sections 05, 08
- `Phase 8 - Product And Content Handoff` -> Sections 05, 08

Rollout stages must remain aligned with the spec:

- `Stage 1 - Internal Developer Mode`
- `Stage 2 - Staff Beta`
- `Stage 3 - Limited Customer Beta`
- `Stage 4 - Production`

MVP alignment:

- browser-first Connector Lab
- browser authorization grant flow
- field sample save/promote
- Marketplace Capture product-link and connector metric enrichment
- Keyword Product Discovery workspace
- deterministic competitive landscape report
- deterministic keyword product discovery report
- shareable image summary preview/export metadata
- optional LLM narrative only after deterministic metrics are stable

## Deferred / Not In MVP

Keep these explicitly out of the first production-grade MVP unless a later spec changes the scope:

- automatic background refresh through connector-host sessions
- background watchlist execution without user action
- automatic alerts beyond event-ready payloads
- product-level snapshot tool beyond search-result-derived enrichment
- bulk automated image generation beyond user-triggered report image prompt/export flows
- multi-marketplace support beyond source enum and schema readiness

Watchlists may ship as saved user-owned lists and comparison/event shells in v1, but no UI copy should promise unattended background refresh until a supported API or user-approved refresh mechanism exists.

## Spec Alignment Checklist

Implementation must keep these names and surfaces aligned with `spec.md`:

- Existing Marketplace Capture gate remains `MARKETPLACE_CAPTURE_ENABLED`; new intelligence flags layer on top of it.
- Existing related tables remain integration points: `marketplace_candidate_batches` and `marketplace_product_price_snapshots`.
- MCP tool surface includes `save_marketplace_search_snapshot`, `generate_marketplace_competitive_report`, `list_marketplace_watchlists`, and `upsert_marketplace_watchlist`.
- UI surface names from the spec must remain represented in implementation and tests: Marketplace Capture Local Navigation, Intelligence Overview, Settings / Integrations / Connections, Compatibility connect route, Field Dictionary / Capability Review, Snapshot List, Marketplace Capture Candidate Batch, Watchlist Detail, and Diagnostics / Audit.
- Route names from the spec must remain stable, including `/marketplace-capture/intelligence/connect/authorize` for browser authorization handoff.
- Grant status values must remain stable: `not_connected`, `pending`, `active`, `expired`, `revoked`, `scope_missing`, and `provider_unavailable`.
- Source provider/source mode handling must cover `fixture`, `recorded_mcp_sample`, `live_mcp`, `extension_capture`, `manual_import`, `shopee_mcp_connector`, `smartspc_extension_shopee_scan`, and future marketplace connector sources.
- Useful field groups must remain stable: Product, Price, Sales, Rating/review, Seller/shop, Brand/category, Ranking/search signals, Logistics, and Diagnostics/raw.
- Discovery cluster types must remain stable: `brand`, `model_family`, `product_type`, `use_case`, `price_tier`, `seller_group`, `trust_signal`, and `logistics_signal`.
- Export types and aspect ratios must remain stable: `json`, `csv`, `image_png`, `image_jpeg`, `pdf`, `1:1`, `4:5`, `9:16`, and `16:9`.
- Security launch checklist must remain represented in tests/gates: Auth required, Browser authorization grant required, Connector grants are hashed, Tenant isolation, Rate limits, Payload size bounded, Prompt injection, No marketplace cookies/tokens, No server-side scraping, Audit logs, and Retention/deletion.
- Test taxonomy must cover Unit Tests, Integration Tests, MCP Tool Tests, UI Tests, and Regression Fixtures.
- Regression fixture set must include CGM Shopee search result, monthly sold fields, ad badge, missing brand, malformed price, prompt injection, and broad keyword fixture variants.

## Launch Gates From Spec

Do not treat implementation as production-ready until these launch gates from `spec.md` are satisfied:

- Browser Connector Lab proves authorization, keyword test, field coverage, sample save, and snapshot creation in browser.
- Capability registry is updated from at least one sanitized field sample.
- migration applied and rollback tested.
- ingestion auth and tenant isolation tests passing.
- payload size and malformed JSON tests passing.
- prompt injection fixture passing.
- duplicate import idempotency passing.
- deterministic metrics validated on fixtures.
- report claims have evidence references.
- raw payload visibility restricted.
- UI exposes source, timestamp, field coverage, and delete/redact controls.
- operational dashboard exists for import failures and schema drift.

## UI Completeness Gates From Spec

Every visible surface is complete only when it has:

- target user and job-to-be-done
- source/freshness labels
- quality/coverage labels
- permission and privacy labels
- empty/loading/error/partial/stale states
- destructive confirmation state
- desktop and mobile layout requirement
- keyboard/focus/accessibility acceptance
- Thai and English copy requirements
- browser evidence requirement

## Product-To-Action Handoff

Reports and discovery outputs must produce structured next actions with evidence item IDs:

- save selected item as marketplace product
- update tracked product metrics
- generate product brief
- generate comparison content brief
- launch auto review/storyboard workflow
- create price alert
- add seller/brand to watchlist

## Success Metrics Alignment

Track the spec success metrics as part of implementation readiness:

Product:

- number of saved marketplace snapshots
- report generation rate
- repeat snapshots per keyword
- watchlist creation rate
- products saved from snapshot items
- content workflows launched from reports

Data quality:

- average field coverage
- monthly sold availability rate
- brand/shop identity availability rate
- product match rate
- duplicate import rate

Business value and reliability:

- time saved vs manual marketplace review
- number of actionable recommendations accepted
- number of pricing/visibility alerts acted on
- content generated from market intelligence
- import success rate
- report generation success rate
- p95 snapshot load time
- normalization error rate
- schema drift warning rate

## Future Extensions Alignment

Keep these future extensions visible but out of MVP unless separately scoped:

- TikTok Shop connector ingestion
- Lazada or Amazon marketplace connector ingestion
- Cross-marketplace keyword intelligence
- Competitor portfolio tracking
- Pricing alert notifications
- AI-assisted visual summary variants
- Product launch simulator
- SKU cluster analysis
- Integration with ad campaign planning
- Team briefing automation

## Final Product Principle

The long-term product direction is for SmartSpecPro to become the system of record for marketplace learning:

- Marketplace connectors provide fresh upstream capability.
- SmartSpecPro stores, normalizes, audits, and compares.
- Users decide what to save, refresh, share, and act on.
