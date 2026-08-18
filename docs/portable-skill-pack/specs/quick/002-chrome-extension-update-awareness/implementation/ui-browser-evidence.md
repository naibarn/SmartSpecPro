# UI Browser Evidence

## Target

- Route/surface: SmartAIHub Marketplace Capture side-panel header update banner
- Files: `apps/extension/src/panel/App.tsx`, `apps/extension/src/panel/style.css`
- Build/dev server: Vite production extension build
- Date: 2026-08-18

## Viewports

| Viewport | Size | Result | Evidence |
|---|---:|---|---|
| mobile | 390x844 | skipped | No Chrome/Chromium executable or attached extension browser session available |
| tablet | 768x1024 | skipped | Same blocker |
| desktop | 1440x900 | skipped | Same blocker |

## Checks

| Check | Result | Evidence |
|---|---|---|
| Console has no new errors | skipped | Requires loaded extension browser |
| Primary keyboard path works | skipped | Requires loaded extension browser |
| Text does not overflow or overlap | inspected | Responsive single-column breakpoint and wrapping rules present |
| Loading/empty/error states render | inspected | Update check is intentionally silent; banner only renders for a valid newer version |
| Disabled/focus/hover states are visible | inspected | Existing `.button:focus-visible` applies to both actions |
| Accessible names/labels are present | inspected | Labelled section, polite status copy, text-labelled buttons |

## Commands

- Typecheck/build: `cd apps/extension && npm run package:web-dashboard`
- Automated state tests: `cd apps/extension && npm run test:update`
- Playwright/screenshot: skipped; extension side-panel browser unavailable

## Residual Risk

- Manual Chrome side-panel verification is still required after loading `0.1.137` or after deployment.
