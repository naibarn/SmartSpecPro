# Self Review Round 2: UI/UX And Marketplace Capture Completeness

## Review Focus

Reviewed the spec and section plans for production completeness after the stakeholder clarified that connector configuration must live in each user's Settings connection area, Marketplace Capture must be updated/enriched from connector data, and all connector permissions are user-scoped in v1.

## Findings Fixed

1. UI/UX coverage was too broad for implementation.
   - Added a complete UI/UX surface matrix to the main spec.
   - Required Settings, compatibility route, Connector Lab, Field Dictionary, Snapshot List/Detail, Marketplace Capture Candidate Batch, Marketplace Product Detail enrichment, Competitive Report, Watchlist, and Diagnostics surfaces.
   - Added required states for source mode, quality, privacy, partial data, stale data, raw hidden, provider unavailable, and schema drift.

2. Marketplace Capture enrichment data model was underspecified.
   - Added `marketplace_search_snapshot_product_links`.
   - Added `marketplace_product_metric_connector_snapshots`.
   - Clarified confidence, review state, rejected-link preservation, append-only metric enrichment, and provenance rules.

3. Settings connection UI needed stronger user-scoped proof.
   - Expanded Section 02 to require current-user-only status, scopes, expiry, grant hash prefix, last test run, capability version, defaults, and last Marketplace Capture enrichment update.
   - Added state distinctions for active without probe, active with recent probe, provider unavailable, and fixture replay only.

4. Field discovery needed to become a UI-ready product surface.
   - Expanded Section 03 and Section 05 to require grouped field dictionary output with field state, sample value, coverage, type, storage recommendation, normalized/raw-only status, and promote/defer state.

5. Reports/watchlists/handoff section did not include all downstream UI.
   - Expanded Section 08 to include Snapshot Detail, Field Dictionary, Product Enrichment, Competitive Report, Watchlist, and Diagnostics UI.
   - Added browser evidence requirements across desktop, mobile, and unavailable/error states.

## Verification

- Main spec now includes complete UI surface matrix and UI quality gates.
- Section index now reflects Field Dictionary, Snapshot Detail, Product Enrichment, Diagnostics, and Marketplace Capture handoff UI.
- `git diff --check` should be run after this review to verify markdown whitespace.

## Residual Risk

No blocking spec gap remains for planning. Implementation must still verify actual live connector capability in the browser because current live behavior depends on upstream user authorization and connector host support.
