# Section 01 - Connector Lab UI

## Objective

Build the first browser-testable slice of marketplace connector intelligence: Settings-linked connection status, Connector Lab page, fixture replay, field preview, and snapshot creation UI shell.

## Scope

- Add `/marketplace-capture/intelligence/connect/shopee` as a compatibility explainer/deep-link to Settings.
- Add or reserve `/marketplace-capture/intelligence` as the Intelligence overview route that owns the local subnav entry point.
- Add or reserve `/marketplace-capture/intelligence/discovery` and `/marketplace-capture/intelligence/discovery/:discoveryId` so keyword/category discovery has a first-class place before exact SKU selection.
- Add `/marketplace-capture/intelligence/connector-lab`.
- Add or plan a Settings > Integrations / Connections entry for user-scoped Shopee MCP connector configuration.
- Add Marketplace Capture local navigation/subnav so users can move between Products, Captures/Candidates, Intelligence, Discovery, Connector Lab, Reports, Watchlists, Fields, and Diagnostics without a new main sidebar item.
- Add UI components for connection status, keyword test controls, raw redacted viewer, normalized preview, field coverage, unknown fields, shape hash, fixture save, and create snapshot.
- Use fixture replay until live connector API work is ready.

## Implementation Notes

- Before UI implementation, run `npm run astryx -- build "marketplace connector lab"` and follow the closest page/block/component recommendations.
- Use the existing authenticated route pattern in `apps/web/client/src/App.tsx`.
- Reuse the existing main sidebar item `marketplace-capture`; do not add a separate Marketplace Intelligence main menu item in v1.
- Do not make Marketplace Intelligence the canonical place to manage grants. Full authorize/revoke/default configuration belongs in Settings > Integrations.
- Connector Lab entry points should be: Settings connector card test action, Intelligence overview quick action, Marketplace Capture local subnav, and compatibility connect route.
- Intelligence overview should reserve separate workflow cards for keyword/category discovery and known product/SKU monitoring so users understand these are different jobs.
- Keep the visual style operational and dense.
- Do not make this a landing page.
- Use icon buttons and familiar controls for mode switching, refresh, save, revoke, and copy where available.
- Add Thai and English locale keys.
- Include visible states for unauthorized, write-back ready, expired, revoked, upstream provider unavailable, fixture replay, waiting for OpenAI-hosted payload, write-back received, validation error, partial result, and create snapshot success.

## Tests First

- Playwright loads both routes behind the feature flag.
- Unauthorized state shows connect action and fixture replay.
- Fixture replay displays normalized rows, field coverage, unknown fields, and shape hash.
- Mobile and desktop screenshots show no overlapping text or controls.
- Keyboard navigation and focus states work across controls and tables.

## UI/UX Contract

### Target User / JTBD
Developer, staff operator, growth analyst, and product owner need to connect, run a test search, inspect returned fields, save fixtures, and create a snapshot.

### Surface Inventory
Main sidebar `Marketplace Capture`, Marketplace Capture local subnav, Settings > Integrations / Connections, `/marketplace-capture/intelligence` overview, `/marketplace-capture/intelligence/discovery`, `/marketplace-capture/intelligence/discovery/:discoveryId`, `/marketplace-capture/intelligence/connect/shopee` compatibility route, and `/marketplace-capture/intelligence/connector-lab`.

### Component Map
Local subnav, connection status panel, keyword controls, mode segmented control, raw redacted viewer, normalized preview table, field coverage matrix, unknown field panel, shape hash display, fixture save action, snapshot action, Settings deep-link, Field Dictionary deep-link after sample save.

### State Matrix
Loading, unauthorized, write-back ready, expired, revoked, upstream provider unavailable, fixture replay ready, waiting for OpenAI-hosted payload, write-back received, partial result, validation error, save success, snapshot success, disabled by feature flag, local subnav active state, mobile subnav overflow.

### Responsive Matrix
Mobile stacks controls, preview, and diagnostics and collapses local subnav into an overflow/select pattern. Tablet uses two columns when space allows. Desktop shows local subnav plus controls, preview, and diagnostics side-by-side.

### Accessibility Acceptance
All controls are keyboard reachable, inputs have labels, table headers are semantic, status is not color-only, focus is visible, and loading states do not trap focus.

### Copy Contract
Thai and English keys cover connect, revoke, run test, replay fixture, save fixture, create snapshot, empty, loading, error, and success states.

### Browser Evidence Required
Playwright screenshots for Intelligence overview entry, local subnav active state, unauthorized, fixture replay success, field coverage, unknown fields, mobile layout, and snapshot success.

## Acceptance Criteria

- A user can open the UI in a browser and understand what connector data can be inspected.
- A user can find connector setup from their own Settings / Integrations area, and Marketplace Intelligence links there rather than owning duplicate configuration.
- A user can find Connector Lab from Marketplace Capture local navigation without a separate main sidebar menu item.
- A developer can test the route without OpenAI-hosted write-back access.
- The UI is ready to reveal real returned fields as soon as backend/live connector wiring exists.

## Implementation Notes - Completed Slice

Implemented files:

- `apps/web/client/src/pages/MarketplaceConnectorLab.tsx`
- `apps/web/client/src/pages/MarketplaceConnectorConnect.tsx`
- `apps/web/client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx`
- `apps/web/client/src/App.tsx`
- `apps/web/client/src/locales/en/common.json`
- `apps/web/client/src/locales/th/common.json`

Implemented behavior:

- Added authenticated routes for `/marketplace-capture/intelligence/connect/shopee` and `/marketplace-capture/intelligence/connector-lab`.
- Added a browser-visible connector connect page with simulated authorize, expired, revoke, status, scope, retention, and lab navigation states.
- Added Connector Lab UI with fixture replay as the default mode, live connector disabled/fallback state, keyword/region/locale/limit controls, normalized preview table, diagnostics tab, raw redacted payload tab, save fixture action, and create snapshot action.
- Added client-side fixture helper coverage for payload shape hash, field coverage, and unknown field detection.
- Added baseline Thai/English locale keys for marketplace intelligence labels.

Deviations:

- The first slice intentionally uses client-side fixture replay and simulated grant states only. Real grant persistence, tRPC procedures, OpenAI-hosted write-back ingestion, and database-backed snapshot creation are deferred to Sections 02, 02A, 04, and 05.
- Browser evidence is covered by jsdom component tests in this slice. Full Playwright browser evidence should be added when auth test fixtures or a route-level authenticated harness is available.

Additional completed behavior:

- Added `/marketplace-capture/intelligence`, `/marketplace-capture/intelligence/discovery`, `/marketplace-capture/intelligence/snapshots`, `/marketplace-capture/intelligence/reports`, `/marketplace-capture/intelligence/watchlists`, `/marketplace-capture/intelligence/fields`, and `/marketplace-capture/intelligence/diagnostics` routes through one operational Intelligence workspace.
- Added overview KPIs, keyword snapshot action, report payload action, watchlist action, snapshot preview table, field dictionary list, report list, watchlist list, and diagnostics JSON view.
- Added `/marketplace-capture/intelligence/connect/authorize` as the browser authorization handoff route.

Updated deviations:

- Connector Lab now talks to the browser auth/write-back routes and the broader Intelligence page talks to the new `marketplaceIntelligence` tRPC router, but live Shopee data must arrive through OpenAI-hosted write-back. Recorded-sample/fixture replay remains a developer/testing mode only.
- Full Playwright screenshots remain a follow-up. Current verification uses component tests plus `tsc --noEmit`.

Verification:

- `npm --prefix apps/web run test -- client/src/pages/__tests__/MarketplaceConnectorLab.test.tsx` - 6 tests passed.
- `npm --prefix apps/web run check` - passed.
