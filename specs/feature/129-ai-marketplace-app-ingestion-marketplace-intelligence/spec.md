# Feature 129 - Shopee MCP Connector Ingestion And Marketplace Intelligence

Version: 1.0.0
Date: 2026-07-01
Status: Proposed
Depends-on:
- Feature 113 - Marketplace Capture Extension
- Feature 121 - MCP Connect / Settings Integrations patterns
- apps/web marketplace capture REST and tRPC surfaces
- apps/web Drizzle PostgreSQL schema and migration flow
- apps/web LLM gateway and provider routing
- apps/web auth, tenant, group-sharing, audit, and storage layers
- MCP connector tool model
Audience: Product, Web API, Data, LLM, MCP/Connector Integrations, Security, QA, Growth, E-commerce Operators

---

## 1. Executive Summary

SmartSpecPro already has a Shopee marketplace capture foundation through Feature 113: user-assisted listing scans, candidate batches, product captures, product metric snapshots, product insights, visual search, and product content workflows.

This feature extends that foundation by adding a first-class ingestion path for data obtained through user-authorized marketplace MCP connectors, starting with Shopee. The goal is not to replace the existing browser extension capture flow. The goal is to treat marketplace connectors as an upstream capability source when a user has permission to connect and retrieve marketplace data.

When a user authorizes a Shopee connector and runs a keyword/search analysis, the connector may return structured marketplace data. SmartSpecPro should expose its own MCP tools and internal ingestion APIs so the user can save that data into SmartSpecPro as durable, queryable marketplace intelligence snapshots.

Important architecture correction:

- In the target v1 flow, Shopee marketplace data is fetched inside the OpenAI/ChatGPT connector host, where the Shopee app is connected and authorized by the user.
- SmartSpecPro must not assume it can reuse, extract, or proxy the Shopee app session from that host.
- SmartSpecPro's responsibility is to expose a write-back ingestion surface: MCP tools and authenticated API endpoints that the OpenAI-hosted flow can call with structured Shopee results.
- Browser Settings authorization in SmartSpecPro authorizes write-back into SmartSpecPro for the current user. It is not a Shopee OAuth grant and must not be represented as proof that SmartSpecPro can call Shopee directly.
- Live proof for v1 means: an OpenAI-hosted Shopee tool produced current marketplace data, then successfully called SmartSpecPro's save tool/API, and the saved rows appear in SmartSpecPro with source provenance.

The production-grade outcome is a dual-source marketplace intelligence platform:

1. **SmartSpecPro extension capture** remains the controlled, user-assisted capture path from the user's browser.
2. **OpenAI-hosted Shopee MCP connector ingestion** becomes a user-scoped upstream import path for richer or newer connector-provided fields when that user has access in the connector host.
3. **SmartSpecPro database and analytics** become the durable intelligence layer for historical comparison, seller visibility, pricing movement, share of shelf, ad/organic signals, hero SKU detection, and content/action recommendations.
4. **Marketplace Capture products** remain the canonical product workspace and can be enriched or updated from validated connector snapshots when identity confidence is high.

The design must preserve raw upstream payloads for future compatibility while normalizing stable fields for analytics. If Shopee connector capabilities improve later, SmartSpecPro should be able to capture new fields immediately in raw payloads and progressively promote useful fields into normalized columns or derived metrics without data loss.

Connection setup must live in the existing user Settings / Integrations area, not as a marketplace-only setup surface. Marketplace Intelligence pages may link to Settings and display status, but the source of truth for grants, provider capabilities, defaults, and revoke/reconnect actions is the authenticated user's own connection configuration.

---

## 2. Current Context And Verified Capability

### 2.1 Existing SmartSpecPro Capability

Feature 113 already defines and partially implements:

- Shopee search/category page detection and visible product card scanning.
- Candidate batch upload and candidate item persistence.
- Candidate fields: title, URL, external product/shop IDs, price text, current price, original price, discount, sold count, image URL, badges, position, score, and score reasons.
- Product page capture, preview, LLM extraction, confirm/save, product image persistence, price/metric snapshots, and product health warnings.
- tRPC endpoints for captures, insights, candidate batches, products, product images, similar product search, and product insight generation.

Relevant current files:

- `specs/feature/113-marketplace-capture-extension/spec.md`
- `specs/feature/113-marketplace-capture-extension/sections/section-09-shopee-category.md`
- `apps/web/server/services/marketplaceCaptureService.ts`
- `apps/web/server/services/marketplaceProductService.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/client/src/pages/MarketplaceCaptureCandidateBatch.tsx`
- `apps/web/drizzle/schema.ts`

### 2.2 Marketplace MCP Connector Context

MCP-compatible marketplace connectors expose tools through an MCP server or connector host. The calling host chooses when to call tools based on tool metadata, user intent, available authorization, and returned structured data. A Shopee or marketplace connector has clean boundaries:

- The MCP server defines tools, auth, instructions, and returned structured data.
- Optional UI may render inside a connector host.
- The calling host decides when to invoke tools and can pass structured outputs between tools in the session.

Implication for this feature:

- SmartSpecPro should not assume its backend can silently call the Shopee connector as a normal server-to-server API.
- SmartSpecPro should expose tools that allow the OpenAI/ChatGPT host to save data already obtained through the connected Shopee app.
- If a user runs the Shopee app in ChatGPT, the Shopee authorization/session is owned by that host. SmartSpecPro receives only the structured payload that the host explicitly sends to SmartSpecPro's tool/API.
- SmartSpecPro's own Settings connection is a write-back grant and capability status for saving into SmartSpecPro; it is not a Shopee marketplace credential.
- Browser session auth is sufficient only for manual paste/import from SmartSpecPro UI. External connector-host write-back must use a user-scoped, signed, expiring, revocable write-back token/package issued from that user's active connector grant.
- User permission and connector host session availability are upstream constraints. If a user cannot connect Shopee, the feature should degrade to SmartSpecPro extension capture and manual imports.
- Connector grants and probe capability are personal to the authenticated user in v1. Tenant admins can enable/disable feature access, but one user's connector grant must not become another user's data source.

### 2.3 Observed Shopee Connector Data Shape

A live Shopee connector search for `CGM` returned structured results containing signals that are directly useful for marketplace intelligence:

- product name
- display price
- original price / discount
- historical sold count and monthly sold count
- rating text and rating star
- rating count distribution
- brand display name
- shop name
- `shopid` and `itemid`
- Shopee verified flag
- image IDs and image list
- estimated delivery text
- ad badge or item tracking metadata
- organic/ad tracking fields
- match/relevance metadata

These fields are richer than the current extension candidate item model in several areas, especially monthly sold count, brand identity, rating distribution, delivery, and tracking metadata. The ingestion layer must preserve those fields even if the first normalized schema only promotes a subset.

---

## 3. Problem Statement

Marketplace analysis is becoming a data workflow, not just a product capture workflow.

Today, SmartSpecPro can capture individual marketplace products and candidate batches. However, teams still lack a durable way to turn AI-hosted marketplace connector results into a historical, queryable intelligence layer.

Without this feature:

- A user can ask Shopee connector for competitive analysis, but the result remains ephemeral inside a chat.
- Rich fields from Shopee connector responses cannot be compared over time in SmartSpecPro.
- Product teams cannot reliably track keyword-level visibility, price movement, hero SKUs, seller dominance, or monthly sales signals.
- If Shopee connector capabilities improve, SmartSpecPro does not automatically benefit unless users manually copy/paste or the extension separately learns those fields.

With this feature:

- User-authorized app outputs become durable snapshots.
- SmartSpecPro can query, compare, and enrich those snapshots later.
- Existing marketplace capture, product database, LLM insight, and media/content workflows become more valuable because they can start from market-level intelligence instead of one product at a time.

---

## 4. Product Goals

1. Let users save Shopee connector search results from a connector host into SmartSpecPro as marketplace search snapshots.
2. Preserve the full upstream raw payload so new Shopee connector fields are not lost.
3. Normalize stable fields into analytics-friendly tables and derived metrics.
4. Link imported items to existing marketplace products and candidate batches where possible.
5. Update and enrich existing Marketplace Capture products with validated connector fields when identity matches are high-confidence:
   - monthly sold count
   - historical sold count
   - rating/review distribution
   - brand/category
   - seller/shop verification
   - price/discount/promotion signals
   - delivery text
   - latest connector-seen timestamp
6. Generate keyword-level competitive intelligence reports:
   - Share of Shelf
   - seller visibility
   - brand visibility
   - hero SKU detection
   - price band analysis
   - discount strategy analysis
   - sales velocity signals
   - rating/review trust signals
   - ad/organic visibility signals where available
7. Support refresh/update when the user runs the Shopee connector again and saves a newer snapshot.
8. Keep source provenance visible so every insight can be traced back to when, where, who, and how the data was obtained.
9. Provide clear fallback paths when the user cannot connect Shopee in a connector host.
10. Make the feature safe for production: tenant-aware, user-scoped, permissioned, auditable, rate-limited, idempotent, retention-aware, and resilient to upstream schema changes.
11. Place all connector connection management under Settings > Integrations / Connections, with Marketplace Intelligence and Marketplace Capture acting as consumers of the user's connection.

---

## 5. Non-Goals

- Do not bypass Shopee, connector host, or user authorization boundaries.
- Do not scrape Shopee from SmartSpecPro servers as part of this feature.
- Do not store connector host account credentials, Shopee cookies, OAuth secrets, or marketplace session tokens.
- Do not assume every user can connect the Shopee connector.
- Do not create tenant-wide or group-shared Shopee MCP connection access in v1; every connector grant and probe permission is per authenticated user.
- Do not make automated background refresh depend on connector host user-session app access unless an explicit supported API becomes available.
- Do not claim exact sales or revenue when the upstream source only provides public sold-count estimates.
- Do not expose raw marketplace payloads across tenants or groups without explicit product sharing permissions.
- Do not build generic arbitrary connector ingestion that accepts unbounded unknown app payloads from any source in v1. Start with marketplace-focused contracts and a Shopee profile.

---

## 5A. Product Architecture Decisions

### 5A.1 Settings-First Connector Configuration

The connection configuration surface belongs in the existing Settings / Integrations experience:

- Settings shows provider cards for Shopee MCP / marketplace connector status.
- Users can authorize, reconnect, revoke, refresh capability, and inspect safe usage from Settings.
- Settings stores user defaults such as preferred region/locale/result limit for marketplace probes.
- Marketplace Intelligence pages can show status and deep-link to Settings, but should not duplicate full connection management.
- Existing `/marketplace-capture/intelligence/connect/shopee` should become a compatibility redirect or lightweight explainer that opens the Settings connection panel.

### 5A.2 User-Scoped Permissions

All connection-grant rows, capability probes, field samples, snapshots, reports, and watchlist runs created from the connector are owned by both `tenantId` and `userId`.

Rules:

- Tenant feature flags can enable/disable the feature.
- A user's grant can only be used by that same user.
- A user's connector-derived raw payload is private by default.
- Shared Marketplace Capture product visibility does not imply sharing raw connector payloads or connector credentials.
- Later group sharing can be added only through explicit review and sharing rules, not by default.

### 5A.3 Marketplace Capture Relationship

Marketplace Capture remains the canonical product system for known products/SKUs. Marketplace Intelligence adds search-result and keyword-level evidence that can enrich Marketplace Capture without forcing every keyword exploration into an existing product record.

There are two distinct product workflows:

1. **Known SKU/product intelligence**: the user already knows the product or listing and wants current marketplace metrics, competitor movement, or a monitor report.
2. **Keyword product discovery**: the user starts from a broad keyword such as `notebook`, `กางเกงผ้าอ้อม`, or `กระดาษทิชชู่` and wants to understand which brands, models, product types, use cases, price tiers, and seller patterns exist before choosing any exact SKU.

Marketplace Intelligence can enrich Marketplace Capture in three ways:

1. **Candidate update**: when a connector snapshot item matches a candidate item by platform + external product/shop ID, update candidate diagnostics and latest observed marketplace metrics.
2. **Product enrichment**: when a connector snapshot item matches a saved Marketplace Capture product, append a product metric snapshot and store connector-sourced evidence in safe metadata.
3. **Discovery handoff**: when no product exists, offer a controlled "Create/Link Marketplace Product" action with source provenance and confidence score.

The service must never overwrite manually confirmed product truth blindly. Connector data should update time-varying metrics and enrich metadata with provenance; product identity, descriptions, and user-edited fields require confidence checks or user confirmation.

Keyword Product Discovery must remain usable even when no item can be linked to a saved product. It should create discovery records, clusters, reports, watchlists, and content briefs first; product/candidate creation is a downstream handoff only after the user sees enough evidence.

---

## 6. User Personas And Jobs To Be Done

### 6.1 E-commerce Operator

Job:

- "I want to know which sellers dominate a keyword today, what price range wins, and what actions I should take for my listing."

Value:

- Daily/weekly keyword snapshots.
- Pricing and promotion comparison.
- Competitor alerts.
- Product page/content actions.

### 6.2 Brand Or Category Manager

Job:

- "I want to understand category landscape and seller/brand visibility without manually copying data from marketplace pages."

Value:

- Share of Shelf by brand/seller.
- Official/verified presence.
- Hero SKU and SKU cluster visibility.
- Category movement over time.

### 6.3 Affiliate / Content Creator

Job:

- "I want to identify products worth making content for and quickly turn market signals into product briefs, scripts, and review videos."

Value:

- Opportunity scoring.
- Monthly sold and rating signals.
- Content angle recommendations.
- Direct handoff into Marketplace Auto Review and HyperFrames workflows.

### 6.4 SME Owner

Job:

- "I want simple guidance: should I compete on price, trust, content, bundle, or positioning?"

Value:

- Plain-language competitive report.
- Top 3 actions.
- Risks and market gaps.

### 6.5 Internal Growth / Marketing Team

Job:

- "I want dashboards and trend data from marketplace search results so campaign and product decisions are faster."

Value:

- Historical analysis.
- Exportable reports.
- Saved watchlists.
- Alerting and briefing generation.

---

## 7. Use Cases And Practical Benefits

### 7.1 Current Practical Benefits From Existing Data

Using existing candidate batches and product snapshots, SmartSpecPro can already support:

- Ranking visible products by score, sold count, discount, badge, and rank.
- Filtering by score, keyword, min sold, max price, and Mall/official badges.
- Exporting candidate batch CSV/JSON.
- Saving individual products into the marketplace product database.
- Tracking saved product price/sold/rating/review history after confirmation.
- Generating product briefs, storytelling handoffs, review insights, and content recommendations from product evidence.

Limitations:

- Existing candidate batches are batch-level, not keyword-intelligence first.
- They do not explicitly model search keyword, field coverage, source app/provider, snapshot sequence, or report versions.
- Existing normalized item fields do not capture all rich app-provided fields such as monthly sold count, brand ID, rating distribution, delivery, verified shop, or ad/organic metadata.

### 7.2 New Benefits From Shopee App Connector Ingestion

The Shopee connector can provide richer structured results when the user can connect it. By saving those results, SmartSpecPro can offer:

1. **Keyword Landscape Dashboard**
   - Which sellers/brands occupy the result set.
   - Share of Shelf by seller/brand.
   - Top SKUs by visibility, sold count, monthly sold count, rating, and discount.
   - Price distribution and outliers.
   - Official/verified/Mall ratio.

2. **Competitive Intelligence Report**
   - "Who is winning and why?"
   - Winners by visibility, sales signal, price, discount, trust, and ad/organic signal.
   - Weaknesses in the current market.
   - Recommended action strategy.

3. **Pricing Intelligence**
   - Median, min, max, and weighted price.
   - Price clusters by seller/brand.
   - Discount intensity.
   - Price changes between snapshots.
   - Alert when a tracked competitor changes price materially.

4. **Sales Velocity And Demand Signal**
   - Historical sold count and monthly sold count when available.
   - Growth proxy between snapshots.
   - SKU-level momentum.
   - Keyword demand proxy over time.

5. **Seller And Brand Visibility**
   - Seller concentration.
   - Brand concentration.
   - Seller entry/exit between snapshots.
   - Official/verified status movement.

6. **Opportunity Finder**
   - High sold count but weak rating.
   - High price but strong sales.
   - Low price but weak visibility.
   - Non-official sellers dominating official brands.
   - Products with high monthly sold but low content quality signals.

7. **Content And Creative Handoff**
   - Convert market findings into product briefs.
   - Suggest content angles based on gaps.
   - Trigger Marketplace Auto Review for selected products.
   - Build competitor comparison scripts.

8. **Market Watchlist**
   - Save keywords.
   - Compare current snapshot to previous snapshot.
   - Notify user of meaningful changes.

9. **Team Knowledge Layer**
   - Persist findings by tenant.
   - Share reports with groups.
   - Export CSV/JSON/PDF.
   - Feed internal planning, ad strategy, and product selection.

### 7.3 What This Still Cannot Guarantee

- It cannot guarantee full Shopee marketplace coverage.
- It cannot guarantee exact ranking parity for every user because marketplace personalization and app access may vary.
- It cannot guarantee exact sales volume unless upstream provides verified sales numbers.
- It cannot refresh in the background through an the connector host unless the platform provides a supported mechanism for user-authorized background tool access.
- It cannot make app fields stable. Upstream schemas may evolve, so raw-preserving ingestion is mandatory.

---

## 8. Product Surface

### 8.1 Marketplace connector / MCP Tool Surface

SmartSpecPro should expose a marketplace connector / MCP server with marketplace ingestion tools.

Initial tools:

1. `save_marketplace_search_snapshot`
2. `save_marketplace_product_snapshot`
3. `generate_marketplace_competitive_report`
4. `list_marketplace_watchlists`
5. `upsert_marketplace_watchlist`

V1 can ship with only tools 1 and 3 if scope must be reduced.

The tools should return:

- a concise natural-language summary for the calling host
- structured IDs for saved snapshot/report
- deep links into SmartSpecPro web UI
- warnings about missing fields, inferred values, and upstream limitations

### 8.2 SmartSpecPro Web Surface

Add a new product intelligence area under the existing marketplace capture umbrella:

- `/marketplace-capture/intelligence`
- `/marketplace-capture/intelligence/connector-lab`
- `/marketplace-capture/intelligence/discovery`
- `/marketplace-capture/intelligence/discovery/:discoveryId`
- `/marketplace-capture/intelligence/snapshots`
- `/marketplace-capture/intelligence/snapshots/:snapshotId`
- `/marketplace-capture/intelligence/fields`
- `/marketplace-capture/intelligence/reports`
- `/marketplace-capture/intelligence/reports/:reportId`
- `/marketplace-capture/intelligence/watchlists`
- `/marketplace-capture/intelligence/watchlists/:watchlistId`
- `/marketplace-capture/intelligence/diagnostics`

Connector connection management belongs in the existing user Settings / Integrations / Connections surface. `/marketplace-capture/intelligence/connect` and `/marketplace-capture/intelligence/connect/shopee` may remain as compatibility routes that explain the connector and deep-link to the Settings panel.

Alternative route:

- `/product-intelligence/*`

Recommended route:

- use `/marketplace-capture/intelligence/*` for v1 to preserve discoverability from the existing marketplace capture product area.

### 8.2A Navigation And Information Architecture

The existing main dashboard menu already has `Marketplace Capture` (`marketplace-capture`) at `/marketplace-capture`, guarded by `MARKETPLACE_CAPTURE_ENABLED`. Marketplace Intelligence should not add a separate main sidebar menu item in v1. It should become a first-class sub-area inside Marketplace Capture so users understand that connector intelligence enriches the existing product/candidate workspace rather than creating a disconnected product.

Navigation rule:

- **Main dashboard sidebar**: keep one primary entry, `Marketplace Capture`, linking to `/marketplace-capture`.
- **Marketplace Capture local navigation**: add a local tab/subnav inside Marketplace Capture for:
  - `Products` -> `/marketplace-capture`
  - `Captures` -> existing capture/preview flows
  - `Candidate Batches` -> existing candidate batch flows
  - `Intelligence` -> `/marketplace-capture/intelligence`
  - `Discovery` -> `/marketplace-capture/intelligence/discovery`
  - `Connector Lab` -> `/marketplace-capture/intelligence/connector-lab` when lab flag is enabled
  - `Reports` -> `/marketplace-capture/intelligence/reports`
  - `Watchlists` -> `/marketplace-capture/intelligence/watchlists`
  - `Fields` -> `/marketplace-capture/intelligence/fields`
  - `Diagnostics` -> `/marketplace-capture/intelligence/diagnostics` for staff/admin only
- **Settings**: connector authorization, revoke/reconnect, provider/model defaults, and report image provider settings live under Settings / Integrations / Connections. Marketplace Capture surfaces may deep-link there but must not duplicate full connection management.
- **Admin/Ops**: operational diagnostics that affect all tenants or feature rollout belong under existing admin Marketplace Capture Ops (`/admin/marketplace-capture`) or a future admin subtab, not the user-facing intelligence area.

Recommended new routes:

| Route | Navigation owner | Purpose | Entry points |
|---|---|---|---|
| `/marketplace-capture/intelligence` | Marketplace Capture local subnav | Intelligence overview with latest snapshots, reports, watchlists, and data quality | main Marketplace Capture page, dashboard card, local subnav |
| `/marketplace-capture/intelligence/connector-lab` | Marketplace Capture local subnav, staff/dev emphasized | Test connector/fixture fields and create snapshots | Settings connector card, compatibility connect route, Intelligence overview |
| `/marketplace-capture/intelligence/discovery` | Marketplace Capture local subnav | Explore broad product keywords before an exact SKU/product is known | Marketplace Capture landing, Intelligence overview, dashboard quick action, report actions |
| `/marketplace-capture/intelligence/discovery/:discoveryId` | Contextual detail | Review brand/model/type/use-case clusters, representative listings, and handoff actions | Discovery list, snapshot detail, report detail, watchlist |
| `/marketplace-capture/intelligence/snapshots` | Marketplace Capture local subnav | Browse snapshots by keyword/source/date | Intelligence overview, candidate batch, reports |
| `/marketplace-capture/intelligence/snapshots/:snapshotId` | Contextual detail | Inspect one snapshot and create reports/product links | Snapshot list, report detail, product detail |
| `/marketplace-capture/intelligence/fields` | Marketplace Capture local subnav | Field dictionary and capability review | Connector Lab, diagnostics, Intelligence overview |
| `/marketplace-capture/intelligence/reports` | Marketplace Capture local subnav | Browse generated reports and image exports | Intelligence overview, snapshot detail, product detail |
| `/marketplace-capture/intelligence/reports/:reportId` | Contextual detail | Report detail, evidence links, image skill/export actions | Reports list, snapshot detail, share links |
| `/marketplace-capture/intelligence/watchlists` | Marketplace Capture local subnav | Watch keyword/seller/brand/SKU changes | Intelligence overview, report actions |
| `/marketplace-capture/intelligence/watchlists/:watchlistId` | Contextual detail | Watchlist event timeline and refresh guidance | Watchlist list, report actions |
| `/marketplace-capture/intelligence/diagnostics` | Staff/admin local subnav | Schema drift, import health, retention/redaction, provider failures | Connector Lab, admin ops |
| `/marketplace-capture/intelligence/connect/shopee` | Compatibility route only | Explain that connection moved to Settings and deep-link there | Legacy links, existing implementation |

Contextual linking rules:

- Intelligence Overview should separate two primary starts: `Explore keyword/category` for discovery and `Track known product/SKU` for product enrichment/monitoring.
- Keyword Discovery should not require a Marketplace Product ID. It should let the user save the discovery, create a report, create a watchlist, generate a content brief, or create/link Marketplace Capture products only after reviewing clusters.
- Marketplace Product Detail should show a compact `Market Intelligence` panel when the current user has linked snapshots or connector enrichment for that product. Primary actions: view latest evidence, compare metrics, create monitor report, open related reports, open Settings when SmartSpecPro write-back is unavailable or no OpenAI-hosted Shopee payload has been saved yet.
- Marketplace Candidate Batch detail should show `Create Competitive Report`, `Create Snapshot`, and `Compare With Connector Snapshot` actions. It should not force users to leave the batch workflow unless they choose to open Intelligence detail.
- Snapshot Detail should link back to matched Marketplace Capture products and candidate batches through evidence badges, not only raw IDs.
- Report Detail should link every claim to snapshot items and matched products. Report actions can create watchlists, open product enrichment, create image summary, or generate content/product briefs.
- Shareable Image Summary should be launched from Report Detail and Monitor Report, not as a standalone main menu item.
- Connector Lab should link to Settings for authorization and to Field Dictionary after a sample/probe is saved.
- Settings connector card should link to Connector Lab for "test what fields are available" and to Intelligence overview for saved results.

Dashboard integration:

- Do not add a new primary sidebar item for Marketplace Intelligence in v1.
- Add an optional dashboard card/quick action inside the main Dashboard or Marketplace Capture landing content only when `MARKETPLACE_INTELLIGENCE_ENABLED` is enabled. The card should link to `/marketplace-capture/intelligence` and show latest snapshot/report/watchlist status.
- If future usage proves Marketplace Intelligence is a separate daily workflow, a separate sidebar item can be considered later with a product review; v1 should keep it under Marketplace Capture to reduce navigation sprawl.

### 8.3 Existing Pages To Extend

- Candidate batch detail page should show "Create Competitive Report" for both extension batches and connector-ingested snapshots.
- Marketplace products page should show user-owned connector provenance when applicable.
- Product detail page should show snapshot-based market context if the product appeared in saved search snapshots available to the current user.
- Marketplace Capture landing page should offer two distinct intelligence actions: explore a keyword/category and enrich/monitor a known product.
- Settings / Integrations should show connector status, capability refresh, revoke/reconnect, default region/locale/result count, last test search, and last Marketplace Capture enrichment update for the current user.

### 8.4 Browser Connector Lab

The first user-facing surface should be a browser-testable connector lab, before full dashboards and reports.

Purpose:

- let developers and staff connect/authorize the Shopee connector flow
- run a keyword search test from a browser-driven UI
- inspect exactly which fields are returned by the connector
- compare returned fields against the current capability registry
- save a sanitized field-discovery sample
- decide which fields should become normalized columns, metrics, or raw-only fields

Required UI:

- connection status panel
- authorize/revoke connector grant buttons
- keyword input and region/locale controls
- "Run test search" action
- raw response viewer with redaction controls
- normalized preview table
- field coverage matrix
- unknown/new field detector
- payload shape hash display
- save as fixture action
- create snapshot from test result action

This lab is not a production analytics dashboard. It is a validation and discovery surface that makes connector behavior visible in the browser before the team commits to downstream analytics assumptions.

### 8.5 Complete UI/UX Surface Matrix

The implementation must cover every surface below before the feature is considered production-ready. The priority order is Settings, Connector Lab, Keyword Product Discovery shell, Snapshot Detail, Marketplace Capture enrichment, Report, then Watchlists.

| Surface | Primary user goal | Required UI elements | Required states |
|---|---|---|---|
| Marketplace Capture Local Navigation | Move between products, captures, candidates, intelligence, reports, watchlists, fields, and diagnostics without losing Marketplace Capture context | horizontal tabs or secondary nav, active route state, feature-gated items, staff/admin diagnostics visibility, compact mobile overflow | feature disabled, active tab, hidden by role, mobile overflow, deep-linked detail |
| Intelligence Overview | See current marketplace intelligence status and continue the right workflow | workflow chooser for keyword/category discovery vs known product/SKU monitoring, latest snapshots, latest reports, watchlist summary, field coverage health, connector status summary, quick actions, data-quality warnings | empty, fixture-only, live unavailable, snapshots available, reports available, watchlists active, permission denied |
| Keyword Product Discovery | Explore a product keyword before exact SKUs are known | keyword search, region/locale/result controls, brand/model/type/use-case cluster map, representative listing cards, price tier ladder, seller/trust mix, evidence coverage, save discovery, create report, create watchlist, create content brief, create/link product candidate actions | empty, analyzing, clusters ready, ambiguous keyword, no clear clusters, low field coverage, partial data, low confidence, handoff pending, saved |
| Settings / Integrations / Connections | Connect, inspect, configure, revoke, and refresh the current user's Shopee connector | provider card, account label when safe, scopes, expiry, grant hash prefix, default region/locale/result count, capability refresh, last test run, revoke/reconnect confirmation | disabled by tenant flag, disconnected, connecting, active, expired, revoked, scope missing, provider unavailable, refresh failed, revoke pending, revoke success |
| Compatibility connect route | Explain why connection management moved to Settings and deep-link the user there | source summary, required access, privacy/retention summary, "Open Settings" action, Connector Lab secondary link | feature disabled, no tenant, not signed in, user has active grant, user needs reconnect |
| Connector Lab | Test live/fixture data and inspect fields before downstream use | source mode segmented control, keyword/region/locale/result controls, run action, normalized table, raw redacted viewer, field coverage matrix, unknown-field drawer, payload shape hash, save fixture, create snapshot | fixture ready, live unavailable, loading, partial data, validation error, raw hidden, unknown fields found, duplicate/idempotent save, snapshot created |
| Field Dictionary / Capability Review | Decide which fields are useful and how they map into analytics | grouped field list, type/sample/coverage/use labels, normalized vs raw-only marker, storage recommendation, promote/defer action | no sample, new field, changed type, stable field, deprecated field, needs review |
| Snapshot List | Find saved keyword snapshots and compare freshness | filters for keyword/platform/source/user, quality score, capturedAt, item count, source mode, field coverage badges | empty, loading, stale, partial, mixed source, permission denied |
| Snapshot Detail | Inspect one durable result set | summary cards, item table, seller/brand visibility, price range, quality panel, provenance, raw access gate, product-link candidates | full quality, partial quality, raw redacted, link high-confidence, link needs review, duplicate item warning |
| Marketplace Capture Candidate Batch | Compare extension batch with connector snapshot evidence | create report action, link snapshot action, field delta indicator, latest connector metrics | no connector data, match found, stale connector data, user-only evidence hidden to collaborators |
| Marketplace Product Detail | Keep tracked product metrics current from connector evidence | latest connector evidence panel, metric difference table, link confidence, capturedAt, apply/update action, provenance badge | enrichment available, enrichment private, stale, conflict with product truth, low-confidence review, update accepted |
| Competitive Report | Turn snapshot into decisions | winner cards, share-of-shelf table, hero SKU table, price band chart/table, official/preferred badge summary, opportunity recommendations, evidence links, export controls | report loading, ready, partial data, stale, no comparable data, export disabled, LLM narrative unavailable |
| Monitor Report | Track the same seller/SKU set across multiple snapshots | before/after metric cards, exact-match basis, price delta, sold/day estimate, rank delta, rating/like delta, new competitor watch, next action checklist | baseline missing, exact match incomplete, no price movement, demand movement detected, new competitor detected, stale baseline |
| Shareable Image Summary | Export a concise visual report for team communication | template picker, aspect ratio selector, source/freshness footer, evidence disclaimer, preview, export/share action | generating, ready, partial data warning, export failed, unsupported chart, source disclaimer required |
| Watchlist Detail | Track repeat marketplace changes | keyword/seller/brand/SKU list, schedule/reminder setting, event timeline, alert thresholds, last run, next suggested refresh | empty, paused, event detected, no change, stale source, live connector unavailable |
| Diagnostics / Audit | Support operators without leaking raw private data | import health, schema drift, redaction status, rate-limit counters, audit event list, rollback/disable status | normal, warning spike, provider down, retention due, raw redacted, rollback active |

Canonical grant status values for Settings, Connector Lab, and API contracts:

- `not_connected`
- `pending`
- `active`
- `expired`
- `revoked`
- `scope_missing`
- `provider_unavailable`

Canonical useful field groups for Field Dictionary, capability review, analytics, and report prompts:

- Product
- Price
- Sales
- Rating/review
- Seller/shop
- Brand/category
- Ranking/search signals
- Logistics
- Diagnostics/raw

### 8.6 UI/UX Quality Requirements

- UI copy must clearly distinguish `fixture replay`, `recorded sample`, `live connector`, `extension capture`, and `mixed` source modes.
- Every analytics view must show captured timestamp, source mode, item count, quality score, and field coverage before showing recommendations.
- Report language must say "captured result set" and "public marketplace signal" rather than implying full-market coverage or actual sales.
- Product enrichment actions must show before/after values and require confirmation when updating existing Marketplace Capture metrics.
- Low-confidence product links must offer explicit actions: link existing product, create new product, ignore, or request review.
- Raw payload drawers are hidden by default, owner-only, retention-labeled, and never part of shared product/report views.
- Tables must provide mobile-friendly row summaries and desktop density; charts must have textual summaries and accessible labels.
- Empty and unavailable states must direct users to either Settings connection, fixture replay, extension capture, or manual import.
- Thai and English localization keys must cover all primary actions, destructive confirmations, source-mode labels, field-quality labels, and permission-denied messages.
- Browser evidence must include desktop and mobile screenshots for Settings, Connector Lab, Keyword Discovery, Snapshot Detail, Product Enrichment, Report, and at least one unavailable/error state.
- Shareable report images must include source mode, captured date range, item count, and a disclaimer that results are based on captured public marketplace signals, not total-market truth.

---

## 9. High-Level Architecture

```txt
User in connector host or SmartSpecPro Settings
  |
  | Connects Shopee connector if allowed
  | Asks for Shopee keyword/search/product analysis
  v
Connector / MCP Host
  |
  | Calls Shopee connector tool when available
  | Receives structured marketplace result
  |
  | User asks: save/analyze in SmartSpecPro
  v
SmartSpecPro MCP Server / Web API
  |
  | save_marketplace_search_snapshot
  | generate_marketplace_competitive_report
  v
SmartSpecPro Web API
  |
  | Authenticates user
  | Validates tool payload
  | Stores raw payload + normalized items
  | Links to existing candidate/products where possible
  v
PostgreSQL
  |
  | marketplace_connector_imports
  | marketplace_search_snapshots
  | marketplace_search_snapshot_items
  | marketplace_search_reports
  | marketplace_watchlists
  v
SmartSpecPro Web UI / LLM Services
  |
  | Dashboards
  | Reports
  | Alerts
  | Content handoff
```

### 9.1 Source Model

This feature must support multiple source modes:

1. `shopee_mcp_connector`
   - Data came from the Shopee connector inside a connector host.
2. `smartspc_extension_shopee_scan`
   - Data came from Feature 113 extension candidate batch.
3. `manual_import`
   - User pasted or uploaded structured marketplace data.
4. `future_marketplace_app`
   - Reserved for TikTok Shop, Lazada, Amazon, or other future apps.

The normalized analytics layer should be source-agnostic where possible, but provenance must remain source-specific.

---

## 10. Data Model

### 10.1 New Tables

#### marketplace_connector_imports

Purpose:

- Record each inbound connector/tool ingestion event.
- Preserve raw upstream payload and metadata.
- Provide auditability and replay/debug ability.

Columns:

- `id` varchar primary key, prefix `mimp`
- `connectorGrantId` varchar nullable references `marketplace_connector_grants.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `sourceProvider` varchar not null
  - `shopee_mcp_connector`
  - `manual_import`
  - `smartspc_extension`
- `sourceAppName` varchar nullable
- `sourceAppVersion` varchar nullable
- `sourceToolName` varchar nullable
- `sourceSessionRef` varchar nullable
- `sourceConversationRef` varchar nullable
- `sourceRequestRef` varchar nullable
- `sourceCountry` varchar nullable
- `sourceLocale` varchar nullable
- `inputHash` varchar not null
- `payloadHash` varchar not null
- `payloadShapeHash` varchar nullable
- `payloadSchemaVersion` varchar not null default `1.0`
- `normalizerVersion` varchar nullable
- `rawPayloadJson` jsonb not null
- `normalizedSummaryJson` jsonb nullable
- `fieldCoverageJson` jsonb nullable
- `warningsJson` jsonb nullable
- `rawRetentionExpiresAt` timestamp with timezone nullable
- `rawRedactedAt` timestamp with timezone nullable
- `status` varchar not null default `accepted`
  - `accepted`
  - `normalized`
  - `partial`
  - `rejected`
  - `raw_redacted`
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(userId, createdAt)`
- `(tenantId, createdAt)`
- `(sourceProvider, createdAt)`
- `(connectorGrantId, createdAt)`
- `(rawRetentionExpiresAt)`
- unique `(userId, sourceProvider, payloadHash)` where status != `rejected`

#### marketplace_connector_capabilities

Purpose:

- Describe known capability and field mappings for each marketplace connector.
- Allow SmartSpecPro to accept upstream field changes safely while keeping analytics logic source-aware.
- Track normalizer versions and schema coverage over time.

Columns:

- `id` varchar primary key, prefix `mcc`
- `sourceProvider` varchar not null
  - `shopee_mcp_connector`
  - `manual_import`
  - `smartspc_extension`
  - future connector identifiers
- `platform` marketplace platform enum not null
- `capabilityVersion` varchar not null
- `normalizerVersion` varchar not null
- `supportedFieldsJson` jsonb not null
- `requiredFieldsJson` jsonb nullable
- `fieldMappingJson` jsonb not null
- `samplePayloadHash` varchar nullable
- `lastSeenPayloadShapeHash` varchar nullable
- `status` varchar not null default `active`
  - `active`
  - `deprecated`
  - `needs_review`
- `createdAt` timestamp with timezone default now not null
- `updatedAt` timestamp with timezone default now not null

Indexes:

- `(sourceProvider, platform, status)`
- unique `(sourceProvider, platform, capabilityVersion, normalizerVersion)`

Required v1 capability entry:

- `sourceProvider`: `shopee_mcp_connector`
- `platform`: `shopee`
- maps product title, product/shop IDs, brand/shop identity, price, sold count, monthly sold count, rating/review signals, image URLs, badges, ad/organic signal, tracking metadata, and delivery text where available

Operational behavior:

- ingestion should use the active capability entry for source-specific normalization
- unknown fields remain in raw payload and appear in field coverage diagnostics
- shape changes should update `lastSeenPayloadShapeHash` and may mark status `needs_review` if warning rates spike

#### marketplace_connector_grants

Purpose:

- Store short-lived browser authorization grants for marketplace connector ingestion.
- Support revocation, expiry, scope checks, and auditability without storing third-party credentials.

Columns:

- `id` varchar primary key, prefix `mcg`
- `userId` integer not null
- `tenantId` varchar nullable
- `sourceProvider` varchar not null
- `platform` marketplace platform enum nullable
- `stateNonceHash` varchar not null
- `grantHash` varchar not null
- `scopesJson` jsonb not null
- `status` varchar not null default `active`
  - `active`
  - `revoked`
  - `expired`
  - `used_once`
- `expiresAt` timestamp with timezone not null
- `lastUsedAt` timestamp with timezone nullable
- `revokedAt` timestamp with timezone nullable
- `createdAt` timestamp with timezone default now not null
- `metadataJson` jsonb nullable

Indexes:

- `(userId, createdAt)`
- `(tenantId, createdAt)`
- `(sourceProvider, status, expiresAt)`
- unique `(grantHash)`

Security requirements:

- store only hashed grant/token material
- never store connector host credentials, marketplace cookies, marketplace tokens, or connector account secrets
- grants must be scoped to marketplace intelligence actions
- default TTL is 24 hours or less
- revoked or expired grants must fail closed
- one-time grants should transition to `used_once` after ingestion if the connector flow supports single-use semantics

#### marketplace_connector_field_samples

Purpose:

- Store sanitized Connector Lab samples used to validate available fields before production normalization/report work.
- Preserve field-discovery evidence without requiring raw payload retention beyond policy.

Columns:

- `id` varchar primary key, prefix `mcfs`
- `connectorImportId` varchar nullable references `marketplace_connector_imports.id`
- `connectorGrantId` varchar nullable references `marketplace_connector_grants.id`
- `sourceProvider` varchar not null
- `platform` marketplace platform enum not null
- `keyword` text nullable
- `marketplaceRegion` varchar nullable
- `locale` varchar nullable
- `payloadShapeHash` varchar not null
- `fieldCoverageJson` jsonb not null
- `unknownFieldsJson` jsonb nullable
- `sampleRowsJson` jsonb nullable
- `redactionSummaryJson` jsonb nullable
- `capabilityDiffJson` jsonb nullable
- `status` varchar not null default `saved`
  - `saved`
  - `promoted_to_fixture`
  - `discarded`
- `createdByUserId` integer not null
- `tenantId` varchar nullable
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(sourceProvider, platform, createdAt)`
- `(tenantId, createdAt)`
- `(payloadShapeHash)`

Rules:

- samples must be sanitized before being stored as fixtures
- samples should include only enough rows to validate field mapping
- sample storage must obey the same tenant and raw-payload visibility policy as connector imports
- unknown fields should feed capability registry review before report logic uses them

#### marketplace_search_snapshots

Purpose:

- Model a keyword/search result snapshot as a durable market event.

Columns:

- `id` varchar primary key, prefix `mss`
- `connectorImportId` varchar nullable references `marketplace_connector_imports.id`
- `candidateBatchId` varchar nullable references existing `marketplace_candidate_batches.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `platform` marketplace platform enum not null
- `sourceProvider` varchar not null
- `capabilityId` varchar nullable references `marketplace_connector_capabilities.id`
- `normalizerVersion` varchar nullable
- `keyword` text not null
- `normalizedKeyword` text not null
- `sourceUrl` text nullable
- `categoryName` text nullable
- `sortMode` varchar nullable
- `filtersJson` jsonb nullable
- `resultCount` integer not null default 0
- `capturedAt` timestamp with timezone not null
- `snapshotSequence` integer nullable
- `marketplaceRegion` varchar nullable default `TH`
- `locale` varchar nullable default `th-TH`
- `fieldCoverageJson` jsonb nullable
- `qualityScore` integer not null default 0
- `status` varchar not null default `ready`
  - `ready`
  - `partial`
  - `superseded`
  - `archived`
- `createdAt` timestamp with timezone default now not null
- `updatedAt` timestamp with timezone default now not null

Indexes:

- `(userId, capturedAt)`
- `(tenantId, capturedAt)`
- `(platform, normalizedKeyword, capturedAt)`
- `(userId, platform, normalizedKeyword, capturedAt)`

#### marketplace_search_snapshot_items

Purpose:

- Store normalized result items from a search snapshot.
- Preserve per-item raw payload for future field promotion.

Columns:

- `id` varchar primary key, prefix `mssi`
- `snapshotId` varchar not null references `marketplace_search_snapshots.id`
- `connectorImportId` varchar nullable references `marketplace_connector_imports.id`
- `candidateItemId` varchar nullable references existing `marketplace_candidate_items.id`
- `matchedProductId` varchar nullable references existing `marketplace_products.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `platform` marketplace platform enum not null
- `sourceUrl` text nullable
- `canonicalUrl` text nullable
- `affiliateUrl` text nullable
- `externalProductId` varchar nullable
- `externalModelId` varchar nullable
- `externalShopId` varchar nullable
- `externalBrandId` varchar nullable
- `title` text not null
- `brandName` text nullable
- `shopName` text nullable
- `isOfficial` boolean nullable
- `isVerified` boolean nullable
- `isMall` boolean nullable
- `isAd` boolean nullable
- `adSignalText` varchar nullable
- `position` integer nullable
- `rankScore` integer nullable
- `relevanceScore` numeric nullable
- `priceCurrent` numeric nullable
- `priceOriginal` numeric nullable
- `currency` varchar default `THB`
- `discountPercent` integer nullable
- `discountText` varchar nullable
- `soldCountText` varchar nullable
- `soldCountNormalized` integer nullable
- `monthlySoldCountText` varchar nullable
- `monthlySoldCountNormalized` integer nullable
- `ratingScore` numeric nullable
- `reviewCountText` varchar nullable
- `reviewCountNormalized` integer nullable
- `ratingDistributionJson` jsonb nullable
- `likedCount` integer nullable
- `deliveryText` varchar nullable
- `imageUrl` text nullable
- `imageUrlsJson` jsonb nullable
- `badgesJson` jsonb nullable
- `trackingJson` jsonb nullable
- `rawJson` jsonb not null
- `normalizationWarningsJson` jsonb nullable
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(snapshotId, position)`
- `(snapshotId, soldCountNormalized)`
- `(snapshotId, monthlySoldCountNormalized)`
- `(snapshotId, priceCurrent)`
- `(userId, externalProductId)`
- `(platform, externalShopId, externalProductId)`
- `(platform, externalShopId, externalProductId, externalModelId)`

Checks:

- price fields non-negative
- sold/review/liked counts non-negative
- rating 0 to 5
- discount 0 to 100

#### marketplace_search_snapshot_product_links

Purpose:

- Record how connector snapshot items relate to existing Marketplace Capture products and candidate items.
- Preserve confidence, review state, and link evidence without relying only on nullable item columns.

Columns:

- `id` varchar primary key, prefix `msspl`
- `snapshotId` varchar not null references `marketplace_search_snapshots.id`
- `snapshotItemId` varchar not null references `marketplace_search_snapshot_items.id`
- `candidateItemId` varchar nullable references existing `marketplace_candidate_items.id`
- `marketplaceProductId` varchar nullable references existing `marketplace_products.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `platform` marketplace platform enum not null
- `externalProductId` varchar nullable
- `externalShopId` varchar nullable
- `canonicalUrl` text nullable
- `linkBasis` varchar not null
  - `external_ids`
  - `canonical_url`
  - `title_seller_similarity`
  - `manual`
  - `rejected`
- `confidenceScore` integer not null default 0
- `reviewState` varchar not null default `auto_linked`
  - `auto_linked`
  - `needs_review`
  - `confirmed`
  - `rejected`
  - `ignored`
- `evidenceJson` jsonb not null
- `reviewedByUserId` integer nullable
- `reviewedAt` timestamp with timezone nullable
- `createdAt` timestamp with timezone default now not null
- `updatedAt` timestamp with timezone default now not null

Indexes:

- `(snapshotId, reviewState)`
- `(snapshotItemId)`
- `(marketplaceProductId, createdAt)`
- `(userId, platform, externalShopId, externalProductId)`

Rules:

- High-confidence auto links may append connector evidence, but still must not overwrite Marketplace Capture product identity fields.
- Low-confidence links must remain in `needs_review` and drive explicit UI actions.
- Rejected links must be preserved so repeated imports do not repeatedly suggest the same bad match.

#### marketplace_product_metric_connector_snapshots

Purpose:

- Append connector-derived current marketplace metrics for existing Marketplace Capture products.
- Make Marketplace Capture product pages more current while preserving source provenance and user ownership.

Columns:

- `id` varchar primary key, prefix `mpmcs`
- `marketplaceProductId` varchar not null references existing `marketplace_products.id`
- `snapshotId` varchar nullable references `marketplace_search_snapshots.id`
- `snapshotItemId` varchar nullable references `marketplace_search_snapshot_items.id`
- `productLinkId` varchar nullable references `marketplace_search_snapshot_product_links.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `platform` marketplace platform enum not null
- `sourceProvider` varchar not null
- `sourceMode` varchar not null
  - `fixture`
  - `recorded_mcp_sample`
  - `live_mcp`
  - `extension_capture`
  - `manual_import`
- `capturedAt` timestamp with timezone not null
- `priceCurrent` numeric nullable
- `priceOriginal` numeric nullable
- `currency` varchar default `THB`
- `discountPercent` integer nullable
- `soldCountNormalized` integer nullable
- `monthlySoldCountNormalized` integer nullable
- `ratingScore` numeric nullable
- `reviewCountNormalized` integer nullable
- `rankPosition` integer nullable
- `isOfficial` boolean nullable
- `isMall` boolean nullable
- `isVerified` boolean nullable
- `deliveryText` varchar nullable
- `metricDiffJson` jsonb nullable
- `fieldCoverageJson` jsonb nullable
- `provenanceJson` jsonb not null
- `confidenceScore` integer not null default 0
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(marketplaceProductId, capturedAt)`
- `(userId, capturedAt)`
- `(tenantId, capturedAt)`
- `(platform, sourceProvider, capturedAt)`

Rules:

- Rows are append-only. They may feed product health warnings and latest-metric panels, but they do not replace user-confirmed Marketplace Capture truth.
- Shared product collaborators may see normalized enrichment only when the owner shares the report/product evidence; raw connector payload and connector-only diagnostics remain owner-only in v1.
- UI must show before/after values before any user-triggered metric update action.

#### marketplace_keyword_discoveries

Purpose:

- Store keyword-first product/category discoveries when the user does not yet know the exact SKU.
- Preserve synthesized brand/model/type/use-case understanding derived from one or more search snapshots.
- Let future reports, watchlists, briefs, and Marketplace Capture handoff reuse the discovery instead of re-analyzing the same keyword from scratch.

Columns:

- `id` varchar primary key, prefix `mkd`
- `userId` integer not null
- `tenantId` varchar nullable
- `platform` marketplace platform enum not null
- `keyword` text not null
- `normalizedKeyword` text not null
- `region` varchar nullable default `TH`
- `locale` varchar nullable default `th-TH`
- `sourceSnapshotIdsJson` jsonb not null
- `primarySnapshotId` varchar nullable references `marketplace_search_snapshots.id`
- `status` varchar not null default `ready`
  - `draft`
  - `analyzing`
  - `ready`
  - `partial`
  - `failed`
  - `archived`
- `taxonomyJson` jsonb nullable
  - brands
  - model families
  - product types
  - use cases
  - price tiers
  - trust/seller types
- `clusterSummaryJson` jsonb nullable
- `metricsJson` jsonb nullable
- `warningsJson` jsonb nullable
- `qualityScore` integer not null default 0
- `fieldCoverageJson` jsonb nullable
- `createdAt` timestamp with timezone default now not null
- `updatedAt` timestamp with timezone default now not null

Indexes:

- `(userId, platform, normalizedKeyword, region, updatedAt)`
- `(tenantId, platform, normalizedKeyword, region, updatedAt)`
- `(primarySnapshotId)`
- `(status, updatedAt)`

Rules:

- Discoveries are user-owned in v1, like connector snapshots and grants.
- A discovery can exist without any matched Marketplace Capture product.
- `taxonomyJson` and `clusterSummaryJson` must cite snapshot item IDs or report evidence keys for every claim.
- Ambiguous keywords should be stored with warnings and suggested refinement terms instead of being silently discarded.

#### marketplace_keyword_discovery_clusters

Purpose:

- Store queryable cluster rows for brand/model/type/use-case analysis.
- Make dashboard filters and report blocks fast without repeatedly traversing raw snapshot item JSON.

Columns:

- `id` varchar primary key, prefix `mkdc`
- `discoveryId` varchar not null references `marketplace_keyword_discoveries.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `clusterType` varchar not null
  - `brand`
  - `model_family`
  - `product_type`
  - `use_case`
  - `price_tier`
  - `seller_group`
  - `trust_signal`
  - `logistics_signal`
- `label` text not null
- `normalizedLabel` text not null
- `representativeSnapshotItemIdsJson` jsonb not null
- `evidenceJson` jsonb not null
- `metricsJson` jsonb nullable
- `confidenceScore` integer not null default 0
- `rank` integer nullable
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(discoveryId, clusterType, rank)`
- `(userId, clusterType, normalizedLabel)`
- `(tenantId, clusterType, normalizedLabel)`

Rules:

- Cluster labels may be inferred from titles, brand fields, category fields, and seller metadata, but inferred labels must carry confidence and evidence.
- Use-case clusters such as `office work`, `gaming`, `ผู้สูงอายุ`, `เด็ก`, `เช็ดหน้า`, or `เช็ดครัว` must be marked inferred unless directly supported by category/title attributes.
- Product handoff should use representative items and confidence, not cluster labels alone.

#### marketplace_search_reports

Purpose:

- Store generated competitive intelligence reports and derived analytics.

Columns:

- `id` varchar primary key, prefix `msr`
- `snapshotId` varchar not null references `marketplace_search_snapshots.id`
- `baselineSnapshotId` varchar nullable references `marketplace_search_snapshots.id`
- `comparisonSnapshotIdsJson` jsonb nullable
- `userId` integer not null
- `tenantId` varchar nullable
- `reportType` varchar not null
  - `competitive_landscape`
  - `pricing_analysis`
  - `seller_visibility`
  - `opportunity_finder`
  - `content_strategy`
  - `multi_day_sku_monitor`
  - `keyword_product_discovery`
  - `shareable_image_summary`
- `provider` varchar not null
  - `deterministic`
  - `server_ai`
  - `hybrid`
- `schemaVersion` varchar not null
- `reportGeneratorVersion` varchar nullable
- `status` varchar not null default `ready`
- `payloadHash` varchar not null
- `metricsJson` jsonb not null
- `narrativeJson` jsonb nullable
- `recommendationsJson` jsonb nullable
- `chartsJson` jsonb nullable
- `visualBlocksJson` jsonb nullable
- `warningsJson` jsonb nullable
- `sourceSummaryJson` jsonb not null
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(snapshotId, createdAt)`
- `(baselineSnapshotId, createdAt)`
- `(userId, createdAt)`
- unique `(snapshotId, reportType, payloadHash)`

Rules:

- Single-snapshot reports use `snapshotId` as the primary source.
- Multi-day monitor reports use `snapshotId` as the latest snapshot, `baselineSnapshotId` as the baseline, and `comparisonSnapshotIdsJson` for any additional intermediate snapshots.
- `sourceSummaryJson` must include source mode, captured date range, keyword, item count, snapshot IDs, field coverage summary, and warnings used by shareable report footers.
- `visualBlocksJson` must contain ordered, evidence-backed blocks that can render consistently in dashboard and image-summary surfaces.

#### marketplace_search_report_exports

Purpose:

- Store generated export metadata for shareable report cards and future CSV/JSON/PDF exports.
- Preserve what was exported so team-shared cards remain reproducible after report regeneration.

Columns:

- `id` varchar primary key, prefix `msre`
- `reportId` varchar not null references `marketplace_search_reports.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `exportType` varchar not null
  - `json`
  - `csv`
  - `image_png`
  - `image_jpeg`
  - `pdf`
- `templateKey` varchar nullable
- `skillKey` varchar nullable
- `skillVersion` varchar nullable
- `aspectRatio` varchar nullable
  - `1:1`
  - `4:5`
  - `9:16`
  - `16:9`
- `status` varchar not null default `pending`
  - `pending`
  - `rendering`
  - `ready`
  - `failed`
  - `expired`
- `storageKey` text nullable
- `previewStorageKey` text nullable
- `payloadHash` varchar not null
- `dataPackageHash` varchar nullable
- `promptPackageHash` varchar nullable
- `sourceSummaryJson` jsonb not null
- `imagePromptJson` jsonb nullable
- `imageProvider` varchar nullable
- `imageModel` varchar nullable
- `errorCode` varchar nullable
- `expiresAt` timestamp with timezone nullable
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(reportId, createdAt)`
- `(userId, createdAt)`
- `(tenantId, createdAt)`
- `(status, createdAt)`

Rules:

- Export payload must include source/disclaimer metadata and evidence IDs.
- Image exports may render from HTML-to-image or a future image-generation path, but must not invent visuals or metrics outside `visualBlocksJson`.
- AI image exports must store the generated prompt, provider, model, aspect ratio, template key, and source summary so the result is auditable and reproducible as far as provider behavior allows.
- AI image exports must store `skillKey`, `skillVersion`, `dataPackageHash`, and `promptPackageHash` whenever a report image skill is used.
- Export storage must respect the same sharing, retention, and raw-payload restrictions as the underlying report.

#### marketplace_watchlists

Purpose:

- Store user/tenant keyword watchlists for repeated snapshots and comparison.

Columns:

- `id` varchar primary key, prefix `mw`
- `userId` integer not null
- `tenantId` varchar nullable
- `platform` marketplace platform enum not null
- `keyword` text not null
- `normalizedKeyword` text not null
- `region` varchar nullable default `TH`
- `locale` varchar nullable default `th-TH`
- `sourcePreference` varchar not null default `any_user_authorized`
  - `mcp_connector`
  - `extension`
  - `manual`
  - `any_user_authorized`
- `refreshPolicyJson` jsonb nullable
- `alertPolicyJson` jsonb nullable
- `status` varchar not null default `active`
- `createdAt` timestamp with timezone default now not null
- `updatedAt` timestamp with timezone default now not null

Indexes:

- `(userId, status, updatedAt)`
- `(tenantId, status, updatedAt)`
- unique `(userId, platform, normalizedKeyword, region)` where status = `active`

#### marketplace_watchlist_events

Purpose:

- Store detected changes and alerts between snapshots.

Columns:

- `id` varchar primary key, prefix `mwe`
- `watchlistId` varchar not null references `marketplace_watchlists.id`
- `snapshotId` varchar nullable references `marketplace_search_snapshots.id`
- `previousSnapshotId` varchar nullable references `marketplace_search_snapshots.id`
- `userId` integer not null
- `tenantId` varchar nullable
- `eventType` varchar not null
  - `new_seller_entered`
  - `seller_left_top_results`
  - `price_drop`
  - `price_increase`
  - `hero_sku_changed`
  - `official_store_changed`
  - `monthly_sold_spike`
  - `visibility_shift`
- `severity` varchar not null default `info`
- `payloadJson` jsonb not null
- `createdAt` timestamp with timezone default now not null

Indexes:

- `(watchlistId, createdAt)`
- `(userId, createdAt)`
- `(tenantId, createdAt)`

### 10.2 Relationship To Existing Tables

Existing `marketplace_candidate_batches` can remain as the extension-oriented candidate batch table. This feature should not force-migrate existing candidate batches into search snapshots immediately.

Recommended integration:

- New connector ingestions create `marketplace_search_snapshots`.
- Existing candidate batches can be promoted into snapshots with a one-time or on-demand adapter.
- `marketplace_search_snapshot_items.candidateItemId` can link to existing candidate items where a snapshot is derived from a candidate batch.
- `marketplace_search_snapshot_items.matchedProductId` should link to existing marketplace products by `(userId, platform, externalShopId, externalProductId)` or canonical URL.
- Confirming/saving a product from a snapshot should create or update existing `marketplace_products` and `marketplace_product_price_snapshots`.

### 10.3 Raw-Preserving Field Promotion

All item-level upstream payloads must be stored in `rawJson`.

New upstream fields follow this lifecycle:

1. Captured in `rawJson`.
2. Surfaced in `fieldCoverageJson`.
3. Used in generated reports if safe and understood.
4. Promoted to normalized column only after repeated utility and stable interpretation.
5. Backfilled from raw payloads where feasible.

This prevents schema churn while still allowing immediate benefit from upstream improvements.

---

## 11. API And Tool Contracts

### 11.0 OpenAI-Hosted Write-Back Flow

The canonical production flow is:

1. User connects/uses the Shopee app in the OpenAI/ChatGPT host.
2. User asks the host to analyze a marketplace keyword such as `CGM`.
3. The host calls the Shopee app tool and receives structured marketplace results.
4. The host calls SmartSpecPro's MCP tool or authenticated ingestion API with those results.
5. SmartSpecPro validates the SmartSpecPro user/write grant, normalizes and stores the payload, and returns snapshot/report URLs.
6. The user opens SmartSpecPro to continue analysis, reporting, watchlists, and Marketplace Capture handoff.

This flow must be implemented before any UI claims that SmartSpecPro can use live Shopee MCP data. SmartSpecPro browser pages may start the process by showing copyable/openable prompts and by accepting returned snapshot IDs, but they cannot directly access the Shopee app session held by the OpenAI host.

Required write-back surfaces:

- SmartSpecPro MCP tool `save_marketplace_search_snapshot`.
- SmartSpecPro HTTPS API alias for the same operation, for connector hosts or automations that cannot call the MCP surface directly.
- A one-time or short-lived user write-back grant generated from Settings/Connector Lab and bound to tenant, user, source provider, scopes, nonce, and expiry.
- Idempotency key and payload hash so repeated host calls do not duplicate snapshots.

Required source provenance fields:

- `sourceProvider`: `openai_hosted_shopee_mcp`
- `executionHost`: `openai_chatgpt`
- `upstreamAppId` or safe app identifier when available
- `upstreamToolName`
- `hostConversationId` or safe correlation ID when available
- `hostSessionHash` if provided as a non-secret hash
- `sourceCapturedAt`
- `writebackReceivedAt`
- `sourceFreshness`: `live_at_writeback`, `recorded_sample`, `manual_import`, or `unknown`

Explicitly forbidden in v1:

- Storing ChatGPT/OpenAI connector access tokens.
- Storing Shopee cookies or marketplace login material.
- Claiming that SmartSpecPro backend can call the Shopee app directly unless an official provider token/session contract is added later.

### 11.1 MCP Tool: save_marketplace_search_snapshot

Purpose:

- Save a marketplace search result obtained in the OpenAI-hosted Shopee connector flow into SmartSpecPro.

Input schema:

```json
{
  "platform": "shopee",
  "sourceProvider": "openai_hosted_shopee_mcp",
  "keyword": "CGM",
  "sourceUrl": "https://shopee.co.th/search?keyword=CGM",
  "region": "TH",
  "locale": "th-TH",
  "capturedAt": "2026-07-01T00:00:00.000Z",
  "sourceMetadata": {
    "executionHost": "openai_chatgpt",
    "appName": "Shopee",
    "upstreamAppId": "asdk_app_697080d6e3f08191925a46ec4917e27f",
    "upstreamToolName": "search_items",
    "requestId": "optional-upstream-request-id",
    "hostConversationId": "optional-host-conversation-id",
    "hostSessionHash": "optional-non-secret-session-hash",
    "country": "TH"
  },
  "items": [
    {
      "title": "Ottai M8 CGM...",
      "sourceUrl": "https://shopee.co.th/product/...",
      "externalProductId": "26919549102",
      "externalShopId": "1418373937",
      "brandName": "Ottai",
      "shopName": "Ottai Health Global",
      "priceCurrent": 990,
      "priceOriginal": 1905,
      "discountPercent": 48,
      "soldCountText": "ขายแล้ว 10พัน+ ชิ้น",
      "soldCountNormalized": 10148,
      "monthlySoldCountText": "ขายได้ 1พัน+ ชิ้น/เดือน",
      "monthlySoldCountNormalized": 1376,
      "ratingScore": 4.897,
      "reviewCountNormalized": 3387,
      "isVerified": false,
      "isAd": false,
      "position": 3,
      "imageUrl": "https://...",
      "raw": {}
    }
  ],
  "rawPayload": {}
}
```

Output schema:

```json
{
  "snapshotId": "mss_...",
  "connectorImportId": "mimp_...",
  "resultCount": 10,
  "normalizedCount": 10,
  "matchedProductCount": 2,
  "warnings": [],
  "snapshotUrl": "https://app.smartspc.../marketplace-capture/intelligence/snapshots/mss_..."
}
```

Validation:

- Require authenticated SmartSpecPro user.
- Require a valid SmartSpecPro write-back grant or MCP session authorized for `marketplace.intelligence.write`.
- Require platform in allowed enum.
- Require keyword.
- Limit items per call in v1, recommended max 100.
- Reject payloads over configured size limit.
- Hash raw payload for idempotency.
- Accept partial items but record field coverage and warnings.

### 11.2 MCP Tool: save_marketplace_product_snapshot

Purpose:

- Save one product-level app result as either a product metric snapshot or a staged product candidate.

V1 can defer this tool if search snapshots are enough.

### 11.3 MCP Tool: generate_marketplace_competitive_report

Purpose:

- Generate deterministic and optional LLM-enhanced competitive analysis for a saved snapshot.

Input schema:

```json
{
  "snapshotId": "mss_...",
  "reportType": "competitive_landscape",
  "language": "th",
  "includeRecommendations": true,
  "compareToPrevious": true
}
```

Output schema:

```json
{
  "reportId": "msr_...",
  "snapshotId": "mss_...",
  "summary": "Ottai Health Global dominates visibility...",
  "topFindings": [],
  "reportUrl": "https://app.smartspc.../marketplace-capture/intelligence/reports/msr_..."
}
```

### 11.4 Internal tRPC Procedures

Add to `marketplaceCaptureRouter` or a new `marketplaceIntelligenceRouter`:

- `getConnectorStatus`
- `dryRunConnectorSearch`
- `saveFieldSample`
- `createSnapshotFromConnectorResult`
- `saveSearchSnapshot`
- `listSearchSnapshots`
- `getSearchSnapshot`
- `createKeywordDiscovery`
- `listKeywordDiscoveries`
- `getKeywordDiscovery`
- `refreshKeywordDiscoveryFromSnapshot`
- `generateSearchReport`
- `getSearchReport`
- `listReportsBySnapshot`
- `upsertWatchlist`
- `listWatchlists`
- `compareSnapshots`
- `getDiagnostics`

Recommendation:

- Add a new `marketplaceIntelligenceRouter` to keep the existing marketplace capture router from growing further.
- Register it under `marketplaceIntelligence`.
- Use existing auth and tenant helper patterns.
- The concrete implementation may expose wrapper/helper names such as `listSnapshots`, `getSnapshot`, and `createReport` in services or hooks, but they must map back to the canonical router capabilities above.

### 11.5 REST Endpoint Alternative

If MCP server implementation shares the existing web backend, use internal service functions rather than public REST. If a separate MCP server is deployed, expose narrow REST endpoints:

- `POST /api/marketplace-intelligence/search-snapshots`
- `POST /api/marketplace-intelligence/search-snapshots/:snapshotId/reports`

These endpoints must use a SmartSpecPro browser authorization grant, not static shared secrets.

Browser authorization flow:

1. Connector asks SmartSpecPro for an authorization URL with a signed state and requested scopes.
2. SmartSpecPro opens a browser page such as `/marketplace-capture/intelligence/connect/authorize`.
3. User signs in to SmartSpecPro if needed.
4. User chooses tenant/workspace and confirms requested scopes:
   - save marketplace snapshots
   - generate marketplace reports
   - read own marketplace intelligence
   - optionally create watchlist entries
5. SmartSpecPro issues a short-lived connector grant bound to:
   - `userId`
   - `tenantId`
   - source provider
   - scopes
   - expiration
   - state nonce
6. Connector uses the grant to call ingestion/report endpoints.
7. SmartSpecPro stores the resulting import with `connectorGrantId` for auditability.
8. SmartSpecPro logs grant creation, use, expiry, and revocation.

The connector grant must not contain or expose connector host credentials, marketplace cookies, marketplace tokens, or any third-party account secret.

---

## 12. Normalization Rules

### 12.1 Price Normalization

Handle:

- Shopee integer minor units when upstream sends values such as `99000000`.
- Text values such as `฿990`, `฿1,614`, `990.00`.
- Currency defaults to `THB` for Shopee Thailand unless upstream states otherwise.

Store:

- raw price in `rawJson`
- normalized decimal price in `priceCurrent`
- warning if scale is inferred

### 12.2 Sold Count Normalization

Handle Thai and English:

- `ขายแล้ว 10พัน+ ชิ้น` -> 10000
- `ขายได้ 1พัน+ ชิ้น/เดือน` -> 1000
- `20k+ sold` -> 20000
- `1.2m sold` -> 1200000
- `หมื่น`, `พัน`, `ล้าน`

Store:

- raw text
- normalized approximate number
- flag approximate values when `+` or rounded units are present

### 12.3 Seller And Brand Identity

Normalize:

- `shopid` -> `externalShopId`
- `shop_data.shop_name` -> `shopName`
- `global_brand.brand_id` -> `externalBrandId`
- `global_brand.display_name` -> `brandName`
- `shopee_verified` -> `isVerified`

Do not infer official status from shop name alone. Official/Mall status should come from upstream badge or known platform signal. If inferred, mark it as inferred.

### 12.4 Ad / Organic Signal

Normalize:

- visible ad badge text -> `isAd = true`
- tracking metadata `item_type_str = organic` -> `isAd = false`
- unknown -> null

Store full tracking metadata in `trackingJson` and `rawJson`.

### 12.5 Rank / Position

Use app result order as display position unless upstream provides an explicit rank. If upstream metadata exposes merge rank or relevance, store it separately and do not confuse it with visible result position.

### 12.6 Field Coverage

Each import and snapshot must compute coverage:

```json
{
  "items": 10,
  "title": 10,
  "price": 10,
  "soldCount": 10,
  "monthlySoldCount": 9,
  "rating": 10,
  "reviewCount": 8,
  "brand": 10,
  "shop": 10,
  "adSignal": 7,
  "image": 10
}
```

Use field coverage in UI and LLM prompts so reports avoid overstating missing data.

---

## 13. Analytics And Derived Metrics

### 13.1 Share Of Shelf

Definition:

- Percentage of captured result positions occupied by a seller or brand.

Variants:

- count share: item count / total result count
- weighted position share: higher weight for top positions
- sales-signal share: monthly sold count share where available

### 13.2 Visibility Score

Inputs:

- position
- rank score if available
- ad/organic status
- verified/official status
- image availability
- title keyword match

Output:

- 0 to 100 score
- deterministic reason list

### 13.3 Hero SKU Detection

Hero SKU candidates:

- top position plus high monthly sold
- high historical sold plus strong rating
- strong visibility plus competitive price
- repeated across snapshots

Report:

- winning SKU
- why it wins
- what risk it has

### 13.4 Pricing Metrics

Compute:

- min price
- max price
- median price
- average price
- weighted price by monthly sold where available
- discount distribution
- outlier products
- price clusters

### 13.5 Trust Metrics

Compute:

- average rating
- review count distribution
- verified/official share
- seller concentration
- low-rating high-sales opportunities

### 13.6 Demand Metrics

Compute:

- total historical sold across result set when available
- total monthly sold across result set when available
- monthly sold concentration by seller/brand
- momentum between snapshots

### 13.7 Change Detection

Compare latest snapshot to previous snapshot for same user/tenant/platform/keyword/region:

- new entrant
- seller disappeared
- hero SKU changed
- top seller share changed
- median price changed
- specific tracked product price changed
- ad/organic mix changed
- monthly sold changed materially

### 13.8 Exact SKU Monitor Metrics

For multi-day monitor reports, compare only exact matched items unless the user explicitly accepts fuzzy matches.

Preferred exact-match key:

1. `platform`
2. `externalShopId`
3. `externalProductId`
4. `externalModelId` or variant/model identifier when available
5. canonical source URL fallback when IDs are missing

Compute:

- price before/after and price delta
- rank before/after and rank delta
- cumulative sold before/after and delta
- estimated units sold per day from cumulative sold delta divided by day count
- monthly sold before/after and delta
- rating before/after and delta
- liked count before/after and delta where available
- badge/official/mall/preferred state changes
- new exact listing detected without baseline
- tracked listing disappeared from captured result set

Warnings:

- Do not compare different sellers/SKUs as if they are the same product.
- Show "baseline missing" for new competitors.
- Show "estimated" on sold/day because marketplace sold counters may be rounded, delayed, or reset.

### 13.9 Report Template Blocks From Marketplace Practice

The system should support reusable report blocks inspired by observed marketplace-intelligence workflows:

1. **Top Search Results Preview**
   - top 10 or top N item list with image, rank, title, seller, price, rating, sold signal, badges, and product URL
   - useful for quick human verification that the snapshot matches the intended keyword

2. **Executive Summary**
   - item count, official/mall/preferred count, average rating, total sold/monthly sold signal, source date range, and data-quality warnings

3. **Brand Visibility / Share Of Shelf**
   - brand or seller placements in top N
   - count share, weighted rank share, and sales-signal share when available

4. **Seller Power Map**
   - split between official brand stores, retailers, and general marketplace sellers
   - concentration and trust signal summary

5. **Winners By KPI**
   - shelf occupancy winner
   - hero product winner
   - price leader
   - demand/momentum leader
   - trust/official execution leader
   - emerging/new competitor

6. **Strategy Matrix**
   - brand/seller row
   - current strategy inferred from evidence
   - strengths
   - risks
   - opportunity/action recommendation

7. **Monitor Cards**
   - one card per tracked seller/SKU
   - before/after price, sold/day estimate, cumulative sold, monthly sold, rating, likes, rank, and concise interpretation

8. **New Competitor Watch**
   - listings entering the captured top N without previous baseline
   - price, sold/monthly sold signal, seller type, and risk note

9. **Marketing Insight / What To Do Next**
   - 3 to 5 prioritized actions tied to evidence IDs
   - examples: monitor 7-14 more days, watch new seller, adjust price band, improve official/trust signal, create comparison content, add price alert

10. **Keyword Product Discovery Map**
   - brand/model/type/use-case clusters from a broad keyword before exact products are selected
   - examples: notebook brand/model families, diaper pants sizes/use cases, tissue paper type/use cases
   - must show confidence, representative listings, and evidence-backed labels

11. **Price Tier / Product Type Ladder**
   - product families grouped by price band, package size, product type, or intended use
   - useful when the user needs to understand what is sold in a category before monitoring specific SKUs

12. **Discovery Handoff Actions**
   - create watchlist, generate competitive report, create content brief, create product candidate, link to existing Marketplace Capture product, or ignore cluster
   - each action must preserve evidence and confidence

13. **Shareable Image Summary**
   - 1:1, 4:5, 9:16, or 16:9 card layout for team sharing
   - must include source mode, captured timestamp/date range, keyword, item count, disclaimer, and evidence-backed metrics only

These blocks should be composable. A keyword competitive report may use Top Search Results, Executive Summary, Share Of Shelf, Seller Power Map, Strategy Matrix, Winners By KPI, and Key Takeaways. A keyword product discovery report may use Keyword Product Discovery Map, Price Tier / Product Type Ladder, representative listings, use-case matrix, and Discovery Handoff Actions. A multi-day monitor report may use Monitor Cards, New Competitor Watch, Estimated Units Sold/Day, Marketing Insight, and What To Do Next.

### 13.10 Keyword Product Discovery Metrics

Keyword Product Discovery is exploratory and should not require a known Marketplace Capture product.

Compute:

- brand presence and brand confidence from explicit brand fields, title parsing, and seller evidence
- model family clusters from repeated model terms, variant names, package sizes, and category fields
- product type clusters such as `gaming notebook`, `business notebook`, `กางเกงผ้าอ้อมผู้ใหญ่`, `ทิชชู่เช็ดหน้า`, `ทิชชู่เปียก`, or `กระดาษชำระ`
- use-case clusters such as office work, gaming, travel, baby, elderly care, kitchen cleaning, facial use, or commercial bulk use when evidence supports it
- price tier distribution by cluster
- seller/trust mix by cluster
- representative listings per cluster
- field coverage and ambiguity score
- suggested refinement keywords and negative keywords

Warnings:

- Do not present inferred model/type/use-case labels as authoritative product taxonomy.
- Always show representative listings and confidence for inferred clusters.
- If a keyword is too broad or mixed, show refinement suggestions rather than a single winner narrative.
- Keep SKU-level comparisons separate from keyword/category discovery until the user selects exact listings or creates a monitor.

---

## 14. AI Report Design

### 14.1 Report Types

1. `competitive_landscape`
   - executive summary
   - winners and why
   - market structure
   - recommended actions

2. `pricing_analysis`
   - price bands
   - discount behavior
   - competitor price movements
   - suggested price position

3. `seller_visibility`
   - seller/brand share
   - official/verified presence
   - concentration risk

4. `opportunity_finder`
   - market gaps
   - content/product opportunities
   - weak competitors with strong demand

5. `content_strategy`
   - content angles
   - product brief inputs
   - creative hooks
   - comparison storylines

6. `multi_day_sku_monitor`
   - exact seller/SKU comparison across two or more snapshots
   - price/rank/sold/rating/like deltas
   - estimated units sold per day
   - new competitor watch
   - next monitoring actions

7. `keyword_product_discovery`
   - brand/model/type/use-case clusters for broad keywords
   - representative listings and price tiers
   - ambiguity/refinement suggestions
   - product candidate, content brief, report, and watchlist handoff actions

8. `shareable_image_summary`
   - selected report blocks arranged into a 1:1, 4:5, 9:16, or 16:9 visual summary
   - source/disclaimer footer
   - evidence-backed metrics only
   - export metadata for image generation or HTML-to-image rendering

### 14.2 Deterministic First, LLM Second

Production reports should compute metrics deterministically first. LLMs should explain, synthesize, and recommend, but not invent metrics.

Report payload should separate:

- `metricsJson`: deterministic computed values
- `narrativeJson`: LLM-generated explanations
- `recommendationsJson`: action items with evidence links
- `warningsJson`: missing data, inferred values, limitations
- `visualBlocksJson`: ordered report blocks for dashboard and shareable image rendering

### 14.3 Evidence And Claim Discipline

Every generated claim should reference:

- snapshot ID
- item IDs
- metric key
- source field
- confidence or warning if inferred

Example claim:

```json
{
  "text": "Ottai Health Global dominates the captured CGM result set by item count.",
  "evidence": {
    "snapshotId": "mss_...",
    "metric": "sellerShare.count",
    "seller": "Ottai Health Global",
    "value": 0.7
  },
  "confidence": "high"
}
```

### 14.4 Report Image Skill Architecture

Shareable report images should be generated through report-specific image prompt skills. The skill layer does not fetch marketplace data and does not generate the final image directly. It receives a validated, evidence-backed report data package from SmartSpecPro and returns a structured image prompt package for the configured image generation provider.

Responsibilities:

1. **SmartSpecPro data service**
   - selects report type, template key, aspect ratio, language, brand/theme options, and image provider
   - builds a sanitized `reportImageDataPackage`
   - includes only fields already present in `metricsJson`, `visualBlocksJson`, `sourceSummaryJson`, and evidence references
   - removes raw payloads, connector-only diagnostics, secrets, internal IDs not needed for rendering, and unsupported claims

2. **Report image skill**
   - validates that the required report blocks exist for its report type
   - converts the data package into a provider-agnostic image prompt
   - defines layout hierarchy, chart/table emphasis, typography guidance, color intent, icon intent, image/copy constraints, and disclaimer footer
   - returns warnings when the data is insufficient for the requested visual template
   - never invents metrics, product names, seller names, prices, dates, ranks, or recommendations

3. **Image generation provider adapter**
   - renders the image from the prompt package
   - defaults to `gpt-image-2` when no tenant/user/provider override is configured
   - can be changed per tenant, report template, or user-permitted provider
   - stores provider, model, prompt package hash, output storage keys, and generation warnings in `marketplace_search_report_exports`

Recommended initial report image skills:

| Skill key | Source report type | Best output | Required blocks |
|---|---|---|---|
| `keyword_competitive_summary_image` | `competitive_landscape` | top-10 keyword visibility report | Top Search Results Preview, Executive Summary, Share Of Shelf, Seller Power Map, Winners By KPI, Key Takeaways |
| `multi_day_sku_monitor_image` | `multi_day_sku_monitor` | before/after seller/SKU monitor | Monitor Cards, Estimated Units Sold/Day, New Competitor Watch, Marketing Insight, What To Do Next |
| `keyword_product_discovery_image` | `keyword_product_discovery` | broad keyword product/category map | Keyword Product Discovery Map, Price Tier / Product Type Ladder, Representative Listings, Discovery Handoff Actions |
| `pricing_intelligence_image` | `pricing_analysis` | price band and discount strategy card | Price Band, Price Leaders, Promotion Signals, Outliers, Recommended Price Position |
| `opportunity_finder_image` | `opportunity_finder` | market gap / action report | Weak Competitor Signals, Demand Signals, Trust Gaps, Content/Product Actions |
| `product_enrichment_image` | `content_strategy` | product/content action brief | Product Evidence, Competitor Comparison, Content Angles, Next Actions |

`reportImageDataPackage` contract:

```json
{
  "reportId": "msr_...",
  "reportType": "multi_day_sku_monitor",
  "skillKey": "multi_day_sku_monitor_image",
  "templateKey": "monitor_v1",
  "aspectRatio": "1:1",
  "language": "th",
  "sourceSummary": {
    "platform": "shopee",
    "keyword": "CGM",
    "sourceMode": "live_mcp",
    "capturedRange": "2026-06-29..2026-06-30",
    "itemCount": 10,
    "qualityScore": 86,
    "disclaimer": "Based on captured public marketplace signals."
  },
  "visualBlocks": [],
  "evidenceRefs": [],
  "styleOptions": {
    "density": "executive",
    "tone": "market_intelligence",
    "brandTheme": "smart_spec_pro"
  },
  "constraints": {
    "noUnsupportedClaims": true,
    "showEstimatedLabels": true,
    "includeFooterDisclaimer": true
  }
}
```

`reportImagePromptPackage` contract:

```json
{
  "skillKey": "multi_day_sku_monitor_image",
  "skillVersion": "1.0.0",
  "provider": "gpt-image-2",
  "model": "gpt-image-2",
  "aspectRatio": "1:1",
  "prompt": "Create a Thai marketplace intelligence report image...",
  "negativePrompt": "Do not invent metrics, dates, product names, sellers, or prices.",
  "dataIntegrityNotes": [
    "Use only supplied visualBlocks and sourceSummary.",
    "Show estimated labels for sold/day."
  ],
  "warnings": []
}
```

Skill versioning:

- Every image prompt skill must have `skillKey`, `skillVersion`, supported report types, supported aspect ratios, required blocks, optional blocks, and a test fixture.
- Prompt packages must store a hash of the input data package and skill version.
- Regenerating an image with the same report and skill version should reuse the stored prompt package unless the user changes template, aspect ratio, language, or provider.
- If a skill detects missing required data, the UI should show a repairable warning instead of generating a misleading image.

Provider configuration:

- Default provider/model: `gpt-image-2`.
- Tenant/user settings may override provider/model when allowed by feature flags and available credentials.
- Provider adapters must expose supported aspect ratios, max prompt length, max image count, and content-safety errors.
- The report skill should remain provider-agnostic; provider-specific prompt adjustments belong in the adapter layer.

---

## 15. Refresh And Update Semantics

### 15.1 User-Initiated Refresh

V1 refresh is user-initiated:

1. User asks the connector host to run Shopee search again.
2. User asks SmartSpecPro to save/update the snapshot.
3. SmartSpecPro creates a new snapshot for the same keyword.
4. SmartSpecPro compares it to the previous snapshot.
5. SmartSpecPro optionally generates watchlist events.

### 15.2 Idempotency

If the same payload is submitted twice:

- return the existing `connectorImportId` and snapshot where possible
- do not duplicate items
- allow report regeneration only if requested or report payload differs

Idempotency keys:

- `payloadHash`
- `userId`
- `sourceProvider`
- `keyword`
- `capturedAt` where available

### 15.3 Supersession

New snapshots should not delete old snapshots. They can mark older reports as stale if:

- same platform/keyword/region
- newer snapshot exists
- report compares only a previous snapshot

### 15.4 Background Automation Constraints

Do not promise background refresh through a Shopee connector host in v1. Shopee or marketplace connector access is user/session/permission mediated. Background automation should use one of:

- SmartSpecPro extension scheduled reminders that ask the user to refresh.
- User-triggered connector host commands.
- Future official API/app automation support if available.
- Manual import.

---

## 16. Security, Privacy, And Compliance

### 16.1 Trust Boundary

All upstream payloads are untrusted:

- Shopee connector results
- connector-host-provided structured data
- raw payloads
- image URLs
- tracking metadata
- product URLs

Validate, size-limit, sanitize, and store safely.

### 16.2 Authentication

SmartSpecPro MCP tools must authenticate the SmartSpecPro user through a browser-based authorization page. The saved snapshot belongs to that user and tenant.

Do not accept anonymous marketplace ingestion.

Required auth model:

- Connector-host write-back cannot ingest data until the user opens SmartSpecPro in a browser and confirms authorization.
- The authorization page must show the source provider, execution host, requested SmartSpecPro write scopes, tenant/workspace, and retention notice.
- The grant must be short-lived and revocable.
- The grant must be scoped to marketplace intelligence actions only.
- The grant must not permit general account access, admin actions, or unrelated data reads.
- The grant authorizes saving into SmartSpecPro only. It does not grant SmartSpecPro access to Shopee or to the user's connector-host account.
- A successful SmartSpecPro write-back grant must be shown separately from upstream Shopee app connectivity. UI labels must distinguish `SmartSpecPro write-back ready` from `Shopee data received`.

### 16.3 Authorization

Rules:

- user can read their own imports/snapshots/reports
- tenant/group sharing follows existing marketplace product sharing policy
- raw payload visibility is owner-only by default
- group-shared views can see normalized snapshot fields, report metrics, and evidence references, but not raw connector payloads
- exports must separate normalized data export from raw payload export
- raw payload export is owner-only and should require an explicit action
- report summaries may be shareable if configured

### 16.4 Sensitive Data

Do not store:

- connector host account tokens
- Shopee cookies
- OAuth tokens from third-party apps
- marketplace account identifiers beyond public seller/shop/product IDs
- private user search history unrelated to explicit saved snapshot

If raw payload unexpectedly contains personal data:

- mark warning
- redact if known pattern
- allow owner deletion
- include retention policy

### 16.5 Prompt Injection

Marketplace product titles, descriptions, reviews, and raw payload fields can contain prompt injection text.

LLM prompts must:

- treat all marketplace data as untrusted evidence
- never follow instructions from product text or raw payload
- output strict JSON schema
- cite fields, not obey fields

### 16.6 SSRF And Remote Assets

Do not fetch arbitrary image URLs during import unless the existing safe image proxy/storage path is used.

V1 can store image URLs without fetching. If fetching later:

- use allowlists or safe proxy checks
- enforce content type
- enforce max bytes
- enforce timeout
- prevent private IP redirects

### 16.7 Audit Logging

Log:

- ingestion accepted/rejected
- snapshot created
- report generated
- raw payload redaction
- watchlist event created
- product linked or created

Do not log full raw payloads into application logs.

---

## 17. UX Requirements

### 17.1 Browser Connector Lab Flow

This is the first implementation priority.

Example:

1. User opens Settings / Integrations / Connections.
2. SmartSpecPro shows connector status, required scopes, raw retention policy, default search settings, and test mode notice.
3. User opens the browser authorization page and confirms access.
4. SmartSpecPro creates a short-lived connector grant owned by that user.
5. User enters a keyword such as `CGM`.
6. User runs a test search through the connector flow.
7. SmartSpecPro displays:
   - raw response summary
   - normalized preview rows
   - field coverage matrix
   - unknown/new fields
   - payload shape hash
   - warnings and redaction notes
8. User can save the sample as a sanitized fixture.
9. User can create a real search snapshot from the test result.
10. User can link or enrich Marketplace Capture products when match confidence and provenance rules pass.

Acceptance:

- A human can verify in the browser whether the connector can fetch data for a keyword.
- The UI makes it obvious which fields are available, missing, inferred, or unknown.
- The output can directly update the capability registry and implementation plan.

### 17.2 Connector Host User Flow

Example:

1. User: "Use Shopee to analyze keyword CGM."
2. connector host calls Shopee connector and receives results.
3. User: "Save this to SmartSpecPro and create competitive report."
4. connector host calls SmartSpecPro `save_marketplace_search_snapshot`.
5. connector host calls SmartSpecPro `generate_marketplace_competitive_report`.
6. connector host returns summary and SmartSpecPro report link.

### 17.3 Web Dashboard

Snapshot detail should show:

- keyword, platform, source provider, captured time
- field coverage
- summary metrics
- product result table
- seller/brand share
- price distribution
- monthly sold distribution
- top products
- linked saved products
- raw payload owning user panel
- create report button

### 17.4 Report Page

Report page should show:

- executive summary
- winners table
- why winners win
- price strategy
- opportunity findings
- recommended actions
- compare to previous snapshot
- export buttons

### 17.5 Watchlist Page

Watchlist should show:

- saved keywords
- latest snapshot
- previous snapshot
- last report
- alerts/events
- refresh instructions
- source availability status

### 17.6 Empty And Degraded States

Handle:

- user has not connected Shopee connector
- no snapshots yet
- import had partial fields
- no monthly sold count
- no previous snapshot for comparison
- LLM report failed but deterministic metrics succeeded
- upstream payload too large
- duplicate import

---

## 18. Production Observability

Metrics:

- imports accepted/rejected by source
- normalization success rate
- average item count per snapshot
- field coverage by source
- report generation success/failure
- LLM token/cost by report type
- duplicate import rate
- watchlist event count
- snapshot query latency

Logs:

- structured event logs without raw payload dumps
- import IDs and snapshot IDs for traceability
- validation warning counts

Dashboards:

- ingestion health
- source coverage
- report generation health
- storage growth
- DB query performance

Alerts:

- repeated import rejection from same source
- normalization error spike
- report generation failures
- payload size near limit
- DB table growth above threshold

---

## 19. Rate Limits, Quotas, And Abuse Controls

Connector ingestion is user-authorized, but still needs abuse controls because upstream payloads are untrusted and can trigger storage, LLM, and reporting cost.

Default v1 limits:

- max 100 items per import
- max raw payload bytes per import from config
- max imports per user per hour from config
- max report generations per snapshot per hour from config
- max active connector grants per user/source from config
- max watchlists per user/tenant from config

Behavior:

- return clear rate-limit errors with retry guidance
- never partially persist an import that fails quota checks before DB transaction starts
- allow admin override only through server-side config, not connector input
- log rate-limit rejections without raw payload dumps
- include quota usage in observability dashboards

Tests:

- import over item limit is rejected
- payload over byte limit is rejected
- repeated report generation is throttled
- expired grants do not bypass rate limits
- admin/service bypass, if added, is separately audited

---

## 20. Performance Requirements

Ingestion:

- Accept up to 100 items per snapshot in v1.
- Validate and persist import under 1 second for 50 items excluding DB contention.
- Generate deterministic metrics under 500ms for 100 items.
- LLM report generation can be async if expected to exceed request timeout.

Dashboard:

- Snapshot detail initial load under 2 seconds for 100 items.
- Report detail initial load under 2 seconds.
- Watchlist list under 1 second for 100 watchlists.

Database:

- Use indexes for user/tenant/keyword/capturedAt access.
- Avoid JSONB scans for common dashboard metrics by normalizing stable fields.
- Add pagination for items if v2 supports more than 100 results.

---

## 21. Retention And Lifecycle

Default retention:

- raw connector imports: retained for 180 days by default, then redacted to an audit summary unless the tenant config shortens retention
- normalized snapshots: retained until user deletes
- reports: retained until user deletes or snapshot is deleted
- watchlist events: configurable, default 365 days
- connector authorization grants: expire by default within 24 hours, or sooner if source/host requirements demand it
- grant audit events: retained for 365 days

Deletion:

- deleting a snapshot deletes snapshot items and reports
- connector import raw payload is redacted when its retention window expires or owner requests redaction
- redaction updates `rawRedactedAt`, clears or replaces `rawPayloadJson` with a minimal redacted marker, and preserves audit summary fields
- audit summary is retained after raw redaction: source provider, hashes, item count, field coverage, timestamps, and warning counts
- owner can delete raw payload while keeping normalized snapshot and reports
- deleting normalized snapshot data removes derived reports and watchlist links that depend on it
- group-shared reports lose access when the underlying owner deletes or redacts required evidence

Archive:

- old snapshots may be archived from hot dashboards but remain queryable for trend reports

Default visibility policy:

- owner: can view normalized snapshot, report, field coverage, connector-only enrichment evidence, and raw payload until raw retention expires
- tenant admin: can view audit metadata and shared normalized reports only when separately permitted, but cannot use another user's connector grant or raw payload in v1
- group member: can view shared normalized report/snapshot only, without connector-only raw payload or private field diagnostics
- external export recipient: can view only the export file generated by an authorized user

This policy is the default production posture. Tenants may shorten raw retention or disable raw-payload viewing entirely, but should not expand raw visibility beyond the owning user without a separate security review.

---

## 22. Implementation Plan

### Phase 0 - Browser Connector Lab And Field Discovery

- Build the Settings / Integrations connector configuration panel.
- Keep `/marketplace-capture/intelligence/connect/shopee` only as a compatibility explainer/deep-link to Settings.
- Build `/marketplace-capture/intelligence/connector-lab`.
- Implement browser authorization page UX from Settings, scopes, grant TTL, and revocation path.
- Implement minimal connector grant service and status endpoint.
- Add a test-search action that can run with a representative Shopee connector payload path.
- Render raw response summary, normalized preview rows, field coverage matrix, unknown fields, payload shape hash, and warnings.
- Add "save sanitized fixture" and "create snapshot from test result" actions.
- Persist field-discovery samples in `marketplace_connector_field_samples`.
- Persist user-owned connector search snapshots and Marketplace Capture link/enrichment candidates.
- Keep this phase behind staff/admin feature flag until security review passes.

Acceptance:

- Staff can open the browser UI, authorize connector access, run a Shopee keyword test, and see exactly which fields are available.
- UI shows missing, inferred, unknown, and newly discovered fields clearly.
- Test result can be saved as a sanitized regression fixture.
- Test result can seed or update the `shopee_mcp_connector` capability mapping.
- Connector grant is hashed, scoped, expiring, revocable, and visible in status UI.
- No raw payload is logged to application logs.

### Phase 1 - Contracts Updated From Browser Evidence

- Finalize MCP tool contracts.
- Decide whether SmartSpecPro MCP server lives inside `apps/web` or separate deployment.
- Define source provider enum and payload schema versions.
- Review Connector Lab field-discovery results and update capability mapping.
- Add threat model.
- Adopt default raw payload policy: owning user visibility only, 180-day raw retention, audit-summary retention after redaction.

Acceptance:

- Tool schemas are documented and testable.
- Security review approves trust boundaries and auth plan.
- Browser evidence confirms which Shopee fields are available before downstream schema/report work begins.
- Browser authorization page clearly shows source provider, tenant/workspace, scopes, retention, and revoke/delete options.

### Phase 2 - Database And Service Layer

- Add Drizzle tables and migration.
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
- Add ingestion service:
  - validate payload
  - hash payload
  - persist connector import
  - bind import to connector grant where present
  - resolve active connector capability mapping
  - normalize snapshot/items
  - compute field coverage
  - compute quality score
  - compute keyword discovery clusters when requested
  - link existing products
- Add deterministic metrics service.
- Add keyword discovery service for brand/model/type/use-case clusters, price tiers, seller/trust mix, representative listings, ambiguity warnings, and refinement suggestions.
- Add raw replay/reprocessing service interface, even if v1 only supports admin/manual execution.

Acceptance:

- Unit tests cover normalization, idempotency, capability mapping, field coverage, quality score, and product matching.
- Migration is additive and reversible by normal migration rollback.
- Seed/default capability entry exists for `shopee_mcp_connector` on `shopee`.
- Field samples can be saved, sanitized, reviewed, and promoted to fixtures.
- Keyword discoveries can be saved and queried without a Marketplace Capture product match.
- Connector grants are stored hashed, scoped, expiring, and revocable.
- Unknown upstream fields are retained in raw payload and surfaced in diagnostics.

### Phase 3 - Internal API

- Add `marketplaceIntelligenceRouter` tRPC procedures.
- Add narrow REST endpoint only if separate MCP server needs it.
- Add browser authorization grant endpoints and ownership tests.
- Add keyword discovery procedures:
  - `createKeywordDiscovery`
  - `listKeywordDiscoveries`
  - `getKeywordDiscovery`
  - `refreshKeywordDiscoveryFromSnapshot`

Acceptance:

- Authenticated user can create/list/get snapshots.
- Authenticated user can create/list/get keyword discoveries from stored snapshots.
- Another user cannot read raw imports or snapshots.
- Duplicate payload returns idempotent result.
- Connector ingestion fails until the user completes browser authorization.
- Expired or revoked connector grants cannot ingest or read data.

### Phase 4 - SmartSpecPro MCP Tools

- Implement `save_marketplace_search_snapshot`.
- Implement `generate_marketplace_competitive_report`.
- Return SmartSpecPro deep links.
- Add connector/tool metadata and tool descriptions optimized for connector host tool routing.

Acceptance:

- In developer mode, connector host can call SmartSpecPro tool with a representative Shopee result payload.
- Tool response includes IDs, warnings, and links.

### Phase 5 - Web UI

- Add Settings / Integrations connector panel as the canonical connect/configure/revoke/defaults surface.
- Keep `/marketplace-capture/intelligence/connect/shopee` as compatibility explainer and deep-link.
- Add `/marketplace-capture/intelligence/discovery` and `/marketplace-capture/intelligence/discovery/:discoveryId` for keyword-first product/category exploration.
- Add Intelligence overview workflow chooser for `Explore keyword/category` and `Track known product/SKU`.
- Promote Connector Lab output into production snapshot views.
- Add snapshot list and snapshot detail pages with source mode, quality score, field coverage, item table, seller/brand visibility, and raw owner-only gate.
- Add field dictionary / capability review view that lists observed fields, coverage, sample values, storage recommendation, and promote/defer state.
- Add report page with deterministic winner analysis, pricing bands, hero SKU, official/preferred badge signals, opportunity recommendations, evidence links, and cautious report copy.
- Add Keyword Discovery UI with brand/model/type/use-case clusters, representative listings, price tiers, seller/trust mix, confidence, ambiguity/refinement suggestions, and handoff actions.
- Extend candidate batch detail with connector snapshot comparison and report generation path.
- Extend Marketplace Product detail with connector enrichment panel, before/after metric deltas, link confidence, capturedAt, and explicit update/link confirmation actions.
- Add watchlist detail shell with stale/write-back-unavailable states even if automation is deferred.
- Add diagnostics/audit UI for import health, schema drift, raw retention/redaction, and rollback metadata without raw payload leakage.
- Add empty/degraded/error states for no grant, fixture-only, provider unavailable, partial data, stale data, permission denied, and feature-disabled cases.

Acceptance:

- User can inspect saved snapshots, field coverage, reports, and Marketplace Capture enrichment in browser.
- Field coverage, provenance, quality score, source mode, capturedAt, and item count are visible on every analytics surface.
- Product enrichment actions show before/after values and require confirmation for low-confidence or conflicting updates.
- Report and handoff actions are usable on desktop and mobile, with accessible tables/charts and no text overlap.
- Browser evidence exists for Settings, Connector Lab, Keyword Discovery, Snapshot Detail, Product Enrichment, Report, mobile layout, and at least one unavailable/error state.

### Phase 6 - AI Report Generation

- Add deterministic competitive metrics.
- Add deterministic keyword product discovery report metrics.
- Add server-side LLM narrative generation with strict schema.
- Add claim/evidence mapping.
- Add report regeneration and stale report handling.
- Add report image skill prompt package generation for keyword competitive summary, keyword product discovery, and multi-day SKU monitor.

Acceptance:

- Deterministic metrics can generate without LLM.
- Keyword product discovery reports can generate without LLM and cite representative snapshot item evidence.
- LLM report never invents unsupported metrics in tests.
- Prompt injection fixture is ignored.

### Phase 7 - Watchlists And Comparison

- Add watchlist CRUD.
- Add compare latest vs previous snapshot.
- Add watchlist event generation.
- Add alert-ready event payloads.

Acceptance:

- User can save keyword watchlist.
- New snapshot generates meaningful diff events.
- No background refresh is promised without user action.

### Phase 8 - Product And Content Handoff

- Link snapshot items to saved marketplace products.
- Add "save as product" or "update product metrics" action.
- Add discovery-cluster handoff to create candidate products or content briefs only after user confirmation.
- Add content strategy report handoff to existing product brief/storytelling/auto review workflows.

Acceptance:

- Selected item can become a marketplace product.
- Product detail shows market context from snapshots.
- Content workflows can use report findings as input evidence.

---

## 23. Testing Expectations

### 23.1 Unit Tests

Normalization:

- Shopee price minor-unit conversion.
- Thai/English sold count parsing.
- Monthly sold count parsing.
- Rating/review count extraction.
- Brand/shop identity mapping.
- Ad/organic signal mapping.
- Position vs merge rank separation.
- Field coverage calculation.

Service:

- import payload hash idempotency.
- duplicate payload does not create duplicate snapshots.
- partial item payload stores warnings.
- raw payload preserved.
- connector import records the grant used for ingestion.
- raw retention expiry and redaction timestamps are populated.
- active connector capability mapping is applied.
- connector field sample stores field coverage, unknown fields, payload shape hash, and redaction summary.
- unknown connector fields remain in raw payload and field diagnostics.
- quality score changes predictably with field coverage.
- product matching by external IDs.
- product matching by canonical URL fallback.

Metrics:

- seller share count.
- weighted share of shelf.
- hero SKU selection.
- price band calculation.
- keyword discovery brand/model/type/use-case clustering.
- keyword discovery ambiguity and refinement suggestions.
- compare snapshot changes.

Security:

- cross-user read blocked.
- raw payload not exposed to unauthorized user.
- payload size rejected.
- malicious prompt text stored as data, not instructions.
- browser authorization grant is required before connector ingestion.
- connector grant token material is stored hashed only.
- connector grant scope checks reject unsupported actions.
- expired or revoked connector grant is rejected.
- group-shared users cannot access raw connector payloads.
- rate limits reject repeated ingestion/report requests.

### 23.2 Integration Tests

- Browser Connector Lab can authorize, run keyword test, render field coverage, and save sanitized sample.
- Create snapshot through tRPC.
- Complete browser authorization flow and create snapshot with connector grant.
- Generate deterministic report.
- Generate keyword product discovery report.
- Generate LLM report with mocked LLM.
- Report stores schema version and generator version.
- List snapshots by keyword.
- Compare two snapshots.
- Watchlist event generation.

### 23.3 MCP Tool Tests

- Tool accepts representative Shopee connector payload.
- Tool returns snapshot ID and URL.
- Tool handles duplicate payload.
- Tool reports field coverage warnings.
- Tool rejects unsupported platform.

### 23.4 UI Tests

- Connector Lab renders connection status, authorize/revoke actions, keyword input, raw summary, normalized preview, field coverage, unknown field list, and payload shape hash.
- Snapshot detail renders summary metrics and item table.
- Keyword Discovery renders cluster map, representative listings, price tiers, ambiguity state, and handoff actions.
- Report page renders recommendations and evidence.
- Empty states render.
- Partial field coverage state renders.
- Mobile layout remains usable.
- Playwright captures desktop and mobile evidence for Settings, Connector Lab, Keyword Discovery, Snapshot Detail, Marketplace Product enrichment, Competitive Report, Keyword Product Discovery Report, Multi-day Monitor, Shareable Image Preview, Watchlist, Diagnostics, and unavailable/error states.

### 23.5 Regression Fixtures

Store sanitized fixtures for:

- CGM Shopee search result
- result with monthly sold fields
- result without monthly sold fields
- result with ad badge
- result with missing brand
- result with malformed price
- result with prompt injection in title
- broad keyword fixture with mixed product types
- broad keyword fixture with clear brand/model/type/use-case clusters
- broad keyword fixture with low field coverage and ambiguity warnings

---

## 24. Security Review Checklist

- Auth required for every ingestion and read.
- Browser authorization grant required for connector ingestion.
- Connector grants are hashed, scoped, expiring, and revocable.
- Tenant isolation verified.
- Rate limits and payload quotas verified.
- Raw payload access restricted.
- Payload size bounded.
- JSON schema validation applied.
- Prompt injection handling tested.
- No marketplace cookies/tokens stored.
- No server-side scraping introduced.
- No remote image fetch during import unless safe proxy is used.
- Audit logs contain IDs and summaries, not raw dumps.
- Retention/deletion path defined.

---

## 25. Rollout Plan

### Stage 1 - Internal Developer Mode

- Build and use Browser Connector Lab first.
- Use representative Shopee connector payload fixture and, where available, a live authorized connector test.
- Validate which fields can be fetched from the browser-visible flow.
- Save field samples and update capability mapping before production dashboard/report work.
- Validate DB rows, grant status, field coverage, and UI.

### Stage 2 - Staff Beta

- Enable for staff/admin tenants.
- Capture real keyword snapshots.
- Compare against extension candidate batch flow.
- Collect field coverage and schema drift data.

### Stage 3 - Limited Customer Beta

- Enable for selected tenants.
- Require feature flag.
- Add clear copy: "Requires a user-connected Shopee connector in a supported connector host where available."
- Add fallback instructions for extension capture.

### Stage 4 - Production

- Publish stable SmartSpecPro connector/tool flow if connector host review requirements are met.
- Enable dashboards and watchlists.
- Monitor ingestion health and source field coverage.

---

## 26. Feature Flags And Configuration

Suggested flags:

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

Suggested config:

- max items per import
- max payload bytes
- raw import retention days
- report LLM model/provider
- allowed source providers
- raw payload owning user visibility
- connector grant TTL
- connector lab staff/admin-only mode
- max active connector grants per user/source
- max imports per user per hour
- max report generations per snapshot per hour
- max report exports per user per hour
- allowed report export types
- report export retention days
- shareable image max render bytes
- max keyword discovery clusters per snapshot
- max keyword discovery refreshes per user per hour
- default report image provider/model, initially `gpt-image-2`
- allowed report image providers/models
- per-tenant/provider override policy
- report image skill version allowlist
- max image prompt bytes
- raw redaction batch size and schedule

---

## 27. Product Decisions And Deferred Questions

### 27.1 Decisions

1. Auth model: use browser-based SmartSpecPro authorization from the user's Settings / Integrations / Connections page. The connector opens a SmartSpecPro authorization page, the user signs in, selects tenant/workspace, reviews scopes, and confirms access before ingestion is allowed.
2. Raw payload visibility: owning user only by default in v1. Group-shared views can see normalized snapshots, reports, metrics, and evidence references only when shared, but not raw connector payloads or connector-only field diagnostics.
3. Raw payload retention: retain raw connector payload for 180 days by default, then redact to audit summary. Tenants may shorten this retention or disable raw-payload viewing entirely.
4. Capability registry: implement `marketplace_connector_capabilities` in Phase 1 as a required table and service dependency.
5. Development priority: build Settings connection management and Browser Connector Lab first so the team can test connector authorization and inspect actual Shopee fields in browser before finalizing downstream analytics/report assumptions.
6. V1 deployment target: implement the MCP connector server path inside `apps/web` unless implementation discovers a hard isolation/scaling reason to split it later.
7. UI structure: keep connector snapshots under the Marketplace Intelligence tab while adding explicit links from Marketplace Capture candidate/product pages.
8. Report exports: V1 contract supports JSON, CSV, image PNG/JPEG metadata, and PDF as export types; actual rollout can enable image/JSON first behind flags.
9. LLM/credit usage: deterministic reports are default and should not consume LLM credits; LLM narrative and image generation are optional, flagged, rate-limited, and auditable.
10. Report image generation: use report-specific prompt skills that receive validated report data packages and return image prompt packages; image provider defaults to `gpt-image-2` but remains configurable.

### 27.2 Deferred Questions

1. Whether to split the MCP connector server into a separate deployment after production traffic and security review.
2. Whether to fully merge candidate batches and search snapshots into a single UI after users validate the Intelligence tab.
3. Which export types to enable for each plan/tier after cost and storage limits are measured.

---

## 28. MVP Recommendation

The smallest production-grade MVP:

1. Build browser-first Connector Lab:
   - Settings / Integrations connector configuration panel
   - `/marketplace-capture/intelligence/connect/shopee` compatibility deep-link
   - `/marketplace-capture/intelligence/connector-lab`
   - authorization/revoke/status UI
   - keyword test search
   - raw summary, normalized preview, field coverage, unknown fields, payload shape hash
2. Add DB tables:
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
3. Add browser authorization grant flow for connector ingestion.
4. Add field sample save/promote flow.
5. Add ingestion service, capability mapping, and deterministic metrics based on observed fields.
6. Add tRPC create/list/get/generate procedures.
7. Add Marketplace Capture product-link and connector metric enrichment flow.
8. Add SmartSpecPro MCP tool `save_marketplace_search_snapshot`.
9. Add Keyword Product Discovery workspace for broad keyword/category analysis before product selection.
10. Add snapshot detail page and report page.
11. Add deterministic competitive landscape, keyword product discovery, and multi-day monitor reports.
12. Add shareable image summary preview/export metadata.
13. Add report-specific image prompt skills for keyword competitive summary, keyword product discovery, and multi-day SKU monitor.
14. Add optional LLM narrative generation after deterministic metrics are stable.

Deferred / Not In MVP:

- watchlists
- automatic alerts
- background refresh
- product-level snapshot tool beyond search-result-derived enrichment
- background/bulk automated image generation beyond user-triggered report image prompt/export flows
- multi-marketplace support beyond source enum readiness

This MVP captures the core strategic advantage: when a user has access to richer Shopee connector results, SmartSpecPro can preserve them, normalize them, relate them to Marketplace Capture, analyze them, and compare them later.

---

## 29. Spec Completeness Review And Required Additions

This section records a production-readiness review of this spec. It is intentionally part of the spec so implementation planning can turn these gaps into explicit work items instead of relying on conversational context.

### 29.1 Naming And Vendor-Neutrality

Status: needs enforcement during implementation.

The product, schema, routes, and user-facing copy must use vendor-neutral terms:

- use `MCP connector`, `marketplace connector`, `connector host`, or `Shopee connector`
- avoid naming a specific AI assistant host in DB columns, route names, titles, or UI copy
- store host-specific metadata only in generic fields such as `sourceAppName`, `sourceToolName`, `sourceSessionRef`, and `rawPayloadJson`
- keep provider-specific documentation links out of durable product specs unless the spec is explicitly for that provider

Rationale:

- SmartSpecPro should support future hosts and marketplace connectors.
- Naming should not imply a dependency that the backend cannot control.
- Vendor-neutral schema reduces future migrations.

### 29.2 Connector Capability Registry

Status: required in Phase 1.

Add a small capability registry so SmartSpecPro understands what each source can provide without hardcoding assumptions into report logic.

Recommended table: `marketplace_connector_capabilities`

Fields:

- `id`
- `sourceProvider`
- `platform`
- `capabilityVersion`
- `supportedFieldsJson`
- `requiredFieldsJson`
- `fieldMappingJson`
- `normalizerVersion`
- `status`
- `createdAt`
- `updatedAt`

Benefits:

- Detect when upstream starts returning new fields.
- Explain field coverage differences by source.
- Allow source-specific normalization while keeping report logic generic.
- Support future connectors without rewriting the analytics layer.

### 29.3 Consent And User Control

Status: must be explicit in implementation plan.

Every connector ingestion should be user-initiated or user-approved. The tool response and UI should state:

- what keyword/product was saved
- which source provider supplied the data
- how many items were stored
- whether raw payload was retained
- how to delete or redact the import

Do not silently save arbitrary app output without a user action that clearly asks to save, import, update, or analyze in SmartSpecPro.

### 29.4 Data Quality Score

Status: included in data model and Phase 1 acceptance; formula details should be finalized during implementation planning.

Each snapshot should compute a `qualityScore` using:

- item count
- title coverage
- price coverage
- sold count coverage
- monthly sold coverage
- shop/brand coverage
- rating/review coverage
- ad/organic signal coverage
- freshness
- normalization warning rate

Quality score should drive:

- UI warnings
- report confidence
- whether alerts are generated
- whether comparisons are considered reliable

### 29.5 Raw Replay And Reprocessing

Status: included as a Phase 1 service interface; implementation planning should decide which reprocessing operations are admin-only in v1.

Because the core strategy is raw-preserving ingestion, the system must support reprocessing old imports when:

- normalizer logic improves
- a field is promoted from raw JSON to a normalized column
- a bug in parsing is fixed
- a report schema changes

Required concepts:

- `normalizerVersion`
- `reportGeneratorVersion`
- stale report marking
- reprocess job for selected import/snapshot
- audit event for reprocessing

### 29.6 Schema Drift Handling

Status: should be an operational runbook and test fixture.

When upstream payload shape changes:

1. Accept and store raw payload if size and safety validation pass.
2. Mark unknown fields in field coverage diagnostics.
3. Do not fail the whole import because optional fields moved.
4. Alert internal operators if normalization warning rate spikes.
5. Add a fixture for the new payload shape.
6. Promote useful fields through a migration only after repeated value is proven.

### 29.7 Report Accuracy And Legal Copy

Status: should be added to UX and report acceptance criteria.

Reports must avoid unsupported certainty:

- use "captured result set" instead of "entire market"
- use "sales signal" or "public sold count signal" instead of "actual sales"
- state when values are approximate, rounded, inferred, or missing
- show source timestamp and snapshot size
- warn that marketplace personalization can affect result order

### 29.8 Product-To-Action Handoff

Status: present but should be more explicit in implementation planning.

Reports should produce structured next actions:

- save selected item as marketplace product
- update tracked product metrics
- generate product brief
- generate comparison content brief
- launch auto review/storyboard workflow
- create price alert
- add seller/brand to watchlist

Each action must reference evidence item IDs, not only report text.

### 29.9 Launch Gates

Status: required before production rollout.

Minimum launch gates:

- Browser Connector Lab proves authorization, keyword test, field coverage, sample save, and snapshot creation in browser.
- Capability registry is updated from at least one sanitized field sample.
- migration applied and rollback tested
- ingestion auth and tenant isolation tests passing
- payload size and malformed JSON tests passing
- prompt injection fixture passing
- duplicate import idempotency passing
- deterministic metrics validated on fixtures
- report claims have evidence references
- raw payload visibility restricted
- UI exposes source, timestamp, field coverage, and delete/redact controls
- operational dashboard exists for import failures and schema drift

### 29.10 UI/UX Completeness Gates

Status: required before section-level implementation is considered complete.

The UI/UX plan is complete only when each visible surface has all of the following:

- clear owner: Settings, Connector Lab, Snapshot, Product Detail, Report, Watchlist, or Diagnostics
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

Required browser evidence set:

1. Settings connector card: disconnected, active, expired/revoked, provider unavailable.
2. Connector Lab: fixture replay, write-back unavailable, field coverage, unknown fields, snapshot created.
3. Field Dictionary: new field, stable field, raw-only field, promote/defer state.
4. Snapshot Detail: full quality, partial quality, raw hidden, product-link needs review.
5. Marketplace Product Detail: enrichment available, low-confidence review, update confirmation, private evidence hidden to another user.
6. Competitive Report: ready, partial data, no comparable data, stale report.
7. Watchlist: empty, event detected, paused/stale.
8. Diagnostics: schema drift warning, retention/redaction status, rollback/write-back-disabled state.

UI risks to keep visible during implementation:

- A "connected" badge is not enough; the UI must prove whether SmartSpecPro can receive write-back data and which fields arrived in saved payloads.
- A report is not credible unless it links every claim to stored snapshot/report evidence.
- Product enrichment is dangerous unless before/after values and confidence are visible before applying updates.
- Shared Marketplace Capture visibility must not accidentally reveal another user's raw payload or connector-only diagnostics.
- Mobile layouts must prioritize summary, status, and primary actions before dense diagnostics.

### 29.11 Overall Completeness Verdict

After this review, the spec is complete enough to continue implementation planning and section execution. The scope now covers Settings configuration, user-scoped authorization, connector field discovery, raw-preserving ingestion, Marketplace Capture product linking/enrichment, deterministic reports, watchlists, diagnostics, security/retention, and UI/UX evidence gates.

The remaining highest-risk areas are:

1. connector auth and user consent
2. raw payload governance
3. schema drift resilience
4. report claim accuracy
5. Marketplace Capture product-link confidence
6. user-scoped sharing boundaries for imported intelligence
7. browser-verifiable UI states for field coverage and enrichment

Implementation planning should therefore start with contracts, data model, and security gates before UI polish.

---

## 30. Success Metrics

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

Business value:

- time saved vs manual marketplace review
- number of actionable recommendations accepted
- number of pricing/visibility alerts acted on
- content generated from market intelligence

Reliability:

- import success rate
- report generation success rate
- p95 snapshot load time
- normalization error rate
- schema drift warning rate

---

## 31. Future Extensions

1. TikTok Shop connector ingestion.
2. Lazada or Amazon marketplace connector ingestion.
3. Cross-marketplace keyword intelligence.
4. Competitor portfolio tracking.
5. Pricing alert notifications.
6. AI-assisted visual summary variants beyond deterministic shareable image templates.
7. Product launch simulator: "what price/content/badge strategy is needed to compete?"
8. SKU cluster analysis and duplicate seller detection.
9. Integration with ad campaign planning.
10. Team briefing automation for weekly market changes.

---

## 32. Final Product Principle

Marketplace connectors inside a connector host provide user-authorized access to useful marketplace data, but that data is temporary unless SmartSpecPro turns it into durable intelligence.

SmartSpecPro should therefore become the system of record for marketplace learning:

- Shopee or marketplace connectors provide fresh upstream capability.
- SmartSpecPro stores, normalizes, audits, and compares.
- LLMs explain and recommend.
- Users decide what to save, refresh, share, and act on.
