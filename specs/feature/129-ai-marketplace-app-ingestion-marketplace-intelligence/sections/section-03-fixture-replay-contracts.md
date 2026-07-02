# Section 03 - Fixture Replay Contracts

## Objective

Create the deterministic harness that lets the team test connector payload handling without depending on live connector availability.

## Scope

- Sanitized fixture schema.
- Payload shape hashing.
- Field coverage and unknown field detection.
- Recorded MCP probe fixture from verified current evidence.
- Useful-field dictionary with analysis value and storage intent.
- Fixture replay service.
- Fixture promotion from saved field samples.

## Implementation Notes

- Fixture replay must feed the same normalization path as live payloads.
- Shape hash should ignore values and capture field paths, arrays, and value types.
- Unknown fields should be preserved as diagnostics and not fail ingestion unless they violate size or safety limits.
- Fixtures must include redaction state, keyword, locale, region, source mode, connector capability version, and sample items.
- Source mode must distinguish `fixture`, `recorded_mcp_sample`, and future `live_mcp`.
- Field discovery must classify fields into product, price, sales, rating/review, seller/shop, brand/category, ranking/search, logistics, and diagnostics.
- Every discovered field should include type, coverage, sample, storage recommendation, and downstream analysis use.
- Field dictionary output must include UI-ready state for each field: `new`, `stable`, `changed_type`, `missing_latest`, `normalized`, `raw_only`, `promoted`, or `deferred`.
- Field dictionary output must include enough metadata for implementation to decide whether a field belongs in normalized columns, derived metrics, report-only logic, or raw diagnostics.

## Tests First

- Fixture schema accepts valid samples and rejects unsafe data.
- Shape hash is stable for value-only changes.
- Shape hash changes for structural changes.
- Unknown field detector compares payload paths against capability mappings.
- Replay output matches dry-run normalization output.
- Recorded MCP fixture exposes capability scores and useful-field coverage.
- Field dictionary output exposes grouped fields, sample value, coverage, type, storage recommendation, normalized/raw-only status, and promote/defer state.

## Acceptance Criteria

- CI can validate the Connector Lab and ingestion service from fixtures.
- New upstream fields can be discovered, saved, reviewed, and promoted into contract fixtures.
- The team can use recorded MCP evidence to decide database columns, derived metrics, and Marketplace Capture enrichment without rerunning the external connector.
- The future Field Dictionary UI can render useful-field coverage and promotion decisions directly from fixture/recorded sample output.

## Implementation Status

Partially completed for the first MCP evidence slice:

- Stored the current Shopee MCP `CGM` probe as a sanitized recorded live sample in `apps/web/shared/marketplaceMcpProbeFixture.ts`.
- Added a useful-field dictionary covering product, price, sales, rating/review, seller/shop, brand/category, ranking/search, logistics, and diagnostics fields.
- Added field coverage, type, sample, storage intent, and analysis-use metadata so each probe can show what can be reused for downstream marketing intelligence.
- Added `/api/marketplace-connectors/shopee/probe` to return the recorded MCP sample with `source=recorded_mcp_sample`, probe metadata, field coverage, and capability scores.
- Updated Connector Lab to show MCP field discovery and capability summary visibly in the browser.

Additional completed behavior:

- Source modes now use the shared contract values `recorded_mcp_sample`, `live_mcp`, `fixture`, `extension_capture`, and `manual_import`.
- The recorded sample no longer carries product-host-specific assistant branding in fixture metadata.
- Snapshot service consumes the same recorded probe contract used by Connector Lab and strips raw diagnostic payloads from stored snapshot items.

Current limitation:

- This slice preserves and analyzes a recorded connector sample. OpenAI-hosted Shopee write-back is the later live integration step; the UI labels fixture evidence clearly so users do not mistake recorded evidence for a fresh live write-back.
