# UI Browser Evidence

## Target

- Route/surface: `/drama-series/:seriesId` → Production Episodes panel
- Files: `apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel.tsx`
- Build/dev server: not launched in this turn
- Date: 2026-08-10

## Viewports

| Viewport     |     Size | Result  | Evidence                                                     |
| ------------ | -------: | ------- | ------------------------------------------------------------ |
| mobile       |  390x844 | skipped | Browser automation/dev server was not available in this turn |
| tablet       | 768x1024 | skipped | Browser automation/dev server was not available in this turn |
| desktop      | 1440x900 | skipped | Browser automation/dev server was not available in this turn |
| small-mobile |  360x800 | skipped | Browser automation/dev server was not available in this turn |
| laptop       | 1024x768 | skipped | Browser automation/dev server was not available in this turn |
| wide-desktop | 1280x800 | skipped | Browser automation/dev server was not available in this turn |

## Checks

| Check                                   | Result  | Evidence                                                                                      |
| --------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Console has no new errors               | skipped | No browser session                                                                            |
| Primary keyboard path works             | skipped | No browser session                                                                            |
| Text does not overflow or overlap       | skipped | Responsive controls were reviewed statically; runtime proof remains pending                   |
| Loading/empty/error states render       | skipped | Existing panel states retained; no browser session                                            |
| Disabled/focus/hover states are visible | skipped | Existing component primitives and disabled states retained; no browser session                |
| Dark/light mode remains readable        | skipped | No browser session                                                                            |
| Accessible names/labels are present     | skipped | New numeric inputs/selects/checkboxes have labels and test IDs; runtime proof remains pending |

## Commands

- Typecheck: `npm run check --workspace apps/web` (baseline-noisy; no diagnostics from this feature)
- Focused tests: `npm run test --workspace apps/web -- server/services/__tests__/verticalDramaRemotionRender.test.ts server/services/__tests__/verticalDramaProductionEpisodeAssembly.test.ts client/src/components/verticalDramaSeries/__tests__/VerticalDramaProductionEpisodesPanel.formatSubEpisodeRangeLabel.test.ts --run`

## Residual Risk

- Browser proof for the authenticated series route and responsive layout remains pending because a browser/dev-server session was not available.
- The existing BGM/credits/ad-hoc overlay controls remain in the panel for legacy FFmpeg compatibility; the new Remotion path currently applies the requested EP label, series title, and Settings watermarks.
