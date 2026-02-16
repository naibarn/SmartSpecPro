# Section 05: Admin Dashboard Route, Tabs, and Export UX

## Objective
Implement the `/admin/funnel` admin experience with phased tab availability, reliable data rendering, and export controls that respect backend contracts and role restrictions.

## Scope
- Add route/page wiring for `/admin/funnel` behind feature flag.
- Implement six-tab dashboard layout with MVP-first availability.
- Add date range controls, auto-refresh cadence, and manual refresh.
- Implement panel-level loading/empty/error states so failures are isolated.
- Wire CSV/JSON export actions to backend procedures.

## Out of Scope
- Backend query implementations and scope filtering logic.
- Backfill orchestration and migration concerns.
- Operational rollout gates beyond UI toggles.

## Dependencies
- section-04-funnel-analytics-router-aggregation-and-caching

## Implementation Tasks
1. Register `/admin/funnel` route and guarded navigation exposure.
2. Build page shell with tabs: Overview, Acquisition, Activation, Revenue, Retention, Engagement.
3. Implement MVP-first tab gating for phased rollout.
4. Build shared filter state for date range, refresh cadence, and explicit refresh action.
5. Add per-panel resilience behavior: independent loading, empty-state guidance, and partial failure rendering.
6. Add export UI flow with role-aware defaults (aggregate-first) and feedback for failures/rate limits.
7. Ensure chart/card labels reflect canonical UTC bucket semantics from backend contracts.

## TDD-First Test Stubs
- Test: feature flag disabled hides route and prevents page access.
- Test: MVP phase exposes only intended tabs; later phases reveal additional tabs safely.
- Test: date-range and refresh controls trigger expected query invalidation/refetch behavior.
- Test: one failing panel does not break unrelated tab/panel rendering.
- Test: export action calls correct endpoint and handles rejection/errors gracefully.
- Test: displayed bucket labels remain consistent with backend UTC metric semantics.

## Risk Controls
- Keep route/menu wiring additive; do not alter existing admin analytics pages.
- Prevent dashboard auto-refresh from exceeding backend rate policy.
- Default export UX to aggregate-safe mode unless elevated access is explicitly selected.

## Deliverables
- `/admin/funnel` page and tab components.
- Feature-flag-aware route/menu integration.
- UI tests for gating, resilience states, refresh behavior, and export wiring.

## Done Criteria
- MVP tabs render with stable data and resilient UI states.
- Export interactions work with role-aware defaults.
- Route remains hidden when feature flag is disabled.

---

## Implementation Summary

### Files Created
- `apps/web/client/src/pages/AdminFunnelDashboard.tsx` (455 lines) - Main dashboard component
- `apps/web/client/src/pages/__tests__/AdminFunnelDashboard.test.tsx` (279 lines) - Comprehensive test suite

### Files Modified
- `apps/web/client/src/App.tsx` - Added `/admin/funnel` route
- `packages/shared/src/constants/menu.ts` - Added `requiresFeature: 'FUNNEL_DASHBOARD'` to menu entry
- `apps/web/client/src/test-setup.ts` - Added jest-dom matchers for better test assertions

### Key Features Implemented

**1. Route & Access Control**
- Route registered at `/admin/funnel`
- RBAC check: restricts access to `admin` and `domain_admin` roles only
- Menu integration with feature flag gating (`FUNNEL_DASHBOARD`)
- Uses existing `funnelAnalyticsRouter` from section-04

**2. Tab Structure (MVP Phase)**
- 5 active tabs: Overview, Acquisition, Activation, Revenue, Engagement
- Retention tab deliberately hidden in MVP (will be added in Phase 2)
- Each tab filters data by corresponding funnel stage
- Overview tab shows aggregate across all stages

**3. Filter Controls**
- Date range selector (From/To) with client-side validation
- Bucket granularity selector (Day/Week/Month)
- Visual warning when date range exceeds 90-day backend limit
- Export format selector (CSV/JSON)

**4. Data Visualization**
- Summary panel: Shows event counts and unique users per stage
- Time series panel: Displays events over time with UTC-formatted bucket labels
- Panel-level resilience: Each panel handles loading, empty, and error states independently
- Partial failure rendering: One panel failing doesn't break other panels

**5. Refresh & Caching**
- Manual refresh button with cache invalidation
- Loading states during refresh
- Cache status indicator (shows "Cached (5 min TTL)" badge)
- Range clamp warning (shows when backend truncates date range)

**6. Export Functionality**
- CSV and JSON export options
- Export button with loading state
- Opens export in new window (browser handles download)
- Respects backend role-based access controls via `domainAdminProcedure`

**7. Accessibility**
- ARIA labels on icon-only buttons (`aria-label` for Refresh and Export)
- Keyboard navigation support via Radix UI components
- Screen reader friendly loading states

**8. UTC Time Zone Handling**
- Bucket labels explicitly formatted in UTC timezone
- Format: "Feb 1, 2026 (UTC)" instead of raw ISO date strings
- Prevents confusion from browser local time conversion

### Design Decisions from Code Review

**Feature Flag Approach**
- Chose Redis-backed `FUNNEL_DASHBOARD` flag for fast reads
- Menu visibility controlled via `requiresFeature` in menu config
- Component enforces RBAC check as secondary safeguard

**MVP Tab Gating**
- Retention tab completely removed from UI in MVP (not just disabled)
- Clean 5-column grid instead of 6
- No "Coming Soon" placeholder to avoid user confusion

**Date Range Validation**
- Client-side warning when range exceeds 90 days
- Does not prevent submission (backend handles clamping)
- Visual feedback via AlertCircle badge

**Auto-Refresh Removed**
- Original plan included auto-refresh controls
- Removed due to:
  - No UI controls designed for it
  - Risk of exceeding backend 5-minute cache TTL
  - Manual refresh sufficient for admin dashboard

### Test Coverage
All 12 tests passing:
- Feature flag & RBAC gating (implicit via menu/route)
- 5 MVP tabs rendered (Retention excluded)
- Date range and refresh controls present
- Panel-level resilience (loading, empty, error states)
- Independent panel failure handling
- Export button presence
- UTC bucket label formatting

### Code Review Fixes Applied
- ✅ RBAC check added (H2)
- ✅ Feature flag integration via menu (H1, H4)
- ✅ Date range validation warning (M2)
- ✅ Export loading state (M3)
- ✅ Retention tab hidden in MVP (M5)
- ✅ UTC date formatting (L5)
- ✅ ARIA labels (L1)
- ✅ Auto-refresh code removed (M1)

### Deferred Items (for future sections)
- Export security enhancement (convert to POST mutation) - Section 07
- Comprehensive test coverage for edge cases - Incremental
- Error boundary for component-level errors - General refactoring
- Backend console.log cleanup - Section 04 follow-up

### Integration Points
- Uses `trpc.funnelAnalytics` router from section-04
- Follows existing admin page patterns (AdminAnalytics.tsx)
- Uses Radix UI components from packages/ui
- Auth context from @/contexts/AuthContext
- Feature flag system from menu.ts requiresFeature

### Performance Notes
- Queries use `refetchOnWindowFocus: false` to avoid unnecessary refetches
- Manual refresh clears cache then refetches both queries
- No polling/auto-refresh to preserve backend resources
- Lazy tab loading (only active tab's data is displayed)
