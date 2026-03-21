# Section 09 -- Phase 6: Admin Notifications Dashboard

## Section ID
`section-09-phase6-admin-dashboard`

## Depends On
- **section-08-phase6-unified-query** -- provides `unifiedNotificationService.ts`, `getUnifiedNotifications` and `getUnifiedStats` tRPC endpoints on the monitoring router, the `UnifiedNotification` interface, and Redis-cached unified count.

## Blocks
- Nothing. This is a leaf section.

## Files Created
| File | Purpose |
|------|---------|
| `apps/web/client/src/pages/AdminNotifications.tsx` | Admin notifications dashboard page |
| `apps/web/client/src/pages/__tests__/AdminNotifications.test.tsx` | Tests for the dashboard page |

## Files Modified
| File | Change |
|------|--------|
| `apps/web/client/src/App.tsx` | Added lazy import + `/admin/notifications` route with `RequireAdmin` wrapper |
| `packages/shared/src/constants/menu.ts` | Added `admin-notifications` menu entry (sortOrder 21.85, `requiresFeature: 'notificationUnifiedCenter'`) |
| `apps/web/shared/featureFlags.ts` | Added `notificationUnifiedCenter` (F23) to interface, allowlist, and defaults (false) |

**Implementation notes**:
- Feature flag uses camelCase key `notificationUnifiedCenter` (not `NOTIFICATION_UNIFIED_CENTER` as originally specified) to match the existing `TenantFeatureFlags` naming convention.
- Severity filter uses server enum values (`low/normal/high/critical`) with human-friendly display labels, not the display-vocabulary values from the original spec.
- Admin guard allows both `admin` and `domain_admin` roles, matching the backend `adminProcedure` behavior.
- Action URLs are validated for safe protocols (`http://`/`https://`) before rendering as clickable links (XSS mitigation).
- 19 tests (18 original + 1 domain_admin access test added during review).

---

## 1. TDD Test Specifications

All tests use Vitest. The page is a React component tested with `@testing-library/react` and mocked tRPC hooks.

### File: `apps/web/client/src/pages/__tests__/AdminNotifications.test.tsx`

```
describe("AdminNotifications", () => {

  // --- Setup ---
  // Mock trpc.monitoring.getUnifiedStats.useQuery to return stat data
  // Mock trpc.monitoring.getUnifiedNotifications.useQuery to return paginated list
  // Mock useAuth to return admin user
  // Mock featureFlags to have NOTIFICATION_UNIFIED_CENTER = true

  describe("stat cards", () => {
    it("renders 4 stat cards with correct counts (total, unread, critical, today)")
    it("shows loading skeleton while stats query is pending")
    it("shows error state when stats query fails")
  })

  describe("charts", () => {
    it("renders source breakdown display with user/orchestrator/guardian counts")
    it("renders severity distribution display with info/warning/error/critical counts")
  })

  describe("filter bar", () => {
    it("renders source dropdown with options: all, user, orchestrator, guardian")
    it("renders severity dropdown with options: all, info, warning, error, critical")
    it("source filter updates query parameters on change")
    it("severity filter updates query parameters on change")
    it("renders date range inputs (from/to)")
  })

  describe("notification list", () => {
    it("renders unified notification rows with source badge, title, severity, timestamp")
    it("applies correct source badge color per source type")
    it("shows empty state when no notifications match filters")
    it("renders pagination controls (prev/next) when hasMore is true")
    it("disables prev button on first page")
  })

  describe("detail panel", () => {
    it("shows detail panel when a notification row is clicked")
    it("displays full content, metadata, and action URL in detail panel")
    it("hides detail panel when close button is clicked")
  })

  describe("feature flag guard", () => {
    it("renders fallback message when NOTIFICATION_UNIFIED_CENTER is false")
  })

  describe("admin guard", () => {
    it("redirects non-admin users to dashboard")
  })
})
```

---

## 2. Implementation Guidance

### 2.1 Page Component: `AdminNotifications.tsx`

Follow the layout pattern established by `AdminAuditLogs.tsx` -- same max-width container, Card components from `@/components/ui/card`, Radix Select for filters, Table for list, and a detail panel on the right.

**Layout structure (top to bottom)**:

1. **Header row**: Page title "Notification Center" with Bell icon, refresh button
2. **Stat cards row** (4 cards in a responsive grid `grid-cols-2 lg:grid-cols-4 gap-4`):
   - Total Notifications (count from `stats.total`)
   - Unread (count from `stats.unread`), highlighted if > 0
   - Critical (count from `stats.critical`), red text if > 0
   - Today (count from `stats.today`)
3. **Charts row** (2 columns `grid-cols-1 md:grid-cols-2 gap-4`):
   - Source breakdown: Simple horizontal bar or list showing count per source (`user`, `orchestrator`, `guardian`) with colored indicators. No external chart library required -- use Tailwind width percentages on div bars.
   - Severity distribution: Same approach -- colored bars for `info`, `warning`, `error`, `critical`.
4. **Filter bar** (inside a Card):
   - Source dropdown (Radix Select): `all | user | orchestrator | guardian`
   - Severity dropdown (Radix Select): `all | info | warning | error | critical`
   - Date range: two `<Input type="date">` fields (from, to)
   - Refresh button
5. **Main content area** (flex row):
   - Left: Notification list table (Table component) with columns: Source (badge), Title, Severity (badge), Time (relative)
   - Right: Detail panel (Card, shown when a row is selected), displaying full content, metadata JSON, actionUrl link, timestamps

**State management**:
- `source` filter: `useState<string>("all")`
- `severity` filter: `useState<string>("all")`
- `dateFrom` / `dateTo`: `useState<string>("")`
- `page` / `offset`: `useState<number>(0)` (offset-based pagination using existing LIMIT/OFFSET from section-08)
- `selectedNotification`: `useState<UnifiedNotification | null>(null)`

**Data fetching** (TanStack Query via tRPC):

```typescript
// Stats query
const statsQuery = trpc.monitoring.getUnifiedStats.useQuery(undefined, {
  refetchInterval: 60_000, // refresh every minute
});

// List query
const listQuery = trpc.monitoring.getUnifiedNotifications.useQuery({
  source: source === "all" ? undefined : source,
  severity: severity === "all" ? undefined : severity,
  dateFrom: dateFrom || undefined,
  dateTo: dateTo || undefined,
  limit: PAGE_SIZE,
  offset: page * PAGE_SIZE,
});
```

**Constants**:
- `PAGE_SIZE = 20`
- Priority/severity color map: `{ info: "bg-blue-100 text-blue-800", warning: "bg-yellow-100 text-yellow-800", error: "bg-red-100 text-red-800", critical: "bg-red-200 text-red-900" }`
- Source color map: `{ user: "bg-indigo-100 text-indigo-800", orchestrator: "bg-emerald-100 text-emerald-800", guardian: "bg-amber-100 text-amber-800" }`

**Feature flag guard**:
Read `NOTIFICATION_UNIFIED_CENTER` from the feature flags mechanism (same pattern as other feature-flagged pages). If false, render a "Coming Soon" or "Feature Not Enabled" card instead of the dashboard.

**Admin guard**:
Check `useAuth()` for admin role. Redirect non-admin users to `/dashboard` using `useLocation` from wouter.

### 2.2 Charts Implementation (No External Library)

Use simple CSS-based bar charts to avoid adding a dependency. Each bar is a div with a dynamic `width` style based on percentage of total.

```
// Pseudocode for source breakdown
const maxCount = Math.max(...Object.values(stats.sourceBreakdown));
for each (source, count) in stats.sourceBreakdown:
  <div className="flex items-center gap-2">
    <Badge>{source}</Badge>
    <div className="flex-1 h-6 bg-gray-100 rounded">
      <div style={{ width: `${(count / maxCount) * 100}%` }}
           className="h-full bg-indigo-500 rounded" />
    </div>
    <span>{count}</span>
  </div>
```

### 2.3 Detail Panel

When a notification row is clicked, set `selectedNotification` and render a slide-in or adjacent Card panel on the right side. The panel displays:

- **Title** (text-lg font-semibold)
- **Source** badge + **Severity** badge
- **Full content** (prose)
- **Action URL** (if present): rendered as a link with external icon
- **Metadata** (if present): rendered as a collapsible JSON block using `<pre>` with `JSON.stringify(metadata, null, 2)`
- **Timestamps**: createdAt, readAt (if available)
- **Close** button (X icon) to deselect

### 2.4 Route Registration

In the routing file (likely `App.tsx` or the router section of `main.tsx`), add:

```typescript
<Route path="/admin/notifications" component={AdminNotifications} />
```

Place it near other `/admin/*` routes. The component should be lazy-loaded if the project uses `React.lazy`.

### 2.5 Menu Entry

In `packages/shared/src/constants/menu.ts`, add to `defaultMenuItems`:

```typescript
{
  id: 'admin-notifications',
  label: 'Notifications',
  labelTh: 'การแจ้งเตือน',
  icon: 'Bell',
  path: '/admin/notifications',
  platforms: ['web', 'desktop'],
  roles: ['admin'],
  group: 'admin',
  sortOrder: 21.85,
  requiresFeature: 'NOTIFICATION_UNIFIED_CENTER',
}
```

Sort order 21.85 places it after audit logs (21.75) and orchestration logs (21.8) in the admin menu.

### 2.6 Expected tRPC Response Shapes (from section-08)

The dashboard consumes these endpoints added by section-08 to the monitoring router:

**`getUnifiedStats` response**:
```typescript
{
  total: number;
  unread: number;
  critical: number;
  today: number;
  sourceBreakdown: { user: number; orchestrator: number; guardian: number };
  severityDistribution: { info: number; warning: number; error: number; critical: number };
}
```

**`getUnifiedNotifications` response**:
```typescript
{
  items: UnifiedNotification[];
  hasMore: boolean;
}
```

Where `UnifiedNotification` has shape:
```typescript
{
  id: string;            // "user:123" or "orch:abc-456"
  source: "user" | "orchestrator" | "guardian";
  title: string;
  content: string | null;
  severity: string;      // maps from priority for user, from severity for orchestrator
  isRead: boolean;
  isDismissed: boolean;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;     // ISO 8601
  readAt: string | null;
}
```

### 2.7 Imports and UI Components Used

The page uses these components (all already available in the project):

- `Card, CardContent, CardHeader, CardTitle` from `@/components/ui/card`
- `Badge` from `@/components/ui/badge`
- `Button` from `@/components/ui/button`
- `Input` from `@/components/ui/input`
- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select`
- `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `@/components/ui/table`
- Icons from `lucide-react`: `Bell, RefreshCw, AlertTriangle, Filter, X, ExternalLink, Loader2, ChevronLeft, ChevronRight`
- `toast` from `sonner` for error notifications
- `useAuth` from auth context
- `trpc` from `@/lib/trpc`
- `useLocation` from `wouter`

### 2.8 Accessibility

- All filter controls have associated `<Label>` elements
- Table rows are keyboard-navigable (use `tabIndex={0}` and `onKeyDown` for Enter/Space to select)
- Detail panel has `aria-label="Notification detail"` and close button has `aria-label="Close detail panel"`
- Color-coded badges include text labels (not color-only)

### 2.9 Security (S8 -- Tenant Isolation)

The frontend does not need to send `tenantId` -- the backend tRPC endpoints (from section-08) extract it from the authenticated context. The admin guard on the page prevents non-admin access. The `adminProcedure` on the backend endpoints enforces role checks server-side.

---

## 3. Verification Checklist

1. All tests in `AdminNotifications.test.tsx` pass with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
2. Page renders at `/admin/notifications` when logged in as admin with `NOTIFICATION_UNIFIED_CENTER` enabled
3. Stat cards show loading state, then populated values from `getUnifiedStats`
4. Source and severity filters change the `getUnifiedNotifications` query params
5. Clicking a notification row shows the detail panel; clicking close hides it
6. Page shows "Feature Not Enabled" when `NOTIFICATION_UNIFIED_CENTER` is false
7. Non-admin users are redirected away from the page
8. Menu entry appears in the admin sidebar when feature flag is enabled
9. TypeScript compiles cleanly: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`