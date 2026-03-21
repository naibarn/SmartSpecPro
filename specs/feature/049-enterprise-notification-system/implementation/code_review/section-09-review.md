## Review Report

### Verdict: REQUEST_CHANGES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `AdminNotifications.tsx:118` | `useTenantFeatureFlag("NOTIFICATION_UNIFIED_CENTER" as any)` uses a type-escape cast because `NOTIFICATION_UNIFIED_CENTER` is not a key in `TenantFeatureFlags`. The hook's type signature is `(flag: TenantFeatureFlagKey): boolean`, and `FEATURE_FLAG_DEFAULTS` does not include this key. At runtime, `storedFlags["NOTIFICATION_UNIFIED_CENTER"]` is always `undefined`, so the hook falls back to `FEATURE_FLAG_DEFAULTS[flag]` which is also `undefined` (type-coerced to falsy). The feature-flag guard therefore fires for all tenants, rendering "Feature Not Enabled" for everyone. | Add `notificationUnifiedCenter: boolean; // F23` to `TenantFeatureFlags` in `apps/web/shared/featureFlags.ts`, add it to `ALLOWED_FEATURE_FLAGS`, add a default (`false`), and change the call site to `useTenantFeatureFlag("notificationUnifiedCenter")`. |
| HIGH | `packages/shared/src/constants/menu.ts:59` | `requiresFeature: 'NOTIFICATION_UNIFIED_CENTER'` will never evaluate to `true`. The menu filter at line 103 of `menu.ts` does `enabledFeatures[item.requiresFeature] === true`, where `enabledFeatures` is typed as `TenantFeatureFlags`. Since `NOTIFICATION_UNIFIED_CENTER` is not a key in that interface, the lookup always returns `undefined`. The admin-notifications menu entry will never appear, regardless of flag state. This is a direct consequence of the same missing flag registration (HIGH #1). | Same fix as HIGH #1 — registering the flag as `notificationUnifiedCenter` and updating `requiresFeature` to use that camelCase key. |
| HIGH | `AdminNotifications.tsx:88-96` | Interface shape mismatch with the actual tRPC response. The local `UnifiedNotification` interface uses `priority: string` (line 93), but the spec §2.6 defines the field as `severity: string`. The server returns the field named `severity` (confirmed in `unifiedNotificationService.ts` mapper output). The component accesses `item.priority` (lines 494, 496, 560, 563) — these will all be `undefined` at runtime, causing severity badges to render blank and `SEVERITY_COLORS[undefined]` to fall through to `""`. Additionally, the local interface omits the `readAt: string | null` field that the spec requires the detail panel to display (§2.3), and it omits `severity` entirely. | Rename `priority` to `severity` in the local `UnifiedNotification` interface and throughout all references. Add `readAt: string | null` to the interface. Update the detail panel to render `readAt` when present. |
| HIGH | `AdminNotifications.tsx:144` | The list query sends `severity` verbatim to the server, but the server-side Zod schema (confirmed in `monitoring.ts:80`) validates `severity` as `z.enum(["low", "normal", "high", "critical"])`, not the display values `"info" \| "warning" \| "error" \| "critical"` that the filter dropdown offers (lines 399-403). Sending `severity: "info"` or `severity: "error"` will produce a Zod validation error (400 bad request) when a user selects those options. The filter dropdown exposes the frontend's severity vocabulary; the API expects the mapped vocabulary from the orchestrator. | Either change the dropdown options to `"low" \| "normal" \| "high" \| "critical"` with display labels, or add a client-side mapping function before calling the query: `{ info: "low", warning: "normal", error: "high", critical: "critical" }[severity]`. |
| MEDIUM | `AdminNotifications.tsx:121-126` | Admin guard uses `user.role !== "admin"` but the `adminProcedure` on the backend (confirmed in `_core/trpc.ts:84`) explicitly allows `domain_admin` as well. A `domain_admin` user who navigates directly to `/admin/notifications` will be redirected to `/dashboard` by the frontend guard, even though the backend would serve them correctly. The guard is more restrictive than the backend contract. | Change the redirect condition to `user.role !== "admin" && user.role !== "domain_admin"`. This aligns with the established pattern in `RequireAdmin`. |
| MEDIUM | `AdminNotifications.tsx:265-295` | `stats.bySource` is accessed as an array (`stats.bySource.map(...)`), but the spec §2.6 defines `sourceBreakdown` as a fixed object `{ user: number; orchestrator: number; guardian: number }`. The section-08 service returns `bySource` as an array of `{ source, count }` objects (confirmed via section-08 review). This is a naming mismatch: the spec says `sourceBreakdown`, section-08 implemented `bySource`. The component happens to use `bySource` (matching section-08's actual output), but uses the array access pattern. This is internally consistent only if section-08's actual shape is `bySource: Array<{ source: string; count: number }>`. This should be explicitly verified and documented — if section-08 is fixed to match the spec `sourceBreakdown` shape, this component breaks silently. | Align on one canonical shape between section-08 service output and the frontend consumer. Use the spec field name (`sourceBreakdown`) or confirm `bySource` is intentional and update the spec. Either way, add explicit type imports from the tRPC router output rather than maintaining a locally re-declared interface. |
| MEDIUM | `AdminNotifications.tsx:307` | `stats.bySeverity` is iterated for the severity chart, but the section-08 review confirmed (MEDIUM finding #5) that `bySeverity` is returned as `[]` (hardcoded empty array). The component renders an empty card body with no fallback message. A blank chart with no "data unavailable" indicator creates a confusing UX. | Add a conditional: when `stats.bySeverity.length === 0`, render a muted placeholder text "Severity distribution unavailable" inside the card instead of an empty list. Additionally, block the section-09 merge until section-08's `bySeverity` stub is resolved, or document this as a known gap. |
| MEDIUM | `AdminNotifications.tsx:143-148` | The query parameter name `startDate`/`endDate` (lines 145-146) correctly matches the server-side Zod schema. However, state variables are named `dateFrom`/`dateTo` (lines 131-132). This is fine internally, but the spec §2.1 documents the query params as `dateFrom`/`dateTo`. The current implementation uses `startDate`/`endDate` at the tRPC call site — this matches the server schema (confirmed in `monitoring.ts:82-83`) but is inconsistent with the spec text. Minor risk if another consumer reads the spec and expects different param names. | No code change required at this site (server-side is authoritative). Update the spec §2.1 to say `startDate`/`endDate` to match the actual server schema, or confirm with the section-08 author. |
| MEDIUM | `AdminNotifications.test.tsx:815-827` | Chart tests only check for numeric count values (`"20"`, `"15"`, `"7"`, `"25"`, `"10"`) to be present in the document. They do not assert that the bar chart elements are rendered, that `bySource`/`bySeverity` card titles appear, or that the correct source/severity labels are visible. Given that `bySeverity` is `[]` in production (per section-08), the severity chart test will pass vacuously (counts `"25"` and `"10"` both come from the stat cards, not the chart). | Scope each chart assertion to within its parent card using `within(...)`. For source: `within(screen.getByText("By Source").closest("[data-slot='card']")!, () => ...)`. For severity: same pattern. This prevents the test from passing only because stat card numbers happen to match chart data. |
| MEDIUM | `AdminNotifications.test.tsx:829-845` | Filter interaction tests only assert that dropdown triggers are rendered (via `getByLabelText`) — they do not assert that changing a filter value updates the query params. The spec TDD plan requires "source filter updates query parameters on change" and "severity filter updates query parameters on change" as distinct test cases. These are present in the spec plan (§1) but the tests only check element existence, not behavior. | Add interaction tests using `userEvent.selectOptions` or `userEvent.click` on a Select item, then assert `mockListQuery` was last called with the expected `source`/`severity` argument. |
| LOW | `AdminNotifications.tsx:586-594` | `actionUrl` is rendered as a raw `<a href={selectedNotification.actionUrl}>` with the URL displayed verbatim as link text (line 592). There is no validation or sanitization of the URL. A `javascript:` URI or a `data:` URI stored in the database would be rendered as a clickable link. While the backend `sanitizeMetadata` function (section-05) strips known dangerous fields, `actionUrl` is a first-class field not sanitized by that function. | Wrap `actionUrl` with the same `safeNavigate` / URL validation used in `GlobalNotificationBell` from section-03. At minimum, check `actionUrl.startsWith("http")` before rendering the anchor; otherwise render as plain text with a warning. |
| LOW | `AdminNotifications.tsx:169` | `const items: UnifiedNotification[] = (listQuery.data?.items as any) ?? []` uses an `as any` cast on the list items. This masks TypeScript errors that would catch the `priority` vs `severity` field mismatch (HIGH finding #3) at compile time. | Remove the `as any` cast. Derive the item type from the tRPC response type instead of the locally declared interface: `type UnifiedNotification = NonNullable<typeof listQuery.data>["items"][number]`. This gives compile-time type safety for free. |
| LOW | `AdminNotifications.tsx:265,307` | `Math.max(...stats.bySource.map(...), 1)` and the equivalent for `bySeverity` are computed inside the `.map()` callback, recalculating the max on every iteration of the array. For the current array sizes (3-4 elements) this is harmless, but it is an unnecessary O(n²) pattern. | Move `const max = Math.max(...arr.map(x => x.count), 1)` outside the `.map()` call for each chart block. |
| LOW | `menu.ts:942,960` | This diff also changes `requiresFeature: 'ORCHESTRATOR_ENABLED'` → `'orchestratorEnabled'` (for the `teams` menu item) and `requiresFeature: 'AI_PERSONA_ENABLED'` → `'personaSystem'` (for `admin-personas`). These are out-of-scope changes for section-09 and belong to section-13 (feature-flags-i18n) per the spec note §24. Bundling them here makes the blast radius of this diff larger than necessary and may conflict with section-13's diff. | Move the `teams` and `admin-personas` `requiresFeature` key corrections to section-13's diff. If they are already applied there, ensure this diff does not double-apply them. |

---

### Contract Compliance

**tRPC endpoints (from section-08)**
- [x] `trpc.monitoring.getUnifiedStats.useQuery` called with correct signature (no input)
- [x] `trpc.monitoring.getUnifiedNotifications.useQuery` called with `source`, `severity`, `startDate`, `endDate`, `limit`, `page`
- [x] `page` parameter (not `offset`) used — matches server Zod schema (`page: z.number().int().min(0).default(0)`)
- [ ] `severity` filter values (`info`, `warning`, `error`, `critical`) do not match server enum (`low`, `normal`, `high`, `critical`) — HIGH finding #4
- [ ] `UnifiedNotification.severity` field accessed as `priority` — HIGH finding #3
- [ ] `readAt` field missing from local interface — HIGH finding #3

**Auth and access guards**
- [x] Route wrapped in `<RequireAdmin>` in `App.tsx`
- [x] `adminProcedure` on both endpoints enforces role check server-side
- [ ] Frontend admin guard excludes `domain_admin` who the backend allows — MEDIUM finding
- [x] Feature-flag fallback UI renders when flag is disabled
- [ ] Feature flag key `NOTIFICATION_UNIFIED_CENTER` not registered in `TenantFeatureFlags` — HIGH finding #1, #2

**Accessibility (spec §2.8)**
- [x] Filter controls have `<Label>` elements associated by `htmlFor`/`id`
- [x] Table rows have `tabIndex={0}` and `onKeyDown` for Enter/Space
- [x] Detail panel has `aria-label="Notification detail"`
- [x] Close button has `aria-label="Close detail panel"`
- [x] Badges use text labels (not color-only)

**Layout (spec §2.1)**
- [x] Header with Bell icon and refresh button
- [x] 4 stat cards in `grid-cols-2 lg:grid-cols-4` grid
- [x] Loading skeleton and error state for stats
- [x] CSS bar charts for source and severity distribution (no external chart library)
- [x] Filter bar with Radix Select for source and severity, date range inputs
- [x] Notification list table with Source badge, Title, Severity badge, Time columns
- [x] Empty state when no items
- [x] Pagination with prev/next and `hasMore` gating
- [x] Detail panel with title, badges, content, action URL, metadata, timestamps
- [ ] `readAt` timestamp missing from detail panel (spec §2.3 requires it)

**Routing and menu**
- [x] Route registered in `App.tsx` with lazy import
- [x] `<RequireAdmin>` wrapper on route
- [x] Menu entry added with correct `sortOrder: 21.85`, `roles: ['admin']`, `group: 'admin'`
- [ ] `requiresFeature: 'NOTIFICATION_UNIFIED_CENTER'` will never match — HIGH finding #2

**Test coverage (spec §1 TDD plan)**
- [x] 4 stat cards with correct counts
- [x] Loading skeleton
- [x] Error state
- [x] Source breakdown chart renders counts
- [x] Severity distribution renders counts (but vacuous — see MEDIUM finding)
- [x] Source dropdown renders
- [x] Severity dropdown renders
- [x] Date range inputs render
- [ ] Source filter updates query parameters on change — NOT tested (interaction missing)
- [ ] Severity filter updates query parameters on change — NOT tested
- [x] Rows render with title text
- [x] Source badge text
- [x] Empty state
- [x] Pagination controls present when `hasMore`
- [x] Prev button disabled on first page
- [x] Detail panel opens on row click
- [x] Detail panel shows content, metadata, action URL
- [x] Detail panel closes on X click
- [x] Feature flag guard (false = "Feature Not Enabled")
- [x] Non-admin redirect

---

### Summary

The component structure, layout, accessibility markup, and test scaffolding are solid and closely follow the `AdminAuditLogs.tsx` pattern as specified. However, three issues require changes before merge: the `NOTIFICATION_UNIFIED_CENTER` feature flag is not registered in `TenantFeatureFlags`, causing the flag guard to fire for all tenants and the menu entry to never appear; the local `UnifiedNotification` interface uses `priority` instead of the server's `severity` field, causing severity badges to render blank at runtime; and the severity filter dropdown sends values (`info`, `error`) that fail the server's Zod enum validation (`low`, `high`). Two of the four filter interaction tests specified in the TDD plan are also absent. These are blocking correctness issues, not style nits.

