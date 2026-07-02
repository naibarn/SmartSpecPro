# TDD Plan - Marketplace MCP Connector Ingestion And Marketplace Intelligence

## Test Strategy

Use Vitest for shared contracts, services, routers, deterministic metrics, keyword discovery clustering, write-back ingestion, and report image prompt contracts. Use Playwright for browser-visible Connector Lab, Keyword Discovery, Settings connector, Snapshot Detail, Product Enrichment, Report, Watchlist, and Diagnostics workflows. Use fixture replay as the default deterministic test path. Live Shopee evidence in v1 means an OpenAI-hosted Shopee app payload was written back into SmartSpecPro and saved, not that the SmartSpecPro backend called Shopee directly.

## Section 01 - Browser Connector Lab UI First

Tests:

- Route is hidden or disabled when `MARKETPLACE_CONNECTOR_LAB_ENABLED` is false.
- Unauthorized state shows connect action and fixture replay option.
- Fixture replay renders keyword controls, normalized preview, field coverage, unknown fields, and payload shape hash.
- Intelligence overview renders separate `Explore keyword/category` and `Track known product/SKU` workflow entry points.
- Local subnav includes Discovery and routes to `/marketplace-capture/intelligence/discovery` without adding a duplicate main sidebar item.
- Live-unavailable state explains the reason and does not lose entered keyword.
- Save fixture and create snapshot buttons show loading, success, disabled, and error states.
- Mobile viewport stacks diagnostics without overlapping text or controls.
- Keyboard navigation reaches all inputs, mode controls, action buttons, tabs, and raw viewer controls.

Commands:

- `npm --prefix apps/web run check`
- `npm --prefix apps/web exec playwright test tests/e2e/marketplace-connector-lab.spec.ts --project=chromium`
- `npm --prefix apps/web exec playwright test tests/e2e/marketplace-keyword-discovery.spec.ts --project=chromium`

## Section 02 - Browser Authorization And Write-Back Grants

Tests:

- Grant status returns `not_connected`, `active`, `expired`, `revoked`, and `scope_missing` as stable values.
- Start authorization returns a browser handoff URL without exposing secrets.
- Complete authorization stores only hashed grant identifiers and allowed metadata.
- Completed authorization is labelled as SmartSpecPro write-back permission, not Shopee connectivity.
- Grant responses never include Shopee cookies, OpenAI connector tokens, connector host access tokens, or provider session IDs.
- Revoked and expired grants fail closed.
- Tenant/user mismatch cannot read or revoke another user's grant.
- UI renders status transitions without stale cached state.
- Settings and Connector Lab distinguish `write-back ready`, `waiting for OpenAI-hosted Shopee payload`, and `snapshot saved`.

Commands:

- `npm --prefix apps/web run test -- apps/web/server/routers/__tests__/marketplaceIntelligence.test.ts`

## Section 02A - OpenAI-Hosted Write-Back Handoff

Tests:

- `save_marketplace_search_snapshot` accepts a payload with `sourceProvider=openai_hosted_shopee_mcp`, `executionHost=openai_chatgpt`, upstream tool metadata, keyword, region, locale, items, and raw payload.
- The HTTPS API alias for the save tool uses the exact same schema, validator, idempotency, and ingestion service as the MCP tool.
- A missing, expired, revoked, cross-user, or scope-missing write-back grant is rejected before payload persistence.
- Duplicate idempotency key or payload hash returns the existing snapshot instead of creating a second snapshot.
- Write-back rejects oversized payloads, unsafe URLs, invalid platform/sourceProvider, and unsupported execution hosts.
- Write-back stores source provenance and field coverage, then returns snapshot/report URLs for the OpenAI host.
- Write-back does not store OpenAI connector tokens, Shopee cookies, or connector-host session secrets even if they appear in raw input.
- Connector Lab can generate a prompt/handoff package that tells the OpenAI host to call Shopee and then call SmartSpecPro's save tool/API.
- Connector Lab renders last write-back result, payload hash, snapshot link, source freshness, and validation errors.

Commands:

- `npm --prefix apps/web run test -- apps/web/server/routes/__tests__/marketplaceConnectorWriteback.test.ts`
- `npm --prefix apps/web run test -- apps/web/server/_core/__tests__/mcpRegistry.marketplaceIntelligence.test.ts`
- `npm --prefix apps/web run test -- apps/web/client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx`

## Section 03 - Fixture Replay And Connector Contract Harness

Tests:

- Sanitized fixture schema accepts valid search fixtures and rejects raw secrets or oversized fields.
- Shape hash remains stable when values change but structure does not.
- Shape hash changes when field names or value types change.
- Unknown field detector reports new paths compared with active capability mapping.
- Fixture replay and OpenAI-hosted write-back payloads use the same normalization path.
- Promoted fixture can be replayed in CI without network access.
- Regression Fixtures include CGM Shopee search result, monthly sold fields, ad badge, missing brand, malformed price, prompt injection, and broad keyword fixture variants for mixed product types, clear clusters, and low field coverage.

Commands:

- `npm --prefix apps/web run test -- apps/web/server/services/__tests__/marketplaceConnectorFixtureService.test.ts`

## Section 04 - Database And Shared Contracts

Tests:

- Shared schemas accept valid imports, grants, field samples, snapshots, items, keyword discoveries, discovery clusters, reports, report exports, and watchlist events.
- Shared schemas reject unsupported source modes, invalid locale/region, invalid hashes, unsafe URLs, and oversized raw excerpts.
- Migration adds all tables, indexes, ownership fields, retention fields, and idempotency constraints.
- Raw retention and redaction metadata are required where raw payloads are stored.
- Capability mapping version is preserved on snapshots and items.
- `marketplace_keyword_discoveries` supports saved discoveries without matched Marketplace Capture products.
- `marketplace_keyword_discovery_clusters` requires cluster type, representative snapshot item IDs, evidence JSON, confidence score, and user ownership.
- `marketplace_search_snapshot_product_links` preserves link confidence, review state, rejected links, and evidence.
- `marketplace_product_metric_connector_snapshots` remains append-only and never overwrites Marketplace Capture product truth.
- `marketplace_search_report_exports` stores export type, template key, skill key/version, source summary, data/prompt package hashes, provider/model, status, and retention metadata.

Commands:

- `npm --prefix apps/web run test -- apps/web/shared/marketplaceIntelligence.test.ts`
- `npm --prefix apps/web run check`

## Section 05 - Ingestion Services And Internal API

Tests:

- Dry run validates and normalizes fixture payload without writing snapshot rows.
- OpenAI-hosted write-back validates and normalizes live source payloads before writing snapshot rows.
- Save field sample writes sanitized data and field coverage.
- Create snapshot stores import, snapshot, and items idempotently.
- Duplicate payload hash or idempotency key returns the existing snapshot.
- Metrics service computes share of shelf, price bands, visibility winners, and quality score deterministically.
- Keyword discovery service clusters broad keywords by brand, model family, product type, use case, price tier, seller/trust mix, and representative listings.
- Keyword discovery service returns ambiguity warnings, refinement suggestions, and low-field-coverage states without inventing unsupported taxonomy.
- Broad keyword fixture coverage verifies mixed product types, clear brand/model/type/use-case clusters, and low field coverage ambiguity behavior.
- `createKeywordDiscovery`, `listKeywordDiscoveries`, `getKeywordDiscovery`, and `refreshKeywordDiscoveryFromSnapshot` enforce user ownership and idempotent reuse.
- Product linking prefers exact platform/external IDs, then URL, then bounded fuzzy matching.
- Another user cannot list or read snapshots.

Commands:

- `npm --prefix apps/web run test -- apps/web/server/services/__tests__/marketplaceIntelligenceService.test.ts`
- `npm --prefix apps/web run test -- apps/web/server/routers/__tests__/marketplaceIntelligence.test.ts`

## Section 06 - MCP Tools

Tests:

- Tool input schemas reject missing auth context, invalid source mode, unsupported platform, unsupported execution host, and oversized payloads.
- Save tool calls ingestion service and returns an idempotent snapshot result.
- Save tool accepts raw OpenAI-hosted Shopee app output plus normalized hints.
- Report tool reads stored snapshots and never requires direct Shopee connector access.
- General read tools omit owner-only raw payload fields.
- Tool metadata clearly marks write-capable operations.
- Tool metadata and descriptions clearly state that the OpenAI host should call the save tool after obtaining Shopee results; SmartSpecPro does not call the Shopee app directly.

Commands:

- Use the repo's MCP/tool registration test path identified during implementation.
- `npm --prefix apps/web run check`

## Section 07 - Security, Observability, Retention, And Rollback

Tests:

- Feature flags disable lab, OpenAI-hosted write-back imports, MCP writes, reports, and watchlists independently.
- Feature flags disable Keyword Discovery, report image skills, and shareable image exports independently from snapshot browsing, including `MARKETPLACE_KEYWORD_DISCOVERY_ENABLED`, `MARKETPLACE_REPORT_IMAGE_SKILLS_ENABLED`, and `MARKETPLACE_INTELLIGENCE_SHAREABLE_IMAGE_ENABLED`.
- Audit events are recorded for connection, write-back token/prompt creation, write-back accepted/rejected, sample, snapshot, keyword discovery create/refresh, report, image prompt/export, raw read, and redaction actions.
- Rate limits reject excessive write-back attempts, keyword discovery refreshes, report/image generations, and write actions with stable retry metadata; tests should assert rate limits by user, tenant, connector, and keyword.
- Raw payload access is owning user only.
- Retention cleanup redacts or deletes raw payloads without deleting normalized snapshot rows.
- Disabling OpenAI-hosted write-back ingestion leaves fixture replay and read-only snapshot browsing intact.

Commands:

- `npm --prefix apps/web run test -- apps/web/server/services/__tests__/marketplaceIntelligenceSecurity.test.ts`

## Section 08 - Reports, Watchlists, And Product Handoff

Tests:

- Competitive report uses stored snapshots and deterministic metrics.
- Keyword Product Discovery report uses stored discovery/snapshot evidence and deterministic clusters.
- `keyword_product_discovery_image`, `keyword_competitive_summary_image`, and `multi_day_sku_monitor_image` validate required blocks before creating image prompt packages.
- `reportImageDataPackage` removes raw payloads and includes only `metricsJson`, `visualBlocksJson`, `sourceSummaryJson`, and evidence references.
- `reportImagePromptPackage` stores skill key/version, provider/model, aspect ratio, prompt hash inputs, and warnings.
- Watchlist detects rank movement, price change, new seller, missing seller, and unknown field events.
- Report generation handles partial data quality without hallucinating missing metrics.
- Handoff links high-confidence snapshot items to marketplace products.
- Low-confidence handoff requires user confirmation.
- Discovery cluster handoff can create candidate products, content briefs, reports, or watchlists only after user confirmation.

Commands:

- `npm --prefix apps/web run test -- apps/web/server/services/__tests__/marketplaceIntelligenceReportService.test.ts`
- `npm --prefix apps/web run test -- apps/web/server/services/__tests__/marketplaceKeywordDiscoveryService.test.ts`
- `npm --prefix apps/web run test -- apps/web/server/services/__tests__/marketplaceReportImageSkillService.test.ts`
