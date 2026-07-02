# Self Review Round 6: Navigation And Marketplace Capture UX Integration

## Review Focus

Reviewed the spec for production-grade navigation and UI linkage after the stakeholder asked which screens should connect to the main dashboard, Marketplace Capture, reports, and related product/candidate workflows.

## Codebase Findings

- The main dashboard already exposes `Marketplace Capture` through the shared menu item `marketplace-capture` at `/marketplace-capture`.
- Existing Marketplace Capture routes already live under `/marketplace-capture/*`.
- Existing admin operations use `admin-marketplace-capture` at `/admin/marketplace-capture`.

## Findings Fixed

1. Marketplace Intelligence needed a clear information architecture.
   - Added Navigation and Information Architecture section to the main spec.
   - Decided not to add a separate main sidebar item in v1.
   - Kept Marketplace Intelligence under existing Marketplace Capture to avoid navigation sprawl and preserve product context.

2. Local navigation was underspecified.
   - Added Marketplace Capture local subnav requirements for Products, Captures/Candidates, Intelligence, Connector Lab, Reports, Watchlists, Fields, and Diagnostics.
   - Diagnostics is staff/admin only.

3. Contextual routes and entry points needed explicit ownership.
   - Added route ownership table for overview, snapshots, fields, reports, watchlists, diagnostics, connector lab, and compatibility connect route.
   - Added contextual link rules for Product Detail, Candidate Batch, Snapshot Detail, Report Detail, Connector Lab, and Settings.

4. Dashboard relationship needed a UX decision.
   - Added optional Dashboard/Marketplace Capture landing card only when intelligence is enabled.
   - Confirmed v1 should not add a new primary dashboard/sidebar item for Marketplace Intelligence.

5. Section plans needed navigation tests.
   - Updated Section 01 and Section 08 to require local subnav, mobile overflow, Settings links, product/candidate/report cross-links, and Playwright navigation evidence.
   - Updated `claude-plan.md` with likely files, route tasks, nav locale files, and cross-link tests.

## Residual Risk

Implementation must match the repo's existing dashboard layout and Marketplace Capture visual conventions. Before coding the local navigation component, run the Astryx discovery command and inspect existing Marketplace Capture page patterns so the new Intelligence area feels like part of the same product surface.
