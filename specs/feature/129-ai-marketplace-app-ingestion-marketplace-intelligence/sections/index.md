<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-connector-lab-ui
section-02-auth-grants-browser-flow
section-03-fixture-replay-contracts
section-04-database-ingestion-model
section-05-internal-api-services
section-06-mcp-tools
section-07-security-observability-retention
section-08-reports-watchlists-handoff
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-connector-lab-ui | - | 02, 03, 05 | Yes |
| section-02-auth-grants-browser-flow | 01 | 05, 06, 07 | No |
| section-03-fixture-replay-contracts | 01 | 04, 05 | Yes |
| section-04-database-ingestion-model | 03 | 05, 07, 08 | No |
| section-05-internal-api-services | 02, 03, 04 | 06, 08 | No |
| section-06-mcp-tools | 02, 05 | 07 | Yes |
| section-07-security-observability-retention | 02, 04, 05, 06 | release | No |
| section-08-reports-watchlists-handoff | 05, 07 | release | Yes |

## Execution Order

1. section-01-connector-lab-ui
2. section-02-auth-grants-browser-flow with Settings > Integrations as the canonical connection UI
3. section-03-fixture-replay-contracts with recorded MCP probe and useful-field discovery
4. section-04-database-ingestion-model with user-owned grants/snapshots and Marketplace Capture product-link/enrichment tables
5. section-05-internal-api-services with Marketplace Capture matching and metric enrichment
6. section-06-mcp-tools through the same user-owned ingestion service
7. section-07-security-observability-retention
8. section-08-reports-watchlists-handoff with Keyword Discovery, Field Dictionary, Snapshot Detail, Product Enrichment, Diagnostics, and Marketplace Capture handoff UI

## Section Summaries

### section-01-connector-lab-ui
Create the browser-visible lab route first, with fixture replay as the primary demonstrable path and a compatibility connection route that deep-links to Settings.

### section-02-auth-grants-browser-flow
Implement user-scoped, expiring, revocable browser authorization grants and status APIs, managed from Settings > Integrations / Connections.

### section-03-fixture-replay-contracts
Create sanitized fixture format, recorded MCP probe evidence, useful-field dictionary, shape hashing, field coverage, unknown field detection, and replay tests.

### section-04-database-ingestion-model
Add additive Drizzle tables, migration, shared schemas, retention metadata, idempotency constraints, user ownership, and Marketplace Capture product-link/enrichment tables.

### section-05-internal-api-services
Implement ingestion, normalization, metrics, field dictionary, Marketplace Capture product/candidate linking, UI state codes, field samples, snapshots, and internal tRPC procedures.

### section-06-mcp-tools
Expose save/report/read tools through the same validated service path.

### section-07-security-observability-retention
Add production gates for feature flags, audit, rate limits, raw retention, redaction, and rollback.

### section-08-reports-watchlists-handoff
Build Keyword Discovery, Field Dictionary, Snapshot Detail, reports, user-scoped watchlists, diagnostics, alerts, and handoff/enrichment to existing Marketplace Capture product/content workflows.
