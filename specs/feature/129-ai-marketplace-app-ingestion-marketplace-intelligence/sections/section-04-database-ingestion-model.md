# Section 04 - Database Ingestion Model

## Objective

Add the additive persistence model for user-owned connector imports, grants, field samples, snapshots, keyword discoveries, Marketplace Capture product links/enrichment, reports, and watchlists.

## Scope

- Drizzle schema updates.
- SQL migration.
- Shared Zod schemas and tests.
- Retention and idempotency fields.
- Marketplace Capture product-link and metric-enrichment tables.
- Explicit `marketplace_search_snapshot_product_links` table for match confidence and review state.
- Explicit `marketplace_product_metric_connector_snapshots` table for append-only product metric enrichment.
- Explicit `marketplace_keyword_discoveries` table for broad keyword/category analysis before exact SKUs are known.
- Explicit `marketplace_keyword_discovery_clusters` table for queryable brand/model/type/use-case/price-tier clusters.
- Explicit `marketplace_search_report_exports` table for shareable image/CSV/JSON/PDF export metadata.
- External model/variant identifier fields and indexes for exact seller/SKU monitor reports.

## Implementation Notes

- Keep all tables additive.
- Add both tenant and user ownership to all connector grant/import/raw/sample/snapshot/report/watchlist rows. In v1 these rows are user-owned, not tenant-shared.
- Add idempotency keys and payload hashes for imports and snapshots.
- Include raw retention and redaction metadata where raw payloads are stored.
- Preserve capability mapping version on snapshots and items.
- Add indexes for tenant/user/date, keyword, platform, seller/brand, rank, payload hash, and idempotency.
- Link to existing marketplace products where confidence is high.
- Add snapshot-product link rows with link confidence, link basis, review state, and timestamps.
- Add append-only connector metric snapshots for matched `marketplace_products` so existing Marketplace Capture product metrics can be updated without overwriting confirmed product truth.
- Store source provenance for every enrichment: source mode, connector capability version, probe run/import ID, snapshot ID, snapshot item ID, capturedAt, and field coverage summary.
- Preserve rejected/ignored product links so repeated imports do not repeatedly propose the same bad match.
- Connector metric enrichment rows must be append-only and queryable by product, user, tenant, platform, and capturedAt.
- Keyword discovery rows must be user-owned and reusable across reports, watchlists, content briefs, and future product/candidate handoff.
- Keyword discovery clusters must store representative snapshot item IDs, evidence, metrics, confidence score, and rank so UI can explain inferred brand/model/type/use-case labels.
- Snapshot items must include `externalModelId` when available and index `(platform, externalShopId, externalProductId, externalModelId)` for exact monitor matching.
- Search reports must support single-snapshot and multi-snapshot reports using latest snapshot, baseline snapshot, and optional intermediate snapshot IDs.
- Report exports must persist template key, aspect ratio, status, payload hash, storage keys, source summary, and expiry so generated visual summaries are reproducible.

## Tests First

- Shared schemas validate all new entities.
- Migration includes tables, indexes, constraints, ownership fields, and retention fields.
- Duplicate idempotency keys cannot create duplicate snapshots.
- Raw retention fields are required for raw payload rows.
- Cross-user reads/writes fail even within the same tenant.
- Marketplace Capture product-link tables preserve confidence and do not mutate product identity fields.
- Append-only connector metric enrichment rows preserve provenance and do not overwrite Marketplace Capture product truth.
- Rejected product links remain queryable for future suppression.
- Keyword discovery schema tests verify broad keyword discoveries can be saved without any matched Marketplace Capture product.
- Keyword discovery cluster schema tests verify cluster type, representative item evidence, confidence, and user ownership.
- Multi-day monitor schema tests verify exact model/variant matching keys.
- Report export schema tests verify source/disclaimer metadata and user-scoped ownership.

## UI/UX Contract

### Target User / JTBD
N/A - this section changes persistence contracts only; UI behavior is covered by Sections 01, 02, 05, 07, and 08.

### Surface Inventory
N/A - no direct browser surface is created in this section.

### Component Map
N/A - no components are created in this section.

### State Matrix
N/A - schema states are exposed through API/UI sections.

### Responsive Matrix
N/A - no layout work.

### Accessibility Acceptance
N/A - no direct UI. Downstream UI must not expose raw payloads without access checks.

### Copy Contract
N/A - no user-facing copy.

### Browser Evidence Required
N/A - validate through schema, migration, and service tests.

## Acceptance Criteria

- Schema supports field discovery and durable snapshots without breaking existing marketplace capture behavior.
- Normalized rows remain queryable after raw payloads expire or are redacted.
- Connector snapshots can enrich existing Marketplace Capture products and candidates through append-only metric/evidence records.
- Database contracts can support keyword/category discovery where no exact product exists yet, including later handoff to reports, watchlists, content briefs, and Marketplace Capture products.
- Database contracts can support the Product Detail enrichment panel, product-link review UI, and report evidence links without ad hoc JSON-only joins.
- Database contracts can support multi-day monitor reports and shareable image export history without overloading a single-snapshot report row.

## Implementation Status

Completed for the first production-shaped slice:

- Added shared contracts for connector grant status, probe source modes, snapshot status, snapshot items, snapshot metrics, report types, report aspect ratios, keyword discoveries, reports, watchlists, and handoff payloads in `apps/web/shared/marketplaceIntelligence.ts`.
- Added `marketplaceIntelligenceService` with user/tenant-scoped in-memory persistence for snapshots, keyword discovery, reports, watchlists, diagnostics, and Marketplace Capture handoff payloads.
- Added Drizzle schema tables and SQL migration `apps/web/drizzle/0209_marketplace_intelligence_persistence.sql` for connector grants/events, field samples, search snapshots/items, product links, product metric connector snapshots, keyword discoveries/clusters, reports/exports, watchlists/events.
- Added idempotency indexes, tenant/user ownership columns, external seller/product/model indexes, retention/redaction metadata, report export metadata, and watchlist due indexes.
- Updated `marketplaceIntelligenceService` and `marketplaceConnectorGrantService` to persist to the new tables when `DATABASE_URL` is configured, with in-memory fallback for unit tests/local no-DB runs.
- Stored normalized snapshot items without raw diagnostic payloads while retaining source mode, capturedAt, capability version, field coverage, unknown-field count, and metrics.
- Implemented deterministic id generation from tenant/user/source/evidence so DB idempotency can later reuse the same inputs.

Current limitation:

- The migration was not applied in this Codex environment because `DATABASE_URL` is not set. Run `npm --prefix apps/web run db:migrate` against the target database to apply it.
