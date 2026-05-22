# UI Browser Verification

Use this gate for browser-visible UI, responsive, accessibility, visual polish, route-level
workflow, and in-product help changes.

## Evidence Artifact

Record evidence in one of these places:

- `orchestra/ui-browser-evidence.md` for orchestra waves
- `<planning_dir>/implementation/ui-browser-evidence.md` for deep-implement flows
- the section file itself when a smaller plan has no implementation directory

## Required Evidence Format

```markdown
# UI Browser Evidence

## Target
- Route/surface:
- Files:
- Build/dev server:
- Date:

## Viewports
| Viewport | Size | Result | Evidence |
|---|---:|---|---|
| mobile | 390x844 | pass/fail/skipped | screenshot path or notes |
| tablet | 768x1024 | pass/fail/skipped | screenshot path or notes |
| desktop | 1440x900 | pass/fail/skipped | screenshot path or notes |
| small-mobile | 360x800 | pass/fail/skipped | screenshot path or notes |
| laptop | 1024x768 | pass/fail/skipped | screenshot path or notes |
| wide-desktop | 1280x800 | pass/fail/skipped | screenshot path or notes |

## Checks
| Check | Result | Evidence |
|---|---|---|
| Console has no new errors | pass/fail/skipped |  |
| Primary keyboard path works | pass/fail/skipped |  |
| Text does not overflow or overlap | pass/fail/skipped |  |
| Loading/empty/error states render | pass/fail/skipped |  |
| Disabled/focus/hover states are visible | pass/fail/skipped |  |
| Dark/light mode remains readable | pass/fail/skipped |  |
| Accessible names/labels are present | pass/fail/skipped |  |

## Commands
- Typecheck/lint:
- Playwright/screenshot:
- Manual notes:

## Residual Risk
- Skipped checks and why:
- Known limitations:
```

## Viewport Defaults

Use these unless the product surface has a better project-specific matrix:

| Tier | Class | Size |
|---|---|---:|
| Required | Mobile | 390x844 |
| Required | Tablet | 768x1024 |
| Required | Desktop | 1440x900 |
| Extended | Small mobile | 360x800 |
| Extended | Laptop | 1024x768 |
| Extended | Wide desktop | 1280x800 |

At minimum, verify mobile, tablet, and desktop for route-level, async, accessibility,
visual-polish, or responsive work. Add extended viewports for dense layouts, navigation,
tables, sidebars, canvases, or any breakpoint boundary risk.

## Pass Criteria

All relevant checks must pass for MEDIUM+ user workflows:

- no new browser console errors on the primary route
- no horizontal overflow unless intentionally documented
- primary action remains visible and reachable
- focus is visible and follows a logical order
- icon-only controls have accessible names
- text remains readable in light and dark surfaces when supported
- loading, empty, error, and disabled states are present where the UI is async or actionable

## When Automation Is Unavailable

If Playwright, browser tooling, or a dev server cannot run:

1. Mark the affected checks as `skipped`.
2. Explain the blocker.
3. Provide the best available manual inspection notes.
4. Do not mark skipped browser evidence as pass.

## Artifact Naming

When screenshots or traces are captured, use stable names:

```text
artifacts/ui/<surface-slug>/<state>-<viewport>-<before|after|trace>.<png|zip>
```

Examples:

- `artifacts/ui/dashboard/loading-mobile-after.png`
- `artifacts/ui/settings/success-desktop-before.png`
- `artifacts/ui/media-studio/error-tablet-trace.zip`

If the artifact path differs because the test runner owns output directories, record the actual
path and the command that produced it.
