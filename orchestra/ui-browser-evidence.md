# UI Browser Evidence

## Target
- Route/surface: Storyboard Review HyperFrames final composite prompt/payload preview; Marketplace HyperFrames route flow
- Files: `apps/web/client/src/pages/StoryboardReviewPage.tsx`, `apps/web/client/src/components/marketplaceCapture/HyperframesStoryboardReviewPanel.tsx`, `apps/web/tests/e2e/marketplace-hyperframes-ui.spec.ts`
- Build/dev server: Playwright webServer `PORT=3017 npm run dev:no-watch`
- Date: 2026-06-13

## Viewports
| Viewport | Size | Result | Evidence |
|---|---:|---|---|
| mobile | 390x844 | pass | `PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes`; `apps/web/test-results/marketplace-hyperframes/route-storyboard-review-390x844.png` |
| tablet | 768x1024 | pass | Covered by `browser fixture UI covers responsive Auto, Standard, Storyboard, and MediaStudio states` in `apps/web/test-results/production-director/playwright-evidence.json` |
| desktop | 1440x900 | pass | Covered by `browser fixture UI covers responsive Auto, Standard, Storyboard, and MediaStudio states` in `apps/web/test-results/production-director/playwright-evidence.json` |
| small-mobile | 360x800 | pass | Covered by Marketplace HyperFrames e2e responsive fixture |
| laptop | 1024x768 | pass | Covered by Marketplace HyperFrames e2e responsive fixture |
| wide-desktop | 1280x800 | pass | Covered by Marketplace HyperFrames e2e responsive fixture |

## Checks
| Check | Result | Evidence |
|---|---|---|
| Console has no new errors | pass | Marketplace HyperFrames e2e completed 12/12; only existing server warnings were emitted by auth/Sentry/dev tooling |
| Primary keyboard path works | pass | Marketplace HyperFrames e2e focus/audit fixture passed |
| Text does not overflow or overlap | pass | Route audit/screenshots in Marketplace HyperFrames e2e passed |
| Loading/empty/error states render | pass | Ready, blocked, disabled, repair, and render-to-library states passed in e2e |
| Disabled/focus/hover states are visible | pass | Advanced Auto, Storyboard Review repair, and render-to-library tests passed |
| Dark/light mode remains readable | pass | Responsive fixture covers light/dark schemes |
| Accessible names/labels are present | pass | E2e uses role/label selectors for Storyboard Review, prompt controls, render status, and Library actions |

## Commands
- Typecheck/lint: `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run check`
- Playwright/screenshot: `PLAYWRIGHT_E2E_PORT=3017 npm --prefix apps/web run e2e:marketplace-hyperframes`
- Manual notes: The Storyboard Review route now exposes editable HyperFrames render prompt/style brief and payload preview before final composite render.

## Residual Risk
- Skipped checks and why: none for this workflow gate.
- Known limitations: the payload preview shows the client-side render contract before asset staging; final managed storage refs are resolved during the render submit path.
