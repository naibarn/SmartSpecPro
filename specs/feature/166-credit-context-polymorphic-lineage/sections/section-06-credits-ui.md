# Section 06 — Credits UI

## Goal

Show users what work consumed credits in readable Thai/English while preserving
existing Credits history behavior and tenant-safe API boundaries.

## Dependencies and owned files

Depends on section 05. Own:

- `apps/web/client/src/pages/Credits.tsx`
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSeriesCreditSummary.tsx`
- required `apps/web/client/src/locales/en/*.json` and `th/*.json` keys
- focused page/component tests

## Implementation

Reuse the existing Credits page balance/history/source-filter/pagination and
mobile-card/desktop-table patterns. Extend row mapping with safe context:
primary work title, root title, type, stage, Skill, amount, net/refund status,
and archived/snapshot/unattributed indicators. Never display SeriesID as the
primary label.

Add a summary region for charged, refunded, net actual, unattributed,
ambiguous, and integrity-exception credits. Explain that totals are actual
platform credits, not provider USD. Keep global totals separate from visible
page rows. Reset pagination on filter/date changes and preserve the server
watermark through pages, detail, and export.

Add guarded detail and export actions; hide technical references unless the
existing technical-audit permission is present. Treat query states explicitly:
loading skeleton/disabled actions, empty history/report, safe retry error,
success, partial/unattributed, archived snapshot, long title, hover, focus,
selected, and disabled/unauthorized.

### UI/UX Contract

#### Target User / JTBD

Authenticated user verifies work-level credit cost from `/credits`; authorized
admin uses explicit existing admin surfaces. Success means title-based
identification and understandable gross/refund/net/data-quality totals.

#### Existing Pattern Reference

Targeted `rg` search found `apps/web/client/src/pages/Credits.tsx` as the existing
balance/history/source-filter/card/table pattern. Reuse its structure, tRPC
query conventions, metadata allow-list, localization, and responsive breakpoints;
diverge only for required report summary/detail/export content.

#### Surface and component inventory

| Surface | File | Responsibility |
|---|---|---|
| Credits route | `Credits.tsx` | filters, watermark, queries, summary |
| Transaction row/card | existing page/local component | readable context and amount |
| Summary | page/local component | global accounting/data quality |
| Detail | page/local dialog/panel | selected authorized context |

#### State matrix

| State | Expected UI | Evidence |
|---|---|---|
| loading | skeleton; controls disabled | Vitest/browser |
| empty | clear no-history/no-named-work copy | Vitest/browser |
| error | localized safe retry; no IDs/provider text | Vitest/browser |
| success | labels/totals/stable paging | Vitest/browser |
| partial/unattributed | explicit quality notice/fallback | Vitest/browser |
| archived | snapshot title and archived indicator | Vitest/browser |
| disabled | unauthorized/loading detail/export disabled | Vitest |
| hover/focus/selected | visible selection/focus | browser/a11y |

#### Responsive matrix

| Viewport | Behavior |
|---|---|
| mobile 390x844 | stacked cards, wrapping title, no page overflow |
| tablet 768x1024 | compact table/card hybrid, wrapped filters |
| laptop 1024x768 | full controls and bounded columns |
| desktop 1440x900 | readable table and summary |
| small-mobile 360x800 | safe wrap/truncate and visible actions |
| wide-desktop 1280x800 | aligned bounded report columns |

#### Accessibility and copy

Keyboard order reaches filters, rows, detail, export; focus is visible; status
is semantic and not color-only; labels/announcements/contrast/reduced motion
meet existing product standards. Thai default with English fallback uses
`เรื่อง`, `งาน`, `ขั้นตอน`, `ใช้ไป`, `คืนเครดิต`, `สุทธิ`, `ยังระบุงานไม่ได้`,
`ข้อมูลกำกวม`, `รายการผิดปกติ` and English equivalents. Errors say unavailable
or unauthorized, never raw IDs/provider data.

#### Browser evidence

Authenticated Playwright/manual evidence is required at 390x844, 768x1024, and
1440x900 for history/report/detail, loading/empty/error/unattributed, filter
reset, watermark paging, and export authorization. This evidence is separate
from Vitest/typecheck.

## TDD-first tests

Mock state-dependent history/report queries and verify labels, summary totals,
all state matrix entries, mobile/desktop layout, localization/accessibility,
pagination-watermark, detail/export authorization, and no raw-ID presentation.

## Implemented locally

Credits now shows human-readable context labels in mobile/desktop history, a
work-cost summary, selectable UTC date range, unattributed toggle, top-work
drill-down, retry/empty states, and bounded CSV export action using the report
watermark. Browser viewport/authenticated evidence is still an external
verification item.

### Drama Series detail cost summary

The authenticated owner view at `/drama-series/:seriesId` must show a
series-level, all-time cost summary above the tab workspace. It displays the
current net actual credits, gross charged credits, refunded credits, ledger
entry count, and a clearly labelled platform estimate using the fixed product
formula `1,000 credits = 1 USD`. This USD number is an internal estimate for
cost evaluation; it is not a provider invoice or provider-reported USD cost.

The detail endpoint must resolve the series title and ownership server-side,
then aggregate the same immutable `credit_transactions` ledger and context
lineage used by the account report. During rollout it may include verified
historical rows whose structured `seriesId` metadata matches the owner series,
but the response must expose a coverage state (`complete`, `partial`,
`legacy_unattributed`, or `none`) so the UI never presents a partial ledger as
fully reconciled. Missing tenant/user scope or a foreign series must fail
closed.

The card fetches a fresh server watermark on mount, window focus, reconnect,
and a bounded 15-second foreground interval, and provides an explicit refresh
action. Loading, unavailable, no-usage, and attribution-review states must be
visible and localized. Technical Series IDs and context UUIDs are not shown as
the primary user-facing label.
